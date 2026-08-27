// The restore half of the backup, and the round trip that proves the pair works.
//
// Testing each half separately is what allowed the export to be green while six stores sat
// outside it. The assertion that actually matters here is the last one: export, import into a
// clean store, export again, byte-identical. Neither half can be quietly wrong and still pass it.
//
// Everything below drives the real module against a real storage shim. Nothing is re-implemented.

var path = require('path');
var fs = require('fs');
var ROOT = path.join(__dirname, '..');
var B = require(path.join(ROOT, 'backup.js'));

var pass = 0, fail = 0;
function ok(label, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + (detail ? '\n        ' + detail : '')); }
}
function eq(label, a, b) { ok(label, a === b, 'got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); }

// A storage that behaves like localStorage, including the index-based key() the export walks,
// and that can be made to fail on demand the way a full one does.
function makeStore(seed) {
    var s = Object.assign({}, seed || {});
    var failAfter = -1, writes = 0;
    var api = {
        _raw: s,
        _failAfter: function (n) { failAfter = n; writes = 0; },
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(s, k) ? s[k] : null; },
        setItem: function (k, v) {
            if (failAfter >= 0 && writes >= failAfter) {
                var e = new Error('quota'); e.name = 'QuotaExceededError'; throw e;
            }
            writes++; s[k] = String(v);
        },
        removeItem: function (k) { delete s[k]; },
        key: function (i) { return Object.keys(s)[i] || null; }
    };
    Object.defineProperty(api, 'length', { get: function () { return Object.keys(s).length; } });
    return api;
}

function noopCopy() { /* a safety copy that succeeds */ }

var LIVE = {
    protonMiningSites:  JSON.stringify({ _v: 1, sites: [{ id: 'a' }, { id: 'b' }] }),
    protonCrmLog:       JSON.stringify({ _v: 1, seq: 4, entries: [{ id: 'e1' }] }),
    protonCrmDocuments: JSON.stringify({ _v: 1, seq: 2, items: [{ id: 'd1' }, { id: 'd2' }] }),
    protonCrmEnrichment: JSON.stringify({ _v: 1, byProspect: { a: {}, b: {}, c: {} } }),
    sw_clean_v222:      'true',                    // must never be exported
    someOtherAppKey:    '{}'                       // nor this
};

console.log('\n=== the export still only reaches what it should ===');
(function () {
    var st = makeStore(LIVE);
    var keys = B.exportableKeys(st);
    eq('four stores are exportable', keys.length, 4);
    ok('the service-worker bootstrap key is not', keys.indexOf('sw_clean_v222') < 0);
    ok('nor an unrelated app key', keys.indexOf('someOtherAppKey') < 0);
    ok('CRM stores are now included', keys.indexOf('protonCrmLog') >= 0);
})();

console.log('\n=== validate everything before writing anything ===');
(function () {
    var st = makeStore(LIVE);
    // One good key, one key at the wrong version. The whole import must be refused.
    var file = {
        protonMiningSites: { _v: 1, sites: [{ id: 'z' }] },
        protonCrmLog:      { _v: 99, seq: 1, entries: [] }
    };
    var r = B.inspect(file, st);
    ok('a version mismatch refuses the import', !r.ok);
    ok('and names both versions so the user knows which end is old',
       /version 99/.test(r.err) && /version 1/.test(r.err), r.err);

    var applied = B.apply(file, st, noopCopy);
    ok('apply refuses it too', !applied.ok);
    eq('and wrote nothing at all', applied.written.length, 0);
    eq('the good key in the same file was NOT written',
       JSON.parse(st.getItem('protonMiningSites')).sites.length, 2);
})();

console.log('\n=== a foreign key refuses the whole file ===');
(function () {
    var st = makeStore(LIVE);
    var r = B.apply({ protonMiningSites: { _v: 1, sites: [] }, evilKey: 'x' }, st, noopCopy);
    ok('an unrecognised key is refused', !r.ok);
    ok('and the message says nothing was restored', /Nothing was restored/.test(r.err), r.err);
    eq('the existing store is untouched',
       JSON.parse(st.getItem('protonMiningSites')).sites.length, 2);
})();

console.log('\n=== the plan says what is about to be replaced ===');
(function () {
    var st = makeStore(LIVE);
    var file = {
        protonMiningSites:  { _v: 1, sites: [{ id: 'z' }] },          // 2 -> 1
        protonCrmFollowups: { _v: 1, seq: 0, items: [{ id: 'f' }] }   // absent -> 1
    };
    var r = B.inspect(file, st);
    ok('the plan is ok', r.ok, r.err);
    eq('one row per key', r.plan.length, 2);
    var sites = r.plan.filter(function (p) { return p.key === 'protonMiningSites'; })[0];
    eq('replace is named as replace', sites.action, 'replace');
    eq('with the count before', sites.before, 2);
    eq('and the count after', sites.after, 1);
    var fu = r.plan.filter(function (p) { return p.key === 'protonCrmFollowups'; })[0];
    eq('a key not present locally is a create', fu.action, 'create');
    eq('with no before-count to show', fu.before, null);
    // countOf has to cope with four different collection shapes.
    eq('byProspect stores count their prospects',
       B.countOf({ _v: 1, byProspect: { a: {}, b: {} } }), 2);
})();

console.log('\n=== replace per key, and leave the rest alone ===');
(function () {
    var st = makeStore(LIVE);
    var r = B.apply({ protonMiningSites: { _v: 1, sites: [{ id: 'z' }] } }, st, noopCopy);
    ok('the restore succeeded', r.ok, r.err);
    eq('the named key was replaced, not merged',
       JSON.parse(st.getItem('protonMiningSites')).sites.map(function (s) { return s.id; }).join(','), 'z');
    ok('a key absent from the file is left alone, not cleared',
       st.getItem('protonCrmLog') !== null);
    ok('and so is a key that was never exportable', st.getItem('sw_clean_v222') !== null);
})();

console.log('\n=== the safety copy is taken before any write ===');
(function () {
    var st = makeStore(LIVE);
    var seenAtCopyTime = null;
    B.apply({ protonMiningSites: { _v: 1, sites: [{ id: 'z' }] } }, st, function (snapshot) {
        seenAtCopyTime = JSON.stringify(snapshot.protonMiningSites.sites.map(function (s) { return s.id; }));
    });
    eq('the copy saw the state as it was, not as it became', seenAtCopyTime, '["a","b"]');

    // And if the copy cannot be taken, nothing is written.
    var st2 = makeStore(LIVE);
    var r2 = B.apply({ protonMiningSites: { _v: 1, sites: [] } }, st2, function () {
        throw new Error('disk full');
    });
    ok('a failed safety copy refuses the restore', !r2.ok);
    ok('and says why', /safety copy/.test(r2.err), r2.err);
    eq('leaving the original data in place',
       JSON.parse(st2.getItem('protonMiningSites')).sites.length, 2);

    // A missing safety copy is refused outright rather than defaulted away.
    ok('apply without a safety copy is refused',
       !B.apply({ protonMiningSites: { _v: 1, sites: [] } }, makeStore(LIVE), null).ok);
})();

console.log('\n=== a quota failure mid-write reports how far it got ===');
(function () {
    var st = makeStore(LIVE);
    st._failAfter(1);                       // first write lands, second throws
    var r = B.apply({
        protonMiningSites: { _v: 1, sites: [] },
        protonCrmLog:      { _v: 1, seq: 0, entries: [] }
    }, st, noopCopy);
    ok('the failure is reported, not swallowed', !r.ok);
    eq('and it says how many landed', r.written.length, 1);
    ok('and points at the safety copy', /safety copy/.test(r.err), r.err);
})();

console.log('\n=== rubbish in is refused with something a human can act on ===');
(function () {
    var st = makeStore(LIVE);
    ok('an array is not a backup', !B.inspect([], st).ok);
    ok('a string is not a backup', !B.inspect('nope', st).ok);
    ok('null is not a backup', !B.inspect(null, st).ok);
    var empty = B.inspect({}, st);
    ok('an empty object is refused', !empty.ok);
    ok('and says it is empty rather than failing silently', /empty/.test(empty.err), empty.err);
})();

console.log('\n=== THE ROUND TRIP ===');
/* Export, import into a clean store, export again, byte-identical. This is the assertion the
   pair is actually for: either half being wrong on its own still fails here. */
(function () {
    var source = makeStore(LIVE);
    var first = B.serialize(B.collect(source));

    var clean = makeStore({});
    var r = B.apply(JSON.parse(first), clean, noopCopy);
    ok('the export imports into an empty store', r.ok, r.err);
    eq('every exportable key came across', r.written.length, 4);

    var second = B.serialize(B.collect(clean));
    ok('export -> import -> export is byte-identical', first === second,
       'first ' + first.length + ' bytes, second ' + second.length);

    // And a second round trip through the restored store, so a fixed-point that only holds once
    // does not pass.
    var clean2 = makeStore({});
    B.apply(JSON.parse(second), clean2, noopCopy);
    ok('and stable on a second pass', B.serialize(B.collect(clean2)) === first);

    // A store holding a bare string rather than JSON must survive too -- the export parses where
    // it can and keeps the raw string where it cannot, and a naive restore would re-encode it
    // with quotes.
    var odd = makeStore({ protonMiningRaw: 'not json at all' });
    var oddOut = B.serialize(B.collect(odd));
    var oddIn = makeStore({});
    B.apply(JSON.parse(oddOut), oddIn, noopCopy);
    eq('a non-JSON value round-trips unchanged',
       oddIn.getItem('protonMiningRaw'), 'not json at all');
})();

console.log('\n=== the version map agrees with the modules it describes ===');
/* Declared in backup.js because there is no source to read at runtime; asserted here against the
   real `var VERSION` in each module so it cannot drift from the code silently. */
(function () {
    var mismatches = [];
    Object.keys(B.STORE_VERSIONS).forEach(function (lsKey) {
        var found = null;
        fs.readdirSync(ROOT).forEach(function (f) {
            if (!/\.js$/.test(f) || f === 'chart.min.js') return;
            var src = fs.readFileSync(path.join(ROOT, f), 'utf8');
            if (src.indexOf("var KEY = '" + lsKey + "'") < 0) return;
            var m = /var\s+VERSION\s*=\s*(\d+)/.exec(src);
            if (m) found = { file: f, v: Number(m[1]) };
        });
        if (!found) { mismatches.push(lsKey + ': no module declares it'); return; }
        if (found.v !== B.STORE_VERSIONS[lsKey]) {
            mismatches.push(lsKey + ': backup.js says ' + B.STORE_VERSIONS[lsKey] +
                            ', ' + found.file + ' says ' + found.v);
        }
    });
    ok('every declared store version matches its module', mismatches.length === 0,
       mismatches.join('; '));
})();

console.log('\n' + (fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                               : pass + ' passed, ' + fail + ' FAILED'));
process.exit(fail === 0 ? 0 : 1);
