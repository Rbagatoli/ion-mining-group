/* Private site requests. A stored brief, a CRM draft and an observed handoff are separate facts. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.ProtonCrmIntakeInbox=api;}(typeof window==='undefined'?globalThis:window,function(root){
  'use strict';
  const SERVICES={custom_search:'Find a site',site_review:'Review an existing site',site_submission:'Submit or refer a site'};
  const escape=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function taskId(record){
    if(!/^REQ-[a-f0-9-]{36}$/i.test(record?.id||''))throw Error('This request has no valid durable identity.');
    const revision=Number(record.briefRevision||1);if(!Number.isSafeInteger(revision)||revision<1)throw Error('Invalid brief version.');
    return 'intake_'+record.id.replace(/[^a-z0-9_-]/gi,'')+'_v'+revision;
  }
  function sameTask(task,draft){return !!task&&task.id===draft.id&&task.title===draft.title&&task.role===draft.role&&task.brief===draft.brief;}
  function endpoint(config){
    const value=typeof config==='string'?config:config?.endpoint||'';if(!value)return '';
    const u=new URL(value);if(u.username||u.password||u.search||u.hash||u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))throw Error('The private request service URL is invalid.');
    return u.href.replace(/\/$/,'');
  }
  function create(options){
    const D=options.D,E=options.E||root.ProtonCrmEnergyScouting,esc=options.esc||escape,fetcher=options.fetch||root.fetch.bind(root);
    const model=()=>options.model||root.ProtonSourcingModel,auth=()=>options.auth||root.firebase?.auth(),configuration=()=>options.config||root.ProtonIntakeConfig||{};
    let host=null,generation=0,owner=null,busy=false,records=[],metrics=null,selected=null,cursor=null,loaded=false,notice='',loadError='';
    const drafts=new Map();
    const uid=()=>D.status().uid;
    function stamp(){const s=D.status();if(!s.uid||!s.ready||s.error)throw Error(s.error||'Sign in to the Proton owner account to view private requests.');const user=auth()?.currentUser;if(!user||user.uid!==s.uid)throw Error('Wait for the signed-in account to connect.');return {uid:s.uid,epoch:s.epoch,user};}
    function assertAccount(s){const current=D.status();if(current.uid!==s.uid||current.epoch!==s.epoch||auth()?.currentUser?.uid!==s.uid)throw Error('The account changed. This request was not continued in the new account. Your draft is retained for the original account during this session.');}
    function cloud(s){assertAccount(s);if(D.status().agent?.mode!=='cloud')throw Error('Wait for the confirmed cloud CRM connection before creating or linking an assignment.');}
    async function api(path,{method='GET',body}={},captured){
      const s=captured||stamp(),base=endpoint(configuration());if(!base)throw Error('Private intake is not connected. Email energy@protonminingco.com directly.');
      assertAccount(s);const token=await s.user.getIdToken();assertAccount(s);
      const response=await fetcher(base+path,{method,headers:{Accept:'application/json',Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},cache:'no-store',credentials:'omit',redirect:'error',...(body?{body:JSON.stringify(body)}:{})});assertAccount(s);
      let data;try{data=await response.json();}catch(_){throw Error('The private request service did not return a receipt. Keep this draft and retry.');}assertAccount(s);
      if(!response.ok){const e=new Error(data.error?.message||'The request could not be confirmed. Keep this draft and retry.');e.code=data.error?.code;e.status=response.status;throw e;}
      return data;
    }
    function synchronizeOwner(){const current=uid();if(owner!==current){owner=current;records=[];metrics=null;selected=null;cursor=null;loaded=false;loadError='';notice='';generation++;}}
    function key(kind){return String(owner)+'/'+selected?.id+'/'+kind;}
    function draft(kind){const k=key(kind);if(!drafts.has(k))drafts.set(k,{actionId:root.crypto.randomUUID(),expectedRevision:selected.revision,values:{},stamp:D.snapshot()});return drafts.get(k);}
    function setRecord(r){selected=r;const at=records.findIndex(v=>v.id===r.id);if(at<0)records.unshift(r);else records[at]=r;}
    async function refresh(append=false){
      synchronizeOwner();const s=stamp(),g=generation;loadError='';
      const page=await api('/v1/requests?limit=50'+(append&&cursor?'&cursor='+encodeURIComponent(cursor):''),{},s);assertAccount(s);if(g!==generation)return;
      records=append?[...records,...page.requests.filter(r=>!records.some(x=>x.id===r.id))]:page.requests;cursor=page.nextCursor;loaded=true;
      try{metrics=await api('/v1/metrics',{},s);}catch(e){loadError='Requests loaded; totals could not be refreshed. '+e.message;}if(g===generation)draw();
    }
    async function open(id){const s=stamp();const data=await api('/v1/requests/'+encodeURIComponent(id),{},s);setRecord(data.request);notice='';draw();}
    function values(form){const out={};for(const field of form.elements){if(!field.name||['submit','button','reset'].includes(field.type)||['checkbox','radio'].includes(field.type)&&!field.checked)continue;out[field.name]=field.value;}return out;}
    async function mutate(kind,fields){
      const s=stamp(),r=selected,d=draft(kind);
      if(kind==='acknowledge'&&r.queue?.taskOwnerUid!==s.uid)throw Error('Record the handoff from the original CRM owner account.');
      const body=d.payload||(d.payload={actionId:d.actionId,expectedRevision:d.expectedRevision,type:kind,...fields});
      if(JSON.stringify({...body,...fields})!==JSON.stringify(body))throw Error('This attempted save has retained its original values. Reopen the request before making a different decision.');
      let result;try{result=await api('/v1/requests/'+encodeURIComponent(r.id)+'/actions',{method:'POST',body},s);}catch(e){d.failedStatus=e.status;if([400,422].includes(e.status))d.payload=null;throw e;}assertAccount(s);setRecord(result.request);drafts.delete(String(s.uid)+'/'+r.id+'/'+kind);notice=result.duplicate?'This exact action was already saved; no duplicate was created.':'Request record saved.';draw();return result;
    }
    async function queue(){
      const s=stamp();cloud(s);const current=await api('/v1/requests/'+encodeURIComponent(selected.id),{},s);assertAccount(s);
      if(current.request.service==='site_submission')throw Error('Supply submissions are qualified and linked to a physical site; they do not create a customer research assignment.');
      const r=current.request,d=Object.assign({},model().researchDraft(r,{page:'https://protonminingco.com/crm/#requests'}),{id:taskId(r)});
      const exists=D.agent().tasks.find(t=>t.id===d.id);if(exists&&!sameTask(exists,d))throw Error('That task identity already contains different work. Reconcile the exact request and task before proceeding.');
      if(r.queue?.state!=='not_queued'){
        if(r.queue?.taskOwnerUid!==s.uid)throw Error('This queue link belongs to another or unrecorded CRM owner account. Verify the original account before reconciling its task.');
        if(r.queue?.taskId===d.id&&sameTask(exists,d)){setRecord(r);notice='The exact CRM draft is already linked. No second assignment was created.';draw();return;}
        throw Error('This request has a different queue record. Reconcile it before making another assignment.');
      }
      // Keep the record revision from the original form. Never silently rebase a pending decision.
      if(r.revision!==selected.revision)throw Error('The request changed while this panel was open. Your draft is retained; reopen the current request.');
      if(!exists){
        try{await D.dispatch('task.add',d,D.agent().revision);}catch(e){assertAccount(s);if(!sameTask(D.agent().tasks.find(t=>t.id===d.id),d))throw e;}
      }
      cloud(s);if(!sameTask(D.agent().tasks.find(t=>t.id===d.id),d))throw Error('The save has not yet appeared as the exact CRM record. Reopen and retry after cloud confirmation; the deterministic ID prevents a duplicate.');
      return mutate('queue',{taskId:d.id,briefId:model().requestRef(r).briefId,note:'Exact research draft saved in the owner CRM. This does not invoke a bot.'});
    }
    const label=value=>String(value).replace(/([A-Z])/g,' $1').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
    const show=value=>value==null||value===''?'Not supplied':Array.isArray(value)?value.map(show).join(', ')||'Not supplied':typeof value==='object'?Object.entries(value).map(([k,v])=>label(k)+': '+show(v)).join(' · '):String(value);
    const fact=(name,value)=>'<div><dt>'+esc(name)+'</dt><dd>'+esc(show(value))+'</dd></div>';
    function form(kind,title,body,button){const d=draft(kind);const stale=d.expectedRevision!==selected.revision;return '<form data-intake-form="'+kind+'" class="intake-form"><h3>'+title+'</h3>'+body+(stale?'<p class="quiet-note">This draft still targets record revision '+esc(d.expectedRevision)+'. The record is now revision '+esc(selected.revision)+'. Review the changed record before starting a new decision.</p><button class="text-button" data-intake="fresh" data-kind="'+kind+'" type="button">Start a new decision using this record</button>':'')+(['site-link','assessment'].includes(kind)?'<button class="text-button" data-intake="fresh" data-kind="'+kind+'" type="button">Use the current saved site records</button>':'')+'<button class="button" type="submit"'+(busy?' disabled':'')+'>'+button+'</button><p class="quiet-note" data-intake-error="'+kind+'" role="alert"></p></form>';}
    function input(kind,name,title,type='text',extra=''){const v=draft(kind).values[name]||'';return '<label>'+title+'<input name="'+name+'" type="'+type+'" value="'+esc(v)+'" '+extra+'></label>';}
    function area(kind,name,title){const v=draft(kind).values[name]||'';return '<label>'+title+'<textarea name="'+name+'" required maxlength="'+(name==='note'?1600:2000)+'">'+esc(v)+'</textarea></label>';}
    function detail(){
      if(!selected)return '<section class="panel intake-detail"><div class="panel-body"><h2>Select a received request</h2><p class="quiet-note">Open a brief to qualify it, record a decision and prepare the next handoff.</p></div></section>';
      const r=selected,p=r.payload||{},b=p.brief||{},contact=p.contact||{},q=r.queue||{},service=r.service||p.service;
      let html='<section class="panel intake-detail"><div class="panel-body"><div class="intake-detail-head"><div><p class="eyebrow">'+esc(SERVICES[service]||service)+'</p><h2>'+esc(contact.company||contact.name||r.id)+'</h2></div><button class="text-button" data-intake="reopen" type="button">Reload record</button></div><p class="quiet-note">'+esc(r.id)+' · Brief v'+esc(r.briefRevision||1)+' · Record revision '+esc(r.revision)+'</p><div class="intake-state"><span>'+esc(label(r.status))+'</span><span>'+esc({not_queued:'No assignment',draft_saved:'CRM draft saved',acknowledged:'Handoff evidence recorded'}[q.state]||'Queue state unknown')+'</span></div><dl class="fact-list">'+fact('Received',r.receivedAt)+fact('Contact',contact)+fact('Routing inbox',r.routeEmail)+fact('Email notification',r.notification?.status||'Not recorded')+'</dl><details open><summary>Customer brief</summary><dl class="fact-list">'+Object.entries(b).map(([k,v])=>fact(label(k),v)).join('')+'</dl></details><details><summary>Acquisition source</summary><dl class="fact-list">'+fact('Recorded source',p.attribution)+'</dl></details>';
      html+='<p class="quiet-note">Qualification records service fit. It does not confirm owner interest, power availability, client terms or a signed engagement.</p>';
      if(r.status==='received')html+=form('qualify','Qualify this request',area('qualify','note','Why does the brief fit the service?'),'Record qualified');
      if(r.status==='received')html+=form('reject','Decline this request',area('reject','note','Reason and useful next step'),'Record declined');
      if(service==='site_submission')html+='<p class="quiet-note">This is a supply opportunity. Verify the submitting party’s authority and link the exact existing physical-site record below; customer research is a separate assignment.</p>';
      else if(r.status==='qualified'&&q.state==='not_queued')html+='<div class="intake-next"><h3>Prepare research</h3><p class="quiet-note">Creates one draft Supply assignment for this exact brief. Revenue still prepares and hands off the assignment; this button does not start a native bot.</p><button class="button" type="button" data-intake="queue"'+(busy?' disabled':'')+'>Save research draft</button></div>';
      if(q.taskId)html+='<p class="quiet-note">Assignment '+(q.taskOwnerUid===owner?'<a href="#team/task/'+encodeURIComponent(q.taskId)+'">'+esc(q.taskId)+'</a>':esc(q.taskId)+' · verify its original CRM owner account')+'</p>';
      if(q.state==='draft_saved'&&q.taskOwnerUid===owner)html+=form('acknowledge','Record an observed handoff',input('acknowledge','acknowledgedBy','Who actually acknowledged receipt?','text','required maxlength="180"')+input('acknowledge','acknowledgedAt','When did they acknowledge?','datetime-local','required')+area('acknowledge','evidence','Original receipt or observed acknowledgment evidence')+area('acknowledge','note','Handoff context')+'<p class="quiet-note">Record actual receipt only. A CRM draft, copied prompt or open bot window is not acknowledgment.</p>','Record acknowledgment');
      if(q.state==='acknowledged')html+='<dl class="fact-list">'+fact('Acknowledged by',q.acknowledgedBy)+fact('Observed at',q.acknowledgedAt)+fact('Evidence',q.evidence)+'</dl>';
      const linking=siteForm();if(linking)html+='<details class="intake-extra"><summary>'+(service==='site_submission'?'Link a physical site & source contact':'Link a site & record this client’s assessment')+'</summary>'+linking+'</details>';
      if(r.history?.length)html+='<details><summary>Request history</summary>'+r.history.map(h=>'<p class="quiet-note">'+esc(show(h))+'</p>').join('')+'</details>';
      return html+'</div></section>';
    }
    function choose(kind,name,title,choices,initial=''){const value=draft(kind).values[name]??initial;return '<label>'+title+'<select name="'+name+'">'+choices.map(([id,text])=>'<option value="'+esc(id)+'"'+(String(value)===String(id)?' selected':'')+'>'+esc(text)+'</option>').join('')+'</select></label>';}
    function siteForm(){
      if(!model()?.siteRecord)return '';const sites=D.sites();if(!sites.length)return '<p class="quiet-note">Save the physical site in the pipeline before linking this request. No site is created or matched from a similar name.</p>';
      if(selected.service!=='site_submission')return assessmentForm(sites);
      const kind='site-link',d=draft(kind),p=selected.payload||{},c=p.contact||{};
      if(!d.initialized){d.values={...d.values,partnerId:'inbound_'+selected.id.replace(/[^a-z0-9_-]/gi,''),partnerName:c.company||c.name||'',originatingSource:p.attribution?.source||'Private inbound request',sourceReference:selected.id,contactRoute:[c.name,c.email,c.phone].filter(Boolean).join(' · ')};d.initialized=true;}
      return form(kind,'Link the exact physical site',choose(kind,'siteId','Existing saved site',[['','Select the exact physical site'],...sites.map(s=>[s.id,s.name+' · '+s.id])])+input(kind,'partnerId','Partner / source contact reference','text','required maxlength="180"')+input(kind,'partnerName','Partner or contact name','text','required maxlength="180"')+choose(kind,'partnerKind','Submitting party’s role',[['unknown','Unconfirmed'],['owner','Owner'],['operator','Operator'],['intermediary','Intermediary'],['referrer','Referrer']])+input(kind,'originatingSource','Originating source','text','required maxlength="500"')+input(kind,'sourceReference','Source or request evidence','text','required maxlength="2000"')+choose(kind,'authority','Authority evidence',[['unverified','Not verified'],['owner','Ownership evidenced'],['operator','Operator authority evidenced'],['mandated','Mandate evidenced']])+input(kind,'authorityEvidence','Authority evidence reference, if verified','text','maxlength="2000"')+input(kind,'contactRoute','Contact route as supplied','text','required maxlength="1000"')+input(kind,'lastConfirmedAt','Last actually confirmed, if known','date')+area(kind,'introductionTerms','Introduction terms or explicit unknowns')+input(kind,'recordedBy','Recorded by','text','required maxlength="180"')+'<p class="quiet-note">This adds a source route to the selected site. It does not merge nearby records, certify authority or qualify the site for a client.</p>','Save source route');
    }
    async function linkSite(fields){
      const s=stamp();cloud(s);if(selected.service!=='site_submission')throw Error('Customer briefs link to client assessments, not an assumed supply contact.');const d=draft('site-link');if(!fields.siteId)throw Error('Select the exact existing physical site.');const site=D.sites().find(v=>String(v.id)===String(fields.siteId));if(!site)throw Error('That saved site no longer exists.');
      const payload={...fields,id:'intake_'+selected.id.replace(/[^a-z0-9_-]/gi,''),requestId:selected.id,lastConfirmedAt:fields.lastConfirmedAt||null};delete payload.siteId;
      const provenance=model().siteRecord(site.custom_fields?.sourcing,{type:'route.upsert',payload},{siteId:site.id,now:new Date().toISOString()});
      await D.saveSite(site.id,{custom_fields:{...site.custom_fields,sourcing:provenance}},d.stamp);assertAccount(s);drafts.delete(key('site-link'));notice='Source route saved to the exact physical site. Check CRM sync status for cloud confirmation.';draw();
    }
    function researchFacet(r){
      const missing={status:'not_started',reference:'',confirmedAt:null};if(r.queue?.taskOwnerUid!==owner||!r.queue?.taskId)return missing;
      const task=D.agent().tasks.find(t=>t.id===r.queue.taskId);if(!task)return missing;
      let expected;try{expected={...model().researchDraft(r,{page:'https://protonminingco.com/crm/#requests'}),id:taskId(r)};}catch(_){return missing;}if(!sameTask(task,expected))return missing;
      const reference='CRM task '+task.id+'; recorded workflow status '+task.status,confirmedAt=task.updatedAt;
      if(!confirmedAt||!['working','review','done','blocked'].includes(task.status))return missing;
      if(!['review','done'].includes(task.status)||!task.result||!Number.isSafeInteger(task.resultVersion)||task.resultVersion<1)return {status:'in_progress',reference,confirmedAt,taskId:task.id};
      const evidence={status:'completed',reference:reference+'; result version '+task.resultVersion,confirmedAt,taskId:task.id,resultVersion:task.resultVersion};
      const qa=(options.agentModel||root.AgentControlModel)?.reviewEvidence?.(D.agent(),task)?.find(q=>q.qualityVerdict==='pass');
      if(task.status==='done'&&qa){evidence.status='independently_reviewed';evidence.reviewTaskId=qa.id;evidence.reference+='; independent accepted QA '+qa.id;}
      return evidence;
    }
    function assessmentForm(sites){
      const kind='assessment',facet=(name,title,choices)=>choose(kind,name+'Status',title,choices)+input(kind,name+'Reference',title+' evidence reference','text','maxlength="3000"')+input(kind,name+'Date',title+' evidence date','date');
      const body=choose(kind,'siteId','Existing saved site',[['','Select the exact physical site'],...sites.map(s=>[s.id,s.name+' · '+s.id])])+facet('ownerInterest','Owner interest',[['unknown','Unknown'],['open_to_discuss','Willing to discuss — evidence required'],['declined','Declined — evidence required']])+facet('terms','Commercial terms',[['unknown','Unknown'],['indicative','Indicative — evidence required'],['documented','Documented — evidence required']])+facet('clientFit','Fit for this client',[['unassessed','Not assessed'],['unresolved','Unresolved — evidence required'],['potential_fit','Potential fit — evidence required'],['mismatch','Mismatch — evidence required']])+input(kind,'recordedBy','Recorded by','text','required maxlength="180"')+area(kind,'notes','Assessment notes and unresolved questions')+'<p class="quiet-note">Research: '+esc(label(researchFacet(selected).status))+'. This is read from the exact linked CRM task when available. Owner interest, terms and client fit each need their own evidence.</p>';
      return form(kind,'Record this client’s site assessment',body,'Save client assessment');
    }
    async function linkAssessment(fields){
      const s=stamp();cloud(s);if(selected.service==='site_submission')throw Error('A supply submission is not a customer brief.');const d=draft('assessment'),site=D.sites().find(v=>String(v.id)===String(fields.siteId));if(!fields.siteId||!site)throw Error('Select the exact existing physical site.');
      const facet=name=>({status:fields[name+'Status'],reference:fields[name+'Reference']||'',confirmedAt:fields[name+'Date']||null});
      const payload={id:'assessment_'+selected.id.replace(/[^a-z0-9_-]/gi,'')+'_v'+(selected.briefRevision||1),requestId:selected.id,briefRevision:selected.briefRevision||1,recordedBy:fields.recordedBy,notes:fields.notes,research:researchFacet(selected),ownerInterest:facet('ownerInterest'),terms:facet('terms'),clientFit:facet('clientFit')};
      const provenance=model().siteRecord(site.custom_fields?.sourcing,{type:'assessment.record',payload},{siteId:site.id,now:new Date().toISOString()});
      await D.saveSite(site.id,{custom_fields:{...site.custom_fields,sourcing:provenance}},d.stamp);assertAccount(s);drafts.delete(key('assessment'));notice='Client-specific assessment saved to the selected site. Other clients and source routes are preserved.';draw();
    }
    function content(){
      synchronizeOwner();let configured=false;try{configured=!!endpoint(configuration());}catch(e){loadError=e.message;}
      if(!configured)return '<section class="panel"><div class="panel-body"><h2>Private intake is not connected</h2><p>There is no confirmed online receiving service configured. No request is treated as received here.</p><p class="quiet-note">Use <a href="mailto:energy@protonminingco.com">energy@protonminingco.com</a> while the private endpoint is being configured.</p></div></section>';
      if(!owner)return '<section class="panel"><div class="panel-body"><h2>Sign in to view private requests</h2><p class="quiet-note">Only the configured Proton owner account can access this inbox.</p></div></section>';
      const m=metrics;let html='<div class="intake-toolbar"><p class="quiet-note">Private receiving queue · no automatic outreach or bot execution</p><button class="text-button" data-intake="refresh" type="button">Refresh inbox</button></div>';
      if(m)html+='<div class="intake-metrics">'+[['Received',m.receivedTotal],['Qualified',m.qualifiedTotal],['CRM drafts',m.queueDrafts],['Acknowledged',m.acknowledged]].map(([name,n])=>'<div><strong>'+esc(n)+'</strong><span>'+name+'</span></div>').join('')+'</div>';
      if(m?.bySource?.length)html+='<details class="intake-sources"><summary>Where requests came from</summary><div class="table-wrap"><table><thead><tr><th>Recorded source</th><th>Received</th><th>Qualified</th></tr></thead><tbody>'+m.bySource.map(row=>'<tr><td>'+esc(row.source||'Unknown')+'</td><td>'+esc(row.received)+'</td><td>'+esc(row.qualified)+'</td></tr>').join('')+'</tbody></table></div><p class="quiet-note">Counts refer to stored requests and recorded qualification, not page visits or draft opens.</p></details>';
      html+='<p class="intake-notice" role="status">'+esc(notice)+'</p><p class="intake-error" role="alert">'+esc(loadError)+'</p><div class="intake-columns"><section class="panel intake-list"><div class="panel-head"><h2>Received requests</h2></div>';
      html+=records.length?records.map(r=>'<button class="intake-row'+(selected?.id===r.id?' is-selected':'')+'" type="button" data-intake="open" data-request="'+esc(r.id)+'"><strong>'+esc(r.payload?.contact?.company||r.payload?.contact?.name||r.id)+'</strong><span>'+esc(SERVICES[r.service]||r.service)+' · '+esc(label(r.status))+'</span><small>'+esc(r.receivedAt)+'</small></button>').join(''):'<p class="quiet-note panel-body">'+(loaded?'No received requests.':'Load the private inbox to see confirmed receipts.')+'</p>';
      if(cursor)html+='<button class="text-button intake-more" data-intake="more" type="button">Load more</button>';
      return html+'</section>'+detail()+'</div>';
    }
    function draw(){if(host){host.innerHTML=content();if(busy)host.querySelectorAll('button,input,textarea,select').forEach(el=>{el.disabled=true;});}}
    function failure(error,kind){loadError=error.message;if(host){const target=kind&&host.querySelector('[data-intake-error="'+kind+'"]')||host.querySelector('.intake-error');if(target)target.textContent=error.message;}}
    function unlock(){busy=false;if(host)host.querySelectorAll('button:disabled,input:disabled,textarea:disabled,select:disabled').forEach(b=>{b.disabled=false;});}
    async function click(event){const el=event.target.closest('[data-intake]');if(!el||!host?.contains(el)||busy)return;event.preventDefault();const action=el.dataset.intake;busy=true;el.disabled=true;try{if(action==='refresh')await refresh();if(action==='more')await refresh(true);if(action==='open')await open(el.dataset.request);if(action==='reopen')await open(selected.id);if(action==='queue')await queue();if(action==='fresh'){const k=key(el.dataset.kind),old=drafts.get(k);drafts.delete(k);draft(el.dataset.kind).values=old?.values||{};notice='A new decision draft now targets the displayed record revision. Previous field values were preserved.';draw();}}catch(e){failure(e);}finally{unlock();}}
    async function submit(event){const form=event.target.closest('[data-intake-form]');if(!form||busy)return;event.preventDefault();const kind=form.dataset.intakeForm,v=values(form);draft(kind).values=v;busy=true;form.querySelector('button[type="submit"]').disabled=true;try{if(kind==='site-link')await linkSite(v);else if(kind==='assessment')await linkAssessment(v);else if(kind==='acknowledge'){const at=new Date(v.acknowledgedAt);if(!Number.isFinite(at.getTime())||at.getTime()>Date.now())throw Error('Record the actual acknowledgment time, no later than now.');await mutate(kind,{...v,taskId:selected.queue.taskId,acknowledgedAt:at.toISOString()});}else await mutate(kind,v);}catch(e){failure(e,kind);}finally{unlock();}}
    function capture(event){
      const form=event.target.closest('[data-intake-form]');if(!form)return;const kind=form.dataset.intakeForm,d=draft(kind),priorSite=d.values.siteId;d.values=values(form);
      if(event.target.name!=='siteId'||priorSite===d.values.siteId||!['site-link','assessment'].includes(kind))return;
      const site=D.sites().find(s=>String(s.id)===String(d.values.siteId)),p=site?.custom_fields?.sourcing;
      const saved=kind==='site-link'?p?.routes?.find(r=>r.id==='intake_'+selected.id.replace(/[^a-z0-9_-]/gi,'')):p?.assessments?.find(a=>a.requestId===selected.id&&String(a.briefRevision)===String(selected.briefRevision||1));
      if(saved){
        if(kind==='site-link')for(const name of ['partnerId','partnerName','partnerKind','originatingSource','sourceReference','authority','authorityEvidence','contactRoute','lastConfirmedAt','introductionTerms','recordedBy'])d.values[name]=name==='lastConfirmedAt'?(saved[name]||'').slice(0,10):saved[name]||'';
        else{for(const name of ['ownerInterest','terms','clientFit']){d.values[name+'Status']=saved[name].status;d.values[name+'Reference']=saved[name].reference;d.values[name+'Date']=(saved[name].confirmedAt||'').slice(0,10);}d.values.recordedBy=saved.recordedBy;d.values.notes=saved.notes;}
      }else if(kind==='assessment'){
        for(const name of ['ownerInterest','terms','clientFit']){d.values[name+'Status']=name==='clientFit'?'unassessed':'unknown';d.values[name+'Reference']='';d.values[name+'Date']='';}d.values.notes='';
      }else{
        d.values.authority='unverified';d.values.authorityEvidence='';d.values.lastConfirmedAt='';
      }
      d.stamp=D.snapshot();draw();const extra=host?.querySelector('.intake-extra');if(extra)extra.open=true;
    }
    function dispose(){if(host){if(selected&&owner===uid())host.querySelectorAll('[data-intake-form]').forEach(form=>{draft(form.dataset.intakeForm).values=values(form);});host.removeEventListener('click',click);host.removeEventListener('submit',submit);host.removeEventListener('input',capture);host.removeEventListener('change',capture);}host=null;generation++;}
    function mount(target){dispose();host=target.querySelector('[data-intake-root]')||target;host.addEventListener('click',click);host.addEventListener('submit',submit);host.addEventListener('input',capture);host.addEventListener('change',capture);draw();try{if(owner&&!loaded&&endpoint(configuration()))refresh().catch(e=>failure(e));}catch(e){failure(e);}}
    D.subscribe?.(()=>{if(owner!==uid()){synchronizeOwner();draw();}});
    return {html:()=>'<div class="page-head"><div><p class="eyebrow">Site sourcing</p><h1>Requests.</h1><p>Receive a brief. Qualify the work. Track its handoff.</p></div></div><div class="intake-inbox" data-intake-root></div>',mount,dispose,refresh,open,mutate,queue,api,linkSite,linkAssessment,select:record=>{synchronizeOwner();setRecord(record);},state:()=>({records,selected,metrics,notice,loadError})};
  }
  return {create,taskId,sameTask,endpoint,SERVICES};
}));
