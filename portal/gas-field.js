/* ===== PROTON MINING — the gas field =====

   Stranded gas rising and cooling, behind the producer sign-in.

   THIS IS THE SAME ANIMATION AS THE MARKETING SITE'S. site/hero-anim.js draws a
   source line where energy combusts and the rise where it travels upward,
   cooling orange to platinum, on all thirteen of its backdrops. This is that,
   sized to a viewport instead of to an element.

   Which means the emitters, the spawn, the sine drift, the climb ramp and the
   heat haze below are lifted from that file rather than reinvented, down to the
   constants: vy of 18-46 px/s, drift 0.006-0.02, amplitude 3-11, one pixel in
   four at double size, alpha 0.14 + (1 - climb) * 0.5, and the same particle
   cap. A producer arriving from protonminingco.com should see the same substance
   moving the same way, because it is the same code — tests/portal-frontend.test.js
   checks the constants against that file rather than pinning them here, so the
   two cannot drift apart quietly.

   WHY THIS FILE EXISTS AT ALL, given that. The portal loads a deliberately short
   allowlist of scripts into a counterparty's browser and site/ is not on it. The
   duplication is the price of that boundary, and the cross-file assertions are
   what keeps it honest.

   THE ONE INTENDED DIFFERENCE. The site's fields sit in bounded boxes whose
   bottom edge is a real edge, so the source burns ON it at h - 2 and the line is
   part of the design. This is a full viewport behind a sign-in card, which has
   no floor to be the floor of, so the source goes to h + 12 and the emitters sit
   below the fold: what you see is gas that has already left them.

   WHAT USED TO BE HERE, AND THERE. The hero once had a third part — a lattice
   where hashrate crystallised out of the arriving gas. This file never took it,
   on the grounds that a lattice knitting itself behind a password field is
   decoration arguing with the form, and a sign-in for somebody SELLING gas is
   not making the hashrate argument. The site has since dropped it as well, so
   that every backdrop would be one thing.

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

        /* Same density rule AND the same ceiling as the site — area, not width,
           so a tall window is not sparse.

           The cap was the one number that differed: the site's was 420 while
           this asked for ~570 on a 1484x1005 screen, so 420 truncated it and the
           field read as a starfield rather than as gas coming off a source. The
           site started measuring its real boxes, discovered it wanted 586 across
           the hero and 708 across the contact header, and took this number. It
           is a cost bound rather than part of the look, but the two agreeing is
           what makes the density identical everywhere. */
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
            /* Off the top or out the side — recycle. A particle could once also
               be absorbed by the hero's lattice; nothing absorbs one partway up
               in either file now, so gas simply leaves the top. */
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
            /* 0 at the source, 1 at the top of the viewport. Measured over the
               whole rise, so the orange-to-platinum ramp is gradual all the way
               up rather than finishing in a hot band near the bottom. This was
               once measured to the hero's lattice; the site computes the
               identical expression now. */
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
