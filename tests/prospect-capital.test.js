'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('../prospect-capital'),D=require('../prospect-diligence'),C=require('../site-capex'),Q=require('../site-capacity'),L=require('../source-landfill'),data=require('../data/landfills.json');
const NOW=Date.parse('2026-09-07T16:00:00Z');
const raw=()=>({id:'test',source:'lmop-landfill',energyType:'landfill_gas',powerPotentialKw:1000,sourceDetail:{collectionSystem:'No',projectStatus:'Candidate'}});
const ctx={screened:{kw:1000},now:NOW};
function save(site,type,value,id){const r=D.apply(site,{type,revision:D.state(site).revision,value,id},NOW);assert.equal(r.ok,true,r.err);return {...site,custom_fields:{...site.custom_fields,[D.KEY]:r.diligence}};}
const plan=(extra={})=>({target_kw:1000,strategy:'reuse',market:'new',contingency_pct:15,...extra});
const proof=(extra={})=>({presence:'unknown',condition:'unknown',access:'unknown',action:'new',payer:'proton',cost_basis:'quote',low_usd:100000,base_usd:100000,high_usd:100000,paid_usd:0,capacity_kw:1000,checked_on:'2026-09-07',reviewer:'Test reviewer',evidence_note:'Test quote and scope',...extra});
test('unquoted landfills have a complete modeled build scope, with unpriced extras stated separately',()=>{
 const e=P.estimate(raw(),null,ctx),r=C.ratesFor('new');
 const infra=1000*(r.collectionPerKw+r.gasTreatmentPerKw+r.generationPerKw+r.interconnectionPerKw+r.civilPerKw+r.miningInfraPerKw+r.commissioningPerKw)+r.permittingFlatUsd;
 assert.equal(e.infrastructureUsd,infra);assert.ok(e.minersUsd>0);assert.ok(Math.abs(e.base-(infra+e.minersUsd)*1.15)<0.01);assert.equal(e.perKw,e.base/1000);
 assert.equal(e.reuseSavingUsd,0);assert.ok(e.low<e.base&&e.high>e.base);assert.ok(e.extras.includes('Site rights & transaction costs'));assert.ok(e.extras.includes('Gas tie-in & metering'));
 assert.equal(e.budget.base,null);assert.equal(e.capacity.contractedKw,null);assert.match(P.summary(e),/not current supplier quotes/);assert.match(P.breakdown(e),/Build or extend/);
});
test('reuse is conditional, limited by installed size, and never inferred from planned generation or destruction filings',()=>{
 const c={...raw(),existingGenerationKw:500,sourceDetail:{collectionSystem:'Yes',projectType:'Reciprocating Engine',projectStatus:'Operational'}};
 const e=P.estimate(c,null,ctx),base=P.estimate(raw(),null,ctx),g=e.lines.find(a=>a.id==='generation');
 assert.ok(e.base<base.base);assert.equal(g.base,900000*(1-.6*(500*.93/1000)));assert.equal(g.high,900000*1.4);assert.equal(e.lines.find(a=>a.id==='electrical').reuse,false);
 const planned=P.estimate({...c,sourceDetail:{...c.sourceDetail,projectStatus:'Planned'}},null,ctx);assert.equal(planned.lines.find(a=>a.id==='generation').reuse,false);
 const controls=P.estimate({...raw(),sourceDetail:{hasExistingControls:true}},null,ctx);assert.equal(controls.lines.find(a=>a.id==='collection').reuse,false);
});
test('a partial quote replaces just its component; it cannot become an artificially cheap total',()=>{
 const s=save({custom_fields:{keep:'yes'}},'asset',proof({paid_usd:20000}),'generation');
 const e=P.estimate(raw(),s,ctx);assert.equal(e.lines.find(a=>a.id==='generation').base,80000);assert.ok(e.base>2000000);assert.equal(e.budget.base,80000);assert.equal(e.estimated,true);assert.equal(s.custom_fields.keep,'yes');
 const undersized=P.estimate(raw(),save(s,'planning',plan({target_kw:2000})),ctx);assert.equal(undersized.lines.find(a=>a.id==='generation').estimated,true);assert.equal(undersized.lines.find(a=>a.id==='generation').base,1800000);
});
test('packages, partner funding, documented zero-cost reuse, and payments do not double count',()=>{
 let s=save({},'asset',proof({base_usd:150000,low_usd:150000,high_usd:150000}),'generation');
 s=save(s,'asset',proof({action:'included',included_in:'generation',low_usd:'',base_usd:'',high_usd:''}),'electrical');
 s=save(s,'asset',proof({payer:'partner',low_usd:'',base_usd:'',high_usd:''}),'gas_treatment');
 s=save(s,'asset',proof({presence:'present',condition:'working',access:'agreed',action:'reuse',low_usd:0,base_usd:0,high_usd:0}),'collection');
 const e=P.estimate(raw(),s,ctx);for(const id of ['electrical','gas_treatment','collection'])assert.equal(e.lines.find(a=>a.id===id).base,0,id);assert.equal(e.lines.find(a=>a.id==='generation').base,150000);
});
test('scenario edits are versioned and change estimates without establishing allocation or access',()=>{
 const s=save({custom_fields:{keep:true}},'planning',plan({target_kw:500,market:'used',strategy:'power',contingency_pct:0}));
 const e=P.estimate(raw(),s,ctx);assert.equal(e.targetKw,500);assert.equal(e.capacity.contractedKw,null);assert.equal(e.lines.find(a=>a.id==='generation').base,0);assert.equal(e.budget.base,null);
 assert.equal(D.state(s).history.length,1);assert.equal(s.custom_fields.keep,true);assert.equal(D.apply(s,{type:'planning',revision:0,value:plan()},NOW).ok,false);
 for(const v of [{target_kw:-1},{contingency_pct:101},{market:'free'},{strategy:'invented'}])assert.equal(D.apply({}, {type:'planning',revision:0,value:plan(v)},NOW).ok,false);
});
test('missing, zero and placeholder capacity remain unsized; grid sites use a clearly scoped power purchase scenario',()=>{
 for(const c of [{...raw(),powerPotentialKw:null},{...raw(),powerPotentialKw:0},{...raw(),sourceDetail:{capacityBasis:'nominal 100 kW placeholder'}}])assert.equal(P.estimate(c,null).ready,false);
 const e=P.estimate({id:'eia',source:'eia-facility',energyType:'grid_facility',powerPotentialKw:1000,sourceDetail:{}},null);assert.equal(e.ready,true);assert.equal(e.settings.strategy,'power');assert.equal(e.lines.find(a=>a.id==='generation').base,0);assert.ok(e.extras.includes('Site rights & transaction costs'));
});
test('every sized US landfill has a usable planning estimate without creating verified budgets',()=>{
 let sized=0,estimated=0;for(const row of data.projects){const c={...L.adapter.normalize(row),source:'lmop-landfill'},q=Q.usableCapacity(c);if(q.kw>0){sized++;const e=P.estimate(c,null,{screened:q});if(e.ready&&e.base>0&&e.low<=e.base&&e.base<=e.high)estimated++;assert.equal(e.budget.base,null);}}
 assert.ok(sized>1000);assert.equal(estimated,sized);console.log('Planning estimates available for '+estimated+' sized US landfill project records.');
});

