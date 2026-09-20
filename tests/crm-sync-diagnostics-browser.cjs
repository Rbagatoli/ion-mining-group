/* Synthetic UI fixtures only. No real account, customer record, provider or endpoint is accessed. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||'C:/Users/rbaga/ion-mining-group/tools/.cache/hosting-terrain-browser/node_modules/playwright-core');
const {createServer}=require('../tools/preview-crm.cjs'),A=require('../agent-control-model');
const server=createServer(),out=path.resolve(__dirname,'../reports/crm-sync-diagnostics-20260920');fs.mkdirSync(out,{recursive:true});
const NOW='2026-09-20T18:00:00.000Z',OLD='2026-09-18T12:00:00.000Z',UID='synthetic-ui-owner',KEY='protonAgentControlLocal_v1';
const LEAD='lead_12345678-1234-4234-8234-123456789abc';let state=A.initial(),seq=0,browser,page;
const apply=(type,payload,at=OLD)=>{state=A.reduce(state,{type,payload,at,revision:state.revision,id:'synthetic_ui_'+(++seq)});};
apply('task.add',{id:'old_result',role:'supply',title:'Historical synthetic ASIC research',brief:'Synthetic saved assignment; no inferred energy relationship.'});
apply('task.ready',{id:'old_result'});apply('task.result',{id:'old_result',result:'Synthetic historical result, not accepted.',sources:['https://example.test/synthetic']});apply('task.cancel',{id:'old_result'});
apply('lead.save',{id:LEAD,company:'Synthetic energy site request <img src=x>',offer:'custom_search',channel:'direct',stage:'discovered',nextAction:'Confirm usable capacity and site access.',website:'https://example.test/energy'},NOW);
const original=JSON.stringify(state),closedState=JSON.parse(original);
apply('task.add',{id:'reported_work',role:'intelligence',title:'Synthetic saved work report',brief:'A saved assignment only.'},NOW);apply('task.ready',{id:'reported_work'},NOW);apply('task.start',{id:'reported_work'},NOW);const workingState=state;
const instrument=`
(function(){
 const create=ProtonCrmData.create,h=window.__syncUi={listeners:[],override:null,heldState:null,writes:0};
 ProtonCrmData.create=function(){const d=create(),status=d.status,read=d.agent,subscribe=d.subscribe;
  d.status=()=>({...status(),...(h.override||{})});d.agent=()=>h.heldState||read();
  d.subscribe=fn=>{h.listeners.push(fn);subscribe(fn);};
  d.dispatch=async()=>{h.writes++;throw Error('Synthetic diagnostic test blocks all writes.');};
  h.set=(mode,state)=>{if(state)h.heldState=state;h.override={uid:'synthetic-ui-owner',epoch:1,ready:true,error:'',agent:{uid:'synthetic-ui-owner',mode,serverConfirmed:mode==='cloud',lastServerConfirmedAt:'2026-09-20T17:55:00.000Z',error:mode==='error'?'Unsupported lead service: PRIVATE_VALUE_MUST_NOT_RENDER':'',validationIssue:mode==='error'?{code:'unsupported_lead_field',field:'service',recordId:'lead_12345678-1234-4234-8234-123456789abc'}:null}};h.listeners.forEach(fn=>fn('agents'));};
  h.pending=()=>{h.set('cloud');h.override.agent.serverConfirmed=false;h.listeners.forEach(fn=>fn('agents'));};return d;};
})();`;
const report={checks:[],errors:[],missing:[]};
async function check(name,fn){await fn();report.checks.push(name);console.log('PASS '+name);}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block',reducedMotion:'reduce'});
 await context.route('**/*',async route=>{const url=route.request().url();if(!url.startsWith(origin))return route.abort();if(new URL(url).pathname==='/crm/crm-data.js'){const response=await route.fetch();return route.fulfill({response,body:(await response.text())+'\n'+instrument});}return route.continue();});
 await context.addInitScript(({key,value})=>{localStorage.setItem(key,value);},{key:KEY,value:original});
 page=await context.newPage();page.setDefaultTimeout(12000);await page.clock.install({time:new Date(NOW)});page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(origin)&&r.status()>=400)report.missing.push(r.url());});
 await page.goto(origin+'/crm/#control');await page.getByRole('heading',{name:'Control Center',exact:true}).waitFor();
 await check('The latest energy lead is primary and separate from a historical result or active work',async()=>{
  const recent=page.getByRole('region',{name:'Recent saved work'});assert.match(await recent.innerText(),/Latest saved lead/);assert.match(await recent.innerText(),/Synthetic energy site request <img src=x>/);assert.match(await recent.innerText(),/Latest saved result/);assert.match(await recent.innerText(),/No active task recorded/);assert.doesNotMatch(await recent.innerText(),/Result accepted|current cycle/i);assert.equal(await recent.locator('img').count(),0);assert.equal(await recent.locator('a').first().getAttribute('href'),'#pipeline/lead/'+LEAD);assert.equal(await page.locator('.cc-role.is-working').count(),0);
 });
 await check('Rejected sync is explicit, safely diagnosed and never described as current',async()=>{
  await page.evaluate(()=>__syncUi.set('error'));await page.waitForFunction(()=>document.querySelector('#connectionLabel').textContent==='Needs attention');const banner=page.getByRole('status',{name:'Team register sync'});assert.match(await banner.innerText(),/saved lead service is unsupported/);assert.match(await banner.innerText(),/last valid snapshot; it is not confirmed current/);assert.match(await banner.innerText(),/Last verified sync/);assert.match(await banner.innerText(),/Team changes are paused/);assert.doesNotMatch(await page.locator('#content').innerText(),/PRIVATE_VALUE_MUST_NOT_RENDER|Shared account records/);assert.match(await page.locator('.crm-recent-work').innerText(),/Snapshot not current/);
 });
 await check('Phone and desktop retain diagnostics and record links without clipping',async()=>{
  for(const width of [320,390,1440]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow '+width);assert(await page.getByRole('button',{name:'Export backup',exact:true}).isVisible());assert(await page.locator('.crm-recent-work').isVisible());for(const link of await page.locator('.crm-recent-work .crm-work-entry').all()){const box=await link.boundingBox();assert(box.height>=44);}await page.screenshot({path:path.join(out,'stale-snapshot-'+width+'.png'),fullPage:true});}
 });
 await check('Record links open exact lead, and unconfirmed task links retain the connection barrier',async()=>{
  await page.locator('.crm-recent-work a').first().click();await page.locator('.wf-lead-card[data-lead-id="'+LEAD+'"]').waitFor();assert.equal(new URL(page.url()).hash,'#pipeline/lead/'+LEAD);assert.match(await page.locator('#content').innerText(),/Confirm usable capacity/);await page.goto(origin+'/crm/#control');await page.evaluate(()=>__syncUi.set('error'));await page.locator('.crm-recent-work a[href="#team/task/old_result"]').click();await page.getByRole('heading',{name:'Task connection needs attention',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Submit result',exact:true}).count(),0);await page.getByRole('button',{name:'Close panel',exact:true}).click();
 });
 await check('Cached, pending and rejected snapshots cannot produce a fresh-work animation',async()=>{
  await page.goto(origin+'/crm/#control');
  for(const mode of ['error','offline']){await page.evaluate(({mode,state})=>__syncUi.set(mode,state),{mode,state:workingState});await page.waitForFunction(()=>document.querySelector('.cc-role[data-id=intelligence]').textContent.includes('sync not verified'));assert.equal(await page.locator('.cc-role.is-working').count(),0);assert.match(await page.locator('.cc-role[data-id=intelligence]').innerText(),/needs checking/);await page.clock.fastForward(30000);assert.equal(await page.locator('.cc-role.is-working').count(),0);}
  await page.evaluate(()=>__syncUi.pending());await page.waitForFunction(()=>document.querySelector('#connectionLabel').textContent==='Verifying sync…');assert.equal(await page.locator('.cc-role.is-working').count(),0);await page.evaluate(()=>__syncUi.set('cloud'));await page.waitForFunction(()=>document.querySelector('#connectionLabel').textContent==='Account connected');assert.equal(await page.locator('.cc-role.is-working').count(),1);
 });
 await check('Team progress uses the same generic latest work and stays read-only',async()=>{
  await page.evaluate(state=>__syncUi.set('error',state),closedState);await page.locator('#navigation a[href="#team"]').click();await page.getByRole('heading',{name:'Proton Revenue Desk.',exact:true}).waitFor();assert.match(await page.locator('.crm-recent-work').innerText(),/Synthetic energy site request/);assert.match(await page.locator('.crm-recent-work').innerText(),/No active task recorded/);assert.equal(await page.evaluate(()=>__syncUi.writes),0);assert.equal(await page.evaluate(key=>localStorage.getItem(key),KEY),original);
 });
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.missing,[]);report.passed=true;
})().catch(async error=>{report.failure=error.stack;console.error(error);if(page)await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(report,null,2));});
