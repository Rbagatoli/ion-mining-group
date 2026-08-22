/* ===== ION MINING GROUP — the genesis field =====

   Three sheets of the Bitcoin genesis block's raw hex, scrolling at different
   speeds behind the producer sign-in.

   RECOVERED, NOT REWRITTEN. This ran in the app until it was taken out for
   being too busy behind dense tables and charts — three full-screen sheets
   competing with numbers somebody was trying to read. That was the right call
   there and it is the wrong call here: a sign-in page has one form on it and
   nothing to compete with, which is the one place this belongs. The scroll
   speeds, the sheet count and the seamless-wrap trick are lifted from
   shared.js as it stood at 3689352^, not reimplemented from memory.

   THE HEX IS REAL. It is the actual block header and coinbase transaction of
   block 0, the one carrying the Times headline. Inventing plausible-looking hex
   would have been easier and would have been a small lie on the first screen a
   counterparty sees.

   WHAT CHANGED COMING ACROSS. Two things, both because the setting changed:

     - The alphas are lifted from 0.010-0.022 to 0.022-0.040, roughly double.
       In the app this sat under opaque cards and only needed to be felt; here
       it is the only thing on the page and at the old strength it is
       invisible. The first attempt tripled them instead and the field stopped
       being a backdrop — it read as texture over the form rather than behind
       it. The scrim in portal.css does the protecting, tightened over the form
       column and softened at the edges where there is nothing to protect.

     - It draws to a canvas sized in CSS pixels x devicePixelRatio, and NOTHING
       here measures a DOM element. The viewport is the only input. That is the
       same rule hash-field.js states, and it is what stops a backdrop from
       depending on the layout it sits behind.

     - THE THREE SHEETS ARE NOW THREE SIZES, and every row is snapped to a whole
       pixel. In the app all three drew at one font size, one leading and one
       x-origin — fine at 1-2% alpha under opaque cards, and badly wrong here:
       near-identical glyph grids landing a few pixels apart read as doubled,
       smeared type, and fractional row positions antialiased what was left. It
       looked out of focus. See the SHEETS table and the note on Math.round.

   MOTION IS OPTIONAL, THE PICTURE IS NOT. prefers-reduced-motion draws one
   composed frame and starts no timer — somebody who asked the operating system
   to stop things moving still gets the field, just still. */

