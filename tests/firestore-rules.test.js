// Tests for firestore.rules.
//
// These do NOT run the Firebase rules emulator — that would need npm, and this repo has zero
// dependencies. What they do instead is the thing that actually goes wrong in practice: they
// check that the rules file still describes the code.
//
// The failure mode being guarded is drift. Somebody adds a second Firestore collection, ships it,
// and the rules file still only names users/{uid}/data. Because the default-deny at the bottom is
// the last match, the new collection silently fails in production — or, far worse, somebody
// "fixes" that by loosening the rules and nobody notices what else opened.
//
// So: every Firestore path the client actually uses must appear in firestore.rules, and the rules
// must never contain a blanket allow.

var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');

var pass = 0, fail = 0;
function eq(label, actual, expected) {
    if (actual === expected) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + '\n        expected ' + JSON.stringify(expected) +
                               '\n        actual   ' + JSON.stringify(actual)); }
}
function ok(label, cond, note) { eq(label + (note ? '  (' + note + ')' : ''), !!cond, true); }

// ---- 1. the file exists and is wired up --------------------------------------------------------

console.log('\n=== the rules exist and are deployable from this repo ===');
(function() {
    var rulesPath = path.join(ROOT, 'firestore.rules');
    ok('firestore.rules exists', fs.existsSync(rulesPath),
       'on a static site these ARE the authorization layer');
    ok('firebase.json exists, so the rules deploy from source not a console',
       fs.existsSync(path.join(ROOT, 'firebase.json')));

    var cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'));
    eq('and it points at the rules file', cfg.firestore && cfg.firestore.rules, 'firestore.rules');
})();

var RULES = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');

// Comments stripped for any check that reasons about RULE STATEMENTS. This file is heavily
// commented on purpose, and prose containing the word "allowed" is not an allow statement — the
// first version of this test read "The one allowed surface." as a third, unconditioned rule.
// Checks that assert the COMMENTS are still present deliberately use the raw text instead.
var CODE = RULES.replace(/\/\/[^\n]*/g, '');

// ---- 2. nothing is blanket-open ----------------------------------------------------------------

console.log('\n=== no blanket allow ===');
(function() {
    // The Firebase console's own "test mode" default. If this string ever appears, the database is
    // world-readable and world-writable by anyone who knows the project id, which is public.
    var blanket = /allow\s+(read|write|get|list|create|update|delete)[^:]*:\s*if\s+true/i;
    ok('no rule allows anything unconditionally', !blanket.test(CODE),
       'this is what Firebase test mode ships');

    ok('there is an explicit default deny', /match\s*\/\{document=\*\*\}[\s\S]*?allow[^;]*if\s+false/.test(CODE),
       'anything unmatched must be refused, not undefined');

    // Every allow must be conditioned on the caller being the owner of the path.
    var allows = CODE.match(/allow[^;]+;/g) || [];
    var conditioned = allows.filter(function(a) {
        return /if\s+false/.test(a) || /request\.auth\.uid\s*==\s*uid/.test(a);
    });
    eq('every allow is either a deny or an owner check', conditioned.length, allows.length);
    ok('and there is at least one of each', allows.length >= 2, allows.length + ' allow statements');
})();

// ---- 3. the rules still describe the code ------------------------------------------------------

console.log('\n=== the rules cover every path the client actually uses ===');
(function() {
    // Scan the client JS for Firestore access. Deliberately excludes site/ (the marketing site
    // loads no Firebase), worker*/ (server-side, uses KV not Firestore) and tests/.
    var files = fs.readdirSync(ROOT).filter(function(f) {
        return /\.js$/.test(f) && f !== 'chart.min.js';
    });

    var collections = {};
    files.forEach(function(f) {
        var src = fs.readFileSync(path.join(ROOT, f), 'utf8');
        // db.collection('users') / .collection('data') — capture the literal name.
        var re = /\.collection\(\s*['"]([A-Za-z0-9_-]+)['"]\s*\)/g, m;
        while ((m = re.exec(src)) !== null) {
            (collections[m[1]] = collections[m[1]] || []).push(f);
        }
    });

    var names = Object.keys(collections).sort();
    console.log('        collections referenced in client code: ' +
                (names.length ? names.join(', ') : '(none)'));

    ok('the client touches at least one collection', names.length > 0,
       'zero would mean this scan is broken, not that the code is clean');

    // Every collection named in the code must appear somewhere in a match path in the rules.
    var uncovered = names.filter(function(n) {
        return CODE.indexOf('/' + n + '/') < 0 && CODE.indexOf('/' + n + ' ') < 0 &&
               !new RegExp('match\\s+/[^\\n]*\\b' + n + '\\b').test(CODE);
    });
    eq('every collection the code uses appears in the rules', uncovered.join(', '), '');

    // The specific known surface, pinned. If this changes, the rules must change with it.
    ok('users is still one of them', names.indexOf('users') >= 0);
    ok('data is still one of them', names.indexOf('data') >= 0);
    eq('and there are still exactly two, so no new surface appeared unnoticed', names.length, 2);
})();

// ---- 4. what the rules deliberately do NOT do --------------------------------------------------

console.log('\n=== the deliberate omissions are still deliberate ===');
(function() {
    // Enforcing email verification here would lock out any account that never clicked the link,
    // possibly including the operator's, since nothing in the app has ever enforced it. The
    // decision is recorded in the rules file itself; this asserts the reasoning is still there so
    // a future reader does not "helpfully" add it without knowing why it was left out.
    ok('email verification is not enforced in rules, and says why',
       !/email_verified\s*==\s*true/.test(RULES) && /email_verified/.test(RULES),
       'it is enforced at invite redemption instead');

    ok('the parent user document is not left open',
       !/match\s+\/users\/\{uid\}\s*\{[\s\S]{0,200}?allow\s+read/.test(CODE));
})();

console.log('');
console.log(fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                       : pass + ' passed, ' + fail + ' FAILED');
process.exit(fail === 0 ? 0 : 1);
