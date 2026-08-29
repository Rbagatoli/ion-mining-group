/* ===== PROTON MINING — One machine, an Antminer S21+ Hyd. =====
   The far end of the hosting page's detail slider.

   Proportioned from Bitmain's own figure: 339 x 173 x 207 mm. Scene units are
   100 mm, so the chassis is 3.39 x 1.73 x 2.07. It is a substantially smaller
   box than the S21 Pro this drawing used to show (450 x 219 x 293), and it is
   smaller for one reason: nothing inside it has to make room for a fan.

   THIS IS A HYDRO MACHINE, AND THAT IS THE WHOLE POINT OF THE DRAWING. 395 TH/s
   at 5925 W is 15 J/TH, and the only way that heat leaves is water. There is a
   closed OD10 coolant loop, an inlet allowed to arrive between 20 and 50 C, and
   NO FANS AT ALL — not on the chassis, not on the supply, nowhere.

   The things that make it recognisable, in rough order of how much they matter:

     - TWO COOLANT PORTS on one end plate, inlet and return, OD10 tube on
       quick-disconnect couplings. This is the single identifying feature and it
       is drawn as mass, not line work — see the note over makePortBuilder.
     - The END FACES ARE FLAT PLATE. On the S21 Pro they were almost entirely
       fan aperture. The absence is the strongest tell in the drawing, and an
       absence cannot be drawn: a bare rectangle reads as an unfinished face,
       not a sealed one. So both ends carry the perimeter seam and the ring of
       fixings that say the plate was closed on purpose. endPlate() draws both,
       so the blind end cannot quietly lose its treatment while the port end
       keeps it.
     - COLD PLATES clamped over the hashboards. The boards are exactly where
       they were; what sits on them changed from a fin stack standing up in an
       air path to a slab bolted down on the chips. The plate is drawn as a
       slab, a bolt line round its edge, the seam where its two halves are
       joined, and the two unions the coolant arrives through — and NOT with a
       channel inside it, which was tried twice and is argued out over the
       drawing code.
     - THE PIPEWORK IS SOLID, NOT HAIRLINE. A header standing the height of the
       stack, and six OD10 jumpers off it into three plates. This is the visible
       half of the loop and it carries the "liquid cooled" reading that the
       plate's own face deliberately does not.
     - The supply and the control board remain, both inside the chassis.

   WHICH NUMBERS ARE SOURCED, AND WHICH ARE NOT. Sourced: 339 x 173 x 207 mm,
   the OD10 tube, 395 TH/s, 5925 W, 15 J/TH, 20-50 C inlet, three-phase
   380-415 V. Everything on the inside is PROPORTIONED FOR LEGIBILITY and says
   so where it is declared — Bitmain publishes no board pitch, no port centres,
   no coupling size and no internal split, and a proportioned number dressed up
   as arithmetic would be worse than one admitted to be a guess.

   Deliberately NOT drawn, because the research could not source them: any chip
   count, the coupling manufacturer or series, the coolant flow rate, the
   internal loop topology beyond "manifold, then a plate per board", or the case
   alloy.

   Geometry only. All machinery lives in diagram-engine.js; builders receive its
   helper bundle as H rather than reaching for globals. */