test('shutdown generation defaults to used pricing while saved choices and other site types are preserved',()=>{
 const shut={...raw(),existingGenerationKw:2000,sourceDetail:{collectionSystem:'Yes',projectType:'Reciprocating Engine',projectStatus:'Shutdown'}};
 const auto=P.estimate(shut,null,ctx),explicit=P.estimate(shut,save({},'planning',plan({market:'new'})),ctx);
 assert.equal(auto.settings.market,'used');assert.equal(auto.settings.automaticUsed,true);assert.equal(auto.rates.generationPerKw,225);assert.equal(explicit.settings.market,'new');assert.ok(auto.base<explicit.base);
 assert.equal(P.estimate({...shut,existingGenerationKw:null},null,ctx).settings.market,'new');
 assert.equal(P.estimate({...shut,sourceDetail:{...shut.sourceDetail,projectStatus:'Planned'}},null,ctx).settings.market,'new');
 assert.equal(P.estimate(shut,save({},'planning',plan({market:'auto'})),ctx).settings.market,'used');
});

test('from-scratch and remaining infrastructure exclude ASICs, contingency and transaction costs',()=>{
 const c={...raw(),existingGenerationKw:2000,sourceDetail:{collectionSystem:'Yes',projectType:'Engine',projectStatus:'Operational'}};
 const e=P.estimate(c,null,ctx);assert.equal(e.newInfrastructureUsd,2580000);assert.equal(e.remainingInfrastructureUsd,1710000);assert.equal(e.miningInfrastructureUsd,450000);
 assert.equal(e.remainingInfrastructureUsd,e.energyInfrastructureUsd+e.miningInfrastructureUsd+e.servicesUsd);assert.equal(e.base,e.remainingInfrastructureUsd+e.minersUsd+e.contingencyUsd);
 const withFee=P.estimate(c,save({},'asset',proof({low_usd:500000,base_usd:500000,high_usd:500000}),'acquisition'),ctx);
 assert.equal(withFee.newInfrastructureUsd,e.newInfrastructureUsd);assert.equal(withFee.remainingInfrastructureUsd,e.remainingInfrastructureUsd);assert.equal(withFee.otherRecordedUsd,500000);assert.ok(withFee.base>e.base);
 const html=P.summary(e);assert.match(html,/Build infrastructure from scratch/);assert.match(html,/Remaining with existing infrastructure/);assert.match(html,/Mining setup still to fund/);
});

