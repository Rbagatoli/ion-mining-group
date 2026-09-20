'use strict';
// Synthetic records only. These tests never use provider accounts or live CRM stores.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const A=require('../agent-control-model');
const AT='2026-09-20T08:00:00Z',REVIEWED_AT='2026-09-20T07:45:00Z';let seq=0;
const clone=value=>JSON.parse(JSON.stringify(value));
const action=(s,type,payload)=>({type,payload,revision:s.revision,id:'synthetic_event_'+(++seq),at:AT});
const apply=(s,type,payload)=>A.reduce(s,action(s,type,payload));
const record=(s,id,role='analysis',extra={})=>apply(s,'task.add',{id,title:'Synthetic '+id,brief:'Synthetic completed-review fixture; no real client work.',role,...extra});
const result=(s,id,extra={})=>apply(apply(s,'task.ready',{id}),'task.result',{id,result:'Synthetic independent source data and calculations.',sources:['https://example.test/evidence'],...extra});
const review=(qaId='')=>({actor:'coordinator',reviewer:'Synthetic Revenue coordinator',basis:'Original review evidence and exact result versions independently reconciled.',evidenceTaskId:qaId,checks:{evidence:'pass',arithmetic:'na',fit:'pass'}});
const acceptQa=s=>apply(s,'task.accept',{id:'qa',note:'The genuine Quality finding is accepted as reported.',review:review()});
function fixture(status='ready',verdict='pass'){
 let s=result(record(A.initial(),'source'),'source');s=record(s,'qa','review',{parentTaskId:'source'});
 if(['ready','working'].includes(status))s=apply(s,'task.ready',{id:'qa'});
 if(status==='working')s=apply(s,'task.start',{id:'qa'});
 if(status==='blocked')s=apply(s,'task.block',{id:'qa',reason:'Awaiting genuine independent evidence.',blockerKind:'execution'});
 if(status==='cancelled')s=apply(s,'task.cancel',{id:'qa'});
 if(['review','done'].includes(status))s=result(s,'qa',{result:'Synthetic actual QA finding: '+verdict,sources:['https://example.test/qa-original'],qualityVerdict:verdict,confirmCurrentSource:true});
 if(status==='done')s=acceptQa(s);
 s=record(s,'unrelated','supply');return s;
}
function payload(s,{verdict='pass',decision='accept',...extra}={}){
 const source=s.tasks.find(t=>t.id==='source'),qa=s.tasks.find(t=>t.id==='qa');
 const p={sourceId:'source',qaId:'qa',expectedSourceVersion:A.resultVersion(source),expectedQaVersion:A.resultVersion(qa),closeoutId:'synthetic_closeout_'+(++seq),confirmCurrentSource:true,
  attribution:{reviewer:'Synthetic independent Quality reviewer',reviewedAt:REVIEWED_AT,evidence:'native-artifact:synthetic-reviewed-output / original completed review',recordedBy:'Synthetic Revenue recorder',verdict,independent:true},
  sourceDecision:{decision,note:decision==='accept'?'Exact source accepted on genuine independent evidence.':'Correct the evidenced inconsistency before resubmission.',review:review('qa')}};
 if(['ready','working','blocked'].includes(qa.status))p.qaResult={result:'Synthetic original independently completed QA finding: '+verdict,sources:['https://example.test/qa-original'],verdict};
 if(!A.reviewEvidence(s,source).some(q=>q.id===qa.id))p.qaReview={note:'Accept this actual Quality finding; it does not grant authority to contact or spend.',review:review()};
 return Object.assign(p,extra);
}
function close(s,p=payload(s)){return apply(s,'task.completed-review',p);}
function unchangedRejection(s,p,pattern){const before=JSON.stringify(s);assert.throws(()=>close(s,p),pattern);assert.equal(JSON.stringify(s),before,'Rejected closeout must not alter either task, history or other register');}

