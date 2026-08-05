// Landfill gas as a SourceAdapter.
//
// The third source, and the one that spans the whole development ladder in a single dataset:
// LMOP tracks landfill gas projects from candidate site through planned, constructed, operating
// and — most usefully — SHUTDOWN.
//
// A shutdown project is the most acquirable class of asset in this module. The waste is still
// decomposing and still producing gas, the collection system is in the ground, the generator was
// installed, the interconnection was made and the air permit was issued. Then the project stopped,
// almost always because the power offtake stopped being economic — which is precisely the
// situation where a buyer who wants continuous on-site power rather than an export contract is
// solving the owner's problem rather than competing for a prize.
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

    function load() {
        if (_data) return Promise.resolve(_data);
        if (_loading) return _loading;
        _loading = fetch(URL).then(function(res) {
            if (!res.ok) throw new Error('landfills HTTP ' + res.status);
            return res.json();
        }).then(function(d) {
            if (!d || !Array.isArray(d.projects)) throw new Error('malformed landfill index');
            _data = d;
            return d;
        }).catch(function(e) {
            _loading = null;
            throw e;
        });
        return _loading;
    }

    function fetchAll() { return load().then(function(d) { return d.projects; }); }
    function meta() { return _data; }

    function isShutdown(p) { return /shutdown/i.test(String(p.projectStatus || '')); }

    // What the gas is committed to.
    //
    // A shutdown project's offtake is by definition over — whatever contract existed ended when
    // the project stopped, which is what makes the gas available again. A candidate landfill's
    // gas was never committed to anyone. An OPERATING project is the one case we genuinely cannot
    // read: it is selling power to someone under terms EPA does not publish, so it returns null
    // and scores as unknown rather than being guessed at.
    function offtakeFor(p) {
        if (isShutdown(p)) return 'expired';
        var s = String(p.projectStatus || '').toLowerCase();
        if (s === 'candidate' || s === 'future potential' || s === 'low potential') return 'none_merchant';
        return null;
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
                        '. Gas collection and interconnection remain in place.'
            });
        }
        return out;
    }

    function normalize(p) {
        return {
            id: p.id,
            // The landfill is the place; the project is what was built on it. Both matter, so the
            // display name carries the landfill and the project detail carries the rest.
            name: p.name,
            energyType: 'landfill_gas',
            lat: p.lat,
            lng: p.lon,
            iso3: 'USA',
            powerPotentialKw: p.powerPotentialKw,
            dutyCyclePct: DUTY_CYCLE_PCT,
            firstSeen: p.projectStartDate || (p.landfillOpenedYear ? String(p.landfillOpenedYear) : null),
            lastSeen: p.projectShutdownDate || null,
            offshore: false,
            counterpartyType: p.counterpartyType,
            developmentStage: p.developmentStage,
            offtakeState: offtakeFor(p),
            permitState: permitFor(p),
            distressSignals: distressFor(p),
            // Landfill gas needs treatment before it can run an engine. This is not optional and
            // it is not cheap, so it is stated on every prospect rather than discovered later.
            regulatoryNotes: 'Landfill gas carries siloxanes, which form silica deposits that ' +
                             'destroy engine components, plus moisture and hydrogen sulphide. ' +
                             'Gas treatment is mandatory, not optional, and its capital cost ' +
                             'belongs in any evaluation of this site. Landfill gas is also ~50% ' +
                             'methane at roughly half the energy per cubic foot of pipeline gas.',
            evidence: [{
                dataset: 'EPA Landfill Methane Outreach Program',
                year: _data ? Number(String(_data.generated).slice(0, 4)) : null,
                field: p.capacityBasis,
                value: Math.round(p.powerPotentialKw) + ' kW from ' + (p.capacityBasis || 'published data')
            }],
            sourceDetail: {
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
                ghgrpId: p.ghgrpId,
                requiresGasTreatment: true
            },
            raw: null
        };
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
