/* ===== Follow-ups =====
 *
 * Nothing kills a pipeline like a forgotten callback.
 *
 * NOT IN CrmLog, and that is the distinction worth holding: the log is what
 * happened and is true forever; a follow-up is a thing that has not happened
 * yet, and its whole life is changing state — pending, done, snoozed, cancelled.
 * An append-only store would make "mark done" a new record and the current state
 * a query, which is the wrong shape for the one screen that has to be instant
 * every morning.
 *
 * They are still traceable: created_from carries the interaction that produced
 * one, so "why am I calling this person on Friday" has an answer.
 */
var CrmFollowups = (function () {
    'use strict';

    var KEY = 'protonCrmFollowups';
    var VERSION = 1;
    var STATUSES = ['pending', 'done', 'snoozed', 'cancelled'];

    var _cache = null;

    function empty() { return { _v: VERSION, seq: 0, items: [] }; }

    function read() {
        if (_cache) return _cache;
        try {
            var raw = localStorage.getItem(KEY);
            if (raw) {
                var parsed = JSON.parse(raw);
                if (parsed && Array.isArray(parsed.items)) { _cache = parsed; return _cache; }
            }
        } catch (e) { /* fall through */ }
        _cache = empty();
        return _cache;
    }

    function write(data) {
        var res = { ok: true, err: null };
        try {
            localStorage.setItem(KEY, JSON.stringify(data));
            _cache = data;
        } catch (e) {
            res.ok = false;
            res.err = (e && (e.name === 'QuotaExceededError' || e.code === 22))
                ? 'Local storage is full — this follow-up was NOT saved.'
                : 'Could not save this follow-up.';
            return res;
        }
        if (typeof SyncEngine !== 'undefined' && SyncEngine.save) {
            try { SyncEngine.save('crmFollowups'); } catch (e) { /* local write stands */ }
        }
        return res;
    }

    function newId(data) {
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            var a = new Uint8Array(8), s = '';
            crypto.getRandomValues(a);
            for (var i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2);
            return 'f_' + s;
        }
        data.seq = (data.seq || 0) + 1;
        return 'f_seq' + data.seq;
    }

    /* Dates are compared as YYYY-MM-DD strings throughout. A follow-up is due on
       a DAY, not at an instant — "call them Friday" does not mean 09:00 — and
       string comparison on that format sorts correctly, needs no timezone, and
       cannot drift the way a Date round-trip does. */
    function today(nowMs) {
        var d = (typeof nowMs === 'number') ? new Date(nowMs) : new Date();
        return d.getFullYear() + '-' +
               ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
               ('0' + d.getDate()).slice(-2);
    }

    function dayOf(v) {
        if (!v) return null;
        var s = String(v);
        return s.length >= 10 ? s.slice(0, 10) : s;
    }

    function add(partial) {
        partial = partial || {};
        if (!partial.prospect_id) return null;
        var due = dayOf(partial.due_date);
        if (!due) return null;                 // a follow-up with no date never resurfaces
        var data = read();
        var item = {
            id: newId(data),
            prospect_id: String(partial.prospect_id),
            contact_id: partial.contact_id || null,
            due_date: due,
            description: partial.description ? String(partial.description) : 'Follow up',
            status: 'pending',
            created_from: partial.created_from || null,
            created: new Date().toISOString(),
            completed_at: null,
            /* Kept so a snoozed item can still be shown against what was
                originally promised rather than quietly sliding forever. */
            original_due: due
        };
        data.items.push(item);
        return write(data).ok ? item : null;
    }

    function list() { return read().items; }

    function get(id) {
        var l = list();
        for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
        return null;
    }

    function setStatus(id, status, opts) {
        if (STATUSES.indexOf(status) < 0) return null;
        var data = read();
        for (var i = 0; i < data.items.length; i++) {
            if (data.items[i].id !== id) continue;
            data.items[i].status = status;
            data.items[i].completed_at = (status === 'done') ? new Date().toISOString() : null;
            if (status === 'snoozed') {
                var to = dayOf(opts && opts.until);
                if (!to) return null;          // snoozed to nowhere is just lost
                data.items[i].due_date = to;
            }
            return write(data).ok ? data.items[i] : null;
        }
        return null;
    }

    function done(id) { return setStatus(id, 'done'); }
    function snooze(id, until) { return setStatus(id, 'snoozed', { until: until }); }
    function cancel(id) { return setStatus(id, 'cancelled'); }

    function pending() {
        return list().filter(function (f) {
            return f.status === 'pending' || f.status === 'snoozed';
        });
    }

    function forProspect(prospectId) {
        var id = String(prospectId);
        return list().filter(function (f) { return f.prospect_id === id; });
    }

    /* The next thing owed on a prospect, for the board card and the table row. */
    function nextFor(prospectId) {
        var l = pending().filter(function (f) { return f.prospect_id === String(prospectId); });
        if (!l.length) return null;
        return l.slice().sort(function (a, b) {
            return a.due_date < b.due_date ? -1 : (a.due_date > b.due_date ? 1 : 0);
        })[0];
    }

    /* Most overdue first — the one that has been waiting longest is the one that
       has done the most damage. */
    function overdue(nowMs) {
        var t = today(nowMs);
        return pending().filter(function (f) { return f.due_date < t; })
            .sort(function (a, b) { return a.due_date < b.due_date ? -1 : (a.due_date > b.due_date ? 1 : 0); });
    }

    function dueToday(nowMs) {
        var t = today(nowMs);
        return pending().filter(function (f) { return f.due_date === t; });
    }

    function daysOverdue(item, nowMs) {
        if (!item || !item.due_date) return null;
        var due = Date.parse(item.due_date + 'T00:00:00Z');
        var now = Date.parse(today(nowMs) + 'T00:00:00Z');
        if (!isFinite(due) || !isFinite(now)) return null;
        return Math.round((now - due) / 86400000);
    }

    function reset() { _cache = null; }

    return {
        KEY: KEY,
        STATUSES: STATUSES,
        today: today,
        dayOf: dayOf,
        add: add,
        list: list,
        get: get,
        setStatus: setStatus,
        done: done,
        snooze: snooze,
        cancel: cancel,
        pending: pending,
        forProspect: forProspect,
        nextFor: nextFor,
        overdue: overdue,
        dueToday: dueToday,
        daysOverdue: daysOverdue,
        reset: reset
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CrmFollowups;
