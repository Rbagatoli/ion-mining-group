/* Pure adapters for the authenticated intake inbox and site provenance.
 * The private intake service owns received requests; this module neither receives
 * nor stores submissions. SiteData owns physical sites. Names and coordinates do
 * not establish that two opportunities are the same site. Nothing here sends a
 * message, invokes a native agent, or authorizes outreach. */
(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./energy-scouting'):root.ProtonCrmEnergyScouting);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.ProtonSourcingModel=api;
}(typeof window==='undefined'?globalThis:window,function(E){
  'use strict';
  const KEY='sourcing',SERVICES=['custom_search','site_review','site_submission'];
  const clone=value=>JSON.parse(JSON.stringify(value));
  const object=(value,label)=>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error(label+' must be an object.');return value;};
  function text(value,label,max=2000,required=false){if(value===null||value===undefined)value='';if(typeof value!=='string'||value.length>max)throw Error(label+' must be text, at most '+max+' characters.');value=value.trim();if(required&&!value)throw Error(label+' is required.');return value;}
  function id(value,label='ID'){value=text(value,label,160,true);if(!/^[A-Za-z0-9_.:-]+$/.test(value))throw Error(label+' must be an exact stable ID.');return value;}
  function choice(value,allowed,label,fallback){value=value===undefined||value===null||value===''?fallback:value;if(!allowed.includes(value))throw Error('Invalid '+label+'.');return value;}
  function date(value,label,now,required=false){if(value===null||value===undefined||value===''){if(required)throw Error(label+' is required.');return null;}if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value.slice(0,10))throw Error('Invalid '+label+'.');if(now&&Date.parse(value)>Date.parse(now))throw Error(label+' cannot be in the future.');return value;}
  function revision(value,label='Brief revision'){if(value===undefined||value===null)value=1;const v=String(value);if(!/^[1-9]\d{0,8}$/.test(v))throw Error('Invalid '+label+'.');return v;}
  function requestRef(record){
    object(record,'Private request');
    const payload=object(record.payload,'Received request payload');
    if(!SERVICES.includes(record.service)||payload.service!==record.service)throw Error('Request service and immutable payload disagree.');
    if(!['received','qualified','rejected'].includes(record.status))throw Error('A durable received request is required; a local draft is not a receipt.');
    return {requestId:id(record.id,'Private request ID'),briefId:id(record.id,'Brief ID'),briefRevision:revision(record.briefRevision),receivedAt:date(record.receivedAt,'Receipt time',null,true),routeEmail:text(record.routeEmail||'Not recorded','Private routing address',254,true)};
  }
  function fromRequest(record){
    const ref=requestRef(record),raw=object(record.payload.brief,'Received brief'),contact=object(record.payload.contact,'Received contact');
    const permitted=['power','minMw','maxMw','geography','country','transaction','upfrontBudget','timing','costBasis','existingOpportunities','siteDetails','acquisitionSource','notes','states','excludedStates','excludedSources','maxDeliveredCentsKwh','maxEnergyCentsKwh','maxSiteCapitalUsd','supply','operation','connectionReadiness','minUptimePct','minTermMonths','startBy','additionalRequirements','knownSiteExclusions','targetSiteIds'];
    const input={};for(const key of permitted)if(raw[key]!==undefined)input[key]=clone(raw[key]);
    input.energySources=clone(raw.sourceTypes||raw.energySources||[]);
    input.service=record.service;input.scope='public_us';input.id=ref.briefId;input.revision=ref.briefRevision;
    input.client=text(contact.company||contact.name||'','Client name',180);
    input.reference=ref.requestId+' / brief '+ref.briefRevision;
    const legacy={capitalPayer:'Capital payer as supplied',operatingFlexibility:'Legacy operating flexibility',minimumAvailabilityPct:'Legacy minimum availability (%)',supplyArrangement:'Legacy supply arrangement',powerCostCents:'Legacy energy-price target (cents/kWh; confirm currency and cost basis)',capitalResponsibility:'Legacy capital responsibility',infrastructurePreference:'Legacy infrastructure preference',exclusions:'Legacy exclusions'};
    const requirements=[input.additionalRequirements];
    for(const [key,label] of Object.entries(legacy)){
      const value=raw[key];if(value===undefined||value===null||value==='')continue;
      const preserved=typeof value==='number'&&Number.isFinite(value)?String(value):text(value,label,3000);
      requirements.push(label+': '+preserved+'. Preserve this supplied criterion and resolve its meaning against the current brief; no satisfaction or equivalence is assumed.');
    }
    input.additionalRequirements=requirements.filter(Boolean).join('\n');
    return E.normalizeBrief(input);
  }
  function researchDraft(record,options={}){
    const ref=requestRef(record);
    if(record.status!=='qualified')throw Error('Qualify the received request before creating its research draft.');
    const draft=E.assignment({brief:fromRequest(record),candidate:options.candidate||null,page:options.page});
    // Keep this reference in the persisted task text: task.add intentionally does
    // not accept arbitrary private intake objects or acknowledge native delivery.
    draft.brief+='\n\nReceived private request: '+ref.requestId+'\nImmutable brief ID/version: '+ref.briefId+' / '+ref.briefRevision+'\nReceipt recorded: '+ref.receivedAt+'\nIntake route: '+ref.routeEmail+'\nRequest status changes do not change this brief version. Queue linkage requires the exact saved task ID; native delivery acknowledgment is a separate recorded event.';
    if(draft.brief.length>9000)throw Error('This received brief is too long for one research task. Its full private request is preserved; prepare a bounded assignment with its exact request/version reference instead of truncating the customer requirements.');
    return draft;
  }
  function metrics(records){
    if(!Array.isArray(records))throw Error('Private inbox records must be a list.');
    const unique=new Map();for(const record of records){const ref=requestRef(record);if(unique.has(ref.requestId))throw Error('Duplicate private request ID; reconcile inbox pagination before counting.');unique.set(ref.requestId,record);}
    const result={received:unique.size,qualified:0,rejected:0,draftSaved:0,acknowledged:0,bySource:Object.create(null)};
    for(const record of unique.values()){
      if(record.status==='qualified')result.qualified++;if(record.status==='rejected')result.rejected++;
      if(record.queue?.state==='draft_saved')result.draftSaved++;if(record.queue?.state==='acknowledged')result.acknowledged++;
      const source=text(record.payload.attribution?.source||record.payload.brief?.acquisitionSource||'unknown','Acquisition source',600);
      const group=result.bySource[source]||(result.bySource[source]={received:0,qualified:0});group.received++;if(record.status==='qualified')group.qualified++;
    }
    return result;
  }
  function queue(records){
    if(!Array.isArray(records))throw Error('Private inbox records must be a list.');
    return records.map(record=>{
      const ref=requestRef(record),q=record.queue||{state:'not_queued'},state=choice(q.state,['not_queued','draft_saved','acknowledged'],'queue state','not_queued');
      if(state!=='not_queued'&&!q.taskId)throw Error('A saved queue link needs its exact task ID.');
      if(state!=='not_queued'&&record.service==='site_submission')throw Error('Supply input is not a client research queue item.');
      if(q.briefId&&q.briefId!==ref.briefId)throw Error('Queue link belongs to another private brief.');
      if(q.briefRevision!==undefined&&revision(q.briefRevision)!==ref.briefRevision)throw Error('Queue link belongs to another immutable brief version.');
      if(state==='acknowledged'&&(!q.acknowledgedBy||!q.evidence||!q.acknowledgedAt))throw Error('Delivery acknowledgment needs actor, time and evidence; a saved draft is not delivery.');
      return {...ref,service:record.service,status:record.status,state,taskId:q.taskId?id(q.taskId,'Exact task ID'):null,taskOwnerUid:q.taskOwnerUid?text(q.taskOwnerUid,'CRM task owner UID',128,true):null,acknowledgedBy:q.acknowledgedBy||null,acknowledgedAt:date(q.acknowledgedAt,'Acknowledgment time'),evidence:q.evidence||'',nativeExecution:'not_established'};
    });
  }
  function normalizePartner(raw,now){
    object(raw,'Supply partner');
    return {id:id(raw.id,'Partner ID'),name:text(raw.name,'Partner name',180,true),kind:choice(raw.kind,['owner','operator','intermediary','referrer','unknown'],'partner kind','unknown'),contactRoute:text(raw.contactRoute,'Contact route',2000),originatingSource:text(raw.originatingSource,'Originating source',700),sourceReference:text(raw.sourceReference,'Source reference',2000),lastConfirmedAt:date(raw.lastConfirmedAt,'Last contact confirmation',now),recordedBy:text(raw.recordedBy,'Recorded by',180,true)};
  }
  function normalizeRoute(raw,siteId,now){
    object(raw,'Site route');
    if(raw.physicalSiteId!==undefined&&raw.physicalSiteId!==siteId)throw Error('The route belongs to another physical site.');
    const out={id:id(raw.id,'Route ID'),physicalSiteId:id(siteId,'Physical SiteData ID'),partnerId:id(raw.partnerId,'Partner ID'),partnerName:text(raw.partnerName,'Partner name',180,true),partnerKind:choice(raw.partnerKind,['owner','operator','intermediary','referrer','unknown'],'partner kind','unknown'),originatingSource:text(raw.originatingSource,'Originating source',700,true),sourceReference:text(raw.sourceReference,'Original evidence reference',2000,true),authority:choice(raw.authority,['unverified','owner','operator','mandated'],'authority','unverified'),authorityEvidence:text(raw.authorityEvidence,'Authority evidence',2000),contactRoute:text(raw.contactRoute,'Contact route',2000),lastConfirmedAt:date(raw.lastConfirmedAt,'Last confirmation',now),introductionTerms:text(raw.introductionTerms,'Introduction terms',2000),requestId:raw.requestId?id(raw.requestId,'Private request ID'):null,recordedBy:text(raw.recordedBy,'Recorded by',180,true)};
    if(out.authority!=='unverified'&&(!out.authorityEvidence||!out.lastConfirmedAt))throw Error('Recorded authority needs its evidence and actual last confirmation date.');
    return out;
  }
  function assessmentFacet(raw,key,statuses,now){
    const value=raw[key]||{},status=choice(value.status,statuses,key+' state',statuses[0]);
    const out={status,reference:text(value.reference,key+' evidence reference',3000),confirmedAt:date(value.confirmedAt,key+' confirmation',now)};
    if(status!==statuses[0]&&(!out.reference||!out.confirmedAt))throw Error(key+' requires its own evidence and date; another field\'s completion does not prove it.');
    return out;
  }
  function normalizeAssessment(raw,siteId,now){
    object(raw,'Client site assessment');
    if(raw.physicalSiteId!==undefined&&raw.physicalSiteId!==siteId)throw Error('Assessment belongs to another physical site.');
    const out={id:id(raw.id,'Assessment ID'),physicalSiteId:id(siteId,'Physical SiteData ID'),requestId:id(raw.requestId,'Private request ID'),briefRevision:revision(raw.briefRevision),recordedBy:text(raw.recordedBy,'Recorded by',180,true),notes:text(raw.notes,'Assessment notes',5000),research:assessmentFacet(raw,'research',['not_started','in_progress','completed','independently_reviewed'],now),ownerInterest:assessmentFacet(raw,'ownerInterest',['unknown','open_to_discuss','declined'],now),terms:assessmentFacet(raw,'terms',['unknown','indicative','documented'],now),clientFit:assessmentFacet(raw,'clientFit',['unassessed','unresolved','potential_fit','mismatch'],now)};
    if(raw.research?.taskId)out.research.taskId=id(raw.research.taskId,'Source task ID');
    if(raw.research?.resultVersion!==undefined){if(!Number.isSafeInteger(raw.research.resultVersion)||raw.research.resultVersion<1)throw Error('A research result version must be a positive integer.');out.research.resultVersion=raw.research.resultVersion;}
    if(raw.research?.reviewTaskId)out.research.reviewTaskId=id(raw.research.reviewTaskId,'Independent review task ID');
    if(['completed','independently_reviewed'].includes(out.research.status)&&(!out.research.taskId||!out.research.resultVersion))throw Error('Completed research requires an exact source task and result version.');
    if(out.research.status==='independently_reviewed'&&!out.research.reviewTaskId)throw Error('Independent review requires its separate Quality task ID.');
    if(out.research.reviewTaskId&&out.research.reviewTaskId===out.research.taskId)throw Error('Independent Quality review cannot be the source task.');
    return out;
  }
  function siteRecord(previous,command,context){
    object(context,'Site context');const siteId=id(context.siteId,'Physical SiteData ID'),now=date(context.now||new Date().toISOString(),'Recorded time',null,true);
    const state=previous?clone(previous):{schema:1,siteId,routes:[],assessments:[],history:[]};
    if(state.schema!==1||state.siteId!==siteId||!Array.isArray(state.routes)||!Array.isArray(state.assessments)||!Array.isArray(state.history))throw Error('Invalid site provenance record; preserve it before repair.');
    object(command,'Site provenance command');const kind=choice(command.type,['route.upsert','assessment.record'],'site provenance action');
    const key=kind==='route.upsert'?'routes':'assessments',normalized=key==='routes'?normalizeRoute(command.payload,siteId,now):normalizeAssessment(command.payload,siteId,now),index=state[key].findIndex(row=>row.id===normalized.id),prior=index<0?null:state[key][index];
    if(prior&&JSON.stringify(prior)===JSON.stringify(normalized))return state;
    if(prior&&(prior.physicalSiteId!==normalized.physicalSiteId||key==='routes'&&prior.partnerId!==normalized.partnerId||key==='assessments'&&(prior.requestId!==normalized.requestId||prior.briefRevision!==normalized.briefRevision)))throw Error('A stable provenance ID cannot be reassigned to another site, partner or client brief.');
    if(prior)state[key][index]=normalized;else state[key].push(normalized);
    state.history.push({type:kind,id:normalized.id,at:now,recordedBy:normalized.recordedBy,previous:prior,value:clone(normalized)});
    if(state.routes.length>100||state.assessments.length>100||state.history.length>300||JSON.stringify(state).length>250000)throw Error('Site provenance is full; preserve/archive its history before adding records.');
    return state;
  }
  function findPhysicalSite(sites,identity){
    if(!Array.isArray(sites))throw Error('Saved physical sites must be a list.');object(identity,'Site identity');
    const siteId=identity.siteId?id(identity.siteId,'Physical SiteData ID'):null,sourceId=text(identity.sourceId,'Source namespace',160),sourceRecordId=text(identity.sourceRecordId,'Source record ID',180);
    if(!siteId&&(!sourceId||!sourceRecordId))return null;
    const matches=sites.filter(site=>siteId?site.id===siteId:site.discovery?.sourceId===sourceId&&site.discovery?.sourceRecordId===sourceRecordId);
    if(matches.length>1)throw Error('Multiple saved physical sites have the same exact identity; resolve the duplicate before linking.');
    if(siteId&&matches[0]&&sourceId&&sourceRecordId&&(matches[0].discovery?.sourceId!==sourceId||matches[0].discovery?.sourceRecordId!==sourceRecordId))throw Error('Supplied site and source identities conflict.');
    return matches[0]||null;
  }
  return Object.freeze({KEY,SERVICES,fromRequest,fromIntake:fromRequest,requestRef,researchDraft,metrics,queue,normalizePartner,normalizeRoute,normalizeAssessment,siteRecord,findPhysicalSite});
}));
