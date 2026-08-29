/* ===== Procurement schedule (Stage 6) =====
 *
 * One question: on any given morning, what should already have been ordered?
 *
 * A build has a date it has to make power on — the project's target_energization — and a
 * handful of things with lead times long enough that the order date is nowhere near the date
 * you need them. A genset quoted at 44 weeks against an energisation eleven months out has
 * about three weeks of slack; nobody works that out in their head reliably, and the answer
 * changes every day whether or not anyone looks.
 *
 * THE ARITHMETIC IS THE PRODUCT. There is no clever part here and that is the point: the whole
 * module is need-by minus lead time, compared against today. What makes it worth its own file
 * with its own tests is that every one of those three inputs has a way of being absent, and
 * the tempting default for each is the one that reads as reassuring:
 *
 *   - a missing lead time defaulted to zero says "order it the day you need it"
 *   - a missing need-by defaulted to today says "order it now", on every item, forever
 *   - an unsigned day count says something due in five weeks is five weeks LATE
 *
 * All three produce a confident number rather than a crash, which is the failure mode this
 * codebase keeps finding. So anything that cannot be computed is null and states itself as
 * 'unknown', and 'unknown' is never folded in with 'scheduled'. A schedule that admits it does
 * not know about four items is usable. One that quietly calls them fine is not.
 *
 * ONE COMPARATOR, AND IT IS NOT THIS FILE'S. Day arithmetic already exists in
 * CrmFollowups.daysOverdue(), it is signed, and as of the commit before this one it has a test
 * file. Re-deriving it here would give the workspace two implementations of "how late is this"
 * that agree until a timezone or a month boundary makes them disagree. This calls it with a
 * synthetic { due_date }, so the order-by date is late in exactly the sense a follow-up is.
 *
 * WHERE THE ITEMS LIVE. In the project record's `procurement` collection, which
 * project-model.js creates empty at promotion for this.
 *
 * THE READS TOOK NO STORAGE AND THE WRITES GO THROUGH ProjectData.mutate(). The first version
 * of this file said it owned no storage at all and reached for none, which was true and left
 * the schedule with no way to put anything on it: nothing in the repo wrote
 * `project.procurement`, so the panel reported "nothing on the schedule yet" on every project,
 * permanently. That is the same OUTCOME as the array-shaped-collection bug this module already
 * had -- a panel reporting emptiness forever -- reached from the other end, and no test caught
 * it because every module involved was correct on its own.
 *
 * The reason given for owning no storage was that it "keeps one writer for the project
 * document". Going through ProjectData.mutate() keeps that promise exactly: mutate() IS the one
 * writer, it normalizes and commits, and project-budget.js and project-contractors.js both write
 * their collections through it and stay testable behind the same localStorage shim. The reads
 * below still take a project and return derived values, so the arithmetic is unchanged.
 */
