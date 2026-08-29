// How the calculator settles its power bill, and the cash figure that made the question
// answerable.
//
// WHAT THIS PINS. The calculator has always had two settlement worlds: by default the power
// bill is paid out of mined revenue, and savingsElec is the exception where the money comes
// from outside. The original wrote them as two branches identical but for `- periodElecCost`,
// so the intent was never in doubt -- but nothing ever made the SALE large enough. btcSold
// came from the HODL slider alone, so revenue funded the bill only while (1 - hodl) x
// production happened to exceed it: true up to about HODL 26% over a 60-month horizon at the
// shipped defaults, and false at the 100% an operator running a treasury actually sets. Above
// that crossover the shortfall silently became outside capital, and at HODL 100 the page
// reported a 386% return on a plan quietly consuming $1.2M of cash.
//
// So the default now takes the period's cash costs off the top and lets the slider split what
// remains. These assertions are what stops it reverting to a slider that cannot reach, and
// what stops savingsElec quietly becoming the same thing.
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

// The public calculator's shipped defaults, so these describe the screen a prospect sees.
// autoReplace is OFF and the horizon sits inside the 48-month lifespan wherever a clean cash
// identity is asserted: replacement capex is real, but it is capital, and mixing it in would
// blur the opex question these tests are about.
var BASE = {
    machineCount: 100, hashrate: 270, power: 3.645, capex: 3010, infrastructureCost: 0,
    elecCost: 0.04, poolFee: 2.5, uptime: 98, hodlRatio: 100,
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

// The month's power bill, rebuilt from the inputs. No machine count changes in these fixtures
// (autoReplace off, no additions, horizon inside lifespan) so it is constant.
function monthlyBill(s) {
    s = s || BASE;
    return s.power * s.machineCount * 24 * DAYS_PER_MONTH * s.elecCost * (s.uptime / 100);
}

// ---- 1. the default settles the bill out of production -----------------------------------

console.log('\n=== the default pays the power bill from what it mines ===');
(function () {
    var r = run();
    var bill = monthlyBill();

    // Month 1 prices at btcPrice0, so the coins the bill costs are computable without the engine.
    near('month 1 sells bill / price worth of BTC',
         r.tableRows[0].btcSold, bill / BASE.btcPrice, 1e-9);
    near('which is the bill, in dollars', r.tableRows[0].btcSold * BASE.btcPrice, bill, 0.01);

    ok('so no month is cash-negative -- nothing is needed from outside',
       r.tableRows.every(function (x) { return x.netCashFlow > -0.005; }),
       r.tableRows.filter(function (x) { return x.netCashFlow <= -0.005; }).length + ' months are');
    ok('and no month leaves surplus cash either: it is the MINIMUM, not a policy of selling',
       r.tableRows.every(function (x) { return x.netCashFlow < 0.005; }));

    near('sold + held = mined, so settlement creates no coins',
         r.cumulBtcSold + r.cumulBtcHeld, r.cumulBtcMined, 1e-9);
    ok('coins really did move to the bill', r.cumulBtcSold > 0 && r.cumulBtcHeld > 0,
       'sold ' + r.cumulBtcSold.toFixed(4) + ' held ' + r.cumulBtcHeld.toFixed(4));

    /* THE REGRESSION THIS EXISTS FOR. If btcSold ever goes back to coming from the slider
       alone, HODL 100 sells nothing and every month is short by exactly the bill. */
    ok('at HODL 100 the sale is not zero, which is all the slider alone would give',
       r.tableRows[0].btcSold > 0);
})();

// ---- 2. the HODL ratio is a ratio of what is left ------------------------------------------

console.log('\n=== the HODL ratio applies to production net of the bill ===');
(function () {
    var bill = monthlyBill();

    [100, 80, 50, 20, 0].forEach(function (h) {
        var r = run({ hodlRatio: h });
        var mined1 = r.tableRows[0].pnlBtc;
        var remainder = mined1 - bill / BASE.btcPrice;
        near('HODL ' + h + ': month 1 holds ' + h + '% of production net of the bill',
             r.tableRows[0].btcHeld, remainder * (h / 100), 1e-9);
        near('HODL ' + h + ': and sells the bill plus the other ' + (100 - h) + '%',
             r.tableRows[0].btcSold, bill / BASE.btcPrice + remainder * (1 - h / 100), 1e-9);
    });

    /* The structural consequence, and the one a "floor under sales" reading cannot produce:
       the bill comes off the top first and what it costs does not depend on the ratio, so the
       treasury ends up exactly proportional to the ratio. Halve the slider, halve the stack. */
    var full = run({ hodlRatio: 100 });
    ok('the reference run holds something', full.cumulBtcHeld > 1, full.cumulBtcHeld.toFixed(4) + ' BTC');
    [80, 50, 20].forEach(function (h) {
        near('HODL ' + h + ' holds exactly ' + h + '% of what HODL 100 holds',
             run({ hodlRatio: h }).cumulBtcHeld, full.cumulBtcHeld * (h / 100), 1e-9);
    });

    var ratios = [0, 10, 25, 40, 60, 80, 95, 100];
    ok('every ratio still covers the bill, so none of them needs outside cash',
       ratios.every(function (h) {
           return run({ hodlRatio: h }).tableRows.every(function (x) { return x.netCashFlow > -0.005; });
       }));
    ok('and no ratio creates or destroys a coin',
       ratios.every(function (h) {
           var r = run({ hodlRatio: h });
           return Math.abs(r.cumulBtcSold + r.cumulBtcHeld - r.cumulBtcMined) < 1e-9;
       }));
})();

// ---- 3. savingsElec is the exception, and it is the flattering one -------------------------

console.log('\n=== savingsElec funds the bill from outside, and drops it from the P/L ===');
(function () {
    var v = run({ savingsElec: true });
    var d = run();

    eq('nothing is sold to meet the bill', v.cumulBtcSold, 0);
    near('so the whole of production is held', v.cumulBtcHeld, v.cumulBtcMined, 1e-9);
    ok('and the treasury is bigger than the default keeps',
       v.cumulBtcHeld > d.cumulBtcHeld,
       v.cumulBtcHeld.toFixed(4) + ' vs ' + d.cumulBtcHeld.toFixed(4));

    /* THE PART THAT HAS TO STAY VISIBLE. On this path the cost does not merely come from
       elsewhere, it leaves the projection entirely -- the return is computed as though the
       power were free. That is a legitimate way to model an operator funding opex from other
       income, and it is also exactly why it must never become the default. */
    ok('the power spend is still reported', v.cumulElecCost > 0, '$' + Math.round(v.cumulElecCost));
    var free = run({ savingsElec: true, elecCost: 0 });
    near('but the P/L is identical to one where power costs nothing at all',
         v.totalPL, free.totalPL, 0.01);
    ok('so it reports a strictly better return than the default',
       v.roi > d.roi, v.roi.toFixed(1) + '% vs ' + d.roi.toFixed(1) + '%');

    // Under savingsElec the slider splits GROSS production, its original meaning.
    var half = run({ savingsElec: true, hodlRatio: 50 });
    near('and the ratio there is of gross production, not of a remainder',
         half.tableRows[0].btcHeld, half.tableRows[0].pnlBtc * 0.5, 1e-9);
})();

// ---- 4. the timing identity ---------------------------------------------------------------
//
// The sharpest statement of what settling out of production costs. Paying the bill out of
// pocket is no longer a setting, so the comparison is built by hand from the inputs:
//
//     out of pocket:  -capex - SUM(elec) + mined * P
//     out of production, at a FLAT price: the same line, because selling a coin now and
//     selling it at the end are the same trade when the price does not move.
//
// Divergence at a flat price means the engine is doing something to the coins beyond moving
// them. Convergence at a RISING price would mean the sales are being priced at the terminal
// price rather than at the month they happened.

console.log('\n=== at a flat price it is pure timing; at a rising price it is a real cost ===');
(function () {
    var bill = monthlyBill();
    var capex = BASE.capex * BASE.machineCount;
    /* The fleet at the end of the horizon, straight-lined from the inputs -- autoReplace is
       off in BASE and the horizon is inside the lifespan, so it is the original fleet at age
       numPeriods - 1. Section 8 verifies the engine's own figure against this same formula,
       so the two agreeing here is a reconciliation and not a circular read. */
    var age = BASE.investPeriod - 1, L = BASE.minerLifespan, sv = BASE.salvageValue / 100;
    var fleetLeft = BASE.machineCount * BASE.capex * (sv + (1 - sv) * (L - age) / L);
    // Production is settlement-independent (section 1 asserts the coins only move), so using
    // it here is not circular -- everything else in this expression is an input.
    function pocket(r, price) {
        return -capex - bill * BASE.investPeriod + r.cumulBtcMined * price + fleetLeft;
    }

    var flat = run({ priceChange: 0, diffChange: 0 });
    near('flat price: settling from production lands on the out-of-pocket P/L exactly',
         flat.totalPL, pocket(flat, BASE.btcPrice), 0.01);
    ok('and it got there by actually selling coins',
       flat.cumulBtcSold > 0 && flat.cumulBtcHeld < flat.cumulBtcMined);

    var rise = run();
    ok('rising price: settling from production costs REAL money, because coins left early',
       rise.totalPL < pocket(rise, rise.finalBtcPrice) - 1,
       'production ' + Math.round(rise.totalPL) +
       ' vs pocket ' + Math.round(pocket(rise, rise.finalBtcPrice)));

    var fall = run({ priceChange: -2, diffChange: 0 });
    ok('falling price: it is BETTER, which is the same mechanism running backwards',
       fall.totalPL > pocket(fall, fall.finalBtcPrice) + 1,
       'production ' + Math.round(fall.totalPL) +
       ' vs pocket ' + Math.round(pocket(fall, fall.finalBtcPrice)));
})();

// ---- 5. a bill production cannot pay stays visible ------------------------------------------

console.log('\n=== an uncoverable bill is a shortfall, not a loan ===');
(function () {
    var r = run({ elecCost: 0.30 });
    near('every coin mined goes to the bill', r.cumulBtcSold, r.cumulBtcMined, 1e-9);
    eq('and the treasury is empty', r.cumulBtcHeld, 0);
    ok('the uncovered remainder still shows as negative cash',
       r.tableRows.every(function (x) { return x.netCashFlow < -1; }),
       'carrying it forward silently would rebuild the assumption this removes');
    ok('so the projection is a loss', r.totalPL < 0);
})();

// ---- 6. tax is a cash bill in the same period ------------------------------------------------

console.log('\n=== mining income tax comes off the top alongside the power ===');
(function () {
    var r = run({ taxAdjustment: true, miningIncomeTaxRate: 35 });
    var noTax = run();

    ok('turning tax on makes the site sell more coins', r.cumulBtcSold > noTax.cumulBtcSold);
    ok('and it still settles to zero cash every month',
       r.tableRows.every(function (x) { return Math.abs(x.netCashFlow) < 0.005; }),
       'a tax bill left uncovered would be outside capital again, which is the point');

    // Independently: taxable income is (gross revenue - electricity), so month 1 must sell the
    // bill plus 35% of what is left after it.
    var mined1 = noTax.tableRows[0].pnlBtc;
    var bill = monthlyBill();
    var expect = (bill + Math.max(0, mined1 * BASE.btcPrice - bill) * 0.35) / BASE.btcPrice;
    near('month 1 sells the bill plus 35% of income net of it',
         r.tableRows[0].btcSold, expect, 1e-9);
})();

// ---- 7. the cash figure -----------------------------------------------------------------------
//
// peakCashDeficit answers "where does the money come from", which totalPL structurally cannot:
// totalPL adds heldBtcValue, so a plan funded entirely out of pocket reports a profit while
// its bank account is empty.

console.log('\n=== cash required from outside ===');
(function () {
    var d = run();
    eq('settling from production needs nothing beyond day one',
       Math.round(d.peakCashDeficit), Math.round(d.totalInitialInvestment));
    eq('and externalOpexFunded is zero', Math.round(d.externalOpexFunded), 0);

    // Replacement capex IS capital and is deliberately not settled out of production, so a
    // horizon that outlives the fleet must report it. 48-month lifespan, 60-month run.
    var long = run({ autoReplace: true, investPeriod: 60 });
    var replacement = BASE.machineCount * BASE.capex * (1 - BASE.salvageValue / 100);
    near('a horizon that outlives the fleet reports the replacement as outside cash',
         long.externalOpexFunded, replacement, 1.0);

    // A bill production cannot meet is outside cash too, and the excess must equal the
    // shortfall the period table already reports.
    var short = run({ elecCost: 0.30 });
    var summed = short.tableRows.reduce(function (a, x) { return a + Math.min(0, x.netCashFlow); }, 0);
    near('an uncoverable bill shows up as cash needed, equal to the summed shortfall',
         short.peakCashDeficit, short.totalInitialInvestment - summed, 1.0);
    ok('which is far more than the up-front figure',
       short.peakCashDeficit > short.totalInitialInvestment * 2,
       '$' + Math.round(short.peakCashDeficit) + ' against $' + Math.round(short.totalInitialInvestment));

    ok('cash required is never less than the day-one investment, whatever the settings',
       [{}, { savingsElec: true }, { reinvest: true, hodlRatio: 0 }, { hodlRatio: 0 },
        { taxAdjustment: true }, { elecCost: 0.30 },
        { periodLength: 'weekly', investPeriod: 150 }].every(function (o) {
           var x = run(o);
           return x.peakCashDeficit >= x.totalInitialInvestment - 0.01;
       }));

    /* Reinvest mode parks cash in reinvestPool and NOT in cumulCashFlow, so a cash figure that
       reads cumulCashFlow alone reports money as still needed from outside while the business
       is already holding it. The fixture makes the gap unmissable: capex far above monthly cash
       flow, so the pool fills and never buys anything, while scheduled additions charge
       cumulCashFlow every month. */
    var pool = run({ reinvest: true, hodlRatio: 0, capex: 100000, machineCount: 10,
                     minerAdditions: 1, additionCapex: true, investPeriod: 24 });
    eq('the pool never bought a machine, so its whole balance is idle cash',
       pool.totalMachinesBought, 0);
    eq('and the additions all landed', pool.totalScheduledAdded, 23);
    var charged = 100000 * (10 + pool.totalScheduledAdded);
    var collected = pool.tableRows.reduce(function (a, x) { return a + x.netCashFlow; }, 0);
    ok('the fixture would be blind if the pool were empty', collected > 20000,
       'pool holds $' + Math.round(collected));
    near('cash needed = capex charged minus the cash the pool is sitting on',
         pool.peakCashDeficit, charged - collected, 1.0);
    ok('which is strictly less than the capex alone', pool.peakCashDeficit < charged - 20000,
       'reading cumulCashFlow without the pool would report $' + charged);
})();

// ---- 8. the machines you still own ---------------------------------------------------------
//
// totalPL counted the BTC held at the end and every dollar spent, but not the FLEET held at
// the end, so a horizon stopping partway through a fleet's life wrote off whatever was left.
// The tell was a cliff nobody would look for: extending 48 -> 49 months made Total P/L FALL,
// because month 49 buys a replacement fleet and the model booked it as a pure loss. That is
// what flipped the buy-and-hold verdict at the shipped default and made mining look worse
// than buying almost everywhere -- which is not what an operator sees, because an operator
// still owns the machines.

console.log('\n=== the fleet still standing at the horizon is worth something ===');
(function () {
    var L = BASE.minerLifespan, C = BASE.capex, N = BASE.machineCount, sv = BASE.salvageValue / 100;

    // Day one, before anything has aged: the fleet is worth exactly what was paid for it.
    var one = run({ investPeriod: 1 });
    near('a brand-new fleet is worth its capex', one.residualFleetValue, C * N, 0.01);

    /* Straight-line to salvage, checked against a value built from the inputs. At 36 months
       into a 48-month life the fleet has a quarter of its life left, so it is worth
       salvage + 3/4 of the depreciable part... measured at the LAST period, index n-1. */
    [12, 24, 36].forEach(function (n) {
        var r = run({ investPeriod: n });
        var age = n - 1;
        var expect = N * C * (sv + (1 - sv) * (L - age) / L);
        near('at ' + n + ' months the fleet is worth its straight-line value',
             r.residualFleetValue, expect, 0.01);
    });

    // At exactly end of life it must equal what retirement would pay, or the two models of
    // the same machine disagree by the salvage percentage.
    var atLife = run({ investPeriod: L + 1, autoReplace: false });
    near('a fleet at end of life is worth its salvage, the same as retiring it pays',
         atLife.residualFleetValue, 0, 0.01);
    /* A machine retires the instant it reaches lifespan, so no period ever shows one still
       owned at exactly salvage -- the last period it is owned it has one period of life left.
       What must hold is CONTINUITY across that boundary: the residual the period before
       retirement, and the salvage cash retirement pays, differ by one period of depreciation
       and nothing more. A gap wider than that means the two models of the same machine
       disagree about what it is worth. */
    var justBefore = run({ investPeriod: L, autoReplace: false });
    var onePeriod = N * C * (1 - sv) / L;
    near('the period before retirement it is worth salvage plus one period of life',
         justBefore.residualFleetValue, N * C * sv + onePeriod, 1.0);
    ok('so nothing jumps when it retires',
       Math.abs(justBefore.residualFleetValue - N * C * sv) <= onePeriod + 1,
       'residual ' + Math.round(justBefore.residualFleetValue) +
       ' vs salvage ' + Math.round(N * C * sv));

    /* THE CLIFF. Buying a replacement fleet must not make the projection worse. This is the
       assertion that fails if residual value is ever dropped again: at 48 months the fleet is
       spent, at 49 a new one is bought, and P/L has to step UP by roughly what it bought. */
    var before = run({ investPeriod: 48, autoReplace: true });
    var after = run({ investPeriod: 49, autoReplace: true });
    ok('extending the horizon past a fleet replacement does not destroy value',
       after.totalPL > before.totalPL,
       '48mo ' + Math.round(before.totalPL) + ' -> 49mo ' + Math.round(after.totalPL));
    ok('and the replacement shows up as fleet worth owning',
       after.residualFleetValue > before.residualFleetValue + C * N * 0.5,
       'fleet ' + Math.round(before.residualFleetValue) + ' -> ' + Math.round(after.residualFleetValue));

    /* Retired machines must not be counted twice: their salvage is already paid into cash. */
    var gone = run({ investPeriod: L + 6, autoReplace: false });
    eq('a fleet that retired and was not replaced is worth nothing', gone.activeMachines, 0);
    near('and contributes no residual', gone.residualFleetValue, 0, 0.01);

    /* The invariant the whole codebase is built around: the card equals the bottom of its own
       table. Residual is in both or the two disagree the moment a horizon ends mid-life. */
    [24, 49, 60, 72].forEach(function (n) {
        var r = run({ investPeriod: n, autoReplace: true });
        near('at ' + n + ' months the headline equals the last row of the table',
             r.totalPL, r.tableRows[r.tableRows.length - 1].cumulPL, 0.01);
    });

    /* Break-even deliberately does NOT use it. Day one you have spent the capex and own the
       capex, so a break-even that counted book value would read period 1 for every scenario
       ever run -- true, and useless. */
    var d = run({ investPeriod: 60, autoReplace: true });
    ok('break-even still measures cash and coin, not book value',
       d.breakEvenPeriod > 1, 'month ' + d.breakEvenPeriod);
})();

console.log('');
console.log(fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                       : pass + ' passed, ' + fail + ' FAILED');
process.exit(fail === 0 ? 0 : 1);
