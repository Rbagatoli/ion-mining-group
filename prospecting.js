/* ===== The prospecting section's controller =====
 *
 * Draws the board and moves cards between columns. Today, Contacts and Analytics
 * land here as they are built; the nav already knows about them and greys the
 * ones that have no page yet.
 */
(function () {
    'use strict';

    var NEWLINE = String.fromCharCode(10);

    initNav('prospecting');

    if (typeof CrmConfig !== 'undefined') {
        /* Before anything reads SiteData.STAGES. Wrapped because a pipeline that
           will not configure should leave the built-in stages standing rather
           than take the page down with it. */
        try { CrmConfig.publish(); }
        catch (e) { if (window.console) console.warn('CRM config not applied:', e); }
    }

    /* Which view, from the hash, so the sub-nav links are ordinary links and the
       browser's back button works. Today is the default because it is the screen
       that answers the question you open the app with. */
    function viewFromHash() {
        var h = (location.hash || '').replace('#', '');
        /* #p/<id> opens one prospect. Routing on the hash rather than opening a
           modal means the back button works and a prospect can be linked to,
           which matters the moment you want to send yourself one. */
        if (h.indexOf('p/') === 0) return 'detail';
        return (h === 'board' || h === 'today') ? h : 'today';
    }

    function idFromHash() {
        var h = (location.hash || '').replace('#', '');
        return h.indexOf('p/') === 0 ? decodeURIComponent(h.slice(2)) : null;
    }

    var host = document.getElementById('pboard');
    var note = document.getElementById('boardNote');
    var todaySection = document.getElementById('todaySection');
    var boardSection = document.getElementById('boardSection');
    var detailSection = document.getElementById('detailSection');

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

    function openProspect(id) { location.hash = 'p/' + encodeURIComponent(id); }

    function wireDrag() {
        var cards = host.querySelectorAll('.pb-card');
        for (var i = 0; i < cards.length; i++) {
            cards[i].addEventListener('dragstart', onDragStart);
            cards[i].addEventListener('dragend', onDragEnd);
            /* A card you can only drag is a card that can only be moved, and
               moving it is the least of what you want to do with it. */
            cards[i].addEventListener('click', function () {
                openProspect(this.getAttribute('data-id'));
            });
            cards[i].addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openProspect(this.getAttribute('data-id'));
                }
            });
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
            var menu = reasons.map(function (r, i) { return (i + 1) + ') ' + r.label; }).join(NEWLINE);
            var pick = window.prompt('Why did this die?' + NEWLINE + NEWLINE + menu + NEWLINE + NEWLINE + 'Enter a number:');
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

    function show() {
        var v = viewFromHash();
        /* The section nav has no tab for a single prospect, so the board stays lit
           while one is open: it is where you came from and where Back goes. */
        ProspectNav.render(v === 'detail' ? 'board' : v);
        todaySection.hidden = (v !== 'today');
        boardSection.hidden = (v !== 'board');
        detailSection.hidden = (v !== 'detail');
        if (v === 'board') draw();
        else if (v === 'detail') drawDetail();
        else drawToday();
    }

    function drawDetail() {
        if (typeof ProspectDetail === 'undefined') return;
        var id = idFromHash();
        if (!id) return;
        ProspectDetail.render(id, 'pdetail');
        wireDetail(id);
    }

    function fieldValue(elId) {
        var el = document.getElementById(elId);
        return el ? el.value : '';
    }

    function wireDetail(id) {
        var form = document.getElementById('pdLog');
        var hint = document.getElementById('pdHint');
        if (form) form.addEventListener('submit', function (e) {
            e.preventDefault();
            var when = fieldValue('pdWhen');
            var cid = fieldValue('pdWho');
            var person = null;
            if (cid && typeof CrmContacts !== 'undefined') {
                var c = CrmContacts.get(cid);
                person = c ? c.name : null;
            }
            var res = CrmInteractions.log(id, {
                type: fieldValue('pdType'),
                direction: fieldValue('pdDir'),
                /* Sent as a day at midday UTC, not as "now". The form asks which
                   DAY it happened; inventing an hour would be inventing precision,
                   and midday keeps it on the same date in every timezone. */
                occurred_at: when ? (when + 'T12:00:00.000Z') : null,
                contact_id: cid || null,
                contact_person: person,
                summary: fieldValue('pdSummary').trim(),
                outcome: fieldValue('pdOutcome') || null,
                next_action: fieldValue('pdNext').trim(),
                next_action_due: fieldValue('pdNextDue')
            });
            if (!res.ok) {
                if (hint) { hint.textContent = res.err; hint.className = 'pd-hint is-err'; }
                return;
            }
            drawDetail();
        });

        var stage = document.getElementById('pdStage');
        if (stage) stage.addEventListener('change', function () {
            var to = this.value;
            var opts = {};
            if (to === 'dead') {
                var reasons = CrmConfig.deadReasons();
                var menu = reasons.map(function (r, i) { return (i + 1) + ') ' + r.label; }).join(NEWLINE);
                var pick = window.prompt('Why did this die?' + NEWLINE + NEWLINE + menu +
                                         NEWLINE + NEWLINE + 'Enter a number:');
                if (pick === null) { drawDetail(); return; }
                var idx = parseInt(pick, 10) - 1;
                if (!(idx >= 0 && idx < reasons.length)) {
                    window.alert('That is not one of the reasons, so nothing was changed.');
                    drawDetail(); return;
                }
                opts.deadReason = reasons[idx].key;
            }
            var n = window.prompt('Note for this move? (optional)');
            if (n) opts.note = n;
            var r = SiteData.setStage(id, to, opts);
            if (r && r.ok === false) window.alert(r.err);
            drawDetail();
        });

        var host2 = document.getElementById('pdetail');
        var dones = host2 ? host2.querySelectorAll('[data-done]') : [];
        for (var i = 0; i < dones.length; i++) {
            dones[i].addEventListener('click', function () {
                CrmFollowups.done(this.getAttribute('data-done'));
                drawDetail();
            });
        }
    }

    function drawToday() {
        if (typeof ProspectToday === 'undefined') return;
        ProspectToday.render('ptoday');
        /* Marking a follow-up done is the one action this screen takes, and it
           has to be one click — a screen you have to navigate away from to act
           on is a screen you stop opening. */
        var rows = document.querySelectorAll('.pt-row');
        for (var r = 0; r < rows.length; r++) {
            rows[r].style.cursor = 'pointer';
            rows[r].addEventListener('click', function (e) {
                /* Not when the click was the Done button, which acts in place. */
                if (e.target && e.target.classList.contains('pt-done')) return;
                var rid = this.getAttribute('data-id');
                if (rid) openProspect(rid);
            });
        }
        var btns = document.querySelectorAll('.pt-done');
        for (var i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', function () {
                var id = this.getAttribute('data-fid');
                if (id && typeof CrmFollowups !== 'undefined') CrmFollowups.done(id);
                drawToday();
            });
        }
    }

    window.addEventListener('hashchange', show);
    show();

    /* A pipeline changed on another device should not need a reload to be seen.
       Only this page's own stores are worth redrawing for. */
    window.addEventListener('storage', function (e) {
        if (!e || !e.key) return;
        if (e.key === 'protonMiningSites' || e.key === 'protonCrmLog' ||
            e.key === 'protonCrmConfig' || e.key === 'protonCrmFollowups' ||
            e.key === 'protonContacts') {
            if (typeof CrmConfig !== 'undefined') { CrmConfig.reset(); CrmConfig.publish(); }
            if (typeof CrmLog !== 'undefined') CrmLog.reset();
            if (typeof CrmFollowups !== 'undefined') CrmFollowups.reset();
            if (typeof CrmContacts !== 'undefined') CrmContacts.reset();
            show();
        }
    });
})();
