'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),F=require('../crm/workflow'),A=require('../agent-control-model');
const lead=(id,stage='qualified')=>({id,company:'Test '+id,stage,offer:'sourcing',website:'https://'+id+'.example.test',contact:id+'@example.test'});
const task=(id,role,status,extra={})=>({id,role,status,title:id,brief:'',updatedAt:'2026-09-18T12:00:00Z',...extra});
test('only explicit IDs, CRM links and review ancestry link work; not company or domain mentions',()=>{
 const l=lead('lead_one'),state={leads:[l],tasks:[task('a','outreach','review',{brief:'Lead ID: lead_one\nCompany: Test'}),task('b','review','ready',{parentTaskId:'a'}),task('c','analysis','ready',{brief:'Company: Test lead_one https://lead_one.example.test'}),task('d','outreach','ready',{brief:'Lead ID: lead_one_more'}),task('e','analysis','ready',{sources:['https://protonminingco.com/crm/#pipeline/lead/lead_one']})]};
 assert.deepEqual(F.linkedTasks(l,state).map(t=>t.id).sort(),['a','b','e']);
});

test('explicit batch Leads list links current registered IDs and their QA while preserving cancelled history',()=>{
 const ids=['lead_629c5875-2793-47f6-87bc-969d333cd812','lead_c4bebb34-8dcf-4851-8575-296e8a7f899e','lead_60e143d3-e2e3-4cd0-9dfa-aa81b8dbdc27'],leads=ids.map(id=>lead(id));
 const brief='Artifact: campaigns/PM-ASIC-001/roles/outreach-first-conversations-v3.md Leads: '+ids[0]+' (ING); '+ids[1]+' (BlueForge); '+ids[2]+' (Endless). Predecessor: cancelled task_old';
 const state={leads,tasks:[task('current','outreach','review',{brief,result:'Synthetic current draft'}),task('quality','review','ready',{parentTaskId:'current'}),task('old','outreach','cancelled',{brief:'Lead ID: '+ids[0],result:'Synthetic obsolete draft'}),task('predecessor-only','outreach','cancelled',{brief:'Predecessor: cancelled task_current; '+ids[0]})]},before=JSON.stringify(state);
 assert.deepEqual(F.linkedTasks(leads[0],state).map(t=>t.id).sort(),['current','old','quality']);
 for(const l of leads.slice(1))assert.deepEqual(F.linkedTasks(l,state).map(t=>t.id).sort(),['current','quality']);
 const p=F.leadProgress(leads[0],state);assert.equal(p.current.id,'quality');assert.equal(p.owner,'Quality Review');assert.equal(p.step,'review');
 assert.equal(state.tasks[2].status,'cancelled');assert.equal(JSON.stringify(state),before);
});

test('explicit Leads lists support multiline, semicolon and comma entries but require registered exact IDs',()=>{
 const a=lead('lead_one'),b=lead('lead_two'),c=lead('lead_three'),missing=lead('lead_missing');
 const state={leads:[a,b,c],tasks:[task('multiline','analysis','review',{brief:'Artifact: campaigns/synthetic.md\r\nLeads:\r\n  lead_one (One);\r\n  lead_missing (Not in this register);\r\n  lead_two (Two),\r\n  lead_three (Three)\r\nPredecessor: lead_other'}),task('newline-only','analysis','review',{brief:'  Leads: lead_one\nlead_two\nlead_three\nNotes: lead_missing'}),task('artifact-semicolon','analysis','review',{brief:'Artifact: campaigns/synthetic.md; Leads: lead_one; lead_two.'})]};
 assert.deepEqual(F.linkedTasks(a,state).map(t=>t.id).sort(),['artifact-semicolon','multiline','newline-only']);
 assert.deepEqual(F.linkedTasks(b,state).map(t=>t.id).sort(),['artifact-semicolon','multiline','newline-only']);
 assert.deepEqual(F.linkedTasks(c,state).map(t=>t.id).sort(),['multiline','newline-only']);
 assert.deepEqual(F.linkedTasks(missing,state),[]);
});

