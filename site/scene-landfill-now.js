/* ===== PROTON MINING — Energy page scene, LANDFILL state one: today =====

   A collection system as it stands: wells punched into a capped cell, a header
   main pulling them together, a blower holding the field under vacuum, and a
   flare burning everything it brings up. The orange run ends at the flame — the
   same statement the wellpad scene makes, because it is the same problem.

   The site is not declared here. It comes from landfill-geometry.js, shared
   byte-for-byte with the second state, so that when the slider moves nothing
   under it shifts.

   The view block below is duplicated verbatim in scene-landfill-ion.js and MUST
   stay that way, for the same reason the pad pair must: a different BASE_SCALE
   between the two would rescale the site mid-crossfade and nothing in either
   file would look wrong.

   IT IS DRAWN AT A SMALLER SCALE THAN THE PAD. The cell is 32 m across the toe
   and the flare stands 15 m off to one side, so the scene is wider than the
   wellpad and would overflow at the pad's 16.0.

   BASE_SCALE AND ORIGIN ARE FITTED, NOT CHOSEN. Both were solved for by sweeping
   all 360 degrees and measuring the projected extent of both scenes together —
   scale goes in before the perspective divide, so what fits head-on tells you
   nothing about what fits at three-quarters. An earlier eyeballed 13.6 looked
   correct in a screenshot and ran the cell out under the callout labels and off
   the bottom of the frame as it turned.

   Geometry only. All machinery lives in diagram-engine.js. */

