/* ===== THE CLIENT PORTAL PRINTS ON PAPER, AND KEEPS ITS MEANINGFUL EDGES =====

   The client workspaces use the dark energy-scouting finish on screen. Statements still
   print on white paper. Media scope is part of every cascade check: a screen-only neutral
   border must not hide a printed state rule, or vice versa.

   Two things went wrong doing it, and both are the reason this file exists.

   FIRST: `border:` is a shorthand. Four rules in portal.css colour a card edge to MEAN
   something -- a machine nobody has heard from, one that is down, the pointer, and the total
   the statement exists to deliver. The lift was first written as a later rule setting
   `border: 1px solid transparent` at equal specificity, which reset all four. A stale machine
   lost its orange edge and the CSS stayed perfectly valid. This is the same defect that killed
   nine stage-tone rules in the operator app, so the check here is the general one: a rule that
   paints border-<side>-color needs its base to actually declare a border on that side.

   SECOND: the portal stamps its assets by content hash, and editing portal.css without
   re-running tools/build-asset-stamp.js leaves the pages loading a hash that no longer matches
   what they load. tests/portal-frontend.test.js already catches that one.

   Comments are stripped before anything is matched. */

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
function decomment(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }

/* {selector, body, at} for every rule, flattening at-rule wrappers but remembering which
   at-rule each came from, because "is this suppressed in print" is a question about that. */
