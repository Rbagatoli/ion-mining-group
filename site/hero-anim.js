/* ===== PROTON MINING — the gas field =====
   Stranded energy combusting and rising, drawn bottom to top:

     source line   flare, landfill, curtailed power — energy with no customer
     rise          that energy travelling upward, cooling orange → platinum

   ONE FIELD, EVERYWHERE. Every backdrop on the marketing site is this, at the
   same density and the same brightness: the home hero, each page header, and
   the canvas behind each engineering drawing. portal/gas-field.js is the same
   animation again for the producer sign-in, sized to a viewport instead of to
   an element. A producer arriving from protonminingco.com sees one substance
   moving one way on every screen, because it is one piece of code.

   WHAT USED TO BE HERE. A third part: a lattice across the top, where hashrate
   crystallised out of the arriving gas, with links knitting between charged
   nodes and a scanline that sealed a row every nine to fifteen seconds.

   It ran on EIGHT of the thirteen canvases — the hero and all seven backdrops
   behind the engineering drawings. Only the five page headers were ever without
   it, via a data-mode="rise" attribute. So the site was split down the middle
   between two different animations, which is what "all the backgrounds look the
   same" was asking about. Removing it took the node grid, the charge decay, the
   absorption test and the solve beat with it: about 120 lines, and 1,006 live
   node objects per frame on energy.html alone (2 laid-out drawings at 41x7 plus
   2 in the hidden fuel pane at 36x6 — the header contributed none).

   No dependencies. Glow is layered low-alpha rectangles, never ctx.shadowBlur —
   shadowBlur is by far the most expensive thing you can do on a canvas this
   busy.

   Self-disables on prefers-reduced-motion (draws one composed still instead),
   when scrolled out of view, and when the tab is hidden. */

