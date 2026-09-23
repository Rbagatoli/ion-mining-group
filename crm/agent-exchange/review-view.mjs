/* Isolated review UI. Explicit mount only; no route, account, timer or live pins. */
import disabledConfig from './review-config.mjs';
import { mountReviewHost } from './review-host.mjs';

const views = new WeakMap();
const pretty = value => typeof value === 'string' ? value : JSON.stringify(value, null, 2);
const shared = `
  <p class="boundary">Independent team review. Outreach remains paused.</p>
  <div class="session"><span><span class="label">Connection</span><strong data-ui="connection">Waiting</strong></span><span><span class="label">Role</span><span data-ui="role"></span></span><span><span class="label">Account</span><span data-ui="account">None</span></span></div>
  <p class="status" data-ui="notice" role="status" aria-live="polite">Waiting for the approved account.</p>
  <div class="actions"><button type="button" data-action="refresh">Recheck connection</button><button type="button" data-action="capabilities" disabled>Read capabilities</button></div>
  <details><summary>Observed capabilities</summary><pre data-ui="capabilities">Not read.</pre></details>`;
const revenue = `
  <div class="grid"><div class="stack">
    <section class="card"><h2>Request an independent review</h2><p class="small muted">Read the register and enter the exact source task, linked Quality task and revision. Creating a challenge does not complete either task.</p>
      <label class="editor-label">Source task ID <input type="text" data-ui="source-id" autocomplete="off" disabled></label>
      <label class="editor-label">Linked Quality task ID <input type="text" data-ui="qa-id" autocomplete="off" disabled></label>
      <label class="editor-label">Expected register revision <input type="text" inputmode="numeric" data-ui="revision" autocomplete="off" disabled></label>
      <div class="actions"><button type="button" data-action="register" disabled>Read register</button><button type="button" data-action="challenge" disabled>Create review challenge</button></div>
      <h3>Challenge artifact</h3><pre data-ui="challenge-output">No challenge created.</pre>
      <details><summary>Latest explicit register read</summary><pre data-ui="register">Not read.</pre></details>
    </section>
    <section class="card"><h2>Prepare the reviewed closeout</h2><p class="small muted">Use the actual Quality attestation and your explicit disposition. Preparing saves only a local journal entry.</p>
      <label class="editor-label">Exact closeout JSON <textarea data-ui="closeout-input" spellcheck="false" autocomplete="off" disabled placeholder="Enter the complete kind: closeout request, expectedRevision, attestation, decision, note, basis and checks."></textarea></label>
      <div class="actions"><button type="button" data-action="prepare" disabled>Prepare closeout locally</button></div>
      <p class="support-note">No verdict or acceptance is supplied for you. Do not enter credentials.</p>
    </section>
    <section class="card"><h2>Selected closeout</h2><p data-ui="selected-label">No operation selected.</p><h3>Exact saved request</h3><pre data-ui="request">No saved request.</pre>
      <div class="actions"><button type="button" data-action="submit" disabled>Submit original closeout once</button><button type="button" data-action="recover" disabled>Look up original receipt</button><button type="button" data-action="abandon" disabled>Close unsent preparation</button></div>
      <p class="support-note">An uncertain outcome requires lookup of its original receipt. Reloaded journal entries cannot be submitted again. Closing an unsent preparation retains its history.</p>
      <h3>Receipt</h3><p data-ui="receipt-label">No server confirmation observed.</p><pre data-ui="receipt">No response.</pre>
    </section>
  </div><aside class="card"><h2>Durable local closeout journal</h2><p class="small muted">Scoped to this account and endpoint. A stored receipt is historical evidence until checked again.</p><ul class="records" data-ui="records"></ul><div class="actions"><button type="button" data-action="list" disabled>Read local journal</button></div></aside></div>`;
