// Synthetic signed Firebase identities + actual immutable Worker handler; no network/accounts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createReviewClient} from '../crm/agent-exchange/review-client.mjs';
import {createAgentClient,canonicalJson} from '../crm/agent-exchange/client.mjs';
import Model from './fixtures/agent-review-protocol/agent-control-model.js';
import {createHandler} from './fixtures/agent-review-protocol/worker-agent-interface/index.mjs';

test('sealed handler fixture preserves the exact manifest dependency closure',async()=>{
  const root=new URL('./fixtures/agent-review-protocol/',import.meta.url);
  const manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
  assert.equal(manifest.schema,'proton-agent-review-protocol-test-fixture-v1');
  assert.equal(manifest.sourceManifest.schema,'proton-agent-interface-release-v1');
  assert.match(manifest.sourceManifest.sha256,/^[a-f0-9]{64}$/);
  assert.deepEqual(manifest.files.map(file=>file.path).sort(),[
    'agent-control-model.js','crm/energy-scouting.js','crm/grok-managed-hosting.js','crm/grok-team.js',
    'crm/outreach-model.js','crm/sourcing.js','energy-opportunity-matching.js','worker-agent-interface/firestore.mjs',
    'worker-agent-interface/index.mjs','worker-agent-interface/security.mjs','worker-portal/identity.js'
  ]);
  for(const file of manifest.files){
    const bytes=await readFile(new URL(file.path,root));
    assert.equal(bytes.length,file.bytes,file.path+' byte length');
    assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,file.path+' SHA256');
  }
});

