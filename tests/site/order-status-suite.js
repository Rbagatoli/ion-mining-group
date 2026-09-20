/* Order failures must replace the loading state; only demo orders get a demo badge. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../../site/order.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../../site/order.html'),'utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
async function load({ref='',base='https://orders.example',response,error}={}){
 const elements=Object.fromEntries(ids.map(id=>[id,{hidden:true,textContent:'',innerHTML:'',href:''}]));
 elements.ordLoading.hidden=false;const requests=[];
 const OrdersAPI={base:()=>base,isLocal:()=>false,explain:e=>e.message,get:p=>{requests.push(p);return error?Promise.reject(error):Promise.resolve(response);}};
 vm.runInNewContext(source,{document:{readyState:'complete',getElementById:id=>elements[id]||null},window:{location:{search:ref?'?ref='+encodeURIComponent(ref):''}},OrdersAPI});
 await new Promise(resolve=>setImmediate(resolve));return {elements,requests};
}
function failed(result,text){
 const e=result.elements;assert.equal(e.ordLoading.hidden,true);assert.equal(e.ordLive.hidden,true);
 assert.equal(e.ordError.hidden,false);assert.match(e.ordErrorWhy.textContent,text);
}
(async()=>{
 let r=await load();failed(r,/missing its order reference/);assert.equal(r.requests.length,0);
 console.log('ok missing reference shows recovery instructions without a request');
 r=await load({ref:'PM-EXAMPLE',base:''});failed(r,/sales@protonminingco.com.*PM-EXAMPLE/);assert.equal(r.requests.length,0);
 console.log('ok unavailable tracking shows the reference and contact address');
 r=await load({ref:'PM-EXAMPLE',response:{ok:false,body:{error:'Order not found'}}});failed(r,/Order not found/);
 console.log('ok unknown order replaces loading with an error');
 r=await load({ref:'PM-EXAMPLE',error:new Error('Service unavailable')});failed(r,/Service unavailable/);
 console.log('ok network failure replaces loading with an error');
 for(const demo of [false,true]){
  const reference='PM-A/B',order={reference,demo,status:'quote_requested',totals:{units:1,th:200,kw:3.5,usd:1000,deposit:250,balance:750},destination:{kind:'own'},lines:[],history:[]};
  r=await load({ref:reference,response:{ok:true,body:order}});const e=r.elements;
  assert.deepEqual(r.requests,['/orders/PM-A%2FB']);assert.equal(e.ordRef.textContent,reference);
  assert.equal(e.ordLoading.hidden,true);assert.equal(e.ordLive.hidden,false);assert.equal(e.ordError.hidden,true);
  assert.equal(e.demoFlag.hidden,!demo);assert.equal(e.ordPay.href,'./pay.html?ref=PM-A%2FB&leg=deposit');
  console.log('ok '+(demo?'demo':'real')+' order renders with the correct badge and payment reference');
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
