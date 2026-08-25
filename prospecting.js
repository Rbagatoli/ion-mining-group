/* ===== The prospecting section's controller =====
 *
 * Draws the board and moves cards between columns. Today, Contacts and Analytics
 * land here as they are built; the nav already knows about them and greys the
 * ones that have no page yet.
 */
(function () {
    'use strict';

    initNav('prospecting');

    if (typeof CrmConfig !== 'undefined') {
        /* Before anything reads SiteData.STAGES. Wrapped because a pipeline that
           will not configure should leave the built-in stages standing rather
           than take the page down with it. */
        try { CrmConfig.publish(); }
        catch (e) { if (window.console) console.warn('CRM config not applied:', e); }
    }

    ProspectNav.render('board');

    var host = document.getElementById('pboard');
    var note = document.getElementById('boardNote');

    /* list(), not all(). SiteData exposes list() -- the first draft of this called
       all() and threw on a page where nothing had been saved yet, which is exactly
       the state a new install is in. */
    function records() {
        if (typeof SiteData === 'undefined' || !SiteData.list) return [];
        return SiteData.list() || [];
    }

    /* THE EMPTY STATE IS A REAL STATE. Nothing has been promoted into the
       pipeline yet on a fresh install, and a board of nine empty columns says
       "broken" where it should say "start on the map". */
    function drawEmpty() {
        host.innerHTML =
            '<div class="p-empty">' +
                '<h2>Nothing in the pipeline yet</h2>' +
                '<p>The board shows prospects you have chosen to track — not the ' +
                'detections the adapters surface. Find a site on the map and add it ' +
                'to the watchlist, and it will appear here at <em>Unreviewed</em>.</p>' +
                '<p><a class="p-golink" href="./map.html">' +
                'Go to the map &rarr;</a></p>' +
            '</div>';
        if (note) note.textContent = '';
    }

    function draw() {
        var recs = records();
        if (!recs.length) { drawEmpty(); return; }
        ProspectBoard.render(recs, 'pboard');
        wireDrag();
        if (note) {
            var shared = ProspectNav.sharedFilters();
            note.textContent = recs.length + ' tracked ' +
                (recs.length === 1 ? 'prospect' : 'prospects') +
                (shared ? ' · the map and table are filtered separately' : '');
        }
    }

    // ---- Moving a card ------------------------------------------------------
    var dragId = null;

    function wireDrag() {
        var cards = host.querySelectorAll('.pb-card');
        for (var i = 0; i < cards.length; i++) {
            cards[i].addEventListener('dragstart', onDragStart);
            cards[i].addEventListener('dragend', onDragEnd);
        }
        var drops = host.querySelectorAll('.pb-drop');
        for (var j = 0; j < drops.length; j++) {
            drops[j].addEventListener('dragover', onDragOver);
            drops[j].addEventListener('dragleave', onDragLeave);
            drops[j].addEventListener('drop', onDrop);
        }
    }

    function onDragStart(e) {
        dragId = this.getAttribute('data-id');
        this.classList.add('is-dragging');
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            /* Some engines will not start a drag without data on the transfer. */
            try { e.dataTransfer.setData('text/plain', dragId); } catch (err) {}
        }
    }

    function onDragEnd() { this.classList.remove('is-dragging'); dragId = null; }

    function onDragOver(e) {
        if (!dragId) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        this.classList.add('is-over');
    }

    function onDragLeave() { this.classList.remove('is-over'); }

    function onDrop(e) {
        e.preventDefault();
        this.classList.remove('is-over');
        var id = dragId || (e.dataTransfer ? e.dataTransfer.getData('text/plain') : null);
        var to = this.getAttribute('data-stage');
        dragId = null;
        if (!id || !to || to === '__unplaced') return;

        var rec = SiteData.get(id);
        if (!rec || rec.stage === to) return;

        var opts = {};
        /* DEAD ASKS WHY, and will not proceed without an answer. The reason a deal
           died is the highest-value thing this whole build collects — a pipeline
           of deals that died for no recorded reason is the same as no data — so
           the model refuses it and this asks rather than defaulting to 'other'. */
        if (to === 'dead') {
            var reasons = CrmConfig.deadReasons();
            var menu = reasons.map(function (r, i) { return (i + 1) + ') ' + r.label; }).join('\n');
            var pick = window.prompt('Why did this die?\n\n' + menu + '\n\nEnter a number:');
            if (pick === null) return;                       // cancelled: nothing moves
            var idx = parseInt(pick, 10) - 1;
            if (!(idx >= 0 && idx < reasons.length)) {
                window.alert('That is not one of the reasons, so nothing was changed.');
                return;
            }
            opts.deadReason = reasons[idx].key;
            var why = window.prompt('Anything worth remembering? (optional)');
            if (why) opts.note = why;
        } else {
            var n = window.prompt('Note for this move? (optional)');
            if (n) opts.note = n;
        }

        var res = SiteData.setStage(id, to, opts);
        if (res && res.ok === false) { window.alert(res.err); return; }
        if (!res) { window.alert('That stage is not on the pipeline.'); return; }
        draw();
    }

    draw();

    /* A pipeline changed on another device should not need a reload to be seen.
       Only this page's own stores are worth redrawing for. */
    window.addEventListener('storage', function (e) {
        if (!e || !e.key) return;
        if (e.key === 'protonMiningSites' || e.key === 'protonCrmLog' || e.key === 'protonCrmConfig') {
            if (typeof CrmConfig !== 'undefined') { CrmConfig.reset(); CrmConfig.publish(); }
            if (typeof CrmLog !== 'undefined') CrmLog.reset();
            draw();
        }
    });
})();
