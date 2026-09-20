// Optional real workerd + D1 execution. First build the Worker with Wrangler's
// --dry-run, then set MINIFLARE_PATH and INTAKE_BUNDLE_PATH. No remote resources.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const configured=Boolean(process.env.MINIFLARE_PATH&&process.env.INTAKE_BUNDLE_PATH);
test('real Worker runtime and D1 persist concurrent receipts once and roll back failures',{skip:!configured},async()=>{
 const {Miniflare}=require(process.env.MINIFLARE_PATH);
 const mf=new Miniflare({modules:true,scriptPath:process.env.INTAKE_BUNDLE_PATH,compatibilityDate:'2025-01-01',d1Databases:{INTAKE_DB:'intake-runtime-tests'},bindings:{FIREBASE_PROJECT_ID:'ion-mining',OWNER_UIDS:'synthetic-owner',ROUTE_EMAIL:'energy@protonminingco.com',RATE_LIMIT_SECRET:'synthetic-only-rate-secret-long-enough',ALLOWED_ORIGINS:'https://protonminingco.com'}});
 try{
  const db=await mf.getD1Database('INTAKE_DB');
  const schema=readFileSync(new URL('../worker-intake/schema.sql',import.meta.url),'utf8');
  await db.batch(schema.split(';').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s)));
  const p={service:'custom_search',contact:{name:'Synthetic runtime fixture',email:'runtime@example.test'},brief:{country:'US',geography:'Texas',power:{value:160,unit:'kW'}},consent:true};
  const send=(key,payload=p)=>mf.dispatchFetch('https://intake.test/v1/requests',{method:'POST',headers:{Origin:'https://protonminingco.com','Content-Type':'application/json','Idempotency-Key':key,'CF-Connecting-IP':'192.0.2.55'},body:JSON.stringify(payload)});
  assert.equal((await (await mf.dispatchFetch('https://intake.test/v1/health')).json()).ready,true);
  const key=crypto.randomUUID(),responses=await Promise.all(Array.from({length:8},()=>send(key))),data=await Promise.all(responses.map(r=>r.json()));
  assert.equal(responses.filter(r=>r.status===201).length,1);assert.equal(new Set(data.map(d=>d.requestId)).size,1);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM requests').first()).n,1);
  assert.equal((await send(key,{...p,contact:{...p.contact,name:'Changed'}})).status,409);
  const before=(await db.prepare('SELECT sum(count) AS n FROM intake_rates').first()).n;
  await db.prepare("CREATE TRIGGER fail_receipt BEFORE INSERT ON requests BEGIN SELECT RAISE(ABORT,'synthetic write failure'); END").run();
  assert.equal((await send(crypto.randomUUID())).status,503);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM requests').first()).n,1);
  assert.equal((await db.prepare('SELECT sum(count) AS n FROM intake_rates').first()).n,before);
  const unauthorized=await mf.dispatchFetch('https://intake.test/v1/requests/'+data[0].requestId);
  assert.equal(unauthorized.status,401);assert.doesNotMatch(await unauthorized.text(),/runtime@example|Synthetic runtime fixture/);
 }finally{await mf.dispose();}
});
