/* The hero: a plain chrome headline, and the mark turning behind it.

   Replaces backfeed-suite.js. The scroll-lit headline it tested is gone —
   reverted to the platinum it was before — and this file keeps the two things
   from it that were never about the backfeed: the measure-nothing guard, and
   the check that dead instruments have really left the building.

   The field itself is heroanim.js. This file is about the hero as a page. */
/* Repo-relative, so this runs wherever the checkout is. Was an absolute
   c:/Users/rbaga/... path that worked on one machine. */
const REPO_ROOT = require('path').join(__dirname, '..', '..').replace(/\\/g, '/') + '/';
const fs = require('fs');
const D = REPO_ROOT + 'site/';
const html = fs.readFileSync(D + 'index.html', 'utf8');
const css  = fs.readFileSync(D + 'styles.css', 'utf8');
const js   = fs.readFileSync(D + 'site.js', 'utf8');

let fail = 0;
const ok = (cond, label, detail) => {
    console.log((cond ? '  ok   ' : '  FAIL ') + label + (detail ? '   ' + detail : ''));
    if (!cond) fail++;
};

/* ---------- 1. The headline is platinum again ---------- */
ok(html.indexOf('<h1 class="h-display">') >= 0,
   'the headline is a plain .h-display, sharing the site\'s chrome');
['h-backfeed', 'h-line', '--drift', '--lp', 'HEAD_RUN'].forEach(n => {
    const where = ['index.html', 'styles.css', 'site.js']
        .filter((f, i) => [html, css, js][i].indexOf(n) >= 0);
    ok(where.length === 0, '  nothing named "' + n + '" survives', where.join(', '));
});
ok(js.indexOf("setProperty('--p'") < 0, 'and site.js no longer drives a headline');
ok(css.indexOf('.hero .h-display { background-image: none; }') < 0,
   'the parent headline paints its own chrome again, rather than deferring to lines');

/* The hero's own floor. Its longest line is the longest on the site, and the
   shared clamp bottoms out too high for a 360px phone. */
const heroClamp = css.match(/\.hero \.h-display \{ font-size: clamp\(([\d.]+)px, ([\d.]+)vw, ([\d.]+)px\)/);
const baseClamp = css.match(/\.h-display \{\s*\n\s*font-size: clamp\(([\d.]+)px, ([\d.]+)vw, ([\d.]+)px\)/);
ok(!!heroClamp && !!baseClamp, 'both clamps are readable');
if (heroClamp && baseClamp) {
    ok(+heroClamp[1] < +baseClamp[1], 'the hero floors lower than the shared clamp',
       heroClamp[1] + 'px vs ' + baseClamp[1] + 'px');
    ok(heroClamp[2] === baseClamp[2] && heroClamp[3] === baseClamp[3],
       'and matches it everywhere else, so the headline is not a different size',
       heroClamp[2] + 'vw, cap ' + heroClamp[3] + 'px');
}

/* ---------- 2. The mark ---------- */
/* The hero carries the energy field again. Five attempts at a mark in this slot
   were rejected; the field is the one that was ever called right, and it was
   never broken — it has been driving the three engineering drawings the whole
   time. heroanim.js owns the field itself: its density, its self-disabling
   paths, and that it measures nothing. This file only checks it is HERE, and
   that nothing of the mark is left behind it. */
ok(html.indexOf('anim-field--hero') >= 0, 'the hero carries the energy field');
ok(html.indexOf('hero-atom') < 0 && css.indexOf('.ha-') < 0,
   'and nothing of the mark survives in the page or the stylesheet');

/* ---------- 4. Ids ---------- */
/* The nav mark and the footer mark are the only two on the page now, and they
   carry different id prefixes so neither can borrow the other's paint. */
const ids = [...html.matchAll(/id="(ionMark[A-Za-z]+)"/g)].map(m => m[1]);
ok(ids.length === new Set(ids).size,
   'every gradient id on the page is unique',
   ids.length + ' ids, ' + new Set(ids).size + ' distinct');

/* ---------- 5. The field is a backdrop, not an obstacle ---------- */
const rule = sel => css.slice(css.indexOf(sel + ' {'), css.indexOf('}', css.indexOf(sel + ' {')));
const fRule = rule('.anim-field');
ok(fRule.indexOf('pointer-events: none') >= 0, 'it never eats a click meant for the copy');
ok(fRule.indexOf('z-index: 0') >= 0 &&
   css.indexOf('.hero .wrap { position: relative; z-index: 1; }') >= 0,
   'and sits under the copy, not over it');

/* ---------- 7. The standing rule ---------- */
const BANNED = ['getBoundingClientRect', 'offsetWidth', 'offsetHeight',
                'clientWidth', 'clientHeight', 'ResizeObserver', 'innerHeight'];
const found = BANNED.filter(b => js.includes(b));
ok(found.length === 0, 'site.js measures nothing', found.length ? 'FOUND ' + found.join(', ') : '');
const writes = [...js.matchAll(/\.style\.(\w+)/g)].map(m => m[1]);
ok(writes.every(w => w === 'setProperty'), 'the only style write is setProperty', writes.join(', ') || 'none');

/* ---------- 8. Dead instruments ---------- */
const DEAD = ['top-zone', 'BLOCK_RUN', 'plate-hash', 'plate-fuel', 'stack-window',
              'stack-chain', 'heroStack', 'reel-spin', 'backfeed',
              'hero-atom', 'haRing', 'ha-m0', 'ha-e0'];
['index.html', 'styles.css', 'site.js', 'hosting.html', 'energy.html', 'contact.html']
    .forEach(f => {
        const s = fs.readFileSync(D + f, 'utf8');
        const left = DEAD.filter(d => s.includes(d));
        ok(left.length === 0, '  nothing dead left in ' + f, left.join(', '));
    });

console.log('');
console.log(fail ? fail + ' FAILED' : 'ALL OK');
process.exitCode = fail ? 1 : 0;
