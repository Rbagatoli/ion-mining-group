/* ===== One-page deal summary =====
 *
 * For the moment the deal leaves the app: an email to a partner, a page in front
 * of you on a call, something to read on the drive out to the site. Everything on
 * it already exists somewhere in the record; the work is deciding what belongs on
 * one page and being straight about the rest.
 *
 * THE MOST IMPORTANT SECTION IS "NOT KNOWN". A summary that lists eight facts and
 * stops reads as a complete picture, and the reader has no way to tell whether
 * the ninth thing was checked and absent or never looked at. So absences are
 * printed as absences, and the outstanding research and the documents that are
 * not on file get their own section rather than being left off. On a page whose
 * whole purpose is to be read by somebody who cannot see the underlying record,
 * a quiet gap is worse than a stated one.
 *
 * NOTHING IS COMPUTED HERE. No score is recalculated, no rate converted, no
 * capacity estimated. Every number on the page is read from where it was
 * recorded, carries how it got there, and if it was never recorded the page says
 * so. A summary that derived a figure would be a fourth place economics lives.
 *
 * TERMS ARE "AS DISCUSSED" UNTIL A SIGNED AGREEMENT IS ON FILE. A quoted rate in
 * this record is what somebody said on a phone call. Printing it under a heading
 * that does not say so is how a conversation becomes a commitment in somebody
 * else's memory.
 */
