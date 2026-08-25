/* The energy page: one pad, drawn twice.

   The property this whole thing rests on is that the two states share a camera
   and share their pad. If either drifts, the slider stops reading as one site
   changing and becomes a dissolve between two different pictures — and nothing
   in either file looks wrong when that happens. Both get asserted here, and the
   geometry one is asserted by object IDENTITY rather than by comparing values,
   because two copies that happen to match today are exactly the thing that
   drifts tomorrow. */
/* Repo-relative, so this runs wherever the checkout is. Was an absolute
   c:/Users/rbaga/... path that worked on one machine. */
const REPO_ROOT = require('path').join(__dirname, '..', '..').replace(/\\/g, '/') + '/';
const NOW = require(REPO_ROOT + 'site/scene-pad-now.js');
const PROTON = require(REPO_ROOT + 'site/scene-pad-ion.js');
const LFNOW = require(REPO_ROOT + 'site/scene-landfill-now.js');
const LFION = require(REPO_ROOT + 'site/scene-landfill-ion.js');

const PAD = require(REPO_ROOT + 'site/pad-geometry.js');
const LAND = require(REPO_ROOT + 'site/landfill-geometry.js');

/* Every drawing the energy page can show, each WITH THE GEOMETRY IT IS BUILT
   FROM. The checks below used to name the pad pair inline, five times over,
   which is why the landfill pair arrived on the page with none of them applied
   to it — the drawing that most needed checking was the only one exempt.

   The third element is not decoration. The flame check measures a flame against
   the bore it leaves, and the two flares are at different places and different
   radii; reading the pad's flare for a landfill scene compares the drawing to a
   stack that is not in it, and reports a number that means nothing either way. */
const SCENES = [
    ['now',    NOW,   PAD],
    ['ion',    PROTON,   PAD],
    ['lf-now', LFNOW, LAND],
    ['lf-ion', LFION, LAND],
];
const fs = require('fs');
const D = REPO_ROOT + 'site/';
const css = fs.readFileSync(D + 'styles.css', 'utf8');

let fail = 0;
const ok = (cond, label, detail) => {
    console.log((cond ? '  ok   ' : '  FAIL ') + label + (detail ? '   ' + detail : ''));
    if (!cond) fail++;
};
const sweep = n => Array.from({ length: n + 1 }, (_, i) => Math.PI * 2 * (i / n));

console.log(`pad: ${NOW.CALLOUTS.length} + ${PROTON.CALLOUTS.length} callouts, ` +
            `${NOW.SLOTS} + ${PROTON.SLOTS} slots, ${PAD.TANK_X.length} tanks, ` +
            `${PAD.FLARE_H}m stack`);
console.log('');

/* ---------- 1. One camera ----------
   Run for BOTH pairs. Each pair cross-dissolves under its own slider, and a
   camera that differs across a pair rescales or shifts the site mid-slide —
   which reads as the drawing itself moving, the one thing the before/after must
   never do. The landfill pair is the more fragile of the two: its view block is
   duplicated verbatim across two files and was fitted numerically, so a refit
   applied to one file and not the other would look like nothing at all. */
const VIEW = ['BASE_SCALE', 'PERIOD', 'ZOOM_MIN', 'ZOOM_MAX', 'PITCH_MIN', 'PITCH_MAX'];
const PAIRS = [
    ['pad',      NOW,   PROTON,   PAD,
     [[0, 0, 0], [PAD.WELL.x, PAD.WELL_H, PAD.WELL.z],
      [PAD.FLARE.x, PAD.FLARE_H, PAD.FLARE.z], [PAD.TANK_X[2], PAD.TANK_H, PAD.TANK_Z]]],
    ['landfill', LFNOW, LFION, LAND,
     [[0, 0, 0], [LAND.CELL.x, LAND.CELL.h, LAND.CELL.z],
      [LAND.FLARE.x, LAND.FLARE_H, LAND.FLARE.z], [LAND.BLOWER.x, LAND.BLOWER.h, LAND.BLOWER.z]]],
];

