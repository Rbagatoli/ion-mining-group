import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker,{validateSubmission,SOURCE_TYPES} from '../worker-intake/index.mjs';
import Matching from '../energy-opportunity-matching.js';

// Real SQLite statements and transactions, not a map that emulates expected SQL.
// The adapter provides D1's API shape and injects failure before COMMIT.
class LocalD1 {
  constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON');this.db.exec(readFileSync(new URL('../worker-intake/schema.sql',import.meta.url),'utf8'));this.failBatch=false;}
  prepare(sql){const self=this;function prepared(args=[]){return {sql,args,bind(...values){return prepared(values);},async first(){return self.db.prepare(sql).get(...args)||null;},async all(){return {success:true,results:self.db.prepare(sql).all(...args)};},async run(){const result=self.db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(result.changes)}};}};}return prepared();}
  async batch(statements){this.db.exec('BEGIN IMMEDIATE');try{const out=statements.map(s=>{const results=this.db.prepare(s.sql).all(...s.args);return {success:true,results,meta:{changes:this.db.prepare('SELECT changes() AS n').get().n}};});if(this.failBatch)throw Error('injected storage failure');this.db.exec('COMMIT');return out;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  count(table){return this.db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;}
}
const origin='https://protonminingco.com';
let signer;
before(async()=>{
  signer=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const jwk=await crypto.subtle.exportKey('jwk',signer.publicKey);jwk.kid='intake-tests';
  globalThis.fetch=async url=>{assert.match(String(url),/googleapis\.com\/service_accounts\/v1\/jwk/);return Response.json({keys:[jwk]},{headers:{'Cache-Control':'max-age=3600'}});};
});
function env(extra={}){return {INTAKE_DB:new LocalD1(),FIREBASE_PROJECT_ID:'ion-mining',ROUTE_EMAIL:'energy@protonminingco.com',OWNER_UIDS:'owner-one',RATE_LIMIT_SECRET:'synthetic-test-only-secret-long-enough',...extra};}
function body(service='custom_search'){return {service,contact:{name:'Synthetic client',email:'synthetic@example.test',phone:'+1 555 0100',company:'Fixture'},brief:{country:'US',power:{value:160,unit:'kW'},geography:'Texas',transaction:'lease',upfrontBudget:{amount:65000,currency:'CAD'},timing:'Unknown',costBasis:'energy_only',existingOpportunities:'Known Site A; rejected Site B',siteDetails:service==='custom_search'?'':'Site A, supplied for review',acquisitionSource:'QuoteColo referral; unverified',sourceTypes:['grid_supply'],notes:'Synthetic record only'},attribution:{source:'organic',medium:'web',campaign:'pilot',referrer:'https://example.test/source?private=remove#secret',landingPath:'/energy-sites.html?private=remove'},consent:true};}
async function token(claims={},header={}){const now=Math.floor(Date.now()/1000);const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const a=enc({alg:'RS256',kid:'intake-tests',...header})+'.'+enc({iss:'https://securetoken.google.com/ion-mining',aud:'ion-mining',sub:'owner-one',iat:now-10,exp:now+3600,...claims});const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',signer.privateKey,new TextEncoder().encode(a));return a+'.'+Buffer.from(sig).toString('base64url');}
async function call(e,path,{method='GET',payload,key,auth,headers={}}={}){const h={Origin:origin,...headers};if(payload!==undefined)h['Content-Type']='application/json';if(key)h['Idempotency-Key']=key;if(auth)h.Authorization='Bearer '+auth;const r=await worker.fetch(new Request('https://intake.test'+path,{method,headers:h,body:payload===undefined?undefined:JSON.stringify(payload)}),e);const data=r.status===204?null:await r.json();return {r,data};}
async function submit(e,p=body(),key=crypto.randomUUID()){return call(e,'/v1/requests',{method:'POST',payload:p,key,headers:{'CF-Connecting-IP':'192.0.2.1'}});}
async function action(e,id,p,auth){return call(e,'/v1/requests/'+id+'/actions',{method:'POST',payload:p,auth:auth||await token()});}
function ap(type,expectedRevision=1,extra={}){return {actionId:crypto.randomUUID(),expectedRevision,type,note:'Synthetic verified decision.',...extra};}

test('receipt is durable, routed privately, and public responses omit all customer data',async()=>{
 const e=env(),a=await submit(e);assert.equal(a.r.status,201);assert.equal(a.data.received,true);assert.equal(e.INTAKE_DB.count('requests'),1);assert.match(a.data.requestId,/^REQ-/);assert.equal(a.data.notification,'not_configured');
 assert.equal(a.r.headers.get('cache-control'),'no-store');assert.doesNotMatch(JSON.stringify(a.data),/Synthetic|example.test|65000|QuoteColo|phone/);
 for(const path of ['/v1/requests','/v1/requests/'+a.data.requestId,'/v1/metrics']){const result=await call(e,path);assert.equal(result.r.status,401);assert.doesNotMatch(JSON.stringify(result.data),/Synthetic|example.test/);}
 const stored=(await call(e,'/v1/requests/'+a.data.requestId,{auth:await token()})).data.request;
 assert.equal(stored.routeEmail,'energy@protonminingco.com');assert.equal(stored.briefRevision,1);assert.equal(stored.payload.brief.upfrontBudget.currency,'CAD');assert.equal(stored.payload.attribution.referrer,'https://example.test/source');assert.equal(stored.payload.attribution.landingPath,'/energy-sites.html');assert.equal(stored.queue.state,'not_queued');
});
test('simultaneous identical retries create one receipt; changed payload conflicts',async()=>{
 const e=env(),key=crypto.randomUUID();const results=await Promise.all(Array.from({length:8},()=>submit(e,body(),key)));assert.equal(results.filter(x=>x.r.status===201).length,1);assert.equal(new Set(results.map(x=>x.data.requestId)).size,1);assert.equal(e.INTAKE_DB.count('requests'),1);
 const changed=body();changed.contact.name='Changed';const conflict=await submit(e,changed,key);assert.equal(conflict.r.status,409);assert.equal(e.INTAKE_DB.count('requests'),1);
});
test('transaction failure rolls back receipt and rate changes; same key retry recovers',async()=>{
 const e=env(),key=crypto.randomUUID();e.INTAKE_DB.failBatch=true;const a=await submit(e,body(),key);assert.equal(a.r.status,503);assert.equal(a.data.received,undefined);assert.equal(e.INTAKE_DB.count('requests'),0);assert.equal(e.INTAKE_DB.count('intake_rates'),0);
 e.INTAKE_DB.failBatch=false;const b=await submit(e,body(),key);assert.equal(b.r.status,201);assert.equal(e.INTAKE_DB.count('requests'),1);
});
test('health fails closed for missing storage, schema, owners, routing and abuse secret',async()=>{
 for(const extra of [{INTAKE_DB:null},{OWNER_UIDS:''},{ROUTE_EMAIL:'other@example.test'},{RATE_LIMIT_SECRET:''},{FIREBASE_PROJECT_ID:'other'}]){const a=await call(env(extra),'/v1/health');assert.equal(a.r.status,503);assert.equal(a.data.ready,false);}
 const e=env();e.INTAKE_DB.db.exec('DROP TABLE requests');const a=await call(e,'/v1/health');assert.equal(a.r.status,503);assert.equal(a.data.ready,false);
 const healthy=await call(env(),'/v1/health');assert.equal(healthy.data.ready,true);assert.equal(healthy.data.receipt,'private_queue');
});
test('validation preserves unknowns and legacy optional preferences; no Canada coverage or numeric coercion',async()=>{
 const p=body();p.brief.power.value=null;p.brief.upfrontBudget.amount=null;p.brief.operatingFlexibility='Not specified';p.brief.powerCostCents=5.5;p.brief.minUptimePct=90;p.brief.authority='referral';p.brief.introductionTerms='No exclusivity confirmed';
 assert.equal(validateSubmission(p).brief.power.value,null);assert.equal(validateSubmission(p).brief.operatingFlexibility,'unknown');assert.equal((await submit(env(),p)).r.status,201);
 for(const mutate of [x=>x.brief.country='CA',x=>x.brief.power.value='160',x=>x.brief.startBy='2026-02-31',x=>x.contact.email='a@example.test\r\nBcc:bad',x=>x.brief.extra='silently lost',x=>x.brief.minimumAvailabilityPct=101,x=>x.consent=false]){const bad=body();mutate(bad);assert.equal((await submit(env(),bad)).r.status,422);}
 for(const service of ['site_review','site_submission']){const p=body(service);p.brief.power.value=null;assert.equal((await submit(env(),p)).r.status,201);p.brief.siteDetails='';p.brief.existingOpportunities='';assert.equal((await submit(env(),p)).r.status,422);}
});
test('source families and exact site references agree with the matching model; contradictions are rejected',()=>{
 assert.deepEqual([...SOURCE_TYPES].sort(),Matching.sourceTypes.map(s=>s.id).sort());
 const p=body();p.brief.knownSiteExclusions=['eia:plant:123'];p.brief.supply='unknown';p.brief.operation='Not specified';assert.equal(validateSubmission(p).brief.knownSiteExclusions[0],'eia:plant:123');assert.equal(validateSubmission(p).brief.supply,null);
 for(const mutate of [x=>x.brief.minMw=2,x=>x.brief.maxMw=.1,x=>x.brief.sourceTypes=['grid'],x=>{x.brief.states=['TX'];x.brief.excludedStates=['TX'];},x=>x.brief.excludedSources=['grid_supply']]){const bad=body();mutate(bad);assert.throws(()=>validateSubmission(bad));}
 const legacy=body();delete legacy.brief.upfrontBudget;legacy.brief.maxSiteCapitalUsd=25000;legacy.brief.sourceTypes=['petroleum','biomass'];assert.deepEqual(validateSubmission(legacy).brief.upfrontBudget,{amount:25000,currency:'USD'});assert.deepEqual(validateSubmission(legacy).brief.sourceTypes,['oil','biomass_biogas']);
});
test('origin, content type, payload limits and trusted edge IP are enforced',async()=>{
 const e=env();const denied=await call(e,'/v1/requests',{method:'POST',payload:body(),key:crypto.randomUUID(),headers:{Origin:'https://attacker.test','CF-Connecting-IP':'192.0.2.1'}});assert.equal(denied.r.status,403);assert.equal(denied.r.headers.get('access-control-allow-origin'),null);
 const missingIp=await call(e,'/v1/requests',{method:'POST',payload:body(),key:crypto.randomUUID()});assert.equal(missingIp.r.status,503);
 const noOrigin=await worker.fetch(new Request('https://intake.test/v1/requests',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(body())}),e);assert.equal(noOrigin.status,403);
 const raw=await worker.fetch(new Request('https://intake.test/v1/requests',{method:'POST',headers:{Origin:origin,'Idempotency-Key':crypto.randomUUID(),'Content-Type':'text/plain'},body:'{}'}),e);assert.equal(raw.status,415);
 const huge=body();huge.brief.notes='x'.repeat(25000);assert.equal((await submit(e,huge)).r.status,413);assert.equal(e.INTAKE_DB.count('requests'),0);
});
test('rate counters atomically limit new requests while a received identity can reconcile',async()=>{
 const e=env(),key=crypto.randomUUID(),first=await submit(e,body(),key);for(let i=0;i<14;i++)assert.equal((await submit(e)).r.status,201);
 assert.equal((await submit(e)).r.status,429);const again=await submit(e,body(),key);assert.equal(again.r.status,200);assert.equal(again.data.requestId,first.data.requestId);assert.equal(e.INTAKE_DB.count('requests'),15);
});
test('private authorization verifies signature/project/claims and exact configured UID or verified email',async()=>{
 const e=env();for(const claims of [{sub:'other'},{aud:'other'},{iss:'https://evil.test'},{exp:0},{exp:null},{iat:null}])assert.equal((await call(e,'/v1/requests',{auth:await token(claims)})).r.status,401);
 assert.equal((await call(e,'/v1/requests',{auth:await token({}, {alg:'none'})})).r.status,401);
 const valid=await token(),parts=valid.split('.');parts[2]='X'.repeat(parts[2].length);assert.equal((await call(e,'/v1/requests',{auth:parts.join('.')})).r.status,401);
 const emailEnv=env({OWNER_UIDS:'',OWNER_EMAILS:'confirmed@example.test'});for(const claims of [{email:'confirmed@example.test',email_verified:false},{email:'other@example.test',email_verified:true},{email:'confirmed@example.test'}])assert.equal((await call(emailEnv,'/v1/requests',{auth:await token(claims)})).r.status,401);
 assert.equal((await call(emailEnv,'/v1/requests',{auth:await token({sub:'confirmed-uid',email:'Confirmed@example.test',email_verified:true})})).r.status,200);
});
test('qualification, saved draft and actual acknowledgment are distinct durable revisions',async()=>{
 const e=env(),a=await submit(e),id=a.data.requestId,q=ap('qualify');let result=await action(e,id,q);assert.equal(result.data.request.status,'qualified');assert.equal(result.data.request.queue.state,'not_queued');assert.equal(result.data.request.revision,2);
 result=await action(e,id,q);assert.equal(result.data.duplicate,true);assert.equal(result.data.request.revision,2);
 assert.equal((await action(e,id,ap('queue',2,{taskId:'task_exact',briefId:'different_brief'}))).r.status,409);
 const queued=ap('queue',2,{taskId:'task_exact',briefId:id});result=await action(e,id,queued);assert.equal(result.data.request.queue.state,'draft_saved');assert.equal(result.data.request.revision,3);
 assert.equal(result.data.request.queue.taskOwnerUid,'owner-one');
 const ack=ap('acknowledge',3,{taskId:'task_exact',acknowledgedBy:'Revenue operator',acknowledgedAt:new Date().toISOString(),evidence:'Native delivery event synthetic-123 was observed.'});result=await action(e,id,ack);assert.equal(result.data.request.queue.state,'acknowledged');assert.equal(result.data.request.revision,4);assert.equal(result.data.request.history.length,3);assert.equal(result.data.request.history[2].recordedByUid,'owner-one');assert.equal(result.data.request.briefRevision,1);
 const reloaded=await call(e,'/v1/requests/'+id,{auth:await token()});assert.deepEqual(reloaded.data.request,result.data.request);
 assert.equal((await action(e,id,ack)).data.duplicate,true);assert.equal(e.INTAKE_DB.count('request_actions'),3);
});
test('a second allowed CRM owner cannot attest delivery of another owners per-account draft',async()=>{
 const e=env({OWNER_UIDS:'owner-one,owner-two'}),id=(await submit(e)).data.requestId;await action(e,id,ap('qualify'));await action(e,id,ap('queue',2,{taskId:'task',briefId:id}));
 const ack=ap('acknowledge',3,{taskId:'task',acknowledgedBy:'Revenue',acknowledgedAt:new Date().toISOString(),evidence:'Synthetic event'});
 assert.equal((await action(e,id,ack,await token({sub:'owner-two'}))).r.status,409);assert.equal(e.INTAKE_DB.count('request_actions'),2);
});
test('late action failure rolls back status and history; stale revision and mismatch reject unchanged',async()=>{
 const e=env(),id=(await submit(e)).data.requestId,p=ap('qualify');e.INTAKE_DB.failBatch=true;assert.equal((await action(e,id,p)).r.status,503);e.INTAKE_DB.failBatch=false;let record=(await call(e,'/v1/requests/'+id,{auth:await token()})).data.request;assert.equal(record.status,'received');assert.equal(record.revision,1);assert.equal(record.history.length,0);
 assert.equal((await action(e,id,p)).r.status,200);assert.equal((await action(e,id,{...p,note:'Changed'})).r.status,409);assert.equal((await action(e,id,ap('reject'))).r.status,409);
 assert.equal((await action(e,id,ap('acknowledge',2,{taskId:'unknown',acknowledgedBy:'Person',acknowledgedAt:new Date().toISOString(),evidence:'Cannot skip queue.'}))).r.status,409);assert.equal(e.INTAKE_DB.count('request_actions'),1);
});
test('cross-tab actions and cross-request action-ID reuse cannot partially commit',async()=>{
 const e=env(),id=(await submit(e)).data.requestId,auth=await token();const results=await Promise.all([action(e,id,ap('qualify'),auth),action(e,id,ap('reject'),auth)]);assert.deepEqual(results.map(x=>x.r.status).sort(),[200,409]);assert.equal(e.INTAKE_DB.count('request_actions'),1);
 const e2=env(),a=(await submit(e2)).data.requestId,b=(await submit(e2)).data.requestId,p=ap('qualify');const pair=await Promise.all([action(e2,a,p,auth),action(e2,b,p,auth)]);assert.deepEqual(pair.map(x=>x.r.status).sort(),[200,409]);assert.equal(e2.INTAKE_DB.count('request_actions'),1);const rows=e2.INTAKE_DB.db.prepare('SELECT revision FROM requests ORDER BY revision').all();assert.deepEqual(rows.map(x=>x.revision),[1,2]);
});
test('supply submissions never enter research queue; unresolved custom search must be clarified',async()=>{
 const e=env(),id=(await submit(e,body('site_submission'))).data.requestId;assert.equal((await action(e,id,ap('qualify'))).r.status,200);assert.equal((await action(e,id,ap('queue',2,{taskId:'t',briefId:'b'}))).r.status,409);assert.equal(e.INTAKE_DB.count('request_actions'),1);
 const unknown=body();unknown.brief.power.value=null;const id2=(await submit(e,unknown)).data.requestId;assert.equal((await action(e,id2,ap('qualify'))).r.status,409);assert.equal((await action(e,id2,ap('queue',1,{taskId:'t',briefId:'b'}))).r.status,409);assert.equal(e.INTAKE_DB.count('request_actions'),1);
});
test('private acquisition metrics count received and qualified requests; pagination is bounded',async()=>{
 const e=env(),a=(await submit(e)).data.requestId;await submit(e,body('site_submission'));await action(e,a,ap('qualify'));
 const auth=await token(),m=(await call(e,'/v1/metrics',{auth})).data;assert.equal(m.receivedTotal,2);assert.equal(m.qualifiedTotal,1);assert.deepEqual(m.bySource,[{source:'organic',received:2,qualified:1}]);
 const first=(await call(e,'/v1/requests?limit=1',{auth})).data;assert.equal(first.requests.length,1);assert.ok(first.nextCursor);const second=(await call(e,'/v1/requests?limit=1&cursor='+first.nextCursor,{auth})).data;assert.equal(second.requests.length,1);assert.equal(second.nextCursor,null);assert.notEqual(first.requests[0].id,second.requests[0].id);
 assert.equal((await call(e,'/v1/requests?limit=1000',{auth})).r.status,422);
});
