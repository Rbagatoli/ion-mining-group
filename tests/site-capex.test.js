// Unit tests for the capital stack.
//
// The cases that matter are the ones where a capex model usually goes wrong quietly: pricing a
// facility as though it were greenfield, inventing a valuation for an asset nobody sells
// publicly, and — the reverse mistake — crediting an inheritance that has rusted away.
var path = require('path');
var ROOT = path.join(__dirname, '..');
global.Jurisdictions = require(path.join(ROOT, 'jurisdictions.js'));
global.SiteOpportunity = require(path.join(ROOT, 'site-opportunity.js'));
var SC = require(path.join(ROOT, 'site-capex.js'));

var pass = 0, fail = 0;
function ok(label, cond, extra) {
    if (cond) { pass++; return; }
    fail++;
    console.log('  FAIL  ' + label + (extra === undefined ? '' : '   -> ' + JSON.stringify(extra)));
}
function eq(label, actual, expected) {
    ok(label + '  (expected ' + JSON.stringify(expected) + ')', actual === expected, actual);
}
function near(label, actual, expected, tol) {
    ok(label + '  (expected ~' + expected + ')', actual !== null && Math.abs(actual - expected) <= (tol || 1), actual);
}
function comp(res, id) {
    var c = (res.components || []).filter(function (x) { return x.id === id; })[0];
    return c || null;
}
var NOW = '2026-08-05';

function rec(over) {
    var r = { id: 't', powerPotentialKw: 2000, energyType: 'grid_facility', sourceDetail: {} };
    for (var k in (over || {})) r[k] = over[k];
    return r;
}
function st(over, ctx) {
    var c = { capacityKw: 2000, minerCapexUsd: 1365600, asOf: NOW };
    for (var k in (ctx || {})) c[k] = ctx[k];
    return SC.stack(rec(over), c);
}

console.log('site-capex');
SC.reset();

// ---- A missing stage refuses to price, rather than assuming the earliest ----------------
(function () {
    var r = st({ development_stage: undefined });
    eq('no stage -> no stack', r.incurred_usd, null);
    ok('and it names what is missing', r.unknown_ids.indexOf('development_stage') >= 0, r.unknown_ids);
    eq('a null record prices nothing', SC.stack(null).incurred_usd, null);
    eq('a garbage record prices nothing', SC.stack('nonsense').incurred_usd, null);
    var noKw = SC.stack(rec({ development_stage: 'operating', powerPotentialKw: null }), { minerCapexUsd: 1 });
    ok('no capacity -> no stack', noKw.incurred_usd === null && noKw.unknown_ids.indexOf('capacity') >= 0, noKw.unknown_ids);
})();

// ---- The core claim: an operating plant costs less to take on than a greenfield build ----
(function () {
    var raw = st({ development_stage: 'raw_resource', energyType: 'flare_gas' });
    var op = st({ development_stage: 'operating' });

    ok('raw resource INCURS permitting', comp(raw, 'permitting_development').state, 'incurred');
    eq('an operating plant inherits permitting', comp(op, 'permitting_development').state, 'avoided');
    eq('an operating plant inherits interconnection', comp(op, 'interconnection').state, 'avoided');
    eq('an operating plant inherits commissioning', comp(op, 'commissioning').state, 'avoided');

    // Mining infrastructure is the component the old flat "Build $/kW" conflated with everything.
    eq('mining infrastructure is incurred at raw resource', comp(raw, 'mining_infrastructure').state, 'incurred');
    eq('and STILL incurred at operating — the plant has containers for nobody',
       comp(op, 'mining_infrastructure').state, 'incurred');
    eq('both pay the same mining buildout', comp(raw, 'mining_infrastructure').usd, comp(op, 'mining_infrastructure').usd);

    ok('an operating plant avoids real money', op.avoided_usd > 500000, op.avoided_usd);
    eq('avoided components are named', op.avoided_components.indexOf('permitting_development') >= 0, true);
})();

// ---- energized and operating are deliberately identical on capital ---------------------
(function () {
    var e = st({ development_stage: 'energized' });
    var o = st({ development_stage: 'operating' });
    // Acquisition price differs by stage; everything else must not.
    function nonAcq(r) { return r.incurred_usd - r.acquisition_usd; }
    eq('energized and operating have the same build-side capital', nonAcq(e), nonAcq(o));
    ok('but a running plant costs more to buy', o.acquisition_usd > e.acquisition_usd,
       { energized: e.acquisition_usd, operating: o.acquisition_usd });
})();

