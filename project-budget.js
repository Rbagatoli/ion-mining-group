/* ===== Project budget =====
 *
 * The failure mode this exists to prevent: discovering at 70% complete that you are 40% over.
 *
 * THREE STATES, NOT TWO. budgeted -> committed -> spent. Committed is the number that matters
 * and the one nothing in this app tracked before: once a PO is issued the money is effectively
 * gone, and a system that reports only what has been invoiced hides the exposure until the
 * invoice arrives. `spent` alone always looks fine right up until it does not.
 *
 * NOTHING DERIVED IS EVER PERSISTED, and that is a sync decision before it is a tidiness one.
 * sync.js writes the store as one Firestore document with merge:true; two devices adding
 * different lines set-union because the lines are a map. A STORED total would not merge -- it is
 * a scalar, so one device's figure would simply win, and the survivor would be a total that
 * disagrees with the lines sitting underneath it. A total that contradicts its own detail is
 * worse than no total, because it looks authoritative. So every figure here is computed on read
 * and there is no setter for one anywhere in this module.
 *
 * THE CATEGORIES ARE SiteCapex's COMPONENT IDS, plus five. The estimator already models nine and
 * has argued out each of them; a second vocabulary would mean the capital-avoided modelling and
 * the ledger describing the same build in different words, and a variance that is really a
 * mapping error. Seeding budgeted_amount from stack() then makes the estimate the opening
 * budget, and estimate-versus-actual falls out for free.
 *
 * WHAT IS DELIBERATELY NOT SPLIT. The brief asks for containers, civil and mining-side
 * electrical as separate lines. They are inside mining_infrastructure at $450/kW, which
 * site-capex.js:34 records as Proton's own quoted Alberta figure "kept WHOLE and unsplit --
 * splitting it would destroy the audit trail on a real, quoted number". A split estimate invites
 * a reader to treat invented components as quoted ones. The ACTUALS can carry that detail: a
 * real invoice for civil works is a real number, and it lands as a line in mining_infrastructure
 * with a vendor and a note. The estimate does not pretend to a precision it never had.
 */