test('batch links do not infer IDs from prose, predecessor fields, annotations or malformed token boundaries',()=>{
 const l=lead('lead_one'),briefs=[
  'Predecessor: cancelled task_old; lead_one',
  'Previous Leads: lead_one',
  'Notes: Leads: lead_one',
  'Notes: quoted example; Leads: lead_one',
  'NotLeads: lead_one',
  'Leads: lead_one_more',
  'Leads: lead_one-more',
  'Leads: lead_one.example.test',
  'Leads: https://example.test/lead_one',
  'Leads: lead_one?ignored=true',
  'Leads: lead_one/another',
  'Leads: lead_one<script>',
  'Leads: unknown (lead_one); Predecessor: lead_one',
  'Leads: unknown; Notes: lead_one',
  'Leads: unknown. Predecessor: lead_one',
  'Leads: unknown; do not extract lead_one',
  'Company: Test lead_one; website: https://lead_one.example.test'
 ];
 const state={leads:[l],tasks:briefs.map((brief,i)=>task('ambiguous_'+i,'analysis','review',{brief}))};
 state.tasks.push(task('source-text','analysis','review',{sources:['Leads: lead_one']}));
 assert.deepEqual(F.linkedTasks(l,state),[]);
});
test('accepted drafts are not contacts and stale charter prose cannot determine email readiness',()=>{
 const l=lead('one'),state={leads:[l],tasks:[task('draft','outreach','done',{leadId:l.id}),task('charter','revenue','draft',{title:'PM-LOOP-002 operating charter — draft only / every 4 hours',brief:'OWNER HOLD (critical): NO actual outreach until OWNER confirms email ready AND send/reply path tested.'})]};
 const before=JSON.stringify(state),p=F.leadProgress(l,state);assert.equal(p.step,'contact');assert.equal(p.now,'Draft accepted · sending blocked');assert.equal(p.owner,'Revenue Lead');assert.equal(l.stage,'qualified');assert.equal(JSON.stringify(state),before);
 assert.equal(F.steps.find(s=>s[0]==='contact')[1],'Outreach');assert.doesNotMatch(F.leadCounts(state,''),/05 \/ Contact/);assert.equal(p.current,undefined);
 state.tasks.push(task('new-charter','revenue','draft',{title:'PM-LOOP-003 operating charter',brief:'Email ready: owner hold cleared',updatedAt:'2026-09-19T12:00:00Z'}));assert.equal(F.emailReadiness(state).ready,false);
 state.outreachReadiness={sender:'verified',reply:'verified',footer:'verified',authority:'authorized',checkedOn:'2026-09-18'};assert.equal(F.hold(state),null);assert.equal(F.leadProgress(l,state).now,'Draft accepted · not sent');
});

