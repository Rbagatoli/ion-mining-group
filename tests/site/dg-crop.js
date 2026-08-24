/* THE MOBILE CROP MUST NOT CUT THE DRAWING OFF.
 *
 * On a phone the figure is cropped by CSS: the SVG is rendered wider than its wrap and the
 * overhang is clipped by overflow:hidden, so the empty margins the viewBox reserves for
 * callout bubbles stop eating two thirds of the width. The bubbles moved below the drawing,
 * where they are 171px wide instead of 60px, and the window grew to hold them.
 *
 * That crop is four hand-computed percentages per scene, and hand-computed percentages rot.
 * If a scene's geometry moves — a taller flare, a longer container, a wider pad — the crop
 * silently slices the edge off the drawing and nothing anywhere fails. The page still
 * renders. It just renders a picture with its side cut off.
 *
 * So this recomputes every scene's true extent from the scene modules themselves, sweeping a
 * full revolution because the silhouette changes with yaw and the widest angle is the one
 * that gets clipped, and asserts each CSS window contains it. Pure Node — the scenes are
 * plain modules and frame(yaw) returns the same path data the browser draws.
 */
const REPO_ROOT = require('path').join(__dirname, '..', '..').replace(/\\/g, '/') + '/';
const fs = require('fs');
const css = fs.readFileSync(REPO_ROOT + 'site/styles.css', 'utf8');

let fail = 0;
const ok = (cond, label, detail) => {
    console.log((cond ? '  ok   ' : '  FAIL ') + label + (detail ? '   ' + detail : ''));
    if (!cond) fail++;
};

/* Which scenes each wrap class has to hold. The energy page toggles two scenes through the
   same pair of wraps, so --now and --ion each have to frame both of theirs. */
const WRAPS = {
    'site':  ['scene-site'],
    'cont':  ['scene-hosting'],
    'asic':  ['scene-asic'],
    'now':   ['scene-landfill-now', 'scene-pad-now'],
    'ion':   ['scene-landfill-ion', 'scene-pad-ion'],
};

/* Every number a frame puts on screen, as a bounding box. Leaders and callout anchors are
   excluded deliberately: they run out to the gutters the crop exists to remove. */
function extentOf(mod) {
    const D = require(REPO_ROOT + 'site/' + mod + '.js');
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const eat = (d) => {
        if (typeof d !== 'string') return;
        const n = d.match(/-?\d+(?:\.\d+)?/g);
        if (!n) return;
        for (let i = 0; i + 1 < n.length; i += 2) {
            const x = +n[i], y = +n[i + 1];
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
    };
    const walk = (v, depth) => {
        if (depth > 4 || v == null) return;
        if (typeof v === 'string') return eat(v);
        if (Array.isArray(v)) return v.forEach(i => walk(i, depth + 1));
        if (typeof v === 'object') for (const k in v) {
            if (k === 'leaders' || k === 'hits') continue;
            walk(v[k], depth + 1);
        }
    };
    /* 72 steps: every 5 degrees, the same resolution dg-regress.js sweeps at. */
    for (let i = 0; i <= 72; i++) {
        const f = D.frame(Math.PI * 2 * (i / 72), null);
        walk(f.slots, 0);
        walk(f.flow, 0);
    }
    return { x0, x1, y0, y1, VB: D.VB };
}

/* Read the crop back out of the stylesheet, per wrap class.
 *
 * Split into rules and test the whole SELECTOR LIST, rather than matching the selector text
 * followed by `{`. Two of these scenes share one rule —
 *
 *     .dg-wrap--now .site-diagram,
 *     .dg-wrap--ion .site-diagram { ... }
 *
 * — and a pattern anchored on `{` sees the second and not the first, so --now reported as
 * having no crop at all when it has exactly the same one as --ion. */
function cropOf(cls, child) {
    const want = new RegExp('\\.dg-wrap--' + cls + '\\s+\\.' + (child || 'site-diagram') + '\\s*(?:,|$)');
    let last = null;
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(css)) !== null) {
        const sels = m[1].split(',').map(s => s.trim()).filter(Boolean);
        if (!sels.some(s => want.test(s + ','))) continue;
        /* THE RULE THAT CARRIES THE CROP, not simply the last one that matches the selector.
           A second rule — `.dg-wrap--cont .site-diagram { transform: none }`, which kills the
           slider's push-in on mobile — matches the same selector and declares no width, so
           taking the last match returned a rule with no crop in it and reported both scenes as
           having no mobile crop at all. */
        if (!/width:\s*[\d.]+%/.test(m[2])) continue;
        last = m[2];
    }
    if (!last) return null;
    const w = last.match(/width:\s*([\d.]+)%/);
    /* `margin: 0 -32.47%` — vertical first, then the horizontal pair that does the cropping.
       Nothing is cropped vertically; see the note in styles.css for why that is deliberate.
       The gas-field canvas expresses the same crop as `left: -32.47%` instead, because it is
       absolutely positioned rather than in the flow. */
    const mar = last.match(/margin:\s*(-?[\d.]+)(?:%|px)?\s+(-?[\d.]+)%/) ||
                last.match(/()left:\s*(-?[\d.]+)%/);
    if (!w || !mar) return null;
    return { w: +w[1], vert: mar[1] === '' ? 0 : +mar[1], side: +mar[2] };
}

