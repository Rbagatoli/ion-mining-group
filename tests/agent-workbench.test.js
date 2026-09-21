'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../agent-control-model'),W=require('../crm/agent-workbench');
const AT='2026-09-21T12:00:00Z',clone=x=>JSON.parse(JSON.stringify(x));
let seq=0;
const apply=(s,type,payload)=>A.reduce(s,{type,payload,revision:s.revision,id:'synthetic_'+(++seq),at:AT});
function fixture(status='ready',verdict='pass'){
  let s=apply(A.initial(),'task.add',{id:'source',role:'analysis',title:'Synthetic source <img src=x>',brief:'Synthetic only.'});
  s=apply(s,'task.ready',{id:'source'});s=apply(s,'task.result',{id:'source',result:'Synthetic exact source.',sources:['https://example.test/source']});
  s=apply(s,'task.add',{id:'qa',role:'review',title:'Synthetic native Quality',brief:'Actual review evidence.',parentTaskId:'source'});s=apply(s,'task.ready',{id:'qa'});
  if(status!=='ready')s=apply(s,'task.result',{id:'qa',result:'Original native QA finding.',sources:['https://example.test/qa'],qualityVerdict:verdict,confirmCurrentSource:true});
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
