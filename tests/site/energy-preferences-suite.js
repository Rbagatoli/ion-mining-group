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
  const ids = ['landfill_gas', 'flare_gas', 'hydro', 'nuclear', 'wind', 'solar', 'industrial_surplus', 'grid_supply'];
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
  assert.equal((html.match(/name="energySources"/g) || []).length, 8);
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
  assert.match(prefs.coverage(brief), /Nuclear requires dedicated research/);
  assert.match(prefs.coverage(brief), /unsent request/);
  assert.doesNotMatch(source, /\b(?:fetch|localStorage|sessionStorage|XMLHttpRequest)\b/);
});
console.log('\n' + checks + ' energy preference checks passed.');
