// Tests for "sell to cover" settlement, and for the cash figure that made it necessary.
//
// THE DEFECT THIS EXISTS FOR was not an arithmetic error. The engine has always charged
// electricity against totalPL, so the return was never "free power". But at the shipped
// HODL of 100 nothing is ever sold, cashFromSales is zero, and periodCashFlow is exactly
// minus the power bill -- so the money paying that bill comes from outside the business,
// every month, while the whole stack is carried to the terminal price. Read as a
// self-funding return it is out by 187 points of ROI at the site's own defaults, and
// nothing on the page said so.
//
// Expected values here are derived from the INPUTS by hand -- period electricity is
// rebuilt from kW x hours x rate, not read back from tableRows -- because a figure the
// engine supplied cannot disagree with the engine about anything.

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
    if (d <= tol) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + '\n        expected ' + expected +
                               ' +/- ' + tol + '\n        actual   ' + actual); }
}

var DAYS_PER_MONTH = 30.44;

// The public calculator's shipped defaults, so these assertions describe the screen a
// prospect actually sees. autoReplace is OFF and the horizon is inside the 48-month
// lifespan wherever a clean cash identity is being asserted: replacement capex is real,
// but it is capital, and mixing it in would blur the opex question these tests are about.
var BASE = {
    machineCount: 100, hashrate: 270, power: 3.645, capex: 3010, infrastructureCost: 0,
    elecCost: 0.04, poolFee: 2.5, uptime: 98, hodlRatio: 100,
    btcPrice: 72684, priceChange: 2, diffChange: 2, difficulty: 127.48,
    investPeriod: 36, periodLength: 'monthly', btcTreasury: 0, minerLifespan: 48,
    salvageValue: 10, minerAdditions: 0, autoReplace: false, reinvest: false,
    savingsElec: false, coverElec: false, taxAdjustment: false,
    miningIncomeTaxRate: 35, capitalGainsTaxRate: 15,
    startDate: '2026-08-29'
};
function run(over) {
    var s = {}; for (var k in BASE) s[k] = BASE[k];
    for (var k2 in (over || {})) s[k2] = over[k2];
    return CalcEngine.computeProjection(s);
}

// The month's power bill, rebuilt from the inputs. No machine count changes in these
// fixtures (autoReplace off, no additions, horizon inside lifespan) so it is constant.
function monthlyBill(s) {
    s = s || BASE;
    return s.power * s.machineCount * 24 * DAYS_PER_MONTH * s.elecCost * (s.uptime / 100);
}

// ---- 1. the switch off changes nothing ---------------------------------------------------------

console.log('\n=== off is off ===');
(function () {
    var absent = {}; for (var k in BASE) absent[k] = BASE[k];
    delete absent.coverElec;
    var noKey = CalcEngine.computeProjection(absent);
    var off = run({ coverElec: false });

    // A scenario link saved before this switch existed has no coverElec key. If absent ever
    // starts meaning ON, every one of those links silently reopens as a different projection.
    eq('an absent coverElec key is identical to an explicit false', noKey.totalPL, off.totalPL);
    eq('and normalise reports it off', CalcEngine.normalise(absent).coverElec, false);

    eq('with HODL at 100 and the switch off, nothing is ever sold', off.cumulBtcSold, 0);
    ok('so every single month is cash-negative by the power bill',
       off.tableRows.every(function (r) { return r.netCashFlow < 0; }),
       off.tableRows.filter(function (r) { return r.netCashFlow >= 0; }).length + ' months are not');
    near('and the month-1 shortfall is exactly the bill',
         -off.tableRows[0].netCashFlow, monthlyBill(), 0.01);
})();

// ---- 2. the bill is covered, exactly ------------------------------------------------------------

console.log('\n=== sell to cover pays the bill and not a satoshi more ===');
(function () {
    var r = run({ coverElec: true });
    var bill = monthlyBill();

    // Month 1 prices at btcPrice0, so the coins needed are computable without the engine.
    near('month 1 sells bill / price worth of BTC',
         r.tableRows[0].btcSold, bill / BASE.btcPrice, 1e-9);
    near('which is the bill in dollars', r.tableRows[0].btcSold * BASE.btcPrice, bill, 0.01);

    ok('so no month is cash-negative',
       r.tableRows.every(function (x) { return x.netCashFlow > -0.005; }),
       r.tableRows.filter(function (x) { return x.netCashFlow <= -0.005; }).length + ' months are');
    ok('and no month leaves surplus cash either -- it is the MINIMUM, not a policy of selling',
       r.tableRows.every(function (x) { return x.netCashFlow < 0.005; }));

    near('sold + held = mined, so settlement creates no coins',
         r.cumulBtcSold + r.cumulBtcHeld, r.cumulBtcMined, 1e-9);
    ok('and coins really did move to the bill', r.cumulBtcSold > 0 && r.cumulBtcHeld > 0,
       'sold ' + r.cumulBtcSold.toFixed(4) + ' held ' + r.cumulBtcHeld.toFixed(4));

    var off = run({ coverElec: false });
    near('production is untouched -- this is settlement, not mining',
         r.cumulBtcMined, off.cumulBtcMined, 1e-9);
})();

