'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../crm/control-center'),A=require('../agent-control-model');
function fixture(){return {date:'2026-09-17',state:A.initial(),sites:[],contacts:[],followups:[]};}
test('overview separates active pipeline records, suppression, reviews and overdue work without mutating stores',()=>{
  const f=fixture();f.sites=[{id:'same',name:'Energy',stage:'researching'},{id:'closed',name:'Closed',stage:'closed_won'}];
  f.state.leads=[{id:'same',company:'Buyer',stage:'qualified',nextAction:'Prepare review',due:'2026-09-16'},{id:'suppressed',company:'Suppressed',stage:'dnc',due:'2026-01-01'}];
  f.state.deals=[{id:'deal',name:'Proposal',stage:'proposed',feeCents:150000},{id:'finished',name:'Finished',stage:'accepted',feeCents:900000}];
  f.state.tasks=[{id:'r',title:'Review',status:'review'},{id:'b',title:'Blocked',status:'blocked'},{id:'done',title:'Old',status:'done',due:'2026-01-01'}];
  f.followups=[{id:'future',prospect_id:'same',description:'Next call',status:'pending',due_date:'2026-09-20'},{id:'old',prospect_id:'same',status:'done',due_date:'2026-01-01'}];
  const before=JSON.stringify(f),v=C.summary(f);
  assert.equal(v.pipeline.length,3);assert.equal(v.reviews,1);assert.equal(v.blocked,1);assert.equal(v.due,1);assert.equal(v.overdue,1);
  assert.equal(v.nextWeek,1);assert.equal(v.withoutNextAction.length,0);assert.equal(v.leads.length,1);assert.equal(v.cash.pipeline,150000);
  assert.deepEqual(v.actions.map(a=>a.id),['same','r','b']);assert.equal(JSON.stringify(f),before);
});
test('monthly contribution uses collected cash less costs and reserves, excluding proposals and voided or older entries',()=>{
  const f=fixture();f.state.entries=[{kind:'earned',cents:100000,date:'2026-09-01'},{kind:'delivery',cents:10000,date:'2026-09-02'},{kind:'software',cents:2000,date:'2026-09-02'},{kind:'reserve',cents:5000,date:'2026-09-02'},{kind:'release',cents:1000,date:'2026-09-03'},{kind:'earned',cents:990000,date:'2026-08-01'},{kind:'earned',cents:990000,date:'2026-09-01',voidedAt:'2026-09-02'}];
  f.state.deals=[{id:'d',name:'Potential',stage:'proposed',feeCents:999900}];
  const v=C.summary(f);assert.equal(v.cash.contribution,84000);assert.equal(v.cashEntries,5);assert.equal(v.cash.pipeline,999900);
});
test('research and contact gaps count only saved active records and pending follow-ups',()=>{
  const f=fixture();f.sites=[{id:'a',name:'Needs action',stage:'researching'},{id:'b',name:'Scheduled',stage:'diligence'},{id:'d',name:'Dead',stage:'dead'}];
  f.followups=[{id:'f1',prospect_id:'a',status:'done',due_date:'2026-09-15'},{id:'f2',prospect_id:'b',status:'snoozed',due_date:'2026-09-22'}];
  f.contacts=[{name:'A',email:'a@example.test',role:'decision_maker',last_verified:'2026-09-01'},{name:'B',phone:' ',last_verified:''}];
  const v=C.summary(f);assert.equal(v.activeSites.length,2);assert.equal(v.researchSites.length,1);assert.deepEqual(v.withoutNextAction.map(s=>s.id),['a']);
  assert.equal(v.contacts,2);assert.equal(v.reachable,1);assert.equal(v.decisionMakers,1);assert.equal(v.unverified,1);
});

