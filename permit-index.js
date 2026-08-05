// Air permits and compliance history, as an ENRICHMENT rather than a source.
//
// A permit is not a prospect. It is a fact about a prospect that already exists, so this loads
// alongside the facility adapter and is joined by EIA plant code, the same way the operator and
// liveness joins work for flares.
//
// The load is deliberately optional. data/permits.json takes about an hour to build and may
// legitimately be absent or stale; when it is, every facility reports its permit state as
// unknown, which is exactly what it is. Nothing breaks and nothing is invented.
var PermitIndex = (function() {
    'use strict';

    var URL = './data/permits.json';
    var _data = null, _byPlant = null, _loading = null, _loaded = false;

    function load() {
        if (_loaded) return Promise.resolve(_data);
        if (_loading) return _loading;
        _loading = fetch(URL).then(function(res) {
            // A missing artifact is a normal state, not an error. It means the permit pipeline
            // has not run, and the UI must say "not verified" rather than failing.
            if (!res.ok) return null;
            return res.json();
        }).then(function(d) {
            if (d && Array.isArray(d.permits)) {
                _data = d;
                _byPlant = {};
                for (var i = 0; i < d.permits.length; i++) {
                    _byPlant[String(d.permits[i].plantCode)] = d.permits[i];
                }
            }
            _loaded = true;
            return _data;
        }).catch(function() {
            // Same reasoning: absence is tolerable, a broken page is not.
            _loaded = true;
            return null;
        });
        return _loading;
    }

    function loaded() { return _loaded && _data !== null; }
    function meta() { return _data; }
    function count() { return _data ? _data.permits.length : 0; }

    function forPlant(plantCode) {
        if (!_byPlant || plantCode === null || plantCode === undefined) return null;
        var k = String(plantCode);
        if (!Object.prototype.hasOwnProperty.call(_byPlant, k)) return null;
        return _byPlant[k];
    }

    // Compliance findings, converted to the shared distress-signal shape.
    //
    // Only the ECHO fields that were actually observed in a response are read, and each signal
    // carries the dataset it came from so the timeline can attribute it.
    function distressFor(plantCode) {
        var p = forPlant(plantCode);
        if (!p) return [];
        var out = [];

        for (var i = 0; i < (p.violations || []).length; i++) {
            var v = p.violations[i];
            out.push({
                type: 'compliance_violations',
                // Dated to the last violation where ECHO publishes one, so an old enforcement
                // history decays instead of reading as current trouble.
                date: v.last || null,
                source: 'EPA ECHO air compliance',
                detail: v.detail + (v.severity === 'high' ? ' (high priority)' : '')
            });
        }

        // A lapsed permit is its own signal with its own weight; it is deliberately NOT also part
        // of permit_state, which would count one fact twice.
        if (p.permitState === null && p.operatingStatus &&
            /permanently closed/i.test(p.operatingStatus)) {
            out.push({
                type: 'permit_lapsed',
                date: null,
                source: 'EPA ECHO air facility status',
                detail: 'EPA reports this facility permanently closed, so it holds no current ' +
                        'operating air permit. The site, its interconnection and its permit ' +
                        'history remain.'
            });
        }
        return out;
    }

    return {
        load: load,
        loaded: loaded,
        meta: meta,
        count: count,
        forPlant: forPlant,
        distressFor: distressFor
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PermitIndex;
