/* Stage 6: the procurement schedule.
 *
 * The module is need-by minus lead time compared against today, so the tests are not really
 * about arithmetic — they are about the three absences, each of which has a default that looks
 * like an answer:
 *
 *   lead_time_weeks missing -> 0   would say "order it the day you need it"
 *   need-by missing         -> today  would say "order everything now", every day, forever
 *   day count unsigned      -> abs()  would say a genset due in five weeks is five weeks LATE
 *
 * The third is the one crm-followups.test.js was written for; it is worse here, because a
 * follow-up is usually overdue by a little and an order date is usually months out, so an
 * unsigned count would mark the entire schedule critically late and be believed.
 *
 * Each of those is asserted as a specific value below, not as "not zero" or "is a number". A
 * test that only checks the type passes on every one of them.
 */
var path = require('path');
var ROOT = path.join(__dirname, '..');

var pass = 0, fail = 0;
function ok(label, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + (detail === undefined ? '' : '\n        ' + JSON.stringify(detail))); }
}
function eq(label, a, b) { ok(label, a === b, { got: a, want: b }); }

/* CrmFollowups reaches for localStorage on load. It is not exercised here beyond its date
   comparator, but it has to be able to construct. */
var _store = {};
global.localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null; },
    setItem: function (k, v) { _store[k] = String(v); },
    removeItem: function (k) { delete _store[k]; },
    key: function (i) { return Object.keys(_store)[i] || null; }
};
Object.defineProperty(global.localStorage, 'length', { get: function () { return Object.keys(_store).length; } });

var CrmFollowups = require(path.join(ROOT, 'crm-followups.js'));
global.CrmFollowups = CrmFollowups;
var P = require(path.join(ROOT, 'procurement.js'));

/* A fixed clock. Every date below is relative to this, so nothing here rots. */
var NOW = Date.parse('2026-08-28T09:00:00Z');
var day = function (n) { return new Date(NOW + n * 86400000).toISOString().slice(0, 10); };

function project(over) {
    var p = { id: 'proj1', target_energization: day(330), procurement: {} };
    for (var k in (over || {})) p[k] = over[k];
    return p;
}
function item(over) {
    var it = { id: 'i1', description: 'Genset 2MW', lead_time_weeks: 44, status: 'planned' };
    for (var k in (over || {})) it[k] = over[k];
    return it;
}

console.log('\n=== the order date is the need-by date minus the lead time ===');
{
    var p = project();
    /* 330 days out, 44 weeks (308 days) of lead: 22 days of slack. */
    eq('order-by is need-by minus lead weeks', P.orderBy(item(), p), day(22));
    eq('and a zero lead time orders on the day it is needed',
       P.orderBy(item({ lead_time_weeks: 0 }), p), day(330));
    eq("an item's own need_by beats the project energisation date",
       P.orderBy(item({ need_by: day(100), lead_time_weeks: 10 }), p), day(30));
}

console.log('\n=== a missing input is unknown, never a reassuring default ===');
{
    var p = project();

    /* THE ZERO-LEAD-TIME DEFAULT. If this returned day(330) the schedule would say an item
       nobody has a lead time for can be ordered the day it is needed. */
    eq('no lead time gives no order date', P.orderBy(item({ lead_time_weeks: null }), p), null);
    eq('and the state is unknown, not scheduled',
       P.state(item({ lead_time_weeks: null }), p, NOW), 'unknown');
    eq('an empty string is absent, not zero', P.orderBy(item({ lead_time_weeks: '' }), p), null);
    eq('and so is a non-numeric one', P.orderBy(item({ lead_time_weeks: 'six' }), p), null);
    eq('a negative lead time is refused rather than run backwards',
       P.orderBy(item({ lead_time_weeks: -4 }), p), null);
    /* Zero is a real answer and must survive the same checks that reject the others. */
    eq('zero weeks is a value, not an absence', P.leadWeeks(item({ lead_time_weeks: 0 })), 0);

    /* THE TODAY DEFAULT. With no energisation date and no item need_by there is nothing to
       count back from, and "now" would mark every item on the project as needing an order. */
    var noDate = project({ target_energization: null });
    eq('no need-by anywhere gives no order date', P.orderBy(item(), noDate), null);
    eq('and that item is unknown too', P.state(item(), noDate, NOW), 'unknown');
    eq('a malformed energisation date is not a date',
       P.orderBy(item(), project({ target_energization: '28/08/2026' })), null);
}

