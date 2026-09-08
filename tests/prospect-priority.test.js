'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../prospect-priority'),D=require('../prospect-diligence'),C=require('../prospect-capital'),R=require('../prospect-ranking'),E=require('../site-engine');
const NOW=Date.parse('2026-09-08T00:00:00Z');
const candidate={id:'test',name:'Test power site',energyType:'grid_facility',source:'eia-facility',sourceDetail:{technology:'Landfill Gas'},powerPotentialKw:1000};
const operating={capacity_kw:1000,cost_basis:'quote',all_in_power_usd_kwh:0.035,minimum_monthly_power_usd:0,fixed_monthly_usd:1000,uptime_pct:95,pool_fee_pct:2,term_months:36,months_to_operation:0,operating_scope_complete:true,checked_on:'2026-09-08',reviewer:'Test reviewer',evidence_note:'Synthetic scoped operating offer',quote_expires:'2026-12-01'};
const saved=overrides=>({id:'test',custom_fields:{[D.KEY]:{...D.blank, v:1,revision:0,assets:{},capacity:{},history:[],economics:{...operating,...overrides}}}});
function estimate(cash=1000000,complete=false){return {ready:true,targetKw:1000,base:cash,fleet:{count:168},capacity:{targetKw:1000,contractedKw:complete?1000:null},budget:{complete,allowanceCount:complete?0:2,base:cash,paid:0},inventory:[],powerPurchase:true};}
function context(e,site){return {estimate:e,saved:site,now:NOW,availability:{dutyPct:92,basis:'modeled'},market:{btcPriceUsd:80000,networkHashratePh:900000},config:E.DEFAULT_CONFIG};}
function evaluated(cash,complete=false,overrides){return P.evaluate(candidate,context(estimate(cash,complete),complete?saved(overrides):null));}
test('best-fit is a distinct restorable sort; acquisition sort remains available',()=>{
 assert.deepEqual(R.decode('proton_fit'),{key:'priority',dir:-1,column:false});
 assert.equal(R.encode('priority',-1),'proton_fit');assert.equal(R.next('proton_fit','priority'),'column:priority:asc');
 assert.deepEqual(R.decode('combined'),{key:'combined',dir:-1,column:false});
});
test('lower remaining cash improves otherwise equal plans, and the optional ceiling demotes without deleting',()=>{
 const cheap=evaluated(800000),expensive=evaluated(2000000);assert.ok(cheap.sortValue>expensive.sortValue);
 const over=P.evaluate(candidate,{...context(estimate(2000000)),cashLimitUsd:1000000});assert.equal(over.label,'Revise the plan');assert.match(over.nextAction,/exceeds the cash ceiling/);
 assert.equal(evaluated(800000).label,'Research fit');assert.ok(evaluated(800000).gaps.some(g=>/Price the remaining/.test(g)));
});
test('shutdown and bankruptcy alone never improve financial priority',()=>{
 const base=context(estimate(1500000)),plain=P.evaluate(candidate,base);
 const distressed=P.evaluate({...candidate,distressSignals:[{type:'lmop_shutdown',date:'2026-09-08'},{type:'bankruptcy',date:'2026-09-08'}]},base);
 assert.equal(distressed.sortValue,plain.sortValue);
 const historic=P.evaluate(candidate,{...base,estimate:{...base.estimate,inventory:[{id:'mining_infrastructure',presence:'historical',condition:'unknown',access:'unknown'}]}});
 assert.equal(historic.parts.find(p=>p.id==='infrastructure').points,0);
});
test('a lower-cost operating-power plan outranks a more costly distressed rehabilitation plan',()=>{
 const power=evaluated(950000),rehab=P.evaluate({...candidate,distressSignals:[{type:'lmop_shutdown',date:'2026-09-08'}]},context({...estimate(2200000),powerPurchase:false}));
 assert.ok(power.sortValue>rehab.sortValue);
});
test('ordinary operating generation is not treated as an established surplus-power opportunity',()=>{
 const ordinary=P.evaluate({...candidate,sourceDetail:{technology:'Other Natural Gas'}},context(estimate(500000)));
 assert.equal(ordinary.label,'Confirm surplus');assert.match(ordinary.nextAction,/surplus energy/);
 assert.ok(ordinary.sortValue<evaluated(1500000).sortValue);
 const offered=P.evaluate({...candidate,sourceDetail:{technology:'Other Natural Gas'}},context(estimate(500000,true),saved()));
 assert.notEqual(offered.label,'Confirm surplus');
});
test('missing and partial budgets never become zero-cost or ready deals',()=>{
 const unknown=P.evaluate(candidate,context({ready:false,capacity:{},budget:{complete:false},inventory:[]}));
 assert.equal(unknown.cashUsd,null);assert.equal(unknown.label,'Needs sizing / costs');assert.ok(unknown.sortValue<evaluated(800000).sortValue);
 const partial=evaluated(1);assert.equal(partial.label,'Research fit');assert.equal(partial.completeBudget,false);assert.match(P.summary(partial),/unpriced work/);
 const zero=evaluated(0,true);assert.equal(zero.cashUsd,0);assert.equal(zero.comparison,null);
});
test('unquoted tiny plans receive limited credit for unpriced fixed package costs',()=>{
 const tiny=P.evaluate(candidate,context({...estimate(1000),targetKw:1,capacity:{targetKw:1,contractedKw:null}}));
 assert.ok(tiny.sortValue<evaluated(500000).sortValue);
});
test('documented budgets use remaining cash for affordability and include paid capital in the BTC alternative',()=>{
 const e=estimate(600000,true);e.budget.paid=400000;
 const r=P.evaluate(candidate,context(e,saved()));assert.equal(r.cashUsd,600000);assert.equal(r.comparison.initialUsd,1000000);assert.equal(r.comparison.buyBtc,12.5);
});
test('price, overhead, minimum bills, uptime, difficulty, delay and supply term affect the comparison in the expected directions',()=>{
 const base=evaluated(700000,true).comparison;assert.ok(base);assert.ok(base.flatNetBtc>base.stressNetBtc);
 for(const [change,label] of [[{all_in_power_usd_kwh:0.05},'power'],[{fixed_monthly_usd:10000},'overhead'],[{minimum_monthly_power_usd:100000},'minimum'],[{uptime_pct:50},'delivery'],[{months_to_operation:6},'delay'],[{term_months:12},'term'],[{pool_fee_pct:10},'pool']])assert.ok(evaluated(700000,true,change).comparison.stressNetBtc<base.stressNetBtc,label);
 const short=evaluated(700000,true,{term_months:12}).comparison;assert.equal(short.productionMonths,12);
});
test('an operating deficit is charged against mining rather than supplied for free',()=>{
 const r=evaluated(700000,true,{minimum_monthly_power_usd:1000000});assert.ok(r.comparison.operatingShortfallUsd>0);assert.ok(r.comparison.stressNetBtc<0);assert.equal(r.label,'Revise the plan');
});
test('independent first-month output agrees with the projection for a one-month supply term',()=>{
 const r=evaluated(700000,true,{term_months:1}).comparison;
 const coins=168*395/1000/900000*3.125*144*30*.95*.98;
 const bill=1000*720*.95*.035+1000;
 assert.ok(Math.abs(r.flatNetBtc-(coins-bill/80000))<1e-10);
 assert.equal(r.flatNetBtc,r.stressNetBtc);
});
test('projection includes the next subsidy halving',()=>{
 const r=evaluated(700000,true).comparison,coins=168*395/1000/900000*3.125*144*30*.95*.98;
 const unhalved=coins*24-(1000*720*.95*.035+1000)*24/80000;
 assert.ok(r.flatNetBtc<unhalved);
});
test('startup time does not reset every refresh and an elapsed supply term is flagged',()=>{
 const site=saved({checked_on:'2026-08-09',months_to_operation:2}),ctx=context(estimate(700000,true),site);
 const now=P.evaluate(candidate,ctx),earlier=P.evaluate(candidate,{...ctx,now:Date.parse('2026-08-09T00:00:00Z')});
 assert.equal(now.comparison.productionMonths,23);assert.equal(earlier.comparison.productionMonths,22);
 const ended=P.evaluate(candidate,context(estimate(700000,true),saved({checked_on:'2026-06-01',term_months:1})));
 assert.match(ended.blockers.join(' '),/term has ended/);
});
test('incomplete, stale, expired or allowance-only operating evidence earns no verified economics',()=>{
 for(const change of [{checked_on:'2025-01-01'},{checked_on:'2026-10-01'},{quote_expires:'2026-09-01'},{cost_basis:'allowance'},{fixed_monthly_usd:null},{operating_scope_complete:false}]){
  const r=evaluated(700000,true,change);assert.equal(r.operating.current,false);assert.equal(r.comparison,null);assert.notEqual(r.label,'Review terms');
 }
});
test('unallocated or oversized plans cannot be treated as quoted operating opportunities',()=>{
 const e=estimate(700000,true);e.capacity.contractedKw=null;const r=P.evaluate(candidate,context(e,saved()));assert.equal(r.comparison,null);assert.equal(r.label,'Research fit');
 e.capacity.contractedKw=500;assert.equal(P.evaluate(candidate,context(e,saved())).label,'Revise the plan');
});
test('a change in phase size invalidates the operating cost review until its scope is reviewed again',()=>{
 const e={...estimate(700000,true),targetKw:500,capacity:{targetKw:500,contractedKw:1000}};
 const r=P.evaluate(candidate,context(e,saved()));assert.equal(r.operating.current,false);assert.equal(r.comparison,null);assert.match(r.operating.reason,/different phase/);
});
test('an owner saying the energy is taken overrides distress, even if undated',()=>{
 const ctx=context(estimate(700000,true),{...saved(),distress_signals:[{type:'owner_confirmed_taken'},{type:'bankruptcy',date:'2026-09-08'},{type:'owner_confirmed_available',date:'2026-09-08'}]});
 assert.equal(P.evaluate(candidate,ctx).label,'Not an open lead');
 for(const stage of ['dead','closed_won'])assert.equal(P.evaluate(candidate,{...ctx,saved:{...saved(),stage}}).label,'Not an open lead');
});
test('operating review persists alongside capital and contacts, validates zero versus missing, and rejects stale revisions',()=>{
 const original={id:'test',contact_email:'person@example.com'},command={type:'economics',revision:0,value:operating};
 const result=D.apply(original,command,NOW);assert.ok(result.ok,result.err);assert.deepEqual(original,{id:'test',contact_email:'person@example.com'});
 const recorded={...original,custom_fields:{[D.KEY]:result.diligence}};assert.ok(P.review(recorded,NOW).current);assert.equal(D.apply(recorded,command,NOW).ok,false);
 assert.equal(D.apply(original,{...command,value:{...operating,fixed_monthly_usd:''}},NOW).ok,false);
 assert.equal(D.apply(original,{...command,value:{...operating,minimum_monthly_power_usd:0}},NOW).ok,true);
 for(const bad of [{uptime_pct:101},{pool_fee_pct:-1},{months_to_operation:121},{term_months:0},{checked_on:'2026-10-01'}])assert.equal(D.apply(original,{...command,value:{...operating,...bad}},NOW).ok,false);
});
test('editing priority inputs does not mark capacity or asset quotes verified',()=>{
 const result=D.apply({id:'test'},{type:'economics',revision:0,value:operating},NOW);assert.deepEqual(result.diligence.capacity,{});assert.deepEqual(result.diligence.assets,{});
 const e=C.estimate(candidate,{custom_fields:{[D.KEY]:result.diligence}},{screened:{kw:1000},now:NOW});assert.equal(e.capacity.contractedKw,null);assert.equal(e.budget.complete,false);
});
test('priority explanations escape recorded content and disclose assumptions',()=>{
 const p=evaluated(700000);p.nextAction='<img src=x onerror=alert(1)>';const html=P.summary(p);assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;img'));assert.match(html,/Missing evidence receives no positive credit/);
 assert.equal(Object.values(P.WEIGHTS).reduce((a,b)=>a+b,0),100);
});
