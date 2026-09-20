'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const M=require('../crm/crm-model');
test('unified pipeline preserves every original stage and uses typed identities',()=>{
 const rows=M.pipeline([{id:'same',name:'Site',stage:'diligence',updated:'2026-09-17'}],[{id:'same',company:'Buyer',stage:'dnc',updatedAt:'2026-09-16'}],[{id:'same',name:'Work',stage:'delivery'}]);
 assert.equal(rows.length,3);assert.deepEqual(rows.map(r=>r.stage),['diligence','dnc','delivery']);assert.deepEqual(rows.map(r=>r.group),['agreement','closed','agreement']);assert.equal(M.group('site','custom_stage'),'research');
});
test('pipeline exposes current service labels for lead search and deals without rewriting records',()=>{
 const leads=[{id:'search',company:'Example',offer:'custom_search',buyer:'Operations',stage:'discovered'}],deals=[{id:'review',name:'Review example',offer:'site_review',stage:'proposed'},{id:'legacy',name:'Historical research',offer:'research',stage:'delivery'}];
 const before=JSON.stringify({leads,deals}),rows=M.pipeline([],leads,deals);
 assert.equal(rows.find(r=>r.id==='search').subtitle,'Custom Site Search · Operations');assert.equal(rows.find(r=>r.id==='review').subtitle,'Existing Site Review');assert.equal(rows.find(r=>r.id==='legacy').subtitle,'Supplier Prospect Research');assert.equal(JSON.stringify({leads,deals}),before);
});
test('today excludes suppressed and future leads and completed tasks, and includes orphan reminders',()=>{
 const list=M.today({sites:[],leads:[{id:'suppressed',stage:'dnc',due:'2026-01-01'},{id:'future',stage:'qualified',due:'2026-09-19'},{id:'due',company:'Buyer',stage:'qualified',due:'2026-09-16'}],tasks:[{id:'done',status:'done',due:'2026-01-01'},{id:'review',status:'review'}],followups:[{id:'orphan',prospect_id:'lost',description:'Check the link',status:'pending',due_date:'2026-09-17'},{id:'finished',status:'done',due_date:'2026-09-15'}],date:'2026-09-17'});
 assert.deepEqual(list.map(r=>r.id),['due','review','orphan']);assert.equal(list[2].context,'Unlinked reminder');
});
test('capital sort puts unknown last, respects zero, and breaks ties deterministically',()=>{
 const rows=[{id:'u',name:'Unknown',cash:null},{id:'b',name:'B',cash:10},{id:'a',name:'A',cash:10},{id:'z',name:'Zero',cash:0}];
 assert.deepEqual(rows.sort((a,b)=>M.compareDiscovery(a,b,'capital')).map(r=>r.id),['z','a','b','u']);
});
test('malformed and future storage versions are blocked rather than read as empty',()=>{
 assert.equal(M.checkedStore(null,'sites'),null);for(const raw of ['{','{}','{"_v":2,"sites":[]}','{"_v":1,"sites":[null]}'])assert.throws(()=>M.checkedStore(raw,'sites'));
 assert.deepEqual(M.checkedStore('{"_v":1,"sites":[]}','sites').sites,[]);
});
test('only ordinary web URLs can be used as evidence links',()=>{
 for(const u of ['javascript:alert(1)','data:text/html,x','https://u:p@example.com'])assert.equal(M.safeUrl(u),null);assert.equal(M.safeUrl('https://example.com'),'https://example.com/');
});
test('catalog groups exact source identities without adding capacities or merging evidence',()=>{
 const rows=[{id:'a',name:'A',cash:10,capacity:100},{id:'b',name:'A',cash:20,capacity:200},{id:'c',name:'A',cash:30,capacity:300}];
 const grouped=M.groupSources(rows,r=>r.id==='c'?null:'landfill:us:123');assert.equal(grouped.length,2);assert.deepEqual(grouped[0].sourceRecords,['a','b']);assert.equal(grouped[0].capacity,100);assert.equal(grouped[0].cash,10);assert.deepEqual(grouped[1].sourceRecords,['c']);
});
test('CRM is independently packaged with declared assets and a separate installation identity',()=>{
 const root=path.resolve(__dirname,'..'),assets=require('../tools/build-crm.cjs').assets(),names=new Set();
 assets.forEach(a=>{assert(fs.statSync(path.join(root,a.from)).isFile(),a.from);assert(!names.has(a.to),'duplicate '+a.to);names.add(a.to);assert(!/reports|\.cache|^tests\//.test(a.to));});
 const html=fs.readFileSync(path.join(root,'crm/index.html'),'utf8');assert(!/<iframe|shared\.js|agent-control\.js[?" ]|prospecting\.js/.test(html));
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'crm/manifest.webmanifest'),'utf8'));assert.equal(manifest.id,'/crm/');assert.equal(manifest.scope,'./');assert.equal(manifest.display,'standalone');
 assert(fs.readFileSync(path.join(root,'shared.js'),'utf8').includes('href="../crm/"'));
});
