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
var SI = require(path.join(ROOT, 'site-infrastructure.js'));

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

   WHAT HAS NOT CHANGED is the thing the old comment was really about: site-capex still prices no
   collection COMPONENT at any stage, so a greenfield landfill is still never charged for the
   field it would have to drill. The rate moving does not close that gap, and the assertion below
   pins the gap open so nobody mistakes one for the other. */
ok('the collection rate comes off the shared capex card, not a second declaration',
   SI.rates().collection === SiteCapex.rates().collectionPerKw &&
   SiteCapex.rates().collectionPerKw === 550);
ok('and the capex STACK still prices no collection component at any stage',
   SiteCapex.stack({ usable_kw: 2000, development_stage: 'raw_resource', energy_type: 'landfill_gas' }, {})
     .components.every(function (c) { return c.id !== 'collection'; }));

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
