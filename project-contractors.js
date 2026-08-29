/* ===== Contractors and payments (Stage 7) =====
 *
 * One question, asked about each firm on the site: WHAT IS OUTSTANDING BETWEEN US?
 *
 * That has exactly two shapes and they are not the same kind of thing, which is why one module
 * covers both. Money already paid that can still be claimed a second time, because no lien
 * waiver was signed against it. And a firm working on the site with an expired certificate of
 * insurance, which is unbounded and is true today rather than at some future settlement.
 * crm-config.js already calls the first one out on the construction gate -- "a payment issued
 * without a corresponding waiver is a routine cause of loss on a first-time build" -- and that
 * deliverable is blocking with nothing behind it to measure. This is what measures it.
 *
 * ABSENCE IS UNKNOWN FOR A NUMBER AND A DEFINITE NO FOR A WAIVER, and the split is the whole
 * design. procurement.js established the first half: anything that cannot be computed is null
 * and says 'unknown', because the reassuring default is always available and always wrong. That
 * still holds here -- a contractor with no contract sum recorded cannot be over-certified or
 * under-certified, and guessing either way invents a variance.
 *
 * The waiver breaks the pattern deliberately. A lien waiver that has not been received does not
 * exist; there is nothing to be uncertain about. Filing it as 'unknown' would drop the loudest
 * fact on the page into the quiet bucket next to a missing lead time. So an absent waiver is
 * 'none', and 'none' is exposure.
 *
 * THREE WAIVER STATES, NEVER TWO, and never summed. A conditional waiver on progress payment is
 * exchanged with the cheque and is contingent on the cheque clearing; the unconditional one
 * comes after it clears. Money under a conditional waiver is a swap somebody has to chase.
 * Money under no waiver at all is a claim nobody has given up. Adding those two into one
 * "unwaived" figure would tell an operator to do something general, and the two need different
 * calls -- one to the bank, one to a lawyer.
 *
 * RECORDING THE TRUTH IS NEVER THE HARDER PATH. recordPayment() does NOT require a waiver.
 * Refusing the payment until a waiver exists would not prevent the payment -- the cheque is
 * already written -- it would only prevent the RECORD of it, and an unrecorded payment is
 * exposure that nothing can see. So the payment goes in and the exposure lights up. A control
 * that makes the honest action the more difficult one produces a clean ledger and a false one.
 *
 * THE CONTRACT SUM IS NOT EDITED AFTER THE FIRST CERTIFICATE. Once work has been certified
 * against a contract, the mechanism for changing its value is a change order, which names a
 * reason and an approver and lands on the timeline. Quietly retyping the sum would make every
 * variance since the first certificate meaningless -- the same argument reviseChangeOrder()
 * makes for superseding rather than overwriting.
 *
 * WHAT THIS MODULE DOES NOT OWN. The day comparator is CrmFollowups.daysOverdue(), signed, one
 * implementation. Which change orders count is ProjectBudget.changeOrders(), because it already
 * decides what deleted and approved mean. If project-budget.js is not loaded, the variations are
 * NULL rather than zero: a revised contract sum stated without knowing the variations is a
 * number that will be believed and is wrong.
 */
