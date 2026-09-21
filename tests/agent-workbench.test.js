'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../agent-control-model'),W=require('../crm/agent-workbench');
const AT='2026-09-21T12:00:00Z',clone=x=>JSON.parse(JSON.stringify(x));
let seq=0;
const apply=(s,type,payload)=>A.reduce(s,{type,payload,revision:s.revision,id:'synthetic_'+(++seq),at:AT});
function fixture(status='ready',verdict='pass'){
  let s=apply(A.initial(),'task.add',{id:'source',role:'analysis',title:'Synthetic source <img src=x>',brief:'Synthetic only.'});
  s=apply(s,'task.ready',{id:'source'});s=apply(s,'task.result',{id:'source',result:'Synthetic exact source.',sources:['https://example.test/source']});
  s=apply(s,'task.add',{id:'qa',role:'review',title:'Synthetic native Quality',brief:'Actual review evidence.',parentTaskId:'source'});
  if(status!=='draft')s=apply(s,'task.ready',{id:'qa'});
  if(['review','done'].includes(status))s=apply(s,'task.result',{id:'qa',result:'Original native QA finding.',sources:['https://example.test/qa'],qualityVerdict:verdict,confirmCurrentSource:true});
  if(status==='done')s=apply(s,'task.accept',{id:'qa',note:'Actual QA finding accepted.',review:{actor:'coordinator',reviewer:'Revenue',basis:'Exact evidence checked.',checks:{evidence:'pass',arithmetic:'na',fit:'pass'}}});
  s=apply(s,'task.add',{id:'untouched',role:'supply',title:'Unrelated',brief:'Unchanged.'});return s;
}
function input(s,verdict='pass',decision='accept'){
  const value=W.template(s,'source','qa'),p=value.payload;
  p.attribution={...p.attribution,reviewer:'Native Quality',recordedBy:'Revenue',reviewedAt:'2026-09-21T11:00:00Z',evidence:'native-artifact:original-quality',verdict};
  for(const d of [p.sourceDecision,p.qaReview].filter(Boolean)){d.note='Checked original native evidence.';d.review.reviewer='Revenue';d.review.basis='Exact source, arithmetic and fit checked.';d.review.checks={evidence:'pass',arithmetic:'na',fit:'pass'};}
  p.sourceDecision.decision=decision;
  if(p.qaResult)Object.assign(p.qaResult,{result:'Actual independent native '+verdict+' finding.',sources:['https://example.test/qa'],verdict});
  return value;
}
function harness(initial=fixture()){
  let state=clone(initial),uid='synthetic_owner',epoch=1,queue=Promise.resolve();const entries=new Map(),calls=[],reads=[];
  const h={calls,reads,entries,throwAfter:false,reject:false,storeFail:null,onDispatch:null,onRead:null};
  const storage={getItem:k=>entries.has(k)?entries.get(k):null,setItem(k,v){if(h.storeFail?.(JSON.parse(v)))throw Error('Synthetic storage unavailable');entries.set(k,v);}};
  const locks={request(name,fn){const next=queue.catch(()=>{}).then(fn);queue=next;return next;}};
  const data={status:()=>({uid,epoch,ready:true,error:'',agent:{uid,mode:'cloud',serverConfirmed:true}}),
    async readAgentRegister(){reads.push('server');if(h.onRead)await h.onRead();return {uid,epoch,serverConfirmed:true,observedAt:AT,state:clone(state)};},
    async dispatch(type,payload,revision){calls.push({type,payload:clone(payload),revision});if(h.onDispatch)await h.onDispatch();if(h.reject)throw Error('Synthetic rejected transaction');state=A.reduce(state,{type,payload,revision,id:'write_'+(++seq),at:AT});if(h.throwAfter)throw Error('Synthetic response lost');}};
  Object.assign(h,{data,storage,locks,state:()=>clone(state),change(fn){state=fn(state);},account(value){uid=value;epoch++;},client:()=>W.create({data,storage,locks,uuid:()=>String(++seq),now:()=>AT})});return h;
}
const confirm={independent:true,exactSource:true};
const prepare=(h,c=h.client(),value=input(h.state()))=>c.prepare(JSON.stringify(value),confirm);

