/* The detector for saved prospects holding a gross capacity figure.
 *
 * Ranked by which wrong answer costs most:
 *
 *   1. Recomputing a record a person actually typed. usable_kw has no provenance and
 *      site-capacity.js:50 says a measurement beats a model, so overwriting a typed figure with a
 *      derived one is unrecoverable — the measurement is simply gone. Every ambiguous case must
 *      land in `typed` and be left alone.
 *   2. A record that cannot be judged reported as clean. Prospect ids churn on catalog rebuilds
 *      (map-sourcing.js:4191), so unmatched is common; counting it as fine reads as "nothing to
 *      do here" when the truth is "this was not checked".
 *   3. Missing a machine-written record. Costly, but recoverable — it can be found on the next
 *      scan. This is the direction the detector is deliberately biased toward.
 *
 * Fixtures state every expectation independently: no expected value is read back from classify()
 * or from SiteCapacity, and every selection is given more than one candidate to choose between.
 */
var path = require('path');
var ROOT = path.join(__dirname, '..');

var pass = 0, fail = 0;
function ok(label, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + (detail === undefined ? '' : '\n        ' + detail)); }
}
function eq(label, a, b) { ok(label, a === b, 'got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); }

var _store = {};
global.localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null; },
    setItem: function (k, v) { _store[k] = String(v); },
    removeItem: function (k) { delete _store[k]; }, key: function () { return null; }, length: 0
};
global.crypto = require('crypto').webcrypto || require('crypto');
global.CrmConfig = require(path.join(ROOT, 'crm-config.js'));
global.CrmLog = require(path.join(ROOT, 'crm-log.js'));
global.SiteCapacity = require(path.join(ROOT, 'site-capacity.js'));
global.SiteData = require(path.join(ROOT, 'site-model.js'));
var CA = require(path.join(ROOT, 'capacity-audit.js'));
var SiteData = global.SiteData;

/* Coastal Plains RDF, the worked example site-capacity.js already cites. Rated 5,000 kW; collects
   1.927 mmscfd which is 4,008 kW of gas, so the gas binds; less 10% parasitic = 3,607 kW.
   Every one of those three numbers is written out here rather than computed, so the fixture
   states the answer instead of asking the code under test for it. */
var GROSS = 5000, USABLE = 3607;
function candidate(id, gross, mmscfd) {
    return { id: id, name: 'Coastal Plains RDF', energyType: 'landfill_gas',
             powerPotentialKw: gross === undefined ? GROSS : gross,
             sourceDetail: { lfgCollectedMmscfd: mmscfd === undefined ? 1.927 : mmscfd } };
}
function fresh() {
    _store = {};
    [global.CrmConfig, global.CrmLog].forEach(function (m) { if (m && m.reset) m.reset(); });
}
function save(id, usableKw, name) {
    return SiteData.add(SiteData.normalize({
        id: id, name: name || 'Coastal Plains RDF', energy_type: 'landfill_gas',
        usable_kw: usableKw }));
}

console.log('\n=== the arithmetic the whole detector rests on ===');
// Stated independently: if this drifts, every classification below is judged against the wrong bar.
eq('the gas binds below the rating and parasitic takes 10%',
   SiteCapacity.usableKwFor(candidate('c1')), USABLE);

console.log('\n=== four records, four different verdicts ===');
/* Given together rather than one at a time, because the detector's job is to tell them APART and
   a fixture with one record cannot show that it does. */
fresh();
save('c1', GROSS, 'saved by the old path');          // exactly the gross
save('c2', USABLE, 'already correct');               // exactly the derived
save('c3', 4100, 'someone measured it');             // neither
save('c4', null, 'nothing recorded');                // absent
save('c9', GROSS, 'no candidate for this one');      // gross, but unmatched
var scan = CA.scan({ candidates: [candidate('c1'), candidate('c2'), candidate('c3'), candidate('c4')] });

eq('every saved record is accounted for', scan.total, 5);
eq('and the buckets add up to it',
   scan.suspect.length + scan.typed.length + scan.current.length +
   scan.unmatched.length + scan.absent.length, 5);
eq('one is machine-written', scan.suspect.length, 1);
eq('and it is the one sitting on the gross', scan.suspect[0].id, 'c1');
eq('one is already correct', scan.current.length, 1);
eq('and it is not offered for correction',
   scan.suspect.filter(function (v) { return v.id === 'c2'; }).length, 0);
eq('one is somebody\'s own number', scan.typed.length, 1);
eq('and it is left alone', scan.typed[0].id, 'c3');
eq('one has no figure at all', scan.absent.length, 1);
eq('and one cannot be judged', scan.unmatched.length, 1);
eq('which is the one with no candidate', scan.unmatched[0].id, 'c9');

console.log('\n=== an unjudgeable record is NOT reported as clean ===');
/* Ids churn on every catalog rebuild, so this is the common case rather than the exotic one.
   Folding it into `current` would make a scan that checked nothing look like a clean bill. */
eq('unmatched is its own bucket, not current', scan.current.length, 1);
ok('and it says why it could not be judged',
   /not in the loaded catalog/.test(scan.unmatched[0].reason), scan.unmatched[0].reason);
ok('naming the id churn rather than implying data loss',
   /ids change when a catalog is rebuilt/.test(scan.unmatched[0].reason), scan.unmatched[0].reason);

