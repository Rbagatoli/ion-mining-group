'use strict';
// Real CRM shell and stores; disposable synthetic local data, no account or external services.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||'C:/Users/rbaga/ion-mining-group/tools/.cache/hosting-terrain-browser/node_modules/playwright-core');
const {createServer}=require('../tools/preview-crm.cjs'),A=require('../agent-control-model');
const KEY='protonAgentControlLocal_v1',out=path.resolve(__dirname,'../tools/.cache/crm-site-services-browser');
const offers=[['custom_search','Custom Site Search'],['site_review','Existing Site Review']];
fs.mkdirSync(out,{recursive:true});
let fixture=A.initial(),seq=0;
const now=new Date(),today=now.toISOString().slice(0,10),tomorrow=new Date(now.getTime()+86400000).toISOString().slice(0,10);
function seed(type,payload){fixture=A.reduce(fixture,{type,payload,revision:fixture.revision,id:'synthetic_event_'+(++seq),at:now.toISOString()});}
for(const offer of ['research','sourcing']){
 seed('lead.save',{id:'legacy_'+offer,company:'Synthetic historical '+offer,website:'https://legacy-'+offer+'.example.test',stage:'discovered',offer,channel:'direct',nextAction:'Preserve this historical service identifier.'});
 seed('deal.save',{id:'legacy_deal_'+offer,name:'Synthetic historical deal '+offer,offer,stage:'qualified',feeCents:12345,contact:'https://legacy-'+offer+'.example.test/contact',notes:'Existing historical scope.'});
}
for(const [offer,label] of offers)seed('lead.save',{id:'replied_'+offer,company:'Synthetic replied '+label,website:'https://replied-'+offer.replace(/_/g,'-')+'.example.test',stage:'replied',offer,channel:'direct',signal:'Synthetic client asked to scope this service.',source:'https://evidence.example.test/'+offer,checked:today,buyer:'Synthetic operations buyer',contact:'https://contact.example.test/'+offer,nextAction:'Agree the exact scope and proposed fee.',due:tomorrow,serviceFit:'Synthetic requirement for '+label+'.',lastTouch:today,lastNote:'Synthetic fixture only: an inbound scope discussion, not real outreach.'});
const initial=JSON.parse(JSON.stringify(fixture)),server=createServer(),checks=[];
let browser,page;
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function state(){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);}
async function closePanel(){await page.getByRole('button',{name:'Close panel',exact:true}).click();await page.locator('#sheet').waitFor({state:'hidden'});}
async function openLead(id){await page.goto(origin+'/crm/#pipeline/lead/'+id);await page.locator('.wf-lead-card[data-lead-id="'+id+'"] .wf-detail').waitFor();}
let origin;
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const context=await browser.newContext({viewport:{width:1440,height:1100},timezoneId:'UTC',serviceWorkers:'block',reducedMotion:'reduce'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 page=await context.newPage();page.setDefaultTimeout(15000);const errors=[],missing=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.url().startsWith(origin)&&response.status()>=400)missing.push(response.url());});
 await page.goto(origin+'/crm/');await page.evaluate(({key,value})=>localStorage.setItem(key,value),{key:KEY,value:JSON.stringify(fixture)});await page.goto(origin+'/crm/#pipeline');await page.reload();
 await page.getByRole('heading',{name:'Your pipeline.',exact:true}).waitFor();
 await check('Loading historical records preserves their existing service IDs and fees',async()=>{
  const loaded=await state();assert.deepEqual(loaded,initial);
  for(const offer of ['research','sourcing'])assert.match(await page.locator('#pipelineList').innerText(),new RegExp(A.OFFERS[offer]));
 });
 const saved=[];
 await check('Pipeline → Add new → Revenue lead offers both site services and defaults to Discovered',async()=>{
  for(const [offer,label] of offers){
   await page.getByRole('button',{name:'Add new',exact:true}).click();await page.locator('#sheet [data-action="new-lead"]').click();
   await page.getByRole('heading',{name:'New revenue lead',exact:true}).waitFor();
   assert.equal(await page.getByLabel('Service',{exact:true}).inputValue(),'custom_search');
   assert.equal(await page.getByLabel('Lead stage',{exact:true}).inputValue(),'discovered');
   for(const [id,name] of offers)assert.equal(await page.locator('#sheet select[name=offer] option[value="'+id+'"]').innerText(),name);
   const company='Synthetic UI '+label;
   await page.getByLabel('Company',{exact:true}).fill(company);await page.getByLabel('Company website',{exact:true}).fill('https://ui-'+offer.replace(/_/g,'-')+'.example.test');
   await page.getByLabel('Service',{exact:true}).selectOption(offer);await page.getByLabel('Why would they buy this service?',{exact:true}).fill('Synthetic test: verify the current site-service save path.');
   await page.getByLabel('Next action',{exact:true}).fill('Research the requirement; no contact has occurred.');await page.getByRole('button',{name:'Save lead',exact:true}).click();await page.locator('#sheet').waitFor({state:'hidden'});
   const record=(await state()).leads.find(lead=>lead.company===company);assert(record,'UI save persisted a real local lead');saved.push({id:record.id,offer,label,company});
   assert.equal(record.offer,offer);assert.equal(record.stage,'discovered');assert.equal(record.lastTouch,'');assert.equal(record.lastNote,'');
   const card=page.locator('.wf-lead-card[data-lead-id="'+record.id+'"]');await card.waitFor();assert.match(await card.innerText(),new RegExp(label));assert.doesNotMatch(await card.locator(':scope > summary').innerText(),/Contact recorded|Reply recorded/);
  }
 });
 await check('New service labels remain visible after reload without manufacturing contacts or assignments',async()=>{
  await page.reload();await page.getByRole('heading',{name:'Your pipeline.',exact:true}).waitFor();
  for(const item of saved){assert.match(await page.locator('.wf-lead-card[data-lead-id="'+item.id+'"]').innerText(),new RegExp(item.label));const lead=(await state()).leads.find(l=>l.id===item.id);assert.equal(lead.offer,item.offer);assert.equal(lead.stage,'discovered');assert.equal(lead.lastTouch,'');}
  const actual=await state();assert.deepEqual(actual.tasks,initial.tasks);assert.deepEqual(actual.entries,initial.entries);
 });
 await check('Editing historical research and sourcing leads retains their historical IDs',async()=>{
  for(const offer of ['research','sourcing']){
   await openLead('legacy_'+offer);await page.locator('.wf-lead-card[data-lead-id="legacy_'+offer+'"]').getByRole('button',{name:'Update lead',exact:true}).click();
   assert.equal(await page.getByLabel('Service',{exact:true}).inputValue(),offer);await page.getByLabel('Next action',{exact:true}).fill('Synthetic edited next step; keep historical offer unchanged.');
   await page.getByRole('button',{name:'Save lead',exact:true}).click();await page.locator('#sheet').waitFor({state:'hidden'});assert.equal((await state()).leads.find(lead=>lead.id==='legacy_'+offer).offer,offer);
  }
 });
 await check('A new service deal defaults to Custom Site Search with no invented proposed fee',async()=>{
  await page.goto(origin+'/crm/#team');await page.locator('[data-action="team-tab"][data-id="revenue"]').click();await page.getByRole('button',{name:'Add deal',exact:true}).click();
  await page.getByRole('heading',{name:'New service opportunity',exact:true}).waitFor();assert.equal(await page.getByLabel('Service',{exact:true}).inputValue(),'custom_search');assert.equal(await page.getByLabel('Proposed fee · USD',{exact:true}).inputValue(),'');await closePanel();
  assert.deepEqual((await state()).deals,initial.deals,'Opening and cancelling does not create a deal');
 });
 const deals=[];
 await check('Create service deal keeps each replied lead’s service and requires an explicit scoped fee',async()=>{
  for(let index=0;index<offers.length;index++){
   const [offer,label]=offers[index];await openLead('replied_'+offer);await page.locator('.wf-lead-card[data-lead-id="replied_'+offer+'"]').getByRole('button',{name:'Create service deal',exact:true}).click();
   await page.getByRole('heading',{name:'New service opportunity',exact:true}).waitFor();assert.equal(await page.getByLabel('Service',{exact:true}).inputValue(),offer);assert.equal(await page.getByLabel('Customer / assignment',{exact:true}).inputValue(),'Synthetic replied '+label);
   const fee=page.getByLabel('Proposed fee · USD',{exact:true});assert.equal(await fee.inputValue(),'');assert.equal(await fee.evaluate(el=>el.validity.valueMissing),true);
   const count=(await state()).deals.length;await page.getByRole('button',{name:'Save opportunity',exact:true}).click();assert.equal((await state()).deals.length,count,'Blank fee cannot silently become zero or a canned fee');assert.equal(await page.locator('#sheet').evaluate(el=>el.open),true);
   const value=index?'925.50':'675.25';await fee.fill(value);await page.getByLabel('Scope & notes',{exact:true}).fill('Synthetic explicitly priced '+label+' scope; no fee promised to a real client.');await page.getByRole('button',{name:'Save opportunity',exact:true}).click();await page.locator('#sheet').waitFor({state:'hidden'});
   const deal=(await state()).deals.find(item=>item.name==='Synthetic replied '+label);assert(deal);assert.equal(deal.offer,offer);assert.equal(deal.feeCents,Math.round(Number(value)*100));assert.equal(deal.stage,'qualified');deals.push(deal);
  }
 });
 await check('Pipeline search finds readable site-service labels for both leads and deals',async()=>{
  await page.goto(origin+'/crm/#pipeline');await page.getByRole('button',{name:'Everything',exact:true}).click();
  for(const [offer,label] of offers){
   await page.getByLabel('Search your pipeline',{exact:true}).fill(label);const own=saved.find(item=>item.offer===offer),deal=deals.find(item=>item.offer===offer),other=saved.find(item=>item.offer!==offer);
   await page.locator('.wf-lead-card[data-lead-id="'+other.id+'"]').waitFor({state:'detached'});
   await page.locator('.wf-lead-card[data-lead-id="'+own.id+'"]').waitFor();const list=await page.locator('#pipelineList').innerText();assert.match(list,new RegExp(own.company));assert.match(list,new RegExp(deal.name));assert.doesNotMatch(list,/custom_search|site_review/);
   assert.equal(await page.locator('#pipelineList a[href="#team/deal/'+deal.id+'"]').count(),1,'The actual service deal is present, not only its source lead');
   assert.equal(await page.locator('.wf-lead-card[data-lead-id="'+other.id+'"]').count(),0);
  }
  await page.getByLabel('Search your pipeline',{exact:true}).fill('');await page.reload();await page.getByRole('heading',{name:'Your pipeline.',exact:true}).waitFor();
  for(const deal of deals)assert.match(await page.locator('#pipelineList a[href="#team/deal/'+deal.id+'"]').innerText(),new RegExp(A.OFFERS[deal.offer]));
 });
 await check('Current and historical records coexist without mass remapping or cash/contact side effects',async()=>{
  const actual=await state();assert.equal(actual.leads.length,initial.leads.length+2);assert.equal(actual.deals.length,initial.deals.length+2);
  for(const original of initial.leads)assert.equal(actual.leads.find(item=>item.id===original.id).offer,original.offer);
  for(const original of initial.deals)assert.deepEqual(actual.deals.find(item=>item.id===original.id),original);
  for(const [offer] of offers)assert.deepEqual(actual.leads.find(item=>item.id==='replied_'+offer),initial.leads.find(item=>item.id==='replied_'+offer),'Creating a deal does not rewrite lead contact history');
  assert.deepEqual(actual.entries,[]);assert.deepEqual(actual.tasks,[]);assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
 });
 fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({checks},null,2));
})().catch(async error=>{console.error(error);if(page)await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});process.exitCode=1;}).finally(async()=>{await browser?.close();server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));});
