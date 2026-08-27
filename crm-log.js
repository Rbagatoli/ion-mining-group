/* ===== The CRM's append-only log =====
 *
 * One store for everything that HAPPENED, keyed by kind. Phase 1 writes stage
 * transitions; interactions and free-form notes land here later under their own
 * kind, because they are the same shape of thing: an event, on a prospect, at a
 * time, that is true forever afterwards.
 *
 * APPEND ONLY, AND THAT IS THE POINT. A stage that went contacted -> dead ->
 * contacted is a different story from one that went straight to contacted, and
 * the second story is the one you need when you are asking why deals die. An
 * editable log answers "what do I believe now"; this one answers "what actually
 * happened", including the parts that turned out to be wrong.
 *
 * A correction is therefore a new entry that names the one it supersedes, never
 * a rewrite. supersede() is how the UI will offer "edit" without ever losing the
 * original -- the same rule the metering ledger in the client portal follows,
 * for the same reason: a record somebody has acted on must not change under them.
 *
 * ONE STORE RATHER THAN THREE. Three localStorage keys means three quota
 * failures to handle and three shapes to keep in step; the entries differ only
 * in their payload, and the brief asks explicitly for loose fields over a rigid
 * schema that will need migrating after the first ten conversations.
 */
var CrmLog = (function () {
    'use strict';

    var KEY = 'protonCrmLog';
    var VERSION = 1;

    var KINDS = ['stage', 'interaction', 'note'];

    var _cache = null;

    function empty() { return { _v: VERSION, seq: 0, entries: [] }; }

    function read() {
        if (_cache) return _cache;
        try {
            var raw = localStorage.getItem(KEY);
            if (raw) {
                var parsed = JSON.parse(raw);
                if (parsed && Array.isArray(parsed.entries)) {
                    _cache = parsed;
                    return _cache;
                }
            }
        } catch (e) { /* fall through to empty */ }
        _cache = empty();
        return _cache;
    }

    function write(data) {
        var res = { ok: true, err: null };
        try {
            localStorage.setItem(KEY, JSON.stringify(data));
            _cache = data;
        } catch (e) {
            res.ok = false;
            /* Named rather than folded into a generic message, because this one
               has a remedy and because a lost interaction is a lost deal. */
            res.err = (e && (e.name === 'QuotaExceededError' || e.code === 22))
                ? 'Local storage is full — this entry was NOT saved. Export your data first.'
                : 'Could not save this entry.';
            return res;
        }
        if (typeof SyncEngine !== 'undefined' && SyncEngine.save) {
            try { SyncEngine.save('crmLog'); } catch (e) { /* the local write stands */ }
        }
        return res;
    }

    /* Random rather than sequential, and not derived from the clock. Two entries
       written in the same millisecond on two devices would otherwise collide the
       next time they synced, and the loser would vanish silently. */
    function newId() {
        var s = '';
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            var a = new Uint8Array(8);
            crypto.getRandomValues(a);
            for (var i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2);
        } else {
            /* No Math.random fallback that pretends to be unique: a readable
               marker is better than a collision nobody can explain. */
            s = 'noRng' + String(read().entries.length);
        }
        return s;
    }

    function nowIso() { return new Date().toISOString(); }

    /* The only way anything enters this store. Callers supply a kind, a prospect
       and a payload; identity and timestamp are not theirs to set. */
    function append(kind, prospectId, payload) {
        if (KINDS.indexOf(kind) < 0) return { ok: false, err: 'Unknown log kind: ' + kind };
        if (!prospectId) return { ok: false, err: 'An entry must belong to a prospect.' };
        var data = read();
        /* A MONOTONIC COUNTER ALONGSIDE THE TIMESTAMP, because the timestamp is not
           enough. Setting a stage writes a transition, and a UI that sets two in a row
           -- or any scripted import -- produces entries with an identical ISO string
           down to the millisecond. Sorting on `at` alone then leaves them in whatever
           order the sort happened to preserve, which made "newest first" return oldest
           first and was caught only because a test asked which stage a transition came
           FROM rather than just how many there were. */
        data.seq = (typeof data.seq === 'number' ? data.seq : 0) + 1;
        var entry = { id: newId(), kind: kind, prospect_id: String(prospectId),
                      at: nowIso(), seq: data.seq };
        payload = payload || {};
        for (var k in payload) {
            if (!Object.prototype.hasOwnProperty.call(payload, k)) continue;
            /* seq JOINED THIS LIST LATE, and its absence was a live bug rather than an
               oversight waiting to become one. The four fields above are the ones a caller
               must not forge; seq is the one a caller must not forge ACCIDENTALLY.
               CrmInteractions.correct() merges a whole prior entry forward as a payload
               (crm-interactions.js:170), so a corrected entry inherited the original's
               position and sorted as though it had never been corrected -- newest-first
               returning oldest-first, which is the one thing the counter exists to stop. */
            if (k === 'id' || k === 'kind' || k === 'prospect_id' || k === 'at' ||
                k === 'seq') continue;
            entry[k] = payload[k];
        }
        data.entries.push(entry);
        var res = write(data);
        res.entry = res.ok ? entry : null;
        return res;
    }

    /* A correction. The original stays exactly where it is and keeps its place in
       the timeline; the new entry points back at it. Readers that want the
       current view of an event follow supersedes forward, and readers that want
       the history -- which is most of them here -- ignore it. */
    function supersede(entryId, payload) {
        var prev = get(entryId);
        if (!prev) return { ok: false, err: 'No such entry.' };
        var p = payload || {};
        p.supersedes = entryId;
        return append(prev.kind, prev.prospect_id, p);
    }

    function get(id) {
        var list = read().entries;
        for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
        return null;
    }

    function all() { return read().entries.slice(); }

    /* Newest first, because every screen that shows these wants the last thing
       that happened at the top. */
    function forProspect(prospectId, kind) {
        var out = [];
        var list = read().entries;
        for (var i = 0; i < list.length; i++) {
            if (list[i].prospect_id !== String(prospectId)) continue;
            if (kind && list[i].kind !== kind) continue;
            out.push(list[i]);
        }
        out.sort(function (a, b) {
            if (a.at !== b.at) return (a.at < b.at) ? 1 : -1;
            return (b.seq || 0) - (a.seq || 0);      // same millisecond: last written wins
        });
        return out;
    }

    /* Entries that have been corrected by a later one, so a timeline can show
       them struck through rather than pretending they never existed. */
    function supersededIds() {
        var seen = {};
        var list = read().entries;
        for (var i = 0; i < list.length; i++) {
            if (list[i].supersedes) seen[list[i].supersedes] = list[i].id;
        }
        return seen;
    }

    function reset() { _cache = null; }

    return {
        KEY: KEY,
        KINDS: KINDS,
        append: append,
        supersede: supersede,
        get: get,
        all: all,
        forProspect: forProspect,
        supersededIds: supersededIds,
        reset: reset
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CrmLog;
