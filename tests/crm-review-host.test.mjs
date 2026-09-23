// Synthetic SDK sessions and transport only. No Firebase or provider network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mountReviewHost } from '../crm/agent-exchange/review-host.mjs';
import { createExchangeJournal } from '../crm/agent-exchange/journal.mjs';

const OWNER='synthetic_revenue', QUALITY='synthetic_quality', ENDPOINT='https://example.test';
const actions=['lead.save','task.add','task.ready','task.result','task.block'];
const cfg=role=>({enabled:true,endpoint:ENDPOINT,approvedOrigin:ENDPOINT,ownerUid:OWNER,actorUid:role==='revenue'?OWNER:QUALITY,reviewerUid:QUALITY,role,policyId:'synthetic-policy'});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(role='revenue') {
  let authListener=()=>{},dataListener=()=>{},opens=0,closes=0;
  const requests=[],states=[],records=new Map();
  const user=uid=>({uid,getIdToken:async()=>`synthetic-token-${uid}`});
  const auth={app:{options:{projectId:'ion-mining'}},currentUser:user(role==='revenue'?OWNER:QUALITY),onAuthStateChanged(fn){authListener=fn;return ()=>{authListener=()=>{};};}};
  let dataState={ready:true,uid:OWNER,epoch:1,agent:{uid:OWNER,mode:'cloud',serverConfirmed:true}};
  const data={status:()=>dataState,subscribe(fn){dataListener=fn;return ()=>{dataListener=()=>{};};}};
  const caps=()=>({role,ownerUid:OWNER,policyId:'synthetic-policy',profile:'full',actions:role==='revenue'?actions:[],reviewOperationsEnabled:true,externalActions:false,independentReviewProof:false});
  let transport=async(url,init)=>{if(url===ENDPOINT+'/v1/capabilities')return Response.json(caps());if(url===ENDPOINT+'/v1/register')return Response.json({ownerUid:OWNER,serverConfirmed:true,revision:1,state:{tasks:[]}});throw Error('Unexpected synthetic request');};
  const options={root:{},auth,data,config:cfg(role),onChange:value=>states.push(value),fetchImpl:async(url,init)=>{requests.push({url,init});return transport(url,init);},openJournal:async()=>{
    opens++;
    return {...createExchangeJournal({async transact(key,write,change){const result=change(structuredClone(records.get(key)));if(write)records.set(key,structuredClone(result.state));return result.result;}}),close(){closes++;}};
  }};
  return {options,auth,data,requests,states,user,caps,get opens(){return opens;},get closes(){return closes;},set transport(fn){transport=fn;},setData(value){dataState=value;dataListener();},setUser(value){auth.currentUser=value;authListener(value);},notifyAuth(){authListener(auth.currentUser);}};
}

test('disabled host has no auth, store, journal or network effects and revokes previous host',async()=>{
  const f=fixture(),host=mountReviewHost(f.options);await host.ready();assert.equal(host.status().state,'connected');
  const calls=f.requests.length;
  const disabled=mountReviewHost({root:f.options.root,config:{enabled:false}});
  assert.equal(disabled.status().state,'disabled');assert.equal(host.status().state,'disconnected');assert.equal(f.closes,1);
  await assert.rejects(host.readRegister(),/account changed/i);assert.equal(f.requests.length,calls);
});

test('Quality authenticates as a distinct principal without reading owner store or opening a journal',async()=>{
  const f=fixture('quality');f.options.data=new Proxy({}, {get(){throw Error('Quality must never access owner data');}});
  const host=mountReviewHost(f.options);await host.ready();assert.equal(host.status().state,'connected');assert.equal(f.opens,0);
  assert.equal(f.requests[0].init.headers['X-Owner-UID'],OWNER);assert.equal(f.requests[0].init.headers.Authorization,`Bearer synthetic-token-${QUALITY}`);
  for(const action of [()=>host.readRegister(),()=>host.listCloseouts(),()=>host.prepareCloseout({}),()=>host.createChallenge({})])await assert.rejects(action(),/not available/);
  assert.equal(f.requests.length,1);host.disconnect();
});

