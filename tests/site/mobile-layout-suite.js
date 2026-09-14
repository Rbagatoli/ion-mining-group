/* Keep the requested desktop copy and live IDs when supplying shorter mobile text. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),fixture=require('./fixtures/desktop-copy.json');
const cache=new Map(),read=f=>{if(!cache.has(f))cache.set(f,fs.readFileSync(path.join(root,f),'utf8').replace(/\r\n/g,'\n'));return cache.get(f);};
const decode=s=>s.replace(/&(amp|quot|lt|gt|#10);/g,(_,c)=>({amp:'&',quot:'"',lt:'<',gt:'>','#10':'\n'}[c]));
const ids=s=>[...s.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]).sort();
let variants=0;
assert.equal(fixture.blocks.length,122);
for(const block of fixture.blocks){
 const source=read(block.file),matches=[...source.matchAll(new RegExp('<'+block.tag+'\\b[^>]*data-mobile-copy="([^"]*)"[^>]*>([\\s\\S]*?)<\\/'+block.tag+'>','g'))];
 assert.ok(matches.some(m=>m[2]===block.html),block.file+' lost original desktop copy: '+block.html.slice(0,75));
}
for(const f of fs.readdirSync(path.join(root,'site')).filter(f=>f.endsWith('.html'))){
 const html=read('site/'+f);
 for(const m of html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*data-mobile-copy="([^"]*)"[^>]*>([\s\S]*?)<\/\1>/g)){
  const short=decode(m[2]);variants++;assert.deepEqual(ids(short),ids(m[3]),f+' mobile copy loses a live target');
  assert.ok(!/<(?:input|select|textarea|button|script)\b/i.test(short+m[3]),f+' must not replace interactive controls through copy switching');
 }
}
assert.ok(variants>=137,'Expected mobile variants on every edited page and generated article CTA');
assert.match(read('site/index.html'),/<h1[^>]*>Power in\.<br>Bitcoin out\.<\/h1>/);
assert.match(read('site/site.js'),/max-width: 640px/);
assert.match(read('site/site.js'),/replacement\.replaceWith\(node\)/,'Live price and order-link nodes must survive a layout switch');
console.log('ok 122 original desktop copy blocks retained');
console.log('ok '+variants+' mobile variants preserve live targets and avoid replacing controls');
console.log('ok the requested headline is shared by both layouts');
