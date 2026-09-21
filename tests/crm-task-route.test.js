'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const A=require('../agent-control-model');
const ROOT=path.resolve(__dirname,'..'),LOCAL='protonAgentControlLocal_v1';
class TestDate extends Date {constructor(...args){super(...(args.length?args:['2026-09-20T09:00:00Z']));}static now(){return Date.parse('2026-09-20T09:00:00Z');}}
let sequence=0;
function apply(state,type,payload){return A.reduce(state,{id:'route_test_'+(++sequence),at:'2026-09-20T08:00:00Z',revision:state.revision,type,payload});}
function fixture(title='Synthetic owner A task',id='source'){
  return apply(A.initial(),'task.add',{id,title,role:'analysis',brief:'Synthetic task-route evidence only.'});
}
function reviewFixture(){
  let state=fixture();state=apply(state,'task.ready',{id:'source'});
  state=apply(state,'task.result',{id:'source',result:'Synthetic exact source result.',sources:['https://example.test/source']});
  state=apply(state,'task.add',{id:'qa',parentTaskId:'source',role:'review',title:'Synthetic independent review',brief:'Review the exact source.'});
  return apply(state,'task.ready',{id:'qa'});
}

// This is an entrypoint/lifecycle test, not a browser-layout test. The DOM stub only
// supplies the dialog, form, and event contracts used by the unchanged CRM script.
// All account/store transitions execute the actual adapters; no network exists.
function harness({hash='#team/task/source',local=A.initial(),firebase=true,holdTransactions=false,holdSettlement=false}={}){
  const elements=new Map(),documentEvents=new Map(),windowEvents=new Map(),queue=[],snapshots=new Map(),writes=[];
  const storage=new Map([[LOCAL,JSON.stringify(local)]]);let authCallback,authError,currentUser=null,releaseRead,settleTransaction,transactionReads=0,releaseOptions;
  const decode=s=>s.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  function element(id){
    if(elements.has(id))return elements.get(id);
    const listeners=new Map(),attrs=new Map(),classes=new Set();let html='';
    const el={id,tagName:'DIV',open:false,hidden:false,disabled:false,readOnly:false,isConnected:true,value:'',textContent:'',dataset:{},children:[],scrollTop:0,scrollRequests:[],
      classList:{toggle(name,force){const next=force===undefined?!classes.has(name):force;if(next)classes.add(name);else classes.delete(name);return next;},contains:name=>classes.has(name),add:name=>classes.add(name),remove:name=>classes.delete(name)},
      setAttribute:(name,value)=>attrs.set(name,String(value)),getAttribute:name=>attrs.get(name),hasAttribute:name=>attrs.has(name),
      addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);},
      async emit(name,event={}){for(const fn of listeners.get(name)||[])await fn({target:el,currentTarget:el,preventDefault(){},...event});},
      focus(options){document.activeElement=el;el.focusOptions=options;},scrollIntoView(options){el.scrollRequests.push(options);},showModal(){el.open=true;},close(){el.open=false;},
      querySelector(selector){if(selector==='[type=submit]')return element('submitButton');if(selector==='[value=accept]')return element(id+'_accept');return null;},
      querySelectorAll(selector){return selector==='input,select,textarea'?[...elements.values()].filter(item=>/^(INPUT|SELECT|TEXTAREA)$/.test(item.tagName)):[];},
      matches(){return false;},closest(){return null;}
    };
    Object.defineProperty(el,'innerHTML',{get:()=>html,set:value=>{
      html=String(value);
      for(const match of html.matchAll(/<(input|select|textarea|form|div|button)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){
        const child=element(match[3]);child.tagName=match[1].toUpperCase();
        const name=match[2].match(/\bname="([^"]*)"/),val=match[2].match(/\bvalue="([^"]*)"/),type=match[2].match(/\btype="([^"]*)"/);
        if(name)child.name=decode(name[1]);if(type)child.type=type[1];
        if(val)child.value=decode(val[1]);
        if(match[1]==='textarea'){const tail=html.slice(match.index+match[0].length);child.value=decode(tail.slice(0,tail.indexOf('</textarea>')));}
      }
    }});
    elements.set(id,el);return el;
  }
  const document={body:element('body'),activeElement:null,getElementById:element,contains:el=>el?.isConnected,
    addEventListener(name,fn){if(!documentEvents.has(name))documentEvents.set(name,[]);documentEvents.get(name).push(fn);}};
  let currentHash=hash;
  const location={hostname:'synthetic.example.test',get hash(){return currentHash;},set hash(value){if(value===currentHash)return;currentHash=value;queue.push(()=>{for(const fn of windowEvents.get('hashchange')||[])fn();});},get href(){return 'https://synthetic.example.test/crm/'+currentHash;}};
  const noRecords={reset(){},list(){return[];},pending(){return[];}};
  const db={collection(name){assert.equal(name,'users');return {doc(uid){return {collection(collection){assert.equal(collection,'data');return {doc(key){assert.equal(key,'agentControl');return {uid,onSnapshot(options,ok,error){snapshots.set(uid,{ok,error});return()=>{};}};}};}};}};},
    async runTransaction(fn){
      if(!holdTransactions)throw Error('This test must not attempt account writes.');
      await fn({get(){transactionReads++;return new Promise(resolve=>{releaseRead=state=>resolve({exists:true,data:()=>({data:state})});});},set(ref,value){writes.push({uid:ref.uid,value});}});
      if(holdSettlement)await new Promise((resolve,reject)=>{settleTransaction=error=>error?reject(error):resolve();});
    }};
  const box={console,URL,TextEncoder,Date:TestDate,Map,Set,crypto:require('node:crypto').webcrypto,navigator:{},document,location,HTMLElement:class {},
    fetch:async()=>{throw Error('Unexpected network request from the task-route harness.');},
    requestAnimationFrame:fn=>queue.push(fn),setTimeout:()=>1,clearTimeout(){},
    localStorage:{getItem:key=>storage.has(key)?storage.get(key):null,setItem:(key,value)=>storage.set(key,String(value))},
    addEventListener(name,fn){if(!windowEvents.has(name))windowEvents.set(name,[]);windowEvents.get(name).push(fn);},removeEventListener(){},
    FormData:class {constructor(){this.rows=[...elements.values()].filter(el=>el.name&&!el.disabled).map(el=>[el.name,el.value]);}[Symbol.iterator](){return this.rows[Symbol.iterator]();}},
    AgentControlModel:A,ProtonCrmModel:require('../crm/crm-model'),ProtonCrmWorkflow:require('../crm/workflow'),ProtonGrokTeam:require('../crm/grok-team'),ProtonCrmSourcing:require('../crm/sourcing'),ProtonCrmEnergyScouting:require('../crm/energy-scouting'),ProtonCrmOutreach:require('../crm/outreach-model'),
    SiteData:{KEY:'sites',list:()=>[]},CrmContacts:{...noRecords,KEY:'contacts'},CrmFollowups:{...noRecords,KEY:'followups',today:()=> '2026-09-20'},CrmLog:{...noRecords,KEY:'log'},CrmConfig:{...noRecords,KEY:'config',publish(){},stageLabel:value=>value},
    SyncEngine:{stopAll(){},switchAccount(){},listen(){},SYNC_KEYS:{}},
    ProtonCrmDiscovery:{create:()=>({unmount(){},collapseDetail(){},mount(){},html:()=>'',brief:()=>null})},
    ProtonCrmControl:{render:()=>'',recentWork:()=>'',watchFreshness:()=>()=>{}},
    ProtonCrmRelease:{start(options){releaseOptions=options;return {restore(){}};}},
    ProtonAuth:{getUser:()=>currentUser}
  };
  if(firebase)box.firebase={firestore:()=>db,auth:()=>({onAuthStateChanged(fn,error){authCallback=fn;authError=error;}})};
  box.window=box;vm.createContext(box);
  const run=file=>vm.runInContext(fs.readFileSync(path.join(ROOT,file),'utf8'),box,{filename:file});
  run('site/intake-config.js');run('crm/sourcing-model.js');run('crm/intake-inbox.js');
  run('agent-control-store.js');run('crm/crm-data.js');
  let data;const create=box.ProtonCrmData.create;box.ProtonCrmData.create=()=>{data=create();return data;};
  run('crm/crm.js');
  function flush(){for(let limit=0;queue.length;limit++){assert(limit<100,'event queue did not settle');queue.shift()();}}
  const h={el:element,location,writes,data,storage,flush,releaseOptions:()=>releaseOptions,title:()=>element('sheetTitle').textContent,body:()=>element('sheetBody').innerHTML,isOpen:()=>element('sheet').open,focused:()=>document.activeElement,
    transactionReads:()=>transactionReads,releaseRead:state=>releaseRead(state),settleTransaction:error=>settleTransaction(error),
    auth(uid){currentUser=uid?{uid,email:uid+'@example.test'}:null;authCallback(currentUser);flush();},
    authFail(){authError(Error('Synthetic authentication failed.'));flush();},
    snapshot(uid,state=A.initial(),{cache=false,exists=true,pending=false}={}){snapshots.get(uid).ok({exists,data:()=>({data:state}),metadata:{fromCache:cache,hasPendingWrites:pending}});flush();},
    storeFail(uid){snapshots.get(uid).error({code:'permission-denied'});flush();},
    go(value){location.hash=value;flush();},
    close(){element('sheetClose').onclick();flush();},
    async escape(){await element('sheet').emit('cancel');flush();},
    async click(action,id=''){const target={dataset:{action,id},closest:selector=>selector==='[data-action]'?target:null};for(const fn of documentEvents.get('click')||[])await fn({target,button:0,preventDefault(){}});flush();assert.equal(element('sheetError').hidden,true,element('sheetError').textContent);},
    async link(value,modifiers={}){let prevented=false;const target={closest:selector=>selector==='a[href]'?target:null,getAttribute:name=>name==='href'?value:null};for(const fn of documentEvents.get('click')||[])await fn({target,button:0,preventDefault(){prevented=true;},...modifiers});flush();return prevented;}
  };
  flush();return h;
}
function opened(h,title='Synthetic owner A task'){
  assert.equal(h.isOpen(),true);assert.equal(h.title(),'Team assignment');assert.match(h.body(),new RegExp(title));
}
function waiting(h){assert.equal(h.isOpen(),true);assert.equal(h.title(),'Opening task');assert.doesNotMatch(h.body(),/no longer|not found/i);}
function attention(h){assert.equal(h.isOpen(),true);assert.equal(h.title(),'Task connection needs attention');assert.doesNotMatch(h.body(),/no longer|not found/i);}
function focusedError(h){
  const alert=h.el('sheetError');assert.equal(alert.hidden,false);assert.equal(h.focused(),alert);assert.equal(alert.tabIndex,-1);
  assert.deepEqual({...alert.focusOptions},{preventScroll:true});
  assert.deepEqual({...alert.scrollRequests.at(-1)},{block:'nearest',inline:'nearest',behavior:'instant'});
}

