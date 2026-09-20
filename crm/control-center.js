/* Read-only overview of the existing CRM records. No catalog imports or writes. */
(function(root,factory){
  const api=typeof module==='object'&&module.exports?factory(require('./crm-model'),require('../agent-control-model'),require('./workflow')):factory(root.ProtonCrmModel,root.AgentControlModel,root.ProtonCrmWorkflow);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.ProtonCrmControl=api;
}(typeof window!=='undefined'?window:globalThis,function(M,A,F){
  'use strict';
  const closedTask=t=>['done','cancelled'].includes(t.status);
  const openLead=l=>!['dnc','disqualified'].includes(l.stage);
  const hasText=v=>typeof v==='string'&&!!v.trim();
  const WORK_STALE_MS=30*60*1000;
  // A saved report is not a heartbeat. Reject ambiguous dates and clock skew.
  function workFreshness(task,now=Date.now()){
    const values=[task.startedAt,task.updatedAt].filter(v=>v!==undefined&&v!==null&&v!=='');
    if(!values.length)return {fresh:false,reason:'missing',reportedAt:''};
    const times=values.map(v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v)?Date.parse(v):NaN);
    if(!Number.isFinite(now)||times.some(t=>!Number.isFinite(t)))return {fresh:false,reason:'invalid',reportedAt:''};
    const latest=Math.max(...times),reportedAt=new Date(latest).toISOString();
    if(latest>now)return {fresh:false,reason:'future',reportedAt};
    const fresh=now-latest<WORK_STALE_MS;
    return {fresh,reason:fresh?'fresh':'stale',reportedAt};
  }
  function roleReport(records,now=Date.now(),reportOf=workFreshness){
    const tasks=records.filter(A.actionable),working=tasks.filter(t=>F.bucket(t)==='working');
    const reports=working.map(t=>reportOf(t,now)),needsCheck=reports.filter(r=>!r.fresh).length;
    const count=b=>tasks.filter(t=>F.bucket(t)===b).length,review=count('review'),blocked=count('blocked');
    const status=[needsCheck?'Work status needs checking ('+needsCheck+'/'+working.length+')':working.length?working.length+' reported in progress':'',review?review+' in team review':'',count('owner')?count('owner')+' owner decisions':'',count('correction')?count('correction')+' corrections':'',blocked?blocked+' blocked':''].filter(Boolean).join(' · ')||(tasks.length?tasks.length+' open':'No open tasks');
    const latest=reports.map(r=>r.reportedAt).filter(Boolean).sort().pop();
    let lastReported=working.length?(latest?'Last reported: '+new Date(latest).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'UTC'})+' UTC':'Last reported time unavailable'):'';
    if(reports.some(r=>r.reason==='future'))lastReported+=' · future timestamp';
    if(latest&&reports.some(r=>['invalid','missing'].includes(r.reason)))lastReported+=' · some report times unavailable';
    return {working:working.length,needsCheck,shining:working.length>0&&!needsCheck,status,lastReported,warm:working.length>0||review>0||blocked>0};
  }
  // Patch status nodes only: the timer must not re-render forms or write records.
  function refreshFreshness(container,tasks,now=Date.now(),reportOf=workFreshness){
    container.querySelectorAll('.cc-role').forEach(button=>{
      const report=roleReport(tasks.filter(t=>t.role===button.dataset.id),now,reportOf);
      button.classList.toggle('is-working',report.shining);
      const status=button.querySelector('.cc-role-status'),time=button.querySelector('.cc-role-time');
      if(status){if(status.textContent!==report.status)status.textContent=report.status;status.classList.toggle('accent',report.warm);status.classList.toggle('muted',!report.warm);}
      if(time){if(time.textContent!==report.lastReported)time.textContent=report.lastReported;time.hidden=!report.lastReported;}
    });
  }
  function watchFreshness(container,getTasks,env={}){
    const doc=env.document||container.ownerDocument,now=env.now||Date.now;
    const schedule=env.setInterval||setInterval,cancel=env.clearInterval||clearInterval;
    let disposed=false;
    const observed=new Map();
    const reportOf=(task,at)=>{
      const signature=JSON.stringify([task.startedAt,task.updatedAt]),previous=observed.get(task.id);
      // Time passing (or a clock correction) cannot repair an uncertain report.
      if(previous&&previous.signature===signature&&!previous.report.fresh)return previous.report;
      const report=workFreshness(task,at);observed.set(task.id,{signature,report});return report;
    };
    const refresh=()=>{if(!disposed&&!doc.hidden&&container.isConnected){const tasks=getTasks();const ids=new Set(tasks.map(t=>t.id));for(const id of observed.keys())if(!ids.has(id))observed.delete(id);refreshFreshness(container,tasks,now(),reportOf);}};
    const timer=schedule(refresh,30000);
    doc.addEventListener('visibilitychange',refresh);refresh();
    return ()=>{disposed=true;cancel(timer);doc.removeEventListener('visibilitychange',refresh);};
  }
  function summary({sites,state,followups,contacts,date}){
    const leads=(state.leads||[]).filter(l=>openLead(l)&&!A.outreachForLead(state,l)?.suppressed),tasks=state.tasks.filter(A.actionable);
    const pipeline=M.pipeline(sites,state.leads||[],state.deals).filter(r=>r.group!=='closed');
    const activeSites=sites.filter(s=>!['dead','closed_won'].includes(s.stage));
    const reminders=followups.filter(f=>['pending','snoozed'].includes(f.status));
    const actions=M.today({sites,leads:state.leads||[],tasks:state.tasks,followups:reminders,date,state});
    const dated=actions.filter(a=>a.due&&a.due<=date);
    const nextWeek=new Date(date+'T12:00:00Z');nextWeek.setUTCDate(nextWeek.getUTCDate()+7);
    const future=reminders.filter(f=>f.due_date>date&&f.due_date<=nextWeek.toISOString().slice(0,10));
    const withoutNextAction=activeSites.filter(s=>!reminders.some(f=>String(f.prospect_id)===String(s.id)));
    return {pipeline,activeSites,leads,tasks,actions,due:dated.length,overdue:dated.filter(a=>a.due<date).length,
      reviews:tasks.filter(t=>F.bucket(t)==='review').length,blocked:tasks.filter(t=>F.bucket(t)==='blocked').length,
      owners:tasks.filter(t=>F.bucket(t)==='owner').length,corrections:tasks.filter(t=>F.bucket(t)==='correction').length,
      working:tasks.filter(t=>F.bucket(t)==='working').length,ready:tasks.filter(t=>F.bucket(t)==='ready').length,
      nextWeek:future.length,withoutNextAction,
      researchSites:activeSites.filter(s=>['unreviewed','researching'].includes(s.stage)),
      qualifiedLeads:leads.filter(l=>l.stage==='qualified').length,replies:leads.filter(l=>l.stage==='replied').length,
      meetings:leads.filter(l=>l.stage==='meeting').length,leadsWithoutNext:leads.filter(l=>!hasText(l.nextAction)||!l.due).length,
      contacts:contacts.length,reachable:contacts.filter(c=>hasText(c.email)||hasText(c.phone)).length,
      decisionMakers:contacts.filter(c=>c.role==='decision_maker').length,unverified:contacts.filter(c=>!hasText(c.last_verified)).length,
      cash:A.metrics(state,date.slice(0,7)),cashEntries:state.entries.filter(e=>!e.voidedAt&&e.date.slice(0,7)===date.slice(0,7)).length,
      updates:state.activity.slice().sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,4)};
  }
  function render(input,h){
    const v=summary(input),s=input.state,date=input.date,{esc,icon,row,tag,money,href,stageLabel}=h;
    const link=(label,url)=>'<a class="text-button cc-link" href="'+esc(url)+'">'+esc(label)+' <span aria-hidden="true">↗</span></a>';
    const action=(label,type,id='')=>'<button class="text-button cc-link" data-action="'+type+'" data-id="'+esc(id)+'">'+esc(label)+' <span aria-hidden="true">↗</span></button>';
    const small=(text)=>'<p class="cc-empty">'+esc(text)+'</p>';
    const metric=(value,label)=>'<div><strong>'+esc(value)+'</strong><span>'+esc(label)+'</span></div>';
    const widget=(id,title,glyph,body,footer,extra='')=>'<section class="panel cc-widget '+extra+'" aria-labelledby="cc-'+id+'"><div class="panel-head"><h2 id="cc-'+id+'">'+icon(glyph)+esc(title)+'</h2></div>'+body+'<div class="cc-footer">'+footer+'</div></section>';
    const attention=v.actions.slice(0,5).map(i=>{
      const task=i.kind==='task'?s.tasks.find(t=>t.id===i.id):null;
      const label=task?F.taskMeaning(task,s).label:i.due<date?'Overdue':'Due today';
      return row({name:i.name,sub:i.context+(i.due?' · '+i.due:''),badge:tag(label,label!=='Due today'),glyph:i.kind==='followup'?'today':i.kind==='task'?'task':'people',action:i.kind==='followup'?'reminder':'open-'+i.kind,id:i.id});
    }).join('');
    const target=s.goalCents,progress=Math.max(0,Math.min(100,target?v.cash.contribution/target*100:0));
    const monthLabel=new Date(date+'T12:00:00Z').toLocaleDateString(undefined,{month:'long',year:'numeric',timeZone:'UTC'});
    const pipelineBars=['research','conversation','agreement'].map(group=>{
      const count=v.pipeline.filter(p=>p.group===group).length,pct=v.pipeline.length?count/v.pipeline.length*100:0;
      const label={research:'Research',conversation:'Conversations',agreement:'Agreements'}[group];
      return '<button class="cc-stage" data-action="cc-stage" data-id="'+group+'"><span>'+label+'</span><span class="cc-track" aria-hidden="true"><i style="width:'+pct+'%"></i></span><strong>'+count+'</strong></button>';
    }).join('');
    const roleRows=A.ROLES.map(r=>{
      const report=roleReport(v.tasks.filter(t=>t.role===r.id),input.now);
      return '<button class="cc-role'+(report.shining?' is-working':'')+'" data-action="cc-role" data-id="'+r.id+'"><span class="cc-role-name">'+esc(r.name)+'</span><span class="cc-role-report"><span class="cc-role-status '+(report.warm?'accent':'muted')+'">'+esc(report.status)+'</span><span class="cc-role-time"'+(report.lastReported?'':' hidden')+'>'+esc(report.lastReported)+'</span></span></button>';
    }).join('');
    const pipelineTypes=[['site','Energy sites'],['lead','Buyer leads'],['deal','Service deals']].map(([kind,label])=>'<button class="cc-type" data-action="cc-pipeline" data-id="'+kind+'"><strong>'+v.pipeline.filter(p=>p.kind===kind).length+'</strong><span>'+label+'</span></button>').join('');
    const nextSites=v.withoutNextAction.slice(0,2).map(site=>row({name:site.name,sub:'Set a dated next action',url:href('site',site.id),glyph:'site'})).join('');
    const nextLeads=v.leads.slice().sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')).slice(0,2).map(l=>h.leadCard?h.leadCard(l):row({name:l.company,sub:l.nextAction||'Set the next buyer step',badge:tag(A.LEAD_STAGES[l.stage]),url:href('lead',l.id),glyph:'people'})).join('');
    const updates=v.updates.map(e=>'<li><p>'+esc(e.message)+'</p><time datetime="'+esc(e.at)+'">'+esc(new Date(e.at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))+'</time></li>').join('');
    const connection=input.connection;
    const locationLabel=connection.uid&&connection.agent.mode==='cloud'?'Shared account records':connection.uid?'Account connection needs attention':'Records on this device';
    return h.head('Control Center','Your priorities, pipeline and team at a glance.','add','Add new',new Date(date+'T12:00:00Z').toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',timeZone:'UTC'}))+
      '<div class="cc-context"><span>'+icon('control')+esc(locationLabel)+'</span><span>'+esc(s.paused?'Team queue paused':'Team queue open')+'</span><a href="#settings">Workspace settings</a></div>'+
      '<div class="stat-grid cc-stats">'+h.stat('Due & overdue',v.due,v.overdue?v.overdue+' overdue':'No overdue actions','show-due')+h.stat('Owner decisions',v.owners,'Team reviews: '+v.reviews,'show-owner')+h.stat('Active opportunities',v.pipeline.length,'Energy, buyers & service deals','cc-pipeline')+h.stat('Monthly contribution',money(v.cash.contribution/100),'of '+money(target/100)+' target','cc-revenue')+'</div>'+
      '<div class="cc-grid">'+
      widget('team','Grokbot team','team',F.overview(s,{compact:true})+'<div class="cc-body"><div class="cc-task-counts">'+[['ready',v.ready,'Ready'],['working',v.working,'Reported work'],['review',v.reviews,'Team review'],['correction',v.corrections,'Corrections'],['owner',v.owners,'Owner decision'],['blocked',v.blocked,'Execution blocked']].map(([id,n,label])=>'<button data-action="cc-team" data-id="'+id+'"><strong>'+n+'</strong><span>'+label+'</span></button>').join('')+'</div><div class="cc-roles">'+roleRows+'</div><p class="cc-caption">Grok runtime and usage are not connected. Saved assignments are not live bot health. Shine marks work reported within 30 minutes, not verified execution. Older or unclear reports need checking. Reference and superseded records are excluded.</p></div>',action('Open team workspace','cc-team','open'),'cc-team-primary')+
      widget('revenue','Revenue & goal','cash','<div class="cc-body"><p class="cc-kicker">'+esc(monthLabel)+' · USD</p><div class="cc-revenue-number">'+money(v.cash.contribution/100)+'</div><p class="muted">Collected contribution</p><div class="cc-goal"><span>'+Math.round(progress)+'% of goal</span><span>'+money(target/100)+'</span></div><div class="progress-track" role="progressbar" aria-label="Monthly contribution goal" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.round(progress)+'"><span style="width:'+progress+'%"></span></div><dl class="cc-money"><div><dt>Earned fees collected</dt><dd>'+money(v.cash.earned/100)+'</dd></div><div><dt>Delivery & team costs</dt><dd>'+money((v.cash.delivery+v.cash.software)/100)+'</dd></div><div><dt>Net reserves added</dt><dd>'+money((v.cash.reserve-v.cash.release)/100)+'</dd></div><div><dt>Open proposed fees</dt><dd>'+money(v.cash.pipeline/100)+'</dd></div></dl><p class="cc-caption">'+(v.cashEntries?'From the cash register. Proposed fees are not earned revenue.':'No cash entries this month. Record collected fees and actual costs.')+'</p></div>',action('Open revenue','cc-revenue'))+
      widget('pipeline','Pipeline','pipeline','<div class="cc-body"><div class="cc-types">'+pipelineTypes+'</div><div class="cc-stages">'+pipelineBars+'</div><p class="cc-caption">Open opportunities by their recorded stage.</p></div>',action('View pipeline','cc-pipeline'))+
      widget('leads','Lead generation','people','<div class="cc-body"><div class="cc-mini-stats">'+metric(v.leads.length,'Active buyers')+metric(v.qualifiedLeads,'Fit recorded')+metric(v.replies+v.meetings,'Replies / meetings')+'</div><p class="cc-caption">'+v.leadsWithoutNext+' need a next action or date.</p></div>'+(nextLeads||small('Add a buyer and the evidence for why they might need Proton.')),action('Open buyer leads','cc-pipeline','lead'))+
      widget('attention','Work needing attention','today',attention||'<div class="cc-all-clear">'+icon('check')+'<h3>No urgent items recorded.</h3><p>Team reviews, explicit owner decisions, execution blockers and follow-ups appear here.</p></div>',link('Open Today','#today')+'<span>'+v.nextWeek+' site follow-ups in the next 7 days</span>','cc-attention')+
      widget('prospecting','Prospecting','discover','<div class="cc-body"><div class="cc-mini-stats">'+metric(v.activeSites.length,'Saved active sites')+metric(v.researchSites.length,'Under research')+'</div><p class="cc-caption">'+v.withoutNextAction.length+' active sites have no pending follow-up.</p></div>'+(nextSites||small(v.activeSites.length?'Every active site has a pending follow-up.':'Discover energy sites and save the ones you want to pursue.')),link('Discover energy sites','#discover'))+
      widget('people','People & contacts','people','<div class="cc-body"><div class="cc-mini-stats">'+metric(v.contacts,'Saved contacts')+metric(v.reachable,'Phone or email')+'</div><dl class="cc-money"><div><dt>Recorded decision-makers</dt><dd>'+v.decisionMakers+'</dd></div><div><dt>No verification date</dt><dd>'+v.unverified+'</dd></div></dl><p class="cc-caption">Published site contacts also appear inside each prospect.</p></div>',link('Open people','#people'))+
      widget('activity','Latest team updates','task',updates?'<ol class="cc-updates">'+updates+'</ol>':small('New assignments, results and recorded revenue updates will appear here.'),action('View activity','cc-activity'))+
      '</div>';
  }
  return {summary,render,WORK_STALE_MS,workFreshness,roleReport,refreshFreshness,watchFreshness};
}));
