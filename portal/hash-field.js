/* ===== PROTON MINING — the hash field =====

   Proof-of-work as type: a grid of hex churning constantly, with a rare row
   locking into a hash with leading zeros and the "Block found" tag lighting up.

   DOM TEXT ON A CSS GRID. No canvas, no requestAnimationFrame, and nothing here
   measures any element — the grid does all the fitting. That last part is not
   incidental: measuring is what broke the canvas panel this replaced, and it is
   a rule the rest of this codebase keeps.

   REBUILT FROM ITS OWN TEST. The original was deleted when a canvas version
   took over the site hero, and it survives in neither the tree nor git history.
   What did survive is the harness that drove it, and that harness is a complete
   specification: how many cells, how many may move in a single tick, that a
   solved row shows two leading 0000 groups, that it releases, and that the
   whole thing stops dead on a hidden tab or offscreen. This file is written to
   satisfy it, and tests/portal-hash-field.test.js is that harness.

   THE TICK BUDGET IS THE WHOLE EFFECT. Six cells of ninety-six per 75ms tick
   reads as a live field. Move more and it flickers; move fewer and it looks
   broken. The cap is asserted rather than tuned by eye, because "how busy is
   too busy" is exactly the kind of judgement that drifts. */

(function () {
    'use strict';

    var field = document.getElementById('hashField');
    if (!field) return;

    /* getElementsByClassName, not querySelectorAll: it returns a live
       HTMLCollection which is copied into a plain array once, here, so nothing
       downstream can be surprised by the list changing under it. */
    var list = field.getElementsByClassName('hf-cell');
    var cells = [];
    for (var ci = 0; ci < list.length; ci++) cells.push(list[ci]);
    if (!cells.length) return;
    var foundTag = document.getElementById('hashFound');

    var COLS = 6;
    var TICK_MS = 75;
    var PER_TICK = 6;          /* distinct cells rerolled per tick */
    var HOT_PER_TICK = 2;      /* of those, how many run bright */
    var HOLD_TICKS = 33;       /* ~2.5s that a solved row stays lit */
    var HEX = '0123456789abcdef';

    function quad() {
        var s = '';
        for (var i = 0; i < 4; i++) s += HEX.charAt(Math.floor(Math.random() * 16));
        return s;
    }

    /* ---------- reduced motion: one composed still, and no timers ----------

       Not a slower version — none. Somebody who has asked the operating system
       to stop things moving has asked for that, and a field that churns gently
       is still churning. They get the moment the animation exists to show: a
       row solved, the tag lit, held. */
    var reduced = false;
    try {
        reduced = !!(window.matchMedia &&
                     window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { reduced = false; }

    function rowAt(r) { return cells.slice(r * COLS, r * COLS + COLS); }
    function rowCount() { return Math.floor(cells.length / COLS); }

    function lightRow(row) {
        row.forEach(function (c, i) {
            /* Two leading zero groups: what a hash that beat the target looks
               like, and the only part of this that has to be literal. */
            c.textContent = i < 2 ? '0000' : quad();
            c.classList.add('is-solved');
            c.classList.remove('is-hot');
        });
        if (foundTag) foundTag.classList.add('is-on');
    }

    function releaseRow(row) {
        row.forEach(function (c) {
            c.classList.remove('is-solved');
            c.textContent = quad();
        });
        if (foundTag) foundTag.classList.remove('is-on');
    }

    if (reduced) {
        lightRow(rowAt(Math.floor(rowCount() / 2)));
        return;
    }

    /* ---------- the ticker ---------- */

    var timer = null;
    var hot = [];              /* cells lit last tick, cleared on the next */
    var solved = null;         /* the row currently locked, if any */
    var hold = 0;              /* ticks left before it releases */
    var untilSolve = nextGap();

    function nextGap() {
        /* 100..200 ticks: 7.5s to 15s. Long enough to be an event, short enough
           that somebody reading the sign-in copy sees one. */
        return 100 + Math.floor(Math.random() * 101);
    }

    function tick() {
        if (solved) {
            if (--hold <= 0) { releaseRow(solved); solved = null; untilSolve = nextGap(); }
            return;
        }

        hot.forEach(function (c) { c.classList.remove('is-hot'); });
        hot = [];

        /* Distinct indices, so the cap really is a cap. Picking six at random
           and letting duplicates through would make the number of cells that
           actually move vary for no visible reason. */
        var picked = {};
        for (var n = 0; n < PER_TICK; n++) {
            var i, guard = 0;
            do { i = Math.floor(Math.random() * cells.length); }
            while (picked[i] && ++guard < 12);
            picked[i] = true;
            var c = cells[i];
            c.textContent = quad();
            if (hot.length < HOT_PER_TICK) { c.classList.add('is-hot'); hot.push(c); }
        }

        if (--untilSolve <= 0) { solved = rowAt(Math.floor(Math.random() * rowCount())); lightRow(solved); hold = HOLD_TICKS; }
    }

    /* ---------- when it runs ----------

       Two independent reasons to stop, so both are tracked and the ticker runs
       only when neither says otherwise. A single boolean would have the tab
       coming back into focus restart a field that is still scrolled out of
       sight. */
    var onScreen = true;
    var tabVisible = true;

    function sync() {
        var want = onScreen && tabVisible;
        if (want && !timer) timer = setInterval(tick, TICK_MS);
        else if (!want && timer) { clearInterval(timer); timer = null; }
    }

    if (window.IntersectionObserver) {
        new IntersectionObserver(function (entries) {
            onScreen = entries[0].isIntersecting;
            sync();
        }, { threshold: 0 }).observe(field);
    }

    document.addEventListener('visibilitychange', function () {
        tabVisible = !document.hidden;
        sync();
    });

    sync();
})();
