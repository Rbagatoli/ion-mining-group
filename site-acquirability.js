// Acquirability — the second axis, independent of opportunity.
//
// Opportunity asks "is this energy worth mining against?". This asks "could I actually get it?".
// They are deliberately NOT blended, because a single number buries the only case that matters:
//
//     2 MW plant, 20-year PPA, content owner    high opportunity, near-zero acquirability
//     bankrupt site, permits expired            low opportunity, high acquirability
//     2 MW plant, output down 60%, UCC filed    HIGH BOTH  <- the target
//
// Two things here differ from a naive reading of the brief, because the naive version does not
// do what the brief asks:
//
//   1. COMPOUNDING. Signals must compound so that three moderate signals beat one strong one.
//      Plain noisy-OR cannot do this — it is sub-additive. With the given weights,
//      permit-lapsed(50) + violations(45) + ownership-change(30) reaches only 80.8 and LOSES to
//      a single UCC filing at 85. Worse, bankruptcy at weight 100 maps to p = 1.0, an absorbing
//      state: every bankrupt site pins at exactly 100 forever, immune to decay and unrankable
//      against every other bankrupt site. Both are fixed by treating weights as EVIDENCE that
//      sums, then saturating once — see acquirabilityFrom().
//
//   2. A NON-ZERO BASELINE. Having no distress signal is the normal, healthy state. If
//      acquirability came only from distress, almost every facility would score 0, and ranking
//      on opportunity x acquirability would zero out the entire catalog. So contract and permit
//      STATE contribute evidence too: a merchant plant with no offtake agreement is structurally
//      more available than one twenty years into a PPA, with no distress involved at all.
var SiteAcquirability = (function() {
    'use strict';

    // Distress signals, 0-100. A weight is "how much this one fact tells me the asset is
    // gettable", not a probability.
    var DEFAULT_SIGNALS = {
        bankruptcy:                   100,
        ucc_foreclosure:               85,
        lmop_shutdown:                 80,
        capacity_factor_decline:       75,
        offtake_expiring_lt_18mo:      70,
        eia860_standby_or_retirement:  70,
        listed_for_sale:               60,
        permit_lapsed:                 50,
        compliance_violations:         45,
        ownership_change_lt_24mo:      30
    };

    // How fast each signal stops being evidence, in years. Split deliberately between EVENTS,
    // which age (a bankruptcy resolves), and ONGOING CONDITIONS, which do not — for those the
    // half-life models confidence that the record is still current, not that the fact expired,
    // which is why they are long.
    var DEFAULT_HALF_LIVES = {
        bankruptcy:                    3,    // Ch.11 resolves in 1-3 years; then it is off the table
        ucc_foreclosure:               3,
        lmop_shutdown:                 4,    // a shut landfill stays shut
        capacity_factor_decline:       2,    // an operating measurement, goes stale fast
        offtake_expiring_lt_18mo:      1.5,  // a countdown: once past, it is no longer expiring
        eia860_standby_or_retirement:  2,    // plans are revised annually
        listed_for_sale:               1,    // a listing sells or is withdrawn quickly
        permit_lapsed:                 5,    // stays lapsed until the site is reclaimed
        compliance_violations:         2,
        ownership_change_lt_24mo:      2
    };

    // ---- Structural baseline ------------------------------------------------------------
    // Expressed in the same 0-100 evidence units as a distress signal, so there is ONE formula
    // and no special-casing. What usually makes a good asset unbuyable is a contract, not trouble.
    var OFFTAKE_EVIDENCE = {
        expired:            60,   // had a contract, it ran out, nothing replaced it
        none_merchant:      55,   // sells spot; can redirect load without breaking anything
        short_lt_3yr:       40,   // a real conversation window
        medium_3_to_10yr:   20,
        long_gt_10yr:        6,   // a buyout is possible, and expensive
        regulated_ratebase:  3,   // utility rate-based: not for sale in any normal sense
        unknown:          null    // unscored, NOT zero
    };

    // Deliberately has no 'lapsed' entry. A lapsed permit is a distress SIGNAL with weight 50;
    // giving it a row here too would count one fact twice.
    var PERMIT_EVIDENCE = {
        in_renewal:        30,    // a decision point — a marginal operator may simply not renew
        none_required:     25,    // raw gas: a gas purchase agreement, not an asset purchase
        active:            10,
        active_long_dated:  4,    // permitted into the 2050s and running: settled
        unknown:         null
    };

    var DEFAULT_SETTINGS = {
        // Evidence at which the score reaches 50. Lower = signals saturate sooner.
        halfEvidence: 0.6,
        // Weight-to-evidence compression. This is the piece that makes the brief's compounding
        // requirement satisfiable and stops weight 100 from being absorbing.
        compression: 60,
        // Signals with no date are counted as current, and say so, rather than being discarded.
        undatedDecay: 1,
        // Below this decay a signal is reported as too old to count, rather than vanishing —
        // rejects are shown, not swallowed.
        expiredBelow: 0.05
    };

    var _signals = null, _halfLives = null, _settings = null;

    function signals() {
        if (!_signals) { _signals = {}; for (var k in DEFAULT_SIGNALS) _signals[k] = DEFAULT_SIGNALS[k]; }
        return _signals;
    }
    function halfLives() {
        if (!_halfLives) { _halfLives = {}; for (var k in DEFAULT_HALF_LIVES) _halfLives[k] = DEFAULT_HALF_LIVES[k]; }
        return _halfLives;
    }
    function settings() {
        if (!_settings) { _settings = {}; for (var k in DEFAULT_SETTINGS) _settings[k] = DEFAULT_SETTINGS[k]; }
        return _settings;
    }
    function setSignalWeight(type, value) {
        var n = Number(value);
        if (!isFinite(n) || n < 0 || n > 100) return false;
        if (!has(DEFAULT_SIGNALS, type)) return false;
        signals()[type] = n;
        return true;
    }
    function setHalfLife(type, years) {
        var n = Number(years);
        if (!isFinite(n) || n <= 0) return false;
        if (!has(DEFAULT_HALF_LIVES, type)) return false;
        halfLives()[type] = n;
        return true;
    }
    function setSetting(key, value) {
        if (!has(DEFAULT_SETTINGS, key)) return false;
        var n = Number(value);
        if (!isFinite(n) || n <= 0) return false;
        settings()[key] = n;
        return true;
    }
    function reset() { _signals = null; _halfLives = null; _settings = null; }

    // hasOwnProperty everywhere. A signal type of 'toString' would otherwise resolve up
    // Object.prototype to a function and poison the arithmetic — the same class of bug that
    // NaN'd the opportunity score through counterpartyType.
    function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

    function num(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = Number(v);
        return isFinite(n) ? n : null;
    }

    // ---- The curve ----------------------------------------------------------------------
    // A = 100 * (1 - 2^(-E/H)) where E is summed evidence.
    //
    // This IS noisy-OR: 1 - prod(1 - p_i) with p_i = 1 - 2^(-e_i/H) collapses to this closed
    // form, because prod(2^(-e_i/H)) = 2^(-sum(e_i)/H). The closed form is used because it is one
    // pass, cannot underflow, and makes the compounding property self-evident — A is strictly
    // increasing in E, and E only grows when a signal is added. That gives a general guarantee
    // rather than a coincidence: ANY signal set with more total evidence outranks any set with
    // less, however the weight is distributed.
    function acquirabilityFrom(evidence) {
        var H = settings().halfEvidence;
        return 100 * (1 - Math.pow(2, -evidence / H));
    }

    // Weight -> evidence. Compressive, which is what makes three moderate signals beat one
    // strong one, and what stops weight 100 from being an absorbing certainty.
    function evidenceOf(weight) {
        return 1 - Math.pow(2, -weight / settings().compression);
    }

    function decayFor(type, ageYears) {
        if (ageYears === null) return settings().undatedDecay;
        var hl = halfLives()[type];
        if (!hl) return 1;
        return Math.pow(2, -Math.max(0, ageYears) / hl);
    }

    // asOf lets tests and reproducible reports pin "now" instead of reading the clock.
    function ageYears(dateStr, asOf) {
        if (!dateStr) return null;
        var t = Date.parse(dateStr);
        if (isNaN(t)) return null;
        var now = asOf ? Date.parse(asOf) : Date.now();
        if (isNaN(now)) return null;
        return (now - t) / (365.25 * 24 * 3600 * 1000);
    }

    // ---- Scoring ------------------------------------------------------------------------
    // ctx: { asOf } — everything else is read from the prospect/site record.
    function score(rec, ctx) {
        ctx = ctx || {};
        if (!rec || typeof rec !== 'object') {
            return { score: null, scoreRaw: null, evidence: 0, breakdown: [], signalCount: 0, unknownSignals: [] };
        }

        var breakdown = [], unknown = [], E = 0, counted = 0;

        // --- Structural state. Present for every facility; absent only when unrecorded.
        var offtake = rec.offtake_state || rec.offtakeState || null;
        if (offtake) {
            if (has(OFFTAKE_EVIDENCE, offtake)) {
                var ov = OFFTAKE_EVIDENCE[offtake];
                if (ov === null) {
                    breakdown.push({ type: 'offtake_state', kind: 'state', value: null, detail: 'offtake unknown — unscored' });
                } else {
                    var oe = evidenceOf(ov);
                    E += oe;
                    breakdown.push({ type: 'offtake_state', kind: 'state', value: ov, evidence: oe,
                                     detail: String(offtake).replace(/_/g, ' ') });
                }
            } else {
                unknown.push(offtake);
            }
        } else {
            breakdown.push({ type: 'offtake_state', kind: 'state', value: null, detail: 'offtake not recorded' });
        }

        var permit = rec.permit_state || rec.permitState || null;
        if (permit) {
            if (has(PERMIT_EVIDENCE, permit)) {
                var pv = PERMIT_EVIDENCE[permit];
                if (pv === null) {
                    breakdown.push({ type: 'permit_state', kind: 'state', value: null, detail: 'permit state unknown — unscored' });
                } else {
                    var pe = evidenceOf(pv);
                    E += pe;
                    breakdown.push({ type: 'permit_state', kind: 'state', value: pv, evidence: pe,
                                     detail: String(permit).replace(/_/g, ' ') });
                }
            } else {
                unknown.push(permit);
            }
        } else {
            breakdown.push({ type: 'permit_state', kind: 'state', value: null, detail: 'permit state not recorded' });
        }

        // --- Distress signals.
        var list = rec.distress_signals || rec.distressSignals || [];
        if (!Array.isArray(list)) list = [];

        // Dedupe by type, most recent wins. Two bankruptcy filings are not twice the evidence,
        // and without this a refiling — or ten violation notices from a single inspection —
        // would compound into outranking a foreclosure.
        var newest = {};
        for (var i = 0; i < list.length; i++) {
            var s = list[i];
            if (!s || !s.type) continue;
            var ty = String(s.type).trim().toLowerCase();
            if (!has(DEFAULT_SIGNALS, ty)) { if (unknown.indexOf(ty) < 0) unknown.push(ty); continue; }
            var a = ageYears(s.date, ctx.asOf);
            var prev = newest[ty];
            // An undated signal counts as current, so it only loses to another undated one.
            if (!prev || (prev.age !== null && (a === null || a < prev.age))) {
                newest[ty] = { age: a, raw: s };
            }
        }

        // Gated on development stage, because the SAME measurement means opposite things. For an
        // operating plant a falling capacity factor is distress. For a raw flare, falling flared
        // volume means the producer SOLVED their problem — the opportunity is shrinking, which is
        // already priced on the opportunity axis via persistence and trend. The gate keys off
        // development stage, not source type, so the source-agnostic rule holds.
        var stageOrder = ['raw_resource', 'permitted', 'constructed', 'energized', 'operating'];
        var stage = null;
        if (typeof SiteOpportunity !== 'undefined' && SiteOpportunity.stageOf) stage = SiteOpportunity.stageOf(rec);
        var stageIdx = stage === null ? -1 : stageOrder.indexOf(stage);
        var constructedIdx = stageOrder.indexOf('constructed');

        for (var ty2 in newest) {
            if (!has(newest, ty2)) continue;
            var entry = newest[ty2];
            if (ty2 === 'capacity_factor_decline' && stageIdx >= 0 && stageIdx < constructedIdx) {
                breakdown.push({ type: ty2, kind: 'signal', value: null,
                                 detail: 'output decline is not distress for a ' + stage.replace(/_/g, ' ') +
                                         ' — a shrinking flare means the producer solved it' });
                continue;
            }
            var w = signals()[ty2];
            var d = decayFor(ty2, entry.age);
            var ageTxt = entry.age === null ? 'undated — counted as current'
                       : (entry.age < 1 ? Math.round(entry.age * 12) + ' months ago'
                                        : entry.age.toFixed(1) + ' years ago');
            if (d < settings().expiredBelow) {
                breakdown.push({ type: ty2, kind: 'signal', value: 0,
                                 detail: ageTxt + ' — too old to count' });
                continue;
            }
            var e = evidenceOf(w) * d;
            E += e;
            counted++;
            breakdown.push({ type: ty2, kind: 'signal', value: w, evidence: e, decay: d,
                             detail: ageTxt + (d < 0.95 ? ' (weight decayed to ' + Math.round(d * 100) + '%)' : ''),
                             source: entry.raw.source || null });
        }

        // Nothing recorded at all — not even a contract state. Null, not zero: we do not know
        // whether this asset is gettable, which is different from knowing that it is not.
        var anyScored = breakdown.some(function(b) { return b.evidence !== undefined; });
        if (!anyScored) {
            return { score: null, scoreRaw: null, evidence: 0, breakdown: breakdown,
                     signalCount: 0, unknownSignals: unknown };
        }

        var raw = acquirabilityFrom(E);
        return {
            score: Math.round(raw),
            scoreRaw: raw,
            evidence: E,
            breakdown: breakdown,
            signalCount: counted,
            unknownSignals: unknown
        };
    }

    // ---- Combining the two axes ---------------------------------------------------------
    // Geometric mean of opportunity and acquirability. Strictly monotone in their product, so
    // this ranks IDENTICALLY to opportunity x acquirability while landing on the same 0-100
    // scale as both inputs — three comparable numbers instead of one on a 0-10,000 scale.
    //
    // A zero on either axis still yields zero, so a strong score on one axis can never mask a
    // zero on the other. null propagates as null and must sort LAST, never as zero: "unknown"
    // and "confirmed unavailable" are different findings.
    function combine(opportunity, acquirability) {
        var o = num(opportunity), a = num(acquirability);
        if (o === null || a === null) return null;
        if (o < 0 || a < 0) return null;
        return Math.sqrt(o * a);
    }

    return {
        score: score,
        combine: combine,
        acquirabilityFrom: acquirabilityFrom,
        evidenceOf: evidenceOf,
        decayFor: decayFor,
        signals: signals,
        setSignalWeight: setSignalWeight,
        halfLives: halfLives,
        setHalfLife: setHalfLife,
        settings: settings,
        setSetting: setSetting,
        reset: reset,
        DEFAULT_SIGNALS: DEFAULT_SIGNALS,
        DEFAULT_HALF_LIVES: DEFAULT_HALF_LIVES,
        OFFTAKE_EVIDENCE: OFFTAKE_EVIDENCE,
        PERMIT_EVIDENCE: PERMIT_EVIDENCE
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SiteAcquirability;
