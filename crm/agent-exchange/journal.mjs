/* Private browser journal; no tokens, network, scheduler, deletion, or replay. */
import { canonicalJson } from './client.mjs';
const copy = value => JSON.parse(canonicalJson(value));
const scopeKey = (ownerUid, endpoint) => JSON.stringify([endpoint, ownerUid]);
function fail(message) { throw new Error(message); }
function validateScope(ownerUid, endpoint) {
  if (typeof ownerUid !== 'string' || !ownerUid || typeof endpoint !== 'string' || !endpoint) fail('Journal account and endpoint are required.');
}
function validateRecord(record, ownerUid, endpoint) {
  if (!record || record.ownerUid !== ownerUid || record.endpoint !== endpoint || record.job?.ownerUid !== ownerUid ||
      record.job?.actorUid !== ownerUid || record.operationId !== record.job?.operationId ||
      !['prepared','attempted','confirmed','not_sent'].includes(record.status)) fail('Journal record is invalid.');
  if (record.budget) {
    const {command,settlement} = record.budget;
    if (!command || command.op !== 'reserve' || command.kind !== 'existing_review' || command.creates_assignment !== false ||
        ['intent_id','account','assignment_id','cycle_id','cycle_started_at'].some(key => typeof command[key] !== 'string' || !command[key].trim())) fail('Journal budget binding is invalid.');
    if (settlement && (settlement.intent_id !== command.intent_id || typeof settlement.evidence !== 'string' || !settlement.evidence ||
        !((record.status === 'confirmed' && settlement.outcome === 'completed') || (record.status === 'not_sent' && settlement.outcome === 'not_dispatched')))) fail('Journal budget settlement is invalid.');
  }
}
/** Store transaction callback must run atomically and synchronously over one scope. */
export function createExchangeJournal(store) {
  if (!store || typeof store.transact !== 'function') throw new TypeError('An atomic journal store is required.');
  const transact = (ownerUid, endpoint, write, change) => {
    validateScope(ownerUid, endpoint);
    return store.transact(scopeKey(ownerUid, endpoint), write, current => {
      const state = current === undefined ? { schema: 1, ownerUid, endpoint, records: [] } : copy(current);
      if (state.schema !== 1 || state.ownerUid !== ownerUid || state.endpoint !== endpoint || !Array.isArray(state.records)) fail('Journal scope is invalid.');
      const ids = new Set();
      state.records.forEach(record => { validateRecord(record, ownerUid, endpoint); if (ids.has(record.operationId)) fail('Duplicate journal identity.'); ids.add(record.operationId); });
      const result = change(state);
      return { state, result: copy(result) };
    });
  };
  return Object.freeze({
    list: (ownerUid, endpoint) => transact(ownerUid, endpoint, false, state => state.records),
    get: (ownerUid, endpoint, operationId) => transact(ownerUid, endpoint, false, state => state.records.find(record => record.operationId === operationId) || null),
    create: record => transact(record.ownerUid, record.endpoint, true, state => {
      validateRecord(record, record.ownerUid, record.endpoint);
      if (record.status !== 'prepared' || record.response !== undefined) fail('Only an unsubmitted prepared job may be added.');
      if (state.records.some(item => item.operationId === record.operationId)) fail('Operation already exists; reconcile it.');
      if (state.records.some(item => !['confirmed','not_sent'].includes(item.status) || (item.budget && !item.budget.settlement))) fail('Resolve the existing journal operation before preparing another.');
      const saved = copy(record); state.records.push(saved); return saved;
    }),
    bindBudget: (ownerUid, endpoint, operationId, job, command) => transact(ownerUid, endpoint, true, state => {
      const record = state.records.find(item => item.operationId === operationId);
      if (!record || record.status !== 'prepared' || record.budget || canonicalJson(record.job) !== canonicalJson(job)) fail('Budget binding requires the original unbound prepared job.');
      if (command?.op !== 'reserve' || command.kind !== 'existing_review' || command.creates_assignment !== false ||
          ['intent_id','account','assignment_id','cycle_id','cycle_started_at'].some(key => typeof command[key] !== 'string' || !command[key].trim())) fail('Only an identified existing-review budget reservation may be bound.');
      if (state.records.some(item => item.budget?.command.intent_id === command.intent_id)) fail('Budget intent is already bound; reconcile its original CRM operation.');
      record.budget = { command: copy(command) }; return record;
    }),
    settleBudget: (ownerUid, endpoint, operationId, command, settlement) => transact(ownerUid, endpoint, true, state => {
      const record = state.records.find(item => item.operationId === operationId);
      if (!record?.budget || canonicalJson(record.budget.command) !== canonicalJson(command) ||
          settlement?.intent_id !== command.intent_id || typeof settlement.evidence !== 'string' || !settlement.evidence ||
          !((record.status === 'confirmed' && settlement.outcome === 'completed') || (record.status === 'not_sent' && settlement.outcome === 'not_dispatched'))) fail('Exact terminal CRM operation and matching budget settlement required.');
      if (record.budget.settlement && canonicalJson(record.budget.settlement) !== canonicalJson(settlement)) fail('Budget settlement cannot change.');
      record.budget.settlement = copy(settlement); return record;
    }),
    claim: (ownerUid, endpoint, operationId, job) => transact(ownerUid, endpoint, true, state => {
      const record = state.records.find(item => item.operationId === operationId);
      if (!record || record.status !== 'prepared' || canonicalJson(record.job) !== canonicalJson(job)) fail('Operation cannot be submitted again; reconcile it.');
      record.status = 'attempted'; return record;
    }),
    notSent: (ownerUid, endpoint, operationId, reason) => transact(ownerUid, endpoint, true, state => {
      const record = state.records.find(item => item.operationId === operationId);
      const allowed = (reason === 'prepared_abandoned' && record?.status === 'prepared') ||
        (['authentication_failed_before_send','dispatch_guard_failed_before_send'].includes(reason) && record?.status === 'attempted');
      if (!allowed) fail('No proof that this operation was not sent. Keep it unresolved.');
      record.status = 'not_sent'; record.disposition = reason; return record;
    }),
    confirm: (ownerUid, endpoint, operationId, job, response) => transact(ownerUid, endpoint, true, state => {
      const record = state.records.find(item => item.operationId === operationId), proof = response?.receipt;
      if (!record || canonicalJson(record.job) !== canonicalJson(job) || response?.serverConfirmed !== true ||
          !proof || proof.ownerUid !== ownerUid || proof.actorUid !== ownerUid || proof.operationId !== operationId || proof.requestHash !== job.requestHash) fail('Exact confirmed server receipt required.');
      record.status = 'confirmed'; record.response = copy(response); return record;
    })
  });
}