test('verified sender and reply with only a missing footer identifies the mailing address without clearing an authority hold',()=>{
 const state={outreachReadiness:{sender:'verified',reply:'verified',footer:'pending',authority:'authorized',checkedOn:'2026-09-20'}},before=JSON.stringify(state);
 const readiness=F.emailReadiness(state);assert.equal(readiness.ready,false);assert.equal(readiness.label,'Business mailing address needed');assert.deepEqual(readiness.missing,['footer']);assert.match(readiness.next,/business mailing address/);assert.doesNotMatch(readiness.next,/test send|reply path/);assert.equal(JSON.stringify(state),before);
 assert.match(F.holdBanner(state),/Business mailing address needed/);
 state.outreachReadiness.authority='held';const held=F.emailReadiness(state);assert.equal(held.ready,false);assert.equal(held.label,'Sending scope on hold');assert.match(held.next,/business mailing address/);assert.match(held.next,/Sending remains on hold/);
 state.outreachReadiness.footer='verified';assert.equal(F.emailReadiness(state).label,'Sending scope on hold');assert.equal(F.emailReadiness(state).ready,false);
});
test('recorded conversations never move backward because old drafts remain, and suppression wins',()=>{
 const l=lead('one','replied'),state={leads:[l],tasks:[task('draft','outreach','review',{leadId:'one'}),task('qa','review','ready',{parentTaskId:'draft'})]};
 assert.equal(F.leadProgress(l,state).step,'conversation');
 state.leads.push({...lead('two','dnc'),contact:l.contact});const p=F.leadProgress(l,state);assert.equal(p.step,'closed');assert.equal(p.now,'Do not contact');assert.match(p.next,/suppressed/);
});
test('batch results awaiting independent QA advance the visible focus to queued QA without claiming acceptance',()=>{
 const state={tasks:[task('a','intelligence','review',{title:'PM-ASIC-001-01 Research a small cohort',result:'Five candidates'}),task('b','review','ready',{title:'PM-ASIC-001-02 Independently qualify the cohort'}),task('c','outreach','draft',{title:'PM-ASIC-001-03 Prepare drafts'}),task('d','review','draft',{title:'PM-ASIC-001-04 Review drafts'})]};
 const [c]=F.campaigns(state);assert.equal(c.current.task.id,'b');assert.equal(c.next.task.id,'c');assert.match(F.overview(state),/Check candidate fit/);assert.match(F.overview(state),/Agent review/);assert.doesNotMatch(F.overview(state),/Five qualified/);
});
test('read-only UI escapes untrusted saved lead names, actions and task content',()=>{
 const l={...lead('one'),company:'<img src=x onerror=alert(1)>',nextAction:'<script>send()</script>'},state={leads:[l],tasks:[]};const html=F.card(l,state)+F.detail(l,state);
 assert(!html.includes('<img'));assert(!html.includes('<script>'));assert.match(html,/&lt;img/);
});
test('preparing a future draft assignment does not advance an unqualified lead',()=>{
 const l=lead('one','discovered'),state={leads:[l],tasks:[task('research','intelligence','ready',{leadId:l.id}),task('draft','outreach','draft',{leadId:l.id})]};
 const p=F.leadProgress(l,state);assert.equal(p.step,'research');assert.match(p.now,/Research queued/);
});
test('new assignment retains a valid lead link and rejects missing leads without mutating old records',()=>{
 let s=A.initial();s=A.reduce(s,{type:'lead.save',id:'ev1',revision:s.revision,at:'2026-09-18T12:00:00Z',payload:{id:'one',company:'One',website:'https://example.test',stage:'discovered',offer:'sourcing',channel:'direct'}});
 const action={type:'task.add',id:'ev2',revision:s.revision,at:'2026-09-18T12:01:00Z',payload:{id:'linked',leadId:'one',title:'Check One',role:'intelligence',brief:'Research only'}};
 const next=A.reduce(s,action);assert.equal(next.tasks[0].leadId,'one');assert.equal(s.tasks.length,0);assert.throws(()=>A.reduce(s,{...action,payload:{...action.payload,leadId:'missing'}}),/linked lead/);
});
test('brokerage labels require the explicit campaign marker and preserve earlier hosting records',()=>{
 const l={...lead('one'),notes:'PM-ASIC-001 | ASIC brokerage | seller'};assert.equal(F.offerLabel(l),'ASIC brokerage');
 assert.equal(F.offerLabel({...l,offer:'managed_energy_hosting'}),'Proton Managed Energy Hosting');
 assert.equal(F.offerLabel({...l,notes:'May be interested in ASIC brokerage'}),'Sourcing Desk');
});

const snapshotNow=Date.parse('2026-09-20T20:00:00Z');
const latest=state=>F.latestWork(state,{now:snapshotNow});
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}

test('a newly saved unlinked energy lead surfaces independently of an older completed ASIC batch',()=>{
 let state=A.initial();
 state=A.reduce(state,{type:'lead.save',id:'save-energy',revision:0,at:'2026-09-20T18:00:00Z',payload:{
  id:'energy-client',company:'Energy client',website:'https://energy-client.example.test',stage:'discovered',offer:'custom_search',channel:'direct',
  notes:'Native chat says working; QA PASS in a local file. These are notes, not task or review records.',nextAction:'Clarify the client load.'
 }});
 state.tasks.push(task('old-asic','intelligence','done',{title:'PM-ASIC-001-01 Research candidates',result:'Prior saved cohort',updatedAt:'2026-09-18T12:00:00Z'}));
 const before=JSON.stringify(state),view=latest(freeze(state));
 assert.equal(view.latestLead.id,'energy-client');assert.equal(view.latestOutcome.id,'energy-client');
 assert.equal(view.latestOutcome.campaignLabel,'Custom Site Search');assert.equal(view.latestOutcome.status,'discovered');
 assert.equal(view.latestOutcome.updatedAt,'2026-09-20T18:00:00.000Z');assert.equal(view.latestOutcome.timestampLabel,'Lead record updated');
 assert.deepEqual(view.latestOutcome.linkedTasks,[]);assert.equal(view.latestOutcome.review,null);
 assert.equal(view.latestOutcome.href,'#pipeline/lead/energy-client');assert.equal(view.latestResult.id,'old-asic');
 assert.equal(view.activeTasks.length,0);assert.equal(view.reportedWorking.length,0);assert.match(view.activeExplanation,/No open assignment.*snapshot/);
 assert.equal(view.latestActivity.id,'save-energy');assert.equal(JSON.stringify(state),before);
});

