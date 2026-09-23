import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {canonicalJson} from '../crm/agent-exchange/client.mjs';

// Complete built CRM and real data adapter; synthetic account status/SDK and
// intercepted API only. No personal browser profile or external requests.
const require=createRequire(import.meta.url), ROOT=path.resolve(import.meta.dirname,'..');
const ORIGIN='https://crm-entry.example.test', OWNER='synthetic-owner', POLICY='synthetic-policy';
const TOKEN='SYNTHETIC-NOT-A-CREDENTIAL';
const prefix=`
(() => {
  const originalCreate=ProtonCrmData.create;
  const t=window.entryTest={creates:0,dataListeners:0,authListeners:0,tokens:0,epoch:1,uid:'${OWNER}'};
  const startRelease=ProtonCrmRelease.start;
  ProtonCrmRelease.start=options=>{t.releaseOptions=options;return startRelease(options);};
  const callbacks=new Set();
  t.user={uid:t.uid,async getIdToken(){if(this!==t.user)throw Error('Lost SDK receiver');t.tokens++;return '${TOKEN}';}};
  t.auth={currentUser:t.user,onAuthStateChanged(fn){callbacks.add(fn);t.authListeners++;return()=>{if(callbacks.delete(fn))t.authListeners--;};}};
  ProtonCrmData.create=function(){
    t.creates++;const data=originalCreate(),status=data.status,subscribe=data.subscribe;
    data.status=()=>{const s=status();return {...s,uid:t.uid,epoch:t.epoch,agent:{...s.agent,uid:t.uid,mode:'cloud',serverConfirmed:true}};};
    data.subscribe=fn=>{t.dataListeners++;const stop=subscribe(fn);let active=true;return()=>{if(active){active=false;t.dataListeners--;stop();}};};
    t.data=data;window.firebase={auth:()=>t.auth};return data;
  };
  t.emit=()=>window.dispatchEvent(new StorageEvent('storage',{key:'protonMiningSites'}));
  t.signOut=()=>{t.auth.currentUser=null;t.uid=null;t.epoch++;for(const fn of callbacks)fn(null);t.emit();};
})();
`;

