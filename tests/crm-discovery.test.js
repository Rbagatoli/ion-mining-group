'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),S=require('../crm/discovery-model');
const filters={query:'',location:'',kind:'all',country:'',generation:false,cash:'',minMw:'',maxMw:'',tracking:''};
const site={id:'lmop:123',name:'Énergie North Ridge',operator:'Waste Management',iso3:'USA',energyType:'landfill_gas',existingGenerationKw:750,powerPotentialKw:1800,lat:0,lng:0,sourceDetail:{state:'TX',city:'Fort Worth',county:'Tarrant'}};

test('capital searches use the priced plan and distinguish reported equipment from documented reuse',()=>{
 const row={kw:498,cash:1800000,infrastructureReported:true,reuseDocumented:false};
 assert(S.matchCapacity(row,{...filters,minMw:'.498',maxMw:'.498'}));
 assert(!S.matchCapacity(row,{...filters,minMw:'1'}));
 assert(S.matchInfrastructure(row,{infrastructure:'reported'}));assert(!S.matchInfrastructure(row,{infrastructure:'reuse'}));
 assert(S.matchInfrastructure({...row,reuseDocumented:true},{infrastructure:'reuse'}));
});
test('search tolerates accents, punctuation and word order; short region codes match whole words',()=>{
 assert(S.matchCandidate(site,{...filters,query:'management energie'},null));assert(S.matchCandidate(site,{...filters,location:'Texas Fort Worth'},null));assert(S.matchCandidate(site,{...filters,location:'TX'},null));assert(!S.matchCandidate(site,{...filters,location:'CA'},null));assert(S.location(site).includes('Texas'));
 assert(S.matchCandidate({...site,iso3:'CAN',sourceDetail:{province:'QC',city:'Montréal'}},{...filters,location:'Montreal Quebec Canada'},null));
});
test('capacity and capital filters preserve unknowns and valid zero, with inclusive boundaries',()=>{
 assert(S.matchCapacity({kw:1800},{...filters,minMw:'1.8',maxMw:'1.8'}));assert(!S.matchCapacity({kw:null},{...filters,minMw:'0'}));assert(S.matchCapacity({kw:0},{...filters,maxMw:'0'}));
 assert(!S.matchCash({cash:null},{cash:'0'}));assert(S.matchCash({cash:0},{cash:'0'}));assert(S.matchCash({cash:null},{cash:''}));assert(!S.matchCash({cash:1001},{cash:'1000'}));
});
test('generation is positive source evidence and tracking follows actual saved identity',()=>{
 assert(S.matchCandidate(site,{...filters,generation:true,tracking:'saved'},{}));for(const existingGenerationKw of [null,undefined,0,-1])assert(!S.matchCandidate({...site,existingGenerationKw},{...filters,generation:true},null));assert(!S.matchCandidate(site,{...filters,tracking:'new'},{}));
});
test('invalid limits give an actionable error; coordinates exclude missing and invalid points',()=>{
 assert(S.validate({...filters,minMw:'5',maxMw:'1'}));for(const cash of ['-1','NaN','Infinity'])assert(S.validate({...filters,cash}));assert.equal(S.validate(filters),'');assert(S.coordinates(site));for(const [lat,lng]of [[null,0],[0,null],[91,0],[0,181],['1',2]])assert(!S.coordinates({lat,lng}));
});
test('location suggestions are deduplicated and respect country selection',()=>{
 const ca={...site,iso3:'CAN',sourceDetail:{province:'AB',city:'Calgary'}};assert.deepEqual(S.suggestions([site,site,ca],'USA'),['Fort Worth, Texas','Texas']);
});
test('MW slider pushes crossing handles, keeps its upper end unbounded and supports exact input above the scale',()=>{
 assert.deepEqual(S.sliderBounds(filters),{low:0,high:5,ceiling:5});
 let f=S.moveSlider({...filters,maxMw:'1'},'min',2,5);assert.equal(f.minMw,'2');assert.equal(f.maxMw,'2');
 f=S.moveSlider(f,'max',0,5);assert.equal(f.minMw,'');assert.equal(f.maxMw,'0');
 f=S.moveSlider(f,'max',5,5);assert.equal(f.maxMw,'');assert(S.matchCapacity({kw:500000},f));
 const exact={...filters,minMw:'8.125',maxMw:'8.125'},bounds=S.sliderBounds(exact);assert(bounds.ceiling>8.125);assert(S.matchCapacity({kw:8125},exact));assert(!S.matchCapacity({kw:8126},exact));
 assert.equal(S.mw(8125),'8.125 MW');assert.equal(S.mw(null),'MW unknown');
});