// ---- constructed still pays to recommission --------------------------------------------
(function () {
    var c = st({ development_stage: 'constructed', sourceDetail: { projectShutdownDate: '2025-01-01' } });
    eq('a built but idle plant inherits its permit', comp(c, 'permitting_development').state, 'avoided');
    eq('and its interconnection', comp(c, 'interconnection').state, 'avoided');
    eq('but it does NOT restart itself', comp(c, 'commissioning').state, 'incurred');
})();

// ---- Refurbishment: a fraction that decays, not a fabricated dollar figure --------------
(function () {
    function gen(dateStr) {
        var r = st({ development_stage: 'constructed', generator_ownership: 'client',
                     sourceDetail: { projectShutdownDate: dateStr } });
        return comp(r, 'generation_equipment');
    }
    var fresh = gen('2025-06-01');   // ~1 year
    var mid = gen('2019-01-01');     // ~7.5 years
    var ancient = gen('1995-01-01'); // ~31 years

    ok('a recently shut plant retains most of its generator', fresh.usd < mid.usd, { fresh: fresh.usd, mid: mid.usd });
    ok('an older one retains less', mid.usd < ancient.usd, { mid: mid.usd, ancient: ancient.usd });
    eq('a 31-year-old shutdown is priced as a full replacement',
       Math.round(ancient.usd), Math.round(SC.rates().generationPerKw * 2000));
    eq('and at that age the model stops claiming ANY inheritance', ancient.avoided_usd, undefined);

    // No shutdown date -> condition unknown -> cost unknown. Never a silent default.
    var undated = st({ development_stage: 'constructed', generator_ownership: 'client', sourceDetail: {} });
    eq('a shut plant with no date prices generation as unknown', comp(undated, 'generation_equipment').state, 'unknown');
    ok('and says so', undated.unknown_ids.indexOf('generation_equipment') >= 0, undated.unknown_ids);
    ok('which drags coverage below 100', undated.coverage < 100, undated.coverage);

    // The curve itself.
    eq('<=2 years retains 0.90', SC.refurbRetained(1), 0.90);
    eq('>20 years retains nothing', SC.refurbRetained(25), 0);
    eq('unknown age retains null', SC.refurbRetained(null), null);
})();

// ---- The generator-ownership gate that keeps the flare economics honest -----------------
(function () {
    var producerOwned = st({ development_stage: 'raw_resource', energyType: 'flare_gas',
                             generator_ownership: 'producer' });
    var selfOwned = st({ development_stage: 'raw_resource', energyType: 'flare_gas',
                         generator_ownership: 'client' });
    var g = comp(producerOwned, 'generation_equipment');
    eq('a producer-owned genset is not your capital', g.state, 'avoided');
    ok('and the reason says why', /owns the generator/.test(g.reason), g.reason);
    ok('owning it yourself costs real money', comp(selfOwned, 'generation_equipment').usd > 1000000,
       comp(selfOwned, 'generation_equipment').usd);

    // The regression this gate prevents: Ion's real Alberta deals price at ~$450/kW, and charging
    // generation unconditionally would assert those deals are impossible.
    // Site-side only: exclude miners and the acquisition price, because Ion's real ~$450/kW
    // quote is for the site buildout. It should now be $450/kW of mining infrastructure plus
    // permitting, which the old flat figure never priced separately.
    var mn = comp(producerOwned, 'miners').usd;
    var siteSide = (producerOwned.incurred_usd - mn - producerOwned.acquisition_usd) / 2000;
    ok('a producer-owned flare prices near the real quoted site cost', siteSide < 600, siteSide);
    ok('and above it only by explicit permitting', siteSide > 450, siteSide);
    eq('the producer owns the grid tie too', comp(producerOwned, 'interconnection').state, 'avoided');
    eq('and commissions their own generation', comp(producerOwned, 'commissioning').state, 'avoided');
    eq('the default for raw resource is producer-owned', SC.generationOwnership({}, 'raw_resource'), 'producer');
    eq('and client-owned once built', SC.generationOwnership({}, 'operating'), 'client');
})();