PAIRS.forEach(([pair, A, B, G, PROBE]) => {
    const diff = VIEW.filter(k => A[k] !== B[k]);
    ok(diff.length === 0,
       '  ' + pair + ': both states share one camera, so the site cannot slide mid-crossfade',
       diff.length ? 'DIFFER: ' + diff.join(', ') : VIEW.join(', '));
    ok(A.VB.w === B.VB.w && A.VB.h === B.VB.h,
       '  ' + pair + ': and one viewBox, so the section does not change height as the slider moves',
       A.VB.w + 'x' + A.VB.h);

    /* The strongest form of the check: project the same world point through both
       scenes at the same angle and demand the same pixel. This catches a
       differing ORIGIN or BASE_PITCH, which the property list above cannot
       see — and ORIGIN is exactly what the landfill fitter rewrites. */
    let worstPx = 0;
    for (const yaw of sweep(36)) for (const p of PROBE) {
        const a = A.project(p, yaw), b = B.project(p, yaw);
        worstPx = Math.max(worstPx, Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
    }
    ok(worstPx < 1e-9,
       '  ' + pair + ': the same world point lands on the same pixel in both states, at every angle',
       'worst disagreement ' + worstPx.toFixed(12) + 'px');

    /* One site object, not two that happen to match today. */
    ok(A.MODEL === B.MODEL,
       '  ' + pair + ': the site is the same object in both, not two copies');
    ok(A.MODEL === G.MODEL, '  ' + pair + ': and it is the shared module both import');
});

/* ---------- 2. Neither scene declares a site of its own ---------- */
ok(fs.readFileSync(D + 'scene-pad-now.js', 'utf8').indexOf('var PAD') < 0 &&
   fs.readFileSync(D + 'scene-pad-ion.js', 'utf8').indexOf('var PAD') < 0,
   'neither pad scene declares a pad of its own');
ok(fs.readFileSync(D + 'scene-landfill-now.js', 'utf8').indexOf('var CELL') < 0 &&
   fs.readFileSync(D + 'scene-landfill-ion.js', 'utf8').indexOf('var CELL') < 0,
   'neither landfill scene declares a cell of its own');

/* ---- the two landfill scenes draw the SAME existing site ----

   Everything the partner already owns — the cap, the wellfield, the header, the
   leachate compound, the blower, the flare — has to appear in both states,
   because the promise the section makes is that it all stays exactly where it
   is. Kit that showed up only in the "with Proton" state would be claiming we
   built their leachate tank.

   landfill-geometry.js has a buildShared() that exists precisely to stop the
   two drifting, and NEITHER SCENE CALLS IT — they each list the builders out by
   hand instead, which is the drift it was written to prevent. Adding
   buildYard() meant editing both files and would have silently half-landed.
   Until the scenes actually use buildShared(), this check is what holds them
   together. */
{
    const SHARED = ['buildPad', 'buildCell', 'buildWells',
                    'buildHeader', 'buildPlant', 'buildYard'];
    const nowSrc = fs.readFileSync(D + 'scene-landfill-now.js', 'utf8');
    const protonSrc = fs.readFileSync(D + 'scene-landfill-ion.js', 'utf8');
    const calls = src => SHARED.filter(fn => src.indexOf('G.' + fn + '(') >= 0);
    const inNow = calls(nowSrc), inIon = calls(protonSrc);

    ok(inNow.length === SHARED.length,
       'the "today" landfill scene draws every shared builder',
       inNow.length === SHARED.length ? SHARED.length + ' of ' + SHARED.length
         : 'MISSING: ' + SHARED.filter(f => inNow.indexOf(f) < 0).join(', '));
    ok(inIon.join() === inNow.join(),
       'and the "with Proton" scene draws exactly the same ones',
       inIon.join() === inNow.join() ? 'both: ' + inIon.join(', ')
         : 'now=[' + inNow.join(',') + '] ion=[' + inIon.join(',') + ']');

    /* The yard is the newest of them and the easiest to add to one file only. */
    ok(typeof LAND.buildYard === 'function', 'the yard builder is exported');
    ['LEACH', 'LEACH_PUMP', 'KIOSK', 'SUMP_X'].forEach(k => {
        ok(LAND[k] !== undefined, '  the shared site has its ' + k.toLowerCase());
    });

    /* Nothing the partner owns may stand on the cap — the one detail a landfill
       engineer checks first. Anything at ground level inside the cell footprint
       would be sitting on a membrane that settles. */
    const onCap = ['LEACH', 'LEACH_PUMP', 'KIOSK'].filter(k => {
        const o = LAND[k];
        return LAND.capHeightAt(o.x, o.z) > 0;
    });
    ok(onCap.length === 0,
       'and none of it stands on the capped cell',
       onCap.length ? 'ON THE CAP: ' + onCap.join(', ') : 'all on the graded area');
}

/* The two landfill view blocks are duplicated verbatim between files, which the
   header of each one states. Compare the SOURCE, not just the resolved values:
   equal numbers reached by different expressions would pass every check above
   and still be two things to keep in step by hand. */
const viewSrc = f => {
    const s = fs.readFileSync(D + f, 'utf8');
    const i = s.indexOf('view: {');
    return s.slice(i, s.indexOf('},', i)).replace(/\s+/g, ' ').trim();
};
ok(viewSrc('scene-landfill-now.js') === viewSrc('scene-landfill-ion.js'),
   'the landfill view block is byte-identical between the two scene files');
ok(viewSrc('scene-pad-now.js') === viewSrc('scene-pad-ion.js'),
   'and so is the pad one');

/* ---------- 3. The labels stay put ---------- */
/* Callout boxes are absolutely positioned by their y. If the two states used
   different ones the bubbles would jump as the slider moved, which reads as a
   glitch rather than a change of state. */
const ys = d => d.CALLOUTS.map(c => c.side + c.y).sort().join(',');
ok(ys(NOW) === ys(PROTON),
   'the label boxes sit at the same places in both, so they dissolve rather than jump',
   ys(NOW));

/* ---------- 4. The flare ---------- */
/* The stack is in both — you do not remove a flare, you stop feeding it. The
   flame is what changes, and by a lot. */
function flameLen(d, yaw) {
    return d.frame(yaw, null).slots.reduce((n, s) => n + (s.flame || '').length, 0);
}
let litMin = 1e9, pilotMax = 0;
for (const yaw of sweep(24)) {
    litMin = Math.min(litMin, flameLen(NOW, yaw));
    pilotMax = Math.max(pilotMax, flameLen(PROTON, yaw));
}
ok(litMin > 0, 'the lit state has a flame at every angle', litMin + ' chars at worst');
ok(pilotMax > 0, 'and the other keeps a pilot, rather than going dark and unlit',
   pilotMax + ' chars at most');
ok(litMin > pilotMax * 2,
   'the flame collapses to a fraction of itself when the slider moves',
   litMin + ' vs ' + pilotMax);
const nowSrc = fs.readFileSync(D + 'scene-pad-now.js', 'utf8');
const protonSrc = fs.readFileSync(D + 'scene-pad-ion.js', 'utf8');
ok(nowSrc.indexOf('buildFlareStack') >= 0 && protonSrc.indexOf('buildFlareStack') >= 0,
   'both states draw the stack itself');

/* ---------- 4b. The flame is attached to the stack ----------
   It shipped once detached: the widest part of the flame was its base, and the
   base started 0.2 m clear of the tip, so a 1.9 m-wide shape hung over a 0.6 m
   pipe with a gap under it and read as a separate object floating nearby. Every
   other check passed — the flame existed, it was the right size, it was in the
   right layer. Nothing but looking at it could tell.

   So: measure the drawn path. Its lowest point must sit at or below the tip,
   and the width down there must not exceed the bore it is supposed to be
   leaving. */
function pathPoints(d) {
    const out = [], re = /(-?[0-9.]+) (-?[0-9.]+)/g;
    let m;
    while ((m = re.exec(d))) out.push([+m[1], +m[2]]);
    return out;
}
SCENES.forEach(([name, d, G]) => {
    d.resetView();
    let worstGap = -1e9, worstOver = -1e9;
    for (const yaw of sweep(48)) {
        const flame = d.frame(yaw, null).slots.map(s => s.flame || '').join('');
        if (!flame) continue;
        const p = pathPoints(flame);
        const lowest = Math.max(...p.map(q => q[1]));       // largest y = lowest on screen
        const tip = d.project([G.FLARE.x, G.FLARE_H, G.FLARE.z], yaw);
        worstGap = Math.max(worstGap, tip[1] - lowest);     // >0 means a gap under the flame
        const root = p.filter(q => Math.abs(q[1] - lowest) < 0.6);
        const rootW = Math.max(...root.map(q => q[0])) - Math.min(...root.map(q => q[0]));
        const bore = Math.abs(d.project([G.FLARE.x + G.FLARE_R, G.FLARE_H, G.FLARE.z], yaw)[0] -
                              d.project([G.FLARE.x - G.FLARE_R, G.FLARE_H, G.FLARE.z], yaw)[0]);
        worstOver = Math.max(worstOver, rootW - bore);
    }
    ok(worstGap <= 0, '  ' + name + ': the flame meets the stack, with no gap under it',
       worstGap <= 0 ? 'overlaps by ' + (-worstGap).toFixed(2) + 'px' :
                       'FLOATS ' + worstGap.toFixed(2) + 'px clear');
    ok(worstOver <= 1.0, '  ' + name + ': and leaves the tip at the bore, not wider than it',
       'widest root exceeds the bore by ' + worstOver.toFixed(2) + 'px');
});

/* ---------- 4c. Slender things are drawn, not just filled ----------
   The reason the flame read as floating was not the flame. The stack under it
   renders about ten pixels wide, and a box paints its faces at 6.2% and 3.2%
   alpha — fills tuned for a container wall, invisible on a sixty-centimetre
   pipe. The chimney was not there, so the flame had nothing to sit on.

   Anything slender therefore gets its silhouette stroked as well as filled.
   Asserted two ways, because the source check alone would not notice the fills
   quietly winning and the ratio alone would not say why. */
const padSrcEdges = fs.readFileSync(D + 'pad-geometry.js', 'utf8');
const pipeFn = padSrcEdges.slice(padSrcEdges.indexOf('function pipe('),
                                 padSrcEdges.indexOf('/* ---------- Builders'));
ok(pipeFn.indexOf('edges(H, yaw, L, box)') >= 0,
   'every run of pipe draws its own silhouette');
const stackFn = padSrcEdges.slice(padSrcEdges.indexOf('function buildFlareStack('),
                                  padSrcEdges.indexOf('function buildShared('));
ok(stackFn.indexOf('edges(H, yaw, L, col)') >= 0,
   'and so does the stack, which is the thinnest thing on the pad');

NOW.resetView();
const flareSlot = NOW.frame(0, null).slots.find(s => s.id === 'flare');
const fillInk = (flareSlot.top || '').length + (flareSlot.side || '').length +
                (flareSlot.end || '').length;
const lineInk = (flareSlot.detail || '').length + (flareSlot.back || '').length;
ok(lineInk > fillInk * 2,
   'the flare reads by its line work rather than by fills that cannot be seen',
   lineInk + ' chars of line against ' + fillInk + ' of fill');

/* ---------- 4d. One weight across all four drawings ----------
   These used to be two sets: cutaway weights for the mine and the container,
   heavier ones for the wellpad, on the reasoning that a container wall has to be
   see-through and a wellpad does not. The reasoning held; the result did not.
   Side by side the three drawings looked like three different materials, and the
   wellpad read as lit from a different sun.

   They now share one set. What has to stay true is that the shared weight is
   heavy enough for a solid object to have form, and light enough that a cutaway
   still shows what is racked inside it.

   Resolved through the real cascade rather than read off the rule, because an
   override that loses is indistinguishable from one that was never written. */
const { resolve } = require(__dirname + '/cascade.js');
const wrapEl = cls => ({ tag: 'path', classes: [cls],
    ancestors: [{ tag: 'div', classes: ['dg-wrap', 'dg-wrap--now'] },
                { tag: 'div', classes: ['wrap'] }] });
const cutEl = cls => ({ tag: 'path', classes: [cls],
    ancestors: [{ tag: 'div', classes: ['dg-wrap', 'dg-wrap--cont'] },
                { tag: 'div', classes: ['wrap'] }] });
const alphaOf = v => { const m = v && v.value.match(/[\d.]+\s*\)$/); return m ? parseFloat(m[0]) : null; };

