/* ===== Build gates =====
 *
 * The core risk control. It encodes the sequence you cannot recover from getting wrong.
 *
 * WHY GATES HERE AND NOT IN THE CRM. The CRM layer states its position twice, in writing:
 * "It is not a blocker and not a checklist; a deal can close having never produced a utility
 * quote" (crm-config.js), and "Not a blocker and not a warning -- a list" (crm-documents.js).
 * That is correct for a PROSPECT, which is a deal of unknown shape: a revenue share needs
 * neither a gas analysis nor a surface lease, and blocking on them would make a good deal look
 * permanently incomplete.
 *
 * A promoted PROJECT is one known structure, and its sequence is physical rather than
 * procedural. You cannot specify gas treatment before you know the siloxane level. Ordering
 * gensets against an unissued air permit is how deposits are lost. So blocking is right here and
 * wrong there, and the two coexist: this module READS the same documents through CrmDocuments
 * and applies its own rule on top. Nothing about CRM behaviour changes.
 *
 * THE COMPLETION ARITHMETIC IS BORROWED, NOT REWRITTEN. CrmEnrichment.tally() already argues out
 * every edge case a readiness percentage has: not-applicable comes out of the denominator,
 * in_progress counts as zero because "half credit is how a checklist starts flattering you", and
 * an all-na list returns null rather than 100 because a checklist waved away is not a finished
 * one. A second implementation would not be wrong so much as more flattering, and two
 * percentages that disagree is worse than either.
 *
 * A WAIVER IS A FIRST-CLASS EVENT, NOT A STATUS. Marking a blocking deliverable 'na' would let a
 * hard block be stepped around with a click and no trace. A waiver requires a reason and an
 * approver, and it is written to CrmLog where it renders in the warn colour on the prospect
 * timeline. The whole value of a gate is that going around it leaves a mark naming who decided.
 */
