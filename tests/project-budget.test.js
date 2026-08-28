// The budget ledger.
//
// The failure it exists to prevent is discovering at 70% complete that you are 40% over, so the
// assertions are ranked by which wrong answer costs most:
//
//   1. A persisted total. Two devices adding different lines merge (the lines are a map); a
//      stored scalar total does not — one wins, and the survivor disagrees with the lines under
//      it. A total that contradicts its own detail is worse than no total.
//   2. Committed reported as spent, or at-risk folded into capital. Both make a project look
//      healthier than it is, which is the direction that hurts.
//   3. A change order edited rather than superseded, so the cumulative figure stops recording
//      what was actually approved and when.

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
global.SiteCapex = require(path.join(ROOT, 'site-capex.js'));
global.SiteInfrastructure = require(path.join(ROOT, 'site-infrastructure.js'));
global.SiteData = require(path.join(ROOT, 'site-model.js'));
global.ProjectData = require(path.join(ROOT, 'project-model.js'));
global.ProjectGates = require(path.join(ROOT, 'project-gates.js'));
global.ProjectBudget = require(path.join(ROOT, 'project-budget.js'));
var SiteData = global.SiteData, ProjectData = global.ProjectData;
var ProjectBudget = global.ProjectBudget, ProjectGates = global.ProjectGates;
var CrmLog = global.CrmLog, CrmDocuments = global.CrmDocuments;

var GOOD = { capacity_kw: 1959, annual_cost_of_capital_pct: 11, budget_authorised_usd: 5400000 };
function fresh() {
    _store = {};
    [global.CrmConfig, CrmLog, CrmDocuments, global.CrmEnrichment, ProjectData].forEach(function (m) {
        if (m && m.reset) m.reset();
    });
    SiteData.add(SiteData.normalize({ id: 'p1', name: 'Pinelands Park LF',
                                      development_stage: 'raw_resource' }));
    return ProjectData.promote('p1', GOOD).project;
}

console.log('\n=== the categories are the estimator\'s, so variance is not a mapping error ===');
var capexIds = ['site_acquisition', 'permitting_development', 'generation_equipment',
                'interconnection', 'gas_treatment', 'commissioning', 'mining_infrastructure',
                'miners', 'carrying_cost'];
capexIds.forEach(function (id) {
    ok('the ledger knows ' + id, ProjectBudget.CATEGORY_IDS.indexOf(id) >= 0);
});
['collection', 'conditioning', 'engineering', 'contingency', 'diligence_at_risk'].forEach(function (id) {
    ok('and adds ' + id, ProjectBudget.CATEGORY_IDS.indexOf(id) >= 0);
});
/* Deliberately absent. site-capex.js:34 keeps mining infrastructure whole because the $450/kW
   behind it is one real Alberta quote, and splitting it would let invented components wear the
   authority of a quoted one. The actuals can still carry the detail. */
['containers', 'civil', 'electrical'].forEach(function (id) {
    ok(id + ' is NOT split out of the quoted mining-infrastructure rate',
       ProjectBudget.CATEGORY_IDS.indexOf(id) < 0);
});

console.log('\n=== NOTHING DERIVED IS PERSISTED ===');
/* The rule that makes one store safe under last-write-wins. Checked against the stored bytes
   rather than the API, because the API could be honest while a write leaked a total through. */
fresh();
var p = ProjectData.list()[0];
ProjectBudget.addLine(p.id, { category: 'generation_equipment', budgeted_amount: 1800000,
                              committed_amount: 1750000, vendor: 'Genset vendor' });
ProjectBudget.addLine(p.id, { category: 'collection', budgeted_amount: 1077450, committed_amount: 0 });
var raw = JSON.parse(_store.protonMiningProjects);
var stored = JSON.stringify(raw.byProject[p.id]);
['budget_committed', 'budget_spent', 'budget_total', 'totals', 'committed_total']
    .forEach(function (k) {
        ok('no ' + k + ' is stored on the record', stored.indexOf('"' + k + '"') < 0);
    });
ok('the module exposes no setter for any total',
   ['setTotal', 'setCommitted', 'setBudgetTotal'].every(function (k) {
       return typeof ProjectBudget[k] === 'undefined';
   }));
