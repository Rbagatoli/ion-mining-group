/* Site-specific relationships. Public listings never confirm gas rights or signing authority. */
var DealRelationships = (function () {
    'use strict';
    var ROLES = [
        ['land_owner', 'Land / surface owner'], ['gas_rights', 'Gas or energy rights holder'],
        ['operator', 'Landfill operations'], ['technical', 'Technical reviewer / engineer'],
        ['developer', 'Existing energy developer'], ['commercial', 'Commercial / executive contact'],
        ['approval', 'Final approval authority'], ['procurement', 'Procurement contact'], ['records', 'Records / introduction route']
    ];
    var STATUSES = [['unconfirmed', 'Needs confirmation'], ['published', 'Publicly documented'], ['confirmed', 'Directly confirmed'], ['historical', 'Historical lead']];
    var AUTHORITIES = [['unconfirmed', 'Authority unconfirmed'], ['confirmed', 'Documented authority'], ['not_authorized', 'Not authorized to approve']];
    var EDITION = '2026-09-07', STORAGE_KEY = '_proton_relationship_map_v1', cached, loading;
    var clone = function (v) { return JSON.parse(JSON.stringify(v)); };
    var text = function (v) { return v == null ? '' : String(v).trim(); };
    var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
    function fail(err) { return { ok: false, err: err }; }
    function day(v) { if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return false; var d = new Date(v + 'T00:00:00Z'); return isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v; }
    function today(now) { return new Date(now == null ? Date.now() : now).toISOString().slice(0, 10); }
    function safeUrl(v) { try { var u = new URL(text(v)); return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u.href : null; } catch (_) { return null; } }
    function field(v, label, max, required) { var s = text(v); if (s.length > max || (required && !s)) throw Error(label + (required ? ' is required and' : '') + ' must be at most ' + max + ' characters.'); return s; }
    function known(list, key) { return list.some(function (r) { return r[0] === key; }); }
    function state(site) {
        // Older app tabs preserve custom_fields but drop unknown top-level site fields.
        var fields = site && site.custom_fields;
        var raw = fields && own(fields, STORAGE_KEY) ? fields[STORAGE_KEY] : site && site.relationship_map;
        if (raw == null) return { v: 1, revision: 0, nodes: [], connections: [], history: [] };
        if (!raw || raw.v !== 1 || !Number.isSafeInteger(raw.revision) || raw.revision < 0 ||
            !Array.isArray(raw.nodes) || !Array.isArray(raw.connections) || !Array.isArray(raw.history)) {
            return { error: 'The saved relationship map is unreadable. Restore a valid backup before editing it.' };
        }
        var ids = Object.create(null);
        for (var i = 0; i < raw.nodes.length; i++) {
            var n = raw.nodes[i];
            if (!n || !/^[a-zA-Z0-9_-]{1,100}$/.test(n.id) || ids[n.id] || !Array.isArray(n.roles) ||
                !known(STATUSES, n.status) || !known(AUTHORITIES, n.authority_status)) return { error: 'The saved relationship map has an invalid contact. Restore a valid backup before editing it.' };
            ids[n.id] = true;
        }
        if (raw.connections.some(function (c) { return !c || !ids[c.from] || !ids[c.to] || c.from === c.to; })) return { error: 'The saved relationship map has an invalid connection.' };
        return clone(raw);
    }
    function provenance(v, now) {
        var out = {};
        out.status = v.status;
        if (!known(STATUSES, out.status)) throw Error('Choose how this relationship was checked.');
        out.source_url = field(v.source_url, 'Source URL', 2000);
        if (out.source_url && !safeUrl(out.source_url)) throw Error('Use an http(s) source URL without embedded credentials.');
        out.additional_source_url = field(v.additional_source_url, 'Additional source URL', 2000);
        if (out.additional_source_url && !safeUrl(out.additional_source_url)) throw Error('The additional source must be an http(s) URL without credentials.');
        out.evidence_note = field(v.evidence_note, 'Evidence / document reference', 1800);
        out.checked_on = text(v.checked_on); out.source_date = text(v.source_date);
        if (!day(out.checked_on) || out.checked_on > today(now)) throw Error('Enter a valid date checked, no later than today.');
        if (out.source_date && (!day(out.source_date) || out.source_date > today(now))) throw Error('The source date must be a valid past or current date.');
        if (out.status !== 'unconfirmed' && !out.evidence_note) throw Error('Record the source or document / conversation evidence for this relationship.');
        out.verified_by = field(v.verified_by, 'Checked by', 120, out.status === 'confirmed');
        return out;
    }
    function node(value, now) {
        var v = value || {}, out = provenance(v, now);
        out.kind = v.kind;
        if (out.kind !== 'person' && out.kind !== 'organization') throw Error('Choose a person or organization.');
        ['name', 'title', 'organization', 'phone', 'email', 'contact_id', 'next_action'].forEach(function (k) {
            out[k] = field(v[k], k.replace(/_/g, ' '), k === 'next_action' ? 1200 : k === 'contact_id' ? 120 : 240, k === 'name');
        });
        if (out.email && !/^[^\s<>"?&=#:]+@[^\s<>"?&=#:]+\.[^\s<>"?&=#:]+$/.test(out.email)) throw Error('Enter a business email without extra URL parameters.');
        if (out.phone && !/^[+()\d.\s-]+(?:\s*(?:ext\.?|x|extension)\s*\d+)?$/i.test(out.phone)) throw Error('Enter a phone number, optionally with an extension.');
        if (!Array.isArray(v.roles) || !v.roles.length || v.roles.some(function (r) { return !known(ROLES, r); })) throw Error('Choose at least one relationship role.');
        out.roles = Array.from(new Set(v.roles));
        out.authority_status = v.authority_status;
        if (!known(AUTHORITIES, out.authority_status)) throw Error('Choose the authority status.');
        ['authority_scope', 'authority_evidence', 'authority_checked_on'].forEach(function (k) { out[k] = field(v[k], k.replace(/_/g, ' '), 1200); });
        if (out.authority_checked_on && (!day(out.authority_checked_on) || out.authority_checked_on > today(now))) throw Error('Authority date must be a valid past or current date.');
        if (out.authority_status === 'confirmed' && (!out.authority_scope || !out.authority_evidence || !out.verified_by || !out.authority_checked_on)) {
            throw Error('Document the exact authority, supporting agreement / delegation, date and reviewer. A job title alone is not enough.');
        }
        return out;
    }
    function apply(site, command, now) {
        if (!site || !site.id) return fail('This prospect no longer exists.');
        var s = state(site), c = command || {}, value = c.value || {}, at = new Date(now == null ? Date.now() : now).toISOString(), event;
        if (s.error) return fail(s.error);
        if (c.revision !== s.revision) return fail('This relationship map changed. Your entries are preserved; reload the saved map before applying them.');
        if (s.history.length >= 500) return fail('Export and consolidate this map before adding more history.');
        try {
            if (c.type === 'save_node') {
                var index = s.nodes.findIndex(function (n) { return n.id === c.id; });
                if (c.id && index < 0) return fail('That map contact no longer exists.');
                if (index < 0 && s.nodes.length >= 100) return fail('This map already has 100 contacts.');
                var n = node(value, now);
                if (n.contact_id && s.nodes.some(function (old) { return old.contact_id === n.contact_id && old.id !== c.id; })) return fail('That saved contact is already on this map. Edit its roles instead.');
                n.id = index >= 0 ? c.id : 'rel_' + Date.parse(at).toString(36) + '_' + (s.revision + 1);
                n.archived = index >= 0 ? !!s.nodes[index].archived : false;
                if (index >= 0 && s.nodes[index].research_key) n.research_key = s.nodes[index].research_key;
                event = { type: c.type, id: n.id, before: index >= 0 ? s.nodes[index] : null };
                if (index >= 0) s.nodes[index] = n; else s.nodes.push(n);
            } else if (c.type === 'archive_node' || c.type === 'restore_node') {
                var target = s.nodes.find(function (n) { return n.id === c.id; });
                if (!target) return fail('Map contact not found.');
                target.archived = c.type === 'archive_node'; event = { type: c.type, id: target.id };
            } else if (c.type === 'add_connection') {
                if (s.connections.length >= 200) return fail('This map already has 200 connections.');
                var edge = provenance(value, now);
                edge.from = value.from; edge.to = value.to;
                if (edge.from === edge.to || ![edge.from, edge.to].every(function (id) { return s.nodes.some(function (n) { return n.id === id && !n.archived; }); })) return fail('Select two different active people or organizations.');
                edge.label = field(value.label, 'Connection description', 240, true);
                if (s.connections.some(function (e) { return e.from === edge.from && e.to === edge.to && e.label === edge.label; })) return fail('This connection already exists.');
                edge.id = 'edge_' + Date.parse(at).toString(36) + '_' + (s.revision + 1);
                s.connections.push(edge); event = { type: c.type, id: edge.id };
            } else if (c.type === 'remove_connection') {
                var edgeIndex = s.connections.findIndex(function (e) { return e.id === c.id; });
                if (edgeIndex < 0) return fail('Connection not found.');
                event = { type: c.type, before: s.connections[edgeIndex] }; s.connections.splice(edgeIndex, 1);
            } else if (c.type === 'import_research') {
                if (!value || value.site_id !== c.source_id || !Array.isArray(value.prospect_ids) || value.prospect_ids.indexOf(site.id) < 0) return fail('This research belongs to a different source site.');
                if (!Array.isArray(value.nodes) || !Array.isArray(value.connections)) return fail('Research is unavailable.');
                var additions = value.nodes.filter(function (n) { return !s.nodes.some(function (old) { return old.id === n.id; }); });
                if (!additions.length) return fail('This research is already on the map. Your saved edits have been preserved.');
                if (s.nodes.length + additions.length > 100) return fail('The research exceeds this map’s contact limit.');
                additions.forEach(function (entry) {
                    if (!/^research_[a-z0-9_-]{1,80}$/.test(entry.id)) throw Error('Invalid research contact identifier.');
                    var clean = node(entry, now); clean.id = entry.id; clean.research_key = value.site_id + ':' + EDITION; clean.archived = false; s.nodes.push(clean);
                });
                value.connections.forEach(function (edge) {
                    if (s.connections.some(function (old) { return old.id === edge.id; })) return;
                    if (![edge.from, edge.to].every(function (id) { return s.nodes.some(function (n) { return n.id === id; }); })) throw Error('Research contains an unmatched connection.');
                    var clean = provenance(edge, now); clean.id = edge.id; clean.from = edge.from; clean.to = edge.to; clean.label = field(edge.label, 'Connection description', 240, true); s.connections.push(clean);
                });
                event = { type: c.type, site_id: value.site_id, added: additions.length };
            } else return fail('Unknown relationship action.');
        } catch (error) { return fail(error.message); }
        s.revision++; event.at = at; s.history.push(event);
        var valid = state({ relationship_map: s }); if (valid.error) return fail(valid.error);
        return { ok: true, relationship_map: s };
    }
    function coverage(s, now) {
        var nodes = (s.nodes || []).filter(function (n) { return !n.archived; });
        return ROLES.slice(0, 7).map(function (r) {
            var matches = nodes.filter(function (n) { return n.roles.indexOf(r[0]) >= 0; });
            var qualified = matches.some(function (n) {
                var age = Date.parse(today(now)) - Date.parse(n.checked_on);
                if (n.status === 'unconfirmed' || n.status === 'historical' || !day(n.checked_on) || age < 0 || age > 180 * 86400000) return false;
                var authorityAge = Date.parse(today(now)) - Date.parse(n.authority_checked_on);
                return ['gas_rights', 'approval'].indexOf(r[0]) < 0 || (n.authority_status === 'confirmed' && n.authority_scope && n.authority_evidence && day(n.authority_checked_on) && authorityAge >= 0 && authorityAge <= 180 * 86400000);
            });
            return { key: r[0], label: r[1], status: qualified ? 'documented' : matches.length ? 'confirm' : 'missing', count: matches.length };
        });
    }
    function sourceId(candidate) {
        var l = typeof LandfillContacts !== 'undefined' ? LandfillContacts : (typeof module !== 'undefined' && module.exports ? require('./landfill-contacts') : null);
        return l ? l.siteIdFor(candidate) : null;
    }
    function loadResearch(candidate) {
        var id = sourceId(candidate);
        if (!id) return Promise.resolve(null);
        // Only researched sites fetch the pilot pack; unrelated sites still have the editable map.
        if (id !== 'us-lf-10540') return Promise.resolve(null);
        if (cached) return Promise.resolve(own(cached.sites, id) ? cached.sites[id] : null);
        if (!loading) loading = fetch('./data/landfill-relationships-' + EDITION + '.json').then(function (r) {
            if (!r.ok) throw Error('Relationship research HTTP ' + r.status); return r.json();
        }).then(function (d) {
            if (!d || d.v !== 1 || d.edition !== EDITION || !d.sites || Array.isArray(d.sites)) throw Error('Relationship research format is unavailable.');
            Object.keys(d.sites).forEach(function (key) {
                var s = d.sites[key];
                if (s.site_id !== key || !Array.isArray(s.prospect_ids) || !Array.isArray(s.nodes) || !Array.isArray(s.connections)) throw Error('Relationship research has a mismatched site.');
                var checked = apply({ id: s.prospect_ids[0] }, { revision: 0, type: 'import_research', source_id: key, value: s });
                if (!checked.ok) throw Error(checked.err);
            });
            cached = d; loading = null; return d;
        }).catch(function (error) { loading = null; throw error; });
        return loading.then(function (d) { return own(d.sites, id) ? d.sites[id] : null; });
    }
    return { ROLES: ROLES, STATUSES: STATUSES, AUTHORITIES: AUTHORITIES, edition: EDITION, storageKey: STORAGE_KEY, state: state, apply: apply,
        coverage: coverage, sourceId: sourceId, loadResearch: loadResearch, safeUrl: safeUrl, validDay: day, today: today };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = DealRelationships;