/** Resolves only after IDB transaction completion, never merely request success. */
export async function openExchangeJournal({ indexedDBImpl = globalThis.indexedDB, name = 'proton-agent-exchange-v1' } = {}) {
  if (!indexedDBImpl?.open) fail('Private browser storage is unavailable. No operation may be sent.');
  const db = await new Promise((resolve, reject) => {
    const request = indexedDBImpl.open(name, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('scopes'); };
    request.onerror = () => reject(new Error('Cannot open private operation journal.'));
    request.onblocked = () => reject(new Error('Journal upgrade is blocked by another tab.'));
    request.onsuccess = () => resolve(request.result);
  });
  db.onversionchange = () => db.close();
  const journal = createExchangeJournal({
    transact(key, write, change) {
      return new Promise((resolve, reject) => {
        let transaction, result, failure;
        try { transaction = db.transaction('scopes', write ? 'readwrite' : 'readonly', write ? { durability: 'strict' } : undefined); }
        catch { reject(new Error('Operation journal is unavailable.')); return; }
        const store = transaction.objectStore('scopes'), request = store.get(key);
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => reject(failure || new Error('Operation journal transaction did not commit.'));
        transaction.onerror = () => { /* onabort reports the failed transaction. */ };
        request.onsuccess = () => {
          try {
            const next = change(request.result); result = next.result;
            if (write) store.put(next.state, key);
          } catch (error) { failure = error; transaction.abort(); }
        };
      });
    }
  });
  return Object.freeze({ ...journal, close: () => db.close() });
}