var t = ProjectBudget.totals(ProjectData.get(p.id));
eq('and the total is computed from the lines', t.committed, 1750000);
eq('budgeted likewise', t.budgeted, 2877450);

console.log('\n=== three states, and committed is the one that matters ===');
eq('spent is tracked separately and is still zero', t.spent, 0);
eq('remaining is measured against committed, not spent', t.remaining, 5400000 - 1750000);
eq('and uncommitted is what is left of the budget', t.uncommitted, 2877450 - 1750000);

console.log('\n=== at-risk diligence is never folded into capital ===');
/* $150-270K spent on a project that can still die. Folding it in would make a project that has
   proved a site unviable look like one that has started building. */
fresh();
var ar = ProjectData.list()[0];
ProjectBudget.addLine(ar.id, { category: 'diligence_at_risk', budgeted_amount: 220000,
                               committed_amount: 180000, spent_amount: 165000 });
ProjectBudget.addLine(ar.id, { category: 'generation_equipment', committed_amount: 900000 });
var at = ProjectBudget.totals(ProjectData.get(ar.id));
eq('capital committed excludes it', at.committed, 900000);
eq('capital spent excludes it', at.spent, 0);
eq('and it is reported on its own', at.at_risk_committed, 180000);
eq('with its own spent figure', at.at_risk_spent, 165000);

console.log('\n=== contingency is measured against what is LEFT ===');
/* The early warning. Contingency at 60% of a budget that is 20% remaining is a project in
   trouble; 60% of the original tells you nothing about where you are. */
fresh();
var cg = ProjectData.list()[0];
ProjectBudget.addLine(cg.id, { category: 'contingency', budgeted_amount: 500000, committed_amount: 100000 });
ProjectBudget.addLine(cg.id, { category: 'generation_equipment', committed_amount: 3000000 });
var ct = ProjectBudget.totals(ProjectData.get(cg.id));
eq('contingency remaining is budget minus drawn', ct.contingency_remaining, 400000);
// authorised 5,400,000 - committed 3,100,000 = 2,300,000 remaining; 400,000 of that is contingency
eq('and the ratio is against remaining budget', ct.contingency_ratio, Math.round(400000 / 2300000 * 100));

console.log('\n=== per-category variance, and unbudgeted said differently ===');
var cats = ProjectBudget.byCategory(ProjectData.get(cg.id));
var gen = cats.filter(function (c) { return c.id === 'generation_equipment'; })[0];
eq('a category with no budget is not infinitely over', gen.variance, null);
eq('it is unbudgeted', gen.unbudgeted, true);
var con = cats.filter(function (c) { return c.id === 'contingency'; })[0];
eq('a budgeted category reports real variance', con.variance, 100000 - 500000);
eq('and a percentage', con.variance_pct, -80);

console.log('\n=== NO CONTINGENCY BUDGETED IS NOT THE SAME AS NONE LEFT ===');
/* Caught in the browser, not here: a freshly seeded project reported contingency_ratio 0, which
   is the loudest thing this ledger can say — you have burned all of it — when it meant nobody had
   set any aside. The estimator has no contingency component, so EVERY seeded project hit it. */
fresh();
var nc = ProjectData.list()[0];
ProjectBudget.addLine(nc.id, { category: 'generation_equipment', committed_amount: 3000000 });
var nct = ProjectBudget.totals(ProjectData.get(nc.id));
eq('none budgeted reports null, not zero', nct.contingency_ratio, null);
eq('and the budgeted figure is there to say why', nct.contingency_budgeted, 0);
ProjectBudget.addLine(nc.id, { category: 'contingency', budgeted_amount: 500000,
                               committed_amount: 500000 });
eq('fully drawn contingency DOES report zero — the alarm still works',
   ProjectBudget.totals(ProjectData.get(nc.id)).contingency_ratio, 0);

