// Byte-identical proof for the batch-spec refactor.
//
// Compares the FULL result object -- every headline, every series point, every table row --
// between the pre-refactor engine and the post-refactor one, over scenarios chosen to exercise
// every path that touches minerBatches: retirement, auto-replace, scheduled additions,
// reinvest purchases, and all three period lengths.
//
// JSON.stringify is the comparator on purpose: it catches a value that moved in its last bits,
// which is the specific risk when a scalar multiply becomes a sum.
//
// THE GUARANTEE IS ADDITIVE-ONLY, not literally "the same JSON". The replacement feature adds
// fields to params and to every table row, so the raw strings must differ -- params is an echo
// of the normalised inputs and by definition grows when inputs do. What must NOT happen is any
// pre-existing value changing. So this asserts three things separately:
//
//   1. everything outside params and outside the new row fields is byte-identical
//   2. every params key that existed before holds an identical value, and none was removed
//   3. the keys that appeared are EXACTLY the expected additive set -- an unexpected new key
//      is a failure, because it means something was added without being declared here
//
// Point 3 is what stops this degrading into "ignore anything new", which would let a renamed
// field pass as an addition plus a deletion.

var OLD = require(require('path').join(__dirname, 'fixtures-calc-engine-prebatch.js'));
var NEW = require(require('path').join(__dirname, '..', 'calc-engine.js'));

var SCENARIOS = [
    ['shipped defaults', {}],
    ['real fleet, 60mo', { hashrate: 395, power: 5.925, capex: 4500, machineCount: 100,
                           elecCost: 0.06, investPeriod: 60, minerLifespan: 60 }],
    // retirement with no replacement -- batches go to count 0 and must stay excluded
    ['retire, no replace', { minerLifespan: 12, investPeriod: 36, autoReplace: false, salvageValue: 20 }],
    // retirement WITH replacement -- new batches, staggered ages
    ['retire + auto-replace', { minerLifespan: 12, investPeriod: 40, autoReplace: true, salvageValue: 20 }],
    // additions: many cohorts of different ages, fractional accumulation
    ['additions 3/mo', { minerAdditions: 3, investPeriod: 48, minerLifespan: 24, autoReplace: false }],
    ['additions + replace', { minerAdditions: 5, investPeriod: 60, minerLifespan: 18, autoReplace: true }],
    // fractional additions per period -- weekly forces additionsPerPeriod < 1
    ['weekly + additions', { periodLength: 'weekly', investPeriod: 200, minerAdditions: 2,
                             minerLifespan: 24, autoReplace: true }],
    ['daily long horizon', { periodLength: 'daily', investPeriod: 500, minerLifespan: 12,
                             autoReplace: true, minerAdditions: 1 }],
    // reinvest: batches pushed mid-period, must not produce until the next one
    ['reinvest, hodl 0', { reinvest: true, hodlRatio: 0, investPeriod: 60, capex: 3010 }],
    ['reinvest + additions + replace', { reinvest: true, hodlRatio: 0, minerAdditions: 2,
                                         minerLifespan: 24, autoReplace: true, investPeriod: 72 }],
    // non-terminating binary specs, the float-drift case
    ['awkward specs', { hashrate: 333.33, power: 3.645, capex: 3010.77, machineCount: 137,
                        minerLifespan: 13, autoReplace: true, minerAdditions: 7, investPeriod: 61 }],
    // degenerate: zero must stay zero
    ['zeros', { hashrate: 0, power: 0, capex: 0, machineCount: 1, elecCost: 0, uptime: 0,
                investPeriod: 12 }],
    ['one machine, one period', { machineCount: 1, investPeriod: 1 }],
    /* preTaxCapital IS PINNED FALSE HERE, and that is not a dodge.
       This baseline predates the deployment basis, when preTaxCapital defaulted off. It now
       defaults ON whenever the tax model is on, which deliberately changes what the benchmark
       is funded with -- $301,000 to $195,650 on this scenario. That is the approved change,
       not a regression, so asserting it against a pre-change baseline would be asserting the
       feature does nothing.
       What this gate is for is the OTHER path: that everything unrelated to the deployment
       basis still computes identically. So it pins the savings case, which genuinely should
       not have moved, and the pre-tax case is covered by calc-deployment-basis.test.js
       against hand-derived figures rather than against a stale engine. */
    ['tax + treasury + growth (savings basis)',
     { taxAdjustment: true, miningIncomeTaxRate: 35, btcTreasury: 2.5, preTaxCapital: false,
       minerAdditions: 4, autoReplace: true, minerLifespan: 30,
       investPeriod: 66, salvageValue: 12 }],
];

var BASE = {
    btcPrice: 72684, priceChange: 2, difficulty: 127.48, diffChange: 2,
    periodLength: 'monthly', investPeriod: 60, hashrate: 270, power: 3.645,
    capex: 3010, machineCount: 100, minerLifespan: 48, salvageValue: 10,
    autoReplace: true, additionCapex: true, elecCost: 0.04, poolFee: 2.5,
    uptime: 98, hodlRatio: 100, minerAdditions: 0, btcTreasury: 0,
    infrastructureCost: 0, reinvest: false, coverElec: false, taxAdjustment: false,
    startDate: '2026-08-29',
};

/* Declared, not inferred. Adding a field to the engine means adding it here, which is the
   point: an undeclared new key fails rather than being waved through. */
