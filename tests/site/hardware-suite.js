/* Hosting catalogue: exact variants, honest capacity and a customer-controlled email draft.
 * Legacy cart pricing/checkout remain covered by cart-suite and facility-suite. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {planFor} = require('../../site/hardware-catalog.js');
const catalog = require('../../site/brokerage-catalog-data.js');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'site/hardware.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'site/hardware-catalog.js'), 'utf8');
const family = catalog.families.find(item => item.modelKey === 's21-pro');
const variant = family.variants.find(item => item.id === 's21-pro-234');
const selection = {family, variant};
const plan = planFor(selection, '10', 'owned', '', {name: 'Requested region', region: 'Canada'});
assert.equal(plan.valid, true);
assert.equal(plan.kw, 35.1);
assert.equal(plan.hashrateTH, 2340);
assert.equal(plan.cooling, 'Air-cooled');
assert.match(plan.text, /Catalogue variant: s21-pro-234/);
assert.match(plan.text, /I already own these miners/);
assert.match(plan.text, /Preferred region: Requested region \(Canada\)/);
assert.match(plan.text, /excludes facility cooling and other overhead/);
assert.match(plan.text, /need confirmation/);
assert.doesNotMatch(plan.text, /\$|deposit|reserved|order confirmed/i);
for (const quantity of ['', '0', '-1', '1.5', '100001', 'NaN', 'Infinity', 'bad']) {
  const invalid = planFor(selection, quantity, 'needed');
  assert.equal(invalid.valid, false, 'Invalid quantity ' + quantity);
  assert.equal(invalid.kw, null);
  assert.equal(invalid.hashrateTH, null);
}
assert.equal(planFor(selection, '100000', 'needed').count, 100000);
assert.equal(planFor(null, '10', 'owned').valid, false);
const manual = planFor(selection, '3', 'owned', 'My miner <234>');
assert.equal(manual.model, 'My miner <234>');
assert.equal(manual.valid, true);
assert.equal(manual.kw, null, 'A manually entered model cannot inherit the previously browsed specs.');
assert.equal(manual.hashrateTH, null);
assert.doesNotMatch(manual.text, /Catalogue variant/);
const unknown = planFor({family: {cooling: 'hydro'}, variant: {id: 'unconfirmed', name: 'Unknown bin', powerW: null, hashrateTH: null}}, '3', 'needed');
assert.equal(unknown.kw, null);
assert.equal(unknown.hashrateTH, null);
assert.match(unknown.text, /To confirm/);
assert.equal(unknown.cooling, 'Hydro-cooled');
for (const item of catalog.families) for (const miner of item.variants) {
  const output = planFor({family: item, variant: miner}, '2', 'needed');
  assert.equal(output.model, miner.name);
  assert.match(output.text, new RegExp('Catalogue variant: ' + miner.id));
  assert.equal(output.kw, typeof miner.powerW === 'number' && miner.powerW > 0 ? miner.powerW * 2 / 1000 : null);
}
assert.match(html, /data-catalog-purpose="hosting"/);
assert.match(html, /id="brCatalogSlider"/);
assert.match(html, /id="brMinerCanvas"/);
assert.doesNotMatch(html, /Every machine we can source|id="hwRows"|id="hwPrepay"|id="hwCheckout"/);
assert.match(html, /id="hwHostingForm"/);
assert.match(html, /id="hwHostingQuantity"[^>]*min="1"/);
assert.match(html, /id="hwHostingOtherModel"/);
assert.match(html, /data-mailto="hosting@protonminingco.com"/);
assert.match(html, /mailto:hosting@protonminingco.com/);
assert.match(html, /id="hwHostingCopy"/);
assert.match(html, /nothing is sent until you send/i);
assert.doesNotMatch(html, /No[^<]*hardware only|Order sent|Buy &amp; sell/);
assert.doesNotMatch(js, /Cart\.(?:set|add|clear)|fetch\(|XMLHttpRequest/);
const scripts = [...html.matchAll(/<script\s+src="\.\/([^"?]+)/g)].map(match => match[1]);
for (const name of ['site.js', 'cart.js', 'facilities.js', 'brokerage-catalog-data.js', 'brokerage-catalog.js', 'brokerage-scene.js', 'hardware-catalog.js']) assert.ok(scripts.includes(name), name + ' loads');
assert.ok(!scripts.includes('hardware.js'), 'The removed order table must not mount.');
assert.ok(scripts.indexOf('brokerage-catalog-data.js') < scripts.indexOf('brokerage-catalog.js'));
assert.ok(scripts.indexOf('facilities.js') < scripts.indexOf('hardware-catalog.js'));
console.log('  ok    hosting hardware: exact catalogue variants, quantities, unknown capacity, manual entry and enquiry boundaries');