console.log('\n=== seeding makes the estimate the opening budget ===');
fresh();
var sd = ProjectData.list()[0];
var seeded = ProjectBudget.seedFromEstimate(sd.id);
ok('it seeds', seeded.ok, seeded.err);
ok('from several categories', seeded.seeded >= 5, 'seeded ' + seeded.seeded);
/* Components the estimator cannot price are skipped, not seeded at zero: a zero budget reads as
   "this costs nothing" and turns the first invoice into a 100% overrun. */
ok('and skips what the estimator could not price', seeded.skipped.length > 0,
   'skipped ' + JSON.stringify(seeded.skipped));
var st = ProjectBudget.totals(ProjectData.get(sd.id));
ok('the opening budget is real money', st.budgeted > 1000000, String(st.budgeted));
eq('and nothing is committed yet', st.committed, 0);
eq('seeding twice is refused', ProjectBudget.seedFromEstimate(sd.id).ok, false);

/* A PRICED ZERO IS NOT AN ABSENT BUDGET. site-capex.js:398 prices site acquisition at $0 for a
   raw resource and means it. Reporting that as "unbudgeted" the moment a title search is paid
   for would blame the operator for not planning, when the estimate is what was wrong. */
var sdc = ProjectBudget.byCategory(ProjectData.get(sd.id));
var acq = sdc.filter(function (c) { return c.id === 'site_acquisition'; })[0];
ok('the estimator priced site acquisition at zero and it was seeded', !!acq);
eq('which is a priced zero', acq.priced_at_zero, true);
eq('not an unbudgeted category', acq.unbudgeted, false);
eq('and nothing contradicts it yet', acq.zero_contradicted, false);
ProjectBudget.addLine(sd.id, { category: 'site_acquisition', committed_amount: 12000,
                               vendor: 'title search' });
ProjectBudget.addLine(sd.id, { category: 'engineering', committed_amount: 80000 });
var sdc2 = ProjectBudget.byCategory(ProjectData.get(sd.id));
var acq2 = sdc2.filter(function (c) { return c.id === 'site_acquisition'; })[0];
var eng = sdc2.filter(function (c) { return c.id === 'engineering'; })[0];
eq('money against the priced zero contradicts it', acq2.zero_contradicted, true);
eq('and it is still not called unbudgeted', acq2.unbudgeted, false);
eq('but a category nobody planned for IS unbudgeted', eng.unbudgeted, true);
eq('and that one was never priced at zero', eng.priced_at_zero, false);

console.log('\n=== no material spend before exclusivity ===');
/* Flagged, not refused: the money may be committed for a good reason, and refusing would move
   the record out of the system, which is worse than a flagged line. */
fresh();
var ex = ProjectData.list()[0];
var flagged = ProjectBudget.addLine(ex.id, { category: 'generation_equipment', committed_amount: 900000 });
ok('the line is accepted', flagged.ok, flagged.err);
ok('but flagged', !!flagged.flag, 'no flag raised');
ok('and the flag says why it matters', /exclusivity/i.test(flagged.flag), flagged.flag);
var notFlagged = ProjectBudget.addLine(ex.id, { category: 'diligence_at_risk', committed_amount: 40000 });
eq('at-risk diligence is exempt — it is how you decide whether to pursue exclusivity',
   notFlagged.flag, null);

CrmDocuments.add('p1', { title: 'NDA', kind: 'nda' });
CrmDocuments.add('p1', { title: 'LOI', kind: 'term_sheet' });
['nda', 'loi', 'exclusivity'].forEach(function (k) {
    ProjectGates.setStatus(ex.id, 'contact_loi', k, 'complete');
});
ProjectData.reset();
var clean = ProjectBudget.addLine(ex.id, { category: 'interconnection', committed_amount: 200000 });
eq('once exclusivity is executed, no flag', clean.flag, null);

console.log('\n=== change orders carry cost AND schedule, both required ===');
fresh();
var co = ProjectData.list()[0];
eq('no description is refused', ProjectBudget.addChangeOrder(co.id, { reason: 'x', cost_impact: 1, schedule_impact_days: 1 }).ok, false);
eq('no reason is refused', ProjectBudget.addChangeOrder(co.id, { description: 'x', cost_impact: 1, schedule_impact_days: 1 }).ok, false);
eq('no cost impact is refused', ProjectBudget.addChangeOrder(co.id, { description: 'x', reason: 'y', schedule_impact_days: 1 }).ok, false);
eq('no schedule impact is refused — a change with no schedule impact is a claim',
   ProjectBudget.addChangeOrder(co.id, { description: 'x', reason: 'y', cost_impact: 1 }).ok, false);
