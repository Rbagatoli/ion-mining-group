/* Native Chromium touch regression. Local GET-only assets, read-only camera probe,
 * fresh browser contexts, and no external requests or form submissions. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),site=path.join(root,'site'),out=path.join(root,'reports/mobile-scene-pan-20260921');
function dependencyRoot(){let p=root;for(;;){if(fs.existsSync(path.join(p,'tools/.cache/hosting-terrain-browser/node_modules/playwright-core')))return p;const next=path.dirname(p);if(next===p)throw Error('Set PROTON_PLAYWRIGHT_PATH');p=next;}}
const {chromium}=require(process.env.PROTON_PLAYWRIGHT_PATH||path.join(dependencyRoot(),'tools/.cache/hosting-terrain-browser/node_modules/playwright-core'));
const chrome=process.env.PROTON_CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>fs.existsSync(p));
const report={nativeCDPTouch:true,checks:[],gestures:[],pageErrors:[],missingAssets:[],blockedWrites:[],blockedExternal:[]};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2','.ico':'image/x-icon'};
let browser,page,origin,context,cdp,selector,label;
const server=http.createServer((req,res)=>{
  try{
    if(req.method!=='GET'){report.blockedWrites.push(req.method+' '+req.url);res.writeHead(405);return res.end();}
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(site,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
    if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){report.missingAssets.push(req.url);res.writeHead(404);return res.end();}
    if(!fs.realpathSync(file).startsWith(fs.realpathSync(site)+path.sep)){res.writeHead(403);return res.end();}
    let body=fs.readFileSync(file);
    if(path.basename(file)==='mine-builder-scene.js'){
      const needle='const controls = new OrbitControls(camera,canvas);';assert(body.toString().includes(needle),'Review the camera probe after scene setup changes.');
      body=Buffer.from(body.toString().replace(needle,needle+'\n(window.__plantProbes ||= []).push({host,camera,controls});'));
    }
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
  }catch(error){report.missingAssets.push(error.message);res.writeHead(500);res.end();}
});
const minus=(a,b)=>a.map((v,i)=>v-b[i]),length=v=>Math.hypot(...v),dist=(a,b)=>length(minus(a,b));
function angular(a,b){return Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));}
async function read(){return page.evaluate(selector=>{
  const p=window.__plantProbes.find(p=>p.host.closest(selector)),offset=p.camera.position.clone().sub(p.controls.target);
  return {position:p.camera.position.toArray(),target:p.controls.target.toArray(),distance:offset.length(),theta:Math.atan2(offset.x,offset.z),phi:Math.acos(offset.y/offset.length()),scrollY,scale:visualViewport.scale,cancels:window.__touchEvents.filter(e=>e.type==='pointercancel').length};
},selector);}
async function point(){
  await page.locator(selector+' .plant-canvas').evaluate(el=>{const r=el.getBoundingClientRect();scrollBy({top:r.top-180,behavior:'instant'});});
  await page.waitForTimeout(100);const box=await page.locator(selector+' .plant-canvas canvas').boundingBox();
  assert(box&&box.height>100&&box.width>200,JSON.stringify(box));return {x:box.x+box.width/2,y:box.y+box.height/2};
}
const touch=(x,y,id)=>({x,y,id,radiusX:4,radiusY:4,force:1});
async function dispatch(type,points){await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});}
async function gesture(center,{dx=0,dy=0,span=35,endSpan=span,two=true,cancel=false,leaveOne=false}={}){
  const points=t=>two?[touch(center.x+dx*t-(span+(endSpan-span)*t),center.y+dy*t,1),touch(center.x+dx*t+(span+(endSpan-span)*t),center.y+dy*t,2)]:[touch(center.x+dx*t,center.y+dy*t,1)];
  await dispatch('touchStart',points(0));
  for(let step=1;step<=10;step++){await dispatch('touchMove',points(step/10));await page.waitForTimeout(24);}
  const moving=await read();
  if(leaveOne){await dispatch('touchEnd',[points(1)[0]]);await dispatch('touchMove',[touch(center.x+dx-span+25,center.y+dy,1)]);await page.waitForTimeout(80);}
  const remaining=await read();await dispatch(cancel?'touchCancel':'touchEnd',[]);await page.waitForTimeout(150);return {moving,remaining};
}
async function check(name,fn){await fn();report.checks.push({name:label+' '+name,passed:true});console.log('PASS '+label+' '+name);}
async function record(name,before,after,extra={}){report.gestures.push({label,name,before,after,...extra});}
async function pan(dx,dy){
  const center=await point(),before=await read();const {moving}=await gesture(center,{dx,dy});const after=await read();await record('two-finger pan '+dx+','+dy,before,after,{moving});
  assert(dist(after.target,before.target)>.15,'Two fingers must translate the target.');
  assert(dist(minus(after.position,before.position),minus(after.target,before.target))<1e-5,'Camera and target translate together.');
  assert(angular(after.theta,before.theta)<1e-5&&Math.abs(after.phi-before.phi)<1e-5,'Pan must not rotate.');
  assert(Math.abs(after.distance/before.distance-1)<1e-5,'Constant span must not zoom.');
  assert(Math.abs(after.scrollY-before.scrollY)<2,'Two-finger pan must not scroll the page.');assert.equal(after.cancels,before.cancels,'The browser must not cancel two-finger pan.');
  assert(dist(after.target,moving.target)<1e-5,'Releasing pan must not jump.');
}
(async()=>{
  fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,executablePath:chrome,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
  for(const spec of [
    {file:'index.html',selector:'.dg-wrap[data-scene="site"]',width:390},
    {file:'energy.html',selector:'#dgViews-landfill',width:390},
    {file:'hosting.html',selector:'#dgViews',width:390},
    {file:'index.html',selector:'.dg-wrap[data-scene="site"]',width:320}
  ]){
    selector=spec.selector;label=spec.file+' '+spec.width;
    context=await browser.newContext({viewport:{width:spec.width,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,reducedMotion:'reduce',serviceWorkers:'block'});
    await context.route('**/*',route=>{const req=route.request();if(req.method()!=='GET'){report.blockedWrites.push(req.method()+' '+req.url());return route.abort();}if(new URL(req.url()).origin!==origin){report.blockedExternal.push(req.url());return route.abort();}return route.continue();});
    await context.addInitScript(()=>{window.__touchEvents=[];for(const type of ['pointerdown','pointerup','pointercancel','touchstart','touchend','touchcancel'])document.addEventListener(type,e=>{if(e.target.closest?.('.plant-canvas'))window.__touchEvents.push({type,trusted:e.isTrusted,pointerType:e.pointerType});},true);});
    page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>report.pageErrors.push({label,message:e.message}));cdp=await context.newCDPSession(page);
    await page.goto(origin+'/'+spec.file,{waitUntil:'domcontentloaded'});
    await page.addStyleTag({content:'html{scroll-behavior:auto!important}.reveal{opacity:1!important;transform:none!important;transition:none!important}'});
    await page.locator(selector).scrollIntoViewIfNeeded();await page.waitForFunction(s=>document.querySelector(s)?.classList.contains('plant-ready'),selector);await point();
    await check('two-finger horizontal pan keeps angle and zoom',()=>pan(48,0));
    await check('two-finger vertical pan stays with the model',()=>pan(0,55));
    await check('pinch zoom retains the model rather than browser zoom',async()=>{
      const center=await point(),before=await read();await gesture(center,{span:30,endSpan:55});const after=await read();await record('pinch',before,after);
      assert(after.distance<before.distance*.8);assert.equal(after.scale,1);assert(Math.abs(after.scrollY-before.scrollY)<2);assert(angular(after.theta,before.theta)<1e-5);
    });
    await check('single-finger horizontal swipe rotates',async()=>{
      const center=await point(),before=await read();await gesture(center,{two:false,dx:60});const after=await read();await record('rotation',before,after);
      assert(angular(after.theta,before.theta)>.03);assert(dist(after.target,before.target)<1e-5);assert(Math.abs(after.distance/before.distance-1)<1e-5);assert(Math.abs(after.scrollY-before.scrollY)<2);
    });
    await check('single-finger vertical swipe scrolls the page',async()=>{
      const center=await point(),before=await read();await gesture(center,{two:false,dy:-90});const after=await read();await record('page-scroll',before,after);
      assert(after.scrollY>before.scrollY+30,'Vertical single touch must scroll page.');assert(dist(after.position,before.position)<1e-5);assert(dist(after.target,before.target)<1e-5);
    });
    await check('remaining contact after two-finger pan cannot jump into rotation or selection',async()=>{
      const center=await point();const {moving,remaining}=await gesture(center,{dx:-35,leaveOne:true});const after=await read();
      assert(dist(moving.position,remaining.position)<1e-5&&dist(moving.target,remaining.target)<1e-5);assert(dist(after.position,remaining.position)<1e-5);await pan(30,0);
    });
    await check('touch cancellation releases the gesture and preserves narrow layout',async()=>{
      const center=await point();const {moving}=await gesture(center,{dy:-25,cancel:true});const after=await read();assert(dist(after.position,moving.position)<1e-5);await pan(0,25);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert(await page.evaluate(()=>window.__touchEvents.every(e=>e.trusted)));
      const group=page.locator(selector);await group.getByRole('button',{name:'More view controls',exact:true}).click();await group.getByRole('button',{name:'Reset',exact:true}).click();await group.getByRole('button',{name:'More view controls',exact:true}).click();await point();await page.waitForTimeout(900);
      const hint=await group.locator('.scene-gesture-hint').evaluate(el=>{const r=el.getBoundingClientRect(),stage=el.closest('.plant-stage').getBoundingClientRect(),touch=el.querySelector('.scene-gesture-touch');return {text:touch.textContent,display:getComputedStyle(touch).display,width:el.clientWidth,scrollWidth:el.scrollWidth,left:r.left,right:r.right,stageLeft:stage.left,stageRight:stage.right};});
      assert.equal(hint.text,'Swipe to turn · Two fingers move/zoom');assert.notEqual(hint.display,'none');assert(hint.scrollWidth<=hint.width+1&&hint.left>=hint.stageLeft-1&&hint.right<=hint.stageRight+1,JSON.stringify(hint));
      (report.layouts||=[]).push({label,hint});
      await page.screenshot({path:path.join(out,spec.file.replace('.html','')+'-'+spec.width+'.png')});
    });
    await context.close();context=null;
  }
  assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.missingAssets,[]);assert.deepEqual(report.blockedWrites,[]);report.passed=true;
})().catch(async error=>{report.passed=false;report.error=error.stack;console.error(error.stack);if(page&&!page.isClosed())await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});process.exitCode=1;}).finally(async()=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(report,null,2)+'\n');await browser?.close();server.close();});
