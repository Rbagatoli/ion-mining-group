/* Can anything in the workspace actually be reached?
 *
 * A census, not a unit test: it reads the repo, the way sync-coverage.test.js and
 * backup-coverage.test.js do. It exists because of a failure no unit test can see.
 *
 * procurement.js read `project.procurement` correctly, project-model.js stored it correctly, and
 * the panel rendered it correctly — and the feature was inert, because NOTHING IN THE REPO EVER
 * WROTE TO IT. The panel said "nothing on the schedule yet" on every project, permanently. Every
 * module was right on its own; the gap was between them, which is exactly where a test that
 * imports one module and drives it cannot look. The same audit found ProjectBudget — a ledger
 * with ninety-three passing assertions — with no caller anywhere outside its own tests, and
 * `milestones` declared as a collection with no code of any kind behind it.
 *
 * This asserts three joins, and each one is a place a correct module goes nowhere:
 *
 *   1. every per-project collection has something that writes it
 *   2. every module that writes one is called from somewhere that is not itself or a test
 *   3. every module a UI guards with `typeof X === 'undefined'` is on the pages that guard it
 *
 * The third is the graceful-guard rule in census form. A typeof guard turns a missing script tag
 * into a blank section that reads exactly like a feature with nothing to show — which is how the
 * procurement panel shipped invisible with every source-level assertion still green. Anything
 * that fails soft needs something that fails hard pointed at the same fact.
 *
 * EVERY SCAN PROVES ITSELF BEFORE ITS SILENCE IS TRUSTED. A regex that matched nothing would
 * pass every assertion below by having nothing to check, which is the failure mode a census is
 * most exposed to.
 */
var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var ROOT = path.join(__dirname, '..');

var pass = 0, fail = 0;
function ok(label, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + (detail ? '\n        ' + detail : '')); }
}

var JS = fs.readdirSync(ROOT).filter(function (f) {
    return /\.js$/.test(f) && f !== 'chart.min.js';
});
var HTML = fs.readdirSync(ROOT).filter(function (f) { return /\.html$/.test(f); });
var SRC = {};
JS.forEach(function (f) { SRC[f] = fs.readFileSync(path.join(ROOT, f), 'utf8'); });
var PAGE = {};
HTML.forEach(function (f) { PAGE[f] = fs.readFileSync(path.join(ROOT, f), 'utf8'); });

ok('the repo scan found the modules', JS.length > 40, JS.length + ' .js files');
ok('and the pages', HTML.length > 3, HTML.length + ' .html files');

/* Global name -> file, parsed from the real declarations rather than listed here. A hand-written
   map would agree with a past version of the repo, which is the thing a census must not do. */
var MODULE_OF = {};
JS.forEach(function (f) {
    var m = /^var\s+([A-Za-z][A-Za-z0-9_]*)\s*=\s*\(function/m.exec(SRC[f]);
    if (m) MODULE_OF[m[1]] = f;
});
ok('module globals were parsed from their declarations',
   Object.keys(MODULE_OF).length > 20, Object.keys(MODULE_OF).length + ' found');
['ProjectData', 'ProjectBudget', 'ProjectProcurement', 'ProjectContractors'].forEach(function (n) {
    ok('the parse found ' + n, MODULE_OF[n] !== undefined);
});

// ---- 1. every collection has a writer ---------------------------------------------------------
console.log('\n--- every per-project collection is written by something ---');
var decl = /var\s+COLLECTIONS\s*=\s*\[([\s\S]*?)\]/.exec(SRC['project-model.js']);
ok('COLLECTIONS was found in project-model.js', !!decl);
var COLLECTIONS = decl ? (decl[1].match(/'([^']+)'/g) || []).map(function (s) {
    return s.slice(1, -1);
}) : [];
ok('and it parsed to a real list', COLLECTIONS.length >= 4, JSON.stringify(COLLECTIONS));