var made = ProjectBudget.addChangeOrder(co.id, {
    description: 'Rock excavation beyond allowance', reason: 'differing site condition',
    cost_impact: 31000, schedule_impact_days: 9 });
ok('a complete one is accepted', made.ok, made.err);
ok('and logged', made.logged === true);

console.log('\n=== only approved change orders count toward the headline ===');
var pending = ProjectBudget.totals(ProjectData.get(co.id));
eq('a proposed change order is not in the cumulative figure', pending.change_order_value, 0);
eq('a decision needs a name', ProjectBudget.decideChangeOrder(co.id, made.id, 'approved', '').ok, false);
ok('approving works', ProjectBudget.decideChangeOrder(co.id, made.id, 'approved', 'R Bagatoli').ok);
var after = ProjectBudget.totals(ProjectData.get(co.id));
eq('now it counts', after.change_order_value, 31000);
eq('with its schedule impact', after.change_order_days, 9);
eq('and against the original authorisation', after.change_order_pct,
   Math.round(31000 / 5400000 * 100));
eq('deciding twice is refused', ProjectBudget.decideChangeOrder(co.id, made.id, 'rejected', 'R Bagatoli').ok, false);

console.log('\n=== a revision supersedes rather than overwriting ===');
/* Quietly editing an approved change order is how a cumulative change figure stops recording
   what was actually approved. CrmLog.supersede keeps the original in place. */
var revised = ProjectBudget.reviseChangeOrder(co.id, made.id,
    { cost_impact: 44000, reason: 'excavation deeper than surveyed' }, made.log_id);
ok('the revision is accepted', revised.ok, revised.err);
ok('and it superseded the original entry', revised.logged === true);
var chain = CrmLog.forProspect('p1', 'change_order');
ok('both entries are still in the log', chain.length >= 2, 'found ' + chain.length);
var sup = CrmLog.supersededIds();
ok('and the original is marked superseded, not deleted', !!sup[made.log_id]);
eq('the ledger now carries the revised figure',
   ProjectBudget.totals(ProjectData.get(co.id)).change_order_value, 44000);

console.log('\n=== lines refuse nonsense rather than storing it ===');
fresh();
var nn = ProjectData.list()[0];
eq('an unknown category is refused',
   ProjectBudget.addLine(nn.id, { category: 'invented', budgeted_amount: 1 }).ok, false);
eq('a line with no figures at all is refused',
   ProjectBudget.addLine(nn.id, { category: 'engineering' }).ok, false);
eq('a negative figure is refused — a reduction is a change order',
   ProjectBudget.addLine(nn.id, { category: 'engineering', budgeted_amount: -5 }).ok, false);

console.log('\n=== a removed line is a tombstone ===');
fresh();
var rm = ProjectData.list()[0];
var lineId = ProjectBudget.addLine(rm.id, { category: 'engineering', budgeted_amount: 50000 }).id;
eq('it is in the totals', ProjectBudget.totals(ProjectData.get(rm.id)).budgeted, 50000);
ok('it removes', ProjectBudget.removeLine(rm.id, lineId, 'duplicated').ok);
eq('and leaves the totals', ProjectBudget.totals(ProjectData.get(rm.id)).budgeted, 0);
var onDisk = JSON.parse(_store.protonMiningProjects).byProject[rm.id].budget_lines;
/* Checked in two steps on purpose. If the key were hard-deleted, reading .deleted_at off it
   would throw, and a suite that crashes looks the same as a suite that is broken. */
ok('the key survives, so a merge from another device cannot resurrect it',
   Object.prototype.hasOwnProperty.call(onDisk, lineId));
ok('and it carries the tombstone', !!(onDisk[lineId] && onDisk[lineId].deleted_at));

console.log('\n' + (fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                               : pass + ' passed, ' + fail + ' FAILED'));
process.exit(fail === 0 ? 0 : 1);
