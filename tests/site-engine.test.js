// ===== Phase 1 test suite — site sourcing & evaluation =====
// Dependency-free, matching the repo's no-build/no-npm approach:  node tests/site-engine.test.js
//
// The centrepiece is the validation checkpoint: four real quoted sites whose correct answers
// are known independently. If those stop reproducing, the math is wrong.

var path = require('path');
var fs = require('fs');
var ROOT = path.join(__dirname, '..');

// localStorage shim so SiteData's persistence path is genuinely exercised rather than
// silently no-oping through its try/catch.
var _store = {};
global.localStorage = {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null; },
    setItem: function(k, v) { _store[k] = String(v); },
    removeItem: function(k) { delete _store[k]; }
};

var SiteEngine    = require(path.join(ROOT, 'site-engine.js'));
var SiteFlags     = require(path.join(ROOT, 'site-flags.js'));
var SiteScoring   = require(path.join(ROOT, 'site-scoring.js'));
/* BEFORE site-sources.js, because toSite() now derates the gross resource figure through it.
   Loaded rather than left out: without it toSite() reports usable_kw as null, which is the
   honest answer for a module that cannot compute it and a useless one to assert against. */
global.SiteCapacity = require(path.join(ROOT, 'site-capacity.js'));
var SiteSources   = require(path.join(ROOT, 'site-sources.js'));
var Jurisdictions = require(path.join(ROOT, 'jurisdictions.js'));
global.SiteSources = SiteSources;                       // SiteData.fromCandidate looks for it
var SiteData      = require(path.join(ROOT, 'site-model.js'));