const padTop = alphaOf(resolve(css, wrapEl('dg-top'), [], 'fill'));
const cutTop = alphaOf(resolve(css, cutEl('dg-top'), [], 'fill'));
ok(padTop !== null && cutTop !== null && padTop === cutTop,
   'the wellpad and the cutaways resolve to the same face weight',
   'pad ' + padTop + ' against cutaway ' + cutTop);

const padSide = alphaOf(resolve(css, wrapEl('dg-side'), [], 'fill'));
const padEnd = alphaOf(resolve(css, wrapEl('dg-end'), [], 'fill'));
ok(padSide === alphaOf(resolve(css, cutEl('dg-side'), [], 'fill')) &&
   padEnd === alphaOf(resolve(css, cutEl('dg-end'), [], 'fill')),
   'and so do the side and end faces', 'the sets have split again');

/* Enough weight to have a body. Below roughly 0.3 a lit face drops under 3:1
   against the ground and the boxes go back to being outlines. */
ok(padTop >= 0.30, 'a lit face is heavy enough to read as a surface', 'top is ' + padTop);
ok(padTop - padSide >= 0.08 && padSide - padEnd >= 0.06,
   'the top-to-side-to-end steps still give the boxes volume',
   padTop + ' / ' + padSide + ' / ' + padEnd);

