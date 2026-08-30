// Byte-identical proof for the batch-spec refactor.
//
// Compares the FULL result object -- every headline, every series point, every table row --
// between the pre-refactor engine and the post-refactor one, over scenarios chosen to exercise
// every path that touches minerBatches: retirement, auto-replace, scheduled additions,
// reinvest purchases, and all three period lengths.
//
// JSON.stringify is the comparator on purpose: it catches a value that moved in its last bits,
// which is the specific risk when a scalar multiply becomes a sum.

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
    ['tax + treasury + growth', { taxAdjustment: true, miningIncomeTaxRate: 35, btcTreasury: 2.5,
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

var fail = 0;
SCENARIOS.forEach(function (c) {
    var s = {}; for (var k in BASE) s[k] = BASE[k];
    for (var j in c[1]) s[j] = c[1][j];
    var a = JSON.stringify(OLD.computeProjection(s));
    var b = JSON.stringify(NEW.computeProjection(s));
    if (a === b) {
        console.log('  ok    ' + c[0] + '   (' + a.length + ' chars identical)');
    } else {
        fail++;
        console.log('  FAIL  ' + c[0]);
        // Locate the first divergence so a drift is diagnosable rather than just red.
        for (var x = 0; x < Math.max(a.length, b.length); x++) {
            if (a[x] !== b[x]) {
                console.log('        first difference at char ' + x);
                console.log('        old: ...' + a.slice(Math.max(0, x - 70), x + 40));
                console.log('        new: ...' + b.slice(Math.max(0, x - 70), x + 40));
                break;
            }
        }
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
console.log(fail === 0 ? 'BYTE-IDENTICAL across ' + SCENARIOS.length + ' scenarios'
                       : fail + ' SCENARIO(S) DIVERGED');
process.exit(fail === 0 ? 0 : 1);
