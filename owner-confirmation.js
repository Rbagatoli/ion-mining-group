/* Owner conversations, evidence and promised actions saved together on the existing site record. */
var OwnerConfirmation = (function () {
    'use strict';
    var KEY = '_proton_owner_confirmation_v1';
    var TOPICS = [
        ['rights', 'Rights & decision makers', 'Who owns the gas and surface rights? Who can sign? Ask about exclusivity, options, leases, existing allocations and rights of first refusal.'],
        ['energy', 'Available energy & measurements', 'What is collected, used and offered now? Request dated flow and gas-quality logs, pressure, contaminants, seasonal variation and decline.'],
        ['infrastructure', 'Equipment & capital responsibility', 'Which wells, flares, treatment, generators, electrical equipment and civil works can Proton use? What needs repair or construction, and who pays? Request equipment lists and itemized quotes.'],
        ['commercial', 'Owner priorities & terms', 'What would make a partnership worthwhile: predictable income, no new capital, flexibility or an interim outlet? Discuss the preferred deal structure and term.'],
        ['timing', 'Contracts & deadlines', 'When do existing agreements expire? Confirm renewal and notice deadlines, planned RNG projects, procurement dates and competing uses.'],
        ['approvals', 'Approval route & next exchange', 'Which people or bodies must approve? What procurement process applies? What information will each side provide next?']
    ];
    var BASIS = [['unanswered', 'No new answer'], ['owner_report', 'Reported in conversation'], ['written', 'Written response / document'], ['uncertain', 'Unresolved or conflicting']];
    var OUTCOMES = [['discussion', 'Discussion / substantive reply'], ['no_answer', 'No answer'], ['voicemail', 'Voicemail left'], ['declined', 'Declined further discussion']];
    var METHODS = [['call', 'Phone'], ['meeting', 'Meeting / video'], ['site_visit', 'Site visit'], ['email', 'Email']];
    var DIRECTIONS = [['outbound', 'We initiated this exchange'], ['inbound', 'They initiated this exchange']];
    var DOCS = [['agreements', 'Current gas / power agreements'], ['flow', 'Flow and gas-quality logs'], ['equipment', 'Equipment and maintenance list'], ['electrical', 'Electrical diagram / utility conditions'], ['permits', 'Permit and approval records'], ['quotes', 'Itemized scopes, quotes and funding']];
    function text(v) { return v == null ? '' : String(v).trim(); }
    function clone(v) { return JSON.parse(JSON.stringify(v)); }
    function today(now) { var d = new Date(now == null ? Date.now() : now); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    function day(v) { return /^\d{4}-\d{2}-\d{2}$/.test(v || '') && Number.isFinite(Date.parse(v)) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v; }
    function safeUrl(v) { try { var u = new URL(text(v)); return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u.href : null; } catch (_) { return null; } }
    function field(v, label, max, required) { var s = text(v); if (s.length > max || required && !s) throw Error(label + (required ? ' is required; use' : ': use') + ' at most ' + max + ' characters.'); return s; }
    function known(list, v, label) { if (!list.some(function (x) { return x[0] === v; })) throw Error('Choose ' + label + '.'); return v; }
    function quantity(v, label, max) { if (text(v) === '') return null; var n = Number(v); if (typeof v === 'boolean' || !Number.isFinite(n) || n < 0 || n > max) throw Error(label + ' must be between 0 and ' + max + '.'); return n; }
    function empty() { return { v: 1, revision: 0, conversations: [], actions: [], history: [] }; }
    function state(site) {
        var s = site && site.custom_fields && site.custom_fields[KEY];
        if (s == null) return empty();
        if (!s || s.v !== 1 || !Number.isSafeInteger(s.revision) || s.revision < 0 || s.revision >= Number.MAX_SAFE_INTEGER || !Array.isArray(s.conversations) || !Array.isArray(s.actions) || !Array.isArray(s.history)) return { error: 'The saved owner worksheet is unreadable. Export the site backup before repairing it.' };
        var ids = Object.create(null), actionIds = Object.create(null), topics = TOPICS.map(function (t) { return t[0]; });
        if (s.conversations.some(function (c) {
            if (!c || !/^oc_[1-9]\d*$/.test(c.id) || Number(c.id.slice(3)) > s.revision || ids[c.id] || !day(c.occurred_on) || typeof c.recorded_at !== 'string' || !Number.isFinite(Date.parse(c.recorded_at)) || !c.person || !c.recorded_by || !c.summary ||
                !OUTCOMES.some(function (x) { return x[0] === c.outcome; }) || !METHODS.some(function (x) { return x[0] === c.method; }) || !Array.isArray(c.requested_documents) || !c.answers || typeof c.answers !== 'object' || Array.isArray(c.answers) ||
                Object.keys(c.answers).some(function (k) { var a = c.answers[k]; return topics.indexOf(k) < 0 || !a || !a.note || !BASIS.some(function (b) { return b[0] === a.basis && b[0] !== 'unanswered'; }); })) return true;
            ids[c.id] = true; return false;
        }) || s.actions.some(function (a) { if (!a || !/^oa_[1-9]\d*$/.test(a.id) || actionIds[a.id] || !ids[a.conversation_id] || !a.description || !a.owner || !day(a.due_on) || ['open', 'done'].indexOf(a.status) < 0) return true; actionIds[a.id] = true; return false; })) return { error: 'A saved conversation or follow-up is invalid. Export the site backup before repairing it.' };
        return clone(s);
    }
    function relationshipNodes(site) {
        var R = typeof DealRelationships !== 'undefined' ? DealRelationships : typeof require === 'function' ? require('./deal-relationships') : null;
        var s = R ? R.state(site) : {}; return s.error ? [] : (s.nodes || []).filter(function (n) { return !n.archived; });
    }
    function apply(site, command, now) {
        var s = state(site), c = command || {}, v = c.value || {}, on = today(now), at = new Date(now == null ? Date.now() : now).toISOString();
        if (!site || !site.id) return { ok: false, err: 'Save this prospect before recording a conversation.' };
        if (s.error) return { ok: false, err: s.error };
        if (c.revision !== s.revision) return { ok: false, err: 'This worksheet changed in another view. Your draft is preserved; reload before saving.' };
        try {
            var actor = field(v.recorded_by, 'Recorded by', 120, true);
            if (c.type === 'conversation') {
                if (s.conversations.length >= 100) throw Error('This worksheet has 100 conversations. Export its history before planning an archive.');
                if (!day(v.occurred_on) || v.occurred_on > on) throw Error('Use a valid conversation date that is not in the future.');
                var record = { id: 'oc_' + (s.revision + 1), recorded_at: at, occurred_on: v.occurred_on, recorded_by: actor,
                    method: known(METHODS, v.method, 'how you communicated'), direction: known(DIRECTIONS, v.direction, 'who initiated the exchange'), outcome: known(OUTCOMES, v.outcome, 'the outcome'),
                    person: field(v.person, 'Person / office contacted', 160, true), organization: field(v.organization, 'Organization', 180, false),
                    relationship_id: text(v.relationship_id), summary: field(v.summary, 'Conversation summary', 1500, true), answers: {}, requested_documents: [] };
                if (record.relationship_id) {
                    var node = relationshipNodes(site).find(function (n) { return n.id === record.relationship_id; });
                    if (!node) throw Error('That relationship is no longer available. Refresh the contact choices.');
                    if (node.name !== record.person || text(node.organization) !== record.organization) throw Error('The selected relationship and entered person do not match. Choose a separate contact or refresh the relationship.');
                    record.relationship_snapshot = { id: node.id, contact_id: node.contact_id || null, name: node.name, organization: node.organization || '', roles: clone(node.roles), authority_status: node.authority_status };
                }
                var answers = v.answers || {};
                TOPICS.forEach(function (t) {
                    var a = answers[t[0]] || {}, basis = a.basis || 'unanswered', note = field(a.note, t[1] + ' answer', 1600, false), ref = field(a.reference, t[1] + ' source reference', 1000, false), url = text(a.source_url);
                    known(BASIS, basis, 'an evidence basis for ' + t[1]);
                    if (url && (!safeUrl(url) || url.length > 2000)) throw Error('Use an http(s) source link without credentials.');
                    if (basis === 'unanswered') { if (note || ref || url) throw Error('Choose an evidence basis for the answer under ' + t[1] + '.'); return; }
                    if (!note) throw Error('Record what was learned under ' + t[1] + '.');
                    if (basis === 'written' && !ref && !url) throw Error('Add the written response or document reference for ' + t[1] + '.');
                    record.answers[t[0]] = { basis: basis, note: note, reference: ref, source_url: url };
                });
                record.energy = { offered_net_kw: quantity(v.offered_net_kw, 'Reported offered net kW', 1e9), collected_mmscfd: quantity(v.collected_mmscfd, 'Reported collected gas', 1e6), methane_pct: quantity(v.methane_pct, 'Reported methane percent', 100), measured_on: text(v.measured_on) };
                if (record.energy.measured_on && (!day(record.energy.measured_on) || record.energy.measured_on > v.occurred_on)) throw Error('Measurement date must be valid and no later than the conversation.');
                if (Object.keys(record.energy).some(function (k) { return record.energy[k] !== null && record.energy[k] !== ''; }) && !record.answers.energy) throw Error('Give the energy figures an answer and evidence basis.');
                if (['no_answer', 'voicemail'].indexOf(record.outcome) >= 0 && Object.keys(record.answers).length) throw Error('A missed call or voicemail cannot supply new owner answers. Choose a discussion or declined reply if information was received.');
                if (v.requested_documents != null && !Array.isArray(v.requested_documents)) throw Error('Choose requested documents from the checklist.');
                (v.requested_documents || []).forEach(function (id) { known(DOCS, id, 'a document type'); if (record.requested_documents.indexOf(id) < 0) record.requested_documents.push(id); });
                if (!day(v.due_on) || v.due_on < v.occurred_on) throw Error('Give the next action a valid due date on or after the conversation.');
                var action = { id: 'oa_' + (s.revision + 1), conversation_id: record.id, description: field(v.next_action, 'Next action', 600, true), owner: field(v.action_owner, 'Next action owner', 120, true),
                    due_on: v.due_on, waiting_on: field(v.waiting_on, 'Waiting on', 180, false), status: 'open', created_at: at };
                s.conversations.push(record); s.actions.push(action); s.history.push({ type: 'conversation_recorded', id: record.id, by: actor, at: at });
            } else if (c.type === 'action') {
                var target = s.actions.find(function (a) { return a.id === c.id; }); if (!target) throw Error('This follow-up no longer exists.');
                if (['done', 'open'].indexOf(v.status) < 0 || target.status === v.status) throw Error('Choose a different follow-up status.');
                var completion = field(v.note, 'Completion / reopening note', 600, true);
                s.history.push({ type: 'action_status', id: target.id, before: target.status, after: v.status, note: completion, by: actor, at: at });
                target.status = v.status; target.updated_at = at; target.completion_note = completion; target.completed_by = actor;
            } else if (c.type === 'void') {
                var conversation = s.conversations.find(function (x) { return x.id === c.id; }); if (!conversation || conversation.voided) throw Error('This conversation is missing or already marked in error.');
                conversation.voided = { reason: field(v.note, 'Correction reason', 600, true), by: actor, at: at };
                // Preserve the record and its actions. Open promises are still visible until explicitly completed.
                s.history.push({ type: 'conversation_voided', id: c.id, by: actor, at: at, reason: conversation.voided.reason });
            } else throw Error('Unknown owner-confirmation action.');
            s.revision++;
            if (new TextEncoder().encode(JSON.stringify(s)).length > 240000) throw Error('This worksheet is too large to save safely. Export the site and shorten the new entry.');
            return { ok: true, worksheet: s };
        } catch (e) { return { ok: false, err: e.message }; }
    }
    function findings(site) {
        var s = state(site), latest = {}; if (s.error) return latest;
        s.conversations.filter(function (c) { return !c.voided && ['discussion', 'declined'].indexOf(c.outcome) >= 0; }).slice().sort(function (a, b) { return a.occurred_on.localeCompare(b.occurred_on) || a.recorded_at.localeCompare(b.recorded_at) || Number(a.id.slice(3)) - Number(b.id.slice(3)); }).forEach(function (c) {
            Object.keys(c.answers).forEach(function (id) { latest[id] = Object.assign({}, c.answers[id], { occurred_on: c.occurred_on, person: c.person, conversation_id: c.id, energy: id === 'energy' ? c.energy : null }); });
        }); return latest;
    }
    function actions(site, now) { var s = state(site), on = today(now); return s.error ? [] : s.actions.map(function (a) { return Object.assign({}, a, { prospect_id: site.id, site_name: site.name || site.id, due_state: a.status === 'done' ? 'done' : a.due_on < on ? 'overdue' : a.due_on === on ? 'today' : 'upcoming', conversation_voided: !!s.conversations.find(function (c) { return c.id === a.conversation_id && c.voided; }) }); }).sort(function (a, b) { return a.due_on.localeCompare(b.due_on) || a.id.localeCompare(b.id); }); }
    function queue(sites, now) { return (sites || []).reduce(function (all, site) { return all.concat(actions(site, now).filter(function (a) { return a.status === 'open'; })); }, []).sort(function (a, b) { return a.due_on.localeCompare(b.due_on) || a.site_name.localeCompare(b.site_name); }); }
    function nextAction(site, legacy, now) {
        var a = actions(site, now).find(function (a) { return a.status === 'open'; });
        if (!a || legacy && legacy.due_date <= a.due_on) return legacy || null;
        return { id: site.id + ':' + a.id, prospect_id: site.id, description: a.description + ' — ' + a.owner + (a.conversation_voided ? ' (linked conversation marked in error)' : ''), due_date: a.due_on, owner_confirmation_id: a.id };
    }
    function interactions(site) {
        var s = state(site); return s.error ? [] : s.conversations.filter(function (c) { return !c.voided; }).map(function (c) {
            var action = s.actions.find(function (a) { return a.conversation_id === c.id; });
            return { id: site.id + ':' + c.id, prospect_id: site.id, kind: 'interaction', owner_confirmation_id: c.id, seq: Number(c.id.slice(3)), occurred_at: c.occurred_on, at: c.recorded_at,
                interaction_type: c.method, direction: c.direction || null, contact_id: c.relationship_snapshot && c.relationship_snapshot.contact_id || null, contact_person: c.person, summary: c.summary + ' (Owner-confirmation worksheet)', outcome: c.outcome === 'no_answer' || c.outcome === 'voicemail' ? 'no_answer' : c.outcome === 'declined' ? 'negative' : 'neutral', next_action: action && action.description, next_action_due: action && action.due_on };
        });
    }
    return { KEY: KEY, TOPICS: TOPICS, BASIS: BASIS, OUTCOMES: OUTCOMES, METHODS: METHODS, DIRECTIONS: DIRECTIONS, DOCS: DOCS, state: state, apply: apply, findings: findings, actions: actions, queue: queue, nextAction: nextAction, interactions: interactions, relationshipNodes: relationshipNodes, today: today, safeUrl: safeUrl };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = OwnerConfirmation;
