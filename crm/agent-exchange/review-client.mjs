/* Opt-in review protocol only. No register writes, credentials storage, retries or host wiring. */
import { canonicalJson, AgentClientError } from './client.mjs';

const ACTIONS = ['lead.save','task.add','task.ready','task.result','task.block'];
const CHECKS = ['pass','na','revise','blocked','unchecked'];
const INDEPENDENCE = 'principal_attribution_and_exact_artifact_binding_only';
const TTL = 30 * 60 * 1000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const identity = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const recordId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,90}$/.test(value);
const text = (value,max) => typeof value === 'string' && !!value.trim() && value.length <= max;
const same = (a,b) => canonicalJson(a) === canonicalJson(b);
const pending = value => value && (value.serverConfirmed === false || value.pending === true || value.fromCache === true || value.hasPendingWrites === true ||
  ['status','state','outcome'].some(key => ['pending','unknown','unconfirmed','outcome_unknown'].includes(value[key])));
function frozen(value) {
  const result = JSON.parse(canonicalJson(value));
  const freeze = item => { if (item && typeof item === 'object') { Object.values(item).forEach(freeze);Object.freeze(item); }return item; };
  return freeze(result);
}
function fields(value,keys) {
  return value && typeof value === 'object' && !Array.isArray(value) && same(Object.keys(value).sort(),[...keys].sort());
}
function endpoint(baseUrl,options) {
  let url;try { url = new URL(baseUrl); } catch { throw TypeError('Use an explicit approved review endpoint.'); }
  if (url.username || url.password || url.href.includes('?') || url.href.includes('#')) throw TypeError('Review endpoint cannot contain credentials, a query or fragment.');
  const local = options.allowLocal === true && ['localhost','127.0.0.1','[::1]'].includes(url.hostname) && url.protocol === 'http:';
  let approved = false;
  if (options.approvedOrigin !== undefined) {
    try { const pin = new URL(options.approvedOrigin);approved = pin.protocol === 'https:' && pin.origin === options.approvedOrigin && pin.origin === url.origin && !pin.hostname.includes('*'); } catch { /* Reject malformed deployment pins. */ }
    if (!approved) throw TypeError('approvedOrigin must be the exact approved HTTPS endpoint origin.');
  }
  if (!local && (url.protocol !== 'https:' || globalThis.location && url.origin !== globalThis.location.origin && !approved)) throw TypeError('Review endpoint requires same-origin HTTPS or an explicit approved HTTPS origin.');
  return url.href.replace(/\/+$/,'');
}

/** Config comes from trusted deployment code, never a URL, DOM or agent input.
 * session() supplies the real SDK user as {uid,epoch,getIdToken}; tokens stay in
 * request headers. inspectChallenge parses signed content but CANNOT verify its
 * HMAC. Only the authenticated server can verify the signature during attest.
 * Signing returns saved:false; Revenue uses the existing closeout client/journal.
 */