const quality = `
  <div class="stack"><section class="card"><h2>Inspect the source and linked review</h2><p class="small muted">Paste the signed challenge issued for this review. This account cannot read the Revenue register or save CRM state.</p>
    <label class="editor-label">Signed challenge <textarea data-ui="challenge-input" spellcheck="false" autocomplete="off" disabled></textarea></label>
    <div class="actions"><button type="button" data-action="inspect" disabled>Inspect challenge locally</button></div>
    <p class="support-note" data-ui="inspection-label">Not inspected. Local parsing does not verify the HMAC signature. The server must authenticate the challenge before it can attest a finding.</p>
    <h3>Embedded source task</h3><pre data-ui="source">Not inspected.</pre><h3>Embedded linked Quality task</h3><pre data-ui="qa">Not inspected.</pre>
  </section><section class="card"><h2>Record your independent finding</h2><p class="small muted">Review the exact evidence and enter your actual finding as JSON. No result, verdict or check is prefilled.</p>
    <label class="editor-label">Finding JSON <textarea data-ui="finding-input" spellcheck="false" autocomplete="off" disabled></textarea></label>
    <div class="actions"><button type="button" data-action="attest" disabled>Request Quality attestation</button></div>
    <h3>Attestation artifact</h3><p data-ui="attestation-label">No attestation requested. CRM state is unchanged.</p><pre data-ui="attestation">No artifact.</pre>
    <p class="support-note">A returned attestation is not a CRM save. Revenue must separately prepare and submit the exact closeout.</p>
  </section></div>`;

