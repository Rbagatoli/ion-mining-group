// What the fleet is worth, what the plan costs in cash, and what the blocks actually pay.
//
// WHAT THIS FILE IS NOW. It started as tests for a "sell to cover power" settlement mode --
// the default selling the minimum BTC needed to meet each period's bill. That was reverted,
// and the reasoning is preserved in calc-engine.js where the settlement lives: forcing a
// cover-sale makes the projection take a treasury decision on the operator's behalf, and it
// takes the worst one available. On a site under water on power it sold every coin it mined,
// at the price of the month it mined them, chasing a bill it could never meet -- at $0.12/kWh
// that emptied a 10.09 BTC treasury and turned a $90,653 loss into $1,086,017. Real operators
// curtail, or fund opex from elsewhere and keep the coins.
//
// The HODL slider governs sales, electricity is charged as the cost it is, and the honest
// caveat the switch was reaching for is REPORTED rather than modelled: peakCashDeficit says
// how much cash the plan needs from outside, which at HODL 100 is capex plus every bill.
//
// What survived, and what these pin:
//   - residualFleetValue, because machines still standing at the horizon are worth something
//   - peakCashDeficit, because totalPL cannot answer where the money came from
//   - transaction fees, which the engine did not model at all
//
// Expected values are derived from the INPUTS by hand -- period electricity is rebuilt from
// kW x hours x rate, never read back from tableRows -- because a figure the engine supplied
// cannot disagree with the engine about anything.

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
    if (Math.abs(actual - expected) <= tol) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + '\n        expected ' + expected +
                               ' +/- ' + tol + '\n        actual   ' + actual); }
}

var DAYS_PER_MONTH = 30.44;

var BASE = {
    machineCount: 100, hashrate: 270, power: 3.645, capex: 3010, infrastructureCost: 0,
    elecCost: 0.04, txFee: 0, poolFee: 2.5, uptime: 98, hodlRatio: 100,
    btcPrice: 72684, priceChange: 2, diffChange: 2, difficulty: 127.48,
    investPeriod: 36, periodLength: 'monthly', btcTreasury: 0, minerLifespan: 48,
    salvageValue: 10, minerAdditions: 0, autoReplace: false, reinvest: false,
    savingsElec: false, taxAdjustment: false,
    miningIncomeTaxRate: 35, capitalGainsTaxRate: 15,
    startDate: '2026-08-29'
};
function run(over) {
    var s = {}; for (var k in BASE) s[k] = BASE[k];
    for (var k2 in (over || {})) s[k2] = over[k2];
    return CalcEngine.computeProjection(s);
}
function monthlyBill(s) {
    s = s || BASE;
    return s.power * s.machineCount * 24 * DAYS_PER_MONTH * s.elecCost * (s.uptime / 100);
}

// ---- 1. the slider governs sales, and nothing else does -------------------------------------

console.log('\n=== the HODL ratio decides what is sold; the bill is charged either way ===');
(function () {
    var r = run();
    eq('at HODL 100 nothing is sold', r.cumulBtcSold, 0);
    near('so every coin mined is held', r.cumulBtcHeld, r.cumulBtcMined, 1e-9);
    near('and each month is short by exactly the power bill',
         -r.tableRows[0].netCashFlow, monthlyBill(), 0.01);

    /* THE REGRESSION THIS EXISTS FOR. A cover-sale was briefly forced here. It is the worst
       available treasury decision on a site that cannot pay its bill, and it must not come
       back silently: on an underwater site it liquidates the whole stack at early prices. */
    var under = run({ elecCost: 0.20 });
    near('an underwater site still holds every coin rather than liquidating to chase the bill',
         under.cumulBtcHeld, under.cumulBtcMined, 1e-9);
    eq('and sells nothing at HODL 100', under.cumulBtcSold, 0);

    [0, 25, 50, 75, 100].forEach(function (h) {
        var x = run({ hodlRatio: h });
        near('HODL ' + h + ': month 1 holds exactly ' + h + '% of GROSS production',
             x.tableRows[0].btcHeld, x.tableRows[0].pnlBtc * (h / 100), 1e-9);
    });
})();

// ---- 2. the machines you still own ------------------------------------------------------------
//
// totalPL counted the BTC held at the end and every dollar spent, but not the FLEET held at
// the end, so a horizon stopping partway through a fleet's life wrote off whatever was left.
// The tell was a cliff nobody would look for: extending 48 -> 49 months made Total P/L FALL,
// because month 49 buys a replacement fleet and the model booked it as a pure loss.

