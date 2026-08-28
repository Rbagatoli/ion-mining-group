// The project store: promotion, the sealed snapshot, tombstones, the size gate, and the delete
// refusal it puts on SiteData.
//
// Ranked by what it costs to get wrong. A project holds budget commitments and payment
// applications, so the assertions that matter most are the ones about not losing them: the cache
// cannot outlive the string it came from, a rejected write leaves nothing behind, a deletion is a
// value rather than a removed key, and a record written by a newer build is refused rather than
// stripped and written back.

var path = require('path');
var ROOT = path.join(__dirname, '..');

var pass = 0, fail = 0;
function ok(label, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + (detail === undefined ? '' : '\n        ' + JSON.stringify(detail))); }
}
function eq(label, a, b) { ok(label, a === b, { got: a, want: b }); }

/* A real storage shim rather than a mock: these modules reach for localStorage directly, and the
   quota and cache paths are exactly what is being tested. */
var _store = {}, _full = false;
global.localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null; },
    setItem: function (k, v) {
        if (_full) { var e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
        _store[k] = String(v);
    },
    removeItem: function (k) { delete _store[k]; },
    key: function (i) { return Object.keys(_store)[i] || null; }
};
Object.defineProperty(global.localStorage, 'length', { get: function () { return Object.keys(_store).length; } });

var SiteData = require(path.join(ROOT, 'site-model.js'));
var ProjectData = require(path.join(ROOT, 'project-model.js'));
global.SiteData = SiteData;
global.ProjectData = ProjectData;

function fresh() {
    _store = {}; _full = false;
    SiteData.reset && SiteData.reset();
    ProjectData.reset();
    SiteData.add(SiteData.normalize({ id: 'p1', name: 'Pinelands Park LF', latitude: 40.1,
                                      longitude: -74.2, source: 'discovery',
                                      development_stage: 'raw_resource' }));
}
var GOOD = { capacity_kw: 1959, annual_cost_of_capital_pct: 11, budget_authorised_usd: 5400000 };

console.log('\n=== promotion refuses the numbers somebody will be held to ===');
fresh();
eq('a project needs a capacity',
   ProjectData.promote('p1', { annual_cost_of_capital_pct: 11, budget_authorised_usd: 1 }).ok, false);
eq('a project needs a cost of capital',
   ProjectData.promote('p1', { capacity_kw: 1959, budget_authorised_usd: 1 }).ok, false);
ok('and the message says what is missing',
   /cost of capital/i.test(ProjectData.promote('p1', { capacity_kw: 1, budget_authorised_usd: 1 }).err));
eq('a project needs an authorised budget',
   ProjectData.promote('p1', { capacity_kw: 1959, annual_cost_of_capital_pct: 11 }).ok, false);
eq('a cost of capital over 100% is refused, not clamped',
   ProjectData.promote('p1', { capacity_kw: 1, annual_cost_of_capital_pct: 140, budget_authorised_usd: 1 }).ok, false);
eq('a malformed target date is refused rather than nulled',
   ProjectData.promote('p1', Object.assign({}, GOOD, { target_energization: 'next spring' })).ok, false);
eq('an unknown prospect is refused', ProjectData.promote('nope', GOOD).ok, false);
eq('nothing was written by any of those', ProjectData.list().length, 0);

console.log('\n=== a good promotion, and what it freezes ===');
fresh();
var r = ProjectData.promote('p1', GOOD);
ok('it succeeds', r.ok, r.err);
ok('the id is minted, not the prospect id', /^proj_/.test(r.project.id));
eq('prospect_id is recorded as a label', r.project.prospect.prospect_id, 'p1');
eq('the name is snapshotted', r.project.prospect.name, 'Pinelands Park LF');
eq('so is the development stage that priced it', r.project.prospect.development_stage, 'raw_resource');
eq('it starts at the first gate', r.project.gate, 'target_screen');
eq('and every collection exists, empty', Object.keys(r.project.budget_lines).length, 0);
ok('all six collections are present',
   ProjectData.COLLECTIONS.every(function (c) { return r.project[c] && typeof r.project[c] === 'object'; }));

/* The snapshot must not track the prospect. site-capex prices a build off development_stage, so
   a later edit to the prospect would silently reprice a budget already committed against it. */
SiteData.update('p1', { name: 'Renamed Landfill', development_stage: 'constructed' });
ProjectData.reset();
eq('renaming the prospect does not move the snapshot',
   ProjectData.get(r.project.id).prospect.name, 'Pinelands Park LF');
