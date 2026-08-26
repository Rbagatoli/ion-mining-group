// Tests for the Canadian landfill adapter, against the REAL artifact.
//
// Against the artifact and not a fixture, deliberately: the claims worth pinning here are claims
// about ECCC's data — that the identity key is stable, that the cohort split is not an artefact
// of one heuristic, that the Canadian layer does not quietly outrank the US one — and a fixture
// would only prove the adapter agrees with itself.
//
// Through SiteSources.normalize, NOT the adapter alone. The shared candidate shape is a hard
// whitelist: a key the adapter sets but the whitelist does not name is dropped in silence, and
// this file exists partly to catch that.

var path = require('path');
var ROOT = path.join(__dirname, '..');

global.SiteSources = require(path.join(ROOT, 'site-sources.js'));
global.Jurisdictions = require(path.join(ROOT, 'jurisdictions.js'));
var LMR = require(path.join(ROOT, 'lmr.js'));
var CA = require(path.join(ROOT, 'source-landfill-ca.js'));
var SA = require(path.join(ROOT, 'site-acquirability.js'));
var ART = require(path.join(ROOT, 'data', 'landfills-ca.json'));

var pass = 0, fail = 0;
function ok(label, cond, got) {
    if (cond) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + (got === undefined ? '' : '   got ' + JSON.stringify(got))); }
}

var ALL = ART.prospects.map(CA.normalize);
var CUR = ART.prospects.filter(function(p) { return p.current; }).map(CA.normalize);

console.log('\n=== the artifact ===');
ok('the index built and carries prospects', ART.prospects.length > 0, ART.prospects.length);
ok('licence is recorded on the artifact', /Open Government Licence/i.test(ART.licence || ''));
ok('the reporting year is recorded', ART.reportingYear >= 2024, ART.reportingYear);

/* IDENTITY. facilityId LOOKS like a primary key and is not stable between reporting years: the
   same landfill filing every year from 2010 carries a different one in most filings. Keying on it
   turned 156 landfills into 972 prospects, each with one year of history and a cohort derived
   from whichever year that slice happened to be — a pipeline six times richer than the country.
   This is the assertion that stops that coming back. */
var ids = {};
ALL.forEach(function(c) { ids[c.id] = (ids[c.id] || 0) + 1; });
ok('every prospect id is unique', Object.keys(ids).length === ALL.length,
   ALL.length - Object.keys(ids).length + ' duplicates');
ok('the facility count is a plausible national population, not a per-year explosion',
   ALL.length > 80 && ALL.length < 400, ALL.length);
var multiYear = ART.prospects.filter(function(p) { return p.series && p.series.length > 3; });
ok('most facilities carry real history, which only works if the key is stable',
   multiYear.length > ALL.length * 0.5, multiYear.length + ' of ' + ALL.length);

console.log('\n=== the shared candidate shape ===');
ok('every candidate is Canadian', ALL.every(function(c) { return c.iso3 === 'CAN'; }));
ok('every candidate is landfill_gas', ALL.every(function(c) { return c.energyType === 'landfill_gas'; }));
// The brief names this explicitly, and site-capex.js gates treatment capex on it.
ok('requires_gas_treatment is true for EVERY Canadian LFG prospect',
   ALL.every(function(c) { return (c.sourceDetail || {}).requiresGasTreatment === true; }));
ok('existing generation is null, never 0 — ECCC publishes no capacity at all',
   ALL.every(function(c) { return c.existingGenerationKw === null; }));
ok('the LMR fields survive the whitelist via sourceDetail',
   CUR.length > 0 && CUR.every(function(c) { return (c.sourceDetail || {}).lmrCohort !== undefined; }));

console.log('\n=== s.5 cohorts, on real data ===');
var cohorts = {};
CUR.forEach(function(c) { var k = c.sourceDetail.lmrCohort; cohorts[k] = (cohorts[k] || 0) + 1; });
console.log('        ' + JSON.stringify(cohorts));
ok('the forced-buyer cohort is populated', (cohorts.jan_2029 || 0) > 0, cohorts.jan_2029);
ok('the 2028 cohort is populated too — a split that produced only one side would be a bug',
   (cohorts.jan_2028 || 0) > 0, cohorts.jan_2028);
/* The 664-999 t tier. The brief treated it as unregulated; s.5(3) gives it a 2035 date. If this
   ever reads zero, either the data changed or the tier got dropped again. */
ok('the s.5(3) 2035 tier exists in the data', (cohorts.jan_2035 || 0) > 0, cohorts.jan_2035);
ok('no facility lands in the retired "mixed" bucket', !cohorts.mixed);

