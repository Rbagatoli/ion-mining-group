'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),S=require('../crm/discovery-model');
const filters={query:'',location:'',kind:'all',country:'',generation:false,cash:'',minMw:'',maxMw:'',tracking:''};
const site={id:'lmop:123',name:'Énergie North Ridge',operator:'Waste Management',iso3:'USA',energyType:'landfill_gas',existingGenerationKw:750,powerPotentialKw:1800,lat:0,lng:0,sourceDetail:{state:'TX',city:'Fort Worth',county:'Tarrant'}};
test('search tolerates accents, punctuation and word order; short region codes match whole words',()=>{
 assert(S.matchCandidate(site,{...filters,query:'management energie'},null));assert(S.matchCandidate(site,{...filters,location:'Texas Fort Worth'},null));assert(S.matchCandidate(site,{...filters,location:'TX'},null));assert(!S.matchCandidate(site,{...filters,location:'CA'},null));assert(S.location(site).includes('Texas'));
 assert(S.matchCandidate({...site,iso3:'CAN',sourceDetail:{province:'QC',city:'Montréal'}},{...filters,location:'Montreal Quebec Canada'},null));
});
test('capacity and capital filters preserve unknowns and valid zero, with inclusive boundaries',()=>{
 assert(S.matchCandidate(site,{...filters,minMw:'1.8',maxMw:'1.8'},null));assert(!S.matchCandidate({...site,powerPotentialKw:null},{...filters,minMw:'0'},null));assert(S.matchCandidate({...site,powerPotentialKw:0},{...filters,maxMw:'0'},null));
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
 f=S.moveSlider(f,'max',5,5);assert.equal(f.maxMw,'');assert(S.matchCandidate({...site,powerPotentialKw:500000},f,null));
 const exact={...filters,minMw:'8.125',maxMw:'8.125'},bounds=S.sliderBounds(exact);assert(bounds.ceiling>8.125);assert(S.matchCandidate({...site,powerPotentialKw:8125},exact,null));assert(!S.matchCandidate({...site,powerPotentialKw:8126},exact,null));
 assert.equal(S.mw(8125),'8.125 MW');assert.equal(S.mw(null),'MW unknown');
});