var ProjectGates = (function () {
    'use strict';

    // The same four the enrichment checklist uses, deliberately: one status vocabulary in the
    // app, and tally() is written against these exact strings.
    var STATUSES = ['not_started', 'in_progress', 'complete', 'na'];

    function text(v) {
        if (v === null || v === undefined) return null;
        var s = String(v).trim();
        return s ? s : null;
    }
    function nowIso() { return new Date().toISOString(); }

    function defsFor(gate) {
        if (typeof CrmConfig === 'undefined' || !CrmConfig.gateDeliverables) return null;
        return CrmConfig.gateDeliverables(gate);
    }

    /* Which documents are on file for this prospect, by kind. Read from CrmDocuments rather than
       tracked separately, so filing a document in the normal place satisfies the gate and there
       is no second register to keep in step. */
    /* NEWEST OF EACH KIND WINS, and the first-write-wins loop below is the whole fix.
     *
     * CrmDocuments.forProspect sorts NEWEST FIRST (crm-documents.js:214-217). Assigning on every
     * iteration therefore left the LAST one standing, which is the oldest -- so a revised gas
     * analysis or a reissued air permit never became the cited document, and the gate went on
     * pointing at the superseded one.
     *
     * It never changed a gate DECISION, because satisfied only asks whether a document exists at
     * all. It changed which document a reader opens to check the decision, which is the entire
     * point of requiring one. */
    function docKinds(prospectId) {
        var out = {};
        if (typeof CrmDocuments === 'undefined' || !CrmDocuments.forProspect || !prospectId) return out;
        var list = CrmDocuments.forProspect(prospectId) || [];
        for (var i = 0; i < list.length; i++) {
            if (!list[i] || !list[i].kind) continue;
            if (Object.prototype.hasOwnProperty.call(out, list[i].kind)) continue;   // newest already held
            out[list[i].kind] = list[i].id;
        }
        return out;
    }

    /* Every deliverable for a gate, joined to its recorded state and to the document register.
     *
     * `satisfied` is the question a gate actually asks, and it is deliberately not the same as
     * `status === 'complete'`. A deliverable that requires a document and has none is NOT
     * satisfied however it was ticked -- an air permit marked complete with nothing on file is
     * somebody's recollection, and advancing on it silently reprices the entire build. */
    function itemsFor(project, gate) {
        if (!project) return [];
        var g = gate || project.gate;
        var defs = defsFor(g);
        if (defs === null) return null;                 // config missing: say so, do not guess
        var state = (project.deliverables && project.deliverables[g]) || {};
        var docs = docKinds(project.prospect && project.prospect.prospect_id);
        var out = [];
        for (var i = 0; i < defs.length; i++) {
            var d = defs[i];
            var rec = Object.prototype.hasOwnProperty.call(state, d.key) ? state[d.key] : null;
            var status = (rec && STATUSES.indexOf(rec.status) >= 0) ? rec.status : 'not_started';
            var waived = !!(rec && rec.waived_at);
            var docId = d.evidence_kind ? (docs[d.evidence_kind] || null) : null;
            var needsDoc = !!d.requires_document;
            var satisfied = waived || (status === 'complete' && (!needsDoc || !!docId));
            out.push({
                key: d.key,
                label: d.label,
                why: d.why || null,
                blocking: !!d.blocking,
                requires_document: needsDoc,
                evidence_kind: d.evidence_kind || null,
                status: status,
                note: (rec && rec.note) || null,
                at: (rec && rec.at) || null,
                document_id: docId,
                /* Named separately from `satisfied` so a UI can say WHY rather than just no.
                   "Complete, but no permit on file" is actionable; "not satisfied" is not. */
                awaiting_document: needsDoc && status === 'complete' && !docId,
                waived: waived,
                waived_reason: (rec && rec.waived_reason) || null,
                waived_by: (rec && rec.waived_by) || null,
                satisfied: satisfied
            });
        }
        return out;
    }

    /* Readiness, through CrmEnrichment's arithmetic. A waived item counts as 'na' -- it is out
       of the denominator rather than counted as done, because a gate cleared by waiving three of
       five requirements did not score 100%, and reporting that it did is the flattery tally()
       was written to refuse. */
    function readiness(project, gate) {
        var items = itemsFor(project, gate);
        if (items === null) return null;
        if (typeof CrmEnrichment === 'undefined' || !CrmEnrichment.tally) return null;
        return CrmEnrichment.tally(items.map(function (i) {
            if (i.waived) return 'na';
            if (i.satisfied) return 'complete';
            return i.status === 'complete' ? 'in_progress' : i.status;   // complete-but-no-doc is underway
        }));
    }

    /* What is stopping this gate closing. Returns the ITEMS, not a boolean, because a gate that
       says "blocked" without saying by what is a gate nobody can act on. */
    function blockers(project, gate) {
        var items = itemsFor(project, gate);
        if (items === null) return null;
        return items.filter(function (i) { return i.blocking && !i.satisfied; });
    }

    /* CAN THIS PROJECT LEAVE ITS CURRENT GATE.
     *
     * Refuses when the configuration cannot be read at all rather than allowing the move: a
     * missing config would otherwise report every gate as having nothing to satisfy, which reads
     * as ready and is the most dangerous possible wrong answer here. */
    function canAdvance(project, toGate) {
        if (!project) return { ok: false, err: 'No project.', blockers: [] };
        if (typeof CrmConfig === 'undefined' || !CrmConfig.gateDeliverables) {
            return { ok: false, err: 'Gate requirements are not loaded, so nothing can be ' +
                     'confirmed complete. Nothing was advanced.', blockers: [] };
        }
        // Backwards and cancelling are the project model's business, not the gate's.
        if (typeof ProjectData !== 'undefined' && ProjectData.GATES) {
            var order = ProjectData.GATES;
            if (order.indexOf(toGate) >= 0 && order.indexOf(toGate) <= order.indexOf(project.gate)) {
                return { ok: true, err: null, blockers: [] };
            }
        }
        /* EVERY GATE BEING LEFT, not just the current one. Checking only project.gate let a
           project jump contact_loi straight to agreements and skip diligence entirely, taking
           all three hard blocks with it -- the gas analysis, the collection assessment and the
           gas forecast, none of them met and none of them mentioned.

           A skipped gate is a gate whose requirements were never satisfied, so the ones being
           passed over are checked too, and the message says which gate each shortfall belongs
           to. */
        var order2 = (typeof ProjectData !== 'undefined' && ProjectData.GATES) ? ProjectData.GATES : [project.gate];
        var fromIdx = order2.indexOf(project.gate);
        var toIdx = order2.indexOf(toGate);
        var span = (fromIdx >= 0 && toIdx > fromIdx) ? order2.slice(fromIdx, toIdx) : [project.gate];

        var b = [];
        for (var s2 = 0; s2 < span.length; s2++) {
            var got = blockers(project, span[s2]);
            if (got === null) return { ok: false, err: 'Gate requirements are not loaded.', blockers: [] };
            for (var j = 0; j < got.length; j++) {
                got[j].gate = span[s2];
                b.push(got[j]);
            }
        }
        if (!b.length) return { ok: true, err: null, blockers: [] };
        return {
            ok: false,
            blockers: b,
            /* The message names what is missing, not that something is. The brief's rule:
               blocked gates must state what is blocking advancement. */
            err: b.length + (b.length === 1 ? ' requirement is' : ' requirements are') +
                 ' not met: ' + b.map(function (i) {
                     return i.label +
                            (i.awaiting_document ? ' (marked complete, no document on file)' : '') +
                            (i.gate && i.gate !== project.gate ? ' [' + i.gate + ']' : '');
                 }).join('; ') + '.'
        };
    }

    /* ===== WHAT A CLOSED GATE MEANS FOR THE ASSET ==========================================
     *
     * development_stage on the prospect record is load-bearing in three places, and advancing it
     * moves real numbers: site-capex's STAGE_RETAINED stops charging a $160,000 flat permitting
     * cost at 'permitted', MONTHS_TO_REVENUE drops from 12-24 to 8-14 at the same point, and
     * site-opportunity's scoreSiteQuality infers road access at 'constructed', which moved a real
     * 1,959 kW landfill's score from 44 to 51.
     *
     * KEYED ON THE GATE BEING LEFT, NOT THE GATE BEING ENTERED, and that is the distinction the
     * gate names were sloppy about once already. development_stage describes what the asset HAS
     * ACHIEVED. A project sitting in the permitting_complete gate is doing the permitting; it is
     * 'permitted' when that gate CLOSES behind it. Reading it the other way -- stage set on
     * entry -- would stop charging the permitting cost and shorten the schedule by four to ten
     * months while the permit is still outstanding and still being paid for.
     *
     * Gates with no entry here achieve nothing on their own: leaving contact_loi does not make a
     * site permitted, it makes it a site with a signed LOI, which development_stage has no word
     * for and should not invent one.
     */
    var STAGE_ON_LEAVING = {
        permitting_complete: 'permitted',
        construction: 'constructed',
        commissioning: 'energized'
    };
    // Reaching the terminal gate is itself the achievement; there is no gate after it to leave.
    var STAGE_ON_ENTERING = { operating: 'operating' };

    var STAGE_ORDER = ['raw_resource', 'permitted', 'constructed', 'energized', 'operating'];

    /* ISSUANCE, NOT PHASE ENTRY, AND NOT A WAIVER EITHER.
     *
     * The gate already refuses to open without the air permit satisfied -- but `satisfied`
     * includes waived, and a waiver is a deliberate decision to proceed without the thing. That
     * is a legitimate way to move a PROJECT forward and it is not a legitimate way to tell the
     * capex model a permit exists. Waiving the permit and having the $160,000 quietly stop being
     * charged is precisely the silent repricing this precondition exists to prevent.
     *
     * So the stage advance asks a stricter question than the gate did: complete, with the
     * document on file, not waived. */
    function permitIssued(project) {
        var items = itemsFor(project, 'permitting_complete');
        if (items === null) return false;
        var air = items.filter(function (i) { return i.key === 'air_permit'; })[0];
        if (!air) return false;
        return air.status === 'complete' && !!air.document_id && !air.waived;
    }

    function stageAchieved(project, fromGate, toGate) {
        var entering = STAGE_ON_ENTERING[toGate] || null;
        var leaving = STAGE_ON_LEAVING[fromGate] || null;
        // Whichever is further along; both may be null, which means this move achieves nothing.
        var a = STAGE_ORDER.indexOf(entering), b = STAGE_ORDER.indexOf(leaving);
        return (a > b) ? entering : leaving;
    }

    /* Advances the PROSPECT's development_stage when a gate move earns it, and reports what it
     * did rather than doing it silently. Returns:
     *   { moved:false, reason }            nothing was earned, or it was refused
     *   { moved:true, from, to, scores }   the record was written, with what it moved
     *
     * Forward only. A project moved back a gate does not un-permit a site: the permit is still
     * issued and the capex model is still right to stop charging for it. Rolling the stage back
     * would say the asset regressed, which is not what happened.
     */
    function syncDevelopmentStage(project, fromGate, toGate) {
        if (typeof SiteData === 'undefined' || !SiteData.get) {
            return { moved: false, reason: 'site model not loaded' };
        }
        var pid = project && project.prospect && project.prospect.prospect_id;
        if (!pid) return { moved: false, reason: 'no prospect' };
        var rec = SiteData.get(pid);
        if (!rec) return { moved: false, reason: 'prospect no longer exists' };

        var want = stageAchieved(project, fromGate, toGate);
        if (!want) return { moved: false, reason: 'this gate achieves no change of asset stage' };

        var have = rec.development_stage || 'raw_resource';
        if (STAGE_ORDER.indexOf(want) <= STAGE_ORDER.indexOf(have)) {
            return { moved: false, reason: 'the asset is already at ' + have };
        }
        if (want === 'permitted' && !permitIssued(project)) {
            return { moved: false, refused: true,
                     reason: 'the air permit is not on file as issued — a waived or undocumented ' +
                             'permit does not make the site permitted, and advancing would stop ' +
                             'the permitting cost being charged while it is still outstanding' };
        }

        /* THE SCORE, MEASURED BEFORE AND AFTER. Taken here rather than recomputed later because
           the only honest way to say what a change did is to hold both sides of it. */
        var before = scoreSnapshot(rec);
        var res = SiteData.update(pid, { development_stage: want });
        if (!res || (res._save && !res._save.ok)) {
            return { moved: false, reason: 'the prospect record could not be saved' };
        }
        var after = scoreSnapshot(SiteData.get(pid));
        var moves = diffScores(before, after);

        /* IF THE SCORER IS NOT ON THIS PAGE, SAY SO IN THE LOG rather than logging nothing.
           An empty score history is indistinguishable from "nothing moved", and the two are
           opposite answers -- this exact gap was live until prospecting.html gained the scorer,
           and a stage advance there recorded no attribution at all while the numbers on the map
           page moved. An unmeasured movement is a fact worth recording. */
        var measured = (before !== null && after !== null);
        if (!measured && typeof CrmLog !== 'undefined' && CrmLog.append) {
            CrmLog.append('score', pid, {
                project_id: project.id, component: null, delta: null,
                trigger: 'stage_advance', from_stage: have, to_stage: want,
                unmeasured: true,
                reason: 'the asset stage moved, but the scoring model was not loaded on this ' +
                        'page, so what it did to the score was not recorded'
            });
        }

        /* LOGGED PER COMPONENT THAT MOVED, with the trigger named. Reviewing a score history
           later, the question is always whether the SITE changed or the PROJECT did -- a gas
           volume revision and a gate closing move the same number and mean opposite things. */
        if (typeof CrmLog !== 'undefined' && CrmLog.append) {
            for (var i = 0; i < moves.length; i++) {
                CrmLog.append('score', pid, {
                    project_id: project.id,
                    component: moves[i].label,
                    component_id: moves[i].id,
                    from: moves[i].from,
                    to: moves[i].to,
                    delta: moves[i].delta,
                    trigger: 'stage_advance',
                    from_stage: have,
                    to_stage: want,
                    reason: 'the project closed the ' + fromGate.replace(/_/g, ' ') +
                            ' gate, so the asset is now ' + want.replace(/_/g, ' ') +
                            ' — the site itself did not change'
                });
            }
        }
        return { moved: true, from: have, to: want, scores: moves, measured: measured };
    }

    function scoreSnapshot(rec) {
        if (typeof SiteOpportunity === 'undefined' || !SiteOpportunity.score || !rec) return null;
        var r = SiteOpportunity.score(rec);
        var out = { total: r.score, by: {} };
        for (var i = 0; i < r.breakdown.length; i++) {
            out.by[r.breakdown[i].id] = { value: r.breakdown[i].value, label: r.breakdown[i].label };
        }
        return out;
    }

    function diffScores(before, after) {
        if (!before || !after) return [];
        var out = [];
        for (var id in after.by) {
            if (!Object.prototype.hasOwnProperty.call(after.by, id)) continue;
            var b = before.by[id] ? before.by[id].value : null;
            var a = after.by[id].value;
            if (b === a) continue;
            out.push({
                id: id, label: after.by[id].label, from: b, to: a,
                // A component appearing where there was nothing is a move from unmeasured, not
                // from zero, so the delta is null rather than a number that overstates it.
                delta: (typeof a === 'number' && typeof b === 'number') ? Math.round(a - b) : null
            });
        }
        if (before.total !== after.total) {
            out.push({ id: '_total', label: 'Opportunity score', from: before.total, to: after.total,
                       delta: (typeof after.total === 'number' && typeof before.total === 'number')
                              ? after.total - before.total : null });
        }
        return out;
    }

    // ---- writes ------------------------------------------------------------------------

    function writeState(projectId, gate, key, mutate) {
        if (typeof ProjectData === 'undefined') return { ok: false, err: 'The project model is not loaded.' };
        var project = ProjectData.get(projectId);
        if (!project) return { ok: false, err: 'No such project.' };
        var g = gate || project.gate;
        var defs = defsFor(g);
        if (defs === null) return { ok: false, err: 'Gate requirements are not loaded.' };
        var def = defs.filter(function (d) { return d.key === key; })[0];
        if (!def) return { ok: false, err: 'Unknown requirement: ' + key + '.' };
        return ProjectData.mutate(projectId, function (p) {
            if (!p.deliverables[g]) p.deliverables[g] = {};
            var rec = p.deliverables[g][key] || {};
            mutate(rec, def);
            p.deliverables[g][key] = rec;
        });
    }

    function setStatus(projectId, gate, key, status, note) {
        if (STATUSES.indexOf(status) < 0) return { ok: false, err: 'Unknown status: ' + status + '.' };
        /* 'na' is refused on a BLOCKING item. Not-applicable is how a hard block gets stepped
           around silently, and stepping around one is a waiver -- which needs a reason and an
           approver and leaves a mark. */
        var blockingNa = null;
        var res = writeState(projectId, gate, key, function (rec, def) {
            if (status === 'na' && def.blocking) { blockingNa = def.label; throw new Error('blocking'); }
            rec.status = status;
            rec.note = text(note);
            rec.at = nowIso();
        });
        if (blockingNa) {
            return { ok: false, err: '“' + blockingNa + '” is a blocking requirement, so it ' +
                     'cannot be marked not applicable. Waive it instead, with a reason and an approver.' };
        }
        return res;
    }

    /* A WAIVER. Reason and approver both required, and it is logged before it is useful --
       the point of a hard block is that going around it is visible afterwards. */
    function waive(projectId, gate, key, opts) {
        opts = opts || {};
        var reason = text(opts.reason);
        var by = text(opts.approved_by);
        if (!reason) return { ok: false, err: 'A waiver needs a reason.' };
        if (!by) return { ok: false, err: 'A waiver needs the name of whoever approved it.' };
        var label = null;
        var res = writeState(projectId, gate, key, function (rec, def) {
            label = def.label;
            rec.waived_at = nowIso();
            rec.waived_reason = reason;
            rec.waived_by = by;
            rec.at = rec.waived_at;
        });
        if (!res.ok) return res;
        var project = ProjectData.get(projectId);
        var logged = null;
        if (typeof CrmLog !== 'undefined' && CrmLog.append &&
            project && project.prospect.prospect_id) {
            logged = CrmLog.append('waiver', project.prospect.prospect_id, {
                project_id: projectId, gate: gate || project.gate, deliverable: label || key,
                reason: reason, approved_by: by
            });
        }
        return { ok: true, err: null, project: res.project, logged: !!(logged && logged.ok) };
    }

    function unwaive(projectId, gate, key) {
        return writeState(projectId, gate, key, function (rec) {
            delete rec.waived_at; delete rec.waived_reason; delete rec.waived_by;
            rec.at = nowIso();
        });
    }

    return {
        STATUSES: STATUSES,
        itemsFor: itemsFor,
        readiness: readiness,
        blockers: blockers,
        canAdvance: canAdvance,
        STAGE_ON_LEAVING: STAGE_ON_LEAVING,
        STAGE_ON_ENTERING: STAGE_ON_ENTERING,
        permitIssued: permitIssued,
        stageAchieved: stageAchieved,
        syncDevelopmentStage: syncDevelopmentStage,
        setStatus: setStatus,
        waive: waive,
        unwaive: unwaive
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ProjectGates;
