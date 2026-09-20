/* Synthetic browser records only; public services and account access are blocked. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||'../tools/.cache/hosting-terrain-browser/node_modules/playwright-core');
const {createServer}=require('../tools/preview-crm.cjs');
const A=require('../agent-control-model');
const server=createServer(),out=path.resolve(__dirname,'../reports/crm-control-center-2026-09-17');
fs.mkdirSync(out,{recursive:true});let browser,page;const checks=[];
async function check(name,fn){await fn();checks.push({name,pass:true});console.log('PASS '+name);}
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const context=await browser.newContext({viewport:{width:1440,height:1050},serviceWorkers:'block'});
  const blockedRequests=[];
  await context.route('**/*',r=>{if(r.request().url().startsWith(origin))return r.continue();blockedRequests.push(r.request().url());return r.abort();});page=await context.newPage();page.setDefaultTimeout(12000);
  const clockTime='2026-09-20T04:00:00.000Z';await page.clock.install({time:new Date(clockTime)});
  const errors=[],missing=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(origin)&&r.status()>=400)missing.push(r.url());});
  await page.goto(origin+'/crm/');
  await check('Control Center is the default first page, with honest empty widgets',async()=>{
    await page.getByRole('heading',{name:'Control Center',exact:true}).waitFor();assert.equal(await page.locator('#navigation a').first().innerText(),'Control Center');
    assert.equal(await page.locator('.cc-widget').count(),8);assert.match(await page.locator('.cc-revenue-number').innerText(),/\$0/);assert.match(await page.locator('#content').innerText(),/No cash entries this month/);
    assert.equal(await page.locator('.cc-role').count(),6);assert.equal(await page.locator('.cc-role').filter({hasText:'No open tasks'}).count(),6);
    await page.screenshot({path:path.join(out,'control-center-empty.png'),fullPage:true});
  });
  const today='2026-09-20',past='2026-01-01';let state=A.initial(),n=0;
  const apply=(type,payload)=>{state=A.reduce(state,{id:'event_'+(++n),revision:state.revision,type,payload,at:clockTime});};
  for(const [id,title,role,status] of [['review','Synthetic source review','review','review'],['block','Synthetic quote blocker','supply','blocked'],['work','Synthetic research in progress','intelligence','working'],['ready','Synthetic ready assignment','analysis','ready']]){
    apply('task.add',{id:'task_'+id,title,role,brief:'Synthetic test only',due:status==='working'?past:''});apply('task.ready',{id:'task_'+id});
    if(status==='review')apply('task.result',{id:'task_'+id,result:'Synthetic result <img src=x>',sources:['https://example.test/evidence']});
    if(status==='blocked')apply('task.block',{id:'task_'+id,reason:'Synthetic missing quote'});
    if(status==='working')apply('task.start',{id:'task_'+id});
  }
  apply('lead.save',{id:'lead_buyer',company:'Synthetic Buyer',website:'https://example.test',stage:'qualified',offer:'research',channel:'direct',signal:'Synthetic buying signal',source:'https://example.test/evidence',checked:today,contact:'buyer@example.test',buyer:'Operator',nextAction:'Prepare synthetic first step',due:past});
  apply('lead.save',{id:'lead_dnc',company:'Synthetic suppressed buyer',website:'https://blocked.example.test',stage:'dnc',offer:'research',channel:'direct',notes:'Synthetic opt-out',due:past});
  apply('deal.save',{id:'deal_proposal',name:'Synthetic proposal',stage:'proposed',offer:'research',feeCents:150000});
  apply('cash.add',{id:'cash_fee',kind:'earned',earnedConfirmed:true,cents:100000,date:today,note:'Synthetic paid work',evidence:'Synthetic test receipt'});
  apply('cash.add',{id:'cash_cost',kind:'delivery',cents:10000,date:today,note:'Synthetic cost',evidence:'Synthetic test receipt'});
  const stores={protonAgentControlLocal_v1:JSON.stringify(state),protonMiningSites:JSON.stringify({_v:1,sites:[{id:'site_synthetic',name:'Synthetic energy site',operator:'Synthetic owner',stage:'researching',energy_type:'landfill_gas',updated:clockTime}]})};
  await page.evaluate(values=>Object.entries(values).forEach(([k,v])=>localStorage.setItem(k,v)),stores);await page.reload();
  await check('widgets show actionable records and actual monthly contribution without changing data',async()=>{
    await page.getByRole('heading',{name:'Control Center',exact:true}).waitFor();assert.equal(await page.locator('.cc-revenue-number').innerText(),'$900');
    assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'),'18');
    assert.match(await page.locator('.cc-stats').innerText(),/Owner decisions\s+0/);assert.match(await page.locator('.cc-stats').innerText(),/Team reviews: 1/);assert.match(await page.locator('.cc-stats').innerText(),/Active opportunities\s+3/);
    assert.match(await page.locator('[data-action="cc-role"][data-id="review"]').innerText(),/1 in team review/);
    assert.match(await page.locator('.cc-attention').innerText(),/Synthetic source review/);assert.match(await page.locator('.cc-attention').innerText(),/Synthetic quote blocker/);
    assert(!await page.locator('[aria-labelledby=cc-leads],.cc-attention').allInnerTexts().then(t=>t.join(' ').includes('Synthetic suppressed buyer')));
    assert.deepEqual(await page.evaluate(keys=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)])),Object.keys(stores)),stores);
    assert.equal(await page.locator('#content img').count(),0);await page.screenshot({path:path.join(out,'control-center-populated.png'),fullPage:true});
  });
  await check('reported work expires in an open tab without changing a dirty form, focus, scroll or saved records',async()=>{
    const role=page.locator('[data-action="cc-role"][data-id="intelligence"]');
    assert.match(await role.getAttribute('class'),/is-working/);assert.match(await role.innerText(),/reported/i);
    assert.match(await page.locator('.cc-team-primary').innerText(),/Grok runtime.*usage.*not connected/i);
    await page.setViewportSize({width:1440,height:700});
    await page.getByRole('button',{name:'Add new',exact:true}).click();await page.getByRole('button',{name:/^Team assignment/}).click();
    await page.getByLabel('Task title',{exact:true}).fill('Keep this unsaved assignment');
    const draft=Array.from({length:40},(_,i)=>'Synthetic unsaved instruction '+i).join('\n');
    await page.getByLabel('Brief & expected result',{exact:true}).fill(draft);
    const before=await page.evaluate(()=>{
      const field=document.querySelector('#f_brief'),sheet=document.querySelector('#sheet'),role=document.querySelector('[data-action="cc-role"][data-id="intelligence"]');
      field.focus();field.setSelectionRange(12,29,'forward');field.scrollTop=90;sheet.scrollTop=60;window.scrollTo(0,180);
      window.__freshnessNodes={field,sheet,role,status:role.querySelector('.cc-role-status'),content:document.querySelector('#content')};
      return {value:field.value,title:document.querySelector('#f_title').value,start:field.selectionStart,end:field.selectionEnd,direction:field.selectionDirection,fieldScroll:field.scrollTop,sheetScroll:sheet.scrollTop,pageScroll:scrollY,counts:document.querySelector('.cc-task-counts').textContent,storage:Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)]))};
    });
    assert(before.fieldScroll>0,'exercise a scrolled draft');
    const externalBefore=blockedRequests.length;
    await page.clock.fastForward(31*60*1000);
    const after=await page.evaluate(()=>{
      const field=document.querySelector('#f_brief'),sheet=document.querySelector('#sheet'),role=document.querySelector('[data-action="cc-role"][data-id="intelligence"]'),nodes=window.__freshnessNodes;
      return {value:field.value,title:document.querySelector('#f_title').value,start:field.selectionStart,end:field.selectionEnd,direction:field.selectionDirection,fieldScroll:field.scrollTop,sheetScroll:sheet.scrollTop,pageScroll:scrollY,counts:document.querySelector('.cc-task-counts').textContent,storage:Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])),sameNodes:field===nodes.field&&sheet===nodes.sheet&&role===nodes.role&&role.querySelector('.cc-role-status')===nodes.status&&document.querySelector('#content')===nodes.content,focused:document.activeElement===field,open:sheet.open};
    });
    const {sameNodes,focused,open,...preserved}=after;assert.deepEqual(preserved,before);assert(sameNodes);assert(focused);assert(open);assert.equal(blockedRequests.length,externalBefore,'expiry must not call a provider');
    assert.doesNotMatch(await role.getAttribute('class'),/is-working/);assert.match(await role.innerText(),/Work status needs checking/);assert.match(await role.innerText(),/Last reported/);
    assert.equal(await role.evaluate(el=>getComputedStyle(el,'::before').animationName),'none');
    assert.deepEqual(await page.evaluate(keys=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)])),Object.keys(stores)),stores);
    await page.getByRole('button',{name:'Close panel',exact:true}).click();await page.setViewportSize({width:1440,height:1050});
  });
  await check('widget drill-downs reset stale filters and open the matching records',async()=>{
    await page.getByRole('button',{name:'Open buyer leads',exact:false}).click();assert.match(page.url(),/#pipeline$/);assert.match(await page.locator('#pipelineList').innerText(),/Synthetic Buyer/);assert(!await page.locator('#pipelineList').innerText().then(t=>t.includes('Synthetic energy site')));
    await page.goto(origin+'/crm/#control');await page.locator('[data-action="cc-role"][data-id="supply"]').click();assert.equal(await page.locator('#taskRole').inputValue(),'supply');
    await page.goto(origin+'/crm/#control');await page.locator('[data-action="cc-team"][data-id="review"]').click();assert.equal(await page.locator('#taskRole').inputValue(),'');assert.equal(await page.locator('#taskFilter').inputValue(),'review');assert.match(await page.locator('#content').innerText(),/Synthetic source review/);
    await page.goto(origin+'/crm/#control');await page.locator('[data-action="cc-team"][data-id="blocked"]').click();assert.equal(await page.locator('#taskFilter').inputValue(),'blocked');assert.match(await page.locator('#content').innerText(),/Synthetic quote blocker/);
    await page.goto(origin+'/crm/#control');await page.getByRole('button',{name:'Open revenue',exact:false}).click();assert.match(await page.locator('#content').innerText(),/Cash record/);
    await page.goto(origin+'/crm/#control');await page.getByRole('button',{name:/Synthetic source review/}).click();await page.getByRole('heading',{name:'Team assignment',exact:true}).waitFor();assert.match(page.url(),/#team\/task\/task_review$/);
  });
  await check('only the working role shines, and submitting its result updates another open control center',async()=>{
    const observer=await context.newPage();await observer.clock.install({time:new Date(clockTime)});await observer.goto(origin+'/crm/#control');
    const card=observer.locator('.cc-role[data-id="intelligence"]');
    await card.waitFor();assert.equal(await observer.locator('.cc-role.is-working').count(),1);
    assert.equal(await card.evaluate(el=>getComputedStyle(el,'::before').animationName),'cc-agent-sheen');
    const first=await card.evaluate(el=>getComputedStyle(el,'::before').transform);
    await observer.waitForFunction(previous=>getComputedStyle(document.querySelector('.cc-role[data-id="intelligence"]'),'::before').transform!==previous,first,{timeout:8000});
    await observer.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await card.evaluate(el=>getComputedStyle(el,'::before').animationName),'none');
    await observer.emulateMedia({reducedMotion:'no-preference'});
    await page.goto(origin+'/crm/#team/task/task_work');
    await page.getByRole('button',{name:'Submit result',exact:true}).click();
    await page.getByLabel('Result & remaining uncertainties').fill('Synthetic browser test completed; no live records or outreach.');
    await page.getByRole('button',{name:'Submit for review',exact:true}).click();
    await observer.waitForFunction(()=>document.querySelector('.cc-role[data-id="intelligence"]').textContent.includes('1 in team review'));
    assert.equal(await observer.locator('.cc-role.is-working').count(),0);
    assert.equal(await card.evaluate(el=>getComputedStyle(el,'::before').animationName),'none');
    await observer.close();
  });
  await check('desktop, tablet and small phone overview fit and retain all sections',async()=>{
    await page.goto(origin+'/crm/#control');
    for(const width of [1440,1000,800,620,390,320]){
      await page.setViewportSize({width,height:1000});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow '+width);
      assert.equal(await page.locator('.cc-widget').count(),8);assert.equal(await page.getByRole('link',{name:'Control Center',exact:true}).count(),1);
      if(width===390)await page.screenshot({path:path.join(out,'control-center-phone.png'),fullPage:true});
    }
    await page.goto(origin+'/crm/#unknown-page');await page.getByRole('heading',{name:'Control Center',exact:true}).waitFor();
  });
  await check('no runtime errors or missing packaged assets',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);});
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({checks},null,2));
})().catch(async e=>{console.error(e.stack);if(page)await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({checks,error:e.stack},null,2));process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
