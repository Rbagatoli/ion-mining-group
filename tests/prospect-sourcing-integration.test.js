'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const S=require('../prospect-sourcing'),U=require('../prospect-sourcing-ui'),Sites=require('../site-model'),Backup=require('../backup');
const data=require('../data/landfills.json'),pack=require('../data/sourcing-leads-2026-09-07.json');
function setup(){const store={},uploads=[];let fail=false;global.SiteData=Sites;global.SyncEngine={save:(...a)=>uploads.push(a)};global.localStorage={getItem:k=>store[k]||null,setItem:(k,v)=>{if(fail)throw Error('Quota');store[k]=v;},key:i=>Object.keys(store)[i],get length(){return Object.keys(store).length;}};return {store,uploads,fail:v=>{fail=v;}};}
function value(){return {play:'flared_surplus',by:'Test recorder',claim:'Synthetic owner gas log requires verification',source_url:'https://example.com/gas-log',document_date:'2026-09-07',locator:'Page 1',site_match:'Exact landfill identifier',verification:'Obtain current allocations and gas quality',owner:'Test recorder',due_on:'2026-09-10'};}
test('catalogue leads retain original clocks, physical grouping and competing project warnings',()=>{
 assert.equal(pack.source_records,data.projects.length);assert.equal(pack.source_release,'2024-09-04');assert.equal(new Set(pack.leads.map(x=>x.physical_id)).size,pack.leads.length);
 const north=pack.leads.find(x=>x.physical_id==='us-lf-10540');assert.ok(north.candidate_ids.includes('lmop_180906-0'));assert.ok(north.measurement_years.includes(2022));assert.equal(north.source_date,'2024-09-04');assert.equal(north.cues[0].play,'flared_surplus');assert.match(north.cues[0].claim,/2022/);
 for(const l of pack.leads){for(const c of l.cues)assert.ok(['flared_surplus','idle_generation','capacity_gap'].includes(c.play),'No inferred contract/procurement dates');assert.equal(l.event_on,undefined);assert.ok(l.candidate_ids.includes(l.candidate_id));}
 for(const lead of pack.leads.filter(x=>x.cues.some(c=>c.play==='flared_surplus'))){const rows=data.projects.filter(r=>'us-lf-'+r.lfid===lead.physical_id);assert.equal(rows.some(r=>/^operational$/i.test(r.projectStatus||'')),false);}
 assert.ok(pack.leads.some(l=>l.cues.some(c=>c.play==='idle_generation')&&l.competing_use.includes('operational')),'A different operating project is not hidden behind a shutdown');
});
test('source adapter aliases resolve to each lead physical ID and lead matching avoids duplicate saved records',async()=>{
 const L=require('../source-landfill'),previous=global.fetch;global.fetch=async()=>({ok:true,json:async()=>data});try{await L.load();}finally{global.fetch=previous;}
 const candidates=new Map(data.projects.map(r=>{const c=L.adapter.normalize(r);return [c.id,c];}));for(const l of pack.leads)for(const id of l.candidate_ids)assert.equal('us-lf-'+candidates.get(id).sourceDetail.lfid,l.physical_id);
 const n=pack.leads.find(l=>l.physical_id==='us-lf-10540'),saved={id:'custom-saved-id',discovery:{sourceId:'lmop-landfill',sourceRecordId:n.candidate_id},stage:'researching'};
 assert.equal(S.savedMatches(n,[saved]).length,1);assert.equal(S.savedMatches(n,[saved,{id:n.candidate_id}]).length,2);assert.equal(S.catalogue([n],[{...saved,stage:'dead'}],{}).length,0);assert.equal(S.catalogue([n],[],{horizon:'30'}).length,0);
 assert.equal(S.catalogue([n],[],{q:n.owner}).length,1);assert.equal(S.catalogue([n],[],{q:n.cues[0].claim.slice(0,60)}).length,1);assert.equal(S.catalogue([n],[],{q:'No matching owner or cue'}).length,0);
});
test('one site write retains sourcing, owner worksheet, relationship map, capital record and quoted terms',()=>{
 const h=setup(),fields={keep:'private',_proton_owner_confirmation_v1:{v:1,revision:0,conversations:[],actions:[],history:[]},_proton_relationship_map_v1:{v:1,revision:0,nodes:[],connections:[],history:[]},_proton_diligence_v1:{v:1,revision:0,assets:{},capacity:{},history:[]}};
 const site=Sites.add({id:'test',name:'Test',quoted_rate:.03,custom_fields:fields}),n=h.uploads.length;
 assert.equal(U.commit(site.id,{revision:0,type:'add',value:value()}).ok,true);const saved=Sites.get(site.id);for(const k of Object.keys(fields))assert.deepEqual(saved.custom_fields[k],fields[k]);assert.equal(saved.quoted_rate,.03);assert.equal(saved.stage,site.stage);assert.equal(h.uploads.length,n+1);
 Sites.update(site.id,{notes:'Legacy form update'});assert.equal(S.state(Sites.get(site.id)).signals.length,1);assert.deepEqual(S.state(JSON.parse(h.store.protonMiningSites).sites[0]),S.state(saved));
});
test('write failure and stale views preserve saved data, pending drafts and sync history',()=>{
 const h=setup(),site=Sites.add({id:'fail',name:'Test'});assert.equal(U.commit(site.id,{revision:0,type:'add',value:value()}).ok,true);const before=JSON.stringify(Sites.get(site.id)),n=h.uploads.length;h.fail(true);
 const r=U.commit(site.id,{revision:1,type:'add',value:{...value(),claim:'A different claim'}});assert.equal(r.ok,false);assert.match(r.err,/draft is preserved/);assert.equal(JSON.stringify(Sites.get(site.id)),before);assert.equal(h.uploads.length,n);h.fail(false);assert.equal(U.commit(site.id,{revision:0,type:'add',value:value()}).ok,false);
});
test('saved searches are in the real workspace backup and use a declared restore version',()=>{
 setup();assert.equal(S.saveSearch(localStorage,{revision:0,type:'save',name:'Florida flare follow-up',filters:{region:'FL',play:'flared_surplus'}}).ok,true);const exported=Backup.collect(localStorage);assert.equal(exported[S.SEARCH_KEY]._v,1);assert.equal(exported[S.SEARCH_KEY].items[0].name,'Florida flare follow-up');assert.equal(Backup.STORE_VERSIONS[S.SEARCH_KEY],1);
});
test('Sourcing route, lazy catalogue, cache and build deployment references are wired',()=>{
 const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8'),assets=JSON.parse(read('tools/app-assets.json'));
 for(const f of ['prospect-sourcing.js','prospect-sourcing-ui.js','prospect-sourcing.css','data/sourcing-leads-2026-09-07.json']){assert.ok(assets.includes(f));assert.ok(read('sw.js').includes('./'+f));}
 assert.match(read('prospect-nav.js'),/key: 'sourcing'/);assert.match(read('prospecting.html'),/id="sourcingSection"/);assert.match(read('prospecting.js'),/sourcingRoot\._hasDraft/);assert.match(read('.github/workflows/pages.yml'),/node tools\/build-sourcing-leads.js/);
});
