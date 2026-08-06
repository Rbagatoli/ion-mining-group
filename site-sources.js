// ===== ION MINING GROUP — Site Discovery Sources =====
// The energy-source-agnostic seam.
//
// Sites will not always be flare gas. Nothing above this layer knows what a flare is: every
// source — satellite flare catalog, stranded well, biogas, curtailed wind, an interconnection
// queue — reduces its findings to one common candidate shape measured in KILOWATTS. Scoring,
// flags, ranking and UI operate only on that shape.
//
// Adding a new kind of energy is therefore one new file implementing discover(), plus one
// register() call. It is never an edit to site-engine.js. site-engine.test.js asserts exactly
// that, using a deliberately non-flare fake source.
//
// Phase 1 ships the contract and its tests only. Adapters land in Phase 2.

var SiteSources = (function() {

    // ---- The common candidate shape ---------------------------------------------------
    //
    // {
    //   id                 stable across runs — a candidate must keep its identity between
    //                      ingests or the CRM notes attached to it are orphaned
    //   source             adapter id that produced it
    //   energyType         'flare_gas' | 'stranded_gas' | 'biogas' | 'curtailed_renewable' | ...
    //   lat, lng
    //   country, iso3
    //   powerPotentialKw   THE UNIVERSAL UNIT. Every adapter converts into this.
    //   confidence         0..1 — how much the adapter trusts its own estimate
    //   firstSeen,lastSeen ISO date strings, or null when the source has no time dimension
    //   persistencePct     0..100, share of observations the source was active. null if unknown.
    //   trend              'rising' | 'flat' | 'declining' | null
    //   offshore           true | false | null  (null = not determined; never guessed)
    //   evidence[]         [{ dataset, year, field, value }] — traceability, so any number can
    //                      be walked back to the row it came from
    //   raw                untouched source payload
    // }

    var REQUIRED = ['id', 'source', 'lat', 'lng'];

    var _adapters = [];

    // ---- The SourceAdapter contract ---------------------------------------------------
    //
    // An adapter may implement EITHER shape:
    //
    //   A. the full contract — the preferred form, because each step is separately testable
    //        fetch(opts)              -> raw[]        retrieve from the source
    //        normalize(raw)           -> candidate    map ONE raw record to the common shape
    //        computePersistence(raw)  -> 0..100       source-appropriate persistence logic
    //        computeCapacity(raw)     -> kW           source-appropriate capacity logic
    //        refreshSchedule()        -> { everyDays, reason }
    //
    //   B. discover(opts) -> candidate[]              one step, for trivial or in-memory sources
    //
    // Persistence and capacity are deliberately separate methods rather than fields on the raw
    // record: they are the two things every source computes in its OWN units (nights detected,
    // remaining generation years, hours below a price threshold) and must normalise before
    // anything downstream can compare sources to each other.
    //
    // refreshSchedule exists because cadences differ by orders of magnitude — VIIRS is nightly,
    // LMOP publishes 2-3 times a year, grid prices are continuous. Running them on one job would
    // either hammer a source that updates twice a year or starve one that updates hourly.
    function register(adapter) {
        if (!adapter || !adapter.id) throw new Error('SiteSources.register requires { id }');
        var hasFull = typeof adapter.fetch === 'function' && typeof adapter.normalize === 'function';
        var hasDiscover = typeof adapter.discover === 'function';
        if (!hasFull && !hasDiscover) {
            throw new Error('SiteSources.register requires either discover() or fetch()+normalize()');
        }
        _adapters = _adapters.filter(function(a) { return a.id !== adapter.id; });

        var entry = {
            id: adapter.id,
            label: adapter.label || adapter.id,
            energyType: adapter.energyType || 'unknown',
            dutyCyclePct: adapter.dutyCyclePct === undefined ? 100 : adapter.dutyCyclePct,
            counterpartyType: adapter.counterpartyType || null,
            developmentStage: adapter.developmentStage || null,
            offtakeState: adapter.offtakeState || null,
            permitState: adapter.permitState || null,
            fetch: adapter.fetch || null,
            normalize: adapter.normalize || null,
            computePersistence: adapter.computePersistence || null,
            computeCapacity: adapter.computeCapacity || null,
            refreshSchedule: typeof adapter.refreshSchedule === 'function'
                ? adapter.refreshSchedule
                : function() { return { everyDays: null, reason: 'not specified' }; }
        };

        // Compose the full contract into the same discover() everything downstream already
        // calls, so adding the richer form changed no consumer.
        entry.discover = hasDiscover ? adapter.discover : async function(opts) {
            var raws = await adapter.fetch(opts || {});
            if (!Array.isArray(raws)) throw new Error('fetch() did not return an array');
            var out = [];
            for (var i = 0; i < raws.length; i++) {
                var cand = adapter.normalize(raws[i], opts || {});
                if (!cand) continue;
                if (entry.computeCapacity && (cand.powerPotentialKw === null || cand.powerPotentialKw === undefined)) {
                    cand.powerPotentialKw = entry.computeCapacity(raws[i]);
                }
                if (entry.computePersistence && (cand.persistencePct === null || cand.persistencePct === undefined)) {
                    cand.persistencePct = entry.computePersistence(raws[i]);
                }
                // Gas runs continuously; intermittent sources declare their own duty cycle.
                // Carried here rather than left to each adapter so it can never be forgotten —
                // a missing duty cycle would silently make an intermittent site look like a
                // 24/7 one.
                if (cand.dutyCyclePct === null || cand.dutyCyclePct === undefined) {
                    cand.dutyCyclePct = entry.dutyCyclePct;
                }
                // Same pattern as dutyCyclePct: declared once on the adapter, stamped on every
                // candidate, so it can never be forgotten per-row. Unlike counterpartyType this
                // IS safe as a blanket default — every prospect from one source is at the same
                // development stage by construction.
                if (!cand.developmentStage && entry.developmentStage) {
                    cand.developmentStage = entry.developmentStage;
                }
                if (!cand.offtakeState && entry.offtakeState) cand.offtakeState = entry.offtakeState;
                if (!cand.permitState && entry.permitState) cand.permitState = entry.permitState;
                if (!cand.counterpartyType && entry.counterpartyType) cand.counterpartyType = entry.counterpartyType;
                out.push(cand);
            }
            return out;
        };

        _adapters.push(entry);
        return adapter.id;
    }

    // Per-source cadence, for a scheduler that runs each adapter on its own clock.
    function schedules() {
        return _adapters.map(function(a) {
            var s = a.refreshSchedule() || {};
            return { id: a.id, label: a.label, everyDays: s.everyDays === undefined ? null : s.everyDays,
                     reason: s.reason || null };
        });
    }

    function unregister(id) {
        var before = _adapters.length;
        _adapters = _adapters.filter(function(a) { return a.id !== id; });
        return _adapters.length !== before;
    }

    function list() {
        return _adapters.map(function(a) {
            return { id: a.id, label: a.label, energyType: a.energyType,
                     dutyCyclePct: a.dutyCyclePct, counterpartyType: a.counterpartyType };
        });
    }

    function get(id) {
        for (var i = 0; i < _adapters.length; i++) if (_adapters[i].id === id) return _adapters[i];
        return null;
    }

    function num(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = typeof v === 'number' ? v : parseFloat(v);
        return isFinite(n) ? n : null;
    }

    // Validates without repairing. A malformed candidate is reported, not silently coerced —
    // a bad coordinate that gets defaulted to 0,0 puts a site in the Gulf of Guinea.
    function validate(cand) {
        var errors = [];
        if (!cand || typeof cand !== 'object') return { ok: false, errors: ['not an object'] };
        for (var i = 0; i < REQUIRED.length; i++) {
            if (cand[REQUIRED[i]] === undefined || cand[REQUIRED[i]] === null || cand[REQUIRED[i]] === '') {
                errors.push('missing ' + REQUIRED[i]);
            }
        }
        var lat = num(cand.lat), lng = num(cand.lng);
        if (lat === null || lat < -90 || lat > 90) errors.push('lat out of range');
        if (lng === null || lng < -180 || lng > 180) errors.push('lng out of range');
        var kw = num(cand.powerPotentialKw);
        if (kw !== null && kw < 0) errors.push('powerPotentialKw negative');
        var conf = num(cand.confidence);
        if (conf !== null && (conf < 0 || conf > 1)) errors.push('confidence outside 0..1');
        return { ok: errors.length === 0, errors: errors };
    }

    // Fills in the optional fields so downstream code can read them without guarding, while
    // leaving genuinely unknown values as null rather than inventing them.
    function normalize(raw, sourceId) {
        raw = raw || {};
        return {
            id: raw.id,
            source: raw.source || sourceId || null,
            energyType: raw.energyType || 'unknown',
            // A human name where the source publishes one. Flares have none — a VIIRS detection
            // is identified only by position — so this is null for them and the UI falls back to
            // coordinates. Facilities, landfills and plants all have real names, and without
            // this field the whitelist silently dropped them.
            name: raw.name || null,
            // Who holds/owns the asset, as published by whatever registry the adapter read.
            // This belongs on the SHARED shape, not in a per-source side table: it previously
            // existed only as a flare-specific lookup keyed by flare id, so 9,765 facilities and
            // 1,908 landfills rendered "operator not identified" while their owner sat unused in
            // the artifact, and the "has an operator" filter silently discarded all of them.
            operator: raw.operator || null,
            // Kilometres to the nearest electrical substation, measured offline. null means not
            // measured — either outside the covered countries or nothing within the search
            // radius — and the scorer treats that as unmeasured rather than as "far".
            gridDistanceKm: raw.gridDistanceKm === undefined ? null : raw.gridDistanceKm,
            operatorSource: raw.operatorSource || null,
            lat: num(raw.lat),
            lng: num(raw.lng),
            country: raw.country || null,
            iso3: raw.iso3 || null,
            powerPotentialKw: num(raw.powerPotentialKw),
            // The observed spread behind powerPotentialKw, where a source can supply one. Null
            // means the source publishes a single figure, NOT that the figure is precise.
            powerLoKw: num(raw.powerLoKw),
            powerHiKw: num(raw.powerHiKw),
            confidence: num(raw.confidence),
            firstSeen: raw.firstSeen || null,
            lastSeen: raw.lastSeen || null,
            persistencePct: num(raw.persistencePct),
            // Size-independent persistence: observed in `yearsSeen` of `yearsTotal` annual
            // catalogs. Preferred over persistencePct for ranking — see site-scoring.js.
            yearsSeen: num(raw.yearsSeen),
            yearsTotal: num(raw.yearsTotal),
            trend: raw.trend || null,
            // Last date a satellite confirmed this source was actually burning, and how long
            // ago that was. null = never confirmed, which is NOT the same as confirmed dark.
            lastActive: raw.lastActive || null,
            daysSinceActive: num(raw.daysSinceActive),
            // Share of the year this source can actually run. 100 for gas; far lower for
            // curtailment, which is intermittent by nature. Lives on the shared shape so a
            // 2 MW intermittent site can never be compared naively against a 2 MW gas site.
            dutyCyclePct: raw.dutyCyclePct === undefined || raw.dutyCyclePct === null ? 100 : num(raw.dutyCyclePct),
            counterpartyType: raw.counterpartyType || null,
            regulatoryNotes: raw.regulatoryNotes || null,
            // ---- Acquisition axis. How far along the physical asset is, and what its output is
            // already committed to. A raw flare declares raw_resource as a FACT about the source,
            // not an inference from missing data — so the scorer never has to guess.
            developmentStage: raw.developmentStage || raw.development_stage || null,
            offtakeState: raw.offtakeState || raw.offtake_state || null,
            permitState: raw.permitState || raw.permit_state || null,
            distressSignals: Array.isArray(raw.distressSignals) ? raw.distressSignals
                           : (Array.isArray(raw.distress_signals) ? raw.distress_signals : []),
            // Source-specific payload. The ONLY place source-specific data is allowed to live,
            // and it is rendered in exactly one section of the detail view.
            sourceDetail: raw.sourceDetail || null,
            offshore: (raw.offshore === true || raw.offshore === false) ? raw.offshore : null,
            evidence: Array.isArray(raw.evidence) ? raw.evidence : [],
            raw: raw.raw === undefined ? null : raw.raw
        };
    }

    // Runs the named adapters (all of them when ids is omitted) and returns normalized,
    // validated candidates plus whatever was rejected and why. Rejects are RETURNED, not
    // swallowed — a source silently dropping 30% of its rows is exactly the failure that
    // makes a sourcing tool untrustworthy.
    async function discover(ids, opts) {
        var targets = _adapters;
        if (Array.isArray(ids) && ids.length) {
            targets = _adapters.filter(function(a) { return ids.indexOf(a.id) >= 0; });
        }
        var accepted = [], rejected = [], errors = [];
        for (var i = 0; i < targets.length; i++) {
            var a = targets[i];
            var out;
            try {
                out = await a.discover(opts || {});
            } catch (e) {
                errors.push({ source: a.id, error: e && e.message ? e.message : String(e) });
                continue;
            }
            if (!Array.isArray(out)) {
                errors.push({ source: a.id, error: 'discover() did not return an array' });
                continue;
            }
            for (var j = 0; j < out.length; j++) {
                var cand = normalize(out[j], a.id);
                if (!cand.energyType || cand.energyType === 'unknown') cand.energyType = a.energyType;
                var v = validate(cand);
                if (v.ok) accepted.push(cand);
                else rejected.push({ source: a.id, candidate: out[j], errors: v.errors });
            }
        }
        return { candidates: accepted, rejected: rejected, errors: errors };
    }

    // The bridge into the evaluation engine: a discovered candidate becomes a site whose
    // usable_kw came from satellite//estimate rather than a vendor quote. Everything downstream
    // is then identical, which is what makes "a flare prospect" and "a vendor offer" the same
    // object to the rest of the system.
    //
    // Maps a candidate onto site-model.js's SOURCES enum. Anything not manual and not a flare is
    // 'discovery' — the generic "an adapter found this" bucket. Flares keep their own value so
    // records saved before multi-source support are unchanged.
    function siteSourceFor(cand) {
        if (!cand || cand.source === 'manual') return 'manual';
        if (cand.energyType === 'flare_gas' || cand.source === 'flare-viirs') return 'flare_detection';
        return 'discovery';
    }

    // overrides carries the commercial terms a candidate cannot know (price, rate, contract).
    function toSite(cand, overrides) {
        cand = cand || {};
        var site = {
            id: cand.id,
            name: cand.name || (cand.source ? cand.source + ':' + cand.id : cand.id),
            status: 'prospect',
            // Derived from what the candidate actually is. This used to be a flat
            // 'flare_detection' for every non-manual candidate, which would have stamped a
            // landfill or a curtailed wind farm as a flare the moment it was promoted to a site
            // record — a source-type branch inside the one function that is supposed to make
            // every source look the same.
            source: siteSourceFor(cand),
            energy_type: cand.energyType || 'unknown',
            operator: cand.operator || null,
            operator_source: cand.operatorSource || null,
            development_stage: cand.developmentStage || null,
            offtake_state: cand.offtakeState || null,
            permit_state: cand.permitState || null,
            distress_signals: Array.isArray(cand.distressSignals) ? cand.distressSignals.slice() : [],
            latitude: cand.lat,
            longitude: cand.lng,
            jurisdiction: cand.iso3 || cand.country || null,

            // Capacity comes from the estimate. nameplate is left null on purpose: the source
            // knows what the energy can support, not what equipment a producer installed.
            nameplate_kw: null,
            usable_kw: cand.powerPotentialKw,

            // Commercial terms are unknown until someone negotiates them. Left null so the
            // engine reports them as missing instead of scoring the site as if it were free.
            purchase_price_usd: null,
            power_rate: null,
            power_rate_currency: null,
            take_or_pay_pct: null,
            contract_term_years: null,

            discovery: {
                confidence: cand.confidence,
                persistencePct: cand.persistencePct,
                firstSeen: cand.firstSeen,
                lastSeen: cand.lastSeen,
                trend: cand.trend,
                offshore: cand.offshore,
                evidence: cand.evidence
            }
        };
        if (overrides) {
            for (var k in overrides) {
                if (Object.prototype.hasOwnProperty.call(overrides, k)) site[k] = overrides[k];
            }
        }
        return site;
    }

    return {
        register: register,
        unregister: unregister,
        schedules: schedules,
        list: list,
        get: get,
        validate: validate,
        normalize: normalize,
        discover: discover,
        toSite: toSite,
        REQUIRED: REQUIRED
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SiteSources;
