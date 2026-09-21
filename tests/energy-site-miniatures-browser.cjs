/* Homepage energy-site carousel: real-browser rendering, selection and motion checks.
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
const selector='figure[data-sourcing-scene="discovery"]';
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
for(const id of ids)for(const width of [960,1920])assert.ok(files.has('/assets/visuals/energy-site-'+id+'-'+width+'.webp'),'Missing responsive poster for '+id+' at '+width+'.');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.woff2':'font/woff2','.mp4':'video/mp4'};
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
  const figure=page.locator(selector);
  assert.equal(await figure.count(),1,'One energy discovery preview should exist.');
  await figure.evaluate(element=>element.scrollIntoView({block:'center',behavior:'instant'}));
  assert.equal(await figure.locator('button').count(),0,'No corner controls should return.');
  assert.equal(await page.locator('[data-energy-site-select]').count(),8,'All eight energy routes should have native choices.');
  const actualIds=await page.locator('[data-energy-site-select]').evaluateAll(buttons=>buttons.map(button=>button.dataset.energySiteSelect));
  assert.deepEqual(actualIds,ids,'Choices should follow the intended site order.');
  assert.equal(await page.locator('[data-energy-site-select]').evaluateAll(buttons=>buttons.every(button=>button.tagName==='BUTTON')),true,'Choices should be keyboard-accessible native buttons.');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'No horizontal overflow at '+width+'.');
  const bounds=await figure.boundingBox();
  assert.ok(bounds.width>190&&bounds.height>70&&bounds.height<300,'The animation should remain compact.');
  return{context,page,figure,img:figure.locator('img'),width};
}

async function verifyChoice(test,id,{live=false,click=true}={}){
  const {page,figure,img}=test,button=page.locator('[data-energy-site-select="'+id+'"]');
  if(click)await button.click();
  await page.waitForFunction(({selector,id})=>document.querySelector(selector)?.dataset.energySite===id,{selector,id});
  if(live)await page.waitForFunction(selector=>document.querySelector(selector)?.dataset.renderState==='ready',selector,{timeout:30000});
  assert.equal(await button.getAttribute('aria-pressed'),'true','Selected '+id+' button should be announced.');
  const selected=page.locator('[data-energy-site-select][aria-pressed="true"]');
  assert.equal(await selected.count(),1,'Exactly one energy route should be selected.');
  assert.equal(await selected.getAttribute('data-energy-site-select'),id);
  assert.ok((await button.innerText()).trim().length>2,'Each choice needs its visible energy-source label.');
  await page.waitForFunction(({selector,id})=>{
    const image=document.querySelector(selector+' img');
    return image?.complete&&image.naturalWidth>0&&new RegExp('energy-site-'+id+'-(960|1920)\\.webp').test(image.currentSrc||image.src);
  },{selector,id});
  await img.evaluate(image=>image.decode());
  assert.ok((await img.getAttribute('alt')||'').length>12,'The selected facility poster needs a useful alternative description.');
  assert.equal((await page.locator('#home-search-scope').innerText()).replace(/\s+/g,' ').trim(),headings[id],'The visible heading must match the selected '+id+' facility.');
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
    assert.equal(await figure.locator('canvas').evaluate(canvas=>canvas===window.__originalMiniatureCanvas),true,'Switching '+id+' must reuse the existing canvas.');
    assert.equal(await figure.locator('canvas').evaluate(canvas=>window.__miniatureContexts.get(canvas)),test.contextId,'Switching '+id+' must reuse its WebGL context.');
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Choice '+id+' must not overflow horizontally.');
}

async function checkLive(width){
  const test=await open(width),{context,page,figure}=test;
  try{
    await page.waitForFunction(selector=>document.querySelector(selector)?.dataset.renderState==='ready',selector,{timeout:30000});
    const canvas=figure.locator('canvas');
    test.contextId=await canvas.evaluate(element=>{window.__originalMiniatureCanvas=element;return window.__miniatureContexts.get(element);});
    assert.ok(test.contextId,'A real WebGL context should be observed.');
    assert.equal(await canvas.evaluate(element=>getComputedStyle(element).pointerEvents),'none','The miniature must allow normal page scrolling.');
    for(const id of ids){
      await verifyChoice(test,id,{live:true});
      // A rendered frame must follow each choice; waiting on draws avoids assuming
      // that updated labels alone prove the new facility has reached the canvas.
      const before=await canvas.evaluate(element=>window.__miniatureDraws.get(element)||0);
      await page.waitForFunction(({selector,before})=>{const canvas=document.querySelector(selector+' canvas');return(window.__miniatureDraws.get(canvas)||0)>before;},{selector,before});
      await figure.screenshot({path:path.join(out,'energy-'+id+'-'+width+'.png')});
    }
    pass(width+': all eight facilities render with their unique headings, selected labels and one shared canvas/context');
    await page.evaluate(()=>{for(const id of ['wind','nuclear','solar','industrial','landfill','grid'])document.querySelector('[data-energy-site-select="'+id+'"]').click();});
    await verifyChoice(test,'grid',{live:true,click:false});
    await page.waitForTimeout(400);
    assert.equal(await figure.getAttribute('data-energy-site'),'grid','Rapid choices must finish on the most recent selection.');
    assert.equal(await page.locator('#home-search-scope').innerText(),headings.grid,'Rapid choices must leave the latest facility heading visible.');
    pass(width+': rapid selection resolves to the latest facility and heading');
    if(width===1440){
      await checkResponsiveSelection(test,true);
      const advancementStarted=Date.now();
      await verifyChoice(test,'landfill',{live:true});
      await figure.evaluate(element=>element.scrollIntoView({block:'center',behavior:'instant'}));
      await page.waitForFunction(selector=>document.querySelector(selector)?.dataset.energySite==='flare',selector,{timeout:9000});
      const advancementMs=Date.now()-advancementStarted;
      assert.ok(advancementMs>=4500&&advancementMs<9000,'The visible carousel should advance after approximately six seconds, not immediately or after the old eleven-second dwell.');
      await verifyChoice(test,'flare',{live:true,click:false});
      pass('Visible carousel automatically advances from landfill to flare in approximately six seconds',{advancementMs});
      await verifyChoice(test,'solar',{live:true});
      await page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
      await page.waitForTimeout(7500);
      assert.equal(await figure.getAttribute('data-energy-site'),'solar','Offscreen carousel must retain its selected facility.');
      assert.equal(await page.locator('#home-search-scope').innerText(),headings.solar,'Offscreen carousel must retain its facility heading.');
      pass('Offscreen carousel suspends automatic advancement');
      await figure.evaluate(element=>element.scrollIntoView({block:'center',behavior:'instant'}));
    }
    await figure.locator('..').screenshot({path:path.join(out,'energy-carousel-'+width+'.png')});
  }finally{await context.close();}
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
  const test=await open(width,noWebGL?'no-preference':'reduce',noWebGL),{context,page,figure,img}=test;
  try{
    await page.waitForFunction(({selector,state})=>document.querySelector(selector)?.dataset.renderState===state,{selector,state:noWebGL?'fallback':'reduced'},{timeout:30000});
    for(const id of ids){
      await verifyChoice(test,id);
      assert.equal(await figure.locator('canvas').count(),0,'Static mode should not retain a WebGL canvas.');
      assert.ok(await img.isVisible(),'The selected facility poster should remain visible.');
      assert.ok(await img.evaluate(image=>Number(getComputedStyle(image).opacity)>0),'Static poster should remain opaque.');
    }
    if(width===390&&!noWebGL){
      await verifyChoice(test,'hydro');await page.waitForTimeout(7500);
      assert.equal(await figure.getAttribute('data-energy-site'),'hydro','Reduced motion must disable automatic facility changes.');
      assert.equal(await page.locator('#home-search-scope').innerText(),headings.hydro,'Reduced motion must retain the selected facility heading.');
    }
    if(width===1440&&!noWebGL)await checkResponsiveSelection(test,false);
    await figure.locator('..').screenshot({path:path.join(out,'energy-carousel-'+width+(noWebGL?'-fallback':'-reduced')+'.png')});
    pass(width+(noWebGL?': WebGL fallback':': reduced motion')+' preserves all eight selectable facility posters and headings without canvas or overflow');
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
