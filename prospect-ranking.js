// One encoded sort selection for the Map controls, saved searches and every result view.
var ProspectRanking = (function () {
    'use strict';
    var presets = {
        proton_fit: { key: 'priority', dir: -1 },
        combined: { key: 'combined', dir: -1 },
        score: { key: 'opportunity', dir: -1 },
        persistence: { key: 'persistence', dir: -1 },
        power_potential: { key: 'kw', dir: -1 },
        jurisdiction: { key: 'jurisdiction', dir: -1 },
        capital_avoided: { key: 'capavoided', dir: -1 },
        capital_required: { key: 'caprequired', dir: 1 },
        all_in_per_kw: { key: 'allinkw', dir: 1 }
    };
    var columns = ['priority', 'name', 'source', 'iso3', 'kw', 'duty', 'years', 'operator',
        'allinkw', 'torevenue', 'acquirability', 'combined', 'collection',
        'capavoided', 'caprequired', 'infraverified', 'stage', 'opportunity'];
    function decode(value) {
        if (Object.prototype.hasOwnProperty.call(presets, value)) {
            return { key: presets[value].key, dir: presets[value].dir, column: false };
        }
        var m = /^column:([a-z0-9]+):(asc|desc)$/.exec(String(value || ''));
        if (!m || columns.indexOf(m[1]) < 0) return null;
        return { key: m[1], dir: m[2] === 'asc' ? 1 : -1, column: true };
    }
    function textColumn(key) { return ['name', 'source', 'iso3', 'operator'].indexOf(key) >= 0; }
    function encode(key, dir) {
        if (columns.indexOf(key) < 0 || (dir !== 1 && dir !== -1)) return null;
        // Size's existing preset uses source potential; the Capacity column uses usable kW.
        for (var value in presets) {
            if (value !== 'power_potential' && presets[value].key === key && presets[value].dir === dir) return value;
        }
        return 'column:' + key + ':' + (dir === 1 ? 'asc' : 'desc');
    }
    function next(value, key) {
        if (columns.indexOf(key) < 0) return null;
        var current = decode(value);
        var dir = current && current.key === key ? -current.dir : (textColumn(key) ? 1 : -1);
        return encode(key, dir);
    }
    function direction(order) {
        if (textColumn(order.key)) return order.dir === 1 ? 'A to Z' : 'Z to A';
        return order.dir === 1 ? 'lowest first' : 'highest first';
    }
    // Missing measurements stay last in either direction. Exact ties use a stable ID,
    // so repeated renders and a refresh cannot shuffle otherwise identical prospects.
    function compare(a, b, dir, aId, bId) {
        var aMissing = a === null || a === undefined || (typeof a === 'number' && !isFinite(a));
        var bMissing = b === null || b === undefined || (typeof b === 'number' && !isFinite(b));
        if (aMissing !== bMissing) return aMissing ? 1 : -1;
        if (!aMissing && a !== b) return a < b ? -dir : dir;
        return String(aId) < String(bId) ? -1 : String(aId) > String(bId) ? 1 : 0;
    }
    return { decode: decode, encode: encode, next: next, direction: direction, compare: compare };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ProspectRanking;
