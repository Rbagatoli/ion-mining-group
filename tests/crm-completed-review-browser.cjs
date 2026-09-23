/* Synthetic local records only. External requests, provider access and service workers are blocked. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||'../tools/.cache/hosting-terrain-browser/node_modules/playwright-core');
const {createServer}=require('../tools/preview-crm.cjs'),A=require('../agent-control-model');
const server=createServer(),checks=[],out=path.resolve(__dirname,'../reports/grok-reliability-2026-09-19/completed-review-browser');
const AT='2026-09-20T08:00:00.000Z',KEY='protonAgentControlLocal_v1';let browser,page,context,origin,seq=0;
const clone=x=>JSON.parse(JSON.stringify(x));
function apply(s,type,payload){return A.reduce(s,{type,payload,revision:s.revision,id:'synthetic_'+(++seq),at:AT});}
function fixture(status='ready',verdict='pass'){
  let s=A.initial();
  s=apply(s,'task.add',{id:'source',role:'analysis',title:'Synthetic energy evidence',brief:'Synthetic fixture only.'});
  s=apply(s,'task.ready',{id:'source'});s=apply(s,'task.result',{id:'source',result:'Exact source evidence remains unchanged <img src=x>.',sources:['https://example.test/source']});
  s=apply(s,'task.add',{id:'qa',role:'review',title:'Synthetic independent QA',brief:'Independent review of the exact source.',parentTaskId:'source'});
  s=apply(s,'task.ready',{id:'qa'});
  if(status!=='ready')s=apply(s,'task.result',{id:'qa',result:'Original independently completed finding: '+verdict,sources:['https://example.test/qa'],qualityVerdict:verdict,confirmCurrentSource:true});
  if(status==='done')s=apply(s,'task.accept',{id:'qa',note:'Actual finding accepted.',review:{actor:'coordinator',reviewer:'Original coordinator',basis:'Synthetic exact-version review.',checks:{evidence:'pass',arithmetic:'na',fit:'pass'}}});
  s=apply(s,'task.add',{id:'unrelated',role:'supply',title:'Untouched synthetic supplier task',brief:'Do not change.'});
  s=apply(s,'lead.save',{id:'lead',company:'Untouched synthetic buyer',website:'https://example.test/',offer:'research',channel:'direct',stage:'discovered'});
  s=apply(s,'deal.save',{id:'deal',name:'Untouched synthetic deal',stage:'proposed',offer:'research',feeCents:100000});
  s=apply(s,'cash.add',{id:'cash',kind:'delivery',cents:100,date:'2026-09-20',note:'Synthetic cost',evidence:'Synthetic receipt'});
  return s;
}
// Instrument the browser adapter at the loopback response boundary, never production source.
const instrument=`
(function(){
  const create=ProtonCrmData.create;
  const h=window.__reviewHarness={calls:[],listeners:[],statusOverride:null,heldState:null,gate:false,throwAfter:false,rejectBefore:false,settled:0};
  ProtonCrmData.create=function(){
    const d=create(),dispatch=d.dispatch,read=d.agent,status=d.status,subscribe=d.subscribe;h.data=d;
    d.agent=()=>h.heldState||read();d.status=()=>Object.assign({},status(),h.statusOverride||{});
    d.subscribe=fn=>{h.listeners.push(fn);subscribe(reason=>{if(!h.heldState)fn(reason);});};
    d.dispatch=async(type,payload,revision)=>{
      h.calls.push({type,payload:JSON.parse(JSON.stringify(payload)),revision});
      try{
        if(h.gate)await new Promise(resolve=>h.release=resolve);
        if(h.rejectBefore)throw Error('Synthetic old request rejected.');
        if(h.throwAfter)h.heldState=JSON.parse(JSON.stringify(read()));
        await dispatch(type,payload,revision);
        if(h.throwAfter)throw Error('Synthetic connection interrupted after commit.');
      }finally{h.settled++;}
    };
    h.emit=reason=>h.listeners.forEach(fn=>fn(reason));
    h.cloud=({pending=false,cached=false}={})=>{h.statusOverride={uid:'synthetic_cloud_account',epoch:1,agent:{uid:'synthetic_cloud_account',mode:cached?'offline':'cloud',hasPendingWrites:pending,fromCache:cached,serverConfirmed:!pending&&!cached}};};
    h.receipt=()=>{
      const call=h.calls[h.calls.length-1];
      h.heldState=AgentControlModel.reduce(read(),{type:call.type,payload:call.payload,revision:call.revision,id:'synthetic_optimistic_receipt',at:new Date().toISOString()});
      return JSON.parse(JSON.stringify(h.heldState));
    };
    return d;
  };
})();`;
async function check(name,fn){await fn();checks.push({name,pass:true});console.log('PASS '+name);}
async function seed(s){await page.goto(origin+'/crm/');await page.evaluate(({key,state})=>{localStorage.clear();localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('syntheticUntouched','Keep exactly');},{key:KEY,state:s});await page.goto(origin+'/crm/#team/task/source');await page.reload();await page.getByRole('button',{name:'Record completed team review',exact:true}).waitFor();}
async function open(){await page.getByRole('button',{name:'Record completed team review',exact:true}).click();assert.equal(await page.getByLabel('Existing linked Quality assignment').inputValue(),'');await page.getByLabel('Existing linked Quality assignment').selectOption('qa');}
async function fill({verdict='pass',decision='accept',reuse=false}={}){
  if(await page.locator('#f_qaResult').count()){
    await page.getByLabel('Actual completed independent Quality result').fill('Actual synthetic independent review: '+verdict+'.');
    await page.getByLabel('Quality evidence URLs · one per line').fill('https://example.test/original-qa');
  }
  await page.getByLabel('Actual independent reviewer',{exact:true}).fill('Independent synthetic Quality');
  await page.getByLabel('Original review completed at · ISO time with timezone').fill('2026-09-20T07:45:00Z');
  await page.getByLabel('Original review artifact / evidence reference').fill('native-artifact:synthetic-original-review');
  await page.getByLabel('Actual completed Quality verdict').selectOption(verdict);
  await page.getByLabel('The actual Quality reviewer worked independently of the source author.').check();
  await page.getByLabel('This actual review covers the exact source result, evidence, recipient and scope shown above.').check();
  await page.getByLabel('Revenue coordinator recording this review').fill('Synthetic Revenue coordinator');
  for(const [prefix,label] of [['qa','Accept the Quality finding'],['source','Source coordinator review']]){
    if(reuse&&prefix==='qa')continue;
    await page.getByLabel(label+' · evidence / basis').fill('Exact source evidence and actual independent review reconciled.');
    for(const [part,value] of [['evidence','pass'],['arithmetic','na'],['fit','pass']])await page.getByLabel(label+' · '+part+' check').selectOption(value);
    await page.getByLabel(label+' · decision notes').fill(prefix==='qa'?'Accept the genuine finding as recorded.':decision==='accept'?'Accept this exact supported source.':'Correct the independently evidenced inconsistency.');
  }
  await page.getByLabel('Source disposition').selectOption(decision);
}
const saved=()=>page.getByRole('heading',{name:'Completed team review saved',exact:true}).waitFor();
const store=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
async function draft(){return page.locator('#editForm').evaluate(el=>Object.fromEntries(new FormData(el)));}
(async()=>{
  fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  const errors=[],requests=[],missing=[];
  await context.route('**/*',r=>{if(r.request().url().startsWith(origin)){requests.push({url:r.request().url(),method:r.request().method()});return r.continue();}return r.abort();});
  await context.route('**/crm/crm-data.js?*',async r=>{const response=await r.fetch();await r.fulfill({response,body:await response.text()+instrument});});
  page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(origin)&&r.status()>=400)missing.push(r.url());});await page.clock.install({time:new Date(AT)});
  await check('explicit existing QA, immutable previews and factual confirmations start unchecked',async()=>{
    await seed(fixture());await open();assert.equal(await page.locator('#editForm input[type=checkbox]:checked').count(),0);
    assert.match(await page.locator('#sheetBody').innerText(),/source · Needs review · result version 1/);
    assert.equal(await page.locator('#sheetBody img').count(),0);assert.equal(await page.locator('#f_qaEvidence').inputValue(),'unchecked');
    await fill();await page.getByLabel('The actual Quality reviewer worked independently of the source author.').uncheck();
    await page.getByRole('button',{name:'Save completed team review',exact:true}).click();assert.match(await page.locator('#sheetError').innerText(),/independently/);assert.equal(await page.evaluate(()=>__reviewHarness.calls.length),0);
  });
  await check('double submit saves one atomic closeout and exact IDs/history survive reload',async()=>{
    const before=fixture();await seed(before);await open();await fill();
    await page.evaluate(()=>__reviewHarness.gate=true);
    await page.locator('#editForm').evaluate(el=>{el.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));el.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
    assert.equal(await page.evaluate(()=>__reviewHarness.calls.length),1);assert(await page.getByRole('button',{name:'Save completed team review',exact:true}).isDisabled());
    await page.evaluate(()=>__reviewHarness.release());await saved();
    const after=await store();assert.equal(after.revision,before.revision+1);assert.equal(after.tasks[0].status,'done');assert.equal(after.tasks[1].status,'done');
    assert.equal(after.tasks[0].result,before.tasks[0].result);assert.deepEqual(after.tasks[0].sources,before.tasks[0].sources);assert.equal(after.tasks[0].reviewHistory.length,1);assert.equal(after.tasks[1].reviewHistory.length,1);
    for(const key of ['leads','deals','cash','outreach','paused'])assert.deepEqual(after[key],before[key]);assert.deepEqual(after.tasks[2],before.tasks[2]);
    const receiptId=after.tasks[0].reviewHistory[0].closeoutId;assert.equal(after.tasks[1].qualityHistory[0].closeoutId,receiptId);
    await page.getByRole('button',{name:'Open source assignment',exact:true}).click();await page.reload();
    await page.getByText('Review history · 1 rounds',{exact:true}).click();assert.match(await page.locator('#sheetBody').innerText(),new RegExp(receiptId));
    await page.getByText('Completed team review evidence',{exact:true}).click();assert.equal(await page.getByRole('link',{name:'Open exact Quality assignment →',exact:true}).getAttribute('href'),'#team/task/qa');
    await page.getByRole('link',{name:'Open exact Quality assignment →',exact:true}).click();await page.reload();assert.match(await page.locator('#sheetBody').innerText(),/Actual synthetic independent review: pass/);
    assert.deepEqual(await store(),after);assert.equal(await page.evaluate(()=>localStorage.getItem('syntheticUntouched')),'Keep exactly');
  });
  await check('optimistic cloud receipt cannot report saved while dispatch is unresolved or writes remain pending',async()=>{
    const before=fixture();await seed(before);await page.evaluate(()=>{__reviewHarness.cloud();__reviewHarness.gate=true;});await open();await fill();const fields=await draft();
    await page.getByRole('button',{name:'Save completed team review',exact:true}).click();
    await page.waitForFunction(()=>__reviewHarness.calls.length===1);
    await page.evaluate(()=>{__reviewHarness.receipt();__reviewHarness.cloud({pending:true});__reviewHarness.emit('agents');});
    assert.equal(await page.locator('#sheetTitle').innerText(),'Record completed team review','An optimistic matching receipt must not claim a cloud save before dispatch settles');
    assert.deepEqual(await draft(),fields);assert.deepEqual(await store(),before);assert.equal(await page.evaluate(()=>__reviewHarness.settled),0);
    await page.getByRole('button',{name:'Check saved receipt',exact:true}).click();assert.equal(await page.locator('#sheetTitle').innerText(),'Record completed team review');
    await page.evaluate(()=>{__reviewHarness.cloud();__reviewHarness.emit('agents');});
    assert.equal(await page.locator('#sheetTitle').innerText(),'Record completed team review','Even a confirmed listener receipt must wait for this dispatch to settle');
    await page.evaluate(()=>__reviewHarness.cloud({pending:true}));
    await page.evaluate(()=>__reviewHarness.release());await page.waitForFunction(()=>__reviewHarness.settled===1);
    assert.equal(await page.locator('#sheetTitle').innerText(),'Record completed team review','Settled dispatch alone does not confirm a pending listener receipt');
    await page.evaluate(()=>{__reviewHarness.cloud();__reviewHarness.emit('agents');});await saved();
    assert.match(await page.locator('#sheetBody').innerText(),/Saved in the connected account/);assert.equal(await page.evaluate(()=>__reviewHarness.calls.length),1);
  });
  await check('rejected cloud dispatch retains its draft and needs an exact server-confirmed receipt to recover',async()=>{
    const before=fixture();await seed(before);await page.evaluate(()=>{__reviewHarness.cloud();__reviewHarness.gate=true;__reviewHarness.rejectBefore=true;});await open();await fill();const fields=await draft();
    await page.getByRole('button',{name:'Save completed team review',exact:true}).click();await page.waitForFunction(()=>__reviewHarness.calls.length===1);
    const exact=await page.evaluate(()=>{const exact=__reviewHarness.receipt();__reviewHarness.cloud({pending:true});__reviewHarness.emit('agents');return exact;});
    assert.equal(await page.locator('#sheetTitle').innerText(),'Record completed team review');
    await page.evaluate(()=>__reviewHarness.release());await page.waitForFunction(()=>__reviewHarness.settled===1);
    await page.locator('#sheetError').filter({hasText:/Synthetic old request rejected/}).waitFor();assert.deepEqual(await draft(),fields);assert.deepEqual(await store(),before);
    await page.getByRole('button',{name:'Check saved receipt',exact:true}).click();assert.equal(await page.locator('#sheetTitle').innerText(),'Record completed team review');
    await page.evaluate(()=>{__reviewHarness.cloud({cached:true});__reviewHarness.emit('agents');});
    await page.getByRole('button',{name:'Check saved receipt',exact:true}).click();assert.equal(await page.locator('#sheetTitle').innerText(),'Record completed team review','Cached evidence is not server confirmation');
    await page.evaluate(()=>{
      const receipt=__reviewHarness.heldState.tasks[0].reviewHistory[0].completedReview;
      receipt.request.attribution.evidence='Different synthetic request on the same receipt';__reviewHarness.cloud();__reviewHarness.emit('agents');
    });
    await page.locator('#sheetError').filter({hasText:/different request uses this receipt ID/}).waitFor();assert.deepEqual(await draft(),fields);
    await page.evaluate(state=>{__reviewHarness.heldState=state;__reviewHarness.emit('agents');},exact);await saved();
    assert.match(await page.locator('#sheetBody').innerText(),/Saved in the connected account/);assert.equal(await page.evaluate(()=>__reviewHarness.calls.length),1);assert.deepEqual(await store(),before);
  });
  await check('an exact server receipt cannot complete a pending review after its account changes',async()=>{
    const before=fixture();await seed(before);await page.evaluate(()=>{__reviewHarness.cloud();__reviewHarness.gate=true;__reviewHarness.rejectBefore=true;});await open();await fill();const fields=await draft();
    await page.getByRole('button',{name:'Save completed team review',exact:true}).click();await page.waitForFunction(()=>__reviewHarness.calls.length===1);
    await page.evaluate(()=>{__reviewHarness.receipt();__reviewHarness.cloud();__reviewHarness.statusOverride.uid='different_synthetic_cloud_account';__reviewHarness.statusOverride.epoch=2;__reviewHarness.emit('account');__reviewHarness.emit('agents');});
    assert.equal(await page.locator('#sheetTitle').innerText(),'Record completed team review');
    assert.deepEqual(JSON.parse(await page.getByLabel('Retained original-account review draft').inputValue()).fields,fields);
    await page.evaluate(()=>__reviewHarness.release());await page.waitForFunction(()=>__reviewHarness.settled===1);
    assert.equal(await page.locator('#sheetTitle').innerText(),'Record completed team review');assert.deepEqual(await store(),before);
  });
  await check('accepted QA is reused unchanged and adverse findings require source correction',async()=>{
    const before=fixture('done');await seed(before);await open();assert.equal(await page.locator('#f_qaResult,#f_qaNote').count(),0);await fill({reuse:true});
    await page.getByRole('button',{name:'Save completed team review',exact:true}).click();await saved();assert.deepEqual((await store()).tasks[1],before.tasks[1]);
    for(const verdict of ['revise','blocked']){
      const initial=fixture('review',verdict);await seed(initial);await open();assert(await page.locator('#f_decision option[value=accept]').evaluate(el=>el.disabled),await page.locator('#f_verdict').inputValue());
      await fill({verdict,decision:'revise'});await page.getByRole('button',{name:'Save completed team review',exact:true}).click();await saved();
      const state=await store();assert.equal(state.tasks[0].status,'blocked');assert.equal(state.tasks[0].blockerKind,'correction');assert.equal(state.tasks[1].status,'done');assert.equal(state.tasks[1].result,initial.tasks[1].result);
    }
  });
  await check('source checks record actual failures while the accurate QA finding is accepted',async()=>{
    for(const verdict of ['revise','blocked']){
      const before=fixture();await seed(before);await open();
      for(const part of ['Evidence','Arithmetic','Fit']){
        assert.deepEqual(await page.locator('#f_source'+part+' option').evaluateAll(options=>options.map(o=>o.value)),['unchecked','pass','na','revise','blocked']);
        assert.deepEqual(await page.locator('#f_qa'+part+' option').evaluateAll(options=>options.map(o=>o.value)),['unchecked','pass','na']);
      }
      assert.match(await page.locator('[data-completed-review-correction-guidance]').innerText(),/accepts the Quality review, not the source.*Return source for correction.*submit the corrected source result/);
      await fill({verdict,decision:'revise'});await page.locator('#f_sourceEvidence').selectOption(verdict);
      await page.getByRole('button',{name:'Save completed team review',exact:true}).click();await saved();
      const state=await store();assert.equal(state.tasks.length,before.tasks.length);assert.equal(state.tasks[0].status,'blocked');assert.equal(state.tasks[1].status,'done');assert.equal(state.tasks[1].qualityVerdict,verdict);
      assert.equal(state.tasks[0].reviewHistory[0].review.checks.evidence,verdict);assert.equal(state.tasks[0].reviewHistory[0].result,before.tasks[0].result);
      await page.getByRole('button',{name:'Open source assignment',exact:true}).click();assert(await page.getByRole('button',{name:'Submit result',exact:true}).isVisible());
    }
  });
  await check('failed source checks cannot be accepted even with a PASS Quality finding',async()=>{
    for(const check of ['revise','blocked']){
      const before=fixture();await seed(before);await open();await fill();await page.locator('#f_sourceEvidence').selectOption(check);
      await page.getByRole('button',{name:'Save completed team review',exact:true}).click();assert.match(await page.locator('#sheetError').innerText(),/Resolve failed or unchecked criteria before accepting/);
      assert.equal(await page.evaluate(()=>__reviewHarness.calls.length),0);assert.deepEqual(await store(),before);
    }
  });
  await check('cross-tab stale revision preserves the full dirty draft and never retargets',async()=>{
    const before=fixture();await seed(before);await open();await fill();await page.locator('#f_sourceNote').fill('My complete unsaved decision stays here.');const fields=await draft();
    const second=await context.newPage();await second.goto(origin+'/crm/');await second.getByRole('heading',{name:'Control Center',exact:true}).waitFor();
    await second.evaluate(()=>__reviewHarness.data.dispatch('task.add',{id:'cross_tab',title:'Synthetic other-tab change',brief:'Unrelated real store conflict',role:'supply'},__reviewHarness.data.agent().revision));
    await page.waitForFunction(rev=>__reviewHarness.data.agent().revision===rev,before.revision+1);const other=await store();
    assert.deepEqual(await draft(),fields);await page.getByRole('button',{name:'Save completed team review',exact:true}).click();
    await page.locator('#sheetError').filter({hasText:/another window/}).waitFor();assert.deepEqual(await draft(),fields);assert.deepEqual(await store(),other);
    assert.equal(await page.evaluate(()=>__reviewHarness.calls[0].revision),before.revision);await page.getByRole('button',{name:'Save completed team review',exact:true}).click();assert.deepEqual(await store(),other);
    await second.close();
  });
  await check('uncertain post-commit failure reconciles the exact saved receipt without a second dispatch',async()=>{
    const before=fixture();await seed(before);await open();await fill();const fields=await draft();await page.evaluate(()=>__reviewHarness.throwAfter=true);
    await page.getByRole('button',{name:'Save completed team review',exact:true}).click();await page.locator('#sheetError').filter({hasText:/interrupted after commit/}).waitFor();assert.deepEqual(await draft(),fields);
    const committed=await store();assert.equal(committed.revision,before.revision+1);assert.equal(await page.evaluate(()=>__reviewHarness.calls.length),1);
    await page.evaluate(()=>__reviewHarness.heldState=null);await page.getByRole('button',{name:'Check saved receipt',exact:true}).click();await saved();
    assert.equal(await page.evaluate(()=>__reviewHarness.calls.length),1);assert.deepEqual(await store(),committed);
  });
  await check('account switch retains a copyable original draft and cannot write into the new account',async()=>{
    const before=fixture();await seed(before);await open();await fill();const fields=await draft();
    await page.evaluate(()=>{__reviewHarness.statusOverride={uid:'synthetic_other_account',epoch:1};__reviewHarness.emit('account');});
    assert(await page.locator('#sheet').evaluate(el=>el.open));assert.match(await page.locator('#completedReviewNotice').innerText(),/cannot be saved here/);
    const retained=JSON.parse(await page.getByLabel('Retained original-account review draft').inputValue());assert.deepEqual(retained.fields,fields);assert.equal(retained.boardRevision,before.revision);assert.equal(retained.sourceId,'source');
    assert(await page.getByRole('button',{name:'Save completed team review',exact:true}).isDisabled());
    await page.locator('#editForm').dispatchEvent('submit');assert.equal(await page.evaluate(()=>__reviewHarness.calls.length),0);assert.deepEqual(await store(),before);
  });
  await check('settling a closed form does not reopen it or replace a different selected record',async()=>{
    for(const failure of [false,true]){
      const before=fixture();await seed(before);await open();await fill();await page.evaluate(fail=>{__reviewHarness.gate=true;__reviewHarness.rejectBefore=fail;},failure);
      await page.getByRole('button',{name:'Save completed team review',exact:true}).click();await page.waitForFunction(()=>__reviewHarness.calls.length===1);
      await page.getByRole('button',{name:'Close panel',exact:true}).click();
      if(failure)await page.evaluate(()=>{__reviewHarness.statusOverride={uid:'synthetic_new_account',epoch:1,agent:{uid:'synthetic_new_account',mode:'cloud',serverConfirmed:true}};__reviewHarness.emit('account');});
      await page.goto(origin+'/crm/#team/task/unrelated');await page.getByRole('heading',{name:'Untouched synthetic supplier task',exact:true}).waitFor();
      await page.evaluate(()=>__reviewHarness.release());await page.waitForFunction(()=>__reviewHarness.settled===1);
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      assert.equal(await page.locator('#sheetTitle').innerText(),'Team assignment');assert(await page.getByRole('heading',{name:'Untouched synthetic supplier task',exact:true}).isVisible());
      assert(await page.locator('#sheetError').isHidden());assert.equal(await page.locator('#f_retainedDraft').count(),0);
      if(failure)assert.deepEqual(await store(),before);else assert.equal((await store()).tasks[0].status,'done');
    }
  });
  await check('form fits a narrow viewport without runtime errors, missing assets or write requests',async()=>{
    await seed(fixture());await open();await fill();await page.setViewportSize({width:390,height:850});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert(await page.locator('#sheet').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    await page.screenshot({path:path.join(out,'form-mobile.png'),fullPage:true});assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);assert(requests.every(r=>r.method==='GET'));
  });
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({checks,syntheticOnly:true},null,2));
})().catch(async error=>{console.error(error.stack);if(page)await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({checks,error:error.stack},null,2));process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
