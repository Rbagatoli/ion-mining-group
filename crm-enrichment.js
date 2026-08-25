/* ===== Enrichment =====
 *
 * The research that compounds. Every landfill worked out now — who owns it, who
 * to ring, whether there is already a genset on it — is work not repeated later,
 * and it is the only part of this build that pays while waiting for capital
 * rather than for a phone call to be returned.
 *
 * TEN FULLY ENRICHED PROSPECTS ARE WORTH MORE THAN A HUNDRED RAW ONES, so the
 * number this module exists to produce is a percentage that can be sorted on.
 *
 * HOW THAT PERCENTAGE IS COMPUTED, because it is the whole thing and it is easy
 * to get flattering:
 *
 *   complete / (total - not applicable)
 *
 *   NOT APPLICABLE COMES OUT OF THE DENOMINATOR. A landfill with no GHGRP filing
 *   has nothing to review there. Counting that as done would inflate the number;
 *   counting it as outstanding would make a finished site look permanently
 *   unfinished. It is neither, so it is removed from the question.
 *
 *   IN PROGRESS COUNTS AS ZERO. Half credit for started-but-not-finished is how
 *   a checklist starts flattering you — everything sits at 50% forever and the
 *   number stops distinguishing the sites that are actually ready. It is
 *   reported separately instead, so "3 done, 2 underway, 4 to go" is visible
 *   without being averaged into a single softer figure.
 *
 *   EVERYTHING NOT APPLICABLE IS null, NOT 100%. A checklist where every line
 *   was waved away has not been researched; it has been dismissed. null renders
 *   as "nothing to check" rather than as a finished site.
 *
 * Each item carries a source note and a date, because "owner identified" without
 * where it came from is a claim rather than a finding, and this repo does not
 * let a typed guess wear the authority of a sourced fact.
 */
var CrmEnrichment = (function () {
    'use strict';

    var KEY = 'protonCrmEnrichment';
    var VERSION = 1;
    var STATUSES = ['not_started', 'in_progress', 'complete', 'na'];

    var _cache = null;

    function empty() { return { _v: VERSION, byProspect: {} }; }

    function read() {
        if (_cache) return _cache;
        try {
            var raw = localStorage.getItem(KEY);
            if (raw) {
                var parsed = JSON.parse(raw);
                if (parsed && parsed.byProspect && typeof parsed.byProspect === 'object') {
                    _cache = parsed;
                    return _cache;
                }
            }
        } catch (e) { /* fall through */ }
        _cache = empty();
        return _cache;
    }

    function write(data) {
        var res = { ok: true, err: null };
        try {
            localStorage.setItem(KEY, JSON.stringify(data));
            _cache = data;
        } catch (e) {
            res.ok = false;
            res.err = (e && (e.name === 'QuotaExceededError' || e.code === 22))
                ? 'Local storage is full — this was NOT saved.'
                : 'Could not save the enrichment state.';
            return res;
        }
        if (typeof SyncEngine !== 'undefined' && SyncEngine.save) {
            try { SyncEngine.save('crmEnrichment'); } catch (e) { /* local write stands */ }
        }
        return res;
    }

    function checklistFor(prospectId) {
        var rec = (typeof SiteData !== 'undefined' && SiteData.get) ? SiteData.get(prospectId) : null;
        var type = rec ? (rec.energy_type || null) : null;
        if (typeof CrmConfig === 'undefined' || !CrmConfig.checklistFor) return [];
        return CrmConfig.checklistFor(type);
    }

    function stateFor(prospectId) {
        var byP = read().byProspect;
        var id = String(prospectId);
        return Object.prototype.hasOwnProperty.call(byP, id) ? byP[id] : {};
    }

    /* The checklist joined to whatever has been recorded against it. Items with
       nothing recorded come back as not_started rather than absent, so a caller
       never has to decide what a missing key means. */
    function itemsFor(prospectId) {
        var list = checklistFor(prospectId);
        var state = stateFor(prospectId);
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var k = list[i].key;
            var rec = Object.prototype.hasOwnProperty.call(state, k) ? state[k] : null;
            out.push({
                key: k,
                label: list[i].label,
                status: (rec && STATUSES.indexOf(rec.status) >= 0) ? rec.status : 'not_started',
                note: (rec && rec.note) ? rec.note : null,
                at: (rec && rec.at) ? rec.at : null
            });
        }
        return out;
    }

    function set(prospectId, itemKey, status, note) {
        if (STATUSES.indexOf(status) < 0) return { ok: false, err: 'Unknown status: ' + status };
        if (!prospectId || !itemKey) return { ok: false, err: 'An item needs a prospect and a key.' };
        var data = read();
        var id = String(prospectId);
        if (!data.byProspect[id]) data.byProspect[id] = {};
        data.byProspect[id][itemKey] = {
            status: status,
            /* The note is where it came from. "Owner identified" with no source is
               a claim; with "ECHO facility report, 2026-08-19" it is a finding. */
            note: (note !== undefined && note !== null && String(note).trim() !== '')
                ? String(note) : null,
            at: new Date().toISOString()
        };
        return write(data);
    }

    function clear(prospectId, itemKey) {
        var data = read();
        var id = String(prospectId);
        if (!data.byProspect[id]) return { ok: true, err: null };
        delete data.byProspect[id][itemKey];
        return write(data);
    }

    /* { pct, complete, inProgress, outstanding, applicable, total, na }
       pct is null when nothing applies -- see the header. */
    function completeness(prospectId) {
        var items = itemsFor(prospectId);
        var complete = 0, inProgress = 0, na = 0;
        for (var i = 0; i < items.length; i++) {
            if (items[i].status === 'complete') complete++;
            else if (items[i].status === 'in_progress') inProgress++;
            else if (items[i].status === 'na') na++;
        }
        var applicable = items.length - na;
        return {
            total: items.length,
            na: na,
            applicable: applicable,
            complete: complete,
            inProgress: inProgress,
            outstanding: applicable - complete - inProgress,
            pct: applicable > 0 ? Math.round((complete / applicable) * 100) : null
        };
    }

    /* Sortable. A prospect with nothing applicable sorts BELOW one at 0%, because
       0% of nine questions is a site somebody has started thinking about and
       "nothing applies" is a site nobody has. -1 keeps it out of the way without
       pretending it is a number. */
    function sortKey(prospectId) {
        var c = completeness(prospectId);
        return c.pct === null ? -1 : c.pct;
    }

    /* Every tracked prospect, ranked. The brief's "ten fully enriched prospects
       are worth more than a hundred raw ones" as a list you can actually read. */
    function ranked() {
        if (typeof SiteData === 'undefined' || !SiteData.list) return [];
        var sites = SiteData.list() || [];
        var out = [];
        for (var i = 0; i < sites.length; i++) {
            if (!sites[i] || !sites[i].id) continue;
            var c = completeness(sites[i].id);
            out.push({ id: sites[i].id, name: sites[i].name || sites[i].id,
                       stage: sites[i].stage, completeness: c });
        }
        out.sort(function (a, b) {
            var pa = a.completeness.pct === null ? -1 : a.completeness.pct;
            var pb = b.completeness.pct === null ? -1 : b.completeness.pct;
            if (pa !== pb) return pb - pa;
            return b.completeness.complete - a.completeness.complete;
        });
        return out;
    }

    function reset() { _cache = null; }

    return {
        KEY: KEY,
        STATUSES: STATUSES,
        checklistFor: checklistFor,
        itemsFor: itemsFor,
        set: set,
        clear: clear,
        completeness: completeness,
        sortKey: sortKey,
        ranked: ranked,
        reset: reset
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CrmEnrichment;
