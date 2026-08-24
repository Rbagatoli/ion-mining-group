// ===== PROTON MINING — Candidate Scoring =====
// A weighted registry of independent criteria. Adding "score by fiber distance" later is one
// register() call — never an edit to site-engine.js.
//
// Two rules the whole thing rests on:
//
//  1. A criterion returns null when it cannot judge. Nulls are DROPPED from the weighted
//     average and the lost weight is reported as `coverage`, rather than being scored as zero.
//     Scoring absent data as zero silently punishes sites for gaps in our own dataset.
//  2. Persistence outweighs volume. A very bright flare may be a two-week well test; a modest
//     one burning 340 nights a year is a business. The spec is explicit that default sort is
//     persistence, and the weights encode that.

var SiteScoring = (function() {

    var _criteria = [];

    // criterion: { id, label, weight, score(candidate, ctx) -> 0..1 | null }
    function register(criterion) {
        if (!criterion || !criterion.id || typeof criterion.score !== 'function') {
            throw new Error('SiteScoring.register requires { id, score }');
        }
        _criteria = _criteria.filter(function(c) { return c.id !== criterion.id; });
        _criteria.push({
            id: criterion.id,
            label: criterion.label || criterion.id,
            weight: (typeof criterion.weight === 'number' && isFinite(criterion.weight) && criterion.weight >= 0)
                ? criterion.weight : 1,
            score: criterion.score
        });
        return criterion.id;
    }

    function unregister(id) {
        var before = _criteria.length;
        _criteria = _criteria.filter(function(c) { return c.id !== id; });
        return _criteria.length !== before;
    }

    function list() {
        return _criteria.map(function(c) { return { id: c.id, label: c.label, weight: c.weight }; });
    }

    function clamp01(v) {
        if (v === null || v === undefined || !isFinite(v)) return null;
        return Math.min(1, Math.max(0, v));
    }

    // Returns { score, coverage, breakdown[] }.
    //   score    — 0..1 weighted mean over criteria that returned a value, or null if none did
    //   coverage — share of total registered weight that actually had data. A 0.95 score at
    //              0.2 coverage is one criterion's opinion, not a verdict, and the UI must be
    //              able to say so.
    function score(candidate, ctx) {
        ctx = ctx || {};
        var breakdown = [];
        var weighted = 0, usedWeight = 0, totalWeight = 0;

        for (var i = 0; i < _criteria.length; i++) {
            var c = _criteria[i];
            totalWeight += c.weight;
            var v;
            try {
                v = clamp01(c.score(candidate, ctx));
            } catch (e) {
                v = null;
            }
            breakdown.push({ id: c.id, label: c.label, weight: c.weight, value: v });
            if (v === null) continue;
            weighted += v * c.weight;
            usedWeight += c.weight;
        }

        return {
            score: usedWeight > 0 ? weighted / usedWeight : null,
            coverage: totalWeight > 0 ? usedWeight / totalWeight : 0,
            breakdown: breakdown
        };
    }

    // Sorts candidates best-first. Default is persistence, per the spec — pass sortBy:'score'
    // for the blended ranking, or any criterion id to sort on that dimension alone.
    // Unscoreable candidates sort last rather than being dropped, so nothing vanishes silently.
    function rank(candidates, ctx, sortBy) {
        sortBy = sortBy || 'persistence';
        var scored = (candidates || []).map(function(cand) {
            var s = score(cand, ctx);
            var key;
            if (sortBy === 'score') {
                key = s.score;
            } else {
                key = null;
                for (var i = 0; i < s.breakdown.length; i++) {
                    if (s.breakdown[i].id === sortBy) { key = s.breakdown[i].value; break; }
                }
            }
            return { candidate: cand, score: s.score, coverage: s.coverage, breakdown: s.breakdown, sortKey: key };
        });
        scored.sort(function(a, b) {
            if (a.sortKey === null && b.sortKey === null) return 0;
            if (a.sortKey === null) return 1;
            if (b.sortKey === null) return -1;
            if (b.sortKey !== a.sortKey) return b.sortKey - a.sortKey;
            // Tie-break on volume, the spec's secondary sort.
            var av = a.candidate.powerPotentialKw, bv = b.candidate.powerPotentialKw;
            return (bv === null || bv === undefined ? -1 : bv) - (av === null || av === undefined ? -1 : av);
        });
        return scored;
    }

    // ================================================================================
    // Shipped criteria
    // ================================================================================

    // Persistence — the single most predictive field, and therefore the heaviest.
    //
    // Measured as YEARS SEEN, not the satellite's published detection frequency. That choice is
    // load-bearing and was made from the data: detection frequency is overwhelmingly a function
    // of flare SIZE, not of how consistently it burns. In the built catalog, onshore sites over
    // 2,000 kW average 51% detection frequency while those under 500 kW average 5.6% — a 9x gap
    // that is about VIIRS's detection limit, not about the flare going out. A small flare that
    // burns every night still registers on only a fraction of overpasses.
    //
    // Ranking on raw frequency would therefore rank by size and bury exactly the small,
    // persistent flares this tool exists to find. Presence across N annual catalogs is
    // size-independent: a site in all six years is a business, whatever its brightness.
    register({
        id: 'persistence',
        label: 'Persistence',
        weight: 3,
        score: function(c) {
            if (c.yearsSeen !== null && c.yearsSeen !== undefined &&
                c.yearsTotal !== null && c.yearsTotal !== undefined && c.yearsTotal > 0) {
                return c.yearsSeen / c.yearsTotal;
            }
            // Fall back to published frequency only when multi-year coverage is unavailable.
            if (c.persistencePct === null || c.persistencePct === undefined) return null;
            return c.persistencePct / 100;
        }
    });

    // The satellite's own detection frequency, kept as a separate low-weight signal rather than
    // discarded. It is genuinely informative about how visible a flare is — just not about how
    // persistent it is, which is why it does not drive the ranking.
    register({
        id: 'detection_frequency',
        label: 'Detection frequency',
        weight: 1,
        score: function(c) {
            if (c.persistencePct === null || c.persistencePct === undefined) return null;
            return c.persistencePct / 100;
        }
    });

    // Power potential, on a log scale. Linear scaling would let one 140 MW refinery flare
    // compress every site Proton can actually use into the bottom of the range — and the target
    // here is deliberately the small, persistent flares nobody else bothers with.
    // 30 kW scores ~0, 10 MW scores 1.
    register({
        id: 'power_potential',
        label: 'Power potential',
        weight: 2,
        score: function(c) {
            var kw = c.powerPotentialKw;
            if (kw === null || kw === undefined || kw <= 0) return null;
            var lo = Math.log(30), hi = Math.log(10000);
            return (Math.log(kw) - lo) / (hi - lo);
        }
    });

    // Offshore is disqualifying, not merely worse: Canada's two highest-volume flares are oil
    // platforms on the Grand Banks. Unscored, they outrank every site on land.
    // Returns null when undetermined — the source adapter sets this, and a guess would be worse
    // than an admission of ignorance.
    register({
        id: 'access',
        label: 'Onshore access',
        weight: 3,
        score: function(c) {
            if (c.offshore === true) return 0;
            if (c.offshore === false) return 1;
            return null;
        }
    });

    // Where you can actually build.
    register({
        id: 'jurisdiction',
        label: 'Jurisdiction',
        weight: 3,
        score: function(c, ctx) {
            var lookup = ctx.jurisdictions ||
                (typeof Jurisdictions !== 'undefined' ? Jurisdictions : null);
            if (!lookup) return null;
            var code = c.iso3 || c.country;
            if (!code) return null;
            var j = lookup.get(code);
            if (!j || !j.known) return null;
            return j.tierScore;
        }
    });

    // Recently confirmed still burning.
    //
    // Returns null — not zero — when there is no confirmation. Absence of a satellite detection
    // is not evidence the flare went out: it may have been clouded over, or sit below the
    // detection floor, or the liveness artifact may simply never have been built. Scoring an
    // unconfirmed site as zero would quietly bury every site in the catalog the moment the file
    // is missing, which is its default state.
    register({
        id: 'recency',
        label: 'Confirmed burning',
        weight: 2,
        score: function(c) {
            if (c.daysSinceActive === null || c.daysSinceActive === undefined) return null;
            // Full marks inside a month, tapering to zero at a year.
            if (c.daysSinceActive <= 30) return 1;
            if (c.daysSinceActive >= 365) return 0;
            return 1 - (c.daysSinceActive - 30) / (365 - 30);
        }
    });

    // Direction of travel. A flare being actively eliminated is a shrinking opportunity even if
    // it is large today; one that is growing is a producer with a worsening problem to solve.
    register({
        id: 'trend',
        label: 'Volume trend',
        weight: 1,
        score: function(c) {
            if (c.trend === 'rising') return 1;
            if (c.trend === 'flat') return 0.6;
            if (c.trend === 'declining') return 0.2;
            return null;
        }
    });

    var BUILT_IN_IDS = _criteria.map(function(c) { return c.id; });

    return {
        register: register,
        unregister: unregister,
        list: list,
        score: score,
        rank: rank,
        BUILT_IN_IDS: BUILT_IN_IDS
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SiteScoring;
