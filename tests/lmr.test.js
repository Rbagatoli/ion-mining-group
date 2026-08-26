// Tests for lmr.js — the Landfill Methane Regulations module.
//
// Two kinds of assertion in here, and the difference matters:
//
//   1. ARITHMETIC that must reproduce a published benchmark. The 1,000 t/yr -> 99.1 cf/min ->
//      ~600 kW chain is quoted at operators and regulators, so if our constants drift the number
//      we say in a meeting stops matching the number they check.
//
//   2. REGULATORY READINGS, each pinned to a section. These exist because the build brief this
//      came from got four of them wrong, every one in the direction of a rosier pipeline: it
//      treated 664-999 t/yr as unregulated when s.5(3) gives it a 2035 date, dropped the second
//      limb of s.3(1)(b), read a registered offset project as an exemption when s.5(2)(b)(ii)
//      makes it a deferral, and assumed one cohort per landfill when s.5 attaches obligations
//      per PORTION. A test is the only thing that stops those creeping back.

var path = require('path');
var ROOT = path.join(__dirname, '..');
var LMR = require(path.join(ROOT, 'lmr.js'));

var pass = 0, fail = 0;
function ok(label, cond, got) {
    if (cond) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + (got === undefined ? '' : '   got ' + JSON.stringify(got))); }
}
function near(label, actual, expected, tol) {
    var good = actual !== null && Math.abs(actual - expected) <= tol;
    ok(label + '  (' + expected + ' +/- ' + tol + ')', good, actual === null ? null : Math.round(actual * 100) / 100);
}

console.log('\n=== the conversion reproduces the published benchmarks ===');
near('1,000 t CH4/yr -> cf/min', LMR.methaneTonnesToCfm(1000), 99.1, 0.15);
near('664 t CH4/yr -> cf/min', LMR.methaneTonnesToCfm(664), 65.8, 0.15);
near('1,000 t/yr -> kW at 100% capture', LMR.methaneTonnesToKw(1000, { captureEfficiency: 1 }), 600, 5);

// The brief's own framing: at realistic capture the threshold is a 400-500 kW site.
var kwReal = LMR.methaneTonnesToKw(1000);
ok('1,000 t/yr at default capture lands in the 400-500 kW band',
   kwReal > 400 && kwReal < 510, Math.round(kwReal));
var kw664 = LMR.methaneTonnesToKw(664);
ok('664 t/yr at default capture lands in the 300-400 kW band',
   kw664 > 290 && kw664 < 400, Math.round(kw664));

// Cross-check against the constant the US adapter already uses, arrived at independently:
// the same gas as landfill gas at 50% methane, at 2.08 MW per mmscfd.
var cfDay = LMR.methaneTonnesToCfm(1000) * 1440;
var lfgMmscfd = (cfDay / 1e6) / 0.5;
var kwViaRepoConstant = lfgMmscfd * 2.08 * 1000;
near('agrees with the US adapter\'s 2.08 MW/mmscfd constant',
     LMR.methaneTonnesToKw(1000, { captureEfficiency: 1 }), kwViaRepoConstant, 15);

ok('capture efficiency is configurable and moves the answer',
   LMR.methaneTonnesToKw(1000, { captureEfficiency: LMR.CAPTURE_MIN }) <
   LMR.methaneTonnesToKw(1000, { captureEfficiency: LMR.CAPTURE_MAX }));
ok('a nonsense capture value falls back rather than producing a nonsense kW',
   LMR.methaneTonnesToKw(1000, { captureEfficiency: 9 }) === LMR.methaneTonnesToKw(1000));
ok('no methane figure yields null, not zero', LMR.methaneTonnesToKw(null) === null);

console.log('\n=== s.3 applicability, including the limb summaries drop ===');
ok('s.3(1)(a): over 450,000 t in place is caught',
   LMR.applicability({ wasteInPlaceTonnes: 500000 }).applicable === true);
ok('s.3(1)(b): 25,000 t/yr disposed AND 250,000 t in place is caught',
   LMR.applicability({ annualDisposalTonnes: 25000, wasteInPlaceTonnes: 250000 }).applicable === true);
// The one the brief dropped. Without the second limb this returns true and over-includes.
ok('s.3(1)(b): 25,000 t/yr disposed but only 150,000 t in place is NOT caught',
   LMR.applicability({ annualDisposalTonnes: 25000, wasteInPlaceTonnes: 150000 }).applicable === false,
   LMR.applicability({ annualDisposalTonnes: 25000, wasteInPlaceTonnes: 150000 }));
ok('no tonnage published yields null, not false',
   LMR.applicability({}).applicable === null);

