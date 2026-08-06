// Unit tests for the acquirability axis.
//
// The assertions that matter most are the ones encoding requirements the brief states but its
// own arithmetic cannot satisfy: that multiple signals COMPOUND to beat one strong signal, that
// evidence DECAYS, and that a zero on one axis is never masked by a strong score on the other.
var path = require('path');
var ROOT = path.join(__dirname, '..');
global.Jurisdictions = require(path.join(ROOT, 'jurisdictions.js'));
global.SiteOpportunity = require(path.join(ROOT, 'site-opportunity.js'));
var SA = require(path.join(ROOT, 'site-acquirability.js'));

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

var NOW = '2026-08-05';
function sig(type, date, extra) {
    var s = { type: type, date: date || null };
    for (var k in (extra || {})) s[k] = extra[k];
    return s;
}
function rec(over) {
    var r = { id: 'test', development_stage: 'operating', distress_signals: [] };
    for (var k in (over || {})) r[k] = over[k];
    return r;
}
function sc(over) { return SA.score(rec(over), { asOf: NOW }); }

console.log('site-acquirability');
SA.reset();

// ---- The compounding requirement the brief cannot meet as written ---------------------
// Plain noisy-OR is sub-additive: permit(50)+violations(45)+ownership(30) reaches only 80.8 and
// LOSES to a single UCC filing at 85. The compressive evidence map is what makes it satisfiable.
var oneStrong = sc({ distress_signals: [sig('bankruptcy')] }).scoreRaw;
var threeModerate = sc({ distress_signals: [sig('permit_lapsed'), sig('compliance_violations'), sig('ownership_change_lt_24mo')] }).scoreRaw;
ok('three moderate signals BEAT one bankruptcy', threeModerate > oneStrong, { three: threeModerate, one: oneStrong });
console.log('        three moderate ' + threeModerate.toFixed(1) + '  vs  bankruptcy alone ' + oneStrong.toFixed(1));

// Bankruptcy must not be an absorbing certainty, or bankrupt sites are unrankable against
// each other and immune to decay.
ok('bankruptcy alone does not pin at 100', oneStrong < 95, oneStrong);
ok('and can still be exceeded by more evidence',
   sc({ distress_signals: [sig('bankruptcy'), sig('ucc_foreclosure'), sig('permit_lapsed')] }).scoreRaw > oneStrong);

// The general guarantee, not just the one example: more total evidence always wins.
(function () {
    var types = Object.keys(SA.DEFAULT_SIGNALS);
    var worse = 0;
    for (var trial = 0; trial < 200; trial++) {
        var a = [], b = [], i;
        for (i = 0; i < types.length; i++) {
            if ((trial * 7 + i * 13) % 5 < 2) a.push(sig(types[i]));
            if ((trial * 11 + i * 5) % 5 < 2) b.push(sig(types[i]));
        }
        var ra = sc({ distress_signals: a }), rb = sc({ distress_signals: b });
        if (ra.scoreRaw === null || rb.scoreRaw === null) continue;
        // More evidence must never score lower.
        if (ra.evidence > rb.evidence && ra.scoreRaw < rb.scoreRaw) worse++;
    }
    eq('more evidence never scores lower (200 random signal sets)', worse, 0);
})();

// Monotonicity: adding a signal can never lower the score.
(function () {
    var base = sc({ distress_signals: [sig('permit_lapsed')] }).scoreRaw;
    var types = Object.keys(SA.DEFAULT_SIGNALS), bad = 0;
    for (var i = 0; i < types.length; i++) {
        var r = sc({ distress_signals: [sig('permit_lapsed'), sig(types[i])] });
        if (r.scoreRaw < base - 1e-9) bad++;
    }
    eq('adding any signal never lowers the score', bad, 0);
})();

// ---- Decay ------------------------------------------------------------------------------
var fresh = sc({ distress_signals: [sig('bankruptcy', '2026-07-05')] }).scoreRaw;
var old4y = sc({ distress_signals: [sig('bankruptcy', '2022-08-05')] }).scoreRaw;
ok('a bankruptcy last month outranks one four years ago', fresh > old4y, { fresh: fresh, old: old4y });
console.log('        1 month ' + fresh.toFixed(1) + '  vs  4 years ' + old4y.toFixed(1));
ok('the gap is substantial, not cosmetic', fresh - old4y > 15, fresh - old4y);