(function (root, factory) {
    var engine = (typeof module !== 'undefined' && module.exports)
        ? require('./diagram-engine.js') : root.DiagramEngine;
    var api = factory(engine);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        root.AsicDiagram = api;
        // Namespaced: the container diagram is already mounted on this page
        // under the bare ids. Linked: the two are views of one thing.
        api.mountWhenReady({ scene: 'asic' });
    }
})(typeof self !== 'undefined' ? self : this, function (engine) {
    'use strict';

    /* ---------- The machine, in units of 100 mm ---------- */

    var CH = { x: 0, y: 0, z: 0, w: 3.39, h: 2.07, d: 1.73 };
    var X0 = CH.x - CH.w / 2, X1 = CH.x + CH.w / 2;
    var Z0 = CH.z - CH.d / 2, Z1 = CH.z + CH.d / 2;

    /* OD10, and the only sourced figure anywhere inside this machine. Every
       tube and every bore in the drawing is this one number, so a reader who
       measures one against the 339 mm length gets 10 mm back. */
    var TUBE = 0.10;

    /* WHAT SETS THE INTERNAL SPLIT NOW, BECAUSE WHAT USED TO SET IT IS GONE.

       PSU_W was 0.79 here, with the derivation "219 - 140: what the fan leaves".
       That was real arithmetic on two published figures — the S21 Pro's width
       and its fan size — and the column beside the fan was whatever was left.
       On a fanless machine there is nothing left of it. No published figure
       divides the 173 mm width, and picking one and writing "173 - 92" beside it
       would look exactly as sourced as the line it replaced while being invented.

       So the split runs the other way, off the boards, which are the reason the
       box has a width at all. BOARD_PITCH is the one proportioned number on this
       axis and it is declared here rather than smeared across the drawing as
       four separate plausible-looking constants: three slices of it are the bay,
       and the supply column is exactly what the three slices leave of 173 mm.

       PSU_W IS WRITTEN OUT AS ITS OWN NUMBER RATHER THAN AS CH.d - BAY_W, which
       is longer and is the point. Derived, the two halves both came out of CH.d
       and their sum was 173 mm whatever either of them was — so the check in
       tests/site/asic-suite.js that the split accounts for the published width
       could not fail, however far the pitch drifted. Declared, each half is
       independently answerable to the 173. */
    var BOARD_PITCH = 0.39;                  // PROPORTIONED, not sourced
    var PSU_W = 0.56;                        // 173 - 3 x 39: what the stack leaves
    var BAY_W = CH.d - PSU_W;                // and the bay is the rest of the width
    var PSU_Z = Z0 + PSU_W / 2;              // on the far side, behind the boards
    var BAY_Z0 = Z0 + PSU_W;                 // the bay starts here
    var BAY_Z = BAY_Z0 + BAY_W / 2;

    /* Three boards on edge, one per slice, coolant carried the length of each. */
    var BOARD = { w: 2.80, y: 0.15, h: 1.62, d: 0.09 };
    var BOARD_Z = [0, 1, 2].map(function (i) {
        return BAY_Z0 + BOARD_PITCH * (i + 0.5);
    });
    var NEAR_Z = BOARD_Z[2];

    /* The cold plate over the near board, on the cutaway side where it can be
       seen. Inset from the board on every edge: a plate that reached the board
       edge would read as a second board rather than as something clamped to it. */
    var PLATE_Z = NEAR_Z + BOARD.d / 2 + 0.055;
    /* Lifted 16 mm off the bottom of the board rather than 8. At 8 the plate's
       own bottom bolt line landed a tenth of a unit above the strip of
       capacitors on the bare board below it, and the two rows of small rings
       merged into one band of clutter along the bottom of the machine. */
    var COLD = { x: CH.x + 0.06, y: BOARD.y + 0.16, z: PLATE_Z,
                 w: BOARD.w - 0.34, h: BOARD.h - 0.30, d: 0.11 };

    /* Where the two couplings sit on the end plate. Bitmain publishes the tube
       standard and not the port centres, so both of these are proportioned; the
       constraint they are held to is geometric rather than sourced, and it is a
       real one — see the note over the bay, and the check in asic-suite.js that
       both bodies land wholly over the boards they feed. */
    var PORT_Y = 1.30;                       // PROPORTIONED: no published centres
    /* 0.62 first, and the two couplings touched. On screen at the resting angle
       a coupling is 46 units across and 0.62 put their centres 57 apart, so the
       pair rendered as one lumpy object with a notch in it — which is the one
       thing the most identifying feature on the machine must not do. 0.74 opens
       a clear gap and still leaves both bodies inside the bay lane, which is
       what asic-suite.js checks and what stops this being tuned by eye alone. */
    var PORT_PITCH = 0.74;                   // PROPORTIONED: coupling centre spacing
    var PORT_Z = [BAY_Z - PORT_PITCH / 2, BAY_Z + PORT_PITCH / 2];

    /* The coupling itself. A quick disconnect is a body, a sprung release collar
       standing proud of it, and the tube. The collar is the part that says
       "disconnect" rather than "threaded fitting", so it gets its own solid. */
    var QD = { r: 0.17, body: 0.30, collar: 0.09, stub: 0.30 };
    var PORT_OUT = X0 - QD.body - QD.stub;   // the open end of the tube stub

    /* Nearly full height, and it was a squat block first. Squat, its two jumpers
       had to reach the top and the bottom corners of a cold plate 1.4 units
       tall, so they drew as two long steep diagonals across the middle of the
       machine — the strongest lines in the cutaway, describing pipework that on
       a real machine is a pair of stubs. A header standing the height of the
       stack it feeds is both what the hardware does and what lets the jumpers be
       the short horizontal runs they should be. */
    var MANI = { x: X0 + 0.13, y: 0.30, z: BAY_Z,
                 w: 0.22, h: 1.35, d: PORT_PITCH + QD.r * 2 };

    var CTRL = { x: X0 + 0.64, y: CH.h, z: BAY_Z, w: 1.28, h: 0.13, d: BAY_W };
    var BUS_Y = CH.h - 0.14;

    /* THE SIX JUMPERS, DECLARED RATHER THAN BUILT IN THE LOOP THAT DRAWS THEM.
       Two runs, flow and return, into each of three boards.

       They were inline literals inside buildMachine(), which meant nothing outside that
       function could name them — and an adversarial pass then deleted all six of them, the
       header they hang off, AND the cold-plate slab in a single edit, and asic-suite.js
       stayed green. That mass is this file's whole stated reason for not drawing the coolant
       channel inside the plate ("the pipework outside it is real hardware and can be drawn
       as such"), so it was the one part of the machine that most needed a guard and was the
       only part with none. Declared here, the suite asserts every one of the six is on
       screen. RUN_Y comes off the cold plate for the same reason: it was a local. */
    var RUN_Y = [COLD.y + 0.20, COLD.y + COLD.h - 0.20];
    var JUMPER_X0 = MANI.x + MANI.w / 2;                 // header's inner face
    var JUMPER_X1 = COLD.x - COLD.w / 2 + 0.10;          // just inside the plate's edge
    var JUMPERS = [];
    for (var jb = 0; jb < 3; jb++) {
        for (var jr = 0; jr < 2; jr++) {
            JUMPERS.push({ x: (JUMPER_X0 + JUMPER_X1) / 2, y: RUN_Y[jr] - TUBE / 2,
                           z: BOARD_Z[jb], w: JUMPER_X1 - JUMPER_X0, h: TUBE, d: TUBE });
        }
    }

    /* The end plate seam, declared here rather than left buried inside
       endPlate(), so a test can project the exact rectangle this claims and go
       looking for those four segments in the path data.

       It is declared because the cheap version of that test does not work. The
       suite first went looking for "a long line roughly parallel to an edge of
       the face, set in from it" — and found the cold plate's line work through
       the machine instead, reporting the seam of an end that was turned away as
       drawn. Anything short of matching the real rectangle finds something.

       `lift` is how far the drawn work stands off the face it belongs to, so it
       is not fighting the fill underneath it for the same pixels. */
    var PLATE = { inset: 0.13, lift: 0.006 };

    var MODEL = { chassis: CH, board: BOARD, boardZ: BOARD_Z, boardPitch: BOARD_PITCH,
                  cold: COLD, ctrl: CTRL, mani: MANI, plate: PLATE,
                  psuW: PSU_W, psuZ: PSU_Z, bayZ: BAY_Z, bayW: BAY_W,
                  tube: TUBE, qd: QD, portY: PORT_Y, portZ: PORT_Z,
                  portPitch: PORT_PITCH, portOut: PORT_OUT,
                  name: 'Antminer S21+ Hyd.',
                  mm: { length: 339, width: 173, height: 207, tube: 10 } };

    function boards() {
        return BOARD_Z.map(function (bz) {
            return { x: CH.x, y: BOARD.y, z: bz, w: BOARD.w, h: BOARD.h, d: BOARD.d };
        });
    }
    var BOARDS = boards();

    /* ONE OBJECT PER COUPLING, not one object for the pair, and that cost a
       render to find out. Drawn together they shared a set of layer buckets,
       and the engine is explicit that buckets cannot express occlusion between
       two solids of one object — only between objects, through the depth sort.
       The two couplings are 74 mm apart in z, so at the resting angle the far
       one's body painted straight over the near one's tube stub and the pair
       read as one lump with a spare pipe behind it. Separated, the sort puts
       whichever is nearer in front, at every angle. */
    function portOf(pz) {
        return { x: X0 - (QD.body + QD.stub) / 2, y: PORT_Y - QD.r * 1.2, z: pz,
                 w: QD.body + QD.stub, h: QD.r * 2.4, d: QD.r * 2.4,
                 face: X0, out: PORT_OUT };
    }
    var PORTA = portOf(PORT_Z[0]), PORTB = portOf(PORT_Z[1]);
    /* The pair as one box, for the hover region and for anything that wants to
       ask how far the plumbing reaches. */
    var PORTS = { x: PORTA.x, y: PORTA.y, z: BAY_Z,
                  w: PORTA.w, h: PORTA.h, d: PORT_PITCH + QD.r * 2.4,
                  face: X0, out: PORT_OUT };
    var PSUBOX = { x: CH.x, y: 0, z: PSU_Z, w: CH.w, h: CH.h, d: PSU_W };

    /* ---------- Callouts. id doubles as the hover region id. ---------- */

    var CALLOUTS = [
        { id: 'ports',  side: 'l', y: 90,  title: 'Two OD10 coolant ports',
          desc: 'Inlet and return on one sealed plate; this machine has no fans',
          at: [PORT_OUT, PORT_Y, PORT_Z[1]] },
        { id: 'boards', side: 'l', y: 235, title: 'Three hashboards',
          desc: 'Standing on edge, with the coolant carried along their length',
          at: [-0.90, BOARD.y + BOARD.h, PLATE_Z] },
        { id: 'heat',   side: 'l', y: 380, title: 'Cold plates',
          desc: 'Clamped down over the chips, where an air machine carries fins',
          at: [0.60, COLD.y + COLD.h * 0.45, PLATE_Z] },
        { id: 'psu',    side: 'r', y: 90,  title: 'Integrated supply',
          desc: 'It lives inside the chassis, not in a brick beside it',
          at: [X0, 1.20, PSU_Z] },
        { id: 'ctrl',   side: 'r', y: 235, title: 'Control board',
          desc: 'Ethernet, reset and IP report, on a strip facing the service end',
          at: [CTRL.x, CTRL.y + CTRL.h, CTRL.z] },
        { id: 'bus',    side: 'r', y: 380, title: 'Copper busbars',
          desc: 'The bolted DC feed from the supply into each board',
          at: [0.08, BUS_Y + 0.07, BAY_Z] },
    ];

    /* ---------- Shared bits ---------- */

    /* A hot-surface warning label, drawn as an outline: this palette has one
       accent colour and it is not yellow. It sits beside the couplings rather
       than on a fan guard now — the coolant is allowed in at up to 50 C and
       leaves hotter, so the plate around the ports is the hot surface. */
    function warnMark(L, H, x, y, z, s, yaw) {
        L.detail += H.line([x, y - s, z - s], [x, y - s, z + s], yaw);
        L.detail += H.line([x, y - s, z + s], [x, y + s, z], yaw);
        L.detail += H.line([x, y + s, z], [x, y - s, z - s], yaw);
    }

    /* THE END PLATES, AND WHY BOTH ENDS GO THROUGH ONE FUNCTION.

       On the S21 Pro each end face was a fan module: a black frame standing
       proud, a guard of concentric rings, an impeller behind it. Replacing that
       with nothing leaves a flat grey rectangle at each end of the machine, and
       a flat grey rectangle does not read as "sealed" — it reads as a face the
       drawing forgot. So the ends carry the evidence of being closed on
       purpose: a perimeter seam set in from the edge, and the fixings that pull
       the plate down onto it.

       Both ends call this, and that is deliberate rather than tidiness. The port
       end has couplings to look at and would survive being the only one drawn;
       the blind end has nothing else at all, so it is exactly the one that would
       be quietly dropped. Sharing the builder means it cannot be.

       `end` is -1 at the port end, +1 at the blind end. The caller gates on face
       visibility: detail paints last and would otherwise show both plates at
       once, straight through the machine. */
    function endPlate(L, H, end, yaw) {
        var line = H.line, ringX = H.ringX;
        var px = (end < 0 ? X0 : X1) + end * PLATE.lift;
        var iy = PLATE.inset, iz = PLATE.inset, i;
        var y0 = iy, y1 = CH.h - iy, z0 = Z0 + iz, z1 = Z1 - iz;

        // The seam the plate lands on.
        L.detail += line([px, y0, z0], [px, y0, z1], yaw);
        L.detail += line([px, y1, z0], [px, y1, z1], yaw);
        L.detail += line([px, y0, z0], [px, y1, z0], yaw);
        L.detail += line([px, y0, z1], [px, y1, z1], yaw);

        // Fixings: four corners, and two more down each long edge. A plate this
        // size held by four screws would not seal; the count is what says the
        // face is under compression rather than merely covered.
        for (i = 0; i < 4; i++) {
            var fy = y0 + (y1 - y0) * i / 3;
            L.detail += ringX(px, fy, z0 + 0.045, 0.035, yaw, 5);
            L.detail += ringX(px, fy, z1 - 0.045, 0.035, yaw, 5);
        }
        L.detail += ringX(px, y0 + 0.045, CH.z, 0.035, yaw, 5);
        L.detail += ringX(px, y1 - 0.045, CH.z, 0.035, yaw, 5);
        return px;
    }

    /* ---------- The body ---------- */

    function buildBody(H, yaw) {
        var addBox = H.addBox, line = H.line, ring = H.ring, ringX = H.ringX,
            ringY = H.ringY, poly = H.poly, polyInside = H.polyInside,
            boxFaces = H.boxFaces, frontFacing = H.frontFacing,
            newLayers = H.newLayers;

        var L = newLayers();
        var y1 = CH.h, i, j, k, f;

        /* Interior, seen through the cutaway on the near long side. Outward
           wound, so every one goes through polyInside or their screen winding
           flips as the scene turns and they cancel under fill-rule:nonzero. */
        L.inside += polyInside([[X0,0,Z0],[X1,0,Z0],[X1,0,Z1],[X0,0,Z1]], yaw);        // floor
        L.inside += polyInside([[X0,0,Z0],[X0,y1,Z0],[X1,y1,Z0],[X1,0,Z0]], yaw);      // far wall
        L.inside += polyInside([[X0,0,Z0],[X0,0,Z1],[X0,y1,Z1],[X0,y1,Z0]], yaw);      // port end
        L.inside += polyInside([[X1,0,Z1],[X1,0,Z0],[X1,y1,Z0],[X1,y1,Z1]], yaw);      // blind end
        L.inside += polyInside([[X0,y1,Z0],[X0,y1,Z1],[X1,y1,Z1],[X1,y1,Z0]], yaw);    // roof underside

        /* --- behind the boards --- */
        // The supply bay, walled off from the board stack.
        L.back += line([X0, 0, BAY_Z0], [X1, 0, BAY_Z0], yaw);
        L.back += line([X0, y1, BAY_Z0], [X1, y1, BAY_Z0], yaw);
        L.back += line([X0, 0, BAY_Z0], [X0, y1, BAY_Z0], yaw);
        L.back += line([X1, 0, BAY_Z0], [X1, y1, BAY_Z0], yaw);

        /* The supply's own body inside that column, as an outline rather than a
           perforated skin. THE S21 PRO DREW 45 VENT HOLES HERE and they cannot
           survive the rewrite: a sealed machine has no vent holes anywhere, and
           a grille on the far wall would contradict the flat plate at both ends
           more loudly than the plate asserts it. */
        var sup = { x: CH.x + 0.08, y: 0.11, z: PSU_Z, w: CH.w - 0.52, h: CH.h - 0.42 };
        L.back += line([sup.x - sup.w / 2, sup.y, Z0 + 0.012],
                       [sup.x + sup.w / 2, sup.y, Z0 + 0.012], yaw);
        L.back += line([sup.x - sup.w / 2, sup.y + sup.h, Z0 + 0.012],
                       [sup.x + sup.w / 2, sup.y + sup.h, Z0 + 0.012], yaw);
        L.back += line([sup.x - sup.w / 2, sup.y, Z0 + 0.012],
                       [sup.x - sup.w / 2, sup.y + sup.h, Z0 + 0.012], yaw);
        L.back += line([sup.x + sup.w / 2, sup.y, Z0 + 0.012],
                       [sup.x + sup.w / 2, sup.y + sup.h, Z0 + 0.012], yaw);
        for (i = 1; i < 5; i++) {          // its internal decks
            var sy = sup.y + sup.h * i / 5;
            L.back += line([sup.x - sup.w / 2 + 0.05, sy, Z0 + 0.012],
                           [sup.x + sup.w / 2 - 0.05, sy, Z0 + 0.012], yaw);
        }
        // The DC output studs, which is where the busbars overhead come from.
        L.back += ring(sup.x + sup.w / 2 - 0.22, sup.y + sup.h + 0.09, Z0 + 0.012, 0.055, yaw, 6);
        L.back += ring(sup.x + sup.w / 2 - 0.42, sup.y + sup.h + 0.09, Z0 + 0.012, 0.055, yaw, 6);

        // The two far boards, drawn before the near one so it reads as nearest.
        for (i = 0; i < 2; i++) {
            f = boxFaces(BOARDS[i]);
            for (k in f) if (frontFacing(f[k], yaw)) L.back += poly(f[k], yaw);
        }

        /* --- the near board, and the cold plate clamped onto it ---
           BOTH GO IN 'asics', and the plate did not at first: it was an addBox,
           which sends its faces to side/top/end at fills of 0.30/0.42/0.20. The
           chassis end plate is 0.20, so the thing INSIDE the machine came out
           brighter than the shell around it and read as a slab floating in a
           black box rather than as a part bolted to a board. 'asics' is the
           weight reserved for the machines, which is what this is. */
        f = boxFaces(BOARDS[2]);
        for (k in f) if (frontFacing(f[k], yaw)) L.asics += poly(f[k], yaw);
        f = boxFaces(COLD);
        for (k in f) if (frontFacing(f[k], yaw)) L.asics += poly(f[k], yaw);

        var pz = PLATE_Z + COLD.d / 2 + 0.006;
        var cx0 = COLD.x - COLD.w / 2, cx1 = COLD.x + COLD.w / 2;
        var cy0 = COLD.y, cy1 = COLD.y + COLD.h;

        /* THE COOLANT CHANNEL IS NOT DRAWN, AND TWO ATTEMPTS AT DRAWING IT ARE
           WHY. It went in as a serpentine — passes along the plate joined
           alternately at the ends — on the reasoning that a folded path is the
           one pattern a fin comb can never be mistaken for. Rendered at four
           passes the plate carried two blank rectangles; at six it carried
           three. That is not a tuning problem. Long parallel passes closed at
           alternating ends ARE a stack of rectangles, and the eye takes the
           closed shapes over the path every time, at any count.

           The second reason is the one that settles it. A channel inside a
           brazed plate is not visible on an assembled machine, and this drawing
           has refused to draw invisible internals since it was an S21 Pro: it
           drew fin combs precisely because "the chips sit underneath and you
           never see one". So the plate shows what a plate shows — a slab, the
           bolt line pulling it onto the board, the seam where its two halves are
           joined, and the two unions the coolant actually arrives through. The
           liquid is carried by the pipework outside it, which is real hardware
           and can be drawn as such. */
        var seam = 0.075;
        L.detail += line([cx0 + seam, cy0 + seam, pz], [cx1 - seam, cy0 + seam, pz], yaw);
        L.detail += line([cx0 + seam, cy1 - seam, pz], [cx1 - seam, cy1 - seam, pz], yaw);
        L.detail += line([cx0 + seam, cy0 + seam, pz], [cx0 + seam, cy1 - seam, pz], yaw);
        L.detail += line([cx1 - seam, cy0 + seam, pz], [cx1 - seam, cy1 - seam, pz], yaw);
        // Where the coolant arrives and leaves, at the service end of the plate.
        /* The module-scope pair, not a second copy of the same arithmetic: the jumpers are
           built from RUN_Y and these unions have to land on the same two runs. */
        var runY = RUN_Y;
        /* Clamp screws AROUND THE EDGE, not across the face. The first version
           put them in a 6 x 3 grid over the plate, and a regular grid of dots on
           a board is the one thing this drawing has always refused to draw: it
           reads as a chip array, which is exactly the reading the S21 Pro
           version avoided by drawing fin combs instead of chip squares. A cold
           plate is pulled down by a bolt line round its perimeter anyway, so the
           honest arrangement is also the legible one. */
        for (i = 0; i < 7; i++) {
            var sx2 = cx0 + 0.06 + (COLD.w - 0.12) * i / 6;
            L.detail += ring(sx2, cy0 + 0.055, pz + 0.02, 0.036, yaw, 6);
            L.detail += ring(sx2, cy1 - 0.055, pz + 0.02, 0.036, yaw, 6);
        }
        L.detail += ring(cx0 + 0.055, (cy0 + cy1) / 2, pz + 0.02, 0.036, yaw, 6);
        L.detail += ring(cx1 - 0.055, (cy0 + cy1) / 2, pz + 0.02, 0.036, yaw, 6);
        // The plate's own two unions, where the jumpers land on it.
        L.detail += ring(cx0 + 0.10, runY[0], pz + 0.01, 0.06, yaw, 8);
        L.detail += ring(cx0 + 0.10, runY[1], pz + 0.01, 0.06, yaw, 8);

        // A strip of bare board below the plate, with its capacitors: the plate
        // covers the chips, not the whole board.
        L.detail += line([-BOARD.w / 2 + 0.06, BOARD.y + 0.055, PLATE_Z],
                         [BOARD.w / 2 - 0.06, BOARD.y + 0.055, PLATE_Z], yaw);
        for (i = 0; i < 7; i++) {
            var capx = -BOARD.w / 2 + BOARD.w * (i + 0.5) / 7;
            L.detail += ring(capx, BOARD.y + 0.03, PLATE_Z, 0.028, yaw, 5);
        }

        /* --- the header, and a jumper into each board's plate ---
           THE JUMPERS ARE SOLIDS, NOT LINES, and that is the whole reason the
           channel inside the plate could be dropped without the machine losing
           its subject. Six pipes at the sourced OD10, standing between a header
           and three plates, are the visible half of a closed loop and they are
           real hardware. As hairlines they were invisible under the plate's own
           bolt work; as mass they are the thing the eye lands on after the
           couplings. */
        addBox(L, MANI, yaw);
        var mfx = MANI.x + MANI.w / 2;
        for (i = 0; i < JUMPERS.length; i++) addBox(L, JUMPERS[i], yaw);
        // Flow and return divisions on the header's own face.
        L.detail += line([mfx + 0.004, runY[0] - 0.11, MANI.z - MANI.d / 2 + 0.05],
                         [mfx + 0.004, runY[0] - 0.11, MANI.z + MANI.d / 2 - 0.05], yaw);
        L.detail += line([mfx + 0.004, runY[1] + 0.11, MANI.z - MANI.d / 2 + 0.05],
                         [mfx + 0.004, runY[1] + 0.11, MANI.z + MANI.d / 2 - 0.05], yaw);

        /* --- copper busbars over the stack --- */
        for (i = 0; i < 2; i++) {
            var bx = CH.x + (i ? 0.08 : -0.23);
            addBox(L, { x: bx, y: BUS_Y, z: BAY_Z, w: 0.13, h: 0.06, d: BAY_W - 0.16 }, yaw);
            for (j = 0; j < 3; j++) {          // bolted terminals, one per board
                L.detail += ringY(bx, BUS_Y + 0.065, BOARD_Z[j], 0.045, yaw, 6);
            }
        }

        /* --- controller deck on top, and the strip facing the service end --- */
        addBox(L, CTRL, yaw);
        var pf = CTRL.x - CTRL.w / 2 - 0.006;          // the face it looks out of
        var py2 = CTRL.y + CTRL.h / 2;
        // RJ45, the tallest thing on the strip.
        addBox(L, { x: pf, y: CTRL.y + 0.025, z: 0.62, w: 0.02, h: 0.09, d: 0.14 }, yaw);
        // Micro USB, then the two buttons.
        L.detail += line([pf, py2, 0.28], [pf, py2, 0.40], yaw);
        L.detail += ring(pf, py2, 0.13, 0.03, yaw, 6);
        L.detail += ring(pf, py2, -0.02, 0.03, yaw, 6);
        // Fault over Normal, stacked rather than side by side.
        L.detail += ring(pf, CTRL.y + 0.095, -0.20, 0.024, yaw, 6);
        L.detail += ring(pf, CTRL.y + 0.04, -0.20, 0.024, yaw, 6);
        // A screw at each end of the bezel.
        L.detail += ring(pf, py2, BAY_Z0 + 0.06, 0.022, yaw, 5);
        L.detail += ring(pf, py2, Z1 - 0.06, 0.022, yaw, 5);

        // Three ribbons from the controller down into the three board slots,
        // and the sleeved DC harness leaving the strip.
        for (i = 0; i < 3; i++) {
            L.detail += line([CTRL.x + CTRL.w / 2 - 0.08, CTRL.y, BOARD_Z[i]],
                             [CTRL.x + CTRL.w / 2 + 0.28, BOARD.y + BOARD.h, BOARD_Z[i]], yaw);
        }
        for (i = 0; i < 3; i++) {
            L.detail += line([pf, py2 - 0.02 + i * 0.02, Z1 - 0.10],
                             [X0 + 0.42, CH.h - 0.42 - i * 0.05, Z1 - 0.02], yaw);
        }

        /* --- the shell. The near long face is the cutaway, so it is skipped. --- */
        addBox(L, CH, yaw, ['front']);

        /* --- the two end plates ---
           Gated on face visibility, and that gate is the same one the fan
           modules used to need: detail is the last layer painted, so a plate
           drawn while its face is turned away shows straight through the
           machine and lands on top of the far one. */
        var sf = boxFaces(CH);
        if (frontFacing(sf.left, yaw)) {
            var lx = endPlate(L, H, -1, yaw);

            /* The three-phase inlet, recessed into the supply column. Four pins:
               three phases and earth, which is the one thing about this
               connector that IS sourced — 380-415 V three phase. */
            addBox(L, { x: X0 - 0.05, y: 0.34, z: PSU_Z, w: 0.05, h: 0.26, d: 0.30 }, yaw);
            [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(function (c) {
                L.detail += ringX(lx - 0.05, 0.47 + c[0] * 0.055, PSU_Z + c[1] * 0.065,
                                  0.026, yaw, 5);
            });
            // Cable gland below it, so the supply cord has somewhere to be.
            L.detail += ringX(lx, 0.22, PSU_Z, 0.06, yaw, 8);
            // Hot surface, beside the plumbing rather than on a fan guard.
            warnMark(L, H, lx, PORT_Y - 0.52, PORT_Z[0] - 0.14, 0.08, yaw);
        }
        if (frontFacing(sf.right, yaw)) {
            var rx = endPlate(L, H, 1, yaw);
            /* The blind end. A raised centre panel and the rating plate, and
               nothing else — no aperture, no louvre, no gland. What the reader
               is meant to notice here is what is missing, and the panel gives
               the eye something to measure that absence against. */
            L.detail += line([rx, 0.42, Z0 + 0.34], [rx, 0.42, Z1 - 0.34], yaw);
            L.detail += line([rx, CH.h - 0.42, Z0 + 0.34], [rx, CH.h - 0.42, Z1 - 0.34], yaw);
            L.detail += line([rx, 0.42, Z0 + 0.34], [rx, CH.h - 0.42, Z0 + 0.34], yaw);
            L.detail += line([rx, 0.42, Z1 - 0.34], [rx, CH.h - 0.42, Z1 - 0.34], yaw);
            L.detail += line([rx, 1.32, Z0 + 0.46], [rx, 1.32, Z1 - 0.46], yaw);
            L.detail += line([rx, 1.14, Z0 + 0.46], [rx, 1.14, Z1 - 0.46], yaw);
            L.detail += line([rx, 1.32, Z0 + 0.46], [rx, 1.14, Z0 + 0.46], yaw);
            L.detail += line([rx, 1.32, Z1 - 0.46], [rx, 1.14, Z1 - 0.46], yaw);
            // The earth stud, which is the only fitting a blind plate carries.
            L.detail += ringX(rx, 0.62, CH.z, 0.045, yaw, 6);
        }

        // Two upper covers meeting on a lengthwise seam, and the cover screws.
        L.detail += line([X0 + 0.08, y1 + 0.006, CH.z], [X1 - 0.08, y1 + 0.006, CH.z], yaw);
        [[-0.30, Z0 + 0.14], [-0.30, Z1 - 0.14], [1.42, Z0 + 0.14], [1.42, Z1 - 0.14]]
            .forEach(function (s) {
                L.detail += ringY(s[0], y1 + 0.008, s[1], 0.04, yaw, 5);   // cover screws
            });
        // Serial label, high on the far side.
        L.detail += line([0.45, y1 - 0.22, Z0 - 0.006], [1.15, y1 - 0.22, Z0 - 0.006], yaw);
        L.detail += line([0.45, y1 - 0.40, Z0 - 0.006], [1.15, y1 - 0.40, Z0 - 0.006], yaw);
        L.detail += line([0.45, y1 - 0.22, Z0 - 0.006], [0.45, y1 - 0.40, Z0 - 0.006], yaw);
        L.detail += line([1.15, y1 - 0.22, Z0 - 0.006], [1.15, y1 - 0.40, Z0 - 0.006], yaw);

        return L;
    }

    /* ---------- One coolant coupling. Its own object, so the depth sort can put
                  it in front of the body when the plate faces you, and in front
                  of its neighbour when it is the nearer of the two.

       THIS IS BUILT AS MASS, NOT LINE WORK, for the same reason the container's
       roof cooler is. The whole drawing is 350 px wide on a phone, which puts
       this machine at about 200 px and a coupling at 23. A ring and a few
       strokes at that size is three grey pixels; a filled solid is a silhouette
       that breaks the flat line of the end plate, which is exactly what a
       coupling standing 60 mm off a sealed face is supposed to do.

       So each port is three solids — body, release collar, tube stub — with one
       outline round the collar to keep it apart from the plate behind it, and
       the rest of the line work (bores, knurling, flow arrows, plate boss) is
       what a desktop reader gets and a phone reader loses without losing the
       port itself. ---------- */

    function makePortBuilder(P, n) {
        return function (H, yaw) {
            var addBox = H.addBox, line = H.line, ringX = H.ringX,
                newLayers = H.newLayers;
            var L = newLayers();
            var pz = P.z, i;

            // Body, standing off the plate.
            addBox(L, { x: X0 - QD.body / 2, y: PORT_Y - QD.r, z: pz,
                        w: QD.body, h: QD.r * 2, d: QD.r * 2 }, yaw);
            // The sprung release collar, proud of the body at its outer end.
            addBox(L, { x: X0 - QD.body + QD.collar / 2, y: PORT_Y - QD.r * 1.2, z: pz,
                        w: QD.collar, h: QD.r * 2.4, d: QD.r * 2.4 }, yaw);
            // OD10 tube. Drawn at the sourced diameter and no thicker: it is the
            // one thing here a reader could check against the 339 mm length.
            addBox(L, { x: X0 - QD.body - QD.stub / 2, y: PORT_Y - TUBE / 2, z: pz,
                        w: QD.stub, h: TUBE, d: TUBE }, yaw);

            /* Everything below is detail, which paints last and would otherwise
               show straight through the coupling from behind. It only exists on
               the outward face, so draw it only when that face is visible. */
            var faces = H.boxFaces({ x: P.x, y: P.y, z: P.z, w: P.w, h: P.h, d: P.d });
            if (!H.frontFacing(faces.left, yaw)) return L;

            /* THE COLLAR'S OUTER FACE, OUTLINED. Everything else about a
               coupling is fill, and the fills it lands on are the end plate's
               (0.20) and its own (0.20 / 0.30 / 0.42) — close enough in weight
               that at 350 px the pair merged into one grey lump on the end of
               the machine. Detail strokes at 0.72 are the brightest ink in the
               drawing, so four of them round the widest cross-section give each
               coupling an edge that survives the phone. It is also the correct
               line to draw: the collar is the widest part and the one you would
               see the silhouette of. */
            var kx0 = X0 - QD.body, kr = QD.r * 1.2;
            [[-1, -1, -1, 1], [1, -1, 1, 1], [-1, -1, 1, -1], [-1, 1, 1, 1]]
                .forEach(function (e) {
                    L.detail += line([kx0, PORT_Y + e[0] * kr, pz + e[1] * kr],
                                     [kx0, PORT_Y + e[2] * kr, pz + e[3] * kr], yaw);
                });
            // The bore, at the open end of the tube.
            L.detail += ringX(PORT_OUT - 0.004, PORT_Y, pz, TUBE / 2, yaw, 8);
            L.detail += ringX(PORT_OUT - 0.004, PORT_Y, pz, TUBE / 2 - 0.022, yaw, 8);
            /* The boss on the plate the coupling is bolted through, and its
               fixings: this is what makes it a fitting ON a face rather than a
               shape floating in front of one. */
            L.detail += ringX(X0 - 0.006, PORT_Y, pz, QD.r * 1.28, yaw, 12);
            for (i = 0; i < 4; i++) {
                var t = (i + 0.5) / 4 * Math.PI * 2;
                L.detail += ringX(X0 - 0.008, PORT_Y + Math.sin(t) * QD.r * 1.28,
                                  pz + Math.cos(t) * QD.r * 1.28, 0.028, yaw, 5);
            }
            /* Knurling on the collar. Four short strokes across the middle of it,
               not five full-height ones: at full height they drew as a picket
               fence standing in front of the coupling rather than as a texture
               on it. */
            var kx = X0 - QD.body + QD.collar / 2;
            for (i = 0; i < 4; i++) {
                var kz = pz - QD.r * 0.75 + QD.r * 1.5 * i / 3;
                L.detail += line([kx, PORT_Y - QD.r * 0.72, kz],
                                 [kx, PORT_Y + QD.r * 0.72, kz], yaw);
            }
            /* Which way the coolant goes. One port is the inlet, so its chevron
               points into the machine and the other's points out. Two identical
               fittings say "plumbing"; two that disagree about direction say
               "a loop", which is the thing being drawn. */
            var ax = PORT_OUT + QD.stub * 0.5, dir = n ? -1 : 1;
            L.detail += line([ax, PORT_Y + 0.11, pz - 0.09 * dir],
                             [ax, PORT_Y + 0.11, pz + 0.09 * dir], yaw);
            L.detail += line([ax, PORT_Y + 0.11, pz + 0.09 * dir],
                             [ax, PORT_Y + 0.17, pz + 0.02 * dir], yaw);
            return L;
        };
    }

    function regionBoxes(id) {
        switch (id) {
            case 'ports':  return [PORTA, PORTB].map(function (P) {
                return { x: P.x, y: P.y, z: P.z, w: P.w, h: P.h, d: P.d };
            });
            case 'boards': return BOARDS;
            case 'heat':   return [COLD];
            case 'psu':    return [PSUBOX];
            case 'ctrl':   return [CTRL];
            case 'bus':    return [
                { x: CH.x - 0.23, y: BUS_Y, z: BAY_Z, w: 0.13, h: 0.06, d: BAY_W - 0.16 },
                { x: CH.x + 0.08, y: BUS_Y, z: BAY_Z, w: 0.13, h: 0.06, d: BAY_W - 0.16 }];
        }
        return [];
    }

    /* The coolant path. BOTH RUNS ARE AT THE SAME END, and that is the whole
       difference from what this function drew before. Air went in one face and
       out the other, so it needed a run at each end of the machine; a closed
       loop arrives and leaves through the same plate, and the only thing the
       run can say is which of the two ports it goes into and which it comes out
       of.

       Still drawn outside the machine rather than through it, for the reason it
       always was: dg-flow paints BEFORE every slot, so a line through the bay
       would be buried under the very thing it describes. */
    function buildFlow(H, yaw) {
        var project = H.project, n1 = H.n1;
        /* Shorter than the air runs were, and that is a framing constraint
           rather than a stylistic one: the machine now rotates about a point
           between its chassis and its couplings (see SHIFT_X), and the widest
           thing in the sweep is whichever run is at the far side of that circle.
           Every unit these reach out of the plate is a unit the machine has to
           give back to stay inside the mobile crop. */
        var runs = [
            [[PORT_OUT - 0.40, PORT_Y, PORT_Z[0]], [PORT_OUT - 0.06, PORT_Y, PORT_Z[0]]],
            [[PORT_OUT - 0.06, PORT_Y, PORT_Z[1]], [PORT_OUT - 0.40, PORT_Y, PORT_Z[1]]],
        ];
        var d = '';
        runs.forEach(function (r) {
            r.forEach(function (p, i) {
                var q = project(p, yaw);
                d += (i ? 'L' : 'M') + n1(q[0]) + ' ' + n1(q[1]);
            });
        });
        return d;
    }

    /* THREE OBJECTS, AND THE COUNT IS NOT ARBITRARY — but the REASON for it is
       completely different from the one it replaces. The S21 Pro needed three
       because something stood proud of the chassis at EACH end, and the depth
       sort had to put the near fan module in front of the body and the far one
       behind it. A hydro machine's plumbing is all on one plate, so there is
       nothing at all outside the blind end.

       It still needs three because the two couplings have to sort against EACH
       OTHER. They are 74 mm apart across the machine, which is far enough that
       at most angles one is clearly in front of the other, and the engine can
       only express that between objects. See the note over portOf.

       SLOTS is RENDERABLES.length, so a renderable added without a matching
       slot group in the markup is silently dropped. */
    var RENDERABLES = [
        { id: 'body',  at: [CH.x, CH.h / 2, CH.z], build: buildBody },
        { id: 'portA', at: [PORTA.x, PORT_Y, PORTA.z], build: makePortBuilder(PORTA, 0) },
        { id: 'portB', at: [PORTB.x, PORT_Y, PORTB.z], build: makePortBuilder(PORTB, 1) },
    ];

    function objects() {
        var box = function (P) {
            return { x: P.x, y: P.y, z: P.z, w: P.w, h: P.h, d: P.d };
        };
        return [
            { id: 'body', box: { x: CH.x, y: 0, z: CH.z,
                                 w: CH.w + 0.2, h: CH.h + 0.3, d: CH.d + 0.2 } },
            { id: 'portA', box: box(PORTA) },
            { id: 'portB', box: box(PORTB) },
        ];
    }

    var SCENE = {
        view: {
            VB: { w: 1280, h: 470 },       // identical to the container scene
            BASE_PITCH: 20 * Math.PI / 180,
            /* Square-on, the end plate is edge-on and both couplings vanish into
               a line. This is the angle every photograph of the machine is taken
               from, and on this machine it is load-bearing: the ports are the
               identifying feature and they only exist on that face. */
            BASE_YAW: 42 * Math.PI / 180,
            FOV: 1500,
            /* Bigger than the S21 Pro's 90 because the machine is smaller. The
               mobile crop in styles.css is a fixed window — .dg-wrap--asic keeps
               x 293..987 — and tests/site/dg-crop.js fails a drawing that stops
               filling it. Drawing a 3.39 m box at the scale used for a 4.50 m one
               would have left the phone showing a small machine in a wide empty
               frame and passed every other check in the suite. */
            BASE_SCALE: 124,
            ORIGIN: { x: 640, y: 343 },
            /* THE TURNTABLE IS OFF-CENTRE, AND IT HAS TO BE. The S21 Pro was
               symmetric — a fan module standing proud at each end — so it swept
               a circle centred on its own middle and SHIFT_X was 0. This machine
               has plumbing on one end and flat plate on the other, so spinning
               it about its centre throws the port block round a circle 28.7%
               wider than the chassis alone needs (2.449 against 1.903), and the
               mobile crop is sized to the widest angle. Turning it about a point
               30 mm toward the ports balances the two: the widest thing in the
               sweep stops being the couplings and becomes the blind corner, and
               the sweep radius drops 2.449 -> 2.307, so the machine draws 6.2%
               larger inside the same fixed window.

               6.2%, NOT THE 15% THIS USED TO CLAIM, and 300 mm was a tenfold
               slip for 30. Measured over allPoints() about the pivot the engine
               actually uses — project() does px = p[0] + SHIFT_X, so the pivot
               is at MINUS SHIFT_X, and computing it about +SHIFT_X reports the
               shift making things worse. The best centre available anywhere is
               0.225, worth 9.4%, so 15% was not merely optimistic: no shift
               could have bought it. The 0.30 is kept over the 0.225 because the
               difference is 3 points and 0.30 is where the couplings stop being
               the widest thing, which is the effect the sweep is for. */
            SHIFT_X: 0.30,
            PERIOD: 44000,
        },
        renderables: RENDERABLES,
        callouts: CALLOUTS,
        flow: buildFlow,
        regionBoxes: regionBoxes,
        objects: objects,
        extraBoxes: function () { return BOARDS.concat([CTRL, PSUBOX, COLD, MANI]); },
        data: { MODEL: MODEL, BOARDS: BOARDS, PORTS: PORTS,
                PORTA: PORTA, PORTB: PORTB, COLD: COLD, MANI: MANI,
                JUMPERS: JUMPERS, CTRL: CTRL },
    };

    return engine.createDiagram(SCENE);
});
