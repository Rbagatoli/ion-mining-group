// The gates. This is the core risk control, so the assertions are ranked by what it costs to
// get each one wrong.
//
// The most expensive failure is a gate that reports ready when it is not — a project that
// advances past diligence without a gas composition analysis has committed to a treatment cost
// nobody has measured, and past permitting_complete without the permit in hand has stopped
// charging $160,000 it is still paying and cut months-to-revenue by four to ten.
//
// The second most expensive is a hard block that can be stepped around without a trace. That is
// why 'na' is refused on a blocking item and a waiver needs a reason and an approver.

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
global.SiteData = require(path.join(ROOT, 'site-model.js'));
global.ProjectData = require(path.join(ROOT, 'project-model.js'));
global.ProjectGates = require(path.join(ROOT, 'project-gates.js'));
var SiteData = global.SiteData, ProjectData = global.ProjectData, ProjectGates = global.ProjectGates;
var CrmLog = global.CrmLog, CrmDocuments = global.CrmDocuments, CrmConfig = global.CrmConfig;

var GOOD = { capacity_kw: 1959, annual_cost_of_capital_pct: 11, budget_authorised_usd: 5400000 };

function fresh() {
    _store = {};
    [CrmConfig, CrmLog, CrmDocuments, CrmEnrichment, ProjectData].forEach(function (m) {
        if (m && m.reset) m.reset();
    });
    SiteData.add(SiteData.normalize({ id: 'p1', name: 'Pinelands Park LF' }));
    return ProjectData.promote('p1', GOOD).project;
}

console.log('\n=== the three hard blocks at diligence ===');
var p = fresh();
ProjectData.setGate(p.id, 'contact_loi');   // will be blocked; checked below
var items = ProjectGates.itemsFor(ProjectData.get(p.id), 'diligence');
var blocking = items.filter(function (i) { return i.blocking; }).map(function (i) { return i.key; });
eq('exactly three requirements block diligence', blocking.length, 3);
ok('gas composition is one', blocking.indexOf('gas_composition') >= 0);
ok('collection condition is one', blocking.indexOf('collection_condition') >= 0);
ok('gas forecast is one', blocking.indexOf('gas_forecast') >= 0);
ok('and each carries why it blocks, not just that it does',
   items.filter(function (i) { return i.blocking; }).every(function (i) { return !!i.why; }));
ok('the non-blocking ones are still listed',
   items.filter(function (i) { return !i.blocking; }).length >= 4);

console.log('\n=== a blocked gate names what is blocking it ===');
fresh();
var proj = ProjectData.list()[0];
// Clear the first gate so the project is sitting at diligence.
CrmDocuments.add('p1', { title: 'NDA', kind: 'nda' });
CrmDocuments.add('p1', { title: 'LOI', kind: 'term_sheet' });
['nda', 'loi', 'exclusivity'].forEach(function (k) {
    ProjectGates.setStatus(proj.id, 'contact_loi', k, 'complete');
});
ok('the first gate clears', ProjectData.setGate(proj.id, 'contact_loi').ok);
ok('and then diligence', ProjectData.setGate(proj.id, 'diligence').ok);

var blocked = ProjectData.setGate(proj.id, 'agreements');
eq('advancing out of diligence is refused', blocked.ok, false);
ok('the message names all three, not just that something is missing',
   /Gas composition/.test(blocked.err) && /Collection system/.test(blocked.err) &&
   /forecast/i.test(blocked.err), blocked.err);
eq('and the blockers come back as items, not a boolean', blocked.blockers.length, 3);
eq('the project did not move', ProjectData.get(proj.id).gate, 'diligence');

console.log('\n=== complete without the document it requires is NOT satisfied ===');
/* The distinction the whole permitting gate rests on. An air permit ticked complete with nothing
   on file is somebody's recollection, and advancing on it silently reprices the build. */
