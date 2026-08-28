// Right-sizing.
//
// The assertions are ranked by which wrong answer costs most:
//
//   1. A dollar figure that moved when the horizon moved. That is a decay curve arriving by the
//      back door, and it is the one thing the owner ruled out by name. Held down structurally:
//      the whole assessment is run at a 5-year horizon and a 40-year horizon and every _usd and
//      _kw field must be byte-identical.
//   2. A penalty of $0 where nothing was measured. "The build fits the gas exactly" and "what the
//      gas supports is unknown" are opposite claims, and 29 of 1,908 US landfill rows are in the
//      second state.
//   3. A staged build presented as a capital saving. Measured on the real estimator both paths
//      cost $5,776,000; the entire difference is time value. Calling it a saving is the error the
//      arithmetic invites.
//   4. A horizon-derived figure wearing a study's authority, or a study extended over years it
//      never examined.

var path = require('path');
var ROOT = path.join(__dirname, '..');

var pass = 0, fail = 0;
function ok(label, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + (detail === undefined ? '' : '\n        ' + detail)); }
}
function eq(label, a, b) { ok(label, a === b, 'got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); }

var _store = {};
global.localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null; },
    setItem: function (k, v) { _store[k] = String(v); },
    removeItem: function (k) { delete _store[k]; },
    key: function (i) { return Object.keys(_store)[i] || null; }
};
Object.defineProperty(global.localStorage, 'length', { get: function () { return Object.keys(_store).length; } });

global.CrmConfig = require(path.join(ROOT, 'crm-config.js'));
global.CrmLog = require(path.join(ROOT, 'crm-log.js'));
global.CrmDocuments = require(path.join(ROOT, 'crm-documents.js'));
global.CrmEnrichment = require(path.join(ROOT, 'crm-enrichment.js'));
global.SiteInfrastructure = require(path.join(ROOT, 'site-infrastructure.js'));
global.SiteCapex = require(path.join(ROOT, 'site-capex.js'));
global.SiteCapacity = require(path.join(ROOT, 'site-capacity.js'));
global.SiteData = require(path.join(ROOT, 'site-model.js'));
global.ProjectData = require(path.join(ROOT, 'project-model.js'));
global.ProjectGates = require(path.join(ROOT, 'project-gates.js'));
global.ProjectSizing = require(path.join(ROOT, 'project-sizing.js'));
var SiteData = global.SiteData, ProjectData = global.ProjectData;
var ProjectSizing = global.ProjectSizing, CrmDocuments = global.CrmDocuments;

/* A real site. Pinelands-shaped: 1.223 mmscfd collected converts at 2.08 to 2,544 kW gross, less
   10% parasitic = 2,289 kW supported. */
var MMSCFD = 1.223;
function fresh(opts) {
    var o = opts || {};
    _store = {};
    [global.CrmConfig, global.CrmLog, CrmDocuments, global.CrmEnrichment, ProjectData]
        .forEach(function (m) { if (m && m.reset) m.reset(); });
    /* NEITHER THE GAS VOLUME NOR THE HORIZON CAN LIVE ON THE PROSPECT. site-model.js blankSite()
       has no field for either, and normalize() discards unknown keys on save (site-model.js:120).
       Both reach the project through promote(), from the candidate the promotion form was looking
       at. Getting this wrong once is what surfaced it: a fixture that set
       sourceDetail.lfgCollectedMmscfd had it silently stripped, and the horizon-invariance
       assertion then passed on two empty objects — which is why that section carries a second
       assertion that the compared shape is not empty. */
    SiteData.add(SiteData.normalize({
        id: 'p1', name: 'Pinelands Park LF', energy_type: 'landfill_gas',
        development_stage: 'raw_resource', usable_kw: o.gross === undefined ? 2544 : o.gross
    }));
    var horizon = Object.prototype.hasOwnProperty.call(o, 'horizon') ? o.horizon : 18;
    var mm = Object.prototype.hasOwnProperty.call(o, 'mmscfd') ? o.mmscfd : MMSCFD;
    var pr = ProjectData.promote('p1', {
        capacity_kw: o.build === undefined ? 2289 : o.build,
        annual_cost_of_capital_pct: 11, budget_authorised_usd: 6000000,
        gas_mmscfd: mm,
        gas_basis: mm === null ? null : 'LMOP collected volume, 2024 reporting year',
        horizon_years: horizon,
        horizon_basis: horizon === null ? null
            : 'closed 2019, against a typical 25-year post-closure horizon'
    });
    if (!pr.ok) throw new Error('promote failed: ' + pr.err);
    return pr.project;
}

console.log('\n=== THE HORIZON NEVER MULTIPLIES A DOLLAR ===');
/* The structural guarantee, and the reason it is a test rather than a comment. Everything is run
   twice against horizons seven times apart. If anyone later wires remaining life into money, this
   fails instead of the number quietly becoming a forecast. */
