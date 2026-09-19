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
const out=path.resolve(process.env.PROTON_HARDWARE_REPORT_DIR||path.join(workspace,'reports/hardware-order-strip-2026-09-19'));
fs.mkdirSync(out,{recursive:true});
const layoutOnly=process.env.PROTON_HARDWARE_LAYOUT_ONLY==='1';
const viewports=[{width:1440,height:900,label:'desktop'},{width:1366,height:768,label:'laptop1366'},{width:320,height:740,label:'mobile320'},{width:390,height:844,label:'mobile390'},{width:1024,height:900,label:'tablet1024'}].filter(v=>!process.env.PROTON_HARDWARE_VIEWPORTS||process.env.PROTON_HARDWARE_VIEWPORTS.split(',').includes(v.label));
const legacyCart={'Antminer S19 Pro':1},pricedCart={'Antminer S19 Pro':1,'Antminer S21 Pro':2},requestKey='catalogue:s21-pro-245';
const checks=[],blocked=[],blockedWrites=[],localFailures=[],requests=[],runtimeErrors=[],consoleErrors=[],gestures=[],layouts=[];let browser,activePage;
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
    if(path.basename(file)==='brokerage-scene.js'){
      const source=body.toString('utf8'),needle='buildMiner:models.buildMiner';
      if(!source.includes(needle))throw Error('Review animation probe after changing the model factory.');
      body=Buffer.from(source.replace(needle,'buildMiner:(...args)=>{const model=models.buildMiner(...args);window.__testMiner=model;return model;}'));
    }
    if(path.basename(file)==='brokerage-stage.js'){
      const source=body.toString('utf8'),needle='controls.enablePan=false;';
      if(!source.includes(needle))throw Error('Review the read-only camera probe after changing stage setup.');
      body=Buffer.from(source.replace(needle,'window.__testStage={camera,controls};'+needle));
    }
    if(path.basename(file)==='checkout.js'){
      const source=body.toString('utf8'),needle=/window\.location\.href\s*=\s*'\.\/pay\.html\?ref='/;
      if(!needle.test(source))throw Error('Payment interception needs review; no payment page will be opened.');
      body=Buffer.from(source.replace(needle,"window.__testPaymentURL = './pay.html?ref='"));
    }
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:body);
  }catch(error){localFailures.push(error.message);res.writeHead(500);res.end('Local test server error.');}
});
async function check(name,fn){try{await fn();checks.push({name,pass:true});console.log('PASS '+name);}catch(error){checks.push({name,pass:false,error:error.message});if(activePage&&!activePage.isClosed())await activePage.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error;}}
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
async function motionState(page){return page.evaluate(()=>{
  const model=window.__testMiner,rotors=[],leds=[],faults=[];
  model.root.traverse(node=>{if(node.name==='fan-rotor')rotors.push(node.rotation.z);if(node.name==='status-led')leds.push(node.material.emissiveIntensity);if(node.name==='fault-led'){const color=node.material.emissive;faults.push(node.material.emissiveIntensity*Math.max(color.r,color.g,color.b));}});
  return {model:model.modelKey,rotors,leds,faults};
});}
async function cameraState(page){return page.evaluate(()=>{const s=window.__testStage,o=s.camera.position.clone().sub(s.controls.target);return {theta:Math.atan2(o.x,o.z),phi:Math.acos(o.y/o.length()),distance:o.length(),scrollY,scale:visualViewport.scale};});}
function angleDifference(a,b){return Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));}
async function canvasPoint(page){
  await page.locator('#brMinerCanvas').evaluate(el=>{const r=el.getBoundingClientRect();window.scrollBy({top:r.top-160,behavior:'instant'});});
  await page.waitForTimeout(100);const box=await page.locator('#brMinerCanvas canvas').boundingBox();
  return {x:box.x+box.width/2,y:Math.min(box.y+box.height*.62,(await page.evaluate(()=>innerHeight))-100)};
}
async function touchDrag(cdp,page,start,dx,dy,cancel=false){
  const point=(x,y)=>({x,y,id:1,radiusX:3,radiusY:3,force:1});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(start.x,start.y)]});
  for(let i=1;i<=10;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(start.x+dx*i/10,start.y+dy*i/10)]});await page.waitForTimeout(24);}
  await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await page.waitForTimeout(200);
}
async function nativePinch(cdp,page,center){
  function points(distance){return [{x:center.x-distance,y:center.y,id:1,radiusX:3,radiusY:3,force:1},{x:center.x+distance,y:center.y,id:2,radiusX:3,radiusY:3,force:1}];}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(28)});
  for(let i=1;i<=12;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(28+i*4)});await page.waitForTimeout(24);}
  // Finish beyond the inset canvas edges: a released rotation capture must
  // not leave a tracked finger behind when a native pinch ends elsewhere.
  const edgePoints=points(0),pageWidth=await page.evaluate(()=>innerWidth);edgePoints[0].x=5;edgePoints[1].x=pageWidth-5;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:edgePoints});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(250);
}
async function waitForFanMovement(page,before){
  await page.waitForFunction(angles=>{const next=[];window.__testMiner?.root.traverse(node=>{if(node.name==='fan-rotor')next.push(node.rotation.z);});return next.some((angle,i)=>Math.abs(angle-angles[i])>.001);},before.rotors,{timeout:4000});
  return motionState(page);
}
function contextOptions(viewport){return {viewport:{width:viewport.width,height:viewport.height},deviceScaleFactor:1,isMobile:viewport.width<700,hasTouch:viewport.width<700,serviceWorkers:'block'};}
async function selectedInRail(page){
  try{await page.waitForFunction(()=>{const rail=document.getElementById('brCatalogRail'),item=rail.querySelector('[aria-pressed="true"]');if(!item)return false;const a=rail.getBoundingClientRect(),b=item.getBoundingClientRect();return b.top>=a.top-2&&b.bottom<=a.bottom+2&&b.left>=a.left-2&&b.right<=a.right+2;});}
  catch(error){throw Error('Selected family is outside the rail: '+JSON.stringify(await page.evaluate(()=>{const rail=document.getElementById('brCatalogRail'),item=rail.querySelector('[aria-pressed="true"]');return {scrollTop:rail.scrollTop,rail:rail.getBoundingClientRect().toJSON(),item:item&&item.getBoundingClientRect().toJSON(),name:item&&item.textContent};})));}
}
async function browsePosition(page){
  // Position using the unpinned workspace, not the navigation's sticky box.
  await page.locator('.hw-catalog-browser').evaluate(el=>{const r=el.getBoundingClientRect(),padding=parseFloat(getComputedStyle(el).paddingTop)||0;window.scrollBy({top:r.top+padding-100,behavior:'instant'});});await page.waitForTimeout(100);
}
async function noDockOverlap(page,selector){
  await page.locator(selector).scrollIntoViewIfNeeded();await page.waitForTimeout(100);
  const overlap=await page.locator(selector).evaluate(node=>{const dock=document.getElementById('hwOrderDock');if(!dock||dock.hidden||getComputedStyle(dock).display==='none')return false;const a=node.getBoundingClientRect(),b=dock.getBoundingClientRect();return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;});
  assert.equal(overlap,false,selector+' is covered by the order dock.');
}
async function state(page){return page.evaluate(()=>({cart:Cart.get(),lines:Cart.lines(),totals:Cart.totals(),site:Facilities.chosen()&&Facilities.chosen().id,term:Prepay.chosen()&&Prepay.chosen().id}));}
async function snapshot(page,prefix){return page.evaluate(prefix=>{const details=prefix==='hw'&&document.getElementById('hwOrderDetails'),wasOpen=details&&details.open;if(details)details.open=true;const value={units:document.getElementById(prefix+'Units').textContent,hash:document.getElementById(prefix+'Hash').textContent,power:document.getElementById(prefix+'Power').textContent,cost:document.getElementById(prefix+'Cost').textContent,itemised:document.getElementById(prefix+'Itemised').innerText.replace(/\s+/g,' ').trim()};if(details)details.open=wasOpen;return value;},prefix);}
function sameAmounts(actual,expected){for(const field of ['units','hash','power','itemised']){if(['hash','power'].includes(field)&&/to confirm/i.test(expected[field]))assert.match(actual[field],/to confirm/i);else assert.equal(actual[field],expected[field],field+' differs between hardware and checkout');}assert.deepEqual(actual.cost.match(/\$[\d,]+(?:\.\d+)?/g),expected.cost.match(/\$[\d,]+(?:\.\d+)?/g));assert.equal(/quote/i.test(actual.cost),/quote/i.test(expected.cost));}
function money(value){return '$'+Math.round(value).toLocaleString('en-US');}
async function energyMatches(page){
  const summary=await page.evaluate(()=>{const row=document.querySelectorAll('#hwItemised .it-row:not(.it-row--total)')[1],text=node=>(node?.textContent||'').replace(/\s+/g,' ').trim();return {value:text(document.getElementById('hwOrderEnergyValue')),term:text(document.getElementById('hwOrderEnergyTerm')),expectedValue:text(row?.querySelector('.it-val')),expectedTerm:text(row?.querySelector('.it-sub'))};});
  assert.equal(summary.value,summary.expectedValue,'Compact energy amount must match the canonical cost breakdown.');assert.equal(summary.term,summary.expectedTerm,'Compact energy assumptions must match the canonical cost breakdown.');
}
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
  browser=await chromium.launch({headless:true,executablePath:chrome,ignoreDefaultArgs:['--hide-scrollbars'],args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
  for(const viewport of viewports){
    const context=await browser.newContext(contextOptions(viewport));await network(context,origin);await init(context);
    const page=await context.newPage();activePage=page;page.setDefaultTimeout(15000);observe(page,viewport.label);let pricedSnapshot,mixedSnapshot,unknownKey;
    await page.goto(origin+'/hardware.html?site=permian',{waitUntil:'domcontentloaded'});
    await check(viewport.label+' places a wide order strip beneath the miner browser',async()=>{
      for(const selector of ['#hwFacility','#hwPrepay','.hw-order','#hwOrder','#hwItemised'])assert.equal(await page.locator(selector).count(),1,selector+' is missing');
      for(const selector of ['#quote','#hwOrderPreview','#hwOrderText','#hwSubmit','#hwCopy','#brCatalogSlider'])assert.equal(await page.locator(selector).count(),0,selector+' should be removed');
      assert.match(await page.locator('h1').innerText(),/Choose your miners|Buy the machines/);
      assert.equal(await page.locator('#hwSiteChoice').inputValue(),'permian');assert.match(await page.locator('#hwFacility').innerText(),/Permian Basin/);assert.equal((await state(page)).site,'permian');
      await page.locator('#brMiner').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.getElementById('brMiner').classList.contains('br-scene-ready'),{},{timeout:45000});assert.equal(await page.locator('#brMinerCanvas canvas').count(),1);assert.equal(await page.locator('#brCatalogCompare').isVisible(),false);
      if(viewport.width>=1180){await page.locator('#miners').evaluate(el=>window.scrollBy({top:el.getBoundingClientRect().top-84,behavior:'instant'}));await page.screenshot({path:path.join(out,viewport.label+'-catalogue-start.png')});layouts.push({viewport:viewport.label,framing:'catalogue-start',...(await page.evaluate(()=>({model:document.getElementById('brMiner').getBoundingClientRect().toJSON(),order:document.getElementById('hwOrder').getBoundingClientRect().toJSON()})))});}
      await browsePosition(page);
      const layout=await page.evaluate(()=>{const rect=id=>document.getElementById(id).getBoundingClientRect().toJSON();return {rail:rect('brCatalogRail'),model:rect('brMiner'),order:rect('hwOrder'),browser:document.querySelector('.hw-catalog-browser').getBoundingClientRect().toJSON(),info:document.querySelector('.br-catalog-info').getBoundingClientRect().toJSON(),railScrollHeight:document.getElementById('brCatalogRail').scrollHeight,railClientHeight:document.getElementById('brCatalogRail').clientHeight,orderPosition:getComputedStyle(document.getElementById('hwOrder')).position};});
      assert(layout.rail.right<=layout.model.left+2,'Family list must be left of the rendered miner.');assert(layout.railScrollHeight>layout.railClientHeight+30,'Family list must scroll vertically.');
      assert.equal(layout.orderPosition,'static');assert(layout.order.top>=Math.max(layout.model.bottom,layout.rail.bottom,layout.info.bottom)-2,'Order must follow the complete model/list/details browser.');assert(Math.abs(layout.order.left-layout.browser.left)<=2&&Math.abs(layout.order.right-layout.browser.right)<=2,'Order strip spans the full browser width.');
      if(viewport.width>=1180){assert(layout.model.top>=68&&layout.rail.top>=68);assert(layout.order.bottom<=viewport.height-8,'Model, list and full collapsed order must fit together: '+JSON.stringify(layout));assert(layout.order.height<=220,'Collapsed desktop order should be a thin strip.');assert.equal(await page.locator('#hwOrderDock').isVisible(),false);}
      else{assert.equal(layout.orderPosition,'static');await page.waitForFunction(()=>!document.getElementById('hwOrderDock').hidden);assert(await page.locator('#hwOrderDock').isVisible());assert.match(await page.locator('#hwDockSummary').innerText(),/1/);assert.match(await page.locator('#hwDockCost').innerText(),/2,200/);}
      layouts.push({viewport:viewport.label,...layout});await noOverflow(page);await page.screenshot({path:path.join(out,viewport.label+'-workspace.png')});
      if(viewport.width>=1180){const specs=await page.evaluate(()=>{const pane=document.getElementById('hwCatalogInfoScroll').getBoundingClientRect();return Array.from(document.querySelectorAll('#brCatalogSpecs dd')).map(el=>({text:el.textContent,top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom,paneTop:pane.top,paneBottom:pane.bottom}));});assert(specs.every(value=>value.top>=value.paneTop-2&&value.bottom<=value.paneBottom+2),'Core miner ratings should be visible without scrolling the details: '+JSON.stringify(specs));}
    });
    await check(viewport.label+' compact order keeps key totals visible and expands the full cost breakdown',async()=>{
      const details=page.locator('#hwOrderDetails');assert.equal(await details.count(),1);assert.equal(await details.evaluate(el=>el.open),false);
      for(const selector of ['#hwUnits','#hwHash','#hwPower','#hwCost','#hwCheckout','#hwClear','#hwOrderEnergy'])assert(await page.locator(selector).isVisible(),selector+' stays visible outside the cost disclosure.');
      assert.match(await page.locator('#hwCost').innerText(),/2,200/);assert.match(await page.locator('#hwOrderEnergy').innerText(),/168/);await energyMatches(page);assert.equal(await page.locator('#hwItemised').isVisible(),false);
      await details.locator('summary').click();assert.equal(await details.evaluate(el=>el.open),true);assert(await page.locator('#hwItemised').isVisible());const amounts=await snapshot(page,'hw');assert.match(amounts.itemised,/Permian Basin/);assert.match(amounts.itemised,/\$168/);assert.match(amounts.itemised,/monthly/i);
      await noOverflow(page);await page.screenshot({path:path.join(out,viewport.label+'-expanded-order.png')});await details.locator('summary').click();assert.equal(await details.evaluate(el=>el.open),false);
    });
    if(viewport.width>=1180)await check(viewport.label+' choosing another miner returns its scrollable information to the top',async()=>{
      await browsePosition(page);const before=await page.evaluate(()=>BrokerageCatalogSelection.family.id);
      await page.locator('#hwCatalogInfoScroll').evaluate(el=>el.scrollTop=el.scrollHeight);assert(await page.locator('#hwCatalogInfoScroll').evaluate(el=>el.scrollTop)>0);
      await page.locator('#brCatalogNext').click();await page.waitForFunction(id=>BrokerageCatalogSelection.family.id!==id,before);await page.waitForFunction(()=>document.getElementById('hwCatalogInfoScroll').scrollTop<1);
      await page.locator('#brCatalogPrev').click();await page.waitForFunction(id=>BrokerageCatalogSelection.family.id===id,before);await noOverflow(page);
    });
    if(viewport.width>=1180)await check(viewport.label+' four known machines and the whole catalogue fit together from the catalogue heading',async()=>{
      await page.evaluate(()=>{Cart.set('Antminer S19 Pro',2);Cart.set('Antminer S21 Pro',2);});await page.locator('#miners').evaluate(el=>window.scrollBy({top:el.getBoundingClientRect().top-84,behavior:'instant'}));
      const bounds=await page.locator('#hwOrder').evaluate(el=>el.getBoundingClientRect().toJSON());assert(bounds.bottom<=viewport.height-8,'Four-machine order remains fully on screen: '+JSON.stringify(bounds));assert(bounds.height<=220);assert.equal((await page.locator('#hwUnits').innerText()).trim(),'4');assert.match(await page.locator('#hwOrderLines').innerText(),/Antminer S19 Pro/);assert.match(await page.locator('#hwOrderLines').innerText(),/Antminer S21 Pro/);await energyMatches(page);await noOverflow(page);
      layouts.push({viewport:viewport.label,framing:'catalogue-start-four-known',order:bounds});await page.screenshot({path:path.join(out,viewport.label+'-four-machine-catalogue.png')});
      await page.evaluate(()=>{history.replaceState(null,'',location.pathname+location.search);window.scrollTo({top:0,behavior:'instant'});location.hash='miners';});await page.waitForFunction(()=>{const target=document.getElementById('miners');return Math.abs(target.getBoundingClientRect().top-parseFloat(getComputedStyle(target).scrollMarginTop))<2;});
      const anchored=await page.locator('#hwOrder').evaluate(el=>el.getBoundingClientRect().toJSON());assert(anchored.bottom<=viewport.height-2,'Native catalogue anchor keeps the order visible: '+JSON.stringify(anchored));layouts.push({viewport:viewport.label,framing:'native-miners-anchor-four-known',order:anchored});await page.screenshot({path:path.join(out,viewport.label+'-native-anchor.png')});
      await page.evaluate(()=>{Cart.clear();Cart.add('Antminer S19 Pro',1);});await browsePosition(page);
    });
    if(layoutOnly){await context.close();continue;}
    await check(viewport.label+' up and down arrows are centered and browse without changing the order or page position',async()=>{
      await browsePosition(page);
      const before=await page.evaluate(()=>({family:BrokerageCatalogSelection.family.id,cart:Cart.get()}));
      for(const id of ['brCatalogPrev','brCatalogNext']){
        assert.equal(await page.locator('#'+id+' svg path').getAttribute('d'),id==='brCatalogPrev'?'M12 19V5m-7 7 7-7 7 7':'M12 5v14m-7-7 7 7 7-7','Family arrows point vertically.');
        const geometry=await page.locator('#'+id).evaluate(button=>{const r=button.getBoundingClientRect(),glyph=button.querySelector('svg,span');let g;if(glyph)g=glyph.getBoundingClientRect();else{const range=document.createRange();range.selectNodeContents(button);g=range.getBoundingClientRect();}return {width:r.width,height:r.height,dx:(g.left+g.right-r.left-r.right)/2,dy:(g.top+g.bottom-r.top-r.bottom)/2,touchAction:getComputedStyle(button).touchAction};});
        assert(geometry.width>=44&&geometry.height>=44,'Arrows must retain comfortable touch targets.');
        assert(Math.abs(geometry.dx)<=2&&Math.abs(geometry.dy)<=3,'Arrow glyph must be centered within its button.');assert.match(geometry.touchAction,/manipulation/);
      }
      const scrollBefore=await page.evaluate(()=>scrollY);await page.locator('#brCatalogNext').click();await page.waitForFunction(id=>BrokerageCatalogSelection.family.id!==id,before.family);await selectedInRail(page);
      await page.locator('#brCatalogPrev').click();await page.waitForFunction(id=>BrokerageCatalogSelection.family.id===id,before.family);await selectedInRail(page);
      assert(Math.abs((await page.evaluate(()=>scrollY))-scrollBefore)<3,'Family stepping must not scroll the page.');
      assert.deepEqual(await page.evaluate(()=>Cart.get()),before.cart);await noOverflow(page);
    });
    await check(viewport.label+' native list scrolling and keyboard/search selection stay inside the family rail',async()=>{
      await browsePosition(page);await page.locator('#brCatalogRail').evaluate(el=>el.scrollTop=0);
      const rail=await page.locator('#brCatalogRail').boundingBox(),before=await page.evaluate(()=>({scrollY,id:BrokerageCatalogSelection.family.id}));
      if(viewport.width<700){const cdp=await context.newCDPSession(page);await touchDrag(cdp,page,{x:rail.x+rail.width/2,y:Math.min(rail.y+rail.height-25,viewport.height-150)},0,-Math.min(150,rail.height*.6));await cdp.detach();}
      else{await page.mouse.move(rail.x+rail.width/2,rail.y+Math.min(rail.height/2,250));await page.mouse.wheel(0,240);await page.waitForTimeout(160);}
      assert(await page.locator('#brCatalogRail').evaluate(el=>el.scrollTop)>30,'Native input must scroll the list.');assert.equal(await page.evaluate(()=>BrokerageCatalogSelection.family.id),before.id);assert(Math.abs((await page.evaluate(()=>scrollY))-before.scrollY)<3,'Scrolling the list must not scroll the page: '+JSON.stringify({before:before.scrollY,after:await page.evaluate(()=>scrollY)}));
      await page.locator('#brCatalogRail [aria-pressed="true"]').evaluate(el=>el.focus({preventScroll:true}));
      for(const key of ['End','Home','ArrowDown','ArrowUp']){const start=await page.evaluate(()=>scrollY);await page.keyboard.press(key);await selectedInRail(page);assert(Math.abs((await page.evaluate(()=>scrollY))-start)<3,key+' must not scroll the page.');}
      await page.locator('#brCatalogSearch').scrollIntoViewIfNeeded();const start=await page.evaluate(()=>scrollY);await page.locator('#brCatalogSearch').fill('A16');await selectedInRail(page);assert.equal(await page.evaluate(()=>BrokerageCatalogSelection.family.id),'avalon-a16');assert(Math.abs((await page.evaluate(()=>scrollY))-start)<3);
      await page.locator('#brCatalogSearch').fill('');await selectedInRail(page);await page.locator('#brCatalogRail [aria-pressed="true"]').evaluate(el=>el.focus({preventScroll:true}));await page.keyboard.press('Home');await selectedInRail(page);
    });
    await check(viewport.label+' order review and clear controls remain reachable without dock overlap',async()=>{
      if(viewport.width<1180){
        await browsePosition(page);await page.waitForFunction(()=>!document.getElementById('hwOrderDock').hidden);await page.locator('#hwDockReview').click();
        await page.waitForFunction(()=>document.getElementById('hwOrderDock').hidden);assert(await page.locator('#hwOrder').isVisible());
      }else await page.locator('#hwOrder').scrollIntoViewIfNeeded();
      await noDockOverlap(page,'#hwClear');await page.locator('#hwClear').click();assert.deepEqual((await state(page)).cart,{});
      await browsePosition(page);
      if(viewport.width<1180){await page.waitForFunction(()=>!document.getElementById('hwOrderDock').hidden);assert.match(await page.locator('#hwDockSummary').innerText(),/0 miners/);assert.match(await page.locator('#hwDockCost').innerText(),/Add miners to start/);assert.equal(await page.locator('#hwDockCheckout').isVisible(),false);}
      await selectVariant(page,'110','s19-pro-110');await page.locator('#hwCatalogQuantity').fill('1');await noDockOverlap(page,'#brCatalogRequest');await page.locator('#brCatalogRequest').click();assert.deepEqual((await state(page)).cart,legacyCart);
      await browsePosition(page);
      if(viewport.width<1180){await page.waitForFunction(()=>!document.getElementById('hwOrderDock').hidden);assert.match(await page.locator('#hwDockSummary').innerText(),/1 miner/);assert.match(await page.locator('#hwDockCost').innerText(),/2,200/);assert(await page.locator('#hwDockCheckout').isVisible());}
      await page.locator('footer').evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));await page.waitForFunction(()=>document.getElementById('hwOrderDock').hidden);assert.equal(await page.locator('#hwOrderDock').isVisible(),false,'Dock must not cover the footer.');
      await selectVariant(page,'234','s21-pro-234');await page.locator('#brCatalogSearch').fill('');await browsePosition(page);await selectedInRail(page);
    });
    if(viewport.width<700){
      const cdp=await context.newCDPSession(page);
      await check(viewport.label+' successive real double taps browse two families without zooming the page',async()=>{
        await browsePosition(page);await page.locator('#brCatalogNext').scrollIntoViewIfNeeded();const box=await page.locator('#brCatalogNext').boundingBox();
        const before=await page.evaluate(()=>({id:BrokerageCatalogSelection.family.id,scale:visualViewport.scale,ids:BrokerageCatalog.families.map(f=>f.id),scrollY,results:{height:document.getElementById('brCatalogResults').offsetHeight,text:document.getElementById('brCatalogResults').textContent}}));
        await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);await page.waitForTimeout(70);const afterFirst=await page.locator('#brCatalogNext').boundingBox(),firstState=await page.evaluate(()=>({scrollY,results:{height:document.getElementById('brCatalogResults').offsetHeight,text:document.getElementById('brCatalogResults').textContent}}));await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
        const expected=before.ids[(before.ids.indexOf(before.id)+2)%before.ids.length];try{await page.waitForFunction(id=>BrokerageCatalogSelection.family.id===id,expected);}catch(error){throw Error('Double tap did not step twice: '+JSON.stringify({expected,actual:await page.evaluate(()=>BrokerageCatalogSelection.family.id),before,firstState,beforeBox:box,afterFirstBox:afterFirst,finalBox:await page.locator('#brCatalogNext').boundingBox()}));}
        const after=await page.evaluate(()=>visualViewport.scale);assert(Math.abs(after-before.scale)<.01);gestures.push({viewport:viewport.label,kind:'double-tap-next',beforeScale:before.scale,afterScale:after,family:expected});
        await selectVariant(page,'234','s21-pro-234');await page.locator('#brCatalogSearch').fill('');
      });
      await check(viewport.label+' native vertical canvas swipe scrolls without rotating the model',async()=>{
        await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);const start=await canvasPoint(page),before=await cameraState(page);
        await touchDrag(cdp,page,start,0,-170);const after=await cameraState(page);
        assert(after.scrollY-before.scrollY>40,'Vertical swipe must scroll the page.');assert(angleDifference(after.theta,before.theta)<.002&&Math.abs(after.phi-before.phi)<.002,'Vertical swipe must not rotate the miner.');
        gestures.push({viewport:viewport.label,kind:'vertical',before,after});
      });
      await check(viewport.label+' native horizontal drag rotates without scrolling and recovers after touch cancellation',async()=>{
        let start=await canvasPoint(page),before=await cameraState(page);await touchDrag(cdp,page,{x:start.x-55,y:start.y},110,0);let after=await cameraState(page);
        assert(angleDifference(after.theta,before.theta)>.03,'Horizontal drag must rotate the miner.');assert(Math.abs(after.scrollY-before.scrollY)<3,'Horizontal rotation must not scroll the page.');
        gestures.push({viewport:viewport.label,kind:'horizontal',before,after});
        start=await canvasPoint(page);await touchDrag(cdp,page,{x:start.x-40,y:start.y},80,0,true);
        start=await canvasPoint(page);before=await cameraState(page);await touchDrag(cdp,page,start,0,-150);after=await cameraState(page);
        assert(after.scrollY-before.scrollY>35,'A cancelled rotation must not trap the next vertical swipe.');assert(angleDifference(after.theta,before.theta)<.002);
        gestures.push({viewport:viewport.label,kind:'cancel-then-vertical',before,after});
      });
      await check(viewport.label+' fans keep running while a real touch rotation is held',async()=>{
        await page.emulateMedia({reducedMotion:'no-preference'});const start=await canvasPoint(page);
        const touch=(x)=>({x,y:start.y,id:1,radiusX:3,radiusY:3,force:1});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(start.x-35)]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touch(start.x+20)]});
        const before=await motionState(page);await page.waitForTimeout(240);const after=await motionState(page);
        assert(after.rotors.some((angle,i)=>Math.abs(angle-before.rotors[i])>.001),'Holding a rotation must not stop the fans.');
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.emulateMedia({reducedMotion:'reduce'});
      });
      await check(viewport.label+' native two-finger pinch preserves page zoom',async()=>{
        const start=await canvasPoint(page),before=await cameraState(page);await nativePinch(cdp,page,start);const after=await cameraState(page);
        assert(after.scale>before.scale+.1,'Page pinch zoom must remain enabled over the miner.');
        assert.doesNotMatch(await page.locator('meta[name="viewport"]').getAttribute('content'),/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\D|$)/i);
        gestures.push({viewport:viewport.label,kind:'pinch',beforeScale:before.scale,afterScale:after.scale});await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});
        const recoveryStart=await canvasPoint(page),recoveryBefore=await cameraState(page);await touchDrag(cdp,page,{x:recoveryStart.x-50,y:recoveryStart.y},100,0);
        assert(angleDifference((await cameraState(page)).theta,recoveryBefore.theta)>.03,'Rotation must work after fingers finish outside the canvas.');
        await page.emulateMedia({reducedMotion:'no-preference'});
      });
      await cdp.detach();
    }
    await check(viewport.label+' fan rotors and healthy LEDs continue after interaction, with no pause control',async()=>{
      await page.locator('#brMiner').scrollIntoViewIfNeeded();await page.waitForFunction(()=>window.__testMiner?.modelKey==='s21-pro');
      assert.equal(await page.locator('[data-br-view="play"]').count(),0);await page.locator('#brMinerCanvas canvas').press('ArrowRight');
      const before=await motionState(page);assert.equal(before.rotors.length,7);assert(before.leds.length>0);
      const after=await waitForFanMovement(page,before);
      assert(after.rotors.some((angle,i)=>Math.abs(angle-before.rotors[i])>.001),'Visible fans must turn in the actual stage loop. '+JSON.stringify(await page.evaluate(()=>({motion:document.getElementById('brMinerCanvas').dataset.motion,orbit:document.getElementById('brMinerCanvas').dataset.orbit,hidden:document.hidden,rect:document.getElementById('brMinerCanvas').getBoundingClientRect().toJSON(),scrollY,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches}))));
      const intensities=[...after.leds];for(let i=0;i<5;i++){await page.waitForTimeout(120);intensities.push(...(await motionState(page)).leds);}
      assert(intensities.every(value=>value>0),'Healthy status LEDs stay powered.');assert(Math.max(...intensities)-Math.min(...intensities)>.01,'Status LEDs show activity.');
      assert((await motionState(page)).faults.every(value=>value===0),'Red fault LEDs remain off.');
      await page.screenshot({path:path.join(out,viewport.label+'-animated-miner.png')});
      await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(80);const reduced=await motionState(page);await page.waitForTimeout(180);assert.deepEqual(await motionState(page),reduced);
      await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(150);
      await page.evaluate(()=>document.getElementById('brMiner').style.visibility='hidden');
      // IntersectionObserver is geometric: move the model completely outside the viewport.
      await page.evaluate(()=>document.getElementById('brMiner').style.transform='translateY(-100000px)');await page.waitForFunction(()=>document.getElementById('brMinerCanvas').dataset.motion==='suspended',{},{timeout:5000});
      const hidden=await motionState(page);await page.waitForTimeout(220);assert.deepEqual(await motionState(page),hidden,'Offscreen models stop animating.');
      await page.evaluate(()=>{const figure=document.getElementById('brMiner');figure.style.removeProperty('visibility');figure.style.removeProperty('transform');});
      await page.waitForFunction(()=>document.getElementById('brMinerCanvas').dataset.motion==='playing');await waitForFanMovement(page,hidden);
      await noOverflow(page);
    });
    await check(viewport.label+' adds 234 TH/s machines to an existing legacy cart and carries Bakken / 24 months',async()=>{
      await page.locator('#hwSiteChoice').selectOption('bakken');assert.equal((await state(page)).site,'bakken');assert.match(await page.locator('#hwFacility').innerText(),/Bakken/);
      await selectVariant(page,'234','s21-pro-234');await page.locator('#hwCatalogQuantity').fill('2');await page.locator('#brCatalogRequest').click();
      let s=await state(page);assert.deepEqual(s.cart,pricedCart);assert.equal(s.totals.units,3);assert.equal(s.totals.th,578);assert(Math.abs(s.totals.kw-10.27)<1e-9);assert.equal(s.totals.usd,10720);
      await browsePosition(page);
      if(viewport.width<1180){await page.waitForFunction(()=>!document.getElementById('hwOrderDock').hidden);assert.match(await page.locator('#hwDockSummary').innerText(),/3 miners/);assert.match(await page.locator('#hwDockCost').innerText(),/10,720/);assert.match(await page.locator('#hwDockCheckout').getAttribute('href'),/site=bakken/);}
      await page.locator('#hwPrepay [data-term="24m"]').click();assert.equal((await state(page)).term,'24m');assert.equal(await page.locator('#hwPrepay [data-term="24m"]').getAttribute('aria-pressed'),'true');
      pricedSnapshot=await snapshot(page,'hw');const energy=0.068*0.92*10.27*8760*2;assert(pricedSnapshot.itemised.includes(money(energy)));assert(pricedSnapshot.itemised.includes(money(10720+energy)));assert.match(pricedSnapshot.itemised,/24 months/);await energyMatches(page);await noOverflow(page);
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
      await browsePosition(page);if(viewport.width<1180){await page.waitForFunction(()=>!document.getElementById('hwOrderDock').hidden);assert.match(await page.locator('#hwDockSummary').innerText(),/6 miners/);assert.match(await page.locator('#hwDockCost').innerText(),/quote/i);}
      assert.equal(await page.locator('#hwOrderDetails').evaluate(el=>el.open),false);assert(await page.locator('#hwUnpriced').isVisible(),'Quote warning must stay outside the collapsed cost disclosure.');
      await energyMatches(page);
      assert.match(await page.locator('#hwOrderLines').innerText(),/S21 Pro.*245 TH\/s/);await page.screenshot({path:path.join(out,viewport.label+'-mixed-workspace.png')});
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
      await energyMatches(page);
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
    await check(viewport.label+' unavailable saved models remain visible and make the entire order require review',async()=>{
      await page.goto(origin+'/hardware.html',{waitUntil:'domcontentloaded'});
      await page.evaluate(()=>{Cart.add('Antminer S19 Pro',1);Cart.add('Unavailable saved test miner',2);});
      await browsePosition(page);assert.match(await page.locator('#hwOrderLines').innerText(),/Unavailable saved test miner · needs review\s*× 2/);assert.equal((await page.locator('#hwUnits').innerText()).trim(),'3');
      assert.match(await page.locator('#hwPower').innerText(),/confirm/i);assert.match(await page.locator('#hwCost').innerText(),/quote|confirm/i);assert.equal(await page.locator('#hwItemised .it-row--total').count(),0);
      if(viewport.width<1180){await page.waitForFunction(()=>!document.getElementById('hwOrderDock').hidden);assert.match(await page.locator('#hwDockSummary').innerText(),/3 miners/);assert.match(await page.locator('#hwDockCost').innerText(),/quote|confirm/i);}
      await noOverflow(page);await page.screenshot({path:path.join(out,viewport.label+'-stale-workspace.png')});
      await checkout(page,origin);const draft=await assertQuoteGate(page);assert.match(draft,/Unavailable saved test miner/);assert.match(draft,/Antminer S19 Pro/);assert.equal((await state(page)).cart['Unavailable saved test miner'],2);
    });
    await context.close();
  }
  if(!layoutOnly){
    const shortContext=await browser.newContext({viewport:{width:1024,height:600},serviceWorkers:'block'});await network(shortContext,origin);await init(shortContext);
    const shortPage=await shortContext.newPage();activePage=shortPage;observe(shortPage,'landscape1024x600');await shortPage.goto(origin+'/hardware.html?site=permian',{waitUntil:'domcontentloaded'});
    await check('short landscape keeps both family arrows inside the browsing viewport and above the order dock',async()=>{
      await browsePosition(shortPage);await shortPage.waitForFunction(()=>!document.getElementById('hwOrderDock').hidden);
      const geometry=await shortPage.evaluate(()=>{const r=id=>document.getElementById(id).getBoundingClientRect().toJSON();return {prev:r('brCatalogPrev'),next:r('brCatalogNext'),rail:r('brCatalogRail'),dock:r('hwOrderDock'),height:innerHeight};});
      assert(geometry.prev.top>=68&&geometry.next.bottom<=geometry.dock.top,'Both arrows must be visible above the dock: '+JSON.stringify(geometry));
      await shortPage.locator('#brCatalogRail [aria-pressed="true"]').evaluate(el=>el.focus({preventScroll:true}));await shortPage.keyboard.press('End');await selectedInRail(shortPage);await noOverflow(shortPage);
      layouts.push({viewport:'landscape1024x600',...geometry});await shortPage.screenshot({path:path.join(out,'landscape1024x600-workspace.png')});
    });await shortContext.close();
  }
  if(!layoutOnly){const context=await browser.newContext({viewport:{width:390,height:844},javaScriptEnabled:false,serviceWorkers:'block'});await network(context,origin);const page=await context.newPage();activePage=page;observe(page,'no-js');await page.goto(origin+'/hardware.html',{waitUntil:'domcontentloaded'});
  await check('JavaScript-disabled hardware retains a static model, order and direct email without the removed quote form',async()=>{
    const poster=page.locator('#brMiner .br-scene-poster');await poster.scrollIntoViewIfNeeded();assert(await poster.isVisible());assert.equal(await page.locator('#brMinerCanvas canvas').count(),0);assert.equal(await page.locator('.hw-order').count(),1);assert.equal(await page.locator('#quote').count(),0);assert.equal(await page.locator('#hwSubmit').count(),0);assert(await page.locator('a[href="mailto:hosting@protonminingco.com"]').count()>0);await noOverflow(page);await page.screenshot({path:path.join(out,'no-js.png')});
  });await context.close();}
  await check('all viewports have no runtime errors, failed local assets or attempted HTTP writes',async()=>{assert.deepEqual(runtimeErrors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(localFailures,[]);assert.deepEqual(blockedWrites,[]);assert(requests.every(request=>['GET','HEAD'].includes(request.method)));});
})().catch(error=>{process.exitCode=1;console.error(error.stack||error);}).finally(async()=>{
  if(browser)await browser.close();if(server.listening)await new Promise(resolve=>server.close(resolve));
  fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify({checkedAt:new Date().toISOString(),sourceRoot:root,chrome,viewports,checks,gestures,layouts,mobileInput:'Chrome isMobile/hasTouch and native CDP Input.dispatchTouchEvent; no synthetic PointerEvents',cameraProbe:'read-only test-server response injection; no production globals',blockedExternalRequests:[...new Set(blocked)],blockedWrites,runtimeErrors,consoleErrors,localFailures,requestCount:requests.length,ordersAPI:'in-memory synthetic stub only',paymentNavigationIntercepted:true,mailLinksInspectedOnly:true,syntheticStorageOnly:true,externalNetworkBlocked:true},null,2)+'\n');
  console.log('Hardware checkout browser report: '+path.join(out,'browser-report.json'));
});
