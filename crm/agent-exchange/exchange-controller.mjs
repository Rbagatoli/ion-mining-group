/* Staged lead-save bridge. UI must pin its own render account as well. */
export function createExchangeController({ client, journal, session } = {}) {
  if (!client?.restoreForReconciliation || !journal?.claim || typeof session !== 'function') throw new TypeError('Client, durable journal and account session are required.');
  const fresh = new Map();
  const pin = () => {
    const value = session();
    if (!value?.uid || !['string','number'].includes(typeof value.epoch)) throw new Error('Sign in to the original Proton account.');
    return { uid: value.uid, epoch: value.epoch };
  };
  const assert = original => {
    const current = pin();
    if (current.uid !== original.uid || current.epoch !== original.epoch) throw new Error('Account changed; preserve the original operation and reconcile it in that account.');
  };
  const ensureLead = job => {
    if (job.kind !== 'action' || job.path !== '/v1/actions' || job.body?.type !== 'lead.save') throw new Error('This exchange permits lead.save only.');
  };
  async function complete(original, job, response) {
    assert(original);
    const saved = await journal.confirm(original.uid, client.endpoint, job.operationId, job, response);
    assert(original); return saved;
  }
  return Object.freeze({
    async list() { const original = pin(), records = await journal.list(original.uid, client.endpoint); assert(original); return records; },
    async readRegister() { const original = pin(), data = await client.readRegister(); assert(original); return data; },
    async prepare(input) {
      const original = pin();
      if (input?.kind !== 'action' || (input.body?.type ?? input.type) !== 'lead.save') throw new Error('This exchange permits lead.save only.');
      const job = await client.prepare(input); assert(original); ensureLead(job);
      const record = await journal.create({ ownerUid: original.uid, endpoint: client.endpoint, operationId: job.operationId, job, status: 'prepared' });
      assert(original); fresh.set(job.operationId, { job, original }); return record;
    },
    async submit(operationId, {beforeDispatch} = {}) {
      const item = fresh.get(operationId);
      if (!item) throw new Error('Only a newly prepared operation from this page may be submitted; recovered jobs allow receipt lookup only.');
      fresh.delete(operationId); assert(item.original);
      // The attempt is durable before token acquisition or POST. Any subsequent
      // error keeps it unresolved, including an uncertain local transaction.
      await journal.claim(item.original.uid, client.endpoint, operationId, item.job); assert(item.original);
      let response;
      try { response = await client.execute(item.job, {beforeDispatch}); }
      catch (error) {
        // Only this client's pre-fetch authentication/guard failures prove no POST.
        // A server rejection, account change, timeout or 404 is not this proof.
        if (['authentication_failed','dispatch_guard_failed'].includes(error.code) && error.outcome === 'not_sent') {
          assert(item.original);
          await journal.notSent(item.original.uid, client.endpoint, operationId, error.code + '_before_send');
          assert(item.original);
        }
        throw error;
      }
      return complete(item.original, item.job, response);
    },
    async abandonPrepared(operationId) {
      const original = pin(); fresh.delete(operationId);
      const record = await journal.notSent(original.uid, client.endpoint, operationId, 'prepared_abandoned');
      assert(original); return record;
    },
    async recover(operationId) {
      const original = pin(), record = await journal.get(original.uid, client.endpoint, operationId); assert(original);
      if (!record) throw new Error('No original journal operation exists in this account and endpoint.');
      ensureLead(record.job);
      const job = await client.restoreForReconciliation(record.job); assert(original);
      // A recovery attempt makes even a still-open fresh page GET-only.
      fresh.delete(operationId);
      return complete(original, job, await client.reconcile(job));
    }
  });
}
