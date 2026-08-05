// ===== ION MINING GROUP — Flare Catalog (browser) =====
// Loads the pre-built catalog artifact and turns its compact positional rows into the common
// candidate shape from site-sources.js, so everything downstream — scoring, flags, the
// evaluation engine, the map — is agnostic about where a candidate came from.
//
// The artifact is built offline by tools/build-flare-catalog.js. It has to be: none of the
// upstream hosts send an Access-Control-Allow-Origin header, so a page on github.io cannot
// fetch them directly at any price.

var SiteCatalog = (function() {

    var URL = './data/flare-catalog.json';
    var OPERATORS_URL = './data/operators.json';
    var LIVENESS_URL = './data/liveness.json';
    var _meta = null;
    var _all = null;          // candidate[] — built once, then filtered in place
    var _loading = null;
    var _operators = null;    // { flareId: { operator, licence, distance_m, source, region } }
    var _operatorsMeta = null;
    var _operatorsLoading = null;
    var _liveness = null;      // { flareId: { lastSeen, nights, detections, distance_m } }
    var _livenessMeta = null;
    var _livenessLoading = null;

    // Field order must match `fields` in the artifact.
    var LAT = 0, LON = 1, ISO = 2, KW = 3, PERSIST = 4, ONSHORE = 5,
        YEARS_SEEN = 6, FIRST_YEAR = 7, LAST_YEAR = 8, TREND = 9, KW_BY_YEAR = 10, TEMP_K = 11;

    function rowToCandidate(row, i, meta) {
        var kwByYear = row[KW_BY_YEAR] || [];
        return {
            // Stable across rebuilds as long as the site keeps its position: coordinates are
            // the identity, not the array index, so CRM notes survive a re-ingest.
            id: 'vnf_' + row[LAT].toFixed(4) + '_' + row[LON].toFixed(4),
            source: 'flare-viirs',
            energyType: 'flare_gas',
            lat: row[LAT],
            lng: row[LON],
            iso3: row[ISO] || null,
            country: null,                      // resolved lazily via GEO_DATA when rendering
            powerPotentialKw: row[KW],
            persistencePct: row[PERSIST],
            yearsSeen: row[YEARS_SEEN],
            yearsTotal: meta.years.length,
            firstYear: row[FIRST_YEAR],
            lastYear: row[LAST_YEAR],
            firstSeen: String(row[FIRST_YEAR]),
            lastSeen: String(row[LAST_YEAR]),
            trend: row[TREND],
            offshore: row[ONSHORE] === 1 ? false : true,
            tempK: row[TEMP_K],
            kwByYear: kwByYear,
            confidence: null,
            evidence: [{
                dataset: 'EOG VIIRS global gas flare survey',
                year: row[LAST_YEAR],
                field: 'BCM ' + row[LAST_YEAR],
                value: row[KW] + ' kW derived at ' + meta.heatRateBtuPerKwh + ' BTU/kWh'
            }],
            raw: null
        };
    }

    function load(onProgress) {
        if (_all) return Promise.resolve({ meta: _meta, candidates: _all });
        if (_loading) return _loading;
        _loading = fetch(URL).then(function(res) {
            if (!res.ok) throw new Error('catalog HTTP ' + res.status);
            return res.json();
        }).then(function(data) {
            if (!data || !Array.isArray(data.sites)) throw new Error('malformed catalog');
            _meta = data;
            if (onProgress) onProgress(data.sites.length);
            _all = new Array(data.sites.length);
            // EOG occasionally publishes two records at byte-identical coordinates — separate
            // flares at one facility, or a double-count. They are NOT merged: they overlap in
            // years with different volumes, so collapsing them would corrupt both. But they must
            // not share an id either, because get(), operatorFor() and livenessFor() all key off
            // it and would silently conflate two sites into one. Collisions get a stable ordinal
            // suffix; row order in the artifact is deterministic, so the suffix is too.
            var idSeen = {};
            for (var i = 0; i < data.sites.length; i++) {
                var cand = rowToCandidate(data.sites[i], i, data);
                if (idSeen[cand.id] === undefined) {
                    idSeen[cand.id] = 1;
                } else {
                    idSeen[cand.id] += 1;
                    cand.id = cand.id + '_' + idSeen[cand.id];
                    cand.idCollision = true;    // surfaced in the detail view rather than hidden
                }
                _all[i] = cand;
            }
            return { meta: _meta, candidates: _all };
        }).catch(function(e) {
            _loading = null;                    // allow a retry rather than caching the failure
            throw e;
        });
        return _loading;
    }

    function meta() { return _meta; }
    function all() { return _all || []; }

    // Operator index is a SEPARATE artifact, loaded lazily and allowed to be absent. A missing
    // file means every site honestly reports "operator not identified" rather than breaking the
    // page — the flare data is useful without it.
    function loadOperators() {
        if (_operators) return Promise.resolve(_operators);
        if (_operatorsLoading) return _operatorsLoading;
        _operatorsLoading = fetch(OPERATORS_URL).then(function(res) {
            if (!res.ok) throw new Error('operators HTTP ' + res.status);
            return res.json();
        }).then(function(data) {
            _operators = (data && data.operators) || {};
            _operatorsMeta = data || null;
            return _operators;
        }).catch(function() {
            _operators = {};                 // cache the empty result; do not retry every click
            _operatorsMeta = null;
            return _operators;
        });
        return _operatorsLoading;
    }

    // Returns null when the flare was never matched to a licensed well. Null is the honest
    // answer — the alternative is naming whichever company happens to be nearest, which for a
    // flare in Nigeria or Russia would be pure invention.
    function operatorFor(id) {
        if (!_operators) return null;
        return _operators[id] || null;
    }

    // Liveness is a THIRD optional artifact, produced by tools/build-firms-liveness.js, which
    // needs a NASA FIRMS key. Absent is the normal state until someone runs it, so a missing
    // file must read as "not confirmed" everywhere rather than breaking the page or — worse —
    // being mistaken for "not burning".
    function loadLiveness() {
        if (_liveness) return Promise.resolve(_liveness);
        if (_livenessLoading) return _livenessLoading;
        _livenessLoading = fetch(LIVENESS_URL).then(function(res) {
            if (!res.ok) throw new Error('liveness HTTP ' + res.status);
            return res.json();
        }).then(function(data) {
            _liveness = (data && data.sites) || {};
            _livenessMeta = data || null;
            return _liveness;
        }).catch(function() {
            _liveness = {};          // cache the empty result rather than retrying every render
            _livenessMeta = null;
            return _liveness;
        });
        return _livenessLoading;
    }

    // null means NOT CONFIRMED, which is not the same as not burning. The satellite may have
    // been clouded out, the flare may sit below the detection floor, or the file may simply not
    // have been built. Callers must render the distinction, never collapse it.
    function livenessFor(id) {
        if (!_liveness || !id) return null;
        return _liveness[id] || null;
    }

    function livenessMeta() { return _livenessMeta; }
    function livenessCount() { return _liveness ? Object.keys(_liveness).length : 0; }
    function livenessLoaded() { return !!_livenessMeta; }

    // Whole days since the site was last confirmed burning, or null if never confirmed.
    function daysSinceActive(id) {
        var l = livenessFor(id);
        if (!l || !l.lastSeen) return null;
        var then = Date.parse(l.lastSeen + 'T00:00:00Z');
        if (!isFinite(then)) return null;
        return Math.max(0, Math.floor((Date.now() - then) / 86400000));
    }

    function operatorsMeta() { return _operatorsMeta; }
    function operatorCount() { return _operators ? Object.keys(_operators).length : 0; }

    // Company-level record for an operator name: registry contact details where the regulator
    // publishes them, plus how much of the catalog that company controls. The portfolio rollup
    // is the point — one call to a company holding sixty flares beats sixty cold starts.
    function companyFor(name) {
        if (!name || !_operatorsMeta || !_operatorsMeta.companies) return null;
        return _operatorsMeta.companies[name] || null;
    }

    // Every catalogued flare belonging to one company, best first.
    function sitesForCompany(name) {
        if (!name || !_operators) return [];
        var out = [];
        for (var i = 0; i < (_all || []).length; i++) {
            var op = _operators[_all[i].id];
            if (op && op.operator === name) out.push(_all[i]);
        }
        return out.sort(function(a, b) { return (b.powerPotentialKw || 0) - (a.powerPotentialKw || 0); });
    }

    // f: { iso3, minKw, maxKw, onshoreOnly, minYearsSeen, activeThrough, tiers, search }
    // Absent keys mean "no constraint". Filtering only — no scoring, no sorting.
    function filter(f) {
        f = f || {};
        var out = [];
        var list = _all || [];
        var q = f.search ? String(f.search).toLowerCase().trim() : null;

        for (var i = 0; i < list.length; i++) {
            var c = list[i];
            if (f.onshoreOnly && c.offshore !== false) continue;
            if (f.iso3 && c.iso3 !== f.iso3) continue;
            if (f.minKw !== undefined && f.minKw !== null && !(c.powerPotentialKw >= f.minKw)) continue;
            if (f.maxKw !== undefined && f.maxKw !== null && !(c.powerPotentialKw <= f.maxKw)) continue;
            if (f.minYearsSeen && !(c.yearsSeen >= f.minYearsSeen)) continue;
            if (f.activeThrough && !(c.lastYear >= f.activeThrough)) continue;
            if (f.tiers && f.tiers.length && typeof Jurisdictions !== 'undefined') {
                var t = Jurisdictions.get(c.iso3).tier;
                if (f.tiers.indexOf(t) < 0) continue;
            }
            if (q) {
                var hay = (c.iso3 || '') + ' ' + c.lat.toFixed(2) + ' ' + c.lng.toFixed(2);
                if (hay.toLowerCase().indexOf(q) < 0) continue;
            }
            out.push(c);
        }
        return out;
    }

    function countries() {
        var counts = {};
        var list = _all || [];
        for (var i = 0; i < list.length; i++) {
            if (!list[i].iso3) continue;
            counts[list[i].iso3] = (counts[list[i].iso3] || 0) + 1;
        }
        return Object.keys(counts)
            .map(function(k) { return { iso3: k, count: counts[k] }; })
            .sort(function(a, b) { return b.count - a.count; });
    }

    function get(id) {
        var list = _all || [];
        for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
        return null;
    }

    function haversineKm(lat1, lon1, lat2, lon2) {
        var R = 6371;
        var p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
        var dp = p2 - p1, dl = (lon2 - lon1) * Math.PI / 180;
        var a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
        return 2 * R * Math.asin(Math.sqrt(a));
    }

    function nearest(lat, lon, list, limit) {
        var src = list || _all || [];
        var scored = [];
        for (var i = 0; i < src.length; i++) {
            scored.push({ candidate: src[i], km: haversineKm(lat, lon, src[i].lat, src[i].lng) });
        }
        scored.sort(function(a, b) { return a.km - b.km; });
        return scored.slice(0, limit || 10);
    }

    return {
        load: load,
        loadOperators: loadOperators,
        operatorFor: operatorFor,
        operatorsMeta: operatorsMeta,
        operatorCount: operatorCount,
        loadLiveness: loadLiveness,
        livenessFor: livenessFor,
        livenessMeta: livenessMeta,
        livenessCount: livenessCount,
        livenessLoaded: livenessLoaded,
        daysSinceActive: daysSinceActive,
        companyFor: companyFor,
        sitesForCompany: sitesForCompany,
        meta: meta,
        all: all,
        filter: filter,
        countries: countries,
        get: get,
        nearest: nearest,
        haversineKm: haversineKm,
        URL: URL,
        OPERATORS_URL: OPERATORS_URL,
        LIVENESS_URL: LIVENESS_URL
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SiteCatalog;
