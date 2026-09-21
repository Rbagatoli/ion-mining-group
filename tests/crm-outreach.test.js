'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const O=require('../crm/outreach-model');
const NOW='2026-09-18T14:00:00Z';let serial=0;
const lead=(id='l1',domain='example.test',more={})=>({id,website:'https://'+domain,company:id,stage:'qualified',offer:'sourcing',channel:'direct',...more});
const state=(leads=[lead()])=>({leads,tasks:[],paused:false,outreach:O.initial()});
function apply(s,type,payload,at=NOW){return {...s,outreach:O.reduce(s.outreach,{id:'ev_'+(++serial),type,payload:{recordedBy:'Synthetic Revenue',...payload},at},s.leads)};}
function addRoute(s,more={},at=NOW){return apply(s,'outreach.route.add',{id:'r1',leadId:'l1',channel:'email',address:'Buyer@Example.Test',source:'https://example.test/contact',checkedOn:at.slice(0,10),timezone:'America/New_York',timezoneSource:'Synthetic evidenced business location',...more},at);}
function grant(s,more={},at=NOW){return apply(s,'outreach.permission.record',{routeId:'r1',purpose:'prospecting',status:'granted',method:'Recipient requested this purpose',evidence:'Synthetic recipient request reference',...more},at);}
function ready(s,channel='email'){return apply(s,'outreach.channel.record',{channel,status:'verified',identity:'Synthetic dedicated Proton sender',evidence:'Synthetic setup, reply and opt-out records',checkedOn:'2026-09-18'});}
function touch(s,more={},at=NOW){return apply(s,'outreach.touch.record',{id:'t_'+(++serial),leadId:'l1',routeId:'r1',direction:'outbound',purpose:'prospecting',status:'sent',occurredAt:at,providerRef:'synthetic-provider/message-'+serial,evidence:'Synthetic provider receipt',cycleId:'cycle1',...more},at);}
function evaluate(s,more={}){return O.evaluate(s,{leadId:'l1',routeId:'r1',purpose:'prospecting',now:NOW,cycleId:'cycle1',...more});}
const codes=result=>result.blockers.map(b=>b.code);
function base(){return ready(grant(addRoute(state())));}

test('browser UMD, legacy absence and immutable policy are supported',()=>{
 const context={Intl,Date,URL,Map,Set,Object,JSON,Error};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../crm/outreach-model'),'utf8'),context);
 assert.equal(typeof context.ProtonCrmOutreach.reduce,'function');assert.deepEqual(O.valid(undefined),O.initial());assert(Object.isFrozen(O.POLICY));assert.equal(O.POLICY.transportActive,false);
 assert.throws(()=>O.valid(null),/Invalid/);assert.throws(()=>O.valid({schema:2,routes:[],events:[]}),/Invalid/);
});
test('adding a route preserves lead source and never creates permission or a touch',()=>{
 const s=state(),before=JSON.stringify(s),next=addRoute(s),p=O.forLead(next,'l1',{now:NOW});
 assert.equal(JSON.stringify(s),before);assert.equal(next.leads[0].channel,'direct');assert.equal(p.routes[0].normalizedAddress,'buyer@example.test');assert.equal(p.routes[0].permissions.prospecting,'unknown');assert.equal(p.touches.length,0);assert.equal(p.lastActualTouch,null);
});
test('route identity is exact, duplicate-safe and does not guess E.164 countries',()=>{
 const s=addRoute(state());assert.throws(()=>addRoute(s,{id:'r2',address:'buyer@example.test'}),/already has/);
 for(const address of ['555 123 4567','15551234567','+0123456789'])assert.throws(()=>addRoute(state(),{channel:'sms',address}),/E.164/);
 const sms=addRoute(state(),{channel:'sms',address:'+12125550123'});assert.equal(sms.outreach.routes[0].routeKey,'sms:+12125550123');
 assert.throws(()=>addRoute(state(),{channel:'linkedin',address:'https://linkedin.com.evil.test/in/person'}),/LinkedIn/);
 assert.throws(()=>addRoute(state(),{channel:'email',address:'person@example.test\nBcc: other@example.test'}),/email/);
});
test('a timezone always requires an explicit valid source',()=>{
 assert.throws(()=>addRoute(state(),{timezoneSource:''}),/timezone evidence/);assert.throws(()=>addRoute(state(),{timezone:'Planet/Nowhere'}),/IANA/);
 const s=addRoute(state(),{timezone:'',timezoneSource:''});assert(codes(evaluate(s)).includes('timezone_missing'));
 assert.throws(()=>addRoute(state(),{checkedOn:'2026-09-19'}),/future/);
});

