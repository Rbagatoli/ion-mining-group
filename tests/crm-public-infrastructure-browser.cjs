'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('../tools/.cache/hosting-terrain-browser/node_modules/playwright-core'),{createServer}=require('../tools/preview-crm.cjs');
const out=path.resolve(__dirname,'../reports/crm-public-infrastructure-2026-09-17');fs.mkdirSync(out,{recursive:true});
const server=createServer(),checks=[];let browser,page;
async function check(name,fn){await fn();checks.push({name,pass:true});console.log('PASS '+name);}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());page=await context.newPage();page.setDefaultTimeout(20000);
 const errors=[],missing=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(origin)&&r.status()>=400)missing.push(r.url());});
 await page.goto(origin+'/crm/#discover');await page.waitForFunction(()=>document.querySelector('#discoveryList')?.getAttribute('aria-busy')==='false');const original=await page.evaluate(()=>localStorage.getItem('protonMiningSites'));
 const open=async name=>{await page.getByLabel('Site or operator',{exact:true}).fill(name);await page.waitForFunction(()=>document.querySelector('#discoveryList')?.getAttribute('aria-busy')==='false'&&document.querySelectorAll('#discoveryList .discover-site').length===1);await page.locator('#discoveryList .discover-site').first().click();await page.getByRole('button',{name:'Capital',exact:true}).click();};
 const close=()=>page.getByRole('button',{name:'Collapse prospect details',exact:true}).click();
 await check('EPA infrastructure and historical installation documents are attached to Pennsauken',async()=>{
  await open('Pennsauken');assert.match(await page.locator('.public-infra-metrics').innerText(),/199/);assert.match(await page.locator('.public-infra-metrics').innerText(),/1,800 cfm/);await page.locator('.public-infra-document summary').click();assert.match(await page.locator('.crm-public-infra').innerText(),/conditioning skid/);assert.match(await page.locator('.crm-public-infra').innerText(),/2004/);assert.equal(await page.locator('#sheet').evaluate(e=>e.open),false);await close();
 });
 await check('North Dade shows existing equipment separately from proposed RNG work and responsibilities',async()=>{
  await open('North Dade Landfill');await page.locator('.public-infra-document summary').first().click();assert.match(await page.locator('.crm-public-infra').innerText(),/3,000 scfm/);await page.locator('.public-infra-document summary').nth(1).click();assert.match(await page.locator('.crm-public-infra').innerText(),/three-phase power/);assert.match(await page.locator('.crm-public-infra').innerText(),/county/);assert.match(await page.locator('.crm-public-infra').innerText(),/not established as built/);assert.match(await page.locator('.crm-public-infra').innerText(),/Document date not published/);await page.screenshot({path:path.join(out,'north-dade-public-records.png')});await close();
 });
 await check('California Street retains both dated well counts, original units and readable mobile details',async()=>{
  await open('California Street LF Redlands');await page.locator('.public-infra-document summary').first().click();await page.locator('.public-infra-document summary').nth(1).click();const html=await page.locator('.crm-public-infra').innerText();assert.match(html,/39 vertical and 24 horizontal/);assert.match(html,/52 wells and 700 acfm/);assert.match(html,/Lampson Blower/);assert.match(html,/8,500 feet/);assert(await page.locator('.public-infra-document a[href^="https:"]').count()===2);
  for(const width of [390,320]){await page.setViewportSize({width,height:900});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert(await page.locator('.crm-public-infra').evaluate(e=>e.scrollWidth<=e.clientWidth+1));}
  await page.locator('.crm-public-infra').screenshot({path:path.join(out,'california-street-mobile.png')});
 });
 await check('viewing public records never rewrites the pipeline or creates runtime errors',async()=>{assert.equal(await page.evaluate(()=>localStorage.getItem('protonMiningSites')),original);assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);});
 fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({checks},null,2));
})().catch(async e=>{console.error(e.stack);fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({checks,error:e.stack},null,2));process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
