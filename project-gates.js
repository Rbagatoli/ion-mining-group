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
    function docKinds(prospectId) {
        var out = {};
        if (typeof CrmDocuments === 'undefined' || !CrmDocuments.forProspect || !prospectId) return out;
        var list = CrmDocuments.forProspect(prospectId) || [];
        for (var i = 0; i < list.length; i++) {
            if (list[i] && list[i].kind) out[list[i].kind] = list[i].id;
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
        setStatus: setStatus,
        waive: waive,
        unwaive: unwaive
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ProjectGates;
