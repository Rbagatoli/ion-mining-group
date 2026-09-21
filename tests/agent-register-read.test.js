'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const A=require('../agent-control-model');
const ROOT=path.resolve(__dirname,'..'),clone=value=>JSON.parse(JSON.stringify(value));
const confirmed={fromCache:false,hasPendingWrites:false};
function fixture(id='original'){
  return A.reduce(A.initial(),{id:'event_'+id,type:'task.add',revision:0,at:'2026-09-21T09:00:00.000Z',payload:{id,title:'Synthetic '+id,role:'analysis',brief:'Synthetic register read only.'}});
}
function document(state,metadata=confirmed){return {exists:state!==null,data:()=>({data:state}),metadata};}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}

// Both adapters run unchanged against a fake owner-scoped Firestore reference.
// No Firebase SDK, credentials, network, timers or application UI is involved.
function harness({crm=false,database=true}={}){
  const callbacks=new Map(),failures=new Map(),reads=[],writes=[],storageWrites=[],events=new Map(),values=new Map();
  let nextRead=()=>document(fixture('fresh')),authCallback,authError,store;
  const localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem(key,value){storageWrites.push(key);values.set(key,String(value));}};
  const db={collection(name){assert.equal(name,'users');return {doc:owner=>({collection(name){assert.equal(name,'data');return {doc(name){
    assert.equal(name,'agentControl');return {
      onSnapshot(options,ok,bad){assert.equal(options.includeMetadataChanges,true);callbacks.set(owner,ok);failures.set(owner,bad);return()=>{};},
      get(options){reads.push({owner,options:clone(options)});return nextRead(owner);},
      set(){writes.push('set');throw Error('Unexpected write');}
    };
  }};}})};},runTransaction(){writes.push('transaction');throw Error('Unexpected transaction');}};
  const empty={reset(){},list:()=>[],pending:()=>[]};
  const box={console,TextEncoder,URL,Map,Set,localStorage,navigator:{},AgentControlModel:A,
    addEventListener(name,fn){if(!events.has(name))events.set(name,[]);events.get(name).push(fn);},removeEventListener(){},
    fetch(){throw Error('Unexpected real request');},
    SiteData:{KEY:'sites',list:()=>[]},CrmContacts:{...empty,KEY:'contacts'},CrmFollowups:{...empty,KEY:'followups'},CrmLog:{...empty,KEY:'log'},CrmConfig:{...empty,KEY:'config',publish(){}},
    SyncEngine:{stopAll(){},switchAccount(){},listen(){},SYNC_KEYS:{}},ProtonCrmModel:require('../crm/crm-model')
  };
  box.window=box;vm.createContext(box);
  const run=file=>vm.runInContext(fs.readFileSync(path.join(ROOT,file),'utf8'),box,{filename:file});
  run('agent-control-store.js');
  let data;
  if(crm){
    box.firebase={firestore:()=>db,auth:()=>({onAuthStateChanged(ok,bad){authCallback=ok;authError=bad;}})};
    const create=box.AgentControlStore.create;box.AgentControlStore.create=options=>(store=create(options));
    run('crm/crm-data.js');data=box.ProtonCrmData.create();
  }else store=box.AgentControlStore.create({db:database?db:null,storage:localStorage});
  return {store,data,reads,writes,storageWrites,values,
    auth:owner=>crm?authCallback(owner?{uid:owner}:null):store.setUser(owner?{uid:owner}:null),
    authFail:()=>authError(Error('Synthetic auth failure')),
    listen:(owner,state=fixture(),metadata=confirmed)=>callbacks.get(owner)(document(state,metadata)),
    fail:owner=>failures.get(owner)({code:'unavailable'}),
    read:fn=>{nextRead=fn;},event:(name,event)=>{for(const fn of events.get(name)||[])fn(event);}
  };
}
function connect(h,owner='owner_a'){h.auth(owner);h.listen(owner);}
function noWrites(h){assert.deepEqual(h.writes,[]);}