var ProjectProcurement = (function () {
    'use strict';

    /* 'quoted' sits between planned and ordered because a quote is what makes a lead time real.
       Until then the number in lead_time_weeks is a catalogue figure or a guess. */
    var STATUSES = ['planned', 'quoted', 'ordered', 'delivered', 'cancelled'];

    /* Once it is on order the order date has been met, whatever it says. These states are not
       late and cannot become late; the schedule stops nagging about them. */
    var SETTLED = ['ordered', 'delivered', 'cancelled'];

    /* Thirty days, because that is roughly the span in which a purchase order can still be
       raised without expediting: quotes refreshed, PO cut, deposit released. Inside it the item
       needs attention this month rather than this quarter. It is a display band, not a rule —
       nothing is refused on it. */
    var DUE_SOON_DAYS = 30;

    var MS_PER_DAY = 86400000;

    function isDay(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v); }

    function text(v) { return (typeof v === 'string' && v) ? v : ''; }

    /* A lead time is weeks, positive, finite. Zero is allowed and means genuinely off-the-shelf;
       it is a different statement from absent, and only absent is unknown. */
    function leadWeeks(item) {
        if (!item) return null;
        var v = item.lead_time_weeks;
        if (v === null || v === undefined || v === '') return null;
        var n = Number(v);
        if (!isFinite(n) || n < 0) return null;
        return n;
    }

    /* The date this item has to be on site. Its own need_by wins over the project's
       energisation date, because long-lead kit is often needed before power-on — a transformer
       has to be set before the containers that connect to it. */
    function needBy(item, project) {
        if (item && isDay(item.need_by)) return item.need_by;
        if (project && isDay(project.target_energization)) return project.target_energization;
        return null;
    }

    /* Need-by minus lead time. Null if either is unknown, and null is the whole point: see the
       header. Computed in UTC because the inputs are calendar days with no zone, and mixing a
       local Date with a Z-parsed one is how a schedule slips by one day for half the year. */
    function orderBy(item, project) {
        var need = needBy(item, project);
        var weeks = leadWeeks(item);
        if (!need || weeks === null) return null;
        var t = Date.parse(need + 'T00:00:00Z');
        if (!isFinite(t)) return null;
        return new Date(t - weeks * 7 * MS_PER_DAY).toISOString().slice(0, 10);
    }

    /* Signed, and borrowed. Positive means the order date has passed, which is the same sense
       CrmFollowups uses for a follow-up. Negative is days of slack remaining. */
    function daysLate(item, project, nowMs) {
        var by = orderBy(item, project);
        if (!by) return null;
        if (typeof CrmFollowups === 'undefined' || !CrmFollowups.daysOverdue) return null;
        return CrmFollowups.daysOverdue({ due_date: by }, nowMs);
    }

    /* Long-lead kit that cannot be ordered until the air permit is issued. project-gates.js
       already decides what "issued" means — complete, evidenced by a document, not waived — and
       this asks it rather than re-reading the deliverable. An item that is blocked is reported
       as blocked even when it is also late, because "you are three weeks past the order date
       and you still cannot place the order" is the situation worth seeing. */
    function permitBlocked(item, project) {
        if (!item || !item.permit_required) return false;
        if (typeof ProjectGates === 'undefined' || !ProjectGates.permitIssued) return false;
        return !ProjectGates.permitIssued(project);
    }

    /* One state per item, in the order that matters most to least. */
    function state(item, project, nowMs) {
        if (!item) return 'unknown';
        var st = text(item.status) || 'planned';
        if (st === 'cancelled') return 'cancelled';
        if (st === 'delivered') return 'delivered';
        if (st === 'ordered') return 'ordered';

        var late = daysLate(item, project, nowMs);
        if (late === null) return 'unknown';
        if (permitBlocked(item, project)) return 'blocked';
        if (late > 0) return 'late';
        if (late > -DUE_SOON_DAYS) return 'due_soon';
        return 'scheduled';
    }

    /* Carries unknown keys through, for the reason normalizeProject() gives: a browser running
       an older build must not strip fields it has not heard of and write the stripped item
       back. This fills what is missing and coerces what it owns. */
    function normalizeItem(partial) {
        var src = (partial && typeof partial === 'object') ? partial : {};
        var it = {};
        for (var k in src) {
            if (Object.prototype.hasOwnProperty.call(src, k)) it[k] = src[k];
        }
        it.id = text(it.id);
        it.description = text(it.description);
        it.vendor = text(it.vendor);
        it.need_by = isDay(it.need_by) ? it.need_by : null;
        var w = leadWeeks(it);
        it.lead_time_weeks = (w === null) ? null : w;
        it.status = (STATUSES.indexOf(text(it.status)) >= 0) ? it.status : 'planned';
        it.permit_required = !!it.permit_required;
        return it;
    }

    /* A MAP KEYED BY ID, NOT AN ARRAY, and reading the wrong one is silent.
     *
     * project-model.js keeps every per-project collection as a map because sync.js writes each
     * store with ref.set(payload, { merge: true }), and merge deep-merges maps while replacing
     * arrays wholesale: as an array, two devices each adding a genset produce a document with
     * one of them and no error. normalizeProject() enforces it — an array in `procurement` is
     * discarded and replaced with {} on the next write.
     *
     * The first version of this function read an array. It returned [] for every real project,
     * so the panel showed "nothing on the schedule yet" forever, and fifty tests passed because
     * every one of them built its own array fixture. A fixture the test invents cannot disagree
     * with the module about the shape; only the real normalizer can, which is why one test now
     * runs a project through it.
     *
     * Arrays are NOT accepted here as a kindness. Storage cannot produce one, so tolerating it
     * would only hide the same mistake in the next caller. */
    function itemsOf(project) {
        var m = project && project.procurement;
        if (!m || typeof m !== 'object' || Array.isArray(m)) return [];
        var out = [];
        for (var k in m) {
            if (Object.prototype.hasOwnProperty.call(m, k)) {
                var it = m[k];
                if (it && typeof it === 'object') {
                    /* A TOMBSTONE, NOT A KEY REMOVAL, so removeItem() has to be skipped here.
                       Firestore's merge cannot express a key removal, so a deleted item returns
                       on the next pull with no sign it was ever removed. Matching
                       ProjectBudget.lines() and ProjectContractors' reader. */
                    if (it.deleted_at) continue;
                    /* The map key is the identity. An item whose own id disagrees with the key
                       it is filed under would sort and render under one and be written back
                       under the other. */
                    if (!it.id) { it = Object.assign({}, it, { id: String(k) }); }
                    out.push(it);
                }
            }
        }
        return out;
    }

    /* The morning view: every item with its derived dates, worst first.
     *
     * Sort order is late before blocked before due_soon, then by how late. 'unknown' sorts
     * directly after the actionable states rather than at the bottom, because an item nobody
     * can schedule is a question for today, not a footnote. Settled items sink. */
    var RANK = { late: 0, blocked: 1, due_soon: 2, unknown: 3, scheduled: 4,
                 ordered: 5, delivered: 6, cancelled: 7 };

    function schedule(project, nowMs) {
        return itemsOf(project).map(function (raw) {
            var it = normalizeItem(raw);
            var s = state(it, project, nowMs);
            return {
                item: it,
                need_by: needBy(it, project),
                order_by: orderBy(it, project),
                days_late: daysLate(it, project, nowMs),
                permit_blocked: permitBlocked(it, project),
                state: s
            };
        }).sort(function (a, b) {
            var ra = RANK[a.state], rb = RANK[b.state];
            if (ra !== rb) return ra - rb;
            var la = (a.days_late === null) ? -1e9 : a.days_late;
            var lb = (b.days_late === null) ? -1e9 : b.days_late;
            return lb - la;
        });
    }

    /* A count per state, for a badge. Every state key is present even at zero, so a caller can
       render a row without checking existence and a zero reads as zero rather than absent. */
    function summary(project, nowMs) {
        var out = {};
        for (var k in RANK) if (Object.prototype.hasOwnProperty.call(RANK, k)) out[k] = 0;
        schedule(project, nowMs).forEach(function (r) { out[r.state] = (out[r.state] || 0) + 1; });
        return out;
    }

    // ---- writes, all through ProjectData.mutate() --------------------------------------

    function newId() {
        var s = '';
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            var a = new Uint8Array(6);
            crypto.getRandomValues(a);
            for (var i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2);
        } else { s = 'noRng' + Date.now().toString(36); }
        return 'pi_' + s;
    }
    function nowIso() { return new Date().toISOString(); }
    function trim(v, max) {
        if (v === null || v === undefined) return null;
        var s = String(v).trim();
        if (!s) return null;
        return max ? s.slice(0, max) : s;
    }
    function needModel() {
        return (typeof ProjectData === 'undefined' || !ProjectData.mutate)
            ? { ok: false, err: 'The project model is not loaded.' } : null;
    }

    /* ONLY THE DESCRIPTION IS REQUIRED, and the lead time deliberately is not.
     *
     * The header argues that a missing lead time must read as 'unknown' rather than as zero,
     * which only means anything if a missing one can actually be recorded. Refusing the item
     * until somebody has a number would push the genset nobody has quoted yet off the schedule
     * entirely -- and an item that is not on the schedule is not unknown, it is invisible. The
     * one the buyer has not chased is exactly the one worth seeing. */
    function addItem(projectId, fields) {
        var bad = needModel(); if (bad) return bad;
        var f = fields || {};
        var desc = trim(f.description, 300);
        if (!desc) return { ok: false, err: 'An item needs a description.' };
        if (f.lead_time_weeks !== undefined && f.lead_time_weeks !== null &&
            f.lead_time_weeks !== '' && leadWeeks(f) === null) {
            return { ok: false, err: 'A lead time is a number of weeks and cannot be negative.' };
        }
        if (f.need_by !== undefined && f.need_by !== null && f.need_by !== '' && !isDay(f.need_by)) {
            return { ok: false, err: 'A need-by date must be a date, as YYYY-MM-DD.' };
        }
        if (f.status !== undefined && f.status !== null && f.status !== '' &&
            STATUSES.indexOf(String(f.status)) < 0) {
            return { ok: false, err: 'Unknown status: ' + f.status + '.' };
        }
        var id = newId();
        var res = ProjectData.mutate(projectId, function (p) {
            p.procurement[id] = normalizeItem({
                id: id,
                description: desc,
                vendor: trim(f.vendor, 120) || '',
                lead_time_weeks: leadWeeks(f),
                need_by: isDay(f.need_by) ? f.need_by : null,
                permit_required: !!f.permit_required,
                status: STATUSES.indexOf(String(f.status)) >= 0 ? String(f.status) : 'planned',
                created: nowIso(), updated: nowIso()
            });
        });
        return res.ok ? { ok: true, err: null, id: id, project: res.project, notice: res.notice }
                      : res;
    }

    var EDITABLE = ['description', 'vendor', 'lead_time_weeks', 'need_by', 'permit_required'];

    function updateItem(projectId, itemId, patch) {
        var bad = needModel(); if (bad) return bad;
        var p0 = patch || {};
        for (var k in p0) {
            if (!Object.prototype.hasOwnProperty.call(p0, k)) continue;
            /* Refused by NAME rather than stripped, matching ProjectData.update(). status is not
               here on purpose: it moves through setStatus(), which is the one that knows what
               ordering against an unissued permit means. */
            if (EDITABLE.indexOf(k) < 0) {
                return { ok: false, err: k + ' cannot be changed through updateItem().' };
            }
        }
        if (Object.prototype.hasOwnProperty.call(p0, 'description') && !trim(p0.description, 300)) {
            return { ok: false, err: 'An item needs a description.' };
        }
        if (Object.prototype.hasOwnProperty.call(p0, 'need_by') &&
            p0.need_by !== null && !isDay(p0.need_by)) {
            return { ok: false, err: 'A need-by date must be a date, as YYYY-MM-DD.' };
        }
        if (Object.prototype.hasOwnProperty.call(p0, 'lead_time_weeks') &&
            p0.lead_time_weeks !== null && leadWeeks(p0) === null) {
            return { ok: false, err: 'A lead time is a number of weeks and cannot be negative.' };
        }
        return ProjectData.mutate(projectId, function (p) {
            var it = p.procurement[itemId];
            if (!it || it.deleted_at) throw new Error('No such item.');
            for (var i = 0; i < EDITABLE.length; i++) {
                if (Object.prototype.hasOwnProperty.call(p0, EDITABLE[i])) {
                    it[EDITABLE[i]] = p0[EDITABLE[i]];
                }
            }
            p.procurement[itemId] = normalizeItem(it);
            p.procurement[itemId].updated = nowIso();
        });
    }

    /* ORDERING AGAINST AN UNISSUED PERMIT IS ALLOWED, AND SAID OUT LOUD.
     *
     * The temptation is to refuse it, since blocked is the state this module invented to make
     * that situation visible. But people do place deposits at risk, deliberately, and refusing
     * would not stop the purchase order -- it would stop the RECORD of it, and an item recorded
     * as still planned when the deposit is gone is worse than one recorded as ordered early.
     * Same argument ProjectContractors.recordPayment() makes about a cheque that is already
     * written. The move goes through and the caller is handed a notice naming what was stepped
     * over, so it can be shown rather than discovered. */
    function setStatus(projectId, itemId, status) {
        var bad = needModel(); if (bad) return bad;
        if (STATUSES.indexOf(String(status)) < 0) {
            return { ok: false, err: 'Unknown status: ' + status + '.' };
        }
        var warn = null;
        var res = ProjectData.mutate(projectId, function (p) {
            var it = p.procurement[itemId];
            if (!it || it.deleted_at) throw new Error('No such item.');
            if (String(status) === 'ordered' && permitBlocked(normalizeItem(it), p)) {
                warn = 'Recorded as ordered. The air permit is not issued yet, so this was ' +
                       'ordered at risk — the deposit is exposed if the permit changes the ' +
                       'specification.';
            }
            it.status = String(status);
            it.updated = nowIso();
        });
        if (!res.ok) return res;
        return { ok: true, err: null, project: res.project, notice: warn || res.notice };
    }

    /* A tombstone, for the reason project-model.js gives: Firestore's merge cannot express a key
       removal, so a deleted item returns on the next pull with no record of having gone. */
    function removeItem(projectId, itemId, reason) {
        var bad = needModel(); if (bad) return bad;
        return ProjectData.mutate(projectId, function (p) {
            var it = p.procurement[itemId];
            if (!it || it.deleted_at) throw new Error('No such item.');
            if (it.status === 'ordered' || it.status === 'delivered') {
                throw new Error('this item is already ' + it.status + '. Cancel it instead, so ' +
                                'the schedule still shows that it was bought');
            }
            it.deleted_at = nowIso();
            it.deleted_reason = trim(reason, 300);
            it.updated = it.deleted_at;
        });
    }

    return {
        STATUSES: STATUSES,
        SETTLED: SETTLED,
        DUE_SOON_DAYS: DUE_SOON_DAYS,
        addItem: addItem,
        updateItem: updateItem,
        setStatus: setStatus,
        removeItem: removeItem,
        leadWeeks: leadWeeks,
        needBy: needBy,
        orderBy: orderBy,
        daysLate: daysLate,
        permitBlocked: permitBlocked,
        state: state,
        normalizeItem: normalizeItem,
        schedule: schedule,
        summary: summary
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ProjectProcurement;
