/* Synthetic loopback browser checks only. Every external or non-GET request is blocked. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||'../tools/.cache/hosting-terrain-browser/node_modules/playwright-core');
const {createServer}=require('../tools/preview-crm.cjs'),A=require('../agent-control-model');
const server=createServer(),out=path.resolve(__dirname,'../reports/crm-workbench-review-guidance-20260921/browser');
const KEY='protonAgentControlLocal_v1',JOURNAL='protonCompletedReviewWorkbench_v1:synthetic_revenue',AT='2026-09-21T12:00:00Z';
const report={syntheticOnly:true,checks:[],pageErrors:[],missingAssets:[],blockedWrites:[],blockedExternal:[]};
let browser,context,page,origin,sequence=0,initialAuth='authenticated';
const apply=(s,type,payload)=>A.reduce(s,{type,payload,revision:s.revision,id:'synthetic_'+(++sequence),at:AT});
function fixture(){
  let s=A.initial();
  const add=(id,role='analysis')=>{s=apply(s,'task.add',{id,role,title:'Synthetic '+id,brief:'Synthetic browser fixture; no real work.'});};
  add('source');s=apply(s,'task.ready',{id:'source'});s=apply(s,'task.result',{id:'source',result:'Exact source remains unchanged <img src=x>.',sources:['https://example.test/source']});
  s=apply(s,'task.add',{id:'qa',role:'review',title:'Synthetic native Quality',brief:'Independent exact-version review.',parentTaskId:'source'});s=apply(s,'task.ready',{id:'qa'});
  for(const kind of ['reference','superseded']){add(kind);s=apply(s,'task.route',{id:kind,kind,reviewOwner:'team',reason:'Synthetic historical routing.',recordedBy:'Synthetic Revenue'});}
  add('owner');s=apply(s,'task.route',{id:'owner',kind:'work',reviewOwner:'owner',reason:'Synthetic spending decision.',recordedBy:'Synthetic Revenue'});
  add('draft');add('ready');s=apply(s,'task.ready',{id:'ready'});add('working');s=apply(s,'task.ready',{id:'working'});s=apply(s,'task.start',{id:'working'});
  add('blocked');s=apply(s,'task.block',{id:'blocked',reason:'Synthetic original evidence unavailable.',blockerKind:'execution'});
  add('done','review');s=apply(s,'task.ready',{id:'done'});s=apply(s,'task.result',{id:'done',result:'Synthetic previously completed independent review.',sources:['https://example.test/previous-review'],qualityVerdict:'pass'});
  s=apply(s,'task.accept',{id:'done',note:'Synthetic previously recorded coordinator decision.',review:{actor:'coordinator',reviewer:'Synthetic Revenue',basis:'Synthetic prior review evidence.',checks:{evidence:'pass',arithmetic:'na',fit:'pass'}}});
  add('cancelled');s=apply(s,'task.cancel',{id:'cancelled'});
  s=apply(s,'lead.save',{id:'lead',company:'Synthetic untouched buyer',website:'https://example.test/',offer:'research',channel:'direct',stage:'discovered'});
  return apply(s,'pause',{});
}
function reviewFixture(status='draft',siblings=false,paused=true){
  let s=A.initial();
  s=apply(s,'task.add',{id:'source',role:'analysis',title:'Synthetic source',brief:'Research source https://example.test/evidence/2024; preserve its published year 2024.'});
  s=apply(s,'task.ready',{id:'source'});s=apply(s,'task.result',{id:'source',result:'Original source finding from 2024 remains unchanged.',sources:['https://example.test/evidence/2024']});
  if(siblings){
    s=apply(s,'task.add',{id:'qa_duplicate',role:'review',parentTaskId:'source',title:'Synthetic duplicate linked Quality',brief:'An existing linked assignment, not a request to create another.'});
    s=apply(s,'task.route',{id:'qa_duplicate',kind:'reference',reviewOwner:'team',reason:'An existing archived duplicate; retain its exact ID.',recordedBy:'Synthetic Revenue'});
    s=apply(s,'task.add',{id:'qa_cancelled',role:'review',parentTaskId:'source',title:'Synthetic cancelled linked Quality',brief:'Historic linked assignment.'});s=apply(s,'task.cancel',{id:'qa_cancelled'});
    s=apply(s,'task.add',{id:'qa_unrelated',role:'review',title:'Unrelated Quality',brief:'Must not appear as linked to source.'});
  }
  s=apply(s,'task.add',{id:'qa',role:'review',parentTaskId:'source',title:'Synthetic exact Quality',brief:'Review the source at https://example.test/evidence/2024 and its published year 2024. No year correction has been authorized.'});
  if(status!=='draft')s=apply(s,'task.ready',{id:'qa'});
  if(status==='review')s=apply(s,'task.result',{id:'qa',result:'Immutable original independent review.',sources:['https://example.test/quality'],qualityVerdict:'revise',confirmCurrentSource:true});
  return paused?apply(s,'pause',{}):s;
}
function correctedSourceFixture(){
  let s=reviewFixture('review',false,false);
  const review={actor:'coordinator',reviewer:'Synthetic Revenue',basis:'Actual synthetic v1 REVISE.',checks:{evidence:'pass',arithmetic:'na',fit:'pass'}};
  s=apply(s,'task.accept',{id:'qa',note:'Accept accurate independent REVISE.',review});
  s=apply(s,'task.revise',{id:'source',note:'Correct the v1 source.',review:{...review,evidenceTaskId:'qa',checks:{evidence:'revise',arithmetic:'na',fit:'pass'}}});
  return apply(s,'task.result',{id:'source',result:'Corrected synthetic source version two.',sources:['https://example.test/source-v2']});
}

// Inject only in the fake server response. Dispatch still executes the real CRM
// adapter, local store lock and reducer. No Firebase identity or remote write exists.
const instrument=`
(function(){
  const create=ProtonCrmData.create;
  const phase=window.__workbenchTestAuth||'authenticated';
  const h=window.__workbenchHarness={calls:[],reads:0,listeners:[],uid:phase==='authenticated'?'synthetic_revenue':null,epoch:phase==='authenticated'?1:0,ready:phase!=='loading',hydrated:phase==='authenticated',gateRead:false,throwAfter:false,failRead:false};
  ProtonCrmData.create=function(){
    const d=create(),dispatch=d.dispatch,read=d.agent,status=d.status,subscribe=d.subscribe;h.data=d;
    d.status=()=>({...status(),uid:h.uid,epoch:h.epoch,ready:h.ready,error:'',agent:{uid:h.uid,mode:h.uid?(h.hydrated?'cloud':'connecting'):'local',serverConfirmed:!!h.uid&&h.hydrated}});
    d.subscribe=fn=>{h.listeners.push(fn);subscribe(fn);return()=>{h.listeners=h.listeners.filter(item=>item!==fn);};};
    d.readAgentRegister=async()=>{
      h.reads++;const uid=h.uid,epoch=h.epoch;
      if(!uid||!h.ready||!h.hydrated)throw Error('Synthetic account is not server-confirmed.');
      if(h.gateRead){h.gateRead=false;await new Promise(resolve=>{h.releaseRead=resolve;});}
      if(h.failRead)throw Error('Synthetic fresh read unavailable.');
      return {uid,epoch,serverConfirmed:true,observedAt:new Date().toISOString(),state:JSON.parse(JSON.stringify(read()))};
    };
    d.dispatch=async(type,payload,revision)=>{
      h.calls.push({type,payload:JSON.parse(JSON.stringify(payload)),revision});
      await dispatch(type,payload,revision);
      if(h.throwAfter){h.failRead=true;throw Error('Synthetic response lost after commit.');}
    };
    h.emit=reason=>{for(const fn of [...h.listeners])fn(reason);};
    h.authenticate=()=>{h.uid='synthetic_revenue';h.epoch++;h.ready=true;h.hydrated=false;h.emit('account');};
    h.hydrate=()=>{h.hydrated=true;h.emit('agents');};
    h.changeAccount=()=>{h.uid='synthetic_other';h.epoch++;h.ready=true;h.hydrated=true;h.emit('account');};
    h.push=state=>{localStorage.setItem('protonAgentControlLocal_v1',JSON.stringify(state));window.dispatchEvent(new StorageEvent('storage',{key:'protonAgentControlLocal_v1'}));};
    return d;
  };
})();`;
const button=name=>page.getByRole('button',{name,exact:true});
const entry=()=>page.getByRole('link',{name:'Agent workbench',exact:true});
const jsonInput=()=>page.getByLabel('Completed team review JSON',{exact:true});
const independent=()=>page.getByLabel('The actual Quality reviewer worked independently of the source author.',{exact:true});
const exact=()=>page.getByLabel('The actual review covers this exact source result, evidence, recipient and scope.',{exact:true});
const verdict=()=>page.getByLabel(/^Actual Quality verdict/);
const finding=()=>page.getByLabel('Original completed Quality finding',{exact:true});
const correction=()=>page.getByLabel('Factual transcription correction (optional)',{exact:true});
const guidance=()=>page.locator('#agentWorkbench [data-wb=guidance]');
const notice=()=>page.locator('#agentWorkbench [role=status]');
const output=async()=>JSON.parse(await page.locator('#agentWorkbench [data-wb=output]').textContent());
const state=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
const journal=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),JOURNAL);
async function check(name,fn){await fn();report.checks.push({name,passed:true});console.log('PASS '+name);}
async function idle(){await button('Read current register').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#agentWorkbench [data-wb=refresh]').disabled);}
async function mounted(){await page.getByRole('heading',{name:'Agent workbench',exact:true}).waitFor();await jsonInput().waitFor({state:'visible'});assert.equal(new URL(page.url()).hash,'#team/workbench');}
async function open(){await entry().click();await mounted();}
async function seed(s=fixture()){
  initialAuth='authenticated';await page.goto(origin+'/crm/#team');
  await page.evaluate(({key,value})=>{localStorage.clear();localStorage.setItem(key,JSON.stringify(value));localStorage.setItem('syntheticUntouched','Retain exactly');},{key:KEY,value:s});
  await page.reload();await entry().waitFor();await open();return s;
}
async function loadPair(){
  await page.getByLabel('Source task ID',{exact:true}).fill('source');await page.getByLabel('Quality task ID',{exact:true}).fill('qa');
  await button('Load exact pair and template').click();await idle();return JSON.parse(await jsonInput().inputValue());
}
async function prefillFields(value='revise'){
  await page.getByText('Prefill from an already completed review',{exact:true}).click();
  await verdict().selectOption(value);
  const original='Actual independent '+value.toUpperCase()+': original 2024 evidence requires follow-up, https://example.test/evidence/2024.';
  const corrected='Factual transcription correction: the original finding said 2023; the cited source is dated 2024.';
  await finding().fill(original);await correction().fill(corrected);return {original,corrected};
}
async function fill(){
  const input=await loadPair(),p=input.payload;
  p.attribution={...p.attribution,reviewer:'Synthetic native Quality',recordedBy:'Synthetic Revenue',reviewedAt:'2026-09-21T11:00:00Z',evidence:'native-artifact:synthetic-original-quality',verdict:'pass'};
  for(const d of [p.qaReview,p.sourceDecision].filter(Boolean)){d.note='Checked the original independent finding.';d.review.reviewer='Synthetic Revenue';d.review.basis='Exact source and native review evidence.';d.review.checks={evidence:'pass',arithmetic:'na',fit:'pass'};}
  p.sourceDecision.decision='accept';if(p.qaResult)Object.assign(p.qaResult,{result:'Actual synthetic independent PASS.',sources:['https://example.test/qa'],verdict:'pass'});
  await jsonInput().fill(JSON.stringify(input,null,2));return input;
}
async function prepare(){await fill();await independent().check();await exact().check();await button('Preview completed review').click();await idle();assert.equal((await output()).status,'prepared');}

(async()=>{
  fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block',reducedMotion:'reduce'});
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(request.method()!=='GET'){report.blockedWrites.push({url:request.url(),method:request.method()});return route.abort();}
    if(url.origin!==origin){report.blockedExternal.push(url.origin);return route.abort();}
    if(url.pathname==='/crm/crm-data.js'){const response=await route.fetch();return route.fulfill({response,body:await response.text()+'\nwindow.__workbenchTestAuth='+JSON.stringify(initialAuth)+';\n'+instrument});}
    return route.continue();
  });
  page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>report.pageErrors.push(error.message));
  page.on('response',response=>{if(new URL(response.url()).origin===origin&&response.status()>=400)report.missingAssets.push(response.url());});

  await check('direct workbench route waits for settled auth and the authenticated register before mounting an editor',async()=>{
    initialAuth='loading';await page.goto(origin+'/crm/#team/workbench');await page.waitForFunction(()=>!!window.__workbenchHarness?.data);
    assert.equal(new URL(page.url()).search,'');assert.equal(new URL(page.url()).hash,'#team/workbench');assert.equal(await jsonInput().count(),0);assert.equal(await page.locator('#agentWorkbench').count(),0);
    assert.equal(await page.evaluate(()=>__workbenchHarness.reads),0);assert.equal(await page.evaluate(()=>__workbenchHarness.calls.length),0);
    await page.evaluate(()=>__workbenchHarness.authenticate());assert.equal(await jsonInput().count(),0,'Auth alone must not expose an unconfirmed register');
    await page.evaluate(()=>__workbenchHarness.hydrate());await mounted();assert.equal(await jsonInput().inputValue(),'');assert.equal(await page.evaluate(()=>__workbenchHarness.reads),0,'Opening the workbench does not fetch or mutate');
  });
  await check('anonymous direct route exposes sign-in guidance without a private editor, register or retained operation',async()=>{
    await page.evaluate(({key,journalKey,value})=>{localStorage.setItem(key,JSON.stringify(value));localStorage.setItem(journalKey,JSON.stringify({uid:'synthetic_revenue',revision:value.revision,closeoutId:'anonymous_private_operation',request:{closeoutId:'anonymous_private_operation'},status:'prepared'}));},{key:KEY,journalKey:JOURNAL,value:fixture()});
    initialAuth='anonymous';await page.goto(origin+'/crm/#team/workbench');await page.reload();await page.waitForFunction(()=>!!window.__workbenchHarness?.data);
    await page.getByRole('heading',{name:'Agent workbench',exact:true}).waitFor();
    assert.equal(await jsonInput().count(),0);assert.equal(await page.locator('#agentWorkbench').count(),0);assert.match(await page.locator('#sheetBody').innerText(),/sign in|signed.in|connect/i);
    assert.doesNotMatch(await page.locator('#sheetBody').innerText(),/Exact source remains|native-artifact|synthetic_revenue|anonymous_private_operation/);assert.equal(await page.evaluate(()=>__workbenchHarness.reads),0);
    await page.evaluate(()=>{__workbenchHarness.authenticate();__workbenchHarness.hydrate();});await mounted();assert.equal(await page.evaluate(()=>__workbenchHarness.reads),0);
  });
  await check('Team entry uses the stable route and closing returns to Team without another mount',async()=>{
    await seed();await button('Close panel').click();await page.waitForFunction(()=>location.hash==='#team');assert.equal(await page.locator('#sheet').evaluate(el=>el.open),false);
    await entry().waitFor({state:'visible'});assert.equal(await entry().getAttribute('href'),'#team/workbench');await open();assert.equal(await page.evaluate(()=>__workbenchHarness.reads),0);
    await page.keyboard.press('Escape');await page.waitForFunction(()=>location.hash==='#team');await page.evaluate(()=>__workbenchHarness.emit('agents'));
    assert.equal(await page.locator('#sheet').evaluate(el=>el.open),false,'Later snapshots must not reopen a dismissed route');
  });
  await check('refresh classifies the complete register while outreach remains HOLD',async()=>{
    const before=await seed();await button('Read current register').click();await idle();
    const projection=JSON.parse(await page.locator('#agentWorkbench [data-wb=register]').textContent());
    assert.deepEqual(projection.tasks.map(task=>task.id).sort(),before.tasks.map(task=>task.id).sort());assert.equal(projection.queuePaused,true);
    for(const kind of ['reference','superseded'])assert.equal(projection.tasks.find(task=>task.id===kind).kind,kind);
    for(const status of ['draft','ready','working','blocked','done','cancelled'])assert.equal(projection.tasks.find(task=>task.id===status).status,status);
    assert.equal(projection.tasks.find(task=>task.id==='owner').bucket,'owner');
    assert(projection.tasks.find(task=>task.id==='source').completedReviewOptions.some(option=>option.qaId==='qa'&&option.eligible));
    assert.doesNotMatch(JSON.stringify(projection),/"(?:brief|result|history)"\s*:/,'Classification must not embed complete task or Quality records');
    const refreshed=await output();assert(!Object.hasOwn(refreshed,'snapshot'));assert(!Object.hasOwn(refreshed,'state'));
    assert.doesNotMatch(JSON.stringify(refreshed),/Synthetic untouched buyer|Exact source remains unchanged|"leads"|"tasks"\s*:\s*\[/);
    assert.match(JSON.stringify(refreshed),/synthetic_revenue/);assert.match(JSON.stringify(refreshed),/observedAt/);
    assert.equal(refreshed.taskCount,before.tasks.length);assert.equal(refreshed.revision,before.revision);assert.equal(refreshed.serverConfirmed,true);assert.equal(refreshed.retainedOperation,null);
    assert.match(await page.locator('#agentWorkbench').innerText(),/Existing sending holds remain in effect/);assert.deepEqual(await state(),before);
  });
  await check('exact pair previews one JSON payload with two initially unchecked confirmations',async()=>{
    const before=await seed();const template=await loadPair();assert.equal(template.payload.sourceId,'source');assert.equal(template.payload.qaId,'qa');assert.equal(template.payload.expectedSourceVersion,1);assert.equal(template.payload.expectedQaVersion,0);
    assert.equal(await independent().isChecked(),false);assert.equal(await exact().isChecked(),false);assert.equal(await jsonInput().count(),1);
    assert.equal(await page.locator('#agentWorkbench img').count(),0);assert.match(await page.locator('#agentWorkbench [data-wb=pair]').innerText(),/Exact source remains unchanged <img src=x>/);
    assert.deepEqual(JSON.parse(await page.locator('#agentWorkbench [data-wb=pair]').textContent()),before.tasks.filter(task=>['source','qa'].includes(task.id)),'Explicit pair inspection retains both complete original task records');
    await fill();await button('Preview completed review').click();await idle();assert.match(await notice().innerText(),/confirm.*independent/i);assert.equal(await journal(),null);
    await independent().check();await button('Preview completed review').click();await idle();assert.equal(await journal(),null);assert.equal(await page.evaluate(()=>__workbenchHarness.calls.length),0);
  });
  await check('blank and uppercase verdicts report all exact JSON paths without inferred approval or a retained operation',async()=>{
    const before=await seed(),blank=await loadPair();
    assert.equal(await verdict().inputValue(),'');assert.equal(blank.payload.attribution.verdict,'');assert.equal(blank.payload.qaResult.verdict,'');
    await independent().check();await exact().check();await button('Preview completed review').click();await idle();
    const missing=await notice().innerText();
    for(const path of ['payload.attribution.verdict','payload.qaResult.verdict','payload.attribution.reviewer','payload.attribution.reviewedAt','payload.attribution.evidence','payload.attribution.recordedBy','payload.qaResult.result','payload.sourceDecision.decision'])assert(missing.includes(path),path);
    assert.match(missing,/lowercase/);assert.equal(await verdict().inputValue(),'');assert.equal(await journal(),null);assert.equal(await page.evaluate(()=>__workbenchHarness.calls.length),0);
    const invalid=await fill();invalid.payload.attribution.verdict='PASS';invalid.payload.qaResult.verdict='PASS';
    await jsonInput().fill(JSON.stringify(invalid,null,2));await independent().check();await exact().check();await button('Preview completed review').click();await idle();
    const uppercase=await notice().innerText();assert.match(uppercase,/payload\.attribution\.verdict/);assert.match(uppercase,/payload\.qaResult\.verdict/);assert.match(uppercase,/lowercase/);
    assert.equal(await verdict().inputValue(),'');assert.equal(await journal(),null);assert.equal(await page.evaluate(()=>__workbenchHarness.calls.length),0);assert.deepEqual(await state(),before);
  });
  await check('linked Quality discovery reads every existing assignment and requires explicit selection without creating work',async()=>{
    const before=await seed(reviewFixture('ready',true)),reads=await page.evaluate(()=>__workbenchHarness.reads);
    await page.getByLabel('Source task ID',{exact:true}).fill('source');await button('Find linked Quality').click();await idle();
    const linked=page.locator('#agentWorkbench [data-wb=linked]');
    assert.equal(await linked.getByRole('button',{name:'Use this Quality assignment',exact:true}).count(),3);
    for(const id of ['qa_duplicate','qa_cancelled','qa'])assert(await linked.locator('p').filter({hasText:new RegExp('^'+id+' ·')}).count());
    assert.doesNotMatch(await linked.innerText(),/qa_unrelated/);assert.equal(await page.getByLabel('Quality task ID',{exact:true}).inputValue(),'');
    assert.equal(await page.evaluate(()=>__workbenchHarness.reads),reads+1);
    await linked.locator('p').filter({hasText:/^qa_duplicate ·/}).getByRole('button',{name:'Use this Quality assignment',exact:true}).click();
    assert.equal(await page.getByLabel('Quality task ID',{exact:true}).inputValue(),'qa_duplicate');assert.equal(await jsonInput().inputValue(),'');
    assert.equal(await page.evaluate(()=>__workbenchHarness.reads),reads+1,'Explicit selection only chooses the existing ID');
    await button('Find linked Quality').click();await idle();
    assert.equal(await linked.getByRole('button',{name:'Use this Quality assignment',exact:true}).count(),3);
    assert.equal(await page.evaluate(()=>__workbenchHarness.calls.length),0);assert.equal(await journal(),null);assert.deepEqual(await state(),before);
  });
  await check('closed stale reviews point to the corrected source without reusing old findings or creating work',async()=>{
    const before=await seed(correctedSourceFixture());await page.getByLabel('Source task ID',{exact:true}).fill('source');
    await button('Find linked Quality').click();await idle();
    assert.match(await guidance().innerText(),/cannot certify version 2.*Request Quality Review once.*Ready for handoff/);
    const linked=page.locator('#agentWorkbench [data-wb=linked]');assert.equal(await linked.getByRole('button',{name:'Use this Quality assignment',exact:true}).count(),1);assert.match(await linked.innerText(),/qa · done/);
    assert.equal(await linked.getByRole('link',{name:'Open source assignment',exact:true}).getAttribute('href'),'#team/task/source');
    await linked.getByRole('button',{name:'Use this Quality assignment',exact:true}).click();await button('Load exact pair and template').click();await idle();
    assert.match(await notice().innerText(),/cannot certify version 2/);assert.equal(await linked.getByRole('link',{name:'Open source assignment',exact:true}).getAttribute('href'),'#team/task/source');
    assert.equal(await jsonInput().inputValue(),'');assert(await button('Record completed team review').isDisabled());assert.equal(await journal(),null);assert.equal(await page.evaluate(()=>__workbenchHarness.calls.length),0);assert.deepEqual(await state(),before);
    await linked.getByRole('link',{name:'Open source assignment',exact:true}).click();await button('Request Quality Review').click();
    await page.getByRole('heading',{name:'New assignment',exact:true}).waitFor();assert.match(await page.getByLabel('Brief & expected result',{exact:true}).inputValue(),/Corrected synthetic source version two/);
    assert.equal(await page.evaluate(()=>__workbenchHarness.calls.length),0);assert.deepEqual(await state(),before);
  });
  await check('current or open reviews, unknown versions and a paused queue never suggest replacement QA',async()=>{
    for(const kind of ['current','open','unknown','paused']){
      let initial=correctedSourceFixture();
      if(kind==='current')initial=apply(initial,'task.add',{id:'qa_v2',role:'review',title:'Existing v2 QA',brief:'Review this version.',parentTaskId:'source'});
      else if(kind==='open')initial.tasks.find(t=>t.id==='qa').status='review';
      else if(kind==='unknown')delete initial.tasks.find(t=>t.id==='qa').reviewOfVersion;
      else initial=apply(initial,'pause',{});
      const before=await seed(initial);await page.getByLabel('Source task ID',{exact:true}).fill('source');await button('Find linked Quality').click();await idle();
      assert.doesNotMatch(await guidance().innerText(),/Request Quality Review once/,kind);if(kind==='paused')assert.match(await guidance().innerText(),/queue is paused/);
      assert.equal(await page.locator('#agentWorkbench [data-wb=linked]').getByRole('button',{name:'Use this Quality assignment',exact:true}).count(),kind==='current'?2:1);
      assert.equal(await page.evaluate(()=>__workbenchHarness.calls.length),0);assert.equal(await journal(),null);assert.deepEqual(await state(),before);
    }
  });
  await check('Draft Quality exposes exact evidence and the existing readiness gate without altering its brief or queue hold',async()=>{
    for(const paused of [false,true]){
      const before=await seed(reviewFixture('draft',false,paused));
      await page.getByLabel('Source task ID',{exact:true}).fill('source');await page.getByLabel('Quality task ID',{exact:true}).fill('qa');
      await button('Load exact pair and template').click();await idle();
      const pair=JSON.parse(await page.locator('#agentWorkbench [data-wb=pair]').textContent());assert.deepEqual(pair,before.tasks);
      const qa=pair.find(task=>task.id==='qa');assert.equal(A.resultVersion(qa),0);assert.match(qa.brief,/https:\/\/example\.test\/evidence\/2024/);assert.match(qa.brief,/published year 2024/);
      assert.match(await guidance().innerText(),paused?/Resume the queue before preparing a handoff/:/Draft.*Ready for handoff/);
      assert.equal(await page.getByRole('link',{name:'Open selected Quality assignment',exact:true}).getAttribute('href'),'#team/task/qa');
      assert.equal(await jsonInput().inputValue(),'');assert(await button('Record completed team review').isDisabled());
      assert.equal(await page.locator('#agentWorkbench').getByRole('button',{name:/Claim task|Ready for handoff|rerun|dispatch/i}).count(),0);
      assert.equal(await page.evaluate(()=>__workbenchHarness.calls.length),0);assert.equal(await journal(),null);assert.deepEqual(await state(),before);
    }
  });
  await check('Ready Quality prefills actual REVISE and BLOCKED findings safely while attribution and checks stay explicit',async()=>{
    for(const actualVerdict of ['revise','blocked']){
      const before=await seed(reviewFixture('ready')),pasted=await prefillFields(actualVerdict),input=await loadPair(),p=input.payload;
      assert.equal(p.sourceDecision.decision,'revise');assert.equal(p.attribution.verdict,actualVerdict);assert.equal(p.qaResult.verdict,actualVerdict);
      assert.equal(p.qaResult.result,pasted.original+'\n\nFactual transcription correction (recorded by Revenue):\n'+pasted.corrected);
      assert.deepEqual(p.qaResult.sources,[]);assert.equal(Object.hasOwn(p.qaReview,'decision'),false,'Quality artifact acceptance must remain distinct from source revision');
      for(const name of ['reviewer','reviewedAt','evidence','recordedBy'])assert.equal(p.attribution[name],'');
      assert.equal(p.attribution.independent,false);assert.equal(p.confirmCurrentSource,false);
      for(const decision of [p.qaReview,p.sourceDecision]){assert.equal(decision.note,'');assert.equal(decision.review.reviewer,'');assert.equal(decision.review.basis,'');assert.deepEqual(decision.review.checks,{evidence:'unchecked',arithmetic:'unchecked',fit:'unchecked'});}
      assert.equal(await independent().isChecked(),false);assert.equal(await exact().isChecked(),false);assert(await button('Record completed team review').isDisabled());
      assert.match(await page.locator('#agentWorkbench').innerText(),/does not accept the source/);
      assert.equal(await page.evaluate(()=>__workbenchHarness.calls.length),0);assert.equal(await journal(),null);assert.deepEqual(await state(),before);
    }
  });
  await check('submitted Quality rejects replacement finding and correction while retaining the exact original evidence',async()=>{
    const before=await seed(reviewFixture('review'));await prefillFields();
    await page.getByLabel('Source task ID',{exact:true}).fill('source');await page.getByLabel('Quality task ID',{exact:true}).fill('qa');
    await button('Load exact pair and template').click();await idle();
    assert.match(await notice().innerText(),/submitted or accepted Quality result is immutable/);assert.equal(await jsonInput().inputValue(),'');
    assert.deepEqual(JSON.parse(await page.locator('#agentWorkbench [data-wb=pair]').textContent()),before.tasks);
    await finding().fill('');await correction().fill('');await button('Load exact pair and template').click();await idle();
    const p=JSON.parse(await jsonInput().inputValue()).payload;assert.equal(Object.hasOwn(p,'qaResult'),false);assert.equal(p.sourceDecision.decision,'revise');
    assert.equal(await page.evaluate(()=>__workbenchHarness.calls.length),0);assert.equal(await journal(),null);assert.deepEqual(await state(),before);
  });
  await check('prepare locks editable inputs and confirmations until its fresh read completes',async()=>{
    await seed();await fill();await independent().check();await exact().check();await page.evaluate(()=>{__workbenchHarness.gateRead=true;});
    await button('Preview completed review').click();await page.waitForFunction(()=>typeof __workbenchHarness.releaseRead==='function');
    for(const control of [jsonInput(),independent(),exact(),verdict(),finding(),correction(),page.getByLabel('Source task ID',{exact:true}),page.getByLabel('Quality task ID',{exact:true})])assert(await control.isDisabled());
    assert(await button('Record completed team review').isDisabled());assert.equal(await journal(),null);
    await page.evaluate(()=>__workbenchHarness.releaseRead());await idle();assert.equal((await output()).status,'prepared');assert(await button('Record completed team review').isEnabled());
  });
  await check('one confirmed closeout preserves original evidence, unrelated tasks, queue and leads',async()=>{
    const before=await seed();await prepare();const prepared=await journal();assert.equal(prepared.status,'prepared');assert.equal(await page.evaluate(()=>__workbenchHarness.calls.length),0);
    await button('Record completed team review').click();await idle();const result=await output(),after=await state();
    assert.equal(result.status,'confirmed');assert.equal(result.serverConfirmed,true);assert.equal(result.receipt.request.closeoutId,prepared.closeoutId);assert.equal((await journal()).status,'confirmed');
    assert.equal(after.revision,before.revision+1);assert.equal(after.tasks[0].status,'done');assert.equal(after.tasks[1].status,'done');assert.equal(after.tasks[0].result,before.tasks[0].result);
    assert.deepEqual(after.tasks.slice(2),before.tasks.slice(2));assert.deepEqual(after.leads,before.leads);assert.equal(after.paused,true);
    assert.equal(await page.evaluate(()=>__workbenchHarness.calls.length),1);assert.equal(await page.evaluate(()=>__workbenchHarness.calls[0].type),'task.completed-review');assert(await button('Record completed team review').isDisabled());
  });
  await check('reload retains an unsent preparation but forbids submission and permits closing only that unsent job',async()=>{
    const before=await seed();await prepare();const prepared=await journal();await page.reload();await mounted();assert(await button('Record completed team review').isDisabled());
    await button('Record completed team review').dispatchEvent('click');await idle();assert.match(await notice().innerText(),/cannot be submitted after reload/);assert.equal(await page.evaluate(()=>__workbenchHarness.calls.length),0);
    assert.equal((await journal()).closeoutId,prepared.closeoutId);await button('Close unsent preparation').click();await idle();assert.equal((await output()).status,'not_sent');assert.equal((await journal()).status,'not_sent');assert.deepEqual(await state(),before);
  });
  await check('lost response after commit reconciles the original receipt after reload without another dispatch',async()=>{
    const before=await seed();await prepare();await page.evaluate(()=>{__workbenchHarness.throwAfter=true;});await button('Record completed team review').click();await idle();
    assert.match(await notice().innerText(),/Synthetic fresh read unavailable/);const pending=await journal(),committed=await state();assert.equal(pending.status,'attempted');assert.equal(committed.revision,before.revision+1);assert.equal(await page.evaluate(()=>__workbenchHarness.calls.length),1);
    await page.reload();await mounted();await button('Check saved receipt').click();await idle();const recovered=await output();assert.equal(recovered.status,'confirmed');assert.equal(recovered.receipt.request.closeoutId,pending.closeoutId);assert.equal(await page.evaluate(()=>__workbenchHarness.calls.length),0);assert.deepEqual(await state(),committed);
  });
  await check('ordinary register updates preserve the mounted editor, explicit pair and dirty draft',async()=>{
    const before=await seed();await fill();await independent().check();const draft=await jsonInput().inputValue();
    await jsonInput().evaluate(element=>{window.__originalWorkbenchInput=element;});const reads=await page.evaluate(()=>__workbenchHarness.reads);
    const next=apply(before,'task.add',{id:'later_task',role:'supply',title:'Synthetic later register update',brief:'Unrelated fresh snapshot.'});
    await page.evaluate(value=>__workbenchHarness.push(value),next);await page.waitForFunction(revision=>__workbenchHarness.data.agent().revision===revision,next.revision);
    assert(await jsonInput().evaluate(element=>element===window.__originalWorkbenchInput));assert.equal(await jsonInput().inputValue(),draft);assert.equal(await page.getByLabel('Source task ID',{exact:true}).inputValue(),'source');assert.equal(await independent().isChecked(),true);assert.equal(await page.evaluate(()=>__workbenchHarness.reads),reads);
  });
  await check('account change retains the original draft read-only and blocks any late preparation',async()=>{
    const before=await seed();await fill();const pasted=await prefillFields('pass');await independent().check();await exact().check();const draft=await jsonInput().inputValue();await page.evaluate(()=>{__workbenchHarness.gateRead=true;});
    await button('Preview completed review').click();await page.waitForFunction(()=>typeof __workbenchHarness.releaseRead==='function');await page.evaluate(()=>__workbenchHarness.changeAccount());await page.evaluate(()=>__workbenchHarness.releaseRead());
    await page.waitForFunction(()=>document.querySelector('#agentWorkbench [data-wb=input]')?.readOnly===true);
    for(const control of [verdict(),independent(),exact()])assert(await control.isDisabled());
    for(const control of [finding(),correction()])assert(await control.evaluate(element=>element.readOnly));
    assert.equal(await finding().inputValue(),pasted.original);assert.equal(await correction().inputValue(),pasted.corrected);
    assert.equal(await jsonInput().inputValue(),draft);assert.match(await notice().textContent(),/original-account draft is retained read-only/);assert.equal(await journal(),null);assert.deepEqual(await state(),before);assert.equal(await page.evaluate(()=>__workbenchHarness.calls.length),0);
  });
  await check('desktop and 390px layout contain loaded JSON and confirmation controls without horizontal overflow',async()=>{
    await seed(reviewFixture('ready',true));await prefillFields();await loadPair();
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:900});
      const metrics=await page.evaluate(()=>{
        const sheet=document.querySelector('#sheet'),r=sheet.getBoundingClientRect();
        return {document:document.documentElement.scrollWidth,viewport:innerWidth,sheet:sheet.scrollWidth,client:sheet.clientWidth,
          overflow:[...sheet.querySelectorAll('*')].filter(el=>el.getBoundingClientRect().right>r.right-1).map(el=>({tag:el.tagName,label:el.getAttribute('data-wb')||el.className,right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width})).slice(0,15)};
      });
      (report.layouts??=[]).push(metrics);
      assert(metrics.document<=metrics.viewport+1,JSON.stringify(metrics));assert(metrics.sheet<=metrics.client+1,JSON.stringify(metrics));
      await page.locator('#sheet').evaluate(element=>{element.scrollTop=0;});
      await page.screenshot({path:path.join(out,'workbench-'+width+'.png')});
    }
  });
  assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.missingAssets,[]);assert.deepEqual(report.blockedWrites,[]);report.passed=true;
})().catch(async error=>{report.passed=false;report.error=error.stack;console.error(error.stack);if(page)await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});process.exitCode=1;}).finally(async()=>{
  fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(report,null,2)+'\n');await browser?.close();server.close();
});
