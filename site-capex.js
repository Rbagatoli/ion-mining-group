// The capital stack — what you actually pay, and what you inherit by buying rather than building.
//
// The rest of this module RANKS the difference between developing a raw flare and acquiring a
// running plant. Nothing PRICED it. The Facility panel would tell you a plant already has a
// generator, permits and interconnection, and the Economics panel directly below priced it at
// `kW x $450/kW`, identically to a greenfield site. So the question the whole acquisition thesis
// rests on — "is buying this 2 MW plant for $1.5M better than developing a 2 MW flare?" — could
// not be answered in either direction.
//
// Two rules shape everything here:
//
//   1. NEVER emit an avoided-dollar figure as a property of a specific plant. There is no public
//      dataset that prices sub-5 MW generation asset sales, and pretending otherwise would be the
//      most expensive kind of invented number. Every figure is `your assumed rate x capacity`,
//      the rates are editable, and `avoided_usd` is labelled as what building it YOURSELF would
//      have cost at YOUR rates — a statement about the user's assumptions, not a valuation of the
//      seller's asset.
//
//   2. Unknown stays unknown. A component that cannot be priced returns null, names itself in
//      `unknown_ids`, and drags `coverage` down, exactly as site-opportunity.js drops a component
//      it cannot measure. A missing development_stage returns a null stack outright rather than
//      falling back to raw_resource — that is stageOf()'s rule, and it matters more here where
//      the consequence is dollars.
//
// This is a separate module rather than an extension of site-engine.js because
// tests/site-engine.test.js asserts the engine's code contains no domain vocabulary at all
// ('flare', 'solar', 'turbine', 'curtail', 'biogas'). Stage tables and a refurbishment curve are
// exactly the domain knowledge that test exists to keep out. The engine takes the finished stack
// as an optional argument and adds it up.
var SiteCapex = (function() {
    'use strict';

    // ---- Rates -------------------------------------------------------------------------
    // All editable. These are ASSUMPTIONS, and the UI must label them as such.
    var DEFAULT_RATES = {
        // Proton's own Alberta figure, kept WHOLE and unsplit. Its provenance is documented in
        // map-sourcing.js, and critically it has never included a generator: three of the four
        // quoted validation sites are generator_ownership 'producer'. It is the mining-side
        // buildout — pad, containers, transformer and switchgear for the mining load, comms,
        // install labour. Splitting it would destroy the audit trail on a real, quoted number.
        miningInfraPerKw: 450,

        // Containerised reciprocating gas genset, 1-2 MW class, installed. Real band is roughly
        // $700-1,200/kW. This is the single largest avoided item and the reason the old model was
        // wrong: at 2 MW it is $1.8M that an acquisition does not spend.
        generationPerKw: 900,

        // Deliberately NOT a utility interconnection-study figure. This business is
        // behind-the-meter and islanded; that is the premise. Covers step-up transformer,
        // protection, relay and breaker, which stays honest for a flare site where there is no
        // utility involved at all.
        interconnectionPerKw: 150,

        // FLAT, not per-kW. Permitting cost tracks process complexity, not megawatts — a 500 kW
        // and a 3 MW site file substantially the same air permit. A $/kW rate would price a
        // 200 kW site's permitting at a small fraction of reality, and putting a floor under a
        // $/kW rate is just a flat rate wearing a hat. $160,000 is the midpoint of the
        // $100-270K at-risk development spend this business has measured.
        permittingFlatUsd: 160000,

        // Startup, tuning, emissions testing, first fire, punch list.
        commissioningPerKw: 60,

        // Siloxane removal, moisture knockout, H2S scrubbing. APPLIED ONLY where the source
        // publishes requiresGasTreatment — a derived gate on a published fact, not a guess.
        gasTreatmentPerKw: 250,

        /* GAS COLLECTION: wells, headers, blower. $550/kW is the midpoint of a $300-800 range,
           which at 1-2 MW is the $800K-2.8M quoted for a collection system.
         *
         * IT LIVES HERE NOW, having been declared in site-infrastructure.js because this card
         * did not carry it. That split was defensible while only one module priced collection
         * and it stops being defensible the moment a budget reads both: an estimate that says
         * $550/kW and a rate card the user can edit to $700 would disagree silently, and the
         * disagreement would show up as a variance against a budget rather than as a bug.
         *
         * NOTE WHAT stack() STILL DOES NOT DO. Adding the rate here does not add a collection
         * COMPONENT to the stack -- a greenfield landfill is still never charged for the field
         * it would have to drill. That gap is real, it is older than this change, and closing it
         * moves every all-in figure in the app. It is filed, not fixed here. */
        collectionPerKw: 550
    };

    // What it costs to BUY the asset, per kW, by how far along it is.
    //
    // These five are the weakest-evidenced numbers in this module and the UI must say so loudest.
    // No public dataset prices sub-5 MW generation asset sales; there is no comp set. Their job
    // is to land the right order of magnitude so the user knows what to negotiate against, not to
    // be right. Every one is overridden the moment a real figure is entered.
    var DEFAULT_ACQUISITION_PER_KW = {
        // A gas purchase agreement, not an asset purchase. Zero here is a modelling statement
        // with a stated basis, matching site-acquirability.js's 'none_required' reasoning — not a
        // guess, and it must survive as 0 rather than being coerced to null.
        raw_resource: 0,
        permitted:  100,   // buying paper: real value in the permit, no steel
        constructed: 500,  // steel and permits, and a seller with a decommissioning liability
        energized:   900,  // connected and able to run, but no revenue history to underwrite
        operating:  1200   // running and permitted, below new-build genset cost because the
                           // sub-5 MW buyer pool is thin
    };

    // How much of each component a site at this stage ALREADY HAS, as a fraction in [0,1].
    // 1.0 = fully inherited (you pay nothing). 0 = you pay in full.
    //
    // Using fractions rather than a boolean is what lets refurbishment fold into the same
    // arithmetic instead of needing a special case: a shut plant retains a fraction of its
    // generator, and at retained 0 the model simply stops claiming it inherits one.
    var STAGE_RETAINED = {
        raw_resource: { permitting: 0,   generation: 0,   interconnection: 0,   gasTreatment: 0,   commissioning: 0 },
        permitted:    { permitting: 1,   generation: 0,   interconnection: 0,   gasTreatment: 0,   commissioning: 0 },
        // Built but not running. The steel and the grid tie are there; it does not restart itself,
        // so commissioning is still incurred in full.
        constructed:  { permitting: 1,   generation: 'refurb', interconnection: 1, gasTreatment: 'refurb', commissioning: 0 },
        energized:    { permitting: 1,   generation: 1,   interconnection: 1,   gasTreatment: 1,   commissioning: 1 },
        // Identical to energized. They differ in revenue certainty and offtake, not in capital,
        // and saying so avoids fake precision — that difference is already priced on the
        // opportunity and acquirability axes.
        operating:    { permitting: 1,   generation: 1,   interconnection: 1,   gasTreatment: 1,   commissioning: 1 }
    };

    // Condition of a shut asset, as a function of how long it has been shut. A proxy for TIME,
    // not for condition — a well-mothballed 1998 engine beats a rained-on 2019 one, and only a
    // site visit settles that. Where a real refurbishment figure is recorded it replaces this
    // entirely.
    var REFURB_RETAINED = [
        { maxYears: 2,    retained: 0.90 },   // mothballed: fluids, gaskets, batteries
        { maxYears: 5,    retained: 0.75 },   // seals and controls; same machine underneath
        { maxYears: 10,   retained: 0.50 },   // major overhaul; parts availability starts to bite
        { maxYears: 20,   retained: 0.20 },   // effectively a rebuild
        { maxYears: 1e9,  retained: 0.00 }    // a 1990 gas engine is scrap, and the permit it
                                              // held would not be re-issued for it today
    ];

    // Time from closing to first mined bitcoin. Ranges, because the honest input is a range and
    // collapsing it to a midpoint would manufacture precision.
    var MONTHS_TO_REVENUE = {
        raw_resource: { min: 12, max: 24 },   // permitting alone is 3-9 of it
        permitted:    { min: 8,  max: 14 },   // genset lead time is 6-9 months on its own
        constructed:  { min: 4,  max: 8 },    // recommission, refurbish, install the mining plant
        energized:    { min: 2,  max: 4 },
        operating:    { min: 2,  max: 4 }     // the plant running does not mine bitcoin; you
                                              // still build the mining side
    };

    /* Declared HERE, above DEFAULT_SETTINGS, because that object literal reads it.
       Declaring it further down hoists the var but not the assignment, so the setting
       silently initialised to undefined and the floor below never fired -- the whole
       change was inert and the numbers did not move. */
    var DEFAULT_BOP_RETAINED = 0.35;

    var DEFAULT_SETTINGS = {
        // Who owns the generator when the record does not say. 'producer' for raw resource is
        // Proton's actual deal structure and the reason $450/kW never included a genset; 'client'
        // from constructed onward, because acquiring a plant means acquiring its generator.
        /* WHO OWNS THE GENERATOR AT A RAW SITE.
         *
         * This defaulted to 'producer' -- the model of a flare deal where the gas owner brings
         * gensets and sells you power at a $/kWh that has their capital baked into it. That is
         * a real structure, but it is not the one this operator runs: they buy the engine and
         * build the pad themselves at a flare exactly as they would at a landfill.
         *
         * The default mattered more than a default should, because it silently gated FOUR
         * components at once -- generation equipment, interconnection, commissioning and gas
         * treatment all resolved to 'avoided'. A flare came out at $456/kW of site capital
         * against $1,910-2,160/kW for a landfill, which is not a real 4x advantage in the
         * ground; it is one assumption about who signs the cheque for the engine.
         *
         * Still a SETTING, and still overridable per record via generator_ownership, because
         * producer-owned flare deals do exist and this should price them when they do. */
        // The share of installed generation cost that is NOT the engine -- foundations,
        // enclosure, switchgear, controls, heat rejection -- and therefore does not age out with
        // the engine's shutdown date. Floors the refurb curve where a generator is documented on
        // site. See the note above refurbRetained().
        bopRetained: DEFAULT_BOP_RETAINED,
        ownGenerationRawResource: 'client',
        ownGenerationBuilt: 'client',
        // Ships UNSET. Inventing a cost of capital would be exactly the sin this module exists to
        // avoid, so carrying cost reports unknown until a real figure is entered.
        annualCostOfCapital: null
    };

    var STAGES = ['raw_resource', 'permitted', 'constructed', 'energized', 'operating'];

    var _rates = null, _acq = null, _settings = null;

    function copy(o) { var out = {}; for (var k in o) if (has(o, k)) out[k] = o[k]; return out; }
    function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

    function rates() { if (!_rates) _rates = copy(DEFAULT_RATES); return _rates; }
    function acquisitionRates() { if (!_acq) _acq = copy(DEFAULT_ACQUISITION_PER_KW); return _acq; }
    function settings() { if (!_settings) _settings = copy(DEFAULT_SETTINGS); return _settings; }

    function setRate(id, v) {
        var n = Number(v);
        if (!isFinite(n) || n < 0) return false;
        if (!has(DEFAULT_RATES, id)) return false;
        rates()[id] = n;
        return true;
    }
    function setAcquisitionRate(stage, v) {
        var n = Number(v);
        if (!isFinite(n) || n < 0) return false;
        if (!has(DEFAULT_ACQUISITION_PER_KW, stage)) return false;
        acquisitionRates()[stage] = n;
        return true;
    }
    function setSetting(key, v) {
        if (!has(DEFAULT_SETTINGS, key)) return false;
        settings()[key] = v;
        return true;
    }
    function reset() { _rates = null; _acq = null; _settings = null; }

    function num(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = Number(v);
        return isFinite(n) ? n : null;
    }

    // Reads both spellings, persisted record winning over adapter candidate, exactly as
    // SiteOpportunity.stageOf does.
    function pick(rec, snake, camel) {
        if (!rec) return null;
        var v = rec[snake];
        if (v === undefined || v === null) v = rec[camel];
        return v === undefined ? null : v;
    }

    function stageOf(rec) {
        if (typeof SiteOpportunity !== 'undefined' && SiteOpportunity.stageOf) {
            return SiteOpportunity.stageOf(rec);
        }
        var v = pick(rec, 'development_stage', 'developmentStage');
        if (v === null) return null;
        v = String(v).trim().toLowerCase();
        return STAGES.indexOf(v) >= 0 ? v : null;
    }

    // Years since a shut plant stopped, or null when no date is published.
    function yearsSinceShutdown(rec, asOf) {
        var sd = rec && rec.sourceDetail ? rec.sourceDetail : {};
        var d = sd.projectShutdownDate || pick(rec, 'shutdown_date', 'shutdownDate');
        if (!d) return null;
        var t = Date.parse(d);
        if (isNaN(t)) return null;
        var now = asOf ? Date.parse(asOf) : Date.now();
        if (isNaN(now)) return null;
        return Math.max(0, (now - t) / (365.25 * 24 * 3600 * 1000));
    }

    /* AN ENGINE AGES. THE CONCRETE IT BOLTS TO DOES NOT.
     *
     * REFURB_RETAINED prices a shut generator from its shutdown DATE, and at the bottom it
     * returns 0.00 -- "a 1990 gas engine is scrap". That is true of the machine and false of the
     * installation. `generation_equipment` at $900/kW is not an engine on a pallet; it is an
     * engine plus the foundation, the enclosure or building, the switchgear, the controls, the
     * exhaust and heat-rejection package and the gas train. When a project shuts down, the
     * engine corrodes and those do not.
     *
     * So the retained fraction gets a FLOOR whenever the source publishes that a generator of
     * adequate size is physically on the site. The engine may be worth nothing; the civils and
     * the electrical package it sits in are not, and a buyer replacing the engine in place is
     * not doing a greenfield build.
     *
     * WHAT THIS FIXES, measured on the real artifact before the change:
     *
     *   site-capex.js contained ZERO references to existingGenerationKw. Generation was priced
     *   from the date and nothing else, so 403 landfills with an engine on the pad rated at 90%
     *   or more of site capacity were charged the full $900/kW for a new one -- $762,679,395 in
     *   aggregate.
     *
     *   And because the table is a STEP, one birthday decided the answer. Constructed sites shut
     *   10-20 years were 100% capital-positive at a median $2,613/kW; the >20 year bucket was 1%
     *   positive at $2,843/kW. The 0.20 -> 0.00 step adds $230/kW and the break-even line sits at
     *   $2,731/kW, so it lands squarely across it. 149 of the 306 negative sites are on the far
     *   side of that one boundary.
     *
     * The floor is 0.35. Published cost breakdowns for reciprocating gas-engine plants put the
     * engine-generator package at roughly half to two-thirds of installed cost, with foundations,
     * building, switchgear, controls and heat rejection making up the rest. 0.35 is the
     * conservative end of "the rest", and it is a SETTING so it can be argued with.
     *
     * It applies only where a generator is actually documented. A site with no published
     * generation still prices a full greenfield build, which is correct -- there is nothing
     * standing there to inherit. */

    function generatorOnSite(rec, capacityKw) {
        var gen = num(pick(rec, 'existingGenerationKw', 'existing_generation_kw'));
        if (gen === null || gen <= 0) return false;
        // Adequate size, not merely present: a 200 kW engine on a 5 MW site is not a plant you
        // are inheriting, it is a component you would replace anyway.
        if (capacityKw && capacityKw > 0 && gen < capacityKw * 0.5) return false;
        return true;
    }

    function refurbRetained(years) {
        if (years === null) return null;      // unknown age -> unknown condition -> unknown cost
        for (var i = 0; i < REFURB_RETAINED.length; i++) {
            if (years <= REFURB_RETAINED[i].maxYears) return REFURB_RETAINED[i].retained;
        }
        return 0;
    }

    // Who owns the generation. This gate is what keeps the flare economics honest: Proton's real
    // Alberta deals price at ~$450/kW with the PRODUCER owning the genset, its cost sitting in
    // the $/kWh rather than in capital. Charging generation unconditionally would push a 2 MW
    // flare development from ~$900K to ~$3.1M and assert that Proton's actual deals are impossible.
    function generationOwnership(rec, stage) {
        var v = pick(rec, 'generator_ownership', 'generatorOwnership');
        if (v) return String(v).trim().toLowerCase();
        var s = settings();
        return stage === 'raw_resource' ? s.ownGenerationRawResource : s.ownGenerationBuilt;
    }

    // ---- The stack ---------------------------------------------------------------------
    // ctx: { capacityKw, minerCapexUsd, acquisitionUsd, asOf }
    function stack(rec, ctx) {
        ctx = ctx || {};
        var out = {
            components: [], incurred_usd: null, additional_usd: null, avoided_usd: null,
            avoided_components: [], unknown_ids: [], coverage: 0,
            months_to_revenue: null, stage: null, capacity_kw: null, capacity_basis: null
        };
        if (!rec || typeof rec !== 'object') { out.unknown_ids.push('prospect'); return out; }

        var stage = stageOf(rec);
        out.stage = stage;
        if (stage === null) {
            // Not recorded is not the same as raw_resource. Refusing to price is the correct
            // answer; guessing the earliest stage would systematically overstate development
            // cost and understate what an unrecorded facility already has.
            out.unknown_ids.push('development_stage');
            return out;
        }

        var kw = num(ctx.capacityKw);
        if (kw === null) kw = num(rec.powerPotentialKw);
        if (kw === null || kw <= 0) { out.unknown_ids.push('capacity'); return out; }
        out.capacity_kw = kw;
        out.capacity_basis = (rec.sourceDetail && rec.sourceDetail.capacityBasis) || null;

        var R = rates(), A = acquisitionRates(), S = settings();
        var retained = STAGE_RETAINED[stage];
        var years = yearsSinceShutdown(rec, ctx.asOf);
        var refurb = refurbRetained(years);

        var comps = [];
        function add(id, label, state, usd, basis, reason, extra) {
            var c = { id: id, label: label, state: state, usd: usd, basis: basis || null, reason: reason || null };
            for (var k in (extra || {})) c[k] = extra[k];
            comps.push(c);
            return c;
        }

        // Resolve a stage-retained component into one of the three states.
        function stageComponent(id, label, fullUsd, retainKey, basisText) {
            var r = retained[retainKey];
            if (r === 'refurb') {
                if (refurb === null) {
                    // Shut, but no shutdown date published -> condition unknown -> cost unknown.
                    add(id, label, 'unknown', null, null, 'no shutdown date published, so condition is unknown');
                    out.unknown_ids.push(id);
                    return;
                }
                r = refurb;
                /* The balance-of-plant floor -- see the note above refurbRetained(). Applied to
                   the GENERATION line only: the foundation, enclosure, switchgear and controls
                   survive an engine that does not. Gas treatment deliberately does NOT get it;
                   a siloxane skid is vessels and media, it has its own life, and giving it a
                   generator's floor would be the same category error in the other direction. */
                if (retainKey === 'generation' && hasGenerator && r < bopFloor) {
                    r = bopFloor;
                }
            }
            if (r >= 1) {
                add(id, label, 'avoided', 0, basisText, 'inherited at the ' + stage.replace(/_/g, ' ') + ' stage',
                    { avoided_usd: fullUsd });
                return;
            }
            var cost = fullUsd * (1 - r);
            var note = basisText;
            if (r > 0) {
                note = basisText + ' — ' + Math.round(r * 100) + '% retained, assumed condition ' +
                       (years === null ? '' : Math.round(years) + ' years since shutdown');
            }
            add(id, label, 'incurred', cost, note, null, r > 0 ? { avoided_usd: fullUsd * r, retained: r } : null);
        }

        var hasGenerator = generatorOnSite(rec, kw);
        var bopFloor = settings().bopRetained;

        // 1. Site acquisition. A real figure always wins; otherwise the stage default, clearly
        //    flagged as an assumption.
        var acqUsd = num(ctx.acquisitionUsd);
        if (acqUsd === null) acqUsd = num(pick(rec, 'estimated_acquisition_cost', 'estimatedAcquisitionCost'));
        var acqAssumed = false;
        if (acqUsd === null) {
            acqUsd = A[stage] * kw;       // 0 for raw_resource, and 0 is a real answer here
            acqAssumed = true;
        }
        add('site_acquisition', 'Site acquisition', 'incurred', acqUsd,
            acqAssumed ? ('assumed $' + A[stage] + '/kW for a ' + stage.replace(/_/g, ' ') + ' asset — ' +
                          'no public dataset prices sub-5 MW generation sales, so this is an ' +
                          'order-of-magnitude anchor to negotiate against')
                       : 'your figure',
            null, { assumed: acqAssumed });

        // 2. Permitting. Flat, and the biggest single thing a permitted asset inherits.
        stageComponent('permitting_development', 'Permitting & development',
            R.permittingFlatUsd, 'permitting', '$' + fmt(R.permittingFlatUsd) + ' flat');

        /* 3. GAS COLLECTION — the wellfield, headers, condensate knockout and blower that get
         *    the gas out of the ground and to the plant. Backlog item 3, and it was deferred on
         *    a blast-radius assumption that turned out not to hold.
         *
         *    THE STATE IS ASKED, NOT DERIVED. site-infrastructure.js already reads the published
         *    collection status off the source row and reconciles it against the statutory
         *    mandate, and it is the module the whole capital-avoided model is built on. Deriving
         *    a second answer here would give the app two views of whether a field is in the
         *    ground, and they would agree until an LMOP revision made them disagree. Same rule
         *    procurement.js follows in asking ProjectGates.permitIssued().
         *
         *    MANDATED IS AVOIDED, AND IT IS THE WHOLE THESIS. A site under a statutory deadline
         *    gets its collection system built by the OPERATOR whether or not you appear —
         *    site-infrastructure.js opens by saying exactly that. Charging it here would price
         *    away the single best reason to be early on those sites. Measured across the real
         *    catalogue: 37 mandated landfills, $17.0M of collection capital somebody else pays.
         *
         *    NOT LOADED IS UNKNOWN, NEVER ZERO, matching how ProjectContractors treats missing
         *    variations: a build priced without knowing whether it must drill a field is a
         *    confident number that is wrong by up to $550/kW.
         */
        var isLandfill = String(pick(rec, 'energy_type', 'energyType') || '') === 'landfill_gas';
        var collFull = R.collectionPerKw * kw;
        if (!isLandfill) {
            add('collection', 'Gas collection', 'avoided', 0, null,
                'flare gas arrives at a wellhead that already exists — there is no field to drill',
                { avoided_usd: 0 });
        } else if (typeof SiteInfrastructure === 'undefined' || !SiteInfrastructure.inventory) {
            add('collection', 'Gas collection', 'unknown', null, null,
                'the infrastructure model is not loaded, so whether a field is already in the ' +
                'ground cannot be read');
            out.unknown_ids.push('collection');
        } else {
            var coll = SiteInfrastructure.inventory(rec).collection;
            var built = (stage === 'constructed' || stage === 'energized' || stage === 'operating');
            if (coll === 'present') {
                add('collection', 'Gas collection', 'avoided', 0,
                    '$' + R.collectionPerKw + '/kW if you had to drill it',
                    'a collection system is already in the ground', { avoided_usd: collFull });
            } else if (coll === 'mandated') {
                add('collection', 'Gas collection', 'avoided', 0,
                    '$' + R.collectionPerKw + '/kW if you had to drill it',
                    'the operator is legally obliged to install collection by the statutory ' +
                    'deadline, so this capital is theirs and not yours',
                    { avoided_usd: collFull });
            } else if (coll === 'absent' && built) {
                /* A CONTRADICTION, REPORTED RATHER THAN RESOLVED. Three real rows are
                   `absent @ constructed`: a plant that is built cannot be burning gas nobody
                   collects, so one of the two facts is stale. Charging would bill a plant for a
                   field it must already have; calling it avoided would trust a stage over a
                   published field. Neither is known, so neither is claimed. */
                add('collection', 'Gas collection', 'unknown', null, null,
                    'the source says no collection system while the asset is recorded as ' +
                    stage.replace(/_/g, ' ') + ' — a built plant cannot burn gas nobody ' +
                    'collects, so one of the two is stale and the site row settles it');
                out.unknown_ids.push('collection');
            } else if (coll === 'absent') {
                add('collection', 'Gas collection', 'incurred', collFull,
                    '$' + R.collectionPerKw + '/kW — wells, headers, knockout and blower',
                    'no collection system published and no statutory deadline forcing one, so ' +
                    'this field is yours to drill');
            } else {
                /* 'shutdown' and 'unknown' both land here and both are genuinely unpriceable.
                   A shut wellfield is HDPE in the ground with silted wells, collapsed laterals
                   and failed condensate traps in some unknown proportion — and it deliberately
                   does NOT borrow the REFURB_RETAINED curve above, which was fitted to gas
                   ENGINES. Giving pipe an engine's decay rate is the same category error the
                   balance-of-plant floor exists to avoid, in the other direction. */
                add('collection', 'Gas collection', 'unknown', null, null,
                    coll === 'shutdown'
                        ? 'the field is in the ground but shut; wellfield condition is not ' +
                          'knowable from the published data and only a rework quote settles it'
                        : 'no collection status published for this site');
                out.unknown_ids.push('collection');
            }
        }

        // 4. Generation equipment, gated on who owns it.
        var own = generationOwnership(rec, stage);
        var genFull = R.generationPerKw * kw;
        if (own === 'producer' || own === 'operator') {
            add('generation_equipment', 'Generation equipment', 'avoided', 0,
                '$' + R.generationPerKw + '/kW if you bought it',
                'the ' + own + ' owns the generator — its cost sits in the $/kWh, not in your capital',
                { avoided_usd: genFull });
        } else {
            stageComponent('generation_equipment', 'Generation equipment', genFull, 'generation',
                '$' + R.generationPerKw + '/kW');
        }

        // 4. Interconnection — follows generation ownership.
        //
        // If the producer owns and operates the generator, they own its grid tie and its startup
        // too. Charging those to the miner produced $740/kW for a producer-owned flare against
        // Proton's real quoted ~$450/kW site cost, which would have asserted that the company's
        // actual deals are mispriced. The gate covers the whole generation asset, not just the
        // engine.
        var genOwnedByOther = (own === 'producer' || own === 'operator');
        if (genOwnedByOther) {
            add('interconnection', 'Interconnection', 'avoided', 0,
                '$' + R.interconnectionPerKw + '/kW if it were yours',
                'the ' + own + ' owns the generation asset, including its grid tie',
                { avoided_usd: R.interconnectionPerKw * kw });
        } else {
            stageComponent('interconnection', 'Interconnection', R.interconnectionPerKw * kw,
                'interconnection', '$' + R.interconnectionPerKw + '/kW');
        }

        // 5. Gas treatment — only where the source publishes that it is required.
        var needsTreatment = !!(rec.sourceDetail && rec.sourceDetail.requiresGasTreatment);
        if (needsTreatment) {
            stageComponent('gas_treatment', 'Gas treatment', R.gasTreatmentPerKw * kw,
                'gasTreatment', '$' + R.gasTreatmentPerKw + '/kW');
        } else {
            add('gas_treatment', 'Gas treatment', 'avoided', 0, null,
                rec.energyType === 'flare_gas'
                    ? 'not priced — sour gas would need treatment and H2S content is not knowable ' +
                      'from orbit, so record h2s_content before relying on this'
                    : 'no treatment requirement published for this source');
        }

        // 6. Commissioning — also follows generation ownership, for the same reason.
        if (genOwnedByOther) {
            add('commissioning', 'Commissioning', 'avoided', 0,
                '$' + R.commissioningPerKw + '/kW if it were yours',
                'the ' + own + ' commissions their own generation',
                { avoided_usd: R.commissioningPerKw * kw });
        } else {
            stageComponent('commissioning', 'Commissioning', R.commissioningPerKw * kw,
                'commissioning', '$' + R.commissioningPerKw + '/kW');
        }

        // 7. Mining infrastructure — incurred at EVERY stage. An operating plant has containers
        //    for nobody. This is the component the old flat "Build $/kW" conflated with the rest.
        add('mining_infrastructure', 'Mining infrastructure', 'incurred', R.miningInfraPerKw * kw,
            '$' + R.miningInfraPerKw + '/kW — pads, containers, transformer, switchgear, comms');

        // 8. Miners.
        var minerUsd = num(ctx.minerCapexUsd);
        if (minerUsd === null) {
            add('miners', 'Miners', 'unknown', null, null, 'miner count not supplied');
            out.unknown_ids.push('miners');
        } else {
            add('miners', 'Miners', 'incurred', minerUsd, 'from the miner configuration');
        }

        // 9. Carrying cost of capital during the dead period before first revenue.
        var mtr = MONTHS_TO_REVENUE[stage];
        /* THE CALLER'S RATE BEATS THE GLOBAL SETTING, because by the time a deal is a project the
           rate is a fact about that project rather than a house assumption. Every project record
           carries annual_cost_of_capital_pct as a required field; this module only ever had the
           one global number, so a project agreed at 11% was having its carrying cost priced at
           whatever the setting happened to say. Measured on a real 1,959 kW site: $289,444 at a
           6% setting against $530,647 at the project's own 11%, a $241,203 gap arriving as a
           favourable variance that does not exist.

           Absent, this reads exactly as before -- the setting, and unknown when that is unset. */
        var cocFromCtx = num(ctx.annualCostOfCapitalPct);
        var coc = cocFromCtx !== null ? cocFromCtx : num(S.annualCostOfCapital);
        if (coc === null) {
            add('carrying_cost', 'Carrying cost', 'unknown', null, null,
                'cost of capital not set — nothing is assumed for it');
            out.unknown_ids.push('carrying_cost');
        }

        // ---- Totals ---------------------------------------------------------------------
        var incurred = 0, avoided = 0, priced = 0;
        for (var i = 0; i < comps.length; i++) {
            var c = comps[i];
            if (c.state === 'incurred') { incurred += c.usd; priced++; }
            else if (c.state === 'avoided') { priced++; }
            if (c.avoided_usd) { avoided += c.avoided_usd; out.avoided_components.push(c.id); }
        }

        // Carrying cost is computed last because it applies to everything else.
        if (coc !== null) {
            var months = (mtr.min + mtr.max) / 2;
            var carry = incurred * (coc / 100) * (months / 12);
            add('carrying_cost', 'Carrying cost', 'incurred', carry,
                coc + '% annual on $' + fmt(Math.round(incurred)) + ' over ~' + Math.round(months) +
                ' months to first revenue' +
                // Named, because a budget line seeded from this basis is the thing a variance is
                // later measured against, and which rate it used is the whole question.
                (cocFromCtx !== null ? ", this project's own rate" : ''));
            incurred += carry;
            priced++;
        }

        out.components = comps;
        out.incurred_usd = incurred;
        /* ADDITIONAL means "capital the engine has not already counted", and there are TWO
         * things it has. Site acquisition was excluded here from the start, because
         * map-sourcing passes it separately as purchase_price_usd.
         *
         * Miners are the identical case and were not excluded. map-sourcing passes
         * ctx.minerCapexUsd into this stack, which prices a `miners` component into `incurred`;
         * site-engine.js then computes its OWN minerCapexUsd into total_capital, and
         * all_in_capital_usd sums total_capital + development_capex_usd. So every site in the
         * app was carrying one extra ASIC fleet.
         *
         * Measured on a 51.9 MW landfill: all-in read $183,067,680 against a true
         * $147,583,680 -- $35,484,000 of phantom capital, which is 14,785 miners at the
         * engine's own $2,400. That is 24% of the all-in figure, it inflated $/kW from $2,844
         * to $3,528, and it is most of the reason "to return capital" came out negative on
         * every source where the operator buys the plant.
         *
         * The miners component STAYS in components[] -- the breakdown should show what the
         * fleet costs. It just must not be added twice. */
        var minerCounted = (minerUsd === null) ? 0 : minerUsd;
        out.additional_usd = incurred - acqUsd - minerCounted;
        out.avoided_usd = avoided;
        out.coverage = comps.length ? Math.round(100 * priced / comps.length) : 0;
        out.months_to_revenue = { min: mtr.min, max: mtr.max, basis: stage.replace(/_/g, ' ') };
        out.acquisition_usd = acqUsd;
        out.acquisition_assumed = acqAssumed;
        out.years_since_shutdown = years;
        return out;
    }

    function fmt(n) { return Number(n).toLocaleString('en-US'); }

    return {
        stack: stack,
        stageOf: stageOf,
        refurbRetained: refurbRetained,
        yearsSinceShutdown: yearsSinceShutdown,
        generationOwnership: generationOwnership,
        rates: rates,
        setRate: setRate,
        acquisitionRates: acquisitionRates,
        setAcquisitionRate: setAcquisitionRate,
        settings: settings,
        setSetting: setSetting,
        reset: reset,
        STAGES: STAGES,
        STAGE_RETAINED: STAGE_RETAINED,
        REFURB_RETAINED: REFURB_RETAINED,
        MONTHS_TO_REVENUE: MONTHS_TO_REVENUE,
        DEFAULT_RATES: DEFAULT_RATES,
        DEFAULT_ACQUISITION_PER_KW: DEFAULT_ACQUISITION_PER_KW,
        DEFAULT_SETTINGS: DEFAULT_SETTINGS
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SiteCapex;
