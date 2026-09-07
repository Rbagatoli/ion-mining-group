// The collection rate moved from site-infrastructure.js's own constant onto the shared capex
// rate card. The value did not change -- $550/kW either way -- so the whole claim of this commit
// is "nothing moved", and this is what holds that down.
//
// Two digests, because a shared rate card has two readers:
//   capitalAvoided()  reads the rate, and now reads it from somewhere else
//   stack()           gained an entry on its card and must not have noticed
//
// Nothing iterates DEFAULT_RATES, so stack() was expected to be untouched. Expected is not
// proved, and a rate card is exactly the kind of thing someone later writes a loop over.

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var ROOT = path.join(__dirname, '..');

var pass = 0, fail = 0;
function ok(label, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + (detail ? '\n        ' + detail : '')); }
}
function eq(label, a, b) { ok(label, a === b, 'got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); }

var BASE = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'fixtures', 'capex-rate-baseline.json'), 'utf8'));

global.localStorage = {
    _s: {}, getItem: function (k) { return this._s[k] || null; },
    setItem: function (k, v) { this._s[k] = String(v); },
    removeItem: function (k) { delete this._s[k]; }, key: function () { return null; }, length: 0
};
global.SiteSources = require(path.join(ROOT, 'site-sources.js'));
global.SiteCapex = require(path.join(ROOT, 'site-capex.js'));
var SS = global.SiteSources;
var SC = global.SiteCapex;
/* On the global too: site-capex.js's collection component looks SiteInfrastructure up by name to
   ask whether a field is already in the ground, and a local binding is invisible to that. */
var SI = global.SiteInfrastructure = require(path.join(ROOT, 'site-infrastructure.js'));

console.log('\n=== one rate, one home ===');
eq('the card carries the collection rate', SC.rates().collectionPerKw, 550);
eq('and site-infrastructure reads it from there', SI.rates().collection, SC.rates().collectionPerKw);

/* The point of unifying it: editing the card has to move BOTH readers. Before this change
   site-infrastructure held its own 550 and would have ignored the edit entirely, which is how a
   budget ends up reporting a variance that is really a disagreement between two constants. */
SC.setRate('collectionPerKw', 700);
eq('editing the card moves the estimator', SC.rates().collectionPerKw, 700);
eq('and moves the capital-avoided model with it', SI.rates().collection, 700);
SC.reset();
eq('reset puts it back', SI.rates().collection, 550);

/* THE GAP IS CLOSED, and the assertion that pinned it open never worked. It passed
   `usable_kw: 2000` to a function that reads powerPotentialKw, so stack() bailed at the capacity
   check, returned zero components, and every() over an empty array said yes. It would have kept
   saying yes after the component was added. The fixture below uses a field stack() reads, and
   the first assertion proves it priced something before the rest are trusted. */
var greenfield = SC.stack(
    { powerPotentialKw: 2000, development_stage: 'raw_resource', energyType: 'landfill_gas',
      sourceDetail: { collectionSystem: 'No' } }, {});
ok('the fixture prices a real stack', greenfield.components.length > 5,
   greenfield.components.length + ' components');
var gc = greenfield.components.filter(function (c) { return c.id === 'collection'; })[0];
ok('the stack now prices a collection component', !!gc,
   greenfield.components.map(function (c) { return c.id; }).join(', '));
ok('at the rate on the shared card', gc && gc.usd === SC.rates().collectionPerKw * 2000,
   gc ? String(gc.usd) : 'absent');


console.log('\n=== a rate card cannot establish avoided capital ===');
var projects = JSON.parse(fs.readFileSync(path.join(ROOT,'data/landfills.json'),'utf8')).projects;
var adapter = require(path.join(ROOT,'source-landfill.js')).adapter;
ok('the full current catalogue is exercised', projects.length === 2755);
ok('no published status becomes a priced saving', projects.every(function(p) {
    var r = SI.capitalAvoided(adapter.normalize(p));
    return r.avoidedUsd === null && r.requiredUsd === null && r.totalBuildUsd === null;
}));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
