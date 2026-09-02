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
    /* market:'new' pinned explicitly. This fixture is a SHUT site, so it now defaults to the
       secondary market -- and these three assertions are about the civil decoupling, not about
       the market axis. Letting them ride the default would make them move for a reason that has
       nothing to do with what they claim. */
    { asOf: '2026-08-30', market: 'new' });
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
    /* market:'new' for the same reason: this block is about the age curve, and a shut site now
       defaults to used, so an unpinned market would confound the two axes it is separating. */
    return SI.capitalAvoided(o, { asOf: '2026-08-30', market: 'new' });
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

console.log('\n=== new and used are different markets, not different discounts ===');
function mk(years, opts) {
    var sd = { collectionSystem: 'Yes', projectStatus: 'Shutdown' };
    if (years !== null) {
        sd.projectShutdownDate = new Date(Date.parse('2026-08-30T00:00:00Z') -
            years * 365.25 * 86400000).toISOString().slice(0, 10);
    }
    var o = { asOf: '2026-08-30' };
    for (var k in (opts || {})) o[k] = opts[k];
    return SI.capitalAvoided({ id: 'm', energyType: 'landfill_gas', powerPotentialKw: 2160,
                               latitude: 40, longitude: -74, existingGenerationKw: 2160,
                               sourceDetail: sd }, o);
}
function comp(r, id) {
    return (r.components || []).filter(function (p) { return p.id === id; })[0] || {};
}

/* REGRESSION FIRST. Forced to new, every figure is what it was before the market axis existed. */
var atNew = mk(null, { market: 'new' });
ok('forced new: full build is unchanged', atNew.totalBuildUsd === 4125600, atNew.totalBuildUsd);
ok('forced new: capital avoided is unchanged', atNew.avoidedUsd === 1740960, atNew.avoidedUsd);
ok('forced new: still to spend is unchanged', atNew.requiredUsd === 2384640, atNew.requiredUsd);
ok('and it reports the market it priced in', atNew.market === 'new', atNew.market);

var atUsed = mk(null, { market: 'used' });
ok('used generation is the quote net of commissioning',
   comp(atUsed, 'generation').perKw === 225, comp(atUsed, 'generation').perKw);
ok('and the full build falls to 2,397,600', atUsed.totalBuildUsd === 2397600, atUsed.totalBuildUsd);
/* Interconnection and gas treatment have secondary markets too -- the saving is NOT generation
   alone, which is what made the first estimate of this number wrong. */
ok('electrical is priced used as well', comp(atUsed, 'electrical').perKw === 85,
   comp(atUsed, 'electrical').perKw);
ok('and gas treatment', comp(atUsed, 'gasTreatment').perKw === 190,
   comp(atUsed, 'gasTreatment').perKw);

/* NO USED MARKET MEANS UNCHANGED, ASSERTED RATHER THAN ASSUMED. A wellfield is drilled in place
   and there is nothing to resell; concrete is concrete. */
['collection', 'civil'].forEach(function (id) {
    ok(id + ' costs the same in either market',
       comp(atUsed, id).perKw === comp(atNew, id).perKw, comp(atUsed, id).perKw);
    ok('and says it has no used market, rather than showing a saving of zero',
       comp(atUsed, id).usedMarket === false);
});
ok('while generation says it does have one', comp(atUsed, 'generation').usedMarket === true);

/* THE INDEPENDENCE THAT MATTERS, and the one place an interaction could hide: the avoided column
   moves on BOTH axes, so a market rate leaking into the condition discount would look like a
   plausible number. The discount is asserted identical across markets at four ages. */
[null, 3, 12.7, 30].forEach(function (y) {
    var n = mk(y, { market: 'new' }), u = mk(y, { market: 'used' });
    ['generation', 'gasTreatment', 'electrical', 'civil', 'collection'].forEach(function (id) {
        ok('at ' + y + ' years, ' + id + ' has the same discount in both markets',
           comp(n, id).discount === comp(u, id).discount,
           comp(n, id).discount + ' vs ' + comp(u, id).discount);
    });
    /* And the other direction: the market rate is the same whatever the age. */
    ok('at ' + y + ' years, the used generation rate is unmoved by age',
       comp(u, 'generation').perKw === 225, comp(u, 'generation').perKw);
    ok('and the full build is unmoved by age in either market',
       n.totalBuildUsd === 4125600 && u.totalBuildUsd === 2397600,
       n.totalBuildUsd + ' / ' + u.totalBuildUsd);
});
/* Stated as the factorisation it is: avoided = full(market) x discount(age), so the ratio
   between markets is constant across every age. If the two ever interacted this would drift. */
