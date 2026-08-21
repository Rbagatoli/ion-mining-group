/* ===== ION MINING GROUP — the wellpad, shared by both states =====

   The energy page draws one pad twice: as it is today with the flare lit, and
   with our kit on it. Everything in THIS file appears in both, identically, and
   that is the whole reason the file exists. If the wellhead moved by a metre
   between the two states, the crossfade would slide and the before/after would
   read as two different drawings rather than one site changing.

   So the two scenes do not each declare a pad. They import this one.

   Dimensions are metres and roughly true to a small associated-gas pad: a
   44 x 22 m graded surface, a wellhead, a horizontal separator on a skid, three
   tanks inside a containment berm, and a flare stack set well away from them.

   TWO THINGS ARE DELIBERATE ABOUT THE STACK HEIGHT AND THE GROUND.

   The stack is 8.5 m, down from 15. Nothing else here is taller than 6.2 m, so
   the stack and its flame set the vertical extent of the whole drawing on their
   own — and the drawing is fitted to its box, so every extra metre of stack
   both shrinks the plant and pushes it down the frame. The flame is a thin
   spike with no visual weight, so it drags the bounding box upward while the
   eye still reads the plant as sitting low. Coming down to 8.5 lets the whole
   scene rise 29px, and the flare is still twice the height of the tanks.

   The ground goes in its own layer rather than in 'back'. 'back' is the weight
   reserved for structural edges seen through a cutaway; a graded surface drawn
   at that weight competes with the machinery standing on it. It is also sparse
   now — a grid fine enough to describe a surface is fine enough to read as
   noise over the top of everything else.

   Geometry only. Every builder takes the engine helper bundle as H and never
   reaches for a global. */

