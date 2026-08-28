/* ===== Project data model =====
 *
 * A PROSPECT is a site you are researching. A PROJECT is a site you have decided to spend real
 * money on. Promotion is the moment that decision is made, and it is deliberate: nothing is
 * promoted automatically, because the act of promoting is the act of committing capital.
 *
 * A SIDECAR, KEYED BY ITS OWN ID. Two reasons, both measured rather than assumed.
 *
 *   Not fields on the prospect record: site-model.js normalize() copies only keys present on
 *   blankSite() and silently drops the rest. Adding ONE field to that template this session
 *   required bumping three pages' asset stamps, because a browser holding a stale site-model.js
 *   would strip it on the next save. The payload here is a budget ledger and a procurement
 *   schedule; the same failure would drop a project's financial history.
 *
 *   Not keyed by prospect_id: data/landfills.json carries 30 duplicated ids across 1,908 rows,
 *   and map-sourcing.js:4191 states outright that "prospect ids change when a catalog is
 *   rebuilt". Keying a ledger on an id that both collides and churns is keying it on nothing.
 *   prospect_id is recorded as a LABEL, not as a key.
 *
 * THE COLLECTIONS ARE MAPS, NOT ARRAYS, and that is a sync decision rather than a style one.
 * sync.js writes each store as one Firestore document with ref.set(payload, { merge: true }).
 * merge deep-merges nested MAPS and replaces ARRAYS wholesale. As arrays, two devices each
 * appending a budget line would produce a document holding one of the two lists and no error;
 * as maps keyed by id, the same two writes set-union. The shape defeats last-write-wins, rather
 * than the transport being asked to.
 *
 * Three consequences follow from that and are load-bearing:
 *
 *   NOTHING DERIVED IS PERSISTED. budget_committed is a sum of lines, computed on read. Stored,
 *   a merge could leave a total that disagrees with the lines that produce it -- and a total
 *   that disagrees with its own detail is worse than no total, because it looks authoritative.
 *
 *   DELETION IS A TOMBSTONE. Firestore's merge never removes a map key, so a locally deleted
 *   project simply survives in the cloud and returns on the next pull with its full ledger and
 *   no record of having been deleted. Deleting is therefore a value written, not a key removed.
 *
 *   SIZE IS GATED BEFORE THE WRITE. sync.js maps one store to one document and Firestore's hard
 *   ceiling is 1 MiB. Measured on a realistic 18-month build -- 120 budget lines, 160
 *   procurement items, 55 change orders, 18 contractors, 190 pay applications -- a project is
 *   about 155 KB, so five fill three quarters of the document. The gate refuses at 500 KB and
 *   warns at 60%, so the signal arrives with room to act rather than at the wall.
 */
