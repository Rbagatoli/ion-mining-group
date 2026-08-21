/* ===== ION MINING GROUP — One machine, an Antminer S21 Pro =====
   The far end of the hosting page's detail slider.

   Proportioned from Bitmain's own figure: 450 x 219 x 293 mm, length being the
   air path. Scene units are 100 mm, so the chassis is 4.50 x 2.19 x 2.93. That
   is NOT the S19-era 400 x 195 x 290 shell that many reseller pages still quote
   for this machine: the S21 Pro is a genuinely bigger box, and it takes 140 mm
   fans where the S19 and the standard S21 take 120 mm. Bitmain does not say why
   the length grew, so this claims only the measurements, not a reason. It
   shares its shell with the S21+ and the S21 XP.

   The things that make it recognisable, in rough order of how much they matter:

     - FOUR fans, not two: a pair stacked vertically at each end, 140 mm square,
       in a black module standing proud of the chassis.
     - The guard is a dozen concentric rings with a saltire laid over them. It
       is the machine's clearest visual signature.
     - The supply is INSIDE, in a full-height column beside the fan module at
       the intake end, not a brick alongside. Its end panel carries three small
       fans in a vertical line with the AC inlet below them.
     - The hashboards are buried under finned heatsinks. You never see a chip on
       an assembled machine, so this draws fin combs and screw dots rather than
       a grid of chip squares.
     - Copper busbars over the boards, and a controller strip on the top deck
       facing the intake end.

   Deliberately NOT drawn, because the research could not source them: any chip
   count (sources conflict, 195 against 273), blade counts, the PSU fan size,
   the exact bezel split of the end face, or the case alloy.

   Geometry only. All machinery lives in diagram-engine.js; builders receive its
   helper bundle as H rather than reaching for globals. */

