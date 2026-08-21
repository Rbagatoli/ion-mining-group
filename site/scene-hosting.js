/* ===== ION MINING GROUP — Hosting page scene =====
   Inside one hosted container, seen close: the customer's machines racked
   against the far wall, with the things hosting actually provides called out —
   filtered intake, cold aisle, metered PDU, network, telemetry, spares, and the
   hot aisle leaving the far end.

   Deliberately narrower than the home page scene. A hosting customer does not
   care about the gas skid; and because there is only one container here and
   fewer columns in it, each machine draws at roughly double the size it does on
   the home page — enough for the fan pair, control strip and status LED to read.

   Geometry only. All machinery lives in diagram-engine.js; builders receive its
   helper bundle as H rather than reaching for globals. */

(function (root, factory) {
    var engine = (typeof module !== 'undefined' && module.exports)
        ? require('./diagram-engine.js') : root.DiagramEngine;
    var api = factory(engine);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        root.ContainerDiagram = api;
        // The hosting page carries a second diagram (one machine) beside this
        // one, so target this wrapper by name rather than taking the first
        // .dg-wrap in the document.
        // Used twice: the far end of the home page's slider, and the near end
        // of the hosting page's. The page decides which.
        api.mountWhenReady({ scene: 'hosting' });
    }
})(typeof self !== 'undefined' ? self : this, function (engine) {
    'use strict';

    /* ---------- Scene, in metres ---------- */

    var C = { x: 0, y: 0, z: 0, w: 12.19, h: 2.59, d: 2.44 };   // one 40ft shell

    var COLS = 7, TIERS = 3;
    var AS = { w: 1.05, h: 0.54, d: 0.86 };   // drawn generously; legibility beats census

    var RACK_Z = C.z - C.d / 2 + 0.72;        // against the far wall
    var TIER_DY = AS.h + 0.22;
    var RACK_Y0 = 0.26;

    var SPAN = C.w - 3.4;                     // clear of the intake and door plenums
    var PITCH_X = SPAN / COLS;
    var RACK_X0 = C.x - C.w / 2 + 2.0;

    var PDU = { x: C.x + C.w / 2 - 1.5, y: 0, z: C.z + C.d / 2 - 0.55, w: 0.62, h: 1.9, d: 0.42 };
    var SWITCH = { x: C.x + C.w / 2 - 2.6, y: 1.55, z: C.z + C.d / 2 - 0.5, w: 0.5, h: 0.34, d: 0.34 };
    var SPARES = { x: C.x - C.w / 2 + 1.0, y: 0, z: C.z + C.d / 2 - 0.6, w: 0.8, h: 1.3, d: 0.5 };

    function racks() {
        var out = [];
        for (var t = 0; t < TIERS; t++)
            for (var c = 0; c < COLS; c++)
                out.push({ x: RACK_X0 + PITCH_X * (c + 0.5), y: RACK_Y0 + t * TIER_DY,
                           z: RACK_Z, w: AS.w, h: AS.h, d: AS.d, tier: t, col: c, cont: C });
        return out;
    }
    var RACKS = racks();

    var MODEL = { container: C, pdu: PDU, sw: SWITCH, spares: SPARES,
                  cols: COLS, tiers: TIERS, asic: AS };

    /* ---------- Callouts. id doubles as the hover region id. ---------- */

    var CALLOUTS = [
        { id: 'intake', side: 'l', y: 60,  title: 'Filtered intake',
          desc: 'Outside air drawn through filter banks at this end',
          at: [C.x - C.w / 2 - 0.1, C.h * 0.62, C.z] },
        { id: 'cold',   side: 'l', y: 160, title: 'Cold aisle',
          desc: 'Conditioned air along the face of every machine',
          at: [C.x - 2.2, 0.5, C.z + C.d / 2 - 0.9] },
        { id: 'spares', side: 'l', y: 260, title: 'On-site spares',
          desc: 'Hashboards, PSUs and fans held at the site',
          at: [SPARES.x, SPARES.h, SPARES.z] },
        { id: 'shell',  side: 'l', y: 360, title: 'Retrofitted shell',
          desc: 'A 40 ft container rebuilt for power, cooling and racking',
          at: [C.x - 3.2, C.h, C.z - C.d / 4] },
        { id: 'asics',  side: 'r', y: 60,  title: 'Your machines',
          desc: 'Racked, asset-tagged, and pointed at your own pool',
          at: [C.x - 0.4, RACK_Y0 + 2 * TIER_DY + AS.h, RACK_Z + AS.d / 2] },
        { id: 'pdu',    side: 'r', y: 160, title: 'Metered at the PDU',
          desc: 'Billed on the power you actually draw, not nameplate',
          at: [PDU.x, PDU.h, PDU.z + PDU.d / 2] },
        { id: 'net',    side: 'r', y: 260, title: 'Network',
          desc: 'Redundant uplink; your pool endpoints open by default',
          at: [SWITCH.x, SWITCH.y + SWITCH.h, SWITCH.z + SWITCH.d / 2] },
        { id: 'hot',    side: 'r', y: 360, title: 'Hot aisle',
          desc: 'Heat collected behind the racks and pushed out the far end',
          at: [C.x + C.w / 2 + 0.1, C.h * 0.55, C.z] },
    ];

    /* ---------- The container ---------- */

    function buildShell(H, yaw) {
        var addBox = H.addBox, line = H.line, ring = H.ring,
            poly = H.poly, polyInside = H.polyInside, boxFaces = H.boxFaces,
            frontFacing = H.frontFacing, newLayers = H.newLayers;

        var L = newLayers();
        var x0 = C.x - C.w / 2, x1 = C.x + C.w / 2;
        var z0 = C.z - C.d / 2, z1 = C.z + C.d / 2;
        var y1 = C.h;

        // Interior, seen through the cutaway. Every one of these goes through
        // polyInside: they are outward-wound, so their screen winding flips as
        // the scene turns, and mixed winding under fill-rule:nonzero cancels
        // and punches a hole.
        L.inside += polyInside([[x0,0,z0],[x1,0,z0],[x1,0,z1],[x0,0,z1]], yaw);
        L.inside += polyInside([[x0,0,z0],[x0,y1,z0],[x1,y1,z0],[x1,0,z0]], yaw);
        L.inside += polyInside([[x0,0,z0],[x0,0,z1],[x0,y1,z1],[x0,y1,z0]], yaw);
        L.inside += polyInside([[x1,0,z1],[x1,0,z0],[x1,y1,z0],[x1,y1,z1]], yaw);

        // --- everything from here to the machines paints BEHIND them ---
        var ribs = 30;
        for (var r = 1; r < ribs; r++) {
            var rx = x0 + C.w * r / ribs;
            L.back += line([rx, 0.09, z0 + 0.012], [rx, y1 - 0.09, z0 + 0.012], yaw);
        }
        for (var g = 1; g < 30; g++) {
            var gx = x0 + C.w * g / 30;
            L.back += line([gx, 0.012, z0 + 0.1], [gx, 0.012, z1 - 0.1], yaw);
        }
        // Rack frame: uprights and a shelf rail per tier.
        for (var c = 0; c <= COLS; c++) {
            var ux = RACK_X0 + PITCH_X * c;
            L.back += line([ux, 0, RACK_Z - AS.d / 2],
                           [ux, RACK_Y0 + TIERS * TIER_DY, RACK_Z - AS.d / 2], yaw);
        }
        for (var t = 0; t <= TIERS; t++) {
            var sy = RACK_Y0 + t * TIER_DY - 0.06;
            L.back += line([RACK_X0, sy, RACK_Z - AS.d / 2],
                           [RACK_X0 + SPAN, sy, RACK_Z - AS.d / 2], yaw);
        }

        // --- machines ---
        for (var i = 0; i < RACKS.length; i++) {
            var u = RACKS[i], f = boxFaces(u);
            for (var k in f) if (frontFacing(f[k], yaw)) L.asics += poly(f[k], yaw);

            // At this scale the S21 detail actually reads: twin fans with a
            // grille ring, the control strip, and the status LED.
            var fz = u.z + u.d / 2 + 0.008, cy = u.y + u.h / 2;
            var rr = Math.min(u.h, u.w / 2) * 0.40;
            L.detail += ring(u.x - u.w * 0.235, cy, fz, rr, yaw, 10);
            L.detail += ring(u.x - u.w * 0.235, cy, fz, rr * 0.5, yaw, 8);
            L.detail += ring(u.x + u.w * 0.235, cy, fz, rr, yaw, 10);
            L.detail += ring(u.x + u.w * 0.235, cy, fz, rr * 0.5, yaw, 8);
            L.detail += line([u.x - u.w * 0.44, u.y + u.h - 0.08, fz],
                             [u.x - u.w * 0.08, u.y + u.h - 0.08, fz], yaw);
            L.detail += ring(u.x + u.w * 0.42, u.y + u.h - 0.08, fz, 0.035, yaw, 6);
            // Power and network tails at the back.
            L.detail += line([u.x + u.w * 0.3, u.y + 0.06, u.z - u.d / 2 - 0.006],
                             [u.x + u.w * 0.3, u.y - 0.14, u.z - u.d / 2 - 0.006], yaw);
        }

        // --- in front of the machines ---
        // Cable tray under the ceiling, with drops to each rack column.
        addBox(L, { x: C.x, y: y1 - 0.3, z: z0 + 0.5, w: C.w - 1.0, h: 0.1, d: 0.3 }, yaw);
        for (var d2 = 0; d2 < COLS; d2++) {
            var dx = RACK_X0 + PITCH_X * (d2 + 0.5);
            L.detail += line([dx, y1 - 0.3, z0 + 0.5],
                             [dx, RACK_Y0 + TIERS * TIER_DY, z0 + 0.5], yaw);
        }

        // PDU: breaker rows and a metering window.
        addBox(L, PDU, yaw);
        var pz = PDU.z + PDU.d / 2 + 0.006;
        for (var p = 1; p <= 6; p++) {
            L.detail += line([PDU.x - 0.24, PDU.h * p / 8, pz], [PDU.x + 0.24, PDU.h * p / 8, pz], yaw);
        }
        L.detail += line([PDU.x - 0.2, PDU.h * 0.86, pz], [PDU.x + 0.2, PDU.h * 0.86, pz], yaw);
        L.detail += line([PDU.x - 0.2, PDU.h * 0.94, pz], [PDU.x + 0.2, PDU.h * 0.94, pz], yaw);
        L.detail += line([PDU.x - 0.2, PDU.h * 0.86, pz], [PDU.x - 0.2, PDU.h * 0.94, pz], yaw);
        L.detail += line([PDU.x + 0.2, PDU.h * 0.86, pz], [PDU.x + 0.2, PDU.h * 0.94, pz], yaw);

        // Network switch with port row, and its drop to the tray.
        addBox(L, SWITCH, yaw);
        var sz = SWITCH.z + SWITCH.d / 2 + 0.006;
        for (var s2 = 0; s2 < 8; s2++) {
            var sx = SWITCH.x - 0.2 + 0.4 * s2 / 7;
            L.detail += line([sx, SWITCH.y + 0.1, sz], [sx, SWITCH.y + 0.2, sz], yaw);
        }
        L.detail += line([SWITCH.x, SWITCH.y + SWITCH.h, sz], [SWITCH.x, y1 - 0.3, sz], yaw);

        // Spares rack: three shelves of boards and PSUs.
        addBox(L, SPARES, yaw);
        var qz = SPARES.z + SPARES.d / 2 + 0.006;
        for (var q = 1; q <= 3; q++) {
            var qy = SPARES.h * q / 4;
            L.detail += line([SPARES.x - 0.34, qy, qz], [SPARES.x + 0.34, qy, qz], yaw);
            L.detail += line([SPARES.x - 0.16, qy, qz], [SPARES.x - 0.16, qy + 0.2, qz], yaw);
            L.detail += line([SPARES.x + 0.16, qy, qz], [SPARES.x + 0.16, qy + 0.2, qz], yaw);
        }

        // Roof: only the far half survives the cutaway.
        var roof = [[x0,y1,z0],[x0,y1,C.z],[x1,y1,C.z],[x1,y1,z0]];
        if (frontFacing(roof, yaw)) L.top += poly(roof, yaw);
        for (var r2 = 1; r2 < ribs; r2++) {
            var rx2 = x0 + C.w * r2 / ribs;
            L.detail += line([rx2, y1 + 0.006, z0], [rx2, y1 + 0.006, C.z], yaw);
        }

        // Exterior end walls, corner castings, base rail.
        addBox(L, { x: x0 - 0.05, y: 0, z: C.z, w: 0.1, h: C.h, d: C.d }, yaw, ['right']);
        addBox(L, { x: x1 + 0.05, y: 0, z: C.z, w: 0.1, h: C.h, d: C.d }, yaw, ['left']);
        [[x0,z0],[x1,z0],[x0,z1],[x1,z1]].forEach(function (pt) {
            addBox(L, { x: pt[0], y: 0,           z: pt[1], w: 0.36, h: 0.32, d: 0.36 }, yaw);
            addBox(L, { x: pt[0], y: C.h - 0.32,  z: pt[1], w: 0.36, h: 0.32, d: 0.36 }, yaw);
        });
        addBox(L, { x: C.x, y: 0, z: z1 - 0.09, w: C.w, h: 0.28, d: 0.18 }, yaw);
        L.detail += line([x0, y1, z1], [x1, y1, z1], yaw);
        L.detail += line([x0, 0, z1], [x0, y1, z1], yaw);
        L.detail += line([x1, 0, z1], [x1, y1, z1], yaw);

        // Intake end: filter frames behind louvres.
        var lx = x0 - 0.105;
        for (var l = 1; l <= 9; l++) {
            var ly = C.h * l / 10;
            L.detail += line([lx, ly, z0 + 0.17], [lx, ly, z1 - 0.17], yaw);
        }
        for (var ff = 0; ff < 2; ff++) {
            var fz0 = z0 + 0.2 + (C.d - 0.4) * ff / 2;
            var fz1 = fz0 + (C.d - 0.4) / 2 - 0.08;
            L.detail += line([lx, C.h * 0.1, fz0], [lx, C.h * 0.9, fz0], yaw);
            L.detail += line([lx, C.h * 0.1, fz1], [lx, C.h * 0.9, fz1], yaw);
            L.detail += line([lx, C.h * 0.1, fz0], [lx, C.h * 0.1, fz1], yaw);
            L.detail += line([lx, C.h * 0.9, fz0], [lx, C.h * 0.9, fz1], yaw);
        }

        // Door end: exhaust fans, seam and locking bars.
        var dx2 = x1 + 0.105;
        L.detail += line([dx2, 0.12, C.z], [dx2, y1 - 0.12, C.z], yaw);
        for (var b = 0; b < 4; b++) {
            var bz = z0 + C.d * (b + 0.5) / 4;
            L.detail += line([dx2, 0.16, bz], [dx2, y1 - 0.16, bz], yaw);
        }
        L.detail += ring(dx2, C.h * 0.52, z0 + C.d * 0.3, 0.52, yaw, 12);
        L.detail += ring(dx2, C.h * 0.52, z0 + C.d * 0.3, 0.34, yaw, 10);
        L.detail += ring(dx2, C.h * 0.52, z0 + C.d * 0.7, 0.52, yaw, 12);
        L.detail += ring(dx2, C.h * 0.52, z0 + C.d * 0.7, 0.34, yaw, 10);

        return L;
    }

    /* ---------- Hover regions ---------- */

    function regionBoxes(id) {
        var x0 = C.x - C.w / 2, x1 = C.x + C.w / 2;
        switch (id) {
            case 'intake': return [{ x: x0 - 0.05, y: 0, z: C.z, w: 0.7, h: C.h, d: C.d }];
            case 'hot':    return [{ x: x1 + 0.05, y: 0, z: C.z, w: 0.7, h: C.h, d: C.d }];
            case 'cold':   return [{ x: C.x, y: 0, z: C.z + C.d / 2 - 0.95, w: C.w - 1.2, h: 1.4, d: 0.7 }];
            case 'asics':  return RACKS;
            case 'pdu':    return [PDU];
            case 'net':    return [SWITCH];
            case 'spares': return [SPARES];
            case 'shell':  return [
                { x: C.x, y: 0, z: C.z - C.d / 2 - 0.05, w: C.w, h: C.h, d: 0.1 },
                { x: x0 - 0.05, y: 0, z: C.z, w: 0.1, h: C.h, d: C.d },
                { x: x1 + 0.05, y: 0, z: C.z, w: 0.1, h: C.h, d: C.d },
                { x: C.x, y: C.h - 0.06, z: C.z - C.d / 4, w: C.w, h: 0.06, d: C.d / 2 },
                { x: C.x, y: 0, z: C.z + C.d / 2 - 0.09, w: C.w, h: 0.28, d: 0.18 },
            ];
        }
        return [];
    }

    /* The airflow run, standing in for the home page's power trunk: in at the
       filter wall, along the cold aisle, out through the door end. */
    function buildFlow(H, yaw) {
        var project = H.project, n1 = H.n1;
        var pts = [
            [C.x - C.w / 2 - 0.7, C.h * 0.5, C.z],
            [C.x - C.w / 2 + 0.6, C.h * 0.5, C.z + C.d / 2 - 0.7],
            [C.x + C.w / 2 - 0.6, C.h * 0.5, C.z + C.d / 2 - 0.7],
            [C.x + C.w / 2 + 0.7, C.h * 0.5, C.z],
        ];
        var d = '';
        for (var i = 0; i < pts.length; i++) {
            var q = project(pts[i], yaw);
            d += (i ? 'L' : 'M') + n1(q[0]) + ' ' + n1(q[1]);
        }
        return d;
    }

    /* One renderable: the container and everything in it. Depth sorting exists
       for multiple objects; here there is nothing to sort against. */
    var RENDERABLES = [
        { id: 'cont', at: [C.x, C.h / 2, C.z], build: buildShell },
    ];

    function objects() {
        return [{ id: 'cont', box: { x: C.x, y: 0, z: C.z,
                                     w: C.w + 0.3, h: C.h + 0.3, d: C.d + 0.3 } }];
    }

    var SCENE = {
        view: {
            VB: { w: 1280, h: 470 },
            BASE_PITCH: 22 * Math.PI / 180,
            FOV: 1500,
            BASE_SCALE: 52,
            ORIGIN: { x: 640, y: 269 },
            SHIFT_X: 0,
            PERIOD: 44000,
        },
        renderables: RENDERABLES,
        callouts: CALLOUTS,
        flow: buildFlow,
        regionBoxes: regionBoxes,
        objects: objects,
        extraBoxes: function () { return RACKS; },
        data: { MODEL: MODEL, RACKS: RACKS, CONTAINERS: [C], racksFor: function () { return RACKS; } },
    };

    return engine.createDiagram(SCENE);
});
