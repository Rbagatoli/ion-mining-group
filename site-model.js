// ===== ION MINING GROUP — Site Data Model =====
// CRUD and persistence for sites: a sourced energy prospect, or a vendor's offer. Same record
// either way — only the origin of usable_kw differs, which is what lets both run through the
// same evaluation engine.
//
// Follows the ScenarioData pattern (calculator.js:769): IIFE with a private key, _v on the
// root, a getter that never throws and never returns null, a setter that swallows quota
// errors, and a SyncEngine call guarded by typeof so this module still works on a page that
// does not load sync.js.

var SiteData = (function() {
    var KEY = 'ionMiningSites';
    var VERSION = 1;

    var STATUSES = ['prospect', 'evaluating', 'owned', 'rejected'];
    // 'discovery' is the generic bucket for anything found by an automated source adapter that
    // is not a flare. 'flare_detection' is kept as its own value rather than folded in, so
    // records created before multi-source support keep the label they were saved with.
    var SOURCES = ['flare_detection', 'discovery', 'vendor_offer', 'manual'];
    // The CRM pipeline from the spec. Editable and persisted — this is a working pipeline,
    // not a read-only view.
    var STAGES = ['unreviewed', 'researching', 'contacted', 'negotiating', 'dead', 'acquired'];

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
        'h2s_content', 'gas_composition', 'surface_rights_status', 'road_access',
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

    function remove(id) {
        var data = getData();
        var before = data.sites.length;
        data.sites = data.sites.filter(function(s) { return s.id !== id; });
        if (data.sites.length !== before) saveData(data);
        return data.sites.length !== before;
    }

    function setStage(id, stage) {
        if (STAGES.indexOf(stage) < 0) return null;
        return update(id, { stage: stage });
    }

    // Promote a discovered candidate into a tracked site. Commercial terms arrive via
    // `overrides` — everything the satellite cannot know stays null so the engine reports it
    // as missing rather than scoring the site as though it were free.
    function fromCandidate(cand, overrides) {
        if (typeof SiteSources === 'undefined') throw new Error('SiteSources is required to promote a candidate');
        return add(SiteSources.toSite(cand, overrides));
    }

    return {
        getData: getData,
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
