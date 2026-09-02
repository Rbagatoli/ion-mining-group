// Canadian landfill gas as a SourceAdapter.
//
// A SEPARATE ADAPTER FROM source-landfill.js ON PURPOSE. Both produce landfill_gas candidates
// into the same shape, and there the resemblance stops. The US adapter reads a pre-screened
// candidate list with published capacities and a project lifecycle; this reads an emissions
// register. Folding them together would mean one file pretending two very different datasets
// answer the same questions, and the place that would show is the fields neither can honestly
// fill for the other's rows.
//
// WHAT THIS LAYER IS FOR. Canada's Landfill Methane Regulations (SOR/2025-279) came into force
// on 12 December 2025 and oblige landfills over a methane-generation threshold to destroy their
// gas by a fixed date. That obliges an operator to spend money on gas destruction whether or not
// they want a project — and a partner who funds the plant turns that cost into a revenue line.
//
// The US adapter's best signal is a SHUTDOWN project: an asset already built and now idle. This
// dataset has no equivalent and never will, because ECCC does not track projects. The Canadian
// equivalent is the January 2029 cohort: over 1,000 t of methane a year, no gas recovery running
// when the Regulations landed, and a hard date. That is a forced buyer rather than a stranded
// asset, and it is a better conversation.
//
// Reads data/landfills-ca.json, built offline by tools/build-landfill-ca-index.js.
var LandfillCaSource = (function() {
    'use strict';

    var URL = './data/landfills-ca.json';
    var _data = null, _loading = null;

    // ECCC publishes the GHGRP annually, well after the reporting year. Polling it more often
    // than quarterly is asking a yearly dataset whether it has changed since Tuesday.
    var REFRESH_EVERY_DAYS = 90;

    // Same as the US landfill adapter, and for the same reason: decomposition runs continuously,
    // which is what makes landfill gas attractive against solar or wind. Not 100 — engines need
    // maintenance and collection fields get rebalanced as new cells open.
    var DUTY_CYCLE_PCT = 92;

    function load() {
        if (_data) return Promise.resolve(_data);
        if (_loading) return _loading;
        _loading = fetch(URL).then(function(res) {
            if (!res.ok) throw new Error('landfills-ca HTTP ' + res.status);
            return res.json();
        }).then(function(d) {
            if (!d || !Array.isArray(d.prospects)) throw new Error('malformed Canadian landfill index');
            _data = d;
            return d;
        }).catch(function(e) {
            _loading = null;
            throw e;
        });
        return _loading;
    }

    function fetchAll() { return load().then(function(d) { return d.prospects; }); }
    function meta() { return _data; }

    // ---- Development stage -------------------------------------------------------------
    //
    // ECCC publishes no project lifecycle, so this cannot be read the way LMOP's is. What CAN be
    // read, from the by-emission-source file, is whether a facility reports gas DESTRUCTION —
    // EC_FlaringEmissions or EC_CO2BiomassCombustion — which is impossible without collection.
    //
    // A flaring site therefore maps to 'permitted', NOT 'constructed'. The distinction is the
    // whole point: flaring proves wells, headers, a blower and an environmental approval exist.
    // It proves nothing about a generator, and 'constructed' in this model means the power asset
    // is standing. Claiming it would put a Canadian site with a flare level with a US shutdown
    // project that has an engine on a pad, which is not true and would be found out on the first
    // site visit.
    //
    // Everything else is 'raw_resource' — a fact about the source, not a shrug.
    function stageFor(p) {
        if (p.hasFlaring === true) return 'permitted';
        return 'raw_resource';
    }

    // Gas being destroyed is gas burned for compliance rather than sold — the clearest statement
    // an operator can make that the resource exists and earns nothing. Either way the gas is
    // uncommitted, which is what this field records, so both cases are none_merchant. One honest
    // constant rather than a branch that pretends to distinguish something.
    function offtakeFor() { return 'none_merchant'; }

    // Not inferred. A site with a flare holds SOME provincial approval, but whether it is current,
    // what it covers, and whether it would extend to a generator are exactly the questions, and a
    // guess here would put a number on the most valuable thing an acquisition inherits.
    function permitFor() { return null; }

    // ---- The regulatory obligation, as an acquirability signal -------------------------
    //
    // Dated to the day the Regulations came into force, not to today: the half-lives in
    // site-acquirability.js then age the signal from when the obligation actually began, so a
    // deadline that has been sitting there for three years reads as less urgent than a fresh one
    // — which is the honest reading. An operator who has known since 2025 and done nothing by
    // 2028 is either about to act or has found another answer.
    function distressFor(p) {
        var type = { jan_2029: 'lmr_jan_2029', jan_2028: 'lmr_jan_2028',
                     jan_2035: 'lmr_jan_2035' }[p.lmrCohort];
        if (!type) return [];
        return [{
            type: type,
            date: p.lmrInForce || '2025-12-12',
            source: 'Landfill Methane Regulations (SOR/2025-279)',
            detail: 'Compliance date ' + (p.lmrDeadline || 'not yet determined') +
                    '. ' + (p.lmrBasis || '') +
                    (p.hasExistingControls === false
                        ? ' No gas recovery system was in operation when the Regulations came ' +
                          'into force, so the operator must build one and has no collection ' +
                          'capital already committed.'
                        : '')
        }];
    }

    // Canadian landfills are overwhelmingly municipal or regional-authority owned, which is a
    // different counterparty from the US majors: slower, more procedural, and far less likely to
    // sell. It is also more likely to accept a partner who removes a capital line from a budget.
    var MUNICIPAL = /municipal|r[ée]gie|regional|district|county|city of|ville de|town of|MRC|comt[ée]|authority|commission|waste management (authority|commission)/i;
    var MAJOR = /waste connections|gfl environmental|waste management of canada|republic services|secure energy/i;
    function counterpartyFor(p) {
        var c = p.company || '';
        if (MAJOR.test(c) && !MUNICIPAL.test(c)) return 'landfill_major';
        if (MUNICIPAL.test(c)) return 'municipal';
        return null;
    }

    function normalize(p) {
        return {
            id: p.id,
            name: p.name,
            energyType: 'landfill_gas',
            // Published, in the by-emission-source file only — the JSON API behind the public
            // search carries no coordinates at all. Still null for anything the enrichment could
            // not match: no pin beats a plausible wrong one on a map people plan site visits
            // from, and a landfill is not at the centroid of the town it is named after.
            lat: p.lat,
            lng: p.lng,
            iso3: 'CAN',
            country: 'Canada',
            operator: p.company || null,
            operatorSource: p.company ? 'ECCC GHGRP reporting company' : null,
            powerPotentialKw: p.powerPotentialKw,
            // ECCC publishes no generation capacity of any kind. Explicitly null, not zero —
            // "no generator recorded" and "no data about generators" are different claims and
            // only one of them is true here.
            existingGenerationKw: null,
            dutyCyclePct: DUTY_CYCLE_PCT,
            firstSeen: p.series && p.series.length ? String(p.series[0].year) : null,
            lastSeen: p.reportingYear ? String(p.reportingYear) : null,
            trend: p.emissionsTrend,
            yearsSeen: p.series ? p.series.length : null,
            offshore: false,
            counterpartyType: counterpartyFor(p),
            developmentStage: stageFor(p),
            offtakeState: offtakeFor(p),
            permitState: permitFor(p),
            distressSignals: distressFor(p),
            // Siloxanes do not care which country the waste is in. Identical wording to the US
            // adapter deliberately: this is a property of landfill gas, and stating it two
            // different ways would imply the two are different problems.
            regulatoryNotes: 'Landfill gas carries siloxanes, which form silica deposits that ' +
                             'destroy engine components, plus moisture and hydrogen sulphide. ' +
                             'Gas treatment is mandatory, not optional, and its capital cost ' +
                             'belongs in any evaluation of this site. Landfill gas is also ~50% ' +
                             'methane at roughly half the energy per cubic foot of pipeline gas. ' +
                             'In Canada this site may also be subject to the Landfill Methane ' +
                             'Regulations (SOR/2025-279), which oblige methane destruction on a ' +
                             'statutory timetable.',
            evidence: [{
                dataset: 'ECCC Greenhouse Gas Reporting Program',
                year: p.reportingYear,
                field: 'CH4',
                value: (p.ch4Tonnes === null ? 'no methane reported'
                        : p.ch4Tonnes + ' t CH4 reported') +
                       (p.powerPotentialKw ? ' -> ' + p.powerPotentialKw + ' kW modelled' : '')
            }],
            sourceDetail: {
                ghgrpId: p.ghgrpId,
                npriId: p.npriId,
                province: p.province,
                city: p.city,
                naics: p.naics,
                reportingYear: p.reportingYear,
                current: p.current,
                ch4Tonnes: p.ch4Tonnes,
                co2eTonnes: p.co2eTonnes,
                methaneGenerationTonnes: p.methaneGenerationTonnes,
                methaneGenerationBasis: p.methaneGenerationBasis,
                emissionsTrend: p.emissionsTrend,
                emissionsSeries: p.series,
                // ---- Landfill Methane Regulations ----
                lmrCohort: p.lmrCohort,
                lmrDeadline: p.lmrDeadline,
                lmrBasis: p.lmrBasis,
                hasExistingControls: p.hasExistingControls,
                hasFlaring: p.hasFlaring,
                hasLandfillingEmissions: p.hasLandfillingEmissions,
                hasRegisteredOffsetProject: p.hasRegisteredOffsetProject === undefined
                    ? null : p.hasRegisteredOffsetProject,
                // Unchanged from the US adapter, and true of every landfill gas prospect
                // anywhere. site-capex.js gates the treatment capex on this exact field.
                requiresGasTreatment: true,
                /* THE NAMED PERSON. ECCC's registry publishes a public contact for 93 of the
                   156 facilities — name, position, direct telephone, email. This is the only
                   dataset in the entire system that contains what an outreach call actually
                   needs, and until this block it was read by nothing: shipped in the artifact,
                   dropped here, invisible on every screen. Passed through as published; null
                   for the 63 facilities ECCC lists none for, and absence is a statement
                   ("ECCC publishes no contact"), never a blank. */
                contactName: p.publicContact ? (p.publicContact.name || null) : null,
                contactTitle: p.publicContact ? (p.publicContact.position || null) : null,
                contactPhone: p.publicContact ? (p.publicContact.telephone || null) : null,
                contactEmail: p.publicContact ? (p.publicContact.email || null) : null
            },
            raw: null
        };
    }

    function computeCapacity(p) { return p.powerPotentialKw; }

    // Persistence means something different for a landfill than for a flare. A satellite either
    // saw a flare on a given night or did not; a landfill either filed a return for a year or did
    // not. Share of years reported is the closest honest analogue, and a site that has filed every
    // year since 2010 is a site that is still open and still making gas.
    function computePersistence(p) {
        if (!p.series || !p.series.length) return null;
        /* Span comes from the SERIES, not from the artifact's reportingYear. The artifact is only
           loaded in the browser, so reading it here returned null for every candidate under Node
           -- which is where the tests run, and which is why this looked correct and produced 156
           uncoloured pins. A facility's own first and last filing say the same thing and say it
           without a dependency. */
        var first = p.series[0].year, last = p.series[p.series.length - 1].year;
        var span = last - first + 1;
        if (!isFinite(span) || span <= 0) return null;
        var filed = Math.max(0, Math.min(100, Math.round(p.series.length / span * 100)));
        /* AN UNBROKEN RUN THAT ENDED IN 2015 IS NOT PERSISTENCE NOW. Filing completeness alone
           saturates -- most facilities file every year they file at all, so 140 of 156 came out
           at the top of the scale and the ramp was flat again in a new way. What separates them
           is whether the run reaches the present. `current` is set by the builder against the
           latest reporting year ECCC has published, so a site that stopped filing is halved:
           still evidence of a real landfill, no longer evidence it is still being measured. */
        return p.current === false ? Math.round(filed * 0.5) : filed;
    }

    function refreshSchedule() {
        return {
            everyDays: REFRESH_EVERY_DAYS,
            reason: 'ECCC publishes the GHGRP once a year, months after the reporting year closes'
        };
    }

    var adapter = {
        id: 'eccc-landfill-ca',
        label: 'Landfill gas (Canada, ECCC GHGRP)',
        energyType: 'landfill_gas',
        dutyCyclePct: DUTY_CYCLE_PCT,
        fetch: fetchAll,
        normalize: normalize,
        computeCapacity: computeCapacity,
        computePersistence: computePersistence,
        refreshSchedule: refreshSchedule,
        meta: meta,
        // exported for tests
        _stageFor: stageFor,
        _distressFor: distressFor,
        _counterpartyFor: counterpartyFor
    };

    /* Registered here, not in site-engine.js. The whole point of the SourceAdapter seam is that
       a new kind of energy is a new FILE plus this call -- tests/site-engine.test.js pins that
       with a deliberately non-flare fake source, and adding Canada must not be the thing that
       breaks the promise. unregister first so a hot reload does not stack duplicates. */
    if (typeof SiteSources !== 'undefined' && SiteSources && typeof SiteSources.register === 'function') {
        if (typeof SiteSources.unregister === 'function') SiteSources.unregister('eccc-landfill-ca');
        SiteSources.register(adapter);
    }

    return {
        adapter: adapter,
        load: load,
        meta: meta,
        normalize: normalize,
        stageFor: stageFor,
        distressFor: distressFor,
        counterpartyFor: counterpartyFor
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LandfillCaSource;
