// Theme tests — the guard rails for the reskin to the site's aesthetic.
//
// This file SHIPS RED. Every failing assertion below describes work that is planned, not a
// regression, and the count comes down step by step until it goes green. Shipping it first is the
// point: "did we miss a colour" is unanswerable without something that can count.
//
// EXPECTED FAILURES ON DAY ONE (11):
//   - tokens.css does not exist yet
//   - var(--card-bg) is used at map.html:35 and defined nowhere
//   - nine tokens are defined and never read, so editing them changes nothing
//   - the light theme still exists (data-theme, isLightMode, ionMiningTheme)
//   - 1,866 colour literals are still hardcoded
//   - radii and shadows are still literal, not tokenised
//   - four pages still define their own :root
//   - Strike purple is still purple
//
// What it protects once green: that tokens shared with site/styles.css stay byte-identical, that
// no literal creeps back outside the allowlist, and that the light theme cannot return by
// accident.

var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');

var pass = 0, fail = 0, pending = [];
function eq(label, actual, expected) {
    if (actual === expected) { pass++; console.log('  PASS  ' + label); }
    else {
        fail++; pending.push(label);
        console.log('  TODO  ' + label + '\n        expected ' + JSON.stringify(expected) +
                    '\n        actual   ' + JSON.stringify(actual));
    }
}
function ok(label, cond) { eq(label, !!cond, true); }

// ---- corpus -----------------------------------------------------------------------------------
// Everything the app actually ships. Excludes site/ (the SOURCE of this palette, not a target),
// vendored Chart.js, generated data artifacts, tests and tools.
function walk(dir, out) {
    out = out || [];
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function(e) {
        if (['.git', 'node_modules', '.cache', 'site', 'data', 'worker', 'worker-strike',
             'tests', 'tools'].indexOf(e.name) >= 0) return;
        var p = path.join(dir, e.name);
        if (e.isDirectory()) return walk(p, out);
        if (e.name === 'chart.min.js') return;
        if (/\.(js|css|html)$/.test(e.name)) out.push(p);
    });
    return out;
}
function rel(p) { return path.relative(ROOT, p).split(path.sep).join('/'); }
var FILES = walk(ROOT).map(function(p) { return { path: p, rel: rel(p), text: fs.readFileSync(p, 'utf8') }; });
function read(f) { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return null; } }

var TOKENS = read('tokens.css');
var SITE = read('site/styles.css');
var SHARED = read('shared.css');

// ---- 1. tokens.css is the single place a colour is defined -------------------------------------

