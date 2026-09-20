/* Client-specific energy research. Recorded evidence is not an offer or permission to send. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('../energy-opportunity-matching'):root.EnergyOpportunityMatching);if(typeof module==='object'&&module.exports)module.exports=api;else root.ProtonCrmEnergyScouting=api;}(typeof window==='undefined'?globalThis:window,function(E){
  'use strict';
  const KEY='energyScouting',marker='[ENERGY SCOUTING]';
  const assignmentFocus='Specialty: landfill and stranded gas. Client source requirements take precedence. Keep other sources searchable and investigate them for a client need or documented opportunity. Before deeper work, record the dated selection signal, client fit, unknowns and next check. A catalog record alone is not an assignment or a qualified opportunity.';
  const researchPolicy='ENERGY SOURCING PRIORITY: Low-cost United States energy sourcing for Bitcoin mining, specializing in landfill and stranded/flare gas. Keep every energy source searchable. Catalog inclusion or saving a site does not qualify it or create an agent assignment. Begin with the exact client brief, or an explicitly labeled internal sample, and one bounded research question. For a site assignment, record the dated source signal, why it may fit, what remains unknown and the next check before deeper work. Primary specialty: landfill/flare with measured resource, usable equipment or a realistic funding path, an appropriate decision-maker/contact route and a plausible commercial opening. Missing evidence calls for a bounded verification step, not assumed readiness. Consider operating hydro and existing energized sites selectively; investigate nuclear, large conventional plants, wind, solar and other sources for an explicit client need or documented opportunity. Client source requirements and hard exclusions take precedence over the specialty preset. Rank by commercial readiness, delivered cost, client capital and operating fit; fuel type alone cannot establish availability, cheap electricity or a probability of closing. Proton provides paid research; client or provider construction funding must be established separately. Revenue assigns only justified, deduplicated work; Quality checks the selection rationale as well as the findings.';
  const rules='CURRENT ENERGY-SCOUTING SCOPE: preparation only; ZERO external messages, calls, posts, site-owner approaches, campaign enrollment or report delivery. Revenue alone writes CRM, assigns bounded work and records supported dispositions; Quality independently checks the exact source version. Preserve all existing approval, mailbox, recipient, suppression and usage gates. This assignment does not activate ASIC brokerage or managed hosting. Research-screened is not available power, owner willingness, secured rights, a verified energy price, engineering feasibility or a guaranteed viable mine.';
  const checklist='Source-family coverage follows the assigned brief and site scope. Permitted families may include hydro, nuclear, gas, coal, oil, biomass/biogas, waste-to-energy, geothermal, wind, solar and other plants; do not impose a 50 MW plant cap. Apply the client geography, exclusions, load, price basis, project budget, delivery point, operating profile, connection readiness and timing. Nameplate MW, reported historical output, and an explicit uncommitted offer of net client MW are separate quantities. Never infer available or surplus MW from nameplate minus output or from a low capacity factor. Storage shifts energy: identify charging source, charging capacity/cost, usable MWh, discharge MW, duration, losses and cycling constraints. Preserve source URLs, publication/effective and checked dates, scope, original units, conflicts, unknowns, disqualifiers, ranking reasons and the next owner-confirmation question. Unknown requirements remain unresolved; exclude evidenced hard mismatches before ranking preferences. Keep public-source findings separate from owner confirmation and from independent QA.';
  const supply={either:'Electricity or fuel',electricity:'Electricity',fuel:'Fuel / generation required'};
  const operation={flexible:'Flexible',continuous:'Continuous',interruptible:'Interruptible',seasonal:'Seasonal'};
  const costBases={delivered:'Delivered electricity',energy_only:'Energy only; delivery costs unresolved'};
  const readiness={any:'Any; report readiness',existing:'Existing connection required',new_build_allowed:'New connection / build allowed'};
  const list=v=>Array.isArray(v)?v.map(String).map(s=>s.trim()).filter(Boolean):String(v||'').split(/[,\n]+/).map(s=>s.trim()).filter(Boolean);
  const number=v=>v==null||String(v).trim()===''?null:Number(v);
  const known=v=>v===null||v===undefined||v===''?'Unknown':String(v);
  function normalizeBrief(raw={}){
    if(number(raw.minMw)===null)throw Error('Enter the client minimum load; an unknown load is not a one-MW requirement.');
    const input={...raw};for(const key of ['states','excludedStates','energySources','excludedSources','knownSiteExclusions'])input[key]=list(input[key]);
    for(const key of ['minMw','maxMw','maxDeliveredCentsKwh','maxEnergyCentsKwh','maxSiteCapitalUsd','minUptimePct','minTermMonths'])input[key]=number(input[key]);
    input.costBasis=input.costBasis||'delivered';
    const unknownCriteria=Array.isArray(raw.unknownCriteria)?raw.unknownCriteria.filter(k=>['supply','operation','connectionReadiness'].includes(k)):['supply','operation','connectionReadiness'].filter(k=>!raw[k]);
    const unresolved=unknownCriteria.length?'Confirm client criteria: '+unknownCriteria.join(', ')+'.':'';
    if(typeof input.additionalRequirements==='string')input.additionalRequirements=input.additionalRequirements.replace(/^Confirm client criteria: (?:supply|operation|connectionReadiness)(?:, (?:supply|operation|connectionReadiness))*\.\s*$/gm,'').trim();
    if(unresolved){if(input.additionalRequirements!=null&&typeof input.additionalRequirements!=='string')throw Error('Additional requirements must be text.');if(!String(input.additionalRequirements||'').includes(unresolved))input.additionalRequirements=[input.additionalRequirements,unresolved].filter(Boolean).join('\n');}
    return {...E.normalizeBrief(input),client:String(raw.client||'').trim().slice(0,180),reference:String(raw.reference||'').trim().slice(0,180),costBasis:input.costBasis,unknownCriteria};
  }
  function candidate(record,saved,brief){
    const d=record.sourceDetail||{},snapshot=record.sourceSnapshot||{},meta={sourceUrl:snapshot.sourceUrl||d.sourceUrl||'',sourceReleaseDate:snapshot.reportingPeriod||d.reportingPeriod||d.lastDataMonth||null};
    const raw={...d,...record,country:record.iso3||record.country||null,state:d.state||record.state||null,observedAt:meta.sourceReleaseDate,technology:record.energyTechnology||d.technology,energyTechnologies:record.energyTechnologies||d.energyTechnologies,nameplateMw:Number.isFinite(record.existingGenerationKw)?record.existingGenerationKw/1000:null,resourcePotentialMw:Number.isFinite(record.powerPotentialKw)?record.powerPotentialKw/1000:null};
    let value=record.energyType==='grid_facility'?E.fromFacility(raw,meta):record.energyType==='landfill_gas'?E.fromLandfill(raw,meta):record.energyType==='flare_gas'?E.fromFlare(raw,meta):{...raw,energyTypes:record.energyTechnologies||[record.energyTechnology||'unknown'],sourceUrl:meta.sourceUrl,observedAt:meta.observedAt};
    const current=saved?.custom_fields?.[KEY]?.current;
    const applies=!!(brief&&current?.brief&&JSON.stringify(normalizeBrief(current.brief))===JSON.stringify(normalizeBrief(brief)));
    value={...value,id:record.id,name:record.name,country:record.iso3||value.country||null,state:d.state||value.state||null,evidence:applies?{...current.evidence}:{},evidenceAppliesToBrief:applies,sourceRecordIds:[...new Set([...(value.sourceRecordIds||[]),record.id])],scopeMismatch:!!(current&&brief&&!applies)};
    return value;
  }
  function assess(record,saved,brief){
    const result=E.evaluate(candidate(record,saved,brief),brief);
    if(result.candidate.scopeMismatch)result.missing.push('Recorded owner terms cover another brief/version; confirm applicability to this client and delivery point.');
    return result;
  }
  function saveEvidence(previous={},raw={},now=new Date().toISOString()){
    const asOf=String(raw.asOf||''),validThrough=String(raw.validThrough||''),source=String(raw.source||'').trim(),recordedBy=String(raw.recordedBy||'').trim();
    const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
    if(!validDate(asOf)||asOf>now.slice(0,10))throw Error('Enter the actual evidence date, no later than today.');
    if(validThrough&&(!validDate(validThrough)||validThrough<asOf))throw Error('Evidence expiry must be a valid date on or after its evidence date.');
    if(!source||!recordedBy)throw Error('Record the evidence reference and who recorded it.');
    const stamp={confirmedBy:raw.ownerConfirmed==='on'?'owner':'reported',asOf,source,...(validThrough?{validThrough}:{})},evidence={};
    for(const key of ['availableMw','deliveredCentsKwh','energyCentsKwh','capitalUsd','uptimePct','termMonths']){
      const value=number(raw[key]);if(value===null)continue;if(!Number.isFinite(value)||value<0||key==='uptimePct'&&value>100)throw Error('Use valid nonnegative values; unknown values stay blank.');
      evidence[key]={...stamp,value,...(key==='availableMw'?{basis:raw.capacityBasis||'offered_electrical_capacity'}:{}),...(['deliveredCentsKwh','energyCentsKwh'].includes(key)?{currency:'USD',unit:'cents/kWh',basis:key==='deliveredCentsKwh'?'delivered_all_in':'energy_only'}:{}),...(key==='capitalUsd'?{currency:'USD',scope:'client_total_site'}:{})};
    }
    for(const key of ['rights','supply','operation','connectionReadiness','readyBy','chargingPlan'])if(raw[key])evidence[key]={...stamp,value:raw[key]};
    if(raw.readyBy&&!validDate(raw.readyBy))throw Error('Use a valid readiness date.');
    const current={evidence,recordedBy,recordedAt:now,asOf,source,validThrough,ownerConfirmed:stamp.confirmedBy==='owner',actualOutput:String(raw.actualOutput||'').trim().slice(0,700),findings:String(raw.findings||'').trim().slice(0,1500),nextQuestion:String(raw.nextQuestion||'').trim().slice(0,1000)};
    return {current,history:[...(previous.history||[]),...(previous.current?[previous.current]:[])]};
  }
  function isTask(task){return String(task?.brief||'').startsWith(marker);}
  function briefText(b={}){
    const criterion=(key,labels)=>b.unknownCriteria?.includes(key)||!b[key]?'Unknown; confirm with client':labels[b[key]];
    return [
      'Client / internal sample: '+(b.client||'INTERNAL SAMPLE — no customer requirement claimed'),
      'Brief reference/version: '+(b.reference||'Unassigned; identify before accepted delivery'),
      'United States states: '+(list(b.states).join(', ')||'Nationwide; territories only when explicitly selected'),
      'Excluded states / known sites: '+(list(b.excludedStates).concat(list(b.knownSiteExclusions)).join(', ')||'None supplied'),
      'Allowed source families: '+(list(b.energySources).join(', ')||'All source families'),
      'Excluded sources: '+(list(b.excludedSources).join(', ')||'None supplied'),
      'Client allocation: minimum '+known(b.minMw)+' MW; maximum '+known(b.maxMw)+' MW (not a maximum plant nameplate size)',
      'All-in delivered price ceiling: '+known(b.maxDeliveredCentsKwh)+' USD cents/kWh',
      'Energy-only price ceiling: '+known(b.maxEnergyCentsKwh)+' USD cents/kWh; delivery costs remain separate',
      'Maximum site capital: '+known(b.maxSiteCapitalUsd)+' USD',
      'Supply: '+criterion('supply',supply)+'; operation: '+criterion('operation',operation)+'; minimum uptime: '+known(b.minUptimePct)+'%',
      'Connection: '+criterion('connectionReadiness',readiness)+'; start by: '+known(b.startBy)+'; minimum term: '+known(b.minTermMonths)+' months',
      'Delivery point, auxiliaries and further requirements: '+(b.notes||'Unknown; resolve against the client brief.'),
      'Additional unresolved requirements: '+(b.additionalRequirements||'None supplied')
    ].join('\n');
  }
  function assignment({brief={},candidate=null,source=null,page='https://protonminingco.com/crm/'}={}){
    const sourceUrl=candidate?.sourceSnapshot?.sourceUrl||candidate?.sourceUrl||candidate?.sourceURL||candidate?.sourceDetail?.sourceUrl||source?.url;
    const sourcePeriod=candidate?.sourceSnapshot?.reportingPeriod||candidate?.sourceDetail?.reportingPeriod||source?.reportingPeriod;
    const context=candidate?'\nSource record: '+candidate.id+'\nSite: '+candidate.name+'\nSource evidence: '+(sourceUrl||'Record original URLs and source dates; do not invent a URL.')+'\nSource reporting period: '+(sourcePeriod||'Unknown; confirm from original source')+'\nCRM: '+page:'';
    const scope=candidate?'Review only this identified site against the exact brief. Do not launch a nationwide search or duplicate other roles’ work.': 'Choose one bounded search unit across the permitted US geography and source families; record actual coverage and continue from a deduplicated next action. Do not claim exhaustive national coverage.';
    const makeDraft=detail=>({title:(candidate?'Energy fit: '+candidate.name:'United States energy search brief').slice(0,180),role:'supply',brief:marker+'\n'+rules+'\n\n'+assignmentFocus+'\n\n'+scope+' Keep existing limits: one small production assignment, about ten substantive minutes/fifteen overall; retain partial findings when the budget expires.\n\n'+briefText(brief)+context+'\n\n'+detail+'\n\nReturn a source-linked shortlist or a justified no-match/unresolved result for this exact brief, with exclusions, ranking rationale and one next action. Preserve immutable reviewed versions. No outreach is authorized.'});
    const full=makeDraft(checklist);
    return full.brief.length<=9000?full:makeDraft('Retain original units, dates and source evidence. Distinguish resource, generation and offered client MW; compare delivered cost and remaining capital. Missing facts stay unresolved. Apply hard exclusions before ranking. Use the complete energy checklist in the handoff packet and return independent-review evidence.');
  }
  return {KEY,marker,rules,researchPolicy,checklist,supply,operation,costBases,readiness,list,number,known,isTask,briefText,assignment,normalizeBrief,candidate,assess,saveEvidence,matching:E};
}));
