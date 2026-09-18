/* Read-only overview of the existing CRM records. No catalog imports or writes. */
(function(root,factory){
  const api=typeof module==='object'&&module.exports?factory(require('./crm-model'),require('../agent-control-model')):factory(root.ProtonCrmModel,root.AgentControlModel);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.ProtonCrmControl=api;
}(typeof window!=='undefined'?window:globalThis,function(M,A){
  'use strict';
  const closedTask=t=>['done','cancelled'].includes(t.status);
  const openLead=l=>!['dnc','disqualified'].includes(l.stage);
  const hasText=v=>typeof v==='string'&&!!v.trim();
  function summary({sites,state,followups,contacts,date}){
    const leads=(state.leads||[]).filter(openLead),tasks=state.tasks.filter(t=>!closedTask(t));
    const pipeline=M.pipeline(sites,state.leads||[],state.deals).filter(r=>r.group!=='closed');
    const activeSites=sites.filter(s=>!['dead','closed_won'].includes(s.stage));
    const reminders=followups.filter(f=>['pending','snoozed'].includes(f.status));
    const actions=M.today({sites,leads:state.leads||[],tasks:state.tasks,followups:reminders,date});
    const dated=actions.filter(a=>a.due&&a.due<=date);
    const nextWeek=new Date(date+'T12:00:00Z');nextWeek.setUTCDate(nextWeek.getUTCDate()+7);
    const future=reminders.filter(f=>f.due_date>date&&f.due_date<=nextWeek.toISOString().slice(0,10));
    const withoutNextAction=activeSites.filter(s=>!reminders.some(f=>String(f.prospect_id)===String(s.id)));
    return {pipeline,activeSites,leads,tasks,actions,due:dated.length,overdue:dated.filter(a=>a.due<date).length,
      reviews:tasks.filter(t=>t.status==='review').length,blocked:tasks.filter(t=>t.status==='blocked').length,
      working:tasks.filter(t=>t.status==='working').length,ready:tasks.filter(t=>t.status==='ready').length,
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
      const label=task&&task.status==='review'?'Needs review':task&&task.status==='blocked'?'Blocked':i.due<date?'Overdue':'Due today';
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
      const tasks=v.tasks.filter(t=>t.role===r.id),working=tasks.filter(t=>t.status==='working').length,review=tasks.filter(t=>t.status==='review').length,blocked=tasks.filter(t=>t.status==='blocked').length;
      const status=working?working+' in progress'+(review?' · '+review+' to review':blocked?' · '+blocked+' blocked':''):review?review+' to review':blocked?blocked+' blocked':tasks.length?tasks.length+' open':'No open tasks';
      return '<button class="cc-role'+(working?' is-working':'')+'" data-action="cc-role" data-id="'+r.id+'"><span class="cc-role-name">'+esc(r.name)+'</span><span class="cc-role-status '+(working||review||blocked?'accent':'muted')+'">'+esc(status)+'</span></button>';
    }).join('');
    const pipelineTypes=[['site','Energy sites'],['lead','Buyer leads'],['deal','Service deals']].map(([kind,label])=>'<button class="cc-type" data-action="cc-pipeline" data-id="'+kind+'"><strong>'+v.pipeline.filter(p=>p.kind===kind).length+'</strong><span>'+label+'</span></button>').join('');
    const nextSites=v.withoutNextAction.slice(0,2).map(site=>row({name:site.name,sub:'Set a dated next action',url:href('site',site.id),glyph:'site'})).join('');
    const nextLeads=v.leads.slice().sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')).slice(0,2).map(l=>row({name:l.company,sub:l.nextAction||'Set the next buyer step',badge:tag(A.LEAD_STAGES[l.stage]),url:href('lead',l.id),glyph:'people'})).join('');
    const updates=v.updates.map(e=>'<li><p>'+esc(e.message)+'</p><time datetime="'+esc(e.at)+'">'+esc(new Date(e.at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))+'</time></li>').join('');
    const connection=input.connection;
    const locationLabel=connection.uid&&connection.agent.mode==='cloud'?'Shared account records':connection.uid?'Account connection needs attention':'Records on this device';
    return h.head('Control Center','Your priorities, pipeline and team at a glance.','add','Add new',new Date(date+'T12:00:00Z').toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',timeZone:'UTC'}))+
      '<div class="cc-context"><span>'+icon('control')+esc(locationLabel)+'</span><span>'+esc(s.paused?'Team queue paused':'Team queue open')+'</span><a href="#settings">Workspace settings</a></div>'+
      '<div class="stat-grid cc-stats">'+h.stat('Due & overdue',v.due,v.overdue?v.overdue+' overdue':'No overdue actions','show-due')+h.stat('Needs your review',v.reviews,'Blocked tasks: '+v.blocked,'show-reviews')+h.stat('Active opportunities',v.pipeline.length,'Energy, buyers & service deals','cc-pipeline')+h.stat('Monthly contribution',money(v.cash.contribution/100),'of '+money(target/100)+' target','cc-revenue')+'</div>'+
      '<div class="cc-grid">'+
      widget('team','Grokbot team','team','<div class="cc-body"><div class="cc-task-counts">'+[['ready',v.ready,'Ready'],['working',v.working,'In progress'],['review',v.reviews,'Needs review'],['blocked',v.blocked,'Blocked']].map(([id,n,label])=>'<button data-action="cc-team" data-id="'+id+'"><strong>'+n+'</strong><span>'+label+'</span></button>').join('')+'</div><div class="cc-roles">'+roleRows+'</div><p class="cc-caption">Recorded assignments · '+(s.paused?'queue paused':'queue open')+'.</p></div>',action('Open team workspace','cc-team','open'),'cc-team-primary')+
      widget('revenue','Revenue & goal','cash','<div class="cc-body"><p class="cc-kicker">'+esc(monthLabel)+' · USD</p><div class="cc-revenue-number">'+money(v.cash.contribution/100)+'</div><p class="muted">Collected contribution</p><div class="cc-goal"><span>'+Math.round(progress)+'% of goal</span><span>'+money(target/100)+'</span></div><div class="progress-track" role="progressbar" aria-label="Monthly contribution goal" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.round(progress)+'"><span style="width:'+progress+'%"></span></div><dl class="cc-money"><div><dt>Earned fees collected</dt><dd>'+money(v.cash.earned/100)+'</dd></div><div><dt>Delivery & team costs</dt><dd>'+money((v.cash.delivery+v.cash.software)/100)+'</dd></div><div><dt>Net reserves added</dt><dd>'+money((v.cash.reserve-v.cash.release)/100)+'</dd></div><div><dt>Open proposed fees</dt><dd>'+money(v.cash.pipeline/100)+'</dd></div></dl><p class="cc-caption">'+(v.cashEntries?'From the cash register. Proposed fees are not earned revenue.':'No cash entries this month. Record collected fees and actual costs.')+'</p></div>',action('Open revenue','cc-revenue'))+
      widget('pipeline','Pipeline','pipeline','<div class="cc-body"><div class="cc-types">'+pipelineTypes+'</div><div class="cc-stages">'+pipelineBars+'</div><p class="cc-caption">Open opportunities by their recorded stage.</p></div>',action('View pipeline','cc-pipeline'))+
      widget('leads','Lead generation','people','<div class="cc-body"><div class="cc-mini-stats">'+metric(v.leads.length,'Active buyers')+metric(v.qualifiedLeads,'Ready for outreach')+metric(v.replies+v.meetings,'Replies / meetings')+'</div><p class="cc-caption">'+v.leadsWithoutNext+' need a next action or date.</p></div>'+(nextLeads||small('Add a buyer and the evidence for why they might need Proton.')),action('Open buyer leads','cc-pipeline','lead'))+
      widget('attention','Needs your attention','today',attention||'<div class="cc-all-clear">'+icon('check')+'<h3>No urgent items recorded.</h3><p>Follow-ups, overdue assignments and results awaiting your review appear here.</p></div>',link('Open Today','#today')+'<span>'+v.nextWeek+' site follow-ups in the next 7 days</span>','cc-attention')+
      widget('prospecting','Prospecting','discover','<div class="cc-body"><div class="cc-mini-stats">'+metric(v.activeSites.length,'Saved active sites')+metric(v.researchSites.length,'Under research')+'</div><p class="cc-caption">'+v.withoutNextAction.length+' active sites have no pending follow-up.</p></div>'+(nextSites||small(v.activeSites.length?'Every active site has a pending follow-up.':'Discover energy sites and save the ones you want to pursue.')),link('Discover energy sites','#discover'))+
      widget('people','People & contacts','people','<div class="cc-body"><div class="cc-mini-stats">'+metric(v.contacts,'Saved contacts')+metric(v.reachable,'Phone or email')+'</div><dl class="cc-money"><div><dt>Recorded decision-makers</dt><dd>'+v.decisionMakers+'</dd></div><div><dt>No verification date</dt><dd>'+v.unverified+'</dd></div></dl><p class="cc-caption">Published site contacts also appear inside each prospect.</p></div>',link('Open people','#people'))+
      widget('activity','Latest team updates','task',updates?'<ol class="cc-updates">'+updates+'</ol>':small('New assignments, results and recorded revenue updates will appear here.'),action('View activity','cc-activity'))+
      '</div>';
  }
  return {summary,render};
}));
