// Tests for site-infrastructure.js — capital avoided.
//
// Against the real artifacts where the claim is about the data, and against fixtures where the
// claim is about the arithmetic.
//
// The assertions that matter most are the ones encoding decisions the commissioning brief got
// wrong or left implicit, because those are the ones a future edit will quietly undo.

var path = require('path');
var ROOT = path.join(__dirname, '..');
global.SiteSources = require(path.join(ROOT, 'site-sources.js'));
global.SiteCapex = require(path.join(ROOT, 'site-capex.js'));
var SS = global.SiteSources;
var LS = require(path.join(ROOT, 'source-landfill.js'));
var CA = require(path.join(ROOT, 'source-landfill-ca.js'));
/* Exposed on the global as well as bound locally: site-capex.js's collection component asks
   `typeof SiteInfrastructure` rather than deriving a second answer about whether a field is in
   the ground, and a module required into a local variable is invisible to that lookup. */
var SI = global.SiteInfrastructure = require(path.join(ROOT, 'site-infrastructure.js'));

var pass = 0, fail = 0;
function ok(label, cond, got) {
    if (cond) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + (got === undefined ? '' : '   got ' + JSON.stringify(got))); }
}
var NOW = '2026-08-26';
function lf(over) {
    var base = { id: 't', name: 'T', powerPotentialKw: 5000, energyType: 'landfill_gas',
                 existingGenerationKw: null, sourceDetail: {} };
    for (var k in (over || {})) {
        if (k === 'sourceDetail') { for (var j in over[k]) base.sourceDetail[j] = over[k][j]; }
        else base[k] = over[k];
    }
    return base;
}

console.log('\n=== rates come from site-capex, not a second table ===');
/* The brief carried its own per-kW figures: generation $300-500/kW against site-capex's $900.
   2.25x apart, $2.5M at 5 MW. Two tables would let this module say "avoided $2.0M" while the
   capex stack beside it charges $4.5M for the same equipment, and they would drift apart on
   every tuning pass. That is the acquisition-vs-refurb bug already found in this codebase. */
ok('generation is priced at the capex stack rate, not the brief\'s',
   SI.rates().generation === SiteCapex.rates().generationPerKw,
   SI.rates().generation + ' vs ' + SiteCapex.rates().generationPerKw);
ok('treatment and electrical likewise',
   SI.rates().gasTreatment === SiteCapex.rates().gasTreatmentPerKw &&
   SI.rates().electrical === SiteCapex.rates().interconnectionPerKw);
/* THIS ASSERTION IS DELIBERATELY INVERTED. It used to assert that collectionPerKw was ABSENT
   from the capex card, because site-infrastructure declared the rate itself -- and that was the
   honest description of the code at the time.

   It is wrong now, and the reason is worth keeping: the budget module reads rates from both
   modules, so two declarations of the same $550 would drift the moment anyone edited the card,
   and would show up as a variance against a budget rather than as a bug.

   THE GAP IS NOW CLOSED, and the assertion that used to pin it open was checking nothing.

   It read `stack({ usable_kw: 2000, ... }).components.every(c => c.id !== 'collection')`. stack()
   does not read usable_kw — it reads powerPotentialKw or ctx.capacityKw — so the fixture failed
   the capacity check, returned EARLY with zero components, and `[].every(...)` is vacuously
   true. It would have gone on passing the day somebody added a collection component, which is
   the one event it existed to catch. An assertion that passes for a reason other than the one
   written beside it is worse than none, because the next reader trusts the comment.

   Both halves are asserted below against a fixture the stack actually prices. */
ok('the collection rate comes off the shared capex card, not a second declaration',
   SI.rates().collection === SiteCapex.rates().collectionPerKw &&
   SiteCapex.rates().collectionPerKw === 550);

/* ---- A PAD IS NOT A STARTUP ------------------------------------------------------------
 *
 * capitalAvoided()'s 'Civil / pad' component sourced its rate from commissioningPerKw --
 * startup, tuning, emissions testing, first fire. Two unrelated facts on one number, and
 * setRate() is public, so editing the startup rate moved the displayed cost of a pad: on a
 * 2,160 kW site, $129,600 to $432,000, and the full build with it. A wrong number shown
 * confidently.
 *
 * BOTH DIRECTIONS ARE ASSERTED. "civil does not follow commissioning" is equally true of a
 * rate that is wired to nothing at all, so the second half proves the new wire carries. */
