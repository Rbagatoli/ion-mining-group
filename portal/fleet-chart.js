// The hosting client's history, drawn.
//
// WHY BANDS AND NOT ONE SET OF AXES.
//
// The calculator's chart overlays its series because they share two units: dollars and bitcoin.
// These five do not. Hashrate is TH/s, production is BTC, efficiency is J/TH, uptime is a
// percentage and energy is kWh, and there is no honest way to put five scales on one plot. The
// usual dodge is to normalise everything to 0-100 and drop the axis labels, which makes a chart
// where a 2% uptime dip and a doubling of the fleet look like the same size of event.
//
// So each metric gets its own band with its own labelled y-axis, and they share the x-axis and a
// single crosshair. Reading straight down a date answers "what happened on the 4th" across every
// metric at once, which is the actual question. It is also strictly more information than an
// overlay: nothing is hidden behind anything else.
//
// NOTHING HERE MEASURES THE PAGE. No getBoundingClientRect, no offsetWidth, no ResizeObserver.
// The drawing is an SVG viewBox, and the pointer lands on an invisible hit column that already
// carries its own index, so there is nothing to convert. Same technique the calculator uses.
//
// A GAP IS DRAWN AS A GAP. Runs of nulls break the line rather than interpolating across it, and
// the band is shaded behind the break. This is the single most important behaviour in the file:
// a client whose pool went quiet for three days must not see a line sloping confidently through
// them, and must not see it drop to the axis either. Nobody knows what happened. The chart says so.

