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

/* ---------- 9. The field measures, and that is now allowed ----------

   Section 7 forbids site.js from measuring anything, because of the loop that
   pulled this animation once: read the HOST's border box, write it into
   canvas.style (a content box), and a ResizeObserver grew the panel ~2px every
   150ms forever.

   hero-anim.js DOES measure now — it has to, or a 1px particle gets stretched
   into a 2.9px smear and the rise looks soft next to the portal's. So the rule
   here is not "don't measure", it is the three things the loop actually needed,
   each of which is checked:

     read a box that includes borders  — no, it reads the canvas's own content box
     write something that moves layout — no, only canvas.width/height, and every
                                         .anim-field is out of flow anyway
     an observer to close the circle   — no, only window 'resize'

   Comments are stripped first. This file's header explains the bug by NAME, so
   a plain indexOf would match the explanation and pass having checked nothing —
   the same trap the ledger and firestore-rules suites both record. */
const anim = fs.readFileSync(D + 'hero-anim.js', 'utf8');
const code = anim.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

['getBoundingClientRect', 'offsetWidth', 'offsetHeight', 'ResizeObserver'].forEach(b => {
    ok(code.indexOf(b) < 0, '  hero-anim.js never uses ' + b);
});
ok(code.indexOf('.style') < 0,
   '  and never writes any style — the write half of the loop is absent');
ok(/canvas\.clientWidth/.test(code) && /canvas\.clientHeight/.test(code),
   '  it measures the CANVAS, not the host',
   'a content box read against a content box');
ok(/canvas\.width\s*=\s*Math\.round\(w \* dpr\)/.test(code),
   '  the backing store is the measured size — 1 logical px is 1 CSS px');
ok(/data-w/.test(code) && /data-h/.test(code),
   '  the authored size survives as the not-laid-out fallback',
   '0x0 means unmeasured, never zero');

/* Out of flow is what makes the measurement non-circular: CSS is already
   overriding the intrinsic size, so writing the backing store cannot move a
   pixel of layout and there is nothing for the next read to pick up. */
ok(fRule.indexOf('position: absolute') >= 0 && fRule.indexOf('inset: 0') >= 0 &&
   fRule.indexOf('width: 100%') >= 0 && fRule.indexOf('height: 100%') >= 0,
   '  and the canvas is out of flow, so a backing-store write cannot feed back');

/* The sharpness half. A 1px rect at a fractional coordinate is split across two
   device pixels at partial alpha in each, which is a smudge and not a pixel. */
ok(/fill\(col, a, Math\.round\(Q\.x\), Math\.round\(Q\.y\)/.test(code),
   '  particles land on whole pixels');

/* One CSS opacity dims the whole canvas, so raising it for the gas raises the
   lattice too. LATTICE_DIM exists to put the fabric back exactly where it was;
   if somebody retunes the canvas value alone, the hero gets busier by stealth
   and this catches it. */
const heroOp = (css.match(/\.anim-field--hero \{ opacity: ([0-9.]+)/) || [])[1];
const dim = code.match(/var LATTICE_DIM = ([0-9.]+) \/ ([0-9.]+);/);
ok(!!heroOp && !!dim, '  the hero opacity and LATTICE_DIM are both findable');
if (heroOp && dim) {
    ok(+dim[2] === +heroOp,
       '  LATTICE_DIM is stated against the opacity actually shipping',
       'divisor ' + dim[2] + ', css ' + heroOp);
    ok(Math.abs(+heroOp * (+dim[1] / +dim[2]) - 0.35) < 1e-9,
       '  so the lattice still lands at 0.35 — only the gas moved',
       'effective ' + (+heroOp * (+dim[1] / +dim[2])).toFixed(4));
}

/* The header field was the thing reported as dimmer than the portal's. It is
   brighter than the diagram fields on purpose: .wrap lifts the headline out of
   this stacking context, so type never competes with the field for a pixel,
   whereas a drawing genuinely shares pixels with its backdrop. */
const headOp = +(css.match(/\.anim-field--head \{ opacity: ([0-9.]+)/) || [])[1];
const dgOp = +(css.match(/\.anim-field--dg\s+\{ opacity: ([0-9.]+)/) || [])[1];
ok(headOp > dgOp && headOp > +heroOp,
   '  the header field is the brightest of the three',
   'head ' + headOp + ', dg ' + dgOp + ', hero ' + heroOp);
ok(css.indexOf('.hero-zone > .wrap { position: relative; z-index: 1; }') >= 0,
   '  and .hero-zone lifts its wrap, or the field lays over the headline');

console.log('');
console.log(fail ? fail + ' FAILED' : 'ALL OK');
process.exitCode = fail ? 1 : 0;
