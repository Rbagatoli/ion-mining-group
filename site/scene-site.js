/* ===== ION MINING GROUP — Home page scene =====
   A whole deployment: gas conditioning, a two-bay genset skid, a transformer,
   and two 40ft containers side by side, each cut away to show its ASIC racks.
   One gas skid, one genset and one transformer feed both.

   Geometry only. All the machinery lives in diagram-engine.js; builders receive
   its helper bundle as H rather than reaching for globals. */

(function (root, factory) {
    var isNode = (typeof module !== 'undefined' && module.exports);
    var engine = isNode ? require('./diagram-engine.js') : root.DiagramEngine;
    var kit    = isNode ? require('./site-kit.js')       : root.SiteKit;
    var api = factory(engine, kit);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else { root.SiteDiagram = api; api.mountWhenReady({ scene: 'site' }); }
})(typeof self !== 'undefined' ? self : this, function (engine, KIT) {
    'use strict';

    /* ---------- Scene, in metres ---------- */

    // Two containers side by side: same x, parallel, separated across their
    // width by a service aisle. Both open toward +Z (the viewer).
    //
    // The separation is deliberately wide. Both cutaways face the viewer, so
    // the near container's far wall is what occludes the far container's
    // interior; the further apart they sit, the further down into the far one
    // you can see over it. At 4.8m centres and a 26-degree pitch the sight line
    // clears the near wall about a third of the way down the far interior,
    // which is enough to read its top tier of machines. Closing the gap or
    // flattening the pitch hides it entirely.
    /* Sizes and contents come from the shared kit, so this page cannot drift
       from the energy page’s drawing of the same equipment. */
    var COLS = KIT.COLS, TIERS = KIT.TIERS, AS = KIT.AS;
    var mastOf = KIT.mastOf, pduOf = KIT.pduOf, racksFor = KIT.racksFor;
    var CW = KIT.CONT.w, CH = KIT.CONT.h, CD = KIT.CONT.d;
    function mkCont(x, z, mast) { return { x: x, y: 0, z: z, w: CW, h: CH, d: CD, mast: mast }; }
    var CONTA = mkCont(8.5, -3.4, false);
    var CONTB = mkCont(8.5,  1.4, true);
    var CONTAINERS = [CONTA, CONTB];
    var C = CONTB;   // the near one; callout anchors and framing key off it
    /* Positions only. The sizes are the kit’s, so this drawing and the energy
       page’s cannot disagree about how big a transformer is. */
    var GAS  = { x: -7.6, y: 0, z: 0, w: KIT.GAS.w,  h: KIT.GAS.h,  d: KIT.GAS.d };
    var GEN  = { x: -3.6, y: 0, z: 0, w: KIT.GEN.w,  h: KIT.GEN.h,  d: KIT.GEN.d };
    var XFMR = { x:  0.2, y: 0, z: 0, w: KIT.XFMR.w, h: KIT.XFMR.h, d: KIT.XFMR.d };

    var MAST = mastOf(CONTB), PDU = pduOf(CONTB);   // one uplink serves the site

    var MODEL = { container: C, gas: GAS, genset: GEN, xfmr: XFMR, mast: MAST, pdu: PDU,
                  cols: COLS, tiers: TIERS, asic: AS };

    var RACKS = [];
    CONTAINERS.forEach(function (K) { RACKS = RACKS.concat(racksFor(K)); });

    /* ---------- Callouts. id doubles as the hover region id. ---------- */

    var CALLOUTS = [
        { id: 'gas',   side: 'l', y: 60,  title: 'Gas conditioning',
          desc: 'Scrubbing and knockout before the engines',
          at: [GAS.x - 0.5, GAS.h + 1.45, 0.52] },
        { id: 'gen',   side: 'l', y: 160, title: 'Generation',
          desc: 'Engines burning gas that would otherwise be flared',
          at: [GEN.x - 1.3, GEN.h + 1.5, -0.5] },
        { id: 'xfmr',  side: 'l', y: 260, title: 'Transformer',
          desc: 'Stepped down and distributed to the container',
          at: [XFMR.x, XFMR.h + 0.55, -0.3] },
        { id: 'cool',  side: 'l', y: 360, title: 'Cooling',
          desc: 'Filtered intake one end, hot aisle exhausting the other',
          at: [C.x - C.w / 2, 1.3, C.z] },
        { id: 'shell', side: 'r', y: 60,  title: 'Retrofitted container',
          desc: 'A 40 ft shell rebuilt for power, cooling and racking',
          at: [C.x + 1.2, C.h, C.z - C.d / 4] },
        { id: 'asics', side: 'r', y: 160, title: 'ASIC array',
          desc: 'Racked miners, monitored per unit',
          at: [C.x - 1.8, 1.75, C.z - C.d / 2 + 1.1] },
        { id: 'pdu',   side: 'r', y: 260, title: 'Power distribution',
          desc: 'Breakers and metering, per rack',
          at: [PDU.x, PDU.h, PDU.z] },
        { id: 'net',   side: 'r', y: 360, title: 'Uplink',
          desc: 'Redundant network; curtailment signals land here',
          at: [MAST.x, C.h + 1.5, MAST.z] },
    ];

    /* ---------- Object builders ---------- */

    function buildGas(H, yaw) { return KIT.gas(H, yaw, GAS); }

    function buildGen(H, yaw) { return KIT.gen(H, yaw, GEN); }

    function buildXfmr(H, yaw) { return KIT.xfmr(H, yaw, XFMR); }

    function buildContainer(H, K, yaw) { return KIT.container(H, K, yaw); }

    function regionBoxes(id) {
        var out = [];
        switch (id) {
            case 'gas':  return [{ x: GAS.x, y: 0, z: 0, w: GAS.w + 0.6, h: GAS.h + 2.9, d: GAS.d + 0.5 }];
            case 'gen':  return [{ x: GEN.x, y: 0, z: 0, w: GEN.w + 0.5, h: GEN.h + 1.75, d: GEN.d + 0.4 }];
            case 'xfmr': return [{ x: XFMR.x, y: 0, z: 0, w: XFMR.w + 0.5, h: XFMR.h + 0.95, d: XFMR.d + 0.4 }];
            case 'cool':
                CONTAINERS.forEach(function (K) {
                    out.push({ x: K.x - K.w / 2 - 0.05, y: 0, z: K.z, w: 0.6, h: K.h, d: K.d });
                });
                return out;
            case 'shell':
                CONTAINERS.forEach(function (K) {
                    var x0 = K.x - K.w / 2, x1 = K.x + K.w / 2;
                    out.push({ x: K.x, y: 0, z: K.z - K.d / 2 - 0.05, w: K.w, h: K.h, d: 0.1 });
                    out.push({ x: x0 - 0.05, y: 0, z: K.z, w: 0.1, h: K.h, d: K.d });
                    out.push({ x: x1 + 0.05, y: 0, z: K.z, w: 0.1, h: K.h, d: K.d });
                    out.push({ x: K.x, y: K.h - 0.06, z: K.z - K.d / 4, w: K.w, h: 0.06, d: K.d / 2 });
                    out.push({ x: K.x, y: 0, z: K.z + K.d / 2 - 0.09, w: K.w, h: 0.28, d: 0.18 });
                });
                return out;
            case 'asics': return RACKS;
            case 'pdu':   return CONTAINERS.map(pduOf);
            case 'net':   return [{ x: MAST.x, y: C.h, z: MAST.z, w: 1.0, h: 2.0, d: 1.0 }];
        }
        return out;
    }

    function buildFlow(H, yaw) {
        var project = H.project, n1 = H.n1;
        // Trunk along the ground, then a spur into each container.
        var trunk = [[GAS.x, 0.11, 0], [GEN.x, 0.11, 0], [XFMR.x, 0.11, 0],
                     [CONTA.x - CONTA.w / 2 - 0.4, 0.11, 0]];
        var d = '';
        for (var i = 0; i < trunk.length; i++) {
            var q = project(trunk[i], yaw);
            d += (i ? 'L' : 'M') + n1(q[0]) + ' ' + n1(q[1]);
        }
        CONTAINERS.forEach(function (K) {
            var a = project([K.x - K.w / 2 - 0.4, 0.11, 0], yaw);
            var b = project([K.x - K.w / 2 - 0.12, 0.11, K.z], yaw);
            d += 'M' + n1(a[0]) + ' ' + n1(a[1]) + 'L' + n1(b[0]) + ' ' + n1(b[1]);
        });
        return d;
    }

    var RENDERABLES = [
        { id: 'gas',  at: [GAS.x,  GAS.h  / 2, 0], build: function (H, yaw) { return buildGas(H, yaw); } },
        { id: 'gen',  at: [GEN.x,  GEN.h  / 2, 0], build: function (H, yaw) { return buildGen(H, yaw); } },
        { id: 'xfmr', at: [XFMR.x, XFMR.h / 2, 0], build: function (H, yaw) { return buildXfmr(H, yaw); } },
        { id: 'contA', at: [CONTA.x, CONTA.h / 2, CONTA.z],
          build: function (H, yaw) { return buildContainer(H, CONTA, yaw); } },
        { id: 'contB', at: [CONTB.x, CONTB.h / 2, CONTB.z],
          build: function (H, yaw) { return buildContainer(H, CONTB, yaw); } },
    ];

    function objects() {
        return [
            { id: 'gas',  box: { x: GAS.x,  y: 0, z: 0, w: GAS.w,  h: GAS.h + 2.9,  d: GAS.d } },
            { id: 'gen',  box: { x: GEN.x,  y: 0, z: 0, w: GEN.w,  h: GEN.h + 1.75, d: GEN.d } },
            { id: 'xfmr', box: { x: XFMR.x, y: 0, z: 0, w: XFMR.w, h: XFMR.h + 0.95, d: XFMR.d } },
            { id: 'contA', box: { x: CONTA.x, y: 0, z: CONTA.z, w: CONTA.w + 0.2, h: CONTA.h + 0.4, d: CONTA.d + 0.2 } },
            { id: 'contB', box: { x: CONTB.x, y: 0, z: CONTB.z, w: CONTB.w + 0.2, h: CONTB.h + 2.0, d: CONTB.d + 0.2 } },
        ];
    }

    var SCENE = {
        view: {
            VB: { w: 1280, h: 470 },
            BASE_PITCH: 26 * Math.PI / 180,
            FOV: 1500,
            BASE_SCALE: 28,
            ORIGIN: { x: 640, y: 253 },
            SHIFT_X: -3.28,
            PERIOD: 44000,
        },
        renderables: RENDERABLES,
        callouts: CALLOUTS,
        flow: buildFlow,
        regionBoxes: regionBoxes,
        objects: objects,
        extraBoxes: function () { return RACKS; },
        data: { MODEL: MODEL, RACKS: RACKS, CONTAINERS: CONTAINERS, racksFor: racksFor },
    };

    return engine.createDiagram(SCENE);
});
