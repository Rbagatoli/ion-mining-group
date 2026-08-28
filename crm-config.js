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

    /* THE RESEARCH THAT COMPOUNDS. Every landfill worked out now -- who owns it,
       who to ring, whether there is already a genset on it -- is work not repeated
       later, and it is the only part of this build that pays while waiting for
       capital rather than for a phone call to be returned.

       PER SOURCE TYPE, because the questions genuinely differ. You ask a landfill
       who holds the permit and whether the collection system is real; you ask a
       wellpad whose lease it is and what the decline curve looks like. One shared
       list would be half irrelevant on both.

       Keyed on the candidate's energyType, with a fallback list for sources that
       have no checklist of their own -- a new adapter should surface a short
       generic list rather than an empty one that reads as "nothing to do". */
    var DEFAULT_CHECKLISTS = {
        landfill_gas: [
            { key: 'owner',        label: 'Owner identified' },
            { key: 'ops_contact',  label: 'Operations contact named' },
            { key: 'direct',       label: 'Direct contact obtained' },
            { key: 'echo',         label: 'ECHO permit status checked' },
            { key: 'ghgrp',        label: 'GHGRP trend reviewed' },
            { key: 'aerial',       label: 'Aerial imagery reviewed for existing generation' },
            { key: 'collection',   label: 'Collection system corroborated' },
            { key: 'interconnect', label: 'Grid interconnect located' },
            { key: 'ownership',    label: 'Ownership type determined (public vs private)' }
        ],
        flare_gas: [
            { key: 'operator',     label: 'Operator identified' },
            { key: 'facility_id',  label: 'Well or facility ID located' },
            { key: 'production',   label: 'Production history pulled' },
            { key: 'decline',      label: 'Decline curve assessed' },
            { key: 'size_class',   label: 'Operator size class determined' },
            { key: 'surface',      label: 'Surface rights owner identified' }
        ],
        _default: [
            { key: 'owner',        label: 'Owner identified' },
            { key: 'direct',       label: 'Direct contact obtained' },
            { key: 'permit',       label: 'Permit status checked' },
            { key: 'interconnect', label: 'Grid interconnect located' }
        ]
    };

    /* NOT APPLICABLE IS NOT COMPLETE, and keeping them apart is the whole reason
       this is four states rather than a checkbox. A landfill with no GHGRP filing
       has nothing to review there; counting that as done would inflate the
       percentage, and counting it as outstanding would make a site that is
       finished look permanently unfinished. It comes out of the denominator. */
    var DEFAULT_ENRICH_STATUSES = [
        { key: 'not_started', label: 'Not started', tone: 'neutral' },
        { key: 'in_progress', label: 'In progress', tone: 'active' },
        { key: 'complete',    label: 'Complete',    tone: 'positive' },
        { key: 'na',          label: 'Not applicable', tone: 'neutral' }
    ];

    /* WHAT PAPER A DEAL ACCUMULATES. `expected` is the only interesting field:
       it marks the ones whose ABSENCE is worth saying out loud on the summary --
       walking into a site visit without a signed NDA on file is a thing to know
       before you are standing in the parking lot. It is not a blocker and not a
       checklist; a deal can close having never produced a utility quote.

       Configurable because the answer differs by structure. A gas purchase needs
       a gas analysis and a surface lease; a revenue share needs neither and needs
       an operating-cost schedule instead, and hardcoding the first set would make
       the second look permanently incomplete. */
    var DEFAULT_DOCUMENT_KINDS = [
        { key: 'nda',           label: 'NDA',                  expected: true },
        { key: 'gas_analysis',  label: 'Gas analysis',         expected: true },
        { key: 'term_sheet',    label: 'Term sheet',           expected: false },
        { key: 'agreement',     label: 'Executed agreement',   expected: false },
        { key: 'surface',       label: 'Surface lease / access', expected: false },
        { key: 'title',         label: 'Land title',           expected: false },
        { key: 'utility',       label: 'Utility quote',        expected: false },
        { key: 'permit',        label: 'Permit or approval',   expected: false },
        { key: 'correspondence', label: 'Correspondence',      expected: false },
        { key: 'other',         label: 'Other',                expected: false }
    ];

    var DEFAULT_OUTCOMES = [
        { key: 'positive', label: 'Positive', tone: 'positive' },
        { key: 'neutral',  label: 'Neutral',  tone: 'neutral' },
        { key: 'negative', label: 'Negative', tone: 'negative' },
        { key: 'no_answer', label: 'No answer', tone: 'neutral' },
        { key: 'bounced',  label: 'Bounced',  tone: 'negative' }
    ];

    /* SCALARS, kept apart from the lists above because they are a different kind
       of thing: a list is a vocabulary the UI offers, and these are thresholds
       that decide when the app says something is wrong. Both belong in config for
       the same reason -- they are guesses, and a guess hardcoded in three places
       is a guess nobody can revise. */
    var DEFAULT_SETTINGS = {
        /* How long a checked phone number or email stays believable. No evidence
           behind 365 beyond "a year is a long time in a county office". */
        contactVerifyDays: 365
    };

    function defaults() {
        return {
            _v: VERSION,
            stages: DEFAULT_STAGES.map(clone),
            deadReasons: DEFAULT_DEAD_REASONS.map(clone),
            outcomes: DEFAULT_OUTCOMES.map(clone),
            checklists: cloneChecklists(DEFAULT_CHECKLISTS),
            enrichStatuses: DEFAULT_ENRICH_STATUSES.map(clone),
            documentKinds: DEFAULT_DOCUMENT_KINDS.map(clone),
            gateDeliverables: cloneChecklists(DEFAULT_GATE_DELIVERABLES),
            settings: clone(DEFAULT_SETTINGS)
        };
    }

    /* ===== WHAT EACH BUILD GATE REQUIRES ==================================================
     *
     * A SECOND VOCABULARY ALONGSIDE documentKinds, NOT A REPLACEMENT FOR IT, and the CRM's
     * document semantics are untouched. The distinction is the whole reason both exist:
     *
     *   documentKinds says what paper a DEAL accumulates, and its `expected` flag is explicitly
     *   "not a blocker and not a checklist" -- a deal of unknown structure should not have
     *   blockers, because a revenue share needs neither a gas analysis nor a surface lease.
     *
     *   This says what a BUILD requires, and here blocking is correct, because a promoted
     *   project is one known structure and the sequence is physical rather than procedural. You
     *   cannot specify gas treatment before you know the siloxane level, and ordering gensets
     *   against an unissued air permit is how deposits are lost.
     *
     * Two objects, two rules, no conflict. The project gate READS the same documents through
     * CrmDocuments and applies its own blocking rule on top.
     *
     * FIELDS.
     *   blocking          the gate cannot be left until this is complete or explicitly waived
     *   requires_document a completion claim is not enough; a document must be on file. Only
     *                     used where the paper IS the fact -- an air permit that is "complete"
     *                     with nothing attached is somebody's recollection.
     *   evidence_kind     which CrmDocuments kind satisfies it, so the check reads the existing
     *                     register rather than a parallel one.
     *
     * Configurable for the same reason everything else here is: these are this operator's build
     * sequence, met once, and the first real project will disagree with some of it.
     */
    var DEFAULT_GATE_DELIVERABLES = {
        target_screen: [],

        contact_loi: [
            { key: 'nda',        label: 'Mutual NDA executed', blocking: true,
              requires_document: true, evidence_kind: 'nda' },
            /* Not just "an LOI": the five terms below are what makes one worth having, and a
               letter missing exclusivity is the one that lets somebody else diligence the site
               you are paying to diligence. */
            { key: 'loi',        label: 'LOI covering price basis, volume, term, access and exclusivity',
              blocking: true, requires_document: true, evidence_kind: 'term_sheet' },
            { key: 'exclusivity', label: 'Exclusivity period executed', blocking: true }
        ],

        diligence: [
            /* THE THREE HARD BLOCKS. Each is a fact that cannot be inferred and that changes
               whether the deal works at all. */
            { key: 'gas_composition',
              label: 'Gas composition — methane, siloxanes, moisture, H2S, halides',
              blocking: true, requires_document: true, evidence_kind: 'gas_analysis',
              why: 'Siloxane level sets the treatment cost, which is the difference between ' +
                   'roughly 3 and over 4 cents/kWh all-in. It is invisible until tested.' },
            { key: 'collection_condition',
              label: 'Collection system condition assessed on site',
              blocking: true,
              why: 'An installed system in poor condition is a liability, not an asset. This is ' +
                   'where the capital-avoided estimate is verified or falsified.' },
            { key: 'gas_forecast',
              label: 'Gas generation forecast over the contract term',
              blocking: true,
              why: 'Must support the contract term, and it is what sizes the plant. Building ' +
                   '5 MW on gas that sustains 3 is roughly $2M producing nothing.' },

            // Required before agreements, but not blocking the gate itself.
            { key: 'title',       label: 'Surface rights title search', blocking: false,
              requires_document: false, evidence_kind: 'title',
              why: 'Mineral and surface rights are frequently severed — the landfill operator ' +
                   'may not be the surface owner.' },
            { key: 'phase_one',   label: 'Phase I environmental', blocking: false },
            { key: 'survey',      label: 'Site survey', blocking: false },
            { key: 'interconnect', label: 'Interconnect study', blocking: false,
              evidence_kind: 'utility' },
            { key: 'permit_class', label: 'Air permit classification determined', blocking: false,
              why: 'Major versus minor source swings the permitting timeline materially.' }
        ],

        agreements: [
            /* THREE SEPARATE DOCUMENTS. Treating them as one is a common and expensive error:
               the surface owner may not be the operator, and access is a third party again. */
            { key: 'gas_supply',  label: 'Gas supply agreement', blocking: true,
              requires_document: true, evidence_kind: 'agreement' },
            { key: 'surface_lease', label: 'Surface lease with the surface owner', blocking: true,
              requires_document: true, evidence_kind: 'surface' },
            { key: 'easements',   label: 'Road and utility access easements', blocking: true,
              requires_document: true, evidence_kind: 'surface' },
            { key: 'env_attributes',
              label: 'Environmental attributes (RINs, RECs, offsets) assigned explicitly',
              blocking: true,
              why: 'Can be worth as much as the power, and are frequently left silent in ' +
                   'draft agreements. Unresolved until assigned in writing, either way.' },
            { key: 'renewal',     label: 'Renewal rights or right of first refusal', blocking: true,
              why: 'RNG developers can outbid power generation for the same gas on RIN and ' +
                   'LCFS value. Expiry without renewal rights is the likeliest way this asset ' +
                   'is lost — not gas depletion.' }
        ],

        permitting_complete: [
            /* The gate is the permit being ISSUED, which is why it requires the document. A
               completion claim with nothing on file is a recollection, and advancing here stops
               a $160,000 permitting cost being charged and cuts months-to-revenue by 4 to 10. */
            { key: 'air_permit',  label: 'Air permit issued', blocking: true,
              requires_document: true, evidence_kind: 'permit',
              why: 'The long pole at 3-9 months. Advancing before issuance silently reprices ' +
                   'the whole build.' },
            { key: 'other_permits', label: 'Remaining permits and approvals on file', blocking: false,
              evidence_kind: 'permit' }
        ],

        engineering_procurement: [
            { key: 'long_lead_ordered', label: 'Long-lead equipment ordered', blocking: true,
              why: 'Gensets run 20-40 weeks and must be ordered before construction starts, ' +
                   'not after. A slipped genset order moves energization one-for-one.' },
            { key: 'ifc_drawings', label: 'Issued-for-construction drawings', blocking: false }
        ],

        construction: [
            { key: 'civil_complete',      label: 'Civil and pad complete', blocking: false },
            { key: 'electrical_complete', label: 'Electrical installation complete', blocking: false },
            { key: 'lien_waivers',        label: 'Lien waivers current for all contractors',
              blocking: true,
              why: 'A payment issued without a corresponding waiver is a routine cause of loss ' +
                   'on a first-time build.' }
        ],

        commissioning: [
            /* IN ORDER, and the order is the point. The load bank test proves the unit performs
               under real load rather than idling, and it must happen before miners are on site
               -- a genset that fails under load with containers already energised is a much
               more expensive discovery. */
            { key: 'purge_leak',   label: 'Gas purge and leak test', blocking: true },
            { key: 'load_bank',    label: 'Load bank test on each genset, before any miners',
              blocking: true,
              why: 'Non-negotiable. It proves performance under real load, and it must happen ' +
                   'before miners are connected.' },
            { key: 'electrical_verify', label: 'Electrical verification under load', blocking: true },
            { key: 'thermal',      label: 'Thermal survey at full load', blocking: true },
            { key: 'continuous',   label: 'Continuous run', blocking: true }
        ],

        // A terminal state, not a gate. Deliberately empty: it is what a project becomes when
        // the last gate closes and it hands off to operations.
        operating: [],
        cancelled: []
    };

    function cloneChecklists(src) {
        var out = {};
        for (var k in src) {
            if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
            out[k] = src[k].map(clone);
        }
        return out;
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
                if (parsed && parsed.checklists && typeof parsed.checklists === 'object') {
                    d.checklists = cloneChecklists(parsed.checklists);
                }
                if (parsed && Array.isArray(parsed.enrichStatuses) && parsed.enrichStatuses.length) {
                    d.enrichStatuses = parsed.enrichStatuses.filter(function (x) { return x && x.key; });
                }
                if (parsed && Array.isArray(parsed.documentKinds) && parsed.documentKinds.length) {
                    d.documentKinds = parsed.documentKinds.filter(function (x) { return x && x.key; });
                }
                /* Merged key by key rather than replaced, so a stored config
                   written before a setting existed does not erase its default. */
                if (parsed && parsed.settings && typeof parsed.settings === 'object') {
                    for (var sk in DEFAULT_SETTINGS) {
                        if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, sk)) continue;
                        if (Object.prototype.hasOwnProperty.call(parsed.settings, sk)) {
                            d.settings[sk] = parsed.settings[sk];
                        }
                    }
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
            try { SyncEngine.save('crmConfig', data); } catch (e) { /* local write already succeeded */ }
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

    // ---- Enrichment ---------------------------------------------------------
    /* Looked up by the prospect's energy type, falling back to the generic list.
       A source with no checklist of its own gets four questions rather than none:
       an empty checklist reads as "nothing to research here", which is never true
       of a site somebody is tracking. */
    function checklistFor(energyType) {
        var all = read().checklists || {};
        var key = energyType && Object.prototype.hasOwnProperty.call(all, energyType)
            ? energyType : '_default';
        return (all[key] || []).map(clone);
    }

    function checklistTypes() {
        var all = read().checklists || {};
        return Object.keys(all).filter(function (k) { return k !== '_default'; });
    }

    function setChecklist(energyType, items) {
        if (!energyType || !Array.isArray(items)) return { ok: false, err: 'A checklist needs a type and items.' };
        var seen = {}, out = [];
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (!it || !it.key || seen[it.key]) continue;
            seen[it.key] = true;
            out.push({ key: String(it.key), label: it.label ? String(it.label) : String(it.key) });
        }
        var cfg = read();
        if (!cfg.checklists) cfg.checklists = {};
        cfg.checklists[energyType] = out;
        return write(cfg);
    }

    function setting(key) {
        var st = read().settings || {};
        return Object.prototype.hasOwnProperty.call(st, key) ? st[key] : null;
    }

    function setSetting(key, value) {
        if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) {
            return { ok: false, err: 'Unknown setting: ' + key };
        }
        var cfg = read();
        if (!cfg.settings) cfg.settings = clone(DEFAULT_SETTINGS);
        cfg.settings[key] = value;
        return write(cfg);
    }

    /* WHAT A GATE REQUIRES. Falls back to the shipped defaults rather than an empty list when
       the stored config predates this collection: an empty list would report every gate as
       having nothing to satisfy, which reads as "ready" and is the most dangerous possible
       wrong answer for a blocking check. */
    function gateDeliverables(gate) {
        var all = read().gateDeliverables || DEFAULT_GATE_DELIVERABLES;
        if (!Object.prototype.hasOwnProperty.call(all, gate)) {
            return Object.prototype.hasOwnProperty.call(DEFAULT_GATE_DELIVERABLES, gate)
                ? DEFAULT_GATE_DELIVERABLES[gate].map(clone) : [];
        }
        return (all[gate] || []).map(clone);
    }

    function gateDeliverableGates() {
        var all = read().gateDeliverables || DEFAULT_GATE_DELIVERABLES;
        return Object.keys(all);
    }

    function setGateDeliverables(gate, list) {
        if (!Array.isArray(list)) return { ok: false, err: 'A gate needs a list of deliverables.' };
        var out = [], seen = {};
        for (var i = 0; i < list.length; i++) {
            var it = list[i] || {};
            var key = (typeof it.key === 'string') ? it.key.trim() : '';
            if (!key || seen[key]) continue;
            seen[key] = true;
            out.push({
                key: key,
                label: (typeof it.label === 'string' && it.label.trim()) ? it.label.trim() : key,
                blocking: !!it.blocking,
                requires_document: !!it.requires_document,
                evidence_kind: (typeof it.evidence_kind === 'string' && it.evidence_kind) ? it.evidence_kind : null,
                why: (typeof it.why === 'string' && it.why) ? it.why : null
            });
        }
        var cfg = read();
        if (!cfg.gateDeliverables) cfg.gateDeliverables = cloneChecklists(DEFAULT_GATE_DELIVERABLES);
        cfg.gateDeliverables[gate] = out;
        return write(cfg);
    }

    function documentKinds() { return read().documentKinds.map(clone); }

    function documentKindLabel(key) {
        var l = read().documentKinds;
        for (var i = 0; i < l.length; i++) if (l[i].key === key) return l[i].label;
        /* An unconfigured kind keeps its key rather than disappearing. Retiring a
           kind must not erase the documents filed under it. */
        return key || '';
    }

    function setDocumentKinds(list) {
        if (!Array.isArray(list) || !list.length) {
            return { ok: false, err: 'There has to be at least one document kind.' };
        }
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var it = list[i];
            if (!it || !it.key) continue;
            out.push({ key: String(it.key),
                       label: it.label ? String(it.label) : String(it.key),
                       expected: !!it.expected });
        }
        if (!out.length) return { ok: false, err: 'None of those had a key.' };
        var cfg = read();
        cfg.documentKinds = out;
        return write(cfg);
    }

    function enrichStatuses() { return read().enrichStatuses.map(clone); }

    function enrichStatusLabel(key) {
        var l = read().enrichStatuses;
        for (var i = 0; i < l.length; i++) if (l[i].key === key) return l[i].label;
        return key || '';
    }

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
        checklistFor: checklistFor,
        checklistTypes: checklistTypes,
        setChecklist: setChecklist,
        setting: setting,
        setSetting: setSetting,
        gateDeliverables: gateDeliverables,
        gateDeliverableGates: gateDeliverableGates,
        setGateDeliverables: setGateDeliverables,
        documentKinds: documentKinds,
        documentKindLabel: documentKindLabel,
        setDocumentKinds: setDocumentKinds,
        enrichStatuses: enrichStatuses,
        enrichStatusLabel: enrichStatusLabel,
        publish: publish,
        reset: reset
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CrmConfig;
