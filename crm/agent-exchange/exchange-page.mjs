/* Isolated staged UI. No Firebase imports, token controls, provider calls or timers. */
import { createExchangeController } from './exchange-controller.mjs';

const pretty = value => JSON.stringify(value, null, 2);
const same = (a, b) => a?.uid === b?.uid && a?.epoch === b?.epoch;
const usable = value => value && typeof value.uid === 'string' && value.uid.trim() && ['number', 'string'].includes(typeof value.epoch) && (typeof value.epoch !== 'number' || Number.isFinite(value.epoch));

export function mountExchangePage({ root, client, journal, session }) {
  if (!root?.querySelector || !client || !journal || typeof session !== 'function') throw new TypeError('Provide a root, configured client, journal and actual session callback.');
  const controller = createExchangeController({ client, journal, session });
  const document = root.ownerDocument, window = document.defaultView;
  const ui = name => { const node = root.querySelector(`[data-ui="${name}"]`); if (!node) throw Error('Missing staged UI field: ' + name); return node; };
  const action = name => { const node = root.querySelector(`[data-action="${name}"]`); if (!node) throw Error('Missing staged UI action: ' + name); return node; };
  const fields = Object.fromEntries(['connection', 'account', 'endpoint', 'notice', 'input', 'selected-label', 'request', 'receipt-label', 'receipt', 'register', 'records'].map(name => [name, ui(name)]));
  const buttons = Object.fromEntries(['read', 'prepare', 'submit', 'recover', 'abandon', 'list'].map(name => [name, action(name)]));
  let pin = null, generation = 0, busy = false, destroyed = false, records = [], selected = null;
  const newlyPrepared = new Set(), listeners = [];
  function readSession() { try { const value = session(); return usable(value) ? { uid: value.uid, epoch: value.epoch } : null; } catch { return null; } }
  function notice(text, tone = '') { fields.notice.textContent = text; fields.notice.dataset.tone = tone; }
  function controls() {
    const ready = !destroyed && !!pin && !busy;
    buttons.read.disabled = !ready; buttons.prepare.disabled = !ready; buttons.list.disabled = !ready;
    fields.input.disabled = !ready;
    buttons.submit.disabled = !ready || !selected || selected.status !== 'prepared' || !newlyPrepared.has(selected.operationId);
    buttons.recover.disabled = !ready || !selected || selected.status === 'not_sent';
    buttons.abandon.disabled = !ready || !selected || selected.status !== 'prepared';
    root.setAttribute('aria-busy', String(busy));
  }
  function clearPrivate() {
    records = []; selected = null; newlyPrepared.clear(); fields.input.value = '';
    fields.request.textContent = 'No operation selected.'; fields.receipt.textContent = 'No response.';
    fields['selected-label'].textContent = 'Choose or prepare an operation.'; fields['receipt-label'].textContent = 'No server receipt observed.';
    fields.register.textContent = 'Not read.'; renderList();
  }
  function sessionChanged() {
    if (destroyed) return;
    const next = readSession();
    if (!same(pin, next)) { generation++; pin = next; busy = false; clearPrivate(); notice(pin ? 'Account changed. Read its register or local journal before continuing.' : 'Sign in through the host application. No token is entered here.'); }
    fields.connection.textContent = pin ? 'Session available · staged endpoint' : 'Signed out';
    fields.account.textContent = pin?.uid || 'None'; fields.endpoint.textContent = client.endpoint || 'Configured by host'; controls();
  }
  function validRun(run) {
    if (destroyed) return false;
    if (!same(pin, readSession())) sessionChanged();
    return generation === run.generation && same(run.pin, pin) && !!pin;
  }
  function bound(record) {
    return pin && record && record.ownerUid === pin.uid && record.endpoint === client.endpoint && typeof record.operationId === 'string' && record.job?.ownerUid === pin.uid && record.job.operationId === record.operationId;
  }
  function renderList() {
    fields.records.replaceChildren();
    if (!records.length) { const item = document.createElement('li'); item.className = 'empty'; item.textContent = pin ? 'No operations loaded for this account.' : 'No signed-in account.'; fields.records.append(item); return; }
    for (const record of records) {
      const item = document.createElement('li'), button = document.createElement('button'), id = document.createElement('span'), status = document.createElement('span');
      button.type = 'button'; button.disabled = busy; button.setAttribute('aria-pressed', String(selected?.operationId === record.operationId));
      id.className = 'operation'; id.textContent = record.operationId; status.className = 'state'; status.textContent = record.status || 'unresolved'; button.append(id, status);
      button.addEventListener('click', () => { sessionChanged(); if (!busy && bound(record)) select(record, false); });
      item.append(button); fields.records.append(item);
    }
  }
  function select(record, fresh) {
    if (!bound(record)) throw Error('The operation does not match the current account and endpoint.');
    selected = record;
    fields['selected-label'].textContent = `${record.operationId} · ${record.status || 'unresolved'}`;
    fields.request.textContent = pretty(record.job);
    fields.receipt.textContent = record.response ? pretty(record.response) : 'No confirmed server response recorded.';
    const confirmed = record.status === 'confirmed' && record.response?.serverConfirmed === true;
    fields['receipt-label'].textContent = record.status === 'not_sent' ? 'Not submitted. History is retained; the old request cannot be sent again.' : confirmed ? record.response.currentStateMatches === false ? fresh ? 'Original commit confirmed. The current register has changed since that commit.' : 'Stored receipt for an earlier commit; its recorded readback showed a changed register. Look up current evidence.' : fresh ? 'Exact server-confirmed receipt from this request.' : 'Stored receipt from an earlier request. Look it up for current confirmation.' : 'No confirmed save. Preserve the original operation for receipt lookup.';
    renderList(); controls();
  }
  async function loadList(run) {
    const rows = await controller.list(); if (!validRun(run)) return false;
    if (!Array.isArray(rows) || rows.some(row => !bound(row))) throw Error('Journal records do not match this account and endpoint.');
    records = rows;
    if (selected) { const latest = rows.find(row => row.operationId === selected.operationId); if (latest) { selected = latest; fields['selected-label'].textContent = `${latest.operationId} · ${latest.status || 'unresolved'}`; } }
    renderList(); return true;
  }
  async function run(message, work) {
    sessionChanged(); if (!pin || busy || destroyed) return;
    const current = { pin: { ...pin }, generation }; busy = true; controls(); renderList(); notice(message);
    try { await work(current); }
    catch (error) {
      if (validRun(current)) notice(error?.message || 'The operation could not be confirmed. Keep the original request.', 'error');
    } finally {
      if (validRun(current)) { busy = false; controls(); renderList(); }
    }
  }
  function listen(node, name, listener) { node.addEventListener(name, listener); listeners.push(() => node.removeEventListener(name, listener)); }
  listen(buttons.read, 'click', () => run('Reading the current server register…', async current => {
    fields.register.textContent = 'Read in progress…';
    const response = await controller.readRegister(); if (!validRun(current)) return;
    fields.register.textContent = pretty(response); notice('Register read completed. Use the exact returned revision.');
  }));
  listen(buttons.list, 'click', () => run('Reading this account’s local journal…', async current => {
    if (await loadList(current)) { if (selected) select(selected, false); notice('Local journal loaded. Stored status is not a new server check.'); }
  }));
  listen(buttons.prepare, 'click', () => run('Preparing and recording the exact request locally…', async current => {
    let input; try { input = JSON.parse(fields.input.value); } catch { throw Error('Enter valid request JSON. No request was sent.'); }
    if (!input || input.kind !== 'action' || (input.type ?? input.body?.type) !== 'lead.save') throw Error('This page accepts lead.save actions only. No request was sent.');
    const record = await controller.prepare(input); if (!validRun(current)) return;
    if (!bound(record) || record.status !== 'prepared') throw Error('Preparation did not return a matching persisted request. Nothing is ready to submit.');
    newlyPrepared.add(record.operationId); await loadList(current); if (!validRun(current)) return;
    select(record, false); notice('Prepared locally. The lead has not been saved. Review the exact request before submitting.');
  }));
  listen(buttons.submit, 'click', () => run('Submitting the original lead save once…', async current => {
    if (!selected || !bound(selected) || selected.status !== 'prepared' || !newlyPrepared.has(selected.operationId)) throw Error('Only a newly prepared request from this page session can be submitted once.');
    const id = selected.operationId; newlyPrepared.delete(id); fields.receipt.textContent = 'Awaiting the original operation result…'; fields['receipt-label'].textContent = 'Not yet confirmed.'; controls();
    try {
      const record = await controller.submit(id); if (!validRun(current)) return;
      await loadList(current); if (!validRun(current)) return; select(record, true);
      notice(record.status === 'confirmed' && record.response?.serverConfirmed === true ? record.response.currentStateMatches === false ? 'Original save confirmed; the current register has changed. Read the register for current state.' : 'This exact lead save is server-confirmed.' : 'The save remains unconfirmed. Look up the original receipt.', record.status === 'confirmed' && record.response?.serverConfirmed === true ? 'success' : 'error');
    } catch (error) {
      if (validRun(current)) { fields.receipt.textContent = 'No confirmed response. The original operation is retained.'; fields['receipt-label'].textContent = 'Outcome unresolved. Use receipt lookup, not a replacement submission.'; await loadList(current); if (validRun(current) && selected?.status === 'not_sent') select(selected, false); }
      throw error;
    }
  }));
  listen(buttons.recover, 'click', () => run('Looking up the original server receipt; no POST is retried…', async current => {
    if (!selected || !bound(selected)) throw Error('Select this account’s original operation.');
    const id = selected.operationId; newlyPrepared.delete(id); fields.receipt.textContent = 'Receipt lookup in progress…'; fields['receipt-label'].textContent = 'Awaiting a fresh read.';
    try {
      const record = await controller.recover(id); if (!validRun(current)) return;
      await loadList(current); if (!validRun(current)) return; select(record, true);
      notice(record.status === 'confirmed' && record.response?.serverConfirmed === true ? record.response.currentStateMatches === false ? 'Original commit confirmed; the current register has changed. Read the register for current state.' : 'The original operation has an exact server-confirmed receipt.' : 'The original outcome remains unconfirmed.', record.status === 'confirmed' && record.response?.serverConfirmed === true ? 'success' : 'error');
    } catch (error) {
      if (validRun(current)) { fields.receipt.textContent = 'No fresh confirmed receipt. Preserve the original operation.'; fields['receipt-label'].textContent = 'Unresolved; nothing was resubmitted.'; await loadList(current); }
      throw error;
    }
  }));
  listen(buttons.abandon, 'click', () => run('Closing only an unsubmitted preparation and retaining its history…', async current => {
    if (!selected || !bound(selected) || selected.status !== 'prepared') throw Error('Only an unsubmitted preparation can be closed. Attempted or uncertain requests require receipt lookup.');
    const id = selected.operationId; newlyPrepared.delete(id);
    const record = await controller.abandonPrepared(id); if (!validRun(current)) return;
    await loadList(current); if (!validRun(current)) return; select(record, false);
    notice(record.status === 'not_sent' ? 'Preparation closed locally. Nothing was submitted; its original history is retained.' : 'The preparation could not be confirmed as unsubmitted.', record.status === 'not_sent' ? '' : 'error');
  }));
  listen(window, 'proton-agent-session-change', sessionChanged);
  listen(window, 'focus', sessionChanged);
  listen(document, 'visibilitychange', sessionChanged);
  sessionChanged();
  return Object.freeze({ sessionChanged, destroy() { if (destroyed) return; generation++; destroyed = true; busy = false; pin = null; listeners.forEach(remove => remove()); clearPrivate(); fields.connection.textContent = 'Disconnected'; fields.account.textContent = 'None'; fields.endpoint.textContent = 'Disabled'; controls(); } });
}

// No configuration is inferred from URL parameters, storage, DOM or another tab.
if (typeof document !== 'undefined') {
  const root = document.querySelector('[data-agent-exchange]');
  if (root) {
    let mounted;
    globalThis.ProtonAgentExchange = Object.freeze({
      configure(config) { mounted?.destroy(); mounted = mountExchangePage({ root, ...config }); return mounted; },
      sessionChanged() { mounted?.sessionChanged(); },
      disconnect() { mounted?.destroy(); mounted = null; }
    });
  }
}
