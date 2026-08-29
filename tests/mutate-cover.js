/* Proves tests/calc-cover.test.js can fail.
 *
 * A suite of 61 assertions that passes is worth nothing until something has watched it go
 * red for the right reason. Each mutation below is a plausible way to get the sell-to-cover
 * logic wrong -- most of them produce a projection that still looks entirely reasonable on
 * screen, which is exactly why they need a guard rather than a reading.
 *
 * Rewrites calc-engine.js in place and restores it in a finally, so it is opt-in and never
 * part of a plain test run. An interrupted run would leave the tree modified; the restore
 * is the first thing written and the byte-for-byte check at the end is what confirms it.
 */
var fs = require('fs');
var path = require('path');
var { execFileSync } = require('child_process');

var ROOT = path.join(__dirname, '..');
var ENGINE = path.join(ROOT, 'calc-engine.js');
var TEST = path.join(__dirname, 'calc-cover.test.js');

var MUTATIONS = [
    ['the HODL ratio goes back to splitting GROSS production instead of the remainder',
     'btcHeld = btcAfterCosts * p.hodlPct;', 'btcHeld = periodBTCMined * p.hodlPct;'],

    ['the bill is taken off the top but never actually sold for',
     'btcSold = btcToCover + btcAfterCosts * (1 - p.hodlPct);',
     'btcSold = btcAfterCosts * (1 - p.hodlPct);'],

    ['coins go to the bill but the remainder is not debited, creating BTC out of nothing',
     'var btcAfterCosts = periodBTCMined - btcToCover;', 'var btcAfterCosts = periodBTCMined;'],

    ['the cover is no longer capped at production, so an uncoverable bill invents coins',
     'var btcToCover = Math.min(periodBTCMined,', 'var btcToCover = Math.min(Infinity,'],

    ['an absent coverElec key starts meaning ON, silently rewriting saved scenarios',
     'coverElec: !!s.coverElec,', 'coverElec: s.coverElec !== false,'],

    ['the tax bill is left uncovered, so it comes from outside capital again',
     '(periodElecCost + taxOnMiningIncome) / btcPrice);', '(periodElecCost) / btcPrice);'],

    ['the cover is priced at the opening price, not the price of the month it happened',
     '(periodElecCost + taxOnMiningIncome) / btcPrice);',
     '(periodElecCost + taxOnMiningIncome) / p.btcPrice0);'],

    ['savingsElec no longer wins, so power is paid twice',
     'if (p.coverElec && !p.savingsElec && btcPrice > 0) {', 'if (p.coverElec && btcPrice > 0) {'],

    ['the cash low-water mark is never updated, so peakCashDeficit only ever sees day one',
     'if (cashPosition < minCashPosition) minCashPosition = cashPosition;', ''],

    ['peakCashDeficit forgets the reinvest pool, double-counting cash the pool still holds',
     'var cashPosition = cumulCashFlow + reinvestPool;', 'var cashPosition = cumulCashFlow;'],
];

var original = fs.readFileSync(ENGINE, 'utf8');
var survived = [];

function runSuite() {
    try {
        execFileSync(process.execPath, [TEST], { stdio: 'pipe' });
        return null;                       // exit 0 -- the suite did not notice
    } catch (e) {
        var out = String(e.stdout || '');
        var m = out.match(/(\d+) passed, (\d+) FAILED/);
        return m ? m[2] + ' assertion(s) caught it' : 'suite errored';
    }
}

try {
    console.log('\n=== mutating calc-engine.js, ' + MUTATIONS.length + ' ways ===\n');
    MUTATIONS.forEach(function (m) {
        var label = m[0], find = m[1], replace = m[2];
        var n = original.split(find).length - 1;
        if (n !== 1) {
            /* The mutation did not apply, so the "pass" below would mean nothing. This is the
               failure mode the whole harness exists to avoid: a guard reporting green having
               checked nothing at all. */
            console.log('  BROKEN  ' + label + '\n          anchor matched ' + n +
                        ' times, expected 1 -- the mutation never applied');
            survived.push(label + ' (anchor drifted)');
            return;
        }
        fs.writeFileSync(ENGINE, original.replace(find, replace));
        var caught = runSuite();
        if (caught) console.log('  caught  ' + label + '\n          ' + caught);
        else { console.log('  SURVIVED  ' + label); survived.push(label); }
    });
} finally {
    fs.writeFileSync(ENGINE, original);
    var restored = fs.readFileSync(ENGINE, 'utf8') === original;
    console.log('\n  engine restored: ' + (restored ? 'yes' : 'NO -- RESTORE BY HAND'));
    if (!restored) process.exit(2);
}

/* The site copy is byte-compared against this one by calc-suite.js, so a mutation that
   escaped the restore would surface there too -- but only on the next full run. Check it
   here, where the damage would have been done. */
var siteCopy = fs.readFileSync(path.join(ROOT, 'site', 'calc-engine.js'), 'utf8');
console.log('  site copy still in parity: ' + (siteCopy === original ? 'yes' : 'NO'));

console.log('');
if (survived.length) {
    console.log(survived.length + ' MUTATION(S) SURVIVED — the suite does not cover them:');
    survived.forEach(function (s) { console.log('  - ' + s); });
    process.exit(1);
}
console.log('all ' + MUTATIONS.length + ' mutations caught');
