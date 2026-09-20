/* Synthetic packaged-release navigation. No account, provider or customer data. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||'C:/Users/rbaga/ion-mining-group/tools/.cache/hosting-terrain-browser/node_modules/playwright-core');
const ROOT=path.resolve(__dirname,'..'),out=path.join(ROOT,'tools/.cache/crm-release-browser'),reports=path.join(ROOT,'reports/crm-sync-diagnostics-20260920');
require('../tools/build-crm.cjs').build(out);fs.mkdirSync(reports,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(out,'release.json'),'utf8')),currentHtml=fs.readFileSync(path.join(out,'index.html'),'utf8'),old='a'.repeat(64);
let published=false,corrupt=false,navigations=0,browser,page,origin;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(!pathname.startsWith('/crm/')){res.writeHead(404);return res.end();}
 let rel=pathname.slice(5)||'index.html';if(rel.includes('..')){res.writeHead(404);return res.end();}
 const file=path.join(out,rel);if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
 if(rel==='index.html'){if(req.headers['sec-fetch-dest']==='document')navigations++;return res.end(published?currentHtml:currentHtml.replace(manifest.version,old));}
 if(rel==='release.json')return res.end(JSON.stringify(published?manifest:{...manifest,version:old}));
 if(corrupt&&rel==='crm.css')return res.end('/* synthetic deployment still copying */');
 fs.createReadStream(file).pipe(res);
});
const A=require('../agent-control-model');let state=A.initial();
for(let i=0;i<30;i++)state=A.reduce(state,{id:'fixture_'+i,revision:state.revision,at:'2026-09-20T17:00:00Z',type:'lead.save',payload:{id:'fixture_lead_'+i,company:'Synthetic energy prospect '+i,website:'https://fixture-'+i+'.example.test',offer:'custom_search',channel:'direct',stage:'discovered',nextAction:'Verify the published contact route.'}});
const raw=JSON.stringify(state),report={checks:[],errors:[],missing:[]};
async function check(name,fn){await fn();report.checks.push(name);console.log('PASS '+name);}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block',reducedMotion:'reduce'});
 await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 await context.addInitScript(({raw})=>{
  if(!localStorage.getItem('protonAgentControlLocal_v1'))localStorage.setItem('protonAgentControlLocal_v1',raw);
  const test=window.__releaseFixture={hold:false,handle:null,clockOffset:0};let api,data;
  Object.defineProperty(window,'ProtonCrmRelease',{configurable:true,get:()=>api,set(value){api=value;const start=value.start;value.start=(options,env={})=>test.handle=start(options,{...env,now:()=>Date.now()+test.clockOffset});}});
  Object.defineProperty(window,'ProtonCrmData',{configurable:true,get:()=>data,set(value){data=value;const create=value.create;value.create=(...args)=>{const d=create(...args),safety=d.reloadSafety;d.reloadSafety=()=>test.hold?{safe:false,reasons:['synthetic-unconfirmed-save']}:safety();return d;};}});
 },{raw});
 page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(origin)&&r.status()>=400)report.missing.push(r.url());});
 await page.goto(origin+'/crm/#pipeline');await page.getByRole('heading',{name:'Your pipeline.',exact:true}).waitFor();await page.waitForFunction(()=>__releaseFixture.handle?.status.phase==='current');
 await check('An available update leaves an open draft intact and shows one notice',async()=>{
  await page.getByRole('button',{name:'Add new',exact:true}).click();await page.locator('[data-action="new-lead"]').click();await page.locator('#f_company').fill('Synthetic unsaved draft must stay here');
  published=true;await page.evaluate(()=>__releaseFixture.handle.check(true));
  assert.equal(navigations,1);assert.equal(await page.locator('#f_company').inputValue(),'Synthetic unsaved draft must stay here');assert.equal(await page.locator('#crmUpdateNotice').count(),1);
  await page.evaluate(()=>__releaseFixture.handle.check(true));assert.equal(await page.locator('#crmUpdateNotice').count(),1);assert.equal(navigations,1);
 });
 await check('A retained unconfirmed save prevents navigation even after the form is closed',async()=>{
  await page.evaluate(()=>__releaseFixture.hold=true);await page.getByRole('button',{name:'Close panel',exact:true}).click();await page.evaluate(()=>__releaseFixture.handle.check(true));assert.equal(navigations,1);assert.equal(await page.evaluate(()=>localStorage.getItem('protonAgentControlLocal_v1')),raw);
 });
 await check('A mixed deployment cannot activate',async()=>{
  await page.evaluate(()=>{__releaseFixture.hold=false;__releaseFixture.clockOffset+=20000;});corrupt=true;await page.evaluate(()=>__releaseFixture.handle.check(true));assert.equal(navigations,1);assert.match(await page.evaluate(()=>__releaseFixture.handle.status.lastError),/assets do not match/);
 });
 await check('A coherent update reloads automatically and restores route, account scope and scroll',async()=>{
  corrupt=false;await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,1250);});const y=await page.evaluate(()=>scrollY);assert(y>1000);
  await page.evaluate(()=>{__releaseFixture.handle.check(true);});await page.waitForFunction(version=>document.querySelector('meta[name="proton-crm-release"]').content===version,manifest.version);
  await page.getByRole('heading',{name:'Your pipeline.',exact:true}).waitFor();await page.waitForFunction(y=>Math.abs(scrollY-y)<5,y);
  assert.equal(navigations,2);assert.equal(new URL(page.url()).hash,'#pipeline');assert.equal(await page.locator('#connectionLabel').innerText(),'On this device');assert.equal(await page.evaluate(()=>localStorage.getItem('protonAgentControlLocal_v1')),raw);
  assert.equal(await page.locator('#crmUpdateNotice').count(),0);await page.evaluate(()=>__releaseFixture.handle.check(true));assert.equal(navigations,2);
  await page.screenshot({path:path.join(reports,'automatic-update-restored.png')});
 });
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.missing,[]);report.passed=true;
})().catch(async e=>{report.failure=e.stack;console.error(e);process.exitCode=1;if(page)await page.screenshot({path:path.join(reports,'automatic-update-failure.png')});}).finally(async()=>{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));fs.writeFileSync(path.join(reports,'automatic-update-browser.json'),JSON.stringify(report,null,2));});