test('store reads the exact owner document from server without changing listener state or emitting',async()=>{
  const h=harness();connect(h);let emissions=0;h.store.subscribe(()=>emissions++);
  const prior=h.store.snapshot(),raw=h.store.raw(),fresh=fixture('fresh');h.read(()=>document(fresh));
  const result=await h.store.readServer();
  assert.deepEqual(h.reads,[{owner:'owner_a',options:{source:'server'}}]);
  assert.equal(result.uid,'owner_a');assert.equal(result.serverConfirmed,true);assert(Number.isFinite(Date.parse(result.observedAt)));
  assert.deepEqual(clone(result.state),fresh);assert.equal(h.store.snapshot().state,prior.state);assert.equal(h.store.raw(),raw);
  assert.equal(h.store.snapshot().lastServerConfirmedAt,prior.lastServerConfirmedAt);assert.equal(emissions,1);
  result.state.tasks[0].title='Changed returned object';assert.equal(fresh.tasks[0].title,'Synthetic fresh');
  assert.equal(h.store.snapshot().state.tasks[0].title,'Synthetic original');assert.deepEqual(h.storageWrites,[]);noWrites(h);
});

test('confirmed server absence returns the model initial state without creating a document',async()=>{
  const h=harness();connect(h);h.read(()=>document(null));
  assert.deepEqual(clone((await h.store.readServer()).state),A.initial());noWrites(h);
});

test('store rejects anonymous, disconnected, unconfirmed and errored listener states before any request',async t=>{
  const scenarios={
    anonymous:h=>{},'no database':h=>h.auth('owner_a'),connecting:h=>h.auth('owner_a'),
    cached:h=>{connect(h);h.listen('owner_a',fixture(),{...confirmed,fromCache:true});},
    pending:h=>{connect(h);h.listen('owner_a',fixture(),{...confirmed,hasPendingWrites:true});},
    'missing metadata':h=>{connect(h);h.listen('owner_a',fixture(),{});},
    error:h=>{connect(h);h.fail('owner_a');}
  };
  for(const [name,setup] of Object.entries(scenarios))await t.test(name,async()=>{
    const h=harness({database:name!=='no database'});setup(h);await assert.rejects(h.store.readServer(),/confirmed signed-in/);assert.equal(h.reads.length,0);noWrites(h);
  });
});

test('store rejects cached, pending, malformed and invalid server responses without changing its snapshot',async t=>{
  const cases={cached:()=>document(fixture(),{...confirmed,fromCache:true}),pending:()=>document(fixture(),{...confirmed,hasPendingWrites:true}),
    'missing metadata':()=>document(fixture(),{}),malformed:()=>({metadata:confirmed}),invalid:()=>document({broken:true}),
    unavailable:()=>Promise.reject(Error('Synthetic backend failure'))};
  for(const [name,response] of Object.entries(cases))await t.test(name,async()=>{
    const h=harness();connect(h);const before=JSON.stringify(h.store.snapshot());h.read(response);
    await assert.rejects(h.store.readServer());assert.equal(JSON.stringify(h.store.snapshot()),before);assert.equal(h.reads.length,1);noWrites(h);
  });
});

test('store discards delayed reads after account changes, same-UID reauthentication, sign-out or destroy',async t=>{
  for(const change of ['owner_b','owner_a',null,'destroy'])await t.test(String(change),async()=>{
    const h=harness();connect(h);const d=deferred();h.read(()=>d.promise);const pending=h.store.readServer();
    if(change==='destroy')h.store.destroy();else h.auth(change);
    d.resolve(document(fixture('late')));await assert.rejects(pending,/account changed/);noWrites(h);
  });
});

test('store does not confirm an otherwise valid read after listener becomes pending or unavailable',async t=>{
  for(const change of ['pending','cached','error'])await t.test(change,async()=>{
    const h=harness();connect(h);const d=deferred();h.read(()=>d.promise);const pending=h.store.readServer();
    if(change==='error')h.fail('owner_a');else h.listen('owner_a',fixture(),{fromCache:change==='cached',hasPendingWrites:change==='pending'});
    d.resolve(document(fixture('late')));await assert.rejects(pending,/confirmed signed-in/);noWrites(h);
  });
});