console.log('\n=== what the flagged record actually claims ===');
var s = scan.suspect[0];
eq('the figure held', s.have, GROSS);
eq('what the gas supports', s.derived, USABLE);
eq('the overstatement', s.have - s.derived, 1393);
eq('reported as a delta toward the truth', s.delta, USABLE - GROSS);
eq('and as a percentage', s.delta_pct, -27.9);
eq('the scan totals the overstatement across every flagged record', scan.overstated_kw, 1393);
ok('and the reason argues from exact equality, not from a guess',
   /does not land exactly on it/.test(s.reason), s.reason);

console.log('\n=== exact, never near ===');
/* A tolerance would start absorbing typed figures that land close to the gross — and "close to
   the gross" is evidence of nothing. Landing on it EXACTLY is the entire argument. */
fresh();
save('n1', GROSS - 1, 'one kW below the gross');
save('n2', GROSS + 1, 'one kW above it');
var near = CA.scan({ candidates: [candidate('n1'), candidate('n2')] });
eq('a kW below the gross is not flagged', near.suspect.length, 0);
eq('both are treated as typed', near.typed.length, 2);

console.log('\n=== where the gross IS the usable figure, there is nothing to flag ===');
/* Eight of 30,517 candidates are in this state — the zero-capacity rows, where the derate has
   nothing to take. A saved record then sits on the gross AND on the derived figure at once, so
   the exact-equality signal fires while the record is in fact correct. `current` has to be tested
   before `suspect` or the detector would offer a no-op correction and present it as a fix. */
fresh();
save('z1', 0, 'zero capacity, gross and usable both zero');
var zero = { id: 'z1', name: 'x', energyType: 'landfill_gas', powerPotentialKw: 0,
             sourceDetail: { lfgCollectedMmscfd: 0 } };
eq('the fixture really is a case where the two figures coincide',
   SiteCapacity.usableKwFor(zero), 0);
var same = CA.scan({ candidates: [zero] });
eq('it is current, not suspect', same.current.length, 1);
eq('and nothing is offered for correction', same.suspect.length, 0);
eq('a zero capacity is a figure, not an absence', same.absent.length, 0);

console.log('\n=== recompute only touches a record that is still flagged ===');
fresh();
save('c1', GROSS, 'to be corrected');
var r = CA.recompute('c1', candidate('c1'), { by: 'R Bagatoli' });
ok('it corrects', r.ok, r.err);
eq('from the gross', r.from, GROSS);
eq('to what the gas supports', r.to, USABLE);
eq('and the record now holds it', SiteData.get('c1').usable_kw, USABLE);
/* A capacity figure that prices a build must not move without a trace. */
var logged = CrmLog.forProspect('c1', 'note');
ok('the change is logged', logged.length >= 1);
ok('with both figures in it', /5000 kW to 3607 kW/.test(logged[0].body), logged[0].body);
ok('and who applied it', /R Bagatoli/.test(logged[0].body), logged[0].body);

console.log('\n=== and refuses everything else ===');
var again = CA.recompute('c1', candidate('c1'));
eq('a second pass is refused — it is no longer flagged', again.ok, false);
eq('naming the state it is now in', again.verdict.state, 'current');
fresh();
save('t1', 4100, 'a typed figure');
var typed = CA.recompute('t1', candidate('t1'));
eq('a typed figure is never recomputed', typed.ok, false);
eq('and the record is untouched', SiteData.get('t1').usable_kw, 4100);
var missing = CA.recompute('t1', null);
eq('nor is one whose candidate cannot be found', missing.ok, false);
eq('still untouched', SiteData.get('t1').usable_kw, 4100);
eq('and an unknown prospect is refused', CA.recompute('nope', candidate('nope')).ok, false);

console.log('\n=== the verdict is re-taken at the moment of writing ===');
/* The panel is drawn once and acted on later. If the catalog reloads or the record is edited in
   between, a correction applied on the strength of the older judgement is the same class of
   error this module exists to find. */
fresh();
save('c1', GROSS, 'flagged when the panel was drawn');
var stale = CA.classify(SiteData.get('c1'), candidate('c1'));
eq('flagged at draw time', stale.state, 'suspect');
SiteData.update('c1', { usable_kw: 4444 });          // someone typed a figure meanwhile
var late = CA.recompute('c1', candidate('c1'));
eq('the correction is refused on the current state, not the drawn one', late.ok, false);
eq('and what they typed survives', SiteData.get('c1').usable_kw, 4444);

console.log('\n=== worst first, so the biggest overstatement is read first ===');
fresh();
save('b1', 1000, 'small');
save('b2', 5000, 'large');
save('b3', 2000, 'middling');
var many = CA.scan({ candidates: [
    candidate('b1', 1000, 0.1),      // gas binds hard
    candidate('b2', 5000, 0.1),
    candidate('b3', 2000, 0.1)
] });
eq('all three are flagged', many.suspect.length, 3);
eq('the largest overstatement first', many.suspect[0].id, 'b2');
eq('then the next', many.suspect[1].id, 'b3');
eq('then the smallest', many.suspect[2].id, 'b1');

console.log('\n' + (fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                               : pass + ' passed, ' + fail + ' FAILED'));
process.exit(fail === 0 ? 0 : 1);
