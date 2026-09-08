/* Task-oriented presentation over the existing CRM stores. No stage or evidence migration. */
var ProspectWorkspace = (function () {
    'use strict';
    var PHASES = [
        { key: 'review', label: 'Review site', stages: ['unreviewed', 'researching'], why: 'Decide whether the location, energy source and existing equipment justify an owner conversation.', next: 'Find the owner and review the site', panel: 'contacts' },
        { key: 'contact', label: 'Contact owner', stages: ['contacted'], why: 'Reach the person responsible for energy rights and confirm interest in a deal.', next: 'Follow up with the energy decision maker', panel: 'contacts' },
        { key: 'terms', label: 'Agree terms', stages: ['in_discussion', 'term_sheet'], why: 'Establish what energy is available, the owner’s priorities and proposed price and access terms.', next: 'Record the owner’s terms and next commitment', panel: 'activity' },
        { key: 'verify', label: 'Verify site & costs', stages: ['diligence'], why: 'Verify usable equipment, net power, permits and the work Proton still needs to fund.', next: 'Review infrastructure and remaining capital', panel: 'capital' },
        { key: 'sign', label: 'Sign agreement', stages: ['agreement'], why: 'Resolve remaining approvals and record the executed energy and site-access agreements.', next: 'Review agreements and approvals', panel: 'research' }
    ];
    var LABELS = { unreviewed: 'New site', researching: 'Reviewing site', contacted: 'Contact made', in_discussion: 'Discussing terms', term_sheet: 'Terms proposed', diligence: 'Checking site & costs', agreement: 'Agreement in review', closed_won: 'Signed', dead: 'Not proceeding' };
    var NOTES = { unreviewed: 'Saved for initial review.', researching: 'Research is underway; owner interest has not been established.', contacted: 'An initial call, email or introduction has actually been made.', in_discussion: 'The owner has engaged in a substantive discussion.', term_sheet: 'Specific commercial terms have been proposed.', diligence: 'Technical, cost and rights checks are underway.', agreement: 'An agreement is being reviewed for approval and signature.', closed_won: 'The required agreement has been executed. Record its document reference.', dead: 'Work on this opportunity has stopped. Record the reason.' };
    var detailTabs = [['overview', 'Overview'], ['contacts', 'People & contacts'], ['capital', 'Energy & capital'], ['activity', 'Calls & follow-ups'], ['research', 'Research & documents'], ['build', 'Project setup']];
    var selectedPanels = Object.create(null), boardFilter = 'active', boardQuery = '', workFilter = 'now';
    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    function closed(s) { return s === 'closed_won' || s === 'dead'; }
    function phase(s) { return PHASES.find(function (p) { return p.stages.indexOf(s) >= 0; }) || null; }
    function stageLabel(s) {
        // Preserve names of genuinely customized stages, including renamed built-in keys.
        var configured = typeof CrmConfig !== 'undefined' ? CrmConfig.stages().find(function (x) { return x.key === s; }) : null;
        var defaults = { unreviewed: 'Unreviewed', researching: 'Researching', contacted: 'Contacted', in_discussion: 'In discussion', term_sheet: 'Term sheet', diligence: 'Diligence', agreement: 'Agreement', closed_won: 'Closed won', dead: 'Dead' };
        return configured && configured.label !== defaults[s] ? configured.label : LABELS[s] || (configured && configured.label) || String(s || 'Stage needs review').replace(/_/g, ' ');
    }
    function href(id, panel, focus) { return '#p/' + encodeURIComponent(id) + '?tab=' + (panel || 'overview') + (focus ? '&focus=' + encodeURIComponent(focus) : ''); }
    function today(now) { return typeof CrmFollowups !== 'undefined' ? CrmFollowups.today(now) : new Date(now == null ? Date.now() : now).toISOString().slice(0, 10); }
    function dueLabel(date, now) { if (!date) return 'Next step'; var on = today(now); return date < on ? 'Overdue · ' + date : date === on ? 'Due today' : 'Due ' + date; }
    function nextFor(rec, now) {
        var f = typeof CrmFollowups !== 'undefined' ? CrmFollowups.nextFor(rec.id) : null;
        if (typeof OwnerConfirmation !== 'undefined') f = OwnerConfirmation.nextAction(rec, f, now);
        if (typeof ProspectSourcing !== 'undefined') {
            var q = ProspectSourcing.queue([rec], {}, now).rows.filter(function (x) { return x.action_open; }).sort(function (a, b) { return a.action.due_on.localeCompare(b.action.due_on); })[0];
            if (q && (!f || q.action.due_on < f.due_date)) f = { description: q.action.description, due_date: q.action.due_on, sourcing: true };
        }
        if (f) return { text: f.description, due: f.due_date, panel: f.sourcing ? 'research' : 'activity', focus: f.sourcing ? 'prospectSourcing' : f.owner_confirmation_id ? 'ownerConfirmation' : 'pwFollowups' };
        var p = phase(rec.stage);
        return { text: p ? p.next : closed(rec.stage) ? 'Review the recorded outcome' : 'Review this site’s stage and next step', panel: p ? p.panel : 'overview' };
    }
    function tasks(sites, data, pending, now) {
        var rows = [], errors = [], seen = Object.create(null), indexed = Object.create(null), on = today(now);
        sites.forEach(function (s) { indexed[s.id] = s; });
        function add(kind, key, id, text, date, panel, focus, owner) {
            var site = indexed[id]; if (!site || closed(site.stage) || seen[kind + ':' + key]) return;
            seen[kind + ':' + key] = true;
            rows.push({ key: kind + ':' + key, kind: kind, id: id, name: site.name || id, text: text, date: date || '', panel: panel, focus: focus, owner: owner || '', priority: date ? date < on ? 0 : date === on ? 1 : 3 : 2 });
        }
        (pending || []).forEach(function (f) { add('followup', f.id, f.prospect_id, f.description, f.due_date, 'activity', 'pwFollowups'); });
        (data.ownerActions || []).forEach(function (a) { add('owner', a.id + a.prospect_id, a.prospect_id, a.description + (a.conversation_voided ? ' (conversation needs review)' : ''), a.due_on, 'activity', 'ownerConfirmation', a.owner); });
        if (data.sourcing) {
            data.sourcing.rows.filter(function (r) { return r.action_open; }).forEach(function (r) { add('sourcing', r.id + r.prospect_id, r.prospect_id, r.action.description, r.action.due_on, 'research', 'prospectSourcing', r.action.owner); });
            errors = errors.concat(data.sourcing.errors || []);
        }
        if (data.evidence) {
            data.evidence.documents.filter(function (d) { return d.pending; }).forEach(function (d) { add('document', d.document.id + d.site_id, d.site_id, 'Review document: ' + d.document.title, '', 'evidence'); });
            data.evidence.watches.filter(function (w) { return w.watch.status === 'active'; }).forEach(function (w) { add('source', w.watch.id + w.site_id, w.site_id, (w.failed ? 'Retry source check: ' : 'Check for updates: ') + w.watch.title, w.failed ? on : w.watch.next_on, 'evidence', '', w.watch.owner); });
            errors = errors.concat(data.evidence.errors || []);
        }
        sites.filter(function (s) { return !closed(s.stage); }).forEach(function (s) {
            if (typeof OwnerConfirmation !== 'undefined') { var state = OwnerConfirmation.state(s); if (state.error) errors.push({ name: s.name, error: state.error }); }
            if (rows.some(function (r) { return r.id === s.id; })) return;
            var n = nextFor(s, now);
            add('next', s.id, s.id, n.text, '', n.panel, n.focus);
        });
        rows.sort(function (a, b) { return a.priority - b.priority || a.date.localeCompare(b.date) || a.name.localeCompare(b.name) || a.key.localeCompare(b.key); });
        return { rows: rows, errors: errors };
    }
    function starter() {
        return '<div class="pw-start"><div><span class="pw-eyebrow">Start here</span><h2>Find your first energy site</h2><p>Save a promising site, reach the owner, then verify the energy and costs before agreeing a deal.</p><a class="pw-primary" href="./map.html?mode=prospects">Find sites →</a></div><ol><li><strong>Find a site</strong><span>Compare locations and save one to your pipeline.</span></li><li><strong>Start a conversation</strong><span>Identify the energy decision maker and agree a next step.</span></li><li><strong>Build the deal</strong><span>Confirm usable equipment, remaining capital and terms.</span></li></ol></div>';
    }
    function renderToday(host, sites, data, now) {
        var q = tasks(sites, data, typeof CrmFollowups !== 'undefined' ? CrmFollowups.pending() : [], now);
        if (!sites.length) { host.innerHTML = starter(); return q; }
        function draw() {
            var current = q.rows.filter(function (r) { return r.priority < 3; }), future = q.rows.filter(function (r) { return r.priority === 3; });
            var rows = workFilter === 'upcoming' ? future : current;
            host.innerHTML = '<div class="pw-pagehead"><div><h2>My work</h2><p>Open a task to work on the right part of its site. Overdue commitments come first.</p></div><a class="pw-primary" href="./map.html?mode=prospects">Find sites</a></div>' +
                (q.errors.length ? '<div role="alert" class="pw-notice">Some saved work could not be read. <a href="#evidence">Review research records</a><details><summary>Show affected records</summary>' + q.errors.map(function (e) { return '<p>' + esc(e.name || e.site_name || e.id) + ': ' + esc(e.error) + '</p>'; }).join('') + '</details></div>' : '') +
                '<div class="pw-toolbar" aria-label="Task filters"><button type="button" data-work="now" aria-pressed="' + (workFilter === 'now') + '">To do now <b>' + current.length + '</b></button><button type="button" data-work="upcoming" aria-pressed="' + (workFilter === 'upcoming') + '">Upcoming <b>' + future.length + '</b></button><a href="#board">View pipeline →</a></div>' +
                (rows.length ? '<ul class="pw-worklist">' + rows.map(function (r) { var link = r.panel === 'evidence' ? '#evidence?site=' + encodeURIComponent(r.id) : href(r.id, r.panel, r.focus); return '<li><span class="pw-due' + (r.priority === 0 ? ' is-late' : '') + '">' + esc(dueLabel(r.date, now)) + '</span><div><a class="pw-task" href="' + esc(link) + '">' + esc(r.text) + '</a><p>' + esc(r.name) + (r.owner ? ' · Assigned to ' + esc(r.owner) : '') + '</p></div><a class="pw-open" aria-label="Open task for ' + esc(r.name) + '" href="' + esc(link) + '">Open →</a></li>'; }).join('') + '</ul>' : '<div class="pw-empty"><h3>' + (workFilter === 'upcoming' ? 'No future tasks scheduled' : 'You’re up to date') + '</h3><p>' + (workFilter === 'upcoming' ? 'Record a follow-up date after each conversation to keep the deal moving.' : 'Review the pipeline or find another promising site.') + '</p><a href="#board">Open pipeline →</a></div>');
            host.querySelectorAll('[data-work]').forEach(function (b) { b.addEventListener('click', function () { workFilter = b.dataset.work; draw(); host.querySelector('[data-work="' + workFilter + '"]').focus(); }); });
        }
        draw(); return q;
    }
    function renderBoard(host, sites, now) {
        function matches(s, filter) { return filter === 'active' ? !closed(s.stage) : filter === 'other' ? !phase(s.stage) && !closed(s.stage) : ['closed_won', 'dead'].indexOf(filter) >= 0 ? s.stage === filter : phase(s.stage) && phase(s.stage).key === filter; }
        function draw(focus) {
            var groups = [{ key: 'active', label: 'All active' }].concat(PHASES);
            if (sites.some(function (s) { return matches(s, 'other'); })) groups.push({ key: 'other', label: 'Other stages' });
            var rows = sites.filter(function (s) { return matches(s, boardFilter) && [s.name, s.operator, s.jurisdiction, stageLabel(s.stage)].join(' ').toLowerCase().includes(boardQuery.toLowerCase()); });
            rows.sort(function (a, b) { var x = nextFor(a, now), y = nextFor(b, now); return (x.due || '9999').localeCompare(y.due || '9999') || (a.name || a.id).localeCompare(b.name || b.id); });
            var p = PHASES.find(function (x) { return x.key === boardFilter; });
            host.innerHTML = '<div class="pw-pagehead"><div><h2>Pipeline</h2><p>Only sites you have saved appear here. Each step describes the work needed to reach an agreement.</p></div><a class="pw-primary" href="./map.html?mode=prospects">Find sites</a></div>' +
                '<div class="pw-phases" aria-label="Filter pipeline by step">' + groups.map(function (g, i) { return '<button type="button" data-phase="' + g.key + '" aria-pressed="' + (boardFilter === g.key) + '"><span>' + (i > 0 && i < 6 ? i + '. ' : '') + esc(g.label) + '</span><b>' + sites.filter(function (s) { return matches(s, g.key); }).length + '</b></button>'; }).join('') + '</div>' +
                '<div class="pw-toolbar"><label class="pw-search">Search pipeline<input type="search" id="pwPipelineSearch" value="' + esc(boardQuery) + '" placeholder="Site, owner or region"></label><label>Show<select id="pwPipelineStatus"><option value="active">Active opportunities</option><option value="closed_won">Signed agreements (' + sites.filter(function (s) { return s.stage === 'closed_won'; }).length + ')</option><option value="dead">Not proceeding (' + sites.filter(function (s) { return s.stage === 'dead'; }).length + ')</option></select></label></div>' +
                (p ? '<div class="pw-phasehint"><strong>' + esc(p.label) + '</strong><p>' + esc(p.why) + '</p></div>' : '') +
                '<p class="pw-count" role="status">' + rows.length + ' ' + (rows.length === 1 ? 'site' : 'sites') + (boardFilter === 'active' ? ' in progress' : '') + ' · ordered by next follow-up, then site name</p>' +
                (!sites.length ? starter() : rows.length ? '<div class="pw-sites">' + rows.map(function (s) { var n = nextFor(s, now); return '<article class="pw-site"><div><a class="pw-site-name" href="' + esc(href(s.id)) + '">' + esc(s.name || s.id) + '</a><p>' + esc([s.operator, s.jurisdiction].filter(Boolean).join(' · ') || 'Open the site to review location and ownership') + '</p><span class="pw-stage">' + esc(stageLabel(s.stage)) + '</span></div><div class="pw-site-next"><span>' + (closed(s.stage) ? 'Outcome' : 'Next step') + '</span><a href="' + esc(href(s.id, n.panel, n.focus)) + '">' + esc(n.text) + '</a>' + (n.due ? '<small class="' + (n.due < today(now) ? 'is-late' : '') + '">' + esc(dueLabel(n.due, now)) + '</small>' : '') + '</div><a class="pw-open" href="' + esc(href(s.id)) + '" aria-label="Open ' + esc(s.name || s.id) + '">Open site →</a></article>'; }).join('') + '</div>' : '<div class="pw-empty"><h3>' + (boardQuery ? 'No matching sites' : 'No sites in this step') + '</h3><p>' + (boardQuery ? 'Try a shorter name or clear the search.' : 'Open a saved site and update its stage when the work is complete.') + '</p><button type="button" data-clear-pipeline>Show all active sites</button></div>');
            var search = host.querySelector('#pwPipelineSearch'), status = host.querySelector('#pwPipelineStatus');
            status.value = closed(boardFilter) ? boardFilter : 'active';
            search.addEventListener('input', function () { var cursor = this.selectionStart; boardQuery = this.value; draw(); var next = host.querySelector('#pwPipelineSearch'); next.focus(); if (cursor != null) next.setSelectionRange(cursor, cursor); });
            status.addEventListener('change', function () { boardFilter = this.value; draw('pwPipelineStatus'); });
            host.querySelectorAll('[data-phase]').forEach(function (b) { b.addEventListener('click', function () { boardFilter = b.dataset.phase; draw(); host.querySelector('[data-phase="' + boardFilter + '"]').focus(); }); });
            var clear = host.querySelector('[data-clear-pipeline]'); if (clear) clear.onclick = function () { boardFilter = 'active'; boardQuery = ''; draw('pwPipelineSearch'); };
            if (focus) host.querySelector('#' + focus).focus();
        }
        draw();
    }
    function stageEditor(rec) {
        var stages = typeof CrmConfig !== 'undefined' ? CrmConfig.stages() : [];
        var reasons = typeof CrmConfig !== 'undefined' ? CrmConfig.deadReasons() : [];
        return '<details class="pw-stage-editor"><summary>Update stage</summary><form id="pwStageForm"><label>Stage<select name="stage">' + stages.map(function (s) { return '<option value="' + esc(s.key) + '"' + (rec.stage === s.key ? ' selected' : '') + '>' + esc(stageLabel(s.key)) + '</option>'; }).join('') + '</select></label><p data-stage-help></p><label data-stage-reason hidden>Reason for stopping<select name="reason"><option value="">Choose a reason</option>' + reasons.map(function (r) { return '<option value="' + esc(r.key) + '">' + esc(r.label) + '</option>'; }).join('') + '</select></label><label>Note or document reference <span>(optional)</span><textarea name="note" rows="2"></textarea></label><div class="pw-actions"><button class="pw-primary" type="submit">Save stage</button><button type="button" data-cancel-stage>Cancel</button></div><p role="status" data-stage-status></p></form></details>';
    }
    function overview(rec, candidate) {
        var p = phase(rec.stage), n = nextFor(rec), profile = null;
        if (typeof ProspectDiligence !== 'undefined') profile = ProspectDiligence.profile(candidate || { id: rec.id, energyType: rec.energy_type, sourceDetail: {} }, rec, {});
        function kw(v) { return v == null ? 'Not confirmed' : Math.round(v).toLocaleString('en-US') + ' kW'; }
        function usd(v) { return v == null ? 'Not priced' : '$' + Math.round(v).toLocaleString('en-US'); }
        var cap = profile ? profile.capacity : {}, b = profile ? profile.budget : {};
        return '<section class="pw-next"><span class="pw-eyebrow">' + esc(closed(rec.stage) ? 'Recorded outcome' : 'Next step') + '</span><h3>' + esc(n.text) + '</h3><p>' + esc(p ? p.why : 'Keep the agreement, decision and supporting records with this site.') + '</p><div class="pw-actions"><button type="button" class="pw-primary" data-open-panel="' + esc(n.panel) + '"' + (n.focus ? ' data-focus="' + esc(n.focus) + '"' : '') + '>Open ' + esc(detailTabs.find(function (t) { return t[0] === n.panel; })[1].toLowerCase()) + ' →</button>' + (n.due ? '<span>' + esc(dueLabel(n.due)) + '</span>' : '') + '</div></section>' +
            '<div class="pw-keyfacts"><div><span>Power allocated to Proton</span><strong>' + kw(cap.contractedKw) + '</strong><small>Documented net power available for this deal</small></div><div><span>' + (b.complete ? 'Remaining Proton budget' : 'Priced work subtotal') + '</span><strong>' + usd(b.base) + '</strong><small>' + (b.complete ? 'Recorded costs and allowances; USD' : 'Budget incomplete · ' + (b.missing || []).length + ' components need review') + '</small></div><div><span>Existing electrical equipment</span><strong>' + kw(cap.installedReportedKw) + '</strong><small>Reported capacity; condition and access still need checking</small></div></div>' +
            '<section class="pw-overview-links"><h3>Work on this deal</h3><div>' + [['contacts', 'Reach the right people', 'Owner contacts, authority and introductions.'], ['capital', 'Check energy & capital', 'Existing assets, power allocation and work still to fund.'], ['activity', 'Record a conversation', 'Call notes, owner answers and dated follow-ups.'], ['research', 'Review the supporting records', 'Agreements, source documents and research.']].map(function (x) { return '<button type="button" data-open-panel="' + x[0] + '"><strong>' + x[1] + ' →</strong><span>' + x[2] + '</span></button>'; }).join('') + '</div></section>';
    }
    function enhanceDetail(rec, host, candidate) {
        if (!host || host.dataset.workSite) return;
        host.dataset.workSite = rec.id;
        var nodes = Array.from(host.children), head = host.querySelector('.pd-head');
        var figs = head && head.querySelector('.pd-figs'); if (figs) figs.remove(); // The sourced estimate is not an owner-confirmed budget.
        if (head) {
            var oldPicker = head.querySelector('.pd-stagepick'), advance = head.querySelector('#pdAdvance');
            if (oldPicker) oldPicker.remove(); if (advance) advance.remove();
            head.insertAdjacentHTML('beforeend', '<div class="pw-stagebar"><span class="pw-stage">' + esc(stageLabel(rec.stage)) + '</span>' + stageEditor(rec) + '</div>');
        }
        var nav = document.createElement('div'); nav.className = 'pw-detail-tabs'; nav.setAttribute('role', 'tablist'); nav.setAttribute('aria-label', 'Site workspace');
        var panels = {};
        detailTabs.forEach(function (t) {
            nav.insertAdjacentHTML('beforeend', '<button type="button" role="tab" id="pwTab_' + t[0] + '" aria-controls="pwPanel_' + t[0] + '" data-panel="' + t[0] + '">' + t[1] + '</button>');
            var panel = document.createElement('div'); panel.id = 'pwPanel_' + t[0]; panel.className = 'pw-detail-panel'; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', 'pwTab_' + t[0]); panel.tabIndex = 0; panels[t[0]] = panel;
        });
        if (head) head.after(nav); else host.prepend(nav);
        detailTabs.forEach(function (t) { host.appendChild(panels[t[0]]); });
        panels.overview.innerHTML = overview(rec, candidate);
        nodes.forEach(function (node) {
            if (node === head) return;
            var heading = node.querySelector('h3'), title = heading ? heading.textContent : '', dest = 'research';
            if (node.id === 'ownerConfirmation') { dest = 'activity'; node.querySelectorAll('details[open]').forEach(function (d) { d.open = false; }); }
            else if (node.id === 'dealRelationships' || ['Counterparty', 'Contacts'].indexOf(title) >= 0) dest = 'contacts';
            else if (['Outstanding', 'Log an interaction', 'History'].indexOf(title) >= 0) dest = 'activity';
            else if (['Build', 'Budget', 'Procurement', 'Contractors'].indexOf(title) >= 0 || title.indexOf('Gate:') === 0 || title.indexOf('Contractor') === 0) dest = 'build';
            if (title === 'Counterparty') heading.textContent = 'Who to contact';
            if (title === 'Contacts') heading.textContent = 'Saved contacts';
            if (title === 'Outstanding') { heading.textContent = 'Scheduled follow-ups'; node.id = 'pwFollowups'; }
            if (title === 'Log an interaction') { heading.textContent = 'Quick call or email note'; node.id = 'pwQuickLog'; }
            if (title === 'Build') heading.textContent = 'Set up a construction project';
            if (title === 'History') { heading.textContent = 'Activity history'; var details = document.createElement('details'); details.className = 'pw-disclosure'; details.innerHTML = '<summary>Activity history & notes</summary>'; details.appendChild(node); panels[dest].appendChild(details); }
            else panels[dest].appendChild(node);
        });
        // Published contacts come before the relationship worksheet.
        var counterparty = Array.from(panels.contacts.children).find(function (n) { var h = n.querySelector('h3'); return h && h.textContent === 'Who to contact'; });
        if (counterparty) panels.contacts.prepend(counterparty);
        panels.contacts.insertAdjacentHTML('afterbegin', '<div class="pw-panel-intro"><a class="pw-primary" href="./contacts.html?for=' + esc(encodeURIComponent(rec.id)) + '&amp;new=1">Add a contact for this site</a> <a href="./contacts.html?for=' + esc(encodeURIComponent(rec.id)) + '">Find an existing contact →</a></div>');
        panels.activity.insertAdjacentHTML('afterbegin', '<p class="pw-panel-intro">Use a quick note for a call or email. Use the owner conversation worksheet when you learn about energy, equipment or terms.</p>');
        panels.build.insertAdjacentHTML('afterbegin', '<p class="pw-panel-intro">Use this after the deal is approved for development. Project budgets, procurement and construction approvals are managed here.</p>');
        panels.research.insertAdjacentHTML('afterbegin', '<div class="pw-panel-intro"><a href="#evidence?site=' + esc(encodeURIComponent(rec.id)) + '">Open this site’s document review inbox →</a></div>');
        var ctx = { saved: rec, findSaved: function (id) { return SiteData.get(id); }, onSave: function () {
            ctx.saved = SiteData.get(rec.id); rec = ctx.saved;
            if (panels.capital._diligenceHasDraft && panels.capital._diligenceHasDraft()) { panels.capital._diligenceStatus.textContent = 'Saved. Finish the other energy or capital draft before refreshing.'; return; }
            panels.capital.innerHTML = '<div id="dtab_capacity">' + ProspectDiligenceUi.renderBuckets(c, ctx).capacity + '</div>';
            ProspectDiligenceUi.bind(panels.capital, c, ctx);
            panels.overview.innerHTML = overview(rec, candidate);
            panels.overview.querySelectorAll('[data-open-panel]').forEach(function (b) { b.onclick = function () { select(b.dataset.openPanel, b.dataset.focus, true); }; });
        } };
        if (candidate && typeof SiteCapacity !== 'undefined' && SiteCapacity.usableCapacity) ctx.screened = SiteCapacity.usableCapacity(candidate);
        if (typeof ProspectDiligenceUi !== 'undefined') {
            var c = candidate || { id: rec.id, name: rec.name, energyType: rec.energy_type, sourceDetail: {} };
            var buckets = ProspectDiligenceUi.renderBuckets(c, ctx);
            panels.capital.innerHTML = '<div id="dtab_capacity">' + buckets.capacity + '</div>';
            ProspectDiligenceUi.bind(panels.capital, c, ctx);
        } else panels.capital.innerHTML = '<p>Energy records could not be loaded. Reload this page to try again.</p>';
        var query = new URLSearchParams((location.hash.split('?')[1] || '')), chosen = query.get('tab') || selectedPanels[rec.id] || 'overview';
        if (!panels[chosen]) chosen = 'overview';
        function select(key, focusId, moveFocus) {
            if (!panels[key]) return;
            selectedPanels[rec.id] = key;
            history.replaceState(null, '', href(rec.id, key));
            detailTabs.forEach(function (t) { var on = t[0] === key, button = nav.querySelector('[data-panel="' + t[0] + '"]'); panels[t[0]].hidden = !on; button.setAttribute('aria-selected', String(on)); button.tabIndex = on ? 0 : -1; });
            if (focusId) {
                var target = document.getElementById(focusId);
                if (target && panels[key].contains(target)) { for (var n = target; n && n !== panels[key]; n = n.parentElement) if (n.tagName === 'DETAILS') n.open = true; target.tabIndex = -1; if (moveFocus) target.focus(); }
            } else if (moveFocus) panels[key].focus();
        }
        nav.querySelectorAll('[data-panel]').forEach(function (b, i, all) {
            b.onclick = function () { select(b.dataset.panel); };
            b.onkeydown = function (e) { var to = e.key === 'ArrowRight' ? (i + 1) % all.length : e.key === 'ArrowLeft' ? (i + all.length - 1) % all.length : e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : -1; if (to >= 0) { e.preventDefault(); select(all[to].dataset.panel); all[to].focus(); } };
        });
        host.querySelectorAll('[data-open-panel]').forEach(function (b) { b.onclick = function () { select(b.dataset.openPanel, b.dataset.focus, true); }; });
        select(chosen, query.get('focus'), false);
        var form = host.querySelector('#pwStageForm');
        function help() { var to = form.elements.stage.value; form.querySelector('[data-stage-help]').textContent = NOTES[to] || 'Use your team’s definition for this stage.'; form.querySelector('[data-stage-reason]').hidden = to !== 'dead'; form.elements.reason.required = to === 'dead'; form.elements.note.required = to === 'closed_won'; var label = form.elements.note.parentElement; label.firstChild.textContent = to === 'closed_won' ? 'Signed agreement / document reference ' : 'Note or document reference '; label.querySelector('span').textContent = to === 'closed_won' ? '(required)' : '(optional)'; }
        if (form) {
            help(); form.elements.stage.onchange = help;
            form.querySelector('[data-cancel-stage]').onclick = function () { form.reset(); help(); form.closest('details').open = false; };
            form.onsubmit = function (event) { event.preventDefault(); if (form.elements.stage.value === 'closed_won' && !form.elements.note.value.trim()) { form.querySelector('[data-stage-status]').textContent = 'Add the signed agreement reference before marking this site signed.'; return; } var currentSite = SiteData.get(rec.id); if (!currentSite || currentSite.stage !== rec.stage) { form.querySelector('[data-stage-status]').textContent = 'The stage changed in another view. Reload this site before updating it.'; return; } var result = SiteData.setStage(rec.id, form.elements.stage.value, { note: form.elements.note.value.trim(), deadReason: form.elements.reason.value || undefined }); var status = form.querySelector('[data-stage-status]'); if (!result || result.ok === false || result._save && !result._save.ok) { status.textContent = result && (result.err || result._save && result._save.err) || 'Stage could not be saved. Try again.'; return; } rec = SiteData.get(rec.id); head.querySelector('.pw-stagebar > .pw-stage').textContent = stageLabel(rec.stage); panels.overview.innerHTML = overview(rec, candidate); panels.overview.querySelectorAll('[data-open-panel]').forEach(function (b) { b.onclick = function () { select(b.dataset.openPanel, b.dataset.focus, true); }; }); form.reset(); form.elements.stage.value = rec.stage; help(); status.textContent = 'Stage saved: ' + stageLabel(rec.stage) + '.'; };
        }
        host._workSelect = select;
        function signature() { return JSON.stringify(Array.from(host.querySelectorAll('input,select,textarea')).filter(function (e) { return !e.closest('[data-dg-form]'); }).map(function (e) { return e.type === 'checkbox' || e.type === 'radio' ? e.checked : e.value; })); }
        var initialSignature = signature(); host._workHasDraft = function () { return signature() !== initialSignature; };
        var refreshStatus = document.createElement('p'); refreshStatus.className = 'pw-refresh-status'; refreshStatus.setAttribute('role', 'status'); head.appendChild(refreshStatus); host._workRefreshStatus = refreshStatus;
    }
    function initFindSites() {
        var search = document.getElementById('fSearch'), sort = document.getElementById('fSort'), refine = document.querySelector('.src-morerow');
        if (!search || !sort || !refine) return;
        var toolbar = document.createElement('div'); toolbar.className = 'pw-find-toolbar'; toolbar.appendChild(search.closest('.src-field')); toolbar.appendChild(sort.closest('.src-field')); refine.before(toolbar);
        search.placeholder = 'Search site, owner, county or state';
        var intro = document.createElement('p'); intro.className = 'pw-find-intro'; intro.textContent = 'Find a promising energy site, review its details, then save it to your pipeline to start working the deal.';
        document.querySelector('.src-filterbar').prepend(intro);
    }
    if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initFindSites); else initFindSites(); }
    return { PHASES: PHASES, stageLabel: stageLabel, phase: phase, closed: closed, nextFor: nextFor, tasks: tasks, href: href, starter: starter, renderToday: renderToday, renderBoard: renderBoard, enhanceDetail: enhanceDetail };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ProspectWorkspace;
