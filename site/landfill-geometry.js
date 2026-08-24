/* ===== PROTON MINING — the landfill, shared by both states =====

   The counterpart to pad-geometry.js, and it exists for exactly the same reason:
   the energy page draws one site twice — as it is today with the gas going to a
   flare, and with our kit on it — and everything that appears in both has to come
   from one place. If a wellhead moved by a metre between the two states the
   crossfade would slide, and the before/after would read as two drawings rather
   than one site changing.

   WHAT A LANDFILL IS NOT. It is not a wellpad with different labels. There is no
   producing well, no separator, no tank battery. What there is: a capped cell —
   a graded mound of waste under a membrane — with an array of vertical extraction
   wells punched into it on a rough grid, a header main collecting them, a
   condensate knockout, a blower that pulls the whole field under vacuum, and a
   flare that burns what the blower brings up.

   WHAT IT SHARES WITH THE PAD, AND WHY THAT IS REUSED RATHER THAN COPIED.
   The access road, the graded working area, the knockout drum, the pipe and edge
   primitives, and the flare itself are all common — landfill gas is flared just
   as associated gas is, which is the whole premise of both pages. Those come
   straight from PadGeometry. Only the cell and the wellfield are new.

   THE CELL IS THE HARD PART OF THE DRAWING, and the first two attempts at it
   were wrong in instructive ways.

   It was a stack of inset slabs to begin with — four boxes, each narrower than
   the one below. That is how a landfill is BUILT, lift by lift, so it sounded
   right; but boxes have vertical walls and square corners, and vertical walls
   and square corners are what a building is made of. It read as a warehouse.

   The second attempt sloped the sides but eased the batter off toward the top,
   which made it convex — a grassy hill, or a circus tent. Nothing man-made has a
   continuously softening slope.

   What it is now: a frustum. One constant batter from toe to crown, a flat top,
   bench lines drawn as contours ACROSS the slope rather than as the treads of a
   staircase, and a lobed outline instead of a rectangle, because no cell was
   ever surveyed square. The benches are the giveaway detail and they only work
   on a continuous slope — a bench is a terrace cut into a face, which means
   there has to be a face.

   Dimensions are metres and roughly true to a mid-size municipal cell: a mound
   about 37 x 25 m at the toe rising 11 m, a working area alongside for the
   blower and flare skid, and wells on an 8 m grid — wide for a real site, but a
   real spacing would put forty wellheads in the frame and read as a pincushion.

   THE CELL IS SHIFTED ONTO THE PIVOT rather than sitting where it looks natural
   in plan. The drawing rotates about the model origin, so the heaviest thing in
   the scene should sit on it: with the cell 6 m off to one side it swept a
   circle 6 m wider than it needed to, and the fitter paid for that out of
   BASE_SCALE — growing the mound made it no bigger on screen, because every
   metre added came straight back off the scale. SHIFT_X in the scenes' view
   block moves the whole site onto the pivot before the rotation, which is where
   the extra size actually came from.

   THE NUMBERS HERE ARE LOAD-BEARING FOR THE FRAME, not just for realism. The
   drawing rotates about the model origin, so the size and placement of the cell
   decide how far the scene swings; scene-landfill-now.js carries a BASE_SCALE
   fitted to whatever this file says. Change a dimension and that fit has to be
   redone, or the mound rides out under the callout labels at three-quarters.

   Geometry only. Every builder takes the engine helper bundle as H and never
   reaches for a global. */

