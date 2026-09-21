/* Selection and quote labels must not imply a different variant or invented savings. */
'use strict';
const assert = require('node:assert/strict');
const {filterFamilies, safeURL, comparisonText, availabilityText, hostingRequirements, evidenceReferences, mount} = require('../../site/brokerage-catalog.js');
const families = [
  {id: 's21', name: 'Antminer S21 air', maker: 'Bitmain', cooling: 'air', variants: [
    {id: 's21-pro-234', name: 'Antminer S21 Pro', hashrateTH: 234},
    {id: 's21-plus-216', name: 'Antminer S21+', hashrateTH: 216}
  ]},
  {id: 's21-hyd', name: 'Antminer S21 hydro', maker: 'Bitmain', cooling: 'hydro', variants: [
    {id: 's21-plus-hyd', name: 'Antminer S21+ HYD', hashrateTH: 395}
  ]},
  {id: 'm60', name: 'WhatsMiner M60', maker: 'MicroBT', cooling: 'air', variants: [
    {id: 'm60s', name: 'WhatsMiner M60S', hashrateTH: 186}
  ]}
];
assert.equal(filterFamilies(families, '', 'all').length, 3);
assert.equal(filterFamilies(families, 'MicroBT', 'all')[0].family.id, 'm60');
assert.equal(filterFamilies(families, 'M60S', 'hydro').length, 0);
assert.deepEqual(filterFamilies(families, 's21+', 'air')[0].variants.map(v => v.id), ['s21-plus-216']);
assert.deepEqual(filterFamilies(families, '234', 'all')[0].variants.map(v => v.id), ['s21-pro-234']);
assert.deepEqual(filterFamilies(families, 'BITMAIN  s21 PRO', 'all')[0].variants.map(v => v.id), ['s21-pro-234']);
assert.equal(filterFamilies(families, 'air-cooled', 'all').length, 2);
assert.equal(filterFamilies(families, 'unknown model', 'all').length, 0);
assert.equal(families[0].variants.length, 2, 'Filtering must not remove family variants from the catalogue.');
assert.equal(safeURL('javascript:alert(1)'), null);
assert.equal(safeURL('http://example.com/prices'), null);
assert.equal(safeURL('/somewhere'), null);
assert.equal(safeURL('https://example.com/prices'), 'https://example.com/prices');
assert.equal(comparisonText({status: 'quote-required'}).value, 'Quote required');
assert.equal(comparisonText({status: 'current', usd: 220}).label, 'Hardware price difference / machine');
assert.equal(comparisonText({status: 'current', usd: 220}).value, '$220 lower');
assert.equal(comparisonText({status: 'current', usd: -220}).label, 'Hardware price difference / machine');
assert.equal(comparisonText({status: 'current', usd: -220}).value, '$220 higher');
assert.equal(comparisonText({status: 'current', usd: 0}).label, 'Hardware price difference / machine');
assert.equal(comparisonText({status: 'current', usd: 0.25}).value, '$0.25 lower');
assert.equal(comparisonText({status: 'stale', usd: 220}).value, 'Refresh price first');
assert.equal(comparisonText({status: 'not-comparable', usd: 220}).value, 'No matched comparison');
assert.equal(comparisonText({status: 'current', usd: NaN}).value, 'Quote required');
assert.equal(comparisonText({status: 'current', usd: Infinity}).value, 'Quote required');
assert.match(comparisonText({status: 'current', usd: 220}).detail, /public asking-price reference/);
assert.doesNotMatch(comparisonText({status: 'current', usd: 220}).label, /saving/i);
assert.match(availabilityText({availability: 'preorder'}), /Future batch · availability to confirm/);
assert.doesNotMatch(availabilityText({availability: 'preorder'}), /Preorder/);
assert.match(availabilityText({availability: 'sold-out'}), /Listed sold out/);
const sharedURL = 'https://example.com/miner';
const datedListing = {seller: 'Manufacturer store', url: sharedURL, usd: 4000, checkedOn: '2026-09-18', availability: 'sold-out', condition: 'new', note: 'Future batch; delivery date to confirm.'};
const evidence = evidenceReferences({sources: [{label: 'Official specification', url: sharedURL}], market: {observations: [datedListing, datedListing, {...datedListing, usd: 3900, checkedOn: '2026-09-17'}]}}, {});
assert.equal(evidence.length, 3, 'Same URL must keep distinct specification and dated market observations while removing exact duplicate rows.');
assert.equal(evidence[0].kind, 'specification');
assert.equal(evidence[1].kind, 'listing');
assert.equal(evidence[1].source.usd, 4000);
assert.equal(evidence[1].source.checkedOn, '2026-09-18');
assert.equal(evidence[1].source.availability, 'sold-out');
assert.equal(evidence[1].source.note, 'Future batch; delivery date to confirm.');
assert.equal(evidenceReferences({sources: ['javascript:alert(1)'], market: {observations: []}}, {sources: [{url: sharedURL}]}).length, 1);
assert.equal(availabilityText({hashrateTH:234}, 'hosting'), 'SHA-256 · Bitcoin');
assert.doesNotMatch(availabilityText({hashrateTH:234}, 'hosting'), /sourcing/i);
assert.match(availabilityText({hashrateTH:null}, 'hosting'), /Exact hashrate bin to confirm/);
assert.match(availabilityText({availability:'sold-out'}, 'hosting'), /Listed sold out/);
assert.match(availabilityText({hashrateTH:234}), /New & used sourcing/);
for (const cooling of ['air','hydro','immersion']) {
  const requirements=hostingRequirements({cooling},{powerW:3510});
  assert.equal(requirements.label,'Hosting requirements');
  assert.match(requirements.detail,/site electrical compatibility/);
  assert.match(requirements.detail,/3,510 W at the miner; facility cooling and other site loads are additional/);
}
assert.match(hostingRequirements({cooling:'air'},{powerW:null}).detail,/Miner power requires confirmation/);
assert.match(hostingRequirements({cooling:'hydro'},{powerW:5925}).detail,/coolant requirements, flow, heat rejection/);
assert.match(hostingRequirements({cooling:'immersion'},{powerW:4050}).detail,/approved immersion fluid, compatible tank/);

