// Candidate only. All writes use the existing domain reducer and the Revenue
// owner's Firebase token under unchanged Firestore rules. No admin API or timer.
import Model from '../agent-control-model.js';
import Team from '../crm/grok-team.js';
import { createFirestoreStore } from './firestore.mjs';
import { UUID, InterfaceError, fail, invalid, object, text, canonical, hash, configuration, authenticate, sign, verify, readJson } from './security.mjs';

const ACTIONS = {
  'lead.save': ['id','stage','offer','channel','company','website','signal','source','checked','contact','buyer','nextAction','due','notes','lastTouch','lastNote','serviceFit'],
  'task.add': ['id','title','brief','role','due','dealId','leadId','parentTaskId'],
  'task.ready': ['id'],
  'task.result': ['id','result','sources'],
  'task.block': ['id','reason','blockerKind']
};
const TTL = 30 * 60 * 1000; // Artifact expiry, never a native execution cadence.
const clone = value => JSON.parse(JSON.stringify(value));
const domain = fn => { try { return fn(); } catch (error) { if (error instanceof InterfaceError) throw error; fail(422, 'domain_rejected', error.message); } };
const revision = value => { if (!Number.isSafeInteger(value) || value < 0) invalid('An exact register revision is required.'); };
function currentRevision(state, expected) { revision(expected); if (state.revision !== expected) fail(409, 'stale_revision', 'Read the current register before preparing a new operation.'); }
function checkSet(raw) {
  object(raw, ['evidence', 'arithmetic', 'fit']);
  if (['evidence','arithmetic','fit'].some(key => !['pass','na','revise','blocked','unchecked'].includes(raw[key]))) invalid('Record evidence, arithmetic and fit checks.');
  return raw;
}
function checkArtifact(data, actor, cfg, now) {
  if (!data || data.ownerUid !== actor.ownerUid || data.policyId !== cfg.policyId || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= now || !Number.isSafeInteger(data.issuedAt) || data.issuedAt > now || data.expiresAt - data.issuedAt > TTL) fail(409, 'stale_artifact', 'Obtain a current review artifact for this account and policy.');
}
function eligible(state, source, qa) {
  const result = Model.completedReviewEligibility(state, source, qa);
  if (!result.eligible) fail(409, 'review_ineligible', result.reason);
  return result;
}
function findTargets(state, sourceId, qaId) { return { source: state.tasks.find(t => t.id === sourceId), qa: state.tasks.find(t => t.id === qaId) }; }
function response(data, status, origin) {
  const headers = { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', Vary:'Origin' };
  if (origin) Object.assign(headers, { 'Access-Control-Allow-Origin':origin, 'Access-Control-Allow-Methods':'GET, POST, OPTIONS', 'Access-Control-Allow-Headers':'Authorization, Content-Type, Idempotency-Key, X-Owner-UID' });
  return new Response(status === 204 ? null : JSON.stringify(data), { status, headers });
}

async function readRegister(store) {
  const saved = await store.readRegister();
  try { Model.valid(saved.state); } catch { fail(503, 'invalid_register', 'The saved register needs recovery before changes.'); }
  return saved;
}
async function confirmedReceipt(store, cfg, actor, operationId, requestHash) {
  const receipt = await store.readReceipt(operationId); if (!receipt) return null;
  let signed;
  try { signed = await verify(cfg, 'receipt', receipt.proof); } catch { fail(503, 'unconfirmed', 'The receipt could not be authenticated. Preserve the original operation.'); }
  const { proof, ...core } = receipt;
  if (canonical(signed) !== canonical(core) || core.ownerUid !== actor.ownerUid || core.actorUid !== actor.uid || core.operationId !== operationId || !Number.isSafeInteger(core.committedRevision)) fail(503, 'unconfirmed', 'The receipt does not match this account and operation.');
  if (requestHash && core.requestHash !== requestHash) fail(409, 'idempotency_conflict', 'This operation identity was used for different content.');
  const saved = await readRegister(store);
  if (saved.state.revision < core.committedRevision) fail(503, 'unconfirmed', 'The current register predates this receipt. Reconcile the saved records.');
  const matches = await hash(saved.state) === core.stateHash;
  if (saved.state.revision === core.committedRevision && !matches) fail(503, 'unconfirmed', 'The current register differs from the committed state.');
  return { serverConfirmed:true, ownerUid:actor.ownerUid, receipt, currentRevision:saved.state.revision, currentStateMatches:matches };
}

function actionPayload(state, type, raw) {
  if (!Object.hasOwn(ACTIONS, type)) fail(403, 'action_forbidden', 'This action is outside the staged interface.');
  object(raw, ACTIONS[type]);
  if (type === 'lead.save') {
    const prior = (state.leads || []).find(l => l.id === raw.id);
    if (!['discovered','qualified','dnc','disqualified'].includes(raw.stage)) invalid('Recording contact or meeting outcomes is outside this candidate.');
    // An update must not erase historical contact evidence or silently demote it.
    if (prior && ['contacted','replied','meeting'].includes(prior.stage) && !['dnc','disqualified'].includes(raw.stage)) invalid('Use existing controls for a lead with contact history.');
    if ((raw.lastTouch || '') !== (prior?.lastTouch || '') || (raw.lastNote || '') !== (prior?.lastNote || '')) invalid('Preserve existing contact history; this interface cannot report a send.');
    domain(() => Team.validateLead({ ...prior, ...raw }));
  }
  if (type !== 'task.add' && type.startsWith('task.')) {
    const target = state.tasks.find(t => t.id === raw.id);
    if (!target || Model.taskKind(target) !== 'work' || target.routing?.reviewOwner === 'owner') fail(403, 'task_forbidden', 'Use the existing controls for this task.');
    if (type === 'task.result' && target.role === 'review') fail(403, 'review_required', 'Quality results must come through an authenticated review attestation.');
    if (target.result && ['task.block','task.result'].includes(type)) fail(403, 'history_required', 'Preserve the submitted result. Use existing review and correction controls.');
  }
  return clone(raw);
}

async function challenge(store, body, actor, cfg, now) {
  object(body, ['ownerUid','expectedRevision','sourceId','qaId','reviewerUid']);
  const reviewer = cfg.principals.find(p => p.uid === body.reviewerUid && p.role === 'quality' && p.ownerUid === actor.ownerUid);
  if (!reviewer) fail(403, 'reviewer_forbidden', 'Choose a separately attributed configured Quality principal.');
  const { state } = await readRegister(store); currentRevision(state, body.expectedRevision);
  const { source, qa } = findTargets(state, body.sourceId, body.qaId); eligible(state, source, qa);
  const data = { ownerUid:actor.ownerUid, revenueUid:actor.uid, reviewerUid:reviewer.uid, policyId:cfg.policyId, challengeId:crypto.randomUUID(), issuedAt:now, expiresAt:now + TTL,
    registerRevision:state.revision, sourceVersion:Model.resultVersion(source), qaVersion:Model.resultVersion(qa), sourceHash:await hash(source), qaHash:await hash(qa), source, qa };
  return { challenge:await sign(cfg, 'challenge', data), snapshot:data, independence:'principal_attribution_and_exact_artifact_binding_only' };
}

async function attest(body, actor, cfg, now) {
  object(body, ['ownerUid','challenge','finding']);
  const data = await verify(cfg, 'challenge', body.challenge); checkArtifact(data, actor, cfg, now);
  if (data.reviewerUid !== actor.uid || data.revenueUid === actor.uid) fail(403, 'reviewer_forbidden', 'This challenge belongs to a different Quality principal.');
  const f = object(body.finding, ['result','sources','verdict','reviewedAt','evidence','checks','independent']);
  text(f.result, 18000); text(f.evidence, 2000); checkSet(f.checks);
  if (f.independent !== true || !['pass','revise','blocked'].includes(f.verdict) || typeof f.reviewedAt !== 'string' || f.reviewedAt.length > 40 || !Number.isFinite(Date.parse(f.reviewedAt)) || Date.parse(f.reviewedAt) > now) invalid('Record the actual independent review, verdict and time.');
  if (f.verdict === 'pass' && Object.values(f.checks).some(c => !['pass','na'].includes(c))) invalid('A pass verdict needs resolved review checks.');
  if (!Array.isArray(f.sources) || f.sources.length > 12) invalid('Use up to 12 source links.');
  for (const url of f.sources) { text(url, 1800); let parsed; try { parsed = new URL(url); } catch { invalid('Use full HTTP(S) source URLs.'); } if (!['https:','http:'].includes(parsed.protocol) || parsed.username || parsed.password) invalid('Use full HTTP(S) source URLs without credentials.'); }
  // Existing submitted findings are immutable in this shortcut.
  if (data.qa.result && (f.result !== data.qa.result || canonical(f.sources) !== canonical(data.qa.sources))) fail(409, 'immutable_review', 'Preserve the submitted Quality result and sources.');
  const signed = { ownerUid:actor.ownerUid, revenueUid:data.revenueUid, reviewerUid:actor.uid, reviewer:actor.label, policyId:cfg.policyId,
    challengeId:data.challengeId, issuedAt:now, expiresAt:Math.min(now + TTL, data.expiresAt), sourceId:data.source.id, qaId:data.qa.id,
    sourceVersion:data.sourceVersion, qaVersion:data.qaVersion, sourceHash:data.sourceHash, qaHash:data.qaHash, finding:clone(f) };
  return { attestation:await sign(cfg, 'attestation', signed), saved:false, independence:'principal_attribution_and_exact_artifact_binding_only' };
}

async function closeout(state, body, actor, cfg, operationId, now) {
  const a = await verify(cfg, 'attestation', body.attestation); checkArtifact(a, actor, cfg, now);
  const reviewer = cfg.principals.find(p => p.uid === a.reviewerUid && p.role === 'quality' && p.ownerUid === actor.ownerUid);
  if (!reviewer || reviewer.label !== a.reviewer || a.revenueUid !== actor.uid || a.reviewerUid === actor.uid) fail(403, 'reviewer_forbidden', 'Review identity no longer matches the authorized principals.');
  const { source, qa } = findTargets(state, a.sourceId, a.qaId), e = eligible(state, source, qa);
  if (await hash(source) !== a.sourceHash || await hash(qa) !== a.qaHash || Model.resultVersion(source) !== a.sourceVersion || Model.resultVersion(qa) !== a.qaVersion) fail(409, 'stale_review', 'The source or Quality record changed after this review challenge.');
  if (!['accept','revise'].includes(body.decision)) invalid('Choose accept or revise.');
  text(body.note, 3000); text(body.basis, 2000);
  const checks = object(body.checks, ['qa','source']); checkSet(checks.qa); checkSet(checks.source);
  const review = (evidenceTaskId, c) => ({ actor:'coordinator', reviewer:actor.label, basis:body.basis, evidenceTaskId, checks:c });
  const payload = { sourceId:source.id, qaId:qa.id, closeoutId:operationId, expectedSourceVersion:a.sourceVersion, expectedQaVersion:a.qaVersion, confirmCurrentSource:true,
    attribution:{ reviewer:reviewer.label, reviewedAt:a.finding.reviewedAt, evidence:a.finding.evidence, recordedBy:actor.label, verdict:a.finding.verdict, independent:true },
    sourceDecision:{ decision:body.decision, note:body.note, review:review(qa.id, checks.source) } };
  if (e.needsQaResult) payload.qaResult = { result:a.finding.result, sources:a.finding.sources, verdict:a.finding.verdict };
  if (!e.reuseQa) payload.qaReview = { note:body.note, review:review('', checks.qa) };
  return { payload, attestationHash:await hash(body.attestation), reviewerUid:reviewer.uid, qualityChecks:a.finding.checks };
}

async function mutate(path, request, body, store, actor, cfg, now) {
  object(body, path === '/v1/actions' ? ['ownerUid','sessionId','expectedRevision','type','payload'] : ['ownerUid','sessionId','expectedRevision','attestation','decision','note','basis','checks']);
  text(body.sessionId, 128);
  const rawId = request.headers.get('Idempotency-Key'); if (!UUID.test(rawId || '')) invalid('Retain a UUID operation identity for this request.');
  const operationId = rawId.toLowerCase(), requestHash = await hash({ path, ownerUid:actor.ownerUid, actorUid:actor.uid, body });
  // Receipt lookup comes before revision or artifact-expiry validation, so a
  // lost response never requires applying an already committed closeout again.
  const prior = await confirmedReceipt(store, cfg, actor, operationId, requestHash); if (prior) return { ...prior, duplicate:true };
  const { state, version } = await readRegister(store); currentRevision(state, body.expectedRevision);
  let type, payload, details = {};
  if (path === '/v1/actions') { type = body.type; payload = actionPayload(state, type, body.payload); }
  else { type = 'task.completed-review'; const result = await closeout(state, body, actor, cfg, operationId, now); payload = result.payload; details = { attestationHash:result.attestationHash, reviewerUid:result.reviewerUid, qualityChecks:result.qualityChecks, sourceId:payload.sourceId, qaId:payload.qaId, sourceVersion:payload.expectedSourceVersion, qaVersion:payload.expectedQaVersion }; }
  const at = new Date(now).toISOString();
  const next = domain(() => Model.reduce(state, { id:operationId, type, payload, revision:state.revision, at }));
  const core = { schema:1, ownerUid:actor.ownerUid, actorUid:actor.uid, actor:actor.label, operationId, sessionId:body.sessionId, requestHash, type,
    policyId:cfg.policyId, beforeRevision:state.revision, committedRevision:next.revision, stateHash:await hash(next), committedAt:at, ...details };
  const receipt = { ...core, proof:await sign(cfg, 'receipt', core) };
  let writeError;
  try { await store.commit({ beforeVersion:version, state:next, updatedAt:at, receipt }); } catch (error) { writeError = error; }
  // Always read from the server, even when the commit response looked successful.
  const confirmed = await confirmedReceipt(store, cfg, actor, operationId, requestHash); if (confirmed) return { ...confirmed, duplicate:false };
  if (writeError?.code === 'conflict') fail(409, 'conflict', 'The record changed. Reconcile this operation before preparing a replacement.');
  fail(503, 'unconfirmed', 'No durable receipt was confirmed. Preserve the original operation and reconcile it before retrying.');
}

// Injection is only a local test seam. Production default uses the real token
// verifier and Firestore REST; no env flag selects a mock or skips validation.
export function createHandler({ fetchImpl = fetch, now = () => Date.now(), storeFactory = createFirestoreStore } = {}) {
  return async function handle(request, env = {}) {
    let origin = '';
    try {
      const cfg = configuration(env), suppliedOrigin = request.headers.get('Origin');
      if (suppliedOrigin && !cfg.origins.includes(suppliedOrigin)) fail(403, 'origin_forbidden', 'This origin is not enabled.');
      origin = suppliedOrigin || '';
      // Reject observable escapes before URL parsing can normalize dot segments
      // or backslashes. Aliases already normalized by the platform are no longer
      // distinguishable from canonical requests at this boundary.
      const rawUrl = request.url;
      if (/[%\\]/.test(rawUrl.split(/[?#]/, 1)[0])) fail(404, 'not_found', 'The agent interface route was not found.');
      const url = new URL(rawUrl);
      // Deployment-owned mount only. Reject a different namespace before body
      // parsing, authentication, preflight success or any storage access.
      if (!url.pathname.startsWith(cfg.pathPrefix + '/v1/') || /[%\\]/.test(url.pathname)) fail(404, 'not_found', 'The agent interface route was not found.');
      // Mount paths are transport details; clients and durable receipts hash the
      // same logical /v1 path regardless of the explicitly configured mount.
      const path = url.pathname.slice(cfg.pathPrefix.length);
      if (url.search) invalid('Query parameters are unsupported.');
      if (request.method === 'OPTIONS') return response(null, 204, origin);
      // Parse the bounded body before taking the authorization/expiry time. A
      // slow upload must not extend a token or signed review's validity.
      const body = request.method === 'POST' ? await readJson(request) : undefined;
      const actor = await authenticate(request, cfg, now(), fetchImpl);
      if (request.headers.get('X-Owner-UID') !== actor.ownerUid) fail(403, 'account_mismatch', 'The requested workspace does not match this identity.');
      if (request.method === 'GET' && path === '/v1/capabilities') return response({ role:actor.role, ownerUid:actor.ownerUid, policyId:cfg.policyId, profile:cfg.profile,
        actions:actor.role === 'revenue' ? (cfg.profile === 'lead_only' ? ['lead.save'] : Object.keys(ACTIONS)) : [],
        reviewOperationsEnabled:cfg.profile === 'full', externalActions:false, independentReviewProof:false }, 200, origin);
      if (body && body.ownerUid !== actor.ownerUid) fail(403, 'account_mismatch', 'The request belongs to a different workspace.');
      // Restrict before store construction and receipt replay, not merely in the
      // browser. A valid historical review artifact cannot expand this profile.
      if (cfg.profile === 'lead_only') {
        const permitted = (request.method === 'GET' && (path === '/v1/register' || path.startsWith('/v1/receipts/'))) ||
          (request.method === 'POST' && path === '/v1/actions' && body?.type === 'lead.save');
        if (!permitted) fail(403, 'profile_forbidden', 'This interface profile permits lead saves and their readbacks only.');
      }
      if (path === '/v1/reviews/attest' && request.method === 'POST') {
        if (actor.role !== 'quality') fail(403, 'role_forbidden', 'Only Quality can attest to a review.');
        return response(await attest(body, actor, cfg, now()), 200, origin);
      }
      if (actor.role !== 'revenue') fail(403, 'role_forbidden', 'Only Revenue can read or write the production register.');
      const store = storeFactory({ projectId:'ion-mining', ownerUid:actor.ownerUid, token:actor.token, fetchImpl, initialState:Model.initial() });
      if (request.method === 'GET' && path === '/v1/register') { const saved = await readRegister(store); return response({ ownerUid:actor.ownerUid, serverConfirmed:true, revision:saved.state.revision, state:saved.state }, 200, origin); }
      if (request.method === 'GET' && path.startsWith('/v1/receipts/')) {
        const id = path.slice('/v1/receipts/'.length); if (!UUID.test(id)) invalid('Invalid operation identity.');
        const result = await confirmedReceipt(store, cfg, actor, id.toLowerCase());
        return result ? response(result, 200, origin) : response({ code:'receipt_not_found', serverConfirmed:false, outcome:'unconfirmed' }, 404, origin);
      }
      if (request.method === 'POST' && path === '/v1/review-challenges') return response(await challenge(store, body, actor, cfg, now()), 200, origin);
      if (request.method === 'POST' && ['/v1/actions','/v1/closeouts'].includes(path)) return response(await mutate(path, request, body, store, actor, cfg, now()), 200, origin);
      return response({ code:'not_found' }, 404, origin);
    } catch (error) {
      // Unknown provider or implementation failures must not leak tokens/data or
      // suggest a timed-out mutation was rejected before it reached the server.
      const known = error instanceof InterfaceError || ['conflict','unconfirmed'].includes(error?.code);
      const status = known ? error.status : 503, code = known ? error.code : 'unconfirmed';
      return response({ code, message:known ? error.message : 'The outcome could not be confirmed. Retain and reconcile the original operation.', serverConfirmed:false, outcome:status >= 500 || code === 'conflict' ? 'unconfirmed' : 'rejected' }, status, origin);
    }
  };
}
export default { fetch:createHandler() };
