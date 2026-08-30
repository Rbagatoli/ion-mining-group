// "Pay Electricity From Mining Revenue" -- the switch that replaced savingsElec.
//
// WHAT IT REPLACED, and why that was worth doing. savingsElec meant "the power is paid from
// income or savings", and it implemented that by removing the cost from the projection
// ENTIRELY: the return came out as though the electricity were free. On the site's own
// defaults that dropped a $1.5M five-year bill straight out of the arithmetic. This switch is
// the honest version of the same idea -- instead of deleting the cost it names where the money
// comes from, and sells the BTC to pay it.
//
// WHY IT IS A SWITCH AND NOT THE DEFAULT. It was briefly made the default and reverted, and
// that is the trap this file guards. Selling to cover is a TREASURY decision. On a site whose
// production is worth less than its power bill it sells every coin mined, at the price of the
// month it mined them, chasing a bill it can never meet -- at $0.12/kWh that emptied a 10 BTC
// treasury and made a $90,653 loss into $1,086,017. That is a real consequence of the policy,
// not a bug, but it must be something an operator opts into rather than something the page
// assumes about him.
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
    machineCount: 100, hashrate: 395, power: 5.925, capex: 4500, infrastructureCost: 0,
    elecCost: 0.06, poolFee: 2.5, uptime: 98, hodlRatio: 100,
    btcPrice: 78200, priceChange: 2, diffChange: 1.35, difficulty: 125.81,
    investPeriod: 36, periodLength: 'monthly', btcTreasury: 0, minerLifespan: 60,
    salvageValue: 0, minerAdditions: 0, autoReplace: false, reinvest: false,
    coverElec: false, taxAdjustment: false,
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
function sold(r) { return r.cumulBtcMined - r.cumulBtcHeld; }

/* The engine reports cumulative held per row, not the period split, and this task is to
   replace a toggle -- not to add outputs. So derive the split from what is already published:
   held in period i is the change in the cumulative, and sold is the rest of what was mined.
   btcTreasury is 0 in every fixture here, so the cumulative starts at zero. */
function heldIn(r, i) {
    return r.tableRows[i].btcHodlCumul - (i === 0 ? 0 : r.tableRows[i - 1].btcHodlCumul);
}
function soldIn(r, i) { return r.tableRows[i].pnlBtc - heldIn(r, i); }

/* Cash the plan needs from outside: the deepest the running cash position goes, starting from
   the day-one outlay. Derived here for the same reason. */
function cashNeeded(r) {
    var run = -r.totalInitialInvestment, low = run;
    r.tableRows.forEach(function (t) { run += t.netCashFlow; if (run < low) low = run; });
    return -low;
}

// ---- 1. savingsElec is gone, and its hole is closed -----------------------------------------

console.log('\n=== the power bill is always charged now ===');
(function () {
    /* The old switch removed the cost from the P/L. Nothing may do that any more: a projection
       must never come out equal to one where the electricity is free. */
    var real = run();
    var free = run({ elecCost: 0 });
    ok('a run with power costs is not equal to one without',
       Math.abs(real.totalPL - free.totalPL) > 1000,
       'real ' + Math.round(real.totalPL) + ' vs free ' + Math.round(free.totalPL));

    /* A scenario still carrying the retired key must be ignored, not honoured. */
    var stale = run({ savingsElec: true });
    eq('an old savingsElec key has no effect at all', stale.totalPL, real.totalPL);
    eq('and normalise does not surface it', CalcEngine.normalise({ savingsElec: true }).savingsElec, undefined);
})();

// ---- 2. off: the slider alone decides, the bill is a cash cost -------------------------------

console.log('\n=== off: nothing is sold to meet the bill ===');
(function () {
    var r = run();
    eq('at HODL 100 nothing is sold', sold(r), 0);
    near('so each month is short by exactly the power bill',
         -r.tableRows[0].netCashFlow, monthlyBill(), 0.01);

    [0, 50, 100].forEach(function (h) {
        var x = run({ hodlRatio: h });
        near('HODL ' + h + ': month 1 holds ' + h + '% of GROSS production',
             heldIn(x, 0), x.tableRows[0].pnlBtc * (h / 100), 1e-9);
    });
})();

// ---- 3. on: the bill comes off the top ------------------------------------------------------

