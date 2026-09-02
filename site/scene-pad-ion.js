/* ===== PROTON MINING — Energy page scene, state TWO: the pad with us =====

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

    /* FOUR CONTAINERS, TWO BY TWO — the same grid scene-landfill-ion.js draws,
       declared as two axes so the count lives in one place and everything below
       (renderables, hover boxes, the power spine, the callout anchor) derives
       from CONTAINERS.

       THE PAD COSTS NOTHING IN SCALE AND EVERYTHING IN DEPTH. Four containers
       here do not move the framing at all: the swept envelope is set by the
       flare on one side and the tank battery on the other, and the yard sits
       inside it — BASE_SCALE stays 16 and the "now" state it shares a camera
       with is untouched. What the pad does not have is ground.

       COLUMNS AT -6.7 AND 6.7. Two 12.19 m boxes plus the landfill's own 1.21 m
       lateral gap is 25.6 m, and the pad is 44 m wide, so width is not the
       problem. What bounds the east edge is the flare line: it turns north at
       x 13.4 and runs the length of the yard at 2.6 m, which is inside a
       container. A right column centred at 6.7 puts the shell's outermost face
       at 12.98, clearing that pipe by 0.16 m. Centring the pair on x 0 also
       puts the yard on the pivot, which is where SHIFT_X = 0 already looks.

       ROWS AT 4.2 AND 9.6 — 5.4 M CENTRES, NOT THE LANDFILL'S 7.5. This is the
       one number the wellpad cannot copy. The landfill's yard has 14.25 m of
       clear ground between the front face of its plant row and the front edge
       of its graded pad; the wellpad has 9.15 m, because the pad is 22 m deep
       and the tank battery, its berm and the plant row have already spent the
       back of it. Two rows of container plus the landfill's own 1.13 m working
       gap need 9.94 m. The pad is 0.79 m short of the landfill's spacing before
       a single millimetre of margin, so 7.5 m centres would stand the front row
       off the graded surface.

       At 5.4 m centres and 20 degrees of pitch, 57% of each back-row container
       is still clear of the roof in front of it — measured by rasterising the
       slots in paint order, not estimated. That is better than the 49% the
       two-container version gets from its 4.8 m spacing, and well short of the
       84% the landfill gets from 7.5. Four containers here are countable, but
       they are not as countable as the landfill's four, and no arrangement that
       keeps them on the pad makes them so. */
    var CONT_X = [-6.7, 6.7];
    var CONT_Z = [4.2, 9.6];

    var CONTAINERS = [];
    CONT_Z.forEach(function (cz, r) {
        CONT_X.forEach(function (cx, c) {
            CONTAINERS.push(mkCont(cx, cz, r === CONT_Z.length - 1 && c === CONT_X.length - 1));
        });
    });

    var YARD = {
        x: (CONT_X[0] + CONT_X[CONT_X.length - 1]) / 2,
        z: (CONT_Z[0] + CONT_Z[CONT_Z.length - 1]) / 2,
        h: KIT.CONT.h
    };

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
          at: [YARD.x, YARD.h, YARD.z] },
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
        /* Power on to the containers: east along the plant row, forward up the
           LATERAL aisle between the two columns, then a spine down the
           transverse aisle with a spur to each box. Both legs are routed up an
           aisle on purpose — a riser taken straight off the transformer at
           XFMR.x would run at 2.4 m through the back-left container, which is
           0.19 m shorter than that. */
        var py = 2.4;
        P.pipe(H, yaw, L, [XFMR.x, py, XFMR.z], [YARD.x, py, XFMR.z]);
        P.pipe(H, yaw, L, [YARD.x, py, XFMR.z], [YARD.x, py, YARD.z]);
        P.pipe(H, yaw, L, [CONT_X[0], py, YARD.z], [CONT_X[CONT_X.length - 1], py, YARD.z]);
        CONTAINERS.forEach(function (c) {
            var face = c.z < YARD.z ? c.z + c.d / 2 : c.z - c.d / 2;
            P.pipe(H, yaw, L, [c.x, py, YARD.z], [c.x, py, face]);
        });
        return L;
    }

    /* ---------- Renderables ----------
       One slot per object, as the home page does, so the depth sort can put the
       containers in front of or behind the plant as the pad turns. */

    /* TERRAIN ONLY since the solid pass. This slot used to carry the whole partner
       kit — pad, berm, well, separator, tanks, pipes — behind one anchor at
       [-4, 1.6, -5], and that anchor out-depthed a container at 123 of 180 sampled
       yaws. Under translucent paint the inversion was a 0.04 veil nobody saw; under
       solid paint it was the floor and the tank battery stamped OVER the yard — the
       owner's screenshot, verbatim ("the floor glitches through the rendering").
       Terrain keeps a depth anchor pinned far below anything drawable, the same
       device scene-site's ground uses; the EQUIPMENT moved to slots of its own so
       it sorts against the containers like any other object. */
    function buildGround(H, yaw) {
        var L = H.newLayers();
        P.buildPad(H, yaw, L);
        P.buildBerm(H, yaw, L);
        P.buildPipes(H, yaw, L);
        return L;
    }
    function buildWellSlot(H, yaw) { var L = H.newLayers(); P.buildWell(H, yaw, L); return L; }
    function buildSepSlot(H, yaw)  { var L = H.newLayers(); P.buildSeparator(H, yaw, L); return L; }
    function buildTankSlot(H, yaw) { var L = H.newLayers(); P.buildTanks(H, yaw, L); return L; }

    function buildFlare(H, yaw) {
        var L = H.newLayers();
        P.buildFlareStack(H, yaw, L);
        buildPilot(H, yaw, L);
        return L;
    }

    var RENDERABLES = [
        /* Pinned FIRST two ways, because one was not enough: x = -SHIFT_X (0 here)
           and z = 0 put the anchor on the turntable axis, so its rotZ is 0 at every
           yaw and its depth is a CONSTANT -y*sin(pitch). y is 1000 because the
           viewer can DRAG the pitch down to 3 degrees, where sin is 0.052: y -100
           held the baked 20 degrees comfortably and lost 360 of 360 yaws at 3 (the
           deepest real anchor sits near -17 there, the pin at -100 only -5.2). A
           first draft before that used y -40 at the slot's old x and lost 54 of
           180 yaws at the BAKED pitch alone. Measured twice now, which is why the
           number is 1000 and the axis trick is not optional — dg-suite.js sweeps
           this scene's sort across the whole draggable pitch range. */
        { id: 'ground', at: [0, -1000, 0], build: buildGround },
        { id: 'well',   at: [P.WELL.x, P.WELL_H * 0.5, P.WELL.z], build: buildWellSlot },
        { id: 'sep',    at: [P.SEP.x, P.SEP.y + P.SEP.h * 0.5, P.SEP.z], build: buildSepSlot },
        { id: 'tanks',  at: [(P.TANK_X[0] + P.TANK_X[2]) / 2, P.TANK_H * 0.5, P.TANK_Z], build: buildTankSlot },
        { id: 'tiein',  at: [(P.SEP.x + GAS.x) / 2, 1.5, (P.SEP.z + GAS.z) / 2], build: buildTieIn },
        { id: 'cond',   at: [GAS.x, GAS.h / 2, GAS.z],
          build: function (H, yaw) { return KIT.gas(H, yaw, GAS); } },
        { id: 'gen',    at: [GEN.x, GEN.h / 2, GEN.z],
          build: function (H, yaw) { return KIT.gen(H, yaw, GEN); } },
        { id: 'xfmr',   at: [XFMR.x, XFMR.h / 2, XFMR.z],
          build: function (H, yaw) { return KIT.xfmr(H, yaw, XFMR); } },
        { id: 'flare',  at: [P.FLARE.x, P.FLARE_H / 2, P.FLARE.z], build: buildFlare },
    ].concat(CONTAINERS.map(function (c, i) {
        /* ONE SLOT EACH, not one slot for the yard: the depth sort works per
           slot, so four containers sharing a slot would paint in a fixed order
           and the back row would draw over the front one as the pad turns. */
        return { id: 'cont' + i, at: [c.x, c.h / 2, c.z],
                 build: function (H, yaw) { return KIT.container(H, c, yaw); } };
    }));

    function objects() {
        return [
            /* The old single box stood TANK_H tall over the whole 26x10 because the
               tanks lived in this slot; they have their own boxes now, and terrain
               is knee-high. Union of the new set ~= the old box, so the fit sweep
               and the field occluder see what they always saw. */            /* No 'ground' box: the pad is a backdrop that bleeds off the crop by
               design (dg-crop's BACKDROP set), and boxing it would feed its full
               sweep into allPoints() and the callout-rail fit — measured on the
               landfills, that pushed the sweep to x 209..1071 and failed the rails.
               scene-site.js set the precedent: terrain sorts first by its pinned
               anchor and constrains nothing. */
            { id: 'well',   box: { x: P.WELL.x, y: 0, z: P.WELL.z, w: 1.8, h: P.WELL_H + 0.3, d: 1.8 } },
            { id: 'sep',    box: { x: P.SEP.x, y: 0, z: P.SEP.z, w: P.SEP.w + 0.6, h: P.SEP.y + P.SEP.h + 0.5, d: P.SEP.d + 0.6 } },
            { id: 'tanks',  box: { x: (P.TANK_X[0] + P.TANK_X[2]) / 2, y: 0, z: P.TANK_Z,
                                   w: (P.TANK_X[2] - P.TANK_X[0]) + P.TANK_R * 2 + 0.4,
                                   h: P.TANK_H + 0.3, d: P.TANK_R * 2 + 0.4 } },
            { id: 'tiein',  box: { x: (P.SEP.x + GAS.x) / 2, y: 0, z: (P.SEP.z + GAS.z) / 2,
                                   w: 4, h: 2, d: 8 } },
            { id: 'cond',   box: { x: GAS.x, y: 0, z: GAS.z,
                                   w: GAS.w + 1.6, h: GAS.h + 2.2, d: GAS.d + 1.0 } },
            { id: 'gen',    box: { x: GEN.x, y: 0, z: GEN.z,
                                   w: GEN.w + 0.9, h: GEN.h + 1.6, d: GEN.d + 0.9 } },
            { id: 'xfmr',   box: { x: XFMR.x, y: 0, z: XFMR.z,
                                   w: XFMR.w + 0.9, h: XFMR.h + 0.9, d: XFMR.d + 0.7 } },
            { id: 'flare',  box: { x: P.FLARE.x, y: 0, z: P.FLARE.z,
                                   w: 3.2, h: P.FLARE_H + 1.2, d: 3.2 } },
        ].concat(CONTAINERS.map(function (c, i) {
            return { id: 'cont' + i, box: { x: c.x, y: 0, z: c.z,
                                            w: c.w + 0.3, h: c.h + (c.mast ? 1.8 : KIT.COOLER.h + 0.14),
                                            d: c.d + 0.3 } };
        }));
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
            [YARD.x, y, XFMR.z],
            [YARD.x, y, YARD.z],
            [CONT_X[0], y, YARD.z],
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
