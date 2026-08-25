/* ===== One prospect, everything about it =====
 *
 * The screen where work actually gets recorded. Until this existed the log, the
 * follow-ups and the contacts were all real and none of them were reachable —
 * fully built, fully tested, and writable only from the console.
 *
 * ONE TIMELINE, TWO KINDS OF EVENT. Stage transitions and interactions are
 * interleaved and sorted together, because "we spoke, then I moved it to term
 * sheet, then they went quiet" is one story and splitting it into two lists
 * makes the reader reassemble it. They come from the same append-only store, so
 * this is a merge rather than a join.
 *
 * CORRECTIONS ARE SHOWN, NOT HIDDEN. An entry that was later corrected renders
 * struck through with its replacement beneath it. The point of an immutable log
 * is that you can see what you believed at the time; quietly swapping in the
 * correction would give you a tidy history that never happened.
 */
var ProspectDetail = (function () {
    'use strict';

    function esc(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function absent(what) { return '<em class="pd-absent">' + esc(what) + '</em>'; }

    function day(iso) { return iso ? String(iso).slice(0, 10) : ''; }

    function mw(kw) {
        if (kw === null || kw === undefined || !isFinite(kw)) return absent('no estimate');
        var m = kw / 1000;
        return esc(m >= 10 ? m.toFixed(0) : m.toFixed(1)) + ' MW';
    }

    /* Interactions and stage moves, merged and ordered by when they happened.
       An interaction carries occurred_at (which can be backdated); a transition
       only ever happens when it is recorded, so `at` is its own truth. */
    function timeline(prospectId) {
        if (typeof CrmLog === 'undefined') return [];
        var all = CrmLog.forProspect(prospectId);
        var superseded = CrmLog.supersededIds();
        var out = [];
        for (var i = 0; i < all.length; i++) {
            var e = all[i];
            out.push({
                entry: e,
                when: e.occurred_at || e.at,
                correctedBy: superseded[e.id] || null
            });
        }
        out.sort(function (a, b) {
            if (a.when !== b.when) return (a.when < b.when) ? 1 : -1;
            return (b.entry.seq || 0) - (a.entry.seq || 0);
        });
        return out;
    }

    function outcomePill(key) {
        if (!key) return '';
        var label = key, tone = 'neutral';
        if (typeof CrmConfig !== 'undefined') {
            var list = CrmConfig.outcomes();
            for (var i = 0; i < list.length; i++) {
                if (list[i].key === key) { label = list[i].label; tone = list[i].tone || 'neutral'; }
            }
        }
        return '<span class="pd-pill t-' + esc(tone) + '">' + esc(label) + '</span>';
    }

    function entryRow(t) {
        var e = t.entry;
        var cls = 'pd-ev' + (t.correctedBy ? ' is-corrected' : '');
        if (e.kind === 'stage') {
            var from = (typeof CrmConfig !== 'undefined') ? CrmConfig.stageLabel(e.from) : e.from;
            var to = (typeof CrmConfig !== 'undefined') ? CrmConfig.stageLabel(e.to) : e.to;
            return '<li class="' + cls + ' k-stage">' +
                '<span class="pd-when">' + esc(day(t.when)) + '</span>' +
                '<span class="pd-body">' +
                    '<span class="pd-kind">Stage</span> ' +
                    esc(from) + ' &rarr; <strong>' + esc(to) + '</strong>' +
                    (e.dead_reason ? ' <span class="pd-pill t-negative">' +
                        esc(typeof CrmConfig !== 'undefined'
                            ? CrmConfig.deadReasonLabel(e.dead_reason) : e.dead_reason) +
                        '</span>' : '') +
                    (e.note ? '<span class="pd-note">' + esc(e.note) + '</span>' : '') +
                '</span></li>';
        }
        /* A FREE-FORM NOTE IS NOT AN INTERACTION and must not render as one.
           Falling through to the branch below would print "note / nobody named /
           no summary" -- three absences describing a record that is not missing
           anything, because a note has no counterparty and no outcome by
           definition. */
        if (e.kind === 'note') {
            return '<li class="' + cls + ' k-note">' +
                '<span class="pd-when">' + esc(day(t.when)) + '</span>' +
                '<span class="pd-body">' +
                    '<span class="pd-kind">Note</span> ' +
                    (e.body ? '<span class="pd-note">' + esc(e.body) + '</span>'
                            : '<span class="pd-note">' + absent('empty') + '</span>') +
                    (t.correctedBy ? '<span class="pd-corr">corrected later</span>' : '') +
                '</span></li>';
        }
        var who = e.contact_person ? esc(e.contact_person) : absent('nobody named');
        return '<li class="' + cls + ' k-int">' +
            '<span class="pd-when">' + esc(day(t.when)) + '</span>' +
            '<span class="pd-body">' +
                '<span class="pd-kind">' + esc(String(e.interaction_type || 'note').replace('_', ' ')) +
                '</span> ' + who + ' ' + outcomePill(e.outcome) +
                (e.summary ? '<span class="pd-note">' + esc(e.summary) + '</span>'
                           : '<span class="pd-note">' + absent('no summary') + '</span>') +
                (e.next_action
                    ? '<span class="pd-next">Promised: ' + esc(e.next_action) +
                      ' &middot; ' + esc(e.next_action_due || '') + '</span>' : '') +
                (t.correctedBy ? '<span class="pd-corr">corrected later</span>' : '') +
            '</span></li>';
    }

    function contactsBlock(prospectId) {
        if (typeof CrmContacts === 'undefined') return '';
        var list = CrmContacts.forProspect(prospectId);
        if (!list.length) {
            return '<p class="pd-none">No contacts linked. ' +
                   'The opportunity score reads contactability, so this is worth filling in.</p>';
        }
        var best = CrmContacts.bestFor(prospectId);
        var html = '<ul class="pd-contacts">';
        for (var i = 0; i < list.length; i++) {
            var c = list[i];
            html += '<li>' +
                '<span class="pd-cname">' + esc(c.name || '(unnamed)') +
                    (best && c.id === best.id ? ' <span class="pd-best">best</span>' : '') + '</span>' +
                '<span class="pd-crole">' + esc(String(c.role || 'unknown').replace('_', ' ')) + '</span>' +
                '<span class="pd-cways">' +
                    (c.phone ? esc(c.phone) : '') +
                    (c.phone && c.email ? ' &middot; ' : '') +
                    (c.email ? esc(c.email) : '') +
                    (!c.phone && !c.email ? absent('no way to reach them') : '') +
                '</span>' +
                /* Contacts decay, and a number verified two years ago is one you
                   find out is wrong at the worst moment. */
                '<span class="pd-cver">' +
                    (c.last_verified ? 'verified ' + esc(day(c.last_verified))
                                     : absent('never verified')) + '</span>' +
                (c.linked_prospects.length > 1
                    ? '<span class="pd-calso">also on ' + (c.linked_prospects.length - 1) +
                      ' other</span>' : '') +
            '</li>';
        }
        return html + '</ul>';
    }

    /* The checklist, with what was found and where it came from. Editable in
       place, because research happens in the middle of doing something else and a
       checklist you have to navigate to is a checklist that stays empty. */
    function enrichBlock(prospectId) {
        if (typeof CrmEnrichment === 'undefined') return '';
        var items = CrmEnrichment.itemsFor(prospectId);
        if (!items.length) return '<p class="pd-none">No checklist for this source type.</p>';
        var c = CrmEnrichment.completeness(prospectId);
        var statuses = (typeof CrmConfig !== 'undefined') ? CrmConfig.enrichStatuses() : [];
        var head = '<div class="pd-esum">' +
            (c.pct === null
                ? absent('nothing on this checklist applies')
                : '<strong>' + c.pct + '%</strong> &middot; ' + c.complete + ' of ' +
                  c.applicable + ' researched' +
                  (c.inProgress ? ' &middot; ' + c.inProgress + ' underway' : '') +
                  (c.na ? ' &middot; ' + c.na + ' not applicable' : '')) +
            '</div>';
        var html = head + '<ul class="pd-echecks">';
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            var opts = '';
            for (var j = 0; j < statuses.length; j++) {
                opts += '<option value="' + esc(statuses[j].key) + '"' +
                        (statuses[j].key === it.status ? ' selected' : '') + '>' +
                        esc(statuses[j].label) + '</option>';
            }
            html += '<li class="s-' + esc(it.status) + '">' +
                '<span class="pd-elabel">' + esc(it.label) + '</span>' +
                '<select class="pd-estat" data-item="' + esc(it.key) + '">' + opts + '</select>' +
                '<input type="text" class="pd-enote" data-item="' + esc(it.key) + '" ' +
                    'value="' + esc(it.note || '') + '" placeholder="where it came from">' +
                '<span class="pd-ewhen">' + (it.at ? esc(day(it.at)) : '') + '</span>' +
            '</li>';
        }
        return html + '</ul>';
    }

    function followBlock(prospectId) {
        if (typeof CrmFollowups === 'undefined') return '';
        var list = CrmFollowups.forProspect(prospectId).filter(function (f) {
            return f.status === 'pending' || f.status === 'snoozed';
        });
        if (!list.length) return '<p class="pd-none">Nothing outstanding.</p>';
        var today = CrmFollowups.today();
        var html = '<ul class="pd-follows">';
        for (var i = 0; i < list.length; i++) {
            var f = list[i];
            var late = f.due_date < today;
            html += '<li>' +
                '<span class="pd-fdue' + (late ? ' is-late' : '') + '">' + esc(f.due_date) + '</span>' +
                '<span class="pd-fwhat">' + esc(f.description) + '</span>' +
                '<button type="button" class="pd-btn" data-done="' + esc(f.id) + '">Done</button>' +
            '</li>';
        }
        return html + '</ul>';
    }

    /* THE REGISTER SAYS WHERE, NOT WHAT. Nothing here holds a file -- see the
       header of crm-documents.js -- so every row is a claim about somewhere else,
       and the styling is deliberately plain: a link that has rotted looks exactly
       like one that has not, and a row that implied otherwise would be lying
       about the only thing it knows. */
    function docsBlock(prospectId) {
        if (typeof CrmDocuments === 'undefined') return '';
        var list = CrmDocuments.forProspect(prospectId);
        var kinds = (typeof CrmConfig !== 'undefined') ? CrmConfig.documentKinds() : [];
        var rows = '';
        for (var i = 0; i < list.length; i++) {
            var d = list[i];
            var link = CrmDocuments.linkFor(d.url);
            var loc;
            if (link.safe) {
                /* noopener because a document link goes to somebody else's page,
                   and window.opener would hand that page control of this tab --
                   the tab holding the fleet, the wallet and the banking data. */
                loc = '<a class="pd-dlink" href="' + esc(link.href) + '" target="_blank" ' +
                      'rel="noopener noreferrer">' + esc(link.text) + '</a>';
            } else if (link.text) {
                loc = '<span class="pd-dbad" title="Not a link this app will open, ' +
                      'so it is shown as text">' + esc(link.text) + '</span>';
            } else if (d.where) {
                loc = '<span class="pd-dwhere">' + esc(d.where) + '</span>';
            } else {
                loc = absent('no location recorded');
            }
            rows += '<li class="pd-doc">' +
                '<span class="pd-dkind">' +
                    (d.kind ? esc(CrmConfig.documentKindLabel(d.kind)) : absent('unfiled')) +
                '</span>' +
                '<span class="pd-dtitle">' + esc(d.title) + '</span>' +
                '<span class="pd-dloc">' + loc + '</span>' +
                '<span class="pd-dwhen">' +
                    (d.signed_on ? esc(d.signed_on) : absent('undated')) + '</span>' +
                '<button type="button" class="pd-drm" data-did="' + esc(d.id) + '" ' +
                    'title="Remove this record. The file itself is somewhere else and is ' +
                    'not touched.">&times;</button>' +
            '</li>';
        }

        /* The absence is the useful half. Not a warning and not a blocker -- a
           deal can close without half of these -- but walking into a site visit
           without an NDA on file is worth knowing beforehand. */
        var miss = CrmDocuments.missing(prospectId);
        var missLine = '';
        if (miss.length) {
            var names = [];
            for (var m = 0; m < miss.length; m++) names.push(miss[m].label);
            missLine = '<p class="pd-dmiss">Not on file: ' + esc(names.join(', ')) + '</p>';
        }

        return (rows ? '<ul class="pd-docs">' + rows + '</ul>'
                     : '<p class="pd-none">Nothing recorded. This is a register of where ' +
                       'documents live, not a place they are stored.</p>') +
            missLine +
            '<form class="pd-form pd-docform" id="pdDocForm">' +
                '<div class="pd-frow">' +
                    '<label class="pd-grow2">Document' +
                        '<input type="text" id="pdDocTitle" placeholder="Signed NDA"></label>' +
                    '<label>Kind<select id="pdDocKind"><option value="">—</option>' +
                        optionList(kinds, function (k) { return k.key; },
                                   function (k) { return k.label; }) +
                    '</select></label>' +
                    '<label>Dated<input type="date" id="pdDocDate"></label>' +
                '</div>' +
                '<div class="pd-frow">' +
                    '<label class="pd-grow2">Link' +
                        '<input type="text" id="pdDocUrl" placeholder="https://..."></label>' +
                    '<label class="pd-grow2">or where it lives' +
                        '<input type="text" id="pdDocWhere" ' +
                        'placeholder="Emailed by Dave in March"></label>' +
                    '<button type="submit" class="pd-btn">Record</button>' +
                '</div>' +
            '</form>';
    }

    /* A note is for the things that were not a call: something read in a filing,
       a thought about the site, a reason for a decision. It goes on the same
       timeline because that is where you will look for it, but it deliberately
       does NOT touch the contact clock -- writing a note to yourself is not
       contact, and letting it reset the staleness would make a prospect look
       worked while it went quiet. */
    function noteBox() {
        return '<form class="pd-form pd-noteform" id="pdNoteForm">' +
            '<label class="pd-grow2">' +
                '<textarea id="pdNoteBody" rows="2" ' +
                'placeholder="Anything worth remembering that was not a call"></textarea>' +
            '</label>' +
            '<button type="submit" class="pd-btn">Add note</button>' +
        '</form>';
    }

    function optionList(items, keyOf, labelOf) {
        var html = '';
        for (var i = 0; i < items.length; i++) {
            html += '<option value="' + esc(keyOf(items[i])) + '">' + esc(labelOf(items[i])) + '</option>';
        }
        return html;
    }

    function logForm(prospectId) {
        var types = (typeof CrmInteractions !== 'undefined') ? CrmInteractions.TYPES : ['note'];
        var outcomes = (typeof CrmConfig !== 'undefined') ? CrmConfig.outcomes() : [];
        var contacts = (typeof CrmContacts !== 'undefined') ? CrmContacts.forProspect(prospectId) : [];
        return '<form class="pd-form" id="pdLog">' +
            '<div class="pd-frow">' +
                '<label>Type<select id="pdType">' +
                    optionList(types, function (t) { return t; },
                               function (t) { return t.replace('_', ' '); }) +
                '</select></label>' +
                '<label>Direction<select id="pdDir">' +
                    '<option value="outbound">outbound</option>' +
                    '<option value="inbound">inbound</option>' +
                    '<option value="n/a">n/a</option>' +
                '</select></label>' +
                /* Defaults to today but editable, because a call logged the next
                   morning is still yesterday's call and staleness is measured
                   from when it happened. */
                '<label>When<input type="date" id="pdWhen" value="' +
                    esc(CrmFollowups ? CrmFollowups.today() : '') + '"></label>' +
                '<label>Outcome<select id="pdOutcome"><option value="">—</option>' +
                    optionList(outcomes, function (o) { return o.key; },
                               function (o) { return o.label; }) +
                '</select></label>' +
            '</div>' +
            '<div class="pd-frow">' +
                '<label class="pd-grow">Who<' + 'select id="pdWho">' +
                    '<option value="">—</option>' +
                    optionList(contacts, function (c) { return c.id; },
                               function (c) { return c.name || '(unnamed)'; }) +
                '</select></label>' +
                '<label class="pd-grow2">What was said<input type="text" id="pdSummary" ' +
                    'placeholder="They want the gas spec before committing"></label>' +
            '</div>' +
            '<div class="pd-frow">' +
                '<label class="pd-grow2">What I said I would do' +
                    '<input type="text" id="pdNext" placeholder="Send the gas spec"></label>' +
                '<label>By<input type="date" id="pdNextDue"></label>' +
                '<button type="submit" class="pd-btn pd-btn--go">Log it</button>' +
            '</div>' +
            '<p class="pd-hint" id="pdHint">A next action needs a date, or nothing will resurface it.</p>' +
        '</form>';
    }

    function render(prospectId, hostId) {
        var host = document.getElementById(hostId || 'pdetail');
        if (!host) return null;
        var rec = (typeof SiteData !== 'undefined' && SiteData.get) ? SiteData.get(prospectId) : null;
        if (!rec) {
            host.innerHTML = '<p class="pd-none">That prospect is not in the pipeline.</p>';
            return null;
        }
        var days = (SiteData.daysInStage) ? SiteData.daysInStage(rec.id) : null;
        var since = (typeof CrmInteractions !== 'undefined')
            ? CrmInteractions.daysSinceContact(rec.id) : null;
        var stages = (typeof CrmConfig !== 'undefined') ? CrmConfig.stages() : [];

        var tl = timeline(prospectId);
        var events = '';
        for (var i = 0; i < tl.length; i++) events += entryRow(tl[i]);

        host.innerHTML =
        '<div class="pd-head">' +
            '<a class="pd-back" href="#board">&larr; Pipeline</a>' +
            '<h2 class="pd-title">' + esc(rec.name || rec.id) + '</h2>' +
            '<a class="pd-sumlink" href="#s/' + esc(encodeURIComponent(rec.id)) + '">' +
                'One-page summary</a>' +
            '<div class="pd-facts">' +
                '<span>' + mw(rec.usable_kw !== null ? rec.usable_kw : rec.nameplate_kw) + '</span>' +
                '<span>' + esc(String(rec.energy_type || rec.source || 'unknown').replace(/_/g, ' ')) + '</span>' +
                '<span>' + (days === null ? absent('not moved yet')
                                          : esc(String(days)) + ' days in stage') + '</span>' +
                '<span>' + (since === null ? absent('never contacted')
                                           : esc(String(since)) + ' days since contact') + '</span>' +
            '</div>' +
            '<label class="pd-stagepick">Stage<select id="pdStage">' +
                optionList(stages, function (s) { return s.key; }, function (s) { return s.label; }) +
            '</select></label>' +
        '</div>' +
        '<section class="pd-sec"><h3>Outstanding</h3>' + followBlock(prospectId) + '</section>' +
        '<section class="pd-sec"><h3>Log an interaction</h3>' + logForm(prospectId) + '</section>' +
        '<section class="pd-sec"><h3>Contacts</h3>' + contactsBlock(prospectId) + '</section>' +
        '<section class="pd-sec"><h3>Research</h3>' + enrichBlock(prospectId) + '</section>' +
        '<section class="pd-sec"><h3>Documents</h3>' + docsBlock(prospectId) + '</section>' +
        '<section class="pd-sec"><h3>History</h3>' + noteBox() +
            (events ? '<ul class="pd-tl">' + events + '</ul>'
                    : '<p class="pd-none">Nothing has happened yet.</p>') +
        '</section>';

        var sel = document.getElementById('pdStage');
        if (sel) sel.value = rec.stage;
        return rec;
    }

    return { render: render, timeline: timeline };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ProspectDetail;
