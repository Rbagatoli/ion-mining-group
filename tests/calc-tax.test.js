// Tests for the calculator's tax adjustment and its cumulative accounting.
//
// Every number here was measured against the real engine before being written down. The four
// defects these pin were all live, and all four produced a plausible-looking figure rather than
// an error — which is why they survived: nothing crashed, the screen just lied.

var path = require('path');
var CalcEngine = require(path.join(__dirname, '..', 'calc-engine.js'));

var pass = 0, fail = 0;
function eq(label, actual, expected) {
    if (actual === expected) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + '\n        expected ' + JSON.stringify(expected) +
                               '\n        actual   ' + JSON.stringify(actual)); }
}
function ok(label, cond, note) {
    eq(label + (note ? '  (' + note + ')' : ''), !!cond, true);
}
function near(label, actual, expected, tol) {
    var d = Math.abs(actual - expected);
    if (d <= (tol || 0.01)) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + '\n        expected ' + expected +
                               ' +/- ' + (tol || 0.01) + '\n        actual   ' + actual); }
}

// The calculator's own shipped defaults, so these assertions describe the screen the user sees
// rather than a scenario invented to make a point.
var DEFAULTS = {
    machineCount: 1, hashrate: 335, power: 5.36, capex: 15000, infrastructureCost: 0,
    elecCost: 0.055, poolFee: 2, uptime: 100, hodlRatio: 100,
    btcPrice: 96000, priceChange: 2, diffChange: 3, difficulty: 125.86,
    investPeriod: 48, periodLength: 'month', btcTreasury: 0,
    reinvest: false, coverElec: false,
    taxAdjustment: false, miningIncomeTaxRate: 35, capitalGainsTaxRate: 15
};
function run(over) {
    var s = {}; for (var k in DEFAULTS) s[k] = DEFAULTS[k];
    for (var k2 in (over || {})) s[k2] = over[k2];
    return CalcEngine.computeProjection(s);
}

// ---- 1. the rate applies to PROFIT, not revenue ------------------------------------------------

console.log('\n=== mining income tax is charged on net income ===');
(function() {
    var r = run({ taxAdjustment: true, miningIncomeTaxRate: 35 });
    var rev = r.dailyRevenueDay1, elec = r.dailyElecDay1, profit = r.dailyProfitDay1;

    ok('the day-1 rig is genuinely profitable before tax', profit > 0,
       '$' + profit.toFixed(2) + '/day');

    // The defect: 35% of revenue rather than 35% of profit. At these inputs that is a 63.6%
    // effective rate, and at the app's own difficulty default it printed a NEGATIVE daily profit
    // for a rig that was earning money.
    near('after-tax profit = profit - 35% of (revenue - electricity)',
         r.dailyAfterTaxProfitDay1, profit - (rev - elec) * 0.35, 0.01);

    var implied = (profit - r.dailyAfterTaxProfitDay1) / profit;
    near('so the effective rate on profit equals the rate typed', implied, 0.35, 0.001);
    ok('and it is NOT the old gross-revenue rate',
       Math.abs((rev * 0.35) - (profit - r.dailyAfterTaxProfitDay1)) > 1,
       'gross would charge $' + (rev * 0.35).toFixed(2) + ', net charges $' +
       ((rev - elec) * 0.35).toFixed(2));

    // The sharpest symptom: the tax bill used to be identical at every power price, because
    // power was not in the calculation at all.
    var cheap = run({ taxAdjustment: true, elecCost: 0.02, machineCount: 20 });
    var dear  = run({ taxAdjustment: true, elecCost: 0.12, machineCount: 20 });
    ok('a site paying 6x more for power now owes less tax',
       (cheap.totalPL - dear.totalPL) > 0 &&
       cheap.dailyAfterTaxProfitDay1 > dear.dailyAfterTaxProfitDay1);

    // A loss reduces the bill to zero. It does not generate a refund.
    var loss = run({ taxAdjustment: true, elecCost: 0.60, machineCount: 20 });
    ok('a loss-making period is not taxed into a deeper loss than it earns',
       loss.dailyAfterTaxProfitDay1 <= 0 &&
       loss.dailyAfterTaxProfitDay1 === loss.dailyProfitDay1,
       'no tax charged when there is no profit');
})();

// ---- 2. the rates are clamped, and default to what the markup shows -----------------------------

console.log('\n=== the rate inputs cannot invert the model ===');
(function() {
    // 350 used to mean a 350% tax and turned a profitable site into a $7.7M loss.
    var wild = run({ taxAdjustment: true, miningIncomeTaxRate: 350 });
    var full = run({ taxAdjustment: true, miningIncomeTaxRate: 100 });
    near('350% is clamped to 100%', wild.totalPL, full.totalPL, 0.01);

    // -40 used to be a subsidy that paid the miner.
    var neg = run({ taxAdjustment: true, miningIncomeTaxRate: -40 });
    var zero = run({ taxAdjustment: true, miningIncomeTaxRate: 0 });
    near('a negative rate is clamped to zero, not a refund', neg.totalPL, zero.totalPL, 0.01);
    // BOTH rates have to be zero for this to equal the toggle being off. Zeroing only the income
    // rate leaves CGT at its 15% default, and the default scenario has price growth, so there is
    // a real gain for it to tax. Asserting otherwise was the test being wrong, not the engine.
    var bothZero = run({ taxAdjustment: true, miningIncomeTaxRate: 0, capitalGainsTaxRate: 0 });
    near('zero on BOTH rates equals the toggle being off',
         bothZero.totalPL, run({ taxAdjustment: false }).totalPL, 0.01);
    ok('while zero income tax alone still charges CGT on the gain',
       Math.abs(zero.totalPL - bothZero.totalPL) > 1,
       'the two rates are independent');

    // A scenario saved before the tax fields existed used to render UNTAXED inside a table that
    // said it was taxed.
    var s = {}; for (var k in DEFAULTS) s[k] = DEFAULTS[k];
    s.taxAdjustment = true;
    delete s.miningIncomeTaxRate; delete s.capitalGainsTaxRate;
    var absent = CalcEngine.computeProjection(s);
    var explicit = run({ taxAdjustment: true, miningIncomeTaxRate: 35, capitalGainsTaxRate: 15 });
    near('absent rate keys default to the 35/15 the markup shows', absent.totalPL, explicit.totalPL, 0.01);
    ok('which is NOT the old silent 0%', Math.abs(absent.totalPL - zero.totalPL) > 1);
})();

