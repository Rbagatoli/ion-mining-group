/* Staged client only: no application wiring, credentials storage, or automatic retries. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNKNOWN = new Set(['pending', 'unconfirmed', 'unknown', 'outcome_unknown']);
const CHECKS = new Set(['pass', 'na', 'revise', 'blocked', 'unchecked']);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const pendingProof = value => value && (value.hasPendingWrites === true || value.fromCache === true || value.pending === true || value.serverConfirmed === false || ['status', 'state', 'outcome'].some(key => UNKNOWN.has(value[key])));

/** Deterministic JSON: sorted object keys, original array order, JSON primitives only. */
export function canonicalJson(value) {
  const active = new Set();
  function encode(item) {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return JSON.stringify(item);
    if (typeof item === 'number' && Number.isFinite(item)) return JSON.stringify(item);
    if (typeof item !== 'object' || active.has(item)) throw new TypeError('Request contains a non-JSON or circular value.');
    const prototype = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null) throw new TypeError('Request objects must contain plain JSON data.');
    if (Object.getOwnPropertySymbols(item).length) throw new TypeError('Request must not contain symbol keys.');
    active.add(item);
    let encoded;
    if (Array.isArray(item)) {
      encoded = '[' + Array.from({ length: item.length }, (_, i) => {
        if (!own(item, i)) throw new TypeError('Request arrays must not contain empty items.');
        return encode(item[i]);
      }).join(',') + ']';
    } else {
      encoded = '{' + Object.keys(item).sort().map(key => JSON.stringify(key) + ':' + encode(item[key])).join(',') + '}';
    }
    active.delete(item);
    return encoded;
  }
  return encode(value);
}

function frozenJson(value) {
  const copy = JSON.parse(canonicalJson(value));
  function freeze(item) {
    if (item && typeof item === 'object') { Object.values(item).forEach(freeze); Object.freeze(item); }
    return item;
  }
  return freeze(copy);
}

export class AgentClientError extends Error {
  constructor(message, { code, outcome = 'rejected', status, job, pin } = {}) {
    super(message);
    this.name = 'AgentClientError';
    this.code = code;
    this.outcome = outcome;
    if (status !== undefined) this.status = status;
    if (job) this.job = job;
    if (pin) this.originalAccount = Object.freeze({ uid: pin.uid, epoch: pin.epoch });
  }
}

