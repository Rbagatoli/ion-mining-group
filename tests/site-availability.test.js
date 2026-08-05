// Tests for site-availability.js and the uptime/take-or-pay changes in site-engine.js.
//
// The load-bearing assertion in here is the FIRST group: at the default 100% uptime the engine
// must reproduce its previous numbers exactly. The uptime derate is a correction to a real
// asymmetry, not a re-pricing, and if it moves the default path it has broken something.

var path = require('path');
var SA = require(path.join(__dirname, '..', 'site-availability.js'));
var SiteEngine = require(path.join(__dirname, '..', 'site-engine.js'));

var pass = 0, fail = 0;
function eq(label, actual, expected) {
    var ok = (actual === expected) ||
             (typeof actual === 'number' && typeof expected === 'number' &&
              isFinite(actual) && isFinite(expected) && Math.abs(actual - expected) < 1e-9);
    if (ok) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + '\n        expected ' + JSON.stringify(expected) +
                               '\n        actual   ' + JSON.stringify(actual)); }
}
function ok(label, cond) { eq(label, !!cond, true); }

// ---- Fixtures ------------------------------------------------------------------------------

function facility(over) {
    var d = {
        primeMover: 'IC',
        capacityFactorCurrent: 0.20,
        capacityFactorBaseline: 0.22,
        dutyBasis: 'measured'
    };
    for (var k in (over && over.detail) || {}) d[k] = over.detail[k];
    return {
        source: 'eia-facility',
        dutyCyclePct: (over && 'duty' in over) ? over.duty : 20,
        sourceDetail: d
    };
}

function site(over) {
    var s = {
        nameplate_kw: 2000,
        usable_kw: 2000,
        purchase_price_usd: 500000,
        power_rate: 0.035,
        power_rate_currency: 'USD'
    };
    for (var k in over || {}) s[k] = over[k];
    return s;
}
var MARKET = { btcPriceUsd: 95000, networkHashratePh: 900000, blockRewardBtc: 3.125 };

// ---- 1. The default path must not move ------------------------------------------------------

console.log('\n=== uptime 100 reproduces the previous numbers exactly ===');
(function() {
    var base = SiteEngine.evaluate(site(), MARKET);
    // monthly_power_full is the pre-change formula. At 100% uptime the billed figure must equal
    // it to the last bit, or the derate has leaked into the default.
    eq('billed power equals full power', base.monthly_power_usd, base.monthly_power_full);
    eq('cash cost equals full power when no O&M', base.monthly_cash_usd, base.monthly_power_full);
    ok('payback is a real number', base.payback_months !== null && base.payback_months > 0);
    // Explicitly passing 100 must be identical to defaulting.
    var explicit = SiteEngine.evaluate(site(), MARKET, { uptimePct: 100 });
    eq('explicit 100 matches the default', explicit.monthly_cash_usd, base.monthly_cash_usd);
    eq('...and so does payback', explicit.payback_months, base.payback_months);
})();

// ---- 2. The derate applies to BOTH sides ----------------------------------------------------

console.log('\n=== a duty derate scales cost and production together ===');
(function() {
    var full = SiteEngine.evaluate(site(), MARKET);
    var derated = SiteEngine.evaluate(site(), MARKET, { uptimePct: 20 });

    eq('power billed scales with uptime', derated.monthly_power_usd, full.monthly_power_full * 0.20);
    eq('bitcoin mined scales with uptime', derated.monthly_btc, full.monthly_btc * 0.20);

    // The whole point of the fix: these two are RATIOS of quantities that both scale, so they
    // must not move. If they do, the derate is being applied to one side only.
    eq('cash cost per BTC is unchanged', derated.cash_cost_per_btc, full.cash_cost_per_btc);
    eq('breakeven BTC price is unchanged', derated.breakeven_btc_price, full.breakeven_btc_price);

    // Payback, by contrast, SHOULD move: capital is unchanged while monthly net shrinks.
    ok('payback still exists', derated.payback_months !== null);
    ok('payback lengthens by roughly 1/duty',
       Math.abs(derated.payback_months / full.payback_months - 5) < 0.001);

    // The pre-fix behaviour, asserted so a regression is unmistakable: billing 720 hours against
    // 144 hours of hashing drives net negative and nulls payback.
    //
    // Revenue is 3.76x the full power bill on this fixture, so the old model went negative below
    // roughly 27% duty. The median duty across the 9,765 facilities is 20% — that is why this was
    // a blocker for the whole feature rather than an edge case.
    var asymmetric = full.monthly_btc * 0.20 * MARKET.btcPriceUsd - full.monthly_power_full;
    ok('the old asymmetry would have gone net-negative', asymmetric < 0);
    ok('...and the fix does not', derated.monthly_net > 0);
})();

