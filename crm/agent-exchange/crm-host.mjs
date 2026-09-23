/* Staged host wiring only. Reuse the existing CRM instance and Firebase SDK user. */
import { createAgentClient } from './client.mjs';
import { openExchangeJournal } from './journal.mjs';
import { mountExchangePage } from './exchange-page.mjs';
const hosts = new WeakMap();

/** No endpoint/session is inferred, no sign-in is initiated, no token is exposed.
 * config is trusted deployment code, never URL, DOM, localStorage, or agent input.
 * This first bridge is lead-only; it does not install the Python budget port.
 */
export function mountCrmExchangeHost({root, data, auth, config, fetchImpl = globalThis.fetch, indexedDBImpl = globalThis.indexedDB, cryptoImpl = globalThis.crypto} = {}) {
  // Reconfiguration revokes the old host, including when switching to disabled.
  hosts.get(root)?.disconnect();
  if (config?.enabled !== true) return Object.freeze({status:()=>({state:'disabled'}),ready:()=>Promise.resolve(),refresh:()=>Promise.resolve(),disconnect(){}});
  if (!root?.querySelector || typeof data?.status !== 'function' || typeof data?.subscribe !== 'function' || typeof auth?.onAuthStateChanged !== 'function') throw new TypeError('Existing CRM data instance, Firebase Auth instance and exchange root are required.');
  if (['ownerUid','policyId','endpoint'].some(key=>typeof config[key] !== 'string' || !config[key].trim()) ||
      Object.keys(config).some(key=>!['enabled','ownerUid','policyId','endpoint','approvedOrigin'].includes(key))) throw new TypeError('Use explicit approved owner, policy and endpoint configuration.');
  const approved = Object.freeze({...config});
  let disposed=false, generation=0, pin=null, page=null, journal=null, state='waiting', error='', pending=Promise.resolve();
  let stopData=()=>{}, stopAuth=()=>{};
  const same=(a,b)=>a===b || !!a && !!b && a.uid===b.uid && a.epoch===b.epoch && a.user===b.user;
  function current() {
    try {
      const s=data.status(),user=auth.currentUser;
      if (!s?.ready || s.error || s.uid!==approved.ownerUid || !['string','number'].includes(typeof s.epoch) ||
          (typeof s.epoch==='number' && !Number.isFinite(s.epoch)) || !user || user.uid!==s.uid || typeof user.getIdToken!=='function' ||
          s.agent?.uid!==s.uid || s.agent.mode!=='cloud' || s.agent.serverConfirmed!==true || s.agent.error) return null;
      return {uid:s.uid,epoch:s.epoch,user};
    } catch { return null; }
  }
  function session() {
    const actual=current();
    if (disposed || !pin || !same(actual,pin)) return null;
    const captured=pin, epoch=generation;
    return {uid:captured.uid,epoch,getIdToken:async()=>{
      if (disposed || generation!==epoch || !same(current(),captured)) throw Error('Session changed before authentication.');
      // Preserve the actual SDK method receiver. Only the client gets this token.
      const token=await captured.user.getIdToken();
      if (disposed || generation!==epoch || !same(current(),captured)) throw Error('Session changed during authentication.');
      return token;
    }};
  }
  function clear() { page?.destroy();page=null;journal?.close();journal=null; }
  function notice(message) {
    const node=root.querySelector('[data-ui="notice"]');if(node)node.textContent=message;
  }
  function reconcile(force=false) {
    if (disposed) return pending;
    const next=current();
    if (!force && same(next,pin)) return pending;
    generation++;const captured=generation;clear();pin=next;error='';
    if (!pin) {state='waiting';notice('Waiting for the approved account and a confirmed cloud lead register.');pending=Promise.resolve();return pending;}
    state='connecting';notice('Checking the approved lead interface for this account…');
    pending=(async()=>{
      let opening;
      try {
        const client=createAgentClient({baseUrl:approved.endpoint,session,fetchImpl,cryptoImpl,options:{approvedOrigin:approved.approvedOrigin}});
        const capabilities=await client.readCapabilities();
        if(disposed || generation!==captured || !same(current(),pin)) return;
        if(capabilities.ownerUid!==approved.ownerUid || capabilities.policyId!==approved.policyId || capabilities.role!=='revenue' || capabilities.profile!=='lead_only' ||
            capabilities.reviewOperationsEnabled!==false || capabilities.actions.length!==1 || capabilities.actions[0]!=='lead.save') throw Error('The endpoint does not match the approved lead-only account, policy and scope.');
        opening=await openExchangeJournal({indexedDBImpl});
        if(disposed || generation!==captured || !same(current(),pin)){opening.close();return;}
        journal=opening;opening=null;
        page=mountExchangePage({root,client,journal,session});state='connected';
        notice('Connected to the approved lead-only interface. No lead has been read or saved.');
      } catch (failure) {
        opening?.close();
        if(!disposed && generation===captured){clear();state='error';error=failure?.message||'The approved lead interface could not be confirmed.';notice(error);}
      }
    })();
    return pending;
  }
  try {
    const off=data.subscribe(()=>{void reconcile();});if(typeof off==='function')stopData=off;
    const offAuth=auth.onAuthStateChanged(()=>{void reconcile();});if(typeof offAuth==='function')stopAuth=offAuth;
    // CRM subscribe is not immediate; explicitly inspect the actual initial state.
    void reconcile();
  } catch(failure){disposed=true;generation++;stopData();stopAuth();clear();throw failure;}
  const api = Object.freeze({
    status:()=>Object.freeze({state,...(error?{error}:{}),...(state==='connected'?{ownerUid:approved.ownerUid,endpoint:approved.endpoint,profile:'lead_only'}:{})}),
    ready:()=>pending,
    refresh:()=>reconcile(true),
    disconnect(){if(disposed)return;disposed=true;generation++;stopData();stopAuth();clear();pin=null;state='disconnected';error='';if(hosts.get(root)===api)hosts.delete(root);notice('Agent exchange disconnected. Stored operation history is retained.');}
  });
  hosts.set(root,api);return api;
}