(function (root, factory) {
    var api = factory(typeof require === 'function' && typeof module !== 'undefined'
        ? require('./pad-geometry.js')
        : root.PadGeometry);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.LandfillGeometry = api;
})(typeof self !== 'undefined' ? self : this, function (P) {
    'use strict';

    /* ---------- The site ---------- */

    /* The graded working area the plant stands on, alongside the cell rather than
       on top of it — nothing heavy goes on a cap, which is the one thing every
       landfill engineer will check this drawing for. */
    /* THE LAND, and then the graded bit of it.

       These used to be one thing, and the cell hung off the edge of it: the
       mound's toe reached x -23 while the slab started at -19, so a quarter of
       the landfill floated past the ground it stands on. Calling that "you do
       not grade the landfill" was a rationalisation of a drawing error — the
       cell still has to sit on land.

       So there are two surfaces now, which is also what a real site has. GROUND
       is earth and covers everything with room to spare. PAD is the graded
       gravel compound, and only the plant stands on it.

       GROUND IS DELIBERATELY NOT IN extraBoxes(). The fitter sizes the drawing
       to whatever it is given, and a ground plane forced inside the callout
       rails would shrink the whole site to make room for empty earth. The
       wellpad does the same: its 44 x 22 slab is outside its fit too, and runs
       under the labels at the corners where nobody reads it as content. */
    var GROUND = { x: -4.0, y: -0.34, z: 3.0, w: 54, h: 0.20, d: 52 };
    var PAD  = { x: 2.5, y: -0.15, z: 12.5, w: 32, h: 0.15, d: 24 };
    var ROAD = { x: -21.0, y: -0.2, z: 12.0, w: 16.0, h: 0.1, d: 5.5 };

    /* The cell, at the toe. The batter and the contour heights live with the
       builder further down, since they are the shape rather than the footprint.

       SIZED AND PLACED FOR THE ROTATION, not just for the front-on view. The
       drawing turns about the model origin, so an oversized cell sitting well
       off to one side swings a long way as it goes round: at 40 x 26 centred on
       x -9 its far corner was 33.6 m out, and the drawing ran under the callout
       labels and out of the bottom of the frame at three-quarter angles while
       looking perfectly well behaved head-on. */
    var CELL = { x: -7.0, z: -9.5, w: 37, d: 25, h: 11.0 };

    /* Extraction wells: a grid over the cap, each a short riser with a wellhead
       box on top. Positions are relative to the cell centre and get clipped to
       whatever lift they land on, so none of them floats.

       Bigger than they were. At 0.34 m across and 1.5 m tall they came to about
       nine pixels wide, and "vertical extraction wells on a grid across the cap"
       pointed at marks you could not identify as anything. */
    var WELL_GRID_X = [-12.5, -4.2, 4.2, 12.5];
    var WELL_GRID_Z = [-8.5, 0.0, 8.5];
    var WELL_R = 0.42;          // riser radius
    var WELL_H = 2.4;           // riser height above the cap where it lands
    var WELL_HEAD = { w: 1.05, h: 0.7, d: 1.05 };

    /* The header main runs along the toe of the cell and turns toward the plant.
       Buried in reality; drawn on the surface, because a pipe nobody can see
       explains nothing. */
    var HEADER_Z = 4.4;
    var HEADER_Y = 0.42;

    /* The blower skid pulls the field under vacuum. It is the piece of equipment
       that has no counterpart on a wellpad, and the reason a landfill needs one
       is worth the space it takes: the gas will not come up on its own. */
    var BLOWER = { x: 5.0, y: 0.55, z: 6.0, w: 4.4, h: 1.6, d: 2.0 };
    var BLOWER_SKID = { x: 5.0, y: 0, z: 6.0, w: 4.8, h: 0.55, d: 2.4 };

    /* Knockout, then the flare. Both borrowed from the pad — same kit, same job. */
    var KO = { x: 8.6, y: 0, z: 6.0, w: 2.0, h: 2.2, d: 2.0 };

    /* ---------- The rest of a working site ----------

       A collection system is not a mound, a pipe and a flare. It has leachate to
       deal with, condensate to drop out at the low points of the header, and
       somewhere for the controls and the power drop to live. Without them the
       drawing reads as a diagram of a gas path rather than as a site somebody
       goes to work at.

       EVERY ONE OF THESE SITS INSIDE THE EXISTING FOOTPRINT, which is a
       constraint rather than a coincidence. The drawing is fitted to its frame
       by sweeping all 360 degrees and measuring, so anything placed beyond the
       current extent buys itself room by shrinking the mound — and the mound is
       the thing the page is about. The leachate compound therefore goes at the
       WEST end, tucked under the cell's own reach at x -25.5, rather than in the
       obvious free space east of the flare which would have widened the scene by
       four and a half metres. It is also where it would really be: leachate runs
       downhill to the low corner, by the way in. */

    /* Leachate: a squat tank and a pump skid. Deliberately wider than it is tall
       so it cannot be mistaken for a second flare at a glance. */
    var LEACH      = { x: -18.5, y: 0,   z: 7.4, w: 3.4, h: 3.2, d: 3.4 };
    var LEACH_PUMP = { x: -18.5, y: 0,   z: 10.6, w: 2.6, h: 0.9, d: 1.7 };

    /* Where the controls, the starter and the power drop live. */
    var KIOSK = { x: 0.2, y: 0, z: 6.0, w: 2.8, h: 2.5, d: 2.2 };

    /* Condensate sumps along the header. A wet gas main needs somewhere for the
       liquid to go at every low point, and on a real site these are the things
       you actually trip over. */
    var SUMP_X = [-15.5, -7.5, 0.5];
    var SUMP = { w: 1.0, h: 0.85, d: 1.0 };

    /* An ENCLOSED flare, not a candlestick. Most collection systems run one: a
       shrouded cylinder with the flame inside it, which is both what a landfill
       actually has and a useful visual difference from the pad's open stack — the
       two drawings should not be mistakable for each other at a glance. */
    var FLARE = { x: 12.0, z: 6.0 };
    /* Taller than the cell it stands beside. At 8.0 against a 7 m cell the two
       were the same height and the flare stopped reading as the tall thing on
       the site; the flame also had the cap behind it instead of open sky. */
    var FLARE_H = 10.5;
    var FLARE_R = 1.25;         // wide: it is a shroud, not a pipe
    var PIPE = P.PIPE;

    /* Where the flame sits. Inside the shroud, so the leader points at the top of
       the stack rather than into open air. */
    var TIP = [FLARE.x, FLARE_H, FLARE.z];

    var MODEL = { GROUND: GROUND, PAD: PAD, ROAD: ROAD, CELL: CELL,
                  WELL_GRID_X: WELL_GRID_X, WELL_GRID_Z: WELL_GRID_Z,
                  WELL_R: WELL_R, WELL_H: WELL_H,
                  BLOWER: BLOWER, BLOWER_SKID: BLOWER_SKID, KO: KO,
        LEACH: LEACH, LEACH_PUMP: LEACH_PUMP, KIOSK: KIOSK, SUMP_X: SUMP_X, SUMP: SUMP,
                  LEACH: LEACH, LEACH_PUMP: LEACH_PUMP, KIOSK: KIOSK,
                  SUMP_X: SUMP_X, SUMP: SUMP,
                  FLARE: FLARE, FLARE_H: FLARE_H, FLARE_R: FLARE_R,
                  HEADER_Z: HEADER_Z, PIPE: PIPE, TIP: TIP };

    /* ---------- The shape of the mound ----------

       THE FIRST VERSION OF THIS WAS FOUR STACKED BOXES and it read as a
       warehouse, which is a fair description of four rectangular slabs with
       vertical walls and square corners. Two things were wrong with it and both
       are fixed here.

       ONE: A CAPPED CELL HAS BATTERED SIDES, NOT STEPS. The benches on a real
       cap are narrow terraces cut into a continuous slope; the slope is the
       thing you see, and the bench is a line across it. Stacked boxes invert
       that — all wall, no slope — and a vertical wall is the single strongest
       cue that something is a building. The mound is now a stack of CONTOURS
       with sloped skirts between them, and the benches are drawn as lines on
       the slope rather than as treads.

       TWO: NOTHING IN A LANDFILL IS RECTANGULAR. The outline is a closed lobed
       curve, deliberately not an ellipse either — RADIAL is a fixed, tiny
       perturbation that keeps it off any recognisable machine shape. It is
       deterministic on purpose: the snapshot fixtures compare path strings, so
       a random outline would differ on every capture. */

    var LEVELS = 6;

    /* Height as a fraction of CELL.h at each contour, and how much of the toe
       outline survives there. The crown keeps only 30%, so the mound is mostly
       slope — which is what a small cell actually looks like, and what stops it
       reading as a plateau with a skirt. Slightly convex: the lower slope is
       steeper than the upper, the way settled fill sits. */
    /* STRAIGHT SIDES, FLAT TOP, AND REAL BENCHES.

       A bench on a landfill cap is not a line, it is a road: a flat terrace a
       few metres wide, cut into the slope so a truck can drive the face and so
       surface water has somewhere to go. Drawing them as single contour lines
       on a continuous batter got the silhouette right and still read as a
       smooth hill, because a hill is exactly what an unbroken slope is.

       So consecutive entries with the SAME height are a terrace, and entries
       that rise are a slope. Reading down: toe, slope, bench, slope, bench,
       slope, crown. The flat bands catch the light weight and the sloped bands
       the dark one, which is what makes the terraces read at a glance.

       The batter is steeper than a real cap — a true 1:4 slope on a mound this
       tall would run the toe clean out of the frame — but the ORDER of things
       is right, and that is what the eye reads. */
    var LEVEL_Y = [0.000, 0.333, 0.333, 0.667, 0.667, 1.000];
    var LEVEL_S = [1.000, 0.845, 0.755, 0.600, 0.510, 0.355];

    /* Where the bench lines go — contour indices, not extra geometry. */
    /* The outer lip of each terrace, and its inner edge where the next
       slope begins. Both, so the tread reads as a tread. */
    var BENCHES = [1, 2, 3, 4];

    var RING_STEPS = 22;

    /* The lobed outline, as a multiplier on the ellipse radius at angle t. */
    function radial(t) {
        return 1
            + 0.055 * Math.sin(3 * t + 0.6)
            + 0.032 * Math.cos(5 * t - 0.4)
            - 0.021 * Math.sin(2 * t + 1.9);
    }

    /* A point on contour `lvl`, at parameter step `i`. Local to the cell. */
    function contourPoint(lvl, i) {
        var t = (i / RING_STEPS) * Math.PI * 2;
        var s = LEVEL_S[lvl] * radial(t);
        return [CELL.x + s * (CELL.w / 2) * Math.cos(t),
                CELL.h * LEVEL_Y[lvl],
                CELL.z + s * (CELL.d / 2) * Math.sin(t)];
    }

    function contour(lvl) {
        var out = [];
        for (var i = 0; i < RING_STEPS; i++) out.push(contourPoint(lvl, i));
        return out;
    }

    /* ---------- Where things land on the cap ----------

       Inverse of the shape above: how high the cap is over a given point. A
       point's radius is measured against the outline at its own angle, so a
       well sits on the surface wherever the lobes happen to put it rather than
       on an average of them. */
    function lift(bx, bz) {
        var nx = bx / (CELL.w / 2), nz = bz / (CELL.d / 2);
        var r = Math.sqrt(nx * nx + nz * nz);
        if (r < 1e-6) return CELL.h;
        var u = r / radial(Math.atan2(nz, nx));      // 1 at the toe, 0 at the centre
        if (u >= LEVEL_S[0]) return 0;               // off the mound
        if (u <= LEVEL_S[LEVELS - 1]) return CELL.h; // on the crown
        for (var j = 0; j < LEVELS - 1; j++) {
            var hi = LEVEL_S[j], lo = LEVEL_S[j + 1];
            if (u <= hi && u >= lo) {
                var f = (hi - u) / (hi - lo);
                return CELL.h * (LEVEL_Y[j] + f * (LEVEL_Y[j + 1] - LEVEL_Y[j]));
            }
        }
        return 0;
    }

    function capHeightAt(worldX, worldZ) {
        return lift(worldX - CELL.x, worldZ - CELL.z);
    }

    /* Every wellhead, in world coordinates, with the cap height under it. Shared
       so both scenes place them identically and the callouts can point at one. */
    function wells() {
        var out = [];
        WELL_GRID_X.forEach(function (bx) {
            WELL_GRID_Z.forEach(function (bz) {
                var y = lift(bx, bz);
                if (y <= 0) return;                  // off the mound; skip it
                out.push({ x: CELL.x + bx, z: CELL.z + bz, base: y });
            });
        });
        return out;
    }

    /* Boxes the fitter should account for when sizing the drawing. The cell is
       the widest thing here by a long way, and the flare the tallest. */
    function extraBoxes() {
        var b = [{ x: CELL.x, y: 0, z: CELL.z, w: CELL.w, h: CELL.h, d: CELL.d }];
        b.push({ x: FLARE.x, y: 0, z: FLARE.z, w: FLARE_R * 2, h: FLARE_H, d: FLARE_R * 2 });
        return b;
    }

    /* ---------- Builders ---------- */

    /* The graded working area and the way in.

       THIS USED TO DELEGATE TO P.buildPad AND THAT WAS A BUG, not a shortcut.
       PadGeometry's builder closes over PadGeometry's OWN slab — 44 x 22 at
       z 0 — so the PAD and ROAD declared at the top of this file were never
       drawn at all. What appeared under the landfill was the wellpad's gravel,
       in the wellpad's place, and because it stops at z 11 while the second
       container sits at z 17, the containers stood off the front edge of the
       ground they are supposed to be standing on.

       The technique is still borrowed, because it is the right one and the
       comment on it in pad-geometry.js explains why: build the slab into a
       scratch bundle and fold the whole thing into the GROUND layer, rather than
       letting addBox route the top face to 'top'. A 38 x 31 m sheet of gravel at
       the brightness of a transformer lid leaves the machinery nothing to stand
       out against. */
    /* A grid over one surface. nx by nz cells, inset from the edge so the lines
       do not double up on the outline. */
    function gridOn(H, yaw, L, b, nx, nz, y) {
        var x0 = b.x - b.w / 2, x1 = b.x + b.w / 2;
        var z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
        var i;
        for (i = 1; i < nx; i++) {
            var gx = x0 + b.w * i / nx;
            L.ground += H.line([gx, y, z0 + 0.5], [gx, y, z1 - 0.5], yaw);
        }
        for (i = 1; i < nz; i++) {
            var gz = z0 + b.d * i / nz;
            L.ground += H.line([x0 + 0.5, y, gz], [x1 - 0.5, y, gz], yaw);
        }
    }

    function outlineOf(H, yaw, L, b, y) {
        var x0 = b.x - b.w / 2, x1 = b.x + b.w / 2;
        var z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
        L.ground += H.line([x0, y, z0], [x1, y, z0], yaw);
        L.ground += H.line([x0, y, z1], [x1, y, z1], yaw);
        L.ground += H.line([x0, y, z0], [x0, y, z1], yaw);
        L.ground += H.line([x1, y, z0], [x1, y, z1], yaw);
    }

    function buildPad(H, yaw, L) {
        var G = H.newLayers();
        H.addBox(G, GROUND, yaw);
        H.addBox(G, PAD, yaw);
        H.addBox(G, ROAD, yaw);
        L.ground += G.top + G.side + G.end + G.detail + G.back;

        /* The land gets a wide, sparse grid; the compound a closer one and an
           edge, because a graded gravel pad has a boundary and a field does
           not. Both share the ground layer, so neither brightens the other. */
        gridOn(H, yaw, L, GROUND, 11, 9, 0.003);
        gridOn(H, yaw, L, PAD, 8, 5, 0.004);
        outlineOf(H, yaw, L, PAD, 0.005);
    }

    /* The cell: a battered mound. Each pair of contours is joined by a band of
       sloped quads, and the crown is capped. No vertical faces anywhere — that
       is the whole point.

       FACES ARE BUCKETED BY HOW FLAT THEY LIE, not by which way they face.

       The three weights are a lighting model: .dg-top is brightest at 0.42,
       .dg-side mid at 0.30, .dg-end darkest at 0.20. On a box those mean "up",
       "toward you" and "off to the side", which is why they are named that way.
       A mound has no sides in that sense — only a surface at varying steepness.

       Bucketing it by compass direction put the whole left and right flank into
       .dg-end at 0.20, and a face that dark over that much area does not read as
       ground in shadow, it reads as a hole: the mound looked like a dome
       standing on nothing. So the flatter a face lies, the more light it takes.
       .dg-end goes unused here on purpose. */
    function normalUp(q) {
        var ax = q[1][0] - q[0][0], ay = q[1][1] - q[0][1], az = q[1][2] - q[0][2];
        var bx = q[3][0] - q[0][0], by = q[3][1] - q[0][1], bz = q[3][2] - q[0][2];
        var nx = ay * bz - az * by;
        var ny = az * bx - ax * bz;
        var nz = ax * by - ay * bx;
        var m = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        return Math.abs(ny / m);                     // 1 = flat, 0 = vertical
    }

    function buildCell(H, yaw, L) {
        var lvl, i, ring, next;

        for (lvl = 0; lvl < LEVELS - 1; lvl++) {
            ring = contour(lvl);
            next = contour(lvl + 1);
            for (i = 0; i < RING_STEPS; i++) {
                var j = (i + 1) % RING_STEPS;
                /* WINDING ORDER IS NOT A DETAIL HERE. The engine culls on the
                   sign of the projected area, so a band wound the wrong way
                   round keeps the FAR half of the mound and throws away the
                   near half — you end up looking at the inside of the back
                   surface. It does not read as an error, it reads as a hollow
                   shell, and it is why this drawing looked like a draped sheet:
                   at yaw 0, eleven of the twelve far segments were being drawn
                   and one of the eleven near ones. i and j run the other way. */
                var quad = [ring[j], ring[i], next[i], next[j]];
                if (!H.frontFacing(quad, yaw)) continue;
                /* The skirt is one batter, so it is one weight; the crown is
                   the flat one. Deriving the bucket from the face angle sounds
                   better and is not: at a constant 45 degrees every quad sits
                   on the top/side threshold and the lobes flip them across it,
                   so the mound speckles as it turns. */
                /* A band whose two contours sit at the same height is a
                   terrace, and a terrace is flat, so it takes the light weight
                   the crown takes. That contrast down the face is the whole
                   reason the benches read. */
                var flat = LEVEL_Y[lvl] === LEVEL_Y[lvl + 1];
                L[flat ? 'top' : 'side'] += H.poly(quad, yaw);
            }
        }

        /* The crown. */
        var crown = contour(LEVELS - 1);
        if (H.frontFacing(crown, yaw)) L.top += H.poly(crown, yaw);
        else L.top += H.poly(crown.slice().reverse(), yaw);

        /* The benches, as contour lines on the slope. Three lines across a
           continuous batter reads as an engineered cap; the same three drawn as
           box edges read as the floors of a building.

           NEAR SIDE ONLY. The faces are translucent — every solid on this site
           is — so a contour drawn all the way round shows its far half straight
           through the mound, and the whole thing reads as a wireframe dome
           rather than as ground. A line is drawn only where the slope carrying
           it is facing us, which is the same test the skirt quads already pass.

           The quads are culled but the LINES were not, which is exactly the kind
           of half-applied fix that looks deliberate in the source. */
        for (var b = 0; b < BENCHES.length; b++) drawContour(H, yaw, L, BENCHES[b]);
        drawContour(H, yaw, L, 0);                   // the toe, where slope meets ground
    }

    /* One contour, near side only. A segment counts as near if either of the
       bands meeting along it is front-facing — at the toe and the crown there is
       only one, which the bounds check below handles. */
    function drawContour(H, yaw, L, lvl) {
        var ring = contour(lvl);
        var above = lvl < LEVELS - 1 ? contour(lvl + 1) : null;
        var below = lvl > 0 ? contour(lvl - 1) : null;
        for (var i = 0; i < RING_STEPS; i++) {
            var j = (i + 1) % RING_STEPS;
            var near = false;
            if (above && H.frontFacing([ring[j], ring[i], above[i], above[j]], yaw)) near = true;
            if (!near && below && H.frontFacing([below[j], below[i], ring[i], ring[j]], yaw)) near = true;
            if (near) L.detail += H.line(ring[i], ring[j], yaw);
        }
    }

    /* The wellfield. A riser and a head per well — small, repeated, and the thing
       that makes the mound read as a gas field rather than a hill. */
    function buildWells(H, yaw, L) {
        wells().forEach(function (w) {
            var riser = { x: w.x, y: w.base, z: w.z,
                          w: WELL_R * 2, h: WELL_H, d: WELL_R * 2 };
            H.addBox(L, riser, yaw);
            P.edges(H, yaw, L, riser);

            var head = { x: w.x, y: w.base + WELL_H, z: w.z,
                         w: WELL_HEAD.w, h: WELL_HEAD.h, d: WELL_HEAD.d };
            H.addBox(L, head, yaw);
            P.edges(H, yaw, L, head);
        });
    }

    /* The header main: a lateral from each well column down to a run along the
       toe, then in to the plant. */
    function buildHeader(H, yaw, L) {
        var y = HEADER_Y;
        var xs = WELL_GRID_X.map(function (bx) { return CELL.x + bx; });

        /* the run along the toe */
        P.pipe(H, yaw, L, [xs[0], y, HEADER_Z], [BLOWER.x, y, HEADER_Z]);

        /* and in to the blower */
        P.pipe(H, yaw, L, [BLOWER.x, y, HEADER_Z], [BLOWER.x, y, BLOWER.z + BLOWER.d / 2]);

        /* EVERY WELL TIED BACK, OVER THE CAP.

           This is the difference between a field of posts and a collection
           system, and the callout beside it has been promising it all along:
           "every well tied into one main running to the plant". What was
           actually drawn was four stubs of pipe lying on the ground in FRONT of
           the toe, joined to nothing — the wellheads stood on the mound with
           no connection to anything at all.

           Each lateral is walked over the cap in steps, taking its height from
           the same surface function the mound is drawn from, so it lies on the
           slope instead of cutting through it. Hairlines rather than pipe: a
           lateral is a few inches across, and eleven of them at pipe weight
           would bury the mound they are supposed to be lying on. */
        wells().forEach(function (w) {
            var STEP = 12;
            var prev = [w.x, w.base + WELL_H * 0.45, w.z];
            for (var i = 1; i <= STEP; i++) {
                var z = w.z + (HEADER_Z - w.z) * (i / STEP);
                var cap = capHeightAt(w.x, z);
                var pt = [w.x, (cap > 0 ? cap + 0.22 : y), z];
                L.detail += H.line(prev, pt, yaw);
                prev = pt;
            }
        });
    }

    /* Blower skid, knockout, and the pipe between them and the flare. */
    function buildPlant(H, yaw, L) {
        H.addBox(L, BLOWER_SKID, yaw);
        P.edges(H, yaw, L, BLOWER_SKID);
        H.addBox(L, BLOWER, yaw);
        P.edges(H, yaw, L, BLOWER);

        H.addBox(L, KO, yaw);
        P.edges(H, yaw, L, KO);

        var y = 1.15;
        P.pipe(H, yaw, L, [BLOWER.x + BLOWER.w / 2, y, BLOWER.z], [KO.x, y, KO.z]);
        P.pipe(H, yaw, L, [KO.x, y, KO.z], [FLARE.x, y, FLARE.z]);
    }

    /* THERE IS NO HAUL ROAD ROUND THE TOE, AND IT WAS MEASURED RATHER THAN
       ASSUMED. Every landfill has one and it was built and rendered — then
       taken out, because of what it costs.

       The drawing is fitted by sweeping 360 degrees, so the widest thing on the
       site sets the scale for everything on it. A ring road is, by definition,
       wider than the mound:

           no road                     BASE_SCALE 12.0
           1.4 m track, 0.4 m clear    BASE_SCALE 11.1   (-7.5%)
           3.2 m road, 1.3 m clear     BASE_SCALE  9.9   (-17.5%)

       Seventeen per cent off the mound, the wells, the flare and the plant, to
       add two faint lines on the ground — and the mound is what the section is
       about. The 1.4 m version is cheaper and is not a haul road; nothing 1.4 m
       wide is.

       If it is ever wanted, the cost is the number above, not a guess. */

    /* The rest of the yard: leachate, condensate and the control kiosk.

       Shared, so BOTH states carry it. That is the whole point — this is the
       partner's existing plant, and the promise the page makes is that it stays
       exactly where it is. Kit that appeared only in the "with Proton" state would
       be saying we built their leachate tank. */
    function buildYard(H, yaw, L) {
        var y = 0.55;

        /* Leachate tank, with two shell bands so a squat vessel reads as a
           vessel rather than a crate. */
        H.addBox(L, LEACH, yaw);
        P.edges(H, yaw, L, LEACH);
        [0.34, 0.68].forEach(function (t) {
            P.edges(H, yaw, L, { x: LEACH.x, y: LEACH.h * t, z: LEACH.z,
                                 w: LEACH.w * 1.04, h: 0.001, d: LEACH.d * 1.04 });
        });

        H.addBox(L, LEACH_PUMP, yaw);
        P.edges(H, yaw, L, LEACH_PUMP);
        P.pipe(H, yaw, L, [LEACH.x, y, LEACH.z + LEACH.d / 2],
                          [LEACH.x, y, LEACH_PUMP.z - LEACH_PUMP.d / 2]);

        /* The riser out of the cell that feeds it. Leachate comes from under the
           cap, so the run starts at the toe rather than out in the open. */
        P.pipe(H, yaw, L, [LEACH.x, y, CELL.z + CELL.d / 2],
                          [LEACH.x, y, LEACH.z - LEACH.d / 2]);

        /* Control kiosk, beside the blower it starts. */
        H.addBox(L, KIOSK, yaw);
        P.edges(H, yaw, L, KIOSK);

        /* Condensate sumps, sitting on the header line. */
        SUMP_X.forEach(function (sx) {
            var box = { x: sx, y: 0, z: HEADER_Z, w: SUMP.w, h: SUMP.h, d: SUMP.d };
            H.addBox(L, box, yaw);
            P.edges(H, yaw, L, box);
        });
    }

    /* The enclosed flare: a shroud, its base, and the ribs that make a cylinder
       read as a cylinder in a line drawing. */
    function buildFlare(H, yaw, L) {
        var base = { x: FLARE.x, y: 0, z: FLARE.z, w: FLARE_R * 2.4, h: 0.7, d: FLARE_R * 2.4 };
        H.addBox(L, base, yaw);
        P.edges(H, yaw, L, base);

        var shroud = { x: FLARE.x, y: 0.7, z: FLARE.z,
                       w: FLARE_R * 2, h: FLARE_H - 0.7, d: FLARE_R * 2 };
        H.addBox(L, shroud, yaw);
        P.edges(H, yaw, L, shroud);

        /* Two bands up the shroud. An enclosed flare is a stack of shell courses
           and the bands are what distinguish it from a plain box at this size. */
        [0.38, 0.72].forEach(function (t) {
            var y = 0.7 + (FLARE_H - 0.7) * t;
            P.edges(H, yaw, L, { x: FLARE.x, y: y, z: FLARE.z,
                                 w: FLARE_R * 2.12, h: 0.001, d: FLARE_R * 2.12 });
        });
    }

    /* Everything present in both states, in one call, so the two scenes cannot
       drift apart by forgetting one. */
    function buildShared(H, yaw, L) {
        buildPad(H, yaw, L);
        buildCell(H, yaw, L);
        buildWells(H, yaw, L);
        buildHeader(H, yaw, L);
        buildPlant(H, yaw, L);
        buildYard(H, yaw, L);
        buildFlare(H, yaw, L);
    }

    return {
        MODEL: MODEL, GROUND: GROUND, PAD: PAD, ROAD: ROAD, CELL: CELL,
        WELL_R: WELL_R, WELL_H: WELL_H, WELL_GRID_X: WELL_GRID_X, WELL_GRID_Z: WELL_GRID_Z,
        BLOWER: BLOWER, BLOWER_SKID: BLOWER_SKID, KO: KO,
        LEACH: LEACH, LEACH_PUMP: LEACH_PUMP, KIOSK: KIOSK, SUMP_X: SUMP_X, SUMP: SUMP,
        FLARE: FLARE, FLARE_H: FLARE_H, FLARE_R: FLARE_R, PIPE: PIPE, TIP: TIP,
        HEADER_Z: HEADER_Z,
        wells: wells, capHeightAt: capHeightAt, extraBoxes: extraBoxes,
        pipe: P.pipe, edges: P.edges,
        buildPad: buildPad, buildCell: buildCell, buildWells: buildWells,
        buildHeader: buildHeader, buildPlant: buildPlant, buildYard: buildYard, buildFlare: buildFlare,
        buildShared: buildShared,
    };
});
