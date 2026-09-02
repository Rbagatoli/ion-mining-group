// The budget seed and the map price the SAME site, or one of them is lying.
//
// Measured before the fix: one real shutdown landfill priced at $2,054,455 in the map's detail
// panel and $883,341 in the opening budget seeded for the same site, because seedFromEstimate
// built its stack from three fields while the map passed the whole candidate. Every variance
// on that project would have been measured against the wrong opening number.
//
// The mechanism under test:
//   1. promote() freezes capex_facts — shutdown date, inherited generation, treatment, the
//      acquisition price, the market — from the caller's candidate and the record.
//   2. normalizeProject() keeps that block through a read round-trip (it is a fixed literal;
//      an unfrozen passthrough would be dropped, which is how p.prospect behaves).
//   3. seedFromEstimate() prices the stack FROM the frozen block, plus miners through
//      SiteEngine (the same engine, and therefore the same fleet-unit price, as the map).
//
// THE FIXTURES DIFFER WHERE THE CLAIM DIFFERS. The parity assertion compares the seed built
// with facts against the seed built without them on the same capacity: if the facts are truly
// threaded, the two totals cannot match, because the facts add miner and acquisition lines and
// discount inherited generation. A fixture that cannot tell the two apart would prove nothing.

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
global.SiteEngine = require(path.join(ROOT, 'site-engine.js'));
global.SiteData = require(path.join(ROOT, 'site-model.js'));
global.ProjectData = require(path.join(ROOT, 'project-model.js'));
global.ProjectGates = require(path.join(ROOT, 'project-gates.js'));
global.ProjectBudget = require(path.join(ROOT, 'project-budget.js'));
var SiteData = global.SiteData, ProjectData = global.ProjectData;
var ProjectBudget = global.ProjectBudget, SiteEngine = global.SiteEngine;

console.log('\nbudget seed parity');

// ---- A shutdown landfill prospect, saved to the CRM ------------------------------------------
var add = SiteData.add({
    name: 'Parity Test LF', source: 'sourced', energy_type: 'landfill_gas',
    development_stage: 'constructed', usable_kw: 900,
    purchase_price_usd: 150000, infra_condition_verified: null
});
ok('fixture prospect saved', !!(add && add.id !== undefined || SiteData.list().length === 1));
var rec = SiteData.list()[0];

// ---- Promotion, with the candidate's facts in hand -------------------------------------------
var FACTS = {
    existing_generation_kw: 1600,
    project_shutdown_date: '2021-06-30',
    requires_gas_treatment: true,
    infra_condition_verified: null,
    acquisition_usd: null,           // promote() must fall back to the record's price
    market: 'used'
};
var pr = ProjectData.promote(rec.id, {
    capacity_kw: 900, annual_cost_of_capital_pct: 12, budget_authorised_usd: 2500000,
    gas_mmscfd: 0.5, gas_basis: 'test', capex_facts: FACTS
});
ok('promotion succeeds', pr.ok, pr.err);
var project = ProjectData.list()[0];

// ---- 1. The freeze survives a read round-trip ------------------------------------------------
var reread = ProjectData.get(project.id);
ok('capex_facts survive normalize', !!reread.capex_facts);
eq('shutdown date frozen', reread.capex_facts.project_shutdown_date, '2021-06-30');
eq('inherited generation frozen', reread.capex_facts.existing_generation_kw, 1600);
eq('treatment requirement frozen', reread.capex_facts.requires_gas_treatment, true);
eq('market frozen', reread.capex_facts.market, 'used');
eq('acquisition falls back to the record price', reread.capex_facts.acquisition_usd, 150000);

// An unknown key does NOT survive — the block is a literal, not a passthrough.
var mut = ProjectData.mutate(project.id, function (p) { p.capex_facts.smuggled = 'x'; });
ok('mutate accepted', mut.ok, mut.err);
eq('an undeclared fact is dropped on read, not accumulated',
   ProjectData.get(project.id).capex_facts.smuggled, undefined);

