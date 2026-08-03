// ===== ION MINING GROUP — BTC Price History (shared) =====
// CryptoCompare's keyless min-api was retired (it now answers 401 "API key required").
// Coinbase Exchange serves the same daily candles with no key, but caps a response at 300
// candles — so full history is paged once, cached in localStorage, and thereafter only the
// tail is re-pulled.
//
// Extracted from charts.js so more than one page can share a single backfill and a single
// cache. Duplicating this would mean two independent ~15-request cold starts.
//
// Series contract, relied on by every consumer:
//     ascending array of { time: <unix seconds>, close: <USD number> }, one entry per period.

var PriceHistory = (function() {

    var DAY_SECONDS = 86400;
    var CANDLE_PAGE_LIMIT = 300;                      // Coinbase hard cap per response
    var COINBASE_HISTORY_START = Date.UTC(2015, 0, 1) / 1000;
    var PRICE_CACHE_KEY = 'ionMiningPriceHistory';
    var PRICE_CACHE_VERSION = 1;

    // Actual halving dates (UTC). Estimating block height as daysSinceGenesis * 144 lagged
    // reality by 5-8 months at every halving, because blocks arrive faster than 10 minutes.
    var HALVING_DATES = [
        { ts: Date.UTC(2012, 10, 28) / 1000, reward: 25 },
        { ts: Date.UTC(2016, 6, 9) / 1000,   reward: 12.5 },
        { ts: Date.UTC(2020, 4, 11) / 1000,  reward: 6.25 },
        { ts: Date.UTC(2024, 3, 19) / 1000,  reward: 3.125 },
        { ts: Date.UTC(2028, 3, 17) / 1000,  reward: 1.5625 }   // projected
    ];

    function getBlockReward(ts) {
        var reward = 50;
        for (var i = 0; i < HALVING_DATES.length; i++) {
            if (ts >= HALVING_DATES[i].ts) reward = HALVING_DATES[i].reward;
        }
        return reward;
    }

    // ===== CACHE =====

    function loadPriceCache() {
        try {
            var raw = localStorage.getItem(PRICE_CACHE_KEY);
            if (!raw) return null;
            var c = JSON.parse(raw);
            if (!c || c.v !== PRICE_CACHE_VERSION || !Array.isArray(c.d) || c.d.length === 0) return null;
            return c.d.map(function(p) { return { time: p[0], close: p[1] }; });
        } catch (e) { return null; }
    }

    function savePriceCache(series) {
        try {
            localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify({
                v: PRICE_CACHE_VERSION,
                d: series.map(function(p) { return [p.time, p.close]; })
            }));
        } catch (e) { /* quota exceeded — the cache is an optimisation, not a requirement */ }
    }

    // ===== FETCH =====

    async function fetchCoinbaseWindow(startSec, endSec, granularity) {
        var gran = granularity || DAY_SECONDS;
        var url = 'https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=' + gran +
            '&start=' + new Date(startSec * 1000).toISOString() +
            '&end=' + new Date(endSec * 1000).toISOString();
        var res = await fetch(url);
        if (!res.ok) throw new Error('Coinbase HTTP ' + res.status);
        var rows = await res.json();
        if (!Array.isArray(rows)) throw new Error('Coinbase returned an unexpected payload');
        // row = [ time, low, high, open, close, volume ]
        return rows.map(function(r) { return { time: r[0], close: r[4] }; });
    }

    // Walk forward from `fromSec` to now. Each page is capped at 300 candles by the API, so
    // the window length has to scale with the granularity.
    async function fetchCoinbaseRange(fromSec, onProgress, granularity) {
        var gran = granularity || DAY_SECONDS;
        var pageSpan = CANDLE_PAGE_LIMIT * gran;
        var now = Math.floor(Date.now() / 1000);
        var out = [];
        var cursor = fromSec;
        var guard = 0;
        while (cursor < now && guard++ < 60) {   // guard: never loop unbounded on a clock skew
            var windowEnd = Math.min(cursor + pageSpan, now);
            out = out.concat(await fetchCoinbaseWindow(cursor, windowEnd, gran));
            if (typeof onProgress === 'function') onProgress(guard);
            cursor = windowEnd + gran;
        }
        return out;
    }

    // Keyless CoinGecko is capped at 365 days — last resort only, so the chart shows something.
    async function fetchCoinGeckoYear() {
        var res = await fetch('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=365');
        if (!res.ok) throw new Error('CoinGecko HTTP ' + res.status);
        var data = await res.json();
        if (!data || !Array.isArray(data.prices)) throw new Error('CoinGecko returned an unexpected payload');
        return data.prices.map(function(p) { return { time: Math.floor(p[0] / 1000), close: p[1] }; });
    }

    // ===== SERIES HELPERS =====

    // Collapse to one entry per UTC day, newest wins, sorted ascending. Coinbase returns
    // candles newest-first and pages overlap at the seams, so this de-dupes and orders.
    function mergePriceSeries(base, incoming) {
        var byDay = {};
        var i;
        for (i = 0; i < base.length; i++) byDay[Math.floor(base[i].time / DAY_SECONDS)] = base[i];
        for (i = 0; i < incoming.length; i++) byDay[Math.floor(incoming[i].time / DAY_SECONDS)] = incoming[i];
        var keys = Object.keys(byDay).map(Number).sort(function(a, b) { return a - b; });
        var out = [];
        for (i = 0; i < keys.length; i++) {
            var e = byDay[keys[i]];
            if (e && isFinite(e.close) && e.close > 0) out.push(e);
        }
        return out;
    }

    function sortDedupeSeries(series) {
        var byTs = {};
        for (var i = 0; i < series.length; i++) byTs[series[i].time] = series[i];
        var keys = Object.keys(byTs).map(Number).sort(function(a, b) { return a - b; });
        var out = [];
        for (var k = 0; k < keys.length; k++) {
            var e = byTs[keys[k]];
            if (e && isFinite(e.close) && e.close > 0) out.push(e);
        }
        return out;
    }

    function filterByDays(prices, days) {
        if (days === 'max') return prices;
        var cutoff = (Date.now() / 1000) - (days * DAY_SECONDS);
        return prices.filter(function(p) { return p.time >= cutoff; });
    }

    // ===== INTRADAY DETAIL =====
    // Daily candles gave the 7-day view exactly 7 points, which smoothed away all real price
    // action. Each range picks a granularity yielding a few hundred points, matching the
    // density of an exchange chart. 365D/MAX stay on the cached daily series.
    var RANGE_GRANULARITY = {
        '7':   900,     // 15 min -> ~672 points (3 requests)
        '30':  3600,    // 1 hour -> ~720 points (3 requests)
        '90':  21600,   // 6 hour -> ~360 points (2 requests)
        '180': 21600,   // 6 hour -> ~720 points (3 requests)
        '365': DAY_SECONDS,
        'max': DAY_SECONDS
    };
    var INTRADAY_TTL_MS = 5 * 60 * 1000;
    var _intradayCache = {};

    // Returns the point series to plot for a range. `dailyAll` is the full cached daily
    // series; on any intraday failure we fall back to it so the chart degrades rather than
    // blanking.
    async function getSeriesForRange(days, dailyAll) {
        var key = String(days);
        var gran = RANGE_GRANULARITY[key] || DAY_SECONDS;
        var daily = filterByDays(dailyAll || [], days);
        if (gran === DAY_SECONDS) return daily;

        var cached = _intradayCache[key];
        if (cached && (Date.now() - cached.fetched) < INTRADAY_TTL_MS) return cached.series;

        try {
            var from = Math.floor(Date.now() / 1000) - (days * DAY_SECONDS);
            var series = sortDedupeSeries(await fetchCoinbaseRange(from, null, gran));
            if (series.length === 0) return daily;
            _intradayCache[key] = { series: series, fetched: Date.now() };
            return series;
        } catch (e) {
            return daily;
        }
    }

    // ===== MAIN ENTRY =====

    // Set when the last fetch could not reach the network and fell back to a cached series,
    // so a caller's status line can say so instead of claiming the data is live.
    var _priceDataStale = false;

    // onProgress(pageNumber) is called only during a cold-start backfill, so a page can show
    // progress without this module knowing anything about the DOM.
    async function fetchPriceHistory(onProgress) {
        var cached = loadPriceCache();
        try {
            // Cold start backfills ~11 years (~15 requests); afterwards only the tail.
            var from = (cached && cached.length) ? cached[cached.length - 1].time : COINBASE_HISTORY_START;
            var coldStart = !(cached && cached.length);
            var fresh = await fetchCoinbaseRange(from, function(page) {
                if (coldStart && typeof onProgress === 'function') onProgress(page);
            });
            var merged = mergePriceSeries(cached || [], fresh);
            if (merged.length === 0) throw new Error('no candles returned');
            savePriceCache(merged);
            _priceDataStale = false;
            return merged;
        } catch (e) {
            if (cached && cached.length) {
                _priceDataStale = true;                  // a stale cache beats an empty chart
                return cached;
            }
            _priceDataStale = false;                     // CoinGecko path is live, just shorter
            return await fetchCoinGeckoYear();
        }
    }

    return {
        DAY_SECONDS: DAY_SECONDS,
        RANGE_GRANULARITY: RANGE_GRANULARITY,
        HALVING_DATES: HALVING_DATES,
        getBlockReward: getBlockReward,
        fetchPriceHistory: fetchPriceHistory,
        getSeriesForRange: getSeriesForRange,
        filterByDays: filterByDays,
        isStale: function() { return _priceDataStale; }
    };
})();
