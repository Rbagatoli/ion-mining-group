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
  function preflight(payload,at=new Date().toISOString()){
    const issues=[],verdicts=['pass','revise','blocked'];
    if(!payload||typeof payload!=='object'||Array.isArray(payload))return ['payload: supply the completed-review object from Load exact pair and template.'];
    const text=(value,path,max)=>{if(typeof value!=='string'||!value.trim()||value.length>max)issues.push(path+': enter the actual value (1–'+max+' characters).');};
    const choice=(value,path,values)=>{if(!values.includes(value))issues.push(path+': use exactly '+values.map(v=>'"'+v+'"').join(', ')+' (lowercase); do not infer a verdict.');};
    for(const field of ['sourceId','qaId'])if(typeof payload[field]!=='string'||!/^[a-zA-Z0-9_-]{1,90}$/.test(payload[field]))issues.push('payload.'+field+': use the exact existing task ID.');
    for(const field of ['expectedSourceVersion','expectedQaVersion'])if(!Number.isSafeInteger(payload[field])||payload[field]<0)issues.push('payload.'+field+': use the loaded nonnegative integer version; 0 is valid.');
    const attribution=payload.attribution||{};
    for(const [field,max] of [['reviewer',180],['reviewedAt',40],['evidence',2000],['recordedBy',180]])text(attribution[field],'payload.attribution.'+field,max);
    if(typeof attribution.reviewer==='string'&&typeof attribution.recordedBy==='string'&&attribution.reviewer.trim()&&attribution.reviewer.trim().replace(/\s+/g,' ').toLowerCase()===attribution.recordedBy.trim().replace(/\s+/g,' ').toLowerCase())issues.push('payload.attribution.reviewer: record the actual independent Quality reviewer separately from payload.attribution.recordedBy (Revenue).');
    if(typeof attribution.reviewedAt==='string'&&attribution.reviewedAt.trim()&&(!Number.isFinite(Date.parse(attribution.reviewedAt))||Date.parse(attribution.reviewedAt)>Date.parse(at)))issues.push('payload.attribution.reviewedAt: use the original completed review time, not a future or invented time.');
    choice(attribution.verdict,'payload.attribution.verdict',verdicts);
    if(payload.qaResult){
      text(payload.qaResult.result,'payload.qaResult.result',18000);choice(payload.qaResult.verdict,'payload.qaResult.verdict',verdicts);
      if(verdicts.includes(attribution.verdict)&&verdicts.includes(payload.qaResult.verdict)&&payload.qaResult.verdict!==attribution.verdict)issues.push('payload.qaResult.verdict: must match payload.attribution.verdict for this same Quality finding.');
      if(!Array.isArray(payload.qaResult.sources)||payload.qaResult.sources.length>12)issues.push('payload.qaResult.sources: supply an array with at most 12 actual HTTP/HTTPS evidence URLs.');
      else payload.qaResult.sources.forEach((value,index)=>{try{A.url(value);if(typeof value!=='string'||!value.trim())throw Error();}catch(_){issues.push('payload.qaResult.sources['+index+']: use the complete original HTTP/HTTPS evidence URL without credentials.');}});
    }
    const sourceDecision=payload.sourceDecision||{};choice(sourceDecision.decision,'payload.sourceDecision.decision',['accept','revise']);
    if(['revise','blocked'].includes(attribution.verdict)&&sourceDecision.decision==='accept')issues.push('payload.sourceDecision.decision: adverse Quality evidence requires "revise"; accepting the QA artifact does not accept the source.');
    const decisions=[['sourceDecision',sourceDecision,sourceDecision.decision==='accept']];
    if(payload.qaReview)decisions.unshift(['qaReview',payload.qaReview,true]);
    for(const [name,decision,accept] of decisions){
      const path='payload.'+name,review=decision.review||{};text(decision.note,path+'.note',3000);
      if(review.actor!=='coordinator')issues.push(path+'.review.actor: use "coordinator"; this path has no owner bypass.');
      text(review.reviewer,path+'.review.reviewer',180);text(review.basis,path+'.review.basis',2000);
      if(review.reviewer&&attribution.recordedBy&&review.reviewer!==attribution.recordedBy)issues.push(path+'.review.reviewer: use the same Revenue recorder as payload.attribution.recordedBy.');
      for(const field of ['evidence','arithmetic','fit']){
        const values=accept?['pass','na']:['pass','na','revise','blocked','unchecked'];
        if(!values.includes(review.checks?.[field]))issues.push(path+'.review.checks.'+field+': use '+values.map(v=>'"'+v+'"').join(', ')+(name==='qaReview'?' for the Quality artifact itself, separately from its verdict on the source.':'.'));
      }
    }
    if(sourceDecision.review?.evidenceTaskId!==payload.qaId)issues.push('payload.sourceDecision.review.evidenceTaskId: must equal payload.qaId.');
    return issues;
  }
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
        const issues=preflight(input.payload,now());
        if(confirmations?.independent!==true)issues.push('Confirmation: confirm the actual Quality reviewer worked independently.');
        if(confirmations?.exactSource!==true)issues.push('Confirmation: confirm the actual review covers this exact source result, evidence, recipient and scope.');
        if(issues.length)fail('Complete these review fields before previewing:\n• '+issues.join('\n• '));
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
  function reviewPath(state,sourceId,qaId=''){
    const source=state.tasks.find(t=>t.id===sourceId);
    const linked=state.tasks.filter(q=>q.role==='review'&&q.parentTaskId===sourceId).map(qa=>{
      const eligible=A.completedReviewEligibility(state,source,qa);
      let needsReady=false,reason=eligible.reason;
      if(qa.status==='draft'&&reason==='This Quality assignment is not eligible for a completed team review.'){
        try{
          // Read-only rehearsal of the existing transition; never dispatched.
          const prepared=A.reduce(state,{type:'task.ready',payload:{id:qa.id},revision:state.revision,id:'workbench_readiness_preview',at:new Date().toISOString()});
          const next=A.completedReviewEligibility(prepared,prepared.tasks.find(t=>t.id===sourceId),prepared.tasks.find(t=>t.id===qa.id));
          needsReady=next.eligible;
          reason=next.eligible?'This linked Quality assignment is Draft. Open it and use Ready for handoff, then reload this exact pair. That prepares the CRM record only: do not Claim task, record a new handoff, dispatch or rerun the already completed Quality review.':next.reason;
        }catch(e){reason='Draft Quality preparation is blocked: '+e.message+' Keep the current hold; this workbench cannot change it.';}
      }
      if(eligible.eligible)reason=eligible.reuseQa?'Reuse this accepted Quality finding unchanged. Record only the supported source decision.':'Record the original completed Quality finding and Revenue’s acceptance of that evidence. A Quality verdict of REVISE or BLOCKED means source corrections, not source acceptance.';
      return {qaId:qa.id,status:qa.status,resultVersion:A.resultVersion(qa),sourceVersion:qa.reviewOfVersion??null,...eligible,needsReady,reason};
    });
    const selected=linked.find(q=>q.qaId===qaId)||null;
    let reason=selected?.reason||'Choose an existing linked Quality assignment below. Reuse its exact ID; do not create a duplicate.';
    if(!source||source.role==='review'||A.taskKind(source)!=='work'||source.status!=='review'||!source.result||source.routing?.reviewOwner==='owner')reason=A.completedReviewEligibility(state,source,null).reason;
    else if(qaId&&!selected)reason='Choose an existing Quality assignment linked to this exact source.';
    else if(!linked.length)reason='A linked Quality assignment is required for REVISE as well as acceptance. Open the source and use Request Quality Review once. Keep the generated brief intact. The new assignment starts Draft; it must pass the existing Ready for handoff step before this historical review can be recorded.';
    return {sourceId,sourceVersion:source?A.resultVersion(source):null,linked,selected,reason};
  }
  function template(state,sourceId,qaId,options={}){
    const source=state.tasks.find(t=>t.id===sourceId),qa=state.tasks.find(t=>t.id===qaId),eligible=A.completedReviewEligibility(state,source,qa);
    if(!eligible.eligible)fail(reviewPath(state,sourceId,qaId).reason);
    const verdict=options.verdict??'',finding=options.finding??'',correction=options.correction??'';
    if(!['','pass','revise','blocked'].includes(verdict))fail('Choose the actual completed Quality verdict: PASS, REVISE or BLOCKED.');
    if(typeof finding!=='string'||typeof correction!=='string')fail('Paste the original finding and any factual correction as plain text.');
    if((finding.trim()||correction.trim())&&!verdict)fail('Select the actual Quality verdict before prefilling its finding.');
    if(correction.trim()&&!finding.trim())fail('Paste the original completed Quality finding before adding a factual transcription correction.');
    if((finding.trim()||correction.trim())&&!eligible.needsQaResult)fail('This submitted or accepted Quality result is immutable. Clear the prefill text and reuse it unchanged; resolve corrections through the existing correction controls.');
    const review=()=>({actor:'coordinator',reviewer:'',basis:'',checks:{evidence:'unchecked',arithmetic:'unchecked',fit:'unchecked'}});
    const payload={sourceId,qaId,expectedSourceVersion:A.resultVersion(source),expectedQaVersion:A.resultVersion(qa),confirmCurrentSource:false,
      attribution:{reviewer:'',reviewedAt:'',evidence:'',recordedBy:'',verdict,independent:false},
      sourceDecision:{decision:['revise','blocked'].includes(verdict)?'revise':'',note:'',review:{...review(),evidenceTaskId:qaId}}};
    if(eligible.needsQaResult){
      const result=finding+(correction.trim()?'\n\nFactual transcription correction (recorded by Revenue):\n'+correction:'');
      if(result.length>18000)fail('The original finding and correction together must fit the existing 18,000-character Quality result limit.');
      payload.qaResult={result,sources:[],verdict};
    }
    if(!eligible.reuseQa)payload.qaReview={note:'',review:review()};
    return {revision:state.revision,payload};
  }
  function mount({root,data,storage=localStorage,locks=navigator.locks,uuid=()=>crypto.randomUUID()}){
    const controller=create({data,storage,locks,uuid}),initial=data.status();let active=true,inFlight=false;
    root.classList.add('crm-form');
    root.innerHTML='<p class="banner">Revenue records completed native Quality reviews. This workbench does not dispatch new work or send outreach. Existing sending holds remain in effect.</p>'+
      '<button type="button" class="button" data-wb="refresh">Read current register</button><details><summary>Server register and exact task IDs</summary><pre data-wb="register" class="note-text"></pre></details>'+
      '<p class="quiet-note">Already completed a native Quality review? Reuse its linked QA assignment, including for REVISE. A Draft QA needs the existing Ready for handoff step first. Do not Claim task, dispatch or rerun completed work.</p>'+
      '<div class="field-pair"><label class="field">Source task ID<input data-wb="source"></label><label class="field">Quality task ID<input data-wb="qa"></label></div><button type="button" class="text-button" data-wb="find">Find linked Quality</button><div data-wb="guidance" class="note-text"></div><div data-wb="linked"></div>'+
      '<details><summary>Prefill from an already completed review</summary><label class="field">Actual Quality verdict<select data-wb="verdict"><option value="">Choose the actual verdict</option><option value="pass">PASS</option><option value="revise">REVISE</option><option value="blocked">BLOCKED</option></select></label>'+
      '<label class="field">Original completed Quality finding<textarea data-wb="finding" rows="3" maxlength="18000" spellcheck="false"></textarea></label><label class="field">Factual transcription correction (optional)<textarea data-wb="correction" rows="2" maxlength="3000" spellcheck="false"></textarea></label>'+
      '<p class="quiet-note">Paste the actual finding and verified corrections verbatim, including complete dates and URLs. A correction is appended as a separate note in the new Quality result; the generated assignment brief stays intact. Submitted or accepted results cannot be replaced here.</p></details>'+
      '<button type="button" class="text-button" data-wb="template">Load exact pair and template</button>'+
      '<p class="quiet-note">Revenue accepts the Quality artifact as valid evidence, even when its verdict is REVISE. That does not accept the source: REVISE or BLOCKED returns the source for correction. Complete the actual reviewer, original completion time, artifact, Revenue recorder, decision notes and evidence checks below. Nothing is pre-approved.</p>'+
      '<details open><summary>Exact source and Quality evidence</summary><pre data-wb="pair" class="note-text"></pre></details>'+
      '<label class="field">Completed team review JSON<textarea data-wb="input" maxlength="60000" rows="12" spellcheck="false"></textarea></label>'+
      '<label class="checkbox"><input type="checkbox" data-wb="independent"> The actual Quality reviewer worked independently of the source author.</label>'+
      '<label class="checkbox"><input type="checkbox" data-wb="exact"> The actual review covers this exact source result, evidence, recipient and scope.</label>'+
      '<div class="actions"><button type="button" class="button" data-wb="prepare">Preview completed review</button><button type="button" class="button primary" data-wb="submit" disabled>Record completed team review</button></div>'+
      '<div class="actions"><button type="button" class="text-button" data-wb="reconcile">Check saved receipt</button><button type="button" class="text-button" data-wb="abandon">Close unsent preparation</button></div>'+
      '<p data-wb="notice" role="status" style="white-space:pre-wrap;overflow-wrap:anywhere"></p><pre data-wb="output" class="note-text" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre>';
    const el=name=>root.querySelector('[data-wb="'+name+'"]');
    function valid(){const s=data.status();return active&&root.isConnected&&s.uid===initial.uid&&s.epoch===initial.epoch;}
    function freeze(){if(!active)return;active=false;root.querySelectorAll('input,textarea,select,button').forEach(x=>x.disabled=true);for(const name of ['register','pair','output','guidance','linked'])el(name).textContent='';for(const name of ['input','finding','correction']){el(name).disabled=false;el(name).readOnly=true;}el('notice').textContent='Account changed. The original-account draft is retained read-only; copy it if needed. Reopen in the original account to reconcile its retained operation.';}
    const unsubscribe=data.subscribe(()=>{if(active&&!valid())freeze();});
    async function run(work){
      if(inFlight||!valid())return;inFlight=true;
      root.querySelectorAll('button,input,textarea,select').forEach(x=>x.disabled=true);
      try{const result=await work();if(valid())el('output').textContent=JSON.stringify(result,null,2);}
      catch(e){if(valid()){el('notice').textContent=e.message;el('submit').dataset.ready='';}}
      finally{inFlight=false;if(valid()){root.querySelectorAll('button,input,textarea,select').forEach(x=>x.disabled=false);el('submit').disabled=el('submit').dataset.ready!=='yes';}else freeze();}
    }
    function invalidate(){el('submit').dataset.ready='';el('submit').disabled=true;}
    function showPath(state,sourceId,qaId){
      const path=reviewPath(state,sourceId,qaId);el('guidance').textContent=path.reason;el('linked').replaceChildren();
      for(const row of path.linked){
        const item=document.createElement('p'),label=document.createElement('span'),use=document.createElement('button');
        label.textContent=row.qaId+' · '+row.status+' · result version '+row.resultVersion+' · '+row.reason+' ';
        use.type='button';use.className='text-button';use.textContent='Use this Quality assignment';use.onclick=()=>{el('qa').value=row.qaId;invalidate();el('guidance').textContent=row.reason;el('notice').textContent='Selection changed; load the exact pair to replace the retained JSON draft.';};item.append(label,use);el('linked').append(item);
      }
      const id=path.selected?.qaId||sourceId;if(state.tasks.some(t=>t.id===id)){const link=document.createElement('a');link.className='text-button';link.href='#team/task/'+encodeURIComponent(id);link.textContent=path.selected?'Open selected Quality assignment':'Open source assignment';el('linked').append(link);}
      return path;
    }
    el('find').onclick=()=>run(async()=>{invalidate();const snapshot=await controller.readRegister();if(valid())return showPath(snapshot.state,el('source').value.trim(),el('qa').value.trim());});
    el('refresh').onclick=()=>run(async()=>{const snapshot=await controller.readRegister(),tasks=classify(snapshot.state);if(valid()){el('register').textContent=JSON.stringify({uid:snapshot.uid,observedAt:snapshot.observedAt,revision:snapshot.state.revision,queuePaused:snapshot.state.paused,tasks},null,2);el('notice').textContent='Fresh server read at '+snapshot.observedAt+' · revision '+snapshot.state.revision+' · all '+tasks.length+' tasks. Sending HOLD and unavailable usage do not exclude existing review or receipt recovery.';}return {uid:snapshot.uid,observedAt:snapshot.observedAt,revision:snapshot.state.revision,serverConfirmed:snapshot.serverConfirmed,taskCount:tasks.length,retainedOperation:controller.pending()};});
    el('template').onclick=()=>run(async()=>{
      invalidate();const snapshot=await controller.readRegister(),sourceId=el('source').value.trim(),qaId=el('qa').value.trim();
      if(!valid())return;
      const path=showPath(snapshot.state,sourceId,qaId);
      el('pair').textContent=JSON.stringify(snapshot.state.tasks.filter(t=>t.id===sourceId||t.id===qaId&&t.role==='review'&&t.parentTaskId===sourceId),null,2);
      el('independent').checked=false;el('exact').checked=false;
      if(!path.selected?.eligible)fail(path.reason);
      const input=template(snapshot.state,sourceId,qaId,{verdict:el('verdict').value,finding:el('finding').value,correction:el('correction').value});
      el('input').value=JSON.stringify(input,null,2);el('notice').textContent='Template only. Record the original review facts and explicit Revenue checks before previewing.';return {revision:snapshot.state.revision};
    });
    el('prepare').onclick=()=>run(async()=>{const result=await controller.prepare(el('input').value,{independent:el('independent').checked,exactSource:el('exact').checked});if(valid()){el('submit').dataset.ready='yes';el('notice').textContent='Prepared only. Review the exact request below before recording it.';}return result;});
    el('submit').onclick=()=>run(async()=>{el('submit').dataset.ready='';const result=await controller.submit();if(valid())el('notice').textContent=result.status==='confirmed'?'Server-confirmed completed review saved.':'Save is unconfirmed. Keep this operation and check its receipt.';return result;});
    el('reconcile').onclick=()=>run(async()=>{el('submit').dataset.ready='';return controller.reconcile();});
    el('abandon').onclick=()=>run(async()=>{el('submit').dataset.ready='';return controller.closeUnsent();});
    for(const name of ['input','source','qa','finding','correction'])el(name).oninput=invalidate;
    for(const name of ['independent','exact','verdict'])el(name).onchange=invalidate;
    return {destroy(){active=false;if(typeof unsubscribe==='function')unsubscribe();}};
  }
  return {create,template,classify,reviewPath,preflight,mount};
}));
