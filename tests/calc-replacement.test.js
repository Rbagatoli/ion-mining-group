// Replacement hardware: specs, sizing policy, and the two guard rails.
//
// THE DESIGN THIS DEFENDS. Efficiency improvement and difficulty growth are the same
// phenomenon seen from two sides -- when the network moves from 15 J/TH to 10 J/TH, the same
// megawatts produce 50% more hashrate, and that IS difficulty growth. So upgrading is not a
// gain, it is the cost of staying level: a miner who re-equips on schedule roughly holds
// their share of the network, and one who replaces like for like loses it.
//
// Two rules follow, and they are enforced in code rather than described in comments:
//   Rule 1  efficiency is never free -- better J/TH must cost more $/TH
//   Rule 2  difficulty growth must be at least the efficiency improvement rate
//
// The regression that the disabled path is untouched lives in calc-batch-refactor.test.js,
// which compares against a frozen pre-feature engine. This file tests that the feature, once
// switched on, does what it claims.

var path = require('path');
var CalcEngine = require(path.join(__dirname, '..', 'calc-engine.js'));

var pass = 0, fail = 0;
function eq(label, actual, expected) {
    if (actual === expected) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + '\n        expected ' + JSON.stringify(expected) +
                               '\n        actual   ' + JSON.stringify(actual)); }
}
function ok(label, cond, note) { eq(label + (note ? '  (' + note + ')' : ''), !!cond, true); }
function near(label, actual, expected, tol) {
    if (Math.abs(actual - expected) <= tol) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + '\n        expected ' + expected +
                               ' +/- ' + tol + '\n        actual   ' + actual); }
}

/* Original machine: 234 TH at 3.51 kW = 15.0 J/TH, $2,400 = $10.26/TH.
   Lifespan 12 months so a replacement event lands inside a short horizon. */
var BASE = {
    btcPrice: 78200, priceChange: 2, difficulty: 125.81, diffChange: 1.35,
    periodLength: 'monthly', investPeriod: 30,
    hashrate: 234, power: 3.51, capex: 2400, machineCount: 45,
    minerLifespan: 12, salvageValue: 10, autoReplace: true,
    elecCost: 0.06, poolFee: 2.5, uptime: 100, hodlRatio: 100,
    minerAdditions: 0, reinvest: false, coverElec: false, taxAdjustment: false,
    infrastructureCost: 0, btcTreasury: 0, startDate: '2026-08-29'
};
function run(over) {
    var s = {}; for (var k in BASE) s[k] = BASE[k];
    for (var k2 in (over || {})) s[k2] = over[k2];
    return CalcEngine.computeProjection(s);
}
function firstEvent(r) {
    for (var i = 0; i < r.tableRows.length; i++) {
        if (r.tableRows[i].retiredThisPeriod > 0) return r.tableRows[i];
    }
    return null;
}
// S21+ Hyd class: 395 TH at 5.925 kW = 15.0 J/TH, $4,500 = $11.39/TH
var BIGGER = { replacementEnabled: true, replacementHashrate: 395,
               replacementPower: 5.925, replacementCapex: 4500 };

// ---- 1. sizing ------------------------------------------------------------------------------

