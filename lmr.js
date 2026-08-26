// ===== Landfill Methane Regulations (SOR/2025-279) — applicability, cohort, capacity =====
//
// Pure functions. No DOM, no network, no globals beyond the export — the same discipline as
// site-engine.js, and for the same reason: every number here ends up in front of a counterparty,
// so each one has to be walkable back to a section of the Regulations or to an arithmetic step
// somebody can repeat.
//
// MISSING DATA IS NEVER GUESSED. An absent input yields null, and a cohort we cannot establish is
// 'unknown' rather than the most flattering guess.
//
// WHAT THIS IS FOR. Canada's Landfill Methane Regulations came into force 12 December 2025. They
// create something rare: a population of landfill operators with a legal obligation to destroy
// methane, a fixed date, and — for the cohort with no existing controls — no capital already in
// the ground. A gas-to-power partner who funds the infrastructure turns that liability into
// revenue. This module is the part that says which operators those are.
//
// EVERY THRESHOLD AND DATE BELOW WAS READ OUT OF THE REGULATION, not out of a summary. Several
// widely-circulated consultant summaries describe the thresholds as "open landfills above 664 t,
// closed landfills above 1,000 t". That is NOT what sections 5(2) and 5(3) say; they tier purely
// by methane quantity, and the 2028/2029 split turns on whether a landfill gas recovery system
// was already operating when the Regulations came into force. Section references are given so the
// next person can check rather than trust.
var LMR = (function() {
    'use strict';

    // ---- Dates and thresholds, straight from the Regulations --------------------------
    var IN_FORCE = '2025-12-12';

    // s.5(2) and s.5(3). Tonnes of methane GENERATED per year — not emitted. See the note above
    // generationFromReported() for why that distinction decides the entire shortlist.
    var THRESHOLD_UPPER_T = 1000;   // s.5(2): >= 1,000 t/yr
    var THRESHOLD_LOWER_T = 664;    // s.5(3): 664 t/yr to under 1,000 t/yr

    // s.3(1)(a) and s.3(1)(b). BOTH conditions in (b) must hold; the second is easy to miss and
    // dropping it over-includes every mid-size site that had one busy year.
    var APPLIC_WASTE_IN_PLACE_T = 450000;   // s.3(1)(a), for waste received after 2010-01-01
    var APPLIC_ANNUAL_DISPOSAL_T = 20000;   // s.3(1)(b), in 2025 or any later year
    var APPLIC_MIN_IN_PLACE_T = 200000;     // s.3(1)(b), AND this much in place

    var COHORT_DEADLINES = {
        jan_2028: '2028-01-01',   // s.5(2)(a)(i)  — recovery system already operating at in-force
        jan_2029: '2029-01-01',   // s.5(2)(a)(ii) — any other portion
        jan_2035: '2035-01-01'    // s.5(3)        — the 664..999 t tier
    };

    // ---- Gas to power ------------------------------------------------------------------
    //
    // Methane at ~15 degC and one atmosphere. This particular density is not arbitrary: it is the
    // one that reproduces the regulator-facing benchmark of 1,000 t/yr == 99.1 cf/min. Choosing
    // 0.657 (20 degC) instead yields 102.3 and every downstream figure drifts with it.
    var CH4_DENSITY_KG_M3 = 0.678;
    var CF_PER_M3 = 35.3147;
    var MIN_PER_YEAR = 525600;
    var MIN_PER_DAY = 1440;

    // Methane higher heating value, and a reciprocating genset's heat rate. 10,000 BTU/kWh is
    // 34.1% electrical efficiency, which is the middle of the band for a landfill-gas engine and
    // consistent with the ~35% that tools/build-landfill-index.js assumes for the US adapter.
    var CH4_BTU_PER_CF = 1012;
    var GENSET_BTU_PER_KWH = 10000;

    // How much of the gas a collection system actually gets to the engine. The rest migrates
    // through the cap, through the sides, or is oxidised in the cover soil.
    //
    // THIS IS A RANGE, NOT A NUMBER, and it is configurable because it moves the answer by a
    // third. US EPA and IPCC field data put a well-run system at 60-85%. Defaulting to the middle
    // is a modelling choice, not a measurement, and it is stated as such on every derived figure.
    var DEFAULT_CAPTURE = 0.75;
    var CAPTURE_MIN = 0.60;
    var CAPTURE_MAX = 0.85;

    // Methane oxidised in the cover soil before it ever reaches the atmosphere, on a site with no
    // gas collection. IPCC's default for a managed landfill with cover.
    var COVER_OXIDATION = 0.10;

    function num(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = Number(v);
        return isFinite(n) ? n : null;
    }

    // ---- Tonnes of methane per year -> cubic feet per minute ---------------------------
    //
    //   t/yr -> kg -> m3 (at CH4_DENSITY_KG_M3) -> cf -> cf/min
    //
    // Reproduces the two figures the Regulations' thresholds are usually quoted with:
    //   1,000 t/yr -> 99.1 cf/min       664 t/yr -> 65.8 cf/min
    function methaneTonnesToCfm(tonnesPerYear) {
        var t = num(tonnesPerYear);
        if (t === null || t < 0) return null;
        return (t * 1000 / CH4_DENSITY_KG_M3) * CF_PER_M3 / MIN_PER_YEAR;
    }

    // ---- Tonnes of methane per year -> continuous electrical kW ------------------------
    //
    //   99.1 cf/min x 1,440 min/day            = 142,703 cf/day
    //   x 1,012 BTU/cf                         =     144 MMBTU/day
    //   / 10,000 BTU/kWh                       =  14,442 kWh/day
    //   / 24 h                                 =     602 kW
    //
    // So the 1,000 t threshold is a ~600 kW site AT FULL CAPTURE, and a 450-510 kW site at the
    // 75% capture this module defaults to. The 664 t threshold is ~400 kW full, ~300 kW real.
    //
    // WHICH IS THE POINT WORTH TAKING FROM THIS FUNCTION: a landfill sitting exactly on the
    // regulatory threshold is a third of a megawatt. The Regulations create obligated buyers, not
    // large ones. Any shortlist that filters at the threshold is a shortlist of sites too small
    // to site a container on, which is why the saved view filters well above it.
    function methaneTonnesToKw(tonnesPerYear, opts) {
        var cfm = methaneTonnesToCfm(tonnesPerYear);
        if (cfm === null) return null;
        var o = opts || {};
        var capture = o.captureEfficiency === undefined ? DEFAULT_CAPTURE : num(o.captureEfficiency);
        if (capture === null || capture <= 0 || capture > 1) capture = DEFAULT_CAPTURE;
        var cfDay = cfm * MIN_PER_DAY * capture;
        var kwhDay = cfDay * CH4_BTU_PER_CF / GENSET_BTU_PER_KWH;
        return kwhDay / 24;
    }

    // ---- Reported emissions are not generation, and the gap is the whole story ---------
    //
    // ECCC's GHGRP publishes methane EMITTED. The Regulations tier on methane GENERATED. On a
    // site with gas collection those two numbers differ by the collection efficiency, and they
    // differ in the direction that breaks naive filtering:
    //
    //   A site with a good flare captures most of its gas, so it REPORTS LITTLE and looks small.
    //   A site with no controls emits nearly everything it makes, so it reports close to the truth.
    //
    // Filter on reported CH4 alone and you systematically discard exactly the sites that have
    // already built a collection system.
    //
    // The saving grace is that the cohort we care most about — 1,000 t/yr and NO existing
    // controls, the January 2029 forced buyers — is the one where reported emissions are a fair
    // proxy, needing only the cover-oxidation gross-up. For controlled sites we must gross up by
    // capture as well, and that estimate is much softer. Every return says which case it took.
    function generationFromReported(reportedCh4Tonnes, hasControls, opts) {
        var e = num(reportedCh4Tonnes);
        if (e === null || e < 0) {
            return { tonnes: null, basis: null, confidence: null };
        }
        var o = opts || {};
        var capture = o.captureEfficiency === undefined ? DEFAULT_CAPTURE : num(o.captureEfficiency);
        if (capture === null || capture <= 0 || capture >= 1) capture = DEFAULT_CAPTURE;

        if (hasControls === true) {
            // What escapes is what the collection system missed, less what the cover oxidised.
            var escaping = (1 - capture) * (1 - COVER_OXIDATION);
            return {
                tonnes: e / escaping,
                basis: 'reported CH4 grossed up for ' + Math.round(capture * 100) +
                       '% collection and ' + Math.round(COVER_OXIDATION * 100) + '% cover oxidation',
                // Soft: it multiplies by roughly 4, and the capture figure is assumed, not measured.
                confidence: 0.4
            };
        }
        if (hasControls === false) {
            return {
                tonnes: e / (1 - COVER_OXIDATION),
                basis: 'reported CH4 grossed up for ' + Math.round(COVER_OXIDATION * 100) +
                       '% cover oxidation; no gas collection reported',
                confidence: 0.75
            };
        }
        // Controls unknown. Refuse to pick, because the two branches differ by a factor of four
        // and the midpoint would be a number describing no real site.
        return {
            tonnes: null,
            basis: 'cannot convert emissions to generation without knowing whether gas is collected',
            confidence: null
        };
    }

    // ---- Measuring capture instead of assuming it -------------------------------------
    //
    // Every figure above that needed a collection efficiency ASSUMED one, because the obvious
    // source for the real number -- the by-emission-source file that separates landfilling from
    // landfill gas flaring -- is not in the by-gas feed. It turns out the by-gas feed carries the
    // answer anyway, in a column nobody reads for this purpose.
    //
    // Burning methane makes carbon dioxide:
    //
    //     CH4 + 2 O2 -> CO2 + 2 H2O        44.01 / 16.04 = 2.744 t CO2 per t CH4
    //
    // The carbon in landfill gas is biogenic, so a flare's or an engine's exhaust is reported as
    // CO2 FROM BIOMASS rather than as fossil CO2. A landfill's biogenic CO2 line is therefore
    // very close to a direct measurement of how much methane it DESTROYED, and:
    //
    //     generated  ~=  destroyed + emitted
    //     capture    ~=  destroyed / generated
    //
    // which turns the softest assumption in this module into a per-site measurement. Measured
    // across the 145 Canadian landfills reporting for 2024, 95 report biogenic CO2 and 50 report
    // none, and the implied capture spans 0.2% to about 75% -- a spread no single assumed
    // constant could have represented.
    //
    // TWO LIMITS, both real:
    //
    // 1. Biogenic CO2 is an UPPER BOUND on flare CO2. Any other biomass combustion on the site
    //    lands in the same line. For a NAICS 562210 landfill that is a small risk, but it means
    //    this over-estimates capture rather than under-estimating it -- and over-estimated
    //    capture moves a site OUT of the forced-buyer cohort, so the error is conservative in
    //    the direction that matters.
    // 2. A site reporting no biogenic CO2 might be a site that does not report it rather than one
    //    that does not flare. Absence is returned as null, never as zero capture.
    var CO2_PER_CH4 = 44.01 / 16.04;

    // Below this, whatever is being destroyed is not a gas collection system in any sense the
    // Regulations would recognise -- it is instrumentation, a flare pilot, or noise in the
    // return. Essex-Windsor at 4% and Twin Creeks at 0.2% are the shape of "no controls".
    var CONTROLS_MIN_CAPTURE = 0.15;

    /* AND A CEILING, WHICH IS WHAT CATCHES THE INCINERATORS.
     *
     * A landfill gas collection system cannot capture much past 90% -- gas migrates through the
     * cap and the sides, and the field is never fully built out over an active cell. So an
     * implied capture above this ceiling is not a very good landfill: it is a facility whose
     * biogenic CO2 comes from something OTHER than landfill gas.
     *
     * Which is exactly what the data contained. Filed under NAICS 562210 alongside real
     * landfills are municipal waste-to-energy plants -- Metro Vancouver's, Durham York Energy
     * Centre, the Complexe de valorisation energetique -- which burn waste directly. They report
     * enormous biogenic CO2 against almost no methane: 2.8 tonnes of CH4 against an implied
     * 45,641 tonnes destroyed, which this arithmetic read as a 27 MW landfill. Thirteen sites
     * were over 8 MW and the largest was 35 MW, in a country whose biggest real landfill is
     * about 6 MW.
     *
     * Rejecting the measurement rather than clamping it is the right move: for an incinerator
     * the fallback (reported CH4 as generation) yields a correctly tiny number and the site
     * drops out of the shortlist on its own, instead of being clamped to a plausible-looking
     * capacity it does not have. */
    var MAX_PLAUSIBLE_CAPTURE = 0.92;

    function captureFromBiogenicCo2(co2BiomassTonnes, ch4EmittedTonnes) {
        var co2 = num(co2BiomassTonnes);
        var emitted = num(ch4EmittedTonnes);
        if (emitted === null || emitted < 0) {
            return { destroyedTonnes: null, generatedTonnes: null, capture: null,
                     hasControls: null, basis: 'no methane figure reported' };
        }
        if (co2 === null || co2 <= 0) {
            // Not "zero capture" -- unreported. The caller must be able to tell the two apart.
            return { destroyedTonnes: null, generatedTonnes: null, capture: null,
                     hasControls: null,
                     basis: 'no biogenic CO2 reported, so gas destruction cannot be measured' };
        }
        var destroyed = co2 / CO2_PER_CH4;
        var generated = destroyed + emitted;
        var capture = generated > 0 ? destroyed / generated : null;
        if (capture !== null && capture > MAX_PLAUSIBLE_CAPTURE) {
            return {
                destroyedTonnes: null, generatedTonnes: null, capture: null, hasControls: null,
                basis: 'biogenic CO2 implies ' + Math.round(capture * 100) + '% capture, above ' +
                       'the ' + Math.round(MAX_PLAUSIBLE_CAPTURE * 100) + '% a landfill gas ' +
                       'collection system can reach — the CO2 is from combustion other than ' +
                       'landfill gas, so this is not a landfill gas measurement'
            };
        }
        return {
            destroyedTonnes: destroyed,
            generatedTonnes: generated,
            capture: capture,
            hasControls: capture === null ? null : capture >= CONTROLS_MIN_CAPTURE,
            basis: 'biogenic CO2 of ' + Math.round(co2) + ' t implies ' + Math.round(destroyed) +
                   ' t CH4 destroyed at ' + CO2_PER_CH4.toFixed(3) + ' t CO2 per t CH4; with ' +
                   Math.round(emitted) + ' t emitted that is ' +
                   (capture === null ? 'unknown' : Math.round(capture * 100) + '%') + ' capture'
        };
    }

    // ---- s.3: is the landfill caught by the Regulations at all? ------------------------
    function applicability(f) {
        var rec = f || {};
        var inPlace = num(rec.wasteInPlaceTonnes);
        var annual = num(rec.annualDisposalTonnes);
        var receivedAfter2010 = rec.receivedWasteAfter2010;

        // s.3(1)(a)
        if (inPlace !== null && inPlace > APPLIC_WASTE_IN_PLACE_T && receivedAfter2010 !== false) {
            return { applicable: true, basis: 's.3(1)(a): over ' + APPLIC_WASTE_IN_PLACE_T +
                     ' t MSW in place with waste received after 2010' };
        }
        // s.3(1)(b) — BOTH limbs. The second is the one summaries drop.
        if (annual !== null && annual > APPLIC_ANNUAL_DISPOSAL_T &&
            inPlace !== null && inPlace > APPLIC_MIN_IN_PLACE_T) {
            return { applicable: true, basis: 's.3(1)(b): over ' + APPLIC_ANNUAL_DISPOSAL_T +
                     ' t disposed in a year and over ' + APPLIC_MIN_IN_PLACE_T + ' t in place' };
        }
        if (inPlace === null && annual === null) {
            return { applicable: null, basis: 'no waste tonnage published for this facility' };
        }
        return { applicable: false, basis: 'below both s.3(1) thresholds on the tonnage published' };
    }

    // ---- s.5: which cohort, and therefore which deadline -------------------------------
    //
    // hasControls means "was a landfill gas recovery system in operation on the day the
    // Regulations came into force" — s.5(2)(a)(i). We infer it from whether the facility reports
    // landfill gas FLARING, which cannot happen without collection.
    //
    // TWO HONEST LIMITS, both recorded on the result rather than smoothed over:
    //
    // 1. The Regulations attach obligations to a PORTION of a landfill, not to the landfill.
    //    s.5(2) says "any portion" throughout, so one site can hold a 2028 portion and a 2029
    //    portion at once. GHGRP reports per FACILITY. Where a facility shows both flaring and
    //    landfilling emissions we therefore return 'mixed' rather than picking the flattering
    //    half — the site genuinely has both, and which portion is which is not in the data.
    //
    // 2. s.5(2)(a)(ii) and s.5(3) both say "or January 1 of the fourth year after the year for
    //    which that quantity is calculated, whichever is later". Deadlines ROLL for a site that
    //    crosses the threshold later. We can only compute a deadline for a site already over the
    //    line on published data; for anything else the date is not yet determined.
    function cohort(f) {
        var rec = f || {};
        var gen = num(rec.methaneGenerationTonnes);
        var hasControls = rec.hasExistingControls;
        var portionCaveat = rec.hasFlaring === true && rec.hasLandfillingEmissions === true
            ? ' Obligations attach per PORTION under s.5(2); this facility reports both gas ' +
              'destruction and landfilling, so an uncontrolled portion may sit behind a later date.'
            : '';

        if (gen === null) {
            return { cohort: 'unknown', deadline: null,
                     basis: 'methane generation not established for this facility' };
        }
        if (gen < THRESHOLD_LOWER_T) {
            return { cohort: 'below_threshold', deadline: null,
                     basis: 'under the s.5(3) floor of ' + THRESHOLD_LOWER_T + ' t/yr generated' };
        }
        if (gen < THRESHOLD_UPPER_T) {
            return { cohort: 'jan_2035', deadline: COHORT_DEADLINES.jan_2035,
                     basis: 's.5(3): ' + THRESHOLD_LOWER_T + ' to under ' + THRESHOLD_UPPER_T +
                            ' t/yr generated' };
        }
        /* At or over 1,000 t/yr — s.5(2).
         *
         * THE PER-PORTION CAVEAT IS A NOTE, NOT A COHORT. s.5(2) attaches obligations to "any
         * portion" of a landfill, so a site can genuinely hold a 2028 portion and a 2029 portion
         * at once, and GHGRP reports per FACILITY and cannot resolve that.
         *
         * I first modelled it as a 'mixed' cohort triggered by a facility reporting both flaring
         * and landfilling emissions. That was a bad proxy and the data said so: it returned 76 of
         * 147 sites and left the 2028 cohort with two, because EVERY landfill reports landfilling
         * emissions -- a controlled site still leaks through its cap. Reporting both is the normal
         * state of a working landfill, not evidence of an uncontrolled portion.
         *
         * So the cohort follows recovery, and the ambiguity is carried in the basis text where it
         * can be read rather than in a bucket that swallowed the answer. */
        if (hasControls === true) {
            return { cohort: 'jan_2028', deadline: COHORT_DEADLINES.jan_2028,
                     basis: 's.5(2)(a)(i): over ' + THRESHOLD_UPPER_T +
                            ' t/yr with gas recovery already operating.' + portionCaveat };
        }
        if (hasControls === false) {
            return { cohort: 'jan_2029', deadline: COHORT_DEADLINES.jan_2029,
                     basis: 's.5(2)(a)(ii): over ' + THRESHOLD_UPPER_T +
                            ' t/yr with no gas recovery in operation at coming into force' };
        }
        return { cohort: 'unknown', deadline: null,
                 basis: 'over ' + THRESHOLD_UPPER_T + ' t/yr, but whether gas is already ' +
                        'recovered is not established — that is the 2028/2029 split' };
    }

    // ---- s.5(2)(b)(ii): a registered offset project DEFERS, it does not exempt ---------
    //
    // The brief this was built from had it as an exclusion. It is not. Obligations begin "the
    // year following the last year the project generates offset credits under the crediting
    // period in place when the Regulations come into force". So an offset project pushes the
    // date out to the end of its crediting period and no further.
    //
    // Commercially that inverts the read: a registered offset project does not remove a site from
    // the pipeline, it tells you WHEN the site becomes a buyer, and it tells you the operator has
    // already been monetising this gas and will notice when the credits stop.
    function deferForOffset(deadlineIso, lastCreditYear) {
        var y = num(lastCreditYear);
        if (y === null) return { deadline: deadlineIso, deferred: false, basis: null };
        var deferred = (y + 1) + '-01-01';
        if (!deadlineIso || deferred > deadlineIso) {
            return { deadline: deferred, deferred: true,
                     basis: 's.5(2)(b)(ii): deferred to the year after the crediting period ends' };
        }
        return { deadline: deadlineIso, deferred: false,
                 basis: 'offset crediting period ends before the statutory date' };
    }

    // Whole months from `asOf` to the deadline. Negative once the date has passed — a deadline
    // behind you is not urgency, it is a site that solved the problem some other way, and the
    // caller needs to be able to tell those apart.
    function monthsToDeadline(deadlineIso, asOfIso) {
        if (!deadlineIso) return null;
        var d = new Date(deadlineIso + (deadlineIso.length === 10 ? 'T00:00:00Z' : ''));
        var a = asOfIso ? new Date(asOfIso + (asOfIso.length === 10 ? 'T00:00:00Z' : '')) : null;
        if (!a || isNaN(a.getTime()) || isNaN(d.getTime())) return null;
        var months = (d.getUTCFullYear() - a.getUTCFullYear()) * 12 +
                     (d.getUTCMonth() - a.getUTCMonth());
        if (d.getUTCDate() < a.getUTCDate()) months -= 1;
        return months;
    }

    return {
        IN_FORCE: IN_FORCE,
        THRESHOLD_UPPER_T: THRESHOLD_UPPER_T,
        THRESHOLD_LOWER_T: THRESHOLD_LOWER_T,
        APPLIC_WASTE_IN_PLACE_T: APPLIC_WASTE_IN_PLACE_T,
        APPLIC_ANNUAL_DISPOSAL_T: APPLIC_ANNUAL_DISPOSAL_T,
        APPLIC_MIN_IN_PLACE_T: APPLIC_MIN_IN_PLACE_T,
        COHORT_DEADLINES: COHORT_DEADLINES,
        DEFAULT_CAPTURE: DEFAULT_CAPTURE,
        CAPTURE_MIN: CAPTURE_MIN,
        CAPTURE_MAX: CAPTURE_MAX,
        COVER_OXIDATION: COVER_OXIDATION,
        CH4_BTU_PER_CF: CH4_BTU_PER_CF,
        GENSET_BTU_PER_KWH: GENSET_BTU_PER_KWH,

        CO2_PER_CH4: CO2_PER_CH4,
        CONTROLS_MIN_CAPTURE: CONTROLS_MIN_CAPTURE,
        MAX_PLAUSIBLE_CAPTURE: MAX_PLAUSIBLE_CAPTURE,
        captureFromBiogenicCo2: captureFromBiogenicCo2,
        methaneTonnesToCfm: methaneTonnesToCfm,
        methaneTonnesToKw: methaneTonnesToKw,
        generationFromReported: generationFromReported,
        applicability: applicability,
        cohort: cohort,
        deferForOffset: deferForOffset,
        monthsToDeadline: monthsToDeadline
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LMR;
