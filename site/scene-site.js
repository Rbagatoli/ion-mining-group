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

    /* THE SCENE'S PIVOT, hoisted out of the view block (which still carries the
       reasoning for its value) because the ground below now needs it too. */
    var SHIFT_X = -10.15;

    /* ---------- The graded yard ----------

       THE YARD FLOATED. The energy page's drawings stand on a graded pad and
       read as places; this one drew four containers and a gas train on bare
       black and read as a product shot. Same fix in the same language as
       pad-geometry.js / landfill-geometry.js: a faint slab folded into the
       'ground' layer, a sparse grid, an edge, and the road that gets a
       container truck in.

       CENTRED ON THE PIVOT, AND THAT IS LOAD-BEARING. The ground must paint
       first at every yaw, and the depth sort keys each slot off its anchor —
       so the ground's anchor sits at x = -SHIFT_X, z = 0, where its swept
       radius is zero and its depth never moves. See the anchor note on the
       renderable for the measured margin.

       44 x 14, NOT FITTED TO THE PLANT'S 37 x 8.6. The plant runs x -8.75
       (gas skid edge) to 28.29 (right column shell) and z -5.32..3.32; the
       slab leaves a 3.1..3.9 m apron in x and 2.7 m in z, about what the
       wellpad's 44 x 22 leaves around its own kit. The cost is measured at
       the corners: swept radius sqrt(22^2 + 8^2) = 23.4 m, whose near pass
       crosses screen y 509 — 39 units below the 470 viewBox, clipped for a
       moment twice per turn exactly as the landfill's ground already is at
       y 511. dg-crop.js treats 'ground' as a backdrop that may bleed, and
       the mobile crop stays fitted to the plant. */
    var PAD  = { x: -SHIFT_X, y: -0.15, z: -1.0, w: 44, h: 0.15, d: 14 };
    /* The way in, off the near edge by the train — off-pad and a shade lower,
       as both exemplars draw it, so its edge does not z-fight the slab's. */
    var ROAD = { x: -6.0, y: -0.2, z: 8.4, w: 5.0, h: 0.1, d: 4.8 };

    var MAST = mastOf(C), PDU = pduOf(C);   // one uplink serves the site

    var MODEL = { container: C, gas: GAS, genset: GEN, xfmr: XFMR, mast: MAST, pdu: PDU,
                  cols: COLS, tiers: TIERS, asic: AS };

    var RACKS = [];
    CONTAINERS.forEach(function (K) { RACKS = RACKS.concat(racksFor(K)); });
    var CONTAINER_DETAIL = CONTAINERS.map(function (K) {
        return { racks: RACKS.filter(function (rack) { return rack.cont === K; }) };
    });

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

    function buildContainer(H, K, yaw) {
        return KIT.container(H, K, yaw, CONTAINER_DETAIL[CONTAINERS.indexOf(K)]);
    }

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

    /* The slab, the grid, the edge, the road — all folded into the 'ground'
       layer. addBox would route the slab's top face to 'top', which is the
       brightness of a transformer lid: pad-geometry.js measured that against
       its own plant and the machinery had nothing to stand out against. Same
       scratch-bundle fold here for the same reason. */
    function buildGround(H, yaw) {
        var L = H.newLayers();
        var G = H.newLayers();
        H.addBox(G, PAD, yaw);
        H.addBox(G, ROAD, yaw);
        L.ground += G.top + G.side + G.end + G.detail + G.back;

        /* Tight, unblurred contact shadows seat the equipment on the pad. */
        [GAS, GEN, XFMR].concat(CONTAINERS).forEach(function (K) {
            var x = K.x + 0.12, z = K.z + 0.16, w = K.w / 2 + 0.18, d = K.d / 2 + 0.18;
            L.shadow += H.poly([[x-w,0.007,z-d],[x-w,0.007,z+d],
                                [x+w,0.007,z+d],[x+w,0.007,z-d]], yaw);
        });

        var x0 = PAD.x - PAD.w / 2, x1 = PAD.x + PAD.w / 2;
        var z0 = PAD.z - PAD.d / 2, z1 = PAD.z + PAD.d / 2;
        /* 8 x 4 cells — 5.5 x 3.5 m. The wellpad's 5.5 m pitch survives its
           scale of 16; at 18.3 it is roomier still, measured at yaw 0:
           101..116 px between columns on a 1384 desktop, 47..54 px inside
           the 390 phone crop, and the 3.5 m rows foreshorten to 25..31
           viewBox units — the band the energy pads' 5.5 m rows land in (30)
           at their flatter pitch. Inset 0.5 so the grid does not double the
           outline. */
        var i;
        for (i = 1; i < 8; i++) {
            var gx = x0 + PAD.w * i / 8;
            L.ground += H.line([gx, 0.004, z0 + 0.5], [gx, 0.004, z1 - 0.5], yaw);
        }
        for (i = 1; i < 4; i++) {
            var gz = z0 + PAD.d * i / 4;
            L.ground += H.line([x0 + 0.5, 0.004, gz], [x1 - 0.5, 0.004, gz], yaw);
        }
        /* The pad edge, which the grid would otherwise only imply. */
        L.ground += H.line([x0, 0.005, z0], [x1, 0.005, z0], yaw);
        L.ground += H.line([x0, 0.005, z1], [x1, 0.005, z1], yaw);
        L.ground += H.line([x0, 0.005, z0], [x0, 0.005, z1], yaw);
        L.ground += H.line([x1, 0.005, z0], [x1, 0.005, z1], yaw);
        return L;
    }

    var RENDERABLES = [
        /* THE ANCHOR IS A SORT KEY, NOT A POSITION, and it is a kilometre
           underground on purpose. The ground is a flat backdrop every other
           slot must paint over at every yaw AND EVERY PITCH — the depth sort
           only compares anchors, and depth is y sin(pitch) + rotZ cos(pitch),
           so a pin that merely beats the plant at the baked 26 degrees loses
           when the viewer DRAGS the pitch down. At y -40 the ground led the
           gas skid (the deepest plant anchor, radius 17.75) by only 1.9 at
           26 deg, and below 18 deg it started losing yaws: 357 of 360 gone
           at PITCH_MIN's 3 deg — the owner's screenshot, gravel grid across
           the back row. On the axis the anchor's rotZ is 0, so its depth is
           the constant -1000 sin(pitch): -52.3 at 3 deg against a plant
           floor near -17.7, and the margin only grows steeper. dg-suite.js
           test 9 sweeps 72 yaws across the whole draggable pitch range and
           asserts the ground slot is always first, in all five ground
           scenes. */
        { id: 'ground', at: [-SHIFT_X, -1000, 0], build: buildGround },
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

    /* NO 'ground' ENTRY, AND NOT BY OVERSIGHT. objects() feeds exactly two
       consumers: allPoints(), which dg-suite test 4 sweeps to prove the PLANT
       stays out of the callout columns (x 262..1018), and the container count
       behind index.html's alt text. Hover never reads it — regions come from
       regionBoxes() — and the engine mounts without it. The slab spans
       x -11.85..32.15 precisely so it can run wide of the plant, the way the
       energy scenes' ground sweeps x 123..1157: putting it in objects() would
       fail test 4 while re-fitting nothing, because BASE_SCALE is hand-set to
       the plant. dg-crop.js already classes the 'ground' slot as a backdrop
       that may bleed, so the mobile crop stays fitted to the plant too. */
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
        optimize: true,
        idleMotion: { amplitude: 5 * Math.PI / 180, period: 32000 },
        layers: ['ground', 'shadow', 'inside', 'back', 'asics', 'asictop',
                 'inner', 'end', 'side', 'top', 'rim', 'detail', 'flame'],
        /* One palette for the inline SVG and the generated share card. The
           short gradients suggest painted metal under a broad overhead light. */
        paint: {
            ground:  { fillRGB: [18,18,17], stroke: 0.075, width: 0.45 },
            shadow:  { fillRGB: [0,0,0], alpha: 0.52 },
            inside:  { fillRGB: [23,24,23], fillTo: [9,10,9] },
            back:    { stroke: 0.18, width: 0.5 },
            asics:   { fillRGB: [59,59,58], fillTo: [30,30,29], stroke: 0.18, width: 0.45 },
            asictop: { fillRGB: [102,102,100], fillTo: [76,76,74] },
            inner:   { stroke: 0.36, width: 0.55 },
            end:     { fillRGB: [81,81,79], fillTo: [46,46,45] },
            side:    { fillRGB: [119,119,117], fillTo: [75,75,73] },
            top:     { fillRGB: [165,165,162], fillTo: [124,124,121] },
            rim:     { fillRGB: [189,189,186] },
            detail:  { stroke: 0.50, width: 0.6 },
        },
        view: {
            VB: { w: 1280, h: 470 },
            BASE_PITCH: 30 * Math.PI / 180,
            BASE_YAW: -26 * Math.PI / 180,
            FOV: 1500,
            /* Keep all four 40 ft shells and the gas train inside the existing
               callout gutters, including a full manual revolution. The opening
               angle separates the two rows; the higher pitch exposes their racks.
               The 30-degree pitch needs an 11-unit lift to keep the far side
               within the same mobile crop at every yaw. */
            BASE_SCALE: 18.3,
            ORIGIN: { x: 640, y: 242 },
            SHIFT_X: SHIFT_X,
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