console.log('\n=== replacement sizing ===');
(function () {
    var targetKw = 45 * 3.51;                       // 157.95 kW, computed from inputs
    ok('the fixture retires a full fleet', firstEvent(run()).retiredThisPeriod === 45);

    var sc = firstEvent(run(Object.assign({}, BIGGER, { replacementSizing: 'same_count' })));
    eq('same_count replaces one for one', sc.replacedThisPeriod, 45);

    /* THE ARITHMETIC FROM THE SPEC. 45 x 3.51 = 157.95 kW; 5.925 kW machines fill that 26
       deep. 27 would draw 159.98 kW against a 157.95 target, so floor() and never round(). */
    var sp = firstEvent(run(Object.assign({}, BIGGER, { replacementSizing: 'same_power' })));
    eq('same_power fills the retiring draw and floors', sp.replacedThisPeriod,
       Math.floor(targetKw / 5.925));
    eq('  which is 26, not 27', sp.replacedThisPeriod, 26);
    ok('  and 27 would have overdrawn it', 27 * 5.925 > targetKw,
       (27 * 5.925).toFixed(2) + ' kW against ' + targetKw.toFixed(2));
    ok('  so the new draw is under the old', sp.fleetPowerKW <= targetKw + 1e-9,
       sp.fleetPowerKW.toFixed(2) + ' kW');

    /* same_capital: budget is the retiring fleet's salvage plus whatever is injected.
       45 x $2,400 x 10% = $10,800, which buys two $4,500 machines. */
    var cap = firstEvent(run(Object.assign({}, BIGGER, { replacementSizing: 'same_capital' })));
    eq('same_capital spends the salvage', cap.replacedThisPeriod,
       Math.floor((45 * 2400 * 0.10) / 4500));
    var withCash = firstEvent(run(Object.assign({}, BIGGER,
        { replacementSizing: 'same_capital', additionalReplacementCapital: 90000 })));
    eq('and additional capital buys more', withCash.replacedThisPeriod,
       Math.floor((45 * 2400 * 0.10 + 90000) / 4500));
    eq('additional capital defaults to zero',
       CalcEngine.normalise({}).additionalReplacementCapital, 0);
})();

// ---- 2. salvage and the cash line ------------------------------------------------------------

console.log('\n=== salvage is priced on the machine that retired ===');
(function () {
    var ev = firstEvent(run(Object.assign({}, BIGGER, { replacementSizing: 'same_count' })));
    /* $2,400 is the ORIGINAL machine. If salvage were read off the replacement's $4,500 this
       would be $20,250 instead -- the exact defect the batch capex field exists to prevent. */
    near('salvage is 10% of the RETIRING machine cost', ev.salvageCredited, 45 * 2400 * 0.10, 0.01);
    ok('  and not of the replacement cost', Math.abs(ev.salvageCredited - 45 * 4500 * 0.10) > 1,
       'would be $' + (45 * 4500 * 0.10).toLocaleString());

    near('spend is the new count at the new price', ev.replacementSpend, 45 * 4500, 0.01);
    near('net outlay is spend minus gross salvage',
         ev.replacementNetOutlay, 45 * 4500 - 45 * 2400 * 0.10, 0.01);
    ok('gross and net are different numbers, which is why both are reported',
       Math.abs(ev.replacementSpend - ev.replacementNetOutlay) > 1);

    /* THE ASSERTION THAT ACTUALLY BITES, and it was missing on the first pass.
       At the FIRST retirement the machines going out are the originals, so batch.capex and
       p.capex are both $2,400 and reading the wrong one is invisible -- a mutation reverting
       the fix passed every check above. The fix only shows when a REPLACEMENT batch retires:
       at period 25 the $4,500 machines bought in period 13 reach end of life, and their
       salvage must be priced at $4,500, not at whatever is in the capex box. */
    var evs = run(Object.assign({}, BIGGER, { replacementSizing: 'same_count' }))
        .tableRows.filter(function (t) { return t.retiredThisPeriod > 0; });
    ok('the horizon contains a SECOND retirement, of replacement machines', evs.length >= 2,
       evs.length + ' retirement events');
    near('replacement machines salvage at THEIR price, not the original capex',
         evs[1].salvageCredited, 45 * 4500 * 0.10, 0.01);
    ok('  which is a different number from the first event',
       Math.abs(evs[1].salvageCredited - evs[0].salvageCredited) > 1,
       '$' + Math.round(evs[0].salvageCredited).toLocaleString() + ' then $' +
       Math.round(evs[1].salvageCredited).toLocaleString());

    /* Under same_power the counts differ too, so the old single-capex expression could not
       have expressed this at all. */
    var sp = firstEvent(run(Object.assign({}, BIGGER, { replacementSizing: 'same_power' })));
    near('under same_power the spend follows the NEW count', sp.replacementSpend, 26 * 4500, 0.01);
    near('while salvage still follows the OLD count', sp.salvageCredited, 45 * 2400 * 0.10, 0.01);
})();

// ---- 3. guard rails --------------------------------------------------------------------------

