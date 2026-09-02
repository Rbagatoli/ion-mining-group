/* ===== PROTON MINING — Hosting page scene =====
   Inside one hosted container, seen close: the customer's machines racked
   against the far wall, with the things hosting actually provides called out —
   the coolant plant, the closed loop that reaches every machine, metered power,
   network, spares, and the dry cooler on the roof.

   HYDRO, NOT AIR, AND THAT IS MOST OF WHAT THIS FILE IS. Until now this drawing
   was an air-cooled container: nine louvres and two filter frames at one end,
   four exhaust fans at the other, a twin fan pair with grille rings on the face
   of every machine, and an airflow run in at the filters and out the door. The
   machine it is a picture of is an S21+ Hyd — a sealed box on a closed OD10
   coolant loop with NO FANS AT ALL — so every one of those parts was equipment
   we do not install, drawn at the loudest weight on the page. Air never crosses
   a machine here. The heat leaves in water and only meets air once, in the dry
   cooler standing on the roof.

   WHAT CARRIES THE TELL AT EACH SIZE, because it is not the same thing twice.
   A hydro container and an air-cooled one are the same white box; the couplings
   and the manifold branches are what say which it is up close, and they are
   hairlines that wash out on a phone. So the two objects that have to survive
   the 350 x 129 px phone rendering — the CDU cabinet and the roof cooler — are
   built as MASS, in the filled face layers, exactly as site-kit.js container()
   builds its cooler and for the reason written out there.

   Deliberately narrower than the home page scene. A hosting customer does not
   care about the gas skid; and because there is only one container here and
   fewer columns in it, each machine draws at roughly double the size it does on
   the home page — enough for the quick-disconnect pair, the control strip and
   the status LED to read.

   Geometry only. All machinery lives in diagram-engine.js; builders receive its
   helper bundle as H rather than reaching for globals. */