SiteCapex.reset();
ok('civil is priced from its own rate', SI.rates().civil === SiteCapex.rates().civilPerKw,
   SI.rates().civil);
ok('and that rate is still 60, so nothing re-baselined', SiteCapex.rates().civilPerKw === 60,
   SiteCapex.rates().civilPerKw);
SiteCapex.setRate('commissioningPerKw', 200);
ok('editing the startup rate no longer moves the pad', SI.rates().civil === 60, SI.rates().civil);
SiteCapex.reset();
SiteCapex.setRate('civilPerKw', 200);
ok('editing the civil rate does move it', SI.rates().civil === 200, SI.rates().civil);
SiteCapex.reset();
/* The identity digest for the decoupling: it is a structural change and every figure on the
   panel must be untouched by it. 2,160 kW, collection present, generation shut. */
var IDENT = SI.capitalAvoided(
    { id: 'ident', energyType: 'landfill_gas', powerPotentialKw: 2160,
      latitude: 40, longitude: -74, existingGenerationKw: 2160,
      sourceDetail: { collectionSystem: 'Yes', projectStatus: 'Shutdown' } },
    { asOf: '2026-08-30' });
ok('the 2,160 kW digest: full build', IDENT.totalBuildUsd === 4125600, IDENT.totalBuildUsd);
ok('the 2,160 kW digest: capital avoided', IDENT.avoidedUsd === 1740960, IDENT.avoidedUsd);
ok('the 2,160 kW digest: still to spend', IDENT.requiredUsd === 2384640, IDENT.requiredUsd);
var greenfield = SiteCapex.stack(
    { powerPotentialKw: 2000, development_stage: 'raw_resource', energyType: 'landfill_gas',
      sourceDetail: { collectionSystem: 'No' } }, {});
ok('the fixture actually prices, so the assertions below are not checking an empty list',
   greenfield.components.length > 5, greenfield.components.length + ' components');
var coll = greenfield.components.filter(function (c) { return c.id === 'collection'; })[0];
ok('the stack now HAS a collection component', !!coll);
ok('and a greenfield landfill with no collection is charged for the field it must drill',
   coll && coll.state === 'incurred' && coll.usd === 550 * 2000,
   coll ? coll.state + ' ' + coll.usd : 'absent');

console.log('\n=== the shutdown discount is an age curve, on the two components that have one ===');
/* The flat 0.35 was site-capex.js's bopRetained -- the balance-of-plant floor -- applied
   universally with the age curve above it dropped. This restores the missing half; it does not
   replace a wrong model with a right one, and the floor's reasoning is kept. */
function shut(years, over) {
    var d = new Date(Date.parse('2026-08-30T00:00:00Z') - years * 365.25 * 86400000);
    var o = { id: 's', energyType: 'landfill_gas', powerPotentialKw: 2160,
              latitude: 40, longitude: -74, existingGenerationKw: 2160,
              sourceDetail: { collectionSystem: 'Yes', projectStatus: 'Shutdown',
                              projectShutdownDate: d.toISOString().slice(0, 10) } };
    for (var k in (over || {})) o[k] = over[k];
    return SI.capitalAvoided(o, { asOf: '2026-08-30' });
}
function part(res, id) {
    return (res.components || []).filter(function (p) { return p.id === id; })[0] || {};
}
ok('a three-year-old shutdown retains far more than the floor',
   part(shut(3), 'generation').discount === 0.75, part(shut(3), 'generation').discount);
ok('and the row says the discount was computed from an age',
   part(shut(3), 'generation').agedDiscount === true);
ok('naming the age it used', part(shut(3), 'generation').yearsSinceShutdown === 3,
   part(shut(3), 'generation').yearsSinceShutdown);
/* THE FLOOR HOLDS. site-capex.js gives generation a balance-of-plant floor because the
   foundation, enclosure, switchgear and controls survive an engine that does not, so a
   thirty-year-old machine is still worth the floor even though the raw curve says scrap. */
