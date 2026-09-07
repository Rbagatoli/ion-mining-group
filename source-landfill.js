// Landfill gas as a SourceAdapter.
//
// The third source, and the one that spans the whole development ladder in a single dataset:
// LMOP tracks landfill gas projects from candidate site through planned, constructed, operating
// and — most usefully — SHUTDOWN.
//
// A shutdown is a lead to investigate. The record does not establish why it stopped,
// which equipment remains, its condition, available gas rights or current permits.
//
// Reads data/landfills.json, built offline by tools/build-landfill-index.js.
var LandfillSource = (function() {
    'use strict';

    var URL = './data/landfills.json';
    var _data = null, _loading = null;

    // LMOP publishes two to three times a year. Polling it more often is pure waste.
    var REFRESH_EVERY_DAYS = 120;

    // Landfill gas is produced continuously by decomposition — that is what makes it attractive
    // against solar or wind. Not 100: gas engines need scheduled maintenance, and collection
    // systems are periodically rebalanced as new cells open.
    var DUTY_CYCLE_PCT = 92;
    var _recordCounts = Object.create(null);

    function load() {
        if (_data) return Promise.resolve(_data);
        if (_loading) return _loading;
        _loading = fetch(URL).then(function(res) {
            if (!res.ok) throw new Error('landfills HTTP ' + res.status);
            return res.json();
        }).then(function(d) {
            if (!d || !Array.isArray(d.projects)) throw new Error('malformed landfill index');
            _data = d;
            _recordCounts = Object.create(null);
            d.projects.forEach(function(p) { _recordCounts[p.id] = (_recordCounts[p.id] || 0) + 1; });
            return d;
        }).catch(function(e) {
            _loading = null;
            throw e;
        });
        return _loading;
    }

    function fetchAll() { return load().then(function(d) { return d.projects; }); }
    function meta() { return _data; }
    function sourcePeriod() { return (_data && _data.sourceReleaseDate) || '2024-09-04'; }

    function isShutdown(p) { return /shutdown/i.test(String(p.projectStatus || '')); }

    // Project status describes the energy project, not current gas-rights agreements.
    function offtakeFor() { return null; }

    function isElectricProject(p) {
        return /engine|turbine|electric|cogeneration|combined cycle|rankine|fuel cell|linear generator/i.test(String(p.projectType || ''));
    }
    function reportedGenerationKw(p) {
        if (!isElectricProject(p) || !/^(operational|shutdown)$/i.test(String(p.projectStatus || ''))) return null;
        var mw = p.ratedMw !== null && p.ratedMw !== undefined ? Number(p.ratedMw) : Number(p.actualMw);
        return Number.isFinite(mw) && mw > 0 ? Math.round(mw * 1000) : null;
    }

    // Permit state is deliberately NOT inferred here. A shutdown project almost certainly HELD an
    // air permit, but whether it is still active, lapsed or in renewal is exactly the question,
    // and guessing would put a number on the single most valuable thing an acquisition inherits.
    // The ECHO adapter fills this from the actual permit record.
    function permitFor() { return null; }

    function distressFor(p) {
        var out = [];
        if (isShutdown(p)) {
            out.push({
                type: 'lmop_shutdown',
                // Dated to the actual shutdown, so decay ages from when the project stopped. A
                // project shut last year is a far warmer lead than one shut in 1998, and the
                // dates in this dataset span 1975 to 2024.
                date: p.projectShutdownDate || null,
                source: 'EPA LMOP project database',
                detail: 'Landfill gas project shut down' +
                        (p.projectShutdownDate ? ' on ' + p.projectShutdownDate : ' (date not published)') +
                        (p.projectType ? ' — was a ' + String(p.projectType).toLowerCase() : '') +
                        '. Current equipment, condition, gas rights and interconnection must be checked separately.'
            });
        }
        // Flaring without an energy project is a research lead. Date it to the reported
        // measurement year; current flows, availability and contractual rights remain unknown.
        if (String(p.projectStatus || '').toLowerCase() === 'no project' &&
            p.lfgFlaredMmscfd > 0) {
            out.push({
                type: 'lmop_flaring_no_project',
                date: p.lfgFlaredYear ? String(p.lfgFlaredYear) + '-12-31' : sourcePeriod(),
                source: 'EPA LMOP landfill inventory',
                detail: 'Inventory reported ' + p.lfgFlaredMmscfd + ' mmscfd flared' +
                        (p.lfgFlaredYear ? ' in ' + p.lfgFlaredYear : ' (measurement year not published)') +
                        ' and no energy project. Confirm current operations and uncommitted gas.'
            });
        }
        return out;
    }

    function normalize(p) {
        return {
            sourceSnapshot: { dataset: 'EPA LMOP', artifactGenerated: _data && _data.generated || null,
                sourceUrl: _data && _data.sourceUrl || 'https://www.epa.gov/system/files/documents/2024-09/lmopdata.xlsx', reportingPeriod: sourcePeriod(), capacityBasis: p.capacityBasis || null },
            id: _recordCounts[p.id] > 1 && p.lfid ? p.id + '__lf_' + encodeURIComponent(p.lfid) : p.id,
            stableSourceRecordId: p.lfid ? 'lmop:landfill:' + p.lfid + ':project:' + p.id : null,
            // The landfill is the place; the project is what was built on it. Both matter, so the
            // display name carries the landfill and the project detail carries the rest.
            name: p.name,
            energyType: 'landfill_gas',
            lat: p.lat,
            lng: p.lon,
            iso3: 'USA',
            operator: p.owner || null,
            operatorSource: p.owner ? 'EPA LMOP landfill owner' : null,
            powerPotentialKw: p.powerPotentialKw,
            // An operational or shutdown electrical project reports historical generation.
            // Planned MW and RNG/direct-use throughput do not establish installed generators.
            existingGenerationKw: reportedGenerationKw(p),
            dutyCyclePct: DUTY_CYCLE_PCT,
            firstSeen: p.projectStartDate || (p.landfillOpenedYear ? String(p.landfillOpenedYear) : null),
            lastSeen: p.projectShutdownDate || null,
            offshore: false,
            counterpartyType: counterpartyFor(p),
            developmentStage: p.developmentStage,
            offtakeState: offtakeFor(p),
            permitState: permitFor(p),
            distressSignals: distressFor(p),
            // Landfill gas needs treatment before it can run an engine. This is not optional and
            // it is not cheap, so it is stated on every prospect rather than discovered later.
            regulatoryNotes: 'Obtain current gas analysis for methane, moisture, siloxanes and hydrogen sulphide. ' +
                             'Specify treatment, pressure and emissions controls for the selected engine. ' +
                             'A generic 50% methane assumption does not replace the reported composition or a current sample.',
            evidence: [{
                dataset: 'EPA Landfill Methane Outreach Program',
                year: p.lfgCollectedYear || Number(String(sourcePeriod()).slice(0, 4)),
                field: 'Reported project / gas evidence',
                value: (p.projectStatus || 'status not recorded') + '; collected gas ' + (p.lfgCollectedMmscfd == null ? 'not reported' : p.lfgCollectedMmscfd + ' mmscfd') + '; rated capacity ' + (p.ratedMw == null ? 'not reported' : p.ratedMw + ' MW')
            }],
            sourceDetail: {
                legacyRecordId: p.id,
                reportingPeriod: sourcePeriod(),
                infrastructureSourceUrl: _data && _data.infrastructureSource && _data.infrastructureSource.sourceUrl || 'https://www.epa.gov/system/files/documents/2024-09/landfilllmopdata.xlsx',
                lfgCollectedYear: p.lfgCollectedYear == null ? null : p.lfgCollectedYear,
                lfgFlaredYear: p.lfgFlaredYear == null ? null : p.lfgFlaredYear,
                methanePct: p.methanePct == null ? null : p.methanePct,
                wellCount: p.wellCount == null ? null : p.wellCount,
                flareCount: p.flareCount == null ? null : p.flareCount,
                gccsCapacityCfm: p.gccsCapacityCfm == null ? null : p.gccsCapacityCfm,
                flaresInPlace: p.flaresInPlace || null,
                inventoryCollectionSystem: p.inventoryCollectionSystem || null,
                landfillOperator: p.landfillOperator || null,
                currentAreaAcres: p.currentAreaAcres == null ? null : p.currentAreaAcres,
                wasteInPlaceYear: p.wasteInPlaceYear == null ? null : p.wasteInPlaceYear,
                lfgGeneratedMmscfd: p.lfgGeneratedMmscfd == null ? null : p.lfgGeneratedMmscfd,
                dutyBasis: 'declared',
                generationEvidence: reportedGenerationKw(p) === null ? 'not established' : (isShutdown(p) ? 'historical shutdown project' : 'reported operational project'),
                sharedProjectRecord: _recordCounts[p.id] > 1,
                // How much longer the waste keeps making gas. Decomposition peaks around closure
                // and decays over roughly 20-30 years, so a site still ACCEPTING waste is
                // replenishing its own fuel and gets the full horizon; a closed one gets what is
                // left of it. Stated as a horizon with its basis, never as a precise figure --
                // the real curve depends on moisture, cover and waste composition, none of which
                // LMOP publishes.
                estimatedRemainingYears: remainingYears(p),
                estimatedRemainingBasis: remainingBasis(p),
                projectName: p.projectName,
                projectStatus: p.projectStatus,
                projectType: p.projectType,
                capacityBasis: p.capacityBasis,
                ratedMw: p.ratedMw,
                actualMw: p.actualMw,
                lfgCollectedMmscfd: p.lfgCollectedMmscfd,
                // Gas being flared is gas burned for nothing — the clearest sign that energy is
                // available right now, whatever the project status says.
                lfgFlaredMmscfd: p.lfgFlaredMmscfd,
                lfgFlowToProjectMmscfd: p.lfgFlowToProjectMmscfd,
                wasteInPlaceTons: p.wasteInPlaceTons,
                collectionSystem: p.collectionSystem,
                landfillStatus: p.landfillStatus,
                landfillOpenedYear: p.landfillOpenedYear,
                landfillClosureYear: p.landfillClosureYear,
                projectStartDate: p.projectStartDate,
                projectShutdownDate: p.projectShutdownDate,
                owner: p.owner,
                ownershipType: p.ownershipType,
                state: p.state,
                county: p.county,
                city: p.city,
                address: p.address,
                // 1,897 of 1,908 rows carry a postcode. It was read from EPA, written to the
                // artifact, shipped in the 1.5 MB payload -- and then dropped right here, because
                // this list omitted one line. TWO consumers were already written to use it and
                // degraded in silence: the contact panel's address block, and the outreach CSV's
                // site_address column, which is the column that exists FOR a mail merge. Every
                // landfill address it exported was undeliverable.
                zip: p.zip,
                // Carried since the adapter was written and read by nothing until now.
                lfid: p.lfid,
                ghgrpId: p.ghgrpId,
                requiresGasTreatment: true
            },
            raw: null
        };
    }

    // The national waste consolidators, told apart from everyone else by TWO independent
    // signals that must agree: the owner name, and LMOP's own ownershipType.
    //
    // The name alone is not safe, and this is the SAND POINT trap in miniature -- matching
    // /waste management/ picks up "Napa-Vallejo Waste Management Authority", "Lancaster County
    // Solid Waste Management Authority" and six more municipal bodies, and would score the very
    // counterparty this module rates highest at 45 instead of 85. Eight false positives out of
    // 447 is not a tuning problem, it is the wrong kind of match.
    //
    // Requiring ownershipType === Private kills them structurally rather than by adding more
    // words to a regex. Measured: 447 by name, 407 once both signals must agree.
    var MAJOR_NAME = /waste management|republic services|waste connections|gfl environmental|advanced disposal|casella/i;

    // The regex above missed the largest counterparty in the dataset. LMOP does not write "Waste
    // Management" any more -- it writes the rebranded "WM", on 374 of 1,908 rows, MORE than
    // Republic Services' 284. Every one of them was scoring as an ordinary private operator.
    //
    // "WM" is two letters and cannot go in the substring regex. Measured, a /wm/i substring also
    // matches nine municipal bodies -- Brazos Valley SWMA, Chemung County SWMD, Black Hawk County
    // SWM Commission, and every "Solid Waste Management Authority" -- which is precisely the
    // false-positive class the two-signal rule exists to prevent, arriving through the front door.
    //
    // So it is an EXACT full-string match, which is safe at any length. Verified against the
    // artifact: "WM" occurs as that exact string and in no other form, so this needs no variants.
    // The joint holdings like "City of Fitchburg, MA; WM" deliberately do NOT match -- a landfill
    // a city co-owns is not a pure major, and MUNICIPAL_NAME would veto it regardless.
    var MAJOR_EXACT = { 'wm': 1 };
    var MUNICIPAL_NAME = /authority|district|county|city of|commission|township|borough|parish|municipal|state of/i;
    /* PERSISTENCE FOR A LANDFILL, WHICH THIS ADAPTER NEVER SUPPLIED.
     *
     * Without it every LMOP candidate carried persistencePct: null, and the map's colour ramp --
     * which had no other input it could use for this source -- painted all 1,908 of them the
     * same shade. The scale existed and told you nothing.
     *
     * For a flare, persistence is the share of survey years a satellite saw it burning. A
     * landfill has no such series, so the honest analogue is confidence the gas is still
     * flowing, and it is read in the order the rest of this codebase reads things:
     *
     *   MEASURED FIRST. A published collection or flare rate means gas is moving TODAY, whatever
     *   the closure year says. Kingsland closed in 1988 and still flares 1.13 mmscfd.
     *   THEN STATUS. A site still accepting waste is adding fuel faster than it decays.
     *   THEN THE MODEL. Remaining years against the decay horizon.
     *   THEN NOTHING. null, so the ramp shows unmeasured as unmeasured. */
    function computePersistence(p) {
        var flow = p.lfgCollectedMmscfd || p.lfgFlaredMmscfd || p.lfgFlowToProjectMmscfd;
        var measured = flow !== null && flow !== undefined && isFinite(flow) && flow > 0;
        var open = /open/i.test(p.landfillStatus || '');

        /* MEASURED FLOW FLOORS THIS, IT DOES NOT SATURATE IT. Returning 100 for anything with a
           published gas rate was the first version, and it was true as a statement and useless as
           a scale: 1,899 of 1,908 rows carry a rate, so the ramp went from one flat colour to a
           different one flat colour. A landfill's gas is nearly always still flowing; what varies
           -- and what a buyer actually needs -- is how much LONGER, so the grade comes from the
           decay horizon and measurement lifts the floor rather than pinning the top. */
        var left = remainingYears(p);
        var graded = (left === null || !isFinite(left))
            ? null
            : Math.max(0, Math.min(100, Math.round(left / LFG_DECAY_YEARS * 100)));

        if (graded === null) {
            // Past the modelled horizon or no closure year. Measurement is then the only thing
            // that speaks, and it says "still producing" without saying for how long.
            if (measured) return 70;
            if (open) return 85;
            return null;
        }
        if (measured) return Math.max(graded, 55);
        if (open) return Math.max(graded, 50);
        return graded;
    }

    function counterpartyFor(p) {
        var owner = p.owner || '';
        // hasOwnProperty, not MAJOR_EXACT[key] -- an owner named "constructor" or "toString"
        // would otherwise resolve up Object.prototype to a function and test as truthy.
        var exact = Object.prototype.hasOwnProperty.call(
            MAJOR_EXACT, String(owner).trim().toLowerCase());
        if ((exact || MAJOR_NAME.test(owner)) && !MUNICIPAL_NAME.test(owner) &&
            /private/i.test(p.ownershipType || '')) {
            return 'landfill_major';
        }
        // Otherwise LMOP's own public/private split, which the artifact already carries.
        return p.counterpartyType || null;
    }

    // Generation life left in the waste. LMOP publishes the closure year and the tonnage; the
    // decay curve is not published by anyone, so this is a horizon, not a forecast.
    var LFG_DECAY_YEARS = 25;      // typical useful life after closure, EPA LMOP guidance range 20-30
    // Is gas measurably coming out of this landfill TODAY? Any of the three published flows being
    // above zero settles it. Order is the artifact's own preference: flow to the project is the
    // most specific, then collected, then flared.
    function measuredGasMmscfd(p) {
        var v = [p.lfgFlowToProjectMmscfd, p.lfgCollectedMmscfd, p.lfgFlaredMmscfd];
        for (var i = 0; i < v.length; i++) {
            if (v[i] !== null && v[i] !== undefined && v[i] > 0) return v[i];
        }
        return null;
    }

    function remainingYears(p) {
        if (!p.landfillClosureYear) return null;
        // Still open: the clock has not started. Fuel is being added faster than it decays.
        if (/open/i.test(p.landfillStatus || '')) return LFG_DECAY_YEARS;
        var since = new Date().getFullYear() - p.landfillClosureYear;
        if (!isFinite(since)) return null;
        var left = LFG_DECAY_YEARS - since;
        if (left > 0) return left;

        // Past the modelled horizon — and this is where the first version was wrong. It returned
        // 0, which put 90 of the 336 shortlist sites at "no fuel left". Measured against the
        // artifact, 88 of those 90 are STILL COLLECTING GAS. Kingsland Landfill closed in 1988,
        // is thirteen years past the horizon, and flares 1.13 mmscfd today — roughly 2.3 MW being
        // burned for nothing, which is the single best prospect in the dataset, not a dead one.
        //
        // 0 is a measurement claim: it says the gas is gone. Returning it while the meter reads
        // otherwise breaks the rule the whole codebase runs on — measured beats modelled, and
        // null means unmeasured rather than zero. So the horizon yields to the meter here.
        //
        // The real fix is a decline curve fitted to reported gas over time, which needs a
        // multi-year series this artifact does not carry. Until then, saying "the model does not
        // know" is the honest answer, and remainingBasis() gives the reader the measured rate to
        // judge for themselves.
        return measuredGasMmscfd(p) !== null ? null : 0;
    }
    function remainingBasis(p) {
        if (!p.landfillClosureYear) return null;
        if (/open/i.test(p.landfillStatus || '')) {
            return 'still accepting waste, so the ' + LFG_DECAY_YEARS +
                   '-year post-closure horizon has not started';
        }
        var since = new Date().getFullYear() - p.landfillClosureYear;
        var measured = measuredGasMmscfd(p);
        // Past the horizon but still producing. The reader gets the contradiction stated outright
        // rather than a number that hides it — and the measured rate, which is the fact that
        // actually decides whether there is a deal here.
        if (isFinite(since) && (LFG_DECAY_YEARS - since) <= 0 && measured !== null) {
            return 'closed ' + p.landfillClosureYear + ', ' + (since - LFG_DECAY_YEARS) +
                   ' years past the typical ' + LFG_DECAY_YEARS + '-year post-closure horizon — ' +
                   'but still producing ' + measured + ' mmscfd, so the horizon does not apply ' +
                   'here and no remaining-life estimate is offered';
        }
        return 'closed ' + p.landfillClosureYear + ', against a typical ' + LFG_DECAY_YEARS +
               '-year post-closure horizon';
    }

    function computeCapacity(p) {
        return p && p.powerPotentialKw !== null && p.powerPotentialKw !== undefined
            ? p.powerPotentialKw : null;
    }

    function refreshSchedule() {
        return {
            everyDays: REFRESH_EVERY_DAYS,
            reason: 'EPA publishes the LMOP database two to three times a year.'
        };
    }

    var adapter = {
        id: 'lmop-landfill',
        label: 'Landfill gas (EPA LMOP)',
        energyType: 'landfill_gas',
        // Duty cycle IS safe as an adapter-level default: landfill gas is continuous regardless of
        // which project sits on top of it. developmentStage, offtakeState and counterpartyType are
        // deliberately absent here and set per-candidate, because they differ project by project —
        // a shutdown project and an operating one on the same dataset are not at the same stage.
        dutyCyclePct: DUTY_CYCLE_PCT,
        fetch: fetchAll,
        normalize: normalize,
        computeCapacity: computeCapacity,
        computePersistence: computePersistence,
        refreshSchedule: refreshSchedule
    };

    if (typeof SiteSources !== 'undefined' && SiteSources && typeof SiteSources.register === 'function') {
        if (typeof SiteSources.unregister === 'function') SiteSources.unregister('lmop-landfill');
        SiteSources.register(adapter);
    }

    return {
        adapter: adapter,
        load: load,
        meta: meta,
        offtakeFor: offtakeFor,
        distressFor: distressFor,
        isShutdown: isShutdown
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LandfillSource;
