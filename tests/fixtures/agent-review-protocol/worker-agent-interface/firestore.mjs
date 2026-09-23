// Owner-scoped Firestore REST adapter. No admin credentials, blind writes,
// retries, local cache, or inference that a timed-out commit did not happen.
const PROJECT = 'ion-mining';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UID = /^[A-Za-z0-9_.:-]{1,128}$/;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export class FirestoreStoreError extends Error {
  constructor(code = 'unconfirmed') {
    super(code === 'conflict'
      ? 'The saved version or operation receipt changed. Read the current records before continuing.'
      : 'Storage confirmation is unavailable. Preserve the operation identity and check its receipt before retrying.');
    this.name = 'FirestoreStoreError';
    this.code = code;
    this.status = code === 'conflict' ? 409 : 503;
  }
}
function unavailable() { throw new FirestoreStoreError(); }
function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 19) === value.slice(0, 19);
}
function version(value) {
  if (!timestamp(value)) return false;
  const fraction = value.match(/\.(\d+)Z$/)?.[1] || '';
  return fraction.length <= 6 || /^0*$/.test(fraction.slice(6));
}
function operationId(value) {
  if (typeof value !== 'string' || !UUID.test(value)) unavailable();
  return value.toLowerCase();
}
function put(target, key, value) {
  Object.defineProperty(target, key, { value, enumerable: true, configurable: true, writable: true });
}
function encode(value, seen = new Set(), insideArray = false) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Number.isInteger(value) && !Number.isSafeInteger(value)) unavailable();
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if ((!Array.isArray(value) && !record(value)) || seen.has(value)) unavailable();
  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    if (insideArray) unavailable(); // Firestore arrays cannot directly contain arrays.
    // Sparse arrays would otherwise silently become malformed Firestore values.
    for (let i = 0; i < value.length; i++) if (!own(value, i)) unavailable();
    result = { arrayValue: { values: value.map(item => encode(item, seen, true)) } };
  } else {
    const fields = {};
    for (const key of Object.keys(value)) put(fields, key, encode(value[key], seen));
    result = { mapValue: { fields } };
  }
  seen.delete(value);
  return result;
}
function decode(value, insideArray = false) {
  if (!record(value) || Object.keys(value).length !== 1) unavailable();
  const type = Object.keys(value)[0], data = value[type];
  switch (type) {
    case 'nullValue': if (data !== null) unavailable(); return null;
    case 'stringValue': if (typeof data !== 'string') unavailable(); return data;
    case 'booleanValue': if (typeof data !== 'boolean') unavailable(); return data;
    case 'integerValue': {
      if (typeof data !== 'string' || !/^-?(?:0|[1-9]\d*)$/.test(data)) unavailable();
      const number = Number(data); if (!Number.isSafeInteger(number)) unavailable(); return number;
    }
    case 'doubleValue': if (typeof data !== 'number' || !Number.isFinite(data)) unavailable(); return data;
    case 'arrayValue': {
      if (insideArray || !record(data) || Object.keys(data).some(key => key !== 'values') || own(data, 'values') && !Array.isArray(data.values)) unavailable();
      return (data.values || []).map(item => decode(item, true));
    }
    case 'mapValue': {
      if (!record(data) || Object.keys(data).some(key => key !== 'fields') || own(data, 'fields') && !record(data.fields)) unavailable();
      const output = {};
      for (const [key, field] of Object.entries(data.fields || {})) put(output, key, decode(field));
      return output;
    }
    default: unavailable();
  }
}
function jsonRecord(value) {
  if (!record(value)) unavailable();
  return decode(encode(value));
}

