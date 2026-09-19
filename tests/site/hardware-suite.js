/* Browse the vertical family list and review a compact order below the rendering. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {validQuantity} = require('../../site/hardware-catalog.js');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'site/hardware.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'site/hardware-catalog.css'), 'utf8');
const checkout = fs.readFileSync(path.join(root, 'site/cart.html'), 'utf8');
for (const quantity of ['', '0', '-1', '1.5', '100001', 'NaN', 'Infinity', 'bad']) {
  assert.equal(validQuantity(quantity), null, 'Reject invalid quantity ' + quantity);
}
for (const quantity of ['1', '2', '100000']) assert.equal(validQuantity(quantity), Number(quantity));
for (const id of ['hwFacility', 'hwSiteChoice', 'hwPrepay', 'hwUnits', 'hwHash', 'hwPower', 'hwCost',
  'hwItemised', 'hwCheckout', 'hwRunAll', 'hwClear', 'hwOrder', 'hwOrderTitle', 'hwOrderLines', 'hwOrderDetails',
  'hwOrderEnergy', 'hwOrderEnergyLabel', 'hwOrderEnergyValue', 'hwOrderEnergyTerm', 'hwCatalogInfoScroll',
  'hwOrderDock', 'hwDockSummary', 'hwDockCost', 'hwDockReview', 'hwDockCheckout',
  'brCatalogPrev', 'brCatalogNext', 'brCatalogPosition', 'brCatalogRail', 'brMinerCanvas', 'hwCatalogQuantity', 'brCatalogRequest', 'hwCatalogCheckout']) {
  assert.match(html, new RegExp('id="' + id + '"'), 'Preserve ' + id);
}
assert.match(html, /Buy the machines<br>and the place to run them\./);
assert.doesNotMatch(html, /Send it as a quote request|id="(?:quote|mobile-quote|hwOrderPreview|hwOrderText|hwSubmit|hwCopy|brCatalogSlider)"|href="#quote"|type="range"/);
assert.match(html, /href="#hwOrder">Review order/);
assert.match(html, /id="brCatalogRail"[^>]*data-orientation="vertical"[^>]*role="group"[^>]*aria-label="Choose miner family"/);
assert.match(html, /id="brCatalogSearch"[^>]*aria-controls="brCatalogProduct brCatalogRail"/);
assert.doesNotMatch(html, /aria-controls="[^"]*brCatalogSlider/);
assert.doesNotMatch(html, /data-br-view="play"|Pause animation|Pause rotation/);
for (const control of ['out', 'in', 'reset']) assert.match(html, new RegExp('data-br-view="' + control + '"'), 'Keep ' + control + ' model control');
for (const id of ['brCatalogPrev', 'brCatalogNext']) {
  const button = html.match(new RegExp('<button\\b[^>]*id="' + id + '"[^>]*>[\\s\\S]*?<\\/button>'));
  assert.ok(button, id + ' remains a native keyboard-operable button');
  assert.match(button[0], /aria-label="(?:Previous|Next) miner family"/);
  assert.match(button[0], /<svg[^>]*aria-hidden="true"[^>]*focusable="false"/);
}
assert.match(html, /id="brCatalogPrev"[\s\S]*?<path d="M12 19V5m-7 7 7-7 7 7"/);
assert.match(html, /id="brCatalogNext"[\s\S]*?<path d="M12 5v14m-7-7 7 7 7-7"/);
const navStart = html.indexOf('id="brCatalogNavigation"');
const prevAt = html.indexOf('id="brCatalogPrev"', navStart);
const railAt = html.indexOf('id="brCatalogRail"', navStart);
const nextAt = html.indexOf('id="brCatalogNext"', navStart);
assert.ok(prevAt < railAt && railAt < nextAt, 'Vertical family list sits between up/down controls');
assert.match(html, /Swipe sideways to rotate · Swipe up to scroll/);
assert.doesNotMatch(html, /Pinch to zoom|user-scalable\s*=\s*no|maximum-scale\s*=/i, 'Model hints do not claim or restrict native page zoom');
const catalogueEnd = html.indexOf('</section>', html.indexOf('id="miners"'));
assert.ok(catalogueEnd > 0 && html.indexOf('id="hwOrder"') > catalogueEnd, 'Full order follows the complete miner catalogue');
assert.match(html, /class="hw hw-browser-layout"/);
assert.match(html, /id="hwOrder"[^>]*tabindex="-1"/, 'Dock anchor can move focus to the full order');
assert.match(html, /<aside[^>]*id="hwOrderDock"[^>]*aria-label="Your order"[^>]*hidden/);
assert.match(html, /id="hwDockReview" href="#hwOrder"/);
assert.match(html, /id="hwDockCheckout" href="\.\/cart\.html"[^>]*hidden/);
assert.match(html, /id="hwOrderLines"[^>]*aria-label="Selected miners"[^>]*hidden/);
assert.match(css, /@media \(min-width: 1180px\)[\s\S]*?\.hw-browser-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,1fr\);/);
assert.doesNotMatch(css, /\.hw-order\s*\{[^}]*position: sticky|grid-template-columns:\s*minmax\(0,1fr\) 270px/);
assert.match(html, /<details class="hw-order-details" id="hwOrderDetails"><summary>Cost breakdown[\s\S]*?<div id="hwItemised"><\/div><\/details>/);
assert.ok(html.indexOf('id="hwUnpriced"') < html.indexOf('id="hwOrderDetails"'), 'Quote warnings stay outside the collapsed breakdown');
assert.ok(html.indexOf('id="hwOrderEnergy"') < html.indexOf('id="hwOrderDetails"'), 'Energy cost and term remain visible');
assert.match(html, /id="hwCatalogInfoScroll"[^>]*tabindex="0"[^>]*role="region"/, 'Scrollable specifications region is keyboard accessible');
assert.match(css, /\.hw-catalog-info-scroll\s*\{[^}]*overflow-y: auto/);
assert.match(css, /\.br-catalog-rail\s*\{[^}]*overflow-x: hidden;[^}]*overflow-y: scroll;[^}]*scrollbar-gutter: stable/);
assert.match(css, /\.hw-order-dock\s*\{[^}]*position: fixed;[^}]*safe-area-inset-bottom/);
assert.match(css, /\.hardware-page\.hw-order-dock-visible\s*\{[^}]*padding-bottom:/);
assert.ok(html.indexOf('id="hwPrepay"') < html.indexOf('id="miners"'), 'Site/prepay remain before the catalogue');
const navSource = fs.readFileSync(path.join(root, 'site/tools/build-nav.js'), 'utf8');
assert.match(navSource, /'hardware\.html':\s*\{ href: '#hwOrder', label: 'Review order' \}/);
const fragmentLinks = [...html.matchAll(/href="#([^" ]+)"/g)].map(match => match[1]);
for (const fragment of fragmentLinks) assert.ok(html.includes('id="' + fragment + '"'), 'Local link has a target: ' + fragment);
assert.match(html, /data-catalog-purpose="hosting"/);
assert.match(html, /id="hwCatalogCheckout" href="\.\/cart\.html"/);
assert.match(html, /id="hwCatalogQuantity"[^>]*min="1"[^>]*max="100000"/);
assert.doesNotMatch(html, /Every machine we can source|id="hwRows"|id="hwHostingForm"/);
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(ids.length, new Set(ids).size, 'No duplicate catalogue or order IDs');
function scripts(source) { return [...source.matchAll(/<script\s+src="\.\/([^"?]+)/g)].map(match => match[1]); }
for (const [source, controller] of [[html, 'hardware.js'], [checkout, 'checkout.js']]) {
  const loaded = scripts(source);
  for (const name of ['miner-db.js', 'price-list.js', 'facilities.js', 'prepay.js', 'brokerage-catalog-data.js',
    'hardware-order-catalog.js', 'cart.js', controller]) assert.ok(loaded.includes(name), name + ' loads');
  for (const dependency of ['miner-db.js', 'brokerage-catalog-data.js']) {
    assert.ok(loaded.indexOf(dependency) < loaded.indexOf('hardware-order-catalog.js'));
  }
  assert.ok(loaded.indexOf('hardware-order-catalog.js') < loaded.indexOf('cart.js'));
  assert.ok(loaded.indexOf('cart.js') < loaded.indexOf(controller));
}
assert.ok(scripts(html).includes('hardware-catalog.js'));
assert.ok(scripts(html).includes('brokerage-scene.js'));
assert.match(checkout, /id="ckQuoteReview"[^>]*hidden/);
assert.match(checkout, /id="ckQuoteRequest"[^>]*hidden/);
assert.match(checkout, /id="ckPaymentChoice"/);
console.log('  ok    hardware: vertical family navigation, horizontal order strip, expandable cost breakdown, shared checkout and quantity boundaries');