/* And not so much weight that a cutaway stops being one. The interior is 0.62
   black and the machines sit on it at 0.10, so what matters is that the shell
   never approaches the interior's darkness from the other side. */
ok(padTop <= 0.55, 'not so heavy that a cutaway shell reads as opaque', 'top is ' + padTop);

const padDetail = alphaOf(resolve(css, wrapEl('dg-detail'), [], 'stroke'));
ok(padDetail !== null && padDetail > padTop + 0.15,
   'the line work sits clear of the fills instead of being buried by them',
   'detail ' + padDetail + ' against a ' + padTop + ' face');

/* The variant is gone; nothing should still be reaching for it. */
['index.html', 'hosting.html', 'energy.html'].forEach(f => {
    ok(fs.readFileSync(D + f, 'utf8').indexOf('dg-wrap--solid') < 0,
       '  ' + f + ' carries no solid-variant class');
});
ok(css.indexOf('dg-wrap--solid') < 0, 'and the variant has no rules left',
   'dead rules for a class nothing carries');

/* ---------- 4e. It is the same equipment as the home page ----------
   The two pages drew the same four things independently and they came out
   visibly different: a 1.7 m conditioning skid against a 4.4 m box, a 1.5 m
   transformer against a 2.2 m one, one genset against two, and 341 lines of
   detail on one page against 67 on the other. Asked why the mine on the pad did
   not look like the mine, the answer was that it was not the same mine.

   Now both import site-kit.js. Asserted by identity, not by equal numbers —
   equal numbers are what they had before they drifted. */
const KIT  = require(D + 'site-kit.js');
const SITE = require(D + 'scene-site.js');
[['gas conditioning', 'gas', 'GAS'], ['genset', 'genset', 'GEN'],
 ['transformer', 'xfmr', 'XFMR']].forEach(([label, modelKey, kitKey]) => {
    const home = SITE.MODEL[modelKey], k = KIT[kitKey];
    const ion = PROTON[kitKey];
    ok(home.w === k.w && home.h === k.h && home.d === k.d,
       '  the home page takes its ' + label + ' from the kit',
       k.w + ' x ' + k.h + ' x ' + k.d);
    ok(ion && ion.w === k.w && ion.h === k.h && ion.d === k.d,
       '  and so does the pad', ion ? ion.w + ' x ' + ion.h + ' x ' + ion.d : 'MISSING');
});
ok(PROTON.CONTAINERS && PROTON.CONTAINERS.every(c =>
       c.w === KIT.CONT.w && c.h === KIT.CONT.h && c.d === KIT.CONT.d),
   '  the containers match too', PROTON.CONTAINERS.length + ' on the pad');

/* Neither page may declare its own sizes any more, which is the part that
   actually prevents a repeat. */
[['scene-site.js'], ['scene-pad-ion.js']].forEach(([f]) => {
    const src = fs.readFileSync(D + f, 'utf8');
    const own = /var (GAS|GEN|XFMR)\s*=\s*\{[^}]*w:\s*[\d.]+/.test(src);
    ok(!own, '  ' + f + ' declares no equipment sizes of its own');
});

/* And the same builders, so the DETAIL matches and not merely the box. */
const protonSrcKit = fs.readFileSync(D + 'scene-pad-ion.js', 'utf8');
['KIT.gas(', 'KIT.gen(', 'KIT.xfmr(', 'KIT.container('].forEach(c => {
    ok(protonSrcKit.indexOf(c) >= 0, '  the pad draws it with ' + c + '), not its own version');
});

/* ---------- 4f. The plant stands out from the ground ----------
   addBox routes a box's faces by orientation, so the 44 x 22 m pad slab put its
   top face in the 'top' bucket — the same bucket, and therefore the same fill,
   as a transformer lid. A lit face measured 1.00:1 against the ground it stood
   on: not similar, identical. Every reading of "the equipment looks
   transparent" was really this, and raising the equipment weight could never
   fix it because the floor rose with it.

   Checked where it matters — in the emitted path — by projecting the slab's own
   corners and looking for them. */
NOW.resetView();
const groundSlot = NOW.frame(0, null).slots.find(s => s.id === 'ground');
const slabPts = [[-PAD.PAD.w / 2, 0, -PAD.PAD.d / 2], [PAD.PAD.w / 2, 0, -PAD.PAD.d / 2],
                 [PAD.PAD.w / 2, 0, PAD.PAD.d / 2], [-PAD.PAD.w / 2, 0, PAD.PAD.d / 2]]
    .map(p => NOW.project([p[0], PAD.PAD.y + PAD.PAD.h, p[2]], 0));