/* Invert the CSS back into the viewBox window it leaves visible.
 *
 * The svg is rendered W*(w/100) wide inside a wrap W wide, and the overhang is pulled off
 * each side by a negative margin, then clipped by the wrap's overflow:hidden. So the hidden
 * strip is W*(-side/100) px, which at a scale of W*(w/100)/VB.w px per unit comes to
 * -side/w * VB.w viewBox units — and the window that survives spans VB.w * 100/w. */
function windowOf(crop, VB) {
    const x0 = -crop.side / crop.w * VB.w;
    return { x0: x0, x1: x0 + VB.w * 100 / crop.w };
}

console.log('  scene extents, swept over a full revolution:');
for (const [cls, mods] of Object.entries(WRAPS)) {
    /* The union across every scene this wrap has to hold. */
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, VB = null;
    mods.forEach(m => {
        const e = extentOf(m);
        x0 = Math.min(x0, e.x0); x1 = Math.max(x1, e.x1);
        y0 = Math.min(y0, e.y0); y1 = Math.max(y1, e.y1);
        VB = e.VB;
    });
    /* Clamp to the viewBox. Some scenes emit geometry past the edge — the landfill reaches
       y 511 of 470 — and the viewBox already clips it. Asking the crop to preserve what is
       invisible anyway would force it to crop nothing. */
    x0 = Math.max(0, x0); x1 = Math.min(VB.w, x1);
    y0 = Math.max(0, y0); y1 = Math.min(VB.h, y1);
    const crop = cropOf(cls);
    console.log('  .dg-wrap--' + cls.padEnd(6) + ' draws x ' +
        Math.round(x0) + '..' + Math.round(x1) + '  y ' + Math.round(y0) + '..' + Math.round(y1) +
        '   of a ' + VB.w + 'x' + VB.h + ' viewBox');
    if (!crop) { ok(false, '  has a mobile crop in styles.css'); continue; }
    const win = windowOf(crop, VB);
    ok(win.x0 <= x0 && win.x1 >= x1,
       '  the crop keeps the whole drawing',
       'window x ' + Math.round(win.x0) + '..' + Math.round(win.x1) +
       '  clear by ' + Math.round(x0 - win.x0) + '/' + Math.round(win.x1 - x1) + ' units');
    /* And it has to be worth doing. Cropping nothing is safe and pointless: the whole reason
       the window is cropped is that two thirds of the viewBox width was reserved for bubbles
       that now sit underneath it. If the drawing does not fill what is left, the phone is
       still showing mostly empty space. */
    const fill = (x1 - x0) / (win.x1 - win.x0);
    ok(fill > 0.90, '  and the drawing fills it', (fill * 100).toFixed(1) + '% of the window');
    /* Nothing may be cropped vertically — the scenes rise and fall through the sweep. */
    ok(crop.vert === 0, '  and nothing is cropped vertically', 'margin top/bottom ' + crop.vert);

    /* THE GAS FIELD MUST SIT IN THE SAME BOX AS THE DRAWING.
     *
     * hero-anim.js paints the plant's silhouette as an occluder and maps the viewBox into the
     * canvas with a CONTAIN fit. That is only correct if the canvas and the SVG occupy the
     * same box: give them different boxes and the hole in the gas is cut in the wrong place
     * and the wrong size, which is what "the background animation is not proportional" was.
     * Since the SVG's aspect equals the viewBox's, identical boxes make the contain fit exact
     * rather than approximate — so this is an equality, not a tolerance. */
    const field = cropOf(cls, 'anim-field--dg');
    ok(!!field, '  the gas field has a matching crop', field ? '' : 'no .anim-field--dg rule');
    if (field) {
        ok(field.w === crop.w && field.side === crop.side,
           '  and it is the same box as the drawing',
           'field ' + field.w + '% @ ' + field.side + '%   drawing ' + crop.w + '% @ ' + crop.side + '%');
    }
}

console.log('');
console.log(fail ? fail + ' FAILED' : 'ALL OK');
process.exitCode = fail ? 1 : 0;
