/* Explicit, staged review host. No account switching, token storage or scheduler. */
import { createAgentClient } from './client.mjs';
import { createReviewClient } from './review-client.mjs';
import { createCloseoutExchangeController } from './exchange-controller.mjs';
import { openExchangeJournal } from './journal.mjs';

const hosts = new WeakMap();
const keys = new Set(['enabled','endpoint','approvedOrigin','ownerUid','actorUid','reviewerUid','role','policyId']);
const epochValid = value => ['string','number'].includes(typeof value) && (typeof value !== 'number' || Number.isFinite(value));
const same = (a,b) => a === b || !!a && !!b && a.uid === b.uid && a.epoch === b.epoch && a.user === b.user;

/** Configuration is trusted deployment code, never URL, storage or agent input.
 * Revenue receives its existing confirmed owner store and Auth instance. Quality
 * receives a separately supplied Auth instance and never needs an owner store.
 * Neither role is signed in here; the caller supplies an established SDK session.
 */
export function mountReviewHost({root, data, auth, config, onChange = ()=>{}, fetchImpl = globalThis.fetch,
  indexedDBImpl = globalThis.indexedDB, cryptoImpl = globalThis.crypto, openJournal = openExchangeJournal} = {}) {
  if (!root || !['object','function'].includes(typeof root)) throw new TypeError('An explicit review host root is required.');
  hosts.get(root)?.disconnect();
  if (config?.enabled !== true) return Object.freeze({status:()=>Object.freeze({state:'disabled',generation:0}),ready:()=>Promise.resolve(),refresh:()=>Promise.resolve(),disconnect(){}});
  if (Object.keys(config).some(key=>!keys.has(key)) || ['endpoint','ownerUid','actorUid','reviewerUid','policyId'].some(key=>typeof config[key] !== 'string' || !config[key].trim()) ||
      !['revenue','quality'].includes(config.role) || config.reviewerUid === config.ownerUid ||
      (config.role === 'revenue' ? config.actorUid !== config.ownerUid : config.actorUid !== config.reviewerUid)) {
    throw new TypeError('Use an explicit owner, distinct reviewer, actor, role, policy and approved endpoint.');
  }
  if (typeof auth?.onAuthStateChanged !== 'function' || auth.app?.options?.projectId !== 'ion-mining') throw new TypeError('Supply the approved ion-mining Firebase Auth instance.');
  if (config.role === 'revenue' && (typeof data?.status !== 'function' || typeof data?.subscribe !== 'function')) throw new TypeError('Revenue requires its existing confirmed CRM data instance.');
  if (typeof onChange !== 'function' || typeof openJournal !== 'function') throw new TypeError('Host callbacks must be functions.');
  const approved = Object.freeze({...config});
  let disposed = false, generation = 0, authEpoch = 0, pin = null, state = 'waiting', error = '', pending = Promise.resolve();
  let protocol = null, controller = null, journal = null, stopData = ()=>{}, stopAuth = ()=>{};
  const status = () => Object.freeze({state,generation,role:approved.role,ownerUid:approved.ownerUid,actorUid:approved.actorUid,endpoint:approved.endpoint,...(error?{error}:{})});
  const notify = () => { try { onChange(status()); } catch { /* A view callback cannot grant access or alter the session. */ } };
  function current() {
    try {
      const user = auth.currentUser;
      if (!user || user.uid !== approved.actorUid || typeof user.getIdToken !== 'function') return null;
      if (approved.role === 'quality') return {uid:user.uid,epoch:authEpoch,user};
      const s = data.status();
      if (!s?.ready || s.error || s.uid !== approved.ownerUid || !epochValid(s.epoch) || s.agent?.uid !== s.uid ||
          s.agent.mode !== 'cloud' || s.agent.serverConfirmed !== true || s.agent.error) return null;
      return {uid:user.uid,epoch:JSON.stringify([authEpoch,s.epoch]),user};
    } catch { return null; }
  }
  function clear() { protocol=null;controller=null;journal?.close();journal=null; }
  function sessionFor(captured, expectedGeneration) {
    return () => {
      if (disposed || generation !== expectedGeneration || !same(current(),captured)) return null;
      return {uid:captured.uid,epoch:expectedGeneration,getIdToken:async()=>{
        if (disposed || generation !== expectedGeneration || !same(current(),captured)) throw Error('Review account changed before authentication.');
        const token = await captured.user.getIdToken();
        if (disposed || generation !== expectedGeneration || !same(current(),captured)) throw Error('Review account changed during authentication.');
        return token;
      }};
    };
  }
  function reconcile(force=false) {
    if (disposed) return pending;
    const next = current();
    if (!force && same(next,pin)) return pending;
    generation++;const run=generation;clear();pin=next;error='';
    if (!next) {state='waiting';notify();pending=Promise.resolve();return pending;}
    state='connecting';notify();
    const session=sessionFor(next,run);
    pending=(async()=>{
      let opening;
      try {
        const candidate=createReviewClient({baseUrl:approved.endpoint,ownerUid:approved.ownerUid,actorUid:approved.actorUid,
          role:approved.role,reviewerUid:approved.reviewerUid,policyId:approved.policyId,session,fetchImpl,cryptoImpl,
          options:{approvedOrigin:approved.approvedOrigin}});
        await candidate.readCapabilities();
        if (!session()) return;
        let closeout;
        if (approved.role === 'revenue') {
          // The lead-only journal is retained separately, including unresolved jobs.
          opening=await openJournal({indexedDBImpl,name:'proton-agent-review-closeouts-v1'});
          if (!session()) {opening.close();opening=null;return;}
          closeout=createCloseoutExchangeController({client:createAgentClient({baseUrl:approved.endpoint,session,fetchImpl,cryptoImpl,
            options:{approvedOrigin:approved.approvedOrigin}}),journal:opening,session});
        }
        if (!session()) {opening?.close();return;}
        protocol=candidate;controller=closeout||null;journal=opening||null;opening=null;state='connected';notify();
      } catch (failure) {
        opening?.close();
        if (!disposed && generation===run) {clear();state='error';error=failure?.message||'The approved review connection is unavailable.';notify();}
      }
    })();
    return pending;
  }
  function connected(role) {
    if (disposed || !same(current(),pin)) {void reconcile();throw Error('Review account changed. Return to the approved account before continuing.');}
    if (state !== 'connected' || !protocol) throw Error('The approved review interface is not connected.');
    if (role && approved.role !== role) throw Error('This operation is not available to the signed-in review role.');
    const run=generation, p=protocol, c=controller;
    return {p,c,assert(){if(disposed || generation!==run || state!=='connected' || !same(current(),pin)) {void reconcile();throw Error('Review account changed; the operation is unconfirmed in this view. Preserve its original artifact or receipt.');}}};
  }
  async function call(role,work) { const access=connected(role);const result=await work(access);access.assert();return result; }
  const api=Object.freeze({
    status,ready:()=>pending,refresh:()=>reconcile(true),
    readCapabilities:()=>call(null,({p})=>p.readCapabilities()),
    readRegister:()=>call('revenue',({c})=>c.readRegister()),
    createChallenge:input=>call('revenue',({p})=>p.createChallenge(input)),
    inspectChallenge:challenge=>call(null,({p})=>p.inspectChallenge(challenge)),
    attest:input=>call('quality',({p})=>p.attest(input)),
    listCloseouts:()=>call('revenue',({c})=>c.list()),
    prepareCloseout:input=>call('revenue',async({p,c,assert})=>{await p.readCapabilities();assert();return c.prepare(input);}),
    submitCloseout:id=>call('revenue',({p,c,assert})=>c.submit(id,{beforeDispatch:async()=>{await p.readCapabilities();assert();}})),
    recoverCloseout:id=>call('revenue',({c})=>c.recover(id)),
    abandonCloseout:id=>call('revenue',({c})=>c.abandonPrepared(id)),
    disconnect(){if(disposed)return;disposed=true;generation++;stopData();stopAuth();clear();pin=null;state='disconnected';error='';if(hosts.get(root)===api)hosts.delete(root);notify();}
  });
  hosts.set(root,api);
  try {
    if (approved.role==='revenue') {const off=data.subscribe(()=>{void reconcile();});if(typeof off==='function')stopData=off;}
    const off=auth.onAuthStateChanged(()=>{authEpoch++;void reconcile();});if(typeof off==='function')stopAuth=off;
    void reconcile();
  } catch(failure) {api.disconnect();throw failure;}
  return api;
}