ok('a thirty-year-old shutdown floors at bopRetained rather than going to zero',
   part(shut(30), 'generation').discount === SiteCapex.settings().bopRetained,
   part(shut(30), 'generation').discount);
/* AND GAS TREATMENT DELIBERATELY GETS NO FLOOR: a siloxane skid is vessels and media with its
   own life, and giving it a generator's floor is the category error in the other direction. */
ok('gas treatment is aged too', part(shut(3), 'gasTreatment').discount === 0.75);
ok('but gets no floor, so thirty years is zero',
   part(shut(30), 'gasTreatment').discount === 0,
   part(shut(30), 'gasTreatment').discount);

/* THE DIVERGENCES ARE MEASURED, NOT RECONCILED. site-capex.js has no refurb model for these,
   and inventing one to satisfy consistency would be worse than the inconsistency. Crediting
   idle switchgear at the 1.0 STAGE_RETAINED gives interconnection would assert it is as good
   as new, which is the condition doubt the unverified banner exists to raise. */
[3, 30].forEach(function (y) {
    ok('electrical stays flat at ' + y + ' years, deliberately',
       part(shut(y), 'electrical').discount === 0.35, part(shut(y), 'electrical').discount);
    ok('civil stays flat at ' + y + ' years, deliberately',
       part(shut(y), 'civil').discount === 0.35, part(shut(y), 'civil').discount);
    ok('and both say they were not aged',
       part(shut(y), 'electrical').agedDiscount === false &&
       part(shut(y), 'civil').agedDiscount === false);
});
ok('a present collection system keeps its own discount',
   part(shut(3), 'collection').discount === 0.60, part(shut(3), 'collection').discount);

/* NO DATE FALLS BACK TO THE FLOOR AND SAYS SO, rather than going unknown. Losing a number that
   exists today would be worse than carrying a conservative one, but a defaulted discount and a
   computed one must not look the same. Not exercised by today's catalogue -- all 462
   generation-shutdown sites publish a date -- so it is asserted from a fixture. */
var undated = SI.capitalAvoided(
    { id: 'u', energyType: 'landfill_gas', powerPotentialKw: 2160, latitude: 40, longitude: -74,
      existingGenerationKw: 2160,
      sourceDetail: { collectionSystem: 'Yes', projectStatus: 'Shutdown' } },
    { asOf: '2026-08-30' });
ok('no shutdown date still yields a discount', part(undated, 'generation').discount === 0.35);
ok('and the row shows it was defaulted, not computed',
   part(undated, 'generation').agedDiscount === false &&
   part(undated, 'generation').yearsSinceShutdown === null);

/* ASKED, NOT COPIED. A second curve here would agree with site-capex.js until one was tuned. */
ok('the curve is site-capex\'s, not a copy',
   part(shut(7), 'generation').discount === SiteCapex.refurbRetained(7),
   part(shut(7), 'generation').discount + ' vs ' + SiteCapex.refurbRetained(7));

/* THE FULL BUILD MUST NOT MOVE. This changes a discount, and a discount only ever divides
   avoided from required — if totalBuildUsd moved, something else changed too. */
[0.5, 3, 12, 30].forEach(function (y) {
    ok('full build is untouched at ' + y + ' years', shut(y).totalBuildUsd === 4125600,
       shut(y).totalBuildUsd);
});

console.log('\n=== generation is read from the field, not inferred from status ===');
/* The brief proposed operational/construction/shutdown -> "generation present". Measured on the
   artifact that asserts equipment on ~470 sites with none on record: only 14% of Construction and
   5% of Planned rows carry a generator, and 32% of Shutdown rows do not either. */
ok('a Shutdown project with NO generator on record is not credited with one',
   SI.inventory(lf({ sourceDetail: { projectStatus: 'Shutdown', collectionSystem: 'Yes' } })).generation !== 'present',
   SI.inventory(lf({ sourceDetail: { projectStatus: 'Shutdown', collectionSystem: 'Yes' } })).generation);