console.log('\n=== on: the minimum is sold, and the slider splits what is left ===');
(function () {
    var bill = monthlyBill();
    var r = run({ coverElec: true });

    // Month 1 prices at btcPrice0, so the coins the bill costs are computable without the engine.
    near('month 1 sells bill / price worth of BTC',
         soldIn(r, 0), bill / BASE.btcPrice, 1e-9);
    near('which is the bill, in dollars', soldIn(r, 0) * BASE.btcPrice, bill, 0.01);
    near('and that month settles to zero cash', r.tableRows[0].netCashFlow, 0, 0.005);

    ok('no month needs outside cash', r.tableRows.every(function (x) { return x.netCashFlow > -0.005; }));
    ok('and no month leaves surplus -- it is the MINIMUM, not a selling policy',
       r.tableRows.every(function (x) { return x.netCashFlow < 0.005; }));

    near('sold + held = mined, so settlement creates no coins',
         sold(r) + r.cumulBtcHeld, r.cumulBtcMined, 1e-9);
    near('production is untouched: this is settlement, not mining',
         r.cumulBtcMined, run().cumulBtcMined, 1e-9);

    /* The ratio is of what is LEFT, which is what "100% means keep everything after the power
       is paid" has to mean arithmetically. */
    [100, 60, 0].forEach(function (h) {
        var x = run({ coverElec: true, hodlRatio: h });
        var remainder = x.tableRows[0].pnlBtc - bill / BASE.btcPrice;
        near('HODL ' + h + ': month 1 holds ' + h + '% of production NET of the bill',
             heldIn(x, 0), remainder * (h / 100), 1e-9);
    });

    /* Proportionality: the bill comes off first and its cost does not depend on the ratio, so
       the treasury is exactly proportional. A "floor under sales" reading cannot produce this. */
    var full = run({ coverElec: true, hodlRatio: 100 });
    [75, 50, 25].forEach(function (h) {
        near('HODL ' + h + ' holds exactly ' + h + '% of what HODL 100 holds',
             run({ coverElec: true, hodlRatio: h }).cumulBtcHeld, full.cumulBtcHeld * (h / 100), 1e-9);
    });
})();

// ---- 4. it costs coins, and the cost is timing ------------------------------------------------

console.log('\n=== what selling to cover actually costs ===');
(function () {
    var on = run({ coverElec: true }), off = run();
    ok('on holds fewer coins than off', on.cumulBtcHeld < off.cumulBtcHeld,
       on.cumulBtcHeld.toFixed(3) + ' vs ' + off.cumulBtcHeld.toFixed(3));
    ok('and needs no outside cash beyond capex, which off does not manage',
       cashNeeded(on) < cashNeeded(off),
       '$' + Math.round(cashNeeded(on)) + ' vs $' + Math.round(cashNeeded(off)));
    eq('on needs exactly the up-front investment',
       Math.round(cashNeeded(on)), Math.round(on.totalInitialInvestment));

    /* At a FLAT price the two are the same trade: selling a coin now and selling it at the end
       fetch the same dollars, so the whole difference between the settings is timing. */
    var flatOn = run({ coverElec: true, priceChange: 0, diffChange: 0 });
    var flatOff = run({ priceChange: 0, diffChange: 0 });
    near('flat price: covering and paying out of pocket land on the same P/L',
         flatOn.totalPL, flatOff.totalPL, 0.01);
    ok('rising price: covering costs real money, because coins left early',
       on.totalPL < off.totalPL - 1);
    var fallOn = run({ coverElec: true, priceChange: -2, diffChange: 0 });
    var fallOff = run({ priceChange: -2, diffChange: 0 });
    ok('falling price: covering is better, the same mechanism backwards',
       fallOn.totalPL > fallOff.totalPL + 1);
})();

// ---- 5. a bill production cannot pay ----------------------------------------------------------
//
// THE CASE THAT GOT THIS REVERTED AS A DEFAULT. It is correct behaviour for the policy and it
// must stay visible, because it is exactly when an operator should be reading the switch as a
// warning rather than a plan.

console.log('\n=== an uncoverable bill sells everything and still falls short ===');
(function () {
    var r = run({ coverElec: true, elecCost: 0.30 });
    near('every coin mined goes to the bill', sold(r), r.cumulBtcMined, 1e-9);
    eq('and the treasury ends empty', r.cumulBtcHeld, 0);
    ok('the uncovered remainder still shows as negative cash',
       r.tableRows.every(function (x) { return x.netCashFlow < -1; }),
       'carrying it forward silently would be borrowing the model cannot see');
    ok('so it reads as the loss it is', r.totalPL < 0);

    /* And the comparison that makes the reversion decision legible: on an underwater site,
       covering is far WORSE than funding from outside, because it liquidates at low prices. */
    var off = run({ elecCost: 0.30 });
    ok('on an underwater site, covering is worse than paying out of pocket',
       r.totalPL < off.totalPL,
       'cover ' + Math.round(r.totalPL) + ' vs pocket ' + Math.round(off.totalPL));
})();

// ---- 6. tax is deliberately not covered ---------------------------------------------------------

console.log('\n=== the switch covers power, and says so ===');
(function () {
    var r = run({ coverElec: true, taxAdjustment: true, miningIncomeTaxRate: 35 });
    var bill = monthlyBill();
    near('month 1 still sells only the power bill',
         soldIn(r, 0) * BASE.btcPrice, bill, 0.01);
    ok('so with tax on, cash flow goes negative by the tax and not by the power',
       r.tableRows[0].netCashFlow < -1,
       'net cash $' + Math.round(r.tableRows[0].netCashFlow));
})();

console.log('');
console.log(fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                       : pass + ' passed, ' + fail + ' FAILED');
process.exit(fail === 0 ? 0 : 1);
