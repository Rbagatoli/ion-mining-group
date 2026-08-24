// Tests for portal/fleet-chart.js — the hosting client's history, drawn.
//
// A chart is the easiest thing in a codebase to ship broken, because "it renders" and "it is
// telling the truth" look identical in a screenshot. These are the ways this one could lie:
//
//   1. Clip. If an axis is ever narrower than its data, the line leaves the band and the client
//      sees a flat top where their best day was. Property-tested over a few thousand ranges,
//      because it is the failure that a handful of hand-picked cases will not find.
//   2. Interpolate across a gap. Three days nobody heard from must break the line, not slope
//      confidently through them.
//   3. Overshoot. A smooth curve that bulges past its own endpoints draws uptime above 100%.
//   4. Average a null as a zero, in the figures printed under the chart.
//   5. Drift from the real API, so the demo demonstrates a shape the Worker does not serve.

var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
var FleetChart = new Function(
    fs.readFileSync(path.join(ROOT, 'portal', 'fleet-chart.js'), 'utf8') + '; return FleetChart;')();
var Demo = new Function(
    fs.readFileSync(path.join(ROOT, 'portal', 'portal-demo.js'), 'utf8') + '; return PortalDemo;')();
var Series = require(path.join(ROOT, 'worker-portal', 'series.js'));

var CHRN = String.fromCharCode(10);
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

console.log('\n=== an axis can never be narrower than its data ===');
(function () {
    /* THE FAILURE THIS CATCHES IS SILENT. A band whose scale excludes its own maximum draws the
       line out through the top of the band and over the one above it, and the reader's eye
       resolves that as a flat ceiling — the client's best day rendered as a plateau. It is worth
       a property test rather than examples: the bug lives at rounding boundaries, which is
       precisely where hand-picked cases are not. */
    var bad = 0, checked = 0, worst = null;
    var MAG = [0.00001, 0.001, 1, 97, 1000, 20000, 3.5e6];
    for (var mi = 0; mi < MAG.length; mi++) {
        for (var i = 0; i < 400; i++) {
            var lo = MAG[mi] * (i / 400);
            var hi = lo + MAG[mi] * ((i % 37) + 1) / 37;
            var s = FleetChart.niceScale(lo, hi);
            checked++;
            if (!s || s.lo > lo || s.hi < hi) { bad++; if (!worst) worst = [lo, hi, s]; }
        }
    }
    ok('no scale clips its own data', bad === 0,
       checked + ' ranges checked' + (worst ? '; first miss ' + JSON.stringify(worst) : ''));

    /* A flat series still needs a band with height, or every point sits on one line and the
       divide-by-zero shows up as NaN in the path data. */
    var flat = FleetChart.niceScale(42, 42);
    ok('a flat series still gets a range', flat && flat.hi > flat.lo, JSON.stringify(flat));
    ok('and it contains the value', flat.lo <= 42 && flat.hi >= 42);
})();

console.log('\n=== a gap is a gap ===');
(function () {
    var pts = [
        { date: '2026-03-01', v: 10 }, { date: '2026-03-02', v: 12 },
        { date: '2026-03-03', v: null }, { date: '2026-03-04', v: null },
        { date: '2026-03-05', v: 14 }, { date: '2026-03-06', v: 15 }
    ];
    var runs = FleetChart.runsOf(pts, 'v');
    eq('the line is drawn in two pieces, not one', runs.length, 2);
    eq('...the first stopping at the last known day', runs[0], { from: 0, to: 1 });
    eq('...the second starting at the next one', runs[1], { from: 4, to: 5 });

    var allNull = FleetChart.runsOf([{ v: null }, { v: null }], 'v');
    eq('a series with nothing in it draws nothing', allNull.length, 0);

    /* A single surviving day between two holes has no line to be part of. It has to become a dot
       rather than vanishing, which is what a null path signals to the renderer. */
    eq('one lone point is not a path', FleetChart.monotonePath([5], [5]), null);
    ok('two points are', typeof FleetChart.monotonePath([0, 1], [0, 1]) === 'string');
})();