test('repeated projections reuse timezone formatting while still rejecting changed invalid evidence',()=>{
 let formatterCalls=0;const context={Date,URL,Map,Set,Object,JSON,Error,Intl:{DateTimeFormat:function(...args){formatterCalls++;return new Intl.DateTimeFormat(...args);}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../crm/outreach-model'),'utf8'),context);
 const reader=context.ProtonCrmOutreach,s=base();
 for(let i=0;i<100;i++)reader.forLead(s,'l1',{now:NOW});
 assert(formatterCalls<3,'Repeated lead renders must not rebuild the same timezone formatter.');
 s.outreach.routes[0].timezoneSource='';assert.throws(()=>reader.forLead(s,'l1',{now:NOW}),/timezone evidence/);
});
test('route source/timezone updates are journaled without changing route identity',()=>{
 let s=addRoute(state()),original=JSON.stringify(s.outreach.routes[0]);s=apply(s,'outreach.route.evidence',{routeId:'r1',source:'https://example.test/new-location',checkedOn:'2026-09-18',timezone:'America/Chicago',timezoneSource:'New company location'});
 assert.equal(JSON.stringify(s.outreach.routes[0]),original);assert.equal(O.forLead(s,'l1',{now:NOW}).routes[0].timezone,'America/Chicago');
});
test('preferred route selection is explicit and never copies permissions',()=>{
 let s=addRoute(state(),{preferred:true});s=addRoute(s,{id:'r2',channel:'sms',address:'+12125550123'});s=grant(s);s=apply(s,'outreach.route.preference',{routeId:'r2',preferred:true});
 const routes=O.forLead(s,'l1',{now:NOW}).routes;assert.deepEqual(routes.map(r=>r.preferred),[false,true]);assert.equal(routes[1].permissions.prospecting,'unknown');
});
test('permission is channel and purpose specific with acquisition evidence',()=>{
 let s=addRoute(state());assert.throws(()=>grant(s,{method:''}),/how/);assert.throws(()=>grant(s,{evidence:''}),/evidence/);s=grant(s,{purpose:'quote_update'});
 assert(codes(evaluate(s)).includes('permission_missing'));assert(!codes(evaluate(s,{purpose:'quote_update'})).includes('permission_missing'));
});
test('revocation dominates later and backdated grants and preference changes',()=>{
 let s=grant(addRoute(state()));s=grant(s,{status:'revoked',method:''});s=grant(s);s=grant(s,{},'2026-09-17T14:00:00Z');
 assert.equal(O.forLead(s,'l1',{now:NOW}).routes[0].permissions.prospecting,'revoked');assert.equal(evaluate(s).suppressed,true);
 s=addRoute(s,{id:'r2',channel:'sms',address:'+12125550123',preferred:true});s=grant(s,{routeId:'r2'});assert.equal(O.forLead(s,'l1',{now:NOW}).suppressed,true);
});
test('normalized route revocation applies across duplicate account records',()=>{
 let s=state([lead(),lead('l2','another.test')]);s=addRoute(s);s=addRoute(s,{id:'r2',leadId:'l2',address:'buyer@example.test'});s=grant(s,{routeId:'r2'});s=grant(s,{status:'revoked',method:''});
 assert.equal(O.evaluate(s,{leadId:'l2',routeId:'r2',now:NOW}).suppressed,true);
});
test('broad account refusal spans offers and every channel and survives a domain edit',()=>{
 let s=state([lead(),lead('l2','www.example.test',{offer:'research'})]);s=addRoute(s);s=addRoute(s,{id:'r2',leadId:'l2',channel:'sms',address:'+12125550123'});
 s=apply(s,'outreach.suppression.record',{leadId:'l1',scope:'account',reason:'Do not contact our company',evidence:'Synthetic broad refusal'});
 assert.equal(O.evaluate(s,{leadId:'l2',routeId:'r2',now:NOW}).suppressed,true);s.leads[0].website='https://renamed.test';assert.equal(evaluate(s).suppressed,true);assert(codes(evaluate(s)).includes('identity_changed'));
});
test('legacy do-not-contact records remain suppressive without new permission events',()=>{
 const s=addRoute(state([lead('l1','example.test',{stage:'dnc'}),lead('l2','example.test')]));assert.equal(evaluate(s).suppressed,true);assert.equal(O.forLead(s,'l2',{now:NOW}).suppressed,true);
});
test('existing email readiness never enables another channel or transport',()=>{
 const s=base();s.outreachReadiness={sender:'verified',reply:'verified',footer:'verified',authority:'authorized'};
 const p=O.forLead(s,'l1',{now:NOW});assert(p.readiness.every(r=>r.transportActive===false));assert.equal(p.readiness.find(r=>r.channel==='sms').status,'not_configured');assert.equal(p.evaluation.allowed,false);assert.equal(p.evaluation.recordEligible,false);assert(codes(p.evaluation).includes('qa_unverified'));assert(codes(p.evaluation).includes('transport_inactive'));
});
test('setup claims require recorded identity/evidence and never mutate touches',()=>{
 const s=addRoute(state());assert.throws(()=>apply(s,'outreach.channel.record',{channel:'sms',status:'verified',identity:'',evidence:'test',checkedOn:'2026-09-18'}),/identity/);
 assert.equal(ready(s).outreach.events.filter(e=>e.type==='outreach.touch.record').length,0);
});
test('actual touches require provider receipts; prepared drafts bind exact versions',()=>{
 const s=base();assert.throws(()=>touch(s,{providerRef:''}),/provider/);assert.throws(()=>touch(s,{evidence:''}),/evidence/);
 assert.throws(()=>touch(s,{status:'prepared',providerRef:''}),/exact source/);
 const next=touch(s,{status:'prepared',providerRef:'',taskId:'source1',resultVersion:2,messageVersion:'copy-v2'});assert.equal(evaluate(next).counters.proactiveTouches,0);assert.equal(O.forLead(next,'l1',{now:NOW}).lastActualTouch,null);
});
test('numeric zero draft and prepared references survive recording, import and reconciliation without relabeling',()=>{
 const s=base(),refs={taskId:'source_zero',resultVersion:0,messageVersion:'message-v0',reviewTaskId:'quality_zero',author:'Original author',reviewer:'Independent Quality'};
 s.tasks=[{id:refs.taskId,resultVersion:0,result:'Original source version zero.'},{id:refs.reviewTaskId,resultVersion:1,reviewOfVersion:0,qualityVerdict:'revise'}];
 const before=JSON.stringify(s);
 for(const status of ['draft','prepared']){
  const next=touch(s,{id:'version_zero',status,providerRef:'',...refs}),originalTouch=next.outreach.events.at(-1).touch;
  for(const [key,value] of Object.entries(refs))assert.equal(originalTouch[key],value);
  const bytes=JSON.stringify(next.outreach),imported=JSON.parse(bytes);
  assert.equal(O.valid(imported,s.leads),imported);assert.equal(JSON.stringify(imported),bytes);
  const restored={...next,outreach:imported},projection=O.forLead(restored,'l1',{now:NOW});
  for(const [key,value] of Object.entries(refs))assert.equal(projection.touches[0][key],value);
  assert.equal(projection.lastActualTouch,null);assert.equal(projection.transportActive,false);assert.equal(projection.evaluation.allowed,false);
  assert(codes(projection.evaluation).includes('qa_unverified'));assert.deepEqual(projection.evaluation.counters,{outboundToday:0,newRecipientsToday:0,initialThisCycle:0,proactiveTouches:0});
  const reconciled=apply(restored,'outreach.touch.update',{touchId:'version_zero',status:status==='draft'?'prepared':'failed',evidence:'Synthetic reconciliation',occurredAt:NOW});
  for(const [key,value] of Object.entries(refs))assert.equal(O.forLead(reconciled,'l1',{now:NOW}).touches[0][key],value);
  assert.deepEqual(reconciled.outreach.events.slice(0,-1),imported.events);assert.deepEqual(reconciled.tasks,s.tasks);
 }
 assert.equal(JSON.stringify(s),before);
});
test('draft and prepared versions reject absent, blank, coerced and invalid numbers at record and import boundaries',()=>{
 const s=base(),before=JSON.stringify(s);
 for(const status of ['draft','prepared']){
  const refs={status,taskId:'source_zero',messageVersion:'message-v0',reviewTaskId:'quality_zero'},valid=touch(s,{...refs,resultVersion:0}).outreach;
  for(const resultVersion of [undefined,null,'',' ','0','1',false,true,{},[],-1,-0.5,0.5,NaN,Infinity,-Infinity,Number.MAX_SAFE_INTEGER+1]){
   assert.throws(()=>touch(s,{...refs,resultVersion}),/exact source/);
   const imported=JSON.parse(JSON.stringify(valid));imported.events.at(-1).touch.resultVersion=resultVersion;
   assert.throws(()=>O.valid(imported,s.leads),/exact source/);
  }
  for(const missing of ['taskId','messageVersion'])assert.throws(()=>touch(s,{...refs,resultVersion:0,[missing]:''}),/exact source/);
 }
 assert.equal(JSON.stringify(s),before);
});
test('existing positive versions and optional actual-touch null remain valid without relaxing provided-version checks',()=>{
 const s=base();
 for(const status of ['prepared','sent'])for(const resultVersion of [0,1,2,Number.MAX_SAFE_INTEGER]){
  const next=touch(s,{status,taskId:'source_exact',resultVersion,messageVersion:'exact-copy',reviewTaskId:'quality_exact'});
  assert.equal(next.outreach.events.at(-1).touch.resultVersion,resultVersion);
  assert.equal(O.valid(JSON.parse(JSON.stringify(next.outreach)),s.leads).events.at(-1).touch.resultVersion,resultVersion);
 }
 for(const resultVersion of [undefined,null]){
  const next=touch(s,{resultVersion});assert.equal(next.outreach.events.at(-1).touch.resultVersion,null);assert.doesNotThrow(()=>O.valid(next.outreach,s.leads));
 }
 for(const resultVersion of ['','0',false,-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){
  assert.throws(()=>touch(s,{resultVersion}),/Invalid touch result version/);
  const imported=JSON.parse(JSON.stringify(touch(s,{resultVersion:0}).outreach));imported.events.at(-1).touch.resultVersion=resultVersion;
  assert.throws(()=>O.valid(imported,s.leads),/Invalid touch result version/);
 }
});
test('drafts, failed attempts and internal QA are not prospect contacts or counters',()=>{
 let s=base();s=touch(s,{status:'draft',taskId:'source1',resultVersion:1,messageVersion:'v1'});s=touch(s,{status:'failed'});s=touch(s,{internalTest:true});
 const p=O.forLead(s,'l1',{now:NOW});assert.equal(p.lastActualTouch,null);assert.deepEqual(p.evaluation.counters,{outboundToday:0,newRecipientsToday:0,initialThisCycle:0,proactiveTouches:0});
});
test('human replies pause the account and cancel only unsent preparations',()=>{
 let s=base();s=touch(s,{id:'prepared',status:'prepared',taskId:'source1',resultVersion:1,messageVersion:'v1'});s=touch(s,{id:'sent'});s=touch(s,{direction:'inbound',status:'received',replyKind:'human'});
 const p=O.forLead(s,'l1',{now:NOW});assert.equal(p.paused,true);assert.equal(p.touches.find(t=>t.id==='prepared').status,'cancelled');assert.equal(p.touches.find(t=>t.id==='prepared').recordedStatus,'prepared');assert.equal(p.touches.find(t=>t.id==='sent').status,'sent');
 assert(!codes(evaluate(s,{purpose:'service'})).includes('reply_pause'));
});
test('auto responses, delivery events and internal replies are not conversations',()=>{
 let s=base();s=touch(s,{direction:'inbound',status:'received',replyKind:'auto'});s=touch(s,{status:'delivered'});s=touch(s,{direction:'inbound',status:'received',replyKind:'human',internalTest:true});assert.equal(evaluate(s).paused,false);
});
test('reply pause crosses same-account offers and normalized route duplicates',()=>{
 let s=state([lead(),lead('l2','example.test'),lead('l3','other.test')]);s=addRoute(s);s=addRoute(s,{id:'r2',leadId:'l2',channel:'sms',address:'+12125550123'});s=addRoute(s,{id:'r3',leadId:'l3',address:'buyer@example.test'});s=touch(s,{direction:'inbound',status:'received',replyKind:'human'});
 for(const [leadId,routeId] of [['l2','r2'],['l3','r3']])assert.equal(O.evaluate(s,{leadId,routeId,now:NOW}).paused,true);
});
test('reply pause follows an explicitly identified person across different routes',()=>{
 let s=state([lead(),lead('l2','other.test')]);s=addRoute(s,{personId:'person1'});s=addRoute(s,{id:'r2',leadId:'l2',channel:'sms',address:'+12125550123',personId:'person1'});s=touch(s,{direction:'inbound',status:'received',replyKind:'human'});
 assert.equal(O.evaluate(s,{leadId:'l2',routeId:'r2',now:NOW}).paused,true);
});
test('unknown or attempted outcomes block alternate channels and requested replies',()=>{
 let s=base();s=addRoute(s,{id:'r2',channel:'sms',address:'+12125550123'});s=touch(s,{id:'uncertain',status:'unknown',providerRef:''});
 assert.equal(evaluate(s,{routeId:'r2'}).unknown,true);assert(codes(evaluate(s,{routeId:'r2',purpose:'service'})).includes('outcome_unknown'));assert.equal(evaluate(s).counters.outboundToday,1);
 s=apply(s,'outreach.touch.update',{touchId:'uncertain',status:'failed',evidence:'Provider confirms no submission',occurredAt:NOW});assert.equal(evaluate(s).unknown,false);assert.equal(evaluate(s).counters.outboundToday,0);
});
test('sent-to-delivered updates do not move the original contact day or cadence',()=>{
 let s=base();s=touch(s,{id:'t1'});s=apply(s,'outreach.touch.update',{touchId:'t1',status:'delivered',providerRef:'same-message',evidence:'Delayed delivery receipt',occurredAt:'2026-09-21T14:00:00Z'},'2026-09-21T15:00:00Z');
 const t=O.forLead(s,'l1',{now:'2026-09-21T15:00:00Z'}).touches[0];assert.equal(t.occurredAt,'2026-09-18T14:00:00.000Z');assert.equal(t.lastEventAt,'2026-09-21T14:00:00.000Z');assert.equal(evaluate(s,{now:'2026-09-21T15:00:00Z'}).counters.outboundToday,0);assert.equal(evaluate(s,{now:'2026-09-21T15:00:00Z'}).nextDueAt,'2026-09-23T13:00:00.000Z');
});
test('late reconciliation can record actual earlier provider send time without a resend',()=>{
 let s=base();s=touch(s,{id:'t1',status:'unknown',occurredAt:'2026-09-18T14:00:00Z'});s=apply(s,'outreach.touch.update',{touchId:'t1',status:'sent',providerRef:'provider-evidence',evidence:'Provider confirms earlier submission',occurredAt:'2026-09-18T13:59:59Z'},'2026-09-18T14:01:00Z');
 const p=O.forLead(s,'l1',{now:'2026-09-18T14:01:00Z'});assert.equal(p.touches.length,1);assert.equal(p.unknown,false);assert.equal(p.touches[0].firstActualAt,'2026-09-18T13:59:59.000Z');
});
test('completed outcomes cannot regress and duplicate event/touch IDs are rejected',()=>{
 let s=touch(base(),{id:'t1'});assert.throws(()=>apply(s,'outreach.touch.update',{touchId:'t1',status:'prepared',evidence:'bad',occurredAt:NOW}),/forward/);assert.throws(()=>touch(s,{id:'t1'}),/Duplicate touch/);
 const event=s.outreach.events[0];assert.throws(()=>O.reduce(s.outreach,{id:event.id,type:'outreach.route.preference',at:NOW,payload:{routeId:'r1',preferred:true,recordedBy:'test'}},s.leads),/already recorded/);
});
test('first follow-up starts from actual send and waits three business days',()=>{
 let s=touch(base());let result=evaluate(s,{now:'2026-09-22T14:00:00Z'});assert(codes(result).includes('not_due'));assert.equal(result.nextDueAt,'2026-09-23T13:00:00.000Z');
 result=evaluate(s,{now:'2026-09-23T14:00:00Z'});assert(!codes(result).includes('not_due'));assert.equal(result.parked,false);
});
test('final follow-up cannot occur before business day seven',()=>{
 let s=touch(base());s=touch(s,{},'2026-09-23T14:00:00Z');const result=evaluate(s,{now:'2026-09-28T14:00:00Z'});assert.equal(result.nextDueAt,'2026-09-29T13:00:00.000Z');assert(codes(result).includes('not_due'));
});
test('same-day proactive activity blocks a second channel too',()=>{
 let s=touch(base());s=addRoute(s,{id:'r2',channel:'sms',address:'+12125550123'});assert(codes(evaluate(s,{routeId:'r2'})).includes('same_day_touch'));
});
test('three actual proactive touches park permanently without a timer reset',()=>{
 let s=touch(base());s=touch(s,{},'2026-09-23T14:00:00Z');s=touch(s,{},'2026-09-29T14:00:00Z');
 assert.equal(evaluate(s,{now:'2026-09-30T14:00:00Z'}).parked,true);assert.equal(evaluate(s,{now:'2026-12-18T14:00:00Z'}).parked,true);assert.throws(()=>apply(s,'outreach.sequence.reset',{}),/Unknown/);
});
test('ten business days without re-engagement parks a partially completed sequence',()=>{
 const s=touch(base());assert.equal(evaluate(s,{now:'2026-10-02T14:00:00Z'}).parked,true);assert.equal(evaluate(s,{now:'2026-10-19T14:00:00Z'}).parked,true);
});
test('business-local quiet hours, weekends and DST use sourced timezone',()=>{
 let s=base();assert.equal(evaluate(s,{now:'2026-09-18T21:00:00Z'}).nextDueAt,'2026-09-21T13:00:00.000Z');assert.equal(evaluate(s,{now:'2026-09-19T14:00:00Z'}).nextDueAt,'2026-09-21T13:00:00.000Z');
 assert.equal(evaluate(s,{now:'2026-11-02T13:30:00Z'}).nextDueAt,'2026-11-02T14:00:00.000Z');assert.equal(evaluate(s,{now:'2026-11-02T22:00:00Z'}).nextDueAt,'2026-11-03T14:00:00.000Z');
});
test('all outbound purposes share the twenty-message UTC-day allowance',()=>{
 let s=base();for(let i=0;i<20;i++)s=touch(s,{purpose:i%2?'service':'quote_update'});const result=evaluate(s,{purpose:'service'});assert.equal(result.counters.outboundToday,20);assert(codes(result).includes('daily_outbound_cap'));assert.equal(result.counters.proactiveTouches,0);
});
test('ten new accounts share a daily cap across channels',()=>{
 const leads=Array.from({length:11},(_,i)=>lead('l'+i,'account'+i+'.test'));let s=state(leads);
 for(let i=0;i<11;i++){s=addRoute(s,{id:'r'+i,leadId:'l'+i,address:'buyer@account'+i+'.test'});if(i<10)s=touch(s,{leadId:'l'+i,routeId:'r'+i,cycleId:'cycle'+i});}
 const r=O.evaluate(s,{leadId:'l10',routeId:'r10',now:NOW,cycleId:'newcycle'});assert.equal(r.counters.newRecipientsToday,10);assert(codes(r).includes('new_recipient_cap'));
});
test('three initial contacts use the existing cycle across all channels',()=>{
 let s=state(Array.from({length:4},(_,i)=>lead('l'+i,'account'+i+'.test')));
 for(let i=0;i<4;i++){s=addRoute(s,{id:'r'+i,leadId:'l'+i,address:'buyer@account'+i+'.test'});if(i<3)s=touch(s,{leadId:'l'+i,routeId:'r'+i,cycleId:'onecycle'});}
 assert(codes(O.evaluate(s,{leadId:'l3',routeId:'r3',now:NOW,cycleId:'onecycle'})).includes('cycle_cap'));assert(codes(O.evaluate(s,{leadId:'l3',routeId:'r3',now:NOW})).includes('cycle_missing'));
});
test('unlinked routes conservatively count separately even within one account',()=>{
 let s=base();s=addRoute(s,{id:'r2',channel:'sms',address:'+12125550123'});s=touch(s);s=touch(s,{routeId:'r2',purpose:'service'});assert.equal(evaluate(s).counters.newRecipientsToday,2);
});
test('ten distinct people at the same company cannot bypass the new-recipient cap',()=>{
 let s=state();for(let i=0;i<11;i++){s=addRoute(s,{id:'r'+i,address:'person'+i+'@example.test'});if(i<10)s=touch(s,{routeId:'r'+i,purpose:'service',cycleId:'cycle'+i});}
 const r=evaluate(s,{routeId:'r10'});assert.equal(r.counters.newRecipientsToday,10);assert(codes(r).includes('new_recipient_cap'));
});
test('an explicitly shared person identity deduplicates across channels and accounts',()=>{
 let s=state([lead(),lead('l2','other.test')]);s=addRoute(s,{personId:'person1'});s=addRoute(s,{id:'r2',leadId:'l2',channel:'sms',address:'+12125550123',personId:'person1'});s=touch(s);s=touch(s,{leadId:'l2',routeId:'r2',purpose:'service'});
 const r=evaluate(s);assert.equal(r.counters.newRecipientsToday,1);assert.equal(r.counters.initialThisCycle,1);
});

for(const restriction of ['route opt-out','purpose revocation'])test(restriction+' follows the same person across different accounts and channels',()=>{
 let s=state([lead(),lead('l2','other.test')]);
 s=addRoute(s,{personId:'person1'});s=addRoute(s,{id:'r2',leadId:'l2',channel:'sms',address:'+12125550123',personId:'person1'});
 s=restriction==='route opt-out'?apply(s,'outreach.suppression.record',{leadId:'l1',routeId:'r1',scope:'route',reason:'Synthetic stop contacting me',evidence:'Synthetic refusal receipt'}):grant(s,{status:'revoked',method:''});
 const peer=O.forLead(s,'l2',{now:NOW});assert.equal(peer.suppressed,true);assert(codes(peer.evaluation).includes('suppressed'));
 assert.match(peer.next.label,/refused|suppressed/i);
});
test('unknown submissions reserve daily allowance until positively reconciled',()=>{
 let s=base();for(let i=0;i<20;i++)s=touch(s,{status:'attempted',providerRef:''});assert.equal(evaluate(s).counters.outboundToday,20);assert(codes(evaluate(s)).includes('daily_outbound_cap'));
});
test('merely adding routes does not reconcile legacy manual contact history',()=>{
 let s=addRoute(state([lead('l1','example.test',{lastTouch:'2026-09-17'})]));assert(codes(evaluate(s)).includes('legacy_reconcile'));s=touch(s);assert(codes(evaluate(s)).includes('legacy_reconcile'));
 s=touch(s,{occurredAt:'2026-09-17T14:00:00Z'});assert(!codes(evaluate(s)).includes('legacy_reconcile'));
});
test('future/invalid timestamps and malformed or missing identities are rejected',()=>{
 const s=base();assert.throws(()=>touch(s,{occurredAt:'2026-09-19T14:00:00Z'}),/future/);assert.throws(()=>touch(s,{occurredAt:'2026-02-30T12:00:00Z'}),/valid/);
 assert.throws(()=>O.valid(s.outreach,[]),/lead is missing/);const corrupt=JSON.parse(JSON.stringify(s.outreach));corrupt.events.push({id:'bad',type:'unsupported',at:NOW,recordedBy:'test'});assert.throws(()=>O.valid(corrupt,s.leads),/Unknown/);
 const stolen=JSON.parse(JSON.stringify(s.outreach));stolen.routes[0].normalizedAddress='other@example.test';assert.throws(()=>O.valid(stolen,s.leads),/identity/);
});
test('a full journal fails without dropping revocations or mutating bytes',()=>{
 let s=grant(addRoute(state()),{status:'revoked',method:''});const full=JSON.parse(JSON.stringify(s.outreach));const e=full.events.at(-1);while(full.events.length<3000)full.events.push({...e,id:'copy'+full.events.length});
 const before=JSON.stringify(full);assert.throws(()=>O.reduce(full,{id:'over',type:'outreach.route.preference',at:NOW,payload:{routeId:'r1',preferred:true,recordedBy:'test'}},s.leads),/full/);assert.equal(JSON.stringify(full),before);assert.equal(O.forLead({...s,outreach:full},'l1',{now:NOW}).suppressed,true);
});
test('empty legacy records have no transports and no read-side writes',()=>{
 const s=state();delete s.outreach;const before=JSON.stringify(s),p=O.forLead(s,'l1',{now:NOW});assert.equal(JSON.stringify(s),before);assert.equal(p.routes.length,0);assert.equal(p.transportActive,false);assert.equal(p.evaluation.allowed,false);
});