// ---- 3. the timing identity ---------------------------------------------------------------------
//
// The sharpest statement of what the switch does. At a FLAT price, selling a coin now and
// selling it at the end are the same trade, so paying the bill out of production must land
// on exactly the same P/L as paying it out of pocket:
//
//     out of pocket:  -capex - SUM(elec) + mined * P
//     sell to cover:  -capex + (mined - SUM(elec)/P) * P   ==  the same line
//
// Any divergence at a flat price is the engine doing something to the coins beyond moving
// them, and any CONVERGENCE at a rising price would mean the sales are being priced at the
// terminal price rather than at the month they happened.

console.log('\n=== at a flat price it is pure timing; at a rising price it is a real cost ===');
(function () {
    var flatOff = run({ priceChange: 0, diffChange: 0, coverElec: false });
    var flatOn  = run({ priceChange: 0, diffChange: 0, coverElec: true });
    near('flat price: cover and out-of-pocket give the identical P/L',
         flatOn.totalPL, flatOff.totalPL, 0.01);
    ok('but they got there differently -- one sold coins, the other did not',
       flatOn.cumulBtcSold > 0 && flatOff.cumulBtcSold === 0);

    var riseOff = run({ coverElec: false });
    var riseOn  = run({ coverElec: true });
    ok('rising price: covering costs REAL money, because the coins left early',
       riseOn.totalPL < riseOff.totalPL - 1,
       'cover ' + Math.round(riseOn.totalPL) + ' vs pocket ' + Math.round(riseOff.totalPL));
    ok('and the treasury is smaller by the coins that paid the bills',
       riseOn.cumulBtcHeld < riseOff.cumulBtcHeld);

    // A falling price inverts it: coins sold early were worth MORE than the ones kept.
    var fallOff = run({ priceChange: -2, diffChange: 0, coverElec: false });
    var fallOn  = run({ priceChange: -2, diffChange: 0, coverElec: true });
    ok('falling price: covering is BETTER, which is the same mechanism running backwards',
       fallOn.totalPL > fallOff.totalPL + 1,
       'cover ' + Math.round(fallOn.totalPL) + ' vs pocket ' + Math.round(fallOff.totalPL));
})();

// ---- 4. a floor on sales, not a replacement for the HODL ratio -----------------------------------
//
// Two fixtures, deliberately on opposite sides of the comparison. With one of them the
// check cannot distinguish a floor from an override.