console.log('\n=== the curve cannot bulge past its own points ===');
(function () {
    /* Catmull-Rom would overshoot here and draw a dip below 10 between two points at 50 and 10,
       or a bump above 100 on an uptime band that never left 100. Monotone cubic cannot. */
    function ysOf(d) {
        var nums = d.match(/-?[0-9.]+/g).map(Number);
        return nums.filter(function (_, i) { return i % 2 === 1; });
    }
    [[[0, 10, 20], [50, 10, 50]],
     [[0, 10, 20, 30], [100, 100, 100, 92]],
     [[0, 5, 10, 15, 20], [1, 9, 2, 9, 1]]
    ].forEach(function (c) {
        var ys = ysOf(FleetChart.monotonePath(c[0], c[1]));
        var lo = Math.min.apply(null, c[1]), hi = Math.max.apply(null, c[1]);
        ok('control points stay within [' + lo + ', ' + hi + ']',
           Math.min.apply(null, ys) >= lo - 1e-6 && Math.max.apply(null, ys) <= hi + 1e-6);
    });
})();

console.log(CHRN + '=== the figures under the chart ===');
(function () {
    var HOST = FleetChart.SETS.hosting;
    var pts = [
        { btc: 1, hashrate_th: 100, uptime_pct: 100, efficiency_j_th: 26, kwh: 10 },
        { btc: null, hashrate_th: null, uptime_pct: null, efficiency_j_th: null, kwh: 20 },
        { btc: 3, hashrate_th: 200, uptime_pct: 90, efficiency_j_th: 28, kwh: 30 }
    ];
    var s = FleetChart.summarise(pts, HOST);

    /* THE WHOLE POINT. Averaging the unknown day as a zero gives 100 TH/s and 63.3% uptime, and
       both are claims nobody made about a day nobody has data for. */
    eq('the average skips the unknown day', s.by.hashrate_th.value, 150);
    ok('...and specifically is not the divide-by-three answer', s.by.hashrate_th.value !== 100);
    eq('uptime likewise', s.by.uptime_pct.value, 95);
    eq('the count of days that actually contributed is reported', s.by.hashrate_th.days, 2);
    eq('...against the number in the range', s.days, 3);
    eq('bitcoin is a total, not a mean', s.by.btc.value, 4);
    eq('energy came from the meter on all three days', s.by.kwh.days, 3);

    var empty = FleetChart.summarise([{ btc: null, hashrate_th: null }], HOST);
    eq('nothing known at all is null, not zero', empty.by.hashrate_th.value, null);
    eq('...and says so with a count of zero', empty.by.hashrate_th.days, 0);

    /* SUM OR MEAN IS THE METRIC'S OWN PROPERTY, not a guess from the key name. Getting it
       backwards is invisible: a summed hashrate and an averaged bitcoin both render as a
       plausible number in the right units. */
    var agg = {};
    HOST.forEach(function (m) { agg[m.key] = m.agg; });
    eq('quantities add up', [agg.btc, agg.kwh], ['sum', 'sum']);
    eq('rates do not', [agg.hashrate_th, agg.uptime_pct, agg.efficiency_j_th],
       ['mean', 'mean', 'mean']);
})();

console.log(CHRN + '=== the producer set is the same machinery, different quantities ===');
(function () {
    /* The producer portal reuses this component with its own metric set. What has to hold is
       that the summariser did not learn anything about hosting — if it had, the producer's
       figures would silently be aggregated the wrong way, and a summed heating value or an
       averaged volume still renders as a plausible number in the right units. */
    var GAS = FleetChart.SETS.producer;
    var pts = [
        { mcf: 400, mmbtu: 200, btu_scf: 500, coverage_pct: 100, usd: 650 },
        { mcf: null, mmbtu: null, btu_scf: null, coverage_pct: null, usd: null },
        { mcf: 200, mmbtu: 100, btu_scf: 480, coverage_pct: 50, usd: 325 }
    ];
    var s = FleetChart.summarise(pts, GAS);

    eq('gas is a total', s.by.mcf.value, 600);
    eq('so is the money', s.by.usd.value, 975);
    eq('heating value is a mean', s.by.btu_scf.value, 490);
    eq('coverage is a mean', s.by.coverage_pct.value, 75);
    eq('the unmetered day is left out, not counted as zero', s.by.mcf.days, 2);

    var agg = {};
    GAS.forEach(function (m) { agg[m.key] = m.agg; });
    eq('quantities add up', [agg.mcf, agg.mmbtu, agg.usd], ['sum', 'sum', 'sum']);
    eq('rates do not', [agg.btu_scf, agg.coverage_pct], ['mean', 'mean']);

    /* Both sets have to be renderable, or one of the two portals is broken and nothing says so
       until somebody opens it. */
    [['hosting', FleetChart.SETS.hosting], ['producer', GAS]].forEach(function (t) {
        ok(t[0] + ' metrics all declare a unit, a scale and a precision',
           t[1].every(function (m) {
               return typeof m.unit(1) === 'string' &&
                      typeof m.scale(1) === 'number' &&
                      typeof m.dp(1) === 'number';
           }));
        ok(t[0] + ' has exactly one accent metric',
           t[1].filter(function (m) { return m.accent; }).length === 1);
    });
})();

