'use strict';
// Source inventory and remaining project cost require different evidence.
const {test}=require('node:test'),assert=require('node:assert/strict');
const I=require('../site-infrastructure');
test('a shutdown inventories only the specifically reported components',()=>{
  const i=I.inventory({existingGenerationKw:2000,sourceDetail:{collectionSystem:'Yes',projectStatus:'Shutdown',infraConditionVerified:true}});
  assert.equal(i.collection,'present');assert.equal(i.generation,'shutdown');assert.equal(i.conditionVerified,false);
  for(const k of ['gasTreatment','electrical','civil'])assert.equal(i[k],'unknown');
});
test('no reported destruction or candidate status cannot prove missing equipment',()=>{
  const i=I.inventory({sourceDetail:{hasExistingControls:false,lmrCohort:'jan_2029',projectStatus:'Candidate'}});
  assert.equal(i.collection,'unknown');assert.equal(i.generation,'unknown');
});
test('equipment presence, an old shutdown and a global inspection flag cannot price reuse savings',()=>{
  for(const projectStatus of ['Operational','Shutdown','Planned','Candidate']){
    const c={powerPotentialKw:5000,existingGenerationKw:5000,sourceDetail:{collectionSystem:'Yes',projectStatus,projectShutdownDate:'1999-01-01',infraConditionVerified:true}};
    const r=I.capitalAvoided(c);assert.equal(r.avoidedUsd,null);assert.equal(r.requiredUsd,null);assert.equal(r.totalBuildUsd,null);assert.equal(I.avoidedScore(c),null);
  }
});