console.log('\n=== how late is signed, and it is the comparator that already existed ===');
{
    var p = project();
    /* Order date 22 days from now: 22 days of slack, NOT 22 days late. */
    eq('slack reads as negative days', P.daysLate(item(), p, NOW), -22);
    eq('a passed order date reads as positive',
       P.daysLate(item({ lead_time_weeks: 52 }), p, NOW), 34);
    eq('the day itself is zero', P.daysLate(item({ lead_time_weeks: 330 / 7 }), p, NOW), 0);

    /* Same question, same answer as the module Stage 6 was told to build on. Delegation is the
       assertion: two implementations that agree today are the ones that drift. */
    eq('it is CrmFollowups.daysOverdue underneath',
       P.daysLate(item(), p, NOW),
       CrmFollowups.daysOverdue({ due_date: P.orderBy(item(), p) }, NOW));
}

console.log('\n=== states ===');
{
    var p = project();
    eq('past the order date is late', P.state(item({ lead_time_weeks: 52 }), p, NOW), 'late');
    eq('inside thirty days is due soon', P.state(item(), p, NOW), 'due_soon');
    eq('further out is merely scheduled',
       P.state(item({ lead_time_weeks: 20 }), p, NOW), 'scheduled');

    /* Once it is on order the date has been met and the schedule stops asking. */
    P.SETTLED.forEach(function (st) {
        eq('a ' + st + ' item is never late',
           P.state(item({ lead_time_weeks: 52, status: st }), p, NOW), st);
    });

    /* The boundary, stated exactly: 30 days of slack is not yet "due soon". */
    eq('the due-soon band excludes its far edge',
       P.state(item({ lead_time_weeks: (330 - 30) / 7 }), p, NOW), 'scheduled');
    eq('and includes one day inside it',
       P.state(item({ lead_time_weeks: (330 - 29) / 7 }), p, NOW), 'due_soon');
}

console.log('\n=== the air permit blocks the order, and says so even when late ===');
{
    var p = project();
    var issued = false;
    global.ProjectGates = { permitIssued: function () { return issued; } };

    var genset = item({ permit_required: true, lead_time_weeks: 52 });
    ok('an unissued permit blocks a permit-required item', P.permitBlocked(genset, p));
    eq('and the state says blocked rather than late', P.state(genset, p, NOW), 'blocked');

    issued = true;
    ok('an issued permit does not block', !P.permitBlocked(genset, p));
    eq('and the item goes back to being late', P.state(genset, p, NOW), 'late');

    issued = false;
    ok('an item that needs no permit is never blocked',
       !P.permitBlocked(item({ permit_required: false }), p));

    /* A blocked item still reports its lateness, because "past the order date AND unable to
       order" is the thing worth seeing. */
    eq('a blocked item still carries how late it is', P.daysLate(genset, p, NOW), 34);
    delete global.ProjectGates;
}

console.log('\n=== normalizeItem fills what is missing and keeps what it does not own ===');
{
    var n = P.normalizeItem({ id: 'x', lead_time_weeks: '12', status: 'nonsense',
                              need_by: 'not-a-day', vendor_notes: 'keep me' });
    eq('a numeric string becomes a number', n.lead_time_weeks, 12);
    eq('an invented status falls back to planned', n.status, 'planned');
    eq('a malformed day becomes null', n.need_by, null);
    eq('an unknown key is carried through untouched', n.vendor_notes, 'keep me');
    eq('permit_required is a boolean', n.permit_required, false);
    /* The same reason normalizeProject() has no whitelist: a stale build that stripped what it
       did not recognise would delete a newer build's fields and sync the deletion. */
    ok('normalizing is idempotent',
       JSON.stringify(P.normalizeItem(n)) === JSON.stringify(n));
}