(function () {
    'use strict';

    var canvas = document.getElementById('genesisField');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');

    /* Block 0's header plus its coinbase transaction, verbatim. */
    var GENESIS_HEX =
        '0100000000000000000000000000000000000000000000000000000000000000000000003ba3edfd7a7b12b2' +
        '7ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a29ab5f49ffff001d1dac2b7c010100000001000000' +
        '0000000000000000000000000000000000000000000000000000000000ffffffff4d04ffff001d010445546865' +
        '2054696d65732030332f4a616e2f32303039204368616e63656c6c6f72206f6e206272696e6b206f6620736563' +
        '6f6e64206261696c6f757420666f722062616e6b73ffffffff0100f2052a01000000434104678afdb0fe554827' +
        '1967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba' +
        '0b8d578a4c702b6bf11d5fac00000000';

    var isMobile = Math.min(window.innerWidth, window.innerHeight) < 768;
    var FRAME_MS = isMobile ? 40 : 25;

    /* ---------- three sheets, three SIZES ----------

       The app version drew all three at one font size, one line height and one
       x-origin, differing only in scroll offset and speed. On a dark panel under
       opaque cards at 1-2% alpha that was fine. Full-bleed at 2-4% it is not:
       three near-identical grids of glyphs land a few pixels apart and the eye
       reads the overlap as doubled, smeared type. It looks like the hex is out
       of focus, and it was the first thing anyone noticed.

       Overlap is unavoidable with layers. What is avoidable is layers that look
       the SAME. Give each its own size, leading and horizontal origin and the
       overlap stops reading as one blurred thing and starts reading as three
       things at different distances -- which is what the different speeds were
       always trying to say.

       Small, slow and faint reads as far away; large, fast and brighter as
       near. That ordering is the whole illusion, so the three rows below move
       together or not at all. */
    var SHEETS = isMobile ? [
        { font:  8, line: 11, char: 5.3, speed:  8, alpha: 0.020, x: 0 },
        { font: 10, line: 14, char: 6.6, speed: 20, alpha: 0.028, x: 3 },
        { font: 12, line: 17, char: 7.9, speed: 32, alpha: 0.034, x: 7 }
    ] : [
        { font:  9, line: 13, char: 6.0, speed:  8, alpha: 0.020, x: 0 },
        { font: 11, line: 15, char: 7.3, speed: 20, alpha: 0.028, x: 4 },
        { font: 13, line: 18, char: 8.6, speed: 32, alpha: 0.034, x: 9 }
    ];

    /* Platinum. All type in this palette is platinum, and at these alphas an
       orange would be invisible anyway — the same reasoning the app version
       carried, and the reason the hex stayed platinum when the sparks went
       orange. */
    var INK = 'rgba(229, 228, 226, ';

    var sheets = [];
    var timer = null;

    function build() {
        var w = window.innerWidth, h = window.innerHeight;
        var dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        sheets = [];
        for (var s = 0; s < SHEETS.length; s++) {
            var spec = SHEETS[s];
            var charsPerRow = Math.ceil(w / spec.char) + 4;
            var rowsNeeded = Math.ceil(h / spec.line) + 4;
            /* Double height, so scrolling can wrap by half without a seam. */
            var totalRows = rowsNeeded * 2;

            var rows = [];
            /* Each sheet starts at a different offset into the block, so the
               three are visibly different text rather than the same wall three
               times. */
            var pos = Math.floor(Math.random() * GENESIS_HEX.length);
            for (var r = 0; r < totalRows; r++) {
                var row = '';
                for (var c = 0; c < charsPerRow; c++) {
                    row += GENESIS_HEX.charAt(pos % GENESIS_HEX.length);
                    pos++;
                    /* A space every two characters, so it reads as a hex dump
                       rather than as one unbroken string. */
                    if ((c + 1) % 2 === 0 && c < charsPerRow - 1) row += ' ';
                }
                rows.push(row);
            }

            sheets.push({
                rows: rows,
                totalRows: totalRows,
                visibleRows: rowsNeeded,
                scrollY: Math.random() * totalRows * spec.line,
                line: spec.line,
                font: spec.font + 'px monospace',
                speed: spec.speed,
                opacity: spec.alpha,
                x: spec.x
            });
        }
    }

    function draw(dt) {
        var w = window.innerWidth, h = window.innerHeight;
        ctx.clearRect(0, 0, w, h);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';

        for (var s = 0; s < sheets.length; s++) {
            var S = sheets[s];
            S.scrollY -= S.speed * dt;
            var sheetHeight = S.totalRows * S.line;
            /* Wrap by half the sheet, which is exactly one screen's worth, so
               the rows that come back are the ones that just left. */
            if (S.scrollY < 0) S.scrollY += sheetHeight / 2;

            ctx.font = S.font;
            ctx.fillStyle = INK + S.opacity.toFixed(4) + ')';

            var startRow = Math.floor(S.scrollY / S.line);
            var offsetY = -(S.scrollY % S.line);

            for (var r = 0; r <= S.visibleRows; r++) {
                var idx = (startRow + r) % S.totalRows;
                var y = offsetY + r * S.line;
                if (y < -S.line || y > h + S.line) continue;
                /* SNAPPED TO A WHOLE PIXEL. offsetY is fractional by
                   construction -- it is a scroll position modulo a line height --
                   so without this every glyph lands on a half pixel and the
                   rasteriser antialiases it across two rows. At 2% alpha that
                   antialiasing IS the glyph, and the result reads as genuinely
                   out of focus rather than faint. Rounding costs a sub-pixel
                   stutter nobody can see at 8-32 px/s and buys crisp type. */
                ctx.fillText(S.rows[idx], S.x, Math.round(y));
            }
        }
    }

    var reduced = false;
    try {
        reduced = !!(window.matchMedia &&
                     window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { reduced = false; }

    /* ---------- when it runs ----------

       Two independent reasons to stop, tracked separately, so the ticker runs
       only when neither says otherwise. One boolean would have a tab regaining
       focus restart a field that is still scrolled out of sight. Same shape as
       hash-field.js, deliberately. */
    var onScreen = true;
    var tabVisible = true;

    function tick() { draw(FRAME_MS / 1000); }

    function sync() {
        if (reduced) return;
        var want = onScreen && tabVisible;
        if (want && !timer) timer = setInterval(tick, FRAME_MS);
        else if (!want && timer) { clearInterval(timer); timer = null; }
    }

    build();
    draw(0);

    if (reduced) return;

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
        resizeTimer = setTimeout(function () {
            /* SHEETS is chosen once at load and deliberately not re-picked here.
               Crossing 768px mid-session would swap all three sizes at once and
               the field would visibly jump; the metrics differ by two or three
               pixels and are not worth that. build() re-fits the rows to the new
               viewport either way, which is the part that actually matters. */
            build();
            draw(0);
        }, 200);
    });

    sync();
})();
