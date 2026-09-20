const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const M=require('../agent-control-model');
let seq=0;
function action(s,type,payload){return{id:'event_'+(++seq),at:'2026-09-17T12:00:00Z',revision:s.revision,type,payload};}
function apply(s,type,payload){return M.reduce(s,action(s,type,payload));}
function add(s=M.initial(),id='task_one'){return apply(s,'task.add',{id,title:'Check a hosting quote',role:'supply',brief:'Verify available space and cooling compatibility.',due:'2026-09-22',dealId:''});}
function ready(){return apply(add(),'task.ready',{id:'task_one'});}
function lead(more={}){return Object.assign({id:'lead_one',company:'Synthetic miner',website:'https://example.test',offer:'quote_review',channel:'direct',stage:'discovered',signal:'',source:'',checked:'',contact:'',buyer:'',nextAction:'',due:'',notes:'',lastTouch:'',lastNote:''},more);}
function qualified(more={}){return lead(Object.assign({stage:'qualified',signal:'Published fleet relocation request',source:'https://example.test/request',checked:'2026-09-17',contact:'https://example.test/contact',buyer:'Operations director',nextAction:'Review tailored draft',due:'2026-09-18'},more));}
test('legacy registers gain leads without losing tasks, deals, cash or revisions',()=>{
    let legacy=add();delete legacy.leads;const original=JSON.stringify(legacy);
    let next=apply(legacy,'lead.save',lead());assert.equal(JSON.stringify(legacy),original);assert.deepEqual(next.tasks,legacy.tasks);assert.deepEqual(next.entries,legacy.entries);assert.deepEqual(next.deals,legacy.deals);assert.equal(next.revision,legacy.revision+1);assert.equal(next.leads.length,1);
});
test('qualification and contact stages require evidence, next actions and actual outcomes',()=>{
    for(const field of ['signal','source','checked','buyer','contact','nextAction','due'])assert.throws(()=>apply(M.initial(),'lead.save',qualified({[field]:''})),/Qualification/);
    assert.throws(()=>apply(M.initial(),'lead.save',qualified({stage:'contacted'})),/actual contact/);
    let s=apply(M.initial(),'lead.save',qualified({stage:'replied',lastTouch:'2026-09-17',lastNote:'Synthetic response requests a call'}));
    assert.equal(M.leadMetrics(s,'2026-09-18').conversations,1);assert.equal(M.metrics(s,'2026-09').contribution,0);
    assert.throws(()=>apply(s,'lead.save',qualified({checked:'2026-09-19'})),/future/);
    assert.throws(()=>apply(M.initial(),'lead.save',qualified({source:'javascript:alert(1)'})),/URL/);
});
test('accounts deduplicate across www and URL paths while preserving separate service tests',()=>{
    let s=apply(M.initial(),'lead.save',lead());assert.throws(()=>apply(s,'lead.save',lead({id:'lead_two',website:'https://www.example.test/company/'})),/already has a lead/);
    s=apply(s,'lead.save',lead({id:'lead_two',offer:'research'}));assert.equal(s.leads.length,2);
    s=apply(s,'lead.save',lead({company:'Updated name'}));assert.equal(s.leads.length,2);assert.equal(s.leads[0].company,'Updated name');
});
test('do-not-contact suppresses matching routes across offers and cannot be cleared or reassigned',()=>{
    let s=apply(M.initial(),'lead.save',qualified());s=apply(s,'lead.save',qualified({id:'lead_two',offer:'research'}));
    s=apply(s,'lead.save',qualified({stage:'dnc',notes:'Contact asked us to stop.'}));assert(s.leads.every(l=>l.stage==='dnc'));assert.equal(M.leadMetrics(s,'2026-09-20').active,0);
    assert.throws(()=>apply(s,'lead.save',qualified()),/cannot be reactivated/);
    assert.throws(()=>apply(s,'lead.save',qualified({stage:'dnc',notes:'Keep',contact:''})),/reassigned/);
    assert.throws(()=>apply(s,'lead.save',qualified({id:'lead_three',offer:'brief'})),/do not contact/);
});
test('new offer hypotheses are supported without inventing revenue or bots',()=>{
    for(const offer of ['quote_review','research']){let s=apply(M.initial(),'deal.save',{id:'new_offer',name:'Synthetic buyer',offer,stage:'proposed',feeCents:50000,contact:'',notes:''});assert.equal(M.metrics(s,'2026-09').contribution,0);}
    assert.equal(M.ROLES.length,6);assert.match(M.kickoff('http://localhost'),/Create six/);assert.match(M.kickoff('http://localhost'),/Prices are hypotheses/);
});
test('site-search and review leads/deals preserve legacy service identity and researched-only stages',()=>{
    let s=apply(M.initial(),'lead.save',lead({offer:'research'}));
    s=apply(s,'deal.save',{id:'old_deal',name:'Historical desk',offer:'sourcing',stage:'proposed',feeCents:150000,contact:'',notes:'Original scope'});
    const oldLead=JSON.parse(JSON.stringify(s.leads[0])),oldDeal=JSON.parse(JSON.stringify(s.deals[0]));
    for(const offer of ['custom_search','site_review']){
        s=apply(s,'lead.save',qualified({id:'lead_'+offer,offer,serviceFit:'Needs an evidenced energy site assessment.'}));
        assert.throws(()=>apply(s,'lead.save',qualified({id:'lead_'+offer,offer,stage:'contacted'})),/actual contact/);
        s=apply(s,'deal.save',{id:'deal_'+offer,name:offer,offer,stage:'proposed',feeCents:73500,contact:'',notes:'Individually scoped example'});
    }
    assert.deepEqual(s.leads[0],oldLead);assert.deepEqual(s.deals[0],oldDeal);assert.equal(s.tasks.length,0);assert.equal(s.entries.length,0);assert.equal(M.metrics(s,'2026-09').contribution,0);
    assert(s.leads.slice(1).every(l=>l.stage==='qualified'&&!l.lastTouch));
    assert.throws(()=>apply(s,'lead.save',lead({id:'submission',offer:'site_submission'})),/valid lead stage, service/);
});
test('current site services retain per-service deduplication and cross-service contact suppression',()=>{
    let s=apply(M.initial(),'lead.save',qualified({offer:'custom_search'}));
    assert.throws(()=>apply(s,'lead.save',qualified({id:'duplicate',offer:'custom_search',website:'https://www.example.test/sites'})),/already has a lead/);
    s=apply(s,'lead.save',qualified({id:'review_lead',offer:'site_review'}));
    s=apply(s,'lead.save',qualified({offer:'custom_search',stage:'dnc',notes:'Synthetic refusal'}));
    assert(s.leads.every(l=>l.stage==='dnc'));assert.throws(()=>apply(s,'lead.save',qualified({id:'new_review',offer:'site_review'})),/do not contact/);
});
test('native setup requires a separate Proton account before creating bots',()=>{
    const text=M.kickoff('https://protonminingco.com/app/agent-control.html');
    assert.match(text,/Before creating anything/);assert.match(text,/separate from the account used for Stoneport/);assert.match(text,/Never create, message or configure Proton bots in the Stoneport account/);assert.match(text,/## Proton Lead Intelligence/);
});
test('new desk has no invented work, revenue or running agents',()=>{let s=M.initial();assert.equal(s.goalCents,500000);assert.equal(s.tasks.length,0);assert.equal(M.metrics(s,'2026-09').contribution,0);});
test('copying a packet does not mutate state or claim dispatch',()=>{let s=add(),before=JSON.stringify(s),text=M.packet(s,s.tasks[0],'https://example.test/app/agent-control.html');assert.equal(JSON.stringify(s),before);assert.match(text,/task_one/);assert.equal(s.tasks[0].handoffAt,'');});
test('workflow requires a real result and explicit review before acceptance',()=>{
    let s=ready();assert.throws(()=>apply(s,'task.accept',{id:'task_one',note:'OK'}),/no result/);
    s=apply(s,'task.start',{id:'task_one'});s=apply(s,'task.result',{id:'task_one',result:'Quote is expired; request a new quote.',sources:['https://example.test/quote']});
    assert.equal(s.tasks[0].status,'review');assert.throws(()=>apply(s,'task.accept',{id:'task_one',note:''}),/review decision/);
    s=apply(s,'task.revise',{id:'task_one',note:'Obtain a current dated offer.'});assert.equal(s.tasks[0].status,'blocked');
    s=apply(s,'task.ready',{id:'task_one'});s=apply(s,'task.result',{id:'task_one',result:'Current offer received.',sources:[]});
    s=apply(s,'task.accept',{id:'task_one',note:'Checked the dated original; capacity still subject to contract.'});assert.equal(s.tasks[0].status,'done');
    assert.throws(()=>apply(s,'task.result',{id:'task_one',result:'Stale result',sources:[]}),/current state/);
});
test('claims are exclusive and stale tabs cannot overwrite a newer board',()=>{
    let s=ready(),a=action(s,'task.start',{id:'task_one'}),next=M.reduce(s,a);
    assert.throws(()=>M.reduce(next,a),/another window/);
    assert.throws(()=>apply(next,'task.start',{id:'task_one'}),/not available/);
});
test('pause stops new handoffs and claims but still accepts existing results',()=>{
    let s=apply(ready(),'pause',{});assert.throws(()=>apply(s,'task.start',{id:'task_one'}),/paused/);
    assert.throws(()=>apply(s,'task.handoff',{id:'task_one'}),/paused/);
    s=apply(s,'task.result',{id:'task_one',result:'Completed before pause',sources:[]});assert.equal(s.tasks[0].status,'review');
});
test('cancelled tasks reject late results',()=>{let s=apply(ready(),'task.cancel',{id:'task_one'});assert.throws(()=>apply(s,'task.result',{id:'task_one',result:'Late',sources:[]}),/current state/);});
test('result sources reject executable URLs and credentials',()=>{for(const source of ['javascript:alert(1)','data:text/html,hello','https://user:pass@example.test'])assert.throws(()=>apply(ready(),'task.result',{id:'task_one',result:'bad',sources:[source]}),/URL/);});
test('duplicate task IDs and broken opportunity links cannot be saved',()=>{
    let s=add();assert.throws(()=>add(s),/already been saved/);
    assert.throws(()=>apply(s,'task.add',{id:'task_two',title:'A',role:'analysis',brief:'B',due:'',dealId:'missing'}),/linked deal/);
});
function cash(s,kind,cents,more={}){return apply(s,'cash.add',Object.assign({id:'cash_'+(++seq),kind,cents,date:'2026-09-17',note:'Service assignment',evidence:'Invoice 001 / bank reference',dealId:'',earnedConfirmed:true},more));}
test('cash contribution counts collected earned fees less costs and reserves',()=>{
    let s=M.initial();s=cash(s,'earned',700000);s=cash(s,'delivery',150000);s=cash(s,'software',50000);
    assert.equal(M.metrics(s,'2026-09').contribution,500000);
    s=cash(s,'reserve',100000);assert.equal(M.metrics(s,'2026-09').contribution,400000);
    s=cash(s,'release',40000);assert.equal(M.metrics(s,'2026-09').contribution,440000);
    assert.throws(()=>cash(s,'release',60001),/exceed/);
    assert.equal(M.metrics(s,'2026-08').contribution,0);
});
test('deposits, invalid money, missing evidence and unconfirmed earnings cannot be reported as fees',()=>{
    for(const cents of [-1,Infinity,0,1.1])assert.throws(()=>cash(M.initial(),'earned',cents));
    assert.throws(()=>cash(M.initial(),'earned',100,{earnedConfirmed:false}),/earned/);
    assert.throws(()=>cash(M.initial(),'earned',100,{evidence:''}),/reference/);
    assert.throws(()=>cash(M.initial(),'deposit',100),/cash entry/);
});
test('proposed fees never contribute to collected earnings',()=>{
    let s=apply(M.initial(),'deal.save',{id:'deal_one',name:'Example buyer',contact:'',offer:'sourcing',stage:'signed',feeCents:150000,notes:''});
    let m=M.metrics(s,'2026-09');assert.equal(m.pipeline,150000);assert.equal(m.contribution,0);
});
test('corrections preserve cash records and cannot invalidate an existing reserve release',()=>{
    let s=cash(M.initial(),'earned',70000),original=s.entries[0].id;
    s=apply(s,'cash.void',{id:original,reason:'Wrong amount; replacement follows.'});assert.equal(s.entries[0].cents,70000);assert.equal(M.metrics(s,'2026-09').earned,0);
    assert.throws(()=>apply(s,'cash.void',{id:original,reason:'Again'}),/already voided/);
    s=cash(s,'reserve',10000);const reserveId=s.entries[1].id;s=cash(s,'release',5000);
    assert.throws(()=>apply(s,'cash.void',{id:reserveId,reason:'Reverse reserve'}),/associated release/);
});
function storage(){let data=new Map();return{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),data};}
function storeHarness(options={}){
    const box={AgentControlModel:M,localStorage:options.storage||storage(),navigator:{},addEventListener(){},removeEventListener(){},...options};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../agent-control-store.js'),'utf8'),box);
    return{box,store:box.AgentControlStore.create({storage:box.localStorage,db:options.db,auth:options.auth})};
}
test('local persistence survives reload and detects cross-tab stale writes',async()=>{
    const data=storage(),one=storeHarness({storage:data}).store,two=storeHarness({storage:data}).store;
    const a=action(M.initial(),'task.add',{id:'persist',title:'Keep this',role:'revenue',brief:'Persistent local task',due:'',dealId:''});
    await one.dispatch(a);assert.equal(storeHarness({storage:data}).store.snapshot().state.tasks[0].id,'persist');
    await assert.rejects(two.dispatch({...a,payload:{...a.payload,id:'other'}}),/another window/);
});
test('corrupt local storage is not silently replaced',async()=>{const data=storage();data.setItem('protonAgentControlLocal_v1','{broken');const h=storeHarness({storage:data});assert.equal(h.store.snapshot().mode,'error');await assert.rejects(h.store.dispatch(action(M.initial(),'pause',{})),/recover/);assert.equal(data.getItem('protonAgentControlLocal_v1'),'{broken');});
function cloud(){
    const docs=new Map(),callbacks=new Map(),failures=new Map(),writes=[];
    function ref(uid){return{uid,onSnapshot(opts,fn,fail){callbacks.set(uid,fn);failures.set(uid,fail);fn({exists:docs.has(uid),data:()=>docs.get(uid),metadata:{fromCache:false,hasPendingWrites:false}});return()=>{};}};}
    const db={collection(n){assert.equal(n,'users');return{doc:uid=>({collection:k=>{assert.equal(k,'data');return{doc:key=>{assert.equal(key,'agentControl');return ref(uid);}};}})};},
      async runTransaction(fn){await fn({get:async r=>({exists:docs.has(r.uid),data:()=>docs.get(r.uid)}),set(r,v){docs.set(r.uid,v);writes.push(r.uid);callbacks.get(r.uid)({exists:true,data:()=>v,metadata:{fromCache:false,hasPendingWrites:false}});}});}};
    return{db,docs,callbacks,failures,writes};
}
test('cloud transactions use the existing owner path and never upload anonymous work',async()=>{
    const c=cloud(),data=storage();data.setItem('protonAgentControlLocal_v1',JSON.stringify(add()));
    const h=storeHarness({db:c.db,storage:data}).store;h.setUser({uid:'owner_a'});
    assert.equal(h.snapshot().state.tasks.length,0);assert.equal(c.writes.length,0);
    await h.dispatch(action(h.snapshot().state,'task.add',{id:'cloud_task',title:'Cloud',role:'revenue',brief:'Cloud job',due:'',dealId:''}));
    assert.deepEqual(c.writes,['owner_a']);assert.equal(h.snapshot().state.tasks[0].id,'cloud_task');
    h.setUser({uid:'owner_b'});assert.equal(h.snapshot().state.tasks.length,0);
    c.callbacks.get('owner_a')({exists:true,data:()=>c.docs.get('owner_a'),metadata:{fromCache:false}});
    assert.equal(h.snapshot().uid,'owner_b');assert.equal(h.snapshot().state.tasks.length,0);
    h.setUser(null);assert.equal(h.snapshot().state.tasks[0].id,'task_one');
});
test('cloud cached/offline snapshots never permit claims',async()=>{
    const c=cloud(),h=storeHarness({db:c.db}).store;h.setUser({uid:'a'});
    c.callbacks.get('a')({exists:false,metadata:{fromCache:true}});assert.equal(h.snapshot().mode,'offline');
    await assert.rejects(h.dispatch(action(h.snapshot().state,'pause',{})),/connection/);
});

