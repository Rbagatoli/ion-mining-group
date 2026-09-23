import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createAgentClient} from '../crm/agent-exchange/client.mjs';
import {createExchangeJournal} from '../crm/agent-exchange/journal.mjs';
import {createExchangeController, createCloseoutExchangeController} from '../crm/agent-exchange/exchange-controller.mjs';

const endpoint = 'http://localhost:8787';
const operationId = '537a3868-1124-4e7c-9298-bfc3a53a9260';
const clone = value => structuredClone(value);
const leadInput = () => ({kind:'action', type:'lead.save', expectedRevision:7, operationId, payload:{company:'Synthetic lead only'}});
const closeoutInput = () => ({kind:'closeout', expectedRevision:7, operationId, payload:{
  attestation:'synthetic-signed-finding', decision:'revise', note:'Return the exact source for correction.', basis:'Synthetic independent finding.',
  checks:{qa:{evidence:'pass',arithmetic:'na',fit:'pass'},source:{evidence:'pass',arithmetic:'na',fit:'revise'}}
}});
const profiles = [
  {name:'lead.save', factory:createExchangeController, input:leadInput, path:'/v1/actions'},
  {name:'closeout', factory:createCloseoutExchangeController, input:closeoutInput, path:'/v1/closeouts'}
];

// Real client/journal with an atomic in-memory store and synthetic HTTP receipts.
// This tests controller dispatch/recovery, not backend authorization or review eligibility.
function fixture() {
  const scopes = new Map(), receipts = new Map(), calls = [];
  let chain = Promise.resolve(), failWrite = false, failConfirm = false, lostReply = false, failAuthentication = false, tokenCalls = 0;
  let account = {uid:'synthetic-owner',epoch:1};
  const journal = createExchangeJournal({transact(key, write, change) {
    const next = chain.then(() => {
      if (write && failWrite) throw Error('Synthetic disk failure');
      const changed = change(scopes.has(key) ? clone(scopes.get(key)) : undefined);
      if (write && failConfirm && changed.result?.status === 'confirmed') throw Error('Synthetic confirmation persistence failure');
      if (write) scopes.set(key, clone(changed.state));
      return clone(changed.result);
    });
    chain = next.catch(() => {}); return next;
  }});
  const session = () => ({...account, getIdToken:async () => {
    tokenCalls++;
    if (failAuthentication) throw Error('Synthetic authentication failure');
    return 'synthetic-token-never-persist';
  }});
  const fetchImpl = async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({url,method:init.method,...(body ? {body} : {})});
    let receipt;
    if (init.method === 'POST') {
      const id = init.headers['Idempotency-Key'], record = await journal.get(account.uid, endpoint, id);
      assert.equal(record.status, 'attempted', 'The original attempt must be durable before dispatch');
      assert.deepEqual(body, record.job.body, 'Dispatch must preserve the exact prepared body');
      receipt = {ownerUid:body.ownerUid,actorUid:body.ownerUid,operationId:id,requestHash:record.job.requestHash,committedRevision:8};
      receipts.set(id, receipt);
      if (lostReply) throw Error('Synthetic response lost after commit');
    } else receipt = receipts.get(url.split('/').at(-1));
    return {ok:!!receipt,status:receipt?200:404,json:async () => receipt ? {serverConfirmed:true,receipt,currentStateMatches:true} : {}};
  };
  const newClient = () => createAgentClient({baseUrl:endpoint,options:{allowLocal:true},session,fetchImpl,cryptoImpl:webcrypto});
  const controller = factory => factory({client:newClient(),journal,session});
  return {journal,session,scopes,receipts,calls,newClient,controller,
    tokenCalls:() => tokenCalls, account:value => {account=value;}, failWrite:value => {failWrite=value;},
    failConfirm:value => {failConfirm=value;}, lostReply:value => {lostReply=value;}, failAuthentication:value => {failAuthentication=value;}};
}