// ---- Acquisition price: assumed by stage, always overridable ----------------------------
(function () {
    var assumed = st({ development_stage: 'operating' });
    ok('an acquisition price is assumed when none is given', assumed.acquisition_assumed, true);
    ok('and the basis says it is an anchor, not a valuation',
       /order-of-magnitude anchor/.test(comp(assumed, 'site_acquisition').basis), comp(assumed, 'site_acquisition').basis);

    var real = st({ development_stage: 'operating' }, { acquisitionUsd: 1500000 });
    eq('a real figure wins', real.acquisition_usd, 1500000);
    eq('and is no longer flagged as assumed', real.acquisition_assumed, false);

    var fromRecord = st({ development_stage: 'operating', estimated_acquisition_cost: 900000 });
    eq('the record field is read too', fromRecord.acquisition_usd, 900000);

    // A genuine zero must survive as zero, not be coerced to null. Buying flare gas is a gas
    // purchase agreement, not an asset purchase.
    var raw = st({ development_stage: 'raw_resource', energyType: 'flare_gas' });
    eq('a raw flare has no acquisition price', raw.acquisition_usd, 0);
    eq('and that zero is a real answer, not missing data', comp(raw, 'site_acquisition').state, 'incurred');
})();

// ---- Gas treatment is gated on a published fact -----------------------------------------
(function () {
    var lfg = st({ development_stage: 'constructed', generator_ownership: 'client',
                   sourceDetail: { requiresGasTreatment: true, projectShutdownDate: '2024-01-01' } });
    eq('a landfill pays for gas treatment', comp(lfg, 'gas_treatment').state, 'incurred');

    var opLfg = st({ development_stage: 'operating', sourceDetail: { requiresGasTreatment: true } });
    eq('an operating one inherits the skid', comp(opLfg, 'gas_treatment').state, 'avoided');

    var flare = st({ development_stage: 'raw_resource', energyType: 'flare_gas' });
    var t = comp(flare, 'gas_treatment');
    eq('a flare is not charged for treatment', t.state, 'avoided');
    ok('but the reason points at the unknown rather than claiming none is needed',
       /H2S/.test(t.reason), t.reason);
})();

// ---- additional_usd must not double-count the acquisition ------------------------------
(function () {
    var r = st({ development_stage: 'operating' }, { acquisitionUsd: 1500000 });
    near('additional_usd excludes the acquisition price', r.incurred_usd - r.additional_usd, 1500000, 1);
    ok('and is still positive — mining buildout and miners remain', r.additional_usd > 0, r.additional_usd);
})();

// ---- Months to revenue ------------------------------------------------------------------
(function () {
    var raw = st({ development_stage: 'raw_resource' });
    var op = st({ development_stage: 'operating' });
    eq('developing raw resource takes 12-24 months', raw.months_to_revenue.min, 12);
    eq('an operating plant takes 2-4', op.months_to_revenue.min, 2);
    // Months to revenue must never increase as an asset gets further along.
    ok('time to revenue falls monotonically with stage', (function () {
        for (var i = 1; i < SC.STAGES.length; i++) {
            if (SC.MONTHS_TO_REVENUE[SC.STAGES[i]].min > SC.MONTHS_TO_REVENUE[SC.STAGES[i - 1]].min) return false;
        }
        return true;
    })(), SC.STAGES.map(function (s) { return s + ':' + SC.MONTHS_TO_REVENUE[s].min; }));
})();

// ---- Carrying cost ships unset ----------------------------------------------------------
(function () {
    SC.reset();
    var r = st({ development_stage: 'raw_resource' });
    eq('carrying cost is unknown by default', comp(r, 'carrying_cost').state, 'unknown');
    ok('and named as unknown', r.unknown_ids.indexOf('carrying_cost') >= 0, r.unknown_ids);

    SC.setSetting('annualCostOfCapital', 12);
    var withCoc = st({ development_stage: 'raw_resource' });
    eq('setting a rate prices it', comp(withCoc, 'carrying_cost').state, 'incurred');
    ok('and it raises total capital', withCoc.incurred_usd > r.incurred_usd,
       { without: r.incurred_usd, with: withCoc.incurred_usd });
    // A long dead period must cost more to carry than a short one.
    var opCoc = st({ development_stage: 'operating' });
    var rawCarry = comp(withCoc, 'carrying_cost').usd / withCoc.incurred_usd;
    var opCarry = comp(opCoc, 'carrying_cost').usd / opCoc.incurred_usd;
    ok('a 12-24 month wait carries more than a 2-4 month one', rawCarry > opCarry,
       { raw: rawCarry, operating: opCarry });
    SC.reset();
})();