test('genuine completed PASS atomically closes ready, working and blocked QA with one revision and no invented work events',()=>{
 for(const status of ['ready','working','blocked']){
  const s=fixture(status),before=JSON.stringify(s),p=payload(s),source=s.tasks[0],qa=s.tasks[1],next=close(s,p),nq=next.tasks[1],ns=next.tasks[0];
  assert.equal(JSON.stringify(s),before);assert.equal(next.revision,s.revision+1);assert.equal(next.activity.length,s.activity.length+1);
  assert.equal(ns.status,'done');assert.equal(nq.status,'done');assert.equal(ns.result,source.result);assert.deepEqual(ns.sources,source.sources);assert.equal(ns.resultVersion,source.resultVersion);
  assert.equal(nq.resultVersion,1);assert.equal(nq.reviewOfVersion,source.resultVersion);assert.equal(nq.handoffAt,qa.handoffAt);assert.equal(nq.startedAt,qa.startedAt);
  assert.equal(nq.result,p.qaResult.result);assert.deepEqual(nq.sources,p.qaResult.sources);assert.deepEqual(next.tasks[2],s.tasks[2]);
  assert.equal(nq.qualityHistory[0].reviewer,p.attribution.reviewer);assert.equal(nq.qualityHistory[0].reviewedAt,REVIEWED_AT);assert.equal(nq.qualityHistory[0].at,AT);assert.equal(nq.qualityHistory[0].recordedBy,p.attribution.recordedBy);
  for(const h of [nq.qualityHistory[0],nq.reviewHistory[0],ns.reviewHistory[0]])assert.equal(h.closeoutId,p.closeoutId);
  assert.equal(nq.reviewHistory[0].review.qualityVerdict,'pass');assert.equal(nq.reviewHistory[0].review.sourceVersion,source.resultVersion);assert.equal(ns.reviewHistory[0].review.evidenceTaskId,'qa');
  assert.equal(A.reviewEvidence(next,ns)[0].id,'qa');assert.equal(next.tasks.length,s.tasks.length);
 }
});
test('already eligible accepted QA is reused byte-for-byte with only a source decision',()=>{
 const s=fixture('done'),qaBefore=JSON.stringify(s.tasks[1]),p=payload(s),next=close(s,p);
 assert.equal(p.qaReview,undefined);assert.equal(JSON.stringify(next.tasks[1]),qaBefore);assert.equal(next.tasks[0].status,'done');assert.equal(next.tasks[0].reviewHistory.length,1);
 assert.deepEqual(next.tasks[0].reviewHistory[0].completedReview.request.attribution,p.attribution);
 const redundant=payload(s);redundant.qaReview={note:'Redundant acceptance',review:review()};unchangedRejection(s,redundant,/without another acceptance/);
});
test('submitted QA keeps its original result and source links while adding actual attribution and decisions',()=>{
 const s=fixture('review'),p=payload(s),qa=s.tasks[1],next=close(s,p),nq=next.tasks[1];
 assert.equal(p.qaResult,undefined);assert.equal(nq.result,qa.result);assert.deepEqual(nq.sources,qa.sources);assert.equal(nq.resultVersion,qa.resultVersion);assert.equal(nq.qualityHistory.length,1);assert.equal(nq.reviewHistory.length,1);
 const overwritten=payload(s);overwritten.qaResult={result:'Invented replacement',sources:[],verdict:'pass'};unchangedRejection(s,overwritten,/immutable/);
});
test('done legacy QA preserves its old acceptance, result and history while adding genuine attribution and coordinator acceptance',()=>{
 let s=fixture('review');delete s.tasks[1].qualityVerdict;delete s.tasks[1].reviewOfVersion;
 s=apply(s,'task.accept',{id:'qa',note:'Synthetic original legacy acceptance without structured attribution'});
 const qaBefore=clone(s.tasks[1]),p=payload(s),next=close(s,p),q=next.tasks[1];
 assert.equal(q.result,qaBefore.result);assert.deepEqual(q.sources,qaBefore.sources);assert.equal(q.resultVersion,qaBefore.resultVersion);assert.deepEqual(q.reviewHistory[0],qaBefore.reviewHistory[0]);assert.equal(q.reviewHistory.length,2);
 assert.equal(q.qualityHistory.length,1);assert.equal(q.reviewOfVersion,s.tasks[0].resultVersion);assert.equal(q.qualityVerdict,'pass');assert.equal(next.tasks[0].status,'done');assert.equal(q.startedAt,qaBefore.startedAt);assert.equal(q.handoffAt,qaBefore.handoffAt);
});
test('legacy missing top-level version cannot relabel historical QA for an older source as a current PASS',()=>{
 for(const historyKind of ['review','attribution']){
  const s=fixture('done','blocked');s.tasks[0].resultVersion=2;delete s.tasks[1].qualityVerdict;delete s.tasks[1].reviewOfVersion;
  if(historyKind==='attribution'){delete s.tasks[1].reviewHistory;s.tasks[1].qualityHistory=[{verdict:'blocked',evidence:'Synthetic original source v1 defect',recordedBy:'Synthetic original recorder',at:REVIEWED_AT,sourceTaskId:'source',sourceVersion:1}];}
  A.valid(s);assert.equal(A.completedReviewEligibility(s,s.tasks[0],s.tasks[1]).eligible,false);unchangedRejection(s,payload(s),/historical Quality evidence.*stale/);
 }
});
test('REVISE and BLOCKED accept the QA finding but preserve the source as a correction with evidence and history',()=>{
 for(const verdict of ['revise','blocked'])for(const status of ['ready','review','done']){
  const s=fixture(status,verdict),p=payload(s,{verdict,decision:'revise'}),next=close(s,p),source=next.tasks[0],qa=next.tasks[1];
  assert.equal(qa.status,'done');assert.equal(qa.qualityVerdict,verdict);assert.equal(source.status,'blocked');assert.equal(source.blockerKind,'correction');assert.equal(source.blocker,p.sourceDecision.note);
  assert.equal(source.result,s.tasks[0].result);assert.deepEqual(source.sources,s.tasks[0].sources);assert.equal(source.reviewHistory[0].result,s.tasks[0].result);assert.equal(source.reviewHistory[0].decision,'revise');
  unchangedRejection(s,payload(s,{verdict,decision:'accept'}),/adverse|corrections|blocker/);
 }
});
test('PASS can receive an explicit justified coordinator revision without changing the independent finding',()=>{
 const s=fixture('review'),next=close(s,payload(s,{decision:'revise'}));assert.equal(next.tasks[1].qualityVerdict,'pass');assert.equal(next.tasks[1].status,'done');assert.equal(next.tasks[0].status,'blocked');assert.equal(next.tasks[0].blockerKind,'correction');
});
test('changed source, QA and board revisions reject without partial changes or retargeting',()=>{
 const s=fixture('review');for(const field of ['expectedSourceVersion','expectedQaVersion']){const p=payload(s);p[field]++;unchangedRejection(s,p,/version changed/);}
 const p=payload(s),a=action(s,'task.completed-review',p),before=JSON.stringify(s);a.revision--;assert.throws(()=>A.reduce(s,a),/another window/);assert.equal(JSON.stringify(s),before);assert.equal(p.expectedSourceVersion,1);
 const stale=clone(s);stale.tasks[1].reviewOfVersion=0;unchangedRejection(stale,payload(stale),/stale source version/);
 for(const field of ['expectedSourceVersion','expectedQaVersion']){const missing=payload(s);delete missing[field];unchangedRejection(s,missing,/both exact/);}
});
test('wrong links, Quality sources, missing records and mismatched linked leads cannot be combined',()=>{
 const s=fixture('review');for(const patch of [{sourceId:'qa'},{qaId:'unrelated'},{sourceId:'missing'},{qaId:'missing'}]){const p=Object.assign(payload(s),patch);p.sourceDecision.review.evidenceTaskId=p.qaId;unchangedRejection(s,p,/specialist|linked|no longer exists/);}
 const unlinked=clone(s);delete unlinked.tasks[1].parentTaskId;delete unlinked.tasks[1].reviewOfVersion;unchangedRejection(unlinked,payload(unlinked),/linked/);
 const unrelated=clone(s);unrelated.tasks[1].parentTaskId='unrelated';unchangedRejection(unrelated,payload(unrelated),/linked/);
 let mismatched=clone(s);for(const suffix of ['one','two'])mismatched=apply(mismatched,'lead.save',{id:'lead_'+suffix,company:'Synthetic '+suffix,website:'https://'+suffix+'.example.test/',offer:'research',channel:'direct',stage:'discovered',signal:'',source:'',checked:'',contact:'',buyer:'',nextAction:'',due:'',notes:'',lastTouch:'',lastNote:''});mismatched.tasks[0].leadId='lead_one';mismatched.tasks[1].leadId='lead_two';unchangedRejection(mismatched,payload(mismatched),/linked/);
});
test('owner, historical, draft, cancelled and blocked-with-result records use existing controls',()=>{
 for(const target of ['source','qa'])for(const routing of [{kind:'work',reviewOwner:'owner'},{kind:'reference',reviewOwner:'team'},{kind:'superseded',reviewOwner:'team'}]){
  let s=fixture('review');s=apply(s,'task.route',{id:target,...routing,reason:'Synthetic explicit routing boundary.',recordedBy:'Synthetic coordinator'});unchangedRejection(s,payload(s),/specialist|owner|historical/);
 }
 for(const status of ['draft','cancelled']){const s=fixture(status);unchangedRejection(s,payload(s),/not eligible/);}
 let s=fixture('review');s=apply(s,'task.revise',{id:'qa',note:'Correct the existing Quality result.'});const p=payload(s);unchangedRejection(s,p,/existing Quality result/);
 s=fixture('review');s=apply(s,'task.accept',{id:'source',note:'Legacy already closed source'});unchangedRejection(s,payload(s),/currently awaiting/);
});
test('genuine attribution, completion time, independent confirmation and separate coordinator identity are required',()=>{
 const s=fixture('review');for(const field of ['reviewer','reviewedAt','evidence','recordedBy','verdict']){const p=payload(s);delete p.attribution[field];unchangedRejection(s,p,/Check|verdict/);}
 for(const time of ['tomorrow','2026-09-20T08:00:01Z']){const p=payload(s);p.attribution.reviewedAt=time;unchangedRejection(s,p,/completed time/);}
 const dependent=payload(s);dependent.attribution.independent=false;unchangedRejection(s,dependent,/independently/);
 const unchecked=payload(s);unchecked.confirmCurrentSource=false;unchangedRejection(s,unchecked,/exact current/);
 const self=payload(s);self.attribution.reviewer=self.sourceDecision.review.reviewer;unchangedRejection(s,self,/separately/);
 for(const key of ['qaReview','sourceDecision'])for(const name of ['  Synthetic independent Quality reviewer  ','SYNTHETIC  INDEPENDENT   QUALITY REVIEWER']){const spaces=payload(s);spaces[key].review.reviewer=name;unchangedRejection(s,spaces,/separately/);}
 const missing=payload(s);delete missing.attribution;unchangedRejection(s,missing,/independently/);
});
test('both coordinator decisions retain existing checks and no owner bypass is possible',()=>{
 const s=fixture('review');
 for(const target of ['qaReview','sourceDecision'])for(const field of ['reviewer','basis']){const p=payload(s);delete p[target].review[field];unchangedRejection(s,p,/Check/);}
 for(const target of ['qaReview','sourceDecision']){const p=payload(s);p[target].review.actor='owner';unchangedRejection(s,p,/cannot record owner/);}
 for(const target of ['qaReview','sourceDecision'])for(const check of ['unchecked','revise','blocked']){const p=payload(s);p[target].review.checks.evidence=check;unchangedRejection(s,p,/Resolve failed/);}
 const noChecks=payload(s);delete noChecks.qaReview.review.checks;unchangedRejection(s,noChecks,/all review checks/);
 const wrong=payload(s);wrong.sourceDecision.review.evidenceTaskId='unrelated';unchangedRejection(s,wrong,/explicitly selected/);
 const noQa=payload(s);delete noQa.qaReview;unchangedRejection(s,noQa,/coordinator acceptance/);
});
test('native evidence remains text while every supplied QA URL retains the HTTP(S) validator',()=>{
 const s=fixture(),p=payload(s);assert.doesNotThrow(()=>close(s,p));
 for(const link of ['native-artifact:original','javascript:alert(1)','file:///private','https://user:pass@example.test/']){const bad=payload(s);bad.qaResult.sources=[link];unchangedRejection(s,bad,/URL/);}
});
test('the shortcut cannot replace any existing adverse verdict with PASS or a conflicting verdict',()=>{
 for(const status of ['review','done'])for(const verdict of ['revise','blocked']){const s=fixture(status,verdict);unchangedRejection(s,payload(s,{verdict:'pass'}),/verdict conflicts/);}
 const s=fixture('done','revise');delete s.tasks[1].qualityVerdict;unchangedRejection(s,payload(s,{verdict:'pass'}),/historical Quality verdict/);
 const contradictory=fixture(),p=payload(contradictory);p.qaResult.verdict='blocked';unchangedRejection(contradictory,p,/verdict conflict/);
});
test('a selected PASS does not hide a separate unresolved adverse review of this exact source',()=>{
 let s=fixture('done');s=record(s,'other_qa','review',{parentTaskId:'source'});s=result(s,'other_qa',{qualityVerdict:'blocked',confirmCurrentSource:true});
 unchangedRejection(s,payload(s),/Unresolved adverse/);
 const corrected=close(s,payload(s,{decision:'revise'}));assert.equal(corrected.tasks[0].status,'blocked');assert.deepEqual(corrected.tasks.find(t=>t.id==='other_qa'),s.tasks.find(t=>t.id==='other_qa'));
 const legacy=clone(s),other=legacy.tasks.find(t=>t.id==='other_qa');delete other.qualityVerdict;other.qualityHistory=[{verdict:'blocked',evidence:'Synthetic prior adverse finding for this exact result',recordedBy:'Synthetic Revenue',at:AT,sourceVersion:1,resultVersion:1}];unchangedRejection(legacy,payload(legacy),/Unresolved adverse/);
});
test('legacy exact-version adverse evidence on a separate QA cannot be hidden by missing top-level version',()=>{
 for(const kind of ['attribution','review'])for(const version of [0,1]){
  let s=fixture('done');s=record(s,'other_qa','review',{parentTaskId:'source'});s=result(s,'other_qa',{qualityVerdict:'blocked',confirmCurrentSource:true});
  const other=s.tasks.find(t=>t.id==='other_qa');delete other.qualityVerdict;delete other.reviewOfVersion;
  if(kind==='attribution')other.qualityHistory=[{verdict:'blocked',evidence:'Synthetic legacy adverse finding',recordedBy:'Synthetic Revenue',at:REVIEWED_AT,sourceTaskId:'source',sourceVersion:version,resultVersion:1}];
  else other.reviewHistory=[{at:AT,decision:'accept',note:'Synthetic accepted adverse finding',result:other.result,sources:other.sources,review:{...review(),version:1,sourceVersion:version,qualityVerdict:'blocked'}}];
  A.valid(s);
  if(version===1){unchangedRejection(s,payload(s),/Unresolved adverse/);const correction=close(s,payload(s,{decision:'revise'}));assert.equal(correction.tasks[0].status,'blocked');assert.deepEqual(correction.tasks.find(t=>t.id==='other_qa'),other);}
  else assert.equal(close(s).tasks[0].status,'done','Old source-version evidence must not block the current reviewed result');
 }
});
test('late source disposition, history limit and document-size failures roll back staged QA changes',()=>{
 const s=fixture(),long=payload(s,{decision:'revise'});long.sourceDecision.note='r'.repeat(2001);unchangedRejection(s,long,/Check blocker/);
 const history=fixture(),h={at:AT,decision:'revise',note:'Synthetic older correction.',result:'Synthetic earlier result.',sources:[]};history.tasks[0].reviewHistory=Array.from({length:20},()=>clone(h));A.valid(history);unchangedRejection(history,payload(history),/Export review history/);
 const qaHistory=fixture();qaHistory.tasks[1].qualityHistory=Array.from({length:20},()=>({evidence:'Synthetic earlier artifact',recordedBy:'Synthetic recorder',verdict:'pass',at:AT}));A.valid(qaHistory);unchangedRejection(qaHistory,payload(qaHistory),/attribution history/);
 const full=fixture();const template=clone(full.tasks[2]);for(let i=0;i<72;i++)full.tasks.push({...clone(template),id:'synthetic_filler_'+i,brief:'x'.repeat(9000)});
 A.valid(full);const big=payload(full);big.qaResult.result='q'.repeat(18000);unchangedRejection(full,big,/register is full/);
});
test('unsupported source dispositions and missing real QA results reject without adding records',()=>{
 const s=fixture();for(const decision of ['blocked','ready','done','cancel'])unchangedRejection(s,payload(s,{decision}),/supported source/);
 const missing=payload(s);delete missing.qaResult;unchangedRejection(s,missing,/actual completed Quality/);
 const blank=payload(s);blank.qaResult.result=' ';unchangedRejection(s,blank,/actual completed Quality/);
});
test('closeout IDs reconcile exact IDs, versions and provenance after reload and prevent duplicate or conflicting closeouts',()=>{
 const s=fixture(),p=payload(s),a=action(s,'task.completed-review',p),next=A.reduce(s,a),reload=A.valid(clone(next)),before=JSON.stringify(reload),receipt=A.completedReviewReceipt(reload,p.closeoutId);
 assert.equal(receipt.sourceId,'source');assert.equal(receipt.qaId,'qa');assert.equal(receipt.sourceVersion,1);assert.equal(receipt.qaVersion,0);assert.equal(receipt.qaResultVersion,1);assert.equal(receipt.at,AT);assert.equal(receipt.request.attribution.reviewedAt,REVIEWED_AT);
 assert.throws(()=>A.reduce(reload,a),/another window/);assert.equal(JSON.stringify(close(reload,p)),before,'Exact retry at current revision is a no-op, including revision/activity');
 const different=clone(p);different.sourceDecision.note+=' Altered decision';unchangedRejection(reload,different,/different completed review/);
 const otherIds=clone(p);otherIds.qaId='unrelated';otherIds.sourceDecision.review.evidenceTaskId='unrelated';unchangedRejection(reload,otherIds,/different completed review/);
 receipt.request.attribution.reviewer='Changed returned copy';assert.equal(JSON.stringify(reload),before,'Receipt projection cannot change the saved record');
});
test('read-only eligibility and receipt projections leave source and QA records unchanged',()=>{
 const s=fixture(),before=JSON.stringify(s);assert.deepEqual(A.completedReviewEligibility(s,s.tasks[0],s.tasks[1]),{eligible:true,reason:'',needsQaResult:true,reuseQa:false});assert.equal(A.completedReviewEligibility(s,s.tasks[0],s.tasks[2]).eligible,false);assert.equal(A.completedReviewReceipt(s,'missing'),null);assert.equal(JSON.stringify(s),before);
});
test('source closeout leaves queue pause, lead/contact/outreach, deal and cash stores unchanged',()=>{
 let s=fixture();s=apply(s,'deal.save',{id:'deal',name:'Synthetic retained deal',contact:'Synthetic public route',offer:'research',stage:'proposed',feeCents:150000,notes:'Unrelated opportunity'});
 s=apply(s,'cash.add',{id:'entry',kind:'software',cents:1000,date:'2026-09-19',note:'Synthetic paid tool cost',evidence:'Synthetic receipt',dealId:''});
 s=apply(s,'lead.save',{id:'lead',company:'Synthetic account',website:'https://example.test/',offer:'research',channel:'direct',stage:'discovered',signal:'',source:'',checked:'',contact:'',buyer:'',nextAction:'',due:'',notes:'',lastTouch:'',lastNote:''});
 s=apply(s,'outreach.route.add',{id:'synthetic_route',leadId:'lead',channel:'email',address:'synthetic@example.test',source:'https://example.test/contact',checkedOn:'2026-09-19',timezone:'America/New_York',timezoneSource:'Synthetic location source',recordedBy:'Synthetic Revenue'});
 s=apply(s,'outreach.permission.record',{routeId:'synthetic_route',purpose:'prospecting',status:'revoked',evidence:'Synthetic restriction to retain',method:'Synthetic recipient instruction',recordedBy:'Synthetic Revenue'});
 s=apply(s,'pause',{});const outsideKeys=['leads','outreach','outreachReadiness','deals','entries','paused','goalCents'],next=close(s);
 for(const key of outsideKeys)assert.deepEqual(next[key],s[key],key+' must not change');assert.equal(next.paused,true);assert.deepEqual(next.tasks[2],s.tasks[2]);
});
function storeHarness(state){
 let record={data:clone(state)},writes=0,gets=0;const reference={onSnapshot(options,fn){fn({exists:true,data:()=>record,metadata:{fromCache:false}});return()=>{};}};
 const db={collection(name){assert.equal(name,'users');return {doc(uid){assert.equal(uid,'synthetic_owner');return {collection(name){assert.equal(name,'data');return {doc(name){assert.equal(name,'agentControl');return reference;}};}};}};},async runTransaction(fn){await fn({get:async ref=>{assert.equal(ref,reference);gets++;return {exists:true,data:()=>record};},set(ref,value){assert.equal(ref,reference);record=clone(value);writes++;}});}};
 const box={AgentControlModel:A,localStorage:{getItem(){return null;}},navigator:{},addEventListener(){},removeEventListener(){}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../agent-control-store.js'),'utf8'),box);const store=box.AgentControlStore.create({db,storage:box.localStorage});store.setUser({uid:'synthetic_owner'});
 return {store,get record(){return record;},get writes(){return writes;},get gets(){return gets;}};
}
test('the existing synthetic cloud transaction writes both records once and rejects a stale second submit before a write',async()=>{
 const s=fixture(),p=payload(s),a=action(s,'task.completed-review',p),h=storeHarness(s);await h.store.dispatch(a);
 assert.equal(h.writes,1);assert.equal(h.gets,1);assert.equal(h.record.data.revision,s.revision+1);assert.equal(h.record.data.tasks[0].status,'done');assert.equal(h.record.data.tasks[1].status,'done');
 await assert.rejects(h.store.dispatch(a),/another window/);assert.equal(h.writes,1);assert.equal(h.gets,2);assert.equal(h.record.data.tasks[0].reviewHistory.length,1);
 const reloaded=A.valid(clone(h.record.data));assert.equal(A.completedReviewReceipt(reloaded,p.closeoutId).qaId,'qa');
 const bad=payload(s,{decision:'revise'});bad.sourceDecision.note='r'.repeat(2001);const failure=storeHarness(s);await assert.rejects(failure.store.dispatch(action(s,'task.completed-review',bad)),/Check blocker/);assert.equal(failure.writes,0);assert.deepEqual(failure.record.data,s);
});