var ProjectData = (function () {
    'use strict';

    var KEY = 'protonMiningProjects';
    var VERSION = 1;

    /* THE EIGHT GATES, which are the build sequence and not the CRM pipeline.
     *
     * site-model.js already owns two stage vocabularies: STAGES (the conversation -- unreviewed,
     * contacted, in_discussion...) and DEVELOPMENT_STAGES (the asset as sourced -- raw_resource,
     * permitted, constructed...). This is a third axis and it is the only one that describes
     * WORK BEING DONE rather than a state observed.
     *
     * permitting_complete is named for what it asserts, not for the activity. A gate called
     * 'permitting' invites advancing when the work starts, and advancing there flips
     * site-capex's STAGE_RETAINED so a $160,000 flat permitting cost stops being charged and
     * MONTHS_TO_REVENUE drops from 12-24 to 8-14 -- while the permit is still outstanding and
     * still being paid for. The gate is the permit being ISSUED.
     *
     * 'operating' is a terminal state, not a gate: it is what a project becomes when the last
     * gate closes and it hands off to operations. It carries no deliverables. */
    var GATES = [
        'target_screen',
        'contact_loi',
        'diligence',
        'agreements',
        'permitting_complete',
        'engineering_procurement',
        'construction',
        'commissioning',
        'operating',
        'cancelled'
    ];
    var FIRST_GATE = 'target_screen';

    /* The many-per-project collections. Created empty at promotion so a Stage 4 build can write
       into them without guarding, and named here so normalizeProject() can guarantee they exist
       on a record written by an older build. */
    var COLLECTIONS = ['budget_lines', 'procurement', 'contractors',
                       'change_orders', 'pay_apps', 'milestones'];

    // Firestore's document ceiling is 1 MiB. These are bytes of serialised JSON, before
    // Firestore's own per-field name and type overhead, which is why the gate is well under it.
    var SIZE_REFUSE = 500 * 1024;
    var SIZE_NOTICE = Math.round(SIZE_REFUSE * 0.6);

    /* THE CACHE IS GUARDED BY THE STRING IT WAS PARSED FROM.
     *
     * A bare `if (_cache) return _cache` is what crm-log.js does, and it has two failure modes
     * this store cannot afford. It mutates the cached object by reference before the write, so a
     * rejected write leaves the row in memory and on screen as though it saved. And sync.js:135
     * rewrites localStorage from a remote snapshot without touching any module cache -- the
     * 'storage' event that the app's only cache invalidation hangs off does NOT fire in the tab
     * that performed the write, and that tab is sync.js.
     *
     * Comparing the raw string costs no parse and closes both: a cache that did not come from
     * what is currently in storage is not used. */
    var _cache = null, _raw = null, _blocked = null;

    function nowIso() { return new Date().toISOString(); }

    function newId() {
        var s = '';
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            var a = new Uint8Array(6);
            crypto.getRandomValues(a);
            for (var i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2);
        } else {
            // Matching crm-log.js:75: a readable marker rather than a Math.random that pretends
            // to be unique. A collision in a ledger is not a thing to debug later.
            s = 'noRng' + Date.now().toString(36);
        }
        return 'proj_' + s;
    }

    function empty() { return { _v: VERSION, seq: 0, byProject: {} }; }

    function num(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = Number(v);
        return isFinite(n) ? n : null;
    }
    function text(v, max) {
        if (v === null || v === undefined) return null;
        var s = String(v).trim();
        if (!s) return null;
        return max ? s.slice(0, max) : s;
    }
    function isDay(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v); }

    /* NO KEY WHITELIST, deliberately, and this is the opposite of site-model.js:250.
     *
     * normalize() there copies only keys present on blankSite() and drops everything else, which
     * is right for a record with a fixed shape and wrong for one that grows a budget ledger in
     * Stage 4 and a procurement schedule in Stage 6. A browser holding a stale project-model.js
     * would strip the fields it does not know and write the stripped object back -- and with
     * sync working, push it to every other device. So unknown keys are carried through
     * untouched; this function fills what is missing and coerces what it owns. */
    function normalizeProject(partial) {
        var p = {};
        var src = (partial && typeof partial === 'object') ? partial : {};
        for (var k in src) {
            if (Object.prototype.hasOwnProperty.call(src, k)) p[k] = src[k];
        }

        p.id = text(p.id) || newId();
        p.seq = typeof p.seq === 'number' ? p.seq : 0;
        p.created = text(p.created) || nowIso();
        p.updated = text(p.updated) || p.created;

        // The snapshot. Frozen at promotion; nothing re-reads it from the prospect.
        var s = (p.prospect && typeof p.prospect === 'object') ? p.prospect : {};
        p.prospect = {
            prospect_id: text(s.prospect_id),
            name: text(s.name, 120),
            lat: num(s.lat),
            lng: num(s.lng),
            // Copied verbatim rather than validated against SiteData.SOURCES: a snapshot records
            // what was there. Coercing it to a known enum would turn a record into an assertion.
            source: text(s.source),
            /* The development_stage that priced the sanction. site-capex reads STAGE_RETAINED and
               MONTHS_TO_REVENUE off it, so a later edit to the prospect must not silently reprice
               a budget that was already committed against the old value. */
            development_stage: text(s.development_stage),
            captured_at: text(s.captured_at) || p.created
        };

        p.name = text(p.name, 120) || p.prospect.name || p.id;
        p.gate = GATES.indexOf(p.gate) >= 0 ? p.gate : FIRST_GATE;
        p.gate_entered_at = text(p.gate_entered_at) || p.created;

        p.capacity_kw = num(p.capacity_kw);
        p.annual_cost_of_capital_pct = num(p.annual_cost_of_capital_pct);
        p.budget_authorised_usd = num(p.budget_authorised_usd);
        p.target_energization = isDay(p.target_energization) ? p.target_energization : null;

        p.cancelled_at = text(p.cancelled_at);
        p.cancelled_reason = text(p.cancelled_reason);
        // The tombstone. Set rather than removing the key, because Firestore's merge cannot
        // express a key removal and would resurrect the project on the next pull.
        p.deleted_at = text(p.deleted_at);
        p.deleted_reason = text(p.deleted_reason);

        p.notes = typeof p.notes === 'string' ? p.notes : '';

        // Maps, not arrays -- see the header. Guaranteed present so a later build can write into
        // them without guarding, and repaired if an older record arrives without them.
        for (var c = 0; c < COLLECTIONS.length; c++) {
            var name = COLLECTIONS[c];
            if (!p[name] || typeof p[name] !== 'object' || Array.isArray(p[name])) p[name] = {};
        }
        return p;
    }

    /* A VERSION FROM THE FUTURE IS REFUSED, NOT MIGRATED, matching backup.js. A build that reads
       a record it does not understand and writes it back is how a field is destroyed for every
       device at once, now that sync works. Refusing leaves the data intact and says why. */
    function read() {
        var raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { return empty(); }
        if (_cache && raw === _raw) return _cache;

        if (!raw) { _cache = empty(); _raw = raw; _blocked = null; return _cache; }
        var parsed;
        try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
        if (!parsed || typeof parsed !== 'object' || typeof parsed.byProject !== 'object') {
            _cache = empty(); _raw = raw; _blocked = null; return _cache;
        }
        if (typeof parsed._v === 'number' && parsed._v > VERSION) {
            _blocked = { have: parsed._v, want: VERSION };
            _cache = empty(); _raw = raw;
            return _cache;
        }
        _blocked = null;
        var out = { _v: VERSION, seq: typeof parsed.seq === 'number' ? parsed.seq : 0, byProject: {} };
        for (var id in parsed.byProject) {
            if (!Object.prototype.hasOwnProperty.call(parsed.byProject, id)) continue;
            var p = normalizeProject(parsed.byProject[id]);
            p.id = id;
            out.byProject[id] = p;
            if (p.seq > out.seq) out.seq = p.seq;
        }
        _cache = out; _raw = raw;
        return out;
    }

    // Mutate this, never the cache. A rejected write must leave nothing behind.
    function draft() { return JSON.parse(JSON.stringify(read())); }

    function sizeOf(next) { return JSON.stringify(next).length; }

    /* The gate, with a message that names what to do. "Storage full" with no next step is how
       people lose data trying things. */
    function sizeVerdict(bytes, next) {
        if (bytes < SIZE_NOTICE) return { ok: true, err: null, notice: null };
        var kb = Math.round(bytes / 1024);
        var big = Object.keys(next.byProject)
            .map(function (id) {
                return { name: next.byProject[id].name || id,
                         kb: Math.round(JSON.stringify(next.byProject[id]).length / 1024) };
            })
            .sort(function (a, b) { return b.kb - a.kb; })
            .slice(0, 3)
            .map(function (p) { return p.name + ' (' + p.kb + ' KB)'; })
            .join(', ');
        if (bytes >= SIZE_REFUSE) {
            return { ok: false, notice: null, err:
                'Not saved: your projects would total ' + kb + ' KB, over the ' +
                Math.round(SIZE_REFUSE / 1024) + ' KB limit for one synced store. Largest: ' +
                big + '. Archive a completed project, or ask for the store to be split so each ' +
                'project syncs separately.' };
        }
        return { ok: true, err: null, notice:
            'Projects are at ' + kb + ' KB of ' + Math.round(SIZE_REFUSE / 1024) +
            ' KB. Largest: ' + big + '. Still fine — worth archiving a completed project before ' +
            'it becomes urgent.' };
    }

    function commit(next) {
        if (_blocked) {
            return { ok: false, err: 'This device is running an older build (reads version ' +
                     _blocked.want + ', your projects are version ' + _blocked.have +
                     '). Nothing was saved. Update the page and try again.' };
        }
        var s;
        try { s = JSON.stringify(next); } catch (e) {
            return { ok: false, err: 'Could not encode the project.' };
        }
        var verdict = sizeVerdict(s.length, next);
        if (!verdict.ok) return { ok: false, err: verdict.err };

        try { localStorage.setItem(KEY, s); } catch (e) {
            return { ok: false, err: (e && (e.name === 'QuotaExceededError' || e.code === 22))
                ? 'Local storage is full — this was NOT saved. Export your data first.'
                : 'Could not save to this device.' };
        }
        // Cache only after the write succeeded, so a failure cannot leave a phantom on screen.
        _cache = next; _raw = s;
        if (typeof SyncEngine !== 'undefined' && SyncEngine.save) {
            try { SyncEngine.save('projects', next); } catch (e) { /* the local write stands */ }
        }
        return { ok: true, err: null, notice: verdict.notice };
    }

    // ---- reads -------------------------------------------------------------------------
    function getData() { return read(); }
    function blocked() { return _blocked; }

    function live(p) { return p && !p.deleted_at; }

    function list() {
        var d = read(), out = [];
        for (var id in d.byProject) {
            if (!Object.prototype.hasOwnProperty.call(d.byProject, id)) continue;
            if (live(d.byProject[id])) out.push(d.byProject[id]);
        }
        return out.sort(function (a, b) { return (a.seq || 0) - (b.seq || 0); });
    }

    function get(id) {
        var p = read().byProject[String(id)];
        return live(p) ? p : null;
    }

    function forProspect(prospectId) {
        var pid = String(prospectId);
        return list().filter(function (p) { return p.prospect.prospect_id === pid; });
    }

    /* What SiteData.remove() asks before it refuses. Cancelled does not count: a cancelled
       project is a decision already taken, and its prospect should be deletable again. */
    function hasLive(prospectId) {
        return forProspect(prospectId).some(function (p) { return p.gate !== 'cancelled'; });
    }

    // ---- writes ------------------------------------------------------------------------

    /* PROMOTION. Refuses rather than defaults on every one of these, because each is a number
       somebody will later be held to.
       - capacity_kw sizes every per-kW cost in the capex stack.
       - annual_cost_of_capital_pct is the largest single line on an 18-30 month build and
         site-capex ships it null, reporting carrying cost as unknown. A project that does not
         know its cost of capital is a project that cannot say what it costs to wait.
       - budget_authorised_usd is the control total Stage 3's ledger measures against. */
    function promote(prospectId, fields) {
        var f = fields || {};
        if (!prospectId) return { ok: false, err: 'A project needs a prospect.' };
        if (typeof SiteData === 'undefined' || !SiteData.get) {
            return { ok: false, err: 'The site model is not loaded.' };
        }
        var rec = SiteData.get(String(prospectId));
        if (!rec) return { ok: false, err: 'No such prospect.' };

        /* One live project per prospect. Two are structurally valid -- the project mints its own
           id -- so nothing else would stop a double-click, or a second promotion on a device
           that has not pulled the first one yet. */
        var existing = forProspect(prospectId).filter(function (p) { return p.gate !== 'cancelled'; })[0];
        if (existing) {
            return { ok: false, err: 'This prospect is already project ' + existing.id +
                     ' (' + existing.name + '), started ' + existing.created.slice(0, 10) + '.' };
        }

        var kw = num(f.capacity_kw);
        if (kw === null || kw <= 0) return { ok: false, err: 'A project needs a usable capacity in kW.' };
        var coc = num(f.annual_cost_of_capital_pct);
        if (coc === null || coc <= 0 || coc > 100) {
            return { ok: false, err: 'A project needs an annual cost of capital, as a percentage.' };
        }
        var budget = num(f.budget_authorised_usd);
        if (budget === null || budget < 0) {
            return { ok: false, err: 'A project needs an authorised budget.' };
        }
        if (f.target_energization !== undefined && f.target_energization !== null &&
            f.target_energization !== '' && !isDay(f.target_energization)) {
            return { ok: false, err: 'Target energization must be a date, as YYYY-MM-DD.' };
        }

        var d = draft();
        d.seq = (d.seq || 0) + 1;
        var p = normalizeProject({
            id: newId(),
            seq: d.seq,
            name: text(f.name, 120) || text(rec.name, 120),
            capacity_kw: kw,
            annual_cost_of_capital_pct: coc,
            budget_authorised_usd: budget,
            target_energization: isDay(f.target_energization) ? f.target_energization : null,
            notes: typeof f.notes === 'string' ? f.notes : '',
            prospect: {
                prospect_id: String(prospectId),
                name: rec.name,
                lat: rec.latitude,
                lng: rec.longitude,
                source: rec.source,
                development_stage: rec.development_stage,
                captured_at: nowIso()
            }
        });
        d.byProject[p.id] = p;

        var res = commit(d);
        if (!res.ok) return { ok: false, err: res.err };

        /* Logged AFTER the write, for the reason site-model.js:364 gives about stage
           transitions: a log entry with no record is a lie, a record with no log entry is a gap,
           and a gap is the lesser of the two. The kind is checked because CrmLog.KINDS is a
           validated whitelist that fails closed -- an unregistered kind returns { ok:false } and
           writes nothing, which would otherwise be invisible here. */
        var logged = null;
        if (typeof CrmLog !== 'undefined' && CrmLog.append) {
            logged = CrmLog.append('note', String(prospectId), {
                body: 'Promoted to project ' + p.id,
                project_id: p.id
            });
        }
        return { ok: true, err: null, project: p, notice: res.notice,
                 logged: !!(logged && logged.ok) };
    }

    /* Minted and snapshot fields are refused by NAME rather than stripped. Silently dropping a
       key the caller believed it set is the same class of bug as the whitelist this file exists
       to avoid. */
    var SEALED = ['id', 'seq', 'created', 'prospect', 'gate', 'gate_entered_at',
                  'deleted_at', 'deleted_reason'].concat(COLLECTIONS);

    function update(id, patch) {
        var d = draft();
        var p = d.byProject[String(id)];
        if (!p || p.deleted_at) return { ok: false, err: 'No such project.' };
        patch = patch || {};
        for (var i = 0; i < SEALED.length; i++) {
            if (Object.prototype.hasOwnProperty.call(patch, SEALED[i])) {
                return { ok: false, err: SEALED[i] + ' cannot be changed through update().' };
            }
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'capacity_kw')) {
            var kw = num(patch.capacity_kw);
            if (kw === null || kw <= 0) return { ok: false, err: 'Capacity must be a positive number of kW.' };
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'annual_cost_of_capital_pct')) {
            var coc = num(patch.annual_cost_of_capital_pct);
            if (coc === null || coc <= 0 || coc > 100) {
                return { ok: false, err: 'Cost of capital must be a percentage above zero.' };
            }
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'target_energization') &&
            patch.target_energization !== null && !isDay(patch.target_energization)) {
            return { ok: false, err: 'Target energization must be a date, as YYYY-MM-DD.' };
        }
        for (var k in patch) {
            if (Object.prototype.hasOwnProperty.call(patch, k)) p[k] = patch[k];
        }
        d.byProject[p.id] = normalizeProject(p);
        d.byProject[p.id].updated = nowIso();
        var res = commit(d);
        return res.ok ? { ok: true, err: null, project: d.byProject[p.id], notice: res.notice }
                      : { ok: false, err: res.err };
    }

    /* STAGE 2 VALIDATES THE VOCABULARY AND NOTHING ELSE. The deliverables, the hard blocks and
       the waiver-with-approver are Stage 3, and building half of them here would produce a gate
       that looks enforced and is not -- which is worse than one that plainly is not. */
    function setGate(id, gate, opts) {
        opts = opts || {};
        if (GATES.indexOf(gate) < 0) return { ok: false, err: 'Unknown gate: ' + gate + '.' };
        var d = draft();
        var p = d.byProject[String(id)];
        if (!p || p.deleted_at) return { ok: false, err: 'No such project.' };
        if (p.gate === 'cancelled') return { ok: false, err: 'This project is cancelled.' };
        if (gate === 'cancelled' && !text(opts.reason)) {
            return { ok: false, err: 'Cancelling a project needs a reason.' };
        }
        var from = p.gate;
        if (from === gate) return { ok: true, err: null, project: p };
        // Backwards is allowed and recorded, never silent: a gate that reopens is a real event.
        if (GATES.indexOf(gate) < GATES.indexOf(from) && !text(opts.reason)) {
            return { ok: false, err: 'Moving a project back a gate needs a reason.' };
        }
        p.gate = gate;
        p.gate_entered_at = nowIso();
        p.updated = p.gate_entered_at;
        if (gate === 'cancelled') {
            p.cancelled_at = p.gate_entered_at;
            p.cancelled_reason = text(opts.reason);
        }
        var res = commit(d);
        if (!res.ok) return { ok: false, err: res.err };
        var logged = null;
        if (typeof CrmLog !== 'undefined' && CrmLog.append && p.prospect.prospect_id) {
            logged = CrmLog.append('note', p.prospect.prospect_id, {
                body: 'Project ' + p.id + ' moved from ' + from + ' to ' + gate,
                project_id: p.id, from: from, to: gate, reason: text(opts.reason)
            });
        }
        return { ok: true, err: null, project: p, notice: res.notice,
                 logged: !!(logged && logged.ok) };
    }

    function cancel(id, reason) { return setGate(id, 'cancelled', { reason: reason }); }

    /* A TOMBSTONE, NOT A DELETION, and only for something already cancelled and empty. Removing
       the key would leave the project alive in Firestore -- merge cannot express a key removal --
       so it would return on the next pull with its whole ledger and no sign it had been deleted. */
    function remove(id, reason) {
        var d = draft();
        var p = d.byProject[String(id)];
        if (!p || p.deleted_at) return { ok: false, err: 'No such project.' };
        if (p.gate !== 'cancelled') {
            return { ok: false, err: 'Cancel the project before removing it, so the reason is recorded.' };
        }
        for (var i = 0; i < COLLECTIONS.length; i++) {
            var n = Object.keys(p[COLLECTIONS[i]] || {}).length;
            if (n) {
                return { ok: false, err: 'This project still has ' + n + ' ' +
                         COLLECTIONS[i].replace(/_/g, ' ') + '. A ledger is not removed by accident.' };
            }
        }
        p.deleted_at = nowIso();
        p.deleted_reason = text(reason);
        p.updated = p.deleted_at;
        var res = commit(d);
        return res.ok ? { ok: true, err: null } : { ok: false, err: res.err };
    }

    function reset() { _cache = null; _raw = null; _blocked = null; }

    return {
        KEY: KEY,
        VERSION: VERSION,
        GATES: GATES,
        FIRST_GATE: FIRST_GATE,
        COLLECTIONS: COLLECTIONS,
        SIZE_REFUSE: SIZE_REFUSE,
        SIZE_NOTICE: SIZE_NOTICE,
        getData: getData,
        blocked: blocked,
        list: list,
        get: get,
        forProspect: forProspect,
        hasLive: hasLive,
        promote: promote,
        update: update,
        setGate: setGate,
        cancel: cancel,
        remove: remove,
        normalizeProject: normalizeProject,
        reset: reset
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ProjectData;