test('automatic release activation requires settled browsing and preserves forms and account boundaries',async()=>{
  const h=harness({hash:'#pipeline'}),update=h.releaseOptions();
  assert.equal(update.getAccountKey(),null);assert.equal(update.isSafeToReload(),false);
  h.auth('owner_a');assert.equal(update.isSafeToReload(),false);
  h.snapshot('owner_a',fixture());assert.equal(update.getAccountKey(),'owner_a');assert.equal(update.isSafeToReload(),true);
  h.snapshot('owner_a',fixture(),{pending:true});assert.equal(update.isSafeToReload(),false);
  h.snapshot('owner_a',fixture(),{cache:true});assert.equal(update.isSafeToReload(),false);
  h.snapshot('owner_a',fixture());await h.click('new-task');h.el('f_title').value='Retained unsaved title';
  assert.equal(update.isSafeToReload(),false);assert.equal(h.el('f_title').value,'Retained unsaved title');
  h.close();assert.equal(update.isSafeToReload(),true);
  h.auth('owner_b');assert.equal(update.isSafeToReload(),false);
  h.snapshot('owner_b',fixture());assert.equal(update.getAccountKey(),'owner_b');assert.equal(update.isSafeToReload(),true);
  assert.equal(h.writes.length,0);
});

test('a read-only rejected lead snapshot can update its validator without accepting or replacing records',()=>{
  const h=harness({hash:'#pipeline'});h.auth('owner_a');const state=fixture();h.snapshot('owner_a',state);
  const invalid=apply(state,'lead.save',{id:'lead_12345678-1234-4234-8234-123456789abc',company:'Synthetic only',website:'https://example.test/fixture',offer:'custom_search',channel:'direct',stage:'discovered'});invalid.leads[0].offer='unsupported_fixture';
  h.snapshot('owner_a',invalid);assert.equal(h.data.status().agent.mode,'error');assert.equal(h.data.agent().revision,state.revision);
  assert.equal(h.releaseOptions().isSafeToReload(),true);assert.equal(h.writes.length,0);
  h.storeFail('owner_a');assert.equal(h.releaseOptions().isSafeToReload(),false);
});

