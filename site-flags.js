// ===== ION MINING GROUP — Site Red-Flag Rules =====
// A registry, not a hardcoded list. Every rule is an independent object with a `test`, so a new
// rule is one register() call and never an edit to site-engine.js. That separation is the point:
// the math and the judgement about the math evolve at different speeds.
//
// A rule returns null when it does not apply (including "the data needed to judge this is
// missing"). Silence means "not applicable", never "passed" — an absent power rate must not
// read as a good power rate.

var SiteFlags = (function() {

    var SEVERITY_ORDER = { critical: 0, warn: 1, info: 2 };

    // Deliberately NOT `SEVERITY_ORDER[sev] || 9`. 'critical' maps to 0, and 0 is falsy, so
    // that idiom silently reranks the most severe flag as the least severe — a site holding a
    // critical flag reported back as "warn". Same trap calc-engine.js:66 documents.
    function rank(sev) {
        var r = SEVERITY_ORDER[sev];
        return r === undefined ? 9 : r;
    }

    var _rules = [];

    // rule: { id, severity, label, test(input) -> null | { message, evidence } }
    // input: { site, metrics, config, market, peers, benchmark }
    //   peers     — [{ site, metrics }] for cross-site comparison (rule 5)
    //   benchmark — { powerRateUsd } regional reference, typically from Jurisdictions (rule 4)
    function register(rule) {
        if (!rule || !rule.id || typeof rule.test !== 'function') {
            throw new Error('SiteFlags.register requires { id, test }');
        }
        // Re-registering the same id replaces it, so a caller can override a shipped rule
        // without forking this file.
        _rules = _rules.filter(function(r) { return r.id !== rule.id; });
        _rules.push({
            id: rule.id,
            severity: rule.severity || 'warn',
            label: rule.label || rule.id,
            test: rule.test
        });
        return rule.id;
    }

    function unregister(id) {
        var before = _rules.length;
        _rules = _rules.filter(function(r) { return r.id !== id; });
        return _rules.length !== before;
    }

    function list() {
        return _rules.map(function(r) { return { id: r.id, severity: r.severity, label: r.label }; });
    }

    // Runs every registered rule. A rule that throws is reported as an info flag rather than
    // taking down the whole evaluation — one bad custom rule should not blind the other seven.
    function evaluate(metrics, site, ctx) {
        ctx = ctx || {};
        var input = {
            site: site || {},
            metrics: metrics || {},
            config: (metrics && metrics.config) || ctx.config || {},
            market: (metrics && metrics.market) || ctx.market || {},
            peers: ctx.peers || [],
            benchmark: ctx.benchmark || null
        };
        var out = [];
        for (var i = 0; i < _rules.length; i++) {
            var r = _rules[i];
            var res;
            try {
                res = r.test(input);
            } catch (e) {
                out.push({
                    id: r.id, severity: 'info', label: r.label,
                    message: 'Rule could not be evaluated: ' + (e && e.message ? e.message : 'error'),
                    evidence: null
                });
                continue;
            }
            if (!res) continue;
            out.push({
                id: r.id,
                severity: res.severity || r.severity,
                label: r.label,
                message: res.message,
                evidence: res.evidence === undefined ? null : res.evidence
            });
        }
        out.sort(function(a, b) { return rank(a.severity) - rank(b.severity); });
        return out;
    }

    function worstSeverity(flags) {
        var worst = null;
        for (var i = 0; i < flags.length; i++) {
            if (worst === null || rank(flags[i].severity) < rank(worst)) {
                worst = flags[i].severity;
            }
        }
        return worst;
    }

    // ---- helpers used by the shipped rules ------------------------------------------

    function n(v) {
        if (v === null || v === undefined || v === '') return null;
        var x = typeof v === 'number' ? v : parseFloat(v);
        return isFinite(x) ? x : null;
    }

    function median(arr) {
        if (!arr.length) return null;
        var s = arr.slice().sort(function(a, b) { return a - b; });
        var mid = Math.floor(s.length / 2);
        return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    }

    function pct(x) { return (x * 100).toFixed(1) + '%'; }
    function money(x) { return '$' + x.toLocaleString('en-US', { maximumFractionDigits: 0 }); }

    // ================================================================================
    // The eight shipped rules
    // ================================================================================

    // 1. Vendor claims more ASICs than the power can run.
    //
    // Fires when the claim EXCEEDS the ceiling, and also when it merely reaches it: a site sold
    // as exactly-at-capacity has no service load, no transformer derate and no ambient headroom,
    // which in practice means the number was computed on a spreadsheet and never on site.
    // The headroom band is config.headroomPct (default 10%).
    register({
        id: 'miner_count_impossible',
        severity: 'critical',
        label: 'Miner count impossible',
        test: function(i) {
            var claim = n(i.site.claimed_miners);
            var cap = i.metrics.miner_capacity_raw;
            if (claim === null || cap === null) return null;
            var headroom = n(i.config.headroomPct);
            if (headroom === null) headroom = 10;
            var band = cap * (1 - headroom / 100);
            if (claim > cap) {
                return {
                    message: 'Vendor claims ' + claim + ' miners but ' + i.metrics.max_miners +
                             ' is the ceiling (' + cap.toFixed(1) + ' at ' + i.config.minerWatts + ' W each).',
                    evidence: { claimed: claim, capacity: cap, max_miners: i.metrics.max_miners }
                };
            }
            if (claim >= band) {
                return {
                    message: 'Vendor claims ' + claim + ' miners against a ceiling of ' + cap.toFixed(1) +
                             ' — within ' + headroom + '% of nameplate, leaving no headroom for service load or derate.',
                    evidence: { claimed: claim, capacity: cap, headroom_band: band }
                };
            }
            return null;
        }
    });

    // 2. Hardware that cannot mine Bitcoin at all.
    register({
        id: 'algorithm_mismatch',
        severity: 'critical',
        label: 'Algorithm mismatch',
        test: function(i) {
            var algo = i.site.claimed_miner_algorithm;
            if (!algo) return null;
            var want = String(i.config.minerAlgorithm || 'SHA-256').toUpperCase().replace(/[\s-]/g, '');
            var got = String(algo).toUpperCase().replace(/[\s-]/g, '');
            if (got === want) return null;
            return {
                message: 'Quoted hardware runs ' + algo + ', not SHA-256 — it cannot mine Bitcoin.',
                evidence: { claimed_algorithm: algo, required: i.config.minerAlgorithm || 'SHA-256' }
            };
        }
    });

    // 3. A rate you cannot compare. At ~0.73 USD/CAD, reading a CAD quote as USD understates
    //    the power bill by roughly a third — enough to flip a site from reject to accept.
    register({
        id: 'currency_ambiguity',
        severity: 'warn',
        label: 'Currency ambiguity',
        test: function(i) {
            var rate = n(i.site.power_rate);
            var quoted = Array.isArray(i.site.quoted_rates) ? i.site.quoted_rates.map(n).filter(function(x) { return x !== null; }) : [];
            var distinct = quoted.filter(function(v, idx, a) { return a.indexOf(v) === idx; });
            if (distinct.length > 1) {
                return {
                    message: 'Site quoted at ' + distinct.length + ' different power rates (' +
                             distinct.join(', ') + ') — confirm which is binding.',
                    evidence: { quoted_rates: distinct }
                };
            }
            if (rate !== null && !i.site.power_rate_currency) {
                return {
                    message: 'Power rate of ' + rate + '/kWh has no currency attached. USD and CAD differ by ~37%.',
                    evidence: { power_rate: rate }
                };
            }
            // FX for a non-USD quote was unavailable, so nothing downstream is comparable.
            var fxMissing = (i.metrics.missing || []).filter(function(m) { return m.indexOf('fx.') === 0; });
            if (fxMissing.length) {
                return {
                    message: 'No FX rate available for ' + fxMissing.join(', ').replace('fx.', '') +
                             ' — USD figures for this site cannot be computed.',
                    evidence: { missing: fxMissing }
                };
            }
            return null;
        }
    });

    // 4. Too-good-to-be-true is a signal, not a win. A rate far under the regional market
    //    usually means a term that has not been disclosed yet.
    register({
        id: 'rate_outlier',
        severity: 'warn',
        label: 'Power rate outlier',
        test: function(i) {
            var rate = i.metrics.power_rate_usd;
            var bench = i.benchmark ? n(i.benchmark.powerRateUsd) : null;
            if (rate === null || bench === null || bench <= 0) return null;
            var delta = (rate - bench) / bench;
            if (delta > -0.40) return null;
            return {
                message: 'Power rate $' + rate.toFixed(4) + '/kWh is ' + pct(Math.abs(delta)) +
                         ' below the regional benchmark of $' + bench.toFixed(4) + '/kWh. Verify what is excluded.',
                evidence: { power_rate_usd: rate, benchmark_usd: bench, delta: delta }
            };
        }
    });

    // 5. Priced above the same vendor's other sites — the comparison they would rather you
    //    not run. Needs at least one peer from that vendor to mean anything.
    register({
        id: 'cost_per_kw_outlier',
        severity: 'warn',
        label: '$/kW outlier vs vendor',
        test: function(i) {
            var mine = i.metrics.cost_per_usable_kw;
            var vendor = i.site.vendor_name;
            if (mine === null || !vendor) return null;
            var peerVals = [];
            for (var p = 0; p < i.peers.length; p++) {
                var pe = i.peers[p];
                if (!pe || !pe.site || !pe.metrics) continue;
                if (pe.site.vendor_name !== vendor) continue;
                if (pe.site.id && i.site.id && pe.site.id === i.site.id) continue;
                var v = pe.metrics.cost_per_usable_kw;
                if (v !== null && v !== undefined) peerVals.push(v);
            }
            if (!peerVals.length) return null;
            var med = median(peerVals);
            if (med === null || med <= 0) return null;
            var delta = (mine - med) / med;
            if (delta <= 0.15) return null;
            return {
                message: '$' + mine.toFixed(2) + '/kW usable is ' + pct(delta) + ' above the median of ' +
                         peerVals.length + ' other ' + vendor + ' site' + (peerVals.length === 1 ? '' : 's') +
                         ' ($' + med.toFixed(2) + '/kW).',
                evidence: { cost_per_usable_kw: mine, vendor_median: med, peer_count: peerVals.length, delta: delta }
            };
        }
    });

    // 6. A warranty longer than the hardware's remaining economic life is a sales line.
    register({
        id: 'warranty_implausible',
        severity: 'warn',
        label: 'Warranty implausible',
        test: function(i) {
            var months = n(i.site.claimed_warranty_months);
            if (months === null) return null;
            var cap = n(i.config.maxPlausibleWarrantyMonths);
            if (cap === null) cap = 24;
            var used = i.site.hardware_condition === 'used';
            if (months <= cap) return null;
            return {
                message: 'Claimed ' + months + '-month warranty' + (used ? ' on used hardware' : '') +
                         ' exceeds the ' + cap + '-month ceiling typical for ASICs.',
                evidence: { claimed_warranty_months: months, ceiling: cap, condition: i.site.hardware_condition || null }
            };
        }
    });

    // 7. Physics claims. Beating best-in-class J/TH, or promising a large firmware uplift,
    //    are both claims that the rest of the industry has not managed.
    register({
        id: 'efficiency_claim_implausible',
        severity: 'critical',
        label: 'Efficiency claim implausible',
        test: function(i) {
            var jth = n(i.site.claimed_efficiency_j_th);
            var uplift = n(i.site.claimed_uplift_pct);
            var best = n(i.config.bestInClassJoulesPerTh);
            var maxUp = n(i.config.maxPlausibleUpliftPct);
            if (best === null) best = 13;
            if (maxUp === null) maxUp = 15;

            if (jth !== null && jth < best) {
                return {
                    message: 'Claimed ' + jth + ' J/TH is below best-in-class (' + best + ' J/TH).',
                    evidence: { claimed_j_th: jth, best_in_class: best }
                };
            }
            if (uplift !== null && uplift > maxUp) {
                return {
                    message: 'Claimed ' + uplift + '% revenue uplift from firmware exceeds the ~' + maxUp + '% ceiling.',
                    evidence: { claimed_uplift_pct: uplift, ceiling: maxUp }
                };
            }
            return null;
        }
    });

    // 8. The obligation that survives when the miners are off. This is the number that ends
    //    operations in a drawdown, so it is measured against revenue rather than in isolation.
    register({
        id: 'take_or_pay_exposure',
        severity: 'warn',
        label: 'Take-or-pay exposure',
        test: function(i) {
            var share = i.metrics.take_or_pay_share_of_revenue;
            if (share === null || share === undefined) return null;
            if (share <= 0.40) return null;
            return {
                message: 'Take-or-pay floor of ' + money(i.metrics.take_or_pay_floor) + '/mo is ' + pct(share) +
                         ' of projected revenue — owed whether or not a single miner runs.',
                evidence: {
                    take_or_pay_floor: i.metrics.take_or_pay_floor,
                    monthly_revenue: i.metrics.monthly_revenue,
                    share: share
                }
            };
        }
    });

    // Snapshot of the shipped set, so tests can prove a custom rule was added rather than
    // silently replacing one of these.
    var BUILT_IN_IDS = _rules.map(function(r) { return r.id; });

    return {
        register: register,
        unregister: unregister,
        list: list,
        evaluate: evaluate,
        worstSeverity: worstSeverity,
        BUILT_IN_IDS: BUILT_IN_IDS
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SiteFlags;
