'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const R=require('../deal-relationships');
const pack=require('../data/landfill-relationships-2026-09-07.json').sites['us-lf-10540'];
const NOW=Date.parse('2026-09-07T18:00:00Z');
const site=()=>({id:'lmop_180906-0',stage:'researching',acquisition:{rights_status:'unknown',available_kw:null},contact_name:'My existing contact'});
const person=(overrides={})=>({kind:'person',name:'Research Test',roles:['technical'],status:'unconfirmed',checked_on:'2026-09-07',authority_status:'unconfirmed',...overrides});
function apply(s,type,value,id){return R.apply(s,{revision:R.state(s).revision,type,value,id},NOW);}
function imported(){const s=site(),r=R.apply(s,{revision:0,type:'import_research',source_id:pack.site_id,value:pack},NOW);assert.equal(r.ok,true,r.err);return {...s,relationship_map:r.relationship_map};}
test('North Dade imports seven entries and five connections without conferring authority or changing qualification',()=>{
  const s=site(),before=structuredClone(s),result=imported();
  assert.deepEqual(s,before);assert.deepEqual(result.acquisition,before.acquisition);assert.equal(result.stage,'researching');
  assert.equal(result.relationship_map.nodes.length,7);assert.equal(result.relationship_map.connections.length,5);
  assert.ok(result.relationship_map.nodes.every(n=>n.authority_status==='unconfirmed'));
  const cov=R.coverage(result.relationship_map,NOW);assert.equal(cov.find(r=>r.key==='gas_rights').status,'missing');assert.equal(cov.find(r=>r.key==='approval').status,'confirm');
  assert.equal(cov.find(r=>r.key==='technical').status,'documented');
});
test('research matching rejects another project, another landfill and name-only matches',()=>{
  for(const s of [{...site(),id:'lmop_180906-1'},{...site(),id:'manual-north-dade',name:'North Dade Landfill'}])
    assert.equal(R.apply(s,{revision:0,type:'import_research',source_id:pack.site_id,value:pack},NOW).ok,false);
  assert.equal(R.apply(site(),{revision:0,type:'import_research',source_id:'us-lf-44',value:pack},NOW).ok,false);
  assert.equal(R.sourceId({source:'eia-facility',sourceDetail:{lfid:'10540'}}),null);
  assert.equal(R.sourceId({source:'lmop-landfill',sourceDetail:{lfid:'10540'}}),'us-lf-10540');
});
test('reimport preserves edited research and duplicate CRM contacts cannot create conflicting site roles',()=>{
  let s=imported(),n=s.relationship_map.nodes.find(n=>n.id==='research_nd_ravi');
  let r=apply(s,'save_node',{...n,next_action:'My reviewed next question'},n.id);assert.equal(r.ok,true,r.err);s.relationship_map=r.relationship_map;
  r=R.apply(s,{revision:s.relationship_map.revision,type:'import_research',source_id:pack.site_id,value:pack},NOW);assert.equal(r.ok,false);
  assert.equal(s.relationship_map.nodes.find(n=>n.id==='research_nd_ravi').next_action,'My reviewed next question');
  r=apply(s,'save_node',person({contact_id:'crm-123'}));assert.equal(r.ok,true);s.relationship_map=r.relationship_map;
  assert.equal(apply(s,'save_node',person({name:'Duplicate',contact_id:'crm-123'})).ok,false);
});
test('job titles and public listings cannot confirm signing authority',()=>{
  const s=site();
  assert.equal(apply(s,'save_node',person({title:'Director',roles:['approval'],authority_status:'confirmed'})).ok,false);
  const r=apply(s,'save_node',person({roles:['approval'],status:'confirmed',evidence_note:'Owner confirmed role in DOC-12',verified_by:'Reviewer',authority_status:'confirmed',authority_scope:'Approve the proposed gas purchase agreement within the documented limits',authority_evidence:'DOC-12, signed delegation, scope 2',authority_checked_on:'2026-09-07'}));
  assert.equal(r.ok,true,r.err);assert.equal(R.coverage(r.relationship_map,NOW).find(c=>c.key==='approval').status,'documented');
  assert.equal(s.acquisition.rights_status,'unknown');
});
test('bad dates, malformed emails, unsafe URLs and unsupported roles are refused',()=>{
  for(const patch of [{checked_on:'2026-02-30'},{checked_on:'2027-01-01'},{source_date:'2026-09-08'},
    {source_url:'javascript:alert(1)'},{source_url:'https://user:secret@county.example'},
    {email:'a@example.com?body=secret'},{roles:['signs-anything']},{status:'published',evidence_note:''}])
    assert.equal(apply(site(),'save_node',person(patch)).ok,false,JSON.stringify(patch));
});
test('stale revisions cannot overwrite edits; archive and restore retain connections and history',()=>{
  const s=imported();assert.equal(R.apply(s,{revision:0,type:'save_node',value:person()},NOW).ok,false);
  let r=apply(s,'archive_node',{},'research_nd_ravi');assert.equal(r.ok,true);s.relationship_map=r.relationship_map;
  assert.equal(R.coverage(s.relationship_map,NOW).find(c=>c.key==='technical').status,'missing');assert.equal(s.relationship_map.connections.length,5);
  r=apply(s,'restore_node',{},'research_nd_ravi');assert.equal(r.ok,true);assert.equal(R.coverage(r.relationship_map,NOW).find(c=>c.key==='technical').status,'documented');
});
test('connections require real distinct endpoints and retain provenance',()=>{
  const s=imported(),v={...person(),from:'research_nd_saba',to:'research_nd_ravi',label:'Introduced us after process confirmation'};
  assert.equal(apply(s,'add_connection',{...v,to:v.from}).ok,false);assert.equal(apply(s,'add_connection',{...v,to:'missing'}).ok,false);
  const r=apply(s,'add_connection',v);assert.equal(r.ok,true,r.err);assert.equal(r.relationship_map.connections.at(-1).status,'unconfirmed');
});
test('stale contact checks cease satisfying coverage and unreadable saved maps are not replaced',()=>{
  const s=imported();assert.ok(R.coverage(s.relationship_map,Date.parse('2027-09-07')).every(c=>c.status!=='documented'));
  assert.equal(R.apply({...site(),relationship_map:{nodes:'corrupt'}},{revision:0,type:'save_node',value:person()},NOW).ok,false);
});
test('research requests coalesce, retry failures, and do not fetch for unrelated sites',async()=>{
  let requests=0,fail=true;
  const context=vm.createContext({URL,Date,Promise,console,Set,module:{exports:{}},require,
    LandfillContacts:require('../landfill-contacts'),fetch:async()=>{requests++;if(fail)throw Error('offline');return {ok:true,json:async()=>({v:1,edition:'2026-09-07',sites:{'us-lf-10540':pack}})};}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../deal-relationships.js'),'utf8'),context);
  const api=context.module.exports,c={id:site().id,source:'lmop-landfill',sourceDetail:{lfid:'10540'}};
  assert.equal(await api.loadResearch({source:'lmop-landfill',sourceDetail:{lfid:'44'}}),null);assert.equal(requests,0);
  await assert.rejects(api.loadResearch(c),/offline/);fail=false;
  const [a,b]=await Promise.all([api.loadResearch(c),api.loadResearch(c)]);assert.equal(a,b);assert.equal(requests,2);assert.equal(a.site_id,'us-lf-10540');
});
