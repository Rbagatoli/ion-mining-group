/* Guided owner conversations. One site update retains the answers and promised action together. */
var OwnerConfirmationUi = (function () {
    'use strict';
    var O = typeof OwnerConfirmation !== 'undefined' ? OwnerConfirmation : require('./owner-confirmation');
    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    function label(list, id) { var found = list.find(function (x) { return x[0] === id; }); return found ? found[1] : id; }
    function input(name, title, type, value, attrs) { return '<label>' + esc(title) + '<input name="' + name + '" type="' + (type || 'text') + '" value="' + esc(value) + '" ' + (attrs || '') + '></label>'; }
    function area(name, title, required, max) { return '<label>' + esc(title) + '<textarea name="' + name + '" rows="3" maxlength="' + (max || 1600) + '"' + (required ? ' required' : '') + '></textarea></label>'; }
    function options(items) { return items.map(function (x) { return '<option value="' + esc(x[0]) + '">' + esc(x[1]) + '</option>'; }).join(''); }
    function select(name, title, items) { return '<label>' + esc(title) + '<select name="' + name + '">' + options(items) + '</select></label>'; }
    function energy(e) {
        if (!e) return '';
        var parts = [['offered_net_kw', ' kW net offered'], ['collected_mmscfd', ' mmscfd collected'], ['methane_pct', '% methane']].filter(function (x) { return e[x[0]] != null; }).map(function (x) { return esc(e[x[0]]) + x[1]; });
        return parts.length ? '<p class="oc-figures">Reported: ' + parts.join(' · ') + ' · Measurement date: ' + esc(e.measured_on || 'unknown') + '</p>' : '';
    }
    function answer(a) { return '<span class="oc-tag oc-' + esc(a.basis) + '">' + esc(label(O.BASIS, a.basis)) + '</span><p class="oc-note">' + esc(a.note) + '</p>' + energy(a.energy) +
        (a.reference ? '<p class="oc-muted">Source: ' + esc(a.reference) + '</p>' : '') + (O.safeUrl(a.source_url) ? '<a href="' + esc(a.source_url) + '" target="_blank" rel="noopener noreferrer">Open source</a>' : ''); }
    function findings(site) {
        var all = O.findings(site), count = Object.keys(all).length;
        return '<p class="oc-muted">' + count + ' of 6 topics have recorded answers. Use the source and date to judge each answer; coverage does not establish deal readiness.</p><div class="oc-findings">' + O.TOPICS.map(function (t) {
            var a = all[t[0]]; return '<article><h4>' + esc(t[1]) + '</h4>' + (a ? answer(a) + '<p class="oc-muted">' + esc(a.person) + ' · ' + esc(a.occurred_on) + '</p>' : '<p class="oc-muted">Still to ask</p>') + '</article>';
        }).join('') + '</div>';
    }
    function actionRows(site) {
        var list = O.actions(site), open = list.filter(function (a) { return a.status === 'open'; });
        function row(a) { return '<article class="oc-action oc-' + a.due_state + '"><span class="oc-tag">' + esc(label([['overdue', 'Overdue'], ['today', 'Due today'], ['upcoming', 'Upcoming'], ['done', 'Completed']], a.due_state)) + ' · ' + esc(a.due_on) + '</span><h4>' + esc(a.description) + '</h4><p>' + esc(a.owner) + (a.waiting_on ? ' · Waiting on ' + esc(a.waiting_on) : '') + '</p>' +
            (a.conversation_voided ? '<p class="oc-muted">The linked conversation was marked in error. Resolve this action explicitly if it no longer applies.</p>' : '') +
            (a.completion_note ? '<p class="oc-muted">Latest update: ' + esc(a.completion_note) + ' · ' + esc(a.completed_by) + '</p>' : '') +
            '<button type="button" data-oc-action="' + esc(a.id) + '" data-status="' + (a.status === 'open' ? 'done' : 'open') + '">' + (a.status === 'open' ? 'Complete action' : 'Reopen action') + '</button></article>'; }
        return (open.length ? open.map(row).join('') : '<p class="oc-muted">No open owner follow-ups. Log a conversation to record the next commitment.</p>') +
            '<details><summary>Completed actions (' + (list.length - open.length) + ')</summary>' + list.filter(function (a) { return a.status === 'done'; }).map(row).join('') + '</details>';
    }
    function history(site) {
        var s = O.state(site);
        return s.conversations.slice().reverse().map(function (c) { return '<details class="oc-history"><summary>' + esc(c.occurred_on) + ' · ' + esc(c.person) + ' · ' + esc(label(O.OUTCOMES, c.outcome)) + (c.voided ? ' · RECORDED IN ERROR' : '') + '</summary><p class="oc-note">' + esc(c.summary) + '</p><p class="oc-muted">' + esc(label(O.METHODS, c.method)) + ' · Recorded by ' + esc(c.recorded_by) + ' on ' + esc(c.recorded_at.slice(0, 10)) + '</p>' +
            (c.relationship_snapshot ? '<p class="oc-muted">Linked map contact at the time: ' + esc(c.relationship_snapshot.name) + ' · ' + esc(c.relationship_snapshot.organization) + '</p>' : '') +
            O.TOPICS.filter(function (t) { return c.answers[t[0]]; }).map(function (t) { return '<h4>' + esc(t[1]) + '</h4>' + answer(Object.assign({}, c.answers[t[0]], { energy: t[0] === 'energy' ? c.energy : null })); }).join('') +
            '<p>Documents requested: ' + esc(c.requested_documents.map(function (d) { return label(O.DOCS, d); }).join('; ') || 'None recorded') + '</p>' +
            (c.voided ? '<p>Correction: ' + esc(c.voided.reason) + ' · ' + esc(c.voided.by) + '</p>' : '<button type="button" data-oc-void="' + esc(c.id) + '">Mark entry recorded in error</button>') + '</details>'; }).join('') || '<p class="oc-muted">No owner conversations recorded yet.</p>';
    }
    function callForm(site) {
        var nodes = O.relationshipNodes(site);
        return '<details data-oc-editor open><summary>Record an owner conversation</summary><form data-oc-form="conversation"><div class="oc-fields">' + input('occurred_on', 'Conversation date', 'date', O.today(), 'required') + input('recorded_by', 'Recorded by', 'text', '', 'required maxlength="120"') + select('method', 'Contact method', O.METHODS) + select('direction', 'Who initiated this exchange?', O.DIRECTIONS) + select('outcome', 'Outcome', O.OUTCOMES) +
            select('relationship_id', 'Person / office from the relationship map', [['', 'Enter a separate person / office']].concat(nodes.map(function (n) { return [n.id, n.name + (n.organization ? ' · ' + n.organization : '')]; }))) + '<div class="oc-contact-refresh"><button type="button" data-oc-contacts>Refresh map contacts</button></div>' + input('person', 'Person / office contacted', 'text', '', 'required maxlength="160"') + input('organization', 'Organization', 'text', '', 'maxlength="180"') + '</div>' +
            area('summary', 'Conversation summary — what changed and what remains open?', true, 1500) +
            '<p class="oc-muted">Record only what was learned. Leave a topic at “No new answer” to retain its previous finding. Choose “Unresolved or conflicting” to flag a previous answer that is now in doubt.</p>' +
            O.TOPICS.map(function (t) { return '<details class="oc-topic"' + (t[0] === 'infrastructure' || t[0] === 'energy' ? ' open' : '') + '><summary>' + esc(t[1]) + '</summary><p class="oc-prompt">' + esc(t[2]) + '</p>' + select(t[0] + '_basis', 'Basis for this answer', O.BASIS) + area(t[0] + '_note', 'What they said / what the record establishes') +
                (t[0] === 'energy' ? '<div class="oc-fields">' + input('offered_net_kw', 'Reported net kW offered to Proton', 'number', '', 'min="0" max="1000000000" step="any"') + input('collected_mmscfd', 'Reported collected gas (mmscfd)', 'number', '', 'min="0" max="1000000" step="any"') + input('methane_pct', 'Reported methane (%)', 'number', '', 'min="0" max="100" step="any"') + input('measured_on', 'Measurement date, if known', 'date') + '</div><p class="oc-muted">Blank means unknown; zero means explicitly reported as zero. These reports require review in Capacity & capital before being used as a contracted allocation or equipment capacity.</p>' : '') +
                '<div class="oc-fields">' + input(t[0] + '_reference', 'Email / document reference, if available', 'text', '', 'maxlength="1000"') + input(t[0] + '_source_url', 'Source URL, if available', 'url', '', 'maxlength="2000"') + '</div></details>'; }).join('') +
            '<fieldset><legend>Documents requested in this exchange</legend><div class="oc-docs">' + O.DOCS.map(function (d) { return '<label><input type="checkbox" name="requested_documents" value="' + d[0] + '">' + esc(d[1]) + '</label>'; }).join('') + '</div></fieldset>' +
            '<h4>Agree the next step</h4>' + area('next_action', 'Specific next action / deliverable', true, 600) + '<div class="oc-fields">' + input('action_owner', 'Person responsible for this follow-up', 'text', '', 'required maxlength="120"') + input('due_on', 'Due date', 'date', '', 'required') + input('waiting_on', 'Waiting on, if applicable', 'text', '', 'maxlength="180"') + '</div>' +
            '<div class="oc-buttons"><button type="submit">Save conversation & next action</button><button type="button" data-oc-clear>Clear this draft</button></div></form></details>';
    }
    function render(site) {
        var s = O.state(site);
        if (s.error) return '<section class="pd-sec oc" id="ownerConfirmation"><h3>Owner confirmation</h3><p role="alert">' + esc(s.error) + '</p></section>';
        return '<section class="pd-sec oc" id="ownerConfirmation" data-prospect-id="' + esc(site.id) + '" data-revision="' + s.revision + '"><div class="oc-heading"><div><h3>Owner confirmation</h3><p>Turn the first call into evidence, a clear capital scope and a next step.</p></div><div class="oc-buttons"><button type="button" data-oc-export>Export worksheet</button><button type="button" data-oc-reload>Reload saved worksheet and clear drafts</button></div></div>' +
            '<p class="oc-muted">Owner reports remain dated and attributed. Review agreements and equipment records before treating rights, usable capacity or funding as secured.</p><p id="ownerConfirmationStatus" role="status" aria-live="polite"></p>' +
            '<h4>Promised next actions</h4><div data-oc-actions>' + actionRows(site) + '</div><form data-oc-form="update" hidden><h4 data-oc-update-title></h4><input type="hidden" name="type"><input type="hidden" name="id"><input type="hidden" name="status"><div class="oc-fields">' + input('recorded_by', 'Updated by', 'text', '', 'required maxlength="120"') + '</div>' + area('note', 'What was completed / reason for this change', true, 600) + '<div class="oc-buttons"><button type="submit">Save update</button><button type="button" data-oc-cancel>Cancel update</button></div></form>' +
            '<details><summary>Latest answers by topic</summary><div data-oc-findings>' + findings(site) + '</div></details>' + callForm(site) + '<details><summary>Conversation history</summary><div data-oc-history>' + history(site) + '</div></details></section>';
    }
    function values(form) { var v = { requested_documents: [], answers: {} }; form.querySelectorAll('[name]').forEach(function (el) { if (el.name === 'requested_documents') { if (el.checked) v.requested_documents.push(el.value); } else v[el.name] = el.value; }); O.TOPICS.forEach(function (t) { var k = t[0]; v.answers[k] = { basis: v[k + '_basis'], note: v[k + '_note'], reference: v[k + '_reference'], source_url: v[k + '_source_url'] }; }); return v; }
    function commit(id, command) {
        var site = typeof SiteData !== 'undefined' && SiteData.get(id); if (!site) return { ok: false, err: 'This prospect no longer exists.' };
        var result = O.apply(site, command); if (!result.ok) return result;
        var fields = Object.assign({}, site.custom_fields || {}); fields[O.KEY] = result.worksheet;
        var saved = SiteData.update(id, { custom_fields: fields });
        if (!saved || !saved._save || !saved._save.ok) return { ok: false, err: (saved && saved._save && saved._save.err || 'Could not save the worksheet.') + ' Your draft is preserved.' };
        if (O.state(saved).revision !== result.worksheet.revision) return { ok: false, err: 'The saved worksheet is missing. Copy these draft notes before reloading the updated app.' };
        return { ok: true, site: saved };
    }
    function bind(site, host) {
        var root = host.querySelector('#ownerConfirmation'); if (!root || O.state(site).error) return;
        var revision = O.state(site).revision, status = root.querySelector('#ownerConfirmationStatus'), call = root.querySelector('[data-oc-form="conversation"]'), update = root.querySelector('[data-oc-form="update"]'), initial = new Map();
        function reset(form) { form.reset(); if (form === call) ['person', 'organization'].forEach(function (k) { form.elements[k].readOnly = false; }); initial.set(form, JSON.stringify(values(form))); }
        [call, update].forEach(function (form) { initial.set(form, JSON.stringify(values(form))); });
        function dirty(form) { return JSON.stringify(values(form)) !== initial.get(form); }
        root._hasDraft = function () { return dirty(call) || dirty(update); };
        function refresh() { var current = SiteData.get(site.id), s = O.state(current); if (s.error) { status.textContent = s.error; return; } revision = s.revision; root.dataset.revision = revision;
            root.querySelector('[data-oc-actions]').innerHTML = actionRows(current); root.querySelector('[data-oc-findings]').innerHTML = findings(current); root.querySelector('[data-oc-history]').innerHTML = history(current); }
        function contacts() { var nodes = O.relationshipNodes(SiteData.get(site.id)), el = call.elements.relationship_id, old = el.value;
            el.innerHTML = options([['', 'Enter a separate person / office']].concat(nodes.map(function (n) { return [n.id, n.name + (n.organization ? ' · ' + n.organization : '')]; })).concat(old && !nodes.some(function (n) { return n.id === old; }) ? [[old, 'Selected relationship is no longer active']] : [])); el.value = old; }
        function changed() { document.dispatchEvent(new CustomEvent('prospect-owner:changed', { detail: { id: site.id } })); }
        root.addEventListener('submit', function (event) { if (event.target !== call && event.target !== update) return; event.preventDefault(); var form = event.target, v = values(form), result;
            try { result = commit(site.id, { revision: revision, type: form === call ? 'conversation' : v.type, id: v.id, value: v }); } catch (error) { result = { ok: false, err: 'Could not save: ' + error.message + '. Your draft is preserved.' }; }
            if (!result.ok) { status.textContent = result.err; status.scrollIntoView({ block: 'nearest' }); return; }
            reset(form); if (form === update) update.hidden = true; refresh(); status.textContent = form === call ? 'Saved the conversation, evidence and next action together. Follow-up is listed in Today.' : 'Saved the update with its author and reason.'; changed();
        });
        call.elements.relationship_id.addEventListener('focus', contacts);
        call.elements.relationship_id.addEventListener('change', function () { var n = O.relationshipNodes(SiteData.get(site.id)).find(function (n) { return n.id === call.elements.relationship_id.value; }); ['person', 'organization'].forEach(function (k) { call.elements[k].readOnly = !!n; if (n) call.elements[k].value = n[k === 'person' ? 'name' : k] || ''; }); });
        root.addEventListener('click', function (event) { var b = event.target.closest('button'); if (!b || !root.contains(b)) return;
            if (b.hasAttribute('data-oc-clear')) { reset(call); status.textContent = 'Conversation draft cleared.'; }
            if (b.hasAttribute('data-oc-cancel')) { reset(update); update.hidden = true; }
            if (b.hasAttribute('data-oc-reload')) { reset(call); reset(update); update.hidden = true; refresh(); contacts(); status.textContent = 'Loaded the latest saved worksheet. These drafts are cleared.'; }
            if (b.hasAttribute('data-oc-contacts')) { contacts(); status.textContent = 'Contact choices refreshed from the saved relationship map.'; }
            if (b.hasAttribute('data-oc-action') || b.hasAttribute('data-oc-void')) { if (dirty(update)) { status.textContent = 'Save or cancel the open update first.'; return; } reset(update); update.hidden = false; var isAction = b.hasAttribute('data-oc-action'); update.elements.type.value = isAction ? 'action' : 'void'; update.elements.id.value = b.getAttribute(isAction ? 'data-oc-action' : 'data-oc-void'); update.elements.status.value = b.dataset.status || ''; update.querySelector('[data-oc-update-title]').textContent = isAction ? (b.dataset.status === 'done' ? 'Complete promised action' : 'Reopen promised action') : 'Mark conversation recorded in error — its history and open actions remain'; update.elements.recorded_by.value = call.elements.recorded_by.value; update.scrollIntoView({ block: 'nearest' }); update.elements.recorded_by.focus(); }
            if (b.hasAttribute('data-oc-export')) { var current = SiteData.get(site.id), data = { site_id: site.id, site_name: current.name, exported_at: new Date().toISOString(), worksheet: O.state(current) }; var blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'owner-worksheet-' + String(site.id).replace(/[^a-z0-9_-]/gi, '_') + '.json'; a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); status.textContent = 'Exported the saved worksheet and action history.'; }
        });
    }
    function todayMarkup(actions) {
        if (!actions || !actions.length) return '';
        return '<section class="pt-sec oc-today"><header class="pt-sechead"><h2>Owner follow-ups</h2><span class="pt-count">' + actions.length + '</span></header><p class="p-note">Commitments recorded with owner conversations. Open a prospect to complete or update its action.</p><ul class="pt-list">' + actions.map(function (a) {
            return '<li class="pt-row" data-id="' + esc(a.prospect_id) + '"><span class="pt-late">' + esc(a.due_state === 'overdue' ? 'Overdue' : a.due_state === 'today' ? 'Due today' : a.due_on) + '</span><span class="pt-name">' + esc(a.site_name) + '</span><span class="pt-what">' + esc(a.description) + (a.conversation_voided ? ' · Linked entry marked in error' : '') + '</span><span class="pt-stage">' + esc(a.owner) + ' · ' + esc(a.due_on) + (a.waiting_on ? ' · Waiting on ' + esc(a.waiting_on) : '') + '</span><button type="button">Open worksheet</button></li>';
        }).join('') + '</ul></section>';
    }
    return { render: render, bind: bind, commit: commit, todayMarkup: todayMarkup };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = OwnerConfirmationUi;