ok('a Construction project with no generator on record is not credited either',
   SI.inventory(lf({ sourceDetail: { projectStatus: 'Construction' } })).generation === 'unknown');
ok('a generator on record IS credited, and reads shutdown when the project is shut',
   SI.inventory(lf({ existingGenerationKw: 2000, sourceDetail: { projectStatus: 'Shutdown' } })).generation === 'shutdown');
ok('...and present when it is not',
   SI.inventory(lf({ existingGenerationKw: 2000, sourceDetail: { projectStatus: 'Operational' } })).generation === 'present');
ok('a Candidate landfill is absent, not unknown — LMOP is stating there is no project',
   SI.inventory(lf({ sourceDetail: { projectStatus: 'Candidate' } })).generation === 'absent');

console.log('\n=== treatment, electrical and civil follow generation ===');
var inv = SI.inventory(lf({ existingGenerationKw: 2000, sourceDetail: { projectStatus: 'Shutdown' } }));
ok('they inherit the generation state', inv.gasTreatment === 'shutdown' && inv.electrical === 'shutdown' && inv.civil === 'shutdown');
ok('and they are absent where generation is absent',
   SI.inventory(lf({ sourceDetail: { projectStatus: 'Candidate' } })).gasTreatment === 'absent');

console.log('\n=== the condition discount, which is the whole risk ===');
var unver = SI.capitalAvoided(lf({ existingGenerationKw: 5000, sourceDetail: { projectStatus: 'Shutdown', collectionSystem: 'Yes' } }), { asOf: NOW });
var ver = SI.capitalAvoided(lf({ existingGenerationKw: 5000, sourceDetail: { projectStatus: 'Shutdown', collectionSystem: 'Yes', infraConditionVerified: true } }), { asOf: NOW });
ok('conditionVerified defaults FALSE — only an inspection can clear it', unver.conditionVerified === false);
ok('an unverified shutdown asset is discounted hard', unver.avoidedUsd < ver.avoidedUsd * 0.6,
   unver.avoidedUsd + ' vs ' + ver.avoidedUsd);
ok('verifying a site is worth real money', ver.avoidedUsd - unver.avoidedUsd > 1000000,
   ver.avoidedUsd - unver.avoidedUsd);
ok('every result carries its verification status, always',
   unver.conditionVerified !== undefined && ver.conditionVerified === true);

console.log('\n=== mandated capital: the contradiction this brief exists to resolve ===');
/* A Canadian jan_2029 site has NO collection and must still score, because the operator is
   legally obliged to install it. A US site with no collection and no mandate must not. */
var mandated = lf({ powerPotentialKw: 2000, sourceDetail: {
    hasExistingControls: false, lmrCohort: 'jan_2029', lmrDeadline: '2029-01-01' } });
var noMandate = lf({ powerPotentialKw: 2000, sourceDetail: { collectionSystem: 'No' } });
ok('a mandated site reads collection = mandated',
   SI.inventory(mandated).collection === 'mandated');
ok('a US site with no collection and no mandate reads absent',
   SI.inventory(noMandate).collection === 'absent');
var mA = SI.capitalAvoided(mandated, { asOf: NOW }), nA = SI.capitalAvoided(noMandate, { asOf: NOW });
ok('mandated capital counts and unmandated does not',
   mA.avoidedUsd > 0 && nA.avoidedUsd === 0, mA.avoidedUsd + ' vs ' + nA.avoidedUsd);
// Mandated is bought NEW, so there is no condition to doubt and no discount to apply.
ok('mandated capital takes NO condition discount — the operator is buying new',
   mA.components.filter(function(x) { return x.state === 'mandated'; })[0].discount === 1);

console.log('\n=== mandate timing decays ===');
function at(when) { return SI.capitalAvoided(mandated, { asOf: when }).avoidedUsd; }
ok('28 months out (today) beats 6 months out', at('2026-08-26') > at('2028-07-01'),
   at('2026-08-26') + ' vs ' + at('2028-07-01'));
ok('...and 6 months out beats past the deadline', at('2028-07-01') > at('2029-06-01'));
ok('too EARLY is also discounted — no budget pressure at 5 years out',
   at('2024-01-01') < at('2026-08-26'), at('2024-01-01') + ' vs ' + at('2026-08-26'));
