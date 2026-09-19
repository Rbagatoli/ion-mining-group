'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const A=require('../agent-control-model');
const O=require('../crm/outreach-model'),F=require('../crm/workflow'),M=require('../crm/crm-model');
const ROOT=path.join(__dirname,'..'),LOCAL='protonAgentControlLocal_v1';
let sequence=0;
function action(state,type,payload={}){return {id:'integration_'+(++sequence),at:'2026-09-18T15:00:00Z',revision:state.revision,type,payload};}
function apply(state,type,payload){return A.reduce(state,action(state,type,payload));}
function storage(){const data=new Map();return {getItem:key=>data.has(key)?data.get(key):null,setItem:(key,value)=>data.set(key,String(value)),data};}
function harness({db=null,data=storage(),locks}={}){
  const box={AgentControlModel:A,localStorage:data,navigator:locks?{locks}:{},addEventListener(){},removeEventListener(){}};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT,'agent-control-store.js'),'utf8'),box);
  return {store:box.AgentControlStore.create({db,storage:data}),data};
}
function cloud(){
  const docs=new Map(),listeners=new Map(),writes=[];
  const snapshot=uid=>({exists:docs.has(uid),data:()=>docs.get(uid),metadata:{fromCache:false}});
  const reference=uid=>({uid,onSnapshot(options,receive){listeners.set(uid,receive);receive(snapshot(uid));return()=>{};}});
  const db={collection(name){assert.equal(name,'users');return {doc:uid=>({collection:name=>{assert.equal(name,'data');return {doc:key=>{assert.equal(key,'agentControl');return reference(uid);}};}})};},
    async runTransaction(fn){let pending;await fn({get:async ref=>snapshot(ref.uid),set(ref,value){pending={uid:ref.uid,value};}});if(pending){docs.set(pending.uid,pending.value);writes.push(pending.uid);listeners.get(pending.uid)(snapshot(pending.uid));}}};
  return {db,docs,listeners,writes,snapshot};
}
function lead(id='buyer_one',extra={}){return Object.assign({id,company:'Synthetic buyer',website:'https://integration.example.test',offer:'quote_review',channel:'direct',stage:'discovered',signal:'',source:'',checked:'',contact:'',buyer:'',nextAction:'',due:'',notes:'',lastTouch:'',lastNote:''},extra);}
function route(state,id='route_one',leadId='buyer_one',channel='email',address='buyer@integration.example.test'){
  return apply(state,'outreach.route.add',{id,leadId,channel,address,source:'https://integration.example.test/contact',checkedOn:'2026-09-18',timezone:'America/New_York',timezoneSource:'Synthetic company location evidence',recordedBy:'Synthetic Revenue'});
}
function routed(){return route(apply(A.initial(),'lead.save',lead()));}
function permission(state,status='revoked',routeId='route_one'){
  return apply(state,'outreach.permission.record',{routeId,purpose:'prospecting',status,evidence:'Synthetic purpose-specific recipient instruction',method:'Synthetic recipient request',recordedBy:'Synthetic Revenue'});
}
function touch(state,extra={}){
  return apply(state,'outreach.touch.record',Object.assign({id:'touch_'+(++sequence),leadId:'buyer_one',routeId:'route_one',direction:'outbound',purpose:'prospecting',status:'sent',occurredAt:'2026-09-17T14:00:00Z',providerRef:'synthetic_message_'+sequence,evidence:'Synthetic observed provider receipt',cycleId:'synthetic_cycle',recordedBy:'Synthetic Revenue'},extra));
}
function today(state){return M.today({sites:[],leads:state.leads,tasks:state.tasks,followups:[],date:'2026-09-18',state});}

test('a queued anonymous write cannot replace signed-in state after the local lock resolves',async()=>{
  let release;
  const locks={request(name,run){assert.equal(name,LOCAL);return new Promise((resolve,reject)=>{release=()=>{try{resolve(run());}catch(error){reject(error);}};});}};
  const c=cloud(),h=harness({db:c.db,locks});
  const pending=h.store.dispatch(action(h.store.snapshot().state,'lead.save',lead()));
  h.store.setUser({uid:'signed_in_owner'});
  release();
  await assert.rejects(pending,/account|workspace|changed/i);
  assert.equal(h.store.snapshot().uid,'signed_in_owner');
  assert.equal(h.store.snapshot().state.leads.length,0);
  assert.equal(h.data.getItem(LOCAL),null);
  assert.equal(c.writes.length,0);
});

