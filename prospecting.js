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
        /* #s/<id> is the one-page summary. Its own route rather than a mode on
           the detail page, because the whole point of it is to be a thing you can
           send yourself a link to and print. */
        if (h.indexOf('s/') === 0) return 'summary';
        return (h === 'board' || h === 'today' || h === 'analytics') ? h : 'today';
    }

    function idFromHash() {
        var h = (location.hash || '').replace('#', '');
        if (h.indexOf('p/') === 0 || h.indexOf('s/') === 0) return decodeURIComponent(h.slice(2));
        return null;
    }

    var host = document.getElementById('pboard');
    var note = document.getElementById('boardNote');
    var todaySection = document.getElementById('todaySection');
    var boardSection = document.getElementById('boardSection');
    var detailSection = document.getElementById('detailSection');
    var analyticsSection = document.getElementById('analyticsSection');
    var summarySection = document.getElementById('summarySection');

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
                '<p><a class="p-golink" href="./map.html?mode=prospects">' +
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
                (shared ? ' · the Map tab is filtered separately' : '');
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
        analyticsSection.hidden = (v !== 'analytics');
        summarySection.hidden = (v !== 'summary');
        if (v === 'board') draw();
        else if (v === 'detail') drawDetail();
        else if (v === 'analytics') drawAnalytics();
        else if (v === 'summary') drawSummary();
        else drawToday();
    }

    function drawSummary() {
        if (typeof ProspectSummary === 'undefined') return;
        var id = idFromHash();
        if (!id) return;
        ProspectSummary.render(id, 'psummary');

        var pr = document.getElementById('psPrint');
        if (pr) pr.addEventListener('click', function () { window.print(); });

        var cp = document.getElementById('psCopy');
        if (cp) {
            cp.addEventListener('click', function () {
                var btn = this;
                var body = ProspectSummary.text(id);
                if (body === null) return;
                /* SAY WHETHER IT WORKED. The clipboard is refused often enough --
                   a permission, an insecure origin, a browser that only allows it
                   inside a user gesture it did not recognise -- and a button that
                   says "Copied" when nothing was copied sends somebody to an email
                   they then paste nothing into. */
                function done(okFlag) {
                    btn.textContent = okFlag ? 'Copied' : 'Could not copy';
                    setTimeout(function () { btn.textContent = 'Copy as text'; }, 2200);
                }
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(body)
                        .then(function () { done(true); })
                        .catch(function () { done(fallbackCopy(body)); });
                    return;
                }
                done(fallbackCopy(body));
            });
        }
    }

    /* The pre-clipboard-API route, still the only one that works on a page served
       over plain http. */
    function fallbackCopy(body) {
        try {
            var ta = document.createElement('textarea');
            ta.value = body;
            ta.setAttribute('readonly', 'readonly');
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            var okFlag = document.execCommand('copy');
            document.body.removeChild(ta);
            return !!okFlag;
        } catch (e) { return false; }
    }

    function drawAnalytics() {
        if (typeof ProspectAnalytics === 'undefined') return;
        ProspectAnalytics.render('panalytics');
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

        var docForm = document.getElementById('pdDocForm');
        if (docForm) {
            docForm.addEventListener('submit', function (e) {
                e.preventDefault();
                var res = CrmDocuments.add(id, {
                    title: fieldValue('pdDocTitle').trim(),
                    kind: fieldValue('pdDocKind') || null,
                    url: fieldValue('pdDocUrl').trim(),
                    where: fieldValue('pdDocWhere').trim(),
                    signed_on: fieldValue('pdDocDate') || null
                });
                if (!res.ok) { window.alert(res.err); return; }
                drawDetail();
            });
        }

        /* Removing a document record removes the RECORD. Saying so in the
           confirmation matters -- somebody about to lose a signed agreement
           should be told they are not. */
        var rms = document.querySelectorAll('.pd-drm');
        for (var r = 0; r < rms.length; r++) {
            rms[r].addEventListener('click', function () {
                var did = this.getAttribute('data-did');
                var doc = CrmDocuments.get(did);
                if (!doc) return;
                if (!window.confirm('Remove the record of "' + doc.title +
                                    '"?' + NEWLINE + NEWLINE +
                                    'The file itself lives somewhere else and is not touched.')) return;
                CrmDocuments.remove(did);
                drawDetail();
            });
        }

        var noteForm = document.getElementById('pdNoteForm');
        if (noteForm) {
            noteForm.addEventListener('submit', function (e) {
                e.preventDefault();
                var el = document.getElementById('pdNoteBody');
                var body = el ? el.value.trim() : '';
                /* An empty note is not a note. Silently, because an empty submit
                   is a stray Enter key, not an error worth a dialog. */
                if (!body) return;
                if (typeof CrmLog === 'undefined') return;
                var res = CrmLog.append('note', id, { body: body });
                if (!res.ok) { window.alert(res.err); return; }
                drawDetail();
            });
        }

        /* PROMOTION. The gas volume drives a live reference figure beside the capacity field, and
           deliberately does not fill it in: right-sizing is build minus supported, and defaulting
           the build from the gas makes that subtraction zero on 55% of real sites. */
        var gasEl = document.getElementById('pdGas');
        var supportsEl = document.getElementById('pdSupports');
        if (gasEl && supportsEl) {
            var showSupports = function () {
                var mm = parseFloat(gasEl.value);
                if (!(mm > 0) || typeof SiteCapacity === 'undefined') {
                    supportsEl.textContent =
                        'Enter a gas volume and this will say what it supports.';
                    return;
                }
                var gross = mm * SiteCapacity.LFG_MW_PER_MMSCFD * 1000;
                var net = Math.round(gross * (1 - SiteCapacity.parasiticFor(
                    { energyType: 'landfill_gas' })));
                supportsEl.textContent = 'That supports about ' + net.toLocaleString() +
                    ' kW at the plug — ' + Math.round(gross).toLocaleString() +
                    ' kW gross, less 10% parasitic load. It is a reference, not the answer: ' +
                    'what you build is your decision and the difference is what gets measured.';
            };
            gasEl.addEventListener('input', showSupports);
            showSupports();
        }
        var promote = document.getElementById('pdPromote');
        if (promote) promote.addEventListener('submit', function (e) {
            e.preventDefault();
            var kw = parseFloat(fieldValue('pdKw'));
            var mm = parseFloat(fieldValue('pdGas'));
            var horizon = fieldValue('pdHorizon');
            var target = fieldValue('pdTarget');
            var res = ProjectData.promote(id, {
                capacity_kw: kw,
                annual_cost_of_capital_pct: parseFloat(fieldValue('pdCoc')),
                budget_authorised_usd: parseFloat(fieldValue('pdBudget')),
                target_energization: target || null,
                gas_mmscfd: isFinite(mm) ? mm : null,
                gas_basis: isFinite(mm) ? 'entered at promotion' : null,
                horizon_years: horizon === '' ? null : parseFloat(horizon),
                horizon_basis: horizon === '' ? null : 'entered at promotion'
            });
            if (!res.ok) { window.alert(res.err); return; }
            drawDetail();
        });

        /* ---- The two ledgers (Stages 6 and 7) ----
         *
         * Both panels were built read-only and both reported empty forever, because nothing
         * anywhere called their writers. Every handler below is the missing half. They all take
         * the same shape as the handlers above: read the fields, call the model, show what it
         * refused, redraw.
         *
         * NOTHING HERE VALIDATES ANYTHING. The models refuse a lead time that is not a number, a
         * retainage larger than its certificate, a payment on an uncertified application and a
         * contract sum edited after the first certificate, each with a sentence saying why. A
         * second set of checks in the UI would drift from those and start refusing things the
         * model allows -- and the message the user reads would be the weaker of the two. */
        function liveProject() {
            return (typeof ProjectData !== 'undefined' && ProjectData.liveFor)
                ? ProjectData.liveFor(id) : null;
        }
        /* Shown rather than swallowed. commit() returns a notice at 60% of the size ceiling, and
           setStatus() returns one when something is ordered against an unissued permit -- both
           are things the operator has to be told, and both arrive on a SUCCESSFUL write. */
        function applied(res) {
            if (!res) return false;
            if (!res.ok) { window.alert(res.err); return false; }
            if (res.notice) window.alert(res.notice);
            drawDetail();
            return true;
        }
        function today() { return new Date().toISOString().slice(0, 10); }

        var procForm = document.getElementById('pdProcForm');
        if (procForm) procForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var p = liveProject(); if (!p) return;
            var weeks = fieldValue('pdProcWeeks');
            var permitEl = document.getElementById('pdProcPermit');
            applied(ProjectProcurement.addItem(p.id, {
                description: fieldValue('pdProcDesc').trim(),
                vendor: fieldValue('pdProcVendor').trim(),
                /* Blank stays blank. Coercing an empty field to 0 here would defeat the whole
                   distinction the module is built on: zero means off-the-shelf, absent means
                   nobody has asked the vendor yet. */
                lead_time_weeks: weeks === '' ? null : parseFloat(weeks),
                need_by: fieldValue('pdProcNeed') || null,
                permit_required: !!(permitEl && permitEl.checked)
            }));
        });

        var host4 = document.getElementById('pdetail');
        var sets = host4 ? host4.querySelectorAll('.pd-proc-set') : [];
        for (var s2 = 0; s2 < sets.length; s2++) {
            sets[s2].addEventListener('change', function () {
                var p = liveProject(); if (!p) return;
                applied(ProjectProcurement.setStatus(p.id, this.getAttribute('data-pid'),
                                                     this.value));
            });
        }
        /* Blank means unknown, and it has to survive the round trip: parseFloat('') is NaN and
           the model would refuse it, so an emptied field is sent as null deliberately rather
           than as a number that happens not to be one. */
        var procWks = host4 ? host4.querySelectorAll('.pd-proc-wk') : [];
        for (var s4 = 0; s4 < procWks.length; s4++) {
            procWks[s4].addEventListener('change', function () {
                var p = liveProject(); if (!p) return;
                var v = this.value === '' ? null : parseFloat(this.value);
                applied(ProjectProcurement.updateItem(p.id, this.getAttribute('data-pid'),
                                                      { lead_time_weeks: v }));
            });
        }
        var procRms = host4 ? host4.querySelectorAll('.pd-proc-rm') : [];
        for (var s3 = 0; s3 < procRms.length; s3++) {
            procRms[s3].addEventListener('click', function () {
                var p = liveProject(); if (!p) return;
                var why = window.prompt('Remove this item from the schedule. Why?');
                if (why === null) return;
                applied(ProjectProcurement.removeItem(p.id, this.getAttribute('data-pid'), why));
            });
        }

        /* ---- Budget (Stage 4) ----
           Ninety-three passing assertions and, until now, no control anywhere that called a
           single one of its writers. */
        var budSeed = document.getElementById('pdBudSeed');
        if (budSeed) budSeed.addEventListener('click', function () {
            var p = liveProject(); if (!p) return;
            if (!window.confirm('Seed the opening budget from the capex estimate?' + NEWLINE + NEWLINE +
                'This can only be done once, while the ledger is empty — the estimate is the ' +
                'OPENING budget, so re-seeding one in flight would overwrite what actually ' +
                'happened with what was predicted.')) return;
            var res = ProjectBudget.seedFromEstimate(p.id);
            if (applied(res) && res.skipped && res.skipped.length) {
                /* Named, never silent. A component the estimator reports as unknown is skipped
                   rather than seeded at zero, because a zero budget reads as "this costs
                   nothing" and produces a 100% overrun on the first invoice. */
                window.alert('Seeded ' + res.seeded + ' lines. Not seeded, because the estimate ' +
                    'reports no figure for them: ' + res.skipped.join(', ') + '.');
            }
        });

        var budForm = document.getElementById('pdBudForm');
        if (budForm) budForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var p = liveProject(); if (!p) return;
            function amt(elId) { var v = fieldValue(elId); return v === '' ? null : parseFloat(v); }
            var res = ProjectBudget.addLine(p.id, {
                category: fieldValue('pdBudCat'),
                vendor: fieldValue('pdBudVendor').trim(),
                budgeted_amount: amt('pdBudB'),
                committed_amount: amt('pdBudC'),
                spent_amount: amt('pdBudS')
            });
            if (applied(res) && res.flag) {
                /* Committing money before exclusivity is executed is money at risk of being
                   spent diligencing a site somebody else can still take. The model raises it;
                   swallowing it here would make the warning pointless. */
                window.alert(res.flag);
            }
        });

        /* Inline amounts, committing on change, like the enrichment checklist. */
        var budAmts = host4 ? host4.querySelectorAll('.pd-bud-amt') : [];
        for (var b1 = 0; b1 < budAmts.length; b1++) {
            budAmts[b1].addEventListener('change', function () {
                var p = liveProject(); if (!p) return;
                var patch = {};
                patch[this.getAttribute('data-field')] = parseFloat(this.value);
                applied(ProjectBudget.updateLine(p.id, this.getAttribute('data-lid'), patch));
            });
        }
        var budRms = host4 ? host4.querySelectorAll('.pd-bud-rm') : [];
        for (var b2 = 0; b2 < budRms.length; b2++) {
            budRms[b2].addEventListener('click', function () {
                var p = liveProject(); if (!p) return;
                var why = window.prompt('Remove this budget line. Why?');
                if (why === null) return;
                applied(ProjectBudget.removeLine(p.id, this.getAttribute('data-lid'), why));
            });
        }
        /* A REVISION SUPERSEDES, IT DOES NOT OVERWRITE. reviseChangeOrder leaves the original on
           the timeline with the new entry pointing back at it, so what was approved first stays
           visible — quietly editing an approved change order is how a cumulative change figure
           stops being a record of anything. */
        var budRevs = host4 ? host4.querySelectorAll('.pd-bud-rev') : [];
        for (var b3 = 0; b3 < budRevs.length; b3++) {
            budRevs[b3].addEventListener('click', function () {
                var p = liveProject(); if (!p) return;
                var coid = this.getAttribute('data-coid');
                var why = window.prompt('Why is this change order being revised?');
                if (!why) return;
                var cost = window.prompt('Revised cost impact (blank to leave it):');
                if (cost === null) return;
                var days = window.prompt('Revised schedule impact in days (blank to leave it):');
                if (days === null) return;
                applied(ProjectBudget.reviseChangeOrder(p.id, coid, {
                    reason: why,
                    cost_impact: cost === '' ? null : parseFloat(cost),
                    schedule_impact_days: days === '' ? null : parseFloat(days)
                }));
            });
        }

        var ctForm = document.getElementById('pdCtForm');
        if (ctForm) ctForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var p = liveProject(); if (!p) return;
            var val = fieldValue('pdCtValue');
            applied(ProjectContractors.addContractor(p.id, {
                name: fieldValue('pdCtName').trim(),
                trade: fieldValue('pdCtTrade').trim(),
                // Same rule as the lead time: unpriced is a state, not a zero.
                contract_value_usd: val === '' ? null : parseFloat(val),
                insurance_expiry: fieldValue('pdCtIns') || null
            }));
        });

        var paForm = document.getElementById('pdPaForm');
        if (paForm) paForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var p = liveProject(); if (!p) return;
            var ret = fieldValue('pdPaRet');
            applied(ProjectContractors.addPayApp(p.id, fieldValue('pdPaWho'), {
                number: fieldValue('pdPaNo').trim(),
                period_to: fieldValue('pdPaPeriod'),
                certified_usd: parseFloat(fieldValue('pdPaAmt')),
                /* Retainage is the one figure whose blank IS a zero, and the model says why:
                   no deduction recorded means none was taken, and that errs toward more money
                   counted as paid and therefore more exposure reported. */
                retained_usd: ret === '' ? 0 : parseFloat(ret)
            }));
        });

        var coForm = document.getElementById('pdCoForm');
        if (coForm) coForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var p = liveProject(); if (!p) return;
            applied(ProjectBudget.addChangeOrder(p.id, {
                description: fieldValue('pdCoDesc').trim(),
                reason: fieldValue('pdCoWhy').trim(),
                cost_impact: parseFloat(fieldValue('pdCoCost')),
                schedule_impact_days: parseFloat(fieldValue('pdCoDays')),
                contractor_id: fieldValue('pdCoWho') || null
            }));
        });

        var ctIns = host4 ? host4.querySelectorAll('.pd-ct-ins-set') : [];
        for (var c1 = 0; c1 < ctIns.length; c1++) {
            ctIns[c1].addEventListener('change', function () {
                var p = liveProject(); if (!p) return;
                /* Clearing the date is a real edit — a certificate can be withdrawn — and the
                   model reports an undated contractor as unverified rather than covered, which
                   is the honest reading. So an emptied field goes through as null. */
                applied(ProjectContractors.updateContractor(p.id, this.getAttribute('data-cid'),
                    { insurance_expiry: this.value === '' ? null : this.value }));
            });
        }
        var ctRms = host4 ? host4.querySelectorAll('.pd-ct-rm') : [];
        for (var c2 = 0; c2 < ctRms.length; c2++) {
            ctRms[c2].addEventListener('click', function () {
                var p = liveProject(); if (!p) return;
                var why = window.prompt('Remove this contractor. Why?');
                if (why === null) return;
                applied(ProjectContractors.removeContractor(p.id, this.getAttribute('data-cid'), why));
            });
        }

        /* One handler for every row button, dispatching on data-do. The alternative is six
           querySelectorAll loops that differ only in a string. */
        var acts = host4 ? host4.querySelectorAll('.pd-ct-act') : [];
        for (var a2 = 0; a2 < acts.length; a2++) {
            acts[a2].addEventListener('click', function () {
                var p = liveProject(); if (!p) return;
                var what = this.getAttribute('data-do');
                var aid = this.getAttribute('data-aid');
                var coid = this.getAttribute('data-coid');
                if (what === 'reject') {
                    var why = window.prompt('Why is this application being rejected?');
                    if (!why) return;
                    applied(ProjectContractors.rejectPayApp(p.id, aid, why));
                } else if (what === 'certify') {
                    /* A name, because certifying is a person agreeing money is owed. The model
                       refuses an empty one; asking here means the refusal is rare. */
                    var who = window.prompt('Who is certifying this application?');
                    if (who === null) return;
                    applied(ProjectContractors.certifyPayApp(p.id, aid, who));
                } else if (what === 'pay') {
                    var when = window.prompt('Date the payment was made (YYYY-MM-DD):', today());
                    if (when === null) return;
                    var res = ProjectContractors.recordPayment(p.id, aid, { paid_on: when });
                    if (applied(res) && res.waiver === 'none') {
                        /* Said at the moment the money leaves, not only in the head count. The
                           payment is recorded either way -- refusing it would hide the exposure
                           rather than prevent it -- so this is a reminder, not a gate. */
                        window.alert('Recorded. No lien waiver is on file for this application, ' +
                                     'so it is counted as exposure until one is.');
                    }
                } else if (what === 'cond' || what === 'uncond') {
                    var kind = (what === 'cond') ? 'conditional' : 'unconditional';
                    var on = window.prompt('Date on the ' + kind + ' waiver (YYYY-MM-DD):', today());
                    if (on === null) return;
                    applied(ProjectContractors.recordWaiver(p.id, aid, kind, { on: on }));
                } else if (what === 'approveco' || what === 'rejectco') {
                    var by = window.prompt('Who is deciding this variation?');
                    if (by === null) return;
                    applied(ProjectBudget.decideChangeOrder(p.id, coid,
                        what === 'approveco' ? 'approved' : 'rejected', by));
                }
            });
        }

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
            moveStage(to, opts);
        });

        /* THE ADVANCE BUTTON, which is the same move with the destination already decided.
           Deliberately shares moveStage() with the picker rather than repeating it: two paths
           that do the same thing differently are how one of them quietly stops logging. */
        var adv = document.getElementById('pdAdvance');
        if (adv) adv.addEventListener('click', function () {
            var to = this.getAttribute('data-to');
            if (!to) return;
            var opts = {};
            var note = window.prompt('Note for this move? (optional)');
            if (note) opts.note = note;
            moveStage(to, opts);
        });

        /* setStage RETURNS NULL FOR AN UNKNOWN STAGE, WHICH IS NOT { ok:false }.
           This handler used to check only `r.ok === false`, so a stage the model does not
           recognise fell straight through to drawDetail() and the dropdown snapped back with no
           message at all -- a silent no-op, which is the exact shape of "there is no way to push
           a prospect forward". The board's drop handler already said so; this did not. It cannot
           normally happen, because crm-config pushes its keys into site-model through
           registerStages(), but "cannot happen" is what the last four bugs here had in common. */
        function moveStage(to, opts) {
            var r = SiteData.setStage(id, to, opts);
            if (r && r.ok === false) window.alert(r.err);
            else if (!r) window.alert('That stage is not on the pipeline, so nothing was changed.');
            drawDetail();
        }

        /* THE CHECKLIST SAVES AS YOU TOUCH IT. Research happens in the middle of
           doing something else -- a tab open on ECHO, a licence number in the
           clipboard -- and a checklist with a Save button is a checklist that
           gets half filled and abandoned. The status commits on change; the
           source note commits on blur, so typing is not interrupted. */
        var host3 = document.getElementById('pdetail');
        var stats = host3 ? host3.querySelectorAll('.pd-estat') : [];
        for (var e = 0; e < stats.length; e++) {
            stats[e].addEventListener('change', function () {
                var key = this.getAttribute('data-item');
                var noteEl = host3.querySelector('.pd-enote[data-item="' + key + '"]');
                CrmEnrichment.set(id, key, this.value, noteEl ? noteEl.value : null);
                drawDetail();
            });
        }
        var notes = host3 ? host3.querySelectorAll('.pd-enote') : [];
        for (var n2 = 0; n2 < notes.length; n2++) {
            notes[n2].addEventListener('blur', function () {
                var key = this.getAttribute('data-item');
                var statEl = host3.querySelector('.pd-estat[data-item="' + key + '"]');
                var status = statEl ? statEl.value : 'not_started';
                /* Typing a source and leaving the status alone means the work was
                   done, so an untouched item moves itself to in_progress rather
                   than keeping a note nobody can see the state of. */
                if (status === 'not_started' && this.value.trim()) status = 'in_progress';
                CrmEnrichment.set(id, key, status, this.value);
            });
        }

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
        /* THE LINK AUDIT FIRST, and outside the ProspectToday guard on purpose: the two are
           independent panels sharing a screen, and letting a missing follow-ups module take the
           reconciliation down with it would hide the rarer and worse news. It wires its own
           controls and draws nothing when every link resolves. */
        if (typeof ProjectLinkAuditUi !== 'undefined') {
            var scanned = ProjectLinkAuditUi.render('plaudit');
            /* Stamping is a WRITE, so it happens once per draw of this screen rather than on
               every render: the date recorded is when the workspace first SAW the link fail,
               and re-deriving it on a redraw after an acknowledgement would move it. record()
               refuses a scan that classified nothing, so a device with no prospect list cannot
               stamp every project it holds. */
            if (scanned && scanned.state === 'ready' && typeof ProjectLinkAudit !== 'undefined') {
                ProjectLinkAudit.record(scanned);
            }
        }
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
            e.key === 'protonContacts' || e.key === 'protonCrmEnrichment' ||
            e.key === 'protonCrmDocuments') {
            if (typeof CrmConfig !== 'undefined') { CrmConfig.reset(); CrmConfig.publish(); }
            if (typeof CrmLog !== 'undefined') CrmLog.reset();
            if (typeof CrmFollowups !== 'undefined') CrmFollowups.reset();
            if (typeof CrmContacts !== 'undefined') CrmContacts.reset();
            if (typeof CrmEnrichment !== 'undefined') CrmEnrichment.reset();
            if (typeof CrmDocuments !== 'undefined') CrmDocuments.reset();
            show();
        }
    });
})();
