// The signed-in portal is on paper; the sign-in is not.
//
// A producer reads a statement beside a paper invoice and sometimes prints it, so what is behind
// the sign-in is a document and is set on white. The sign-in itself is a front door and stays as
// it was. One class, body.pt-app, switches between them by redefining tokens, so every component
// follows and anything added later inherits it.
//
// EVERY ASSERTION BELOW EXISTS BECAUSE THE MISTAKE IT CATCHES WAS ACTUALLY MADE while writing the
// theme, and none of them were caught by looking at the page:
//
//   1. Contrast was measured against white. Almost nothing sits on white -- every figure is on a
//      card -- and two tokens that passed on the page ground failed on the card.
//   2. A rule was written for `.pt-banner`, a class that does not exist anywhere in the portal.
//      It styled nothing, and looked completely correct in the diff.
//   3. The total, the one figure a statement exists to deliver, was never the accent colour in
//      EITHER theme. `.pt-total td` is (0,1,1) and lost to `.pt-rows td:last-child` at (0,2,1).
//      The rest of that same rule applied, so the row still looked like a total.
//   4. The demo bar is painted with --btc-300, the token the light theme darkens, so making
//      statements legible would have quietly dimmed the warning that the figures are fake.

var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
var PORTAL = path.join(ROOT, 'portal');
var CSS = fs.readFileSync(path.join(PORTAL, 'portal.css'), 'utf8');

var CHR = String.fromCharCode(10);
var pass = 0, fail = 0;
function eq(label, actual, expected) {
    if (actual === expected) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + '\n        expected ' + JSON.stringify(expected) +
                               '\n        actual   ' + JSON.stringify(actual)); }
}
function ok(label, cond, note) { eq(label + (note ? '  (' + note + ')' : ''), !!cond, true); }

