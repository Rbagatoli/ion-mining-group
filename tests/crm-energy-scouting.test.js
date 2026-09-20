'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../crm/energy-scouting'),G=require('../crm/grok-team'),A=require('../agent-control-model');
const brief=E.normalizeBrief({client:'Synthetic A',reference:'A-v1',minMw:1,maxMw:2,states:['PA'],energySources:['nuclear'],maxDeliveredCentsKwh:7,maxEnergyCentsKwh:4,maxSiteCapitalUsd:250000,supply:'electricity',operation:'continuous',connectionReadiness:'any',minTermMonths:12});
const record={id:'eia:synthetic',name:'Synthetic nuclear plant',iso3:'USA',energyType:'grid_facility',existingGenerationKw:1500000,powerPotentialKw:1500000,sourceDetail:{plantCode:'test-123',state:'PA',technology:'Nuclear'},sourceSnapshot:{sourceUrl:'https://example.test/eia',reportingPeriod:'2026-07-01'}};
const now=new Date().toISOString(),today=now.slice(0,10);
const raw={recordedBy:'Synthetic recorder',source:'https://example.test/owner; owner confirmation for A-v1',asOf:today,ownerConfirmed:'on',availableMw:'1.5',deliveredCentsKwh:'6',energyCentsKwh:'3',capitalUsd:'200000',rights:'available',supply:'electricity',operation:'continuous',termMonths:'24'};
function savedFor(b=brief){const value=E.saveEvidence({},raw,now);value.current.brief=b;return {custom_fields:{unrelated:{keep:true},[E.KEY]:value}};}
test('a client load is explicit and brief ceilings compare only their stated price basis',()=>{
 for(const minMw of ['',null,undefined])assert.throws(()=>E.normalizeBrief({minMw}),/minimum load/);
 assert.throws(()=>E.normalizeBrief({minMw:'NaN'}));
 const b=E.normalizeBrief({...brief,costBasis:'energy_only',maxEnergyCentsKwh:4,maxDeliveredCentsKwh:7});assert.equal(b.maxEnergyCentsKwh,4);assert.equal(b.maxDeliveredCentsKwh,7);
 assert.match(E.briefText(brief),/minimum term: 12 months/);assert.match(E.briefText(brief),/not a maximum plant nameplate/);
});
test('large public plants remain candidates with unknown allocation and preserved source period',()=>{
 const c=E.candidate(record);assert.deepEqual(c.energyTypes,['nuclear']);assert.equal(c.nameplateMw,1500);assert.equal(c.observedAt,'2026-07-01');
 const result=E.assess(record,null,brief);assert.equal(result.status,'needs_confirmation');assert.equal(result.candidate.availableMw,null);assert.equal(result.candidate.capitalUsd,null);assert.equal(result.disqualifiers.length,0);
});
test('owner terms apply only to the exact client, brief version, load and delivery scope',()=>{
 const site=savedFor();assert.equal(E.assess(record,site,brief).status,'qualified_for_review');
 for(const changed of [{client:'Synthetic B'},{reference:'A-v2'},{minMw:.5},{maxEnergyCentsKwh:3},{maxDeliveredCentsKwh:6},{notes:'A different delivery point'}]){
  const result=E.assess(record,site,{...brief,...changed});assert.equal(result.status,'needs_confirmation');assert.equal(result.candidate.availableMw,null);assert(result.missing.some(s=>s.includes('another brief/version')));
 }
 assert.equal(E.candidate(record,site).evidenceAppliesToBrief,false);
});
test('reported terms cannot qualify, blank stays unknown, zero remains real and history is retained',()=>{
 const first=E.saveEvidence({}, {...raw,ownerConfirmed:'',capitalUsd:'0',availableMw:''},now);first.current.brief=brief;
 assert.equal(first.current.evidence.availableMw,undefined);assert.equal(first.current.evidence.capitalUsd.value,0);
 assert.equal(E.assess(record,{custom_fields:{[E.KEY]:first}},brief).status,'needs_confirmation');
 const second=E.saveEvidence(first,raw,now);assert.equal(second.history.length,1);assert.deepEqual(second.history[0],first.current);assert.equal(first.history.length,0);
 assert.throws(()=>E.saveEvidence({}, {...raw,asOf:'2026-02-31'},now),/actual evidence date/);
 assert.throws(()=>E.saveEvidence({}, {...raw,uptimePct:'101'},now),/nonnegative/);
});
test('hard client exclusions precede ranking and storage requires charging evidence',()=>{
 assert.equal(E.assess(record,savedFor(),{...brief,excludedStates:['PA'],states:[]}).status,'excluded');
 const storage={...record,sourceDetail:{...record.sourceDetail,technology:'Batteries'}};
 const b=E.normalizeBrief({...brief,energySources:['storage']});const result=E.assess(storage,savedFor(b),b);assert.equal(result.status,'needs_confirmation');assert(result.missing.some(s=>/charging/i.test(s)));
});
test('energy research and its linked Quality task preserve sole writer and no-send boundaries',()=>{
 const draft=E.assignment({brief,candidate:record});assert.equal(draft.role,'supply');assert.match(draft.brief,/ZERO external/);assert.match(draft.brief,/Revenue alone writes CRM/);assert.match(draft.brief,/hydro, nuclear/);
 const source={id:'source',...draft,status:'review',result:'Synthetic completed source research',sources:['https://example.test/source']};
 const qa=G.qualityAssignment(source,'https://example.test/crm/');assert(E.isTask(qa));assert.equal(qa.parentTaskId,'source');assert.match(qa.brief,/ZERO external/);
 const packet=G.packet({...A.initial(),tasks:[source]},source,'https://example.test/crm/');assert.match(packet,/CURRENT ENERGY-SCOUTING SCOPE/);assert.match(packet,/No outreach is authorized/);
 assert.doesNotMatch(packet,/Standing multichannel scope:|Refundable customer security|Aim for three independent suitable suppliers/);assert.match(draft.brief,/Review only this identified site/);
 assert(G.workflows.hosting_fit);assert(G.roles.some(r=>r.id==='supply'));
});
test('unprovided operating requirements are visible unknowns rather than confirmed flexibility',()=>{
 const b=E.normalizeBrief({minMw:1});assert.deepEqual(b.unknownCriteria,['supply','operation','connectionReadiness']);assert.match(E.briefText(b),/Supply: Unknown; confirm with client/);
});