eq('nor does restaging it',
   ProjectData.get(r.project.id).prospect.development_stage, 'raw_resource');

console.log('\n=== one live project per prospect ===');
fresh();
var first = ProjectData.promote('p1', GOOD);
var second = ProjectData.promote('p1', GOOD);
eq('a second promotion is refused', second.ok, false);
ok('and it names the project already running', second.err.indexOf(first.project.id) >= 0, second.err);
eq('still one project', ProjectData.list().length, 1);
ProjectData.cancel(first.project.id, 'gas volume did not hold up');
var third = ProjectData.promote('p1', GOOD);
ok('but a cancelled one does not block re-promotion', third.ok, third.err);

console.log('\n=== sealed fields are refused by name, not stripped ===');
fresh();
var p = ProjectData.promote('p1', GOOD).project;
['id', 'seq', 'created', 'prospect', 'gate', 'budget_lines'].forEach(function (k) {
    var patch = {}; patch[k] = k === 'prospect' ? {} : 'x';
    var res = ProjectData.update(p.id, patch);
    ok('update() refuses ' + k, res.ok === false && res.err.indexOf(k) === 0, res.err);
});
ok('a live field still updates', ProjectData.update(p.id, { notes: 'kick-off booked' }).ok);
/* The whole reason there is no whitelist: an unknown key is carried, not dropped. A stale build
   that stripped what it did not recognise would destroy a Stage 4 ledger for every device. */
ProjectData.update(p.id, { some_future_stage_field: { lines: [1, 2, 3] } });
ProjectData.reset();
eq('an unknown field survives a round trip',
   ProjectData.get(p.id).some_future_stage_field.lines.length, 3);

console.log('\n=== the cache cannot outlive the string it came from ===');
/* sync.js:135 rewrites localStorage from a remote snapshot and touches no module cache, and the
   storage event the app invalidates on does not fire in the writing tab. A cache keyed on nothing
   would then be written back over the remote change. */
fresh();
var q = ProjectData.promote('p1', GOOD).project;
eq('read is cached', ProjectData.get(q.id).name, ProjectData.get(q.id).name);
var raw = JSON.parse(_store.protonMiningProjects);
raw.byProject[q.id].name = 'Changed by another device';
_store.protonMiningProjects = JSON.stringify(raw);
eq('a change underneath the cache is seen without any reset',
   ProjectData.get(q.id).name, 'Changed by another device');

console.log('\n=== a rejected write leaves nothing behind ===');
fresh();
var before = ProjectData.list().length;
_full = true;
var failed = ProjectData.promote('p1', GOOD);
eq('the promotion reports failure', failed.ok, false);
ok('and says the storage is full', /full/i.test(failed.err), failed.err);
_full = false;
ProjectData.reset();
eq('no phantom project is left in memory or on disk', ProjectData.list().length, before);

console.log('\n=== deletion is a tombstone, not a removed key ===');
fresh();
var t = ProjectData.promote('p1', GOOD).project;
eq('a live project cannot be removed', ProjectData.remove(t.id).ok, false);
ok('and the message says to cancel first', /[Cc]ancel/.test(ProjectData.remove(t.id).err));
ProjectData.cancel(t.id, 'operator went with an RNG developer');
eq('a cancelled one can', ProjectData.remove(t.id, 'tidy up').ok, true);
eq('it is gone from the list', ProjectData.list().length, 0);
eq('and from get()', ProjectData.get(t.id), null);
/* The key must still be there. Firestore's merge cannot express a key removal, so a deleted
   project whose key vanished locally would return on the next pull with its whole ledger. */
var onDisk = JSON.parse(_store.protonMiningProjects);
ok('but the key survives on disk as a tombstone',
   !!onDisk.byProject[t.id] && !!onDisk.byProject[t.id].deleted_at);

console.log('\n=== a project with a ledger is not removable by accident ===');
fresh();
var led = ProjectData.promote('p1', GOOD).project;
var d = JSON.parse(_store.protonMiningProjects);
d.byProject[led.id].budget_lines = { bl_1: { category: 'generation', committed_amount: 812000 } };
d.byProject[led.id].gate = 'cancelled';
_store.protonMiningProjects = JSON.stringify(d);
ProjectData.reset();
var refused = ProjectData.remove(led.id);
eq('removal is refused while a collection has entries', refused.ok, false);
ok('and it says which and how many', /1 budget lines/.test(refused.err), refused.err);