const powerPlant=(detail={})=>({id:'eia_fixture',name:'Power source',energyType:'grid_facility',iso3:'USA',existingGenerationKw:10000,availableMiningMw:null,availabilityStatus:'unverified',sourceDetail:{sector:'IPP Non-CHP',statusCapacityMw:{OP:10},technologyCapacityMw:{'Natural Gas Fired Combustion Turbine':10},...detail}});
test('producer scope separates electricity producers, captive generation, storage and fuel opportunities',()=>{
 const producer=powerPlant(),hospital=powerPlant({sector:'Commercial CHP'}),industry=powerPlant({sector:'Industrial Non-CHP'}),battery=powerPlant({technologyCapacityMw:{Batteries:10}}),standby=powerPlant({statusCapacityMw:{SB:10}});
 assert.equal(S.energyRole(producer).id,'producers');assert.equal(S.energyRole(hospital).id,'onsite');assert.equal(S.energyRole(industry).id,'onsite');assert.equal(S.energyRole(battery).id,'storage');assert.equal(S.energyRole(standby).id,'inactive');
 assert.equal(S.energyRole(site).id,'resources');assert.equal(S.energyRole({...site,energyType:'flare_gas'}).id,'resources');
 assert(!S.matchCandidate(battery,{...filters,supplyScope:'all',generation:true},null),'storage capacity is not reported generation');
 assert.match(S.energyRole(producer).reason,/allocation.*unconfirmed/);assert.match(S.energyRole(hospital).reason,/surplus.*not established/);
 const rows=[producer,hospital,industry,battery,standby,site],before=JSON.stringify(rows);
 assert.deepEqual(rows.filter(c=>S.matchCandidate(c,{...filters,supplyScope:'producers'},null)),[producer]);
 assert.deepEqual(rows.filter(c=>S.matchCandidate(c,{...filters,supplyScope:'supply'},null)),[producer,site]);
 assert(S.matchCandidate({...site,energyType:'flare_gas'},{...filters,supplyScope:'supply'},null),'default supply scope includes flare resources');
 for(const powerPotentialKw of [0,-1,NaN]){
   const noResource={...site,powerPotentialKw};
   assert.equal(S.energyRole(noResource).id,'unconfirmed');
   assert(!S.matchCandidate(noResource,{...filters,supplyScope:'supply'},null));
   assert(S.matchCandidate(noResource,{...filters,supplyScope:'all'},null),'unusable or malformed resource evidence is retained for review');
 }
 assert(S.matchCandidate({...site,availableMiningMw:null},{...filters,supplyScope:'supply'},null),'unverified sale allocation is not proof that a real energy resource is unusable');
 assert.deepEqual(rows.filter(c=>S.matchCandidate(c,{...filters,supplyScope:'onsite'},null)),[hospital,industry]);
 assert.deepEqual(rows.filter(c=>S.matchCandidate(c,{...filters,supplyScope:'storage'},null)),[battery]);
 assert.deepEqual(rows.filter(c=>S.matchCandidate(c,{...filters,supplyScope:'resources'},null)),[site]);
 assert.equal(rows.filter(c=>S.matchCandidate(c,{...filters,supplyScope:'all'},null)).length,rows.length);
 assert.equal(rows.filter(c=>S.matchCandidate(c,filters,null)).length,rows.length);assert.equal(JSON.stringify(rows),before);
});
test('mixed status and technology totals cannot pass an operating battery with an offline generator as a producer',()=>{
 const ambiguous=powerPlant({statusCapacityMw:{OP:5,OS:5},technologyCapacityMw:{Batteries:5,'Natural Gas Fired Combustion Turbine':5}});
 assert.equal(S.energyRole(ambiguous).id,'unconfirmed');
 // With 6 MW OP and only 5 MW that could be storage, some generation must operate.
 assert.equal(S.energyRole(powerPlant({statusCapacityMw:{OP:6,OS:4},technologyCapacityMw:ambiguous.sourceDetail.technologyCapacityMw})).id,'producers');
 assert.equal(S.energyRole(powerPlant({statusCapacityMw:{OP:10},technologyCapacityMw:{Batteries:5,'All Other':5}})).id,'unconfirmed');
 assert.equal(S.energyRole(powerPlant({statusCapacityMw:{OP:5,OS:5},technologyCapacityMw:{'Natural Gas Fired Combustion Turbine':10}})).id,'producers');
 assert.equal(S.energyRole(powerPlant({technologyCapacityMw:{'Solar Thermal with Energy Storage':10}})).id,'producers');
 assert.equal(S.energyRole(powerPlant({technologyCapacityMw:{'Hydroelectric Pumped Storage':10}})).id,'storage');
});
test('missing, malformed and inconsistent supply evidence stays outside the operating producer lane',()=>{
 for(const sourceDetail of [{sector:null},{statusCapacityMw:null},{technologyCapacityMw:null},{statusCapacityMw:{OP:'10'}},{statusCapacityMw:{OP:10,OS:-2}},{technologyCapacityMw:{'Natural Gas Fired Combustion Turbine':9}},{statusCapacityMw:{OP:0}}]){
   const c=powerPlant(sourceDetail);assert.notEqual(S.energyRole(c).id,'producers');assert(!S.matchCandidate(c,{...filters,supplyScope:'producers'},null));assert(S.matchCandidate(c,{...filters,supplyScope:'all'},null));
 }
 assert.equal(S.energyRole({name:'Generic factory',existingGenerationKw:10000}).id,'unconfirmed');
 assert(!S.matchCandidate({name:'Generic factory',existingGenerationKw:10000},{...filters,supplyScope:'supply'},null),'generic facilities never enter the supply view');
 assert.equal(S.energyRole(powerPlant({sector:'Commercial Non-CHP',technologyCapacityMw:{Batteries:10}})).id,'storage');
});
test('the real EIA adapter preserves enough evidence for producer discovery without inventing available power',()=>{
 const F=require('../source-facility'),records=require('../data/facilities.json').facilities;
 for(const [id,expected]of [['eia_2','producers'],['eia_10042','onsite'],['eia_10175','onsite']]){
   const raw=records.find(f=>f.id===id),c=F.adapter.normalize(raw);assert(raw);assert.equal(S.energyRole(c).id,expected);assert.equal(c.availableMiningMw,null);assert.equal(c.availabilityStatus,'unverified');
 }
 const storage=records.find(f=>f.energyTechnologies.length===1&&f.energyTechnologies[0]==='storage'&&Object.keys(f.technologyCapacityMw).every(t=>t==='Batteries'));
 assert.equal(S.energyRole(F.adapter.normalize(storage)).id,'storage');
 const standby=records.find(f=>f.sector==='Electric Utility'&&!f.statusCapacityMw.OP&&f.energyTechnology==='oil');
 assert.equal(S.energyRole(F.adapter.normalize(standby)).id,'inactive');
});
