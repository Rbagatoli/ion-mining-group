/* ===== PROTON MINING — Energy page scene, state ONE: the pad today =====

   A partner's wellpad as it stands: gas comes up, goes through the separator,
   and the part nobody has a customer for goes to the stack and burns. The
   orange run ends at the flame, which is the whole problem stated in one line.

   The pad itself is not declared here. It comes from pad-geometry.js, shared
   byte-for-byte with the second state, so that when the slider moves nothing
   under it shifts — only the flame dies and our kit arrives. That stillness is
   what makes the before/after read as one site rather than two pictures.

   The view block below is duplicated verbatim in scene-pad-ion.js and MUST stay
   that way. A different BASE_SCALE or ORIGIN between the two would slide and
   rescale the pad mid-crossfade, and nothing about either file would look
   wrong. pad-suite.js asserts they are equal.

   Geometry only. All machinery lives in diagram-engine.js. */

(function (root, factory) {
    var isNode = (typeof module !== 'undefined' && module.exports);
    var engine = isNode ? require('./diagram-engine.js') : root.DiagramEngine;
    var pad    = isNode ? require('./pad-geometry.js')   : root.PadGeometry;
    var api = factory(engine, pad);
    if (isNode) module.exports = api;
    else {
        root.PadNowDiagram = api;
        api.mountWhenReady({ scene: 'padnow' });
    }
})(typeof self !== 'undefined' ? self : this, function (engine, P) {
    'use strict';

    /* ---------- Callouts. id doubles as the hover region id. ---------- */

    var CALLOUTS = [
        { id: 'well',  side: 'l', y: 70,  title: 'Your wellhead',
          desc: 'Producing gas alongside the liquids you actually sell',
          at: [P.WELL.x, P.WELL_H, P.WELL.z] },
        { id: 'sep',   side: 'l', y: 190, title: 'Separation',
          desc: 'Liquids to the tanks, gas to wherever it can go',
          at: [P.SEP.x, P.SEP.y + P.SEP.h, P.SEP.z + P.SEP.d / 2] },
        { id: 'tanks', side: 'l', y: 310, title: 'Tank battery',
          desc: 'The barrels you get paid for, trucked out',
          at: [P.TANK_X[0], P.TANK_H, P.TANK_Z] },
        { id: 'flame', side: 'r', y: 70,  title: 'Burning it',
          desc: 'An open flame can blow out in wind or burn incomplete',
          at: [P.FLARE.x, P.FLARE_H + 1.2, P.FLARE.z] },
        { id: 'stack', side: 'r', y: 190, title: 'The flare stack',
          desc: 'Permitted, inspected, and producing nothing',
          at: [P.FLARE.x, P.FLARE_H * 0.55, P.FLARE.z] },
        { id: 'space', side: 'r', y: 310, title: 'Room to work',
          desc: 'The open half of a graded pad, already permitted',
          at: [2.0, 0.2, 7.0] },
    ];

    /* ---------- The flame ----------
       Drawn as nested tapering tongues rather than one blob: an outer envelope,
       an inner core, and a lick tearing off the top. They are separate paths in
       one layer, so the stylesheet can flicker them out of phase and the flame
       moves without anything being recomputed per frame. */

    var WIDEST = 0.95;

    function buildFlame(H, yaw, L) {
        var project = H.project, n1 = H.n1;
        var x = P.FLARE.x, z = P.FLARE.z;
        /* Rooted ON the stack. The first version put the flame's widest point
           at its base and started it 0.2 m clear of the tip, so a 1.9 m-wide
           shape sat over a 0.6 m pipe with a gap underneath and read as a
           separate object floating near the stack rather than as something
           coming out of it.

           A flare leaves the tip at roughly the bore, billows above it, and
           tapers. So each tongue now starts at the stack radius — scaled with
           the tongue, so the three stay nested — and the base sits just INSIDE
           the tip flange, where the burning actually starts. */
        var base = P.FLARE_H - 0.12;

        function tongue(wide, height, lean, twist) {
            var r = P.FLARE_R * (wide / WIDEST);     // its own share of the bore
            var pts = [
                [x - r,               base,                 z],
                [x - wide,            base + height * 0.34, z + twist],
                [x - wide * 0.52,     base + height * 0.70, z + twist],
                [x + lean,            base + height,        z + twist * 1.5],
                [x + wide * 0.58,     base + height * 0.64, z - twist],
                [x + wide,            base + height * 0.30, z - twist],
                [x + r,               base,                 z],
            ];
            var d = '';
            for (var i = 0; i < pts.length; i++) {
                var q = project(pts[i], yaw);
                d += (i ? 'L' : 'M') + n1(q[0]) + ' ' + n1(q[1]);
            }
            return d + 'Z';
        }

        L.flame += tongue(WIDEST, 3.8, 0.40, 0.22);   // envelope
        L.flame += tongue(0.58, 2.7, 0.24, -0.13);    // core
        L.flame += tongue(0.30, 1.6, 0.08, 0.07);     // the bright centre
    }

    /* ---------- Renderables ----------
       Two, so the depth sort can put the flare in front of or behind the tank
       battery as the pad turns. The shared furniture rides with the pad. */

    function buildGround(H, yaw) {
        var L = H.newLayers();
        P.buildPad(H, yaw, L);
        P.buildBerm(H, yaw, L);
        P.buildWell(H, yaw, L);
        P.buildSeparator(H, yaw, L);
        P.buildTanks(H, yaw, L);
        P.buildPipes(H, yaw, L);
        return L;
    }

    function buildFlare(H, yaw) {
        var L = H.newLayers();
        P.buildFlareStack(H, yaw, L);
        buildFlame(H, yaw, L);
        return L;
    }

    var RENDERABLES = [
        { id: 'ground', at: [-4.0, 1.6, -5.0], build: buildGround },
        { id: 'flare',  at: [P.FLARE.x, P.FLARE_H / 2, P.FLARE.z], build: buildFlare },
    ];

    function objects() {
        return [
            { id: 'ground', box: { x: -4.0, y: 0, z: -5.0, w: 26, h: P.TANK_H, d: 10 } },
            { id: 'flare',  box: { x: P.FLARE.x, y: 0, z: P.FLARE.z,
                                   w: 3.2, h: P.FLARE_H + 4.2, d: 3.2 } },
        ];
    }

    /* ---------- Hover regions ---------- */

    function regionBoxes(id) {
        switch (id) {
            case 'well':  return [{ x: P.WELL.x, y: 0, z: P.WELL.z, w: 2.0, h: P.WELL_H, d: 2.0 }];
            case 'sep':   return [P.SKID, P.SEP];
            case 'tanks': return P.tankBoxes();
            case 'flame': return [{ x: P.FLARE.x, y: P.FLARE_H, z: P.FLARE.z,
                                    w: 2.2, h: 4.2, d: 2.2 }];
            case 'stack': return [{ x: P.FLARE.x, y: 0, z: P.FLARE.z,
                                    w: 1.4, h: P.FLARE_H, d: 1.4 }, P.KO];
            case 'space': return [{ x: 2.0, y: 0, z: 7.0, w: 20, h: 0.6, d: 7.0 }];
        }
        return [];
    }

    /* The run that ends in the flame: up the well, through the separator,
       across the pad, and up the stack. Same marching dashes the other two
       pages use for power, because it is the same idea — energy going
       somewhere — and here it goes nowhere. */
    function buildFlow(H, yaw) {
        var project = H.project, n1 = H.n1;
        var pts = [
            [P.WELL.x, P.WELL_H - 0.5, P.WELL.z],
            [P.SEP.x - P.SEP.w / 2 - 0.4, P.SEP.y + P.SEP.h * 0.6, P.SEP.z],
            [P.SEP.x + P.SEP.w / 2 + 0.4, P.SEP.y + P.SEP.h * 0.6, P.SEP.z],
            [P.KO.x - 1.6, P.KO.h * 0.6, P.SEP.z],
            [P.KO.x - 1.6, P.KO.h * 0.6, P.FLARE.z],
            [P.FLARE.x, P.KO.h * 0.6, P.FLARE.z],
            [P.FLARE.x, P.FLARE_H - 0.2, P.FLARE.z],
        ];
        var d = '';
        for (var i = 0; i < pts.length; i++) {
            var q = project(pts[i], yaw);
            d += (i ? 'L' : 'M') + n1(q[0]) + ' ' + n1(q[1]);
        }
        return d;
    }

    var SCENE = {
        /* Duplicated verbatim in scene-pad-ion.js. See the header. */
        view: {
            VB: { w: 1280, h: 470 },
            BASE_PITCH: 20 * Math.PI / 180,
            FOV: 1500,
            BASE_SCALE: 16.0,
            ORIGIN: { x: 640, y: 280 },
            SHIFT_X: 0,
            PERIOD: 44000,
        },
        renderables: RENDERABLES,
        callouts: CALLOUTS,
        flow: buildFlow,
        regionBoxes: regionBoxes,
        objects: objects,
        extraBoxes: function () { return P.tankBoxes(); },
        data: { MODEL: P.MODEL, PAD: P, lit: true },
    };

    return engine.createDiagram(SCENE);
});