test('initial task link waits for resolved auth and a delayed server register, preserving exact ID',()=>{
  const h=harness({local:fixture('Anonymous task must not flash')});waiting(h);
  h.auth('owner_a');waiting(h);assert.equal(h.data.status().ready,true);assert.equal(h.data.status().agent.mode,'connecting');
  let state=fixture('Wrong task','different');state=apply(state,'task.add',{id:'source',title:'Exact requested cloud task',role:'analysis',brief:'Synthetic exact ID.'});
  h.snapshot('owner_a',state);opened(h,'Exact requested cloud task');assert.doesNotMatch(h.body(),/Anonymous task must not flash|Wrong task/);assert.equal(h.writes.length,0);
});
test('initial anonymous auth opens only its settled local register',()=>{
  const h=harness({local:fixture('Synthetic anonymous task')});waiting(h);h.auth(null);opened(h,'Synthetic anonymous task');
});
test('task navigation after auth still waits while the separate agent store is connecting',()=>{
  const h=harness({hash:'#team'});h.auth('owner_a');assert.equal(h.data.status().ready,true);assert.equal(h.data.status().agent.mode,'connecting');h.go('#team/task/source');waiting(h);h.snapshot('owner_a',fixture());opened(h);
});
test('no-auth offline preview opens its local task without waiting for Firebase',()=>{
  const h=harness({firebase:false,local:fixture()});opened(h);
});
test('cache-only absence and cloud errors are connection states, not missing-record evidence',()=>{
  const h=harness();h.auth('owner_a');h.snapshot('owner_a',A.initial(),{cache:true,exists:false});attention(h);
  h.storeFail('owner_a');attention(h);h.snapshot('owner_a',fixture());opened(h);
});
test('authentication errors do not label a task missing',()=>{
  const h=harness();h.authFail();attention(h);
});
test('a cache-only task is not exposed as a confirmed account task',()=>{
  const h=harness();h.auth('owner_a');h.snapshot('owner_a',fixture('Unconfirmed cached task'),{cache:true});attention(h);assert.doesNotMatch(h.body(),/Unconfirmed cached task/);h.snapshot('owner_a',fixture());opened(h);
});
test('malformed cloud and local registers show a connection/recovery state instead of missing',()=>{
  const cloud=harness();cloud.auth('owner_a');cloud.snapshot('owner_a',{invalid:'Synthetic corrupt register'});attention(cloud);
  const local=harness({firebase:false,local:{invalid:'Synthetic corrupt register'}});attention(local);
});
test('missing task is unavailable only after a settled server or anonymous register',()=>{
  const cloud=harness();waiting(cloud);cloud.auth('owner_a');waiting(cloud);cloud.snapshot('owner_a',A.initial(),{exists:false});
  assert.equal(cloud.title(),'Task unavailable');assert.match(cloud.body(),/not found|unavailable/i);assert.doesNotMatch(cloud.body(),/no longer/i);
  const local=harness();waiting(local);local.auth(null);assert.equal(local.title(),'Task unavailable');
});
test('switching account while loading cancels the bound request and ignores late old-owner snapshots',()=>{
  const h=harness();h.auth('owner_a');waiting(h);h.auth('owner_b');
  h.snapshot('owner_a',fixture());h.snapshot('owner_b',fixture('Other owner same ID'));assert.equal(h.isOpen(),false);
  assert.equal(h.data.status().uid,'owner_b');assert.equal(h.data.agent().tasks[0].title,'Other owner same ID');assert.equal(h.writes.length,0);
});
test('switching account closes an already loaded task without reopening it under the new owner',()=>{
  const h=harness();h.auth('owner_a');h.snapshot('owner_a',fixture());opened(h);h.auth('owner_b');h.snapshot('owner_b',fixture('Other owner same ID'));assert.equal(h.isOpen(),false);
});
test('a new account epoch invalidates the prior request even when the UID repeats',()=>{
  const h=harness();h.auth('owner_a');waiting(h);h.auth('owner_a');h.snapshot('owner_a',fixture());assert.equal(h.isOpen(),false);
});
test('closing or escaping a loading task cancels deferred opening',async()=>{
  for(const method of ['close','escape']){const h=harness();h.auth('owner_a');await h[method]();h.snapshot('owner_a',fixture());assert.equal(h.isOpen(),false);assert.equal(h.location.hash,'#team');}
});
test('navigation cancels the old task and a later task route wins before hydration',()=>{
  const h=harness();h.auth('owner_a');h.go('#settings');h.snapshot('owner_a',fixture());assert.equal(h.isOpen(),false);
  const other=harness();other.auth('owner_a');other.go('#team/task/second');let state=fixture();state=apply(state,'task.add',{id:'second',title:'Second requested task',role:'analysis',brief:'Synthetic next link.'});other.snapshot('owner_a',state);opened(other,'Second requested task');assert.doesNotMatch(other.body(),/Synthetic owner A task/);
});
test('an unrelated modal or draft is not replaced by a pending task snapshot',async()=>{
  const account=harness();account.auth('owner_a');await account.click('account');assert.equal(account.title(),'Your Proton account');account.snapshot('owner_a',fixture());assert.equal(account.title(),'Your Proton account');
  const draft=harness();draft.auth('owner_a');await draft.click('new-task');draft.el('f_title').value='Retained synthetic draft';draft.snapshot('owner_a',fixture());assert.equal(draft.title(),'New assignment');assert.equal(draft.el('f_title').value,'Retained synthetic draft');
});
test('same-hash open-task action explicitly reopens a dismissed panel',async()=>{
  const h=harness({firebase:false,local:fixture()});opened(h);h.el('sheet').close();assert.equal(h.location.hash,'#team/task/source');await h.click('open-task','source');opened(h);
});
test('same-hash ordinary task links reopen the panel, while modified clicks keep browser behavior',async()=>{
  const h=harness({firebase:false,local:fixture()});opened(h);h.el('sheet').close();assert.equal(await h.link('#team/task/source'),true);opened(h);
  for(const modifier of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{button:1},{defaultPrevented:true}]){
    h.el('sheet').close();assert.equal(await h.link('#team/task/source',modifier),false);assert.equal(h.isOpen(),false);
  }
});
test('account change during an ordinary task form prevents later hydration from reopening it',async()=>{
  const h=harness();h.auth('owner_a');h.snapshot('owner_a',fixture());await h.click('task-routing','source');assert.equal(h.title(),'Record task routing');h.auth('owner_b');h.snapshot('owner_b',fixture('Other owner same ID'));assert.equal(h.isOpen(),false);assert.equal(h.writes.length,0);
});
test('account change preserves and freezes the completed-review draft instead of replacing it',async()=>{
  const h=harness();h.auth('owner_a');h.snapshot('owner_a',reviewFixture());await h.click('task-completed-review','source');assert.equal(h.title(),'Record completed team review');h.el('f_qaId').value='qa';
  h.auth('owner_b');h.snapshot('owner_b',fixture('Other owner same ID'));assert.equal(h.isOpen(),true);assert.equal(h.title(),'Record completed team review');assert.match(h.el('completedReviewNotice').innerHTML,/original workspace|original account/i);assert.equal(h.el('submitButton').disabled,true);assert.match(h.el('f_retainedDraft').value,/owner_a/);assert.equal(h.writes.length,0);
});
test('a pending completed-review save retains original fields, versions and receipt across account switches and late callbacks',async()=>{
  const state=reviewFixture(),h=harness({holdTransactions:true});h.auth('owner_a');h.snapshot('owner_a',state);await h.click('task-completed-review','source');
  h.el('f_qaId').value='qa';await h.el('f_qaId').emit('change');
  const fields={qaId:'qa',qaResult:'Actual synthetic independent finding.',qaSources:'https://example.test/qa',originalReviewer:'Independent synthetic reviewer',reviewedAt:'2026-09-20T07:45:00Z',originalEvidence:'Synthetic original artifact',verdict:'pass',independent:'on',confirmCurrentSource:'on',recordedBy:'Synthetic Revenue',decision:'accept'};
  for(const prefix of ['qa','source'])Object.assign(fields,{[prefix+'Basis']:'Synthetic independently checked basis.',[prefix+'Evidence']:'pass',[prefix+'Arithmetic']:'na',[prefix+'Fit']:'pass',[prefix+'Note']:'Synthetic decision notes.'});
  for(const [name,value] of Object.entries(fields)){const el=h.el('f_'+name);el.name=name;el.value=value;el.tagName='INPUT';}
  const submitted=h.el('editForm').emit('submit');await Promise.resolve();
  assert.equal(h.transactionReads(),1,h.el('sheetError').textContent);
  h.auth('owner_b');
  const retained=JSON.parse(h.el('f_retainedDraft').value);
  assert.equal(retained.account,'owner_a');assert.equal(retained.boardRevision,state.revision);assert.equal(retained.sourceVersion,A.resultVersion(state.tasks.find(t=>t.id==='source')));assert.equal(retained.qaVersion,0);
  for(const [name,value] of Object.entries(fields))assert.equal(retained.fields[name],value,name+' retained');
  assert.equal(retained.pendingRequest.closeoutId,retained.closeoutId);assert.equal(retained.pendingRequest.sourceId,'source');assert.equal(retained.pendingRequest.qaId,'qa');
  const frozen=h.el('f_retainedDraft').value;
  h.snapshot('owner_b',fixture('Other owner same ID'));h.snapshot('owner_a',state);h.releaseRead(state);await submitted;h.flush();
  assert.equal(h.isOpen(),true);assert.equal(h.title(),'Record completed team review');assert.equal(h.el('submitButton').disabled,true);assert.equal(h.el('checkCompletedReceipt').disabled,true);assert.equal(h.el('f_retainedDraft').value,frozen);assert.equal(h.writes.length,0);assert.equal(h.data.status().uid,'owner_b');
  focusedError(h);
  await h.el('checkCompletedReceipt').emit('click');assert.equal(h.el('f_retainedDraft').value,frozen);assert.equal(h.title(),'Record completed team review');assert.equal(h.writes.length,0);
});

