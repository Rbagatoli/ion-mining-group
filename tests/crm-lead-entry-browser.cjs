/* Fresh local synthetic CRM only. External requests and service workers are blocked. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('../tools/.cache/hosting-terrain-browser/node_modules/playwright-core');
const root=path.resolve(process.env.PROTON_CRM_TEST_ROOT||path.resolve(__dirname,'..'));
const {createServer}=require(path.join(root,'tools/preview-crm.cjs'));
const server=createServer(),checks=[];
let browser,page;
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function saved(){return page.evaluate(()=>JSON.parse(localStorage.getItem('protonAgentControlLocal_v1')));}
async function formValues(){return page.locator('#editForm').evaluate(el=>Object.fromEntries(new FormData(el)));}
async function newLead(){await page.getByRole('button',{name:'Add new',exact:true}).click();await page.locator('[data-action="new-lead"]').click();}
async function fillPrepared(value){await page.locator('#preparedLeadPanel').evaluate(el=>{el.open=true;});await page.locator('#preparedLeadJson').fill(typeof value==='string'?value:JSON.stringify(value));await page.locator('#applyPreparedLead').click();}
async function saveLead(){await page.getByRole('button',{name:'Save lead',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#editForm button[type="submit"]:disabled'));}
async function edit(id){await page.goto(origin+'/crm/#pipeline/lead/'+id);await page.locator('[data-action="edit-lead"][data-id="'+id+'"]').click();}
let origin;
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const context=await browser.newContext({viewport:{width:1280,height:1000},serviceWorkers:'block'});
  // Expose the real local data instance for controlled account/revision fault injection in tests.
  const hook='const originalCreate=ProtonCrmData.create;ProtonCrmData.create=function(){const data=originalCreate();window.__leadTestData=data;const status=data.status;data.status=()=>{const actual=status();return window.__leadTestAccountChange?{...actual,epoch:actual.epoch+1}:actual;};return data;};\n';
  await context.route('**/*',route=>{
    const url=route.request().url();
    if(!url.startsWith(origin+'/'))return route.abort();
    if(new URL(url).pathname==='/crm/crm.js')return route.fulfill({contentType:'application/javascript',body:hook+fs.readFileSync(path.join(root,'crm/crm.js'),'utf8')});
    return route.continue();
  });
  page=await context.newPage();page.setDefaultTimeout(12000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/crm/');await page.getByRole('heading',{name:'Control Center',exact:true}).waitFor();
  const today=await page.evaluate(()=>CrmFollowups.today());
  const candidate={company:'Synthetic ASIC buyer',website:'https://synthetic-buyer.example.test',offer:'sourcing',stage:'discovered',signal:'Public equipment expansion; model and quantity unconfirmed.',source:'https://synthetic-buyer.example.test/news',checked:today,buyer:'Procurement',contact:'procurement@example.test',channel:'direct',serviceFit:'Compare new and used ASIC availability.',nextAction:'Verify model and quantity; HOLD outreach.',due:today,notes:'Synthetic only.\nOriginal research evidence; do not contact.'};
  let id;
  await check('new lead requires explicit service; prepared fields do not save automatically',async()=>{
    await newLead();assert.equal(await page.locator('#f_offer').inputValue(),'');assert.equal(await page.locator('#f_offer').getAttribute('required'),'');
    const before=await saved();await fillPrepared(candidate);
    assert.equal(await page.locator('#f_offer').inputValue(),'sourcing');
    const values=await formValues();for(const [key,value] of Object.entries(candidate))assert.equal(values[key],value,key);
    assert(!Object.hasOwn(values,'preparedLeadJson'));assert.deepEqual(await saved(),before);
    assert.match(await page.locator('#preparedLeadStatus').innerText(),/Nothing has been saved/);
    await saveLead();await page.locator('#sheet').waitFor({state:'hidden'});
    const state=await saved();assert.equal(state.leads.length,1);id=state.leads[0].id;
    for(const [key,value] of Object.entries(candidate))assert.equal(state.leads[0][key],key==='website'?new URL(value).href:value,key);
    assert(!Object.hasOwn(state.leads[0],'preparedLeadJson'));
  });
  await check('invalid prepared input cannot partially change fields or save records',async()=>{
    await edit(id);const values=await formValues(),before=await saved();
    for(const value of ['not json',{company:'Changed',offer:'unknown'},{company:'Changed',id:'forbidden'},{notes:'Changed',checked:'2026-02-30'},{notes:'Changed',nextAction:'Email buyer\nRequest specs'},{notes:'Changed',due:'0000-01-01'}]){
      await fillPrepared(value);assert.equal(await page.locator('#sheetError').isVisible(),true);assert.deepEqual(await formValues(),values);assert.deepEqual(await saved(),before);
    }
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
  });
  await check('partial edits retain source, contact, notes and service',async()=>{
    await edit(id);await fillPrepared({nextAction:'Check supplier evidence; keep outreach paused.'});await saveLead();await page.locator('#sheet').waitFor({state:'hidden'});
    const lead=(await saved()).leads[0];assert.equal(lead.nextAction,'Check supplier evidence; keep outreach paused.');
    for(const key of ['offer','source','checked','contact','notes'])assert.equal(lead[key],candidate[key]);
  });
  await check('prepared stage changes still require qualification and actual contact evidence',async()=>{
    await edit(id);const before=await saved();await fillPrepared({stage:'qualified',serviceFit:''});await saveLead();assert.match(await page.locator('#sheetError').innerText(),/Qualification/);assert.deepEqual(await saved(),before);
    await fillPrepared({stage:'contacted',serviceFit:candidate.serviceFit});await saveLead();assert.match(await page.locator('#sheetError').innerText(),/actual contact/);assert.deepEqual(await saved(),before);
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
  });
  await check('account changes reject both prepared filling and stale form saves',async()=>{
    await edit(id);const values=await formValues(),before=await saved();await page.evaluate(()=>{window.__leadTestAccountChange=true;});
    await fillPrepared({notes:'Wrong account data'});assert.match(await page.locator('#sheetError').innerText(),/account changed/i);assert.deepEqual(await formValues(),values);
    await saveLead();assert.match(await page.locator('#sheetError').innerText(),/account changed/i);assert.deepEqual(await saved(),before);
    await page.evaluate(()=>{window.__leadTestAccountChange=false;});await page.getByRole('button',{name:'Cancel',exact:true}).click();
  });
  await check('existing model refuses stale revisions after another local write',async()=>{
    await edit(id);await fillPrepared({notes:'Stale edit must not win'});
    await page.evaluate(async()=>{const d=window.__leadTestData,state=d.agent();await d.dispatch('lead.save',{...state.leads[0],notes:'Newer independent synthetic edit'},state.revision);});
    const before=await saved();await saveLead();assert.match(await page.locator('#sheetError').innerText(),/board changed/i);assert.deepEqual(await saved(),before);
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
  });
  await check('existing model keeps do-not-contact records suppressed',async()=>{
    await edit(id);await fillPrepared({stage:'dnc',notes:'Synthetic do-not-contact request'});await saveLead();await page.locator('#sheet').waitFor({state:'hidden'});
    await edit(id);const before=await saved();await fillPrepared({stage:'discovered'});await saveLead();assert.match(await page.locator('#sheetError').innerText(),/Do-not-contact records cannot/);assert.deepEqual(await saved(),before);
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
  });
  await check('mobile prepared-lead form fits without horizontal overflow',async()=>{
    await page.setViewportSize({width:390,height:844});await newLead();await fillPrepared(candidate);
    assert(await page.locator('#editForm').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    assert.equal(errors.length,0,errors.join('\n'));
  });
  console.log(checks.length+' browser checks passed; all writes stayed in fresh local synthetic storage.');
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));});