export function mountReviewView({root, data, auth, config = disabledConfig, ...deps} = {}) {
  if (!root?.querySelector || !root?.ownerDocument) throw new TypeError('Review container required.');
  views.get(root)?.disconnect();
  root.classList.add('agent-exchange');
  if (config?.enabled !== true) {
    root.innerHTML = '<section class="card"><h2>Review connection not configured</h2><p>This separate review connection is staged and disabled. Outreach remains paused.</p></section>';
    const disabled = Object.freeze({status:()=>({state:'disabled'}),ready:()=>Promise.resolve(),refresh:()=>Promise.resolve(),disconnect(){if(views.get(root)===disabled){root.replaceChildren();views.delete(root);}}});
    views.set(root, disabled); return disabled;
  }
  if (!['revenue','quality'].includes(config.role)) throw new TypeError('Explicit revenue or quality role required.');
  const approved = Object.freeze({...config});
  root.innerHTML = shared + (approved.role === 'revenue' ? revenue : quality);
  const fields = Object.fromEntries([...root.querySelectorAll('[data-ui]')].map(node=>[node.dataset.ui,node]));
  const buttons = Object.fromEntries([...root.querySelectorAll('[data-action]')].map(node=>[node.dataset.action,node]));
  const editors = [...root.querySelectorAll('textarea,input')];
  const document = root.ownerDocument;
  const removers = [], fresh = new Set();
  let host, disposed = false, busy = false, generation = 0, state = {state:'waiting',role:approved.role,generation:null};
  let selected = null, records = [], inspected = null;
  function notice(message) { fields.notice.textContent = message; }
  function isConnected() { return !disposed && state.state === 'connected' && state.role === approved.role &&
    state.ownerUid === approved.ownerUid && state.actorUid === approved.actorUid &&
    String(state.endpoint || '').replace(/\/$/, '') === endpoint(); }
  function endpoint() { return String(approved.endpoint || '').replace(/\/$/, ''); }
  function stateChanged(next) { return ['generation','role','state','ownerUid','actorUid','endpoint'].some(key=>next[key]!==state[key]); }
  function bound(record) {
    return record && record.ownerUid === approved.ownerUid && record.endpoint === endpoint() &&
      typeof record.operationId === 'string' && record.operationId && record.job?.kind === 'closeout' &&
      record.job.operationId === record.operationId && record.job.ownerUid === approved.ownerUid && record.job.actorUid === approved.actorUid &&
      ['prepared','attempted','confirmed','not_sent'].includes(record.status);
  }
  function controls() {
    const enabled = isConnected() && !busy;
    for (const button of Object.values(buttons)) button.disabled = !enabled;
    buttons.refresh.disabled = disposed || busy || state.state === 'connecting';
    for (const editor of editors) editor.disabled = !enabled;
    if (approved.role === 'revenue') {
      buttons.submit.disabled = !enabled || !bound(selected) || selected.status !== 'prepared' || !fresh.has(selected.operationId);
      buttons.recover.disabled = !enabled || !bound(selected);
      buttons.abandon.disabled = !enabled || !bound(selected) || selected.status !== 'prepared';
    } else {
      const exact = inspected !== null && inspected === fields['challenge-input'].value;
      buttons.attest.disabled = !enabled || !exact;
      fields['finding-input'].disabled = !enabled || !exact;
    }
    for (const button of fields.records?.querySelectorAll('button') || []) button.disabled = !enabled;
  }
  function clearPrivate() {
    selected = null; records = []; inspected = null; fresh.clear();
    for (const editor of editors) editor.value = '';
    fields.capabilities.textContent = 'Not read.';
    if (approved.role === 'revenue') {
      fields['challenge-output'].textContent = 'No challenge created.'; fields.register.textContent = 'Not read.';
      fields['selected-label'].textContent = 'No operation selected.'; fields.request.textContent = 'No saved request.';
      fields['receipt-label'].textContent = 'No server confirmation observed.'; fields.receipt.textContent = 'No response.';
      renderList();
    } else clearInspection();
  }
  function clearInspection() {
    inspected = null; fields.source.textContent = 'Not inspected.'; fields.qa.textContent = 'Not inspected.';
    fields['finding-input'].value = ''; fields.attestation.textContent = 'No artifact.';
    fields['attestation-label'].textContent = 'No attestation requested. CRM state is unchanged.';
    fields['inspection-label'].textContent = 'Not inspected. Local parsing does not verify the HMAC signature. The server must authenticate the challenge before it can attest a finding.';
  }
  function update(next = {}) {
    if (disposed) return;
    if (stateChanged(next)) {
      generation++; busy = false; clearPrivate();
    }
    state = {...next};
    fields.connection.textContent = state.state || 'Unavailable'; fields.role.textContent = approved.role;
    fields.account.textContent = isConnected() ? approved.actorUid : 'None';
    if (!isConnected()) notice(state.error || 'Waiting for the approved account and review connection.');
    else notice('Connected. No challenge, finding or closeout has been submitted by opening this view.');
    controls();
  }
  function sync() { if (host) update(host.status()); }
  function current(run) {
    if (disposed) return false;
    const latest = host.status();
    if (stateChanged(latest)) update(latest);
    return isConnected() && generation === run.generation && state.generation === run.hostGeneration;
  }
  async function run(message, work) {
    sync(); if (!isConnected() || busy || disposed) return;
    const pin = {generation,hostGeneration:state.generation}; busy = true; controls(); notice(message);
    try { await work(pin); }
    catch (error) { if (current(pin)) notice(error?.message || 'The original outcome could not be confirmed.'); }
    finally { if (current(pin)) {busy = false; controls();} }
  }
  function listen(node, event, handler) { node.addEventListener(event,handler); removers.push(()=>node.removeEventListener(event,handler)); }
  function action(name, message, fn) { listen(buttons[name],'click',()=>run(message,fn)); }
  function objectInput(field, description) {
    let value;try { value=JSON.parse(fields[field].value); } catch {throw Error('Enter valid '+description+' JSON. Nothing was sent.');}
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Enter a complete '+description+' JSON object.');
    return value;
  }
  function renderList() {
    if (!fields.records) return;
    fields.records.replaceChildren();
    if (!records.length) { const item=document.createElement('li');item.className='empty';item.textContent='No local journal entries loaded.';fields.records.append(item);return; }
    for (const record of records) {
      const li=document.createElement('li'),button=document.createElement('button');button.type='button';
      button.textContent=record.operationId+' · '+record.status;button.disabled=!isConnected()||busy;button.setAttribute('aria-pressed',String(selected?.operationId===record.operationId));
      button.addEventListener('click',()=>{sync();if(isConnected()&&!busy&&bound(record))select(record,false);});
      li.append(button);fields.records.append(li);
    }
  }
  function select(record, observed) {
    if (!bound(record)) throw Error('The closeout does not match this approved account and endpoint.');
    selected=record;fields['selected-label'].textContent=record.operationId+' · '+record.status;fields.request.textContent=pretty(record.job);
    fields.receipt.textContent=record.response?pretty(record.response):'No confirmed server response recorded.';
    const confirmed=record.status==='confirmed'&&record.response?.serverConfirmed===true;
    fields['receipt-label'].textContent=record.status==='not_sent'?'Not sent. Original history retained.':confirmed?observed?(record.response.currentStateMatches===false?'Original commit confirmed; current register has changed.':'Exact original closeout server-confirmed.'):'Historical stored receipt; use lookup for current confirmation.':'No confirmed save. Preserve the original operation and look up its receipt.';
    renderList();controls();
  }
  async function loadList(pin) {
    const rows=await host.listCloseouts();if(!current(pin))return;
    if(!Array.isArray(rows)||rows.some(row=>!bound(row)))throw Error('Journal entries do not match this approved account and endpoint.');
    records=rows;renderList();
  }
  action('capabilities','Reading the approved review capabilities…',async pin=>{const result=await host.readCapabilities();if(current(pin)){fields.capabilities.textContent=pretty(result);notice('Capabilities read. No review or closeout was submitted.');}});
  listen(buttons.refresh,'click',async()=>{
    if(disposed||busy)return;generation++;busy=true;clearPrivate();controls();notice('Rechecking the existing account connection…');
    try { await host.refresh();if(!disposed)update(host.status()); } catch(error){if(!disposed){busy=false;clearPrivate();notice(error?.message||'Connection could not be confirmed.');controls();}}
  });
  if (approved.role === 'revenue') {
    action('register','Reading the current Revenue register…',async pin=>{const result=await host.readRegister();if(current(pin)){fields.register.textContent=pretty(result);notice('Register read. Use its exact revision; fields were not filled automatically.');}});
    action('challenge','Creating a challenge for the exact source and Quality task…',async pin=>{
      const revision=fields.revision.value.trim(),sourceId=fields['source-id'].value.trim(),qaId=fields['qa-id'].value.trim();
      if(!/^(0|[1-9]\d*)$/.test(revision)||!Number.isSafeInteger(Number(revision))||!sourceId||!qaId)throw Error('Enter exact task IDs and a nonnegative integer register revision.');
      fields['challenge-output'].textContent='Awaiting challenge response.';
      const result=await host.createChallenge({expectedRevision:Number(revision),sourceId,qaId});
      if(current(pin)){fields['challenge-output'].textContent=pretty(result);notice('Challenge returned. Independent Quality review and a separate closeout are still required.');}
    });
    action('prepare','Preparing the exact closeout in the durable local journal…',async pin=>{
      const input=objectInput('closeout-input','closeout');if(input.kind!=='closeout')throw Error('This view accepts kind: closeout only.');
      const record=await host.prepareCloseout(input);if(!current(pin))return;
      if(!bound(record)||record.status!=='prepared')throw Error('No matching durable preparation was returned.');
      fresh.add(record.operationId);select(record,false);await loadList(pin);if(current(pin))notice('Closeout prepared locally. Nothing has been saved to the CRM. Review its exact request before submitting.');
    });
    action('list','Reading this account’s durable local closeout journal…',async pin=>{await loadList(pin);if(current(pin)){if(selected){const match=records.find(row=>row.operationId===selected.operationId);if(match)select(match,false);}notice('Local journal read. Stored receipts are historical until looked up again.');}});
    for (const [name, method, message] of [['submit','submitCloseout','Submitting the original closeout once…'],['recover','recoverCloseout','Looking up the original receipt; no POST is retried…'],['abandon','abandonCloseout','Closing only an unsent preparation locally…']]) {
      action(name,message,async pin=>{
        if(!bound(selected))throw Error('Select the original closeout for this account.');
        if(name==='submit'&&(selected.status!=='prepared'||!fresh.has(selected.operationId)))throw Error('Only a new preparation from this view may be submitted once.');
        if(name==='abandon'&&selected.status!=='prepared')throw Error('Attempted or uncertain operations require original receipt lookup.');
        const id=selected.operationId;fresh.delete(id);controls();fields['receipt-label'].textContent='Awaiting original operation evidence.';
        try {
          const record=await host[method](id);if(!current(pin))return;select(record,name!=='abandon');await loadList(pin);
          if(current(pin))notice(name==='abandon'?'Unsent preparation closed; history retained.':record.status==='confirmed'&&record.response?.serverConfirmed===true?'The original closeout has a confirmed server receipt.':'Original outcome remains unconfirmed. Preserve it for receipt lookup.');
        } catch(error) {
          if(current(pin)){fields['receipt-label'].textContent='Unresolved. Look up the original receipt; do not resubmit.';fields.receipt.textContent='No fresh confirmed response.';try{await loadList(pin);if(current(pin)){const match=records.find(row=>row.operationId===id);if(match)select(match,false);}}catch{/* Keep the original request and unresolved status visible. */}}
          throw error;
        }
      });
    }
  } else {
    listen(fields['challenge-input'],'input',()=>{clearInspection();controls();});
    listen(fields['finding-input'],'input',()=>{fields.attestation.textContent='No artifact for this edited finding.';fields['attestation-label'].textContent='No attestation for the current finding. CRM state is unchanged.';});
    action('inspect','Parsing only the challenge’s embedded review records…',async pin=>{
      const challenge=fields['challenge-input'].value;clearInspection();controls();
      if(!challenge.trim())throw Error('Enter the signed challenge string.');
      const parsed=await host.inspectChallenge(challenge);if(!current(pin))return;
      if(parsed?.signatureVerified!==false||!parsed?.snapshot?.source||!parsed?.snapshot?.qa)throw Error('The inspected challenge did not contain a locally parsed source and linked Quality record.');
      inspected=challenge;fields.source.textContent=pretty(parsed.snapshot.source);fields.qa.textContent=pretty(parsed.snapshot.qa);
      fields['inspection-label'].textContent='Locally parsed only — HMAC signature NOT verified here. These embedded records are untrusted until the server authenticates the challenge. Review evidence independently.';
      notice('Embedded source and Quality records displayed. No register was read and no finding was supplied.');
    });
    action('attest','Requesting an attestation for the exact challenge and your finding…',async pin=>{
      if(inspected===null||inspected!==fields['challenge-input'].value)throw Error('Inspect this exact challenge before entering its finding.');
      const finding=objectInput('finding-input','independent finding');
      fields.attestation.textContent='Awaiting attestation response.';fields['attestation-label'].textContent='No CRM save is requested.';
      const result=await host.attest({challenge:inspected,finding});if(!current(pin))return;
      fields.attestation.textContent=pretty(result);fields['attestation-label'].textContent=result?.saved===false?'saved: false — this attestation did not save CRM state.':'Attestation response only. No CRM save is verified by this view.';
      notice('Attestation response returned. Revenue must separately prepare and submit a closeout.');
    });
  }
  controls();
  try {
    host=mountReviewHost({root,...(approved.role==='revenue'?{data}:{}),auth,config:approved,
      ...(Object.hasOwn(deps,'fetchImpl')?{fetchImpl:deps.fetchImpl}:{}),...(Object.hasOwn(deps,'indexedDBImpl')?{indexedDBImpl:deps.indexedDBImpl}:{}),...(Object.hasOwn(deps,'cryptoImpl')?{cryptoImpl:deps.cryptoImpl}:{}),onChange:update});
    update(host.status());
  } catch(error) {generation++;clearPrivate();state={state:'error',role:approved.role,generation:null};notice(error?.message||'The approved review connection is unavailable.');controls();buttons.refresh.disabled=true;}
  const api=Object.freeze({status:()=>host?.status()||{...state},ready:()=>host?.ready()||Promise.resolve(),refresh:()=>host?.refresh()||Promise.resolve(),disconnect(){if(disposed)return;disposed=true;generation++;busy=false;removers.forEach(remove=>remove());clearPrivate();host?.disconnect();if(views.get(root)===api){root.replaceChildren();views.delete(root);}}});
  views.set(root,api);return api;
}