console.log('\n=== rule 1: efficiency is never free ===');
(function () {
    /* From the spec: 473 TH / 5.676 kW replacing 395 TH / 5.925 kW at the same CAPEX.
       J/TH improves 15 -> 12 while $/TH FALLS. That contradicts every observed generation. */
    var v = run({ hashrate: 395, power: 5.925, capex: 4500, replacementEnabled: true,
                  replacementHashrate: 473, replacementPower: 5.676, replacementCapex: 4500 });
    near('  original is 15 J/TH', v.replacementOriginalJTH, 15.0, 0.05);
    near('  replacement is 12 J/TH', v.replacementNewJTH, 12.0, 0.05);
    ok('  and $/TH went DOWN, which is the violation',
       v.replacementNewUsdPerTH < v.replacementOriginalUsdPerTH,
       '$' + v.replacementOriginalUsdPerTH.toFixed(2) + ' -> $' + v.replacementNewUsdPerTH.toFixed(2));
    eq('rule 1 fires', v.rule1Violated, true);

    // Same efficiency gain at real S21 XP Hyd pricing ($14.59/TH) must NOT fire.
    var okCase = run({ hashrate: 395, power: 5.925, capex: 4500, replacementEnabled: true,
                       replacementHashrate: 473, replacementPower: 5.676, replacementCapex: 6900 });
    eq('and stays quiet when the premium is real', okCase.rule1Violated, false);

    // Equal $/TH is still a violation: efficiency was obtained for nothing.
    var flat = run({ hashrate: 400, power: 6, capex: 4000, replacementEnabled: true,
                     replacementHashrate: 400, replacementPower: 4, replacementCapex: 4000 });
    eq('equal $/TH with better J/TH also fires', flat.rule1Violated, true);

    eq('disabled means no opinion', run({}).rule1Violated, false);
})();

console.log('\n=== rule 2: difficulty must keep up with the fleet ===');
(function () {
    /* Difficulty 2%/yr against a replacement implying ~15%/yr efficiency improvement. */
    var monthlyFor2pcYear = (Math.pow(1.02, 1 / 12) - 1) * 100;
    var v = run({ diffChange: monthlyFor2pcYear, replacementEnabled: true,
                  replacementHashrate: 234, replacementPower: 2.98, replacementCapex: 6000 });
    ok('  efficiency improvement exceeds difficulty growth',
       v.replacementEfficiencyAnnualPct > v.difficultyAnnualPct,
       v.replacementEfficiencyAnnualPct.toFixed(1) + '%/yr vs ' + v.difficultyAnnualPct.toFixed(1) + '%/yr');
    eq('rule 2 fires', v.rule2Violated, true);
    near('  and difficulty annualises correctly', v.difficultyAnnualPct, 2.0, 0.01);

    // Difficulty comfortably ahead of the hardware: no complaint.
    var okCase = run({ diffChange: 3, replacementEnabled: true, replacementHashrate: 240,
                       replacementPower: 3.5, replacementCapex: 3000 });
    eq('and stays quiet when difficulty outpaces hardware', okCase.rule2Violated, false);

    /* Replacing like for like is a 0% improvement, so it can never trip Rule 2 however low
       difficulty growth is set. */
    var same = run({ diffChange: 0, replacementEnabled: true, replacementHashrate: 234,
                     replacementPower: 3.51, replacementCapex: 2400 });
    eq('identical hardware never trips it', same.rule2Violated, false);
})();

// ---- 4. the site ceiling ----------------------------------------------------------------------

console.log('\n=== a replacement never overdraws the site ===');
(function () {
    var r = run(Object.assign({}, BIGGER, { replacementSizing: 'same_count', siteKw: 160 }));
    var ev = firstEvent(r);
    ok('same_count wanted 45', 45 * 5.925 > 160, 'which would draw ' + (45 * 5.925).toFixed(1) + ' kW');
    ok('  so it was capped', ev.replacementClamped === true);
    ok('  below the ceiling', ev.fleetPowerKW <= 160 + 1e-9, ev.fleetPowerKW.toFixed(2) + ' kW');
    eq('  and the result flags it', r.replacementWasClamped, true);
    eq('  buying 27, the most that fits', ev.replacedThisPeriod, Math.floor(160 / 5.925));

    var free = run(Object.assign({}, BIGGER, { replacementSizing: 'same_power' }));
    eq('no ceiling set means no clamp', free.replacementWasClamped, false);
})();

