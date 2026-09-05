/* ===== PROTON MINING — Diagram engine =====
   Scene-agnostic machinery for the interactive 3D cutaways: projection,
   back-face culling, the seven paint layers, depth-sorted slots, hover regions,
   and the whole interaction layer (drag, zoom, hover, keyboard, controls).

   createDiagram(scene) returns an independent instance. It is a factory rather
   than a singleton on purpose: view state (pitch, zoom) lives per instance, so
   two diagrams can never share it.

   Things that took real debugging to get right, and must not be undone:

   - +Z IS THE NEAR SIDE. Perspective is FOV/(FOV - z2*scale). Flip the sign and
     every scene renders inside-out.
   - CULLING IS BY PROJECTED SIGNED AREA, faces wound outward-CCW; screen y runs
     down, so front-facing is negative. A convex box shows 2 or 3 faces, never 4.
   - polyInside NORMALISES INTERIOR WINDING. Interior quads are viewed from
     inside, so their outward winding flips as the scene turns; sharing one path
     under fill-rule:nonzero then cancels and punches a hole.
   - PAINT ORDER WITHIN AN OBJECT IS FIXED: inside, back, asics, end, side, top,
     detail. Buckets cannot express occlusion between two boxes of one object —
     only between objects, via the depth-sorted slots.
   - OBJECTS ARE DEPTH SORTED into fixed DOM slots, so the document is never
     reordered. Hover identity therefore lives on region hit paths, not slots:
     slot 0 holds a different object from one frame to the next.
   - Anchors are projected model coordinates; drag uses pointer deltas. Only a
     callout activation or resize measures the visible crop to frame a close-up.

   A scene supplies:
     { view:        { VB, BASE_PITCH, FOV, BASE_SCALE, ORIGIN, SHIFT_X, PERIOD, BASE_YAW },
       renderables: [ { id, at, build(H, yaw) } ],
       callouts:    [ { id, side, y, title, desc, at } ],
       flow:        (H, yaw) => pathString,
       regionBoxes: id => [box],
       objects:     () => [ { id, box } ],
       extraBoxes:  () => [box],      // included in clipping bounds
       data:        { ... }           // merged into the returned api
     }
*/

