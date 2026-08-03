// ===== ION MINING GROUP — Network History (shared) =====
// Real network difficulty history plus the math for grounding projections in what actually
// happened, instead of a guessed growth rate.
//
// Difficulty only changes at a retarget (~every 2016 blocks / ~14 days), so storing the
// retarget points and stepping between them is EXACT — not an interpolation.
//
// The full mempool.space hashrate/all payload is ~415 KB; we keep only the difficulty
// series (~14 KB) since that is all this module needs.

var NetworkHistory = (function() {

    var DAY = 86400;
    var CACHE_KEY = 'ionMiningDifficultyHistory';
    var CACHE_VERSION = 1;
    var CACHE_TTL_MS = 6 * 60 * 60 * 1000;   // retargets are ~2 weeks apart; 6h is ample

    function loadCache() {
        try {
            var raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            var c = JSON.parse(raw);
            if (!c || c.v !== CACHE_VERSION || !Array.isArray(c.d) || !c.d.length) return null;
            if (Date.now() - (c.t || 0) > CACHE_TTL_MS) return null;
            return c.d.map(function(p) { return { time: p[0], difficulty: p[1] }; });
        } catch (e) { return null; }
    }

    function saveCache(series) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                v: CACHE_VERSION,
                t: Date.now(),
                d: series.map(function(p) { return [p.time, p.difficulty]; })
            }));
        } catch (e) { /* quota — cache is an optimisation */ }
    }

    async function fetchDifficultyHistory() {
        var cached = loadCache();
        if (cached) return cached;
        var res = await fetch('https://mempool.space/api/v1/mining/hashrate/all');
        if (!res.ok) throw new Error('mempool HTTP ' + res.status);
        var data = await res.json();
        if (!data || !Array.isArray(data.difficulty)) throw new Error('unexpected payload');
        var series = data.difficulty
            .map(function(d) { return { time: d.time, difficulty: d.difficulty }; })
            .filter(function(d) { return isFinite(d.time) && isFinite(d.difficulty) && d.difficulty > 0; })
            .sort(function(a, b) { return a.time - b.time; });
        if (!series.length) throw new Error('no difficulty points');
        saveCache(series);
        return series;
    }

    // Difficulty in force at `ts`: the most recent retarget at or before it. Binary search
    // because the backtest calls this once per day over up to ~1100 days.
    function difficultyAt(series, ts) {
        if (!series.length) return null;
        if (ts <= series[0].time) return series[0].difficulty;
        var lo = 0, hi = series.length - 1;
        while (lo < hi) {
            var mid = Math.ceil((lo + hi) / 2);
            if (series[mid].time <= ts) lo = mid; else hi = mid - 1;
        }
        return series[lo].difficulty;
    }

    // Compound monthly rate of change over the trailing `years`, as a percentage.
    // `points` is [{ time, value }] ascending. Returns null if the window is not covered.
    function trailingMonthlyRate(points, years) {
        if (!points || points.length < 2) return null;
        var last = points[points.length - 1];
        var cutoff = last.time - years * 365 * DAY;
        if (points[0].time > cutoff) return null;          // history does not reach back far enough
        var past = null;
        for (var i = 0; i < points.length; i++) {
            if (points[i].time >= cutoff) { past = points[i]; break; }
        }
        if (!past || past.value <= 0 || last.value <= 0) return null;
        var months = (last.time - past.time) / DAY / 30.44;
        if (months < 1) return null;
        return (Math.pow(last.value / past.value, 1 / months) - 1) * 100;
    }

    function toPoints(series, key) {
        return series.map(function(p) { return { time: p.time, value: p[key] }; });
    }

    // ===== BACKTEST =====
    // Replays a rig day by day against the REAL price and the REAL difficulty in force that
    // day. No growth assumptions of any kind — this is a record, not a projection.
    //
    // opts: { priceSeries, difficultySeries, getBlockReward, days,
    //         hashrateTH, powerKW, machineCount, elecCost, poolFeePct, uptimePct,
    //         capex, infrastructureCost }
    function runBacktest(opts) {
        var price = opts.priceSeries, diff = opts.difficultySeries;
        if (!price || !price.length || !diff || !diff.length) return null;

        var endTs = price[price.length - 1].time;
        var startTs = endTs - opts.days * DAY;
        // Do not run past the start of either dataset
        if (startTs < price[0].time) startTs = price[0].time;
        if (startTs < diff[0].time) startTs = diff[0].time;

        var machines = Math.max(1, opts.machineCount || 1);
        var hashH = (opts.hashrateTH || 0) * machines * 1e12;
        var powerKW = (opts.powerKW || 0) * machines;
        var feeMult = 1 - (opts.poolFeePct || 0);
        var uptime = opts.uptimePct === undefined ? 1 : opts.uptimePct;

        var btc = 0, revenue = 0, elec = 0;
        var series = [];
        var firstPrice = null, lastPrice = null;
        var firstDiff = null, lastDiff = null;
        var days = 0;

        for (var i = 0; i < price.length; i++) {
            var p = price[i];
            if (p.time < startTs) continue;
            var d = difficultyAt(diff, p.time);
            if (!d || d <= 0) continue;

            var reward = opts.getBlockReward(p.time);
            var dayBtc = (hashH * DAY * reward) / (d * 4294967296) * feeMult * uptime;
            var dayElec = powerKW * 24 * (opts.elecCost || 0) * uptime;

            btc += dayBtc;
            revenue += dayBtc * p.close;
            elec += dayElec;
            days++;

            if (firstPrice === null) { firstPrice = p.close; firstDiff = d; }
            lastPrice = p.close; lastDiff = d;

            series.push({
                time: p.time,
                cumulBtc: btc,
                cumulRevenue: revenue,
                cumulElec: elec,
                cumulProfit: revenue - elec,
                // Value of everything mined so far marked at today's price — what a HODLer would hold
                heldValue: btc * price[price.length - 1].close
            });
        }

        if (!days) return null;

        var months = days / 30.44;
        var capexTotal = (opts.capex || 0) * machines + (opts.infrastructureCost || 0);

        return {
            days: days,
            startTime: series[0].time,
            endTime: series[series.length - 1].time,
            btcMined: btc,
            revenueUSD: revenue,
            elecUSD: elec,
            profitUSD: revenue - elec,
            capexUSD: capexTotal,
            netAfterCapex: revenue - elec - capexTotal,
            heldValueUSD: btc * lastPrice,
            startPrice: firstPrice,
            endPrice: lastPrice,
            startDifficulty: firstDiff,
            endDifficulty: lastDiff,
            // The rates that actually occurred over this window — directly comparable to the
            // "Monthly Price Change" / "Monthly Difficulty Change" inputs.
            priceRatePctPerMonth: months >= 1 ? (Math.pow(lastPrice / firstPrice, 1 / months) - 1) * 100 : null,
            difficultyRatePctPerMonth: months >= 1 ? (Math.pow(lastDiff / firstDiff, 1 / months) - 1) * 100 : null,
            series: series
        };
    }

    return {
        fetchDifficultyHistory: fetchDifficultyHistory,
        difficultyAt: difficultyAt,
        trailingMonthlyRate: trailingMonthlyRate,
        toPoints: toPoints,
        runBacktest: runBacktest
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = NetworkHistory;
