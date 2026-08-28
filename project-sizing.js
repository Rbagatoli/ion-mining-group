/* ===== Right-sizing: what to build, against what the gas will actually feed =================
 *
 * THE RULE THIS MODULE IS BUILT AROUND, and everything below follows from it:
 *
 *     THE HORIZON NEVER MULTIPLIES A DOLLAR.
 *
 * The remaining-life figure this repo carries is a flat 25-year post-closure horizon
 * (source-landfill.js:268). It is a horizon and it says so -- the real curve depends on moisture,
 * cover and waste composition, none of which LMOP publishes. A decline curve fitted to that would
 * look precise and be built on assumptions, and this number informs a multi-million-dollar
 * capacity decision, so a horizon that admits what it is beats a curve that does not.
 *
 * The guarantee is structural rather than editorial: no dollar figure produced here has a horizon
 * anywhere in its derivation. tests/project-sizing.test.js runs the whole assessment at a 5-year
 * horizon and at a 40-year horizon and requires every _usd and _kw field to be byte-identical. If
 * anyone later wires the horizon into money, that test fails rather than the number quietly
 * becoming a forecast.
 *
 * SO THE FEATURE IS TWO SEPARATE QUESTIONS, and separating them is the design:
 *
 *   1. SIZING -- is the plant bigger than the gas can feed? Needs the gas RATE only. Available on
 *      1,879 of 1,908 US landfill rows (98%). Produces dollars.
 *   2. TERM -- does the gas last the contract? Needs the horizon, or a study. Unavailable on 386
 *      rows (20%), and that 20% includes the best prospects in the dataset: Kingsland closed in
 *      1988, is thirteen years past the horizon, and flares 1.13 mmscfd today, so the model
 *      returns null rather than 0. Produces no dollars, ever.
 *
 * A missing horizon must therefore never block sizing. Getting this backwards would refuse to
 * size exactly the sites worth sizing.
 *
 * WHAT SUPERSEDES THE HORIZON. A site-specific engineering study, filed against the diligence
 * gate's gas_forecast deliverable, which now requires the document rather than a status click.
 * recordStudy() stores what the study says and the id of the document it came from; every figure
 * downstream then carries basis 'study' instead of 'horizon', and the two are never combined into
 * one number. Until a study exists the sizing is directional and says so in words, not in a
 * footnote.
 *
 * NOTHING IS STORED THAT CAN BE DERIVED, on the same rule as the budget ledger: assess() and
 * staged() recompute from the project, the live prospect and the rate card every time they are
 * called. The single exception is the study itself, because what a PDF says cannot be derived
 * from anything in this repo.
 */
