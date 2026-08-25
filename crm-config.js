/* ===== CRM configuration =====
 *
 * The things that would be painful to change later, kept as data rather than as
 * code: pipeline stages, why deals die, how an interaction went, and how long a
 * prospect may sit before it is stale.
 *
 * WHY THIS IS A STORE AND NOT A CONSTANT. None of these lists is knowable yet.
 * No calls have happened, so nobody knows whether "term sheet" is one stage or
 * three, or whether "gas quality" is the reason deals die or a footnote on
 * "price". A hardcoded enum would need a code change and a data migration the
 * first time reality disagreed; a config table needs neither.
 *
 * SEEDED, NOT EMPTY. An empty pipeline is not a blank slate, it is a broken
 * page. The defaults below are the nine stages the brief specifies, and they are
 * written into storage on first read so the user is editing a real list rather
 * than conjuring one.
 *
 * TONE, NOT COLOUR. Every stage carries a tone -- neutral, active, warm,
 * positive, negative -- and the UI styles the tone. The existing watchlist pills
 * in map.html are keyed to stage NAMES, one CSS rule each, which is exactly the
 * coupling that makes "add a stage" a code change. Five tones cover any number
 * of stages, so a stage somebody adds next year arrives already styled.
 */
var CrmConfig = (function () {
    'use strict';

    var KEY = 'protonCrmConfig';
    var VERSION = 1;

    /* `active` marks the stages where silence is a problem. A prospect nobody
       has looked at yet cannot go stale -- it was never warm. One that has been
       contacted and has not been heard from in three weeks is the entire reason
       this module exists.

       staleDays is per stage on purpose: a week of silence after an outreach
       email is normal, and a week of silence during diligence is not. */
    var DEFAULT_STAGES = [
        { key: 'unreviewed',    label: 'Unreviewed',    tone: 'neutral',  active: false, staleDays: null },
        { key: 'researching',   label: 'Researching',   tone: 'neutral',  active: false, staleDays: null },
        { key: 'contacted',     label: 'Contacted',     tone: 'active',   active: true,  staleDays: 14 },
        { key: 'in_discussion', label: 'In discussion', tone: 'active',   active: true,  staleDays: 10 },
        { key: 'term_sheet',    label: 'Term sheet',    tone: 'warm',     active: true,  staleDays: 10 },
        { key: 'diligence',     label: 'Diligence',     tone: 'warm',     active: true,  staleDays: 14 },
        { key: 'agreement',     label: 'Agreement',     tone: 'warm',     active: true,  staleDays: 7 },
        { key: 'closed_won',    label: 'Closed won',    tone: 'positive', active: false, staleDays: null },
        { key: 'dead',          label: 'Dead',          tone: 'negative', active: false, staleDays: null }
    ];

    /* The highest-value list in the whole build. Knowing that eleven of your
       last twenty died on gas quality and two on price tells you what to screen
       for before the call, which is the difference between a hundred raw
       prospects and ten worth phoning. */
    var DEFAULT_DEAD_REASONS = [
        { key: 'no_response',        label: 'No response' },
        { key: 'declined',           label: 'Declined' },
        { key: 'gas_quality',        label: 'Gas quality' },
        { key: 'already_contracted', label: 'Already contracted' },
        { key: 'price',              label: 'Price' },
        { key: 'timing',             label: 'Timing' },
        { key: 'other',              label: 'Other' }
    ];

    var DEFAULT_OUTCOMES = [
        { key: 'positive', label: 'Positive', tone: 'positive' },
        { key: 'neutral',  label: 'Neutral',  tone: 'neutral' },
        { key: 'negative', label: 'Negative', tone: 'negative' },
        { key: 'no_answer', label: 'No answer', tone: 'neutral' },
        { key: 'bounced',  label: 'Bounced',  tone: 'negative' }
    ];

    function defaults() {
        return {
            _v: VERSION,
            stages: DEFAULT_STAGES.map(clone),
            deadReasons: DEFAULT_DEAD_REASONS.map(clone),
            outcomes: DEFAULT_OUTCOMES.map(clone)
        };
    }

    function clone(o) {
        var c = {};
        for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) c[k] = o[k];
        return c;
    }

    var _cache = null;

    /* A malformed or half-written config falls back to the defaults rather than
       throwing, for the same reason site-model.js does it: a page that will not
       render is worse than a page showing the standard nine stages. */
    function read() {
        if (_cache) return _cache;
        var d = defaults();
        try {
            var raw = localStorage.getItem(KEY);
            if (raw) {
                var parsed = JSON.parse(raw);
                if (parsed && Array.isArray(parsed.stages) && parsed.stages.length) {
                    d.stages = parsed.stages.filter(function (s) { return s && s.key; });
                }
                if (parsed && Array.isArray(parsed.deadReasons) && parsed.deadReasons.length) {
                    d.deadReasons = parsed.deadReasons.filter(function (r) { return r && r.key; });
                }
                if (parsed && Array.isArray(parsed.outcomes) && parsed.outcomes.length) {
                    d.outcomes = parsed.outcomes.filter(function (o) { return o && o.key; });
                }
            }
        } catch (e) { /* defaults stand */ }
        _cache = d;
        return _cache;
    }

    /* Returns { ok, err } like SiteData.saveData does, and for the same reason:
       a write that failed while the UI said "Saved" is how a record is lost
       without anybody being told. */
    function write(cfg) {
        var res = { ok: true, err: null };
        try {
            localStorage.setItem(KEY, JSON.stringify(cfg));
            _cache = cfg;
        } catch (e) {
            res.ok = false;
            res.err = (e && (e.name === 'QuotaExceededError' || e.code === 22))
                ? 'Local storage is full — this was NOT saved.'
                : 'Could not save the pipeline configuration.';
            return res;
        }
        if (typeof SyncEngine !== 'undefined' && SyncEngine.save) {
            try { SyncEngine.save('crmConfig'); } catch (e) { /* local write already succeeded */ }
        }
        return res;
    }

    // ---- Stages -------------------------------------------------------------
    function stages() { return read().stages.map(clone); }
    function stageKeys() { return read().stages.map(function (s) { return s.key; }); }

    function stage(key) {
        var list = read().stages;
        for (var i = 0; i < list.length; i++) if (list[i].key === key) return clone(list[i]);
        return null;
    }

    function stageLabel(key) {
        var s = stage(key);
        return s ? s.label : (key || '');
    }

    function stageTone(key) {
        var s = stage(key);
        return s ? (s.tone || 'neutral') : 'neutral';
    }

    /* The stages where a prospect can go quiet in a way that matters. Phase 3's
       "going stale" list reads exactly this rather than a second hardcoded set,
       so widening the definition is one edit in one place. */
    function activeStageKeys() {
        return read().stages
            .filter(function (s) { return s.active === true; })
            .map(function (s) { return s.key; });
    }

    function staleDaysFor(key) {
        var s = stage(key);
        return (s && typeof s.staleDays === 'number') ? s.staleDays : null;
    }

    function setStages(list) {
        if (!Array.isArray(list) || !list.length) return { ok: false, err: 'A pipeline needs at least one stage.' };
        var seen = {}, out = [];
        for (var i = 0; i < list.length; i++) {
            var s = list[i];
            if (!s || !s.key) continue;
            if (seen[s.key]) continue;               // a duplicate key would make two columns one
            seen[s.key] = true;
            out.push({
                key: String(s.key),
                label: s.label ? String(s.label) : String(s.key),
                tone: s.tone || 'neutral',
                active: s.active === true,
                staleDays: (typeof s.staleDays === 'number' && s.staleDays > 0) ? s.staleDays : null
            });
        }
        if (!out.length) return { ok: false, err: 'A pipeline needs at least one stage.' };
        var cfg = read();
        cfg.stages = out;
        var res = write(cfg);
        if (res.ok) publish();
        return res;
    }

    // ---- Dead reasons and outcomes -----------------------------------------
    function deadReasons() { return read().deadReasons.map(clone); }
    function deadReasonLabel(key) {
        var list = read().deadReasons;
        for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i].label;
        return key || '';
    }
    function isDeadReason(key) {
        var list = read().deadReasons;
        for (var i = 0; i < list.length; i++) if (list[i].key === key) return true;
        return false;
    }
    function outcomes() { return read().outcomes.map(clone); }

    /* site-model.js validates every stage it is given and silently rewrites
       anything it does not recognise back to 'unreviewed'. That guard is right --
       it is what stops a typo becoming a pipeline state -- but it means the
       moment stages become configurable, a user-added stage would be erased the
       next time the record was saved. So the configured list is pushed INTO the
       model rather than the model being taught to reach out for it, which keeps
       site-model.js standalone and testable exactly as it is today. */
    function publish() {
        if (typeof SiteData !== 'undefined' && SiteData.registerStages) {
            SiteData.registerStages(stageKeys());
        }
    }

    function reset() { _cache = null; }

    return {
        KEY: KEY,
        defaults: defaults,
        stages: stages,
        stageKeys: stageKeys,
        stage: stage,
        stageLabel: stageLabel,
        stageTone: stageTone,
        activeStageKeys: activeStageKeys,
        staleDaysFor: staleDaysFor,
        setStages: setStages,
        deadReasons: deadReasons,
        deadReasonLabel: deadReasonLabel,
        isDeadReason: isDeadReason,
        outcomes: outcomes,
        publish: publish,
        reset: reset
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CrmConfig;