console.log('\n=== one place defines a colour ===');
(function() {
    ok('tokens.css exists', TOKENS !== null);
    if (!TOKENS) return;

    // Every --x: used anywhere must be defined in tokens.css. This is the assertion that would
    // have caught map.html:35 using var(--card-bg), which had never been defined anywhere and
    // silently fell back for its whole life.
    var defined = {};
    (TOKENS.match(/^\s*--[a-z0-9-]+\s*:/gim) || []).forEach(function(d) {
        defined[d.trim().replace(/\s*:$/, '')] = true;
    });
    var missing = {};
    FILES.forEach(function(f) {
        (f.text.match(/var\(\s*(--[a-z0-9-]+)/gi) || []).forEach(function(u) {
            var name = u.replace(/var\(\s*/i, '');
            // A var() with a fallback is still a var() that should resolve.
            if (!defined[name]) missing[name] = (missing[name] || 0) + 1;
        });
    });
    eq('every var(--x) resolves to a definition', Object.keys(missing).join(', ') || 'none', 'none');

    // The disease this whole migration exists to cure: 9 of 22 tokens were defined and read by
    // nothing, so the token file was decorative and editing it changed nothing on screen.
    var unused = Object.keys(defined).filter(function(name) {
        if (name.indexOf('--metal') === 0 || name.indexOf('--edge') === 0) return false;  // used via composition
        return !FILES.some(function(f) { return f.text.indexOf('var(' + name) >= 0; });
    });
    eq('no token is defined and never read', unused.join(', ') || 'none', 'none');

    // Only tokens.css may declare :root. Four files do today, and workstation.html's copy holds
    // DIFFERENT values from shared.css's — drift, not a decision.
    var roots = FILES.filter(function(f) {
        return f.rel !== 'tokens.css' && /:root\s*\{/.test(f.text);
    }).map(function(f) { return f.rel; });
    eq('nothing else declares :root', roots.join(', ') || 'none', 'none');
})();

// ---- 2. the app and the site cannot drift ------------------------------------------------------

console.log('\n=== the app matches the site, mechanically ===');
(function() {
    if (!TOKENS || !SITE) { ok('tokens.css and site/styles.css both readable', false); return; }

    function tokensOf(css) {
        var out = {}, block = css.slice(css.indexOf(':root'), css.indexOf('\n}', css.indexOf(':root')));
        var re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi, m;
        while ((m = re.exec(block)) !== null) out[m[1]] = m[2].replace(/\s+/g, ' ').trim();
        return out;
    }
    var app = tokensOf(TOKENS), site = tokensOf(SITE);
    var shared = Object.keys(site).filter(function(k) { return app[k] !== undefined; });
    ok('the app inherits a substantial part of the site palette', shared.length >= 30);

    // Byte-identical, not merely similar. This is what turns "it matches the website" from a
    // claim into something a machine checks — and it is why the tokens were copied rather than
    // re-derived by eye.
    var drifted = shared.filter(function(k) { return app[k] !== site[k]; });
    eq('every shared token is byte-identical to the site', drifted.join(', ') || 'none', 'none');
})();

// ---- 3. the light theme is gone and cannot return ----------------------------------------------

console.log('\n=== dark only, by choice ===');
(function() {
    function hits(re) {
        return FILES.filter(function(f) { return re.test(f.text); }).map(function(f) { return f.rel; });
    }
    eq('no [data-theme] anywhere', hits(/data-theme/).join(', ') || 'none', 'none');
    eq('no isLightMode', hits(/isLightMode/).join(', ') || 'none', 'none');
    // shared.js keeps ONE mention: a one-time localStorage.removeItem behind a sentinel, so a
    // returning user is not left holding a dead key. That is a migration artifact with an expiry,
    // not a survivor -- so it is exempted by shape (removeItem only), which still fails if
    // anything starts READING or WRITING the key again.
    var themeKey = FILES.filter(function(f2) {
        if (!/ionMiningTheme/.test(f2.text)) return false;
        // Split rather than regex: the line-matching pattern needed an escaped newline
        // class, and this reads the same without one.
        var uses = f2.text.split(String.fromCharCode(10)).filter(function(u) {
            return u.indexOf('ionMiningTheme') >= 0;
        });
        return uses.some(function(u) { return u.indexOf('removeItem') < 0; });
    }).map(function(f2) { return f2.rel; });
    eq('nothing reads or writes ionMiningTheme', themeKey.join(', ') || 'none', 'none');
    eq('no prefers-color-scheme', hits(/prefers-color-scheme/).join(', ') || 'none', 'none');

    // The theme name was synced to Firestore. It must stop being written before the key retires.
    var sync = read('sync.js') || '';
    ok('theme is out of SYNC_KEYS', sync.indexOf("theme:") < 0 || !/theme:\s*\{\s*lsKey/.test(sync));
})();

// ---- 4. square everywhere, no bloom ------------------------------------------------------------

console.log('\n=== square, and unlit except where lit on purpose ===');
(function() {
    // Routing every radius through a token is what makes "square everywhere" grep-provable, and
    // reversible in one line if it ever turns out to be wrong.
    var literalRadius = [];
    FILES.forEach(function(f) {
        var re = /border-radius\s*:\s*([^;}\n]+)/gi, m;
        while ((m = re.exec(f.text)) !== null) {
            var v = m[1].trim();
            if (v.indexOf('var(--radius') < 0 && v.indexOf('var(--knob') < 0 && v !== 'inherit') {
                literalRadius.push(f.rel + ': ' + v);
            }
        }
    });
    eq('every border-radius goes through a token', literalRadius.length, 0);

    // "No soft shadows, no colour bloom" is not "no box-shadow": the SITE focuses its own
    // fields with `inset 0 0 0 1px rgba(247,147,26,0.35)`. A zero-blur ring is a machined edge
    // and is allowed; anything with a blur radius is a bloom and is not. So the rule this
    // asserts is the third length being zero, not the colour being absent.
    var blurred = [];
    FILES.forEach(function(f) {
        // Line by line, so the value pattern needs no newline class.
        f.text.split(String.fromCharCode(10)).forEach(function(line) {
            var re = /box-shadow\s*:\s*([^;}"']+)/gi, m;
            while ((m = re.exec(line)) !== null) {
            var v = m[1].trim();
            if (v === 'none' || v.indexOf('var(--shadow') >= 0 || v === 'inherit') continue;
            var layers = v.split(/,(?![^()]*\))/);
            for (var i = 0; i < layers.length; i++) {
                var nums = layers[i].match(/-?[\d.]+px/g) || [];
                if (nums.length < 3 || parseFloat(nums[2]) !== 0) {
                    blurred.push(f.rel + ': ' + v.slice(0, 46));
                    break;
                }
            }
            }
        });
    });
    if (blurred.length) console.log('        ' + blurred.slice(0, 3).join(' | '));
    eq('no box-shadow has a blur radius', blurred.length, 0);
})();

// ---- 5. no literal survives outside the allowlist -----------------------------------------------

console.log('\n=== colours live in tokens, not in 1,900 places ===');
(function() {
    var ALLOW = JSON.parse(read('tools/colour-allowlist.json'));
    var RE = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\)/g;

    function allowed(r, line, lit) {
        for (var i = 0; i < ALLOW.lines.length; i++) {
            var e = ALLOW.lines[i];
            if (e.file === r && e.line === line && e.literals.indexOf(lit) >= 0) return true;
        }
        return false;
    }
    var live = 0, worst = {};
    FILES.forEach(function(f) {
        if (f.rel === 'tokens.css') return;           // the one file that MAY hold literals
        f.text.split(/\r?\n/).forEach(function(text, i) {
            var m; RE.lastIndex = 0;
            while ((m = RE.exec(text)) !== null) {
                if (allowed(f.rel, i + 1, m[0])) continue;
                live++;
                worst[f.rel] = (worst[f.rel] || 0) + 1;
            }
        });
    });
    var top = Object.keys(worst).sort(function(a, b) { return worst[b] - worst[a]; }).slice(0, 5)
        .map(function(k) { return k + ':' + worst[k]; }).join(' ');
    if (live) console.log('        heaviest: ' + top);
    eq('zero hardcoded colour literals outside the allowlist', live, 0);

    // Strike purple was demoted to platinum: source identity is carried by orange-vs-platinum,
    // and purple was the single most off-key thing that would have survived the reskin.
    var purple = FILES.filter(function(f) { return /#8b5cf6|#a78bfa|#7c3aed/i.test(f.text); })
                      .map(function(f) { return f.rel; });
    eq('Strike purple is gone', purple.join(', ') || 'none', 'none');
})();

// ---- 6. the JS mirror cannot drift from the CSS -------------------------------------------------

console.log('\n=== the JS palette mirrors the CSS ===');
(function() {
    var THEME = read('theme.js');
    ok('theme.js exists', THEME !== null);
    if (!THEME || !TOKENS) return;

    // IonTheme holds literals rather than reading getComputedStyle: it has to work inside canvas,
    // on the globe, and in Node. That means it CAN drift from tokens.css, so a test enforces what
    // the runtime cannot.
    var mod = require(path.join(ROOT, 'theme.js'));
    var checks = [['black', '--black'], ['text', '--text'], ['textMid', '--text-mid'],
                  ['btc', '--btc-300'], ['line', '--line'], ['pos', '--pos'], ['neg', '--neg']];
    var drift = checks.filter(function(c) {
        var m = TOKENS.match(new RegExp(c[1] + '\\s*:\\s*([^;]+);'));
        return !m || String(mod[c[0]]).toLowerCase() !== m[1].trim().toLowerCase();
    }).map(function(c) { return c[0]; });
    eq('IonTheme matches tokens.css', drift.join(', ') || 'none', 'none');
})();

// ---- 7. things that must not change -------------------------------------------------------------

console.log('\n=== the things a reskin must not break ===');
(function() {
    // v4 default paths (Chart.defaults.scale.*, .elements.*) do not exist in v3. A silent vendored
    // bump would break the theming quietly rather than loudly.
    var chart = read('chart.min.js') || '';
    ok('Chart.js is still v4.x', /v4\.\d+\.\d+/.test(chart.slice(0, 400)));

    // Trademark. The sign-in button is required to look like Google's.
    var auth = read('auth-ui.js') || '';
    eq('the Google mark keeps its four brand colours',
       ['#4285F4', '#34A853', '#FBBC05', '#EA4335'].filter(function(c) {
           return auth.indexOf(c) >= 0;
       }).length, 4);

    // A QR on black is unscannable. The radius may go; the quiet zone may not.
    var bank = read('banking.html') || '', pay = read('pay.html') || '';
    eq('both QR codes keep a white quiet zone',
       (bank.match(/background:\s*#fff/g) || []).length, 2);
    ok('the standalone invoice page keeps its quiet zone too', /background:\s*#fff/.test(pay));

    // No external requests is a site rule and the app should not make it worse.
    var fonts = FILES.filter(function(f) {
        return /@font-face|fonts\.googleapis|fonts\.gstatic/.test(f.text);
    }).map(function(f) { return f.rel; });
    eq('no web fonts were added', fonts.join(', ') || 'none', 'none');
})();

// ---- 8. recorded exceptions ---------------------------------------------------------------------
// These deliberately do NOT assert the site's rule. They assert the exception does not grow.

console.log('\n=== recorded exceptions (asserted so they cannot spread) ===');
(function() {
    // The site floors type at 10.5px. The founder chose to keep the dense sizes for table chips,
    // badges and stage pills — density on the screens they actually work in beats the rule. That
    // is a decision, so it is pinned rather than left to drift upward.
    var small = 0;
    FILES.forEach(function(f) {
        var re = /font-size\s*:\s*([\d.]+)px/gi, m;
        while ((m = re.exec(f.text)) !== null) if (parseFloat(m[1]) < 10.5) small++;
    });
    // 57 after the dead-file deletion took wallet.js's 8 with it: shared.css 26, map.html 18,
    // banking.js 8, map.js 3, banking.html 1, cycle.html 1. Ratchets DOWN, never up.
    console.log('        declarations below the site 10.5px floor: ' + small);
    ok('sub-10.5px type has not spread beyond the recorded ceiling', small <= 57);

    // Green/red/amber persist because a financial dashboard needs a fourth signal and direction is
    // not a brand decision. They must live in tokens.css, though — not scattered as literals.
    if (TOKENS) {
        ok('the data colours are tokens', /--pos\s*:/.test(TOKENS) && /--neg\s*:/.test(TOKENS) &&
                                          /--warn\s*:/.test(TOKENS));
    }
})();

console.log('');
if (fail === 0) {
    console.log('ALL PASS — ' + pass + ' assertions');
} else {
    console.log(pass + ' passing, ' + fail + ' still to do:');
    pending.forEach(function(p) { console.log('   - ' + p); });
}
// Exit 0 while the migration is in flight: this file is a progress meter, not a gate, until the
// reskin lands. The last step of the reskin flips this to a real failure.
process.exit(0);