var ProjectSizing = (function () {
    'use strict';

    /* THE MARGINAL COST OF A kW IS MEASURED, NOT WRITTEN DOWN HERE.
     *
     * Probing the estimator at two capacities and taking the difference gives the per-kW cost with
     * every flat component cancelled out automatically. Today that comes to $1,560/kW and the only
     * flat item is the $160,000 permitting charge, but hard-coding either would go stale the first
     * time the rate card is edited or a component is added -- and a stale marginal cost is exactly
     * the kind of wrong number this module exists to catch elsewhere. */
    var PROBE_LO = 1000, PROBE_HI = 2000;

    // Deliberately not a rate anyone can tune. A build either fits inside the gas or it does not.
    var FIT_TOLERANCE_KW = 1;

    function num(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = Number(v);
        return isFinite(n) ? n : null;
    }
    function text(v, max) {
        if (v === null || v === undefined) return null;
        var s = String(v).trim();
        if (!s) return null;
        return max ? s.slice(0, max) : s;
    }
    function nowIso() { return new Date().toISOString(); }

    function refuse(reason) { return { measured: false, reason: reason }; }

    /* TWO VOCABULARIES FOR ONE FACT, and translating between them here rather than pretending
       they are the same. SiteCapacity.parasiticFor reads `energyType`, which is the map
       candidate's spelling; the CRM prospect record spells it `energy_type`. Handing a prospect
       straight to parasiticFor silently returns the 7% default instead of the 10% landfill rate,
       which is 3% of a plant's output -- about 76 kW on a 2,544 kW site -- moved by a naming
       difference. Landfill gas is the default here because it is what this module is for and
       because it is the CONSERVATIVE of the two. */
    function parasiticFor(project) {
        if (typeof SiteCapacity === 'undefined' || !SiteCapacity.parasiticFor) return 0.10;
        var rec = prospectFor(project);
        var t = (rec && (rec.energy_type || rec.energyType)) || 'landfill_gas';
        return SiteCapacity.parasiticFor({ energyType: t });
    }

    // ---- the inputs, each with where it came from --------------------------------------

    /* The live prospect, not the promotion snapshot. The snapshot deliberately carries only name,
       position, source and development_stage (project-model.js:389-397) -- it records what was
       sanctioned, and gas volumes are not part of that. A prospect deleted out from under a live
       project is a real state and gets its own refusal rather than a null that reads as "no gas". */
    function prospectFor(project) {
        var pid = project && project.prospect && project.prospect.prospect_id;
        if (!pid) return null;
        if (typeof SiteData === 'undefined' || !SiteData.get) return null;
        return SiteData.get(pid) || null;
    }

    /* WHAT THE GAS SUPPORTS, AND ON WHOSE AUTHORITY.
     *
     * Returns { kw, basis, kw_is, ... } or null. basis is 'study' or 'published_volume', and the
     * two are never averaged, blended or summed -- a study replaces the published figure outright
     * or it does nothing.
     *
     * kw_is matters more than it looks. A published volume converts to GROSS generation, from
     * which parasitic load is still to be taken. A study may state either gross generation or net
     * output at the plug, and running a net figure through the same 10% parasitic derate takes
     * roughly 400 kW off a 4 MW site silently. So the study records which it is and the derate is
     * applied to one and not the other. */
    function gasFigure(project) {
        var st = studyOf(project);
        if (st) {
            var kw = num(st.supported_kw);
            if (kw === null) return null;
            return {
                kw: Math.round(kw),
                basis: 'study',
                kw_is: st.kw_is,
                directional: false,
                document_id: st.document_id,
                source_note: 'from the gas generation forecast on file' +
                             (st.title ? ' (' + st.title + ')' : ''),
                recorded_at: st.recorded_at
            };
        }
        /* FROM THE PROJECT, NOT THE PROSPECT, and the reason is structural rather than a
           preference. site-model.js blankSite() carries no gas volume field and normalize()
           discards unknown keys on save (site-model.js:120), so a promoted prospect has no gas
           on it to read. promote() takes the figure from the candidate the promotion form was
           looking at and freezes it on the project. */
        var mmscfd = num(project && project.gas_mmscfd);
        if (mmscfd === null || mmscfd <= 0) return null;
        if (typeof SiteCapacity === 'undefined' || !SiteCapacity.LFG_MW_PER_MMSCFD) return null;
        var gross = mmscfd * SiteCapacity.LFG_MW_PER_MMSCFD * 1000;
        var par = parasiticFor(project);
        return {
            kw: Math.round(gross * (1 - par)),
            gross_kw: Math.round(gross),
            parasitic_pct: Math.round(par * 100),
            basis: 'published_volume',
            kw_is: 'gas_supported',
            /* DIRECTIONAL, and the word is load-bearing. This is a published annual average
               converted at a single 2.08 MW/mmscfd factor. It is enough to say a 5 MW plant on
               2 MW of gas is wrong; it is not enough to choose between 1,900 and 2,100 kW. */
            directional: true,
            source_note: 'converted from the published collected volume at ' +
                         SiteCapacity.LFG_MW_PER_MMSCFD + ' MW/mmscfd, less ' +
                         Math.round(par * 100) + '% parasitic load'
        };
    }

    // ---- the study, the one thing here that cannot be derived ---------------------------

    function studyOf(project) {
        var s = project && project.gas_study;
        return (s && !s.deleted_at && num(s.supported_kw) !== null) ? s : null;
    }

    /* THE ONLY WRITE IN THIS MODULE.
     *
     * Requires the document id, and verifies it resolves to a filed document of kind
     * gas_forecast. A study whose paper cannot be produced is a typed number wearing a study's
     * authority, which is the one thing this whole module is arranged to prevent. */
    function recordStudy(projectId, fields) {
        if (typeof ProjectData === 'undefined') return { ok: false, err: 'The project model is not loaded.' };
        var f = fields || {};
        var kw = num(f.supported_kw);
        if (kw === null || kw <= 0) {
            return { ok: false, err: 'The study has to state a supported capacity in kW.' };
        }
        if (f.kw_is !== 'gas_supported' && f.kw_is !== 'net_at_plug') {
            return { ok: false, err: 'Say whether that figure is gross generation ' +
                     '(gas_supported) or net output at the plug (net_at_plug). Running a net ' +
                     'figure through the parasitic derate a second time understates the site.' };
        }
        var docId = text(f.document_id);
        if (!docId) {
            return { ok: false, err: 'A study needs the document it came from. File the gas ' +
                     'generation forecast against the prospect first, then record its numbers.' };
        }
        var project = ProjectData.get(projectId);
        if (!project) return { ok: false, err: 'No such project.' };
        var pid = project.prospect && project.prospect.prospect_id;
        if (typeof CrmDocuments !== 'undefined' && CrmDocuments.forProspect && pid) {
            var found = CrmDocuments.forProspect(pid).filter(function (d) { return d.id === docId; })[0];
            if (!found) {
                return { ok: false, err: 'That document is not on file against this prospect.' };
            }
            if (found.kind !== 'gas_forecast') {
                return { ok: false, err: 'That document is filed as "' + found.kind +
                         '", not a gas generation forecast.' };
            }
        }
        var years = num(f.covers_years);
        return ProjectData.mutate(projectId, function (p) {
            p.gas_study = {
                supported_kw: Math.round(kw),
                kw_is: f.kw_is,
                /* How many years the study actually covers. Held separately from the contract
                   term on purpose: a 10-year study against a 15-year term does not become a
                   15-year study, and termSupport() reports the shortfall rather than extending
                   the study's authority over years it never examined. */
                covers_years: (years !== null && years > 0) ? years : null,
                document_id: docId,
                title: text(f.title, 160),
                note: text(f.note, 500),
                recorded_at: nowIso(),
                recorded_by: text(f.recorded_by, 80)
            };
        });
    }

    // ---- the marginal cost of capacity, probed from the estimator ------------------------

    function marginalPerKw(project) {
        if (typeof SiteCapex === 'undefined' || !SiteCapex.stack) return null;
        var rec = {
            powerPotentialKw: PROBE_HI,
            development_stage: (project.prospect && project.prospect.development_stage) || null,
            energy_type: 'landfill_gas'
        };
        var ctx = { annualCostOfCapitalPct: num(project.annual_cost_of_capital_pct) };
        function at(kw) {
            var c = {};
            for (var k in ctx) if (Object.prototype.hasOwnProperty.call(ctx, k)) c[k] = ctx[k];
            c.capacityKw = kw;
            var s = SiteCapex.stack(rec, c);
            return (s && typeof s.incurred_usd === 'number') ? s.incurred_usd : null;
        }
        var lo = at(PROBE_LO), hi = at(PROBE_HI);
        if (lo === null || hi === null || hi === lo) return null;
        return (hi - lo) / (PROBE_HI - PROBE_LO);
    }

    // ---- the assessment. No horizon appears anywhere below this line. --------------------

    /* { measured:false, reason } or the full picture. Every dollar here is capacity x a probed
       per-kW rate; nothing is multiplied by a number of years. */
    function assess(project) {
        if (!project) return refuse('No project.');
        var build = num(project.capacity_kw);
        if (build === null || build <= 0) {
            return refuse('This project has no capacity recorded, so there is nothing to size.');
        }
        var gas = gasFigure(project);
        if (!gas) {
            /* NOT ZERO. A site with no gas volume is unmeasured, and reporting a $0 penalty would
               say the build fits the gas exactly -- a claim, and on this data usually a false one.
               29 of 1,908 US landfill rows publish no volume at all, and a manually entered
               prospect has no candidate behind it to have carried one. */
            return refuse('No gas volume was recorded when this project was promoted, and no ' +
                          'forecast study is on file, so what the gas supports is unknown. A ' +
                          'penalty cannot be measured against an unknown, and reporting $0 would ' +
                          'say the build fits exactly.');
        }

        /* ROUNDED ONCE, THEN USED FOR THE PENALTY, so the arithmetic on screen reconciles. A
           reader who multiplies the excess kW by the rate shown must land on the penalty shown;
           carrying full precision internally and displaying a rounded rate makes the two differ
           by a few hundred dollars and makes the panel look wrong when it is right. */
        var perKwRaw = marginalPerKw(project);
        var perKw = perKwRaw === null ? null : Math.round(perKwRaw);
        var excess = Math.max(0, build - gas.kw);
        var stranded = Math.max(0, gas.kw - build);
        var out = {
            measured: true,
            build_kw: Math.round(build),
            supported_kw: gas.kw,
            gas: gas,
            marginal_usd_per_kw: perKw,
            fits: excess <= FIT_TOLERANCE_KW,
            excess_kw: Math.round(excess),
            stranded_kw: Math.round(stranded),
            // Capital buying capacity with no fuel behind it. Null rather than 0 when the rate
            // card could not be read -- "not computed" and "measured at zero" are opposite claims.
            penalty_usd: (perKw === null) ? null : Math.round(excess * perKw),
            recommended_kw: gas.kw,
            /* THE CONFIDENCE OF THE RECOMMENDATION, IN WORDS, because a published annual average
               cannot choose between 1,900 and 2,100 kW and printing it to the kW implies it can. */
            directional: gas.directional,
            basis: gas.basis
        };
        out.headline = headlineFor(out);
        return out;
    }

    function headlineFor(a) {
        var qual = a.directional
            ? ' This is directional: it comes from a published annual average, not a study.'
            : ' This is study-backed, not directional.';
        if (a.fits && a.stranded_kw <= FIT_TOLERANCE_KW) {
            return 'The build matches what the gas supports.' + qual;
        }
        if (a.excess_kw > 0) {
            var money = a.penalty_usd === null
                ? 'The per-kW cost could not be read, so the capital at stake is not computed.'
                : 'At $' + fmt(a.marginal_usd_per_kw) + '/kW that is about $' +
                  fmt(a.penalty_usd) + ' of plant with no fuel behind it.';
            return 'The build is ' + fmt(a.excess_kw) + ' kW above what the gas supports. ' +
                   money + qual;
        }
        return fmt(a.stranded_kw) + ' kW of gas is not being taken. That is gas left in the ' +
               'ground or flared, not capital wasted.' + qual;
    }

    function fmt(n) {
        if (n === null || n === undefined) return '—';
        return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    /* ---- the staged build --------------------------------------------------------------
     *
     * STAGING DOES NOT SAVE CAPITAL. IT DEFERS IT. Measured on the real estimator: a single
     * 3,600 kW build and two 1,800 kW phases both come to $5,776,000, because the only flat item
     * on the card is the $160,000 permitting charge and you do not re-permit a site you already
     * permitted. Pricing phase 2 as its own full stack would double-count exactly that $160,000
     * and produce a $160,000 "saving" for the single build that is an artefact of the arithmetic,
     * so phase 2 is priced as the DIFFERENCE between the two stacks and the flat part cancels.
     *
     * The whole case for staging is therefore time value, and the honest way to put it is a
     * breakeven rather than two totals: below $X per kW-month, deferring wins; above it, the
     * revenue those kW would have earned in the meantime is worth more than the carry saved.
     * That needs no market feed and cannot be misread as a capital saving.
     *
     * AND IT IS REFUSED ABOVE THE GAS. A flat horizon asserts a constant rate and models no
     * growth -- the curve that would show gas arriving later is precisely the thing being
     * refused. So a phase 2 that takes the total above what the gas supports is oversizing with
     * extra steps, and gets the refusal rather than a price. Only a study may authorise more.
     */
    function staged(project, phase1Kw, deferMonths) {
        var a = assess(project);
        if (!a.measured) return a;
        var p1 = num(phase1Kw), months = num(deferMonths);
        var total = a.build_kw;
        if (p1 === null || p1 <= 0 || p1 >= total) {
            return refuse('Phase one has to be a positive capacity below the ' + fmt(total) +
                          ' kW total.');
        }
        if (months === null || months <= 0) {
            return refuse('Say how many months phase two is deferred by. The entire case for ' +
                          'staging is time value, so with no deferral there is nothing to compare.');
        }
        if (total > a.supported_kw + FIT_TOLERANCE_KW) {
            return refuse('The ' + fmt(total) + ' kW total is already above the ' +
                          fmt(a.supported_kw) + ' kW the gas supports. Staging a build that does ' +
                          'not fit is oversizing in two instalments — the flat horizon behind ' +
                          'this figure asserts a constant rate and models no gas arriving later. ' +
                          'A forecast study is the only thing that can authorise more.');
        }
        if (typeof SiteCapex === 'undefined' || !SiteCapex.stack) {
            return refuse('The capex model is not loaded, so the two paths cannot be priced.');
        }
        var rec = {
            powerPotentialKw: total,
            development_stage: (project.prospect && project.prospect.development_stage) || null,
            energy_type: 'landfill_gas'
        };
        var coc = num(project.annual_cost_of_capital_pct);
        function at(kw) {
            var s = SiteCapex.stack(rec, { capacityKw: kw, annualCostOfCapitalPct: coc });
            return (s && typeof s.incurred_usd === 'number') ? s.incurred_usd : null;
        }
        var single = at(total), first = at(p1);
        if (single === null || first === null) return refuse('The capex model could not price this.');
        var deferred = single - first;              // the flat permitting cancels here
        var p2 = total - p1;
        /* Simple interest, matching site-capex.js:499-505 exactly rather than compounding.
           A truer present value that disagrees with the carrying-cost line already on every
           capex stack in this app would be a second definition of the same idea. */
        var carrySaved = (coc === null) ? null : deferred * (coc / 100) * (months / 12);
        return {
            measured: true,
            total_kw: total,
            phase1_kw: Math.round(p1),
            phase2_kw: Math.round(p2),
            defer_months: Math.round(months),
            single_usd: Math.round(single),
            phase1_usd: Math.round(first),
            phase2_usd: Math.round(deferred),
            // Identical by construction, and stated so nobody reads the pair as a saving.
            staged_nominal_usd: Math.round(first + deferred),
            nominal_difference_usd: 0,
            deferred_usd: Math.round(deferred),
            annual_cost_of_capital_pct: coc,
            carry_saved_usd: carrySaved === null ? null : Math.round(carrySaved),
            breakeven_usd_per_kw_month: (carrySaved === null || p2 <= 0)
                ? null : Math.round((carrySaved / (p2 * months)) * 100) / 100,
            headline: stagedHeadline(total, p1, p2, months, deferred, carrySaved, coc)
        };
    }

    function stagedHeadline(total, p1, p2, months, deferred, carrySaved, coc) {
        var base = 'Both paths cost the same in capital. Staging defers $' + fmt(deferred) +
                   ' of it by ' + fmt(months) + ' months, it does not save it.';
        if (carrySaved === null || coc === null) {
            return base + ' Without a cost of capital the value of that deferral cannot be priced.';
        }
        var be = (carrySaved / (p2 * months));
        return base + ' At ' + coc + '% that deferral is worth about $' + fmt(carrySaved) +
               ', which is $' + (Math.round(be * 100) / 100).toFixed(2) + ' per kW-month across ' +
               'the ' + fmt(p2) + ' kW held back. If those kW would have earned more than that ' +
               'per month, building once wins.';
    }

    /* ---- term support ------------------------------------------------------------------
     *
     * THE ONLY FUNCTION THAT READS THE HORIZON, AND IT RETURNS NO DOLLARS. Not one field below is
     * a currency amount, and that is the enforcement: a caller cannot accidentally multiply the
     * horizon by anything because there is nothing here to multiply.
     *
     * asOfYear is required rather than defaulted to today, because source-landfill.js computes
     * remaining life against new Date().getFullYear() at :284 and :311. A sizing recorded in 2026
     * that silently re-reads differently in 2029 is a record that changes after the fact.
     */
    function termSupport(project, asOfYear) {
        if (!project) return { state: 'unknown', reason: 'No project.' };
        var year = num(asOfYear);
        if (year === null) {
            return { state: 'unknown',
                     reason: 'A year is required. The published horizon counts down from the ' +
                             'closure year, so an assessment with no as-of year would read ' +
                             'differently every January.' };
        }
        var term = num(project.contract_term_years);
        var st = studyOf(project);
        if (st && st.covers_years !== null && st.covers_years !== undefined) {
            var covers = num(st.covers_years);
            return {
                state: term === null ? 'no_term'
                     : (covers >= term ? 'covered' : 'short'),
                basis: 'study',
                directional: false,
                years_available: covers,
                contract_term_years: term,
                shortfall_years: (term === null || covers >= term) ? null : term - covers,
                note: 'From the gas generation forecast on file, which examines ' + covers +
                      ' years.' + ((term !== null && covers < term)
                        ? ' The contract runs ' + term + ' years, so ' + (term - covers) +
                          ' of them are beyond anything the study looked at — the study does not ' +
                          'become longer by being read against a longer contract.'
                        : '')
            };
        }
        /* THE PROJECT ONLY, with no fallback to the prospect, and the absence of that fallback is
           deliberate. sourceDetail is not part of the prospect template (site-model.js:250 copies
           only template keys), so a horizon read from a saved prospect is always null -- a
           fallback there would be unreachable code that reads as though it were a second chance,
           which is how someone later concludes the horizon is available when it is not. */
        var horizon = num(project.horizon_years);
        var basisNote = text(project.horizon_basis, 300);
        if (horizon === null) {
            /* Two different silences and the distinction is real. remainingYears() returns null
               both when there is no closure year and when the site is past the horizon but still
               measurably producing -- 383 US rows are in the second state, and they include the
               best prospect in the dataset. Either way the honest report is that the horizon does
               not settle it, not that the gas is gone. */
            return {
                state: 'unknown', basis: 'horizon', directional: true,
                years_available: null, contract_term_years: term,
                note: 'No remaining-life horizon applies to this site — either its closure year ' +
                      'is unknown, or it is past the 25-year post-closure horizon and still ' +
                      'producing, which the model declines to turn into a number. A gas ' +
                      'generation forecast is the only thing that settles the term.'
            };
        }
        return {
            state: term === null ? 'no_term' : (horizon >= term ? 'covered' : 'short'),
            basis: 'horizon',
            /* DIRECTIONAL, ALWAYS, and this is the field the UI must not drop. A flat 25-year
               post-closure horizon is not a forecast of this site; it is a typical figure from
               EPA guidance applied to a closure year. */
            directional: true,
            as_of_year: year,
            years_available: horizon,
            contract_term_years: term,
            shortfall_years: (term === null || horizon >= term) ? null : term - horizon,
            basis_note: basisNote,
            note: 'Against a flat 25-year post-closure horizon, not a decline curve for this ' +
                  'site. It is enough to say whether a term is obviously unsupported; it cannot ' +
                  'tell you what the gas does in year twelve. The gas generation forecast at the ' +
                  'diligence gate is what replaces this.'
        };
    }

    return {
        PROBE_LO: PROBE_LO,
        PROBE_HI: PROBE_HI,
        FIT_TOLERANCE_KW: FIT_TOLERANCE_KW,
        gasFigure: gasFigure,
        studyOf: studyOf,
        recordStudy: recordStudy,
        marginalPerKw: marginalPerKw,
        assess: assess,
        staged: staged,
        termSupport: termSupport
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ProjectSizing;
