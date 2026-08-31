/* ===== THE THREE THINGS A RE-SKIN QUIETLY TOOK =====

   A UI pass removed colour-coded numbers, the metal, and the background animation, and every
   test in the repo stayed green through all of it. Nothing asserted them, so nothing could.
   That is the same shape as the three stages that shipped inert: "all tests pass" was true and
   meaningless.

   The colour one is worth stating precisely, because it is the kind of bug that cannot be seen
   by reading either rule on its own. The markup is:

       <div class="value btc-orange">

   so the modifier sits on the SAME element as .value. When the re-skin added

       .metric-card .value { color: var(--plat-000); }

   that selector is (0,2,0) and .btc-orange is (0,1,0), so the white won on all 325 coloured
   values across six pages. Both rules are individually correct and the markup is unchanged;
   only the RELATIONSHIP is wrong. A screenshot catches it, a human catches it, and no
   assertion in the repo did.

   So this file asserts the relationship, not the declarations: whatever a future pass does to
   the typography of a value, a modifier class must still be able to win.

   Comments are stripped before anything is matched. A hex or a selector inside a comment is
   not a rule, and a scanner that cannot tell the difference reports on prose. */

'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var pass = 0, fail = 0;

function ok(label, cond, detail) {
    if (cond) { pass++; console.log('  ok    ' + label); }
    else { fail++; console.log('  FAIL  ' + label + (detail ? '   ' + detail : '')); }
}
function eq(label, actual, expected) {
    ok(label, actual === expected, 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}

function read(rel) {
    try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
    catch (e) { return null; }
}

/* Comments out first, always. */
function decomment(css) {
    return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/* Specificity as [ids, classes, elements]. Enough for this file's selectors: no :is()/:not()
   weighting games are used in shared.css, and :where() contributes zero by definition. */
function specificity(sel) {
    var s = sel.replace(/:where\([^)]*\)/g, ' ');
    var ids = (s.match(/#[\w-]+/g) || []).length;
    var classes = (s.match(/\.[\w-]+/g) || []).length +
                  (s.match(/\[[^\]]*\]/g) || []).length +
                  (s.match(/:(?!:)[\w-]+/g) || []).length;
    var els = (s.replace(/[.#:[][^\s>+~,]*/g, ' ').match(/\b[a-z][\w-]*/gi) || []).length;
    return [ids, classes, els];
}
function rank(sp) { return sp[0] * 10000 + sp[1] * 100 + sp[2]; }

/* Split a stylesheet into {selector, body} pairs, ignoring at-rule wrappers by flattening
   their inner blocks (which is what we want: a rule inside @supports still applies). */
function rules(css) {
    var out = [];
    var re = /([^{}]+)\{([^{}]*)\}/g;
    var m;
    while ((m = re.exec(css)) !== null) {
        var sel = m[1].trim();
        if (!sel || sel.charAt(0) === '@') continue;
        sel.split(',').forEach(function (one) {
            out.push({ sel: one.trim(), body: m[2] });
        });
    }
    return out;
}

console.log('\nthe app keeps its material');

var SHARED = read('shared.css');
var TOKENS = read('tokens.css');

ok('shared.css and tokens.css are readable', SHARED !== null && TOKENS !== null);
if (!SHARED || !TOKENS) { console.log('\n  ' + pass + ' passed, ' + fail + ' failed'); process.exit(1); }

var SHARED_C = decomment(SHARED);
var TOKENS_C = decomment(TOKENS);
var RULES = rules(SHARED_C);

/* ---- 1. THE COLOUR MODIFIERS CAN STILL WIN ---------------------------------------------- */

var MODIFIERS = ['positive', 'negative', 'neutral', 'btc-orange'];

MODIFIERS.forEach(function (m) {
    var defined = RULES.some(function (r) {
        return r.sel === '.' + m && /(^|[;\s])color\s*:/.test(r.body);
    });
    ok('.' + m + ' is defined and sets a colour', defined);
});

/* The assertion that matters. Any rule that sets `color` and can match an element carrying
   .value must not outrank a bare modifier class -- unless it names a modifier itself, which
   is a deliberate override rather than an accident. */
var MODIFIER_RANK = rank([0, 1, 0]);

var offenders = RULES.filter(function (r) {
    if (!/\.value(\b|[.:\s]|$)/.test(r.sel)) return false;
    if (!/(^|[;\s])color\s*:/.test(r.body)) return false;
    if (MODIFIERS.some(function (m) { return r.sel.indexOf('.' + m) >= 0; })) return false;
    return rank(specificity(r.sel)) > MODIFIER_RANK;
}).map(function (r) { return r.sel; });

eq('no rule outranks a colour modifier on .value', offenders.join(', ') || 'none', 'none');

/* And the default has to come from somewhere, or every uncoloured value falls back to the
   body colour and the pass silently changes those instead. Inherited is the only safe place:
   an inherited value loses to any direct rule regardless of specificity or source order. */
var inheritsDefault = RULES.some(function (r) {
    return r.sel === '.metric-card' && /(^|[;\s])color\s*:/.test(r.body);
});
ok('.metric-card supplies the default value colour by inheritance', inheritsDefault);

/* ---- 2. THE METAL ------------------------------------------------------------------------ */

/* Text-clipped metal needs all three of gradient, clip and transparent fill. Any one missing
   is either invisible text or a flat colour, and both have shipped before. */
function clipsMetal(selNeedle) {
    var r = RULES.filter(function (x) { return x.sel.indexOf(selNeedle) >= 0; });
    return r.some(function (x) {
        return /background-image\s*:\s*var\(--metal-/.test(x.body) &&
               /background-clip\s*:\s*text/.test(x.body) &&
               /-webkit-text-fill-color\s*:\s*transparent/.test(x.body);
    });
}

ok('.page-title is clipped platinum metal', clipsMetal('.page-title'));
ok('.value.btc-orange is clipped bitcoin metal', clipsMetal('.value.btc-orange'));

var btnPrimary = RULES.filter(function (r) { return r.sel === '.btn-primary'; });
ok('.btn-primary is filled with metal',
   btnPrimary.some(function (r) { return /background-image\s*:\s*var\(--metal-btc/.test(r.body); }));

var btnSecondary = RULES.filter(function (r) { return r.sel === '.btn-secondary'; });
ok('.btn-secondary keeps its machined platinum edge',
   btnSecondary.some(function (r) { return /var\(--metal-plat-flat\)\s*border-box/.test(r.body); }));

/* THE SHORTHAND TRAP, asserted so it cannot come back. `background:` is a shorthand and resets
   background-image to none. A blanket .btn:hover background fill therefore wipes the metal off
   both variants on hover -- which reads as a flicker, not as a bug, and so survives review. */
var blanketHover = RULES.filter(function (r) {
    return r.sel === '.btn:hover' && /(^|[;\s])background\s*:/.test(r.body);
});
eq('no blanket .btn:hover background shorthand to reset the metal', blanketHover.length, 0);

/* ---- 3. THE BACKGROUND ANIMATION --------------------------------------------------------- */

var gasRules = RULES.filter(function (r) { return r.sel === '#gasField'; });
ok('#gasField is styled', gasRules.length > 0);
eq('#gasField is not hidden',
   gasRules.filter(function (r) { return /display\s*:\s*none/.test(r.body); }).length, 0);

/* The canvas and its script have to be on the same page, or the module addresses nothing.
   This is the check that would have caught a page carrying one without the other. */
var PAGES = ['index.html', 'banking.html', 'calculator.html', 'charts.html', 'map.html', 'prospecting.html'];
var mismatched = PAGES.filter(function (p) {
    var html = read(p);
    if (html === null) return false;
    var hasCanvas = html.indexOf('id="gasField"') >= 0;
    var hasScript = html.indexOf('gas-field.js') >= 0;
    return hasCanvas !== hasScript;
});
eq('every page has the gas field canvas and its script together', mismatched.join(', ') || 'none', 'none');

var bodyBefore = RULES.filter(function (r) { return r.sel === 'body::before'; });
ok('body::before exists', bodyBefore.length > 0);
eq('the machinist field is painting, not switched to none',
   bodyBefore.filter(function (r) { return /background-image\s*:\s*none/.test(r.body); }).length, 0);
ok('the machinist field declares its drifting layers',
   bodyBefore.some(function (r) { return (r.body.match(/linear-gradient/g) || []).length >= 4; }));

/* ---- 4. THE FIELD IS ACTUALLY VISIBLE THROUGH THE CARDS ----------------------------------- */

/* An opaque card over a moving field hides it. Restoring the animation while leaving the cards
   opaque restores something visible only in the gaps, which is not what was asked for. --card
   must therefore carry an alpha channel. */
var cardDecl = (TOKENS_C.match(/--card\s*:\s*([^;]+);/) || [])[1];
ok('--card is defined', !!cardDecl);
ok('--card is translucent so the field shows through it',
   !!cardDecl && /rgba?\([^)]*,[^)]*,[^)]*,\s*0?\.\d+\s*\)/.test(cardDecl),
   'got ' + JSON.stringify(cardDecl));

/* ---- 5. A TONE RULE NEEDS A SURFACE TO PAINT ---------------------------------------------- */

/* The prospecting board colours its stages with `border-top-color`, and the Today view with
   `border-left-color`. A re-skin set `border: none` on both containers, which did not move
   that colour anywhere -- it deleted the edge the colour was painted on, and all nine rules
   went dead while remaining perfectly valid CSS.

   This is the generalisable version of the check: for every rule that sets border-<side>-color,
   the element it targets must actually declare a border on that side. Nothing here names the
   nine rules individually, so a tenth stage added later is covered without touching this file. */

var pros = read('prospecting.html');
ok('prospecting.html is readable', pros !== null);

if (pros !== null) {
    var styles = (pros.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [])
        .map(function (b) { return decomment(b.replace(/<\/?style[^>]*>/gi, '')); })
        .join('\n');
    var pRules = rules(styles);

    /* Which bases declare a border on which side. A shorthand `border:` counts only when it is
       not `none`; a longhand `border-top:` counts when it names a width. */
    function declaresBorderSide(base, side) {
        return pRules.some(function (r) {
            if (r.sel !== base) return false;
            if (new RegExp('border-' + side + '\\s*:\\s*(?!none)[^;]*\\d').test(r.body)) return true;
            return /(^|[;\s])border\s*:\s*(?!none)[^;]*\d/.test(r.body);
        });
    }

    var toneRules = pRules.filter(function (r) {
        return /border-(top|left|right|bottom)-color\s*:/.test(r.body);
    });

    ok('the stage tone rules still exist', toneRules.length >= 9,
       'found ' + toneRules.length);

    var dead = toneRules.filter(function (r) {
        var side = (r.body.match(/border-(top|left|right|bottom)-color/) || [])[1];
        var base = r.sel.split('.').slice(0, 2).join('.');   /* ".pb-col.t-active" -> ".pb-col" */
        return !declaresBorderSide(base, side);
    }).map(function (r) { return r.sel; });

    eq('every stage tone has a border to paint on', dead.join(', ') || 'none', 'none');
}

/* ---- 6. THE LIP AND THE SHEEN ------------------------------------------------------------- */

var lip = RULES.filter(function (r) {
    return (r.sel === '.card::before' || r.sel === '.metric-card::before') &&
           /background-image\s*:\s*var\(--edge-plat\)/.test(r.body);
});
eq('both the card and the stat tile keep the polished lip', lip.length, 2);

/* It sat at -1px to cap a 1px border. There is no border now, so -1px floats it above a
   rounded corner. Asserted because it is the kind of detail a restore gets wrong by being
   faithful to the wrong version. */
eq('the lip rides the edge rather than floating above it',
   lip.filter(function (r) { return /top\s*:\s*-1px/.test(r.body); }).length, 0);

var sheened = ['.card', '.metric-card'].filter(function (sel) {
    return RULES.some(function (r) {
        return r.sel === sel && /background-image\s*:\s*var\(--sheen-panel\)/.test(r.body);
    });
});
eq('the card and the stat tile are lit the same way', sheened.join(','), '.card,.metric-card');

console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
