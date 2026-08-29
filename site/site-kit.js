/* ===== PROTON MINING — the kit, shared by every drawing of it =====

   Gas conditioning, a genset, a transformer and a container of machines. The
   home page draws them as the mine; the energy page draws the same four things
   arriving on a partner’s wellpad. They were modelled twice, independently, and
   came out different sizes with different detail — the conditioning skid was a
   1.7 m cube on one page and a 4.4 m box on the other, and the same transformer
   was 1.5 m wide in one drawing and 2.2 m in the next. Two pictures of the same
   company’s equipment that did not look like the same equipment.

   So there is one of each now, and both pages import it.

   THE BUILDERS ARE WRITTEN AT THE ORIGIN. Each one draws its box centred on
   (0, 0) and place() shims the helper bundle so the whole thing lands wherever
   the scene wants it. That is why none of them take an x or a z: a builder that
   knew where it was could only ever be used in one place, which is how the two
   drawings drifted apart to begin with.

   Geometry only. All machinery lives in diagram-engine.js. */

(function (root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.SiteKit = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /* One size each, everywhere. */
    var GAS  = { w: 1.7,   h: 1.7,  d: 1.7 };
    var GEN  = { w: 5.4,   h: 2.2,  d: 2.1 };
    var XFMR = { w: 1.5,   h: 2.0,  d: 1.5 };
    var CONT = { w: 12.19, h: 2.59, d: 2.44 };
    /* The dry cooler standing on that shell. Module level, and exported, because the
       scenes need these numbers too — for the hover region that highlights the cooler
       and for the object box that has to be tall enough to contain it. A second copy
       of them in three scene files is three chances to drift. */
    var COOLER = { inX: 0.90, inZ: 0.22, plinth: 0.13, slope: 0.62, ridge: 0.62 };
    COOLER.h = COOLER.plinth + COOLER.slope + 0.01;   // + the fan rings lying in the ridge

    /* Translate a helper bundle. Every function that takes world coordinates
       gets them offset first; the ones that consume already-offset points
       (poly, frontFacing) are passed straight through, or they would move
       twice. */
    function place(H, dx, dz) {
        return {
            newLayers: H.newLayers, poly: H.poly, polyInside: H.polyInside,
            frontFacing: H.frontFacing, signedArea: H.signedArea, n1: H.n1,
            depthOf: H.depthOf,
            addBox: function (L, b, yaw, skip) {
                return H.addBox(L, { x: b.x + dx, y: b.y, z: b.z + dz,
                                     w: b.w, h: b.h, d: b.d }, yaw, skip);
            },
            boxFaces: function (b) {
                return H.boxFaces({ x: b.x + dx, y: b.y, z: b.z + dz,
                                    w: b.w, h: b.h, d: b.d });
            },
            project: function (p, yaw) { return H.project([p[0] + dx, p[1], p[2] + dz], yaw); },
            line: function (a, b, yaw) {
                return H.line([a[0] + dx, a[1], a[2] + dz], [b[0] + dx, b[1], b[2] + dz], yaw);
            },
            ring:  function (cx, cy, cz, r, yaw, n) { return H.ring(cx + dx, cy, cz + dz, r, yaw, n); },
            ringX: function (cx, cy, cz, r, yaw, n) { return H.ringX(cx + dx, cy, cz + dz, r, yaw, n); },
            ringY: function (cx, cy, cz, r, yaw, n) { return H.ringY(cx + dx, cy, cz + dz, r, yaw, n); },
        };
    }
    /* Gas conditioning: separator, two scrubber towers, vent stack, handrail. */
    function gas(H0, yaw, box) {
        var K = GAS, H = place(H0, box.x, box.z);
        /* The builder’s own box, at the origin. K carries only dimensions —
           the position lives in the shim, not in the shape. */
        var SELF = { x: 0, y: 0, z: 0, w: K.w, h: K.h, d: K.d };
        var addBox = H.addBox, line = H.line, ring = H.ring, ringX = H.ringX,
            newLayers = H.newLayers;

        var L = newLayers();
        addBox(L, { x: (0), y: 0, z: 0, w: K.w + 0.6, h: 0.24, d: K.d + 0.5 }, yaw, ['top']);
        addBox(L, SELF, yaw);

        // Horizontal separator vessel with dished ends.
        var vy = K.h + 0.5;
        L.detail += ringX((0) - K.w / 2, vy, 0, 0.44, yaw, 12);
        L.detail += ringX((0) + K.w / 2, vy, 0, 0.44, yaw, 12);
        L.detail += line([(0) - K.w/2, vy + 0.44, 0], [(0) + K.w/2, vy + 0.44, 0], yaw);
        L.detail += line([(0) - K.w/2, vy - 0.44, 0], [(0) + K.w/2, vy - 0.44, 0], yaw);
        // Saddle supports.
        for (var sd = -1; sd <= 1; sd += 2) {
            addBox(L, { x: (0) + sd * 0.55, y: K.h, z: 0, w: 0.12, h: 0.5, d: 0.5 }, yaw);
        }
        // Vent stack with a cap.
        addBox(L, { x: (0) + 0.66, y: vy + 0.44, z: 0, w: 0.16, h: 1.7, d: 0.16 }, yaw);
        L.detail += ring((0) + 0.66, vy + 2.14, 0, 0.2, yaw, 8);
        // Two vertical scrubber towers — the thing that actually does the
        // treating, and the most recognisable part of a conditioning skid.
        [-0.52, 0.52].forEach(function (dz) {
            var tx = (0) - 0.5;
            addBox(L, { x: tx, y: K.h, z: dz, w: 0.34, h: 1.45, d: 0.34 }, yaw);
            L.detail += ring(tx, K.h + 1.45, dz, 0.2, yaw, 8);
            L.detail += ring(tx, K.h + 0.42, dz, 0.2, yaw, 8);   // manway band
            L.detail += ring(tx, K.h + 1.02, dz, 0.2, yaw, 8);
        });
        // Crossover header linking the towers into the separator.
        L.detail += line([(0) - 0.5, K.h + 1.2, -0.52], [(0) - 0.5, K.h + 1.2, 0.52], yaw);
        L.detail += line([(0) - 0.5, K.h + 1.2, 0.52], [(0) + 0.66, K.h + 1.2, 0.52], yaw);

        // Inlet piping, an isolation valve and a pressure gauge.
        L.detail += line([(0) - K.w/2 - 0.8, 0.5, 0], [(0) - K.w/2, 0.5, 0], yaw);
        L.detail += ring((0) - K.w/2 - 0.45, 0.5, 0, 0.17, yaw, 8);
        L.detail += line([(0) - K.w/2 - 0.45, 0.33, 0], [(0) - K.w/2 - 0.45, 0.67, 0], yaw);
        L.detail += ring((0) - K.w/2 - 0.1, 1.15, 0.3, 0.12, yaw, 8);
        L.detail += line([(0) - K.w/2 - 0.1, 0.5, 0.3], [(0) - K.w/2 - 0.1, 1.03, 0.3], yaw);

        // Outlet riser into the vessel.
        L.detail += line([(0) + K.w/2 + 0.05, 0.6, 0.35], [(0) + K.w/2 + 0.05, vy, 0.35], yaw);

        // Skid handrail on the open side.
        var hz = K.d/2 + 0.28;
        L.detail += line([(0) - K.w/2 - 0.2, 1.05, hz], [(0) + K.w/2 + 0.2, 1.05, hz], yaw);
        L.detail += line([(0) - K.w/2 - 0.2, 0.62, hz], [(0) + K.w/2 + 0.2, 0.62, hz], yaw);
        [-1, 0, 1].forEach(function (i) {
            var px = (0) + i * (K.w/2 + 0.2);
            L.detail += line([px, 0.24, hz], [px, 1.05, hz], yaw);
        });

        // Access ladder on the body.
        for (var rg = 1; rg <= 4; rg++) {
            var ry = K.h * rg / 5;
            L.detail += line([(0) - 0.3, ry, K.d/2 + 0.01], [(0) + 0.3, ry, K.d/2 + 0.01], yaw);
        }
        L.detail += line([(0) - 0.3, 0.24, K.d/2 + 0.01], [(0) - 0.3, K.h, K.d/2 + 0.01], yaw);
        L.detail += line([(0) + 0.3, 0.24, K.d/2 + 0.01], [(0) + 0.3, K.h, K.d/2 + 0.01], yaw);
        return L;
    
    }

    /* Generation: one genset, stacks, radiator, control cabinet, gas train. */
    function gen(H0, yaw, box) {
        var K = GEN, H = place(H0, box.x, box.z);
        /* The builder’s own box, at the origin. K carries only dimensions —
           the position lives in the shim, not in the shape. */
        var SELF = { x: 0, y: 0, z: 0, w: K.w, h: K.h, d: K.d };
        var addBox = H.addBox, line = H.line, ring = H.ring, ringX = H.ringX,
            newLayers = H.newLayers;

        var L = newLayers();
        addBox(L, { x: (0), y: 0, z: 0, w: K.w + 0.5, h: 0.22, d: K.d + 0.4 }, yaw, ['top']);
        addBox(L, SELF, yaw);

        // A stack per engine bay, each with a rain cap.
        [-1.3, 1.3].forEach(function (dx) {
            addBox(L, { x: (0) + dx, y: K.h, z: -0.5, w: 0.24, h: 1.5, d: 0.24 }, yaw);
            L.detail += ring((0) + dx, K.h + 1.5, -0.5, 0.22, yaw, 8);
        });
        // Radiator louvres on the cold end.
        var gx = (0) - K.w / 2 - 0.006;
        for (var i = 1; i <= 7; i++) {
            var gy = K.h * (i / 8);
            L.detail += line([gx, gy, -K.d/2 + 0.14], [gx, gy, K.d/2 - 0.14], yaw);
        }
        // Control cabinet on the aisle side.
        addBox(L, { x: (0) + 1.9, y: 0, z: K.d / 2 + 0.16, w: 0.75, h: 1.5, d: 0.3 }, yaw);
        for (var cl = 1; cl <= 2; cl++) {
            L.detail += line([(0) + 1.6, 1.5 * cl / 3, K.d/2 + 0.31],
                             [(0) + 2.2, 1.5 * cl / 3, K.d/2 + 0.31], yaw);
        }
        // Bay seam, access panels, lifting lugs.
        var zf = K.d / 2 + 0.006;
        L.detail += line([(0), 0.1, zf], [(0), K.h - 0.1, zf], yaw);
        for (var s = 1; s <= 4; s++) {
            var sx = (0) - K.w/2 + K.w * s / 5;
            L.detail += line([sx, K.h * 0.24, zf], [sx, K.h * 0.78, zf], yaw);
        }
        for (var lg = 0; lg < 4; lg++) {
            var lx = (0) - K.w/2 + K.w * (lg + 0.5) / 4;
            addBox(L, { x: lx, y: K.h, z: 0.62, w: 0.1, h: 0.16, d: 0.1 }, yaw);
        }
        // Radiator fan behind the louvres, and the core hatching.
        L.detail += ring(gx - 0.01, K.h * 0.52, 0, 0.62, yaw, 14);
        L.detail += ring(gx - 0.01, K.h * 0.52, 0, 0.24, yaw, 10);
        for (var sp = 0; sp < 4; sp++) {
            var ang = sp * Math.PI / 4;
            L.detail += line([gx - 0.01, K.h * 0.52 + Math.sin(ang) * 0.24, Math.cos(ang) * 0.24],
                             [gx - 0.01, K.h * 0.52 + Math.sin(ang) * 0.62, Math.cos(ang) * 0.62], yaw);
        }

        // Silencer drum lying on the roof between the stacks.
        L.detail += ringX((0) - 0.55, K.h + 0.3, 0.45, 0.26, yaw, 10);
        L.detail += ringX((0) + 0.55, K.h + 0.3, 0.45, 0.26, yaw, 10);
        L.detail += line([(0) - 0.55, K.h + 0.56, 0.45], [(0) + 0.55, K.h + 0.56, 0.45], yaw);
        L.detail += line([(0) - 0.55, K.h + 0.04, 0.45], [(0) + 0.55, K.h + 0.04, 0.45], yaw);

        // Cabinet door split and handle.
        L.detail += line([(0) + 1.9, 0.12, K.d/2 + 0.31],
                         [(0) + 1.9, 1.38, K.d/2 + 0.31], yaw);
        L.detail += ring((0) + 2.02, 0.75, K.d/2 + 0.32, 0.06, yaw, 6);

        // Engine inspection hatches along the lower body.
        for (var hh = 0; hh < 3; hh++) {
            var hx = (0) - K.w/2 + K.w * (hh + 0.5) / 3;
            L.detail += line([hx - 0.34, 0.5, zf], [hx + 0.34, 0.5, zf], yaw);
            L.detail += line([hx - 0.34, 1.12, zf], [hx + 0.34, 1.12, zf], yaw);
            L.detail += line([hx - 0.34, 0.5, zf], [hx - 0.34, 1.12, zf], yaw);
            L.detail += line([hx + 0.34, 0.5, zf], [hx + 0.34, 1.12, zf], yaw);
        }

        // Gas train and its regulator running into the skid.
        L.detail += line([(0) - K.w/2 - 0.9, 0.42, 0.4], [(0) - K.w/2, 0.42, 0.4], yaw);
        addBox(L, { x: (0) - K.w/2 - 0.62, y: 0.42, z: 0.4, w: 0.26, h: 0.3, d: 0.26 }, yaw);
        return L;
    
    }

    /* Transformer: radiator banks, conservator, bushings, tap changer. */
    function xfmr(H0, yaw, box) {
        var K = XFMR, H = place(H0, box.x, box.z);
        /* The builder’s own box, at the origin. K carries only dimensions —
           the position lives in the shim, not in the shape. */
        var SELF = { x: 0, y: 0, z: 0, w: K.w, h: K.h, d: K.d };
        var addBox = H.addBox, line = H.line, ring = H.ring, ringX = H.ringX,
            newLayers = H.newLayers;

        var L = newLayers();
        addBox(L, SELF, yaw);
        // Radiator banks on both long sides.
        for (var side = -1; side <= 1; side += 2) {
            for (var f = 0; f < 5; f++) {
                var fx = (0) - K.w/2 + K.w * (f + 0.5) / 5;
                addBox(L, { x: fx, y: 0.32, z: side * (K.d/2 + 0.13),
                            w: 0.1, h: K.h - 0.64, d: 0.18 }, yaw);
            }
        }
        // Conservator drum along the top.
        var cy2 = K.h + 0.3;
        L.detail += ringX((0) - 0.5, cy2, 0.35, 0.24, yaw, 10);
        L.detail += ringX((0) + 0.5, cy2, 0.35, 0.24, yaw, 10);
        L.detail += line([(0) - 0.5, cy2 + 0.24, 0.35], [(0) + 0.5, cy2 + 0.24, 0.35], yaw);
        L.detail += line([(0) - 0.5, cy2 - 0.24, 0.35], [(0) + 0.5, cy2 - 0.24, 0.35], yaw);
        // Bushings, on insulator stacks.
        for (var b = 0; b < 3; b++) {
            var bx = (0) - 0.45 + b * 0.45;
            addBox(L, { x: bx, y: K.h, z: -0.3, w: 0.12, h: 0.55, d: 0.12 }, yaw);
            L.detail += ring(bx, K.h + 0.2, -0.3, 0.13, yaw, 6);
            L.detail += ring(bx, K.h + 0.38, -0.3, 0.13, yaw, 6);
        }
        // Fin corrugation, so the banks read as radiators rather than slabs.
        for (var side2 = -1; side2 <= 1; side2 += 2) {
            for (var f2 = 0; f2 < 5; f2++) {
                var fx2 = (0) - K.w/2 + K.w * (f2 + 0.5) / 5;
                var fz2 = side2 * (K.d/2 + 0.22);
                for (var q = 1; q <= 3; q++) {
                    var qy = 0.32 + (K.h - 0.64) * q / 4;
                    L.detail += line([fx2 - 0.05, qy, fz2], [fx2 + 0.05, qy, fz2], yaw);
                }
            }
        }

        // Tap changer on the end, with its drive shaft.
        addBox(L, { x: (0) - K.w/2 - 0.16, y: 0.55, z: 0.25, w: 0.28, h: 0.62, d: 0.42 }, yaw);
        L.detail += ring((0) - K.w/2 - 0.3, 0.86, 0.25, 0.12, yaw, 8);

        // Oil level gauge and rating plate on the near face.
        var nz = K.d/2 + 0.006;
        L.detail += ring((0) + 0.42, 1.45, nz, 0.11, yaw, 8);
        L.detail += line([(0) - 0.55, 1.3, nz], [(0) - 0.15, 1.3, nz], yaw);
        L.detail += line([(0) - 0.55, 1.52, nz], [(0) - 0.15, 1.52, nz], yaw);
        L.detail += line([(0) - 0.55, 1.3, nz], [(0) - 0.55, 1.52, nz], yaw);
        L.detail += line([(0) - 0.15, 1.3, nz], [(0) - 0.15, 1.52, nz], yaw);

        // HV cable drops from the bushings down the end.
        for (var hv = 0; hv < 3; hv++) {
            var hx2 = (0) - 0.45 + hv * 0.45;
            L.detail += line([hx2, K.h + 0.55, -0.3], [hx2, K.h + 0.78, -0.62], yaw);
        }

        // LV cable box and its gland plate.
        addBox(L, { x: (0) + K.w/2 + 0.18, y: 0.3, z: 0, w: 0.3, h: 0.7, d: 0.6 }, yaw);
        L.detail += line([(0) + K.w/2 + 0.34, 0.42, -0.2], [(0) + K.w/2 + 0.34, 0.42, 0.2], yaw);
        L.detail += line([(0) + K.w/2 + 0.34, 0.86, -0.2], [(0) + K.w/2 + 0.34, 0.86, 0.2], yaw);

        // Plinth under the tank.
        addBox(L, { x: (0), y: 0, z: 0, w: K.w + 0.34, h: 0.16, d: K.d + 0.3 }, yaw, ['top']);
        return L;
    
    }

    /* What is inside a container: COLS x TIERS machines of size AS, the uplink
       mast and the PDU. All derived from the box it is given, so every drawing
       that places a container gets the same machines in the same arrangement.
       These lived in scene-site.js, which meant they described the home page’s
       containers rather than the company’s. */
    var COLS = 10, TIERS = 3;
    var AS   = { w: 0.86, h: 0.5, d: 0.8 };

    /* Out at the door end of the roof, not mid-span. Mid-span is where the dry cooler
       now stands, and a mast at K.x + 3.4 rose straight through it — the pole painting
       over the frame it was supposed to be standing beside. K.x + 5.6 clears the
       cooler's far edge (K.x + 6.095 - COOLER.inX) by 0.4 and still lands 0.5 inside
       the container end. */
    function mastOf(K) { return { x: K.x + 5.6, y: K.h, z: K.z - 0.5, w: 0.1, h: 1.5, d: 0.1 }; }
    function pduOf(K)  { return { x: K.x + K.w / 2 - 1.0, y: 0, z: K.z + K.d / 2 - 0.5,
                                  w: 0.7, h: 1.75, d: 0.45 }; }

    function racksFor(K) {
        var out = [], span = K.w - 2.6, pitchX = span / COLS;
        var x0 = K.x - K.w / 2 + 1.5 + pitchX / 2, z = K.z - K.d / 2 + 0.66;
        for (var t = 0; t < TIERS; t++)
            for (var c = 0; c < COLS; c++)
                out.push({ x: x0 + c * pitchX, y: 0.22 + t * (AS.h + 0.19), z: z,
                           w: AS.w, h: AS.h, d: AS.d, tier: t, col: c, cont: K });
        return out;
    }

    /* A container of machines. Already written around the box it is given, so
       it needs no placement shim. */
    function container(H, K, yaw) {
        var addBox = H.addBox, line = H.line, ring = H.ring, ringX = H.ringX,
            ringY = H.ringY,
            poly = H.poly, polyInside = H.polyInside, boxFaces = H.boxFaces,
            frontFacing = H.frontFacing, newLayers = H.newLayers;

        var L = newLayers();
        var x0 = K.x - K.w/2, x1 = K.x + K.w/2;
        var z0 = K.z - K.d/2, z1 = K.z + K.d/2;
        var y1 = K.h;

        // Interior surfaces, seen from within through the cutaway.
        L.inside += polyInside([[x0,0,z0],[x1,0,z0],[x1,0,z1],[x0,0,z1]], yaw);
        L.inside += polyInside([[x0,0,z0],[x0,y1,z0],[x1,y1,z0],[x1,0,z0]], yaw);
        L.inside += polyInside([[x0,0,z0],[x0,0,z1],[x0,y1,z1],[x0,y1,z0]], yaw);
        L.inside += polyInside([[x1,0,z1],[x1,0,z0],[x1,y1,z0],[x1,y1,z1]], yaw);

        // --- Everything from here to the machines paints BEHIND them ---
        // Far-wall corrugation.
        var ribs = 34;
        for (var r = 1; r < ribs; r++) {
            var rx = x0 + K.w * r / ribs;
            L.back += line([rx, 0.09, z0 + 0.012], [rx, y1 - 0.09, z0 + 0.012], yaw);
        }
        // Floor grating.
        for (var g = 1; g < 26; g++) {
            var gx2 = x0 + K.w * g / 26;
            L.back += line([gx2, 0.012, z0 + 0.1], [gx2, 0.012, z1 - 0.1], yaw);
        }
        // Rack uprights and shelf rails.
        var span = K.w - 2.6, pitchX = span / COLS;
        var rx0 = x0 + 1.5, rz = K.z - K.d/2 + 0.66;
        for (var c = 0; c <= COLS; c++) {
            var ux = rx0 + c * pitchX;
            L.back += line([ux, 0, rz - AS.d/2], [ux, TIERS * (AS.h + 0.19) + 0.22, rz - AS.d/2], yaw);
        }
        for (var t2 = 0; t2 <= TIERS; t2++) {
            var sy2 = 0.22 + t2 * (AS.h + 0.19) - 0.05;
            L.back += line([rx0, sy2, rz - AS.d/2], [rx0 + span, sy2, rz - AS.d/2], yaw);
        }

        // --- Machines ---
        // This container's own machines only — RACKS is every rack on site.
        var mine = racksFor(K);
        for (var i = 0; i < mine.length; i++) {
            var u = mine[i], f = boxFaces(u);
            for (var k in f) if (frontFacing(f[k], yaw)) L.asics += poly(f[k], yaw);
            /* SEALED FACES. What stood here was a twin fan ring at 0.36 of the machine's
               half-width, commented "as on a real S21" — and it was, which is the problem.
               The S21+ Hyd has no fans and no apertures at all. Those two rings measured
               5.9 px each on a 16.3 px face at desktop, so twelve of every sixteen pixels
               of every one of the thirty machines in a container were a part the hardware
               does not have. The container shell was switched to hydro around them and
               they were left wearing the old machine.

               NOTHING REPLACES THEM ON THE FACE, and that is the measurement talking. The
               coupling this machine really has would be 2.7 px across here against 21 px
               on the hosting page, where it is drawn properly. Drawing it at fan size so
               it survived would put a wrong-sized part back exactly where the wrong part
               was. What says hydro at this scale is the loop running past the rack, below
               — a pipe run reads at any size, a 2.7 px ring does not. */
            var fz = u.z + u.d/2 + 0.008;
            /* Control strip and status LED — parts it does have. Shifted right, off the
               stretch of face the column's riser climbs, the same move scene-hosting.js
               makes for the same reason. */
            L.detail += line([u.x + u.w * 0.02, u.y + u.h - 0.07, fz],
                             [u.x + u.w * 0.30, u.y + u.h - 0.07, fz], yaw);
            L.detail += ring(u.x + u.w * 0.40, u.y + u.h - 0.07, fz, 0.028, yaw, 5);
        }

        /* THE LOOP, WHICH THIS CONTAINER DID NOT HAVE AT ALL.
           The roof cooler's flow and return drop down the end wall "into the manifolds" —
           and there were no manifolds. The outside of the container was converted to hydro
           and the inside was left as an air-cooled hall with the fans filed off.

           SIZED FOR THIS DRAWING, NOT COPIED FROM THE HOSTING PAGE. A machine here is
           16 px across against 59 px there, so scene-hosting's numbers do not survive the
           trip: its supply/return risers sit 0.09 apart, which is 1.7 px here and merges
           into one line.

           THE RUN ONLY, NOT THE BRANCHES. A riser per column was drawn first and then
           taken out again, on the measurement: ten of them changed the container's detail
           layer by 240 bytes of 5,672, and rendered side by side the two versions are
           indistinguishable — because the vertical lattice a reader sees in here is the
           far wall's corrugation and the rack uprights, both of which were always there,
           and a riser lands in the same register as a structural line it cannot be told
           apart from. Ten lines that read as something else are worse than none.

           What does read is the run itself: two horizontal pipes the length of the rack,
           which is a shape nothing else in the container makes. The hosting page draws the
           branches and the couplings because a machine is 59 px there and they land on
           their own machine. Here the loop says it exists, and that is the whole of what
           this drawing can honestly claim at this size. */
        var manZ = rz + AS.d / 2 + 0.05;          // just in front of the rack face
        var manY = 0.055, manSep = 0.16;          // ~3 px apart at desktop: separable, just
        L.detail += line([rx0 - 0.2, manY, manZ], [rx0 + span + 0.2, manY, manZ], yaw);
        L.detail += line([rx0 - 0.2, manY + manSep, manZ], [rx0 + span + 0.2, manY + manSep, manZ], yaw);
        /* Up the door-end wall to meet the roof cooler's downcomers, which drop to
           K.h * 0.62 on the outside of that same end. Without it the run stops in mid-air
           and the loop the roof half of this drawing promises has no other half. */
        L.detail += line([rx0 + span + 0.2, manY, manZ], [rx0 + span + 0.2, K.h * 0.62, manZ], yaw);
        L.detail += line([rx0 + span + 0.2, manY + manSep, manZ],
                         [rx0 + span + 0.2, K.h * 0.62, manZ], yaw);

        // --- In front of the machines ---
        // Cable tray under the ceiling.
        addBox(L, { x: K.x, y: y1 - 0.28, z: z0 + 0.42, w: K.w - 0.6, h: 0.1, d: 0.28 }, yaw);
        for (var ct = 1; ct < 20; ct++) {
            var cx3 = x0 + 0.3 + (K.w - 0.6) * ct / 20;
            L.detail += line([cx3, y1 - 0.18, z0 + 0.3], [cx3, y1 - 0.18, z0 + 0.56], yaw);
        }

        // PDU on the aisle side, so painting it after the machines is correct.
        var pdu = pduOf(K);
        addBox(L, pdu, yaw);
        for (var p = 1; p <= 4; p++) {
            L.detail += line([pdu.x - 0.3, pdu.h * p / 5, pdu.z + pdu.d/2 + 0.006],
                             [pdu.x + 0.3, pdu.h * p / 5, pdu.z + pdu.d/2 + 0.006], yaw);
        }

        // Roof: only the far half survives the cutaway.
        var roof = [[x0,y1,z0],[x0,y1,K.z],[x1,y1,K.z],[x1,y1,z0]];
        if (frontFacing(roof, yaw)) L.top += poly(roof, yaw);
        /* Footprint of the roof cooler. Needed up here as well as further down where the
           cooler is built, because the roof ribs have to stop at its edges. */
        var COOL_X = COOLER.inX, COOL_Z = COOLER.inZ;
        var cx0 = x0 + COOL_X, cx1 = x1 - COOL_X;
        for (var r2 = 1; r2 < ribs; r2++) {
            var rx2 = x0 + K.w * r2 / ribs;
            /* A rib under the cooler paints into 'detail', which is above every filled
               face, so it would show straight through the frame standing on it — and at
               the same slant and weight as the coil divisions, which is exactly what made
               the first version of this read as corrugation rather than as a cooler. */
            if (rx2 > cx0 - 0.12 && rx2 < cx1 + 0.12) continue;
            L.detail += line([rx2, y1 + 0.006, z0], [rx2, y1 + 0.006, K.z], yaw);
        }

        // Exterior end walls.
        addBox(L, { x: x0 - 0.05, y: 0, z: K.z, w: 0.1, h: K.h, d: K.d }, yaw, ['right']);
        addBox(L, { x: x1 + 0.05, y: 0, z: K.z, w: 0.1, h: K.h, d: K.d }, yaw, ['left']);

        // Corner castings.
        [[x0,z0],[x1,z0],[x0,z1],[x1,z1]].forEach(function (pt) {
            addBox(L, { x: pt[0], y: 0,           z: pt[1], w: 0.36, h: 0.32, d: 0.36 }, yaw);
            addBox(L, { x: pt[0], y: K.h - 0.32,  z: pt[1], w: 0.36, h: 0.32, d: 0.36 }, yaw);
        });

        // Base rail along the open side.
        addBox(L, { x: K.x, y: 0, z: z1 - 0.09, w: K.w, h: 0.28, d: 0.18 }, yaw);
        L.detail += line([x0, y1, z1], [x1, y1, z1], yaw);
        L.detail += line([x0, 0, z1], [x0, y1, z1], yaw);
        L.detail += line([x1, 0, z1], [x1, y1, z1], yaw);

        // Door end: seam, locking bars, hinges.
        var dx = x1 + 0.105;
        L.detail += line([dx, 0.12, K.z], [dx, y1 - 0.12, K.z], yaw);
        for (var b2 = 0; b2 < 4; b2++) {
            var bz = z0 + K.d * (b2 + 0.5) / 4;
            L.detail += line([dx, 0.16, bz], [dx, y1 - 0.16, bz], yaw);
            L.detail += ring(dx, 0.5, bz, 0.07, yaw, 6);
            L.detail += ring(dx, y1 - 0.5, bz, 0.07, yaw, 6);
        }
        for (var hg = 0; hg < 3; hg++) {
            var hy = 0.4 + hg * (y1 - 0.8) / 2;
            addBox(L, { x: dx + 0.02, y: hy, z: z0 + 0.06, w: 0.06, h: 0.16, d: 0.1 }, yaw);
            addBox(L, { x: dx + 0.02, y: hy, z: z1 - 0.06, w: 0.06, h: 0.16, d: 0.1 }, yaw);
        }
        /* ---- THE DRY COOLER ON THE ROOF ----
         *
         * What used to be here was air cooling: two exhaust fans punched through the door end
         * and nine intake louvres with a filter frame on the other. A hydro container has
         * neither. Air never crosses the machines at all — the heat leaves in water, and the
         * only place it meets air is the closed dry cooler sitting on the roof.
         *
         * That is the whole tell. A hydro container and an air-cooled one are the same white
         * box; what says which it is, is the object on the roof. So it is built as MASS, in
         * the filled face layers, rather than as line work in 'detail'.
         *
         * The first attempt drew the coils as eight leaning quads in 'detail' — correct
         * geometry, invisible drawing. At yaw 0 the container's depth projects almost
         * straight down the screen, so each quad collapsed to a sliver 38 units tall and 8
         * wide, landing at the same slant and weight as the 33 roof ribs already there. It
         * read as slightly uneven corrugation. The quads and their fin lines survive here,
         * but as divisions ON a filled frame instead of as the frame itself.
         *
         * Fills are also what survives the phone. At a 390 viewport the whole drawing is
         * 350 x 129 and this container about 97 px of it, which leaves the cooler a band
         * around 10 px tall — far too little for texture, just enough for a silhouette that
         * breaks the flat roof line. Hence the A-frame: two coil faces leaning up to a
         * ridge with the fans in it, drawn into side/top/end so it catches the same lit
         * faces as the container it stands on.
         *
         * Face winding follows boxFaces() exactly, so frontFacing() culls these the way it
         * culls a box: the two caps are wound oppositely because one faces -x and the other
         * +x, and getting that wrong shows the frame's own back wall through its front. */
        /* THE COOLER IS CUT AWAY WITH THE REST OF THE CONTAINER.
           It was not, and it is the one solid thing in a drawing whose whole point is that
           you can see into it. The roof above says "only the far half survives the cutaway"
           and draws z -1.22..0.00; this frame was drawn z -1.00..+1.00, straight across the
           cut line and over the open half. Being mass rather than line work — which is what
           makes it survive a phone — that put an opaque lid on the machines: measured, a
           container's own cooler covered 18-22% of its own machines at rest and up to 42%
           at 45 degrees, on top of the 19% the front row already takes off the back one.
           Every other surface in here reads as glass and this one did not.

           So the frame stands on the FAR HALF of the roof, ending at the same cut plane the
           roof does. It is not a smaller cooler pretending to be a whole one: it is a whole
           one, sliced where the container is sliced, which is what every other surface here
           already does. The near half is the half you are looking through. */
        var COOL_PLINTH = COOLER.plinth, COOL_SLOPE = COOLER.slope;
        var zc0 = z0 + COOL_Z;                    // far edge, as before
        var zc1 = K.z - 0.06;                     // the cut plane, just shy of the roof's
        var zr0 = zc0 + (zc1 - zc0) * 0.34;       // ridge sits over the far third
        var zr1 = zc1;                            // and runs out to the cut
        var cyb = K.h + COOL_PLINTH, cyt = cyb + COOL_SLOPE;

        // The plinth the frame stands on.
        addBox(L, { x: (cx0 + cx1) / 2, y: K.h, z: (zc0 + zc1) / 2,
                    w: cx1 - cx0, h: COOL_PLINTH, d: zc1 - zc0 }, yaw);

        /* One coil face and the ridge deck. The near face is in the cut-away half and is
           not drawn, exactly as the container's near wall is not. */
        var faceBack  = [[cx1, cyb, zc0], [cx0, cyb, zc0], [cx0, cyt, zr0], [cx1, cyt, zr0]];
        var faceRidge = [[cx0, cyt, zr0], [cx0, cyt, zr1], [cx1, cyt, zr1], [cx1, cyt, zr0]];
        if (frontFacing(faceBack,  yaw)) L.side += poly(faceBack,  yaw);
        if (frontFacing(faceRidge, yaw)) L.top  += poly(faceRidge, yaw);

        var capL = [[cx0, cyb, zc0], [cx0, cyb, zc1], [cx0, cyt, zr1], [cx0, cyt, zr0]];
        var capR = [[cx1, cyb, zc1], [cx1, cyb, zc0], [cx1, cyt, zr0], [cx1, cyt, zr1]];
        if (frontFacing(capL, yaw)) L.end += poly(capL, yaw);
        if (frontFacing(capR, yaw)) L.end += poly(capR, yaw);

        /* The cut edge, drawn as an edge. The container outlines its own cut at z1 the same
           way; without it the frame ends in mid-air and reads as broken rather than sliced. */
        L.detail += line([cx0, cyt, zr1], [cx1, cyt, zr1], yaw);
        L.detail += line([cx0, cyb, zc1], [cx0, cyt, zr1], yaw);
        L.detail += line([cx1, cyb, zc1], [cx1, cyt, zr1], yaw);

        /* Eight coil divisions up the leaning face — the far one, which is the one left. */
        var COILS = 8;
        for (var cq = 0; cq < COILS; cq++) {
            var px = cx0 + (cx1 - cx0) * (cq + 0.5) / COILS;
            L.detail += line([px, cyb, zc0], [px, cyt, zr0], yaw);
        }

        /* The fans that pull through the bank, lying flat in the ridge and therefore drawn
           with ringY: ring() would stand them on edge, out of the deck they sit in. */
        var fz2 = (zr0 + zr1) / 2;                // centred in what is left of the ridge
        for (var cf = 0; cf < 2; cf++) {
            var fx = cx0 + (cx1 - cx0) * (cf ? 0.76 : 0.24);
            L.detail += ringY(fx, cyt + 0.01, fz2, 0.26, yaw, 12);
            L.detail += ringY(fx, cyt + 0.01, fz2, 0.10, yaw, 8);
        }

        /* Flow and return, and they run BEHIND the frame now rather than in front of it.
           In front is the half the cutaway takes away, so a pipe there was drawn over open
           air above the machines. Along the far roof edge they are on surface that survives
           the cut, which is also where the plumbing on a real one would be least in the way.
           Separated in z rather than in y: at roof level the pair has to clear the plinth,
           and depth is the axis with room for it. They merge into one run on a phone, which
           is the right thing to lose — the frame is the tell, these are the pipes to it. */
        var hz = zc0 - 0.12;
        L.detail += line([cx0, K.h + 0.05, hz], [cx1, K.h + 0.05, hz], yaw);
        L.detail += line([cx0, K.h + 0.05, hz + 0.09], [cx1, K.h + 0.05, hz + 0.09], yaw);
        L.detail += line([cx1, K.h + 0.05, hz], [x1 + 0.02, K.h * 0.62, hz], yaw);
        L.detail += line([cx1, K.h + 0.05, hz + 0.09], [x1 + 0.02, K.h * 0.62, hz + 0.09], yaw);

        // Roof-mounted uplink with a dish and guy lines.
        // Only one container carries the uplink; a second mast is clutter.
        if (K.mast) {
            var mast = mastOf(K);
            addBox(L, mast, yaw);
            L.detail += ring(mast.x, K.h + 1.5, mast.z, 0.46, yaw, 12);
            L.detail += ring(mast.x, K.h + 1.5, mast.z, 0.2, yaw, 8);
            /* Guyed across the depth rather than along the length. Along the length the
               near stay landed on the cooler and the far one overhung the container end;
               across, both stays reach bare roof on a container this close to its end. */
            L.detail += line([mast.x, K.h + 1.3, mast.z], [mast.x, K.h, mast.z - 0.7], yaw);
            L.detail += line([mast.x, K.h + 1.3, mast.z], [mast.x, K.h, mast.z + 0.7], yaw);
        }

        // Step at the door end.
        addBox(L, { x: x1 + 0.5, y: 0, z: z1 - 0.5, w: 0.7, h: 0.3, d: 0.5 }, yaw);
        return L;
        }

    return {
        GAS: GAS, GEN: GEN, XFMR: XFMR, CONT: CONT, COOLER: COOLER,
        COLS: COLS, TIERS: TIERS, AS: AS,
        mastOf: mastOf, pduOf: pduOf, racksFor: racksFor,
        place: place, gas: gas, gen: gen, xfmr: xfmr, container: container,
    };
});
