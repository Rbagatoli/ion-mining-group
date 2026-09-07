/* Dated sourcing claims and verification tasks. These never establish secured rights or capacity. */
var ProspectSourcing = (function () {
    'use strict';
    var KEY = '_proton_sourcing_v1', SEARCH_KEY = 'protonMiningSourcingSearches', FRESH_DAYS = 90;
    var PLAYS = [
        ['ppa_expiry', 'Expiring energy agreement', 'Request the executed agreement, renewal and notice clauses, incumbent plans and the owner’s preferred next use.', true],
        ['flared_surplus', 'Collected gas still flared', 'Request recent collected, flared and allocated gas logs, gas quality, equipment condition and rights to any usable surplus.'],
        ['idle_generation', 'Idle electricity project', 'Confirm why generation stopped, what equipment remains usable, continuing gas collection, permits and incumbent rights.'],
        ['interim_energy', 'Delayed project / interim energy', 'Confirm the competing project timetable, available gas rights, minimum usable term and removal or termination costs.'],
        ['procurement', 'Procurement window', 'Read the current owner notice, verify the submission time and time zone, permitted contact route and scope offered.', true],
        ['control_deadline', 'Applicable control / approval deadline', 'Verify current applicability and the exact deadline, then confirm the owner’s compliance plan, procurement path and capital responsibility.', true],
        ['owner_change', 'Cancelled bid / owner priorities changed', 'Check the original decision, what changed, the present decision maker and whether the owner wants to reopen discussions.'],
        ['capacity_gap', 'Contact route, capacity unknown', 'Confirm the contact’s current role and request dated meter or flare logs and an equipment list before estimating usable power.'],
        ['other_energy', 'Other surplus energy', 'Request interval availability, incumbent load priority, delivered charges, equipment scope and rights to use the remaining energy.']
    ];
    function text(v) { return v == null ? '' : String(v).trim(); }
    function clone(v) { return JSON.parse(JSON.stringify(v)); }
    function day(v) { if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return false; var d = new Date(v + 'T00:00:00Z'); return isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v; }
    function today(now) { var d = new Date(now == null ? Date.now() : now); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    function days(date, now) { return day(date) ? Math.round((Date.parse(date) - Date.parse(today(now))) / 86400000) : null; }
    function safeUrl(v) { try { var u = new URL(text(v)); return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u.href : null; } catch (_) { return null; } }
    function field(v, name, max, required) { var s = text(v); if (s.length > max || required && !s) throw Error(name + (required ? ' is required; use' : ': use') + ' at most ' + max + ' characters.'); return s; }
    function play(id) { return PLAYS.find(function (p) { return p[0] === id; }); }
    function state(site) {
        var s = site && site.custom_fields && site.custom_fields[KEY];
        if (s == null) return { v: 1, revision: 0, signals: [], history: [] };
        var ids = Object.create(null);
        if (!s || s.v !== 1 || !Number.isSafeInteger(s.revision) || s.revision < 0 || s.revision >= Number.MAX_SAFE_INTEGER || !Array.isArray(s.signals) || !Array.isArray(s.history) ||
            s.signals.some(function (e) { if (!e || !/^sg_[1-9]\d*$/.test(e.id) || ids[e.id] || Number(e.id.slice(3)) > s.revision || !play(e.play) || !e.claim || typeof e.captured_at !== 'string' || !isFinite(Date.parse(e.captured_at)) || !e.captured_by || !Array.isArray(e.reviews) || e.reviews.some(function (r) { return !r || !day(r.checked_on) || !r.by || !r.note || ['reviewed', 'rejected', 'withdrawn'].indexOf(r.decision) < 0; }) ||
                (e.status !== 'pending' && (!e.reviews.length || e.reviews[e.reviews.length - 1].decision !== e.status)) || (e.undated_source ? !!e.document_date : !day(e.document_date)) || (play(e.play)[3] && !day(e.event_on)) || (e.event_on && !day(e.event_on)) || (e.notice_on && !day(e.notice_on)) ||
                ['pending', 'reviewed', 'rejected', 'withdrawn'].indexOf(e.status) < 0 || !e.action || !day(e.action.due_on) || !e.action.owner || !e.action.description || ['open', 'done'].indexOf(e.action.status) < 0 || !Array.isArray(e.action.history)) return true; ids[e.id] = true; return false; })) return { error: 'This saved sourcing record is unreadable. Export the site backup before repairing it.' };
        return clone(s);
    }
    function apply(site, command, now) {
        if (!site || !site.id) return { ok: false, err: 'Save this prospect before recording a trigger.' };
        var s = state(site), c = command || {}, v = c.value || {}, on = today(now), at = new Date(now == null ? Date.now() : now).toISOString();
        if (s.error) return { ok: false, err: s.error };
        if (c.revision !== s.revision) return { ok: false, err: 'This sourcing record changed in another view. Your draft is preserved; reload the saved record before retrying.' };
        try {
            var by = field(v.by, 'Recorded / reviewed by', 120, true), e, event;
            if (c.type === 'add') {
                if (s.signals.length >= 150) throw Error('This site has 150 sourcing records. Export its history before planning an archive.');
                var p = play(v.play); if (!p) throw Error('Choose a sourcing trigger.');
                var url = field(v.source_url, 'Source URL', 2000, false), ref = field(v.document_ref, 'Private document reference', 600, false);
                if (url && !safeUrl(url)) throw Error('Use an http(s) source URL without embedded credentials.');
                if (!url && !ref) throw Error('Record the original source URL or a document reference.');
                var docDate = text(v.document_date), undated = v.undated_source === true;
                if (undated ? !!docDate : !day(docDate) || docDate > on) throw Error('Use the actual document date, or explicitly mark the source undated. Future publication dates are not allowed.');
                var eventOn = text(v.event_on), noticeOn = text(v.notice_on);
                if (p[3] && !day(eventOn) || eventOn && !day(eventOn) || noticeOn && !day(noticeOn)) throw Error('Use valid event and notice dates. Expiry, procurement and control deadlines require an event date.');
                if (noticeOn && eventOn && noticeOn > eventOn) throw Error('The notice / submission cutoff cannot follow the recorded event deadline. Check the original source.');
                if (!day(v.due_on)) throw Error('Give the verification action a valid due date.');
                e = { id: 'sg_' + (s.revision + 1), play: p[0], claim: field(v.claim, 'Reason to investigate now', 1200, true), source_url: url ? safeUrl(url) : '', document_ref: ref,
                    document_date: docDate, undated_source: undated, locator: field(v.locator, 'Page / clause / record locator', 400, true), site_match: field(v.site_match, 'Why this source matches this site', 700, true),
                    event_on: eventOn, notice_on: noticeOn, date_detail: field(v.date_detail, 'Exact time / time zone / date context', 500, false),
                    region: field(v.region, 'Site state / province', 60, false), captured_by: by, captured_at: at, status: 'pending', reviews: [],
                    action: { description: field(v.verification, 'Next verification action', 1000, true), owner: field(v.owner, 'Action owner', 120, true), due_on: v.due_on, status: 'open', history: [] } };
                if (s.signals.some(function (x) { return ['rejected', 'withdrawn'].indexOf(x.status) < 0 && x.play === e.play && x.claim === e.claim && x.source_url === e.source_url && x.document_ref === e.document_ref && x.locator === e.locator; })) throw Error('This source and claim are already recorded. Open the existing trigger.');
                s.signals.push(e); event = { type: 'captured', id: e.id };
            } else {
                e = s.signals.find(function (x) { return x.id === c.id; }); if (!e) throw Error('This trigger no longer exists.');
                var note = field(v.note, 'Review / action reason', 1200, true);
                if (c.type === 'review') {
                    if (['rejected', 'withdrawn'].indexOf(e.status) >= 0) throw Error('This trigger is archived. Add new evidence as a new record.');
                    if (['reviewed', 'rejected', 'withdrawn'].indexOf(v.decision) < 0 || v.decision === 'withdrawn' && e.status !== 'reviewed' || v.decision === 'rejected' && e.status !== 'pending') throw Error('Choose an available review decision.');
                    if (!day(v.checked_on) || v.checked_on > on || e.document_date && v.checked_on < e.document_date) throw Error('Use the date you checked the source, no earlier than publication and no later than today.');
                    if (e.reviews.length && v.checked_on < e.reviews[e.reviews.length - 1].checked_on) throw Error('A new review cannot predate the latest saved review. Retain older evidence in the review note.');
                    if (v.decision === 'reviewed' && (v.site_confirmed !== true || v.current_confirmed !== true)) throw Error('Confirm the physical site match and that the claim and dates were checked for current applicability.');
                    e.status = v.decision; e.reviews.push({ decision: v.decision, by: by, checked_on: v.checked_on, at: at, note: note });
                    event = { type: 'review', id: e.id, decision: e.status };
                } else if (c.type === 'action') {
                    if (['rejected', 'withdrawn'].indexOf(e.status) >= 0) throw Error('Archived triggers have no active verification task.');
                    var a = e.action, before = { status: a.status, due_on: a.due_on };
                    if (v.status === 'done' && a.status === 'open') a.status = 'done';
                    else if (v.status === 'open' && a.status === 'done') a.status = 'open';
                    else if (v.status === 'reschedule' && a.status === 'open') { if (!day(v.due_on) || v.due_on === a.due_on) throw Error('Choose a different valid due date.'); a.due_on = v.due_on; }
                    else throw Error('Choose an available action update.');
                    a.history.push({ before: before, status: a.status, due_on: a.due_on, by: by, at: at, note: note }); event = { type: 'action', id: e.id, outcome: v.status };
                } else throw Error('Unknown sourcing action.');
            }
            s.revision++; s.history.push(Object.assign(event, { by: by, at: at }));
            if (new TextEncoder().encode(JSON.stringify(s)).length > 350000) throw Error('This sourcing history is too large to save safely. Export the site and shorten the new entry.');
            return { ok: true, sourcing: s };
        } catch (err) { return { ok: false, err: err.message }; }
    }
    function region(site) { var s = state(site), last = !s.error && s.signals.slice().reverse().find(function (e) { return text(e.region); }); return last ? text(last.region) : text(site && site.jurisdiction); }
    function signal(site, e, now) {
        var review = e.reviews[e.reviews.length - 1], windowOn = e.notice_on || (play(e.play)[3] ? e.event_on : ''), windowDays = days(windowOn, now), dueDays = days(e.action.due_on, now);
        var fresh = e.status === 'reviewed' && review && review.decision === 'reviewed' && day(review.checked_on) && days(review.checked_on, now) >= -FRESH_DAYS && days(review.checked_on, now) <= 0;
        var phase = ['rejected', 'withdrawn'].indexOf(e.status) >= 0 ? 'archived' : !fresh ? 'review' : windowDays !== null && windowDays < 0 ? 'passed' : 'current';
        var open = e.action.status === 'open' && phase !== 'archived', upcoming = phase === 'current' && windowDays !== null && windowDays >= 0 && windowDays <= 30;
        var reason = phase === 'review' ? e.status === 'pending' ? 'Check the source and current applicability.' : 'Review is older than 90 days or has an invalid date; recheck the claim.' : phase === 'passed' ? 'The recorded window has passed; confirm the outcome or any extension.' : upcoming ? 'A reviewed date is within 30 days.' : open && dueDays < 0 ? 'The assigned verification action is overdue.' : 'Reviewed trigger; follow the saved next step.';
        var rank = phase === 'archived' ? 9 : phase === 'passed' ? 4 : upcoming ? 0 : open && dueDays < 0 ? 1 : phase === 'review' ? 2 : 3;
        return { id: e.id, prospect_id: site.id, name: site.name || site.id, region: text(e.region) || site.jurisdiction || '', stage: site.stage, play: e.play, claim: e.claim, phase: phase, review_status: e.status,
            window_on: windowOn, window_label: e.notice_on ? 'Notice / submission cutoff' : e.play === 'ppa_expiry' ? 'Agreement expiry' : 'Recorded deadline', window_days: windowDays, due_days: dueDays, action: clone(e.action), source_url: safeUrl(e.source_url), document_ref: e.document_ref, document_date: e.document_date,
            locator: e.locator, date_detail: e.date_detail, checked_on: review && review.checked_on || '', reason: reason, rank: rank,
            date_warning: windowOn && e.action.due_on > windowOn ? 'Verification is scheduled after the recorded window.' : '', action_open: open };
    }
    function filters(v) { v = v || {}; return { q: text(v.q).slice(0, 100), play: play(v.play) ? v.play : '', region: text(v.region).slice(0, 60), phase: ['current', 'review', 'passed'].indexOf(v.phase) >= 0 ? v.phase : '', horizon: ['30', '90', '180'].indexOf(String(v.horizon)) >= 0 ? String(v.horizon) : '' }; }
    function matches(row, f, lead) { var words = [row.name, row.claim, row.owner, row.region, row.action && row.action.owner, lead && row.cues.map(function (c) { return c.claim; }).join(' ')].join(' ').toLowerCase(); return (!f.q || words.includes(f.q.toLowerCase())) && (!f.region || String(row.region || '').toLowerCase().includes(f.region.toLowerCase())) && (!f.play || (lead ? row.cues.some(function (c) { return c.play === f.play; }) : row.play === f.play)) &&
        (!f.phase || (lead ? f.phase === 'review' : row.phase === f.phase)) && (!f.horizon || !lead && row.window_days !== null && row.window_days >= 0 && row.window_days <= Number(f.horizon)); }
    function queue(sites, filter, now) {
        var f = filters(filter), rows = [], errors = [];
        (sites || []).forEach(function (site) { var s = state(site); if (s.error) { errors.push({ id: site.id, name: site.name || site.id, error: s.error }); return; } if (['dead', 'closed_won'].indexOf(site.stage) >= 0) return;
            s.signals.forEach(function (e) { var row = signal(site, e, now); if (row.phase !== 'archived') rows.push(row); }); });
        var counts = { current: rows.filter(function (r) { return r.phase === 'current'; }).length, review: rows.filter(function (r) { return r.phase === 'review'; }).length, passed: rows.filter(function (r) { return r.phase === 'passed'; }).length, overdue: rows.filter(function (r) { return r.action_open && r.due_days < 0; }).length };
        return { rows: rows.filter(function (r) { return matches(r, f); }).sort(function (a, b) { return a.rank - b.rank || (a.window_on || a.action.due_on).localeCompare(b.window_on || b.action.due_on) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id); }), counts: counts, errors: errors };
    }
    function hash(filter) { var f = filters(filter), p = new URLSearchParams(); Object.keys(f).forEach(function (k) { if (f[k]) p.set(k, f[k]); }); return '#sourcing' + (p.toString() ? '?' + p.toString() : ''); }
    function fromHash(h) { return filters(Object.fromEntries(new URLSearchParams(String(h || '').split('?')[1] || ''))); }
    function searches(storage) { try { var raw = storage.getItem(SEARCH_KEY); if (!raw) return { _v: 1, revision: 0, items: [] }; var s = JSON.parse(raw), ids = Object.create(null);
        if (!s || s._v !== 1 || !Number.isSafeInteger(s.revision) || s.revision < 0 || !Array.isArray(s.items) || s.items.length > 20 || s.items.some(function (x) { if (!x || !/^search_\d+$/.test(x.id) || ids[x.id] || !text(x.name) || !x.filters) return true; ids[x.id] = true; return false; })) throw Error('Invalid searches'); return s;
    } catch (_) { return { error: 'Saved searches could not be read. Export the workspace backup before repairing them.' }; } }
    function saveSearch(storage, command) {
        var s = searches(storage), c = command || {}; if (s.error) return { ok: false, err: s.error }; if (c.revision !== s.revision) return { ok: false, err: 'Saved searches changed in another view. Reload the search choices.' };
        try { if (c.type === 'remove') { if (!s.items.some(function (x) { return x.id === c.id; })) throw Error('Select a saved search to remove.'); s.items = s.items.filter(function (x) { return x.id !== c.id; }); }
            else if (c.type === 'save') { var name = field(c.name, 'Search name', 80, true); if (s.items.length >= 20) throw Error('Remove a saved search before adding more than 20.'); if (s.items.some(function (x) { return x.name.toLowerCase() === name.toLowerCase(); })) throw Error('Choose a different search name.'); s.items.push({ id: 'search_' + (s.revision + 1), name: name, filters: filters(c.filters) }); }
            else throw Error('Unknown search action.'); s.revision++; storage.setItem(SEARCH_KEY, JSON.stringify(s)); return { ok: true, searches: s };
        } catch (e) { return { ok: false, err: 'Search not saved: ' + e.message }; }
    }
    function savedMatches(lead, sites) { return (sites || []).filter(function (s) { var d = s.discovery || {}; return lead.candidate_ids.indexOf(s.id) >= 0 || d.sourceId === 'lmop-landfill' && lead.candidate_ids.indexOf(d.sourceRecordId) >= 0; }); }
    function catalogue(leads, sites, filter) { var f = filters(filter); return (leads || []).map(function (lead) { return Object.assign({}, lead, { saved: savedMatches(lead, sites).map(function (s) { return { id: s.id, stage: s.stage, name: s.name }; }) }); }).filter(function (r) { return !r.saved.some(function (s) { return ['dead', 'closed_won'].indexOf(s.stage) >= 0; }) && matches(r, f, true); }); }
    return { KEY: KEY, SEARCH_KEY: SEARCH_KEY, FRESH_DAYS: FRESH_DAYS, PLAYS: PLAYS, play: play, state: state, apply: apply, region: region, signal: signal, queue: queue, filters: filters, matches: matches, hash: hash, fromHash: fromHash,
        searches: searches, saveSearch: saveSearch, savedMatches: savedMatches, catalogue: catalogue, today: today, days: days, safeUrl: safeUrl };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ProspectSourcing;
