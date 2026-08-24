// Tests for worker-portal/series.js — the daily history behind the hosting chart.
//
// The chart is the first thing in this portal that draws a CONCLUSION rather than displaying a
// stored figure: it puts Proton's meter and the client's pool on the same axes and invites the client
// to read a trend off them. Two failure modes matter more than anything else here, and neither one
// looks like a bug on screen:
//
//   1. A null rendered as a zero. An unreported day drawn at the axis tells a client their fleet
//      stopped. It did not; nobody heard from it.
//   2. A cumulative counter summed instead of differenced. Pools report BTC as a running total,
//      so summing the day's polls multiplies earnings by the poll count. That does not look
//      broken. It looks like a very good month.

var path = require('path');
var S = require(path.join(__dirname, '..', 'worker-portal', 'series.js'));

var pass = 0, fail = 0;
/* JSON.stringify(Infinity) is the string "null", so a plain stringify comparison cannot tell a
   real null from a divide-by-zero. That is not hypothetical: removing the zero-hashrate guard in
   series.js makes efficiency() return Infinity, and this harness reported it as the expected null
   until the mutation run caught the harness rather than the code. Non-finite numbers are tagged
   before comparison. */
function show(v) {
    if (typeof v === 'number' && !isFinite(v)) return String(v);
    return JSON.stringify(v);
}
function eq(label, actual, expected) {
    var a = show(actual), e = show(expected);
    if (a === e) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + '\n        expected ' + e + '\n        actual   ' + a); }
}
function ok(label, cond, note) { eq(label + (note ? '  (' + note + ')' : ''), !!cond, true); }

console.log('\n=== efficiency: watts over terahashes, and null when it cannot be known ===');

// 370 kWh across a full day at 588.3 TH/s. 370000/24 = 15416.7 W; /588.3 = 26.2 J/TH, which is
// the figure portal-demo.js already documents for this fleet.
eq('a full day computes J/TH', S.efficiency(370, 24, 588.3), 26.21);

/* THE HOURS DIVISOR IS THE WHOLE POINT. The same energy over a part-covered day is the same
   average power, not a lower one. Dividing by 24 regardless would report this fleet as a third
   more efficient than it is, and it would do it silently on every partial day. */
eq('a part-covered day divides by the hours actually covered',
   S.efficiency(277.5, 18, 588.3), 26.21);
ok('...which is NOT what dividing by 24 would give',
   S.efficiency(277.5, 18, 588.3) !== S.efficiency(277.5, 24, 588.3));

eq('no hashrate means undefined efficiency, not infinite', S.efficiency(370, 24, 0), null);
eq('no hashrate reported at all', S.efficiency(370, 24, null), null);
eq('no energy reported at all', S.efficiency(null, 24, 588.3), null);
eq('no coverage', S.efficiency(370, 0, 588.3), null);
eq('negative energy is a meter fault, not a number', S.efficiency(-1, 24, 588.3), null);
eq('NaN in, null out', S.efficiency(NaN, 24, 588.3), null);

