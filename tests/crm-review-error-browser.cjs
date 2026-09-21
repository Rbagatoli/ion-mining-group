/* Synthetic QA/non-QA forms and QA rejection; loopback GET assets only, no live accounts or providers. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||'../tools/.cache/hosting-terrain-browser/node_modules/playwright-core');
const {createServer}=require('../tools/preview-crm.cjs'),A=require('../agent-control-model');
const baseline=process.env.CRM_REVIEW_ERROR_BASELINE==='1';
const out=path.resolve(__dirname,'../reports/crm-quality-review-clarity-20260921/browser',baseline?'baseline':'fixed');
const server=createServer(),KEY='protonAgentControlLocal_v1',AT='2026-09-21T12:00:00Z';
const expected='Resolve failed or unchecked criteria before accepting. You can return the result for revision.';
const guidanceText='Assess the Quality review itself. Pass means its reasoning is supported and complete. Needs revision means this review needs correction. Accepting an accurate REVISE or HOLD finding does not approve the source result or change its verdict.';
const qaLabels={evidence:'Quality review: evidence reasoning',arithmetic:'Quality review: arithmetic reasoning',fit:'Quality review: commercial-fit reasoning'};
const sourceLabels={evidence:'Source evidence',arithmetic:'Arithmetic',fit:'Commercial fit'};
const optionValues=['unchecked','pass','revise','blocked','na'];
const report={syntheticOnly:true,baseline,scenario:'Quality-only accessible wording, unchanged non-QA checks, and rejected acceptance with no mutation',views:[],nonQaViews:[],pageErrors:[],missingAssets:[],blockedWrites:[],blockedExternal:[]};
let browser,context,page,origin,sequence=0;
const apply=(s,type,payload)=>A.reduce(s,{type,payload,revision:s.revision,id:'synthetic_'+(++sequence),at:AT});
function fixture(){
  let s=A.initial();
  s=apply(s,'task.add',{id:'source',role:'analysis',title:'Synthetic correction source',brief:'Preserve the original evidence and source version zero.'});
  s=apply(s,'task.ready',{id:'source'});
  s=apply(s,'task.result',{id:'source',result:'Original synthetic evidence requires correction; source remains blocked.',sources:['https://example.test/original-source']});
  // Model a valid existing legacy result: its original version zero must stay zero.
  s.tasks.find(t=>t.id==='source').resultVersion=0;
  s=apply(s,'task.block',{id:'source',blockerKind:'correction',reason:'Original independent REVISE finding remains unresolved.'});
  s=apply(s,'task.add',{id:'qa',role:'review',title:'Synthetic existing independent Quality',brief:'Existing linked Quality; preserve original reviewer evidence.',parentTaskId:'source'});
  s=apply(s,'task.ready',{id:'qa'});
  s=apply(s,'task.result',{id:'qa',result:'Original reviewer: Synthetic independent Quality. Completed 2026-09-20T14:00:00-04:00. REVISE source version 0. Artifact: native-artifact:synthetic-original-review; source evidence https://example.test/original-source. This is the historical finding, not a new review.',sources:['https://example.test/original-review'],qualityVerdict:'revise',confirmCurrentSource:true});
  s=apply(s,'lead.save',{id:'untouched',company:'Synthetic untouched buyer',website:'https://example.test/',offer:'research',channel:'direct',stage:'discovered'});
  A.valid(s);
  const source=s.tasks.find(t=>t.id==='source'),qa=s.tasks.find(t=>t.id==='qa');
  assert.equal(source.status,'blocked');assert.equal(source.blockerKind,'correction');assert.equal(source.resultVersion,0);
  assert.equal(qa.status,'review');assert.equal(qa.resultVersion,1);assert.equal(qa.qualityVerdict,'revise');assert.equal(qa.reviewOfVersion,0);
  return s;
}
// Instrument the adapter only in the loopback response; do not change application files.
const instrument=`
(function(){
  const create=ProtonCrmData.create;
  window.__reviewErrorHarness={calls:[]};
  ProtonCrmData.create=function(){
    const data=create(),dispatch=data.dispatch;window.__reviewErrorHarness.data=data;
    data.dispatch=(...args)=>{window.__reviewErrorHarness.calls.push(args);return dispatch(...args);};
    return data;
  };
})();`;
const baselineHandler="  function error(e){const target=sheet.open?$('sheetError'):$('notice');target.textContent=e.message||String(e);target.hidden=false;}\n";
const fields=()=>page.locator('#editForm').evaluate(form=>Object.fromEntries(new FormData(form)));
async function checkControls(isQa){
  const labels=isQa?qaLabels:sourceLabels;
  const optionText=isQa?['Not checked','Pass · review supported and complete','Needs revision · review needs correction','Blocked · cannot assess review','Not applicable to this review']:['Not checked','Pass','Needs revision','Blocked','Not applicable'];
  for(const [name,label] of Object.entries(labels)){
    const control=page.getByLabel(label,{exact:true});
    assert.equal(await control.count(),1);assert.equal(await control.getAttribute('name'),name);assert.equal(await control.getAttribute('id'),'f_'+name);
    assert.equal(await control.inputValue(),'unchecked');
    assert.deepEqual(await control.locator('option').evaluateAll(options=>options.map(o=>o.value)),optionValues);
    assert.deepEqual(await control.locator('option').allTextContents(),optionText);
    assert.equal(await control.getAttribute('aria-describedby'),isQa?'qaReviewChecksHelp':null);
  }
  assert.equal(await page.getByLabel('Decision',{exact:true}).inputValue(),'');
  assert.equal(await page.getByLabel('Decision recorded as',{exact:true}).inputValue(),'coordinator');
}
async function runNonQaView(view){
  await page.setViewportSize(view.size);
  let before=apply(A.initial(),'task.add',{id:'source',role:'analysis',title:'Synthetic source review',brief:'Non-QA labels and options must remain unchanged.'});
  before=apply(before,'task.ready',{id:'source'});before=apply(before,'task.result',{id:'source',result:'Synthetic source awaiting review.',sources:['https://example.test/source']});
  await page.goto(origin+'/crm/');
  await page.evaluate(({key,value})=>{localStorage.clear();localStorage.setItem(key,JSON.stringify(value));},{key:KEY,value:before});
  await page.goto(origin+'/crm/#team/task/source');await page.reload();
  const storedBefore=await page.evaluate(key=>localStorage.getItem(key),KEY);
  await page.getByRole('button',{name:'Record review decision',exact:true}).click();
  await checkControls(false);assert.equal(await page.locator('[data-qa-review-guidance]').count(),0);
  assert.equal(await page.evaluate(()=>__reviewErrorHarness.calls.length),0);
  assert.deepEqual(await page.evaluate(()=>__reviewErrorHarness.data.agent()),before);
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),KEY),storedBefore);
  report.nonQaViews.push({name:view.name,originalLabelsAndOptions:true,unchangedDefaults:true,zeroDispatch:true,registerUnchanged:true});
}
async function runView(view){
  await page.setViewportSize(view.size);
  const before=fixture();
  await page.goto(origin+'/crm/');
  await page.evaluate(({key,value})=>{localStorage.clear();localStorage.setItem(key,JSON.stringify(value));localStorage.setItem('syntheticUntouched','Retain exactly');},{key:KEY,value:before});
  await page.goto(origin+'/crm/#team/task/qa');await page.reload();
  await page.getByRole('button',{name:'Record coordinator review',exact:true}).click();
  assert.equal(await page.locator('#sheetTitle').innerText(),'Record team review');
  const guidance=page.locator('[data-qa-review-guidance]');
  await guidance.scrollIntoViewIfNeeded();assert.equal(await guidance.isVisible(),true);
  assert.equal(await guidance.innerText(),guidanceText);assert.equal(await guidance.getAttribute('id'),'qaReviewChecksHelp');
  assert(await guidance.evaluate(el=>el.nextElementSibling.textContent.includes('Quality review: evidence reasoning')),'Quality-specific guidance immediately precedes the checks');
  await checkControls(true);
  for(const label of Object.values(sourceLabels))assert.equal(await page.getByLabel(label,{exact:true}).count(),0,'No ambiguous source label on the QA form');
  const formLayout=await page.locator('#editForm').evaluate(form=>({fits:form.scrollWidth<=form.clientWidth+1,viewportFits:document.documentElement.scrollWidth<=innerWidth}));
  assert(formLayout.fits&&formLayout.viewportFits,'Long QA labels must not cause horizontal overflow');
  await guidance.evaluate(el=>{const sheet=document.getElementById('sheet'),header=document.querySelector('.sheet-header');sheet.scrollTop+=el.getBoundingClientRect().top-header.getBoundingClientRect().bottom-16;});
  for(const name of Object.keys(qaLabels))assert(await page.locator('#f_'+name).evaluate(el=>{const r=el.parentElement.getBoundingClientRect(),s=document.getElementById('sheet').getBoundingClientRect(),h=document.querySelector('.sheet-header').getBoundingClientRect();return r.top>=h.bottom&&r.bottom<=Math.min(innerHeight,s.bottom);}),name+' label and control fit together with the guidance');
  await page.screenshot({path:path.join(out,view.name+'-qa-guidance.png')});
  await page.getByLabel('Person / role recording the decision',{exact:true}).fill('Synthetic Revenue recorder');
  await page.getByLabel('Review evidence / owner decision reference',{exact:true}).fill('Original independent reviewer and source version 0 reconciled with native-artifact:synthetic-original-review.');
  await page.getByLabel('Decision',{exact:true}).selectOption('accept');
  await page.getByLabel(qaLabels.evidence,{exact:true}).selectOption('pass');
  await page.getByLabel(qaLabels.arithmetic,{exact:true}).selectOption('na');
  await page.getByLabel(qaLabels.fit,{exact:true}).selectOption('revise');
  await page.getByLabel('Review notes',{exact:true}).fill('The historical REVISE finding is preserved. Arithmetic is not applicable to this review. The Quality artifact itself needs a correction to its commercial-fit reasoning.');
  await page.getByLabel('Feedback for the next assignment',{exact:true}).fill('Retain this unsaved feedback after rejection.');
  const draft=await fields(),storedBefore=await page.evaluate(key=>localStorage.getItem(key),KEY);
  assert(await page.locator('#sheet').evaluate(el=>el.scrollHeight>el.clientHeight),'Exercise an actually scrollable dialog');
  await page.getByRole('button',{name:'Save decision',exact:true}).click();
  const alert=page.locator('#sheetError');await alert.waitFor({state:'visible'});
  assert.equal(await alert.getAttribute('role'),'alert');assert.equal(await alert.innerText(),expected);
  assert.equal(await page.locator('#sheet').evaluate(el=>el.open),true);
  assert.equal(await page.locator('#sheetTitle').innerText(),'Record team review');
  assert.deepEqual(await fields(),draft,'Every entered field must survive rejection');
  assert.equal(await page.getByLabel(qaLabels.fit,{exact:true}).inputValue(),'revise');
  assert.equal(await page.evaluate(()=>__reviewErrorHarness.calls.length),0,'Reject before any dispatch');
  assert.deepEqual(await page.evaluate(()=>__reviewErrorHarness.data.agent()),before,'In-memory register remains unchanged');
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),KEY),storedBefore,'Persisted register remains byte-for-byte unchanged');
  assert.equal(await page.evaluate(()=>localStorage.getItem('syntheticUntouched')),'Retain exactly');
  assert.equal(await page.getByRole('button',{name:'Save decision',exact:true}).isEnabled(),true);
  const visibility=await alert.evaluate(el=>{
    const a=el.getBoundingClientRect(),d=document.getElementById('sheet').getBoundingClientRect(),h=document.querySelector('.sheet-header').getBoundingClientRect();
    const rect=r=>({top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height});
    return {focused:document.activeElement===el,alert:rect(a),dialog:rect(d),header:rect(h),viewport:{width:innerWidth,height:innerHeight},visibleWithinDialog:a.top>=Math.max(0,d.top,h.bottom)-1&&a.bottom<=Math.min(innerHeight,d.bottom)+1&&a.left>=Math.max(0,d.left)-1&&a.right<=Math.min(innerWidth,d.right)+1};
  });
  report.views.push({name:view.name,qaGuidanceVisible:true,explicitQaLabels:true,controlsDescribeGuidance:true,unchangedKeysValuesAndDefaults:true,noHorizontalOverflow:true,zeroDispatch:true,registerUnchanged:true,fieldsPreserved:true,...visibility});
  await page.screenshot({path:path.join(out,view.name+'.png'),fullPage:true});
  assert.equal(visibility.focused,true,'Rejected decision must focus the exact inline alert');
  assert.equal(visibility.visibleWithinDialog,true,'The complete alert must be inside both dialog content viewport and screen, below its sticky header');
}
(async()=>{
  fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block',reducedMotion:'reduce'});
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(request.method()!=='GET'){report.blockedWrites.push({url:request.url(),method:request.method()});return route.abort();}
    if(url.origin!==origin){report.blockedExternal.push(url.origin);return route.abort();}
    if(url.pathname==='/crm/crm-data.js'){const response=await route.fetch();return route.fulfill({response,body:await response.text()+'\n'+instrument});}
    if(baseline&&url.pathname==='/crm/crm.js'){
      const response=await route.fetch(),body=await response.text(),start=body.indexOf('  function error(e){'),end=body.indexOf('  function modal(',start);
      assert(start>=0&&end>start,'Find only the error handler for response-only baseline substitution');
      return route.fulfill({response,body:body.slice(0,start)+baselineHandler+body.slice(end)});
    }
    return route.continue();
  });
  page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>report.pageErrors.push(error.message));
  page.on('response',response=>{if(new URL(response.url()).origin===origin&&response.status()>=400)report.missingAssets.push(response.url());});
  for(const view of [{name:'desktop',size:{width:1440,height:900}},{name:'mobile',size:{width:390,height:740}}]){await runNonQaView(view);await runView(view);}
  assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.missingAssets,[]);assert.deepEqual(report.blockedWrites,[]);
  report.pass=true;console.log('PASS QA and non-QA forms across desktop and mobile: explicit accessible QA wording, unchanged source checks, focused rejection, all fields preserved, zero dispatch, register unchanged.');
})().catch(error=>{report.pass=false;report.error=error.stack;console.error(error.stack);process.exitCode=1;}).finally(async()=>{
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(report,null,2));await browser?.close();server.close();
});
