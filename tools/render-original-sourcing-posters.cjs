#!/usr/bin/env node
'use strict';
/* Original sourcing models. Shares only Three.js and the website's material/light palette.
   Uses existing Playwright, Chrome and Sharp; installs nothing. No network assets. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const siteRoot=path.resolve(__dirname,'../site'),modelRoot=path.join(__dirname,'sourcing-scenes');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/rbaga/ion-mining-group/tools/.cache/hosting-terrain-browser/node_modules/playwright-core');
const sharp=require(process.env.SHARP_MODULE||'C:/Users/rbaga/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const output=path.join(siteRoot,'assets/visuals'),report=path.resolve(__dirname,'../reports/original-sourcing-scenes-20260921');
const harness=String.raw`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:transparent}#host{width:1920px;height:800px}canvas{display:block;width:100%;height:100%}</style></head><body><div id="host"></div>
<script type="module">
import * as T from '/vendor/three-0.185.1/three.module.min.js';
import {RoomEnvironment} from '/vendor/three-0.185.1/RoomEnvironment.js';
import {buildDiscoveryScene} from '/__models__/discovery.js';
import {buildCapitalScene} from '/__models__/capital.js';
const renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(1920,800);renderer.setPixelRatio(1);
renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.94;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.setClearColor(0,0);document.getElementById('host').append(renderer.domElement);
const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment(),environment=pmrem.fromScene(room,.04).texture;room.dispose();pmrem.dispose();
window.draw=async function(kind){
 const scene=new T.Scene();scene.environment=environment;scene.environmentIntensity=.95;scene.environmentRotation.y=.85;
 const model=kind==='discovery'?buildDiscoveryScene(T):buildCapitalScene(T);scene.add(model);
 scene.add(new T.HemisphereLight(0xf4f3ef,0x202020,.85));
 const key=new T.DirectionalLight(0xfffaf0,2.6);key.position.set(-10,30,16);key.castShadow=true;
 key.shadow.mapSize.set(4096,4096);key.shadow.camera.left=-16;key.shadow.camera.right=16;key.shadow.camera.top=14;key.shadow.camera.bottom=-14;key.shadow.camera.near=.1;key.shadow.camera.far=90;key.shadow.bias=-.0001;key.shadow.normalBias=.025;scene.add(key);
 const rim=new T.DirectionalLight(0xf0efeb,2);rim.position.set(12,14,-18);scene.add(rim);
 const bounds=new T.Box3().setFromObject(model),center=bounds.getCenter(new T.Vector3());
 const camera=new T.OrthographicCamera(-12,12,5,-5,.1,160);
 camera.position.copy(center).add(kind==='discovery'?new T.Vector3(8,14,29):new T.Vector3(9,9,24));camera.lookAt(center);camera.updateMatrixWorld();
 // Fit the actual authored vertices. A world bounding box invents empty corners
 // above a low landscape and makes the small widget's equipment unnecessarily tiny.
 const projected=new T.Box3(),point=new T.Vector3(),transform=new T.Matrix4();
 model.updateMatrixWorld(true);model.traverse(object=>{const positions=object.geometry?.attributes.position;if(!positions)return;transform.multiplyMatrices(camera.matrixWorldInverse,object.matrixWorld);for(let i=0;i<positions.count;i++)projected.expandByPoint(point.fromBufferAttribute(positions,i).applyMatrix4(transform));});
 const size=projected.getSize(new T.Vector3()),c=projected.getCenter(new T.Vector3());
 const half=Math.max(size.y/2,size.x/2/2.4)/.925;camera.left=c.x-half*2.4;camera.right=c.x+half*2.4;camera.top=c.y+half;camera.bottom=c.y-half;camera.updateProjectionMatrix();
 const ground=new T.Mesh(new T.PlaneGeometry(100,100),new T.ShadowMaterial({opacity:.16}));ground.rotation.x=-Math.PI/2;ground.position.y=bounds.min.y-.025;ground.receiveShadow=true;scene.add(ground);
 await renderer.compileAsync(scene,camera);renderer.render(scene,camera);
 return {kind,description:model.userData.description,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},triangles:renderer.info.render.triangles};
};window.drawReady=true;
</script></body></html>`;
const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
function inside(root,target){const rel=path.relative(root,target);return rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);}
const server=http.createServer((req,res)=>{
 if(req.method!=='GET'){res.writeHead(405);return res.end();}
 let route;try{route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);return res.end();}
 if(route==='/__sourcing__'){res.writeHead(200,{'Content-Type':'text/html'});return res.end(harness);}
 try{const model=route.startsWith('/__models__/'),root=fs.realpathSync(model?modelRoot:siteRoot),relative=model?route.slice('/__models__'.length):route;
 const file=fs.realpathSync(path.resolve(root,'.'+relative));if(!inside(root,file)||!fs.statSync(file).isFile())throw Error('Outside render inputs');
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(fs.readFileSync(file));
 }catch{res.writeHead(404);res.end('Not found');}
});
let browser;
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1920,height:800},deviceScaleFactor:1,reducedMotion:'reduce'});
 await context.route('**/*',route=>route.request().method()==='GET'&&route.request().url().startsWith(origin)?route.continue():route.abort());
 const page=await context.newPage(),errors=[],missing=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)missing.push(r.url());});
 await page.goto(origin+'/__sourcing__',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.drawReady);
 fs.mkdirSync(output,{recursive:true});fs.mkdirSync(report,{recursive:true});
 for(const kind of ['discovery','capital']){
  const meta=await page.evaluate(kind=>window.draw(kind),kind);if(errors.length||missing.length)throw Error(errors.concat(missing).join('\n'));
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const png=await page.locator('#host').screenshot({omitBackground:true});
  await sharp(png).flatten({background:'#161717'}).png().toFile(path.join(report,kind+'-studio.png'));
  for(const width of [960,1920]){const file=path.join(output,'sourcing-'+kind+'-original-'+width+'.webp');await sharp(png).resize({width}).webp({quality:92,alphaQuality:100,effort:6}).toFile(file);const info=await sharp(file).metadata();if(!info.hasAlpha)throw Error('Transparent background lost');console.log(JSON.stringify({file,width:info.width,height:info.height,bytes:fs.statSync(file).size,...meta}));}
 }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));});
