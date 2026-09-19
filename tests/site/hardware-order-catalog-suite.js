/* Exact variants must survive the cart without borrowing another bin's price or power. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const site=path.join(__dirname,'../../site'),bridge=require(path.join(site,'hardware-order-catalog.js'));
const database=require(path.join(site,'miner-db.js')),catalogue=require(path.join(site,'brokerage-catalog-data.js')),prices=require(path.join(site,'price-list.js'));
const source=fs.readFileSync(path.join(site,'cart.js'),'utf8'),all=catalogue.families.flatMap(f=>f.variants);
const aliases={
 's21-pro-234':'Antminer S21 Pro','s21-plus-216':'Antminer S21+','s21-xp-270':'Antminer S21 XP',
 's21-200':'Antminer S21','t21-190':'Antminer T21','s21-plus-hyd-395':'Antminer S21+ Hyd.',
 's21-xp-hyd-473':'Antminer S21 XP Hyd.','s21-hyd-335':'Antminer S21 Hyd.',
 's19k-pro-120':'Antminer S19k Pro','s19j-pro-plus-120':'Antminer S19j Pro+',
 's19-pro-110':'Antminer S19 Pro','a15-pro-221':'Avalon A15 Pro'
};
let checks=0;
function check(label,fn){fn();checks++;console.log('  ok    '+label);}
function plain(value){return JSON.parse(JSON.stringify(value));}
function storage(raw){const box=Object.create(null),writes=[];if(raw!==undefined)box['img.cart.v1']=raw;return {box,writes,getItem:key=>Object.prototype.hasOwnProperty.call(box,key)?box[key]:null,setItem(key,value){box[key]=String(value);writes.push(key);},removeItem(key){delete box[key];writes.push(key);}};}
function cart(store=storage(),options={}){
 const handlers={},context={window:{localStorage:store,addEventListener:(name,fn)=>handlers[name]=fn},MinerDB:database,PriceList:options.prices||prices};
 if(options.bridge!==false)context.HardwareOrderCatalog=options.bridge||bridge;
 vm.runInNewContext(source,context,{filename:'cart.js'});return {C:context.Cart,store,handlers};
}
function changedLegacy(model,patch){return {getAll:()=>database.getAll(),findByModel:name=>{const row=database.findByModel(name);return row&&name===model?{...row,...patch}:row;}};}
check('all 63 exact variants have distinct cart keys; exactly 12 reuse checked identities',()=>{
 assert.equal(all.length,63);const keys=all.map(v=>bridge.keyForVariant(v.id));assert.equal(new Set(keys).size,63);
 for(const variant of all){assert.equal(bridge.keyForVariant(variant.id),aliases[variant.id]||'catalogue:'+variant.id);const d=bridge.descriptor(variant.id);assert.equal(d.variantId,variant.id);assert.equal(d.quoteRequired,!aliases[variant.id]);}
 assert.equal(keys.filter(key=>!key.startsWith('catalogue:')).length,12);
});
check('every catalogue request resolves the published exact spec and no price',()=>{
 for(const variant of all){const row=bridge.resolve('catalogue:'+variant.id);assert.equal(row.model,'catalogue:'+variant.id);assert.equal(row.hashrate,variant.hashrateTH);assert.equal(row.power,variant.powerW===null?null:variant.powerW/1000);assert.equal(row.efficiency,variant.efficiency);assert.equal(row.quoteRequired,true);assert(row.displayName.includes(variant.name));assert.equal(row.sourceCheckedOn,catalogue.checkedOn);assert.equal(row.each,undefined);assert.equal(row.usd,undefined);}
});
check('234 and 245 TH/s S21 Pro selections never collapse into one legacy SKU',()=>{
 assert.equal(bridge.keyForVariant('s21-pro-234'),'Antminer S21 Pro');assert.equal(bridge.keyForVariant('s21-pro-245'),'catalogue:s21-pro-245');
 assert.equal(bridge.descriptor('s21-pro-245').power,3.675);assert.equal(bridge.descriptor('s21-pro-234').power,3.51);
});
check('the existing one-watt S19 Hydro discrepancy refuses a legacy price',()=>{
 assert.equal(database.findByModel('Antminer S19 XP Hyd.').power,5.345);
 assert.equal(bridge.descriptor('s19-xp-hyd-257').power,5.346);assert.equal(bridge.keyForVariant('s19-xp-hyd-257'),'catalogue:s19-xp-hyd-257');
});
check('an allowed identity loses its alias if either wattage or hashrate changes',()=>{
 for(const patch of [{power:3.511},{hashrate:245},{power:null},{hashrate:NaN},{model:'A different miner'}])assert.equal(bridge.create(changedLegacy('Antminer S21 Pro',patch),catalogue).keyForVariant('s21-pro-234'),'catalogue:s21-pro-234');
});
check('unknown IDs, malformed keys and legacy names do not resolve as request records',()=>{
 for(const id of [null,undefined,'','missing','__proto__','constructor','../s21-pro-234',42])assert.equal(bridge.keyForVariant(id),null);
 for(const key of ['Antminer S21 Pro','catalogue:missing','catalogue:','catalogue:../s21-pro-234','catalogue:s21-pro-234:extra',null])assert.equal(bridge.resolve(key),null);
});
check('a stored request identity never silently upgrades itself to an existing priced SKU',()=>{
 const row=bridge.resolve('catalogue:s21-pro-234');assert.equal(row.model,'catalogue:s21-pro-234');assert.equal(row.quoteRequired,true);
});
check('browser UMD exports the same bridge and missing dependencies fail closed',()=>{
 const context={MinerDB:database,BrokerageCatalog:catalogue};vm.runInNewContext(fs.readFileSync(path.join(site,'hardware-order-catalog.js'),'utf8'),context);
 assert.equal(context.HardwareOrderCatalog.keyForVariant('s21-pro-245'),'catalogue:s21-pro-245');assert.equal(bridge.create(database,null).keyForVariant('s21-pro-245'),null);
 assert.equal(bridge.create(null,catalogue).keyForVariant('s21-pro-234'),'catalogue:s21-pro-234');
});
check('all 63 selections appear in one complete cart without stale entries or invented prices',()=>{
 const {C}=cart();all.forEach(v=>C.set(bridge.keyForVariant(v.id),1));assert.equal(C.lines().length,63);assert.equal(C.count(),63);assert.deepEqual(plain(C.stale()),[]);
 const t=C.totals();assert.equal(t.units,63);assert.equal(t.unpriced,51);assert.equal(t.unknownHash,8);assert.equal(t.unknownPower,20);assert.equal(t.th,null);assert.equal(t.kw,null);assert.equal(t.quoteRequired,true);assert.equal(t.deposit,null);assert.equal(t.balance,null);
 for(const row of C.lines().filter(r=>r.quoteRequired)){assert.equal(row.each,null);assert.equal(row.usd,null);}
});
check('reading a saved legacy cart never overwrites its persisted literal',()=>{
 const literal='{"Antminer S21 Pro":2,"Antminer S19 Pro":7}',store=storage(literal),{C}=cart(store);
 C.lines();C.totals();C.stale();assert.equal(store.box[C.KEY],literal);assert.equal(store.writes.filter(key=>key===C.KEY).length,0);
 assert.equal(C.totals().units,9);assert.equal(C.totals().quoteRequired,false);
});
check('legacy lines retain their original shape, prices and deposit behavior',()=>{
 const {C}=cart();C.set('Antminer S21 Pro',2);const m=database.findByModel('Antminer S21 Pro'),each=prices.priceFor(m.model);
 assert.deepEqual(plain(C.lines()[0]),{model:m.model,qty:2,hashrate:m.hashrate,power:m.power,efficiency:m.efficiency,each,usd:each*2});
 const t=C.totals();assert.equal(t.th,468);assert.equal(t.kw,7.02);assert.equal(t.usd,each*2);assert.equal(t.deposit,t.usd*prices.DEPOSIT_RATE);assert.equal(t.deposit+t.balance,t.usd);assert.equal(t.unknownHash,0);assert.equal(t.unknownPower,0);
});
check('a mixed legacy/request cart uses the correct exact hashrate and power, but no request price',()=>{
 const {C}=cart();C.set('Antminer S21 Pro',2);C.set('catalogue:s21-pro-245',3);const t=C.totals();
 assert.equal(t.units,5);assert.equal(t.th,1203);assert(Math.abs(t.kw-18.045)<1e-9);assert.equal(t.knownTh,t.th);assert.equal(t.knownKw,t.kw);assert.equal(t.unpriced,3);assert.equal(t.usd,prices.priceFor('Antminer S21 Pro')*2);assert.equal(t.deposit,null);assert.equal(t.balance,null);
 assert.equal(C.lines().find(l=>l.variantId==='s21-pro-245').displayName,'Bitmain S21 Pro · 245 TH/s');
});
check('unknown power blocks the full power total while preserving known hashrate and subtotal',()=>{
 const {C}=cart();C.set('Antminer S21 Pro',2);C.set('catalogue:m60s-plus-200',3);const t=C.totals();
 assert.equal(t.th,1068);assert.equal(t.kw,null);assert.equal(t.knownKw,7.02);assert.equal(t.unknownPower,3);assert.equal(t.unknownHash,0);
});
check('unknown hashrate and power are counted by units and never coerced to zero',()=>{
 const {C}=cart();C.set('Antminer S21 Pro',2);C.set('catalogue:s23-air',4);const t=C.totals();
 assert.equal(t.th,null);assert.equal(t.kw,null);assert.equal(t.unknownHash,4);assert.equal(t.unknownPower,4);assert.equal(t.knownTh,468);assert.equal(t.knownKw,7.02);assert.equal(t.units,6);
});
check('truly unknown saved keys remain visible to stale detection and are not erased',()=>{
 const {C,store}=cart(storage('{"Antminer S21 Pro":1,"catalogue:s21-pro-245":2,"catalogue:removed-variant":3,"constructor":4}'));
 assert.deepEqual(plain(C.stale()),['catalogue:removed-variant','constructor']);assert.equal(C.count(),10);assert.equal(C.lines().length,2);assert.equal(JSON.parse(store.box[C.KEY])['catalogue:removed-variant'],3);
});
check('exact keys persist across reload and quantity edits do not overwrite legacy lines',()=>{
 const store=storage('{"Antminer S19 Pro":7}'),first=cart(store).C;first.set('catalogue:s21-pro-245',3);const second=cart(store).C;
 assert.equal(second.qtyOf('Antminer S19 Pro'),7);assert.equal(second.qtyOf('catalogue:s21-pro-245'),3);second.add('catalogue:s21-pro-245',2);
 assert.equal(second.qtyOf('Antminer S19 Pro'),7);assert.equal(second.lines().find(l=>l.variantId==='s21-pro-245').qty,5);
 second.remove('catalogue:s21-pro-245');assert.deepEqual(plain(second.get()),{'Antminer S19 Pro':7});
});
check('cross-tab storage notifications update exact variants without losing listeners',()=>{
 const store=storage(),{C,handlers}=cart(store);let changes=0;const off=C.onChange(()=>changes++);
 store.box[C.KEY]='{"catalogue:s21-pro-245":4,"Antminer S21 Pro":2}';handlers.storage({key:C.KEY});
 assert.equal(changes,1);assert.equal(C.count(),6);assert.equal(C.totals().th,1448);handlers.storage({key:'different-key'});assert.equal(changes,1);
 off();handlers.storage({key:C.KEY});assert.equal(changes,1);
});
check('nav-only pages still retain new keys even when the spec bridge is absent',()=>{
 const store=storage('{"catalogue:s21-pro-245":3,"Antminer S19 Pro":7}'),{C}=cart(store,{bridge:false});
 assert.equal(C.count(),10);assert.deepEqual(plain(C.stale()),['catalogue:s21-pro-245']);assert.equal(C.lines().length,1);assert.equal(store.writes.filter(key=>key===C.KEY).length,0);
});
check('legacy-only unpriced deposit semantics stay unchanged',()=>{
 const stub={DEPOSIT_RATE:prices.DEPOSIT_RATE,priceFor:model=>model==='Antminer S21 Pro'?null:prices.priceFor(model)}, {C}=cart(storage(),{prices:stub});
 C.set('Antminer S21 Pro',2);C.set('Antminer S19 Pro',1);const t=C.totals();assert.equal(t.unpriced,2);assert.equal(t.quoteRequired,false);assert.equal(t.deposit,t.usd*prices.DEPOSIT_RATE);
});
console.log('\n'+checks+' hardware order bridge checks passed.');