console.log('\n=== s.5 cohorts ===');
function C(gen, controls, extra) {
    var f = { methaneGenerationTonnes: gen, hasExistingControls: controls };
    for (var k in (extra || {})) f[k] = extra[k];
    return LMR.cohort(f);
}
ok('>=1,000 t/yr with no existing controls -> jan_2029',
   C(1500, false).cohort === 'jan_2029', C(1500, false).cohort);
ok('>=1,000 t/yr with recovery already running -> jan_2028',
   C(1500, true).cohort === 'jan_2028', C(1500, true).cohort);
// s.5(3). The brief called this "below_threshold"; it is a regulated tier with a 2035 date.
ok('664-999 t/yr -> jan_2035, NOT below_threshold',
   C(800, false).cohort === 'jan_2035', C(800, false).cohort);
ok('jan_2035 carries the 2035 deadline',
   C(800, false).deadline === '2035-01-01', C(800, false).deadline);
ok('under 664 t/yr -> below_threshold',
   C(400, false).cohort === 'below_threshold', C(400, false).cohort);
ok('over threshold but controls unknown -> unknown, not a guess',
   C(1500, null).cohort === 'unknown', C(1500, null).cohort);
ok('no generation figure -> unknown',
   C(null, false).cohort === 'unknown', C(null, false).cohort);
// s.5 attaches obligations per PORTION and GHGRP reports per facility. That ambiguity is
// recorded in the basis text, NOT as a cohort -- an earlier 'mixed' bucket keyed on "reports
// both" returned 76 of 147 real sites and left the 2028 cohort with two, because every landfill
// reports landfilling emissions whether or not it also destroys gas.
var both = C(1500, true, { hasFlaring: true, hasLandfillingEmissions: true });
ok('a facility reporting both still gets its real cohort, not a catch-all',
   both.cohort === 'jan_2028', both.cohort);
ok('...and the per-portion caveat is stated in the basis',
   /portion/i.test(both.basis), both.basis);
ok('a site with no landfilling line carries no portion caveat',
   !/portion/i.test(C(1500, true, { hasFlaring: true }).basis));
ok('every cohort states its basis with a section reference',
   [C(1500, false), C(1500, true), C(800, false)].every(function(r) {
       return /s\.5/.test(r.basis || '');
   }));

console.log('\n=== s.5(2)(b)(ii): an offset project defers, it does not exempt ===');
var def = LMR.deferForOffset('2028-01-01', 2032);
ok('crediting period running to 2032 pushes the date to 2033',
   def.deadline === '2033-01-01' && def.deferred === true, def);
var noDef = LMR.deferForOffset('2029-01-01', 2026);
ok('a crediting period ending before the statutory date does not pull it in',
   noDef.deadline === '2029-01-01' && noDef.deferred === false, noDef);
ok('no offset project leaves the date untouched',
   LMR.deferForOffset('2029-01-01', null).deadline === '2029-01-01');

console.log('\n=== reported emissions are not generation ===');
var unc = LMR.generationFromReported(1000, false);
var con = LMR.generationFromReported(1000, true);
ok('an uncontrolled site: generation is a little above reported',
   unc.tonnes > 1000 && unc.tonnes < 1200, Math.round(unc.tonnes));
ok('a controlled site reporting the SAME figure generates far more',
   con.tonnes > unc.tonnes * 3, Math.round(con.tonnes));
// This is the whole reason the distinction is modelled: filter on reported CH4 alone and the
// sites that already built a collection system are the ones you throw away.
ok('a controlled site reporting 300 t is over the 1,000 t threshold once grossed up',
   LMR.generationFromReported(300, true).tonnes > LMR.THRESHOLD_UPPER_T,
   Math.round(LMR.generationFromReported(300, true).tonnes));
ok('the controlled estimate carries lower confidence than the uncontrolled one',
   con.confidence < unc.confidence);
ok('controls unknown -> null, because the two branches differ by ~4x',
   LMR.generationFromReported(1000, null).tonnes === null);
ok('both branches say which gross-up they applied',
   /oxidation/.test(unc.basis) && /collection/.test(con.basis));

console.log('\n=== months to deadline ===');
ok('a future deadline is positive', LMR.monthsToDeadline('2029-01-01', '2026-08-25') === 28,
   LMR.monthsToDeadline('2029-01-01', '2026-08-25'));
ok('a passed deadline is negative, not clamped to zero',
   LMR.monthsToDeadline('2026-01-01', '2026-08-25') < 0,
   LMR.monthsToDeadline('2026-01-01', '2026-08-25'));
ok('no deadline yields null', LMR.monthsToDeadline(null, '2026-08-25') === null);

console.log('\n' + (fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                               : pass + ' passed, ' + fail + ' FAILED'));
process.exit(fail === 0 ? 0 : 1);
