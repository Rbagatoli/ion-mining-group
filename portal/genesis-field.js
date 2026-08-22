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
    var FONT_SIZE = isMobile ? 10 : 11;
    var LINE_HEIGHT = isMobile ? 14 : 15;
    var CHAR_WIDTH = isMobile ? 6.6 : 7.3;
    var SHEET_COUNT = 3;
    var FRAME_MS = isMobile ? 40 : 25;

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
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        var charsPerRow = Math.ceil(w / CHAR_WIDTH) + 4;
        var rowsNeeded = Math.ceil(h / LINE_HEIGHT) + 4;
        /* Double height, so scrolling can wrap by half without a seam. */
        var totalRows = rowsNeeded * 2;

        sheets = [];
        for (var s = 0; s < SHEET_COUNT; s++) {
            var rows = [];
            /* Each sheet starts at a different offset into the block, so the
               three are visibly different text rather than the same wall
               three times. */
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
                scrollY: Math.random() * totalRows * LINE_HEIGHT,
                /* 8, 20, 32 px/s. Different enough to read as depth, slow
                   enough that nothing demands attention. */
                speed: 8 + s * 12,
                /* 0.022 / 0.031 / 0.040.
                   Lifted from the app's 0.010/0.016/0.022, but only about
                   double rather than triple. The first attempt went to
                   0.030-0.055 and the field stopped being a backdrop: at full
                   bleed it covered a third of the pixels in a corner sample and
                   read as texture over the form rather than behind it. The
                   app's own alphas were too faint here, these are the middle. */
                opacity: 0.022 + s * 0.009
            });
        }
    }

    function draw(dt) {
        var w = window.innerWidth, h = window.innerHeight;
        ctx.clearRect(0, 0, w, h);
        ctx.font = FONT_SIZE + 'px monospace';
        ctx.textAlign = 'left';

        for (var s = 0; s < sheets.length; s++) {
            var S = sheets[s];
            S.scrollY -= S.speed * dt;
            var sheetHeight = S.totalRows * LINE_HEIGHT;
            /* Wrap by half the sheet, which is exactly one screen's worth, so
               the rows that come back are the ones that just left. */
            if (S.scrollY < 0) S.scrollY += sheetHeight / 2;

            ctx.fillStyle = INK + S.opacity.toFixed(4) + ')';
            var startRow = Math.floor(S.scrollY / LINE_HEIGHT);
            var offsetY = -(S.scrollY % LINE_HEIGHT);

            for (var r = 0; r <= S.visibleRows; r++) {
                var idx = (startRow + r) % S.totalRows;
                var y = offsetY + r * LINE_HEIGHT;
                if (y < -LINE_HEIGHT || y > h + LINE_HEIGHT) continue;
                ctx.fillText(S.rows[idx], 0, y);
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
            isMobile = Math.min(window.innerWidth, window.innerHeight) < 768;
            build();
            draw(0);
        }, 200);
    });

    sync();
})();
