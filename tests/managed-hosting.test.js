'use strict';const {test}=require('node:test'),assert=require('node:assert/strict'),H=require('../managed-hosting');
const close=(a,b)=>assert(Math.abs(a-b)<.01,a+' != '+b),plan=changes=>H.normalize(changes);
test('illustrative annual cash reconciles, recovery and collection gap use explicit periods',()=>{
 const r=H.calculate({ownerCapexUsd:500000,collectionGapDays:365/6});assert(r.valid);const a=r.annual;
 close(a.billedRevenue,551880);close(a.recovery.ownerPayment,275940);close(a.protonCost,129420);close(a.recovery.protonContribution,146520);close(a.after.protonContribution,225360);close(a.recovery.ownerCash,157680);close(r.workingCapital,67560);close(r.simplePayback,3.170979);close(r.recoveryYears,3.64869);assert.equal(r.fees,25000);assert.equal(r.developmentMargin,null);
 const low=H.calculate({occupancyPct:20});close(low.annual.recovery.protonContribution,-42696);close(low.annual.billableKwh/(1000*8760),.18);
 const effective70=H.calculate({occupancyPct:70/.9});close(effective70.annual.recovery.protonContribution,93960);
});
test('owner cost, auxiliaries, collections and alternative income are distinct cash drivers',()=>{
 const a=H.calculate({auxiliaryPct:10,ownerRateBasis:'generation',ownerCostBasis:'generation',collectionPct:80,ownerFixedAnnual:10000,alternativeAnnual:20000}).annual;
 close(a.generationKwh,a.billableKwh/.9);close(a.cashRevenue,a.billedRevenue*.8);close(a.recovery.ownerPayment,a.generationKwh*.035);close(a.ownerCost,a.generationKwh*.015+10000);close(a.recovery.ownerIncrementalCash,a.recovery.ownerCash-20000);assert(a.recovery.protonContribution<146520);
 const zero=H.calculate({occupancyPct:0});close(zero.annual.recovery.protonContribution,-90000);assert.equal(zero.recoveryYears,null);
});
test('launch floor has exact-day exposure, dollar-for-dollar credits and proportional availability',()=>{
 const p=plan({supportState:'proposed',supportCapUsd:15120});
 close(H.support(p).target,5040);close(H.support(p).maxExposure,15120);close(H.support(p).topup,5040);assert.equal(H.support(p).payable,0);
 close(H.support(plan({...p,supportUsageKwh:100*24*30})).topup,2520);
 close(H.support(plan({...p,supportUsageKwh:200*24*30})).topup,0);
 close(H.support(plan({...p,supportAvailablePct:50})).target,2520);
 close(H.support(plan({...p,supportAvailablePct:0})).topup,0);
 close(H.support(plan({...p,supportPeriodDays:180})).target,15120);
 close(H.support(plan({...p,supportCapUsd:2000})).topup,2000);
 const s=H.support(plan({...p,supportCapUsd:5000,supportFundedUsd:5000,supportSpentUsd:4000}));close(s.topup,1000);close(s.remainingCap,1000);
});
test('support acceptance, evidence, expiry and outside-window usage do not invent payments',()=>{
 const p=plan({supportState:'active',supportCapUsd:15120,supportFundedUsd:15120,supportAgreement:'A',supportApproval:'B',supportFundingEvidence:'C',acceptanceEvidence:'D',supportStart:'2026-01-01',acceptedOn:'2026-01-01',supportPeriodStart:'2026-01-01',supportPeriodEvidence:'meter + payments + reviewer'});
 assert.equal(H.validate(p).length,0);close(H.support(p).payable,5040);assert.equal(H.support(p).expiry,'2026-04-01');
 close(H.support(plan({...p,supportPeriodStart:'2026-03-27'})).days,5);close(H.support(plan({...p,supportPeriodStart:'2026-03-27'})).topup,840);
 close(H.support(plan({...p,supportPeriodStart:'2026-04-01'})).topup,0);assert.equal(H.support(plan({...p,supportPeriodEvidence:''})).eligible,false);
 assert(H.validate({...p,acceptedOn:'2026-01-02'}).length);assert(H.validate({...p,supportFundedUsd:0}).length);
 close(H.support(plan({...p,supportState:'off'})).target,0);
 for(const supportState of ['expired','released']){close(H.support(plan({...p,supportState})).target,5040);assert.equal(H.support(plan({...p,supportState})).eligible,false);}
 assert.equal(H.support(p,'2026-01-15').eligible,false);assert(H.validate(p,'2025-12-31').length);
});
test('unknown budgets and distinct commitment/revenue ledgers remain unknown and separate',()=>{
 const r=H.calculate({signedKw:1000,energizedKw:200,collectedUsd:123,actualBilledKwh:456,feesCollectedUsd:1000,securityLiabilityUsd:2000});
 assert.equal(r.openingRecovery,null);assert.equal(r.cashGap,null);assert.equal(r.ownerFundingGap,null);assert.equal(r.annual.billedRevenue,551880);assert.equal(r.fees,25000);close(r.cashNeed-r.workingCapital,2000);assert(!r.gaps.some(x=>x.includes('Launch support')));
 assert.equal(H.calculate({supportState:'proposed'}).cashNeed,null);
});
test('recovery credits exclude support and self-mining never receives hosting revenue',()=>{
 const r=H.calculate({ownerCapexUsd:500000,recoveryAdditionUsd:10000,recoveryCreditUsd:5000,occupancyPct:0,selfKw:200,selfRevenueCents:4,selfHardwareUsd:100000,supportState:'proposed',supportCapUsd:15120});
 assert.equal(r.openingRecovery,505000);assert.equal(r.annual.billedRevenue,0);close(r.selfMining.miningRevenue,200*8760*.9*.04);assert.equal(r.selfMining.hardware,100000);assert.equal(H.calculate({selfKw:200}).valid,false);
 assert.equal(H.recoveryYears(100000,1000,8),null);assert.equal(H.recoveryYears(100000,20000,0),5);
});
test('invalid inputs and unsupported record versions never normalize into plausible plans',()=>{
 for(const p of [{phaseKw:0},{phaseKw:Infinity},{phaseKw:'1000'},{ownerCapexUsd:-1},{occupancyPct:101},{auxiliaryPct:100},{supportStart:'2026-02-31'},{supportDays:0},{supportSpentUsd:1},{v:2},{supportState:'active',supportApproval:null},[],'invalid'])assert.equal(H.calculate(p).valid,false,JSON.stringify(p));
 const raw={...plan(),customEvidence:'preserved'};assert.equal(H.normalize(raw).customEvidence,'preserved');assert.equal(H.normalize(raw).supportState,'off');
 assert.match(H.proposal({},'<script>'),/DRAFT/);assert.match(H.proposal({}),/No hosting revenue is assigned to self-mining/);
});