console.log('\n=== the schedule puts the worst first ===');
{
    /* A MAP KEYED BY ID. project-model.js keeps every per-project collection as a map,
       because Firestore's merge deep-merges maps and replaces arrays wholesale - as an
       array, two devices each adding an item lose one silently, and normalizeProject()
       discards an array outright. The first version of these tests used arrays throughout
       and passed while the module read a shape storage can never produce. */
    var byId = function (list) {
        var m = {};
        list.forEach(function (it) { m[it.id] = it; });
        return m;
    };
    var p = project({ procurement: byId([
        item({ id: 'sched', lead_time_weeks: 10 }),
        item({ id: 'late2', lead_time_weeks: 60 }),
        item({ id: 'late1', lead_time_weeks: 52 }),
        item({ id: 'nolead', lead_time_weeks: null }),
        item({ id: 'soon', lead_time_weeks: 44 }),
        item({ id: 'done', lead_time_weeks: 60, status: 'delivered' })
    ]) });
    var rows = P.schedule(p, NOW);
    eq('every item is in the schedule', rows.length, 6);
    /* Indexed through a helper so a schedule that comes back empty reports six failed
       expectations rather than throwing on rows[0] and taking the rest of the file with
       it. The first shape bug did exactly that, and a TypeError stack is a worse
       description of "the module read the wrong collection" than a list of wanted ids. */
    var at = function (i) { return (rows[i] && rows[i].item && rows[i].item.id) || null; };
    eq('the latest item is first', at(0), 'late2');
    eq('then the next latest', at(1), 'late1');
    eq('then the one due soon', at(2), 'soon');
    /* Unknown sits above scheduled: an item nobody can date is a question for today. */
    eq('then the one nobody can date', at(3), 'nolead');
    eq('then the comfortable one', at(4), 'sched');
    eq('and settled items sink', at(5), 'done');

    var s = P.summary(p, NOW);
    eq('the summary counts the late ones', s.late, 2);
    eq('and the unknown ones', s.unknown, 1);
    eq('and reports zero as zero rather than absent', s.cancelled, 0);
    ok('every state has a key', Object.keys(s).length >= 8);
}

console.log('\n=== the shape is the one project-model actually stores ===');
{
    /* THE TEST THAT COULD NOT HAVE BEEN WRITTEN FROM BELIEF.
     *
     * Every other fixture in this file is built by this file, so every one of them agrees with
     * whatever this file thinks a project looks like. That is exactly how the first version
     * passed fifty assertions while the module read arrays: the tests and the module shared one
     * wrong assumption and nothing else was consulted. This hands a record to the real
     * normalizer and reads back what survives. */
    var PD = require(path.join(ROOT, 'project-model.js'));
    ok('project-model exposes its normalizer', typeof PD.normalizeProject === 'function');
    if (typeof PD.normalizeProject === 'function') {
        var norm = PD.normalizeProject({ id: 'pr1', prospect_id: 'p1', capacity_kw: 1000,
            target_energization: day(330),
            procurement: { g1: { id: 'g1', description: 'Genset', lead_time_weeks: 60 } } });
        ok('a map in procurement survives normalization',
           norm.procurement && typeof norm.procurement === 'object'
               && !Array.isArray(norm.procurement));
        eq('with the item still in it', Object.keys(norm.procurement).length, 1);
        eq('and the schedule reads it', P.schedule(norm, NOW).length, 1);
        eq('and dates it',
           (P.schedule(norm, NOW)[0] || {}).order_by, day(330 - 60 * 7));

        /* The half that makes the map load-bearing rather than stylistic: an array is thrown
           away by the normalizer, so a module reading arrays reports an empty schedule on a
           project that has items, forever, with nothing failing. */
        var arr = PD.normalizeProject({ id: 'pr2', prospect_id: 'p1', capacity_kw: 1000,
            procurement: [{ id: 'g1', description: 'Genset', lead_time_weeks: 60 }] });
        eq('an array is discarded outright', Object.keys(arr.procurement).length, 0);
    }

    /* Filed under a key with no id of its own: it still has one to sort and render by. */
    eq('the map key becomes the id when the item has none',
       P.schedule({ id: 'pr3', target_energization: day(330),
                    procurement: { k9: { description: 'Unnamed', lead_time_weeks: 10 } } },
                  NOW).map(function (r) { return r.item.id; })[0], 'k9');
}

