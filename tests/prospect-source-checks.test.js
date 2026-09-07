'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../tools/check-prospect-sources.cjs');
const job=()=>({v:1,type:'proton-evidence-watchlist',sources:[{site_id:'s1',watch_id:'watch_1',url:'https://example.com/notice',previous_digest:''}]});
const now=new Date('2026-09-07T16:00:00Z'),html=Buffer.from('<html><script>do not execute()</script><p>Generator replacement &amp; capital scope.</p><p>PPA expires October 5, 2026.</p></html>');
test('public-source helper refuses private, reserved, credentialed and non-HTTPS routes',()=>{
 for(const ip of ['127.0.0.1','10.1.1.1','169.254.169.254','192.168.1.1','172.20.1.1','100.64.1.1','0.0.0.0','224.1.1.1','::1','fe80::1','fc00::1','::ffff:127.0.0.1','2001:db8::1'])assert.equal(C.publicAddress(ip),false,ip);assert.equal(C.publicAddress('93.184.216.34'),true);assert.equal(C.publicAddress('2606:4700::1111'),true);
 for(const url of ['http://example.com','https://u:p@example.com','https://localhost','https://owner.local','https://example.com:8080'])assert.throws(()=>C.publicUrl(url));
});
test('source checks retain original bytes, compare fingerprints and distinguish capture time from publication',async()=>{
 const archives=[],fetcher=async()=>({bytes:html,contentType:'text/html; charset=utf-8',finalUrl:'https://example.com/notice'}),archive=async(bytes,digest,ext)=>{archives.push({bytes,digest,ext});return 'retained-original.html';};
 const first=await C.runChecks(job(),{fetcher,archive,now});assert.equal(first.results[0].outcome,'changed');assert.ok(first.results[0].text.includes('replacement & capital'));assert.ok(!first.results[0].text.includes('do not execute'));assert.equal(first.results[0].document_date,undefined);assert.deepEqual(archives[0].bytes,html);
 const again=job();again.sources[0].previous_digest=first.results[0].digest;const second=await C.runChecks(again,{fetcher,archive,now});assert.equal(second.results[0].outcome,'unchanged');assert.equal(archives.length,1);
});
test('inaccessible, oversized and unarchived sources remain unavailable rather than unchanged',async()=>{
 for(const fetcher of [async()=>{throw Error('HTTP 403');},async()=>({bytes:Buffer.alloc(3*1024*1024),contentType:'text/html'})]){const result=await C.runChecks(job(),{fetcher,archive:async()=>'',now});assert.equal(result.results[0].outcome,'unavailable');assert.equal(result.results[0].digest,'');}
 const result=await C.runChecks(job(),{fetcher:async()=>({bytes:html,contentType:'text/html'}),now});assert.equal(result.results[0].outcome,'unavailable');assert.match(result.results[0].note,/archive/);
});
test('PDF changes retain a fingerprint and original file, while extraction remains explicitly manual',async()=>{
 const bytes=Buffer.from('%PDF-1.7 synthetic fixture only'),result=await C.runChecks(job(),{fetcher:async()=>({bytes,contentType:'application/pdf'}),archive:async(_b,_d,ext)=>'local-original'+ext,now});assert.equal(result.results[0].outcome,'changed');assert.equal(result.results[0].text,'');assert.match(result.results[0].note,/manually/);assert.equal(result.results[0].archive_ref,'local-original.pdf');
});
test('malformed and duplicate exports are rejected before any source request',async()=>{
 const bad=job();bad.sources.push({...bad.sources[0]});let called=false;await assert.rejects(C.runChecks(bad,{fetcher:async()=>{called=true;}}));assert.equal(called,false);assert.throws(()=>C.validateJob({...job(),sources:[]}));
});
