/* ===== PROTON MINING — Home page scene =====
   A whole deployment: gas conditioning, a two-bay genset skid, a transformer,
   and four 40ft containers in a 2x2 yard, each cut away to show its ASIC racks.
   One gas skid, one genset and one transformer feed all four.

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

    /* Sizes and contents come from the shared kit, so this page cannot drift
       from the energy page’s drawing of the same equipment. */
    var COLS = KIT.COLS, TIERS = KIT.TIERS, AS = KIT.AS;
    var mastOf = KIT.mastOf, pduOf = KIT.pduOf, racksFor = KIT.racksFor;
    var CW = KIT.CONT.w, CH = KIT.CONT.h, CD = KIT.CONT.d;
    function mkCont(x, z, mast) { return { x: x, y: 0, z: z, w: CW, h: CH, d: CD, mast: mast }; }

    /* FOUR CONTAINERS, TWO BY TWO — 4 x 240 hydro slots, denominated in the
       load they actually draw rather than the container nameplate.

       Declared as two axes rather than four positions, the way
       scene-landfill-ion.js does it, so the count lives in one place:
       renderables, hover boxes, power runs and the callout anchor are all
       derived from CONTAINERS.

       COLUMNS 13.69 M APART. A 40 ft box is 12.19 m along x, so two end to end
       is 24.38 m plus whatever service gap is left between them — 1.5 m here,
       enough for a man and a hose reel. That is the expensive axis: see the
       view block for what it costs.

       ROWS 6.2 M APART, NOT THE 4.8 THIS SCENE USED WITH ONE COLUMN, AND NOT
       THE LANDFILL'S 7.5. The clearance is pitch-dependent and this camera sits
       at 26 degrees, not 20: a container of height h hides h/tan(pitch) of
       ground behind it, which is 2.59/tan(26) = 5.31 m here against the
       landfill's 7.12 m. What survives of the back row's near face is
       gap*tan(pitch)/h, where gap is the clear aisle — so 4.8 m centres (a
       2.36 m aisle) show 44% of it and 6.2 m centres (a 3.76 m aisle) show
       71%, which is the same legibility the landfill buys with 7.5 m at its
       flatter pitch. Rows are nearly free: the scene's swept radius is set by
       the x axis, and 1.4 m more z moves it by under a per cent. */
    var AISLE_X = 1.5;
    var CONT_X = [8.5, 8.5 + CW + AISLE_X];
    var CONT_Z = [-4.1, 2.1];

    var CONTAINERS = [];
    CONT_Z.forEach(function (cz, r) {
        CONT_X.forEach(function (cx, c) {
            /* One mast for the site, on the near left box — the one the
               right-hand callouts point into. Four masts would read as four
               separate sites rather than one yard. */
            CONTAINERS.push(mkCont(cx, cz, r === CONT_Z.length - 1 && c === 0));
        });
    });

    /* The container the callouts anchor to: near row, left column, the one
       whose cutaway is unobstructed. Everything that used to key off "the near
       container" keys off this. */
    var C = CONTAINERS[(CONT_Z.length - 1) * CONT_X.length];
    var ANCHOR_SLOT = 'cont' + CONTAINERS.indexOf(C);

    /* The centre of the yard, for the power spine to run down. */
    var YARD = {
        x: (CONT_X[0] + CONT_X[CONT_X.length - 1]) / 2,
        z: (CONT_Z[0] + CONT_Z[CONT_Z.length - 1]) / 2,
        h: CH
    };

    /* Positions only. The sizes are the kit’s, so this drawing and the energy
       page’s cannot disagree about how big a transformer is. */
    var GAS  = { x: -7.6, y: 0, z: 0, w: KIT.GAS.w,  h: KIT.GAS.h,  d: KIT.GAS.d };
    var GEN  = { x: -3.6, y: 0, z: 0, w: KIT.GEN.w,  h: KIT.GEN.h,  d: KIT.GEN.d };
    var XFMR = { x:  0.2, y: 0, z: 0, w: KIT.XFMR.w, h: KIT.XFMR.h, d: KIT.XFMR.d };

    var MAST = mastOf(C), PDU = pduOf(C);   // one uplink serves the site

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
        /* Anchored on the roof cooler, not on the old intake end. The air-cooled
           container drew its cooling at the ends — louvres one, fans the other — so this
           pointed at [C.x - C.w/2, 1.3]. On a hydro container both ends are blank steel
           and the whole of the cooling is the frame on the roof, so the leader has to go
           there or it points at nothing. Left of centre: the mast is at C.x + 5.6. */
        { id: 'cool',  side: 'l', y: 360, title: 'Cooling',
          /* Kept to three lines at 845px. dg-regress.js derives bubble height from
             desc.length, and at four lines this card collides with "xfmr" above it. */
          desc: 'A closed water loop; the roof cooler rejects the heat',
          at: [C.x - 4.2, C.h + KIT.COOLER.h, C.z] },
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
                /* The cooler's own footprint. This used to be a slab standing against the
                   intake end, which after the hydro switch highlighted bare wall. */
                CONTAINERS.forEach(function (K) {
                    out.push({ x: K.x, y: K.h, z: K.z,
                               w: K.w - KIT.COOLER.inX * 2,
                               h: KIT.COOLER.h,
                               d: K.d - KIT.COOLER.inZ * 2 });
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
        /* Trunk along the ground past the train, then a spine down the aisle
           BETWEEN the two rows with a spur to each box. With one column a
           single run reached both; with four containers a run to the nearest
           and nothing to the others draws three boxes fed by hope. */
        var spineX = CONT_X[0] - CW / 2 - 0.4;
        var trunk = [[GAS.x, 0.11, 0], [GEN.x, 0.11, 0], [XFMR.x, 0.11, 0],
                     [spineX, 0.11, 0], [spineX, 0.11, YARD.z],
                     [CONT_X[CONT_X.length - 1], 0.11, YARD.z]];
        var d = '';
        for (var i = 0; i < trunk.length; i++) {
            var q = project(trunk[i], yaw);
            d += (i ? 'L' : 'M') + n1(q[0]) + ' ' + n1(q[1]);
        }
        CONTAINERS.forEach(function (K) {
            /* To the face that looks at the aisle, whichever side that is. */
            var face = K.z < YARD.z ? K.z + K.d / 2 : K.z - K.d / 2;
            var a = project([K.x, 0.11, YARD.z], yaw);
            var b = project([K.x, 0.11, face], yaw);
            d += 'M' + n1(a[0]) + ' ' + n1(a[1]) + 'L' + n1(b[0]) + ' ' + n1(b[1]);
        });
        return d;
    }

    var RENDERABLES = [
        { id: 'gas',  at: [GAS.x,  GAS.h  / 2, 0], build: function (H, yaw) { return buildGas(H, yaw); } },
        { id: 'gen',  at: [GEN.x,  GEN.h  / 2, 0], build: function (H, yaw) { return buildGen(H, yaw); } },
        { id: 'xfmr', at: [XFMR.x, XFMR.h / 2, 0], build: function (H, yaw) { return buildXfmr(H, yaw); } },
    ].concat(CONTAINERS.map(function (K, i) {
        /* ONE SLOT EACH, not one slot for the yard: the depth sort works per
           slot, so four containers sharing a slot would be painted in a fixed
           order and the back row would draw over the front one as the site
           turns. The closure captures K, so the loop variable cannot follow. */
        return { id: 'cont' + i, at: [K.x, K.h / 2, K.z],
                 build: function (H, yaw) { return buildContainer(H, K, yaw); } };
    }));

    function objects() {
        return [
            { id: 'gas',  box: { x: GAS.x,  y: 0, z: 0, w: GAS.w,  h: GAS.h + 2.9,  d: GAS.d } },
            { id: 'gen',  box: { x: GEN.x,  y: 0, z: 0, w: GEN.w,  h: GEN.h + 1.75, d: GEN.d } },
            { id: 'xfmr', box: { x: XFMR.x, y: 0, z: 0, w: XFMR.w, h: XFMR.h + 0.95, d: XFMR.d } },
        ].concat(CONTAINERS.map(function (K, i) {
            /* Headroom has to clear whatever stands on the roof. The mast box keeps its 2.0;
               every other container needs the dry cooler its roof now carries, which is why
               this is KIT.COOLER.h and not the 0.4 that was enough when the roof was bare. */
            return { id: 'cont' + i, box: { x: K.x, y: 0, z: K.z, w: K.w + 0.2,
                                            h: K.h + (K.mast ? 2.0 : KIT.COOLER.h + 0.14),
                                            d: K.d + 0.2 } };
        }));
    }

    var SCENE = {
        view: {
            VB: { w: 1280, h: 470 },
            BASE_PITCH: 26 * Math.PI / 180,
            FOV: 1500,
            /* WHAT THE SECOND COLUMN COST: 28 down to 18.3, a 35% shrink of
               everything on the page.

               The band the drawing gets is fixed. The callout bubbles sit at
               0..19.53% and 80.47..100% of the viewBox, so the plant has to
               live inside x 250..1030 — 780 units, of which the swept extent
               uses 730 and the mobile crop in styles.css is cut to match. Two
               40 ft boxes end to end is 25.9 m against the 23 m the whole site
               used to span, and the fitter pays for that out of BASE_SCALE
               because it has nowhere else to take it from.

               Every viewer pays. A container goes from 336 to 220 viewBox
               units wide: 364 -> 238 real px on a 1440 desktop, and 153 -> 100
               px inside the mobile crop. The 0.8-unit detail hairlines do NOT
               shrink with it — they are viewBox units with no vector-effect —
               so the linework is half again as heavy relative to the boxes it
               describes, which is where the machine detail goes to mush first.

               ORIGIN.y stays at 253: the sweep still bottoms out at y 450, the
               same ground line the two-container version had.

               SHIFT_X IS THE SCENE'S PIVOT, not a nudge. It is applied before
               the rotation, so the yard's own centre of mass has to sit on it
               or the drawing sweeps a circle wider than it needs and the
               fitter charges BASE_SCALE for the difference. The mass moved
               6.9 m right when the second column arrived, so this moved with
               it. Left at the two-container value of -3.28 the same yard only
               fits at BASE_SCALE 13.66 — a quarter smaller again, for nothing
               but an off-centre pivot. */
            BASE_SCALE: 18.3,
            ORIGIN: { x: 640, y: 253 },
            SHIFT_X: -10.15,
            PERIOD: 44000,
        },
        renderables: RENDERABLES,
        callouts: CALLOUTS,
        flow: buildFlow,
        regionBoxes: regionBoxes,
        objects: objects,
        extraBoxes: function () { return RACKS; },
        data: { MODEL: MODEL, RACKS: RACKS, CONTAINERS: CONTAINERS,
                racksFor: racksFor, ANCHOR_SLOT: ANCHOR_SLOT },
    };

    return engine.createDiagram(SCENE);
});