// ---- 2. The seed prices the frozen facts -----------------------------------------------------
var seeded = ProjectBudget.seedFromEstimate(project.id);
ok('seed succeeds', seeded.ok, seeded.err);
var lines = ProjectBudget.lines ? ProjectBudget.lines(ProjectData.get(project.id)) : null;
if (!lines) {
    var pj = ProjectData.get(project.id);
    lines = Object.keys(pj.budget_lines || {}).map(function (k) { return pj.budget_lines[k]; });
}
var cats = lines.map(function (l) { return l.category; });
var total = lines.reduce(function (s, l) { return s + (l.budgeted_amount || 0); }, 0);

ok('a miners line is seeded', cats.indexOf('miners') >= 0, 'categories: ' + cats.join(', '));
ok('an acquisition line is seeded', cats.indexOf('site_acquisition') >= 0, 'categories: ' + cats.join(', '));

// The miners line equals the engine's own figure for this capacity — same code path as the map,
// which is the point. Stated via the engine rather than via literals so it tracks MinerDB.
var probe = SiteEngine.evaluate({ nameplate_kw: 900, usable_kw: 900, purchase_price_usd: 0, power_rate: 0 }, {});
var minersLine = lines.filter(function (l) { return l.category === 'miners'; })[0];
ok('miners are priced through the engine', !!minersLine &&
   Math.abs(minersLine.budgeted_amount - Math.round(probe.miner_capex_usd)) <= 1,
   minersLine ? 'line ' + minersLine.budgeted_amount + ' vs engine ' + probe.miner_capex_usd : 'no line');

// ---- 3. The facts CHANGE the answer (the fixture distinguishes) ------------------------------
// A second prospect with identical capacity and NO facts: its seed must price differently —
// no miners? no: miners depend only on capacity so they appear for both; but acquisition and
// the inherited-generation discount cannot. If the two seeds came out equal, the threading
// would be decorative.
var add2 = SiteData.add({
    name: 'Bare LF', source: 'sourced', energy_type: 'landfill_gas',
    development_stage: 'constructed', usable_kw: 900
});
var rec2 = SiteData.list().filter(function (r) { return r.name === 'Bare LF'; })[0];
var pr2 = ProjectData.promote(rec2.id, {
    capacity_kw: 900, annual_cost_of_capital_pct: 12, budget_authorised_usd: 2500000,
    gas_mmscfd: 0.5, gas_basis: 'test'
});
ok('bare promotion succeeds', pr2.ok, pr2.err);
var project2 = ProjectData.list().filter(function (p) { return p.prospect.prospect_id === String(rec2.id); })[0];
var seeded2 = ProjectBudget.seedFromEstimate(project2.id);
ok('bare seed succeeds', seeded2.ok, seeded2.err);
var pj2 = ProjectData.get(project2.id);
var lines2 = Object.keys(pj2.budget_lines || {}).map(function (k) { return pj2.budget_lines[k]; });
var cats2 = lines2.map(function (l) { return l.category; });
var total2 = lines2.reduce(function (s, l) { return s + (l.budgeted_amount || 0); }, 0);

// The bare project still gets a site_acquisition line — the stack estimates one from the
// development stage when no price is known, and that is correct model behaviour (an estimate
// labelled as one). What distinguishes the threading is the AMOUNT: the facts project carries
// the record's actual $150,000; the bare one carries the stage estimate.
var acqFacts = lines.filter(function (l) { return l.category === 'site_acquisition'; })[0];
var acqBare = lines2.filter(function (l) { return l.category === 'site_acquisition'; })[0];
eq('the facts project budgets the record price for acquisition',
   acqFacts && acqFacts.budgeted_amount, 150000);
ok('the bare project budgets the stage estimate, not the record price',
   !!acqBare && acqBare.budgeted_amount !== 150000,
   acqBare ? 'both ' + acqBare.budgeted_amount : 'no line');
ok('facts change the seeded total (threading is not decorative)', total !== total2,
   'both ' + total);

console.log('\n' + (fail ? 'FAILED — ' + fail + ' of ' + (pass + fail) : 'ALL PASS — ' + pass + ' assertions'));
if (fail) process.exit(1);