var ProjectContractors = (function () {
    'use strict';

    /* 'selected' exists because a firm is chosen before the contract is signed, and the gap is
       where the insurance certificate is chased. 'terminated' does not settle anything -- a
       terminated contractor with unwaived payments behind it is the WORST lien position there
       is, not a closed one, which is why status never suppresses a condition below. */
    var STATUSES = ['selected', 'engaged', 'complete', 'terminated'];

    /* 'certified' rather than 'approved' because that is what the owner's engineer does to a
       payment application, and because 'approved' already means something else on a change
       order three files away. Certified is a claim the owner has agreed is owed; paid is money
       that has left. */
    var PAY_STATUSES = ['submitted', 'certified', 'paid', 'rejected'];

    var WAIVERS = ['none', 'conditional', 'unconditional'];

    /* Thirty days, matching ProjectProcurement.DUE_SOON_DAYS for the same reason: it is the span
       in which a renewal can still be obtained without anybody expediting. A display band, not a
       rule -- nothing is refused on it. */
    var INSURANCE_SOON_DAYS = 30;

    function num(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = Number(v);
        return isFinite(n) ? n : null;
    }
    /* Money is non-negative here. A negative certificate is a credit and belongs in a change
       order, where it carries a reason; accepted silently it would net off against real work
       and shrink an exposure figure without anybody deciding to. */
    function money(v) {
        var n = num(v);
        return (n === null || n < 0) ? null : n;
    }
    function text(v, max) {
        if (v === null || v === undefined) return null;
        var s = String(v).trim();
        if (!s) return null;
        return max ? s.slice(0, max) : s;
    }
    function isDay(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v); }
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

    // ---- reading the collections -------------------------------------------------------

    /* A MAP KEYED BY ID, NOT AN ARRAY, and reading the wrong one is silent. project-model.js
       stores every per-project collection as a map because sync.js writes each store with
       ref.set(payload, { merge: true }): merge deep-merges maps and replaces arrays wholesale,
       so as an array two devices each adding a contractor produce a document with one of them
       and no error. normalizeProject() discards an array in these slots outright.

       procurement.js read an array here and returned [] for every real project -- the feature
       was inert and fifty tests agreed with it, because every fixture in that file was built by
       that file. Arrays are refused rather than tolerated, so the same mistake cannot hide in
       the next caller, and the tests for this module take their projects from ProjectData's own
       writer rather than inventing the shape. */
    function mapValues(m) {
        if (!m || typeof m !== 'object' || Array.isArray(m)) return [];
        var out = [];
        for (var k in m) {
            if (!Object.prototype.hasOwnProperty.call(m, k)) continue;
            var v = m[k];
            if (!v || typeof v !== 'object') continue;
            if (v.deleted_at) continue;
            /* The map key is the identity. A record whose own id disagrees with the key it is
               filed under would render under one and be written back under the other. */
            if (!v.id) v = Object.assign({}, v, { id: String(k) });
            out.push(v);
        }
        return out;
    }

    function contractorsOf(project) {
        return mapValues(project && project.contractors).map(normalizeContractor);
    }

    function payAppsOf(project) {
        return mapValues(project && project.pay_apps).map(normalizePayApp);
    }

    function appsFor(project, contractorId) {
        var cid = String(contractorId);
        return payAppsOf(project)
            .filter(function (a) { return a.contractor_id === cid; })
            .sort(function (a, b) {
                /* Period first, then created, so two applications certified in the same
                   millisecond still order by the period they cover. */
                var pa = a.period_to || '', pb = b.period_to || '';
                if (pa !== pb) return pa.localeCompare(pb);
                return String(a.created || '').localeCompare(String(b.created || ''));
            });
    }

    /* Carries unknown keys through, for the reason normalizeProject() gives: a browser on an
       older build must not strip fields it has not heard of and write the stripped record back,
       now that sync pushes it to every other device. Fills what is missing, coerces what it
       owns. */
    function carry(src) {
        var out = {};
        var s = (src && typeof src === 'object') ? src : {};
        for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) out[k] = s[k];
        return out;
    }

    function normalizeContractor(partial) {
        var c = carry(partial);
        c.id = text(c.id) || '';
        c.name = text(c.name, 120);
        c.trade = text(c.trade, 60);
        c.scope = text(c.scope, 300);
        // Null is a real state, not a zero: a firm can be selected before its contract is priced.
        c.contract_value_usd = money(c.contract_value_usd);
        c.insurance_expiry = isDay(c.insurance_expiry) ? c.insurance_expiry : null;
        c.status = (STATUSES.indexOf(text(c.status)) >= 0) ? c.status : 'selected';
        return c;
    }

    function normalizePayApp(partial) {
        var a = carry(partial);
        a.id = text(a.id) || '';
        a.contractor_id = text(a.contractor_id) || '';
        a.number = text(a.number, 40);
        a.period_to = isDay(a.period_to) ? a.period_to : null;
        a.certified_usd = money(a.certified_usd);
        /* Retainage is a DEDUCTION, and no deduction recorded means none was taken. Zero is the
           common real value on a first application and the arithmetic is net = certified minus
           retained, so defaulting to zero errs toward MORE money counted as paid, and therefore
           toward more exposure reported. It is the one absence here whose safe default is a
           number, because the unsafe direction is the quiet one. */
        a.retained_usd = money(a.retained_usd);
        if (a.retained_usd === null) a.retained_usd = 0;
        a.status = (PAY_STATUSES.indexOf(text(a.status)) >= 0) ? a.status : 'submitted';
        // See the header: absent is 'none', which is a statement, not a gap.
        a.waiver = (WAIVERS.indexOf(text(a.waiver)) >= 0) ? a.waiver : 'none';
        a.waiver_on = isDay(a.waiver_on) ? a.waiver_on : null;
        a.waiver_ref = text(a.waiver_ref, 200);
        a.paid_on = isDay(a.paid_on) ? a.paid_on : null;
        a.certified_by = text(a.certified_by, 120);
        return a;
    }

    /* The net of one application: what actually leaves the bank. Null when the gross cannot be
       read, or when the retainage exceeds it -- a deduction larger than the certificate is a
       malformed record, and treating it as a negative payment would reduce somebody else's
       exposure figure. */
    function netOf(app) {
        if (!app || app.certified_usd === null) return null;
        var r = (app.retained_usd === null) ? 0 : app.retained_usd;
        if (r > app.certified_usd) return null;
        return app.certified_usd - r;
    }

    /* Approved variations against ONE contract, delegated rather than re-derived: ProjectBudget
       already decides what deleted and approved mean for a change order. Null, never zero, when
       that module is not loaded -- see the header. */
    function variationsFor(project, contractorId) {
        if (typeof ProjectBudget === 'undefined' || !ProjectBudget.changeOrders) return null;
        var cid = String(contractorId);
        var sum = 0;
        var cos = ProjectBudget.changeOrders(project) || [];
        for (var i = 0; i < cos.length; i++) {
            var c = cos[i];
            if (c.status !== 'approved') continue;
            if (String(c.contractor_id || '') !== cid) continue;
            var n = num(c.cost_impact);
            if (n === null) continue;
            sum += n;
        }
        return sum;
    }

    /* Signed, and borrowed, exactly as procurement.js borrows it. Positive means the
       certificate expired that many days ago; negative is days of cover remaining. */
    function insuranceDays(contractor, nowMs) {
        if (!contractor || !contractor.insurance_expiry) return null;
        if (typeof CrmFollowups === 'undefined' || !CrmFollowups.daysOverdue) return null;
        return CrmFollowups.daysOverdue({ due_date: contractor.insurance_expiry }, nowMs);
    }

    // ---- the position ------------------------------------------------------------------

    /* Everything outstanding between the project and one firm, computed on read and never
       stored. A stored total would not survive Firestore's merge -- it is a scalar, so one
       device's figure simply wins, and a total that disagrees with the applications underneath
       it is worse than no total because it looks authoritative. Same rule as ProjectBudget. */
    function position(project, contractor, nowMs) {
        var c = normalizeContractor(contractor);
        var apps = appsFor(project, c.id);

        var certified = 0, paid = 0, retained = 0, outstanding = 0;
        var unwaived = 0, conditional = 0;
        var unpriced = 0, submitted = 0;

        for (var i = 0; i < apps.length; i++) {
            var a = apps[i];
            if (a.status === 'rejected') continue;
            if (a.status === 'submitted') { submitted++; continue; }
            var net = netOf(a);
            if (net === null) {
                /* Counted, never folded. An application with no amount contributes nothing to
                   any sum, which makes every figure below a LOWER bound rather than a wrong
                   one -- and the count says so out loud instead of the sums quietly absorbing
                   it. */
                unpriced++;
                continue;
            }
            certified += a.certified_usd;
            retained += a.retained_usd;
            if (a.status === 'certified') { outstanding += net; continue; }
            // paid
            paid += net;
            if (a.waiver === 'conditional') conditional += net;
            else if (a.waiver !== 'unconditional') unwaived += net;
        }

        var variations = variationsFor(project, c.id);
        var committed = (c.contract_value_usd === null || variations === null)
            ? null : c.contract_value_usd + variations;

        /* THE FALSY-ZERO TRAP, WRITTEN OUT SO IT CANNOT COME BACK. The natural guard is
           `if (committed && certified > committed)`, and it skips the check entirely when the
           contract sum is zero -- which is the single loudest case there is: a firm with no
           priced contract that has certified eighty thousand dollars of work. The test is
           against null, because null means unknown and zero means zero. */
        var over = (committed === null) ? null : Math.max(0, certified - committed);

        var insDays = insuranceDays(c, nowMs);

        var flags = {
            uninsured: insDays !== null && insDays > 0,
            insurance_soon: insDays !== null && insDays <= 0 && insDays > -INSURANCE_SOON_DAYS,
            insurance_undated: c.insurance_expiry === null,
            unwaived: unwaived > 0,
            conditional: conditional > 0,
            overcertified: over !== null && over > 0,
            unpaid: outstanding > 0,
            // Distinguished from each other because the fix differs: one is a contract sum to
            // type in, one is a module that is not loaded, one is an application to price.
            unpriced_contract: c.contract_value_usd === null,
            variations_unknown: variations === null,
            unpriced_apps: unpriced > 0
        };

        return {
            contractor: c,
            apps: apps.length,
            submitted: submitted,
            unpriced_apps: unpriced,
            contract_usd: c.contract_value_usd,
            variations_usd: variations,
            committed_usd: committed,
            certified_usd: certified,
            paid_usd: paid,
            retained_usd: retained,
            outstanding_usd: outstanding,
            unwaived_usd: unwaived,
            conditional_usd: conditional,
            overcertified_usd: over,
            insurance_days: insDays,
            flags: flags,
            state: stateOf(c, flags)
        };
    }

    /* ONE STATE FOR THE ROW, WORST FIRST, and the conditions above are kept separately because
       they co-occur: a terminated firm can be uninsured, over-certified and unwaived at once,
       and a single state would report one third of that. The state decides where the row sits;
       exposure() counts each condition on its own.
     *
     * uninsured leads because it is unbounded and it is true right now, while a lien claim is
     * capped at what was paid and arrives later. 'unknown' sits directly after the actionable
     * states rather than at the bottom, for the reason procurement.js gives: a firm whose
     * position cannot be computed is a question for today, not a footnote. */
    var RANK = ['uninsured', 'unwaived', 'overcertified', 'unpaid', 'conditional',
                'insurance_soon', 'unknown', 'active', 'complete', 'terminated'];

    function stateOf(contractor, flags) {
        if (flags.uninsured) return 'uninsured';
        if (flags.unwaived) return 'unwaived';
        if (flags.overcertified) return 'overcertified';
        if (flags.unpaid) return 'unpaid';
        if (flags.conditional) return 'conditional';
        if (flags.insurance_soon) return 'insurance_soon';
        /* Not knowing the contract sum only matters once there is something to measure against
           it, but an unpriced application means the money figures are a lower bound, and a
           missing certificate date means the cover is unverified rather than valid. */
        if (flags.unpriced_apps || flags.variations_unknown) return 'unknown';
        if (contractor.status === 'terminated') return 'terminated';
        if (contractor.status === 'complete') return 'complete';
        if (flags.unpriced_contract || flags.insurance_undated) return 'unknown';
        return 'active';
    }

    /* The money the row's own state is about, used only to order rows that share a state. A row
       has no single "amount at risk" and this is deliberately not one: adding an unwaived
       payment to an unpaid certificate would mix money we owe with money we might owe twice. */
    function stateAmount(r) {
        if (r.state === 'unwaived') return r.unwaived_usd;
        if (r.state === 'overcertified') return r.overcertified_usd || 0;
        if (r.state === 'unpaid') return r.outstanding_usd;
        if (r.state === 'conditional') return r.conditional_usd;
        if (r.state === 'uninsured') return r.insurance_days || 0;
        return r.paid_usd;
    }

    function register(project, nowMs) {
        return contractorsOf(project).map(function (c) {
            return position(project, c, nowMs);
        }).sort(function (a, b) {
            var ra = RANK.indexOf(a.state), rb = RANK.indexOf(b.state);
            if (ra !== rb) return ra - rb;
            var sa = stateAmount(a), sb = stateAmount(b);
            if (sa !== sb) return sb - sa;
            return String(a.contractor.name || a.contractor.id)
                .localeCompare(String(b.contractor.name || b.contractor.id));
        });
    }

    /* A COUNT AND A SUM PER CONDITION, AND NO GRAND TOTAL ANYWHERE.
     *
     * unwaived_usd and conditional_usd are never added: one is money nobody has given up a claim
     * on, the other is money under a waiver that is waiting on a cheque to clear. They need
     * different calls. Same for outstanding_usd, which is money owed to a contractor rather than
     * money at risk from one -- summing the three would produce a figure that is not a quantity
     * of anything. */
    function exposure(project, nowMs) {
        var rows = register(project, nowMs);
        var out = {
            contractors: rows.length,
            unwaived_usd: 0, unwaived_count: 0,
            conditional_usd: 0, conditional_count: 0,
            overcertified_usd: 0, overcertified_count: 0,
            outstanding_usd: 0, outstanding_count: 0,
            retained_usd: 0,
            paid_usd: 0,
            uninsured_count: 0, insurance_soon_count: 0, insurance_undated_count: 0,
            unpriced_contract_count: 0, unpriced_apps: 0, submitted_count: 0,
            variations_unknown: false
        };
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            out.paid_usd += r.paid_usd;
            out.retained_usd += r.retained_usd;
            if (r.unwaived_usd > 0) { out.unwaived_usd += r.unwaived_usd; out.unwaived_count++; }
            if (r.conditional_usd > 0) { out.conditional_usd += r.conditional_usd; out.conditional_count++; }
            if (r.overcertified_usd) { out.overcertified_usd += r.overcertified_usd; out.overcertified_count++; }
            if (r.outstanding_usd > 0) { out.outstanding_usd += r.outstanding_usd; out.outstanding_count++; }
            if (r.flags.uninsured) out.uninsured_count++;
            if (r.flags.insurance_soon) out.insurance_soon_count++;
            if (r.flags.insurance_undated) out.insurance_undated_count++;
            if (r.flags.unpriced_contract) out.unpriced_contract_count++;
            if (r.flags.variations_unknown) out.variations_unknown = true;
            out.unpriced_apps += r.unpriced_apps;
            out.submitted_count += r.submitted;
        }
        return out;
    }

    /* What the construction gate's lien_waivers deliverable actually asks. It is blocking and
       has nothing behind it, so today it is a checkbox somebody ticks. This is the measurement:
       waivers are current when no paid application is missing one.
     *
     * A conditional waiver does NOT make them current. It is contingent on the payment clearing,
       so it is a promise about a cheque rather than a release of the claim, and a gate that
       accepted it would pass a project whose entire exposure is intact. */
    function waiversCurrent(project, nowMs) {
        var e = exposure(project, nowMs);
        if (e.unwaived_count === 0 && e.conditional_count === 0) {
            return { ok: true, err: null, exposure: e };
        }
        var parts = [];
        if (e.unwaived_count) {
            parts.push(e.unwaived_count + ' contractor' + (e.unwaived_count === 1 ? ' has' : 's have') +
                       ' been paid ' + usd(e.unwaived_usd) + ' with no lien waiver on file');
        }
        if (e.conditional_count) {
            parts.push(e.conditional_count + ' hold' + (e.conditional_count === 1 ? 's' : '') +
                       ' a conditional waiver only, over ' + usd(e.conditional_usd) +
                       ', which releases nothing until the payment clears');
        }
        return { ok: false, err: parts.join('; ') + '.', exposure: e };
    }

    function usd(n) {
        if (typeof n !== 'number' || !isFinite(n)) return 'an unknown amount';
        return '$' + Math.round(n).toLocaleString('en-US');
    }

    // ---- writes ------------------------------------------------------------------------

    function needModel() {
        return (typeof ProjectData === 'undefined' || !ProjectData.mutate)
            ? { ok: false, err: 'The project model is not loaded.' } : null;
    }

    /* A name and nothing else is required. The contract sum is deliberately optional: a firm is
       selected before it is priced, and refusing to record it until then means the insurance
       certificate has nowhere to live during exactly the window when nobody has checked it.
       Absent stays absent and reports itself as unknown, which is what promote() does with
       gas_mmscfd for a manually entered prospect. */
    function addContractor(projectId, fields) {
        var bad = needModel(); if (bad) return bad;
        var f = fields || {};
        var name = text(f.name, 120);
        if (!name) return { ok: false, err: 'A contractor needs a name.' };
        if (f.contract_value_usd !== undefined && f.contract_value_usd !== null &&
            f.contract_value_usd !== '' && money(f.contract_value_usd) === null) {
            return { ok: false, err: 'A contract value must be a number and cannot be negative.' };
        }
        if (f.insurance_expiry !== undefined && f.insurance_expiry !== null &&
            f.insurance_expiry !== '' && !isDay(f.insurance_expiry)) {
            return { ok: false, err: 'Insurance expiry must be a date, as YYYY-MM-DD.' };
        }
        if (f.status !== undefined && f.status !== null && f.status !== '' &&
            STATUSES.indexOf(String(f.status)) < 0) {
            return { ok: false, err: 'Unknown contractor status: ' + f.status + '.' };
        }
        var id = newId('ct');
        var res = ProjectData.mutate(projectId, function (p) {
            p.contractors[id] = {
                id: id, name: name, trade: text(f.trade, 60), scope: text(f.scope, 300),
                contract_value_usd: money(f.contract_value_usd),
                insurance_expiry: isDay(f.insurance_expiry) ? f.insurance_expiry : null,
                status: STATUSES.indexOf(String(f.status)) >= 0 ? String(f.status) : 'selected',
                created: nowIso(), updated: nowIso()
            };
        });
        return res.ok ? { ok: true, err: null, id: id, project: res.project, notice: res.notice }
                      : res;
    }

    var EDITABLE = ['name', 'trade', 'scope', 'contract_value_usd', 'insurance_expiry', 'status'];

    function updateContractor(projectId, contractorId, patch) {
        var bad = needModel(); if (bad) return bad;
        var p0 = patch || {};
        for (var k in p0) {
            if (!Object.prototype.hasOwnProperty.call(p0, k)) continue;
            /* Refused by NAME rather than stripped, matching ProjectData.update(): silently
               dropping a key the caller believed it set is the failure this codebase keeps
               finding. */
            if (EDITABLE.indexOf(k) < 0) {
                return { ok: false, err: k + ' cannot be changed through updateContractor().' };
            }
        }
        if (Object.prototype.hasOwnProperty.call(p0, 'name') && !text(p0.name, 120)) {
            return { ok: false, err: 'A contractor needs a name.' };
        }
        if (Object.prototype.hasOwnProperty.call(p0, 'status') &&
            STATUSES.indexOf(String(p0.status)) < 0) {
            return { ok: false, err: 'Unknown contractor status: ' + p0.status + '.' };
        }
        if (Object.prototype.hasOwnProperty.call(p0, 'insurance_expiry') &&
            p0.insurance_expiry !== null && !isDay(p0.insurance_expiry)) {
            return { ok: false, err: 'Insurance expiry must be a date, as YYYY-MM-DD.' };
        }
        if (Object.prototype.hasOwnProperty.call(p0, 'contract_value_usd') &&
            p0.contract_value_usd !== null && money(p0.contract_value_usd) === null) {
            return { ok: false, err: 'A contract value must be a number and cannot be negative.' };
        }
        return ProjectData.mutate(projectId, function (p) {
            var c = p.contractors[contractorId];
            if (!c || c.deleted_at) throw new Error('No such contractor.');
            if (Object.prototype.hasOwnProperty.call(p0, 'contract_value_usd')) {
                /* THE CONTRACT SUM CLOSES AT THE FIRST CERTIFICATE. See the header: after that
                   the mechanism is a change order, which names a reason and an approver and
                   leaves a mark. Before it, this is a typo fix. */
                var settled = 0;
                for (var aid in p.pay_apps) {
                    if (!Object.prototype.hasOwnProperty.call(p.pay_apps, aid)) continue;
                    var a = p.pay_apps[aid];
                    if (!a || a.deleted_at) continue;
                    if (String(a.contractor_id) !== String(contractorId)) continue;
                    if (a.status === 'certified' || a.status === 'paid') settled++;
                }
                if (settled) {
                    throw new Error('work has already been certified against this contract (' +
                        settled + ' application' + (settled === 1 ? '' : 's') + '). Raise a ' +
                        'change order against it instead, so the reason and the approver are ' +
                        'recorded — retyping the sum would make every variance since the first ' +
                        'certificate meaningless');
                }
                c.contract_value_usd = money(p0.contract_value_usd);
            }
            var keys = ['name', 'trade', 'scope', 'insurance_expiry', 'status'];
            for (var i = 0; i < keys.length; i++) {
                if (Object.prototype.hasOwnProperty.call(p0, keys[i])) c[keys[i]] = p0[keys[i]];
            }
            c.updated = nowIso();
        });
    }

    /* A tombstone, and only for a contractor with nothing against it. Removing the key would
       leave the record alive in Firestore -- merge cannot express a key removal -- so it would
       return on the next pull with its payment history and no sign it had been deleted. */
    function removeContractor(projectId, contractorId, reason) {
        var bad = needModel(); if (bad) return bad;
        return ProjectData.mutate(projectId, function (p) {
            var c = p.contractors[contractorId];
            if (!c || c.deleted_at) throw new Error('No such contractor.');
            var n = 0;
            for (var aid in p.pay_apps) {
                if (!Object.prototype.hasOwnProperty.call(p.pay_apps, aid)) continue;
                var a = p.pay_apps[aid];
                if (a && !a.deleted_at && String(a.contractor_id) === String(contractorId)) n++;
            }
            if (n) {
                throw new Error('this contractor has ' + n + ' payment application' +
                    (n === 1 ? '' : 's') + ' against it. A payment history is the evidence ' +
                    'behind a lien position and is not deleted with the firm');
            }
            c.deleted_at = nowIso();
            c.deleted_reason = text(reason, 300);
            c.updated = c.deleted_at;
        });
    }

    /* A payment application: a period, an amount, and the retainage held out of it. Both dates
       and both figures are required in the sense that matters -- the amount is refused rather
       than defaulted, because a certificate with no value is not a certificate. */
    function addPayApp(projectId, contractorId, fields) {
        var bad = needModel(); if (bad) return bad;
        var f = fields || {};
        var gross = money(f.certified_usd);
        if (gross === null) {
            return { ok: false, err: 'A payment application needs an amount, and it cannot be negative.' };
        }
        if (!isDay(f.period_to)) {
            return { ok: false, err: 'A payment application needs the period it covers, as YYYY-MM-DD.' };
        }
        var ret = (f.retained_usd === undefined || f.retained_usd === null || f.retained_usd === '')
            ? 0 : money(f.retained_usd);
        if (ret === null) return { ok: false, err: 'Retainage must be a number and cannot be negative.' };
        if (ret > gross) {
            return { ok: false, err: 'Retainage of ' + usd(ret) + ' is more than the ' +
                     usd(gross) + ' certified. Nothing would be payable.' };
        }
        var id = newId('pa');
        var res = ProjectData.mutate(projectId, function (p) {
            var c = p.contractors[contractorId];
            if (!c || c.deleted_at) throw new Error('No such contractor.');
            p.pay_apps[id] = {
                id: id, contractor_id: String(contractorId),
                number: text(f.number, 40), period_to: f.period_to,
                certified_usd: gross, retained_usd: ret,
                status: 'submitted', certified_by: null, certified_at: null,
                paid_on: null, paid_ref: null,
                waiver: 'none', waiver_on: null, waiver_ref: null,
                created: nowIso(), updated: nowIso()
            };
        });
        return res.ok ? { ok: true, err: null, id: id, project: res.project, notice: res.notice }
                      : res;
    }

    /* Certifying is a person agreeing money is owed, so it takes a name, matching
       decideChangeOrder(). An unnamed certification is a number with nobody behind it. */
    function certifyPayApp(projectId, appId, by) {
        var bad = needModel(); if (bad) return bad;
        var who = text(by, 120);
        if (!who) return { ok: false, err: 'Certifying a payment application needs a name against it.' };
        var app = null, project = null;
        var res = ProjectData.mutate(projectId, function (p) {
            var a = p.pay_apps[appId];
            if (!a || a.deleted_at) throw new Error('No such payment application.');
            if (a.status !== 'submitted') throw new Error('That application was already ' + a.status + '.');
            a.status = 'certified';
            a.certified_by = who;
            a.certified_at = nowIso();
            a.updated = a.certified_at;
            app = a;
        });
        if (!res.ok) return res;
        project = res.project;
        return { ok: true, err: null, project: project,
                 logged: logPayment(project, app, 'certified', who) };
    }

    function rejectPayApp(projectId, appId, reason) {
        var bad = needModel(); if (bad) return bad;
        var why = text(reason, 300);
        if (!why) return { ok: false, err: 'Rejecting a payment application needs a reason.' };
        return ProjectData.mutate(projectId, function (p) {
            var a = p.pay_apps[appId];
            if (!a || a.deleted_at) throw new Error('No such payment application.');
            if (a.status === 'paid') throw new Error('That application has already been paid.');
            a.status = 'rejected';
            a.rejected_reason = why;
            a.updated = nowIso();
        });
    }

    /* NO WAIVER IS REQUIRED HERE, and that is the point. See the header: the cheque is already
       written by the time anybody records it, so refusing the record would only hide the
       exposure rather than prevent it. The payment goes in, and the row lights up as unwaived
       until somebody files the waiver. */
    function recordPayment(projectId, appId, fields) {
        var bad = needModel(); if (bad) return bad;
        var f = fields || {};
        if (!isDay(f.paid_on)) {
            return { ok: false, err: 'A payment needs the date it was made, as YYYY-MM-DD.' };
        }
        var app = null;
        var res = ProjectData.mutate(projectId, function (p) {
            var a = p.pay_apps[appId];
            if (!a || a.deleted_at) throw new Error('No such payment application.');
            if (a.status === 'paid') throw new Error('That application has already been paid.');
            if (a.status !== 'certified') {
                throw new Error('That application has not been certified yet. Certify it first, ' +
                                'so there is a name against the amount that was paid');
            }
            a.status = 'paid';
            a.paid_on = f.paid_on;
            a.paid_ref = text(f.reference, 120);
            a.updated = nowIso();
            app = a;
        });
        if (!res.ok) return res;
        return { ok: true, err: null, project: res.project,
                 logged: logPayment(res.project, app, 'paid', app && app.certified_by),
                 waiver: app && app.waiver };
    }

    function recordWaiver(projectId, appId, kind, fields) {
        var bad = needModel(); if (bad) return bad;
        if (WAIVERS.indexOf(String(kind)) < 0) {
            return { ok: false, err: 'A lien waiver is conditional or unconditional.' };
        }
        if (String(kind) === 'none') {
            return { ok: false, err: 'Recording "none" is not a waiver. Leave it as it is — an ' +
                     'absent waiver already reports as exposure.' };
        }
        var f = fields || {};
        if (f.on !== undefined && f.on !== null && f.on !== '' && !isDay(f.on)) {
            return { ok: false, err: 'A waiver date must be a date, as YYYY-MM-DD.' };
        }
        return ProjectData.mutate(projectId, function (p) {
            var a = p.pay_apps[appId];
            if (!a || a.deleted_at) throw new Error('No such payment application.');
            if (a.status === 'rejected') throw new Error('That application was rejected.');
            /* A conditional waiver after an unconditional one is a step backwards and is almost
               always a misfiling. Refused rather than silently downgrading a released claim. */
            if (a.waiver === 'unconditional' && String(kind) === 'conditional') {
                throw new Error('an unconditional waiver is already on file for this ' +
                                'application, which releases more than a conditional one');
            }
            a.waiver = String(kind);
            a.waiver_on = isDay(f.on) ? f.on : null;
            a.waiver_ref = text(f.ref, 200);
            a.updated = nowIso();
        });
    }

    /* Logged AFTER the write, for the reason project-model.js gives about promotion: a log entry
       with no record is a lie, a record with no log entry is a gap, and a gap is the lesser of
       the two. 'payment' is a registered CrmLog kind that has never had a writer, and the
       timeline already renders it. The kind is checked because KINDS fails closed -- an
       unregistered kind writes nothing and returns { ok:false }, which would be invisible. */
    function logPayment(project, app, what, who) {
        if (typeof CrmLog === 'undefined' || !CrmLog.append) return false;
        if (!project || !project.prospect || !project.prospect.prospect_id || !app) return false;
        var name = null;
        var c = project.contractors && project.contractors[app.contractor_id];
        if (c && c.name) name = c.name;
        var res = CrmLog.append('payment', project.prospect.prospect_id, {
            project_id: project.id, pay_app_id: app.id, contractor_id: app.contractor_id,
            description: (name || 'A contractor') + ' — application ' +
                         (app.number || app.period_to || app.id) + ' ' + what,
            amount: netOf(app), status: what, approved_by: text(who, 120)
        });
        return !!(res && res.ok);
    }

    return {
        STATUSES: STATUSES,
        PAY_STATUSES: PAY_STATUSES,
        WAIVERS: WAIVERS,
        INSURANCE_SOON_DAYS: INSURANCE_SOON_DAYS,
        RANK: RANK,
        contractorsOf: contractorsOf,
        payAppsOf: payAppsOf,
        appsFor: appsFor,
        normalizeContractor: normalizeContractor,
        normalizePayApp: normalizePayApp,
        netOf: netOf,
        variationsFor: variationsFor,
        insuranceDays: insuranceDays,
        position: position,
        register: register,
        exposure: exposure,
        waiversCurrent: waiversCurrent,
        addContractor: addContractor,
        updateContractor: updateContractor,
        removeContractor: removeContractor,
        addPayApp: addPayApp,
        certifyPayApp: certifyPayApp,
        rejectPayApp: rejectPayApp,
        recordPayment: recordPayment,
        recordWaiver: recordWaiver
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ProjectContractors;
