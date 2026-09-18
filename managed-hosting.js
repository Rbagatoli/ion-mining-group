/* Shared planning arithmetic. No live prices, payments, commitments or writes. USD. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ManagedHosting=api;}(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  const KEY='managedHosting',SERVICE='managed_energy_hosting';
  const defaults={v:1,service:SERVICE,phaseKw:1000,occupancyPct:100,uptimePct:90,collectionPct:100,clientCents:7,ownerRecoveryCents:3.5,ownerAfterCents:2.5,ownerRateBasis:'billed',ownerEnergyCents:1.5,ownerCostBasis:'billed',auxiliaryPct:0,ownerFixedAnnual:0,alternativeAnnual:0,protonFixedAnnual:90000,protonVariableCents:.5,ownerCapexUsd:null,ownerFundingUsd:0,recoveryReturnPct:8,recoveryBalanceUsd:null,recoveryAdditionUsd:0,recoveryCreditUsd:0,protonStartupUsd:0,collectionGapDays:60,startupAvailableUsd:null,securityLiabilityUsd:0,feeFeasibilityUsd:5000,feeDevelopmentUsd:10000,feeAcceptanceUsd:10000,developmentCostUsd:null,feesCollectedUsd:0,signedKw:0,energizedKw:0,actualBilledKwh:0,collectedUsd:0,supportState:'off',supportPct:20,supportDays:90,supportCapUsd:null,supportFundedUsd:0,supportSpentUsd:0,supportAvailablePct:100,supportPeriodDays:30,supportUsageKwh:0,supportOwnerCreditUsd:0,supportStart:'',supportPeriodStart:'',acceptedOn:'',selfKw:0,selfHardwareUsd:null,selfRevenueCents:null,selfFixedAnnual:0,owner:'',gasRightsHolder:'',equipmentOwner:'',qualificationStage:'fit',fundingEvidence:'',capacityEvidence:'',reuseEvidence:'',meterScope:'',maintenanceScope:'',customerEvidence:'',supportAgreement:'',supportApproval:'',supportFundingEvidence:'',acceptanceEvidence:'',recoveryEvidence:'',feesEvidence:'',supportPeriodEvidence:'',notes:''};
  const percentages=['occupancyPct','uptimePct','collectionPct','auxiliaryPct','recoveryReturnPct','supportPct','supportAvailablePct'];
  const states=['off','proposed','approved','funded','active','expired','released'];
  const stages={fit:'Fit screen',feasibility:'Paid feasibility',scope:'Technical scope & owner funding',customers:'Customer commitments & quotes',economics:'Economics & downside review',contracts:'Contracts & launch reserve',construction:'Construction',accepted:'Acceptance & launch',operating:'Metering & recovery',expansion:'Expansion review'};
  function normalize(raw){return Object.assign({},defaults,raw||{});}
  function date(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return null;const n=Date.parse(value+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===value?n:null;}
  function validate(raw,asOf=new Date().toISOString().slice(0,10)){
    const p=normalize(raw),errors=[];if(p.v!==1||p.service!==SERVICE)errors.push('Unsupported hosting-plan version or service; keep the original record.');
    if(raw!=null&&(typeof raw!=='object'||Array.isArray(raw)))errors.push('Hosting plan must be a record.');
    for(const [k,v]of Object.entries(defaults)){
      if(typeof v==='number'||v===null){if(p[k]===null){if(v!==null)errors.push(k+' is required.');continue;}if(typeof p[k]!=='number'||!Number.isFinite(p[k])||p[k]<0||p[k]>1e12)errors.push(k+' must be a finite nonnegative number.');}
      else if(typeof p[k]!=='string')errors.push(k+' must be text.');
    }
    if(errors.length)return errors;
    for(const k of percentages)if(p[k]>100)errors.push(k+' cannot exceed 100%.');
    if(p.auxiliaryPct>=100)errors.push('Auxiliary load must be below 100%.');
    if(!p.phaseKw)errors.push('A positive commissioned phase size is required.');
    if(p.signedKw>p.phaseKw||p.energizedKw>p.phaseKw||p.selfKw>p.phaseKw)errors.push('Signed, energized and self-mining capacity cannot exceed the phase size.');
    if(p.selfKw>p.phaseKw*(1-p.occupancyPct/100)+.000001)errors.push('Self-mining cannot use capacity already modeled for hosting customers.');
    if(!states.includes(p.supportState))errors.push('Choose a valid support state.');
    if(!stages[p.qualificationStage])errors.push('Choose a valid qualification stage.');
    if(!['billed','generation'].includes(p.ownerRateBasis)||!['billed','generation'].includes(p.ownerCostBasis))errors.push('Choose the meter basis for rates and generation costs.');
    for(const k of ['supportStart','supportPeriodStart','acceptedOn'])if(p[k]&&date(p[k])===null)errors.push(k+' must be a valid date.');
    if(!Number.isInteger(p.supportDays)||p.supportDays<1||p.supportDays>366)errors.push('Support duration must be 1–366 whole days.');
    if(!Number.isInteger(p.supportPeriodDays)||p.supportPeriodDays<1||p.supportPeriodDays>366)errors.push('Reconciliation period must be 1–366 whole days.');
    if(p.supportCapUsd!==null&&p.supportSpentUsd>p.supportCapUsd)errors.push('Support paid exceeds the agreed cap.');
    if(p.supportSpentUsd>p.supportFundedUsd)errors.push('Support paid exceeds recorded reserve funding.');
    if(['approved','funded','active'].includes(p.supportState)&&(!p.supportApproval.trim()||!p.supportAgreement.trim()||p.supportCapUsd===null))errors.push('Approved support requires an approval reference, agreement and dollar cap.');
    if(['funded','active'].includes(p.supportState)&&(!p.supportFundingEvidence.trim()||p.supportFundedUsd<p.supportCapUsd))errors.push('Funded support requires funding evidence and a reserve covering the cap.');
    if(p.supportState==='active'&&(!p.supportStart||!p.acceptedOn||!p.acceptanceEvidence.trim()||date(p.supportStart)<date(p.acceptedOn)))errors.push('Active support requires evidenced acceptance and a support start on or after acceptance.');
    if(p.supportState==='active'&&(date(p.supportStart)>date(asOf)||date(p.acceptedOn)>date(asOf)))errors.push('Future acceptance or support starts must remain proposed or funded, not active.');
    return errors;
  }
  const money=x=>x===null?'Not established':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(x);
  function annual(p,occupancy=p.occupancyPct){
    const billableKwh=p.phaseKw*8760*occupancy/100*p.uptimePct/100,generationKwh=billableKwh/(1-p.auxiliaryPct/100),cashRevenue=billableKwh*p.clientCents/100*p.collectionPct/100;
    const ownerKwh=p.ownerRateBasis==='generation'?generationKwh:billableKwh,ownerCost=(p.ownerCostBasis==='generation'?generationKwh:billableKwh)*p.ownerEnergyCents/100+p.ownerFixedAnnual;
    const protonCost=p.protonFixedAnnual+billableKwh*p.protonVariableCents/100;
    const phase=rate=>{const ownerPayment=ownerKwh*rate/100;return {ownerPayment,ownerCash:ownerPayment-ownerCost,ownerIncrementalCash:ownerPayment-ownerCost-p.alternativeAnnual,protonContribution:cashRevenue-ownerPayment-protonCost};};
    return {billableKwh,generationKwh,billedRevenue:billableKwh*p.clientCents/100,cashRevenue,uncollectedRevenue:billableKwh*p.clientCents/100-cashRevenue,ownerCost,protonCost,recovery:phase(p.ownerRecoveryCents),after:phase(p.ownerAfterCents)};
  }
  function support(p,asOf=new Date().toISOString().slice(0,10)){
    const rate=p.ownerRecoveryCents/100/(p.ownerRateBasis==='generation'?1-p.auxiliaryPct/100:1),start=date(p.supportStart),period=date(p.supportPeriodStart),accepted=date(p.acceptedOn);
    let days=Math.min(p.supportPeriodDays,p.supportDays);
    const end=start===null?null:start+p.supportDays*86400000;
    if(start!==null&&period!==null)days=Math.max(0,(Math.min(period+p.supportPeriodDays*86400000,end)-Math.max(period,start,accepted===null?start:accepted))/86400000);
    if(p.supportState==='off'||(['released','expired'].includes(p.supportState)&&(start===null||period===null)))days=0;
    const availableKwh=p.phaseKw*24*days*p.supportAvailablePct/100,target=availableKwh*p.supportPct/100*rate;
    // Credits entered here must be for this same eligible reconciliation period and owner obligation.
    const usageCredit=Math.min(p.supportUsageKwh,availableKwh)*rate+p.supportOwnerCreditUsd,uncappedTopup=Math.max(0,target-usageCredit);
    const remainingCap=p.supportCapUsd===null?null:Math.max(0,p.supportCapUsd-p.supportSpentUsd),topup=remainingCap===null?null:Math.min(remainingCap,uncappedTopup);
    const eligible=p.supportState==='active'&&period!==null&&period+p.supportPeriodDays*86400000<=date(asOf)&&days>0&&!!p.supportPeriodEvidence.trim()&&validate(p,asOf).length===0;
    return {days,target,usageCredit,uncappedTopup,remainingCap,topup,payable:eligible?topup:0,eligible,expiry:end===null?'':new Date(end).toISOString().slice(0,10),maxExposure:p.phaseKw*p.supportPct/100*24*p.supportDays*rate,remainingReserve:Math.max(0,p.supportFundedUsd-p.supportSpentUsd),capShortfall:Math.max(0,uncappedTopup-(topup||0))};
  }
  function recoveryYears(balance,cash,rate){
    if(balance===null)return null;if(balance<=0)return 0;if(cash<=0)return null;
    const monthly=Math.pow(1+rate/100,1/12)-1,payment=cash/12;if(payment<=balance*monthly)return null;
    if(monthly===0)return balance/cash;
    return Math.log(payment/(payment-balance*monthly))/Math.log(1+monthly)/12;
  }
  function calculate(raw,{asOf=new Date().toISOString().slice(0,10)}={}){
    const p=normalize(raw),errors=validate(raw,asOf);if(errors.length)return {valid:false,errors,plan:p};
    const a=annual(p),launch=support(p,asOf),fees=p.feeFeasibilityUsd+p.feeDevelopmentUsd+p.feeAcceptanceUsd;
    const recoveryBase=p.recoveryBalanceUsd===null?p.ownerCapexUsd:p.recoveryBalanceUsd,opening=recoveryBase===null?null:Math.max(0,recoveryBase+p.recoveryAdditionUsd-p.recoveryCreditUsd);
    const outflows=a.recovery.ownerPayment+a.protonCost,workingCapital=outflows/365*p.collectionGapDays,remainingReserve=['off','released'].includes(p.supportState)?0:launch.remainingCap;
    const cashNeed=remainingReserve===null?null:workingCapital+p.protonStartupUsd+remainingReserve+p.securityLiabilityUsd;
    const selfEnergy=p.selfKw*8760*p.uptimePct/100,selfOwner=selfEnergy*p.ownerRecoveryCents/100/(p.ownerRateBasis==='generation'?1-p.auxiliaryPct/100:1);
    return {valid:true,plan:p,annual:a,support:launch,fees,developmentMargin:p.developmentCostUsd===null?null:fees-p.developmentCostUsd,openingRecovery:opening,simplePayback:opening===null||a.recovery.ownerIncrementalCash<=0?null:opening/a.recovery.ownerIncrementalCash,recoveryYears:recoveryYears(opening,a.recovery.ownerIncrementalCash,p.recoveryReturnPct),workingCapital,cashNeed,cashGap:cashNeed===null||p.startupAvailableUsd===null?null:Math.max(0,cashNeed-p.startupAvailableUsd),ownerFundingGap:p.ownerCapexUsd===null?null:Math.max(0,p.ownerCapexUsd-p.ownerFundingUsd),stress:[100,70,20].map(occupancy=>({occupancy,...annual(p,occupancy)})),selfMining:{kwh:selfEnergy,hardware:p.selfHardwareUsd,miningRevenue:p.selfRevenueCents===null?null:selfEnergy*p.selfRevenueCents/100,contribution:p.selfRevenueCents===null?null:selfEnergy*p.selfRevenueCents/100-selfOwner-selfEnergy*p.protonVariableCents/100-p.selfFixedAnnual},gaps:[!p.capacityEvidence&&'Verify available power, gas life and rights.',!p.reuseEvidence&&'Inspect existing assets and price remaining work.',(!p.fundingEvidence||p.ownerCapexUsd===null||p.ownerFundingUsd<p.ownerCapexUsd)&&'Confirm owner capital and funding.',!p.meterScope&&'Define meters, auxiliaries, losses and rate inclusions.',!p.maintenanceScope&&'Agree major maintenance and miner-repair responsibilities.',!p.customerEvidence&&'Verify customer commitments and cancellation/credit terms.',!p.recoveryEvidence&&'Agree recovery-account costs, credits, return and review rights.',p.startupAvailableUsd===null&&'Proton startup budget is unknown.',p.supportState!=='off'&&!launch.eligible&&'Launch support is not currently eligible for a payment.'].filter(Boolean)};
  }
  function proposal(raw,name){
    const r=calculate(raw);if(!r.valid)throw Error(r.errors.join(' '));const p=r.plan,a=r.annual;
    return ['DRAFT — PROTON MANAGED ENERGY HOSTING',name||'Unlinked planning scenario','Illustrative assumptions; not an offer, customer commitment or payment instruction.','',
      'Ownership: owner-funded, owner-owned infrastructure; customer-owned ASICs; Proton coordinates development and hosting. Owner funds agreed major infrastructure maintenance. Customer funds miner repairs unless included.','Recorded owner: '+(p.owner||'Unconfirmed')+'; gas rights: '+(p.gasRightsHolder||'Unconfirmed')+'; equipment owner: '+(p.equipmentOwner||'Unconfirmed'),
      'Phase: '+p.phaseKw+' kW. Planned customer occupancy '+p.occupancyPct+'%, uptime '+p.uptimePct+'%, collections '+p.collectionPct+'%.',
      'Customer '+p.clientCents+' cents/billable kWh. Owner recovery/after '+p.ownerRecoveryCents+'/'+p.ownerAfterCents+' cents per '+p.ownerRateBasis+' kWh.',
      'Owner remaining capex '+money(p.ownerCapexUsd)+'; recorded funding '+money(p.ownerFundingUsd)+'; unfunded '+money(r.ownerFundingGap)+'.',
      'Annual billed hosting '+money(a.billedRevenue)+'; modeled collections '+money(a.cashRevenue)+'; Proton operating costs '+money(a.protonCost)+'.',
      'Owner cash before/after recovery '+money(a.recovery.ownerCash)+' / '+money(a.after.ownerCash)+'; forgone alternative income '+money(p.alternativeAnnual)+'.',
      'Proton operating contribution before/after recovery '+money(a.recovery.protonContribution)+' / '+money(a.after.protonContribution)+'. Excludes development fees, launch support, self-mining, tax and finance.',
      'Modeled recovery '+(r.recoveryYears===null?'not established':r.recoveryYears.toFixed(2)+' operating years')+' at hypothetical '+p.recoveryReturnPct+'% annual return. No construction/ramp period included.',
      'Development milestones: feasibility '+money(p.feeFeasibilityUsd)+', development '+money(p.feeDevelopmentUsd)+', acceptance '+money(p.feeAcceptanceUsd)+'; total '+money(r.fees)+'. Collected fee record '+money(p.feesCollectedUsd)+'.',
      'Working capital '+money(r.workingCapital)+' for '+p.collectionGapDays+' days of unmatched operating outflows. Startup cash need '+money(r.cashNeed)+'; available budget '+money(p.startupAvailableUsd)+'. Security liabilities '+money(p.securityLiabilityUsd)+' are not revenue.',
      'Launch payment support: '+p.supportState+'. Floor '+p.supportPct+'% of '+p.phaseKw+' kW × availability, '+p.supportDays+' days; cap '+money(p.supportCapUsd)+'; funded '+money(p.supportFundedUsd)+'; paid '+money(p.supportSpentUsd)+'.',
      'Period floor '+money(r.support.target)+'; ordinary-payment credits '+money(r.support.usageCredit)+'; capped top-up '+money(r.support.topup)+'; eligible for reconciliation '+(r.support.eligible?'yes':'no')+'. Never adds occupancy or energy use. Expiry '+(r.support.expiry||'not set')+'.',
      'Recorded signed capacity '+p.signedKw+' kW; physically energized '+p.energizedKw+' kW; billed '+p.actualBilledKwh+' kWh; collected hosting '+money(p.collectedUsd)+'. These are distinct evidence-backed records.',
      'Separate self-mining scenario: '+p.selfKw+' kW; ASIC capital '+money(p.selfHardwareUsd)+'; annual mining contribution '+money(r.selfMining.contribution)+'. No hosting revenue is assigned to self-mining.',
      '', 'Evidence / outstanding work:',...r.gaps.map(x=>'- '+x),'',JSON.stringify(p,null,2)].join('\n');
  }
  return {KEY,SERVICE,defaults,states,stages,normalize,validate,calculate,annual,support,recoveryYears,proposal,money};
}));