(function () {
    'use strict';

    /* One independent field per host. Every piece of state below lives inside
       mount(), so two fields on a page cannot share a particle array or an
       animation frame. */
    Array.prototype.forEach.call(
        document.querySelectorAll('canvas.anim-field'), mount);

    function mount(canvas) {
    if (!canvas || !canvas.getContext) return;

    /* A page field is fixed to the viewport rather than sized to a host, which
       changes exactly two things: where the source line sits (see build()) and
       what the gate watches. Everything else -- density, ink, motion, the resize
       path -- is identical, because the point of the change is that the site and
       the app run one animation, not two that resemble each other. */
    var isPage = canvas.className.indexOf('anim-field--page') >= 0;

    /* ITS OWN HOST when it is the page field. The gate below observes `host` to
       stop drawing behind a display:none pane, and for every other canvas that
       is the element the field is sized to. A page field is sized to the
       viewport and its parent is <body>, whose box says nothing about whether
       the field is on screen -- it always is, because the canvas is fixed. So
       the canvas is its own host: the observer keeps firing, `visible` stays
       true, and the tab-hidden path still stops it.
       Written as a host swap rather than a second .observe() call on purpose --
       pad-suite.js pins the literal `.observe(host)` and mutate-landfill.js
       mutates that exact string to prove the pin bites. */
    var host = isPage ? canvas : canvas.parentNode;

    var ctx = canvas.getContext('2d', { alpha: true });

    var PLAT = '229,228,226';
    var HOT  = '247,147,26';
    var WARM = '255,196,107';

    var MAX_DT    = 0.05;   // clamp, so a backgrounded tab cannot teleport the field
    var SHIMMER_H = 62;     // heat haze height above the source line

    var w = 0, h = 0, sourceY = 0, dpr = 1;
    var particles = [], emitters = [];
    var maxParticles = 140;
    var raf = null, last = 0, t = 0;
    var visible = true;

    /* ---- The drawing in front, when there is one ----------------------

       Behind each engineering drawing this field would otherwise be visible
       THROUGH the plant: those faces are translucent on purpose — 0.42 on a
       top, 0.30 on a side, 0.20 on an end — so that you can read a container's
       racks and its back edges through its own walls. That x-ray look is the
       point of the drawing. Gas rising through the machine is not; it reads as
       dirt on the glass.

       So the drawing publishes its silhouette and the field subtracts it. Two
       things are deliberate here.

       IT ERASES RATHER THAN SOMETHING PAINTING OVER IT. The obvious fix is an
       opaque copy of the drawing between the canvas and the SVG. But what sits
       behind this canvas is not a flat colour: .dg-wrap is
       rgba(255,255,255,0.016) over the body's diagonal light field and its 88px
       grid, measured varying across the panel. An opaque silhouette in any
       single colour reads as a hole punched through that sheen. Erasing takes
       the particles and leaves everything else exactly as it was.

       IT IS ONE PATH FOR THE WHOLE DRAWING. diagram-engine.js unions it across
       every slot before publishing, because a slot is a depth rank rather than
       an object — see the note there.

       Absent on twelve of the thirteen canvases, and that is the normal case. */
    var occEl = host && host.querySelector ? host.querySelector('.dg-occluder') : null;
    var occSvg = host && host.querySelector ? host.querySelector('svg.site-diagram') : null;
    var vbW = 0, vbH = 0, occD = null, occPath = null;
    var canOcclude = !!(occEl && occSvg && typeof Path2D !== 'undefined');

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function rand(a, b) { return a + Math.random() * (b - a); }

    /* ---- Layout -------------------------------------------------------

       THE BUG THIS FILE WAS PULLED FOR, AND WHY THE FIX IS NOT "DON'T MEASURE".
       The first version read the HOST's getBoundingClientRect() — a BORDER box
       — and wrote the result into canvas.style, which sizes a CONTENT box.
       Every ResizeObserver tick therefore added the border width and
       re-triggered the observer: the panel grew about 2px every 150ms and
       build() re-ran roughly seven times a second. That is the whole of the
       "glitchy and constantly expanding".

       The loop needed three things: a read of a box that includes borders, a
       WRITE that changes layout, and an observer closing the circle. Nothing
       here does any of them.

         - It reads the CANVAS's own clientWidth/clientHeight, which is a
           content box measured against a content box.
         - It writes canvas.width/height — the BACKING STORE — and never
           canvas.style. Every .anim-field is position:absolute; inset:0 with
           width and height at 100%, so it is out of flow and CSS is already
           overriding the intrinsic size. Changing the backing store cannot
           move a single pixel of layout, so there is nothing for a read to
           pick up.
         - No ResizeObserver. Only window 'resize', which no canvas write can
           possibly fire.

       WHY MEASURE AT ALL. The fixed logical size was stretched by CSS, and the
       stretch was never uniform: the contact header ran a 430px-tall field into
       1249px of box, so every 1px particle became a 2.9px interpolated smear.
       Backing store == display size is the only way a one-pixel particle is
       one pixel.

       data-w / data-h survive as the fallback for a host that is not laid out
       yet (a diagram in the fuel switch's hidden pane measures 0x0), and as the
       aspect the field was tuned at. */

    function build() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);

        /* The drawing's user space, read once per build. An attribute we wrote,
           not a measurement — the sibling SVG's rendered box was checked to sit
           exactly on the canvas's (dx 0, dy 0, and w/vbW equal to h/vbH), so
           the mapping below is a uniform scale. It is still written as
           min-with-centring, because that is what preserveAspectRatio="xMidYMid
           meet" on the SVG actually promises and the two must not disagree if
           the layout ever changes. */
        if (canOcclude) {
            var vb = (occSvg.getAttribute('viewBox') || '').split(/[\s,]+/);
            vbW = +vb[2] || 0;
            vbH = +vb[3] || 0;
        }

        /* Measured, with the authored size as the floor-case. A 0x0 read means
           "not laid out", not "zero wide" — the same rule as everywhere else in
           this repo, where an absent measurement is never silently a number. */
        w = Math.round(canvas.clientWidth)  || +canvas.getAttribute('data-w') || 480;
        h = Math.round(canvas.clientHeight) || +canvas.getAttribute('data-h') || 600;
        w = Math.max(120, w);
        h = Math.max(120, h);

        canvas.width  = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        /* The source burns ON the bottom edge, not above it. It sat at h - 8,
           which read as a separate rule hovering over the perimeter rather than
           as the floor of the box. Two 1px lines are drawn from here, so h - 2
           puts the pair flush against the bottom with both still inside the
           canvas.

           This is the one place the site's field differs from the portal's,
           which pushes the source to h + 12 so the emitters sit below the fold.
           A full-viewport sign-in has no bottom edge to be the floor of; these
           do, and on the hero that line is also the bevel between the hero zone
           and the band beneath it (see .hero-zone + .band::before). */
        /* The page field has no bottom edge to be the floor of. It is fixed to
           the viewport, so h - 2 would put a row of emitters along the bottom of
           the window and keep it there while the page scrolled past -- a rule
           pinned to the screen rather than a source under the content. Pushing
           the line below the fold is what portal/gas-field.js and the app's
           gas-field.js both do, and for the same reason: what you see is gas
           that has already left the emitters, never the emitters themselves.
           The same 12px, so all three still agree. */
        sourceY = isPage ? h + 12 : h - 2;

        /* Density per unit of AREA, not width, so a tall box is not sparse.
           The ceiling is a frame-rate stop, nothing more. It is 900 rather than
           the 420 it was, because at real measured sizes the rule asks for 586
           across the hero and 708 across the contact header — 420 truncated
           both by a third and the field read as a starfield rather than as gas
           coming off a source. Same number as portal/gas-field.js. */
        maxParticles = Math.round(Math.min(900, Math.max(70, w * h / 2600)));

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

        particles = [];
        for (var p = 0; p < maxParticles; p++) particles.push(spawn({}, true));
    }

    function spawn(P, scatter) {
        var em = emitters[(Math.random() * emitters.length) | 0];
        P.x = em ? em.x + rand(-5, 5) : w / 2;
        /* Scattered over the WHOLE box on first build, so the field is already
           full rather than filling from the bottom over the first ten seconds.
           This used to start at the lattice line, because nothing above it
           survived to be seen. */
        P.y = scatter ? rand(0, sourceY) : sourceY - rand(0, 6);
        P.vy = -rand(18, 46);
        P.drift = rand(0.006, 0.02);
        P.phase = rand(0, Math.PI * 2);
        P.amp = rand(3, 11);
        P.size = Math.random() > 0.72 ? 2 : 1;
        return P;
    }

    /* ---- Simulation ---------------------------------------------------- */

    function step(dt) {
        t += dt;

        for (var i = 0; i < particles.length; i++) {
            var P = particles[i];
            P.y += P.vy * dt;
            P.x += Math.sin(P.y * P.drift + P.phase) * P.amp * dt;

            /* Off the top or out the side — recycle. A particle could also be
               absorbed by the lattice once; there is nothing to absorb it now,
               so gas simply leaves the top of the box. */
            if (P.y < -4 || P.x < -20 || P.x > w + 20) spawn(P, false);
        }
    }

    /* ---- Render -------------------------------------------------------- */

    function fill(rgb, a, x, y, sw, sh) {
        ctx.fillStyle = 'rgba(' + rgb + ',' + a.toFixed(3) + ')';
        ctx.fillRect(x, y, sw, sh);
    }

    function draw() {
        ctx.clearRect(0, 0, w, h);

        // --- Rising particles, cooling as they climb ---
        for (var p = 0; p < particles.length; p++) {
            var Q = particles[p];
            if (Q.y > sourceY || Q.y < 0) continue;
            /* 0 at the source, 1 at the top of the box. It used to be measured
               against the lattice, which finished the whole orange-to-platinum
               ramp inside the bottom 44% and left everything above it uniformly
               faint platinum — the gas read as a thin hot band with haze over
               it. Measured over the full height the cooling is gradual all the
               way up. Same formula as the portal's, deliberately. */
            var climb = (sourceY - Q.y) / Math.max(1, sourceY);
            if (climb < 0) climb = 0; else if (climb > 1) climb = 1;
            var col = climb < 0.34 ? HOT : (climb < 0.68 ? WARM : PLAT);
            var a = 0.14 + (1 - climb) * 0.5;
            /* Whole pixels. A 1px rect at a fractional coordinate is split
               across two device pixels at partial alpha in each, which is a
               grey smudge and not a pixel. */
            fill(col, a, Math.round(Q.x), Math.round(Q.y), Q.size, Q.size);
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

        occlude();
    }

    /* Last, so it takes the source line and the haze too — the plant stands in
       front of those as much as it stands in front of the gas. */
    function occlude() {
        if (!canOcclude || !vbW || !vbH) return;
        var d = occEl.getAttribute('d') || '';
        /* Rebuilt only when the geometry actually changes. The drawing turns
           continuously while it is on screen, so this is usually every frame,
           but a still one costs a string compare. */
        if (d !== occD) {
            occD = d;
            occPath = d ? new Path2D(d) : null;
        }
        if (!occPath) return;

        var s = Math.min(w / vbW, h / vbH);
        ctx.save();
        ctx.setTransform(dpr * s, 0, 0, dpr * s,
                         dpr * (w - vbW * s) / 2, dpr * (h - vbH * s) / 2);
        /* Nonzero, which is the canvas default and is load-bearing: the union
           nests machines inside containers and three tongues inside one flame,
           and evenodd would let each of those punch a hole back through the
           silhouette it sits in. */
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = '#000';
        ctx.fill(occPath);
        ctx.restore();
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
        draw();
    }

    /* ---- Wiring -------------------------------------------------------- */

    /* Resize IS wired, because the field is laid out in measured pixels rather
       than fixed ones. Deliberately window 'resize' and NOT a ResizeObserver:
       'resize' is fired by the viewport and by nothing this code can do, so the
       circuit the old bug needed cannot close. Debounced at the same 200ms
       gas-field.js uses, because a drag would otherwise reallocate the particle
       array on every intermediate width. */
    function rebuildIfResized() {
        var cw = Math.round(canvas.clientWidth), ch = Math.round(canvas.clientHeight);
        if (!cw || !ch) return;                                   // not laid out
        if (Math.abs(cw - w) < 2 && Math.abs(ch - h) < 2) return; // nothing moved
        build();
        if (reduced) still();
    }

    var resizeTimer = null;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(rebuildIfResized, 200);
    });

    /* The gate. Two of the four drawings on energy.html are inside a hidden
       fuel pane at any moment, and without this their fields would animate
       forever behind a display:none. pad-suite.js asserts this block exists and
       mutate-landfill.js mutates the .observe(host) off to prove the assertion
       bites — keep both intact.

       It doubles as the re-measure hook: a host that was not laid out when
       build() first ran measured 0x0 and fell back to its authored size. The
       moment the switch reveals it, it has a real box. */
    if (window.IntersectionObserver) {
        new IntersectionObserver(function (entries) {
            visible = entries[0].isIntersecting;
            if (visible) { rebuildIfResized(); start(); } else stop();
        }, { threshold: 0 }).observe(host);
    }

    document.addEventListener('visibilitychange', function () {
        if (document.hidden) stop(); else start();
    });

    build();
    if (reduced) still(); else start();
    }
})();
