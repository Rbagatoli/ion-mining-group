/* ===== ION MINING GROUP — hex rain =====

   Columns of hexadecimal falling down the screen, characters changing as they
   go. Behind the producer sign-in.

   WHAT THIS REPLACED, AND WHY IT HAD TO. The first attempt recovered the app's
   old background: three full-screen sheets of the genesis block's raw hex,
   sliding past each other at different speeds. It could not be made to work
   here and no amount of tuning was going to fix it, because the problem was
   structural — three transparent layers of similar type stacked on one another
   average into grey mush. Making them different sizes helped; snapping rows to
   whole pixels helped; neither addressed that a character at 2% alpha with two
   more behind it is not a character anyone can read. It was illegible, and
   "constantly changing code falling down the screen" is a different effect
   from "three fixed sheets sliding", not a tuning of it.

   ONE LAYER. Every glyph on screen is drawn exactly once, at an alpha somebody
   can actually read, and nothing is drawn on top of anything else. That is the
   whole reason this is legible where the last one was not.

   THE FADE IS THE TRAIL. Each frame paints a nearly-transparent black over the
   whole canvas and then draws only the NEW head character in each column.
   Everything already there dims a little, so the tails fall out of the
   compositing for free — no trail arrays, no per-character alpha bookkeeping,
   and one fillText per column per step instead of twenty. At ~150 columns that
   is the difference between a background and a fan coming on.

   THE HEX IS NOT A BLOCK ANY MORE, and that is a real trade. The version this
   replaced carried the actual bytes of block 0, verifiably, and there was a
   test that decoded the header to prove it. Characters that constantly change
   cannot also be a specific fixed block — the two things are mutually
   exclusive — so this generates random hex and claims nothing about it. Better
   an honest 0-f than a claim to be the genesis block while re-rolling it. */

(function () {
    'use strict';

    var canvas = document.getElementById('hexRain');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');

    var HEX = '0123456789abcdef';
    var FRAME_MS = 55;

    var isMobile = Math.min(window.innerWidth, window.innerHeight) < 768;
    var FONT = isMobile ? 12 : 14;      /* readable, which was the whole point */
    var STEP = isMobile ? 15 : 17;      /* vertical distance between characters */
    var COL_W = isMobile ? 12 : 14;     /* horizontal spacing between columns */

    /* How fast the black wash accumulates, and therefore how long a tail is.
       0.055 gives roughly a 25-character trail before a glyph is gone. Higher
       is shorter and busier; lower and old characters linger until the screen
       silts up. */
    var FADE = 0.055;

    /* The head is bright enough to read; the trail is what it decays into.
       Platinum, like all type in this palette. */
    var HEAD = 'rgba(233, 232, 230, 0.62)';
    var BODY = 'rgba(229, 228, 226, 0.34)';

    var cols = [];
    var W = 0, H = 0;

    function reset(c, atTop) {
        /* Staggered starts, so the columns do not arrive as a front. A rain
           that begins as one horizontal line reads as a wipe, not weather. */
        c.y = atTop ? -Math.random() * H : -STEP;
        c.speed = 0.55 + Math.random() * 1.1;   /* rows per tick */
        c.next = 0;
    }

    function build() {
        W = window.innerWidth;
        H = window.innerHeight;
        var dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.font = FONT + 'px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
        ctx.textBaseline = 'top';

        /* Clear rather than fade on a rebuild: the old frame was sized to the
           old viewport and stretching it would smear. */
        ctx.clearRect(0, 0, W, H);

        cols = [];
        var n = Math.ceil(W / COL_W);
        for (var i = 0; i < n; i++) {
            var c = { x: i * COL_W, y: 0, speed: 0, next: 0 };
            reset(c, true);
            cols.push(c);
        }
    }

    function tick() {
        /* The wash. source-over black at low alpha, which is what turns every
           previously-drawn character into its own fading tail. */
        ctx.fillStyle = 'rgba(0, 0, 0, ' + FADE + ')';
        ctx.fillRect(0, 0, W, H);

        for (var i = 0; i < cols.length; i++) {
            var c = cols[i];
            c.y += c.speed * STEP;

            /* One character per column per step, on a whole pixel. Fractional y
               antialiases a glyph across two rows, and at these alphas that
               blur is most of the glyph -- the mistake the last version made. */
            var y = Math.round(c.y);

            /* The head, brighter than what it leaves behind. */
            ctx.fillStyle = HEAD;
            ctx.fillText(HEX.charAt((Math.random() * 16) | 0), c.x, y);

            /* And one character further up, redrawn at trail brightness. This
               is what makes the column look like it is CHANGING rather than
               merely moving: a glyph already on screen is replaced with a
               different one before it has finished fading. Without it the rain
               falls but the code never churns. */
            if (Math.random() < 0.45) {
                var back = y - STEP * (1 + ((Math.random() * 4) | 0));
                if (back > 0) {
                    ctx.fillStyle = BODY;
                    ctx.fillText(HEX.charAt((Math.random() * 16) | 0), c.x, back);
                }
            }

            /* Off the bottom, with a random delay so columns keep drifting out
               of step with one another instead of settling into a pattern. */
            if (c.y > H + STEP * 2 && Math.random() > 0.975) reset(c, false);
        }
    }

    /* ---------- reduced motion ----------
       One composed still: a screen of hex, drawn once, no timer. Somebody who
       asked the operating system to stop things moving has asked for that, and
       a rain that falls gently is still falling. */
    var reduced = false;
    try {
        reduced = !!(window.matchMedia &&
                     window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { reduced = false; }

    function still() {
        ctx.fillStyle = BODY;
        for (var x = 0; x < W; x += COL_W) {
            var top = Math.random() * H * 0.6;
            for (var y = top; y < H; y += STEP) {
                ctx.fillText(HEX.charAt((Math.random() * 16) | 0), x, Math.round(y));
            }
        }
    }

    /* ---------- when it runs ----------
       Two independent reasons to stop, tracked separately, so a tab regaining
       focus does not restart a field that is still scrolled out of sight. */
    var timer = null;
    var onScreen = true;
    var tabVisible = true;

    function sync() {
        if (reduced) return;
        var want = onScreen && tabVisible;
        if (want && !timer) timer = setInterval(tick, FRAME_MS);
        else if (!want && timer) { clearInterval(timer); timer = null; }
    }

    build();

    if (reduced) { still(); return; }

    if (window.IntersectionObserver) {
        new IntersectionObserver(function (entries) {
            onScreen = entries[0].isIntersecting;
            sync();
        }, { threshold: 0 }).observe(canvas);
    }

    document.addEventListener('visibilitychange', function () {
        tabVisible = !document.hidden;
        sync();
    });

    var resizeTimer = null;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        /* Rebuild rather than rescale, and debounced: a drag would otherwise
           reallocate the column array on every intermediate width. */
        resizeTimer = setTimeout(build, 200);
    });

    sync();
})();