function endpoint(baseUrl, options) {
  let url;
  try { url = new URL(baseUrl); } catch { throw new TypeError('baseUrl must be an absolute same-origin HTTPS URL.'); }
  if (url.username || url.password || url.href.includes('?') || url.href.includes('#')) throw new TypeError('baseUrl must not contain credentials, a query, or a fragment.');
  let approvedOrigin;
  if (options.approvedOrigin !== undefined) {
    try {
      const pin = new URL(options.approvedOrigin);
      if (typeof options.approvedOrigin !== 'string' || pin.protocol !== 'https:' || pin.origin !== options.approvedOrigin ||
          pin.username || pin.password || pin.hostname.includes('*') || pin.origin !== url.origin) throw Error();
      approvedOrigin = pin.origin;
    } catch { throw new TypeError('approvedOrigin must be the exact approved HTTPS origin of the endpoint.'); }
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const localAllowed = options.allowLocal === true && local && url.protocol === 'http:';
  if (!localAllowed && (url.protocol !== 'https:' || (globalThis.location && url.origin !== globalThis.location.origin && approvedOrigin !== url.origin))) {
    throw new TypeError('Agent endpoint must use same-origin HTTPS or an explicitly approved HTTPS origin; explicit allowLocal is limited to loopback HTTP.');
  }
  return url.href.replace(/\/+$/, '');
}

function currentSession(session) {
  const value = session();
  if (!value || typeof value.uid !== 'string' || !value.uid.trim() ||
      !['number', 'string'].includes(typeof value.epoch) ||
      (typeof value.epoch === 'number' && !Number.isFinite(value.epoch)) ||
      typeof value.getIdToken !== 'function') {
    throw new AgentClientError('Sign in to the original account before using the agent interface.', { code: 'session_required', outcome: 'not_sent' });
  }
  return value;
}

/**
 * baseUrl is the service origin, e.g. https://current-origin.example. A mount
 * suffix must match the server's explicit mount prefix (or a proxy rewrite).
 * Browser HTTPS must match location.origin unless deployment code provides an
 * exact matching options.approvedOrigin. Never take this pin from agent input,
 * URL parameters or local storage. Native Node trusts the explicitly
 * supplied HTTPS URL. Local tests must explicitly pass options: { allowLocal:
 * true } for a loopback HTTP endpoint.
 *
 * prepare({ kind:'action', expectedRevision, type, payload }) prepares an action.
 * prepare({ kind:'closeout', expectedRevision, payload:{ attestation,decision,note,basis,checks } })
 * prepares a closeout. Either form may supply `body` instead of `payload`/`type`:
 * action body:{ type,payload }; closeout body:{ attestation,decision,note,basis,checks }.
 * Closeout checks explicitly contain qa and source objects, each with evidence,
 * arithmetic, and fit. Values are preserved; the server enforces review eligibility.
 * ownerUid/sessionId/expectedRevision in body must agree with the pinned account
 * and any top-level values. prepare is async for hashing; it never fetches tokens
 * or performs network requests. Returned jobs are deeply frozen, bound to this
 * client instance and the original account epoch, and remain on errors as .job.
 * execute stays bound to the preparation epoch. Explicit read-only reconcile
 * permits the original UID to sign in again, pinning its current epoch for the
 * entire read; it can never replay an old action after an account change.
 */
export function createAgentClient({ baseUrl, session, fetchImpl = globalThis.fetch, cryptoImpl = globalThis.crypto, options = {} } = {}) {
  if (typeof session !== 'function' || typeof fetchImpl !== 'function') throw new TypeError('session and fetchImpl must be functions.');
  if (typeof cryptoImpl?.randomUUID !== 'function' || typeof cryptoImpl?.subtle?.digest !== 'function') throw new TypeError('Secure UUID generation and SHA256 are required.');
  const base = endpoint(baseUrl, options);
  const jobs = new WeakMap();
  const reconciliationOnly = new WeakSet();
  const pinSession = () => { const value = currentSession(session); return { uid: value.uid, epoch: value.epoch, getIdToken: () => value.getIdToken() }; };
  function assertAccount(pin, job) {
    let current;
    try { current = currentSession(session); } catch { /* A signed-out account cannot confirm an earlier operation. */ }
    if (!current || current.uid !== pin.uid || current.epoch !== pin.epoch) {
      throw new AgentClientError('The account changed. This operation belongs to the original account and its result is unconfirmed; return to that account to reconcile it.', { code: 'account_changed', outcome: 'unconfirmed', job, pin });
    }
  }
  function operationError(code, message, pin, job, status, outcome = 'unconfirmed') {
    return new AgentClientError(message, { code, outcome, pin, job, status });
  }
  function getJob(job, recovery = false) {
    const pin = job && jobs.get(job);
    if (!pin) throw new AgentClientError('Use the unchanged job returned by this client’s prepare method.', { code: 'invalid_job', outcome: 'not_sent' });
    if (!recovery && reconciliationOnly.has(job)) throw new AgentClientError('Recovered jobs allow receipt lookup only; they cannot be submitted again.', { code: 'reconcile_only', outcome: 'not_sent', job });
    if (recovery) {
      let current;
      try { current = pinSession(); } catch { /* Keep the original job recoverable after sign-in. */ }
      if (!current || current.uid !== pin.uid) throw operationError('account_changed', 'Sign in to the original account to reconcile this operation. Its outcome remains unconfirmed.', pin, job);
      return current;
    }
    assertAccount(pin, job);
    return pin;
  }
  async function request(path, { method = 'GET', pin, job, body, beforeDispatch } = {}) {
    assertAccount(pin, job);
    let token;
    try { token = await pin.getIdToken(); } catch {
      assertAccount(pin, job);
      throw operationError('authentication_failed', 'Could not obtain a sign-in token. No request was sent.', pin, job, undefined, 'not_sent');
    }
    assertAccount(pin, job);
    if (typeof token !== 'string' || !token.trim()) throw operationError('authentication_failed', 'A sign-in token is required. No request was sent.', pin, job, undefined, 'not_sent');
    const headers = { Authorization: 'Bearer ' + token, 'X-Owner-UID': pin.uid, Accept: 'application/json' };
    if (method === 'POST') { headers['Content-Type'] = 'application/json'; headers['Idempotency-Key'] = job.operationId; }
    assertAccount(pin, job);
    if (beforeDispatch) {
      try { await beforeDispatch(); }
      catch {
        assertAccount(pin, job);
        throw operationError('dispatch_guard_failed', 'Dispatch guard did not confirm permission. No request was sent.', pin, job, undefined, 'not_sent');
      }
      assertAccount(pin, job);
    }
    let response;
    try {
      response = await fetchImpl(base + path, { method, headers, ...(body ? { body: canonicalJson(body) } : {}), cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
    } catch {
      assertAccount(pin, job);
      throw operationError('network_error', job ? 'The operation result is unconfirmed. Keep the original job and explicitly reconcile it before retrying.' : 'The register could not be read. Try reading it again.', pin, job, undefined, job ? 'unconfirmed' : 'unavailable');
    }
    assertAccount(pin, job);
    let data;
    try { data = await response.json(); } catch { /* Preserve HTTP failures even when their body is not JSON. */ }
    assertAccount(pin, job);
    if (!response.ok) {
      const status = response.status;
      if (status === 401 || status === 403) throw operationError('access_denied', 'This account is not permitted to perform this request.', pin, job, status, 'rejected');
      if (status === 409) {
        const unknown = job && UNKNOWN.has(data?.outcome);
        throw operationError('conflict', unknown ? 'The write conflicted and its outcome is unconfirmed. Reconcile the original job before preparing a replacement.' : 'The operation conflicts with the current revision or idempotency record. Read the current register before preparing another operation.', pin, job, status, unknown ? 'unconfirmed' : 'rejected');
      }
      if (status === 404) throw operationError(job ? 'receipt_not_found' : 'not_found', job ? 'No confirmed receipt was found. The original operation remains unconfirmed; do not create a duplicate operation.' : 'The register endpoint was not found.', pin, job, status, job ? 'unconfirmed' : 'rejected');
      const rejected = status >= 400 && status < 500 && data?.outcome === 'rejected';
      throw operationError(status >= 500 ? 'server_error' : 'request_failed', rejected ? 'The request was rejected. Correct its input before preparing another operation.' : job ? 'The operation result is unconfirmed. Keep the original job for explicit reconciliation.' : 'The register request failed.', pin, job, status, rejected ? 'rejected' : job ? 'unconfirmed' : 'unavailable');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw operationError('invalid_response', 'The server response did not provide a usable result.', pin, job, response.status, job ? 'unconfirmed' : 'unavailable');
    return data;
  }
  function verifyReceipt(data, job, pin) {
    const receipt = data.receipt;
    if (data.serverConfirmed !== true || !receipt || pendingProof(data) || pendingProof(receipt) ||
        receipt.ownerUid !== job.ownerUid || receipt.actorUid !== job.actorUid ||
        receipt.operationId !== job.operationId || receipt.requestHash !== job.requestHash) {
      throw operationError('unconfirmed_receipt', 'The response does not prove this exact operation was saved in the original account. Keep its job and reconcile it explicitly.', pin, job);
    }
    assertAccount(pin, job);
    return frozenJson(data);
  }
  async function prepare(input = {}) {
    const pin = pinSession();
    const { kind } = input, rawOperationId = input.operationId ?? cryptoImpl.randomUUID();
    if (!['action', 'closeout'].includes(kind)) throw new TypeError('kind must be action or closeout.');
    if (typeof rawOperationId !== 'string' || !UUID.test(rawOperationId)) throw new TypeError('operationId must be a UUID.');
    const operationId = rawOperationId.toLowerCase();
    if (input.body !== undefined && (input.payload !== undefined || input.type !== undefined)) throw new TypeError('Supply body or payload/type, not both.');
    const supplied = input.body ?? (kind === 'action' ? { type: input.type, payload: input.payload } : input.payload);
    if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) throw new TypeError('An operation body is required.');
    const expectedRevision = input.expectedRevision ?? supplied.expectedRevision;
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new TypeError('expectedRevision must be a nonnegative safe integer.');
    if (input.expectedRevision !== undefined && supplied.expectedRevision !== undefined && input.expectedRevision !== supplied.expectedRevision) throw new TypeError('Conflicting revision values.');
    if (supplied.ownerUid !== undefined && supplied.ownerUid !== pin.uid) throw new TypeError('ownerUid must match the signed-in account.');
    const sessionId = input.sessionId ?? supplied.sessionId ?? cryptoImpl.randomUUID();
    if (typeof sessionId !== 'string' || !sessionId.trim() || sessionId.length > 128 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(sessionId)) throw new TypeError('sessionId must be a nonempty string of at most 128 characters without control characters.');
    if (input.sessionId !== undefined && supplied.sessionId !== undefined && input.sessionId !== supplied.sessionId) throw new TypeError('Conflicting session IDs.');
    let fields;
    if (kind === 'action') {
      if (typeof supplied.type !== 'string' || !supplied.type.trim() || !own(supplied, 'payload')) throw new TypeError('Actions require type and payload.');
      fields = { type: supplied.type, payload: supplied.payload };
    } else {
      if (!['attestation', 'decision', 'note', 'basis', 'checks'].every(key => own(supplied, key))) throw new TypeError('Closeouts require attestation, decision, note, basis, and explicit checks.');
      if (!['accept', 'revise'].includes(supplied.decision)) throw new TypeError('Closeout decision must be accept or revise.');
      if (typeof supplied.attestation !== 'string' || !supplied.attestation.trim()) throw new TypeError('Closeouts require the signed attestation string.');
      for (const [key, limit] of [['note', 3000], ['basis', 2000]]) {
        if (typeof supplied[key] !== 'string' || !supplied[key].trim() || supplied[key].length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(supplied[key])) throw new TypeError('Closeouts require valid ' + key + ' text.');
      }
      if (!['qa', 'source'].every(role => {
        const checks = supplied.checks?.[role];
        return checks && typeof checks === 'object' && !Array.isArray(checks) && ['evidence', 'arithmetic', 'fit'].every(key => own(checks, key) && CHECKS.has(checks[key]));
      })) throw new TypeError('Closeouts require explicit qa and source evidence, arithmetic, and fit checks.');
      fields = { attestation: supplied.attestation, decision: supplied.decision, note: supplied.note, basis: supplied.basis, checks: supplied.checks };
    }
    const path = kind === 'action' ? '/v1/actions' : '/v1/closeouts';
    const body = frozenJson({ ownerUid: pin.uid, sessionId, expectedRevision, ...fields });
    const digest = await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson({ path, ownerUid: pin.uid, actorUid: pin.uid, body })));
    assertAccount(pin);
    const requestHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    const job = Object.freeze({ kind, path, ownerUid: pin.uid, actorUid: pin.uid, operationId, body, requestHash });
    jobs.set(job, pin);
    return job;
  }
  return Object.freeze({
    endpoint: base,
    prepare,
    async readCapabilities() {
      const pin = pinSession(), data = await request('/v1/capabilities', { pin });
      if (data.ownerUid !== pin.uid || !['revenue','quality'].includes(data.role) ||
          !['full','lead_only'].includes(data.profile) || typeof data.policyId !== 'string' || !data.policyId.trim() ||
          !Array.isArray(data.actions) || data.actions.some(action => typeof action !== 'string') || new Set(data.actions).size !== data.actions.length ||
          data.reviewOperationsEnabled !== (data.profile === 'full') || data.externalActions !== false || data.independentReviewProof !== false || pendingProof(data)) {
        throw operationError('unconfirmed_capabilities', 'The response does not confirm this account’s interface capabilities.', pin, undefined, undefined, 'unconfirmed');
      }
      assertAccount(pin); return frozenJson(data);
    },
    async restoreForReconciliation(stored) {
      const data = frozenJson(stored), pin = pinSession();
      if (canonicalJson(Object.keys(data).sort()) !== canonicalJson(['actorUid','body','kind','operationId','ownerUid','path','requestHash'].sort()) ||
          data.ownerUid !== pin.uid || data.actorUid !== pin.uid || !/^[a-f0-9]{64}$/.test(data.requestHash || '')) {
        throw new AgentClientError('Stored job does not belong to this account or has an invalid format.', { code: 'invalid_stored_job', outcome: 'not_sent' });
      }
      const job = await prepare({ kind: data.kind, operationId: data.operationId, body: data.body });
      assertAccount(pin, job);
      if (canonicalJson(job) !== canonicalJson(data)) throw new AgentClientError('Stored request hash or fields no longer match the original job.', { code: 'invalid_stored_job', outcome: 'not_sent' });
      reconciliationOnly.add(job);
      return job;
    },
    async readRegister() {
      const pin = pinSession(), data = await request('/v1/register', { pin });
      if (data.ownerUid !== pin.uid || data.serverConfirmed !== true || pendingProof(data) ||
          !Number.isSafeInteger(data.revision) || data.revision < 0 || !data.state || typeof data.state !== 'object' || Array.isArray(data.state)) {
        throw operationError('unconfirmed_register', 'The response does not confirm the original account’s register.', pin, undefined, undefined, 'unconfirmed');
      }
      assertAccount(pin);
      return frozenJson(data);
    },
    async execute(job, {beforeDispatch} = {}) {
      if (beforeDispatch !== undefined && typeof beforeDispatch !== 'function') throw new TypeError('beforeDispatch must be a function.');
      const pin = getJob(job);
      return verifyReceipt(await request(job.path, { method: 'POST', pin, job, body: job.body, beforeDispatch }), job, pin);
    },
    async reconcile(job) { const pin = getJob(job, true); return verifyReceipt(await request('/v1/receipts/' + job.operationId, { pin, job }), job, pin); }
  });
}
