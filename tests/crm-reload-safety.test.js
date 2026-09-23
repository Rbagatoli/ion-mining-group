'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const A=require('../agent-control-model'),M=require('../crm/crm-model'),I=require('../crm/intake-inbox'),S=require('../crm/sourcing-model');
const clone=value=>JSON.parse(JSON.stringify(value));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function dataHarness({cloud=false}={}){
 const storage=new Map(),events=new Map(),listeners=[];let authCallback,dispatchGate=null,lockGate=null;
 let agentView={state:A.initial(),uid:null,mode:'local',serverConfirmed:false};
 const emit=()=>listeners.forEach(fn=>fn(agentView));
 const agent={snapshot:()=>agentView,subscribe:fn=>{listeners.push(fn);fn(agentView);},setUser:user=>{agentView={...agentView,uid:user?.uid||null,mode:user?'cloud':'local',serverConfirmed:!!user};emit();},raw:()=>JSON.stringify(agentView.state),dispatch:async()=>{if(dispatchGate)await dispatchGate.promise;}};
 const localStorage={getItem:key=>storage.has(key)?storage.get(key):null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
 const resettable={reset(){},list:()=>[],pending:()=>[]};
 const box={ProtonCrmModel:M,AgentControlStore:{create:()=>agent},SiteData:{...resettable,KEY:'sites'},CrmContacts:{...resettable,KEY:'contacts'},CrmFollowups:{...resettable,KEY:'followups'},CrmLog:{...resettable,KEY:'log'},CrmConfig:{...resettable,KEY:'config',publish(){}},SyncEngine:{stopAll(){},switchAccount(){},listen(){},SYNC_KEYS:{}},localStorage,navigator:{locks:{request:async(name,work)=>{if(lockGate)await lockGate.promise;return work();}}},crypto:require('node:crypto').webcrypto,Date,console,addEventListener:(name,fn)=>events.set(name,fn)};
 if(cloud)box.firebase={firestore:()=>({}),auth:()=>({onAuthStateChanged:fn=>{authCallback=fn;}})};box.window=box;vm.createContext(box);vm.runInContext(fs.readFileSync(path.join(__dirname,'../crm/crm-data.js'),'utf8'),box);
 const D=box.ProtonCrmData.create();
 return{D,storage,auth:uid=>authCallback(uid?{uid}:null),agent:fields=>{agentView={...agentView,...fields};emit();},dispatchGate:()=>dispatchGate=deferred(),lockGate:()=>lockGate=deferred(),emit:(name,event)=>events.get(name)?.(event)};
}
test('data reload safety is a read-only projection and distinguishes setup/session errors from a read-only validator failure',async()=>{
 const h=dataHarness({cloud:true});assert.equal(h.D.reloadSafety().safe,false);await h.auth('ownerA');const before=JSON.stringify([...h.storage]);assert(h.D.reloadSafety().safe);h.agent({mode:'error',serverConfirmed:false,validationIssue:{code:'unsupported_lead_field',field:'service'}});assert(h.D.reloadSafety().safe,'compatibility reload policy belongs to the caller');assert.equal(JSON.stringify([...h.storage]),before);assert(Object.isFrozen(h.D.reloadSafety()));
 h.emit('storage',{key:'protonMiningLastUid',newValue:'ownerB'});assert.equal(h.D.reloadSafety().safe,false);assert(h.D.reloadSafety().reasons.includes('workspace-not-ready'));
});
test('current-owner sync outbox blocks reload when pending, malformed or unreadable, without editing it',async()=>{
 const h=dataHarness({cloud:true});await h.auth('ownerA');h.storage.set('protonSyncOutbox:ownerB','{"sites":"other owner"}');assert(h.D.reloadSafety().safe);
 for(const value of ['{','null','[]','0','{"sites":"pending bytes"}']){h.storage.set('protonSyncOutbox:ownerA',value);assert.equal(h.D.reloadSafety().safe,false,value);assert.equal(h.storage.get('protonSyncOutbox:ownerA'),value);}
 h.storage.set('protonSyncOutbox:ownerA','{}');assert(h.D.reloadSafety().safe);h.storage.set('protonAccountSwitch','{"previousUid":"ownerA","nextUid":"ownerB"}');assert.equal(h.D.reloadSafety().safe,false);
});
test('a failed outbox persistence event holds reload after the local save settles, even without stored outbox bytes',async()=>{
 const h=dataHarness({cloud:true});await h.auth('ownerA');const before=JSON.stringify([...h.storage]);
 await h.D.write(()=>{h.emit('proton:sync-status',{detail:{key:'',state:'error',reason:'Pending changes could not be saved for retry.'}});h.emit('proton:sync-status',{detail:{key:'sites',state:'pending'}});return{ok:true};});
 assert.equal(h.D.reloadSafety().inFlight,0);assert.equal(h.storage.has('protonSyncOutbox:ownerA'),false);assert.equal(h.D.reloadSafety().safe,false);assert(h.D.reloadSafety().reasons.includes('record-sync-pending'));assert.match(h.D.status().syncError,/could not be saved for retry/);
 for(const key of ['contacts','sites',''])h.emit('proton:sync-status',{detail:{key,state:'saved'}});
 assert.equal(h.D.reloadSafety().safe,false,'even same-key completion cannot identify the global failed persistence operation');assert(h.D.reloadSafety().reasons.includes('record-sync-needs-attention'));assert.equal(h.D.reloadSafety().reasons.includes('record-sync-pending'),false);assert.equal(JSON.stringify([...h.storage]),before,'status tracking does not repair or mutate stored records');
 await h.auth('ownerB');h.emit('proton:sync-status',{detail:{key:'sites',state:'saved'}});assert.equal(h.D.reloadSafety().safe,false,'the global hold survives account changes');
});
test('pending sync holds clear only for the same store in the same account session',async()=>{
 const h=dataHarness({cloud:true});await h.auth('ownerA');const send=(key,state)=>h.emit('proton:sync-status',{detail:{key,state}});
 send('sites','pending');send('contacts','pending');assert.equal(h.D.reloadSafety().safe,false);assert.equal(h.D.status().syncError,'','pending is not reported as a failure');
 send('crmLog','saved');send('sites','saved');assert.equal(h.D.reloadSafety().safe,false,'a different pending store still needs confirmation');assert(h.D.reloadSafety().reasons.includes('record-sync-pending'));
 send('contacts','saved');assert(h.D.reloadSafety().safe);
});
test('unconfirmed sync holds survive account switches and cannot be cleared by a new session save',async()=>{
 const h=dataHarness({cloud:true});await h.auth('ownerA');const send=(key,state)=>h.emit('proton:sync-status',{detail:{key,state}});
 send('sites','pending');send('contacts','error');assert.match(h.D.status().syncError,/Record sync needs attention/,'missing event reasons still surface an error');
 await h.auth('ownerB');send('sites','saved');send('contacts','saved');assert.equal(h.D.reloadSafety().safe,false);assert(h.D.reloadSafety().reasons.includes('record-sync-pending'));assert.match(h.D.status().syncError,/Record sync needs attention/);
 await h.auth(null);await h.auth('ownerA');send('sites','pending');send('sites','saved');send('contacts','saved');assert.equal(h.D.reloadSafety().safe,false,'same UID re-login does not prove the earlier session save');assert(h.D.reloadSafety().reasons.includes('record-sync-pending'));assert.match(h.D.status().syncError,/Record sync needs attention/);
});
test('same-session failed sync retains its pending hold until exact store completion and empty global errors remain visible',async()=>{
 const h=dataHarness({cloud:true});await h.auth('ownerA');const send=(key,state)=>h.emit('proton:sync-status',{detail:{key,state}});
 send('sites','pending');send('sites','error');send('contacts','saved');assert.equal(h.D.reloadSafety().safe,false);assert.match(h.D.status().syncError,/Record sync needs attention/);
 send('sites','saved');assert(h.D.reloadSafety().safe);assert.equal(h.D.status().syncError,'');
 send('','error');assert.equal(h.D.reloadSafety().safe,false);assert.match(h.D.status().syncError,/Keep this page open and export a backup/);send('','saved');assert.equal(h.D.reloadSafety().safe,false);
});
test('data writes stay unsafe while awaiting a browser lock and become safe only after a successful same-account save',async()=>{
 const h=dataHarness(),gate=h.lockGate();let wrote=false;const pending=h.D.write(()=>{wrote=true;return{ok:true};},h.D.snapshot());assert.equal(h.D.reloadSafety().safe,false);assert.equal(h.D.reloadSafety().inFlight,1);assert.equal(wrote,false);gate.resolve();await pending;assert(wrote);assert(h.D.reloadSafety().safe);
});
test('rejected writes stay unsafe after later success and unrelated snapshots; no timeout clears them',async()=>{
 const h=dataHarness();await assert.rejects(h.D.write(()=>({ok:false,err:'Synthetic save failed'})),/save failed/);assert.equal(h.D.reloadSafety().uncertain,1);await h.D.write(()=>({ok:true}));h.agent({state:{...A.initial(),revision:90}});assert.equal(h.D.reloadSafety().safe,false);assert.equal(h.D.reloadSafety().uncertain,1);
 const gate=h.dispatchGate(),pending=h.D.dispatch('task.add',{});assert.equal(h.D.reloadSafety().inFlight,1);gate.reject(Error('Synthetic transport failure'));await assert.rejects(pending,/transport failure/);assert.equal(h.D.reloadSafety().uncertain,2);
});
test('account changes fence a queued record write and preserve uncertainty after a dispatch settles',async()=>{
 const h=dataHarness({cloud:true});await h.auth('ownerA');const gate=h.lockGate();let wrote=false;const pending=h.D.write(()=>{wrote=true;return{ok:true};});await h.auth('ownerB');gate.resolve();await assert.rejects(pending,/account changed/);assert.equal(wrote,false);assert.equal(h.D.reloadSafety().safe,false);
 const g=dataHarness({cloud:true});await g.auth('ownerA');const dispatch=g.dispatchGate(),save=g.D.dispatch('task.add',{});await g.auth('ownerB');dispatch.resolve();await assert.rejects(save,/account changed/);assert.equal(g.D.reloadSafety().uncertain,1);
});
function inboxHarness({service='custom_search'}={}){
 let status={uid:'ownerA',epoch:1,ready:true,error:'',agent:{mode:'cloud'}},register=A.initial(),postGate=null,dispatchGate=null,mode='',proof='';
 const listeners=[],calls=[],applied=new Map(),record={id:'REQ-12345678-1234-4234-8234-123456789012',briefRevision:1,revision:2,service,status:'qualified',receivedAt:'2026-09-20T12:00:00Z',queue:{state:'not_queued'},payload:{service,contact:{name:'Synthetic private client',email:'synthetic@example.test'},brief:{country:'US',power:{value:160,unit:'kW'},geography:'Pennsylvania'}},history:[]};
 const auth={currentUser:{uid:'ownerA',getIdToken:async()=> 'synthetic-only'}};
 const sites=[{id:'site_exact',name:'Synthetic exact site',custom_fields:{}}];
 const D={status:()=>status,snapshot:()=>({uid:status.uid,epoch:status.epoch,raw:[]}),agent:()=>register,sites:()=>sites,subscribe:fn=>listeners.push(fn),dispatch:async(type,payload,revision)=>{if(dispatchGate)await dispatchGate.promise;register=A.reduce(register,{type,payload,revision,id:'synthetic_'+register.revision,at:'2026-09-20T12:00:00Z'});},saveSite:async()=>{}};
 const response=(body,status=200)=>({ok:status<400,status,json:async()=>clone(body)});
 const fetch=async(url,options)=>{calls.push({url,options});if(options.method==='GET')return response(url.endsWith('/metrics')?{}:url.includes('?limit=')?{requests:[record],nextCursor:null}:{request:record});if(postGate)await postGate.promise;if(mode==='fail')throw Error('Synthetic lost connection');const body=JSON.parse(options.body);if(mode==='validation')return response({error:{code:'invalid_request',message:'Synthetic invalid request'}},422);
  if(!applied.has(body.actionId)){record.revision++;record.history.push({...body,recordedByUid:status.uid,revision:record.revision});if(body.type==='queue')record.queue={state:'draft_saved',taskOwnerUid:status.uid,taskId:body.taskId,briefId:body.briefId};applied.set(body.actionId,true);}if(mode==='lost-after')throw Error('Synthetic lost receipt');const copy=clone(record);if(proof==='owner')copy.history.at(-1).recordedByUid='other';if(proof==='body')copy.history.at(-1).note='Unrelated action';if(proof==='missing')copy.history=[];return response({request:copy,duplicate:applied.has(body.actionId)});};
 const inbox=I.create({D,auth,fetch,model:S,config:{endpoint:'https://synthetic.example.test'}});inbox.select(clone(record));
 const switchAccount=uid=>{status={...status,uid,epoch:status.epoch+1};auth.currentUser={uid,getIdToken:async()=> 'synthetic-only'};listeners.forEach(fn=>fn('account'));};
 return{inbox,D,record,calls,switchAccount,mode:value=>{mode=value;},proof:value=>{proof=value;},postGate:()=>postGate=deferred(),dispatchGate:()=>dispatchGate=deferred()};
}
function formHost(kind,initial={}){
 const listeners=new Map(),button={disabled:false},error={textContent:''},form={dataset:{intakeForm:kind},elements:Object.entries(initial).map(([name,value])=>({name,value,type:'text'})),querySelector:()=>button};
 const host={innerHTML:'',contains:()=>true,querySelector:selector=>selector==='[data-intake-root]'?host:error,querySelectorAll:selector=>selector==='[data-intake-form]'?[form]:[],addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
 return{host,form,input(name,value){let field=form.elements.find(f=>f.name===name);if(!field){field={name,type:'text'};form.elements.push(field);}field.value=value;listeners.get('input')({target:{name,closest:()=>form}});},submit:()=>listeners.get('submit')({target:{closest:()=>form},preventDefault(){}})};
}
test('pristine initialized inbox forms do not block after navigation, but touched drafts survive navigation and account changes',async()=>{
 const h=inboxHarness({service:'site_submission'});await h.inbox.refresh();const ui=formHost('site-link',{partnerName:'Synthetic default source',note:''});h.inbox.mount(ui.host);assert(h.inbox.reloadSafety().safe,'automatic prefills are pristine');h.inbox.dispose();assert(h.inbox.reloadSafety().safe);
 h.inbox.mount(ui.host);ui.input('partnerName','Unsaved private correction');assert.equal(h.inbox.reloadSafety().dirtyDrafts,1);h.inbox.dispose();assert.equal(h.inbox.reloadSafety().safe,false);h.switchAccount('ownerB');assert.equal(h.inbox.reloadSafety().dirtyDrafts,1);assert.equal(h.inbox.state().selected,null);h.switchAccount('ownerA');h.inbox.select(clone(h.record));h.inbox.mount(ui.host);assert.match(ui.host.innerHTML,/Unsaved private correction/);h.inbox.dispose();
});
test('inbox submission marks a draft touched even without an input event, retaining it after validation failure',async()=>{
 const h=inboxHarness();await h.inbox.refresh();const ui=formHost('acknowledge',{acknowledgedAt:'not-a-date',note:'Retained submission'});h.inbox.mount(ui.host);await ui.submit();h.inbox.dispose();assert.equal(h.inbox.reloadSafety().safe,false);assert.equal(h.inbox.reloadSafety().dirtyDrafts,1);assert.equal(h.calls.filter(c=>c.options.method==='POST').length,0);
});
test('in-flight inbox posts block reload and exact successful action proof clears only that operation',async()=>{
 const h=inboxHarness(),gate=h.postGate(),pending=h.inbox.mutate('qualify',{note:'Synthetic exact decision'});assert.equal(h.inbox.reloadSafety().safe,false);assert(h.inbox.reloadSafety().inFlight>0);gate.resolve();await pending;assert(h.inbox.reloadSafety().safe);assert.equal(h.inbox.reloadSafety().dirtyDrafts,0);assert.equal(h.inbox.reloadSafety().uncertain,0);
});
test('lost API outcomes survive unrelated reads and exact retries reconcile without a duplicate',async()=>{
 const h=inboxHarness();h.mode('lost-after');await assert.rejects(h.inbox.mutate('qualify',{note:'Original decision'}),/lost receipt/);assert.equal(h.inbox.reloadSafety().uncertain,1);await h.inbox.refresh();assert.equal(h.inbox.reloadSafety().safe,false);h.mode('');await h.inbox.mutate('qualify',{note:'Original decision'});assert(h.inbox.reloadSafety().safe);assert.equal(h.record.history.length,1);
});
test('wrong-owner, different-body or missing action proof cannot clear a successful HTTP response',async()=>{
 for(const proof of ['owner','body','missing']){const h=inboxHarness();h.proof(proof);await assert.rejects(h.inbox.mutate('qualify',{note:'Original decision'}),/exact saved action is not confirmed/);assert.equal(h.inbox.reloadSafety().safe,false);assert.equal(h.inbox.reloadSafety().uncertain,1);}
});
test('definitive validation rejection retains its draft but corrected confirmed save can become safe',async()=>{
 const h=inboxHarness();h.mode('validation');await assert.rejects(h.inbox.mutate('qualify',{note:'Invalid'}),/invalid request/);assert.equal(h.inbox.reloadSafety().dirtyDrafts,1);assert.equal(h.inbox.reloadSafety().uncertain,0);h.mode('');await h.inbox.mutate('qualify',{note:'Corrected'});assert(h.inbox.reloadSafety().safe);
});
test('queue dispatch is in-flight before the linking POST and lost links reconcile their exact history',async()=>{
 const h=inboxHarness(),gate=h.dispatchGate(),pending=h.inbox.queue();await new Promise(resolve=>setImmediate(resolve));assert(h.inbox.reloadSafety().inFlight>0);assert.equal(h.inbox.reloadSafety().safe,false);h.mode('lost-after');gate.resolve();await assert.rejects(pending,/lost receipt/);assert.equal(h.inbox.reloadSafety().uncertain,1);h.mode('');await h.inbox.queue();assert(h.inbox.reloadSafety().safe);assert.equal(h.D.agent().tasks.length,1);assert.equal(h.record.history.length,1);
});
test('account changes after POST preserve original uncertainty and drafts in the new account',async()=>{
 const h=inboxHarness(),gate=h.postGate(),pending=h.inbox.mutate('qualify',{note:'Original account decision'});await new Promise(resolve=>setImmediate(resolve));h.switchAccount('ownerB');gate.resolve();await assert.rejects(pending,/account changed/);assert.equal(h.inbox.reloadSafety().safe,false);assert.equal(h.inbox.reloadSafety().uncertain,1);assert.equal(h.inbox.reloadSafety().dirtyDrafts,1);assert.equal(h.inbox.state().selected,null);
});


test('CRM release reload remains blocked for the entire visible exchange session',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../crm/crm.js'),'utf8');
 const start=source.indexOf('  function safeToUpdate(){'),end=source.indexOf('  function updatePending(',start);
 assert(start>=0&&end>start);
 const state={exchangeVisible:true,ready:true,dataSafe:true,inboxSafe:true};
 const box={get exchangeVisible(){return state.exchangeVisible;},D:{status:()=>({ready:state.ready,uid:'ownerA',agent:{uid:'ownerA',mode:'cloud',serverConfirmed:true}}),reloadSafety:()=>({safe:state.dataSafe})},intakeInbox:{reloadSafety:()=>({safe:state.inboxSafe})},busy:false,activeActions:0,sheet:{open:false},modalForm:false,completedReviewSession:null,registerConfirmed:()=>true,document:{activeElement:null},discovery:{brief:()=>null},outreachPlans:new Map()};
 vm.createContext(box);vm.runInContext(source.slice(start,end)+'this.check=safeToUpdate;',box);
 assert.equal(box.check(),false,'An untouched visible editor still prevents automatic reload.');
 state.exchangeVisible=false;assert.equal(box.check(),true);
 state.dataSafe=false;assert.equal(box.check(),false,'Existing save guards still apply after leaving the exchange.');
 state.dataSafe=true;state.inboxSafe=false;assert.equal(box.check(),false);
});