console.log('\n=== the demo serves the shape the Worker serves ===');
(function () {
    /* The demo is what anybody reviewing this portal actually sees, and it is hand-written rather
       than produced by worker-portal/series.js — the browser cannot load a Worker module. So the
       two will drift unless something compares them, and the failure mode is a chart that works
       perfectly in the preview and breaks the day a real backend answers. */
    /* The route answers with a series PER SITE plus a combined one, because a hosting client can
       hold machines at more than one facility. The per-site points are the shape to compare
       against the Worker's builder — `combined` is a derived view with two extra fields. */
    var demoBody = Demo.handle('/portal/hosting/series', 'demo-session-hosting').body;
    ok('the demo answers the route at all', demoBody && demoBody.sites && demoBody.sites.length > 0);
    var demoPts = demoBody.sites[0].points;
    ok('the first site has points', demoPts && demoPts.length > 0);
    ok('and there is a combined series alongside them',
       demoBody.combined && demoBody.combined.length > 0);

    var real = Series.build(
        Series.daysBetween('2026-03-01', '2026-03-02'),
        { '2026-03-01': Series.rollupDay([
            { at: '2026-03-01T00:00:00Z', workers: [{ worker: 'a', hashrate_th: 100, reported: true }],
              btc_cumulative: 1 },
            { at: '2026-03-01T12:00:00Z', workers: [{ worker: 'a', hashrate_th: 100, reported: true }],
              btc_cumulative: 1.5 }]) },
        { '2026-03-01': { kwh: 60, hours_covered: 24 } });

    var realKeys = Object.keys(real[0]).sort();
    var demoKeys = Object.keys(demoPts[0]).sort();
    eq('every field the Worker sends, the demo sends', realKeys, demoKeys);

    /* Same field, same type — including which fields are allowed to be null. */
    var typesAgree = true, mismatch = null;
    realKeys.forEach(function (k) {
        var a = typeof real[0][k], b = typeof demoPts[0][k];
        if (a !== b) { typesAgree = false; mismatch = k + ': worker ' + a + ', demo ' + b; }
    });
    ok('and of the same type', typesAgree, mismatch || 'all ' + realKeys.length + ' fields');

    /* The demo must refuse what the Worker refuses, or the preview teaches a contract the real
       thing does not honour. */
    eq('a malformed range is refused',
       Demo.handle('/portal/hosting/series?from=2026-13-99', 'demo-session-hosting').status, 400);
    eq('a producer cannot reach the hosting history',
       Demo.handle('/portal/hosting/series', 'demo-session-producer').status, 404);
})();

console.log('\n=== the sample history contains the awkward days on purpose ===');
(function () {
    var pts = Demo.handle('/portal/hosting/series', 'demo-session-hosting').body.sites[0].points;

    var poolDark = pts.filter(function (p) { return p.hashrate_th === null; });
    ok('there is a stretch the pool did not answer', poolDark.length >= 3, poolDark.length + ' days');

    /* The two sources are independent, and this is where that shows. Proton's meter is on a different
       path from the client's pool, so it keeps recording through a pool outage. A sample history
       where both go quiet together would hide the single most important thing this chart does. */
    ok('the meter kept recording through it',
       poolDark.every(function (p) { return typeof p.kwh === 'number'; }));
    ok('and efficiency is unknown for those days, not invented',
       poolDark.every(function (p) { return p.efficiency_j_th === null; }));

    var partial = pts.filter(function (p) { return p.hours_covered !== 24; });
    ok('there is a part-covered meter day', partial.length >= 1);

    var reset = pts.filter(function (p) { return p.btc === null && p.hashrate_th !== null; });
    ok('there is a day the pool counter was reset', reset.length >= 1,
       'btc null while the fleet was reporting');

    var fleet = pts.map(function (p) { return p.workers_total; }).filter(function (v) { return v; });
    ok('the fleet grows rather than staying still',
       fleet[fleet.length - 1] > fleet[0], fleet[0] + ' -> ' + fleet[fleet.length - 1]);

    /* Flat hashrate with falling income is the shape the chart exists to show, so the sample has
       to actually contain it. */
    var early = pts[0], late = pts[pts.length - 1];
    ok('per-terahash earnings decay as difficulty rises',
       (late.btc / late.hashrate_th) < (early.btc / early.hashrate_th));
})();

console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