test('cloud persistence confirmation follows current snapshot metadata and resets on errors and account changes',()=>{
    const c=cloud(),h=storeHarness({db:c.db}).store,views=[];h.subscribe(view=>views.push(view));
    assert.equal(h.snapshot().serverConfirmed,false);h.setUser({uid:'a'});
    const emit=metadata=>c.callbacks.get('a')({exists:false,metadata});
    emit({fromCache:false,hasPendingWrites:false});assert.equal(h.snapshot().serverConfirmed,true);assert.equal(views.at(-1).serverConfirmed,true);
    for(const metadata of [{fromCache:false,hasPendingWrites:true},{fromCache:true,hasPendingWrites:false},{fromCache:false},undefined]){
      emit(metadata);assert.equal(h.snapshot().serverConfirmed,false);assert.equal(views.at(-1).serverConfirmed,false);
    }
    emit({fromCache:false,hasPendingWrites:false});
    c.callbacks.get('a')({exists:true,data:()=>({data:{broken:true}}),metadata:{fromCache:false,hasPendingWrites:false}});
    assert.equal(h.snapshot().mode,'error');assert.equal(h.snapshot().serverConfirmed,false);
    emit({fromCache:false,hasPendingWrites:false});c.failures.get('a')({code:'permission-denied'});assert.equal(h.snapshot().serverConfirmed,false);assert.equal(h.snapshot().mode,'error');
    emit({fromCache:false,hasPendingWrites:false});const firstView=views.length;h.setUser({uid:'b'});assert.equal(views[firstView].serverConfirmed,false);assert.equal(views[firstView].mode,'connecting');
    c.callbacks.get('b')({exists:false,metadata:{fromCache:false,hasPendingWrites:true}});
    emit({fromCache:false,hasPendingWrites:false});assert.equal(h.snapshot().uid,'b');assert.equal(h.snapshot().serverConfirmed,false);
    h.setUser(null);assert.equal(h.snapshot().mode,'local');assert.equal(h.snapshot().serverConfirmed,false);
});