var undated = sc({ distress_signals: [sig('bankruptcy', null)] });
eq('an undated signal counts as current', Math.round(undated.scoreRaw), Math.round(sc({ distress_signals: [sig('bankruptcy', NOW)] }).scoreRaw));
ok('and says so rather than hiding the assumption',
   undated.breakdown.some(function (b) { return b.type === 'bankruptcy' && /undated/.test(b.detail); }));

var ancient = sc({ distress_signals: [sig('listed_for_sale', '2010-01-01')] });
ok('a long-expired signal is reported, not silently dropped',
   ancient.breakdown.some(function (b) { return b.type === 'listed_for_sale' && /too old/.test(b.detail); }));

// ---- Dedupe -----------------------------------------------------------------------------
var once = sc({ distress_signals: [sig('bankruptcy', NOW)] }).scoreRaw;
var thrice = sc({ distress_signals: [sig('bankruptcy', NOW), sig('bankruptcy', '2024-01-01'), sig('bankruptcy', '2023-01-01')] }).scoreRaw;
near('duplicate signals of one type score as one', thrice, once, 0.001);
eq('and only one is counted', sc({ distress_signals: [sig('bankruptcy', NOW), sig('bankruptcy', '2024-01-01')] }).signalCount, 1);
// Ten violation notices from a single inspection must not outrank a foreclosure.
var manyViolations = [];
for (var v = 0; v < 10; v++) manyViolations.push(sig('compliance_violations', NOW));
ok('ten violation notices do not outrank one foreclosure',
   sc({ distress_signals: manyViolations }).scoreRaw < sc({ distress_signals: [sig('ucc_foreclosure', NOW)] }).scoreRaw);

// ---- The structural baseline — the fix for the degenerate product ----------------------
var healthyPPA = sc({ offtake_state: 'long_gt_10yr', permit_state: 'active_long_dated' }).scoreRaw;
var healthyMerchant = sc({ offtake_state: 'none_merchant', permit_state: 'active' }).scoreRaw;
var utility = sc({ offtake_state: 'regulated_ratebase', permit_state: 'active_long_dated' }).scoreRaw;
var expiring = sc({ offtake_state: 'expired', permit_state: 'in_renewal' }).scoreRaw;
var rawFlare = SA.score({ id: 'f', development_stage: 'raw_resource', offtake_state: 'none_merchant',
                          permit_state: 'none_required', distress_signals: [] }, { asOf: NOW }).scoreRaw;
var distressed = sc({ offtake_state: 'long_gt_10yr',
                      distress_signals: [sig('bankruptcy', '2026-07-01'), sig('permit_lapsed', NOW), sig('compliance_violations', NOW)] }).scoreRaw;

ok('a healthy PPA plant is NOT zero', healthyPPA > 0, healthyPPA);
ok('a merchant plant outranks a 20-year-PPA plant', healthyMerchant > healthyPPA, { merchant: healthyMerchant, ppa: healthyPPA });
ok('a regulated utility plant ranks lowest of the healthy ones', utility < healthyPPA, { utility: utility, ppa: healthyPPA });
ok('an expiring contract outranks a merchant plant', expiring > healthyMerchant, { expiring: expiring, merchant: healthyMerchant });
ok('a distressed plant outranks every healthy one', distressed > expiring, { distressed: distressed, expiring: expiring });
console.log('        distressed ' + distressed.toFixed(0) + ' > expiring ' + expiring.toFixed(0) +
            ' > raw flare ' + rawFlare.toFixed(0) + ' > merchant ' + healthyMerchant.toFixed(0) +
            ' > PPA ' + healthyPPA.toFixed(0) + ' > utility ' + utility.toFixed(0));

// The whole point: distress LIFTS a locked asset off its low baseline.
ok('distress lifts a PPA-locked plant far above its baseline', distressed - healthyPPA > 50, distressed - healthyPPA);

// ---- Nothing recorded is null, not zero -------------------------------------------------
var blank = SA.score({ id: 'x' }, { asOf: NOW });
eq('a prospect with nothing recorded scores null, not zero', blank.score, null);
eq('and reports zero signals', blank.signalCount, 0);
eq('a null record scores null', SA.score(null).score, null);
eq('a garbage record scores null', SA.score('nonsense').score, null);

