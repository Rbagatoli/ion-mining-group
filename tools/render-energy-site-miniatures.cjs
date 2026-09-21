#!/usr/bin/env node
'use strict';
/* Export fallback posters from the same models, camera and renderer as production. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||'C:/Users/rbaga/ion-mining-group/tools/.cache/hosting-terrain-browser/node_modules/playwright-core');
const sharp=require(process.env.SHARP_MODULE||'C:/Users/rbaga/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root=path.resolve(__dirname,'../site'),output=path.join(root,'assets/visuals'),report=path.resolve(__dirname,'../reports/energy-site-miniatures-20260921');
const names=['landfill','flare','hydro','nuclear','wind','solar','industrial','grid'];
const harness=`<!doctype html><html><head><style>html,body{margin:0;background:transparent}#host{width:1920px;height:800px}canvas{display:block;width:100%;height:100%}</style></head><body><div id="host"></div><script type="module">
import {mountSourcingScene} from '/sourcing-stage.js';
import {createSiteKit} from '/sourcing-sites-kit.js';
import {buildLandfillScene,buildFlareScene} from '/sourcing-sites-gas.js';
import {buildHydroScene,buildNuclearScene} from '/sourcing-sites-water.js';
import {buildWindScene,buildSolarScene} from '/sourcing-sites-renewables.js';
import {buildIndustrialScene,buildGridScene} from '/sourcing-sites-industry.js';
const builders={landfill:buildLandfillScene,flare:buildFlareScene,hydro:buildHydroScene,nuclear:buildNuclearScene,wind:buildWindScene,solar:buildSolarScene,industrial:buildIndustrialScene,grid:buildGridScene};
let stage;
window.draw=async function(id,time=0){
 const builder=T=>builders[id](T,createSiteKit(T));
 if(stage)await stage.setScene(builder,'discovery');else stage=await mountSourcingScene(document.querySelector('#host'),builder,{kind:'discovery'});
 stage.setActive(false);stage.renderAt(time);return true;
};window.drawReady=true;
</script></body></html>`;
const types={'.html':'text/html','.js':'text/javascript'};
const server=http.createServer((req,res)=>{
 if(req.method!=='GET'){res.writeHead(405);return res.end();}
 let route;try{route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);return res.end();}
 if(route==='/__miniatures__'){res.writeHead(200,{'Content-Type':'text/html'});return res.end(harness);}
 try{const file=fs.realpathSync(path.resolve(root,'.'+route)),rel=path.relative(root,file);if(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel)||!fs.statSync(file).isFile())throw Error('Outside render inputs');
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
});
let browser;
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1920,height:800},deviceScaleFactor:1});
 await context.route('**/*',route=>route.request().method()==='GET'&&route.request().url().startsWith(origin+'/')?route.continue():route.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.url());});
 await page.goto(origin+'/__miniatures__',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.drawReady);
 fs.mkdirSync(output,{recursive:true});fs.mkdirSync(report,{recursive:true});
 const previews=[];
 for(const id of names){
  await page.evaluate(id=>window.draw(id,.7),id);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  if(errors.length)throw Error(errors.join('\n'));
  const png=await page.locator('#host').screenshot({omitBackground:true});
  const studio=path.join(report,id+'-studio.png');await sharp(png).flatten({background:'#161717'}).png().toFile(studio);
  previews.push(await sharp(png).resize({width:768}).flatten({background:'#161717'}).png().toBuffer());
  for(const width of [960,1920]){const file=path.join(output,'energy-site-'+id+'-'+width+'.webp');await sharp(png).resize({width}).webp({quality:92,alphaQuality:100,effort:6}).toFile(file);const info=await sharp(file).metadata();if(!info.hasAlpha)throw Error('Transparent background lost');console.log(JSON.stringify({id,width:info.width,height:info.height,bytes:fs.statSync(file).size}));}
 }
 const sheet=sharp({create:{width:1536,height:1280,channels:3,background:'#161717'}});
 await sheet.composite(previews.map((input,i)=>({input,left:(i%2)*768,top:Math.floor(i/2)*320}))).png().toFile(path.join(report,'all-eight.png'));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));});