/* Compared as numbers, not as text: the engine's n1 trims trailing zeros, so a
   corner at exactly 450.0 is written "450" and a string search for "450.0"
   misses a point that is plainly there. */
const near = (layer, q) => pathPoints(layer || '')
    .some(p => Math.abs(p[0] - q[0]) < 0.15 && Math.abs(p[1] - q[1]) < 0.15);
const inGround = slabPts.filter(q => near(groundSlot.ground, q)).length;
const inTop    = slabPts.filter(q => near(groundSlot.top, q)).length;
ok(inGround === slabPts.length, 'the pad slab paints in the ground layer',
   inGround + '/' + slabPts.length + ' of its corners found there');
ok(inTop === 0, 'and not in the layer the equipment uses, which is what flattened it',
   inTop ? inTop + ' corners still in .dg-top' : 'none');

/* The weights, resolved: ground must be far below a lit equipment face. */
const groundFill = (() => {
    const r = css.slice(css.indexOf('.dg-ground {'), css.indexOf('}', css.indexOf('.dg-ground {')));
    const m = r.match(/fill: rgba\([^)]*?([\d.]+)\)/);
    return m ? parseFloat(m[1]) : null;
})();
/* Reads the one shared lit-face weight. This used to look for the solid
   variant's override; there is no variant any more, so it reads the base rule
   the way every drawing now resolves it. */
const litFill = padTop;
ok(groundFill !== null && litFill !== null && litFill > groundFill * 4,
   'a lit face is many times the ground it stands on, not equal to it',
   'ground ' + groundFill + ' against a lit face ' + litFill);

/* ---------- 5. Leaders ---------- */
SCENES.forEach(([name, d]) => {
    let drift = 0;
    for (const yaw of sweep(12)) for (const L of d.frame(yaw, null).leaders) {
        const co = d.CALLOUTS.find(c => c.id === L.id);
        const a = d.calloutAnchor(co, yaw);
        if (Math.abs(L.x2 - a[0]) > 0.06 || Math.abs(L.y2 - a[1]) > 0.06) drift++;
    }
    ok(drift === 0, '  ' + name + ': every leader stays welded to its anchor', drift + ' drifted');
});

/* A leader welded to its anchor can still point at empty pad if the anchor is
   nowhere near the thing it names. Measure the tip against the projected edges
   of that callout's own region, point-to-segment — a tip landing mid-edge is
   on target, and comparing against corners alone would call it a miss. */
function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
SCENES.forEach(([name, d]) => {
    let worst = 0, worstId = '';
    for (const yaw of sweep(24)) for (const co of d.CALLOUTS) {
        const boxes = d.regionBoxes(co.id);
        if (!boxes.length) { worst = 1e9; worstId = co.id + ' (no region)'; continue; }
        const a = d.calloutAnchor(co, yaw);
        let best = 1e9;
        boxes.forEach(b => {
            const q = d.boxCorners(b).map(p => d.project(p, yaw));
            for (let i = 0; i < q.length; i++) for (let j = i + 1; j < q.length; j++) {
                best = Math.min(best, segDist(a[0], a[1], q[i][0], q[i][1], q[j][0], q[j][1]));
            }
        });
        if (best > worst) { worst = best; worstId = co.id; }
    }
    ok(worst < 26, '  ' + name + ': every leader lands on the thing it names, all 360',
       'worst ' + worst.toFixed(1) + 'px on "' + worstId + '"');
});

/* ---------- 6. Regions and depth ---------- */
SCENES.forEach(([name, d]) => {
    const missing = d.CALLOUTS.filter(c => d.regionBoxes(c.id).length === 0).map(c => c.id);
    ok(missing.length === 0, '  ' + name + ': every callout has a hover region',
       missing.join(', ') || d.CALLOUTS.length + ' regions');

    const orders = new Set();
    for (const yaw of sweep(60)) orders.add(d.frame(yaw, null).slots.map(s => s.id).join('>'));
    ok(orders.size > 1,
       '  ' + name + ': the depth sort actually reorders as the pad turns',
       orders.size + ' distinct orders');
});

/* ---------- 7. It fits the box ---------- */
SCENES.forEach(([name, d]) => {
    d.resetView();
    const pts = d.allPoints();
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const yaw of sweep(72)) for (const p of pts) {
        const q = d.project(p, yaw);
        x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]);
        y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]);
    }
    /* 250 and 1030 are the leader rails, which are also the inner edges of the
       callout columns. Outside them the drawing is under a label. */
    ok(x0 >= 250 && x1 <= 1030 && y0 >= 16 && y1 <= 454,
       '  ' + name + ': stays inside the callout rails and the box, at every angle',
       'x ' + x0.toFixed(0) + '..' + x1.toFixed(0) + '  y ' + y0.toFixed(0) + '..' + y1.toFixed(0));
});

/* ---------- 8. The page ---------- */
const html = fs.readFileSync(D + 'energy.html', 'utf8');
const sec = html.slice(html.indexOf('<!-- ===== THE PAD'),
                       html.indexOf('<!-- ===== WHAT EACH SIDE BRINGS'));
ok(sec.length > 1000, 'the section is on the page');

/* FOUR views now, in two pairs behind the fuel switch: landfill and flare.
   This asserted two while the wellpad was the only site the page knew how to
   draw. */