console.log('\n=== the day range ===');
eq('an inclusive range', S.daysBetween('2026-03-01', '2026-03-04'),
   ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04']);
eq('a single day', S.daysBetween('2026-03-01', '2026-03-01'), ['2026-03-01']);
eq('backwards is empty, not reversed', S.daysBetween('2026-03-04', '2026-03-01'), []);
eq('a month boundary', S.daysBetween('2026-02-27', '2026-03-01').length, 3);
eq('a leap day exists in 2028', S.daysBetween('2028-02-28', '2028-03-01'),
   ['2028-02-28', '2028-02-29', '2028-03-01']);

/* Date.parse ACCEPTS 2026-02-31 and rolls it forward to 3 March rather than rejecting it, so
   without the round-trip check a client asking for a date that does not exist would silently be
   served a different range than the one they asked for. Seven such dates exist in 2026 alone.

   THE `to` DATE HAS TO BE FAR ENOUGH AWAY. The first version of this assertion used 2026-03-02,
   and it passed whether the guard was there or not: the rolled date lands on 3 March, which is
   AFTER the end of the range, so daysBetween returned [] for being backwards rather than for
   being invalid. It was green for a reason that had nothing to do with the thing it named. */
eq('a date that does not exist is refused, not rolled', S.daysBetween('2026-02-31', '2026-03-10'), []);
eq('...at the parse, so nothing downstream sees a rolled value', S.parseDay('2026-02-31'), null);
['2026-02-29', '2026-04-31', '2026-06-31', '2026-11-31'].forEach(function (d) {
    eq('...and likewise ' + d, S.parseDay(d), null);
});
eq('a real leap day still parses', typeof S.parseDay('2028-02-29'), 'number');
eq('not a date at all', S.daysBetween('yesterday', '2026-03-02'), []);
eq('over the cap is refused', S.daysBetween('2020-01-01', '2026-01-01'), []);
ok('the cap itself is allowed', S.daysBetween('2026-01-01',
   new Date(Date.parse('2026-01-01T00:00:00Z') + (S.MAX_DAYS - 1) * 86400000)
       .toISOString().slice(0, 10)).length === S.MAX_DAYS);

console.log('\n=== the pool rollup ===');
function sample(at, workers, btc) { return { at: at, workers: workers, btc_cumulative: btc }; }
function w(name, hr, reported) { return { worker: name, hashrate_th: hr, reported: reported }; }

eq('no samples at all is null across the board, never zero', S.rollupDay([]),
   { hashrate_th: null, uptime_pct: null, workers_reporting: null,
     workers_total: null, btc: null, samples: 0 });

var day = [
    sample('2026-03-01T00:00:00Z', [w('a', 100, true), w('b', 100, true)], 1.0),
    sample('2026-03-01T12:00:00Z', [w('a', 120, true), w('b', 80, true)], 1.5)
];
eq('hashrate is the mean of the per-sample totals', S.rollupDay(day).hashrate_th, 200);
eq('both machines reporting is 100% uptime', S.rollupDay(day).uptime_pct, 100);
eq('the day produced the DIFFERENCE in the counter, not its sum', S.rollupDay(day).btc, 0.5);

/* The bug this exists to prevent: two polls of a cumulative counter reading 1.0 and 1.5 is half a
   coin earned, not two and a half. */
ok('...and specifically not 2.5', S.rollupDay(day).btc !== 2.5);

var halfDark = [
    sample('2026-03-01T00:00:00Z', [w('a', 100, true), w('b', null, false)], 2.0),
    sample('2026-03-01T12:00:00Z', [w('a', 100, true), w('b', null, false)], 2.0)
];
eq('a machine nobody heard from does not contribute 0 TH/s', S.rollupDay(halfDark).hashrate_th, 100);
eq('it does count against uptime', S.rollupDay(halfDark).uptime_pct, 50);
eq('and it is still counted in the fleet', S.rollupDay(halfDark).workers_total, 2);
eq('a day with no movement in the counter earned nothing', S.rollupDay(halfDark).btc, 0);

/* A pull that FAILED has no workers array. It must not be read as "the whole fleet went dark",
   which is what an empty array means and is a completely different fact. */
var pullFailed = [
    { at: '2026-03-01T00:00:00Z' },                       // the pull threw; no workers array
    { at: '2026-03-01T06:00:00Z' },                       // and again
    sample('2026-03-01T12:00:00Z',
           [w('a', 100, true), w('b', 100, true), w('c', 100, true), w('d', 100, true)], 3.0)
];
eq('a failed pull is not a fleet outage', S.rollupDay(pullFailed).uptime_pct, 100);
eq('...and does not drag the hashrate down', S.rollupDay(pullFailed).hashrate_th, 400);

/* UPTIME ALONE CANNOT SEE THIS BUG. Counting the failed pulls as samples adds a 0 to both the
   reporting count and the fleet count, and the RATIO of two averages is unchanged -- so uptime
   still reads 100% either way. The fleet size is what collapses: four machines averaged with two
   phantom zero-machine samples is one and a third. Two earlier versions of this assertion, on
   uptime and on hashrate, both passed with the guard removed. */
eq('...and above all does not shrink the fleet', S.rollupDay(pullFailed).workers_total, 4);

var allDark = [sample('2026-03-01T00:00:00Z', [w('a', null, false), w('b', null, false)], 4.0)];
eq('a genuine full outage IS zero uptime', S.rollupDay(allDark).uptime_pct, 0);
eq('...with hashrate unknown rather than zero', S.rollupDay(allDark).hashrate_th, null);

console.log('\n=== a counter that goes backwards ===');
var reset = [
    sample('2026-03-01T00:00:00Z', [w('a', 100, true)], 9.0),
    sample('2026-03-01T12:00:00Z', [w('a', 100, true)], 0.2)
];
/* The pool reset the counter, the account changed, or these are two different accounts. All three
   make the difference meaningless. Clamping to 0 would hide it; a negative would render as the
   client losing bitcoin. */
eq('a counter that fell reports null, not a negative and not a clamped zero',
   S.rollupDay(reset).btc, null);

console.log('\n=== the join ===');
var days = S.daysBetween('2026-03-01', '2026-03-03');
var pool = { '2026-03-01': S.rollupDay(day) };
var energy = { '2026-03-01': { kwh: 480, hours_covered: 24 },
               '2026-03-03': { kwh: 120, hours_covered: 6 } };
var pts = S.build(days, pool, energy);

eq('every day in range is emitted', pts.length, 3);
eq('...including the ones with nothing in them', pts[1].date, '2026-03-02');
eq('an empty day is null throughout', pts[1].hashrate_th, null);
eq('...and its energy is null too', pts[1].kwh, null);
eq('...and so is anything derived from it', pts[1].efficiency_j_th, null);

eq('a day with both sources gets the derived metric', pts[0].efficiency_j_th, 100);
eq('a day with energy but no pool cannot be given an efficiency', pts[2].efficiency_j_th, null);
eq('...though its energy is still reported', pts[2].kwh, 120);

console.log('\n=== what the client is told about provenance ===');
var src = S.sourcesOf(pts);
eq('days covered', src.days, 3);
eq('days the pool answered', src.pool_days, 1);
eq('days the meter answered', src.meter_days, 2);

console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
