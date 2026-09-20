'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.join(__dirname, '../../portal/scouting');
const window = {};
for (const file of ['sample-data.js', 'energy-access-data.js', 'site-access.js', 'site-diligence.js']) vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), { window, URL });
const api = window.ProtonSiteDiligence;
const escape = text => text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const profiles = [...window.ProtonScoutingSample.profiles, ...window.ProtonScoutingSample.exclusions.map(e => e.profile)];
for (const p of profiles) {
  const infra = api.renderInfrastructure(p), terms = api.renderTerms(p);
  for (const fact of p.facts) assert(infra.includes(escape(fact.value)), p.id + ': missing documented fact');
  assert.doesNotMatch(infra, /<details>/, 'Equipment facts must be visible without expanding a panel');
  for (const field of p.checklist.filter(f => /^IF-/.test(f.id))) assert(infra.includes(escape(field.nextQuestion)), p.id + ': missing verification question');
  assert.match(infra, /Who pays/); assert.match(infra, /Unassigned/); assert.match(infra, /No reuse value has been credited/);
  assert.match(terms, /Existing arrangements and constraints/); assert.match(terms, /Your proposed mining arrangement/);
  assert.match(terms, /No outreach recorded/); assert.match(terms, /Not quoted \/ agreed/);
}
assert.match(api.renderInfrastructure(profiles[2]), /13\.2/);
assert.match(api.renderInfrastructure(profiles[0]), /0\.9 MW/);
const malicious = { facts: [{label:'<script>bad</script>', value:'<img src=x>',sourceIds:['x']}],sources:[{id:'x',url:'javascript:alert(1)',title:'Unsafe'}],concerns:[] };
const rendered = api.renderInfrastructure(malicious);
assert.doesNotMatch(rendered, /<script>|<img|href="javascript:/); assert.match(rendered, /&lt;img/);
assert.match(api.renderInfrastructure({}), /No equipment records/);
for (const file of ['site-diligence.js', 'energy-preferences.js']) assert.doesNotMatch(fs.readFileSync(path.join(root,file),'utf8'), /\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage)\s*[.(]/);
assert.equal(window.ProtonSiteAccess.outlook(profiles[0], {minMw:'0.5',maxMw:'2',energySources:['hydro']}).label, 'Outside your selected energy sources');
console.log('Site diligence: all four profiles, unpriced capital, source boundaries and source mismatch passed.');
