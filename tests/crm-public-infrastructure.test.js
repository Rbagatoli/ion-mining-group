'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const U=require('../crm/public-infrastructure'),L=require('../source-landfill'),D=require('../prospect-diligence'),P=require('../prospect-capital'),data=require('../data/landfills.json');
const site=lfid=>({...L.adapter.normalize(data.projects.find(p=>String(p.lfid)===String(lfid))),source:'lmop-landfill'});
test('every US landfill record exposes its public inventory without merging sites or writing evidence',()=>{
  let withWells=0,withRating=0;
  for(const raw of data.projects){const c={...L.adapter.normalize(raw),source:'lmop-landfill'},before=JSON.stringify(c),p=U.profile(c);assert.equal(p.lfid,String(raw.lfid));assert.equal(p.metrics[0][1],raw.collectionSystem||'Not reported');if(raw.wellCount!=null)withWells++;if(raw.gccsCapacityCfm!=null)withRating++;U.render(c);assert.equal(JSON.stringify(c),before);}
  assert(withWells>500);assert(withRating>500);assert.equal(U.profile({...site('952'),source:'eccc-landfill-ca'}),null);
  assert.equal(U.profile({...site('952'),sourceDetail:{lfid:'other',collectionSystem:'Yes'}}).documents.length,0,'matching a name cannot import another landfill’s documents');
});
test('North Dade records distinguish flare ratings, diesel backup equipment and draft commercial responsibilities',()=>{
  const c=site('10540'),p=U.profile(c),html=U.render(c),before=P.estimate(c,null);
  assert.equal(p.documents.length,2);assert.match(html,/3,000 scfm/);assert.match(html,/three-phase/);assert.match(html,/draft permit renewal/);assert.match(html,/developer would finance/);assert.match(html,/not established as built/);assert.equal(c.existingGenerationKw,null);
  assert.deepEqual(P.estimate(c,null),before);assert.equal(D.budget(null).complete,false);
});
test('California Street keeps conflicting count and unit scopes with their original sources',()=>{
  const html=U.render(site('90'));assert.match(html,/39 vertical and 24 horizontal/);assert.match(html,/8,500 feet/);assert.match(html,/Lampson Blower/);assert.match(html,/52 wells and 700 acfm/);assert.match(html,/counts and generation description differ/);assert.match(html,/2023-06-09/);assert.match(html,/2023\.do/);
});
test('historical installation evidence is dated and cannot erase unknown condition or grant free reuse',()=>{
  const c=site('952'),html=U.render(c);assert.match(html,/2004-11/);assert.match(html,/conditioning skid/);assert.match(html,/historical|Historical/);
  const e=P.estimate(c,null);assert.equal(e.lines.find(a=>a.id==='gas_treatment').reuse,false);assert.equal(e.inventory.find(a=>a.id==='gas_treatment').condition,'unknown');
});
test('new documents inform the right inventory without overriding field evidence or confirmed funding',()=>{
 const c=site('952'),screened=require('../site-capacity').usableCapacity(c),profile=D.profile(c,null,{screened}),baseline=P.estimate(c,null,{profile,screened});
 const inventory=U.enrichInventory(c,profile.inventory),e=P.estimate(c,null,{screened,profile:{...profile,inventory}});
 assert.equal(e.inventory.find(a=>a.id==='gas_treatment').presence,'historical');assert.equal(e.base,baseline.base);assert.equal(e.reuseSavingUsd,0);assert(e.possibleReuseSavingUsd>baseline.possibleReuseSavingUsd);
 const saved=inventory.map(a=>a.id==='gas_treatment'?{...a,userRecorded:true,presence:'absent',finding:'Inspector reports removed'}:a);
 assert.equal(U.enrichInventory(c,saved).find(a=>a.id==='gas_treatment').finding,'Inspector reports removed');
 const sibling={...c,id:'lmop_1023-1',sourceDetail:{...c.sourceDetail,legacyRecordId:'lmop_1023-1'}};
 assert.equal(U.enrichInventory(sibling,profile.inventory).find(a=>a.id==='gas_treatment').presence,'unknown');
 assert.equal(U.enrichInventory(site('10540'),D.inventory(site('10540'))).find(a=>a.id==='grid').presence,'reported');
 assert.equal(U.enrichInventory(site('90'),D.inventory(site('90'))).find(a=>a.id==='gas_treatment').presence,'unknown');
});
test('missing values, zeros and source text remain honest and safe',()=>{
  const c=site('952');c.sourceDetail={...c.sourceDetail,lfid:'unknown',wellCount:0,flareCount:null,flaresInPlace:'Yes',gccsCapacityCfm:null,lfgCollectedMmscfd:0,lfgCollectedYear:2022,methanePct:0,collectionSystem:'<img src=x onerror=alert(1)>',infrastructureSourceUrl:'javascript:alert(1)'};
  const p=U.profile(c),html=U.render(c);assert.equal(p.metrics[1][1],'0');assert.equal(p.metrics[2][1],'Yes · count unreported');assert.equal(p.metrics[3][1],'Not reported');assert.match(html,/0 mmscfd · 2022/);assert.match(html,/0%/);assert.doesNotMatch(html,/<img|href="javascript:/);assert.match(html,/&lt;img/);assert.match(html,/have not yet been reviewed/);
});