console.log('\n=== the HODL ratio is a ratio of what is left after the bill ===');
(function () {
    var bill = monthlyBill();

    /* (a) the meaning itself. Costs come off the top, and the slider splits the
       remainder -- so at HODL h the treasury takes h of (production - bill), not h of
       production. Month 1 prices at btcPrice0, so both quantities are computable from
       the inputs and that period's production without asking the engine what it held. */
    [100, 80, 50, 20, 0].forEach(function (h) {
        var r = run({ coverElec: true, hodlRatio: h });
        var mined1 = r.tableRows[0].pnlBtc;
        var remainder = mined1 - bill / BASE.btcPrice;
        near('HODL ' + h + ': month 1 holds ' + h + '% of production net of the bill',
             r.tableRows[0].btcHeld, remainder * (h / 100), 1e-9);
        near('HODL ' + h + ': and sells the bill plus the other ' + (100 - h) + '%',
             r.tableRows[0].btcSold, bill / BASE.btcPrice + remainder * (1 - h / 100), 1e-9);
    });

    /* (b) the structural consequence, which the old "floor under sales" reading could not
       produce: the bill comes off the top FIRST, and what it costs does not depend on the
       ratio, so the treasury ends up exactly proportional to the ratio. Halve the slider
       and you halve the stack. Under a floor it was not proportional at all -- the bill
       ate into the sold half or the held half depending on which was larger that month. */
    var full = run({ coverElec: true, hodlRatio: 100 });
    ok('the reference run actually holds something', full.cumulBtcHeld > 1,
       full.cumulBtcHeld.toFixed(4) + ' BTC');
    [80, 50, 20].forEach(function (h) {
        near('HODL ' + h + ' holds exactly ' + h + '% of what HODL 100 holds',
             run({ coverElec: true, hodlRatio: h }).cumulBtcHeld,
             full.cumulBtcHeld * (h / 100), 1e-9);
    });

    /* (c) 100% is the setting the operator actually runs, and it is the one place the two
       readings agree: sell the bill, hold the rest. Anything that moves here moves a saved
       scenario nobody edited. */
    near('at HODL 100 the whole sale IS the bill',
         full.tableRows[0].btcSold * BASE.btcPrice, bill, 0.01);
    near('and nothing is left over as cash', full.tableRows[0].netCashFlow, 0, 0.005);

    /* (d) it is NOT the old floor. With a bill smaller than the slider's own sale, a floor
       would have left that sale untouched at 60% of production; off-the-top sells the bill
       AND 60% of what remains, which is strictly more. This is the fixture that fails if
       the semantics ever revert. */
    var h40 = run({ coverElec: true, hodlRatio: 40 });
    var mined1 = h40.tableRows[0].pnlBtc;
    ok('60% of month-1 production is worth more than the bill on its own',
       mined1 * 0.6 * BASE.btcPrice > bill, 'otherwise a floor and off-the-top agree here');
    ok('so month 1 sells strictly more than a floor would have',
       h40.tableRows[0].btcSold > mined1 * 0.6 + 1e-9,
       'sold ' + h40.tableRows[0].btcSold.toFixed(6) + ' against a floor ' + (mined1 * 0.6).toFixed(6));
    near('and the excess over a plain 60% sale is 40% of the bill',
         h40.tableRows[0].btcSold - mined1 * 0.6, 0.4 * bill / BASE.btcPrice, 1e-9);

    /* (e) whatever the ratio, the bill is paid out of production and the coins balance. */
    var ratios = [0, 10, 25, 40, 60, 80, 95, 100];
    ok('every ratio still covers the bill, so no month needs outside cash',
       ratios.every(function (h) {
           return run({ coverElec: true, hodlRatio: h })
                  .tableRows.every(function (x) { return x.netCashFlow > -0.005; });
       }));
    ok('every ratio sells at least what it would have sold without the switch',
       ratios.every(function (h) {
           return run({ coverElec: true, hodlRatio: h }).cumulBtcSold >=
                  run({ coverElec: false, hodlRatio: h }).cumulBtcSold - 1e-9;
       }));
    ok('and no ratio creates or destroys a coin',
       ratios.every(function (h) {
           var r = run({ coverElec: true, hodlRatio: h });
           return Math.abs(r.cumulBtcSold + r.cumulBtcHeld - r.cumulBtcMined) < 1e-9;
       }));
})();

// ---- 5. a bill production cannot pay stays visible -----------------------------------------------

console.log('\n=== an uncoverable bill is a shortfall, not a loan ===');
(function () {
    var r = run({ coverElec: true, elecCost: 0.30 });
    near('every coin mined goes to the bill', r.cumulBtcSold, r.cumulBtcMined, 1e-9);
    eq('and the treasury is empty', r.cumulBtcHeld, 0);
    ok('the uncovered remainder still shows as negative cash',
       r.tableRows.every(function (x) { return x.netCashFlow < -1; }),
       'silently carrying it forward would rebuild the assumption this switch removes');
    ok('so the projection is a loss', r.totalPL < 0);
})();

// ---- 6. tax is a cash bill in the same period -----------------------------------------------------

console.log('\n=== mining income tax is covered alongside the power ===');
(function () {
    var r = run({ coverElec: true, taxAdjustment: true, miningIncomeTaxRate: 35 });
    var noTax = run({ coverElec: true, taxAdjustment: false });

    ok('turning tax on makes the site sell more coins', r.cumulBtcSold > noTax.cumulBtcSold);
    ok('and it still settles to zero cash every month',
       r.tableRows.every(function (x) { return Math.abs(x.netCashFlow) < 0.005; }),
       'a tax bill left uncovered would be outside capital again, which is the whole point');

    // Independently: taxable income is (gross revenue - electricity), so month 1 must sell
    // the bill plus 35% of what is left after it.
    var mined1 = noTax.tableRows[0].pnlBtc;
    var bill = monthlyBill();
    var expectSold = (bill + Math.max(0, mined1 * BASE.btcPrice - bill) * 0.35) / BASE.btcPrice;
    near('month 1 sells the bill plus 35% of income net of it',
         r.tableRows[0].btcSold, expectSold, 1e-9);
})();

// ---- 7. savingsElec is the contradiction, and it wins -----------------------------------------------

