/* ===== PROTON MINING — Energy page scene, LANDFILL state two: with us =====

   The same collection system with our kit on it. The flare comes down to a
   pilot, and the gas the blower was sending to it goes through treatment, into
   an engine, and out to two containers of miners.

   Everything shared with state one comes from landfill-geometry.js, unchanged,
   so the crossfade moves only what actually changes. The kit is the same modules
   as every other page draws, from site-kit.js, at the same sizes — a visitor who
   has seen the home page should recognise the equipment.

   THE KIT STANDS ON THE WORKING AREA, NEVER ON THE CAP. Nothing heavy goes on a
   landfill cap: it settles, and it has a membrane under it. Putting a genset on
   the mound would be the one detail that tells a landfill engineer this drawing
   was made by somebody who has not been to a site. So the row sits on the graded
   pad alongside, which is where it would really go.

   The view block is duplicated verbatim from scene-landfill-now.js and MUST stay
   that way. dg-suite asserts they are equal.

   Geometry only. All machinery lives in diagram-engine.js. */

(function (root, factory) {
    var isNode = (typeof module !== 'undefined' && module.exports);
    var engine = isNode ? require('./diagram-engine.js')    : root.DiagramEngine;
    var land   = isNode ? require('./landfill-geometry.js') : root.LandfillGeometry;
    var kit    = isNode ? require('./site-kit.js')          : root.SiteKit;
    var api = factory(engine, land, kit);
    if (isNode) module.exports = api;
    else {
        root.LandfillIonDiagram = api;
        api.mountWhenReady({ scene: 'landfillion' });
    }
})(typeof self !== 'undefined' ? self : this, function (engine, G, KIT) {
    'use strict';

    /* ---------- Our kit, on the working area ----------
       Sizes from site-kit.js; only the positions are ours. The row runs along the
       front of the pad, clear of the cell toe, in the order the gas travels. */

    /* THE PLANT GETS THE FRONT HALF OF THE GRADED AREA, which is the same
       relationship the wellpad drawing uses: the partner's existing kit across
       the back, ours in front of it, in the order the gas travels.

       It did not, at first. The row sat 2 m off the cell toe with the containers
       immediately behind it, and because the cell is 8.5 m tall and the camera
       looks down at 20 degrees, the mound's projected footprint swallowed the
       treatment skid and the genset — two callouts pointing at objects you could
       not actually see. Pulling the cell's toe back and moving the row out fixed
       what no amount of restyling would have.

       Spacing between the two containers is 4.8 m, matching scene-pad-ion.js, so
       a visitor who has seen either drawing recognises the same yard. */
    var GAS  = { x: -10.0, y: 0, z: 9.2, w: KIT.GAS.w,  h: KIT.GAS.h,  d: KIT.GAS.d };
    var GEN  = { x:  -6.0, y: 0, z: 9.2, w: KIT.GEN.w,  h: KIT.GEN.h,  d: KIT.GEN.d };
    var XFMR = { x:  -2.4, y: 0, z: 9.2, w: KIT.XFMR.w, h: KIT.XFMR.h, d: KIT.XFMR.d };

    function mkCont(x, z, mast) {
        return { x: x, y: 0, z: z, w: KIT.CONT.w, h: KIT.CONT.h, d: KIT.CONT.d, mast: mast };
    }

    /* FOUR CONTAINERS, TWO BY TWO. The landfill has the ground for it in a way
       the wellpad does not, and a bigger cell supports a bigger load — so
       drawing the same two boxes on both sites undersold this one.

       The grid is declared as two axes rather than four positions so the count
       lives in one place: everything below — the renderables, the hover boxes,
       the power runs, the callout anchor — is derived from CONTAINERS and none
       of it needs touching to add a fifth.

       PLACED SO THE DRAWING DOES NOT SHRINK. A 40 ft box is 12.19 m along x, so
       two of them side by side is 25 m of the 32 m pad. The columns sit at -6.2
       and 7.2, which puts the far edge at x 13.3 — level with the flare, which
       was already the widest thing on the site. Two more containers therefore
       cost nothing in scale. Pushed a metre further out they would have started
       charging the mound for the privilege.

       ROWS ARE 7.5 M APART, NOT THE WELLPAD'S 4.8. That spacing was copied over
       first and the drawing came out showing two containers, not four: at a 20
       degree pitch a 2.59 m container hides 7.1 m of ground behind it, so a
       2.4 m aisle left only a third of the back row showing and the two rows
       read as one. At 7.5 m centres about seventy per cent of it clears the
       roof in front and the count is legible.

       It is free, which is why it is 7.5 and not 6: the z extent of this scene
       is set by the back of the cell at -22, nowhere near the containers, so
       the aisle can be as wide as it needs to be without the fitter charging
       the mound for it. A wide aisle is also just what a container yard has —
       they need the air and a truck needs to get between them. */
    var CONT_X = [-6.2, 7.2];
    var CONT_Z = [12.6, 20.1];

    var CONTAINERS = [];
    CONT_Z.forEach(function (cz, r) {
        CONT_X.forEach(function (cx, c) {
            /* One mast for the site, on the far corner. Four would read as four
               separate sites rather than one yard. */
            CONTAINERS.push(mkCont(cx, cz, r === CONT_Z.length - 1 && c === CONT_X.length - 1));
        });
    });

    /* The centre of the yard, for the callout to point at and for the power
       spine to run down. */
    var YARD = {
        x: (CONT_X[0] + CONT_X[CONT_X.length - 1]) / 2,
        z: (CONT_Z[0] + CONT_Z[CONT_Z.length - 1]) / 2,
        h: KIT.CONT.h
    };

    /* ---------- Callouts ----------
       The y positions match scene-landfill-now.js exactly, so the label boxes
       cross-dissolve where they stand instead of jumping between states. */

    var CALLOUTS = [
        { id: 'tiein',  side: 'l', y: 70,  title: 'One tie-in',
          desc: 'We take the gas after your blower. The field is untouched',
          at: [G.BLOWER.x - 2.0, 1.9, G.BLOWER.z] },
        { id: 'cond',   side: 'l', y: 190, title: 'Treatment',
          desc: 'Moisture and contaminants out before the engine sees it',
          at: [GAS.x, GAS.h, GAS.z] },
        { id: 'gen',    side: 'l', y: 310, title: 'Generation',
          desc: 'Reciprocating engines sized to the gas you actually make',
          at: [GEN.x, GEN.h, GEN.z] },
        { id: 'xfmr',   side: 'r', y: 70,  title: 'Transformer',
          desc: 'Stepped to the voltage the containers want',
          at: [XFMR.x, XFMR.h, XFMR.z] },
        { id: 'load',   side: 'r', y: 190, title: 'The load',
          desc: 'Machines that will buy every cubic foot you can send',
          at: [YARD.x, YARD.h, YARD.z] },
        { id: 'flare',  side: 'r', y: 310, title: 'Your flare stays',
          desc: 'Down to a pilot, and ready the moment we stop',
          at: [G.FLARE.x, G.FLARE_H * 0.62, G.FLARE.z] },
    ];

    /* ---------- The pilot ----------
       One small tongue where the lit state has three. Same layer, same language,
       an order of magnitude less of it. */

    function buildPilot(H, yaw, L) {
        var project = H.project, n1 = H.n1;
        var x = G.FLARE.x, z = G.FLARE.z;
        var base = G.FLARE_H - 0.15, r = G.FLARE_R * 0.3;
        var pts = [
            [x - r,       base,        z],
            [x - r * 1.5, base + 0.30, z + 0.04],
            [x + 0.04,    base + 0.70, z + 0.05],
            [x + r * 1.4, base + 0.26, z - 0.04],
            [x + r,       base,        z],
        ];
        var d = '';
        for (var i = 0; i < pts.length; i++) {
            var q = project(pts[i], yaw);
            d += (i ? 'L' : 'M') + n1(q[0]) + ' ' + n1(q[1]);
        }
        L.flame += d + 'Z';
    }

    /* ---------- The tie-in ----------
       The single most important object on this side of the slider: the whole
       physical change to the partner's site. Taken AFTER the blower and the
       knockout, which is the honest place — the field still runs exactly as it
       did, and the flare still gets everything we do not take. */

    /* The service lane the raw gas travels down, between the blower compound
       (z 6.0, deepest face 7.2) and the plant row (z 9.2, nearest face 8.35).
       Nothing stands here, which is the point. */
    var LANE_Z = 7.7;

    function buildTieIn(H, yaw) {
        var L = H.newLayers(), ringY = H.ringY;
        var ty = 1.15;

        /* RAW GAS GOES BEHIND THE ROW, NOT THROUGH IT.

           The knockout is at the east end and the treatment skid at the west,
           so the raw run has to cross the whole yard — and the first version
           crossed it at the row's own z, straight through the genset and the
           transformer: 6.9 m of untreated gas pipe drawn inside two pieces of
           equipment it has no business being inside, and drawn arriving at the
           treated end of the train. Down the lane behind the row, then into the
           skid's back face, which is where it would really go. */
        G.pipe(H, yaw, L, [G.KO.x, ty, G.KO.z], [G.KO.x, ty, LANE_Z]);
        G.pipe(H, yaw, L, [G.KO.x, ty, LANE_Z], [GAS.x, ty, LANE_Z]);
        G.pipe(H, yaw, L, [GAS.x, ty, LANE_Z], [GAS.x, ty, GAS.z - GAS.d / 2]);

        /* The tap on the knockout, on the pipe rather than beside it. The offset
           here was carried over from the wellpad with its sign flipped, which
           left the ring floating 2.2 m out in open air. */
        L.detail += ringY(G.KO.x, ty + 0.3, G.KO.z + 1.4, 0.3, yaw, 8);

        /* Conditioned gas to the engine: the skid's EAST face to the engine's
           WEST face, bridging the gap between the two. It used to run west face
           to east face, which draws a pipe straight across both vessels. */
        G.pipe(H, yaw, L, [GAS.x + GAS.w / 2, ty, GAS.z], [GEN.x - GEN.w / 2, ty, GEN.z]);

        /* Power on to the containers: out of the transformer, up the yard, then
           a spine down the aisle BETWEEN the two rows with a spur to each box.
           With one row a single run reached it; with four containers a run to
           the nearest one and nothing to the others would draw three boxes
           being fed by hope. */
        var py = 2.4;
        G.pipe(H, yaw, L, [XFMR.x, py, XFMR.z], [XFMR.x, py, YARD.z]);
        G.pipe(H, yaw, L, [XFMR.x, py, YARD.z], [CONT_X[CONT_X.length - 1], py, YARD.z]);
        CONTAINERS.forEach(function (c) {
            /* To the face that looks at the aisle, whichever side that is. */
            var face = c.z < YARD.z ? c.z + c.d / 2 : c.z - c.d / 2;
            G.pipe(H, yaw, L, [c.x, py, YARD.z], [c.x, py, face]);
        });
        return L;
    }

    /* ---------- Renderables ----------
       One slot per object, so the depth sort can put the containers in front of
       or behind the mound as the site turns. */

    function buildGround(H, yaw) {
        var L = H.newLayers();
        G.buildPad(H, yaw, L);
        G.buildCell(H, yaw, L);
        G.buildWells(H, yaw, L);
        G.buildHeader(H, yaw, L);
        G.buildPlant(H, yaw, L);
        G.buildYard(H, yaw, L);
        return L;
    }

    function buildFlare(H, yaw) {
        var L = H.newLayers();
        G.buildFlare(H, yaw, L);
        buildPilot(H, yaw, L);
        return L;
    }

    var RENDERABLES = [
        { id: 'ground', at: [G.CELL.x, G.CELL.h * 0.5, G.CELL.z], build: buildGround },
        { id: 'tiein',  at: [(G.KO.x + GAS.x) / 2, 1.15, LANE_Z], build: buildTieIn },
        { id: 'cond',   at: [GAS.x, GAS.h / 2, GAS.z],
          build: function (H, yaw) { return KIT.gas(H, yaw, GAS); } },
        { id: 'gen',    at: [GEN.x, GEN.h / 2, GEN.z],
          build: function (H, yaw) { return KIT.gen(H, yaw, GEN); } },
        { id: 'xfmr',   at: [XFMR.x, XFMR.h / 2, XFMR.z],
          build: function (H, yaw) { return KIT.xfmr(H, yaw, XFMR); } },

        { id: 'flare',  at: [G.FLARE.x, G.FLARE_H / 2, G.FLARE.z], build: buildFlare },
    ].concat(CONTAINERS.map(function (c, i) {
        /* ONE SLOT EACH, not one slot for the yard. The depth sort works per
           slot, so four containers sharing a slot would be painted in a fixed
           order and the back row would draw over the front one from behind as
           the site turns. Four slots, four depths, correct at every angle.

           The closure captures c, so the loop variable cannot follow them. */
        return { id: 'cont' + i, at: [c.x, c.h / 2, c.z],
                 build: function (H, yaw) { return KIT.container(H, c, yaw); } };
    }));

    function objects() {
        return [
            { id: 'ground', box: { x: G.CELL.x, y: 0, z: G.CELL.z,
                                   w: G.CELL.w, h: G.CELL.h, d: G.CELL.d } },
            { id: 'tiein',  box: { x: (G.KO.x + GAS.x) / 2, y: 0, z: LANE_Z,
                                   w: Math.abs(G.KO.x - GAS.x) + 2, h: 2, d: 6 } },
            { id: 'cond',   box: { x: GAS.x, y: 0, z: GAS.z,
                                   w: GAS.w + 1.6, h: GAS.h + 2.2, d: GAS.d + 1.0 } },
            { id: 'gen',    box: { x: GEN.x, y: 0, z: GEN.z,
                                   w: GEN.w + 1.2, h: GEN.h + 1.2, d: GEN.d + 1.0 } },
            { id: 'xfmr',   box: { x: XFMR.x, y: 0, z: XFMR.z,
                                   w: XFMR.w + 1.0, h: XFMR.h + 1.6, d: XFMR.d + 1.0 } },

            { id: 'flare',  box: { x: G.FLARE.x, y: 0, z: G.FLARE.z,
                                   w: G.FLARE_R * 3, h: G.FLARE_H + 1.4, d: G.FLARE_R * 3 } },
        ].concat(CONTAINERS.map(function (c, i) {
            return { id: 'cont' + i, box: { x: c.x, y: 0, z: c.z,
                                            w: c.w + 0.6, h: c.h + 2.0, d: c.d + 0.6 } };
        }));
    }

    /* ---------- Hover regions ---------- */

    function regionBoxes(id) {
        switch (id) {
            case 'tiein': return [{ x: (G.KO.x + GAS.x) / 2, y: 0.4, z: LANE_Z,
                                    w: Math.abs(G.KO.x - GAS.x) + 2, h: 2.2, d: 6 }, G.KO];
            case 'cond':  return [GAS];
            case 'gen':   return [GEN];
            case 'xfmr':  return [XFMR];
            case 'load':  return CONTAINERS;
            case 'flare': return [{ x: G.FLARE.x, y: 0, z: G.FLARE.z,
                                    w: G.FLARE_R * 2.4, h: G.FLARE_H, d: G.FLARE_R * 2.4 }];
        }
        return [];
    }

    /* The run that now ends in the containers rather than the flame: off the cap,
       along the header, through the blower, into treatment, the engine, the
       transformer, and the miners. */
    function buildFlow(H, yaw) {
        var project = H.project, n1 = H.n1;
        var y = 0.42, ty = 1.15;
        var w0 = G.wells()[0];
        var pts = [
            [w0.x, w0.base + G.WELL_H, w0.z],
            [w0.x, y, G.HEADER_Z],
            [G.BLOWER.x, y, G.HEADER_Z],
            [G.BLOWER.x, ty, G.BLOWER.z],
            [G.KO.x, ty, G.KO.z],
            [G.KO.x, ty, LANE_Z],
            [GAS.x, ty, LANE_Z],
            [GAS.x, ty, GAS.z],
            [GEN.x, ty, GEN.z],
            [XFMR.x, 2.4, XFMR.z],
            [XFMR.x, 2.4, YARD.z],
            [CONT_X[0], 2.4, YARD.z],
        ];
        var d = '';
        for (var i = 0; i < pts.length; i++) {
            var q = project(pts[i], yaw);
            d += (i ? 'L' : 'M') + n1(q[0]) + ' ' + n1(q[1]);
        }
        return d;
    }

    var SCENE = {
        /* Duplicated verbatim from scene-landfill-now.js. See the header. */
        view: {
            VB: { w: 1280, h: 470 },
            BASE_PITCH: 20 * Math.PI / 180,
            FOV: 1500,
            BASE_SCALE: 12,
            ORIGIN: { x: 640, y: 262 },
            /* THE SCENE IS SHIFTED ONTO THE PIVOT. SHIFT_X is applied before
               the rotation, so it decides what the drawing turns ABOUT — and a
               site whose mass sits 6 m to one side of the pivot sweeps a circle
               6 m wider than it needs to, which the fitter then has to pay for
               out of BASE_SCALE. The cell is the heavy thing here and it lives
               to the left, so the whole site is nudged right onto the pivot and
               the scale that buys goes straight back into the mound. */
            SHIFT_X: 6.0,
            PERIOD: 44000,
        },
        renderables: RENDERABLES,
        callouts: CALLOUTS,
        flow: buildFlow,
        regionBoxes: regionBoxes,
        objects: objects,
        extraBoxes: function () { return G.extraBoxes(); },
        data: { MODEL: G.MODEL, PAD: G, lit: false },
    };

    return engine.createDiagram(SCENE);
});