function moneyShape(horizon) {
    fresh({ horizon: horizon });
    var p = ProjectData.list()[0];
    var a = ProjectSizing.assess(p);
    var s = ProjectSizing.staged(p, 1200, 36);
    function pick(o) {
        var out = {};
        Object.keys(o || {}).sort().forEach(function (k) {
            if (/_usd|_kw$|_kw_|per_kw|^build_|^supported_/.test(k) && typeof o[k] !== 'object') out[k] = o[k];
        });
        return out;
    }
    return JSON.stringify({ assess: pick(a), staged: pick(s) });
}
var atFive = moneyShape(5), atForty = moneyShape(40);
ok('every dollar and kW figure is identical at a 5-year and a 40-year horizon',
   atFive === atForty, 'h=5   ' + atFive + '\n        h=40  ' + atForty);
ok('and the shape is not vacuously empty', atFive.length > 120 && /penalty_usd/.test(atFive), atFive);
// The horizon is not being ignored — it moves the thing it is allowed to move.
fresh({ horizon: 5 });
var short5 = ProjectSizing.termSupport(ProjectData.list()[0], 2026);
fresh({ horizon: 40 });
var long40 = ProjectSizing.termSupport(ProjectData.list()[0], 2026);
ok('while term support does read it', short5.years_available === 5 && long40.years_available === 40,
   JSON.stringify([short5.years_available, long40.years_available]));
ok('and term support returns no currency field at all',
   Object.keys(long40).every(function (k) { return !/usd|cost|_\$/.test(k); }),
   Object.keys(long40).join(','));

console.log('\n=== the gas figure carries whose authority it is on ===');
fresh();
var p = ProjectData.list()[0];
var g = ProjectSizing.gasFigure(p);
eq('a published volume converts at 2.08 MW/mmscfd', g.gross_kw, Math.round(MMSCFD * 2.08 * 1000));
eq('less 10% parasitic for landfill gas', g.kw, Math.round(MMSCFD * 2.08 * 1000 * 0.9));
eq('and it is published, not studied', g.basis, 'published_volume');
eq('and it says it is directional', g.directional, true);
eq('gross generation, not net at the plug', g.kw_is, 'gas_supported');

console.log('\n=== a penalty measured, and a penalty NOT measured ===');
fresh({ build: 4000 });
var over = ProjectSizing.assess(ProjectData.list()[0]);
eq('it is measured', over.measured, true);
eq('the excess is build minus supported', over.excess_kw, 4000 - 2289);
eq('and the supported figure is the gas, derated', over.supported_kw, 2289);
/* $1,817/kW, probed from the estimator rather than written down here. It is the $1,560/kW of
   linear plant plus the 11% carrying cost of that capital over the 18 months to first revenue --
   1560 x (1 + 0.11 x 18/12). Capital spent on capacity the gas cannot feed carries for exactly as
   long as capital spent on capacity it can, so the penalty includes it. */
eq('the marginal rate is probed from the capex stack', over.marginal_usd_per_kw, 1817);
eq('and the penalty is that excess at that rate', over.penalty_usd, (4000 - 2289) * 1817);
eq('it does not fit', over.fits, false);
ok('and the headline says what the money buys',
   /no fuel behind it/.test(over.headline), over.headline);

fresh({ mmscfd: null, gross: 4000 });
var unmeasured = ProjectSizing.assess(ProjectData.list()[0]);
/* THE DISTINCTION THAT MATTERS MOST HERE. A site with no published volume is unmeasured. A $0
   penalty would say the build fits the gas exactly, which is a claim, and usually a false one. */
eq('with no gas volume it refuses rather than reporting zero', unmeasured.measured, false);
eq('there is no penalty figure at all', unmeasured.penalty_usd, undefined);
ok('and the refusal says why zero would have been wrong',
   /would say the build fits exactly/.test(unmeasured.reason), unmeasured.reason);

fresh({ build: 2289 });
var fits = ProjectSizing.assess(ProjectData.list()[0]);
eq('a build that matches the gas fits', fits.fits, true);
eq('and its penalty is a measured zero, not a null', fits.penalty_usd, 0);
ok('which is a different thing from the refusal above',
   fits.measured === true && unmeasured.measured === false);

console.log('\n=== undersizing is gas left behind, not capital wasted ===');
fresh({ build: 1000 });
var under = ProjectSizing.assess(ProjectData.list()[0]);
eq('no penalty, because no capital is stranded', under.penalty_usd, 0);
eq('but the gas not taken is reported', under.stranded_kw, 2289 - 1000);
ok('and the headline distinguishes the two',
   /not capital wasted/.test(under.headline), under.headline);

