'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../agent-control-model'),F=require('../crm/workflow'),C=require('../crm/control-center'),M=require('../crm/crm-model'),G=require('../crm/grok-team');
let seq=0;const apply=(s,type,payload)=>A.reduce(s,{type,payload,revision:s.revision,id:'event_'+(++seq),at:'2026-09-18T20:00:00Z'});
const add=(s,id,role='intelligence',extra={})=>apply(s,'task.add',{id,title:'Synthetic '+id,brief:'Synthetic research only',role,...extra});
const result=(s,id,extra={})=>apply(apply(s,'task.ready',{id}),'task.result',{id,result:'Synthetic checked result',sources:['https://example.test/source'],...extra});
const review=(evidenceTaskId='',actor='coordinator')=>({actor,reviewer:actor==='owner'?'Synthetic owner':'Synthetic Revenue coordinator',basis:'Synthetic independent artifact and version checked',evidenceTaskId,checks:{evidence:'pass',arithmetic:'na',fit:'pass'}});
const accept=(s,id,r=review())=>apply(s,'task.accept',{id,note:'Evidence and exact version checked.',review:r});
function withQA(verdict='pass'){
 let s=result(add(A.initial(),'source'),'source');s=add(s,'quality','review',{parentTaskId:'source'});s=result(s,'quality',{qualityVerdict:verdict,confirmCurrentSource:true});return s;
}
test('legacy reviews belong to Quality or the coordinator, never implicitly the owner',()=>{
 let s=withQA();const before=JSON.stringify(s);assert.equal(F.bucket(s.tasks[0]),'review');assert.equal(F.taskMeaning(s.tasks[0],s).owner,'Quality Review');assert.equal(F.taskMeaning(s.tasks[1],s).owner,'Revenue Lead');
 assert.equal(F.taskMeaning(s.tasks[1],s).label,'Coordinator review');assert.equal(JSON.stringify(s),before);
 delete s.tasks[0].resultVersion;assert.doesNotThrow(()=>A.valid(s));
});
test('reference and explicit supersession stay intact and leave all actionable counts',()=>{
 let s=add(A.initial(),'charter','revenue',{title:'PM-LOOP-004 operating charter — every four hours'});s=add(s,'old');s=apply(s,'task.route',{id:'old',kind:'superseded',reviewOwner:'team',reason:'Replaced by current campaign; no acceptance inferred.',recordedBy:'Synthetic coordinator'});
 assert.equal(s.tasks[0].status,'draft');assert.equal(s.tasks[1].status,'draft');assert.equal(A.metrics(s,'2026-09').open,0);
 assert.deepEqual(M.today({sites:[],leads:[],tasks:s.tasks,followups:[],date:'2026-09-18'}),[]);
 const summary=C.summary({sites:[],state:s,contacts:[],followups:[],date:'2026-09-18'});assert.equal(summary.tasks.length,0);assert.equal(summary.owners,0);assert.equal(F.matches(s.tasks[1],'reference'),true);
 assert.throws(()=>apply(s,'task.ready',{id:'old'}),/routing/);
});
test('owner decisions require explicit routing with a reason and retain routing history',()=>{
 let s=result(add(A.initial(),'source'),'source');assert.throws(()=>apply(s,'task.route',{id:'source',kind:'work',reviewOwner:'owner',reason:'',recordedBy:'Revenue'}),/reason/);
 s=apply(s,'task.route',{id:'source',kind:'work',reviewOwner:'owner',reason:'Approve an actual new purchase; no spending authorized by this record.',recordedBy:'Synthetic coordinator'});
 assert.equal(F.bucket(s.tasks[0]),'owner');assert.equal(F.taskMeaning(s.tasks[0],s).owner,'Renzo');assert.throws(()=>accept(s,'source'),/owner decision/);
 assert.throws(()=>apply(s,'task.accept',{id:'source',note:'No owner attribution'}),/attributed owner decision/);
 s=apply(s,'task.route',{id:'source',kind:'work',reviewOwner:'team',reason:'Owner decision recorded separately; resume research only.',recordedBy:'Synthetic coordinator'});assert.equal(s.tasks[0].routingHistory.length,1);assert.equal(s.tasks[0].status,'review');
});
test('actual linked QA supports coordinator acceptance without recursive QA or automatic advancement',()=>{
 let s=withQA();assert.throws(()=>accept(s,'source',review('quality')),/accepted, attributed/);
 s=accept(s,'quality');assert.equal(s.tasks[0].status,'review');assert.equal(s.tasks[1].status,'done');
 s=accept(s,'source',review('quality'));assert.equal(s.tasks[0].status,'done');assert.equal(s.tasks.length,2);assert.equal(s.tasks[0].reviewHistory[0].review.evidenceTaskId,'quality');assert.equal(s.tasks[0].reviewHistory[0].review.version,1);assert.equal(s.leads.length,0);assert.equal(s.entries.length,0);
});
test('missing, adverse, unrelated and stale QA cannot pass a specialist result',()=>{
 let superseded=accept(withQA(),'quality');superseded=apply(superseded,'task.route',{id:'quality',kind:'superseded',reviewOwner:'team',reason:'Replaced by a newer actual review',recordedBy:'Synthetic coordinator'});assert.deepEqual(A.reviewEvidence(superseded,superseded.tasks[0]),[]);
 let adverse=accept(withQA('revise'),'quality');assert.throws(()=>accept(adverse,'source',review('quality')),/corrections/);
 adverse=apply(adverse,'task.revise',{id:'source',note:'Fix the supported defect.',review:review('quality')});assert.equal(F.bucket(adverse.tasks[0]),'correction');assert.equal(adverse.tasks[0].reviewHistory[0].result,'Synthetic checked result');
 let s=accept(withQA(),'quality');s=apply(s,'task.revise',{id:'source',note:'An additional source needs correction.',review:review('quality')});s=result(s,'source',{result:'Changed result, new version'});
 assert.equal(s.tasks[0].resultVersion,2);assert.throws(()=>accept(s,'source',review('quality')),/exact result version/);
 s=result(add(s,'unrelated'),'unrelated');assert.throws(()=>accept(s,'unrelated',review('quality')),/exact result version/);
});
test('legacy Quality can be attributed to an exact current source without rewriting its result',()=>{
 let s=withQA();delete s.tasks[1].qualityVerdict;delete s.tasks[1].reviewOfVersion;delete s.tasks[1].parentTaskId;const original=s.tasks[1].result;
 assert.throws(()=>accept(s,'quality'),/actual Quality verdict/);
 s=apply(s,'task.quality-verdict',{id:'quality',sourceTaskId:'source',verdict:'pass',evidence:'Original Quality artifact, independently checked against source v1',recordedBy:'Synthetic coordinator',confirmCurrentSource:true});
 assert.equal(s.tasks[1].result,original);assert.equal(s.tasks[1].reviewOfVersion,1);assert.equal(s.tasks[1].qualityHistory.length,1);s=accept(s,'quality');assert.doesNotThrow(()=>accept(s,'source',review('quality')));
});
test('legacy acceptances retain unknown attribution and do not qualify as new structured QA evidence',()=>{
 let s=withQA();s=apply(s,'task.accept',{id:'quality',note:'Legacy manual acceptance'});assert.equal(s.tasks[1].status,'done');assert.equal(s.tasks[1].reviewHistory[0].review,undefined);assert.deepEqual(A.reviewEvidence(s,s.tasks[0]),[]);assert.throws(()=>accept(s,'source',review('quality')),/attributed/);
});
test('a completed legacy Quality result can receive explicit attribution and coordinator review without replaying work',()=>{
 let s=withQA();delete s.tasks[1].qualityVerdict;delete s.tasks[1].reviewOfVersion;s=apply(s,'task.accept',{id:'quality',note:'Original legacy review'});const original=s.tasks[1].result,prior=JSON.stringify(s.tasks[1].reviewHistory[0]);
 s=apply(s,'task.quality-verdict',{id:'quality',sourceTaskId:'source',verdict:'pass',evidence:'Original independent artifact reopened for exact source v1',recordedBy:'Synthetic coordinator',confirmCurrentSource:true});assert.equal(s.tasks[1].status,'done');assert.deepEqual(A.reviewEvidence(s,s.tasks[0]),[]);
 s=accept(s,'quality');assert.equal(s.tasks[1].status,'done');assert.equal(s.tasks[1].result,original);assert.equal(JSON.stringify(s.tasks[1].reviewHistory[0]),prior);assert.equal(s.tasks[1].reviewHistory.length,2);assert.equal(A.reviewEvidence(s,s.tasks[0]).length,1);
 s=apply(s,'task.quality-verdict',{id:'quality',sourceTaskId:'source',verdict:'revise',evidence:'A correction is now evidenced',recordedBy:'Synthetic coordinator',confirmCurrentSource:true});assert.deepEqual(A.reviewEvidence(s,s.tasks[0]),[]);
});
test('email readiness needs evidence, retains history and never records a prospect send',()=>{
 let s=A.initial();const payload={testType:'internal_self',sender:'verified',senderEvidence:'Synthetic Sent test thread',reply:'verified',replyEvidence:'Synthetic internal receive/reply thread',footer:'unknown',footerEvidence:'',authority:'authorized',scope:'Existing authorized introductions within recorded pilot limits',authorityEvidence:'Owner direction reference',recordedBy:'Synthetic coordinator',checkedOn:'2026-09-18'};
 assert.throws(()=>apply(s,'outreach.readiness',{...payload,senderEvidence:''}),/evidence/);
 s=apply(s,'outreach.readiness',payload);assert.equal(F.emailReadiness(s).ready,false);assert.deepEqual(F.emailReadiness(s).missing,['footer']);
 s=apply(s,'outreach.readiness',{...payload,footer:'verified',footerEvidence:'Synthetic owner-confirmed company address reference'});assert.equal(F.emailReadiness(s).ready,true);assert.equal(s.outreachReadinessHistory.length,1);assert.equal(s.outreachReadiness.testType,'internal_self');assert.equal(s.tasks.length,0);assert.equal(s.leads.length,0);assert.equal(s.entries.length,0);
 s=apply(s,'outreach.readiness',{...payload,authority:'held',authorityEvidence:'Synthetic scoped hold'});assert.equal(F.emailReadiness(s).ready,false);assert.equal(s.outreachReadinessHistory.length,2);
});
test('changed source cannot use the prior Quality version and projection never mutates records',()=>{
 let s=withQA();s=accept(s,'quality');const original=JSON.stringify(s);F.overview(s);F.taskMeaning(s.tasks[0],s);assert.equal(JSON.stringify(s),original);assert.equal(s.tasks[0].status,'review');
 const packet=G.packet(s,s.tasks[0],'https://example.test/crm/');assert.match(packet,/existing owner-approved native schedule/);assert.doesNotMatch(packet,/four-hour native schedule/);assert.match(packet,/specific.*owner decision|Owner decisions|owner decision/);assert.match(packet,/never bulk accept/i);
});

