/* ===== ION MINING GROUP — Hero animation =====
   "Energy → hashrate", the company thesis drawn literally, bottom to top:

     source line   stranded energy combusting — flare, landfill, curtailed power
     rise          that energy travelling upward, cooling orange → platinum
     lattice       hashrate crystallising as the energy arrives

   Square geometry and a two-colour palette, to match the rest of the sheet.
   No dependencies. Glow is layered low-alpha rectangles, never ctx.shadowBlur —
   shadowBlur is by far the most expensive thing you can do on a canvas this busy.

   Self-disables on prefers-reduced-motion (draws one composed still instead),
   when scrolled out of view, when the tab is hidden, and below 980px where the
   column does not exist. */

(function () {
    'use strict';

    /* One independent field per host. Every piece of state below lives inside
       mount(), so two fields on a page cannot share a particle array, a
       lattice, or an animation frame. */
    Array.prototype.forEach.call(
        document.querySelectorAll('canvas.anim-field'), mount);

    function mount(canvas) {
    if (!canvas || !canvas.getContext) return;
    var host = canvas.parentNode;

    /* data-mode="rise" draws the middle third of the thesis only: source line
       and rising gas, no lattice, no links, no solve beat.

       It exists because the lattice is the half that says HASHRATE, and most
       page headers are not making that argument -- an energy seller reading
       about gas purchase does not need a fabric knitting itself behind the
       headline. The home hero still runs all three parts, because that is the
       one page where the whole thesis is the point.

       Almost nothing needs a branch for it. With no nodes the lattice loops in
       draw() iterate zero times and the absorption test in step() never fires,
       so the mode falls out of an empty array rather than out of conditionals
       sprinkled through the draw path. */
    var riseOnly = canvas.getAttribute('data-mode') === 'rise';

    var ctx = canvas.getContext('2d', { alpha: true });

    var PLAT = '229,228,226';
    var HOT  = '247,147,26';
    var WARM = '255,196,107';

    var MAX_DT      = 0.05;   // clamp, so a backgrounded tab cannot teleport the field
    var NODE_GAP    = 34;     // lattice spacing, px
    var LATTICE_PCT = 0.56;   // top share of the panel the lattice occupies
    var SHIMMER_H   = 62;     // heat haze height above the source line
    var DECAY       = 0.6;    // node charge lost per second
    var LINK_AT     = 0.5;    // charge above which neighbours link
    var SOLVE_MS    = 700;    // scanline duration

    var w = 0, h = 0, latticeH = 0, sourceY = 0;
    var particles = [], emitters = [], nodes = [], cols = 0, rows = 0;
    var maxParticles = 140;
    var raf = null, last = 0, t = 0;
    var solveAt = 0, solve = null;
    var visible = true;

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function rand(a, b) { return a + Math.random() * (b - a); }

    /* ---- Layout -------------------------------------------------------

       The canvas is a FIXED logical size and CSS scales it. That is not a
       preference. The first version of this file read the host's
       getBoundingClientRect() — a BORDER box — and wrote the result into
       canvas.style, which sizes a CONTENT box. Every ResizeObserver tick
       therefore added the border width and re-triggered the observer: the
       panel grew about 2px every 150ms and build() re-ran roughly seven times
       a second. That is the whole of the "glitchy and constantly expanding"
       this animation was pulled for.

       So: nothing here reads geometry, and nothing anywhere writes to
       canvas.style. There is no path from a write back to a read, which makes
       that failure structurally impossible rather than merely fixed. The
       canvas carries its intrinsic size and the stylesheet gives it
       width:100%; height:auto — the aspect ratio does the rest.

       devicePixelRatio is read once for the backing store. It is a display
       property, not a layout one, and nothing we draw can change it. */

    function build() {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);

        /* The logical size comes from the element's own data attributes. That
           is a number we wrote reading a number we wrote — not a measurement,
           and nothing drawn can change it. Declaring it per host is what lets a
           wide backdrop be laid out wide instead of being a tall field
           stretched sideways: the emitter spacing, the lattice and the particle
           budget all derive from w and h. */
        w = Math.max(120, +canvas.getAttribute('data-w') || 480);
        h = Math.max(120, +canvas.getAttribute('data-h') || 600);

        canvas.width  = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        latticeH = h * LATTICE_PCT;
        /* The source burns ON the bottom edge, not above it. It sat at h - 8,
           which stretched to about eleven pixels of dead space under the hero
           and eight under a drawing — enough that the bright line read as a
           separate rule hovering over the perimeter rather than as the floor of
           the box. Two 1px lines are drawn from here, so h - 2 puts the pair
           flush against the bottom with both still inside the canvas. */
        sourceY  = h - 2;
        /* Both counts below are densities per unit of area and per unit of
           width. The ceilings are a frame-rate stop, nothing more — sized for
           the widest field on the site rather than for the 480px panel this
           started as, where the old 160/9 clamped a backdrop to half density
           and made it read as absent. Raised again when the hero field grew to
           cover the stats strip below it. */
        maxParticles = Math.round(Math.min(420, Math.max(70, w * h / 2600)));

        // Emitters along the source line, each flickering on its own phase.
        emitters = [];
        var count = Math.max(5, Math.min(26, Math.round(w / 62)));
        for (var e = 0; e < count; e++) {
            emitters.push({
                x: (w / (count + 1)) * (e + 1) + rand(-10, 10),
                phase: rand(0, Math.PI * 2),
                speed: rand(0.7, 1.9)
            });
        }

        /* latticeH is what a particle is absorbed AT, so zero means nothing
           absorbs and the gas simply leaves the top. */
        if (riseOnly) {
            latticeH = 0;
            cols = rows = 0;
            nodes = [];
            particles = [];
            for (var rp = 0; rp < maxParticles; rp++) particles.push(spawn({}, true));
            return;
        }

        // Lattice, inset so nodes never touch the panel edge.
        cols = Math.max(2, Math.floor((w - 28) / NODE_GAP));
        rows = Math.max(2, Math.floor((latticeH - 28) / NODE_GAP));
        var ox = (w - (cols - 1) * NODE_GAP) / 2;
        var oy = (latticeH - (rows - 1) * NODE_GAP) / 2 + 8;

        nodes = [];
        for (var r = 0; r < rows; r++) {
            for (var c = 0; c < cols; c++) {
                nodes.push({ x: ox + c * NODE_GAP, y: oy + r * NODE_GAP, r: r, c: c, charge: 0, hot: 0 });
            }
        }

        particles = [];
        for (var p = 0; p < maxParticles; p++) particles.push(spawn({}, true));
    }

    function spawn(P, scatter) {
        var em = emitters[(Math.random() * emitters.length) | 0];
        P.x = em ? em.x + rand(-5, 5) : w / 2;
        P.y = scatter ? rand(latticeH, sourceY) : sourceY - rand(0, 6);
        P.vy = -rand(18, 46);
        P.drift = rand(0.006, 0.02);
        P.phase = rand(0, Math.PI * 2);
        P.amp = rand(3, 11);
        P.size = Math.random() > 0.72 ? 2 : 1;
        return P;
    }

    function nodeAt(x, y) {
        if (!nodes.length) return null;
        var first = nodes[0];
        var c = Math.round((x - first.x) / NODE_GAP);
        var r = Math.round((y - first.y) / NODE_GAP);
        if (c < 0 || c >= cols || r < 0 || r >= rows) return null;
        var n = nodes[r * cols + c];
        if (!n) return null;
        return (Math.abs(n.x - x) < NODE_GAP * 0.5 && Math.abs(n.y - y) < NODE_GAP * 0.5) ? n : null;
    }

    /* ---- Simulation ---------------------------------------------------- */

    function step(dt) {
        t += dt;

        for (var i = 0; i < particles.length; i++) {
            var P = particles[i];
            P.y += P.vy * dt;
            P.x += Math.sin(P.y * P.drift + P.phase) * P.amp * dt;

            // Absorbed by the lattice, or off the top — either way, recycle.
            if (P.y < latticeH) {
                var n = nodeAt(P.x, P.y);
                if (n) {
                    n.charge = Math.min(1, n.charge + 0.5);
                    spawn(P, false);
                    continue;
                }
            }
            if (P.y < -4 || P.x < -20 || P.x > w + 20) spawn(P, false);
        }

        for (var k = 0; k < nodes.length; k++) {
            var N = nodes[k];
            if (N.charge > 0) N.charge = Math.max(0, N.charge - DECAY * dt);
            if (N.hot > 0) N.hot = Math.max(0, N.hot - dt * 1.1);
        }

        // The solve beat: a scanline crossing one row, sealing it.
        if (riseOnly) return;
        if (!solve && t > solveAt) {
            solve = { row: (Math.random() * rows) | 0, at: 0 };
        }
        if (solve) {
            solve.at += dt * 1000;
            var prog = Math.min(1, solve.at / SOLVE_MS);
            var edge = prog * w;
            for (var s = 0; s < cols; s++) {
                var sn = nodes[solve.row * cols + s];
                if (sn && sn.x <= edge) { sn.charge = 1; sn.hot = 1; }
            }
            if (prog >= 1) { solve = null; solveAt = t + rand(9, 15); }
        }
    }

    /* ---- Render -------------------------------------------------------- */

    function fill(rgb, a, x, y, sw, sh) {
        ctx.fillStyle = 'rgba(' + rgb + ',' + a.toFixed(3) + ')';
        ctx.fillRect(x, y, sw, sh);
    }

    function draw() {
        ctx.clearRect(0, 0, w, h);

        // --- Lattice links: the fabric knitting itself as charge arrives ---
        ctx.lineWidth = 1;
        for (var i = 0; i < nodes.length; i++) {
            var N = nodes[i];
            if (N.charge <= LINK_AT) continue;
            var right = (N.c < cols - 1) ? nodes[i + 1] : null;
            var down  = (N.r < rows - 1) ? nodes[i + cols] : null;
            for (var d = 0; d < 2; d++) {
                var M = d ? down : right;
                if (!M || M.charge <= LINK_AT) continue;
                var la = Math.min(N.charge, M.charge) - LINK_AT;
                var hotLink = N.hot > 0 && M.hot > 0;
                ctx.strokeStyle = 'rgba(' + (hotLink ? HOT : PLAT) + ',' + (la * 0.5).toFixed(3) + ')';
                ctx.beginPath();
                ctx.moveTo(N.x, N.y);
                ctx.lineTo(M.x, M.y);
                ctx.stroke();
            }
        }

        // --- Lattice nodes ---
        for (var k = 0; k < nodes.length; k++) {
            var P = nodes[k];
            var a = 0.06 + P.charge * 0.55;
            var rgb = P.hot > 0 ? HOT : PLAT;
            if (P.hot > 0) a = Math.max(a, 0.35 + P.hot * 0.55);

            if (P.charge > 0.45) fill(rgb, a * 0.10, P.x - 4.5, P.y - 4.5, 9, 9);
            fill(rgb, a, P.x - 1.5, P.y - 1.5, 3, 3);

            // Sealed nodes get machined tick marks.
            if (P.charge > 0.8) {
                var ta = (P.charge - 0.8) * 2.2;
                fill(rgb, ta * 0.6, P.x - 5, P.y, 3, 1);
                fill(rgb, ta * 0.6, P.x + 2, P.y, 3, 1);
            }
        }

        // --- Solve scanline ---
        if (solve) {
            var edge = Math.min(1, solve.at / SOLVE_MS) * w;
            var row = nodes[solve.row * cols];
            if (row) {
                fill(HOT, 0.5, edge - 1, row.y - 7, 1, 14);
                fill(WARM, 0.10, edge - 9, row.y - 7, 9, 14);
            }
        }

        // --- Rising particles, cooling as they climb ---
        for (var p = 0; p < particles.length; p++) {
            var Q = particles[p];
            if (Q.y > sourceY || Q.y < 0) continue;
            /* 0 at the source, 1 at the TOP OF THE PANEL -- not at the lattice.
               It used to be measured against sourceY - latticeH, which finished
               the whole orange-to-platinum ramp inside the bottom 44% of the
               hero and left everything above it uniformly faint platinum. The
               gas read as a thin hot band with haze over it.
               Measured over the full height the orange band is 248px instead of
               109px and the cooling is gradual all the way up, which is what
               the portal's field does and the reason it looks better. Same
               formula in both files now, deliberately. */
            var climb = (sourceY - Q.y) / Math.max(1, sourceY);
            if (climb < 0) climb = 0; else if (climb > 1) climb = 1;
            var col = climb < 0.34 ? HOT : (climb < 0.68 ? WARM : PLAT);
            var a = 0.14 + (1 - climb) * 0.5;
            fill(col, a, Q.x, Q.y, Q.size, Q.size);
        }

        // --- Heat haze above the source ---
        var haze = ctx.createLinearGradient(0, sourceY - SHIMMER_H, 0, sourceY);
        var flick = 0.10 + Math.sin(t * 3.1) * 0.012 + Math.sin(t * 7.7) * 0.008;
        haze.addColorStop(0, 'rgba(' + HOT + ',0)');
        haze.addColorStop(1, 'rgba(' + HOT + ',' + flick.toFixed(3) + ')');
        ctx.fillStyle = haze;
        ctx.fillRect(0, sourceY - SHIMMER_H, w, SHIMMER_H);

        // --- Source line, brightening under each flickering emitter ---
        fill(HOT, 0.32, 0, sourceY, w, 1);
        for (var e = 0; e < emitters.length; e++) {
            var E = emitters[e];
            var burn = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * E.speed + E.phase));
            fill(WARM, 0.55 * burn, E.x - 7, sourceY - 1, 14, 2);
            fill(HOT, 0.13 * burn, E.x - 20, sourceY - 4, 40, 5);
        }
        fill(WARM, 0.30, 0, sourceY + 1, w, 1);
    }

    /* ---- Loop ---------------------------------------------------------- */

    function frame(now) {
        if (document.hidden || !visible) { raf = null; return; }
        raf = requestAnimationFrame(frame);
        var dt = last ? Math.min((now - last) / 1000, MAX_DT) : 0.016;
        last = now;
        step(dt);
        draw();
    }

    function start() {
        if (raf || reduced || document.hidden || !visible) return;
        last = 0;
        raf = requestAnimationFrame(frame);
    }

    function stop() {
        if (raf) { cancelAnimationFrame(raf); raf = null; }
    }

    /* ---- Reduced motion: one composed still, never a blank box ---------- */

    function still() {
        for (var i = 0; i < 90; i++) step(1 / 30);
        for (var k = 0; k < nodes.length; k++) {
            nodes[k].charge = Math.max(nodes[k].charge, Math.random() > 0.55 ? rand(0.25, 0.95) : 0);
        }
        solve = null;
        draw();
    }

    /* ---- Wiring -------------------------------------------------------- */

    /* No resize wiring at all. The field is laid out in fixed logical units,
       so a resize changes nothing it would need to know about — and the
       observer that used to live here was half of the bug described above. */

    if (window.IntersectionObserver) {
        new IntersectionObserver(function (entries) {
            visible = entries[0].isIntersecting;
            if (visible) start(); else stop();
        }, { threshold: 0 }).observe(host);
    }

    document.addEventListener('visibilitychange', function () {
        if (document.hidden) stop(); else start();
    });

    build();
    if (reduced) still(); else start();
    }
})();
