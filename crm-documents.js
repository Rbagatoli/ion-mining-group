/* ===== Documents =====
 *
 * METADATA PLUS A LINK. This repo never holds the file, and that is a decision
 * rather than a limitation: the app is a static page with a browser's storage
 * behind it, and a signed NDA or a gas analysis living in localStorage would be
 * a copy of a legal document sitting in a place with no backup, no access
 * control and a quota that silently evicts. The file stays wherever it already
 * lives — Drive, a mailbox, a folder on the laptop — and this records that it
 * exists, what it is, and where to find it.
 *
 * SO A DOCUMENT WITH NO LINK IS STILL A DOCUMENT. "The signed NDA is in the
 * Ironbark folder in my email" is a real and useful record, and refusing to
 * store it until someone produces a URL would mean the register is only ever
 * half the documents. `url` is optional; `where` carries the sentence.
 *
 * WHAT IS NOT PROMISED. Nothing here checks that the link resolves, that the
 * file is still there, or that the person you send it to can open it. A link
 * that has rotted looks exactly like one that has not, and the register must
 * not imply otherwise — the UI says "recorded", never "verified".
 *
 * THE ONE THING THIS MODULE IS STRICT ABOUT is the scheme on that link. A
 * document link is typed by a person and later rendered into an href, and
 * `javascript:` in an href is script execution in the app's own origin, with
 * the fleet, the wallet and the banking data in reach. Only http, https, mailto
 * and file survive; anything else is kept as text so nothing is lost, and
 * rendered as text rather than as a link.
 */
