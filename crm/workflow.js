/* Read-only workflow projection. Progress comes from saved stages and explicit task links. */
(function(root,factory){
  const api=typeof module==='object'&&module.exports?factory(require('../agent-control-model')):factory(root.AgentControlModel);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.ProtonCrmWorkflow=api;
}(typeof window!=='undefined'?window:globalThis,function(A){
  'use strict';
  const steps=[['research','Research'],['qualify','Check fit'],['draft','Draft message'],['review','Review draft'],['contact','Contact'],['conversation','Conversation']];
  const pilotSteps=['Research candidates','Check candidate fit','Prepare messages','Review messages'];
  const active=t=>!['done','cancelled'].includes(t.status);
  const role=id=>(A.ROLES.find(r=>r.id===id)||{name:'Revenue Lead'}).name;
  const stamp=t=>t.updatedAt||t.startedAt||'';
  function linkedTasks(lead,state){
    const tasks=state.tasks||[],ids=new Set();
    const escaped=String(lead.id).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const explicit=new RegExp('(?:Lead ID:\\s*|#pipeline/lead/)'+escaped+'(?=$|[\\s?#/)])','i');
    tasks.forEach(t=>{if(t.leadId===lead.id||explicit.test(t.brief||'')||(t.sources||[]).some(u=>explicit.test(u)))ids.add(t.id);});
    // A review inherits its source's explicit lead link. Never match a company name or a domain.
    for(let n=0;n<tasks.length;n++){let changed=false;tasks.forEach(t=>{if(t.parentTaskId&&ids.has(t.parentTaskId)&&!ids.has(t.id)){ids.add(t.id);changed=true;}});if(!changed)break;}
    return tasks.filter(t=>ids.has(t.id)).sort((a,b)=>stamp(b).localeCompare(stamp(a))||a.id.localeCompare(b.id));
  }
  function hold(state){
    const latest=(state.tasks||[]).filter(t=>/^PM-LOOP-\d+ operating charter/i.test(t.title||'')&&t.status!=='cancelled').sort((a,b)=>stamp(b).localeCompare(stamp(a)))[0];
    return latest&&/OWNER HOLD[\s\S]*NO actual outreach until/i.test(latest.brief||'')?latest:null;
  }
  function taskMeaning(task,state){
    const qa=(state.tasks||[]).find(t=>t.parentTaskId===task.id&&t.role==='review'&&active(t));
    const meanings={draft:['Not queued','Revenue Lead','Confirm prerequisites, then queue this assignment.'],ready:['Queued',role(task.role),'Waiting for the next coordinator check.'],working:['Work reported',role(task.role),'Save a result and the next action.'],review:qa?['Result saved','Quality Review','Check the linked result before accepting it.']:['Awaiting review','Reviewer','Review the evidence and accept it or request corrections.'],blocked:['Blocked','Revenue Lead',task.blocker||'Resolve the recorded blocker.'],done:['Result accepted','Revenue Lead','Move to the next eligible assignment.'],cancelled:['Cancelled','Revenue Lead','Choose another assignment if work is still needed.']};
    const [label,owner,next]=meanings[task.status]||['Status unknown','Revenue Lead','Check the saved assignment.'];
    return {label,owner,next,qa};
  }
  function leadProgress(lead,state){
    const tasks=linkedTasks(lead,state),current=tasks.find(t=>t.status==='working')||tasks.find(t=>t.status==='blocked')||tasks.find(t=>t.status==='ready')||tasks.find(t=>t.status==='review')||tasks.find(t=>t.status==='draft');
    const suppressed=lead.stage==='dnc'||!!lead.contact&&(state.leads||[]).some(l=>l.stage==='dnc'&&l.contact&&l.contact.trim().toLowerCase()===lead.contact.trim().toLowerCase());
    const closed=suppressed||lead.stage==='disqualified',sendHold=hold(state);
    let step='research',now='Research needed',owner='Lead Intelligence',next=lead.nextAction||'Check the buying signal and a public contact route.';
    if(lead.stage==='qualified'){step='qualify';now='Fit recorded';owner='Outreach & Channels';next=lead.nextAction||'Prepare a personalized message for review.';}
    if(current&&['intelligence','analysis','supply'].includes(current.role)&&lead.stage==='discovered')now={draft:'Research not queued',ready:'Research queued',working:'Research in progress · reported',review:'Research awaiting review',blocked:'Research blocked'}[current.status]||now;
    const outreach=tasks.find(t=>t.role==='outreach'&&t.status!=='cancelled');
    if(outreach&&(lead.stage==='qualified'||!['draft','ready'].includes(outreach.status))&&!['contacted','replied','meeting'].includes(lead.stage)){
      step=outreach.status==='review'?'review':['done'].includes(outreach.status)?'contact':'draft';
      now=outreach.status==='done'?'Draft accepted · not sent':outreach.status==='review'?'Draft awaiting review':outreach.status==='working'?'Message being drafted':'Drafting queued';
      owner=outreach.status==='review'?'Quality Review':outreach.status==='done'?'Revenue Lead':'Outreach & Channels';
      next=outreach.status==='review'?'Check the message, sources and recipient.':outreach.status==='done'?'Confirm sending authority and the company mailbox.':'Prepare the message and save it for review.';
      if(outreach.status==='draft'){now='Drafting not queued';next='Confirm prerequisites, then queue the draft.';}
    }
    if(lead.stage==='contacted'){step='contact';now='Contact recorded · awaiting reply';owner='Outreach & Channels';next=lead.nextAction||'Check for a reply and record the next follow-up.';}
    if(['replied','meeting'].includes(lead.stage)){step='conversation';now=lead.stage==='meeting'?'Meeting recorded':'Reply recorded';owner='Revenue Lead';next=lead.nextAction||'Confirm requirements and agree the next conversation.';}
    if(current&&active(current)){owner=role(current.role);if(current.status==='blocked'){now='Blocked';next=current.blocker||next;}else if(current.role==='review'&&outreach&&['review','done'].includes(outreach.status)&&!['contacted','replied','meeting'].includes(lead.stage)){step='review';now=current.status==='working'?'Draft review in progress':current.status==='ready'?'Draft review queued':'Draft review pending';next='Review the message, recipient and sources before accepting the draft.';}}
    if(sendHold&&step==='contact'&&lead.stage!=='contacted'){now='Draft accepted · sending on hold';owner='You';next='Confirm the company email is ready. No outreach is authorized yet.';}
    if(suppressed){step='closed';now='Do not contact';owner='No outreach';next='Keep this contact suppressed.';}
    else if(closed){step='closed';now='Not a fit';owner='No active follow-up';next='Keep the reason in the lead notes.';}
    if(state.paused&&!closed&&current&&['draft','ready'].includes(current.status)){now+=' · queue paused';next='Resume the queue when ready. '+next;}
    return {lead,step,now,owner,next,tasks,current,closed,sendHold,updated:[lead.updatedAt||'',tasks[0]?stamp(tasks[0]):''].sort().pop()};
  }
  function campaigns(state){
    const groups=new Map();
    (state.tasks||[]).forEach(t=>{const m=/^(PM-ASIC-\d{3})-0([1-4])\b/.exec(t.title||'');if(!m)return;const rows=groups.get(m[1])||[];rows.push({index:Number(m[2])-1,task:t});groups.set(m[1],rows);});
    return [...groups].map(([id,rows])=>{
      rows.sort((a,b)=>a.index-b.index);
      const current=rows.find(r=>r.task.status==='working')||rows.find(r=>r.task.status==='blocked')||rows.find(r=>r.task.status==='ready')||rows.find(r=>r.task.status==='review')||rows.find(r=>r.task.status==='draft');
      const next=current&&rows.find(r=>r.index>current.index&&active(r.task));
      return {id,rows,current,next,latest:rows.slice().sort((a,b)=>stamp(b.task).localeCompare(stamp(a.task)))[0]};
    }).sort((a,b)=>stamp(b.latest.task).localeCompare(stamp(a.latest.task)));
  }
  const escape=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const href=(kind,id)=>'#'+(kind==='lead'?'pipeline':'team')+'/'+kind+'/'+encodeURIComponent(id);
  function when(value){const date=new Date(value);return Number.isFinite(+date)?date.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'No update recorded';}
  function holdBanner(state){const h=hold(state);return h?'<div class="wf-hold"><span class="wf-dot" aria-hidden="true"></span><div><strong>Draft-only · waiting for company email</strong><p>Research and message preparation can continue. Outreach stays on hold until you confirm the email is ready.</p></div><a href="'+href('task',h.id)+'">View hold</a></div>':'';}
  function campaignCard(c,state){
    const current=c.current,task=current&&current.task,meaning=task&&taskMeaning(task,state);
    const strip=pilotSteps.map((label,index)=>{const entry=c.rows.find(r=>r.index===index),t=entry&&entry.task;return '<li class="'+(current&&current.index===index?'is-current':t&&t.status==='done'?'is-accepted':t&&t.status==='review'?'has-result':'')+'"'+(current&&current.index===index?' aria-current="step"':'')+'><span class="wf-number">'+(index+1)+'</span><span><strong>'+label+'</strong><small>'+(t?escape(taskMeaning(t,state).label):'Not assigned')+'</small></span></li>';}).join('');
    return '<article class="wf-campaign"><div class="wf-campaign-head"><div><p class="eyebrow">ASIC BROKERAGE · '+escape(c.id)+'</p><h3>'+(current?escape(pilotSteps[current.index]):'Batch results accepted')+'</h3></div><span class="tag">'+(state.paused?'Queue paused':task?escape(meaning.label):'Complete')+'</span></div><ol class="wf-batch-path" aria-label="Brokerage batch progress">'+strip+'</ol>'+(task?'<div class="wf-next-grid"><div><small>Responsible</small><strong>'+escape(meaning.owner)+'</strong></div><div><small>Next action</small><p>'+escape(meaning.next)+'</p></div><div><small>After this</small><p>'+escape(c.next?pilotSteps[c.next.index]:'Keep approved drafts on hold until sending is authorized.')+'</p></div></div><a class="text-button" href="'+href('task',task.id)+'">Open current assignment →</a>':'')+'<p class="wf-note">Batch work can contain several candidates. Individual lead progress below uses saved lead records and explicitly linked assignments. Latest update: '+escape(when(stamp(c.latest.task)))+'.</p></article>';
  }
  function leadCounts(state,selected){
    const rows=(state.leads||[]).map(l=>leadProgress(l,state)).filter(r=>!r.closed);
    return '<div class="wf-counts" aria-label="Lead workflow stages">'+steps.map(([id,label],i)=>'<button type="button" data-action="workflow-stage" data-id="'+id+'" aria-pressed="'+(selected===id)+'"><span>'+String(i+1).padStart(2,'0')+' / '+label+'</span><strong>'+rows.filter(r=>r.step===id).length+'</strong></button>').join('')+'</div>';
  }
  function overview(state,{compact=false,selected=''}={}){
    const batches=campaigns(state),cards=batches.filter(c=>c.current).slice(0,compact?1:3).map(c=>campaignCard(c,state)).join('');
    return '<section class="wf-overview" aria-label="Workflow progress">'+holdBanner(state)+cards+(compact?'<button class="text-button wf-open" data-action="workflow-open">See all lead progress →</button>':'<div class="wf-heading"><div><h2>Where each lead stands</h2><p>Choose a stage to see its leads. Drafts and reviews do not count as contact.</p></div><button class="text-button" data-action="workflow-stage" data-id="all">View all leads →</button></div>'+leadCounts(state,selected))+'</section>';
  }
  function card(lead,state){const p=leadProgress(lead,state);return '<a class="wf-lead-card" href="'+href('lead',lead.id)+'"><div class="wf-lead-head"><div><strong>'+escape(lead.company)+'</strong><span>'+escape(A.OFFERS[lead.offer]||'Revenue lead')+'</span></div><span class="tag">'+escape(p.now)+'</span></div><div class="wf-next-grid"><div><small>Responsible</small><strong>'+escape(p.owner)+'</strong></div><div><small>Next action'+(lead.due?' · '+escape(lead.due):'')+'</small><p>'+escape(p.next)+'</p></div></div><span class="wf-note">'+(p.current?'Linked task: '+escape(p.current.title):'No open bot assignment linked')+' · '+escape(when(p.updated))+'</span></a>';}
  function detail(lead,state){
    const p=leadProgress(lead,state),index=steps.findIndex(s=>s[0]===p.step);
    const path=p.closed?'':'<ol class="wf-lead-path">'+steps.map(([id,label],i)=>'<li class="'+(i===index?'is-current':i<index?'is-earlier':'')+'"'+(i===index?' aria-current="step"':'')+'><span>'+String(i+1).padStart(2,'0')+'</span>'+label+'</li>').join('')+'</ol>';
    return '<section class="wf-detail" aria-label="Lead progress">'+path+'<div class="wf-now"><small>Now</small><h3>'+escape(p.now)+'</h3><div class="wf-next-grid"><div><small>Responsible</small><strong>'+escape(p.owner)+'</strong></div><div><small>Next action'+(lead.due?' · '+escape(lead.due):'')+'</small><p>'+escape(p.next)+'</p></div></div></div>'+holdBanner(state)+'<div class="wf-linked"><h4>Linked bot work</h4>'+(p.tasks.length?p.tasks.map(t=>'<a href="'+href('task',t.id)+'"><span>'+escape(t.title)+'</span><small>'+escape(taskMeaning(t,state).label)+' · '+escape(role(t.role))+'</small></a>').join(''):'<p>No individual assignment is linked yet. Use “Assign bot work” to make the connection explicit.</p>')+'</div></section>';
  }
  function taskContext(task,state){
    const meaning=taskMeaning(task,state),lead=(state.leads||[]).find(l=>linkedTasks(l,state).some(t=>t.id===task.id));
    const campaign=campaigns(state).find(c=>c.rows.some(r=>r.task.id===task.id));
    const entry=campaign&&campaign.rows.find(r=>r.task.id===task.id),prev=entry&&campaign.rows.find(r=>r.index===entry.index-1),next=entry&&campaign.rows.find(r=>r.index===entry.index+1);
    return '<section class="wf-task-context"><div class="wf-next-grid"><div><small>What this means</small><strong>'+escape(meaning.label)+'</strong></div><div><small>Next action · '+escape(meaning.owner)+'</small><p>'+escape(meaning.next)+'</p></div></div>'+(lead?'<a class="text-button" href="'+href('lead',lead.id)+'">Lead: '+escape(lead.company)+' →</a>':'')+(prev||next?'<div class="wf-dependencies">'+(prev?'<a href="'+href('task',prev.task.id)+'">Before: '+escape(pilotSteps[prev.index])+' · '+escape(taskMeaning(prev.task,state).label)+'</a>':'')+(next?'<a href="'+href('task',next.task.id)+'">Next: '+escape(pilotSteps[next.index])+' · '+escape(taskMeaning(next.task,state).label)+'</a>':'')+'</div>':'')+'</section>';
  }
  return {steps,linkedTasks,hold,taskMeaning,leadProgress,campaigns,overview,leadCounts,card,detail,taskContext};
}));
