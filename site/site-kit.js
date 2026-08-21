/* ===== ION MINING GROUP — the kit, shared by every drawing of it =====

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

    function mastOf(K) { return { x: K.x + 3.4, y: K.h, z: K.z - 0.5, w: 0.1, h: 1.5, d: 0.1 }; }
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
            var fz = u.z + u.d/2 + 0.008, ccy = u.y + u.h/2;
            var rr = Math.min(u.h, u.w/2) * 0.36;
            L.detail += ring(u.x - u.w * 0.24, ccy, fz, rr, yaw, 8);
            L.detail += ring(u.x + u.w * 0.24, ccy, fz, rr, yaw, 8);
            // Control panel strip and status LED, as on a real S21.
            L.detail += line([u.x - u.w * 0.42, u.y + u.h - 0.07, fz],
                             [u.x - u.w * 0.06, u.y + u.h - 0.07, fz], yaw);
            L.detail += ring(u.x + u.w * 0.40, u.y + u.h - 0.07, fz, 0.028, yaw, 5);
        }

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
        for (var r2 = 1; r2 < ribs; r2++) {
            var rx2 = x0 + K.w * r2 / ribs;
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
        // Exhaust fans on the door end.
        L.detail += ring(dx, K.h * 0.52, z0 + K.d * 0.3, 0.52, yaw, 12);
        L.detail += ring(dx, K.h * 0.52, z0 + K.d * 0.3, 0.34, yaw, 10);
        L.detail += ring(dx, K.h * 0.52, z0 + K.d * 0.7, 0.52, yaw, 12);
        L.detail += ring(dx, K.h * 0.52, z0 + K.d * 0.7, 0.34, yaw, 10);

        // Intake louvres and filter frame on the cooling end.
        var lx = x0 - 0.105;
        for (var l = 1; l <= 9; l++) {
            var ly = K.h * l / 10;
            L.detail += line([lx, ly, z0 + 0.17], [lx, ly, z1 - 0.17], yaw);
        }
        L.detail += line([lx, K.h * 0.08, z0 + 0.17], [lx, K.h * 0.92, z0 + 0.17], yaw);
        L.detail += line([lx, K.h * 0.08, z1 - 0.17], [lx, K.h * 0.92, z1 - 0.17], yaw);

        // Roof-mounted uplink with a dish and guy lines.
        // Only one container carries the uplink; a second mast is clutter.
        if (K.mast) {
            var mast = mastOf(K);
            addBox(L, mast, yaw);
            L.detail += ring(mast.x, K.h + 1.5, mast.z, 0.46, yaw, 12);
            L.detail += ring(mast.x, K.h + 1.5, mast.z, 0.2, yaw, 8);
            L.detail += line([mast.x, K.h + 1.3, mast.z], [mast.x - 0.7, K.h, mast.z], yaw);
            L.detail += line([mast.x, K.h + 1.3, mast.z], [mast.x + 0.7, K.h, mast.z], yaw);
        }

        // Step at the door end.
        addBox(L, { x: x1 + 0.5, y: 0, z: z1 - 0.5, w: 0.7, h: 0.3, d: 0.5 }, yaw);
        return L;
        }

    return {
        GAS: GAS, GEN: GEN, XFMR: XFMR, CONT: CONT,
        COLS: COLS, TIERS: TIERS, AS: AS,
        mastOf: mastOf, pduOf: pduOf, racksFor: racksFor,
        place: place, gas: gas, gen: gen, xfmr: xfmr, container: container,
    };
});
