/* Browse the 3D catalogue, review the order below, then continue through checkout. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {validQuantity} = require('../../site/hardware-catalog.js');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'site/hardware.html'), 'utf8');
const checkout = fs.readFileSync(path.join(root, 'site/cart.html'), 'utf8');
for (const quantity of ['', '0', '-1', '1.5', '100001', 'NaN', 'Infinity', 'bad']) {
  assert.equal(validQuantity(quantity), null, 'Reject invalid quantity ' + quantity);
}
for (const quantity of ['1', '2', '100000']) assert.equal(validQuantity(quantity), Number(quantity));
for (const id of ['hwFacility', 'hwSiteChoice', 'hwPrepay', 'hwUnits', 'hwHash', 'hwPower', 'hwCost',
  'hwItemised', 'hwCheckout', 'hwRunAll', 'hwClear', 'hwOrder', 'hwOrderTitle',
  'brCatalogPrev', 'brCatalogNext', 'brCatalogPosition', 'brMinerCanvas', 'hwCatalogQuantity', 'brCatalogRequest', 'hwCatalogCheckout']) {
  assert.match(html, new RegExp('id="' + id + '"'), 'Preserve ' + id);
}
assert.match(html, /Buy the machines<br>and the place to run them\./);
assert.doesNotMatch(html, /Send it as a quote request|id="(?:quote|mobile-quote|hwOrderPreview|hwOrderText|hwSubmit|hwCopy|brCatalogSlider|brCatalogRail)"|href="#quote"|type="range"/);
assert.match(html, /href="#hwOrder">Review order/);
assert.doesNotMatch(html, /aria-controls="[^"]*(?:brCatalogRail|brCatalogSlider)/);
assert.doesNotMatch(html, /data-br-view="play"|Pause animation|Pause rotation/);
for (const control of ['out', 'in', 'reset']) assert.match(html, new RegExp('data-br-view="' + control + '"'), 'Keep ' + control + ' model control');
for (const id of ['brCatalogPrev', 'brCatalogNext']) {
  const button = html.match(new RegExp('<button\\b[^>]*id="' + id + '"[^>]*>[\\s\\S]*?<\\/button>'));
  assert.ok(button, id + ' remains a native keyboard-operable button');
  assert.match(button[0], /aria-label="(?:Previous|Next) miner family"/);
  assert.match(button[0], /<svg[^>]*aria-hidden="true"[^>]*focusable="false"/);
}
assert.match(html, /Swipe sideways to rotate · Swipe up to scroll/);
assert.doesNotMatch(html, /Pinch to zoom|user-scalable\s*=\s*no|maximum-scale\s*=/i, 'Model hints do not claim or restrict native page zoom');
const catalogueEnd = html.indexOf('</section>', html.indexOf('id="miners"'));
assert.ok(catalogueEnd > 0 && html.indexOf('id="hwOrder"') > catalogueEnd, 'Order follows the entire miner catalogue');
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
console.log('  ok    hardware: catalogue/order sequence, removed quote and scrolling navigation, shared checkout and quantity boundaries');
