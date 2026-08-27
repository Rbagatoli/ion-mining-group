/* ===== Backup: export and restore =====
 *
 * The export half already existed, in profile-panel.js, and worked. The restore half did not
 * exist at all -- no file input, no FileReader, no setItem anywhere in the panel -- so the single
 * backup affordance in the product was a one-way door. You could take a copy of your data and
 * had no supported way to put it back. profile-panel.js:168 even anticipates the missing half:
 * "the export is keyed by the REAL localStorage key so a restore needs no translation table".
 *
 * WHY THIS IS A MODULE AND NOT MORE OF profile-panel.js. The panel needs a DOM to load, which is
 * why tests/storage.test.js reproduces its prefix list locally rather than importing it -- and
 * that reproduction is exactly why six stores sat outside the backup for so long while a test
 * called "the export covers every key" stayed green. A restore that can overwrite a project
 * ledger must not be testable only by re-implementing it. Everything here is pure: it takes a
 * storage object and returns plain data. The panel keeps the file picker, the download and the
 * confirmation, and nothing else.
 *
 * THE FORMAT IS UNCHANGED, deliberately. An export is still a bare map of localStorage key to
 * parsed value, with no envelope. Adding one would have been tidier and would have invalidated
 * every file anyone has already downloaded -- which is the one thing a backup format must never
 * do. Versioning is checked per store instead, on the `_v` each store already writes.
 */