console.log('\n=== a project with nothing in it does not throw ===');
{
    eq('no procurement map is an empty schedule', P.schedule({}, NOW).length, 0);
    /* Refused rather than tolerated: storage cannot produce an array, so accepting one
       would only hide the same mistake in the next caller. */
    eq('an array is not read as a schedule',
       P.schedule({ procurement: [{ id: 'x', lead_time_weeks: 4 }] }, NOW).length, 0);
    eq('and a null project too', P.schedule(null, NOW).length, 0);
    eq('state of nothing is unknown', P.state(null, project(), NOW), 'unknown');
}

/* ===== The writers =====
 *
 * The module shipped with none, and nothing else in the repo wrote `project.procurement`, so the
 * panel reported "nothing on the schedule yet" on every project forever. That is the same
 * OUTCOME as the array bug above, reached from the other end, and no test caught it because
 * every module involved was correct on its own.
 *
 * These run against the real store — SiteData, ProjectData, the localStorage shim above — so
 * the fixtures are built by the owning module's writer rather than by this file, which is the
 * rule the array bug taught.
 */
console.log('\n=== putting something on the schedule ===');
var PDW = require(path.join(ROOT, 'project-model.js'));
global.ProjectData = PDW;
global.CrmConfig = require(path.join(ROOT, 'crm-config.js'));
global.CrmLog = require(path.join(ROOT, 'crm-log.js'));
global.SiteData = require(path.join(ROOT, 'site-model.js'));
var SiteData = global.SiteData;

var PID = null;
function freshProject() {
    for (var k in _store) delete _store[k];
    [global.CrmConfig, global.CrmLog, PDW].forEach(function (m) { if (m && m.reset) m.reset(); });
    SiteData.add(SiteData.normalize({ id: 'p1', name: 'Pinelands Park LF',
                                      development_stage: 'raw_resource' }));
    PID = PDW.promote('p1', { capacity_kw: 1959, annual_cost_of_capital_pct: 11,
                              budget_authorised_usd: 5400000,
                              target_energization: day(330) }).project.id;
    return PID;
}
function live() { return PDW.get(PID); }
function only() { return P.schedule(live(), NOW)[0]; }

{
    freshProject();
    var add = P.addItem(PID, { description: 'Genset 2MW', vendor: 'Jenbacher',
                               lead_time_weeks: 44 });
    ok('an item is added', add.ok, add.err);
    eq('and the schedule can see it', P.schedule(live(), NOW).length, 1);
    eq('dated back from the energisation date', only().order_by, day(330 - 44 * 7));
    eq('it starts planned', only().item.status, 'planned');

    /* THE BLANK LEAD TIME HAS TO BE RECORDABLE, or the distinction the whole module rests on
       is unreachable: the genset nobody has quoted is exactly the one worth seeing, and an item
       refused at the door is not 'unknown', it is invisible. */
    var vague = P.addItem(PID, { description: 'Transformer' });
    ok('an item with no lead time is accepted', vague.ok, vague.err);
    var undated = P.schedule(live(), NOW).filter(function (r) { return r.state === 'unknown'; });
    eq('and lands as undated rather than as scheduled', undated.length, 1);
    eq('with no order date invented for it', undated[0].order_by, null);

    ok('a description is required', !P.addItem(PID, { lead_time_weeks: 4 }).ok);
    ok('a negative lead time is refused', !P.addItem(PID, { description: 'x',
                                                            lead_time_weeks: -3 }).ok);
    ok('and a need-by that is not a date', !P.addItem(PID, { description: 'x',
                                                             need_by: 'next spring' }).ok);
}

