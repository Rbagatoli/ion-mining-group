'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const O=require('../owner-confirmation'),Ui=require('../owner-confirmation-ui'),R=require('../deal-relationships');
const NOW=Date.parse('2026-09-07T16:00:00Z');
function site(){return {id:'test-site',name:'Test landfill',stage:'unreviewed',custom_fields:{keep:'private'}};}
function call(extra={}){return {recorded_by:'Test recorder',occurred_on:'2026-09-07',method:'call',direction:'outbound',outcome:'discussion',person:'Test operator',organization:'Test office',summary:'Synthetic call: requests a gas log before discussing allocation.',answers:{energy:{basis:'owner_report',note:'No net power is currently offered. Verify logs and competing uses.'}},offered_net_kw:0,methane_pct:'',collected_mmscfd:'',due_on:'2026-09-09',next_action:'Request flow logs and equipment list',action_owner:'Test recorder',waiting_on:'Test operator',requested_documents:['flow','equipment'],...extra};}
function save(s,type,value,id){const result=O.apply(s,{revision:O.state(s).revision,type,value,id},NOW);assert.equal(result.ok,true,result.err);return {...s,custom_fields:{...s.custom_fields,[O.KEY]:result.worksheet}};}
test('a conversation atomically contains attributed evidence and one required dated action, retaining explicit zero',()=>{
  const source=site(),s=save(source,'conversation',call()),ws=O.state(s);
  assert.equal(O.state(source).revision,0);assert.equal(ws.conversations.length,1);assert.equal(ws.actions.length,1);assert.equal(ws.actions[0].conversation_id,ws.conversations[0].id);
  assert.equal(ws.conversations[0].energy.offered_net_kw,0);assert.equal(ws.conversations[0].energy.methane_pct,null);assert.equal(ws.conversations[0].energy.collected_mmscfd,null);
  assert.equal(O.findings(s).energy.person,'Test operator');assert.equal(s.custom_fields.keep,'private');assert.equal(s.stage,'unreviewed');
  assert.equal(O.apply(source,{revision:0,type:'conversation',value:call({due_on:''})},NOW).ok,false);
  assert.equal(O.apply(source,{revision:0,type:'conversation',value:call({action_owner:''})},NOW).ok,false);
});
test('latest findings follow conversation dates; an older call or an unanswered topic cannot replace a newer answer',()=>{
  let s=save(site(),'conversation',call());
  s=save(s,'conversation',call({occurred_on:'2026-09-06',answers:{energy:{basis:'owner_report',note:'Older estimate'},rights:{basis:'uncertain',note:'Signer unidentified'}},offered_net_kw:200}));
  assert.equal(O.findings(s).energy.energy.offered_net_kw,0);assert.equal(O.findings(s).rights.note,'Signer unidentified');
  s=save(s,'conversation',call({answers:{},offered_net_kw:''}));assert.equal(O.findings(s).energy.energy.offered_net_kw,0);
  s=save(s,'conversation',call({answers:{energy:{basis:'uncertain',note:'Owner withdrew the estimate pending logs'}},offered_net_kw:''}));
  assert.equal(O.findings(s).energy.basis,'uncertain');assert.equal(O.findings(s).energy.energy.offered_net_kw,null);assert.equal(O.actions(s,NOW).length,4);
});
test('missed calls cannot supply new owner answers and written evidence requires a traceable reference',()=>{
  for(const patch of [{outcome:'no_answer'},{outcome:'voicemail'}, {answers:{energy:{basis:'written',note:'Email says zero'}}}, {answers:{energy:{basis:'unanswered',note:'Forgot to choose evidence'}}}]){
    const result=O.apply(site(),{revision:0,type:'conversation',value:call(patch)},NOW);assert.equal(result.ok,false,JSON.stringify(patch));
  }
  assert.equal(O.state(save(site(),'conversation',call({outcome:'voicemail',answers:{},offered_net_kw:''}))).conversations[0].outcome,'voicemail');
  const declined=save(site(),'conversation',call({outcome:'declined'}));assert.equal(O.findings(declined).energy.energy.offered_net_kw,0,'A rejection can still supply a useful answer');assert.equal(O.interactions(declined)[0].outcome,'negative');
  assert.equal(O.findings(save(site(),'conversation',call({answers:{energy:{basis:'written',note:'Email confirms zero',reference:'Operator email, September 7, attached to site documents'}}}))).energy.basis,'written');
});
test('invalid dates, impossible quantities, unsafe links and stale revisions cannot alter a worksheet',()=>{
  const invalid=[{occurred_on:'2026-09-08'},{occurred_on:'2026-02-30'},{due_on:'2026-09-06'},{methane_pct:101},{offered_net_kw:-1},{collected_mmscfd:true},{measured_on:'2026-09-08'},{answers:{energy:{basis:'owner_report',note:'Test',source_url:'javascript:alert(1)'}}},{answers:{energy:{basis:'written',note:'Test',source_url:'https://user:pass@example.com/'}}}];
  for(const patch of invalid)assert.equal(O.apply(site(),{revision:0,type:'conversation',value:call(patch)},NOW).ok,false,JSON.stringify(patch));
  const s=save(site(),'conversation',call());assert.match(O.apply(s,{revision:0,type:'conversation',value:call()},NOW).err,/another view/);
});
test('relationship association snapshots the selected contact and rejects stale or mismatched contacts',()=>{
  const s=site(),node={id:'operator',name:'Test operator',organization:'Test office',roles:['operator'],status:'published',authority_status:'unconfirmed'};
  s.custom_fields[R.storageKey]={v:1,revision:1,nodes:[node],connections:[],history:[]};
  const linked=save(s,'conversation',call({relationship_id:'operator'}));assert.deepEqual(O.state(linked).conversations[0].relationship_snapshot.roles,['operator']);
  assert.equal(O.state(linked).conversations[0].relationship_snapshot.authority_status,'unconfirmed');assert.deepEqual(linked.custom_fields[R.storageKey],s.custom_fields[R.storageKey]);
  assert.equal(O.apply(s,{revision:0,type:'conversation',value:call({relationship_id:'operator',person:'Someone else'})},NOW).ok,false);
  node.archived=true;assert.equal(O.apply(s,{revision:0,type:'conversation',value:call({relationship_id:'operator'})},NOW).ok,false);
});
test('completion, reopening and correction retain authors and history; voiding does not silently discard a promise',()=>{
  let s=save(site(),'conversation',call()),a=O.state(s).actions[0];
  s=save(s,'action',{recorded_by:'Recorder',status:'done',note:'Logs received and attached'},a.id);assert.equal(O.queue([s],NOW).length,0);
  s=save(s,'action',{recorded_by:'Recorder',status:'open',note:'Missing gas-quality page'},a.id);assert.equal(O.queue([s],NOW).length,1);
  s=save(s,'void',{recorded_by:'Recorder',note:'Recorded against wrong site'},'oc_1');assert.equal(O.findings(s).energy,undefined);assert.equal(O.interactions(s).length,0);
  assert.equal(O.queue([s],NOW)[0].conversation_voided,true);assert.equal(O.state(s).conversations.length,1);assert.equal(O.state(s).history.length,4);
});
test('open promises are ordered by due date, including backdated entries and closed-site commitments',()=>{
  let a=save(site(),'conversation',call({occurred_on:'2026-09-01',due_on:'2026-09-03'})),b=save({...site(),id:'second',name:'Other site',stage:'dead'},'conversation',call({due_on:'2026-09-07'}));
  const q=O.queue([b,a],NOW);assert.equal(q[0].prospect_id,'test-site');assert.equal(q[0].due_state,'overdue');assert.equal(q[1].due_state,'today');
  const d=new Date(2026,8,7,23,30);assert.equal(O.today(d.getTime()),'2026-09-07','Due dates use the viewer calendar, not a UTC rollover');
});
test('corrupt or newer saved schemas fail closed instead of being overwritten; rendered notes are escaped',()=>{
  const s=save(site(),'conversation',call()),bad=structuredClone(s);bad.custom_fields[O.KEY].actions.push({...bad.custom_fields[O.KEY].actions[0]});
  assert.ok(O.state(bad).error);assert.equal(O.apply(bad,{revision:1,type:'conversation',value:call()},NOW).ok,false);
  bad.custom_fields[O.KEY].v=2;assert.ok(O.state(bad).error);
  const x=save(site(),'conversation',call({summary:'<img src=x onerror=alert(1)>',person:'<script>bad</script>'}));const html=Ui.render(x);
  assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<script>|<img/);assert.match(Ui.todayMarkup(O.queue([x],NOW)),/Request flow logs/);
});
