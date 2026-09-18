'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const catalog = require('../../site/brokerage-catalog-data.js');
const TODAY = '2026-09-18';
let passed = 0;
function test(name, run) {
  try { run(); passed += 1; }
  catch (error) { error.message = name + ': ' + error.message; throw error; }
}
function unit(overrides) {
  const observation = { seller: 'Manufacturer', url: 'https://manufacturer.example/unit', usd: 2000, currency: 'USD', condition: 'new', hashrateTH: 234, checkedOn: TODAY, availability: 'listed', scope: 'hardware-only' };
  return { id: 'synthetic', hashrateTH: 234, protonQuote: null, market: { observations: [Object.assign(observation, overrides)] } };
}
function quote(overrides) { return Object.assign({ usd: 1800, currency: 'USD', condition: 'new', hashrateTH: 234, scope: 'hardware-only' }, overrides); }

test('catalog provides 15 families and 63 variants with unique identifiers', () => {
  assert.strictEqual(catalog.families.length, 15);
  const variants = catalog.families.flatMap(family => family.variants);
  assert.strictEqual(variants.length, 63);
  assert.strictEqual(new Set(variants.map(variant => variant.id)).size, variants.length);
  assert(variants.every(variant => typeof variant.specNote === 'string'));
  assert(variants.every(variant => variant.protonQuote === null));
});
test('every previous model remains represented, with unverified bins kept unknown', () => {
  const ids = ['s21-xp-hyd-473', 's21-plus-hyd-395', 's21-hyd-335', 's21e-hyd', 's21-xp-270', 's21-pro-234', 's21-plus-216', 's21-200', 't21-190', 's19-xp-hyd-257', 's19-xp-141', 's19k-pro-120', 's19j-pro-plus-120', 's19-pro-110', 'm66s-plusplus', 'm66s-plus', 'm66s-286', 'm60s-plusplus-218', 'm60s-188', 'm60-160', 'm56s-plusplus', 'm50s-plusplus-160', 'm50s-124', 'a1566i-261', 'a15-pro-221', 'a1566', 'a1466', 'a1446'];
  ids.forEach(id => assert(catalog.findVariant(id), id));
  assert.strictEqual(catalog.findVariant('a1466').variant.hashrateTH, null);
  assert.strictEqual(catalog.findVariant('a1566i-261').variant.hashrateTH, null);
});
test('browser UMD and Node API expose the same data', () => {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../site/brokerage-catalog-data.js'), 'utf8'), sandbox);
  assert.strictEqual(sandbox.BrokerageCatalog.families.length, 15);
  assert.strictEqual(sandbox.BrokerageCatalog.findVariant('s21-pro-234').variant.hashrateTH, 234);
});
test('dated market observations have explicit currency, bin and condition', () => {
  catalog.families.flatMap(f => f.variants).flatMap(v => v.market.observations).forEach(o => {
    assert.strictEqual(o.currency, 'USD');
    assert.strictEqual(o.scope, 'hardware-only');
    assert(o.hashrateTH > 0 && o.usd > 0);
    assert(['new', 'used'].includes(o.condition));
    assert(/^https:\/\//.test(o.url));
    assert.strictEqual(o.checkedOn, TODAY);
  });
});
test('known current source uses the exact hashrate bin', () => {
  const market = catalog.marketFor('m60s-188', TODAY);
  assert.strictEqual(market.status, 'current');
  assert.strictEqual(market.median, 1692);
  assert.notStrictEqual(market.median, 1656);
  assert.strictEqual(market.count, 1);
});
test('conflicting manufacturer fields are withheld', () => {
  assert.strictEqual(catalog.findVariant('a15-pro-221').variant.efficiency, null);
  assert.strictEqual(catalog.findVariant('a1566i-270').variant.powerW, null);
  assert.strictEqual(catalog.findVariant('a1566i-270').variant.efficiency, null);
  assert.strictEqual(catalog.findVariant('a15-xp-209').variant.powerW, null);
  assert.strictEqual(catalog.findVariant('a1566ha-500').variant.efficiency, null);
  assert.strictEqual(catalog.findVariant('m66s-286').variant.dimensionsMM, null);
  assert(catalog.findVariant('m66s-286').variant.specNote.includes('without reliable axis labels'));
});
test('additional industrial families carry verified sources, distinct modes and no guessed S23 bin', () => {
  const immersion = catalog.findVariant('s21-xp-imm-300');
  assert.strictEqual(immersion.family.modelKey, 's21-immersion');
  assert.strictEqual(immersion.family.variants[0].id, 's21-imm-239');
  assert.strictEqual(immersion.variant.powerW, 4050);
  assert.strictEqual(catalog.findVariant('s21-xp-imm-380').variant.powerW, 5700);
  assert.strictEqual(catalog.marketFor('s21-xp-imm-380', TODAY).status, 'unavailable');
  const hydro = catalog.findVariant('a1566ha-500');
  assert.strictEqual(hydro.family.modelKey, 'avalon-hydro');
  assert.deepStrictEqual(hydro.variant.dimensionsMM, [556, 482.6, 86]);
  assert.strictEqual(catalog.marketFor(hydro.variant, TODAY).median, 4000);
  const s23 = catalog.findVariant('s23-air').variant;
  assert.strictEqual(s23.hashrateTH, null);
  assert.strictEqual(s23.powerW, null);
  assert.strictEqual(catalog.marketFor(s23, TODAY).status, 'unavailable');
});
test('one public listing is explicitly not a market average', () => {
  const result = catalog.marketFor(unit(), TODAY);
  assert.strictEqual(result.low, 2000);
  assert.strictEqual(result.high, 2000);
  assert.strictEqual(result.median, 2000);
  assert(result.note.includes('not a market average'));
});
test('even-count median identifies observed sample, not the whole market', () => {
  const variant = unit();
  variant.market.observations.push(Object.assign({}, variant.market.observations[0], { seller: 'Seller 2', url: 'https://seller2.example/unit', usd: 2200.01 }));
  const result = catalog.marketFor(variant, TODAY);
  assert.strictEqual(result.median, 2100.01);
  assert.strictEqual(result.count, 2);
  assert(result.note.includes('not the whole market'));
});
test('duplicate source listings do not bias the median', () => {
  const variant = unit();
  variant.market.observations.push(Object.assign({}, variant.market.observations[0]));
  assert.strictEqual(catalog.marketFor(variant, TODAY).count, 1);
});
test('the newest check supersedes an older observation from the same source', () => {
  const variant = unit({ checkedOn: '2026-09-01', usd: 2500 });
  variant.market.observations.push(Object.assign({}, variant.market.observations[0], { checkedOn: TODAY, usd: 2000 }));
  assert.strictEqual(catalog.marketFor(variant, TODAY).median, 2000);
  assert.strictEqual(catalog.marketFor(variant, TODAY).count, 1);
});
test('historical sold-out and preorder prices cannot establish savings', () => {
  ['sold-out', 'preorder'].forEach(availability => {
    assert.strictEqual(catalog.marketFor(unit({ availability }), TODAY).status, 'unavailable');
    assert.strictEqual(catalog.compareQuote(unit({ availability }), quote(), TODAY).status, 'not-comparable');
  });
  assert.strictEqual(catalog.marketFor('a16-xp-300', TODAY).median, null);
  assert.strictEqual(catalog.marketFor('seal-a2-pro-air-260', TODAY).median, null);
});
test('conditional, hosting-linked and tax-included references are excluded', () => {
  [{ comparable: false }, { conditional: true }, { couponRequired: true }, { hostingRequired: true }, { taxIncluded: true }].forEach(flags => {
    assert.strictEqual(catalog.marketFor(unit(flags), TODAY).status, 'unavailable');
  });
});
test('future and invalid observation dates are never current', () => {
  ['2026-09-19', '2026-02-30', 'invalid', '', null, 0].forEach(checkedOn => {
    const result = catalog.marketFor(unit({ checkedOn }), TODAY);
    assert.strictEqual(result.status, 'unavailable');
    assert.strictEqual(result.median, null);
  });
});
test('seven-day boundary is inclusive, older references are stale', () => {
  assert.strictEqual(catalog.marketFor(unit({ checkedOn: '2026-09-11' }), TODAY).status, 'current');
  assert.strictEqual(catalog.marketFor(unit({ checkedOn: '2026-09-10' }), TODAY).status, 'stale');
  assert.strictEqual(catalog.compareQuote(unit({ checkedOn: '2026-09-10' }), quote(), TODAY).status, 'stale');
});
test('explicit expiry can invalidate otherwise fresh references', () => {
  assert.strictEqual(catalog.marketFor(unit({ expiresOn: '2026-09-17' }), TODAY).status, 'stale');
  assert.strictEqual(catalog.marketFor(unit({ expiresOn: 'invalid' }), TODAY).status, 'unavailable');
});
test('invalid evaluation dates cannot revive evidence', () => {
  ['invalid', null, 0, '2026-02-30'].forEach(date => {
    assert.strictEqual(catalog.marketFor(unit(), date).status, 'unavailable');
    assert.strictEqual(catalog.compareQuote(unit(), quote(), date).status, 'not-comparable');
  });
});
test('wrong bins, currencies, conditions and scope are rejected', () => {
  [{ hashrateTH: 245 }, { currency: 'CAD' }, { condition: 'used' }, { scope: 'landed' }].forEach(fields => {
    assert.strictEqual(catalog.compareQuote(unit(), quote(fields), TODAY).status, 'not-comparable');
  });
  assert.strictEqual(catalog.compareQuote(unit(), quote({ currency: undefined }), TODAY).status, 'not-comparable');
  assert.strictEqual(catalog.marketFor(unit({ hashrateTH: 245 }), TODAY).status, 'unavailable');
  assert.strictEqual(catalog.marketFor(unit({ currency: 'CAD' }), TODAY).status, 'unavailable');
});
test('used quotes can only use a matching used reference', () => {
  const result = catalog.compareQuote(unit({ condition: 'used' }), quote({ condition: 'used' }), TODAY);
  assert.strictEqual(result.status, 'current');
  assert.strictEqual(result.usd, 200);
});
test('blank and missing quotes remain required, never zero-cost', () => {
  [undefined, null, {}, { usd: '' }, { usd: null }].forEach(q => {
    const result = catalog.compareQuote(unit(), q, TODAY);
    assert.strictEqual(result.status, 'quote-required');
    assert.strictEqual(result.usd, null);
  });
});
test('non-numeric, zero and negative costs are not comparable', () => {
  [0, -1, '1800', NaN, Infinity, 0.001, Number.MAX_VALUE].forEach(usd => assert.strictEqual(catalog.compareQuote(unit(), quote({ usd }), TODAY).status, 'not-comparable'));
  assert.strictEqual(catalog.marketFor(unit({ usd: 0.001 }), TODAY).status, 'unavailable');
});
test('optional input quote dates cannot be future, invalid or expired', () => {
  assert.strictEqual(catalog.compareQuote(unit(), quote({ checkedOn: '2026-09-19' }), TODAY).status, 'not-comparable');
  assert.strictEqual(catalog.compareQuote(unit(), quote({ checkedOn: '2026-02-30' }), TODAY).status, 'not-comparable');
  assert.strictEqual(catalog.compareQuote(unit(), quote({ expiresOn: '2026-09-17' }), TODAY).status, 'stale');
});
test('negative differences are preserved as additional cost', () => {
  const result = catalog.compareQuote(unit(), quote({ usd: 2300 }), TODAY);
  assert.strictEqual(result.status, 'current');
  assert.strictEqual(result.usd, -300);
  assert.strictEqual(result.percent, -15);
  assert(result.note.includes('costs more'));
  assert(result.note.includes('not total delivered savings'));
});
test('currency arithmetic rounds to cents', () => {
  const result = catalog.compareQuote(unit({ usd: 2000.13 }), quote({ usd: 1800.07 }), TODAY);
  assert.strictEqual(result.usd, 200.06);
});
test('unverified bins have no numerical comparison', () => {
  assert.strictEqual(catalog.compareQuote('a1466', quote(), TODAY).status, 'not-comparable');
  assert.strictEqual(catalog.marketFor('missing', TODAY).status, 'unavailable');
  assert.strictEqual(catalog.findVariant('missing'), null);
});
test('all public catalog savings require an actual Proton quote', () => {
  catalog.families.flatMap(f => f.variants).forEach(v => {
    const result = catalog.savingsFor(v, TODAY);
    assert.strictEqual(result.status, 'quote-required');
    assert.strictEqual(result.usd, null);
  });
});
test('unconfirmed or unmatched Proton offers are not advertised savings', () => {
  const variant = unit();
  variant.protonQuote = quote({ checkedOn: TODAY, expiresOn: '2026-09-20', confirmed: true });
  assert.strictEqual(catalog.savingsFor(variant, TODAY).status, 'quote-required');
  variant.protonQuote.comparable = true;
  assert.strictEqual(catalog.savingsFor(variant, TODAY).status, 'current');
  assert.strictEqual(catalog.savingsFor(variant, TODAY).usd, 200);
});
test('expired, future, invalid and undated Proton quotes cannot create savings', () => {
  const variant = unit();
  variant.protonQuote = quote({ confirmed: true, comparable: true, checkedOn: TODAY, expiresOn: '2026-09-17' });
  assert.strictEqual(catalog.savingsFor(variant, TODAY).status, 'not-comparable');
  variant.protonQuote.checkedOn = '2026-09-16';
  assert.strictEqual(catalog.savingsFor(variant, TODAY).status, 'stale');
  variant.protonQuote.checkedOn = '2026-09-19'; variant.protonQuote.expiresOn = '2026-09-20';
  assert.strictEqual(catalog.savingsFor(variant, TODAY).status, 'not-comparable');
  delete variant.protonQuote.checkedOn;
  assert.strictEqual(catalog.savingsFor(variant, TODAY).status, 'not-comparable');
});
console.log('Brokerage catalog data: ' + passed + ' checks passed.');
