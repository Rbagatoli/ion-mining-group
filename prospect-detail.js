/* ===== One prospect, everything about it =====
 *
 * The screen where work actually gets recorded. Until this existed the log, the
 * follow-ups and the contacts were all real and none of them were reachable —
 * fully built, fully tested, and writable only from the console.
 *
 * ONE TIMELINE, EVERY KIND OF EVENT. Stage transitions and interactions are
 * interleaved and sorted together, because "we spoke, then I moved it to term
 * sheet, then they went quiet" is one story and splitting it into two lists
 * makes the reader reassemble it. They come from the same append-only store, so
 * this is a merge rather than a join.
 *
 * The execution workspace adds four more — gate moves, waivers, automatic score
 * movements and money events — onto the same timeline for the same reason: "the
 * gas analysis came back, so we waived nothing and moved to agreements, and the
 * score moved because of it" is also one story.
 *
 * EVERY KIND GETS ITS OWN BRANCH, and the interaction branch is now reached only
 * by interactions. It used to be the fallthrough, so any kind added later would
 * have rendered as an interaction with a wrong label and two absences — which is
 * precisely the bug the note branch below was written to fix, waiting to happen
 * again to the next person.
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

    /* Gate keys are the project's vocabulary, not the CRM pipeline's, so CrmConfig.stageLabel
       cannot name them. Kept beside the renderer that uses them. */
    var GATE_LABELS = {
        target_screen: 'target & screen', contact_loi: 'contact & LOI', diligence: 'diligence',
        agreements: 'agreements', permitting_complete: 'permit issued',
        engineering_procurement: 'engineering & procurement', construction: 'construction',
        commissioning: 'commissioning', operating: 'operating', cancelled: 'cancelled'
    };
    function gateLabel(k) { return GATE_LABELS[k] || String(k || 'unknown').replace(/_/g, ' '); }

    function money(v) {
        if (typeof v !== 'number' || !isFinite(v)) return '';
        return '$' + Math.round(v).toLocaleString();
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
        /* THE BUILD EVENTS. Rendered before the interaction fallthrough for exactly the reason
           the note branch above gives: falling through prints "nobody named / no summary",
           three absences describing a record that is not missing anything. */
        if (e.kind === 'gate') {
            return '<li class="' + cls + ' k-gate">' +
                '<span class="pd-when">' + esc(day(t.when)) + '</span>' +
                '<span class="pd-body">' +
                    '<span class="pd-kind">Gate</span> ' +
                    esc(gateLabel(e.from)) + ' &rarr; <strong>' + esc(gateLabel(e.to)) + '</strong>' +
                    (e.reason ? '<span class="pd-note">' + esc(e.reason) + '</span>' : '') +
                '</span></li>';
        }
        if (e.kind === 'waiver') {
            /* A waiver is the loudest thing on this timeline on purpose. It is the record of a
               hard block being stepped around, and the whole value of a gate is that stepping
               around it leaves a mark naming who decided to. */
            return '<li class="' + cls + ' k-waiver">' +
                '<span class="pd-when">' + esc(day(t.when)) + '</span>' +
                '<span class="pd-body">' +
                    '<span class="pd-kind">Waived</span> ' +
                    '<strong>' + esc(e.deliverable || 'a requirement') + '</strong>' +
                    ' <span class="pd-pill t-negative">waived</span>' +
                    '<span class="pd-note">' + esc(e.reason || '') +
                        (e.approved_by ? ' — ' + esc(e.approved_by) : ' — ' + absent('nobody named')) +
                    '</span>' +
                '</span></li>';
        }
        if (e.kind === 'score') {
            var d = (typeof e.delta === 'number') ? (e.delta > 0 ? '+' + e.delta : String(e.delta)) : '?';
            return '<li class="' + cls + ' k-score">' +
                '<span class="pd-when">' + esc(day(t.when)) + '</span>' +
                '<span class="pd-body">' +
                    '<span class="pd-kind">Score</span> ' +
                    esc(e.component || 'a component') + ' moved ' + esc(d) +
                    (e.reason ? '<span class="pd-note">' + esc(e.reason) + '</span>' : '') +
                '</span></li>';
        }
        if (e.kind === 'change_order' || e.kind === 'payment') {
            return '<li class="' + cls + ' k-money">' +
                '<span class="pd-when">' + esc(day(t.when)) + '</span>' +
                '<span class="pd-body">' +
                    '<span class="pd-kind">' + (e.kind === 'payment' ? 'Payment' : 'Change order') + '</span> ' +
                    esc(e.description || '') +
                    (typeof e.amount === 'number' ? ' <strong>' + esc(money(e.amount)) + '</strong>' : '') +
                    (e.approved_by ? '<span class="pd-note">approved by ' + esc(e.approved_by) + '</span>' : '') +
                '</span></li>';
        }
        /* AN UNKNOWN KIND IS NOT AN INTERACTION EITHER. The fallthrough below used to catch
           everything that was not a stage or a note, so the next kind anyone registers would
           render as an interaction with two absences and a wrong label. It now catches only
           entries that actually carry interaction fields. */
        if (e.kind !== 'interaction') {
            return '<li class="' + cls + ' k-other">' +
                '<span class="pd-when">' + esc(day(t.when)) + '</span>' +
                '<span class="pd-body">' +
                    '<span class="pd-kind">' + esc(String(e.kind || 'event').replace(/_/g, ' ')) + '</span> ' +
                    (e.body || e.description
                        ? '<span class="pd-note">' + esc(e.body || e.description) + '</span>'
                        : '<span class="pd-note">' + absent('nothing recorded') + '</span>') +
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

    /* The detail view is where you decide to act on a site, so it names WHICH project and which
       gate rather than only that one exists. Same helper as the ranked table and the board: three
       screens disagreeing about whether a site is being built would send you looking for the
       difference between them. */
    var PROMOTED_GATE_LABELS = {
        target_screen: 'target & screen', contact_loi: 'contact & LOI', diligence: 'diligence',
        agreements: 'agreements', permitting_complete: 'permitted',
        engineering_procurement: 'engineering & procurement', construction: 'construction',
        commissioning: 'commissioning', operating: 'operating'
    };

    function promotedPill(rec) {
        if (typeof ProjectData === 'undefined' || !ProjectData.liveFor) return '';
        var p = ProjectData.liveFor(rec.id);
        if (!p) return '';
        return ' <span class="pd-promoted" title="Project ' + esc(p.id) + '">building &middot; ' +
               esc(PROMOTED_GATE_LABELS[p.gate] || p.gate) + '</span>';
    }

    /* ===== PROMOTION, AND WHAT IT COMMITS ===================================================
     *
     * The first caller promote() has ever had. Until now the whole project model -- gates, budget
     * ledger, sizing -- was reachable only from tests, so nothing in the app could create the
     * record any of it reads.
     *
     * CAPACITY IS TYPED, NEVER DEFAULTED, and that is the single most consequential decision on
     * this form. Right-sizing is build capacity minus what the gas supports; pre-filling the build
     * from the gas makes that subtraction zero by construction. Measured across data/landfills.json
     * it would be zero on 1,054 of 1,908 rows -- 55% -- because powerPotentialKw is itself derived
     * from the gas on most of them. A penalty that reads $0 on more than half of all sites while
     * having measured nothing is worse than no penalty at all. So the supported figure is shown
     * beside the field as a reference and the operator states what they intend to build.
     *
     * THE GAS VOLUME AND THE HORIZON ARE ASKED FOR HERE because they cannot be read from anywhere
     * else on this page. site-model.js blankSite() has no field for either and normalize() drops
     * unknown keys on save, so both are lost at the candidate-to-prospect boundary; ProspectStore,
     * which does hold them, is a map-page global and is not loaded here. Asking is also the honest
     * framing: promotion is the moment capital is committed, and these are the two facts the
     * commitment rests on.
     */
    function fmtUsd(n) {
        if (n === null || n === undefined) return '—';
        return '$' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    function fmtKw(n) {
        if (n === null || n === undefined) return '—';
        return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' kW';
    }

    function promoteForm(rec) {
        var potential = rec.usable_kw !== null ? rec.usable_kw : rec.nameplate_kw;
        return '<form id="pdPromote" class="pd-promote">' +
            '<p class="pd-promote-why">Promoting commits capital. The three figures below are ' +
            'what the commitment rests on, and they are frozen on the project so a later edit ' +
            'here cannot silently reprice a build already sanctioned.</p>' +
            '<div class="pd-pgrid">' +
                '<label>Gas collected, mmscfd' +
                    '<input id="pdGas" type="number" step="0.001" min="0" required></label>' +
                '<label>Build capacity, kW' +
                    '<input id="pdKw" type="number" step="1" min="1" required></label>' +
                '<label>Cost of capital, % a year' +
                    '<input id="pdCoc" type="number" step="0.1" min="0.1" max="100" required></label>' +
                '<label>Authorised budget, USD' +
                    '<input id="pdBudget" type="number" step="1000" min="0" required></label>' +
                '<label>Remaining life, years <span class="pd-opt">optional</span>' +
                    '<input id="pdHorizon" type="number" step="1" min="0"></label>' +
                '<label>Target energization <span class="pd-opt">optional</span>' +
                    '<input id="pdTarget" type="date"></label>' +
            '</div>' +
            /* Filled in live from the gas volume as it is typed. Deliberately NOT written into
               the capacity field: a reference the operator reads and a value the form submits are
               different things, and only the second one makes the penalty meaningless. */
            '<p class="pd-supports" id="pdSupports">Enter a gas volume and this will say what it ' +
            'supports.</p>' +
            (potential !== null && potential !== undefined
                ? '<p class="pd-note">This prospect was recorded at ' + esc(fmtKw(potential)) +
                  ' of potential. That is the figure the source published, not what the gas ' +
                  'was measured to support.</p>'
                : '') +
            '<button type="submit" class="pd-btn">Promote to project</button>' +
        '</form>';
    }

    /* ===== RIGHT-SIZING =====================================================================
     * Everything here is derived on read. The only stored figure is the study, because what a
     * PDF says cannot be computed from anything in this repo. */
    function sizingBlock(project) {
        if (typeof ProjectSizing === 'undefined') return '';
        var a = ProjectSizing.assess(project);
        var out = '';
        if (!a.measured) {
            out += '<p class="pd-refused">' + esc(a.reason) + '</p>';
        } else {
            var tone = a.fits ? 'ok' : (a.excess_kw > 0 ? 'warn' : 'note');
            out += '<p class="pd-size-head pd-' + tone + '">' + esc(a.headline) + '</p>' +
                '<dl class="pd-size">' +
                    row('Building', fmtKw(a.build_kw)) +
                    row('Gas supports', fmtKw(a.supported_kw)) +
                    (a.excess_kw > 0 ? row('Above the gas', fmtKw(a.excess_kw)) : '') +
                    (a.stranded_kw > 0 ? row('Gas not taken', fmtKw(a.stranded_kw)) : '') +
                    row('Marginal capital', a.marginal_usd_per_kw === null ? '—'
                        : fmtUsd(a.marginal_usd_per_kw) + '/kW') +
                    /* $0 and "not computed" are opposite claims, so they never share a rendering.
                       The same distinction the contingency ratio needed in the budget ledger. */
                    row('Oversizing penalty', a.penalty_usd === null
                        ? 'not computed' : fmtUsd(a.penalty_usd)) +
                '</dl>' +
                '<p class="pd-basis">' + esc(a.gas.source_note) + '</p>';
        }
        // The term, kept visually apart because it is the one thing here the horizon may speak to
        // and it never produces a figure in dollars.
        var t = ProjectSizing.termSupport(project, new Date().getFullYear());
        var termWord = { covered: 'The term is covered.', short: 'The term is NOT covered.',
                         no_term: 'No contract term is recorded.',
                         unknown: 'The term cannot be assessed.' }[t.state] || '';
        out += '<div class="pd-term">' +
            '<p class="pd-term-head">' + esc(termWord) +
                (t.years_available !== null && t.years_available !== undefined
                    ? ' ' + esc(String(t.years_available)) + ' years available' +
                      (t.contract_term_years ? ' against a ' + esc(String(t.contract_term_years)) +
                       '-year term' : '') + '.'
                    : '') +
            '</p>' +
            '<p class="pd-basis">' + esc(t.note || '') + '</p>' +
        '</div>';

        if (!ProjectSizing.studyOf(project)) {
            out += '<p class="pd-basis pd-directional">Every figure above is directional until ' +
                   'the gas generation forecast is on file. File it against this prospect as a ' +
                   'document of kind "Gas generation forecast", then record its numbers here.</p>';
        }
        return out;
    }

    function row(k, v) {
        return '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>';
    }

    /* ---- Procurement (Stage 6) ----
     *
     * Every decision here belongs to procurement.js, which has its own tests; this turns states
     * into sentences and nothing else. The one thing the panel is responsible for is not
     * flattening the distinction the model works to preserve.
     *
     * THREE COUNTS, THREE SENTENCES. 'late' and 'unknown' are different problems and get
     * different lines. An item nobody can date is not on schedule and is not late either — it
     * is a question about a lead time somebody has to answer, and folding it into either
     * number makes it disappear. Same argument as "$0 and not computed are opposite claims"
     * in the sizing block above. */
    /* One word each, because the column beside this one already says it in full: rendered as
       "PAST THE ORDER DATE  90 days past the order date of 2026-05-30" the label was both
       redundant and long enough to wrap to two lines in an 11ch column. The state names what
       it is; the date says how much. */
    var PROC_STATE = {
        late:      'late',
        blocked:   'blocked',
        due_soon:  'due soon',
        unknown:   'undated',
        scheduled: 'scheduled',
        ordered:   'ordered',
        delivered: 'delivered',
        cancelled: 'cancelled'
    };
    /* Only the first four are things to act on; the rest are states of rest. Used to decide
       which rows carry a tone and which are quiet. */
    var PROC_TONE = { late: 'warn', blocked: 'warn', due_soon: 'note', unknown: 'note' };

    function procWhen(r) {
        if (r.state === 'ordered' || r.state === 'delivered' || r.state === 'cancelled') return '';
        if (r.order_by === null) {
            /* Say which input is missing rather than "unknown". The fix is different for each:
               one is a lead time to chase, the other a date to set on the project. */
            return r.item.lead_time_weeks === null
                ? 'no lead time recorded'
                : 'no date to work back from';
        }
        var d = r.days_late;
        if (d === null) return 'order by ' + r.order_by;
        if (d > 0) return d + ' days past the order date of ' + r.order_by;
        if (d === 0) return 'order today';
        return 'order by ' + r.order_by + ' — ' + (-d) + ' days';
    }

    /* THE DERIVED STATE AND THE STORED STATUS ARE DIFFERENT THINGS, and the row carries both.
       'late' is computed from the dates and nobody can set it; 'ordered' is a fact somebody
       records. A single control showing one and setting the other would let an operator think
       they had cleared a late item by typing at it. */
    function procActions(r) {
        var opts = '';
        for (var i = 0; i < ProjectProcurement.STATUSES.length; i++) {
            var s = ProjectProcurement.STATUSES[i];
            opts += '<option value="' + esc(s) + '"' +
                    (r.item.status === s ? ' selected' : '') + '>' + esc(s) + '</option>';
        }
        /* Removal only for something not yet bought. An ordered item is cancelled, not deleted,
           so the schedule still shows the money went out — procurement.js refuses the other way
           round too, and this keeps the button from offering what the model will decline. */
        var canRemove = r.item.status !== 'ordered' && r.item.status !== 'delivered';
        /* The lead time inline, because it is the field that actually changes: a catalogue
           figure becomes a quoted one, and a quote gets withdrawn. Blank is a real value and
           means unknown, so the input is deliberately not given a placeholder of 0 — the module
           treats absent and zero as different statements and typing over that here would
           reintroduce the reassuring default it was built to refuse. */
        return '<span class="pd-proc-do">' +
            '<input class="pd-proc-wk" type="number" min="0" step="1" ' +
                'data-pid="' + esc(r.item.id) + '" title="Lead time in weeks; blank is unknown" ' +
                'value="' + esc(r.item.lead_time_weeks === null ? '' :
                                String(r.item.lead_time_weeks)) + '" aria-label="Lead weeks">' +
            '<select class="pd-proc-set" data-pid="' + esc(r.item.id) + '" ' +
                'aria-label="Status">' + opts + '</select>' +
            (canRemove ? '<button type="button" class="pd-proc-rm" data-pid="' +
                esc(r.item.id) + '" title="Remove this item">&times;</button>' : '') +
        '</span>';
    }

    function procRow(r) {
        var tone = PROC_TONE[r.state] ? ' pd-proc-' + PROC_TONE[r.state] : '';
        return '<li class="pd-proc-row' + tone + '">' +
            '<span class="pd-proc-what">' +
                (r.item.description ? esc(r.item.description) : absent('unnamed item')) +
                (r.item.vendor ? ' <span class="pd-proc-vendor">' + esc(r.item.vendor) + '</span>' : '') +
            '</span>' +
            '<span class="pd-proc-state">' + esc(PROC_STATE[r.state] || r.state) + '</span>' +
            '<span class="pd-proc-when">' + esc(procWhen(r)) + '</span>' +
            procActions(r) +
        '</li>';
    }

    /* The lead time is the only field with no placeholder value and no default. Leaving it blank
       is a real answer — it is what puts the item on the schedule as 'undated' rather than off
       it — so the label says so instead of the form implying a number is required. */
    function procForm() {
        return '<form id="pdProcForm" class="pd-proc-form">' +
            '<input id="pdProcDesc" type="text" placeholder="Item, e.g. 2MW genset" ' +
                'maxlength="300" required>' +
            '<input id="pdProcVendor" type="text" placeholder="Vendor" maxlength="120">' +
            '<input id="pdProcWeeks" type="number" min="0" step="1" placeholder="Lead wks">' +
            '<label class="pd-proc-need">Need by<input id="pdProcNeed" type="date"></label>' +
            '<label class="pd-proc-perm">' +
                '<input id="pdProcPermit" type="checkbox"> Needs the air permit' +
            '</label>' +
            '<button type="submit">Add</button>' +
            '<span class="pd-proc-hint">Leave the lead time blank if nobody has quoted one — ' +
                'the item shows as undated rather than dropping off the schedule.</span>' +
        '</form>';
    }

    function procurementBlock(project) {
        if (typeof ProjectProcurement === 'undefined') return '';
        var now = Date.now();
        var rows = ProjectProcurement.schedule(project, now);
        if (!rows.length) {
            return '<p class="pd-basis">Nothing is on the procurement schedule yet. Long-lead ' +
                   'items belong here as soon as they are known, because the order date is ' +
                   'worked back from the energisation date and is often already close.</p>' +
                   procForm();
        }
        var s = ProjectProcurement.summary(project, now);
        var lines = [];
        if (s.late) lines.push('<span class="pd-warn">' + s.late + ' past the order date.</span>');
        if (s.blocked) lines.push('<span class="pd-warn">' + s.blocked +
            ' cannot be ordered until the air permit is issued.</span>');
        if (s.due_soon) lines.push(s.due_soon + ' to order within ' +
            ProjectProcurement.DUE_SOON_DAYS + ' days.');
        /* Never merged into the two above, and never silent. */
        if (s.unknown) lines.push('<span class="pd-warn">' + s.unknown +
            ' cannot be dated at all.</span>');
        if (!lines.length) lines.push('Nothing needs ordering yet.');

        var list = '';
        for (var i = 0; i < rows.length; i++) list += procRow(rows[i]);
        return '<p class="pd-proc-head">' + lines.join(' ') + '</p>' +
               '<ul class="pd-proc">' + list + '</ul>' + procForm();
    }

    /* ---- Budget (Stage 4, reachable at last) ----
     *
     * The ledger has had ninety-three passing assertions and no way in since it was built: no
     * control anywhere added a line, edited one, removed one, or seeded the opening budget from
     * the estimate. tests/workspace-reach.test.js found it, and this is the other half.
     *
     * THREE STATES, THREE COLUMNS, NEVER ONE NUMBER. budgeted -> committed -> spent is the
     * distinction the module exists for: once a PO is issued the money is effectively gone, and
     * a panel reporting only what has been invoiced hides the exposure until the invoice lands.
     * Showing a single "cost so far" would undo the entire model.
     *
     * AT RISK IS NEVER FOLDED IN. Diligence money is spent on a project that can still die.
     * totals() holds it out of the capital figures and so does this — a project that has spent
     * $200K proving a site unviable must not read like one that has started building.
     */
    var BUD_COLS = [
        { key: 'budgeted',  label: 'Budgeted' },
        { key: 'committed', label: 'Committed' },
        { key: 'spent',     label: 'Spent' }
    ];

    function budLineRow(l) {
        /* INLINE INPUTS THAT COMMIT ON CHANGE, matching the enrichment checklist above: budget
           work happens in the middle of doing something else — an invoice open in another tab —
           and a ledger with a Save button is one that gets half-filled and abandoned. */
        var f = ['budgeted_amount', 'committed_amount', 'spent_amount'].map(function (k) {
            return '<input class="pd-bud-amt" type="number" min="0" step="1" ' +
                   'data-lid="' + esc(l.id) + '" data-field="' + esc(k) + '" ' +
                   'value="' + esc(String(l[k] === null || l[k] === undefined ? 0 : l[k])) + '" ' +
                   'aria-label="' + esc(k.replace(/_/g, ' ')) + '">';
        }).join('');
        return '<li class="pd-bud-line">' +
            '<span class="pd-bud-what">' +
                (l.vendor ? esc(l.vendor) : absent('no vendor')) +
                (l.seeded ? ' <span class="pd-bud-seeded">from estimate</span>' : '') +
                (l.notes ? '<span class="pd-bud-note">' + esc(l.notes) + '</span>' : '') +
            '</span>' +
            '<span class="pd-bud-amts">' + f + '</span>' +
            '<button type="button" class="pd-bud-rm" data-lid="' + esc(l.id) + '" ' +
                'title="Remove this line">&times;</button>' +
        '</li>';
    }

    function budCatRow(c) {
        /* Variance is null where nothing was budgeted, and the two reasons for that are
           different claims: the estimator priced it at zero deliberately (site acquisition on a
           raw resource), or nobody planned for it at all. project-budget keeps them apart and so
           does this — "unbudgeted" is a question, "priced at zero" is an answer. */
        var v = '';
        if (c.variance === null) {
            v = c.unbudgeted ? '<span class="pd-warn">unbudgeted</span>'
              : (c.zero_contradicted ? '<span class="pd-warn">priced at zero, and spent</span>'
                                     : '<span class="pd-bud-quiet">priced at zero</span>');
        } else if (c.variance > 0) {
            v = '<span class="pd-warn">+' + esc(fmtUsd(c.variance)) +
                ' (' + esc(String(c.variance_pct)) + '%)</span>';
        } else if (c.variance < 0) {
            v = esc(fmtUsd(c.variance)) + ' (' + esc(String(c.variance_pct)) + '%)';
        } else {
            v = 'on budget';
        }
        return '<li class="pd-bud-cat">' +
            '<span class="pd-bud-catname">' + esc(c.label) + '</span>' +
            '<span class="pd-bud-catnums">' +
                esc(fmtUsd(c.budgeted)) + ' &middot; ' + esc(fmtUsd(c.committed)) +
                ' &middot; ' + esc(fmtUsd(c.spent)) +
            '</span>' +
            '<span class="pd-bud-var">' + v + '</span>' +
        '</li>';
    }

    var CO_LABEL = { proposed: 'proposed', approved: 'approved', rejected: 'rejected' };

    function budChangeRow(c, project) {
        var who = c.contractor_id && project.contractors[c.contractor_id];
        return '<li class="pd-bud-co">' +
            '<span class="pd-bud-what">' + esc(c.description || c.id) +
                (who ? ' <span class="pd-bud-quiet">' + esc(who.name) + '</span>' : '') +
                (c.revised_at ? ' <span class="pd-bud-seeded">revised</span>' : '') +
            '</span>' +
            '<span class="pd-bud-catnums">' + esc(fmtUsd(c.cost_impact)) + ' &middot; ' +
                esc(String(c.schedule_impact_days)) + 'd</span>' +
            '<span class="pd-bud-var">' + esc(CO_LABEL[c.status] || c.status) + '</span>' +
            /* Revising an APPROVED change order only. A proposed one is decided, not revised,
               and CrmLog.supersede exists so the original stays on the timeline with the new one
               pointing back at it — quietly editing an approved change is how a cumulative
               change figure stops recording anything. */
            (c.status === 'approved'
                ? '<button type="button" class="pd-bud-rev" data-coid="' + esc(c.id) +
                  '">Revise</button>' : '<span></span>') +
        '</li>';
    }

    function budgetForm(project) {
        var opts = '';
        for (var i = 0; i < ProjectBudget.CATEGORIES.length; i++) {
            var c = ProjectBudget.CATEGORIES[i];
            opts += '<option value="' + esc(c.id) + '">' + esc(c.label) + '</option>';
        }
        return '<form id="pdBudForm" class="pd-bud-form">' +
            '<select id="pdBudCat" aria-label="Category">' + opts + '</select>' +
            '<input id="pdBudVendor" type="text" placeholder="Vendor" maxlength="120">' +
            '<input id="pdBudB" type="number" min="0" step="1" placeholder="Budgeted $">' +
            '<input id="pdBudC" type="number" min="0" step="1" placeholder="Committed $">' +
            '<input id="pdBudS" type="number" min="0" step="1" placeholder="Spent $">' +
            '<button type="submit">Add line</button>' +
            '<span class="pd-bud-hint">One figure is enough. Committed is the one that matters ' +
                'and the one nothing tracked before: once a PO is issued the money is gone, ' +
                'and a ledger showing only what has been invoiced looks fine right up until ' +
                'it does not.</span>' +
        '</form>';
    }

    function budgetBlock(project) {
        if (typeof ProjectBudget === 'undefined') return '';
        var t = ProjectBudget.totals(project);
        var lines = ProjectBudget.lines(project);
        var cats = ProjectBudget.byCategory(project);
        var cos = ProjectBudget.changeOrders(project);

        var head = [];
        if (t.authorised === null) {
            head.push('<span class="pd-warn">No authorised budget is recorded, so nothing can ' +
                      'be measured against one.</span>');
        } else {
            head.push(fmtUsd(t.committed) + ' committed of ' + fmtUsd(t.authorised) + ' authorised.');
            if (t.remaining !== null && t.remaining < 0) {
                head.push('<span class="pd-warn">' + fmtUsd(-t.remaining) +
                          ' over the authorised budget.</span>');
            } else if (t.remaining !== null) {
                head.push(fmtUsd(t.remaining) + ' remaining.');
            }
        }
        if (t.spent) head.push(fmtUsd(t.spent) + ' of that has actually been invoiced.');
        /* Its own sentence, always, because folding it into committed is the specific lie this
           ledger refuses to tell. */
        if (t.at_risk_committed || t.at_risk_spent) {
            head.push('<span class="pd-warn">' + fmtUsd(t.at_risk_committed) +
                      ' committed at risk on diligence, held out of the capital figures.</span>');
        }
        if (t.change_order_count) {
            head.push(t.change_order_count + ' approved change order' +
                (t.change_order_count === 1 ? '' : 's') + ': ' + fmtUsd(t.change_order_value) +
                (t.change_order_pct === null ? '' : ' (' + t.change_order_pct + '% of authorised)') +
                ' and ' + t.change_order_days + ' days.');
        }
        /* Null and zero are opposite claims here and the module is explicit about it: a ratio of
           0 means the contingency is gone, which is the loudest thing this ledger says; null
           means none was ever set aside, and a freshly seeded project always lands there. */
        if (t.contingency_ratio === null) {
            if (t.contingency_budgeted === 0 && lines.length) {
                head.push('No contingency is budgeted, so there is no ratio to watch.');
            }
        } else if (t.contingency_ratio <= 25) {
            head.push('<span class="pd-warn">Contingency is ' + t.contingency_ratio +
                      '% of what is left to spend.</span>');
        } else {
            head.push('Contingency is ' + t.contingency_ratio + '% of what is left to spend.');
        }

        if (!lines.length) {
            /* The seed is offered only here. seedFromEstimate() refuses once any line exists,
               because the estimate is the OPENING budget and re-seeding a ledger in flight would
               overwrite what actually happened with what was predicted. */
            return '<p class="pd-basis">No budget lines yet. Seeding from the capex estimate ' +
                   'makes the model\'s own numbers the opening budget, so estimate-versus-actual ' +
                   'falls out for free instead of being reconstructed later.</p>' +
                   '<p class="pd-bud-seedrow">' +
                   '<button type="button" id="pdBudSeed">Seed from the estimate</button></p>' +
                   budgetForm(project);
        }

        var catHtml = '';
        for (var i = 0; i < cats.length; i++) {
            catHtml += budCatRow(cats[i]);
            for (var j = 0; j < lines.length; j++) {
                if (lines[j].category === cats[i].id) catHtml += budLineRow(lines[j]);
            }
        }
        var coHtml = '';
        for (var k = 0; k < cos.length; k++) coHtml += budChangeRow(cos[k], project);

        return '<p class="pd-bud-head">' + head.join(' ') + '</p>' +
               '<p class="pd-bud-cols">Budgeted &middot; Committed &middot; Spent</p>' +
               '<ul class="pd-bud">' + catHtml + '</ul>' +
               (coHtml ? '<p class="pd-bud-sub">Change orders</p><ul class="pd-bud">' +
                         coHtml + '</ul>' : '') +
               budgetForm(project);
    }

    function budgetSection(rec) {
        if (typeof ProjectData === 'undefined' || !ProjectData.liveFor) return '';
        var p = ProjectData.liveFor(rec.id);
        if (!p) return '';
        return '<section class="pd-sec"><h3>Budget</h3>' + budgetBlock(p) + '</section>';
    }

    /* ---- Contractors (Stage 7) ----
     *
     * project-contractors.js makes every decision here and has its own tests; this turns states
     * into sentences. The panel's one job is not to flatten a distinction the model works to
     * keep, and this one has more of them than the procurement schedule did, because the
     * conditions CO-OCCUR: a terminated firm can be uninsured, over-certified and unwaived at
     * once. The row shows the worst; the head counts each condition on its own.
     *
     * NOTHING ON THE HEAD IS EVER ADDED TOGETHER. Money paid with no waiver, money under a
     * conditional waiver, and money we still owe on a certified application are three different
     * quantities with three different calls to make -- a lawyer, the bank, and accounts payable.
     * A combined figure would say "there is $340,000 of something here" and name no action,
     * which is the failure the procurement head avoids by keeping late, blocked and undated
     * apart. */
    var CT_STATE = {
        uninsured:      'uninsured',
        unwaived:       'unwaived',
        overcertified:  'over',
        unpaid:         'owed',
        conditional:    'conditional',
        insurance_soon: 'expiring',
        unknown:        'unknown',
        active:         'active',
        complete:       'complete',
        terminated:     'terminated'
    };
    /* Everything above 'active' is something to do this week. 'unpaid' is a note rather than a
       warning: money we owe is a payment to release, not an exposure. */
    var CT_TONE = { uninsured: 'warn', unwaived: 'warn', overcertified: 'warn',
                    conditional: 'note', unpaid: 'note', insurance_soon: 'note', unknown: 'note' };

    /* Say WHICH input is missing rather than "unknown", for the reason procWhen() gives: a
       contract sum is typed in, an application is priced from the certificate, and an insurance
       date is chased from the broker. Three different fixes. */
    function ctUnknownWhy(r) {
        if (r.flags.unpriced_apps) {
            return r.unpriced_apps + ' application' + (r.unpriced_apps === 1 ? '' : 's') +
                   ' with no amount';
        }
        if (r.flags.variations_unknown) return 'variations not loaded';
        if (r.flags.unpriced_contract) return 'no contract sum recorded';
        if (r.flags.insurance_undated) return 'no insurance date';
        return 'nothing recorded';
    }

    function ctWhen(r) {
        if (r.state === 'uninsured') return 'insurance expired ' + r.insurance_days + ' days ago';
        if (r.state === 'insurance_soon') return 'insurance expires in ' + (-r.insurance_days) + ' days';
        if (r.state === 'unwaived') return fmtUsd(r.unwaived_usd) + ' paid, no waiver';
        if (r.state === 'conditional') return fmtUsd(r.conditional_usd) + ' conditional only';
        if (r.state === 'overcertified') return fmtUsd(r.overcertified_usd) + ' over the contract';
        if (r.state === 'unpaid') return fmtUsd(r.outstanding_usd) + ' certified, unpaid';
        if (r.state === 'unknown') return ctUnknownWhy(r);
        if (r.paid_usd > 0) return fmtUsd(r.paid_usd) + ' paid to date';
        return r.committed_usd === null ? '' : fmtUsd(r.committed_usd) + ' contracted';
    }

    /* THE WAIVER IS SHOWN ON EVERY PAID APPLICATION, INCLUDING WHEN THERE IS NONE.
       A blank where the waiver should be reads as "not applicable"; the word 'none' reads as an
       answer, which is what it is. Same reason the model files an absent waiver as 'none'
       rather than as unknown. */
    var WAIVER_LABEL = { none: 'no waiver', conditional: 'conditional',
                         unconditional: 'unconditional' };

    function appActions(a) {
        var id = esc(a.id);
        if (a.status === 'submitted') {
            /* Reject beside Certify, because the two are the same decision and offering only the
               agreeing half is how an application nobody accepts sits as 'submitted' forever
               and quietly inflates the waiting-to-be-certified count. */
            return '<button type="button" class="pd-ct-act" data-do="certify" data-aid="' + id +
                   '">Certify</button>' +
                   '<button type="button" class="pd-ct-act" data-do="reject" data-aid="' + id +
                   '">Reject</button>';
        }
        if (a.status === 'certified') {
            return '<button type="button" class="pd-ct-act" data-do="pay" data-aid="' + id +
                   '">Record payment</button>';
        }
        if (a.status === 'paid' && a.waiver !== 'unconditional') {
            /* Both offered, because they are different documents and the conditional one is
               often all that exists on the day. Recording the weaker one honestly beats
               recording nothing, and the register keeps saying so until the swap. */
            return (a.waiver === 'none'
                ? '<button type="button" class="pd-ct-act" data-do="cond" data-aid="' + id +
                  '">Conditional waiver</button>' : '') +
                '<button type="button" class="pd-ct-act" data-do="uncond" data-aid="' + id +
                '">Unconditional waiver</button>';
        }
        return '';
    }

    function appRow(a) {
        var net = ProjectContractors.netOf(a);
        var warn = (a.status === 'paid' && a.waiver !== 'unconditional') ? ' pd-ct-app-warn' : '';
        return '<li class="pd-ct-app' + warn + '">' +
            '<span class="pd-ct-app-no">' +
                esc(a.number || a.period_to || a.id) + '</span>' +
            '<span class="pd-ct-app-amt">' +
                (net === null ? absent('no amount') : esc(fmtUsd(net))) +
                (a.retained_usd ? ' <span class="pd-ct-ret">' + esc(fmtUsd(a.retained_usd)) +
                    ' held</span>' : '') +
            '</span>' +
            '<span class="pd-ct-app-st">' + esc(a.status) +
                (a.status === 'paid' ? ' &middot; ' + esc(WAIVER_LABEL[a.waiver] || a.waiver) : '') +
            '</span>' +
            '<span class="pd-ct-app-do">' + appActions(a) + '</span>' +
        '</li>';
    }

    function ctRow(r, project) {
        var tone = CT_TONE[r.state] ? ' pd-ct-' + CT_TONE[r.state] : '';
        var c = r.contractor;
        var apps = ProjectContractors.appsFor(project, c.id);
        var nested = '';
        if (apps.length) {
            var inner = '';
            for (var i = 0; i < apps.length; i++) inner += appRow(apps[i]);
            nested = '<ul class="pd-ct-apps">' + inner + '</ul>';
        }
        return '<li class="pd-ct-row' + tone + '">' +
            '<span class="pd-ct-who">' +
                (c.name ? esc(c.name) : absent('unnamed contractor')) +
                (c.trade ? ' <span class="pd-ct-trade">' + esc(c.trade) + '</span>' : '') +
            '</span>' +
            '<span class="pd-ct-state">' + esc(CT_STATE[r.state] || r.state) + '</span>' +
            '<span class="pd-ct-when">' + esc(ctWhen(r)) + '</span>' +
            /* The insurance date inline: it is the one field on a contractor that genuinely
               changes, it expires on a schedule, and chasing a renewal is the most common edit
               anybody makes here. The contract sum is deliberately NOT editable inline — the
               model closes it at the first certificate and the way to change it after that is a
               change order, so an input offering to would be inviting a refusal. */
            '<span class="pd-ct-do">' +
                '<input class="pd-ct-ins-set" type="date" data-cid="' + esc(c.id) + '" ' +
                    'title="Certificate of insurance expires" ' +
                    'value="' + esc(c.insurance_expiry || '') + '" aria-label="Insurance expiry">' +
                (apps.length ? '' :
                    '<button type="button" class="pd-ct-rm" data-cid="' + esc(c.id) +
                    '" title="Remove this contractor">&times;</button>') +
            '</span>' +
            nested +
        '</li>';
    }

    function ctOptions(rows) {
        var out = '';
        for (var i = 0; i < rows.length; i++) {
            var c = rows[i].contractor;
            out += '<option value="' + esc(c.id) + '">' +
                   esc(c.name || c.id) + '</option>';
        }
        return out;
    }

    /* Three forms rather than one, because they are three different acts on three different
       cadences: a firm is added once, an application arrives monthly, and a variation happens
       when the scope changes. Folding them into one control with a mode switch would make the
       common case carry the rare one's fields. */
    function ctForms(project, rows) {
        var opts = ctOptions(rows);
        var add = '<form id="pdCtForm" class="pd-ct-form">' +
            '<input id="pdCtName" type="text" placeholder="Contractor" maxlength="120" required>' +
            '<input id="pdCtTrade" type="text" placeholder="Trade" maxlength="60">' +
            '<input id="pdCtValue" type="number" min="0" step="1" placeholder="Contract $">' +
            '<label class="pd-ct-ins">Insurance to<input id="pdCtIns" type="date"></label>' +
            '<button type="submit">Add contractor</button>' +
            '<span class="pd-ct-hint">The contract value can be left blank until it is priced. ' +
                'The insurance date cannot be inferred, and a firm with no date recorded reads ' +
                'as unverified rather than covered.</span>' +
        '</form>';
        if (!opts) return add;

        var app = '<form id="pdPaForm" class="pd-ct-form">' +
            '<select id="pdPaWho" aria-label="Contractor">' + opts + '</select>' +
            '<input id="pdPaNo" type="text" placeholder="App no." maxlength="40">' +
            '<label class="pd-ct-ins">Period to<input id="pdPaPeriod" type="date" required></label>' +
            '<input id="pdPaAmt" type="number" min="0" step="1" placeholder="Certified $" required>' +
            '<input id="pdPaRet" type="number" min="0" step="1" placeholder="Retainage $">' +
            '<button type="submit">Add application</button>' +
        '</form>';

        /* A variation is raised here rather than on a budget screen because this is where the
           over-certification it explains is visible. It is the same ProjectBudget change order
           the ledger counts — one record, not a contractor-local copy. */
        var vary = '<form id="pdCoForm" class="pd-ct-form">' +
            '<select id="pdCoWho" aria-label="Contract varied">' +
                '<option value="">No contract (project cost)</option>' + opts + '</select>' +
            '<input id="pdCoDesc" type="text" placeholder="Variation" maxlength="300" required>' +
            '<input id="pdCoWhy" type="text" placeholder="Reason" maxlength="500" required>' +
            '<input id="pdCoCost" type="number" step="1" placeholder="Cost $" required>' +
            '<input id="pdCoDays" type="number" step="1" placeholder="Days" required>' +
            '<button type="submit">Raise variation</button>' +
            '<span class="pd-ct-hint">Both impacts are required, even at zero: a change with no ' +
                'schedule impact is a claim, and the cumulative figure is only honest if nobody ' +
                'could opt out of half of it.</span>' +
        '</form>';
        return add + app + vary;
    }

    /* Proposed variations, listed only while they are proposed. An approved one has already
       moved the contract value and shows up there; a rejected one is not pending anything. */
    function variationBlock(project) {
        if (typeof ProjectBudget === 'undefined' || !ProjectBudget.changeOrders) return '';
        var cos = ProjectBudget.changeOrders(project).filter(function (c) {
            return c.status === 'proposed';
        });
        if (!cos.length) return '';
        var out = '';
        for (var i = 0; i < cos.length; i++) {
            var c = cos[i];
            var who = c.contractor_id && project.contractors[c.contractor_id];
            out += '<li class="pd-ct-app">' +
                '<span class="pd-ct-app-no">' + esc(c.description || c.id) + '</span>' +
                '<span class="pd-ct-app-amt">' + esc(fmtUsd(c.cost_impact)) +
                    ' &middot; ' + esc(String(c.schedule_impact_days)) + 'd</span>' +
                '<span class="pd-ct-app-st">' +
                    (who ? esc(who.name) : absent('no contract')) + '</span>' +
                '<span class="pd-ct-app-do">' +
                    '<button type="button" class="pd-ct-act" data-do="approveco" data-coid="' +
                        esc(c.id) + '">Approve</button>' +
                    '<button type="button" class="pd-ct-act" data-do="rejectco" data-coid="' +
                        esc(c.id) + '">Reject</button>' +
                '</span>' +
            '</li>';
        }
        return '<p class="pd-ct-sub">Variations awaiting a decision. Until one is approved it ' +
               'changes no contract value, so the work it covers still reads as ' +
               'over-certified.</p><ul class="pd-ct-apps pd-ct-cos">' + out + '</ul>';
    }

    function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

    function contractorsBlock(project) {
        if (typeof ProjectContractors === 'undefined') return '';
        var now = Date.now();
        var rows = ProjectContractors.register(project, now);
        if (!rows.length) {
            return '<p class="pd-basis">No contractors on this build yet. A firm belongs here ' +
                   'as soon as it is selected, because the window where nobody has checked its ' +
                   'insurance is the window before the contract is signed.</p>' +
                   ctForms(project, rows);
        }
        var e = ProjectContractors.exposure(project, now);
        var lines = [];
        /* Ordered the way the register is: unbounded and true today, then money that can be
           claimed twice, then money we owe. */
        if (e.uninsured_count) lines.push('<span class="pd-warn">' +
            plural(e.uninsured_count, 'contractor has', 'contractors have') +
            ' no current certificate of insurance.</span>');
        if (e.unwaived_count) lines.push('<span class="pd-warn">' +
            plural(e.unwaived_count, 'contractor has', 'contractors have') + ' been paid ' +
            fmtUsd(e.unwaived_usd) + ' with no lien waiver on file.</span>');
        /* NEVER MERGED WITH THE LINE ABOVE. A conditional waiver is a real document that
           releases nothing until the cheque clears; adding the two amounts would close an
           exposure that is entirely intact. */
        if (e.conditional_count) lines.push('<span class="pd-warn">' +
            plural(e.conditional_count, 'contractor holds', 'contractors hold') +
            ' a conditional waiver only, over ' + fmtUsd(e.conditional_usd) +
            ' — nothing is released until the payment clears.</span>');
        if (e.overcertified_count) lines.push('<span class="pd-warn">' +
            plural(e.overcertified_count, 'contractor has', 'contractors have') +
            ' certified ' + fmtUsd(e.overcertified_usd) + ' beyond the contract, with no ' +
            'change order behind it.</span>');
        if (e.outstanding_count) lines.push(plural(e.outstanding_count, 'contractor is', 'contractors are') +
            ' owed ' + fmtUsd(e.outstanding_usd) + ' on certified applications.');
        if (e.insurance_soon_count) lines.push(
            plural(e.insurance_soon_count, 'certificate expires', 'certificates expire') +
            ' within ' + ProjectContractors.INSURANCE_SOON_DAYS + ' days.');
        if (e.submitted_count) lines.push(plural(e.submitted_count, 'application is', 'applications are') +
            ' waiting to be certified.');
        /* The three unknowns, each its own sentence and each warned, for the same reason
           procurement never folds 'undated' into 'scheduled': a figure nobody can compute is a
           question for today, not a footnote. */
        if (e.insurance_undated_count) lines.push('<span class="pd-warn">' +
            plural(e.insurance_undated_count, 'contractor has', 'contractors have') +
            ' no insurance expiry recorded, so the cover is unverified rather than valid.</span>');
        if (e.unpriced_contract_count) lines.push('<span class="pd-warn">' +
            plural(e.unpriced_contract_count, 'contract has', 'contracts have') +
            ' no value recorded, so nothing can be measured against them.</span>');
        if (e.unpriced_apps) lines.push('<span class="pd-warn">' +
            plural(e.unpriced_apps, 'application carries', 'applications carry') +
            ' no amount, so these figures are a floor.</span>');
        if (e.variations_unknown) lines.push('<span class="pd-warn">Approved change orders ' +
            'could not be read, so no contract value here accounts for its variations.</span>');
        if (!lines.length) lines.push('Every contractor is insured, paid and waived.');

        var list = '';
        for (var i = 0; i < rows.length; i++) list += ctRow(rows[i], project);
        return '<p class="pd-ct-head">' + lines.join(' ') + '</p>' +
               '<ul class="pd-ct">' + list + '</ul>' +
               variationBlock(project) +
               ctForms(project, rows);
    }

    /* Its own section for the same reason procurement has one: it is answered on a different
       cadence from the build sizing, and the lien position changes with every cheque. */
    function contractorsSection(rec) {
        if (typeof ProjectData === 'undefined' || !ProjectData.liveFor) return '';
        var p = ProjectData.liveFor(rec.id);
        /* Nothing is contracted for a prospect. An empty register before promotion would invite
           firms onto a record with no budget to pay them from. */
        if (!p) return '';
        return '<section class="pd-sec"><h3>Contractors</h3>' + contractorsBlock(p) + '</section>';
    }

    /* The three figures the header leads with: usable capacity, capital required, all-in $/kW.
       Priced through SiteCapex.stack exactly as the map's capital panel prices it — the same
       code path, so the two views cannot show different dollars for one site. Absence is
       stated per figure: a prospect with no capacity says so rather than pricing nothing. */
    function headFigures(rec) {
        var kw = rec.usable_kw !== null && rec.usable_kw !== undefined && rec.usable_kw !== ''
            ? Number(rec.usable_kw)
            : (rec.nameplate_kw !== null && rec.nameplate_kw !== undefined ? Number(rec.nameplate_kw) : null);
        var required = null, allInPerKw = null;
        if (kw !== null && kw > 0 && typeof SiteCapex !== 'undefined' && SiteCapex.stack) {
            var minerCapex = null;
            if (typeof SiteEngine !== 'undefined') {
                var probe = SiteEngine.evaluate({ nameplate_kw: kw, usable_kw: kw,
                                                  purchase_price_usd: 0, power_rate: 0 }, {});
                minerCapex = probe.miner_capex_usd;
            }
            var st = SiteCapex.stack(rec, {
                capacityKw: kw,
                minerCapexUsd: minerCapex,
                acquisitionUsd: (rec.purchase_price_usd !== null && rec.purchase_price_usd !== undefined &&
                                 rec.purchase_price_usd !== '') ? Number(rec.purchase_price_usd) : null
            });
            if (st) {
                if (st.incurred_usd !== null && st.incurred_usd !== undefined) required = st.incurred_usd;
                if (st.all_in_capital_usd !== null && st.all_in_capital_usd !== undefined && kw > 0) {
                    allInPerKw = st.all_in_capital_usd / kw;
                }
            }
        }
        function fig(label, value) {
            return '<div class="pd-fig"><span class="pd-fig-l">' + label + '</span>' +
                   '<span class="pd-fig-v">' + value + '</span></div>';
        }
        return '<div class="pd-figs">' +
            fig('Usable capacity', kw === null ? absent('unknown') : mw(kw)) +
            fig('Capital required', required === null ? absent('not priced') : fmtUsd(required)) +
            fig('All-in $/kW', allInPerKw === null ? absent('not priced')
                : fmtUsd(Math.round(allInPerKw)) + '<span class="pd-fig-unit">/kW</span>') +
            '</div>';
    }

    function projectBlock(rec) {
        if (typeof ProjectData === 'undefined' || !ProjectData.liveFor) return '';
        var p = ProjectData.liveFor(rec.id);
        if (!p) return promoteForm(rec);
        return '<p class="pd-projhead">Project ' + esc(p.id) + ' &middot; ' +
                   esc(PROMOTED_GATE_LABELS[p.gate] || p.gate) + ' &middot; ' +
                   esc(fmtKw(p.capacity_kw)) + ' &middot; budget ' +
                   esc(fmtUsd(p.budget_authorised_usd)) + '</p>' +
               sizingBlock(p);
    }

    /* ---- The gate checklist (the machinery that had no caller) ----
     *
     * ProjectGates carried setStatus, waive, unwaive and canAdvance; ProjectData carried
     * setGate and cancel; project-budget consumed the READ side. Not one line of UI anywhere
     * called a writer, so every promoted project sat at "target & screen" forever, permits
     * could never be recorded as obtained, and a dead project could not even be cancelled.
     * The procurement panel taught this workspace the lesson already: a model whose writers
     * have no controls is a read-only report wearing a workflow's clothes. */
    function gatesSection(rec) {
        if (typeof ProjectData === 'undefined' || !ProjectData.liveFor) return '';
        var p = ProjectData.liveFor(rec.id);
        if (!p) return '';
        if (typeof ProjectGates === 'undefined' || !ProjectGates.itemsFor) return '';

        var items = ProjectGates.itemsFor(p, p.gate);
        var html = '<section class="pd-sec"><h3>Gate: ' +
                   esc(PROMOTED_GATE_LABELS[p.gate] || p.gate) + '</h3>';

        if (items === null) {
            /* Config missing is said, not padded over — a checklist rendered from guesses
               would read as requirements nobody set. */
            html += '<p class="pd-note">Gate requirements are not configured, so nothing can ' +
                    'be checked off. crm-config.js defines them.</p></section>';
            return html;
        }

        var rd = ProjectGates.readiness ? ProjectGates.readiness(p, p.gate) : null;
        if (rd && typeof rd.pct === 'number') {
            html += '<p class="pd-note">Readiness ' + Math.round(rd.pct) + '%' +
                    (rd.denominator === 0 ? ' — nothing required at this gate' : '') + '</p>';
        }

        html += '<ul class="pd-gate-list">';
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            html += '<li class="pd-gate-item' + (it.satisfied ? ' is-done' : '') + '">' +
                '<span class="pd-gate-label"' + (it.why ? ' title="' + esc(it.why) + '"' : '') + '>' +
                    esc(it.label) +
                    (it.blocking ? ' <span class="pd-gate-block" title="Blocking: the gate ' +
                        'cannot close without this or a waiver.">blocking</span>' : '') +
                '</span>';
            if (it.waived) {
                html += '<span class="pd-gate-waived">waived — ' + esc(it.waived_reason || '') +
                        ' (' + esc(it.waived_by || '?') + ')</span>' +
                        '<button type="button" class="pd-gate-unwaive" data-key="' + esc(it.key) +
                        '">Reinstate</button>';
            } else {
                html += '<select class="pd-gate-set" data-key="' + esc(it.key) + '">' +
                    ['not_started', 'in_progress', 'complete', 'na'].map(function (s) {
                        return '<option value="' + s + '"' + (it.status === s ? ' selected' : '') +
                               '>' + s.replace(/_/g, ' ') + '</option>';
                    }).join('') + '</select>' +
                    (it.awaiting_document
                        ? '<span class="pd-gate-await">complete, but no ' +
                          esc(it.evidence_kind || 'document') + ' on file</span>' : '') +
                    (it.blocking && !it.satisfied
                        ? '<button type="button" class="pd-gate-waive" data-key="' + esc(it.key) +
                          '">Waive…</button>' : '');
            }
            html += '</li>';
        }
        html += '</ul>';

        /* The move itself. Forward is earned (canAdvance decides and names the blockers);
           cancellation is a decision with a reason. Both existed in the model for the whole
           life of this page and neither had a button. */
        var order = ProjectData.GATES || [];
        var idx = order.indexOf(p.gate);
        var next = idx >= 0 && idx + 1 < order.length ? order[idx + 1] : null;
        if (next && next !== 'cancelled') {
            var verdict = ProjectGates.canAdvance ? ProjectGates.canAdvance(p, next) : { ok: false };
            if (verdict.ok) {
                html += '<button type="button" class="pd-gate-adv" id="pdGateAdvance" data-to="' +
                        esc(next) + '">Advance to ' +
                        esc(PROMOTED_GATE_LABELS[next] || next) + '</button>';
            } else {
                var bl = (verdict.blockers || []).map(function (b) { return b.label; });
                html += '<p class="pd-note">Cannot advance to ' +
                        esc(PROMOTED_GATE_LABELS[next] || next) + ' yet' +
                        (bl.length ? ' — waiting on: ' + esc(bl.join('; ')) : '') + '.</p>';
            }
        }
        html += '<button type="button" class="pd-gate-cancel" id="pdGateCancel">Cancel project…</button>';
        html += '</section>';
        return html;
    }

    /* Its own section rather than a tail on Build, because it is answered on a different
       cadence: the build sizing is settled once and revisited rarely, while what should have
       been ordered changes every morning. */
    function procurementSection(rec) {
        if (typeof ProjectData === 'undefined' || !ProjectData.liveFor) return '';
        var p = ProjectData.liveFor(rec.id);
        /* Nothing is procured for a prospect. Showing an empty schedule before promotion would
           invite items onto a record that has no energisation date to work back from. */
        if (!p) return '';
        return '<section class="pd-sec"><h3>Procurement</h3>' + procurementBlock(p) + '</section>';
    }

    /* ---- Moving the prospect on ----
     *
     * THE PICKER SAYS WHAT STAGE THIS IS. THE BUTTON SAYS WHAT TO DO NEXT.
     *
     * A <select> is a correct control and it does not read as one here: it sits in the header
     * beside four read-only facts, under a 10.5px uppercase label in the dimmest colour on the
     * page, which is the styling of a field caption rather than of an action. Both ways to move
     * a prospect existed and worked, and both were missed -- the board's only mechanism is a
     * drag with no affordance, and clicking a card there deliberately OPENS it instead. A
     * feature nobody can find is not meaningfully different from one that was never wired,
     * which is the lesson the whole procurement panel already taught this workspace.
     *
     * So this names the destination and is a button. It does not replace the picker: the picker
     * still goes backwards, sideways and to Dead, which are all real moves.
     */
    function nextStage(rec) {
        if (typeof CrmConfig === 'undefined' || !CrmConfig.stages) return null;
        var list = CrmConfig.stages();
        for (var i = 0; i < list.length; i++) {
            if (list[i].key !== rec.stage) continue;
            var next = list[i + 1];
            if (!next) return null;             // already at the end of the pipeline
            /* DEAD IS NEVER AN ADVANCE. site-model.js:390 refuses it without a reason from the
               configured list, so a one-click "advance" here would open a prompt menu demanding
               a decision -- which is not what a button labelled Advance should do. It is an
               outcome you record, and the picker is where you record it. Keyed by name because
               the model special-cases it by name; if that ever generalises to a flag, ask the
               model rather than re-deriving the rule here. */
            if (next.key === 'dead') return null;
            return next;
        }
        return null;                            // a stage the config no longer lists
    }

    function advanceControl(rec) {
        var n = nextStage(rec);
        if (!n) return '';
        return '<button type="button" class="pd-advance" id="pdAdvance" ' +
               'data-to="' + esc(n.key) + '">Advance to ' + esc(n.label) + '</button>';
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
            '<h2 class="pd-title">' + esc(rec.name || rec.id) + promotedPill(rec) + '</h2>' +
            '<a class="pd-sumlink" href="#s/' + esc(encodeURIComponent(rec.id)) + '">' +
                'One-page summary</a>' +
            /* THE MONEY IS ABOVE THE FOLD. The owner's stated need is "a solid idea of capital
               required"; opening a prospect used to show its name at 19px and its capacity at
               11px mono, and no dollar figure anywhere before the fold. Three figures in the
               app's own idiom — quiet label over large tabular number — priced through the
               same stack the map uses, so the two views cannot disagree. */
            headFigures(rec) +
            '<div class="pd-facts">' +
                '<span>' + esc(String(rec.energy_type || rec.source || 'unknown').replace(/_/g, ' ')) + '</span>' +
                '<span>' + (days === null ? absent('not moved yet')
                                          : esc(String(days)) + ' days in stage') + '</span>' +
                '<span>' + (since === null ? absent('never contacted')
                                           : esc(String(since)) + ' days since contact') + '</span>' +
            '</div>' +
            '<label class="pd-stagepick">Stage<select id="pdStage">' +
                optionList(stages, function (s) { return s.key; }, function (s) { return s.label; }) +
            '</select></label>' +
            advanceControl(rec) +
        '</div>' +
        '<section class="pd-sec"><h3>Build</h3>' + projectBlock(rec) + '</section>' +
        gatesSection(rec) +
        budgetSection(rec) +
        procurementSection(rec) +
        contractorsSection(rec) +
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