const TIME=Date.parse('2026-09-23T18:00:00Z'),AT=new Date(TIME).toISOString(),OWNER='synthetic_review_owner',QUALITY='synthetic_review_quality',POLICY='synthetic_review_policy';
const clone=value=>structuredClone(value),checks={evidence:'pass',arithmetic:'na',fit:'pass'};
const ENV={AGENT_INTERFACE_ENABLED:'true',FIREBASE_PROJECT_ID:'ion-mining',AGENT_INTERFACE_PROFILE:'full',AGENT_POLICY_ID:POLICY,AGENT_ACTIVE_KEY_ID:'synthetic',
  AGENT_SIGNING_KEYS:JSON.stringify([{kid:'synthetic',secret:Buffer.alloc(32,19).toString('base64url')}]),
  AGENT_PRINCIPALS:JSON.stringify([{uid:OWNER,ownerUid:OWNER,role:'revenue',label:'Synthetic Revenue'},{uid:QUALITY,ownerUid:OWNER,role:'quality',label:'Synthetic Quality'}]),ALLOWED_ORIGINS:'https://review.example.test'};
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'synthetic-review-client-test',alg:'RS256',use:'sig'};
async function token(uid){
  const header=Buffer.from(JSON.stringify({alg:'RS256',kid:jwk.kid})).toString('base64url');
  const body=Buffer.from(JSON.stringify({aud:'ion-mining',iss:'https://securetoken.google.com/ion-mining',sub:uid,iat:TIME/1000,exp:TIME/1000+7200})).toString('base64url');
  const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(header+'.'+body));
  return header+'.'+body+'.'+Buffer.from(signature).toString('base64url');
}
const tokens={[OWNER]:await token(OWNER),[QUALITY]:await token(QUALITY)};
let sequence=0;
const apply=(s,type,payload)=>Model.reduce(s,{type,payload,id:'synthetic_'+(++sequence),revision:s.revision,at:AT});
function fixture(){
  let s=apply(Model.initial(),'task.add',{id:'source',title:'Synthetic source',brief:'Exact synthetic source',role:'analysis'});
  s=apply(s,'task.ready',{id:'source'});s=apply(s,'task.result',{id:'source',result:'Synthetic independent source content.',sources:['https://example.test/source']});
  s=apply(s,'task.add',{id:'qa',title:'Synthetic Quality',brief:'Actual independent review',role:'review',parentTaskId:'source'});return apply(s,'task.ready',{id:'qa'});
}
const finding=(verdict='pass')=>({result:'Actual synthetic independent '+verdict+' finding.',sources:['https://example.test/qa'],verdict,reviewedAt:AT,evidence:'native-artifact:synthetic-review',checks:{...checks,...(verdict==='pass'?{}:{evidence:verdict})},independent:true});
function harness({env=ENV,initial=fixture()}={}){
  let state=clone(initial),version=1,time=TIME,commits=0,storeReads=0,transform=null;
  const calls=[],receipts=new Map(),sessions=new Map(),tokenHooks=new Map();
  const handler=createHandler({now:()=>time,storeFactory:args=>{
    storeReads++;assert.equal(args.ownerUid,OWNER);assert.equal(args.token,tokens[OWNER]);
    return {readRegister:async()=>({state:clone(state),version:String(version)}),readReceipt:async id=>clone(receipts.get(id)||null),commit:async input=>{assert.equal(input.beforeVersion,String(version));commits++;state=clone(input.state);version++;receipts.set(input.receipt.operationId,clone(input.receipt));}};
  },fetchImpl:async url=>{assert.equal(url,'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');return Response.json({keys:[jwk]},{headers:{'Cache-Control':'max-age=0'}});}});
  async function fetchImpl(url,init){
    calls.push({url,init});const response=await handler(new Request(url,init),env);return transform?transform(response,url,init):response;
  }
  function session(role){const uid=role==='revenue'?OWNER:QUALITY;if(!sessions.has(role))sessions.set(role,{uid,epoch:1});return ()=>({...sessions.get(role),getIdToken:async()=>{await tokenHooks.get(role)?.();return tokens[uid];}});}
  function client(role,extra={}){return createReviewClient({baseUrl:'https://review.example.test',ownerUid:OWNER,actorUid:role==='revenue'?OWNER:QUALITY,reviewerUid:QUALITY,role,policyId:POLICY,session:session(role),fetchImpl,now:()=>time,...extra});}
  return {client,session,fetchImpl,calls,handler,sessions,tokenHooks,get state(){return state;},get commits(){return commits;},get storeReads(){return storeReads;},advance:ms=>{time+=ms;},change:fn=>{state=fn(clone(state));version++;},transform:fn=>{transform=fn;}};
}
const challengeInput=h=>({expectedRevision:h.state.revision,sourceId:'source',qaId:'qa'});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const expectCode=(promise,code)=>assert.rejects(promise,error=>{assert.equal(error.code,code);assert(!Object.values(tokens).some(t=>error.message.includes(t)));return true;});

test('actual signed full protocol separates actor/owner and returns no save until Revenue closeout',async()=>{
  for(const verdict of ['pass','revise','blocked']){
    const h=harness(),revenue=h.client('revenue'),quality=h.client('quality'),before=canonicalJson(h.state);
    const challenge=await revenue.createChallenge(challengeInput(h));assert(Object.isFrozen(challenge.snapshot.source));
    const reads=h.storeReads,inspected=await quality.inspectChallenge(challenge.challenge);assert.equal(inspected.signatureVerified,false);assert.deepEqual(inspected.snapshot,challenge.snapshot);
    const signed=await quality.attest({challenge:challenge.challenge,finding:finding(verdict)});
    assert.equal(signed.saved,false);assert.equal(h.storeReads,reads,'Quality never opens the owner store');assert.equal(h.commits,0);assert.equal(canonicalJson(h.state),before);
    const posts=h.calls.filter(c=>c.init.method==='POST');assert.deepEqual(posts.map(c=>new URL(c.url).pathname),['/v1/review-challenges','/v1/reviews/attest']);
    assert.equal(posts[1].init.headers['X-Owner-UID'],OWNER);assert.equal(posts[1].init.headers.Authorization,'Bearer '+tokens[QUALITY]);assert.equal(posts[1].init.redirect,'error');assert.equal(posts[1].init.credentials,'omit');assert.equal(posts[1].init.cache,'no-store');
    const writer=createAgentClient({baseUrl:revenue.endpoint,session:h.session('revenue'),fetchImpl:h.fetchImpl});
    const job=await writer.prepare({kind:'closeout',expectedRevision:h.state.revision,payload:{attestation:signed.attestation,decision:verdict==='pass'?'accept':'revise',note:'Record actual synthetic finding.',basis:'Exact authenticated synthetic review.',checks:{qa:checks,source:finding(verdict).checks}}});
    const receipt=await writer.execute(job);assert.equal(receipt.serverConfirmed,true);assert.equal(receipt.receipt.reviewerUid,QUALITY);assert.equal(h.commits,1);assert.equal(h.state.tasks[0].status,verdict==='pass'?'done':'blocked');
    assert.equal((await writer.reconcile(job)).receipt.operationId,job.operationId);assert.equal(h.commits,1);
  }
});

