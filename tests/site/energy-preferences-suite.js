/* Energy source selections survive a browser-draft round trip without implying
 * new site research, and unrestricted selection remains distinct from legacy data. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../portal/scouting/energy-preferences.js'), 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context, { timeout: 1000 });
const prefs = context.window.ProtonEnergyPreferences;
const plain = value => JSON.parse(JSON.stringify(value));
let checks = 0;
function check(name, run) { run(); checks++; console.log('  ok    ' + name); }
function fakeForm(values) {
  const ids = ['landfill_gas', 'flare_gas', 'hydro', 'nuclear', 'wind', 'solar', 'geothermal', 'natural_gas', 'biomass_biogas', 'waste_to_energy', 'marine', 'recovered_energy', 'coal', 'oil', 'industrial_surplus', 'grid_supply'];
  function checkbox(value, checked) {
    const handlers = [];
    return { value, checked, addEventListener(type, handler) { assert.equal(type, 'change'); handlers.push(handler); }, change(next) { this.checked = next; handlers.forEach(handler => handler()); }, get listeners() { return handlers.length; } };
  }
  const options = ids.map(id => checkbox(id, values.includes(id)));
  const any = checkbox('any', values.length === 0), note = { textContent: '' };
  return { options, any, note, querySelector(selector) { return selector === 'input[name="anyEnergySource"]' ? any : selector === '[data-energy-research-note]' ? note : null; }, querySelectorAll(selector) { assert.equal(selector, 'input[name="energySources"]'); return options; } };
}

check('legacy and malformed selections retain the original landfill brief', () => {
  for (const value of [undefined, null, '', 'hydro', {}, ['bogus'], [null, 5, {}]]) assert.deepEqual(plain(prefs.normalize(value)), ['landfill_gas']);
  assert.deepEqual(plain(prefs.defaultSources), ['landfill_gas']);
  assert.equal(prefs.changed({}), false);
  assert.equal(prefs.summary({}), 'Landfill gas');
});
check('explicit any-source and valid selections are preserved through JSON persistence', () => {
  for (const values of [[], ['hydro', 'nuclear'], ['landfill_gas', 'flare_gas', 'solar']]) {
    const saved = JSON.parse(JSON.stringify({ energySources: prefs.normalize(values) }));
    assert.deepEqual(plain(prefs.normalize(saved.energySources)), values);
    assert.equal(prefs.changed(saved), true);
  }
  assert.equal(prefs.summary({ energySources: [] }), 'Any energy source');
  assert.deepEqual(plain(prefs.normalize(['hydro', 'bogus', 'hydro', 'flare_gas'])), ['flare_gas', 'hydro']);
});
check('the form offers only allowed values and keeps untrusted strings out of markup', () => {
  const html = prefs.render({ energySources: ['<img src=x onerror=alert(1)>', 'hydro'] });
  assert.equal((html.match(/name="energySources"/g) || []).length, 16);
  assert.match(html, /name="anyEnergySource"/);
  assert.match(html, /value="hydro" checked/);
  assert.doesNotMatch(html, /<img|onerror|name="region"|name="budget"/);
  assert.match(prefs.render({ energySources: [] }), /name="anyEnergySource" value="any" checked/);
  assert.match(prefs.render({}), /value="landfill_gas" checked/);
});
check('Any clears individual choices and selecting a source leaves Any mode', () => {
  const form = fakeForm(['hydro', 'nuclear']);
  prefs.bind(form);
  form.any.change(true);
  assert.equal(form.options.some(option => option.checked), false);
  assert.deepEqual(plain(prefs.read(form)), []);
  form.options.find(option => option.value === 'flare_gas').change(true);
  assert.equal(form.any.checked, false);
  assert.deepEqual(plain(prefs.read(form)), ['flare_gas']);
  assert.match(form.note.textContent, /New research required/);
});
check('deselecting the last source explicitly restores Any and unchecking Any restores the default', () => {
  const form = fakeForm(['landfill_gas']);
  prefs.bind(form); prefs.bind(form);
  assert.equal(form.any.listeners, 1);
  assert.equal(form.options[0].listeners, 1);
  form.options[0].change(false);
  assert.equal(form.any.checked, true);
  assert.deepEqual(plain(prefs.read(form)), []);
  form.any.change(false);
  assert.deepEqual(plain(prefs.read(form)), ['landfill_gas']);
  assert.match(form.note.textContent, /four landfill sites/);
});
check('requests and coverage distinguish broader research from current results', () => {
  const brief = { energySources: ['flare_gas', 'hydro', 'nuclear'] };
  assert.equal(prefs.draftLines(brief)[0], 'Energy sources: Flare gas, Hydro, Nuclear');
  assert.match(prefs.draftLines(brief).join(' '), /does not establish matches or available power/);
  assert.match(prefs.coverage(brief), /four-site report covers landfills only/);
  assert.match(prefs.coverage(brief), /owner qualification/);
  assert.match(prefs.coverage(brief), /nationwide/);
  assert.match(prefs.coverage(brief), /including nuclear records, need dedicated commercial qualification/);
  assert.doesNotMatch(prefs.coverage(brief), /do not currently have nuclear|guaranteed|cheapest available/);
  assert.match(prefs.coverage(brief), /unsent request/);
  assert.doesNotMatch(source, /\b(?:fetch|localStorage|sessionStorage|XMLHttpRequest)\b/);
});
check('national source categories round-trip without treating storage as primary energy', () => {
  const values = ['geothermal', 'natural_gas', 'biomass_biogas', 'waste_to_energy', 'marine', 'recovered_energy', 'coal', 'oil'];
  const form = fakeForm(values);
  assert.deepEqual(plain(prefs.normalize(values)), values);
  assert.deepEqual(plain(prefs.read(form)), values);
  assert.equal(prefs.summary({ energySources: values }), 'Geothermal, Natural gas generation, Biomass / biogas, Waste-to-energy, Marine / tidal / wave, Recovered energy / waste heat, Coal generation, Oil generation');
  const html = prefs.render({ energySources: [] });
  assert.match(html, /Storage and hybrid systems are supply arrangements/);
  assert.doesNotMatch(html, /name="energySources" value="(?:storage|hybrid)"/);
  assert.match(prefs.coverage({ energySources: [] }), /net power available.*all-in delivered cost.*operating windows.*connection work.*capital responsibilities.*timing/);
});
check('the public brief covers the same sources, starts unrestricted and routes email to sales', () => {
  const page = fs.readFileSync(path.join(__dirname, '../../site/energy-sites.html'), 'utf8');
  const form = page.match(/<form\b[^>]*id="siteSearchForm"[\s\S]*?<\/form>/)[0];
  const publicInputs = [...form.matchAll(/<input\b[^>]*name="energy_sources"[^>]*>/g)].map(match => match[0]);
  const publicValues = publicInputs.map(input => input.match(/value="([^"]+)"/)[1]);
  const portalLabels = [...prefs.render({ energySources: [] }).matchAll(/name="energySources" value="[^"]+"[^>]*> ([^<]+)/g)].map(match => match[1]);
  assert.deepEqual(publicValues, portalLabels);
  assert.equal(publicInputs.some(input => /\schecked(?:\s|>)/.test(input)), false);
  assert.match(form, /Any energy source by default/);
  assert.match(form, /data-mailto="sales@protonminingco\.com"/);
  assert.match(form, /data-subject="Energy site sourcing enquiry via protonminingco\.com"/);
  assert.match(form, /All-in delivered energy target \(US ¢\/kWh\)/);
  assert.match(form, /name="minimum_availability_pct"[^>]*min="0" max="100"/);
  assert.match(form, /name="exclusions"/);
  assert.match(form, /name="capital_responsibility"/);
  assert.match(page, /Real public-research examples from a landfill search/);
  assert.match(page, /Other energy sources are researched to your brief/);
  assert.match(page, /this preview is not a list of available power offers/);
});
console.log('\n' + checks + ' energy preference checks passed.');
