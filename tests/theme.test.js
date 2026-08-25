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
//   - the light theme still exists (data-theme, isLightMode, protonMiningTheme)
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
        /* '_site' is the BUILD OUTPUT. It is gitignored, it is a copy of the files
           already being audited, and walking it made every counter in this file
           depend on whether somebody had run tools/build-pages.js: the literal
           census read 802 or 2,522, the sub-10.5px count 70 or 158, and the
           failure list 8 items or 9, for the same source tree. A progress meter
           that moves when nothing changed is not a progress meter. */
        /* 'portal' is a DIFFERENT SURFACE, and auditing it against the dark app's
           rules is a category error rather than a finding. The client portal and
           its printable statement are deliberately white paper with the cards
           defined by line rather than fill, carrying their own palette scoped to
           body.pt-app, their own deeper orange for text on a tint (#9e5200 at
           4.97:1, where --btc-300 falls to 3.96:1), and their own red "legible on
           paper rather than glowing". Four of this file's failures were nothing
           but that design being reported as damage: the second :root, two
           untokenised radii, the blurred shadows, and --btc-on-wash reported
           unresolved because the definition scanner only ever reads tokens.css.
           The portal is not left unguarded — the assertion below checks the thing
           that would actually hurt, which is that palette escaping into the app. */
        if (['.git', 'node_modules', '.cache', 'site', '_site', 'portal', 'data', 'worker', 'worker-strike',
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

// ---- 1b. the portal's paper palette stays in the portal ----------------------------------------

console.log('\n=== the paper theme cannot leak ===');
(function() {
    var portal = read('portal/portal.css');
    ok('portal/portal.css is readable', portal !== null);
    if (!portal) return;

    /* Every light-palette declaration in the portal must sit inside a rule scoped
       to body.pt-app (or :root:has(body.pt-app), which is how the root element is
       reached from a class the page sets on the body, so the scrollbar matches the
       paper). An unscoped light token would apply the moment portal.css is loaded
       anywhere, and portal.css is loaded by the sign-in screen too -- which is
       dark. This is the failure that would actually be visible. */
    var blocks = portal.split(/\}/);
    var leaked = [];
    for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        var brace = b.lastIndexOf('{');
        if (brace < 0) continue;
        var sel = b.slice(0, brace);
        var body = b.slice(brace + 1);
        if (!/--[a-z0-9-]+\s*:/i.test(body)) continue;      // no token definitions here
        if (/pt-app/.test(sel)) continue;                    // correctly scoped
        if (/^\s*:root\s*$/.test(sel)) continue;            // the dark defaults it shares
        leaked.push(sel.replace(/\s+/g, ' ').trim().slice(0, 60));
    }
    eq('every paper token is scoped to body.pt-app', leaked.join(', ') || 'none', 'none');

    /* And the app must not load it. If an operator page ever pulled portal.css in,
       the scoping above is the only thing standing between the app and a white
       page -- so the scoping is necessary, and this is the belt. */
    var pulls = FILES.filter(function(f) {
        return /\.html$/.test(f.rel) && /portal\.css/.test(f.text);
    }).map(function(f) { return f.rel; });
    eq('no app page loads portal.css', pulls.join(', ') || 'none', 'none');
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
        if (!/protonMiningTheme/.test(f2.text)) return false;
        // Split rather than regex: the line-matching pattern needed an escaped newline
        // class, and this reads the same without one.
        var uses = f2.text.split(String.fromCharCode(10)).filter(function(u) {
            return u.indexOf('protonMiningTheme') >= 0;
        });
        return uses.some(function(u) { return u.indexOf('removeItem') < 0; });
    }).map(function(f2) { return f2.rel; });
    eq('nothing reads or writes protonMiningTheme', themeKey.join(', ') || 'none', 'none');
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
    // (?<!&) keeps HTML numeric entities out -- &#9656; is a caret, not a colour.
    var RE = /(?<!&)#[0-9a-fA-F]{3,8}\b|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\)/g;

    // Context substring, not line number -- see the note in colour-allowlist.json.
    function allowed(r, text, lit) {
        for (var i = 0; i < ALLOW.lines.length; i++) {
            var e = ALLOW.lines[i];
            if (e.file === r && text.indexOf(e.contains) >= 0 && e.literals.indexOf(lit) >= 0) return true;
        }
        return false;
    }
    function fileAllowed(r) {
        var fl = ALLOW.files;
        for (var k in fl) {
            if (!Object.prototype.hasOwnProperty.call(fl, k)) continue;
            if (k.indexOf('**') >= 0 ? r.indexOf(k.replace('/**', '/')) === 0 : r === k) return true;
        }
        return false;
    }
    var live = 0, worst = {};
    FILES.forEach(function(f) {
        if (f.rel === 'tokens.css') return;           // the one file that MAY hold literals
        if (fileAllowed(f.rel)) return;
        f.text.split(/\r?\n/).forEach(function(text, i) {
            var m; RE.lastIndex = 0;
            while ((m = RE.exec(text)) !== null) {
                if (allowed(f.rel, text, m[0])) continue;
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

    // ProtonTheme holds literals rather than reading getComputedStyle: it has to work inside canvas,
    // on the globe, and in Node. That means it CAN drift from tokens.css, so a test enforces what
    // the runtime cannot.
    var mod = require(path.join(ROOT, 'theme.js'));
    var checks = [['black', '--black'], ['text', '--text'], ['textMid', '--text-mid'],
                  ['btc', '--btc-300'], ['line', '--line'], ['pos', '--pos'], ['neg', '--neg']];
    // A token may point at another token — --text-mid is var(--plat-400). theme.js cannot do
    // that, because a canvas has no element to resolve a variable against, so it holds the
    // literal. Follow one level of indirection here rather than calling the difference drift.
    function tokenValue(name, depth) {
        var m = TOKENS.match(new RegExp(name + '\\s*:\\s*([^;]+);'));
        if (!m) return null;
        var v = m[1].trim();
        var ref = v.match(/^var\(\s*(--[a-z0-9-]+)\s*\)$/i);
        if (ref && (depth || 0) < 4) return tokenValue(ref[1], (depth || 0) + 1);
        return v;
    }
    var drift = checks.filter(function(c) {
        var v = tokenValue(c[1], 0);
        return v === null || String(mod[c[0]]).toLowerCase() !== v.toLowerCase();
    }).map(function(c) { return c[0]; });
    eq('ProtonTheme matches tokens.css', drift.join(', ') || 'none', 'none');
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
    // 70: shared.css 26, map.html 18, prospecting.html 9, banking.js 8, portal/portal.css 4,
    // map.js 3, banking.html 1, cycle.html 1. Ratchets DOWN, never up.
    //
    // Was 57. The prospecting section and the client portal arrived after that number was
    // pinned and brought 13 between them, which is drift unless it is a decision -- so it is
    // recorded as one here. All nine in prospecting.html are the category the pin already
    // names: stage pills, source chips, the uppercase kind label on a timeline row, and mono
    // date stamps on a board card. Two that were NOT that -- the unit suffix and the
    // sample-size note on the analytics screen -- went back to 10.5px, because analytics is a
    // report with room on it and had no density argument to make.
    console.log('        declarations below the site 10.5px floor: ' + small);
    ok('sub-10.5px type has not spread beyond the recorded ceiling', small <= 70);

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