function rules(css) {
    var out = [];
    var re = /(@media[^{]*\{)|([^{}]+)\{([^{}]*)\}|(\})/g;
    var stack = [], m;
    while ((m = re.exec(css)) !== null) {
        if (m[1]) { stack.push(m[1]); continue; }
        if (m[4]) { stack.pop(); continue; }
        var sel = (m[2] || '').trim();
        if (!sel || sel.charAt(0) === '@') continue;
        var at = stack.join(' ');
        sel.split(',').forEach(function (one) {
            out.push({ sel: one.trim(), body: m[3], at: at });
        });
    }
    return out;
}

console.log('\nthe client portal is dark on screen and keeps its paper in print');

var CSS = read('portal/portal.css');
var INDEX = read('portal/index.html');
ok('portal.css and portal/index.html are readable', CSS !== null && INDEX !== null);
if (CSS === null || INDEX === null) { console.log('\n  ' + pass + ' passed, ' + fail + ' failed'); process.exit(1); }

var R = rules(decomment(CSS));

function applies(r, medium, width) {
    if (/\bprint\b/.test(r.at) && medium !== 'print') return false;
    if (/\bscreen\b/.test(r.at) && medium !== 'screen') return false;
    var max = r.at.match(/max-width\s*:\s*(\d+)px/);
    var min = r.at.match(/min-width\s*:\s*(\d+)px/);
    width = width || 1280;
    return !(max && width > +max[1]) && !(min && width < +min[1]);
}

/* The selectors checked below are explicit aliases for the same element. This is a small
   cascade resolver, not a DOM selector engine; it preserves specificity and source order. */
function specificity(sel) {
    return (sel.match(/#[\w-]+/g) || []).length * 10000 +
           (sel.match(/\.[\w-]+|:(?!:)[\w-]+|\[[^\]]+\]/g) || []).length * 100 +
           (sel.match(/(?:^|\s|>)([a-z][\w-]*)/gi) || []).length;
}
function styleFor(selectors, medium) {
    var result = {};
    R.map(function (r, index) { return { rule: r, index: index }; })
     .filter(function (item) { return applies(item.rule, medium) && selectors.indexOf(item.rule.sel) >= 0; })
     .sort(function (a, b) { return specificity(a.rule.sel) - specificity(b.rule.sel) || a.index - b.index; })
     .forEach(function (item) {
        item.rule.body.split(';').forEach(function (decl) {
            var cut = decl.indexOf(':');
            if (cut >= 0) result[decl.slice(0, cut).trim()] = decl.slice(cut + 1).trim();
        });
     });
    return result;
}
function resolve(value, tokens) {
    for (var i = 0; value && /var\(/.test(value) && i < 10; i++) {
        value = value.replace(/var\((--[\w-]+)\)/g, function (_, key) { return tokens[key] || 'UNRESOLVED(' + key + ')'; });
    }
    return value;
}

ok('screen rules are excluded from print', !applies({ at: '@media screen {' }, 'print'));
ok('print rules are excluded from screen', !applies({ at: '@media print {' }, 'screen'));
ok('desktop checks exclude narrow-screen overrides', !applies({ at: '@media screen and (max-width: 560px) {' }, 'screen'));
ok('narrow-screen rules still apply on a phone', applies({ at: '@media screen and (max-width: 560px) {' }, 'screen', 375));

/* ---- 1. A MEANINGFUL EDGE NEEDS AN EDGE ---------------------------------------------------- */

/* For every rule that sets border-<side>-color, find the base selector it modifies and confirm
   something declares a border on that side for it. Nothing below names .pt-rig--stale or any
   other rule individually, so a fifth state added later is covered without touching this file. */

/* Both spellings count. .pt-rig--stale sets `border-color` for all four sides; other rules set
   a single side. The first version of this test only looked for the side-specific form and so
   found one rule out of five -- it would have passed while watching almost nothing. */
var COLOUR_RE = /(?:^|[;\s])border(?:-(top|right|bottom|left))?-color\s*:/;

/* SCOPE MATTERS, and getting this wrong made the first version of this check useless.

   Asking "does any rule anywhere give .pt-card a border" is always yes -- the DARK sign-in
   theme declares one. So a paper-theme rule setting `border: none` killed the hover and total
   edges and the check happily passed, because it was looking at the front door's border while
   the bug was in the document's. A mutation proved it: the statement-card mutation survived.

   So resolve the border the way the cascade does. Among the rules that declare a border
   shorthand for this class, a body.pt-app one wins for the paper theme (higher specificity,
   always); otherwise the last unscoped one applies. Then ask whether THAT one is `none`. */
function borderDeclFor(cls, scoped, medium) {
    var declares = R.filter(function (r) {
        if (!applies(r, medium)) return false;
        /* The BASE rule only. Its last compound must be exactly ".cls" -- not
           ".pt-card:has(.pt-total)", which declares a border-left for the one card carrying a
           total, and not ".pt-card.pt-clickable:hover". Counting those as the base border is
           how the first scope-aware version still missed the statement-card mutation: a rule
           that applies to one card in the list was answering for all of them. */
        if (r.sel.split(/\s+/).pop() !== '.' + cls) return false;
        return !COLOUR_RE.test(r.body) &&
               /(^|[;\s])border(-(top|right|bottom|left))?\s*:/.test(r.body);
    });
    var inApp = declares.filter(function (r) { return r.sel.indexOf('body.pt-app') === 0; });
    var outside = declares.filter(function (r) { return r.sel.indexOf('body.pt-app') !== 0; });
    var winners = (scoped && inApp.length) ? inApp : outside;
    return winners.length ? winners[winners.length - 1] : null;
}

function someRuleGivesBorder(cls, scoped, medium) {
    var w = borderDeclFor(cls, scoped, medium);
    if (!w) return false;
    if (/(^|[;\s])border(-(top|right|bottom|left))?\s*:\s*none/.test(w.body)) return false;
    return /(^|[;\s])border(-(top|right|bottom|left))?\s*:\s*[^;]*\d/.test(w.body) ||
           /(^|[;\s])border-width\s*:/.test(w.body);
}

/* The base class a modifier hangs off: ".pt-rig--stale" -> "pt-rig",
   ".fc-toggle--accent.is-on" -> "fc-toggle", ".pt-card.pt-clickable:hover" -> "pt-card". */
function baseClassesOf(sel) {
    var last = sel.split(/\s+/).pop();
    var classes = (last.match(/\.[A-Za-z_][\w-]*/g) || []).map(function (c) { return c.slice(1); });
    var out = [];
    classes.forEach(function (c) {
        out.push(c);
        var stripped = c.replace(/--[\w-]+$/, '');
        if (stripped !== c) out.push(stripped);
    });
    return out;
}

var coloured = R.filter(function (r) { return COLOUR_RE.test(r.body); });
ok('the portal still colours edges to mean something', coloured.length >= 4,
   'found ' + coloured.length);

/* The other shape this takes: the coloured thing is an ELEMENT inside a class, not a modifier
   class -- ".pt-field input:focus" colours a border declared on ".pt-field input". Strip the
   pseudo-classes and look for that selector declaring one. */
function withoutPseudo(sel) {
    return sel.replace(/:{1,2}[\w-]+(\([^)]*\))?/g, '').replace(/\s+/g, ' ').trim();
}
function exactDeclaresBorder(sel, medium) {
    return R.some(function (r) {
        return applies(r, medium) && r.sel === sel && !COLOUR_RE.test(r.body) &&
               (/(^|[;\s])border(-(top|right|bottom|left))?\s*:\s*(?!none)[^;]*\d/.test(r.body) ||
                /(^|[;\s])border-width\s*:/.test(r.body));
    });
}

['screen', 'print'].forEach(function (medium) {
    var dead = coloured.filter(function (r) {
        if (!applies(r, medium)) return false;
        var scoped = r.sel.indexOf('body.pt-app') === 0;
        return !baseClassesOf(r.sel).some(function (c) { return someRuleGivesBorder(c, scoped, medium); }) &&
               !exactDeclaresBorder(withoutPseudo(r.sel), medium);
    }).map(function (r) { return r.sel; });
    eq('every ' + medium + ' coloured edge has a border to paint on', dead.join(', ') || 'none', 'none');
});

/* The specific pair that broke, asserted by name as well, because the general check above
   depends on my own selector parsing and this one does not. */
['screen', 'print'].forEach(function (medium) {
    var rigBase = borderDeclFor('pt-rig', true, medium);
    ok('the ' + medium + ' rig card declares a border for its state colours', !!rigBase);
    ok('the ' + medium + ' rig border has a positive solid width',
       !!rigBase && /border\s*:\s*[1-9][\d.]*px\s+solid\s+/.test(rigBase.body),
       rigBase ? JSON.stringify(rigBase.body.trim().slice(0, 100)) : 'no rule');
});

/* Source ORDER is the other half of it: the shorthand must come BEFORE the rules it would
   otherwise reset, since they sit at equal specificity. */
function lastIndexOf(sel, medium, property) {
    for (var i = R.length - 1; i >= 0; i--) {
        if (R[i].sel === sel && applies(R[i], medium) && property.test(R[i].body)) return i;
    }
    return -1;
}
['screen', 'print'].forEach(function (medium) {
    var iBase = lastIndexOf('body.pt-app .pt-rig', medium, /\bborder\s*:/);
    ['stale', 'offline'].forEach(function (state) {
        var iState = lastIndexOf('body.pt-app .pt-rig--' + state, medium, /border-color\s*:/);
        ok('the ' + medium + ' neutral border precedes the ' + state + ' colour',
           iBase >= 0 && iState >= 0 && iBase < iState,
           'base at ' + iBase + ', ' + state + ' at ' + iState);
    });
});

/* ---- 2. DARK SCREENS, WHITE PRINTED STATEMENTS --------------------------------------------- */

var appRules = R.filter(function (r) { return r.sel.indexOf('body.pt-app') === 0; });
ok('the client theme has rules', appRules.length > 5);

var printBody = styleFor(['body', 'body.pt-app'], 'print');
var screenBody = styleFor(['body', 'body.pt-app'], 'screen');
eq('the signed-in screen uses the scouting charcoal background', resolve(screenBody.background, screenBody), '#11191c');
ok('print keeps a white page', /^#(?:fff|ffffff)$/i.test(resolve(printBody.background, printBody)));
eq('print keeps native controls light', printBody['color-scheme'], 'light');
eq('screen keeps native controls dark', screenBody['color-scheme'], 'dark');
['pt-card', 'pt-metric', 'pt-rig', 'fc-stat'].forEach(function (cls) {
    var printed = styleFor(['.' + cls, 'body.pt-app .' + cls], 'print');
    ok('the printed ' + cls + ' has a white surface', /^#(?:fff|ffffff)$/i.test(resolve(printed.background, printBody)));
});

/* The quieter ink tokens carry captions, disclosures and missing-value labels; all need
   body-text contrast on white paper, not merely the headline token. */
function whiteContrast(hex) {
    if (!/^#[a-f\d]{6}$/i.test(hex || '')) return 0;
    var channels = [1, 3, 5].map(function (at) {
        var s = parseInt(hex.slice(at, at + 2), 16) / 255;
        return s <= .04045 ? s / 12.92 : Math.pow((s + .055) / 1.055, 2.4);
    });
    return 1.05 / (.2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2] + .05);
}
['--text', '--plat-100', '--plat-200', '--plat-300', '--plat-400', '--plat-500', '--plat-600'].forEach(function (token) {
    ok('printed ' + token + ' remains legible on white', whiteContrast(printBody[token]) >= 4.5, printBody[token]);
});

var darkened = appRules.filter(function (r) {
    if (!applies(r, 'print')) return false;
    var m = r.body.match(/background(?:-color)?\s*:\s*(#[0-9a-f]{3,8})/i);
    if (!m) return false;
    var hex = m[1].replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    var lum = (parseInt(hex.slice(0, 2), 16) + parseInt(hex.slice(2, 4), 16) + parseInt(hex.slice(4, 6), 16)) / 3;
    return lum < 128;                       /* a dark fill on a paper surface */
}).map(function (r) { return r.sel; });

/* The demo bar is deliberately the bright brand orange with black text -- it is a warning
   strip, not a surface, and its own rule says so. */
var offenders = darkened.filter(function (s) { return s.indexOf('demobar') < 0; });
eq('no printed paper surface was given a dark fill', offenders.join(', ') || 'none', 'none');

/* ---- 3. THE LIFT IS SCOPED, AND DOES NOT PRINT --------------------------------------------- */

/* Shared screen cards may receive the scouting sheen. An unscoped decoration must stay
   screen-only, so it cannot accidentally turn a printed document into an app screenshot.

   Asked of the CARD FAMILY only. The first version asked it of every selector in the file and
   caught .pt-field input:focus -- the sign-in's own focus ring, which has always had a shadow
   and has nothing to do with this change. A guard that fails on things that were already there
   gets edited until it passes, and what it is edited into is usually nothing. */
var CARD_FAMILY = /\.(pt-card|pt-metric|pt-rig)(?![\w-])/;
var unscopedShadow = R.filter(function (r) {
    return CARD_FAMILY.test(r.sel) &&
           /box-shadow\s*:\s*(?!none)/.test(r.body) &&
           r.sel.indexOf('body.pt-app') !== 0 && applies(r, 'print');
}).map(function (r) { return r.sel; });
eq('unscoped screen decoration never reaches print', unscopedShadow.join(', ') || 'none', 'none');

/* A statement is a document. A soft grey halo round every card is what makes a printed page
   look like a screenshot of a web page. */
var printKills = R.filter(function (r) {
    return r.at.indexOf('print') >= 0 && /box-shadow\s*:\s*none/.test(r.body);
});
ok('print suppresses the card shadow', printKills.length > 0);
['pt-card', 'pt-metric', 'pt-rig'].forEach(function (cls) {
    eq('the effective printed ' + cls + ' has no shadow',
       styleFor(['.' + cls, 'body.pt-app .' + cls], 'print')['box-shadow'], 'none');
});

/* ---- 3b. METAL CARRIES DARK INK ------------------------------------------------------------ */

/* --metal-btc-btn measured against WHITE runs 3.21 / 2.30 / 1.43 / 2.30 / 2.91 / 1.57 -- every
   stop under AA, and 1.43:1 where the highlight crosses the glyphs. Against BLACK the same
   gradient is 6.55 at worst. The first version of the metal pill kept the white ink it
   inherited and took a 5.06:1 badge on a billing document down to 1.43:1, which looked good
   and was not readable.

   So: any element given a metal fill in the paper theme must state a dark ink itself. Stating
   it matters -- inheriting leaves whatever the unscoped rule had, which is what went wrong. */

function isTextMetal(r) {
    var last = r.sel.split(/\s+/).pop();
    return R.some(function (clip) {
        return clip.sel.split(/\s+/).pop() === last &&
               /background-clip\s*:\s*text/.test(clip.body) &&
               (applies(clip, 'screen') === applies(r, 'screen'));
    });
}
var metalFills = R.filter(function (r) {
    return /background(?:-image)?\s*:[^;]*var\(--metal-/.test(r.body) &&
           !/::(?:before|after)/.test(r.sel) && !isTextMetal(r);
});
ok('the portal puts metal on its filled accents', metalFills.length >= 2,
   'found ' + metalFills.length);

var DARK_INK = /color\s*:\s*(var\(--on-accent\)|var\(--black\)|#000\b|#000000)/;
var pale = metalFills.filter(function (r) { return !DARK_INK.test(r.body); })
                     .map(function (r) { return r.sel; });
eq('every metal fill states dark ink', pale.join(', ') || 'none', 'none');

/* And a gradient prints as a muddy band, so each one has a flat fallback under @media print. */
var metalSels = metalFills.filter(function (r) { return applies(r, 'print'); }).map(function (r) { return r.sel; });
var flattened = R.filter(function (r) {
    return r.at.indexOf('print') >= 0 && /background-image\s*:\s*none/.test(r.body);
}).map(function (r) { return r.sel; });
var unflattened = metalSels.filter(function (s) { return flattened.indexOf(s) < 0; });
eq('every metal fill that reaches print has a flat fallback', unflattened.join(', ') || 'none', 'none');

/* ---- 3c. THE TOTAL CARD'S FLAG IS A BAR, NOT A WEDGE --------------------------------------- */

/* border-radius applies to the border box, so a 3px border-left meeting the 1px borders above
   and below it tapers through the corner arc: thick at both ends, pinched in the middle. The
   card only became round in the commit before this one, so the flag only became a wedge then. */
var totalCard = R.filter(function (r) {
    return applies(r, 'print') && /:has\(\.pt-total\)/.test(r.sel) && /border-left\s*:/.test(r.body);
})[0];
ok('the printed total card still carries its flag', !!totalCard);
ok('and squares the printed corners the flag runs between',
   !!totalCard && /border-top-left-radius\s*:\s*0/.test(totalCard.body) &&
                  /border-bottom-left-radius\s*:\s*0/.test(totalCard.body));
var screenTotal = styleFor(['.pt-card', 'body.pt-app .pt-card', 'body.pt-app .pt-card:has(.pt-total)'], 'screen');
ok('the screen total card still carries its accent flag', /[1-9][\d.]*px\s+solid\s+var\(--btc-300\)/.test(screenTotal['border-left'] || ''));

/* ---- 4. EVERY TILE READS LABEL THEN VALUE -------------------------------------------------- */

/* The tiles are built in four separate template strings in portal/index.html. Missing one
   leaves a single tile in a row reading in the opposite order from its neighbours. Counted
   from the markup rather than trusting that four edits were made. */
var vs = [], ls = [], mre = /pt-metric-(value|label)/g, mm;
while ((mm = mre.exec(INDEX)) !== null) (mm[1] === 'value' ? vs : ls).push(mm.index);

eq('the portal builds the tile count this test expects', vs.length, ls.length);
ok('there are tiles to check', vs.length >= 4, 'found ' + vs.length);

var wrongOrder = 0;
for (var i = 0; i < vs.length; i++) if (!(ls[i] < vs[i])) wrongOrder++;
eq('every metric tile puts its label before its value', wrongOrder, 0);

console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
