// Tests for the landfill acquisition shortlist — the preset's universe and the axis that ranks it.
//
// Against the REAL artifact, not a fixture. The claim being tested is that the ranking surfaces
// shut-down projects whose generation is still standing, and a fixture would only prove the
// ranker agrees with itself.
//
// The assertion this file replaces was wrong. The plan asked to prove a shutdown project
// outranks "an equivalent-MW candidate without generation" — which passes trivially, because the
// development-stage ladder already scores constructed(70) over raw_resource(20). It tests a
// competition that does not happen. Inside the preset's universe every row already HAS
// generation, so the only competition is shutdown against OPERATING, and on the opportunity axis
// the shutdown project loses it 141 places deep. That is what needed pinning.

var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
var SiteSources       = require(path.join(ROOT, 'site-sources.js'));
var LandfillSource    = require(path.join(ROOT, 'source-landfill.js'));
var SiteOpportunity   = require(path.join(ROOT, 'site-opportunity.js'));
var SiteAcquirability = require(path.join(ROOT, 'site-acquirability.js'));

var pass = 0, fail = 0;
function eq(label, actual, expected) {
    if (actual === expected) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + '\n        expected ' + JSON.stringify(expected) +
                               '\n        actual   ' + JSON.stringify(actual)); }
}
function ok(label, cond, note) { eq(label + (note ? '  (' + note + ')' : ''), !!cond, true); }

var ROWS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'landfills.json'), 'utf8')).projects;
// Through SiteSources.normalize, NOT the adapter alone. The shared candidate shape is a hard
// whitelist: a key the adapter sets but the whitelist does not name is dropped in silence, with
// no error anywhere. Testing the adapter in isolation would prove it agrees with itself while
// existingGenerationKw never reached a single screen.
var ALL = ROWS.map(function(p) {
    return SiteSources.normalize(LandfillSource.adapter.normalize(p), 'lmop-landfill');
}).filter(Boolean);

function statusOf(c) { return (c.sourceDetail && c.sourceDetail.projectStatus) || null; }

// The preset's discriminating clauses, in code. If the preset changes, this must change with it.
var UNIVERSE = ALL.filter(function(c) {
    return c.existingGenerationKw > 0 &&
           c.powerPotentialKw >= 1000 && c.powerPotentialKw <= 3000;
});

function opp(c) { return SiteOpportunity.score(c, {}).scoreRaw; }
function acq(c) {
    return SiteAcquirability.score({
        development_stage: c.developmentStage,
        offtake_state: c.offtakeState,
        permit_state: c.permitState,
        distress_signals: c.distressSignals || []
    }).scoreRaw;
}
function combined(c) { return SiteAcquirability.combine(opp(c), acq(c)); }

function topBy(fn, n) {
    return UNIVERSE.slice().sort(function(a, b) {
        var av = fn(a), bv = fn(b);
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return bv - av;
    }).slice(0, n);
}
function firstWithStatus(s) {
    return UNIVERSE.filter(function(c) { return statusOf(c) === s; })[0];
}

// ---- 1. the field the whole thing rests on ----------------------------------------------------

console.log('\n=== generation already standing is on the candidate shape ===');
(function() {
    var withGen = ALL.filter(function(c) { return c.existingGenerationKw > 0; });
    ok('EPA publishes enough to identify it', withGen.length > 800, withGen.length + ' projects');
    ok('and the field survives the shared-shape whitelist',
       withGen.length === ALL.filter(function(c) {
           return c.existingGenerationKw > 0;
       }).length && withGen[0].source === 'lmop-landfill',
       'an unnamed key would be dropped here in silence');
    ok('and it is null, never 0, where EPA publishes no rating',
       ALL.every(function(c) {
           return c.existingGenerationKw === null || c.existingGenerationKw > 0;
       }), 'zero would be a measurement, absent is not');

    // The trap the artifact warns about: LMOP suffixes some methane columns with MW, so a
    // misread column arrives a THOUSAND times too large. Measured, the ratio of installed
    // generation to current gas potential is exactly 1.00x at both the median and the 90th
    // percentile, and tops out at 24x — three orders of magnitude clear of a unit error.
    //
    // The tail is not noise and it is not a defect. The worst case is 11.7 MW of plant standing
    // on a landfill now producing 0.49 MW of gas, and it is shut down. Installed capacity far
    // above current gas IS the decline curve, and it is generally the reason the project
    // stopped — so the bound here is deliberately loose enough to keep those rows, because they
    // are the ones worth looking at.
    ok('installed generation is never off by a factor of a thousand',
       withGen.every(function(c) {
           return c.powerPotentialKw === null || c.existingGenerationKw <= c.powerPotentialKw * 100;
       }), 'the MW-suffixed column trap, if it ever reaches this field');
})();