console.log('\n=== the size gate warns before it refuses ===');
fresh();
var big = ProjectData.promote('p1', GOOD).project;
var store = JSON.parse(_store.protonMiningProjects);
function pad(kb) {
    var o = {}; var chunk = new Array(1024).join('x');
    for (var i = 0; i < kb; i++) o['k' + i] = chunk;
    return o;
}
store.byProject[big.id].procurement = pad(340);            // ~60-70% of 500 KB
_store.protonMiningProjects = JSON.stringify(store);
ProjectData.reset();
var warned = ProjectData.update(big.id, { notes: 'still fine' });
ok('a write in the notice band succeeds', warned.ok, warned.err);
ok('and carries a notice naming the largest project',
   !!warned.notice && warned.notice.indexOf('Pinelands') >= 0, warned.notice);

store = JSON.parse(_store.protonMiningProjects);
store.byProject[big.id].procurement = pad(520);
_store.protonMiningProjects = JSON.stringify(store);
ProjectData.reset();
var over = ProjectData.update(big.id, { notes: 'too big' });
eq('a write over the ceiling is refused', over.ok, false);
ok('the message says what to do about it',
   /[Aa]rchive/.test(over.err) && /split/.test(over.err), over.err);

console.log('\n=== a newer version is refused, never migrated ===');
fresh();
_store.protonMiningProjects = JSON.stringify({ _v: 99, seq: 1, byProject: { proj_x: { id: 'proj_x' } } });
ProjectData.reset();
eq('nothing is read from it', ProjectData.list().length, 0);
ok('the store reports why', !!ProjectData.blocked() && ProjectData.blocked().have === 99);
var refusedWrite = ProjectData.promote('p1', GOOD);
eq('and refuses to write over it', refusedWrite.ok, false);
ok('saying the build is old', /older build/.test(refusedWrite.err), refusedWrite.err);
eq('the newer data is still on disk, untouched',
   JSON.parse(_store.protonMiningProjects)._v, 99);

console.log('\n=== SiteData.remove refuses a prospect being built ===');
fresh();
var built = ProjectData.promote('p1', GOOD).project;
var del = SiteData.remove('p1');
eq('the delete is refused', del.ok, false);
ok('and names the project', del.err.indexOf(built.id) >= 0, del.err);
ok('the prospect is still there', !!SiteData.get('p1'));
ProjectData.cancel(built.id, 'not proceeding');
eq('cancelling releases it', SiteData.remove('p1').ok, true);
eq('and the prospect is gone', SiteData.get('p1'), null);
/* The project outlives its prospect on purpose -- that is what the snapshot is for. A ledger
   should not evaporate because the research record was tidied up. */
ProjectData.reset();
eq('the project survives, with its snapshot',
   ProjectData.get(built.id).prospect.name, 'Pinelands Park LF');

console.log('\n=== gates in Stage 2 validate the vocabulary and nothing more ===');
fresh();
var g = ProjectData.promote('p1', GOOD).project;
eq('an unknown gate is refused', ProjectData.setGate(g.id, 'nonsense').ok, false);
ok('a forward move works', ProjectData.setGate(g.id, 'diligence').ok);
eq('going back needs a reason', ProjectData.setGate(g.id, 'contact_loi').ok, false);
ok('with one, it moves', ProjectData.setGate(g.id, 'contact_loi', { reason: 'LOI lapsed' }).ok);
eq('cancelling needs a reason', ProjectData.setGate(g.id, 'cancelled').ok, false);
ok('permitting_complete is the gate name, not "permitting"',
   ProjectData.GATES.indexOf('permitting_complete') >= 0 &&
   ProjectData.GATES.indexOf('permitting') < 0);
eq('operating is in the vocabulary as a terminal state',
   ProjectData.GATES[ProjectData.GATES.length - 2], 'operating');

console.log('\n=== it works with nothing else loaded ===');
/* site-model.js is testable standalone and so is this: a half-loaded page should degrade rather
   than break, and the delete refusal is typeof-guarded for the same reason. */
fresh();
var savedSD = global.SiteData, savedPD = global.ProjectData;
delete global.ProjectData;
eq('SiteData.remove works with no project model', SiteData.remove('p1').ok, true);
global.ProjectData = savedPD;
delete global.SiteData;
eq('and promote refuses politely with no site model',
   ProjectData.promote('p1', GOOD).ok, false);
global.SiteData = savedSD;

console.log('\n' + (fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                               : pass + ' passed, ' + fail + ' FAILED'));
process.exit(fail === 0 ? 0 : 1);
