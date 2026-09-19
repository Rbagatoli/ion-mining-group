/* Browser regression for the restored Hardware order and checkout workflow.
 * Uses only synthetic isolated storage and a loopback read-only server. External
 * requests and all HTTP writes are blocked. OrdersAPI is a local in-memory stub;
 * pay navigation is captured and mailto links are inspected, never activated.
 * Overrides: PROTON_PLAYWRIGHT_PATH, PROTON_CHROME_PATH, PROTON_HARDWARE_REPORT_DIR. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),site=path.join(root,'site');
function dependencyRoot(){let current=root;for(;;){if(fs.existsSync(path.join(current,'tools/.cache/hosting-terrain-browser/node_modules/playwright-core')))return current;const parent=path.dirname(current);if(parent===current)return root;current=parent;}}
const workspace=dependencyRoot();
const {chromium}=require(process.env.PROTON_PLAYWRIGHT_PATH||path.join(workspace,'tools/.cache/hosting-terrain-browser/node_modules/playwright-core'));
const chrome=process.env.PROTON_CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>fs.existsSync(p));
if(!chrome)throw Error('Chrome is unavailable. Set PROTON_CHROME_PATH.');
const out=path.resolve(process.env.PROTON_HARDWARE_REPORT_DIR||path.join(workspace,'reports/hardware-checkout-restore-2026-09-19'));
fs.mkdirSync(out,{recursive:true});
const viewports=[{width:320,height:740,label:'mobile320'},{width:390,height:844,label:'mobile390'},{width:1440,height:1000,label:'desktop'}];
const legacyCart={'Antminer S19 Pro':1},pricedCart={'Antminer S19 Pro':1,'Antminer S21 Pro':2},requestKey='catalogue:s21-pro-245';
const checks=[],blocked=[],blockedWrites=[],localFailures=[],requests=[],runtimeErrors=[],consoleErrors=[];let browser;
const stubAPI=`var OrdersAPI={base:function(){return location.origin+'/api';},isLocal:function(){return true;},demoAllowed:function(){return false;},explain:function(e){return e.message;},post:async function(route,payload){window.__testOrderCalls=window.__testOrderCalls||[];window.__testOrderCalls.push({route:route,payload:payload});return {ok:true,body:{reference:'SYNTHETIC-NO-PAYMENT',demo:true}};}};`;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff','.wasm':'application/wasm'};
const server=http.createServer((req,res)=>{
  try{
    if(!['GET','HEAD'].includes(req.method)){blockedWrites.push({url:req.url,method:req.method});res.writeHead(405);return res.end('Read-only browser test.');}
    const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname),file=path.resolve(site,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
    if(!file.startsWith(site+path.sep)){res.writeHead(403);return res.end();}
    if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end('Missing local asset.');}
    const real=fs.realpathSync(file),realSite=fs.realpathSync(site);if(!real.startsWith(realSite+path.sep)){res.writeHead(403);return res.end();}
    let body=fs.readFileSync(file);
    if(path.basename(file)==='orders-api.js')body=Buffer.from(stubAPI);
    if(path.basename(file)==='checkout.js'){
      const source=body.toString('utf8'),needle=/window\.location\.href\s*=\s*'\.\/pay\.html\?ref='/;
      if(!needle.test(source))throw Error('Payment interception needs review; no payment page will be opened.');
      body=Buffer.from(source.replace(needle,"window.__testPaymentURL = './pay.html?ref='"));
    }
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:body);
  }catch(error){localFailures.push(error.message);res.writeHead(500);res.end('Local test server error.');}
});
async function check(name,fn){try{await fn();checks.push({name,pass:true});console.log('PASS '+name);}catch(error){checks.push({name,pass:false,error:error.message});throw error;}}
async function network(context,origin){
  await context.route('**/*',route=>{const request=route.request(),url=request.url();if(!['GET','HEAD'].includes(request.method())){blockedWrites.push({url,method:request.method()});return route.abort('blockedbyclient');}if(url.startsWith(origin+'/'))return route.continue();blocked.push(url);return route.abort('blockedbyclient');});
  context.on('request',request=>requests.push({url:request.url(),method:request.method()}));
}
function observe(page,label){
  page.on('pageerror',error=>runtimeErrors.push({viewport:label,message:error.message}));
  page.on('console',message=>{if(message.type()==='error'&&!/ERR_BLOCKED_BY_CLIENT|net::ERR_FAILED/.test(message.text()))consoleErrors.push({viewport:label,message:message.text()});});
  page.on('response',response=>{if(response.url().startsWith('http://127.0.0.1:')&&response.status()>=400)localFailures.push(response.status()+' '+response.url());});
}
async function init(context){await context.addInitScript(cart=>{
  if(!localStorage.getItem('__hardware_browser_fixture_initialized')){localStorage.clear();localStorage.setItem('img.cart.v1',JSON.stringify(cart));localStorage.setItem('__hardware_browser_fixture_initialized','true');}
  window.__testOrderCalls=[];
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__testCopied=text;}}});
},legacyCart);}
async function noOverflow(page){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'The page overflows horizontally.');}
async function state(page){return page.evaluate(()=>({cart:Cart.get(),lines:Cart.lines(),totals:Cart.totals(),site:Facilities.chosen()&&Facilities.chosen().id,term:Prepay.chosen()&&Prepay.chosen().id}));}
async function snapshot(page,prefix){return page.evaluate(prefix=>({units:document.getElementById(prefix+'Units').textContent,hash:document.getElementById(prefix+'Hash').textContent,power:document.getElementById(prefix+'Power').textContent,cost:document.getElementById(prefix+'Cost').textContent,itemised:document.getElementById(prefix+'Itemised').innerText.replace(/\s+/g,' ').trim()}),prefix);}
function sameAmounts(actual,expected){for(const field of ['units','hash','power','itemised']){if(['hash','power'].includes(field)&&/to confirm/i.test(expected[field]))assert.match(actual[field],/to confirm/i);else assert.equal(actual[field],expected[field],field+' differs between hardware and checkout');}assert.deepEqual(actual.cost.match(/\$[\d,]+(?:\.\d+)?/g),expected.cost.match(/\$[\d,]+(?:\.\d+)?/g));assert.equal(/quote/i.test(actual.cost),/quote/i.test(expected.cost));}
function money(value){return '$'+Math.round(value).toLocaleString('en-US');}
async function selectVariant(page,query,id){await page.locator('#brCatalogSearch').fill(query);await page.waitForFunction(id=>BrokerageCatalogSelection.variant.id===id,id);}
async function checkout(page,origin){await page.locator('#hwCatalogCheckout').click();await page.waitForURL(url=>url.origin===origin&&url.pathname==='/cart.html',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof Cart!=='undefined'&&document.getElementById('ckBody').hidden===false);}
async function contact(page){await page.locator('#ck-name').fill('Synthetic browser test');await page.locator('#ck-email').fill('synthetic@example.test');}
async function assertQuoteGate(page){
  assert(await page.locator('#ckQuoteReview').isVisible());assert(await page.locator('#ckSubmit').isHidden()||await page.locator('#ckSubmit').isDisabled());assert(await page.locator('#ckPaymentChoice').isHidden());
  await contact(page);await page.locator('#ckForm').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  assert.deepEqual(await page.evaluate(()=>window.__testOrderCalls),[]);assert.equal(await page.evaluate(()=>window.__testPaymentURL||null),null);
  const href=await page.locator('#ckQuoteRequest').getAttribute('href');assert(href.startsWith('mailto:hosting@protonminingco.com?'));return decodeURIComponent(href);
}
(async()=>{
  const markup=fs.readFileSync(path.join(site,'hardware.html'),'utf8');if(!markup.includes('hwCatalogQuantity')||markup.includes('hwHostingForm'))throw Error('Restored catalogue/order markup is not ready.');
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,executablePath:chrome,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
  for(const viewport of viewports){
    const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},deviceScaleFactor:1,serviceWorkers:'block'});await network(context,origin);await init(context);
    const page=await context.newPage();page.setDefaultTimeout(15000);observe(page,viewport.label);let pricedSnapshot,mixedSnapshot,unknownKey;
    await page.goto(origin+'/hardware.html?site=permian',{waitUntil:'domcontentloaded'});
    await check(viewport.label+' restores site, prepay, order and quote sections beside the working 3D catalogue',async()=>{
      for(const selector of ['#hwFacility','#hwPrepay','.hw-order','#hwItemised','#quote','#hwOrderPreview','#hwOrderText','#hwSubmit','#hwCopy'])assert.equal(await page.locator(selector).count(),1,selector+' is missing');
      assert.match(await page.locator('h1').innerText(),/Choose your miners|Buy the machines/);assert.equal(await page.locator('.hw-order').evaluate(node=>getComputedStyle(node).position),'static','The order must not cover the3D catalogue while scrolling.');
      assert.equal(await page.locator('#hwSiteChoice').inputValue(),'permian');assert.match(await page.locator('#hwFacility').innerText(),/Permian Basin/);assert.equal((await state(page)).site,'permian');
      await page.locator('#brMiner').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.getElementById('brMiner').classList.contains('br-scene-ready'),{},{timeout:45000});assert.equal(await page.locator('#brMinerCanvas canvas').count(),1);assert.equal(await page.locator('#brCatalogCompare').isVisible(),false);
      await noOverflow(page);await page.screenshot({path:path.join(out,viewport.label+'-catalog.png')});
    });
    await check(viewport.label+' adds 234 TH/s machines to an existing legacy cart and carries Bakken / 24 months',async()=>{
      await page.locator('#hwSiteChoice').selectOption('bakken');assert.equal((await state(page)).site,'bakken');assert.match(await page.locator('#hwFacility').innerText(),/Bakken/);
      await selectVariant(page,'234','s21-pro-234');await page.locator('#hwCatalogQuantity').fill('2');await page.locator('#brCatalogRequest').click();
      let s=await state(page);assert.deepEqual(s.cart,pricedCart);assert.equal(s.totals.units,3);assert.equal(s.totals.th,578);assert(Math.abs(s.totals.kw-10.27)<1e-9);assert.equal(s.totals.usd,10720);
      await page.locator('#hwPrepay [data-term="24m"]').click();assert.equal((await state(page)).term,'24m');assert.equal(await page.locator('#hwPrepay [data-term="24m"]').getAttribute('aria-pressed'),'true');
      pricedSnapshot=await snapshot(page,'hw');const energy=0.068*0.92*10.27*8760*2;assert(pricedSnapshot.itemised.includes(money(energy)));assert(pricedSnapshot.itemised.includes(money(10720+energy)));assert.match(pricedSnapshot.itemised,/24 months/);await noOverflow(page);
    });
    await check(viewport.label+' checkout preserves the exact priced lines, site, term and itemised amounts',async()=>{
      await checkout(page,origin);const s=await state(page);assert.deepEqual(s.cart,pricedCart);assert.equal(s.site,'bakken');assert.equal(s.term,'24m');sameAmounts(await snapshot(page,'ck'),pricedSnapshot);
      assert.match(await page.locator('#ckLines tr[data-model="Antminer S21 Pro"]').innerText(),/234 TH\/s/);assert.equal(await page.locator('#ckLines input[data-qty="Antminer S21 Pro"]').inputValue(),'2');assert.equal(await page.locator('#ckQuoteReview').isVisible(),false);
      assert(await page.locator('#ckSubmit').isEnabled());
      if(viewport.width<=720){const cells=await page.locator('#ckLines tr').first().evaluate(row=>Array.from(row.querySelectorAll('td[data-label]')).map(cell=>({label:cell.getAttribute('data-label'),visibleLabel:getComputedStyle(cell,'::before').content,rect:JSON.parse(JSON.stringify(cell.getBoundingClientRect()))})));assert.deepEqual(cells.map(cell=>cell.label),['Hashrate','Power draw','Each','Line total']);for(const cell of cells)assert.equal(cell.visibleLabel,'"'+cell.label+'"');for(let i=0;i<cells.length;i++)for(let j=i+1;j<cells.length;j++){const a=cells[i].rect,b=cells[j].rect;assert(a.right<=b.left+1||b.right<=a.left+1||a.bottom<=b.top+1||b.bottom<=a.top+1,'Mobile checkout metrics overlap');}}
      await noOverflow(page);await page.screenshot({path:path.join(out,viewport.label+'-priced-checkout.png')});
    });
    await check(viewport.label+' 245 TH/s variants remain distinct quote-required lines without losing priced machines',async()=>{
      await page.goto(origin+'/hardware.html',{waitUntil:'domcontentloaded'});await selectVariant(page,'245','s21-pro-245');await page.locator('#hwCatalogQuantity').fill('3');await page.locator('#brCatalogRequest').click();
      const s=await state(page);assert.deepEqual(s.cart,{...pricedCart,[requestKey]:3});assert.equal(s.totals.units,6);assert.equal(s.totals.th,1313);assert(Math.abs(s.totals.kw-21.295)<1e-9);assert.equal(s.totals.usd,10720);assert.equal(s.totals.unpriced,3);assert.equal(s.totals.quoteRequired,true);assert.equal(s.totals.deposit,null);
      const line=s.lines.find(line=>line.model===requestKey);assert.equal(line.hashrate,245);assert.equal(line.power,3.675);assert.equal(line.each,null);mixedSnapshot=await snapshot(page,'hw');
      await checkout(page,origin);sameAmounts(await snapshot(page,'ck'),mixedSnapshot);const row=page.locator('#ckLines tr[data-model="'+requestKey+'"]');assert.match(await row.innerText(),/245 TH\/s/);assert.doesNotMatch(await row.innerText(),/234 TH\/s/);assert.equal(await row.locator('input[data-qty]').inputValue(),'3');
      assert.equal(await page.locator('#ckLines input[data-qty="Antminer S21 Pro"]').inputValue(),'2');assert.equal(await page.locator('#ckLines input[data-qty="Antminer S19 Pro"]').inputValue(),'1');await noOverflow(page);await page.screenshot({path:path.join(out,viewport.label+'-mixed-checkout.png')});
    });
    await check(viewport.label+' mixed checkout cannot send a payable subset and keeps every line in its quote draft',async()=>{
      const draft=await assertQuoteGate(page);assert.match(draft,/245/);assert.match(draft,/Antminer S21 Pro/);assert.match(draft,/Antminer S19 Pro/);assert.match(draft,/Bakken/);assert.match(draft,/24 months/);
      await page.reload({waitUntil:'domcontentloaded'});assert.deepEqual((await state(page)).cart,{...pricedCart,[requestKey]:3});await assertQuoteGate(page);
    });
    await check(viewport.label+' unknown power stays unconfirmed and never produces a zero electricity total',async()=>{
      await page.goto(origin+'/hardware.html',{waitUntil:'domcontentloaded'});await selectVariant(page,'S23 air','s23-air');await page.locator('#hwCatalogQuantity').fill('1');await page.locator('#brCatalogRequest').click();unknownKey='catalogue:s23-air';
      let s=await state(page);assert.equal(s.cart[unknownKey],1);assert.equal(s.totals.kw,null);assert.equal(s.totals.th,null);assert.equal(s.totals.unknownPower,1);assert.match(await page.locator('#hwPower').innerText(),/To confirm/i);assert.match(await page.locator('#hwPrepay').innerText(),/Confirm miner power/);
      const hw=await snapshot(page,'hw');assert.doesNotMatch(hw.itemised,/\$0(?:\.00)?(?:\s|$)/);assert.equal(await page.locator('#hwItemised .it-row--total').count(),0);
      await checkout(page,origin);sameAmounts(await snapshot(page,'ck'),hw);const row=page.locator('#ckLines tr[data-model="'+unknownKey+'"]');assert.match(await row.innerText(),/To confirm/i);assert.match(await page.locator('#ckPower').innerText(),/To confirm/i);assert.equal(await page.locator('#ckItemised .it-row--total').count(),0);
      const draft=await assertQuoteGate(page);assert.match(draft,/S23 air/);assert.doesNotMatch(draft,/NaN|null|undefined/);await noOverflow(page);await page.screenshot({path:path.join(out,viewport.label+'-unknown-checkout.png')});
    });
    await check(viewport.label+' editing, removing and reloading request lines preserves exact identities across pages',async()=>{
      const input=page.locator('#ckLines input[data-qty="'+requestKey+'"]');await input.fill('4');await input.dispatchEvent('change');assert.equal((await state(page)).cart[requestKey],4);
      await page.locator('#ckLines button[data-remove="'+unknownKey+'"]').click();let s=await state(page);assert.equal(s.cart[unknownKey],undefined);assert.equal(s.totals.units,7);assert.equal(s.totals.th,1558);assert(Math.abs(s.totals.kw-24.97)<1e-9);
      await page.reload({waitUntil:'domcontentloaded'});assert.deepEqual((await state(page)).cart,{...pricedCart,[requestKey]:4});
      await page.goto(origin+'/hardware.html',{waitUntil:'domcontentloaded'});assert.deepEqual((await state(page)).cart,{...pricedCart,[requestKey]:4});assert.equal((await state(page)).term,'24m');assert.equal(await page.locator('#hwSiteChoice').inputValue(),'bakken');
      await checkout(page,origin);await page.locator('#ckLines button[data-remove="'+requestKey+'"]').click();assert.deepEqual((await state(page)).cart,pricedCart);assert.equal(await page.locator('#ckQuoteReview').isVisible(),false);assert(await page.locator('#ckSubmit').isEnabled());
    });
    await check(viewport.label+' priced-only checkout retains its existing order flow through an in-memory API stub',async()=>{
      await contact(page);await page.locator('#ckSubmit').click();await page.waitForFunction(()=>Boolean(window.__testPaymentURL));
      const calls=await page.evaluate(()=>window.__testOrderCalls);assert.equal(calls.length,1);assert.equal(calls[0].route,'/orders');assert.deepEqual(calls[0].payload.lines.slice().sort((a,b)=>a.model.localeCompare(b.model)),Object.entries(pricedCart).map(([model,qty])=>({model,qty})).sort((a,b)=>a.model.localeCompare(b.model)));
      assert.equal(calls[0].payload.destination.site_id,'bakken');assert.equal(calls[0].payload.destination.prepay_term,'24m');assert.match(await page.evaluate(()=>window.__testPaymentURL),/^\.\/pay\.html\?ref=SYNTHETIC-NO-PAYMENT&leg=deposit$/);assert.equal(new URL(page.url()).pathname,'/cart.html');assert.equal((await state(page)).totals.units,0);assert.match(await page.locator('#ckRef').innerText(),/SYNTHETIC-NO-PAYMENT/);
    });
    await context.close();
  }
  const context=await browser.newContext({viewport:{width:390,height:844},javaScriptEnabled:false,serviceWorkers:'block'});await network(context,origin);const page=await context.newPage();observe(page,'no-js');await page.goto(origin+'/hardware.html',{waitUntil:'domcontentloaded'});
  await check('JavaScript-disabled hardware retains a static model, original order/quote and direct email',async()=>{
    const poster=page.locator('#brMiner .br-scene-poster');await poster.scrollIntoViewIfNeeded();assert(await poster.isVisible());assert.equal(await page.locator('#brMinerCanvas canvas').count(),0);assert.equal(await page.locator('.hw-order').count(),1);assert.equal(await page.locator('#quote').count(),1);assert.equal(await page.locator('#hwSubmit').isDisabled(),true);assert(await page.locator('a[href="mailto:hosting@protonminingco.com"]').count()>0);await noOverflow(page);await page.screenshot({path:path.join(out,'no-js.png')});
  });await context.close();
  await check('all viewports have no runtime errors, failed local assets or attempted HTTP writes',async()=>{assert.deepEqual(runtimeErrors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(localFailures,[]);assert.deepEqual(blockedWrites,[]);assert(requests.every(request=>['GET','HEAD'].includes(request.method)));});
})().catch(error=>{process.exitCode=1;console.error(error.stack||error);}).finally(async()=>{
  if(browser)await browser.close();if(server.listening)await new Promise(resolve=>server.close(resolve));
  fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify({checkedAt:new Date().toISOString(),sourceRoot:root,chrome,viewports,checks,blockedExternalRequests:[...new Set(blocked)],blockedWrites,runtimeErrors,consoleErrors,localFailures,requestCount:requests.length,ordersAPI:'in-memory synthetic stub only',paymentNavigationIntercepted:true,mailLinksInspectedOnly:true,syntheticStorageOnly:true,externalNetworkBlocked:true},null,2)+'\n');
  console.log('Hardware checkout browser report: '+path.join(out,'browser-report.json'));
});
