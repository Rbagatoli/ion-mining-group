/* Local synthetic browser regression. All external requests are blocked.
 * Mailto navigation and clipboard writes are captured inside the test page;
 * no email app, message, live account, checkout or real cart is touched.
 * Overrides: PROTON_PLAYWRIGHT_PATH, PROTON_CHROME_PATH, PROTON_HARDWARE_REPORT_DIR. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),site=path.join(root,'site');
function dependencyRoot(){let current=root;for(;;){if(fs.existsSync(path.join(current,'tools/.cache/hosting-terrain-browser/node_modules/playwright-core')))return current;const parent=path.dirname(current);if(parent===current)throw Error('Playwright runtime unavailable. Set PROTON_PLAYWRIGHT_PATH to playwright-core.');current=parent;}}
const workspace=process.env.PROTON_PLAYWRIGHT_PATH?root:dependencyRoot();
const {chromium}=require(process.env.PROTON_PLAYWRIGHT_PATH||path.join(workspace,'tools/.cache/hosting-terrain-browser/node_modules/playwright-core'));
const chrome=process.env.PROTON_CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>fs.existsSync(p));
if(!chrome)throw Error('Chrome is unavailable. Set PROTON_CHROME_PATH.');
const out=path.resolve(process.env.PROTON_HARDWARE_REPORT_DIR||path.join(workspace,'reports/hardware-hosting-2026-09-19'));
fs.mkdirSync(out,{recursive:true});
const legacyCart='{"Antminer S19 Pro":7,"Legacy custom miner":2}';
const checks=[],blocked=[],localFailures=[],requests=[],runtimeErrors=[],consoleErrors=[];let browser;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff','.wasm':'application/wasm'};
const server=http.createServer((req,res)=>{
  try{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end('Read-only test server.');}
    const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname),file=path.resolve(site,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
    if(!file.startsWith(site+path.sep)){res.writeHead(403);return res.end();}
    if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end('Missing local asset.');}
    let body=fs.readFileSync(file);
    if(['site.js','hardware-catalog.js'].includes(path.basename(file))){
      const source=body.toString('utf8'),needle=path.basename(file)==='site.js'?"window.location.href = 'mailto:'":"win.location.href = 'mailto:hosting@protonminingco.com?subject='";
      if(!source.includes(needle))throw Error('Mailto test interception needs review; no unguarded navigation will run.');
      body=Buffer.from(source.replace(needle,path.basename(file)==='site.js'?"window.__hardwareTestMailto = 'mailto:'":"win.__hardwareTestMailto = 'mailto:hosting@protonminingco.com?subject='"));
    }
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:body);
  }catch(error){localFailures.push(error.message);res.writeHead(500);res.end('Local test server error.');}
});
async function check(name,fn){try{await fn();checks.push({name,pass:true});console.log('PASS '+name);}catch(error){checks.push({name,pass:false,error:error.message});throw error;}}
async function network(context,origin){
  await context.route('**/*',route=>{const url=route.request().url();if(url.startsWith(origin+'/'))return route.continue();blocked.push(url);return route.abort('blockedbyclient');});
  context.on('request',request=>{requests.push({url:request.url(),method:request.method()});});
}
function observe(page,label){
  page.on('pageerror',error=>runtimeErrors.push({viewport:label,message:error.message}));
  page.on('console',message=>{if(message.type()==='error'&&!/ERR_BLOCKED_BY_CLIENT|net::ERR_FAILED/.test(message.text()))consoleErrors.push({viewport:label,message:message.text()});});
  page.on('response',response=>{if(response.url().startsWith('http://127.0.0.1:')&&response.status()>=400)localFailures.push(response.status()+' '+response.url());});
}
async function init(context){await context.addInitScript(cart=>{
  localStorage.setItem('img.cart.v1',cart);window.__hardwareCartWrites=[];
  const set=Storage.prototype.setItem,remove=Storage.prototype.removeItem,clear=Storage.prototype.clear;
  Storage.prototype.setItem=function(key,value){if(key==='img.cart.v1')window.__hardwareCartWrites.push('set');return set.call(this,key,value);};
  Storage.prototype.removeItem=function(key){if(key==='img.cart.v1')window.__hardwareCartWrites.push('remove');return remove.call(this,key);};
  Storage.prototype.clear=function(){window.__hardwareCartWrites.push('clear');return clear.call(this);};
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__hardwareTestCopy=text;}}});
},legacyCart);}
async function noOverflow(page){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'The page overflows horizontally.');}
async function selection(page){return page.evaluate(()=>({family:BrokerageCatalogSelection.family.id,modelKey:BrokerageCatalogSelection.modelKey,variant:BrokerageCatalogSelection.variant.id,name:BrokerageCatalogSelection.variant.name,powerW:BrokerageCatalogSelection.variant.powerW,hashrateTH:BrokerageCatalogSelection.variant.hashrateTH}));}

