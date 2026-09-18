/* Selection and quote labels must not imply a different variant or invented savings. */
'use strict';
const assert = require('node:assert/strict');
const {filterFamilies, safeURL, comparisonText, availabilityText, evidenceReferences} = require('../../site/brokerage-catalog.js');
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
console.log('  ok    brokerage catalogue UI: search, exact variants, safe source evidence, quote labels and future availability (37 checks)');
