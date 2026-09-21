#!/usr/bin/env node
'use strict';
/* Export editorial stills from the SAME scene builders used by the live website.
   Offline/local assets only. No AI imagery and no duplicate equipment geometry.
   Requires existing Playwright and Sharp installations; installs nothing. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const siteRoot=path.resolve(__dirname,'../site');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/rbaga/ion-mining-group/tools/.cache/hosting-terrain-browser/node_modules/playwright-core');
const sharp=require(process.env.SHARP_MODULE||'C:/Users/rbaga/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const output=path.join(siteRoot,'assets/visuals');
const harness=String.raw`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:transparent}#host{width:1920px;height:640px}canvas{display:block;width:100%;height:100%}</style></head><body><div id="host"></div>
<script src="/diagram-engine.js"></script><script src="/site-kit.js"></script><script src="/scene-site.js"></script>
<script type="module">
import * as T from '/vendor/three-0.185.1/three.module.min.js';
import {buildGlobe,globePoint} from '/hosting-globe-scene.js';
import {LAND,LAKES,BORDERS} from '/hosting-earth-data.js';
import {createStage} from '/hosting-stage.js';
import {mountMineScene,buildPresentation} from '/mine-builder-scene.js';
let previous;window.ready=false;window.renderError=null;
window.draw=async function(kind){
 window.ready=false;window.renderError=null;
 previous?.dispose();const host=document.getElementById('host');host.replaceChildren();host.style.height=kind==='globe'?'800px':'640px';
 if(kind==='globe'){
  const stage=createStage(host,{spin:false,pan:false,minPixelRatio:1,maxPixelRatio:1,exposure:.94,fillIntensity:.8,label:'Conceptual site research globe'});
  previous=stage;stage.setActive(false);
  const model=buildGlobe(LAND,LAKES,BORDERS);stage.world.add(model.root);stage.world.environmentIntensity=.8;
  const anisotropy=Math.min(8,stage.renderer.capabilities.getMaxAnisotropy());
  model.textures.forEach(texture=>{texture.anisotropy=anisotropy;texture.needsUpdate=true;});
  const texture=await new T.TextureLoader().loadAsync('/textures/earth-normal.png');
  texture.anisotropy=anisotropy;model.surface.material.normalMap=texture;model.surface.material.normalScale.set(10,10);model.surface.material.needsUpdate=true;
  stage.camera.position.copy(globePoint(38,-100,8.8));stage.camera.lookAt(0,0,0);stage.camera.updateMatrixWorld();
  model.pins.forEach(pin=>{pin.group.visible=pin.normal.dot(stage.camera.position.clone().sub(pin.point))>.1;});
  await stage.renderer.compileAsync(stage.world,stage.camera);stage.renderer.render(stage.world,stage.camera);
  window.ready=true;
 }else{
  const scene=mountMineScene(host,{onReady(){window.ready=true;},onError(){window.renderError='Native mine renderer failed';},
   buildScene(config){const yard=buildPresentation(config.view,config.definition);
    // Keep the authored angle, fit the actual geometry without callout gutters.
    yard.comparisonView=yard.layout;yard.layout=null;yard.frameHeight=.85;return yard;
   }});
  previous=scene;scene.setMotion(false);scene.setConfig({view:'site',definition:{main:window.SiteDiagram}});scene.setXray(true);scene.zoom(.62);scene.setActive(true);
 }
};
window.drawReady=true;
</script></body></html>`;
const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
function inside(root,target){const rel=path.relative(root,target);return rel!== '..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);}
const publicRoot=fs.realpathSync(siteRoot);
const server=http.createServer((req,res)=>{
 if(req.method!=='GET'){res.writeHead(405);return res.end();}
 let route;try{route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);return res.end();}
 if(route==='/__sourcing__'){res.writeHead(200,{'Content-Type':'text/html'});return res.end(harness);}
 try{const file=fs.realpathSync(path.resolve(publicRoot,'.'+route));if(!inside(publicRoot,file)||!fs.statSync(file).isFile())throw Error('Outside site');
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(fs.readFileSync(file));
 }catch{res.writeHead(404);res.end('Not found');}
});
let browser;
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1920,height:800},deviceScaleFactor:1,reducedMotion:'reduce'});
 await context.route('**/*',route=>route.request().method()==='GET'&&route.request().url().startsWith(origin)?route.continue():route.abort());
 const page=await context.newPage(),errors=[],missing=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)missing.push(r.url());});
 await page.goto(origin+'/__sourcing__',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.drawReady);
 fs.mkdirSync(output,{recursive:true});
 for(const kind of ['globe','infrastructure']){
  await page.evaluate(kind=>window.draw(kind),kind);await page.waitForFunction(()=>window.ready||window.renderError,null,{timeout:30000});
  const error=await page.evaluate(()=>window.renderError);if(error||errors.length||missing.length)throw Error(error||errors.concat(missing).join('\n'));
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const png=await page.locator('#host').screenshot({omitBackground:true});
  for(const width of [960,1920]){const file=path.join(output,'sourcing-'+kind+'-native-'+width+'.webp');await sharp(png).resize({width}).webp({quality:90,alphaQuality:100,effort:6}).toFile(file);const meta=await sharp(file).metadata();if(!meta.hasAlpha)throw Error('Transparent background lost');
    console.log(JSON.stringify({file,width:meta.width,height:meta.height,hasAlpha:meta.hasAlpha,bytes:fs.statSync(file).size}));}
 }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));});
