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
global.SiteOpportunity = require(path.join(ROOT, 'site-opportunity.js'));
global.SiteInfrastructure = require(path.join(ROOT, 'site-infrastructure.js'));
global.SiteCapex = require(path.join(ROOT, 'site-capex.js'));
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
/* TWO OF THE THREE NEED THE PAPER, NOT THE TICK, and they are the two where the paper IS the
   fact. The forecast is a site-specific engineering study and it is the only thing that ever
   supersedes the flat 25-year horizon in the sizing arithmetic; a status click cannot supersede
   anything. Collection condition is the exception on purpose — it is assessed by standing on the
   site, and the assessment may legitimately be a person's judgement with no document behind it. */
var byKey = {};
items.forEach(function (i) { byKey[i.key] = i; });
eq('the gas analysis needs the document', byKey.gas_composition.requires_document, true);
eq('so does the gas forecast', byKey.gas_forecast.requires_document, true);
eq('and it points at the forecast kind specifically', byKey.gas_forecast.evidence_kind, 'gas_forecast');
eq('collection condition does not — it is a site visit, not a filing',
   !!byKey.collection_condition.requires_document, false);
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

/* WHICH document, not merely that there is one. Truthiness was all this asserted before, and a
   first sample of one can never tell newest from oldest — so the loop in docKinds() resolved to
   the OLDEST of a kind for as long as the test passed. A revision is the only thing that shows it. */
var firstDoc = nowSat.document_id;
CrmDocuments.add('p1', { title: 'Gas analysis 2027-09 — REVISED, siloxanes re-run',
                         kind: 'gas_analysis' });
ProjectData.reset();
var revised = ProjectGates.itemsFor(ProjectData.get(q.id), 'diligence')
    .filter(function (i) { return i.key === 'gas_composition'; })[0];
ok('a revised document supersedes the original as the cited evidence',
   revised.document_id !== firstDoc,
   'still citing ' + firstDoc + ' — the superseded analysis');
var newestId = CrmDocuments.forProspect('p1')
    .filter(function (d) { return d.kind === 'gas_analysis'; })[0].id;
eq('and it cites the newest one specifically', revised.document_id, newestId);
eq('while the older one stays on file rather than being replaced',
   CrmDocuments.forProspect('p1').filter(function (d) { return d.kind === 'gas_analysis'; }).length, 2);

// The forecast is the second document this gate wants, and the gate stays shut without it.
var oneShort = ProjectData.setGate(q.id, 'agreements');
eq('the analysis alone does not open the gate', oneShort.ok, false);
ok('and it names the forecast as what is missing',
   /forecast/i.test(oneShort.err), oneShort.err);
CrmDocuments.add('p1', { title: 'Gas generation forecast, 15-year', kind: 'gas_forecast' });
ProjectData.reset();
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

console.log('\n=== the asset stage follows the gate that CLOSES, not the one entered ===');
/* development_stage describes what the asset has achieved. A project sitting in the
   permitting_complete gate is doing the permitting; it is 'permitted' when that gate closes. */
eq('leaving permitting_complete is what makes a site permitted',
   ProjectGates.STAGE_ON_LEAVING.permitting_complete, 'permitted');
eq('leaving construction makes it constructed',
   ProjectGates.STAGE_ON_LEAVING.construction, 'constructed');
eq('leaving commissioning makes it energized',
   ProjectGates.STAGE_ON_LEAVING.commissioning, 'energized');
eq('and reaching operating is itself the achievement',
   ProjectGates.STAGE_ON_ENTERING.operating, 'operating');
ok('gates that achieve nothing on their own map to nothing',
   !ProjectGates.STAGE_ON_LEAVING.contact_loi && !ProjectGates.STAGE_ON_LEAVING.diligence,
   'a signed LOI does not make a site permitted');

console.log('\n=== a WAIVED permit does not make a site permitted ===');
/* The sharp case, and the reason the precondition is stated separately from the gate. The gate
   opens on `satisfied`, which includes waived — a legitimate way to move a PROJECT forward. It is
   not a legitimate way to tell the capex model a permit exists: $160,000 would quietly stop being
   charged while the permit is still outstanding. */
fresh();
var wp = ProjectData.list()[0];
function clearTo(projId, gate) {
    var order = ProjectData.GATES;
    for (var i = 1; i <= order.indexOf(gate); i++) {
        var g = order[i - 1];
        CrmConfig.gateDeliverables(g).forEach(function (d) {
            if (d.requires_document && d.evidence_kind) {
                CrmDocuments.add('p1', { title: d.label, kind: d.evidence_kind });
            }
            ProjectGates.setStatus(projId, g, d.key, 'complete');
        });
        ProjectData.setGate(projId, order[i]);
    }
}
// Clear everything up to and including entering permitting_complete, but WAIVE the air permit.
clearTo(wp.id, 'permitting_complete');
eq('the project is at permitting_complete', ProjectData.get(wp.id).gate, 'permitting_complete');
// Undo the document so the permit is genuinely absent, then waive it.
ProjectGates.setStatus(wp.id, 'permitting_complete', 'air_permit', 'not_started');
var wv = ProjectGates.waive(wp.id, 'permitting_complete', 'air_permit',
    { reason: 'authority backlog, proceeding at risk', approved_by: 'R Bagatoli' });