/* AN ASSIGNMENT, NOT A MENTION. The first version matched any `.collection[` and counted
   project-budget.js's `var c = p.contractors[cid]` — a READ, for validating a change order's
   attribution — as proof that something wrote the contractors map. A collection that is only
   ever read through bracket access would have passed while nothing filled it, which is the exact
   failure this file exists to catch, one level up. */
function writeSites(name) {
    var hits = [];
    JS.forEach(function (f) {
        if (f === 'project-model.js') return;   // declares them; does not use them
        SRC[f].split(/\r?\n/).forEach(function (line, i) {
            if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;      // prose is not a write
            if (new RegExp('\\.' + name + '\\s*\\[[^\\]]*\\]\\s*=[^=]').test(line)) {
                hits.push(f + ':' + (i + 1));
            }
        });
    });
    return hits;
}

/* The scan is proved before its silence is trusted: budget_lines is known to be written by
   project-budget.js, so a regex that found nothing would fail here rather than passing
   everything below. */
ok('the write-site scan finds a known writer', writeSites('budget_lines').length > 0);

COLLECTIONS.forEach(function (c) {
    var sites = writeSites(c);
    ok('"' + c + '" is written by something', sites.length > 0,
       'nothing in the repo writes project.' + c +
       ' — the panel that reads it will report empty forever');
});

// ---- 2. every writing module has a caller -----------------------------------------------------
console.log('\n--- every module that writes a collection is called from somewhere ---');
var writers = {};
COLLECTIONS.forEach(function (c) {
    writeSites(c).forEach(function (s) { writers[s.split(':')[0]] = true; });
});
ok('the collections resolve to writer modules', Object.keys(writers).length >= 2,
   Object.keys(writers).join(', '));

function globalOf(file) {
    for (var n in MODULE_OF) if (MODULE_OF[n] === file) return n;
    return null;
}

/* A writer is a function whose body reaches ProjectData.mutate(). Definitional rather than a
   name heuristic: 'add', 'set' and 'record' are conventions that the next module is free to
   break, and a census built on a naming convention proves the convention, not the behaviour. */