var ProtonBackup = (function () {
    'use strict';

    /* Kept here rather than in profile-panel.js so that the census test, the round-trip test and
       the panel all read one list. tests/backup-coverage.test.js parses this declaration and
       walks the repo for every `var KEY = '...'` store, so a store that picks a new prefix fails
       a test rather than falling silently out of the backup the way the CRM layer did. */
    var EXPORT_PREFIXES = ['protonMining', 'btcMinerCalc', 'protonCrm', 'protonContacts'];

    /* WHAT VERSION EACH STORE IS EXPECTED TO BE AT.
     *
     * A restore must refuse a file it does not understand rather than migrate it. Silent
     * migration on a restore path is how data gets quietly mangled: the user believes they have
     * recovered last month's ledger and has in fact recovered a guess about it.
     *
     * Declared rather than derived because at runtime there is no source to read -- but
     * tests/backup-coverage.test.js parses every module's `var VERSION = n` and asserts this map
     * agrees, so it cannot drift from the code without failing. Stores absent from this map carry
     * no `_v` and are accepted as-is; that is asserted too, so adding a `_v` to a store without
     * declaring it here is caught. */
    var STORE_VERSIONS = {
        protonMiningSites:   1,
        protonCrmLog:        1,
        protonCrmDocuments:  1,
        protonCrmFollowups:  1,
        protonCrmEnrichment: 1,
        protonCrmConfig:     1,
        protonContacts:      1
    };

    function isExportable(key) {
        for (var i = 0; i < EXPORT_PREFIXES.length; i++) {
            if (key.indexOf(EXPORT_PREFIXES[i]) === 0) return true;
        }
        return false;
    }

    function exportableKeys(store) {
        var out = [];
        for (var i = 0; i < store.length; i++) {
            var k = store.key(i);
            if (k && isExportable(k)) out.push(k);
        }
        return out.sort();
    }

    /* The export object. Values are parsed where they parse and kept as raw strings where they do
       not, which is what the original did and what makes the round trip exact: a store holding a
       bare string comes back as that string rather than as JSON-encoded quotes. */
    function collect(store) {
        var data = {};
        var ks = exportableKeys(store);
        for (var i = 0; i < ks.length; i++) {
            var raw = store.getItem(ks[i]);
            if (raw === null) continue;
            try { data[ks[i]] = JSON.parse(raw); } catch (e) { data[ks[i]] = raw; }
        }
        return data;
    }

    function serialize(data) { return JSON.stringify(data, null, 2); }

    /* HOW MANY THINGS IS THIS, for a confirmation dialog that has to say what is about to be
       replaced. The stores do not share a shape -- sites[], entries[], items[], byProspect{} --
       so this reports the obvious collection where there is one and falls back to counting keys.
       It is for a human reading a sentence, not for logic. */
    function countOf(value) {
        if (value === null || value === undefined) return 0;
        if (Array.isArray(value)) return value.length;
        if (typeof value !== 'object') return 1;
        var named = ['items', 'entries', 'sites', 'prospects', 'projects'];
        for (var i = 0; i < named.length; i++) {
            if (Array.isArray(value[named[i]])) return value[named[i]].length;
        }
        if (value.byProspect && typeof value.byProspect === 'object') {
            return Object.keys(value.byProspect).length;
        }
        if (value.byProject && typeof value.byProject === 'object') {
            return Object.keys(value.byProject).length;
        }
        return Object.keys(value).length;
    }

    /* VALIDATE EVERYTHING BEFORE WRITING ANYTHING.
     *
     * Returns { ok, err, plan } and touches no storage. Every key in the file is checked first,
     * and a single failure refuses the whole import -- a partial restore leaves a state that
     * never existed on any machine, which is worse than no restore at all, because it looks like
     * it worked.
     *
     * The plan is what the confirmation dialog reads: per key, how many items are there now and
     * how many the file would leave. */
    function inspect(parsed, store) {
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return { ok: false, err: 'That file is not a Proton Mining backup.', plan: [] };
        }
        var keys = Object.keys(parsed);
        if (!keys.length) {
            return { ok: false, err: 'That backup is empty — nothing to restore.', plan: [] };
        }

        var plan = [], problems = [];
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i], v = parsed[k];

            if (!isExportable(k)) {
                problems.push(k + ' is not a Proton Mining key');
                continue;
            }
            /* REFUSE ON VERSION MISMATCH, DO NOT MIGRATE. The message names both numbers,
               because "incompatible backup" tells the user nothing they can act on and this
               tells them whether they are holding an old file or running an old build. */
            var want = STORE_VERSIONS[k];
            if (want !== undefined && v && typeof v === 'object' && v._v !== undefined &&
                v._v !== want) {
                problems.push(k + ' is version ' + v._v + ', this build reads version ' + want);
                continue;
            }
            var before = null;
            var rawNow = store.getItem(k);
            if (rawNow !== null) {
                try { before = JSON.parse(rawNow); } catch (e) { before = rawNow; }
            }
            plan.push({
                key: k,
                action: rawNow === null ? 'create' : 'replace',
                before: rawNow === null ? null : countOf(before),
                after: countOf(v)
            });
        }

        if (problems.length) {
            return {
                ok: false,
                plan: [],
                err: 'Nothing was restored. ' + problems.length +
                     (problems.length === 1 ? ' problem: ' : ' problems: ') + problems.join('; ')
            };
        }
        return { ok: true, err: null, plan: plan };
    }

    /* REPLACE PER KEY. Not a merge: merging two divergent histories produces a state that never
       existed, and for an append-only log it would interleave two timelines that each believed
       they were complete.
     *
     * Keys absent from the file are LEFT ALONE rather than cleared. The file is a restore of what
     * it contains, not an assertion about what should not exist -- and a backup taken before a
     * feature existed must not delete that feature's data.
     *
     * safetyCopy is called with the current state BEFORE the first write and must not throw. It
     * is how "restoring an old backup over recent work" stops being unrecoverable, and it is a
     * required argument rather than an option because the one time it is skipped is the one time
     * it was needed. */
    function apply(parsed, store, safetyCopy) {
        if (typeof safetyCopy !== 'function') {
            return { ok: false, err: 'A restore needs somewhere to put the safety copy.', written: [] };
        }
        var check = inspect(parsed, store);
        if (!check.ok) return { ok: false, err: check.err, written: [] };

        try {
            safetyCopy(collect(store));
        } catch (e) {
            return {
                ok: false, written: [],
                err: 'Nothing was restored: the safety copy of your current data failed (' +
                     (e && e.message ? e.message : 'unknown error') + ').'
            };
        }

        /* Serialise every value BEFORE the first write. JSON.stringify can throw on a cyclic
           structure, and discovering that halfway through is the partial restore this whole
           function exists to prevent. */
        var pending = [];
        for (var i = 0; i < check.plan.length; i++) {
            var k = check.plan[i].key, v = parsed[k];
            try {
                pending.push({ key: k, raw: typeof v === 'string' ? v : JSON.stringify(v) });
            } catch (e2) {
                return { ok: false, written: [], err: 'Nothing was restored: ' + k + ' could not be encoded.' };
            }
        }

        var written = [];
        for (var w = 0; w < pending.length; w++) {
            try {
                store.setItem(pending[w].key, pending[w].raw);
                written.push(pending[w].key);
            } catch (e3) {
                /* A quota failure mid-write is the one case that cannot be made atomic against a
                   synchronous localStorage. Say exactly how far it got and that the safety copy
                   exists, rather than reporting a success that is not one. */
                return {
                    ok: false, written: written,
                    err: 'Restore stopped at ' + pending[w].key + ' (' + written.length + ' of ' +
                         pending.length + ' restored) because storage is full. Your safety copy ' +
                         'was downloaded before any change was made.'
                };
            }
        }
        return { ok: true, err: null, written: written };
    }

    return {
        EXPORT_PREFIXES: EXPORT_PREFIXES,
        STORE_VERSIONS: STORE_VERSIONS,
        isExportable: isExportable,
        exportableKeys: exportableKeys,
        collect: collect,
        serialize: serialize,
        countOf: countOf,
        inspect: inspect,
        apply: apply
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ProtonBackup;
