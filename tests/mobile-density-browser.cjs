/* Read-only layout measurement against an immutable local build snapshot.
 * No remote requests, form submissions, purchases or live records. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
function browserDependency(){let dir=path.resolve(__dirname,'..');for(;;){const candidate=path.join(dir,'tools/.cache/hosting-terrain-browser/node_modules/playwright-core');if(fs.existsSync(candidate))return candidate;const parent=path.dirname(dir);if(parent===dir)return 'playwright-core';dir=parent;}}
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || browserDependency());
const phase = process.env.MOBILE_DENSITY_PHASE || 'baseline';
const root = path.resolve(__dirname, '../_site');
const out = path.resolve(__dirname, '../reports/mobile-density-20260920', phase);
fs.mkdirSync(out, { recursive: true });
const files = new Map(), hashes = {};
function snapshot(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) snapshot(file);
    else { const rel = '/' + path.relative(root, file).replaceAll('\\', '/'), bytes = fs.readFileSync(file); files.set(rel, bytes); hashes[rel] = crypto.createHash('sha256').update(bytes).digest('hex'); }
  }
}
snapshot(root);
fs.writeFileSync(path.join(out, 'asset-hashes.json'), JSON.stringify(hashes, null, 2));
console.log('IMMUTABLE ' + phase.toUpperCase() + ' SNAPSHOT CAPTURED: ' + files.size + ' files. Build may now change safely.');
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.woff2':'font/woff2', '.glb':'model/gltf-binary' };
const server = http.createServer((req, res) => {
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
  let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); if (name.endsWith('/')) name += 'index.html';
  if (!files.has(name)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', types[path.extname(name)] || 'application/octet-stream'); res.setHeader('Cache-Control', 'no-store');
  res.end(req.method === 'HEAD' ? undefined : files.get(name));
});
const pages = fs.readdirSync(path.resolve(__dirname, '../site')).filter(f => f.endsWith('.html')).sort().map(f => '/' + f);
pages.push('/portal/scouting/', '/portal/scouting/#sites');
const key = ['/index.html','/energy-sites.html','/energy.html','/hardware.html','/hosting.html','/calculator.html','/portal/scouting/#sites'];
const jobs = [...pages.flatMap(url => [390,1440].map(width => ({ url, width }))), ...key.flatMap(url => [320,430].map(width => ({ url, width })))];
const report = { phase, capturedAt: new Date().toISOString(), snapshotFiles: files.size, pages: [], interactions: [], writes: [], external: [], missing: [] };
const selector = 'main > section, main > header, .hero, .band, .sites-section, .energy-preview, #partnerExplorer, .dg-stage, .mine-builder, .hardware-showroom, .hardware-browser, .hardware-order, #yourOrder, #orderSummary, .cart-summary, .calculator, .calc-shell, .site-locator, #locator, .scouting-shell, footer';
let browser;
async function mobileInteractions(origin) {
  for (const width of [320,390]) {
    const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'});
    await context.route('**/*',route=>{const r=route.request();if(!['GET','HEAD'].includes(r.method())){report.writes.push({page:'interactions',url:r.url(),method:r.method()});return route.abort();}if(!r.url().startsWith(origin+'/'))return route.abort();return route.continue();});
    const page=await context.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
    const go=async url=>{await page.goto(origin+url,{waitUntil:'networkidle'});await page.addStyleTag({content:'.reveal{opacity:1!important;transform:none!important}*,*::before,*::after{transition-duration:0s!important;animation-duration:0s!important}'});};
    const fit=async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow');
    const check=async(name,fn)=>{try{await fn();await fit();report.interactions.push({width,name,pass:true});console.log('PASS '+width+' '+name);}catch(e){report.interactions.push({width,name,pass:false,error:e.message});await page.screenshot({path:path.join(out,'interaction-failure-'+width+'-'+report.interactions.length+'.png'),fullPage:true}).catch(()=>{});console.error('FAIL '+width+' '+name+': '+e.message);}};
    await go('/index.html');
    await check('Navigation opens and closes without obscuring its own controls',async()=>{const menu=page.locator('.nav-toggle');await menu.tap();assert.equal(await menu.getAttribute('aria-expanded'),'true');assert(await page.locator('.nav-links a').first().isVisible());await fit();await menu.tap();assert.equal(await menu.getAttribute('aria-expanded'),'false');});
    for(const url of ['/index.html','/energy-sites.html','/energy.html','/hosting.html','/calculator.html','/why-mining.html']){
      await go(url);await check(url+' mobile disclosures remain expandable',async()=>{
        const groups=page.locator('details[data-mobile-details]');let exercised=0;
        for(let i=0;i<await groups.count();i++){const group=groups.nth(i),summary=group.locator(':scope > summary');if(!await summary.isVisible())continue;const initial=await group.evaluate(e=>e.open);await summary.click();assert.equal(await group.evaluate(e=>e.open),!initial);await fit();await summary.click();assert.equal(await group.evaluate(e=>e.open),initial);exercised++;}
        assert(exercised>0,'No mobile disclosures exercised');
      });
    }
    await go('/energy-sites.html#workspace');
    await check('Including a source opens preferences and preserves the brief without sending',async()=>{
      await page.locator('#ss-name').fill('Synthetic layout visitor');await page.locator('#ss-power').fill('160');
      await page.locator('#ep-source').selectOption('hydro');await page.locator('[data-preview-tab="capital"]').click();assert.match(await page.locator('#ep-panel').innerText(),/Existing assets/);
      await page.locator('[data-preview-tab="contacts"]').click();assert.match(await page.locator('#ep-panel').innerText(),/Plant owner/);
      await page.locator('[data-preview-add]').click();assert(await page.locator('#ss-source-hydro').isChecked());assert(await page.locator('#ss-source-hydro').isVisible());
      assert.equal(await page.locator('#ss-source-hydro').evaluate(e=>e.closest('details').open),true);assert.equal(await page.locator('#ss-name').inputValue(),'Synthetic layout visitor');assert.equal(await page.locator('#ss-power').inputValue(),'160');assert(await page.locator('[data-intake-submit]').isDisabled());
    });
    await check('Service modes reveal the exact relevant fields and invalid collapsed fields reopen',async()=>{
      await page.locator('#ss-service').selectOption('site_review');assert(await page.locator('#ss-site').isVisible());assert.equal(await page.locator('#ss-site').evaluate(e=>e.required),true);assert(await page.locator('#ss-known').isDisabled());
      await page.locator('#ss-service').selectOption('site_submission');assert(await page.locator('#ss-authority').isVisible());await page.locator('#ss-service').selectOption('custom_search');assert(await page.locator('#ss-site').isDisabled());assert(!(await page.locator('#ss-known').isDisabled()));
      const validation=await page.locator('#ss-budget').evaluate(el=>{const d=el.closest('details');d.open=false;el.value='-1';return {valid:el.reportValidity(),open:d.open};});assert.equal(validation.valid,false);assert.equal(validation.open,true);assert(await page.locator('#ss-budget').isVisible());await page.locator('#ss-budget').fill('');
      await page.screenshot({path:path.join(out,'energy-form-expanded-'+width+'.png'),fullPage:true});
      await page.locator('#siteSearchForm').screenshot({path:path.join(out,'energy-form-detail-'+width+'.png')});
    });
    await go('/hardware.html?site=permian');
    await check('Miner browsing, populated order and local checkout stay accessible',async()=>{
      const first=await page.locator('#brCatalogName').innerText();await page.locator('#hwCatalogQuantity').fill('2');await page.locator('#brCatalogRequest').click();assert.equal((await page.locator('#hwUnits').innerText()).trim(),'2');
      await page.locator('#brCatalogNext').tap();assert.notEqual(await page.locator('#brCatalogName').innerText(),first);await page.locator('#hwCatalogQuantity').fill('1');await page.locator('#brCatalogRequest').click();assert.equal((await page.locator('#hwUnits').innerText()).trim(),'3');assert.equal(await page.locator('#hwOrderLines li').count(),2);
      await page.locator('#brCatalogPrev').tap();assert.equal(await page.locator('#brCatalogName').innerText(),first);assert.equal(await page.evaluate(()=>visualViewport.scale),1);
      assert.equal(await page.locator('.pp-tier--pick').count(),3);const term=page.locator('.pp-tier--pick').first(),termId=await term.getAttribute('data-term');
      assert.match(await term.innerText(),/up front/);await term.click();assert.equal(await page.locator('.pp-tier--pick[data-term="'+termId+'"]').getAttribute('aria-pressed'),'true');assert(await page.locator('.pp-clear').isVisible());await fit();
      await page.screenshot({path:path.join(out,'hardware-prepaid-selected-'+width+'.png'),fullPage:true});await page.locator('#hwPrepay').screenshot({path:path.join(out,'hardware-prepaid-detail-'+width+'.png')});await page.locator('.pp-clear').click();assert.equal(await page.locator('.pp-tier--pick[aria-pressed="true"]').count(),0);assert.equal(await page.locator('.pp-clear').count(),0);
      await page.locator('#hwOrderDetails > summary').click();assert.equal(await page.locator('#hwOrderDetails').evaluate(e=>e.open),true);await fit();await page.locator('#hwOrder').scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(out,'hardware-populated-'+width+'.png'),fullPage:true});
      await page.locator('#hwOrder').screenshot({path:path.join(out,'hardware-order-detail-'+width+'.png')});await page.locator('#miners').screenshot({path:path.join(out,'hardware-miners-detail-'+width+'.png')});
      await page.locator('#hwCheckout').click();await page.waitForURL('**/cart.html*');await page.locator('#ckBody').waitFor({state:'visible'});assert.match(await page.locator('#ckLines').innerText(),/S21|Antminer/);assert.equal((await page.locator('#ckUnits').innerText()).trim(),'3');await fit();await page.screenshot({path:path.join(out,'cart-populated-'+width+'.png'),fullPage:true});
    });
    await go('/energy.html#the-pad');
    await check('Expanded mine builder retains working sizing and assumptions',async()=>{
      await page.locator('[data-fuel="landfill"] [data-mb-end="hi"]').click();assert(await page.locator('#mb-builder').isVisible());
      await page.locator('#mb-powerMW').fill('2');await page.locator('#mb-powerMW').press('Tab');assert.equal(await page.locator('#mb-power-slider').inputValue(),'2');
      await page.locator('#mb-assumptions > summary').click();assert(await page.locator('#mb-infrastructureCost').isVisible());await page.locator('#mb-infrastructureCost').fill('100000');await page.locator('#mb-infrastructureCost').press('Tab');assert(await page.locator('#mb-error').isHidden());await fit();await page.screenshot({path:path.join(out,'mine-builder-expanded-'+width+'.png'),fullPage:true});
    });
    await go('/portal/scouting/#sites');
    await check('Expanded client locator zooms, selects and returns to the page',async()=>{
      await page.locator('[data-locator-expand]').click();assert(await page.locator('#siteLocatorDialog').isVisible());
      const before=await page.locator('.sl-map-stage .sl-state-PA').getAttribute('d');await page.locator('[data-locator-zoom="in"]').click();assert.notEqual(await page.locator('.sl-map-stage .sl-state-PA').getAttribute('d'),before);
      await page.locator('.sl-choice').nth(1).click();assert.equal(await page.locator('.sl-choice').nth(1).getAttribute('aria-pressed'),'true');await fit();await page.screenshot({path:path.join(out,'locator-expanded-'+width+'.png'),fullPage:true});
      await page.locator('[data-locator-close]').click();assert(await page.locator('#siteLocatorDialog').isHidden());
    });
    if(errors.length)report.interactions.push({width,name:'No runtime errors',pass:false,errors});
    await context.close();fs.writeFileSync(path.join(out,'measurements.json'),JSON.stringify(report,null,2));
  }
}
async function measure(job, origin) {
  const context = await browser.newContext({ viewport: { width: job.width, height: job.width < 700 ? 844 : 1000 }, deviceScaleFactor: 1, isMobile: job.width < 700, hasTouch: job.width < 700, reducedMotion:'reduce', serviceWorkers:'block' });
  await context.route('**/*', route => {
    const r = route.request();
    if (!['GET','HEAD'].includes(r.method())) { report.writes.push({ page: job.url, url:r.url(), method:r.method() }); return route.abort(); }
    if (!r.url().startsWith(origin + '/')) { report.external.push({page:job.url,url:r.url()}); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage(), errors = [], missing = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(origin)) missing.push(r.url().replace(origin,'')); });
  page.setDefaultTimeout(12000);
  try {
    await page.goto(origin + job.url, { waitUntil:'networkidle', timeout:30000 });
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: '.reveal{opacity:1!important;transform:none!important}*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}' });
    await page.evaluate(() => { window.scrollTo(0, document.documentElement.scrollHeight); });
    await page.waitForTimeout(180); await page.evaluate(() => window.scrollTo(0,0)); await page.waitForTimeout(180);
    const result = await page.evaluate(selector => {
      function label(el) { return (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '')); }
      function rect(el) { const r=el.getBoundingClientRect();return {tag:label(el),top:Math.round(r.top+scrollY),left:Math.round(r.left),width:Math.round(r.width),height:Math.round(r.height),heading:(el.querySelector('h1,h2,h3')?.innerText||'').replace(/\s+/g,' ').slice(0,110)}; }
      const visible = el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0 && getComputedStyle(el).visibility !== 'hidden';
      const texts = [...document.querySelectorAll('h1,h2,h3,p,li,label,button,summary')].filter(visible).map(e=>e.innerText.trim()).filter(Boolean);
      return {viewport:innerWidth,height:document.documentElement.scrollHeight,width:document.documentElement.scrollWidth,title:document.title,h1:document.querySelector('h1')?.innerText||'', sections:[...document.querySelectorAll(selector)].filter(visible).map(rect),overflow:[...document.body.querySelectorAll('*')].filter(visible).filter(el=>{const r=el.getBoundingClientRect();return r.right>innerWidth+2||r.left< -2;}).slice(0,30).map(rect),details:[...document.querySelectorAll('details')].map(e=>({summary:e.querySelector('summary')?.innerText,open:e.open})),text:texts.join('\n'),controls:[...document.querySelectorAll('input,select,button,a.btn,summary')].filter(visible).map(rect)};
    }, selector);
    result.url=job.url; result.requestedWidth=job.width; result.errors=errors; result.missing=missing;
    result.textHash=crypto.createHash('sha256').update(result.text).digest('hex');
    const name=job.url.replace(/^\//,'').replace(/[^a-z0-9]+/gi,'-').replace(/-$/,'')||'index';
    if (job.width===390 || key.includes(job.url)) {
      await page.screenshot({path:path.join(out,name+'-'+job.width+'.png'),fullPage:job.width===390,animations:'disabled',timeout:30000});
    }
    report.pages.push(result); report.missing.push(...missing.map(url=>({page:job.url,url})));
    fs.writeFileSync(path.join(out,'measurements.json'),JSON.stringify(report,null,2));
    console.log(phase+' '+job.width+' '+job.url+' height='+result.height+' overflow='+(result.width-result.viewport)+' errors='+errors.length);
  } catch (e) { report.pages.push({...job,failure:e.stack,errors,missing});console.error('FAIL '+job.url+' '+job.width+' '+e.message); }
  finally { await context.close(); }
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  let index=0;const selectedJobs=phase==='interactions'?[]:jobs;await Promise.all([0,1].map(async()=>{while(index<selectedJobs.length){const job=selectedJobs[index++];await measure(job,origin);}}));
  report.pages.sort((a,b)=>a.url.localeCompare(b.url)||(a.requestedWidth||a.width)-(b.requestedWidth||b.width));
  fs.writeFileSync(path.join(out,'measurements.json'),JSON.stringify(report,null,2));
  const baselinePath=path.resolve(out,'../baseline/measurements.json');
  if(phase!=='baseline'&&report.pages.length&&fs.existsSync(baselinePath)){
    const baseline=JSON.parse(fs.readFileSync(baselinePath,'utf8'));
    const comparisons=report.pages.map(current=>{const before=baseline.pages.find(p=>p.url===current.url&&p.requestedWidth===current.requestedWidth);return {url:current.url,width:current.requestedWidth,before:before?.height,after:current.height,change:before?current.height-before.height:null,reductionPercent:before?+(100*(before.height-current.height)/before.height).toFixed(1):null,desktopTextEqual:current.requestedWidth===1440?before?.textHash===current.textHash:undefined,overflow:current.width-current.viewport,errors:current.errors,failure:current.failure};});
    fs.writeFileSync(path.join(out,'comparison.json'),JSON.stringify(comparisons,null,2));
  }
  if(phase!=='baseline')await mobileInteractions(origin);
  assert(!report.pages.some(p=>p.failure),'Measurement failures');assert(!report.pages.some(p=>p.width>p.viewport+1),'Horizontal page overflow');assert(!report.pages.some(p=>p.errors.length),'Runtime errors');assert(!report.missing.length,'Missing local assets');assert(!report.interactions.some(p=>!p.pass),'Interaction failures');assert(!report.writes.length,'Unexpected writes blocked');console.log('COMPLETE '+phase+': '+report.pages.length+' viewport checks; '+report.interactions.length+' interaction checks; no HTTP writes.');
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{fs.writeFileSync(path.join(out,'measurements.json'),JSON.stringify(report,null,2));await browser?.close();server.close();});
