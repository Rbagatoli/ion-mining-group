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
    var p = { id: 'proj1', target_energization: day(330), procurement: [] };
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
    var p = project({ procurement: [
        item({ id: 'sched', lead_time_weeks: 10 }),
        item({ id: 'late2', lead_time_weeks: 60 }),
        item({ id: 'late1', lead_time_weeks: 52 }),
        item({ id: 'nolead', lead_time_weeks: null }),
        item({ id: 'soon', lead_time_weeks: 44 }),
        item({ id: 'done', lead_time_weeks: 60, status: 'delivered' })
    ] });
    var rows = P.schedule(p, NOW);
    eq('every item is in the schedule', rows.length, 6);
    eq('the latest item is first', rows[0].item.id, 'late2');
    eq('then the next latest', rows[1].item.id, 'late1');
    eq('then the one due soon', rows[2].item.id, 'soon');
    /* Unknown sits above scheduled: an item nobody can date is a question for today. */
    eq('then the one nobody can date', rows[3].item.id, 'nolead');
    eq('then the comfortable one', rows[4].item.id, 'sched');
    eq('and settled items sink', rows[5].item.id, 'done');

    var s = P.summary(p, NOW);
    eq('the summary counts the late ones', s.late, 2);
    eq('and the unknown ones', s.unknown, 1);
    eq('and reports zero as zero rather than absent', s.cancelled, 0);
    ok('every state has a key', Object.keys(s).length >= 8);
}

console.log('\n=== a project with nothing in it does not throw ===');
{
    eq('no procurement array is an empty schedule', P.schedule({}, NOW).length, 0);
    eq('and a null project too', P.schedule(null, NOW).length, 0);
    eq('state of nothing is unknown', P.state(null, project(), NOW), 'unknown');
}

console.log('');
console.log(fail ? '  ' + fail + ' FAILED, ' + pass + ' passed' : '  all ' + pass + ' passed');
process.exitCode = fail ? 1 : 0;
