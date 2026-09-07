/* Editable relationship map and isolated, lazy public-research preview. */
var DealRelationshipsUi = (function () {
    'use strict';
    var R = typeof DealRelationships !== 'undefined' ? DealRelationships : require('./deal-relationships');
    var esc = function (v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); };
    function label(list, key) { var found = list.find(function (r) { return r[0] === key; }); return found ? found[1] : key; }
    function link(url, caption) { return R.safeUrl(url) ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(caption) + '</a>' : ''; }
    function phoneLink(phone) {
        var l = typeof LandfillContacts !== 'undefined' ? LandfillContacts : (typeof module !== 'undefined' && module.exports ? require('./landfill-contacts') : null);
        var href = l && l.phoneHref(phone); return href ? '<a href="' + esc(href) + '">' + esc(phone) + '</a>' : esc(phone);
    }
    function select(name, title, options) { return '<label>' + esc(title) + '<select name="' + name + '">' + options.map(function (o) { return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>'; }).join('') + '</select></label>'; }
    function input(name, title, type, value) { return '<label>' + esc(title) + '<input name="' + name + '" type="' + (type || 'text') + '" value="' + esc(value || '') + '"' + (name === 'name' ? ' required' : '') + '></label>'; }
    function area(name, title) { return '<label>' + esc(title) + '<textarea name="' + name + '" rows="3"></textarea></label>'; }
    function provenanceFields() { return '<div class="rm-fields">' + select('status', 'Relationship evidence', R.STATUSES) +
        input('checked_on', 'Date checked', 'date', R.today()) + input('source_url', 'Source URL', 'url') + input('additional_source_url', 'Additional source URL', 'url') +
        input('source_date', 'Source date, if known', 'date') + input('verified_by', 'Checked by') + '</div>' + area('evidence_note', 'What the source or conversation establishes / document reference'); }
    function card(n, editable) {
        var ways = [n.phone ? phoneLink(n.phone) : '', /^[^\s<>"?&=#:]+@[^\s<>"?&=#:]+\.[^\s<>"?&=#:]+$/.test(n.email || '') ? '<a href="mailto:' + esc(n.email) + '">' + esc(n.email) + '</a>' : ''].filter(Boolean);
        return '<article class="rm-card" data-rm-node="' + esc(n.id) + '"><div class="rm-card-top"><span class="rm-kind">' + esc(n.kind) + '</span><span class="rm-tag rm-' + esc(n.status) + '">' + esc(label(R.STATUSES, n.status)) + '</span></div>' +
            '<h4>' + esc(n.name) + '</h4><p class="rm-muted">' + esc([n.title, n.organization].filter(Boolean).join(' · ')) + '</p>' +
            '<p class="rm-roles">' + (n.roles || []).map(function (r) { return esc(label(R.ROLES, r)); }).join(' · ') + '</p>' +
            '<p class="rm-authority">' + esc(label(R.AUTHORITIES, n.authority_status)) + (n.authority_scope ? ': ' + esc(n.authority_scope) : '') + '</p>' +
            (ways.length ? '<div class="rm-ways">' + ways.join('') + '</div>' : '<p class="rm-muted">Direct business contact not recorded.</p>') +
            (n.next_action ? '<p class="rm-ask"><strong>Ask next:</strong> ' + esc(n.next_action) + '</p>' : '') +
            '<details><summary>Sources and verification</summary><p>' + esc(n.evidence_note) + '</p><p>' + [link(n.source_url, 'Original source'), link(n.additional_source_url, 'Supporting source')].filter(Boolean).join(' · ') + '</p>' +
            '<p class="rm-muted">Checked ' + esc(n.checked_on || 'unknown') + (n.source_date ? ' · Source dated ' + esc(n.source_date) : ' · Source date not recorded') + (n.verified_by ? ' · ' + esc(n.verified_by) : '') + '</p>' +
            (n.authority_evidence ? '<p>Authority evidence: ' + esc(n.authority_evidence) + ' · ' + esc(n.authority_checked_on) + '</p>' : '') + '</details>' +
            (editable ? '<div class="rm-actions"><button type="button" data-rm-edit="' + esc(n.id) + '">Edit relationship</button><button type="button" data-rm-archive="' + esc(n.id) + '">Archive</button></div>' : '') + '</article>';
    }
    function cards(s, editable) {
        var active = (s.nodes || []).filter(function (n) { return !n.archived; });
        if (!active.length) return '<p class="rm-muted">Add the people and organizations who own, operate, evaluate or approve this site.</p>';
        var lanes = [
            { name: 'Ownership & operations', roles: ['land_owner', 'gas_rights', 'operator'] },
            { name: 'Technical & development', roles: ['technical', 'developer'] },
            { name: 'Commercial & approval', roles: ['commercial', 'approval', 'procurement', 'records'] }
        ], used = Object.create(null);
        return '<div class="rm-lanes">' + lanes.map(function (lane) {
            var group = active.filter(function (n) { if (used[n.id] || !n.roles.some(function (r) { return lane.roles.indexOf(r) >= 0; })) return false; used[n.id] = true; return true; });
            return '<section class="rm-lane"><h4 class="rm-lane-title">' + lane.name + '</h4>' + (group.length ? card(group[0], editable) +
                (group.length > 1 ? '<details class="rm-more"><summary>' + (group.length - 1) + ' more ' + (group.length === 2 ? 'relationship' : 'relationships') + '</summary>' + group.slice(1).map(function (n) { return card(n, editable); }).join('') + '</details>' : '') : '<p class="rm-muted">Relationship still to identify.</p>') + '</section>';
        }).join('') + '</div>';
    }
    function coverage(s) { return '<ul class="rm-coverage" aria-label="Relationship coverage">' + R.coverage(s).map(function (r) {
        return '<li class="rm-' + r.status + '"><strong>' + esc(r.label) + '</strong><span>' + { documented: 'Documented', confirm: 'Confirm scope / authority', missing: 'Still to identify' }[r.status] + '</span></li>';
    }).join('') + '</ul>'; }
    function connections(s, editable) {
        var nodes = (s.nodes || []).filter(function (n) { return !n.archived; }), names = Object.create(null);
        nodes.forEach(function (n) { names[n.id] = n.name; });
        var edges = (s.connections || []).filter(function (e) { return names[e.from] && names[e.to]; });
        return edges.length ? '<ul class="rm-connections">' + edges.map(function (e) {
            return '<li><strong>' + esc(names[e.from]) + '</strong> <span aria-label="connects to">→</span> <strong>' + esc(names[e.to]) + '</strong><p>' + esc(e.label) + ' · ' + esc(label(R.STATUSES, e.status)) + '</p><details><summary>Connection evidence</summary><p>' + esc(e.evidence_note) + '</p>' + link(e.source_url, 'Original source') + '<p>Checked ' + esc(e.checked_on) + '</p></details>' +
                (editable ? '<button type="button" data-rm-remove-edge="' + esc(e.id) + '">Remove connection</button>' : '') + '</li>';
        }).join('') + '</ul>' : '<p class="rm-muted">Record an introduction, reporting line or organization link once its basis is known.</p>';
    }
    function placeholder(candidate, editable) {
        var id = R.sourceId(candidate); if (!id) return '';
        return '<div class="rm-research" data-relationship-research="' + esc(id) + '" data-editable="' + !!editable + '" aria-live="polite">Loading available relationship research…</div>';
    }
    function researchMarkup(pack, editable) {
        return '<div class="rm-research-head"><h4>Researched example · ' + esc(pack.site_name) + '</h4><span>Checked ' + esc(pack.checked_on) + '</span></div>' +
            '<p>' + esc(pack.summary) + '</p><p class="rm-ask"><strong>First step:</strong> ' + esc(pack.first_step) + '</p>' +
            '<details><summary>Review ' + pack.nodes.length + ' people and organizations, connections and open questions</summary>' + coverage(pack) + cards(pack, false) + connections(pack, false) +
            '<ul>' + (pack.open_questions || []).map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul><ul>' + (pack.context || []).map(function (item) { return '<li>' + esc(item.note) + ' ' + link(item.url, 'Source') + '</li>'; }).join('') + '</ul></details>' +
            (editable ? '<button type="button" data-rm-import>Use this research in the saved map</button>' : '<p class="rm-muted">Track this site and open its Prospecting detail to save and edit the map.</p>');
    }
    function mountResearch(host, candidate, onImport) {
        var id = R.sourceId(candidate), slot = host && host.querySelector && host.querySelector('[data-relationship-research]');
        if (!slot || !id || slot.getAttribute('data-relationship-research') !== id) return Promise.resolve(null);
        if (slot._relationshipRequest) return slot._relationshipRequest;
        function current() { return slot.isConnected !== false && slot.getAttribute('data-relationship-research') === id; }
        var request = R.loadResearch(candidate).then(function (pack) {
            if (!current()) return null;
            slot.innerHTML = pack ? researchMarkup(pack, !!onImport) : '<p class="rm-muted">Detailed relationship research has not been prepared for this site yet. Its saved map can be built from contacts and source documents.</p>';
            var button = slot.querySelector('[data-rm-import]');
            if (button && onImport) button.addEventListener('click', function () { onImport(pack, id); });
            return pack;
        }).catch(function () {
            if (!current()) return null;
            slot._relationshipRequest = null;
            slot.innerHTML = '<p>Relationship research could not be loaded.</p><button type="button" data-rm-retry>Retry research</button>';
            var retry = slot.querySelector('[data-rm-retry]');
            if (retry) retry.addEventListener('click', function () { mountResearch(host, candidate, onImport); });
            return null;
        });
        slot._relationshipRequest = request; return request;
    }
    function render(site, candidate) {
        var s = R.state(site);
        if (s.error) return '<section class="pd-sec rm" id="dealRelationships"><h3>Relationship map</h3><p role="alert">' + esc(s.error) + '</p></section>';
        var contacts = typeof CrmContacts !== 'undefined' ? CrmContacts.forProspect(site.id) : [];
        return '<section class="pd-sec rm" id="dealRelationships" data-prospect-id="' + esc(site.id) + '" data-revision="' + s.revision + '"><div class="rm-heading"><div><h3>Relationship map</h3><p>Who controls the site, who can introduce you, and who can approve the deal.</p></div><div class="rm-actions"><button type="button" data-rm-export>Export map</button><button type="button" data-rm-reload>Reload map and clear these forms</button></div></div>' +
            '<p class="rm-muted">A directory listing establishes a contact route. Gas rights and authority need their own evidence. Coverage is a checklist, not a probability of closing.</p>' +
            '<div data-rm-coverage>' + coverage(s) + '</div><div class="rm-site-node">' + esc(site.name || site.id) + '</div><div data-rm-cards>' + cards(s, true) + '</div>' +
            '<details><summary>Connections and introductions</summary><div data-rm-connections>' + connections(s, true) + '</div>' +
            '<form data-rm-form="connection"><h4>Add a connection</h4><div class="rm-fields">' + select('from', 'From', [['', 'Choose a map contact']].concat(s.nodes.filter(function (n) { return !n.archived; }).map(function (n) { return [n.id, n.name]; }))) +
            select('to', 'To', [['', 'Choose a map contact']].concat(s.nodes.filter(function (n) { return !n.archived; }).map(function (n) { return [n.id, n.name]; }))) + input('label', 'Relationship — for example, introduced us to') + '</div>' + provenanceFields() +
            '<button type="submit">Save connection</button></form></details>' +
            '<details data-rm-editor><summary>Add or edit a person / organization</summary><div class="rm-fields">' + select('crm_contact', 'Start from an existing linked contact', [['', 'Choose a saved contact']].concat(contacts.map(function (c) { return [c.id, c.name || c.organization || c.id]; }))) +
            '<button type="button" data-rm-prefill>Use selected contact</button></div><form data-rm-form="node"><input type="hidden" name="id"><input type="hidden" name="contact_id"><div class="rm-fields">' +
            select('kind', 'Record type', [['person', 'Person'], ['organization', 'Organization']]) + input('name', 'Name') + input('title', 'Published title') + input('organization', 'Organization') + input('phone', 'Business phone', 'tel') + input('email', 'Business email', 'email') + '</div>' +
            '<fieldset><legend>Role at this site — select all that apply</legend><div class="rm-role-options">' + R.ROLES.map(function (r) { return '<label><input type="checkbox" name="roles" value="' + r[0] + '">' + esc(r[1]) + '</label>'; }).join('') + '</div></fieldset>' + area('next_action', 'Next question or introduction to request') +
            '<details><summary>Sources and relationship verification</summary>' + provenanceFields() + '</details>' +
            '<details><summary>Authority to approve or control energy rights</summary><div class="rm-fields">' + select('authority_status', 'Authority status', R.AUTHORITIES) + input('authority_checked_on', 'Authority checked', 'date') + '</div>' +
            area('authority_scope', 'Exact scope — what can this person or organization authorize?') + area('authority_evidence', 'Agreement, delegation or confirmation supporting that authority') + '</details>' +
            '<div class="rm-actions"><button type="submit">Save relationship</button><button type="button" data-rm-clear>Clear form</button></div></form></details>' +
            '<details><summary>Archived relationships</summary><div data-rm-archived></div></details>' + placeholder(candidate, true) + '<p id="relationshipStatus" role="status" aria-live="polite"></p></section>';
    }
    function commit(id, command) {
        var site = typeof SiteData !== 'undefined' && SiteData.get(id);
        if (!site) return { ok: false, err: 'This prospect no longer exists.' };
        var result = R.apply(site, command);
        if (!result.ok) return result;
        var fields = Object.assign({}, site.custom_fields || {}); fields[R.storageKey] = result.relationship_map;
        var saved = SiteData.update(id, { custom_fields: fields });
        if (!saved || !saved._save || !saved._save.ok) return { ok: false, err: (saved && saved._save && saved._save.err) || 'Could not save the relationship map. Your entries are preserved.' };
        if (R.state(saved).revision !== result.relationship_map.revision) return { ok: false, err: 'The site model did not retain this map. Reload the updated app before retrying.' };
        return { ok: true, site: saved };
    }
    function values(form) {
        var out = { roles: [] };
        form.querySelectorAll('[name]').forEach(function (el) { if (el.name === 'roles') { if (el.checked) out.roles.push(el.value); } else out[el.name] = el.value; });
        return out;
    }
    function fill(form, data) { form.querySelectorAll('[name]').forEach(function (el) { if (el.name === 'roles') el.checked = (data.roles || []).indexOf(el.value) >= 0; else el.value = data[el.name] == null ? '' : data[el.name]; }); }
    function bind(site, host, candidate) {
        var root = host.querySelector('#dealRelationships'); if (!root || R.state(site).error) return;
        var revision = R.state(site).revision, status = root.querySelector('#relationshipStatus'), forms = Array.from(root.querySelectorAll('[data-rm-form]'));
        var initial = new Map(); forms.forEach(function (f) { initial.set(f, JSON.stringify(values(f))); });
        var nodeForm = forms.find(function (f) { return f.getAttribute('data-rm-form') === 'node'; });
        var connectionForm = forms.find(function (f) { return f.getAttribute('data-rm-form') === 'connection'; });
        function dirty(form) { return JSON.stringify(values(form)) !== initial.get(form); }
        root._hasDraft = function () { return forms.some(dirty); };
        function clearNode() { nodeForm.reset(); initial.set(nodeForm, JSON.stringify(values(nodeForm))); }
        function refresh() {
            var current = SiteData.get(site.id), s = R.state(current); if (s.error) { status.textContent = s.error; return; }
            revision = s.revision; root.setAttribute('data-revision', revision);
            root.querySelector('[data-rm-coverage]').innerHTML = coverage(s); root.querySelector('[data-rm-cards]').innerHTML = cards(s, true);
            root.querySelector('[data-rm-connections]').innerHTML = connections(s, true);
            root.querySelector('[data-rm-archived]').innerHTML = s.nodes.filter(function (n) { return n.archived; }).map(function (n) { return '<p>' + esc(n.name) + ' <button type="button" data-rm-restore="' + esc(n.id) + '">Restore</button></p>'; }).join('') || '<p class="rm-muted">No archived relationships.</p>';
            if (!dirty(connectionForm)) {
                ['from', 'to'].forEach(function (k) { connectionForm.querySelector('[name="' + k + '"]').innerHTML = '<option value="">Choose a map contact</option>' + s.nodes.filter(function (n) { return !n.archived; }).map(function (n) { return '<option value="' + esc(n.id) + '">' + esc(n.name) + '</option>'; }).join(''); });
                initial.set(connectionForm, JSON.stringify(values(connectionForm)));
            }
        }
        function save(command) {
            var result = commit(site.id, Object.assign({ revision: revision }, command));
            if (!result.ok) { status.textContent = result.err; return false; }
            refresh(); status.textContent = 'Relationship map saved. Commercial qualification and pipeline stage are unchanged.'; return true;
        }
        root.addEventListener('submit', function (event) {
            if (forms.indexOf(event.target) < 0) return; event.preventDefault();
            var form = event.target, data = values(form);
            if (save({ type: form === nodeForm ? 'save_node' : 'add_connection', id: data.id || undefined, value: data })) {
                form.reset(); initial.set(form, JSON.stringify(values(form))); refresh();
            }
        });
        root.addEventListener('click', function (event) {
            var b = event.target.closest('button'); if (!b || !root.contains(b)) return;
            if (b.hasAttribute('data-rm-reload')) {
                forms.forEach(function (form) { form.reset(); initial.set(form, JSON.stringify(values(form))); });
                refresh(); status.textContent = 'Loaded the latest saved map. Relationship forms cleared.'; return;
            }
            if (b.hasAttribute('data-rm-clear')) { clearNode(); status.textContent = 'Form cleared.'; return; }
            if (b.hasAttribute('data-rm-edit')) {
                if (dirty(nodeForm)) { status.textContent = 'Save or clear the current contact form before opening another relationship.'; return; }
                var s = R.state(SiteData.get(site.id)), n = s.nodes && s.nodes.find(function (n) { return n.id === b.getAttribute('data-rm-edit'); });
                if (!n) return; fill(nodeForm, n); initial.set(nodeForm, JSON.stringify(values(nodeForm))); root.querySelector('[data-rm-editor]').open = true;
                nodeForm.querySelector('[name="name"]').focus(); return;
            }
            if (b.hasAttribute('data-rm-prefill')) {
                if (dirty(nodeForm)) { status.textContent = 'Save or clear your current contact form first.'; return; }
                var id = root.querySelector('[name="crm_contact"]').value;
                var contact = typeof CrmContacts !== 'undefined' && CrmContacts.forProspect(site.id).find(function (c) { return c.id === id; });
                if (!contact) { status.textContent = 'Choose a contact already linked to this prospect.'; return; }
                clearNode(); ['name', 'title', 'organization', 'phone', 'email'].forEach(function (key) { nodeForm.querySelector('[name="' + key + '"]').value = contact[key] || ''; });
                nodeForm.querySelector('[name="contact_id"]').value = contact.id;
                nodeForm.querySelector('[name="evidence_note"]').value = 'Saved contact record ' + contact.id + '. Confirm the relationship and authority at this specific site.';
                status.textContent = 'Contact details copied into the form. Choose its role and evidence before saving.'; return;
            }
            var type = b.hasAttribute('data-rm-archive') ? 'archive_node' : b.hasAttribute('data-rm-restore') ? 'restore_node' : b.hasAttribute('data-rm-remove-edge') ? 'remove_connection' : null;
            if (type) {
                if (root._hasDraft()) { status.textContent = 'Save or clear the open forms before changing the map.'; return; }
                save({ type: type, id: b.getAttribute(type === 'archive_node' ? 'data-rm-archive' : type === 'restore_node' ? 'data-rm-restore' : 'data-rm-remove-edge') }); return;
            }
            if (b.hasAttribute('data-rm-export')) {
                var current = SiteData.get(site.id), map = R.state(current);
                var url = URL.createObjectURL(new Blob([JSON.stringify({ site_id: site.id, site_name: current.name, exported_at: new Date().toISOString(), relationship_map: map }, null, 2)], { type: 'application/json' }));
                var a = document.createElement('a'); a.href = url; a.download = 'relationships-' + site.id.replace(/[^a-z0-9_-]/gi, '_') + '.json'; a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
                status.textContent = 'Exported the saved relationship map and its history.';
            }
        });
        refresh();
        mountResearch(root, candidate, function (pack, id) {
            if (root._hasDraft()) { status.textContent = 'Save or clear the open forms before importing the research.'; return; }
            if (R.sourceId(candidate) !== id) { status.textContent = 'The selected site changed. Reload its relationship research.'; return; }
            save({ type: 'import_research', source_id: id, value: pack });
        });
    }
    return { render: render, bind: bind, commit: commit, placeholder: placeholder, mountResearch: mountResearch,
        researchMarkup: researchMarkup, cards: cards, coverage: coverage, connections: connections, values: values };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = DealRelationshipsUi;
