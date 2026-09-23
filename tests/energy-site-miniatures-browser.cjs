/* Homepage globe and facility sculptures: rendering, selection and motion checks.
 * Uses a read-only snapshot of the assembled public site and never submits forms.
 * Run after tools/build-pages.js: node tests/energy-site-miniatures-browser.cjs
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||'C:/Users/rbaga/ion-mining-group/tools/.cache/hosting-terrain-browser/node_modules/playwright-core');

const root=path.resolve(process.env.ENERGY_MINIATURES_ROOT||path.join(__dirname,'../_site'));
const out=path.resolve(process.env.ENERGY_MINIATURES_REPORT||path.join(__dirname,'../reports/energy-site-miniatures-20260921'));
const executablePath=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ids=['landfill','flare','hydro','nuclear','wind','solar','industrial','grid'];
const headings={
  landfill:'Landfill gas. New purpose.',
  flare:'Flare gas. More potential.',
  hydro:'Hydro. Power in motion.',
  nuclear:'Nuclear. Power at scale.',
  wind:'Wind. Catch the current.',
  solar:'Solar. Follow the sun.',
  industrial:'Industry. Find the surplus.',
  grid:'Grid. Find your connection.'
};
const selector='#home-energy-explorer [data-facility-monument]';
const researchTitles={landfill:'Landfill gas',flare:'Flare gas',hydro:'Operating hydro',nuclear:'Nuclear power',wind:'Wind power',solar:'Solar power',industrial:'Industrial surplus',grid:'Grid supply'};
const report={checks:[],pageErrors:[],missingAssets:[],blockedWrites:[],headingLayouts:[]};
const files=new Map();
function snapshot(dir){
  for(const item of fs.readdirSync(dir,{withFileTypes:true})){
    const file=path.join(dir,item.name);
    if(item.isDirectory())snapshot(file);
    else files.set('/'+path.relative(root,file).replaceAll('\\','/'),fs.readFileSync(file));
  }
}
assert.ok(fs.existsSync(path.join(root,'index.html')),'Build _site before running these browser checks.');
snapshot(root);fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.woff2':'font/woff2','.mp4':'video/mp4'};
const server=http.createServer((req,res)=>{
  if(req.method!=='GET'){res.writeHead(405);return res.end();}
  let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);return res.end();}
  if(name.endsWith('/'))name+='index.html';
  if(!files.has(name)){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',types[path.extname(name)]||'application/octet-stream');res.end(files.get(name));
});
let browser,origin;
function pass(name,detail={}){report.checks.push({name,...detail});console.log('ok  '+name);}

async function open(width,reducedMotion='no-preference',noWebGL=false){
  const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:width<641?2:1,isMobile:width<641,hasTouch:width<641,reducedMotion,serviceWorkers:'block'});
  await context.route('**/*',route=>{
    const request=route.request();
    if(request.method()!=='GET'){report.blockedWrites.push(request.url());return route.abort();}
    return request.url().startsWith(origin+'/')?route.continue():route.abort();
  });
  await context.addInitScript(({noWebGL})=>{
    window.__miniatureContexts=new WeakMap();window.__miniatureDraws=new WeakMap();
    const native=HTMLCanvasElement.prototype.getContext,seen=new WeakSet();let next=0;
    HTMLCanvasElement.prototype.getContext=function(type,...args){
      if(noWebGL&&/webgl/i.test(type))return null;
      const gl=native.call(this,type,...args);
      if(gl&&/webgl/i.test(type)&&!seen.has(gl)){
        seen.add(gl);const canvas=this,clear=gl.clear;
        window.__miniatureContexts.set(canvas,++next);
        gl.clear=function(...values){window.__miniatureDraws.set(canvas,(window.__miniatureDraws.get(canvas)||0)+1);return clear.apply(this,values);};
      }
      return gl;
    };
  },{noWebGL});
  const page=await context.newPage();
  page.on('pageerror',error=>report.pageErrors.push({width,reducedMotion,noWebGL,message:error.message}));
  page.on('response',response=>{if(response.url().startsWith(origin+'/')&&response.status()>=400)report.missingAssets.push({width,asset:response.url().slice(origin.length),status:response.status()});});
  await page.goto(origin+'/index.html',{waitUntil:'networkidle'});
  await page.addStyleTag({content:'html{scroll-behavior:auto!important}.reveal{opacity:1!important;transform:none!important}'});
  const explorer=page.locator('#home-energy-explorer'),figure=page.locator(selector);
  assert.equal(await figure.count(),1,'One facility sculpture host should exist.');
  assert.equal(await page.locator('.home-hero [data-facility-monument]').count(),0,'Facilities should belong to the globe explorer, outside the hero.');
  await page.waitForFunction(()=>document.querySelector('#home-energy-explorer')?.dataset.explorerReady==='true'&&document.querySelector('#home-research-preview')?.dataset.researchReady==='true');
  await explorer.evaluate(element=>element.scrollIntoView({block:'center',behavior:'instant'}));
  assert.equal(await explorer.getAttribute('data-view'),'globe','Exploration must start with the globe.');
  assert.equal(await page.locator('#home-search-scope').innerText(),'A world of energy.');
  assert.equal(await explorer.locator('.home-facility-layer').getAttribute('aria-hidden'),'true','Unselected facilities must be hidden from assistive technology.');
  assert.equal(await explorer.locator('[data-globe-back]').isVisible(),false,'Back should appear only after choosing a source.');
  assert.equal(await figure.locator('canvas').count(),0,'The facility renderer should wait for a user choice.');
  assert.equal(await figure.locator('img').count(),0,'The sculpture host should not contain a retired miniature poster.');
  assert.equal(await figure.locator('button').count(),0,'No corner controls should return.');
  assert.equal(await page.locator('[data-energy-site-select]').count(),8,'All eight energy routes should have native choices.');
  const actualIds=await page.locator('[data-energy-site-select]').evaluateAll(buttons=>buttons.map(button=>button.dataset.energySiteSelect));
  assert.deepEqual(actualIds,ids,'Choices should follow the intended site order.');
  assert.equal(await page.locator('[data-energy-site-select]').evaluateAll(buttons=>buttons.every(button=>button.tagName==='BUTTON')),true,'Choices should be keyboard-accessible native buttons.');
  assert.equal(await page.locator('[data-research-source]').count(),8,'Research and facility selection should share the same eight controls.');
  assert.equal(await page.locator('[data-energy-site-select]').evaluateAll(buttons=>buttons.every(button=>button.dataset.researchSource===button.dataset.energySiteSelect&&['home-energy-explorer','research-content'].every(id=>(button.getAttribute('aria-controls')||'').split(/\s+/).includes(id)))),true,'Every source should control both the explorer and research panel.');
  const details=page.locator('#home-research-preview details.research-details');
  assert.equal(await details.count(),1,'Research tabs should have one native disclosure.');
  assert.equal(await details.getAttribute('open'),null,'Research details should start collapsed.');
  assert.equal(await details.locator('[data-research-tab="contacts"]').isVisible(),false,'Collapsed research should keep its tabs out of the visible controls.');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'No horizontal overflow at '+width+'.');
  const bounds=await explorer.locator('.home-explorer-stage').boundingBox();
  assert.ok(bounds&&bounds.width>190&&bounds.height>70&&bounds.width<=width+1,'The globe and facility stage should have usable dimensions without horizontal overflow.');
  return{context,page,explorer,figure,width};
}

