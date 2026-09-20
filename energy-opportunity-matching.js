/* Shared, evidence-first US energy screening. A score is research priority, never
 * a return forecast, an availability claim, or a guarantee of the cheapest power.
 * No IO: callers own inventory loading, evidence collection, and client storage.
 *
 * Owner evidence is keyed by availableMw, deliveredCentsKwh, energyCentsKwh,
 * capitalUsd, rights, supply, operation, uptimePct, readyBy, connectionReadiness,
 * termMonths and chargingPlan. Every item needs {value, confirmedBy:'owner',
 * asOf:'YYYY-MM-DD', source:'attributable source'}; validThrough is optional.
 * Facts expire after 90 days even when a longer offer expiry was recorded.
 * Commercial applicability needs quotedMinMw/quotedMaxMw, matching scopeBriefId
 * AND scopeBriefRevision for an immutable brief version,
 * or evidenceAppliesToBrief:true set by a caller that has compared the EXACT
 * current normalized client brief with the saved evidence scope. Callers must
 * clear that flag when any brief arrangement changes; it is not a global trust
 * flag. An explicit scope or quote-size mismatch always wins over the flag.
 * Client notes and additionalRequirements are preserved as normalized text.
 * Nonempty narrative requirements always need explicit human interpretation and
 * verification; structured owner evidence does not silently satisfy them.
 *
 * Qualified means qualified_for_review, never secured or contracted. This pure
 * screener cannot verify authenticity, engineering feasibility or legal rights;
 * the caller must collect and review the attributed source before recording it.
 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.EnergyOpportunityMatching = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    var sourceTypes = [
        ['landfill_gas', 'Landfill gas'], ['flare_gas', 'Flare gas'], ['hydro', 'Hydropower'],
        ['nuclear', 'Nuclear'], ['wind', 'Wind'], ['solar', 'Solar'], ['geothermal', 'Geothermal'],
        ['natural_gas', 'Natural gas'], ['biomass_biogas', 'Biomass / biogas'], ['coal', 'Coal'],
        ['oil', 'Oil'], ['industrial_surplus', 'Industrial surplus'], ['grid_supply', 'Grid supply'],
        ['waste_to_energy', 'Waste to energy'], ['marine', 'Marine energy'], ['recovered_energy', 'Recovered energy'],
        ['hybrid', 'Hybrid / mixed supply'], ['storage', 'Storage (charging plan required)'],
        ['unknown', 'Unclassified technology'], ['other', 'Other']
    ].map(function (t) { return Object.freeze({ id: t[0], label: t[1] }); });
    Object.freeze(sourceTypes);
    var typeIds = sourceTypes.map(function (t) { return t.id; });
    var states = ('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR VI GU AS MP').split(' ');
    var DAY = 86400000, MAX_EVIDENCE_DAYS = 90;
    var territories = { PR: 'PRI', VI: 'VIR', GU: 'GUM', AS: 'ASM', MP: 'MNP' };
    var aliases = { petroleum: 'oil', biomass: 'biomass_biogas', biogas: 'biomass_biogas' };
    function own(o, k) { return Object.prototype.hasOwnProperty.call(o || {}, k); }
    function text(v) { return typeof v === 'string' ? v.trim() : ''; }
    function number(v) { return typeof v === 'number' && Number.isFinite(v) ? v : null; }
    function nonnegative(v) { var n = number(v); return n !== null && n >= 0 ? n : null; }
    function unique(a) { return Array.from(new Set(a)); }
    function date(v) {
        if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
        var ms = Date.parse(v + 'T00:00:00Z');
        return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === v ? ms : null;
    }
    function url(v) { return typeof v === 'string' && /^https?:\/\//i.test(v) ? v : null; }
    function numericInput(raw, key, fallback, allowZero) {
        if (!own(raw, key) || raw[key] === null || raw[key] === undefined || (raw[key] === '' && fallback === null)) return fallback;
        var v = raw[key], n = typeof v === 'number' || (typeof v === 'string' && v.trim()) ? Number(v) : NaN;
        if (!Number.isFinite(n) || (allowZero ? n < 0 : n <= 0)) throw new Error(key + ' must be a finite ' + (allowZero ? 'nonnegative' : 'positive') + ' number.');
        return n;
    }
    function listInput(raw, key, allowed, upper) {
        if (!own(raw, key) || raw[key] === undefined || raw[key] === null) return [];
        if (!Array.isArray(raw[key])) throw new Error(key + ' must be a list.');
        return unique(raw[key].map(function (v) {
            var s = text(v); if (upper) s = s.toUpperCase(); else if (allowed === typeIds && aliases[s]) s = aliases[s];
            if (allowed.indexOf(s) < 0) throw new Error('Unknown ' + key + ' value: ' + String(v) + '.');
            return s;
        })).sort();
    }
    function enumInput(raw, key, allowed, fallback) {
        var v = raw[key] === undefined || raw[key] === null || raw[key] === '' ? fallback : raw[key];
        if (allowed.indexOf(v) < 0) throw new Error(key + ' must be one of: ' + allowed.join(', ') + '.');
        return v;
    }
    function narrativeInput(raw, key) {
        var v = raw[key];
        if (v === undefined || v === null) return '';
        if (typeof v !== 'string') throw new Error(key + ' must be text.');
        return v.replace(/\r\n?/g, '\n').trim();
    }
    function normalizeBrief(raw) {
        if (raw === undefined) raw = {};
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Client brief must be an object.');
        var b = {
            id: text(raw.id) || null, revision: raw.revision === undefined || raw.revision === null ? null : String(raw.revision),
            notes: narrativeInput(raw, 'notes'), additionalRequirements: narrativeInput(raw, 'additionalRequirements'),
            states: listInput(raw, 'states', states, true), excludedStates: listInput(raw, 'excludedStates', states, true),
            energySources: listInput(raw, 'energySources', typeIds),
            excludedSources: listInput(raw, 'excludedSources', typeIds), minMw: numericInput(raw, 'minMw', 1, false),
            maxMw: numericInput(raw, 'maxMw', null, false), maxDeliveredCentsKwh: numericInput(raw, 'maxDeliveredCentsKwh', null, false),
            maxEnergyCentsKwh: numericInput(raw, 'maxEnergyCentsKwh', null, false), minTermMonths: numericInput(raw, 'minTermMonths', null, false),
            maxSiteCapitalUsd: numericInput(raw, 'maxSiteCapitalUsd', null, true),
            supply: enumInput(raw, 'supply', ['either', 'electricity', 'fuel'], 'either'),
            operation: enumInput(raw, 'operation', ['flexible', 'continuous', 'interruptible', 'seasonal'], 'flexible'),
            connectionReadiness: enumInput(raw, 'connectionReadiness', ['any', 'existing', 'new_build_allowed'], 'any'),
            minUptimePct: numericInput(raw, 'minUptimePct', null, true), startBy: raw.startBy === undefined || raw.startBy === null || raw.startBy === '' ? null : raw.startBy
        };
        if (raw.knownSiteExclusions !== undefined && !Array.isArray(raw.knownSiteExclusions)) throw new Error('knownSiteExclusions must be a list of exact stable IDs.');
        b.knownSiteExclusions = unique((raw.knownSiteExclusions || []).map(function (id) { if (!text(id)) throw new Error('Known site exclusions require nonempty exact IDs.'); return id.trim(); })).sort();
        if (b.maxMw !== null && b.maxMw < b.minMw) throw new Error('maxMw cannot be smaller than minMw; it describes the client allocation, not plant size.');
        if (b.minUptimePct !== null && b.minUptimePct > 100) throw new Error('minUptimePct cannot exceed 100.');
        if (b.startBy !== null && date(b.startBy) === null) throw new Error('startBy must be a real calendar date in YYYY-MM-DD format.');
        if (b.energySources.some(function (s) { return b.excludedSources.indexOf(s) >= 0; })) throw new Error('An energy source cannot be both selected and excluded.');
        if (b.states.some(function (s) { return b.excludedStates.indexOf(s) >= 0; })) throw new Error('A state cannot be both selected and excluded.');
        return b;
    }
    function technology(raw) {
        var exact = raw.energyTechnologies || raw.energyTypes || (raw.energyTechnology ? [raw.energyTechnology] : []);
        var valid = Array.isArray(exact) ? unique(exact.map(function (t) { return aliases[t] || t; }).filter(function (t) { return typeIds.indexOf(t) >= 0; })) : [];
        if (valid.length) return valid;
        var t = text(raw.technology || (raw.sourceDetail && raw.sourceDetail.technology) || raw.energyType).toLowerCase();
        if (/pumped|batter|storage|flywheel/.test(t)) return ['storage'];
        if (/landfill/.test(t)) return ['landfill_gas'];
        if (/nuclear/.test(t)) return ['nuclear'];
        if (/hydro/.test(t)) return ['hydro'];
        if (/geothermal/.test(t)) return ['geothermal'];
        if (/tidal|wave|marine|ocean/.test(t)) return ['marine'];
        if (/waste heat|recovered/.test(t)) return ['recovered_energy'];
        if (/wind/.test(t)) return ['wind'];
        if (/solar/.test(t)) return ['solar'];
        if (/coal/.test(t)) return ['coal'];
        if (/natural gas|^ng$/.test(t)) return ['natural_gas'];
        if (/municipal solid waste|waste.to.energy/.test(t)) return ['waste_to_energy'];
        if (/biomass|biogas|wood|waste|agricultur|sludge/.test(t)) return ['biomass_biogas'];
        if (/petroleum|diesel|oil/.test(t)) return ['oil'];
        if (/industrial_surplus/.test(t)) return ['industrial_surplus'];
        if (/^grid_supply$/.test(t)) return ['grid_supply'];
        return ['unknown'];
    }
    function country(raw, fallback) {
        var c = text(raw.iso3 || raw.countryCode || raw.country).toUpperCase();
        if (['US', 'USA', 'UNITED STATES', 'UNITED STATES OF AMERICA'].indexOf(c) >= 0) return 'USA';
        return c || fallback || null;
    }
    function base(raw, meta, source, id, physicalId) {
        meta = meta || {};
        var st = text(raw.state || raw.region).toUpperCase();
        return {
            id: id, physicalId: text(raw.physicalId) || physicalId || id, source: source,
            sourceRecordIds: unique([String(raw.id || id), source + ':' + String(raw.id || id)]), name: text(raw.name) || text(raw.projectName) || id,
            country: country(raw, source === 'eia' || source === 'lmop' ? 'USA' : null),
            state: states.indexOf(st) >= 0 ? st : null, energyTypes: [], nameplateMw: null, resourcePotentialMw: null,
            availableMw: null, deliveredCentsKwh: null, energyCentsKwh: null, capitalUsd: null,
            operator: text(raw.operator || raw.owner) || null,
            lat: number(raw.lat), lng: number(raw.lng === undefined ? raw.lon : raw.lng),
            sourceUrl: url(raw.sourceUrl) || url(meta.sourceUrl),
            observedAt: raw.observedAt || meta.sourceReleaseDate || (meta.eia860Year ? meta.eia860Year + '-12-31' : null),
            evidence: raw.ownerEvidence && typeof raw.ownerEvidence === 'object' && !Array.isArray(raw.ownerEvidence) ? raw.ownerEvidence : {},
            evidenceAppliesToBrief: raw.evidenceAppliesToBrief === true,
            notes: []
        };
    }
    function fromFacility(raw, meta) {
        if (!raw || typeof raw !== 'object') throw new Error('A facility record is required.');
        var plant = text(String(raw.plantCode || '')), id = plant ? 'eia:plant:' + plant : 'eia:' + text(raw.id);
        if (!plant && !text(raw.id)) throw new Error('Facility needs an EIA plant code or stable record ID.');
        var c = base(raw, meta, 'eia', id, id);
        c.energyTypes = technology(raw); c.nameplateMw = nonnegative(raw.nameplateMw);
        c.technology = text(raw.technology); c.inventoryStatus = text(raw.statusLabel || raw.status);
        c.notes.push('Reported nameplate capacity is plant size, not an available allocation. Generation or capacity factor does not establish uptime, curtailment or uncontracted power.');
        if (c.energyTypes.indexOf('storage') >= 0) c.notes.push('Storage consumes charging energy; obtain its source, price, losses and dispatch plan.');
        return c;
    }
    function fromLandfill(raw, meta) {
        if (!raw || !raw.id) throw new Error('Landfill needs a stable project ID.');
        var id = raw.lfid ? 'lmop:landfill:' + raw.lfid : 'lmop:project:' + raw.id;
        var c = base(raw, meta, 'lmop', id, id); c.energyTypes = ['landfill_gas'];
        var kw = nonnegative(raw.powerPotentialKw); c.resourcePotentialMw = kw === null ? null : kw / 1000;
        if (/engine|turbine|electric|cogeneration|combined cycle|rankine|fuel cell|linear generator/i.test(raw.projectType || '') && /^(operational|shutdown)$/i.test(raw.projectStatus || '')) {
            c.nameplateMw = nonnegative(raw.ratedMw);
        }
        c.inventoryStatus = text(raw.projectStatus);
        c.notes.push('Reported project capacity or gas-derived potential does not establish current usable equipment, uncommitted gas or available electricity.');
        return c;
    }
    function fingerprint(v) { var s = JSON.stringify(v), h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }
    function fromFlare(raw, meta) {
        meta = meta || {};
        if (Array.isArray(raw)) {
            var packed = raw, fields = meta.fields || ['lat', 'lon', 'iso3', 'kw', 'persistPct', 'onshore', 'yearsSeen', 'firstYear', 'lastYear', 'trend', 'kwByYear', 'tempK', 'kwLo', 'kwHi'];
            raw = {}; fields.forEach(function (f, i) { raw[f] = packed[i]; });
            raw.id = meta.recordId || ('vnf_' + raw.lat + '_' + raw.lon + '_' + fingerprint(packed));
        }
        if (!raw || !raw.id) throw new Error('Flare needs its stable survey record ID.');
        var id = 'flare:' + raw.id, c = base(raw, meta, 'viirs', id, id); c.energyTypes = ['flare_gas'];
        var kw = nonnegative(raw.powerPotentialKw === undefined ? raw.kw : raw.powerPotentialKw);
        c.resourcePotentialMw = kw === null ? null : kw / 1000;
        c.observedAt = raw.lastYear ? raw.lastYear + '-12-31' : meta.dataThrough ? meta.dataThrough + '-12-31' : null;
        c.notes.push('Satellite-derived thermal resource potential is not metered fuel, available electrical MW, gas rights or operating uptime.');
        return c;
    }
    function evidenceFor(candidate, key, now, brief) {
        var e = candidate.evidence && candidate.evidence[key];
        if (!e || typeof e !== 'object' || Array.isArray(e)) return { value: null, reason: 'not owner-confirmed' };
        if (e.confirmedBy !== 'owner' || !text(e.source)) return { value: null, reason: 'owner attribution or source missing' };
        var asOf = date(e.asOf), valid = e.validThrough === undefined || e.validThrough === null ? null : date(e.validThrough);
        if (asOf === null || asOf > now || (own(e, 'validThrough') && e.validThrough !== null && valid === null) || (valid !== null && valid < asOf)) return { value: null, reason: 'invalid or future evidence date' };
        if (now - asOf >= (MAX_EVIDENCE_DAYS + 1) * DAY || (valid !== null && now >= valid + DAY)) return { value: null, reason: 'owner evidence expired; reconfirm it' };
        var v = e.value;
        if (['availableMw', 'deliveredCentsKwh', 'energyCentsKwh', 'capitalUsd', 'uptimePct', 'termMonths'].indexOf(key) >= 0 && nonnegative(v) === null) return { value: null, reason: 'invalid numeric owner evidence' };
        if (key === 'availableMw' && ['offered_electrical_capacity', 'verified_fuel_electric_equivalent'].indexOf(e.basis) < 0) return { value: null, reason: 'allocation basis unverified; nameplate is not availability' };
        if (key === 'availableMw' && brief && brief.supply === 'electricity' && e.basis !== 'offered_electrical_capacity') return { value: null, reason: 'electricity delivery requires an offered electrical allocation, not fuel-equivalent MW' };
        if (key === 'deliveredCentsKwh' && (e.currency !== 'USD' || e.unit !== 'cents/kWh' || e.basis !== 'delivered_all_in')) return { value: null, reason: 'price is not comparable all-in delivered USD cents/kWh' };
        if (key === 'energyCentsKwh' && (e.currency !== 'USD' || e.unit !== 'cents/kWh' || e.basis !== 'energy_only')) return { value: null, reason: 'price is not comparable energy-only USD cents/kWh' };
        if (key === 'capitalUsd' && (e.currency !== 'USD' || e.scope !== 'client_total_site')) return { value: null, reason: 'client total site capital scope is not confirmed' };
        if (key === 'rights' && ['available', 'unavailable'].indexOf(v) < 0) return { value: null, reason: 'sale/use rights are unresolved' };
        if (key === 'supply' && ['either', 'electricity', 'fuel'].indexOf(v) < 0) return { value: null, reason: 'delivery product is unresolved' };
        if (key === 'operation' && ['continuous', 'interruptible', 'seasonal'].indexOf(v) < 0) return { value: null, reason: 'operating schedule is unresolved' };
        if (key === 'connectionReadiness' && ['existing', 'new_build_required'].indexOf(v) < 0) return { value: null, reason: 'usable load connection is unresolved' };
        if (key === 'uptimePct' && v > 100) return { value: null, reason: 'uptime cannot exceed 100%' };
        if (key === 'readyBy' && date(v) === null) return { value: null, reason: 'energization date is unresolved' };
        if (key === 'chargingPlan' && (typeof v !== 'string' || !v.trim())) return { value: null, reason: 'charging source, cost, losses and dispatch plan are unresolved' };
        if (brief && e.scopeBriefId !== undefined && (!brief.id || e.scopeBriefId !== brief.id)) return { value: null, reason: 'owner evidence belongs to another client brief' };
        if (brief && e.scopeBriefRevision !== undefined && String(e.scopeBriefRevision) !== brief.revision) return { value: null, reason: 'owner evidence belongs to another brief revision' };
        if (brief && ['availableMw', 'deliveredCentsKwh', 'energyCentsKwh', 'capitalUsd'].indexOf(key) >= 0) {
            var quotedMin = nonnegative(e.quotedMinMw), quotedMax = nonnegative(e.quotedMaxMw), wantedMax = brief.maxMw === null ? brief.minMw : brief.maxMw;
            var hasBounds = own(e, 'quotedMinMw') || own(e, 'quotedMaxMw');
            var boundsMatch = quotedMin !== null && quotedMax !== null && quotedMin > 0 && quotedMax >= quotedMin && quotedMin <= brief.minMw && quotedMax >= wantedMax;
            if (hasBounds && !boundsMatch) return { value: null, reason: 'quote allocation range does not cover this client brief' };
            var callerBound = candidate.evidenceAppliesToBrief === true && (!candidate.evidenceBriefKey || candidate.evidenceBriefKey === JSON.stringify(brief));
            var versionBound = brief.id && text(brief.revision) && e.scopeBriefId === brief.id && e.scopeBriefRevision !== undefined && e.scopeBriefRevision !== null && String(e.scopeBriefRevision) === brief.revision;
            if (!boundsMatch && !callerBound && !versionBound) return { value: null, reason: 'confirm that the owner evidence applies to this client allocation and arrangement; a brief ID alone is insufficient' };
        }
        return { value: v, reason: null, evidence: e };
    }
    function evaluate(candidate, rawBrief, options) {
        if (!candidate || typeof candidate !== 'object' || !candidate.id) throw new Error('A normalized candidate with a stable ID is required.');
        var brief = normalizeBrief(rawBrief), now = options && options.now !== undefined ? new Date(options.now).getTime() : Date.now();
        if (!Number.isFinite(now)) throw new Error('now must be a valid evaluation date.');
        var reasons = [], missing = [], disqualifiers = [], checks = {}, score = 10;
        var c = Object.assign({}, candidate, { availableMw: null, deliveredCentsKwh: null, energyCentsKwh: null, capitalUsd: null });
        var types = Array.isArray(c.energyTypes) ? unique(c.energyTypes.filter(function (t) { return typeIds.indexOf(t) >= 0; })) : [];
        var explicitTerritory = own(territories, c.state) && brief.states.indexOf(c.state) >= 0;
        var allowedCountry = c.country === 'USA' || (explicitTerritory && c.country === territories[c.state]);
        if (c.country && !allowedCountry) disqualifiers.push('Outside the United States search area and explicitly selected territories.');
        else if (!c.country) missing.push('Confirm that the physical site is in the United States.');
        else { score += 5; reasons.push(explicitTerritory ? 'Explicitly selected US territory recorded.' : 'US location recorded.'); }
        if (own(territories, c.state) && !explicitTerritory) disqualifiers.push('US territory is outside the default 50-state and DC search; select it explicitly to include it.');
        if (c.state && brief.excludedStates.indexOf(c.state) >= 0) disqualifiers.push('State is explicitly excluded by the client.');
        var identifiers = [c.id, c.physicalId].concat(c.sourceRecordIds || []);
        if (identifiers.some(function (id) { return brief.knownSiteExclusions.indexOf(id) >= 0; })) disqualifiers.push('Site ID is explicitly excluded by the client.');
        if (!c.state) missing.push('Confirm state before matching the national or selected geography.');
        else if (brief.states.length && brief.states.indexOf(c.state) < 0) disqualifiers.push('State is outside the client search area.');
        else if (c.state) { score += 5; reasons.push('State matches the geographic brief.'); }
        if (types.some(function (t) { return brief.excludedSources.indexOf(t) >= 0; })) disqualifiers.push('Facility includes an energy source excluded by the client; a separately evidenced supply allocation is required.');
        if (brief.energySources.length && types.length && !types.some(function (t) { return ['other', 'unknown', 'hybrid'].indexOf(t) >= 0; }) && !types.some(function (t) { return brief.energySources.indexOf(t) >= 0; })) disqualifiers.push('Energy technology is outside the selected sources.');
        else if (!types.length || types.some(function (t) { return ['other', 'unknown', 'hybrid'].indexOf(t) >= 0; })) missing.push('Confirm the supply technology and all hybrid constituents.');
        else if (brief.energySources.length && types.some(function (t) { return brief.energySources.indexOf(t) < 0; })) missing.push('Confirm that the offered allocation uses only the client\'s permitted energy sources; this mixed plant includes other source types.');
        else { score += 8; reasons.push('Reported technology matches the source preferences.'); }
        if (c.operator) score += 3;
        if (Number.isFinite(c.lat) && Number.isFinite(c.lng)) score += 2;
        if (c.sourceUrl) score += 2;
        if (c.nameplateMw !== null && c.nameplateMw >= brief.minMw) { score += 3; reasons.push('Reported plant size merits allocation research; no uncommitted MW are inferred.'); }
        function check(key, label, weight) {
            var r = evidenceFor(c, key, now, brief); checks[key] = r;
            if (r.value === null) missing.push(label + ': ' + r.reason + '.');
            else { score += weight; reasons.push(label + ' has current owner-confirmed evidence.'); }
            return r.value;
        }
        c.availableMw = check('availableMw', 'Available client allocation', 13);
        c.deliveredCentsKwh = check('deliveredCentsKwh', 'All-in delivered energy price', 13);
        if (brief.maxEnergyCentsKwh !== null) {
            c.energyCentsKwh = check('energyCentsKwh', 'Energy-only price', 1);
            if (c.energyCentsKwh !== null && c.energyCentsKwh > brief.maxEnergyCentsKwh) disqualifiers.push('Comparable energy-only price exceeds the client ceiling.');
        }
        c.capitalUsd = check('capitalUsd', 'Client total site capital', 10);
        var rights = check('rights', 'Sale and site-use rights', 9), supply = check('supply', 'Delivery product', 7), operation = check('operation', 'Operating schedule', 5);
        if (rights === 'unavailable') disqualifiers.push('Owner confirms that the required sale or site-use rights are unavailable.');
        if (c.availableMw !== null && c.availableMw < brief.minMw) disqualifiers.push('Confirmed available allocation is below the minimum MW.');
        if (c.availableMw !== null && brief.maxMw !== null && c.availableMw > brief.maxMw) missing.push('Confirm that the owner will sell a smaller allocation within the preferred client range.');
        if (c.deliveredCentsKwh !== null && brief.maxDeliveredCentsKwh !== null && c.deliveredCentsKwh > brief.maxDeliveredCentsKwh) disqualifiers.push('Comparable delivered energy price exceeds the client ceiling.');
        if (c.capitalUsd !== null && brief.maxSiteCapitalUsd !== null && c.capitalUsd > brief.maxSiteCapitalUsd) disqualifiers.push('Confirmed client site capital exceeds the client budget.');
        if (supply && supply !== 'either' && brief.supply !== 'either' && supply !== brief.supply) disqualifiers.push('Confirmed delivery product does not match the requested fuel/electricity supply.');
        if (brief.operation === 'continuous' && operation && operation !== 'continuous') disqualifiers.push('Confirmed schedule does not support the required continuous operation.');
        if (brief.operation === 'interruptible' && operation === 'seasonal') missing.push('Confirm that seasonal interruptions fit the client operating window.');
        if (brief.minUptimePct !== null) { var uptime = check('uptimePct', 'Contracted service uptime', 2); if (uptime !== null && uptime < brief.minUptimePct) disqualifiers.push('Confirmed service uptime is below the requested minimum.'); }
        if (brief.startBy) { var ready = check('readyBy', 'Energization schedule', 2); if (ready && date(ready) > date(brief.startBy)) disqualifiers.push('Confirmed energization is after the requested start date.'); }
        if (brief.connectionReadiness !== 'any') { var connection = check('connectionReadiness', 'Usable load connection', 1); if (connection === 'new_build_required' && brief.connectionReadiness === 'existing') disqualifiers.push('A new load connection is required but the client requires an existing usable connection.'); }
        if (brief.minTermMonths !== null) { var term = check('termMonths', 'Offered contract term', 1); if (term !== null && term < brief.minTermMonths) disqualifiers.push('Confirmed contract term is shorter than the client minimum.'); }
        if (types.indexOf('storage') >= 0) check('chargingPlan', 'Storage charging plan', 1);
        if ((supply === 'electricity' || brief.supply === 'electricity') && checks.availableMw.value !== null && checks.availableMw.evidence.basis !== 'offered_electrical_capacity') missing.push('Electricity delivery requires an offered electrical allocation; fuel-equivalent MW are insufficient.');
        ['notes', 'additionalRequirements'].forEach(function (field) {
            if (!brief[field]) return;
            var reason = field === 'notes' ? 'Client narrative notes require interpretation and verification.' : 'Additional client requirements require interpretation and verification.';
            checks[field] = { value: null, reason: reason }; missing.push(reason);
        });
        var status = disqualifiers.length ? 'excluded' : missing.length ? 'needs_confirmation' : 'qualified_for_review';
        return { candidate: c, status: status, score: disqualifiers.length ? 0 : Math.min(100, score), scoreLabel: 'Screening priority',
            rankingBasis: status === 'qualified_for_review' ? 'Comparable owner-confirmed delivered price, then client site capital, then evidence score.' : 'Evidence and client fit first; comparable confirmed costs break ties. Unknown costs are not zero.',
            reasons: reasons, missing: missing, disqualifiers: disqualifiers, checks: checks };
    }
    function rank(candidates, brief, options) {
        if (!Array.isArray(candidates)) throw new Error('Candidates must be a list.');
        options = options || {}; var b = normalizeBrief(brief), groups = new Map(), levels = { qualified_for_review: 0, needs_confirmation: 1, excluded: 2 };
        // Merge inventory rows only when their explicit physical identifiers agree. Never
        // sum plant/project/unit MW: those observations can describe the same equipment.
        candidates.forEach(function (c) {
            if (!c || !c.id) throw new Error('Every candidate needs a stable ID.');
            var key = c.physicalId || c.id, prior = groups.get(key);
            if (!prior) { groups.set(key, Object.assign({}, c, { sourceRecordIds: (c.sourceRecordIds || [c.id]).slice(), energyTypes: (c.energyTypes || []).slice() })); return; }
            var a = evaluate(prior, b, options), z = evaluate(c, b, options);
            var keep = z.score > a.score ? Object.assign({}, c) : prior;
            keep.sourceRecordIds = unique((prior.sourceRecordIds || [prior.id]).concat(c.sourceRecordIds || [c.id]));
            keep.energyTypes = unique((prior.energyTypes || []).concat(c.energyTypes || []));
            // Conflicting current owner statements are not resolved by choosing a higher score.
            var ev = {}, conflicts = unique((prior.conflictingEvidence || []).concat(c.conflictingEvidence || []));
            unique(Object.keys(prior.evidence || {}).concat(Object.keys(c.evidence || {}))).forEach(function (field) {
                var p = evidenceFor(prior, field, options.now !== undefined ? new Date(options.now).getTime() : Date.now(), b), q = evidenceFor(c, field, options.now !== undefined ? new Date(options.now).getTime() : Date.now(), b);
                if (conflicts.indexOf(field) >= 0) return;
                if (p.value !== null && q.value !== null && JSON.stringify(p.value) !== JSON.stringify(q.value)) { conflicts.push(field); return; }
                if (q.value !== null || p.value !== null) ev[field] = q.value !== null ? q.evidence : p.evidence;
            });
            // Every retained statement passed applicability for this exact brief. Bind the
            // merged observation so reusing it under a changed brief cannot extend the quote.
            keep.evidence = ev; keep.evidenceAppliesToBrief = true; keep.evidenceBriefKey = JSON.stringify(b);
            keep.conflictingEvidence = conflicts; groups.set(key, keep);
        });
        function costOrder(a, z, field) {
            var x = a.candidate[field], y = z.candidate[field];
            if (x === null && y === null) return 0;
            if (x === null) return 1; if (y === null) return -1;
            return x - y;
        }
        var ranked = Array.from(groups.values()).map(function (c) { return evaluate(c, b, options); }).sort(function (a, z) {
            return levels[a.status] - levels[z.status] ||
                (a.status === 'qualified_for_review' ? costOrder(a, z, 'deliveredCentsKwh') || costOrder(a, z, 'capitalUsd') || z.score - a.score : z.score - a.score || costOrder(a, z, 'deliveredCentsKwh') || costOrder(a, z, 'capitalUsd')) ||
                String(a.candidate.name).localeCompare(String(z.candidate.name)) || String(a.candidate.id).localeCompare(String(z.candidate.id));
        });
        if (options.limit !== undefined) { if (!Number.isInteger(options.limit) || options.limit < 0) throw new Error('limit must be a nonnegative integer.'); return ranked.slice(0, options.limit); }
        return ranked;
    }
    return Object.freeze({ sourceTypes: sourceTypes, normalizeBrief: normalizeBrief, fromFacility: fromFacility, fromLandfill: fromLandfill, fromFlare: fromFlare, evaluate: evaluate, rank: rank });
}));
