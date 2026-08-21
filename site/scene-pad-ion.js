/* ===== ION MINING GROUP — Energy page scene, state TWO: the pad with us =====

   The same pad, the same camera, the same everything underneath — imported from
   pad-geometry.js rather than declared again, so that when the slider moves the
   wellhead, separator, tanks and stack do not shift by a pixel. Only two things
   change, and they are the two things the page is about: the flare drops to a
   pilot, and a run of our kit appears on the open half of the pad.

   THE KIT IS THE HOME PAGE'S KIT. Not a second drawing of the same idea — the
   same modules, from site-kit.js, at the same sizes with the same detail. They
   were modelled independently at first and came out visibly different: a 1.7 m
   conditioning skid on one page and a 4.4 m box on the other, a 1.5 m
   transformer against a 2.2 m one, sixty-seven lines of detail here against
   three hundred and forty-one there. Two pictures of one company's equipment
   that did not look like the same equipment.

   The stack stays standing. You do not remove a flare, you stop feeding it, and
   it remains for upset conditions and for the days we are shut down — which is
   the same promise the hero makes about being interruptible. Drawing it gone
   would be a lie an operator would catch immediately.

   The view block below is duplicated verbatim from scene-pad-now.js and MUST
   stay identical. pad-suite.js asserts it.

   Geometry only. All machinery lives in diagram-engine.js. */

