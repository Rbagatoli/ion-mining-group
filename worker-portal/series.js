// Daily history for a hosting site — the thing behind GET /portal/hosting/series.
//
// WHY THIS FILE EXISTS AT ALL. The hosting portal could show a client what their machines are
// doing *now* (rigs:SITE, a snapshot) and what they were billed *last month* (hst:, a frozen
// statement), and nothing in between. There was no answer to "is my fleet getting better or
// worse", which is the question a client actually has.
//
// TWO SOURCES, DELIBERATELY NOT ONE.
//
//   hashrate, uptime, workers, btc   <- the CLIENT'S pool account, read-only
//   kwh                              <- PROTON'S meter at the cage
//
// They are independent, and keeping them independent is the point. Efficiency is the ratio of one
// to the other, so it is a real cross-check rather than a number derived from itself: if Proton's
// meter and the client's pool disagree about how a month went, the efficiency line is where it
// shows up. A single-source version of this chart could not be wrong in any visible way, which is
// another way of saying it could not be right either.
//
// Proton does NOT hold the client's BTC and does not compute it. It is read from their pool with a
// read-only key that they supply, and it is reported back to them as their own figure. The
// distinction matters: portal/index.html already refuses to state "est. daily earnings" because a
// hosting client's payouts go pool-to-wallet and Proton has no business asserting them. Reading a
// number out of the client's own account and showing it back is not the same act as estimating it.
//
// NULL IS NOT ZERO, everywhere in this file. A day nobody heard from the pool has null hashrate,
// not 0 — an unreported machine is not a stopped machine, and a chart that draws it at the axis
// is telling the client their fleet died. Every metric here can be null and every consumer has to
// handle it. This is the same rule ledger.js applies to gas and portal-demo.js applies to rigs.

