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

/* THE GROUND IS BLACK, AND THE ONLY THING ON IT IS THE RISING PIXELS.

   This has been got wrong in both directions now. A re-skin hid the canvas and left a flat
   black page with nothing on it; the repair brought the canvas back but also restored a
   five-layer platinum gradient field and an 88px grid that were never asked for, so the ground
   read as washed grey with a visible grid instead of as black. Both times the page had a
   "background" and neither time was it the one requested.

   These two assertions are a stated preference rather than a law of the codebase, and they are
   written down precisely because a preference nobody records is a preference that gets
   overridden by the next person with a reference screenshot. */

var bodyRule = RULES.filter(function (r) { return r.sel === 'body'; })[0];
ok('the page ground is black',
   !!bodyRule && /background\s*:\s*var\(--black\)/.test(bodyRule.body));

var bodyBefore = RULES.filter(function (r) { return r.sel === 'body::before'; });
/* The rule stays even with nothing to paint: it establishes the stacking context that
   `body > * { z-index: 1 }` and the fixed canvas at z-index 0 are ordered against. */
ok('body::before still establishes the stacking context', bodyBefore.length > 0);

/* Non-vacuous on purpose: this fails the moment ANY background image is painted over the
   ground, rather than only catching the literal `background-image: none` it replaced -- which
   passed trivially once the declaration was deleted rather than set to none. */
var painted = bodyBefore.filter(function (r) { return /background-image\s*:/.test(r.body); })
                        .map(function () { return 'body::before'; });
eq('nothing washes over the black ground', painted.join(', ') || 'none', 'none');

/* ---- 4. A SURFACE DOES NOT CHANGE ITS MIND UNDER THE POINTER ------------------------------ */

/* Deliberately NOT an assertion that the card is opaque, nor that it is translucent. Either is
   a legitimate design: the field can live in the ground with black windows in front of it, or
   it can show through them. What is never right is a card whose RESTING and HOVER states
   disagree, because then the animation switches on or off under the cursor.

   That shipped. --card was made translucent and .metric-card:hover was left pointing at the
   opaque --card-2, so hovering any tile snapped the field off behind it. Both rules were
   individually reasonable and the bug existed only in the pair -- the same shape as the
   specificity bug at the top of this file, which is why this file asserts relationships. */

function tokenValue(name) {
    var m = TOKENS_C.match(new RegExp('--' + name + '\\s*:\\s*([^;]+);'));
    return m ? m[1].trim() : null;
}
/* Translucent means an rgba()/hsla() whose alpha is below 1. */
function isTranslucent(v) {
    if (!v) return false;
    var m = v.match(/\b(?:rgba|hsla)\([^)]*?,\s*([01]?\.?\d*)\s*\)/i);
    return !!m && parseFloat(m[1]) < 1;
}

var cardDecl = tokenValue('card');
ok('--card is defined', !!cardDecl);

/* Whichever token the hover points at, resolved rather than assumed. */
var hoverRule = RULES.filter(function (r) { return r.sel === '.metric-card:hover'; })[0];
var hoverToken = hoverRule && (hoverRule.body.match(/background(?:-color)?\s*:\s*var\(--([\w-]+)\)/) || [])[1];

ok('.metric-card:hover names a surface token', !!hoverToken, 'got ' + JSON.stringify(hoverToken));

if (hoverToken) {
    var restingT = isTranslucent(cardDecl);
    var hoverT = isTranslucent(tokenValue(hoverToken));
    eq('the stat tile does not change opacity under the pointer',
       restingT === hoverT ? 'consistent'
         : 'resting=' + (restingT ? 'translucent' : 'opaque') +
           ' but hover(--' + hoverToken + ')=' + (hoverT ? 'translucent' : 'opaque'),
       'consistent');
}

/* Whether or not the cards transmit, the field must exist in the GROUND. That is what the
   #gasField and body::before assertions above carry, and they are the ones holding the
   actual request. */

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
