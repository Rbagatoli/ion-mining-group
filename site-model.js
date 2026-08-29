// ===== PROTON MINING — Site Data Model =====
// CRUD and persistence for sites: a sourced energy prospect, or a vendor's offer. Same record
// either way — only the origin of usable_kw differs, which is what lets both run through the
// same evaluation engine.
//
// Follows the ScenarioData pattern (calculator.js:769): IIFE with a private key, _v on the
// root, a getter that never throws and never returns null, a setter that swallows quota
// errors, and a SyncEngine call guarded by typeof so this module still works on a page that
// does not load sync.js.

var SiteData = (function() {
    var KEY = 'protonMiningSites';
    var VERSION = 1;

    var STATUSES = ['prospect', 'evaluating', 'owned', 'rejected'];
    // 'discovery' is the generic bucket for anything found by an automated source adapter that
    // is not a flare. 'flare_detection' is kept as its own value rather than folded in, so
    // records created before multi-source support keep the label they were saved with.
    var SOURCES = ['flare_detection', 'discovery', 'vendor_offer', 'manual'];
    // The CRM pipeline. Editable and persisted — this is a working pipeline, not a
    // read-only view.
    //
    // THE DEFAULT LIST, NOT THE ONLY LIST. crm-config.js owns the configurable
    // pipeline and pushes it in through registerStages() below. These nine are what
    // stands if that module never loads, so this file still normalises correctly on
    // its own and its tests still run without it.
    //
    // 'negotiating' and 'acquired' were the previous names for what are now
    // 'in_discussion' and 'closed_won'. Renamed rather than aliased because there are
    // no records on either — confirmed before the change. If there had been, normalize()
    // would have silently reset every one of them to 'unreviewed', which is the single
    // most dangerous property of this file: an unrecognised stage is not an error, it is
    // a quiet rewrite.
    var DEFAULT_STAGES = ['unreviewed', 'researching', 'contacted', 'in_discussion',
                          'term_sheet', 'diligence', 'agreement', 'closed_won', 'dead'];
    var STAGES = DEFAULT_STAGES.slice();

    /* Push, not pull. site-model.js does not reach for crm-config.js, so it keeps
       working — and keeps being testable — with no CRM loaded at all. The reverse
       direction would make this file depend on a module that depends on it.

       'unreviewed' is forced to survive because normalize() falls back to it. A
       configuration that removed it would make every record with an unknown stage
       fall back to a stage that does not exist. */
    function registerStages(list) {
        if (!Array.isArray(list) || !list.length) return STAGES.slice();
        var seen = {}, out = [];
        for (var i = 0; i < list.length; i++) {
            var k = list[i];
            if (typeof k !== 'string' || !k || seen[k]) continue;
            seen[k] = true;
            out.push(k);
        }
        if (!out.length) return STAGES.slice();
        if (out.indexOf('unreviewed') < 0) out.unshift('unreviewed');
        STAGES.length = 0;
        for (var j = 0; j < out.length; j++) STAGES.push(out[j]);
        return STAGES.slice();
    }

    // How far along the physical asset is — distinct from STAGES, which tracks OUR conversation
    // with the counterparty. Ordered worst-to-best; site-opportunity.js scores against this order.
    var DEVELOPMENT_STAGES = ['raw_resource', 'permitted', 'constructed', 'energized', 'operating'];
    // What the output is committed to. A long contract is what usually makes a healthy,
    // attractive asset unbuyable.
    var OFFTAKE_STATES = ['expired', 'none_merchant', 'short_lt_3yr', 'medium_3_to_10yr',
                          'long_gt_10yr', 'regulated_ratebase'];
    // Deliberately has no 'lapsed' member: a lapsed permit is a distress SIGNAL with its own
    // weight, and having it here too would count the same fact twice.
    var PERMIT_STATES = ['in_renewal', 'none_required', 'active', 'active_long_dated'];
    var GENERATOR_OWNERSHIP = ['client', 'producer', 'operator'];
    // How a gas quote was expressed. usd_kwh is an ALL-IN power price; the other two are fuel
    // only, which is why generator ownership has to be recorded alongside them.
    var RATE_UNITS = ['usd_kwh', 'usd_gj', 'usd_mcf'];

    // Fields the satellite cannot know. Blank by default and NEVER inferred — the spec is
    // explicit about this, and a guessed H2S reading is a safety claim we have no basis for.
    var MANUAL_FIELDS = [
        // siloxane_level is the landfill-gas equivalent of h2s_content: invisible until someone
        // runs a gas analysis, and it decides the treatment cost that decides the deal. Both are
        // blank by default and NEVER inferred.
        'h2s_content', 'siloxane_level', 'gas_composition', 'surface_rights_status', 'road_access',
        'winter_access', 'fiber_distance_km', 'grid_distance_km',
        'producer_contacted', 'producer_response'
    ];

    // Contact details are USER-ENTERED and deliberately separate from the operator name, which
    // comes from a regulator filing. Regulators publish the licensed company and nothing more —
    // no public dataset maps a wellsite to a person — so these stay blank until someone actually
    // makes contact. Keeping them apart is what stops a typed-in guess from ever being displayed
    // with the authority of sourced data.
    var CONTACT_FIELDS = ['contact_name', 'contact_role', 'contact_email', 'contact_phone', 'contact_notes'];

    function blankSite() {
        var s = {
            id: null,
            name: '',
            status: 'prospect',
            source: 'manual',
            stage: 'unreviewed',
            energy_type: null,

            latitude: null,
            longitude: null,
            jurisdiction: null,

            nameplate_kw: null,
            usable_kw: null,
            purchase_price_usd: null,

            power_rate: null,
            power_rate_currency: null,
            quoted_rates: null,

            // What the producer actually said, kept alongside the $/kWh the engine prices in.
            // A gas quote arrives as $/GJ or $/Mcf far more often than $/kWh, and converting
            // through the engine's heat rate is an ESTIMATE — so the original figure and its
            // units survive next to the derived one and are what gets shown back to the user.
            // normalize() copies only keys that exist here, so a field missing from this
            // template is silently discarded on save.
            quoted_rate: null,
            quoted_rate_units: null,

            /* CONDITION VERIFIED ON SITE — the one fact no dataset can supply.
               LMOP records that a gas plant was INSTALLED. It never records whether the gensets
               still turn, whether the switchgear was cannibalised, or whether the wellfield was
               capped. site-infrastructure.js discounts unverified equipment hard for exactly that
               reason, and this is the field an inspection clears it with. Null, not false: "not
               yet looked at" and "looked at and it is scrap" are different answers. */
            infra_condition_verified: null,

            take_or_pay_pct: null,
            contract_term_years: null,
            generator_ownership: null,

            om_model: null,
            om_hourly_rate: null,
            vendor_name: null,

            // Vendor claims. Held separately from measured inputs because the flag rules exist
            // precisely to test a claim against the physics — conflating the two would let a
            // claim quietly become an assumption.
            claimed_miners: null,
            claimed_miner_algorithm: null,
            claimed_warranty_months: null,
            claimed_efficiency_j_th: null,
            claimed_uplift_pct: null,
            hardware_condition: null,

            discovery: null,
            /* THE LOOSE FIELD. normalize() copies only keys that exist on this
               template and silently drops everything else, which is right for a
               model with a fixed shape and wrong for a CRM whose fields are not
               known yet. One blob means the next ten conversations can add what
               they need without a migration. */
            custom_fields: {},
            notes: '',
            created: null,
            updated: null
        };
        for (var i = 0; i < MANUAL_FIELDS.length; i++) s[MANUAL_FIELDS[i]] = null;
        for (var c = 0; c < CONTACT_FIELDS.length; c++) s[CONTACT_FIELDS[c]] = null;
        // Operator identity as filed with the regulator. Written by the sourcing layer from
        // data/operators.json, never typed by hand — that is what CONTACT_FIELDS are for.
        s.operator = null;
        s.operator_licence = null;
        // The registry's own key for that company, where the registry has one. Sourced, never
        // typed -- like operator itself.
        s.operator_id = null;
        s.operator_source = null;
        s.operator_distance_m = null;

        // ---- Acquisition axis ----------------------------------------------------------
        // How far along the asset already is. This is the single biggest difference between
        // two prospects: an energized, permitted 2 MW plant inherits permits, interconnection
        // and commissioning, where a raw flare is 12-24 months of development away.
        //
        // null means NOT RECORDED, which is not the same as raw_resource. An unrecognised value
        // must never fall back to raw_resource — missing data would then masquerade as a fact.
        s.development_stage = null;
        // Structural availability. What makes a healthy asset unbuyable is usually a contract,
        // not distress, so these carry the acquirability baseline.
        s.offtake_state = null;
        s.permit_state = null;
        // [{ type, date, source, detail }] — appended by adapters and by hand. Array, not null,
        // so callers can push without a guard.
        s.distress_signals = [];

        // Facility attributes. All null for raw_resource prospects, by definition.
        s.installed_capacity_mw = null;
        s.prime_mover_type = null;
        s.fuel_type = null;
        s.in_service_year = null;
        s.permit_ids = [];
        s.air_permit_class = null;
        s.interconnection_status = null;
        s.offtake_expiry_date = null;
        s.capacity_factor_current = null;
        s.capacity_factor_3yr_avg = null;
        s.prior_use = null;
        s.estimated_acquisition_cost = null;
        return s;
    }

    function defaultData() { return { _v: VERSION, sites: [] }; }

    function getData() {
        try {
            var raw = localStorage.getItem(KEY);
            if (!raw) return defaultData();
            var parsed = JSON.parse(raw);
            if (!parsed || !Array.isArray(parsed.sites)) return defaultData();
            return parsed;
        } catch (e) { return defaultData(); }
    }

    // Returns { ok, err } — it used to return nothing and swallow the failure in an EMPTY catch,
    // then call SyncEngine.save regardless, while the UI printed "Saved" unconditionally. So the
    // one way this app could lose a deal record — a full localStorage — was also the one way it
    // could never tell you.
    //
    // Two distinct failures, reported separately because they mean different things: a local
    // write that fails means the record is GONE, while a sync that fails means it is safe here
    // but not yet elsewhere.
    function saveData(data) {
        var res = { ok: true, err: null };
        try {
            localStorage.setItem(KEY, JSON.stringify(data));
        } catch (e) {
            res.ok = false;
            // QuotaExceededError is the one that matters and the one with a real remedy, so it
            // is named rather than folded into a generic message.
            res.err = (e && (e.name === 'QuotaExceededError' || e.code === 22))
                ? 'Local storage is full — this was NOT saved. Export your data and remove ' +
                  'something before trying again.'
                : 'Could not save to this device' + (e && e.message ? ': ' + e.message : '') + '.';
            return res;   // do not sync what was never stored
        }
        if (typeof SyncEngine !== 'undefined') SyncEngine.save('sites', data);
        return res;
    }

    function newId() {
        return 'site_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    // Merges a partial record onto the blank template so every field exists, then coerces the
    // enumerated ones. Unknown enum values fall back to the safe default rather than being
    // written through — a status of "definitely-buying" must not reach the UI as a valid state.
    function normalize(partial) {
        var s = blankSite();
        partial = partial || {};
        for (var k in s) {
            if (Object.prototype.hasOwnProperty.call(partial, k) && partial[k] !== undefined) s[k] = partial[k];
        }
        if (STATUSES.indexOf(s.status) < 0) s.status = 'prospect';
        if (SOURCES.indexOf(s.source) < 0) s.source = 'manual';
        if (STAGES.indexOf(s.stage) < 0) s.stage = 'unreviewed';
        if (s.generator_ownership !== null && GENERATOR_OWNERSHIP.indexOf(s.generator_ownership) < 0) {
            s.generator_ownership = null;
        }
        // Units fall back to null, never to a default member: a quote whose units were not
        // recorded must not silently become $/kWh, which would understate a $/GJ quote by ~280x.
        if (s.quoted_rate_units !== null && RATE_UNITS.indexOf(s.quoted_rate_units) < 0) {
            s.quoted_rate_units = null;
        }
        // Acquisition enums fall back to NULL rather than to a default member. raw_resource must
        // never be a fallback: an unrecognised value is missing data, and treating it as "this is
        // raw gas" would turn a typo into an assertion about the asset.
        if (s.development_stage !== null && DEVELOPMENT_STAGES.indexOf(s.development_stage) < 0) {
            s.development_stage = null;
        }
        if (s.offtake_state !== null && OFFTAKE_STATES.indexOf(s.offtake_state) < 0) s.offtake_state = null;
        if (s.permit_state !== null && PERMIT_STATES.indexOf(s.permit_state) < 0) s.permit_state = null;
        // Arrays must stay arrays. A signal with no type cannot be scored or displayed, so it is
        // dropped rather than carried as a blank row in the distress timeline.
        if (!Array.isArray(s.distress_signals)) s.distress_signals = [];
        s.distress_signals = s.distress_signals.filter(function(d) { return d && d.type; });
        if (!Array.isArray(s.permit_ids)) s.permit_ids = [];
        /* An array or a string here would break every reader that treats it as a
           bag of keys, and a null would make callers guard on every access. */
        if (!s.custom_fields || typeof s.custom_fields !== 'object' ||
            Array.isArray(s.custom_fields)) s.custom_fields = {};
        s.name = String(s.name == null ? '' : s.name).slice(0, 120);
        return s;
    }

    function list() { return getData().sites; }

    function get(id) {
        var sites = getData().sites;
        for (var i = 0; i < sites.length; i++) if (sites[i].id === id) return sites[i];
        return null;
    }

    function add(partial) {
        var data = getData();
        var site = normalize(partial);
        if (!site.id) site.id = newId();
        site.created = new Date().toISOString();
        site.updated = site.created;
        data.sites.push(site);
        // _save rides along on the returned record so every existing caller keeps working
        // unchanged, while one that cares can check whether the write actually landed.
        site._save = saveData(data);
        return site;
    }

    function update(id, changes) {
        var data = getData();
        for (var i = 0; i < data.sites.length; i++) {
            if (data.sites[i].id !== id) continue;
            var merged = data.sites[i];
            for (var k in changes) {
                if (Object.prototype.hasOwnProperty.call(changes, k)) merged[k] = changes[k];
            }
            merged.id = id;                       // id is not editable through this path
            data.sites[i] = normalize(merged);
            data.sites[i].updated = new Date().toISOString();
            data.sites[i]._save = saveData(data);
            return data.sites[i];
        }
        return null;
    }

    /* { ok, err } RATHER THAN A BOOLEAN, and the boolean was hiding two different things.
     *
     * It returned false both for "no such site" and, silently, for "the site was removed from the
     * in-memory array and the write to disk then failed" -- because the return value was computed
     * from the array length and saveData's own { ok, err } was discarded. On a full localStorage
     * that reported a successful delete of a record still on disk, which reappears on reload.
     *
     * The shape matches setStage's precondition refusals (:353), which is the only other place in
     * this file that says no. A caller that has to distinguish "refused" from "failed to write"
     * can, and one that only cares whether the record is gone reads .ok.
     *
     * This signature is changed AHEAD of the thing that needs it. The execution workspace refuses
     * to delete a prospect that has a live project, and that refusal needs somewhere to put its
     * reason -- but mixing the signature change into the commit that adds projects would make a
     * missed call site look like a project bug. There are only two call sites today and both are
     * tests: nothing in the product deletes a site at all. */
    function remove(id) {
        /* A PROSPECT WITH A LIVE PROJECT IS NOT DELETABLE, and the refusal is here rather than
           in the UI because there is more than one way to reach this function and only one of
           them is a button. Cancelled projects do not block: cancelling is a decision already
           recorded, and the prospect should be reclaimable afterwards.

           typeof-guarded like every other cross-module call in this file, so site-model.js keeps
           working -- and keeps being testable -- with no project model loaded.

           Advisory across devices, not enforced: sites and projects are two independent
           last-write-wins documents, so a device that has not yet pulled the projects doc will
           not see the project and will allow the delete. That is a reconciliation problem for
           the workspace to surface, not something this function can promise. */
        /* ONE CALL, AND GUARDED ON THE FUNCTION IT ACTUALLY MAKES. This used to test
           ProjectData.hasLive and then rebuild liveFor()'s answer with an UNGUARDED
           forProspect(), reading live.id off whatever came back. Two things wrong with that: the
           guard named a different function from the one the next line called, and liveFor()
           already is this filter (project-model.js:344-347), so the workspace had two copies of
           "which project counts as live" and only one of them was tested. */
        var live = (typeof ProjectData !== 'undefined' && ProjectData.liveFor)
            ? ProjectData.liveFor(id) : null;
        if (live) {
            return { ok: false, err: 'This prospect is being built as project ' + live.id +
                     ' (' + live.name + '). Cancel the project first.' };
        }
        var data = getData();
        var before = data.sites.length;
        var kept = data.sites.filter(function(s) { return s.id !== id; });
        if (kept.length === before) return { ok: false, err: 'No such site.' };
        data.sites = kept;
        var res = saveData(data);
        if (!res.ok) return { ok: false, err: res.err };
        return { ok: true, err: null };
    }

    /* Every transition is logged, and the log is what Phase 6 reads to answer
       "where do things stall" and "why do deals die". Neither question can be
       answered retrospectively, which is why the writing starts now and the
       reading comes later.

       opts: { note, deadReason }.

       DEAD REQUIRES A REASON. It is refused, not defaulted — a pipeline full of
       deals that died for 'other' is the same as no data at all, and the reason a
       deal died is the most valuable thing in a CRM. Validated against the
       configured list when crm-config.js is present, and accepted as free text
       when it is not, so this file still works standalone. */
    function setStage(id, stage, opts) {
        if (STAGES.indexOf(stage) < 0) return null;
        opts = opts || {};
        var before = get(id);
        if (!before) return null;
        var from = before.stage;

        if (stage === 'dead') {
            if (!opts.deadReason) return { ok: false, err: 'A dead prospect needs a reason.' };
            if (typeof CrmConfig !== 'undefined' && CrmConfig.isDeadReason &&
                !CrmConfig.isDeadReason(opts.deadReason)) {
                return { ok: false, err: 'Unknown reason: ' + opts.deadReason };
            }
        }

        var res = update(id, { stage: stage });
        if (!res) return null;

        /* Logged AFTER the record is written, so a failed save never leaves a
           history entry claiming a transition that did not happen. A logged
           transition with no record is a lie; a record with no log entry is a gap,
           and a gap is the lesser of the two. */
        if (from !== stage && typeof CrmLog !== 'undefined' && CrmLog.append) {
            CrmLog.append('stage', id, {
                from: from,
                to: stage,
                note: opts.note || null,
                dead_reason: stage === 'dead' ? opts.deadReason : null
            });
        }
        return res;
    }

    /* How long this prospect has sat where it is, in whole days.
       Read from the log rather than stored on the record: a stored
       stage_entered_at is one more field to keep in step, and it cannot answer
       "how long did it spend in diligence last time" — which is the question
       Phase 6 needs. null means the prospect has never moved, so the honest
       answer is that it has no time-in-stage yet rather than zero. */
    function daysInStage(id, nowMs) {
        if (typeof CrmLog === 'undefined' || !CrmLog.forProspect) return null;
        var hist = CrmLog.forProspect(id, 'stage');
        if (!hist.length) return null;
        var t = Date.parse(hist[0].at);
        if (!isFinite(t)) return null;
        var now = (typeof nowMs === 'number') ? nowMs : Date.now();
        return Math.max(0, Math.floor((now - t) / 86400000));
    }

    /* Every stage this prospect has been through, oldest first, with how long it
       spent in each. The last entry is open — it has a from but no until. */
    function stageHistory(id, nowMs) {
        if (typeof CrmLog === 'undefined' || !CrmLog.forProspect) return [];
        var hist = CrmLog.forProspect(id, 'stage').slice().reverse();   // oldest first
        var now = (typeof nowMs === 'number') ? nowMs : Date.now();
        var out = [];
        for (var i = 0; i < hist.length; i++) {
            var startMs = Date.parse(hist[i].at);
            var endMs = (i + 1 < hist.length) ? Date.parse(hist[i + 1].at) : now;
            out.push({
                from: hist[i].from,
                to: hist[i].to,
                at: hist[i].at,
                note: hist[i].note || null,
                dead_reason: hist[i].dead_reason || null,
                days: (isFinite(startMs) && isFinite(endMs))
                    ? Math.max(0, Math.floor((endMs - startMs) / 86400000))
                    : null,
                open: (i + 1 === hist.length)
            });
        }
        return out;
    }

    // Promote a discovered candidate into a tracked site. Commercial terms arrive via
    // `overrides` — everything the satellite cannot know stays null so the engine reports it
    // as missing rather than scoring the site as though it were free.
    function fromCandidate(cand, overrides) {
        if (typeof SiteSources === 'undefined') throw new Error('SiteSources is required to promote a candidate');
        return add(SiteSources.toSite(cand, overrides));
    }

    /* WHY THIS EXISTS SEPARATELY FROM list().
     *
     * getData() collapses four different facts into one empty array: the key was never written,
     * the JSON did not parse, `sites` was not an array, and a store that genuinely holds no
     * prospects. Every caller that only wants records is right not to care.
     *
     * A caller about to conclude something FROM the absence of a record has to care, because
     * "this device has never pulled the prospect list" and "that prospect was deleted" are
     * opposite answers reached through the same empty array — and one of them is a reason to
     * say nothing at all rather than to raise an alarm on every project at once.
     *
     * Recorded and deliberately not fixed here: getData() ignores _v entirely, so a sites
     * document from a future build is read and normalized rather than refused, unlike
     * ProjectData.read(). This reports what it can see; version-blocking `sites` is its own
     * change with its own risk. */
    function storeState() {
        var raw;
        try { raw = localStorage.getItem(KEY); }
        catch (e) {
            return { state: 'unreadable', count: null,
                     reason: 'Local storage could not be read on this device.' };
        }
        if (raw === null || raw === '') {
            return { state: 'absent', count: null,
                     reason: 'No prospect list has ever been written on this device.' };
        }
        var parsed = null;
        try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
        if (!parsed || !Array.isArray(parsed.sites)) {
            return { state: 'unreadable', count: null,
                     reason: 'The saved prospect list could not be read on this device.' };
        }
        return { state: parsed.sites.length ? 'ready' : 'empty',
                 count: parsed.sites.length,
                 reason: parsed.sites.length ? null
                       : 'The prospect list is readable and holds nothing.' };
    }

    return {
        getData: getData,
        storeState: storeState,
        list: list,
        get: get,
        add: add,
        update: update,
        remove: remove,
        setStage: setStage,
        fromCandidate: fromCandidate,
        normalize: normalize,
        blankSite: blankSite,
        STATUSES: STATUSES,
        SOURCES: SOURCES,
        STAGES: STAGES,
        DEFAULT_STAGES: DEFAULT_STAGES,
        registerStages: registerStages,
        daysInStage: daysInStage,
        stageHistory: stageHistory,
        DEVELOPMENT_STAGES: DEVELOPMENT_STAGES,
        OFFTAKE_STATES: OFFTAKE_STATES,
        PERMIT_STATES: PERMIT_STATES,
        GENERATOR_OWNERSHIP: GENERATOR_OWNERSHIP,
        MANUAL_FIELDS: MANUAL_FIELDS,
        CONTACT_FIELDS: CONTACT_FIELDS,
        KEY: KEY
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SiteData;
