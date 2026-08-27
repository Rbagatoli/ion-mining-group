/* Phase 1 of the prospecting CRM: configurable stages, an immutable transition
   log, dead reasons, and time-in-stage.

   The three things this suite exists to hold down, in order of how expensive
   they would be to get wrong:

   1. normalize() silently rewrites any stage it does not recognise back to
      'unreviewed'. That guard is correct and it is also the way a configured
      stage could quietly erase a pipeline's worth of records. If registerStages
      ever stops feeding it, this suite fails before a user finds out.
   2. The transition log is append-only. An edit that overwrites is an edit that
      loses the history the log exists to keep.
   3. Dead needs a reason. A pipeline of deals that died for no recorded reason
      is the same as no pipeline data at all. */

var path = require('path');
var ROOT = path.join(__dirname, '..');

/* localStorage does not exist in node, and these modules are browser IIFEs that
   reach for it directly. A shim rather than a mock: the point is to exercise the
   real read/write/quota paths, not to stub them out. */
var _store = {};
global.localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null; },
    setItem: function (k, v) { _store[k] = String(v); },
    removeItem: function (k) { delete _store[k]; },
    clear: function () { _store = {}; }
};
global.crypto = require('crypto').webcrypto || require('crypto');

var SiteData = require(ROOT + '/site-model.js');
var CrmConfig = require(ROOT + '/crm-config.js');
var CrmLog = require(ROOT + '/crm-log.js');
global.SiteData = SiteData;
global.CrmConfig = CrmConfig;
global.CrmLog = CrmLog;

var pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { pass++; console.log('  ok    ' + label); return; }
    fail++;
    console.log('  FAIL  ' + label + (detail ? '   ' + detail : ''));
}
function eq(label, got, want) {
    ok(got === want, label, 'got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want));
}

function fresh() {
    _store = {};
    CrmConfig.reset();
    CrmLog.reset();
    SiteData.registerStages(SiteData.DEFAULT_STAGES);
}

// ---- Stages -----------------------------------------------------------------
fresh();
eq('the pipeline ships with nine stages', CrmConfig.stageKeys().length, 9);
eq('and it starts where a prospect starts', CrmConfig.stageKeys()[0], 'unreviewed');
eq('and ends where they stop', CrmConfig.stageKeys()[8], 'dead');
ok(CrmConfig.stageKeys().indexOf('negotiating') < 0 &&
   CrmConfig.stageKeys().indexOf('acquired') < 0,
   'the two renamed stages are gone, not aliased',
   'confirmed there were no records on them before renaming');

eq('stages carry a label, not just a key', CrmConfig.stageLabel('in_discussion'), 'In discussion');
eq('and a tone, so a new stage needs no new CSS', CrmConfig.stageTone('closed_won'), 'positive');
eq('an unknown stage still answers with something drawable', CrmConfig.stageTone('nonsense'), 'neutral');

/* The staleness definition lives with the stages rather than in the view that
   uses it, so widening it is one edit. */
var active = CrmConfig.activeStageKeys();
ok(active.indexOf('contacted') >= 0 && active.indexOf('agreement') >= 0,
   'the stages where silence matters are marked active', active.join(', '));
ok(active.indexOf('unreviewed') < 0 && active.indexOf('dead') < 0,
   'and the ones where it does not are not',
   'a prospect nobody has contacted cannot have gone quiet');
eq('each active stage sets its own patience', CrmConfig.staleDaysFor('agreement'), 7);
eq('and an inactive one sets none', CrmConfig.staleDaysFor('unreviewed'), null);

// ---- Configurability, and the rewrite hazard --------------------------------
fresh();
var custom = CrmConfig.stages().concat([
    { key: 'permit_review', label: 'Permit review', tone: 'warm', active: true, staleDays: 21 }
]);
ok(CrmConfig.setStages(custom).ok, 'a stage can be added without a code change');
eq('and it is persisted', CrmConfig.stageKeys().length, 10);

/* THE ONE THAT MATTERS. Without registerStages, site-model.js would not know
   'permit_review' and would rewrite every record on it back to 'unreviewed' the
   next time it was saved — silently, with no error anywhere. */
ok(SiteData.STAGES.indexOf('permit_review') >= 0,
   'and site-model.js is told about it',
   'otherwise normalize() erases every record on that stage');
eq('so a record on the new stage survives normalisation',
   SiteData.normalize({ stage: 'permit_review' }).stage, 'permit_review');
eq('while a stage that really is unknown still falls back',
   SiteData.normalize({ stage: 'definitely-buying' }).stage, 'unreviewed');

/* A configuration that dropped 'unreviewed' would leave normalize() falling back
   to a stage that does not exist. */
CrmConfig.setStages([{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }]);
ok(SiteData.STAGES.indexOf('unreviewed') >= 0,
   'the fallback stage cannot be configured away',
   'normalize() falls back to it, so it has to exist');

/* Two entries sharing a key are ONE stage, not two — a board would otherwise
   render two columns that are the same column, and dragging into either would
   set the same value. The first spelling wins. */
CrmConfig.setStages([{ key: 'x', label: 'X' }, { key: 'x', label: 'Dup' }]);
eq('a duplicate key collapses to one stage', CrmConfig.stageKeys().length, 1);
eq('and the first spelling is the one kept', CrmConfig.stageLabel('x'), 'X');

// ---- Transitions are logged --------------------------------------------------
fresh();
var site = SiteData.add(SiteData.normalize({ id: 'p1', name: 'Cell 4 landfill' }));
eq('a new prospect starts unreviewed', SiteData.get('p1').stage, 'unreviewed');
eq('and has no history yet', CrmLog.forProspect('p1', 'stage').length, 0);
eq('so it has no time in stage', SiteData.daysInStage('p1'), null);

SiteData.setStage('p1', 'researching');
SiteData.setStage('p1', 'contacted', { note: 'Emailed the ops manager' });
var hist = CrmLog.forProspect('p1', 'stage');
eq('every transition is written', hist.length, 2);
eq('newest first', hist[0].to, 'contacted');
eq('and it records where it came from', hist[0].from, 'researching');
eq('and the note travels with it', hist[0].note, 'Emailed the ops manager');
eq('the record itself moved too', SiteData.get('p1').stage, 'contacted');

/* A transition to the stage it is already on is not a transition. */
var n = CrmLog.forProspect('p1', 'stage').length;
SiteData.setStage('p1', 'contacted');
eq('moving to the same stage logs nothing', CrmLog.forProspect('p1', 'stage').length, n);

// ---- Append-only ------------------------------------------------------------
var first = CrmLog.forProspect('p1', 'stage')[1];
var corrected = CrmLog.supersede(first.id, { note: 'Actually it was a phone call' });
ok(corrected.ok, 'an entry can be corrected');
ok(CrmLog.get(first.id) !== null, 'and the original is still there',
   'a correction that overwrites loses the history the log exists to keep');
eq('the original still says what it said', CrmLog.get(first.id).note, null);
eq('and the correction points at it', corrected.entry.supersedes, first.id);
ok(CrmLog.supersededIds()[first.id] === corrected.entry.id,
   'so a timeline can show which entries were revised');

// ---- Dead needs a reason -----------------------------------------------------
fresh();
SiteData.add(SiteData.normalize({ id: 'p2', name: 'Wellpad 7' }));
var refused = SiteData.setStage('p2', 'dead');
ok(refused && refused.ok === false, 'dead is refused without a reason', JSON.stringify(refused));
eq('and the prospect has not moved', SiteData.get('p2').stage, 'unreviewed');

var bad = SiteData.setStage('p2', 'dead', { deadReason: 'bored' });
ok(bad && bad.ok === false, 'and refused with a reason that is not on the list');

SiteData.setStage('p2', 'dead', { deadReason: 'gas_quality', note: 'H2S too high to treat' });
eq('a reason from the list is accepted', SiteData.get('p2').stage, 'dead');
eq('and the reason is on the transition, not just the record',
   CrmLog.forProspect('p2', 'stage')[0].dead_reason, 'gas_quality');

/* Dead is reversible — prospects come back — and the return trip is itself
   history, so the record shows it died once and why. */
SiteData.setStage('p2', 'contacted', { note: 'They called back' });
eq('dead is reversible', SiteData.get('p2').stage, 'contacted');
eq('and the death is still in the record', CrmLog.forProspect('p2', 'stage').length, 2);
eq('with its reason intact',
   CrmLog.forProspect('p2', 'stage')[1].dead_reason, 'gas_quality');

// ---- Time in stage -----------------------------------------------------------
fresh();
SiteData.add(SiteData.normalize({ id: 'p3' }));
SiteData.setStage('p3', 'contacted');
var DAY = 86400000;
var entered = Date.parse(CrmLog.forProspect('p3', 'stage')[0].at);
eq('time in stage is counted from the transition',
   SiteData.daysInStage('p3', entered + 5 * DAY), 5);
eq('and never goes negative on a clock that has gone backwards',
   SiteData.daysInStage('p3', entered - 3 * DAY), 0);

SiteData.setStage('p3', 'in_discussion');
var h = SiteData.stageHistory('p3', Date.parse(CrmLog.forProspect('p3', 'stage')[0].at) + 2 * DAY);
eq('the history reads oldest first', h[0].to, 'contacted');
eq('and the last leg is open', h[h.length - 1].open, true);
eq('and the earlier legs are closed', h[0].open, false);

// ---- The loose field ---------------------------------------------------------
fresh();
var blank = SiteData.blankSite();
ok(blank.custom_fields && typeof blank.custom_fields === 'object',
   'every prospect carries a custom_fields blob',
   'normalize() drops any key not on the template, so the CRM needs one that is');
var kept = SiteData.normalize({ custom_fields: { permit_no: 'AB-1234' } });
eq('and what is put in it survives a save', kept.custom_fields.permit_no, 'AB-1234');
eq('a non-object is coerced rather than trusted',
   JSON.stringify(SiteData.normalize({ custom_fields: 'nope' }).custom_fields), '{}');
var dropped = SiteData.normalize({ some_field_the_crm_invented: 1 });
ok(dropped.some_field_the_crm_invented === undefined,
   'a loose field outside the blob is still dropped, as it always was',
   'which is why the blob exists');

// ---- Standalone --------------------------------------------------------------
/* site-model.js must keep working with no CRM loaded, because its own suite runs
   that way and because a half-loaded page should degrade rather than break. */
fresh();
delete global.CrmLog;
delete global.CrmConfig;
SiteData.add(SiteData.normalize({ id: 'p4' }));
var standalone = SiteData.setStage('p4', 'contacted');
ok(standalone && standalone.stage === 'contacted',
   'stages still move with no CRM modules present');
eq('and time-in-stage answers honestly rather than throwing',
   SiteData.daysInStage('p4'), null);
global.CrmLog = CrmLog;
global.CrmConfig = CrmConfig;

// ---- The payload cannot forge the ordering ------------------------------------
/* append() copies the caller's payload onto the entry, skipping the four fields the
   store owns: id, kind, prospect_id, at. `seq` was not in that list, so a payload
   carrying one overwrote the monotonic counter that forProspect() sorts on when two
   entries share a millisecond -- which is the exact case seq was added to survive.

   Nothing writes a `seq` payload today. It matters now because the execution
   workspace adds log kinds for waivers, change-order approvals and payment
   approvals, and CrmInteractions.correct() already merges a whole prior entry
   forward as a payload (crm-interactions.js:170). Merging an entry that carries its
   own seq is how this stops being theoretical: the corrected copy would inherit the
   original's position and sort as though it had never been corrected. */
fresh();
SiteData.add(SiteData.normalize({ id: 'pseq' }));
CrmLog.append('note', 'pseq', { body: 'first' });
var forged = CrmLog.append('note', 'pseq', { body: 'second', seq: -999 });
ok(forged.ok && forged.entry.seq > 0, 'a payload cannot set seq',
   'entry seq is ' + (forged.entry && forged.entry.seq));

/* The consequence, stated as the behaviour rather than the field: two entries in the
   same millisecond must still come back newest first. This is what the counter is
   for, and it is what a forged seq breaks. */
var order = CrmLog.forProspect('pseq', 'note');
eq('and both entries are still there', order.length, 2);
ok(order[0].body === 'second', 'newest first survives a forged seq',
   'got ' + JSON.stringify(order.map(function (e) { return e.body; })));

/* The four fields that were already guarded stay guarded. Asserted alongside so a
   future edit to the exclusion list cannot quietly drop one of them either. */
var owned = CrmLog.append('note', 'pseq',
    { id: 'forged', kind: 'stage', prospect_id: 'someone_else', at: '1999-01-01T00:00:00.000Z' });
ok(owned.entry.id !== 'forged', 'a payload cannot set id');
ok(owned.entry.kind === 'note', 'a payload cannot set kind');
ok(owned.entry.prospect_id === 'pseq', 'a payload cannot reassign the prospect');
ok(owned.entry.at.slice(0, 4) !== '1999', 'a payload cannot backdate the entry');

console.log(fail ? '\n  ' + fail + ' FAILED' : '\n  ALL PASS — ' + pass + ' assertions');
process.exit(fail ? 1 : 0);
