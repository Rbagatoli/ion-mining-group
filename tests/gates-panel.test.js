// The gate machinery, reachable at last — and proven reachable, because "exists" was the
// failure mode. ProjectGates carried setStatus/waive/unwaive/canAdvance and ProjectData
// carried setGate/cancel through four shipped stages, with a full test suite and not one
// caller in any UI: every promoted project was frozen at "target & screen" forever.
//
// Three layers, matching the budget-panel census that caught the same disease there:
//   1. MODEL ROUNDTRIP: promote -> complete the blocking items -> advance -> cancel, in node.
//   2. WIRING CENSUS: every control class/id the renderer emits has a listener in
//      prospecting.js, and vice versa — an emitted control nothing wires is a dead button.
//   3. STYLE CENSUS: every emitted class has a rule in prospecting.html, because an unstyled
//      control in this codebase has historically meant "pasted but never looked at".

'use strict';

var fs = require('fs');
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
var SiteData = global.SiteData, ProjectData = global.ProjectData, ProjectGates = global.ProjectGates;

console.log('\n=== 1. the model roundtrip the panel drives ===');

SiteData.add({ name: 'Gate Test LF', source: 'sourced', energy_type: 'landfill_gas',
               development_stage: 'constructed', usable_kw: 800 });
var rec = SiteData.list()[0];
var pr = ProjectData.promote(rec.id, {
    capacity_kw: 800, annual_cost_of_capital_pct: 12, budget_authorised_usd: 1000000,
    gas_mmscfd: 0.4, gas_basis: 'test'
});
ok('promoted', pr.ok, pr.err);
var p = ProjectData.list()[0];
eq('starts at the first gate', p.gate, 'target_screen');

// target_screen requires nothing by design — screening happened before promotion — so the
// first advance is free, and asserting that guards against a config change quietly making
// promotion itself gated.
eq('target_screen requires nothing', ProjectGates.itemsFor(p, p.gate).length, 0);
var firstMove = ProjectData.setGate(p.id, 'contact_loi');
ok('the free first advance works', firstMove.ok, firstMove.err);

// The real flow proves out on contact_loi: three configured deliverables, all blocking.
p = ProjectData.get(p.id);
var items = ProjectGates.itemsFor(p, p.gate);
ok('contact_loi has configured deliverables', Array.isArray(items) && items.length > 0,
   items === null ? 'config missing' : 'empty');
var blocking = items.filter(function (i) { return i.blocking; });
ok('and blocking ones to prove the flow on', blocking.length > 0);

// The gate refuses to advance while they stand — the refusal names them.
var early = ProjectGates.canAdvance(p, 'diligence');
ok('advance is refused while blockers stand', !early.ok);
ok('and the refusal names them', (early.blockers || []).length === blocking.length,
   'named ' + (early.blockers || []).length + ' of ' + blocking.length);

// Complete everything through the same writer the panel calls.
items.forEach(function (i) {
    var r = ProjectGates.setStatus(p.id, p.gate, i.key, 'complete', 'test');
    ok('setStatus completes "' + i.key + '"' + (i.requires_document ? ' (doc still missing)' : ''),
       r.ok, r.err);
});

// Whatever is complete-but-undocumented still blocks; waive it as the panel would.
var after = ProjectGates.itemsFor(ProjectData.get(p.id), p.gate);
var unsatisfied = after.filter(function (i) { return !i.satisfied; });
ok('at least one item needs a waiver (so the waiver path is actually exercised)',
   unsatisfied.length > 0, 'everything satisfied without a waiver — add a doc-requiring fixture');
unsatisfied.forEach(function (i) {
    var w = ProjectGates.waive(p.id, p.gate, i.key, { reason: 'test waiver', approved_by: 'Tester' });
    ok('waive clears "' + i.key + '"', w.ok, w.err);
});

var verdict = ProjectGates.canAdvance(ProjectData.get(p.id), 'diligence');
ok('the gate can now advance', verdict.ok, verdict.err);
var moved = ProjectData.setGate(p.id, 'diligence');
ok('setGate advances', moved.ok, moved.err);
eq('and the project is at the next gate', ProjectData.get(p.id).gate, 'diligence');

// The waiver left its mark on the ledger — the whole point of waiving over forcing.
var logRaw = JSON.parse(localStorage.getItem('protonCrmLog') || '{}');
var entries = logRaw.entries || [];
ok('the waiver is on the ledger', entries.some(function (e) { return e.kind === 'waiver'; }));
ok('so is the gate move', entries.some(function (e) { return e.kind === 'gate'; }));

var cancelled = ProjectData.cancel(p.id, 'test cancellation');
ok('cancel works with a reason', cancelled.ok, cancelled.err);
eq('and the project is cancelled', ProjectData.get(p.id).gate, 'cancelled');
var refused = ProjectData.cancel(ProjectData.list()[0].id, '');
ok('cancel without a reason is refused',
   !refused.ok || ProjectData.get(p.id).cancelled_reason === 'test cancellation');

console.log('\n=== 2. the wiring census ===');

var DETAIL = fs.readFileSync(path.join(ROOT, 'prospect-detail.js'), 'utf8');
var WIRING = fs.readFileSync(path.join(ROOT, 'prospecting.js'), 'utf8');
var PAGE = fs.readFileSync(path.join(ROOT, 'prospecting.html'), 'utf8');

var CONTROLS = ['pd-gate-set', 'pd-gate-waive', 'pd-gate-unwaive'];
var IDS = ['pdGateAdvance', 'pdGateCancel'];

CONTROLS.forEach(function (cls) {
    ok('renderer emits .' + cls, DETAIL.indexOf('class="' + cls + '"') >= 0 ||
       new RegExp('class="[^"]*\\b' + cls + '\\b').test(DETAIL));
    ok('prospecting.js wires .' + cls,
       new RegExp("querySelectorAll\\('\\." + cls + "'\\)").test(WIRING));
});
IDS.forEach(function (id) {
    ok('renderer emits #' + id, DETAIL.indexOf('id="' + id + '"') >= 0);
    ok('prospecting.js wires #' + id,
       new RegExp("getElementById\\('" + id + "'\\)").test(WIRING));
});

// The writers the census exists for: each must be CALLED from the wiring, not just exported.
['ProjectGates.setStatus', 'ProjectGates.waive', 'ProjectGates.unwaive',
 'ProjectData.setGate', 'ProjectData.cancel'].forEach(function (fn) {
    ok(fn + ' has a caller in the UI', WIRING.indexOf(fn + '(') >= 0);
});

console.log('\n=== 3. the style census ===');

['pd-gate-list', 'pd-gate-item', 'pd-gate-label', 'pd-gate-block', 'pd-gate-set',
 'pd-gate-await', 'pd-gate-waived', 'pd-gate-waive', 'pd-gate-unwaive',
 'pd-gate-cancel', 'pd-gate-adv'].forEach(function (cls) {
    ok('.' + cls + ' has a style rule', new RegExp('\\.' + cls + '\\b[^{]*\\{').test(PAGE));
});

console.log('\n' + (fail ? 'FAILED — ' + fail + ' of ' + (pass + fail) : 'ALL PASS — ' + pass + ' assertions'));
if (fail) process.exit(1);
