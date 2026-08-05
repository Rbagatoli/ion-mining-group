// ===== SITE AVAILABILITY =====
//
// How many hours a year a site can actually run, WHY that number is what it is, and whether it is
// solid enough to put a dollar figure on.
//
// dutyCyclePct already existed on the shared candidate shape and already fed capacity_fit in
// site-opportunity.js. What it never reached was the money: site-engine.js priced every prospect
// as though it ran flat out. This module is the seam between the two, and it exists mainly to
// answer a question the raw percentage cannot: 20% of what, and how do we know?
//
// Two prospects can both read 20% and mean opposite things:
//
//   A solar farm at 20%   - that is the sun. No load you bring changes it. The 20% is a CEILING.
//   A gas peaker at 20%   - that is the merchant market not calling it. Your load is precisely
//                           the thing that could raise it. The 20% is a FLOOR.
//
// The first is a reason to walk away, the second is a reason to make a call. Ranking them together
// on a single percentage buries the only distinction that matters.
//
// It also refuses to price what it cannot support. A duty read off a technology lookup table is
// not a measurement of THIS plant, and must never reach a payback figure wearing the same
// confidence as one that is.

var SiteAvailability = (function() {

    // ---- The physical/dispatch split -----------------------------------------------------
    //
    // EIA prime mover codes whose capacity factor is a physical ceiling. This is a statement
    // about thermodynamics and weather, NOT about which adapter supplied the row, so it stays
    // true regardless of source and leaves the source-agnostic rule in site-opportunity.js
    // untouched.
    //
    //   PV  photovoltaic          WT  wind turbine        WS  wind, other
    //   HY  conventional hydro    PS  pumped storage      BA  battery
    //   FW  flywheel
    //
    // Measured against data/facilities.json: 7,539 of 9,765 plants are capped, 2,226 are not.
    // Storage (BA, PS, FW) is here because its duty is bounded by how often it is cycled, which
    // an on-site load does not lift either - it is not generation at all.
    var PHYSICALLY_CAPPED = { PV: 1, WT: 1, WS: 1, HY: 1, PS: 1, BA: 1, FW: 1 };

    // Basis values, worst to best. Only the top two may reach a dollar figure - see priceable().
    var BASIS = {
        MEASURED: 'measured',   // this plant's own reported generation history
        DECLARED: 'declared',   // a source-level engineering constant with stated reasoning
        TYPICAL:  'typical',    // a technology lookup - true of the class, not of this asset
        UNKNOWN:  'unknown'     // no evidence at all
    };

    function num(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = typeof v === 'number' ? v : parseFloat(v);
        return isFinite(n) ? n : null;
    }

    // ---- Capacity type -------------------------------------------------------------------

    // 'physically_capped' | 'dispatch_limited' | null when the prime mover is unknown.
    //
    // Returns null rather than guessing: a prospect with no prime mover has not been shown to be
    // dispatchable, and calling it dispatch_limited would manufacture exactly the "your load
    // could raise this" thesis that this function exists to make defensible.
    function capacityType(cand) {
        if (!cand) return null;
        var d = cand.sourceDetail || {};
        var pm = d.primeMover;
        if (pm === null || pm === undefined || pm === '') return null;
        return Object.prototype.hasOwnProperty.call(PHYSICALLY_CAPPED, String(pm).toUpperCase())
            ? 'physically_capped'
            : 'dispatch_limited';
    }

    // ---- Basis ---------------------------------------------------------------------------

    // Where this prospect's duty cycle came from.
    //
    // Adapters that KNOW their basis stamp it into sourceDetail.dutyBasis, and that is always
    // preferred. The inference below is the fallback for anything that does not.
    function basis(cand) {
        if (!cand) return BASIS.UNKNOWN;
        var d = cand.sourceDetail || {};
        if (d.dutyBasis) return d.dutyBasis;

        // A source-level constant, declared once with its reasoning in the adapter (flare gas
        // burns continuously at 100; landfill gas is 92 because engines need servicing). That is
        // a modelling assumption made explicitly, which is a different thing from an absent one.
        if (cand.source !== 'eia-facility') return BASIS.DECLARED;

        // Facilities: the plant's own reported capacity factor is the only real measurement.
        var cf = num(d.capacityFactorCurrent);
        if (cf === null) cf = num(d.capacityFactorBaseline);
        if (cf !== null && cf > 0) return BASIS.MEASURED;
        return BASIS.UNKNOWN;
    }

    // ---- Duty ----------------------------------------------------------------------------

    // The duty cycle as a percentage, or null when it is not known.
    //
    // Note the deliberate divergence from cand.dutyCyclePct: site-sources.js normalize() coerces
    // a null duty to 100 to keep the shared shape simple, which silently turns "we have no idea"
    // into "runs continuously" - the single most favourable assumption available. That is fine
    // for the shape contract but not for pricing, so an unknown basis reports null here.
    function dutyPct(cand) {
        if (!cand) return null;
        var b = basis(cand);
        if (b === BASIS.UNKNOWN) return null;
        var v = num(cand.dutyCyclePct);
        if (v === null) return null;
        if (v < 0) return 0;
        return v > 100 ? 100 : v;
    }

    // May this duty carry a dollar figure?
    //
    // measured - yes, it is this asset's own history.
    // declared - yes, it is an explicit modelling constant, no weaker than the heat rate or the
    //            BTU content the engine already prices with.
    // typical  - NO. 'Solar Photovoltaic -> 25%' is true of solar in general and says nothing
    //            about whether THIS array is shaded, curtailed or half-derated.
    // unknown  - NO, obviously.
    function priceable(cand) {
        var b = basis(cand);
        return (b === BASIS.MEASURED || b === BASIS.DECLARED) && dutyPct(cand) !== null;
    }

    // Everything the engine and the UI need, in one call.
    //
    // uptimePct is what site-engine.js should be handed. It is 100 - not null - when the duty is
    // not priceable, because 100 is the engine's documented default and reproduces today's
    // numbers exactly. The refusal to price is expressed by `priceable: false` and by the UI
    // declining to render a payback, NOT by feeding the engine a number it cannot use.
    function evaluate(cand) {
        var b = basis(cand);
        var duty = dutyPct(cand);
        var ok = (b === BASIS.MEASURED || b === BASIS.DECLARED) && duty !== null;
        return {
            dutyPct: duty,
            basis: b,
            capacityType: capacityType(cand),
            priceable: ok,
            uptimePct: ok ? duty : 100,
            // Hours per month at this duty, for anything that wants to state the derate directly.
            hoursPerMonth: duty === null ? null : Math.round(720 * duty / 100),
            note: noteFor(b, duty, capacityType(cand))
        };
    }

    // One line saying what the number rests on. The capped/dispatch distinction is the whole
    // point of the module, so it is stated wherever it is known.
    function noteFor(b, duty, cap) {
        if (b === BASIS.UNKNOWN || duty === null) {
            return 'Duty cycle unmeasured — no generation history reported for this plant';
        }
        if (b === BASIS.TYPICAL) {
            return 'Duty cycle ' + duty + '% assumed from technology class, not measured at this ' +
                   'site — not used for pricing';
        }
        if (b === BASIS.DECLARED) {
            return 'Duty cycle ' + duty + '% declared for this source type';
        }
        // Measured.
        if (cap === 'physically_capped') {
            return 'Ran ' + duty + '% of hours — a physical ceiling for this plant type. On-site ' +
                   'load cannot raise it.';
        }
        if (cap === 'dispatch_limited') {
            return 'Ran ' + duty + '% of hours. Dispatchable plant, so this is a floor rather ' +
                   'than a ceiling — fuel supply and interconnect headroom unmeasured.';
        }
        return 'Ran ' + duty + '% of hours, measured from this plant\'s own generation history';
    }

    return {
        BASIS: BASIS,
        PHYSICALLY_CAPPED: PHYSICALLY_CAPPED,
        capacityType: capacityType,
        basis: basis,
        dutyPct: dutyPct,
        priceable: priceable,
        evaluate: evaluate
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SiteAvailability;