test('actual CRM route loads the existing-session connection without losing pending work',async t=>{
  const out=path.join(ROOT,'tools/.cache','crm-agent-entry-'+randomUUID());await mkdir(out,{recursive:true});
  const shots=path.join(ROOT,'reports/grok-crm-entrypoint-20260921');await mkdir(shots,{recursive:true});
  require('../tools/build-crm.cjs').build(out);
  const {chromium}=require(process.env.AGENT_PLAYWRIGHT_PATH||path.join(ROOT,'tools/.cache/hosting-terrain-browser/node_modules/playwright-core'));
  const browser=await chromium.launch({headless:true,executablePath:process.env.AGENT_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  t.after(()=>browser.close());
  async function fixture(child,{enabled=true,holdView=false}={}){
    const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}}),calls=[],errors=[];
    let releaseView;const gate=holdView?new Promise(resolve=>releaseView=resolve):Promise.resolve();
    const receipts=new Map();let failPost=true;
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.origin!==ORIGIN){await route.abort();return;}
      if(url.pathname.startsWith('/v1/')){
        calls.push({method:request.method(),path:url.pathname});
        assert.equal(request.headers().authorization,'Bearer '+TOKEN);
        const reply=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
        if(url.pathname==='/v1/capabilities')return reply({ownerUid:OWNER,policyId:POLICY,role:'revenue',profile:'lead_only',actions:['lead.save'],reviewOperationsEnabled:false,externalActions:false,independentReviewProof:false});
        if(url.pathname==='/v1/register')return reply({serverConfirmed:true,ownerUid:OWNER,revision:7,state:{notes:'PRIVATE-SYNTHETIC-REGISTER'}});
        if(request.method()==='POST'&&url.pathname==='/v1/actions'){
          const body=request.postDataJSON(),operationId=request.headers()['idempotency-key'];
          const requestHash=createHash('sha256').update(canonicalJson({path:url.pathname,ownerUid:OWNER,actorUid:OWNER,body})).digest('hex');
          const receipt={serverConfirmed:true,receipt:{ownerUid:OWNER,actorUid:OWNER,operationId,requestHash,committedRevision:8},currentRevision:8,currentStateMatches:true};
          receipts.set(operationId,receipt);
          if(failPost){failPost=false;return route.abort('failed');}return reply(receipt);
        }
        if(url.pathname.startsWith('/v1/receipts/')){const receipt=receipts.get(url.pathname.split('/').at(-1));return reply(receipt||{outcome:'unconfirmed'},receipt?200:404);}
        return reply({error:'Unexpected request'},404);
      }
      if(!url.pathname.startsWith('/crm/'))return route.fulfill({status:404,body:'not found'});
      const rel=url.pathname.slice('/crm/'.length)||'index.html';
      assert(!rel.split('/').includes('..'));
      let body;try{body=await readFile(path.join(out,rel));}catch{return route.fulfill({status:404,body:'not found'});}
      if(rel==='crm.js')body=prefix+body.toString();
      if(rel==='agent-exchange/config.mjs')body=enabled?`export default Object.freeze({enabled:true,endpoint:'${ORIGIN}',ownerUid:'${OWNER}',policyId:'${POLICY}'});`:'export default Object.freeze({enabled:false,endpoint:"",ownerUid:"",policyId:""});';
      if(rel==='agent-exchange/view.mjs')await gate;
      const ext=path.extname(rel),contentType=/\.m?js$/.test(rel)?'text/javascript':({'.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png'}[ext]||'application/octet-stream');
      return route.fulfill({status:200,contentType,body});
    });
    const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
    child.after(async()=>{releaseView?.();assert.deepEqual(errors,[]);await context.close();});
    return {page,calls,receipts,releaseView};
  }
  async function connected(page){await page.waitForFunction(()=>document.querySelector('[data-ui="notice"]')?.textContent.includes('Connected to the approved'));}
  async function open(page){await page.goto(ORIGIN+'/crm/#team/exchange');await connected(page);}
  async function prepare(page){
    await page.locator('[data-ui="input"]').fill(JSON.stringify({kind:'action',type:'lead.save',expectedRevision:7,payload:{id:'synthetic-lead',company:'PRIVATE-SYNTHETIC-LEAD',stage:'discovered'}}));
    await page.getByRole('button',{name:'Prepare request',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[data-ui="notice"]').textContent.includes('Prepared locally'));
    return JSON.parse(await page.locator('[data-ui="request"]').innerText());
  }
  await t.test('settings link reaches the disabled release; URL and storage cannot enable it',async child=>{
    const {page,calls}=await fixture(child,{enabled:false});
    await page.goto(ORIGIN+'/crm/?enabled=true&endpoint='+encodeURIComponent(ORIGIN)+'#settings');
    await page.evaluate(()=>localStorage.setItem('agentInterfaceConfig',JSON.stringify({enabled:true,endpoint:location.origin})));
    await page.getByRole('link',{name:/^Agent connection/}).click();
    await page.getByRole('heading',{name:'Connection not configured',exact:true}).waitFor();
    assert.equal(new URL(page.url()).hash,'#team/exchange');assert.deepEqual(calls,[]);
    assert.equal(await page.evaluate(()=>entryTest.creates),1);assert.equal(await page.evaluate(()=>entryTest.tokens),0);
    assert.equal(await page.locator('#agentExchangePanel button').count(),0);
    await page.getByRole('link',{name:'Back to team →'}).click();await page.locator('#agentExchangePanel').waitFor({state:'hidden'});
  });
  await t.test('ordinary CRM updates preserve the editor, operation and one host subscription',async child=>{
    const {page,calls}=await fixture(child);await open(page);await prepare(page);
    const before=await page.evaluate(()=>({listeners:entryTest.dataListeners,tokens:entryTest.tokens,request:document.querySelector('[data-ui="request"]').textContent}));
    await page.evaluate(()=>{window.savedExchangeNode=document.querySelector('[data-ui="input"]');entryTest.emit();});
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(()=>document.querySelector('[data-ui="input"]')===savedExchangeNode),true);
    assert.equal(await page.locator('[data-action="submit"]').isEnabled(),true);
    assert.deepEqual(await page.evaluate(()=>({listeners:entryTest.dataListeners,tokens:entryTest.tokens,request:document.querySelector('[data-ui="request"]').textContent})),before);
    assert.equal(calls.length,1);assert.equal(await page.evaluate(()=>entryTest.creates),1);
    await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
    const header=await page.locator('#content').boundingBox(),panel=await page.locator('#agentExchangePanel').boundingBox();
    const layout=await page.evaluate(()=>({margin:getComputedStyle(document.querySelector('.workspace')).marginLeft,scrollX,body:document.body.className,sidebar:document.querySelector('.sidebar').getBoundingClientRect().right,panel:document.getElementById('agentExchangePanel').getBoundingClientRect().left,workspace:document.querySelector('.workspace').getBoundingClientRect().left}));
    assert(layout.panel>=layout.sidebar,JSON.stringify(layout));
    assert(panel.y<=header.y+header.height+24,'Exchange follows its heading with at most one normal paragraph margin.');
    assert(panel.y<350,'Controls remain near the top of the CRM.');
    await page.screenshot({path:path.join(shots,'desktop-synthetic.png'),animations:'disabled'});
    const after=await page.evaluate(()=>({sidebar:document.querySelector('.sidebar').getBoundingClientRect().right,panel:document.getElementById('agentExchangePanel').getBoundingClientRect().left}));
    assert(after.panel>=after.sidebar,JSON.stringify({before:layout,after}));
  });
  await t.test('exchange blocks automatic reload and disconnects before the workbench route',async child=>{
    const {page,calls}=await fixture(child);await open(page);await prepare(page);
    await page.locator('[data-ui="input"]').blur();
    assert.equal(await page.evaluate(()=>entryTest.releaseOptions.isSafeToReload()),false);
    await page.evaluate(()=>location.hash='#team/workbench');
    await page.getByRole('heading',{name:'Agent workbench',exact:true}).waitFor();
    await page.waitForFunction(()=>entryTest.authListeners===0);
    assert.equal(await page.locator('#agentExchangePanel').isVisible(),false);
    assert.equal(await page.locator('#agentExchangePanel').innerText(),'');
    assert.equal(await page.locator('#content').evaluate(el=>el.classList.contains('crm-exchange')),false);
    assert.equal(await page.evaluate(()=>entryTest.releaseOptions.isSafeToReload()),false,'Workbench modal retains its own reload guard.');
    await page.getByRole('button',{name:'Close panel',exact:true}).click();
    await page.waitForFunction(()=>location.hash==='#team');
    assert.equal(await page.evaluate(()=>entryTest.releaseOptions.isSafeToReload()),true);
    assert.equal(calls.filter(c=>c.method==='POST').length,0);
  });
  await t.test('navigation retains uncertain operation; returning recovers its original receipt without another POST',async child=>{
    const {page,calls,receipts}=await fixture(child);await open(page);const job=await prepare(page);
    await page.locator('[data-action="submit"]').click();
    await page.waitForFunction(()=>document.querySelector('[data-ui="receipt-label"]').textContent.includes('Unresolved')||document.querySelector('[data-ui="receipt-label"]').textContent.includes('Outcome unresolved'));
    assert.equal(receipts.size,1);
    await page.getByRole('link',{name:'Back to team →'}).click();
    await page.waitForFunction(()=>entryTest.authListeners===0);assert.equal(await page.locator('#agentExchangePanel').innerText(),'');
    await page.evaluate(()=>location.hash='#team/exchange');await connected(page);
    await page.locator('[data-action="list"]').click();await page.locator('[data-ui="records"] button').first().click();
    assert.equal(await page.locator('[data-action="submit"]').isEnabled(),false);
    await page.locator('[data-action="recover"]').click();
    await page.waitForFunction(()=>document.querySelector('[data-ui="notice"]').textContent.includes('exact server-confirmed receipt'));
    const saved=JSON.parse(await page.locator('[data-ui="request"]').innerText());assert.equal(saved.operationId,job.operationId);
    assert.equal(calls.filter(c=>c.method==='POST').length,1);assert.equal(calls.filter(c=>c.path.includes('/receipts/')).length,1);
  });
  await t.test('sign-out removes private rendered values and disables the old operation',async child=>{
    const {page,calls}=await fixture(child);await open(page);await prepare(page);
    await page.locator('[data-action="read"]').click();await page.getByText(/PRIVATE-SYNTHETIC-REGISTER/).waitFor();
    await page.evaluate(()=>entryTest.signOut());
    await page.waitForFunction(()=>!document.getElementById('agentExchangePanel').textContent.includes('PRIVATE-SYNTHETIC'));
    assert.equal(await page.locator('#agentExchangePanel button:enabled').count(),0);
    assert.equal(calls.filter(c=>c.method==='POST').length,0);
  });
  await t.test('late module load after leaving the route never mounts or authenticates',async child=>{
    const {page,calls,releaseView}=await fixture(child,{holdView:true});
    await page.goto(ORIGIN+'/crm/#team/exchange',{waitUntil:'domcontentloaded'});
    await page.getByRole('heading',{name:'Agent connection',exact:true}).waitFor();
    await page.getByRole('link',{name:'Back to team →'}).click();releaseView();
    // Import completion is observed through its performance entry, then one task turn.
    await page.waitForFunction(()=>performance.getEntriesByType('resource').some(x=>x.name.includes('agent-exchange/view.mjs')));
    await page.waitForTimeout(80);
    assert.equal(await page.locator('#agentExchangePanel').isVisible(),false);assert.equal(await page.locator('#agentExchangePanel').innerText(),'');
    assert.equal(await page.evaluate(()=>entryTest.authListeners),0);assert.deepEqual(calls,[]);
  });
  await t.test('embedded controls fit a 390px viewport',async child=>{
    const {page}=await fixture(child);await page.setViewportSize({width:390,height:844});await open(page);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    for(const button of await page.locator('#agentExchangePanel button').all()){
      const box=await button.boundingBox();assert(box.x>=0&&box.x+box.width<=391);
    }
    await page.screenshot({path:path.join(shots,'mobile-synthetic.png'),animations:'disabled'});
  });
});
