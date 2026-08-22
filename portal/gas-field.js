/* ===== ION MINING GROUP — the gas field =====

   Stranded gas rising and cooling, behind the producer sign-in.

   THIS IS THE HERO ANIMATION WITH TWO OF ITS THREE PARTS REMOVED. site/hero-anim.js
   draws the company thesis bottom to top — a source line where energy combusts,
   the rise where it travels upward cooling orange to platinum, and a lattice at
   the top where hashrate crystallises out of it. Only the middle part is here.
   No nodes, no links, no solve scanline.

   Which means the emitters, the spawn, the sine drift, the climb ramp and the
   heat haze below are lifted from that file rather than reinvented, down to the
   constants: vy of 18-46 px/s, drift 0.006-0.02, amplitude 3-11, one pixel in
   four at double size, and alpha 0.14 + (1 - climb) * 0.5. A producer arriving
   from ionmininggroup.com should see the same substance moving the same way,
   because it is the same code.

   WHAT CHANGED FOR THIS SETTING. In the hero the rise ends at the lattice, so a
   particle is absorbed partway up and the climb ramp is measured against that
   boundary. Here there is nothing to arrive at, so the climb is measured over
   the whole viewport and a particle simply leaves the top. That is the only
   behavioural difference; everything else is the same numbers.

   WHY NOT THE LATTICE TOO. It is the busiest part of the hero and it is the part
   that says "hashrate". This page is a sign-in for somebody selling gas, not
   somebody buying hashrate, and a lattice knitting itself behind a password
   field is decoration arguing with the form. The rise says the thing that
   matters here on its own.

   No dependencies. Glow is layered low-alpha rectangles, never ctx.shadowBlur,
   which is by far the most expensive thing available on a canvas this busy —
   the same rule hero-anim.js states. */

(function () {
    'use strict';

    var canvas = document.getElementById('gasField');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d', { alpha: true });

    var PLAT = '229,228,226';
    var HOT  = '247,147,26';
    var WARM = '255,196,107';

    var MAX_DT    = 0.05;   /* clamp, so a backgrounded tab cannot teleport the field */
    var SHIMMER_H = 62;     /* heat haze height above the source line */

    var w = 0, h = 0, sourceY = 0;
    var particles = [], emitters = [];
    var maxParticles = 140;
    var raf = null, last = 0, t = 0;
    var visible = true;

    var reduced = false;
    try {
        reduced = !!(window.matchMedia &&
                     window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { reduced = false; }

    function rand(a, b) { return a + Math.random() * (b - a); }

    function build() {
        w = window.innerWidth;
        h = window.innerHeight;
        var dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        /* The source sits just below the fold so the emitters themselves are
           never on screen — what you see is gas that has already left them, not
           a row of dots along the bottom edge. */
        sourceY = h + 12;

        /* Same density RULE as the hero — area, not width, so a tall window is
           not sparse — but a higher ceiling.

           The hero's cap is 420 and its own comment records it being raised
           twice as the panel grew. At full viewport the rule asks for ~570 on a
           1484x1005 screen, so 420 truncates it and the field reads as a
           starfield rather than as gas coming off a source. The cap is a cost
           bound, not part of the look, so it is the one number here that
           differs from hero-anim.js. */
        maxParticles = Math.round(Math.min(900, Math.max(70, w * h / 2600)));

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
        /* Scattered on first build so the field is already full rather than
           filling from the bottom over the first ten seconds. */
        P.y = scatter ? rand(0, sourceY) : sourceY - rand(0, 6);
        P.vy = -rand(18, 46);
        P.drift = rand(0.006, 0.02);
        P.phase = rand(0, Math.PI * 2);
        P.amp = rand(3, 11);
        P.size = Math.random() > 0.72 ? 2 : 1;
        return P;
    }

    function step(dt) {
        t += dt;
        for (var i = 0; i < particles.length; i++) {
            var P = particles[i];
            P.y += P.vy * dt;
            P.x += Math.sin(P.y * P.drift + P.phase) * P.amp * dt;
            /* Off the top or out the side — recycle. In the hero a particle can
               also be absorbed by the lattice; there is nothing to absorb it
               here. */
            if (P.y < -4 || P.x < -20 || P.x > w + 20) spawn(P, false);
        }
    }

    function fill(rgb, a, x, y, sw, sh) {
        ctx.fillStyle = 'rgba(' + rgb + ',' + a.toFixed(3) + ')';
        ctx.fillRect(x, y, sw, sh);
    }

    function draw() {
        ctx.clearRect(0, 0, w, h);

        for (var p = 0; p < particles.length; p++) {
            var Q = particles[p];
            if (Q.y > sourceY || Q.y < 0) continue;
            /* 0 at the source, 1 at the top of the viewport. In the hero this
               is measured to the lattice; with no lattice the whole rise is the
               ramp, so gas cools over the full height instead of over the lower
               half. */
            var climb = (sourceY - Q.y) / Math.max(1, sourceY);
            if (climb < 0) climb = 0; else if (climb > 1) climb = 1;
            var col = climb < 0.34 ? HOT : (climb < 0.68 ? WARM : PLAT);
            var a = 0.14 + (1 - climb) * 0.5;
            fill(col, a, Math.round(Q.x), Math.round(Q.y), Q.size, Q.size);
        }

        /* Heat haze at the source. Two sine terms at unrelated frequencies, so
           the flicker never settles into a visible beat. */
        var haze = ctx.createLinearGradient(0, sourceY - SHIMMER_H, 0, sourceY);
        var flick = 0.10 + Math.sin(t * 3.1) * 0.012 + Math.sin(t * 7.7) * 0.008;
        haze.addColorStop(0, 'rgba(' + HOT + ',0)');
        haze.addColorStop(1, 'rgba(' + HOT + ',' + flick.toFixed(3) + ')');
        ctx.fillStyle = haze;
        ctx.fillRect(0, sourceY - SHIMMER_H, w, SHIMMER_H);
    }

    function frame(now) {
        var dt = Math.min(MAX_DT, (now - last) / 1000 || 0);
        last = now;
        step(dt);
        draw();
        raf = requestAnimationFrame(frame);
    }

    function start() {
        if (raf || reduced || !visible) return;
        last = performance.now();
        raf = requestAnimationFrame(frame);
    }

    function stop() {
        if (raf) { cancelAnimationFrame(raf); raf = null; }
    }

    /* One composed still: the field as it looks mid-rise, drawn once. Somebody
       who asked the operating system to stop things moving has asked for that,
       and gas that drifts gently is still drifting. */
    function still() {
        step(0);
        draw();
    }

    build();

    if (reduced) { still(); return; }

    /* Two independent reasons to stop, tracked separately, so a tab regaining
       focus does not restart a field that is still scrolled out of sight. */
    if (window.IntersectionObserver) {
        new IntersectionObserver(function (entries) {
            visible = entries[0].isIntersecting;
            if (visible) start(); else stop();
        }, { threshold: 0 }).observe(canvas);
    }

    document.addEventListener('visibilitychange', function () {
        if (document.hidden) stop(); else start();
    });

    var resizeTimer = null;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        /* Rebuild rather than rescale, and debounced: a drag would otherwise
           reallocate the particle array on every intermediate width. */
        resizeTimer = setTimeout(function () { build(); }, 200);
    });

    start();
})();