fresh();
var q = ProjectData.list()[0];
CrmDocuments.add('p1', { title: 'NDA', kind: 'nda' });
CrmDocuments.add('p1', { title: 'LOI', kind: 'term_sheet' });
['nda', 'loi', 'exclusivity'].forEach(function (k) { ProjectGates.setStatus(q.id, 'contact_loi', k, 'complete'); });
ProjectData.setGate(q.id, 'contact_loi');
['gas_composition', 'collection_condition', 'gas_forecast'].forEach(function (k) {
    ProjectGates.setStatus(q.id, 'diligence', k, 'complete');
});
var gas = ProjectGates.itemsFor(ProjectData.get(q.id), 'diligence')
    .filter(function (i) { return i.key === 'gas_composition'; })[0];
eq('it is marked complete', gas.status, 'complete');
eq('but it is not satisfied', gas.satisfied, false);
ok('and it says exactly why', gas.awaiting_document === true);
var stillBlocked = ProjectData.setGate(q.id, 'agreements');
eq('so the gate still refuses', stillBlocked.ok, false);
ok('with a message a person can act on',
   /no document on file/.test(stillBlocked.err), stillBlocked.err);

CrmDocuments.add('p1', { title: 'Gas analysis 2027-03', kind: 'gas_analysis' });
ProjectData.reset();
var nowSat = ProjectGates.itemsFor(ProjectData.get(q.id), 'diligence')
    .filter(function (i) { return i.key === 'gas_composition'; })[0];
eq('filing the document satisfies it, with no re-ticking', nowSat.satisfied, true);
ok('and the item points at the document', !!nowSat.document_id);
ok('the gate now advances', ProjectData.setGate(q.id, 'agreements').ok);

console.log('\n=== the permitting gate needs the permit itself ===');
/* Advancing here stops a $160,000 charge and cuts months-to-revenue from 12-24 to 8-14. The
   gate is the permit being ISSUED, which is why it is the one that requires a document. */
var permDefs = CrmConfig.gateDeliverables('permitting_complete');
var air = permDefs.filter(function (d) { return d.key === 'air_permit'; })[0];
ok('the air permit blocks', air.blocking === true);
ok('and requires a document', air.requires_document === true);
eq('satisfied by a permit document', air.evidence_kind, 'permit');
ok('the gate is named for the achievement, not the activity',
   CrmConfig.gateDeliverableGates().indexOf('permitting_complete') >= 0 &&
   CrmConfig.gateDeliverableGates().indexOf('permitting') < 0);

console.log('\n=== a hard block cannot be waved away as not-applicable ===');
fresh();
var r = ProjectData.list()[0];
var na = ProjectGates.setStatus(r.id, 'diligence', 'gas_composition', 'na');
eq('marking a blocking requirement na is refused', na.ok, false);
ok('and it points at the waiver instead', /[Ww]aive/.test(na.err), na.err);
ok('a non-blocking one can be na',
   ProjectGates.setStatus(r.id, 'diligence', 'phase_one', 'na').ok);

console.log('\n=== a waiver needs a reason and a name, and leaves a mark ===');
fresh();
var w = ProjectData.list()[0];
eq('a waiver with no reason is refused',
   ProjectGates.waive(w.id, 'diligence', 'gas_composition', { approved_by: 'R Bagatoli' }).ok, false);
eq('a waiver with no approver is refused',
   ProjectGates.waive(w.id, 'diligence', 'gas_composition', { reason: 'lab backlog' }).ok, false);
var waived = ProjectGates.waive(w.id, 'diligence', 'gas_composition',
    { reason: 'lab backlog, sampling booked 14 March', approved_by: 'R Bagatoli' });
ok('with both, it is accepted', waived.ok, waived.err);
ok('and it is logged', waived.logged === true);
var logs = CrmLog.forProspect('p1', 'waiver');
eq('as a waiver event', logs.length, 1);
eq('naming the deliverable', logs[0].deliverable, 'Gas composition — methane, siloxanes, moisture, H2S, halides');
eq('and who approved it', logs[0].approved_by, 'R Bagatoli');
var wi = ProjectGates.itemsFor(ProjectData.get(w.id), 'diligence')
    .filter(function (i) { return i.key === 'gas_composition'; })[0];
eq('the item reads as waived', wi.waived, true);
eq('and therefore satisfied', wi.satisfied, true);

console.log('\n=== readiness borrows the arithmetic rather than flattering ===');
/* A gate cleared by waiving requirements did not score 100%. tally() takes na out of the
   denominator, which is exactly the behaviour wanted here. */
