// Does every SyncEngine.save() call actually pass something to upload?
//
// Six did not, for as long as the CRM layer has existed. save('crmLog') with no second argument
// reaches JSON.parse(JSON.stringify(undefined)) -- JSON.parse("undefined"), a SyntaxError --
// thrown inside a 500ms debounce timer, long after the caller's try/catch has returned. So
// ref.set was never reached and nothing was ever uploaded; and because neither .then nor .catch
// ran, the _recentSaves flag set before the timer was never cleared, and the listener dropped
// every inbound change for that key for the rest of the page's life.
//
// Nothing failed. No console error, no rejected promise, no test. The data simply stayed on one
// machine while the module comment said it belonged on every device.
//
// This is a census, not a unit test: it reads the repo. The six were fixed by hand; this is what
// stops the seventh.

var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');

var pass = 0, fail = 0;
function ok(label, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + (detail ? '\n        ' + detail : '')); }
}
function eq(label, a, b) { ok(label, a === b, 'got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); }

// ---- every call site in the repo --------------------------------------------------------------
var calls = [];
fs.readdirSync(ROOT).forEach(function (f) {
    if (!/\.js$/.test(f) || f === 'chart.min.js') return;
    var src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    src.split(/\r?\n/).forEach(function (line, i) {
        var m = /SyncEngine\.save\(([^)]*)\)/.exec(line);
        if (!m) return;
        // The declaration inside sync.js itself, and prose in comments, are not call sites.
        if (f === 'sync.js') return;
        if (/^\s*(\/\/|\*)/.test(line)) return;
        calls.push({ file: f, line: i + 1, args: m[1].trim(), text: line.trim() });
    });
});

// The scan is proved before its silence is trusted: a regex that matched nothing would pass every
// assertion below by having nothing to check.
ok('the scan found the known call sites', calls.length >= 18,
   'found ' + calls.length);

console.log('\n--- every save() passes a payload ---');
var argless = calls.filter(function (c) {
    // One argument means only the key was passed.
    return c.args.split(',').length < 2;
});
argless.forEach(function (c) {
    console.log('        NO PAYLOAD: ' + c.file + ':' + c.line + '  ' + c.text);
});
ok('no store calls save() with a key and nothing else', argless.length === 0,
   argless.length + ' of ' + calls.length + ' call sites upload nothing');

console.log('\n--- every synced key is written by someone ---');
/* The other half of the same question. A key in SYNC_KEYS that nothing ever saves is a store the
   user believes is backed by the cloud and is not -- the same lie from the opposite direction. */
var SYNC_SRC = fs.readFileSync(path.join(ROOT, 'sync.js'), 'utf8');
var start = SYNC_SRC.indexOf('var SYNC_KEYS');
var block = SYNC_SRC.slice(start, SYNC_SRC.indexOf('};', start));
var keys = (block.match(/^\s*(\w+):/gm) || []).map(function (m) { return m.trim().replace(':', ''); });
ok('SYNC_KEYS was parsed, not guessed', keys.length >= 15, 'found ' + keys.length);

var saved = {};
calls.forEach(function (c) {
    var m = /^['"]([^'"]+)['"]/.exec(c.args);
    if (m) saved[m[1]] = true;
});
var neverSaved = keys.filter(function (k) { return !saved[k]; });
neverSaved.forEach(function (k) { console.log('        NEVER SAVED: ' + k); });
ok('every key in SYNC_KEYS has a writer', neverSaved.length === 0,
   neverSaved.join(', '));

console.log('\n--- the guard refuses an argless call rather than throwing three layers down ---');
/* sync.js needs a DOM and a firebase global to load, so the guard is checked as source. What is
   asserted is the ORDER that made the old bug permanent: the refusal has to come before
   _recentSaves is set, or a bad call still deafens the listener on its way out. */
var saveFn = SYNC_SRC.slice(SYNC_SRC.indexOf('function save(key, data)'));
saveFn = saveFn.slice(0, saveFn.indexOf('\n    function '));
var guardAt = saveFn.indexOf('data === undefined');
var flagAt = saveFn.indexOf('_recentSaves[key] = true');
ok('there is a guard on the payload', guardAt >= 0);
ok('and it refuses BEFORE the suppression flag is set', guardAt >= 0 && flagAt > guardAt,
   'guard at ' + guardAt + ', flag at ' + flagAt);
ok('the payload build is wrapped rather than left to throw into the timer',
   /try\s*\{[\s\S]*JSON\.parse\(JSON\.stringify\(data\)\)/.test(saveFn));
ok('and a failure clears the flag rather than stranding it',
   (saveFn.match(/delete _recentSaves\[key\]/g) || []).length >= 3,
   'found ' + (saveFn.match(/delete _recentSaves\[key\]/g) || []).length + ' clear paths');

console.log('\n' + (fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                               : pass + ' passed, ' + fail + ' FAILED'));
process.exit(fail === 0 ? 0 : 1);
