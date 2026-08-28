/* ===== The pipeline board =====
 *
 * Columns are stages, cards are tracked prospects. The third view of the same
 * working set the map and the table already show — not a different set, and not
 * a copy of one.
 *
 * WHAT IS ON A CARD, and why each of them is there rather than something else:
 *
 *   name            what you would say on the phone
 *   source + MW     whether it is worth the call at all
 *   score           the ranking the existing engine already computes
 *   days in stage   the only number on the card that is about YOU rather than
 *                   the asset, and the one that makes a stalled column obvious
 *                   at a glance rather than after an audit
 *
 * DAYS IN STAGE IS NULL, NOT ZERO, for a prospect that has never moved. It has
 * not been sitting for no time; it has never started. A zero there would read as
 * "just touched" on exactly the prospects nobody has touched at all, which is
 * backwards and is the single most misleading thing this card could say.
 *
 * WHAT IT DRAWS FROM. Only SiteData records — things somebody chose to track.
 * The board deliberately does not show the four hundred raw detections in
 * ProspectStore: a pipeline is what you are working, and a list of everything
 * the satellites found is what the map is for.
 */
var ProspectBoard = (function () {
    'use strict';

    function esc(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /* Absent is rendered, never blanked. A card with a silent gap where the
       capacity should be is a card that looks complete and is not. */
    function mw(kw) {
        if (kw === null || kw === undefined || !isFinite(kw)) return '<span class="pb-absent">no estimate</span>';
        var m = kw / 1000;
        return esc(m >= 10 ? m.toFixed(0) : m.toFixed(1)) + ' <span class="pb-unit">MW</span>';
    }

    /* 'landfill_gas' is a key, not a label. Rendering the key put LANDFILL_GAS on
       every card in the pipeline -- readable, but it is the database talking. */
    function sourceLabel(rec) {
        var v = rec.energy_type || rec.source || null;
        if (!v) return 'unknown';
        v = String(v).replace(/_/g, ' ');
        return v.charAt(0).toUpperCase() + v.slice(1);
    }

    /* The same answer the ranked table gives, from the same helper. A card that said "building"
       while the table did not would send you looking for the difference. */
    var GATE_LABELS = {
        target_screen: 'target & screen', contact_loi: 'contact & LOI', diligence: 'diligence',
        agreements: 'agreements', permitting_complete: 'permitted', construction: 'construction',
        engineering_procurement: 'engineering & procurement', commissioning: 'commissioning',
        operating: 'operating'
    };

    function promoted(rec) {
        if (typeof ProjectData === 'undefined' || !ProjectData.liveFor) return '';
        var p = ProjectData.liveFor(rec.id);
        if (!p) return '';
        return ' <span class="pb-promoted" title="Project ' + esc(p.id) + ' — ' +
               esc(GATE_LABELS[p.gate] || p.gate) + '">building</span>';
    }

    function scoreOf(rec) {
        var v = rec && rec.custom_fields ? rec.custom_fields.opportunity_score : null;
        if (v === null || v === undefined || !isFinite(v)) return null;
        return Math.round(v);
    }

    function daysLabel(d) {
        if (d === null || d === undefined) return '<span class="pb-absent">not moved yet</span>';
        if (d === 0) return 'today';
        return esc(String(d)) + (d === 1 ? ' day' : ' days');
    }

    /* Silence that matters, per the stage's own patience rather than one number
       for the whole pipeline: a week without a reply after an outreach email is
       normal and a week of silence during diligence is not. */
    function isStale(rec, days) {
        if (days === null || days === undefined) return false;
        if (typeof CrmConfig === 'undefined') return false;
        var limit = CrmConfig.staleDaysFor(rec.stage);
        return (limit !== null && days > limit);
    }

    /* The next thing owed, so the board answers "what is outstanding here"
       without opening anything. Absent when nothing is owed — an empty line
       would read as a missing date rather than as no promise made. */
    function due(rec) {
        if (typeof CrmFollowups === 'undefined' || !CrmFollowups.nextFor) return '';
        var f = CrmFollowups.nextFor(rec.id);
        if (!f) return '';
        var late = f.due_date < CrmFollowups.today();
        return '<div class="pb-due' + (late ? ' is-late' : '') + '">' +
               (late ? 'overdue: ' : 'due ') + esc(f.due_date) + '</div>';
    }

    /* How much is known about this site, as a bar you can read across a column.
       Ten fully enriched prospects are worth more than a hundred raw ones, and a
       board that shows only stage and score cannot say which is which. Absent
       when nothing on the checklist applies -- see CrmEnrichment for why that is
       null rather than 100%. */
    function enrich(rec) {
        if (typeof CrmEnrichment === 'undefined' || !CrmEnrichment.completeness) return '';
        var c = CrmEnrichment.completeness(rec.id);
        if (c.pct === null) return '';
        return '<div class="pb-enrich" title="' + c.complete + ' of ' + c.applicable +
                    ' researched">' +
                '<span class="pb-ebar"><span style="width:' + c.pct + '%"></span></span>' +
                '<span class="pb-epct">' + c.pct + '%</span>' +
            '</div>';
    }

    function card(rec, nowMs) {
        var days = (typeof SiteData !== 'undefined' && SiteData.daysInStage)
            ? SiteData.daysInStage(rec.id, nowMs) : null;
        var sc = scoreOf(rec);
        var stale = isStale(rec, days);
        return '' +
        '<article class="pb-card' + (stale ? ' is-stale' : '') + '" draggable="true" ' +
                 'data-id="' + esc(rec.id) + '" tabindex="0" ' +
                 'aria-label="' + esc(rec.name || rec.id) + '">' +
            '<h4 class="pb-name">' + esc(rec.name || rec.id) + promoted(rec) + '</h4>' +
            '<div class="pb-meta">' +
                '<span class="pb-src">' + esc(sourceLabel(rec)) + '</span>' +
                '<span class="pb-kw">' + mw(rec.usable_kw !== null ? rec.usable_kw : rec.nameplate_kw) + '</span>' +
            '</div>' +
            due(rec) +
            enrich(rec) +
            '<div class="pb-foot">' +
                '<span class="pb-days' + (stale ? ' is-stale' : '') + '">' + daysLabel(days) + '</span>' +
                (sc === null ? '<span class="pb-absent">unscored</span>'
                             : '<span class="pb-score">' + esc(String(sc)) + '</span>') +
            '</div>' +
        '</article>';
    }

    /* Grouped by the CONFIGURED stages, in their configured order, so a stage
       somebody adds appears as a column without a line of code changing here.
       A record on a stage the config no longer lists still has to go somewhere —
       it lands in an "Unplaced" column rather than vanishing, because a prospect
       you cannot see is a prospect you cannot rescue. */
    function group(records) {
        var stages = (typeof CrmConfig !== 'undefined') ? CrmConfig.stages() : [];
        var cols = [], index = {};
        for (var i = 0; i < stages.length; i++) {
            cols.push({ key: stages[i].key, label: stages[i].label, tone: stages[i].tone || 'neutral', items: [] });
            index[stages[i].key] = cols.length - 1;
        }
        var orphans = [];
        for (var r = 0; r < records.length; r++) {
            var k = records[r].stage;
            if (Object.prototype.hasOwnProperty.call(index, k)) cols[index[k]].items.push(records[r]);
            else orphans.push(records[r]);
        }
        if (orphans.length) {
            cols.push({ key: '__unplaced', label: 'Unplaced', tone: 'negative', items: orphans });
        }
        return cols;
    }

    /* Highest score first inside a column, then oldest-in-stage first, because a
       high score that has sat for six weeks is the one to ring today. Records
       with no score sort last rather than as zero — unscored is not bad. */
    function sortColumn(items, nowMs) {
        return items.slice().sort(function (a, b) {
            var sa = scoreOf(a), sb = scoreOf(b);
            if (sa === null && sb !== null) return 1;
            if (sb === null && sa !== null) return -1;
            if (sa !== null && sb !== null && sa !== sb) return sb - sa;
            var da = (typeof SiteData !== 'undefined' && SiteData.daysInStage) ? SiteData.daysInStage(a.id, nowMs) : null;
            var db = (typeof SiteData !== 'undefined' && SiteData.daysInStage) ? SiteData.daysInStage(b.id, nowMs) : null;
            return (db === null ? -1 : db) - (da === null ? -1 : da);
        });
    }

    function totalMw(items) {
        var kw = 0, any = false;
        for (var i = 0; i < items.length; i++) {
            var v = items[i].usable_kw !== null ? items[i].usable_kw : items[i].nameplate_kw;
            if (v !== null && v !== undefined && isFinite(v)) { kw += v; any = true; }
        }
        return any ? kw : null;
    }

    function render(records, hostId, nowMs) {
        var host = document.getElementById(hostId || 'pboard');
        if (!host) return null;
        var cols = group(records || []);
        var html = '';
        for (var i = 0; i < cols.length; i++) {
            var c = cols[i];
            var items = sortColumn(c.items, nowMs);
            var kw = totalMw(items);
            html += '<section class="pb-col t-' + esc(c.tone) + '" data-stage="' + esc(c.key) + '">' +
                '<header class="pb-colhead">' +
                    '<span class="pb-collabel">' + esc(c.label) + '</span>' +
                    '<span class="pb-colcount">' + items.length + '</span>' +
                '</header>' +
                '<div class="pb-colsub">' +
                    (kw === null ? '<span class="pb-absent">no capacity estimated</span>' : mw(kw) + ' total') +
                '</div>' +
                '<div class="pb-drop" data-stage="' + esc(c.key) + '">';
            for (var j = 0; j < items.length; j++) html += card(items[j], nowMs);
            if (!items.length) html += '<p class="pb-empty">Nothing here</p>';
            html += '</div></section>';
        }
        host.innerHTML = html;
        return cols;
    }

    return {
        render: render,
        group: group,
        sortColumn: sortColumn,
        card: card,
        totalMw: totalMw,
        sourceLabel: sourceLabel,
        enrich: enrich,
        isStale: isStale,
        scoreOf: scoreOf
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ProspectBoard;