test('generic recent task results include energy work without inventing cycle ordering or lead relationships',()=>{
 const exact={...lead('exact','discovered'),offer:'site_review',updatedAt:'2026-09-20T17:00:00Z'};
 const unrelated={...lead('other','discovered'),company:exact.company,website:exact.website,offer:'custom_search',updatedAt:exact.updatedAt};
 const source=task('energy-source','supply','review',{title:'Energy fit investigation',brief:'[ENERGY SCOUTING]\nLead ID: exact',result:'Site rights are unresolved.',resultVersion:1,updatedAt:'2026-09-20T18:00:00Z'});
 const qa=task('energy-quality','review','ready',{parentTaskId:source.id,title:'Review evidence',updatedAt:'2026-09-20T18:30:00Z'});
 const lookalike=task('unlinked','analysis','draft',{title:'Energy fit investigation',brief:'Same company '+exact.company+'; website '+exact.website,updatedAt:qa.updatedAt});
 const state={leads:[exact,unrelated],tasks:[source,qa,lookalike]},view=latest(state);
 assert.deepEqual(F.campaigns(state),[]);assert.equal(view.latestResult.id,source.id);
 assert.equal(view.latestResult.campaignLabel,'Existing Site Review');assert.equal(view.latestResult.timestampLabel,'Task record updated');
 assert.deepEqual(view.latestResult.linkedLeads.map(l=>l.id),['exact']);assert.equal(view.latestResult.review,null);
 assert.equal(view.activeTasks.find(e=>e.id===qa.id).campaignLabel,'Existing Site Review');
 assert.deepEqual(view.activeTasks.find(e=>e.id===qa.id).linkedLeads.map(l=>l.id),['exact']);
 assert.equal(view.activeTasks.find(e=>e.id===lookalike.id).campaignLabel,'Team assignment');
 assert.deepEqual(view.activeTasks.find(e=>e.id===lookalike.id).linkedLeads,[]);assert.equal(view.reportedWorking.length,0);
 assert.equal(view.outcomes.find(e=>e.id==='other').linkedTasks.length,0);
});

test('service context follows explicit parent/deal links or the declared energy marker, never title keywords',()=>{
 const marker=task('marker','supply','done',{brief:'[ENERGY SCOUTING]\nBounded research',result:'No confirmed opening.'});
 const qa=task('marker-review','review','ready',{parentTaskId:marker.id});
 const titled=task('title-only','supply','ready',{title:'ENERGY SCOUTING custom search Cycle 72'});
 const dealt=task('deal-linked','analysis','ready',{dealId:'known-deal'});
 const state={tasks:[marker,qa,titled,dealt],deals:[{id:'known-deal',offer:'managed_energy_hosting'}]},view=latest(state);
 assert.equal(view.latestResult.campaignLabel,'Energy site research');
 assert.equal(view.activeTasks.find(e=>e.id===qa.id).campaignLabel,'Energy site research');
 assert.equal(view.activeTasks.find(e=>e.id===titled.id).campaignLabel,'Team assignment');
 assert.equal(view.activeTasks.find(e=>e.id===dealt.id).campaignLabel,'Proton Managed Energy Hosting');
 assert.deepEqual(F.campaigns(state),[]);
});

test('a stale saved snapshot and a later activity message do not create live work or refresh an old result date',()=>{
 const saved=task('saved-result','supply','done',{brief:'[ENERGY SCOUTING]',result:'Last saved result',updatedAt:'2026-08-01T12:00:00Z'});
 const state={tasks:[saved],leads:[],activity:[{id:'native-note',at:'2026-09-20T19:00:00Z',message:'Native bot started energy research; task saved-result'}]};
 const before=JSON.stringify(state),view=latest(state);
 assert.equal(view.latestOutcome.updatedAt,'2026-08-01T12:00:00.000Z');assert.equal(view.latestActivity.updatedAt,'2026-09-20T19:00:00.000Z');
 assert.equal(view.activeTasks.length,0);assert.equal(view.reportedWorking.length,0);assert.equal(view.latestResult.review,null);
 assert.equal(JSON.stringify(state),before);
 state.tasks.push(task('old-working-report','supply','working',{updatedAt:'2026-08-02T12:00:00Z'}));
 const reported=latest(state).reportedWorking[0];assert.equal(reported.updatedAt,'2026-08-02T12:00:00.000Z');assert.equal(reported.label,'Work reported');
 assert.match(latest(state).activeExplanation,/saved task statuses, not live agent activity/);
});