/* Exercise the mounted controller contract with small DOM test doubles. No
   Three/WebGL is needed to prove hosting selection and optional controls. */
function harness({purpose='hosting',comparisonControls=false,marketStatus='current',withRail=false,orientation='horizontal'}={}) {
  let focused=null;const pendingFrames=[];
  class Element {
    constructor(){this.children=[];this.dataset={};this.events={};this.attributes={};this.value='';this.checked=false;this.hidden=true;this.style={setProperty(){}};this._text='';this.scrollTop=0;this.scrollLeft=0;}
    set textContent(value){this._text=String(value);this.children=[];}
    get textContent(){return this._text+this.children.map(child=>child.textContent||'').join('');}
    get childNodes(){return this.children;}
    append(...children){for(const child of children){child.parentNode=this;this.children.push(child);}}
    replaceChildren(...children){this._text='';for(const child of this.children)child.parentNode=null;this.children=[];if(this.layout){this.scrollTop=0;this.scrollLeft=0;}this.append(...children);}
    setAttribute(name,value){this.attributes[name]=value;}
    addEventListener(name,handler){(this.events[name]||=([])).push(handler);}
    fire(name,event={}){for(const handler of this.events[name]||[])handler(event);}
    querySelector(selector){return selector==='[aria-pressed="true"]'?this.children.find(child=>child.attributes?.['aria-pressed']==='true')||null:null;}
    closest(selector){if(selector==='[data-br-catalog-family]'&&this.dataset.brCatalogFamily)return this;if(selector==='[data-br-catalog-variant]'&&this.dataset.brCatalogVariant)return this;return this.parentNode?.closest?.(selector)||null;}
    get isConnected(){return !!this.isRoot||!!this.parentNode?.isConnected;}
    getBoundingClientRect(){
      if(this.bounds)return this.bounds;
      const parent=this.parentNode;
      if(parent?.layout){
        const rect=parent.getBoundingClientRect(),index=parent.children.indexOf(this);
        const left=rect.left+(parent.layout==='horizontal'?index*90:0)-parent.scrollLeft;
        const top=rect.top+(parent.layout==='vertical'?index*60:0)-parent.scrollTop;
        return {left,right:left+(parent.layout==='horizontal'?90:200),top,bottom:top+(parent.layout==='vertical'?60:40)};
      }
      return {left:0,right:100,top:0,bottom:100};
    }
    focus(options){focused=this;this.focusOptions=options;}
    scrollIntoView(){throw new Error('Catalogue browsing must not scroll page ancestors');}
  }
  const ids=['brCatalog','brCatalogSearch','brCatalogCooling','brCatalogVariants','brCatalogProduct','brCatalogPrev','brCatalogNext','brCatalogSavings','brCatalogEvidence','brCatalogMarket','brCatalogPosition','brCatalogName','brCatalogShown','brCatalogMaker','brCatalogSubtitle','brCatalogSpecs','brCatalogResults','brCatalogEmpty','brCatalogNavigation','brCatalogClear','brCatalogRequest','brCatalogTools','brCatalogCompare'];
  if(withRail)ids.push('brCatalogRail');
  if(comparisonControls)ids.push('brCatalogQuote','brCatalogQuoteMatch','brCatalogCondition','brCatalogQuoteResult');
  const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));for(const item of Object.values(nodes))item.isRoot=true;
  nodes.brCatalog.dataset.catalogPurpose=purpose;nodes.brCatalogCooling.value='all';
  nodes.brCatalogVariants.layout='horizontal';nodes.brCatalogVariants.bounds={left:0,right:120,top:400,bottom:440};
  if(withRail){nodes.brCatalogRail.dataset.orientation=orientation;nodes.brCatalogRail.layout=orientation;nodes.brCatalogRail.bounds={left:0,right:200,top:100,bottom:220};}
  const info=new Element();nodes.brCatalog.querySelector=selector=>selector==='.br-catalog-info'?info:null;
  const doc={getElementById:id=>nodes[id]||null,createElement:()=>new Element(),createTextNode:value=>({textContent:value})};
  const emitted=[],win={scrollY:500,scrollTo(){throw new Error('Catalogue browsing must not scroll the page');},requestAnimationFrame(callback){pendingFrames.push(callback);},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},Event:class{constructor(type){this.type=type;}},dispatchEvent:event=>emitted.push(event)};
  let savingsCalls=0,comparisonCalls=0;
  const catalog={families:families.map(f=>({...f,modelKey:f.id,variants:f.variants.map(v=>({...v,powerW:f.cooling==='hydro'?5925:3510,sources:[],market:{observations:[]}}))})),marketFor:()=>({status:marketStatus,low:2695,high:2695,count:1,checkedOn:'2026-09-18',note:'A brokerage-only comparison note with sourcing fees.'}),savingsFor:()=>{savingsCalls++;return{status:'quote-required'};},compareQuote:()=>{comparisonCalls++;return{status:'current',usd:100};}};
  return {nodes,doc,win,catalog,emitted,flush(){while(pendingFrames.length)pendingFrames.shift()();},focused:()=>focused,counts:()=>({savingsCalls,comparisonCalls})};
}
const hosting=harness(),hostingUI=mount(hosting.doc,hosting.catalog,hosting.win);
assert(hostingUI,'Hosting should mount without quote inputs or a brokerage form.');
assert.equal(hosting.nodes.brCatalogCompare.hidden,true);
assert.match(hosting.nodes.brCatalogSavings.textContent,/Hosting requirements/);
assert.match(hosting.nodes.brCatalogSavings.textContent,/Air-cooled/);
assert.match(hosting.nodes.brCatalogMarket.textContent,/Public hardware reference.*USD \/ machine.*\$2,695/);
assert.match(hosting.nodes.brCatalogEvidence.textContent,/checked 2026-09-18/);
assert.doesNotMatch(hosting.nodes.brCatalogEvidence.textContent,/sourcing fees|brokerage-only|No savings are guaranteed/);
assert.match(hosting.nodes.brCatalogEvidence.textContent,/not a market average or Proton offer/);
assert.equal(hosting.win.BrokerageCatalogSelection.variant.id,'s21-pro-234');
assert.equal(hosting.emitted[0].type,'brokerage:model');
hostingUI.selectFamily(1);
assert.match(hosting.nodes.brCatalogSavings.textContent,/Hydro-cooled/);
assert.match(hosting.nodes.brCatalogEvidence.textContent,/coolant requirements/);
assert.equal(hosting.win.BrokerageCatalogSelection.modelKey,'s21-hyd');
hosting.nodes.brCatalogRequest.fire('click');
const chosen=hosting.emitted.at(-1);assert.equal(chosen.type,'hardware:choose-miner');assert.equal(chosen.detail.family.id,'s21-hyd');assert.equal(chosen.detail.variant.id,'s21-plus-hyd');
assert.deepEqual(hosting.counts(),{savingsCalls:0,comparisonCalls:0});
const withUnusedInputs=harness({comparisonControls:true});mount(withUnusedInputs.doc,withUnusedInputs.catalog,withUnusedInputs.win);
withUnusedInputs.nodes.brCatalogQuote.value='1000';withUnusedInputs.nodes.brCatalogQuoteMatch.checked=true;withUnusedInputs.nodes.brCatalogQuote.fire('input');assert.deepEqual(withUnusedInputs.counts(),{savingsCalls:0,comparisonCalls:0});
const stale=harness({marketStatus:'stale'});mount(stale.doc,stale.catalog,stale.win);assert.match(stale.nodes.brCatalogMarket.textContent,/Price needs refresh/);assert.match(stale.nodes.brCatalogEvidence.textContent,/2026-09-18/);
const unavailable=harness({marketStatus:'unavailable'});mount(unavailable.doc,unavailable.catalog,unavailable.win);assert.match(unavailable.nodes.brCatalogMarket.textContent,/Reference unavailable/);
const legacy=harness({purpose:'brokerage',comparisonControls:true});mount(legacy.doc,legacy.catalog,legacy.win);assert.equal(legacy.nodes.brCatalogCompare.hidden,false);assert.match(legacy.nodes.brCatalogSavings.textContent,/Hardware price difference/);assert.match(legacy.nodes.brCatalogSubtitle.textContent,/New & used sourcing/);assert.equal(legacy.counts().savingsCalls,1);
const navigation=harness(),navigationUI=mount(navigation.doc,navigation.catalog,navigation.win);
assert.equal(navigation.doc.getElementById('brCatalogSlider'),null,'No slider is required to mount or browse.');
assert.equal(navigation.doc.getElementById('brCatalogRail'),null,'No family strip is required to mount or browse.');
navigation.nodes.brCatalogNext.fire('click');assert.equal(navigationUI.getSelection().family.id,'s21-hyd');
navigation.nodes.brCatalogPrev.fire('click');assert.equal(navigationUI.getSelection().family.id,'s21');
navigation.nodes.brCatalogPrev.fire('click');assert.equal(navigationUI.getSelection().family.id,'m60','Previous wraps to the last matching family.');
navigation.nodes.brCatalogNext.fire('click');assert.equal(navigationUI.getSelection().family.id,'s21');
const railNavigation=harness({withRail:true}),railUI=mount(railNavigation.doc,railNavigation.catalog,railNavigation.win);
let prevented=0;
for(const [key,id] of [['End','m60'],['Home','s21'],['ArrowRight','s21-hyd'],['ArrowLeft','s21']]) {
  railNavigation.nodes.brCatalogRail.fire('keydown',{key,target:{closest:()=>({})},preventDefault(){prevented++;}});
  assert.equal(railUI.getSelection().family.id,id,'Family rail keyboard '+key);
}
assert.equal(prevented,4);
navigation.nodes.brCatalogCooling.value='hydro';navigation.nodes.brCatalogCooling.fire('change');
assert.equal(navigation.nodes.brCatalogPrev.disabled,true);assert.equal(navigation.nodes.brCatalogNext.disabled,true);
assert.equal(navigation.nodes.brCatalogPosition.textContent,'01 / 01');
navigation.nodes.brCatalogNext.fire('click');assert.equal(navigationUI.getSelection().family.id,'s21-hyd');
navigation.nodes.brCatalogSearch.value='missing miner';navigation.nodes.brCatalogSearch.fire('input');assert.equal(navigation.nodes.brCatalogNavigation.hidden,true);
navigation.nodes.brCatalogClear.fire('click');assert.equal(navigation.nodes.brCatalogNavigation.hidden,false);assert.equal(navigation.nodes.brCatalogNext.disabled,false);