var read = ProjectGates.readiness(ProjectData.get(w.id), 'diligence');
ok('a waived item is out of the denominator, not counted as done', read.na >= 1, JSON.stringify(read));
eq('and it is the same function the enrichment checklist uses',
   typeof global.CrmEnrichment.tally, 'function');
var t = global.CrmEnrichment.tally(['complete', 'in_progress', 'na', 'not_started']);
eq('in_progress counts as zero', t.complete, 1);
eq('na is out of the denominator', t.applicable, 3);
eq('all-na returns null rather than 100', global.CrmEnrichment.tally(['na', 'na']).pct, null);

console.log('\n=== backwards and cancelling are not blocked by the gate ===');
fresh();
var b = ProjectData.list()[0];
ok('a project can be cancelled from a blocked gate',
   ProjectData.setGate(b.id, 'cancelled', { reason: 'operator withdrew' }).ok);
fresh();
var b2 = ProjectData.list()[0];
CrmDocuments.add('p1', { title: 'NDA', kind: 'nda' });
CrmDocuments.add('p1', { title: 'LOI', kind: 'term_sheet' });
['nda', 'loi', 'exclusivity'].forEach(function (k) { ProjectGates.setStatus(b2.id, 'contact_loi', k, 'complete'); });
ProjectData.setGate(b2.id, 'contact_loi');
ok('and moved back with a reason even though the gate it is in is unmet',
   ProjectData.setGate(b2.id, 'target_screen', { reason: 'LOI lapsed' }).ok);

console.log('\n=== a gate cannot be skipped ===');
/* The hole this suite found. canAdvance originally checked only the CURRENT gate, so a project
   sitting at contact_loi could jump straight to agreements and take all three diligence hard
   blocks with it — unmet, and unmentioned. Every gate being passed over is checked now. */
fresh();
var sk = ProjectData.list()[0];
CrmDocuments.add('p1', { title: 'NDA', kind: 'nda' });
CrmDocuments.add('p1', { title: 'LOI', kind: 'term_sheet' });
['nda', 'loi', 'exclusivity'].forEach(function (k) { ProjectGates.setStatus(sk.id, 'contact_loi', k, 'complete'); });
ok('the project reaches contact_loi', ProjectData.setGate(sk.id, 'contact_loi').ok);
var jump = ProjectData.setGate(sk.id, 'agreements');
eq('jumping over diligence is refused', jump.ok, false);
ok('and the message says which gate the shortfall belongs to',
   jump.err.indexOf('[diligence]') >= 0, jump.err);
eq('all three diligence blocks are reported', jump.blockers.length, 3);
eq('the project stayed at contact_loi', ProjectData.get(sk.id).gate, 'contact_loi');

console.log('\n=== there is no force flag ===');
/* A blocking requirement is stepped around by waiving it, which names a reason and an approver.
   A force option would do the same thing invisibly, which is the whole failure gates prevent. */
fresh();
var f = ProjectData.list()[0];
var forced = ProjectData.setGate(f.id, 'agreements', { force: true, reason: 'in a hurry' });
eq('force does not advance a blocked gate', forced.ok, false);
eq('the project stayed put', ProjectData.get(f.id).gate, 'target_screen');

console.log('\n=== a missing config refuses rather than reporting ready ===');
/* The most dangerous wrong answer available: no requirements loaded reads as nothing to satisfy. */
fresh();
var m = ProjectData.list()[0];
var savedCfg = global.CrmConfig;
delete global.CrmConfig;
var verdict = ProjectGates.canAdvance(ProjectData.get(m.id), 'diligence');
eq('canAdvance refuses with no config', verdict.ok, false);
ok('and says nothing could be confirmed', /not loaded/.test(verdict.err), verdict.err);
eq('itemsFor reports null rather than an empty list',
   ProjectGates.itemsFor(ProjectData.get(m.id), 'diligence'), null);
global.CrmConfig = savedCfg;

console.log('\n' + (fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                               : pass + ' passed, ' + fail + ' FAILED'));
process.exit(fail === 0 ? 0 : 1);
