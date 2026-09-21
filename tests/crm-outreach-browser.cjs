/* Manual browser QA: synthetic local records, loopback assets, all external requests blocked.
 * PLAYWRIGHT_MODULE and CHROME_PATH can point to existing dependencies. Installs nothing.
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..'),A=require('../agent-control-model'),O=require('../crm/outreach-model');
const {createServer}=require('../tools/preview-crm.cjs');
function browserAPI(){
  for(const name of [process.env.PLAYWRIGHT_MODULE,'playwright','playwright-core',path.join(ROOT,'tools/.cache/hosting-terrain-browser/node_modules/playwright-core')].filter(Boolean))try{return require(name);}catch(_){}
  throw Error('Provide an existing playwright/playwright-core package or set PLAYWRIGHT_MODULE.');
}
function browserPath(chromium){
  if(process.env.CHROME_PATH)return process.env.CHROME_PATH;
  const candidates=[chromium.executablePath(),'C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium'];
  const found=candidates.find(file=>fs.existsSync(file));if(!found)throw Error('Set CHROME_PATH to an existing Chrome/Chromium executable.');return found;
}
function fixture(){
  let state=A.initial(),sequence=0;const at=new Date(Date.now()-60000).toISOString();
  function apply(type,payload){state=A.reduce(state,{type,payload,revision:state.revision,id:'fixture_'+(++sequence),at});}
  apply('lead.save',{id:'synthetic_buyer',company:'Synthetic Buyer',website:'https://buyer.example.test',offer:'sourcing',stage:'discovered',channel:'referral',contact:'Original contact remains unchanged',notes:'Original lead history',nextAction:'Synthetic next step'});
  apply('lead.save',{id:'synthetic_account_peer',company:'Synthetic Same Account',website:'https://buyer.example.test',offer:'quote_review',stage:'discovered',channel:'direct'});
  apply('task.add',{id:'synthetic_source',role:'outreach',title:'Synthetic exact draft',brief:'Synthetic only; never contact a real person.',leadId:'synthetic_buyer'});
  apply('task.ready',{id:'synthetic_source'});apply('task.result',{id:'synthetic_source',result:'Synthetic source v1',sources:['https://example.test/draft']});
  apply('task.add',{id:'synthetic_quality',role:'review',title:'Synthetic independent review',brief:'Synthetic exact-version review',parentTaskId:'synthetic_source',leadId:'synthetic_buyer'});
  apply('task.ready',{id:'synthetic_quality'});apply('task.result',{id:'synthetic_quality',result:'Synthetic Quality pass',sources:['https://example.test/review'],qualityVerdict:'pass',confirmCurrentSource:true});
  const review=evidenceTaskId=>({actor:'coordinator',reviewer:'Synthetic Revenue',basis:'Synthetic independent evidence and version reviewed',evidenceTaskId,checks:{evidence:'pass',arithmetic:'na',fit:'pass'}});
  apply('task.accept',{id:'synthetic_quality',note:'Synthetic review accepted',review:review('')});
  apply('task.accept',{id:'synthetic_source',note:'Synthetic source accepted',review:review('synthetic_quality')});
  for(const legacy of ['explicit','implicit']){
    const id='legacy_'+legacy,qa=id+'_qa';
    apply('task.add',{id,role:'outreach',title:'Synthetic '+legacy+' legacy result',brief:'Historical version zero; never relabel as version one.',leadId:'synthetic_buyer'});
    apply('task.ready',{id});apply('task.result',{id,result:'Synthetic historical message version zero.',sources:['https://example.test/legacy']});
    const source=state.tasks.find(task=>task.id===id);if(legacy==='explicit')source.resultVersion=0;else delete source.resultVersion;
    apply('task.add',{id:qa,role:'review',title:'Synthetic legacy review '+legacy,brief:'Independent review of the exact historical source.',parentTaskId:id,leadId:'synthetic_buyer'});
    apply('task.ready',{id:qa});apply('task.result',{id:qa,result:'Synthetic exact zero-version review.',sources:['https://example.test/legacy-qa'],qualityVerdict:'pass',confirmCurrentSource:true});
    apply('task.accept',{id:qa,note:'Synthetic zero-version Quality accepted.',review:review('')});apply('task.accept',{id,note:'Synthetic zero-version source accepted.',review:review(qa)});
  }
  apply('task.add',{id:'never_submitted',role:'outreach',title:'Synthetic unsubmitted task',brief:'No result exists; do not invent a source version.',leadId:'synthetic_buyer'});
  return state;
}

async function run(){
  const {chromium}=browserAPI(),server=createServer(),initial=fixture(),reports=path.resolve(process.env.CRM_OUTREACH_REPORT_DIR||path.join(ROOT,'reports/crm-multichannel-browser'));
  fs.mkdirSync(reports,{recursive:true});let browser,page;const results=[];
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const origin='http://127.0.0.1:'+server.address().port;
    browser=await chromium.launch({executablePath:browserPath(chromium),headless:true});
    for(const width of [320,390,1440]){
      const context=await browser.newContext({viewport:{width,height:1050},serviceWorkers:'block',reducedMotion:'reduce'}),errors=[],writes=[],missing=[],blocked=[];
      await context.route('**/*',route=>{const url=route.request().url();if(new URL(url).origin===origin)return route.continue();blocked.push(url);return route.abort();});
      await context.addInitScript(({state})=>{if(location.hostname==='127.0.0.1'&&!localStorage.getItem('protonAgentControlLocal_v1'))localStorage.setItem('protonAgentControlLocal_v1',JSON.stringify(state));},{state:initial});
      page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.method()!=='GET')writes.push(request.url());});page.on('response',response=>{if(new URL(response.url()).origin===origin&&response.status()>=400)missing.push(response.url());});
      const lead=()=>page.locator('.wf-lead-card[data-lead-id="synthetic_buyer"]');
      async function section(key){const box=lead().locator('[data-lead-section="'+key+'"]');if(await box.getAttribute('open')===null)await box.locator(':scope > summary').click();return box;}
      async function routeCard(address){const box=(await section('outreach')).locator('.crm-outreach-route').filter({hasText:address});if(await box.getAttribute('open')===null)await box.locator(':scope > summary').click();return box;}
      const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('protonAgentControlLocal_v1')));
      async function recorder(){await page.getByLabel('Recorded by',{exact:true}).fill('Synthetic Revenue');}
      async function save(label){await page.getByRole('button',{name:label,exact:true}).click();await page.locator('#sheet').waitFor({state:'hidden'});}
      await page.goto(origin+'/crm/#pipeline/lead/synthetic_buyer');await lead().waitFor();
      const injection='<img src=x onerror="window.outreachInjection=true">';
      await (await section('outreach')).getByRole('button',{name:'Add contact route',exact:true}).click();
      await page.getByLabel('Address, E.164 phone or public handle',{exact:true}).fill('buyer@example.test');
      await page.getByLabel('Person / business contact',{exact:true}).fill('Synthetic contact '+injection);
      await page.getByLabel('Source / evidence reference',{exact:true}).fill('Synthetic source '+injection);
      await page.locator('#editForm details > summary').filter({hasText:'Business timezone'}).click();
      await page.getByLabel('IANA business timezone',{exact:true}).fill('America/New_York');await page.getByLabel('Timezone evidence',{exact:true}).fill('Synthetic business address source');await recorder();await save('Save contact route');
      assert.equal((await stored()).outreach.routes.length,1);
      await (await routeCard('buyer@example.test')).getByRole('button',{name:'Set preferred',exact:true}).click();await recorder();await save('Save preference');
      assert.equal(O.forLead(await stored(),'synthetic_buyer').routes[0].preferred,true);
      await (await routeCard('buyer@example.test')).getByRole('button',{name:'Record permission',exact:true}).click();
      await page.getByLabel('Purpose',{exact:true}).selectOption('quote_update');await page.getByLabel('Permission evidence',{exact:true}).selectOption('granted');
      await page.getByLabel('Exact scope and evidence reference',{exact:true}).fill('Synthetic quote-update request '+injection);await page.getByLabel('How was permission obtained?',{exact:true}).fill('Synthetic inbound quote request');await recorder();await save('Save permission record');
      assert.equal(O.forLead(await stored(),'synthetic_buyer').routes[0].permissions.quote_update,'granted');
      assert.equal(O.forLead(await stored(),'synthetic_buyer').routes[0].permissions.prospecting,'unknown');
      await (await routeCard('buyer@example.test')).getByRole('button',{name:'Update evidence',exact:true}).click();await page.getByLabel('Timezone evidence',{exact:true}).fill('Synthetic updated timezone source');await recorder();await save('Save evidence revision');
      assert.equal(O.forLead(await stored(),'synthetic_buyer').routes[0].timezoneSource,'Synthetic updated timezone source');
      await (await section('outreach')).getByRole('button',{name:'Add contact route',exact:true}).click();await page.getByLabel('Contact channel',{exact:true}).selectOption('sms');await page.getByLabel('Address, E.164 phone or public handle',{exact:true}).fill('+12025550123');await page.getByLabel('Source / evidence reference',{exact:true}).fill('Synthetic number only; no permission inferred');await recorder();await save('Save contact route');
      for(const legacy of ['explicit','implicit']){
        const id='legacy_'+legacy,status=legacy==='explicit'?'draft':'prepared';
        await (await section('touches')).getByRole('button',{name:'Record a touch or reply',exact:true}).click();
        const task=page.getByLabel('Exact draft assignment',{exact:true}),version=page.getByLabel('Source result version',{exact:true});
        await task.selectOption('never_submitted');assert.equal(await version.inputValue(),'','Never-submitted tasks cannot invent version zero');
        await task.selectOption(id);assert.equal(await version.inputValue(),'0','Both explicit and implicit legacy results autofill zero');
        await task.selectOption('');assert.equal(await version.inputValue(),'');await task.selectOption(id);
        assert.equal(await version.getAttribute('min'),'0');assert.equal(await version.getAttribute('step'),'1');
        await page.getByLabel('Observed status',{exact:true}).selectOption(status);
        await page.getByLabel('What happened? Include the evidence reference.',{exact:true}).fill('Synthetic '+legacy+' legacy zero record');
        await page.getByLabel('Message version',{exact:true}).fill(id+'-message-v0');await page.getByLabel('Exact Quality review task ID',{exact:true}).fill(id+'_qa');await recorder();
        const unchanged=JSON.stringify(await stored());
        for(const invalid of ['', '-1', '0.5']){
          await version.fill(invalid);assert.equal(await version.evaluate(el=>el.checkValidity()),false);
          await page.getByRole('button',{name:'Save touch record',exact:true}).click();assert.equal(await page.locator('#sheet').evaluate(el=>el.open),true);assert.equal(JSON.stringify(await stored()),unchanged,'Invalid input cannot save a journal event');
        }
        await version.fill('9007199254740992');await page.getByRole('button',{name:'Save touch record',exact:true}).click();
        await page.locator('#sheetError').waitFor({state:'visible'});assert.match(await page.locator('#sheetError').innerText(),/exact source task, result version and message version/);assert.equal(JSON.stringify(await stored()),unchanged,'Unsafe integer fails model validation without mutation');
        await version.fill('0');await save('Save touch record');
        const saved=O.forLead(await stored(),'synthetic_buyer').touches.find(touch=>touch.taskId===id);
        assert.equal(saved.resultVersion,0);assert.equal(saved.messageVersion,id+'-message-v0');assert.equal(saved.reviewTaskId,id+'_qa');assert.equal(saved.status,status);
        const entry=(await section('touches')).locator('.crm-touch-list > li').filter({hasText:'Synthetic '+legacy+' legacy zero record'});
        await entry.locator('summary').filter({hasText:'Record references'}).click();assert.match(await entry.innerText(),new RegExp('Draft task: '+id+' · result 0'));assert.doesNotMatch(await entry.innerText(),/result not recorded/);
      }
      await (await section('touches')).getByRole('button',{name:'Record a touch or reply',exact:true}).click();await page.getByLabel('Observed status',{exact:true}).selectOption('prepared');await page.getByLabel('What happened? Include the evidence reference.',{exact:true}).fill('Synthetic preparation only');await page.getByLabel('Exact draft assignment',{exact:true}).selectOption('synthetic_source');await page.getByLabel('Message version',{exact:true}).fill('message-v1');await page.getByLabel('Exact Quality review task ID',{exact:true}).fill('synthetic_quality');await recorder();await save('Save touch record');
      assert.equal(O.forLead(await stored(),'synthetic_buyer').touches.find(touch=>touch.taskId==='synthetic_source').resultVersion,1,'Positive-version form behavior remains unchanged');
      await (await section('touches')).getByRole('button',{name:'Record a touch or reply',exact:true}).click();await page.getByLabel('Direction',{exact:true}).selectOption('inbound');await page.getByLabel('Reply type',{exact:true}).selectOption('human');await page.getByLabel('What happened? Include the evidence reference.',{exact:true}).fill('Synthetic genuine reply '+injection);await page.getByLabel('Provider message / receipt reference',{exact:true}).fill('synthetic-received-receipt');await recorder();await save('Save touch record');
      let state=await stored(),projection=O.forLead(state,'synthetic_buyer');assert.equal(projection.paused,true);assert.equal(projection.transportActive,false);assert.equal(projection.touches.find(t=>t.recordedStatus==='prepared').status,'cancelled');
      await (await section('touches')).getByRole('button',{name:'Record a touch or reply',exact:true}).click();await page.getByLabel('Observed status',{exact:true}).selectOption('unknown');await page.getByLabel('What happened? Include the evidence reference.',{exact:true}).fill('Synthetic historical unknown outcome');await recorder();await save('Save touch record');
      assert.equal(O.forLead(await stored(),'synthetic_buyer').unknown,true);
      const unknown=(await section('touches')).locator('.crm-touch-list > li').filter({hasText:'Synthetic historical unknown outcome'});await unknown.getByRole('button',{name:'Reconcile this record',exact:true}).click();await page.getByLabel('Observed status',{exact:true}).selectOption('failed');await page.getByLabel('What happened? Include the evidence reference.',{exact:true}).fill('Synthetic provider confirmed failure');await recorder();await save('Save reconciliation');assert.equal(O.forLead(await stored(),'synthetic_buyer').unknown,false);
      await (await routeCard('+12025550123')).getByRole('button',{name:'Record route opt-out',exact:true}).click();await page.getByLabel('What did the person ask?',{exact:true}).fill('Synthetic stop SMS');await page.getByLabel('Message / evidence reference',{exact:true}).fill('Synthetic STOP receipt');await recorder();await save('Record opt-out');assert.equal(O.forLead(await stored(),'synthetic_buyer').routes.find(r=>r.channel==='sms').suppressed,true);
      await (await section('outreach')).getByRole('button',{name:'Record account opt-out',exact:true}).click();await page.getByLabel('What did the person ask?',{exact:true}).fill('Synthetic account do-not-contact '+injection);await page.getByLabel('Message / evidence reference',{exact:true}).fill('Synthetic broad opt-out receipt');await recorder();await save('Record opt-out');
      state=await stored();assert.equal(O.forLead(state,'synthetic_buyer').suppressed,true);assert.equal(O.forLead(state,'synthetic_account_peer').suppressed,true);assert.equal(O.forLead(state,'synthetic_buyer').transportActive,false);
      assert.deepEqual(state.leads,initial.leads,'Legacy acquisition channel, contact and history remain unchanged.');assert.deepEqual(state.tasks,initial.tasks,'Accepted exact-version source and QA history remain unchanged.');
      const beforeReload=JSON.stringify(state.outreach);await page.reload();await lead().waitFor();assert.equal(JSON.stringify((await stored()).outreach),beforeReload,'Journal survives reload without duplicating records.');
      await section('outreach');await routeCard('buyer@example.test');await section('contact-plan');await section('touches');
      assert.equal(await page.locator('.crm-outreach img, .crm-outreach script').count(),0);assert.equal(await page.evaluate(()=>window.outreachInjection),undefined);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'No horizontal overflow at '+width);
      assert.match(await lead().innerText(),/Execution unavailable|execution remains unavailable/);assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.deepEqual(missing,[]);
      await page.screenshot({path:path.join(reports,'outreach-'+width+'.png'),fullPage:true});
      results.push({width,status:'pass',journalEvents:state.outreach.events.length,blockedExternalRequests:blocked.length,checks:['route and timezone evidence','purpose-specific permission','preferred route','explicit and implicit legacy version zero autofill/save/display','unsubmitted task stays blank','blank/negative/fractional/unsafe versions cannot save','positive source version preserved','exact task/message/QA references retained','prepared draft reference','human reply pause','same-touch unknown reconciliation','route and account suppression','same-account propagation','legacy/accepted history preservation','reload journal integrity','escaped evidence','inactive execution','no overflow or JS errors','no network writes']});
      await context.close();page=null;
    }
    fs.writeFileSync(path.join(reports,'browser-qa.json'),JSON.stringify({at:new Date().toISOString(),results},null,2));console.log(JSON.stringify(results,null,2));
  }catch(error){if(page)await page.screenshot({path:path.join(reports,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
  finally{if(browser)await browser.close();if(server.listening)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections?.();});}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