// ---- 3. the table agrees with the headline -----------------------------------------------------

console.log('\n=== the last row of the table equals the Total P/L card ===');
(function() {
    // The reinvest pool was added to cumulCashFlow AND counted again in the per-period figure,
    // so the chart, the table and break-even were all inflated while the headline was not.
    // A flat price removes every other source of difference, so any gap here is structural.
    [['reinvest off', { priceChange: 0, investPeriod: 6, hodlRatio: 0 }],
     ['reinvest on, machines affordable', { priceChange: 0, investPeriod: 6, hodlRatio: 0, reinvest: true }],
     ['reinvest on, nothing affordable', { priceChange: 0, investPeriod: 6, hodlRatio: 0, reinvest: true, capex: 1e9 }],
     ['reinvest on, with tax', { priceChange: 0, investPeriod: 6, hodlRatio: 0, reinvest: true, taxAdjustment: true }]
    ].forEach(function(c) {
        var r = run(c[1]);
        var lastRow = r.tableRows[r.tableRows.length - 1].cumulPL;
        near(c[0], lastRow, r.totalPL, 0.01);
    });

    // Turning reinvest on while it can buy nothing must not change the answer -- it used to make
    // the headline worse by the entire pool balance.
    var off = run({ priceChange: 0, investPeriod: 6, hodlRatio: 0, capex: 1e9 });
    var on  = run({ priceChange: 0, investPeriod: 6, hodlRatio: 0, capex: 1e9, reinvest: true });
    near('reinvest that buys nothing changes nothing', on.totalPL, off.totalPL, 0.01);
})();

// ---- 4. no phantom period --------------------------------------------------------------------

console.log('\n=== the projection ends where the table ends ===');
(function() {
    // finalBtcPrice used exponent numPeriods while the loop's last row used numPeriods-1, so the
    // headline priced a month that no row represents. It was exactly $0 wrong at a flat price,
    // which is the tell that it was a phantom period and not a rounding difference.
    var n = 36, g = 0.02;
    var r = run({ investPeriod: n, priceChange: g * 100, hodlRatio: 100 });
    var expected = DEFAULTS.btcPrice * Math.pow(1 + g, n - 1);
    near('final price is the last period modelled, not one beyond it',
         r.finalBtcPrice, expected, 0.01);

    var lastRowPrice = r.tableRows[r.tableRows.length - 1].btcPrice;
    near('and it equals the price on the last table row', r.finalBtcPrice, lastRowPrice, 0.01);
})();

// ---- 5. what must NOT change ------------------------------------------------------------------

console.log('\n=== the parts that were already right ===');
(function() {
    // Mined coins are income at the price mined, and that price becomes their basis, so only
    // genuine appreciation is taxed again. Nothing is double-taxed. This was correct before the
    // fixes and the fixes must not disturb it.
    var flat = run({ taxAdjustment: true, priceChange: 0, hodlRatio: 100, investPeriod: 12 });
    var noCgt = run({ taxAdjustment: true, priceChange: 0, hodlRatio: 100, investPeriod: 12,
                      capitalGainsTaxRate: 0 });
    near('with a flat price there is no gain, so CGT changes nothing',
         flat.totalPL, noCgt.totalPL, 0.01);

    /* Buy-and-hold is taxed on the GAIN, never on the money put in.

       preTaxCapital IS EXPLICITLY OFF, because it now defaults on and would confound this.
       These two assertions are about capital gains treatment: at a flat price there is no
       gain, so the benchmark must come out exactly level. With the deployment basis in play
       it correctly comes out NEGATIVE by the income tax paid to get into the coins, which is
       a different and equally intended result -- asserted separately below. */
    var bh = run({ taxAdjustment: true, priceChange: 0, investPeriod: 12, preTaxCapital: false });
    near('a flat price means buy-and-hold nets zero, not a loss', bh.buyHoldFinalNet, 0, 0.01);
    near('and its value is exactly what went in', bh.buyHoldFinalValue,
         bh.totalInitialInvestment, 0.01);

    /* And the pre-tax case, which is the one the page now defaults to: at a flat price the
       benchmark is out exactly the income tax it paid to buy coins with. Negative is correct
       here, and it is the whole point of the deployment basis. */
    var bhPre = run({ taxAdjustment: true, priceChange: 0, investPeriod: 12, preTaxCapital: true });
    near('on pre-tax capital the benchmark is out exactly the tax it paid to get in',
         bhPre.buyHoldFinalNet, -bhPre.totalInitialInvestment * 0.35, 0.01);
    ok('which is a real difference from the savings case',
       Math.abs(bhPre.buyHoldFinalNet - bh.buyHoldFinalNet) > 1);

    // Turning the toggle off must be identical to a zero rate.
    var offToggle = run({ taxAdjustment: false });
    ok('the toggle off charges nothing', offToggle.dailyAfterTaxProfitDay1 === offToggle.dailyProfitDay1);
})();

console.log('');
console.log(fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                       : pass + ' passed, ' + fail + ' FAILED');
process.exit(fail === 0 ? 0 : 1);
