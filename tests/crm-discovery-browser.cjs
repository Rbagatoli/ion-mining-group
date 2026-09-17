/* Local browser acceptance: real public catalog, no account or outreach operations. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('../tools/.cache/hosting-terrain-browser/node_modules/playwright-core');
const {createServer}=require('../tools/preview-crm.cjs');
const out=path.resolve(__dirname,'../reports/crm-discover-2026-09-17');fs.mkdirSync(out,{recursive:true});
const server=createServer(),checks=[];let browser,page;
async function check(name,fn){await fn();checks.push({name,pass:true});console.log('PASS '+name);}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());page=await context.newPage();page.setDefaultTimeout(15000);const errors=[],failures=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(origin)&&r.status()>=400)failures.push(r.url());});
 const settled=()=>page.waitForFunction(()=>document.querySelector('#discoveryList')?.getAttribute('aria-busy')==='false'&&document.querySelector('#discoveryCount')?.textContent.includes('in catalog'),{},{timeout:90000});
 const input=async(id,value)=>{await page.locator('#'+id).fill(value);await page.locator('#'+id).dispatchEvent('change');await settled();};
 const select=async(id,value)=>{await page.locator('#'+id).selectOption(value);await settled();};
 const click=async action=>page.locator('[data-discovery-action="'+action+'"]').first().click();
 await page.goto(origin+'/crm/#discover');await settled();
 await check('real platinum globe, local assets and filtered catalog markers',async()=>{await page.waitForFunction(()=>document.querySelector('#discoveryGlobe')?.dataset.globeReady==='true');assert(Number(await page.locator('#discoveryGlobe').getAttribute('data-prospect-markers'))>1000);assert.equal(await page.locator('#discoveryGlobe canvas').count(),1);await page.screenshot({path:path.join(out,'discover-desktop.png'),fullPage:true});});
 await check('location aliases, native suggestions and stable canvas through search',async()=>{
  await page.locator('#discoveryGlobe canvas').evaluate(e=>e.dataset.original='yes');await input('discoveryLocation','Texas');const count=await page.locator('#discoveryList .row').count();assert(count>0);assert((await page.locator('#discoveryList .row .sub').allTextContents()).every(t=>t.includes('Texas')));assert((await page.locator('#discoveryPlaces option').allTextContents()).length>0);await input('discoveryLocation','TX');assert.equal(await page.locator('#discoveryList .row').count(),count);assert.equal(await page.locator('#discoveryGlobe canvas').getAttribute('data-original'),'yes');
 });
 await check('multiword operator and site search finds an exact real record',async()=>{
  const c=await page.evaluate(()=>ProspectStore.all().find(c=>c.energyType==='landfill_gas'&&c.sourceDetail?.state==='TX'&&c.operator&&c.name.split(' ').length>1));await input('discoverySearch',c.name.split(' ').reverse().join(' '));assert((await page.locator('#discoveryList').innerText()).includes(c.name));
 });
 await check('combined generation, capacity and cost filters keep map and list synchronized',async()=>{
  await input('discoverySearch','');await click('generation');await settled();await click('filters');await input('discoveryMinMw','0.25');await input('discoveryMaxMw','20');await input('discoveryCash','5000000');
  const rows=await page.locator('#discoveryList .row').evaluateAll(es=>es.map(e=>e.dataset.id));assert(rows.length>0);const sourceRows=await page.evaluate(ids=>ids.map(id=>ProspectStore.get(id)),rows);assert(sourceRows.every(c=>c.existingGenerationKw>0&&c.powerPotentialKw>=250&&c.powerPotentialKw<=20000));
  await select('discoverySort','capital');const cash=(await page.locator('#discoveryList .row-end>span:first-child').allTextContents()).map(v=>Number(v.replace(/[^\d.]/g,'')));assert(cash.every((v,i)=>v<=5000000&&(!i||v>=cash[i-1])));assert(Number(await page.locator('#discoveryGlobe').getAttribute('data-prospect-markers'))>=rows.length);
 });
 await check('invalid ranges and no matches have a visible recovery action',async()=>{
  await page.locator('#discoveryMinMw').fill('30');await page.locator('#discoveryMinMw').dispatchEvent('change');await page.locator('#discoveryError').waitFor({state:'visible'});assert.match(await page.locator('#discoveryError').innerText(),/Minimum capacity/);await input('discoveryMinMw','0.25');await input('discoverySearch','NoSuchSite999ZZZ');assert.equal(await page.locator('#discoveryList .row').count(),0);assert.equal(await page.locator('#discoveryGlobe').getAttribute('data-prospect-markers'),'0');await click('clear-all');await settled();assert.equal(await page.locator('#discoveryKind').inputValue(),'all');
 });
 await check('globe and list open inline details while all three panels remain visible',async()=>{
  await select('discoveryKind','landfill_gas');const c=await page.evaluate(()=>ProspectStore.all().find(c=>c.energyType==='landfill_gas'&&c.sourceDetail?.state==='TX'&&Number.isFinite(c.lat)&&c.name.length>10));await input('discoverySearch',c.name);await click('fit');
  // A unique site centred with Fit results is selectable at the centre of its geographic view.
  await page.locator('#discoveryGlobe').scrollIntoViewIfNeeded();const b=await page.locator('#discoveryGlobe').boundingBox();await page.mouse.click(b.x+b.width/2,b.y+b.height/2);await page.locator('#discoveryDetail').waitFor({state:'visible'});assert((await page.locator('#discoveryDetailBody').innerText()).includes(c.name));assert.equal(await page.locator('#sheet').evaluate(e=>e.open),false);
  for(const name of ['.discover-map','.discover-results','.discover-detail']){const r=await page.locator(name).boundingBox();assert(r.y>=0&&r.y+r.height<=1001,name+' must fit on screen');}
  await page.screenshot({path:path.join(out,'discover-inline-overview.png'),fullPage:false});await click('collapse-detail');
  await page.locator('#discoveryList .row').first().click();assert((await page.locator('#discoveryDetailBody').innerText()).includes(c.name));await page.getByRole('button',{name:'Capital',exact:true}).click();assert.match(await page.locator('#discoveryDetailBody').innerText(),/Remaining with existing infrastructure/);assert.equal(await page.locator('#sheet').evaluate(e=>e.open),false);await page.screenshot({path:path.join(out,'discover-inline-capital.png')});await click('collapse-detail');
 });
 await check('Contacts & terms exposes the full site research inline and fits on a phone',async()=>{
  const before=await page.evaluate(()=>localStorage.getItem('protonMiningSites'));
  await click('clear-all');await settled();await select('discoveryKind','landfill_gas');await input('discoverySearch','North Dade Landfill');await page.locator('#discoveryList .row').first().click();await page.getByRole('button',{name:'Contacts & terms',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#sitePeople')?.textContent.includes('Saba Musleh')&&!document.querySelector('#sitePeople')?.textContent.includes('Checking published contacts'));
  assert.equal(await page.locator('#sheet').evaluate(e=>e.open),false);assert(await page.locator('#sitePeople .crm-person').count()>5);assert(await page.locator('#sitePeople a[href^="mailto:"]').count()>0);assert(await page.locator('#sitePeople a[href^="tel:"]').count()>0);assert.match(await page.locator('#sitePeople').innerText(),/Suggested first contact/i);
  assert.equal(await page.evaluate(()=>localStorage.getItem('protonMiningSites')),before,'viewing public contacts must not save or modify a prospect');
  await page.screenshot({path:path.join(out,'discover-contacts-terms.png')});
  await page.setViewportSize({width:320,height:900});await page.locator('#sitePeople details').evaluateAll(es=>es.forEach(e=>e.open=true));await page.locator('.crm-terms summary').click();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert(await page.locator('#discoveryDetail').evaluate(e=>e.scrollWidth<=e.clientWidth+1));assert(await page.locator('.sheet-tabs').evaluate(e=>e.scrollWidth<=e.clientWidth+1));await page.screenshot({path:path.join(out,'mobile-contacts-terms.png'),fullPage:true});
  await page.setViewportSize({width:1440,height:1000});await click('collapse-detail');
 });
 await check('MW sliders support precise inputs, an unbounded upper end and recoverable overlapping handles',async()=>{
  await click('clear-all');await settled();await select('discoveryKind','grid_facility');await input('discoveryMinMw','1');await input('discoveryMaxMw','1');const ids=await page.locator('#discoveryList .row').evaluateAll(es=>es.map(e=>e.dataset.id));assert(ids.length>0);assert(await page.evaluate(ids=>ids.every(id=>ProspectStore.get(id).powerPotentialKw===1000),ids));
  await page.locator('#discoveryMaxRange').focus();await page.keyboard.press('End');await settled();assert.equal(await page.locator('#discoveryMaxMw').inputValue(),'');assert(await page.evaluate(()=>ProspectStore.all().some(c=>c.energyType==='grid_facility'&&c.powerPotentialKw>5000)));
  await input('discoveryMaxMw','8.125');assert(Number(await page.locator('#discoveryMaxRange').getAttribute('max'))>8.125);assert.equal(await page.locator('#discoveryMaxMw').inputValue(),'8.125');
  await page.locator('#discoveryMaxRange').focus();await page.keyboard.press('Home');await settled();assert.equal(await page.locator('#discoveryMaxMw').inputValue(),'0');assert.equal(await page.locator('#discoveryMinMw').inputValue(),'');await page.keyboard.press('ArrowRight');await settled();assert.equal(await page.locator('#discoveryMaxMw').inputValue(),'0.025');
  await click('clear-all');await settled();await select('discoveryKind','landfill_gas');
  await page.locator('#discoveryRange').scrollIntoViewIfNeeded();const slider=await page.locator('#discoveryRange').boundingBox();await page.mouse.move(slider.x+slider.width-10,slider.y+13);await page.mouse.down();await page.mouse.move(slider.x+10+(slider.width-20)*.4,slider.y+13,{steps:12});await page.mouse.up();await settled();assert(Math.abs(Number(await page.locator('#discoveryMaxMw').inputValue())-2)<.051,'maximum thumb must drag to 2 MW');
  await page.mouse.move(slider.x+10,slider.y+13);await page.mouse.down();await page.mouse.move(slider.x+10+(slider.width-20)*.2,slider.y+13,{steps:12});await page.mouse.up();await settled();assert(Math.abs(Number(await page.locator('#discoveryMinMw').inputValue())-1)<.051,'minimum thumb must drag to 1 MW');
  await click('clear-all');await settled();await select('discoveryKind','landfill_gas');
  await page.locator('#discoveryList .row').first().click();await page.getByRole('button',{name:'Capital',exact:true}).click();await page.screenshot({path:path.join(out,'discover-workspace-capital.png')});await click('collapse-detail');
 });
 await check('rotation gestures do not open a site and keyboard zoom works',async()=>{
  const b=await page.locator('#discoveryGlobe').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+80,b.y+b.height/2+20,{steps:10});await page.mouse.up();assert.equal(await page.locator('#sheet').evaluate(e=>e.open),false);await page.locator('#discoveryGlobe canvas').focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');await page.keyboard.press('+');assert.equal(await page.locator('#sheet').evaluate(e=>e.open),false);
 });
 await check('phone and tablet layouts switch between sites and globe without overflow',async()=>{
  await click('clear-all');await settled();await select('discoveryKind','landfill_gas');
  for(const width of [1000,800,390,320]){await page.setViewportSize({width,height:900});const first=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,wide:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,5).map(e=>({tag:e.tagName,id:e.id,cls:e.className,width:e.getBoundingClientRect().width}))}));if(first.width>first.viewport+1)console.log('RESIZE BEFORE LAYOUT '+JSON.stringify(first));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'settled overflow '+width);await click('view-globe');await page.locator('#discoveryGlobe canvas').waitFor({state:'visible'});const box=await page.locator('#discoveryGlobe canvas').boundingBox();assert(box.width<=width&&box.height>250);if(width===390)await page.screenshot({path:path.join(out,'discover-mobile-globe.png'),fullPage:true});await click('view-sites');assert(await page.locator('#discoveryList').isVisible());if(width===390)await page.screenshot({path:path.join(out,'discover-mobile-sites.png'),fullPage:true});}
 });
 await check('navigation cleans up canvases and preserves search controls',async()=>{
  await input('discoveryLocation','Alberta');for(let i=0;i<3;i++){await page.goto(origin+'/crm/#today');assert.equal(await page.locator('#discoveryGlobe canvas').count(),0);await page.goto(origin+'/crm/#discover');await settled();await page.waitForFunction(()=>document.querySelector('#discoveryGlobe')?.dataset.globeReady==='true');assert.equal(await page.locator('#discoveryGlobe canvas').count(),1);assert.equal(await page.locator('#discoveryLocation').inputValue(),'Alberta');}
 });
 await check('WebGL failure keeps the full searchable catalog available',async()=>{
  const fallback=await browser.newContext({viewport:{width:1440,height:1000}});await fallback.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());await fallback.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/.test(type)?null:get.call(this,type,...args);};});const p=await fallback.newPage();await p.goto(origin+'/crm/#discover');await p.getByText('The globe is unavailable. You can still search every site in the list.',{exact:true}).waitFor();await p.waitForFunction(()=>document.querySelector('#discoveryList')?.getAttribute('aria-busy')==='false');assert(await p.locator('#discoveryList .row').count()>0);await fallback.close();
 });
 await check('no uncaught errors or missing local dependencies',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);});
 fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({checks},null,2));
})().catch(async e=>{console.error(e.stack);if(page)await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({checks,error:e.stack},null,2));process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