const todayTasks=s=>M.today({sites:[],leads:[],tasks:s.tasks,followups:[],date:'2026-09-18'});
function assertReviewer(s,id,expectedRole){
 const task=s.tasks.find(t=>t.id===id),before=JSON.stringify(s),owner=A.ROLES.find(r=>r.id===expectedRole).name;
 assert.equal(task.status,'review');assert.equal(A.reviewRole(s,task),expectedRole);
 assert.equal(F.taskMeaning(task,s).owner,owner);
 assert.equal(todayTasks(s).find(t=>t.id===id).context,'Team review · '+owner);
 assert.equal(JSON.stringify(s),before,'Read-only projections must preserve the pending result');
}

test('Today and workflow route exact accepted Quality evidence to Revenue without accepting the source',()=>{
 let s=withQA();assertReviewer(s,'source','review');assertReviewer(s,'quality','revenue');
 s=accept(s,'quality');assertReviewer(s,'source','revenue');
 assert.equal(A.metrics(s,'2026-09').review,1);assert.equal(todayTasks(s).some(t=>t.id==='quality'),false);
 s=accept(s,'source',review('quality'));assert.equal(A.metrics(s,'2026-09').review,0);assert.deepEqual(todayTasks(s),[]);
});

test('Today and workflow keep missing, unattributed, unrelated and stale evidence with Quality',()=>{
 const missing=result(add(A.initial(),'source'),'source');assertReviewer(missing,'source','review');
 const legacy=apply(withQA(),'task.accept',{id:'quality',note:'Synthetic legacy decision without attribution'});assertReviewer(legacy,'source','review');
 let unrelated=accept(withQA(),'quality');unrelated=result(add(unrelated,'other_source'),'other_source');assertReviewer(unrelated,'other_source','review');
 let stale=accept(withQA(),'quality');stale=apply(stale,'task.revise',{id:'source',note:'Synthetic new source correction',review:review('quality')});stale=result(stale,'source',{result:'Synthetic replacement result version two'});
 assert.equal(stale.tasks[0].resultVersion,2);assertReviewer(stale,'source','review');
 assert.throws(()=>accept(stale,'source',review('quality')),/exact result version/);
});

