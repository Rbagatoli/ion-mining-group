/* ===== Pipeline analytics =====
 *
 * A handful of numbers, not a BI suite. The brief is explicit that these only
 * mean anything after twenty or thirty prospects have moved through, and that
 * shapes the module more than any of the arithmetic does:
 *
 * EVERY FIGURE CARRIES ITS n, AND A THIN ONE SAYS SO. A median time-in-stage
 * computed from two prospects is not a median, it is two numbers with a line
 * between them — and printed at the same weight as everything else it will get
 * planned against. So each statistic returns { value, n, thin }, and the view
 * renders a thin one as the count it actually has rather than as a figure. This
 * repo does not let a number wear more authority than its basis.
 *
 * THE HIGHEST-VALUE OUTPUT IS THE DEAD REASONS, and it is the cheapest. Knowing
 * that eleven of your last twenty died on gas quality and two on price tells you
 * what to screen for before dialling, which is the whole difference between a
 * hundred raw prospects and ten worth phoning.
 */
var ProspectAnalytics = (function () {
    'use strict';

    /* Below this a figure is reported as its raw counts rather than as a
       statistic. Five is not a real sample either — it is the point below which
       a median is actively misleading rather than merely noisy. */
    var MIN_N = 5;

    function stat(value, n) {
        return { value: n > 0 ? value : null, n: n, thin: n < MIN_N };
    }

    function sites() {
        if (typeof SiteData === 'undefined' || !SiteData.list) return [];
        return (SiteData.list() || []).filter(function (s) { return s && s.id; });
    }

    function kwOf(s) {
        var v = (s.usable_kw !== null && s.usable_kw !== undefined) ? s.usable_kw : s.nameplate_kw;
        return (v === null || v === undefined || !isFinite(v)) ? null : v;
    }

    // ---- Where everything is ------------------------------------------------
    function byStage() {
        var stages = (typeof CrmConfig !== 'undefined') ? CrmConfig.stages() : [];
        var list = sites();
        var out = [];
        for (var i = 0; i < stages.length; i++) {
            var count = 0, kw = 0, measured = 0;
            for (var j = 0; j < list.length; j++) {
                if (list[j].stage !== stages[i].key) continue;
                count++;
                var v = kwOf(list[j]);
                if (v !== null) { kw += v; measured++; }
            }
            out.push({
                key: stages[i].key, label: stages[i].label, tone: stages[i].tone,
                count: count,
                /* null rather than 0 when nothing in the column has an estimate:
                   "no capacity measured here" is a different fact from "no
                   capacity here", and a 0 MW column would assert the second. */
                kw: measured > 0 ? kw : null,
                measured: measured
            });
        }
        return out;
    }

    // ---- How long things sit ------------------------------------------------
    function median(nums) {
        if (!nums.length) return null;
        var a = nums.slice().sort(function (x, y) { return x - y; });
        var mid = Math.floor(a.length / 2);
        return (a.length % 2) ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
    }

    /* Only CLOSED legs count. A prospect still sitting in diligence has been
       there for a duration that is not yet its duration, and including it drags
       every median toward however long ago you started using the app. */
    function timeInStage(nowMs) {
        var byKey = {};
        var list = sites();
        for (var i = 0; i < list.length; i++) {
            if (typeof SiteData.stageHistory !== 'function') break;
            var legs = SiteData.stageHistory(list[i].id, nowMs);
            for (var j = 0; j < legs.length; j++) {
                if (legs[j].open) continue;
                if (legs[j].days === null) continue;
                var k = legs[j].to;
                (byKey[k] = byKey[k] || []).push(legs[j].days);
            }
        }
        var stages = (typeof CrmConfig !== 'undefined') ? CrmConfig.stages() : [];
        var out = [];
        for (var s = 0; s < stages.length; s++) {
            var vals = byKey[stages[s].key] || [];
            out.push({
                key: stages[s].key, label: stages[s].label,
                median: stat(median(vals), vals.length)
            });
        }
        return out;
    }

    // ---- Whether things move on ---------------------------------------------
    /* Every stage a prospect has EVER been in, from the log, plus where it is
       now. A prospect added straight into `contacted` has no transition into it,
       so its current stage has to count as reached or the first column of every
       funnel reads zero. */
    function reachedSets() {
        var reached = {};
        var list = sites();
        for (var i = 0; i < list.length; i++) {
            var id = list[i].id;
            var set = {};
            set[list[i].stage] = true;
            if (typeof CrmLog !== 'undefined' && CrmLog.forProspect) {
                var hist = CrmLog.forProspect(id, 'stage');
                for (var j = 0; j < hist.length; j++) {
                    if (hist[j].from) set[hist[j].from] = true;
                    if (hist[j].to) set[hist[j].to] = true;
                }
            }
            reached[id] = set;
        }
        return reached;
    }

    /* ADVANCED PAST A STAGE, not "moved to the next one". Prospects skip stages
       — a warm intro can go straight from contacted to term sheet — and a
       strict A-to-B conversion would score the stage that was skipped as a
       failure and the one after it as impossible. Reaching anything further
       along the configured order is what "advanced" means. */
    function conversion() {
        var stages = (typeof CrmConfig !== 'undefined') ? CrmConfig.stages() : [];
        var order = {};
        for (var o = 0; o < stages.length; o++) order[stages[o].key] = o;
        var reached = reachedSets();
        var out = [];
        for (var i = 0; i < stages.length; i++) {
            var key = stages[i].key;
            /* Terminal stages have nothing to advance to. */
            if (key === 'dead' || key === 'closed_won') continue;
            var got = 0, on = 0;
            for (var id in reached) {
                if (!Object.prototype.hasOwnProperty.call(reached, id)) continue;
                if (!reached[id][key]) continue;
                got++;
                for (var k in reached[id]) {
                    if (!Object.prototype.hasOwnProperty.call(reached[id], k)) continue;
                    if (k === 'dead') continue;                 // dying is not advancing
                    if (order[k] !== undefined && order[k] > order[key]) { on++; break; }
                }
            }
            out.push({
                key: key, label: stages[i].label,
                reached: got, advanced: on,
                rate: stat(got > 0 ? Math.round((on / got) * 100) : null, got)
            });
        }
        return out;
    }

    // ---- Why things die ------------------------------------------------------
    /* Read from the transition log rather than from the records, so a prospect
       that died and later came back still counts its death. That is the point:
       the reasons are about what happens to deals, not about what is currently
       in the dead column. */
    function deadReasons() {
        if (typeof CrmLog === 'undefined') return { rows: [], total: 0 };
        var counts = {}, total = 0;
        var all = CrmLog.all();
        for (var i = 0; i < all.length; i++) {
            if (all[i].kind !== 'stage' || all[i].to !== 'dead') continue;
            var r = all[i].dead_reason || 'unrecorded';
            counts[r] = (counts[r] || 0) + 1;
            total++;
        }
        var rows = Object.keys(counts).map(function (k) {
            return {
                key: k,
                label: (k === 'unrecorded')
                    ? 'Not recorded'
                    : ((typeof CrmConfig !== 'undefined') ? CrmConfig.deadReasonLabel(k) : k),
                count: counts[k],
                pct: total > 0 ? Math.round((counts[k] / total) * 100) : null
            };
        }).sort(function (a, b) { return b.count - a.count; });
        return { rows: rows, total: total };
    }

    // ---- Outreach and whether it lands ---------------------------------------
    /* Response is read from the OUTCOME rather than inferred from a later
       inbound message, because the outcome is a fact somebody recorded and the
       inference is a guess about timing. Interactions with no outcome recorded
       leave the denominator entirely — an unanswered question is not a no. */
    function outreach() {
        if (typeof CrmLog === 'undefined') return { sent: 0, answered: 0, silent: 0, rate: stat(null, 0) };
        var all = CrmLog.all();
        var superseded = (CrmLog.supersededIds) ? CrmLog.supersededIds() : {};
        var sent = 0, answered = 0, silent = 0;
        for (var i = 0; i < all.length; i++) {
            var e = all[i];
            if (e.kind !== 'interaction') continue;
            if (superseded[e.id]) continue;
            if (e.interaction_type === 'note') continue;
            if (e.direction !== 'outbound') continue;
            sent++;
            if (e.outcome === 'positive' || e.outcome === 'neutral' || e.outcome === 'negative') answered++;
            else if (e.outcome === 'no_answer' || e.outcome === 'bounced') silent++;
        }
        var judged = answered + silent;
        return {
            sent: sent, answered: answered, silent: silent,
            unrecorded: sent - judged,
            rate: stat(judged > 0 ? Math.round((answered / judged) * 100) : null, judged)
        };
    }

    // ---- How well researched the book is --------------------------------------
    function enrichmentSpread() {
        var buckets = [
            { label: 'Nothing applies', lo: null, hi: null, count: 0 },
            { label: '0%',      lo: 0,  hi: 0,   count: 0 },
            { label: '1–25%',   lo: 1,  hi: 25,  count: 0 },
            { label: '26–50%',  lo: 26, hi: 50,  count: 0 },
            { label: '51–75%',  lo: 51, hi: 75,  count: 0 },
            { label: '76–99%',  lo: 76, hi: 99,  count: 0 },
            { label: '100%',    lo: 100, hi: 100, count: 0 }
        ];
        if (typeof CrmEnrichment === 'undefined') return buckets;
        var list = sites();
        for (var i = 0; i < list.length; i++) {
            var pct = CrmEnrichment.completeness(list[i].id).pct;
            if (pct === null) { buckets[0].count++; continue; }
            for (var b = 1; b < buckets.length; b++) {
                if (pct >= buckets[b].lo && pct <= buckets[b].hi) { buckets[b].count++; break; }
            }
        }
        return buckets;
    }

    // ---- Rendering ------------------------------------------------------------
    /* The whole design problem on this screen is that every figure on it is
       computed from too little data to be a figure yet, and will be for months.
       So a thin statistic is printed WITH ITS BASIS ATTACHED rather than alone:
       "33%" beside "3 prospects" is a number you can weigh, and "33%" on its own
       is a number you will plan against. */

    function esc(x) {
        return String(x === null || x === undefined ? '' : x)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function absent(what) { return '<span class="pa-absent">' + esc(what) + '</span>'; }

    function mw(kw) {
        if (kw === null) return absent('not measured');
        var m = kw / 1000;
        return esc(m >= 10 ? m.toFixed(0) : m.toFixed(1)) + ' <span class="pa-unit">MW</span>';
    }

    function asPct(v) { return v + '%'; }
    function asDays(v) {
        if (v === 0) return 'same day';
        return v + (v === 1 ? ' day' : ' days');
    }

    /* `basis` names what the n counts. Three prospects and three closed legs are
       thin in different ways, and a reader who cannot tell which cannot tell what
       would make the number trustworthy. */
    function figure(st, basis, fmt) {
        if (!st || st.n === 0 || st.value === null) return absent('nothing to measure');
        var body = (fmt || asPct)(st.value);
        var count = st.n + ' ' + basis + (st.n === 1 ? '' : 's');
        if (!st.thin) return '<span class="pa-fig">' + esc(body) + '</span>';
        return '<span class="pa-fig is-thin" title="' +
                   esc('From ' + count + ', below the ' + MIN_N + ' this screen treats as a sample') +
               '">' + esc(body) + '</span> <span class="pa-basis">' + esc(count) + '</span>';
    }

    function sec(title, right, body) {
        return '<section class="pa-sec">' +
            '<header class="pa-head"><h2>' + esc(title) + '</h2>' +
            (right ? '<span class="pa-n">' + right + '</span>' : '') +
            '</header>' + body + '</section>';
    }

    function bars(rows) {
        var top = 0, i;
        for (i = 0; i < rows.length; i++) if (rows[i].count > top) top = rows[i].count;
        var html = '<ul class="pa-bars">';
        for (i = 0; i < rows.length; i++) {
            var w = top > 0 ? Math.round((rows[i].count / top) * 100) : 0;
            html += '<li' + (rows[i].key === 'unrecorded' ? ' class="is-unrecorded"' : '') + '>' +
                '<span class="pa-bl">' + esc(rows[i].label) + '</span>' +
                '<span class="pa-bar"><span style="width:' + w + '%"></span></span>' +
                '<span class="pa-bv">' + rows[i].count +
                    (rows[i].pct === null ? '' : ' <em>' + rows[i].pct + '%</em>') + '</span>' +
            '</li>';
        }
        return html + '</ul>';
    }

    function render(hostId, nowMs) {
        var host = document.getElementById(hostId || 'panalytics');
        if (!host) return null;
        var d = summary(nowMs);

        if (d.tracked === 0) {
            host.innerHTML = '<div class="p-empty">' +
                '<h2>Nothing to analyse yet</h2>' +
                '<p>These figures are read out of the pipeline as it moves. Track a ' +
                'few prospects and work them, and this screen fills itself in.</p>' +
                '<p><a class="p-golink" href="./map.html">Go to the map &rarr;</a></p>' +
            '</div>';
            return d;
        }

        var html = '';

        /* Said once, at the top, rather than caveated onto every figure below.
           The brief is explicit that these mean something after twenty or thirty
           prospects have moved through, and the screen should not pretend
           otherwise for the months before that. */
        if (d.tracked < 20) {
            html += '<p class="pa-caveat">Computed from ' + d.tracked +
                    (d.tracked === 1 ? ' prospect' : ' prospects') +
                    '. Below twenty or thirty these describe the handful you have, ' +
                    'not the pipeline &mdash; figures thin enough to mislead are shown ' +
                    'with the count they came from.</p>';
        }

        // 1. Why deals die -- first because it is the one that changes what you do.
        var dr = d.deadReasons;
        html += sec('Why deals die',
            dr.total ? dr.total + (dr.total === 1 ? ' death' : ' deaths') : '',
            dr.total === 0
                ? '<p class="pa-none">Nothing has died yet. Once a dozen have, this is ' +
                  'the list that tells you what to screen for before dialling.</p>'
                : bars(dr.rows) +
                  (dr.total < MIN_N
                      ? '<p class="pa-thin">Too few to rank with any confidence.</p>' : ''));

        // 2. Where everything is.
        var rows = '';
        for (var i = 0; i < d.byStage.length; i++) {
            var b = d.byStage[i];
            rows += '<tr' + (b.count === 0 ? ' class="is-zero"' : '') + '>' +
                '<td class="pa-stage t-' + esc(b.tone || 'neutral') + '">' + esc(b.label) + '</td>' +
                '<td class="pa-num">' + b.count + '</td>' +
                '<td class="pa-num">' + mw(b.kw) + '</td>' +
                /* How many of the column the capacity actually came from. A total
                   over two of five prospects is not the column's capacity, and
                   without this it reads as though it were. */
                '<td class="pa-of">' + (b.count === 0 ? ''
                    : (b.measured === b.count ? 'all' : b.measured + ' of ' + b.count)) + '</td>' +
            '</tr>';
        }
        html += sec('Where everything is', d.tracked + ' tracked',
            '<table class="pa-table"><thead><tr><th>Stage</th><th>Count</th>' +
            '<th>Capacity</th><th>Measured</th></tr></thead><tbody>' + rows + '</tbody></table>');

        // 3. Whether things move on.
        rows = '';
        for (var c = 0; c < d.conversion.length; c++) {
            var cv = d.conversion[c];
            rows += '<tr' + (cv.reached === 0 ? ' class="is-zero"' : '') + '>' +
                '<td class="pa-stage">' + esc(cv.label) + '</td>' +
                '<td class="pa-num">' + cv.reached + '</td>' +
                '<td class="pa-num">' + cv.advanced + '</td>' +
                '<td class="pa-num">' + figure(cv.rate, 'prospect', asPct) + '</td>' +
            '</tr>';
        }
        html += sec('Whether they move on', '',
            '<table class="pa-table"><thead><tr><th>Stage</th><th>Reached</th>' +
            '<th>Advanced past</th><th>Rate</th></tr></thead><tbody>' + rows + '</tbody></table>' +
            '<p class="pa-foot">Advanced past, not moved to the next one &mdash; a warm ' +
            'intro can go straight from contacted to a term sheet, and the stage it ' +
            'skipped is not a failure. Dying is not advancing.</p>');

        // 4. How long they sit.
        rows = '';
        for (var t = 0; t < d.timeInStage.length; t++) {
            var ts = d.timeInStage[t];
            rows += '<tr' + (ts.median.n === 0 ? ' class="is-zero"' : '') + '>' +
                '<td class="pa-stage">' + esc(ts.label) + '</td>' +
                '<td class="pa-num">' + figure(ts.median, 'closed leg', asDays) + '</td>' +
            '</tr>';
        }
        html += sec('How long they sit', '',
            '<table class="pa-table pa-table--two"><thead><tr><th>Stage</th>' +
            '<th>Median time</th></tr></thead><tbody>' + rows + '</tbody></table>' +
            '<p class="pa-foot">Only stages a prospect has left. One still sitting in ' +
            'diligence has been there for a duration that is not yet its duration.</p>');

        // 5. Outreach.
        var o = d.outreach;
        html += sec('Outreach', o.sent ? o.sent + ' sent' : '',
            o.sent === 0
                ? '<p class="pa-none">No outbound contact logged yet.</p>'
                : '<ul class="pa-stats">' +
                    '<li><span class="pa-sv">' + o.answered + '</span>' +
                        '<span class="pa-sl">answered</span></li>' +
                    '<li><span class="pa-sv">' + o.silent + '</span>' +
                        '<span class="pa-sl">no answer</span></li>' +
                    '<li><span class="pa-sv">' + o.unrecorded + '</span>' +
                        '<span class="pa-sl">outcome not recorded</span></li>' +
                    '<li><span class="pa-sv">' + figure(o.rate, 'recorded outcome', asPct) + '</span>' +
                        '<span class="pa-sl">response rate</span></li>' +
                  '</ul>' +
                  '<p class="pa-foot">The ones with no outcome recorded are left out of ' +
                  'the rate entirely rather than counted as silence. An unanswered ' +
                  'question is not a no.</p>');

        // 6. How well researched the book is.
        var sp = d.enrichment, spRows = [];
        for (var e = 0; e < sp.length; e++) {
            spRows.push({ key: 'b' + e, label: sp[e].label, count: sp[e].count, pct: null });
        }
        html += sec('Research coverage', '', bars(spRows) +
            '<p class="pa-foot">Share of each prospect&rsquo;s checklist that is done, ' +
            'counting only the items that apply to it.</p>');

        host.innerHTML = html;
        return d;
    }

    function summary(nowMs) {
        return {
            tracked: sites().length,
            byStage: byStage(),
            timeInStage: timeInStage(nowMs),
            conversion: conversion(),
            deadReasons: deadReasons(),
            outreach: outreach(),
            enrichment: enrichmentSpread(),
            minN: MIN_N
        };
    }

    return {
        MIN_N: MIN_N,
        summary: summary,
        render: render,
        byStage: byStage,
        timeInStage: timeInStage,
        conversion: conversion,
        deadReasons: deadReasons,
        outreach: outreach,
        enrichmentSpread: enrichmentSpread,
        median: median
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ProspectAnalytics;