export function createReviewClient({baseUrl,ownerUid,actorUid,role,policyId,reviewerUid,session,fetchImpl=globalThis.fetch,cryptoImpl=globalThis.crypto,now=()=>Date.now(),options={}}={}) {
  if (![ownerUid,actorUid,reviewerUid].every(identity) || !['revenue','quality'].includes(role) || reviewerUid === ownerUid ||
      (role === 'revenue' ? actorUid !== ownerUid : actorUid !== reviewerUid) || !text(policyId,200)) throw TypeError('Pin separate Revenue-owner and Quality identities, role and policy.');
  if (typeof session !== 'function' || typeof fetchImpl !== 'function' || typeof now !== 'function' || typeof cryptoImpl?.subtle?.digest !== 'function') throw TypeError('Actual session, fetch, clock and SHA256 implementation are required.');
  const base = endpoint(baseUrl,options);
  const error = (code,message,outcome='rejected',status) => new AgentClientError(message,{code,outcome,status});
  function pin() {
    let value;try { value=session(); } catch { /* Do not expose SDK errors or credentials. */ }
    if (!value || value.uid !== actorUid || !['string','number'].includes(typeof value.epoch) ||
        (typeof value.epoch === 'number' ? !Number.isFinite(value.epoch) : !value.epoch.trim()) || typeof value.getIdToken !== 'function') throw error('session_required','Sign in to the configured review identity.','not_sent');
    return {uid:value.uid,epoch:value.epoch,getIdToken:()=>value.getIdToken()};
  }
  function assertAccount(original) {
    let current;try { current=pin(); } catch { /* Uniform, non-sensitive failure. */ }
    if (!current || current.uid !== original.uid || current.epoch !== original.epoch) throw error('account_changed','The review account changed. Discard no originals and do not retarget this request.','unconfirmed');
  }
  async function request(path,original,body) {
    assertAccount(original);let token;
    try { token=await original.getIdToken(); } catch { assertAccount(original);throw error('authentication_failed','The review identity could not authenticate. No request was sent.','not_sent'); }
    assertAccount(original);
    if (!text(token,12000)) throw error('authentication_failed','A valid sign-in token is required. No request was sent.','not_sent');
    const headers={Authorization:'Bearer '+token,'X-Owner-UID':ownerUid,Accept:'application/json'};
    if (body) headers['Content-Type']='application/json';
    let response;
    try { response=await fetchImpl(base+path,{method:body?'POST':'GET',headers,...(body?{body:canonicalJson(body)}:{}),cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'}); }
    catch { assertAccount(original);throw error('network_error','The review response is unavailable. No automatic retry was made.','unconfirmed'); }
    assertAccount(original);let data;
    try { data=await response.json(); } catch { /* No provider response is exposed as an error. */ }
    assertAccount(original);
    if (!response.ok) throw error(response.status === 401 || response.status === 403 ? 'access_denied' : response.status === 409 ? 'review_conflict' : 'request_failed',
      'The review request was not confirmed. Preserve the original artifacts and inspect the current account, scope and versions.',response.status >= 500 ? 'unconfirmed' : 'rejected',response.status);
    if (!data || typeof data !== 'object' || Array.isArray(data) || pending(data)) throw error('invalid_response','The review response is not confirmed.','unconfirmed');
    return data;
  }
  async function capabilities(original) {
    const data=await request('/v1/capabilities',original);
    if (data.ownerUid !== ownerUid || data.role !== role || data.policyId !== policyId || data.profile !== 'full' ||
        data.reviewOperationsEnabled !== true || data.externalActions !== false || data.independentReviewProof !== false ||
        !Array.isArray(data.actions) || !same([...data.actions].sort(),role === 'revenue'?[...ACTIONS].sort():[])) throw error('scope_mismatch','The endpoint does not match the configured full review profile, identity and policy.','unconfirmed');
    assertAccount(original);return frozen(data);
  }
  async function hash(value) {
    const digest=await cryptoImpl.subtle.digest('SHA-256',new TextEncoder().encode(canonicalJson(value)));
    return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  }
  function artifact(value,kind) {
    try {
      if (!text(value,1500000)) throw Error();
      const parts=value.split('.');
      if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) throw Error();
      const bytes=Uint8Array.from(atob(parts[0].replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-parts[0].length%4)%4)),c=>c.charCodeAt(0));
      const envelope=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),data=envelope.data,time=now();
      if (!fields(envelope,['kid','kind','data']) || !text(envelope.kid,40) || envelope.kind !== kind || !data ||
          data.ownerUid !== ownerUid || data.revenueUid !== ownerUid || data.reviewerUid !== reviewerUid || data.policyId !== policyId || !uuid.test(data.challengeId) ||
          !Number.isSafeInteger(time) || !Number.isSafeInteger(data.issuedAt) || !Number.isSafeInteger(data.expiresAt) || data.issuedAt > time || data.expiresAt <= time || data.expiresAt <= data.issuedAt || data.expiresAt-data.issuedAt > TTL) throw Error();
      return data;
    } catch { throw error('invalid_artifact','The signed review artifact has invalid identity, scope, format or expiry.'); }
  }
  async function challengeData(challenge,original) {
    const data=artifact(challenge,'challenge');
    if (!Number.isSafeInteger(data.registerRevision) || data.registerRevision < 0 || ![data.sourceVersion,data.qaVersion].every(v=>Number.isSafeInteger(v)&&v>=0) ||
        !recordId(data.source?.id) || !recordId(data.qa?.id) || data.source.id === data.qa.id || data.qa.role !== 'review' || data.source.role === 'review' || data.qa.parentTaskId !== data.source.id ||
        (data.source.resultVersion??0) !== data.sourceVersion || (data.qa.resultVersion??0) !== data.qaVersion ||
        data.sourceHash !== await hash(data.source) || data.qaHash !== await hash(data.qa)) throw error('invalid_artifact','The challenge does not bind the exact source and Quality records.');
    assertAccount(original);return data;
  }
  function findingInput(input) {
    const finding=frozen(input);
    if (!fields(finding,['result','sources','verdict','reviewedAt','evidence','checks','independent']) || !text(finding.result,18000) || !text(finding.evidence,2000) ||
        !['pass','revise','blocked'].includes(finding.verdict) || finding.independent !== true || !text(finding.reviewedAt,40) || !Number.isFinite(Date.parse(finding.reviewedAt)) || Date.parse(finding.reviewedAt)>now() ||
        !fields(finding.checks,['evidence','arithmetic','fit']) || Object.values(finding.checks).some(v=>!CHECKS.includes(v)) ||
        finding.verdict === 'pass' && Object.values(finding.checks).some(v=>!['pass','na'].includes(v)) || !Array.isArray(finding.sources) || finding.sources.length>12) throw TypeError('Supply the actual independent finding, checks, verdict and completion time.');
    for (const value of finding.sources) {
      let url;try { url=new URL(value); } catch { throw TypeError('Use full HTTP(S) finding sources.'); }
      if (!text(value,1800) || !['http:','https:'].includes(url.protocol) || url.username || url.password) throw TypeError('Use full HTTP(S) finding sources without credentials.');
    }
    return finding;
  }
  return Object.freeze({
    endpoint:base,ownerUid,actorUid,role,policyId,
    async readCapabilities(){return capabilities(pin());},
    async inspectChallenge(challenge){const original=pin(),snapshot=await challengeData(challenge,original);return frozen({snapshot,signatureVerified:false,meaning:'Locally parsed and bound content only. The server must verify the signature during attestation.'});},
    async createChallenge(input){
      if (role !== 'revenue') throw error('role_forbidden','Only the configured Revenue identity can request a challenge.','not_sent');
      if (!fields(input,['expectedRevision','sourceId','qaId']) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision<0 || !recordId(input.sourceId) || !recordId(input.qaId) || input.sourceId===input.qaId) throw TypeError('Use exact source, Quality and current revision identifiers.');
      const bound=frozen(input),original=pin();await capabilities(original);
      const data=await request('/v1/review-challenges',original,{ownerUid,reviewerUid,...bound}),snapshot=await challengeData(data.challenge,original);
      if (data.independence!==INDEPENDENCE || !same(snapshot,data.snapshot) || snapshot.registerRevision!==bound.expectedRevision || snapshot.source.id!==bound.sourceId || snapshot.qa.id!==bound.qaId) throw error('invalid_response','The challenge response does not match this exact requested pair.','unconfirmed');
      return frozen(data);
    },
    async attest(input){
      if (role !== 'quality') throw error('role_forbidden','Only the configured separate Quality identity can attest.','not_sent');
      if (!fields(input,['challenge','finding'])) throw TypeError('Supply the exact challenge and actual finding only.');
      const original=pin(),challenge=input.challenge,finding=findingInput(input.finding),source=await challengeData(challenge,original);
      if (source.qa.result && (finding.result!==source.qa.result || !same(finding.sources,source.qa.sources))) throw error('immutable_review','Preserve the existing submitted Quality finding and sources.','not_sent');
      await capabilities(original);
      artifact(challenge,'challenge'); // Recheck expiry after authentication/capability latency.
      const data=await request('/v1/reviews/attest',original,{ownerUid,challenge,finding}),signed=artifact(data.attestation,'attestation');
      if (data.saved!==false || data.independence!==INDEPENDENCE || signed.challengeId!==source.challengeId || signed.sourceId!==source.source.id || signed.qaId!==source.qa.id ||
          signed.sourceVersion!==source.sourceVersion || signed.qaVersion!==source.qaVersion || signed.sourceHash!==source.sourceHash || signed.qaHash!==source.qaHash ||
          signed.expiresAt>source.expiresAt || !text(signed.reviewer,180) || !same(signed.finding,finding)) throw error('invalid_response','The attestation response does not match the exact challenge and finding.','unconfirmed');
      assertAccount(original);return frozen(data);
    }
  });
}