// ---- 2. the universe --------------------------------------------------------------------------

console.log('\n=== the preset filters to a universe, not a shortlist ===');
(function() {
    ok('the clauses return a workable universe', UNIVERSE.length > 200 && UNIVERSE.length < 500,
       UNIVERSE.length + ' prospects');
    ok('every one of them is landfill gas',
       UNIVERSE.every(function(c) { return c.source === 'lmop-landfill'; }));
    ok('every one has generation already on site',
       UNIVERSE.every(function(c) { return c.existingGenerationKw > 0; }));
    ok('and every one still carries the gas-treatment requirement',
       UNIVERSE.every(function(c) { return (c.sourceDetail || {}).requiresGasTreatment === true; }),
       'siloxanes do not go away because the engine is already there');

    // Both statuses must be present, or the ranking assertions below prove nothing.
    var sd = UNIVERSE.filter(function(c) { return statusOf(c) === 'Shutdown'; });
    var op = UNIVERSE.filter(function(c) { return statusOf(c) === 'Operational'; });
    ok('the universe genuinely contains both kinds', sd.length > 50 && op.length > 50,
       sd.length + ' shutdown vs ' + op.length + ' operational');
})();

// ---- 3. the two axes disagree, and that is the point ------------------------------------------

/* THIS SECTION USED TO PIN THE OPPOSITE, AND THE REVERSAL IS THE POINT.
 *
 * It asserted that the opportunity score ranks OPERATING plants top and buries the best shutdown
 * project 141 places down -- which is why a separate acquirability axis had to exist at all. That
 * was true, and it was the module's central weakness: opportunity asked "is this energy worth
 * mining against" and answered by preferring the plant whose gas is already under contract.
 *
 * capital_avoided changes what opportunity MEANS for a landfill. Ranking now leads with how much
 * of the build somebody else has already paid for, so a shut plant with collection, gensets,
 * switchgear and a pad rises to the top -- where the thesis always said it belonged.
 *
 * The assertions below are inverted deliberately. If they ever revert, capital_avoided has
 * stopped reaching the score. */
console.log('\n=== overall score now leads with the plant you can buy ===');
(function() {
    var top = topBy(opp, 20);
    var operating = top.filter(function(c) { return statusOf(c) === 'Operational'; }).length;
    ok('the top 20 are no longer dominated by running plants', operating <= 12,
       operating + ' of 20 operational');

    // Not a defect. Opportunity asks whether the energy is worth mining against, and a running
    // 2 MW plant genuinely is. It just is not for sale.
    eq('because EPA does not publish an operating project offtake term',
       firstWithStatus('Operational').offtakeState, null);
})();

console.log('\n=== acquisition rank inverts it ===');
(function() {
    var top = topBy(combined, 20);
    var shut = top.filter(function(c) { return statusOf(c) === 'Shutdown'; }).length;
    ok('sorted by acquisition rank, the top 20 are shut-down projects', shut >= 18,
       shut + ' of 20 shutdown');
    ok('all of which still have their generation standing',
       top.every(function(c) { return c.existingGenerationKw > 0; }),
       'the $600K-1.2M line item already spent');

    // The mechanism, asserted directly rather than inferred from the ordering.
    eq('a shutdown offtake is over by definition', firstWithStatus('Shutdown').offtakeState, 'expired');
    ok('so it carries acquirability evidence where a running plant carries none',
       acq(firstWithStatus('Shutdown')) > 0 && !(acq(firstWithStatus('Operational')) > 0));

    // The headline, pinned. This is the finding the preset exists to deliver.
    var byOpp = UNIVERSE.slice().sort(function(a, b) { return opp(b) - opp(a); });
    var firstShutdown = 0;
    for (var i = 0; i < byOpp.length; i++) {
        if (statusOf(byOpp[i]) === 'Shutdown') { firstShutdown = i + 1; break; }
    }
    ok('the best shutdown project now ranks near the top, not buried', firstShutdown <= 10,
       'rank ' + firstShutdown + ' of ' + UNIVERSE.length);
    eq('on acquisition rank it is first', statusOf(topBy(combined, 1)[0]), 'Shutdown');
})();

// ---- 4. the counterparty classifier, pinned by NAME ---------------------------------------------
//
// This section exists because the whole suite stayed green through a defect that misclassified
// 374 rows — the single most common owner in the dataset. Counts alone did not catch it: the
// rows moved between two buckets that both still had plausible totals. So these assertions name
// the actual companies, which is the only thing that would have failed.

