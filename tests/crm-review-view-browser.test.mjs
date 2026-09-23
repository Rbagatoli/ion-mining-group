import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';

// Isolated synthetic page and fake host. No production route, auth or network.
const require=createRequire(import.meta.url),ROOT=path.resolve(import.meta.dirname,'..');
const ORIGIN='https://review-view.example.test';
const fakeHost=`
export function mountReviewHost(options){
  const f=globalThis.fixture;f.mounts++;f.hasData=Object.hasOwn(options,'data');f.explicitAuth=options.auth===f.auth;
  f.state={state:'connected',role:options.config.role,generation:1,ownerUid:'owner',actorUid:options.config.actorUid,endpoint:location.origin};
  const clone=v=>JSON.parse(JSON.stringify(v));
  f.emit=patch=>{f.state={...f.state,...patch};options.onChange({...f.state});};
  const call=(method,args,result)=>{f.calls.push({method,args:clone(args)});if(f.defer===method)return new Promise(resolve=>f.resolve=()=>resolve(clone(result)));return Promise.resolve(clone(result));};
  const record=input=>({ownerUid:'owner',endpoint:location.origin,operationId:'original-'+(f.records.length+1),status:'prepared',job:{kind:'closeout',ownerUid:'owner',actorUid:'owner',operationId:'original-'+(f.records.length+1),body:input}});
  return {
    status:()=>({...f.state}),ready:()=>Promise.resolve(),
    refresh:()=>{f.calls.push({method:'refresh'});f.emit({generation:f.state.generation+1,state:'connected'});return Promise.resolve();},
    disconnect:()=>{f.disconnects++;f.emit({generation:f.state.generation+1,state:'disconnected'});},
    readCapabilities:()=>call('readCapabilities',[],{role:f.state.role,externalActions:false}),
    readRegister:()=>call('readRegister',[],{revision:7,state:{private:'PRIVATE register'}}),
    createChallenge:input=>call('createChallenge',input,{challenge:'SIGNED fixture challenge',saved:false}),
    inspectChallenge:input=>call('inspectChallenge',input,{signatureVerified:false,snapshot:{source:{id:'source',result:'<img src=x onerror="window.pwned=true">'},qa:{id:'quality',result:'Exact embedded QA'}},extra:'DO NOT DISPLAY UNBOUND'}),
    attest:input=>call('attest',input,{saved:false,attestation:'SIGNED fixture attestation'}),
    listCloseouts:()=>call('listCloseouts',[],f.records),
    prepareCloseout:input=>{const r=record(input);f.records.push(r);return call('prepareCloseout',input,r);},
    submitCloseout:id=>{const r=f.records.find(v=>v.operationId===id);r.status='attempted';if(f.failSubmit){f.calls.push({method:'submitCloseout',args:id});return Promise.reject(Error('Synthetic lost response'));}r.status='confirmed';r.response={serverConfirmed:true,currentStateMatches:true};return call('submitCloseout',id,r);},
    recoverCloseout:id=>{const r=f.records.find(v=>v.operationId===id);r.status='confirmed';r.response={serverConfirmed:true,currentStateMatches:false};return call('recoverCloseout',id,r);},
    abandonCloseout:id=>{const r=f.records.find(v=>v.operationId===id);r.status='not_sent';return call('abandonCloseout',id,r);}
  };
}`;