var ratios = [null, 3, 12.7, 30].map(function (y) {
    var n = mk(y, { market: 'new' }), u = mk(y, { market: 'used' });
    return Math.round(comp(u, 'generation').avoidedUsd / comp(n, 'generation').avoidedUsd * 1e6);
});
ok('the used/new avoided ratio is identical at every age', ratios.every(function (r) {
    return r === ratios[0];
}), ratios.join(', '));
/* AND IT EQUALS THE RATE RATIO EXACTLY, which is the assertion that actually pins the
   factorisation. "Constant across ages" is also true of a uniform extra multiplier applied to
   every used row -- a secret 0.9 on used values keeps every ratio equal to every other and
   sails past the check above. Comparing the reported `discount` field does not catch it either,
   because such a multiplier would not touch that field. Only the absolute ratio does. */
var expected = Math.round(SiteCapex.usedRates().generationPerKw /
                          SiteCapex.rates().generationPerKw * 1e6);
ok('and it equals used/new rate exactly, so nothing else is multiplied in',
   ratios[0] === expected, ratios[0] + ' vs ' + expected);
/* The same absolutely, on the figure that decides anything. */
var nNew = mk(12.7, { market: 'new' }), nUsed = mk(12.7, { market: 'used' });
ok('full build scales by exactly the rate change and nothing more',
   nUsed.totalBuildUsd === 2397600 && nNew.totalBuildUsd === 4125600,
   nUsed.totalBuildUsd + ' / ' + nNew.totalBuildUsd);

/* THE COUNTERINTUITIVE RESULT, pinned because somebody will read it as a bug: a site in BETTER
   condition saves LESS by buying used, because you only pay for what you do not inherit. */
var recent = mk(3, { market: 'new' }), median = mk(12.7, { market: 'new' });
var recentSave = mk(3, { market: 'used' }), medianSave = mk(12.7, { market: 'used' });
var rs = recent.requiredUsd - recentSave.requiredUsd;
var ms = median.requiredUsd - medianSave.requiredUsd;
ok('a three-year shutdown saves less than a median one', rs < ms, rs + ' vs ' + ms);
ok('and the module reports that saving rather than leaving it to be computed',
   mk(3, { market: 'used' }).requiredSavingUsd === rs,
   mk(3, { market: 'used' }).requiredSavingUsd + ' vs ' + rs);

/* THE DEFAULT: shutdown only. 462 sites against 10,682 -- a default that reprices nine tenths
   of the catalogue becomes invisible and then load-bearing. */
ok('a shut site defaults to used', mk(3).market === 'used', mk(3).market);
var running = SI.capitalAvoided(
    { id: 'r', energyType: 'landfill_gas', powerPotentialKw: 2160, latitude: 40, longitude: -74,
      existingGenerationKw: 2160,
      sourceDetail: { collectionSystem: 'Yes', projectStatus: 'Operational' } },
    { asOf: '2026-08-30' });
ok('a RUNNING plant does not: you inherit that equipment rather than buying it, and the ' +
   'condition discount already prices it', running.market === 'new', running.market);
var raw = SI.capitalAvoided(
    { id: 'g', energyType: 'landfill_gas', powerPotentialKw: 2160, latitude: 40, longitude: -74,
      sourceDetail: { collectionSystem: 'No' } }, { asOf: '2026-08-30' });
ok('and neither does a raw resource', raw.market === 'new', raw.market);

/* Per-component override beats the site setting. */
var mixed = mk(null, { market: 'new', marketOverride: { generation: 'used' } });
ok('one component can be overridden', comp(mixed, 'generation').perKw === 225);
ok('without moving the others', comp(mixed, 'electrical').perKw === 150,
   comp(mixed, 'electrical').perKw);

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
// 33 after the coverage sweep (was 31): two rescued project rows also carry a shutdown
// wellfield. The property — every one prices non-zero avoided capital — is what matters;
// the count only pins the fixture's reach.
ok('all 33 collectionSystem = Shutdown sites carry non-zero avoided capital',
   shut.length === 33 && avoided.every(function(v) { return v > 0; }),
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