var ProjectBudget = (function () {
    'use strict';

    /* Nine from site-capex, in its order, then five it does not model.
     *
     * collection      site-capex prices no gas collection component at any stage, so a
     *                 greenfield landfill is never charged for the wellfield it must drill.
     *                 That gap is real and separately filed; the ledger still needs somewhere
     *                 to put the invoice when it arrives.
     * conditioning    compression and dehydration, distinct from siloxane treatment.
     * engineering     owner's engineer or EPC engineering, which is a fee not a per-kW rate.
     * contingency     tracked as its own line so drawdown is visible rather than absorbed.
     * diligence_at_risk  $150-270K spent on a project that can still die. Held apart from
     *                 committed capital everywhere it is reported.
     */
    var CATEGORIES = [
        { id: 'site_acquisition',      label: 'Site acquisition',        fromCapex: true },
        { id: 'permitting_development', label: 'Permitting & development', fromCapex: true },
        { id: 'generation_equipment',  label: 'Generation equipment',    fromCapex: true },
        { id: 'interconnection',       label: 'Electrical & interconnection', fromCapex: true },
        { id: 'gas_treatment',         label: 'Gas treatment',           fromCapex: true },
        { id: 'commissioning',         label: 'Commissioning',           fromCapex: true },
        { id: 'mining_infrastructure', label: 'Mining infrastructure',   fromCapex: true,
          note: 'containers, civil and mining-side electrical, kept together because the ' +
                'rate behind them is one real quote' },
        { id: 'miners',                label: 'Miners',                  fromCapex: true },
        { id: 'carrying_cost',         label: 'Carrying cost',           fromCapex: true },
        { id: 'collection',            label: 'Gas collection',          fromCapex: false },
        { id: 'conditioning',          label: 'Gas conditioning',        fromCapex: false },
        { id: 'engineering',           label: 'Engineering',             fromCapex: false },
        { id: 'contingency',           label: 'Contingency',             fromCapex: false },
        { id: 'diligence_at_risk',     label: 'Diligence (at risk)',     fromCapex: false }
    ];
    var CATEGORY_IDS = CATEGORIES.map(function (c) { return c.id; });
    // Spent before the deal is certain. Reported apart from committed capital everywhere.
    var AT_RISK = 'diligence_at_risk';
    var CONTINGENCY = 'contingency';

    var CO_STATUSES = ['proposed', 'approved', 'rejected'];

    function num(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = Number(v);
        return isFinite(n) ? n : null;
    }
    function text(v, max) {
        if (v === null || v === undefined) return null;
        var s = String(v).trim();
        if (!s) return null;
        return max ? s.slice(0, max) : s;
    }
    function nowIso() { return new Date().toISOString(); }
    function newId(prefix) {
        var s = '';
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            var a = new Uint8Array(6);
            crypto.getRandomValues(a);
            for (var i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2);
        } else { s = 'noRng' + Date.now().toString(36); }
        return prefix + '_' + s;
    }
    function categoryLabel(id) {
        for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i].label;
        return id;
    }

    // ---- reads: every figure computed, none stored -------------------------------------

    function lines(project) {
        if (!project || !project.budget_lines) return [];
        var out = [];
        for (var id in project.budget_lines) {
            if (!Object.prototype.hasOwnProperty.call(project.budget_lines, id)) continue;
            var l = project.budget_lines[id];
            if (!l || l.deleted_at) continue;
            out.push(l);
        }
        return out.sort(function (a, b) {
            var ai = CATEGORY_IDS.indexOf(a.category), bi = CATEGORY_IDS.indexOf(b.category);
            if (ai !== bi) return ai - bi;
            return String(a.created || '').localeCompare(String(b.created || ''));
        });
    }

    function changeOrders(project) {
        if (!project || !project.change_orders) return [];
        var out = [];
        for (var id in project.change_orders) {
            if (!Object.prototype.hasOwnProperty.call(project.change_orders, id)) continue;
            var c = project.change_orders[id];
            if (!c || c.deleted_at) continue;
            out.push(c);
        }
        return out.sort(function (a, b) { return String(a.created || '').localeCompare(String(b.created || '')); });
    }

    /* THE HEADLINE. Every number recomputed from the lines each time it is asked for.
     *
     * at_risk is held out of committed and spent everywhere: it is money spent on a project that
     * can still die, and folding it into capital committed would make a project that has spent
     * $200K proving a site is unviable look like one that has started building. */
    function totals(project) {
        var ls = lines(project);
        var t = {
            budgeted: 0, committed: 0, spent: 0,
            at_risk_budgeted: 0, at_risk_committed: 0, at_risk_spent: 0,
            contingency_budgeted: 0, contingency_committed: 0, contingency_spent: 0,
            lines: ls.length
        };
        for (var i = 0; i < ls.length; i++) {
            var l = ls[i];
            var b = num(l.budgeted_amount) || 0, c = num(l.committed_amount) || 0, s = num(l.spent_amount) || 0;
            if (l.category === AT_RISK) {
                t.at_risk_budgeted += b; t.at_risk_committed += c; t.at_risk_spent += s;
                continue;                                  // deliberately not in the capital totals
            }
            if (l.category === CONTINGENCY) {
                t.contingency_budgeted += b; t.contingency_committed += c; t.contingency_spent += s;
            }
            t.budgeted += b; t.committed += c; t.spent += s;
        }
        var authorised = num(project && project.budget_authorised_usd);
        t.authorised = authorised;
        t.remaining = (authorised === null) ? null : authorised - t.committed;
        t.uncommitted = t.budgeted - t.committed;

        /* CONTINGENCY AS A SHARE OF WHAT IS LEFT, not of the original budget. That ratio is the
           early warning: contingency at 60% of a budget 20% remaining is a project in trouble,
           and contingency at 60% of the original tells you nothing about where you are. */
        var contingencyLeft = t.contingency_budgeted - t.contingency_committed;
        t.contingency_remaining = contingencyLeft;
        /* NULL WHERE NONE WAS BUDGETED, NOT ZERO. A ratio of 0 means the contingency is gone,
           which is the loudest thing this ledger can say; a project that simply has not set any
           aside yet must not say it. The estimator has no contingency component, so every
           freshly seeded project lands here, and "not budgeted" is the honest reading. */
        t.contingency_ratio = (t.contingency_budgeted > 0 && t.remaining !== null && t.remaining > 0)
            ? Math.round((contingencyLeft / t.remaining) * 100) : null;

        var cos = changeOrders(project).filter(function (c) { return c.status === 'approved'; });
        t.change_order_value = cos.reduce(function (a, c) { return a + (num(c.cost_impact) || 0); }, 0);
        t.change_order_days = cos.reduce(function (a, c) { return a + (num(c.schedule_impact_days) || 0); }, 0);
        t.change_order_count = cos.length;
        /* The honest measure of how a project is tracking, and the reason it is a headline rather
           than a detail: cumulative approved change against what was originally authorised. */
        t.change_order_pct = (authorised && authorised > 0)
            ? Math.round((t.change_order_value / authorised) * 100) : null;
        return t;
    }

    function byCategory(project) {
        var ls = lines(project), map = {};
        for (var i = 0; i < ls.length; i++) {
            var l = ls[i];
            if (!map[l.category]) {
                map[l.category] = { id: l.category, label: categoryLabel(l.category),
                                    budgeted: 0, committed: 0, spent: 0, lines: 0, seeded: false };
            }
            var m = map[l.category];
            m.budgeted += num(l.budgeted_amount) || 0;
            m.committed += num(l.committed_amount) || 0;
            m.spent += num(l.spent_amount) || 0;
            m.lines++;
            if (l.seeded) m.seeded = true;
        }
        var out = [];
        for (var ci = 0; ci < CATEGORIES.length; ci++) {
            var got = map[CATEGORIES[ci].id];
            if (!got) continue;
            // Variance against the budget, positive meaning over. Null where nothing was
            // budgeted: a category with committed money and no budget is not "infinitely over",
            // it is unbudgeted, which the caller should say differently.
            got.variance = got.budgeted > 0 ? got.committed - got.budgeted : null;
            got.variance_pct = got.budgeted > 0
                ? Math.round(((got.committed - got.budgeted) / got.budgeted) * 100) : null;
            /* TWO DIFFERENT THINGS, KEPT APART. `unbudgeted` is money against a category nobody
               planned for. `priced_at_zero` is a category the estimator looked at and priced at
               nothing -- site acquisition on a raw resource is the standing example, where
               site-capex.js:398 says "0 is a real answer here".
               The discriminator is the seeded flag, not whether a line exists: this map is built
               FROM the lines, so every category in it has one, and a line carrying only committed
               money has budgeted_amount 0 because the field was omitted rather than decided. */
            got.priced_at_zero = got.budgeted === 0 && got.seeded;
            got.unbudgeted = got.budgeted === 0 && got.committed > 0 && !got.seeded;
            // An explicit zero contradicted by real money — worth saying out loud, because the
            // estimate is now known to be wrong rather than merely absent.
            got.zero_contradicted = got.priced_at_zero && got.committed > 0;
            out.push(got);
        }
        return out;
    }

    // ---- seeding from the estimator ----------------------------------------------------

    /* The estimate becomes the opening budget, so variance is measured against what the model
       actually said rather than a figure typed in afterwards. Components the estimator reports
       as `unknown` are skipped rather than seeded at zero -- a zero budget would read as "this
       costs nothing" and produce a 100% overrun on the first invoice. */
    function seedFromEstimate(projectId) {
        if (typeof ProjectData === 'undefined') return { ok: false, err: 'The project model is not loaded.' };
        if (typeof SiteCapex === 'undefined' || !SiteCapex.stack) {
            return { ok: false, err: 'The capex model is not loaded, so there is nothing to seed from.' };
        }
        var project = ProjectData.get(projectId);
        if (!project) return { ok: false, err: 'No such project.' };
        if (lines(project).length) {
            return { ok: false, err: 'This project already has budget lines. Seeding would ' +
                     'duplicate them; add lines directly instead.' };
        }
        var kw = num(project.capacity_kw);
        if (kw === null || kw <= 0) return { ok: false, err: 'The project has no capacity to price.' };

        var stack = SiteCapex.stack({
            powerPotentialKw: kw,
            development_stage: project.prospect.development_stage || null,
            energy_type: 'landfill_gas'
        }, { capacityKw: kw });

        var seeded = [], skipped = [];
        for (var i = 0; i < stack.components.length; i++) {
            var c = stack.components[i];
            if (c.state === 'unknown' || c.usd === null) { skipped.push(c.id); continue; }
            if (c.state === 'avoided') { skipped.push(c.id); continue; }   // inherited, not spent
            seeded.push({ category: c.id, budgeted_amount: Math.round(c.usd),
                          notes: 'seeded from the estimate — ' + (c.basis || c.reason || '') });
        }
        if (!seeded.length) return { ok: false, err: 'The estimate priced nothing to seed from.' };

        var res = ProjectData.mutate(projectId, function (p) {
            for (var s = 0; s < seeded.length; s++) {
                var id = newId('bl');
                p.budget_lines[id] = {
                    id: id, category: seeded[s].category,
                    budgeted_amount: seeded[s].budgeted_amount,
                    committed_amount: 0, spent_amount: 0,
                    vendor: null, notes: seeded[s].notes,
                    seeded: true, created: nowIso(), updated: nowIso()
                };
            }
        });
        if (!res.ok) return res;
        return { ok: true, err: null, seeded: seeded.length, skipped: skipped, project: res.project };
    }

    // ---- writes ------------------------------------------------------------------------

    /* NO MATERIAL SPEND BEFORE EXCLUSIVITY. Flagged, not refused: the money may be committed for
       a good reason and refusing would just move the record out of the system, which is worse
       than a flagged line. Diligence-at-risk is exempt by definition -- it is the spend you make
       to find out whether to pursue exclusivity at all. */
    function exclusivityFlag(project, category) {
        if (category === AT_RISK) return null;
        if (typeof ProjectGates === 'undefined' || !ProjectGates.itemsFor) return null;
        var items = ProjectGates.itemsFor(project, 'contact_loi');
        if (items === null) return null;
        var ex = items.filter(function (i) { return i.key === 'exclusivity'; })[0];
        if (!ex || ex.satisfied) return null;
        return 'Exclusivity is not executed yet. Money committed now is at risk of being spent ' +
               'diligencing a site somebody else can still take.';
    }

    function addLine(projectId, fields) {
        if (typeof ProjectData === 'undefined') return { ok: false, err: 'The project model is not loaded.' };
        var f = fields || {};
        if (CATEGORY_IDS.indexOf(f.category) < 0) {
            return { ok: false, err: 'Unknown category: ' + f.category + '.' };
        }
        var b = num(f.budgeted_amount), c = num(f.committed_amount), s = num(f.spent_amount);
        if (b === null && c === null && s === null) {
            return { ok: false, err: 'A budget line needs at least one figure.' };
        }
        if ([b, c, s].some(function (v) { return v !== null && v < 0; })) {
            return { ok: false, err: 'Budget figures cannot be negative. A reduction is a change order.' };
        }
        var project = ProjectData.get(projectId);
        if (!project) return { ok: false, err: 'No such project.' };
        var flag = exclusivityFlag(project, f.category);

        var newLineId = newId('bl');
        var res = ProjectData.mutate(projectId, function (p) {
            p.budget_lines[newLineId] = {
                id: newLineId, category: f.category,
                budgeted_amount: b === null ? 0 : b,
                committed_amount: c === null ? 0 : c,
                spent_amount: s === null ? 0 : s,
                vendor: text(f.vendor, 120), notes: text(f.notes, 500),
                created: nowIso(), updated: nowIso()
            };
        });
        if (!res.ok) return res;
        return { ok: true, err: null, id: newLineId, project: res.project,
                 flag: flag, notice: res.notice };
    }

    function updateLine(projectId, lineId, patch) {
        if (typeof ProjectData === 'undefined') return { ok: false, err: 'The project model is not loaded.' };
        var p0 = patch || {};
        if (Object.prototype.hasOwnProperty.call(p0, 'category') &&
            CATEGORY_IDS.indexOf(p0.category) < 0) {
            return { ok: false, err: 'Unknown category: ' + p0.category + '.' };
        }
        var bad = null;
        ['budgeted_amount', 'committed_amount', 'spent_amount'].forEach(function (k) {
            if (!Object.prototype.hasOwnProperty.call(p0, k)) return;
            var v = num(p0[k]);
            if (v === null || v < 0) bad = k;
        });
        if (bad) return { ok: false, err: bad.replace(/_/g, ' ') + ' must be a number, not negative.' };

        return ProjectData.mutate(projectId, function (p) {
            var l = p.budget_lines[lineId];
            if (!l || l.deleted_at) throw new Error('No such budget line.');
            for (var k in p0) {
                if (!Object.prototype.hasOwnProperty.call(p0, k)) continue;
                if (k === 'id' || k === 'created') continue;
                l[k] = (['budgeted_amount', 'committed_amount', 'spent_amount'].indexOf(k) >= 0)
                    ? num(p0[k]) : p0[k];
            }
            l.updated = nowIso();
        });
    }

    // A tombstone, for the reason the project record uses one: merge cannot remove a map key.
    function removeLine(projectId, lineId, reason) {
        return ProjectData.mutate(projectId, function (p) {
            var l = p.budget_lines[lineId];
            if (!l || l.deleted_at) throw new Error('No such budget line.');
            l.deleted_at = nowIso();
            l.deleted_reason = text(reason);
        });
    }

    /* CHANGE ORDERS. Every one carries a cost AND a schedule impact, both required -- a change
       with no schedule impact is a claim, and the cumulative figure is only honest if nobody
       could opt out of half of it. */
    function addChangeOrder(projectId, fields) {
        if (typeof ProjectData === 'undefined') return { ok: false, err: 'The project model is not loaded.' };
        var f = fields || {};
        var desc = text(f.description, 300);
        if (!desc) return { ok: false, err: 'A change order needs a description.' };
        if (!text(f.reason, 500)) return { ok: false, err: 'A change order needs a reason.' };
        var cost = num(f.cost_impact);
        if (cost === null) return { ok: false, err: 'A change order needs a cost impact, even if it is zero.' };
        var days = num(f.schedule_impact_days);
        if (days === null) return { ok: false, err: 'A change order needs a schedule impact in days, even if it is zero.' };

        var coId = newId('co');
        var res = ProjectData.mutate(projectId, function (p) {
            p.change_orders[coId] = {
                id: coId, description: desc, reason: text(f.reason, 500),
                cost_impact: cost, schedule_impact_days: days,
                status: 'proposed', approved_by: null, approved_at: null,
                created: nowIso(), updated: nowIso()
            };
        });
        if (!res.ok) return res;
        var project = ProjectData.get(projectId);
        var logged = null;
        if (typeof CrmLog !== 'undefined' && CrmLog.append && project.prospect.prospect_id) {
            logged = CrmLog.append('change_order', project.prospect.prospect_id, {
                project_id: projectId, change_order_id: coId,
                description: desc, amount: cost, schedule_impact_days: days, status: 'proposed'
            });
        }
        return { ok: true, err: null, id: coId, logged: !!(logged && logged.ok),
                 log_id: logged && logged.entry ? logged.entry.id : null, project: res.project };
    }

    function decideChangeOrder(projectId, coId, status, approvedBy) {
        if (CO_STATUSES.indexOf(status) < 0) return { ok: false, err: 'Unknown status: ' + status + '.' };
        if (status === 'proposed') return { ok: false, err: 'A change order cannot go back to proposed.' };
        var by = text(approvedBy, 120);
        if (!by) return { ok: false, err: 'A decision on a change order needs a name against it.' };
        var before = null;
        var res = ProjectData.mutate(projectId, function (p) {
            var c = p.change_orders[coId];
            if (!c || c.deleted_at) throw new Error('No such change order.');
            if (c.status !== 'proposed') throw new Error('That change order was already ' + c.status + '.');
            before = { description: c.description, amount: c.cost_impact };
            c.status = status;
            c.approved_by = by;
            c.approved_at = nowIso();
            c.updated = c.approved_at;
        });
        if (!res.ok) return res;
        var project = ProjectData.get(projectId);
        var logged = null;
        if (typeof CrmLog !== 'undefined' && CrmLog.append && project.prospect.prospect_id) {
            logged = CrmLog.append('change_order', project.prospect.prospect_id, {
                project_id: projectId, change_order_id: coId,
                description: before.description, amount: before.amount,
                status: status, approved_by: by
            });
        }
        return { ok: true, err: null, logged: !!(logged && logged.ok), project: res.project };
    }

    /* A REVISION SUPERSEDES, IT DOES NOT OVERWRITE. CrmLog.supersede is the only revision
       machinery in this codebase and it is exactly the right shape here: the original entry
       stays where it is in the timeline and the new one points back at it, so what was approved
       first is still visible. Quietly editing an approved change order is how a cumulative
       change figure stops being a record of anything. */
    function reviseChangeOrder(projectId, coId, fields, priorLogId) {
        if (typeof ProjectData === 'undefined') return { ok: false, err: 'The project model is not loaded.' };
        var f = fields || {};
        var cost = num(f.cost_impact), days = num(f.schedule_impact_days);
        var reason = text(f.reason, 500);
        if (!reason) return { ok: false, err: 'A revision needs a reason.' };
        var res = ProjectData.mutate(projectId, function (p) {
            var c = p.change_orders[coId];
            if (!c || c.deleted_at) throw new Error('No such change order.');
            if (cost !== null) c.cost_impact = cost;
            if (days !== null) c.schedule_impact_days = days;
            if (text(f.description, 300)) c.description = text(f.description, 300);
            c.reason = reason;
            c.revised_at = nowIso();
            c.updated = c.revised_at;
        });
        if (!res.ok) return res;
        var project = ProjectData.get(projectId);
        var logged = null;
        if (typeof CrmLog !== 'undefined' && CrmLog.supersede && priorLogId) {
            logged = CrmLog.supersede(priorLogId, {
                project_id: projectId, change_order_id: coId,
                description: text(f.description, 300) || undefined,
                amount: cost, schedule_impact_days: days, reason: reason, revised: true
            });
        }
        return { ok: true, err: null, logged: !!(logged && logged.ok),
                 log_id: logged && logged.entry ? logged.entry.id : null, project: res.project };
    }

    return {
        CATEGORIES: CATEGORIES,
        CATEGORY_IDS: CATEGORY_IDS,
        CO_STATUSES: CO_STATUSES,
        AT_RISK: AT_RISK,
        CONTINGENCY: CONTINGENCY,
        categoryLabel: categoryLabel,
        lines: lines,
        changeOrders: changeOrders,
        totals: totals,
        byCategory: byCategory,
        seedFromEstimate: seedFromEstimate,
        exclusivityFlag: exclusivityFlag,
        addLine: addLine,
        updateLine: updateLine,
        removeLine: removeLine,
        addChangeOrder: addChangeOrder,
        decideChangeOrder: decideChangeOrder,
        reviseChangeOrder: reviseChangeOrder
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ProjectBudget;