// ---- Rates are settings ------------------------------------------------------------------
(function () {
    SC.reset();
    var before = st({ development_stage: 'raw_resource' }).incurred_usd;
    ok('rates are editable', SC.setRate('miningInfraPerKw', 600) === true);
    var after = st({ development_stage: 'raw_resource' }).incurred_usd;
    ok('and change the answer', after > before, { before: before, after: after });
    ok('rejects a negative rate', SC.setRate('miningInfraPerKw', -1) === false);
    ok('rejects an unknown rate id', SC.setRate('nope', 1) === false);
    ok('acquisition rates are editable per stage', SC.setAcquisitionRate('operating', 2000) === true);
    ok('rejects an unknown stage', SC.setAcquisitionRate('nope', 1) === false);
    SC.reset();
    eq('reset restores the mining rate', SC.rates().miningInfraPerKw, SC.DEFAULT_RATES.miningInfraPerKw);
    eq('and the acquisition rate', SC.acquisitionRates().operating, SC.DEFAULT_ACQUISITION_PER_KW.operating);
})();

// ---- The worked comparison the whole module exists for ----------------------------------
(function () {
    SC.reset();
    // Buy a 2 MW operating landfill plant for $1.5M...
    var buy = SC.stack(rec({
        development_stage: 'operating', energyType: 'landfill_gas',
        sourceDetail: { requiresGasTreatment: true }
    }), { capacityKw: 2000, minerCapexUsd: 1365600, acquisitionUsd: 1500000, asOf: NOW });

    // ...versus developing a 2 MW flare, where the producer owns the genset.
    var build = SC.stack(rec({
        development_stage: 'raw_resource', energyType: 'flare_gas', generator_ownership: 'producer'
    }), { capacityKw: 2000, minerCapexUsd: 1365600, asOf: NOW });

    console.log('        buy  an operating 2 MW LFG plant: $' + Math.round(buy.incurred_usd).toLocaleString('en-US') +
                '  (' + buy.months_to_revenue.min + '-' + buy.months_to_revenue.max + ' mo to revenue)');
    console.log('        build a 2 MW flare site:         $' + Math.round(build.incurred_usd).toLocaleString('en-US') +
                '  (' + build.months_to_revenue.min + '-' + build.months_to_revenue.max + ' mo to revenue)');
    console.log('        avoided by buying: $' + Math.round(buy.avoided_usd).toLocaleString('en-US'));

    ok('both price out', buy.incurred_usd > 0 && build.incurred_usd > 0);
    ok('buying costs more in capital', buy.incurred_usd > build.incurred_usd,
       { buy: buy.incurred_usd, build: build.incurred_usd });
    ok('but reaches revenue far sooner', buy.months_to_revenue.max < build.months_to_revenue.min,
       { buy: buy.months_to_revenue, build: build.months_to_revenue });
    ok('and the avoided cost is stated, not implied', buy.avoided_usd > 800000, buy.avoided_usd);
    // The comparison is only meaningful if the two are priced differently at all — the exact bug
    // this module fixes was that they were not.
    ok('the two strategies produce DIFFERENT capital stacks',
       Math.abs(buy.incurred_usd - build.incurred_usd) > 100000,
       { buy: buy.incurred_usd, build: build.incurred_usd });
})();

// ---- Structure ---------------------------------------------------------------------------
(function () {
    var r = st({ development_stage: 'operating' });
    ok('every component has an id, label and state',
       r.components.every(function (c) { return c.id && c.label && c.state; }));
    ok('every state is one of the three', r.components.every(function (c) {
        return ['incurred', 'avoided', 'unknown'].indexOf(c.state) >= 0;
    }));
    ok('incurred components carry a number', r.components.filter(function (c) { return c.state === 'incurred'; })
        .every(function (c) { return typeof c.usd === 'number' && isFinite(c.usd); }));
    ok('avoided components are zero', r.components.filter(function (c) { return c.state === 'avoided'; })
        .every(function (c) { return c.usd === 0; }));
    ok('unknown components are null', r.components.filter(function (c) { return c.state === 'unknown'; })
        .every(function (c) { return c.usd === null; }));
    ok('coverage is a percentage', r.coverage >= 0 && r.coverage <= 100, r.coverage);
    // Prototype-chain safety, the same hazard that NaN'd the opportunity score.
    ['toString', 'constructor', 'valueOf'].forEach(function (k) {
        var bad = st({ development_stage: k });
        eq('stage "' + k + '" prices nothing', bad.incurred_usd, null);
    });
})();

console.log(fail === 0 ? 'ALL PASS — ' + pass + ' assertions' : pass + ' passed, ' + fail + ' FAILED');
process.exit(fail === 0 ? 0 : 1);