console.log('\n=== STAGING DEFERS CAPITAL, IT DOES NOT SAVE IT ===');
/* Measured on the real estimator: a single 3,600 kW build and two 1,800 kW phases both come to
   $5,776,000. The only flat item is the $160,000 permitting charge, and you do not re-permit a
   site you already permitted — so pricing phase 2 as its own full stack invents a $160,000
   saving for the single build that is pure arithmetic artefact. */
fresh({ mmscfd: 2.0, gross: 4160, build: 3600 });
var st = ProjectSizing.staged(ProjectData.list()[0], 1800, 48);
eq('it prices', st.measured, true);
// 5,776,000 of plant plus 16.5% carrying cost at the project's own 11% over 18 months.
eq('the single build', st.single_usd, 6729040);
eq('phase one', st.phase1_usd, 3457720);
eq('phase two is the DIFFERENCE, so the flat permitting cancels', st.phase2_usd, 3271320);
eq('the two paths cost the same nominally', st.staged_nominal_usd, st.single_usd);
eq('and that is stated as zero rather than left to be noticed', st.nominal_difference_usd, 0);
eq('what is deferred', st.deferred_usd, 3271320);
// 3,271,320 x 11% x 48/12 = 1,439,381 — simple interest, matching site-capex.js:499-505.
eq('the carry saved at the project rate', st.carry_saved_usd, 1439381);
eq('expressed as a breakeven per kW-month', st.breakeven_usd_per_kw_month, 16.66);
ok('and the headline refuses to call it a capital saving',
   /does not save it/.test(st.headline), st.headline);
ok('naming the breakeven the operator has to beat',
   /per kW-month/.test(st.headline), st.headline);

console.log('\n=== staging above the gas is refused, not priced ===');
/* A flat horizon asserts a constant rate and models no growth. The curve that would show gas
   arriving in year four is exactly the thing being refused, so a phase 2 that takes the total
   past what the gas supports is oversizing in two instalments. */
fresh({ build: 4000 });
var tooBig = ProjectSizing.staged(ProjectData.list()[0], 2000, 36);
eq('refused', tooBig.measured, false);
ok('and it says the horizon cannot authorise the later gas',
   /models no gas arriving later/.test(tooBig.reason), tooBig.reason);
ok('pointing at what can', /forecast study/.test(tooBig.reason), tooBig.reason);
fresh({ build: 2289 });
var noDefer = ProjectSizing.staged(ProjectData.list()[0], 1000, 0);
eq('a staged plan with no deferral is refused', noDefer.measured, false);
ok('because there would be nothing to compare',
   /time value/.test(noDefer.reason), noDefer.reason);

console.log('\n=== the study supersedes, and it needs the paper ===');
fresh({ build: 2289 });
var sp = ProjectData.list()[0];
var noDoc = ProjectSizing.recordStudy(sp.id, { supported_kw: 3100, kw_is: 'gas_supported' });
eq('no document, no study', noDoc.ok, false);
/* The MESSAGE, not just the refusal. Two separate guards can reject this call — the missing id
   and the id-not-on-file check downstream — so asserting only ok:false cannot tell which one
   fired, and removing the first guard would leave the test green. */
ok('and it is the missing document that is named, not a lookup failure',
   /needs the document it came from/.test(noDoc.err), noDoc.err);
var wrongKind = CrmDocuments.add('p1', { title: 'Gas analysis', kind: 'gas_analysis' });
var r1 = ProjectSizing.recordStudy(sp.id,
   { supported_kw: 3100, kw_is: 'gas_supported', document_id: wrongKind.item.id });
eq('a document of the wrong kind is refused', r1.ok, false);
ok('naming what it actually is', /gas_analysis/.test(r1.err), r1.err);
var doc = CrmDocuments.add('p1', { title: 'Gas generation forecast, 15-year', kind: 'gas_forecast' });
eq('and it must say gross or net at the plug', ProjectSizing.recordStudy(sp.id,
   { supported_kw: 3100, document_id: doc.item.id }).ok, false);
var good = ProjectSizing.recordStudy(sp.id, { supported_kw: 3100, kw_is: 'gas_supported',
    covers_years: 15, document_id: doc.item.id, title: '15-year forecast', recorded_by: 'R Bagatoli' });
ok('a study with its document behind it is accepted', good.ok, good.err);

var after = ProjectSizing.assess(ProjectData.get(sp.id));
eq('the study replaces the published figure outright', after.supported_kw, 3100);
eq('the basis changes with it', after.basis, 'study');
eq('and it is no longer directional', after.directional, false);
ok('the headline says so in words', /not directional/.test(after.headline), after.headline);
eq('the published figure is not blended into it — it is replaced',
   after.gas.gross_kw, undefined);