test('same reducer closes new, submitted and accepted Quality; preserves unrelated records and original accepted QA',async()=>{
  for(const status of ['ready','review','done']){
    const h=harness(fixture(status)),c=h.client(),before=h.state(),prepared=await prepare(h,c);
    assert.equal(h.calls.length,0);assert.equal(prepared.status,'prepared');
    const result=await c.submit();assert.equal(result.status,'confirmed');assert.equal(result.serverConfirmed,true);
    assert.equal(h.calls.length,1);assert.equal(h.calls[0].type,'task.completed-review');
    assert.equal(h.state().revision,before.revision+1);assert.equal(h.state().tasks[0].status,'done');
    assert.deepEqual(h.state().tasks[2],before.tasks[2]);
    if(status==='done')assert.deepEqual(h.state().tasks[1],before.tasks[1]);
    assert.equal(result.receipt.request.attribution.reviewer,'Native Quality');
    assert.equal(result.receipt.request.attribution.recordedBy,'Revenue');
  }
});
test('bounded input refuses generic acceptance, extra fields, stale versions and missing factual confirmations before any write',async()=>{
  const h=harness(),c=h.client();
  await assert.rejects(()=>c.prepare(JSON.stringify({type:'task.accept',payload:{id:'source'}}),confirm),/Only/);
  await assert.rejects(()=>c.prepare('x'.repeat(60001),confirm),/60,000/);
  await assert.rejects(()=>c.prepare(JSON.stringify(input(h.state())),{}),/Confirm/);
  for(const mutate of [v=>v.payload.expectedSourceVersion++,v=>v.payload.outbound='send',v=>v.payload.attribution.reviewer='Revenue',v=>v.payload.attribution.reviewedAt='2099-01-01']){
    const v=input(h.state());mutate(v);await assert.rejects(()=>prepare(h,c,v));
  }
  assert.equal(h.calls.length,0);assert.equal(h.entries.size,0);
});
test('adverse independent QA blocks source acceptance and permits evidenced correction',async()=>{
  const h=harness(),c=h.client();await assert.rejects(()=>prepare(h,c,input(h.state(),'revise')),/Quality|pass|adverse/i);
  await prepare(h,c,input(h.state(),'revise','revise'));const result=await c.submit();
  assert.equal(result.receipt.decision,'revise');assert.equal(h.state().tasks[0].status,'blocked');
});
test('double submit and cross-tab preparation yield exactly one transaction',async()=>{
  const h=harness(),a=h.client(),b=h.client();await prepare(h,a);
  await assert.rejects(()=>prepare(h,b),/unresolved/);
  const results=await Promise.allSettled([a.submit(),a.submit()]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(h.calls.length,1);
});
test('reload before attempt is GET-only; close unsent retains its original request',async()=>{
  const h=harness(),c=h.client();const p=await prepare(h,c),reloaded=h.client();
  await assert.rejects(()=>reloaded.submit(),/reload/);assert.equal((await reloaded.reconcile()).status,'unconfirmed');
  await reloaded.closeUnsent();assert.equal(reloaded.pending().status,'not_sent');assert.deepEqual(reloaded.pending().request,p.request);assert.equal(h.calls.length,0);
});
test('uncertain committed save and reload reconcile exact receipt without resubmitting',async()=>{
  const h=harness(),c=h.client();await prepare(h,c);h.throwAfter=true;
  assert.equal((await c.submit()).status,'confirmed');
  const reloaded=h.client();assert.equal((await reloaded.reconcile()).status,'confirmed');assert.equal(h.calls.length,1);
  await assert.rejects(()=>reloaded.submit(),/reload/);
});
test('absent receipt keeps attempted job blocked, including after reload',async()=>{
  const h=harness(),c=h.client();await prepare(h,c);h.reject=true;
  assert.equal((await c.submit()).status,'unconfirmed');const reloaded=h.client();
  assert.equal((await reloaded.reconcile()).status,'unconfirmed');
  await assert.rejects(()=>prepare(h,reloaded),/unresolved/);await assert.rejects(()=>reloaded.closeUnsent(),/no recorded attempt/);assert.equal(h.calls.length,1);
});
test('journal failures prevent dispatch; failure retaining confirmation preserves the attempt',async()=>{
  const h=harness(),c=h.client();h.storeFail=()=>true;await assert.rejects(()=>prepare(h,c),/storage/);assert.equal(h.calls.length,0);
  h.storeFail=null;await prepare(h,c);h.storeFail=r=>r.status==='attempted';await assert.rejects(()=>c.submit(),/storage/);assert.equal(h.calls.length,0);
  await c.closeUnsent();h.storeFail=null;await prepare(h,c);h.storeFail=r=>r.status==='confirmed';await assert.rejects(()=>c.submit(),/storage/);assert.equal(c.pending().status,'attempted');
  h.storeFail=null;assert.equal((await h.client().reconcile()).status,'confirmed');assert.equal(h.calls.length,1);
});
test('revision changes do not retarget old requests; account switch cannot send or read old journal',async()=>{
  const h=harness(),c=h.client();await prepare(h,c);h.change(s=>apply(s,'task.add',{id:'new',role:'analysis',title:'New task',brief:'Later revision.'}));
  await assert.rejects(()=>c.submit(),/register changed/);assert.equal(h.calls.length,0);
  h.account('other_owner');assert.equal(c.pending(),null);await assert.rejects(()=>c.submit(),/account change/);
  h.account('synthetic_owner');assert.equal((await c.reconcile()).status,'unconfirmed');assert.equal(h.calls.length,0);
});
test('account change during transaction never confirms in the wrong account',async()=>{
  const h=harness(),c=h.client();await prepare(h,c);h.onDispatch=async()=>h.account('other_owner');
  await assert.rejects(()=>c.submit(),/Account changed/);assert.equal(c.pending(),null);
  h.account('synthetic_owner');assert.equal((await h.client().reconcile()).status,'confirmed');assert.equal(h.calls.length,1);
});
test('historical receipt reports later current state separately',async()=>{
  const h=harness(),c=h.client();await prepare(h,c);await c.submit();h.change(s=>apply(s,'task.add',{id:'later',role:'analysis',title:'Later',brief:'Later work.'}));
  const result=await h.client().reconcile();assert.equal(result.status,'confirmed');assert.match(result.meaning,/historical/);assert.equal(result.revision,h.state().revision);assert.equal(result.currentTasks.length,2);
});
test('all coordinator attribution must match the single Revenue recorder',async()=>{
  for(const status of ['ready','done']){
    const h=harness(fixture(status)),c=h.client(),value=input(h.state());
    value.payload.sourceDecision.review.reviewer='Someone else';await assert.rejects(()=>prepare(h,c,value),/same Revenue recorder/);
    assert.equal(h.calls.length,0);
  }
});
test('complete task classification retains undated Ready and review work alongside blockers under sending HOLD',()=>{
  let s=fixture();
  s=apply(s,'task.ready',{id:'untouched'});
  s=apply(s,'task.add',{id:'blocked',role:'outreach',title:'Blocked sibling',brief:'Exact blocker.'});
  s=apply(s,'task.block',{id:'blocked',reason:'A specific missing source.',blockerKind:'execution'});
  // Current sending-readiness projection is orthogonal to exact task eligibility.
  s.outreachReadiness={authority:'held'};
  const rows=W.classify(s);assert.equal(rows.length,s.tasks.length);
  assert.equal(rows.find(r=>r.id==='untouched').bucket,'ready');assert.equal(rows.find(r=>r.id==='untouched').actionable,true);
  const source=rows.find(r=>r.id==='source');assert.ok(source.completedReviewOptions.some(p=>p.eligible));assert.match(source.nextAction,/already completed/);
  assert.deepEqual(source.meaning.qa,{id:'qa',status:'ready',resultVersion:A.resultVersion(s.tasks.find(t=>t.id==='qa'))});
  assert.doesNotMatch(JSON.stringify(rows),/Synthetic exact source|Actual review evidence/);
  assert.equal(rows.find(r=>r.id==='blocked').gate,'A specific missing source.');
  assert.deepEqual(rows.map(r=>r.id),s.tasks.map(t=>t.id));
});
test('a stale Quality row cannot borrow eligibility from a different linked Quality assignment',()=>{
  let s=fixture('done');
  s=apply(s,'task.add',{id:'qa_stale',role:'review',title:'Stale sibling QA',brief:'Older exact source.',parentTaskId:'source'});
  s=apply(s,'task.ready',{id:'qa_stale'});s.tasks.find(t=>t.id==='qa_stale').reviewOfVersion=0;
  const rows=W.classify(s),stale=rows.find(r=>r.id==='qa_stale'),source=rows.find(r=>r.id==='source');
  assert.equal(stale.completedReviewOptions.length,1);assert.equal(stale.completedReviewOptions[0].eligible,false);
  assert.doesNotMatch(stale.nextAction,/already completed/);assert.match(stale.gate,/stale/);assert.ok(source.completedReviewOptions.some(r=>r.eligible));
});

function legacyReviewFixture(status='draft'){
  const state=fixture(status),source=state.tasks.find(t=>t.id==='source'),qa=state.tasks.find(t=>t.id==='qa');
  // Valid schema-1 results can predate resultVersion. Zero is a real version,
  // not an absent result or a reason to recreate/claim the assignment.
  delete source.resultVersion;qa.reviewOfVersion=0;
  source.brief='Research https://example.test/energy/2024?source=2017 without replacing original dates.';
  qa.brief='Original review brief: compare https://example.test/evidence/2017 to the 2024 source.';
  A.valid(state);return state;
}

function assertUnfilledAttribution(payload){
  assert.equal(payload.confirmCurrentSource,false);assert.equal(payload.attribution.independent,false);
  for(const key of ['reviewer','reviewedAt','evidence','recordedBy'])assert.equal(payload.attribution[key],'',key+' must remain factual user input');
  for(const decision of [payload.qaReview,payload.sourceDecision].filter(Boolean)){
    assert.equal(decision.note,'');assert.equal(decision.review.reviewer,'');assert.equal(decision.review.basis,'');
    assert.deepEqual(decision.review.checks,{evidence:'unchecked',arithmetic:'unchecked',fit:'unchecked'});
  }
}

test('review path recognizes a version-zero Draft pair only as an unsent Ready-for-handoff prerequisite',()=>{
  const state=legacyReviewFixture(),before=clone(state),path=W.reviewPath(state,'source','qa');
  assert.equal(path.sourceId,'source');assert.equal(path.sourceVersion,0);assert.equal(path.linked.length,1);
  assert.equal(path.selected.qaId,'qa');assert.equal(path.selected.status,'draft');assert.equal(path.selected.resultVersion,0);
  assert.equal(path.selected.eligible,false);assert.equal(path.selected.needsReady,true);assert.match(path.selected.reason,/Ready for handoff/);
  assert.deepEqual(state,before,'The advisory must not ready, claim or mutate either task or its history');
  const ready=apply(state,'task.ready',{id:'qa'}),source=ready.tasks.find(t=>t.id==='source'),qa=ready.tasks.find(t=>t.id==='qa');
  assert.equal(A.completedReviewEligibility(ready,source,qa).eligible,true);
  const readyPath=W.reviewPath(ready,'source','qa');assert.equal(readyPath.selected.eligible,true);assert.equal(readyPath.selected.needsReady,false);
  const payload=W.template(ready,'source','qa').payload;assert.equal(payload.expectedSourceVersion,0);assert.equal(payload.expectedQaVersion,0);
});

test('review path shows every linked Quality row but requires explicit selection and never borrows another pair',()=>{
  let state=fixture('done');
  state=apply(state,'task.add',{id:'qa_cancelled',role:'review',title:'Cancelled exact review',brief:'Retain historical assignment.',parentTaskId:'source'});
  state=apply(state,'task.cancel',{id:'qa_cancelled'});
  state=apply(state,'task.add',{id:'qa_stale',role:'review',title:'Stale exact review',brief:'Earlier source revision.',parentTaskId:'source'});
  state=apply(state,'task.ready',{id:'qa_stale'});state.tasks.find(t=>t.id==='qa_stale').reviewOfVersion=0;
  const before=clone(state),all=W.reviewPath(state,'source');
  assert.deepEqual(all.linked.map(row=>row.qaId),['qa','qa_cancelled','qa_stale']);assert.equal(all.selected,null);
  assert.equal(all.linked.find(row=>row.qaId==='qa').eligible,true);
  const stale=W.reviewPath(state,'source','qa_stale').selected;
  assert.equal(stale.eligible,false);assert.equal(stale.needsReady,false);assert.match(stale.reason,/stale source version/);
  const cancelled=W.reviewPath(state,'source','qa_cancelled').selected;
  assert.equal(cancelled.eligible,false);assert.equal(cancelled.needsReady,false);assert.match(cancelled.reason,/not eligible/);
  for(const id of ['untouched','missing_qa','source']){
    const invalid=W.reviewPath(state,'source',id);assert.equal(invalid.selected,null);assert.match(invalid.reason,/linked|Quality assignment|select/i);
  }
  assert.deepEqual(state,before);
});

test('Draft review-path guidance preserves actual paused, stale, owner and historical gates without mutating the register',()=>{
  const scenarios=[
    {name:'paused',change:s=>apply(s,'pause',{}),reason:/Resume the queue before preparing a handoff/},
    {name:'stale',change:s=>{s.tasks.find(t=>t.id==='qa').reviewOfVersion=99;return s;},reason:/stale source version/},
    {name:'owner Quality',change:s=>apply(s,'task.route',{id:'qa',kind:'work',reviewOwner:'owner',reason:'Owner authority still required.',recordedBy:'Revenue'}),reason:/owner|routing/i},
    {name:'owner source',change:s=>apply(s,'task.route',{id:'source',kind:'work',reviewOwner:'owner',reason:'Exact owner decision unresolved.',recordedBy:'Revenue'}),reason:/source is assigned to an owner decision/},
    {name:'historical Quality',change:s=>apply(s,'task.route',{id:'qa',kind:'superseded',reviewOwner:'team',reason:'Retain original history.',recordedBy:'Revenue'}),reason:/historical|routing/i},
    {name:'historical source',change:s=>apply(s,'task.route',{id:'source',kind:'reference',reviewOwner:'team',reason:'Reference only.',recordedBy:'Revenue'}),reason:/specialist result currently awaiting team review/}
  ];
  for(const scenario of scenarios){
    const state=scenario.change(fixture('draft')),before=clone(state),path=W.reviewPath(state,'source','qa');
    assert.equal(path.selected.eligible,false,scenario.name);assert.equal(path.selected.needsReady,false,scenario.name);assert.match(path.selected.reason,scenario.reason,scenario.name);
    assert.deepEqual(state,before,scenario.name+' must remain unchanged');
  }
  // Pausing new handoffs does not revoke the model's existing completed-review
  // path for work that was already Ready, submitted or accepted.
  for(const status of ['ready','review','done']){
    const state=apply(fixture(status),'pause',{}),path=W.reviewPath(state,'source','qa');
    assert.equal(path.selected.eligible,true,status);assert.equal(path.selected.needsReady,false,status);
  }
});

test('template defaults remain blank and explicit verdict prefill never invents attribution, checks or confirmation',()=>{
  const state=fixture(),before=clone(state),defaults=W.template(state,'source','qa');
  assert.deepEqual(W.template(state,'source','qa',{}),defaults);
  assert.deepEqual(W.template(state,'source','qa',{verdict:'',finding:'',correction:''}),defaults);
  assert.equal(defaults.payload.attribution.verdict,'');assert.equal(defaults.payload.qaResult.verdict,'');assert.equal(defaults.payload.sourceDecision.decision,'');assertUnfilledAttribution(defaults.payload);
  for(const verdict of ['pass','revise','blocked']){
    const payload=W.template(state,'source','qa',{verdict}).payload;
    assert.equal(payload.attribution.verdict,verdict);assert.equal(payload.qaResult.verdict,verdict);
    assert.equal(payload.sourceDecision.decision,verdict==='pass'?'':'revise','Quality PASS must not infer Revenue acceptance');assert.equal(payload.qaResult.result,'');assert.deepEqual(payload.qaResult.sources,[]);
    assertUnfilledAttribution(payload);
  }
  assert.deepEqual(state,before);
});

test('safe transcription prefill preserves URLs and years exactly and confines the labelled correction to a new QA result',()=>{
  const state=apply(legacyReviewFixture(),'task.ready',{id:'qa'}),before=clone(state);
  const finding='Native Quality: pass. The 2017 record at https://example.test/power/2017?q=2024 supports the current finding.';
  const correction='The quoted source year is 2017, not 2024. Keep https://example.test/power/2017?q=2024 unchanged.';
  const output=W.template(state,'source','qa',{verdict:'pass',finding,correction}),payload=output.payload;
  assert.equal(output.revision,state.revision);assert.equal(payload.expectedSourceVersion,0);assert.equal(payload.expectedQaVersion,0);
  assert.equal(payload.sourceDecision.decision,'','A copied PASS finding leaves the coordinator decision explicit');
  assert.equal(payload.qaResult.result,finding+'\n\nFactual transcription correction (recorded by Revenue):\n'+correction);
  assert.deepEqual(payload.qaResult.sources,[],'Do not silently promote URLs from copied prose into verified evidence');
  assert.equal(W.template(state,'source','qa',{verdict:'revise',finding}).payload.qaResult.result,finding);
  assertUnfilledAttribution(payload);assert.deepEqual(state,before);
  assert.equal(state.tasks.find(t=>t.id==='source').brief,before.tasks.find(t=>t.id==='source').brief);
  assert.equal(state.tasks.find(t=>t.id==='qa').brief,before.tasks.find(t=>t.id==='qa').brief);
});

test('template refuses text without an explicit verdict and correction without the original finding',()=>{
  const state=fixture(),before=clone(state);
  for(const options of [{finding:'Actual completed finding.'},{verdict:'',finding:'Actual completed finding.'},{correction:'A copied year is wrong.'},{verdict:'',correction:'A copied year is wrong.'}]){
    assert.throws(()=>W.template(state,'source','qa',options),/verdict|finding/i);
  }
  assert.throws(()=>W.template(state,'source','qa',{verdict:'pass',correction:'A copied year is wrong.'}),/finding/i);
  assert.throws(()=>W.template(state,'source','qa',{verdict:'approved',finding:'Unsupported verdict.'}),/verdict/i);
  assert.deepEqual(state,before);
});

test('submitted and accepted Quality findings are immutable to prefill and retain their original evidence and history',()=>{
  for(const status of ['review','done']){
    const state=fixture(status),before=clone(state),qa=state.tasks.find(t=>t.id==='qa');
    for(const options of [{verdict:'pass',finding:'Replacement finding.'},{verdict:'pass',correction:'Replacement correction.'},{verdict:'pass',finding:'Original text copy.',correction:'New date.'}]){
      assert.throws(()=>W.template(state,'source','qa',options),/immutable|submitted|accepted|existing|finding/i,status);
    }
    const payload=W.template(state,'source','qa',{verdict:'pass'}).payload;
    assert.equal(Object.hasOwn(payload,'qaResult'),false);assert.equal(payload.expectedQaVersion,A.resultVersion(qa));assert.equal(payload.sourceDecision.decision,'');
    assert.equal(Object.hasOwn(payload,'qaReview'),status!=='done');assertUnfilledAttribution(payload);
    assert.deepEqual(state,before,status+' result, sources, attribution and acceptance history must be retained');
  }
});

function validPreflightPayload(verdict='pass'){
  const payload=input(fixture(),verdict,verdict==='pass'?'accept':'revise').payload;
  payload.confirmCurrentSource=true;payload.attribution.independent=true;return payload;
}

test('blank template preflight reports all missing field paths together without filling or mutating evidence',()=>{
  const payload=W.template(fixture(),'source','qa').payload,before=clone(payload),issues=W.preflight(payload,AT);
  assert(Array.isArray(issues));const message=JSON.stringify(issues);
  for(const field of [
    'attribution.verdict','attribution.reviewer','attribution.reviewedAt','attribution.evidence','attribution.recordedBy',
    'qaResult.verdict','qaResult.result','qaReview.note','qaReview.review.reviewer','qaReview.review.basis',
    'qaReview.review.checks.evidence','qaReview.review.checks.arithmetic','qaReview.review.checks.fit',
    'sourceDecision.decision','sourceDecision.note','sourceDecision.review.reviewer','sourceDecision.review.basis'
  ])assert(message.includes(field),'Missing actionable field path: '+field);
  assert.deepEqual(payload,before);
});

test('preflight rejects uppercase, misplaced and conflicting verdicts instead of inferring a valid decision',()=>{
  const upper=validPreflightPayload('revise');upper.attribution.verdict='REVISE';upper.qaResult.verdict='REVISE';
  const misplaced=validPreflightPayload('revise');delete misplaced.attribution.verdict;delete misplaced.qaResult.verdict;misplaced.verdict='revise';
  for(const payload of [upper,misplaced]){
    const before=clone(payload),message=JSON.stringify(W.preflight(payload,AT));
    assert(message.includes('attribution.verdict'));assert(message.includes('qaResult.verdict'));assert.deepEqual(payload,before);
  }
  const conflicting=validPreflightPayload('revise');conflicting.qaResult.verdict='pass';
  const conflict=JSON.stringify(W.preflight(conflicting,AT));assert(conflict.includes('qaResult.verdict'));assert.match(conflict,/match|conflict/i);
});

test('preflight preserves explicit coordinator and original-review evidence requirements',()=>{
  assert.deepEqual(W.preflight(validPreflightPayload(),AT),[]);
  const payload=validPreflightPayload();payload.attribution.reviewedAt='2099-01-01T00:00:00Z';
  payload.qaReview.review.actor='owner';payload.sourceDecision.review.actor='owner';payload.sourceDecision.review.checks.evidence='invented';
  const message=JSON.stringify(W.preflight(payload,AT));
  for(const field of ['attribution.reviewedAt','qaReview.review.actor','sourceDecision.review.actor','sourceDecision.review.checks.evidence'])assert(message.includes(field),field);
});

test('adverse Quality verdict can retain pass/na QA acceptance checks and source correction checks without approving the source',async()=>{
  const h=harness(),c=h.client(),value=input(h.state(),'revise','revise'),p=value.payload;
  p.qaReview.review.checks={evidence:'pass',arithmetic:'na',fit:'pass'};
  p.sourceDecision.review.checks={evidence:'revise',arithmetic:'unchecked',fit:'blocked'};
  const previewPayload=clone(p);previewPayload.attribution.independent=true;previewPayload.confirmCurrentSource=true;
  assert.deepEqual(W.preflight(previewPayload,AT),[]);
  const prepared=await prepare(h,c,value);assert.equal(prepared.status,'prepared');assert.equal(prepared.request.sourceDecision.decision,'revise');
  assert.deepEqual(prepared.request.sourceDecision.review.checks,p.sourceDecision.review.checks);assert.equal(h.calls.length,0);
  const invalid=clone(previewPayload);invalid.qaReview.review.checks.evidence='revise';
  assert(JSON.stringify(W.preflight(invalid,AT)).includes('qaReview.review.checks.evidence'));
});

test('invalid preflight reports exact paths before any fresh read, retained journal or dispatch',async()=>{
  const cases=[
    {change:p=>{p.attribution.verdict='';p.qaResult.verdict='';},path:/attribution\.verdict/},
    {change:p=>{p.attribution.verdict='PASS';p.qaResult.verdict='PASS';},path:/qaResult\.verdict/},
    {change:p=>{delete p.attribution.verdict;delete p.qaResult.verdict;p.verdict='pass';},path:/attribution\.verdict/},
    {change:p=>{p.attribution.reviewer='';},path:/attribution\.reviewer/}
  ];
  for(const scenario of cases){
    const h=harness(),value=input(h.state()),before=h.state();scenario.change(value.payload);
    await assert.rejects(()=>prepare(h,h.client(),value),scenario.path);
    assert.deepEqual(h.reads,[]);assert.equal(h.entries.size,0);assert.deepEqual(h.calls,[]);assert.deepEqual(h.state(),before);
  }
  const h=harness(),blank=W.template(h.state(),'source','qa');
  await assert.rejects(()=>h.client().prepare(JSON.stringify(blank),{}),error=>{
    assert.match(error.message,/attribution\.verdict/);assert.match(error.message,/qaResult\.verdict/);
    assert.match(error.message,/reviewer worked independently/);assert.match(error.message,/review covers this exact source/);return true;
  });
  assert.deepEqual(h.reads,[]);assert.equal(h.entries.size,0);assert.deepEqual(h.calls,[]);
});