var FleetChart = (function () {
    'use strict';

    /* 820 user units is about the rendered width of the portal's content column, so one unit is
       about one pixel and the 10.5px axis type lands at 10.5px rather than being quietly scaled
       under the floor this project sets for text. */
    var VB_W = 820;
    var PAD = { l: 62, r: 54, t: 20, b: 24 };
    var BAND_H = 82;
    /* The gap carries the next band's title, so it is sized for a line of type
       rather than for whitespace. At 16 the title sat inside the band and landed
       on top of its own top gridline label — "Hashrate" written across
       "22.00". */
    var BAND_GAP = 32;

    function isNum(v) { return typeof v === 'number' && isFinite(v); }

    // ---- metrics -----------------------------------------------------------------------------
    //
    // `source` is displayed, not decorative. Two independent parties produce these numbers and the
    // client is entitled to know which is which -- especially for efficiency, which is the ratio
    // of one to the other and is therefore the line that moves when they disagree.

    // `agg` is how the figure under the chart is worked out: a total or a mean. It lives on the
    // metric rather than in the summariser so adding one does not mean editing two places, and so
    // that a quantity can never be summed in one view and averaged in another.
    var SETS = {

        /* A hosting client's fleet. What their machines are doing, what it cost, what it made. */
        hosting: [
            { key: 'hashrate_th', label: 'Hashrate', source: 'pool', agg: 'mean',
              unit: function (m) { return m >= 1000 ? 'PH/s' : 'TH/s'; },
              scale: function (m) { return m >= 1000 ? 0.001 : 1; },
              dp: function (m) { return m >= 1000 ? 2 : 0; } },

            { key: 'btc', label: 'Bitcoin produced', source: 'pool', accent: true, agg: 'sum',
              unit: function () { return 'BTC/day'; },
              scale: function () { return 1; }, dp: function () { return 4; } },

            { key: 'efficiency_j_th', label: 'Efficiency', source: 'both', lowerBetter: true,
              agg: 'mean',
              unit: function () { return 'J/TH'; },
              scale: function () { return 1; }, dp: function () { return 1; } },

            { key: 'uptime_pct', label: 'Uptime', source: 'pool', agg: 'mean',
              unit: function () { return '%'; },
              scale: function () { return 1; }, dp: function () { return 1; } },

            { key: 'kwh', label: 'Energy metered', source: 'meter', agg: 'sum',
              unit: function (m) { return m >= 1000 ? 'MWh' : 'kWh'; },
              scale: function (m) { return m >= 1000 ? 0.001 : 1; },
              dp: function (m) { return m >= 1000 ? 2 : 0; } }
        ],

        /* A GAS PRODUCER'S SITE. The same shape of question, about a different thing: how much
           gas left the site, what it was worth, and — the one that decides both — how much of
           the period the meter actually saw.

           METER COVERAGE IS THIS PORTAL'S UPTIME. A hosting client worries about a machine that
           has stopped hashing; a producer worries about an hour the meter did not record, because
           an unmetered hour is an unbilled hour. It is the same anxiety and it deserves the same
           prominence, which is why it is a first-class series here rather than a footnote on a
           statement. */
        producer: [
            { key: 'mcf', label: 'Gas delivered', source: 'meter', agg: 'sum',
              unit: function () { return 'Mcf'; },
              scale: function () { return 1; },
              dp: function (m) { return m >= 100 ? 0 : 1; } },

            { key: 'usd', label: 'Amount earned', source: 'meter', accent: true, agg: 'sum',
              unit: function () { return 'USD'; },
              scale: function () { return 1; }, dp: function () { return 2; } },

            { key: 'mmbtu', label: 'Energy delivered', source: 'meter', agg: 'sum',
              unit: function () { return 'MMBtu'; },
              scale: function () { return 1; },
              dp: function (m) { return m >= 100 ? 0 : 1; } },

            { key: 'btu_scf', label: 'Heating value', source: 'meter', agg: 'mean',
              unit: function () { return 'Btu/scf'; },
              scale: function () { return 1; }, dp: function () { return 0; } },

            { key: 'coverage_pct', label: 'Meter coverage', source: 'meter', agg: 'mean',
              unit: function () { return '%'; },
              scale: function () { return 1; }, dp: function () { return 1; } }
        ]
    };

    /* The hosting set stays reachable under the old name so nothing that already asks for
       FleetChart.METRICS breaks; new callers pass the set they want. */
    var METRICS = SETS.hosting;

    function metric(key) {
        for (var i = 0; i < METRICS.length; i++) if (METRICS[i].key === key) return METRICS[i];
        return null;
    }

    // ---- scales ------------------------------------------------------------------------------

    /* Round bounds outward to something a person would choose, so the axis reads 26 / 27 / 28 and
       not 25.87 / 26.94 / 28.01.
     *
     * THE AXIS DOES NOT ALWAYS START AT ZERO, and that is deliberate for this data. Uptime lives
     * between 97 and 100; a zero-based axis draws it as a dead flat line at the top and hides the
     * outage the client came here to find. Both bounds are always labelled, so the reader can see
     * where the axis begins rather than having to assume. */
    function niceScale(lo, hi) {
        if (!isNum(lo) || !isNum(hi)) return null;
        /* A FLAT SERIES IS CENTRED, not pushed to the floor. Expanding only upward drew a
           constant 100% coverage as a line sitting on the bottom rule of a 100-110 band, which
           reads as "at the minimum" — the exact opposite of what a flat 100% means. Widening
           both ways puts it where it belongs, in the middle of its own range. */
        if (hi === lo) {
            var pad = (Math.abs(lo) || 1) * 0.05;
            lo -= pad; hi += pad;
        }
        var span = hi - lo;

        /* THE DIVISOR AND THE THRESHOLDS WERE MEASURED, NOT CHOSEN.

           The step is what lo and hi get rounded outward to, so a coarse step
           buys empty axis. Sized off span/2 the hashrate band ran 10 to 25 PH/s
           for data living between 11.6 and 20.2 — 76% of the height spent
           where the data never goes, with the signal squashed into the rest.
           Across the seven real bands in this portal that setting averaged 82%
           wasted and peaked at 150%.

           Seven candidate settings were run against those seven bands. span/5
           with 5 / 2.5 / 1.2 thresholds averages 17% and peaks at 41%.

           An earlier attempt also forced an EVEN number of steps so the middle
           gridline landed on a round number. It made things worse in every set
           measured — it took hashrate from 76% to 134% — because the extra
           step is added to the range whether or not the range needed it. A
           midpoint of 17.50 reads perfectly well; a third of a band of empty
           space does not. */
        var step = Math.pow(10, Math.floor(Math.log(span / 5) / Math.LN10));
        var mult = span / 5 / step;
        if (mult > 5) step *= 10; else if (mult > 2.5) step *= 5; else if (mult > 1.2) step *= 2;
        var a = Math.floor(lo / step) * step;
        var b = Math.ceil(hi / step) * step;

        /* Floating point leaves 26.900000000000002 lying around; the label formatter would print
           it and the gridline would sit a hair off. */
        var dp = Math.max(0, -Math.floor(Math.log(step) / Math.LN10) + 1);
        return { lo: +a.toFixed(dp), hi: +b.toFixed(dp), step: step };
    }

    function extent(points, key) {
        var lo = Infinity, hi = -Infinity, any = false;
        for (var i = 0; i < points.length; i++) {
            var v = points[i][key];
            if (!isNum(v)) continue;
            any = true;
            if (v < lo) lo = v;
            if (v > hi) hi = v;
        }
        return any ? { lo: lo, hi: hi } : null;
    }

    // ---- geometry ----------------------------------------------------------------------------

    /* Contiguous runs of days that actually have a value. Everything else is a hole, and holes are
       what the caller draws differently rather than smoothing over. */
    function runsOf(points, key) {
        var runs = [], cur = null;
        for (var i = 0; i < points.length; i++) {
            if (isNum(points[i][key])) {
                if (!cur) { cur = { from: i, to: i }; runs.push(cur); }
                else cur.to = i;
            } else cur = null;
        }
        return runs;
    }

    /* Monotone cubic (Fritsch-Carlson), same choice and same reason as the calculator: Catmull-Rom
       is smooth but overshoots, and an overshoot here would draw uptime above 100% or bitcoin
       below zero between two points that are neither. */
    function monotonePath(xs, ys) {
        var n = xs.length;
        if (n === 0) return '';
        if (n === 1) return null;                       // a lone point is drawn as a dot instead
        var d = [], m = [], i;
        for (i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
        m.push(d[0]);
        for (i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
        m.push(d[n - 2]);
        for (i = 0; i < n - 1; i++) {
            if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
            var a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
            if (s > 9) { var t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
        }
        var p = 'M' + xs[0].toFixed(1) + ' ' + ys[0].toFixed(1);
        for (i = 0; i < n - 1; i++) {
            var h = xs[i + 1] - xs[i];
            p += 'C' + (xs[i] + h / 3).toFixed(1) + ' ' + (ys[i] + m[i] * h / 3).toFixed(1) +
                 ' ' + (xs[i + 1] - h / 3).toFixed(1) + ' ' + (ys[i + 1] - m[i + 1] * h / 3).toFixed(1) +
                 ' ' + xs[i + 1].toFixed(1) + ' ' + ys[i + 1].toFixed(1);
        }
        return p;
    }

    // ---- formatting --------------------------------------------------------------------------

    function fmt(v, dp) {
        if (!isNum(v)) return '--';
        var s = v.toFixed(dp);
        var parts = s.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return parts.join('.');
    }

    /* "4 Mar" / "4 Mar 26" -- short, and with the year only when the range crosses one, because a
       year on every tick is noise for 90 days and essential for 400. */
    var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function tickLabel(iso, withYear) {
        var p = iso.split('-');
        return String(+p[2]) + ' ' + MON[+p[1] - 1] + (withYear ? ' ' + p[0].slice(2) : '');
    }
    function longDate(iso) {
        var p = iso.split('-');
        return String(+p[2]) + ' ' + MON[+p[1] - 1] + ' ' + p[0];
    }

    function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ---- render ------------------------------------------------------------------------------

    function render(svg, points, visible, metrics) {
        if (!svg) return null;
        var set = metrics || METRICS;
        var keys = set.filter(function (m) { return visible.indexOf(m.key) >= 0; });
        var n = points.length;

        if (!n || !keys.length) {
            svg.setAttribute('viewBox', '0 0 ' + VB_W + ' 80');
            svg.innerHTML = '<text class="fc-empty" x="' + (VB_W / 2) + '" y="44">' +
                (n ? 'Choose at least one metric.' : 'No history for this range.') + '</text>';
            return null;
        }

        var plotW = VB_W - PAD.l - PAD.r;
        var totalH = PAD.t + keys.length * BAND_H + (keys.length - 1) * BAND_GAP + PAD.b;
        svg.setAttribute('viewBox', '0 0 ' + VB_W + ' ' + totalH);

        /* One column per day. With 400 days a column is about two units wide, which is still a
           usable hit target because the columns are contiguous -- there is nowhere to miss. */
        var colW = plotW / n;
        var X = function (i) { return PAD.l + colW * (i + 0.5); };

        var out = [];
        var crossH = keys.length * BAND_H + (keys.length - 1) * BAND_GAP;

        keys.forEach(function (m, bi) {
            var top = PAD.t + bi * (BAND_H + BAND_GAP);
            var bot = top + BAND_H;
            var ext = extent(points, m.key);
            var sc = ext ? niceScale(ext.lo, ext.hi) : null;

            /* The unit is chosen from the magnitude of the data, so a 20,000 TH/s fleet reads as
               20.1 PH/s rather than as five digits on every gridline. */
            var mag = ext ? Math.max(Math.abs(ext.lo), Math.abs(ext.hi)) : 0;
            var mul = m.scale(mag), dp = m.dp(mag), unit = m.unit(mag);

            /* ABOVE the band, not inside it. The y-axis labels live in the
               left gutter at every gridline including the topmost, so anything
               written at the top-left of a band is written over a number. */
            out.push('<text class="fc-band-label" x="0" y="' + (top - 13) + '">' +
                     esc(m.label) +
                     '<tspan class="fc-band-unit" dx="6">' + esc(unit) + '</tspan></text>');

            if (!sc) {
                out.push('<line class="fc-grid" x1="' + PAD.l + '" y1="' + bot +
                         '" x2="' + (VB_W - PAD.r) + '" y2="' + bot + '"/>');
                out.push('<text class="fc-nodata" x="' + (PAD.l + plotW / 2) + '" y="' +
                         (top + BAND_H / 2 + 4) + '">Not reported in this range</text>');
                return;
            }

            var Y = function (v) { return bot - (v - sc.lo) / (sc.hi - sc.lo) * BAND_H; };

            // gridlines: bottom, middle, top -- both bounds always labelled, see niceScale
            [sc.lo, (sc.lo + sc.hi) / 2, sc.hi].forEach(function (g, gi) {
                var y = Y(g);
                out.push('<line class="fc-grid' + (gi === 0 ? ' fc-grid--base' : '') +
                         '" x1="' + PAD.l + '" y1="' + y.toFixed(1) +
                         '" x2="' + (VB_W - PAD.r) + '" y2="' + y.toFixed(1) + '"/>');
                out.push('<text class="fc-ylab" x="' + (PAD.l - 8) + '" y="' + y.toFixed(1) + '">' +
                         fmt(g * mul, dp) + '</text>');
            });

            /* Holes, shaded before the line is drawn so the line sits on top of them. A hole is
               "the pool did not answer", which is a different fact from a low reading and has to
               look different. */
            var hole = null;
            for (var i = 0; i <= n; i++) {
                var missing = i < n && !isNum(points[i][m.key]);
                if (missing && hole === null) hole = i;
                if (!missing && hole !== null) {
                    var x0 = PAD.l + colW * hole, x1 = PAD.l + colW * i;
                    out.push('<rect class="fc-hole" x="' + x0.toFixed(1) + '" y="' + top +
                             '" width="' + Math.max(colW, x1 - x0).toFixed(1) +
                             '" height="' + BAND_H + '"/>');
                    hole = null;
                }
            }

            var cls = 'fc-line' + (m.accent ? ' fc-line--accent' : '');
            runsOf(points, m.key).forEach(function (r) {
                var xs = [], ys = [];
                for (var i = r.from; i <= r.to; i++) { xs.push(X(i)); ys.push(Y(points[i][m.key])); }
                var d = monotonePath(xs, ys);
                if (d === null) {
                    // A single surviving day between two holes still has to appear.
                    out.push('<circle class="fc-dot' + (m.accent ? ' fc-dot--accent' : '') +
                             '" cx="' + xs[0].toFixed(1) + '" cy="' + ys[0].toFixed(1) + '" r="1.9"/>');
                    return;
                }
                out.push('<path class="fc-area' + (m.accent ? ' fc-area--accent' : '') + '" d="' +
                         d + 'L' + xs[xs.length - 1].toFixed(1) + ' ' + bot +
                         'L' + xs[0].toFixed(1) + ' ' + bot + 'Z"/>');
                out.push('<path class="' + cls + '" d="' + d + '"/>');
            });
        });

        // ---- shared x-axis ----
        var spansYear = points[0].date.slice(0, 4) !== points[n - 1].date.slice(0, 4);
        var ticks = Math.min(6, n);
        var axisY = PAD.t + crossH + 16;
        for (var t = 0; t < ticks; t++) {
            var idx = ticks === 1 ? 0 : Math.round(t * (n - 1) / (ticks - 1));
            out.push('<text class="fc-xlab" x="' + X(idx).toFixed(1) + '" y="' + axisY + '">' +
                     tickLabel(points[idx].date, spansYear) + '</text>');
        }

        // ---- crosshair + hit columns ----
        //
        // The crosshair spans every band, which is the whole reason for the layout: one date, read
        // straight down. It is moved by class rather than redrawn, so hovering does not re-render.
        out.push('<line class="fc-cross" id="fcCross" x1="0" y1="' + PAD.t +
                 '" x2="0" y2="' + (PAD.t + crossH) + '" style="display:none"/>');
        for (var k = 0; k < n; k++) {
            out.push('<rect class="fc-hit" data-i="' + k + '" x="' + (PAD.l + colW * k).toFixed(2) +
                     '" y="' + PAD.t + '" width="' + colW.toFixed(2) +
                     '" height="' + crossH + '"/>');
        }

        svg.innerHTML = out.join('');
        return { n: n, X: X, top: PAD.t, bottom: PAD.t + crossH };
    }

    // ---- period summary ----------------------------------------------------------------------

    /* The four figures a client asks for by name: how much bitcoin, and the averages. Computed
     * over exactly the visible range, so the number under the chart and the shape of the chart
     * cannot disagree.
     *
     * AVERAGES SKIP UNKNOWN DAYS RATHER THAN COUNTING THEM AS ZERO, and the count of days that
     * contributed is returned alongside so the caller can say so. "99.2% average uptime over 88 of
     * 90 days" is a different claim from "99.2% average uptime", and only one of them is true.
     */
    function summarise(points, metrics) {
        var set = metrics || METRICS;
        var out = { days: points.length, by: {} };
        set.forEach(function (m) {
            var total = 0, c = 0;
            for (var i = 0; i < points.length; i++) {
                var v = points[i][m.key];
                if (isNum(v)) { total += v; c++; }
            }
            out.by[m.key] = {
                metric: m,
                days: c,
                /* SUM OR MEAN IS THE METRIC'S OWN PROPERTY. Bitcoin and gas are quantities and
                   add up; hashrate and heating value are rates and do not. Deciding it here from
                   the key name would be a guess that is wrong the first time somebody adds a
                   metric whose name does not fit the pattern. */
                value: c === 0 ? null : (m.agg === 'sum' ? total : total / c)
            };
        });
        return out;
    }

    return {
        VB_W: VB_W,
        METRICS: METRICS,
        SETS: SETS,
        metric: metric,
        niceScale: niceScale,
        runsOf: runsOf,
        monotonePath: monotonePath,
        render: render,
        summarise: summarise,
        fmt: fmt,
        longDate: longDate
    };
})();