console.log('\n=== savingsElec keeps power off the books, so there is nothing to cover ===');
(function () {
    var both = run({ coverElec: true, savingsElec: true });
    var just = run({ coverElec: false, savingsElec: true });
    eq('cover is a no-op when power is off the books', both.totalPL, just.totalPL);
    eq('and nothing is sold', both.cumulBtcSold, 0);
})();

// ---- 8. the cash figure ---------------------------------------------------------------------------
//
// peakCashDeficit is the number that answers "where does the electricity money come from",
// which totalPL structurally cannot: totalPL adds heldBtcValue, so a plan funded entirely
// out of pocket reports a profit while its bank account is empty.

console.log('\n=== cash required from outside ===');
(function () {
    var months = BASE.investPeriod;

    var off = run({ coverElec: false });
    near('out of pocket: cash needed = capex + every bill in the horizon',
         off.peakCashDeficit, BASE.capex * BASE.machineCount + monthlyBill() * months, 0.5);
    near('which is nearly triple the "up-front investment" the page shows',
         off.externalOpexFunded, monthlyBill() * months, 0.5);
    ok('so the stated investment understates the cash by a factor over 2',
       off.peakCashDeficit > off.totalInitialInvestment * 2,
       '$' + Math.round(off.peakCashDeficit) + ' against $' + Math.round(off.totalInitialInvestment));

    var on = run({ coverElec: true });
    eq('sell to cover: nothing beyond day one is needed',
       Math.round(on.peakCashDeficit), Math.round(on.totalInitialInvestment));
    eq('and externalOpexFunded is zero', Math.round(on.externalOpexFunded), 0);

    // Replacement capex IS capital and is deliberately not settled out of production, so a
    // horizon that crosses the fleet's life must report it. 48-month lifespan, 60-month run.
    var long = run({ coverElec: true, autoReplace: true, investPeriod: 60 });
    var replacement = BASE.machineCount * BASE.capex * (1 - BASE.salvageValue / 100);
    near('a horizon that outlives the fleet reports the replacement as outside cash',
         long.externalOpexFunded, replacement, 1.0);

    ok('cash required is never less than the day-one investment, whatever the settings',
       [{}, { coverElec: true }, { savingsElec: true }, { reinvest: true, hodlRatio: 0 },
        { hodlRatio: 0 }, { coverElec: true, taxAdjustment: true },
        { periodLength: 'weekly', investPeriod: 150, coverElec: true }].every(function (o) {
           var x = run(o);
           return x.peakCashDeficit >= x.totalInitialInvestment - 0.01;
       }));

    /* Reinvest mode parks cash in reinvestPool and NOT in cumulCashFlow, so a cash figure
       that reads cumulCashFlow alone reports money as still needed from outside when the
       business is already holding it. The fixture makes that gap large and unmissable:
       capex far above monthly cash flow, so the pool fills and never buys anything, while
       scheduled additions charge cumulCashFlow every month. */
    var pool = run({ coverElec: false, reinvest: true, hodlRatio: 0, capex: 100000,
                     machineCount: 10, minerAdditions: 1, additionCapex: true,
                     investPeriod: 24 });
    eq('the pool never bought a machine, so its whole balance is idle cash',
       pool.totalMachinesBought, 0);
    ok('and it is holding a material amount', pool.totalScheduledAdded === 23);
    var charged = 100000 * (10 + pool.totalScheduledAdded);
    var collected = pool.tableRows.reduce(function (a, x) { return a + x.netCashFlow; }, 0);
    ok('the fixture would be blind if the pool were empty', collected > 50000,
       'pool holds $' + Math.round(collected));
    near('cash needed = capex charged minus the cash the pool is sitting on',
         pool.peakCashDeficit, charged - collected, 1.0);
    ok('which is strictly less than the capex alone', pool.peakCashDeficit < charged - 50000,
       'reading cumulCashFlow without the pool would report $' + charged);

    // The pure-cash position is totalEconomicValue minus everything unrealised. If those two
    // ever disagree, one of them is counting a dollar the other is not.
    var chk = run({ coverElec: true, hodlRatio: 60, taxAdjustment: true, autoReplace: true,
                    investPeriod: 60, minerAdditions: 2 });
    ok('cash and economic value stay reconciled across every period',
       chk.tableRows.every(function (x) { return x.cumulPL >= -chk.peakCashDeficit - 0.01; }),
       'economic value dipped below the cash actually spent, which is impossible');
})();

console.log('');
console.log(fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                       : pass + ' passed, ' + fail + ' FAILED');
process.exit(fail === 0 ? 0 : 1);