function writerFunctionsOf(src) {
    var out = [];
    var re = /function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)\s*\{/g, m;
    while ((m = re.exec(src)) !== null) {
        // Walk braces from the opening one to find the body, so a nested function cannot leak.
        var i = re.lastIndex - 1, depth = 0, end = -1;
        for (var j = i; j < src.length; j++) {
            if (src[j] === '{') depth++;
            else if (src[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
        }
        if (end < 0) continue;
        var body = src.slice(i, end);
        if (/ProjectData\.mutate\s*\(/.test(body)) out.push(m[1]);
    }
    // Only what the module actually hands out; an internal helper is not a write path.
    var ret = src.slice(src.lastIndexOf('return {'));
    return out.filter(function (fn) {
        return new RegExp('(^|[^a-zA-Z_])' + fn + '\\s*:').test(ret);
    });
}

function calledOutside(globalName, fn, self) {
    var re = new RegExp(globalName + '\\.' + fn + '\\s*\\(');
    for (var i = 0; i < JS.length; i++) {
        if (JS[i] === self) continue;
        if (re.test(SRC[JS[i]])) return true;
    }
    return false;
}
Object.keys(writers).forEach(function (f) {
    var name = globalOf(f);
    ok(f + ' declares a module global', !!name);
    if (!name) return;
    var callers = JS.filter(function (g) {
        if (g === f) return false;
        // A call, not a mention: the name followed by .something(
        return new RegExp(name + '\\.[a-zA-Z_]+\\s*\\(').test(SRC[g]);
    });
    /* A module whose only caller is its own test file is a ledger nobody can reach. That is what
       ProjectBudget was: addLine, seedFromEstimate and addChangeOrder had no call site outside
       tests/ for the whole of Stage 4. */
    ok(name + ' is called from outside itself', callers.length > 0,
       'no file in the repo calls ' + name + '.* — it is reachable only from its tests');

    /* AND AT LEAST ONE OF ITS WRITERS IS REACHED, which is a different question and the one that
       actually distinguishes a usable ledger from a readable one. A module whose reads are
       called and whose writes never are is a panel you can look at and cannot add to — which is
       what both of these were until this pass. A writer is defined rather than guessed at: a
       function whose body calls ProjectData.mutate. */
    var writerFns = writerFunctionsOf(SRC[f]);
    ok(name + ' exposes writers this can find', writerFns.length > 0, 'none detected in ' + f);
    var reached = writerFns.filter(function (fn) { return calledOutside(name, fn, f); });
    ok(name + ' has at least one writer something calls', reached.length > 0,
       'every write path on ' + name + ' is unreachable: ' + writerFns.join(', '));
    var stranded = writerFns.filter(function (fn) { return reached.indexOf(fn) < 0; });
    if (stranded.length) {
        /* Printed, not asserted, and the difference is deliberate. Each of these is a real write
           path with no control behind it, but closing them is building UI rather than fixing a
           defect, and a test that goes red for work-not-yet-done stops being read. They are
           listed here and in WORKSPACE-BACKLOG.md so the count is visible rather than implied.
           The assertion above is the one that matters: a ledger with NO reachable writer. */
        console.log('        no caller yet: ' + name + '.' + stranded.join(', ' + name + '.'));
    }
});

// ---- 3. a module a RENDERER guards is on the page that renders it -----------------------------
console.log('\n--- every module a renderer guards is actually loaded beside it ---');
/* THE GUARD THAT MAKES A MISSING MODULE SAFE ALSO MAKES IT SILENT, so a soft `typeof X ===
   'undefined'` inside a file a page loads implies a claim: X is on that page.
 *
 * TWO NARROWINGS, both of which this got wrong on the first run and both of which matter.
 *
 * A GUARD THAT THROWS IS NOT THE PROBLEM -- it is the fix. site-model.js:461 does
 * `if (typeof SiteSources === 'undefined') throw` before promoting a candidate, which is a hard
 * failure pointed at exactly the fact the guard depends on. Flagging that would be flagging the
 * remedy, so only guards whose branch degrades quietly are checked.
 *
 * ONLY RENDERERS, because that is where a quiet guard does its damage. A MODEL that guards a
 * missing module returns null, and the layer above reports 'unknown' -- which is this codebase's
 * whole discipline working. A RENDERER that guards a missing module returns an empty string, and
 * an empty section is indistinguishable from a feature with nothing to show. That is precisely
 * how the procurement panel shipped invisible: prospect-detail.js guards ProjectProcurement,
 * prospecting.html loaded prospect-detail.js and not procurement.js, and every source-level
 * assertion stayed green.
 *
 * WHAT THIS DELIBERATELY DOES NOT COVER, so nobody reads it as exhaustive: transitive
 * dependencies. project-gates.js softly guards CrmDocuments, CrmEnrichment and SiteOpportunity,
 * and contacts.html and map.html load it (because project-model.js needs it) without loading
 * those three. Those pages cannot reach canAdvance(), so the guarded branches never run there --
 * but nothing here proves that, and a page that later grows a gate control would fail closed
 * rather than loudly. Recorded rather than asserted, because deciding it statically needs
 * reachability analysis and an exception list would be a guard that guards nothing. */
function loadsScript(pageSrc, file) {
    return pageSrc.indexOf('./' + file) >= 0;
}
/* A file that builds markup. The two markers the repo actually uses; asserted below so a rename
   cannot quietly empty this set and make every assertion vacuous. */
function isRenderer(src) {
    return /\.innerHTML\s*=/.test(src) || /function\s+render\s*\(/.test(src);
}
var RENDERERS = JS.filter(function (f) { return isRenderer(SRC[f]); });
ok('renderers were identified', RENDERERS.length >= 3, RENDERERS.join(', '));
ok('and prospect-detail.js is one of them', RENDERERS.indexOf('prospect-detail.js') >= 0);

/* Soft means the branch does not throw. Read to the end of the statement or block that follows
   the guard, which is where `return ''` or `throw` sits. */
function softGuards(src, self) {
    var out = {};
    var re = /typeof\s+([A-Za-z][A-Za-z0-9_]*)\s*===?\s*'undefined'/g, m;
    while ((m = re.exec(src)) !== null) {
        var name = m[1];
        if (!MODULE_OF[name] || MODULE_OF[name] === self) continue;
        var after = src.slice(m.index, m.index + 220);
        if (/\bthrow\b/.test(after.split(/\n/).slice(0, 3).join('\n'))) continue;  // hard: fine
        out[name] = MODULE_OF[name];
    }
    return out;
}
var guardChecks = 0;
RENDERERS.forEach(function (f) {
    var guarded = softGuards(SRC[f], f);
    var names = Object.keys(guarded);
    if (!names.length) return;
    HTML.forEach(function (h) {
        if (!loadsScript(PAGE[h], f)) return;
        names.forEach(function (n) {
            guardChecks++;
            ok(h + ' loads ' + guarded[n] + ', which ' + f + ' guards for',
               loadsScript(PAGE[h], guarded[n]),
               f + ' renders nothing at all when ' + n + ' is absent, and ' + h +
               ' does not load it — the section would simply not appear');
        });
    });
});
ok('the guard scan actually checked something', guardChecks >= 5,
   guardChecks + ' renderer/page guard pairs checked');
/* Proved rather than assumed: the scan must find the guard the procurement bug turned on, or
   its silence below means nothing. */
ok('the scan sees prospect-detail.js guarding ProjectProcurement',
   softGuards(SRC['prospect-detail.js'], 'prospect-detail.js').ProjectProcurement === 'procurement.js');
ok('and ProjectContractors',
   softGuards(SRC['prospect-detail.js'], 'prospect-detail.js').ProjectContractors
       === 'project-contractors.js');
ok('while site-model.js\'s throwing guard is not counted as soft',
   softGuards(SRC['site-model.js'], 'site-model.js').SiteSources === undefined);

// ---- 4. the offline copy of a page is the whole page ------------------------------------------
console.log('\n--- every script on a precached page is itself precached ---');
/* The same join as check 3, for the offline copy. A page in the service worker's ASSETS with a
   script that is not loads fine online and renders a section short offline -- and because both
   panels open with a typeof guard, the section does not error, it just is not there. Both ledger
   modules were in exactly that state.
 *
 * addAll() IS ATOMIC, which makes the second assertion below the sharpest one here: a single
 * entry that 404s rejects the whole install and the app precaches NOTHING. A typo in this list
 * does not cost one file, it costs offline entirely. */
var swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
var assetDecl = /const ASSETS = \[([\s\S]*?)\n\];/.exec(swSrc);
ok('the ASSETS list was found in sw.js', !!assetDecl);
var ASSETS = assetDecl
    ? (assetDecl[1].match(/'\.\/[^']+'/g) || []).map(function (s) { return s.slice(3, -1); })
    : [];
ok('and it parsed to a real list', ASSETS.length > 50, ASSETS.length + ' entries');

var cached = {}, dupes = [];
ASSETS.forEach(function (a) { if (cached[a]) dupes.push(a); else cached[a] = true; });
/* Harmless to addAll, which dedupes by request — but a precache list is read as an inventory,
   and a name appearing twice invites the next reader to ask which is authoritative. */
ok('no entry is listed twice', dupes.length === 0, 'duplicated: ' + dupes.join(', '));

var absent = ASSETS.filter(function (a) { return !fs.existsSync(path.join(ROOT, a)); });
ok('every entry exists on disk', absent.length === 0,
   'addAll() is atomic — these reject the whole install and precache NOTHING: ' + absent.join(', '));

/* AND EXISTS IN THE REPO, WHICH IS NOT THE SAME QUESTION AND IS THE ONE THAT MATTERS.
 *
 * The check above passed while sw.js named two files that would 404 on every deploy. They were
 * present on this disk and UNTRACKED — somebody's work in progress — so existsSync() confirmed
 * a fact about one laptop and nothing about what GitHub Pages would serve. The deployed tree is
 * the git tree, so that is what has to be asked, and asking the filesystem instead is a check
 * passing for a reason unrelated to what it claims.
 *
 * It is worth the extra assertion rather than folding into the one above because the two fail
 * for different reasons and want different fixes: a name absent from disk is a typo, a name
 * absent from git is a file somebody has not committed yet. */
var tracked = null;
try {
    tracked = {};
    cp.execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' })
      .split('\n').forEach(function (f) { if (f.trim()) tracked[f.trim()] = true; });
} catch (e) { tracked = null; }
/* The oracle is proved before its silence is trusted, the same as every other scan here: an
   empty or failed listing would clear every entry below by knowing about none of them. */
ok('git could list the tracked files', tracked && Object.keys(tracked).length > 100,
   tracked ? Object.keys(tracked).length + ' tracked' : 'git ls-files failed');
ok('and the listing includes a file that is certainly tracked', !!(tracked && tracked['sw.js']));
if (tracked && tracked['sw.js']) {
    var untracked = ASSETS.filter(function (a) { return !tracked[a]; });
    ok('every entry is committed to the repo', untracked.length === 0,
       'present on this machine and NOT in the repo, so they 404 on deploy and — addAll() being ' +
       'atomic — take the entire precache with them: ' + untracked.join(', '));
}

/* THE WHOLE SECTION ASKS ABOUT THE DEPLOYED TREE, WHICH IS THE GIT TREE.
 *
 * These two assertions pull in opposite directions the moment they disagree about which tree
 * they mean, and that is not a flaw in either — it is the same question asked from both ends.
 * ASSETS must not name a file that will not deploy; a page that DOES deploy must not load a
 * script that is missing from ASSETS. Read against the working tree they contradict each other
 * over any file in progress: an uncommitted map.html loading an uncommitted capacity-audit.js
 * demands a precache entry that the tracked-entries check then rejects.
 *
 * Neither is wrong. Both were reading the wrong tree. An uncommitted script tag does not deploy
 * either, so a script that is not in git is skipped here — and the moment somebody commits the
 * module and the page together, this immediately requires the ASSETS entry. The pairing is
 * enforced rather than remembered, which is the point. */
var cachedPages = ASSETS.filter(function (a) { return /\.html$/.test(a); });
ok('the list includes pages to check', cachedPages.length > 3);
var swGaps = 0, skipped = [];
cachedPages.forEach(function (p) {
    /* The dot in the class is load-bearing: an earlier version of this scan used
       [a-z0-9-]+\.js and silently skipped chart.min.js on every page, then reported it as
       cached-but-unused. A scan that cannot see a file cannot audit it. */
    var re = /src="\.\/([a-z0-9.-]+\.js)/g, m, seenHere = {};
    while ((m = re.exec(PAGE[p])) !== null) {
        if (seenHere[m[1]]) continue;
        seenHere[m[1]] = true;
        if (tracked && !tracked[m[1]]) { skipped.push(p + ' -> ' + m[1]); continue; }
        swGaps++;
        ok(p + ' is precached with ' + m[1], !!cached[m[1]],
           m[1] + ' is loaded by ' + p + ' but is not in ASSETS, so the offline copy of that ' +
           'page runs without it');
    }
});
/* NAMED, NEVER SILENT. A scan that quietly drops rows reports full coverage over a subset, and
   this file exists to catch exactly that shape of lie one layer up. */
if (skipped.length) {
    console.log('        not deployed yet, so not checked: ' + skipped.join(', '));
}
ok('the precache scan actually checked something', swGaps > 30, swGaps + ' page/script pairs');

console.log('');
console.log(fail ? '  ' + fail + ' FAILED, ' + pass + ' passed' : '  all ' + pass + ' passed');
process.exitCode = fail ? 1 : 0;
