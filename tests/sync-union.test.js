// The union that replaces the hold.
//
// pullVerdict holds a store when the cloud copy is missing records this device has. The hold
// protected the PULL — and the held device's next SAVE pushed its whole store, and for an
// array container Firestore's merge replaces the array wholesale, destroying every cloud-only
// record the hold had just protected. The two halves of one engine disagreed about what "safe"
// meant.
//
// unionStores() is the resolution: local ∪ remote keyed by id, local winning collisions unless
// the remote copy carries a strictly newer `updated`. Null whenever a side is unreadable or the
// container changed shape — and null must stay a HOLD, never become a write.
//
// EVERY FIXTURE HERE DISTINGUISHES. Each rule below has a fixture that fails if the rule is
// inverted: the collision fixtures carry different payloads on each side, so "kept local" and
// "took remote" produce different bytes, and the tombstone fixture would resurrect visibly.

var path = require('path');
var ROOT = path.join(__dirname, '..');

var pass = 0, fail = 0;
function ok(label, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + (detail === undefined ? '' : '\n        ' + detail)); }
}
function eq(label, a, b) { ok(label, a === b, 'got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); }

global.localStorage = {
    _s: {}, getItem: function (k) { return this._s[k] || null; },
    setItem: function (k, v) { this._s[k] = String(v); },
    removeItem: function (k) { delete this._s[k]; }, key: function () { return null; }, length: 0
};
global.ProtonAuth = { isSignedIn: function () { return false; }, getUser: function () { return null; } };

var Sync = require(path.join(ROOT, 'sync.js'));
var U = Sync.unionStores;

console.log('\nunionStores');

// ---- Arrays (the exposed shape: `sites`) -----------------------------------------------------
var localArr = { sites: [
    { id: 'a', stage: 'contacted', updated: '2026-09-01T10:00:00Z' },
    { id: 'b', stage: 'unreviewed', updated: '2026-08-01T10:00:00Z' }
] };
var remoteArr = { sites: [
    { id: 'a', stage: 'dead', updated: '2026-08-15T10:00:00Z' },        // OLDER than local a
    { id: 'c', stage: 'in_discussion', updated: '2026-08-20T10:00:00Z' } // cloud-only
] };

var m = U(localArr, remoteArr, 'sites');
ok('array union returns an array', Array.isArray(m));
eq('union carries every id once', m.map(function (r) { return r.id; }).sort().join(','), 'a,b,c');
eq('the cloud-only record survives (the record the old push clobbered)',
   m.filter(function (r) { return r.id === 'c'; })[0].stage, 'in_discussion');
eq('a collision with an OLDER remote keeps the local copy',
   m.filter(function (r) { return r.id === 'a'; })[0].stage, 'contacted');

// The same collision with the remote NEWER: remote wins. The fixture differs from the one
// above only in the stamp order, so this fails if the comparison is inverted.
var remoteNewer = { sites: [{ id: 'a', stage: 'dead', updated: '2026-09-02T10:00:00Z' }] };
var m2 = U(localArr, remoteNewer, 'sites');
eq('a collision with a NEWER remote takes the remote copy',
   m2.filter(function (r) { return r.id === 'a'; })[0].stage, 'dead');

// No comparable stamps: local wins — the held device is the one with unsynced work.
var m3 = U({ sites: [{ id: 'x', v: 'local' }] }, { sites: [{ id: 'x', v: 'remote' }] }, 'sites');
eq('no stamps: local wins', m3[0].v, 'local');

// A tombstone unioned in does not resurrect: it arrives AS the tombstone.
var m4 = U({ sites: [] },
           { sites: [{ id: 'd', deleted_at: '2026-08-30', updated: '2026-08-30T00:00:00Z' }] },
           'sites');
eq('a deleted record arrives as its tombstone, not as a live record',
   m4[0].deleted_at, '2026-08-30');

// ---- Maps (`byProject`) ----------------------------------------------------------------------
var mm = U({ byProject: { p1: { id: 'p1', name: 'local', updated: '2026-09-01' } } },
           { byProject: { p1: { id: 'p1', name: 'remote', updated: '2026-08-01' },
                          p2: { id: 'p2', name: 'cloud-only' } } },
           'byProject');
eq('map union keeps local on an older-remote collision', mm.p1.name, 'local');
eq('map union adds the cloud-only key', mm.p2.name, 'cloud-only');

// ---- Refusals: null stays a hold -------------------------------------------------------------
eq('a record without an id refuses (null), never guesses',
   U({ sites: [{ stage: 'x' }] }, { sites: [] }, 'sites'), null);
eq('a container that changed shape refuses',
   U({ sites: [] }, { sites: { notAnArray: true } }, 'sites'), null);
eq('a missing container refuses', U({}, { sites: [] }, 'sites'), null);
eq('no container name refuses', U(localArr, remoteArr, null), null);

// ---- The pull path uses it: a held divergence resolves without losing either side ------------
// pullVerdict says write:false; the union should then produce the superset the next push needs.
var v = Sync.pullVerdict('sites',
    JSON.stringify(localArr), remoteArr);
eq('pullVerdict still holds the divergent store', v.write, false);
var resolved = U(JSON.parse(JSON.stringify(localArr)), remoteArr, Sync.RECORD_CONTAINER.sites);
ok('and the union resolves it with nothing lost from either device',
   resolved.length === 3 &&
   resolved.some(function (r) { return r.id === 'b'; }) &&
   resolved.some(function (r) { return r.id === 'c'; }));

console.log('\n' + (fail ? 'FAILED — ' + fail + ' of ' + (pass + fail) : 'ALL PASS — ' + pass + ' assertions'));
if (fail) process.exit(1);
