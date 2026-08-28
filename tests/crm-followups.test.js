/* Follow-ups: the due-date machinery.
 *
 * WHY THIS FILE EXISTS. There was no test file for this module. What coverage existed lived
 * inside tests/crm-contacts.test.js and used a single follow-up, which cannot exercise a rule
 * about choosing among many or a boundary between two days. Measured before this file: FOUR
 * mutations passed the entire 48-file suite —
 *
 *   overdue() sorted least-overdue first          green everywhere
 *   overdue() counting today as already overdue    green everywhere
 *   dueToday() returning every pending item        green everywhere
 *   daysOverdue() wrapped in Math.abs              green everywhere
 *
 * The last two are the ones that would hurt. A dueToday() that returns everything makes the
 * morning screen useless the day it has more than one item on it; a daysOverdue() without a sign
 * reports something due in five days as five days LATE.
 *
 * Stage 6 reuses all of this for procurement lead times, where the same functions decide whether
 * a genset needed in eleven months should already have been ordered. Building on an unverified
 * comparator is how a wrong order date looks authoritative.
 */
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
    removeItem: function (k) { delete _store[k]; }
};
global.crypto = require('crypto').webcrypto || require('crypto');
var F = require(path.join(ROOT, 'crm-followups.js'));

var DAY = 86400000;
/* A FIXED CLOCK. Every function here takes nowMs precisely so a test does not have to run at a
   particular time of day, and pinning it also means the day-boundary assertions below cannot
   pass or fail depending on when the suite happens to run. */
var NOW = Date.parse('2026-08-27T14:00:00Z');
function day(offset) { return F.today(NOW + offset * DAY); }
function fresh() { _store = {}; F.reset(); }
function put(prospect, dueOffset, desc) {
    return F.add({ prospect_id: prospect, due_date: day(dueOffset), description: desc });
}

console.log('\n=== the day boundary, which is where an off-by-one hides ===');
fresh();
put('p1', -1, 'yesterday');
put('p1', 0, 'today');
put('p1', 1, 'tomorrow');
eq('three pending', F.pending().length, 3);
/* DUE TODAY IS NOT OVERDUE. It is the single most consequential comparison in the module: it
   decides whether this morning's screen says "you are late" or "do this today", and for Stage 6
   whether an order that should go out today is a miss or a task. */
eq('only yesterday is overdue', F.overdue(NOW).length, 1);
eq('and it is yesterday', F.overdue(NOW)[0].description, 'yesterday');
eq('today is due, not overdue', F.dueToday(NOW).length, 1);
eq('and it is today', F.dueToday(NOW)[0].description, 'today');
eq('tomorrow is neither', F.overdue(NOW).concat(F.dueToday(NOW))
    .filter(function (f) { return f.description === 'tomorrow'; }).length, 0);
// One day later the boundary has moved and every item shifts with it.
eq('a day later, two are overdue', F.overdue(NOW + DAY).length, 2);
eq('and today is now the one due', F.dueToday(NOW + DAY)[0].description, 'tomorrow');

console.log('\n=== dueToday selects, it does not pass everything through ===');
/* The mutation that returned all pending items was green across the whole suite, because no
   fixture ever had a pending item that was NOT due today. */
eq('two of the three pending items are not due today', F.pending().length - F.dueToday(NOW).length, 2);
fresh();
put('p1', 5, 'next week');
put('p1', 9, 'later');
eq('with nothing due today, dueToday is empty even though two are pending', F.dueToday(NOW).length, 0);
eq('while pending still has both', F.pending().length, 2);

console.log('\n=== overdue is ordered, most overdue first ===');
/* "The one that has been waiting longest is the one that has done the most damage" -- the
   module's own words. Four items so the order is a real choice, not a no-op on a list of one. */
fresh();
put('p1', -2, 'two days late');
put('p1', -30, 'a month late');
put('p1', -9, 'nine days late');
put('p1', -1, 'one day late');
var od = F.overdue(NOW);
eq('all four are overdue', od.length, 4);
eq('worst first', od[0].description, 'a month late');
eq('then the next worst', od[1].description, 'nine days late');
eq('then the next', od[2].description, 'two days late');
eq('and the freshest miss last', od[3].description, 'one day late');

console.log('\n=== daysOverdue keeps its sign ===');
/* Math.abs() around this passed the whole suite, because the only fixture that called it was
   already late. Something due in five days reported as five days LATE is the wrong direction on
   exactly the number an order-by date is read from. */
fresh();
var late = put('p1', -5, 'five days late');
var soon = put('p1', 5, 'five days out');
var now0 = put('p1', 0, 'due today');
eq('late is positive', F.daysOverdue(late, NOW), 5);
eq('and future is NEGATIVE, not five days late', F.daysOverdue(soon, NOW), -5);
eq('due today is zero', F.daysOverdue(now0, NOW), 0);
eq('an item with no date has no answer', F.daysOverdue({ id: 'x' }, NOW), null);
eq('and neither does nothing at all', F.daysOverdue(null, NOW), null);

console.log('\n=== nextFor is the soonest, among several ===');
fresh();
put('p1', 12, 'furthest');
put('p1', 3, 'soonest');
put('p1', 7, 'middle');
put('p2', 1, 'another prospect, sooner than all of them');
eq('the soonest on this prospect', F.nextFor('p1').description, 'soonest');
eq('and it does not reach across prospects', F.nextFor('p2').description,
   'another prospect, sooner than all of them');
eq('a prospect with nothing owed', F.nextFor('p3'), null);

console.log('\n=== status decides what is still owed ===');
fresh();
var a = put('p1', -3, 'still open');
var b = put('p1', -4, 'will be done');
var c = put('p1', -5, 'will be cancelled');
eq('three overdue to start', F.overdue(NOW).length, 3);
F.done(b.id);
F.cancel(c.id);
eq('done and cancelled drop out', F.overdue(NOW).length, 1);
eq('leaving the open one', F.overdue(NOW)[0].description, 'still open');
ok('done carries a completion time', !!F.get(b.id).completed_at);
eq('cancelled does not — it was never completed', F.get(c.id).completed_at, null);

console.log('\n=== a snoozed item is still owed, at its new date ===');
fresh();
var s = put('p1', -2, 'snoozed forward');
eq('overdue before the snooze', F.overdue(NOW).length, 1);
F.snooze(s.id, day(4));
eq('no longer overdue', F.overdue(NOW).length, 0);
eq('but still pending, because snoozed is not done', F.pending().length, 1);
eq('and nextFor still finds it', F.nextFor('p1').description, 'snoozed forward');
/* The original date survives so a follow-up cannot quietly slide forever without the record
   showing what was first promised. */
eq('the date it was first promised for is kept', F.get(s.id).original_due, day(-2));
eq('while the working date moved', F.get(s.id).due_date, day(4));
eq('a snooze to nowhere is refused rather than losing the item', F.snooze(s.id, null), null);
eq('and the item is untouched by the refusal', F.get(s.id).due_date, day(4));

console.log('\n=== a follow-up with no date is refused ===');
fresh();
eq('no date, no follow-up', F.add({ prospect_id: 'p1', description: 'someday' }), null);
eq('no prospect either', F.add({ due_date: day(1) }), null);
eq('nothing was stored', F.list().length, 0);

console.log('\n' + (fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                               : pass + ' passed, ' + fail + ' FAILED'));
process.exit(fail === 0 ? 0 : 1);
