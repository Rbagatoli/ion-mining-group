/* Independently packaged CRM. Shared domain code is copied at build time, never framed. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const shell=['index.html','crm.css','crm.js','crm-model.js','outreach-model.js','control-center.js','control-center.css','workflow.js','workflow.css','crm-data.js','contacts.js','public-infrastructure.js','public-infrastructure.css','discovery.css','discovery-model.js','discovery.js','discovery-globe.js','grok-managed-hosting.js','sourcing.js','energy-scouting.js','sourcing-model.js','intake-inbox.js','intake-inbox.css','grok-team.js','manifest.webmanifest','icon.svg'];
function assets(){
  const html=fs.readFileSync(path.join(ROOT,'crm/index.html'),'utf8');
  const runtime=[...html.matchAll(/(?:src|href)="\.\/runtime\/([^"?]+)(?:\?[^"\s]*)?"/g)].map(m=>m[1]);
  const data=JSON.parse(fs.readFileSync(path.join(ROOT,'tools/app-assets.json'),'utf8')).filter(p=>p.startsWith('data/'));
  const globe=['map-globe-style.js','prospect-globe-layer.js','globe-assets/globe-surface.js','globe-assets/hosting-earth-data.js','globe-assets/textures/earth-normal.png','globe-assets/vendor/three-0.185.1/three.module.min.js','globe-assets/vendor/three-0.185.1/three.core.min.js','globe-assets/vendor/three-0.185.1/RoomEnvironment.js','globe-assets/vendor/three-0.185.1/LICENSE'];
  return [{from:'site/intake-config.js',to:'intake-config.js'},...shell.map(p=>({from:'crm/'+p,to:p})),...runtime.concat(globe).map(p=>({from:p,to:'runtime/'+p})),{from:'site/vendor/three-0.185.1/OrbitControls.js',to:'runtime/globe-assets/vendor/three-0.185.1/OrbitControls.js'},...data.map(p=>({from:p,to:p}))];
}
function build(destination){
  const out=path.resolve(destination||path.join(ROOT,'_site/crm'));
  if(!out.startsWith(ROOT+path.sep))throw new Error('CRM output must stay within the workspace.');
  const entries=assets();
  for(const asset of entries){
    const source=fs.realpathSync(path.resolve(ROOT,asset.from)),target=path.resolve(out,asset.to);
    if(!source.startsWith(fs.realpathSync(ROOT)+path.sep)||!target.startsWith(out+path.sep)||!fs.statSync(source).isFile())throw new Error('Invalid CRM asset.');
    fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);
  }
  // Lazy imports need a release stamp too: a fresh HTML shell must not load an old globe.
  const scripts=entries.filter(a=>a.to.endsWith('.js')),release=crypto.createHash('sha256');
  scripts.forEach(a=>release.update(a.to).update(fs.readFileSync(path.join(out,a.to))));
  const version=release.digest('hex').slice(0,12),declared=new Set(entries.map(a=>path.resolve(out,a.to)));
  for(const asset of scripts){
    const file=path.join(out,asset.to),body=fs.readFileSync(file,'utf8');
    fs.writeFileSync(file,body.replace(/(["'])(\.\.?\/[^"'\r\n]+\.js)(?:\?[^"'\r\n]*)?\1/g,(original,quote,rel)=>
      declared.has(path.resolve(path.dirname(file),rel))?quote+rel+'?v='+version+quote:original));
  }
  // Stamp from the actual packaged dependency, so CRM releases cannot strand old JS/CSS.
  const html=path.join(out,'index.html');
  fs.writeFileSync(html,fs.readFileSync(html,'utf8').replace(/((?:src|href)="\.\/([^"?]+\.(?:css|js)))\?v=[^"\s]+"/g,(_,prefix,rel)=>{
    const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(out,rel))).digest('hex').slice(0,12);return prefix+'?v='+hash+'"';
  }));
  return entries.length;
}
module.exports={assets,build};
if(require.main===module)console.log('CRM: '+build()+' declared assets packaged at _site/crm/');
