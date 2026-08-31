/* ===== THE CLIENT PORTAL KEEPS ITS PAPER, AND ITS MEANINGFUL EDGES =====

   The signed-in portal was given the operator app's form language -- lifted cards, large
   left-aligned tabular figures under quiet sentence-case labels -- while staying white paper,
   because the same view delivers statements a producer prints.

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

console.log('\nthe client portal keeps its paper');

var CSS = read('portal/portal.css');
var INDEX = read('portal/index.html');
ok('portal.css and portal/index.html are readable', CSS !== null && INDEX !== null);
if (CSS === null || INDEX === null) { console.log('\n  ' + pass + ' passed, ' + fail + ' failed'); process.exit(1); }

var R = rules(decomment(CSS));

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
function borderDeclFor(cls, scoped) {
    var declares = R.filter(function (r) {
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

function someRuleGivesBorder(cls, scoped) {
    var w = borderDeclFor(cls, scoped);
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
function exactDeclaresBorder(sel) {
    return R.some(function (r) {
        return r.sel === sel && !COLOUR_RE.test(r.body) &&
               (/(^|[;\s])border(-(top|right|bottom|left))?\s*:\s*(?!none)[^;]*\d/.test(r.body) ||
                /(^|[;\s])border-width\s*:/.test(r.body));
    });
}

var dead = coloured.filter(function (r) {
    var scoped = r.sel.indexOf('body.pt-app') === 0;
    return !baseClassesOf(r.sel).some(function (c) { return someRuleGivesBorder(c, scoped); }) &&
           !exactDeclaresBorder(withoutPseudo(r.sel));
}).map(function (r) { return r.sel; });

eq('every coloured edge has a border to paint on', dead.join(', ') || 'none', 'none');

/* The specific pair that broke, asserted by name as well, because the general check above
   depends on my own selector parsing and this one does not. */
var rigBase = R.filter(function (r) { return r.sel === 'body.pt-app .pt-rig' && /border\s*:/.test(r.body); })[0];
ok('the paper rig card declares a border for its state colours', !!rigBase);
ok('and that border is transparent rather than none',
   !!rigBase && /border\s*:\s*1px\s+solid\s+transparent/.test(rigBase.body),
   rigBase ? JSON.stringify(rigBase.body.trim().slice(0, 80)) : 'no rule');

/* Source ORDER is the other half of it: the shorthand must come BEFORE the rules it would
   otherwise reset, since they sit at equal specificity. */
function firstIndexOf(sel) {
    for (var i = 0; i < R.length; i++) if (R[i].sel === sel) return i;
    return -1;
}
var iBase = firstIndexOf('body.pt-app .pt-rig');
var iStale = firstIndexOf('body.pt-app .pt-rig--stale');
ok('the neutral border is declared before the state colours that override it',
   iBase >= 0 && iStale >= 0 && iBase < iStale,
   'base at ' + iBase + ', stale at ' + iStale);

/* ---- 2. IT IS STILL PAPER ------------------------------------------------------------------ */

/* The whole point of the change was that only the FORM crossed over, not the black. */
var appRules = R.filter(function (r) { return r.sel.indexOf('body.pt-app') === 0; });
ok('the paper theme has rules', appRules.length > 5);

var darkened = appRules.filter(function (r) {
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
eq('no paper surface was given a dark fill', offenders.join(', ') || 'none', 'none');

/* ---- 3. THE LIFT IS SCOPED, AND DOES NOT PRINT --------------------------------------------- */

/* The sign-in front door is styled by the same unscoped selectors and is explicitly staying as
   it is, so the card lift must never be declared outside the body.pt-app scope.

   Asked of the CARD FAMILY only. The first version asked it of every selector in the file and
   caught .pt-field input:focus -- the sign-in's own focus ring, which has always had a shadow
   and has nothing to do with this change. A guard that fails on things that were already there
   gets edited until it passes, and what it is edited into is usually nothing. */
var CARD_FAMILY = /\.(pt-card|pt-metric|pt-rig)(?![\w-])/;
var unscopedShadow = R.filter(function (r) {
    return CARD_FAMILY.test(r.sel) &&
           /box-shadow\s*:\s*(?!none)/.test(r.body) &&
           r.sel.indexOf('body.pt-app') !== 0;
}).map(function (r) { return r.sel; });
eq('the card lift never reaches the sign-in', unscopedShadow.join(', ') || 'none', 'none');

/* A statement is a document. A soft grey halo round every card is what makes a printed page
   look like a screenshot of a web page. */
var printKills = R.filter(function (r) {
    return r.at.indexOf('print') >= 0 && /box-shadow\s*:\s*none/.test(r.body);
});
ok('print suppresses the card shadow', printKills.length > 0);

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