var CrmDocuments = (function () {
    'use strict';

    var KEY = 'protonCrmDocuments';
    var VERSION = 1;

    /* A link is only clickable if it is one of these. `file:` is here because a
       path on the operator's own machine is the most likely answer for a scanned
       signature page, and it is no more dangerous than the folder it names. */
    var SAFE_SCHEMES = ['http:', 'https:', 'mailto:', 'file:'];

    var _cache = null;

    function empty() { return { _v: VERSION, seq: 0, items: [] }; }

    function read() {
        if (_cache) return _cache;
        try {
            var raw = localStorage.getItem(KEY);
            if (raw) {
                var parsed = JSON.parse(raw);
                if (parsed && Array.isArray(parsed.items)) { _cache = parsed; return _cache; }
            }
        } catch (e) { /* fall through */ }
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
            res.err = (e && (e.name === 'QuotaExceededError' || e.code === 22))
                ? 'Local storage is full — this document was NOT saved.'
                : 'Could not save this document.';
            return res;
        }
        if (typeof SyncEngine !== 'undefined' && SyncEngine.save) {
            try { SyncEngine.save('crmDocuments'); } catch (e) { /* local write stands */ }
        }
        return res;
    }

    function newId(data) {
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            var a = new Uint8Array(8), s = '';
            crypto.getRandomValues(a);
            for (var i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2);
            return 'd_' + s;
        }
        /* add() has already stamped data.seq for this item, so reuse it rather
           than bumping the counter a second time and leaving gaps. */
        return 'd_seq' + (data.seq || 0);
    }

    function has(v) { return v !== null && v !== undefined && String(v).trim() !== ''; }
    function text(v) { return has(v) ? String(v).trim() : null; }

    /* Returns { href, safe }. An unsafe or unparseable link keeps its text so the
       operator can see and fix what they typed; it simply never becomes an href.
       A bare "drive.google.com/..." is a URL somebody meant as https, so it is
       treated as one rather than rejected for missing a scheme it never needed
       to type. */
    function linkFor(url) {
        var raw = text(url);
        if (raw === null) return { href: null, safe: false, text: null };
        var candidate = raw;
        if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) candidate = 'https://' + candidate;
        var scheme;
        try {
            /* URL is the parser the browser will use on the href anyway, so it is
               the only one whose opinion matters. */
            scheme = new URL(candidate).protocol;
        } catch (e) {
            return { href: null, safe: false, text: raw };
        }
        if (SAFE_SCHEMES.indexOf(scheme) < 0) return { href: null, safe: false, text: raw };
        return { href: candidate, safe: true, text: raw };
    }

    function kindKeys() {
        if (typeof CrmConfig === 'undefined' || !CrmConfig.documentKinds) return [];
        return CrmConfig.documentKinds().map(function (k) { return k.key; });
    }

    function nowIso() { return new Date().toISOString(); }

    /* A document needs a prospect and a title and nothing else. Everything that
       could be unknown at the moment somebody records it -- where it lives, when
       it was signed, which kind it is -- is allowed to be unknown, because the
       alternative is that it does not get recorded at all. */
    function add(prospectId, opts) {
        if (!prospectId) return { ok: false, err: 'A document must belong to a prospect.' };
        opts = opts || {};
        if (!has(opts.title)) return { ok: false, err: 'A document needs a title.' };
        var data = read();
        var kinds = kindKeys();
        var kind = text(opts.kind);
        /* An unconfigured kind is refused rather than stored, because the filter
           and the summary both group by it and a typo would make a document
           quietly invisible in both. */
        if (kind !== null && kinds.length && kinds.indexOf(kind) < 0) {
            return { ok: false, err: 'Unknown document kind: ' + kind };
        }
        /* A MONOTONIC COUNTER ALONGSIDE THE TIMESTAMP. Three documents recorded
           in one sitting -- which is how a folder gets entered -- carry an
           identical ISO string down to the millisecond, and sorting on `at`
           alone then leaves them in whatever order the sort happened to keep.
           The log learned this the same way. */
        data.seq = (typeof data.seq === 'number' ? data.seq : 0) + 1;
        var item = {
            id: newId(data),
            seq: data.seq,
            prospect_id: String(prospectId),
            title: text(opts.title),
            kind: kind,
            url: text(opts.url),
            where: text(opts.where),
            signed_on: text(opts.signed_on),
            note: text(opts.note),
            added_at: nowIso(),
            updated_at: null
        };
        data.items.push(item);
        var res = write(data);
        res.item = res.ok ? item : null;
        return res;
    }

    function get(id) {
        var items = read().items;
        for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
        return null;
    }

    var EDITABLE = ['title', 'kind', 'url', 'where', 'signed_on', 'note'];

    function update(id, patch) {
        var data = read();
        var item = null;
        for (var i = 0; i < data.items.length; i++) if (data.items[i].id === id) item = data.items[i];
        if (!item) return { ok: false, err: 'No such document.' };
        patch = patch || {};
        var kinds = kindKeys();
        if (Object.prototype.hasOwnProperty.call(patch, 'kind')) {
            var k = text(patch.kind);
            if (k !== null && kinds.length && kinds.indexOf(k) < 0) {
                return { ok: false, err: 'Unknown document kind: ' + k };
            }
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'title') && !has(patch.title)) {
            return { ok: false, err: 'A document needs a title.' };
        }
        for (var e = 0; e < EDITABLE.length; e++) {
            var f = EDITABLE[e];
            if (Object.prototype.hasOwnProperty.call(patch, f)) item[f] = text(patch[f]);
        }
        item.updated_at = nowIso();
        var res = write(data);
        res.item = res.ok ? item : null;
        return res;
    }

    /* REMOVE MEANS REMOVE. A register of documents is not a history of what
       happened -- that is the log's job -- and a mis-typed link that cannot be
       deleted is a register nobody trusts. */
    function remove(id) {
        var data = read();
        var out = [];
        var found = false;
        for (var i = 0; i < data.items.length; i++) {
            if (data.items[i].id === id) { found = true; continue; }
            out.push(data.items[i]);
        }
        if (!found) return { ok: false, err: 'No such document.' };
        data.items = out;
        return write(data);
    }

    /* Newest first: the term sheet you added this morning is the one you are
       looking for, and the NDA from March is the one you already know about. */
    function forProspect(prospectId) {
        var out = read().items.filter(function (d) { return d.prospect_id === String(prospectId); });
        out.sort(function (a, b) {
            if (a.added_at !== b.added_at) return a.added_at < b.added_at ? 1 : -1;
            return (b.seq || 0) - (a.seq || 0);
        });
        return out;
    }

    function countFor(prospectId) { return forProspect(prospectId).length; }

    /* Which of the configured kinds are on file, and which are not. The absence
       is the useful half: "no NDA recorded" before a site visit is the thing you
       want the screen to say out loud. */
    function coverage(prospectId) {
        var have = {};
        var mine = forProspect(prospectId);
        for (var i = 0; i < mine.length; i++) if (mine[i].kind) have[mine[i].kind] = true;
        var kinds = (typeof CrmConfig !== 'undefined' && CrmConfig.documentKinds)
            ? CrmConfig.documentKinds() : [];
        var out = [];
        for (var k = 0; k < kinds.length; k++) {
            out.push({ key: kinds[k].key, label: kinds[k].label,
                       expected: !!kinds[k].expected, present: !!have[kinds[k].key] });
        }
        return out;
    }

    /* Documents whose kind is marked expected in the config and which are not on
       file. Not a blocker and not a warning -- a list. */
    function missing(prospectId) {
        return coverage(prospectId).filter(function (c) { return c.expected && !c.present; });
    }

    function all() { return read().items.slice(); }

    function reset() { _cache = null; }

    return {
        KEY: KEY,
        SAFE_SCHEMES: SAFE_SCHEMES,
        linkFor: linkFor,
        add: add,
        get: get,
        update: update,
        remove: remove,
        forProspect: forProspect,
        countFor: countFor,
        coverage: coverage,
        missing: missing,
        all: all,
        reset: reset
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CrmDocuments;
