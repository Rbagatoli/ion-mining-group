'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const D=require('../prospect-diligence'),Ui=require('../prospect-diligence-ui'),S=require('../site-model'),C=require('../site-capacity');
const L=require('../source-landfill'),F=require('../source-facility'),A=require('../site-availability'),I=require('../site-infrastructure');
const {enrich}=require('../tools/lmop-infrastructure-fields.cjs'),data=require('../data/landfills.json');
const NOW=Date.parse('2026-09-07T16:00:00Z');
function proof(extra){return {checked_on:'2026-09-07',reviewer:'Test reviewer',evidence_note:'Explicit test document, scope and funding agreement',source_url:'https://example.com/source',...extra};}
function asset(extra){return proof({presence:'unknown',condition:'unknown',access:'unknown',action:'new',payer:'proton',cost_basis:'quote',low_usd:100000,base_usd:120000,high_usd:150000,paid_usd:20000,capacity_kw:1000,...extra});}
function record(){return {id:'test-site',custom_fields:{retained:'original'}};}
function save(site,type,value,id){const result=D.apply(site,{revision:D.state(site).revision,type,id,value},NOW);assert.equal(result.ok,true,result.err);return {...site,custom_fields:{...site.custom_fields,[D.KEY]:result.diligence}};}
function north(){return {...L.adapter.normalize(data.projects.find(p=>String(p.lfid)==='10540')),source:'lmop-landfill'};}
test('all 2,755 source records retain exact landfill matches and North Dade has its original equipment/gas fields',()=>{
  assert.equal(data.projects.length,2755);assert.equal(data.projects.filter(p=>p.infrastructureMatched).length,2755);
  const c=north(),sd=c.sourceDetail;
  assert.equal(sd.wellCount,136);assert.equal(sd.flareCount,2);assert.equal(sd.methanePct,34.2);assert.equal(sd.gccsCapacityCfm,1000);
  assert.equal(sd.lfgCollectedYear,2022);assert.equal(sd.lfgFlaredYear,2022);assert.equal(c.existingGenerationKw,null);assert.equal(c.offtakeState,null);
  const p=D.profile(c,null,{screened:C.usableCapacity(c),meta:data,now:NOW});
  assert.equal(p.capacity.screenedKw,2561);assert.equal(p.capacity.contractedKw,null);assert.equal(p.capacity.flowRatingConflict,true);
  assert.equal(p.budget.base,null);assert.equal(p.budget.missing.length,14);assert.match(p.inventory[0].finding,/136 wells, 2 flares/);
  assert.equal(p.source.reportingPeriod,'2024-09-04');assert.match(p.source.importedOn,/2026/);
});
test('workbook joins use exact identifiers, retain zero, and reject ambiguous rows',()=>{
  const h=['Landfill ID','Number of Wells','Percent Methane','Number of Flares'];
  const result=enrich([{id:'p',lfid:'7'},{id:'other',lfid:'70'}],[h,['7','0','0','0']]);
  assert.equal(result.projects[0].wellCount,0);assert.equal(result.projects[0].methanePct,0);assert.equal(result.projects[1].infrastructureMatched,false);
  assert.throws(()=>enrich([],[h,['7','1'],['7','2']]),/Duplicate landfill ID/);
});
test('planned generation, shutdowns and project labels cannot establish gas rights or reusable equipment',()=>{
  const planned={...data.projects.find(p=>p.projectStatus==='Planned'&&p.ratedMw>0)};
  assert.equal(L.adapter.normalize(planned).existingGenerationKw,null);
  assert.equal(L.offtakeFor({projectStatus:'Shutdown'}),null);assert.equal(L.offtakeFor({projectStatus:'Candidate'}),null);
  const inv=I.inventory({energyType:'landfill_gas',existingGenerationKw:1000,sourceDetail:{projectStatus:'Shutdown',infraConditionVerified:true,collectionSystem:'Yes'}});
  assert.equal(inv.conditionVerified,false);assert.equal(inv.gasTreatment,'unknown');assert.equal(inv.electrical,'unknown');assert.equal(inv.civil,'unknown');
  assert.equal(I.inventory({sourceDetail:{hasExistingControls:false,lmrCohort:'jan_2029'}}).collection,'unknown');
  assert.equal(I.capitalAvoided({powerPotentialKw:1000,sourceDetail:{infraConditionVerified:true}}).avoidedUsd,null);
});
test('capacity preserves zero, excludes placeholders, uses reported composition and avoids double net derating',()=>{
  const c=north();assert.equal(C.usableCapacity({...c,sourceDetail:{...c.sourceDetail,methanePct:0}}).kw,0);
  assert.equal(C.usableCapacity({...c,sourceDetail:{...c.sourceDetail,lfgCollectedMmscfd:0}}).kw,0);
  assert.equal(C.usableCapacity({...c,sourceDetail:{capacityBasis:'nominal 100 kW placeholder'}}).kw,null);
  assert.equal(C.usableCapacity({source:'eia-facility',energyType:'grid_facility',powerPotentialKw:1000,sourceDetail:{}}).kw,1000);
  assert.equal(C.assumptionsFor({sourceDetail:{methanePct:null}}).methanePct,50);
  assert.equal(C.usableCapacity(null).kw,null);
});
test('zero reported net generation is zero utilization, and capacity factor is not hours online',()=>{
  const f=F.adapter.normalize({id:'eia-zero',nameplateMw:1,cfCurrent:0,cfBaseline:.9,technology:'Natural Gas Fired Combined Cycle',status:'OP'});
  assert.equal(f.dutyCyclePct,0);assert.equal(f.sourceDetail.dutyBasis,'measured');
  const av=A.evaluate({...f,source:'eia-facility'});assert.equal(av.uptimePct,0);assert.match(av.note,/net generation divided/);assert.doesNotMatch(av.note,/Ran|floor|ceiling/);
});
test('unknown budget is not zero; shared funding and paid-to-date reconcile exactly once',()=>{
  assert.equal(D.budget(record(),NOW).base,null);
  let r=save(record(),'asset',asset({payer:'shared',proton_share_pct:50,paid_usd:10000}),'generation');
  const b=D.budget(r,NOW,1000);assert.equal(b.low,40000);assert.equal(b.base,50000);assert.equal(b.high,65000);assert.equal(b.paid,10000);assert.equal(b.complete,false);
  assert.equal(D.budget(r,NOW,2000).base,null,'quote cannot price a larger deployment');
});
test('bundled quotes do not duplicate scope or payments and reject cycles',()=>{
  let r=save(record(),'asset',asset(),'generation');
  r=save(r,'asset',asset({action:'included',included_in:'generation',low_usd:null,base_usd:null,high_usd:null,paid_usd:0}),'gas_treatment');
  let b=D.budget(r,NOW,1000);assert.equal(b.base,100000);assert.equal(b.paid,20000);assert.equal(b.priced.length,2);
  const cycle=D.apply(r,{revision:D.state(r).revision,type:'asset',id:'generation',value:asset({action:'included',included_in:'gas_treatment',low_usd:null,base_usd:null,high_usd:null,paid_usd:0})},NOW);assert.equal(cycle.ok,false);assert.match(cycle.err,/refer back/);
});
test('stale/expired quotes lose budget coverage while actual payments remain recorded',()=>{
  const r=save(record(),'asset',asset({quote_expires:'2026-09-06'}),'generation'),b=D.budget(r,NOW,1000);
  assert.equal(b.base,null);assert.equal(b.paid,20000);assert.match(b.lines.find(x=>x.id==='generation').reason,/expired/);
});
test('reuse needs component inspection, access and sufficient scope; a site-wide flag is irrelevant',()=>{
  const raw=record(),bad=asset({action:'reuse',low_usd:0,base_usd:0,high_usd:0,paid_usd:0});
  assert.equal(D.apply(raw,{revision:0,type:'asset',id:'generation',value:bad},NOW).ok,false);
  const r=save(raw,'asset',{...bad,presence:'present',condition:'working',access:'agreed'},'generation');
  assert.equal(D.budget(r,NOW,1000).base,0);assert.equal(D.budget(r,NOW,2000).base,null);
});
test('capacity allocation requires an explicit current agreement and expires without becoming zero',()=>{
  let r=record();assert.equal(D.apply(r,{revision:0,type:'capacity',value:proof({target_kw:1000,contracted_kw:0,rights_confirmed:false})},NOW).ok,false);
  r=save(r,'capacity',proof({target_kw:1000,contracted_kw:0,rights_confirmed:true,contract_expires:'2026-09-08'}));
  assert.equal(D.capacity(north(),r,{kw:2561},NOW).contractedKw,0);
  assert.equal(D.capacity(north(),r,{kw:2561},Date.parse('2026-09-09')).contractedKw,null);
});
test('validation rejects stale edits, impossible costs and unsafe provenance',()=>{
  const r=save(record(),'asset',asset(),'generation');
  assert.equal(D.apply(r,{revision:0,type:'asset',id:'generation',value:asset()},NOW).ok,false);
  for(const change of [{base_usd:90000},{low_usd:-1},{checked_on:'2027-01-01'},{source_url:'javascript:alert(1)'},{payer:'shared',proton_share_pct:150},{paid_usd:130000}])assert.equal(D.apply(record(),{revision:0,type:'asset',id:'generation',value:asset(change)},NOW).ok,false,JSON.stringify(change));
});
function setup(){const storage={},uploads=[];let blocked=false;global.SiteData=S;global.CrmConfig=undefined;global.SyncEngine={save:(...x)=>uploads.push(x)};global.localStorage={getItem:k=>storage[k]||null,setItem:(k,v)=>{if(blocked)throw Error('quota');storage[k]=v;}};return {uploads,block:()=>{blocked=true;}};}
test('real persistence keeps CRM, relationship maps and other custom fields, and never uploads a failed write',()=>{
  const h=setup(),c=north();const site=S.add({id:c.id,name:c.name,quoted_rate:.03,contact_name:'Keep contact',custom_fields:{_proton_relationship_map_v1:{test:'retain'},private:'keep'}});
  const command={revision:0,type:'asset',id:'generation',value:asset()};
  assert.equal(Ui.commit(c,command).ok,true);const saved=S.get(site.id);assert.equal(saved.contact_name,'Keep contact');assert.equal(saved.quoted_rate,.03);assert.deepEqual(saved.custom_fields._proton_relationship_map_v1,{test:'retain'});assert.equal(saved.custom_fields.private,'keep');
  const before=JSON.stringify(saved),count=h.uploads.length;h.block();assert.equal(Ui.commit(c,{...command,revision:1}).ok,false);assert.equal(JSON.stringify(S.get(site.id)),before);assert.equal(h.uploads.length,count);
});
test('all four rendered sections expose dated evidence, missing costs and safe source links',()=>{
  const c=north();c.name='<img src=x onerror=alert(1)>';c.sourceDetail.landfillOperator=c.name;c.sourceSnapshot.sourceUrl='javascript:alert(1)';
  const buckets=Ui.renderBuckets(c,{screened:C.usableCapacity(c),meta:data,metrics:{monthly_net:-1000}});
  assert.deepEqual(Object.keys(buckets).sort(),['capacity','econ','evidence','scores']);
  assert.match(buckets.capacity,/136 wells, 2 flares/);assert.match(buckets.capacity,/Budget incomplete/);assert.match(buckets.capacity,/34.2% methane/);
  assert.match(buckets.evidence,/2022/);assert.doesNotMatch(buckets.evidence,/<img|href="javascript:/);assert.match(buckets.econ,/-\$1,000/);
  assert.doesNotMatch(buckets.capacity,/Mark verified after inspection|valued in full/);
  const facility=Ui.renderBuckets({source:'eia-facility',sourceDetail:{},powerPotentialKw:1000},{screened:{kw:1000}});
  assert.match(facility.capacity,/Nameplate basis for screening/);assert.doesNotMatch(facility.capacity,/Screened net potential/);
});