(function (root, factory) {
    var isNode = (typeof module !== 'undefined' && module.exports);
    var engine = isNode ? require('./diagram-engine.js') : root.DiagramEngine;
    var pad    = isNode ? require('./pad-geometry.js')   : root.PadGeometry;
    var kit    = isNode ? require('./site-kit.js')       : root.SiteKit;
    var api = factory(engine, pad, kit);
    if (isNode) module.exports = api;
    else {
        root.PadIonDiagram = api;
        api.mountWhenReady({ scene: 'padion' });
    }
})(typeof self !== 'undefined' ? self : this, function (engine, P, KIT) {
    'use strict';

    /* ---------- Our kit, on the open half ----------
       Sizes come from site-kit.js. Only the positions are ours: the row sits
       clear of the tank berm, and the containers go behind it toward the front
       edge of the pad, which is the order the gas actually travels in. */

    var GAS  = { x: -13.0, y: 0, z: 0.8, w: KIT.GAS.w,  h: KIT.GAS.h,  d: KIT.GAS.d };
    var GEN  = { x:  -8.6, y: 0, z: 0.8, w: KIT.GEN.w,  h: KIT.GEN.h,  d: KIT.GEN.d };
    var XFMR = { x:  -4.6, y: 0, z: 0.8, w: KIT.XFMR.w, h: KIT.XFMR.h, d: KIT.XFMR.d };

    function mkCont(x, z, mast) {
        return { x: x, y: 0, z: z, w: KIT.CONT.w, h: KIT.CONT.h, d: KIT.CONT.d, mast: mast };
    }
    var CONTA = mkCont(4.5, 4.0, false);
    var CONTB = mkCont(4.5, 8.8, true);
    var CONTAINERS = [CONTA, CONTB];

    var RACKS = [];
    CONTAINERS.forEach(function (K) { RACKS = RACKS.concat(KIT.racksFor(K)); });

    /* ---------- Callouts ----------
       The y positions match scene-pad-now.js exactly, so the label boxes
       cross-dissolve where they stand instead of jumping between states. */

    var CALLOUTS = [
        { id: 'tiein', side: 'l', y: 70,  title: 'One tie-in',
          desc: 'We take the gas at your separator. Nothing upstream changes',
          at: [P.SEP.x + 1.0, P.SEP.y + P.SEP.h * 0.6, P.SEP.z + 1.2] },
        { id: 'cond',  side: 'l', y: 190, title: 'Conditioning',
          desc: 'Scrubbing and knockout, sized to your gas, on our capital',
          at: [GAS.x, GAS.h + 1.4, GAS.z + GAS.d / 2] },
        { id: 'gen',   side: 'l', y: 310, title: 'Generation',
          desc: 'Enclosed engines burning it in a controlled chamber',
          at: [GEN.x, GEN.h, GEN.z + GEN.d / 2] },
        { id: 'xfmr',  side: 'r', y: 70,  title: 'Transformer',
          desc: 'Stepped down and distributed to the containers',
          at: [XFMR.x, XFMR.h, XFMR.z + XFMR.d / 2] },
        { id: 'cont',  side: 'r', y: 190, title: 'The load',
          desc: 'Machines that will buy every Mcf you can send, at the wellhead',
          at: [CONTB.x + 2.0, CONTB.h, CONTB.z + CONTB.d / 2] },
        { id: 'keep',  side: 'r', y: 310, title: 'Your flare stays',
          desc: 'Still permitted, still there for upsets and for when you take the gas back',
          at: [P.FLARE.x, P.FLARE_H * 0.55, P.FLARE.z] },
    ];

    /* ---------- The pilot ----------
       One small tongue where the lit state has three large ones. Same layer,
       same language, an order of magnitude less of it. */

    function buildPilot(H, yaw, L) {
        var project = H.project, n1 = H.n1;
        var x = P.FLARE.x, z = P.FLARE.z;
        /* Same rooting as the lit state: it starts inside the tip flange at the
           stack bore, not floating above it. */
        var base = P.FLARE_H - 0.12, r = P.FLARE_R * 0.55;
        var pts = [
            [x - r,        base,        z],
            [x - r * 1.5,  base + 0.34, z + 0.04],
            [x + 0.04,     base + 0.82, z + 0.05],
            [x + r * 1.4,  base + 0.30, z - 0.04],
            [x + r,        base,        z],
        ];
        var d = '';
        for (var i = 0; i < pts.length; i++) {
            var q = project(pts[i], yaw);
            d += (i ? 'L' : 'M') + n1(q[0]) + ' ' + n1(q[1]);
        }
        L.flame += d + 'Z';
    }

    /* ---------- The tie-in ----------
       The single most important object on this side of the slider: it is the
       whole physical change to the partner's site. Without it our equipment
       reads as unrelated boxes parked on their pad. */

    function buildTieIn(H, yaw) {
        var L = H.newLayers(), ringY = H.ringY;
        var ty = 1.5;
        P.pipe(H, yaw, L, [P.SEP.x + 1.0, P.SEP.y + P.SEP.h, P.SEP.z + 0.9],
                          [P.SEP.x + 1.0, ty, P.SEP.z + 0.9]);
        P.pipe(H, yaw, L, [P.SEP.x + 1.0, ty, P.SEP.z + 0.9], [P.SEP.x + 1.0, ty, GAS.z]);
        P.pipe(H, yaw, L, [P.SEP.x + 1.0, ty, GAS.z], [GAS.x - GAS.w / 2, ty, GAS.z]);
        L.detail += ringY(P.SEP.x + 1.0, ty + 0.3, P.SEP.z + 2.4, 0.3, yaw, 8);
        // Conditioned gas to the engine, and power on to the containers.
        P.pipe(H, yaw, L, [GAS.x + GAS.w / 2, ty, GAS.z], [GEN.x - GEN.w / 2, ty, GEN.z]);
        P.pipe(H, yaw, L, [XFMR.x, 2.4, XFMR.z], [XFMR.x, 2.4, CONTA.z]);
        P.pipe(H, yaw, L, [XFMR.x, 2.4, CONTA.z], [CONTA.x - CONTA.w / 2, 2.4, CONTA.z]);
        return L;
    }

    /* ---------- Renderables ----------
       One slot per object, as the home page does, so the depth sort can put the
       containers in front of or behind the plant as the pad turns. */

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
        buildPilot(H, yaw, L);
        return L;
    }

    var RENDERABLES = [
        { id: 'ground', at: [-4.0, 1.6, -5.0], build: buildGround },
        { id: 'tiein',  at: [(P.SEP.x + GAS.x) / 2, 1.5, (P.SEP.z + GAS.z) / 2], build: buildTieIn },
        { id: 'cond',   at: [GAS.x, GAS.h / 2, GAS.z],
          build: function (H, yaw) { return KIT.gas(H, yaw, GAS); } },
        { id: 'gen',    at: [GEN.x, GEN.h / 2, GEN.z],
          build: function (H, yaw) { return KIT.gen(H, yaw, GEN); } },
        { id: 'xfmr',   at: [XFMR.x, XFMR.h / 2, XFMR.z],
          build: function (H, yaw) { return KIT.xfmr(H, yaw, XFMR); } },
        { id: 'contA',  at: [CONTA.x, CONTA.h / 2, CONTA.z],
          build: function (H, yaw) { return KIT.container(H, CONTA, yaw); } },
        { id: 'contB',  at: [CONTB.x, CONTB.h / 2, CONTB.z],
          build: function (H, yaw) { return KIT.container(H, CONTB, yaw); } },
        { id: 'flare',  at: [P.FLARE.x, P.FLARE_H / 2, P.FLARE.z], build: buildFlare },
    ];

    function objects() {
        return [
            { id: 'ground', box: { x: -4.0, y: 0, z: -5.0, w: 26, h: P.TANK_H, d: 10 } },
            { id: 'tiein',  box: { x: (P.SEP.x + GAS.x) / 2, y: 0, z: (P.SEP.z + GAS.z) / 2,
                                   w: 4, h: 2, d: 8 } },
            { id: 'cond',   box: { x: GAS.x, y: 0, z: GAS.z,
                                   w: GAS.w + 1.6, h: GAS.h + 2.2, d: GAS.d + 1.0 } },
            { id: 'gen',    box: { x: GEN.x, y: 0, z: GEN.z,
                                   w: GEN.w + 0.9, h: GEN.h + 1.6, d: GEN.d + 0.9 } },
            { id: 'xfmr',   box: { x: XFMR.x, y: 0, z: XFMR.z,
                                   w: XFMR.w + 0.9, h: XFMR.h + 0.9, d: XFMR.d + 0.7 } },
            { id: 'contA',  box: { x: CONTA.x, y: 0, z: CONTA.z,
                                   w: CONTA.w + 0.3, h: CONTA.h + 0.3, d: CONTA.d + 0.3 } },
            { id: 'contB',  box: { x: CONTB.x, y: 0, z: CONTB.z,
                                   w: CONTB.w + 0.3, h: CONTB.h + 1.8, d: CONTB.d + 0.3 } },
            { id: 'flare',  box: { x: P.FLARE.x, y: 0, z: P.FLARE.z,
                                   w: 3.2, h: P.FLARE_H + 1.2, d: 3.2 } },
        ];
    }

    /* ---------- Hover regions ---------- */

    function regionBoxes(id) {
        switch (id) {
            case 'tiein': return [{ x: P.SEP.x + 1.0, y: 0, z: (P.SEP.z + GAS.z) / 2,
                                    w: 1.0, h: 1.8, d: Math.abs(GAS.z - P.SEP.z) }];
            case 'cond':  return [GAS];
            case 'gen':   return [GEN];
            case 'xfmr':  return [XFMR];
            case 'cont':  return CONTAINERS;
            case 'keep':  return [{ x: P.FLARE.x, y: 0, z: P.FLARE.z,
                                    w: 1.4, h: P.FLARE_H, d: 1.4 }, P.KO];
        }
        return [];
    }

    /* The run that now goes somewhere: the same wellhead and separator as the
       lit state, then across to the skid, along the plant, and into the
       containers. */
    function buildFlow(H, yaw) {
        var project = H.project, n1 = H.n1;
        var y = 1.5;
        var pts = [
            [P.WELL.x, P.WELL_H - 0.5, P.WELL.z],
            [P.SEP.x - P.SEP.w / 2 - 0.4, P.SEP.y + P.SEP.h * 0.6, P.SEP.z],
            [P.SEP.x + 1.0, P.SEP.y + P.SEP.h * 0.6, P.SEP.z],
            [P.SEP.x + 1.0, y, GAS.z],
            [GAS.x, y, GAS.z],
            [GEN.x, y, GEN.z],
            [XFMR.x, y, XFMR.z],
            [XFMR.x, y, CONTA.z],
            [CONTA.x - CONTA.w / 2 - 0.4, y, CONTA.z],
        ];
        var d = '';
        for (var i = 0; i < pts.length; i++) {
            var q = project(pts[i], yaw);
            d += (i ? 'L' : 'M') + n1(q[0]) + ' ' + n1(q[1]);
        }
        return d;
    }

    var SCENE = {
        /* Duplicated verbatim from scene-pad-now.js. See the header. */
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
        extraBoxes: function () { return P.tankBoxes().concat(RACKS, [GAS, GEN, XFMR]); },
        data: { MODEL: P.MODEL, PAD: P, GAS: GAS, GEN: GEN, XFMR: XFMR,
                CONTAINERS: CONTAINERS, RACKS: RACKS, lit: false },
    };

    return engine.createDiagram(SCENE);
});
