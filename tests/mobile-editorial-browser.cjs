/* Public-site presentation audit. Fresh synthetic browsers, local assets, no submissions. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||'C:/Users/rbaga/ion-mining-group/tools/.cache/hosting-terrain-browser/node_modules/playwright-core');
const phase=process.env.MOBILE_EDITORIAL_PHASE||'baseline',root=path.resolve(process.env.MOBILE_EDITORIAL_ROOT||path.join(__dirname,'../_site'));
const out=path.resolve(__dirname,'../reports/mobile-editorial-20260920',phase);fs.mkdirSync(out,{recursive:true});
const pages=fs.readdirSync(root).filter(f=>f.endsWith('.html')).sort();
const files=new Map();function snapshot(dir){for(const d of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,d.name);if(d.isDirectory()){if(!['app','crm'].includes(d.name))snapshot(f);}else files.set('/'+path.relative(root,f).replaceAll('\\','/'),fs.readFileSync(f));}}snapshot(root);
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{if(req.method!=='GET'){res.writeHead(405);return res.end();}let name=new URL(req.url,'http://localhost').pathname;if(name==='/')name='/index.html';if(!files.has(name)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',types[path.extname(name)]||'application/octet-stream');res.end(files.get(name));});
const report={phase,pages:[],errors:[],missing:[],writes:[]};let browser;
const main=['index.html','energy-sites.html','energy.html','hosting.html','hardware.html','calculator.html','contact.html','why-mining.html','blog.html','site-screening-checklist.html'];
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:844},isMobile:width<641,hasTouch:width<641,serviceWorkers:'block',reducedMotion:'reduce'});
  await context.route('**/*',r=>{const req=r.request();if(req.method()!=='GET'){report.writes.push(req.url());return r.abort();}return req.url().startsWith(origin)?r.continue():r.abort();});
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push({width,error:e.message}));page.on('response',r=>{if(r.url().startsWith(origin)&&r.status()>=400)report.missing.push(r.url().slice(origin.length));});
  for(const file of pages){
   await page.goto(origin+'/'+file,{waitUntil:'networkidle'});
   await page.addStyleTag({content:'.reveal{opacity:1!important;transform:none!important}*,*::before,*::after{animation-play-state:paused!important;transition:none!important}'});
   const measured=await page.evaluate(()=>{
    const nodes=[],editorial=[],walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;
    while(node=walker.nextNode()){
     const p=node.parentElement,t=node.textContent.trim();if(!p||!t||p.closest('nav,footer,script,style,noscript,[aria-hidden="true"],.site-nav,.nav-shell,.nav-links,.mobile-menu'))continue;
     if(!p.checkVisibility({visibilityProperty:true})||p.closest('details:not([open])')&&!p.closest('summary'))continue;
     const text=t.replace(/\s+/g,' ');nodes.push(text);if(p.closest('p,h1,h2,h3,h4,summary,li')&&!p.closest('form,select,button,.nav'))editorial.push(text);
    }
    const text=nodes.join(' '),copy=editorial.join(' '),wordCount=s=>(s.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu)||[]).length;
    return {words:wordCount(text),editorialWords:wordCount(copy),text,copy,height:document.documentElement.scrollHeight,overflow:document.documentElement.scrollWidth>innerWidth+1,visuals:document.querySelectorAll('.mobile-vignette').length};
   });
   report.pages.push({file,width,...measured});console.log(phase+' '+width+' '+file+': '+measured.words+' words, '+measured.editorialWords+' editorial, '+measured.height+'px'+(measured.overflow?' OVERFLOW':''));
   if(main.includes(file)&&width===390)await page.screenshot({path:path.join(out,file.replace('.html','')+'-'+width+'.png'),fullPage:true});
  }
  await context.close();
 }
})().catch(e=>{report.failure=e.stack;console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify(report,null,2));});