test('CRM read adapter adds current account epoch and preserves all listener and write-tracking state',async()=>{
  const h=harness({crm:true});connect(h);const before=JSON.stringify(h.data.status()),safety=JSON.stringify(h.data.reloadSafety()),writes=h.storageWrites.length;
  let emissions=0;h.data.subscribe(()=>emissions++);const result=await h.data.readAgentRegister();
  assert.equal(result.uid,'owner_a');assert.equal(result.epoch,h.data.status().epoch);assert.equal(result.serverConfirmed,true);
  assert.equal(result.state.tasks[0].id,'fresh');assert(Number.isFinite(Date.parse(result.observedAt)));
  assert.equal(JSON.stringify(h.data.status()),before);assert.equal(JSON.stringify(h.data.reloadSafety()),safety);
  assert.equal(emissions,0);assert.equal(h.storageWrites.length,writes);assert.deepEqual(h.reads,[{owner:'owner_a',options:{source:'server'}}]);noWrites(h);
});

test('CRM adapter rejects unsettled auth, signed-out and invalid local stores without a read',async t=>{
  const cases={unsettled:h=>{},anonymous:h=>h.auth(null),authError:h=>{connect(h);h.authFail();},
    invalidRecords:h=>{connect(h);h.values.set('sites','{invalid');}};
  for(const [name,setup] of Object.entries(cases))await t.test(name,async()=>{
    const h=harness({crm:true});setup(h);await assert.rejects(h.data.readAgentRegister(),/confirmed signed-in CRM/);assert.equal(h.reads.length,0);noWrites(h);
  });
});
test('unrelated record sync errors do not block a fresh confirmed task-register read or clear their hold',async()=>{
  const h=harness({crm:true});connect(h);h.event('proton:sync-status',{detail:{key:'sites',state:'error',reason:'Synthetic pending sync'}});
  assert.ok(h.data.status().syncError);const result=await h.data.readAgentRegister();assert.equal(result.serverConfirmed,true);
  assert.ok(h.data.status().syncError);assert.equal(h.reads.length,1);noWrites(h);
});

test('CRM adapter rejects reads after its own cross-window epoch changes even when store account did not change',async()=>{
  const h=harness({crm:true});connect(h);const d=deferred();h.read(()=>d.promise);const pending=h.data.readAgentRegister();
  h.event('storage',{key:'protonMiningLastUid',newValue:'owner_b'});assert.equal(h.store.snapshot().uid,'owner_a');
  d.resolve(document(fixture('late')));await assert.rejects(pending,/account changed/);noWrites(h);
});

test('CRM adapter rejects same-account reauthentication during a read and can read in the new epoch',async()=>{
  const h=harness({crm:true});connect(h);const epoch=h.data.status().epoch,d=deferred();h.read(()=>d.promise);const pending=h.data.readAgentRegister();
  connect(h);d.resolve(document(fixture('late')));await assert.rejects(pending,/account changed/);
  h.read(()=>document(fixture('new_epoch')));const result=await h.data.readAgentRegister();assert(result.epoch>epoch);assert.equal(result.state.tasks[0].id,'new_epoch');noWrites(h);
});

test('CRM adapter read failures never create uncertain writes or publish an unconfirmed register',async()=>{
  const h=harness({crm:true});connect(h);const before=JSON.stringify(h.data.status()),safety=JSON.stringify(h.data.reloadSafety());
  h.read(()=>document(fixture('unconfirmed'),{...confirmed,hasPendingWrites:true}));await assert.rejects(h.data.readAgentRegister(),/cached or pending/);
  assert.equal(JSON.stringify(h.data.status()),before);assert.equal(JSON.stringify(h.data.reloadSafety()),safety);noWrites(h);
});