/* ---------- colour ---------- */
function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function lum(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return 0.2126 * lin(parseInt(h.slice(0, 2), 16)) +
           0.7152 * lin(parseInt(h.slice(2, 4), 16)) +
           0.0722 * lin(parseInt(h.slice(4, 6), 16));
}
function ratio(a, b) {
    var x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/* Read the tokens back out of the stylesheet rather than restating them here. A test that carries
   its own copy of the palette passes forever after somebody edits the real one. */
function lightBlock() {
    var at = CSS.indexOf('body.pt-app {');
    if (at < 0) return null;
    return CSS.slice(at, CSS.indexOf('}', at));
}
function token(name) {
    var block = lightBlock();
    if (!block) return null;
    var m = block.match(new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{3,8})\\s*;'));
    return m ? m[1].toLowerCase() : null;
}

console.log('\nthe light theme exists and is scoped');
ok('portal.css defines a body.pt-app block', !!lightBlock());
ok('statement.html is always on paper', /<body class="pt-app">/.test(
    fs.readFileSync(path.join(PORTAL, 'statement.html'), 'utf8')));

/* The sign-in must not pick the class up. show() takes 'auth' or 'main'; the toggle has to be
   keyed to 'main' specifically, not to "not auth", or a third view added later arrives on paper
   without anybody choosing that. */
var IDX = fs.readFileSync(path.join(PORTAL, 'index.html'), 'utf8');
ok("index.html applies pt-app only for the 'main' view",
   /classList\.toggle\('pt-app',\s*which === 'main'\)/.test(IDX));
ok('the sign-in keeps its own class', /classList\.toggle\('pt-signin',\s*which === 'auth'\)/.test(IDX));

/* ---------- 1. measured on the ground it lands on ---------- */
//
// The card, not the page. #f6f6f4 is 4% darker than white and costs about 8% of every ratio,
// which is the whole margin on the bottom of a ramp.
/* BOTH GROUNDS, AND THE TEST DOES NOT DECIDE WHICH IS WORSE.

   The first version hardcoded the card as the strict one, which was true when the page was
   #ffffff and the cards were slightly darker. Dimming the theme inverted that — the page is
   now the darker surface and the cards sit on top of it — and a test that had been told which
   ground to worry about would have gone on checking the easy one.

   So both are read out of the stylesheet and every colour has to clear on the worse of them.
   That holds whichever way round a future palette puts them. */
function groundOf(prop) {
    var block = lightBlock();
    var m = block && block.match(new RegExp(prop + ':\\s*(#[0-9a-fA-F]{6})'));
    return m ? m[1].toLowerCase() : null;
}
var PAGE = groundOf('background');
var CARD = groundOf('--surface-2');
ok('the page ground is declared', !!PAGE, PAGE);
ok('the card ground is declared', !!CARD, CARD);
function worst(hex) { return Math.min(ratio(hex, PAGE), ratio(hex, CARD)); }

console.log(CHR + 'every light-mode text colour clears 4.5:1 on the WORSE of the two grounds');
console.log('  page ' + PAGE + '   card ' + CARD +
            '   (strictest: ' + (lum(PAGE) < lum(CARD) ? 'page' : 'card') + ')');

[['plat-100', 'headings, rig names'],
 ['plat-200', 'figures, wordmark'],
 ['plat-300', 'status lines'],
 ['plat-400', 'row labels, subtitles'],
 ['plat-500', 'units, empty states'],
 ['plat-600', 'the footer, absent values'],
 ['btc-300',  'THE TOTAL'],
 ['neg',      'errors']
].forEach(function (t) {
    var hex = token(t[0]);
    if (!hex) { fail++; console.log('  FAIL  --' + t[0] + ' is not defined in the light block'); return; }
    var r = worst(hex);
    ok('--' + t[0] + ' ' + hex + ' is ' + r.toFixed(2) + ':1 on the worse ground', r >= 4.5, t[1]);
});

/* WHAT THE GROUNDS ARE IS A DESIGN DECISION AND IS NOT ASSERTED HERE.

   This file used to require the page to be below 85% luminance and the cards to sit lighter than
   it. That was correct for a theme that had been deliberately dimmed, and wrong the moment the
   brief went back to white — a test that pins a preference stops being a guard and starts being
   an argument with whoever is doing the design.

   What IS asserted is the thing that stays true whatever the palette does: everything has to
   remain legible on whatever ground it lands on, which the loop above checks, and the accent has
   to actually be present, which is checked below. */

/* THE ACCENT HAS TO SURVIVE AN EDIT. "Add some orange" is a request that quietly decays: a
   refactor drops a rule, a colour gets replaced with a neutral, and nothing fails. These are the
   places the accent earns its keep, so removing one is a decision somebody has to take on
   purpose rather than by accident. */
console.log(CHR + 'the accent is actually present, in more than one place');
[['h1::before', 'the rule above the page title'],
 ['body.pt-app .pt-head', 'the masthead rule'],
 ['body.pt-app .pt-section-label', 'section labels'],
 ['.pt-rows tr.pt-total td', 'the statement total'],
 ['.pt-pill--part', 'the incomplete pill'],
 ['.fc-range.is-on', 'the selected timeframe']
].forEach(function (t) {
    var at = CSS.indexOf(t[0]);
    var rule = at < 0 ? '' : CSS.slice(at, CSS.indexOf('}', at));
    ok(t[1] + ' carries the accent',
       at >= 0 && /--btc-300|#f7931a|--btc-on-wash|--line-btc/.test(rule), t[0]);
});

/* ---------- 1b. the status dots ---------- */
//
// Found by eye, not by the ramp loop above, because a 7px swatch is not text and so was not in
// the list. --pos shipped as #4ade80, tuned for black, and measured 1.61:1 on a light card.
//
// The failure mode is worse than "hard to see". The three dots meaning something is WRONG all
// landed comfortably while the one meaning "fine" was invisible, so a fleet with nothing wrong
// with it rendered as a row of blank cards. Blank does not read as healthy; it reads as broken.
// The assertion is therefore on the SET, not on each dot alone: they have to stay within reach
// of each other, or the absence of a mark starts carrying meaning nobody intended.
//
// (This section was deleted by accident while rewriting the block above it — the replaced span
// ran straight through it, and the file's total went UP because assertions were being added
// elsewhere at the same time, so nothing looked wrong. Restored, and the mutation run is what
// noticed: a dot mutation that should have failed came back green.)
console.log(CHR + 'the four rig-status dots are all visible, and none is conspicuously fainter');
var DOTS = [['pos', 'mining'], ['btc-300', 'not reporting'], ['neg', 'offline'], ['plat-600', 'unknown']];
var dotRatios = [];
DOTS.forEach(function (d) {
    var hex = token(d[0]);
    if (!hex) { fail++; console.log('  FAIL  --' + d[0] + ' is not defined in the light block'); return; }
    var r = worst(hex);
    dotRatios.push(r);
    // 3:1 is the floor for a non-text graphic (WCAG 1.4.11).
    ok('the "' + d[1] + '" dot (--' + d[0] + ' ' + hex + ') is ' + r.toFixed(2) + ':1 on the worse ground', r >= 3);
});
if (dotRatios.length === DOTS.length) {
    var lo = Math.min.apply(null, dotRatios), hi = Math.max.apply(null, dotRatios);
    ok('no dot is more than 2x fainter than the loudest',
       hi / lo <= 2, lo.toFixed(2) + ':1 to ' + hi.toFixed(2) + ':1');
}

/* ---------- 1b-ii. orange text on an orange wash ---------- */
//
// --btc-300 is the most chromatic orange that clears 4.5:1 on pure white, which means it clears
// it by almost nothing: on --btc-wash it drops to 3.96:1, and no alpha from 18% down to 6% gets
// it back over. The pairing simply cannot be made to work in this palette.
//
// So it is not tuned, it is forbidden. Anywhere the accent has to sit on its own tint uses
// --btc-on-wash, a deeper orange measured on that exact ground; anywhere it wants a filled
// orange background puts white on top instead. This asserts the deeper token clears where it is
// used, and that nothing has quietly reintroduced the pairing.
console.log(CHR + 'the accent never sits on its own wash');
(function () {
    var block = lightBlock();
    var m = block && block.match(/--btc-wash:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
    ok('the wash is declared as rgba', !!m);
    if (!m) return;
    var a = parseFloat(m[4]);
    /* Composited over the card, which is what everything using the wash sits on. */
    var under = [parseInt(CARD.slice(1, 3), 16), parseInt(CARD.slice(3, 5), 16), parseInt(CARD.slice(5, 7), 16)];
    var mix = [+m[1], +m[2], +m[3]].map(function (c, i) { return Math.round(c * a + under[i] * (1 - a)); });
    var ground = '#' + mix.map(function (c) { return ('0' + c.toString(16)).slice(-2); }).join('');

    var deep = token('btc-on-wash');
    ok('there is a deeper orange for text on the wash', !!deep, deep);
    if (deep) {
        var r = ratio(deep, ground);
        ok('and it reads on that ground (' + ground + ')', r >= 4.5, r.toFixed(2) + ':1');
    }

    /* The plain accent must NOT clear there — if it ever did, the deeper token would be dead
       weight and this whole rule could be dropped. Stating it keeps the reason visible. */
    var plain = ratio(token('btc-300'), ground);
    ok('the plain accent is the one that cannot', plain < 4.5, plain.toFixed(2) + ':1');

    /* AND THE PLACES THAT SIT ON THE WASH HAVE TO USE THE DEEPER ONE. Checking only that the
       token exists and clears was not enough: a mutation putting --btc-300 back on .pt-partial
       strong came through green, because nothing tied the measurement to the rule it was
       measured for. Every declaration whose ground is the wash is named here. */
    [['body.pt-app .pt-partial strong', 'the emphasis inside a partial-total notice']
    ].forEach(function (t) {
        var at = CSS.indexOf(t[0]);
        var rule = at < 0 ? '' : CSS.slice(at, CSS.indexOf('}', at));
        ok(t[1] + ' uses the deeper orange',
           at >= 0 && rule.indexOf('--btc-on-wash') >= 0, t[0]);
    });
})();

/* ---------- 1c. no colour is written into the markup ---------- */
//
// A literal colour in the HTML cannot follow a theme, and this page has two. The masthead ring
// shipped as stroke="#e5e4e2" -- correct on black, faint on the white theme, and completely
// invisible once the ground was dimmed, so the mark rendered as an orange dot with no ring.
// It was in the markup, so no amount of care in the stylesheet could have reached it.
//
// The brand dot is the deliberate exception: #f7931a is the same orange in both themes on
// purpose, which is exactly why it is named here rather than left to a blanket rule.
console.log(CHR + 'colour lives in the stylesheet, not in the markup');
['index.html', 'statement.html'].forEach(function (page) {
    var src = fs.readFileSync(path.join(PORTAL, page), 'utf8');
    var literals = (src.match(/(?:fill|stroke)="#[0-9a-fA-F]{3,8}"/g) || [])
        .filter(function (m) { return m.toLowerCase().indexOf('#f7931a') < 0; });
    eq(page + ' hardcodes no themed colour', literals.join(' '), '');
    ok(page + ' draws the ring in currentColor',
       src.indexOf('stroke="currentColor"') >= 0);
});

/* ---------- 2. no rule that styles nothing ---------- */
//
// Catches `.pt-banner`: a plausible name for a class this portal does not have. A dead selector
// is invisible in review because it looks exactly like a live one.
console.log('\nevery class targeted under body.pt-app exists somewhere in the portal');
var portalText = fs.readdirSync(PORTAL)
    .filter(function (f) { return /\.(html|js)$/.test(f); })
    .map(function (f) { return fs.readFileSync(path.join(PORTAL, f), 'utf8'); })
    .join('\n');

var targeted = {};
CSS.replace(/body\.pt-app([^{]*)\{/g, function (_, rest) {
    (rest.match(/\.pt-[a-z0-9-]+/g) || []).forEach(function (c) { targeted[c] = true; });
    return '';
});
ok('the sweep found some selectors to check', Object.keys(targeted).length > 0);

/* A BEM-style modifier is usually never written out in full. The rig cards are emitted as
       '<div class="pt-rig pt-rig--' + state + '">'
   so searching for the literal "pt-rig--stale" finds nothing and reports a live rule as dead --
   which is worse than not checking, because it trains people to ignore this test.

   So a modifier is cleared on two facts instead of one: the stem is concatenated somewhere, AND
   the modifier itself appears as a value. That still catches the case this guard is for -- an
   invented class like .pt-banner, which has no stem and no value anywhere -- and it also catches
   a modifier misspelt on one side only, which a stem-prefix check on its own would wave through. */
Object.keys(targeted).sort().forEach(function (cls) {
    var bare = cls.slice(1);
    if (portalText.indexOf(bare) >= 0) {
        ok(cls + ' is a class the portal actually renders', true);
        return;
    }
    var cut = bare.indexOf('--');
    if (cut > 0) {
        var stem = bare.slice(0, cut + 2);       // 'pt-rig--'
        var mod  = bare.slice(cut + 2);          // 'stale'
        ok(cls + ' is built from ' + JSON.stringify(stem) + ' + ' + JSON.stringify(mod),
           portalText.indexOf(stem) >= 0 && new RegExp("['\"]" + mod + "['\"]").test(portalText));
        return;
    }
    ok(cls + ' is a class the portal actually renders', false);
});

/* ---------- 3. the total wins its own cascade ---------- */
//
// Specificity, not appearance. The bug that hid here for the life of the file was that the rule
// existed, was correct, and lost -- while its border and font-size applied, so the row still
// looked deliberate. Compared against the two rules that actually beat it.
console.log('\nthe total is the accent colour, and outranks the rules that beat it before');
var spec = require('./site/cascade.js').specificity;
function cmp(x, y) { return (x[0] - y[0]) || (x[1] - y[1]) || (x[2] - y[2]); }

var TOTAL = '.pt-rows tr.pt-total td';
ok('portal.css carries the qualified total selector', CSS.indexOf(TOTAL) >= 0);
['.pt-rows td:first-child', '.pt-rows td:last-child'].forEach(function (rival) {
    ok(TOTAL + ' outranks ' + rival,
       cmp(spec(TOTAL), spec(rival)) > 0,
       spec(TOTAL).join(',') + ' vs ' + spec(rival).join(','));
});

/* And that it is still asking for the accent at all. */
var totalRule = CSS.slice(CSS.indexOf(TOTAL));
totalRule = totalRule.slice(0, totalRule.indexOf('}'));
ok('the total is set in --btc-300', /color:\s*var\(--btc-300\)/.test(totalRule));

/* ---------- 4. the warning stays loud ---------- */
//
// The demo bar says every figure on screen is invented. It is declared background: var(--btc-300),
// and --btc-300 is exactly what the light theme darkens for legibility -- so without its own rule
// a change about statements would have dimmed a warning and dropped its label to 4.15:1.
console.log('\nthe demo bar keeps the bright brand orange in light mode');
var barAt = CSS.indexOf('body.pt-app .pt-demobar');
ok('there is a light-mode rule for the demo bar', barAt >= 0);
if (barAt >= 0) {
    var bar = CSS.slice(barAt, CSS.indexOf('}', barAt));
    var bg = (bar.match(/background:\s*(#[0-9a-fA-F]{6})/) || [])[1];
    eq('it is painted the brand orange, not the ink orange', (bg || '').toLowerCase(), '#f7931a');
    ok('its black label reads at ' + ratio('#000000', '#f7931a').toFixed(2) + ':1',
       ratio('#000000', '#f7931a') >= 4.5);
    ok('it does not inherit the darkened token', bar.indexOf('var(--btc-300)') < 0);
}

console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
