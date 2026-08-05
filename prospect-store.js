// The single source of prospects, across every registered energy source.
//
// Before this existed, map-sourcing.js read site-catalog.js directly at some forty call sites, so
// the UI was hardwired to the flare artifact and `SiteSources.discover()` was exercised only by
// tests. Registering a second adapter produced no visible change whatsoever — the abstraction was
// real but not load-bearing. This is the layer that makes it load-bearing: it runs discovery
// across every registered adapter and owns the query surface the UI talks to.
//
// site-catalog.js is still the flare artifact's loader. It is now reached THROUGH
// source-flare-gas.js rather than around it.
var ProspectStore = (function() {
    'use strict';

    var _all = null, _byId = null, _loading = null, _rejected = [], _errors = [];

    // ---- Loading ------------------------------------------------------------------------
    // Runs every adapter registered with SiteSources. Rejects and errors are RETAINED rather
    // than swallowed: a source silently dropping a third of its rows is exactly the failure that
    // makes a sourcing tool untrustworthy, so the counts stay queryable and get surfaced.
    function load(ids, opts) {
        if (_all) return Promise.resolve(result());
        if (_loading) return _loading;

        if (typeof SiteSources === 'undefined' || !SiteSources || typeof SiteSources.discover !== 'function') {
            return Promise.reject(new Error('SiteSources is not available'));
        }

        _loading = SiteSources.discover(ids, opts || {}).then(function(r) {
            _all = (r && r.candidates) || [];
            _rejected = (r && r.rejected) || [];
            _errors = (r && r.errors) || [];
            reindex();
            return result();
        }).catch(function(e) {
            _loading = null;                    // allow a retry rather than caching the failure
            throw e;
        });
        return _loading;
    }

    function reindex() {
        _byId = {};
        for (var i = 0; i < _all.length; i++) {
            // Object.create(null) is not used because the rest of this codebase assumes plain
            // objects; instead every read goes through hasOwnProperty. An id of '__proto__' or
            // 'toString' would otherwise resolve up the prototype chain and return a function.
            _byId[_all[i].id] = i;
        }
    }

    function result() {
        return { candidates: _all, rejected: _rejected, errors: _errors };
    }

    function loaded() { return _all !== null; }
    function all() { return _all || []; }
    function rejected() { return _rejected; }
    function errors() { return _errors; }

    function get(id) {
        if (!_byId || id === null || id === undefined) return null;
        if (!Object.prototype.hasOwnProperty.call(_byId, id)) return null;
        return _all[_byId[id]] || null;
    }

    // ---- Query --------------------------------------------------------------------------
    // Absent keys mean "no constraint". Filtering only — no scoring, no sorting.
    //
    // Every predicate reads a field on the SHARED candidate shape. None of them may reference a
    // source or energy type except through the explicit sources/energyTypes facets, which are
    // filters over an attribute rather than branches in the logic.
    function filter(f) {
        f = f || {};
        var out = [];
        var list = _all || [];
        var q = f.search ? String(f.search).toLowerCase().trim() : null;
        var hasJur = typeof Jurisdictions !== 'undefined';

        for (var i = 0; i < list.length; i++) {
            var c = list[i];
            if (f.onshoreOnly && c.offshore !== false) continue;
            if (f.iso3 && c.iso3 !== f.iso3) continue;
            if (f.minKw !== undefined && f.minKw !== null && !(c.powerPotentialKw >= f.minKw)) continue;
            if (f.maxKw !== undefined && f.maxKw !== null && !(c.powerPotentialKw <= f.maxKw)) continue;
            if (f.minYearsSeen && !(c.yearsSeen >= f.minYearsSeen)) continue;
            // lastSeen is the shared-shape field; the flare catalog's numeric `lastYear` is
            // source-specific and lives in sourceDetail, so it is not available here.
            if (f.activeThrough && !(Number(c.lastSeen) >= f.activeThrough)) continue;
            if (f.sources && f.sources.length && f.sources.indexOf(c.source) < 0) continue;
            if (f.energyTypes && f.energyTypes.length && f.energyTypes.indexOf(c.energyType) < 0) continue;
            if (f.confirmedActive && !(c.daysSinceActive !== null && c.daysSinceActive !== undefined)) continue;
            if (f.tiers && f.tiers.length && hasJur) {
                if (f.tiers.indexOf(Jurisdictions.get(c.iso3).tier) < 0) continue;
            }
            if (q) {
                var hay = (c.iso3 || '') + ' ' + (c.source || '') + ' ' + (c.energyType || '') + ' ' +
                          (c.lat === null ? '' : c.lat.toFixed(2)) + ' ' +
                          (c.lng === null ? '' : c.lng.toFixed(2));
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

    // Which sources actually contributed prospects, for the facet UI and the status line. Reads
    // the loaded candidates rather than the adapter registry, so a source that registered but
    // returned nothing is visibly at zero instead of silently absent.
    function sources() {
        var counts = {};
        var list = _all || [];
        for (var i = 0; i < list.length; i++) {
            var k = list[i].source || 'unknown';
            counts[k] = (counts[k] || 0) + 1;
        }
        var reg = {};
        if (typeof SiteSources !== 'undefined' && SiteSources.list) {
            var adapters = SiteSources.list();
            for (var j = 0; j < adapters.length; j++) {
                reg[adapters[j].id] = adapters[j];
                if (counts[adapters[j].id] === undefined) counts[adapters[j].id] = 0;
            }
        }
        return Object.keys(counts).map(function(k) {
            return {
                id: k,
                label: reg[k] ? reg[k].label : k,
                energyType: reg[k] ? reg[k].energyType : null,
                count: counts[k]
            };
        }).sort(function(a, b) { return b.count - a.count; });
    }

    function reset() { _all = null; _byId = null; _loading = null; _rejected = []; _errors = []; }

    return {
        load: load,
        loaded: loaded,
        all: all,
        get: get,
        filter: filter,
        countries: countries,
        sources: sources,
        rejected: rejected,
        errors: errors,
        reset: reset
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ProspectStore;