console.log('\n=== the regulation drives acquirability, not opportunity ===');
var j29 = CUR.filter(function(c) { return c.sourceDetail.lmrCohort === 'jan_2029'; });
ok('2029 sites carry an lmr_jan_2029 distress signal',
   j29.length > 0 && j29.every(function(c) {
       return (c.distressSignals || []).some(function(s) { return s.type === 'lmr_jan_2029'; });
   }));
ok('the signal is dated to when the obligation began, so half-life ages it honestly',
   j29.every(function(c) {
       return (c.distressSignals || []).every(function(s) { return /^2025-12-12/.test(s.date || ''); });
   }));
// The reason this is an acquirability signal at all: a forced buyer is more GETTABLE.
var a29 = SA.score(j29[0], { asOf: '2026-08-25' });
var noSignal = SA.score(Object.assign({}, j29[0], { distressSignals: [] }), { asOf: '2026-08-25' });
ok('an LMR obligation raises acquirability above the same site without one',
   a29.score !== null && noSignal.score !== null && a29.score > noSignal.score,
   a29.score + ' vs ' + noSignal.score);
ok('the signal is RECOGNISED, not silently dropped as an unknown type',
   (a29.unknownSignals || []).length === 0, a29.unknownSignals);
// 2029 must outrank 2028: the 2028 operator already owns collection, so the capital gap a
// partner fills is smaller and they have more ways to comply without one.
ok('lmr_jan_2029 is weighted above lmr_jan_2028',
   SA.DEFAULT_SIGNALS.lmr_jan_2029 > SA.DEFAULT_SIGNALS.lmr_jan_2028);
ok('lmr_jan_2029 outranks the US shutdown signal, which is an idle asset not a forced buyer',
   SA.DEFAULT_SIGNALS.lmr_jan_2029 > SA.DEFAULT_SIGNALS.lmop_shutdown);

console.log('\n=== development stage is honest about what a flare proves ===');
var flaring = CUR.filter(function(c) { return c.sourceDetail.hasFlaring === true; });
ok('sites reporting gas destruction reach "permitted"',
   flaring.length === 0 || flaring.every(function(c) { return c.developmentStage === 'permitted'; }));
/* NOT 'constructed'. A flare proves wells, a header and an approval. It proves nothing about a
   generator, and 'constructed' in this model means the power asset is standing — claiming it
   would rank a Canadian flare level with a US shutdown project that has an engine on a pad. */
ok('no Canadian site claims "constructed" — none has a generator on record',
   CUR.every(function(c) { return c.developmentStage !== 'constructed'; }));

console.log('\n=== jurisdiction: the tax disadvantage is preserved ===');
/* The brief asked that the LMR advantage NOT be used to offset the ADS/§168(g) drag, and that
   both net out in the composite instead. The way that is honoured here is structural: the LMR
   lives on the acquirability axis and jurisdiction on the opportunity axis, so neither can
   silently cancel the other. */
ok('Canada still scores below the US on jurisdiction',
   Jurisdictions.score('CAN') < Jurisdictions.score('USA'),
   Jurisdictions.score('CAN') + ' vs ' + Jurisdictions.score('USA'));
ok('and the Canadian adapter does not touch the jurisdiction table',
   Jurisdictions.score('CAN') === 85, Jurisdictions.score('CAN'));

console.log('\n=== capacity ===');
var withKw = CUR.filter(function(c) { return c.powerPotentialKw > 0; });
ok('most current facilities have a modelled capacity', withKw.length > CUR.length * 0.8,
   withKw.length + ' of ' + CUR.length);
/* THE INCINERATOR GUARD. NAICS 562210 contains municipal waste-to-energy plants as well as
   landfills, and they report huge biogenic CO2 against almost no methane -- which the
   capture arithmetic read as a 35 MW landfill. lmr.js rejects any implied capture above what a
   collection system can physically reach. Canada's largest real landfill is a few MW, so a
   double-digit figure is the shape of that bug returning. */
ok('no site claims a capacity only an incinerator could produce',
   withKw.every(function(c) { return c.powerPotentialKw < 20000; }),
   Math.max.apply(null, withKw.map(function(c) { return c.powerPotentialKw; })));
ok('the known waste-to-energy plants did not survive as landfill prospects',
   !CUR.some(function(c) {
       return /waste-to-energy|valorisation .nerg|Energy Centre/i.test(c.name || '') &&
              c.powerPotentialKw > 5000;
   }));
// The brief's scale expectation was "tens of viable candidates". Recorded rather than asserted
// as a range, because it is a fact about Canada that will drift with the data.
console.log('        >=0.5 MW: ' + withKw.filter(function(c) { return c.powerPotentialKw >= 500; }).length +
            '   >=1 MW: ' + withKw.filter(function(c) { return c.powerPotentialKw >= 1000; }).length);

console.log('\n' + (fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                               : pass + ' passed, ' + fail + ' FAILED'));
process.exit(fail === 0 ? 0 : 1);