test('mining setup rates use USD per MW, persist locally, preserve zero and never mutate the shared rate card',()=>{
 const original=C.ratesFor('new').miningInfraPerKw;
 let s=save({},'planning',plan({target_kw:500,mining_infra_usd_per_mw:180000})),e=P.estimate(raw(),s,ctx);
 assert.equal(e.miningInfrastructureUsd,90000);assert.equal(e.rates.miningInfraPerKw,180);assert.equal(C.ratesFor('new').miningInfraPerKw,original);assert.equal(e.budget.base,null);
 s=save(s,'planning',plan({target_kw:500}));assert.equal(D.state(s).planning.mining_infra_usd_per_mw,180000);
 s=save(s,'planning',plan({mining_infra_usd_per_mw:0}));assert.equal(P.estimate(raw(),s,ctx).miningInfrastructureUsd,0);
 s=save(s,'planning',plan({mining_infra_usd_per_mw:''}));assert.equal(P.estimate(raw(),s,ctx).miningInfrastructureUsd,450000);
 for(const value of [-1,'invalid',Infinity])assert.equal(D.apply({}, {type:'planning',revision:0,value:plan({mining_infra_usd_per_mw:value})},NOW).ok,false);
});

test('existing mining equipment receives a size-limited allowance, but a landfill generator alone does not',()=>{
 let s=save({},'asset',proof({presence:'present',action:'unknown',capacity_kw:500,low_usd:'',base_usd:'',high_usd:''}),'mining_infrastructure');
 assert.equal(P.estimate(raw(),s,ctx).miningInfrastructureUsd,315000);
 const c={...raw(),existingGenerationKw:2000,sourceDetail:{collectionSystem:'Yes',projectType:'Engine',projectStatus:'Operational'}};
 assert.equal(P.estimate(c,null,ctx).miningInfrastructureUsd,450000);
 s=save(s,'asset',proof({presence:'present',action:'new',capacity_kw:1000,low_usd:'',base_usd:'',high_usd:''}),'mining_infrastructure');
 assert.equal(P.estimate(raw(),s,ctx).miningInfrastructureUsd,450000,'an explicit replacement decision must not receive reuse credit');
});

test('confirmed no-cost reuse lowers remaining work without erasing its replacement benchmark',()=>{
 const s=save({},'asset',proof({presence:'present',condition:'working',access:'agreed',action:'reuse',low_usd:0,base_usd:0,high_usd:0}),'mining_infrastructure'),e=P.estimate(raw(),s,ctx);
 assert.equal(e.miningInfrastructureUsd,0);assert.equal(e.newInfrastructureUsd,2580000);assert.equal(e.remainingInfrastructureUsd,2130000);assert.ok(e.reuseSavingUsd>0);
});
