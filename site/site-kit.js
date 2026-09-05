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
    var COOLER = { inX: 0.90, inZ: 0.22, plinth: 0.13, slope: 0.62, ridge: 0.62,
                   /* How far the heat-rise marks climb above the ridge. The hydro story
                      used to END at this frame: water in, fans in the deck, and nothing
                      anywhere saying heat actually leaves — the one thing the cooler is
                      for. The marks are drawn in container() below; the height lives
                      here because it is part of the cooler's envelope, not a free
                      choice per scene. 0.30 m is 5.3 px above the ridge on the home
                      page and 2.5 px on its phone crop — the desktop reads it, the
                      phone rounds it away, and both of those are the intent. */
                   rise: 0.30 };
    /* h WAS plinth + slope + 0.01 (the fan rings lying in the ridge). It is the number
       every scene sizes its clipping box and hover region from — scene-site.js and
       scene-pad-ion.js both build their container boxes as K.h + COOLER.h + 0.14 — so if
       the rise marks are not inside it, they are drawn above the box the clip check
       sweeps and nothing anywhere is checking they stay on screen. Folding rise in here
       grows those boxes automatically; measured against the swept-bbox checks, neither
       yard scene's frame moves at all (their tops are set by the gas stack and the mast,
       not the coolers) and scene-hosting.js restates its own box to absorb it. */
    COOLER.h = COOLER.plinth + COOLER.slope + COOLER.rise + 0.01;

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

        /* Face guards for the exterior marks below. H is the placement shim, so
           these quads are evaluated at the placed position — facing computed at
           the origin would be wrong for any skid off the pivot. */
        var F = H.boxFaces(SELF);
        var frontOn = H.frontFacing(F.front, yaw), backOn = H.frontFacing(F.back, yaw),
            leftOn  = H.frontFacing(F.left,  yaw), rightOn = H.frontFacing(F.right, yaw);

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

        /* Inlet piping, an isolation valve and a pressure gauge. They stand
           BESIDE the -x end, not on it, and that end is edge-on at yaw 0 — the
           baked frame — so keying them to their own face would hide them in the
           one view every page opens with. Opposite-face polarity instead: gone
           only when the +x end definitively fronts, which is when the body
           stands between them and the viewer. */
        if (!rightOn) {
            L.detail += line([(0) - K.w/2 - 0.8, 0.5, 0], [(0) - K.w/2, 0.5, 0], yaw);
            L.detail += ring((0) - K.w/2 - 0.45, 0.5, 0, 0.17, yaw, 8);
            L.detail += line([(0) - K.w/2 - 0.45, 0.33, 0], [(0) - K.w/2 - 0.45, 0.67, 0], yaw);
            L.detail += ring((0) - K.w/2 - 0.1, 1.15, 0.3, 0.12, yaw, 8);
            L.detail += line([(0) - K.w/2 - 0.1, 0.5, 0.3], [(0) - K.w/2 - 0.1, 1.03, 0.3], yaw);
        }

        // Outlet riser into the vessel — the inlet's mirror, same polarity.
        if (!leftOn)
            L.detail += line([(0) + K.w/2 + 0.05, 0.6, 0.35], [(0) + K.w/2 + 0.05, vy, 0.35], yaw);

        /* Skid handrail on the open side. 0.28 m proud is not "visible from
           everywhere": at yaw 200 the two rails and three posts printed a
           rectangle on the blank back of the skid. Hidden when the back
           fronts. */
        var hz = K.d/2 + 0.28;
        if (!backOn) {
            L.detail += line([(0) - K.w/2 - 0.2, 1.05, hz], [(0) + K.w/2 + 0.2, 1.05, hz], yaw);
            L.detail += line([(0) - K.w/2 - 0.2, 0.62, hz], [(0) + K.w/2 + 0.2, 0.62, hz], yaw);
            [-1, 0, 1].forEach(function (i) {
                var px = (0) + i * (K.w/2 + 0.2);
                L.detail += line([px, 0.24, hz], [px, 1.05, hz], yaw);
            });
        }

        /* Access ladder on the body: 0.01 proud of the +z face, so it is a mark
           ON that face and carries its facing — the container door-hardware
           pattern. */
        if (frontOn) {
            for (var rg = 1; rg <= 4; rg++) {
                var ry = K.h * rg / 5;
                L.detail += line([(0) - 0.3, ry, K.d/2 + 0.01], [(0) + 0.3, ry, K.d/2 + 0.01], yaw);
            }
            L.detail += line([(0) - 0.3, 0.24, K.d/2 + 0.01], [(0) - 0.3, K.h, K.d/2 + 0.01], yaw);
            L.detail += line([(0) + 0.3, 0.24, K.d/2 + 0.01], [(0) + 0.3, K.h, K.d/2 + 0.01], yaw);
        }
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

        /* Face guards, judged at the placed position — H is the shim. CAB is
           declared up here because its own front face guards its door
           furniture below. */
        var F = H.boxFaces(SELF);
        var frontOn = H.frontFacing(F.front, yaw), leftOn = H.frontFacing(F.left, yaw),
            rightOn = H.frontFacing(F.right, yaw);
        var CAB = { x: (0) + 1.9, y: 0, z: K.d / 2 + 0.16, w: 0.75, h: 1.5, d: 0.3 };
        var cabOn = H.frontFacing(H.boxFaces(CAB).front, yaw);

        var L = newLayers();
        addBox(L, { x: (0), y: 0, z: 0, w: K.w + 0.5, h: 0.22, d: K.d + 0.4 }, yaw, ['top']);
        addBox(L, SELF, yaw);

        // A stack per engine bay, each with a rain cap.
        [-1.3, 1.3].forEach(function (dx) {
            addBox(L, { x: (0) + dx, y: K.h, z: -0.5, w: 0.24, h: 1.5, d: 0.24 }, yaw);
            L.detail += ring((0) + dx, K.h + 1.5, -0.5, 0.22, yaw, 8);
        });
        /* Radiator louvres, ON the -x face, and the fan seen through the slats
           when that end shows. One guard for both: from every other side the
           fan's far half printed on the body. */
        var gx = (0) - K.w / 2 - 0.006;
        if (leftOn) for (var i = 1; i <= 7; i++) {
            var gy = K.h * (i / 8);
            L.detail += line([gx, gy, -K.d/2 + 0.14], [gx, gy, K.d/2 - 0.14], yaw);
        }
        // Control cabinet on the aisle side.
        addBox(L, CAB, yaw);
        if (cabOn) for (var cl = 1; cl <= 2; cl++) {
            L.detail += line([(0) + 1.6, 1.5 * cl / 3, K.d/2 + 0.31],
                             [(0) + 2.2, 1.5 * cl / 3, K.d/2 + 0.31], yaw);
        }
        // Bay seam, access panels, lifting lugs. Seam and panels are 0.006
        // proud of the +z face, so they are marks on it and carry its facing.
        var zf = K.d / 2 + 0.006;
        if (frontOn) {
            L.detail += line([(0), 0.1, zf], [(0), K.h - 0.1, zf], yaw);
            for (var s = 1; s <= 4; s++) {
                var sx = (0) - K.w/2 + K.w * s / 5;
                L.detail += line([sx, K.h * 0.24, zf], [sx, K.h * 0.78, zf], yaw);
            }
        }
        for (var lg = 0; lg < 4; lg++) {
            var lx = (0) - K.w/2 + K.w * (lg + 0.5) / 4;
            addBox(L, { x: lx, y: K.h, z: 0.62, w: 0.1, h: 0.16, d: 0.1 }, yaw);
        }
        // Radiator fan behind the louvres, and the core hatching — the -x
        // end's mark, same guard as the louvres it is seen through.
        if (leftOn) {
            L.detail += ring(gx - 0.01, K.h * 0.52, 0, 0.62, yaw, 14);
            L.detail += ring(gx - 0.01, K.h * 0.52, 0, 0.24, yaw, 10);
            for (var sp = 0; sp < 4; sp++) {
                var ang = sp * Math.PI / 4;
                L.detail += line([gx - 0.01, K.h * 0.52 + Math.sin(ang) * 0.24, Math.cos(ang) * 0.24],
                                 [gx - 0.01, K.h * 0.52 + Math.sin(ang) * 0.62, Math.cos(ang) * 0.62], yaw);
            }
        }

        // Silencer drum lying on the roof between the stacks.
        L.detail += ringX((0) - 0.55, K.h + 0.3, 0.45, 0.26, yaw, 10);
        L.detail += ringX((0) + 0.55, K.h + 0.3, 0.45, 0.26, yaw, 10);
        L.detail += line([(0) - 0.55, K.h + 0.56, 0.45], [(0) + 0.55, K.h + 0.56, 0.45], yaw);
        L.detail += line([(0) - 0.55, K.h + 0.04, 0.45], [(0) + 0.55, K.h + 0.04, 0.45], yaw);

        // Cabinet door split and handle — marks on the cabinet's own front.
        if (cabOn) {
            L.detail += line([(0) + 1.9, 0.12, K.d/2 + 0.31],
                             [(0) + 1.9, 1.38, K.d/2 + 0.31], yaw);
            L.detail += ring((0) + 2.02, 0.75, K.d/2 + 0.32, 0.06, yaw, 6);
        }

        // Engine inspection hatches along the lower body, on the +z face.
        if (frontOn) for (var hh = 0; hh < 3; hh++) {
            var hx = (0) - K.w/2 + K.w * (hh + 0.5) / 3;
            L.detail += line([hx - 0.34, 0.5, zf], [hx + 0.34, 0.5, zf], yaw);
            L.detail += line([hx - 0.34, 1.12, zf], [hx + 0.34, 1.12, zf], yaw);
            L.detail += line([hx - 0.34, 0.5, zf], [hx - 0.34, 1.12, zf], yaw);
            L.detail += line([hx + 0.34, 0.5, zf], [hx + 0.34, 1.12, zf], yaw);
        }

        /* Gas train and its regulator, beside the -x end — the gas skid inlet's
           polarity. The guard also covers the regulator's addBox: its fills
           share the body's buckets and are emitted after them, so from behind
           the little box painted itself over the body. */
        if (!rightOn) {
            L.detail += line([(0) - K.w/2 - 0.9, 0.42, 0.4], [(0) - K.w/2, 0.42, 0.4], yaw);
            addBox(L, { x: (0) - K.w/2 - 0.62, y: 0.42, z: 0.4, w: 0.26, h: 0.3, d: 0.26 }, yaw);
        }
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

        /* Face guards, judged at the placed position — H is the shim. FINS is a
           box whose front/back planes sit exactly at the fin banks' outer faces,
           z = ±(K.d/2 + 0.22): the corrugation dashes below are marks on those
           two planes and each side carries its own plane's facing, wound the way
           boxFaces winds front and back. LV likewise guards its gland plate. */
        var F = H.boxFaces(SELF);
        var frontOn = H.frontFacing(F.front, yaw);
        var FINS = H.boxFaces({ x: 0, y: 0.32, z: 0, w: K.w, h: K.h - 0.64, d: K.d + 0.44 });
        var finOn = { '1': H.frontFacing(FINS.front, yaw), '-1': H.frontFacing(FINS.back, yaw) };
        var LV = { x: (0) + K.w/2 + 0.18, y: 0.3, z: 0, w: 0.3, h: 0.7, d: 0.6 };
        var lvOn = H.frontFacing(H.boxFaces(LV).right, yaw);

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
        /* Fin corrugation, so the banks read as radiators rather than slabs.
           Guarded per side on its own outer plane: unguarded, the far bank's
           dashes printed across the tank from every angle. */
        for (var side2 = -1; side2 <= 1; side2 += 2) {
            if (!finOn[String(side2)]) continue;
            for (var f2 = 0; f2 < 5; f2++) {
                var fx2 = (0) - K.w/2 + K.w * (f2 + 0.5) / 5;
                var fz2 = side2 * (K.d/2 + 0.22);
                for (var q = 1; q <= 3; q++) {
                    var qy = 0.32 + (K.h - 0.64) * q / 4;
                    L.detail += line([fx2 - 0.05, qy, fz2], [fx2 + 0.05, qy, fz2], yaw);
                }
            }
        }

        /* Tap changer on the end, with its drive shaft. The handwheel disc is
           centred ON the changer's -x plane, half buried in the box: 'inner',
           because the walls painted after it hide the buried half from every
           side and always leave the free half — a face guard is all-or-nothing
           and cannot split one ring down its diameter. */
        addBox(L, { x: (0) - K.w/2 - 0.16, y: 0.55, z: 0.25, w: 0.28, h: 0.62, d: 0.42 }, yaw);
        L.inner += ring((0) - K.w/2 - 0.3, 0.86, 0.25, 0.12, yaw, 8);

        // Oil level gauge and rating plate — marks on the +z face.
        var nz = K.d/2 + 0.006;
        if (frontOn) {
            L.detail += ring((0) + 0.42, 1.45, nz, 0.11, yaw, 8);
            L.detail += line([(0) - 0.55, 1.3, nz], [(0) - 0.15, 1.3, nz], yaw);
            L.detail += line([(0) - 0.55, 1.52, nz], [(0) - 0.15, 1.52, nz], yaw);
            L.detail += line([(0) - 0.55, 1.3, nz], [(0) - 0.55, 1.52, nz], yaw);
            L.detail += line([(0) - 0.15, 1.3, nz], [(0) - 0.15, 1.52, nz], yaw);
        }

        // HV cable drops from the bushings down the end.
        for (var hv = 0; hv < 3; hv++) {
            var hx2 = (0) - 0.45 + hv * 0.45;
            L.detail += line([hx2, K.h + 0.55, -0.3], [hx2, K.h + 0.78, -0.62], yaw);
        }

        // LV cable box and its gland plate — the gland lines ride on the LV
        // box's own +x face and carry its facing.
        addBox(L, LV, yaw);
        if (lvOn) {
            L.detail += line([(0) + K.w/2 + 0.34, 0.42, -0.2], [(0) + K.w/2 + 0.34, 0.42, 0.2], yaw);
            L.detail += line([(0) + K.w/2 + 0.34, 0.86, -0.2], [(0) + K.w/2 + 0.34, 0.86, 0.2], yaw);
        }

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
    function container(H, K, yaw, options) {
        /* The home scene supplies persistent racks for its detail tiers.
           Calls without options retain the shared comparison geometry. */
        var refined = !!options;
        var compact = refined && H.detailLevel() === 'compact';
        var addBox = H.addBox, line = H.line, ring = H.ring, ringX = H.ringX,
            ringY = H.ringY,
            poly = H.poly, polyInside = H.polyInside, boxFaces = H.boxFaces,
            frontFacing = H.frontFacing, newLayers = H.newLayers;

        var L = newLayers();
        var x0 = K.x - K.w/2, x1 = K.x + K.w/2;
        var z0 = K.z - K.d/2, z1 = K.z + K.d/2;
        var y1 = K.h;

        /* THE ROOF COOLER'S FOOTPRINT, DECLARED ONCE AND UP HERE. Three separate things
           downstream need it and they are spread across the function: the roof ribs have to
           stop at its edges, the frame itself is built from it, and the manifolds inside have
           to rise to meet the pipes that come down off it. That last one is why this moved:
           computed a second time next to the frame, it was below the manifold code that
           needed it, so the pipes were laid out against an undefined z and only looked
           connected because nothing checked. */
        var COOL_X = COOLER.inX, COOL_Z = COOLER.inZ;
        var cx0 = x0 + COOL_X, cx1 = x1 - COOL_X;
        var coolZ0 = z0 + COOL_Z;                 // far edge of the frame
        var hz = coolZ0 - 0.12;                   // the roof pair, just behind it

        // Interior surfaces, seen from within through the cutaway.
        L.inside += polyInside([[x0,0,z0],[x1,0,z0],[x1,0,z1],[x0,0,z1]], yaw);
        L.inside += polyInside([[x0,0,z0],[x0,y1,z0],[x1,y1,z0],[x1,0,z0]], yaw);
        L.inside += polyInside([[x0,0,z0],[x0,0,z1],[x0,y1,z1],[x0,y1,z0]], yaw);
        L.inside += polyInside([[x1,0,z1],[x1,0,z0],[x1,y1,z0],[x1,y1,z1]], yaw);

        // --- Everything from here to the machines paints BEHIND them ---
        // Far-wall corrugation.
        var ribs = refined ? (compact ? 12 : 24) : 34;
        for (var r = 1; r < ribs; r++) {
            var rx = x0 + K.w * r / ribs;
            L.back += line([rx, 0.09, z0 + 0.012], [rx, y1 - 0.09, z0 + 0.012], yaw);
        }
        // Floor grating.
        if (!refined) for (var g = 1; g < 26; g++) {
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
        var mine = refined ? options.racks : racksFor(K);
        if (refined && !options.faces) options.faces = mine.map(boxFaces);
        for (var i = 0; i < mine.length; i++) {
            var u = mine[i], f = refined ? options.faces[i] : boxFaces(u);
            for (var k in f) if (frontFacing(f[k], yaw)) L.asics += poly(f[k], yaw);
            if (refined && frontFacing(f.top, yaw)) L.asictop += poly(f.top, yaw);
            /* SEALED FACES. What stood here was a twin fan ring at 0.36 of the machine's
               half-width, commented "as on a real S21" — and it was, which is the problem.
               The S21+ Hyd has no fans and no apertures at all. Those two rings measured
               5.9 px each on a 16.3 px face at desktop, so twelve of every sixteen pixels
               of every one of the thirty machines in a container were a part the hardware
               does not have. The container shell was switched to hydro around them and
               they were left wearing the old machine.

               NOTHING REPLACES THEM ON THE FACE, and that is the measurement talking. The
               coupling this machine really has would be 2.8 px across here against 7.9 px
               on the hosting page, where it is drawn properly — 7.9 is what that file itself calls
               "about 8 px". (This read 21 px, which was the old FAN ring on that page.) Drawing it at fan size so
               it survived would put a wrong-sized part back exactly where the wrong part
               was. What says hydro at this scale is the loop running past the rack, below
               — a pipe run reads at any size, a 2.7 px ring does not. */
            var fz = u.z + u.d/2 + 0.008;
            /* Control strip and status LED — parts it does have. Shifted right to sit where
               scene-hosting.js puts them, so the two drawings of one machine agree. Not, as
               this once said, to clear "the column's riser": there is no per-column riser in
               this drawing. Ten of them were drawn and removed again — see the note on the
               run below — and the comment outlived the geometry by one edit. */
            /* 'inner', not 'detail': these live on the machine faces, and from behind
               the solid far wall has to hide them or the wall wears the fleet's
               control strips on its outside. */
            if (!refined || (!compact && frontFacing(f.front, yaw))) {
                L.inner += line([u.x + u.w * 0.02, u.y + u.h - 0.07, fz],
                                [u.x + u.w * 0.30, u.y + u.h - 0.07, fz], yaw);
                L.inner += ring(u.x + u.w * 0.40, u.y + u.h - 0.07, fz, 0.028, yaw, 5);
            }
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
        /* STOPS SHORT OF THE PDU. The cabinet stands at x1 - 1.0, up to a metre NEARER the
           viewer than these pipes, so it is in front of them in the scene — but they are in
           'detail', the last layer painted, and a hairline in the last layer goes over a
           filled face however far behind it the pipe really is. Running the full rack put
           both pipes across the cabinet's front. Ending at the last column served is the
           honest stop anyway: past that there is nothing to feed. */
        var manX0 = rx0 - 0.2, manX1 = rx0 + span - 0.32;
        L.inner += line([manX0, manY, manZ], [manX1, manY, manZ], yaw);
        L.inner += line([manX0, manY + manSep, manZ], [manX1, manY + manSep, manZ], yaw);

        /* UP THE BLIND END TO THE ROOF COOLER, and every part of that sentence was wrong in
           the first version. It ran up at rx0 + span + 0.2, which is 0.90 m short of the
           door-end wall it claimed to climb — inside the PDU, in the aisle — and it stopped
           1.5 m from the downcomers it claimed to meet, so the run still ended in mid-air,
           just higher up. Worse, the pair was one line: both segments shared an x, a z and a
           top point, so the second was a sub-segment of the first and the supply/return pair
           collapsed to a single pipe at the one place the drawing has to show two.

           It rises at the BLIND end now, not the door end. That end lost its intake louvres
           in the switch to hydro and has nothing on it, while the door end carries the PDU,
           the locking bars and the hinges. The roof pair drops there to match.

           WHAT IS NOT DRAWN BETWEEN THEM IS THE CDU. scene-hosting.js draws one — pumps and
           a plate exchanger, with its own callout — because the machine loop and the roof
           loop are two loops and something has to move heat between them. This drawing does
           not draw it, the same way it does not draw the branches, the couplings, the
           network switch or the spares cabinet that page also has: at 16 px a machine and
           one container of four, it shows that a loop exists and leaves what is in it to the
           page that can hold it. So read these two pipes as the run leaving toward the plant,
           not as coolant going straight from the rack to the roof. The hosting page is the
           one making a claim about the topology; this one is making a claim about the yard.

           At rest the back row shows about 71% of its line work — the front row takes the
           rest, and the manifold sits at floor level, which is the first thing a container in
           front of it hides. That is the yard, not the pipe: the back row's PDU goes the same
           way. It comes back as the drawing turns.

           The two pipes are separated up the wall in BOTH x and z. Two verticals at one x
           and one z are collinear whatever heights they span, which is the trap the first
           version fell into; and z alone is not enough here either, at 0.79 px apart. The z
           offset is the roof pair's own 0.09, so the four ends meet at four points rather
           than approximately, and the x offset is what makes them read as two. */
        var riseX = manX0, yTop = K.h * 0.62;
        [0, 1].forEach(function (i) {
            var y = manY + i * manSep, pz = hz + i * 0.09;
            /* SEPARATED IN X, and that is the second thing the first version got wrong. Two
               verticals at one x and one z are collinear whatever heights they span, so the
               pair was literally one line. Moving them apart in Z instead fixes the geometry
               and not the drawing: measured, 0.09 of z is 0.79 px apart at rest, still one
               line to look at, and the band behind the cooler is only 0.22 deep so no z
               separation that fits gets past about 1.9 px. X is the axis with room — 0.22
               here is 4.2 px — and the aisle in front of the rack has it to give. */
            var rxi = riseX + i * 0.22;
            L.inner += line([rxi, y, manZ], [rxi, y, pz], yaw);           // back under the rack
            L.inner += line([rxi, y, pz], [rxi, yTop, pz], yaw);          // up the blind end
            /* The stub OUT through the wall to the downcomer foot is exterior — inner
               would let the end-wall box paint over it from the one side it should
               show on, so it stays in detail behind a facing guard set below. */
            if (frontFacing([[x0,0,z0],[x0,0,z1],[x0,y1,z1],[x0,y1,z0]], yaw))
                L.detail += line([rxi, yTop, pz], [x0 - 0.02, yTop, pz], yaw);
        });

        // --- In front of the machines ---
        // Cable tray under the ceiling.
        /* The tray used to carry 19 cable-drop marks across its lid. They are
           gone, and deliberately: the lid sits at y1 - 0.18 under the KEPT half
           of the roof, and at this drawing's pitches (20 and 26 deg) a
           sightline to it that clears the roof's cut edge re-enters the roof
           plane at most 0.29 m later — still over the roof, which is 1.22 m
           deep. Seeing the lid needs g * tan(pitch) < 0.18 over a gap g of at
           least 0.66 m, i.e. a pitch under 15.3 deg that no scene uses; from
           behind the far wall stands in the way and from the ends the plates
           do. Marks that were 'detail' bled through the roof, marks in 'inner'
           are covered by the lid's own fill, and marks nobody can ever see are
           not drawn. */
        addBox(L, { x: K.x, y: y1 - 0.28, z: z0 + 0.42, w: K.w - 0.6, h: 0.1, d: 0.28 }, yaw);

        // PDU on the aisle side, so painting it after the machines is correct.
        var pdu = pduOf(K);
        addBox(L, pdu, yaw);
        /* Breaker rows in 'detail' behind the cabinet's own front facing — the
           door-hardware pattern. In 'inner' they were covered by the PDU's own
           front fill (painted after 'inner') from the front and by the far wall
           from behind: rows visible from nowhere, a blank cabinet at rest. */
        if (frontFacing(boxFaces(pdu).front, yaw)) {
            for (var p = 1; p <= 4; p++) {
                L.detail += line([pdu.x - 0.3, pdu.h * p / 5, pdu.z + pdu.d/2 + 0.006],
                                 [pdu.x + 0.3, pdu.h * p / 5, pdu.z + pdu.d/2 + 0.006], yaw);
            }
        }

        /* THE FAR WALL, AS A WALL. It never existed as an exterior face — under
           translucent paint the x-ray was everywhere, so the interior 'inside' poly
           was the only far wall there was, and everything painted after it showed.
           Solid paint made that a lie you could walk around to: from behind, the
           container was wallpaper made of its own plumbing. One quad, wound like
           boxFaces' back so frontFacing culls it the way it culls a box: drawn only
           when its outside faces you, which is exactly when it must cover the
           contents — and not drawn when you look in through the cutaway. Emitted
           HERE, after every interior fill that shares the side bucket, because
           within a layer the only order is emission order. */
        var farWall = [[x1,0,z0],[x0,0,z0],[x0,y1,z0],[x1,y1,z0]];
        var farWallFacing = frontFacing(farWall, yaw);
        if (farWallFacing) L.side += poly(farWall, yaw);

        // Roof: only the far half survives the cutaway.
        var roof = [[x0,y1,z0],[x0,y1,K.z],[x1,y1,K.z],[x1,y1,z0]];
        var roofFacing = frontFacing(roof, yaw);
        if (roofFacing) L.top += poly(roof, yaw);
        /* cx0/cx1 are declared at the top of this function; the ribs stop at them.
           The whole loop now keys on the roof's own facing: ribs are marks ON that
           surface, and under solid paint a rib without its roof is a stripe across
           whatever else is there — the exact bleed the solid pass exists to end. */
        if (roofFacing) for (var r2 = 1; r2 < ribs; r2++) {
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
            var width = refined ? 0.18 : 0.36, height = refined ? 0.18 : 0.32;
            addBox(L, { x: pt[0], y: 0,           z: pt[1], w: width, h: height, d: width }, yaw);
            addBox(L, { x: pt[0], y: K.h - height, z: pt[1], w: width, h: height, d: width }, yaw);
        });

        // Base rail along the open side. Its edge lines are marks on the +z face,
        // so they carry that face's facing: from behind they striped the wall.
        addBox(L, { x: K.x, y: 0, z: z1 - 0.09, w: K.w, h: refined ? 0.16 : 0.28, d: 0.18 }, yaw);
        if (refined && roofFacing) {
            /* A narrow solid lip gives the cut roof a thickness. It stays on
               the surviving roof half, leaving the machines exposed. */
            L.rim += poly([[x0,y1 + 0.008,K.z - 0.055],[x0,y1 + 0.008,K.z],
                           [x1,y1 + 0.008,K.z],[x1,y1 + 0.008,K.z - 0.055]], yaw);
        }
        if (frontFacing([[x0,0,z1],[x1,0,z1],[x1,y1,z1],[x0,y1,z1]], yaw)) {
            L.detail += line([x0, y1, z1], [x1, y1, z1], yaw);
            L.detail += line([x0, 0, z1], [x0, y1, z1], yaw);
            L.detail += line([x1, 0, z1], [x1, y1, z1], yaw);
        }

        // Door end: seam, locking bars, hinges — marks on the +x end plate, guarded
        // by its facing for the same reason the base rail's edges are.
        /* Judged at the PLATE's face plane (x1 + 0.1), not the shell's x1: the
           marks ride the plate, and tested at x1 they popped 0.22 deg before
           and after their surface did. Same plane as the marks = flip-exact. */
        var dx = x1 + 0.105, dfx = x1 + 0.1;
        if (frontFacing([[dfx,0,z1],[dfx,0,z0],[dfx,y1,z0],[dfx,y1,z1]], yaw)) {
            L.detail += line([dx, 0.12, K.z], [dx, y1 - 0.12, K.z], yaw);
            for (var b2 = 0; b2 < 4; b2++) {
                var bz = z0 + K.d * (b2 + 0.5) / 4;
                L.detail += line([dx, 0.16, bz], [dx, y1 - 0.16, bz], yaw);
                if (!compact) {
                    L.detail += ring(dx, 0.5, bz, 0.07, yaw, 6);
                    L.detail += ring(dx, y1 - 0.5, bz, 0.07, yaw, 6);
                }
            }
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
        var zc0 = coolZ0;                         // far edge, declared at the top
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
           way; without it the frame ends in mid-air and reads as broken rather than sliced.
           Guarded on the OPPOSITE of the coil face: the cut is the +z side, so it shows
           exactly when the back face does not — from behind, these three lines striped the
           solid coil bank. */
        if (!frontFacing(faceBack, yaw)) {
            L.detail += line([cx0, cyt, zr1], [cx1, cyt, zr1], yaw);
            L.detail += line([cx0, cyb, zc1], [cx0, cyt, zr1], yaw);
            L.detail += line([cx1, cyb, zc1], [cx1, cyt, zr1], yaw);
        }

        /* Eight coil divisions up the leaning face — the far one, which is the one left.
           They carry that face's facing: marks on a surface bleed when the surface turns
           away, same rule as the roof ribs. */
        var coilFaceOn = frontFacing(faceBack, yaw);
        var COILS = compact ? 4 : 8;
        if (coilFaceOn) for (var cq = 0; cq < COILS; cq++) {
            var px = cx0 + (cx1 - cx0) * (cq + 0.5) / COILS;
            L.detail += line([px, cyb, zc0], [px, cyt, zr0], yaw);
        }

        /* The fans that pull through the bank, lying flat in the ridge and therefore drawn
           with ringY: ring() would stand them on edge, out of the deck they sit in. */
        var fz2 = (zr0 + zr1) / 2;                // centred in what is left of the ridge
        for (var cf = 0; cf < 2; cf++) {
            var fx = cx0 + (cx1 - cx0) * (cf ? 0.76 : 0.24);
            if (!refined || frontFacing(faceRidge, yaw)) {
                L.detail += ringY(fx, cyt + 0.01, fz2, 0.26, yaw, compact ? 8 : 12);
                if (!compact) L.detail += ringY(fx, cyt + 0.01, fz2, 0.10, yaw, 8);
            }

            /* HEAT LEAVING, which this drawing never said before. The loop climbs to the
               roof, the fans lie in the ridge, and the story stopped there — nothing about
               the frame says the heat goes anywhere. So: a broken rising stroke either
               side of each fan, two dashes with a small sideways step at the break, which
               is the oldest glyph there is for air you cannot draw. Over the FANS, not
               spread along the deck, because the fans are where a dry cooler actually
               discharges.

               STATIC. The only animated things on the site are the flame and the flow
               line, and a third animation family is a design decision nobody has made.

               On the ridge that SURVIVES the cutaway: fz2 is the centre of the far
               half's remaining deck (z < K.z by construction), so the marks rise from
               drawn surface, never from the open half the cut takes away. Height is
               COOLER.rise — see its note for the envelope arithmetic. Measured at the
               real page sizes: 5.3 px of rise at desktop on the home page, 2.5 px on the
               phone crop, where a 0.8-unit hairline is 0.4 px wide besides — the phone
               loses them entirely rather than misreading them, which is the designed
               degradation. The staggered pair heights are so four containers of them
               read as shimmer rather than as a picket line. */
            var mkT = cyt + COOLER.rise;
            (refined ? [] : [[-0.28, 0.04, 0.06], [0.28, 0.08, -0.06]]).forEach(function (mk) {
                var mx = fx + mk[0], my = cyt + mk[1];
                L.detail += line([mx, my, fz2], [mx, my + 0.11, fz2], yaw);
                L.detail += line([mx + mk[2], my + 0.15, fz2],
                                 [mx + mk[2], Math.min(my + 0.26, mkT), fz2], yaw);
            });
        }

        /* Flow and return, and they run BEHIND the frame now rather than in front of it.
           In front is the half the cutaway takes away, so a pipe there was drawn over open
           air above the machines. Along the far roof edge they are on surface that survives
           the cut, which is also where the plumbing on a real one would be least in the way.
           Separated in z rather than in y: at roof level the pair has to clear the plinth,
           and depth is the axis with room for it. They merge into one run on a phone, which
           is the right thing to lose — the frame is the tell, these are the pipes to it. */
        /* hz is declared at the top: the manifolds inside need it before this point.
           The pair sits BEHIND the cooler frame, so from the front it belongs hidden —
           under solid paint an unguarded pipe there re-crossed the coil bank it had been
           deliberately routed behind. Shown when the frame's back or the blind end faces
           you, which are the views where the plumbing is the near side of the roof. */
        if (frontFacing(faceBack, yaw) || farWallFacing ||
            frontFacing([[x0,0,z0],[x0,0,z1],[x0,y1,z1],[x0,y1,z0]], yaw)) {
            L.detail += line([cx0, K.h + 0.05, hz], [cx1, K.h + 0.05, hz], yaw);
            L.detail += line([cx0, K.h + 0.05, hz + 0.09], [cx1, K.h + 0.05, hz + 0.09], yaw);
            /* Down the BLIND end, not the door end. That end lost its intake louvres to
               the hydro switch and carries nothing; the door end carries the PDU inside
               and the locking bars and hinges outside. The manifolds below rise to exactly
               these two feet — [x0 - 0.02, K.h * 0.62, hz] and the same at hz + 0.09 — so
               the loop closes at a point rather than near one. */
            L.detail += line([cx0, K.h + 0.05, hz], [x0 - 0.02, K.h * 0.62, hz], yaw);
            L.detail += line([cx0, K.h + 0.05, hz + 0.09], [x0 - 0.02, K.h * 0.62, hz + 0.09], yaw);
        }

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
