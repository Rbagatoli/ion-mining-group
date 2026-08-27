// Does the export actually cover every store this app writes?
//
// tests/storage.test.js already tests the export MECHANISM, and it passes. It does so against a
// hand-written fixture of eleven representative keys and a locally reproduced copy of the prefix
// list -- so it proves that prefix matching works, and cannot prove that the prefixes reach
// everything. Six stores have been outside the export the whole time it has been green.
//
// This file tests the COVERAGE instead, and it does it the only way that stays true: read the
// real prefixes out of profile-panel.js, scan the real repo for every store anyone declared, and
// assert the first set reaches the second. A fixture cannot go stale here because there is no
// fixture.
//
// The distinction matters because of how the export is meant to work. profile-panel.js:167 says
// "Prefix-driven rather than a list, so a key added later is covered without anyone remembering
// to add it here" -- which is true only for keys that pick a covered prefix. The CRM layer picked
// protonCrm, and fell out of the backup silently. The mechanism was designed to be automatic and
// is not, and nothing noticed because nothing was looking at the inventory.

var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');

var pass = 0, fail = 0;
function ok(label, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + (detail ? '\n        ' + detail : '')); }
}

// ---- the real prefixes, read from the real file ----------------------------------------------
// Parsed rather than copied, for the reason storage.test.js gives when it parses SYNC_KEYS: a
// duplicated list agrees with a past version of the code. A copy here would keep passing after
// someone narrowed the prefixes, which is precisely the change this test exists to catch.
var PANEL = fs.readFileSync(path.join(ROOT, 'profile-panel.js'), 'utf8');
var PREFIX_DECL = /var\s+EXPORT_PREFIXES\s*=\s*\[([^\]]*)\]/.exec(PANEL);
ok('EXPORT_PREFIXES was found in profile-panel.js', !!PREFIX_DECL);
var PREFIXES = PREFIX_DECL
    ? (PREFIX_DECL[1].match(/'([^']+)'/g) || []).map(function (s) { return s.slice(1, -1); })
    : [];
ok('and it parsed to at least one prefix', PREFIXES.length > 0,
   'parsed ' + JSON.stringify(PREFIXES));

function exported(key) {
    for (var i = 0; i < PREFIXES.length; i++) {
        if (key.indexOf(PREFIXES[i]) === 0) return true;
    }
    return false;
}

// ---- every store this repo declares ----------------------------------------------------------
// The convention across all nine stores is a module-private `var KEY = '...'` at the top of an
// IIFE. Scanning for it finds the inventory without anyone maintaining a second list of stores,
// which would rot the same way the prefix list did.
var stores = [];
fs.readdirSync(ROOT).forEach(function (f) {
    if (!/\.js$/.test(f) || f === 'chart.min.js') return;
    var src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    var re = /var\s+KEY\s*=\s*'([^']+)'/g, m;
    while ((m = re.exec(src)) !== null) stores.push({ file: f, key: m[1] });
});

// The scan has to be shown to work before its silence means anything. Nine stores are known to
// exist; a scan returning two would pass every assertion below by finding nothing to fail.
ok('the scan found the known store inventory', stores.length >= 9,
   'found ' + stores.length + ': ' + stores.map(function (s) { return s.key; }).join(', '));

console.log('\n--- every declared store is reachable by an export prefix ---');
var uncovered = stores.filter(function (s) { return !exported(s.key); });
uncovered.forEach(function (s) {
    console.log('        NOT EXPORTED: ' + s.key + '  (' + s.file + ')');
});
ok('no store is outside the export', uncovered.length === 0,
   uncovered.length + ' of ' + stores.length + ' stores cannot be backed up');

// ---- anything worth syncing is worth backing up ----------------------------------------------
// The weaker invariant, and the one with a documented history: storage.test.js:8 records that the
// export once iterated SYNC_KEYS and covered 11 of 28 keys. The fix made the export WIDER than
// sync. That direction must hold -- a key valuable enough to carry between machines is valuable
// enough to survive the machine.
var SYNC_SRC = fs.readFileSync(path.join(ROOT, 'sync.js'), 'utf8');
var start = SYNC_SRC.indexOf('var SYNC_KEYS');
var SYNC_BLOCK = SYNC_SRC.slice(start, SYNC_SRC.indexOf('};', start));
var SYNCED = (SYNC_BLOCK.match(/lsKey:\s*'([^']+)'/g) || []).map(function (m) {
    return m.replace(/.*'([^']+)'.*/, '$1');
});
ok('SYNC_KEYS was parsed, not guessed', SYNCED.length >= 10, 'found ' + SYNCED.length);

console.log('\n--- everything that syncs can also be exported ---');
var syncedNotExported = SYNCED.filter(function (k) { return !exported(k); });
syncedNotExported.forEach(function (k) {
    console.log('        SYNCS BUT NEVER EXPORTS: ' + k);
});
ok('nothing syncs without also being exportable', syncedNotExported.length === 0,
   syncedNotExported.length + ' of ' + SYNCED.length + ' synced keys are outside the export');

console.log('\n' + (fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                               : pass + ' passed, ' + fail + ' FAILED'));
process.exit(fail === 0 ? 0 : 1);