ok('an unknown deadline neither rewards nor punishes', SI.mandateFactor(null) === 0.6);

console.log('\n=== the band is a stress test, applied to everything at once ===');
var site = lf({ existingGenerationKw: 5000, sourceDetail: { projectStatus: 'Shutdown', collectionSystem: 'Yes' } });
var lo = SI.capitalAvoided(site, { band: 'low', asOf: NOW });
var hi = SI.capitalAvoided(site, { band: 'high', asOf: NOW });
ok('high band exceeds low on both sides of the ledger',
   hi.avoidedUsd > lo.avoidedUsd && hi.requiredUsd > lo.requiredUsd);
ok('the SHARE avoided is band-invariant — the band cannot flatter a site',
   SI.avoidedScore(site, { band: 'low', asOf: NOW }) === SI.avoidedScore(site, { band: 'high', asOf: NOW }));

console.log('\n=== against the real artifacts ===');
var LMOP = require(path.join(ROOT, 'data', 'landfills.json')).projects;
var shut = LMOP.filter(function(p) { return p.collectionSystem === 'Shutdown'; });
var norm = shut.map(function(p) { return SS.normalize(LS.adapter.normalize(p), 'lmop-landfill'); });
var avoided = norm.map(function(c) { return SI.capitalAvoided(c, { asOf: NOW }).avoidedUsd; });
ok('all 31 collectionSystem = Shutdown sites carry non-zero avoided capital',
   shut.length === 31 && avoided.every(function(v) { return v > 0; }),
   shut.length + ' sites, ' + avoided.filter(function(v) { return !(v > 0); }).length + ' at zero');

// The ranking claim the whole brief rests on.
var withInfra = SS.normalize(LS.adapter.normalize(
    LMOP.filter(function(p) { return p.collectionSystem !== 'No' && (p.ratedMw || p.actualMw) > 0
        && /shutdown/i.test(p.projectStatus || '') && p.powerPotentialKw > 900; })[0]), 'lmop-landfill');
var bareBetterGas = lf({ powerPotentialKw: withInfra.powerPotentialKw * 2,
    sourceDetail: { projectStatus: 'Candidate', collectionSystem: 'Yes' } });
ok('a shut site with collection AND generation outscores a bigger candidate with neither',
   SI.avoidedScore(withInfra, { asOf: NOW }) > SI.avoidedScore(bareBetterGas, { asOf: NOW }),
   SI.avoidedScore(withInfra, { asOf: NOW }) + ' vs ' + SI.avoidedScore(bareBetterGas, { asOf: NOW }));

var CAD = require(path.join(ROOT, 'data', 'landfills-ca.json')).prospects
    .filter(function(p) { return p.current && p.lmrCohort === 'jan_2029'; })
    .map(function(p) { return SS.normalize(CA.adapter.normalize(p), 'eccc-landfill-ca'); });
ok('every Canadian jan_2029 site carries avoided capital via the mandated path',
   CAD.length > 0 && CAD.every(function(c) { return SI.capitalAvoided(c, { asOf: NOW }).avoidedUsd > 0; }),
   CAD.length + ' sites');
ok('...and the same site at 36 months outranks itself at 6',
   SI.capitalAvoided(CAD[0], { asOf: '2026-01-01' }).avoidedUsd >
   SI.capitalAvoided(CAD[0], { asOf: '2028-07-01' }).avoidedUsd);

console.log('\n=== nothing reports a figure without a status attached ===');
var sample = norm.slice(0, 10).concat(CAD.slice(0, 10));
ok('every result carries conditionVerified and a confidence',
   sample.every(function(c) {
       var r = SI.capitalAvoided(c, { asOf: NOW });
       return typeof r.conditionVerified === 'boolean' && !!r.confidence;
   }));
ok('and a null-capacity site yields nulls rather than a zero it did not earn',
   SI.capitalAvoided(lf({ powerPotentialKw: null }), { asOf: NOW }).avoidedUsd === null);

console.log('\n' + (fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                               : pass + ' passed, ' + fail + ' FAILED'));
process.exit(fail === 0 ? 0 : 1);
