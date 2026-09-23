(function(){
  'use strict';
  const M=ProtonCrmModel,F=ProtonCrmWorkflow,A=AgentControlModel,G=ProtonGrokTeam,S=ProtonCrmSourcing,E=ProtonCrmEnergyScouting,O=ProtonCrmOutreach,D=ProtonCrmData.create(),$=id=>document.getElementById(id);
  const icons={today:'<rect x="3" y="5" width="18" height="16" rx="4"/><path d="M7 3v4m10-4v4M3 11h18m-13 5h3"/>',pipeline:'<rect x="3" y="4" width="5" height="16" rx="2"/><rect x="10" y="4" width="5" height="11" rx="2"/><rect x="17" y="4" width="4" height="7" rx="2"/>',discover:'<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5M8 11h6m-3-3v6"/>',team:'<rect x="5" y="7" width="14" height="12" rx="4"/><path d="M12 3v4M2 11v4m20-4v4m-14-3h1m6 0h1m-7 4h6"/>',people:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/>',settings:'<path d="m10 3-1 3-3 1-3-1v5l3 1 1 3-1 3 4 3 2-2h3l2 2 4-3-1-3 1-3 2-1V7l-3-1-1-3h-5Z"/><circle cx="12" cy="12" r="3"/>',arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',plus:'<path d="M12 5v14M5 12h14"/>',check:'<path d="m5 12 4 4L19 6"/>',site:'<path d="M3 21h18M5 21V9l7-6 7 6v12M9 21v-7h6v7M9 9h6"/>',task:'<rect x="5" y="4" width="14" height="17" rx="3"/><path d="M9 3h6v4H9zM9 12h6m-6 4h4"/>',cash:'<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="12" cy="12" r="3"/><path d="M6 12h1m10 0h1"/>'};
  const icon=(name)=>'<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(icons[name]||icons.site)+'</svg>';
  icons.control='<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="11" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="18" width="7" height="3" rx="1"/>';
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=M.money,day=()=>CrmFollowups.today(),agent=()=>D.agent(),uid=p=>p+'_'+crypto.randomUUID();
  const kinds={site:'Energy site',lead:'Revenue lead',deal:'Service deal'},energy={landfill_gas:'Landfill gas',flare_gas:'Flare gas',grid_facility:'Power facility',unknown:'Other energy'};
  let current='control',selection=null,siteTab='overview',pipelineKind='all',pipelineGroup='all',pipelineSearch='',pipelineLimit=60,pipelineWorkflow='all',teamTab='workflow',taskFilter='open',taskRole='',month=day().slice(0,7),peopleSearch='',modalForm=false,modalBack=null,focusBefore=null,busy=false,noticeTimer,renderQueued=false;
  const sheet=$('sheet'),expandedLeads=new Set(),expandedLeadSections=new Set(),outreachPlans=new Map();
  let completedReviewSession=null,taskRequest=null,releaseUpdates=null,activeActions=0,agentWorkbench=null,workbenchGate='';
  const sidebarKey='protonCrmSidebarCollapsed_v1';
  function setSidebarCollapsed(collapsed){
    document.body.classList.toggle('sidebar-collapsed',collapsed);
    const toggle=$('sidebarToggle'),label=collapsed?'Expand sidebar':'Collapse sidebar';
    toggle.setAttribute('aria-expanded',String(!collapsed));toggle.setAttribute('aria-label',label);toggle.title=label;
  }
  try{setSidebarCollapsed(localStorage.getItem(sidebarKey)==='true');}catch(_){setSidebarCollapsed(false);}
  $('sidebarToggle').addEventListener('click',()=>{
    const collapsed=!document.body.classList.contains('sidebar-collapsed');setSidebarCollapsed(collapsed);
    try{localStorage.setItem(sidebarKey,String(collapsed));}catch(_){}
  });
  const button=(text,action,id='',primary=false)=>'<button class="button'+(primary?' primary':'')+'" data-action="'+action+'" data-id="'+esc(id)+'">'+esc(text)+'</button>';
  const textButton=(text,action,id='')=>'<button class="text-button" data-action="'+action+'" data-id="'+esc(id)+'">'+esc(text)+'</button>';
  const tag=(text,warm=false)=>'<span class="tag'+(warm?' warm':'')+'">'+esc(text)+'</span>';
  const href=(kind,id)=>'#'+(['task','deal'].includes(kind)?'team':'pipeline')+'/'+kind+'/'+encodeURIComponent(id);
  const external=(url,label)=>M.safeUrl(url)?'<a class="link" target="_blank" rel="noopener noreferrer" href="'+esc(M.safeUrl(url))+'">'+esc(label||url)+' ↗</a>':esc(label||url||'Not recorded');
  const pair=(a,b)=>'<div class="field-pair">'+a+b+'</div>';
  function empty(title,description,action,label,glyph='pipeline'){return '<div class="empty"><span class="empty-icon">'+icon(glyph)+'</span><h2>'+esc(title)+'</h2><p>'+esc(description)+'</p>'+(action?button(label,action,'',true):'')+'</div>';}
  function head(title,sub,action,label,eyebrow){return '<header class="page-heading"><div>'+(eyebrow?'<p class="eyebrow">'+esc(eyebrow)+'</p>':'')+'<h1>'+esc(title)+'</h1>'+(sub?'<p>'+esc(sub)+'</p>':'')+'</div>'+(action?button(label,action,'',true):'')+'</header>';}
  function stat(label,value,foot,action){return '<button class="stat" data-action="'+action+'"><span class="label">'+esc(label)+'</span><strong class="value">'+esc(value)+'</strong><span class="foot">'+esc(foot)+'</span></button>';}
  function row({name,sub,end='',badge='',action,id='',glyph='site',url}){const attrs=url?'href="'+esc(url)+'"':'type="button" data-action="'+action+'" data-id="'+esc(id)+'"',el=url?'a':'button';return '<'+el+' class="row" '+attrs+'><span class="avatar">'+icon(glyph)+'</span><span class="row-copy"><strong>'+esc(name)+'</strong><span class="sub">'+esc(sub)+'</span></span><span class="row-end">'+(end?'<span>'+esc(end)+'</span>':'')+badge+'</span><span class="chevron" aria-hidden="true">›</span></'+el+'>';}
  function note(message){$('notice').textContent=message;$('notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').hidden=true,7000);}
  function error(e){
    const inSheet=sheet.open,target=inSheet?$('sheetError'):$('notice');target.textContent=e.message||String(e);target.hidden=false;
    if(inSheet){
      // A long form can leave its alert below the dialog viewport after Save.
      target.tabIndex=-1;target.focus({preventScroll:true});target.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
    }
  }
  function modal(title,html,back,form=false,taskView=false){
    agentWorkbench?.destroy();agentWorkbench=null;
    if(!taskView)taskRequest=null;
    completedReviewSession=null;
    if(!sheet.open)focusBefore=document.activeElement;
    $('sheetTitle').textContent=title;$('sheetBody').innerHTML=html;$('sheetError').hidden=true;modalBack=back||null;modalForm=form;
    $('sheetBack').hidden=!back;if(!sheet.open)sheet.showModal();sheet.scrollTop=0;
    const first=$('sheetBody').querySelector(form?'input:not([type=hidden]),select,textarea':'[autofocus]');if(first)first.focus();else $('sheetClose').focus();
  }
  function close(){const workbench=isWorkbenchRoute();agentWorkbench?.destroy();agentWorkbench=null;taskRequest=null;completedReviewSession=null;sheet.close();modalForm=false;modalBack=null;if(workbench||selection){location.hash=workbench?'#team':'#'+current;selection=null;}if(focusBefore&&document.contains(focusBefore))focusBefore.focus();}
  function registerConfirmed(status){const a=status.agent;return status.uid?a.uid===status.uid&&a.mode==='cloud'&&a.serverConfirmed===true:a.mode==='local';}
  function syncLabel(status){return !status.ready?'Connecting…':status.error||['error','offline'].includes(status.agent.mode)?'Needs attention':status.uid?registerConfirmed(status)?'Account connected':'Verifying sync…':'On this device';}
  function syncNotice(status){
    const a=status.agent;if(registerConfirmed(status))return '';
    const failed=['error','offline'].includes(a.mode),fields={stage:'lead stage',service:'lead service',channel:'lead channel'},issue=a.validationIssue;
    const reason=issue&&fields[issue.field]?'A saved '+fields[issue.field]+' is unsupported. The original record has not been changed.':a.error||'Waiting for a server-confirmed task register.';
    const verified=typeof a.lastServerConfirmedAt==='string'&&Number.isFinite(Date.parse(a.lastServerConfirmedAt))?new Date(a.lastServerConfirmedAt).toLocaleString(undefined,{timeZone:'UTC'})+' UTC':'';
    const snapshot=a.mode==='error'?'Showing the last valid snapshot; it is not confirmed current.':a.mode==='offline'?'Showing a cached snapshot; it is not confirmed current.':'Displayed records are not yet confirmed current.';
    return '<section class="banner crm-sync-notice" role="status" aria-label="Team register sync"><div><strong>'+esc(failed?'Team register needs attention':'Verifying the team register')+'</strong><p>'+esc(reason)+'</p><p>'+esc(snapshot)+' '+(failed?'Team changes are paused.':'')+'</p><small>'+esc(verified?'Last verified sync: '+verified:'No server-verified sync recorded for this account session.')+'</small></div><div class="crm-sync-actions">'+textButton('Export backup','backup')+textButton('Reload workspace','reload')+'</div></section>';
  }
  function nav(){
    const labels={control:'Control Center',today:'Today',requests:'Inbox',pipeline:'Pipeline',discover:'Discover',team:'Team'};
    $('navigation').innerHTML=Object.keys(labels).map(name=>'<a class="nav-item" href="#'+name+'" aria-label="'+labels[name]+'" title="'+labels[name]+'"'+(current===name?' aria-current="page"':'')+'>'+icon(name)+'<span>'+labels[name]+'</span></a>').join('');
    $('peopleLink').innerHTML=icon('people')+'<span>People</span>';$('settingsLink').innerHTML=icon('settings')+'<span>Settings</span>';
    const status=D.status();$('connectionLabel').textContent=syncLabel(status);$('accountButton').setAttribute('data-sync-state',status.error||['error','offline'].includes(status.agent.mode)?'attention':registerConfirmed(status)?'confirmed':'checking');
  }
  const intakeInbox=ProtonCrmIntakeInbox.create({D,E,esc,model:ProtonSourcingModel,config:window.ProtonIntakeConfig});
  let stopWorkFreshness=()=>{};
  let exchangeVisible=false,exchangeGeneration=0,exchangeView=null;
  function syncAgentExchange(show){
    if(show===exchangeVisible)return;
    exchangeVisible=show;const generation=++exchangeGeneration,panel=$('agentExchangePanel');
    exchangeView?.disconnect();exchangeView=null;panel.hidden=!show;
    if(!show){panel.textContent='';return;}
    panel.textContent='Opening agent connection…';
    import('./agent-exchange/view.mjs').then(module=>{
      if(generation!==exchangeGeneration||!exchangeVisible)return;
      exchangeView=module.mountCrmAgentView({root:panel,data:D,auth:()=>typeof firebase==='undefined'?null:firebase.auth()});
    }).catch(e=>{if(generation===exchangeGeneration)panel.textContent='Agent connection unavailable: '+(e.message||String(e));});
  }
  window.addEventListener('pagehide',()=>syncAgentExchange(false));
  window.addEventListener('pageshow',e=>{if(e.persisted)queueRender();});
  function render(){
    stopWorkFreshness();stopWorkFreshness=()=>{};intakeInbox.dispose();
    discovery.unmount();$('content').classList.toggle('crm-discover',current==='discover');$('content').classList.toggle('crm-control',current==='control');nav();const status=D.status();
    const showExchange=current==='team'&&selection?.kind==='exchange';
    $('content').classList.toggle('crm-exchange',showExchange);
    // Tear down the exchange before any route-specific early return.
    syncAgentExchange(showExchange&&status.ready&&!status.error);
    if(isWorkbenchRoute()){
      // The route shell never projects a local or previous account's task data.
      // The mounted panel owns its draft and freezes itself on account changes.
      $('content').innerHTML=head('Team','Completed reviews and saved receipts.')+'<a class="text-button" href="#team">Back to Team</a>';
      reconcileWorkbenchRoute(status);return;
    }
    if(!status.ready){$('content').innerHTML='<div class="loading">Opening your account…</div>';return;}
    if(status.error){$('content').innerHTML=head('Your data needs attention','Your original records have been retained.')+'<div class="banner">'+esc(status.error)+'</div>'+button('Export original backup','backup')+' '+button('Reload workspace','reload');return;}
    if(showExchange){$('content').innerHTML=head('Agent connection','Lead saves and receipt recovery in the current Proton account.')+'<p><a class="link" href="#team">Back to team →</a></p>';releaseUpdates?.restore();return;}
    let html='';
    if(current==='control')html=ProtonCrmControl.render({sites:D.sites(),state:agent(),followups:D.followups(),contacts:D.contacts(),date:day(),connection:D.status()},{head,stat,esc,icon,row,tag,money,href,stageLabel,leadCard});else if(current==='today')html=renderToday();else if(current==='requests')html=intakeInbox.html();else if(current==='pipeline')html=renderPipeline();else if(current==='discover')html=renderDiscover();else if(current==='team')html=renderTeam();else if(current==='people')html=renderPeople();else html=renderSettings();
    $('content').innerHTML=(status.syncError?'<div class="banner" role="status">'+esc(status.syncError)+' · Local changes are retained.</div>':'')+syncNotice(status)+html;
    $('content').querySelectorAll('label').forEach(label=>{const control=label.querySelector('select,input');if(control&&!control.hasAttribute('aria-label'))control.setAttribute('aria-label',label.firstChild.textContent.trim());});
    if(current==='requests')intakeInbox.mount($('content'));
    if(current==='discover')discovery.mount();
    if(current==='control')stopWorkFreshness=ProtonCrmControl.watchFreshness($('content'),()=>agent().tasks,{getConnection:()=>D.status()});
    releaseUpdates?.restore();
  }
  function queueRender(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;render();});}
  function renderToday(){
    const sites=D.sites(),s=agent(),all=M.pipeline(sites,s.leads||[],s.deals),open=all.filter(r=>r.group!=='closed'),items=M.today({state:s,sites,leads:s.leads||[],tasks:s.tasks,followups:D.followups(),date:day()}),reviews=s.tasks.filter(t=>F.bucket(t)==='review').length;
    const date=new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});
    const list=items.slice(0,8).map(i=>row({name:i.name,sub:i.context,end:i.due&&i.due<day()?'Overdue':i.kind==='task'?'Review':'Today',glyph:i.kind==='followup'?'today':i.kind==='task'?'task':'people',action:i.kind==='followup'?'reminder':'open-'+i.kind,id:i.id})).join('');
    const recent=open.slice(0,4).map(r=>row({name:r.name,sub:kinds[r.kind]+' · '+stageLabel(r.kind,r.stage),url:href(r.kind,r.id),glyph:r.kind==='site'?'site':'people'})).join('');
    return head('A clear next step.','Good deals start with a useful conversation.','add','Add new',date)+
      '<div class="stat-grid">'+stat('Due & overdue',items.filter(i=>i.due&&i.due<=day()).length,'Actions to follow up','show-due')+stat('Active records',open.length,'In your pipeline','go-pipeline')+stat('Team reviews',reviews,'Quality and Revenue own this queue','show-reviews')+'</div>'+
      '<div class="split-layout"><div class="stack"><section class="panel"><div class="panel-head"><h2>Next actions</h2>'+tag(items.length+' pending')+'</div>'+(list||empty('Nothing waiting on you.','Add a prospect or assign a research task. Your follow-ups and team reviews will appear here.','go-discover','Find a prospect','today'))+(items.length>8?'<div class="panel-body">'+textButton('View all '+items.length+' actions','show-due')+'</div>':'')+'</section>'+
      (recent?'<section class="panel"><div class="panel-head"><h2>In motion</h2><a class="text-button" href="#pipeline">View pipeline</a></div>'+recent+'</section>':'')+'</div><div class="stack">'+(!all.length?'<section class="panel onboard"><p class="eyebrow">ONE CONNECTED WORKSPACE</p><h2>From a promising lead<br>to a signed deal.</h2><p>Find the right opportunity. Know the cost. Keep the next conversation moving.</p><a class="button" href="#discover">Discover energy sites '+icon('arrow')+'</a><div style="margin-top:24px"><div class="path-step"><span>01</span>Research the site and decision-maker</div><div class="path-step"><span>02</span>Confirm infrastructure and terms</div><div class="path-step"><span>03</span>Review the evidence and agree a deal</div></div></section>':'')+'<section class="panel"><div class="panel-head"><h2>Your Grokbot team</h2>'+icon('team')+'</div><div class="panel-body"><p class="muted" style="font-size:13px">'+s.tasks.filter(A.actionable).length+' open tasks · '+(s.paused?'Queue paused':'Ready for assignments')+'</p><a class="text-button" href="#team">Open team workspace →</a></div></section></div></div>';
  }
  function stageLabel(kind,stage){return kind==='site'?CrmConfig.stageLabel(stage):kind==='lead'?A.LEAD_STAGES[stage]:A.STAGES[stage];}
  function renderPipeline(){
    const state=agent(),all=M.pipeline(D.sites(),state.leads||[],state.deals),filtered=all.filter(r=>(pipelineWorkflow==='all'||r.kind==='lead'&&F.leadProgress(state.leads.find(l=>l.id===r.id),state).step===pipelineWorkflow)&&(pipelineKind==='all'||r.kind===pipelineKind)&&(pipelineGroup==='all'||r.group===pipelineGroup)&&[r.name,r.subtitle].join(' ').toLowerCase().includes(pipelineSearch.toLowerCase()));
    return head('Your pipeline.','See where each opportunity stands and what happens next.','add','Add new')+(pipelineKind==='lead'?F.overview(state,{selected:pipelineWorkflow}):'')+
      '<div class="toolbar"><div class="segmented" aria-label="Pipeline type">'+[['all','Everything'],['site','Energy'],['lead','Leads'],['deal','Service deals']].map(([id,label])=>'<button data-action="pipeline-kind" data-id="'+id+'" aria-pressed="'+(pipelineKind===id)+'">'+label+'</button>').join('')+'</div>'+search('pipelineSearch','Search your pipeline',pipelineSearch)+'</div>'+
      (pipelineWorkflow!=='all'?'<p class="wf-filter-note">Showing '+esc((F.steps.find(s=>s[0]===pipelineWorkflow)||[])[1]||pipelineWorkflow)+'<button class="text-button" data-action="workflow-stage" data-id="all">Clear stage filter</button></p>':'')+'<div class="segmented" aria-label="Deal progress">'+M.groups.map(g=>'<button data-action="pipeline-group" data-id="'+g.id+'" aria-pressed="'+(pipelineGroup===g.id)+'">'+g.label+'</button>').join('')+'</div><p class="result-count">'+filtered.length+' records'+(pipelineGroup==='all'?' · Select one to see its next step.':'')+'</p><section class="panel" id="pipelineList">'+
      (filtered.length?filtered.slice(0,pipelineLimit).map(r=>r.kind==='lead'?leadCard(state.leads.find(l=>l.id===r.id)):row({name:r.name,sub:kinds[r.kind]+' · '+r.subtitle,badge:tag(stageLabel(r.kind,r.stage)),glyph:r.kind==='site'?'site':'people',url:href(r.kind,r.id)})).join(''):empty(all.length?'No matches.':'Build your first opportunity.','Save an energy site from Discover, or add a revenue lead.','go-discover','Discover sites'))+'</section>'+(filtered.length>pipelineLimit?button('Show more','pipeline-more'):'');
  }
  function search(id,label,value){return '<label class="search-box"><span class="visually-hidden">'+esc(label)+'</span>'+icon('discover')+'<input id="'+id+'" type="search" value="'+esc(value)+'" placeholder="'+esc(label)+'" autocomplete="off"></label>';}
  const discovery=ProtonCrmDiscovery.create({data:D,model:M,esc,options,row,tag,empty,onBrief:value=>energyBriefForm(value),onSelect:id=>candidateDetail(id),onRestore:(id,tab)=>{if(!modalForm){siteTab=tab||'overview';candidateDetail(id,true);}}});
  function renderDiscover(){return discovery.html();}
  function renderTeam(){
    const s=agent(),tasks=s.tasks.filter(t=>F.matches(t,taskFilter)&&(!taskRole||t.role===taskRole));
    let html=head('Proton Revenue Desk.','Six Grokbots. One place for assignments, evidence and feedback.','new-task','New task')+'<div class="toolbar"><div class="segmented" aria-label="Team views">'+[['workflow','Progress'],['tasks','Assignments'],['roles','Team & workflows'],['revenue','Revenue'],['activity','Activity']].map(([id,label])=>'<button data-action="team-tab" data-id="'+id+'" aria-pressed="'+(teamTab===id)+'">'+label+'</button>').join('')+'</div>'+textButton(s.paused?'Resume queue':'Pause queue','pause')+'</div>';
    const status=D.status(),connection=status.agent;html+='<section class="team-connection"><div><strong>Existing Proton Grok team</strong><p>'+esc(registerConfirmed(status)?status.uid?'Shared task register verified.':'On this device · sign in to share tasks.':'Task register is not confirmed current.')+' Conversations remain in Grok; task status is recorded here.</p></div>'+button('CRM handoff','setup')+'</section>';
    html+='<p><a class="text-button" href="#team/workbench">Agent workbench</a></p>';
    if(s.paused)html+='<div class="banner">Queue paused. Stop active work separately in Grok.</div>';
    if(teamTab==='workflow')html+=ProtonCrmControl.recentWork(s,{esc},{connection:status})+F.overview(s)+'<section class="panel">'+((s.leads||[]).filter(l=>!F.leadProgress(l,s).closed).map(leadCard).join('')||empty('No individual leads saved yet.','Research batches above may contain candidates awaiting qualification. They become visible here when saved as lead records.','new-lead','Add a lead','people'))+'</section>';
    if(teamTab==='tasks')html+='<div class="filters"><label>Show<select id="taskFilter">'+options({open:'Open work',review:'Team review',owner:'Owner decisions',correction:'Corrections requested',blocked:'Execution blockers',working:'In progress',ready:'Ready for handoff',draft:'Drafts',reference:'Reference / superseded',closed:'Completed / cancelled',all:'All tasks'},taskFilter)+'</select></label><label>Role<select id="taskRole">'+options(Object.assign({'':'All roles'},Object.fromEntries(A.ROLES.map(r=>[r.id,r.name]))),taskRole)+'</select></label></div><section class="panel">'+(tasks.length?tasks.map(t=>row({name:t.title,sub:'Next: '+F.taskMeaning(t,s).owner+' · '+F.taskMeaning(t,s).next+(t.due?' · Due '+t.due:''),badge:tag(F.taskMeaning(t,s).label,['review','owner','blocked'].includes(F.bucket(t))),glyph:'task',url:href('task',t.id)})).join(''):empty('Give your team a useful job.','Start with a site, a buyer, or a question. Tasks begin as drafts until you prepare the handoff.','new-task','Create a task','team'))+'</section><p class="quiet-note">Task statuses are recorded workflow updates. A ready task does not start a bot or send outreach.</p>';
    if(teamTab==='roles')html+='<div class="team-grid">'+G.roles.map(r=>'<button class="role-card" data-action="role" data-id="'+r.id+'"><span class="avatar">'+r.initials+'</span><h3>'+r.botName+'</h3><p>'+r.job+'</p><span class="role-count">'+s.tasks.filter(t=>t.role===r.id&&A.actionable(t)).length+' open assignments →</span></button>').join('')+'</div><section class="panel"><div class="panel-head"><h2>Start a workflow</h2></div>'+row({name:'Source miners for a buyer',sub:'Supplier shortlist, comparable quotes, volume terms and owner review.',action:'sourcing-start',glyph:'task'})+row({name:'Research an energy opportunity',sub:'Infrastructure, remaining capital, authority and availability.',action:'workflow',id:'energy',glyph:'site'})+row({name:'Find buyers for a paid pilot',sub:'Buying signals, contact routes and an outreach draft.',action:'workflow',id:'revenue',glyph:'people'})+Object.entries(G.workflows).filter(([key])=>key.startsWith('hosting_')).map(([key,w])=>row({name:w.title,sub:w.description||'Managed Energy Hosting · draft assignment',action:'workflow',id:key,glyph:'site'})).join('')+row({name:'Review a result before delivery',sub:'Sources, assumptions and a clear pass or revise decision.',action:'workflow',id:'review',glyph:'check'})+'</section><div class="actions" style="margin-top:18px">'+button('Grok connection & setup','setup')+'</div>';
    if(teamTab==='revenue')html+=renderRevenue();
    if(teamTab==='activity')html+='<section class="panel">'+(s.activity.length?s.activity.slice(0,80).map(e=>'<div class="row"><span class="row-copy"><strong>'+esc(e.message)+'</strong><span class="sub">'+esc(new Date(e.at).toLocaleString())+'</span></span></div>').join(''):empty('No activity yet.','Task, lead and revenue updates will appear here.'))+'</section>';
    return html;
  }
  function renderRevenue(){
    const s=agent(),m=A.metrics(s,month);return '<div class="filters"><label>Reporting month<input id="revenueMonth" type="month" value="'+month+'"></label></div><div class="stat-grid">'+stat('Collected contribution',money(m.contribution/100),'After costs and reserves','cash-info')+stat('Open proposed fees',money(m.pipeline/100),'Potential · not revenue','deal-list')+stat('Monthly target',money(s.goalCents/100),'Contribution goal','goal')+'</div><section class="panel"><div class="panel-head"><h2>Service opportunities</h2>'+textButton('Add deal','new-deal')+'</div>'+(s.deals.length?s.deals.map(d=>row({name:d.name,sub:A.OFFERS[d.offer]+' · '+A.STAGES[d.stage],end:money(d.feeCents/100),url:href('deal',d.id),glyph:'cash'})).join(''):empty('Track a paid assignment.','A proposed fee stays separate from collected revenue.','new-deal','Add opportunity','cash'))+'</section><section class="panel" style="margin-top:22px"><div class="panel-head"><h2>Cash record</h2>'+textButton('Record cash','new-cash')+'</div><div class="panel-body"><p class="quiet-note">Manual USD register. Record actual payments and references.</p><div class="table-wrap"><table><thead><tr><th>Date</th><th>Record</th><th>Amount</th><th>Action</th></tr></thead><tbody>'+s.entries.filter(e=>e.date.slice(0,7)===month).map(e=>'<tr><td>'+esc(e.date)+'</td><td>'+esc(e.note)+'<br><small>'+esc(A.KINDS[e.kind])+(e.voidedAt?' · VOIDED':'')+'</small></td><td>'+money(e.cents/100)+'</td><td>'+(e.voidedAt?esc(e.voidReason):textButton('Correct','void-cash',e.id))+'</td></tr>').join('')+'</tbody></table></div></div></section>';
  }
  function renderPeople(){
    const contacts=D.contacts().filter(c=>[c.name,c.organization,c.email,c.phone].join(' ').toLowerCase().includes(peopleSearch.toLowerCase()));return head('People, not just companies.','Keep the people who can move a deal forward.','new-contact','Add person')+'<div class="toolbar">'+search('peopleSearch','Find a name, company or contact',peopleSearch)+'</div><section class="panel">'+(contacts.length?contacts.slice(0,100).map(c=>row({name:c.name||c.organization||'Saved contact',sub:[c.title,c.organization,c.email||c.phone].filter(Boolean).join(' · '),glyph:'people',action:'edit-contact',id:c.id})).join(''):empty('A relationship starts here.','Save a person, their role, and a phone or email. Published site contacts also appear inside each energy opportunity.','new-contact','Add a person','people'))+'</section>';
  }
  function renderSettings(){const s=D.status();return head('Your workspace.','Proton CRM · independent app, connected records.')+'<section class="panel">'+row({name:s.uid?'Proton account':'On this device',sub:s.uid?'Agent register: '+s.agent.mode:'Local records stay in this browser until connected.',action:'account',glyph:'people'})+row({name:'People',sub:'Names, roles, phone numbers and email addresses.',url:'#people',glyph:'people'})+row({name:'Export a CRM backup',sub:'Prospects, contacts, follow-ups, evidence and the agent register.',action:'backup',glyph:'task'})+row({name:'Outbound email readiness',sub:'Sender test, reply path, company footer and authorized scope.',action:'email-readiness',glyph:'task'})+row({name:'Agent connection',sub:'Lead saves and exact server receipts.',url:'#team/exchange',glyph:'team'})+row({name:'Grok connection & setup',sub:'Team instructions, task handoffs and connection boundaries.',action:'setup',glyph:'team'})+row({name:'Open Proton software',sub:'Calculators, mining operations and the full map.',url:'../app/index.html',glyph:'site'})+'</section><section class="panel" style="margin-top:22px"><div class="panel-head"><h2>Made for the next conversation</h2></div><div class="panel-body"><p class="quiet-note">This app shares existing Proton records on the same domain. Your saved stages, contacts and capital evidence remain in their original stores. Installing or opening a different hostname does not transfer browser data.</p><p class="quiet-note">Add Proton CRM to your home screen from your browser’s Share or Install menu. It opens with its own name and navigation.</p></div></section>';}
  function role(id){return G.role(id);}
  function options(map,selected){return Object.entries(map).map(([v,l])=>'<option value="'+esc(v)+'"'+(String(selected)===v?' selected':'')+'>'+esc(l)+'</option>').join('');}
  // Detail panels and write forms are defined below; each form captures its original revision.
  function route(){
    agentWorkbench?.destroy();agentWorkbench=null;workbenchGate='';
    taskRequest=null;completedReviewSession=null;
    const parts=location.hash.replace(/^#/,'').split('/');current=['control','today','requests','pipeline','discover','team','people','settings'].includes(parts[0])?parts[0]:'control';
    try{selection=parts[0]==='team'&&parts[1]==='exchange'&&parts.length===2?{kind:'exchange'}:parts.length>=3?{kind:parts[1],id:decodeURIComponent(parts.slice(2).join('/'))}:null;}catch(_){selection=null;}
    if(sheet.open)sheet.close();modalForm=false;siteTab='overview';render();
    if(selection){if(selection.kind==='site')openSite(selection.id);else if(selection.kind==='lead')openLead(selection.id);else if(selection.kind==='task')openTask(selection.id);else if(selection.kind==='deal')dealForm(selection.id);}
  }
  window.addEventListener('hashchange',route);
  $('sheetClose').onclick=close;$('sheetBack').onclick=()=>modalBack&&modalBack();
  sheet.addEventListener('cancel',e=>{e.preventDefault();close();});
  D.subscribe(reason=>{
    if(reason==='account'){
      expandedLeads.clear();expandedLeadSections.clear();if(selection?.kind==='lead')expandedLeads.add(selection.id);discovery.collapseDetail(false);
      if(sheet.open){if(completedReviewSession)freezeCompletedReviewAccount();else if(isWorkbenchRoute()){/* Await initial auth, or let the mounted workbench freeze its original draft. */}else if(!taskRequest){sheet.close();modalForm=false;selection=null;note('Account changed. Reopen the record before editing.');}}
    }
    if(reason!=='catalog')queueRender();
    if(reason==='remote'&&sheet.open)note('Updated records arrived. Reopen this panel to see the latest version.');
    if(reason==='agents'&&completedReviewSession?.pending)reconcileCompletedReview(completedReviewSession);
    else if((reason==='agents'||reason==='account')&&taskRequest)reconcileTaskRequest();
    else if(reason==='agents'&&sheet.open&&!modalForm&&selection?.kind==='lead')openLead(selection.id);
  });
  // Event handlers are attached after the form and detail definitions.
  let activeSite=null,activeCandidate=null,detailRequest=0;
  const fact=(label,value)=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(value==null||value===''?'Not recorded':value)+'</dd></div>';
  const number=(v,suffix='')=>v==null?'Not confirmed':Math.round(v).toLocaleString()+suffix;
  function sheetStat(label,value,caption){return '<div class="sheet-stat"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong>'+(caption?'<p>'+esc(caption)+'</p>':'')+'</div>';}
  async function openSite(id){
    const s=SiteData.get(id);if(!s){modal('Record unavailable','<p>This energy site is no longer in the saved pipeline.</p>');return;}
    activeSite=s;activeCandidate=D.candidate(s);siteDetail();const request=++detailRequest;
    if(!ProspectStore.loaded())try{await D.load();if(request===detailRequest&&sheet.open&&!modalForm){activeSite=SiteData.get(id);if(activeSite){activeCandidate=D.candidate(activeSite);siteDetail();}}}catch(e){if(request===detailRequest&&sheet.open)error(e);}
  }
  function candidateDetail(id,restore=false){const c=ProspectStore.get(id);if(!c)throw Error('This source record is unavailable. Reload Discover.');activeCandidate=c;activeSite=D.saved(c);if(!restore)siteTab=discovery.brief()?'energy-fit':'overview';detailRequest++;siteDetail();}
  function refreshSite(){if(activeSite)activeSite=SiteData.get(activeSite.id);if(activeSite)activeCandidate=D.candidate(activeSite);siteDetail();}
  function capitalDetail(c,s,e){
    const complete=e.budget.complete&&!e.budget.allowanceCount;
    let html='<section class="crm-capital"><div class="sheet-stats">'+sheetStat('Remaining to fund',e.ready?money(e.base):'Not priced',complete?'Current scoped budget':e.ready?'Planning subtotal + unpriced work':e.reason)+sheetStat('Possible after reuse',e.ready?money(e.reuseScenarioUsd):'Not priced',e.possibleReuseSavingUsd>0?'Conditional estimate · not verified':'No additional reuse saving established')+'</div>';
    html+='<p class="quiet-note">The funding estimate uses scoped quotes, documented reuse and funding shares. Unconfirmed equipment gets a replacement allowance. '+(e.powerPurchase?'Buying power assumes the supplier funds its plant; confirm this in the agreement.':'')+'</p>';
    html+=ProtonPublicInfrastructure.render(c);
    if(e.possibleReuseSavingUsd>0)html+='<div class="next-action"><small>Reuse opportunity · unconfirmed</small><p>'+esc(money(e.possibleReuseSavingUsd))+' potentially avoidable: '+esc(e.possibleReuseAssets.join(', '))+'.</p><p class="quiet-note">The scenario assumes 60% retained value for reported assets, or 35% for shutdown / rework assets, limited by known size. Confirm equipment, repairs and access before counting these savings. Both figures exclude unpriced work.</p></div>';
    if(e.ready)html+='<dl class="fact-list">'+fact('Mine size priced',number(e.targetKw,' net kW'))+fact('Source capacity',number(e.capacity.reportedKw,' kW'))+fact('Power allocated to Proton',number(e.capacity.contractedKw,' net kW'))+'</dl>';
    if(e.capacity.flowRatingConflict||e.capacity.collectionStatusConflict)html+='<div class="banner">Source conflict: '+esc(e.capacity.flowRatingConflict?'Reported gas flow exceeds the collection-system rating. Reconcile measurements and equipment scope before sizing the mine.':'Collection-system records disagree. Verify the equipment with the operator.')+'</div>';
    if(e.capacity.contractedKw!==null&&e.targetKw>e.capacity.contractedKw)html+='<div class="banner">The plan exceeds the documented power allocation.</div>';
    html+='<div class="actions" style="margin:16px 0">'+(s?button('Adjust the plan','planning',s.id)+textButton('Power & capacity','capacity',s.id)+textButton('Operating economics','economics',s.id):button('Save to edit the plan','track-site',c.id,true))+'</div>';
    if(e.ready)html+='<details class="crm-capital-breakdown"><summary>Where the money goes</summary><p class="quiet-note">Build allowances replace the modeled scope at the selected rates. Remaining includes recorded payments, funding and packages once. Both columns exclude unpriced scope.</p><div class="table-wrap"><table><thead><tr><th>Scope</th><th>Build allowance</th><th>Still to fund</th></tr></thead><tbody>'+e.lines.map(l=>'<tr><th>'+esc(l.label)+'</th><td>'+esc(l.full==null?l.id==='reserves'?'Planned contingency':'Outside model':money(l.full))+'</td><td>'+esc(l.base===null?'Unpriced':l.supplierFunded?'Supplier scope':money(l.base))+'<small>'+esc(l.base===null?'':l.supplierFunded?'Confirm funding':l.estimated?'Allowance':l.reuse?'Documented reuse':'Scoped evidence')+'</small></td></tr>').join('')+'</tbody></table></div><dl class="fact-list">'+fact('Modeled infrastructure from scratch',money(e.newInfrastructureUsd))+fact('Modeled full build, miners & contingency',money(e.rebuildUsd))+fact('Proton payments recorded',money(e.budget.paid))+fact('Remaining subtotal',money(e.base))+fact('Planning range',money(e.low)+' – '+money(e.high))+'</dl><p class="quiet-note">The full-build reference excludes site rights, grid work, logistics and other scope without model rates. It is not a seller asset valuation. Recorded quotes can differ from the reference.</p></details>';
    const status={present:'Inspection recorded',reported:'Reported · unverified',historical:'Historical / shutdown',planned:'Planned · not installed',absent:'Reported absent',unknown:'Not established'};
    html+='<p class="group-label">Equipment evidence & remaining work</p><div class="crm-capital-assets">'+e.inventory.map(a=>{const l=e.lines.find(x=>x.id===a.id),credit=l?.reuse?'Reuse documented':a.stale?'Review expired':status[a.presence]||status.unknown;return '<details class="crm-capital-asset"><summary><span>'+esc(a.label)+'<small>'+esc(credit)+'</small></span><span>'+esc(l?.base==null?'Unpriced':l.supplierFunded?'Supplier scope':money(l.base))+'</span></summary><p class="quiet-note">'+esc(a.finding||a.scope)+'</p><dl class="fact-list">'+fact(a.userRecorded?'Evidence checked':'Source period',a.reportingPeriod||'Not published')+fact('Condition',a.condition||'Unknown')+fact('Rights to use',a.access||'Unknown')+(a.capacity_kw!=null?fact('Capacity covered',number(a.capacity_kw,' net kW')):'')+'</dl><p class="quiet-note">'+esc(l?.work||a.scope)+'</p>'+(l?.estimated?'<p class="quiet-note">'+esc(l.evidenceReason||'Needs a scoped quote.')+'</p>':'')+'<p class="quiet-note">'+external(a.source_url,'Open equipment source')+'</p><div class="actions">'+(s?textButton('Update evidence','asset',a.id):textButton('Save to record evidence','track-site',c.id))+'</div></details>';}).join('')+'</div>';
    if(e.extras?.length)html+='<div class="next-action"><small>Still unpriced · add to either estimate</small><p>'+esc(e.extras.join(' · '))+'</p></div>';
    html+='<details class="crm-capital-basis"><summary>Rates, dates & assumptions</summary><dl class="fact-list">'+fact('Pricing market',e.settings.market==='used'?'Used equipment · explicit choice':'New equipment · default')+fact('Source release / period',e.source?.reportingPeriod||'Not published')+fact('Gas collected measurement year',e.capacity.gasCollectedYear||'Not published')+fact('Gas flared measurement year',e.capacity.gasFlaredYear||'Not published')+(e.ready?fact('Miner fleet',e.fleet.model+' · '+e.fleet.count+' units at '+money(e.fleet.unitCostUsd)+' each')+fact('Contingency',e.settings.contingency_pct+'%'):'' )+'</dl><p class="quiet-note">Internal USD planning inputs, not current supplier quotes. A recent import is not a fresh site measurement. Confirm hydro cooling, auxiliary loads, taxes, freight and package exclusions with vendors. The funding range is 70–140% for modeled work; reuse savings are a separate sensitivity, not a verified valuation.</p>'+(e.ready?'<dl class="fact-list">'+Object.entries({miningInfraPerKw:'Mining setup / net kW',generationPerKw:'Generation / planning kW',gasTreatmentPerKw:'Gas treatment / planning kW',collectionPerKw:'Collection / planning kW',interconnectionPerKw:'Plant electrical / planning kW',civilPerKw:'Plant civil / planning kW',commissioningPerKw:'Commissioning / planning kW',permittingFlatUsd:'Engineering & permits · fixed'}).filter(([id])=>!e.powerPurchase||id==='miningInfraPerKw').map(([id,label])=>fact(label,money(e.rates[id]))).join('')+'</dl>':'')+'</details></section>';
    return html;
  }
  function siteDetail(){
    const c=activeCandidate,s=activeSite,e=D.estimate(c,s),p=D.priority(c,s,e,discovery.cashLimit()),source=ProspectDiligence.source(c),qualification=s?DealQualification.evaluate(s):null,next=s?CrmFollowups.nextFor(s.id):null;
    const tabs=[['overview','Overview'],['energy-fit','Client fit'],['capital','Capital'],['hosting','Managed hosting'],['people','Contacts & terms'],['activity','Activity']];
    const identity=SiteIdentity.sourceKeys(c)[0],siblings=identity?ProspectStore.all().filter(r=>SiteIdentity.sourceKeys(r).includes(identity)):[];
    const sourceRecordsHtml=(siblings.length>1?'<details style="margin-bottom:18px"><summary>'+siblings.length+' source records for this physical site</summary><p class="quiet-note">Each project retains its own evidence and estimate. Capacities are not added together.</p>'+siblings.map(r=>textButton((r.sourceDetail&&r.sourceDetail.projectType||r.source)+' · '+(r.sourceDetail&&r.sourceDetail.projectStatus||'Status unknown')+' · '+r.id,'candidate',r.id)).join('<br>')+'</details>':'');
    let html='<div class="sheet-intro">'+tag(energy[c.energyType]||c.energyType)+'<h3>'+esc(s?s.name:c.name)+'</h3><p>'+esc([c.iso3,c.operator||s&&s.operator,c.sourceDetail&&c.sourceDetail.projectStatus].filter(Boolean).join(' · '))+'</p></div>'+(current==='discover'?'':sourceRecordsHtml)+'<div class="segmented sheet-tabs" aria-label="Opportunity details">'+tabs.map(([id,label])=>'<button data-action="site-tab" data-id="'+id+'" aria-pressed="'+(siteTab===id)+'">'+label+'</button>').join('')+'</div>';
    if((discovery.brief()||s?.custom_fields?.[E.KEY]?.current?.brief)&&['overview','capital'].includes(siteTab))html+='<div class="banner">General source-level mine planning. These figures are independent of the client allocation and offered terms. Use Client fit for the scoped energy evidence and unresolved costs.</div>';
    if(siteTab==='overview'){
      html+='<div class="sheet-stats">'+sheetStat('Remaining capital',e.ready?money(e.base):'Needs sizing',e.budget.complete&&!e.budget.allowanceCount?'Scoped remaining budget':'Planning estimate; no unconfirmed reuse')+sheetStat('Planning size',number(e.targetKw,' kW'),'Allocation: '+number(e.capacity.contractedKw,' kW'))+'</div><div class="next-action"><small>Your next step</small><p>'+esc(next?next.description:p.nextAction)+'</p>'+(next?'<p class="quiet-note">Due '+esc(next.due_date)+'</p>':'')+'</div>';
      if(s)html+='<dl class="fact-list">'+fact('Pipeline stage',CrmConfig.stageLabel(s.stage))+fact('Research priority',p.label)+fact('Agreement readiness',qualification.checks.filter(x=>x.ok).length+' of '+qualification.checks.length+' checks')+'</dl><div class="actions" style="margin-top:20px">'+button('Log conversation','log-interaction',s.id,true)+button('Next action','new-followup',s.id)+textButton('Update stage','stage',s.id)+'</div><div class="actions">'+textButton('Agreement & closing checks','qualification',s.id)+textButton('Edit site','edit-site',s.id)+'</div>';
      else html+='<div class="actions">'+button('Add to pipeline','track-site',c.id,true)+'</div><p class="quiet-note">Saves this record for follow-up. It does not mark the site as available or contact the operator.</p>';
      html+='<div class="actions">'+textButton('Ask the team to research this site','research-site',c.id)+'</div><details style="margin-top:15px"><summary>Source & evidence</summary><dl class="fact-list">'+fact('Source',source.label||c.source)+fact('Reporting period',source.reportingPeriod)+fact('Imported',source.importedOn)+'</dl><p class="quiet-note">'+external(source.url,'Open original source')+'</p><p class="quiet-note">Public plant capacity does not establish spare power, ownership transfer or permission to use equipment.</p></details><details><summary>Why this research priority?</summary><dl class="fact-list">'+p.parts.map(part=>fact(part.label,part.basis)).join('')+'</dl><p class="quiet-note">Research order is a screening aid, not a chance of closing. This view has no live BTC/network feed, so it does not award a verified mining-versus-buying-BTC advantage. Use the linked mining calculator for a current scenario.</p><a class="text-button" href="../app/calculator.html">Open mining calculator ↗</a></details>';
    }else if(siteTab==='capital'){
      html+=capitalDetail(c,s,e);
    }else if(siteTab==='energy-fit'){
      html+=energyFitDetail(c,s);
    }else if(siteTab==='hosting'){
      const plan=hostingPlan(s,e);
      html+='<p class="group-label">Proton Managed Energy Hosting</p>'+ManagedHostingUI.results(plan)+'<div class="actions">'+(s?button('Edit hosting plan','hosting-edit',s.id,true):button('Save site to plan hosting','track-site',c.id,true))+button('Export draft proposal','hosting-export')+(s?textButton('Assign hosting diligence','hosting-task',s.id):'')+'</div><p class="quiet-note">'+(s?.custom_fields?.managedHosting?'Saved site-specific assumptions.':'Unsaved illustration using the screened mine size; owner construction budget is unknown.')+'</p>';
    }else if(siteTab==='people'){
      html+='<div class="actions">'+(s?button('Add a person','site-contact',s.id,true):button('Save site to add contacts','track-site',c.id,true))+textButton('Research contacts','research-site',c.id)+'</div>'+ProtonCrmContacts.terms(s)+'<div id="sitePeople" aria-live="polite"><div class="loading">Loading site contacts…</div></div>';
    }else{
      const notes=s?CrmInteractions.currentFor(s.id):[],followups=s?CrmFollowups.forProspect(s.id):[];
      html+=s?'<div class="actions">'+button('Log conversation','log-interaction',s.id,true)+button('Set follow-up','new-followup',s.id)+'</div><p class="group-label">Follow-ups</p>'+followups.map(f=>row({name:f.description,sub:f.due_date+' · '+f.status,action:'reminder',id:f.id,glyph:'today'})).join('')+'<p class="group-label">Conversation history</p>'+notes.map(n=>'<article class="contact-card"><p>'+esc(n.occurred_at?new Date(n.occurred_at).toLocaleDateString():'')+' · '+esc(n.interaction_type||n.type||'Note')+'</p><p class="note-text" style="margin-top:10px">'+esc(n.summary||n.note||'Recorded interaction')+'</p></article>').join('')+(s.notes?'<p class="group-label">Site notes</p><p class="note-text">'+esc(s.notes)+'</p>':'')+(!notes.length&&!followups.length?'<p class="quiet-note">No conversations or follow-ups recorded yet.</p>':''):empty('Save this site first.','Conversations and follow-ups are attached to your saved pipeline.','track-site-active','Add to pipeline');
    }
    if(current==='discover'){
      if(sheet.open)sheet.close();$('sheetBody').innerHTML='';modalForm=false;modalBack=null;
      discovery.showDetail(c.id,(energy[c.energyType]||'Energy site')+' · '+(s?'In your pipeline':'Source prospect'),html+sourceRecordsHtml,siteTab);
    }else modal(s?'Energy opportunity':'Source prospect',html);
    if(siteTab==='people')loadPeople(c,s);
  }
  function hostingPlan(s,e){return s?.custom_fields?.managedHosting||ManagedHosting.normalize({phaseKw:e.targetKw>0?e.targetKw:1000});}
  function hostingForm(){
    const s=activeSite;if(!s)throw Error('Save this site first.');const stamp=D.snapshot(),prior=hostingPlan(s,D.estimate(activeCandidate,s));
    form('Managed hosting plan',ManagedHostingUI.fields(prior),'Save hosting plan',async values=>{
      const plan=ManagedHostingUI.read(values,prior),r=ManagedHosting.calculate(plan);if(!r.valid)throw Error(r.errors.join(' '));
      const saved=await D.saveSite(s.id,{custom_fields:Object.assign({},s.custom_fields,{managedHosting:plan})},stamp);activeSite=saved;activeCandidate=D.candidate(saved);siteTab='hosting';siteDetail();note('Hosting plan saved; no contract or payment was created.');
    },refreshSite);
    $('editForm').insertAdjacentHTML('beforeend','<div id="hostingFormResults" class="mh-preview"></div>');
    $('editForm').addEventListener('change',()=>{$('hostingFormResults').innerHTML=ManagedHostingUI.results(ManagedHostingUI.read(Object.fromEntries(new FormData($('editForm'))),prior));});
  }
  async function loadPeople(c,s){
    const req=++detailRequest,epoch=D.status().epoch,host=$('sitePeople');
    const renderContacts=(directory,research,warning,loading)=>{
      if(req!==detailRequest||epoch!==D.status().epoch||host!==$('sitePeople')||!host.isConnected)return;
      const sd=c.sourceDetail||{},registry=GhgrpContacts.forCandidate(c),op=c.source==='flare-viirs'?SiteCatalog.operatorFor(c.id):null;
      const company=c.operatorId?FacilitySource.companyFor(c.operatorId):op?SiteCatalog.companyFor(op.operator):null;
      const routes=ContactRoutes.routes({name:c.name,owner:registry&&registry.parent||sd.owner||c.operator||s&&s.operator,operator:op&&op.operator||c.operator,parent:registry&&registry.parent,city:sd.city||registry&&registry.city,state:sd.state||registry&&registry.state,county:sd.county||registry&&registry.county,address:registry&&registry.address,frsId:registry&&registry.frsId,ownershipType:sd.ownershipType,counterpartyType:c.counterpartyType});
      host.innerHTML=ProtonCrmContacts.render({candidate:c,saved:s,directory,research,crm:s?CrmContacts.forProspect(s.id):[],company,registry,routes,warning,loading});
    };
    renderContacts(LandfillContacts.get(c),null,false,true);
    const results=await Promise.allSettled([LandfillContacts.loadFor(c),DealRelationships.loadResearch(c),c.source==='lmop-landfill'?GhgrpContacts.load():Promise.resolve(null),c.source==='flare-viirs'?SiteCatalog.loadOperators():Promise.resolve(null)]);
    renderContacts(LandfillContacts.get(c),results[1].status==='fulfilled'?results[1].value:null,results.some(r=>r.status==='rejected')||(c.source==='lmop-landfill'&&!results[2].value),false);
  }
  function energyBriefForm(value,createAssignment=false,researchCandidate=null){
    const b=value||{},sourceChoices=Object.fromEntries(E.matching.sourceTypes.map(s=>[s.id,s.label]));
    const multi=(name,label,selected)=>'<label class="field" for="f_'+name+'">'+esc(label)+'<select id="f_'+name+'" aria-label="'+esc(label)+'" multiple size="6">'+Object.entries(sourceChoices).map(([id,label])=>'<option value="'+id+'"'+((selected||[]).includes(id)?' selected':'')+'>'+esc(label)+'</option>').join('')+'</select></label>';
    const fields=pair(field('client','Client or internal sample',b.client,'text','maxlength="180" placeholder="INTERNAL SAMPLE if no customer"'),field('reference','Brief reference and version',b.reference,'text','required maxlength="180"'))+
      pair(field('states','Included state codes · blank is nationwide',E.list(b.states).join(', '),'text','placeholder="TX, OH"'),field('excludedStates','Excluded state codes',E.list(b.excludedStates).join(', ')))+
      pair(multi('energySources','Allowed sources · none selected means any',b.energySources),multi('excludedSources','Excluded source families',b.excludedSources))+
      pair(field('minMw','Minimum client load · MW',b.minMw,'number','required min="0.001" step="any"'),field('maxMw','Preferred maximum allocation · MW',b.maxMw,'number','min="0.001" step="any"'))+
      '<p class="quiet-note">These are client allocations at the delivery point, not limits on plant nameplate size. Unknown criteria stay blank.</p>'+
      select('costBasis','Primary price scope',E.costBases,b.costBasis||'delivered')+
      pair(field('maxDeliveredCentsKwh','Delivered price ceiling · USD cents/kWh',b.maxDeliveredCentsKwh,'number','min="0.001" step="any"'),field('maxEnergyCentsKwh','Energy-only price ceiling · USD cents/kWh',b.maxEnergyCentsKwh,'number','min="0.001" step="any"'))+
      field('maxSiteCapitalUsd','Maximum client site capital · USD',b.maxSiteCapitalUsd,'number','min="0" step="any"')+
      pair(select('supply','Required supply',{'':'Unknown; confirm with client',...E.supply},b.unknownCriteria?.includes('supply')?'':b.supply||''),select('operation','Operating profile',{'':'Unknown; confirm with client',...E.operation},b.unknownCriteria?.includes('operation')?'':b.operation||''))+
      pair(field('minUptimePct','Minimum service uptime · %',b.minUptimePct,'number','min="0" max="100" step="any"'),field('minTermMonths','Minimum term · months',b.minTermMonths,'number','min="0.01" step="any"'))+
      pair(select('connectionReadiness','Connection readiness',{'':'Unknown; confirm with client',...E.readiness},b.unknownCriteria?.includes('connectionReadiness')?'':b.connectionReadiness||''),field('startBy','Required start date',b.startBy,'date'))+
      area('knownSiteExclusions','Known-site exclusions · exact source or physical IDs',E.list(b.knownSiteExclusions).join('\n'),'maxlength="2000"')+
      area('notes','Delivery point, initial / target load, auxiliary load and other requirements',b.notes||'','maxlength="1500"')+
      area('additionalRequirements','Additional client requirements',(b.additionalRequirements||'').replace(/^Confirm client criteria: (?:supply|operation|connectionReadiness)(?:, (?:supply|operation|connectionReadiness))*\.\s*$/gm,'').trim(),'maxlength="1500"')+
      '<p class="quiet-note">Applying a brief filters this visit only. Save site evidence or create a research assignment to preserve the exact brief for later. Our specialty is landfill and stranded gas; your allowed sources control this search. A saved site is a research lead. Assign work only for a specific brief and a sourced question worth investigating; no site owner is contacted.</p>';
    form('Client energy search brief',fields,createAssignment?'Prepare research assignment':'Apply client brief',v=>{
      for(const key of ['energySources','excludedSources'])v[key]=[...$('f_'+key).selectedOptions].map(o=>o.value);
      const brief=E.normalizeBrief(v);discovery.setBrief(brief);sheet.close();modalForm=false;modalBack=null;if(createAssignment)taskForm(E.assignment({brief,candidate:researchCandidate,source:researchCandidate?ProspectDiligence.source(researchCandidate):null,page:activeSite?new URL(href('site',activeSite.id),location.href).href:location.href}));else{if(activeCandidate&&siteTab==='energy-fit')refreshSite();note('Client brief applied. Open Client fit on a site for the evidence and next questions.');}
    });
  }
  function energyFitDetail(c,s){
    const current=s?.custom_fields?.[E.KEY]?.current,b=discovery.brief()||current?.brief,raw=E.candidate(c,s),fit=b?E.assess(c,s,b):null;
    const labels={qualified_for_review:'Ready for independent review',needs_confirmation:'Needs confirmation',excluded:'Excluded for this brief'};
    let html='<p class="group-label">Client energy fit</p><dl class="fact-list">'+fact('Reported source families',(raw.energyTypes||[]).map(id=>E.matching.sourceTypes.find(t=>t.id===id)?.label||id).join(', '))+fact('Plant nameplate',number(raw.nameplateMw,' MW'))+fact('Reported actual output / period',current?.actualOutput||'Unknown; nameplate is not actual output')+fact('Resource potential',number(raw.resourcePotentialMw,' MW equivalent'))+'</dl>';
    if(fit){html+='<div class="next-action"><small>'+esc(b.reference||b.client||'Internal sample')+'</small><p>'+esc(labels[fit.status])+'</p></div><dl class="fact-list">'+fact('Offered net client allocation',number(fit.candidate.availableMw,' MW'))+fact('All-in delivered price',number(fit.candidate.deliveredCentsKwh,' USD cents/kWh'))+fact('Client site capital',money(fit.candidate.capitalUsd))+'</dl>';
      for(const [title,values]of [['Disqualifiers',fit.disqualifiers],['Unresolved checks',fit.missing],['Ranking reasons',fit.reasons]])if(values.length)html+='<h3>'+title+'</h3><ul>'+values.map(v=>'<li>'+esc(v)+'</li>').join('')+'</ul>';
    }else html+='<p>Apply a client search brief to compare load, geography, price, delivery and timing.</p>';
    if(current)html+='<details><summary>Recorded evidence and history</summary><p>'+esc(current.recordedBy)+' · '+esc(current.asOf)+' · '+esc(current.ownerConfirmed?'Attributed to owner':'Reported; owner confirmation outstanding')+'</p><p class="note-text">'+esc(current.source)+'\n'+esc(current.findings||'')+'</p><p>Next owner-confirmation question: '+esc(current.nextQuestion||'Not recorded')+'</p><p class="quiet-note">'+(s.custom_fields[E.KEY].history||[]).length+' prior evidence versions retained. Terms apply only to the recorded brief and delivery scope.</p></details>';
    html+='<div class="actions">'+button(b?'Edit client brief':'Set client brief','energy-brief')+(s?button('Record energy evidence','energy-evidence',s.id):button('Save site to record evidence','track-site',c.id))+textButton('Prepare energy research assignment','energy-research')+'</div><p class="quiet-note">Public nameplate and historical output never establish uncommitted power. A ranking is a research order, not availability, engineering approval or permission to approach the owner. Storage needs a charging plan.</p>';
    return html;
  }
  function energyEvidenceForm(){
    const s=activeSite;if(!s)throw Error('Save the site before recording evidence.');const previous=s.custom_fields?.[E.KEY]||{},savedCurrent=previous.current||{},brief=discovery.brief()||savedCurrent.brief,current=brief&&savedCurrent.brief&&JSON.stringify(E.normalizeBrief(brief))===JSON.stringify(E.normalizeBrief(savedCurrent.brief))?savedCurrent:{};
    if(!brief){energyBriefForm();return;}const stamp=D.snapshot(),v=current.evidence||{},value=key=>v[key]?.value??'';
    const fields='<p class="quiet-note">Evidence applies to '+esc(brief.reference)+' and this client delivery scope. Leave unknown values blank; record zero only when the cited evidence establishes zero.</p>'+
      pair(field('recordedBy','Recorded by',current.recordedBy,'text','required maxlength="180"'),field('asOf','Evidence effective / confirmation date',current.asOf,'date','required max="'+day()+'"'))+
      field('validThrough','Evidence valid through',current.validThrough,'date')+area('source','Source URLs and attributable owner / document reference',current.source||'','required maxlength="2000"')+
      check('ownerConfirmed','The cited owner evidence explicitly confirms every supplied term for this brief and delivery point.',current.ownerConfirmed)+
      pair(field('availableMw','Uncommitted net capacity offered to this client · MW',value('availableMw'),'number','min="0" step="any"'),select('capacityBasis','Offered capacity basis',{offered_electrical_capacity:'Offered electrical allocation',verified_fuel_electric_equivalent:'Verified fuel-to-electric equivalent'},v.availableMw?.basis||'offered_electrical_capacity'))+
      area('actualOutput','Actual measured output, units and period · separate from nameplate',current.actualOutput||'','maxlength="700"')+
      pair(field('deliveredCentsKwh','All-in delivered energy · USD cents/kWh',value('deliveredCentsKwh'),'number','min="0" step="any"'),field('energyCentsKwh','Energy-only price · USD cents/kWh',value('energyCentsKwh'),'number','min="0" step="any"'))+
      field('capitalUsd','Total client site capital · USD',value('capitalUsd'),'number','min="0" step="any"')+
      pair(select('rights','Sale and site-use rights',{'':'Unknown',available:'Available for this scope',unavailable:'Unavailable'},value('rights')),select('supply','Offered supply',{'':'Unknown',...E.supply},value('supply')))+
      pair(select('operation','Confirmed operating schedule',{'':'Unknown',continuous:'Continuous',interruptible:'Interruptible',seasonal:'Seasonal'},value('operation')),field('uptimePct','Confirmed service uptime · %',value('uptimePct'),'number','min="0" max="100" step="any"'))+
      pair(select('connectionReadiness','Usable load connection',{'':'Unknown',existing:'Existing usable connection',new_build_required:'New connection required'},value('connectionReadiness')),field('readyBy','Confirmed energization date',value('readyBy'),'date'))+
      field('termMonths','Offered term · months',value('termMonths'),'number','min="0" step="any"')+area('chargingPlan','Storage charging source, cost, MW / MWh, duration, losses and cycling',value('chargingPlan'),'maxlength="1500"')+
      area('findings','Evidence gaps, conflicts, disqualifiers and conditions',current.findings||'','maxlength="1500"')+area('nextQuestion','Next owner-confirmation question and responsible role',current.nextQuestion||'','maxlength="1000"');
    form('Record client-scoped energy evidence',fields,'Save energy evidence',async raw=>{
      const next=E.saveEvidence(previous,raw,new Date().toISOString());next.current.brief=JSON.parse(JSON.stringify(brief));
      activeSite=await D.saveSite(s.id,{custom_fields:{...s.custom_fields,[E.KEY]:next}},stamp);sheet.close();modalForm=false;modalBack=null;siteTab='energy-fit';refreshSite();note('Energy evidence saved for this brief. Independent review and external-action gates remain separate.');
    },refreshSite);
  }
  function field(name,label,value='',type='text',extra=''){return '<label class="field" for="f_'+name+'">'+esc(label)+'<input id="f_'+name+'" name="'+name+'" aria-label="'+esc(label)+'" type="'+type+'" value="'+esc(value==null?'':value)+'" '+extra+'></label>';}
  function select(name,label,map,value,descriptionId=''){return '<label class="field" for="f_'+name+'">'+esc(label)+'<select id="f_'+name+'" name="'+name+'" aria-label="'+esc(label)+'"'+(descriptionId?' aria-describedby="'+esc(descriptionId)+'"':'')+'>'+options(map,value)+'</select></label>';}
  function area(name,label,value='',extra=''){return '<label class="field" for="f_'+name+'">'+esc(label)+'<textarea id="f_'+name+'" name="'+name+'" aria-label="'+esc(label)+'" '+extra+'>'+esc(value)+'</textarea></label>';}
  function check(name,label,checked){return '<label class="checkbox"><input type="checkbox" name="'+name+'"'+(checked?' checked':'')+'>'+esc(label)+'</label>';}
  function disclosure(label,fields,open=false){return '<details'+(open?' open':'')+'><summary>'+esc(label)+'</summary><div>'+fields+'</div></details>';}
  function form(title,fields,label,onSave,back){
    modal(title,'<form id="editForm" class="crm-form">'+fields+'<div class="form-actions"><button type="button" class="button" data-action="cancel-form">Cancel</button><button type="submit" class="button primary">'+esc(label)+'</button></div></form>',back,true);
    $('editForm').addEventListener('submit',async event=>{
      event.preventDefault();if(busy)return;busy=true;const submit=event.currentTarget.querySelector('[type=submit]');submit.disabled=true;$('sheetError').hidden=true;
      try{await onSave(Object.fromEntries(new FormData(event.currentTarget)));}catch(e){error(e);}finally{busy=false;if(submit.isConnected)submit.disabled=!!completedReviewSession?.accountChanged;}
    });
  }
  function siteForm(id){
    const s=id?SiteData.get(id):null,stamp=D.snapshot();if(id&&!s)throw Error('This site is no longer saved.');
    form(s?'Edit energy site':'New energy opportunity',field('name','Site name',s&&s.name,'text','required maxlength="120"')+select('energy_type','Energy source',energy,s&&s.energy_type||'landfill_gas')+field('operator','Owner / operator',s&&s.operator)+pair(field('jurisdiction','Country code',s&&s.jurisdiction,'text','placeholder="USA / CAN" maxlength="3"'),field('usable_kw','Planning capacity · kW',s&&s.usable_kw,'number','min="0" step="any"'))+area('notes','Notes',s&&s.notes||''),'Save site',async v=>{v.usable_kw=v.usable_kw===''?null:Number(v.usable_kw);if(!s)v.stage='researching';const saved=await D.saveSite(id,v,stamp);if(current!=='discover'||!s)location.hash=href('site',saved.id);if(s){activeSite=saved;activeCandidate=D.candidate(saved);siteDetail();}note('Energy site saved.');},s?refreshSite:null);
  }
  function stageForm(id){const s=SiteData.get(id),stamp=D.snapshot();form('Update deal progress',select('stage','Stage',Object.fromEntries(CrmConfig.stages().map(x=>[x.key,x.label])),s.stage)+select('reason','Reason if closing as lost',Object.assign({'':'Choose a reason'},Object.fromEntries(CrmConfig.deadReasons().map(x=>[x.key,x.label]))),'')+'<p class="quiet-note">Won deals require recorded rights, capacity, terms and an executed agreement. Existing detailed stages stay intact.</p>','Save stage',async v=>{await D.stage(id,v.stage,v.reason,stamp);refreshSite();note('Stage saved.');},refreshSite);}
  function followupForm(id){const stamp=D.snapshot();form('Set the next action',field('description','What needs to happen?','','text','required maxlength="500"')+field('due_date','Due date',day(),'date','required'),'Save follow-up',async v=>{await D.followup(Object.assign(v,{prospect_id:id}),stamp);refreshSite();note('Follow-up added to Today.');},refreshSite);}
  function reminder(id){const f=CrmFollowups.get(id);if(!f)throw Error('This follow-up is no longer available.');const s=SiteData.get(f.prospect_id);modal('Follow-up','<div class="sheet-intro"><h3>'+esc(f.description)+'</h3><p>'+esc(s?s.name:'Unlinked reminder')+' · '+esc(f.due_date)+'</p></div><div class="actions">'+(['pending','snoozed'].includes(f.status)?button('Mark done','done-followup',f.id,true):tag(f.status))+(s?'<a class="button" href="'+href('site',s.id)+'">Open opportunity</a>':'')+'</div>');}
  function interactionForm(id){const stamp=D.snapshot();form('Log a conversation',select('type','What happened?',{call:'Call',email:'Email',meeting:'Meeting',site_visit:'Site visit',inbound:'Inbound message',note:'Internal note'},'call')+pair(field('occurred_at','When',day(),'date','required max="'+day()+'"'),select('outcome','Outcome',Object.fromEntries(CrmConfig.outcomes().map(o=>[o.key,o.label])),'neutral'))+area('summary','Conversation notes','','required maxlength="4000"')+disclosure('Add a next action',field('next_action','Next action')+field('next_action_due','Due date','','date')),'Save conversation',async v=>{const r=await D.interaction(id,v,stamp);if(r.partial){error(Error(r.err));return;}refreshSite();note('Conversation recorded.');},refreshSite);}
  function contactForm(id,siteId){
    const c=id?CrmContacts.get(id):null,stamp=D.snapshot(),back=siteId?refreshSite:null;
    form(c?'Edit person':'Add a person',field('name','Name',c&&c.name,'text','required maxlength="120"')+pair(field('title','Job title',c&&c.title),field('organization','Organization',c&&c.organization))+pair(field('phone','Phone',c&&c.phone,'tel'),field('email','Email',c&&c.email,'email'))+select('role','Role in the deal',{decision_maker:'Decision-maker',operations:'Operations',technical:'Technical',gatekeeper:'Contact route',unknown:'Not established'},c&&c.role||'unknown')+select('siteLink','Link to energy site',Object.assign({'':'No new site link'},Object.fromEntries(D.sites().map(s=>[s.id,s.name]))),siteId||'')+disclosure('Source & notes',field('source','Evidence / source',c&&c.source)+field('last_verified','Last verified',c&&c.last_verified,'date','max="'+day()+'"')+area('notes','Contact notes',c&&c.notes||''),!!c),'Save person',async v=>{const links=c?c.linked_prospects.slice():[];if(v.siteLink&&!links.includes(v.siteLink))links.push(v.siteLink);delete v.siteLink;delete v.linked;v.linked_prospects=links;await D.contact(id,v,stamp);if(back)back();else close();note('Contact saved.');},back);
  }
  function proof(v){return area('evidence_note','Evidence or document reference',v.evidence_note||'','required maxlength="2000"')+pair(field('reviewer','Checked by',v.reviewer||'','text','required'),field('checked_on','Checked on',v.checked_on||day(),'date','required max="'+day()+'"'))+field('source_url','Source URL · optional',v.source_url||'','url');}
  function diligenceForm(type,component){
    if(!activeSite){note('Add this site to your pipeline before recording evidence.');return;}
    const s=SiteData.get(activeSite.id),ds=ProspectDiligence.state(s),stamp=D.snapshot();if(ds.error)throw Error(ds.error);
    const e=D.estimate(activeCandidate,s);let fields='',title='',v={};
    if(type==='planning'){
      v=ds.planning||{};title='Adjust the capital plan';fields=field('target_kw','Planning size · net kW',v.target_kw,'number','min="0.001" step="any" placeholder="Source estimate"')+select('strategy','Approach',{reuse:'Reuse existing equipment',power:'Buy power from the operator',rebuild:'Full new build'},v.strategy||e.settings.strategy)+select('market','Equipment market',{auto:'Default · new equipment',new:'New equipment',used:'Used equipment'},v.market||'auto')+pair(field('contingency_pct','Construction contingency · %',v.contingency_pct==null?15:v.contingency_pct,'number','required min="0" max="100" step="any"'),field('mining_infra_usd_per_mw','Complete mining setup · USD / MW',v.mining_infra_usd_per_mw,'number','min="0" step="any"'))+'<p class="quiet-note">Mining setup includes containers, cooling, distribution, pads, network and installation. It excludes miners and generation. Blank uses the existing rate card.</p>';
    }else if(type==='capacity'){
      v=ds.capacity||{};title='Power available to Proton';fields=pair(field('target_kw','Planning size · net kW',v.target_kw,'number','min="0.001" step="any"'),field('contracted_kw','Contracted net capacity · kW',v.contracted_kw,'number','min="0" step="any"'))+check('rights_confirmed','The cited agreement allocates this net power at the mining meter to Proton.',v.rights_confirmed)+field('contract_expires','Agreement expiry',v.contract_expires,'date')+proof(v);
    }else if(type==='economics'){
      v=ds.economics||{};title='Operating economics';fields=select('cost_basis','Basis',{allowance:'Planning assumption',quote:'Current scoped quote / review'},v.cost_basis||'allowance')+pair(field('capacity_kw','Reviewed capacity · kW',v.capacity_kw,'number','min="0.001" step="any"'),field('all_in_power_usd_kwh','All-in energy · USD / kWh',v.all_in_power_usd_kwh,'number','min="0" step="any"'))+pair(field('minimum_monthly_power_usd','Minimum power payment · USD / month',v.minimum_monthly_power_usd,'number','min="0" step="any"'),field('fixed_monthly_usd','Other operating costs · USD / month',v.fixed_monthly_usd,'number','min="0" step="any"'))+pair(field('uptime_pct','Uptime · %',v.uptime_pct,'number','min="0" max="100" step="any"'),field('pool_fee_pct','Pool fee · %',v.pool_fee_pct,'number','min="0" max="100" step="any"'))+pair(field('term_months','Usable term · months',v.term_months,'number','min="0.01" max="600" step="any"'),field('months_to_operation','Months to operation',v.months_to_operation,'number','min="0" max="120" step="any"'))+field('quote_expires','Quote expiry',v.quote_expires,'date')+check('operating_scope_complete','All operating scope is priced, with zero entered only where established by evidence.',v.operating_scope_complete)+proof(v);
    }else{
      v=ds.assets[component]||{};const comp=ProspectDiligence.COMPONENTS.find(x=>x[0]===component);if(!comp)throw Error('Unknown infrastructure component.');title=comp[1];
      fields='<p class="quiet-note">'+esc(comp[2])+'</p>'+pair(select('presence','Evidence',Object.fromEntries(ProspectDiligence.PRESENCE),v.presence||'unknown'),select('condition','Condition',Object.fromEntries(ProspectDiligence.CONDITIONS),v.condition||'unknown'))+select('access','Rights to use it',Object.fromEntries(ProspectDiligence.ACCESS),v.access||'unknown')+select('action','Remaining work',Object.fromEntries(ProspectDiligence.ACTIONS),v.action||'unknown')+pair(select('payer','Who pays?',Object.fromEntries(ProspectDiligence.PAYERS),v.payer||'unknown'),select('cost_basis','Cost basis',{allowance:'Planning allowance',quote:'Current quote'},v.cost_basis||'allowance'))+field('base_usd','Total scope cost · USD',v.base_usd,'number','min="0" step="any"')+pair(field('low_usd','Low case · USD',v.low_usd,'number','min="0" step="any"'),field('high_usd','High case · USD',v.high_usd,'number','min="0" step="any"'))+'<p class="quiet-note">Enter all three costs, or leave all unpriced. Use the same amount three times for a fixed quote.</p>'+disclosure('Funding, package & capacity details',pair(field('paid_usd','Already paid by Proton · USD',v.paid_usd,'number','min="0" step="any"'),field('proton_share_pct','Proton share if shared · %',v.proton_share_pct,'number','min="0" max="100" step="any"'))+field('capacity_kw','Capacity covered · kW',v.capacity_kw,'number','min="0" step="any"')+select('included_in','Included in this other package',Object.assign({'':'Not part of a package'},Object.fromEntries(ProspectDiligence.COMPONENTS.filter(x=>x[0]!==component).map(x=>[x[0],x[1]]))),v.included_in||'')+field('quote_expires','Quote expires',v.quote_expires,'date'))+proof(v);
    }
    form(title,fields,'Save evidence',async values=>{['rights_confirmed','operating_scope_complete'].forEach(k=>{if(k in values)values[k]=values[k]==='on';});await D.diligence(s.id,{type,id:component,revision:ds.revision,value:values},stamp);refreshSite();note('Evidence and history saved.');},refreshSite);
  }
  function qualificationForm(id){
    const s=SiteData.get(id),a=s.acquisition||{},stamp=D.snapshot(),q=DealQualification.evaluate(s);
    const fields='<p class="quiet-note">'+q.checks.filter(x=>x.ok).length+' of '+q.checks.length+' closing checks complete. Save evidence as it arrives.</p>'+disclosure('1. People & rights',field('rights_owner','Energy rights holder',a.rights_owner)+field('surface_owner','Surface owner',a.surface_owner)+field('decision_maker','Authorized decision-maker',a.decision_maker)+select('rights_status','Availability',{unknown:'Not confirmed',available:'Written availability',committed:'Already committed',disputed:'Disputed',unavailable:'Unavailable',encumbered:'Existing obligations'},a.rights_status||'unknown')+area('rights_evidence','Rights evidence',a.rights_evidence||'')+field('rights_verified_on','Rights checked on',a.rights_verified_on,'date','max="'+day()+'"')+area('approval_process','Approval process',a.approval_process||'')+area('owner_motivation','Owner motivation',a.owner_motivation||''),true)+
      disclosure('2. Energy & commercial terms',field('available_kw','Net energy available · kW',a.available_kw,'number','min="0" step="any"')+area('capacity_evidence','Capacity evidence',a.capacity_evidence||'')+field('capacity_verified_on','Capacity checked on',a.capacity_verified_on,'date','max="'+day()+'"')+field('delivered_rate_usd_kwh','Delivered energy · USD / kWh',a.delivered_rate_usd_kwh,'number','min="0" step="any"')+area('cost_responsibility','Who funds infrastructure, fuel, maintenance and site work?',a.cost_responsibility||'')+area('existing_offtake','Existing energy commitments',a.existing_offtake||'')+field('offtake_expiry','Existing commitments expire',a.offtake_expiry,'date')+area('quote_evidence','Quote evidence',a.quote_evidence||'')+field('quote_verified_on','Quote checked on',a.quote_verified_on,'date','max="'+day()+'"'))+
      disclosure('3. Approvals & conditions',DealQualification.CONDITIONS.map(c=>{const v=(a.conditions||{})[c.key]||{};return select(c.key+'_status',c.label,{open:'Not started',in_progress:'In progress',pending:'Not complete',complete:'Complete with evidence'},v.status||'open')+field(c.key+'_evidence','Evidence · '+c.label,v.evidence)+field(c.key+'_date','Completed on · '+c.label,v.completed_on,'date','max="'+day()+'"');}).join(''))+
      disclosure('4. Executed agreement',field('agreement_ref','Executed agreement reference',a.agreement_ref)+pair(field('signed_on','Signed on',a.signed_on,'date','max="'+day()+'"'),field('term_end','Term ends',a.term_end,'date'))+field('contracted_kw','Contracted capacity · kW',a.contracted_kw,'number','min="0" step="any"'));
    form('Agreement & closing checks',fields,'Save closing evidence',async v=>{
      const next=Object.assign({},a),conditions=Object.assign({},a.conditions);
      DealQualification.CONDITIONS.forEach(c=>{conditions[c.key]=Object.assign({},conditions[c.key],{status:v[c.key+'_status'],evidence:v[c.key+'_evidence'],completed_on:v[c.key+'_date']});delete v[c.key+'_status'];delete v[c.key+'_evidence'];delete v[c.key+'_date'];});
      Object.assign(next,v,{conditions});['available_kw','contracted_kw','delivered_rate_usd_kwh'].forEach(k=>next[k]=next[k]===''?null:Number(next[k]));
      const checked=DealQualification.validate(next);if(!checked.ok)throw Error(checked.errors.join(' '));
      await D.saveSite(id,{acquisition:next},stamp);refreshSite();note('Closing evidence saved.');
    },refreshSite);
  }
  function leadForm(id){
    const l=(agent().leads||[]).find(x=>x.id===id)||{},rev=agent().revision,session=D.status();
    if(id&&!l.id)throw Error('This lead is no longer in the register. Refresh before editing.');
    const owner={uid:session.uid,epoch:session.epoch};
    function sameOwner(){const now=D.status();if(now.uid!==owner.uid||now.epoch!==owner.epoch)throw Error('The account changed. Reopen this lead in the intended workspace before saving.');}
    const prepared='<details id="preparedLeadPanel"><summary>Paste prepared lead</summary><div><p class="quiet-note" id="preparedLeadHelp">Paste one JSON object using this form’s field names. For ASIC brokerage, set offer to sourcing. Review the filled fields before saving; unprovided fields stay as they are.</p><label class="field" for="preparedLeadJson">Prepared lead JSON<textarea id="preparedLeadJson" aria-describedby="preparedLeadHelp" maxlength="30000" rows="5" spellcheck="false"></textarea></label><button type="button" class="button" id="applyPreparedLead">Fill form for review</button></div></details><p id="preparedLeadStatus" class="quiet-note" role="status" hidden></p>';
    form(id?'Update revenue lead':'New revenue lead',prepared+field('company','Company',l.company,'text','required maxlength="180"')+field('website','Company website',l.website,'url','required')+pair(select('offer','Service',Object.assign({'':'Choose a service'},A.OFFERS),l.offer||''),select('stage','Lead stage',A.LEAD_STAGES,l.stage||'discovered'))+
      disclosure('Buying signal & contact',area('signal','Why this company, now?',l.signal||'')+field('source','Signal source URL',l.source,'url')+field('checked','Evidence checked on',l.checked,'date','max="'+day()+'"')+field('buyer','Decision-maker / buyer role',l.buyer)+field('contact','Business email, phone or contact page',l.contact)+select('channel','Lead source',A.CHANNELS,l.channel||'direct'),!!id)+
      area('serviceFit','Why would they buy this service?',l.serviceFit||'','maxlength="2000"')+'<p class="quiet-note">State the business problem this offer addresses. Keep weak-fit accounts in Discovered and record what needs checking next.</p>'+field('nextAction','Next action',l.nextAction)+field('due','Next action due',l.due,'date')+
      disclosure('Actual contact & notes',field('lastTouch','Contact / outcome date',l.lastTouch,'date','max="'+day()+'"')+area('lastNote','What actually happened?',l.lastNote||'')+area('notes','Notes / closure or do-not-contact reason',l.notes||''),['contacted','replied','meeting','dnc','disqualified'].includes(l.stage)),
      'Save lead',async v=>{sameOwner();G.validateLead(v);await D.dispatch('lead.save',Object.assign(v,{id:id||uid('lead')}),rev);close();note('Lead saved.');},id?()=>openLead(id):null);
    $('f_offer').required=true;
    $('applyPreparedLead').addEventListener('click',()=>{
      if(busy)return;
      $('sheetError').hidden=true;$('preparedLeadStatus').hidden=true;
      try{
        sameOwner();
        const values=ProtonCrmLeadEntry.parse($('preparedLeadJson').value,{mode:id?'update':'new',offers:A.OFFERS,stages:A.LEAD_STAGES,channels:A.CHANNELS,today:day()});
        // Validate every target before filling any field. This helper never dispatches a save.
        const fields=Object.entries(values).map(([name,value])=>{
          const control=$('editForm').elements.namedItem(name);
          if(!control||!['INPUT','SELECT','TEXTAREA'].includes(control.tagName))throw Error('A prepared field is unavailable. Reopen the lead form.');
          if(control.tagName==='SELECT'&&!Array.from(control.options).some(option=>option.value===value))throw Error('A prepared option is unavailable. Review the selected service and stage.');
          const probe=control.cloneNode(true),expected=control.tagName==='TEXTAREA'?value.replace(/\r\n?/g,'\n'):value;
          probe.value=value;
          if(probe.value!==expected)throw Error('The '+name+' field cannot represent that value. Use a single line for text fields and a valid date for date fields. Nothing was filled.');
          return [control,value];
        });
        fields.forEach(([control,value])=>{control.value=value;const section=control.closest('details');if(section)section.open=true;});
        $('preparedLeadPanel').open=false;
        $('preparedLeadStatus').textContent='Prepared details filled. Review the fields, then select Save lead. Nothing has been saved yet.';
        $('preparedLeadStatus').hidden=false;$('f_offer').focus();
      }catch(e){error(e);}
    });
  }
  function leadSection(lead,key,label,content){
    return '<details class="wf-lead-section" data-lead-section="'+key+'"'+(expandedLeadSections.has(lead.id+'/'+key)?' open':'')+'><summary>'+esc(label)+'</summary><div>'+content+'</div></details>';
  }
  const outreachPermissionLabels={unknown:'Not established',granted:'Permission recorded',revoked:'Revoked'};
  const outreachChannelLabels={not_configured:'Not configured',pending:'Setup / eligibility pending',connected_unverified:'Access recorded · unverified',verified:'Verification evidence recorded',unavailable:'Unavailable'};
  const outreachTouchLabels={draft:'Draft recorded',prepared:'Prepared · not sent',attempted:'Attempt recorded',sent:'Sent · reported',delivered:'Delivered · reported',failed:'Failed',unknown:'Outcome unknown',received:'Inbound received',cancelled:'Unsent plan paused'};
  const outreachRecordNote='<p class="quiet-note">Recording and planning only. No channel sends messages or controls provider jobs from this CRM.</p>';
  const outreachRecorder=()=>field('recordedBy','Recorded by','','text','required maxlength="180"');
  const outreachFact=(label,value)=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(value||'Not recorded')+'</dd></div>';
  function outreachRoute(id){const state=agent(),route=(state.outreach?.routes||[]).find(item=>item.id===id);return route?O.forLead(state,route.leadId).routes.find(item=>item.id===id):null;}
  function outreachLead(id){const lead=(agent().leads||[]).find(item=>item.id===id);if(!lead)throw Error('This lead is no longer in the register.');return lead;}
  function outreachLocalTime(value){const date=value?new Date(value):new Date();return Number.isFinite(date.getTime())?new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16):'';}
  function outreachISO(value){const date=new Date(value);if(!Number.isFinite(date.getTime()))throw Error('Record a valid observation date and time.');return date.toISOString();}
  function outreachRoutesPanel(lead){
    const projection=O.forLead(agent(),lead.id),routes=projection.routes;
    const cards=routes.map(route=>'<details class="crm-outreach-route"><summary><span><strong>'+esc(route.personName||O.CHANNELS[route.channel])+'</strong><small>'+esc(O.CHANNELS[route.channel]+' · '+route.address)+'</small></span>'+tag(route.suppressed?'Suppressed':route.preferred?'Preferred':'Recorded route',route.suppressed||route.preferred)+'</summary><dl class="fact-list">'+outreachFact('Source',route.source)+outreachFact('Checked',route.checkedOn)+outreachFact('Business timezone',route.timezone)+outreachFact('Timezone evidence',route.timezoneSource)+'</dl><div class="crm-outreach-permissions">'+Object.entries(O.PURPOSES).map(([purpose,label])=>'<p><span>'+esc(label)+'</span>'+tag(outreachPermissionLabels[route.permissions?.[purpose]]||'Not established',route.permissions?.[purpose]==='revoked')+'</p>').join('')+'</div><div class="actions">'+button('Record permission','outreach-permission',route.id)+button('Update evidence','outreach-route-evidence',route.id)+(!route.preferred?textButton('Set preferred','outreach-preferred',route.id):'')+(!route.suppressed?textButton('Record route opt-out','outreach-route-suppress',route.id):'')+'</div></details>').join('');
    return '<div class="crm-outreach">'+outreachRecordNote+'<p class="quiet-note">A published address or phone number is a contact route, not permission for every channel or purpose.</p>'+cards+(!routes.length?'<p class="crm-outreach-summary">No structured contact routes yet. The original contact field remains in Company & contact.</p>':'')+'<div class="actions" style="margin-top:14px">'+button('Add contact route','outreach-route-add',lead.id,true)+textButton('Record account opt-out','outreach-account-suppress',lead.id)+'</div>'+(projection.suppressionReasons.length?'<p class="quiet-note">Recorded suppression: '+esc(projection.suppressionReasons.join(' · '))+'</p>':'')+'</div>';
  }
  function outreachPlanPanel(lead){
    const state=agent(),projection=O.forLead(state,lead.id),plan=outreachPlans.get(lead.id)||{},routeId=projection.routes.some(route=>route.id===plan.routeId)?plan.routeId:(projection.routes.find(route=>route.preferred)||projection.routes[0])?.id||'',purpose=Object.hasOwn(O.PURPOSES,plan.purpose)?plan.purpose:'prospecting';
    const evaluation=O.evaluate(state,{leadId:lead.id,routeId,purpose}),blockers=evaluation.blockers||[],nextLabel=blockers.find(item=>item.code!=='transport_inactive')?.message||'Recorded prerequisites are complete for this purpose; execution remains unavailable.',flags=projection.suppressed?'Contact suppressed':projection.unknown?'Reconcile unknown outcome':projection.paused?'Reply pause recorded':projection.parked?'Prospecting parked':'Planning record';
    const optionsHtml=options(Object.assign({'':'Choose a route'},Object.fromEntries(projection.routes.map(route=>[route.id,O.CHANNELS[route.channel]+' · '+route.address]))),routeId);
    const controls='<div class="field-pair"><label class="field">Contact route<select aria-label="Advisory contact route" data-outreach-plan="routeId" data-lead-id="'+esc(lead.id)+'">'+optionsHtml+'</select></label><label class="field">Purpose<select aria-label="Advisory contact purpose" data-outreach-plan="purpose" data-lead-id="'+esc(lead.id)+'">'+options(O.PURPOSES,purpose)+'</select></label></div>';
    return '<div class="crm-outreach crm-outreach-plan"><div class="crm-outreach-status"><div><strong>'+esc(flags)+'</strong><p>'+esc(nextLabel)+'</p></div>'+tag('Execution unavailable',true)+'</div>'+outreachRecordNote+controls+(blockers.length?'<ul class="crm-outreach-blockers">'+blockers.map(item=>'<li>'+esc(item.message||item)+'</li>').join('')+'</ul>':'<p class="quiet-note">Recorded prerequisites are satisfied for this purpose. This does not activate sending.</p>')+(evaluation.nextDueAt?'<p class="quiet-note">Next advisory time · your local time: '+esc(new Date(evaluation.nextDueAt).toLocaleString())+' · recheck current replies and evidence first.</p>':'')+'<p class="crm-outreach-summary">One shared history across channels. A human reply pauses proactive contact; an unknown result needs reconciliation before another attempt.</p>'+disclosure('Channel setup evidence',projection.readiness.map(record=>'<div class="crm-outreach-status"><div><strong>'+esc(O.CHANNELS[record.channel])+'</strong><p>'+esc(outreachChannelLabels[record.status]||record.status)+(record.blocker?' · '+esc(record.blocker):'')+'</p></div>'+textButton('Record evidence','outreach-channel',lead.id+'|'+record.channel)+'</div>').join('')+'<p class="quiet-note">Evidence about external access or tests does not connect a transport. All CRM channel execution remains unavailable.</p>')+'</div>';
  }
  function outreachTouchItem(touch,leadId){
    const observed=touch.occurredAt?new Date(touch.occurredAt):null,date=observed&&Number.isFinite(observed.getTime())?observed.toLocaleString():'Time not recorded';
    const detail=[touch.providerRef?'Provider / receipt: '+touch.providerRef:'',touch.threadRef?'Thread: '+touch.threadRef:'',touch.taskId?'Draft task: '+touch.taskId+' · result '+(touch.resultVersion??'not recorded'):'',touch.messageVersion?'Message version: '+touch.messageVersion:'',touch.reviewTaskId?'Quality task: '+touch.reviewTaskId:'',touch.author?'Author: '+touch.author:'',touch.reviewer?'Reviewer: '+touch.reviewer:'',touch.recordedBy?'Recorded by: '+touch.recordedBy:''].filter(Boolean).join('\n');
    return '<li><header><strong>'+esc((O.CHANNELS[touch.channel]||'Contact')+' · '+(outreachTouchLabels[touch.status]||touch.status||'Recorded touch'))+'</strong><time>'+esc(date)+'</time></header><p class="crm-touch-meta">'+esc((touch.direction==='inbound'?'Inbound':'Outbound')+' · '+(O.PURPOSES[touch.purpose]||touch.purpose||'Purpose not recorded')+(touch.internalTest?' · Internal test':touch.replyKind==='auto'?' · Automatic response':''))+'</p>'+(touch.evidence?'<p>'+esc(touch.evidence)+'</p>':'')+(touch.recordedStatus&&touch.recordedStatus!==touch.status?'<p class="crm-touch-meta">Original state: '+esc(outreachTouchLabels[touch.recordedStatus]||touch.recordedStatus)+'. This is a local planning pause; external jobs are not cancelled here.</p>':'')+(detail?disclosure('Record references','<p class="note-text">'+esc(detail)+'</p>'):'')+(['attempted','unknown','sent','prepared','draft'].includes(touch.recordedStatus||touch.status)?textButton('Reconcile this record','outreach-touch-update',leadId+'|'+touch.id):'')+'</li>';
  }
  function outreachHistoryPanel(lead){
    const projection=O.forLead(agent(),lead.id),touches=projection.touches.slice().sort((a,b)=>String(b.occurredAt||'').localeCompare(String(a.occurredAt||'')));
    return '<div class="crm-outreach">'+outreachRecordNote+'<div class="actions">'+button('Record a touch or reply','outreach-touch-add',lead.id,true)+'</div>'+(touches.length?'<ol class="crm-touch-list">'+touches.slice(0,12).map(touch=>outreachTouchItem(touch,lead.id)).join('')+'</ol>'+(touches.length>12?disclosure('Earlier records · '+(touches.length-12),'<ol class="crm-touch-list">'+touches.slice(12).map(touch=>outreachTouchItem(touch,lead.id)).join('')+'</ol>'):''):'<p class="crm-outreach-summary">No structured touches recorded. Existing notes and outcomes are preserved below; they are not converted into proof of delivery.</p>')+'</div>';
  }
  function outreachRouteForm(leadId,routeId){
    const route=routeId&&outreachRoute(routeId);if(routeId&&!route)throw Error('This contact route is no longer available.');
    const lead=outreachLead(route?.leadId||leadId),rev=agent().revision;
    const identity=route?'<p class="quiet-note">'+esc(O.CHANNELS[route.channel]+' · '+route.address)+'. Identity stays unchanged; this adds an evidence revision.</p>':select('channel','Contact channel',O.CHANNELS,'email')+field('address','Address, E.164 phone or public handle','','text','required maxlength="320"')+field('personName','Person / business contact','','text','maxlength="180"');
    form(route?'Update contact evidence':'Add a contact route','<div class="crm-outreach-form">'+outreachRecordNote+identity+area('source','Source / evidence reference',route?.source||'','required maxlength="1500"')+field('checkedOn','Source checked on',route?.checkedOn||day(),'date','required max="'+day()+'"')+disclosure('Business timezone',field('timezone','IANA business timezone',route?.timezone||'','text','placeholder="America/New_York" maxlength="90"')+area('timezoneSource','Timezone evidence',route?.timezoneSource||'','maxlength="1500"')+'<p class="quiet-note">Use the recipient’s evidenced business timezone. A phone country code alone is not a timezone.</p>',!!route?.timezone)+(!route?check('preferred','Preferred route for this lead',false):'')+outreachRecorder()+'</div>',route?'Save evidence revision':'Save contact route',async values=>{
      const payload=route?{routeId:route.id,...values}:{id:uid('route'),leadId:lead.id,...values,preferred:values.preferred==='on'};
      await D.dispatch(route?'outreach.route.evidence':'outreach.route.add',payload,rev);expandedLeadSections.add(lead.id+'/outreach');openLead(lead.id);note('Contact evidence recorded. No permission or sending access inferred.');
    },()=>openLead(lead.id));
  }
  function outreachPermissionForm(routeId){
    const route=outreachRoute(routeId);if(!route)throw Error('This contact route is no longer available.');const rev=agent().revision;
    form('Record purpose-specific permission','<div class="crm-outreach-form"><p class="quiet-note">'+esc(O.CHANNELS[route.channel]+' · '+route.address)+'. Permission applies to this route and purpose only.</p>'+select('purpose','Purpose',O.PURPOSES,'prospecting')+select('status','Permission evidence',outreachPermissionLabels,'unknown')+area('evidence','Exact scope and evidence reference','','required maxlength="2000"')+field('method','How was permission obtained?','','text','maxlength="180" placeholder="For example: inbound quote request"')+field('disclosureVersion','Disclosure / wording version, if applicable','','text','maxlength="180"')+field('occurredAt','Observed at · your local time',outreachLocalTime(),'datetime-local','required max="'+outreachLocalTime()+'"')+outreachRecorder()+'<p class="quiet-note">A public phone number, silence or permission on another channel does not establish permission here.</p></div>','Save permission record',async values=>{await D.dispatch('outreach.permission.record',{routeId,...values,occurredAt:outreachISO(values.occurredAt)},rev);expandedLeadSections.add(route.leadId+'/outreach');openLead(route.leadId);note('Permission evidence recorded. Sending remains unavailable.');},()=>openLead(route.leadId));
  }
  function outreachPreferenceForm(routeId){
    const route=outreachRoute(routeId);if(!route)throw Error('This contact route is no longer available.');const rev=agent().revision;
    form('Record preferred contact route','<div class="crm-outreach-form"><p>'+esc(O.CHANNELS[route.channel]+' · '+route.address)+'</p><p class="quiet-note">Preference does not grant permission or override an opt-out.</p>'+outreachRecorder()+'</div>','Save preference',async values=>{await D.dispatch('outreach.route.preference',{routeId,preferred:true,...values},rev);openLead(route.leadId);note('Preferred route recorded.');},()=>openLead(route.leadId));
  }
  function outreachSuppressionForm(leadId,routeId){
    const route=routeId&&outreachRoute(routeId);if(routeId&&!route)throw Error('This contact route is no longer available.');
    const lead=outreachLead(route?.leadId||leadId),rev=agent().revision;
    form(route?'Record a route opt-out':'Record an account opt-out','<div class="crm-outreach-form"><p class="quiet-note">'+(route?esc(O.CHANNELS[route.channel]+' · '+route.address)+'. Suppression is recorded for this route.':'Applies to proactive contact across this account and its linked contact routes.')+' Do not switch channels to evade a refusal.</p>'+area('reason','What did the person ask?','','required maxlength="1200"')+area('evidence','Message / evidence reference','','required maxlength="2000"')+field('occurredAt','Observed at · your local time',outreachLocalTime(),'datetime-local','required max="'+outreachLocalTime()+'"')+outreachRecorder()+'<p class="quiet-note">The CRM planning record updates immediately. This browser does not stop external provider jobs.</p></div>','Record opt-out',async values=>{await D.dispatch('outreach.suppression.record',{leadId:lead.id,...(route?{routeId:route.id}:{}),scope:route?'route':'account',...values,occurredAt:outreachISO(values.occurredAt)},rev);expandedLeadSections.add(lead.id+'/contact-plan');openLead(lead.id);note('Opt-out recorded. Check any external queued work separately.');},()=>openLead(lead.id));
  }
  function outreachChannelForm(channel,contextLeadId){
    const leadId=contextLeadId||(selection?.kind==='lead'?selection.id:null),records=leadId?O.forLead(agent(),leadId).readiness:[],record=records.find(item=>item.channel===channel)||{},rev=agent().revision;
    form('Record channel setup evidence','<div class="crm-outreach-form">'+outreachRecordNote+select('channel','Channel',O.CHANNELS,channel||'email')+select('status','Observed setup state',outreachChannelLabels,record.status||'not_configured')+field('identity','Dedicated Proton sender / identity',record.identity||'','text','maxlength="300"')+area('evidence','Observed access, eligibility and test evidence',record.evidence||'','required maxlength="2000"')+area('blocker','Specific unresolved dependency',record.blocker||'','maxlength="1500"')+field('checkedOn','Checked on',record.checkedOn||day(),'date','required max="'+day()+'"')+outreachRecorder()+'<p class="quiet-note">Do not enter credentials. Recording verification evidence does not activate a provider, register a sender or prove unattended operation.</p></div>','Save setup evidence',async values=>{await D.dispatch('outreach.channel.record',values,rev);if(leadId)openLead(leadId);else close();note('Channel evidence recorded. Execution remains unavailable.');},leadId?()=>openLead(leadId):null);
  }
  function outreachTouchForm(leadId,touchId){
    const lead=outreachLead(leadId),state=agent(),projection=O.forLead(state,lead.id),prior=touchId&&projection.touches.find(touch=>touch.id===touchId),rev=state.revision;
    if(touchId&&!prior)throw Error('The original touch is no longer available.');
    if(!prior&&!projection.routes.length){outreachRouteForm(lead.id);note('Add the observed contact route before recording a touch.');return;}
    const routeMap=Object.fromEntries(projection.routes.map(route=>[route.id,O.CHANNELS[route.channel]+' · '+route.address]));
    const outbound={draft:'Draft · not sent',prepared:'Prepared · not sent',attempted:'Attempted · outcome not settled',sent:'Sent · supported by receipt',delivered:'Delivered · supported by receipt',failed:'Failed',unknown:'Unknown · reconcile before retry'};
    const tasks=F.linkedTasks?F.linkedTasks(lead,state):state.tasks.filter(task=>task.leadId===lead.id);
    const taskList=Array.isArray(tasks)?tasks:[];
    const identity=prior?'<p class="quiet-note">Reconciling the original '+esc(O.CHANNELS[prior.channel]||prior.channel)+' touch. Its earlier records stay in history.</p>':select('routeId','Contact route',routeMap,(projection.routes.find(route=>route.preferred)||projection.routes[0]).id)+pair(select('direction','Direction',{outbound:'Outbound',inbound:'Inbound'},'outbound'),select('purpose','Purpose',O.PURPOSES,'prospecting'));
    const refs=prior?'':disclosure('Message & review references',select('taskId','Exact draft assignment',Object.assign({'':'No assignment linked'},Object.fromEntries(taskList.map(task=>[task.id,task.title]))),'')+pair(field('resultVersion','Source result version','','number','min="0" step="1"'),field('messageVersion','Message version','','text','maxlength="180"'))+field('reviewTaskId','Exact Quality review task ID','','text','maxlength="180"')+pair(field('author','Message author','','text','maxlength="180"'),field('reviewer','Reviewer','','text','maxlength="180"'))+field('cycleId','Native work cycle ID, if known','','text','maxlength="180"'),true);
    const transitions={draft:['prepared','failed'],prepared:['attempted','sent','delivered','failed','unknown'],attempted:['sent','delivered','failed','unknown'],unknown:['sent','delivered','failed'],sent:['delivered']};
    const statusMap=prior?Object.fromEntries((transitions[prior.recordedStatus||prior.status]||[]).map(status=>[status,outbound[status]])):outbound;
    form(prior?'Reconcile a touch record':'Record a touch or reply','<div class="crm-outreach-form">'+outreachRecordNote+identity+select('status','Observed status',statusMap,prior?Object.keys(statusMap)[0]:'draft')+'<div data-outreach-inbound hidden>'+select('replyKind','Reply type',{human:'Genuine human reply',auto:'Automatic response / provider event'},'human')+'</div>'+field('occurredAt','Observed at · your local time',outreachLocalTime(),'datetime-local','required max="'+outreachLocalTime()+'"')+area('evidence','What happened? Include the evidence reference.','','required maxlength="2000"')+pair(field('providerRef','Provider message / receipt reference',prior?.providerRef||'','text','maxlength="320"'),field('threadRef','Conversation / thread reference',prior?.threadRef||'','text','maxlength="320"'))+refs+(!prior?check('internalTest','Internal test · not a prospect contact',false):'')+outreachRecorder()+'<p class="quiet-note">Record actual observations. A genuine inbound reply pauses proactive planning; automatic replies do not. Unknown outcomes must be reconciled on this record before any retry.</p></div>',prior?'Save reconciliation':'Save touch record',async values=>{
      let payload={...values,occurredAt:outreachISO(values.occurredAt)};
      if(prior)payload={touchId:prior.id,status:values.status,occurredAt:payload.occurredAt,evidence:values.evidence,providerRef:values.providerRef,threadRef:values.threadRef,recordedBy:values.recordedBy};
      else {payload={id:uid('touch'),leadId:lead.id,...payload,internalTest:values.internalTest==='on'};const version=(values.resultVersion??'').trim();if(version!=='')payload.resultVersion=Number(version);else delete payload.resultVersion;}
      await D.dispatch(prior?'outreach.touch.update':'outreach.touch.record',payload,rev);expandedLeadSections.add(lead.id+'/touches');expandedLeadSections.add(lead.id+'/contact-plan');openLead(lead.id);note(prior?'Touch reconciled; original history retained.':'Touch recorded. No message was sent by this CRM.');
    },()=>openLead(lead.id));
    const direction=$('f_direction'),status=$('f_status');
    function syncTouchFields(changeDirection){
      const inbound=prior?prior.direction==='inbound':direction.value==='inbound';
      if(changeDirection)status.innerHTML=options(inbound?{received:'Received · supported by receipt'}:outbound,inbound?'received':'draft');
      const reply=$('sheetBody').querySelector('[data-outreach-inbound]');reply.hidden=!inbound||!!prior;$('f_replyKind').disabled=!inbound||!!prior;
      $('f_providerRef').required=['sent','delivered','received'].includes(status.value);
      const needsDraft=['draft','prepared'].includes(status.value);
      ['taskId','resultVersion','messageVersion'].forEach(name=>{const input=$('f_'+name);if(input)input.required=needsDraft;});
    }
    if(direction)direction.addEventListener('change',()=>syncTouchFields(true));status.addEventListener('change',()=>syncTouchFields(false));syncTouchFields(false);
    const taskSelect=$('f_taskId');if(taskSelect)taskSelect.addEventListener('change',()=>{const task=state.tasks.find(item=>item.id===taskSelect.value);$('f_resultVersion').value=task?.result?A.resultVersion(task):'';});
  }
  function sourcingPanel(lead){
    const rows=S.history(lead,agent().tasks),closed=F.leadProgress(lead,agent()).closed;
    return '<p class="quiet-note">Buyer requirements → Suppliers → Quotes → Negotiation → Recommendation → Owner decision → Closing. Work stages are separate from procurement evidence and task approval.</p><div class="actions">'+(!closed?button('Source miners','sourcing-start',lead.id,true):'')+textButton('Copy unsent RFQ template','sourcing-rfq')+'</div><div class="wf-linked"><h4>Quote & sourcing history</h4>'+(rows.length?rows.map(({task,step,evidence})=>'<a href="'+href('task',task.id)+'"><span>'+esc(step.name)+' · '+esc(task.title)+'</span><small>'+esc(evidence.label)+' · Task: '+esc(task.status==='done'?'Result accepted':A.STATUS[task.status])+'<br>'+esc(task.updatedAt||'Date not recorded')+'</small></a>').join(''):'<p>No sourcing assignments or quotes recorded for this lead. No supplier, stock or order has been confirmed here.</p>')+'</div><p class="quiet-note">These are reported records. Each revised offer is a new linked task; originals remain available. Unknown costs and availability remain unknown. Revenue coordinates CRM records and sending; each external message must meet recorded email readiness and authorized scope.</p>';
  }
  function sourcingForm(leadId,parentId){
    const state=agent(),eligible=(state.leads||[]).filter(l=>l.offer==='sourcing'&&!F.leadProgress(l,state).closed),parent=parentId&&state.tasks.find(t=>t.id===parentId);
    if(parent)leadId=parent.leadId;
    if(!eligible.length){modal('Start with a buyer lead','<p>Add the buyer as a revenue lead with the Sourcing Desk service. Record a public buying signal or confirmed requirement; keep missing details unknown.</p>'+button('Add revenue lead','new-lead'));return;}
    const prior=state.tasks.filter(t=>S.stepOf(t)&&eligible.some(l=>l.id===t.leadId)&&(!leadId||t.leadId===leadId));
    form('Source miners for a buyer',select('leadId','Buyer lead',Object.assign({'':'Choose a buyer'},Object.fromEntries(eligible.map(l=>[l.id,l.company]))),leadId||'')+select('step','Work stage',Object.fromEntries(S.steps.map(s=>[s.id,s.name])),parent?'quotes':'requirements')+select('parentId','Previous assignment / quote version',Object.assign({'':'No previous version'},Object.fromEntries(prior.map(t=>[t.id,t.title]))),parentId||'')+area('context','Requirement or negotiation target','','maxlength="2200" placeholder="Exact variant, quantity, new/used, budget, destination and timing; or the specific price/term to improve. Leave unknowns explicit."')+'<p class="quiet-note">This prepares a linked draft assignment. It does not start a bot, send an RFQ, reserve stock or accept an order. Supply researches and prepares nonbinding offers; Revenue writes and sends only within the approved scope.</p>','Prepare assignment',async v=>{
      const lead=agent().leads.find(l=>l.id===v.leadId),previous=v.parentId&&agent().tasks.find(t=>t.id===v.parentId);
      if(!lead||F.leadProgress(lead,agent()).closed)throw Error('Choose an active buyer lead.');
      if(v.parentId&&!previous)throw Error('The prior quote version is no longer available.');
      taskForm(S.assignment({step:v.step,lead,parent:previous,context:v.context,page:location.href}));
    });
  }
  function leadInfo(l){
    const id=l.id,outreach=O.forLead(agent(),l.id),suppressed=F.leadProgress(l,agent()).closed&&l.stage!=='disqualified';
    const followup=outreach.unknown?'Reconcile the unknown contact outcome before another attempt.':suppressed||outreach.suppressed?'Proactive contact is suppressed. Preserve the recorded opt-out.':outreach.paused?'Review the actual reply and continue only within its requested scope.':outreach.parked?'Prospecting is parked. Wait for evidenced re-engagement.':l.nextAction||'Research a buying signal and the right contact.';
    const contact='<dl class="fact-list">'+fact('Company website',l.website)+fact('Buyer / seller role',l.buyer)+fact('Contact route',l.contact)+fact('Evidence checked',l.checked)+fact('Last contact',l.lastTouch)+'</dl>';
    const evidence='<p class="group-label">Reason to buy this service</p><p class="note-text">'+esc(l.serviceFit||'Not established · keep researching the fit.')+'</p><p class="group-label">Buying signal</p><p class="note-text">'+esc(l.signal||'Not researched yet.')+'</p><p class="quiet-note">'+external(l.source,'View signal source')+'</p>';
    const notes='<p class="group-label">Last outcome</p><p class="note-text">'+esc(l.lastNote||'No contact or outcome recorded.')+'</p><p class="group-label">Lead notes</p><p class="note-text">'+esc(l.notes||'No additional notes.')+'</p>';
    return '<h3 class="visually-hidden">Lead details for '+esc(l.company)+'</h3><p class="quiet-note"><a class="text-button" href="'+esc(href('lead',id))+'">Open lead link ↗</a></p>'+F.detail(l,agent())+'<div class="next-action"><small>Next action'+(l.due?' · Saved due date '+esc(l.due):'')+'</small><p>'+esc(followup)+'</p></div>'+(l.offer==='sourcing'?leadSection(l,'sourcing','ASIC sourcing & quote history',sourcingPanel(l)):'')+leadSection(l,'outreach','Contact routes & permissions',outreachRoutesPanel(l))+leadSection(l,'contact-plan','Next contact · advisory',outreachPlanPanel(l))+leadSection(l,'touches','Shared touch history',outreachHistoryPanel(l))+leadSection(l,'contact','Company & original contact',contact)+leadSection(l,'evidence','Fit & source evidence',evidence)+leadSection(l,'notes','Notes & outcomes',notes)+'<div class="actions" style="margin-top:20px">'+button('Update lead','edit-lead',id,true)+(!suppressed&&!['dnc','disqualified'].includes(l.stage)?button('Assign bot work','lead-work',id):'')+(!suppressed&&['qualified','contacted','replied','meeting'].includes(l.stage)?button('Draft outreach','lead-task',id):'')+(['replied','meeting'].includes(l.stage)?button('Create service deal','lead-deal',id):'')+'</div><p class="quiet-note">Drafting outreach creates a Grok task. Qualification is researched fit; buying intent is still confirmed in conversation.</p>';
  }
  function leadCard(l){return F.card(l,agent(),{expanded:expandedLeads.has(l.id),content:expandedLeads.has(l.id)?leadInfo(l):''});}
  function openLead(id){
    expandedLeads.add(id);if(!D.status().ready)return;const lead=(agent().leads||[]).find(l=>l.id===id);if(!lead){note('This lead is no longer in the register.');return;}
    if(sheet.open)sheet.close();modalForm=false;modalBack=null;expandedLeads.add(id);
    if(current==='team')teamTab='workflow';else {current='pipeline';pipelineKind='lead';pipelineGroup='all';pipelineWorkflow='all';pipelineSearch='';pipelineLimit=Math.max(60,(agent().leads||[]).length);}
    render();requestAnimationFrame(()=>{const card=$('content').querySelector('.wf-lead-card[data-lead-id="'+CSS.escape(id)+'"]');if(card){card.scrollIntoView({block:'start'});card.querySelector('summary').focus({preventScroll:true});}});
  }
  function taskForm(prefill){
    const p=prefill||{},rev=agent().revision;
    form('New assignment',field('title','Task title',p.title,'text','required maxlength="180"')+select('role','Responsible Grokbot',Object.fromEntries(G.roles.map(r=>[r.id,r.botName])),p.role||'intelligence')+area('brief','Brief & expected result',p.brief||'','required maxlength="9000"')+select('leadId','Linked lead',Object.assign({'':'No individual lead · batch or general work'},Object.fromEntries((agent().leads||[]).map(l=>[l.id,l.company]))),p.leadId||'')+pair(field('due','Due date',p.due,'date'),select('dealId','Linked service deal',Object.assign({'':'No linked deal'},Object.fromEntries(agent().deals.map(d=>[d.id,d.name]))),p.dealId||'')),'Save draft',async v=>{if(S.stepOf(p)&&v.leadId!==p.leadId)throw Error('Reopen sourcing setup to change the buyer; linked quotes must stay with the same request.');if(S.stepOf(p)&&!S.stepOf({brief:v.brief}))throw Error('Keep the sourcing stage marker at the start of this assignment.');await D.dispatch('task.add',Object.assign(v,{id:uid('task'),parentTaskId:p.parentTaskId||''}),rev);close();teamTab='tasks';note('Draft saved. Prepare the handoff when you are ready.');});
  }
  let taskRevision=0;
  function openTask(id){
    const status=D.status();
    selection={kind:'task',id};
    taskRequest={id,account:status.ready?{uid:status.uid,epoch:status.epoch}:null};
    reconcileTaskRequest();
  }
  function reconcileTaskRequest(){
    const request=taskRequest;if(!request)return;
    const status=D.status();
    // Startup intent may wait for its first account; resolved intent never follows an account switch.
    if(request.account&&(request.account.uid!==status.uid||request.account.epoch!==status.epoch)){
      taskRequest=null;selection=null;sheet.close();modalForm=false;modalBack=null;
      note('Account changed. Reopen the task link in the intended account.');return;
    }
    if(!request.account&&status.ready)request.account={uid:status.uid,epoch:status.epoch};
    const view=(title,html)=>modal(title,html,null,false,true);
    if(!status.ready){view('Opening task','<p role="status">Opening your account…</p>');return;}
    if(status.error){view('Task connection needs attention','<p role="status">'+esc(status.error)+'</p><p>Task availability has not been confirmed.</p>');return;}
    const connection=status.agent;
    if(connection.uid!==status.uid||connection.mode==='connecting'){
      view('Opening task','<p role="status">Loading the task register for your account…</p>');return;
    }
    // Cache-only and failed reads cannot establish that a task is absent.
    if(!(status.uid?connection.mode==='cloud':connection.mode==='local')){
      view('Task connection needs attention','<p role="status">'+esc(connection.error||'Waiting for a confirmed connection to the task register.')+'</p><p>This task will open when the connection is confirmed. Its availability has not been confirmed yet.</p>');return;
    }
    const id=request.id,t=agent().tasks.find(x=>x.id===id);
    if(!t){view('Task unavailable','<p>This task was not found in '+(status.uid?'the current account’s register. Check that you opened the link in the intended account.':'this device’s local register. Sign in to the intended account, then reopen the task link.')+'</p>'+button('Check account','account'));return;}
    renderTask(t);
  }
  function renderTask(t){
    const id=t.id;
    taskRevision=agent().revision;let actions='';
    if(A.actionable(t)&&t.routing?.reviewOwner!=='owner'&&['draft','blocked'].includes(t.status))actions+=button('Ready for handoff','task-ready',id,true);
    if(A.taskKind(t)==='work'&&['ready','working','blocked','review'].includes(t.status))actions+=button('Copy handoff packet','task-packet',id);
    if(A.taskKind(t)==='work'&&S.stepOf(t)&&t.leadId)actions+=button('New sourcing step / quote version','sourcing-next',id);
    if(A.actionable(t)&&t.routing?.reviewOwner!=='owner'&&t.status==='ready')actions+=button('Claim task','task-start',id)+button('Record manual handoff','task-handoff',id);
    if(A.actionable(t)&&['ready','working','blocked'].includes(t.status))actions+=button('Submit result','task-result',id,true);
    if(A.taskKind(t)==='work'&&(t.status==='review'||t.role==='review'&&t.status==='done')){actions+=button(t.role==='review'?'Record coordinator review':'Record review decision','task-review',id,true);if(t.role!=='review')actions+=button('Request Quality Review','task-quality',id);else actions+=button('Record Quality verdict','task-verdict',id);}actions+=button('Record routing','task-routing',id);
    const linked=agent().tasks.filter(x=>x.parentTaskId===id&&x.role==='review');
    if(linked.some(q=>A.completedReviewEligibility(agent(),t,q).eligible))actions+=button('Record completed team review','task-completed-review',id);
    const qualityLinks=linked.map(x=>'<a class="text-button" href="'+href('task',x.id)+'">Quality Review · '+esc(A.STATUS[x.status])+' →</a>').join('');
    const history=(t.reviewHistory||[]).map((h,i)=>'<article class="contact-card"><h3>Review '+(i+1)+' · '+esc(h.decision==='accept'?'Accepted':'Revision requested')+'</h3><p>'+esc(new Date(h.at).toLocaleString())+'</p><p class="note-text">'+esc(h.note)+'</p>'+(h.review?'<p class="quiet-note">Recorded by '+esc(h.review.reviewer)+' · '+esc(h.review.actor)+' · result version '+h.review.version+'<br>'+esc(h.review.basis)+'</p>':'<p class="quiet-note">Legacy review · attribution not recorded.</p>')+(h.closeoutId?'<p class="quiet-note">Completed review receipt: '+esc(h.closeoutId)+'</p>':'')+(h.completedReview?completedReviewProof(h.completedReview):'')+'<details><summary>Result reviewed in this round</summary><p class="note-text">'+esc(h.result)+'</p>'+h.sources.map(u=>external(u)).join('<br>')+'</details></article>').join('');
    if(A.actionable(t))actions+=textButton('Record blocker','task-block',id)+textButton('Cancel task','task-cancel',id);
    modal('Team assignment','<div class="sheet-intro">'+tag(F.taskMeaning(t,agent()).label,t.status==='review')+'<h3>'+esc(t.title)+'</h3><p>'+esc(role(t.role).botName)+' · '+(t.due?'Due '+esc(t.due):'No due date')+'</p></div>'+F.taskContext(t,agent())+reviewAttribution(t)+(S.stepOf(t)?'<div class="next-action"><small>Procurement evidence · separate from task approval</small><p>'+esc(S.recordState(t).label)+'</p><p class="quiet-note">A reported quote is not confirmed stock. A reviewed result is not an accepted order. Use a new linked task for each revised offer.</p></div>':'')+'<details class="wf-brief" open><summary>Assignment brief</summary><p class="note-text">'+esc(t.brief)+'</p></details>'+(t.blocker?'<div class="next-action"><small>'+esc(A.taskKind(t)==='work'?'Recorded blocker':'Historical blocker')+'</small><p>'+esc(t.blocker)+'</p></div>':'')+(t.result?'<p class="group-label">Reported result</p><p class="note-text">'+esc(t.result)+'</p><p class="quiet-note">'+t.sources.map(u=>external(u)).join('<br>')+'</p>':'')+(t.reviewNote?'<p class="group-label">Review decision</p><p class="note-text">'+esc(t.reviewNote)+'</p>':'')+(t.parentTaskId?'<p><a class="text-button" href="'+href('task',t.parentTaskId)+'">Open source assignment →</a></p>':'')+(qualityLinks?'<div class="actions">'+qualityLinks+'</div>':'')+(history?'<details class="review-history"><summary>Review history · '+t.reviewHistory.length+' rounds</summary>'+history+'</details>':'')+'<div class="actions" style="margin-top:24px">'+actions+'</div><p class="quiet-note">'+(t.handoffAt?'Handoff recorded '+esc(new Date(t.handoffAt).toLocaleString())+'. ':'')+'The CRM records task progress; it does not independently verify that a bot is running.</p>',null,false,true);
  }
  function taskActionForm(id,type){
    const rev=taskRevision,back=()=>openTask(id),task=agent().tasks.find(t=>t.id===id);let fields,title,label;
    if(type==='result'){title='Submit a result';label='Submit for review';fields=area('result','Result & remaining uncertainties',S.resultTemplate(task),'required maxlength="18000"')+area('sources','Evidence URLs · one per line')+(task.role==='review'?select('qualityVerdict','Actual Quality verdict',{'':'Choose the supported verdict',pass:'Pass',revise:'Corrections required',blocked:'Blocked'},'')+(task.parentTaskId?check('confirmCurrentSource','This result reviews the current source result and evidence.',false):''):'');}
    else if(type==='review'){
      title=task.routing?.reviewOwner==='owner'?'Record owner decision':'Record team review';label='Save decision';
      const qualityReview=task.role==='review',qa=A.reviewEvidence(agent(),task);
      const checks=qualityReview?{unchecked:'Not checked',pass:'Pass · review supported and complete',revise:'Needs revision · review needs correction',blocked:'Blocked · cannot assess review',na:'Not applicable to this review'}:{unchecked:'Not checked',pass:'Pass',revise:'Needs revision',blocked:'Blocked',na:'Not applicable'};
      const reviewCheck=(name,label,reasoning)=>select(name,qualityReview?'Quality review: '+reasoning:label,checks,'unchecked',qualityReview?'qaReviewChecksHelp':'');
      fields=select('actor','Decision recorded as',{coordinator:'Revenue coordinator · independent team review',owner:'Owner · actual owner decision'},task.routing?.reviewOwner==='owner'?'owner':'coordinator')+field('reviewer','Person / role recording the decision','','text','required maxlength="180"')+select('evidenceTaskId','Accepted Quality source',Object.assign({'':task.role==='review'?'Not required for coordinator review of Quality':'Choose the exact accepted Quality result'},Object.fromEntries(qa.map(q=>[q.id,q.title+' · '+q.qualityVerdict]))),'')+area('basis','Review evidence / owner decision reference','','required maxlength="2000"')+select('decision','Decision',{'':'Choose a decision',accept:'Accept result',revise:'Return for revision'},'')+(qualityReview?'<p class="quiet-note" id="qaReviewChecksHelp" data-qa-review-guidance>Assess the Quality review itself. Pass means its reasoning is supported and complete. Needs revision means this review needs correction. Accepting an accurate REVISE or HOLD finding does not approve the source result or change its verdict.</p>':'')+reviewCheck('evidence','Source evidence','evidence reasoning')+pair(reviewCheck('arithmetic','Arithmetic','arithmetic reasoning'),reviewCheck('fit','Commercial fit','commercial-fit reasoning'))+area('note','Review notes','','required maxlength="2000"')+area('lesson','Feedback for the next assignment','','maxlength="700"')+'<p class="quiet-note">Revenue records actual independent verdicts. Quality results receive coordinator review without another QA loop. Use Owner only for an actual owner decision, never to bypass missing QA. Acceptance covers this result; external actions stay within their separate authority and readiness requirements.</p>';
    }else{title='Record a blocker';label='Save blocker';fields=select('blockerKind','Blocker type',{execution:'Execution · access, data or setup',correction:'Correction · return to the assigned role',unknown:'Needs triage'},'execution')+area('reason','What is needed to continue?','','required maxlength="2000"')+'<p class="quiet-note">Use Record routing for a specific owner decision. Routine corrections and setup checks stay with the team.</p>';}
    form(title,fields,label,async v=>{
      const command=type==='review'?'task.'+v.decision:'task.'+(type==='result'?'result':'block');
      if(type==='review'){v.review={actor:v.actor,reviewer:v.reviewer,basis:v.basis,evidenceTaskId:v.evidenceTaskId,checks:{evidence:v.evidence,arithmetic:v.arithmetic,fit:v.fit}};v.note=G.feedback(v);}delete v.decision;
      if(type==='result'){v.sources=v.sources.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);S.validateResult(task,v.result,v.sources);if(task.role==='review'){if(!v.qualityVerdict)throw Error('Choose the actual Quality verdict.');if(task.parentTaskId&&v.confirmCurrentSource!=='on')throw Error('Reopen the current source result before confirming this review.');}v.confirmCurrentSource=v.confirmCurrentSource==='on';}
      await D.dispatch(command,Object.assign(v,{id}),rev);openTask(id);note('Task updated.');
    },back);
  }
  function completedReviewProof(receipt){
    const original=receipt.request.attribution;
    return '<details class="completed-review-proof"><summary>Completed team review evidence</summary><p class="quiet-note">Source '+esc(receipt.sourceId)+' · result '+receipt.sourceVersion+'<br>Quality '+esc(receipt.qaId)+' · input result '+receipt.qaVersion+' · saved result '+receipt.qaResultVersion+'</p><p class="note-text">'+esc('Original reviewer: '+original.reviewer+'\nCompleted: '+original.reviewedAt+'\nVerdict: '+original.verdict+'\nEvidence: '+original.evidence+'\nRecorded by: '+original.recordedBy)+'</p><div class="actions"><a class="text-button" data-action="open-task" data-id="'+esc(receipt.sourceId)+'" href="'+href('task',receipt.sourceId)+'">Open exact source →</a><a class="text-button" data-action="open-task" data-id="'+esc(receipt.qaId)+'" href="'+href('task',receipt.qaId)+'">Open exact Quality assignment →</a></div></details>';
  }
  function sameCompletedRequest(a,b){
    if(a===b)return true;
    if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
    const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.prototype.hasOwnProperty.call(b,k)&&sameCompletedRequest(a[k],b[k]));
  }
  function completedReviewAccountMatches(session){const status=D.status();return !session.accountChanged&&status.uid===session.uid&&status.epoch===session.epoch;}
  function freezeCompletedReviewAccount(session=completedReviewSession){
    if(!session||completedReviewSession!==session||session.accountChanged)return;
    session.accountChanged=true;
    const fields=Object.fromEntries(new FormData($('editForm'))),qa=session.state.tasks.find(q=>q.id===fields.qaId);
    const draft={account:session.uid||'Local workspace',boardRevision:session.state.revision,sourceId:session.source.id,sourceVersion:A.resultVersion(session.source),qaVersion:qa?A.resultVersion(qa):null,closeoutId:session.closeoutId,fields,pendingRequest:session.pending||null};
    $('completedReviewNotice').innerHTML='<p class="banner" role="alert">Account changed. This draft belongs to the original workspace and cannot be saved here. Copy it before closing; return to the original account and reopen the exact records to check any pending save.</p>'+area('retainedDraft','Retained original-account review draft',JSON.stringify(draft,null,2),'readonly');
    $('editForm').querySelectorAll('input,select,textarea').forEach(el=>{if(el.tagName==='SELECT'||el.type==='checkbox')el.disabled=true;else el.readOnly=true;});
    $('editForm').querySelector('[type=submit]').disabled=true;$('checkCompletedReceipt').disabled=true;$('sheetBack').hidden=true;modalBack=null;
  }
  function reconcileCompletedReview(session){
    if(completedReviewSession!==session||!session.pending||session.saving||!completedReviewAccountMatches(session))return false;
    const store=D.status().agent;
    // A listener may show a local write before the transaction settles, or retain
    // it after rejection. Only a confirmed snapshot can reconcile a cloud receipt.
    const cloudSaved=!!session.uid&&store.uid===session.uid&&store.mode==='cloud'&&store.serverConfirmed===true;
    if(!cloudSaved&&(session.uid||store.uid||store.mode!=='local'))return false;
    const receipt=A.completedReviewReceipt(agent(),session.closeoutId);if(!receipt)return false;
    if(!sameCompletedRequest(receipt.request,session.pending)){error(Error('A different request uses this receipt ID. Your draft is retained; reopen the exact records before making changes.'));return false;}
    session.saved=true;
    modal('Completed team review saved','<div role="status"><h3>'+esc(receipt.decision==='accept'?'Source accepted':'Source returned for correction')+'</h3><p>The Quality finding and source decision were recorded together.</p><p class="quiet-note">'+esc(cloudSaved?'Saved in the connected account.':'Saved on this device.')+' '+esc(new Date(receipt.at).toLocaleString())+'<br>Receipt: '+esc(session.closeoutId)+'</p></div>'+completedReviewProof(receipt)+'<div class="actions">'+button('Open source assignment','open-task',receipt.sourceId,true)+button('Open Quality assignment','open-task',receipt.qaId)+'</div>',()=>openTask(receipt.sourceId));
    return true;
  }
  function completedReviewForm(id){
    const state=JSON.parse(JSON.stringify(agent())),source=state.tasks.find(t=>t.id===id),status=D.status();
    const linked=state.tasks.filter(q=>q.parentTaskId===id&&q.role==='review'),eligible=linked.filter(q=>A.completedReviewEligibility(state,source,q).eligible);
    if(!eligible.length)throw Error('No existing linked Quality assignment is eligible. Use the original result, review or correction controls.');
    const session={state,source,uid:status.uid,epoch:status.epoch,closeoutId:uid('closeout'),pending:null,saving:false,saved:false,accountChanged:false};
    const preview=t=>'<p class="quiet-note">'+esc(t.id)+' · '+esc(A.STATUS[t.status])+' · result version '+A.resultVersion(t)+'</p><p class="note-text">'+esc(t.result||'No result recorded. Supply the actual independently completed Quality result below.')+'</p>'+t.sources.map(u=>external(u)).join('<br>');
    const choices=Object.assign({'':'Choose the exact existing Quality assignment'},Object.fromEntries(eligible.map(q=>[q.id,q.title+' · '+q.id+' · result '+A.resultVersion(q)])));
    const excluded=linked.filter(q=>!eligible.includes(q));
    const fields='<div id="completedReviewNotice" role="status"></div><p class="quiet-note">Record an independent review that has already happened. This form uses the source and Quality versions from board revision '+state.revision+'.</p>'+disclosure('Source result · '+source.title,preview(source),true)+select('qaId','Existing linked Quality assignment',choices,'')+(excluded.length?disclosure('Other linked reviews · use existing controls',excluded.map(q=>'<p class="quiet-note">'+esc(q.title+' · '+q.id+': '+A.completedReviewEligibility(state,source,q).reason)+'</p>').join('')):'')+'<div id="completedReviewFields"></div><p class="quiet-note">Acceptance covers the recorded result. Outreach, spending and account access retain their separate requirements.</p><button type="button" class="text-button" id="checkCompletedReceipt">Check saved receipt</button>';
    form('Record completed team review',fields,'Save completed team review',async v=>{
      if(completedReviewSession!==session)return;
      if(!completedReviewAccountMatches(session)){freezeCompletedReviewAccount(session);throw Error('The account changed. Your original draft is retained; no write was attempted in this account.');}
      if(session.saved||reconcileCompletedReview(session))return;
      const qa=state.tasks.find(q=>q.id===v.qaId),eligibility=A.completedReviewEligibility(state,source,qa);
      if(!eligibility.eligible)throw Error(eligibility.reason);
      const decision=(prefix,extra={})=>({note:v[prefix+'Note'],review:{actor:'coordinator',reviewer:v.recordedBy,basis:v[prefix+'Basis'],checks:{evidence:v[prefix+'Evidence'],arithmetic:v[prefix+'Arithmetic'],fit:v[prefix+'Fit']}},...extra});
      const payload={sourceId:id,qaId:qa.id,expectedSourceVersion:A.resultVersion(source),expectedQaVersion:A.resultVersion(qa),closeoutId:session.closeoutId,confirmCurrentSource:v.confirmCurrentSource==='on',attribution:{reviewer:v.originalReviewer,reviewedAt:v.reviewedAt,evidence:v.originalEvidence,recordedBy:v.recordedBy,verdict:v.verdict,independent:v.independent==='on'},sourceDecision:decision('source',{decision:v.decision})};
      payload.sourceDecision.review.evidenceTaskId=qa.id;
      if(eligibility.needsQaResult)payload.qaResult={result:v.qaResult,sources:v.qaSources.split(/\r?\n/).map(s=>s.trim()).filter(Boolean),verdict:v.verdict};
      if(!eligibility.reuseQa)payload.qaReview=decision('qa');
      // Normalize and validate against the frozen input before any store transaction.
      const previewState=A.reduce(state,{type:'task.completed-review',payload,revision:state.revision,id:uid('preview'),at:new Date().toISOString()});
      const request=A.completedReviewReceipt(previewState,session.closeoutId).request;
      if(session.pending&&!sameCompletedRequest(session.pending,request))throw Error('A save was already attempted for this receipt. Check its saved result before changing the request. Your edited draft remains here.');
      session.pending=request;session.saving=true;
      try{await D.dispatch('task.completed-review',request,state.revision);}catch(e){
        session.saving=false;
        if(completedReviewSession!==session)return;
        if(session.saved||reconcileCompletedReview(session))return;
        if(!completedReviewAccountMatches(session))freezeCompletedReviewAccount(session);
        throw Error((e.message||String(e))+' Your draft and original versions are retained. Check saved receipt before retrying; reopening is required if the records changed.');
      }
      session.saving=false;
      if(completedReviewSession!==session)return;
      if(session.saved||reconcileCompletedReview(session))return;
      if(!completedReviewAccountMatches(session)){freezeCompletedReviewAccount(session);return;}
      $('completedReviewNotice').textContent='Save returned; waiting for confirmation of the exact saved receipt. Check saved receipt before retrying. This form retains its original versions.';
    },()=>openTask(id));
    completedReviewSession=session;$('f_qaId').required=true;
    $('checkCompletedReceipt').addEventListener('click',()=>{
      if(!completedReviewAccountMatches(session)){freezeCompletedReviewAccount(session);return;}
      if(!reconcileCompletedReview(session))$('completedReviewNotice').textContent=session.saving?'Save is still in progress. Keep this draft while confirmation is pending.':session.pending?'No matching confirmed receipt is visible in the current register yet. Keep this draft; retry uses the same receipt and original versions.':'No save has been attempted from this form.';
    });
    $('f_qaId').addEventListener('change',()=>{
      const qa=state.tasks.find(q=>q.id===$('f_qaId').value);if(!qa){$('completedReviewFields').innerHTML='';return;}
      const eligibility=A.completedReviewEligibility(state,source,qa),original=(qa.qualityHistory||[]).slice().reverse().find(h=>h.resultVersion===A.resultVersion(qa)&&h.sourceVersion===A.resultVersion(source)&&h.reviewer&&h.reviewedAt&&h.independent===true);
      const checks={unchecked:'Not checked',pass:'Pass',na:'Not applicable'},sourceChecks={...checks,revise:'Needs revision',blocked:'Blocked'},verdicts={'':'Choose the actual completed verdict',pass:'Pass',revise:'Corrections required',blocked:'Blocked'};
      const reviewFields=(prefix,label)=>{const choices=prefix==='source'?sourceChecks:checks;return '<h3>'+label+'</h3>'+area(prefix+'Basis',label+' · evidence / basis','','required maxlength="2000"')+select(prefix+'Evidence',label+' · evidence check',choices,'unchecked')+pair(select(prefix+'Arithmetic',label+' · arithmetic check',choices,'unchecked'),select(prefix+'Fit',label+' · fit check',choices,'unchecked'))+area(prefix+'Note',label+' · decision notes','','required maxlength="3000"');};
      $('completedReviewFields').innerHTML=disclosure('Selected Quality result · '+qa.title,preview(qa)+reviewAttribution(qa),true)+(eligibility.needsQaResult?area('qaResult','Actual completed independent Quality result','','required maxlength="18000"')+area('qaSources','Quality evidence URLs · one per line','','maxlength="6000"'):'<p class="quiet-note">The existing Quality result and URLs stay unchanged.</p>')+'<h3>Original independent review</h3>'+field('originalReviewer','Actual independent reviewer',original?.reviewer||'','text','required maxlength="180"')+field('reviewedAt','Original review completed at · ISO time with timezone',original?.reviewedAt||'','text','required maxlength="40" placeholder="2026-09-20T07:45:00Z"')+area('originalEvidence','Original review artifact / evidence reference',original?.evidence||'','required maxlength="2000"')+select('verdict','Actual completed Quality verdict',verdicts,original?.verdict||qa.qualityVerdict||'')+check('independent','The actual Quality reviewer worked independently of the source author.',false)+check('confirmCurrentSource','This actual review covers the exact source result, evidence, recipient and scope shown above.',false)+field('recordedBy','Revenue coordinator recording this review','','text','required maxlength="180"')+(eligibility.reuseQa?'<p class="quiet-note">This accepted Quality finding is eligible for reuse. Its result, attribution and acceptance history will stay unchanged.</p>':reviewFields('qa','Accept the Quality finding'))+'<h3>Source decision</h3>'+select('decision','Source disposition',{'':'Choose a decision',accept:'Accept this source result',revise:'Return source for correction'},'')+reviewFields('source','Source coordinator review')+'<p class="quiet-note" data-completed-review-correction-guidance>Accepting an accurate REVISE or BLOCKED finding accepts the Quality review, not the source. Choose Return source for correction and record the failed source checks. After saving, submit the corrected source result.</p>';
      $('f_verdict').addEventListener('change',updateSourceDecision);updateSourceDecision();
    });
    function updateSourceDecision(){const adverse=['revise','blocked'].includes($('f_verdict').value),accept=$('f_decision').querySelector('[value=accept]');accept.disabled=adverse;if(adverse&&$('f_decision').value==='accept')$('f_decision').value='';}
  }
  function reviewAttribution(task){
    const route=task.routing,quality=task.qualityHistory||[],last=task.reviewHistory?.at(-1);
    return (route?'<p class="quiet-note">Routing: '+esc(route.kind)+' / '+esc(route.reviewOwner)+' · '+esc(route.recordedBy)+'<br>'+esc(route.reason)+'</p>':'')+(task.role==='review'?'<p class="quiet-note">Quality verdict: '+esc(task.qualityVerdict||'Not recorded as structured evidence')+(task.reviewOfVersion!=null?' · Source result version '+task.reviewOfVersion:'')+'</p>':'')+(quality.length?'<details><summary>Quality attribution history</summary>'+quality.map(q=>'<p class="note-text">'+esc(q.verdict+' · '+q.recordedBy+' · '+q.at+'\n'+q.evidence)+'</p>').join('')+'</details>':'')+(task.status==='done'&&!last?.review?'<p class="quiet-note">Legacy acceptance: reviewer identity was not recorded. No new review has been inferred.</p>':'');
  }
  function routingForm(id){
    const t=agent().tasks.find(t=>t.id===id),r=t.routing||{},rev=agent().revision;
    form('Record task routing',select('kind','Record purpose',{work:'Executable work',reference:'Reference / operating charter',superseded:'Superseded / historical'},A.taskKind(t))+select('reviewOwner','Decision ownership',{team:'Team · Quality and Revenue',owner:'Owner · specific authority or missing fact'},r.reviewOwner||'team')+area('reason','Reason / successor reference',r.reason||'','required maxlength="2000"')+field('recordedBy','Recorded by','','text','required maxlength="180"')+'<p class="quiet-note">This classifies the record; it does not accept the result or stop a running bot. Reference and superseded records remain available in Assignments and retain their history. Owner decisions need the exact unresolved authority or fact.</p>','Save routing',async v=>{await D.dispatch('task.route',{id,...v},rev);openTask(id);note('Routing saved.');},()=>openTask(id));
  }
  function qualityVerdictForm(id){
    const t=agent().tasks.find(t=>t.id===id),rev=agent().revision,sourceTasks=agent().tasks.filter(x=>x.id!==id&&x.role!=='review'&&x.result&&(!t.parentTaskId||x.id===t.parentTaskId));
    form('Attribute the actual Quality verdict',select('sourceTaskId','Exact source assignment',Object.assign({'':'Standalone review · no specialist source'},Object.fromEntries(sourceTasks.map(x=>[x.id,x.title]))),t.parentTaskId||'')+select('verdict','Verdict',{'':'Choose the supported verdict',pass:'Pass',revise:'Corrections required',blocked:'Blocked'},t.qualityVerdict||'')+field('recordedBy','Recorded by','','text','required maxlength="180"')+area('evidence','Original reviewer / artifact / evidence reference','','required maxlength="2000"')+check('confirmCurrentSource','I checked that this actual verdict covers the current source result, recipient and scope.',false)+'<p class="quiet-note">Use this for an existing saved Quality result. Preserve the original; do not infer a pass from its status, title or old draft. This records attribution, not acceptance.</p>','Save verdict record',async v=>{v.confirmCurrentSource=v.confirmCurrentSource==='on';await D.dispatch('task.quality-verdict',{id,...v},rev);openTask(id);note('Quality verdict recorded.');},()=>openTask(id));
  }
  function emailReadinessForm(){
    const s=agent(),r=s.outreachReadiness||{},rev=s.revision,statuses={unknown:'Not verified',verified:'Verified with evidence',blocked:'Blocked'};
    const checks=[['sender','Cloud sender and test send'],['reply','Reply path / round trip'],['footer','Confirmed company postal footer']].map(([key,label])=>select(key,label,statuses,r[key]||'unknown')+area(key+'Evidence',label+' · evidence',r[key+'Evidence']||'','maxlength="1000"')).join('');
    form('Outbound email readiness','<p class="quiet-note">Company mailbox sign-in and message verification are separate. Save observed evidence and existing authorization once; recheck scope and suppression for each message. This form does not connect a mailbox or send a test email.</p>'+select('testType','Transport test type',{unknown:'Not recorded',internal_self:'Internal sales-to-sales test',external:'External recipient test'},r.testType||'unknown')+'<p class="quiet-note">An internal send/receive and reply test checks transport. It does not prove external-domain deliverability.</p>'+checks+select('authority','Owner-authorized sending scope',{unknown:'Not recorded',authorized:'Authorized scope recorded',held:'Explicit hold recorded'},r.authority||'unknown')+area('scope','Recipients, channel and limits',r.scope||'','maxlength="1500"')+area('authorityEvidence','Authorization or hold reference',r.authorityEvidence||'','maxlength="1500"')+pair(field('checkedOn','Checked on',r.checkedOn||day(),'date','required max="'+day()+'"'),field('recordedBy','Recorded by','','text','required maxlength="180"'))+(s.outreachReadinessHistory?.length?'<p class="quiet-note">'+s.outreachReadinessHistory.length+' prior readiness records retained in the register and backup.</p>':''),'Save readiness record',async v=>{await D.dispatch('outreach.readiness',v,rev);close();note('Readiness recorded. No message sent.');});
  }
  function dealForm(id,prefill){
    const d=agent().deals.find(x=>x.id===id)||prefill||{},rev=agent().revision;
    form(id?'Service opportunity':'New service opportunity',field('name','Customer / assignment',d.name,'text','required maxlength="180"')+select('offer','Service',A.OFFERS,d.offer||'custom_search')+pair(field('fee','Proposed fee · USD',d.feeCents==null?'':d.feeCents/100,'number','required min="0" step="0.01"'),select('stage','Deal stage',A.STAGES,d.stage||'qualified'))+field('contact','Contact route',d.contact)+area('notes','Scope & notes',d.notes||'')+'<p class="quiet-note">Scope and fees are agreed per assignment. A proposed fee is potential revenue. Record collected payments separately in Team → Revenue.</p>','Save opportunity',async v=>{await D.dispatch('deal.save',{id:id||uid('deal'),name:v.name,offer:v.offer,feeCents:usdCents(v.fee),stage:v.stage,contact:v.contact,notes:v.notes},rev);close();note('Service opportunity saved.');});
    if(!id){let feeEdited=false;const fields=$('editForm').elements;fields.fee.addEventListener('input',()=>{feeEdited=true;});fields.offer.addEventListener('change',()=>{if(!feeEdited&&['custom_search','site_review','managed_energy_hosting'].includes(fields.offer.value))fields.fee.value='';});}
  }
  function usdCents(v){if(!/^\d+(\.\d{1,2})?$/.test(v))throw Error('Enter a nonnegative USD amount with up to two decimals.');const cents=Math.round(Number(v)*100);if(!Number.isSafeInteger(cents))throw Error('Amount is too large.');return cents;}
  function cashForm(){const rev=agent().revision;form('Record cash',select('kind','Type',A.KINDS,'earned')+pair(field('amount','Amount · USD','','number','required min="0.01" step="0.01"'),field('date','Payment / reserve date',day(),'date','required max="'+day()+'"'))+field('note','Description','','text','required maxlength="1000"')+field('evidence','Payment / obligation reference','','text','required maxlength="1000"')+select('dealId','Linked service deal',Object.assign({'':'No linked deal'},Object.fromEntries(agent().deals.map(d=>[d.id,d.name]))),'')+check('earnedConfirmed','For a collected fee: this service fee has been earned and actually received.',false),'Save cash record',async v=>{await D.dispatch('cash.add',Object.assign(v,{id:uid('cash'),cents:usdCents(v.amount),earnedConfirmed:v.earnedConfirmed==='on'}),rev);close();note('Cash record saved.');});}
  function voidCash(id){const rev=agent().revision;form('Correct a cash entry','<p class="quiet-note">The original entry stays in history. Its amount is removed from the totals.</p>'+area('reason','Correction reason','','required maxlength="2000"'),'Void this entry',async v=>{await D.dispatch('cash.void',{id,reason:v.reason},rev);close();note('Original entry retained and marked void.');});}
  function workflow(type){if(type==='energy')return energyBriefForm(discovery.brief(),true);taskForm(G.workflows[type]);}
  function researchSite(){const clientBrief=discovery.brief()||activeSite?.custom_fields?.[E.KEY]?.current?.brief;if(!clientBrief)return energyBriefForm(null,true,activeCandidate);return taskForm(E.assignment({brief:clientBrief,candidate:activeCandidate,source:activeCandidate?ProspectDiligence.source(activeCandidate):null,page:activeSite?new URL(href('site',activeSite.id),location.href).href:location.href}));}
  function leadTask(id){const l=(agent().leads||[]).find(x=>x.id===id);if(!l||l.stage==='dnc'||l.stage==='disqualified')throw Error('This lead is not available for outreach.');G.validateLead(l);taskForm({title:'Draft outreach for '+l.company,role:'outreach',leadId:l.id,brief:'Prepare a draft only. Do not send.\nLead ID: '+l.id+'\nCRM lead: '+new URL(href('lead',l.id),location.href).href+'\nCompany: '+l.company+'\nOffer: '+A.OFFERS[l.offer]+'\nReason to buy this service: '+l.serviceFit+'\nBuying signal: '+l.signal+'\nSource: '+l.source+' (checked '+l.checked+')\nBuyer: '+l.buyer+'\nContact route: '+l.contact+'\nNext action: '+l.nextAction+'\n\nRecheck suppression and the actual service-buying rationale. Return concise unsent copy, source support, the next discovery question and a suggested follow-up.'});}
  function setup(){const text=G.briefing(location.href);modal('Connect the existing Grok team','<p class="quiet-note">Use this briefing in Proton Revenue Lead on the dedicated Proton Grok account. It updates the existing six bots to work from CRM.</p><ol class="quiet-note"><li>Open the published CRM in the same authorized Proton account on both computers.</li><li>Verify an existing task ID and result match. The shared register keeps the original records.</li><li>Use Team for work and reviews, Pipeline for prospects, and Discover for energy research.</li></ol><p class="quiet-note">'+(/localhost|127\.0\.0\.1/.test(location.hostname)?'This preview is local. Publish the CRM before changing the cloud bots’ destination.':'Account sync is separate from a running bot. Copying this briefing does not send it or create a schedule.')+'</p><textarea class="copy-area" readonly aria-label="Team setup instructions">'+esc(text)+'</textarea><div class="actions">'+button('Copy instructions','copy-setup','',true)+'</div>');}
  function qualityTask(id){const source=agent().tasks.find(t=>t.id===id);if(!source)throw Error('The source assignment is missing.');const existing=agent().tasks.find(t=>t.role==='review'&&t.parentTaskId===id&&A.actionable(t));if(existing){location.hash=href('task',existing.id);openTask(existing.id);note('Opened the existing Quality Review assignment.');return;}taskForm(G.qualityAssignment(source,location.href));}
  async function copy(text){try{await navigator.clipboard.writeText(text);note('Copied. Nothing has been sent.');}catch(_){modal('Copy this text','<textarea class="copy-area" readonly aria-label="Text to copy">'+esc(text)+'</textarea>');$('sheetBody').querySelector('textarea').select();}}
  function download(value,name){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function account(){
    const user=ProtonAuth.getUser(),status=D.status();
    if(user){modal('Your Proton account','<p>'+esc(user.email||user.displayName||user.uid)+'</p><p class="quiet-note">Agent register: '+esc(status.agent.mode)+'. '+esc(status.agent.error||'')+'</p><p class="quiet-note">Prospects use Proton’s existing sync. The agent register uses its own transactional connection. Local changes are retained when signed out.</p><div class="actions">'+button('Export backup','backup')+button('Sign out','signout')+'</div>');return;}
    form('Sign in to Proton','<p class="quiet-note">Use your existing Proton account. Local agent work remains separate and is not automatically uploaded.</p>'+field('email','Email','','email','required autocomplete="username"')+field('password','Password','','password','required autocomplete="current-password"')+button('Continue with Google','google-signin'),'Sign in',async v=>{await ProtonAuth.signInWithEmail(v.email,v.password);afterSignIn();note('Signed in. Checking your account records.');});
  }
  function allActions(){const state=agent(),actions=M.today({state,sites:D.sites(),leads:state.leads||[],tasks:state.tasks,followups:D.followups(),date:day()});modal('Due & review queue',actions.length?actions.map(i=>row({name:i.name,sub:i.context+' · '+(i.due||'Review'),action:i.kind==='followup'?'reminder':'open-'+i.kind,id:i.id,glyph:'today'})).join(''):empty('You are up to date.','Dated follow-ups and team results appear here.'));}
  function addPicker(){modal('What would you like to add?',row({name:'Energy opportunity',sub:'A landfill, power facility or other energy site.',action:'new-site',glyph:'site'})+row({name:'Revenue lead',sub:'A potential buyer for a paid service.',action:'new-lead',glyph:'people'})+row({name:'Team assignment',sub:'Research, draft, analyze or review.',action:'new-task',glyph:'team'}));}
  function isWorkbenchRoute(){return location.hash==='#team/workbench';}
  function afterSignIn(){if(isWorkbenchRoute()){workbenchGate='';reconcileWorkbenchRoute();}else close();}
  function reconcileWorkbenchRoute(status=D.status()){
    if(!isWorkbenchRoute()||agentWorkbench)return;
    let gate='',message='';
    if(!status.ready){gate='loading';message='Opening your account…';}
    else if(!status.uid){gate='anonymous';message='Sign in to your Proton account to open the agent workbench.';}
    else if(status.error){gate='error';message='Your account needs attention before the workbench can open. '+status.error;}
    else if(status.agent.error||!registerConfirmed(status)){gate='register';message='Waiting for a server-confirmed task register.';}
    if(gate){
      if(workbenchGate===gate&&sheet.open)return;
      workbenchGate=gate;
      modal('Agent workbench','<p role="status">'+esc(message)+'</p>'+(gate==='anonymous'?button('Sign in','account'):'')+'<p class="quiet-note">No task data or review editor is opened until your account and register are confirmed.</p>',close);
      return;
    }
    workbenchGate='ready';
    modal('Agent workbench','<div id="agentWorkbench"></div>',close,true);
    agentWorkbench=ProtonAgentWorkbench.mount({root:$('agentWorkbench'),data:D});
  }
  async function act(action,id){
    if(action==='outreach-route-add')return outreachRouteForm(id);
    if(action==='outreach-route-evidence')return outreachRouteForm(null,id);
    if(action==='outreach-permission')return outreachPermissionForm(id);
    if(action==='outreach-preferred')return outreachPreferenceForm(id);
    if(action==='outreach-route-suppress')return outreachSuppressionForm(null,id);
    if(action==='outreach-account-suppress')return outreachSuppressionForm(id);
    if(action==='outreach-channel'){const parts=id.split('|');return outreachChannelForm(parts.length>1?parts[1]:id,parts.length>1?parts[0]:null);}
    if(action==='outreach-touch-add')return outreachTouchForm(id);
    if(action==='outreach-touch-update'){const split=id.indexOf('|');if(split<1)throw Error('This touch reference is invalid.');return outreachTouchForm(id.slice(0,split),id.slice(split+1));}
    if(action==='energy-brief')return energyBriefForm(discovery.brief()||activeSite?.custom_fields?.[E.KEY]?.current?.brief);
    if(action==='energy-evidence')return energyEvidenceForm();
    if(action==='energy-research'){const brief=discovery.brief()||activeSite?.custom_fields?.[E.KEY]?.current?.brief;if(!brief)return energyBriefForm(null,true,activeCandidate);return taskForm(E.assignment({brief,candidate:activeCandidate,source:activeCandidate?ProspectDiligence.source(activeCandidate):null,page:activeSite?new URL(href('site',activeSite.id),location.href).href:location.href}));}
    if(action==='workflow-open'){teamTab='workflow';location.hash='#team';if(current==='team')render();return;}
    if(action==='workflow-stage'){pipelineKind='lead';pipelineGroup='all';pipelineSearch='';pipelineLimit=60;pipelineWorkflow=F.steps.some(s=>s[0]===id)?id:'all';location.hash='#pipeline';if(current==='pipeline')render();return;}
    if(action==='sourcing-start')return sourcingForm(id);if(action==='sourcing-next'){const task=agent().tasks.find(t=>t.id===id);if(!task)throw Error('This sourcing assignment is unavailable.');return sourcingForm(task.leadId,id);}if(action==='sourcing-rfq')return copy(S.rfqTemplate);
    if(action==='lead-work'){const l=(agent().leads||[]).find(x=>x.id===id);if(!l||F.leadProgress(l,agent()).closed)throw Error('This lead is not available for new work.');return taskForm({leadId:id,title:'Research next step for '+l.company,role:'intelligence',brief:'Lead ID: '+id+'\nCompany: '+l.company+'\nService: '+A.OFFERS[l.offer]+' ('+l.offer+')\nNext action: '+(l.nextAction||'Check fit and the public contact route.')+'\nResearch or prepare drafts only. Do not send outreach. Return evidence, blockers and the next action.'});}
    if(action==='cc-pipeline'||action==='cc-stage'){pipelineWorkflow='all';pipelineKind=action==='cc-pipeline'&&['site','lead','deal'].includes(id)?id:'all';pipelineGroup=action==='cc-stage'?id:'all';pipelineSearch='';pipelineLimit=60;location.hash='#pipeline';if(current==='pipeline')render();return;}
    if(['cc-team','cc-role','cc-revenue','cc-activity'].includes(action)){teamTab=action==='cc-revenue'?'revenue':action==='cc-activity'?'activity':'tasks';taskFilter=action==='cc-team'&&['review','owner','correction','reference','blocked','ready','working','draft'].includes(id)?id:'open';taskRole=action==='cc-role'?id:'';if(action==='cc-revenue')month=day().slice(0,7);location.hash='#team';if(current==='team')render();return;}

    if(action==='add')return addPicker();if(action==='go-discover'){close();location.hash='#discover';return;}if(action==='go-pipeline'){location.hash='#pipeline';return;}
    if(action==='pipeline-kind'){pipelineWorkflow='all';pipelineKind=id;pipelineLimit=60;return render();}if(action==='pipeline-group'){pipelineWorkflow='all';pipelineGroup=id;pipelineLimit=60;return render();}if(action==='pipeline-more'){pipelineLimit+=60;return render();}
    if(action==='candidate')return candidateDetail(id);
    if(action==='hosting-edit')return hostingForm();
    if(action==='hosting-export')return ManagedHostingUI.download(hostingPlan(activeSite,D.estimate(activeCandidate,activeSite)),activeSite?.name||activeCandidate.name);
    if(action==='hosting-task')return taskForm(G.managedHostingAssignment('hosting_economics',{siteId:activeSite.id,siteName:activeSite.name,siteUrl:new URL(href('site',activeSite.id),location.href).href}));
    if(action==='retry-contacts')return loadPeople(activeCandidate,activeSite);if(action==='site-tab'){siteTab=id;return siteDetail();}if(action==='new-site')return siteForm();if(action==='edit-site')return siteForm(id);if(action==='stage')return stageForm(id);
    if(action==='track-site'||action==='track-site-active'){const site=await D.track(activeCandidate,D.snapshot());activeSite=site;siteDetail();note(site._existing?'Already in your pipeline.':'Added to your pipeline.');return;}
    if(action==='planning'||action==='capacity'||action==='economics')return diligenceForm(action);if(action==='asset')return diligenceForm('asset',id);if(action==='qualification')return qualificationForm(id);
    if(action==='new-followup')return followupForm(id);if(action==='log-interaction')return interactionForm(id);if(action==='reminder')return reminder(id);if(action==='done-followup'){await D.complete(id,D.snapshot());close();note('Follow-up completed.');return;}
    if(action==='new-contact')return contactForm();if(action==='edit-contact')return contactForm(id);if(action==='site-contact')return contactForm(null,id);
    if(action==='new-lead')return leadForm();if(action==='edit-lead')return leadForm(id);if(action==='open-lead'){if(location.hash===href('lead',id))openLead(id);else location.hash=href('lead',id);return;}
    if(action==='lead-task')return leadTask(id);if(action==='lead-deal'){const l=agent().leads.find(x=>x.id===id);return dealForm(null,{name:l.company,offer:l.offer,contact:l.contact,feeCents:['custom_search','site_review','managed_energy_hosting'].includes(l.offer)?null:l.offer==='quote_review'?50000:150000,notes:'Lead '+l.id+'\n'+l.lastNote});}
    if(action==='new-task')return taskForm();if(action==='workflow')return workflow(id);if(action==='research-site')return researchSite();if(action==='open-task'){const hash=href('task',id);if(location.hash===hash)route();else location.hash=hash;return;}
    if(action==='team-tab'){teamTab=id;return render();}if(action==='role'){const r=role(id);modal(r.botName,'<p class="note-text">'+esc(r.instructions)+'</p><div class="actions" style="margin-top:20px">'+button('Assign a task','role-task',id,true)+button('View assignments','role-filter',id)+'</div><p class="quiet-note">Use this exact name in Proton Revenue Desk. These instructions and task counts are not live bot telemetry.</p>');return;}
    if(action==='role-task')return taskForm({role:id});if(action==='role-filter'){taskRole=id;teamTab='tasks';close();render();return;}
    if(['task-result','task-review','task-block'].includes(action))return taskActionForm(id,action.slice(5));
    if(action==='task-quality')return qualityTask(id);if(action==='task-routing')return routingForm(id);if(action==='task-verdict')return qualityVerdictForm(id);if(action==='task-completed-review')return completedReviewForm(id);if(action==='email-readiness')return emailReadinessForm();
    if(action==='task-packet')return copy(G.packet(agent(),agent().tasks.find(t=>t.id===id),location.href));
    if(['task-ready','task-start','task-handoff'].includes(action)){await D.dispatch(action.replace('-','.'),{id},taskRevision);openTask(id);return;}
    if(action==='task-cancel'){const rev=taskRevision;modal('Cancel assignment?','<p class="quiet-note">Cancellation closes the CRM task. Relay a stop to Grok if work is already running.</p><div class="actions">'+button('Keep task','open-task',id)+button('Confirm cancellation','confirm-task-cancel',id,true)+'</div>',()=>openTask(id));taskRevision=rev;return;}
    if(action==='confirm-task-cancel'){await D.dispatch('task.cancel',{id},taskRevision);openTask(id);return;}
    if(action==='pause'){const rev=agent().revision,paused=agent().paused;form(paused?'Resume the queue?':'Pause the queue?','<p class="quiet-note">'+(paused?'New handoffs and task claims will be available.':'New handoffs and claims will pause. Stop any running work directly in Grok.')+'</p>',paused?'Resume queue':'Pause queue',async()=>{await D.dispatch('pause',{},rev);close();});return;}
    if(action==='new-deal')return dealForm();if(action==='new-cash')return cashForm();if(action==='void-cash')return voidCash(id);if(action==='goal'){const rev=agent().revision;form('Monthly contribution target',field('target','Target · USD',agent().goalCents/100,'number','required min="0.01" step="0.01"'),'Save target',async v=>{await D.dispatch('settings',{goalCents:usdCents(v.target)},rev);close();});return;}
    if(action==='show-reviews'||action==='show-owner'){taskFilter=action==='show-owner'?'owner':'review';taskRole='';teamTab='tasks';if(current==='team')render();else location.hash='#team';return;}if(action==='show-due')return allActions();
    if(action==='deal-list'){teamTab='revenue';return render();}if(action==='cash-info'){modal('Collected contribution','<p class="quiet-note">Earned fees collected, less paid delivery and software costs, less cash reserved, plus released reserves. This is a manual operating register, not bank reconciliation.</p>');return;}
    if(action==='setup')return setup();if(action==='copy-setup')return copy(G.briefing(location.href));if(action==='backup'){download(D.backup(),'proton-crm-'+day()+'.json');note('CRM backup exported.');return;}
    if(action==='account')return account();if(action==='signout'){await ProtonAuth.signOut();close();return;}if(action==='google-signin'){await ProtonAuth.signInWithGoogle();afterSignIn();return;}
    if(action==='cancel-form'){if(modalBack)modalBack();else close();return;}if(action==='reload')location.reload();
  }
  document.addEventListener('toggle',event=>{
    const el=event.target;if(!(el instanceof HTMLElement)||!document.contains(el))return;
    if(el.matches('.wf-lead-card')){
      const id=el.dataset.leadId;if(el.open){expandedLeads.add(id);const body=el.querySelector('.wf-lead-body'),lead=agent().leads.find(l=>l.id===id);if(lead&&!body.children.length)body.innerHTML=leadInfo(lead);}else expandedLeads.delete(id);
    }else if(el.matches('[data-lead-section]')){
      const card=el.closest('.wf-lead-card');if(card){const key=card.dataset.leadId+'/'+el.dataset.leadSection;if(el.open)expandedLeadSections.add(key);else expandedLeadSections.delete(key);}
    }
  },true);
  document.addEventListener('click',async event=>{
    if(busy)return;
    const target=event.target.closest('[data-action]');
    if(!target){
      const link=event.target.closest('a[href]');
      if(link&&!event.defaultPrevented&&!event.button&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey&&link.getAttribute('href')===location.hash&&/^#team\/task\//.test(location.hash)){event.preventDefault();route();}
      return;
    }
    event.preventDefault();activeActions++;try{await act(target.dataset.action,target.dataset.id);}catch(e){error(e);}finally{activeActions--;}
  });
  let searchTimer;
  document.addEventListener('input',event=>{
    const el=event.target;
    if(el.id==='pipelineSearch'||el.id==='peopleSearch'){
      if(el.id==='pipelineSearch')pipelineSearch=el.value;else peopleSearch=el.value;
      clearTimeout(searchTimer);searchTimer=setTimeout(()=>{const start=el.selectionStart,id=el.id;render();$(id).focus();try{$(id).setSelectionRange(start,start);}catch(_){}},180);
    }
  });
  document.addEventListener('change',event=>{const el=event.target;
    if(el.dataset.outreachPlan){const leadId=el.dataset.leadId,key=el.dataset.outreachPlan;outreachPlans.set(leadId,{...(outreachPlans.get(leadId)||{}),[key]:el.value});render();requestAnimationFrame(()=>{const control=$('content').querySelector('[data-outreach-plan="'+CSS.escape(key)+'"][data-lead-id="'+CSS.escape(leadId)+'"]');if(control)control.focus({preventScroll:true});});}
    if(el.id==='taskFilter'){taskFilter=el.value;render();}if(el.id==='taskRole'){taskRole=el.value;render();}if(el.id==='revenueMonth'){month=el.value||day().slice(0,7);render();}
  });
  function safeToUpdate(){
    const status=D.status(),a=status.agent;
    // The exchange owns an in-memory editor and may be awaiting an exact receipt.
    if(exchangeVisible)return false;
    if(!status.ready||status.error||busy||activeActions||sheet.open||modalForm||completedReviewSession?.saving||completedReviewSession?.pending)return false;
    if(!D.reloadSafety?.().safe||!intakeInbox.reloadSafety?.().safe)return false;
    // A newer validator may read a rejected snapshot. Reloading never accepts it:
    // the fresh client must validate again, and all writes stay blocked meanwhile.
    const staleValidator=status.uid&&a.uid===status.uid&&a.mode==='error'&&a.validationIssue?.code==='unsupported_lead_field';
    if(!registerConfirmed(status)&&!staleValidator)return false;
    if(document.activeElement?.matches?.('input,textarea,select,[contenteditable="true"]'))return false;
    // These planning values are intentionally kept in memory, not saved records.
    if(discovery.brief()||outreachPlans.size)return false;
    return true;
  }
  function updatePending(update){
    let banner=$('crmUpdateNotice');
    if(update?.status==='current'){banner?.remove();return;}
    if(!banner){banner=document.createElement('aside');banner.id='crmUpdateNotice';banner.className='banner crm-update-notice';banner.setAttribute('role','status');$('content').before(banner);}
    banner.textContent=update?.message||'A CRM update is ready. Finish editing and confirm pending saves; your work stays open.';
  }
  route();
  if(window.ProtonCrmRelease)releaseUpdates=window.ProtonCrmRelease.start({
    isSafeToReload:safeToUpdate,
    getAccountKey:()=>D.status().ready?(D.status().uid||'local'):null,
    onUpdatePending:updatePending
  });
  releaseUpdates?.restore();
}());