(function (root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.DiagramEngine = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var BUCKET_OF = { top: 'top', bot: 'end', front: 'side', back: 'side',
                      left: 'end', right: 'end' };

    /* Paint order. 'ground' is first and 'flame' is last, and both exist for
       the energy page. Ground texture used to go in 'back', which is the
       weight reserved for structural edges you can see through the cutaway —
       so a pad surface drew as loud as the machinery standing on it and the
       drawing was hard to read. It gets its own, much fainter weight.

       'flame' is last because the only thing that uses it — the
       lit flare on the energy page — sits on top of a 15 m stack and is the one
       filled, coloured object in the whole drawing family. Empty for every
       other scene, which costs one unused path per slot. */
    /* 'inner' arrived with the solid pass and is the layer that makes solid paint honest.
       Under translucent fills, every hairline could ride in 'detail' — the last layer —
       because nothing truly covered anything and a manifold seen "through" a wall read as
       the x-ray doing its job. Once the fills went opaque that became bleed-through: a
       container viewed from behind wore its own plumbing and machine strips on the outside
       of a blank steel wall. 'inner' paints AFTER the machines but BEFORE the shell faces,
       so line work that belongs inside a box is hidden by the box exactly when the box
       faces you, with no per-line culling anywhere. 'detail' remains for marks that live on
       exterior surfaces (which guard themselves with frontFacing where their face can turn
       away). */
    var LAYERS = ['ground', 'inside', 'back', 'asics', 'inner', 'end', 'side', 'top', 'detail', 'flame'];

    /* Which layers the plant is SOLID in, for the occluder the gas field reads.

       The rule: a layer contributes iff it declares a FILL. Anything with a
       filled area is a surface you are meant to be looking at rather than
       through, whatever it is made of.
         end / side / top   the lit faces of every solid
         inside             the cutaway interior
         asics              the machines
         flame              a filled surface, and gas drifting through the fire
                            says the flare is not destroying it
         ground             the earth the plant stands on — the landfill cap's
                            apron and the wellpad slab

       GROUND WAS EXCLUDED AT FIRST, AND THAT WAS A MISTAKE WORTH RECORDING,
       because the reasoning was sound and the evidence behind it was not. The
       argument was that the ground is a 0.04 surface spanning most of the frame,
       so occluding it would blank the field across the picture and delete the
       source line with it. That was checked against a prototype that PAINTED an
       opaque silhouette, where it was true and looked terrible: the ground
       turned into a black slab and stopped reading as translucent at all.

       Erasing is not painting. Subtracting the ground from the canvas leaves the
       ground exactly as translucent as it was — its 0.04 fill, its grid, the
       panel sheen behind it, all untouched — and removes only the particles
       behind it. Measured after the fact: the source line survives on 99-100% of
       the bottom edge through a full turn, because the quad's near edge never
       actually reaches it.

       The visible consequence of getting this wrong was precise: index.html and
       hosting.html have NO ground layer, so those drawings looked completely
       clean, while the landfill and flare drawings — the only ones with a ground
       plane — still showed gas through it.

       Excluded, and these hold:
         back     fill:none. Its hairlines are the x-ray content the field must
                  not hide, and some of them — the flare stack's guy wires — run
                  out into open air where an occluding smear would be a scar.
         detail   fill:none, and drawn on faces the fills already cover.
         flow     fill:none, and dashed on purpose; the gaps ARE the message.
         node     already fully opaque, so a no-op.

       This list is deliberately NOT LAYERS-shaped: adding to LAYERS would make
       every drawing on the site silently refuse to mount until all three pages
       were regenerated. */
    var OCCLUDING = ['ground', 'inside', 'asics', 'end', 'side', 'top', 'flame'];


    /* --- THE DRAWING OWNS THE TOUCHES THAT LAND ON IT --------------------
     *
     * One rule, and no mode to get into: a finger that lands on a rendering
     * window turns that model or zooms it, and never scrolls the page. Every
     * other pixel on the page - the callout cards under the drawing included -
     * scrolls exactly as it always did.
     *
     * WHAT CAME BEFORE, AND WHY IT KEPT FAILING. First touch-action: pan-y, so
     * the browser could sort a scroll from a turn by direction. It judges on the
     * first few pixels, so a drag meant for the model that started a few degrees
     * off vertical was gone before the figure saw it. Then a tap to arm it, which
     * was worse: a tap on a real screen drifts further than a mouse click, and
     * pan-y let the browser claim any touch with a vertical component the moment
     * it had one - firing pointercancel and throwing the half-formed tap away. So
     * the commonest gesture of all, a finger landing on the picture and moving,
     * scrolled the page and armed nothing.
     *
     * The lesson is that there was never a gesture to disambiguate. On the
     * picture, every touch is for the picture.
     *
     * is-live IS ONLY FEEDBACK NOW: the ring and the orange hint, on from the
     * first touch until the reader touches something else. Still one at a time
     * across the page, module-level, because energy.html carries four figures.
     *
     * NO BODY SCROLL LOCK, EVER. The obvious way to "freeze the page" is
     * position: fixed on the body with the offset restored afterwards, and it is
     * a trap: anything that throws in between leaves a site that cannot be
     * scrolled at all. The worst this can produce is a figure that stays ringed. */
    var live = { wrap: null, off: null };
    var docBound = false;

    function bindDocExit() {
        if (docBound || typeof document === 'undefined' ||
            !document.addEventListener) return;
        docBound = true;
        /* CAPTURE PHASE. The nav, the cart and the callouts all stop propagation
           on their own handlers; listening on the way down means none of them can
           strand a figure in the live state by swallowing the tap that should
           have released it. */
        document.addEventListener('pointerdown', function (e) {
            if (!live.wrap || !live.off) return;
            if (live.wrap.contains && live.wrap.contains(e.target)) return;
            live.off();
        }, true);
        document.addEventListener('keydown', function (e) {
            if (live.wrap && live.off && e.key === 'Escape') live.off();
        });
    }

    /* Views that move together. Scenes load as separate modules and never see
       each other, so the link is looked up by name rather than passed around. */
    var LINKS = {};
    function sharedLink(name) {
        if (!LINKS[name]) {
            LINKS[name] = { yaw: 0, pitch: null, zoom: null, idle: true, t0: null, focusOwner: null,
                            subs: [], owner: null };
        }
        return LINKS[name];
    }

    /* Arrowheads for the flow line, derived from the flow path itself.

       The dashed orange run is the one animated element besides the rotation,
       and nothing about it said which WAY anything moves — gas into engines,
       power into containers, coolant round the loop. Direction was carried
       solely by the dash drift: 17 viewBox units every 2.6 s, which on a still
       frame is nothing at all.

       Derived HERE rather than drawn by the scenes, so a head can never point
       somewhere its line does not go: the input is the projected path string
       scene.flow() already produced, and one closed triangle is emitted at the
       END of each M...L... subpath, oriented along its arrival. On the home
       scene that is the trunk plus the spur into each container; on the
       hosting scene, the exit of each coolant circuit back into the CDU.

       Emitted as a separate path, not folded into the flow, because .dg-flow's
       dasharray applies to everything in its element and would chop a closed
       triangle into confetti. The heads path takes a plain orange FILL.

       Orientation walks BACK PAST short segments. Not for the idle turn — measured
       over 2880 yaws at every scene's BASE_PITCH, no flow subpath's final segment
       ever projects under 7.6 units (the home spurs bottom out at 14.4; pitch keeps
       a horizontal run from going truly edge-on), so this walk-back never fires
       while the drawing turns by itself. It exists for DRAGGED pitch: at PITCH_MIN
       the same segments collapse to 1.7 units on the home page and 0.2 on the
       machine, where 0.1-rounded coordinates would swing a head by tens of degrees
       between frames. Direction is taken from the last point at least HEAD_MIN from
       the terminus (at 2 units the 0.1 rounding is a sub-3-degree wobble), and a
       subpath with no such point gets NO head: a run seen end-on has no direction
       to show. Swept, heads drop out gracefully there — home 5 to 3, machine 2 to
       0 — with no NaN anywhere in the pitch envelope.

       Sizes are viewBox units, so the heads scale with the drawing exactly as
       its stroke widths do — nothing in this stylesheet uses vector-effect.
       Measured at the real page sizes rather than eyeballed: 9 units is 9.7 px
       tip-to-base on the 1384px desktop page and 4.5-5.1 px in the 390px phone
       crop (scale 0.503-0.562 px/unit depending on the wrap's zoom), against a
       dash that is 3.0-3.4 px long and 1 px wide there — bigger than anything
       the dashed line itself puts on screen, small enough that the five heads
       on the home scene stay annotation rather than subject. Longer heads were
       considered and rejected by geometry, not taste: the home spurs are about
       14.5 units at rest, so an 11-unit head would swallow the very line that
       gives it a context. */
    var HEAD_LEN = 9;    // tip to base
    var HEAD_HW  = 3.6;  // half-width of the base
    var HEAD_MIN = 2;    // shortest projected run that still orients a head

    function flowHeads(d) {
        if (!d) return '';
        var r1 = function (v) { return Math.round(v * 10) / 10; };
        var out = '';
        var subs = d.split('M');
        for (var s = 0; s < subs.length; s++) {
            var nums = subs[s].match(/-?\d+(?:\.\d+)?/g);
            if (!nums || nums.length < 4) continue;
            var n = nums.length - (nums.length % 2);
            var ex = +nums[n - 2], ey = +nums[n - 1];
            var px = null, py = null;
            for (var i = n - 4; i >= 0; i -= 2) {
                var cx = +nums[i], cy = +nums[i + 1];
                if ((ex - cx) * (ex - cx) + (ey - cy) * (ey - cy) >=
                    HEAD_MIN * HEAD_MIN) { px = cx; py = cy; break; }
            }
            if (px === null) continue;
            var dx = ex - px, dy = ey - py;
            var len = Math.sqrt(dx * dx + dy * dy);
            var ux = dx / len, uy = dy / len;
            var bx = ex - ux * HEAD_LEN, by = ey - uy * HEAD_LEN;
            var wx = -uy * HEAD_HW, wy = ux * HEAD_HW;
            out += 'M' + r1(ex) + ' ' + r1(ey) +
                   'L' + r1(bx + wx) + ' ' + r1(by + wy) +
                   'L' + r1(bx - wx) + ' ' + r1(by - wy) + 'Z';
        }
        return out;
    }

    function createDiagram(scene) {
    /* Presentation and scheduling are opt-in: the comparison scenes retain their
       existing paths, paint order and synchronized motion. */
    var layers = scene.layers || LAYERS;
    var optimized = !!scene.optimize;
    var motion = scene.idleMotion;
    var compact = false, camera = null, cachedFrame = null, revision = 0;
    var FOCUS_ARC = 10 * Math.PI / 180, FOCUS_PERIOD = 28000;

    function setCompact(value) { compact = !!value; }
    function detailLevel() { return compact && zoom <= 1.35 ? 'compact' : 'full'; }

    /* ---------- View ---------- */

    // var VB       = { w: 1280, h: 470 };   <- now supplied by the scene
    // var BASE_PITCH = 26 * Math.PI / 180;   <- now supplied by the scene
    // var FOV      = 1500;   <- now supplied by the scene
    // var BASE_SCALE = 28;   <- now supplied by the scene
    // var ORIGIN   = { x: 640, y: 318 };   <- now supplied by the scene
    // var SHIFT_X  = -3.28;   <- now supplied by the scene
    // var PERIOD   = 26000;   <- now supplied by the scene

    var PITCH_MIN = 3 * Math.PI / 180, PITCH_MAX = 62 * Math.PI / 180;
    var ZOOM_MIN = 0.55, ZOOM_MAX = 2.6;

    // Mutable view state. Kept at module level rather than threaded through
    // forty call sites; this is single threaded and one frame builds at a time.
    var pitch = BASE_PITCH, zoom = 1, target = null, screen = null, lens = 1;

    function setView(v) {
        if (v.pitch !== undefined) pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, v.pitch));
        if (v.zoom  !== undefined) zoom  = Math.max(ZOOM_MIN,  Math.min(ZOOM_MAX,  v.zoom));
        if (v.target !== undefined) target = v.target ? v.target.slice() : null;
        if (v.screen !== undefined) screen = v.screen ? v.screen.slice() : null;
        if (v.lens !== undefined) lens = Math.max(1, Math.min(2, v.lens));
        revision++;
    }
    function getView() { return { pitch: pitch, zoom: zoom, lens: lens,
        target: target ? target.slice() : null, screen: screen ? screen.slice() : null }; }
    function resetView() { setView({ pitch: BASE_PITCH, zoom: 1, target: null, screen: null, lens: 1 }); }


    var V = scene.view;
    var BASE_YAW = V.BASE_YAW || 0;
    var VB = V.VB, BASE_PITCH = V.BASE_PITCH, FOV = V.FOV,
        BASE_SCALE = V.BASE_SCALE, ORIGIN = V.ORIGIN, SHIFT_X = V.SHIFT_X, PERIOD = V.PERIOD;
    pitch = BASE_PITCH;

    var CALLOUTS = scene.callouts;
    var regionBoxes = scene.regionBoxes;
    var objects = scene.objects;

    /* ---------- Projection ---------- */

    function rotZ(p, yaw) {
        var a = yaw + BASE_YAW;
        return -(p[0] + SHIFT_X) * Math.sin(a) + p[2] * Math.cos(a);
    }

    function rawProject(p, yaw, pivot, viewLens) {
        /* Translate in MODEL space before rotating or applying perspective.
           Moving an already projected part to the screen centre left its depth
           orbiting the site origin, making outer equipment swell and shrink. */
        var px = pivot ? p[0] - pivot[0] : p[0] + SHIFT_X;
        var py = pivot ? p[1] - pivot[1] : p[1];
        var pz = pivot ? p[2] - pivot[2] : p[2];
        /* Back the focus camera away with a longer lens at the same subject
           scale. Far parts of the site then stay in front of the camera even
           during a full manual orbit around equipment on the outer edge. */
        var fov = FOV * (viewLens === undefined ? lens : viewLens);
        if (optimized) {
            if (!camera || camera.yaw !== yaw || camera.pitch !== pitch || camera.zoom !== zoom) {
                var angle = yaw + BASE_YAW;
                camera = { yaw: yaw, pitch: pitch, zoom: zoom,
                    cy: Math.cos(angle), sy: Math.sin(angle),
                    cp: Math.cos(pitch), sp: Math.sin(pitch), scale: BASE_SCALE * zoom };
            }
            var C = camera;
            var xx = px * C.cy + pz * C.sy;
            var zz = -px * C.sy + pz * C.cy;
            var yy = py * C.cp - zz * C.sp;
            var depth = py * C.sp + zz * C.cp;
            var perspective = fov / (fov - depth * C.scale);
            return [ORIGIN.x + xx * C.scale * perspective,
                    ORIGIN.y - yy * C.scale * perspective];
        }
        var a = yaw + BASE_YAW;
        var cy = Math.cos(a), sy = Math.sin(a);
        var x = px * cy + pz * sy;
        var z = -px * sy + pz * cy;
        var cp = Math.cos(pitch), sp = Math.sin(pitch);
        var y2 = py * cp - z * sp;
        var z2 = py * sp + z * cp;
        var s = BASE_SCALE * zoom;
        // +Z toward the viewer: larger z2 shrinks the denominator, so the point
        // scales up. The scene is authored to that convention throughout.
        var k = fov / (fov - z2 * s);
        return [ORIGIN.x + x * s * k, ORIGIN.y - y2 * s * k];
    }

    function project(p, yaw) {
        var q = rawProject(p, yaw, target);
        if (!target || !screen) return q;  // Preserve the original overview paths exactly.
        return [q[0] + screen[0] - ORIGIN.x, q[1] + screen[1] - ORIGIN.y];
    }

    function focusBoxes(id) { return (scene.focusBoxes || regionBoxes)(id); }

    /* Fit the selected equipment, not the whole drawing. This is calculated on
       activation, never in the animation loop. Keeping a world-space target
       means subsequent drag and zoom still centre on the inspected equipment. */
    function focusView(id, yaw, windowBox) {
        var pts = [];
        focusBoxes(id).forEach(function (box) { pts = pts.concat(boxCorners(box)); });
        if (!pts.length) return null;
        var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        pts.forEach(function (p) {
            for (var i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
        });
        var aim = lo.map(function (n, i) { return (n + hi[i]) / 2; });
        var box = windowBox || { left: 270, right: VB.w - 270, top: 32, bottom: VB.h - 42 };
        var halfW = (box.right - box.left) * 0.47, halfH = (box.bottom - box.top) * 0.47;
        var savedZoom = zoom, low = ZOOM_MIN, high = ZOOM_MAX;
        var angles = [-1, -0.5, 0, 0.5, 1].map(function (n) { return yaw + n * FOCUS_ARC; });
        for (var step = 0; step < 14; step++) {
            zoom = (low + high) / 2;
            /* Reserve room for the entire gentle sweep, including on phones.
               This fit runs on selection/resize, never on animation frames. */
            var fits = angles.every(function (angle) {
                return pts.every(function (p) {
                    var q = rawProject(p, angle, aim, 2);
                    return Math.abs(q[0] - ORIGIN.x) <= halfW && Math.abs(q[1] - ORIGIN.y) <= halfH;
                });
            });
            if (fits) low = zoom; else high = zoom;
        }
        zoom = savedZoom; camera = null;
        return { pitch: pitch, zoom: low, lens: 2, target: aim,
            screen: [(box.left + box.right) / 2, (box.top + box.bottom) / 2] };
    }

    function interpolateView(from, to, fraction) {
        var t = Math.max(0, Math.min(1, fraction));
        t = t * t * (3 - 2 * t);
        var mix = function (a, b) { return a + (b - a) * t; };
        var a = from.target || [-SHIFT_X, 0, 0], b = to.target || [-SHIFT_X, 0, 0];
        var c = from.screen || [ORIGIN.x, ORIGIN.y], d = to.screen || [ORIGIN.x, ORIGIN.y];
        return { pitch: mix(from.pitch, to.pitch), zoom: mix(from.zoom, to.zoom),
            lens: mix(from.lens || 1, to.lens || 1),
            target: a.map(function (v, i) { return mix(v, b[i]); }),
            screen: c.map(function (v, i) { return mix(v, d[i]); }) };
    }

    function depthOf(p, yaw) {
        return p[1] * Math.sin(pitch) + rotZ(p, yaw) * Math.cos(pitch);
    }

    var n1 = function (v) { return Math.round(v * 10) / 10; };

    /* Screen-space signed area of a projected polygon. */
    function signedArea(pts3, yaw) {
        var a = 0, n = pts3.length;
        if (optimized) {
            var first = project(pts3[0], yaw), previous = first;
            for (var j = 1; j < n; j++) {
                var next = project(pts3[j], yaw);
                a += previous[0] * next[1] - next[0] * previous[1];
                previous = next;
            }
            return a + previous[0] * first[1] - first[0] * previous[1];
        }
        for (var i = 0; i < n; i++) {
            var p = project(pts3[i], yaw), q = project(pts3[(i + 1) % n], yaw);
            a += p[0] * q[1] - q[0] * p[1];
        }
        return a;
    }

    /* Interior surfaces are viewed from inside, so their outward winding
       projects inconsistently as the scene turns. Force them all to the same
       screen winding: they share one path under fill-rule:nonzero, and mixed
       winding cancels where two overlap and punches a hole in the container. */
    function polyInside(pts3, yaw) {
        var a = signedArea(pts3, yaw);
        // A quad going edge-on has near-zero area and an ambiguous sign, which
        // survives coordinate rounding as noise. It paints nothing either way,
        // so drop it rather than risk emitting it wound against the others.
        if (Math.abs(a) < 40) return '';
        return poly(a > 0 ? pts3.slice().reverse() : pts3, yaw);
    }

    function poly(pts3, yaw) {
        var d = '';
        for (var i = 0; i < pts3.length; i++) {
            var q = project(pts3[i], yaw);
            d += (i ? 'L' : 'M') + n1(q[0]) + ' ' + n1(q[1]);
        }
        return d + 'Z';
    }

    function frontFacing(pts3, yaw) {
        if (optimized) return signedArea(pts3, yaw) < 0;
        var a = 0, n = pts3.length;
        for (var i = 0; i < n; i++) {
            var p = project(pts3[i], yaw), q = project(pts3[(i + 1) % n], yaw);
            a += p[0] * q[1] - q[0] * p[1];
        }
        return a < 0;
    }

    function boxFaces(b) {
        var x0 = b.x - b.w / 2, x1 = b.x + b.w / 2;
        var y0 = b.y,           y1 = b.y + b.h;
        var z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
        return {
            top:   [[x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0]],
            bot:   [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]],
            front: [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],
            back:  [[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]],
            left:  [[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]],
            right: [[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]],
        };
    }
    function newLayers() {
        var out = { ground: '', inside: '', back: '', asics: '', inner: '', end: '',
                    side: '', top: '', detail: '', flame: '' };
        if (scene.layers) for (var i = 0; i < layers.length; i++) out[layers[i]] = '';
        return out;
    }

    function addBox(L, b, yaw, skip) {
        var f = boxFaces(b);
        for (var k in f) {
            if (skip && skip.indexOf(k) >= 0) continue;
            if (!frontFacing(f[k], yaw)) continue;
            L[BUCKET_OF[k]] += poly(f[k], yaw);
        }
    }

    function line(a, b, yaw) {
        var p = project(a, yaw), q = project(b, yaw);
        return 'M' + n1(p[0]) + ' ' + n1(p[1]) + 'L' + n1(q[0]) + ' ' + n1(q[1]);
    }

    /* Ring in the plane of constant z (fans, drums, dishes). */
    function ring(cx, cy, cz, r, yaw, steps) {
        steps = steps || 8;
        var d = '';
        for (var i = 0; i <= steps; i++) {
            var t = i / steps * Math.PI * 2;
            var q = project([cx + Math.cos(t) * r, cy + Math.sin(t) * r, cz], yaw);
            d += (i ? 'L' : 'M') + n1(q[0]) + ' ' + n1(q[1]);
        }
        return d;
    }
    /* Ring in the plane of constant y (screw heads and terminals lying on a
       horizontal face). Without this they get drawn with ring(), which stands
       them upright out of the surface they are supposed to lie flat on. */
    function ringY(cx, cy, cz, r, yaw, steps) {
        steps = steps || 8;
        var d = '';
        for (var i = 0; i <= steps; i++) {
            var t = i / steps * Math.PI * 2;
            var q = project([cx + Math.cos(t) * r, cy, cz + Math.sin(t) * r], yaw);
            d += (i ? 'L' : 'M') + n1(q[0]) + ' ' + n1(q[1]);
        }
        return d;
    }

    /* Ring in the plane of constant x (vessel ends, conservator caps). */
    function ringX(cx, cy, cz, r, yaw, steps) {
        steps = steps || 8;
        var d = '';
        for (var i = 0; i <= steps; i++) {
            var t = i / steps * Math.PI * 2;
            var q = project([cx, cy + Math.sin(t) * r, cz + Math.cos(t) * r], yaw);
            d += (i ? 'L' : 'M') + n1(q[0]) + ' ' + n1(q[1]);
        }
        return d;
    }


    /* Helper bundle handed to scene builders, so a scene never reaches into
       engine internals directly. */
    var H = {
        project: project, depthOf: depthOf, n1: n1, signedArea: signedArea,
        poly: poly, polyInside: polyInside, frontFacing: frontFacing,
        boxFaces: boxFaces, newLayers: newLayers, addBox: addBox,
        line: line, ring: ring, ringX: ringX, ringY: ringY,
        detailLevel: detailLevel,
    };

    var REGION_IDS = CALLOUTS.map(function (c) { return c.id; });

    /* Screen-space bounding polygon of a region, used as its hit target. */
    function regionHit(id, yaw) {
        var boxes = regionBoxes(id);
        var mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9;
        boxes.forEach(function (b) {
            boxCorners(b).forEach(function (p) {
                var q = project(p, yaw);
                mnx = Math.min(mnx, q[0]); mxx = Math.max(mxx, q[0]);
                mny = Math.min(mny, q[1]); mxy = Math.max(mxy, q[1]);
            });
        });
        return { d: 'M' + n1(mnx) + ' ' + n1(mny) + 'L' + n1(mxx) + ' ' + n1(mny) +
                      'L' + n1(mxx) + ' ' + n1(mxy) + 'L' + n1(mnx) + ' ' + n1(mxy) + 'Z',
                 area: Math.max(0, mxx - mnx) * Math.max(0, mxy - mny) };
    }

    /* Bright overlay for the hovered region. */
    function regionHighlight(id, yaw, focused) {
        if (!id) return '';
        var d = '';
        (focused ? focusBoxes(id) : regionBoxes(id)).forEach(function (b) {
            var f = boxFaces(b);
            for (var k in f) if (frontFacing(f[k], yaw)) d += poly(f[k], yaw);
        });
        return d;
    }


    var RENDERABLES = scene.renderables;
    var SLOTS = RENDERABLES.length;

    function calloutOrigin(co) {
        return co.side === 'l' ? [250, co.y] : [VB.w - 250, co.y];
    }
    function calloutAnchor(co, yaw) { return project(co.at, yaw); }

    function frame(yaw, hover, selected) {
        var detail = detailLevel();
        if (optimized && cachedFrame && cachedFrame.yaw === yaw &&
            cachedFrame.revision === revision && cachedFrame.pitch === pitch && cachedFrame.zoom === zoom && cachedFrame.detail === detail) {
            /* Hover changes only the overlay. Keep the geometry and hit regions. */
            return Object.assign({}, cachedFrame.value, { highlight: regionHighlight(hover, yaw, hover === selected) });
        }
        var order = RENDERABLES.map(function (r) {
            return { r: r, depth: depthOf(r.at, yaw) };
        }).sort(function (a, b) { return a.depth - b.depth; });

        // Hit shapes: largest first, so the smallest ends up on top and wins.
        var hits = REGION_IDS.map(function (id) {
            var h = regionHit(id, yaw);
            return { id: id, d: h.d, area: h.area };
        }).sort(function (a, b) { return b.area - a.area; });

        /* Built once and passed to flowHeads, not rebuilt there: the heads are
           a pure function of this exact string, which is what lets the baked
           page and the runtime agree byte for byte. */
        var flowD = scene.flow(H, yaw);

        var result = {
            yaw: yaw,
            slots: order.map(function (o) {
                var L = o.r.build(H, yaw);
                L.id = o.r.id;
                return L;
            }),
            hits: hits,
            highlight: regionHighlight(hover, yaw, hover === selected),
            flow: flowD,
            flowHeads: flowHeads(flowD),
            leaders: CALLOUTS.map(function (co) {
                var a = calloutAnchor(co, yaw), o2 = calloutOrigin(co);
                return { id: co.id, x1: n1(o2[0]), y1: n1(o2[1]), x2: n1(a[0]), y2: n1(a[1]) };
            }),
        };
        if (optimized) cachedFrame = { yaw: yaw, pitch: pitch, zoom: zoom, revision: revision, detail: detail, value: result };
        return result;
    }

    /* One full revolution per PERIOD. It used to be a sine sweep bounded by
       YAW_MAX, which rocked back and forth and never came round; a turntable
       reads as an object you are being shown, an oscillation reads as a
       widget. Framing in every scene is fitted to the whole 360 envelope, not
       to a narrow sweep. */
    function yawAt(ms) {
        return (ms % PERIOD) / PERIOD * Math.PI * 2;
    }

    function idleYawAt(ms) {
        return motion ? Math.sin(ms / motion.period * Math.PI * 2) * motion.amplitude : yawAt(ms);
    }

    function boxCorners(b) {
        var f = boxFaces(b), seen = {}, out = [];
        for (var k in f) f[k].forEach(function (p) {
            var key = p.join(',');
            if (!seen[key]) { seen[key] = 1; out.push(p); }
        });
        return out;
    }
    function allPoints() {
        var pts = [];
        objects().forEach(function (o) { boxCorners(o.box).forEach(function (p) { pts.push(p); }); });
        (scene.extraBoxes ? scene.extraBoxes() : []).forEach(function (b) {
            boxCorners(b).forEach(function (p) { pts.push(p); });
        });
        CALLOUTS.forEach(function (c) { pts.push(c.at); });
        return pts;
    }


    var api = {
        VB: VB, CALLOUTS: CALLOUTS, SLOTS: SLOTS,
        LAYERS: layers, REGION_IDS: REGION_IDS,
        PERIOD: PERIOD, BASE_SCALE: BASE_SCALE,
        ZOOM_MIN: ZOOM_MIN, ZOOM_MAX: ZOOM_MAX, PITCH_MIN: PITCH_MIN, PITCH_MAX: PITCH_MAX,
        RENDER_ANCHORS: RENDERABLES.map(function (r) { return { id: r.id, at: r.at }; }),
        project: project, depthOf: depthOf, frame: frame, yawAt: yawAt,
        allPoints: allPoints, objects: objects, boxCorners: boxCorners,
        boxFaces: boxFaces, frontFacing: frontFacing, regionBoxes: regionBoxes,
        regionHit: regionHit, calloutAnchor: calloutAnchor, calloutOrigin: calloutOrigin,
        setView: setView, getView: getView, resetView: resetView,
        focusView: focusView, focusBoxes: focusBoxes, interpolateView: interpolateView,
        setCompact: setCompact, idleYawAt: idleYawAt,
        H: H, scene: scene,
    };
    if (scene.data) for (var dk in scene.data) api[dk] = scene.data[dk];

    /* ---------- Browser ---------- */

    if (typeof document !== 'undefined') {
        /* opts.prefix namespaces every element id, and opts.root picks the
           wrapper. Both default to what a single-diagram page already uses, so
           existing pages are unchanged. They exist so the hosting page can run
           TWO instances side by side — the container and one machine — without
           their ids colliding. */
        api.mount = function (opts) {
            opts = opts || {};

            /* A scene can appear on more than one page: the single container is
               the far end of the home page's slider AND the near end of the
               hosting page's. So the PAGE says where the drawing goes, under
               what id prefix, and which other views it moves with. The scene
               module only has to say which scene it is. */
            var wrap = opts.scene
                ? document.querySelector('.dg-wrap[data-scene="' + opts.scene + '"]')
                : document.querySelector(opts.root || '.dg-wrap');
            if (!wrap) return;

            var P = opts.scene ? (wrap.getAttribute('data-prefix') || '') : (opts.prefix || '');
            var lname = opts.scene ? wrap.getAttribute('data-link') : null;
            var link = lname ? sharedLink(lname) : (opts.link || null);

            var byId = function (id) { return document.getElementById(P + id); };
            var svg = byId('siteDiagram');
            if (!svg) return;

            var slots = [];
            for (var s = 0; s < SLOTS; s++) {
                var g = {}, ok = true;
                for (var li = 0; li < layers.length; li++) {
                    g[layers[li]] = byId('dg-s' + s + '-' + layers[li]);
                    /* 'inner' is OPTIONAL at mount, the arrowheads precedent: for one
                       deploy every cached page was baked before the layer existed, and
                       failing the whole mount over it would show a dead figure instead
                       of one whose interior lines merely lack occlusion until refresh. */
                    /* A cached static frame may also predate a scene's surface
                       layers. Its existing geometry and controls can still run. */
                    if (!g[layers[li]] && layers[li] !== 'inner' &&
                        LAYERS.indexOf(layers[li]) !== -1) ok = false;
                }
                if (!ok) return;
                slots.push(g);
            }
            var hitEls = [];
            for (var hi = 0; hi < REGION_IDS.length; hi++) {
                var he = byId('dg-hit' + hi);
                if (!he) return;
                hitEls.push(he);
            }
            var flowEl = byId('dg-flow');
            var hlEl = byId('dg-highlight');
            if (!flowEl || !hlEl) return;

            /* Optional on purpose — no bail if it is missing. Every other
               element above is geometry this engine cannot draw without, so a
               missing one means the markup is stale and stopping is right. The
               occluder is a courtesy to a canvas that may not be there, and a
               page without it should still get its drawing. */
            var occEl = byId('dg-occluder');

            /* Optional for the same reason, with a sharper failure behind it:
               the arrowheads were added to the engine before any page was
               regenerated, so for one deploy every baked page lacks this
               element. Folding it into the mandatory lookups above would have
               unmounted every diagram on the site — the exact stale-frame
               failure test 10 in dg-suite.js documents — over an annotation. */
            var headsEl = byId('dg-flow-heads');

            var leaders = {}, bubbles = {};
            CALLOUTS.forEach(function (c) {
                leaders[c.id] = byId('dg-lead-' + c.id);
                bubbles[c.id] = wrap.querySelector('.dg-callout[data-region="' + c.id + '"]');
            });

            var raf = null, t0 = null, last = 0, visible = true;
            var yaw = 0, hover = null, idle = true;
            var drag = null, resumeTimer = null;
            var selected = null, transition = null, focusRaf = null, resizeRaf = null;
            var focusAuto = false, focusAnchor = 0, focusElapsed = 0, focusLast = null;

            /* How long after the last interaction the turn picks itself up
               again. Long enough not to fight someone still reading it. */
            var RESUME_MS = 10000;

            var applying = false;
            var reduced = window.matchMedia &&
                          window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            var mobileQuery = window.matchMedia ? window.matchMedia('(max-width: 900px), (pointer: coarse)') : null;
            var reducedQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
            var mobile = !!(mobileQuery && mobileQuery.matches);
            var idleAnchor = 0, idleElapsed = 0, idleLast = null, paintRaf = null;
            var paintedAttributes = optimized ? new WeakMap() : null;
            if (motion) setCompact(mobile);

            function cancelTransition() {
                if (focusRaf !== null) cancelAnimationFrame(focusRaf);
                focusRaf = null; transition = null;
            }
            function settleTransition() {
                if (!transition) return;
                var end = transition;
                cancelTransition(); setView(end.to); yaw = end.endYaw;
                if (end.kind === 'focus') resumeInspection();
                else {
                    idle = true; t0 = null;
                    idleAnchor = yaw; idleElapsed = 0; idleLast = null;
                    push(); start();
                }
            }
            function animateView(destination, destinationYaw, kind) {
                cancelTransition(); stop(); idle = false; focusAuto = false;
                var turn = destinationYaw - yaw;
                transition = { from: getView(), to: destination, fromYaw: yaw,
                    toYaw: yaw + Math.atan2(Math.sin(turn), Math.cos(turn)),
                    endYaw: destinationYaw, kind: kind, start: null };
                if (reduced || document.hidden || !visible) { settleTransition(); paint(); return; }
                function advance(now) {
                    focusRaf = null;
                    if (!transition) return;
                    if (document.hidden || !visible) { settleTransition(); return; }
                    if (transition.start === null) transition.start = now;
                    var amount = Math.min(1, (now - transition.start) / 600);
                    if (amount === 1) settleTransition();
                    else {
                        setView(interpolateView(transition.from, transition.to, amount));
                        var eased = amount * amount * (3 - 2 * amount);
                        yaw = transition.fromYaw + (transition.toYaw - transition.fromYaw) * eased;
                        focusRaf = requestAnimationFrame(advance);
                    }
                    paintNow();
                }
                focusRaf = requestAnimationFrame(advance);
            }
            function selectRegion(id) {
                selected = id;
                CALLOUTS.forEach(function (c) {
                    if (bubbles[c.id]) put(bubbles[c.id], 'aria-pressed', c.id === selected);
                });
                setHover(id);
            }
            function focusWindow() {
                var box = { left: 270, right: VB.w - 270, top: mobile ? 92 : 32, bottom: VB.h - 42 };
                if (svg.getBoundingClientRect && wrap.getBoundingClientRect) {
                    var s = svg.getBoundingClientRect(), w = wrap.getBoundingClientRect();
                    if (s.width > 0 && w.width > 0) {
                        box.left = Math.max(box.left, (w.left - s.left) / s.width * VB.w + 20);
                        box.right = Math.min(box.right, (w.right - s.left) / s.width * VB.w - 20);
                    }
                }
                return box;
            }
            function revealDrawing() {
                if (!mobile || !svg.getBoundingClientRect || !window.scrollTo) return;
                var r = svg.getBoundingClientRect(), nav = document.querySelector('.nav');
                var top = nav && nav.getBoundingClientRect ? nav.getBoundingClientRect().bottom + 16 : 88;
                if (r.top < top || r.bottom > window.innerHeight - 16) {
                    /* Bring the picture back before the camera moves: cards at
                       the bottom of a phone's list can be a screen below it. */
                    window.scrollTo({ top: Math.max(0, window.scrollY + r.top - top), behavior: 'instant' });
                    /* The scroll is synchronous; IntersectionObserver reports
                       the new visibility later. Keep the revealed zoom animated. */
                    visible = true;
                }
            }
            function focusRegion(id) {
                if (selected === id) { doReset(); return; }
                var destination = focusView(id, yaw, focusWindow());
                if (!destination) return;
                goManual();
                selectRegion(id);
                if (resumeTimer) { clearTimeout(resumeTimer); resumeTimer = null; }
                revealDrawing();
                animateView(destination, yaw, 'focus');
                push();  // Pause linked views; close-up framing belongs to this instance.
            }

            function put(el, key, value) {
                if (!optimized) { el.setAttribute(key, value); return; }
                var attributes = paintedAttributes.get(el);
                if (!attributes) { attributes = {}; paintedAttributes.set(el, attributes); }
                /* These attributes belong to this instance. Read the baked value
                   once, then compare in JS without copying SVG path data out of
                   the DOM on every frame. */
                if (!(key in attributes)) attributes[key] = el.getAttribute(key);
                var next = String(value);
                if (attributes[key] !== next) {
                    attributes[key] = next;
                    el.setAttribute(key, next);
                }
            }

            function paint() {
                if (!optimized) { paintNow(); return; }
                if (paintRaf !== null) return;
                paintRaf = requestAnimationFrame(function () { paintRaf = null; paintNow(); });
            }
            function paintNow() {
                var f = frame(yaw, hover, selected);
                var occ = '';
                for (var i = 0; i < f.slots.length; i++) {
                    var L = f.slots[i], g = slots[i];
                    for (var li = 0; li < layers.length; li++) {
                        if (g[layers[li]]) put(g[layers[li]], 'd', L[layers[li]]);
                    }
                    /* One union path for the WHOLE drawing, not one per slot.
                       A slot is a depth rank, not an object — frame() re-sorts
                       renderables into them every turn — so a per-slot occluder
                       would have the near object blanking the far one, and
                       scene-site is built on seeing the far container's top
                       tier through the near container's wall. Concatenating is
                       safe because every layer string starts a fresh subpath
                       with M, and the canvas fills nonzero, so a machine inside
                       a container does not punch a hole in its own occluder. */
                    if (occEl) {
                        for (var oi = 0; oi < OCCLUDING.length; oi++) occ += L[OCCLUDING[oi]];
                    }
                }
                if (occEl) put(occEl, 'd', occ);
                for (var h = 0; h < f.hits.length; h++) {
                    put(hitEls[h], 'd', f.hits[h].d);
                    put(hitEls[h], 'data-region', f.hits[h].id);
                }
                put(hlEl, 'd', f.highlight);
                put(flowEl, 'd', f.flow);
                if (headsEl) put(headsEl, 'd', f.flowHeads);
                for (var j = 0; j < f.leaders.length; j++) {
                    var Ld = f.leaders[j], el = leaders[Ld.id];
                    if (!el) continue;
                    put(el, 'x1', Ld.x1); put(el, 'y1', Ld.y1);
                    put(el, 'x2', Ld.x2); put(el, 'y2', Ld.y2);
                    el.classList.toggle('is-hot', Ld.id === hover);
                }
            }

            function setHover(id) {
                id = selected || id;
                if (hover === id) return;
                hover = id;
                CALLOUTS.forEach(function (c) {
                    if (bubbles[c.id]) bubbles[c.id].classList.toggle('is-hot', c.id === hover);
                });
                wrap.classList.toggle('is-focused', !!hover);
                paint();
                if (motion) {
                    if (hover) stop();
                    else if (idle) start();
                    else scheduleResume();
                }
            }

            /* Inspection rotates around its own target, with a slow bounded arc.
               Manual input pauses it; resuming eases in from the dragged angle. */
            function resumeInspection() {
                if (!selected || transition) return;
                if (drag || pending || pinch) { scheduleResume(); return; }
                focusAuto = true; focusAnchor = yaw; focusElapsed = 0; focusLast = null;
                start();
            }
            function tick(now) {
                if (document.hidden || !visible || (selected ? !focusAuto : !idle)) { raf = null; return; }
                raf = requestAnimationFrame(tick);
                if (selected) {
                    if (focusLast !== null) focusElapsed += Math.min(now - focusLast, 100);
                    focusLast = now;
                    var focusInterval = 1000 / (mobile ? 20 : 24);
                    var focusDelta = last ? now - last : focusInterval;
                    if (focusDelta < focusInterval) return;
                    last = now - focusDelta % focusInterval;
                    var ramp = Math.min(1, focusElapsed / 1200);
                    ramp = ramp * ramp * (3 - 2 * ramp);
                    yaw = focusAnchor + Math.sin(focusElapsed / FOCUS_PERIOD * Math.PI * 2) * FOCUS_ARC * ramp;
                    paintNow();  // A close-up never drives its comparison peer.
                    return;
                }
                if (motion) {
                    if (idleLast !== null) idleElapsed += Math.min(now - idleLast, 100);
                    idleLast = now;
                    /* The small idle arc needs fewer paints than a drag. Input
                       remains coalesced at the display's own refresh rate. */
                    var interval = 1000 / 24, elapsed = last ? now - last : interval;
                    if (elapsed < interval) return;
                    last = now - elapsed % interval;
                    yaw = idleAnchor + idleYawAt(idleElapsed);
                    paintNow();
                    return;
                }
                if (now - last < 40) return;
                last = now;
                /* Anchor the clock to whatever angle we are ALREADY at, so
                   picking the turn back up after a drag carries on from there
                   instead of snapping to zero. Normalised first: a drag can
                   leave yaw far outside one revolution, in either direction. */
                if (t0 === null) {
                    var w = yaw % (Math.PI * 2);
                    if (w < 0) w += Math.PI * 2;
                    t0 = now - w / (Math.PI * 2) * PERIOD;
                }
                yaw = yawAt(now - t0);
                paint();
                push();
            }
            function start() {
                if (raf || reduced || transition || document.hidden || !visible) return;
                if (selected) { if (!focusAuto) return; }
                else {
                    if (!idle || (motion && (mobile || hover))) return;
                    if (!isDriver()) return;   // followers are painted by the driver
                }
                last = 0; raf = requestAnimationFrame(tick);
            }
            function stop() {
                if (raf) { cancelAnimationFrame(raf); raf = null; }
                idleLast = null; focusLast = null;
            }

            function goIdle() {
                if (selected) { resumeInspection(); return; }
                if (idle || transition || (link && link.focusOwner)) return;
                if (motion && (drag || pending || pinch)) { scheduleResume(); return; }
                idle = true;
                t0 = null;      // re-anchored on the next tick, from the live yaw
                if (motion) { idleAnchor = yaw; idleElapsed = 0; idleLast = null; }
                push();
                start();
            }
            function scheduleResume() {
                if (resumeTimer) clearTimeout(resumeTimer);
                if (reduced || (!selected && motion && (mobile || hover))) { resumeTimer = null; return; }
                resumeTimer = setTimeout(function () {
                    resumeTimer = null;
                    goIdle();
                }, selected ? 2500 : RESUME_MS);
            }
            function goManual() {
                cancelTransition();
                idle = false; focusAuto = false; stop();
                // Every interaction pushes the restart back out again.
                scheduleResume();
            }

            /* --- Views that move together ---
               Whichever instance registered first drives the idle turn; the
               others adopt what it publishes. Any of them can be dragged, and
               the state flows back the same way. The applying flag is what
               stops an adopt from echoing straight back out. --- */
            function isDriver() { return !link || link.owner === adopt; }

            function push() {
                if (!link || applying) return;
                var v = getView();
                link.focusOwner = selected || transition ? adopt : null;
                link.yaw = yaw; link.pitch = v.pitch; link.zoom = v.zoom;
                link.idle = idle; link.t0 = t0;
                for (var i = 0; i < link.subs.length; i++) {
                    if (link.subs[i] !== adopt) link.subs[i]();
                }
            }
            function adopt() {
                applying = true;
                cancelTransition(); stop(); focusAuto = false;
                if (link.focusOwner && resumeTimer) { clearTimeout(resumeTimer); resumeTimer = null; }
                if (selected || getView().target) {
                    resetView(); yaw = 0; selectRegion(null);
                }
                if (!link.focusOwner) {
                    yaw = link.yaw;
                    if (link.pitch !== null) setView({ pitch: link.pitch, zoom: link.zoom, target: null, screen: null, lens: 1 });
                }
                t0 = link.t0;
                if (link.idle !== idle) {
                    idle = link.idle;
                    if (!idle) stop();
                }
                applying = false;
                paint();
                if (idle) start();
            }
            if (link) {
                link.subs.push(adopt);
                if (!link.owner) link.owner = adopt;
            }

            /* --- Gestures ------------------------------------------------------
             *
             * ONE CONTRACT, WRITTEN DOWN, because until now there were two and they
             * contradicted each other. The stylesheet carried .dg-wrap { touch-action:
             * pan-x pan-y } under a comment saying "drag-to-rotate is a mouse affordance
             * and it stays one", and .dg-wrap { touch-action: pan-y pinch-zoom } under
             * a comment saying a sideways swipe turns the model — both inside the SAME
             * media query, so the second silently won and the first was documentation of
             * a decision that had been reversed. The effect on a phone was that pinching
             * the DRAWING did nothing at all (the intersection with .site-diagram's own
             * pan-y forbids the browser from zooming, and nothing here handled it) while
             * pinching a CALLOUT zoomed the whole page. Same figure, two answers.
             *
             * What it is now:
             *
             *   MOUSE        drag rotates from the first pixel, wheel zooms. Unchanged.
             *   ONE FINGER   belongs to the PAGE. Vertical always scrolls. A drag that
             *                is clearly horizontal turns the model.
             *   TWO FINGERS  belong to the MODEL. Pinch zooms it, anywhere on the
             *                figure, bubbles included.
             *
             * TWO THINGS THAT MADE IT FEEL WRONG, both fixed here rather than in CSS:
             *
             * A finger used to claim the model the instant it landed. pointerdown called
             * goManual(), which stops the idle turn and starts the resume timer — so
             * scrolling PAST the drawing with a finger that happened to touch it froze
             * it mid-rotation and left it at whatever angle it had reached. Now a touch
             * decides nothing until it has moved TOUCH_SLOP and shown which way it is
             * going; a scroll never touches the model at all.
             *
             * And the page's own pinch-zoom is given up over the figure, deliberately.
             * That is a real cost — pinch-to-zoom is how people with low vision read —
             * so it is confined to the figure and nowhere else on the page, the model's
             * own zoom range is wide (0.55x to 2.6x), and the +/- buttons do the same
             * job by tapping for anyone who would rather not gesture at all. */
            var pointers = {};   // every pointer currently down, by id
            var pending = null;  // a touch that has not yet said what it is
            var pinch = null;    // { d: spread at start, zoom: zoom at start }
            var TOUCH_SLOP = 8;  // px of travel before a touch is a gesture and not a tap

            function isLive() { return live.wrap === wrap; }
            function setLive(on) {
                if (on === isLive()) return;
                if (on) {
                    if (live.off) live.off();          // only one figure at a time
                    live.wrap = wrap;
                    live.off = function () { setLive(false); };
                    wrap.classList.add('is-live');
                    bindDocExit();
                } else {
                    if (live.wrap === wrap) { live.wrap = null; live.off = null; }
                    wrap.classList.remove('is-live');
                }
            }

            function pcount() { var n = 0; for (var k in pointers) n++; return n; }
            function spread() {
                var a = null, b = null;
                for (var k in pointers) { if (!a) a = pointers[k]; else if (!b) b = pointers[k]; }
                if (!a || !b) return 0;
                var dx = a.x - b.x, dy = a.y - b.y;
                return Math.sqrt(dx * dx + dy * dy);
            }
            /* The controls are taps, and a finger on one is not a gesture on the model. */
            function onControl(t) {
                return !!(t && t.closest && t.closest('.dg-scale, button, a, input') && !t.closest('.dg-callout'));
            }
            function inDrawing(t) { return !!(t && svg.contains(t)); }

            function beginDrag(x, y, id) {
                if (motion) setHover(null);
                goManual();
                drag = { x: x, y: y, yaw: yaw, pitch: getView().pitch };
                if (id !== undefined && svg.setPointerCapture) {
                    try { svg.setPointerCapture(id); } catch (err) { /* already gone */ }
                }
                wrap.classList.add('is-dragging');
            }

            /* Bound to the WRAPPER, not the svg, so a pinch that starts with one finger
               on a callout bubble is still a pinch. Rotation still requires the drawing
               itself — dragging a label to turn the model would be a surprise. */
            wrap.addEventListener('pointerdown', function (e) {
                if (wrap.classList.contains('plant-ready')) return;
                if (onControl(e.target)) return;
                pointers[e.pointerId] = { x: e.clientX, y: e.clientY };

                if (e.pointerType !== 'touch') {
                    if (e.button !== 0 || !inDrawing(e.target)) return;
                    beginDrag(e.clientX, e.clientY, e.pointerId);
                    e.preventDefault();
                    return;
                }
                if (pcount() >= 2) {
                    // The second finger arriving turns whatever was happening into a pinch.
                    endDrag(e);
                    pending = null;
                    pinch = { d: spread(), zoom: getView().zoom };
                    goManual();
                    return;
                }
                /* THE DRAWING'S, FROM THE FIRST TOUCH, IN BOTH AXES.
                   No tap to arm it and no direction test: a finger that lands
                   here has said everything it needs to. The callout cards below
                   are page content and never reach this line — a finger on one
                   scrolls, as it should.

                   The ring comes on now rather than on pointerup, so the figure
                   acknowledges the touch before the finger has moved. */
                if (!inDrawing(e.target)) return;
                setLive(true);
                if (selected) goManual();  // Pause inspection from the first touch.
                pending = { x: e.clientX, y: e.clientY, id: e.pointerId };
            });

            wrap.addEventListener('pointermove', function (e) {
                var p = pointers[e.pointerId];
                if (p) { p.x = e.clientX; p.y = e.clientY; }

                if (pinch) {
                    var d = spread();
                    if (d > 0 && pinch.d > 0) {
                        setView({ zoom: pinch.zoom * (d / pinch.d) });
                        paint();
                        push();
                    }
                    return;
                }
                if (pending) {
                    var dx = e.clientX - pending.x, dy = e.clientY - pending.y;
                    /* The only thing left to wait for is enough travel to tell a
                       drag from a tap, so a tap does not nudge the model. There is
                       no direction test any more: the drawing carries
                       touch-action: none, so there is no scroll to lose a vertical
                       gesture to, and both axes are its own. */
                    if (Math.abs(dx) < TOUCH_SLOP && Math.abs(dy) < TOUCH_SLOP) return;
                    /* Origin is where the finger is NOW, not where it landed, so the
                       eight pixels it spent proving itself are not applied to the model
                       in one frame as a jump. */
                    beginDrag(e.clientX, e.clientY, pending.id);
                    pending = null;
                }
                if (!drag) return;
                // Pointer deltas only — no geometry is ever queried.
                yaw = drag.yaw + (e.clientX - drag.x) * 0.006;
                setView({ pitch: drag.pitch + (e.clientY - drag.y) * 0.004 });
                paint();
                push();
            });

            function endDrag(e) {
                if (!drag) return;
                drag = null;
                wrap.classList.remove('is-dragging');
                if (e && e.pointerId !== undefined && svg.hasPointerCapture &&
                    svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
            }
            function endPointer(e) {
                delete pointers[e.pointerId];
                if (pending && pending.id === e.pointerId) pending = null;
                if (pinch && pcount() < 2) {
                    pinch = null;
                    /* The finger still down does NOT inherit the gesture and become a
                       rotate. Re-basing a drag halfway through a pinch makes the model
                       snap, and lifting one finger is how people END a pinch, not how
                       they start something else. */
                    pending = null;
                }
                endDrag(e);
                if (motion || selected) scheduleResume();
            }
            /* THE GUARANTEE, and it does not depend on touch-action at all.
             *
             * touch-action is a hint the engine reads BEFORE the gesture starts;
             * preventDefault on a non-passive touchmove wins after it has started
             * and on engines whose touch-action support is partial or buggy. This
             * figure has now had three rounds of "it still scrolls" on a real
             * phone while a headless browser insisted it did not, so the fix is
             * not another declaration - it is the one mechanism that has been
             * absolute since touch events existed.
             *
             * ON THE DRAWING, so the listener never sees a touch that started
             * anywhere else: touch events retarget for the whole gesture to the
             * element the finger first landed on. A finger that starts on a
             * callout keeps scrolling the page and never reaches this.
             *
             * passive: false is the whole point - a passive listener's
             * preventDefault is ignored, and Safari and Chrome both default
             * touchmove to passive. */
            svg.addEventListener('touchmove', function (e) {
                if (e.cancelable) e.preventDefault();
            }, { passive: false });

            wrap.addEventListener('pointerup', endPointer);
            /* A CANCEL SHOULD NOT HAPPEN ON THE DRAWING ANY MORE - it is the
               browser saying it has taken the gesture for a scroll, and
               touch-action: none means there is no scroll for it to take. It is
               still handled, because a browser that does not honour touch-action
               is exactly the case the touchmove guard below exists for, and this
               keeps the pointer bookkeeping straight when one arrives. */
            wrap.addEventListener('pointercancel', endPointer);

            /* --- Wheel to zoom, about the centre so nothing needs measuring.
                   The pointer has priority: while it is anywhere over the
                   figure the wheel zooms, and everywhere else the page scrolls
                   as normal. It is bound to the WRAPPER, not the svg, so the
                   callout bubbles and the controls count as part of the figure.

                   The one thing that would make this hostile is trapping the
                   page: a full-width figure you cannot scroll past. So at the
                   zoom limits the wheel is handed back — keep scrolling the
                   same way once it will not zoom any further and the page moves
                   on. There is no state to get stuck in. --- */
            wrap.addEventListener('wheel', function (e) {
                if (wrap.classList.contains('plant-ready')) return;
                /* A PINCH IS NOT A SCROLL, and the browser reports it as one. Every engine
                   sends pinch gestures — trackpad and touchscreen alike — as wheel events
                   with ctrlKey set, and a single pinch produces dozens of them in a burst.
                   Each was multiplying zoom by 1.12, so two fingers on a phone drove the model
                   to its limits and back in a fraction of a second: it looked like the drawing
                   was glitching, and it was doing exactly what it was told.

                   Still ignored here, but for one reason now rather than two. On a desktop
                   ctrl+wheel is the browser's own zoom and hijacking it is worse than not
                   handling it. The other half of this comment used to say a phone pinch
                   belongs to the page; it does not any more — two fingers on the figure
                   zoom the MODEL, handled as pointers above, and they never arrive here. */
                if (e.ctrlKey) return;
                var z = getView().zoom;
                var next = z * (e.deltaY < 0 ? 1.12 : 1 / 1.12);
                // Already pinned at the limit and still pushing that way: the
                // page should have this scroll, not the diagram.
                if ((next > z && z >= ZOOM_MAX - 1e-6) ||
                    (next < z && z <= ZOOM_MIN + 1e-6)) return;
                goManual();
                setView({ zoom: next });
                paint();
                push();
                e.preventDefault();
            }, { passive: false });

            /* --- Hover, delegated off the hit shapes --- */
            svg.addEventListener('pointerover', function (e) {
                var id = e.target && e.target.getAttribute &&
                         e.target.getAttribute('data-region');
                if (id) setHover(id);
            });
            svg.addEventListener('pointerout', function (e) {
                if (drag) return;
                if (e.target && e.target.getAttribute &&
                    e.target.getAttribute('data-region')) setHover(null);
            });

            /* --- Bubbles highlight their region, and are keyboard reachable --- */
            CALLOUTS.forEach(function (c) {
                var b = bubbles[c.id];
                if (!b) return;
                b.addEventListener('pointerenter', function (e) {
                    /* Only a real hover. A tap fires pointerenter too, immediately followed by
                       pointerleave, which would light the part and put it out again before
                       anyone saw it — the click handler below owns touch. */
                    if (e.pointerType === 'touch') return;
                    setHover(c.id);
                });
                b.addEventListener('pointerleave', function (e) {
                    if (e.pointerType === 'touch') return;
                    setHover(null);
                });
                b.addEventListener('focus', function () { setHover(c.id); });
                b.addEventListener('blur', function () { setHover(null); });

                /* A second activation returns to the overview. Only click owns
                   selection, so touch-generated hover never toggles it twice. */
                b.addEventListener('click', function () { focusRegion(c.id); });
                /* Also support cached markup from before callouts were buttons. */
                if (b.tagName !== 'BUTTON') {
                    b.setAttribute('role', 'button');
                    b.addEventListener('keydown', function (e) {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        e.preventDefault(); focusRegion(c.id);
                    });
                }
            });
            /* Empty space within the drawing only dismisses transient hover;
               dragging must not accidentally dismiss the selected equipment. */
            svg.addEventListener('click', function (e) {
                if (drag) return;
                var id = e.target && e.target.getAttribute &&
                         e.target.getAttribute('data-region');
                if (!id) setHover(null);
            });

            /* --- Keyboard --- */
            svg.addEventListener('keydown', function (e) {
                var k = e.key, step = 0.06;
                if (k === 'ArrowLeft')       { goManual(); yaw -= step; }
                else if (k === 'ArrowRight') { goManual(); yaw += step; }
                else if (k === 'ArrowUp')    { goManual(); setView({ pitch: getView().pitch + 0.05 }); }
                else if (k === 'ArrowDown')  { goManual(); setView({ pitch: getView().pitch - 0.05 }); }
                else if (k === '+' || k === '=') { goManual(); setView({ zoom: getView().zoom * 1.12 }); }
                else if (k === '-' || k === '_') { goManual(); setView({ zoom: getView().zoom / 1.12 }); }
                else if (k === '0' || k === 'Escape') { doReset(); return; }
                else return;
                e.preventDefault();
                paint();
                push();
            });

            /* --- Controls --- */
            function doReset() {
                cancelTransition(); stop(); focusAuto = false; idle = false;
                selectRegion(null);
                if (resumeTimer) { clearTimeout(resumeTimer); resumeTimer = null; }
                endDrag(); pending = null; pinch = null;
                animateView({ pitch: BASE_PITCH, zoom: 1, target: null, screen: null, lens: 1 }, 0, 'overview');
                push();
            }
            var ctl = {
                'dg-zoom-in':  function () { goManual(); setView({ zoom: getView().zoom * 1.15 }); paint(); push(); },
                'dg-zoom-out': function () { goManual(); setView({ zoom: getView().zoom / 1.15 }); paint(); push(); },
                'dg-reset':    doReset,
            };
            Object.keys(ctl).forEach(function (id) {
                var el = byId(id);
                if (el) el.addEventListener('click', ctl[id]);
            });
            wrap.addEventListener('keydown', function (e) {
                if (e.key === 'Escape' && !inDrawing(e.target)) { e.preventDefault(); doReset(); }
            });
            /* Capture clicks even when navigation or another widget stops them.
               The drawing, its controls and its callouts form one interaction. */
            document.addEventListener('click', function (e) {
                if (selected && wrap.contains && !wrap.contains(e.target)) doReset();
            }, true);

            if (window.addEventListener) window.addEventListener('resize', function () {
                if (!selected || resizeRaf !== null) return;
                resizeRaf = requestAnimationFrame(function () {
                    resizeRaf = null;
                    if (!selected) return;
                    cancelTransition(); stop();
                    setView(focusView(selected, yaw, focusWindow())); paint(); resumeInspection();
                });
            });

            if (window.IntersectionObserver) {
                new IntersectionObserver(function (e) {
                    visible = e[0].isIntersecting;
                    if (visible) { if (selected) paint(); start(); }
                    else { stop(); settleTransition(); setLive(false); }
                }, { threshold: 0 }).observe(svg);
            }
            document.addEventListener('visibilitychange', function () {
                if (document.hidden) {
                    stop(); settleTransition();
                    if (resumeTimer) { clearTimeout(resumeTimer); resumeTimer = null; }
                } else {
                    // Coming back from a hidden tab must not fast-forward the
                    // turn by however long the tab was away.
                    if (idle) t0 = null;
                    if ((motion || selected) && !idle && !focusAuto) scheduleResume();
                    if (selected) paint();
                    start();
                }
            });

            // Reduced motion keeps inspection available with immediate framing.
            var refreshPreferences = function () {
                reduced = !!(reducedQuery && reducedQuery.matches);
                mobile = !!(mobileQuery && mobileQuery.matches);
                if (motion) setCompact(mobile);
                stop();
                if (reduced) settleTransition();
                if (selected) { cancelTransition(); setView(focusView(selected, yaw, focusWindow())); }
                if (resumeTimer) { clearTimeout(resumeTimer); resumeTimer = null; }
                paint();
                if (selected) resumeInspection();
                else if (idle) start();
            };
            [mobileQuery, reducedQuery].forEach(function (query) {
                if (!query) return;
                if (query.addEventListener) query.addEventListener('change', refreshPreferences);
                else if (query.addListener) query.addListener(refreshPreferences);
            });
            paint();
            start();
        };

        api.mountWhenReady = function (opts) {
            if (document.readyState === 'loading') {
                // Wrapped, not passed directly: the listener would hand mount
                // an Event where its options belong.
                document.addEventListener('DOMContentLoaded', function () { api.mount(opts); });
            } else { api.mount(opts); }
        };
    }

        return api;
    }

    /* flowHeads is exported so the static bake and the tests call the SAME
       function the runtime frame() uses — a reimplementation in the generator
       is exactly the drift the parity checks exist to catch. */
    return { createDiagram: createDiagram, sharedLink: sharedLink, LAYERS: LAYERS,
             flowHeads: flowHeads };
});
