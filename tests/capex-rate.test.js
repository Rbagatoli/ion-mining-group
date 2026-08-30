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

console.log('\n=== neither reader moved ===');
var cands = [];
function feed(adapterFile, dataFile, listKey, sourceId) {
    var A = require(path.join(ROOT, adapterFile));
    var raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', dataFile), 'utf8'));
    (raw[listKey] || []).forEach(function (r) {
        try { var n = SS.normalize(A.adapter.normalize(r), sourceId); if (n) cands.push(n); }
        catch (e) { /* a row the adapter rejects was never a candidate */ }
    });
}
feed('source-landfill.js',    'landfills.json',    'projects',   'lmop-landfill');
feed('source-landfill-ca.js', 'landfills-ca.json', 'prospects',  'eccc-landfill-ca');
feed('source-facility.js',    'facilities.json',   'facilities', 'eia-facility');
eq('the candidate set is the same size as when the baseline was cut',
   cands.length, BASE.candidates);

var NOW = '2026-08-27';
var avoided = cands.map(function (c) {
    var r = SI.capitalAvoided(c, { asOf: NOW });
    return c.id + '|' + r.avoidedUsd + '|' + r.requiredUsd + '|' + r.totalBuildUsd + '|' +
           r.confidence + '|' + r.conditionVerified + '|' + r.mandateFactor + '|' +
           r.components.map(function (x) {
               return x.id + ':' + x.perKw + ':' + x.fullUsd + ':' + x.discount + ':' + x.avoidedUsd;
           }).join(',');
}).sort();
/* powerPotentialKw, NOT usable_kw. stack() reads powerPotentialKw or ctx.capacityKw and has
   never read usable_kw, so this digest was computed over 11,829 stacks that ALL bailed at the
   capacity check and returned zero components. It pinned "stack() returns nothing", which is
   why adding a whole collection component to the stack did not move it. Same mistake, in the
   digest, as the assertion that was pinning the collection gap open a few commits ago -- and it
   is the more dangerous copy, because a digest reads as total coverage.
   sourceDetail is passed too: without it the collection component cannot reach any state but
   'unknown', so the digest would be blind to the branch that prices a wellfield. */
var stacks = cands.map(function (c) {
    var m = SC.stack({ powerPotentialKw: c.powerPotentialKw,
                       development_stage: c.developmentStage || null,
                       energyType: c.energyType, sourceDetail: c.sourceDetail || {} },
                     { asOf: NOW });
    if (!m) return c.id + '|null';
    return c.id + '|' + m.incurred_usd + '|' + m.avoided_usd + '|' + m.all_in_capital_usd + '|' +
           m.coverage + '|' + (m.components || []).map(function (x) {
               return x.id + ':' + x.state + ':' + x.usd + ':' + x.avoided_usd;
           }).join(',');
}).sort();

var aDigest = crypto.createHash('sha256').update(avoided.join('\n')).digest('hex');
var sDigest = crypto.createHash('sha256').update(stacks.join('\n')).digest('hex');

/* A DIGEST OVER NOTHING IS A DIGEST THAT PASSES FOREVER. Both serialisations are proved to
   have priced something before either digest is trusted -- the stack one silently did not for
   its whole life. */
/* Split on the field, not indexOf('|null|'): mandateFactor is null on every non-mandated site,
   so a substring test says "unpriced" about 11,825 rows that priced perfectly well. Checking
   for a marker that appears somewhere in the line is not checking the field that matters. */
function pricedCount(rows) {
    return rows.filter(function (s) { return s.split('|')[1] !== 'null'; }).length;
}
var pricedStacks = pricedCount(stacks);
ok('the stack serialisation actually priced candidates', pricedStacks > 10000,
   pricedStacks + ' of ' + cands.length + ' priced');
var pricedAvoided = pricedCount(avoided);
ok('and so did the capitalAvoided one', pricedAvoided > 10000,
   pricedAvoided + ' of ' + cands.length + ' priced');
ok('the stack digest sees the collection component it is meant to guard',
   stacks.join('\n').indexOf('collection:') >= 0);

ok('capitalAvoided is unchanged across all ' + cands.length + ' candidates',
   aDigest === BASE.avoidedDigest,
   'baseline ' + BASE.avoidedDigest + '\n        now      ' + aDigest);
ok('and stack() is unchanged across all ' + cands.length + ' candidates',
   sDigest === BASE.stackDigest,
   'baseline ' + BASE.stackDigest + '\n        now      ' + sDigest);

console.log('\n' + (fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                               : pass + ' passed, ' + fail + ' FAILED'));
process.exit(fail === 0 ? 0 : 1);