console.log('\n=== ordering against an unissued permit is recorded, and said out loud ===');
{
    freshProject();
    var id = P.addItem(PID, { description: 'Genset 2MW', lead_time_weeks: 44,
                              permit_required: true }).id;
    global.ProjectGates = { permitIssued: function () { return false; } };
    eq('it reads as blocked first', only().state, 'blocked');
    var res = P.setStatus(PID, id, 'ordered');
    /* NOT REFUSED. The purchase order is placed by a person, not by this module; refusing would
       stop the record and not the deposit, and an item filed as still planned when the money is
       gone is the worse of the two. Same argument recordPayment() makes. */
    ok('ordering it anyway is allowed', res.ok, res.err);
    ok('and the caller is handed a notice naming the risk',
       /at risk/i.test(res.notice || ''), res.notice);
    eq('the schedule now shows it ordered', only().state, 'ordered');
    delete global.ProjectGates;

    var clean = P.setStatus(PID, id, 'delivered');
    ok('a status move with nothing stepped over carries no notice', clean.ok && !clean.notice);
    ok('an unknown status is refused', !P.setStatus(PID, id, 'shipped').ok);
}

console.log('\n=== an item is removed as a tombstone, and only before it is bought ===');
{
    freshProject();
    var id = P.addItem(PID, { description: 'Spare rotor', lead_time_weeks: 6 }).id;
    var rm = P.removeItem(PID, id, 'ordered by the EPC instead');
    ok('a planned item can be removed', rm.ok, rm.err);
    eq('and it leaves the schedule', P.schedule(live(), NOW).length, 0);
    /* Firestore's merge cannot express a key removal, so a deleted key returns on the next pull
       with no sign it ever went. The record stays and carries the reason. */
    ok('but the record survives in storage, marked',
       localStorage.getItem(PDW.KEY).indexOf('ordered by the EPC instead') > 0);

    var bought = P.addItem(PID, { description: 'Genset', lead_time_weeks: 44 }).id;
    P.setStatus(PID, bought, 'ordered');
    var no = P.removeItem(PID, bought, 'changed our mind');
    ok('an ordered item cannot be deleted', !no.ok);
    ok('and it says to cancel instead, so the money still shows',
       /cancel/i.test(no.err || ''), no.err);
    eq('it is still on the schedule', P.schedule(live(), NOW).length, 1);
}

console.log('\n=== editing an item, and what editing cannot reach ===');
{
    freshProject();
    var id = P.addItem(PID, { description: 'Genset', lead_time_weeks: 44 }).id;
    ok('the lead time can be corrected', P.updateItem(PID, id, { lead_time_weeks: 52 }).ok);
    eq('and the order date moves with it', only().order_by, day(330 - 52 * 7));
    /* Clearing it back to unknown is a real edit: a quote can be withdrawn. */
    ok('it can be cleared back to unknown', P.updateItem(PID, id, { lead_time_weeks: null }).ok);
    eq('and the item goes undated rather than to zero weeks', only().state, 'unknown');
    /* Refused by NAME rather than stripped. status moves through setStatus(), which is the one
       that knows what ordering against an unissued permit means. */
    ok('status cannot be set through updateItem', !P.updateItem(PID, id, { status: 'ordered' }).ok);
    ok('nor can a field nobody named', !P.updateItem(PID, id, { days_late: 0 }).ok);
    ok('and no such item is refused', !P.updateItem(PID, 'nope', { vendor: 'x' }).ok);
}

console.log('\n=== nothing derived reaches storage ===');
{
    freshProject();
    P.addItem(PID, { description: 'Genset', lead_time_weeks: 44 });
    var raw = localStorage.getItem(PDW.KEY);
    ['order_by', 'days_late', 'permit_blocked', '"state"'].forEach(function (k) {
        ok('no ' + k + ' in the stored bytes', raw.indexOf(k.charAt(0) === '"' ? k : '"' + k + '"') < 0);
    });
    ok('but the item itself is there', raw.indexOf('"lead_time_weeks":44') > 0);
}

console.log('');
console.log(fail ? '  ' + fail + ' FAILED, ' + pass + ' passed' : '  all ' + pass + ' passed');
process.exitCode = fail ? 1 : 0;