for(const outcome of ['confirm-before-settlement','resolve-before-confirmation','reject-before-confirmation'])test('completed review only confirms persisted receipt after transaction settlement: '+outcome,async()=>{
  const state=reviewFixture(),h=harness({holdTransactions:true,holdSettlement:true});h.auth('owner_a');h.snapshot('owner_a',state);await h.click('task-completed-review','source');
  h.el('f_qaId').value='qa';await h.el('f_qaId').emit('change');
  const fields={qaId:'qa',qaResult:'Actual synthetic independent finding.',qaSources:'https://example.test/qa',originalReviewer:'Independent synthetic reviewer',reviewedAt:'2026-09-20T07:45:00Z',originalEvidence:'Synthetic original artifact',verdict:'pass',independent:'on',confirmCurrentSource:'on',recordedBy:'Synthetic Revenue',decision:'accept'};
  for(const prefix of ['qa','source'])Object.assign(fields,{[prefix+'Basis']:'Synthetic independently checked basis.',[prefix+'Evidence']:'pass',[prefix+'Arithmetic']:'na',[prefix+'Fit']:'pass',[prefix+'Note']:'Synthetic decision notes.'});
  for(const [name,value] of Object.entries(fields)){const el=h.el('f_'+name);el.name=name;el.value=value;el.tagName='INPUT';}
  const submitted=h.el('editForm').emit('submit');await Promise.resolve();h.releaseRead(state);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.writes.length,1);const receiptState=h.writes[0].value.data;
  h.snapshot('owner_a',receiptState,{pending:true});
  assert.equal(h.title(),'Record completed team review');assert.equal(h.data.status().agent.serverConfirmed,false);
  await h.el('checkCompletedReceipt').emit('click');assert.match(h.el('completedReviewNotice').textContent,/still in progress/);
  if(outcome==='confirm-before-settlement'){
    h.snapshot('owner_a',receiptState);assert.equal(h.title(),'Record completed team review');
    h.settleTransaction();await submitted;h.flush();
  }else{
    h.settleTransaction(outcome==='reject-before-confirmation'?Error('Synthetic transaction rejected'):null);await submitted;h.flush();
    assert.equal(h.title(),'Record completed team review');
    if(outcome==='reject-before-confirmation'){assert.match(h.el('sheetError').textContent,/Synthetic transaction rejected/);focusedError(h);}
    await h.el('checkCompletedReceipt').emit('click');assert.equal(h.title(),'Record completed team review');
    for(const [name,value] of Object.entries(fields))assert.equal(h.el('f_'+name).value,value,name+' retained');
    h.snapshot('owner_a',receiptState,{cache:true});assert.equal(h.title(),'Record completed team review');
    h.snapshot('owner_a',receiptState);
  }
  assert.equal(h.title(),'Completed team review saved');assert.match(h.body(),/Saved in the connected account/);assert.equal(h.transactionReads(),1);
  assert.equal(h.writes.length,1);assert.equal(h.writes[0].uid,'owner_a');
});
