/* Render and submit the actual checkout with a synthetic DOM and no network.
 * Saved unknown configurations must never become a partial payable order. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const site=path.join(__dirname,'../../site');
const MinerDB=require(path.join(site,'miner-db.js')),PriceList=require(path.join(site,'price-list.js'));
const HardwareOrderCatalog=require(path.join(site,'hardware-order-catalog.js')),Prepay=require(path.join(site,'prepay.js')),Facilities=require(path.join(site,'facilities.js'));
const checkoutSource=fs.readFileSync(path.join(site,'checkout.js'),'utf8');
let checks=0;
function check(label,fn){fn();checks++;console.log('  ok    '+label);}
function harness(held){
 const nodes={},calls=[];
 function element(id){return nodes[id]||(nodes[id]={value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,options:[],listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},scrollIntoView(){},reportValidity(){return true;}});}
 const dest=element('ck-dest');dest.value='ion';dest.selectedIndex=0;dest.options=[{textContent:'A Proton facility'}];
 const context={window:{addEventListener(){}},document:{readyState:'loading',getElementById:element,addEventListener(){},querySelector(){return null;}},MinerDB,PriceList,HardwareOrderCatalog,
  Prepay:{...Prepay,chosen:()=>Prepay.byId('24m')},Facilities:{...Facilities,chosen:()=>Facilities.byId('permian')},
  OrdersAPI:{post(route,payload){calls.push({route,payload});return {then(){return {catch(){}};}};}}};
 vm.runInNewContext(fs.readFileSync(path.join(site,'cart.js'),'utf8'),context);
 Object.entries(held).forEach(([key,qty])=>context.Cart.set(key,qty));
 const hook="    if (document.readyState === 'loading') {";
 assert(checkoutSource.includes(hook),'Checkout lifecycle hook changed; review the focused harness.');
 const source=checkoutSource.replace(hook,"    globalThis.review = {render:render, orderTotals:orderTotals, requiresQuote:requiresQuote, wireSubmit:wireSubmit, quoteHref:quoteHref, rowFor:rowFor};\n"+hook);
 vm.runInNewContext(source,context);context.review.render();context.review.wireSubmit();
 return {context,Cart:context.Cart,review:context.review,nodes,element,calls,submit(){element('ckForm').listeners.submit({preventDefault(){}});}};
}
check('stale-only carts show all selected machines and unknown full cost and energy',()=>{
 const h=harness({'catalogue:removed':2}),t=h.review.orderTotals();
 assert.equal(t.units,2);assert.equal(t.unpriced,2);assert.equal(t.unknownHash,2);assert.equal(t.unknownPower,2);assert.equal(t.th,null);assert.equal(t.kw,null);
 assert.equal(h.element('ckEmpty').hidden,true);assert.equal(h.element('ckBody').hidden,false);assert.equal(h.element('ckUnits').textContent,'2');
 assert.match(h.element('ckHash').textContent,/To confirm/);assert.match(h.element('ckPower').textContent,/To confirm/);assert.equal(h.element('ckCost').textContent,'Quote required');
 assert.match(h.element('ckItemised').innerHTML,/Quote required/);assert.match(h.element('ckItemised').innerHTML,/Power to confirm/);assert.doesNotMatch(h.element('ckItemised').innerHTML,/it-val">\$0(?:\.00)?<|Both together|deposit now/);
 const text=h.element('ckPreview').textContent;assert.match(text,/2 x catalogue:removed/);assert.match(text,/Total: 2 machines/);assert.doesNotMatch(text,/Total: 0|hardware: \$0/);
});
check('mixed stale and known selections never imply a complete priced fleet',()=>{
 const h=harness({'Antminer S21 Pro':1,'catalogue:removed':2}),t=h.review.orderTotals();
 assert.equal(t.units,3);assert.equal(t.unpriced,2);assert.equal(t.usd,4260);assert.equal(t.knownTh,234);assert.equal(t.knownKw,3.51);assert.equal(t.kw,null);
 assert.equal(h.element('ckCost').textContent,'$4,260 + quote');assert.equal(h.element('ckDeposit').textContent,'After quote');assert.equal(h.element('ckBalance').textContent,'After quote');
 assert.doesNotMatch(h.element('ckItemised').innerHTML,/Both together|\$8,277|\$4,017/);assert.match(h.element('ckPreview').textContent,/Total: 3 machines/);
 assert.match(h.element('ckStale').textContent,/remain in your order/);assert.doesNotMatch(h.element('ckStale').textContent,/not counted/);
});
check('presentation totals do not mutate the established Cart.totals contract',()=>{
 const h=harness({'Antminer S21 Pro':1,'catalogue:removed':2});h.review.orderTotals();h.review.render();const raw=h.Cart.totals();
 assert.equal(raw.units,1);assert.equal(raw.unpriced,0);assert.equal(raw.th,234);assert.equal(raw.kw,3.51);assert.equal(raw.deposit,1065);assert.equal(h.Cart.count(),3);
});
check('stale-only and mixed quote carts cannot post even through direct synthetic submission',()=>{
 for(const held of [{'catalogue:removed':2},{'Antminer S21 Pro':1,'catalogue:removed':2},{'Antminer S21 Pro':1,'catalogue:s21-pro-245':2},{'catalogue:s23-air':2}]){
  const h=harness(held),before=JSON.stringify(h.Cart.get());h.submit();assert.equal(h.calls.length,0);assert.equal(JSON.stringify(h.Cart.get()),before);
  assert.equal(h.element('ckSubmit').disabled,true);assert.equal(h.element('ckPaymentChoice').hidden,true);assert.equal(h.element('ckQuoteReview').hidden,false);
 }
});
check('every selected key and quantity remains in the quote draft, including stale keys',()=>{
 const h=harness({'Antminer S21 Pro':1,'catalogue:s21-pro-245':2,'catalogue:removed':3});
 const draft=decodeURIComponent(h.element('ckQuoteRequest').href);assert.match(draft,/1 x Antminer S21 Pro/);assert.match(draft,/2 x Bitmain S21 Pro · 245 TH\/s \[variant: s21-pro-245\]/);assert.match(draft,/3 x catalogue:removed/);assert.match(draft,/Total: 6 machines/);assert.match(draft,/Permian Basin/);assert.match(draft,/24 months prepaid/);
});
check('contact text remains in an encoded mailto draft, without a request or header injection',()=>{
 const h=harness({'catalogue:s21-pro-245':1});h.element('ck-name').value='Test & Example';h.element('ck-email').value='synthetic@example.test';h.element('ck-notes').value='a&bcc=outside@example.test\nprivate note';h.review.render();
 const href=h.element('ckQuoteRequest').href,url=new URL(href);assert.equal(url.protocol,'mailto:');assert.equal(url.pathname,'hosting@protonminingco.com');assert.equal(url.searchParams.get('bcc'),null);assert.equal(url.searchParams.size,2);
 assert.match(url.searchParams.get('body'),/synthetic@example.test/);assert.match(url.searchParams.get('body'),/a&bcc=outside@example.test/);assert.equal(h.calls.length,0);
});
check('removing the final unknown selection restores the unchanged legacy payment path',()=>{
 const h=harness({'Antminer S21 Pro':2,'catalogue:removed':1});h.Cart.remove('catalogue:removed');h.review.render();
 assert.equal(h.element('ckSubmit').disabled,false);assert.equal(h.element('ckSubmit').hidden,false);assert.equal(h.element('ckPaymentChoice').hidden,false);assert.equal(h.element('ckQuoteRequest').hidden,true);
 assert.equal(h.element('ckUnits').textContent,'2');assert.equal(h.element('ckCost').textContent,'$8,520');assert.equal(h.element('ckDeposit').textContent,'$2,130');h.submit();
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].route,'/orders');assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0].payload.lines)),[{model:'Antminer S21 Pro',qty:2}]);
 assert.equal(h.calls[0].payload.destination.site_id,'permian');assert.equal(h.calls[0].payload.destination.prepay_term,'24m');
});
check('unknown specifications stay text and mobile metrics have explicit labels',()=>{
 const h=harness({'catalogue:s23-air':1}),html=h.element('ckLines').innerHTML;
 assert.match(html,/To confirm/);assert.doesNotMatch(html,/NaN|null|undefined/);
 for(const label of ['Hashrate','Power draw','Each','Line total'])assert(html.includes('data-label="'+label+'"'));
});
console.log('\n'+checks+' checkout quote checks passed.');
