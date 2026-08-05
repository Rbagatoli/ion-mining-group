// ===== SITE LINKS =====
//
// Answers "is this prospect the same physical asset as another one in the list?"
//
// It never merges. Both datasets' figures survive, and where they disagree the disagreement is
// shown rather than resolved — an EIA plant marked retired sitting on a landfill with five live
// LMOP projects is not a data error to be cleaned up, it is the single most interesting row on
// the page.
//
// Loads data/site-links.json, built by tools/build-site-links.js. Absent artifact is not an
// error: every lookup returns null and the UI simply shows what it showed before.

var SiteLinks = (function() {

    var URL = './data/site-links.json';
    var _data = null, _loading = null;
    // facilityId -> link, and landfill projectId -> link, both pointing at the same records.
    var _byFacility = null, _byProject = null, _spanByProject = null, _multiByProject = null;

    function load() {
        if (_data) return Promise.resolve(_data);
        if (_loading) return _loading;
        _loading = fetch(URL).then(function(res) {
            if (!res.ok) throw new Error('site-links HTTP ' + res.status);
            return res.json();
        }).then(function(d) {
            if (!d || !Array.isArray(d.links)) throw new Error('malformed site-links');
            _data = d;
            index();
            return d;
        }).catch(function(e) {
            _loading = null;
            // Optional artifact. Nothing downstream should break because it was never built.
            _data = null;
            throw e;
        });
        return _loading;
    }

    function index() {
        _byFacility = {}; _byProject = {}; _spanByProject = {}; _multiByProject = {};
        (_data.links || []).forEach(function(l) {
            _byFacility[l.facilityId] = l;
            (l.landfills || []).forEach(function(g) {
                (g.projectIds || []).forEach(function(pid) { _byProject[pid] = l; });
            });
        });
        (_data.projectSpans || []).forEach(function(s) { _spanByProject[s.projectId] = s; });
        (_data.multiProjectLandfills || []).forEach(function(m) {
            (m.projectIds || []).forEach(function(pid) { _multiByProject[pid] = m; });
        });
    }

    function ready() { return !!_data; }
    function meta() {
        if (!_data) return null;
        return {
            generated: _data.generated, source: _data.source, method: _data.method,
            joinNote: _data.joinNote, capacityNote: _data.capacityNote,
            radiusM: _data.radiusM, counts: _data.counts
        };
    }

    // The cross-dataset link for a prospect, from either side. null when it stands alone.
    function forProspect(cand) {
        if (!_data || !cand || !cand.id) return null;
        return _byFacility[cand.id] || _byProject[cand.id] || null;
    }

    // Is this row one of several the SAME project produced, at different landfills? If so the
    // capacity belongs to the project, not to this row, and summing the column over-counts.
    function span(cand) {
        return (_data && cand && cand.id) ? (_spanByProject[cand.id] || null) : null;
    }

    // Other projects at this same landfill. One owner, one conversation.
    function siblings(cand) {
        return (_data && cand && cand.id) ? (_multiByProject[cand.id] || null) : null;
    }

    // Every prospect id that refers to the same physical asset as this one, excluding itself.
    // This is what the acquisition table uses to show one row per asset.
    function aliasesOf(cand) {
        var out = {}, id = cand && cand.id;
        if (!id) return [];
        var l = forProspect(cand);
        if (l) {
            if (l.facilityId !== id) out[l.facilityId] = 1;
            (l.landfills || []).forEach(function(g) {
                (g.projectIds || []).forEach(function(pid) { if (pid !== id) out[pid] = 1; });
            });
        }
        var s = siblings(cand);
        if (s) (s.projectIds || []).forEach(function(pid) { if (pid !== id) out[pid] = 1; });
        // Project spans are deliberately NOT aliases. Their members are separate landfills that
        // happen to feed one project — different places, correctly shown as different rows. What
        // they share is a capacity figure, which span() reports so it is counted once.
        return Object.keys(out).sort();
    }

    // Human-readable disagreements for the detail panel. Empty array, never null.
    function disagreements(cand) {
        var l = forProspect(cand);
        if (!l || !l.disagreements || !l.disagreements.length) return [];
        return l.disagreements.map(function(d) {
            var g = (l.landfills || []).filter(function(x) { return x.lfid === d.lfid; })[0];
            var where = g ? g.name : 'the linked landfill';
            if (d.kind === 'eia_retired_lmop_operating') {
                return {
                    kind: d.kind,
                    // The good one. A retired generator on a landfill that is still producing gas
                    // is an asset with an owner, an interconnection and a fuel supply.
                    text: 'EIA reports this plant retired, but ' + where + ' still has an ' +
                          'operational LMOP project — the gas is being collected and the ' +
                          'generator is not running.'
                };
            }
            return {
                kind: d.kind,
                text: 'EIA reports this plant operating, but LMOP shows no operational project at ' +
                      where + '. One of the two records is behind.'
            };
        });
    }

    return {
        load: load,
        ready: ready,
        meta: meta,
        forProspect: forProspect,
        span: span,
        siblings: siblings,
        aliasesOf: aliasesOf,
        disagreements: disagreements
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SiteLinks;
