// The pre-tax deployment basis: what each side of the comparison is funded with.
//
// THE ASYMMETRY BEING MODELLED. Mining equipment takes 100% bonus depreciation -- permanently
// restored under OBBBA for property acquired after 19 January 2025. Bitcoin does not: buying it
// is a capital asset purchase with no deduction. So a dollar of pre-tax income buys a FULL
// dollar of miners but only a post-tax dollar of coins.
//
// WHY THE DEFAULT MOVED. Leaving this off made the tax toggle actively misleading. On one
// scenario, turning tax on took mining's advantage from -$90,883 to -$372,492, because the
// mining side was charged income tax while the benchmark was handed the whole pre-tax sum to
// buy coins with and charged nothing for the privilege. With it on the same scenario reads
// +$492,766. A default should not be quietly deciding which side wins.
//
// It stays a TOGGLE rather than becoming unconditional, because deploying income you have not
// been taxed on is genuinely different from deploying savings you paid tax on years ago. In the
// second case both sides do start from the same figure.

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

/* $1,000,000 of pre-tax capital, all of it machines, so the worked example is not entangled
   with infrastructure eligibility. */
var M = {
    btcPrice: 78200, priceChange: 2, difficulty: 125.81, diffChange: 1.35,
    periodLength: 'monthly', investPeriod: 60, hashrate: 395, power: 5.925,
    capex: 10000, machineCount: 100, infrastructureCost: 0,
    minerLifespan: 60, salvageValue: 0, autoReplace: false,
    elecCost: 0.045, poolFee: 2.5, uptime: 98, hodlRatio: 100,
    startDate: '2026-08-30', taxAdjustment: true, capitalGainsTaxRate: 15
};
function run(over) {
    var s = {}; for (var k in M) s[k] = M[k];
    for (var k2 in (over || {})) s[k2] = over[k2];
    return CalcEngine.computeProjection(s);
}

// ---- 1. the worked example -----------------------------------------------------------------

console.log('\n=== a pre-tax dollar buys a full dollar of miners ===');
(function () {
    /* At the SHIPPED 35% rate. The brief's $700,000 assumed 30% -- correct arithmetic for a
       rate this calculator does not default to, so the figure to pin is $650,000. */
    var r = run({ miningIncomeTaxRate: 35 });
    near('pre-tax capital is the whole outlay', r.totalInitialInvestment, 1000000, 0.01);
    near('all of it is deductible when there is no infrastructure', r.deductibleBasis, 1000000, 0.01);
    near('the shield is the rate on that basis', r.taxShieldValue, 350000, 0.01);
    near('so buy-and-hold is funded with $650,000 at 35%', r.buyHoldSpend, 650000, 0.01);
    near('  a 1.538x deployment advantage', r.deploymentRatio, 1000000 / 650000, 1e-9);

    var r30 = run({ miningIncomeTaxRate: 30 });
    near('and $700,000 at 30%, which is the brief’s figure at the brief’s rate',
         r30.buyHoldSpend, 700000, 0.01);
    near('  a 1.429x advantage', r30.deploymentRatio, 1000000 / 700000, 1e-9);

    ok('the benchmark holds fewer coins than the mining side deployed dollars for',
       r.buyHoldBtcAmount < 1000000 / M.btcPrice,
       r.buyHoldBtcAmount.toFixed(4) + ' BTC');
})();

// ---- 2. eligibility applies to infrastructure only -------------------------------------------

console.log('\n=== machines are equipment; infrastructure is the line that mixes ===');
(function () {
    // The landfill shape from the brief: $2.2M of miners, $2M of infrastructure.
    var L = { capex: 22000, machineCount: 100, infrastructureCost: 2000000,
              miningIncomeTaxRate: 35 };
    var full = run(Object.assign({}, L, { infraDepreciationEligiblePct: 100 }));
    var ninety = run(Object.assign({}, L, { infraDepreciationEligiblePct: 90 }));
    var half = run(Object.assign({}, L, { infraDepreciationEligiblePct: 50 }));

    near('at 100% the whole stack is deductible', full.deductibleBasis, 4200000, 0.01);
    near('at 90% only the infrastructure is discounted', ninety.deductibleBasis,
         2200000 + 2000000 * 0.90, 0.01);
    near('at 50% likewise', half.deductibleBasis, 2200000 + 2000000 * 0.50, 0.01);

    /* THE SHAPE THAT MATTERS. The machines must be fully counted at every setting -- a blended
       percentage across the whole stack would understate them to compensate for the
       infrastructure, which lands close on the total and is wrong about what is deductible. */
    [full, ninety, half].forEach(function (x, i) {
        ok('machines stay fully eligible at setting ' + i, x.deductibleBasis >= 2200000,
           'basis $' + Math.round(x.deductibleBasis).toLocaleString());
    });
    ok('and eligibility genuinely moves the funded figure',
       half.buyHoldSpend > ninety.buyHoldSpend && ninety.buyHoldSpend > full.buyHoldSpend,
       '$' + Math.round(full.buyHoldSpend).toLocaleString() + ' / $' +
       Math.round(ninety.buyHoldSpend).toLocaleString() + ' / $' +
       Math.round(half.buyHoldSpend).toLocaleString());

    // With no infrastructure the percentage is inert, which is why the worked example is clean.
    var a = run({ infraDepreciationEligiblePct: 100, miningIncomeTaxRate: 35 });
    var b = run({ infraDepreciationEligiblePct: 10, miningIncomeTaxRate: 35 });
    eq('with no infrastructure the setting changes nothing', a.buyHoldSpend, b.buyHoldSpend);
})();

