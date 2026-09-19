/* Only the miner table was replaced. Order, location, energy and quote sections remain. */
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
  'hwItemised', 'hwCheckout', 'hwRunAll', 'hwClear', 'quote', 'hwOrderPreview', 'hwOrderText', 'hwCopy', 'hwSubmit',
  'brCatalogSlider', 'brMinerCanvas', 'hwCatalogQuantity', 'brCatalogRequest', 'hwCatalogCheckout']) {
  assert.match(html, new RegExp('id="' + id + '"'), 'Preserve ' + id);
}
assert.match(html, /Buy the machines<br>and the place to run them\./);
assert.match(html, /Send it as a quote request/);
assert.match(html, /data-catalog-purpose="hosting"/);
assert.match(html, /id="hwCatalogCheckout" href="\.\/cart\.html"/);
assert.match(html, /id="hwCatalogQuantity"[^>]*min="1"[^>]*max="100000"/);
assert.doesNotMatch(html, /Every machine we can source|id="hwRows"|id="hwHostingForm"/);
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(ids.length, new Set(ids).size, 'No duplicate IDs after restoring sections');
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
console.log('  ok    hardware: restored sections, shared cart and checkout, exact-variant dependencies and quantity boundaries');
