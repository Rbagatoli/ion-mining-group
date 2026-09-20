import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../worker-intake/index.mjs';
import Inbox from '../crm/intake-inbox.js';
import Sourcing from '../crm/sourcing-model.js';
import Agent from '../agent-control-model.js';

// Exercise the actual inbox client, Worker action validation, SQLite transactions
// and agent reducer together. All identities and storage are synthetic/in-memory.
test('actual private intake -> qualification -> exact owner CRM draft -> observed acknowledgment',async()=>{
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../worker-intake/schema.sql',import.meta.url),'utf8'));
 const d1={prepare(sql){const prepared=(args=[])=>({sql,args,bind(...v){return prepared(v);},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {success:true,results:db.prepare(sql).all(...args)};},async run(){return {success:true,meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}});return prepared();},async batch(statements){db.exec('BEGIN IMMEDIATE');try{const out=statements.map(s=>({success:true,results:db.prepare(s.sql).all(...s.args),meta:{changes:db.prepare('SELECT changes() AS n').get().n}}));db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const env={INTAKE_DB:d1,FIREBASE_PROJECT_ID:'ion-mining',OWNER_UIDS:'synthetic-owner',ROUTE_EMAIL:'energy@protonminingco.com',RATE_LIMIT_SECRET:'synthetic-local-only-rate-key-long-enough'},origin='https://protonminingco.com';
 const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']),jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);jwk.kid='crm-intake-integration';
 const oldFetch=globalThis.fetch;globalThis.fetch=async url=>{assert.match(String(url),/googleapis\.com\/service_accounts\/v1\/jwk/);return Response.json({keys:[jwk]},{headers:{'Cache-Control':'max-age=3600'}});};
 try{
  const sec=Math.floor(Date.now()/1000),enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),head=enc({alg:'RS256',kid:jwk.kid})+'.'+enc({iss:'https://securetoken.google.com/ion-mining',aud:'ion-mining',sub:'synthetic-owner',iat:sec-1,exp:sec+3600}),signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(head)),token=head+'.'+Buffer.from(signature).toString('base64url');
  const payload={service:'custom_search',contact:{name:'Synthetic private customer',email:'customer@example.test'},brief:{country:'US',geography:'Pennsylvania',power:{value:160,unit:'kW'},upfrontBudget:{amount:65000,currency:'CAD'},transaction:'lease',costBasis:'delivered',sourceTypes:['grid_supply'],existingOpportunities:'Known Site A excluded from custom search'},attribution:{source:'synthetic_test'},consent:true};
  const receipt=await worker.fetch(new Request('https://intake.test/v1/requests',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID(),'CF-Connecting-IP':'192.0.2.29'},body:JSON.stringify(payload)}),env);assert.equal(receipt.status,201);const received=await receipt.json();assert.doesNotMatch(JSON.stringify(received),/customer@example|65000|Known Site/);
  let state=Agent.initial();const status={uid:'synthetic-owner',epoch:1,ready:true,error:'',agent:{mode:'cloud'}};
  const D={status:()=>status,snapshot:()=>({uid:status.uid,epoch:1,raw:[]}),agent:()=>state,sites:()=>[],subscribe(){},async dispatch(type,payload,revision){state=Agent.reduce(state,{type,payload,revision,id:'ev_'+crypto.randomUUID(),at:new Date().toISOString()});}};
  const fetch=async(url,options)=>worker.fetch(new Request(url,{...options,headers:{...options.headers,Origin:origin}}),env);
  const inbox=Inbox.create({D,model:Sourcing,agentModel:Agent,auth:{currentUser:{uid:status.uid,getIdToken:async()=>token}},fetch,config:{endpoint:'https://intake.test'}});
  await inbox.open(received.requestId);assert.equal(inbox.state().selected.status,'received');await inbox.mutate('qualify',{note:'Synthetic confirmed customer fit.'});await inbox.queue();
  assert.equal(inbox.state().selected.queue.taskOwnerUid,status.uid);assert.equal(inbox.state().selected.queue.briefId,received.requestId);assert.equal(inbox.state().selected.queue.state,'draft_saved');assert.equal(state.tasks.length,1);assert.equal(state.tasks[0].status,'draft');assert.match(state.tasks[0].brief,/160 kW/);assert.match(state.tasks[0].brief,/65000 CAD/);assert.equal(state.tasks[0].startedAt,'');assert.equal(state.tasks[0].handoffAt,'');
  await inbox.queue();assert.equal(state.tasks.length,1);assert.equal(db.prepare('SELECT count(*) AS n FROM request_actions').get().n,2);
  await inbox.mutate('acknowledge',{taskId:state.tasks[0].id,acknowledgedBy:'Synthetic receiving role',acknowledgedAt:new Date().toISOString(),evidence:'Synthetic in-memory test receipt only.',note:'No live native bot or provider called.'});
  await inbox.open(received.requestId);assert.equal(inbox.state().selected.queue.state,'acknowledged');assert.equal(inbox.state().selected.history.length,3);assert.equal(state.tasks[0].status,'draft');assert.equal(state.revision,1);assert.equal(state.leads.length,0);assert.equal(state.deals.length,0);assert.equal(state.entries.length,0);
  await inbox.refresh();assert.equal(inbox.state().metrics.receivedTotal,1);assert.equal(inbox.state().metrics.qualifiedTotal,1);assert.equal(inbox.state().metrics.acknowledged,1);
 }finally{globalThis.fetch=oldFetch;db.close();}
});
