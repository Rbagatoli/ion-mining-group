/* ===== Today =====
 *
 * The screen that answers "what do I do this morning". Three sections, in the
 * order you would work them:
 *
 *   Overdue        follow-ups past their date, most overdue first. The one that
 *                  has waited longest has done the most damage.
 *   Due today      what was promised for today.
 *   Going quiet    prospects in an active stage with no interaction inside that
 *                  stage's patience.
 *
 * NEVER CONTACTED IS ITS OWN SECTION, NOT PART OF "GOING QUIET". A prospect
 * sitting in `contacted` that has never had an interaction logged has a
 * different problem from one that was contacted and has gone silent, and it
 * needs a different action. Folding the two would bury the ones needing a first
 * call under the ones needing a second — and the whole value of this screen is
 * that the next action is obvious without reading.
 *
 * IT IS ALL DERIVED. Nothing on this page is stored; it is follow-up dates and
 * interaction timestamps read at the moment the page opens. There is no "today
 * list" to get out of step with the records it came from.
 */
var ProspectToday = (function () {
    'use strict';

    function esc(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function nameOf(prospectId) {
        var r = (typeof SiteData !== 'undefined' && SiteData.get) ? SiteData.get(prospectId) : null;
        return (r && r.name) ? r.name : String(prospectId);
    }

    function stageLabel(prospectId) {
        var r = (typeof SiteData !== 'undefined' && SiteData.get) ? SiteData.get(prospectId) : null;
        if (!r) return '';
        return (typeof CrmConfig !== 'undefined') ? CrmConfig.stageLabel(r.stage) : r.stage;
    }

    /* Everything this screen shows, as data. Kept separate from the rendering so
       it can be asserted without a DOM — the arithmetic is what goes wrong here,
       not the markup. */
    function build(nowMs) {
        var out = { overdue: [], dueToday: [], goingQuiet: [], neverContacted: [] };
        if (typeof CrmFollowups === 'undefined') return out;

        var od = CrmFollowups.overdue(nowMs);
        for (var i = 0; i < od.length; i++) {
            out.overdue.push({
                followup: od[i],
                prospect_id: od[i].prospect_id,
                name: nameOf(od[i].prospect_id),
                stage: stageLabel(od[i].prospect_id),
                days: CrmFollowups.daysOverdue(od[i], nowMs)
            });
        }

        var dt = CrmFollowups.dueToday(nowMs);
        for (var j = 0; j < dt.length; j++) {
            out.dueToday.push({
                followup: dt[j],
                prospect_id: dt[j].prospect_id,
                name: nameOf(dt[j].prospect_id),
                stage: stageLabel(dt[j].prospect_id)
            });
        }

        if (typeof SiteData === 'undefined' || !SiteData.list ||
            typeof CrmConfig === 'undefined' || typeof CrmInteractions === 'undefined') return out;

        var actives = CrmConfig.activeStageKeys();
        var sites = SiteData.list() || [];
        for (var k = 0; k < sites.length; k++) {
            var s = sites[k];
            if (!s || actives.indexOf(s.stage) < 0) continue;
            var since = CrmInteractions.daysSinceContact(s.id, nowMs);
            if (since === null) {
                /* In an active stage and never actually spoken to. Days in stage
                   is the right clock for this one — how long it has been sitting
                   there waiting for a first call. */
                out.neverContacted.push({
                    prospect_id: s.id, name: s.name || s.id,
                    stage: CrmConfig.stageLabel(s.stage),
                    daysInStage: (SiteData.daysInStage ? SiteData.daysInStage(s.id, nowMs) : null)
                });
                continue;
            }
            if (CrmInteractions.isStale(s.id, s.stage, nowMs)) {
                out.goingQuiet.push({
                    prospect_id: s.id, name: s.name || s.id,
                    stage: CrmConfig.stageLabel(s.stage),
                    days: since,
                    limit: CrmConfig.staleDaysFor(s.stage),
                    last: CrmInteractions.latest(s.id)
                });
            }
        }
        /* Quietest first, and longest-waiting first, for the same reason the
           overdue list is ordered that way. */
        out.goingQuiet.sort(function (a, b) { return b.days - a.days; });
        out.neverContacted.sort(function (a, b) {
            return (b.daysInStage === null ? -1 : b.daysInStage) -
                   (a.daysInStage === null ? -1 : a.daysInStage);
        });
        return out;
    }

    function row(inner, id) {
        return '<li class="pt-row" data-id="' + esc(id) + '">' + inner + '</li>';
    }

    function section(title, count, body, tone) {
        return '<section class="pt-sec t-' + esc(tone || 'neutral') + '">' +
            '<header class="pt-sechead">' +
                '<h2>' + esc(title) + '</h2>' +
                '<span class="pt-count">' + count + '</span>' +
            '</header>' + body + '</section>';
    }

    function render(hostId, nowMs) {
        var host = document.getElementById(hostId || 'ptoday');
        if (!host) return null;
        var d = build(nowMs);
        var html = '';
        /* EMPTY SECTIONS COLLAPSE. Four always-rendered boxes of near-identical weight made
           a normal morning read as a wall of grey, and the day's actual answer -- is anything
           due -- had to be read out of 11px italics inside each one. A section renders only
           when it has rows; the all-clears combine into one quiet line at the bottom, so
           silence is still stated (an absent section could mean broken) without costing a
           card each. */
        var clear = [];

        var od = '';
        for (var i = 0; i < d.overdue.length; i++) {
            var o = d.overdue[i];
            od += row(
                '<span class="pt-late">' + esc(String(o.days)) +
                    (o.days === 1 ? ' day late' : ' days late') + '</span>' +
                '<span class="pt-name">' + esc(o.name) + '</span>' +
                '<span class="pt-what">' + esc(o.followup.description) + '</span>' +
                '<span class="pt-stage">' + esc(o.stage) + '</span>' +
                '<button type="button" class="pt-done" data-fid="' + esc(o.followup.id) + '">Done</button>',
                o.prospect_id);
        }
        if (od) html += section('Overdue', d.overdue.length, '<ul class="pt-list">' + od + '</ul>', 'negative');
        else clear.push('nothing overdue');

        var dt = '';
        for (var j = 0; j < d.dueToday.length; j++) {
            var t = d.dueToday[j];
            dt += row(
                /* An empty first cell so the columns line up with the sections
                   above and below. Without it the due-today rows slide one column
                   left and the four sections stop reading as one list. */
                '<span class="pt-late"></span>' +
                '<span class="pt-name">' + esc(t.name) + '</span>' +
                '<span class="pt-what">' + esc(t.followup.description) + '</span>' +
                '<span class="pt-stage">' + esc(t.stage) + '</span>' +
                '<button type="button" class="pt-done" data-fid="' + esc(t.followup.id) + '">Done</button>',
                t.prospect_id);
        }
        if (dt) html += section('Due today', d.dueToday.length, '<ul class="pt-list">' + dt + '</ul>', 'active');
        else clear.push('nothing due today');

        var gq = '';
        for (var k = 0; k < d.goingQuiet.length; k++) {
            var g = d.goingQuiet[k];
            gq += row(
                '<span class="pt-late">' + esc(String(g.days)) + ' days silent</span>' +
                '<span class="pt-name">' + esc(g.name) + '</span>' +
                '<span class="pt-what">' +
                    (g.last && g.last.summary ? esc(g.last.summary) : '<em class="pt-absent">no summary</em>') +
                '</span>' +
                '<span class="pt-stage">' + esc(g.stage) + '</span><span></span>',
                g.prospect_id);
        }
        if (gq) html += section('Going quiet', d.goingQuiet.length, '<ul class="pt-list">' + gq + '</ul>', 'warm');
        else clear.push('nothing going quiet');

        var nc = '';
        for (var m = 0; m < d.neverContacted.length; m++) {
            var n = d.neverContacted[m];
            nc += row(
                '<span class="pt-late">' +
                    (n.daysInStage === null ? '<em class="pt-absent">not moved</em>'
                                            : esc(String(n.daysInStage)) + ' days waiting') + '</span>' +
                '<span class="pt-name">' + esc(n.name) + '</span>' +
                '<span class="pt-what"><em class="pt-absent">never contacted</em></span>' +
                '<span class="pt-stage">' + esc(n.stage) + '</span><span></span>',
                n.prospect_id);
        }
        if (nc) html += section('Waiting on a first call', d.neverContacted.length,
                                '<ul class="pt-list">' + nc + '</ul>', 'neutral');
        else clear.push('everything active has been contacted');

        if (clear.length) {
            html += '<p class="pt-clear">' +
                (clear.length === 4 ? 'All clear \u2014 ' : '') +
                esc(clear.join(' \u00b7 ')) + '.</p>';
        }

        host.innerHTML = html;
        return d;
    }

    return { build: build, render: render };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ProspectToday;
