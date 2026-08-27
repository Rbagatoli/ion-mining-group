// site-capacity.js came out of map-sourcing.js verbatim. This proves it.
//
// The claim being tested is narrow and total: for every candidate the app can produce, the moved
// function returns exactly what the original returned. Not "close", not "for a sample" -- the
// same digest over all 30,517 rows from all four adapters.
//
// The baseline in tests/fixtures/ was generated BEFORE the move, by lifting the function's source
// text out of map-sourcing.js and evaluating it. That is what makes it worth anything: it is the
// behaviour of the code as it actually stood, not a reimplementation of what it was believed to
// do. Regenerating it from site-capacity.js would make this test a tautology, so don't.

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
    path.join(__dirname, 'fixtures', 'usable-capacity-baseline.json'), 'utf8'));

// SiteCatalog.load() fetches a relative URL. Same shim the baseline generator used, so the flare
// candidates here are the real rows through the real row mapper.
global.fetch = function (url) {
    var file = path.join(ROOT, String(url).replace(/^\.\//, ''));
    var exists = fs.existsSync(file);
    return Promise.resolve({
        ok: exists, status: exists ? 200 : 404,
        json: function () { return Promise.resolve(JSON.parse(fs.readFileSync(file, 'utf8'))); }
    });
};
global.localStorage = {
    _s: {}, getItem: function (k) { return this._s[k] || null; },
    setItem: function (k, v) { this._s[k] = String(v); },
    removeItem: function (k) { delete this._s[k]; }, key: function () { return null; }, length: 0
};
global.SiteSources = require(path.join(ROOT, 'site-sources.js'));
global.SiteCatalog = require(path.join(ROOT, 'site-catalog.js'));
var SS = global.SiteSources;
var SC = require(path.join(ROOT, 'site-capacity.js'));

console.log('\n=== the constants came across unchanged ===');
eq('landfill parasitic', SC.PARASITIC.landfill_gas, BASE.constants.PARASITIC.landfill_gas);
eq('flare parasitic', SC.PARASITIC.flare_gas, BASE.constants.PARASITIC.flare_gas);
eq('the default', SC.PARASITIC._default, BASE.constants.PARASITIC._default);
eq('MW per mmscfd', SC.LFG_MW_PER_MMSCFD, BASE.constants.LFG_MW_PER_MMSCFD);

(async function () {
    var cands = [];
    function feed(adapterFile, dataFile, listKey, sourceId) {
        var A = require(path.join(ROOT, adapterFile));
        var raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', dataFile), 'utf8'));
        (raw[listKey] || []).forEach(function (r) {
            try {
                var n = SS.normalize(A.adapter.normalize(r), sourceId);
                if (n) cands.push(n);
            } catch (e) { /* a row the adapter rejects was never a candidate */ }
        });
    }
    feed('source-landfill.js',    'landfills.json',    'projects',   'lmop-landfill');
    feed('source-landfill-ca.js', 'landfills-ca.json', 'prospects',  'eccc-landfill-ca');
    feed('source-facility.js',    'facilities.json',   'facilities', 'eia-facility');
    var loaded = await global.SiteCatalog.load();
    loaded.candidates.forEach(function (c) {
        var n = SS.normalize(c, 'flare-viirs');
        if (n) cands.push(n);
    });

    console.log('\n=== every candidate, not a sample ===');
    // The count is asserted before the digest. A feed that silently produced half the candidates
    // would still hash to something, and a digest of the wrong set proves nothing.
    eq('the candidate set is the same size as when the baseline was cut',
       cands.length, BASE.candidates);

    var byId = {};
    cands.forEach(function (c) { byId[c.id] = c; });

    /* THE BRANCH SAMPLES, MATCHED ON THE WHOLE ROW RATHER THAN BY ID.

       A by-id lookup was the obvious way to write this and it is wrong here: 30 LMOP ids are
       duplicated across 1,908 rows, so byId[] resolves to whichever row was inserted last and
       the sample compared against a different landfill than the one it was cut from. That is
       the same id collision that made the project record mint its own key rather than reuse
       prospect_id, showing up in a second place.

       The expected row is rebuilt from the baseline's own recorded output, so it still comes
       entirely from the pre-move behaviour and nothing is regenerated from the moved code. */
    function rowOf(id, u) {
        return id + '|' + u.kw + '|' + u.grossUsedKw + '|' + u.parasiticPct + '|' +
               u.gasSupportedKw + '|' + u.gasCapped + '|' + u.basis + '|' + u.gross;
    }
    var rows = cands.map(function (c) { return rowOf(c.id, SC.usableCapacity(c)); }).sort();
    var rowSet = Object.create(null);
    rows.forEach(function (r) { rowSet[r] = true; });

    var missingRows = BASE.samples.filter(function (s2) { return !rowSet[rowOf(s2.id, s2.out)]; });
    ok('every sampled branch still appears, byte for byte',
       missingRows.length === 0,
       missingRows.map(function (s2) { return rowOf(s2.id, s2.out); }).join(' | '));
    /* THREE BRANCHES, NOT FOUR. The baseline tried to sample a fourth -- a candidate whose gross
       is null -- and found none in all 30,517: every adapter either supplies a capacity or drops
       the row. So that branch is unreachable from real data and is asserted directly below
       rather than pretended to be covered by a sample that does not exist. */
    ok('the samples covered every branch real data reaches',
       BASE.samples.some(function (s2) { return s2.out.gasCapped === true; }) &&
       BASE.samples.some(function (s2) { return s2.out.gasSupportedKw !== null && !s2.out.gasCapped; }) &&
       BASE.samples.some(function (s2) { return s2.out.kw !== null && s2.out.gasSupportedKw === null; }));
    eq('and no real candidate reaches the null-gross branch',
       BASE.samples.filter(function (s2) { return s2.out.kw === null; }).length, 0);

    /* The unreachable branch, exercised directly. It is the guard that stops a missing capacity
       being reported as 0 kW, which would read as "this site produces nothing" rather than
       "nobody published a number". */
    var noGross = SC.usableCapacity({ energyType: 'landfill_gas', powerPotentialKw: null });
    eq('a null gross yields a null usable, not a zero', noGross.kw, null);
    eq('and says so in the basis rather than inventing one', noGross.basis, null);
    eq('no candidate at all is null too', SC.usableCapacity(null).kw, null);


    var digest = crypto.createHash('sha256').update(rows.join('\n')).digest('hex');

    ok('THE DIGEST OVER ALL ' + cands.length + ' CANDIDATES IS UNCHANGED',
       digest === BASE.digest,
       'baseline ' + BASE.digest + '\n        now      ' + digest);

    console.log('\n=== map-sourcing.js no longer holds a second copy ===');
    /* The failure mode a pure move invites: the block is copied out and the original left in
       place, so two definitions drift. The delegating aliases must be all that remains. */
    var MS = fs.readFileSync(path.join(ROOT, 'map-sourcing.js'), 'utf8');
    ok('the parasitic table is defined once, in site-capacity.js',
       !/var PARASITIC = \{/.test(MS));
    ok('and the conversion constant likewise',
       !/var LFG_MW_PER_MMSCFD = [\d.]/.test(MS));
    ok('map-sourcing.js reaches the module rather than reimplementing it',
       /SiteCapacity\.usableCapacity/.test(MS));
    ok('site-capacity.js is loaded before map-sourcing.js on the map page',
       (function () {
           var html = fs.readFileSync(path.join(ROOT, 'map.html'), 'utf8');
           /* Matched on the SCRIPT TAG, not the bare filename. map.html mentions
              map-sourcing.js in two comments long before it loads it, so indexOf on the name
              alone compared a prose reference at line 499 against a script tag at 1474 and
              reported the order backwards. */
           var cap = html.indexOf('src="./site-capacity.js');
           var ms = html.indexOf('src="./map-sourcing.js');
           return cap >= 0 && ms >= 0 && cap < ms;
       })());

    console.log('\n' + (fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                                   : pass + ' passed, ' + fail + ' FAILED'));
    process.exit(fail === 0 ? 0 : 1);
})();