(function (root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.PadGeometry = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /* ---------- The pad ---------- */

    var PAD  = { x: 0, y: -0.15, z: 0, w: 44, h: 0.15, d: 22 };
    var ROAD = { x: -18.0, y: -0.2, z: 13.4, w: 6.0, h: 0.1, d: 5.0 };  // way in, off the pad

    var WELL = { x: -17.0, y: 0, z: -5.0, w: 1.4, h: 0.9, d: 1.4 };   // cellar and base flange
    var WELL_H = 2.9;                                                  // top of the tree

    var SEP  = { x: -11.5, y: 0.75, z: -5.0, w: 6.2, h: 1.7, d: 1.7 };  // horizontal vessel
    var SKID = { x: -11.5, y: 0, z: -5.0, w: 6.6, h: 0.75, d: 2.0 };

    var TANK_R = 2.0, TANK_H = 6.2, TANK_Z = -7.2;
    var TANK_X = [-5.0, -0.6, 3.8];
    var BERM_H = 1.1;                                    // containment wall

    var FLARE = { x: 17.5, z: 6.0 };
    var FLARE_H = 8.5;                  // tip height — see the header
    var FLARE_R = 0.36;                 // stack radius
    var KO   = { x: 15.0, y: 0, z: 6.0, w: 2.2, h: 2.4, d: 2.2 };      // knockout drum

    var PIPE = 0.26;                    // half-width of a run of pipe

    /* Where the flame sits, and where a leader can point at it. */
    var TIP = [FLARE.x, FLARE_H, FLARE.z];

    var MODEL = { PAD: PAD, ROAD: ROAD, WELL: WELL, WELL_H: WELL_H, SEP: SEP, SKID: SKID,
                  TANK_R: TANK_R, TANK_H: TANK_H, TANK_Z: TANK_Z, TANK_X: TANK_X,
                  BERM_H: BERM_H, FLARE: FLARE, FLARE_H: FLARE_H, FLARE_R: FLARE_R,
                  KO: KO, PIPE: PIPE, TIP: TIP };

    function tankBoxes() {
        return TANK_X.map(function (x) {
            return { x: x, y: 0, z: TANK_Z, w: TANK_R * 2, h: TANK_H, d: TANK_R * 2 };
        });
    }

    /* The berm rectangle, in world coordinates. */
    var BERM = {
        x0: TANK_X[0] - TANK_R - 1.6, x1: TANK_X[2] + TANK_R + 1.6,
        z0: TANK_Z - TANK_R - 1.4,    z1: TANK_Z + TANK_R + 1.4,
    };

    /* ---------- Small shared helpers ---------- */

    /* Every edge of a box, as a drawn line.

       THIN THINGS DO NOT READ AS FILLS. The face fills are tuned for container
       walls — 6.2% for a side, 3.2% for an end — which is right for something
       two metres across and invisible for something sixty centimetres across.
       The flare stack renders about ten pixels wide, and at those alphas it
       effectively did not paint at all: the flame above it looked like it was
       floating in the sky because the chimney under it was not there.

       So anything slender gets its silhouette drawn as well as filled. All
       twelve edges, because which four form the silhouette changes as the pad
       turns and the short ones cost nothing. */
    function edges(H, yaw, L, b) {
        var x0 = b.x - b.w / 2, x1 = b.x + b.w / 2;
        var y0 = b.y,           y1 = b.y + b.h;
        var z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
        var v = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
        for (var i = 0; i < 4; i++) {
            var a = v[i], c = v[(i + 1) % 4];
            L.detail += H.line([a[0], y0, a[1]], [a[0], y1, a[1]], yaw);   // upright
            L.detail += H.line([a[0], y0, a[1]], [c[0], y0, c[1]], yaw);   // round the bottom
            L.detail += H.line([a[0], y1, a[1]], [c[0], y1, c[1]], yaw);   // round the top
        }
    }

    /* A run of pipe between two points on one axis, drawn with volume so it
       reads as pipe rather than as a leader line that wandered into the scene.
       Axis-aligned only, which is all this pad needs. */
    function pipe(H, yaw, L, a, b) {
        var box = {
            x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 - PIPE, z: (a[2] + b[2]) / 2,
            w: Math.abs(b[0] - a[0]) + PIPE * 2,
            h: Math.abs(b[1] - a[1]) + PIPE * 2,
            d: Math.abs(b[2] - a[2]) + PIPE * 2,
        };
        H.addBox(L, box, yaw);
        edges(H, yaw, L, box);
    }

    /* ---------- Builders ---------- */

    /* The graded surface. A sparse grid in the ground layer, the pad edge, and
       the road that gets a lowboy in — which is a detail every operator looks
       for and the fastest way to say "this is a pad" rather than "this is a
       floor". */
    function buildPad(H, yaw, L) {
        var addBox = H.addBox, line = H.line;

        /* The slab paints as GROUND, not as plant.

           addBox routes a box's faces by orientation — a top face goes to the
           'top' bucket — which is right for equipment and wrong for a 44 x 22 m
           sheet of gravel: it put the ground plane at exactly the brightness of
           a transformer lid, so the machinery had nothing to stand out against.
           The reading was that the plant looked transparent; in fact it was the
           right brightness and the floor underneath it was too.

           Build into a scratch bundle, then fold the whole slab into the ground
           layer, which is the one weight in the drawing that is meant to sit
           underneath everything. */
        var G = H.newLayers();
        addBox(G, PAD, yaw);
        addBox(G, ROAD, yaw);
        L.ground += G.top + G.side + G.end + G.detail + G.back;

        var x0 = PAD.x - PAD.w / 2, x1 = PAD.x + PAD.w / 2;
        var z0 = PAD.z - PAD.d / 2, z1 = PAD.z + PAD.d / 2;

        /* Sparse: 8 x 4 cells, not 20 x 11. Enough to read as a surface. */
        for (var i = 1; i < 8; i++) {
            var gx = x0 + PAD.w * i / 8;
            L.ground += line([gx, 0.004, z0 + 0.5], [gx, 0.004, z1 - 0.5], yaw);
        }
        for (var j = 1; j < 4; j++) {
            var gz = z0 + PAD.d * j / 4;
            L.ground += line([x0 + 0.5, 0.004, gz], [x1 - 0.5, 0.004, gz], yaw);
        }
        /* The pad edge, which the grid used to imply and now states. */
        L.ground += line([x0, 0.005, z0], [x1, 0.005, z0], yaw);
        L.ground += line([x0, 0.005, z1], [x1, 0.005, z1], yaw);
        L.ground += line([x0, 0.005, z0], [x0, 0.005, z1], yaw);
        L.ground += line([x1, 0.005, z0], [x1, 0.005, z1], yaw);
    }

    /* Containment around the tank battery: four low walls, open at the top. As
       characteristic of a tank battery as the tanks themselves. */
    function buildBerm(H, yaw, L) {
        var addBox = H.addBox;
        var t = 0.34, cx = (BERM.x0 + BERM.x1) / 2, cz = (BERM.z0 + BERM.z1) / 2;
        var w = BERM.x1 - BERM.x0, d = BERM.z1 - BERM.z0;
        addBox(L, { x: cx, y: 0, z: BERM.z0, w: w, h: BERM_H, d: t }, yaw);
        addBox(L, { x: cx, y: 0, z: BERM.z1, w: w, h: BERM_H, d: t }, yaw);
        addBox(L, { x: BERM.x0, y: 0, z: cz, w: t, h: BERM_H, d: d }, yaw);
        addBox(L, { x: BERM.x1, y: 0, z: cz, w: t, h: BERM_H, d: d }, yaw);
    }

    /* Wellhead: cellar, a stack of valve bodies narrowing to the top, and the
       guard rail that stands around every one of them. */
    function buildWell(H, yaw, L) {
        var addBox = H.addBox, line = H.line, ringY = H.ringY;
        addBox(L, WELL, yaw);
        var w = 0.62;
        for (var t = 0; t < 4; t++) {
            var y = WELL.h + t * 0.5;
            addBox(L, { x: WELL.x, y: y, z: WELL.z, w: w, h: 0.34, d: w }, yaw);
            w *= 0.88;
        }
        // Tree cap and two wing valves, which is what makes it a wellhead and
        // not a pipe standing up out of the dirt.
        addBox(L, { x: WELL.x, y: WELL_H - 0.3, z: WELL.z, w: 0.42, h: 0.3, d: 0.42 }, yaw);
        L.detail += line([WELL.x - 0.55, WELL.h + 0.85, WELL.z],
                         [WELL.x + 0.55, WELL.h + 0.85, WELL.z], yaw);
        L.detail += line([WELL.x, WELL.h + 0.85, WELL.z - 0.55],
                         [WELL.x, WELL.h + 0.85, WELL.z + 0.55], yaw);
        L.detail += ringY(WELL.x, WELL.h + 0.02, WELL.z, 0.5, yaw, 10);
        // Handwheels on the wing valves.
        L.detail += ringY(WELL.x - 0.62, WELL.h + 0.85, WELL.z, 0.2, yaw, 8);
        L.detail += ringY(WELL.x + 0.62, WELL.h + 0.85, WELL.z, 0.2, yaw, 8);

        // Guard rail: four posts and a top rail.
        var r = 1.9, ry = 1.05;
        var corner = [[-r, -r], [r, -r], [r, r], [-r, r]];
        corner.forEach(function (c) {
            L.back += line([WELL.x + c[0], 0, WELL.z + c[1]],
                           [WELL.x + c[0], ry, WELL.z + c[1]], yaw);
        });
        for (var k = 0; k < 4; k++) {
            var a = corner[k], b = corner[(k + 1) % 4];
            L.back += line([WELL.x + a[0], ry, WELL.z + a[1]],
                           [WELL.x + b[0], ry, WELL.z + b[1]], yaw);
        }
    }

    /* Separator: a horizontal vessel on a skid, dished ends, nozzles, a level
       gauge, a relief riser and the instrument cabinet beside it. */
    function buildSeparator(H, yaw, L) {
        var addBox = H.addBox, ringX = H.ringX, line = H.line, ringY = H.ringY;
        addBox(L, SKID, yaw);
        addBox(L, SEP, yaw);
        var r = SEP.h / 2, cy = SEP.y + r;
        L.detail += ringX(SEP.x - SEP.w / 2 - 0.01, cy, SEP.z, r, yaw, 14);
        L.detail += ringX(SEP.x + SEP.w / 2 + 0.01, cy, SEP.z, r, yaw, 14);
        // Saddles under the vessel.
        [-1.9, 1.9].forEach(function (o) {
            addBox(L, { x: SEP.x + o, y: SKID.h, z: SEP.z, w: 0.34, h: 0.3, d: SEP.d + 0.1 }, yaw);
        });
        // Level gauge on the near flank, and a relief riser off the top.
        L.detail += line([SEP.x + 1.2, SEP.y, SEP.z + SEP.d / 2 + 0.01],
                         [SEP.x + 1.2, SEP.y + SEP.h, SEP.z + SEP.d / 2 + 0.01], yaw);
        L.detail += ringY(SEP.x + 1.2, SEP.y + SEP.h * 0.5, SEP.z + SEP.d / 2 + 0.02, 0.12, yaw, 6);
        addBox(L, { x: SEP.x - 1.6, y: SEP.y + SEP.h, z: SEP.z,
                    w: PIPE * 1.6, h: 1.3, d: PIPE * 1.6 }, yaw);
        // Instrument cabinet on the skid.
        addBox(L, { x: SEP.x + 2.6, y: SKID.h, z: SEP.z + 0.5,
                    w: 0.7, h: 1.1, d: 0.5 }, yaw);
    }

    /* Three tanks, built as real cylinders.

       They used to be BOXES with full elliptical bands drawn over them, which is
       why they read as see-through: ringY draws a whole circle, so the far half
       of every band showed through the near wall, and a box has no back faces to
       cull that would have hidden it. Wireframe, in a drawing where nothing else
       is.

       Now the wall is a ring of vertical quads with the back half culled, so
       there is nothing behind to see, and the bands are drawn as front arcs
       only. The quads are shaded by how squarely each faces the viewer, which is
       what gives a flat-filled cylinder its roundness. */
    var TANK_SEG = 22;

    function tankWall(H, yaw, L, tx) {
        for (var i = 0; i < TANK_SEG; i++) {
            var a = i / TANK_SEG * Math.PI * 2, b = (i + 1) / TANK_SEG * Math.PI * 2;
            /* Wound so the OUTWARD face is the front one. The other way round,
               frontFacing keeps the far half of the cylinder and culls the near
               half — the tank draws its own back wall, which is exactly the
               see-through look this was meant to end. */
            var quad = [
                [tx + Math.cos(a) * TANK_R, TANK_H, TANK_Z + Math.sin(a) * TANK_R],
                [tx + Math.cos(b) * TANK_R, TANK_H, TANK_Z + Math.sin(b) * TANK_R],
                [tx + Math.cos(b) * TANK_R, 0,      TANK_Z + Math.sin(b) * TANK_R],
                [tx + Math.cos(a) * TANK_R, 0,      TANK_Z + Math.sin(a) * TANK_R],
            ];
            if (!H.frontFacing(quad, yaw)) continue;
            /* How square-on this strip is. depthOf is linear, so it reads a
               direction as happily as a point. */
            var m = (a + b) / 2;
            var face = H.depthOf([Math.cos(m), 0, Math.sin(m)], yaw);
            /* Three weights across the visible half, so the wall has a lit
               centre falling off to the edges. Two buckets at 0.55 put most of
               the wall in the DARKEST one, which made a solid cylinder read
               fainter than the box it replaced. */
            L[face > 0.72 ? 'top' : (face > 0.32 ? 'side' : 'end')] += H.poly(quad, yaw);
        }
    }

    /* The near half of a horizontal circle. On a solid cylinder the far half is
       behind the wall and must not be drawn. */
    function bandFront(H, yaw, tx, ty, r) {
        var d = '', open = false;
        for (var i = 0; i <= 40; i++) {
            var t = i / 40 * Math.PI * 2;
            var p = [tx + Math.cos(t) * r, ty, TANK_Z + Math.sin(t) * r];
            if (H.depthOf([Math.cos(t), 0, Math.sin(t)], yaw) <= 0) { open = false; continue; }
            var q = H.project(p, yaw);
            d += (open ? 'L' : 'M') + H.n1(q[0]) + ' ' + H.n1(q[1]);
            open = true;
        }
        return d;
    }

    function buildTanks(H, yaw, L) {
        var ringY = H.ringY, line = H.line;
        TANK_X.forEach(function (tx, i) {
            tankWall(H, yaw, L, tx);
            for (var b = 1; b <= 5; b++) {
                L.detail += bandFront(H, yaw, tx, TANK_H * b / 6, TANK_R + 0.01);
            }
            L.top += ringY(tx, TANK_H + 0.01, TANK_Z, TANK_R, yaw, 22);
            L.detail += ringY(tx, TANK_H + 0.02, TANK_Z, 0.34, yaw, 8);   // thief hatch
            L.detail += line([tx, TANK_H + 0.02, TANK_Z],
                             [tx, TANK_H + 0.55, TANK_Z], yaw);           // vent riser
            // Outlet nozzle at the base, facing the separator side.
            L.detail += line([tx, 0.45, TANK_Z + TANK_R],
                             [tx, 0.45, TANK_Z + TANK_R + 0.5], yaw);
            if (i === 0) {
                for (var s = 1; s < 10; s++) {
                    var sy = TANK_H * s / 10;
                    L.detail += line([tx - TANK_R - 0.55, sy, TANK_Z + TANK_R * 0.55],
                                     [tx - TANK_R - 0.05, sy, TANK_Z + TANK_R * 0.55], yaw);
                }
                L.back += line([tx - TANK_R - 0.55, 0, TANK_Z + TANK_R * 0.55],
                               [tx - TANK_R - 0.55, TANK_H, TANK_Z + TANK_R * 0.55], yaw);
            }
        });
        // Walkway linking the tank tops.
        var wy = TANK_H + 0.12;
        L.detail += line([TANK_X[0], wy, TANK_Z - 0.6], [TANK_X[2], wy, TANK_Z - 0.6], yaw);
        L.detail += line([TANK_X[0], wy, TANK_Z + 0.6], [TANK_X[2], wy, TANK_Z + 0.6], yaw);
    }

    /* The pipework, which is most of what turns a group of boxes into a process:
       well to separator, separator down to the tanks, and the long flare line
       running the length of the pad to the knockout drum. */
    function buildPipes(H, yaw, L) {
        var line = H.line;

        // Wellhead -> separator inlet.
        pipe(H, yaw, L, [WELL.x + 0.5, 1.35, WELL.z], [SEP.x - SEP.w / 2 - 0.1, 1.35, SEP.z]);
        L.detail += line([WELL.x, 1.35, WELL.z], [WELL.x + 0.5, 1.35, WELL.z], yaw);

        // Separator -> tank battery: along, then across, then down.
        var ty = 0.95, tx = TANK_X[0] + 0.4;
        pipe(H, yaw, L, [SEP.x + SEP.w / 2 + 0.1, ty, SEP.z], [tx, ty, SEP.z]);
        pipe(H, yaw, L, [tx, ty, SEP.z], [tx, ty, TANK_Z + TANK_R + 0.4]);

        // The flare line: separator top, the length of the pad, then across to
        // the knockout drum. This is the run the slider reroutes.
        var fy = 2.6, turn = KO.x - 1.6;
        pipe(H, yaw, L, [SEP.x - 1.6, fy, SEP.z], [turn, fy, SEP.z]);
        pipe(H, yaw, L, [turn, fy, SEP.z], [turn, fy, KO.z]);
        pipe(H, yaw, L, [turn, fy, KO.z], [KO.x - KO.w / 2, fy, KO.z]);
        // Pipe supports under the long run, every few metres.
        for (var sx = SEP.x + 1; sx < turn; sx += 5.5) {
            L.back += line([sx, 0, SEP.z], [sx, fy - PIPE, SEP.z], yaw);
        }
    }

    /* The stack. Present in BOTH states — you do not remove a flare, you stop
       feeding it, and it stays for upset conditions. Only the flame at the tip
       differs, and the flame belongs to the scenes, not to this file. */
    function buildFlareStack(H, yaw, L) {
        var addBox = H.addBox, ringY = H.ringY, line = H.line, ringX = H.ringX;
        addBox(L, KO, yaw);
        // Knockout drum reads as a vessel, not a crate.
        L.detail += ringX(KO.x - KO.w / 2 - 0.01, KO.h / 2, KO.z, KO.h / 2 - 0.1, yaw, 12);
        L.detail += ringX(KO.x + KO.w / 2 + 0.01, KO.h / 2, KO.z, KO.h / 2 - 0.1, yaw, 12);

        var s = FLARE_R;
        var col = { x: FLARE.x, y: 0, z: FLARE.z, w: s * 2, h: FLARE_H, d: s * 2 };
        addBox(L, col, yaw, ['top']);
        /* The column's own silhouette. Without this the stack is ten pixels of
           3-6% fill and does not read, which is what made the flame look like
           it was floating unattached above nothing. */
        edges(H, yaw, L, col);
        // Guy wires to three anchors, which is most of what makes it read tall.
        [[-4.2, -2.6], [4.4, -1.8], [0.4, 4.6]].forEach(function (a) {
            L.back += line([FLARE.x, FLARE_H * 0.74, FLARE.z],
                           [FLARE.x + a[0], 0, FLARE.z + a[1]], yaw);
        });
        for (var b = 1; b < 6; b++) {
            L.detail += ringY(FLARE.x, FLARE_H * b / 6, FLARE.z, s + 0.02, yaw, 8);
        }
        L.detail += ringY(FLARE.x, FLARE_H, FLARE.z, s + 0.18, yaw, 10);   // tip flange
        // Climbing ladder up the near face: two stiles and rungs.
        var lx = FLARE.x, lz = FLARE.z + s + 0.16;
        L.detail += line([lx - 0.2, 0.4, lz], [lx - 0.2, FLARE_H - 0.4, lz], yaw);
        L.detail += line([lx + 0.2, 0.4, lz], [lx + 0.2, FLARE_H - 0.4, lz], yaw);
        for (var r = 1; r < 14; r++) {
            var ry = 0.4 + (FLARE_H - 0.8) * r / 14;
            L.detail += line([lx - 0.2, ry, lz], [lx + 0.2, ry, lz], yaw);
        }
        // The riser from the knockout drum up into the stack.
        pipe(H, yaw, L, [KO.x + KO.w / 2, KO.h * 0.6, KO.z], [FLARE.x, KO.h * 0.6, FLARE.z]);
    }

    /* Everything that is in both states, in paint order. */
    function buildShared(H, yaw, L) {
        buildPad(H, yaw, L);
        buildBerm(H, yaw, L);
        buildWell(H, yaw, L);
        buildSeparator(H, yaw, L);
        buildTanks(H, yaw, L);
        buildPipes(H, yaw, L);
        buildFlareStack(H, yaw, L);
    }

    return {
        MODEL: MODEL, PAD: PAD, ROAD: ROAD, WELL: WELL, WELL_H: WELL_H, SEP: SEP, SKID: SKID,
        TANK_R: TANK_R, TANK_H: TANK_H, TANK_Z: TANK_Z, TANK_X: TANK_X, BERM: BERM, BERM_H: BERM_H,
        FLARE: FLARE, FLARE_H: FLARE_H, FLARE_R: FLARE_R, KO: KO, PIPE: PIPE, TIP: TIP,
        tankBoxes: tankBoxes, pipe: pipe, edges: edges,
        buildPad: buildPad, buildBerm: buildBerm, buildWell: buildWell,
        buildSeparator: buildSeparator, buildTanks: buildTanks, buildPipes: buildPipes,
        buildFlareStack: buildFlareStack, buildShared: buildShared,
    };
});