console.log('\n=== the fleet still standing at the horizon is worth something ===');
(function () {
    var L = BASE.minerLifespan, C = BASE.capex, N = BASE.machineCount, sv = BASE.salvageValue / 100;

    var one = run({ investPeriod: 1 });
    near('a brand-new fleet is worth its capex', one.residualFleetValue, C * N, 0.01);

    [12, 24, 36].forEach(function (n) {
        var r = run({ investPeriod: n });
        var expect = N * C * (sv + (1 - sv) * (L - (n - 1)) / L);
        near('at ' + n + ' months the fleet is worth its straight-line value',
             r.residualFleetValue, expect, 0.01);
    });

    /* A machine retires the instant it reaches lifespan, so no period shows one still owned AT
       salvage. What must hold is continuity: the residual the period before retirement and the
       salvage cash retirement pays differ by one period of depreciation and nothing more. */
    var justBefore = run({ investPeriod: L, autoReplace: false });
    var onePeriod = N * C * (1 - sv) / L;
    near('the period before retirement it is worth salvage plus one period of life',
         justBefore.residualFleetValue, N * C * sv + onePeriod, 1.0);
    var atLife = run({ investPeriod: L + 1, autoReplace: false });
    near('and once retired it is worth nothing, its salvage having gone to cash',
         atLife.residualFleetValue, 0, 0.01);

    /* THE CLIFF. Buying a replacement fleet must not make the projection worse. */
    var before = run({ investPeriod: 48, autoReplace: true });
    var after = run({ investPeriod: 49, autoReplace: true });
    ok('extending the horizon past a fleet replacement does not destroy value',
       after.totalPL > before.totalPL,
       '48mo ' + Math.round(before.totalPL) + ' -> 49mo ' + Math.round(after.totalPL));

    /* The card equals the bottom of its own table, at every horizon. */
    [24, 49, 60, 72].forEach(function (n) {
        var r = run({ investPeriod: n, autoReplace: true });
        near('at ' + n + ' months the headline equals the last row of the table',
             r.totalPL, r.tableRows[r.tableRows.length - 1].cumulPL, 0.01);
    });

    /* Break-even deliberately does NOT use it: day one you have spent the capex and own the
       capex, so counting book value would read period 1 for every scenario ever run. */
    ok('break-even still measures cash and coin, not book value',
       run({ investPeriod: 60, autoReplace: true }).breakEvenPeriod > 1);
})();

// ---- 3. transaction fees ------------------------------------------------------------------------

console.log('\n=== blocks pay the subsidy plus the fees in them ===');
(function () {
    var none = run({ txFee: 0 });
    var some = run({ txFee: 5 });

    near('a 5% fee share mines exactly 5% more BTC',
         some.cumulBtcMined, none.cumulBtcMined * 1.05, 1e-9);
    near('and lifts day-one revenue by the same 5%',
         some.dailyRevenueDay1, none.dailyRevenueDay1 * 1.05, 0.01);
    near('while power is untouched, because fees are revenue and not a cost',
         some.dailyElecDay1, none.dailyElecDay1, 1e-9);
    ok('so the projection is better with fees than without', some.totalPL > none.totalPL);

    /* Clamped: a negative fee is not a thing, and a sustained average above the subsidy has
       never happened -- letting one be typed would quietly double a five-year projection. */
    eq('a negative fee is clamped to zero',
       CalcEngine.normalise({ txFee: -20 }).txFeePct, 0);
    eq('and an absurd one is clamped to the subsidy',
       CalcEngine.normalise({ txFee: 900 }).txFeePct, 1);
})();

// ---- 4. cash required from outside ---------------------------------------------------------------
//
// peakCashDeficit answers "where does the money come from", which totalPL structurally cannot:
// totalPL adds heldBtcValue and residualFleetValue, so a plan funded entirely out of pocket
// reports a profit while its bank account is empty. This is the honest caveat the reverted
// settlement switch was reaching for, reported instead of modelled.

console.log('\n=== cash required from outside ===');
(function () {
    var months = BASE.investPeriod;

    var d = run();
    near('at HODL 100 the plan needs capex plus every bill in the horizon',
         d.peakCashDeficit, BASE.capex * BASE.machineCount + monthlyBill() * months, 0.5);
    near('and externalOpexFunded is exactly the power',
         d.externalOpexFunded, monthlyBill() * months, 0.5);
    ok('which is far more than the up-front figure the page shows',
       d.peakCashDeficit > d.totalInitialInvestment * 2,
       '$' + Math.round(d.peakCashDeficit) + ' against $' + Math.round(d.totalInitialInvestment));

    // Selling everything funds the bill out of production, so nothing extra is needed.
    var sell = run({ hodlRatio: 0 });
    eq('selling all production needs nothing beyond day one',
       Math.round(sell.peakCashDeficit), Math.round(sell.totalInitialInvestment));

    ok('cash required is never less than the day-one investment, whatever the settings',
       [{}, { savingsElec: true }, { reinvest: true, hodlRatio: 0 }, { hodlRatio: 0 },
        { taxAdjustment: true }, { elecCost: 0.30 }, { txFee: 5 },
        { periodLength: 'weekly', investPeriod: 150 }].every(function (o) {
           var x = run(o);
           return x.peakCashDeficit >= x.totalInitialInvestment - 0.01;
       }));

    /* Reinvest mode parks cash in reinvestPool and NOT in cumulCashFlow, so a cash figure that
       reads cumulCashFlow alone reports money as still needed while the business holds it. */
    var pool = run({ reinvest: true, hodlRatio: 0, capex: 100000, machineCount: 10,
                     minerAdditions: 1, additionCapex: true, investPeriod: 24 });
    eq('the pool never bought a machine, so its whole balance is idle cash',
       pool.totalMachinesBought, 0);
    var charged = 100000 * (10 + pool.totalScheduledAdded);
    var collected = pool.tableRows.reduce(function (a, x) { return a + x.netCashFlow; }, 0);
    ok('the fixture would be blind if the pool were empty', collected > 20000,
       'pool holds $' + Math.round(collected));
    near('cash needed = capex charged minus the cash the pool is sitting on',
         pool.peakCashDeficit, charged - collected, 1.0);
})();

console.log('');
console.log(fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                       : pass + ' passed, ' + fail + ' FAILED');
process.exit(fail === 0 ? 0 : 1);