test('anonymous and two cloud owners keep distinct transactional outreach registers',async()=>{
  const c=cloud(),data=storage(),anonymous=apply(A.initial(),'lead.save',lead('anonymous'));
  data.setItem(LOCAL,JSON.stringify(anonymous));
  const h=harness({db:c.db,data});
  h.store.setUser({uid:'owner_a'});
  assert.equal(h.store.snapshot().state.leads.length,0);
  assert.equal(c.writes.length,0,'sign-in never imports anonymous work');
  await h.store.dispatch(action(h.store.snapshot().state,'lead.save',lead('cloud_a')));
  h.store.setUser({uid:'owner_b'});
  assert.equal(h.store.snapshot().state.leads.length,0);
  c.listeners.get('owner_a')(c.snapshot('owner_a'));
  assert.equal(h.store.snapshot().uid,'owner_b');
  assert.equal(h.store.snapshot().state.leads.length,0,'late owner-A snapshots are ignored');
  await h.store.dispatch(action(h.store.snapshot().state,'lead.save',lead('cloud_b')));
  assert.deepEqual(c.writes,['owner_a','owner_b']);
  assert.equal(c.docs.get('owner_a').data.leads[0].id,'cloud_a');
  assert.equal(c.docs.get('owner_b').data.leads[0].id,'cloud_b');
  h.store.setUser(null);
  assert.equal(h.store.snapshot().state.leads[0].id,'anonymous');
});

test('cloud transaction re-reads revision instead of accepting a stale form',async()=>{
  const c=cloud(),h=harness({db:c.db});h.store.setUser({uid:'owner'});
  const stale=action(h.store.snapshot().state,'lead.save',lead('stale'));
  c.docs.set('owner',{data:apply(A.initial(),'lead.save',lead('concurrent'))});
  await assert.rejects(h.store.dispatch(stale),/another window/);
  assert.equal(c.writes.length,0);
  assert.equal(c.docs.get('owner').data.leads[0].id,'concurrent');
});

test('account changes during transaction reads abort before any write',async()=>{
  const c=cloud();let release;
  c.db.runTransaction=async run=>run({get:()=>new Promise(resolve=>{release=()=>resolve({exists:false});}),set(){assert.fail('account-changed transaction must not write');}});
  const h=harness({db:c.db});h.store.setUser({uid:'owner_a'});
  const pending=h.store.dispatch(action(h.store.snapshot().state,'lead.save',lead()));
  h.store.setUser({uid:'owner_b'});release();
  await assert.rejects(pending,/account changed/i);
  assert.equal(h.store.snapshot().uid,'owner_b');
});

test('offline cloud cache cannot dispatch new outreach state',async()=>{
  const c=cloud(),h=harness({db:c.db});h.store.setUser({uid:'owner'});
  c.listeners.get('owner')({exists:false,metadata:{fromCache:true}});
  await assert.rejects(h.store.dispatch(action(h.store.snapshot().state,'lead.save',lead())),/confirmed cloud connection/);
  assert.equal(c.writes.length,0);
});

test('agent register is excluded from the blind-write general sync engine',()=>{
  const sync=require('../sync');
  assert.equal(sync.SYNC_KEYS.agentControl,undefined);
  assert.equal(sync.SYNC_KEYS.outreach,undefined);
  assert(!Object.values(sync.SYNC_KEYS).some(value=>value.lsKey===LOCAL));
});

test('both browser entry points load the outreach dependency before AgentControlModel',()=>{
  for(const name of ['crm/index.html','agent-control.html']){
    const html=fs.readFileSync(path.join(ROOT,name),'utf8'),outreach=html.indexOf('outreach-model.js'),agent=html.indexOf('agent-control-model.js');
    assert(outreach>=0&&agent>outreach,name+' resolves the model dependency in order');
  }
  const assets=require('../tools/build-crm.cjs').assets();
  assert(assets.some(asset=>asset.from==='crm/outreach-model.js'&&asset.to==='outreach-model.js'));
  assert(JSON.parse(fs.readFileSync(path.join(ROOT,'tools/app-assets.json'),'utf8')).includes('crm/outreach-model.js'));
});