test('role APIs reject misuse before authentication and expose no arbitrary CRUD or closeout',async()=>{
  const h=harness(),r=h.client('revenue'),q=h.client('quality');
  await expectCode(r.attest({}),'role_forbidden');await expectCode(q.createChallenge({}),'role_forbidden');assert.equal(h.calls.length,0);
  for(const key of ['execute','prepare','readRegister','reconcile','request'])assert.equal(r[key],undefined);
  assert.throws(()=>h.client('quality',{actorUid:OWNER}),/separate/);assert.throws(()=>h.client('revenue',{reviewerUid:OWNER}),/separate/);
  await assert.rejects(r.createChallenge({...challengeInput(h),reviewerUid:'untrusted'}),/exact/);assert.equal(h.calls.length,0);
});

test('every POST confirms full profile, exact policy, role and action capabilities first',async()=>{
  const lead={...ENV,AGENT_INTERFACE_PROFILE:'lead_only',AGENT_PRINCIPALS:JSON.stringify(JSON.parse(ENV.AGENT_PRINCIPALS).filter(p=>p.role==='revenue'))};
  for(const env of [lead,{...ENV,AGENT_POLICY_ID:'different-policy'}]){
    const h=harness({env});await expectCode(h.client('revenue').createChallenge(challengeInput(h)),'scope_mismatch');assert.equal(h.calls.length,1);assert.equal(h.calls[0].init.method,'GET');assert.equal(h.storeReads,0);
  }
  for(const patch of [{role:'quality'},{ownerUid:QUALITY},{actions:[...['lead.save','task.add','task.ready','task.result','task.block'],'extra']},{reviewOperationsEnabled:false},{independentReviewProof:true},{externalActions:true}]){
    const h=harness();h.transform(async response=>Response.json({...await response.json(),...patch}));await expectCode(h.client('revenue').createChallenge(challengeInput(h)),'scope_mismatch');assert.equal(h.calls.length,1);
  }
});

test('account and epoch changes around token acquisition prevent a request; late responses never retarget',async()=>{
  const h=harness(),r=h.client('revenue'),gate=deferred(),entered=deferred();h.tokenHooks.set('revenue',async()=>{entered.resolve();await gate.promise;});
  const pending=r.createChallenge(challengeInput(h));await entered.promise;h.sessions.set('revenue',{uid:OWNER,epoch:2});gate.resolve();await expectCode(pending,'account_changed');assert.equal(h.calls.length,0);
  const h2=harness(),r2=h2.client('revenue');h2.transform(async response=>{h2.sessions.set('revenue',{uid:QUALITY,epoch:2});return response;});await expectCode(r2.createChallenge(challengeInput(h2)),'account_changed');assert.equal(h2.calls.length,1);
  const h3=harness(),r3=h3.client('revenue');h3.transform(async(response,url,init)=>{if(init.method==='POST')h3.sessions.set('revenue',{uid:OWNER,epoch:3});return response;});await expectCode(r3.createChallenge(challengeInput(h3)),'account_changed');assert.equal(h3.commits,0);
});