ok('the permit can be waived', wv.ok, wv.err);
eq('so the gate opens', ProjectGates.canAdvance(ProjectData.get(wp.id), 'engineering_procurement').ok, true);
eq('but the permit is not issued', ProjectGates.permitIssued(ProjectData.get(wp.id)), false);

var advanced = ProjectData.setGate(wp.id, 'engineering_procurement');
ok('the project advances', advanced.ok, advanced.err);
eq('and the asset stage did NOT move', advanced.stage.moved, false);
ok('because the permit is not on file as issued',
   /not on file as issued/.test(advanced.stage.reason), advanced.stage.reason);
eq('the prospect is still raw_resource',
   SiteData.get('p1').development_stage || 'raw_resource', 'raw_resource');

console.log('\n=== an issued permit does move it, and says what moved ===');
fresh();
var ip = ProjectData.list()[0];
clearTo(ip.id, 'permitting_complete');
// The permit itself: filed as a document and marked complete, which is what "issued" means here.
CrmDocuments.add('p1', { title: 'Air permit AP-2027-114', kind: 'permit' });
ProjectGates.setStatus(ip.id, 'permitting_complete', 'air_permit', 'complete');
ProjectData.reset();
eq('the permit now reads as issued', ProjectGates.permitIssued(ProjectData.get(ip.id)), true);
var scoreBefore = CrmLog.forProspect('p1', 'score').length;
var moved = ProjectData.setGate(ip.id, 'engineering_procurement');
ok('the gate opens on a real permit', moved.ok, moved.err);
eq('and the asset stage moves', moved.stage.moved, true);
eq('to permitted', moved.stage.to, 'permitted');
eq('the prospect record was actually written',
   SiteData.get('p1').development_stage, 'permitted');

console.log('\n=== the movement is attributable without reading source ===');
var scoreLogs = CrmLog.forProspect('p1', 'score');
ok('score movements were logged', scoreLogs.length > scoreBefore,
   'before ' + scoreBefore + ', after ' + scoreLogs.length);
var one = scoreLogs[0];
eq('the trigger says it was a stage advance, not a data change', one.trigger, 'stage_advance');
ok('it names the component', !!one.component);
ok('and carries the delta', one.delta !== undefined);
eq('with the stage it came from', one.from_stage, 'raw_resource');
eq('and the stage it went to', one.to_stage, 'permitted');
ok('and says the site itself did not change',
   /site itself did not change/.test(one.reason), one.reason);

console.log('\n=== the stage never rolls backwards ===');
/* A project moved back a gate does not un-permit a site. The permit is still issued and the
   capex model is still right to stop charging for it; rolling back would claim the asset
   regressed, which is not what happened. */
var back = ProjectData.setGate(ip.id, 'permitting_complete', { reason: 'genset quote expired' });
ok('the project can move back', back.ok, back.err);
eq('but the asset stage stays where it got to',
   SiteData.get('p1').development_stage, 'permitted');

console.log('\n=== an unmeasured movement is recorded as unmeasured ===');
/* An empty score history and "nothing moved" are opposite answers that look identical. This gap
   was live: prospecting.html did not load the scorer, so a gate advance there attributed nothing
   while the same advance moved the number on the map page. */
(function () {
    var savedSO = global.SiteOpportunity;
    delete global.SiteOpportunity;
    fresh();
    var u = ProjectData.list()[0];
    SiteData.update('p1', { development_stage: 'permitted' });
    var before = CrmLog.forProspect('p1', 'score').length;
    var r = ProjectGates.syncDevelopmentStage(
        Object.assign({}, ProjectData.get(u.id)), 'construction', 'commissioning');
    eq('the stage still moves', r.moved, true);
    eq('but it reports that nothing was measured', r.measured, false);
    var logs = CrmLog.forProspect('p1', 'score');
    eq('and it is logged rather than silent', logs.length, before + 1);
    eq('marked unmeasured', logs[0].unmeasured, true);
    ok('with the reason', /not loaded on this page/.test(logs[0].reason), logs[0].reason);
    global.SiteOpportunity = savedSO;
})();

console.log('\n=== a project whose prospect is gone says so rather than throwing ===');
var orphan = ProjectGates.syncDevelopmentStage(
    { id: 'proj_x', gate: 'permitting_complete', prospect: { prospect_id: 'no_such' }, deliverables: {} },
    'permitting_complete', 'engineering_procurement');
eq('it does not move', orphan.moved, false);
ok('and names the reason', /no longer exists/.test(orphan.reason), orphan.reason);

console.log('\n' + (fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                               : pass + ' passed, ' + fail + ' FAILED'));
process.exit(fail === 0 ? 0 : 1);