var ADDED_PARAM_KEYS = ['replacementEnabled', 'replacementHashrateTH', 'replacementPowerKW',
                        'replacementCapex', 'replacementSizing', 'additionalReplacementCapital',
                        'siteKw', 'infraDepreciationEligiblePct'];
var ADDED_ROW_KEYS = ['hashpricePerTHDay',
                      'salvageCredited', 'replacementSpend', 'replacementNetOutlay',
                      'replacementClamped', 'fleetHashrateTH', 'fleetPowerKW',
                      'boughtReplacementSpec'];
/* Top-level result keys the replacement feature publishes. Declared for the same reason as
   the others: this list failing is how an undeclared addition announces itself. It already
   caught the guard-rail fields being added without being listed here. */
var ADDED_RESULT_KEYS = ['replacementOriginalJTH', 'replacementNewJTH',
                         'replacementOriginalUsdPerTH', 'replacementNewUsdPerTH',
                         'replacementEfficiencyAnnualPct', 'difficultyAnnualPct',
                         'rule1Violated', 'rule2Violated', 'replacementWasClamped',
                         'deductibleBasis', 'taxShieldValue', 'deploymentRatio',
                         'exceedsExcessBusinessLoss', 'excessBusinessLossThreshold'];

function stripAdded(r) {
    var out = {}, k;
    for (k in r) {
        if (k !== 'params' && k !== 'tableRows' && ADDED_RESULT_KEYS.indexOf(k) < 0) out[k] = r[k];
    }
    out.tableRows = (r.tableRows || []).map(function (row) {
        var t = {};
        for (var rk in row) { if (ADDED_ROW_KEYS.indexOf(rk) < 0) t[rk] = row[rk]; }
        return t;
    });
    return out;
}

var fail = 0;
SCENARIOS.forEach(function (c) {
    var s = {}; for (var k in BASE) s[k] = BASE[k];
    for (var j in c[1]) s[j] = c[1][j];
    var ro = OLD.computeProjection(s), rn = NEW.computeProjection(s);

    var a = JSON.stringify(stripAdded(ro));
    var b = JSON.stringify(stripAdded(rn));
    var problems = [];

    if (a !== b) {
        for (var x = 0; x < Math.max(a.length, b.length); x++) {
            if (a[x] !== b[x]) {
                problems.push('value changed at char ' + x +
                              '\n        old: ...' + a.slice(Math.max(0, x - 70), x + 40) +
                              '\n        new: ...' + b.slice(Math.max(0, x - 70), x + 40));
                break;
            }
        }
    }

    var ka = Object.keys(ro.params), kb = Object.keys(rn.params);
    var removed = ka.filter(function (k2) { return kb.indexOf(k2) < 0; });
    if (removed.length) problems.push('params keys REMOVED: ' + removed.join(', '));
    var moved = ka.filter(function (k2) {
        return kb.indexOf(k2) >= 0 &&
               JSON.stringify(ro.params[k2]) !== JSON.stringify(rn.params[k2]);
    });
    if (moved.length) problems.push('pre-existing params CHANGED: ' + moved.join(', '));
    var rka = Object.keys(ro), rkb = Object.keys(rn);
    var addedResult = rkb.filter(function (k2) { return rka.indexOf(k2) < 0; });
    var undeclaredResult = addedResult.filter(function (k2) { return ADDED_RESULT_KEYS.indexOf(k2) < 0; });
    if (undeclaredResult.length) problems.push('undeclared new result keys: ' + undeclaredResult.join(', '));
    var removedResult = rka.filter(function (k2) { return rkb.indexOf(k2) < 0; });
    if (removedResult.length) problems.push('result keys REMOVED: ' + removedResult.join(', '));

    var added = kb.filter(function (k2) { return ka.indexOf(k2) < 0; });
    var undeclared = added.filter(function (k2) { return ADDED_PARAM_KEYS.indexOf(k2) < 0; });
    if (undeclared.length) problems.push('undeclared new params keys: ' + undeclared.join(', '));

    if (!problems.length) {
        console.log('  ok    ' + c[0] + '   (' + a.length + ' chars identical, ' +
                    added.length + ' declared additions)');
    } else {
        fail++;
        console.log('  FAIL  ' + c[0]);
        problems.forEach(function (m) { console.log('        ' + m); });
    }
});

/* The cohort paths above are only exercised if these scenarios actually retire, replace, add
   and buy. A silent zero would make every comparison pass against nothing. */
console.log('');
var probe = {}; for (var k2 in BASE) probe[k2] = BASE[k2];
probe.minerAdditions = 3; probe.minerLifespan = 18; probe.autoReplace = true;
probe.reinvest = true; probe.hodlRatio = 0; probe.investPeriod = 60;
var pr = NEW.computeProjection(probe);
console.log('  coverage: retired ' + pr.totalMinersRetired + ', scheduled ' + pr.totalScheduledAdded +
            ', reinvest-bought ' + pr.totalMachinesBought);
if (!(pr.totalMinersRetired > 0 && pr.totalScheduledAdded > 0 && pr.totalMachinesBought > 0)) {
    console.log('  FAIL  a cohort path never fired, so the comparison proves less than it looks');
    fail++;
}

console.log('');
console.log(fail === 0 ? 'UNCHANGED (additive-only) across ' + SCENARIOS.length + ' scenarios'
                       : fail + ' SCENARIO(S) DIVERGED');
process.exit(fail === 0 ? 0 : 1);