ok((sec.match(/class="dg-wrap /g) || []).length === 4, 'four views, in two pairs');
ok((sec.match(/class="dg-scale-input"|dg-scale-input/g) || []).length === 2,
   'each pair behind its own slider');
ok(sec.indexOf('data-link="pad"') > 0, 'the pad pair sharing one view, so rotating one rotates the other');
ok(sec.indexOf('data-link="landfill"') > 0, 'and the landfill pair sharing a different one');

/* Not the same link. Two pairs on one page that named the same one would move
   together, so switching fuel would land you on a drawing facing somewhere you
   never put it. */
ok(sec.indexOf('data-link="pad"') !== sec.indexOf('data-link="landfill"'),
   'and the two pairs do not share a camera');

ok((sec.match(/class="dg-callout/g) || []).length ===
   NOW.CALLOUTS.length + PROTON.CALLOUTS.length + LFNOW.CALLOUTS.length + LFION.CALLOUTS.length,
   'every callout rendered');

/* ---- the fuel switch ---- */
ok(sec.indexOf('id="dgFuel"') > 0, 'the fuel switch is on the page');

/* ---- the wellfield stands on the cap it is drawn on ----

   The mound's shape and the "how high is the cap here" function are two
   descriptions of one surface, written separately, and nothing forces them to
   agree. When they disagreed, every wellhead was planted a lift below the
   surface and two were entirely inside the mound — which is invisible head-on,
   because the cap is translucent and a buried wellhead still shows through. */
{
    const wells = LAND.wells();
    ok(wells.length >= 8, 'the wellfield has wells on it', wells.length + ' wells');

    const off = wells.filter(w => Math.abs(w.base - LAND.capHeightAt(w.x, w.z)) > 1e-9);
    ok(off.length === 0,
       '  every well sits exactly on the cap under it',
       off.length ? off.length + ' floating or buried' : 'all ' + wells.length + ' flush');

    ok(wells.every(w => w.base > 0 && w.base <= LAND.CELL.h),
       '  and none is off the mound or above its crown',
       'bases ' + Math.min(...wells.map(w => w.base)).toFixed(2) + '..' +
       Math.max(...wells.map(w => w.base)).toFixed(2) + ' of ' + LAND.CELL.h);

    /* A mound falls away from the crown in every direction. If the surface
       function had a step or a reversal, a well could sit on a shelf that the
       drawn geometry does not have. */
    let reversals = 0;
    for (let a = 0; a < 24; a++) {
        const th = (a / 24) * Math.PI * 2;
        let prev = Infinity;
        for (let r = 0; r <= 1.05; r += 0.05) {
            const h = LAND.capHeightAt(
                LAND.CELL.x + r * (LAND.CELL.w / 2) * Math.cos(th),
                LAND.CELL.z + r * (LAND.CELL.d / 2) * Math.sin(th));
            if (h > prev + 1e-9) reversals++;
            prev = h;
        }
    }
    ok(reversals === 0,
       '  and the cap falls away from the crown in every direction, with no step',
       reversals + ' reversals over 24 rays');

    /* The crown is flat and the toe is on the ground: the two ends of the
       profile, which a frustum has and a dome does not. */
    ok(Math.abs(LAND.capHeightAt(LAND.CELL.x, LAND.CELL.z) - LAND.CELL.h) < 1e-9,
       '  the crown is at full height');
    ok(LAND.capHeightAt(LAND.CELL.x + LAND.CELL.w, LAND.CELL.z) === 0,
       '  and well outside the toe the cap is simply ground');
}

/* ---- the full-bleed breakout still reaches the drawings ----

   The diagrams break out of the text measure via `.wrap > .dg-views`, written
   with a CHILD combinator on purpose. Wrapping each pair in a .dg-fuel-pane put
   .dg-views one level deeper and stopped that rule matching: the drawings still
   rendered, just a quarter narrower than the same drawings on index.html and
   hosting.html, which is invisible unless you compare the two pages.

   So assert the selector covers however deep the markup actually nests it. */
const bleed = css.slice(css.indexOf('--dg-w: min('));
const bleedSel = css.slice(0, css.indexOf('--dg-w: min(')).split('}').pop();
['energy.html', 'hosting.html', 'index.html'].forEach(f => {
    const s = fs.readFileSync(D + f, 'utf8');
    /* How the page actually nests it: .wrap > (.dg-fuel-pane >)? .dg-views */
    const viaPane = /<div class="dg-fuel-pane"[^>]*>[\s\S]*?<div class="dg-views/.test(s);
    const need = viaPane ? '.wrap > .dg-fuel-pane > .dg-views' : null;
    if (!need) { ok(true, '  ' + f + ': drawings are direct children of .wrap'); return; }
    ok(bleedSel.indexOf(need) >= 0,
       '  ' + f + ': nests .dg-views inside a pane, and the breakout rule says so',
       need);
});
ok(bleed.indexOf('width: var(--dg-w)') > 0,
   'and the breakout rule still sets the diagram measure');

/* ---- the gate the switch quietly depends on ----

   Hiding a pane is only free because diagram-engine.js watches each drawing
   with an IntersectionObserver and a hidden pane has no box to intersect, so
   the render loop stops on its own. That was INCIDENTAL before: with one
   drawing per page it only ever mattered while you scrolled past. The fuel
   switch now leans on it — two of the four drawings are hidden at all times,
   and without the gate the page would animate two invisible 3D scenes forever.
   Nothing else asserts it, so removing the observer would cost battery on every
   visit and break no test. */
const engine = fs.readFileSync(D + 'diagram-engine.js', 'utf8');
const engineCode = engine.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
ok(/new IntersectionObserver\([\s\S]{0,220}?threshold:\s*0\s*\}\)\.observe\(svg\)/.test(engineCode),
   'diagram-engine gates each drawing on an IntersectionObserver at threshold 0');
/* The else branch may be braced now — scrolling a figure out of view also
   releases it if it was locked — so the shape this accepts is "else, then a
   stop() before anything else", not "else stop()" exactly. */
ok(/isIntersecting[\s\S]{0,160}?else\s*\{?\s*stop\(\)/.test(engineCode),
   'and actually stops the loop when the drawing is not intersecting');
ok(/isIntersecting[\s\S]{0,200}?else\s*\{[\s\S]{0,60}?setLive\(false\)/.test(engineCode),
   'and releases a locked figure that has been scrolled away from');

/* The decorative canvas behind each drawing is a second animation, mounted once
   per canvas — four of them on this page. It needs the same gate. */
const hero = fs.readFileSync(D + 'hero-anim.js', 'utf8');
const heroCode = hero.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
ok(/new IntersectionObserver\([\s\S]{0,200}?threshold:\s*0\s*\}\)\.observe\(host\)/.test(heroCode),
   'and the field canvas behind each drawing is gated the same way');

/* Four canvases on the page, one per drawing — so two of them are inside a
   hidden pane at any moment and must be stopped by that gate. */
ok((sec.match(/class="anim-field anim-field--dg"/g) || []).length === 4,
   'four field canvases, one per drawing');

/* ---- the no-JS fallback ----

   Every drawing here ships a static frame so that JS-off still gets a complete,
   annotated diagram; README says so in as many words. A hidden second pane
   breaks that promise for the second fuel unless something un-hides it, and the
   switch itself is useless without JS, so it goes away.

   The !important is the whole point of asserting this. styles.css carries a
   global `[hidden] { display: none !important; }` — the first version of this
   fallback was a plain `display: block`, lost to it silently, and looked
   completely reasonable in the source. */
const ns = (sec.match(/<noscript>[\s\S]*?<\/noscript>/) || [''])[0];
ok(ns.length > 0, 'the section carries a no-JS fallback');
ok(/\.dg-fuel\s*\{\s*display:\s*none/.test(ns),
   'which hides the switch that cannot work without JS');
ok(/\.dg-fuel-pane\[hidden\]\s*\{\s*display:\s*block\s*!important/.test(ns),
   'and un-hides the second pane with !important, or the global [hidden] rule beats it');
/* The rule it has to outrank really is important, and really is global. */
ok(/\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(css),
   'the global [hidden] rule this has to beat is still there and still !important');
ok((sec.match(/class="dg-fuel-pane"/g) || []).length === 2, 'with a pane each');

/* LANDFILL LEADS. It is the market we are going after first, so it is the pane
   that is open when the page loads — this is the whole point of the change and
   the thing most likely to be quietly undone by an edit to the config order. */
const panes = [...sec.matchAll(/<div class="dg-fuel-pane" data-fuel="([a-z]+)"([^>]*)>/g)];
ok(panes.length === 2 && panes[0][1] === 'landfill', 'landfill is first',
   panes.map(p => p[1]).join(', '));
ok(panes[0][2].indexOf('hidden') < 0, 'and open at load');
ok(panes[1][1] === 'flare' && panes[1][2].indexOf('hidden') >= 0,
   'flared gas is second and hidden, not merely stacked below');

const picks = [...sec.matchAll(/<button type="button" data-fuel="([a-z]+)" aria-pressed="(true|false)">/g)];
ok(picks.length === 2 && picks[0][2] === 'true' && picks[1][2] === 'false',
   'exactly one button reads as pressed', picks.map(p => p[1] + '=' + p[2]).join(', '));
ok(picks[0][1] === panes[0][1] && picks[1][1] === panes[1][1],
   'and the buttons are in the same order as the panes');

/* The flame has real path data, not an empty d. An empty layer is silent. */
const flames = [...sec.matchAll(/<path class="dg-flame" id="([^"]+)" d="([^"]*)"/g)];
ok(flames.some(m => m[2].length > 100), 'the lit flare has real path data',
   Math.max(...flames.map(m => m[2].length)) + ' chars');
ok(flames.some(m => m[2].length > 0 && m[2].length < 100), 'and the pilot has its own, smaller');

/* Load order: the shared module has to run before the scenes that read it. */
/* THE VERSION IS PART OF THE URL NOW. Local assets carry ?v=<hash> so a browser cannot
   serve a stale copy — see tools/build-asset-stamp.js, which exists because a whole pricing
   section once shipped invisibly behind a cached page. These checks are asking "does this page
   load X", which is true with or without a version on it, so they match the path and let the
   query string be whatever it is. */
const order = [...html.matchAll(/<script src="\.\/([a-z-]+\.js)(?:\?v=[0-9a-f]+)?"><\/script>/g)]
    .map(m => m[1]);
const iGeo = order.indexOf('pad-geometry.js');
ok(iGeo >= 0 && iGeo < order.indexOf('scene-pad-now.js') &&
   iGeo < order.indexOf('scene-pad-ion.js'),
   'pad-geometry.js loads before both scenes', order.join(' -> '));

/* The crossfade is by position now, so a third pair works without new CSS. */
ok(css.indexOf('.dg-views > .dg-wrap:first-child') >= 0 &&
   css.indexOf('.dg-views > .dg-wrap:last-child') >= 0,
   'the crossfade is keyed by position, not by view name');
ok(css.indexOf('.dg-wrap--now .site-diagram') < 0 &&
   css.indexOf('.dg-wrap--ion .site-diagram') < 0,
   'and this pair takes no push-in, because the camera must not move');

/* ---------- 9. The slider machinery is not keyed to the hosting page ----------
   This is the failure that would have shipped looking fine. site.js decided
   which pane was interactive by testing for the literal names 'cont' and
   'asic'. On a page whose panes are 'now' and 'ion', neither test can pass, so
   both panes end up inert: the crossfade still runs and the drawing still
   rotates on its idle clock, so it LOOKS correct, and nothing responds to a
   drag, a wheel or a hover. */
const js = fs.readFileSync(D + 'site.js', 'utf8');
/* Comments out first. The comment explaining this bug names the very strings
   the check forbids, so reading the raw source fails on the explanation of the
   fix rather than on the fix. */
const jsCode = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
/* The driver binds EVERY .dg-scale-input now, not a single #dgScale, because
   energy.html carries two pairs behind the fuel switch. Anchoring the slice on
   the old id would silently slice from -1 and check a block of the wrong file. */
const sliderAt = jsCode.indexOf("querySelectorAll('.dg-scale-input')");
ok(sliderAt > 0, 'the slider driver binds every slider on the page, not one by id');
const sliderBlock = jsCode.slice(sliderAt, jsCode.indexOf('scale.addEventListener'));
["'cont'", "'asic'", "'now'", "'ion'"].forEach(n => {
    ok(sliderBlock.indexOf(n) < 0,
       'the slider does not hardcode the view name ' + n);
});
ok(sliderBlock.indexOf("getAttribute('data-view')") >= 0 &&
   sliderBlock.indexOf('keys[0]') >= 0,
   'it reads the pair off the page instead');
ok(sliderBlock.indexOf("setAttribute('data-at'") >= 0,
   'and writes a positional attribute for the stylesheet to key on');

/* The narrow-screen list switch had the same names baked in, which would have
   shown both lists at once under 900px. */
ok(css.indexOf('.dg-views[data-at="lo"] ~ .dg-list:last-of-type') >= 0 &&
   css.indexOf('.dg-views[data-at="hi"] ~ .dg-list:first-of-type') >= 0,
   'the narrow-screen list switch is positional too');
ok(css.indexOf('.dg-views[data-view="cont"]') < 0 &&
   css.indexOf('.dg-views[data-view="asic"]') < 0,
   'and no rule is left keyed to the hosting pair');

/* :first-of-type/:last-of-type only mean the right thing if these really are
   the only two lists beside that .dg-views — and of-type counts among SIBLINGS,
   so what matters is the count inside each parent, not inside the section.
   energy.html has four lists in the section now and the selectors are still
   correct, because each fuel pane holds its own two. Counting per section would
   have reported a fault that is not there. */
[['hosting.html', 1], ['energy.html', 2]].forEach(([f, groups]) => {
    const s = fs.readFileSync(D + f, 'utf8');
    /* Each .dg-views and the lists that follow it, up to the next .dg-views or
       the end of the section — one parent's worth of siblings. */
    const starts = [...s.matchAll(/<div class="dg-views/g)].map(m => m.index);
    ok(starts.length === groups, '  ' + f + ': ' + groups + ' pair(s) on the page',
       starts.length + ' found');
    starts.forEach((i, k) => {
        const end = k + 1 < starts.length ? starts[k + 1] : s.indexOf('</section>', i);
        const n = (s.slice(i, end).match(/<ol[^>]*>/g) || []).length;
        ok(n === 2, '  ' + f + ' pair ' + (k + 1) +
           ': exactly two lists beside it, so of-type selects the right one', n + ' found');
    });
});

/* ---------- 9b. The ground stays underfoot ----------
   It first drew in the 'back' layer, at the weight reserved for structural
   edges seen through a cutaway, and 20 x 11 cells of it. The reading was that
   the drawing was hard to make sense of — the surface was competing with the
   plant standing on it. Both halves of that are pinned here: its own layer at
   its own weight, and few enough cells to describe a surface rather than
   texture it. */
const groundRule = css.slice(css.indexOf('.dg-ground {'), css.indexOf('}', css.indexOf('.dg-ground {')));
ok(groundRule.indexOf('var(--line)') >= 0,
   'the ground draws at --line, the faintest hairline on the site');
ok(groundRule.indexOf('stroke-width: 0.5') >= 0, 'and thinner than a structural edge');
const padSrc = fs.readFileSync(D + 'pad-geometry.js', 'utf8');
ok(padSrc.indexOf('L.back += line([gx') < 0 && padSrc.indexOf('L.ground += line([gx') >= 0,
   'the pad grid goes to the ground layer, not to back');
/* Measured, not asserted: how much of the drawing IS ground. */
const secInk = {};
[...sec.matchAll(/<path class="dg-([a-z]+)"[^>]*d="([^"]*)"/g)].forEach(m => {
    secInk[m[1]] = (secInk[m[1]] || 0) + m[2].length;
});
const total = Object.values(secInk).reduce((a, b) => a + b, 0);
const share = (secInk.ground || 0) / total * 100;
ok(share < 6, 'the ground is a small share of the ink, not a competing subject',
   share.toFixed(1) + '% of ' + total + ' path chars');

/* ---------- 10. No entity written twice ----------
   The generator escapes eyebrow, heading and lede, so an &mdash; in the config
   becomes &amp;mdash; and the page prints the six characters instead of the
   dash. Only 'note' goes in raw. This shipped once in the energy lede and is
   invisible in the source — the config looks completely reasonable — so it is
   checked across every page rather than fixed in one place and forgotten. */
['index.html', 'hosting.html', 'energy.html', 'contact.html'].forEach(f => {
    const s = fs.readFileSync(D + f, 'utf8');
    const doubled = [...s.matchAll(/&amp;([a-z]+|#\d+);/g)].map(m => m[0]);
    ok(doubled.length === 0, '  ' + f + ': no entity escaped twice',
       doubled.length ? doubled.slice(0, 4).join(', ') : 'clean');
});

console.log('');
console.log(fail ? fail + ' FAILED' : 'ALL OK');
process.exitCode = fail ? 1 : 0;