ok('and the assessment names the document it rests on', !!after.gas.document_id);

console.log('\n=== net at the plug is not derated a second time ===');
/* The catch worth the most on a real site: a study stating net output, run through the same 10%
   parasitic derate, is roughly 310 kW low here and 400 kW low on a 4 MW site. */
fresh({ build: 2289 });
var np = ProjectData.list()[0];
var d2 = CrmDocuments.add('p1', { title: 'Forecast, net at plug', kind: 'gas_forecast' });
ProjectSizing.recordStudy(np.id, { supported_kw: 3100, kw_is: 'net_at_plug',
    covers_years: 15, document_id: d2.item.id });
var netA = ProjectSizing.assess(ProjectData.get(np.id));
eq('a net figure is taken as stated', netA.supported_kw, 3100);
eq('and it is recorded as net, not gross', netA.gas.kw_is, 'net_at_plug');
eq('with no parasitic derate applied to it', netA.gas.parasitic_pct, undefined);

console.log('\n=== a study does not grow to fit the contract ===');
fresh({ build: 2289 });
var tm = ProjectData.list()[0];
var d3 = CrmDocuments.add('p1', { title: 'Forecast, 10-year', kind: 'gas_forecast' });
ProjectSizing.recordStudy(tm.id, { supported_kw: 3100, kw_is: 'gas_supported',
    covers_years: 10, document_id: d3.item.id });
ProjectData.mutate(tm.id, function (x) { x.contract_term_years = 15; });
var ts = ProjectSizing.termSupport(ProjectData.get(tm.id), 2026);
eq('a 10-year study against a 15-year term is short', ts.state, 'short');
eq('by five years', ts.shortfall_years, 5);
eq('on the study\'s authority', ts.basis, 'study');
ok('and it says the study does not become longer by being read against a longer contract',
   /does not \n?become longer|does not become longer/.test(ts.note.replace(/\s+/g, ' ')), ts.note);

console.log('\n=== term support, and the sites where the horizon says nothing ===');
fresh({ horizon: 18 });
var h = ProjectData.list()[0];
ProjectData.mutate(h.id, function (x) { x.contract_term_years = 15; });
var covered = ProjectSizing.termSupport(ProjectData.get(h.id), 2026);
eq('18 years of horizon covers a 15-year term', covered.state, 'covered');
eq('on the horizon\'s authority', covered.basis, 'horizon');
eq('and it is always directional', covered.directional, true);
ok('naming the flat horizon rather than implying a curve',
   /not a decline curve/.test(covered.note), covered.note);
eq('an as-of year is required', ProjectSizing.termSupport(ProjectData.get(h.id), null).state, 'unknown');

/* The Kingsland case: past the horizon and still measurably producing, so remainingYears returns
   null rather than 0. 383 of 1,908 US rows are here, and they include the best prospect in the
   dataset. Sizing must still work; only the term goes unanswered. */
fresh({ horizon: null, build: 4000 });
var k = ProjectData.list()[0];
var kt = ProjectSizing.termSupport(ProjectData.get(k.id), 2026);
eq('no horizon means the term is unknown', kt.state, 'unknown');
ok('and the reason is not "the gas is gone"',
   /still \n?producing|still producing/.test(kt.note.replace(/\s+/g, ' ')), kt.note);
var ka = ProjectSizing.assess(ProjectData.get(k.id));
eq('but the sizing still works, which is the whole point of separating them', ka.measured, true);
eq('with a real penalty', ka.penalty_usd, (4000 - 2289) * 1817);

console.log('\n=== a project whose prospect is gone ===');
/* A consequence of capturing the resource at promotion rather than reading it live, and a good
   one: the sizing rests on figures the project owns, so deleting the prospect cannot silently turn
   a measured penalty into a refusal. The prospect is still consulted for the parasitic rate, which
   falls back to the landfill figure — the conservative one, and what this module is for. */
fresh({ build: 4000 });
var orphan = ProjectData.list()[0];
var beforeDel = ProjectSizing.assess(ProjectData.get(orphan.id));
var termBefore = ProjectSizing.termSupport(ProjectData.get(orphan.id), 2026).state;
SiteData.remove('p1', 'testing the orphan path');
var oa = ProjectSizing.assess(ProjectData.get(orphan.id));
eq('the sizing survives the prospect being deleted', oa.measured, true);
eq('and is unchanged, because the figures live on the project',
   oa.penalty_usd, beforeDel.penalty_usd);
eq('the term is unaffected too',
   ProjectSizing.termSupport(ProjectData.get(orphan.id), 2026).state, termBefore);

console.log('\n' + (fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                               : pass + ' passed, ' + fail + ' FAILED'));
process.exit(fail === 0 ? 0 : 1);