test('a missing browser dependency cannot silently accept and overwrite existing outreach data',()=>{
  const box={URL,TextEncoder};vm.runInNewContext(fs.readFileSync(path.join(ROOT,'agent-control-model.js'),'utf8'),box);
  const legacy=box.AgentControlModel.initial();
  assert.doesNotThrow(()=>box.AgentControlModel.valid(legacy),'legacy data still opens without an invented migration');
  legacy.outreach={schema:1,routes:[],events:[]};
  const bytes=JSON.stringify(legacy);
  assert.throws(()=>box.AgentControlModel.valid(legacy),/support|missing|reload/i);
  assert.equal(JSON.stringify(legacy),bytes);
});

test('legacy schema, acquisition source and accepted exact-version QA survive outreach updates',()=>{
  let state=apply(A.initial(),'lead.save',lead('buyer_one',{channel:'referral'}));
  for(const [id,role,parentTaskId] of [['source','outreach',''],['quality','review','source']]){
    state=apply(state,'task.add',{id,title:'Synthetic '+id,role,brief:'Synthetic exact-version evidence',leadId:'buyer_one',...(parentTaskId?{parentTaskId}:{})});
    state=apply(state,'task.ready',{id});
    state=apply(state,'task.result',{id,result:'Synthetic reviewed version',sources:['https://integration.example.test/source'],...(role==='review'?{qualityVerdict:'pass',confirmCurrentSource:true}:{})});
  }
  const review=evidenceTaskId=>({actor:'coordinator',reviewer:'Synthetic Revenue',basis:'Synthetic independent exact-version Quality evidence',evidenceTaskId,checks:{evidence:'pass',arithmetic:'na',fit:'pass'}});
  state=apply(state,'task.accept',{id:'quality',note:'Recorded the supported verdict.',review:review('')});
  state=apply(state,'task.accept',{id:'source',note:'Accepted the independently checked version.',review:review('quality')});
  const tasks=JSON.stringify(state.tasks),leads=JSON.stringify(state.leads),revision=state.revision;
  state=permission(route(state),'granted');
  assert.equal(state.schema,1);assert.equal(state.revision,revision+2);
  assert.equal(JSON.stringify(state.tasks),tasks);assert.equal(JSON.stringify(state.leads),leads);
  assert.equal(state.leads[0].channel,'referral','delivery channel does not replace acquisition source');
  assert.equal(A.reviewEvidence(state,state.tasks[0]).length,1);
  assert.equal(F.matches(state.tasks[0],'review'),false);
  assert(!today(state).some(item=>item.kind==='task'),'accepted work does not reappear in Today');
  assert.equal(A.metrics(state,'2026-09').contribution,0);
});

test('lifetime revocation survives activity trimming, reload and a later recorded grant',()=>{
  let state=permission(routed());const original=JSON.stringify(state.outreach.events);
  for(let i=0;i<165;i++)state=apply(state,'pause',{});
  assert.equal(state.activity.length,150);assert.equal(JSON.stringify(state.outreach.events),original);
  state=permission(state,'granted');
  const data=storage();data.setItem(LOCAL,JSON.stringify(state));const reopened=harness({data}).store.snapshot().state;
  assert.equal(O.forLead(reopened,'buyer_one').routes[0].permissions.prospecting,'revoked');
  assert.equal(O.forLead(reopened,'buyer_one').suppressed,true);
  assert.equal(reopened.outreach.events.length,3,'revocation and later evidence both remain in history');
});

test('bad or missing journal events reject atomically instead of erasing evidence',()=>{
  const state=routed(),before=JSON.stringify(state);
  for(const corrupt of [null,{}, {schema:1,routes:[],events:[{id:'bad',type:'provider.execute',at:'2026-09-18T14:00:00Z',recordedBy:'Synthetic'}]}]){
    assert.throws(()=>A.valid({...state,outreach:corrupt}));
  }
  const missing=JSON.parse(before);missing.outreach.events=[];
  assert.throws(()=>A.valid(missing),/creation evidence/);
  assert.throws(()=>touch(state,{status:'received',direction:'outbound'}),/Inbound/);
  assert.throws(()=>touch(state,{providerRef:''}),/reference/);
  assert.equal(JSON.stringify(state),before);
});

