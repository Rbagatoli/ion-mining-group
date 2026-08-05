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
    var GENERATOR_OWNERSHIP = ['client', 'producer', 'operator'];

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
        s.operator_source = null;
        s.operator_distance_m = null;
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

    function saveData(data) {
        try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* quota / no storage */ }
        if (typeof SyncEngine !== 'undefined') SyncEngine.save('sites', data);
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
        saveData(data);
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
            saveData(data);
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
        GENERATOR_OWNERSHIP: GENERATOR_OWNERSHIP,
        MANUAL_FIELDS: MANUAL_FIELDS,
        CONTACT_FIELDS: CONTACT_FIELDS,
        KEY: KEY
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SiteData;
