'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const R=require('../deal-relationships'),Ui=require('../deal-relationships-ui'),S=require('../site-model');
const pack=require('../data/landfill-relationships-2026-09-07.json').sites['us-lf-10540'];
function setup(){const data={},uploads=[];let refuse=false;global.SiteData=S;global.CrmConfig=undefined;global.SyncEngine={save:(...args)=>uploads.push(args)};
  global.localStorage={getItem:k=>data[k]||null,setItem:(k,v)=>{if(refuse)throw Error('quota');data[k]=v;}};
  return {data,uploads,refuse:v=>{refuse=v;}};
}
function command(s){return {revision:R.state(s).revision,type:'import_research',source_id:pack.site_id,value:pack};}
test('real site persistence survives reloading and preserves commercial fields and contacts',()=>{
  setup();const s=S.add({id:'lmop_180906-0',name:'North Dade',quoted_rate:.03,contact_name:'My saved contact',custom_fields:{private:'Keep'}});
  const c=command(s),result=Ui.commit(s.id,c);assert.equal(result.ok,true,result.err);assert.equal(R.state(S.get(s.id)).nodes.length,7);
  assert.equal(S.get(s.id).quoted_rate,.03);assert.equal(S.get(s.id).contact_name,'My saved contact');assert.equal(S.get(s.id).custom_fields.private,'Keep');
  assert.equal(Ui.commit(s.id,c).ok,false);assert.equal(S.get(s.id).stage,'unreviewed');
});
test('an ordinary legacy site update preserves the map without recognizing its schema',()=>{
  setup();const s=S.add({id:'lmop_180906-0',name:'North Dade',custom_fields:{existing:'keep'}});
  assert.equal(Ui.commit(s.id,command(s)).ok,true);const before=structuredClone(R.state(S.get(s.id)));
  const updated=S.update(s.id,{notes:'An edit from another page',quoted_rate:.04});
  assert.equal(updated._save.ok,true);assert.deepEqual(R.state(S.get(s.id)),before);assert.equal(updated.custom_fields.existing,'keep');
  assert.equal(S.normalize({relationship_map:before}).relationship_map,undefined,'legacy normalizers drop unknown top-level fields');
  assert.deepEqual(R.state(S.normalize({custom_fields:{[R.storageKey]:before}})),before,'the existing extensible field survives normalization');
});
test('storage failure cannot claim success, change saved data or upload it',()=>{
  const h=setup(),s=S.add({id:'lmop_180906-0',name:'North Dade'}),before=JSON.stringify(S.get(s.id)),uploads=h.uploads.length;
  h.refuse(true);assert.equal(Ui.commit(s.id,command(s)).ok,false);assert.equal(JSON.stringify(S.get(s.id)),before);assert.equal(h.uploads.length,uploads);
});
test('the map and research escape untrusted values and do not make unsafe links',()=>{
  const bad=structuredClone(pack);bad.nodes[0].name='<img src=x onerror=alert(1)>';bad.nodes[0].source_url='javascript:alert(1)';bad.nodes[0].email='x@example.com?body=steal';
  const html=Ui.researchMarkup(bad,false);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img|href="javascript:|mailto:x@example.com\?/);
  assert.match(html,/Authority unconfirmed/);assert.match(html,/Still to identify/);
});
test('late research updates only its own widget and ignores a detached site',async()=>{
  const original=R.loadResearch;let resolve;R.loadResearch=()=>new Promise(r=>{resolve=r;});
  const candidate={source:'lmop-landfill',sourceDetail:{lfid:'10540'}};
  const slot={isConnected:true,innerHTML:'loading',getAttribute:()=>pack.site_id,querySelector:()=>null};
  const host={innerHTML:'Keep unsaved terms',querySelector:()=>slot};
  try {const request=Ui.mountResearch(host,candidate);slot.isConnected=false;resolve(pack);await request;
    assert.equal(slot.innerHTML,'loading');assert.equal(host.innerHTML,'Keep unsaved terms');
  }finally{R.loadResearch=original;}
});
test('research load failure offers a real retry rather than an empty-contact result',async()=>{
  const original=R.loadResearch;let attempts=0,retry;
  R.loadResearch=()=>++attempts===1?Promise.reject(Error('offline')):Promise.resolve(pack);
  const button={addEventListener:(_,fn)=>{retry=fn;}},slot={isConnected:true,innerHTML:'',getAttribute:()=>pack.site_id,querySelector:sel=>sel==='[data-rm-retry]'?button:null};
  const candidate={source:'lmop-landfill',sourceDetail:{lfid:'10540'}},host={querySelector:()=>slot};
  try{await Ui.mountResearch(host,candidate);assert.match(slot.innerHTML,/could not be loaded/);retry();await slot._relationshipRequest;
    assert.equal(attempts,2);assert.match(slot.innerHTML,/Saba Musleh/);
  }finally{R.loadResearch=original;}
});
test('runtime entries include both pages, cache and build manifest',()=>{
  const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
  for(const page of ['map.html','prospecting.html']){
    const html=read(page);for(const file of ['deal-relationships.js','deal-relationships-ui.js','deal-relationships.css'])assert.ok(html.includes('./'+file+'?v='),page+' '+file);
    assert.ok(html.indexOf('./deal-relationships.js?')<html.indexOf('./deal-relationships-ui.js?'));
  }
  const assets=JSON.parse(read('tools/app-assets.json'));for(const file of ['deal-relationships.js','deal-relationships-ui.js','deal-relationships.css','data/landfill-relationships-2026-09-07.json'])assert.ok(assets.includes(file),file);
  assert.match(read('sw.js'),/\.\/deal-relationships-ui\.js/);assert.match(read('prospecting.js'),/_hasDraft/);
});
