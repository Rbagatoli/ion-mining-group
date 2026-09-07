/* Evidence and remaining-capital ledger for prospect screening. Public records do not grant asset access. */
var ProspectDiligence = (function () {
    'use strict';
    var KEY = '_proton_diligence_v1';
    var COMPONENTS = [
        ['collection', 'Gas collection & flare', 'Wellfield, headers, condensate handling, blower and flare; condition and capacity need inspection.'],
        ['gas_treatment', 'Gas treatment & compression', 'Gas analysis, moisture, siloxanes, H2S, pressure and treatment media.'],
        ['generation', 'Generation equipment', 'Engine-generator, controls, cooling, emissions equipment and installation.'],
        ['electrical', 'Generation electrical & protection', 'Generation-side transformer, switchgear, protection and cabling.'],
        ['civil', 'Generation civil works', 'Engine foundations, access, drainage and construction around the generating plant.'],
        ['mining_infrastructure', 'Mining infrastructure', 'Mining containers, cooling, mining-side pads, distribution, network and security.'],
        ['miners', 'Mining hardware', 'Miners, delivery, installation and initial spares.'],
        ['permits', 'Engineering & permits', 'Surveys, design, air/noise/environmental review and permit amendments or transfers.'],
        ['commissioning', 'Commissioning & testing', 'Startup, protection testing, emissions tests and performance acceptance.'],
        ['tie_in', 'Gas tie-in & metering', 'Pipeline route, easements, tie-in, custody meter and gas-quality monitoring.'],
        ['grid', 'Utility connection or islanding', 'Utility studies and upgrades, or documented islanding/protection requirements.'],
        ['acquisition', 'Site rights & transaction costs', 'Lease/acquisition, deposits, gas rights, legal work and closing costs.'],
        ['logistics', 'Freight, taxes & installation gaps', 'Transport, duties, taxes, cranes and labor excluded from supplier packages.'],
        ['reserves', 'Contingency & startup cash', 'Construction contingency, operating reserve and initial consumables.']
    ];
    var PRESENCE = [['unknown', 'Not established'], ['reported', 'Reported in a source'], ['present', 'Inspected on site'], ['historical', 'Historical / shutdown'], ['planned', 'Planned / under construction'], ['absent', 'Confirmed absent']];
    var CONDITIONS = [['unknown', 'Condition unknown'], ['working', 'Inspected and suitable'], ['rework', 'Needs refurbishment'], ['failed', 'Unusable']];
    var ACCESS = [['unknown', 'Access / rights unconfirmed'], ['agreed', 'Use agreed in writing'], ['denied', 'Unavailable to Proton']];
    var ACTIONS = [['unknown', 'Scope not agreed'], ['new', 'Buy / build'], ['refurbish', 'Refurbish / upgrade'], ['reuse', 'Reuse with no additional capex'], ['included', 'Included in another line'], ['not_required', 'Not required by the agreed design']];
    var PAYERS = [['unknown', 'Funding not assigned'], ['proton', 'Proton'], ['partner', 'Partner funding agreed'], ['shared', 'Shared funding agreed']];
    var SOURCES = {
        lmop: 'https://www.epa.gov/lmop/landfill-technical-data',
        cost: 'https://www.epa.gov/system/files/documents/2023-09/lfgcost_web_v3.6_usersmanual_sep2023.pdf',
        eccc: 'https://open.canada.ca/data/en/dataset/a8ba14b7-7f23-462a-bdbb-83b0ef629823',
        eia: 'https://www.eia.gov/electricity/data/eia860/'
    };
    function own(o, k) { return Object.prototype.hasOwnProperty.call(o || {}, k); }
    function clone(v) { return JSON.parse(JSON.stringify(v)); }
    function str(v) { return v == null ? '' : String(v).trim(); }
    function num(v) { if ((typeof v !== 'number' && typeof v !== 'string') || str(v) === '') return null; var n = Number(v); return Number.isFinite(n) && n >= 0 ? n : null; }
    function day(v) { return /^\d{4}-\d{2}-\d{2}$/.test(str(v)) && Number.isFinite(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v; }
    function today(now) { return new Date(now == null ? Date.now() : now).toISOString().slice(0, 10); }
    function current(v, now, days) { var age = Date.parse(today(now)) - Date.parse(v); return day(v) && age >= 0 && age <= (days || 180) * 86400000; }
    function safeUrl(v) { try { var u = new URL(str(v)); return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u.href : null; } catch (_) { return null; } }
    function idKnown(id) { return COMPONENTS.some(function (x) { return x[0] === id; }); }
    function choice(list, value, name) { if (!list.some(function (x) { return x[0] === value; })) throw Error('Choose ' + name + '.'); return value; }
    function limited(v, name, max) { var s = str(v); if (s.length > max) throw Error(name + ' is too long.'); return s; }
    function blank() { return { v: 1, revision: 0, assets: {}, capacity: {}, history: [] }; }
    function state(site) {
        var raw = site && site.custom_fields && site.custom_fields[KEY];
        if (raw == null) return blank();
        if (!raw || raw.v !== 1 || !Number.isSafeInteger(raw.revision) || raw.revision < 0 || !raw.assets || Array.isArray(raw.assets) || !raw.capacity || !Array.isArray(raw.history)) return { error: 'Saved diligence is unreadable. Export the site backup before repairing it.' };
        if (Object.keys(raw.assets).some(function (id) { return !idKnown(id) || !raw.assets[id] || typeof raw.assets[id] !== 'object'; })) return { error: 'A saved infrastructure entry is invalid.' };
        return clone(raw);
    }
    function proof(v, now) {
        var out = {};
        ['source_url', 'evidence_note', 'reviewer', 'checked_on'].forEach(function (k) { out[k] = limited(v[k], k, k === 'evidence_note' ? 2000 : k === 'source_url' ? 2000 : 160); });
        if (out.source_url && !safeUrl(out.source_url)) throw Error('Use an http(s) source link without credentials.');
        if (!out.evidence_note || !out.reviewer || !day(out.checked_on) || out.checked_on > today(now)) throw Error('Record the evidence or document reference, reviewer and a valid date checked.');
        return out;
    }
    function apply(site, command, now) {
        var s = state(site), c = command || {}, v = c.value || {};
        if (s.error) return { ok: false, err: s.error };
        if (c.revision !== s.revision) return { ok: false, err: 'Diligence changed in another view. Your draft is preserved; reload before saving it.' };
        try {
            var before, out;
            if (c.type === 'asset') {
                if (!idKnown(c.id)) throw Error('Unknown infrastructure component.');
                out = proof(v, now);
                out.presence = choice(PRESENCE, v.presence, 'the infrastructure evidence');
                out.condition = choice(CONDITIONS, v.condition, 'the condition');
                out.access = choice(ACCESS, v.access, 'asset access');
                out.action = choice(ACTIONS, v.action, 'the remaining work');
                out.payer = choice(PAYERS, v.payer, 'who funds the work');
                out.cost_basis = choice([['allowance', 'Allowance'], ['quote', 'Quote']], v.cost_basis, 'the cost basis');
                out.included_in = str(v.included_in);
                out.quote_expires = str(v.quote_expires);
                if (out.quote_expires && !day(out.quote_expires)) throw Error('Enter a valid quote expiry date.');
                ['low_usd', 'base_usd', 'high_usd', 'paid_usd', 'proton_share_pct', 'capacity_kw'].forEach(function (k) {
                    out[k] = num(v[k]); if (str(v[k]) && out[k] === null) throw Error('Enter a nonnegative number for ' + k.replace(/_/g, ' ') + '.');
                });
                out.paid_usd = out.paid_usd == null ? 0 : out.paid_usd;
                var costs = [out.low_usd, out.base_usd, out.high_usd], count = costs.filter(function (n) { return n !== null; }).length;
                if (count && count !== 3) throw Error('Enter low, base and high total cost, or leave all three unpriced. For a fixed quote, enter the same amount three times.');
                if (count && !(costs[0] <= costs[1] && costs[1] <= costs[2])) throw Error('Costs must follow low <= base <= high.');
                if (out.payer === 'proton') out.proton_share_pct = 100;
                if (out.payer === 'partner') out.proton_share_pct = 0;
                if (out.payer === 'shared' && !(out.proton_share_pct > 0 && out.proton_share_pct < 100)) throw Error('Enter Proton’s agreed funding share between 0 and 100 percent.');
                if (out.payer === 'unknown') out.proton_share_pct = null;
                if (out.paid_usd > 0 && (!count || out.proton_share_pct === null || out.paid_usd > out.base_usd * out.proton_share_pct / 100)) throw Error('Proton paid-to-date cannot exceed its base budget. Update the total budget or funding share first.');
                if (out.action === 'reuse' && !(out.presence === 'present' && out.condition === 'working' && out.access === 'agreed' && current(out.checked_on, now))) throw Error('A zero-cost reuse decision requires a current inspection, suitable condition and written use rights for this component.');
                if ((out.action === 'reuse' || out.action === 'not_required') && costs.some(function (n) { return n !== null && n !== 0; })) throw Error('Choose refurbishment / new work when additional capital is required.');
                if (out.action === 'included') {
                    if (!idKnown(out.included_in) || out.included_in === c.id) throw Error('Select a different budget line that explicitly includes this scope.');
                    if (count || out.paid_usd) throw Error('Record the package cost and payments on the covering line only.');
                } else out.included_in = '';
                before = s.assets[c.id] || null; s.assets[c.id] = out;
                Object.keys(s.assets).forEach(function (id) {
                    var seen = {}, at = id;
                    while (s.assets[at] && s.assets[at].action === 'included') { if (seen[at]) throw Error('Budget packages cannot refer back to themselves.'); seen[at] = true; at = s.assets[at].included_in; }
                });
            } else if (c.type === 'capacity') {
                out = proof(v, now);
                ['target_kw', 'contracted_kw'].forEach(function (k) { out[k] = num(v[k]); if (str(v[k]) && out[k] === null) throw Error('Capacity must be a nonnegative number.'); });
                if (out.target_kw !== null && out.target_kw <= 0) throw Error('A planning target must be positive.');
                out.contract_expires = str(v.contract_expires);
                if (out.contract_expires && !day(out.contract_expires)) throw Error('Enter a valid agreement expiry date.');
                out.rights_confirmed = v.rights_confirmed === true || v.rights_confirmed === 'yes';
                if (out.contracted_kw !== null && !out.rights_confirmed) throw Error('Confirm that the cited agreement allocates net power at the mining meter to Proton.');
                before = s.capacity; s.capacity = out;
            } else throw Error('Unknown diligence action.');
            s.revision++; s.history.push({ type: c.type, component: c.id || null, before: before, after: out, at: new Date(now == null ? Date.now() : now).toISOString() });
            // Keep a bounded working history; export contains every retained revision.
            if (s.history.length > 300) s.history = s.history.slice(-300);
            return { ok: true, diligence: s };
        } catch (e) { return { ok: false, err: e.message }; }
    }
    function source(c, meta) {
        var sd = c.sourceDetail || {}, snap = c.sourceSnapshot || {}, m = meta || {}, period = snap.reportingPeriod || sd.reportingPeriod || null;
        if (!period && c.source === 'lmop-landfill') period = '2024-09-04';
        if (!period && c.source === 'eccc-landfill-ca') period = m.reportingYear ? String(m.reportingYear) : sd.reportingYear ? String(sd.reportingYear) : '2024';
        if (!period && c.source === 'eia-facility') period = sd.lastDataMonth || (m.eia860Year ? String(m.eia860Year) : null);
        return { dataset: snap.dataset || m.source || c.source || 'Source not recorded', reportingPeriod: period,
            importedOn: snap.artifactGenerated || m.generated || null, url: snap.sourceUrl || m.sourceUrl || (c.source === 'lmop-landfill' ? SOURCES.lmop : c.source === 'eccc-landfill-ca' ? SOURCES.eccc : c.source === 'eia-facility' ? SOURCES.eia : null) };
    }
    function inventory(c, site, meta, now) {
        var sd = c.sourceDetail || {}, s = state(site), src = source(c, meta), rows = {};
        COMPONENTS.forEach(function (x) { rows[x[0]] = { id: x[0], label: x[1], scope: x[2], presence: 'unknown', finding: 'No component-level evidence in this record.', source_url: src.url, reportingPeriod: src.reportingPeriod, condition: 'unknown', access: 'unknown' }; });
        var collection = str(sd.collectionSystem).toLowerCase();
        if (collection === 'yes' || collection === 'no' || collection === 'shutdown') {
            rows.collection.presence = collection === 'shutdown' ? 'historical' : 'reported';
            rows.collection.finding = 'LMOP reports collection system: ' + sd.collectionSystem + '. This does not establish current capacity, condition or access.';
            var quantities = [];
            if (num(sd.wellCount) !== null) quantities.push(sd.wellCount + ' wells');
            if (num(sd.flareCount) !== null) quantities.push(sd.flareCount + ' flares');
            if (num(sd.gccsCapacityCfm) !== null) quantities.push(sd.gccsCapacityCfm + ' cfm collection-system rating');
            if (quantities.length) rows.collection.finding = 'Reported: ' + quantities.join(', ') + '. ' + rows.collection.finding;
            if (sd.infrastructureSourceUrl) rows.collection.source_url = sd.infrastructureSourceUrl;
        } else if (sd.hasExistingControls === true) {
            rows.collection.presence = 'reported'; rows.collection.finding = 'Reported gas destruction indicates control activity. Equipment type and present condition are not inventoried.';
        } else if (sd.hasExistingControls === false) rows.collection.finding = 'No gas destruction was reported. This does not prove that collection equipment is absent.';
        var generation = num(c.existingGenerationKw), ps = str(sd.projectStatus), type = str(sd.projectType || sd.technology);
        if (c.source === 'lmop-landfill') {
            if (/planned|construction/i.test(ps)) { rows.generation.presence = 'planned'; rows.generation.finding = 'The project is reported as ' + ps + '; proposed capacity is not installed equipment.'; }
            else if (generation !== null && generation > 0 && /engine|turbine|electric|cogeneration|combined cycle|rankine|fuel cell|linear generator/i.test(type)) {
                rows.generation.presence = /shutdown/i.test(ps) ? 'historical' : 'reported'; rows.generation.finding = Math.round(generation).toLocaleString() + ' kW in an electrical project reported as ' + ps + '. Confirm that the units remain on site.';
            } else rows.generation.finding = 'No installed electrical generation established by this project record' + (type ? ' (' + type + ')' : '') + '.';
        } else if (c.source === 'eia-facility' && num(c.powerPotentialKw) !== null) {
            rows.generation.presence = /retired|shutdown|standby|out of service/i.test(str(sd.statusLabel || sd.status)) ? 'historical' : 'reported';
            rows.generation.finding = 'EIA reports generating/storage capacity. Nameplate, operating status and technology do not establish spare power or transfer rights.';
        }
        if (sd.permitVerified) { rows.permits.presence = 'reported'; rows.permits.finding = 'A registry record matched. Check permit terms, amendments and transfer requirements for the proposed mining/generation design.'; }
        if (!s.error) Object.keys(s.assets).forEach(function (id) {
            var a = s.assets[id]; rows[id] = Object.assign({}, rows[id], a, { finding: a.evidence_note, reportingPeriod: a.checked_on, userRecorded: true, stale: !current(a.checked_on, now) });
        });
        return COMPONENTS.map(function (x) { return rows[x[0]]; });
    }
    function capacity(c, site, screened, now) {
        var s = state(site), a = s.error ? {} : s.capacity, u = screened || {}, sd = c.sourceDetail || {}, contracted = num(a.contracted_kw);
        var valid = contracted !== null && a.rights_confirmed && a.evidence_note && a.reviewer && current(a.checked_on, now) && (!a.contract_expires || a.contract_expires >= today(now));
        var placeholder = /placeholder|nominal 100/i.test(str(sd.capacityBasis));
        return { reportedKw: num(c.powerPotentialKw), installedReportedKw: num(c.existingGenerationKw),
            legacySavedKw: num(site && site.usable_kw), hasReviewedTarget: num(a.target_kw) !== null,
            screenedKw: placeholder ? null : num(u.kw), targetKw: num(a.target_kw) !== null ? num(a.target_kw) : placeholder ? null : num(u.kw),
            contractedKw: valid ? contracted : null, savedContractedKw: contracted,
            allocationStale: contracted !== null && !valid, gasCollectedMmscfd: num(sd.lfgCollectedMmscfd), gasFlaredMmscfd: num(sd.lfgFlaredMmscfd), projectFlowMmscfd: num(sd.lfgFlowToProjectMmscfd),
            gasCollectedYear: sd.lfgCollectedYear || null, gasFlaredYear: sd.lfgFlaredYear || null,
            methanePct: num(sd.methanePct), gccsCapacityCfm: num(sd.gccsCapacityCfm),
            flowRatingConflict: num(sd.lfgCollectedMmscfd) !== null && num(sd.gccsCapacityCfm) > 0 && sd.lfgCollectedMmscfd * 1000000 / 1440 > sd.gccsCapacityCfm * 1.1,
            collectionStatusConflict: !!(sd.inventoryCollectionSystem && sd.collectionSystem && str(sd.inventoryCollectionSystem).toLowerCase() !== str(sd.collectionSystem).toLowerCase()),
            placeholder: placeholder, capacityBasis: sd.capacityBasis || null, sharedProject: sd.sharedProjectRecord === true };
    }
    function budget(site, now, targetKw) {
        var s = state(site), assets = s.error ? {} : s.assets, priced = [], missing = [], low = 0, base = 0, high = 0, paid = 0, allowanceCount = 0;
        function line(id, visited) {
            var a = assets[id]; if (!a) return { id: id, known: false, reason: 'Scope, funding and cost not agreed.' };
            if (!a.evidence_note || !a.reviewer || !current(a.checked_on, now)) return { id: id, known: false, reason: 'Evidence needs a current review.' };
            if (a.quote_expires && a.quote_expires < today(now)) return { id: id, known: false, reason: 'Quote expired.' };
            if (a.action === 'included') {
                var seen = (visited || []).concat(id); if (seen.indexOf(a.included_in) >= 0) return { id: id, known: false, reason: 'Circular package reference.' };
                var parent = line(a.included_in, seen); return { id: id, known: parent.known, included: a.included_in, reason: parent.known ? 'Cost counted in the covering package.' : 'Covering package is not fully priced.' };
            }
            if (['generation', 'gas_treatment', 'electrical', 'mining_infrastructure', 'miners'].indexOf(id) >= 0 && a.action !== 'not_required' && a.payer !== 'partner' && targetKw > 0 && !(num(a.capacity_kw) >= targetKw)) return { id: id, known: false, reason: 'Confirm that the quote or reusable equipment covers the current net kW target.' };
            if (a.action === 'reuse' && a.presence === 'present' && a.condition === 'working' && a.access === 'agreed') return { id: id, known: true, low: 0, base: 0, high: 0, paid: 0, reason: 'Inspected reuse with documented access.' };
            if (a.action === 'not_required') return { id: id, known: true, low: 0, base: 0, high: 0, paid: 0, reason: 'Documented design exclusion.' };
            if (a.action !== 'new' && a.action !== 'refurbish') return { id: id, known: false, reason: 'Remaining work has not been agreed.' };
            if (a.payer === 'partner') return { id: id, known: true, low: 0, base: 0, high: 0, paid: 0, reason: 'Partner funding documented; completion still needs tracking.' };
            var share = a.payer === 'proton' ? 1 : a.payer === 'shared' && num(a.proton_share_pct) !== null ? a.proton_share_pct / 100 : null;
            if (share === null || [a.low_usd, a.base_usd, a.high_usd].some(function (n) { return num(n) === null; })) return { id: id, known: false, reason: share === null ? 'Proton funding share not agreed.' : 'Remaining work has not been priced.' };
            var p = num(a.paid_usd) || 0;
            return { id: id, known: true, low: Math.max(0, a.low_usd * share - p), base: Math.max(0, a.base_usd * share - p), high: Math.max(0, a.high_usd * share - p), paid: p,
                allowance: a.cost_basis !== 'quote', reason: (a.cost_basis === 'quote' ? 'Recorded quote' : 'User planning allowance') + '; Proton share ' + Math.round(share * 100) + '%.' };
        }
        Object.keys(assets).forEach(function (id) { if (assets[id].action !== 'included') paid += num(assets[id].paid_usd) || 0; });
        var lines = COMPONENTS.map(function (x) { var r = line(x[0]); r.label = x[1]; if (!r.known) missing.push(r.id); else { priced.push(r.id); if (!r.included) { low += r.low; base += r.base; high += r.high; if (r.allowance) allowanceCount++; } } return r; });
        return { lines: lines, priced: priced, missing: missing, low: priced.length ? low : null, base: priced.length ? base : null, high: priced.length ? high : null, paid: paid,
            complete: missing.length === 0, allowanceCount: allowanceCount, error: s.error || null };
    }
    function benchmark(netKw) {
        // A dated reference only, never mixed into the live quote ledger or relabelled as current dollars.
        if (!(netKw > 0)) return null;
        var gross = netKw / 0.93;
        if (gross < 800) return { applicable: false, note: 'The standard-engine reference applies from 800 gross kW. Obtain a design-specific small-engine or microturbine quote.' };
        return { applicable: true, grossKw: gross, usd2013: 1300 * gross + 1350000, year: 2013, source: SOURCES.cost,
            note: 'EPA standard-engine installed project reference in 2013 USD. Includes treatment, plant electrical, site work and engineering; excludes collection and the mining deployment. Not a 2026 supplier quote.' };
    }
    function profile(c, site, ctx) {
        ctx = ctx || {}; var cap = capacity(c, site, ctx.screened, ctx.now), b = budget(site, ctx.now, cap.targetKw), inv = inventory(c, site, ctx.meta, ctx.now);
        var unresolved = [];
        if (cap.contractedKw === null) unresolved.push('Confirm the gas/power allocation and net delivery point available to Proton.');
        if (cap.flowRatingConflict) unresolved.push('Reconcile the reported collected flow with the lower collection-system rating before choosing generation size.');
        if (cap.targetKw !== null && cap.contractedKw !== null && cap.targetKw > cap.contractedKw) unresolved.push('The planning target exceeds the documented Proton allocation.');
        inv.filter(function (a) { return ['collection', 'gas_treatment', 'generation', 'electrical'].indexOf(a.id) >= 0 && !(a.presence === 'present' && a.condition === 'working' && a.access === 'agreed' && !a.stale); }).forEach(function (a) { unresolved.push('Check ' + a.label.toLowerCase() + ': what remains, whether it is suitable and who may use it.'); });
        if (b.missing.length) unresolved.push('Price and allocate ' + b.missing.length + ' unresolved budget lines, including package exclusions.');
        return { source: source(c, ctx.meta), state: state(site), capacity: cap, inventory: inv, budget: b, benchmark: c.energyType === 'landfill_gas' ? benchmark(cap.targetKw) : null, nextActions: unresolved };
    }
    return { KEY: KEY, COMPONENTS: COMPONENTS, PRESENCE: PRESENCE, CONDITIONS: CONDITIONS, ACCESS: ACCESS, ACTIONS: ACTIONS, PAYERS: PAYERS, SOURCES: SOURCES,
        num: num, safeUrl: safeUrl, today: today, current: current, state: state, apply: apply, source: source, inventory: inventory, capacity: capacity, budget: budget, benchmark: benchmark, profile: profile };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ProspectDiligence;
