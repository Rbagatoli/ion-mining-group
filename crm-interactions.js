/* ===== The contact log =====
 *
 * What was said, to whom, when, and what I promised to do about it. The core of
 * the CRM: the ranked list tells you where to look, this tells you where you
 * already are.
 *
 * IT WRITES TO CrmLog, not to a store of its own. An interaction is an event on
 * a prospect at a time — the same shape as a stage transition — and it inherits
 * the append-only rule for free. This module is the vocabulary layer: what the
 * fields mean, which values are allowed, and the derived reads that every screen
 * wants.
 *
 * IMMUTABLE, WITH CORRECTIONS. Editing an entry appends a new one that names the
 * one it replaces. You want the real history, including the parts you got wrong
 * — "they said yes" corrected to "they said maybe" is a different record from
 * "they said maybe", and only one of them tells you how the call actually felt
 * at the time.
 *
 * last_contacted_at IS DERIVED, NEVER STORED. A stored copy is a second source
 * of truth that goes stale the moment an entry is corrected or arrives from
 * another device, and staleness is the exact signal it exists to give.
 */
var CrmInteractions = (function () {
    'use strict';

    var TYPES = ['call', 'email', 'meeting', 'site_visit', 'inbound', 'note'];
    var DIRECTIONS = ['outbound', 'inbound', 'n/a'];

    function has(v) { return v !== null && v !== undefined && String(v).trim() !== ''; }

    /* Outcomes come from CrmConfig so they can be added to without a code change;
       these are the fallback when it is not loaded. */
    function outcomeKeys() {
        if (typeof CrmConfig !== 'undefined' && CrmConfig.outcomes) {
            return CrmConfig.outcomes().map(function (o) { return o.key; });
        }
        return ['positive', 'neutral', 'negative', 'no_answer', 'bounced'];
    }

    /* A note is nobody's outbound call, and a type that arrived without a
       direction should say so rather than be guessed at. */
    function defaultDirection(type) {
        if (type === 'inbound') return 'inbound';
        if (type === 'note') return 'n/a';
        return 'outbound';
    }

    /* opts: type, direction, occurred_at, contact_id, contact_person, summary,
             outcome, next_action, next_action_due, attachments */
    function log(prospectId, opts) {
        if (typeof CrmLog === 'undefined') return { ok: false, err: 'The log is not available.' };
        opts = opts || {};
        var type = TYPES.indexOf(opts.type) >= 0 ? opts.type : 'note';
        var dir = DIRECTIONS.indexOf(opts.direction) >= 0 ? opts.direction : defaultDirection(type);
        var outcome = (outcomeKeys().indexOf(opts.outcome) >= 0) ? opts.outcome : null;

        /* A promise with no date is a promise you will not keep, so a next_action
           without a due date is refused rather than filed where nothing will
           surface it. The reverse is fine: a date with no description is a
           reminder, and reminders are useful. */
        if (has(opts.next_action) && !has(opts.next_action_due)) {
            return { ok: false, err: 'What you said you would do needs a date, or it will not resurface.' };
        }

        var payload = {
            interaction_type: type,
            direction: dir,
            /* When it HAPPENED, which is not when it was typed. A call logged the
               next morning is still yesterday's call, and staleness measured from
               the typing would be wrong by a day every time. */
            occurred_at: has(opts.occurred_at) ? opts.occurred_at : new Date().toISOString(),
            contact_id: opts.contact_id || null,
            contact_person: has(opts.contact_person) ? String(opts.contact_person) : null,
            summary: has(opts.summary) ? String(opts.summary) : null,
            outcome: outcome,
            next_action: has(opts.next_action) ? String(opts.next_action) : null,
            next_action_due: has(opts.next_action_due) ? String(opts.next_action_due) : null,
            attachments: Array.isArray(opts.attachments) ? opts.attachments : []
        };

        var res = CrmLog.append('interaction', prospectId, payload);
        if (!res.ok) return res;

        /* LOGGING A PROMISE CREATES THE FOLLOW-UP. The whole point of writing down
           "I said I'd send the gas spec by Friday" is that Friday morning tells
           you. Made here rather than left to the caller so no screen can forget. */
        if (payload.next_action_due && typeof CrmFollowups !== 'undefined' && CrmFollowups.add) {
            CrmFollowups.add({
                prospect_id: prospectId,
                contact_id: payload.contact_id,
                due_date: payload.next_action_due,
                description: payload.next_action || 'Follow up',
                created_from: res.entry.id
            });
        }
        return res;
    }

    function forProspect(prospectId) {
        if (typeof CrmLog === 'undefined') return [];
        return CrmLog.forProspect(prospectId, 'interaction');
    }

    /* The current view of the history: corrected entries replaced by their
       corrections, in the order they happened. */
    function currentFor(prospectId) {
        var all = forProspect(prospectId);
        var superseded = CrmLog.supersededIds();
        return all.filter(function (e) { return !superseded[e.id]; });
    }

    function latest(prospectId) {
        var l = currentFor(prospectId);
        if (!l.length) return null;
        /* Ordered by when it HAPPENED, not when it was written — a call logged
           late is still an older call. */
        return l.slice().sort(function (a, b) {
            var ta = a.occurred_at || a.at, tb = b.occurred_at || b.at;
            if (ta !== tb) return (ta < tb) ? 1 : -1;
            return (b.seq || 0) - (a.seq || 0);
        })[0];
    }

    /* Derived. null means never contacted, which is a different fact from
       "contacted a long time ago" and must not render as the same thing. */
    function lastContactedAt(prospectId) {
        var l = currentFor(prospectId).filter(function (e) {
            return e.interaction_type !== 'note';   // a note to self is not contact
        });
        if (!l.length) return null;
        var best = null;
        for (var i = 0; i < l.length; i++) {
            var t = l[i].occurred_at || l[i].at;
            if (!best || t > best) best = t;
        }
        return best;
    }

    function daysSinceContact(prospectId, nowMs) {
        var t = lastContactedAt(prospectId);
        if (!t) return null;
        var ms = Date.parse(t);
        if (!isFinite(ms)) return null;
        var now = (typeof nowMs === 'number') ? nowMs : Date.now();
        return Math.max(0, Math.floor((now - ms) / 86400000));
    }

    /* A prospect is going quiet when it is in a stage where silence matters and
       has been silent longer than that stage's patience.
       NEVER CONTACTED IS NOT STALE HERE — it is a different problem with a
       different fix, and folding the two would bury the ones that need a first
       call under the ones that need a second. */
    function isStale(prospectId, stage, nowMs) {
        if (typeof CrmConfig === 'undefined') return false;
        if (CrmConfig.activeStageKeys().indexOf(stage) < 0) return false;
        var limit = CrmConfig.staleDaysFor(stage);
        if (limit === null) return false;
        var d = daysSinceContact(prospectId, nowMs);
        if (d === null) return false;
        return d > limit;
    }

    function correct(entryId, patch) {
        if (typeof CrmLog === 'undefined') return { ok: false, err: 'The log is not available.' };
        var prev = CrmLog.get(entryId);
        if (!prev || prev.kind !== 'interaction') return { ok: false, err: 'No such interaction.' };
        var merged = {};
        for (var k in prev) {
            if (!Object.prototype.hasOwnProperty.call(prev, k)) continue;
            if (k === 'id' || k === 'kind' || k === 'prospect_id' || k === 'at' || k === 'seq') continue;
            merged[k] = prev[k];
        }
        for (var j in (patch || {})) merged[j] = patch[j];
        merged.supersedes = entryId;
        return CrmLog.append('interaction', prev.prospect_id, merged);
    }

    return {
        TYPES: TYPES,
        DIRECTIONS: DIRECTIONS,
        log: log,
        correct: correct,
        forProspect: forProspect,
        currentFor: currentFor,
        latest: latest,
        lastContactedAt: lastContactedAt,
        daysSinceContact: daysSinceContact,
        isStale: isStale
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CrmInteractions;