export function createFirestoreStore({ projectId, ownerUid, token, fetchImpl = fetch, initialState } = {}) {
  if (projectId !== PROJECT || typeof ownerUid !== 'string' || !UID.test(ownerUid) || ['.', '..'].includes(ownerUid) ||
      typeof token !== 'string' || !token || token.length > 12000 || /\s/.test(token) || typeof fetchImpl !== 'function') unavailable();
  const initial = jsonRecord(initialState);
  const collection = `projects/${PROJECT}/databases/(default)/documents/users/${ownerUid}/data/`;
  const registerName = collection + 'agentControl';
  const urlFor = name => 'https://firestore.googleapis.com/v1/' + name.split('/').map(encodeURIComponent).join('/');
  const receiptName = id => collection + 'agentInterfaceReceipt_' + operationId(id);
  const headers = { Authorization: 'Bearer ' + token, Accept: 'application/json', 'Cache-Control': 'no-store' };
  async function request(url, options) {
    let response;
    try { response = await fetchImpl(url, { ...options, headers: { ...headers, ...(options?.body ? { 'Content-Type': 'application/json' } : {}) }, cache: 'no-store', redirect: 'manual' }); }
    catch { unavailable(); }
    if (!response || !Number.isInteger(response.status)) unavailable();
    // Workers supports manual redirect handling. Never follow Location or send
    // the owner's token onward; even a commit redirect remains unconfirmed.
    if (response.status >= 300 && response.status <= 399) unavailable();
    if ([409, 412].includes(response.status)) throw new FirestoreStoreError('conflict');
    // Firestore also maps an updateTime mismatch to HTTP 400. Use only its
    // structured status identifier; never retain or expose the provider text.
    if (response.status === 400 && options?.method === 'POST') {
      const failure = await body(response);
      if (record(failure) && record(failure.error) && failure.error.status === 'FAILED_PRECONDITION') throw new FirestoreStoreError('conflict');
      unavailable();
    }
    return response;
  }
  async function body(response) {
    try { return await response.json(); } catch { unavailable(); }
  }
  async function read(name) {
    const response = await request(urlFor(name), { method: 'GET' });
    if (response.status === 404) return null;
    if (response.status !== 200) unavailable();
    const doc = await body(response);
    if (!record(doc) || doc.name !== name || !version(doc.updateTime) || !record(doc.fields) ||
        Object.keys(doc.fields).length !== 2 || !own(doc.fields, 'data') || !own(doc.fields, 'updatedAt')) unavailable();
    const data = decode(doc.fields.data), updatedAt = decode(doc.fields.updatedAt);
    if (!record(data) || !timestamp(updatedAt)) unavailable();
    return { data, updatedAt, version: doc.updateTime };
  }
  return {
    async readRegister() {
      const doc = await read(registerName);
      return doc ? { state: doc.data, version: doc.version } : { state: jsonRecord(initial), version: null };
    },
    async readReceipt(id) {
      const normalized = operationId(id), doc = await read(receiptName(normalized));
      if (!doc) return null;
      if (operationId(doc.data.operationId) !== normalized) unavailable();
      return doc.data;
    },
    async commit({ beforeVersion, state, updatedAt, receipt } = {}) {
      if (beforeVersion !== null && !version(beforeVersion) || !timestamp(updatedAt)) unavailable();
      const next = jsonRecord(state), proof = jsonRecord(receipt), name = receiptName(proof.operationId);
      const envelope = data => ({ data: encode(data), updatedAt: encode(updatedAt) });
      const writes = [
        { update: { name: registerName, fields: envelope(next) }, currentDocument: beforeVersion === null ? { exists: false } : { updateTime: beforeVersion } },
        { update: { name, fields: envelope(proof) }, currentDocument: { exists: false } }
      ];
      const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:commit`;
      const response = await request(url, { method: 'POST', body: JSON.stringify({ writes }) });
      if (response.status !== 200) unavailable();
      const result = await body(response);
      if (!record(result) || !timestamp(result.commitTime) || !Array.isArray(result.writeResults) || result.writeResults.length !== 2 ||
          result.writeResults.some(write => !record(write) || !version(write.updateTime))) unavailable();
      // The caller still reconciles its exact durable receipt by a fresh read.
    }
  };
}