const vertical=harness({withRail:true,orientation:'vertical'}),verticalUI=mount(vertical.doc,vertical.catalog,vertical.win);
const rail=vertical.nodes.brCatalogRail;
function railKey(key,extra={}) {
  let prevented=false;
  rail.fire('keydown',{key,target:rail.querySelector('[aria-pressed="true"]'),preventDefault(){prevented=true;},...extra});
  vertical.flush();return prevented;
}
function selectedVisible(label) {
  const selected=rail.querySelector('[aria-pressed="true"]'),item=selected.getBoundingClientRect(),bounds=rail.getBoundingClientRect();
  assert(item.top>=bounds.top&&item.bottom<=bounds.bottom,label+' stays inside the rail viewport');
  assert.equal(rail.children.filter(child=>child.attributes['aria-pressed']==='true').length,1,label+' has one announced selection');
  assert.equal(vertical.win.scrollY,500,label+' does not move the page');
  assert.equal(rail.scrollLeft,0,label+' does not scroll the vertical rail sideways');
}
vertical.flush();selectedVisible('Initial family');
assert(railKey('End'));assert.equal(verticalUI.getSelection().family.id,'m60');assert.equal(rail.scrollTop,60);selectedVisible('End');
assert.deepEqual(vertical.focused().focusOptions,{preventScroll:true},'Keyboard selection focuses without scrolling page ancestors.');
assert(railKey('ArrowUp'));assert.equal(verticalUI.getSelection().family.id,'s21-hyd');selectedVisible('ArrowUp');
assert(railKey('ArrowDown'));assert.equal(verticalUI.getSelection().family.id,'m60');selectedVisible('ArrowDown');
assert(railKey('Home'));assert.equal(verticalUI.getSelection().family.id,'s21');assert.equal(rail.scrollTop,0);selectedVisible('Home');
assert(!railKey('ArrowRight'),'Vertical rails do not consume horizontal navigation keys.');
assert(!railKey('ArrowDown',{ctrlKey:true}),'Modified keys are left to the browser.');
const lastButton=rail.children.at(-1);lastButton.focus({preventScroll:true});
assert(railKey('ArrowUp',{target:lastButton}));assert.equal(verticalUI.getSelection().family.id,'s21-hyd','Keyboard movement starts at the actually focused family.');
vertical.nodes.brCatalogNext.fire('click');vertical.flush();selectedVisible('Next-family button');
const heldSelection=verticalUI.getSelection().family.id;
rail.scrollTop=0;rail.fire('scroll');
assert.equal(verticalUI.getSelection().family.id,heldSelection,'Native scrollbar movement does not choose a model.');
vertical.nodes.brCatalogNext.fire('click');vertical.flush();assert.equal(verticalUI.getSelection().family.id,'s21');selectedVisible('Wrapped next-family button');
verticalUI.selectFamily(2);vertical.flush();vertical.nodes.brCatalogCooling.value='air';vertical.nodes.brCatalogCooling.fire('change');vertical.flush();
assert.equal(verticalUI.getSelection().family.id,'m60','Filtering retains a matching current family.');selectedVisible('Retained filter selection');
vertical.nodes.brCatalogSearch.value='216';vertical.nodes.brCatalogSearch.fire('input');vertical.flush();
assert.equal(verticalUI.getSelection().variant.id,'s21-plus-216','Search chooses the exact matching bin when the previous family is excluded.');
assert(vertical.nodes.brCatalogPrev.disabled&&vertical.nodes.brCatalogNext.disabled,'One result disables both family-step buttons.');selectedVisible('One result');
vertical.nodes.brCatalogSearch.value='missing miner';vertical.nodes.brCatalogSearch.fire('input');vertical.flush();
assert.equal(rail.children.length,0,'Empty results remove stale family choices.');
assert.equal(vertical.nodes.brCatalogPosition.textContent,'00 / 00');assert(vertical.nodes.brCatalogPrev.disabled&&vertical.nodes.brCatalogNext.disabled);
assert(vertical.nodes.brCatalogProduct.hidden&&vertical.nodes.brCatalogNavigation.hidden,'Empty results hide obsolete product/navigation details.');
vertical.nodes.brCatalogClear.fire('click');vertical.flush();selectedVisible('Cleared filters');
assert.deepEqual(vertical.nodes.brCatalogSearch.focusOptions,{preventScroll:true},'Clearing filters does not move the page to focus search.');
const variantRow=vertical.nodes.brCatalogVariants;
variantRow.fire('click',{target:variantRow.children[0]});vertical.flush();
variantRow.fire('click',{target:variantRow.children[1]});vertical.flush();
assert.equal(variantRow.scrollLeft,60,'Exact-variant options keep their horizontal reveal behavior.');
assert.equal(variantRow.scrollTop,0);assert.equal(vertical.win.scrollY,500);
assert(!vertical.emitted.some(event=>event.type==='hardware:choose-miner'),'Browsing, keys, scrolling and filters never add to the order.');
const stableCount=harness({withRail:true,orientation:'vertical'});
stableCount.catalog.families[2].name='WhatsMiner family with a deliberately long representative model name';
stableCount.catalog.families[0].variants[1].name='Antminer S21+ with a deliberately long exact operating configuration';
const stableUI=mount(stableCount.doc,stableCount.catalog,stableCount.win),initialCount=stableCount.nodes.brCatalogResults.textContent;
stableUI.selectFamily(2);stableCount.flush();
assert.equal(stableCount.nodes.brCatalogResults.textContent,initialCount,'Long family names do not reflow the results count or move browsing arrows.');
assert.equal(stableCount.nodes.brCatalogPosition.attributes['aria-label'],stableCount.catalog.families[2].name+', 3 of 3','Selection remains announced independently of the stable results count.');
stableUI.selectFamily(0);stableCount.nodes.brCatalogVariants.fire('click',{target:stableCount.nodes.brCatalogVariants.children[1]});stableCount.flush();
assert.equal(stableCount.nodes.brCatalogResults.textContent,initialCount,'Long variant names do not reflow the results count or move browsing arrows.');
assert.equal(stableCount.nodes.brCatalogName.textContent,stableCount.catalog.families[0].variants[1].name,'The full selected variant remains visible in the product title.');
for(const orientation of ['vertical','horizontal']) {
  const retained=harness({withRail:true,orientation});
  retained.catalog.families[2].variants.push({...retained.catalog.families[2].variants[0],id:'m60s-second-bin',name:'WhatsMiner M60S second bin',hashrateTH:190});
  const retainedUI=mount(retained.doc,retained.catalog,retained.win);retainedUI.selectFamily(2);retained.flush();
  const retainedRail=retained.nodes.brCatalogRail,offset=orientation==='vertical'?'scrollTop':'scrollLeft';
  const before=retainedRail[offset];assert(before>0,orientation+' fixture starts with a scrolled family list');
  retained.nodes.brCatalogVariants.fire('click',{target:retained.nodes.brCatalogVariants.children[1]});retained.flush();
  assert.equal(retainedUI.getSelection().variant.id,'m60s-second-bin');
  assert.equal(retainedRail[offset],before,orientation+' family list retains its scroll position when a variant changes');
  assert.equal(retained.win.scrollY,500,'Variant selection leaves the page scroll position unchanged.');
}
console.log('  ok    catalogue UI: search, exact variants, evidence, hosting, vertical family scrolling/focus, keyboard navigation and unchanged order boundaries');