(function (root, factory) {
    var engine = (typeof module !== 'undefined' && module.exports)
        ? require('./diagram-engine.js') : root.DiagramEngine;
    var api = factory(engine);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        root.AsicDiagram = api;
        // Namespaced: the container diagram is already mounted on this page
        // under the bare ids. Linked: the two are views of one thing.
        api.mountWhenReady({ scene: 'asic' });
    }
})(typeof self !== 'undefined' ? self : this, function (engine) {
    'use strict';

    /* ---------- The machine, in units of 100 mm ---------- */

    var CH = { x: 0, y: 0, z: 0, w: 4.50, h: 2.93, d: 2.19 };
    var X0 = CH.x - CH.w / 2, X1 = CH.x + CH.w / 2;
    var Z0 = CH.z - CH.d / 2, Z1 = CH.z + CH.d / 2;

    /* The end face is split lengthwise: the fan module takes most of it, and a
       narrower full-height column beside it belongs to the supply. The split is
       photo impression rather than a sourced figure, so it stays approximate. */
    var PSU_W = 0.79;                        // 219 - 140: what the fan leaves
    var PSU_Z = Z0 + PSU_W / 2;              // the supply column, on the far side
    var BAY_Z0 = Z0 + PSU_W;                 // the hashboard bay starts here
    var BAY_W = CH.d - PSU_W;
    var BAY_Z = BAY_Z0 + BAY_W / 2;

    var FAN = { size: 1.40, r: 0.62, jut: 0.38 };
    var FAN_Y = [0.065 + FAN.size / 2, 0.065 + FAN.size * 1.5];   // two, stacked

    /* Three boards on edge inside the bay, air driven along their length. */
    var BOARD = { w: 3.80, y: 0.18, h: 2.54, d: 0.10 };
    var BOARD_Z = [0, 1, 2].map(function (i) { return BAY_Z0 + BAY_W * (i + 0.5) / 3; });
    var NEAR_Z = BOARD_Z[2];
    var FIN_Z = NEAR_Z + BOARD.d / 2 + 0.05;

    var CTRL = { x: X0 + 0.85, y: CH.h, z: BAY_Z, w: 1.70, h: 0.18, d: BAY_W };
    var BUS_Y = CH.h - 0.16;

    var MODEL = { chassis: CH, fan: FAN, fanY: FAN_Y, board: BOARD, boardZ: BOARD_Z,
                  ctrl: CTRL, psuW: PSU_W, psuZ: PSU_Z, bayZ: BAY_Z, bayW: BAY_W,
                  mm: { length: 450, width: 219, height: 293, fan: 140 } };

    function boards() {
        return BOARD_Z.map(function (bz) {
            return { x: CH.x, y: BOARD.y, z: bz, w: BOARD.w, h: BOARD.h, d: BOARD.d };
        });
    }
    var BOARDS = boards();

    function fanModule(end) {   // end is -1 at the intake, +1 at the exhaust
        var face = end < 0 ? X0 : X1;
        return { x: face + end * FAN.jut / 2, y: 0, z: BAY_Z,
                 w: FAN.jut, h: CH.h, d: BAY_W, face: face, out: face + end * FAN.jut };
    }
    var FANA = fanModule(-1), FANB = fanModule(1);
    var PSUBOX = { x: CH.x, y: 0, z: PSU_Z, w: CH.w, h: CH.h, d: PSU_W };

    /* ---------- Callouts. id doubles as the hover region id. ---------- */

    var CALLOUTS = [
        { id: 'fans',   side: 'l', y: 90,  title: 'Four 140 mm fans',
          desc: 'Two stacked at each end: cold air in one face, hot out the other',
          at: [FANA.out, FAN_Y[1], BAY_Z] },
        { id: 'boards', side: 'l', y: 235, title: 'Three hashboards',
          desc: 'Standing on edge, with the air driven along their length',
          at: [-1.10, BOARD.y + BOARD.h, FIN_Z] },
        { id: 'heat',   side: 'l', y: 380, title: 'Finned heatsinks',
          desc: 'The chips sit underneath; on an assembled machine you never see one',
          at: [0.70, BOARD.y + BOARD.h * 0.45, FIN_Z] },
        { id: 'psu',    side: 'r', y: 90,  title: 'Integrated supply',
          desc: 'The APW17 lives inside the chassis, not in a brick beside it',
          at: [X0, 1.60, PSU_Z] },
        { id: 'ctrl',   side: 'r', y: 235, title: 'Control board',
          desc: 'Ethernet, reset and IP report, on a strip facing the intake',
          at: [CTRL.x, CTRL.y + CTRL.h, CTRL.z] },
        { id: 'bus',    side: 'r', y: 380, title: 'Copper busbars',
          desc: 'The bolted DC feed from the supply into each board',
          at: [0.10, BUS_Y + 0.08, BAY_Z] },
    ];

    /* ---------- Shared bits ---------- */

    /* The guard: concentric rings with a saltire over them. Not radial spokes,
       not a spiral — this pattern is what makes the machine recognisable. */
    function guard(L, H, fx, fy, fz, r, yaw, rings) {
        for (var i = 1; i <= rings; i++) {
            L.detail += H.ringX(fx, fy, fz, r * i / rings, yaw, 18);
        }
        var s = r * 0.7071;
        L.detail += H.line([fx, fy - s, fz - s], [fx, fy + s, fz + s], yaw);
        L.detail += H.line([fx, fy - s, fz + s], [fx, fy + s, fz - s], yaw);
    }

    /* A hot-surface warning label, drawn as an outline: this palette has one
       accent colour and it is not yellow. */
    function warnMark(L, H, x, y, z, s, yaw) {
        L.detail += H.line([x, y - s, z - s], [x, y - s, z + s], yaw);
        L.detail += H.line([x, y - s, z + s], [x, y + s, z], yaw);
        L.detail += H.line([x, y + s, z], [x, y - s, z - s], yaw);
    }

    /* ---------- The body ---------- */

    function buildBody(H, yaw) {
        var addBox = H.addBox, line = H.line, ring = H.ring, ringY = H.ringY,
            poly = H.poly, polyInside = H.polyInside, boxFaces = H.boxFaces,
            frontFacing = H.frontFacing, newLayers = H.newLayers;

        var L = newLayers();
        var y1 = CH.h, i, j, k, f;

        /* Interior, seen through the cutaway on the near long side. Outward
           wound, so every one goes through polyInside or their screen winding
           flips as the scene turns and they cancel under fill-rule:nonzero. */
        L.inside += polyInside([[X0,0,Z0],[X1,0,Z0],[X1,0,Z1],[X0,0,Z1]], yaw);        // floor
        L.inside += polyInside([[X0,0,Z0],[X0,y1,Z0],[X1,y1,Z0],[X1,0,Z0]], yaw);      // far wall
        L.inside += polyInside([[X0,0,Z0],[X0,0,Z1],[X0,y1,Z1],[X0,y1,Z0]], yaw);      // intake end
        L.inside += polyInside([[X1,0,Z1],[X1,0,Z0],[X1,y1,Z0],[X1,y1,Z1]], yaw);      // exhaust end
        L.inside += polyInside([[X0,y1,Z0],[X0,y1,Z1],[X1,y1,Z1],[X1,y1,Z0]], yaw);    // roof underside

        /* --- behind the boards --- */
        // The supply bay, walled off from the air path.
        L.back += line([X0, 0, BAY_Z0], [X1, 0, BAY_Z0], yaw);
        L.back += line([X0, y1, BAY_Z0], [X1, y1, BAY_Z0], yaw);
        L.back += line([X0, 0, BAY_Z0], [X0, y1, BAY_Z0], yaw);
        L.back += line([X1, 0, BAY_Z0], [X1, y1, BAY_Z0], yaw);
        // The APW17's perforated skin showing through the far side wall.
        for (i = 0; i < 9; i++) {
            for (j = 0; j < 5; j++) {
                var px = X0 + 0.5 + i * 0.34, py = 0.5 + j * 0.45 + (i % 2) * 0.2;
                L.back += ring(px, py, Z0 + 0.012, 0.05, yaw, 6);
            }
        }
        // The two far boards, drawn before the near one so it reads as nearest.
        for (i = 0; i < 2; i++) {
            f = boxFaces(BOARDS[i]);
            for (k in f) if (frontFacing(f[k], yaw)) L.back += poly(f[k], yaw);
        }

        /* --- the near board: fins, not chips --- */
        f = boxFaces(BOARDS[2]);
        for (k in f) if (frontFacing(f[k], yaw)) L.asics += poly(f[k], yaw);

        // Fin combs run lengthwise, along the airflow.
        var fy0 = BOARD.y + 0.14, fy1 = BOARD.y + BOARD.h - 0.14, fins = 24;
        for (i = 0; i <= fins; i++) {
            var fy = fy0 + (fy1 - fy0) * i / fins;
            L.detail += line([-BOARD.w / 2 + 0.06, fy, FIN_Z], [BOARD.w / 2 - 0.06, fy, FIN_Z], yaw);
        }
        // The fin field is clamped down in a regular grid of screws.
        for (i = 0; i < 8; i++) {
            for (j = 0; j < 4; j++) {
                var sx = -BOARD.w / 2 + BOARD.w * (i + 0.5) / 8;
                var sy = BOARD.y + BOARD.h * (j + 0.5) / 4;
                L.detail += ring(sx, sy, FIN_Z + 0.02, 0.045, yaw, 6);
            }
        }
        // A strip of bare board along the bottom edge, with its capacitors.
        L.detail += line([-BOARD.w / 2 + 0.06, BOARD.y + 0.09, FIN_Z],
                         [BOARD.w / 2 - 0.06, BOARD.y + 0.09, FIN_Z], yaw);
        for (i = 0; i < 12; i++) {
            var cx = -BOARD.w / 2 + BOARD.w * (i + 0.5) / 12;
            L.detail += ring(cx, BOARD.y + 0.045, FIN_Z, 0.03, yaw, 5);
        }

        /* --- copper busbars over the stack --- */
        for (i = 0; i < 2; i++) {
            var bx = CH.x + (i ? 0.10 : -0.30);
            addBox(L, { x: bx, y: BUS_Y, z: BAY_Z, w: 0.16, h: 0.07, d: BAY_W - 0.2 }, yaw);
            for (j = 0; j < 3; j++) {          // bolted terminals, one per board
                L.detail += ringY(bx, BUS_Y + 0.075, BOARD_Z[j], 0.05, yaw, 6);
            }
        }

        /* --- controller deck on top, and the strip facing the intake --- */
        addBox(L, CTRL, yaw);
        var pf = CTRL.x - CTRL.w / 2 - 0.006;          // the face it looks out of
        var py2 = CTRL.y + CTRL.h / 2;
        // RJ45, the tallest thing on the strip.
        addBox(L, { x: pf, y: CTRL.y + 0.035, z: 0.15, w: 0.02, h: 0.11, d: 0.16 }, yaw);
        // Micro USB, then the two buttons.
        L.detail += line([pf, py2, -0.62], [pf, py2, -0.50], yaw);
        L.detail += ring(pf, py2, -0.34, 0.035, yaw, 6);
        L.detail += ring(pf, py2, -0.16, 0.035, yaw, 6);
        // Fault over Normal, stacked rather than side by side.
        L.detail += ring(pf, CTRL.y + 0.125, 0.62, 0.028, yaw, 6);
        L.detail += ring(pf, CTRL.y + 0.055, 0.62, 0.028, yaw, 6);
        // A screw at each end of the bezel.
        L.detail += ring(pf, py2, Z0 + 0.08, 0.025, yaw, 5);
        L.detail += ring(pf, py2, Z1 - 0.08, 0.025, yaw, 5);

        // Three ribbons from the controller down into the three board slots,
        // and the sleeved DC harness leaving the strip.
        for (i = 0; i < 3; i++) {
            L.detail += line([CTRL.x + CTRL.w / 2 - 0.1, CTRL.y, BOARD_Z[i]],
                             [CTRL.x + CTRL.w / 2 + 0.35, BOARD.y + BOARD.h, BOARD_Z[i]], yaw);
        }
        for (i = 0; i < 3; i++) {
            L.detail += line([pf, py2 - 0.02 + i * 0.02, 0.86],
                             [X0 + 0.55, CH.h - 0.55 - i * 0.06, Z1 - 0.02], yaw);
        }

        /* --- the shell. The near long face is the cutaway, so it is skipped. --- */
        addBox(L, CH, yaw, ['front']);

        // Two upper covers meeting on a lengthwise seam, and the ribbed
        // extruded section ahead of the controller deck.
        L.detail += line([CTRL.x + CTRL.w / 2, y1 + 0.006, CH.z], [X1, y1 + 0.006, CH.z], yaw);
        for (i = 0; i < 4; i++) {
            var rz = Z0 + CH.d * (i + 1) / 5;
            L.detail += line([X0 + 0.1, y1 + 0.006, rz], [CTRL.x - CTRL.w / 2, y1 + 0.006, rz], yaw);
        }
        [[-0.35, Z0 + 0.18], [-0.35, Z1 - 0.18], [1.95, Z0 + 0.18], [1.95, Z1 - 0.18]]
            .forEach(function (s) {
                L.detail += ringY(s[0], y1 + 0.008, s[1], 0.045, yaw, 5);   // cover screws
            });
        // Serial label, high on the far side.
        L.detail += line([0.6, y1 - 0.28, Z0 - 0.006], [1.5, y1 - 0.28, Z0 - 0.006], yaw);
        L.detail += line([0.6, y1 - 0.5, Z0 - 0.006], [1.5, y1 - 0.5, Z0 - 0.006], yaw);
        L.detail += line([0.6, y1 - 0.28, Z0 - 0.006], [0.6, y1 - 0.5, Z0 - 0.006], yaw);
        L.detail += line([1.5, y1 - 0.28, Z0 - 0.006], [1.5, y1 - 0.5, Z0 - 0.006], yaw);

        return L;
    }

    /* ---------- A fan module. Its own object, so the depth sort can put the
                  near one in front of the body as the machine turns. ---------- */

    function makeFanBuilder(M, withPsu, end) {
        return function (H, yaw) {
            var addBox = H.addBox, line = H.line, ring = H.ring, newLayers = H.newLayers;
            var L = newLayers();
            var fx = M.out, i;

            var box = { x: M.x, y: M.y, z: M.z, w: M.w, h: M.h, d: M.d };
            addBox(L, box, yaw);

            /* Everything below is detail, which paints last and would otherwise
               show straight through the module from behind. It only exists on
               the outward face, so draw it only when that face is visible. */
            var faces = H.boxFaces(box);
            if (!H.frontFacing(end < 0 ? faces.left : faces.right, yaw)) return L;

            for (i = 0; i < 2; i++) {
                var fy = FAN_Y[i];
                guard(L, H, fx + 0.008, fy, M.z, FAN.r, yaw, 11);
                // The impeller behind it: a hub disc and a few swept blades.
                L.detail += H.ringX(fx - 0.05, fy, M.z, FAN.r * 0.30, yaw, 10);
                for (var b = 0; b < 7; b++) {
                    var t = b / 7 * Math.PI * 2;
                    L.detail += line([fx - 0.05, fy + Math.sin(t) * FAN.r * 0.32,
                                              M.z + Math.cos(t) * FAN.r * 0.32],
                                     [fx - 0.05, fy + Math.sin(t + 0.75) * FAN.r * 0.86,
                                              M.z + Math.cos(t + 0.75) * FAN.r * 0.86], yaw);
                }
                // Frame outline, corner bumpers, and the hot-surface label.
                var hs = FAN.size / 2;
                L.detail += line([fx, fy - hs, M.z - hs], [fx, fy - hs, M.z + hs], yaw);
                L.detail += line([fx, fy + hs, M.z - hs], [fx, fy + hs, M.z + hs], yaw);
                L.detail += line([fx, fy - hs, M.z - hs], [fx, fy + hs, M.z - hs], yaw);
                L.detail += line([fx, fy - hs, M.z + hs], [fx, fy + hs, M.z + hs], yaw);
                [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(function (c) {
                    L.detail += H.ringX(fx + 0.02, fy + c[0] * (hs - 0.09),
                                        M.z + c[1] * (hs - 0.09), 0.06, yaw, 6);
                });
                warnMark(L, H, fx + 0.004, fy - hs + 0.17, M.z + hs - 0.17, 0.09, yaw);
            }

            /* The supply's end panel shares this face at the intake end: three
               small fans in a column with the AC inlet below them. */
            if (withPsu) {
                var px = M.face - 0.008;
                for (i = 0; i < 3; i++) {
                    var sy = 0.90 + i * 0.70;
                    guard(L, H, px, sy, PSU_Z, 0.26, yaw, 5);
                    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(function (c) {
                        L.detail += H.ringX(px, sy + c[0] * 0.30, PSU_Z + c[1] * 0.28, 0.03, yaw, 5);
                    });
                }
                // Recessed AC inlet, and a line of vent perforations above.
                addBox(L, { x: M.face - 0.06, y: 0.22, z: PSU_Z, w: 0.06, h: 0.30, d: 0.34 }, yaw);
                L.detail += ring(px, 0.37, PSU_Z - 0.09, 0.035, yaw, 5);
                L.detail += ring(px, 0.37, PSU_Z + 0.09, 0.035, yaw, 5);
                for (i = 0; i < 7; i++) {
                    L.detail += ring(px, CH.h - 0.13, Z0 + 0.09 + i * 0.085, 0.025, yaw, 5);
                }
            }
            return L;
        };
    }

    function regionBoxes(id) {
        var mod = function (M) { return { x: M.x, y: M.y, z: M.z, w: M.w, h: M.h, d: M.d }; };
        switch (id) {
            case 'fans':   return [mod(FANA), mod(FANB)];
            case 'boards': return BOARDS;
            case 'heat':   return [{ x: CH.x, y: BOARD.y, z: NEAR_Z, w: BOARD.w, h: BOARD.h, d: 0.22 }];
            case 'psu':    return [PSUBOX];
            case 'ctrl':   return [CTRL];
            case 'bus':    return [
                { x: CH.x - 0.30, y: BUS_Y, z: BAY_Z, w: 0.16, h: 0.07, d: BAY_W - 0.2 },
                { x: CH.x + 0.10, y: BUS_Y, z: BAY_Z, w: 0.16, h: 0.07, d: BAY_W - 0.2 }];
        }
        return [];
    }

    /* The air path: in at one end, along the boards, out at the other. The same
       single orange run the container scene uses, one machine down. */
    function buildFlow(H, yaw) {
        var project = H.project, n1 = H.n1;
        var mid = (FAN_Y[0] + FAN_Y[1]) / 2;
        /* Two runs, one off each end. The bay between them is solid with
           boards and dg-flow paints BEFORE every slot, so a line through the
           middle would be buried under the very thing it describes. */
        var runs = [
            [[FANA.out - 0.80, mid, BAY_Z], [FANA.out - 0.06, mid, BAY_Z]],
            [[FANB.out + 0.06, mid, BAY_Z], [FANB.out + 0.80, mid, BAY_Z]],
        ];
        var d = '';
        runs.forEach(function (r) {
            r.forEach(function (p, i) {
                var q = project(p, yaw);
                d += (i ? 'L' : 'M') + n1(q[0]) + ' ' + n1(q[1]);
            });
        });
        return d;
    }

    var RENDERABLES = [
        { id: 'body', at: [CH.x, CH.h / 2, CH.z], build: buildBody },
        { id: 'fanA', at: [FANA.x, CH.h / 2, FANA.z], build: makeFanBuilder(FANA, true, -1) },
        { id: 'fanB', at: [FANB.x, CH.h / 2, FANB.z], build: makeFanBuilder(FANB, false, 1) },
    ];

    function objects() {
        return [
            { id: 'body', box: { x: CH.x, y: 0, z: CH.z,
                                 w: CH.w + 0.2, h: CH.h + 0.3, d: CH.d + 0.2 } },
            { id: 'fanA', box: { x: FANA.x, y: 0, z: FANA.z, w: FAN.jut, h: CH.h, d: BAY_W } },
            { id: 'fanB', box: { x: FANB.x, y: 0, z: FANB.z, w: FAN.jut, h: CH.h, d: BAY_W } },
        ];
    }

    var SCENE = {
        view: {
            VB: { w: 1280, h: 470 },       // identical to the container scene
            BASE_PITCH: 20 * Math.PI / 180,
            // Square-on, the end face is edge-on and the fans vanish. This is
            // the angle every photograph of the machine is taken from.
            BASE_YAW: 42 * Math.PI / 180,
            FOV: 1500,
            BASE_SCALE: 90,
            ORIGIN: { x: 640, y: 346 },
            SHIFT_X: 0,
            PERIOD: 44000,
        },
        renderables: RENDERABLES,
        callouts: CALLOUTS,
        flow: buildFlow,
        regionBoxes: regionBoxes,
        objects: objects,
        extraBoxes: function () { return BOARDS.concat([CTRL, PSUBOX]); },
        data: { MODEL: MODEL, BOARDS: BOARDS, FANA: FANA, FANB: FANB },
    };

    return engine.createDiagram(SCENE);
});