test('historical accepted Quality evidence cannot become the next-reviewer authority',()=>{
 for(const kind of ['reference','superseded']){
  let s=accept(withQA(),'quality');s=apply(s,'task.route',{id:'quality',kind,reviewOwner:'team',reason:'Synthetic historical review; not current evidence',recordedBy:'Synthetic coordinator'});
  assertReviewer(s,'source','review');assert.deepEqual(A.reviewEvidence(s,s.tasks[0]),[]);
  assert.throws(()=>accept(s,'source',review('quality')),/accepted, attributed/);
 }
});

test('accepted adverse Quality verdicts route to Revenue for a saved correction disposition',()=>{
 for(const verdict of ['revise','blocked']){
  let s=accept(withQA(verdict),'quality');assertReviewer(s,'source','revenue');
  assert.throws(()=>accept(s,'source',review('quality')),/corrections|blocker/);
  s=apply(s,'task.revise',{id:'source',note:'Synthetic supported correction required',review:review('quality')});
  assert.equal(F.taskMeaning(s.tasks[0],s).label,'Corrections requested');assert.equal(todayTasks(s)[0].context,'Corrections requested');
  assert.equal(A.metrics(s,'2026-09').review,0);assert.equal(s.tasks[0].status,'blocked');
  assert.equal(s.tasks[0].reviewHistory[0].review.evidenceTaskId,'quality');
 }
});