(function (root, factory) {
    /* TWO dependencies now, where there was one. The cooler on this roof has to
       be the same object site-kit.js already stands on every other container the
       site draws, and a second copy of its dimensions in this file is precisely
       how the two drawings of a container drifted apart before the kit existed —
       a 1.7 m cube on one page and a 4.4 m box on the other. So the numbers are
       imported and never restated.

       The browser half of this wrapper reads a GLOBAL, which means hosting.html
       has to load site-kit.js before this file, the way index.html already does
       for scene-site.js. */
    var isNode = (typeof module !== 'undefined' && module.exports);
    var engine = isNode ? require('./diagram-engine.js') : root.DiagramEngine;
    var kit    = isNode ? require('./site-kit.js')       : root.SiteKit;
    var api = factory(engine, kit);
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
})(typeof self !== 'undefined' ? self : this, function (engine, KIT) {
    'use strict';

    /* ---------- Scene, in metres ---------- */

    var C = { x: 0, y: 0, z: 0, w: 12.19, h: 2.59, d: 2.44 };   // one 40ft shell

    var COLS = 7, TIERS = 3;
    var AS = { w: 1.05, h: 0.54, d: 0.86 };   // drawn generously; legibility beats census

    var RACK_Z = C.z - C.d / 2 + 0.72;        // against the far wall
    var TIER_DY = AS.h + 0.22;
    var RACK_Y0 = 0.26;

    /* Clear of the CDU at one end and the doors at the other. It used to say
       "clear of the intake and door plenums", and there are no plenums in a
       hydro container — the space at the far end is the coolant cabinet's now. */
    var SPAN = C.w - 3.4;
    var PITCH_X = SPAN / COLS;
    var RACK_X0 = C.x - C.w / 2 + 2.0;

    var PDU = { x: C.x + C.w / 2 - 1.5, y: 0, z: C.z + C.d / 2 - 0.55, w: 0.62, h: 1.9, d: 0.42 };
    var SWITCH = { x: C.x + C.w / 2 - 2.6, y: 1.55, z: C.z + C.d / 2 - 0.5, w: 0.5, h: 0.34, d: 0.34 };
    /* Pushed back to the end wall to make room for the CDU beside it. At its old x the two
       cabinets and the rack all wanted the same stretch of aisle, and the CDU lost: see the
       note on CDU below. 0.10 m of clearance to the inner wall. */
    var SPARES = { x: C.x - C.w / 2 + 0.5, y: 0, z: C.z + C.d / 2 - 0.6, w: 0.8, h: 1.3, d: 0.5 };

    /* THE CDU — the pump and plate-exchanger cabinet that moves heat out of the
       machine loop and into the roof loop. It is a real cabinet, roughly a rack
       bay of floor space and most of the container's height, so it is drawn as a
       box and not as a symbol: on a phone the couplings and the manifolds are
       gone and this plus the roof cooler are the only two things left that say
       the container is water-cooled.

       Standing in the aisle at the far end, in the run the filter wall and its
       plenum used to occupy — the one place freed up by the switch away from
       air, and next to the spares cabinet so the two service items are together
       rather than at opposite ends.

       X IS MEASURED, NOT CHOSEN. At x -4.05 the cabinet's right edge reached 0.445 m PAST
       RACK_X0, so at the resting angle it covered 22% of column 0's machine faces — and
       because a column's branch pipes are in 'detail', which paints above 'side', the
       plumbing drew ON the cabinet's front face. The column read as plumbed into the CDU
       rather than into the manifold. It is not a 3D collision (the racks are at z -0.5 and
       this is at +0.60, 1.1 m apart); it is projection, so it had to be measured in screen
       space rather than reasoned about in world space.

       Sweeping candidates over the yaw band the figure is actually read in (+/-45 deg of the
       baked frame; past that you are looking through the back wall and everything in a
       cutaway overlaps everything), x -4.55 with SPARES pushed to the end wall is the first
       pair where BOTH the rack and the spares overlap are 0.0% at rest. It also puts the
       cabinet's right edge at -4.15, entirely clear of RACK_X0 at -4.095, which is what
       makes the SPAN comment above true rather than aspirational. */
    var CDU = { x: C.x - 4.55, y: 0, z: C.z + C.d / 2 - 0.62, w: 0.8, h: 2.0, d: 0.55 };

    /* THE MANIFOLDS. Supply and return run the length of the rack, and a branch
       pair rises off them to every column. This is what replaced the cold aisle:
       what feeds the machines is pipe, so the run that matters goes along the
       rack, not along the floor in front of its face as moving air did.

       ALONG THE BASE, NOT OVERHEAD, and that is a drawing decision as much as a
       plumbing one. The first version ran the pair above the top tier, which is
       where a header with drops belongs — and there is 0.27 m of headroom up
       there, already occupied by the cable tray. Rendered, the tray at z -0.72
       and the manifolds at z -0.02 landed within a few pixels of each other and
       the three objects fused into one bright bar across the whole container: it
       read as a shelf, and nothing about it said pipe. There was no separation
       left to buy, because the ceiling is 0.27 m above the machines and three
       objects do not fit in it. The band under the bottom tier is empty, is the
       same 0.26 m, and has nothing to collide with.

       Stacked in y rather than separated in z. Depth projects almost straight
       down the screen at yaw 0, so a z separation of the size available here
       collapses to a couple of pixels and the two runs land on top of each
       other — the same trap the overhead version fell into. site-kit.js makes
       the opposite choice for the pair on the roof, where the pipes lie flat and
       depth is the only axis with any room in it.

       Thin, and set as far apart as that 0.26 m allows, because the pair has to
       read AS A PAIR. At 0.09 m of pipe on a 0.12 m pitch the gap between them
       came to 2 px of screen and the two runs fused into one bar — the same
       failure as running them overhead, only quieter. Trading a millimetre of
       apparent pipe for a millimetre of gap is worth it every time: one bar is a
       shelf, and two bars are plumbing. */
    var MAN_Y = 0.03, MAN_H = 0.07, MAN_SEP = 0.15;
    var MAN_Z = RACK_Z + AS.d / 2 + 0.05;
    var MAN_X0 = CDU.x - 0.28, MAN_X1 = RACK_X0 + SPAN + 0.15;

    /* The branches, and the quick-disconnects they land on, sit ON the rack face
       — one plane, a few millimetres proud of it. The first attempt stood them
       off in the aisle where the pipework really runs, and every stub from a
       branch to a coupling became a pure z displacement: at yaw 0 that is 1 px
       of screen travel, so 42 couplings connected to nothing visible. */
    var RISER_Z = RACK_Z + AS.d / 2 + 0.012;
    var RISER_SEP = 0.09;                      // supply and return, side by side
    var RISER_TOP = RACK_Y0 + (TIERS - 1) * TIER_DY + AS.h * 0.5 + 0.22;
    var QD_R = 0.07, QD_DY = 0.13;             // coupling radius, and their spacing up the face

    /* THE ROOF DRY COOLER. Dimensions from the kit, never restated here — this
       scene draws its own shell instead of calling KIT.container(), so the one
       thing that must not drift is the size and stance of the object standing on
       it. Everything below is derived; nothing below is a second opinion.

       Checked by name, and loudly, because the browser resolves this dependency
       through a global rather than a require: with site-kit.js missing from the
       page the next line throws "Cannot read properties of undefined (reading
       'COOLER')" from what looks like a typo, and the actual fault is a script
       tag two hundred lines away in a file this one does not own. */
    if (!KIT || !KIT.COOLER) {
        throw new Error('scene-hosting.js: site-kit.js must load before it (SiteKit global)');
    }
    var COOL = KIT.COOLER;
    var COOL_X0 = C.x - C.w / 2 + COOL.inX, COOL_X1 = C.x + C.w / 2 - COOL.inX;
    var COOL_Z0 = C.z - C.d / 2 + COOL.inZ,  COOL_Z1 = C.z + C.d / 2 - COOL.inZ;
    var COOL_ZR0 = C.z - COOL.ridge / 2,     COOL_ZR1 = C.z + COOL.ridge / 2;
    var COOL_YB = C.h + COOL.plinth, COOL_YT = COOL_YB + COOL.slope;
    var COOL_FAN = [COOL_X0 + (COOL_X1 - COOL_X0) * 0.24,
                    COOL_X0 + (COOL_X1 - COOL_X0) * 0.76];

    function racks() {
        var out = [];
        for (var t = 0; t < TIERS; t++)
            for (var c = 0; c < COLS; c++)
                out.push({ x: RACK_X0 + PITCH_X * (c + 0.5), y: RACK_Y0 + t * TIER_DY,
                           z: RACK_Z, w: AS.w, h: AS.h, d: AS.d, tier: t, col: c, cont: C });
        return out;
    }
    var RACKS = racks();

    var MODEL = { container: C, pdu: PDU, sw: SWITCH, spares: SPARES, cdu: CDU,
                  cols: COLS, tiers: TIERS, asic: AS };

    /* ---------- Callouts. id doubles as the hover region id. ----------

       Three of these were pure air and had to go, not be reworded: 'intake'
       (Filtered intake) and 'cold' (Cold aisle) pointed at a filter wall and an
       aisle that no longer exist, and 'hot' (Hot aisle) named the exhaust end of
       a container that has no exhaust. They are replaced in place — same y, same
       column — by the three things that actually do the cooling: the CDU, the
       closed loop, and the cooler on the roof.

       'spares' was reworded rather than replaced. It said "Hashboards, PSUs and
       fans", and a hydro fleet holds no fans at all; what it does hold is the
       couplings and hoses the loop is made of.

       EVERY desc IS LENGTH-CONSTRAINED. Bubble height is derived from
       desc.length by host-suite.js and dg-regress.js — 21 + ceil(len * 6 /
       (wrapW * 0.172 - 26)) * 17 + 22 — and cards sit on a 100 px pitch, so two
       neighbours may not both grow. At 845px, the narrower of the two widths
       checked, three lines is 94 px and four is 111: two four-line cards collide
       and nothing about the page looks wrong until someone reads it at that
       width. Three lines means 59 characters. The longest below is 56. */

    var CALLOUTS = [
        { id: 'cdu',    side: 'l', y: 60,  title: 'Coolant distribution',
          desc: 'Pumps and a plate exchanger between the two loops',
          at: [CDU.x, CDU.h, CDU.z + CDU.d / 2] },
        { id: 'loop',   side: 'l', y: 160, title: 'Closed coolant loop',
          desc: 'Supply and return manifolds; no air touches a machine',
          at: [C.x - 2.2, MAN_Y + MAN_SEP + MAN_H, MAN_Z + MAN_H / 2] },   // top-front edge of the return run
        { id: 'spares', side: 'l', y: 260, title: 'On-site spares',
          desc: 'Hashboards, PSUs and couplings held at the site',
          at: [SPARES.x, SPARES.h, SPARES.z] },
        { id: 'shell',  side: 'l', y: 360, title: 'Retrofitted shell',
          desc: 'A 40 ft container rebuilt for power, cooling and racking',
          /* Out at x -5.6, on the strip of bare roof the cooler does not cover. This anchor
             was inherited from before the roof had anything on it, at C.x - 3.2, which is
             inside the cooler plinth's own volume — so the leader labelled "Retrofitted
             shell" landed on the object that has its own separate callout. The leader test
             cannot catch that: it only asks that the tip be near SOME drawn edge, and the
             cooler supplies plenty. The cooler spans x -5.19..5.19 (KIT.COOLER.inX 0.90 off
             each end), and the corner casting starts at -5.915, so -5.6 is roof and only
             roof. */
          at: [C.x - 5.6, C.h, C.z - C.d / 4] },
        { id: 'asics',  side: 'r', y: 60,  title: 'Your machines',
          desc: 'Racked, asset-tagged, and pointed at your own pool',
          at: [C.x - 0.4, RACK_Y0 + 2 * TIER_DY + AS.h, RACK_Z + AS.d / 2] },
        { id: 'pdu',    side: 'r', y: 160, title: 'Metered at the PDU',
          desc: 'Billed on the power you actually draw, not nameplate',
          at: [PDU.x, PDU.h, PDU.z + PDU.d / 2] },
        { id: 'net',    side: 'r', y: 260, title: 'Network',
          desc: 'Redundant uplink; your pool endpoints open by default',
          at: [SWITCH.x, SWITCH.y + SWITCH.h, SWITCH.z + SWITCH.d / 2] },
        /* Anchored on a fan lying in the cooler's ridge, not on the frame's
           outline. The ridge deck's own edges are 0.31 m either side of the
           anchor in DEPTH, which is 6 px at yaw 0 and 16 px at yaw 90 — inside
           the leader test's 18 px but only just, and it moves with the pitch.
           The fan rings are drawn with ringY at every angle and never culled, so
           the centre of one is a fixed few pixels from drawn geometry whatever
           the scene is doing. */
        { id: 'cool',   side: 'r', y: 360, title: 'Roof dry cooler',
          desc: 'Where the loop meets air, up on the container roof',
          at: [COOL_FAN[1], COOL_YT + 0.01, C.z] },
    ];

    /* ---------- The container ---------- */

    function buildShell(H, yaw) {
        var addBox = H.addBox, line = H.line, ring = H.ring, ringY = H.ringY,
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
        /* SEALED BOXES. What used to be here was a twin fan ring with a grille
           ring inside each, at rr = 0.40 of the machine's half-width — the
           largest and loudest thing on the face, and a drawing of a part the
           S21+ Hyd does not have. A hydro miner joins the loop at two
           quick-disconnect couplings and is otherwise closed, so that is what
           the face carries now: two small couplings fed by short stubs off the
           column's branch pair, plus the control strip and the status LED it
           does have.

           The couplings are deliberately quiet. They are about 8 px across at
           desktop and gone at 350 px, and that is the right answer: they are
           not what makes this read as hydro on a phone, and drawing them at fan
           size to make them survive would put the wrong part back in exactly
           the place the fans were. The CDU and the roof cooler carry the phone. */
        for (var i = 0; i < RACKS.length; i++) {
            var u = RACKS[i], f = boxFaces(u);
            for (var k in f) if (frontFacing(f[k], yaw)) L.asics += poly(f[k], yaw);

            var cy = u.y + u.h / 2;
            var qx = u.x - u.w * 0.20;                    // where the couplings sit
            var b1 = u.x - u.w * 0.44, b2 = b1 + RISER_SEP;
            /* 'inner', not 'detail': stubs and couplings live on the rack face,
               and from behind the solid far wall below has to hide them or the
               wall wears all 42 couplings on its outside — the kit container's
               control-strip failure, at 3.6x the size. */
            L.inner += line([b1, cy - QD_DY, RISER_Z], [qx, cy - QD_DY, RISER_Z], yaw);
            L.inner += line([b2, cy + QD_DY, RISER_Z], [qx, cy + QD_DY, RISER_Z], yaw);
            L.inner += ring(qx, cy - QD_DY, RISER_Z, QD_R, yaw, 8);
            L.inner += ring(qx, cy + QD_DY, RISER_Z, QD_R, yaw, 8);

            /* Control strip and status LED. Both moved to the right of the face:
               the left third is the branches' now, and the strip used to run
               straight through where they climb. */
            var fz = u.z + u.d / 2 + 0.008;
            L.inner += line([u.x + u.w * 0.02, u.y + u.h - 0.08, fz],
                            [u.x + u.w * 0.32, u.y + u.h - 0.08, fz], yaw);
            L.inner += ring(u.x + u.w * 0.42, u.y + u.h - 0.08, fz, 0.035, yaw, 6);
            /* Power and network tails at the back — 'back', not 'inner'. A tail
               hangs 0.87 m behind the machine face, which at the 22 deg pitch
               projects 0.87 x sin(22) = 0.33 m (17 units) UP the face — so in
               any layer painted after 'asics' the whole 0.2 m tail lands as a
               hairline across the middle of its own machine's front. It lives in
               the dark band with the rack uprights, so it takes their layer and
               their rule: hidden by the machines from the front, by the far wall
               from behind, and seen through the gaps at oblique yaws. */
            L.back += line([u.x + u.w * 0.3, u.y + 0.06, u.z - u.d / 2 - 0.006],
                           [u.x + u.w * 0.3, u.y - 0.14, u.z - u.d / 2 - 0.006], yaw);
        }

        // --- in front of the machines ---
        // Cable tray under the ceiling, with cable drops to each rack column.
        addBox(L, { x: C.x, y: y1 - 0.3, z: z0 + 0.5, w: C.w - 1.0, h: 0.1, d: 0.3 }, yaw);
        for (var d2b = 0; d2b < COLS; d2b++) {
            var dx = RACK_X0 + PITCH_X * (d2b + 0.5);
            /* 'inner': the drops hang inside the shell, and from behind they were
               seven evenly spaced hairlines striping the far wall. */
            L.inner += line([dx, y1 - 0.3, z0 + 0.5],
                            [dx, RACK_Y0 + TIERS * TIER_DY, z0 + 0.5], yaw);
        }

        /* NO STRIP LIGHTS, AND THEY WERE DRAWN AND MEASURED OUT. The real container has
           an LED batten row over the rack line, and two versions of one were rendered at
           the real page sizes: four twin-line fixtures at y1 - 0.05, and again at
           y1 - 0.12 when the first landed on the bright roof band. The arithmetic said
           the band between the tray and the top tier was free — 2.3 px below the tray
           band, 3.6 px above the tier at desktop — and the render said that band is not
           a band: it is the roofline's own gradient with seven cable drops running
           through it, and at 1x the fixtures never separate from it. At the phone crop
           the before and after images are indistinguishable. Detail that only exists at
           3x zoom is ink, not information, so they went the way of the per-column
           risers in site-kit.js. */

        /* FLOOR DRAIN BY THE CDU. The one piece of floor hardware a water-cooled hall
           actually has: the containment drain, and it belongs next to the cabinet with
           the pumps in it. A ring lying in the floor (ringY — ring() would stand it on
           edge) with one cross bar for the grate. Deliberately not a containment lip
           along the rack line: a lip is a third horizontal hairline at floor level a few
           pixels under the manifold pair, which is precisely the fused-bar failure the
           manifold note documents. At desktop the drain is an 11 x 4 px ellipse on open
           grating; at the phone crop it is 5 x 2 px and gone, which is the right way
           down. */
        /* 'inner': floor hardware, hidden with the floor once the far wall faces
           the viewer. */
        L.inner += ringY(CDU.x + 1.0, 0.012, C.z + 0.35, 0.10, yaw, 8);
        L.inner += line([CDU.x + 0.9, 0.012, C.z + 0.35], [CDU.x + 1.1, 0.012, C.z + 0.35], yaw);

        /* Supply and return manifolds, as boxes rather than lines. Each is only
           70 mm of pipe — under 4 units of viewBox — but it runs nearly the
           whole length of the container, and a filled bar that long still reads
           as one object when the drawing is scaled down. Drawn as a stroked pair
           instead, they are the first thing to go: 'detail' is 0.8 units wide,
           which is a quarter of a pixel at 350. */
        var manX = (MAN_X0 + MAN_X1) / 2, manW = MAN_X1 - MAN_X0;
        addBox(L, { x: manX, y: MAN_Y,           z: MAN_Z, w: manW, h: MAN_H, d: MAN_H }, yaw);
        addBox(L, { x: manX, y: MAN_Y + MAN_SEP, z: MAN_Z, w: manW, h: MAN_H, d: MAN_H }, yaw);

        // A branch off each manifold into every column, up the face of the rack.
        // 'inner' with the couplings they feed: the loop is the drawing's whole
        // subject, and from behind it was the loudest thing on the blank wall.
        for (var bc = 0; bc < COLS; bc++) {
            var bx = RACK_X0 + PITCH_X * (bc + 0.5) - AS.w * 0.44;
            L.inner += line([bx, MAN_Y + MAN_H / 2, RISER_Z],
                            [bx, RISER_TOP, RISER_Z], yaw);
            L.inner += line([bx + RISER_SEP, MAN_Y + MAN_SEP + MAN_H / 2, RISER_Z],
                            [bx + RISER_SEP, RISER_TOP, RISER_Z], yaw);
        }

        /* The CDU. Pump volutes low, the plate exchanger's stack of plates above
           them, and the controller window at the top — the three things that
           make a coolant cabinet look like one rather than like a second spares
           locker standing beside the first. */
        addBox(L, CDU, yaw);
        /* Face detail in 'detail', gated by the face it rides — the door-hardware
           pattern, NOT 'inner'. 'inner' paints before the shell buckets, so there
           the cabinet's own front fill covered these marks from the front while
           the far wall covered them from behind: 38 strokes across these four
           cabinets, visible from no yaw at all, and three callouts anchored to
           featureless boxes (the part-two reviewer's pixel probes). Guarded by
           the cabinet's own front face, the marks travel with the surface they
           are on: gone with it from behind, above its fill from the front. The
           marks sit 6 mm proud of the tested plane, so the flip band is ~0.01
           degree — edge-on hairlines, nothing readable. */
        var cz = CDU.z + CDU.d / 2 + 0.006;
        if (frontFacing(boxFaces(CDU).front, yaw)) {
            L.detail += ring(CDU.x - 0.17, 0.42, cz, 0.13, yaw, 10);
            L.detail += ring(CDU.x + 0.17, 0.42, cz, 0.13, yaw, 10);
            for (var xp = 1; xp <= 5; xp++) {
                var xy = 0.95 + xp * 0.13;
                L.detail += line([CDU.x - 0.28, xy, cz], [CDU.x + 0.28, xy, cz], yaw);
            }
            L.detail += line([CDU.x - 0.2, 1.80, cz], [CDU.x + 0.2, 1.80, cz], yaw);
            L.detail += line([CDU.x - 0.2, 1.92, cz], [CDU.x + 0.2, 1.92, cz], yaw);
            L.detail += line([CDU.x - 0.2, 1.80, cz], [CDU.x - 0.2, 1.92, cz], yaw);
            L.detail += line([CDU.x + 0.2, 1.80, cz], [CDU.x + 0.2, 1.92, cz], yaw);
        }

        /* Machine-side pair, out of the foot of the cabinet and onto the two
           manifolds; and the roof-side pair, out of the top and straight up
           through the roof into the cooler's plinth. The two pairs leave the
           same 0.8 m box, so they leave it at different heights AND different x:
           taken off one face at one x, four pipes project as two. */
        L.inner += line([CDU.x - 0.28, 0.30, CDU.z - CDU.d / 2],
                        [CDU.x - 0.28, MAN_Y + MAN_H / 2, MAN_Z], yaw);
        L.inner += line([CDU.x + 0.28, 0.30, CDU.z - CDU.d / 2],
                        [CDU.x + 0.28, MAN_Y + MAN_SEP + MAN_H / 2, MAN_Z], yaw);
        /* The riser pair is 'inner' for its whole run, the above-roof stretch
           included: it climbs at CDU.z (z +0.60), and the plinth's front face is
           at COOL_Z1 (z +1.00) covering exactly the roof..plinth-top band the
           pipes cross — so in 'detail' they striped the plinth's face from the
           front, and in 'inner' the plinth hides the stretch that is physically
           inside it. Nothing here is the kit's exterior ridge pair: this scene
           draws no roof pipes, and the orange flow circuit is the only thing on
           the ridge. */
        L.inner += line([CDU.x - 0.10, CDU.h, CDU.z], [CDU.x - 0.10, COOL_YB, CDU.z], yaw);
        L.inner += line([CDU.x + 0.10, CDU.h, CDU.z], [CDU.x + 0.10, COOL_YB, CDU.z], yaw);

        // PDU: breaker rows and a metering window.
        addBox(L, PDU, yaw);
        // Same gate as the CDU's, and for the next two cabinets: face marks in
        // 'detail' behind their own face's facing.
        var pz = PDU.z + PDU.d / 2 + 0.006;
        if (frontFacing(boxFaces(PDU).front, yaw)) {
            for (var p = 1; p <= 6; p++) {
                L.detail += line([PDU.x - 0.24, PDU.h * p / 8, pz], [PDU.x + 0.24, PDU.h * p / 8, pz], yaw);
            }
            L.detail += line([PDU.x - 0.2, PDU.h * 0.86, pz], [PDU.x + 0.2, PDU.h * 0.86, pz], yaw);
            L.detail += line([PDU.x - 0.2, PDU.h * 0.94, pz], [PDU.x + 0.2, PDU.h * 0.94, pz], yaw);
            L.detail += line([PDU.x - 0.2, PDU.h * 0.86, pz], [PDU.x - 0.2, PDU.h * 0.94, pz], yaw);
            L.detail += line([PDU.x + 0.2, PDU.h * 0.86, pz], [PDU.x + 0.2, PDU.h * 0.94, pz], yaw);
        }

        // Network switch with port row, and its drop to the tray.
        addBox(L, SWITCH, yaw);
        var sz = SWITCH.z + SWITCH.d / 2 + 0.006;
        if (frontFacing(boxFaces(SWITCH).front, yaw)) {
            for (var s2 = 0; s2 < 8; s2++) {
                var sx = SWITCH.x - 0.2 + 0.4 * s2 / 7;
                L.detail += line([sx, SWITCH.y + 0.1, sz], [sx, SWITCH.y + 0.2, sz], yaw);
            }
        }
        /* The drop stays 'inner': it is not ON the face — a cable in the open
           air above the box, so no fill of its own covers it from the front,
           and the far wall (painted after 'inner') hides it from behind. */
        L.inner += line([SWITCH.x, SWITCH.y + SWITCH.h, sz], [SWITCH.x, y1 - 0.3, sz], yaw);

        // Spares rack: three shelves of boards and PSUs.
        addBox(L, SPARES, yaw);
        var qz = SPARES.z + SPARES.d / 2 + 0.006;
        if (frontFacing(boxFaces(SPARES).front, yaw)) {
            for (var q = 1; q <= 3; q++) {
                var qy = SPARES.h * q / 4;
                L.detail += line([SPARES.x - 0.34, qy, qz], [SPARES.x + 0.34, qy, qz], yaw);
                L.detail += line([SPARES.x - 0.16, qy, qz], [SPARES.x - 0.16, qy + 0.2, qz], yaw);
                L.detail += line([SPARES.x + 0.16, qy, qz], [SPARES.x + 0.16, qy + 0.2, qz], yaw);
            }
        }

        /* THE FAR WALL, AS A WALL — this shell never had one. The 'inside' poly
           at z0 was the only far wall there was, and everything painted after it
           showed: from behind, a 40 ft container wallpapered with its own
           couplings, cable drops and cabinet faces (the owner's report, and the
           before-sheet's yaw 180 tile). One quad, wound like boxFaces' back so
           frontFacing culls it the way it culls a box, emitted HERE — after the
           tray, manifolds, CDU, PDU, switch and spares fills that share the side
           bucket, because within a layer the only order is emission order. */
        var farWall = [[x1,0,z0],[x0,0,z0],[x0,y1,z0],[x1,y1,z0]];
        if (frontFacing(farWall, yaw)) L.side += poly(farWall, yaw);

        // Roof: only the far half survives the cutaway.
        var roof = [[x0,y1,z0],[x0,y1,C.z],[x1,y1,C.z],[x1,y1,z0]];
        var roofFacing = frontFacing(roof, yaw);
        if (roofFacing) L.top += poly(roof, yaw);
        /* The rib loop keys on the roof's own facing, as in the kit: ribs are
           marks ON that surface, and a rib without its roof is a stripe across
           whatever is behind it. */
        if (roofFacing) for (var r2 = 1; r2 < ribs; r2++) {
            var rx2 = x0 + C.w * r2 / ribs;
            /* A rib under the cooler paints into 'detail', which is above every
               filled face, so it would show straight through the frame standing
               on it — at the same slant and weight as the coil divisions, which
               is what made the first version of the cooler in site-kit.js read
               as corrugation rather than as an object. */
            if (rx2 > COOL_X0 - 0.12 && rx2 < COOL_X1 + 0.12) continue;
            L.detail += line([rx2, y1 + 0.006, z0], [rx2, y1 + 0.006, C.z], yaw);
        }

        /* ---- THE DRY COOLER ON THE ROOF ----
         *
         * Built to match site-kit.js container() part for part, because the
         * hosting page's container and the home page's are supposed to be a
         * photograph of the same equipment from two distances. Read the long
         * note above that function for why this is mass and not line work; the
         * short version, measured on this scene at yaw 0, is that a 390 viewport
         * draws this container 194 px wide before the mobile crop and 319 px
         * after it, which leaves the cooler a band 12 px tall (20 px cropped) of
         * which about 6 px stands clear above the roof line. Too little for
         * texture. Enough for a silhouette that breaks the flat roof.
         *
         * Face winding follows boxFaces() exactly, so frontFacing() culls these
         * the way it culls a box: the two caps are wound oppositely because one
         * faces -x and the other +x, and getting that wrong shows the frame's
         * own back wall through its front. */
        addBox(L, { x: (COOL_X0 + COOL_X1) / 2, y: y1, z: C.z,
                    w: COOL_X1 - COOL_X0, h: COOL.plinth, d: COOL_Z1 - COOL_Z0 }, yaw);

        var faceFront = [[COOL_X0, COOL_YB, COOL_Z1], [COOL_X1, COOL_YB, COOL_Z1],
                         [COOL_X1, COOL_YT, COOL_ZR1], [COOL_X0, COOL_YT, COOL_ZR1]];
        var faceBack  = [[COOL_X1, COOL_YB, COOL_Z0], [COOL_X0, COOL_YB, COOL_Z0],
                         [COOL_X0, COOL_YT, COOL_ZR0], [COOL_X1, COOL_YT, COOL_ZR0]];
        var faceRidge = [[COOL_X0, COOL_YT, COOL_ZR0], [COOL_X0, COOL_YT, COOL_ZR1],
                         [COOL_X1, COOL_YT, COOL_ZR1], [COOL_X1, COOL_YT, COOL_ZR0]];
        if (frontFacing(faceFront, yaw)) L.side += poly(faceFront, yaw);
        if (frontFacing(faceBack,  yaw)) L.side += poly(faceBack,  yaw);
        if (frontFacing(faceRidge, yaw)) L.top  += poly(faceRidge, yaw);

        var capL = [[COOL_X0, COOL_YB, COOL_Z0], [COOL_X0, COOL_YB, COOL_Z1],
                    [COOL_X0, COOL_YT, COOL_ZR1], [COOL_X0, COOL_YT, COOL_ZR0]];
        var capR = [[COOL_X1, COOL_YB, COOL_Z1], [COOL_X1, COOL_YB, COOL_Z0],
                    [COOL_X1, COOL_YT, COOL_ZR0], [COOL_X1, COOL_YT, COOL_ZR1]];
        if (frontFacing(capL, yaw)) L.end += poly(capL, yaw);
        if (frontFacing(capR, yaw)) L.end += poly(capR, yaw);

        // Coil divisions up the leaning face, quiet because they sit on a lit
        // surface instead of standing in for one.
        /* Guarded on faceFront's own facing — THIS cooler's divisions climb the
           +z slope, not the kit's faceBack, so the guard follows the face they
           actually ride: from behind, eight unguarded slants striped the solid
           back slope. No cut-edge outline to guard here: this cooler is whole,
           where the kit's is sliced with its container. */
        var COILS = 8;
        if (frontFacing(faceFront, yaw)) for (var cq = 0; cq < COILS; cq++) {
            var px2 = COOL_X0 + (COOL_X1 - COOL_X0) * (cq + 0.5) / COILS;
            L.detail += line([px2, COOL_YB, COOL_Z1], [px2, COOL_YT, COOL_ZR1], yaw);
        }

        // The fans that pull through the bank, lying flat in the ridge and so
        // drawn with ringY: ring() would stand them on edge, out of the deck
        // they sit in.
        for (var cf = 0; cf < COOL_FAN.length; cf++) {
            L.detail += ringY(COOL_FAN[cf], COOL_YT + 0.01, C.z, 0.26, yaw, 12);
            L.detail += ringY(COOL_FAN[cf], COOL_YT + 0.01, C.z, 0.10, yaw, 8);

            /* HEAT LEAVING — the same broken rising strokes site-kit.js draws over its
               fans, and for the same reason: the loop's story ended at this frame with
               nothing saying the heat goes anywhere. Same glyph, same COOLER.rise
               envelope, because it is the same cooler photographed closer.

               BASED 0.10 UP, NOT THE KIT'S 0.04, and that is the flow line's doing.
               This scene runs its orange roof circuit along the ridge at z +/-0.14,
               and the far leg projects about 3 units ABOVE the deck centre where
               these marks stand — a mark based at 0.04 rises straight through it.
               At 0.10 the nearest stroke measures 1.6 px clear of the flow path at
               rest and 0.8 px at +/-45 deg — abutting inside the band a reader
               actually studies. Over the full idle revolution the marks DO cross
               the orange legs for roughly a third of the turn (measured, not
               guessed): accepted, and since the solid pass the flow paints LAST
               (the generator bakes dg-flow above the slot groups now, or opaque
               paint would erase it), so a crossing is the orange run passing in
               front of a heat hairline — pipe in front of the heat coming off
               it, which is the same claim from the other side.
               Tops stay at COOLER.rise, so the marks live inside the same envelope
               the objects() box below is sized from.

               STATIC, as in the kit: flame and flow are the only animated families.
               At the real sizes: 11.5 px of visible rise at desktop, 5.3 px at the
               390 phone crop where the hairline is 0.4 px wide — present as the
               faintest breath, gone before it can read as noise. */
            /* [dx, base, step, len1, len2]: base + len1 + 0.04 gap + len2 tops out at
               exactly COOLER.rise for both, so the stagger lives in the bases and the
               envelope holds without a clamp leaving a sub-2px stub of second dash. */
            [[-0.28, 0.10, 0.06, 0.09, 0.07], [0.28, 0.13, -0.06, 0.08, 0.05]]
                .forEach(function (mk) {
                    var mx = COOL_FAN[cf] + mk[0], my = COOL_YT + mk[1];
                    L.detail += line([mx, my, C.z], [mx, my + mk[3], C.z], yaw);
                    L.detail += line([mx + mk[2], my + mk[3] + 0.04, C.z],
                                     [mx + mk[2], my + mk[3] + 0.04 + mk[4], C.z], yaw);
                });
        }

        // Exterior end walls, corner castings, base rail.
        addBox(L, { x: x0 - 0.05, y: 0, z: C.z, w: 0.1, h: C.h, d: C.d }, yaw, ['right']);
        addBox(L, { x: x1 + 0.05, y: 0, z: C.z, w: 0.1, h: C.h, d: C.d }, yaw, ['left']);
        [[x0,z0],[x1,z0],[x0,z1],[x1,z1]].forEach(function (pt) {
            addBox(L, { x: pt[0], y: 0,           z: pt[1], w: 0.36, h: 0.32, d: 0.36 }, yaw);
            addBox(L, { x: pt[0], y: C.h - 0.32,  z: pt[1], w: 0.36, h: 0.32, d: 0.36 }, yaw);
        });
        addBox(L, { x: C.x, y: 0, z: z1 - 0.09, w: C.w, h: 0.28, d: 0.18 }, yaw);
        /* The cut edges are marks on the +z face, so they carry that face's
           facing (the kit's base-rail rule): from behind, all three striped the
           far wall — the full 12.19 m top edge the loudest line on it. */
        if (frontFacing([[x0,0,z1],[x1,0,z1],[x1,y1,z1],[x0,y1,z1]], yaw)) {
            L.detail += line([x0, y1, z1], [x1, y1, z1], yaw);
            L.detail += line([x0, 0, z1], [x0, y1, z1], yaw);
            L.detail += line([x1, 0, z1], [x1, y1, z1], yaw);
        }

        /* The far end is BARE, and that is the finished state, not an omission.
           It used to carry nine louvre lines and two filter frames; on a hydro
           container nothing enters or leaves through it and the panel really is
           plain steel. site-kit.js draws the same end the same way. Anything
           added here to fill the space would be a part we do not fit. */

        // Door end: seam and locking bars. The four exhaust fan rings that used
        // to sit between them are gone with the air they moved.
        /* Guarded by the +x end plate's facing (winding copied from boxFaces'
           right): from the blind-end views the seam, bars and rings drew on the
           outside of the far end cap — hardware on a panel that faces away. */
        var dx2 = x1 + 0.105;
        /* Judged at the PLATE's face plane (x1 + 0.1), not the shell's x1: the
           marks ride the plate, and tested at x1 they popped 0.22 deg before
           and after their surface did — two frames a revolution of door
           hardware on the container's bare fills (measured flips: guard
           193.18/346.83 deg, plate face 193.40/346.61). Same plane as the
           marks = flip-exact. */
        var dpx = x1 + 0.1;
        if (frontFacing([[dpx,0,z1],[dpx,0,z0],[dpx,y1,z0],[dpx,y1,z1]], yaw)) {
            L.detail += line([dx2, 0.12, C.z], [dx2, y1 - 0.12, C.z], yaw);
            for (var b = 0; b < 4; b++) {
                var bz = z0 + C.d * (b + 0.5) / 4;
                L.detail += line([dx2, 0.16, bz], [dx2, y1 - 0.16, bz], yaw);
                L.detail += ring(dx2, 0.5, bz, 0.07, yaw, 6);
                L.detail += ring(dx2, y1 - 0.5, bz, 0.07, yaw, 6);
            }
        }

        return L;
    }

    /* ---------- Hover regions ---------- */

    function regionBoxes(id) {
        var x0 = C.x - C.w / 2, x1 = C.x + C.w / 2;
        switch (id) {
            case 'cdu':    return [CDU];
            /* The manifold BAND only, not the whole rack face the branches climb.
               A region tall enough to cover the branches has almost exactly the
               screen bounding box of 'asics', and hit shapes are sorted
               largest-first so the smaller wins on top — the two would swap
               depending on the yaw, and hovering a machine would sometimes light
               the pipework instead. */
            case 'loop':   return [{ x: (MAN_X0 + MAN_X1) / 2, y: MAN_Y, z: MAN_Z,
                                     w: MAN_X1 - MAN_X0, h: MAN_SEP + MAN_H, d: 0.3 }];
            case 'cool':   return [{ x: C.x, y: C.h, z: C.z,
                                     w: C.w - COOL.inX * 2, h: COOL.h, d: C.d - COOL.inZ * 2 }];
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

    /* THE COOLANT LOOP, standing in for the home page's power trunk. It used to
       be an AIRFLOW run — in at the filter wall, along the cold aisle, out
       through the door end — which is the one thing a hydro container never
       does.

       TWO CIRCUITS, NOT ONE, and they are drawn as two subpaths on purpose. It
       is tempting to run a single line from the machines up over the roof and
       back, and it would read beautifully; it would also be a lie about the one
       fact the CDU exists to express, which is that the water in the machines
       and the water in the roof cooler never mix. They meet at a plate
       exchanger and nowhere else. So: one closed circuit out along the return
       manifold and back along the supply, a second up over the cooler and back,
       and both of them end inside the cabinet rather than joining. */
    function buildFlow(H, yaw) {
        var project = H.project, n1 = H.n1;
        var runs = [
            // Machine side: out of the CDU, along the return manifold to the far
            // end of the rack, and back along the supply.
            [[CDU.x, CDU.h * 0.55, CDU.z],
             [CDU.x, MAN_Y + MAN_SEP + MAN_H / 2, CDU.z],
             [CDU.x, MAN_Y + MAN_SEP + MAN_H / 2, MAN_Z],
             [MAN_X1, MAN_Y + MAN_SEP + MAN_H / 2, MAN_Z],
             [MAN_X1, MAN_Y + MAN_H / 2, MAN_Z],
             [CDU.x, MAN_Y + MAN_H / 2, MAN_Z],
             [CDU.x, MAN_Y + MAN_H / 2, CDU.z],
             [CDU.x, CDU.h * 0.55, CDU.z]],
            // Roof side: up through the roof, out along the ridge to the far
            // fan, and back down the other side of it.
            [[CDU.x + 0.14, CDU.h * 0.55, CDU.z],
             [CDU.x + 0.14, C.h + 0.1, CDU.z],
             [CDU.x + 0.14, COOL_YT + 0.03, C.z + 0.14],
             [COOL_FAN[1], COOL_YT + 0.03, C.z + 0.14],
             [COOL_FAN[1], COOL_YT + 0.03, C.z - 0.14],
             [CDU.x - 0.14, COOL_YT + 0.03, C.z - 0.14],
             [CDU.x - 0.14, C.h + 0.1, CDU.z],
             [CDU.x - 0.14, CDU.h * 0.55, CDU.z]],
        ];
        var d = '';
        for (var r = 0; r < runs.length; r++) {
            for (var i = 0; i < runs[r].length; i++) {
                var q = project(runs[r][i], yaw);
                d += (i ? 'L' : 'M') + n1(q[0]) + ' ' + n1(q[1]);
            }
        }
        return d;
    }

    /* One renderable: the container and everything in it. Depth sorting exists
       for multiple objects; here there is nothing to sort against. */
    var RENDERABLES = [
        { id: 'cont', at: [C.x, C.h / 2, C.z], build: buildShell },
    ];

    function objects() {
        /* HEADROOM FOR THE COOLER. This box was C.h + 0.3 tall, which was right
           while the roof was bare and is 0.46 m short of the frame now standing
           on it. It is what allPoints() feeds the clipping check, so a box that
           does not contain the drawing means the drawing is no longer being
           checked against the frame it has to fit in — and the cooler is the
           highest thing in the scene.

           +0.01 NOW, NOT THE +0.14 IT CARRIED. COOL.h grew to include the
           heat-rise marks (see COOLER.rise in site-kit.js), so the old 0.14 of
           clearance would be counted on top of headroom the envelope already
           holds — and this scene has no slack to waste on that: at BASE_SCALE 52
           the swept bbox top was y 17 of a 6-unit limit, and every 0.05 m added
           to this box costs about 2.2 of those units. Measured with the rise
           folded in and the 0.14 dropped, the sweep tops out at y 9 — inside
           the limit, with the box still 0.02 m proud of the tallest drawn
           point (marks top at 3.64, box at 3.66). The yard scenes keep their
           +0.14 because their frames are set by the gas stack and the mast,
           not the cooler. */
        return [{ id: 'cont', box: { x: C.x, y: 0, z: C.z,
                                     w: C.w + 0.3, h: C.h + COOL.h + 0.01, d: C.d + 0.3 } }];
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
