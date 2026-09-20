/* Fresh local browser only: exercise real catalog role filters without account or external traffic. */
'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('../tools/.cache/hosting-terrain-browser/node_modules/playwright-core');
const {createServer}=require('../tools/preview-crm.cjs');
const server=createServer();let browser;
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(20000);
 const settled=()=>page.waitForFunction(()=>document.querySelector('#discoveryList')?.getAttribute('aria-busy')==='false'&&document.querySelector('#discoveryCount')?.textContent.includes('in catalog'),{},{timeout:90000});
 const scope=async value=>{await page.getByLabel('Energy site role',{exact:true}).selectOption(value);await settled();};
 const search=async value=>{await page.locator('#discoverySearch').fill(value);await page.locator('#discoverySearch').dispatchEvent('change');await settled();};
 await page.goto(origin+'/crm/#discover');await settled();
 assert.equal(await page.locator('#discoverySupplyScope').inputValue(),'supply');
 assert.equal(await page.locator('#discoveryKind').inputValue(),'specialty');
 assert.equal(await page.getByRole('heading',{name:'Find energy supply sites.',exact:true}).count(),1);
 const initial=await page.locator('.discover-site').evaluateAll(rows=>rows.map(row=>row.dataset.id));assert(initial.length>0);
 assert(await page.evaluate(ids=>ids.every(id=>['producers','resources'].includes(ProtonDiscoveryModel.energyRole(ProspectStore.get(id)).id)),initial));
 assert(await page.evaluate(ids=>ids.every(id=>{const c=ProspectStore.get(id),match=ProtonCrmEnergyScouting.candidate(c,null);return [c.energyType,...match.energyTypes].some(type=>['landfill_gas','flare_gas'].includes(type));}),initial));
 assert.match(await page.locator('#discoveryFocusNote').innerText(),/does not qualify it or assign agent work/);
 assert.match(await page.locator('#discoverySupplyNote').innerText(),/Available client energy.*confirmation/);
 for(const source of ['landfill_gas','flare_gas','hydro','nuclear','coal','natural_gas','solar','wind']){await page.getByLabel('Source / research focus',{exact:true}).selectOption(source);await settled();assert(await page.locator('.discover-site').count()>0,'energy type accessible in default supply view: '+source);}
 await page.getByLabel('Source / research focus',{exact:true}).selectOption('all');await settled();
 const hospital=await page.evaluate(()=>ProspectStore.all().find(c=>/Kaweah Delta/i.test(c.name))?.name);assert(hospital,'real on-site generation fixture');
 await search(hospital);assert.equal(await page.locator('.discover-site').count(),0);
 await scope('onsite');assert(await page.locator('.discover-site').count()>0);assert.match(await page.locator('#discoveryList').innerText(),/On-site generation/);
 assert.match(await page.locator('#discoverySupplyNote').innerText(),/surplus.*unconfirmed/);
 await search('');await scope('storage');assert(await page.locator('.discover-site').count()>0);assert.match(await page.locator('#discoverySupplyNote').innerText(),/charging supply/);assert.doesNotMatch(await page.locator('#discoveryList').innerText(),/Generation reported/);
 await page.locator('[data-discovery-action="generation"]').click();await settled();assert.equal(await page.locator('.discover-site').count(),0);await page.locator('[data-discovery-action="generation"]').click();await settled();
 await page.getByRole('button',{name:'Client search brief',exact:true}).click();await page.getByLabel('Client or internal sample',{exact:true}).fill('Synthetic storage request');await page.getByLabel('Brief reference and version',{exact:true}).fill('storage-test-v1');await page.getByLabel('Allowed sources · none selected means any',{exact:true}).selectOption(['storage']);await page.getByLabel('Minimum client load · MW',{exact:true}).fill('1');await page.getByRole('button',{name:'Apply client brief',exact:true}).click();await page.locator('#sheet').waitFor({state:'hidden'});await settled();
 assert(await page.locator('.discover-site').count()>0);assert.match(await page.locator('#discoveryList').innerText(),/Allocation unknown/);assert.match(await page.locator('#discoveryBrief').innerText(),/selected Energy site role/);
 await scope('producers');assert.equal(await page.locator('#discoverySupplyScope').inputValue(),'producers');assert(await page.locator('.discover-site').evaluateAll(rows=>rows.every(row=>row.textContent.includes('Operating power producer'))),'a client brief must preserve the explicitly selected role');await scope('storage');assert(await page.locator('.discover-site').count()>0);
 await page.locator('[data-discovery-action="clear-brief"]').click();await settled();
 await scope('resources');assert(await page.locator('.discover-site').count()>0);assert.match(await page.locator('#discoverySupplyNote').innerText(),/not ready power offers/);
 await scope('all');
 const inactive=await page.evaluate(()=>ProspectStore.all().find(c=>c.energyType==='grid_facility'&&c.sourceDetail?.statusCapacityMw&&!(Number(c.sourceDetail.statusCapacityMw.OP)>0))?.name);assert(inactive);
 await search(inactive);assert(await page.locator('.discover-site').count()>0);
 await page.goto(origin+'/crm/#today');await page.goto(origin+'/crm/#discover');await settled();assert.equal(await page.locator('#discoverySupplyScope').inputValue(),'all');
 await page.locator('[data-discovery-action="clear-all"]').first().click();await settled();assert.equal(await page.locator('#discoverySupplyScope').inputValue(),'supply');assert.equal(await page.locator('#discoveryKind').inputValue(),'specialty');
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page overflow '+width);assert(await page.locator('.discover-supply').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'role control overflow '+width);}
 assert.deepEqual(errors,[]);console.log('PASS producer and fuel default across energy types, self-generation separation, storage/fuel/all research access, navigation/reset and mobile layout; no page errors.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