// ---- Hostile input ----------------------------------------------------------------------
['toString', 'constructor', 'valueOf', 'hasOwnProperty'].forEach(function (k) {
    var r = sc({ distress_signals: [sig(k, NOW), sig('permit_lapsed', NOW)] });
    ok('signal type "' + k + '" leaves the score finite', r.score !== null && isFinite(r.score), r.score);
    // Types are case-normalised before lookup, so an unknown one is reported lowercased.
    ok('and is reported as unknown', r.unknownSignals.indexOf(k.toLowerCase()) >= 0, r.unknownSignals);
    var r2 = SA.score({ id: 'x', offtake_state: k, permit_state: k, distress_signals: [sig('permit_lapsed', NOW)] }, { asOf: NOW });
    ok('offtake/permit state "' + k + '" leaves the score finite', r2.score !== null && isFinite(r2.score), r2.score);
});
ok('a typeless signal is ignored without throwing',
   isFinite(sc({ distress_signals: [{ date: NOW }, sig('permit_lapsed', NOW)] }).score));
ok('an unparseable date is treated as undated, not NaN',
   isFinite(sc({ distress_signals: [sig('bankruptcy', 'not-a-date')] }).score));
eq('a non-array distress_signals does not throw', sc({ distress_signals: 'nope' }).signalCount, 0);

// ---- capacity_factor_decline is gated on development stage -----------------------------
// The same measurement inverts meaning: for a plant a falling capacity factor is distress; for a
// raw flare, falling flared volume means the producer solved their problem.
var plantDecline = SA.score({ id: 'p', development_stage: 'operating', offtake_state: 'none_merchant',
                              distress_signals: [sig('capacity_factor_decline', NOW)] }, { asOf: NOW });
var flareDecline = SA.score({ id: 'f', development_stage: 'raw_resource', offtake_state: 'none_merchant',
                              distress_signals: [sig('capacity_factor_decline', NOW)] }, { asOf: NOW });
ok('output decline IS distress for an operating plant', plantDecline.signalCount === 1, plantDecline.signalCount);
ok('output decline is NOT distress for a raw resource', flareDecline.signalCount === 0, flareDecline.signalCount);
ok('and the flare scores lower for it', flareDecline.scoreRaw < plantDecline.scoreRaw, { flare: flareDecline.scoreRaw, plant: plantDecline.scoreRaw });
ok('the reason is explained, not silently swallowed',
   flareDecline.breakdown.some(function (b) { return b.type === 'capacity_factor_decline' && /solved/.test(b.detail); }));
// It DOES fire for constructed and above.
ok('it fires for a constructed asset',
   SA.score({ id: 'c', development_stage: 'constructed', offtake_state: 'none_merchant',
              distress_signals: [sig('capacity_factor_decline', NOW)] }, { asOf: NOW }).signalCount === 1);

// ---- combine() ---------------------------------------------------------------------------
eq('combine is the geometric mean', SA.combine(100, 25), 50);
eq('a zero on either axis yields zero', SA.combine(90, 0), 0);
eq('and the other way round', SA.combine(0, 90), 0);
eq('null opportunity propagates as null', SA.combine(null, 60), null);
eq('null acquirability propagates as null', SA.combine(60, null), null);
ok('combine is monotone in the raw product (500 random pairs)', (function () {
    var bad = 0;
    for (var i = 0; i < 500; i++) {
        var o1 = (i * 37) % 101, a1 = (i * 53) % 101, o2 = (i * 71) % 101, a2 = (i * 29) % 101;
        var p1 = o1 * a1, p2 = o2 * a2;
        var c1 = SA.combine(o1, a1), c2 = SA.combine(o2, a2);
        if (p1 > p2 && !(c1 > c2)) bad++;
        if (p1 < p2 && !(c1 < c2)) bad++;
    }
    return bad === 0;
})());

// The headline case from the brief: high/high must beat a high score on either axis alone.
(function () {
    var cases = [
        { n: 'high opp / near-zero acq (PPA plant)', o: 90, a: healthyPPA },
        { n: 'low opp / high acq (bankrupt wreck)',  o: 35, a: distressed },
        { n: 'HIGH BOTH (the target)',               o: 78, a: distressed }
    ].map(function (c) { c.combined = SA.combine(c.o, c.a); return c; })
     .sort(function (x, y) { return y.combined - x.combined; });
    eq('the high/high case ranks first', cases[0].n, 'HIGH BOTH (the target)');
    cases.forEach(function (c) {
        console.log('        ' + c.combined.toFixed(1).padStart(6) + '  ' + c.n);
    });
})();