async function verifyChoice(test,id,{live=false,click=true}={}){
  const {page,explorer,figure}=test,button=page.locator('[data-energy-site-select="'+id+'"]');
  if(click){if(test.width<641)await button.tap();else await button.click();}
  await page.waitForFunction(({selector,id})=>document.querySelector('#home-energy-explorer')?.dataset.view==='facility'&&document.querySelector(selector)?.dataset.monumentSource===id,{selector,id},{timeout:30000});
  // Keep forced inspection scrolling from moving another choice under the
  // pointer and accidentally initiating a second hover selection.
  if(test.width>=641)await page.mouse.move(0,0);
  await explorer.evaluate(element=>element.scrollIntoView({block:'center',behavior:'instant'}));
  if(live)await page.waitForFunction(selector=>document.querySelector(selector)?.dataset.renderState==='ready',selector,{timeout:30000});
  await explorer.locator('.home-facility-layer').evaluate(async layer=>{
    layer.getBoundingClientRect();
    await Promise.all(layer.getAnimations().map(animation=>animation.finished.catch(()=>{})));
  });
  assert.equal(await explorer.locator('.home-facility-layer').getAttribute('aria-hidden'),'false','The chosen facility should be available to assistive technology.');
  if(live)assert.equal(await explorer.getAttribute('aria-busy'),null,'A ready sculpture should clear its loading announcement.');
  assert.equal(await explorer.locator('[data-globe-back]').isVisible(),true,'The selected facility should offer a return to the globe.');
  assert.equal(await button.getAttribute('aria-pressed'),'true','Selected '+id+' button should be announced.');
  const selected=page.locator('[data-energy-site-select][aria-pressed="true"]');
  assert.equal(await selected.count(),1,'Exactly one energy route should be selected.');
  assert.equal(await selected.getAttribute('data-energy-site-select'),id);
  assert.ok((await button.innerText()).trim().length>2,'Each choice needs its visible energy-source label.');
  assert.equal(await figure.locator('img').count(),0,'Choosing a facility must not restore a retired miniature poster.');
  assert.equal((await page.locator('#home-search-scope').innerText()).replace(/\s+/g,' ').trim(),headings[id],'The visible heading must match the selected '+id+' facility.');
  assert.equal(await page.locator('#home-research-preview').getAttribute('data-research-active-source'),id,'Research should follow the same source as the facility.');
  assert.equal(await page.locator('#research-site-title').innerText(),researchTitles[id],'The research title should match the chosen energy route.');
  assert.equal(await page.locator('#research-content .research-row').count(),4,'Every source should retain its four research rows.');
  assert.notEqual(await page.locator('#home-research-preview details.research-details').getAttribute('open'),null,'Choosing a source should open its research details.');
  const viewport=page.viewportSize().width;
  if(!report.headingLayouts.some(item=>item.viewport===viewport&&item.id===id)){
    const dimensions=await page.locator('#home-search-scope').evaluate(heading=>{
      const bounds=heading.getBoundingClientRect(),style=getComputedStyle(heading);
      return{width:bounds.width,height:bounds.height,fontSize:style.fontSize,lineHeight:style.lineHeight};
    });
    report.headingLayouts.push({viewport,id,text:headings[id],...dimensions});
  }
  if(live){
    assert.equal(await figure.locator('canvas').count(),1,'Switching '+id+' must preserve a single canvas.');
    assert.equal(await figure.locator('.home-monument-canvas').count(),1,'The selected facility should use the sculpture renderer.');
    if(test.contextId){
      assert.equal(await figure.locator('canvas').evaluate(canvas=>canvas===window.__originalMiniatureCanvas),true,'Switching '+id+' must reuse the existing canvas.');
      assert.equal(await figure.locator('canvas').evaluate(canvas=>window.__miniatureContexts.get(canvas)),test.contextId,'Switching '+id+' must reuse its WebGL context.');
    }
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Choice '+id+' must not overflow horizontally.');
}

async function checkLive(width){
  const test=await open(width),{context,page,explorer,figure}=test;
  try{
    await page.waitForFunction(()=>document.querySelector('#home-discovery-globe')?.dataset.renderState==='ready',{},{timeout:30000});
    await verifyChoice(test,'landfill',{live:true});
    const canvas=figure.locator('canvas');
    test.contextId=await canvas.evaluate(element=>{window.__originalMiniatureCanvas=element;return window.__miniatureContexts.get(element);});
    assert.ok(test.contextId,'A real WebGL context should be observed.');
    assert.equal(await canvas.evaluate(element=>getComputedStyle(element).pointerEvents),'none','The sculpture must allow normal page scrolling.');
    for(const id of ids){
      await verifyChoice(test,id,{live:true});
      // A rendered frame must follow each choice; waiting on draws avoids assuming
      // that updated labels alone prove the new facility has reached the canvas.
      const before=await canvas.evaluate(element=>window.__miniatureDraws.get(element)||0);
      await page.waitForFunction(({selector,before})=>{const canvas=document.querySelector(selector+' canvas');return(window.__miniatureDraws.get(canvas)||0)>before;},{selector,before});
      await figure.screenshot({path:path.join(out,'energy-'+id+'-'+width+'.png')});
    }
    pass(width+': all eight user-selected facilities render with matching research and one shared facility canvas/context');
    const immediateViews=await page.evaluate(()=>['wind','nuclear','solar','industrial','landfill','grid'].map(id=>{
      document.querySelector('[data-energy-site-select="'+id+'"]').click();
      return document.querySelector('#home-energy-explorer').dataset.view;
    }));
    assert.deepEqual(immediateViews,Array(6).fill('facility'),'Each choice should reveal its facility immediately without a travel phase.');
    await verifyChoice(test,'grid',{live:true,click:false});
    assert.equal(await figure.getAttribute('data-monument-source'),'grid','Rapid choices must finish on the most recent selection.');
    assert.equal(await page.locator('#home-search-scope').innerText(),headings.grid,'Rapid choices must leave the latest facility heading visible.');
    pass(width+': rapid selection resolves to the latest facility and heading');
    await checkReturnToGlobe(test,true);
    if(width===1440){
      await checkHoverAndFocus(test);
      await checkResponsiveSelection(test,true);
      await verifyChoice(test,'landfill',{live:true});
      await page.waitForTimeout(7500);
      await verifyChoice(test,'landfill',{live:true,click:false});
      pass('Visible explorer keeps the selected facility until the user chooses another source');
      await verifyChoice(test,'solar',{live:true});
      await page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
      await page.waitForTimeout(7500);
      assert.equal(await figure.getAttribute('data-monument-source'),'solar','Offscreen explorer must retain its selected facility.');
      assert.equal(await page.locator('#home-search-scope').innerText(),headings.solar,'Offscreen explorer must retain its facility heading.');
      pass('Offscreen explorer retains the user-selected facility');
      await explorer.evaluate(element=>element.scrollIntoView({block:'center',behavior:'instant'}));
    }
    await explorer.screenshot({path:path.join(out,'energy-explorer-'+width+'.png')});
  }finally{await context.close();}
}

async function checkReturnToGlobe(test,live){
  const {page,explorer}=test;
  const details=page.locator('#home-research-preview details.research-details');
  if(await details.getAttribute('open')===null)await details.locator('summary').click();
  assert.equal(await details.locator('[data-research-tab="contacts"]').isVisible(),true,'Opening the disclosure should expose the research tabs.');
  await page.locator('[data-research-tab="contacts"]').click();
  await verifyChoice(test,'wind',{live});
  assert.notEqual(await details.getAttribute('open'),null,'Changing sources should preserve the open research disclosure.');
  assert.equal(await page.locator('[data-research-tab="contacts"]').getAttribute('aria-selected'),'true','Changing sources should preserve the research tab.');
  assert.equal(await page.locator('#research-content').getAttribute('aria-labelledby'),'research-tab-contacts');
  await explorer.locator('[data-globe-back]').click();
  await page.waitForFunction(()=>document.querySelector('#home-energy-explorer')?.dataset.view==='globe',{},{timeout:30000});
  assert.equal(await page.locator('#home-search-scope').innerText(),'A world of energy.');
  assert.equal(await explorer.locator('.home-facility-layer').getAttribute('aria-hidden'),'true');
  assert.equal(await explorer.locator('[data-globe-back]').isVisible(),false);
  assert.equal(await details.getAttribute('open'),null,'Back should collapse the research details.');
  assert.equal(await page.locator('[data-energy-site-select="wind"]').evaluate(button=>button===document.activeElement),true,'Returning to the globe should focus the selected source.');
  await page.waitForTimeout(200);
  assert.equal(await explorer.getAttribute('data-view'),'globe','Restoring source focus must not immediately reopen its preview.');
  // The same source must reopen from the globe, including native keyboard activation.
  await page.locator('[data-energy-site-select="wind"]').press('Enter');
  await verifyChoice(test,'wind',{live,click:false});
  pass((live?'Live':'Static')+' explorer returns to the globe and reopens the same source from the keyboard');
}

async function checkHoverAndFocus(test){
  const {page,explorer,figure}=test;
  assert.equal(await page.evaluate(()=>matchMedia('(hover: hover) and (pointer: fine)').matches),true,'Desktop hover checks need a fine pointer.');
  await page.locator('[data-energy-site-select="hydro"]').hover();
  await verifyChoice(test,'hydro',{live:true,click:false});
  await page.locator('#home-search-scope').hover();
  await page.waitForTimeout(200);
  assert.equal(await figure.getAttribute('data-monument-source'),'hydro','Leaving a source should preserve its preview.');
  await explorer.locator('[data-globe-back]').click();
  await page.waitForTimeout(200);
  assert.equal(await explorer.getAttribute('data-view'),'globe','Back should stay on the globe after restoring focus.');
  await page.locator('[data-energy-site-select="hydro"]').press('Tab');
  await verifyChoice(test,'nuclear',{live:true,click:false});
  pass('Fine-pointer hover and keyboard focus select facilities; leaving the source preserves the preview');
}

async function checkResponsiveSelection(test,live){
  const {page,figure}=test;
  await verifyChoice(test,'hydro',{live});
  for(const width of [390,1440]){
    await page.setViewportSize({width,height:900});
    await figure.evaluate(element=>element.scrollIntoView({block:'center',behavior:'instant'}));
    // Give resize and media-query listeners time to apply their responsive copy.
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await verifyChoice(test,'hydro',{live,click:false});
  }
  pass((live?'Live':'Static')+' selected facility and heading survive both responsive breakpoint changes');
}

async function checkStatic(width,noWebGL=false){
  const test=await open(width,noWebGL?'no-preference':'reduce',noWebGL),{context,page,explorer,figure}=test;
  try{
    if(noWebGL){
      await page.waitForFunction(()=>document.querySelector('#home-discovery-globe')?.dataset.renderState==='fallback',{},{timeout:30000});
      const globePoster=explorer.locator('#home-discovery-globe img');
      await globePoster.evaluate(image=>image.decode());
      assert.ok(await globePoster.evaluate(image=>image.naturalWidth>0&&Number(getComputedStyle(image).opacity)>0),'WebGL failure should preserve the initial globe poster.');
    }
    await verifyChoice(test,'landfill',{live:!noWebGL});
    await page.waitForFunction(({selector,state})=>document.querySelector(selector)?.dataset.renderState===state,{selector,state:noWebGL?'fallback':'ready'},{timeout:30000});
    if(!noWebGL)test.contextId=await figure.locator('canvas').evaluate(element=>{window.__originalMiniatureCanvas=element;return window.__miniatureContexts.get(element);});
    for(const id of ids){
      await verifyChoice(test,id,{live:!noWebGL});
      if(noWebGL){
        await page.waitForFunction(selector=>document.querySelector(selector)?.dataset.renderState==='fallback',selector);
        assert.equal(await figure.locator('canvas').count(),0,'Failed WebGL should not leave an unusable canvas.');
        const fallback=figure.locator('[data-monument-fallback]');
        assert.equal(await fallback.isVisible(),true,'WebGL failure should show its text fallback.');
        assert.ok((await fallback.innerText()).trim().length>12,'WebGL failure should provide a readable text fallback.');
      }else{
        const canvas=figure.locator('canvas');
        await page.waitForTimeout(200);
        const draws=await canvas.evaluate(element=>window.__miniatureDraws.get(element)||0);
        assert.ok(draws>0,'Reduced motion should render a static sculpture.');
        await page.waitForTimeout(650);
        assert.equal(await canvas.evaluate(element=>window.__miniatureDraws.get(element)||0),draws,'Reduced-motion sculptures should not animate continuously.');
      }
    }
    if(width===390&&!noWebGL){
      await verifyChoice(test,'hydro');await page.waitForTimeout(7500);
      assert.equal(await figure.getAttribute('data-monument-source'),'hydro','Reduced motion must retain the user-selected facility.');
      assert.equal(await page.locator('#home-search-scope').innerText(),headings.hydro,'Reduced motion must retain the selected facility heading.');
    }
    await checkReturnToGlobe(test,!noWebGL);
    if(width===1440&&!noWebGL)await checkResponsiveSelection(test,true);
    await explorer.screenshot({path:path.join(out,'energy-explorer-'+width+(noWebGL?'-fallback':'-reduced')+'.png')});
    pass(width+(noWebGL?': WebGL text fallback':': static reduced-motion sculptures')+' preserves all eight user-selected facilities, research and headings without overflow');
  }finally{await context.close();}
}

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,executablePath,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for(const width of [390,1440])await checkLive(width);
  for(const width of [320,390,768,1440])await checkStatic(width);
  await checkStatic(390,true);
  assert.deepEqual(report.pageErrors,[],'No uncaught page errors.');
  assert.deepEqual(report.missingAssets,[],'No missing local assets.');
  assert.deepEqual(report.blockedWrites,[],'No write requests should be attempted.');
  report.headingHeightRanges=[320,390,768,1440].map(viewport=>{
    const heights=report.headingLayouts.filter(item=>item.viewport===viewport).map(item=>item.height);
    return{viewport,min:Math.min(...heights),max:Math.max(...heights),difference:Math.max(...heights)-Math.min(...heights)};
  });
  pass('No uncaught errors, missing assets or write requests');
})().catch(error=>{report.failure=error.stack;console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
  fs.writeFileSync(path.join(out,'miniatures-browser-audit.json'),JSON.stringify(report,null,2)+'\n');
});
