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

    // Weights are settings, not constants. They are normalised at use, so they do not have to
    // sum to 100 after editing.
    var DEFAULT_WEIGHTS = {
        capacity_fit:       25,
        supply_persistence: 20,
        site_quality:       15,
        jurisdiction:       10,
        actionability:      10,
        proximity:          10,
        counterparty:       10
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
            landfill_private:  80,   // commercial owners, used to third-party gas offtake
            landfill_public:   55,   // municipal — procurement rules slow everything down
            utility:           30,   // long cycles, little interest in a small counterparty
            independent_power:  60,
            unknown:           null  // unscored, NOT a low score
        },
        // Proximity to existing operations, in km. Inside `proximityNearKm` scores 100; beyond
        // `proximityFarKm` scores 0. Shared crews and spares are the real advantage here.
        proximityNearKm: 150,
        proximityFarKm: 1200
    };

    var _weights = null, _settings = null;

    function weights() {
        if (!_weights) { _weights = {}; for (var k in DEFAULT_WEIGHTS) _weights[k] = DEFAULT_WEIGHTS[k]; }
        return _weights;
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
        if (!vals.length) return { value: null, detail: 'road, fiber and grid distances not surveyed' };
        var avg = vals.reduce(function(a, b) { return a + b; }, 0) / vals.length;
        return { value: clamp100(avg), detail: parts.join(', ') };
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
        var v = tbl[t];
        if (v === null || v === undefined) return { value: null, detail: String(t).replace(/_/g, ' ') + ' — unscored' };
        return { value: clamp100(v), detail: String(t).replace(/_/g, ' ') };
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
        { id: 'site_quality',       label: 'Site quality',       fn: scoreSiteQuality },
        { id: 'jurisdiction',       label: 'Jurisdiction',       fn: scoreJurisdiction },
        { id: 'actionability',      label: 'Actionability',      fn: scoreActionability },
        { id: 'proximity',          label: 'Proximity',          fn: scoreProximity },
        { id: 'counterparty',       label: 'Counterparty',       fn: scoreCounterparty }
    ];

    // ---- The score ----------------------------------------------------------------------
    function score(cand, ctx) {
        ctx = ctx || {};
        if (!cand || typeof cand !== 'object') {
            return { score: null, coverage: 0, breakdown: [], contactTier: null, effectiveKw: null };
        }
        var w = weights(), breakdown = [], sum = 0, wsum = 0, wtotal = 0, tier = null;

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
        contactTier: contactTier,
        effectiveKw: effectiveKw,
        weights: weights,
        setWeight: setWeight,
        settings: settings,
        setSetting: setSetting,
        reset: reset,
        COMPONENTS: COMPONENTS,
        DEFAULT_WEIGHTS: DEFAULT_WEIGHTS,
        DEFAULT_SETTINGS: DEFAULT_SETTINGS
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SiteOpportunity;