test('actual owner routing overrides ordinary reviewer projection in Today and workflow',()=>{
 let s=accept(withQA(),'quality');const reason='Synthetic actual purchase decision requires owner authority';
 s=apply(s,'task.route',{id:'source',kind:'work',reviewOwner:'owner',reason,recordedBy:'Synthetic coordinator'});
 const before=JSON.stringify(s),source=s.tasks[0];assert.equal(A.reviewRole(s,source),'revenue');
 assert.equal(F.taskMeaning(source,s).owner,'Renzo');assert.equal(F.taskMeaning(source,s).label,'Owner decision');
 assert.equal(todayTasks(s).find(t=>t.id==='source').context,'Owner decision · '+reason);assert.equal(JSON.stringify(s),before);
 assert.throws(()=>accept(s,'source',review('quality')),/owner decision/);
});

function withPendingQA(status){
 let s=result(add(A.initial(),'source'),'source');s=add(s,'quality','review',{parentTaskId:'source'});
 if(status==='ready'||status==='working')s=apply(s,'task.ready',{id:'quality'});
 if(status==='working')s=apply(s,'task.start',{id:'quality'});
 if(status==='review')s=result(s,'quality',{qualityVerdict:'pass',confirmCurrentSource:true});
 if(status==='blocked')s=apply(s,'task.block',{id:'quality',reason:'Synthetic missing independent evidence',blockerKind:'execution'});
 assert.equal(s.tasks[1].status,status);return s;
}

test('routed historical Quality assignments permit replacement while preserving their status and history',()=>{
 for(const kind of ['reference','superseded'])for(const status of ['draft','ready','working','review','blocked']){
  let s=withPendingQA(status);
  s=apply(s,'task.route',{id:'quality',kind:'work',reviewOwner:'team',reason:'Synthetic original review responsibility',recordedBy:'Synthetic coordinator'});
  s=apply(s,'task.route',{id:'quality',kind,reviewOwner:'team',reason:'Synthetic historical assignment; replacement needed',recordedBy:'Synthetic coordinator'});
  const original=JSON.stringify(s.tasks[1]);assert.equal(A.actionable(s.tasks[1]),false);
  s=add(s,'replacement','review',{parentTaskId:'source'});
  assert.equal(JSON.stringify(s.tasks[1]),original);assert.equal(s.tasks[1].routingHistory.length,1);assert.equal(s.tasks[1].status,status);
  assert.equal(s.tasks[2].parentTaskId,'source');assert.equal(s.tasks[2].reviewOfVersion,1);assert.equal(s.tasks[2].status,'draft');
  assert.equal(s.tasks[0].status,'review');assert.equal(s.tasks.filter(t=>t.role==='review'&&A.actionable(t)).length,1);
  assert.throws(()=>add(s,'duplicate','review',{parentTaskId:'source'}),/open Quality Review/);
 }
});

test('genuine pending Quality assignments still prevent duplicate review across every active status',()=>{
 for(const status of ['draft','ready','working','review','blocked']){
  const s=withPendingQA(status),before=JSON.stringify(s);assert.equal(A.actionable(s.tasks[1]),true);
  assert.throws(()=>add(s,'duplicate','review',{parentTaskId:'source'}),/open Quality Review/);assert.equal(JSON.stringify(s),before);
  const anotherSource=result(add(s,'another_source'),'another_source');
  assert.doesNotThrow(()=>add(anotherSource,'other_quality','review',{parentTaskId:'another_source'}));
 }
});
