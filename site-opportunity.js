// Unified 0-100 opportunity score.
//
// One number to rank prospects by, across every energy source. The rule that makes it work
// across sources is that no component may reference a source type: a landfill and a gas flare
// are compared on effective capacity, supply reliability and how reachable the counterparty is,
// never on being a landfill or a flare.
//
// Two things it deliberately refuses to do:
//
//   1. It never invents a value. A component with no data returns null and is DROPPED from the
//      weighted sum, which is then renormalised over the weights that actually applied. Every
//      result carries a `coverage` figure so a score built from three components is visibly
//      different from one built from seven. Substituting a neutral 50 for missing data would be
//      indistinguishable from a real measurement, which is how a sourcing tool starts lying.
//
//   2. It never compares nameplate capacity across sources. Capacity fit scores EFFECTIVE
//      capacity — nameplate x duty cycle — so a 2 MW flare that burns continuously cannot be
//      quietly outranked by a 2 MW curtailment prospect available a fifth of the year.
var SiteOpportunity = (function() {
    'use strict';

    // Weights are settings, not constants, and are normalised at use — so an EDITED set need not
    // sum to 100. The DEFAULTS below must, though: `coverage` is reported as a share of total
    // weight, so shipping defaults that sum to anything else changes what coverage means.
    var DEFAULT_WEIGHTS = {
        capacity_fit:       18,
        supply_persistence: 15,
        development_stage:  25,
        site_quality:        8,
        jurisdiction:       10,
        actionability:      10,
        proximity:           6,
        counterparty:        8
    };

    // How far along the physical asset already is, worst to best. This is the largest single
    // difference between two prospects: an energized, permitted 2 MW plant inherits permits,
    // interconnection, fuel supply and commissioning, while a raw flare of identical capacity is
    // 12-24 months and six figures of at-risk spend away from producing anything.
    //
    // An 80-point spread at 25% weight is 20 final-score points — wider than the entire
    // jurisdiction component. That is intended.
    //
    // Note honestly: while flares are the only source loaded, every prospect is raw_resource, so
    // this component consumes a quarter of the weight while contributing NO ranking information.
    // It starts discriminating the moment a facility source lands.
    //
    // Adding a constant component is rank-preserving only WITHIN a coverage class. For a fixed
    // used-weight W the new score is `old·W/(W+25) + 20·25/(W+25)` — affine with positive slope,
    // so order is untouched. But W varies per prospect (a site with no published operator scores
    // no counterparty component), and the pull toward 20 is stronger the sparser the prospect:
    //     new − old = 25·(20 − old)/(W + 25)
    // Measured over a 404-prospect sample of the real catalog: order is preserved exactly inside
    // each of the three coverage classes, while 58% of positions shift across classes — by at
    // most 23 places out of 404, Spearman rho 0.9994. Small, but not zero, and it is a real
    // consequence of the reweight rather than a rounding artefact.
    //
    // The spread also compresses, by W/(W+25): 82 points to 58 on that sample.
    var STAGE_SCORES = {
        raw_resource: 20,
        permitted:    50,
        constructed:  70,
        energized:    90,
        operating:   100
    };

    var DEFAULT_SETTINGS = {
        // Capacity fit peaks inside this band rather than rewarding size without limit. A 40 MW
        // prospect is not actionable at this stage and must not outrank a 2 MW one.
        targetKwMin: 1000,
        targetKwMax: 3000,
        // How far outside the band the score decays to zero. Asymmetric on purpose: a site half
        // the target size is a smaller version of the same project, while one ten times too big
        // is a different business with a different counterparty and a different negotiation.
        underToleranceFactor: 4,    // 1/4 of the band floor scores 0
        overToleranceFactor: 8,     // 8x the band ceiling scores 0
        // Counterparty preference, 0-100. Who is realistically willing to sell stranded energy
        // to a small buyer and sign in a reasonable timeframe.
        counterpartyScores: {
            oil_gas_operator:  85,   // motivated: flaring costs them money and regulatory room
            // Municipal was 55, marked down for slow procurement. That conflated two different
            // questions: WILL they deal, and HOW LONG will it take. A county waste authority
            // signs 15-20 year agreements, does not sell its leases and does not go bankrupt --
            // on willingness it is the best counterparty in the dataset. Public RFPs and council
            // approvals are a schedule problem, and this score is not a schedule.
            //
            // Honest limitation: the app has nowhere to PUT the schedule half yet. months_to_
            // revenue in site-capex.js is build time, not deal time. So this fixes the score and
            // leaves the timeline unmodelled rather than pretending the slowness does not exist.
            landfill_public:   85,   // municipal / county waste authority — stable, signs long
            landfill_private:  80,   // independent commercial operators, used to gas offtake
            // The national consolidators. Not scored down for being large but for being
            // uninterested: a 1 MW behind-the-meter deal is beneath the threshold at which their
            // corporate development team returns a call, and the site manager cannot sign it.
            landfill_major:    45,
            utility:           30,   // long cycles, little interest in a small counterparty
            independent_power:  60,
            unknown:           null  // unscored, NOT a low score
        },
        // Proximity to existing operations, in km. Inside `proximityNearKm` scores 100; beyond
        // `proximityFarKm` scores 0. Shared crews and spares are the real advantage here.
        proximityNearKm: 150,
        proximityFarKm: 1200
    };

    /* LANDFILLS SCORE ON A DIFFERENT COMPONENT SET, so they get their own table.
     *
     * capital_avoided is meaningless for a flare -- there is no infrastructure at a wellhead to
     * inherit -- and development_stage is redundant for a landfill, because capital_avoided
     * measures the same fact in dollars rather than as a label. Scoring both would count the
     * inheritance twice.
     *
     * TWO TABLES RATHER THAN ONE, and the reason is `coverage`. It is reported as the share of
     * TOTAL weight that was actually measured, so a single table holding every component would
     * make a flare report 71% coverage while having complete data for everything that applies to
     * it -- the missing 29% being a component that could never apply. Each table sums to 100 over
     * the components that genuinely apply, which is the invariant the file header asks for and
     * what makes coverage mean the same thing for both.
     *
     * These are the brief's weights, unchanged. */
    var LANDFILL_WEIGHTS = {
        capital_avoided:    35,
        capacity_fit:       15,
        supply_persistence: 10,
        actionability:      10,
        counterparty:       10,
        site_quality:       10,
        jurisdiction:        5,
        proximity:           5
    };

    var _weights = null, _settings = null;

    function weights() {
        if (!_weights) { _weights = {}; for (var k in DEFAULT_WEIGHTS) _weights[k] = DEFAULT_WEIGHTS[k]; }
        return _weights;
    }
    var _lfWeights = null;
    function landfillWeights() {
        if (!_lfWeights) { _lfWeights = {}; for (var k in LANDFILL_WEIGHTS) _lfWeights[k] = LANDFILL_WEIGHTS[k]; }
        return _lfWeights;
    }
    // A component absent from the chosen table takes weight 0 and is excluded from wtotal, so
    // coverage counts only what could have applied.
    function weightsFor(cand) {
        return (cand && cand.energyType === 'landfill_gas') ? landfillWeights() : weights();
    }
    function settings() {
        if (!_settings) {
            _settings = {};
            for (var k in DEFAULT_SETTINGS) _settings[k] = DEFAULT_SETTINGS[k];
            _settings.counterpartyScores = {};
            for (var c in DEFAULT_SETTINGS.counterpartyScores) {
                _settings.counterpartyScores[c] = DEFAULT_SETTINGS.counterpartyScores[c];
            }
        }
        return _settings;
    }
    function setWeight(id, value) {
        var n = Number(value);
        if (!isFinite(n) || n < 0) return false;
        if (DEFAULT_WEIGHTS[id] === undefined) return false;
        weights()[id] = n;
        return true;
    }
    function setSetting(key, value) {
        if (DEFAULT_SETTINGS[key] === undefined) return false;
        settings()[key] = value;
        return true;
    }
    function reset() { _weights = null; _settings = null; }

    function num(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = Number(v);
        return isFinite(n) ? n : null;
    }
    function clamp100(v) { return v < 0 ? 0 : (v > 100 ? 100 : v); }

    // ---- Effective capacity -------------------------------------------------------------
    // The single place nameplate is converted to what a miner can actually consume. Everything
    // downstream uses this, which is what stops intermittent and continuous sources from being
    // compared as though they were the same asset.
    function effectiveKw(cand) {
        var kw = num(cand && cand.powerPotentialKw);
        if (kw === null) return null;
        var duty = num(cand && cand.dutyCyclePct);
        if (duty === null) duty = 100;
        return kw * (duty / 100);
    }

    // ---- Contact tier -------------------------------------------------------------------
    // Derived, never typed. Recomputed whenever a contact field is edited, so filling in a phone
    // number immediately moves the prospect up the ranked list. Tier 1 is best.
    //
    // `manual` is the user-entered record from site-model.js (may be absent); `operator` is the
    // regulator-published record from data/operators.json (may also be absent).
    function contactTier(cand, ctx) {
        ctx = ctx || {};
        var manual = ctx.manual || null;
        var op = ctx.operator || null;

        function has(v) { return v !== null && v !== undefined && String(v).trim() !== ''; }

        // A named human with a way to reach them directly.
        if (manual && has(manual.contact_name) && (has(manual.contact_email) || has(manual.contact_phone))) {
            return { tier: 1, label: 'Named contact', score: 100 };
        }
        // A way to reach the company, even without a named person.
        if (manual && (has(manual.contact_email) || has(manual.contact_phone))) {
            return { tier: 2, label: 'Company contact', score: 80 };
        }
        // The regulator publishes a phone or address for the licensee — AER ST104 does this for
        // Alberta, which is why Canadian prospects are usually more actionable than US ones.
        if (op && (has(op.phone) || has(op.address))) {
            return { tier: 2, label: 'Published company contact', score: 75 };
        }
        // We know who holds the licence but have no way to reach them yet.
        if (op && has(op.operator)) {
            return { tier: 3, label: 'Operator named, no contact', score: 45 };
        }
        if (manual && has(manual.operator)) {
            return { tier: 3, label: 'Operator named, no contact', score: 45 };
        }
        // Nobody identified. Scored low rather than null: an unattributed site genuinely is
        // harder to act on, and that is a real property of the prospect, not missing data.
        return { tier: 4, label: 'No operator identified', score: 10 };
    }

    // ---- Components ---------------------------------------------------------------------
    // Each returns { value: 0..100 | null, detail: string }. null means "not measured here" and
    // removes the component's weight from the denominator.

    function scoreCapacityFit(cand) {
        var kw = effectiveKw(cand);
        if (kw === null || kw <= 0) return { value: null, detail: 'no capacity estimate' };
        var s = settings();
        var lo = s.targetKwMin, hi = s.targetKwMax;
        var duty = num(cand.dutyCyclePct);
        var suffix = (duty !== null && duty < 100)
            ? ' (' + Math.round(cand.powerPotentialKw) + ' kW nameplate at ' + duty + '% duty)' : '';

        if (kw >= lo && kw <= hi) {
            return { value: 100, detail: Math.round(kw) + ' kW effective, inside the target band' + suffix };
        }
        if (kw < lo) {
            var floor = lo / s.underToleranceFactor;
            if (kw <= floor) return { value: 0, detail: Math.round(kw) + ' kW effective, far below target' + suffix };
            // Linear decay from the band edge down to the tolerance floor.
            return { value: clamp100(100 * (kw - floor) / (lo - floor)),
                     detail: Math.round(kw) + ' kW effective, below the target band' + suffix };
        }
        var ceil = hi * s.overToleranceFactor;
        if (kw >= ceil) return { value: 0, detail: Math.round(kw) + ' kW effective, far above target' + suffix };
        return { value: clamp100(100 * (ceil - kw) / (ceil - hi)),
                 detail: Math.round(kw) + ' kW effective, above the target band' + suffix };
    }

    // Reliability of the energy actually showing up. Two independent signals: how many annual
    // surveys saw it, and whether a satellite has confirmed it recently.
    function scoreSupplyPersistence(cand) {
        var seen = num(cand.yearsSeen), total = num(cand.yearsTotal);
        var base = null, parts = [];
        if (seen !== null && total) {
            base = 100 * seen / total;
            parts.push('seen in ' + seen + ' of ' + total + ' surveys');
        } else {
            // Sources without an annual survey history fall back to their own persistence
            // measure if the adapter computed one.
            var p = num(cand.persistencePct);
            if (p !== null) { base = clamp100(p); parts.push('persistence ' + Math.round(p) + '%'); }
        }
        if (base === null) return { value: null, detail: 'no persistence history' };

        // Recent confirmation is corroboration, so it lifts the score but cannot create one.
        // Crucially, ABSENCE of confirmation does not subtract: most live sites go unconfirmed
        // because small flares fall below the sensor's detection floor, not because they are out.
        var days = num(cand.daysSinceActive);
        if (days !== null && days <= 90) {
            base = base + (100 - base) * 0.35;
            parts.push('confirmed burning ' + Math.round(days) + 'd ago');
        }
        return { value: clamp100(base), detail: parts.join(', ') };
    }

    // Road access, fiber and grid distance. We have measured NONE of these yet, so this returns
    // null and its 15% redistributes. It is defined now so the component exists the moment the
    // data does, and so `coverage` honestly reports that a chunk of the model is unmeasured.
    function scoreSiteQuality(cand, ctx) {
        ctx = ctx || {};
        var m = ctx.manual || null;
        var vals = [], parts = [];
        function band(v, good, bad, label) {
            if (v === null) return;
            var s = v <= good ? 100 : (v >= bad ? 0 : 100 * (bad - v) / (bad - good));
            vals.push(s); parts.push(label + ' ' + v + ' km');
        }
        if (m) {
            band(num(m.road_distance_km), 1, 25, 'road');
            band(num(m.fiber_distance_km), 5, 60, 'fiber');
            band(num(m.grid_distance_km), 2, 40, 'grid');
        }
        // Measured grid distance, where no hand survey overrides it. A site visit always wins:
        // the pipeline measures straight-line distance to a substation, which is a proxy for
        // "how developed is this area", not for what it would cost to interconnect.
        if (!(m && num(m.grid_distance_km) !== null)) {
            band(num(cand && cand.gridDistanceKm), 2, 40, 'grid (measured)');
        }

        // Road access, derived rather than measured. A plant that is operating, energized or
        // built necessarily has vehicle access — you cannot construct or run one without it,
        // and containers arrive by truck. This is an inference from a recorded fact, not a
        // guess, so it carries its reasoning. Raw resource gets nothing: a flare in a field may
        // be miles from a passable road and we genuinely do not know.
        if (!(m && num(m.road_distance_km) !== null)) {
            var st = stageOf(cand);
            if (st === 'operating' || st === 'energized' || st === 'constructed') {
                vals.push(100);
                parts.push('road access implied by a built asset');
            }
        }

        if (!vals.length) return { value: null, detail: 'road, fiber and grid distances not surveyed' };
        var avg = vals.reduce(function(a, b) { return a + b; }, 0) / vals.length;
        return { value: clamp100(avg), detail: parts.join(', ') };
    }

    // Resolves the recorded stage, or null when it is absent or unrecognised. Deliberately strict:
    // at 25% weight, scoring a typo as raw_resource would bury a prospect ~15 points on a
    // data-entry error, and scoring it as 0 would be worse still.
    function stageOf(cand) {
        if (!cand || typeof cand !== 'object') return null;
        // Two spellings by design. The candidate shape is camelCase, set by the source adapter
        // like dutyCyclePct; the persisted record is snake_case, from SiteData. The persisted
        // one wins where both exist, because a human typed it.
        var v = cand.development_stage;
        if (v === undefined || v === null) v = cand.developmentStage;
        if (v === undefined || v === null) return null;
        v = String(v).trim().toLowerCase();
        // The three shapes an absent value actually arrives in. The literal string 'undefined'
        // is not paranoia: this codebase builds HTML by concatenation, so an undefined field
        // renders as value="undefined" and reads back as that string.
        if (v === '' || v === 'undefined' || v === 'null') return null;
        // hasOwnProperty, NOT `STAGE_SCORES[v] !== undefined` — 'toString' would otherwise
        // resolve up Object.prototype to a function and NaN the whole score.
        return Object.prototype.hasOwnProperty.call(STAGE_SCORES, v) ? v : null;
    }

    function scoreDevelopmentStage(cand) {
        /* SUPERSEDED FOR LANDFILLS, because capital_avoided measures the same thing in dollars.
         *
         * Development stage is a proxy: it ranks a constructed site above a candidate one because
         * the constructed site inherits equipment. capital_avoided says HOW MUCH equipment, at
         * what value, discounted for condition. Scoring both would count the same fact twice, at
         * 25% and 35%, and would let a stage label outvote the dollars behind it.
         *
         * Null rather than deletion: the component still exists and still ranks every flare and
         * every generating facility, where there is no capital-avoided figure to replace it. */
        if (cand && cand.energyType === 'landfill_gas') {
            return { value: null, detail: 'superseded by capital avoided for landfill gas' };
        }
        var st = stageOf(cand);
        if (st === null) return { value: null, detail: 'development stage not recorded' };
        return { value: STAGE_SCORES[st], detail: st.replace(/_/g, ' ') };
    }

    /* The share of the build somebody else has paid for, or must pay for. 0-100 so a 500 kW site
     * and a 5 MW one are directly comparable -- an absolute dollar figure would just re-rank by
     * size, which capacity_fit already does.
     *
     * Multiplied by the confidence in the inventory behind it, per the brief: high 1.0, medium
     * 0.8, low 0.5. A site whose infrastructure is inferred from one published field should not
     * outrank one where it is inferred from two. */
    function scoreCapitalAvoided(cand, ctx) {
        if (!cand || cand.energyType !== 'landfill_gas') {
            return { value: null, detail: 'capital avoided applies to landfill gas only' };
        }
        var SI = (ctx && ctx.infrastructure) ||
                 (typeof SiteInfrastructure !== 'undefined' ? SiteInfrastructure : null);
        if (!SI) return { value: null, detail: 'infrastructure model not loaded' };
        var asOf = (ctx && ctx.asOf) || null;
        var r = SI.capitalAvoided(cand, { asOf: asOf, band: ctx && ctx.band });
        if (r.totalBuildUsd === null || r.totalBuildUsd <= 0) {
            return { value: null, detail: 'capacity not published, so the build cannot be priced' };
        }
        var share = 100 * r.avoidedUsd / r.totalBuildUsd;
        var mult = SI.CONFIDENCE_MULT[r.confidence] === undefined ? 0.5 : SI.CONFIDENCE_MULT[r.confidence];
        var detail = '$' + Math.round(r.avoidedUsd).toLocaleString() + ' of $' +
                     Math.round(r.totalBuildUsd).toLocaleString() + ' avoided' +
                     (r.conditionVerified ? ' (verified)' : ' (unverified estimate)');
        return { value: clamp100(share * mult), detail: detail };
    }

    function scoreJurisdiction(cand, ctx) {
        ctx = ctx || {};
        var J = ctx.jurisdictions || (typeof Jurisdictions !== 'undefined' ? Jurisdictions : null);
        if (!J || typeof J.score !== 'function') return { value: null, detail: 'no jurisdiction table' };
        var v = J.score(cand.iso3);
        if (v === null) return { value: null, detail: 'jurisdiction not assessed' };
        var info = typeof J.get === 'function' ? J.get(cand.iso3) : null;
        return { value: clamp100(v), detail: (cand.iso3 || '?') + (info && info.tier ? ' — ' + info.tier : '') };
    }

    function scoreActionability(cand, ctx) {
        var t = contactTier(cand, ctx);
        return { value: t.score, detail: t.label, tier: t.tier };
    }

    // Distance to the nearest site already operating. Shared crews, spares and travel are the
    // advantage; with no fleet yet there is nothing to be near, so this returns null rather
    // than penalising every prospect equally.
    function scoreProximity(cand, ctx) {
        ctx = ctx || {};
        var fleet = ctx.fleet;
        if (!Array.isArray(fleet) || !fleet.length) return { value: null, detail: 'no existing operations to measure from' };
        var lat = num(cand.lat), lng = num(cand.lng);
        if (lat === null || lng === null) return { value: null, detail: 'no coordinates' };
        var best = null;
        for (var i = 0; i < fleet.length; i++) {
            var f = fleet[i], flat = num(f.lat !== undefined ? f.lat : f.latitude),
                flng = num(f.lng !== undefined ? f.lng : f.longitude);
            if (flat === null || flng === null) continue;
            var d = haversineKm(lat, lng, flat, flng);
            if (best === null || d < best) best = d;
        }
        if (best === null) return { value: null, detail: 'existing operations have no coordinates' };
        var s = settings();
        var v = best <= s.proximityNearKm ? 100
              : (best >= s.proximityFarKm ? 0
              : 100 * (s.proximityFarKm - best) / (s.proximityFarKm - s.proximityNearKm));
        return { value: clamp100(v), detail: Math.round(best) + ' km from the nearest existing site' };
    }

    function scoreCounterparty(cand) {
        var t = cand.counterpartyType;
        if (!t) return { value: null, detail: 'counterparty not identified' };
        var tbl = settings().counterpartyScores;
        // hasOwnProperty, NOT `tbl[t] !== undefined`. A counterpartyType of 'toString',
        // 'constructor' or 'valueOf' resolves up Object.prototype to a FUNCTION, which is neither
        // null nor undefined, survives clamp100 (a function is neither < 0 nor > 100), and then
        // NaNs `sum += value * weight` — taking the entire opportunity score down with it.
        var v = Object.prototype.hasOwnProperty.call(tbl, t) ? tbl[t] : undefined;
        if (v === null || v === undefined) return { value: null, detail: String(t).replace(/_/g, ' ') + ' — unscored' };
        // Belt and braces: a table edited at runtime could still hold a non-number.
        var n = Number(v);
        if (!isFinite(n)) return { value: null, detail: String(t).replace(/_/g, ' ') + ' — unscored' };
        return { value: clamp100(n), detail: String(t).replace(/_/g, ' ') };
    }

    function haversineKm(lat1, lon1, lat2, lon2) {
        var R = 6371, p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
        var dp = p2 - p1, dl = (lon2 - lon1) * Math.PI / 180;
        var a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
        return 2 * R * Math.asin(Math.sqrt(a));
    }

    var COMPONENTS = [
        { id: 'capacity_fit',       label: 'Capacity fit',       fn: scoreCapacityFit },
        { id: 'supply_persistence', label: 'Supply persistence', fn: scoreSupplyPersistence },
        { id: 'development_stage',  label: 'Development stage',  fn: scoreDevelopmentStage },
        { id: 'site_quality',       label: 'Site quality',       fn: scoreSiteQuality },
        { id: 'jurisdiction',       label: 'Jurisdiction',       fn: scoreJurisdiction },
        { id: 'actionability',      label: 'Actionability',      fn: scoreActionability },
        { id: 'proximity',          label: 'Proximity',          fn: scoreProximity },
        { id: 'counterparty',       label: 'Counterparty',       fn: scoreCounterparty },
        { id: 'capital_avoided',   label: 'Capital avoided',    fn: scoreCapitalAvoided }
    ];

    // ---- The score ----------------------------------------------------------------------
    function score(cand, ctx) {
        ctx = ctx || {};
        if (!cand || typeof cand !== 'object') {
            return { score: null, scoreRaw: null, coverage: 0, breakdown: [], contactTier: null, effectiveKw: null };
        }
        var w = weightsFor(cand), breakdown = [], sum = 0, wsum = 0, wtotal = 0, tier = null;

        for (var i = 0; i < COMPONENTS.length; i++) {
            var c = COMPONENTS[i], weight = w[c.id] === undefined ? 0 : w[c.id];
            var r;
            try { r = c.fn(cand, ctx) || { value: null, detail: 'not computed' }; }
            catch (e) { r = { value: null, detail: 'error: ' + e.message }; }
            if (c.id === 'actionability' && r.tier !== undefined) tier = r.tier;
            wtotal += weight;
            if (r.value !== null && weight > 0) { sum += r.value * weight; wsum += weight; }
            breakdown.push({ id: c.id, label: c.label, value: r.value, weight: weight, detail: r.detail });
        }

        return {
            // Renormalised over the components that actually had data. Null when nothing did —
            // an unscoreable prospect reports no score rather than a zero it did not earn.
            score: wsum > 0 ? Math.round(sum / wsum) : null,
            // Unrounded. site-acquirability.js combines the two axes multiplicatively, and
            // multiplying two rounded integers over 16,125 rows collapses the sort key into far
            // fewer distinct values than the data actually has, creating ties that are artefacts.
            scoreRaw: wsum > 0 ? sum / wsum : null,
            // Share of total weight that was actually measured. A score of 80 at 45% coverage
            // is a much weaker claim than 80 at 90%, and the UI shows both.
            coverage: wtotal > 0 ? Math.round(100 * wsum / wtotal) : 0,
            breakdown: breakdown,
            contactTier: tier,
            effectiveKw: effectiveKw(cand)
        };
    }

    return {
        score: score,
        /* Exported so the link audit can ask the module that already owns the formula how far
           apart two coordinates are, rather than the workspace carrying a fourth copy of
           haversine that agrees with this one until somebody edits one of them. */
        haversineKm: haversineKm,
        contactTier: contactTier,
        landfillWeights: landfillWeights,
        LANDFILL_WEIGHTS: LANDFILL_WEIGHTS,
        effectiveKw: effectiveKw,
        weights: weights,
        setWeight: setWeight,
        settings: settings,
        setSetting: setSetting,
        reset: reset,
        COMPONENTS: COMPONENTS,
        stageOf: stageOf,
        STAGE_SCORES: STAGE_SCORES,
        DEFAULT_WEIGHTS: DEFAULT_WEIGHTS,
        DEFAULT_SETTINGS: DEFAULT_SETTINGS
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SiteOpportunity;
