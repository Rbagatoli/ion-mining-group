'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const E=require('../crm/energy-scouting'),M=require('../energy-opportunity-matching'),S=require('../crm/sourcing-model');
const now='2026-09-20T12:00:00.000Z';
const copy=x=>JSON.parse(JSON.stringify(x));
function request(service='custom_search',brief={}){return {id:'REQ-synthetic-1',service,revision:2,briefRevision:1,status:'qualified',receivedAt:now,routeEmail:'energy@protonminingco.com',queue:{state:'not_queued'},payload:{service,contact:{name:'Synthetic Client',email:'private@example.test',phone:'+1 555 555 5555'},brief:{power:{value:160,unit:'kW'},country:'US',geography:'Pennsylvania',transaction:'Lease or purchase',upfrontBudget:{amount:100000,currency:'USD'},timing:'Within six months',costBasis:'All-in delivered energy',existingOpportunities:'',siteDetails:'',acquisitionSource:'Synthetic referral',sourceTypes:['hydro'],notes:'',...brief},attribution:{source:'synthetic'},consent:true}};}
function candidate(extra={}){return M.fromFacility({id:'synthetic-plant',plantCode:'123',name:'Synthetic Plant',state:'PA',technology:'Conventional Hydroelectric',nameplateMw:10,...extra});}
function route(extra={}){return {id:'route-1',partnerId:'partner-1',partnerName:'Synthetic Owner',partnerKind:'owner',originatingSource:'Direct site submission',sourceReference:'Private request REQ-synthetic-1',authority:'unverified',contactRoute:'Owner office via authenticated private inbox',lastConfirmedAt:null,introductionTerms:'Unknown; confirm before introduction',requestId:'REQ-synthetic-1',recordedBy:'Synthetic Revenue',...extra};}
test('request provenance retains recorded legacy routes and never invents a missing mailbox',()=>{
  const legacy=request(),before=copy(legacy);assert.equal(S.requestRef(legacy).routeEmail,'energy@protonminingco.com');assert.deepEqual(legacy,before);
  const current={...request(),routeEmail:'sales@protonminingco.com'};assert.equal(S.requestRef(current).routeEmail,'sales@protonminingco.com');
  const unknown=request();delete unknown.routeEmail;assert.equal(S.requestRef(unknown).routeEmail,'Not recorded');assert.match(S.researchDraft(unknown).brief,/Intake route: Not recorded/);
});
test('wire adapter preserves exact kW conversion, original units, currency and stable immutable request identity',()=>{
  const input=request(),before=copy(input),b=S.fromRequest(input);assert.equal(b.minMw,.16);assert.deepEqual(b.power,{value:160,unit:'kW'});assert.equal(b.maxSiteCapitalUsd,100000);assert.equal(b.country,'USA');assert.equal(b.id,input.id);assert.equal(b.revision,'1');assert.equal(b.transaction,'Lease or purchase');assert.equal(b.acquisitionSource,'Synthetic referral');assert.deepEqual(input,before);
  const changed=copy(input);changed.revision=8;changed.queue={state:'draft_saved',taskId:'task-123',briefId:input.id};assert.deepEqual(S.fromRequest(changed),b);assert.deepEqual(S.researchDraft(changed),S.researchDraft(input));
});
test('CAD and unknown budgets never silently become USD; amount zero stays explicit',()=>{
  const cad=S.fromRequest(request('custom_search',{upfrontBudget:{amount:100000,currency:'CAD'}}));assert.equal(cad.upfrontBudget.currency,'CAD');assert.equal(cad.maxSiteCapitalUsd,null);assert(M.evaluate(candidate(),cad,{now}).missing.some(s=>s.includes('CAD')));
  const unknown=S.fromRequest(request('site_review',{power:{value:null,unit:'kW'},upfrontBudget:{amount:null,currency:'unknown'},siteDetails:'Supplied synthetic site'}));assert.equal(unknown.minMw,null);assert.equal(unknown.upfrontBudget.amount,null);assert.equal(unknown.upfrontBudget.currency,null);assert.match(S.researchDraft(request('site_review',{power:{value:null,unit:'kW'},siteDetails:'Supplied synthetic site'})).brief,/minimum Unknown MW/);
  assert.equal(S.fromRequest(request('custom_search',{upfrontBudget:{amount:0,currency:'USD'}})).maxSiteCapitalUsd,0);
});
test('new unknown search intake is preserved but cannot fabricate a one-MW research requirement',()=>{
  const r=request('custom_search',{power:{value:null,unit:'MW'}}),b=S.fromRequest(r);assert.equal(b.minMw,null);assert.throws(()=>S.researchDraft(r),/usable-power requirement/);assert(M.evaluate(candidate(),b,{now}).missing.some(s=>s.includes('usable-power')));
  assert.throws(()=>E.normalizeBrief({minMw:''}),/minimum load/);assert.equal(M.normalizeBrief().minMw,1); // Legacy matching default remains unchanged.
});
test('legacy explicit brief semantics, source dates, unknown requirements and USD budget remain intact',()=>{
  const legacy={client:'Legacy customer',reference:'v1',minMw:2,maxSiteCapitalUsd:250000,states:['PA'],knownSiteExclusions:['old-site'],notes:'Existing connection'};
  const b=E.normalizeBrief(legacy);assert.equal(b.service,'custom_search');assert.equal(b.minMw,2);assert.equal(b.maxSiteCapitalUsd,250000);assert.deepEqual(b.knownSiteExclusions,['old-site']);assert.equal(b.notes,legacy.notes);assert.deepEqual(b.unknownCriteria,['supply','operation','connectionReadiness']);assert.deepEqual(E.normalizeBrief(b),b);
});
test('custom search excludes exact known/rejected records and keeps unresolved narrative exclusions visible',()=>{
  const c=candidate(),b=E.normalizeBrief({service:'custom_search',minMw:.16,existingOpportunities:[{siteId:c.id,reference:'Prior reviewed offer',disposition:'rejected'}]});assert.equal(M.evaluate(c,b,{now}).status,'excluded');assert.throws(()=>E.assignment({brief:b,candidate:c}),/already known or rejected/);
  const narrative=S.fromRequest(request('custom_search',{existingOpportunities:'A previous offer called Synthetic Plant'}));assert.equal(M.evaluate(c,narrative,{now}).status,'needs_confirmation');assert(M.evaluate(c,narrative,{now}).missing.some(s=>s.includes('exact site IDs')));assert.equal(narrative.knownSiteExclusions.length,0);
});
test('site review deliberately investigates exact supplied known site without discarding adverse fit evidence',()=>{
  const c=candidate(),b=E.normalizeBrief({service:'site_review',minMw:.16,targetSiteIds:[c.id],knownSiteExclusions:[c.id],siteDetails:'Supplied physical site'}),r=M.evaluate(c,b,{now});assert.notEqual(r.status,'excluded');assert(r.reasons.some(s=>s.includes('known-site exclusions')));
  assert.match(E.assignment({brief:b,candidate:c}).brief,/even when it appears in prior known-site exclusions/);
  assert.equal(M.evaluate(candidate({plantCode:'999'}),b,{now}).status,'excluded');assert.throws(()=>E.assignment({brief:b,candidate:candidate({plantCode:'999'})}),/not the exact supplied site/);
  assert.equal(M.evaluate(c,{...b,excludedStates:['PA']},{now}).status,'excluded');
});
test('review target identity is unresolved until explicit mapping; supply submission never launches research',()=>{
  const r=request('site_review',{siteDetails:'Owner-supplied synthetic address'});assert.match(S.researchDraft(r).brief,/Resolve its exact physical identity/);assert(M.evaluate(candidate(),S.fromRequest(r),{now}).missing.some(s=>s.includes('exact physical')));
  assert.throws(()=>S.researchDraft(request('site_submission',{siteDetails:'Synthetic site offered for lease'})),/supply input/);
  assert.throws(()=>S.researchDraft({...request(),status:'received'}),/Qualify/);
});
test('public adapter remains US-only; non-US review requires explicit bounded internal scope and evidence',()=>{
  assert.throws(()=>S.fromRequest(request('site_review',{country:'CA',siteDetails:'Supplied foreign site'})),/US-based/);
  assert.throws(()=>E.normalizeBrief({service:'site_review',scope:'internal_review',country:'CAN',minMw:.16}),/authorization\/evidence/);
  const b=E.normalizeBrief({service:'site_review',scope:'internal_review',internalScopeEvidence:'Explicit synthetic internal scope',country:'CAN',minMw:.16,targetSiteIds:['eia:plant:123'],siteDetails:'Synthetic non-public example'});assert.notEqual(M.evaluate(candidate({iso3:'CAN'}),b,{now}).status,'excluded');assert.equal(M.evaluate(candidate(),b,{now}).status,'excluded');assert.match(E.assignment({brief:b}).brief,/no expansion of US public sourcing coverage/);
});
test('malformed or contradictory units, numbers, budgets and service enums fail without mutation',()=>{
  for(const power of [{value:-1,unit:'kW'},{value:true,unit:'MW'},{value:3,unit:'GW'}])assert.throws(()=>S.fromRequest(request('custom_search',{power})));
  assert.throws(()=>E.normalizeBrief({service:'custom_search',power:{value:160,unit:'kW'},minMw:160}),/disagree/);assert.throws(()=>S.fromRequest(request('custom_search',{upfrontBudget:{amount:-1,currency:'USD'}})));
  assert.throws(()=>E.normalizeBrief({service:'invented',minMw:1}),/service/);
});
test('research draft exposes exact durable receipt reference but does not copy customer contact details or claim execution',()=>{
  const draft=S.researchDraft(request());assert.deepEqual(Object.keys(draft).sort(),['brief','role','title']);assert.match(draft.brief,/Received private request: REQ-synthetic-1/);assert.match(draft.brief,/Immutable brief ID\/version: REQ-synthetic-1 \/ 1/);assert.match(draft.brief,/does not invoke a native agent/);assert.match(draft.brief,/Revenue alone writes CRM/);assert.match(draft.brief,/Quality independently checks/);assert.doesNotMatch(draft.brief,/private@example\.test|555 555 5555/);
  assert.throws(()=>S.requestRef({...request(),status:'local_draft'}),/durable received/);
});
test('acquisition metrics count authenticated received/qualified records once and tolerate arbitrary source labels',()=>{
  const first=request(),second=request('site_review',{siteDetails:'Synthetic review'});second.id='REQ-synthetic-2';second.status='received';second.payload.attribution.source='__proto__';const m=S.metrics([first,second]);assert.equal(m.received,2);assert.equal(m.qualified,1);assert.equal(m.bySource.synthetic.qualified,1);assert.equal(m.bySource.__proto__.received,1);assert.throws(()=>S.metrics([first,first]),/Duplicate/);
});
test('draft linkage and observed acknowledgment remain distinct from native execution',()=>{
  const r=request();r.queue={state:'draft_saved',taskId:'task-1',briefId:r.id,briefRevision:'1'};assert.equal(S.queue([r])[0].state,'draft_saved');assert.equal(S.queue([r])[0].nativeExecution,'not_established');
  r.queue.state='acknowledged';assert.throws(()=>S.queue([r]),/actor, time and evidence/);Object.assign(r.queue,{acknowledgedBy:'Synthetic Revenue',acknowledgedAt:now,evidence:'Observed receipt of exact task-1 in intended queue'});assert.equal(S.queue([r])[0].state,'acknowledged');r.queue.briefId='REQ-other';assert.throws(()=>S.queue([r]),/another private brief/);
});
test('multiple intermediaries link one exact physical site without merging similar names or coordinates',()=>{
  const sites=[{id:'site-1',name:'Same Name',latitude:1,longitude:2,discovery:{sourceId:'eia',sourceRecordId:'plant-123'}},{id:'site-2',name:'Same Name',latitude:1,longitude:2}];assert.equal(S.findPhysicalSite(sites,{name:'Same Name',lat:1,lng:2}),null);assert.equal(S.findPhysicalSite(sites,{sourceId:'eia',sourceRecordId:'plant-123'}).id,'site-1');assert.equal(S.findPhysicalSite(sites,{siteId:'site-2'}).id,'site-2');assert.throws(()=>S.findPhysicalSite([...sites,sites[0]],{siteId:'site-1'}),/Multiple/);
  let data=S.siteRecord(null,{type:'route.upsert',payload:route()},{siteId:'site-1',now});data=S.siteRecord(data,{type:'route.upsert',payload:route({id:'route-2',partnerId:'partner-2',partnerName:'Synthetic Referrer',partnerKind:'referrer'})},{siteId:'site-1',now});assert.equal(data.routes.length,2);assert.deepEqual([...new Set(data.routes.map(r=>r.physicalSiteId))],['site-1']);assert.equal(sites.length,2);
});
test('provenance retry is a no-op; revisions retain original authority evidence and cannot repoint stable IDs',()=>{
  const command={type:'route.upsert',payload:route()},ctx={siteId:'site-1',now};const first=S.siteRecord(null,command,ctx);assert.deepEqual(S.siteRecord(first,command,ctx),first);
  assert.throws(()=>S.siteRecord(first,{type:'route.upsert',payload:route({authority:'owner'})},ctx),/evidence and actual/);assert.equal(first.history.length,1);
  const second=S.siteRecord(first,{type:'route.upsert',payload:route({authority:'owner',authorityEvidence:'Synthetic documented owner authority',lastConfirmedAt:'2026-09-19'})},ctx);assert.equal(second.history[1].previous.authority,'unverified');assert.equal(first.routes[0].authority,'unverified');assert.throws(()=>S.siteRecord(second,{type:'route.upsert',payload:route({partnerId:'different-partner'})},ctx),/cannot be reassigned/);assert.throws(()=>S.siteRecord(first,command,{siteId:'different-site',now}),/Invalid site provenance/);
});
test('research completion is independent of owner interest, terms and each exact client brief fit',()=>{
  const payload={id:'assessment-1',requestId:'REQ-synthetic-1',briefRevision:1,recordedBy:'Synthetic Revenue',research:{status:'completed',reference:'Source result 2',confirmedAt:now,taskId:'task-1',resultVersion:2}},ctx={siteId:'site-1',now};
  const state=S.siteRecord(null,{type:'assessment.record',payload},ctx),a=state.assessments[0];assert.equal(a.research.status,'completed');assert.equal(a.ownerInterest.status,'unknown');assert.equal(a.terms.status,'unknown');assert.equal(a.clientFit.status,'unassessed');
  assert.throws(()=>S.siteRecord(state,{type:'assessment.record',payload:{...payload,ownerInterest:{status:'open_to_discuss'}}},ctx),/own evidence/);assert.throws(()=>S.siteRecord(state,{type:'assessment.record',payload:{...payload,requestId:'REQ-other-client'}},ctx),/cannot be reassigned/);assert.equal(state.history.length,1);
  assert.throws(()=>S.normalizeAssessment({...payload,research:{...payload.research,status:'independently_reviewed',reviewTaskId:'task-1'}},ctx.siteId,now),/cannot be the source/);
});
test('browser API is pure and requires no storage/network globals',()=>{
  const context={ProtonCrmEnergyScouting:E};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../crm/sourcing-model.js'),'utf8'),context);assert.equal(typeof context.ProtonSourcingModel.fromRequest,'function');assert.equal(context.ProtonSourcingModel.fromRequest(request()).minMw,.16);
});
test('actual intake validator preserves legacy-only usable load, zero rate targets and exact catalog IDs downstream',async()=>{
  const {validateSubmission}=await import('../worker-intake/index.mjs');
  const raw=request().payload;Object.assign(raw.brief,{power:{value:null,unit:'kW'},minMw:.16,maxDeliveredCentsKwh:0,maxEnergyCentsKwh:0,knownSiteExclusions:['eia:plant:123','lmop:landfill:456']});
  const received=request();received.payload=validateSubmission(raw);const b=S.fromRequest(received),draft=S.researchDraft(received);
  assert.equal(b.minMw,.16);assert.deepEqual(b.power,{value:null,unit:'kW'});assert.equal(b.maxDeliveredCentsKwh,0);assert.equal(b.maxEnergyCentsKwh,0);assert.deepEqual(b.knownSiteExclusions,['eia:plant:123','lmop:landfill:456']);assert.match(draft.brief,/explicit legacy minimum of 0.16 MW is retained/);assert.match(draft.brief,/All-in delivered price ceiling: 0 USD cents\/kWh/);
  const checked=M.evaluate(candidate({plantCode:'999'}),b,{now});assert.equal(checked.candidate.deliveredCentsKwh,null);assert.notEqual(checked.status,'qualified_for_review');
});
test('actual intake validator and adapter retain all legacy optional requirements without inventing comparable terms',async()=>{
  const {validateSubmission}=await import('../worker-intake/index.mjs');
  const raw=request().payload;Object.assign(raw.brief,{operatingFlexibility:'Daily planned interruptions only',minimumAvailabilityPct:0,supplyArrangement:'Gas at original operator delivery point',powerCostCents:0,capitalResponsibility:'Buyer funds only reconnection',infrastructurePreference:'Reuse installed transformers',exclusions:'Do not return the original three offers',capitalPayer:'Buyer plus a possible third party'});
  const received=request();received.payload=validateSubmission(raw);const b=S.fromRequest(received),draft=S.researchDraft(received);
  for(const value of ['Daily planned interruptions only','Legacy minimum availability (%): 0','Gas at original operator delivery point','Legacy energy-price target (cents/kWh; confirm currency and cost basis): 0','Buyer funds only reconnection','Reuse installed transformers','Do not return the original three offers','Buyer plus a possible third party']){assert(b.additionalRequirements.includes(value),value);assert(draft.brief.includes(value),value);}
  assert.equal(b.maxDeliveredCentsKwh,null);assert.equal(b.maxEnergyCentsKwh,null);assert.equal(b.minUptimePct,null);assert.deepEqual(E.normalizeBrief(b),b);
});
test('actual intake validation and downstream schema agree on conflicts, source families and legacy budget fallback',async()=>{
  const {validateSubmission}=await import('../worker-intake/index.mjs');
  const raw=request().payload;delete raw.brief.upfrontBudget;raw.brief.maxSiteCapitalUsd=0;const received=request();received.payload=validateSubmission(raw);assert.equal(S.fromRequest(received).maxSiteCapitalUsd,0);
  const bad=request().payload;bad.brief.minMw=2;assert.throws(()=>validateSubmission(bad),/power|Power/);bad.brief.minMw=.16;bad.brief.sourceTypes=['unsupported_source'];assert.throws(()=>validateSubmission(bad),/source|Source/);
  const source=request();source.payload.attribution.source='';source.payload.brief.acquisitionSource='s'.repeat(600);assert.equal(S.metrics([source]).bySource['s'.repeat(600)].received,1);
});