(function (root, factory) {
    var isNode = (typeof module !== 'undefined' && module.exports);
    var engine = isNode ? require('./diagram-engine.js')      : root.DiagramEngine;
    var land   = isNode ? require('./landfill-geometry.js')   : root.LandfillGeometry;
    var api = factory(engine, land);
    if (isNode) module.exports = api;
    else {
        root.LandfillNowDiagram = api;
        api.mountWhenReady({ scene: 'landfillnow' });
    }
})(typeof self !== 'undefined' ? self : this, function (engine, G) {
    'use strict';

    var CREST = [G.CELL.x - 4.5, G.CELL.h, G.CELL.z];

    /* ---------- Callouts. id doubles as the hover region id. ---------- */

    var CALLOUTS = [
        { id: 'cell',   side: 'l', y: 70,  title: 'Your cell',
          desc: 'Capped, settling, and generating gas for decades',
          at: [G.CELL.x - 9, G.CELL.h * 0.62, G.CELL.z + 6] },
        { id: 'wells',  side: 'l', y: 190, title: 'The wellfield',
          desc: 'Vertical extraction wells on a grid across the cap',
          at: CREST },
        { id: 'header', side: 'l', y: 310, title: 'The header',
          desc: 'Every well tied into one main running to the plant',
          at: [G.CELL.x, G.MODEL.PIPE + 0.4, G.HEADER_Z] },
        { id: 'flame',  side: 'r', y: 70,  title: 'Burning it',
          desc: 'Destroyed to meet the permit, earning nothing',
          at: [G.FLARE.x, G.FLARE_H + 1.0, G.FLARE.z] },
        { id: 'flare',  side: 'r', y: 190, title: 'The enclosed flare',
          desc: 'Permitted, inspected, and producing nothing',
          at: [G.FLARE.x, G.FLARE_H * 0.55, G.FLARE.z] },
        { id: 'blower', side: 'r', y: 310, title: 'The blower',
          desc: 'Holding the field under vacuum so the gas comes up at all',
          at: [G.BLOWER.x, G.BLOWER.y + G.BLOWER.h, G.BLOWER.z] },
    ];

    /* ---------- The flame ----------

       SHORTER AND BROADER THAN THE PAD'S. An enclosed flare burns inside its
       shroud; what shows above the lip is a wide, low crown of heat rather than
       the tall tongue a candlestick throws. Drawing it the pad's way would make
       the two scenes read as the same picture with different labels, which is
       exactly what a toggle between them must not do.

       Same construction otherwise — nested tapering tongues in one layer, so the
       stylesheet flickers them out of phase with nothing recomputed per frame. */

    /* Wider and taller than it was. The point of this state is that the gas is
       being destroyed, and at the old 1.35 x 1.9 the crown came to a smudge a
       few pixels across — the one thing the drawing has to say, said too
       quietly to hear. The ROOT is unchanged and still leaves the shroud at the
       bore; it is the part above the lip that grew. */
    var WIDEST = 1.75;

    function buildFlame(H, yaw, L) {
        var project = H.project, n1 = H.n1;
        var x = G.FLARE.x, z = G.FLARE.z;
        var base = G.FLARE_H - 0.15;

        function tongue(wide, height, lean, twist) {
            var r = G.FLARE_R * 0.55 * (wide / WIDEST);
            var pts = [
                [x - r,           base,                 z],
                [x - wide,        base + height * 0.40, z + twist],
                [x - wide * 0.55, base + height * 0.74, z + twist],
                [x + lean,        base + height,        z + twist * 1.5],
                [x + wide * 0.60, base + height * 0.70, z - twist],
                [x + wide,        base + height * 0.36, z - twist],
                [x + r,           base,                 z],
            ];
            var d = '';
            for (var i = 0; i < pts.length; i++) {
                var q = project(pts[i], yaw);
                d += (i ? 'L' : 'M') + n1(q[0]) + ' ' + n1(q[1]);
            }
            return d + 'Z';
        }

        L.flame += tongue(WIDEST, 3.0, 0.24, 0.20);   // envelope
        L.flame += tongue(1.05, 2.15, 0.14, -0.12);   // core
        L.flame += tongue(0.55, 1.30, 0.05, 0.06);    // the bright centre
    }

    /* ---------- Renderables ----------
       Two, so the depth sort can put the flare in front of or behind the mound
       as the site turns. */

    /* Twin of scene-landfill-ion.js's three-way split — its buildGround note has
       the reasoning; the two states share a camera and must sort identically or
       the crossfade would reorder the plant mid-slide. */
    function buildGround(H, yaw) {
        var L = H.newLayers();
        G.buildPad(H, yaw, L);
        G.buildYard(H, yaw, L);
        return L;
    }
    function buildCellSlot(H, yaw) {
        var L = H.newLayers();
        /* Two passes around the dome — see scene-landfill-ion.js's twin and
           landfill-geometry.js cellHalf() for the ghost-mound failure this ends. */
        G.buildWells(H, yaw, L, 'far');
        G.buildHeader(H, yaw, L, 'far');
        G.buildCell(H, yaw, L);
        G.buildWells(H, yaw, L, 'near');
        G.buildHeader(H, yaw, L, 'near');
        return L;
    }
    function buildPlantSlot(H, yaw) { var L = H.newLayers(); G.buildPlant(H, yaw, L); return L; }

    function buildFlare(H, yaw) {
        var L = H.newLayers();
        G.buildFlare(H, yaw, L);
        buildFlame(H, yaw, L);
        return L;
    }

    var RENDERABLES = [
        { id: 'ground', at: [-6.0, -100, 0], build: buildGround },
        { id: 'cell',   at: [G.CELL.x, G.CELL.h * 0.5, G.CELL.z], build: buildCellSlot },
        { id: 'plant',  at: [G.BLOWER.x, 1.0, G.BLOWER.z], build: buildPlantSlot },
        { id: 'flare',  at: [G.FLARE.x, G.FLARE_H / 2, G.FLARE.z], build: buildFlare },
    ];

    function objects() {
        return [
            /* No 'ground' box: the pad is a backdrop that bleeds off the crop by
               design (dg-crop's BACKDROP set), and boxing it would feed its full
               sweep into allPoints() and the callout-rail fit — measured on the
               landfills, that pushed the sweep to x 209..1071 and failed the rails.
               scene-site.js set the precedent: terrain sorts first by its pinned
               anchor and constrains nothing. */
            { id: 'cell',   box: { x: G.CELL.x, y: 0, z: G.CELL.z,
                                   w: G.CELL.w, h: G.CELL.h, d: G.CELL.d } },
            { id: 'plant',  box: { x: G.BLOWER.x, y: 0, z: G.BLOWER.z,
                                   w: G.BLOWER.w + 1.0, h: G.BLOWER.y + G.BLOWER.h + 0.5, d: G.BLOWER.d + 1.0 } },
            { id: 'flare',  box: { x: G.FLARE.x, y: 0, z: G.FLARE.z,
                                   w: G.FLARE_R * 3, h: G.FLARE_H + 2.6, d: G.FLARE_R * 3 } },
        ];
    }

    /* ---------- Hover regions ---------- */

    function regionBoxes(id) {
        switch (id) {
            case 'cell':   return [{ x: G.CELL.x, y: 0, z: G.CELL.z,
                                     w: G.CELL.w, h: G.CELL.h, d: G.CELL.d }];
            case 'wells':  return G.wells().map(function (w) {
                                return { x: w.x, y: w.base, z: w.z,
                                         w: 1.4, h: G.WELL_H + 0.8, d: 1.4 };
                            });
            case 'header': return [{ x: G.CELL.x, y: 0, z: G.HEADER_Z,
                                     w: G.CELL.w * 0.8, h: 1.0, d: 1.4 }];
            case 'flame':  return [{ x: G.FLARE.x, y: G.FLARE_H, z: G.FLARE.z,
                                     w: 3.0, h: 2.6, d: 3.0 }];
            case 'flare':  return [{ x: G.FLARE.x, y: 0, z: G.FLARE.z,
                                     w: G.FLARE_R * 2.4, h: G.FLARE_H, d: G.FLARE_R * 2.4 }];
            case 'blower': return [G.BLOWER_SKID, G.BLOWER, G.KO];
        }
        return [];
    }

    /* The run that ends in the flame: down the cap, along the header, through
       the blower and the knockout, and up into the shroud. Same marching dashes
       the other scenes use for energy going somewhere — here it goes nowhere.

       Two things G does for this path that the old one lacked. The descent leg
       rides the cap (flowDescent) instead of cutting a chord through the mound,
       and the whole run is clipped against the dome (flowClip): the flow is
       drawn above every slot, so for a third of the turn the header's stretch
       behind the hill printed straight across the solid face. Where the run
       dips behind, it now ends in an arrowhead at the hillside — see the note
       on flowClip in landfill-geometry.js. */
    function buildFlow(H, yaw) {
        var y = 0.42;
        var w0 = G.wells()[0];
        var pts = G.flowDescent(w0, y).concat([
            [G.BLOWER.x, y, G.HEADER_Z],
            [G.BLOWER.x, 1.15, G.BLOWER.z],
            [G.KO.x, 1.15, G.KO.z],
            [G.FLARE.x, 1.15, G.FLARE.z],
            [G.FLARE.x, G.FLARE_H - 0.25, G.FLARE.z],
        ]);
        return G.flowClip(H, yaw, pts);
    }

    var SCENE = {
        /* Duplicated verbatim in scene-landfill-ion.js. See the header. */
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
        data: { MODEL: G.MODEL, PAD: G, lit: true },
    };

    return engine.createDiagram(SCENE);
});