// ---- 3. Take-or-pay is a floor --------------------------------------------------------------

console.log('\n=== take-or-pay floors the bill ===');
(function() {
    var full = SiteEngine.evaluate(site(), MARKET);

    // Floor above the derated usage: it binds.
    var floored = SiteEngine.evaluate(site({ take_or_pay_pct: 60 }), MARKET, { uptimePct: 20 });
    eq('the floor binds when it exceeds usage', floored.monthly_power_usd, full.monthly_power_full * 0.60);

    // Floor below the derated usage: inert.
    var loose = SiteEngine.evaluate(site({ take_or_pay_pct: 10 }), MARKET, { uptimePct: 20 });
    eq('a floor below usage does not bind', loose.monthly_power_usd, full.monthly_power_full * 0.20);

    // Null (every prospect today): completely inert.
    var none = SiteEngine.evaluate(site({ take_or_pay_pct: null }), MARKET, { uptimePct: 20 });
    eq('a null floor is inert', none.monthly_power_usd, full.monthly_power_full * 0.20);
    eq('and reports no floor', none.take_or_pay_floor, null);

    // A floor at 100% reproduces the OLD behaviour exactly — which is the honest statement that
    // the previous model was right for a full take-or-pay contract and wrong for ownership.
    var total = SiteEngine.evaluate(site({ take_or_pay_pct: 100 }), MARKET, { uptimePct: 20 });
    eq('a 100% floor reproduces the pre-fix bill', total.monthly_power_usd, full.monthly_power_full);
})();

// ---- 4. Capacity type ------------------------------------------------------------------------

console.log('\n=== physically capped vs dispatch limited ===');
(function() {
    eq('solar is capped', SA.capacityType(facility({ detail: { primeMover: 'PV' } })), 'physically_capped');
    eq('wind is capped', SA.capacityType(facility({ detail: { primeMover: 'WT' } })), 'physically_capped');
    eq('hydro is capped', SA.capacityType(facility({ detail: { primeMover: 'HY' } })), 'physically_capped');
    eq('batteries are capped', SA.capacityType(facility({ detail: { primeMover: 'BA' } })), 'physically_capped');
    eq('reciprocating engines are dispatchable',
       SA.capacityType(facility({ detail: { primeMover: 'IC' } })), 'dispatch_limited');
    eq('combustion turbines are dispatchable',
       SA.capacityType(facility({ detail: { primeMover: 'GT' } })), 'dispatch_limited');
    eq('steam turbines are dispatchable',
       SA.capacityType(facility({ detail: { primeMover: 'ST' } })), 'dispatch_limited');
    eq('lower case is handled', SA.capacityType(facility({ detail: { primeMover: 'pv' } })), 'physically_capped');
    // Never guess. An unknown prime mover has not been shown to be dispatchable, and saying it is
    // would manufacture the "your load could raise this" thesis out of nothing.
    eq('an unknown prime mover is null', SA.capacityType(facility({ detail: { primeMover: null } })), null);
    eq('a missing prime mover is null', SA.capacityType({ source: 'eia-facility', sourceDetail: {} }), null);
    eq('a null candidate is null', SA.capacityType(null), null);

    // The two theses read oppositely, and the note must say so.
    var capped = SA.evaluate(facility({ detail: { primeMover: 'PV' } }));
    var disp = SA.evaluate(facility({ detail: { primeMover: 'IC' } }));
    ok('a capped site says load cannot raise it', capped.note.indexOf('cannot raise') >= 0);
    ok('a dispatchable site says floor', disp.note.indexOf('floor') >= 0);
    ok('and admits fuel supply is unmeasured', disp.note.indexOf('unmeasured') >= 0);
})();

// ---- 5. Basis and priceability ---------------------------------------------------------------

