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
assert.match(availabilityText({hashrateTH:234}, 'hosting'), /Published specifications/);
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
function harness({purpose='hosting',comparisonControls=false,marketStatus='current'}={}) {
  class Element {
    constructor(){this.children=[];this.dataset={};this.events={};this.attributes={};this.value='';this.checked=false;this.hidden=true;this.style={setProperty(){}};this._text='';}
    set textContent(value){this._text=String(value);this.children=[];}
    get textContent(){return this._text+this.children.map(child=>child.textContent||'').join('');}
    get childNodes(){return this.children;}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this._text='';this.children=children;}
    setAttribute(name,value){this.attributes[name]=value;}
    addEventListener(name,handler){(this.events[name]||=([])).push(handler);}
    fire(name,event={}){for(const handler of this.events[name]||[])handler(event);}
    querySelector(){return null;}
    focus(){}
  }
  const ids=['brCatalog','brCatalogSearch','brCatalogCooling','brCatalogRail','brCatalogSlider','brCatalogVariants','brCatalogProduct','brCatalogPrev','brCatalogNext','brCatalogSavings','brCatalogEvidence','brCatalogMarket','brCatalogPosition','brCatalogName','brCatalogShown','brCatalogMaker','brCatalogSubtitle','brCatalogSpecs','brCatalogResults','brCatalogEmpty','brCatalogNavigation','brCatalogClear','brCatalogRequest','brCatalogTools','brCatalogCompare'];
  if(comparisonControls)ids.push('brCatalogQuote','brCatalogQuoteMatch','brCatalogCondition','brCatalogQuoteResult');
  const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));nodes.brCatalog.dataset.catalogPurpose=purpose;nodes.brCatalogCooling.value='all';
  const info=new Element();nodes.brCatalog.querySelector=selector=>selector==='.br-catalog-info'?info:null;
  const doc={getElementById:id=>nodes[id]||null,createElement:()=>new Element(),createTextNode:value=>({textContent:value})};
  const emitted=[],win={requestAnimationFrame(){},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},Event:class{constructor(type){this.type=type;}},dispatchEvent:event=>emitted.push(event)};
  let savingsCalls=0,comparisonCalls=0;
  const catalog={families:families.map(f=>({...f,modelKey:f.id,variants:f.variants.map(v=>({...v,powerW:f.cooling==='hydro'?5925:3510,sources:[],market:{observations:[]}}))})),marketFor:()=>({status:marketStatus,low:2695,high:2695,count:1,checkedOn:'2026-09-18',note:'A brokerage-only comparison note with sourcing fees.'}),savingsFor:()=>{savingsCalls++;return{status:'quote-required'};},compareQuote:()=>{comparisonCalls++;return{status:'current',usd:100};}};
  return {nodes,doc,win,catalog,emitted,counts:()=>({savingsCalls,comparisonCalls})};
}
const hosting=harness(),hostingUI=mount(hosting.doc,hosting.catalog,hosting.win);
assert(hostingUI,'Hosting should mount without quote inputs or a brokerage form.');
assert.equal(hosting.nodes.brCatalogCompare.hidden,true);
assert.match(hosting.nodes.brCatalogSavings.textContent,/Hosting requirements/);
assert.match(hosting.nodes.brCatalogSavings.textContent,/Air-cooled/);
assert.match(hosting.nodes.brCatalogMarket.textContent,/Public hardware reference.*\$2,695.*checked 2026-09-18/);
assert.doesNotMatch(hosting.nodes.brCatalogEvidence.textContent,/sourcing fees|brokerage-only|No savings are guaranteed/);
assert.match(hosting.nodes.brCatalogEvidence.textContent,/not a market average or Proton offer/);
assert.equal(hosting.win.BrokerageCatalogSelection.variant.id,'s21-pro-234');
assert.equal(hosting.emitted[0].type,'brokerage:model');
hostingUI.selectFamily(1);
assert.match(hosting.nodes.brCatalogSavings.textContent,/Hydro-cooled.*coolant requirements/);
assert.equal(hosting.win.BrokerageCatalogSelection.modelKey,'s21-hyd');
hosting.nodes.brCatalogRequest.fire('click');
const chosen=hosting.emitted.at(-1);assert.equal(chosen.type,'hardware:choose-miner');assert.equal(chosen.detail.family.id,'s21-hyd');assert.equal(chosen.detail.variant.id,'s21-plus-hyd');
assert.deepEqual(hosting.counts(),{savingsCalls:0,comparisonCalls:0});
const withUnusedInputs=harness({comparisonControls:true});mount(withUnusedInputs.doc,withUnusedInputs.catalog,withUnusedInputs.win);
withUnusedInputs.nodes.brCatalogQuote.value='1000';withUnusedInputs.nodes.brCatalogQuoteMatch.checked=true;withUnusedInputs.nodes.brCatalogQuote.fire('input');assert.deepEqual(withUnusedInputs.counts(),{savingsCalls:0,comparisonCalls:0});
const stale=harness({marketStatus:'stale'});mount(stale.doc,stale.catalog,stale.win);assert.match(stale.nodes.brCatalogMarket.textContent,/Price needs refresh.*2026-09-18/);
const unavailable=harness({marketStatus:'unavailable'});mount(unavailable.doc,unavailable.catalog,unavailable.win);assert.match(unavailable.nodes.brCatalogMarket.textContent,/Reference unavailable/);
const legacy=harness({purpose:'brokerage',comparisonControls:true});mount(legacy.doc,legacy.catalog,legacy.win);assert.equal(legacy.nodes.brCatalogCompare.hidden,false);assert.match(legacy.nodes.brCatalogSavings.textContent,/Hardware price difference/);assert.match(legacy.nodes.brCatalogSubtitle.textContent,/New & used sourcing/);assert.equal(legacy.counts().savingsCalls,1);
console.log('  ok    catalogue UI: search, exact variants, safe evidence, legacy comparison and hosting selection/requirements');
