'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||'../tools/.cache/hosting-terrain-browser/node_modules/playwright-core');
const root=path.resolve(__dirname,'../_site'),out=path.resolve(__dirname,'../reports/managed-hosting-runtime-2026-09-17');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+rel+(rel.endsWith('/')?'index.html':''));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
let browser,page;const checks=[];async function check(name,fn){await fn();checks.push({name,pass:true});console.log('PASS '+name);}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const ctx=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});await ctx.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 page=await ctx.newPage();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const click=name=>page.getByRole('button',{name,exact:true}).click(),fill=(name,value)=>page.getByLabel(name,{exact:true}).fill(value);
 await check('application calculator reconciles the shared example and supports export',async()=>{
  await page.goto(origin+'/app/managed-hosting.html');assert.match(await page.locator('#hostingResults').innerText(),/146,520/);
  await page.getByText('Optional launch payment support',{exact:true}).click();await page.getByLabel('Support status',{exact:true}).selectOption('proposed');await fill('Hard cap on additional support · USD','15120');await click('Update scenario');assert.match(await page.locator('#hostingResults').innerText(),/5,040/);
  await page.getByText('Launch support period reconciliation',{exact:true}).click();await fill('Customer energy within eligible period · kWh','72000');await click('Update scenario');assert.match(await page.locator('#hostingResults').innerText(),/2,520/);
  const [download]=await Promise.all([page.waitForEvent('download'),click('Export draft proposal')]);assert.match(fs.readFileSync(await download.path(),'utf8'),/DRAFT — PROTON MANAGED ENERGY HOSTING/);await page.screenshot({path:path.join(out,'calculator.png'),fullPage:true});
 });
 await check('saved site plan persists without rewriting existing capital or custom records',async()=>{
  await page.goto(origin+'/crm/#pipeline');await page.getByRole('heading',{name:'Your pipeline.',exact:true}).waitFor();
  const id=await page.evaluate(()=>SiteData.add({name:'Synthetic hosting site',usable_kw:1000,energy_type:'landfill_gas',custom_fields:{keep:'original evidence'},notes:'Original notes'}).id);
  await page.goto(origin+'/crm/#pipeline/site/'+id);await page.waitForFunction(()=>ProspectStore.loaded());await click('Managed hosting');assert.match(await page.locator('#sheetBody').innerText(),/owner construction budget is unknown/);
  await click('Edit hosting plan');await page.getByText('Capital, operating cost & owner recovery',{exact:true}).click();await fill('Remaining owner-funded infrastructure · USD','500000');await fill('Owner funding recorded · USD','100000');await click('Save hosting plan');
  let saved=await page.evaluate(id=>SiteData.get(id),id);assert.equal(saved.custom_fields.keep,'original evidence');assert.equal(saved.notes,'Original notes');assert.equal(saved.custom_fields.managedHosting.ownerCapexUsd,500000);assert.equal(saved.custom_fields.managedHosting.startupAvailableUsd,null);
  await page.reload();await page.waitForFunction(()=>ProspectStore.loaded());await click('Managed hosting');assert.match(await page.locator('#sheetBody').innerText(),/400,000/);
  const siteUrl=page.url();await click('Assign hosting diligence');assert.match(await page.getByLabel('Brief & expected result',{exact:true}).inputValue(),new RegExp(id));await click('Cancel');await page.goto(siteUrl);await page.waitForFunction(()=>ProspectStore.loaded());await click('Managed hosting');
  await page.setViewportSize({width:390,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(out,'crm-hosting-mobile.png')});await page.setViewportSize({width:1440,height:1000});
 });
 await check('stale hosting edits retain the draft and cannot overwrite concurrent evidence',async()=>{
  await click('Edit hosting plan');await fill('Customer hosting · cents / billed kWh','8');
  await page.evaluate(()=>{const raw=JSON.parse(localStorage.getItem('protonMiningSites'));raw.sites[0].notes='Concurrent update';localStorage.setItem('protonMiningSites',JSON.stringify(raw));});
  await click('Save hosting plan');await page.locator('#sheetError').waitFor({state:'visible'});assert.match(await page.locator('#sheetError').innerText(),/workspace changed/);assert.equal(await page.getByLabel('Customer hosting · cents / billed kWh',{exact:true}).inputValue(),'8');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('protonMiningSites')).sites[0].custom_fields.managedHosting.clientCents),7);await click('Cancel');await click('Close panel');
 });
 await check('service catalog and eight hosting workflows are reachable without sending assignments',async()=>{
  await page.goto(origin+'/crm/#team');await click('Team & workflows');for(const name of ['hosting_fit','hosting_buyers','hosting_partners','hosting_economics','hosting_proposal','hosting_launch','hosting_reconcile','hosting_review'])assert(await page.locator('[data-action="workflow"][data-id="'+name+'"]').count()===1);
  await click('Revenue');await click('Add deal');await page.getByLabel('Service',{exact:true}).selectOption('managed_energy_hosting');assert.equal(await page.getByLabel('Proposed fee · USD',{exact:true}).inputValue(),'');await click('Cancel');
 });
 await check('public service and contact routing are present with no universal rate or occupancy promise',async()=>{
  await page.goto(origin+'/energy.html#managed-hosting');assert.match(await page.locator('#managed-hosting').innerText(),/owner-funded budget/);assert.doesNotMatch(await page.locator('#managed-hosting').innerText(),/7¢|3\.5¢|guaranteed occupancy/);await page.setViewportSize({width:390,height:900});await page.getByText('Managed Energy Hosting',{exact:true}).first().click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.goto(origin+'/contact.html?topic=managed-hosting');assert.equal(await page.locator('#c-topic').inputValue(),'managed-hosting');assert.match(await page.locator('#c-topic').evaluate(e=>e.form.getAttribute('data-subject')),/Managed Energy Hosting/);assert.equal(await page.locator('#c-topic').evaluate(e=>e.form.getAttribute('data-mailto')),'sales@protonminingco.com');
 });
 await check('no uncaught browser errors',async()=>assert.deepEqual(errors,[]));
 fs.writeFileSync(path.join(out,'browser-checks.json'),JSON.stringify({checks},null,2));
})().catch(async e=>{console.error(e.stack);if(page)await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});fs.writeFileSync(path.join(out,'browser-checks.json'),JSON.stringify({checks,error:e.stack},null,2));process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
