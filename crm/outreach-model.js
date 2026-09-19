/* Recorded multichannel evidence. Pure transitions; no transport or scheduler.
 * The journal is authoritative and append-only. No activity-list truncation,
 * last-writer-wins merge, client clock or UI status grants sending capability. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ProtonCrmOutreach = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const CHANNELS = Object.freeze({email:'Email',sms:'SMS',whatsapp:'WhatsApp',telegram:'Telegram',x:'X',linkedin:'LinkedIn'});
  const PURPOSES = Object.freeze({prospecting:'Proactive introduction / follow-up',quote_update:'Requested quote update',service:'Requested service conversation'});
  const POLICY = Object.freeze({version:'multichannel-autonomy-v1',newRecipientsPerDay:10,initialPerCycle:3,outboundPerDay:20,proactiveTouches:3,windowBusinessDays:10,followupBusinessDays:[3,7],openHour:9,closeHour:17,budgetTimezone:'UTC',advisory:true,transportActive:false});
  const STATUSES = ['draft','prepared','attempted','sent','delivered','failed','unknown','received'];
  const READINESS = ['not_configured','pending','connected_unverified','verified','unavailable'];
  const ACTUAL = ['sent','delivered','received'];
  const UNRESOLVED = ['attempted','unknown'];
  // Cache only immutable formatting configuration, never mutable contact evidence.
  const timeFormatters=new Map();
  function timeFormatter(timezone){
    if(timeFormatters.has(timezone))return timeFormatters.get(timezone);
    const formatter=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    if(timeFormatters.size>=64)timeFormatters.delete(timeFormatters.keys().next().value);
    timeFormatters.set(timezone,formatter);return formatter;
  }
  const copy = value => JSON.parse(JSON.stringify(value));
  const fail = message => { throw Error(message); };
  const has = (object,key) => Object.prototype.hasOwnProperty.call(object,key);
  const own = (value, choices, label) => { if (!has(choices,value)) fail('Choose a valid '+label+'.'); return value; };
  function text(value,max,label,required=false) {
    if (typeof value !== 'string' || value.length>max || required&&!value.trim()) fail('Record '+label+'.');
    return value.trim();
  }
  function id(value) { if (typeof value!=='string'||!/^[A-Za-z0-9_-]{1,90}$/.test(value)) fail('Invalid outreach record ID.'); return value; }
  function iso(value,label='event time') {
    if (typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value))) fail('Record a valid '+label+'.');
    const dayPart=value.slice(0,10);day(dayPart);return new Date(value).toISOString();
  }
  function day(value) {
    if (typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T12:00:00Z'))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value) fail('Record a valid evidence date.');
    return value;
  }
  function checked(value,at) { day(value);if(value>at.slice(0,10)) fail('Evidence cannot be future-dated.');return value; }
  function zone(value) {
    if (!value) return '';
    text(value,90,'recipient timezone');
    try { timeFormatter(value); } catch (_) { fail('Use an IANA recipient timezone.'); }
    return value;
  }
  function account(lead) {
    let url;try { url=new URL(lead.website); } catch (_) { fail('The lead needs a valid company website.'); }
    if(!/^https?:$/.test(url.protocol)||url.username||url.password) fail('The lead needs a valid company website.');
    return url.hostname.toLowerCase().replace(/^www\./,'');
  }
  function leadFor(leads,key) { const lead=leads.find(l=>l.id===key);if(!lead) fail('The outreach lead is missing.');return lead; }
  function routeFor(outreach,key) { const route=outreach.routes.find(r=>r.id===key);if(!route) fail('The contact route is missing.');return route; }
  function normalized(channel,address) {
    own(channel,CHANNELS,'delivery channel');address=text(address,500,'channel address',true);
    if(channel==='email') { if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))fail('Record an email address.');return address.toLowerCase(); }
    if(channel==='sms'||channel==='whatsapp') { if(!/^\+[1-9]\d{6,14}$/.test(address)) fail('Use the verified full E.164 number, including country code.');return address; }
    if(channel==='x'||channel==='telegram') { const handle=address.replace(/^@/,'');if(!/^[A-Za-z0-9_]{1,50}$/.test(handle))fail('Record the exact channel handle.');return handle.toLowerCase(); }
    let url;try{url=new URL(address);}catch(_){fail('Use the full LinkedIn profile or company URL.');}
    if(url.protocol!=='https:'||!/(^|\.)linkedin\.com$/.test(url.hostname)||url.username||url.password||!/^\/(in|company)\/[^/]+\/?$/.test(url.pathname))fail('Use the full LinkedIn profile or company URL.');
    return 'https://www.linkedin.com'+url.pathname.replace(/\/$/,'').toLowerCase();
  }
  function initial() { return {schema:1,routes:[],events:[]}; }
  function evidence(p,required=true) { return text(p.evidence||'',2000,'evidence reference',required); }
  function eventBase(a,p) {
    return {id:id(a.id),type:a.type,at:iso(a.at),recordedBy:text(p.recordedBy,180,'the actual recorder',true)};
  }
  function actualTime(p,at) {
    const occurredAt=iso(p.occurredAt||at,'actual occurrence time');
    if(Date.parse(occurredAt)>Date.parse(at))fail('A completed event cannot be future-dated.');
    return occurredAt;
  }
  function sourceFields(p,at) {
    const timezone=zone(p.timezone||'');
    return {source:text(p.source,1800,'route source',true),checkedOn:checked(p.checkedOn,at),timezone,timezoneSource:text(p.timezoneSource||'',1800,'timezone evidence',!!timezone)};
  }
  function touchFields(p,at,previous) {
    const status=p.status;if(!STATUSES.includes(status))fail('Choose the recorded touch status.');
    const out={status,occurredAt:actualTime(p,at),evidence:evidence(p,!['draft','prepared'].includes(status)),providerRef:text(p.providerRef||previous?.providerRef||'',500,'provider/message reference',ACTUAL.includes(status)),threadRef:text(p.threadRef||previous?.threadRef||'',500,'thread reference')};
    if(previous) {
      const transitions={draft:['prepared','failed'],prepared:['attempted','sent','delivered','failed','unknown'],attempted:['sent','delivered','failed','unknown'],unknown:['sent','delivered','failed'],sent:['delivered'],delivered:[],failed:[],received:[]};
      if(!transitions[previous.status].includes(status))fail('Reconcile the same touch forward; do not erase a completed or failed outcome.');
      // Provider evidence can arrive late. Its actual send time may precede the
      // time an unknown outcome was recorded; preserve both rather than invent it.
    }
    return out;
  }
  function deriveTouches(outreach) {
    const map=new Map();
    for(const event of outreach.events) {
      if(event.type==='outreach.touch.record') {
        const t=event.touch;map.set(t.id,{...t,firstActualAt:ACTUAL.includes(t.status)?t.occurredAt:null,firstAttemptAt:['attempted','unknown','sent','delivered'].includes(t.status)?t.occurredAt:null,lastEventAt:t.occurredAt,recordedAt:event.at,recordedBy:event.recordedBy,eventId:event.id});
      } else if(event.type==='outreach.touch.update') {
        const prior=map.get(event.touchId);if(prior){const u=event.update,firstActualAt=prior.firstActualAt||(ACTUAL.includes(u.status)?u.occurredAt:null),firstAttemptAt=prior.firstAttemptAt||(['attempted','unknown','sent','delivered'].includes(u.status)?u.occurredAt:null);map.set(event.touchId,{...prior,...u,firstActualAt,firstAttemptAt,occurredAt:firstActualAt||firstAttemptAt||u.occurredAt,lastEventAt:u.occurredAt,eventId:event.id});}
      }
    }
    return [...map.values()];
  }
  function validateEvent(event,outreach) {
    id(event.id);iso(event.at);text(event.recordedBy,180,'event recorder',true);
    const p=event;
    if(event.type==='outreach.route.add') { id(p.routeId);routeFor(outreach,p.routeId); }
    else if(event.type==='outreach.route.preference') { routeFor(outreach,p.routeId);if(typeof p.preferred!=='boolean')fail('Invalid preferred-channel record.'); }
    else if(event.type==='outreach.route.evidence') { routeFor(outreach,p.routeId);sourceFields(p,event.at); }
    else if(event.type==='outreach.permission.record') {
      const r=routeFor(outreach,p.routeId);if(p.routeKey!==r.routeKey||p.accountKey!==r.accountKey)fail('Permission identity changed.');own(p.purpose,PURPOSES,'permission purpose');
      if(!['unknown','granted','revoked'].includes(p.status))fail('Choose a permission status.');evidence(p,p.status!=='unknown');actualTime(p,event.at);text(p.method||'',180,'permission acquisition method');text(p.disclosureVersion||'',180,'disclosure version');
      if(p.status==='granted'&&!p.method)fail('Record how purpose-specific permission was obtained.');
    } else if(event.type==='outreach.suppression.record') {
      id(p.leadId);text(p.accountKey,253,'suppressed account',true);if(!['route','account'].includes(p.scope))fail('Choose suppression scope.');if(p.scope==='route'&&p.routeKey!==routeFor(outreach,p.routeId).routeKey)fail('Suppression route changed.');text(p.reason,1200,'suppression reason',true);evidence(p);actualTime(p,event.at);
    } else if(event.type==='outreach.channel.record') {
      own(p.channel,CHANNELS,'channel');if(!READINESS.includes(p.status))fail('Choose the recorded channel setup state.');text(p.identity||'',300,'sender identity',p.status==='verified');evidence(p,p.status!=='not_configured');checked(p.checkedOn,event.at);text(p.blocker||'',1500,'setup blocker');
    } else if(event.type==='outreach.touch.record') {
      const t=p.touch,r=routeFor(outreach,t.routeId);id(t.id);if(t.leadId!==r.leadId||t.accountKey!==r.accountKey||t.routeKey!==r.routeKey||t.channel!==r.channel)fail('Touch identity changed.');own(t.purpose,PURPOSES,'touch purpose');
      if(!['inbound','outbound'].includes(t.direction)||(t.direction==='inbound')!==(t.status==='received'))fail('Inbound touches must record an actual received event.');
      if(t.direction==='inbound'&&!['human','auto'].includes(t.replyKind))fail('Classify the received reply.');if(typeof t.internalTest!=='boolean')fail('Classify internal test evidence.');
      touchFields(t,event.at);if(['draft','prepared'].includes(t.status)&&(!t.taskId||!Number.isSafeInteger(t.resultVersion)||t.resultVersion<1||!t.messageVersion))fail('A prepared draft needs its exact source task, result version and message version.');
      for(const key of ['taskId','reviewTaskId','cycleId','personId'])if(t[key])id(t[key]);if(t.resultVersion!==null&&(!Number.isSafeInteger(t.resultVersion)||t.resultVersion<1))fail('Invalid touch result version.');
      for(const key of ['messageVersion','author','reviewer'])text(t[key]||'',180,key);
    } else if(event.type==='outreach.touch.update') { id(p.touchId);touchFields(p.update,event.at); }
    else fail('Unknown outreach journal event.');
  }
  function valid(value,leads=[]) {
    if(value===undefined)return initial();
    if(!value||value.schema!==1||!Array.isArray(value.routes)||!Array.isArray(value.events)||value.routes.length>600||value.events.length>3000)fail('Invalid or full outreach evidence journal. Preserve it before recovery or archival.');
    const ids=new Set();
    for(const r of value.routes) {
      id(r.id);id(r.leadId);if(ids.has(r.id))fail('Duplicate contact route ID.');ids.add(r.id);
      leadFor(leads,r.leadId);
      const address=normalized(r.channel,r.address);if(address!==r.normalizedAddress||r.routeKey!==r.channel+':'+address)fail('Contact route identity changed.');text(r.accountKey,253,'original account domain',true);
      sourceFields(r,r.createdAt);iso(r.createdAt);text(r.recordedBy,180,'route recorder',true);text(r.personName||'',180,'person name');if(r.personId)id(r.personId);if(typeof r.preferred!=='boolean')fail('Invalid preferred route.');
    }
    const eventIds=new Set(),touchIds=new Set(),states=new Map(),addedRoutes=new Set();
    for(const event of value.events) {
      validateEvent(event,value);if(eventIds.has(event.id))fail('Duplicate outreach event ID.');eventIds.add(event.id);
      if(event.type==='outreach.route.add'){if(addedRoutes.has(event.routeId))fail('Duplicate route creation.');addedRoutes.add(event.routeId);}
      if(event.type==='outreach.touch.record'){if(touchIds.has(event.touch.id))fail('Duplicate touch ID.');touchIds.add(event.touch.id);states.set(event.touch.id,event.touch);}
      if(event.type==='outreach.touch.update'){const prior=states.get(event.touchId);if(!prior)fail('Touch reconciliation has no original event.');touchFields(event.update,event.at,prior);states.set(event.touchId,{...prior,...event.update});}
    }
    if(value.routes.some(r=>!addedRoutes.has(r.id)))fail('A route is missing its creation evidence.');
    return value;
  }
  function reduce(value,a,leads=[]) {
    const before=valid(value,leads),outreach=copy(before),p=a.payload||{},event=eventBase(a,p);
    if(before.events.some(e=>e.id===event.id))fail('This outreach event is already recorded. Reopen its receipt instead of repeating it.');
    if(a.type==='outreach.route.add') {
      const lead=leadFor(leads,id(p.leadId)),address=text(p.address,500,'route address',true),norm=normalized(p.channel,address),routeId=id(p.id);
      if(outreach.routes.some(r=>r.id===routeId))fail('This contact route ID is already recorded.');
      if(outreach.routes.some(r=>r.leadId===lead.id&&r.routeKey===p.channel+':'+norm))fail('This lead already has that contact route. Update its evidence.');
      const route={id:routeId,leadId:lead.id,channel:p.channel,address,normalizedAddress:norm,routeKey:p.channel+':'+norm,accountKey:account(lead),personName:text(p.personName||'',180,'person name'),personId:p.personId?id(p.personId):'',...sourceFields(p,event.at),preferred:p.preferred===true,createdAt:event.at,recordedBy:event.recordedBy};
      outreach.routes.push(route);event.routeId=routeId;
    } else if(a.type==='outreach.route.preference') { routeFor(outreach,p.routeId);event.routeId=p.routeId;event.preferred=p.preferred===true; }
    else if(a.type==='outreach.route.evidence') { routeFor(outreach,p.routeId);Object.assign(event,{routeId:p.routeId},sourceFields(p,event.at)); }
    else if(a.type==='outreach.permission.record') {
      const route=routeFor(outreach,p.routeId);Object.assign(event,{routeId:route.id,routeKey:route.routeKey,accountKey:route.accountKey,purpose:p.purpose,status:p.status,evidence:evidence(p,p.status!=='unknown'),method:text(p.method||'',180,'permission method'),disclosureVersion:text(p.disclosureVersion||'',180,'disclosure version'),occurredAt:actualTime(p,event.at)});
    } else if(a.type==='outreach.suppression.record') {
      const lead=leadFor(leads,id(p.leadId)),route=p.routeId?routeFor(outreach,p.routeId):null;if(route&&route.leadId!==lead.id)fail('Choose this lead’s route.');
      Object.assign(event,{leadId:lead.id,accountKey:route?route.accountKey:account(lead),routeId:route?.id||'',routeKey:route?.routeKey||'',scope:p.scope,reason:text(p.reason,1200,'suppression reason',true),evidence:evidence(p),occurredAt:actualTime(p,event.at)});
    } else if(a.type==='outreach.channel.record') Object.assign(event,{channel:p.channel,status:p.status,identity:text(p.identity||'',300,'sender identity'),evidence:evidence(p,p.status!=='not_configured'),blocker:text(p.blocker||'',1500,'setup blocker'),checkedOn:checked(p.checkedOn,event.at)});
    else if(a.type==='outreach.touch.record') {
      const route=routeFor(outreach,p.routeId);if(route.leadId!==p.leadId)fail('Choose this lead’s route.');leadFor(leads,p.leadId);
      event.touch={id:id(p.id),leadId:p.leadId,routeId:route.id,routeKey:route.routeKey,accountKey:route.accountKey,channel:route.channel,personId:route.personId||'',direction:p.direction,purpose:p.purpose,...touchFields(p,event.at),replyKind:p.direction==='inbound'?p.replyKind:'',internalTest:p.internalTest===true,taskId:p.taskId||'',resultVersion:p.resultVersion??null,messageVersion:p.messageVersion||'',reviewTaskId:p.reviewTaskId||'',author:p.author||'',reviewer:p.reviewer||'',cycleId:p.cycleId||''};
    } else if(a.type==='outreach.touch.update') {
      const previous=deriveTouches(outreach).find(t=>t.id===p.touchId);if(!previous)fail('The original touch is missing.');event.touchId=previous.id;event.update=touchFields(p,event.at,previous);
    } else fail('Unknown outreach action.');
    outreach.events.push(event);return valid(outreach,leads);
  }
  function raw(state) { return valid(state.outreach,state.leads||[]); }
  function accountKeys(outreach,lead) { return new Set([account(lead),...outreach.routes.filter(r=>r.leadId===lead.id).map(r=>r.accountKey)]); }
  function related(outreach,lead,item) {
    const routes=outreach.routes.filter(r=>r.leadId===lead.id);
    return item.leadId===lead.id||accountKeys(outreach,lead).has(item.accountKey)||routes.some(r=>r.routeKey===item.routeKey||r.personId&&r.personId===item.personId);
  }
  function permission(outreach,route,purpose) {
    const events=outreach.events.filter(e=>e.type==='outreach.permission.record'&&e.purpose===purpose&&(e.routeId===route.id||e.routeKey===route.routeKey&&e.status==='revoked'));
    if(events.some(e=>e.status==='revoked'))return 'revoked';
    return events.at(-1)?.status||'unknown';
  }
  function suppressed(outreach,leads,lead,route,purpose='prospecting') {
    const reasons=[],keys=accountKeys(outreach,lead);
    for(const other of leads)if(other.stage==='dnc'&&(other.id===lead.id||keys.has(account(other))||route&&other.contact&&other.contact.trim().toLowerCase()===route.normalizedAddress))reasons.push('Existing do-not-contact record.');
    for(const e of outreach.events) {
      const sourceRoute=e.routeId?outreach.routes.find(r=>r.id===e.routeId):null;
      if(e.type==='outreach.suppression.record'&&(e.scope==='account'&&(e.leadId===lead.id||keys.has(e.accountKey))||e.scope==='route'&&route&&e.routeKey===route.routeKey))reasons.push(e.reason);
      if(route&&e.type==='outreach.permission.record'&&e.status==='revoked'&&e.routeKey===route.routeKey&&e.purpose===purpose)reasons.push('Permission for this purpose was revoked.');
      if(purpose==='prospecting'&&(e.type==='outreach.suppression.record'&&e.scope==='route'||e.type==='outreach.permission.record'&&e.status==='revoked'&&e.purpose===purpose)&&related(outreach,lead,{...e,leadId:sourceRoute?.leadId||e.leadId,personId:sourceRoute?.personId||''}))reasons.push('A related route refused outreach. Do not switch channels to bypass that refusal.');
    }
    return [...new Set(reasons)];
  }
  function readiness(outreach) { return Object.keys(CHANNELS).map(channel=>({...{channel,status:'not_configured',identity:'',evidence:'',blocker:'No supported transport is connected by this CRM foundation.',checkedOn:''},...outreach.events.filter(e=>e.type==='outreach.channel.record'&&e.channel===channel).at(-1),transportActive:false,advisory:true})); }
  function routesFor(outreach,leads,lead) {
    const rows=outreach.routes.filter(r=>r.leadId===lead.id).map(r=>({...r,...outreach.events.filter(e=>e.type==='outreach.route.evidence'&&e.routeId===r.id).at(-1),id:r.id,preferred:false,permissions:Object.fromEntries(Object.keys(PURPOSES).map(p=>[p,permission(outreach,r,p)])),suppressed:suppressed(outreach,leads,lead,r).length>0}));
    let preferred='';for(const e of outreach.events){const r=rows.find(x=>x.id===(e.routeId||''));if(!r)continue;if(e.type==='outreach.route.add'&&outreach.routes.find(x=>x.id===r.id).preferred)preferred=r.id;if(e.type==='outreach.route.preference'){if(e.preferred)preferred=r.id;else if(preferred===r.id)preferred='';}}
    rows.forEach(r=>r.preferred=r.id===preferred);return rows;
  }
  function localParts(instant,timezone) {
    const parts=timeFormatter(timezone).formatToParts(new Date(instant));
    const out=Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));out.date=out.year+'-'+out.month+'-'+out.day;out.weekday=new Date(out.date+'T12:00:00Z').getUTCDay();return out;
  }
  function addBusinessDays(date,count) { let d=new Date(date+'T12:00:00Z');while(count>0){d.setUTCDate(d.getUTCDate()+1);if(![0,6].includes(d.getUTCDay()))count--;}return d.toISOString().slice(0,10); }
  function localTime(date,hour,timezone) {
    let guess=Date.parse(date+'T'+String(hour).padStart(2,'0')+':00:00Z');const target=guess;
    for(let n=0;n<4;n++){const p=localParts(guess,timezone),seen=Date.parse(p.date+'T'+p.hour+':'+p.minute+':'+p.second+'Z');guess+=target-seen;}
    return new Date(guess).toISOString();
  }
  function nextWindow(now,earliest,timezone) {
    const p=localParts(now,timezone);let date=earliest&&earliest>p.date?earliest:p.date;
    if(date===p.date&&Number(p.hour)>=POLICY.closeHour)date=addBusinessDays(date,1);
    while([0,6].includes(new Date(date+'T12:00:00Z').getUTCDay()))date=addBusinessDays(date,1);
    if(date===p.date&&Number(p.hour)>=POLICY.openHour&&Number(p.hour)<POLICY.closeHour)return new Date(now).toISOString();
    return localTime(date,POLICY.openHour,timezone);
  }
  const outbound=t=>t.direction==='outbound'&&!t.internalTest;
  const counted=t=>outbound(t)&&['sent','delivered',...UNRESOLVED].includes(t.status);
  const sent=t=>outbound(t)&&['sent','delivered'].includes(t.status);
  // A company can contain many recipients. Unknown cross-channel identities may
  // conservatively count twice; only an explicit shared person link deduplicates.
  const personKey=t=>t.personId?'person:'+t.personId:'route:'+t.routeKey;
  function evaluate(state,options={}) {
    const outreach=raw(state),leads=state.leads||[],lead=leadFor(leads,options.leadId),now=iso(options.now instanceof Date?options.now.toISOString():options.now||new Date().toISOString()),purpose=options.purpose||'prospecting';own(purpose,PURPOSES,'purpose');
    const routes=routesFor(outreach,leads,lead),route=options.routeId?routes.find(r=>r.id===options.routeId):routes.find(r=>r.preferred)||routes[0],touches=deriveTouches(outreach),mine=touches.filter(t=>related(outreach,lead,t));
    if(options.routeId&&!route)fail('Choose this lead’s route.');
    const reasons=suppressed(outreach,leads,lead,route,purpose),paused=mine.some(t=>t.direction==='inbound'&&t.status==='received'&&t.replyKind==='human'&&!t.internalTest),unknown=mine.some(t=>outbound(t)&&UNRESOLVED.includes(t.status));
    const proactive=mine.filter(t=>sent(t)&&t.purpose==='prospecting').sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt)),reservations=mine.filter(t=>counted(t)&&t.purpose==='prospecting');
    const today=now.slice(0,10),all=touches.filter(counted),outboundToday=all.filter(t=>t.occurredAt.slice(0,10)===today).length,firsts=new Map();
    all.slice().sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt)).forEach(t=>{const key=personKey(t);if(!firsts.has(key))firsts.set(key,t);});
    const newRecipientsToday=[...firsts.values()].filter(t=>t.occurredAt.slice(0,10)===today).length,initialThisCycle=options.cycleId?[...firsts.values()].filter(t=>t.cycleId===options.cycleId).length:0;
    const blockers=[],add=(code,message)=>blockers.push({code,message});let nextDueAt=null,parked=proactive.length>=POLICY.proactiveTouches;
    if(reasons.length)add('suppressed','Contact is suppressed: '+reasons.join(' '));
    if(lead.stage==='disqualified')add('disqualified','This lead is not qualified for further outreach.');
    if(paused&&purpose==='prospecting')add('reply_pause','A genuine reply paused prospecting. Continue only the specifically requested conversation.');
    if(unknown)add('outcome_unknown','Reconcile the existing attempted or unknown send before any further contact.');
    if(state.paused&&purpose==='prospecting')add('queue_paused','The existing team queue is paused.');
    if(!route)add('route_missing','Record a sourced contact route.');
    else {
      if(route.accountKey!==account(lead))add('identity_changed','The company domain changed. Existing route permission cannot transfer to a different account.');
      if(permission(outreach,route,purpose)!=='granted')add('permission_missing','Record evidence of permission for this channel and this purpose.');
      const ready=readiness(outreach).find(r=>r.channel===route.channel);if(ready.status!=='verified')add('channel_unverified',ready.blocker||'Channel setup and inbound handling are not verified.');
      if(!route.timezone||!route.timezoneSource) { if(purpose==='prospecting')add('timezone_missing','Record the recipient business timezone and its source.'); }
      else if(purpose==='prospecting') {
        const local=localParts(now,route.timezone),first=proactive[0],start=first?localParts(first.occurredAt,route.timezone).date:null;
        if(start&&local.date>=addBusinessDays(start,POLICY.windowBusinessDays))parked=true;
        let due=start?addBusinessDays(start,proactive.length===1?POLICY.followupBusinessDays[0]:POLICY.followupBusinessDays[1]):local.date;
        const todayTouch=reservations.some(t=>localParts(t.occurredAt,route.timezone).date===local.date);
        if(todayTouch){add('same_day_touch','A proactive touch is already recorded or reserved today.');const tomorrow=addBusinessDays(local.date,1);if(due<tomorrow)due=tomorrow;}
        nextDueAt=nextWindow(now,due,route.timezone);
        if(Date.parse(nextDueAt)>Date.parse(now))add('not_due','Next business-hour opportunity: '+nextDueAt+'.');
      }
    }
    if(parked&&purpose==='prospecting')add('sequence_parked','This prospecting sequence is parked. Time passing does not restart it.');
    if(outboundToday>=POLICY.outboundPerDay)add('daily_outbound_cap','The combined daily outbound allowance is used or reserved.');
    const recipient=route?personKey(route):null,isNew=!!recipient&&!firsts.has(recipient);
    if(isNew&&newRecipientsToday>=POLICY.newRecipientsPerDay)add('new_recipient_cap','The combined daily new-recipient allowance is used or reserved.');
    if(isNew&&!options.cycleId)add('cycle_missing','Record the existing coordinator cycle before assessing an initial contact.');
    if(isNew&&options.cycleId&&initialThisCycle>=POLICY.initialPerCycle)add('cycle_cap','This coordinator cycle’s initial-contact allowance is used or reserved.');
    if(lead.lastTouch&&!mine.some(t=>!t.internalTest&&ACTUAL.includes(t.status)&&(t.firstActualAt||t.occurredAt).slice(0,10)===lead.lastTouch))add('legacy_reconcile','Reconcile the legacy contact date with an actual evidenced touch before assessing message limits.');
    add('qa_unverified','The exact outgoing message version and independent accepted Quality verdict must be checked before any send.');
    const recordEligible=!blockers.length;
    add('transport_inactive','Recording foundation only: no automated sender or continuous inbound service is connected.');
    return {allowed:false,recordEligible,transportActive:false,advisory:true,blockers,nextDueAt,counters:{outboundToday,newRecipientsToday,initialThisCycle,proactiveTouches:proactive.length},suppressed:reasons.length>0,paused,unknown,parked};
  }
  function forLead(state,leadId,options={}) {
    const outreach=raw(state),leads=state.leads||[],lead=leadFor(leads,leadId),routes=routesFor(outreach,leads,lead),evaluation=evaluate(state,{...options,leadId});
    const touches=deriveTouches(outreach).filter(t=>related(outreach,lead,t)).map(t=>t.status==='prepared'&&t.purpose==='prospecting'&&(evaluation.paused||evaluation.suppressed||evaluation.parked)?{...t,recordedStatus:t.status,status:'cancelled',cancellationReason:'Current reply, suppression or parked sequence blocks this unsent preparation.'}:t).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt));
    const lastActualTouch=touches.find(t=>!t.internalTest&&ACTUAL.includes(t.status))||null;
    const reason=evaluation.blockers[0],status=evaluation.suppressed?'suppressed':evaluation.unknown?'reconcile':evaluation.paused?'paused':evaluation.parked?'parked':evaluation.recordEligible?'inactive':'blocked';
    return {routes,touches,readiness:readiness(outreach),suppressed:evaluation.suppressed,suppressionReasons:suppressed(outreach,leads,lead,routes.find(r=>r.preferred)||routes[0]),paused:evaluation.paused,unknown:evaluation.unknown,parked:evaluation.parked,lastActualTouch,next:{status,label:reason?.message||'Record the next permitted step.',at:evaluation.nextDueAt,blockers:evaluation.blockers},evaluation,transportActive:false,advisory:true};
  }
  return {CHANNELS,PURPOSES,POLICY,initial,valid,reduce,forLead,evaluate};
}));