// ---- 5. directional sanity --------------------------------------------------------------------

console.log('\n=== a better machine at a real premium ===');
(function () {
    // 15 J/TH -> 12 J/TH, $10.26/TH -> $14.59/TH, filling the same power envelope.
    var base = run();
    var up = run({ replacementEnabled: true, replacementSizing: 'same_power',
                   replacementHashrate: 473, replacementPower: 5.676, replacementCapex: 6900 });
    var b = base.tableRows[base.tableRows.length - 1], u = up.tableRows[up.tableRows.length - 1];

    ok('hashrate rises', u.fleetHashrateTH > b.fleetHashrateTH,
       b.fleetHashrateTH.toFixed(0) + ' -> ' + u.fleetHashrateTH.toFixed(0) + ' TH');
    ok('  while the power bill does not', u.fleetPowerKW <= b.fleetPowerKW + 1e-9,
       b.fleetPowerKW.toFixed(1) + ' -> ' + u.fleetPowerKW.toFixed(1) + ' kW');
    ok('  and more BTC is mined', up.cumulBtcMined > base.cumulBtcMined);

    /* THE CAPEX CHECK. If profit rose in proportion to hashrate, the premium is not being
       charged anywhere. It must move by strictly less. */
    var hashGain = u.fleetHashrateTH / b.fleetHashrateTH - 1;
    var plGain = (up.totalPL - base.totalPL) / Math.abs(base.totalPL);
    ok('profit moves by LESS than the hashrate gain, so the premium is charged',
       plGain < hashGain, 'hashrate +' + (hashGain * 100).toFixed(1) +
       '% against profit ' + (plGain * 100).toFixed(1) + '%');
})();

// ---- 6. the reinvest generation boundary --------------------------------------------------------

console.log('\n=== reinvest buys the generation that is current ===');
(function () {
    var r = run({ reinvest: true, hodlRatio: 0, investPeriod: 30,
                  replacementEnabled: true, replacementSizing: 'same_count',
                  replacementHashrate: 395, replacementPower: 5.925, replacementCapex: 4500 });
    var firstRepl = -1;
    for (var i = 0; i < r.tableRows.length; i++) {
        if (r.tableRows[i].replacedThisPeriod > 0) { firstRepl = i; break; }
    }
    ok('a replacement happens inside the horizon', firstRepl >= 0, 'period ' + (firstRepl + 1));

    var beforeWrong = r.tableRows.slice(0, firstRepl)
        .filter(function (t) { return t.boughtReplacementSpec; });
    var afterWrong = r.tableRows.slice(firstRepl)
        .filter(function (t) { return !t.boughtReplacementSpec; });
    eq('every period BEFORE it buys the original spec', beforeWrong.length, 0);
    eq('every period FROM it on buys the replacement spec', afterWrong.length, 0);
    ok('and the period detail reports which was bought',
       'boughtReplacementSpec' in r.tableRows[0]);

    // With the feature off, nothing ever claims to buy a replacement generation.
    var off = run({ reinvest: true, hodlRatio: 0 });
    eq('disabled never reports a replacement-spec purchase',
       off.tableRows.filter(function (t) { return t.boughtReplacementSpec; }).length, 0);
})();

// ---- 7. the derived replacement price -----------------------------------------------------------
//
// $/TH tracks HASHPRICE, not efficiency. Over six years efficiency roughly doubled while $/TH
// fell about three quarters, and December 2025 is the clean demonstration: Bitmain cut to
// $3-4/TH because hashprice had fallen, not because the machines changed.