(function () {
    'use strict';

    var MS_DAY = 86400000;

    /* A request cannot ask for unbounded history. KV list costs scale with the range and a chart
       cannot render 10 years of daily points usefully anyway. 400 days covers "last 12 months"
       plus the slack to compare against the same month last year. */
    var MAX_DAYS = 400;

    // ---- dates -------------------------------------------------------------------------------
    //
    // Everything is keyed and bucketed on UTC calendar days. Not the client's local day, and not
    // the site's local day: a statement period is already UTC, and a chart whose buckets disagree
    // with the invoice's buckets is a support ticket every month.

    function dayOf(ms) { return new Date(ms).toISOString().slice(0, 10); }

    function parseDay(s) {
        if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
        var ms = Date.parse(s + 'T00:00:00Z');
        if (!isFinite(ms)) return null;
        /* Date.parse accepts 2026-02-31 and silently rolls it to March. A rolled date would
           produce a range the caller did not ask for, so it is rejected rather than corrected. */
        if (dayOf(ms) !== s) return null;
        return ms;
    }

    /* The inclusive list of UTC days in [from, to]. Returns [] rather than throwing for a
       backwards or over-long range; the caller decides whether that is a 400 or an empty chart. */
    function daysBetween(from, to) {
        var a = parseDay(from), b = parseDay(to);
        if (a === null || b === null || b < a) return [];
        if ((b - a) / MS_DAY + 1 > MAX_DAYS) return [];
        var out = [];
        for (var t = a; t <= b; t += MS_DAY) out.push(dayOf(t));
        return out;
    }

    // ---- the derived metric ------------------------------------------------------------------

    /* Efficiency in joules per terahash — watts divided by terahashes per second.
     *
     *     J/TH = W / (TH/s)          and       W = kWh * 1000 / hours
     *
     * HOURS, NOT 24. A day the meter only covered for 18 hours has 18 hours of energy in it, and
     * dividing by 24 would report the fleet as a third more efficient than it is. The coverage
     * figure is already tracked for exactly this reason on the statement side.
     *
     * Returns null unless every input is a real number and the divisors are non-zero. A
     * fleet at zero hashrate has undefined efficiency, not infinite efficiency.
     */
    function efficiency(kwh, hoursCovered, hashrateTh) {
        if (!isNum(kwh) || !isNum(hoursCovered) || !isNum(hashrateTh)) return null;
        if (hoursCovered <= 0 || hashrateTh <= 0 || kwh < 0) return null;
        var watts = kwh * 1000 / hoursCovered;
        return round(watts / hashrateTh, 2);
    }

    function isNum(v) { return typeof v === 'number' && isFinite(v); }
    function round(v, dp) { var m = Math.pow(10, dp); return Math.round(v * m) / m; }

    /* Mean of the values that exist. Returns null for an empty set rather than 0 or NaN, and
       reports how many contributed so a caller can tell "quiet day" from "full day". */
    function meanOf(values) {
        var sum = 0, n = 0;
        for (var i = 0; i < values.length; i++) {
            if (isNum(values[i])) { sum += values[i]; n++; }
        }
        return n ? { mean: sum / n, n: n } : { mean: null, n: 0 };
    }

    // ---- the pool rollup ---------------------------------------------------------------------

    /* One day of pool samples reduced to one point.
     *
     * A sample is whatever the scheduled pull wrote:
     *     { at, workers: [{ worker, hashrate_th, reported }], btc }
     *
     * `btc` on a sample is CUMULATIVE-TO-DATE as most pools report it, so the day's production is
     * a DIFFERENCE, not a sum — summing would multiply a day's earnings by the number of times we
     * happened to poll. That bug does not look like a bug on a chart; it looks like a good month.
     */
    function rollupDay(samples) {
        if (!samples || !samples.length) {
            return { hashrate_th: null, uptime_pct: null, workers_reporting: null,
                     workers_total: null, btc: null, samples: 0 };
        }
        var ordered = samples.slice().sort(function (a, b) {
            return Date.parse(a.at || 0) - Date.parse(b.at || 0);
        });

        var hashes = [], reportingCounts = [], totals = [];
        for (var i = 0; i < ordered.length; i++) {
            var ws = ordered[i].workers || [];
            var sum = 0, seen = 0, reporting = 0;
            for (var j = 0; j < ws.length; j++) {
                if (ws[j].reported) {
                    reporting++;
                    if (isNum(ws[j].hashrate_th)) { sum += ws[j].hashrate_th; seen++; }
                }
            }
            /* A sample where the pool answered but no worker reported is a real zero-reporting
               sample, and it must count toward uptime. A sample with no workers ARRAY at all is
               a pull that failed, and it must not. */
            if (!ws.length) continue;
            totals.push(ws.length);
            reportingCounts.push(reporting);
            if (seen) hashes.push(sum);
        }

        var h = meanOf(hashes);
        var rep = meanOf(reportingCounts);
        var tot = meanOf(totals);

        /* Uptime is the share of machine-samples that reported, across the day. Not "was the site
           up", which is always yes, and not a per-machine figure, which is on the rig cards. */
        var uptime = (rep.mean !== null && tot.mean) ? round(rep.mean / tot.mean * 100, 2) : null;

        return {
            hashrate_th: h.mean === null ? null : round(h.mean, 2),
            uptime_pct: uptime,
            workers_reporting: rep.mean === null ? null : Math.round(rep.mean),
            workers_total: tot.mean === null ? null : Math.round(tot.mean),
            btc: btcForDay(ordered),
            samples: ordered.length
        };
    }

    /* The day's BTC, as the movement in a cumulative counter.
     *
     * Needs the first and last sample of the day and a counter that only goes up. A counter that
     * went DOWN means the pool reset it, the account changed, or we are looking at two different
     * accounts' data — every one of which makes the difference meaningless, so it returns null
     * rather than a negative or a clamped zero. */
    function btcForDay(ordered) {
        var first = null, last = null;
        for (var i = 0; i < ordered.length; i++) {
            if (!isNum(ordered[i].btc_cumulative)) continue;
            if (first === null) first = ordered[i].btc_cumulative;
            last = ordered[i].btc_cumulative;
        }
        if (first === null || last === null) return null;
        var d = last - first;
        if (d < 0) return null;
        return round(d, 8);
    }

    // ---- the join ----------------------------------------------------------------------------

    /* Build the series the endpoint returns.
     *
     *   days     the UTC day strings to emit, in order, from daysBetween()
     *   pool     { 'YYYY-MM-DD': <rollupDay result> }   may be missing any day
     *   energy   { 'YYYY-MM-DD': { kwh, hours_covered } } may be missing any day
     *
     * EVERY DAY IN RANGE IS EMITTED, including days with nothing in them. A chart that silently
     * drops empty days draws a continuous line across an outage and compresses the x-axis, which
     * makes a gap look like normal operation. The gap has to be visible as a gap.
     */
    function build(days, pool, energy) {
        var out = [];
        for (var i = 0; i < days.length; i++) {
            var d = days[i];
            var p = (pool && pool[d]) || null;
            var e = (energy && energy[d]) || null;

            var hashrate = p ? p.hashrate_th : null;
            var kwh = e && isNum(e.kwh) ? round(e.kwh, 3) : null;
            var hours = e && isNum(e.hours_covered) ? e.hours_covered : null;

            out.push({
                date: d,
                hashrate_th: hashrate,
                uptime_pct: p ? p.uptime_pct : null,
                workers_reporting: p ? p.workers_reporting : null,
                workers_total: p ? p.workers_total : null,
                btc: p ? p.btc : null,
                kwh: kwh,
                hours_covered: hours,
                efficiency_j_th: efficiency(kwh, hours, hashrate)
            });
        }
        return out;
    }

    /* ---- more than one facility ----

       A hosting client can have machines at two sites, and from this year they can buy a second
       batch for a different one from the catalogue without talking to anybody. So a fleet is a
       set of sites, and the combined view has to add them up correctly.

       SUMS ARE EASY; RATIOS ARE THE TRAP. Uptime and efficiency are ratios, and the average of
       two ratios is not the ratio of the totals. A 100-machine site at 99% and a 4-machine site
       at 50% is 98.1% of machines reporting, not 74.5% — averaging the percentages weights a
       rounding-error site the same as the whole fleet. Both are recomputed from the underlying
       quantities here rather than averaged.

       EFFICIENCY IS SUMMED AS POWER, NOT AS J/TH. Each site's average watts is its own energy
       over its OWN coverage hours, which differ; adding watts and dividing by total hashrate is
       right, and averaging the two J/TH figures is not.

       A day where one site reported and the other did not produces a combined figure describing
       only the site that answered, so every point carries how many of the fleet's sites are in
       it. A total that quietly means "two of your three sites" is worse than no total. */
    function combine(bySite) {
        var ids = Object.keys(bySite || {});
        if (!ids.length) return [];

        /* Every day any site has, in order. Sites can start on different dates — a second
           facility bought later has no history before it existed — and dropping days that are
           not common to all of them would silently shorten the chart to the newest site. */
        var days = {};
        ids.forEach(function (id) {
            (bySite[id] || []).forEach(function (p) { days[p.date] = true; });
        });

        return Object.keys(days).sort().map(function (date) {
            var hashrate = 0, hashSeen = false;
            var kwh = 0, kwhSeen = false;
            var watts = 0, wattsSeen = false;
            var btc = 0, btcSeen = false;
            var rep = 0, tot = 0, repSeen = false;
            var present = 0;

            ids.forEach(function (id) {
                var p = (bySite[id] || []).filter(function (x) { return x.date === date; })[0];
                if (!p) return;
                /* PRESENT MEANS CONTRIBUTED, NOT "HAS A ROW". build() emits every day in the
                   requested range for every site, so a facility that did not exist yet still has
                   a row here — all nulls. Counting rows reported "2 of 2 sites" for a day when
                   one of them had not been built, which is the opposite of what this field is
                   for. */
                if (isNum(p.hashrate_th) || isNum(p.kwh) || isNum(p.btc) ||
                    isNum(p.workers_total)) present++;
                if (isNum(p.hashrate_th)) { hashrate += p.hashrate_th; hashSeen = true; }
                if (isNum(p.btc)) { btc += p.btc; btcSeen = true; }
                if (isNum(p.kwh)) {
                    kwh += p.kwh; kwhSeen = true;
                    if (isNum(p.hours_covered) && p.hours_covered > 0) {
                        watts += p.kwh * 1000 / p.hours_covered;
                        wattsSeen = true;
                    }
                }
                if (isNum(p.workers_reporting) && isNum(p.workers_total)) {
                    rep += p.workers_reporting; tot += p.workers_total; repSeen = true;
                }
            });

            return {
                date: date,
                hashrate_th: hashSeen ? round(hashrate, 2) : null,
                /* The ratio of the totals, not the mean of the ratios. */
                uptime_pct: (repSeen && tot > 0) ? round(rep / tot * 100, 2) : null,
                workers_reporting: repSeen ? rep : null,
                workers_total: repSeen ? tot : null,
                btc: btcSeen ? round(btc, 8) : null,
                kwh: kwhSeen ? round(kwh, 3) : null,
                /* Not meaningful across sites with different coverage, and not needed: the
                   efficiency below is built from watts, which already accounts for it. */
                hours_covered: null,
                efficiency_j_th: (wattsSeen && hashSeen && hashrate > 0)
                    ? round(watts / hashrate, 2) : null,
                sites_reporting: present,
                sites_total: ids.length
            };
        });
    }

    /* ---- the producer side ----

       The same daily history, for a gas site. It is a simpler build than the hosting one because
       there is only ONE source: Proton's own meter. No pool, no second party, nothing to reconcile
       — which is why a producer's chart can show a figure the hosting chart cannot, namely the
       money, without asserting anything about somebody else's account.

       COVERAGE IS THE HEADLINE, not a footnote. A producer is paid for metered gas, so an hour
       the meter did not see is an hour nobody pays for. It is this portal's uptime and it is
       carried as a first-class series for the same reason the hosting one carries uptime.

       Every metric is null when unknown, never zero. A day with no reading is not a day the
       site produced nothing — that distinction is the whole of ledger.js. */
    var HOURS_IN_DAY = 24;

    function buildGas(days, gas) {
        var out = [];
        for (var i = 0; i < days.length; i++) {
            var d = days[i];
            var g = (gas && gas[d]) || null;

            var covered = g && isNum(g.hours_covered) ? g.hours_covered : null;
            var mcf = g && isNum(g.mcf) ? round(g.mcf, 3) : null;
            var mmbtu = g && isNum(g.mmbtu) ? round(g.mmbtu, 3) : null;

            /* Heating value is a property of the gas, not a quantity of it, so it is carried as
               reported rather than derived from the two above — deriving it would turn a day
               with a metering fault into a plausible-looking Btu figure. */
            var btu = g && isNum(g.btu_scf) ? g.btu_scf : null;

            out.push({
                date: d,
                mcf: mcf,
                mmbtu: mmbtu,
                btu_scf: btu,
                hours_covered: covered,
                coverage_pct: covered === null ? null
                    : round(Math.min(covered, HOURS_IN_DAY) / HOURS_IN_DAY * 100, 2),
                /* What the day is worth at the contract rate. Present only when the site has
                   been told a rate — a volume with no price is a volume, not an amount. */
                usd: g && isNum(g.usd) ? round(g.usd, 2) : null
            });
        }
        return out;
    }

    /* Provenance for a gas series. One source, so one count, but the shape matches sourcesOf()
       above so the page can render either without knowing which portal it is on. */
    function gasSourcesOf(points) {
        var meter = 0, priced = 0;
        for (var i = 0; i < points.length; i++) {
            if (points[i].mcf !== null) meter++;
            if (points[i].usd !== null) priced++;
        }
        return { days: points.length, meter_days: meter, priced_days: priced };
    }

    /* What the client is told about where each column came from. Shown on the page, because a
       chart mixing Proton's meter with the client's pool should say which line is whose. */
    function sourcesOf(points) {
        var poolDays = 0, meterDays = 0, btcDays = 0;
        for (var i = 0; i < points.length; i++) {
            if (points[i].hashrate_th !== null) poolDays++;
            if (points[i].kwh !== null) meterDays++;
            if (points[i].btc !== null) btcDays++;
        }
        return {
            days: points.length,
            pool_days: poolDays,
            meter_days: meterDays,
            btc_days: btcDays
        };
    }

    var api = {
        MAX_DAYS: MAX_DAYS,
        dayOf: dayOf,
        parseDay: parseDay,
        daysBetween: daysBetween,
        efficiency: efficiency,
        rollupDay: rollupDay,
        btcForDay: btcForDay,
        build: build,
        buildGas: buildGas,
        gasSourcesOf: gasSourcesOf,
        combine: combine,
        sourcesOf: sourcesOf
    };

    // Set on BOTH module.exports and the global, unconditionally — the same dual-mode wrapper
    // ledger.js uses, and for the same reason: an either/or wrapper takes the module.exports
    // branch under Node and leaves the global undefined, which breaks the Worker.
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof globalThis !== 'undefined') globalThis.PortalSeries = api;
})();
