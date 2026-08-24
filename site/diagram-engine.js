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
   - NOTHING IS MEASURED. No getBoundingClientRect, no ResizeObserver. Anchors
     are projected model coordinates; drag uses pointer deltas; zoom is to centre.

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
    var LAYERS = ['ground', 'inside', 'back', 'asics', 'end', 'side', 'top', 'detail', 'flame'];

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


    /* Views that move together. Scenes load as separate modules and never see
       each other, so the link is looked up by name rather than passed around. */
    var LINKS = {};
    function sharedLink(name) {
        if (!LINKS[name]) {
            LINKS[name] = { yaw: 0, pitch: null, zoom: null, idle: true, t0: null,
                            subs: [], owner: null };
        }
        return LINKS[name];
    }

    function createDiagram(scene) {

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
    var pitch = BASE_PITCH, zoom = 1;

    function setView(v) {
        if (v.pitch !== undefined) pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, v.pitch));
        if (v.zoom  !== undefined) zoom  = Math.max(ZOOM_MIN,  Math.min(ZOOM_MAX,  v.zoom));
    }
    function getView() { return { pitch: pitch, zoom: zoom }; }
    function resetView() { pitch = BASE_PITCH; zoom = 1; }


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

    function project(p, yaw) {
        var a = yaw + BASE_YAW;
        var cy = Math.cos(a), sy = Math.sin(a);
        var px = p[0] + SHIFT_X;
        var x = px * cy + p[2] * sy;
        var z = -px * sy + p[2] * cy;
        var cp = Math.cos(pitch), sp = Math.sin(pitch);
        var y2 = p[1] * cp - z * sp;
        var z2 = p[1] * sp + z * cp;
        var s = BASE_SCALE * zoom;
        // +Z toward the viewer: larger z2 shrinks the denominator, so the point
        // scales up. The scene is authored to that convention throughout.
        var k = FOV / (FOV - z2 * s);
        return [ORIGIN.x + x * s * k, ORIGIN.y - y2 * s * k];
    }

    function depthOf(p, yaw) {
        return p[1] * Math.sin(pitch) + rotZ(p, yaw) * Math.cos(pitch);
    }

    var n1 = function (v) { return Math.round(v * 10) / 10; };

    /* Screen-space signed area of a projected polygon. */
    function signedArea(pts3, yaw) {
        var a = 0, n = pts3.length;
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
        return { ground: '', inside: '', back: '', asics: '', end: '', side: '',
                 top: '', detail: '', flame: '' };
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
    function regionHighlight(id, yaw) {
        if (!id) return '';
        var d = '';
        regionBoxes(id).forEach(function (b) {
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

    function frame(yaw, hover) {
        var order = RENDERABLES.map(function (r) {
            return { r: r, depth: depthOf(r.at, yaw) };
        }).sort(function (a, b) { return a.depth - b.depth; });

        // Hit shapes: largest first, so the smallest ends up on top and wins.
        var hits = REGION_IDS.map(function (id) {
            var h = regionHit(id, yaw);
            return { id: id, d: h.d, area: h.area };
        }).sort(function (a, b) { return b.area - a.area; });

        return {
            yaw: yaw,
            slots: order.map(function (o) {
                var L = o.r.build(H, yaw);
                L.id = o.r.id;
                return L;
            }),
            hits: hits,
            highlight: regionHighlight(hover, yaw),
            flow: scene.flow(H, yaw),
            leaders: CALLOUTS.map(function (co) {
                var a = calloutAnchor(co, yaw), o2 = calloutOrigin(co);
                return { id: co.id, x1: n1(o2[0]), y1: n1(o2[1]), x2: n1(a[0]), y2: n1(a[1]) };
            }),
        };
    }

    /* One full revolution per PERIOD. It used to be a sine sweep bounded by
       YAW_MAX, which rocked back and forth and never came round; a turntable
       reads as an object you are being shown, an oscillation reads as a
       widget. Framing in every scene is fitted to the whole 360 envelope, not
       to a narrow sweep. */
    function yawAt(ms) {
        return (ms % PERIOD) / PERIOD * Math.PI * 2;
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
        LAYERS: LAYERS, REGION_IDS: REGION_IDS,
        PERIOD: PERIOD, BASE_SCALE: BASE_SCALE,
        ZOOM_MIN: ZOOM_MIN, ZOOM_MAX: ZOOM_MAX, PITCH_MIN: PITCH_MIN, PITCH_MAX: PITCH_MAX,
        RENDER_ANCHORS: RENDERABLES.map(function (r) { return { id: r.id, at: r.at }; }),
        project: project, depthOf: depthOf, frame: frame, yawAt: yawAt,
        allPoints: allPoints, objects: objects, boxCorners: boxCorners,
        boxFaces: boxFaces, frontFacing: frontFacing, regionBoxes: regionBoxes,
        regionHit: regionHit, calloutAnchor: calloutAnchor, calloutOrigin: calloutOrigin,
        setView: setView, getView: getView, resetView: resetView,
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
                for (var li = 0; li < LAYERS.length; li++) {
                    g[LAYERS[li]] = byId('dg-s' + s + '-' + LAYERS[li]);
                    if (!g[LAYERS[li]]) ok = false;
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

            var leaders = {}, bubbles = {};
            CALLOUTS.forEach(function (c) {
                leaders[c.id] = byId('dg-lead-' + c.id);
                bubbles[c.id] = wrap.querySelector('.dg-callout[data-region="' + c.id + '"]');
            });

            var raf = null, t0 = null, last = 0, visible = true;
            var yaw = 0, hover = null, idle = true;
            var drag = null, resumeTimer = null;

            /* How long after the last interaction the turn picks itself up
               again. Long enough not to fight someone still reading it. */
            var RESUME_MS = 10000;

            var applying = false;
            var reduced = window.matchMedia &&
                          window.matchMedia('(prefers-reduced-motion: reduce)').matches;

            function paint() {
                var f = frame(yaw, hover);
                var occ = '';
                for (var i = 0; i < f.slots.length; i++) {
                    var L = f.slots[i], g = slots[i];
                    for (var li = 0; li < LAYERS.length; li++) {
                        g[LAYERS[li]].setAttribute('d', L[LAYERS[li]]);
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
                if (occEl) occEl.setAttribute('d', occ);
                for (var h = 0; h < f.hits.length; h++) {
                    hitEls[h].setAttribute('d', f.hits[h].d);
                    hitEls[h].setAttribute('data-region', f.hits[h].id);
                }
                hlEl.setAttribute('d', f.highlight);
                flowEl.setAttribute('d', f.flow);
                for (var j = 0; j < f.leaders.length; j++) {
                    var Ld = f.leaders[j], el = leaders[Ld.id];
                    if (!el) continue;
                    el.setAttribute('x1', Ld.x1); el.setAttribute('y1', Ld.y1);
                    el.setAttribute('x2', Ld.x2); el.setAttribute('y2', Ld.y2);
                    el.classList.toggle('is-hot', Ld.id === hover);
                }
            }

            function setHover(id) {
                if (hover === id) return;
                hover = id;
                CALLOUTS.forEach(function (c) {
                    if (bubbles[c.id]) bubbles[c.id].classList.toggle('is-hot', c.id === hover);
                });
                wrap.classList.toggle('is-focused', !!hover);
                paint();
            }

            /* --- Idle sweep. Stops for good on first interaction; the reset
                   control brings it back. --- */
            function tick(now) {
                if (document.hidden || !visible || !idle) { raf = null; return; }
                raf = requestAnimationFrame(tick);
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
                if (raf || reduced || !idle || document.hidden || !visible) return;
                if (!isDriver()) return;   // followers are painted by the driver
                last = 0; raf = requestAnimationFrame(tick);
            }
            function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

            function goIdle() {
                if (idle) return;
                idle = true;
                t0 = null;      // re-anchored on the next tick, from the live yaw
                push();
                start();
            }
            function scheduleResume() {
                if (resumeTimer) clearTimeout(resumeTimer);
                resumeTimer = setTimeout(function () {
                    resumeTimer = null;
                    goIdle();
                }, RESUME_MS);
            }
            function goManual() {
                if (idle) { idle = false; stop(); }
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
                link.yaw = yaw; link.pitch = v.pitch; link.zoom = v.zoom;
                link.idle = idle; link.t0 = t0;
                for (var i = 0; i < link.subs.length; i++) {
                    if (link.subs[i] !== adopt) link.subs[i]();
                }
            }
            function adopt() {
                applying = true;
                yaw = link.yaw;
                if (link.pitch !== null) setView({ pitch: link.pitch, zoom: link.zoom });
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

            /* --- Drag to rotate --- */
            svg.addEventListener('pointerdown', function (e) {
                if (e.button !== 0) return;
                goManual();
                drag = { x: e.clientX, y: e.clientY, yaw: yaw, pitch: getView().pitch };
                svg.setPointerCapture(e.pointerId);
                wrap.classList.add('is-dragging');
                e.preventDefault();
            });
            svg.addEventListener('pointermove', function (e) {
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
            svg.addEventListener('pointerup', endDrag);
            svg.addEventListener('pointercancel', endDrag);

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
                /* A PINCH IS NOT A SCROLL, and the browser reports it as one. Every engine
                   sends pinch gestures — trackpad and touchscreen alike — as wheel events
                   with ctrlKey set, and a single pinch produces dozens of them in a burst.
                   Each was multiplying zoom by 1.12, so two fingers on a phone drove the model
                   to its limits and back in a fraction of a second: it looked like the drawing
                   was glitching, and it was doing exactly what it was told.

                   Ignored on both platforms deliberately. On a desktop ctrl+wheel is the
                   browser's own zoom and hijacking it is worse than not handling it; on a
                   phone the page's pinch-zoom is what a reader expects two fingers to do. */
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

                /* TAPPING A BUBBLE HAS TO LIGHT ITS PART, and until this existed it did not.
                   Every route into setHover was a hover affordance — pointerenter, pointerover
                   on the hit shapes, focus — and a phone has no hover. On mobile the bubbles
                   are the labels now, sitting under the drawing where they are wide enough to
                   read, and a label you can tap that does nothing is worse than the plain list
                   it replaced. The same mouse-only assumption that put "hover a part to
                   identify it" in the hint.

                   A PLAIN SET, NOT A TOGGLE, and that distinction cost an hour. After a tap
                   Chrome synthesizes a full mouse sequence — pointerenter, mousedown, mouseup,
                   click — with pointerType 'mouse', so the enter lights the part a moment
                   before the click arrives. A toggle then sees hover === c.id and puts it
                   straight back out, and every tap looked like it did nothing.

                   Setting it is idempotent, so it survives whatever order the events arrive
                   in. Tapping the drawing is what clears it. */
                b.addEventListener('click', function () { setHover(c.id); });
            });
            /* Tapping the drawing itself clears the selection, so a reader is never stuck with
               one part lit and no obvious way out. */
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
                if (resumeTimer) { clearTimeout(resumeTimer); resumeTimer = null; }
                resetView(); yaw = 0; t0 = null; idle = true; setHover(null);
                paint(); push(); start();
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

            if (window.IntersectionObserver) {
                new IntersectionObserver(function (e) {
                    visible = e[0].isIntersecting;
                    if (visible) start(); else stop();
                }, { threshold: 0 }).observe(svg);
            }
            document.addEventListener('visibilitychange', function () {
                if (document.hidden) {
                    stop();
                    if (resumeTimer) { clearTimeout(resumeTimer); resumeTimer = null; }
                } else {
                    // Coming back from a hidden tab must not fast-forward the
                    // turn by however long the tab was away.
                    if (idle) t0 = null;
                    start();
                }
            });

            // Interaction stays available under reduced motion — it is
            // user-initiated. Only the unsolicited idle sweep is suppressed.
            if (reduced) { idle = false; paint(); return; }
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

    return { createDiagram: createDiagram, sharedLink: sharedLink, LAYERS: LAYERS };
});
