// Flare gas as a SourceAdapter.
//
// This is the reference implementation of the five-method contract in site-sources.js. It exists
// to prove the contract against the one source that is fully built out, so that landfill gas and
// curtailment can be added later as peers rather than as special cases bolted onto the flare path.
//
// It deliberately DELEGATES to site-catalog.js rather than reimplementing anything. The catalog
// loader owns parsing the packed artifact, the operator join and the liveness join; duplicating
// any of that here would create two definitions of a flare prospect that could drift apart. The
// adapter's whole job is to present what already exists in the shape every source shares.
//
// Registration is side-effecting on load, matching how the rest of this codebase wires modules
// together (no build step, no module system — plain script tags in dependency order).
var FlareGasSource = (function() {
    'use strict';

    // EOG publishes the global flare survey once a year, typically mid-year for the prior year.
    // Polling it more often than that is pure waste. Liveness is a separate, much faster cadence
    // handled by the FIRMS pipeline, which is why refreshSchedule reports the survey cadence and
    // names the faster signal rather than averaging the two into a number that describes neither.
    var SURVEY_EVERY_DAYS = 365;

    // Gas flares burn continuously by nature — that is what makes them attractive as a power
    // source and it is the baseline the other sources are measured against. Curtailed renewables
    // will carry a duty cycle far below this, which is exactly why the field exists on the shared
    // shape instead of being assumed to be 100 everywhere.
    var DUTY_CYCLE_PCT = 100;

    function fetch(opts) {
        opts = opts || {};
        // SiteCatalog.load() is idempotent and memoised, so calling it here is safe whether or not
        // the page has already loaded the catalog for the map.
        return SiteCatalog.load().then(function() {
            return SiteCatalog.all();
        });
    }

    // The catalog rows are already in the common shape. What this adds is the fields that only
    // became part of the shared model once there was more than one kind of source to compare.
    function normalize(row, opts) {
        opts = opts || {};
        var op = (typeof SiteCatalog.operatorFor === 'function') ? SiteCatalog.operatorFor(row.id) : null;
        var live = (typeof SiteCatalog.livenessFor === 'function') ? SiteCatalog.livenessFor(row.id) : null;

        var c = {};
        for (var k in row) { if (Object.prototype.hasOwnProperty.call(row, k)) c[k] = row[k]; }

        c.source = 'flare-viirs';
        c.energyType = 'flare_gas';
        c.dutyCyclePct = DUTY_CYCLE_PCT;

        // Whoever holds the licence is who you would actually negotiate with. Where the regulator
        // publishes no licensee we say so rather than guessing at a counterparty.
        c.counterpartyType = op ? 'oil_gas_operator' : null;

        // Liveness is a separate satellite signal and may legitimately be absent. Absent means
        // not checked, never "confirmed dark" — the distinction is load-bearing in the UI.
        c.lastActive = live ? live.lastSeen : null;
        c.daysSinceActive = (live && typeof SiteCatalog.daysSinceActive === 'function')
            ? SiteCatalog.daysSinceActive(row.id) : null;

        c.regulatoryNotes = regulatoryNotesFor(row.iso3);
        c.sourceDetail = {
            surveyYears: row.yearsSeen + ' of ' + row.yearsTotal,
            firstYear: row.firstYear,
            lastYear: row.lastYear,
            trend: row.trend,
            flareTempK: row.tempK,
            kwByYear: row.kwByYear || null,
            offshore: row.offshore,
            liveness: live ? { lastSeen: live.lastSeen, nights: live.nights, distanceM: live.distance_m } : null
        };
        return c;
    }

    // Only the jurisdictions we have actually read the rules for get a note. Everywhere else
    // returns null, because a confident-sounding note about a country nobody checked is worse
    // than no note at all.
    function regulatoryNotesFor(iso3) {
        if (iso3 === 'CAN') {
            return 'Alberta flaring, venting and incineration is governed by AER Directive 060, ' +
                   'which caps routine flaring and requires operators to evaluate conservation ' +
                   'alternatives above defined volumes. Using the gas on site is a conservation ' +
                   'option, which is usually an advantage in these negotiations.';
        }
        if (iso3 === 'USA') {
            return 'Flaring rules are set state by state. North Dakota and Texas both impose gas ' +
                   'capture targets, and on-site use generally counts toward capture rather than ' +
                   'against it. Federal land adds BLM requirements on top of state rules.';
        }
        return null;
    }

    // The pipeline already derived kW from flared volume at a documented heat rate, so this
    // returns the stored value rather than recomputing it from a second set of constants.
    function computeCapacity(row) {
        return row && row.powerPotentialKw !== undefined ? row.powerPotentialKw : null;
    }

    // Reported for interface completeness, but note that site-scoring.js deliberately ranks on
    // yearsSeen/yearsTotal instead: VIIRS detection frequency scales with flare SIZE (>2 MW flares
    // average 51% detection, <500 kW average 5.6%), so using it as a persistence measure would
    // quietly re-rank small steady flares as unreliable.
    function computePersistence(row) {
        if (!row || !row.yearsTotal) return null;
        return 100 * row.yearsSeen / row.yearsTotal;
    }

    function refreshSchedule() {
        return {
            everyDays: SURVEY_EVERY_DAYS,
            reason: 'EOG publishes the global flare survey annually. Liveness is refreshed ' +
                    'separately from NASA FIRMS on a much shorter cycle.'
        };
    }

    var adapter = {
        id: 'flare-viirs',
        label: 'Flare gas (VIIRS)',
        energyType: 'flare_gas',
        dutyCyclePct: DUTY_CYCLE_PCT,
        // Deliberately NOT declaring a blanket counterpartyType here. register() uses the
        // adapter-level value to fill in any candidate that left the field null, which would
        // stamp 'oil_gas_operator' onto the 10,883 sites where no regulator publishes a licensee
        // — inventing a counterparty for two thirds of the catalog. It is set per-candidate in
        // normalize(), only where an operator is actually known.
        fetch: fetch,
        normalize: normalize,
        computeCapacity: computeCapacity,
        computePersistence: computePersistence,
        refreshSchedule: refreshSchedule
    };

    if (typeof SiteSources !== 'undefined' && SiteSources && typeof SiteSources.register === 'function') {
        // Re-registering on a hot reload would otherwise stack duplicates and double every count.
        if (typeof SiteSources.unregister === 'function') SiteSources.unregister('flare-viirs');
        SiteSources.register(adapter);
    }

    return { adapter: adapter, regulatoryNotesFor: regulatoryNotesFor };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = FlareGasSource;