console.log('\n=== a duty is only priced when the evidence supports it ===');
(function() {
    var measured = facility({ detail: { dutyBasis: 'measured' } });
    eq('measured basis', SA.basis(measured), 'measured');
    ok('measured is priceable', SA.priceable(measured));
    eq('measured duty survives', SA.dutyPct(measured), 20);

    // The technology lookup: true of solar in general, silent about THIS array.
    var typical = facility({ duty: 25, detail: { dutyBasis: 'typical', primeMover: 'PV',
                                                 capacityFactorCurrent: null, capacityFactorBaseline: null } });
    eq('typical basis', SA.basis(typical), 'typical');
    ok('typical is NOT priceable', !SA.priceable(typical));
    eq('but the number is still reported for display', SA.dutyPct(typical), 25);
    eq('and the engine is handed the neutral default', SA.evaluate(typical).uptimePct, 100);
    ok('the note says it was not measured here', SA.evaluate(typical).note.indexOf('not measured') >= 0);

    // The masked null. normalize() turns an unknown duty into 100, the most favourable value
    // available; this must not be read as "runs continuously".
    var unknown = facility({ duty: 100, detail: { dutyBasis: 'unknown',
                                                  capacityFactorCurrent: null, capacityFactorBaseline: null } });
    eq('unknown basis', SA.basis(unknown), 'unknown');
    ok('unknown is NOT priceable', !SA.priceable(unknown));
    eq('a masked null reports null, not 100', SA.dutyPct(unknown), null);
    eq('hours are null too', SA.evaluate(unknown).hoursPerMonth, null);
    ok('the note says unmeasured', SA.evaluate(unknown).note.indexOf('unmeasured') >= 0);

    // Source-level constants are explicit modelling assumptions, no weaker than the heat rate.
    var flare = { source: 'flare-viirs', dutyCyclePct: 100, sourceDetail: {} };
    var lfg = { source: 'lmop-landfill', dutyCyclePct: 92, sourceDetail: {} };
    eq('flares declare their duty', SA.basis(flare), 'declared');
    eq('landfills declare theirs', SA.basis(lfg), 'declared');
    ok('declared is priceable', SA.priceable(flare) && SA.priceable(lfg));
    eq('a 100% declared duty leaves the engine at its default', SA.evaluate(flare).uptimePct, 100);
    eq('a 92% declared duty derates', SA.evaluate(lfg).uptimePct, 92);

    // Inference fallback for an adapter that stamps no basis.
    var noStamp = { source: 'eia-facility', dutyCyclePct: 30,
                    sourceDetail: { capacityFactorCurrent: 0.30 } };
    eq('basis is inferred from the capacity factor', SA.basis(noStamp), 'measured');
    var noStampNoCf = { source: 'eia-facility', dutyCyclePct: 100, sourceDetail: {} };
    eq('no capacity factor infers unknown', SA.basis(noStampNoCf), 'unknown');
})();

// ---- 6. Clamping and degenerate input --------------------------------------------------------

console.log('\n=== degenerate input ===');
(function() {
    eq('null candidate has unknown basis', SA.basis(null), 'unknown');
    eq('null candidate has null duty', SA.dutyPct(null), null);
    ok('null candidate is not priceable', !SA.priceable(null));
    eq('null candidate still evaluates', SA.evaluate(null).uptimePct, 100);

    eq('a duty above 100 is clamped', SA.dutyPct(facility({ duty: 350 })), 100);
    eq('a negative duty is clamped to zero', SA.dutyPct(facility({ duty: -5 })), 0);
    eq('a non-numeric duty is null', SA.dutyPct(facility({ duty: 'lots' })), null);
    // A genuine zero must survive as zero, not be swallowed as falsy — the same bug class
    // site-engine.js documents in its numOrNull helper.
    eq('a genuine zero survives', SA.dutyPct(facility({ duty: 0 })), 0);
    eq('hours at zero duty are zero', SA.evaluate(facility({ duty: 0 })).hoursPerMonth, 0);
    eq('hours at 20% duty', SA.evaluate(facility({ duty: 20 })).hoursPerMonth, 144);
    eq('hours at 100% duty', SA.evaluate(facility({ duty: 100 })).hoursPerMonth, 720);
})();

console.log('');
console.log(fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                       : pass + ' passed, ' + fail + ' FAILED');
process.exit(fail === 0 ? 0 : 1);
