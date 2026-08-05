// ===== ION MINING GROUP — Jurisdictions =====
// Per-country operating context: how workable a place is, what currency it quotes in, and what
// a normal power rate looks like there.
//
// This exists because going global breaks a filter that never mattered in Alberta. Most of the
// world's gas flaring happens in countries a Canadian operator cannot realistically build in —
// unfiltered, a "best sites globally" ranking returns Iraq and Russia at the top. Tiering is
// therefore a first-class scoring input, not a footnote.
//
// The tiers below are an EDITABLE STARTING POINT reflecting operational accessibility for a
// Canadian operator — sanctions exposure, capital controls, security, contract enforceability.
// They are a planning heuristic, not legal or investment advice, and every one can be
// overridden with register(). An unknown country returns tier 'unknown' and is never silently
// treated as workable.

var Jurisdictions = (function() {

    // Ordered worst-to-best is deliberate: rank() maps these to a 0..1 score.
    var TIERS = ['prohibited', 'restricted', 'unknown', 'workable', 'preferred'];

    function tierScore(tier) {
        var i = TIERS.indexOf(tier);
        if (i < 0) return null;
        // 'unknown' deliberately lands mid-scale rather than at zero — an uncatalogued country
        // is unassessed, not disqualified.
        return i / (TIERS.length - 1);
    }

    // iso3 -> tier. Covers the countries that actually appear in the global flare catalog.
    var DEFAULT_TIERS = {
        // Home markets and close analogues
        CAN: 'preferred', USA: 'preferred',
        // Stable, contract-enforceable, realistically enterable
        NOR: 'workable', GBR: 'workable', AUS: 'workable', NZL: 'workable',
        ARE: 'workable', OMN: 'workable', QAT: 'workable', SAU: 'workable', KWT: 'workable',
        BRA: 'workable', ARG: 'workable', COL: 'workable', CHL: 'workable',
        MEX: 'workable', TTO: 'workable',
        NLD: 'workable', DNK: 'workable', DEU: 'workable', ITA: 'workable', ESP: 'workable',
        ROU: 'workable', POL: 'workable', HRV: 'workable',
        MYS: 'workable', THA: 'workable', IDN: 'workable', IND: 'workable', VNM: 'workable',
        ZAF: 'workable', GHA: 'workable', BWA: 'workable',
        KAZ: 'restricted', AZE: 'workable', TUR: 'workable', EGY: 'workable',
        // Material barriers: security, capital controls, expropriation risk, or enforcement
        NGA: 'restricted', DZA: 'restricted', AGO: 'restricted', LBY: 'restricted',
        IRQ: 'restricted', CHN: 'restricted', TKM: 'restricted', UZB: 'restricted',
        GAB: 'restricted', COG: 'restricted', CMR: 'restricted', TCD: 'restricted',
        SSD: 'restricted', SDN: 'restricted', YEM: 'restricted', PNG: 'restricted',
        BOL: 'restricted', ECU: 'restricted', PER: 'restricted', TUN: 'restricted',
        MMR: 'restricted', PAK: 'restricted', BGD: 'restricted', BRN: 'workable',
        // Sanctions or comprehensive restrictions for a Canadian entity
        RUS: 'prohibited', IRN: 'prohibited', VEN: 'prohibited', SYR: 'prohibited',
        PRK: 'prohibited', BLR: 'prohibited', CUB: 'prohibited'
    };

    // Regional power-rate benchmarks in USD/kWh, used by flag rule 4 ("too good to be true").
    // Sparse on purpose: a benchmark that does not exist must read as absent, so the rule
    // stays silent rather than comparing against a made-up number.
    var DEFAULT_BENCHMARKS = {
        'CA-AB': 0.035,   // Alberta behind-the-meter gas — the band Ion's own sites sit in
        CAN: 0.045,
        USA: 0.045
    };

    var DEFAULT_CURRENCY = { CAN: 'CAD', USA: 'USD', GBR: 'GBP', AUS: 'AUD', NOR: 'NOK', MEX: 'MXN' };

    var _custom = {};

    function key(code) { return String(code || '').toUpperCase().trim(); }

    // adapter: { tier, currency, powerRateBenchmarkUsd, label, notes, enrich(candidate) }
    // enrich() is the hook Phase 4 uses to attach regulatory identity (operator, licence, facility
    // id) where a coordinate-bearing well dataset exists for that country.
    function register(code, adapter) {
        var k = key(code);
        if (!k) throw new Error('Jurisdictions.register requires a country code');
        _custom[k] = adapter || {};
        return k;
    }

    function unregister(code) {
        var k = key(code);
        var had = Object.prototype.hasOwnProperty.call(_custom, k);
        delete _custom[k];
        return had;
    }

    // Resolution order: explicit registration, then the shipped table, then 'unknown'.
    // `code` accepts ISO3 ('CAN') or a sub-national key ('CA-AB'); a sub-national key falls
    // back to its country for anything it does not itself define.
    function get(code) {
        var k = key(code);
        var parentKey = null;
        if (k.indexOf('-') > 0) {
            // 'CA-AB' -> country portion. ISO2 'CA' maps to ISO3 'CAN' for the tier table.
            var iso2 = k.split('-')[0];
            parentKey = { CA: 'CAN', US: 'USA', MX: 'MEX', AU: 'AUS', GB: 'GBR' }[iso2] || iso2;
        }

        var custom = _custom[k] || {};
        var parentCustom = parentKey ? (_custom[parentKey] || {}) : {};

        function pick(field, table, fallback) {
            if (custom[field] !== undefined && custom[field] !== null) return custom[field];
            if (table && table[k] !== undefined) return table[k];
            if (parentCustom[field] !== undefined && parentCustom[field] !== null) return parentCustom[field];
            if (table && parentKey && table[parentKey] !== undefined) return table[parentKey];
            return fallback;
        }

        var tier = pick('tier', DEFAULT_TIERS, 'unknown');
        return {
            code: k,
            known: (custom.tier !== undefined) || (DEFAULT_TIERS[k] !== undefined) ||
                   (parentKey ? (DEFAULT_TIERS[parentKey] !== undefined || parentCustom.tier !== undefined) : false),
            tier: tier,
            tierScore: tierScore(tier),
            label: custom.label || null,
            currency: pick('currency', DEFAULT_CURRENCY, null),
            powerRateBenchmarkUsd: pick('powerRateBenchmarkUsd', DEFAULT_BENCHMARKS, null),
            notes: custom.notes || null,
            enrich: typeof custom.enrich === 'function' ? custom.enrich : null
        };
    }

    // Convenience for flag rule 4 — returns null (not 0) when no benchmark exists.
    function benchmark(code) {
        var j = get(code);
        return j.powerRateBenchmarkUsd === null || j.powerRateBenchmarkUsd === undefined
            ? null : { powerRateUsd: j.powerRateBenchmarkUsd, source: j.code };
    }

    // Alberta — the only sub-national entry shipped, because it is the one place we have real
    // operating figures for. Its benchmark comes from Ion's own quoted sites ($0.03-$0.04/kWh).
    register('CA-AB', {
        label: 'Alberta, Canada',
        tier: 'preferred',
        currency: 'CAD',
        powerRateBenchmarkUsd: DEFAULT_BENCHMARKS['CA-AB'],
        notes: 'Behind-the-meter gas generation at wellsite. Home jurisdiction.'
    });

    return {
        register: register,
        unregister: unregister,
        get: get,
        benchmark: benchmark,
        tierScore: tierScore,
        TIERS: TIERS,
        DEFAULT_TIERS: DEFAULT_TIERS
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Jurisdictions;