test('malformed, mismatched and expired challenge artifacts cannot be attested',async()=>{
  const h=harness(),r=h.client('revenue'),q=h.client('quality'),c=await r.createChallenge(challengeInput(h)),count=h.calls.length;
  for(const value of ['',c.challenge+'.extra','bad.token'])await expectCode(q.attest({challenge:value,finding:finding()}),'invalid_artifact');assert.equal(h.calls.length,count);
  const [body,signature]=c.challenge.split('.'),changed=JSON.parse(Buffer.from(body,'base64url').toString());changed.data.source.result='Changed without hash update';
  await expectCode(q.inspectChallenge(Buffer.from(JSON.stringify(changed)).toString('base64url')+'.'+signature),'invalid_artifact');
  h.advance(30*60*1000);await expectCode(q.attest({challenge:c.challenge,finding:finding()}),'invalid_artifact');assert.equal(h.calls.length,count);assert.equal(h.commits,0);
});

test('a locally parseable forged signature is explicitly unverified and rejected by the real server',async()=>{
  const h=harness(),c=await h.client('revenue').createChallenge(challengeInput(h)),q=h.client('quality');
  const bad=c.challenge.split('.')[0]+'.'+'A'.repeat(43);assert.equal((await q.inspectChallenge(bad)).signatureVerified,false);
  await expectCode(q.attest({challenge:bad,finding:finding()}),'request_failed');assert.equal(h.commits,0);
});

test('finding checks, immutable existing QA and exact response bindings fail closed',async()=>{
  const h=harness(),c=await h.client('revenue').createChallenge(challengeInput(h)),q=h.client('quality'),before=h.calls.length;
  for(const bad of [{...finding(),checks:{...checks,evidence:'revise'}},{...finding(),independent:false},{...finding(),sources:['javascript:alert(1)']},{...finding(),extra:'unsupported'}])await assert.rejects(q.attest({challenge:c.challenge,finding:bad}));assert.equal(h.calls.length,before);
  let initial=fixture();initial=apply(initial,'task.result',{id:'qa',result:'Already submitted actual finding.',sources:[],qualityVerdict:'revise',confirmCurrentSource:true});
  const existing=harness({initial}),ec=await existing.client('revenue').createChallenge(challengeInput(existing));await expectCode(existing.client('quality').attest({challenge:ec.challenge,finding:finding('revise')}),'immutable_review');assert.equal(existing.commits,0);
  const wrong=harness();wrong.transform(async(response,url)=>{const data=await response.json();if(url.endsWith('/review-challenges'))data.snapshot.source.result='Unsigned substituted snapshot';return Response.json(data);});await expectCode(wrong.client('revenue').createChallenge(challengeInput(wrong)),'invalid_response');
  h.transform(async(response,url)=>{const data=await response.json();if(url.endsWith('/reviews/attest'))data.saved=true;return Response.json(data);});await expectCode(q.attest({challenge:c.challenge,finding:finding()}),'invalid_response');assert.equal(h.commits,0);
});

test('endpoint pins, transport errors and denied identities never expose credentials or retry',async()=>{
  const h=harness();for(const baseUrl of ['http://remote.example.test','https://user:pass@example.test','https://example.test?token=x'])assert.throws(()=>h.client('revenue',{baseUrl}));
  assert.throws(()=>h.client('revenue',{options:{approvedOrigin:'https://wrong.example.test'}}));
  const r=h.client('revenue',{fetchImpl:async()=>{throw Error(tokens[OWNER]);}});await expectCode(r.readCapabilities(),'network_error');
  h.sessions.set('quality',{uid:OWNER,epoch:1});await expectCode(h.client('quality').readCapabilities(),'session_required');assert.equal(h.calls.length,0);
});