// ---- 3. the default, and the links it must not move --------------------------------------------

console.log('\n=== defaults on with tax, but an explicit off is honoured ===');
(function () {
    var absent = run({ miningIncomeTaxRate: 35 });
    var on = run({ miningIncomeTaxRate: 35, preTaxCapital: true });
    var off = run({ miningIncomeTaxRate: 35, preTaxCapital: false });

    eq('an absent flag now means ON', absent.buyHoldSpend, on.buyHoldSpend);
    eq('  which is the checkbox default, not a coincidence', absent.preTaxCapital, true);

    /* THE REGRESSION THE BRIEF ASKED FOR. A saved link carrying preTaxCapital=0 must produce
       exactly what it always did: both sides funded with the same figure. */
    near('an explicit false funds both sides equally', off.buyHoldSpend,
         off.totalInitialInvestment, 0.01);
    eq('  and reports no deployment advantage', off.taxShieldValue, 0);
    near('  ratio is 1.0', off.deploymentRatio, 1, 1e-9);
    ok('  which is a different projection from the default',
       Math.abs(off.miningAdvantage - on.miningAdvantage) > 1);

    // With the tax model off entirely, the flag is inert either way.
    var taxOff = run({ taxAdjustment: false });
    var taxOffFlagged = run({ taxAdjustment: false, preTaxCapital: true });
    eq('with no tax model the flag does nothing', taxOff.buyHoldSpend, taxOffFlagged.buyHoldSpend);
    eq('  and it is reported as off', taxOff.preTaxCapital, false);
})();

// ---- 4. rate sensitivity, and the direction the brief called the bug -----------------------------

console.log('\n=== a zero rate reproduces the old behaviour exactly ===');
(function () {
    /* The cleanest regression on the new path: at a 0% marginal rate there is nothing to
       shield, so both sides must deploy the same figure however the flag is set. */
    var zeroOn = run({ miningIncomeTaxRate: 0, preTaxCapital: true });
    var zeroOff = run({ miningIncomeTaxRate: 0, preTaxCapital: false });
    near('at a 0% rate the shield is nothing', zeroOn.taxShieldValue, 0, 1e-9);
    eq('  so both sides deploy the same dollar', zeroOn.buyHoldSpend, zeroOff.buyHoldSpend);
    eq('  and the whole projection is identical',
       JSON.stringify(zeroOn.series), JSON.stringify(zeroOff.series));

    /* DIRECTION. Turning tax on used to WIDEN mining's deficit, because the mining side paid
       income tax while the benchmark was handed the full pre-tax sum for free. */
    var noTax = run({ taxAdjustment: false });
    var taxedOld = run({ miningIncomeTaxRate: 35, preTaxCapital: false });
    var taxedNew = run({ miningIncomeTaxRate: 35 });
    ok('the old path widened the deficit when tax was turned on',
       taxedOld.miningAdvantage < noTax.miningAdvantage,
       Math.round(noTax.miningAdvantage) + ' -> ' + Math.round(taxedOld.miningAdvantage));
    ok('the new default does not', taxedNew.miningAdvantage > taxedOld.miningAdvantage,
       Math.round(taxedOld.miningAdvantage) + ' -> ' + Math.round(taxedNew.miningAdvantage));

    // A higher rate shields more, so the benchmark shrinks monotonically.
    var prev = Infinity;
    [0, 10, 20, 30, 35, 50].forEach(function (rate) {
        var x = run({ miningIncomeTaxRate: rate });
        ok('rate ' + rate + '% funds the benchmark with less than the rate below it',
           x.buyHoldSpend <= prev, '$' + Math.round(x.buyHoldSpend).toLocaleString());
        prev = x.buyHoldSpend;
    });
})();

// ---- 5. the section 461(l) note ------------------------------------------------------------------

console.log('\n=== the excess business loss note says something, never computes a limit ===');
(function () {
    var t = CalcEngine.computeProjection(M).excessBusinessLossThreshold;
    near('the threshold is the single-filer figure', t, 330000, 0.01);

    // $1,000,000 at 35% shields $350,000, which is over.
    var over = run({ miningIncomeTaxRate: 35 });
    ok('a shield above it fires the note', over.exceedsExcessBusinessLoss === true,
       'shield $' + Math.round(over.taxShieldValue).toLocaleString());

    // The same site at 30% shields $300,000, which is under.
    var under = run({ miningIncomeTaxRate: 30 });
    ok('a shield below it does not', under.exceedsExcessBusinessLoss === false,
       'shield $' + Math.round(under.taxShieldValue).toLocaleString());
    ok('  and the two straddle the threshold, so this is a real boundary',
       under.taxShieldValue < t && over.taxShieldValue > t);

    // Never fires when there is no shield to speak of.
    eq('no note when the flag is off',
       run({ miningIncomeTaxRate: 35, preTaxCapital: false }).exceedsExcessBusinessLoss, false);
    eq('no note when the tax model is off',
       run({ taxAdjustment: false }).exceedsExcessBusinessLoss, false);
})();

console.log('');
console.log(fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                       : pass + ' passed, ' + fail + ' FAILED');
process.exit(fail === 0 ? 0 : 1);