test('the UTF-8 document cap rejects the whole save and retains the original revocation journal',async()=>{
  let state=permission(routed()),i=0;
  const bytes=()=>new TextEncoder().encode(JSON.stringify(state)).length;
  while(bytes()<690000){i++;state.leads.push(lead('padding_'+i,{website:'https://padding'+i+'.example.test',notes:'x'.repeat(4000)}));}
  state=apply(state,'task.add',{id:'size_boundary',title:'Existing bounded work',role:'analysis',brief:'x'});
  const task=state.tasks[state.tasks.length-1];task.brief+='y'.repeat(699500-bytes());A.valid(state);
  const original=JSON.stringify(state),journal=JSON.stringify(state.outreach),data=storage();data.setItem(LOCAL,original);
  const h=harness({data});
  await assert.rejects(h.store.dispatch(action(state,'outreach.channel.record',{channel:'sms',status:'pending',checkedOn:'2026-09-18',identity:'',evidence:'Observed provider setup notes: '+'z'.repeat(1900),blocker:'No verified transport',recordedBy:'Synthetic Revenue'})),/register is full/);
  assert.equal(data.getItem(LOCAL),original);assert.equal(JSON.stringify(h.store.snapshot().state.outreach),journal);
});

test('one account reply pauses other delivery channels and replaces stale follow-up guidance',()=>{
  let state=routed();
  state=apply(state,'lead.save',lead('buyer_two',{offer:'research',nextAction:'Send another proactive pitch',due:'2026-09-18'}));
  state=route(state,'route_two','buyer_two','sms','+12025550123');
  state=apply(state,'task.add',{id:'stale_send',title:'Send another proactive pitch',role:'outreach',leadId:'buyer_two',brief:'Historical prepared introduction',due:'2026-09-18'});
  state=apply(state,'task.ready',{id:'stale_send'});
  state=touch(state,{direction:'inbound',status:'received',replyKind:'human',purpose:'service'});
  assert.equal(O.forLead(state,'buyer_two').paused,true);
  assert.match(F.leadProgress(state.leads[1],state).now,/paused/i);
  const recommendations=today(state);
  assert(recommendations.some(item=>/reply|paused/i.test(item.name)));
  assert(!recommendations.some(item=>item.name==='Send another proactive pitch'));
  assert.equal(state.tasks[0].status,'ready','guidance does not erase the actual task record');
});

test('unknown outcome outranks routine reviews and never enables a transport',()=>{
  let state=touch(routed(),{status:'unknown',providerRef:'',occurredAt:'2026-09-18T14:00:00Z'});
  state=apply(state,'task.add',{id:'review_me',title:'Routine review',role:'analysis',brief:'Routine work'});
  state=apply(state,'task.ready',{id:'review_me'});state=apply(state,'task.result',{id:'review_me',result:'Synthetic result',sources:[]});
  const projection=O.forLead(state,'buyer_one');
  assert.equal(projection.unknown,true);assert.equal(projection.transportActive,false);
  assert.equal(projection.evaluation.allowed,false);assert.equal(today(state)[0].name,'Reconcile uncertain contact before retry');
  assert.match(F.leadProgress(state.leads[0],state).now,/uncertain/i);
});

test('broad suppression removes stale send recommendations but retains task and source histories',()=>{
  let state=routed();state=apply(state,'task.add',{id:'send_me',title:'Send another proactive pitch',role:'outreach',leadId:'buyer_one',brief:'Historical draft',due:'2026-09-18'});state=apply(state,'task.ready',{id:'send_me'});
  const task=JSON.stringify(state.tasks);
  state=apply(state,'outreach.suppression.record',{leadId:'buyer_one',scope:'account',reason:'Synthetic recipient requested no contact',evidence:'Synthetic opt-out receipt',recordedBy:'Synthetic Revenue'});
  assert.equal(F.leadProgress(state.leads[0],state).closed,true);
  assert(!today(state).some(item=>item.name==='Send another proactive pitch'));
  assert.match(F.taskMeaning(state.tasks[0],state).next,/suppress|contact|hold/i);
  assert.equal(JSON.stringify(state.tasks),task);
});

