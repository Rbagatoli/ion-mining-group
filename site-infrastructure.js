// ===== What is already on the ground, and what that saves you =====
//
// Pure functions. No DOM, no network, no globals beyond the export.
//
// WHY THIS IS THE PRIMARY AXIS. Modelled against the platform's own calculator, at a 5 MW site a
// $1M reduction in infrastructure cost (17%) moves the BTC-accumulation crossover by about three
// years (30%), while a 2 cent/kWh reduction in all-in power cost moves it by about two. That is
// net of a full hardware replacement cycle at 60 months with 10% salvage. Capital dominates
// operating cost, so a mediocre gas site with $2.5M of usable infrastructure standing beats an
// excellent one built from scratch.
//
// TWO WAYS CAPITAL IS AVOIDED, and they are worth the same to a buyer:
//
//   1. It already exists. A prior project put collection or generation in the ground.
//   2. Somebody else is legally compelled to install it. A landfill facing a statutory methane
//      deadline funds collection whether or not you appear; arrive before they commit to a flare
//      design and they build collection while you add generation.
//
// This is what resolves the contradiction between two earlier briefs. A Canadian LMR January 2029
// site has NO collection and scores high, because the operator must install it by law. A US site
// with no collection and no mandate scores low, because that bill is yours. Same field, opposite
// meaning, and the difference is the mandate rather than the equipment.
//
// THE CONDITION PROBLEM, WHICH IS THE WHOLE RISK. LMOP records that equipment was INSTALLED. It
// records nothing about whether it still works. A shut project's gensets may be serviceable,
// cannibalised, or scrap. So conditionVerified defaults to false, only a human who has walked the
// site can set it true, and every unverified figure is labelled an estimate wherever it appears.
// The entire thesis rests on that equipment being usable and the dataset cannot tell you that.
var SiteInfrastructure = (function() {
    'use strict';

    /* RATES COME FROM site-capex.js, NOT FROM A SECOND TABLE.
     *
     * The brief that commissioned this carried its own per-kW figures -- generation $300-500/kW,
     * treatment $100-200, electrical $90-150. site-capex.js already prices the same equipment at
     * $900, $250 and $150. On generation that is 2.25x apart, which is $2.5M at 5 MW.
     *
     * Two tables would let this module say "you avoided $2.0M" while the capex stack beside it
     * charges $4.5M to build the same thing, and the pair would drift every time either was
     * tuned. That is exactly the failure already found in this codebase between the acquisition
     * price and the refurbishment curve: two tables, never reconciled, one of them wrong.
     *
     * So avoided capital is priced at what the app says building it costs. If those rates are
     * wrong they are wrong in one place, and correcting them corrects both sides at once. The
     * low/mid/high band below is the stress-test the brief asked for, applied as a multiplier.
     *
     * COLLECTION USED TO BE DECLARED HERE and now comes off the shared card like the rest.
     * site-capex.js still prices no collection COMPONENT -- a greenfield landfill is never
     * charged for the field it would have to drill, which is a real and separately filed gap --
     * but the RATE is one number in one place, because a budget is about to read both modules
     * and two figures for the same wells would surface as a variance rather than as a bug. */

    var FALLBACK_RATES = {          // used only when SiteCapex is not loaded
        collectionPerKw: 550,
        generationPerKw: 900,
        gasTreatmentPerKw: 250,
        interconnectionPerKw: 150,
        commissioningPerKw: 60,
        civilPerKw: 60
    };

    // The stress-test band the brief asked for. Applied to every component at once, because the
    // uncertainty is correlated -- a site that is expensive for one reason is expensive for most.
    var BAND = { low: 0.7, mid: 1.0, high: 1.4 };

    /* Condition discount, applied wherever conditionVerified is false -- which is nearly always,
     * because only an inspection can clear it. These are deliberately harsh:
     *
     *   present   0.60  installed and believed intact, but nobody has looked
     *   shutdown  0.35  idle for an unknown period; the pad and headers survive, the rotating
     *                   equipment may not
     *   mandated  1.00  no discount, because the operator is buying NEW. Nothing is being
     *                   inherited and there is no condition to doubt.
     *
     * The asymmetry is the point. Mandated capital is the only kind you can count in full. */
    var CONDITION_DISCOUNT = { present: 0.60, shutdown: 0.35, mandated: 1.00, absent: 0, unknown: 0 };

    /* ===== THE SHUTDOWN DISCOUNT IS AN AGE CURVE, NOT A FLAT RATE ========================
     *
     * The 0.35 above was never arbitrary: it is site-capex.js's bopRetained, the balance-of-plant
     * floor, applied universally with the age curve that sits on top of it dropped. Its reasoning
     * holds and is kept -- the foundation, enclosure, switchgear and controls survive an engine
     * that does not. What was lost is that a mothballed three-year-old machine retains far more
     * than the floor, and this credited it the same as a 1994 engine.
     *
     * So this restores the half that went missing rather than replacing a wrong model with a
     * right one. Measured across the catalogue, 483 sites carry a shutdown component:
     *
     *   generation     +26%  ($520.1M -> $656.6M)   278 identical, 184 up, 0 down
     *   gas treatment  -12%  ($144.5M -> $126.4M)   278 down, 184 up, 0 identical
     *
     * Generation is never credited LESS, because the floor holds underneath it. Gas treatment
     * moves both ways and deliberately gets no floor: site-capex.js refuses it one, on the
     * grounds that a siloxane skid is vessels and media with its own life and giving it a
     * generator's floor is a category error.
     *
     * ONLY THESE TWO ARE UNIFIED, and the rest are divergences that are MEASURED rather than
     * reconciled. site-capex.js has no refurb model for the others and inventing one to satisfy
     * consistency would be worse than the inconsistency:
     *
     *   electrical  STAGE_RETAINED.constructed gives interconnection 1.0 -- fully inherited.
     *               NOT adopted. Crediting idle switchgear at 100% asserts it is as good as new,
     *               which is the very condition doubt the unverified banner exists to raise.
     *               0.35 is conservative and errs in the safe direction.
     *   civil       site-capex.js has no civil component at all. There is nothing to adopt.
     *   collection  site-capex.js treats a present collection system as fully avoided; this
     *               credits 0.60. Left as it is, for the same condition-doubt reason.
     *
     * ASKED, NOT RE-DERIVED. refurbRetained() and bopRetained live in site-capex.js, which owns
     * the curve and has the tests for it. A second copy here would agree until one was tuned. */
    function shutdownDiscount(rec, asOf, componentId) {
        if (componentId !== 'generation' && componentId !== 'gasTreatment') {
            return { discount: CONDITION_DISCOUNT.shutdown, aged: false, years: null };
        }
        if (typeof SiteCapex === 'undefined' || !SiteCapex.refurbRetained ||
            !SiteCapex.yearsSinceShutdown) {
            return { discount: CONDITION_DISCOUNT.shutdown, aged: false, years: null };
        }
        var years = SiteCapex.yearsSinceShutdown(rec, asOf);
        var ret = SiteCapex.refurbRetained(years);
        /* NO SHUTDOWN DATE FALLS BACK TO THE FLOOR, IT DOES NOT GO UNKNOWN. 13 components in the
           catalogue have no published date. Dropping their avoided figure would remove a number
           that exists today in exchange for a more honest silence, and a conservative number
           carrying a flag beats no number -- but the row has to SAY the age input was missing,
           or a reader cannot tell a computed discount from a defaulted one. */
        if (ret === null) {
            return { discount: CONDITION_DISCOUNT.shutdown, aged: false, years: null };
        }
        if (componentId === 'generation') {
            var floor = (SiteCapex.settings && SiteCapex.settings().bopRetained);
            if (typeof floor === 'number' && ret < floor) ret = floor;
        }
        return { discount: ret, aged: true, years: years };
    }

    /* A mandate is only worth something if you arrive before the operator commits to a flare
     * design. Once the engineering is let, the collection system is being built to burn the gas
     * and adding generation later is a second project.
     *
     * Bands from the brief. The shape matters more than the exact numbers: too early and there is
     * no budget pressure to partner against; too late and the decision is made. */
    var MANDATE_DECAY = [
        { minMonths: 48,  factor: 0.7 },   // too early -- no budget pressure yet
        { minMonths: 36,  factor: 1.0 },   // optimal
        { minMonths: 24,  factor: 1.0 },
        { minMonths: 12,  factor: 0.6 },   // likely already in engineering
        { minMonths: 0,   factor: 0.3 },   // almost certainly committed
        { minMonths: -1e9, factor: 0.2 }   // past the deadline
    ];

    function num(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = Number(v);
        return isFinite(n) ? n : null;
    }

    function rates() {
        var r = (typeof SiteCapex !== 'undefined' && SiteCapex.rates) ? SiteCapex.rates() : null;
        return {
            collection:    (r && r.collectionPerKw)      || FALLBACK_RATES.collectionPerKw,
            generation:    (r && r.generationPerKw)      || FALLBACK_RATES.generationPerKw,
            gasTreatment:  (r && r.gasTreatmentPerKw)    || FALLBACK_RATES.gasTreatmentPerKw,
            electrical:    (r && r.interconnectionPerKw) || FALLBACK_RATES.interconnectionPerKw,
            /* civilPerKw, NOT commissioningPerKw. This priced a pad at the startup-and-tuning
               rate until site-capex.js grew a civil rate of its own; the value is unchanged, so
               the coupling went and no figure moved. */
            civil:         (r && r.civilPerKw)           || FALLBACK_RATES.civilPerKw
        };
    }

    // ---- What is on the ground ---------------------------------------------------------
    //
    // INFERRED FROM PUBLISHED FIELDS, NOT OBSERVED, and the confidence field says so.
    //
    // Generation is read from existingGenerationKw rather than from the project status, and that
    // is a deliberate departure from the commissioning brief. The brief proposed mapping
    // operational / construction / shutdown to "generation present". Measured against the real
    // artifact that mapping asserts equipment on about 470 sites that have none on record: only
    // 14% of Construction rows and 5% of Planned rows carry a generator, and 32% of Shutdown rows
    // do not either. existingGenerationKw states the fact directly, so it is used directly.
    function inventory(c) {
        var sd = (c && c.sourceDetail) || {};
        var out = {
            collection: 'unknown',
            generation: 'unknown',
            gasTreatment: 'unknown',
            electrical: 'unknown',
            civil: 'unknown',
            confidence: 'low',
            evidence: [],
            conditionVerified: sd.infraConditionVerified === true
        };
        if (!c) return out;

        // ---- collection ----
        var raw = sd.collectionSystem;
        if (raw !== null && raw !== undefined && raw !== '') {
            var v = String(raw).trim().toLowerCase();
            out.collection = v === 'yes' ? 'present' : v === 'shutdown' ? 'shutdown'
                           : v === 'no' ? 'absent' : 'unknown';
            out.evidence.push({ field: 'collectionSystem', value: String(raw),
                                source: 'EPA LMOP, LFG collection system' });
        } else if (sd.hasExistingControls === true) {
            out.collection = 'present';
            out.evidence.push({ field: 'hasExistingControls', value: 'true',
                                source: 'ECCC GHGRP, reported gas destruction' });
        } else if (sd.hasExistingControls === false) {
            // No collection today -- but a statutory deadline means the OPERATOR builds it.
            if (sd.lmrCohort && sd.lmrCohort !== 'below_threshold' && sd.lmrCohort !== 'unknown') {
                out.collection = 'mandated';
                out.mandateSource = 'Landfill Methane Regulations (SOR/2025-279)';
                out.mandateDeadline = sd.lmrDeadline || null;
                out.mandateConfidence = sd.lmrCohort === 'jan_2029' ? 'high' : 'medium';
                out.evidence.push({ field: 'lmrCohort', value: String(sd.lmrCohort),
                                    source: 'Canadian LMR cohort, s.5' });
            } else {
                out.collection = 'absent';
                out.evidence.push({ field: 'hasExistingControls', value: 'false',
                                    source: 'ECCC GHGRP, no gas destruction reported' });
            }
        }

        // ---- generation, read from the field that states it ----
        var gen = num(c.existingGenerationKw);
        if (gen !== null && gen > 0) {
            var shut = /shutdown/i.test(String(sd.projectStatus || ''));
            out.generation = shut ? 'shutdown' : 'present';
            out.evidence.push({ field: 'existingGenerationKw', value: String(Math.round(gen)) + ' kW',
                                source: 'EPA LMOP rated or actual MW' });
        } else if (/candidate|low potential|future potential/i.test(String(sd.projectStatus || ''))) {
            out.generation = 'absent';
            out.evidence.push({ field: 'projectStatus', value: String(sd.projectStatus),
                                source: 'EPA LMOP project status' });
        }

        /* Treatment, electrical and civil FOLLOW generation, and that is an inference drawn on an
           inference. If gensets went in, a siloxane skid, switchgear and a pad went in with them
           -- there is no way to run an engine without them. But nothing publishes it, so these
           never reach high confidence and the detail view says so. */
        if (out.generation === 'present' || out.generation === 'shutdown') {
            out.gasTreatment = out.electrical = out.civil = out.generation;
        } else if (out.generation === 'absent') {
            out.gasTreatment = out.electrical = out.civil = 'absent';
        }

        // Confidence is about the INVENTORY, not the condition. Two published facts is as good as
        // this data gets; one is medium; none is a guess.
        var stated = out.evidence.length;
        out.confidence = stated >= 2 ? 'high' : stated === 1 ? 'medium' : 'low';
        return out;
    }

    // ---- Mandate timing ------------------------------------------------------------------
    function monthsToDeadline(deadlineIso, asOfIso) {
        if (!deadlineIso || !asOfIso) return null;
        var d = new Date(deadlineIso.length === 10 ? deadlineIso + 'T00:00:00Z' : deadlineIso);
        var a = new Date(asOfIso.length === 10 ? asOfIso + 'T00:00:00Z' : asOfIso);
        if (isNaN(d.getTime()) || isNaN(a.getTime())) return null;
        var m = (d.getUTCFullYear() - a.getUTCFullYear()) * 12 + (d.getUTCMonth() - a.getUTCMonth());
        if (d.getUTCDate() < a.getUTCDate()) m -= 1;
        return m;
    }

    function mandateFactor(months) {
        if (months === null) return 0.6;          // deadline unknown: neither reward nor punish
        for (var i = 0; i < MANDATE_DECAY.length; i++) {
            if (months >= MANDATE_DECAY[i].minMonths) return MANDATE_DECAY[i].factor;
        }
        return 0.2;
    }

    // ---- Capital avoided -------------------------------------------------------------------
    //
    // opts: { kw, band: 'low'|'mid'|'high', asOf: 'YYYY-MM-DD', discountOverride: {component: n} }
    function capitalAvoided(c, opts) {
        var o = opts || {};
        var inv = inventory(c);
        var kw = num(o.kw);
        if (kw === null) kw = num(c && c.powerPotentialKw);
        var R = rates();
        var mult = BAND[o.band] === undefined ? BAND.mid : BAND[o.band];

        var out = {
            avoidedUsd: null, requiredUsd: null, totalBuildUsd: null,
            confidence: inv.confidence, conditionVerified: inv.conditionVerified,
            components: [], inventory: inv, band: o.band || 'mid',
            mandateMonths: null, mandateFactor: null
        };
        if (kw === null || kw <= 0) return out;

        var months = inv.mandateDeadline ? monthsToDeadline(inv.mandateDeadline, o.asOf || null) : null;
        var mf = inv.collection === 'mandated' ? mandateFactor(months) : null;
        out.mandateMonths = months;
        out.mandateFactor = mf;

        var parts = [
            { id: 'collection',   label: 'Gas collection',  state: inv.collection,   perKw: R.collection },
            { id: 'generation',   label: 'Generation',      state: inv.generation,   perKw: R.generation },
            { id: 'gasTreatment', label: 'Gas treatment',   state: inv.gasTreatment, perKw: R.gasTreatment },
            { id: 'electrical',   label: 'Electrical',      state: inv.electrical,   perKw: R.electrical },
            { id: 'civil',        label: 'Civil / pad',     state: inv.civil,        perKw: R.civil }
        ];

        var total = 0, avoided = 0;
        parts.forEach(function(p) {
            var full = p.perKw * kw * mult;
            total += full;
            var disc = Object.prototype.hasOwnProperty.call(CONDITION_DISCOUNT, p.state)
                ? CONDITION_DISCOUNT[p.state] : 0;
            var aged = false, agedYears = null;
            if (p.state === 'shutdown') {
                var sd = shutdownDiscount(c, o.asOf, p.id);
                disc = sd.discount; aged = sd.aged; agedYears = sd.years;
            }
            // A verified site is worth what it is, not what a stranger would discount it to.
            if (inv.conditionVerified && (p.state === 'present' || p.state === 'shutdown')) disc = 1;
            if (o.discountOverride && o.discountOverride[p.id] !== undefined) {
                disc = Number(o.discountOverride[p.id]);
            }
            var value = full * disc;
            // The mandate decay applies ONLY to mandated capital -- it is about the timing of
            // somebody else's decision, not about the condition of anything.
            if (p.state === 'mandated' && mf !== null) value *= mf;
            avoided += value;
            out.components.push({
                id: p.id, label: p.label, state: p.state,
                perKw: Math.round(p.perKw * mult), fullUsd: Math.round(full),
                discount: disc, avoidedUsd: Math.round(value),
                /* aged:false on a shutdown row means the discount was DEFAULTED to the floor
                   because no shutdown date is published, not computed from one. A reader has to
                   be able to tell those apart; years is the input it was computed from. */
                agedDiscount: aged, yearsSinceShutdown: agedYears === null ? null
                                                        : Math.round(agedYears * 10) / 10
            });
        });

        out.totalBuildUsd = Math.round(total);
        out.avoidedUsd = Math.round(avoided);
        out.requiredUsd = Math.round(total - avoided);
        return out;
    }

    // 0..100 for the scorer. Share of the total build somebody else has paid for or must pay for,
    // which is directly comparable between a 500 kW site and a 5 MW one.
    function avoidedScore(c, opts) {
        var r = capitalAvoided(c, opts);
        if (r.totalBuildUsd === null || r.totalBuildUsd <= 0) return null;
        return Math.max(0, Math.min(100, Math.round(100 * r.avoidedUsd / r.totalBuildUsd)));
    }

    var CONFIDENCE_MULT = { high: 1.0, medium: 0.8, low: 0.5 };

    return {
        BAND: BAND,
        CONDITION_DISCOUNT: CONDITION_DISCOUNT,
        MANDATE_DECAY: MANDATE_DECAY,
        CONFIDENCE_MULT: CONFIDENCE_MULT,
        rates: rates,
        inventory: inventory,
        capitalAvoided: capitalAvoided,
        avoidedScore: avoidedScore,
        mandateFactor: mandateFactor,
        monthsToDeadline: monthsToDeadline
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SiteInfrastructure;
