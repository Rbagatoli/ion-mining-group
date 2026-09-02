/* toSite() writes USABLE capacity, not the gross resource figure.
 *
 * WHAT WENT WRONG. site-sources.js set usable_kw: cand.powerPotentialKw -- the gross resource,
 * before the gas cap and before parasitic load -- into a field named usable_kw, while
 * site-capacity.js exists specifically to say those are different numbers.
 *
 * AND IT MOVED WHEN YOU SAVED. map-sourcing.js:301 prefers a saved usable_kw over usableKwFor(c),
 * so a candidate the map had been showing derated became the gross figure the moment it was saved
 * to the CRM, taking miner count, capital and every ranking with it. Saving a site should not
 * change its economics, and that is the assertion this file exists for.
 *
 * The magnitude is pinned here rather than described, because "a bit lower" is not a fact and
 * because a later edit that quietly reverted the derate would otherwise pass.
 */
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');

var pass = 0, fail = 0;
function ok(label, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + (detail === undefined ? '' : '\n        ' + detail)); }
}
function eq(label, a, b) { ok(label, a === b, 'got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); }

global.localStorage = {
    _s: {}, getItem: function (k) { return this._s[k] || null; },
    setItem: function (k, v) { this._s[k] = String(v); },
    removeItem: function (k) { delete this._s[k]; }, key: function () { return null; }, length: 0
};
global.SiteCapacity = require(path.join(ROOT, 'site-capacity.js'));
var SS = require(path.join(ROOT, 'site-sources.js'));
var SC = global.SiteCapacity;

/* Coastal Plains RDF, from data/landfills.json, and the site site-capacity.js already cites as
   the worked example: rated 6.67 MW, collects 1.927 mmscfd which is about 4.01 MW, and LMOP
   records it actually produced 3.38 MW. Here at its LMOP-published 5,000 kW rating. */
var COASTAL = {
    id: 'lmop-coastal', name: 'Coastal Plains RDF', energyType: 'landfill_gas',
    powerPotentialKw: 5000, lat: 27.7, lng: -97.4,
    sourceDetail: { lfgCollectedMmscfd: 1.927, capacityBasis: 'EPA rated MW capacity' }
};

console.log('\n=== the gross figure never reaches a field called usable ===');
var site = SS.toSite(COASTAL, {});
var expect = SC.usableCapacity(COASTAL).kw;
eq('toSite derates', site.usable_kw, expect);
ok('and that is well below the gross', site.usable_kw < COASTAL.powerPotentialKw,
   site.usable_kw + ' vs ' + COASTAL.powerPotentialKw);
// 1.927 mmscfd x 2.08 = 4,008 kW, which binds below the 5,000 rating; then 10% parasitic.
eq('by the gas cap and then parasitic load', site.usable_kw, 3607);
eq('a 1,393 kW plant that was never there', COASTAL.powerPotentialKw - site.usable_kw, 1393);
eq('the candidate itself is untouched', COASTAL.powerPotentialKw, 5000);
eq('nameplate stays null — the source knows the energy, not the equipment', site.nameplate_kw, null);

console.log('\n=== SAVING A SITE DOES NOT CHANGE ITS ECONOMICS ===');
/* The consequence that made this worth a commit of its own. map-sourcing.js:301-302 reads
     saved.usable_kw != null ? saved.usable_kw : usableKwFor(c)
   so whatever toSite() persists is what the map uses ever after. If the two disagree, the act of
   saving moves the number. */
var whatTheMapShows = SC.usableKwFor(COASTAL);
var whatSavingPersists = SS.toSite(COASTAL, {}).usable_kw;
eq('what the map shows before saving equals what saving persists',
   whatSavingPersists, whatTheMapShows);

console.log('\n=== an explicit override still wins ===');
/* site-capacity.js:50: "A USER-ENTERED usable_kw still wins over all of this. A measurement beats
   a model." The map's own metrics path passes usable_kw explicitly and must not be derated twice
   — 3,607 through the derate again would be 3,246. */
var overridden = SS.toSite(COASTAL, { usable_kw: 3607 });
eq('a supplied figure is taken as given, not derated a second time', overridden.usable_kw, 3607);
var measured = SS.toSite(COASTAL, { usable_kw: 4200 });
eq('including one above what the model would say', measured.usable_kw, 4200);

console.log('\n=== parasitic rate follows the energy type ===');
function kwFor(type, gross, extra) {
    var c = { id: 'x', name: 'x', energyType: type, powerPotentialKw: gross, lat: 0, lng: 0 };
    if (extra) c.sourceDetail = extra;
    return SS.toSite(c, {}).usable_kw;
}
eq('flare gas takes 7% — compression and cooling, no siloxane train', kwFor('flare_gas', 1000), 930);
eq('landfill gas takes 10% — blower, treatment, compression, cooling',
   kwFor('landfill_gas', 1000, { lfgCollectedMmscfd: 99 }), 900);
eq('anything else takes the 7% default', kwFor('curtailed_renewable', 2400), 2232);

console.log('\n=== missing capacity module reports missing, never the gross ===');
/* The guard matters more than it looks. Falling back to powerPotentialKw would reintroduce the
   exact wrong number behind something shaped like caution, and site-engine.js:12 already prefers
   a null: it refuses to price rather than ranking a site best on a figure it does not have. */
var saved = global.SiteCapacity;
delete global.SiteCapacity;
var blind = require(path.join(ROOT, 'site-sources.js')).toSite(COASTAL, {});
eq('usable_kw is null, not 5,000', blind.usable_kw, null);
global.SiteCapacity = saved;

console.log('\n=== the magnitude, across every candidate from every adapter ===');
/* Pinned so a later edit cannot quietly restore the gross. Recomputed here rather than read from
   a fixture, because the claim is about the CURRENT data and the current derate together. */
var raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'landfills.json'), 'utf8'));
var A = require(path.join(ROOT, 'source-landfill.js'));
var lf = [];
raw.projects.forEach(function (r) {
    try { var n = SS.normalize(A.adapter.normalize(r), 'lmop-landfill'); if (n) lf.push(n); }
    catch (e) { /* a row the adapter rejects was never a candidate */ }
});
// 2,757 after the coverage sweep (was 1,908): the WIP capacity fallback kept 849 rows the old
// builder dropped, and the inventory sweep added no-project landfills. The property under test
// (every row becomes a candidate) is unchanged; only the universe grew.
eq('every landfill row is a candidate', lf.length, 2757);
var moved = 0, up = 0, grossSum = 0, useSum = 0;
lf.forEach(function (c) {
    var u = SS.toSite(c, {}).usable_kw;
    if (u === null || c.powerPotentialKw === null) return;
    grossSum += c.powerPotentialKw; useSum += u;
    if (u < c.powerPotentialKw) moved++;
    if (u > c.powerPotentialKw) up++;
});
ok('nearly every landfill moves', moved >= 1900, String(moved));
eq('and not one moves UP — the derate can only take capacity away', up, 0);
var pct = Math.round((useSum - grossSum) / grossSum * 1000) / 10;
ok('the landfill fleet loses about a fifth of its capacity', pct <= -19 && pct >= -21, pct + '%');
ok('which is the gas cap, not just parasitic load — 10% would be half of it', pct < -12, pct + '%');

console.log('\n' + (fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                               : pass + ' passed, ' + fail + ' FAILED'));
process.exit(fail === 0 ? 0 : 1);