test('missing, ambiguous, impossible and future dates remain unordered; evidence dates are not substituted for saves',()=>{
 const dates=[undefined,'09/20/2026 18:00','2026-02-31T12:00:00Z','2026-09-20T21:00:00Z'];
 const leads=dates.map((updatedAt,i)=>({...lead('bad-'+i,'discovered'),offer:'custom_search',updatedAt,checked:'2026-09-20',due:'2026-09-21',lastTouch:'2026-09-20'}));
 const state={leads,tasks:[task('undated-result','supply','done',{result:'Saved but undated',updatedAt:'',startedAt:'2026-09-20T19:00:00Z'})],activity:[{id:'future',at:'2026-09-21T00:00:00Z',message:'Updated'}]};
 const before=JSON.stringify(state),view=latest(state);
 assert.equal(view.latestLead,null);assert.equal(view.latestResult,null);assert.equal(view.latestOutcome,null);assert.equal(view.latestActivity,null);
 assert.equal(view.undatedOutcomes.length,5);assert.deepEqual(view.outcomes.filter(e=>e.kind==='lead').map(e=>e.timestampIssue),['missing','invalid','invalid','future']);
 assert(view.outcomes.every(e=>e.updatedAt===''));assert.equal(JSON.stringify(state),before);
 state.leads.push({...lead('valid','discovered'),updatedAt:'2026-09-20T14:00:00-04:00'});
 assert.equal(latest(state).latestOutcome.id,'valid');assert.equal(latest(state).latestOutcome.updatedAt,'2026-09-20T18:00:00.000Z');
});

test('current result review retains recorded reviewer identity and exact QA evidence links',()=>{
 const source=task('source','supply','done',{result:'Current evidence',resultVersion:2,updatedAt:'2026-09-20T19:00:00Z',reviewHistory:[
  {at:'2026-09-20T17:00:00Z',decision:'accept',result:'Old evidence',note:'Old review',review:{version:1,reviewer:'Old reviewer',actor:'coordinator',evidenceTaskId:'old-qa'}},
  {at:'2026-09-20T19:00:00Z',decision:'accept',result:'Current evidence',note:'Accepted with stated limits',review:{version:2,reviewer:'Recorded Revenue',actor:'coordinator',basis:'Exact QA result checked',evidenceTaskId:'exact-qa'}}
 ]});
 const qa=task('exact-qa','review','done',{parentTaskId:source.id,result:'Independent checks',resultVersion:1,reviewOfVersion:2,qualityVerdict:'pass',reviewHistory:[{decision:'accept',result:'Independent checks',review:{version:1,sourceVersion:2,qualityVerdict:'pass',reviewer:'Recorded Revenue',actor:'coordinator'}}]});
 const state={tasks:[source,qa]},view=latest(state),review=view.outcomes.find(e=>e.id===source.id).review;
 assert.equal(review.reviewer,'Recorded Revenue');assert.equal(review.evidenceTaskId,'exact-qa');assert.equal(review.evidenceHref,'#team/task/exact-qa');assert.equal(review.evidenceCurrent,true);
 assert.equal(review.version,2);assert.equal(review.decision,'accept');assert.equal(review.at,'2026-09-20T19:00:00.000Z');
 source.result='New unreviewed result';source.resultVersion=3;
 assert.equal(latest(state).outcomes.find(e=>e.id===source.id).review,null,'old identity is not acceptance of a new result version');
});

test('reference and superseded tasks never appear as current work or result outcomes',()=>{
 const state={tasks:[
  task('reference','revenue','working',{result:'Operating instructions',routing:{kind:'reference'}}),
  task('superseded','supply','review',{result:'Replaced result',routing:{kind:'superseded'}}),
  task('legacy-charter','revenue','draft',{title:'PM-LOOP-003 operating charter'}),
  task('cancelled','supply','cancelled',{result:'Retained cancelled result'})
 ]};
 const view=latest(state);assert.equal(view.activeTasks.length,0);assert.equal(view.outcomes.length,1);assert.equal(view.latestResult.id,'cancelled');assert.equal(view.latestResult.label,'Cancelled');
 assert.match(F.overview({tasks:[task('asic','intelligence','ready',{title:'PM-ASIC-001-01 Research candidates'})]}),/RECORDED ASIC BATCH/);
});
