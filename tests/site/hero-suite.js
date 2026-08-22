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

ok(css.indexOf('.hero-zone > .wrap { position: relative; z-index: 1; }') >= 0,
   '  and .hero-zone lifts its wrap, or the field lays over the headline');

/* ---------- 10. One field, thirteen canvases ----------

   The hero used to run a third part the other twelve backdrops did not: a
   lattice across its top where hashrate crystallised out of the arriving gas,
   plus the links between charged nodes and a scanline sealing a row every nine
   to fifteen seconds. It made the home page read as a different site from every
   other page, so it is gone and every backdrop is now the same animation.

   Two things have to hold for "the same" to keep meaning anything, and neither
   is visible from reading one file. */

/* (a) The lattice is gone from the CODE, not merely unreachable. A dormant
   riseOnly branch would have been the tempting version of this change and it
   would have left ~120 lines and a node grid one attribute away from coming
   back on one canvas. Comment-stripped, because the header explains at length
   what used to be here and names all of it. */
['NODE_GAP', 'LATTICE_PCT', 'LINK_AT', 'LATTICE_DIM', 'SOLVE_MS', 'DECAY',
 'nodeAt', 'nodes', 'latticeH', 'solveAt', 'riseOnly', 'data-mode'].forEach(n => {
    ok(code.indexOf(n) < 0, '  no lattice: ' + n + ' is absent from hero-anim.js');
});
ok(!/data-mode/.test(html), '  and no canvas asks for a mode any more');

/* The one line where deleting a lattice name required substituting a VALUE
   rather than removing code: the first build scattered particles between the
   lattice and the source, because nothing above the lattice survived to be
   seen. Left alone it would have read rand(0, sourceY) as rand(latticeH=0, ...)
   by accident and looked right for the wrong reason. */
ok(/P\.y = scatter \? rand\(0, sourceY\)/.test(code),
   '  the first build scatters over the whole box, not from a lattice line');

/* (b) ONE opacity, in one place. Three selectors used to disagree — 0.35 hero,
   0.55 behind the drawings, 0.85 on the headers — each argued for separately
   and each true of a different animation. They cannot disagree again without
   this failing. */
const fieldOp = (fRule.match(/opacity:\s*([0-9.]+)/) || [])[1];
ok(!!fieldOp, '  .anim-field carries the field opacity itself', 'opacity ' + fieldOp);
const modOp = css.match(/\.anim-field--\w+[^{]*\{[^}]*opacity/g) || [];
ok(modOp.length === 0,
   '  and no modifier class overrides it',
   modOp.length ? modOp.join(' | ') : 'none — hero, head and dg are one field');

/* The modifiers survive as markers rather than styles, and two suites identify
   canvases by them, so they must not be tidied out of the markup. */
ok(html.indexOf('anim-field--hero') >= 0 &&
   fs.readFileSync(D + 'energy.html', 'utf8').indexOf('anim-field--dg') >= 0,
   '  the marker classes are still on the canvases');

console.log('');
console.log(fail ? fail + ' FAILED' : 'ALL OK');
process.exitCode = fail ? 1 : 0;