console.log('\n=== replacement cost derives from the hashprice projection ===');
(function () {
    var S = { btcPrice: 78200, priceChange: 2, difficulty: 125.81, diffChange: 2,
              periodLength: 'monthly', investPeriod: 60, hashrate: 395, power: 5.925,
              capex: 2600, machineCount: 45, minerLifespan: 48, salvageValue: 10,
              autoReplace: true, elecCost: 0.06, poolFee: 2.5, uptime: 100, hodlRatio: 100,
              startDate: '2026-08-29' };

    /* THE CORRECTED WORKED EXAMPLE. The spec originally said hashprice was flat to month 48
       under 2%/2% and the replacement came out at $3,250. It is not flat: price and difficulty
       cancel, but the April 2028 halving lands at month ~21 and halves the subsidy with
       nothing offsetting it. Ratio is 0.500, and the replacement is CHEAP -- which is the
       model working, and exactly what happened in December 2025. */
    var h0 = CalcEngine.hashpriceAtPeriod(S, 0);
    var h48 = CalcEngine.hashpriceAtPeriod(S, 48);
    near('hashprice at month 49 is HALF the opening, not equal to it', h48 / h0, 0.500, 0.001);
    ok('  and the horizon really does span a halving',
       CalcEngine.computeProjection(S).tableRows.some(function (t) { return t.isHalving; }));

    var d = CalcEngine.deriveReplacement({ hashrateTH: 395, powerKW: 5.925, capex: 2600,
                                           replacementJTH: 12, hashpriceRatio: h48 / h0 });
    near('5,925W / 12 J/TH = 493.75 TH', d.hashrateTH, 5925 / 12, 1e-9);
    near('current $/TH is capex over hashrate', d.currentPerTH, 2600 / 395, 1e-9);
    near('derived capex is $1,625, NOT the $3,250 the flat-hashprice reading gave',
         d.capex, 1625, 1);
    ok('  and $3,250 is what you would get if the halving were ignored',
       Math.abs((5925 / 12) * (2600 / 395) - 3250) < 1);

    /* Same power envelope by default: the efficiency gain shows up entirely as hashrate. */
    near('power is unchanged unless the user changes it', d.powerKW, 5.925, 1e-9);

    // NO-OP: efficiency equal to the original must reproduce the original machine exactly.
    var same = CalcEngine.deriveReplacement({ hashrateTH: 395, powerKW: 5.925, capex: 2600,
                                              replacementJTH: (5.925 * 1000) / 395,
                                              hashpriceRatio: 1 });
    near('identical efficiency at ratio 1 reproduces the original hashrate', same.hashrateTH, 395, 1e-9);
    near('  and the original capex', same.capex, 2600, 1e-9);

    /* HASHPRICE SENSITIVITY -- the edges the spec says a static curve cannot get right. */
    var bull = CalcEngine.hashpriceAtPeriod(Object.assign({}, S, { priceChange: 5 }), 48) /
               CalcEngine.hashpriceAtPeriod(Object.assign({}, S, { priceChange: 5 }), 0);
    ok('bull case: price outruns difficulty, replacement hardware gets EXPENSIVE',
       bull > h48 / h0, 'ratio ' + bull.toFixed(3) + ' against ' + (h48 / h0).toFixed(3));
    var flatBtc = CalcEngine.hashpriceAtPeriod(Object.assign({}, S, { priceChange: 0 }), 48) /
                  CalcEngine.hashpriceAtPeriod(Object.assign({}, S, { priceChange: 0 }), 0);
    ok('flat BTC across a halving: replacement hardware gets CHEAP',
       flatBtc < h48 / h0, 'ratio ' + flatBtc.toFixed(3));
    ok('  and cheaper still than the 2%/2% case', flatBtc < 0.5);

    /* GROSS, not net. Two operators with different uptimes and pools bid in the same hardware
       market, so hashprice must not carry either. */
    var netted = Object.assign({}, S, { uptime: 50, poolFee: 10 });
    near('hashprice ignores uptime and pool fee',
         CalcEngine.hashpriceAtPeriod(netted, 0), h0, 1e-12);

    /* Beyond the modelled horizon: a machine retiring in month 48 of a 36-month projection
       still has a price, and the field must not go blank. */
    var shortRun = Object.assign({}, S, { investPeriod: 36 });
    ok('hashprice is available past the end of the table',
       CalcEngine.hashpriceAtPeriod(shortRun, 48) > 0);
})();

console.log('');
console.log(fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                       : pass + ' passed, ' + fail + ' FAILED');
process.exit(fail === 0 ? 0 : 1);
