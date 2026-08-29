/* Proves tests/calc-cover.test.js can fail.
 *
 * A suite of 36 assertions that passes is worth nothing until something has watched it go
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
    ['the fleet you still own goes back to being worth nothing, the 48-to-49 cliff',
     'var totalPL = cumulCashFlow + reinvestPool + heldBtcValue - cgtOnHeld + residualFleetValue;',
     'var totalPL = cumulCashFlow + reinvestPool + heldBtcValue - cgtOnHeld;'],

    ['the fleet depreciates to zero instead of to its salvage value',
     'v += fBatch.count * p.capex * (p.salvagePct + (1 - p.salvagePct) * lifeLeft);',
     'v += fBatch.count * p.capex * lifeLeft;'],

    ['depreciation runs backwards, so a new fleet is worth salvage and an old one capex',
     '(lifespanPeriods - (periodIdx - fBatch.period)) / lifespanPeriods;',
     '(periodIdx - fBatch.period) / lifespanPeriods;'],

    ['the per-period fleet value is read at day one, so the table stops ageing the kit',
     'var totalEconomicValue = liquidValue + fleetValueAt(i);',
     'var totalEconomicValue = liquidValue + fleetValueAt(0);'],

    ['break-even starts counting book value, so every scenario pays back in period 1',
     'if (breakEvenPeriod === null && liquidValue >= 0) breakEvenPeriod = i + 1;',
     'if (breakEvenPeriod === null && totalEconomicValue >= 0) breakEvenPeriod = i + 1;'],

    ['transaction fees stop being paid, understating every projection',
     'var dailyBTCGross = (currentHashrateH * SECONDS_PER_DAY * blockReward *',
     'var dailyBTCGross = (currentHashrateH * SECONDS_PER_DAY * blockReward * 0 +'],

    ['the fee share is left unclamped, so a typo can double a five-year projection',
     'txFeePct: clamp(num(s.txFee, 2) / 100, 0, 1),',
     'txFeePct: num(s.txFee, 2) / 100,'],

    ['a cover-sale is forced back in, emptying the treasury of an underwater site',
     'var btcSold = periodBTCMined * (1 - p.hodlPct);',
     'var btcSold = Math.min(periodBTCMined, Math.max(periodBTCMined * (1 - p.hodlPct), periodElecCost / btcPrice));'],

    ['the cash low-water mark is never updated, so peakCashDeficit only sees day one',
     'if (cashPosition < minCashPosition) minCashPosition = cashPosition;', ''],

    ['peakCashDeficit forgets the reinvest pool, double-counting cash the pool holds',
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
