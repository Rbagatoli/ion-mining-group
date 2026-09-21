/* Candidate UI for the existing completed-review command. No auth, backend,
 * scheduler, generic dispatcher or outbound transport is introduced here. */
(function(root,factory){
  const cjs=typeof module==='object'&&module.exports;
  const api=factory(cjs?require('../agent-control-model'):root.AgentControlModel,cjs?require('./workflow'):root.ProtonCrmWorkflow);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.ProtonAgentWorkbench=api;
}(typeof window!=='undefined'?window:globalThis,function(A,F){
  'use strict';
  const clone=v=>JSON.parse(JSON.stringify(v));
  const canonical=v=>JSON.stringify(v, function(k,value){return value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value;});
  const same=(a,b)=>canonical(a)===canonical(b);
  const fail=message=>{throw Error(message);};
  const KEY='protonCompletedReviewWorkbench_v1:';
  function create({data,storage,locks,uuid,now=()=>new Date().toISOString()}){
    let fresh=null;
    function pin(){
      const s=data.status(),a=s.agent;
      if(!s.uid||!s.ready||s.error||a?.uid!==s.uid||a.mode!=='cloud'||a.serverConfirmed!==true)fail('A server-confirmed signed-in register is required. No local fallback.');
      return {uid:s.uid,epoch:s.epoch};
    }
    function account(p){const s=data.status();if(s.uid!==p.uid||s.epoch!==p.epoch||!s.ready||s.error)fail('Account changed. Return to the original account to reconcile; no request was retargeted.');}
    async function locked(p,fn){
      if(!locks?.request)fail('Browser locking is unavailable; no save can be prepared or sent.');
      return locks.request(KEY+p.uid,async()=>{account(p);return fn();});
    }
    function read(p){
      const raw=storage.getItem(KEY+p.uid);if(raw===null)return null;
      const r=JSON.parse(raw);
      if(r.uid!==p.uid||!Number.isSafeInteger(r.revision)||!r.request||!['prepared','attempted','confirmed','not_sent'].includes(r.status)||r.closeoutId!==r.request.closeoutId)fail('The original operation needs recovery. Do not clear browser storage.');
      return r;
    }
    function persist(p,r){
      account(p);const raw=canonical(r);storage.setItem(KEY+p.uid,raw);
      if(storage.getItem(KEY+p.uid)!==raw)fail('The original operation could not be retained. No new send is allowed.');
    }
    async function server(p){
      const result=await data.readAgentRegister();account(p);
      if(result.uid!==p.uid||result.epoch!==p.epoch||result.serverConfirmed!==true)fail('A fresh read did not confirm this account.');
      A.valid(result.state);return clone(result);
    }
    async function confirm(p,r,snapshot){
      const receipt=A.completedReviewReceipt(snapshot.state,r.closeoutId);
      if(!receipt)return {status:'unconfirmed',closeoutId:r.closeoutId,message:'No exact receipt is visible. Keep the original operation; do not resubmit or create a replacement.'};
      if(!same(receipt.request,r.request))fail('This receipt contains a different request. Preserve the original operation for recovery.');
      const result={status:'confirmed',serverConfirmed:true,uid:p.uid,observedAt:snapshot.observedAt,revision:snapshot.state.revision,receipt,
        currentTasks:snapshot.state.tasks.filter(t=>[receipt.sourceId,receipt.qaId].includes(t.id)).map(t=>({id:t.id,status:t.status,resultVersion:A.resultVersion(t)})),
        meaning:'The receipt confirms this historical closeout. Current task states are reported separately.'};
      persist(p,{...r,status:'confirmed',confirmation:result});return result;
    }
    return Object.freeze({
      async readRegister(){const p=pin();return server(p);},
      pending(){const p=pin();return clone(read(p));},
      async prepare(text,confirmations){
        const p=pin();
        if(typeof text!=='string'||text.length>60000)fail('Use at most 60,000 characters of completed-review JSON.');
        const input=JSON.parse(text);
        if(!input||!same(Object.keys(input).sort(),['payload','revision'])||!Number.isSafeInteger(input.revision))fail('Only {revision, payload} for a completed team review is accepted.');
        if(confirmations?.independent!==true||confirmations?.exactSource!==true)fail('Confirm the actual independent review and exact source explicitly.');
        return locked(p,async()=>{
          const prior=read(p);if(prior&&!['confirmed','not_sent'].includes(prior.status))fail('An original operation is unresolved. Check its receipt or close an unsent preparation first.');
          const snapshot=await server(p),state=snapshot.state;
          if(state.revision!==input.revision)fail('The register changed. Refresh and review the current source and Quality versions.');
          const closeoutId='closeout_'+uuid(),payload=clone(input.payload);
          if(!payload||typeof payload!=='object'||Array.isArray(payload)||!payload.attribution||Object.hasOwn(payload,'closeoutId'))fail('Supply the completed-review payload; the workbench creates its receipt ID.');
          payload.closeoutId=closeoutId;payload.confirmCurrentSource=true;payload.attribution.independent=true;
          if([payload.qaReview,payload.sourceDecision].filter(Boolean).some(d=>d.review?.reviewer!==payload.attribution.recordedBy))fail('Use the same Revenue recorder for both coordinator decisions and recordedBy.');
          const preview=A.reduce(state,{type:'task.completed-review',payload,revision:input.revision,id:'preview_'+uuid(),at:now()});
          const request=A.completedReviewReceipt(preview,closeoutId).request;
          if(!same(request,payload))fail('The input contains unsupported fields. Use the exact completed-review template.');
          const record={uid:p.uid,revision:input.revision,closeoutId,request,status:'prepared',preparedAt:now()};
          persist(p,record);fresh={...p,closeoutId,request:clone(request)};
          return {status:'prepared',closeoutId,revision:input.revision,request,source:state.tasks.find(t=>t.id===request.sourceId),quality:state.tasks.find(t=>t.id===request.qaId)};
        });
      },
      async submit(){
        const p=pin(),job=fresh;
        if(!job||job.uid!==p.uid||job.epoch!==p.epoch)fail('This preparation cannot be submitted after reload or account change. Reconcile the original operation.');
        fresh=null;
        return locked(p,async()=>{
          const r=read(p);
          if(!r||r.status!=='prepared'||r.closeoutId!==job.closeoutId||!same(r.request,job.request))fail('The original operation cannot be submitted again. Check its receipt.');
          const latest=await server(p);
          if(latest.state.revision!==r.revision)fail('The register changed before submission. This unsent preparation can be closed; review the new revision first.');
          const attempted={...r,status:'attempted',attemptedAt:now()};persist(p,attempted);account(p);
          // Exact same command and transactional adapter as Record completed team review.
          // The lock stays held through settlement and readback, including on another tab.
          try{await data.dispatch('task.completed-review',clone(r.request),r.revision);}catch(_){/* An exception can follow a successful commit. Read its exact receipt. */}
          account(p);return confirm(p,attempted,await server(p));
        });
      },
      async reconcile(){
        const p=pin();fresh=null;
        return locked(p,async()=>{const r=read(p);if(!r)fail('No retained operation for this account.');return confirm(p,r,await server(p));});
      },
      async closeUnsent(){
        const p=pin();fresh=null;
        return locked(p,()=>{const r=read(p);if(!r||r.status!=='prepared')fail('Only a preparation with no recorded attempt can be closed.');persist(p,{...r,status:'not_sent'});return {status:'not_sent',closeoutId:r.closeoutId};});
      }
    });
  }
  function classify(state){
    // Complete register projection. Today and lead-level summaries do not select
    // the work queue. Display meaning is retained separately from domain gates.
    return state.tasks.map(task=>{
      const kind=A.taskKind(task),actionable=A.actionable(task),bucket=F.bucket(task),display=F.taskMeaning(task,state);
      const meaning={...display,qa:display.qa?{id:display.qa.id,status:display.qa.status,resultVersion:A.resultVersion(display.qa)}:null};
      const source=task.role==='review'?state.tasks.find(t=>t.id===task.parentTaskId):task;
      const options=source?(task.role==='review'?[task]:state.tasks.filter(q=>q.role==='review'&&q.parentTaskId===source.id)).map(q=>({sourceId:source.id,qaId:q.id,...A.completedReviewEligibility(state,source,q)})):[];
      let nextAction='Use existing task controls',gate='No dispatch or generic acceptance is exposed by this workbench.';
      if(!actionable){nextAction='Reference only';gate=kind!=='work'?'Reference or superseded task; not executable.':'Closed task; no new work inferred.';}
      else if(bucket==='owner'){nextAction='Resolve the recorded owner decision';gate=task.routing.reason;}
      else if(options.some(o=>o.eligible)){nextAction='Record an already completed independent review';gate='Original native Quality artifact, exact versions and explicit Revenue checks are required. No new work or send is authorized.';}
      else if(task.status==='review'){nextAction='Inspect independent evidence and existing correction controls';gate=options.map(o=>o.reason).join(' ')||'No eligible linked completed-review pair. Preserve this submitted result.';}
      else if(task.role==='review'&&options.length){nextAction='Inspect the exact Quality assignment in existing controls';gate=options.map(o=>o.reason).join(' ');}
      else if(task.status==='ready'){nextAction='Native coordinator evaluates this exact assignment';gate=state.paused?'Queue paused for new claims. Existing review/receipt recovery remains available.':'Native current-cycle preflight is required before new dispatch. This page cannot verify usage or authorize execution.';}
      else if(task.status==='blocked'){nextAction='Resolve this task’s recorded blocker';gate=task.blocker||'No specific blocker recorded; do not infer one from another task.';}
      else if(task.status==='working'){nextAction='Reconcile the actual native work report';gate='Use existing attributed result controls; do not replay completed work as a new claim.';}
      return {id:task.id,title:task.title,role:task.role,status:task.status,kind,actionable,bucket,resultVersion:A.resultVersion(task),reviewRole:A.reviewRole(state,task),
        reviewEvidence:A.reviewEvidence(state,task).map(q=>({id:q.id,resultVersion:A.resultVersion(q)})),meaning,completedReviewOptions:options,nextAction,gate};
    });
  }
  function template(state,sourceId,qaId){
    const source=state.tasks.find(t=>t.id===sourceId),qa=state.tasks.find(t=>t.id===qaId),eligible=A.completedReviewEligibility(state,source,qa);
    if(!eligible.eligible)fail(eligible.reason);
    const review=()=>({actor:'coordinator',reviewer:'',basis:'',checks:{evidence:'unchecked',arithmetic:'unchecked',fit:'unchecked'}});
    const payload={sourceId,qaId,expectedSourceVersion:A.resultVersion(source),expectedQaVersion:A.resultVersion(qa),confirmCurrentSource:false,
      attribution:{reviewer:'',reviewedAt:'',evidence:'',recordedBy:'',verdict:'',independent:false},
      sourceDecision:{decision:'',note:'',review:{...review(),evidenceTaskId:qaId}}};
    if(eligible.needsQaResult)payload.qaResult={result:'',sources:[],verdict:''};
    if(!eligible.reuseQa)payload.qaReview={note:'',review:review()};
    return {revision:state.revision,payload};
  }
  function mount({root,data,storage=localStorage,locks=navigator.locks,uuid=()=>crypto.randomUUID()}){
    const controller=create({data,storage,locks,uuid}),initial=data.status();let active=true,inFlight=false;
    root.classList.add('crm-form');
    root.innerHTML='<p class="banner">Revenue records completed native Quality reviews. This workbench does not dispatch new work or send outreach. Existing sending holds remain in effect.</p>'+
      '<button type="button" class="button" data-wb="refresh">Read current register</button><details><summary>Server register and exact task IDs</summary><pre data-wb="register" class="note-text"></pre></details>'+
      '<div class="field-pair"><label class="field">Source task ID<input data-wb="source"></label><label class="field">Quality task ID<input data-wb="qa"></label></div><button type="button" class="text-button" data-wb="template">Load exact pair and template</button>'+
      '<details open><summary>Exact source and Quality evidence</summary><pre data-wb="pair" class="note-text"></pre></details>'+
      '<label class="field">Completed team review JSON<textarea data-wb="input" maxlength="60000" rows="12" spellcheck="false"></textarea></label>'+
      '<label class="checkbox"><input type="checkbox" data-wb="independent"> The actual Quality reviewer worked independently of the source author.</label>'+
      '<label class="checkbox"><input type="checkbox" data-wb="exact"> The actual review covers this exact source result, evidence, recipient and scope.</label>'+
      '<div class="actions"><button type="button" class="button" data-wb="prepare">Preview completed review</button><button type="button" class="button primary" data-wb="submit" disabled>Record completed team review</button></div>'+
      '<div class="actions"><button type="button" class="text-button" data-wb="reconcile">Check saved receipt</button><button type="button" class="text-button" data-wb="abandon">Close unsent preparation</button></div>'+
      '<p data-wb="notice" role="status"></p><pre data-wb="output" class="note-text" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre>';
    const el=name=>root.querySelector('[data-wb="'+name+'"]');
    function valid(){const s=data.status();return active&&root.isConnected&&s.uid===initial.uid&&s.epoch===initial.epoch;}
    function freeze(){if(!active)return;active=false;root.querySelectorAll('input,textarea,button').forEach(x=>x.disabled=true);for(const name of ['register','pair','output'])el(name).textContent='';el('input').disabled=false;el('input').readOnly=true;el('notice').textContent='Account changed. The original-account draft is retained read-only; copy it if needed. Reopen in the original account to reconcile its retained operation.';}
    const unsubscribe=data.subscribe(()=>{if(active&&!valid())freeze();});
    async function run(work){
      if(inFlight||!valid())return;inFlight=true;
      root.querySelectorAll('button,input,textarea').forEach(x=>x.disabled=true);
      try{const result=await work();if(valid())el('output').textContent=JSON.stringify(result,null,2);}
      catch(e){if(valid()){el('notice').textContent=e.message;el('submit').dataset.ready='';}}
      finally{inFlight=false;if(valid()){root.querySelectorAll('button,input,textarea').forEach(x=>x.disabled=false);el('submit').disabled=el('submit').dataset.ready!=='yes';}else freeze();}
    }
    el('refresh').onclick=()=>run(async()=>{const snapshot=await controller.readRegister(),tasks=classify(snapshot.state);if(valid()){el('register').textContent=JSON.stringify({uid:snapshot.uid,observedAt:snapshot.observedAt,revision:snapshot.state.revision,queuePaused:snapshot.state.paused,tasks},null,2);el('notice').textContent='Fresh server read at '+snapshot.observedAt+' · revision '+snapshot.state.revision+' · all '+tasks.length+' tasks. Sending HOLD and unavailable usage do not exclude existing review or receipt recovery.';}return {uid:snapshot.uid,observedAt:snapshot.observedAt,revision:snapshot.state.revision,serverConfirmed:snapshot.serverConfirmed,taskCount:tasks.length,retainedOperation:controller.pending()};});
    el('template').onclick=()=>run(async()=>{
      const snapshot=await controller.readRegister(),input=template(snapshot.state,el('source').value.trim(),el('qa').value.trim());
      if(valid()){el('input').value=JSON.stringify(input,null,2);el('pair').textContent=JSON.stringify(snapshot.state.tasks.filter(t=>[input.payload.sourceId,input.payload.qaId].includes(t.id)),null,2);el('independent').checked=false;el('exact').checked=false;el('submit').dataset.ready='';}return {revision:snapshot.state.revision};
    });
    el('prepare').onclick=()=>run(async()=>{const result=await controller.prepare(el('input').value,{independent:el('independent').checked,exactSource:el('exact').checked});if(valid()){el('submit').dataset.ready='yes';el('notice').textContent='Prepared only. Review the exact request below before recording it.';}return result;});
    el('submit').onclick=()=>run(async()=>{el('submit').dataset.ready='';const result=await controller.submit();if(valid())el('notice').textContent=result.status==='confirmed'?'Server-confirmed completed review saved.':'Save is unconfirmed. Keep this operation and check its receipt.';return result;});
    el('reconcile').onclick=()=>run(async()=>{el('submit').dataset.ready='';return controller.reconcile();});
    el('abandon').onclick=()=>run(async()=>{el('submit').dataset.ready='';return controller.closeUnsent();});
    el('input').oninput=()=>{el('submit').dataset.ready='';el('submit').disabled=true;};
    for(const name of ['independent','exact'])el(name).onchange=()=>{el('submit').dataset.ready='';el('submit').disabled=true;};
    return {destroy(){active=false;if(typeof unsubscribe==='function')unsubscribe();}};
  }
  return {create,template,classify,mount};
}));
