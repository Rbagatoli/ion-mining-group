// ===== ION MINING GROUP — Cycle & Valuation Indicators =====
// Pure math over a price series. No DOM, no network, no globals beyond the export — so this
// file can be regression-tested directly in node against known historical extremes.
//
// Input series everywhere is the shared contract from price-history.js:
//     ascending array of { time: <unix seconds>, close: <USD number> }
//
// IMPORTANT FRAMING: none of these predict price. They answer "where does today sit relative
// to Bitcoin's own history". Callers must label them that way.

var CycleIndicators = (function() {

    var DAY = 86400;

    function isoDay(ts) { return new Date(ts * 1000).toISOString().slice(0, 10); }

    // ===== MOVING AVERAGES =====
    // Returns an array aligned 1:1 with `series`; entries before the window is full are null
    // rather than a partial average, which would be misleading (the 200-week MA in particular
    // is only meaningful once 1400 real days exist).
    function movingAverage(series, windowSize) {
        var out = new Array(series.length);
        var sum = 0;
        for (var i = 0; i < series.length; i++) {
            sum += series[i].close;
            if (i >= windowSize) sum -= series[i - windowSize].close;
            out[i] = (i >= windowSize - 1) ? sum / windowSize : null;
        }
        return out;
    }

    // ===== MAYER MULTIPLE =====
    // price / 200-day MA. Historically <0.8 = deep value, ~1 = average, >2.4 = stretched.
    function mayerSeries(series) {
        var ma = movingAverage(series, 200);
        var out = [];
        for (var i = 0; i < series.length; i++) {
            if (ma[i] === null || ma[i] <= 0) continue;
            out.push({ time: series[i].time, value: series[i].close / ma[i] });
        }
        return out;
    }

    // ===== DRAWDOWN FROM RUNNING ALL-TIME HIGH =====
    function drawdownSeries(series) {
        var ath = 0;
        var out = [];
        for (var i = 0; i < series.length; i++) {
            if (series[i].close > ath) ath = series[i].close;
            out.push({ time: series[i].time, value: (series[i].close / ath - 1) * 100, ath: ath });
        }
        return out;
    }

    function currentDrawdown(series) {
        if (!series.length) return null;
        var ath = 0, athIdx = 0;
        for (var i = 0; i < series.length; i++) {
            if (series[i].close > ath) { ath = series[i].close; athIdx = i; }
        }
        var last = series[series.length - 1];
        return {
            pct: (last.close / ath - 1) * 100,
            athPrice: ath,
            athDate: isoDay(series[athIdx].time),
            daysSince: Math.round((last.time - series[athIdx].time) / DAY),
            price: last.close
        };
    }

    // ===== VOLATILITY =====
    // Annualised stdev of daily log returns over the trailing `days`.
    function volatility(series, days) {
        var n = series.length;
        if (n < days + 1) return null;
        var r = [];
        for (var i = n - days; i < n; i++) r.push(Math.log(series[i].close / series[i - 1].close));
        var mean = r.reduce(function(a, b) { return a + b; }, 0) / r.length;
        var varsum = r.reduce(function(a, b) { return a + Math.pow(b - mean, 2); }, 0) / r.length;
        return Math.sqrt(varsum) * Math.sqrt(365) * 100;
    }

    // ===== PUELL MULTIPLE =====
    // Daily issuance value / its own 365-day average. A miner-revenue stress gauge:
    // historically <0.5 = miner capitulation zone, >4 = miner euphoria.
    // `hashrateTimes` is only used to align to days that actually have network data.
    function puellSeries(series, getBlockReward) {
        var issuance = [];
        for (var i = 0; i < series.length; i++) {
            issuance.push({
                time: series[i].time,
                value: 144 * getBlockReward(series[i].time) * series[i].close
            });
        }
        var out = [];
        var sum = 0;
        for (var j = 0; j < issuance.length; j++) {
            sum += issuance[j].value;
            if (j >= 365) sum -= issuance[j - 365].value;
            if (j >= 364) {
                var avg = sum / 365;
                if (avg > 0) out.push({ time: issuance[j].time, value: issuance[j].value / avg });
            }
        }
        return out;
    }

    // ===== PERCENTILE =====
    // What share of the historical readings sit at or below `value` (0-100). This is what
    // makes an unfamiliar indicator readable — "0.90" means nothing, "23rd percentile" does.
    function percentileOf(values, value) {
        if (!values.length) return null;
        var below = 0;
        for (var i = 0; i < values.length; i++) if (values[i] <= value) below++;
        return (below / values.length) * 100;
    }

    // ===== HALVING CYCLE OVERLAY =====
    // Price indexed to 100 at each halving, so cycles can be compared on one axis.
    // Only halvings actually covered by the series produce a track.
    function halvingCycles(series, halvingDates, maxDays) {
        var limit = maxDays || 1400;
        var tracks = [];
        for (var h = 0; h < halvingDates.length; h++) {
            var start = halvingDates[h].ts;
            if (start > series[series.length - 1].time) continue;   // future halving
            var startIdx = -1;
            for (var i = 0; i < series.length; i++) {
                if (series[i].time >= start) { startIdx = i; break; }
            }
            if (startIdx < 0) continue;
            // Require the series to actually begin at/before the halving, otherwise the track
            // starts mid-cycle and the comparison is invalid.
            if (series[startIdx].time - start > 7 * DAY) continue;
            var base = series[startIdx].close;
            var pts = [];
            for (var k = startIdx; k < series.length && (k - startIdx) <= limit; k++) {
                pts.push({ day: k - startIdx, value: (series[k].close / base) * 100 });
            }
            tracks.push({
                label: new Date(start * 1000).getUTCFullYear() + ' halving',
                startDate: isoDay(start),
                points: pts,
                complete: (series.length - startIdx) > limit
            });
        }
        return tracks;
    }

    // ===== DCA BACKTEST =====
    // The honest answer to "when should I buy": show what consistent buying actually did,
    // rather than implying a timing call. Compared against a lump sum on day one.
    function dcaBacktest(series, opts) {
        var amount = opts.amount > 0 ? opts.amount : 100;
        var everyDays = opts.everyDays > 0 ? opts.everyDays : 7;
        var startDate = opts.startDate || isoDay(series[0].time);

        var startIdx = -1;
        for (var i = 0; i < series.length; i++) {
            if (isoDay(series[i].time) >= startDate) { startIdx = i; break; }
        }
        if (startIdx < 0) return null;

        var btc = 0, invested = 0, buys = 0;
        for (var k = startIdx; k < series.length; k += everyDays) {
            btc += amount / series[k].close;
            invested += amount;
            buys++;
        }
        if (invested === 0) return null;

        var price = series[series.length - 1].close;
        var value = btc * price;
        var lumpBtc = invested / series[startIdx].close;

        return {
            invested: invested,
            btc: btc,
            value: value,
            roiPct: (value / invested - 1) * 100,
            buys: buys,
            avgCost: invested / btc,
            startDate: isoDay(series[startIdx].time),
            lumpSumValue: lumpBtc * price,
            lumpSumRoiPct: (lumpBtc * price / invested - 1) * 100
        };
    }

    return {
        movingAverage: movingAverage,
        mayerSeries: mayerSeries,
        drawdownSeries: drawdownSeries,
        currentDrawdown: currentDrawdown,
        volatility: volatility,
        puellSeries: puellSeries,
        percentileOf: percentileOf,
        halvingCycles: halvingCycles,
        dcaBacktest: dcaBacktest,
        isoDay: isoDay
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CycleIndicators;