(async()=>{
  if(!fs.readFileSync(path.join(site,'hardware.html'),'utf8').includes('hwHostingForm'))throw Error('Hosting markup is not ready; refusing to test the legacy order page.');
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,executablePath:chrome,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
  for(const viewport of [{width:390,height:844,label:'mobile'},{width:1440,height:1000,label:'desktop'}]){
    const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},deviceScaleFactor:1,serviceWorkers:'block'});await network(context,origin);await init(context);
    const page=await context.newPage();page.setDefaultTimeout(15000);observe(page,viewport.label);
    await page.goto(origin+'/hardware.html?site=permian',{waitUntil:'domcontentloaded'});
    await check(viewport.label+' loads an interactive 3D catalogue without comparison/checkout',async()=>{
      await page.locator('#brMiner').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.getElementById('brMiner').classList.contains('br-scene-ready'),{},{timeout:45000});
      assert.equal(await page.locator('#brMinerCanvas canvas').count(),1);assert.equal(await page.locator('#brCatalogCompare').isVisible(),false);assert.equal(await page.locator('script[src^="./hardware.js"]').count(),0);assert.equal(await page.locator('#hwCheckout').count(),0);
      assert.match(await page.locator('#brCatalogSavings').innerText(),/Hosting requirements/);await noOverflow(page);await page.screenshot({path:path.join(out,viewport.label+'-catalog.png')});
    });
    await check(viewport.label+' exact numeric search and CTA capture the rated variant',async()=>{
      await page.locator('#brCatalogSearch').fill('245');await page.waitForFunction(()=>BrokerageCatalogSelection.variant.id==='s21-pro-245');
      const chosen=await selection(page);assert.equal(chosen.hashrateTH,245);assert.equal(chosen.powerW,3675);
      await page.locator('#brCatalogRequest').click();assert.equal(await page.locator('#hwHostingModel').inputValue(),chosen.name);assert.match(await page.locator('#hwHostingConfiguration').inputValue(),/Catalogue variant: s21-pro-245/);
      await page.locator('#hwHostingQuantity').fill('10');await page.locator('#hwHostingOwnership').selectOption('owned');
      const summary=await page.locator('#hwHostingSummary').innerText();assert.match(summary,/Rated fleet hashrate: 2,450 TH\/s/);assert.match(summary,/Rated miner power: 36\.75 kW/);assert.match(summary,/I already own these miners/);assert.match(summary,/excludes facility cooling/);
    });
    await check(viewport.label+' region preference prefills, changes and clears without implying a reservation',async()=>{
      assert.equal(await page.locator('#hwHostingFacility').inputValue(),'permian');assert.match(await page.locator('#hwHostingSummary').innerText(),/Preferred region: Permian Basin/);
      await page.locator('#hwHostingFacility').selectOption('alberta');assert.match(await page.locator('#hwHostingSummary').innerText(),/Preferred region: Western Sedimentary Basin/);
      await page.locator('#hwHostingFacility').selectOption('');assert.doesNotMatch(await page.locator('#hwHostingSummary').innerText(),/Preferred region:/);
    });
    await check(viewport.label+' browsing does not overwrite the captured enquiry',async()=>{
      const captured=await page.locator('#hwHostingConfiguration').inputValue();await page.locator('#brCatalogSearch').fill('');await page.locator('#brCatalogCooling').selectOption('hydro');
      await page.waitForFunction(()=>BrokerageCatalogSelection.family.cooling==='hydro');assert.match(await page.locator('#brCatalogSavings').innerText(),/coolant requirements/);
      assert.equal(await page.locator('#hwHostingConfiguration').inputValue(),captured);assert.equal(await page.locator('#hwHostingModel').inputValue(),'S21 Pro · 245 TH/s');
      await page.locator('[data-br-catalog-variant="s21-xp-hyd-473"]').click();await page.waitForFunction(()=>BrokerageCatalogSelection.variant.id==='s21-xp-hyd-473');assert.equal(await page.locator('#hwHostingConfiguration').inputValue(),captured);
    });
    await check(viewport.label+' another explicit CTA replaces the exact selection',async()=>{
      const chosen=await selection(page);await page.locator('#brCatalogRequest').click();assert.equal(await page.locator('#hwHostingModel').inputValue(),chosen.name);
      const summary=await page.locator('#hwHostingConfiguration').inputValue();assert.match(summary,/Catalogue variant: s21-xp-hyd-473/);assert.match(summary,/Rated fleet hashrate: 4,730 TH\/s/);assert(summary.includes('Rated miner power: '+new Intl.NumberFormat('en-US',{maximumFractionDigits:3}).format(chosen.powerW/100)+' kW'));assert.match(summary,/Cooling: Hydro-cooled/);
      await page.locator('#hwHostingForm').scrollIntoViewIfNeeded();await noOverflow(page);await page.screenshot({path:path.join(out,viewport.label+'-enquiry.png')});
    });
    await check(viewport.label+' invalid quantities cannot compose a draft',async()=>{
      await page.locator('#hwHostingName').fill('Synthetic hosting test');await page.locator('#hwHostingEmail').fill('synthetic@example.test');
      for(const value of ['0','-1','1.5','100001','']){await page.locator('#hwHostingQuantity').fill(value);assert.equal(await page.locator('#hwHostingQuantity').evaluate(input=>input.validity.valid),false);assert.match(await page.locator('#hwHostingSummary').innerText(),/Enter a whole number/);}
      await page.locator('#hwHostingSubmit').click();assert.equal(await page.evaluate(()=>window.__hardwareTestMailto||null),null);await page.locator('#hwHostingQuantity').fill('3');
    });
    await check(viewport.label+' manual machines clear catalogue hashrate and power',async()=>{
      await page.locator('#hwHostingManual').check();await page.locator('#hwHostingOtherModel').fill('Synthetic manual ASIC');await page.locator('#hwHostingOwnership').selectOption('needed');
      assert.equal(await page.locator('#hwHostingModel').inputValue(),'');assert.equal(await page.locator('#hwHostingModel').isDisabled(),true);
      const summary=await page.locator('#hwHostingSummary').innerText();assert.match(summary,/Miner: Synthetic manual ASIC/);assert.match(summary,/Rated fleet hashrate: To confirm/);assert.match(summary,/Rated miner power: To confirm/);assert.match(summary,/I need miners for hosting/);assert.doesNotMatch(summary,/Catalogue variant:/);
    });
    await check(viewport.label+' copy and mailto compose drafts without sending or cart writes',async()=>{
      await page.locator('#hwHostingNotes').fill('Synthetic test only. Do not send.');await page.locator('#hwHostingCopy').click();await page.waitForFunction(()=>Boolean(window.__hardwareTestCopy));
      const copied=await page.evaluate(()=>window.__hardwareTestCopy);assert.match(copied,/Synthetic manual ASIC/);assert.match(copied,/Quantity: 3/);assert.match(copied,/synthetic@example.test/);
      await page.locator('#hwHostingSubmit').click();await page.waitForFunction(()=>Boolean(window.__hardwareTestMailto));const draft=await page.evaluate(()=>window.__hardwareTestMailto);
      assert(draft.startsWith('mailto:hosting@protonminingco.com?'));const decoded=decodeURIComponent(draft);assert.match(decoded,/Synthetic manual ASIC/);assert.match(decoded,/Rated miner power: To confirm/);assert.match(decoded,/Synthetic test only\. Do not send\./);
      await page.locator('#brCatalogRequest').click();assert.equal(await page.locator('#hwHostingOtherModel').isDisabled(),true);await page.locator('#hwHostingSubmit').click();
      const selectedDraft=decodeURIComponent(await page.evaluate(()=>window.__hardwareTestMailto));assert.match(selectedDraft,/Catalogue variant: s21-xp-hyd-473/);assert.doesNotMatch(selectedDraft,/Synthetic manual ASIC/);
      assert.equal(page.url().startsWith(origin+'/hardware.html'),true);assert.equal(await page.evaluate(()=>localStorage.getItem('img.cart.v1')),legacyCart);assert.deepEqual(await page.evaluate(()=>window.__hardwareCartWrites),[]);await noOverflow(page);
    });
    await check(viewport.label+' cooling filter and no-results recovery retain the captured plan',async()=>{
      const captured=await page.locator('#hwHostingConfiguration').inputValue();await page.locator('#brCatalogSearch').fill('nonexistent synthetic model');assert.equal(await page.locator('#brCatalogEmpty').isVisible(),true);await page.locator('#brCatalogClear').click();assert.equal(await page.locator('#brCatalogEmpty').isVisible(),false);assert.equal(await page.locator('#hwHostingConfiguration').inputValue(),captured);await noOverflow(page);
    });
    await check(viewport.label+' I have miners shortcut opens an owned manual configuration',async()=>{
      await page.locator('#hwHaveMiners').click();assert.equal(await page.locator('#hwHostingOwnership').inputValue(),'owned');assert.equal(await page.locator('#hwHostingManual').isChecked(),true);assert.equal(await page.locator('#hwHostingOtherModel').isDisabled(),false);assert.match(await page.locator('#hwHostingSummary').innerText(),/Rated miner power: To confirm/);
    });
    await context.close();
  }
  const context=await browser.newContext({viewport:{width:390,height:844},javaScriptEnabled:false,serviceWorkers:'block'});await network(context,origin);const page=await context.newPage();observe(page,'no-js');await page.goto(origin+'/hardware.html',{waitUntil:'domcontentloaded'});
  await check('JavaScript-disabled page retains a static miner and direct hosting email',async()=>{
    const poster=page.locator('#brMiner .br-scene-poster');await poster.scrollIntoViewIfNeeded();assert.equal(await poster.isVisible(),true);assert.equal(await page.locator('#brMinerCanvas canvas').count(),0);
    assert(await page.locator('a[href="mailto:hosting@protonminingco.com"]').count()>0);assert.equal(await page.locator('#hwHostingSubmit').isDisabled(),true);await noOverflow(page);await page.screenshot({path:path.join(out,'no-js.png')});
  });await context.close();
  await check('no JavaScript errors, failed local assets or non-GET submissions',async()=>{assert.deepEqual(runtimeErrors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(localFailures,[]);assert(requests.every(r=>r.method==='GET'||r.method==='HEAD'));});
})().catch(error=>{process.exitCode=1;console.error(error.stack||error);}).finally(async()=>{
  if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
  const cartChecks=checks.filter(c=>c.name.includes('cart writes'));
  fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify({checkedAt:new Date().toISOString(),sourceRoot:root,chrome,checks,blockedExternalRequests:[...new Set(blocked)],runtimeErrors,consoleErrors,localFailures,requestCount:requests.length,mailNavigationIntercepted:true,clipboardCapturedOnly:true,legacyCartPreserved:cartChecks.length===2&&cartChecks.every(c=>c.pass),externalNetworkBlocked:true},null,2)+'\n');
  console.log('Hardware hosting browser report: '+path.join(out,'browser-report.json'));
});