const NOW=Date.parse('2026-09-20T04:00:00.000Z'),MINUTE=60*1000;
const at=age=>new Date(NOW-age).toISOString();
const work=(id,fields={})=>({id,title:'Synthetic '+id,role:'intelligence',status:'working',...fields});
test('reported work expires at the conservative 30-minute boundary, independent of saved status',()=>{
  assert.equal(C.WORK_STALE_MS,30*MINUTE);
  const t=work('boundary',{startedAt:at(29*MINUTE)}),before=JSON.stringify(t);
  assert.equal(C.workFreshness(t,NOW).fresh,true);
  assert.equal(C.workFreshness(t,NOW).reason,'fresh');
  assert.equal(C.workFreshness(t,NOW+MINUTE-1).fresh,true);
  assert.equal(C.workFreshness(t,NOW+MINUTE).fresh,false);
  assert.equal(C.workFreshness(t,NOW+MINUTE).reason,'stale');
  assert.equal(C.workFreshness(t,NOW+MINUTE).reportedAt,t.startedAt);
  assert.equal(JSON.stringify(t),before);
});
test('the newest valid report governs freshness, and either timestamp can stand alone',()=>{
  for(const fields of [{startedAt:at(MINUTE)},{updatedAt:at(MINUTE)},{startedAt:at(90*MINUTE),updatedAt:at(MINUTE)},{startedAt:at(MINUTE),updatedAt:at(90*MINUTE)}]){
    const f=C.workFreshness(work('latest',fields),NOW);assert.equal(f.fresh,true);assert.equal(f.reportedAt,at(MINUTE));
  }
  assert.equal(C.workFreshness(work('offset',{updatedAt:'2026-09-20T00:00:00-04:00'}),NOW).reportedAt,at(0));
});
test('missing, malformed and future reports cannot create freshness or hide behind a valid alternate timestamp',()=>{
  for(const fields of [{},{startedAt:'',updatedAt:''}]){
    const f=C.workFreshness(work('missing',fields),NOW);assert.equal(f.fresh,false);assert.equal(f.reason,'missing');assert.equal(f.reportedAt,'');
  }
  for(const fields of [{updatedAt:'not a timestamp'},{startedAt:'not a timestamp',updatedAt:at(0)},{startedAt:at(0),updatedAt:'not a timestamp'}]){
    const f=C.workFreshness(work('invalid',fields),NOW);assert.equal(f.fresh,false);assert.equal(f.reason,'invalid');
  }
  for(const fields of [{startedAt:at(-1)},{updatedAt:at(-MINUTE)},{startedAt:at(0),updatedAt:at(-MINUTE)},{startedAt:at(-MINUTE),updatedAt:at(0)}]){
    const f=C.workFreshness(work('future',fields),NOW);assert.equal(f.fresh,false);assert.equal(f.reason,'future');
  }
});
test('role reports retain counts and expose older unconfirmed work even beside a fresh report',()=>{
  const tasks=[work('fresh',{updatedAt:at(MINUTE)}),work('stale',{startedAt:at(31*MINUTE)}),work('unknown'),
    work('reference',{routing:{kind:'reference'},updatedAt:at(0)}),work('superseded',{routing:{kind:'superseded'},updatedAt:at(0)}),
    work('closed',{status:'done'}),work('cancelled',{status:'cancelled'}),work('review',{status:'review'})];
  const before=JSON.stringify(tasks),report=C.roleReport(tasks,NOW);
  assert.equal(report.working,3);assert.equal(report.needsCheck,2);assert.equal(report.shining,false);
  assert.match(report.status,/Work status needs checking/);assert.match(report.status,/1 in team review/);
  assert.match(report.lastReported,/Last reported/i);assert.equal(JSON.stringify(tasks),before);
  const fresh=C.roleReport([tasks[0]],NOW);assert.equal(fresh.working,1);assert.equal(fresh.needsCheck,0);assert.equal(fresh.shining,true);assert.match(fresh.status,/reported/i);assert.match(fresh.lastReported,/UTC/);
  const unknown=C.roleReport([work('unknown')],NOW);assert.equal(unknown.shining,false);assert.match(unknown.lastReported,/unavailable/i);
  for(const fields of [{updatedAt:at(-MINUTE)},{updatedAt:'bad'}])assert.equal(C.roleReport([work('bad',fields)],NOW).shining,false);
});
test('freshness projection never reclaims or changes the saved working count',()=>{
  const f=fixture();f.state.tasks=[work('fresh',{updatedAt:at(0)}),work('old',{updatedAt:at(60*MINUTE)})];
  const before=JSON.stringify(f),first=C.roleReport(f.state.tasks,NOW),later=C.roleReport(f.state.tasks,NOW+31*MINUTE);
  assert.equal(first.needsCheck,1);assert.equal(later.needsCheck,2);assert.equal(first.working,later.working);
  assert.equal(C.summary(f).working,2);assert.equal(JSON.stringify(f),before);
});
function watcherHarness(initialTasks){
  let now=NOW,tasks=initialTasks,tick,reads=0,cancelled=false;
  const classes=()=>{const values=new Set();return {toggle:(name,on)=>on?values.add(name):values.delete(name),contains:name=>values.has(name)};};
  const status={textContent:'',classList:classes()},time={textContent:'',hidden:true};
  const button={dataset:{id:'intelligence'},classList:classes(),querySelector:selector=>({'.cc-role-status':status,'.cc-role-time':time})[selector]};
  const listeners=new Map(),doc={hidden:false,addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:(type,fn)=>{assert.equal(listeners.get(type),fn);listeners.delete(type);}};
  const container={ownerDocument:doc,isConnected:true,querySelectorAll:selector=>{assert.equal(selector,'.cc-role');return [button];}};
  const dispose=C.watchFreshness(container,()=>{reads++;return tasks;},{document:doc,now:()=>now,setInterval:(fn,delay)=>{assert.equal(delay,30000);tick=fn;return 42;},clearInterval:id=>{assert.equal(id,42);cancelled=true;}});
  return {button,status,time,container,doc,listeners,dispose,tick:()=>tick(),setNow:value=>{now=value;},setTasks:value=>{tasks=value;},reads:()=>reads,cancelled:()=>cancelled,visibility:()=>listeners.get('visibilitychange')?.()};
}
test('lightweight refresh expires work, waits while hidden and cleans up without touching records',()=>{
  const tasks=Object.freeze([Object.freeze(work('watched',{updatedAt:at(0)}))]),before=JSON.stringify(tasks),h=watcherHarness(tasks);
  assert(h.button.classList.contains('is-working'));assert.match(h.status.textContent,/reported/i);assert.equal(h.time.hidden,false);
  h.doc.hidden=true;const reads=h.reads();h.setNow(NOW+31*MINUTE);h.tick();assert.equal(h.reads(),reads);assert(h.button.classList.contains('is-working'));
  h.doc.hidden=false;h.visibility();assert.equal(h.button.classList.contains('is-working'),false);assert.match(h.status.textContent,/Work status needs checking/);assert.match(h.time.textContent,/Last reported/);
  assert.equal(JSON.stringify(tasks),before);h.dispose();assert(h.cancelled());assert.equal(h.listeners.size,0);const stopped=h.reads();h.tick();assert.equal(h.reads(),stopped);
});
test('time passing or a clock rollback cannot make the same uncertain report animate again',()=>{
  const future=watcherHarness([work('future',{updatedAt:at(-MINUTE)})]);assert.equal(future.button.classList.contains('is-working'),false);
  future.setNow(NOW+2*MINUTE);future.tick();assert.equal(future.button.classList.contains('is-working'),false);assert.match(future.status.textContent,/Work status needs checking/);
  future.setTasks([work('future',{updatedAt:new Date(NOW+2*MINUTE).toISOString()})]);future.tick();assert(future.button.classList.contains('is-working'),'a new valid report can restore reported freshness');future.dispose();
  const expired=watcherHarness([work('expired',{updatedAt:at(0)})]);expired.setNow(NOW+31*MINUTE);expired.tick();assert.equal(expired.button.classList.contains('is-working'),false);
  expired.setNow(NOW+MINUTE);expired.tick();assert.equal(expired.button.classList.contains('is-working'),false);expired.dispose();
});
test('a retained or pending account snapshot never animates as freshly reported work',()=>{
  const task=work('reported',{updatedAt:at(0)}),status=agent=>({uid:'synthetic',agent:{uid:'synthetic',...agent}});
  for(const agent of [{mode:'error',serverConfirmed:false},{mode:'offline',serverConfirmed:false},{mode:'cloud',serverConfirmed:false},{mode:'cloud',serverConfirmed:true,uid:'other'}]){
    const connection=status(agent),report=C.roleReport([task],NOW,(t,now)=>C.snapshotReport(t,now,connection));
    assert.equal(C.confirmedSnapshot(connection),false);assert.equal(report.shining,false);assert.match(report.status,/needs checking/);assert.match(report.lastReported,/sync not verified/);
  }
  assert(C.confirmedSnapshot(status({mode:'cloud',serverConfirmed:true})));
  assert(C.confirmedSnapshot({uid:null,agent:{mode:'local'}}));
});
test('latest saved energy lead remains visible apart from historical tasks and no recorded active task',()=>{
  const state=A.initial();state.leads=[{id:'energy_new',company:'Synthetic energy <img src=x>',offer:'custom_search',stage:'discovered',updatedAt:'2025-09-20T12:00:00Z',nextAction:'Confirm usable power and owner access.'}];
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const before=JSON.stringify(state),html=C.recentWork(state,{esc},{connection:{uid:'synthetic',agent:{uid:'synthetic',mode:'error',serverConfirmed:false}}});
  assert.match(html,/Latest saved lead/);assert.match(html,/Synthetic energy &lt;img src=x&gt;/);assert.match(html,/#pipeline\/lead\/energy_new/);assert.match(html,/No active task recorded/);assert.match(html,/Snapshot not current/);assert.match(html,/does not prove that no work ran/);assert.doesNotMatch(html,/<img|Result accepted|is-working/);assert.equal(JSON.stringify(state),before);
});