test('a parked sequence does not resurface as due work after a new month',()=>{
  let state=routed();state.leads[0].due='2026-09-01';state.leads[0].nextAction='Send a fourth introduction';
  for(const date of ['2026-09-01','2026-09-04','2026-09-10'])state=touch(state,{occurredAt:date+'T14:00:00Z'});
  assert.equal(O.forLead(state,'buyer_one',{now:'2026-10-19T14:00:00Z'}).parked,true);
  assert(!M.today({sites:[],leads:state.leads,tasks:[],followups:[],date:'2026-10-19',state}).some(item=>item.kind==='lead'));
});

test('adding a route does not reset legacy contact history or import email readiness into other channels',()=>{
  let state=apply(A.initial(),'lead.save',lead('buyer_one',{lastTouch:'2026-09-17',lastNote:'Synthetic historical contact receipt'}));
  state=route(state);
  assert(O.evaluate(state,{leadId:'buyer_one',now:'2026-09-18T15:00:00Z'}).blockers.some(item=>item.code==='legacy_reconcile'));
  state=touch(state);
  assert(!O.evaluate(state,{leadId:'buyer_one',now:'2026-09-18T15:00:00Z'}).blockers.some(item=>item.code==='legacy_reconcile'));
  state=apply(state,'outreach.readiness',{authority:'authorized',scope:'Synthetic existing email scope',authorityEvidence:'Synthetic standing scope reference',testType:'internal_self',sender:'verified',senderEvidence:'Synthetic internal sender test',reply:'verified',replyEvidence:'Synthetic reply test',footer:'verified',footerEvidence:'Synthetic company footer',checkedOn:'2026-09-18',recordedBy:'Synthetic Revenue'});
  const view=O.forLead(state,'buyer_one');
  assert(view.readiness.every(channel=>channel.transportActive===false));
  assert.equal(view.readiness.find(channel=>channel.channel==='sms').status,'not_configured');
  assert.equal(view.evaluation.allowed,false);
  assert(view.evaluation.blockers.some(item=>item.code==='qa_unverified'));
});

test('a later delivery receipt preserves original send day and follow-up cadence',()=>{
  let state=touch(routed(),{id:'first_send',occurredAt:'2026-09-17T14:00:00Z'});
  state=apply(state,'outreach.touch.update',{touchId:'first_send',status:'delivered',occurredAt:'2026-09-18T14:30:00Z',providerRef:'synthetic_delivery',evidence:'Synthetic provider delivery receipt',recordedBy:'Synthetic Revenue'});
  const view=O.forLead(state,'buyer_one',{now:'2026-09-18T15:00:00Z'});
  assert.equal(view.touches[0].status,'delivered');assert.equal(view.touches[0].occurredAt,'2026-09-17T14:00:00.000Z');
  assert.equal(view.evaluation.counters.outboundToday,0);
  assert.equal(view.evaluation.nextDueAt,'2026-09-22T13:00:00.000Z','three business days from Thursday first send, not Friday delivery');
});

test('a shared contact route across different accounts shares uncertain-send holds',()=>{
  let state=routed();state=apply(state,'lead.save',lead('second_company',{website:'https://second-company.example.test'}));
  state=route(state,'second_route','second_company','email','buyer@integration.example.test');
  state=touch(state,{status:'unknown',providerRef:''});
  assert.equal(O.forLead(state,'second_company').unknown,true);
  assert.throws(()=>O.valid(state.outreach,[]),/lead is missing/);
  const before=JSON.stringify(state);
  const changed=apply(state,'lead.save',lead('buyer_one',{website:'https://changed-company.example.test'}));
  assert(O.evaluate(changed,{leadId:'buyer_one'}).blockers.some(item=>item.code==='identity_changed'));
  assert.equal(JSON.stringify(state),before,'identity review never rewrites the original route permission');
});