// ---- Settings are tunable ----------------------------------------------------------------
SA.reset();
ok('signal weights are editable', SA.setSignalWeight('bankruptcy', 90) === true);
ok('rejects an out-of-range weight', SA.setSignalWeight('bankruptcy', 150) === false);
ok('rejects an unknown signal type', SA.setSignalWeight('not_a_signal', 50) === false);
ok('half-lives are editable', SA.setHalfLife('bankruptcy', 5) === true);
ok('rejects a non-positive half-life', SA.setHalfLife('bankruptcy', 0) === false);
SA.reset();
eq('reset restores the default weight', SA.signals().bankruptcy, SA.DEFAULT_SIGNALS.bankruptcy);

// A longer half-life must make an old signal count for more.
var beforeHL = sc({ distress_signals: [sig('bankruptcy', '2022-08-05')] }).scoreRaw;
SA.setHalfLife('bankruptcy', 10);
var afterHL = sc({ distress_signals: [sig('bankruptcy', '2022-08-05')] }).scoreRaw;
ok('a longer half-life preserves more of an old signal', afterHL > beforeHL, { before: beforeHL, after: afterHL });
SA.reset();

// ---- Structure ---------------------------------------------------------------------------
var r = sc({ offtake_state: 'none_merchant', permit_state: 'active', distress_signals: [sig('permit_lapsed', NOW)] });
ok('every breakdown row carries a readable detail',
   r.breakdown.every(function (b) { return typeof b.detail === 'string' && b.detail.length > 0; }));
ok('scores land in 0-100', r.score >= 0 && r.score <= 100, r.score);
ok('scoreRaw is unrounded', Math.abs(r.scoreRaw - r.score) < 1);
ok('permit_state has no "lapsed" member (it would double-count the signal)',
   SA.PERMIT_EVIDENCE.lapsed === undefined);

// ---- First-hand contact outcomes -------------------------------------------------------------
// The feedback loop. These are the only signals in the model that are not inferences from a
// public record, so the arithmetic has to put them above everything that is.

console.log('\n=== what the owner actually told you ===');
(function() {
    var base = { offtake_state: 'merchant', permit_state: 'active' };
    function withSignals(sigs) {
        var r = {}; for (var k in base) r[k] = base[k];
        r.distress_signals = sigs; return r;
    }

    var quiet = SA.score(withSignals([]));
    var avail = SA.score(withSignals([{ type: 'owner_confirmed_available', date: '2026-07-01' }]));
    ok('a confirmed-available owner raises acquirability', avail.score > quiet.score);

    // The override. Every inferred signal at once must still lose to being told no.
    var everything = withSignals([
        { type: 'bankruptcy', date: '2026-07-01' },
        { type: 'ucc_foreclosure', date: '2026-07-01' },
        { type: 'lmop_shutdown', date: '2026-07-01' },
        { type: 'listed_for_sale', date: '2026-07-01' }
    ]);
    var loud = SA.score(everything);
    ok('a pile of distress signals scores high', loud.score > 70);

    var taken = withSignals(everything.distress_signals.concat(
        [{ type: 'owner_confirmed_taken', date: '2026-07-15' }]));
    var t = SA.score(taken);
    eq('being told it is taken overrides all of them', t.score, 0);
    eq('and it is ZERO, not null — confirmed unavailable is a finding', t.scoreRaw, 0);
    ok('the override is flagged', t.confirmedTaken === true);
    eq('the breakdown explains why', t.breakdown.length, 1);
    ok('and says it came from the owner', /owner told you/.test(t.breakdown[0].detail));

    // Zero must still be distinguishable from unknown when the two axes combine.
    eq('a zero axis makes the combined score zero', SA.combine(90, 0), 0);
    eq('an unknown axis stays null', SA.combine(90, null), null);

    // Silence scores NOTHING. Recorded so you know you already tried; weighted at zero because
    // 'nobody replied' is not evidence the asset is available, and a positive weight would have
    // raised the score for the sole reason that a call went unanswered.
    var quietOwner = SA.score(withSignals([{ type: 'owner_unresponsive', date: '2026-07-01' }]));
    eq('no response does not move the score at all', quietOwner.score, quiet.score);
    ok('but it is still recorded in the breakdown',
       quietOwner.breakdown.some(function(b) { return b.type === 'owner_unresponsive'; }));
    ok('and never outranks being told yes', quietOwner.score < avail.score);

    // A conversation ages.
    var old = SA.score(withSignals([{ type: 'owner_confirmed_available', date: '2021-01-01' }]));
    ok('a five-year-old yes is worth less than a recent one', old.score < avail.score);
})();

console.log('');
console.log(fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                       : pass + ' passed, ' + fail + ' FAILED');
process.exit(fail === 0 ? 0 : 1);