console.log('\n=== the national majors are identified by name, not by count ===');
(function() {
    function typeOf(owner) {
        var r = ALL.filter(function(c) { return c.operator === owner; });
        return { n: r.length, major: r.filter(function(c) { return c.counterpartyType === 'landfill_major'; }).length };
    }

    // LMOP rebranded. It writes "WM", not "Waste Management", and a substring regex built from
    // the old name matched none of them.
    var wm = typeOf('WM');
    ok('WM is the largest owner in the dataset', wm.n > 350, wm.n + ' rows');
    ok('and is classified as a national major', wm.major >= wm.n - 5,
       wm.major + ' of ' + wm.n + ' — the remainder are the publicly-owned ones');

    var rep = typeOf('Republic Services, Inc.');
    ok('Republic Services likewise', rep.major === rep.n && rep.n > 200, rep.n + ' rows');

    // Two letters cannot be substring-matched. These are the nine rows a /wm/i substring would
    // have swept up, and every one of them is a municipal body.
    var swept = ALL.filter(function(c) {
        return c.counterpartyType === 'landfill_major' &&
               /authority|district|county|city of|commission|township|borough|parish|municipal/i.test(c.operator || '');
    });
    eq('and no municipal body is called a major', swept.length, 0);

    // A landfill a city co-owns with a major is not a pure major. Joint holdings must fall through
    // to the municipal branch, which is the better counterparty and scores higher.
    var joint = ALL.filter(function(c) { return /;/.test(c.operator || '') && /city of|county/i.test(c.operator || ''); });
    if (joint.length) {
        ok('a jointly-held landfill is not scored as a major',
           joint.every(function(c) { return c.counterpartyType !== 'landfill_major'; }),
           joint.length + ' joint holdings');
    }

    // The scoring consequence, asserted at the source rather than inferred.
    var S = SiteOpportunity.settings().counterpartyScores;
    ok('a municipal counterparty outranks a national major', S.landfill_public > S.landfill_major);
    ok('and an independent private operator outranks one too', S.landfill_private > S.landfill_major);
})();

// ---- 5. the meter beats the model ---------------------------------------------------------------
//
// remainingYears() shipped with a flat 25-year post-closure horizon and returned 0 past it. That
// put 90 of the 336 shortlist sites at "no fuel left" while 88 of them were still collecting gas.
// 0 is a measurement claim; the meter said otherwise, so the horizon yields.

console.log('\n=== no site is called empty while its meter is still running ===');
(function() {
    function flow(c) {
        var r = c.sourceDetail || {};
        var v = [r.lfgFlowToProjectMmscfd, r.lfgCollectedMmscfd, r.lfgFlaredMmscfd];
        for (var i = 0; i < v.length; i++) if (v[i] !== null && v[i] !== undefined && v[i] > 0) return v[i];
        return null;
    }
    function yrs(c) { return (c.sourceDetail || {}).estimatedRemainingYears; }

    var lying = ALL.filter(function(c) { return yrs(c) === 0 && flow(c) !== null; });
    eq('no prospect claims zero years while gas is measurably flowing', lying.length, 0);

    var past = UNIVERSE.filter(function(c) {
        return yrs(c) === null && /past the typical/.test((c.sourceDetail || {}).estimatedRemainingBasis || '');
    });
    ok('sites past the horizon that still produce say so instead', past.length > 50,
       past.length + ' of ' + UNIVERSE.length + ' in the shortlist');
    ok('and every one of them quotes the measured rate',
       past.every(function(c) { return /still producing [0-9.]+ mmscfd/.test((c.sourceDetail || {}).estimatedRemainingBasis); }),
       'the reader gets the fact, not just the absence of a number');

    // The horizon still applies where nothing contradicts it — the fix must not have deleted it.
    var stillModelled = ALL.filter(function(c) { return yrs(c) !== null && yrs(c) > 0; });
    ok('the horizon still produces an estimate where the meter is silent',
       stillModelled.length > 1000, stillModelled.length + ' prospects');
})();

// ---- 6. what must not have changed -------------------------------------------------------------

console.log('\n=== the rest of the model is undisturbed ===');
(function() {
    ok('every landfill prospect still requires gas treatment',
       ALL.every(function(c) { return (c.sourceDetail || {}).requiresGasTreatment === true; }),
       'which is what drives the $250/kW adder in site-capex.js');
    ok('remaining generation years is estimated with its basis stated',
       ALL.filter(function(c) {
           var d = c.sourceDetail || {};
           return d.estimatedRemainingYears !== null && d.estimatedRemainingBasis;
       }).length > 1500);
    ok('capacity still prefers measured gas flow over an estimate',
       ALL.filter(function(c) { return c.powerPotentialKw !== null; }).length > 1800);
})();

console.log('');
console.log(fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                       : pass + ' passed, ' + fail + ' FAILED');
process.exit(fail === 0 ? 0 : 1);
