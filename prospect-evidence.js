/* Source watches, retained excerpts and reviewed claims; commercial fields are never inferred. */
var ProspectEvidence = (function () {
    'use strict';
    var KEY = '_proton_evidence_inbox_v1';
    var S = typeof ProspectSourcing !== 'undefined' ? ProspectSourcing : require('./prospect-sourcing');
    var KINDS = [['minutes', 'Board agenda / minutes'], ['procurement', 'Procurement notice'], ['agreement', 'Existing agreement'], ['permit', 'Permit / application'], ['report', 'Environmental / annual report'], ['announcement', 'Operator announcement'], ['correspondence', 'Owner correspondence'], ['other', 'Other source']];
    var TOPICS = [['equipment', 'Equipment / remaining capital', /\b(generator|engine|switchgear|transformer|compressor|wellfield|flare|siloxane|capital|capex|refurbish|decommission|interconnect)\w*\b/i], ['gas', 'Gas flow / quality', /\b(mmscfd|scfm|mmbtu|methane|gas flow|gas collection|gas quality|hydrogen sulphide|hydrogen sulfide)\b/i], ['agreement', 'Agreement / notice date', /\b(ppa|power purchase|expir\w*|renew\w*|termination|notice period|exclusiv\w*)\b/i], ['procurement', 'Procurement / decision', /\b(rfp|rfq|solicitation|bid|award|cancel\w*|resolution|approv\w*)\b/i], ['contact', 'Contact / authority', /\b(director|manager|authorized|authorised|signatory|contact|commissioner)\b/i]];
    function text(v) { return v == null ? '' : String(v).trim(); }
    function clone(v) { return JSON.parse(JSON.stringify(v)); }
    function field(v, name, max, required) { var s = text(v); if (s.length > max || required && !s) throw Error(name + (required ? ' is required; use' : ': use') + ' at most ' + max + ' characters.'); return s; }
    function day(v) { if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return false; var d = new Date(v + 'T00:00:00Z'); return isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v; }
    function date(v, on, name) { if (!day(v) || v > on) throw Error(name + ' must be a valid date no later than today.'); return v; }
    function addDays(on, n) { var d = new Date(on + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
    function digest(v) { return /^[a-f0-9]{64}$/.test(v || ''); }
    function state(site) {
        var s = site && site.custom_fields && site.custom_fields[KEY];
        if (s == null) return { v: 1, revision: 0, documents: [], watches: [], history: [] };
        var ids = Object.create(null);
        function unique(id, prefix) { if (!new RegExp('^' + prefix + '[1-9]\\d*(?:_\\d+)?$').test(id || '') || ids[id]) return false; ids[id] = true; return true; }
        function invalidTriage(d) { return d.disposition && !['needs_review', 'reviewed', 'no_relevant_change', 'wrong_site'].includes(d.disposition) || d.triage != null && (!Array.isArray(d.triage) || d.triage.some(function (t) { return !t || !t.by || !t.note || !day(t.checked_on) || !['needs_review', 'no_relevant_change', 'wrong_site'].includes(t.decision); })); }
        if (!s || s.v !== 1 || !Number.isSafeInteger(s.revision) || s.revision < 0 || s.revision >= Number.MAX_SAFE_INTEGER || !Array.isArray(s.documents) || !Array.isArray(s.watches) || !Array.isArray(s.history) ||
            s.documents.some(function (d) { return !d || !unique(d.id, 'doc_') || !d.title || !d.organization || invalidTriage(d) || !Array.isArray(d.claims) || typeof d.excerpt !== 'string' || !d.captured_by || !isFinite(Date.parse(d.captured_at)) || !(d.source_url ? S.safeUrl(d.source_url) : d.document_ref) || (d.undated ? !!d.document_date : !day(d.document_date)) || d.claims.some(function (c) { return !c || !unique(c.id, 'cl_') || !c.claim || !c.locator || !c.passage || !Array.isArray(c.reviews) || ['pending', 'accepted', 'rejected', 'withdrawn'].indexOf(c.status) < 0 || c.reviews.some(function (r) { return !r || !day(r.checked_on) || !r.by || !r.note || ['accepted', 'rejected', 'withdrawn'].indexOf(r.decision) < 0; }) || (c.status !== 'pending' && (!c.reviews.length || c.reviews[c.reviews.length - 1].decision !== c.status)); }); }) ||
            s.watches.some(function (w) { return !w || !unique(w.id, 'watch_') || !w.title || !w.organization || !w.owner || !S.safeUrl(w.url) || !day(w.next_on) || [7, 14, 30].indexOf(w.cadence) < 0 || ['active', 'paused'].indexOf(w.status) < 0 || !Array.isArray(w.checks) || w.digest && !digest(w.digest) || w.checks.some(function (c) { return !c || !day(c.checked_on) || !c.by || ['changed', 'unchanged', 'unavailable'].indexOf(c.outcome) < 0; }); })) return { error: 'This evidence inbox could not be read. Export the site backup before repairing it.' };
        return clone(s);
    }
    function sourceDate(v, on) { var undated = v.undated === true, d = text(v.document_date); if (undated ? !!d : !day(d) || d > on) throw Error('Use the original document date, or explicitly mark it undated.'); return { undated: undated, document_date: d }; }
    function documentValue(v, id, by, at, on) {
        var url = field(v.source_url, 'Original source URL', 2000, false), ref = field(v.document_ref, 'Original document / retained copy reference', 600, false);
        if (url && !S.safeUrl(url) || !url && !ref) throw Error('Provide an http(s) original source URL or a retained document reference.');
        var excerpt = field(v.excerpt, 'Retained source text', 60000, false);
        if (!excerpt && !v.digest) throw Error('Retain an excerpt or a checked file fingerprint before adding this source.');
        if (v.digest && !digest(v.digest)) throw Error('The source fingerprint is invalid.');
        var kind = KINDS.find(function (k) { return k[0] === v.kind; }); if (!kind) throw Error('Select the document type.');
        return Object.assign({ id: id, title: field(v.title, 'Source title', 250, true), organization: field(v.organization, 'Issuing organization', 200, true), kind: kind[0], source_url: url ? S.safeUrl(url) : '', document_ref: ref,
            excerpt: excerpt, digest: v.digest || '', digest_basis: v.digest ? 'Imported source bytes; verify against the retained original' : '', site_hint: field(v.site_hint, 'Site match / ambiguity note', 800, true),
            watch_id: v.watch_id || '', captured_by: by, captured_at: at, disposition: 'needs_review', triage: [], claims: [] }, sourceDate(v, on));
    }
    function apply(site, command, now) {
        if (!site || !site.id) return { ok: false, err: 'Save the prospect before recording evidence.' };
        var s = state(site), c = command || {}, v = c.value || {}, on = S.today(now), at = new Date(now == null ? Date.now() : now).toISOString(), sourcing = null;
        if (s.error) return { ok: false, err: s.error };
        if (c.revision !== s.revision) return { ok: false, err: 'The evidence inbox changed in another view. Your draft is preserved; reload saved evidence before retrying.' };
        try {
            var by = field(v.by, 'Recorded / reviewed by', 120, true), event = { type: c.type, by: by, at: at }, d, claim, w, note;
            function sourceState() { if (sourcing) return sourcing; var saved = S.state(site); if (saved.error) throw Error(saved.error); return saved; }
            function sourceApply(command) { var r = S.apply(Object.assign({}, site, { custom_fields: Object.assign({}, site.custom_fields, { [S.KEY]: sourceState() }) }), command, now); if (!r.ok) throw Error(r.err); sourcing = r.sourcing; }
            if (c.type === 'capture') {
                d = documentValue(v, 'doc_' + (s.revision + 1), by, at, on);
                if (s.documents.some(function (x) { return x.source_url === d.source_url && x.document_ref === d.document_ref && x.excerpt === d.excerpt && x.document_date === d.document_date && x.digest === d.digest; })) throw Error('This source snapshot is already in the inbox. Add a finding to that record.');
                s.documents.push(d); event.id = d.id;
            } else if (c.type === 'claim') {
                d = s.documents.find(function (x) { return x.id === c.document_id; }); if (!d) throw Error('The source document no longer exists.');
                if (['wrong_site', 'no_relevant_change'].includes(d.disposition)) throw Error('Reopen this document for review before adding a finding.');
                var passage = field(v.passage, 'Exact supporting passage', 1600, true);
                if (!d.excerpt.includes(passage)) throw Error('The supporting passage must occur exactly in the retained source text. Capture an additional excerpt if needed.');
                if (!TOPICS.some(function (t) { return t[0] === v.topic; })) throw Error('Choose a finding topic.');
                claim = { id: 'cl_' + (s.revision + 1), topic: v.topic, claim: field(v.claim, 'Finding to review', 1200, true), passage: passage, locator: field(v.locator, 'Original page / section / clause', 400, true), status: 'pending', reviews: [], sourcing_id: '' };
                if (d.claims.some(function (x) { return x.claim === claim.claim && x.passage === passage && x.locator === claim.locator; })) throw Error('This finding is already recorded.');
                d.claims.push(claim); d.disposition = 'needs_review'; event.id = claim.id; event.document_id = d.id;
            } else if (c.type === 'triage') {
                d = s.documents.find(function (x) { return x.id === c.document_id; }); if (!d) throw Error('The source document no longer exists.');
                date(v.checked_on, on, 'Document review date');
                if (!['needs_review', 'no_relevant_change', 'wrong_site'].includes(v.decision)) throw Error('Choose an available document review outcome.');
                if (v.decision !== 'needs_review' && d.claims.some(function (x) { return ['pending', 'accepted'].includes(x.status); })) throw Error('Resolve or withdraw the document’s active findings before dismissing it.');
                var triage = d.triage || [], lastTriage = triage[triage.length - 1];
                if (d.document_date && v.checked_on < d.document_date || lastTriage && v.checked_on < lastTriage.checked_on) throw Error('Document review cannot predate the source or its latest review.');
                d.disposition = v.decision; triage.push({ by: by, checked_on: v.checked_on, at: at, decision: v.decision, note: field(v.note, 'Document review reason', 1200, true) }); d.triage = triage; event.id = d.id; event.decision = v.decision;
            } else if (c.type === 'review' || c.type === 'task') {
                d = s.documents.find(function (x) { return x.id === c.document_id; }); claim = d && d.claims.find(function (x) { return x.id === c.claim_id; }); if (!claim) throw Error('This finding no longer exists.');
                event.id = claim.id; event.document_id = d.id;
                if (c.type === 'review') {
                    note = field(v.note, 'Review result / correction reason', 1200, true); date(v.checked_on, on, 'Review date');
                    var last = claim.reviews[claim.reviews.length - 1];
                    if (d.document_date && v.checked_on < d.document_date || last && v.checked_on < last.checked_on) throw Error('A review cannot predate the document or the latest saved review.');
                    if (['rejected', 'withdrawn'].includes(claim.status)) throw Error('Archived findings retain their history. Capture a new finding for new evidence.');
                    if (v.decision === 'accepted') {
                        if (v.source_checked !== true || v.site_confirmed !== true || !text(v.match_reason)) throw Error('Confirm the original source and exact physical site / organization match, with a reason.');
                    } else if (!(v.decision === 'rejected' && claim.status === 'pending' || v.decision === 'withdrawn' && claim.status === 'accepted')) throw Error('Choose an available review decision.');
                    if (v.decision === 'withdrawn' && claim.sourcing_id) {
                        var ss = sourceState(), linked = ss.signals.find(function (x) { return x.id === claim.sourcing_id; }); if (!linked) throw Error('The linked sourcing trigger is missing. Reconcile the sourcing record before withdrawing this finding.');
                        if (['pending', 'reviewed'].includes(linked.status)) sourceApply({ revision: ss.revision, type: 'review', id: linked.id, value: { by: by, decision: linked.status === 'pending' ? 'rejected' : 'withdrawn', checked_on: v.checked_on, note: 'Evidence finding withdrawn: ' + note } });
                    }
                    claim.status = v.decision; claim.reviews.push({ by: by, checked_on: v.checked_on, at: at, decision: v.decision, note: note, match_reason: field(v.match_reason, 'Physical site match reason', 800, v.decision === 'accepted') }); event.decision = v.decision;
                    d.disposition = d.claims.some(function (x) { return x.status === 'pending'; }) ? 'needs_review' : 'reviewed';
                } else {
                    if (['dead', 'closed_won'].includes(site.stage)) throw Error('This prospect is closed. Reopen it through the Board before creating a verification task.');
                    if (claim.status !== 'accepted') throw Error('Review and accept the finding before creating a sourcing task.');
                    if (claim.sourcing_id) throw Error('This finding already has a sourcing task. Open that prospect to update it.');
                    var accepted = claim.reviews[claim.reviews.length - 1], reviewAge = S.days(accepted.checked_on, now); if (reviewAge === null || reviewAge < -90 || reviewAge > 0) throw Error('The finding needs a current review date within the last 90 days before creating a task.');
                    var current = sourceState();
                    sourceApply({ type: 'add', revision: current.revision, value: { by: by, play: v.play, region: v.region || S.region(site), claim: claim.claim, source_url: d.source_url, document_ref: d.document_ref || ('Evidence inbox ' + d.id + ' / ' + claim.id), document_date: d.document_date, undated_source: d.undated, locator: claim.locator, site_match: accepted.match_reason, event_on: v.event_on, notice_on: v.notice_on, date_detail: v.date_detail, verification: v.verification, owner: v.owner, due_on: v.due_on } });
                    claim.sourcing_id = sourcing.signals[sourcing.signals.length - 1].id; event.sourcing_id = claim.sourcing_id;
                }
            } else if (c.type === 'watch') {
                if (['dead', 'closed_won'].includes(site.stage)) throw Error('Reopen this closed prospect before adding an active source watch.');
                if (!S.safeUrl(v.url)) throw Error('Use the original http(s) source URL without embedded credentials.');
                if (!day(v.next_on) || ![7, 14, 30].includes(Number(v.cadence))) throw Error('Choose a next check date and a 7, 14 or 30 day interval.');
                if (s.watches.some(function (x) { return x.url === S.safeUrl(v.url); })) throw Error('This source is already watched for this site. Resume or update the existing watch.');
                w = { id: 'watch_' + (s.revision + 1), title: field(v.title, 'Watch title', 250, true), organization: field(v.organization, 'Issuing organization', 200, true), url: S.safeUrl(v.url), owner: field(v.owner, 'Responsible person', 120, true), match_note: field(v.match_note, 'Site / organization relevance', 800, true), cadence: Number(v.cadence), next_on: v.next_on, status: 'active', digest: '', checks: [] }; s.watches.push(w); event.id = w.id;
            } else if (c.type === 'watch_update' || c.type === 'check') {
                w = s.watches.find(function (x) { return x.id === c.watch_id; }); if (!w) throw Error('The source watch no longer exists.'); event.id = w.id;
                note = field(v.note, 'Check result / change reason', 1200, true);
                if (c.type === 'watch_update') {
                    if (!['active', 'paused'].includes(v.status) || !day(v.next_on)) throw Error('Choose an active/paused state and a valid next check date.');
                    event.before = { status: w.status, next_on: w.next_on }; w.status = v.status; w.next_on = v.next_on; event.note = note;
                } else {
                    date(v.checked_on, on, 'Check date'); if (w.status !== 'active') throw Error('Resume this source watch before logging a check.');
                    if (!['changed', 'unchanged', 'unavailable'].includes(v.outcome)) throw Error('Choose the observed check result.');
                    if (w.checks.length && v.checked_on < w.checks[w.checks.length - 1].checked_on) throw Error('This check predates the latest saved check.');
                    w.checks.push({ checked_on: v.checked_on, by: by, at: at, outcome: v.outcome, note: note, method: 'manual' }); if (v.outcome !== 'unavailable') w.next_on = addDays(v.checked_on, w.cadence); event.outcome = v.outcome;
                }
            } else if (c.type === 'import_checks') {
                if (!Array.isArray(v.results) || !v.results.length || v.results.length > 30) throw Error('Import between 1 and 30 checks for one site.');
                var count = 0;
                v.results.forEach(function (r, i) {
                    if (!r || r.site_id !== site.id || !digest(r.check_id)) throw Error('An imported result has a different site or invalid check identifier.');
                    w = s.watches.find(function (x) { return x.id === r.watch_id; }); if (!w || w.url !== r.url || w.status !== 'active') throw Error('An imported result does not match an active saved source watch.');
                    if (w.checks.some(function (x) { return x.check_id === r.check_id; })) return;
                    if ((r.previous_digest || '') !== w.digest) throw Error('The source baseline changed after this export. Run a fresh check.');
                    date(r.checked_on, on, 'Imported check date'); if (w.checks.length && r.checked_on < w.checks[w.checks.length - 1].checked_on) throw Error('An imported check predates the latest saved check.');
                    if (!['changed', 'unchanged', 'unavailable'].includes(r.outcome)) throw Error('The imported outcome is invalid.');
                    if (r.outcome !== 'unavailable' && (!digest(r.digest) || r.outcome !== (r.digest === w.digest ? 'unchanged' : 'changed'))) throw Error('The imported content fingerprint and change result disagree.');
                    var check = { checked_on: r.checked_on, by: by, at: at, outcome: r.outcome, note: field(r.note, 'Imported result note', 1200, true), method: 'public source check', check_id: r.check_id };
                    if (r.outcome === 'changed') {
                        d = documentValue({ title: w.title.slice(0, 210) + ' — source snapshot ' + r.checked_on, organization: w.organization, source_url: r.final_url || w.url, document_ref: r.archive_ref, document_date: '', undated: true, kind: 'other', excerpt: r.text || '', digest: r.digest, site_hint: w.match_note.slice(0, 750) + ' — site applicability not yet confirmed.', watch_id: w.id }, 'doc_' + (s.revision + 1) + '_' + i, by, at, on);
                        s.documents.push(d); check.document_id = d.id;
                    }
                    w.checks.push(check); if (r.outcome !== 'unavailable') { w.digest = r.digest; w.next_on = addDays(r.checked_on, w.cadence); } count++;
                });
                if (!count) return { ok: true, unchanged: true, evidence: s, fields: clone(site.custom_fields || {}) };
                event.count = count;
            } else throw Error('Unknown evidence inbox action.');
            s.revision++; s.history.push(event);
            if (s.documents.length > 80 || s.watches.length > 30 || new TextEncoder().encode(JSON.stringify(s)).length > 600000) throw Error('This site inbox is full. Export the site backup before planning an archive; this draft has not been saved.');
            var fields = Object.assign({}, site.custom_fields || {}, { [KEY]: s }); if (sourcing) fields[S.KEY] = sourcing;
            return { ok: true, evidence: s, fields: fields, event: event };
        } catch (e) { return { ok: false, err: e.message }; }
    }
    function passages(value) {
        var input = text(value).slice(0, 60000), out = [], seen = Object.create(null), lines = input.split(/\r?\n/);
        lines.forEach(function (line, i) { var matches = TOPICS.filter(function (t) { return t[2].test(line); }); if (!matches.length || !text(line) || seen[line]) return; seen[line] = true;
            out.push({ passage: line.trim().slice(0, 1600), line: i + 1, topics: matches.map(function (t) { return t[0]; }), dates: [...new Set(line.match(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi) || [])], ambiguity: 'Keyword match only. Dates, amounts, scope, negation and physical site require review.' }); }); return out.slice(0, 30);
    }
    function matching(value, sites) { var input = text(value).toLowerCase(); return (sites || []).map(function (s) { var d = s.discovery || {}, keys = [s.id, d.sourceRecordId, d.stableSourceRecordId].filter(function (x) { return x && String(x).length >= 5 && input.includes(String(x).toLowerCase()); }), name = text(s.name).length >= 6 && input.includes(text(s.name).toLowerCase()), org = text(s.operator).length >= 8 && input.includes(text(s.operator).toLowerCase()); return { id: s.id, name: s.name || s.id, basis: keys.length ? 'Source identifier mentioned' : name ? 'Site name mentioned' : org ? 'Organization only; physical site ambiguous' : '', rank: keys.length ? 0 : name ? 1 : 2 }; }).filter(function (x) { return x.basis; }).sort(function (a, b) { return a.rank - b.rank || a.name.localeCompare(b.name); }); }
    function queue(sites, filter, now) {
        var f = filter || {}, docs = [], watches = [], errors = [];
        (sites || []).forEach(function (site) { var s = state(site); if (s.error) { errors.push({ id: site.id, name: site.name || site.id, error: s.error }); return; }
            function matches(row) { return (!f.site || f.site === site.id) && (!f.q || [site.name, row.title, row.organization, row.excerpt].join(' ').toLowerCase().includes(text(f.q).toLowerCase())); }
            s.documents.forEach(function (d) { var pending = d.disposition === 'needs_review' || (!d.disposition && !d.claims.length) || d.claims.some(function (c) { return c.status === 'pending'; }); if (matches(d) && (!f.phase || f.phase === 'pending' && pending || f.phase === 'reviewed' && !pending)) docs.push({ site_id: site.id, site_name: site.name || site.id, document: d, pending: pending }); });
            if (['dead', 'closed_won'].includes(site.stage)) return;
            s.watches.forEach(function (w) { if (!matches(w)) return; var last = w.checks[w.checks.length - 1], failed = last && last.outcome === 'unavailable', due = S.days(w.next_on, now); watches.push({ site_id: site.id, site_name: site.name || site.id, watch: w, failed: !!failed, due_days: due, needs_check: w.status === 'active' && (failed || due <= 0) }); }); });
        docs.sort(function (a, b) { return Number(b.pending) - Number(a.pending) || b.document.captured_at.localeCompare(a.document.captured_at); }); watches.sort(function (a, b) { return Number(b.needs_check) - Number(a.needs_check) || a.watch.next_on.localeCompare(b.watch.next_on); });
        return { documents: docs, watches: watches, errors: errors, pending: docs.filter(function (d) { return d.pending; }).length, due: watches.filter(function (w) { return w.needs_check; }).length, overdue: watches.filter(function (w) { return w.watch.status === 'active' && (w.failed || w.due_days < 0); }).length, today: watches.filter(function (w) { return w.watch.status === 'active' && w.due_days === 0; }).length };
    }
    function exportWatches(sites, now) { return { v: 1, type: 'proton-evidence-watchlist', exported_at: new Date(now == null ? Date.now() : now).toISOString(), sources: queue(sites, {}, now).watches.filter(function (r) { return r.watch.status === 'active'; }).map(function (r) { return { site_id: r.site_id, watch_id: r.watch.id, url: r.watch.url, previous_digest: r.watch.digest, next_on: r.watch.next_on }; }) }; }
    return { KEY: KEY, KINDS: KINDS, TOPICS: TOPICS, state: state, apply: apply, passages: passages, matching: matching, queue: queue, exportWatches: exportWatches, today: S.today, safeUrl: S.safeUrl };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ProspectEvidence;