test('isolated review view preserves role, explicit actions, original operations and account boundaries',async t=>{
  const {chromium}=require(process.env.AGENT_PLAYWRIGHT_PATH||path.resolve(ROOT,'../hosting-terrain-browser/node_modules/playwright-core'));
  const browser=await chromium.launch({headless:true,executablePath:process.env.AGENT_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  t.after(()=>browser.close());
  async function fixture(child,role='revenue'){
    const context=await browser.newContext({serviceWorkers:'block'}),errors=[];child.after(()=>context.close());
    await context.route('**/*',async route=>{
      const u=new URL(route.request().url());if(u.origin!==ORIGIN)return route.abort();
      if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><div id="root"></div>'});
      if(u.pathname==='/review-host.mjs')return route.fulfill({contentType:'text/javascript',body:fakeHost});
      if(!['/review-view.mjs','/review-config.mjs'].includes(u.pathname))return route.fulfill({status:404,body:'not found'});
      return route.fulfill({contentType:'text/javascript',body:await readFile(path.join(ROOT,'crm/agent-exchange',u.pathname.slice(1)))});
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(5000);
    await page.goto(ORIGIN+'/?enabled=true&role=revenue');
    await page.evaluate(async role=>{
      window.fixture={mounts:0,disconnects:0,calls:[],records:[],auth:{marker:'explicit synthetic SDK'},role};
      window.config={enabled:true,endpoint:location.origin,approvedOrigin:location.origin,ownerUid:'owner',actorUid:role==='revenue'?'owner':'reviewer',reviewerUid:'reviewer',role,policyId:'test-policy'};
      window.review=await import('/review-view.mjs');
      window.mount=enabled=>{window.view=review.mountReviewView({root:document.getElementById('root'),data:{mustNotReachQuality:true},auth:fixture.auth,...(enabled?{config}:{})});};
    },role);
    child.after(()=>assert.deepEqual(errors,[]));return page;
  }
  const click=(page,name)=>page.getByRole('button',{name,exact:true}).click();
  const field=(page,key)=>page.locator('[data-ui="'+key+'"]');
  async function mount(page){await page.evaluate(()=>mount(true));await page.waitForFunction(()=>document.querySelector('[data-ui="connection"]').textContent==='connected');}
  const closeout={kind:'closeout',expectedRevision:7,payload:{attestation:'Actual synthetic reviewed proof',decision:'revise',note:'Independent defects remain',basis:'Exact fixture evidence',checks:{qa:{evidence:'pass'},source:{evidence:'revise'}}}};
  async function prepare(page){await field(page,'closeout-input').fill(JSON.stringify(closeout));await click(page,'Prepare closeout locally');await page.waitForFunction(()=>document.querySelector('[data-action="submit"]').disabled===false);}

  await t.test('import and default disabled mount cannot infer activation from URL/storage',async child=>{
    const page=await fixture(child);assert.equal(await page.evaluate(()=>fixture.mounts),0);
    await page.evaluate(()=>{localStorage.setItem('reviewConfig',JSON.stringify(config));mount(false);});
    assert.equal(await page.evaluate(()=>fixture.mounts),0);assert.equal(await page.locator('button,input,textarea').count(),0);
    assert.match(await page.locator('#root').innerText(),/staged and disabled/);
  });
  await t.test('Revenue receives explicit existing data/auth and never sends on opening or reading',async child=>{
    const page=await fixture(child);await mount(page);
    assert.deepEqual(await page.evaluate(()=>({hasData:fixture.hasData,auth:fixture.explicitAuth,calls:fixture.calls})),{hasData:true,auth:true,calls:[]});
    assert.equal(await field(page,'closeout-input').inputValue(),'');assert.equal(await field(page,'revision').inputValue(),'');
    await click(page,'Read register');await page.waitForFunction(()=>document.querySelector('[data-ui="register"]').textContent.includes('PRIVATE register'));
    assert.equal(await field(page,'revision').inputValue(),'');
    await field(page,'source-id').fill('source');await field(page,'qa-id').fill('quality');await field(page,'revision').fill('7');await click(page,'Create review challenge');
    await page.waitForFunction(()=>document.querySelector('[data-ui="challenge-output"]').textContent.includes('SIGNED fixture'));
    assert.deepEqual(await page.evaluate(()=>fixture.calls.map(c=>c.method)),['readRegister','createChallenge']);
    assert.deepEqual(await page.evaluate(()=>fixture.calls[1].args),{expectedRevision:7,sourceId:'source',qaId:'quality'});
    assert.equal(await field(page,'closeout-input').inputValue(),'');assert.equal(await page.locator('[data-action="attest"]').count(),0);
  });
  await t.test('Quality receives no data/store, displays only embedded records inertly, and supplies its own finding',async child=>{
    const page=await fixture(child,'quality');await mount(page);
    assert.equal(await page.evaluate(()=>fixture.hasData),false);assert.equal(await page.locator('[data-action="register"],[data-action="submit"]').count(),0);
    assert.equal(await field(page,'finding-input').inputValue(),'');assert.equal(await page.locator('[data-action="attest"]').isDisabled(),true);
    await field(page,'challenge-input').fill('SIGNED fixture');await click(page,'Inspect challenge locally');
    await page.waitForFunction(()=>document.querySelector('[data-action="attest"]').disabled===false);
    assert.match(await field(page,'source').innerText(),/<img src=x/);assert.equal(await page.locator('img').count(),0);assert.equal(await page.evaluate(()=>window.pwned),undefined);
    assert(!((await page.locator('#root').innerText()).includes('DO NOT DISPLAY UNBOUND')));assert.match(await field(page,'inspection-label').innerText(),/HMAC signature NOT verified/);
    assert.equal(await field(page,'finding-input').inputValue(),'');
    const finding={verdict:'revise',result:'Synthetic independent finding needs corrected evidence'};
    await field(page,'finding-input').fill(JSON.stringify(finding));await click(page,'Request Quality attestation');
    await page.waitForFunction(()=>document.querySelector('[data-ui="attestation-label"]').textContent.includes('saved: false'));
    assert.deepEqual(await page.evaluate(()=>fixture.calls.map(c=>c.method)),['inspectChallenge','attest']);
    assert.deepEqual(await page.evaluate(()=>fixture.calls[1].args),{challenge:'SIGNED fixture',finding});
    await field(page,'challenge-input').fill('OTHER challenge');assert.equal(await field(page,'finding-input').inputValue(),'');assert.equal(await page.locator('[data-action="attest"]').isDisabled(),true);assert.equal(await field(page,'source').innerText(),'Not inspected.');
  });
  await t.test('uncertain closeout is submitted once then reconciled by original ID',async child=>{
    const page=await fixture(child);await mount(page);await prepare(page);
    assert.deepEqual(await page.evaluate(()=>fixture.calls.find(c=>c.method==='prepareCloseout').args),closeout);
    await page.evaluate(()=>fixture.failSubmit=true);await click(page,'Submit original closeout once');
    await page.waitForFunction(()=>document.querySelector('[data-ui="notice"]').textContent==='Synthetic lost response');
    assert.equal(await page.locator('[data-action="submit"]').isDisabled(),true);assert.equal(await page.locator('[data-action="abandon"]').isDisabled(),true);
    await click(page,'Look up original receipt');await page.waitForFunction(()=>document.querySelector('[data-ui="receipt-label"]').textContent.includes('current register has changed'));
    const calls=await page.evaluate(()=>fixture.calls.filter(c=>['submitCloseout','recoverCloseout'].includes(c.method)));
    assert.deepEqual(calls,[{method:'submitCloseout',args:'original-1'},{method:'recoverCloseout',args:'original-1'}]);
    assert.equal(await page.locator('[data-action="submit"]').isDisabled(),true);
  });
  await t.test('previously loaded prepared journal entries cannot be submitted from a remount',async child=>{
    const page=await fixture(child);await mount(page);await prepare(page);await page.evaluate(()=>mount(true));await click(page,'Read local journal');
    await page.getByRole('button',{name:'original-1 · prepared',exact:true}).click();
    assert.equal(await page.locator('[data-action="submit"]').isDisabled(),true);assert.equal(await page.locator('[data-action="recover"]').isEnabled(),true);
    await click(page,'Close unsent preparation');await page.waitForFunction(()=>document.querySelector('[data-ui="selected-label"]').textContent.includes('not_sent'));
    assert.equal(await page.evaluate(()=>fixture.records.length),1);assert(!((await page.evaluate(()=>fixture.calls.map(c=>c.method))).includes('submitCloseout')));
  });
  await t.test('account change clears all private editors, outputs and pending async responses',async child=>{
    const page=await fixture(child,'quality');await mount(page);await field(page,'challenge-input').fill('PRIVATE pending challenge');
    await page.evaluate(()=>fixture.defer='inspectChallenge');await click(page,'Inspect challenge locally');
    await page.waitForFunction(()=>typeof fixture.resolve==='function');
    await page.evaluate(()=>fixture.emit({state:'waiting',generation:2}));
    assert.equal(await field(page,'challenge-input').inputValue(),'');assert.equal(await field(page,'finding-input').inputValue(),'');assert.equal(await field(page,'source').innerText(),'Not inspected.');
    await page.evaluate(()=>fixture.resolve());await page.waitForTimeout(30);
    assert.equal(await field(page,'source').innerText(),'Not inspected.');assert.equal(await page.locator('[data-action="attest"]').isDisabled(),true);
    await page.evaluate(()=>fixture.emit({state:'connected',generation:3}));assert.equal(await field(page,'challenge-input').inputValue(),'');
    await page.evaluate(()=>view.disconnect());assert.equal(await page.locator('#root').innerText(),'');
  });
});
