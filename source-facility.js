// US generating facilities as a SourceAdapter.
//
// The first source that is NOT raw resource. A flare is gas with no generator, no interconnection
// and no permit; these are plants already producing and selling power, where an acquisition
// inherits the permits, the grid connection, the fuel supply and the commissioning. That is the
// whole point of the second source, and it is why development_stage carries 25% of the
// opportunity score — until now every prospect scored the same 20 there.
//
// Reads data/facilities.json, built offline by tools/build-facility-index.js from EIA-860 and
// EIA-923. Registration is side-effecting on load, matching the rest of the codebase.
var FacilitySource = (function() {
    'use strict';

    var URL = './data/facilities.json';
    var _data = null, _loading = null;

    // EIA-860 is annual; EIA-923 monthly data trails by months for monthly filers and about a
    // year for annual ones. Refreshing more often than quarterly would re-download 45 MB to
    // learn nothing.
    var REFRESH_EVERY_DAYS = 90;

    // Generator status -> how far along the asset is. EIA reports the STATUS of the equipment,
    // which maps onto development stage directly and is not an inference.
    var STAGE_BY_STATUS = {
        OP: 'operating',       // in commercial operation
        SB: 'energized',       // standby: connected and able to run, but not running
        OS: 'constructed',     // out of service — the plant exists, it is not currently usable
        OA: 'constructed',
        TS: 'constructed',     // built but not yet in commercial operation
        RE: 'constructed',     // retired: the physical plant and its interconnection remain
        CN: 'permitted'        // cancelled before completion
    };

    // Prime mover -> whether the plant can run around the clock. This drives duty cycle, which
    // feeds effective capacity, which is what stops a 2 MW solar farm being compared with a 2 MW
    // landfill-gas engine as though they were the same asset.
    //
    // These are the plant's OWN measured capacity factors where available; the table is only the
    // fallback for a plant with no usable generation history.
    var TYPICAL_DUTY = {
        'Solar Photovoltaic': 25,
        'Onshore Wind Turbine': 35,
        'Offshore Wind Turbine': 45,
        'Conventional Hydroelectric': 40,
        'Batteries': 15
    };

    function load() {
        if (_data) return Promise.resolve(_data);
        if (_loading) return _loading;
        _loading = fetch(URL).then(function(res) {
            if (!res.ok) throw new Error('facilities HTTP ' + res.status);
            return res.json();
        }).then(function(d) {
            if (!d || !Array.isArray(d.facilities)) throw new Error('malformed facility index');
            _data = d;
            return d;
        }).catch(function(e) {
            _loading = null;
            throw e;
        });
        return _loading;
    }

    function fetchAll() {
        // The permit index is loaded alongside, not before: it is optional enrichment and a
        // missing or failed load must leave permit state unknown rather than block discovery.
        var permits = (typeof PermitIndex !== 'undefined' && PermitIndex.load)
            ? PermitIndex.load().catch(function() { return null; })
            : Promise.resolve(null);
        return Promise.all([load(), permits]).then(function(r) { return r[0].facilities; });
    }

    function meta() { return _data; }

    // Duty cycle from the plant's OWN measured output where it has a usable history, because a
    // measurement always beats a table. A plant that has run at 8% is an 8% plant regardless of
    // what its technology usually achieves.
    function dutyFor(f) {
        var cf = f.cfCurrent;
        if (cf === null || cf === undefined) cf = f.cfBaseline;
        if (cf !== null && cf !== undefined && cf > 0) {
            return Math.max(1, Math.min(100, Math.round(cf * 100)));
        }
        if (f.technology && Object.prototype.hasOwnProperty.call(TYPICAL_DUTY, f.technology)) {
            return TYPICAL_DUTY[f.technology];
        }
        return null;    // unknown, NOT assumed to be 100
    }

    // Which of the three branches above produced the number. Stamped explicitly rather than
    // re-derived downstream: site-sources.js normalize() coerces a null duty to 100, so by the
    // time a consumer sees the candidate, "unmeasured" and "runs continuously" are the same
    // value. SiteAvailability reads this to decide whether the duty may carry a dollar figure.
    //
    // Measured against data/facilities.json: 8,398 measured, 1,027 typical, 340 unknown.
    function dutyBasisFor(f) {
        var cf = f.cfCurrent;
        if (cf === null || cf === undefined) cf = f.cfBaseline;
        if (cf !== null && cf !== undefined && cf > 0) return 'measured';
        if (f.technology && Object.prototype.hasOwnProperty.call(TYPICAL_DUTY, f.technology)) {
            return 'typical';
        }
        return 'unknown';
    }

    // Counterparty from the EIA sector. Who you would actually be negotiating with, and how long
    // that is likely to take.
    function counterpartyFor(f) {
        var s = String(f.sector || '').toLowerCase();
        if (s.indexOf('iou') >= 0 || s.indexOf('electric utility') >= 0) return 'utility';
        if (s.indexOf('ipp') >= 0 || s.indexOf('independent') >= 0) return 'independent_power';
        if (s.indexOf('commercial') >= 0 || s.indexOf('industrial') >= 0) return 'independent_power';
        return null;
    }

    // What the output is committed to. EIA does not publish contracts, so this reads the sector,
    // which is the strongest honest proxy: a rate-based utility plant is not for sale in any
    // normal sense, while a merchant IPP sells into a market and can redirect load.
    function offtakeFor(f) {
        var s = String(f.sector || '').toLowerCase();
        if (s.indexOf('electric utility') >= 0) return 'regulated_ratebase';
        if (s.indexOf('ipp') >= 0 || s.indexOf('independent') >= 0) return 'none_merchant';
        if (s.indexOf('commercial') >= 0 || s.indexOf('industrial') >= 0) return 'none_merchant';
        return null;    // unknown, and scored as unknown rather than guessed
    }

    // Distress signals the EIA data supports directly. Each carries the dataset it came from, so
    // the timeline can say where a claim originated rather than asserting it flatly.
    function distressFor(f) {
        var out = [];
        var asOf = (_data && _data.generated) || null;

        if (f.isDecline) {
            out.push({
                type: 'capacity_factor_decline',
                // Dated to the last month of DATA, not to the build date: the evidence is as old
                // as the measurement, and decay must age from when it was true.
                date: f.lastDataMonth ? f.lastDataMonth + '-01' : asOf,
                source: 'EIA-923 monthly generation',
                detail: 'Capacity factor ' + Math.round(f.cfBaseline * 100) + '% to ' +
                        Math.round(f.cfCurrent * 100) + '% (' + Math.round(f.declinePct * 100) +
                        '% down), ' + f.monthsDown + ' of ' + f.monthsCompared +
                        ' months lower year-over-year'
            });
        }
        if (f.status === 'SB' || f.status === 'OS' || f.status === 'OA') {
            out.push({
                type: 'eia860_standby_or_retirement',
                date: _data ? (_data.eia860Year + '-12-31') : asOf,
                source: 'EIA-860 generator status',
                detail: 'Generator status reported as ' + (f.statusLabel || f.status)
            });
        }
        if (f.plannedRetirementYear !== null && f.plannedRetirementYear !== undefined) {
            out.push({
                type: 'eia860_standby_or_retirement',
                date: _data ? (_data.eia860Year + '-12-31') : asOf,
                source: 'EIA-860 planned retirement',
                detail: 'Retirement planned for ' + f.plannedRetirementYear
            });
        }
        return out;
    }

    function normalize(f) {
        var duty = dutyFor(f);
        var permit = (typeof PermitIndex !== 'undefined' && PermitIndex.forPlant)
            ? PermitIndex.forPlant(f.plantCode) : null;
        var stage = (f.status && Object.prototype.hasOwnProperty.call(STAGE_BY_STATUS, f.status))
            ? STAGE_BY_STATUS[f.status] : null;

        return {
            id: f.id,
            name: f.name,
            energyType: 'grid_facility',
            lat: f.lat,
            lng: f.lon,
            iso3: 'USA',
            // EIA-860 names the utility for all 9,765 plants. normalize() used to drop it, so
            // every facility displayed as "operator not identified".
            operator: f.operator || null,
            operatorSource: f.operator ? 'EIA-860 utility of record' : null,
            // Nameplate in kW. Effective capacity is nameplate x duty cycle, applied downstream
            // by site-opportunity.js, so this stays the honest nameplate figure.
            powerPotentialKw: f.nameplateMw === null ? null : Math.round(f.nameplateMw * 1000),
            dutyCyclePct: duty,
            // The plant's own measured record, expressed on the shared persistence scale.
            persistencePct: f.cfBaseline === null || f.cfBaseline === undefined
                ? null : Math.round(f.cfBaseline * 100),
            firstSeen: f.inServiceYear ? String(f.inServiceYear) : null,
            lastSeen: f.lastDataMonth || null,
            offshore: false,
            counterpartyType: counterpartyFor(f),
            developmentStage: stage,
            offtakeState: offtakeFor(f),
            // From the ECHO air permit record where an EXACT registry-id match exists, and null
            // otherwise. Null means NOT VERIFIED, not unpermitted — EPA holds more than one
            // registry id for many sites, so the exact join reaches a minority of plants.
            permitState: permit ? permit.permitState : null,
            distressSignals: distressFor(f).concat(
                (typeof PermitIndex !== 'undefined' && PermitIndex.distressFor)
                    ? PermitIndex.distressFor(f.plantCode) : []),
            regulatoryNotes: null,
            evidence: [{
                dataset: 'EIA-860 / EIA-923',
                year: _data ? _data.eia860Year : null,
                field: 'nameplate capacity, generator status, monthly net generation',
                value: f.nameplateMw + ' MW ' + (f.technology || 'generation') +
                       ', plant code ' + f.plantCode
            }],
            sourceDetail: {
                plantCode: f.plantCode,
                technology: f.technology,
                primeMover: f.primeMover,
                sector: f.sector,
                state: f.state,
                county: f.county,
                units: f.units,
                inServiceYear: f.inServiceYear,
                plannedRetirementYear: f.plannedRetirementYear,
                retiredMw: f.retiredMw,
                fercSmallPowerProducer: f.fercSmallPowerProducer,
                fercCogen: f.fercCogen,
                // Permit detail, present only where the join was exact.
                permitVerified: !!permit,
                airPermitClass: permit ? permit.airPermitClass : null,
                airPrograms: permit ? permit.airPrograms : null,
                permitIds: permit ? permit.permitIds : null,
                airOperatingStatus: permit ? permit.operatingStatus : null,
                complianceStatus: permit ? permit.complianceStatus : null,
                quartersWithViolations: permit ? permit.quartersWithViolations : null,
                lastViolationDate: permit ? permit.lastViolationDate : null,
                epaRegistryId: permit ? permit.echoRegistryId : null,
                capacityFactorCurrent: f.cfCurrent,
                capacityFactorBaseline: f.cfBaseline,
                // Read by SiteAvailability to decide whether this duty may be priced.
                dutyBasis: dutyBasisFor(f),
                declinePct: f.declinePct,
                isDecline: f.isDecline,
                trendNote: f.trendNote,
                lastDataMonth: f.lastDataMonth,
                // Kept in the compact array form the artifact ships; the detail chart expands it.
                cfStart: f.cfStart,
                cfSeries: f.cfSeries
            },
            raw: null
        };
    }

    function computeCapacity(f) {
        return f && f.nameplateMw !== null && f.nameplateMw !== undefined
            ? Math.round(f.nameplateMw * 1000) : null;
    }

    function refreshSchedule() {
        return {
            everyDays: REFRESH_EVERY_DAYS,
            reason: 'EIA-860 publishes annually and EIA-923 monthly, but most small plants file ' +
                    'annually so their figures lag by about a year. Quarterly is ample.'
        };
    }

    var adapter = {
        id: 'eia-facility',
        label: 'US generating facility (EIA)',
        energyType: 'grid_facility',
        // Deliberately NOT declaring blanket developmentStage, offtakeState, dutyCyclePct or
        // counterpartyType on the adapter. register() uses adapter-level values to backfill any
        // candidate that left the field null, which would stamp one stage onto every facility
        // regardless of whether it is running, on standby or out of service — the same mistake
        // that once invented an operator for two thirds of the flare catalog. All four are set
        // per-candidate in normalize(), from the plant's own record.
        fetch: fetchAll,
        normalize: normalize,
        computeCapacity: computeCapacity,
        refreshSchedule: refreshSchedule
    };

    if (typeof SiteSources !== 'undefined' && SiteSources && typeof SiteSources.register === 'function') {
        if (typeof SiteSources.unregister === 'function') SiteSources.unregister('eia-facility');
        SiteSources.register(adapter);
    }

    return {
        adapter: adapter,
        load: load,
        meta: meta,
        dutyFor: dutyFor,
        counterpartyFor: counterpartyFor,
        offtakeFor: offtakeFor,
        distressFor: distressFor,
        STAGE_BY_STATUS: STAGE_BY_STATUS
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = FacilitySource;