// ---- harness ----------------------------------------------------------------------
var pass = 0, fail = 0, group = '';
function section(name) { group = name; console.log('\n=== ' + name + ' ==='); }
function ok(label, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + (detail === undefined ? '' : '   -> ' + detail)); }
}
function near(label, actual, expected, tol) {
    tol = tol === undefined ? 1e-9 : tol;
    var good = actual !== null && actual !== undefined && Math.abs(actual - expected) <= tol;
    ok(label, good, 'got ' + actual + ', want ' + expected);
}
function eq(label, actual, expected) { ok(label, actual === expected, 'got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected)); }

// ---- fixtures ---------------------------------------------------------------------
// Network hashrate and BTC price are pinned rather than live: the spec's expected outcomes are
// ratios and $/kW figures that must not move with the market.
var MARKET = {
    btcPriceUsd: 96000,
    networkHashratePh: 800000,      // 800 EH/s
    blockRewardBtc: 3.125,
    fx: { CAD: 0.73 }               // USD per 1 CAD
};

function site(over) {
    var base = {
        vendor_name: 'VendorA', power_rate_currency: 'USD',
        claimed_miners: 140, jurisdiction: 'CA-AB'
    };
    for (var k in over) base[k] = over[k];
    return base;
}

var SITES = [
    site({ id: 's1', name: 'Sangudo',       nameplate_kw: 200, usable_kw: 160, purchase_price_usd:  72000, power_rate: 0.03, generator_ownership: 'client' }),
    site({ id: 's2', name: 'Battle River',  nameplate_kw: 200, usable_kw: 160, purchase_price_usd:  85000, power_rate: 0.04, generator_ownership: 'producer' }),
    site({ id: 's3', name: 'Dawson East',   nameplate_kw: 650, usable_kw: 500, purchase_price_usd: 225000, power_rate: 0.04, generator_ownership: 'producer' }),
    site({ id: 's4', name: 'Chauvin South', nameplate_kw: 750, usable_kw: 600, purchase_price_usd: 270000, power_rate: 0.04, generator_ownership: 'producer' })
];
var EV = SITES.map(function(s) { return { site: s, metrics: SiteEngine.evaluate(s, MARKET) }; });
function m(name) {
    for (var i = 0; i < EV.length; i++) if (EV[i].site.name === name) return EV[i].metrics;
    throw new Error('no such fixture: ' + name);
}

// ====================================================================================
section('VALIDATION CHECKPOINT — the four quoted sites');

near('Sangudo       $450.00/kW usable', m('Sangudo').cost_per_usable_kw, 450, 1e-9);
near('Battle River  $531.25/kW usable', m('Battle River').cost_per_usable_kw, 531.25, 1e-9);
near('Dawson East   $450.00/kW usable', m('Dawson East').cost_per_usable_kw, 450, 1e-9);
near('Chauvin South $450.00/kW usable', m('Chauvin South').cost_per_usable_kw, 450, 1e-9);

eq('Sangudo       max_miners = 45',  m('Sangudo').max_miners, 45);
eq('Battle River  max_miners = 45',  m('Battle River').max_miners, 45);
eq('Dawson East   max_miners = 142', m('Dawson East').max_miners, 142);
eq('Chauvin South max_miners = 170', m('Chauvin South').max_miners, 170);

var byCapital = EV.slice().sort(function(a, b) { return a.metrics.cost_per_usable_kw - b.metrics.cost_per_usable_kw; });
eq('Battle River ranks LAST on capital efficiency', byCapital[byCapital.length - 1].site.name, 'Battle River');

var byCost = EV.slice().sort(function(a, b) { return a.metrics.cash_cost_per_btc - b.metrics.cash_cost_per_btc; });
eq('Sangudo has the lowest cash cost per BTC', byCost[0].site.name, 'Sangudo');

// The "140 miners" claim: critical on three, clean on Chauvin South.
function worst(e) { return SiteFlags.worstSeverity(SiteFlags.evaluate(e.metrics, e.site, { peers: EV })); }
eq('140-claim critical on Sangudo',       worst(EV[0]), 'critical');
eq('140-claim critical on Battle River',  worst(EV[1]), 'critical');
eq('140-claim critical on Dawson East',   worst(EV[2]), 'critical');
ok('140-claim clean on Chauvin South',    worst(EV[3]) !== 'critical', 'got ' + worst(EV[3]));

// Regression: 'critical' maps to severity rank 0, and `SEVERITY_ORDER[s] || 9` treated that
// falsy 0 as "unknown", reporting a site holding a critical flag as merely "warn".
var mixed = [{ severity: 'warn' }, { severity: 'critical' }, { severity: 'info' }];
eq('worstSeverity ranks critical above warn (falsy-zero regression)', SiteFlags.worstSeverity(mixed), 'critical');

// ====================================================================================
section('Derived-metric formulas');

// take_or_pay_floor = usable_kw x pct/100 x 720 x rate, at ZERO utilization
var top = SiteEngine.evaluate(site({ usable_kw: 500, nameplate_kw: 650, purchase_price_usd: 225000, power_rate: 0.04, take_or_pay_pct: 60 }), MARKET);
near('take_or_pay_floor = 500 x 0.60 x 720 x 0.04', top.take_or_pay_floor, 500 * 0.60 * 720 * 0.04, 1e-9);
near('monthly_power_full = 500 x 720 x 0.04', top.monthly_power_full, 500 * 720 * 0.04, 1e-9);

near('usable_ratio Sangudo = 160/200', m('Sangudo').usable_ratio, 0.8, 1e-12);
near('total_hashrate_ph = 45 x 234 / 1000', m('Sangudo').total_hashrate_ph, 45 * 234 / 1000, 1e-12);
near('total_capital = price + miners x unit cost', m('Sangudo').total_capital, 72000 + 45 * 2400, 1e-9);

// monthly_btc = hashshare x 144 x reward x 30
var expBtc = (10.53 / 800000) * 144 * 3.125 * 30;
near('monthly_btc matches the spec formula', m('Sangudo').monthly_btc, expBtc, 1e-6);

// Identity: break-even price IS cash cost per BTC. Computed independently in the engine, so
// this asserts a property rather than an alias.
near('breakeven_btc_price == cash_cost_per_btc', m('Sangudo').breakeven_btc_price, m('Sangudo').cash_cost_per_btc, 1e-9);

// Break-even hash price: daily cash cost per TH
near('breakeven_hashprice = (cash/30) / total_TH',
     m('Sangudo').breakeven_hashprice, (m('Sangudo').monthly_cash_usd / 30) / (45 * 234), 1e-12);

// Gas -> power: the spec's "1 MMcf/day ~ 4 MW" at 10,000 BTU/kWh and 1,000 BTU/cf
near('1 MMcf/day = 4,167 kW', SiteEngine.gasMcfDayToKw(1000), 1e6 * 1000 / 10000 / 24, 1e-6);
near('gas conversion round-trips', SiteEngine.kwToGasMcfDay(SiteEngine.gasMcfDayToKw(213)), 213, 1e-9);
near('30 Mcf/day floor = 125 kW', SiteEngine.gasMcfDayToKw(30), 125, 1e-9);

// ====================================================================================
section('Missing data is never invented');

var bare = SiteEngine.evaluate({ name: 'Unknown site' }, MARKET);
eq('absent usable_kw -> cost_per_usable_kw null', bare.cost_per_usable_kw, null);
eq('absent usable_kw -> max_miners null', bare.max_miners, null);
eq('absent price -> total_capital null', bare.total_capital, null);
ok('missing[] names the absent fields', bare.missing.indexOf('usable_kw') >= 0 && bare.missing.indexOf('power_rate') >= 0,
   JSON.stringify(bare.missing));

var noTerms = SiteEngine.evaluate(site({ usable_kw: 160, nameplate_kw: 200, purchase_price_usd: 72000, power_rate: 0.03 }), MARKET);
eq('no contract terms -> take_or_pay_floor null (not 0)', noTerms.take_or_pay_floor, null);
ok('no contract terms still yields full economics', noTerms.cash_cost_per_btc > 0, noTerms.cash_cost_per_btc);

// A zero would rank a site as free; null keeps it honest.
var zero = SiteEngine.evaluate(site({ usable_kw: 0, nameplate_kw: 200, purchase_price_usd: 72000, power_rate: 0.03 }), MARKET);
eq('usable_kw = 0 -> max_miners null, not 0', zero.max_miners, null);
var neg = SiteEngine.evaluate(site({ usable_kw: -160, nameplate_kw: 200, purchase_price_usd: 72000, power_rate: 0.03 }), MARKET);
eq('negative usable_kw rejected', neg.max_miners, null);

// A genuine zero rate must survive as zero, not be swapped for a default (calc-engine.js:66).
var freePower = SiteEngine.evaluate(site({ usable_kw: 160, nameplate_kw: 200, purchase_price_usd: 72000, power_rate: 0 }), MARKET);
near('power_rate of 0 survives as 0', freePower.monthly_power_full, 0, 1e-12);
eq('zero power cost -> cash cost per BTC is 0', freePower.cash_cost_per_btc, 0);

// usable > nameplate is suspicious but must not crash
var over = SiteEngine.evaluate(site({ usable_kw: 300, nameplate_kw: 200, purchase_price_usd: 72000, power_rate: 0.03 }), MARKET);
ok('usable_kw > nameplate_kw -> ratio > 1, no crash', over.usable_ratio > 1, over.usable_ratio);

// Loss-making site: payback is null ("never"), not a huge number or Infinity.
var lossy = SiteEngine.evaluate(site({ usable_kw: 160, nameplate_kw: 200, purchase_price_usd: 72000, power_rate: 5.0 }), MARKET);
ok('monthly_net negative at $5/kWh', lossy.monthly_net < 0, lossy.monthly_net);
eq('unprofitable site -> payback_months null', lossy.payback_months, null);

// ====================================================================================
section('Currency');

var cad = SiteEngine.evaluate(site({ usable_kw: 160, nameplate_kw: 200, purchase_price_usd: 72000, power_rate: 0.04, power_rate_currency: 'CAD' }), MARKET);
near('CAD rate converted at 0.73 USD/CAD', cad.power_rate_usd, 0.04 * 0.73, 1e-12);
near('CAD monthly power = 160 x 720 x 0.0292', cad.monthly_power_full, 160 * 720 * 0.04 * 0.73, 1e-9);

var noFx = SiteEngine.evaluate(site({ usable_kw: 160, nameplate_kw: 200, purchase_price_usd: 72000, power_rate: 0.04, power_rate_currency: 'NGN' }), { btcPriceUsd: 96000, networkHashratePh: 800000, blockRewardBtc: 3.125, fx: {} });
eq('unknown currency -> power_rate_usd null, never 1:1', noFx.power_rate_usd, null);
ok('unknown currency recorded in missing[]', noFx.missing.indexOf('fx.NGN') >= 0, JSON.stringify(noFx.missing));

var noCur = SiteEngine.evaluate(site({ usable_kw: 160, nameplate_kw: 200, purchase_price_usd: 72000, power_rate: 0.04, power_rate_currency: '' }), MARKET);
var curFlags = SiteFlags.evaluate(noCur, site({ usable_kw: 160, power_rate: 0.04, power_rate_currency: '', claimed_miners: null }), {});
ok('rate without a currency raises currency_ambiguity',
   curFlags.some(function(f) { return f.id === 'currency_ambiguity'; }),
   JSON.stringify(curFlags.map(function(f) { return f.id; })));

// ====================================================================================
section('Flag rules');

function flagIds(s, ctx) { return SiteFlags.evaluate(SiteEngine.evaluate(s, MARKET), s, ctx || {}).map(function(f) { return f.id; }); }

eq('8 rules ship', SiteFlags.BUILT_IN_IDS.length, 8);

ok('rule 2: non-SHA-256 hardware is critical',
   flagIds(site({ usable_kw: 160, nameplate_kw: 200, purchase_price_usd: 72000, power_rate: 0.03, claimed_miners: 10, claimed_miner_algorithm: 'Scrypt' })).indexOf('algorithm_mismatch') >= 0);
ok('rule 2: SHA-256 does not flag',
   flagIds(site({ usable_kw: 160, nameplate_kw: 200, purchase_price_usd: 72000, power_rate: 0.03, claimed_miners: 10, claimed_miner_algorithm: 'SHA-256' })).indexOf('algorithm_mismatch') < 0);

var benchCtx = { benchmark: Jurisdictions.benchmark('CA-AB') };
ok('rule 4: rate 50% under benchmark warns',
   flagIds(site({ usable_kw: 160, nameplate_kw: 200, purchase_price_usd: 72000, power_rate: 0.015, claimed_miners: 10 }), benchCtx).indexOf('rate_outlier') >= 0);
ok('rule 4: on-market rate does not warn',
   flagIds(site({ usable_kw: 160, nameplate_kw: 200, purchase_price_usd: 72000, power_rate: 0.035, claimed_miners: 10 }), benchCtx).indexOf('rate_outlier') < 0);
ok('rule 4: silent when no benchmark exists for the jurisdiction',
   flagIds(site({ usable_kw: 160, nameplate_kw: 200, purchase_price_usd: 72000, power_rate: 0.001, claimed_miners: 10 }), { benchmark: Jurisdictions.benchmark('NGA') }).indexOf('rate_outlier') < 0);

ok('rule 5: Battle River is the $/kW outlier vs its vendor',
   SiteFlags.evaluate(m('Battle River'), SITES[1], { peers: EV }).some(function(f) { return f.id === 'cost_per_kw_outlier'; }));
ok('rule 5: silent with no vendor peers',
   flagIds(site({ usable_kw: 160, nameplate_kw: 200, purchase_price_usd: 999999, power_rate: 0.03, claimed_miners: 10 }), { peers: [] }).indexOf('cost_per_kw_outlier') < 0);

ok('rule 6: 36-month warranty on used hardware warns',
   flagIds(site({ usable_kw: 160, nameplate_kw: 200, purchase_price_usd: 72000, power_rate: 0.03, claimed_miners: 10, claimed_warranty_months: 36, hardware_condition: 'used' })).indexOf('warranty_implausible') >= 0);

ok('rule 7: sub-best-in-class J/TH is critical',
   flagIds(site({ usable_kw: 160, nameplate_kw: 200, purchase_price_usd: 72000, power_rate: 0.03, claimed_miners: 10, claimed_efficiency_j_th: 8 })).indexOf('efficiency_claim_implausible') >= 0);
ok('rule 7: 40% firmware uplift is critical',
   flagIds(site({ usable_kw: 160, nameplate_kw: 200, purchase_price_usd: 72000, power_rate: 0.03, claimed_miners: 10, claimed_uplift_pct: 40 })).indexOf('efficiency_claim_implausible') >= 0);

// rule 8 — take-or-pay above 40% of revenue. Chosen so the floor genuinely exceeds the band.
var exposed = site({ usable_kw: 160, nameplate_kw: 200, purchase_price_usd: 72000, power_rate: 0.40, take_or_pay_pct: 80, claimed_miners: 10 });
var exposedM = SiteEngine.evaluate(exposed, MARKET);
ok('rule 8: heavy take-or-pay exposure warns',
   SiteFlags.evaluate(exposedM, exposed, {}).some(function(f) { return f.id === 'take_or_pay_exposure'; }),
   'share=' + exposedM.take_or_pay_share_of_revenue);
ok('rule 8: silent when no take-or-pay term exists',
   flagIds(site({ usable_kw: 160, nameplate_kw: 200, purchase_price_usd: 72000, power_rate: 0.03, claimed_miners: 10 })).indexOf('take_or_pay_exposure') < 0);

// A rule that throws must not blind the other seven.
SiteFlags.register({ id: 'x_throws', severity: 'warn', label: 'boom', test: function() { throw new Error('kaboom'); } });
var survived = SiteFlags.evaluate(m('Sangudo'), SITES[0], { peers: EV });
ok('a throwing rule is reported, not fatal', survived.some(function(f) { return f.id === 'x_throws' && f.severity === 'info'; }));
ok('other rules still evaluated alongside a throwing one', survived.some(function(f) { return f.id === 'miner_count_impossible'; }));
SiteFlags.unregister('x_throws');

// ====================================================================================
section('Jurisdictions');

eq('CA-AB is preferred', Jurisdictions.get('CA-AB').tier, 'preferred');
eq('CA-AB inherits CAD', Jurisdictions.get('CA-AB').currency, 'CAD');
eq('Russia is prohibited', Jurisdictions.get('RUS').tier, 'prohibited');
eq('Nigeria is restricted', Jurisdictions.get('NGA').tier, 'restricted');
eq('an uncatalogued country is unknown, not workable', Jurisdictions.get('ZZZ').tier, 'unknown');
eq('unknown country is flagged as not-known', Jurisdictions.get('ZZZ').known, false);
eq('no benchmark for Nigeria', Jurisdictions.benchmark('NGA'), null);
ok('prohibited scores below workable', Jurisdictions.get('RUS').tierScore < Jurisdictions.get('CAN').tierScore);
Jurisdictions.register('ZZZ', { tier: 'workable', label: 'Testland' });
eq('a registered jurisdiction overrides the default', Jurisdictions.get('ZZZ').tier, 'workable');
Jurisdictions.unregister('ZZZ');
eq('unregister restores unknown', Jurisdictions.get('ZZZ').tier, 'unknown');

// ====================================================================================
section('Scoring');

var CANDS = [
    { id: 'c1', source: 'x', lat: 54, lng: -114, iso3: 'CAN', powerPotentialKw: 900,  persistencePct: 92, offshore: false, trend: 'flat' },
    { id: 'c2', source: 'x', lat: 46.75, lng: -48.78, iso3: 'CAN', powerPotentialKw: 4600, persistencePct: 86, offshore: true, trend: 'flat' },
    { id: 'c3', source: 'x', lat: 31, lng: 47, iso3: 'IRQ', powerPotentialKw: 9000, persistencePct: 99, offshore: false, trend: 'rising' },
    { id: 'c4', source: 'x', lat: 55, lng: -117, iso3: 'CAN', powerPotentialKw: 150,  persistencePct: null, offshore: false, trend: null }
];
var sctx = { jurisdictions: Jurisdictions };

var ranked = SiteScoring.rank(CANDS, sctx);                    // default sort = persistence
eq('default sort is persistence, not volume', ranked[0].candidate.id, 'c3');
ok('a bigger but less persistent flare does not lead', ranked[0].candidate.powerPotentialKw <= 9000);

var offshoreScore = SiteScoring.score(CANDS[1], sctx);
var onshoreScore  = SiteScoring.score(CANDS[0], sctx);
ok('offshore scores below a comparable onshore site', offshoreScore.score < onshoreScore.score,
   offshoreScore.score + ' vs ' + onshoreScore.score);
ok('prohibited jurisdiction drags the blended score', SiteScoring.score(CANDS[2], sctx).score < 1);

var sparse = SiteScoring.score(CANDS[3], sctx);
ok('unknown persistence is dropped, not scored as zero', sparse.coverage < 1, 'coverage=' + sparse.coverage);
ok('coverage is reported so a thin score can be labelled', sparse.coverage > 0 && sparse.coverage < 1);
var nullCrit = sparse.breakdown.filter(function(b) { return b.id === 'persistence'; })[0];
eq('a criterion with no data reports null, not 0', nullCrit.value, null);

// Nothing may be silently dropped from a ranking.
eq('rank() returns every candidate', SiteScoring.rank(CANDS, sctx).length, CANDS.length);

// The single most consequential decision in the sourcing build. The satellite's published
// detection frequency tracks flare SIZE, not persistence — in the built catalog, onshore sites
// above 2 MW average 51% detection frequency while those under 500 kW average 5.6%. Ranking on
// it would surface Iraqi mega-flares and bury the small persistent Alberta flares this tool
// exists to find. Persistence must therefore come from years-detected, which is size-independent.
var smallSteady = { id: 'steady', powerPotentialKw: 200,   persistencePct: 5,  yearsSeen: 6, yearsTotal: 6, offshore: false, iso3: 'CAN', trend: 'flat' };
var hugeOnce    = { id: 'flash',  powerPotentialKw: 20000, persistencePct: 99, yearsSeen: 1, yearsTotal: 6, offshore: false, iso3: 'CAN', trend: 'flat' };
var persistRank = SiteScoring.rank([hugeOnce, smallSteady], sctx, 'persistence');
eq('a small flare seen every year outranks a huge one seen once', persistRank[0].candidate.id, 'steady');
ok('years-detected drives persistence, not detection frequency',
   SiteScoring.score(smallSteady, sctx).breakdown.filter(function(b) { return b.id === 'persistence'; })[0].value === 1,
   'small steady site should score 1.0 on persistence despite 5% detection frequency');
ok('detection frequency survives as its own low-weight signal',
   SiteScoring.list().some(function(c) { return c.id === 'detection_frequency' && c.weight < 3; }));

// ====================================================================================
section('EXTENSIBILITY — new capability without touching the engine');

// Comments are stripped first. The claim under test is that the engine's CODE is agnostic —
// prose explaining the abstraction is not coupling, and matching on it produces false
// positives (`window.*` contains "wind").
var engineCode = fs.readFileSync(path.join(ROOT, 'site-engine.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, ' ')
    .replace(/([^:])\/\/.*$/gm, '$1')
    .toLowerCase();
function engineMentions(word) { return engineCode.indexOf(word.toLowerCase()) >= 0; }

// 1. A new scoring criterion.
SiteScoring.register({
    id: 'fiber_distance', label: 'Fiber distance', weight: 2,
    score: function(c) { return c.fiberKm === undefined || c.fiberKm === null ? null : Math.max(0, 1 - c.fiberKm / 50); }
});
var withFiber = SiteScoring.score({ id: 'z', powerPotentialKw: 900, persistencePct: 90, offshore: false, iso3: 'CAN', fiberKm: 5 }, sctx);
ok('new criterion appears in the breakdown', withFiber.breakdown.some(function(b) { return b.id === 'fiber_distance'; }));
ok('site-engine.js code contains no reference to the new criterion', !engineMentions('fiber_distance'));
ok('shipped criteria are untouched by the addition', SiteScoring.BUILT_IN_IDS.indexOf('fiber_distance') < 0);
SiteScoring.unregister('fiber_distance');

// 2. A new flag rule.
SiteFlags.register({
    id: 'winter_access_unknown', severity: 'info', label: 'Winter access unknown',
    test: function(i) { return i.site.winter_access ? null : { message: 'Winter access not recorded.' }; }
});
ok('new flag fires', SiteFlags.evaluate(m('Sangudo'), SITES[0], {}).some(function(f) { return f.id === 'winter_access_unknown'; }));
ok('site-engine.js code contains no reference to the new flag', !engineMentions('winter_access_unknown'));
SiteFlags.unregister('winter_access_unknown');
ok('unregister removes it again', !SiteFlags.evaluate(m('Sangudo'), SITES[0], {}).some(function(f) { return f.id === 'winter_access_unknown'; }));

// 3. A NON-FLARE energy source. This is the proof that the vertical is not flare-specific:
//    a curtailed-wind adapter flows through discovery -> site -> the same engine.
SiteSources.register({
    id: 'curtailed_wind_test', label: 'Curtailed wind (test)', energyType: 'curtailed_renewable',
    discover: function() {
        return [{
            id: 'cw1', lat: 50.1, lng: -110.7, country: 'Canada', iso3: 'CAN',
            powerPotentialKw: 2400, confidence: 0.6, persistencePct: 41, offshore: false,
            evidence: [{ dataset: 'test-curtailment', year: 2026, field: 'curtailed_mwh', value: 21024 }]
        }];
    }
});

(async function() {
    var res = await SiteSources.discover(['curtailed_wind_test']);
    eq('non-flare source discovers a candidate', res.candidates.length, 1);
    eq('energyType is carried through', res.candidates[0].energyType, 'curtailed_renewable');
    eq('nothing rejected', res.rejected.length, 0);

    var wind = SiteSources.toSite(res.candidates[0], { purchase_price_usd: 500000, power_rate: 0.02, power_rate_currency: 'CAD' });
    /* USABLE, NOT GROSS, and the old name of this assertion -- "usable_kw from the source" --
       was the bug written down: it asserted that the field named usable held the source's gross
       figure. Curtailed renewable takes the 7% default parasitic rate; there is no gas volume, so
       nothing caps it further. 2,400 x 0.93 = 2,232. */
    eq('candidate becomes a site whose usable_kw is derated, not the gross', wind.usable_kw, 2232);
    eq('and the source figure it came from is unchanged', res.candidates[0].powerPotentialKw, 2400);
    eq('commercial terms not invented by the source', wind.take_or_pay_pct, null);

    var windMetrics = SiteEngine.evaluate(wind, MARKET);
    eq('the SAME engine evaluates a wind site', windMetrics.max_miners, Math.floor(2232 * 1000 / 3510));
    ok('wind site produces full economics', windMetrics.cash_cost_per_btc > 0, windMetrics.cash_cost_per_btc);
    ok('site-engine.js code names no energy source at all',
       !engineMentions('curtail') && !engineMentions('flare') && !engineMentions('biogas') &&
       !engineMentions('solar') && !engineMentions('turbine'));

    // Malformed candidates are reported, never silently coerced to 0,0.
    SiteSources.register({
        id: 'bad_source_test', label: 'Bad', energyType: 'flare_gas',
        discover: function() { return [{ id: 'b1', lat: 999, lng: 0 }, { lat: 10, lng: 10 }]; }
    });
    var bad = await SiteSources.discover(['bad_source_test']);
    eq('out-of-range and id-less candidates are rejected', bad.rejected.length, 2);
    eq('nothing bad slips through', bad.candidates.length, 0);
    ok('rejections say why', bad.rejected[0].errors.length > 0, JSON.stringify(bad.rejected[0].errors));

    SiteSources.register({ id: 'throwing_source_test', discover: function() { throw new Error('upstream down'); } });
    var broke = await SiteSources.discover(['throwing_source_test']);
    eq('a failing source is reported, not fatal', broke.errors.length, 1);

    SiteSources.unregister('curtailed_wind_test');
    SiteSources.unregister('bad_source_test');
    SiteSources.unregister('throwing_source_test');

    // ================================================================================
    section('SiteData persistence');

    var added = SiteData.add({ name: 'Test Site', usable_kw: 160, nameplate_kw: 200, vendor_name: 'VendorB' });
    ok('add() assigns an id', !!added.id);
    eq('add() persists', SiteData.list().length, 1);
    eq('get() round-trips', SiteData.get(added.id).name, 'Test Site');
    eq('defaults to prospect/unreviewed', added.status + '/' + added.stage, 'prospect/unreviewed');

    SiteData.update(added.id, { usable_kw: 500 });
    eq('update() persists', SiteData.get(added.id).usable_kw, 500);
    eq('update() cannot change the id', SiteData.get(added.id).id, added.id);

    SiteData.update(added.id, { status: 'definitely-buying' });
    eq('an invalid status falls back rather than being stored', SiteData.get(added.id).status, 'prospect');

    /* The pipeline vocabulary changed when the CRM landed -- negotiating and
       acquired became the configured stage list in crm-config.js. Same contract,
       current names. */
    eq('setStage accepts a valid stage', SiteData.setStage(added.id, 'in_discussion').stage, 'in_discussion');
    eq('setStage rejects an invalid stage', SiteData.setStage(added.id, 'nope'), null);
    eq('stage survives the rejection', SiteData.get(added.id).stage, 'in_discussion');

    var blank = SiteData.blankSite();
    var allManualNull = SiteData.MANUAL_FIELDS.every(function(f) { return blank[f] === null; });
    ok('every satellite-blind field is blank by default', allManualNull, JSON.stringify(SiteData.MANUAL_FIELDS));
    eq('h2s_content is present but empty', blank.h2s_content, null);

    eq('remove() deletes', SiteData.remove(added.id).ok, true);
    /* The boolean used to conflate "no such site" with "the write failed". Both are now
       distinguishable, and the second one is the reason the signature changed: on a full
       localStorage the old return said the record was gone while it was still on disk. */
    eq('and says so rather than throwing when the id is unknown',
       SiteData.remove('no-such-id').ok, false);
    eq('with a reason', SiteData.remove('no-such-id').err, 'No such site.');
    eq('list() is empty again', SiteData.list().length, 0);

    // Corrupt storage must degrade to empty, never throw.
    _store['protonMiningSites'] = '{not json';
    eq('corrupt localStorage returns the default', SiteData.list().length, 0);
    _store['protonMiningSites'] = JSON.stringify({ _v: 1, sites: 'nope' });
    eq('wrong-shape localStorage returns the default', SiteData.list().length, 0);

    // ================================================================================
    // THE WALK-AWAY RATE
    // The only number actually on the table in a gas negotiation. Every other break-even in
    // this engine answers "what must bitcoin do".
    // ================================================================================
    console.log('\n--- walk-away power rate ---');
    (function() {
        function s(over) {
            var b = { nameplate_kw: 2000, usable_kw: 2000, purchase_price_usd: 500000,
                      power_rate: 0.035, power_rate_currency: 'USD' };
            for (var k in over || {}) b[k] = over[k];
            return b;
        }
        var base = SiteEngine.evaluate(s(), MARKET);

        ok('a cash walk-away rate is produced', base.max_power_rate_cash_usd > 0);
        ok('a capital walk-away rate is produced', typeof base.max_power_rate_capital_usd === 'number');
        eq('the target window is reported', base.target_payback_months, 36);

        // The cash ceiling is where monthly_net reaches zero. Verified by feeding it back in.
        var atCeiling = SiteEngine.evaluate(s({ power_rate: base.max_power_rate_cash_usd }), MARKET);
        ok('at the cash ceiling, monthly net is ~zero', Math.abs(atCeiling.monthly_net) < 1);
        var justUnder = SiteEngine.evaluate(s({ power_rate: base.max_power_rate_cash_usd * 0.99 }), MARKET);
        ok('just under it the site is profitable', justUnder.monthly_net > 0);
        var justOver = SiteEngine.evaluate(s({ power_rate: base.max_power_rate_cash_usd * 1.01 }), MARKET);
        ok('just over it the site loses money', justOver.monthly_net < 0);

        // Capital recovery is stricter than merely covering the power bill, always.
        ok('the capital rate is below the cash rate',
           base.max_power_rate_capital_usd < base.max_power_rate_cash_usd);

        // At the capital rate, the site pays its capital back in the target window.
        var atCap = SiteEngine.evaluate(s({ power_rate: base.max_power_rate_capital_usd }), MARKET);
        ok('at the capital rate, payback lands on the target',
           Math.abs(atCap.payback_months - 36) < 0.5);

        // THE INVARIANT THAT CATCHES A ONE-SIDED DERATE. Revenue and the power bill both scale
        // with uptime, so the RATIO cannot move. If this ever fails, the uptime factor has been
        // applied to production but not to the bill (or vice versa) — the exact asymmetry that
        // was fixed when duty cycle was introduced.
        var d100 = SiteEngine.evaluate(s(), MARKET, { uptimePct: 100 });
        var d50  = SiteEngine.evaluate(s(), MARKET, { uptimePct: 50 });
        var d20  = SiteEngine.evaluate(s(), MARKET, { uptimePct: 20 });
        ok('the cash ceiling is duty-invariant (100 vs 50)',
           Math.abs(d100.max_power_rate_cash_usd - d50.max_power_rate_cash_usd) < 1e-9);
        ok('the cash ceiling is duty-invariant (100 vs 20)',
           Math.abs(d100.max_power_rate_cash_usd - d20.max_power_rate_cash_usd) < 1e-9);

        // The capital rate SHOULD move with duty — capital is fixed while revenue is not.
        ok('the capital rate falls as duty falls',
           d20.max_power_rate_capital_usd < d50.max_power_rate_capital_usd &&
           d50.max_power_rate_capital_usd < d100.max_power_rate_capital_usd);
        // And goes negative rather than null when capital cannot be recovered at ANY price.
        // Clamping to zero would hide "this does not work even if the gas is free".
        ok('an unrecoverable capital rate is negative, not null or zero',
           d20.max_power_rate_capital_usd < 0);

        // A shorter window is a harder test.
        var tight = SiteEngine.evaluate(s(), MARKET, { targetPaybackMonths: 12 });
        ok('a shorter payback window lowers the capital rate',
           tight.max_power_rate_capital_usd < base.max_power_rate_capital_usd);
        eq('and reports the window it used', tight.target_payback_months, 12);

        // Null, never a guess, without market data.
        var noMkt = SiteEngine.evaluate(s(), {});
        eq('no market data -> null cash rate', noMkt.max_power_rate_cash_usd, null);
        eq('no market data -> null capital rate', noMkt.max_power_rate_capital_usd, null);
    })();

    // ================================================================================
    console.log('\n' + (fail === 0
        ? 'ALL PASS — ' + pass + ' assertions'
        : pass + ' passed, ' + fail + ' FAILED'));
    process.exit(fail === 0 ? 0 : 1);
})();