for (const profile of profiles) {
  test(profile.name + ': preparation is local and concurrent submission sends the exact job once', async () => {
    const f=fixture(), controller=f.controller(profile.factory), prepared=await controller.prepare(profile.input());
    assert.equal(prepared.status,'prepared'); assert.equal(f.calls.length,0); assert.equal(f.tokenCalls(),0);
    const results=await Promise.allSettled([controller.submit(operationId),controller.submit(operationId)]);
    assert.equal(results.filter(result => result.status==='fulfilled').length,1);
    assert.deepEqual(f.calls.map(call => [call.method,call.url]),[['POST',endpoint+profile.path]]);
    assert.deepEqual(f.calls[0].body,prepared.job.body);
    assert.equal((await controller.list())[0].status,'confirmed');
    assert.doesNotMatch(JSON.stringify([...f.scopes]),/synthetic-token-never-persist|Authorization/);
  });

  test(profile.name + ': lost committed reply survives reload and recovers the original receipt with GET only', async () => {
    const f=fixture(), first=f.controller(profile.factory); await first.prepare(profile.input()); f.lostReply(true);
    await assert.rejects(first.submit(operationId),error => error.code==='network_error' && error.outcome==='unconfirmed');
    assert.equal((await first.list())[0].status,'attempted');
    const reloaded=f.controller(profile.factory);
    await assert.rejects(reloaded.submit(operationId),/receipt lookup only/);
    const recovered=await reloaded.recover(operationId);
    assert.equal(recovered.status,'confirmed'); assert.equal(recovered.response.receipt.operationId,operationId);
    assert.deepEqual(f.calls.map(call => [call.method,call.url]),[['POST',endpoint+profile.path],['GET',endpoint+'/v1/receipts/'+operationId]]);
    await assert.rejects(first.submit(operationId),/receipt lookup only/);
    await assert.rejects(reloaded.submit(operationId),/receipt lookup only/);
  });

  test(profile.name + ': storage failure prevents dispatch and local confirmation failure remains recoverable', async () => {
    const f=fixture(), controller=f.controller(profile.factory); f.failWrite(true);
    await assert.rejects(controller.prepare(profile.input()),/disk failure/);
    f.failWrite(false); await controller.prepare(profile.input()); f.failWrite(true);
    await assert.rejects(controller.submit(operationId),/disk failure/);
    assert.equal(f.calls.length,0); assert.equal(f.tokenCalls(),0);
    f.failWrite(false); await assert.rejects(controller.submit(operationId),/receipt lookup only/);
    assert.equal((await controller.abandonPrepared(operationId)).status,'not_sent');

    const second=await controller.prepare({...profile.input(),operationId:webcrypto.randomUUID()}); f.failConfirm(true);
    await assert.rejects(controller.submit(second.operationId),/confirmation persistence/);
    assert.equal((await controller.list()).at(-1).status,'attempted'); f.failConfirm(false);
    assert.equal((await f.controller(profile.factory).recover(second.operationId)).status,'confirmed');
    assert.deepEqual(f.calls.map(call => call.method),['POST','GET']);
  });

  test(profile.name + ': account epoch changes stop dispatch and only the original account can recover', async () => {
    const f=fixture(), controller=f.controller(profile.factory); await controller.prepare(profile.input());
    f.account({uid:'synthetic-owner',epoch:2});
    await assert.rejects(controller.submit(operationId),/Account changed/); assert.equal(f.tokenCalls(),0);
    f.account({uid:'other-owner',epoch:3}); assert.deepEqual(await controller.list(),[]);
    await assert.rejects(controller.recover(operationId),/No original/); assert.equal(f.calls.length,0);
    f.account({uid:'synthetic-owner',epoch:4});
    await assert.rejects(f.controller(profile.factory).recover(operationId),error => error.code==='receipt_not_found');
    assert.deepEqual(f.calls.map(call => call.method),['GET']);
  });

  test(profile.name + ': authentication and dispatch guard failures retain known-not-sent jobs without POST', async () => {
    for (const failure of ['authentication','guard']) {
      const f=fixture(), controller=f.controller(profile.factory); await controller.prepare(profile.input());
      f.failAuthentication(failure==='authentication');
      const options=failure==='guard' ? {beforeDispatch:async () => {throw Error('Synthetic guard rejection');}} : {};
      await assert.rejects(controller.submit(operationId,options),error => error.outcome==='not_sent');
      const [record]=await controller.list(); assert.equal(record.status,'not_sent');
      assert.equal(record.job.operationId,operationId); assert.equal(f.calls.length,0);
    }
  });
}

test('closeout-only factory rejects every action and lead-only factory still rejects closeouts before preparation', async () => {
  const f=fixture(), closeouts=f.controller(createCloseoutExchangeController), leads=f.controller(createExchangeController);
  for (const input of [leadInput(),{...leadInput(),type:'task.result'},{...leadInput(),type:'task.ready'},{kind:'unknown'},undefined]) {
    await assert.rejects(closeouts.prepare(input),/closeouts only/);
  }
  await assert.rejects(leads.prepare(closeoutInput()),/lead.save only/);
  await assert.rejects(leads.prepare({...leadInput(),type:'task.result'}),/lead.save only/);
  assert.deepEqual(await closeouts.list(),[]); assert.equal(f.calls.length,0); assert.equal(f.tokenCalls(),0);
});

test('controllers cannot recover another scope and closeout controller cannot abandon a prepared lead', async () => {
  const f=fixture(), leads=f.controller(createExchangeController), closeouts=f.controller(createCloseoutExchangeController);
  await leads.prepare(leadInput());
  await assert.rejects(closeouts.recover(operationId),/closeouts only/);
  await assert.rejects(closeouts.abandonPrepared(operationId),/closeouts only/);
  assert.equal((await leads.list())[0].status,'prepared'); assert.equal(f.calls.length,0);
  await leads.submit(operationId);
  const closeoutId=webcrypto.randomUUID(); await closeouts.prepare({...closeoutInput(),operationId:closeoutId});
  await assert.rejects(leads.recover(closeoutId),/lead.save only/);
  assert.equal((await closeouts.list()).at(-1).status,'prepared');
  assert.equal(f.calls.length,1);
});

test('closeout recovery rejects changed content or a substituted action before any network request', async () => {
  for (const patch of [job => {job.body.attestation='changed';},job => {job.path='/v1/actions';},job => {job.kind='action';}]) {
    const f=fixture(), controller=f.controller(createCloseoutExchangeController); await controller.prepare(closeoutInput());
    patch([...f.scopes.values()][0].records[0].job);
    await assert.rejects(f.controller(createCloseoutExchangeController).recover(operationId));
    assert.equal(f.calls.length,0); assert.equal(f.tokenCalls(),0);
  }
});

test('missing receipt after a closeout attempt remains unresolved and cannot authorize another operation', async () => {
  const f=fixture(), controller=f.controller(createCloseoutExchangeController); await controller.prepare(closeoutInput()); f.lostReply(true);
  await assert.rejects(controller.submit(operationId)); f.receipts.clear();
  await assert.rejects(controller.recover(operationId),error => error.code==='receipt_not_found');
  await assert.rejects(controller.abandonPrepared(operationId),/No proof/);
  await assert.rejects(controller.prepare({...closeoutInput(),operationId:webcrypto.randomUUID()}),/Resolve the existing/);
  assert.equal((await controller.list())[0].status,'attempted');
  assert.deepEqual(f.calls.map(call => call.method),['POST','GET']);
});