test('Revenue requires the original confirmed cloud register before even fetching a token',async()=>{
  const f=fixture();f.setData({ready:true,uid:OWNER,epoch:1,agent:{uid:OWNER,mode:'cloud',serverConfirmed:false}});
  const host=mountReviewHost(f.options);await host.ready();assert.equal(host.status().state,'waiting');assert.equal(f.requests.length,0);
  f.setData({ready:true,uid:OWNER,epoch:2,agent:{uid:OWNER,mode:'cloud',serverConfirmed:true}});await host.ready();
  assert.equal(host.status().state,'connected');assert.equal((await host.readRegister()).serverConfirmed,true);assert.equal(f.opens,1);
  await assert.rejects(host.attest({}),/not available/);host.disconnect();
});

test('host rejects incorrect project, ambiguous principal configuration and unapproved extra settings',()=>{
  for(const change of [{actorUid:QUALITY},{reviewerUid:OWNER},{role:'admin'},{token:'do-not-accept'}]) {
    const f=fixture();assert.throws(()=>mountReviewHost({...f.options,config:{...f.options.config,...change}}),/explicit owner/);assert.equal(f.requests.length,0);
  }
  const f=fixture();f.auth.app.options.projectId='different-project';assert.throws(()=>mountReviewHost(f.options),/ion-mining/);
});

test('account change while SDK token is pending suppresses the request and stale connection',async()=>{
  const f=fixture('quality'),gate=deferred();f.auth.currentUser.getIdToken=()=>gate.promise;
  const host=mountReviewHost(f.options),oldReady=host.ready();f.setUser(f.user('unapproved'));gate.resolve('old-synthetic-token');await oldReady;
  assert.equal(host.status().state,'waiting');assert.equal(f.requests.length,0);assert.equal(f.opens,0);host.disconnect();
});

test('same UID with a new auth epoch invalidates an old response',async()=>{
  const f=fixture('quality'),gate=deferred();let count=0;
  f.transport=async()=>++count===1?gate.promise:Response.json(f.caps());
  const host=mountReviewHost(f.options),oldReady=host.ready();await new Promise(resolve=>setImmediate(resolve));
  f.notifyAuth();await host.ready();const currentGeneration=host.status().generation;
  gate.resolve(Response.json({...f.caps(),policyId:'stale-policy'}));await oldReady;
  assert.equal(host.status().state,'connected');assert.equal(host.status().generation,currentGeneration);host.disconnect();
});

test('disconnect during journal open closes the late journal without creating a usable controller',async()=>{
  const f=fixture(),gate=deferred(),opened=deferred();let closed=0;
  f.options.openJournal=async()=>{opened.resolve();return gate.promise;};
  const host=mountReviewHost(f.options),ready=host.ready();await opened.promise;host.disconnect();gate.resolve({close(){closed++;}});await ready;
  assert.equal(host.status().state,'disconnected');assert.equal(closed,1);await assert.rejects(host.listCloseouts(),/account changed/);
});

test('live lead-only capabilities cannot activate the staged review host',async()=>{
  const f=fixture();f.transport=async()=>Response.json({...f.caps(),profile:'lead_only',actions:['lead.save'],reviewOperationsEnabled:false});
  const host=mountReviewHost(f.options);await host.ready();assert.equal(host.status().state,'error');assert.equal(f.opens,0);assert.equal(f.requests.length,1);host.disconnect();
});

test('Revenue rechecks capability scope before closeout preparation',async()=>{
  const f=fixture(),host=mountReviewHost(f.options);await host.ready();
  f.transport=async()=>Response.json({...f.caps(),profile:'lead_only',actions:['lead.save'],reviewOperationsEnabled:false});
  await assert.rejects(host.prepareCloseout({kind:'closeout'}));assert.deepEqual(await host.listCloseouts(),[]);
  assert.ok(f.requests.every(r=>r.init.method==='GET'));host.disconnect();
});

test('view callback errors cannot change role or prevent revocation',async()=>{
  const f=fixture('quality');f.options.onChange=()=>{throw Error('Synthetic rendering failure');};
  const host=mountReviewHost(f.options);await host.ready();assert.equal(host.status().state,'connected');
  f.setUser(null);assert.equal(host.status().state,'waiting');await assert.rejects(host.readCapabilities());host.disconnect();
});