var ProspectSummary = (function () {
    'use strict';

    function has(v) { return v !== null && v !== undefined && String(v).trim() !== ''; }

    function esc(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function day(iso) { return iso ? String(iso).slice(0, 10) : null; }

    function titleCase(v) {
        return String(v || '').replace(/_/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); });
    }

    /* Every field on the page goes through here, so "absent" has exactly one
       representation and it is never an empty string. */
    function fact(label, value, note) {
        return { label: label, value: has(value) ? String(value) : null, note: note || null };
    }

    /* site-model stores these as keys. Spelling them out matters more here than
       anywhere else in the app, because the qualifier is the difference between
       two numbers that look comparable and are not: a $/GJ figure is the fuel and
       nothing else, and a $/kWh figure is everything. A reader who does not know
       which one they are looking at cannot use either. An unrecognised key prints
       as itself rather than disappearing. */
    var RATE_UNITS = {
        usd_kwh: { label: '$/kWh', basis: 'all-in power' },
        usd_gj:  { label: '$/GJ',  basis: 'fuel only' },
        usd_mcf: { label: '$/Mcf', basis: 'fuel only' }
    };

    function rateUnit(key) {
        if (!has(key)) return null;
        return Object.prototype.hasOwnProperty.call(RATE_UNITS, key)
            ? RATE_UNITS[key] : { label: String(key), basis: null };
    }

    function mw(kw) {
        if (kw === null || kw === undefined || !isFinite(kw)) return null;
        var m = kw / 1000;
        return (m >= 10 ? m.toFixed(0) : m.toFixed(1)) + ' MW';
    }

    function build(prospectId, nowMs) {
        if (typeof SiteData === 'undefined' || !SiteData.get) return null;
        var rec = SiteData.get(prospectId);
        if (!rec) return null;

        var out = { id: rec.id, name: rec.name || rec.id, generated: new Date().toISOString() };

        // ---- Where it stands ------------------------------------------------
        var stageLabel = (typeof CrmConfig !== 'undefined')
            ? CrmConfig.stageLabel(rec.stage) : rec.stage;
        var days = (SiteData.daysInStage) ? SiteData.daysInStage(rec.id, nowMs) : null;
        var since = (typeof CrmInteractions !== 'undefined')
            ? CrmInteractions.daysSinceContact(rec.id, nowMs) : null;
        var next = (typeof CrmFollowups !== 'undefined') ? CrmFollowups.nextFor(rec.id) : null;

        out.standing = {
            stage: stageLabel,
            daysInStage: days,
            daysSinceContact: since,
            nextAction: next ? next.description : null,
            nextDue: next ? next.due_date : null,
            overdue: (next && typeof CrmFollowups !== 'undefined')
                ? CrmFollowups.daysOverdue(next, nowMs) : null
        };

        // ---- What it is -----------------------------------------------------
        var kw = (rec.usable_kw !== null && rec.usable_kw !== undefined)
            ? rec.usable_kw : rec.nameplate_kw;
        var kwBasis = (rec.usable_kw !== null && rec.usable_kw !== undefined)
            ? 'usable' : ((rec.nameplate_kw !== null && rec.nameplate_kw !== undefined)
                ? 'nameplate' : null);

        out.asset = [
            fact('Energy', has(rec.energy_type) ? titleCase(rec.energy_type) : null),
            fact('Capacity', mw(kw), kwBasis ? kwBasis : null),
            fact('Jurisdiction', rec.jurisdiction),
            fact('Location', (rec.latitude !== null && rec.longitude !== null)
                ? (Number(rec.latitude).toFixed(4) + ', ' + Number(rec.longitude).toFixed(4))
                : null),
            /* Operator comes from the regulator's filings, not from a form, and
               that is worth saying on a page somebody else will read. */
            fact('Operator', rec.operator,
                 has(rec.operator) ? ('as filed' + (has(rec.operator_licence)
                     ? ', licence ' + rec.operator_licence : '')) : null),
            fact('Development stage', has(rec.development_stage)
                ? titleCase(rec.development_stage) : null),
            fact('Offtake', has(rec.offtake_state) ? titleCase(rec.offtake_state) : null)
        ];

        // ---- Terms, and whether any of them are executed --------------------
        var docs = (typeof CrmDocuments !== 'undefined') ? CrmDocuments.forProspect(rec.id) : [];
        var executed = false;
        for (var d = 0; d < docs.length; d++) if (docs[d].kind === 'agreement') executed = true;

        out.terms = {
            executed: executed,
            rows: [
                /* The figure as it was actually quoted, in the units it was quoted
                   in. The engine's $/kWh conversion goes through a heat rate and is
                   an estimate; putting an estimate on a page headed "terms" would
                   turn it into a number somebody quotes back. */
                fact('Rate as quoted',
                    has(rec.quoted_rate)
                        ? (rec.quoted_rate + (rateUnit(rec.quoted_rate_units)
                            ? ' ' + rateUnit(rec.quoted_rate_units).label : ''))
                        : null,
                    (has(rec.quoted_rate) && rateUnit(rec.quoted_rate_units))
                        ? rateUnit(rec.quoted_rate_units).basis : null),
                fact('Take-or-pay', rec.take_or_pay_pct !== null && rec.take_or_pay_pct !== undefined
                    ? rec.take_or_pay_pct + '%' : null),
                fact('Term', rec.contract_term_years !== null && rec.contract_term_years !== undefined
                    ? rec.contract_term_years + ' years' : null),
                fact('Generator', has(rec.generator_ownership)
                    ? titleCase(rec.generator_ownership) : null)
            ]
        };

        // ---- Who ------------------------------------------------------------
        out.contacts = [];
        if (typeof CrmContacts !== 'undefined') {
            var people = CrmContacts.forProspect(rec.id);
            for (var c = 0; c < people.length; c++) {
                out.contacts.push({
                    name: people[c].name || null,
                    /* 'unknown' is the contact store's sentinel for a role nobody
                       recorded, not a role. Printed verbatim beside a name on a
                       page somebody else reads, it looks like a stated fact. */
                    role: (people[c].role && people[c].role !== 'unknown')
                        ? titleCase(people[c].role) : null,
                    email: people[c].email || null,
                    phone: people[c].phone || null
                });
            }
        }

        // ---- What has happened ----------------------------------------------
        /* Newest first and capped. A summary that reproduced the whole log would
           be the log, and the reader wants the shape of the conversation. The cap
           is reported so a truncated history does not read as a short one. */
        out.history = [];
        out.historyTotal = 0;
        if (typeof CrmLog !== 'undefined') {
            var all = CrmLog.forProspect(rec.id);
            var superseded = CrmLog.supersededIds();
            var kept = [];
            for (var h = 0; h < all.length; h++) {
                if (superseded[all[h].id]) continue;      // corrected later; show the correction
                kept.push(all[h]);
            }
            out.historyTotal = kept.length;
            for (var k = 0; k < kept.length && k < 12; k++) {
                var e = kept[k];
                var line;
                if (e.kind === 'stage') {
                    line = (typeof CrmConfig !== 'undefined' ? CrmConfig.stageLabel(e.from) : e.from) +
                           ' → ' + (typeof CrmConfig !== 'undefined' ? CrmConfig.stageLabel(e.to) : e.to);
                    if (e.dead_reason) {
                        line += ' (' + (typeof CrmConfig !== 'undefined'
                            ? CrmConfig.deadReasonLabel(e.dead_reason) : e.dead_reason) + ')';
                    }
                    if (e.note) line += ' — ' + e.note;
                } else if (e.kind === 'note') {
                    line = e.body || null;
                } else {
                    line = String(e.interaction_type || 'contact').replace('_', ' ');
                    if (e.contact_person) line += ' with ' + e.contact_person;
                    if (e.summary) line += ' — ' + e.summary;
                }
                out.history.push({
                    when: day(e.occurred_at || e.at),
                    kind: e.kind,
                    line: line
                });
            }
        }

        // ---- On file ---------------------------------------------------------
        out.documents = [];
        for (var i = 0; i < docs.length; i++) {
            var link = (typeof CrmDocuments !== 'undefined') ? CrmDocuments.linkFor(docs[i].url) : null;
            out.documents.push({
                title: docs[i].title,
                kind: docs[i].kind
                    ? ((typeof CrmConfig !== 'undefined')
                        ? CrmConfig.documentKindLabel(docs[i].kind) : docs[i].kind)
                    : null,
                signed_on: docs[i].signed_on,
                where: (link && link.safe) ? link.href : (docs[i].url || docs[i].where || null),
                linked: !!(link && link.safe)
            });
        }

        // ---- What is not known ------------------------------------------------
        /* The section that makes the rest of the page trustworthy. */
        out.gaps = { research: [], documents: [], facts: [] };

        if (typeof CrmEnrichment !== 'undefined') {
            var items = CrmEnrichment.itemsFor(rec.id) || [];
            for (var r = 0; r < items.length; r++) {
                if (items[r].status === 'complete' || items[r].status === 'na') continue;
                out.gaps.research.push({ label: items[r].label, status: items[r].status });
            }
            out.completeness = CrmEnrichment.completeness(rec.id);
        }
        if (typeof CrmDocuments !== 'undefined') {
            var miss = CrmDocuments.missing(rec.id);
            for (var m = 0; m < miss.length; m++) out.gaps.documents.push(miss[m].label);
        }
        /* Anything on the page above that has no value. Collected here as well as
           shown in place, because a reader scanning for "what do we not know"
           should not have to find the blanks themselves. */
        var checked = out.asset.concat(out.terms.rows);
        for (var f = 0; f < checked.length; f++) {
            if (checked[f].value === null) out.gaps.facts.push(checked[f].label);
        }
        if (!out.contacts.length) out.gaps.facts.push('Anyone to call');

        return out;
    }

    // ---- Plain text, for pasting into an email --------------------------------
    function line(label, value, note) {
        return '  ' + label + ': ' + (value === null ? 'not recorded' : value) +
               (note ? ' (' + note + ')' : '');
    }

    function text(prospectId, nowMs) {
        var d = build(prospectId, nowMs);
        if (!d) return null;
        var L = [];
        L.push(d.name);
        L.push(new Array(d.name.length + 1).join('='));
        L.push('');
        L.push('WHERE IT STANDS');
        L.push('  Stage: ' + d.standing.stage +
               (d.standing.daysInStage === null ? ' (not moved yet)'
                                                : ' (' + d.standing.daysInStage + ' days)'));
        L.push('  Last contact: ' + (d.standing.daysSinceContact === null
            ? 'never contacted' : d.standing.daysSinceContact + ' days ago'));
        L.push('  Next: ' + (d.standing.nextAction
            ? d.standing.nextAction + ' by ' + d.standing.nextDue +
              (d.standing.overdue > 0 ? ' — ' + d.standing.overdue + ' days overdue' : '')
            : 'nothing scheduled'));
        L.push('');
        L.push('THE ASSET');
        for (var a = 0; a < d.asset.length; a++) L.push(line(d.asset[a].label, d.asset[a].value, d.asset[a].note));
        L.push('');
        L.push('TERMS — ' + (d.terms.executed
            ? 'an executed agreement is on file'
            : 'AS DISCUSSED, nothing executed'));
        for (var t = 0; t < d.terms.rows.length; t++) {
            L.push(line(d.terms.rows[t].label, d.terms.rows[t].value, d.terms.rows[t].note));
        }
        L.push('');
        L.push('WHO');
        if (!d.contacts.length) L.push('  Nobody recorded.');
        for (var c = 0; c < d.contacts.length; c++) {
            var p = d.contacts[c];
            L.push('  ' + (p.name || 'unnamed') + (p.role ? ', ' + p.role : '') +
                   (p.email ? ' — ' + p.email : '') + (p.phone ? ' — ' + p.phone : ''));
        }
        L.push('');
        L.push('WHAT HAPPENED' + (d.historyTotal > d.history.length
            ? ' (most recent ' + d.history.length + ' of ' + d.historyTotal + ')' : ''));
        if (!d.history.length) L.push('  Nothing logged.');
        for (var h = 0; h < d.history.length; h++) {
            L.push('  ' + (d.history[h].when || '') + '  ' + (d.history[h].line || ''));
        }
        L.push('');
        L.push('ON FILE');
        if (!d.documents.length) L.push('  Nothing recorded.');
        for (var i = 0; i < d.documents.length; i++) {
            var doc = d.documents[i];
            L.push('  ' + (doc.kind ? doc.kind + ': ' : '') + doc.title +
                   (doc.signed_on ? ', ' + doc.signed_on : '') +
                   (doc.where ? ' — ' + doc.where : ''));
        }
        L.push('');
        L.push('NOT KNOWN');
        if (d.gaps.facts.length) L.push('  Not recorded: ' + d.gaps.facts.join(', '));
        if (d.gaps.documents.length) L.push('  Not on file: ' + d.gaps.documents.join(', '));
        if (d.gaps.research.length) {
            var names = [];
            for (var g = 0; g < d.gaps.research.length; g++) names.push(d.gaps.research[g].label);
            L.push('  Research outstanding: ' + names.join(', '));
        }
        if (!d.gaps.facts.length && !d.gaps.documents.length && !d.gaps.research.length) {
            L.push('  Nothing outstanding.');
        }
        L.push('');
        L.push('Generated ' + day(d.generated) + ' from the prospect record. ' +
               'Figures are as recorded, not recomputed.');
        return L.join('\n');
    }

    // ---- The page ---------------------------------------------------------------
    function factList(rows) {
        var html = '<dl class="ps-facts">';
        for (var i = 0; i < rows.length; i++) {
            html += '<dt>' + esc(rows[i].label) + '</dt><dd>' +
                (rows[i].value === null
                    ? '<span class="ps-absent">not recorded</span>'
                    : esc(rows[i].value) +
                      (rows[i].note ? ' <span class="ps-note">' + esc(rows[i].note) + '</span>' : '')) +
                '</dd>';
        }
        return html + '</dl>';
    }

    function render(prospectId, hostId, nowMs) {
        var host = document.getElementById(hostId || 'psummary');
        if (!host) return null;
        var d = build(prospectId, nowMs);
        if (!d) {
            host.innerHTML = '<p class="pd-none">That prospect is not in the pipeline.</p>';
            return null;
        }

        var html = '<div class="ps-bar">' +
            '<a class="pd-back" href="#p/' + esc(encodeURIComponent(d.id)) + '">&larr; Back</a>' +
            '<button type="button" class="pd-btn" id="psCopy">Copy as text</button>' +
            '<button type="button" class="pd-btn pd-btn--go" id="psPrint">Print</button>' +
        '</div>';

        html += '<article class="ps-sheet" id="psSheet">' +
            '<header class="ps-head">' +
                '<h2>' + esc(d.name) + '</h2>' +
                '<p class="ps-standing">' + esc(d.standing.stage) +
                    (d.standing.daysInStage === null
                        ? ' <span class="ps-absent">not moved yet</span>'
                        : ' &middot; ' + d.standing.daysInStage + ' days in stage') +
                    ' &middot; ' + (d.standing.daysSinceContact === null
                        ? '<span class="ps-absent">never contacted</span>'
                        : d.standing.daysSinceContact + ' days since contact') +
                '</p>' +
                (d.standing.nextAction
                    ? '<p class="ps-next' + (d.standing.overdue > 0 ? ' is-late' : '') + '">Next: ' +
                        esc(d.standing.nextAction) + ' by ' + esc(d.standing.nextDue) +
                        (d.standing.overdue > 0 ? ' &mdash; ' + d.standing.overdue + ' days overdue' : '') +
                      '</p>'
                    : '<p class="ps-next"><span class="ps-absent">nothing scheduled</span></p>') +
            '</header>';

        html += '<section class="ps-sec"><h3>The asset</h3>' + factList(d.asset) + '</section>';

        html += '<section class="ps-sec"><h3>Terms</h3>' +
            '<p class="ps-caveat' + (d.terms.executed ? ' is-executed' : '') + '">' +
                (d.terms.executed
                    ? 'An executed agreement is on file. The figures below are as recorded here ' +
                      '&mdash; the agreement governs.'
                    : 'As discussed. Nothing executed is on file, so these are what was said, ' +
                      'not what is agreed.') +
            '</p>' + factList(d.terms.rows) + '</section>';

        var who = '';
        for (var c = 0; c < d.contacts.length; c++) {
            var p = d.contacts[c];
            who += '<li>' + esc(p.name || 'unnamed') +
                (p.role ? ' <span class="ps-note">' + esc(p.role) + '</span>' : '') +
                (p.email ? '<span class="ps-reach">' + esc(p.email) + '</span>' : '') +
                (p.phone ? '<span class="ps-reach">' + esc(p.phone) + '</span>' : '') +
            '</li>';
        }
        html += '<section class="ps-sec"><h3>Who</h3>' +
            (who ? '<ul class="ps-list">' + who + '</ul>'
                 : '<p class="ps-absent">Nobody recorded.</p>') + '</section>';

        var ev = '';
        for (var h = 0; h < d.history.length; h++) {
            ev += '<li><span class="ps-when">' + esc(d.history[h].when || '') + '</span>' +
                  '<span>' + esc(d.history[h].line || '') + '</span></li>';
        }
        html += '<section class="ps-sec"><h3>What happened</h3>' +
            (ev ? '<ul class="ps-tl">' + ev + '</ul>'
                : '<p class="ps-absent">Nothing logged.</p>') +
            (d.historyTotal > d.history.length
                ? '<p class="ps-note">Most recent ' + d.history.length + ' of ' +
                  d.historyTotal + ' entries.</p>' : '') +
        '</section>';

        var dl = '';
        for (var i = 0; i < d.documents.length; i++) {
            var doc = d.documents[i];
            dl += '<li>' +
                (doc.kind ? '<span class="ps-dkind">' + esc(doc.kind) + '</span>' : '') +
                esc(doc.title) +
                (doc.signed_on ? ' <span class="ps-note">' + esc(doc.signed_on) + '</span>' : '') +
                (doc.where
                    ? '<span class="ps-where">' + (doc.linked
                        ? '<a href="' + esc(doc.where) + '" target="_blank" rel="noopener noreferrer">' +
                          esc(doc.where) + '</a>'
                        : esc(doc.where)) + '</span>'
                    : '') +
            '</li>';
        }
        html += '<section class="ps-sec"><h3>On file</h3>' +
            (dl ? '<ul class="ps-list">' + dl + '</ul>'
                : '<p class="ps-absent">Nothing recorded.</p>') + '</section>';

        var gaps = '';
        if (d.gaps.facts.length) {
            gaps += '<li><strong>Not recorded:</strong> ' + esc(d.gaps.facts.join(', ')) + '</li>';
        }
        if (d.gaps.documents.length) {
            gaps += '<li><strong>Not on file:</strong> ' + esc(d.gaps.documents.join(', ')) + '</li>';
        }
        if (d.gaps.research.length) {
            var names = [];
            for (var g = 0; g < d.gaps.research.length; g++) names.push(d.gaps.research[g].label);
            gaps += '<li><strong>Research outstanding:</strong> ' + esc(names.join(', ')) + '</li>';
        }
        html += '<section class="ps-sec ps-sec--gaps"><h3>Not known</h3>' +
            (gaps ? '<ul class="ps-list">' + gaps + '</ul>'
                  : '<p>Nothing outstanding.</p>') + '</section>';

        html += '<footer class="ps-foot">Generated ' + esc(day(d.generated)) +
            ' from the prospect record. Figures are as recorded, not recomputed.</footer>';
        html += '</article>';

        host.innerHTML = html;
        return d;
    }

    return { build: build, text: text, render: render };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ProspectSummary;
