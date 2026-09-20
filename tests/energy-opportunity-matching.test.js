'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = require('../energy-opportunity-matching.js');
const NOW = '2026-09-20T12:00:00Z';
let checks = 0;
function test(name, fn) { fn(); checks++; console.log('  PASS  ' + name); }
function owner(value, extra) { return Object.assign({ value, confirmedBy: 'owner', asOf: '2026-09-10', source: 'Owner proposal dated September 10, 2026' }, extra); }
function facility(extra) { return M.fromFacility(Object.assign({ id: 'eia_100', plantCode: '100', name: 'Example Hydro', state: 'WA', technology: 'Conventional Hydroelectric', nameplateMw: 250, operator: 'Example owner', lat: 45, lon: -122 }, extra), { eia860Year: 2024, sourceUrl: 'https://www.eia.gov/electricity/data/eia860/' }); }
function qualified(extra) {
    return facility(Object.assign({ evidenceAppliesToBrief: true, ownerEvidence: {
        availableMw: owner(5, { basis: 'offered_electrical_capacity' }),
        deliveredCentsKwh: owner(5.5, { currency: 'USD', unit: 'cents/kWh', basis: 'delivered_all_in' }),
        capitalUsd: owner(200000, { currency: 'USD', scope: 'client_total_site' }),
        rights: owner('available'), supply: owner('electricity'), operation: owner('continuous')
    } }, extra));
}
function evaluate(c, b) { return M.evaluate(c, b || { minMw: 2 }, { now: NOW }); }

test('UMD browser and CommonJS expose the same API', () => {
    const context = {}; vm.createContext(context); vm.runInContext(fs.readFileSync(path.join(__dirname, '../energy-opportunity-matching.js'), 'utf8'), context);
    assert.equal(typeof context.EnergyOpportunityMatching.rank, 'function');
    assert.deepEqual(Object.keys(context.EnergyOpportunityMatching).sort(), Object.keys(M).sort());
});
test('brief normalizes strings, lists and aliases without losing zero capital', () => {
    const b = M.normalizeBrief({ minMw: '2', maxMw: '5', maxSiteCapitalUsd: '0', states: ['wa', 'WA'], energySources: ['petroleum', 'biogas'] });
    assert.deepEqual(b.states, ['WA']); assert.deepEqual(b.energySources, ['biomass_biogas', 'oil']); assert.equal(b.maxSiteCapitalUsd, 0);
});
test('narrative client criteria remain normalized text instead of disappearing', () => {
    const b = M.normalizeBrief({ notes: '  Keep existing electrical gear.\r\nNo shared access.  ', additionalRequirements: '  Fiber nearby.  ' });
    assert.equal(b.notes, 'Keep existing electrical gear.\nNo shared access.'); assert.equal(b.additionalRequirements, 'Fiber nearby.');
    assert.equal(M.normalizeBrief({ notes: null }).notes, ''); assert.equal(M.normalizeBrief().additionalRequirements, '');
    [false, 5, ['must have fiber']].forEach(notes => assert.throws(() => M.normalizeBrief({ notes }), /notes must be text/));
    assert.throws(() => M.normalizeBrief({ additionalRequirements: {} }), /additionalRequirements must be text/);
});
test('narrative criteria stay unresolved despite complete structured owner evidence', () => {
    ['notes', 'additionalRequirements'].forEach(field => {
        const c = qualified(); c.evidence[field] = owner('satisfied');
        const brief = { minMw: 2, [field]: 'The connection must be underground.' };
        const r = evaluate(c, brief); assert.equal(r.status, 'needs_confirmation'); assert.equal(r.checks[field].value, null);
        assert.ok(r.missing.some(s => /interpretation and verification/.test(s)));
        assert.equal(M.rank([c], brief, { now: NOW })[0].status, 'needs_confirmation');
    });
    assert.equal(evaluate(qualified(), { minMw: 2, notes: ' \r\n ', additionalRequirements: '' }).status, 'qualified_for_review');
});
test('zero, NaN, booleans and malformed numeric requirements are rejected', () => {
    [0, '0', NaN, Infinity, false, true, 'abc', ' '].forEach(v => assert.throws(() => M.normalizeBrief({ minMw: v }), /minMw/));
    assert.throws(() => M.normalizeBrief({ minMw: 5, maxMw: 2 }), /maxMw/);
    assert.throws(() => M.normalizeBrief({ minUptimePct: 101 }), /100/);
    assert.throws(() => M.normalizeBrief({ maxDeliveredCentsKwh: '0' }), /positive/);
});
test('malformed dates, array types and contradictory constraints are rejected', () => {
    ['2026-02-30', '2026-9-01', 0, false].forEach(startBy => assert.throws(() => M.normalizeBrief({ startBy }), /startBy/));
    assert.throws(() => M.normalizeBrief({ states: 'TX' }), /list/);
    assert.throws(() => M.normalizeBrief({ states: ['ZZ'] }), /Unknown/);
    assert.throws(() => M.normalizeBrief({ states: ['TX'], excludedStates: ['TX'] }), /both/);
    assert.throws(() => M.normalizeBrief({ energySources: ['coal'], excludedSources: ['coal'] }), /both/);
});
test('public nameplate and CF never become available MW or uptime', () => {
    const r = evaluate(facility({ nameplateMw: 1000, cfCurrent: 0.99, availableMw: 800, uptimePct: 99 }));
    assert.equal(r.status, 'needs_confirmation'); assert.equal(r.candidate.availableMw, null);
    assert.equal(r.candidate.deliveredCentsKwh, null); assert.equal(r.candidate.capitalUsd, null);
    assert.ok(r.missing.some(s => /allocation/.test(s))); assert.ok(!r.checks.uptimePct);
});
test('non-US records are excluded and unknown country is unresolved', () => {
    assert.equal(evaluate(facility({ iso3: 'CAN' })).status, 'excluded');
    const unknown = facility(); unknown.country = null; assert.equal(evaluate(unknown).status, 'needs_confirmation');
});
test('US territories are opt-in and unlocated country-only records stay unresolved', () => {
    const c = qualified({ state: 'PR' }); assert.equal(evaluate(c).status, 'excluded'); assert.equal(evaluate(c, { states: ['PR'] }).status, 'qualified_for_review');
    const pri = qualified({ state: 'PR', iso3: 'PRI' }); assert.equal(pri.country, 'PRI'); assert.equal(evaluate(pri, { states: ['PR'] }).status, 'qualified_for_review');
    assert.equal(evaluate(qualified({ state: null })).status, 'needs_confirmation');
});
test('owner commercial evidence needs current client allocation applicability', () => {
    const c = qualified(); c.evidenceAppliesToBrief = false;
    assert.equal(evaluate(c).status, 'needs_confirmation'); assert.equal(evaluate(c).candidate.deliveredCentsKwh, null);
    ['availableMw', 'deliveredCentsKwh', 'capitalUsd'].forEach(k => Object.assign(c.evidence[k], { quotedMinMw: 1, quotedMaxMw: 6 }));
    assert.equal(evaluate(c, { minMw: 2, maxMw: 5 }).status, 'qualified_for_review');
    assert.equal(evaluate(c, { minMw: 0.5 }).status, 'needs_confirmation');
    c.evidenceAppliesToBrief = true; c.evidence.deliveredCentsKwh.scopeBriefId = 'another-client';
    assert.equal(evaluate(c, { id: 'this-client', minMw: 2 }).status, 'needs_confirmation');
});
test('same brief ID cannot extend an unversioned offer to changed allocation or revision', () => {
    const c = qualified(); c.evidenceAppliesToBrief = false;
    const fields = ['availableMw', 'deliveredCentsKwh', 'capitalUsd'];
    fields.forEach(k => { c.evidence[k].scopeBriefId = 'client-1'; });
    const initial = { id: 'client-1', revision: '1', minMw: 2, maxMw: 5 };
    const changed = { id: 'client-1', revision: '2', minMw: 5, maxMw: 5 };
    assert.equal(evaluate(c, initial).status, 'needs_confirmation');
    assert.equal(evaluate(c, changed).status, 'needs_confirmation');
    assert.equal(evaluate(c, changed).candidate.deliveredCentsKwh, null);
    fields.forEach(k => { c.evidence[k].scopeBriefRevision = '1'; });
    assert.equal(evaluate(c, initial).status, 'qualified_for_review');
    assert.equal(evaluate(c, changed).status, 'needs_confirmation');
    c.evidenceAppliesToBrief = true;
    fields.forEach(k => Object.assign(c.evidence[k], { quotedMinMw: 1, quotedMaxMw: 10 }));
    assert.equal(evaluate(c, changed).status, 'needs_confirmation');
});
test('source, state and known-site exclusions are deterministic', () => {
    assert.equal(evaluate(facility(), { energySources: ['nuclear'] }).status, 'excluded');
    assert.equal(evaluate(facility(), { excludedSources: ['hydro'] }).status, 'excluded');
    assert.equal(evaluate(facility(), { excludedStates: ['WA'] }).status, 'excluded');
    assert.equal(evaluate(facility(), { knownSiteExclusions: ['eia_100'] }).status, 'excluded');
    assert.equal(evaluate(facility(), { knownSiteExclusions: ['Example Hydro'] }).status, 'needs_confirmation');
});
test('large plant is eligible for a smaller allocation without a plant-size maximum', () => {
    const r = evaluate(qualified(), { minMw: 2, maxMw: 6, energySources: ['hydro'] });
    assert.equal(r.candidate.nameplateMw, 250); assert.equal(r.status, 'qualified_for_review');
    assert.equal(evaluate(facility({ nameplateMw: 0.5 }), { minMw: 2 }).status, 'needs_confirmation');
});
test('owner-confirmed complete offer can qualify only for review', () => {
    const r = evaluate(qualified(), { minMw: 2, maxDeliveredCentsKwh: 6, maxSiteCapitalUsd: 250000, supply: 'electricity', operation: 'continuous' });
    assert.equal(r.status, 'qualified_for_review'); assert.equal(r.candidate.availableMw, 5); assert.equal(r.candidate.deliveredCentsKwh, 5.5);
    assert.equal(r.missing.length, 0); assert.equal(r.scoreLabel, 'Screening priority');
});
test('owner price above comparable delivered ceiling excludes an offer', () => {
    assert.equal(evaluate(qualified(), { minMw: 2, maxDeliveredCentsKwh: 5 }).status, 'excluded');
});
test('wholesale, energy-only and foreign currency prices never compare as delivered', () => {
    ['energy_only', 'wholesale'].forEach(basis => { const c = qualified(); c.evidence.deliveredCentsKwh.basis = basis; const r = evaluate(c, { maxDeliveredCentsKwh: 1 }); assert.equal(r.status, 'needs_confirmation'); assert.equal(r.candidate.deliveredCentsKwh, null); });
    const c = qualified(); c.evidence.deliveredCentsKwh.currency = 'CAD'; assert.equal(evaluate(c).candidate.deliveredCentsKwh, null);
});
test('energy-only ceiling uses its own separately scoped price', () => {
    const c = qualified(); c.evidence.energyCentsKwh = owner(3, { currency: 'USD', unit: 'cents/kWh', basis: 'energy_only' });
    assert.equal(evaluate(c, { maxEnergyCentsKwh: 4, maxDeliveredCentsKwh: 6 }).status, 'qualified_for_review');
    assert.equal(evaluate(c, { maxEnergyCentsKwh: 2 }).status, 'excluded');
    c.evidence.energyCentsKwh.basis = 'delivered_all_in'; assert.equal(evaluate(c, { maxEnergyCentsKwh: 2 }).status, 'needs_confirmation');
});
test('stale, expired, future and undated owner evidence is unresolved', () => {
    [{ asOf: '2026-01-01' }, { validThrough: '2026-09-19' }, { asOf: '2026-10-01' }, { asOf: null }, { asOf: '2026-02-30' }].forEach(patch => {
        const c = qualified(); Object.assign(c.evidence.availableMw, patch); assert.equal(evaluate(c).candidate.availableMw, null); assert.equal(evaluate(c).status, 'needs_confirmation');
    });
});
test('evidence remains valid through the final specified calendar day', () => {
    const c = qualified(); c.evidence.availableMw.validThrough = '2026-09-20'; assert.equal(evaluate(c).status, 'qualified_for_review');
});
test('false, blank, NaN and string-zero evidence never become free energy', () => {
    [false, true, '', null, NaN, Infinity, '0', -1].forEach(value => { const c = qualified(); c.evidence.deliveredCentsKwh.value = value; assert.equal(evaluate(c).candidate.deliveredCentsKwh, null); });
    const c = qualified(); c.evidence.deliveredCentsKwh.value = 0; assert.equal(evaluate(c).candidate.deliveredCentsKwh, 0);
});
test('non-owner attribution, missing source and nameplate basis cannot qualify', () => {
    [{ confirmedBy: 'researcher' }, { source: '' }, { basis: 'nameplate' }].forEach(patch => { const c = qualified(); Object.assign(c.evidence.availableMw, patch); assert.equal(evaluate(c).candidate.availableMw, null); });
});
test('confirmed zero allocation excludes despite large installed capacity', () => {
    const c = qualified(); c.evidence.availableMw.value = 0; assert.equal(evaluate(c).status, 'excluded');
});
test('unavailable rights and incompatible delivery or operations exclude', () => {
    const c = qualified(); c.evidence.rights.value = 'unavailable'; assert.equal(evaluate(c).status, 'excluded');
    const f = qualified(); f.evidence.supply.value = 'fuel'; assert.equal(evaluate(f, { supply: 'electricity' }).status, 'excluded');
    const s = qualified(); s.evidence.operation.value = 'seasonal'; assert.equal(evaluate(s, { operation: 'continuous' }).status, 'excluded');
});
test('fuel-equivalent MW do not establish delivered electrical allocation', () => {
    const c = qualified(); c.evidence.availableMw.basis = 'verified_fuel_electric_equivalent'; assert.equal(evaluate(c).status, 'needs_confirmation');
});
test('either supply cannot pass fuel-equivalent MW to an electricity-only client', () => {
    const c = qualified(); c.evidence.supply.value = 'either'; c.evidence.availableMw.basis = 'verified_fuel_electric_equivalent';
    const brief = { minMw: 2, supply: 'electricity' }, r = evaluate(c, brief);
    assert.equal(r.status, 'needs_confirmation'); assert.equal(r.candidate.availableMw, null);
    assert.ok(r.missing.some(s => /offered electrical allocation/.test(s)));
    assert.equal(M.rank([c, c], brief, { now: NOW })[0].status, 'needs_confirmation');
});
test('capital, connection, term and energization constraints require scoped evidence', () => {
    const c = qualified(); c.evidence.connectionReadiness = owner('new_build_required'); c.evidence.termMonths = owner(12); c.evidence.readyBy = owner('2027-01-01');
    assert.equal(evaluate(c, { maxSiteCapitalUsd: 100000 }).status, 'excluded');
    assert.equal(evaluate(c, { connectionReadiness: 'existing' }).status, 'excluded');
    assert.equal(evaluate(c, { minTermMonths: 24 }).status, 'excluded');
    assert.equal(evaluate(c, { startBy: '2026-12-01' }).status, 'excluded');
    assert.equal(evaluate(c, { connectionReadiness: 'new_build_allowed', minTermMonths: 12, startBy: '2027-02-01' }).status, 'qualified_for_review');
});
test('measured CF cannot substitute for contracted service uptime', () => {
    const c = qualified(); c.cfCurrent = 0.99; assert.equal(evaluate(c, { minUptimePct: 95 }).status, 'needs_confirmation');
    c.evidence.uptimePct = owner(90); assert.equal(evaluate(c, { minUptimePct: 95 }).status, 'excluded');
});
test('storage and pumped hydro always need charging evidence', () => {
    const c = qualified({ technology: 'Hydroelectric Pumped Storage' }); assert.deepEqual(c.energyTypes, ['storage']);
    assert.equal(evaluate(c).status, 'needs_confirmation');
    c.evidence.chargingPlan = owner('Owner dispatch plan identifies contracted source, charging cost, round-trip losses and operating schedule.');
    assert.equal(evaluate(c).status, 'qualified_for_review');
});
test('hybrid constituents respect exclusions; unidentified constituents need research', () => {
    const c = qualified({ energyTechnologies: ['solar', 'natural_gas'] }); assert.equal(evaluate(c, { excludedSources: ['natural_gas'] }).status, 'excluded');
    assert.equal(evaluate(qualified({ energyTechnologies: ['hybrid'] })).status, 'needs_confirmation');
    assert.equal(evaluate(qualified({ energyTechnologies: ['unknown'] })).status, 'needs_confirmation');
});
test('hybrid marker plus a known nonmatching constituent cannot qualify as nuclear', () => {
    const c = qualified({ energyTechnologies: ['hybrid', 'natural_gas'] });
    const brief = { minMw: 2, energySources: ['nuclear'] }, r = evaluate(c, brief);
    assert.equal(r.status, 'needs_confirmation'); assert.ok(r.missing.some(s => /hybrid constituents/.test(s)));
    assert.ok(!r.reasons.some(s => /technology matches/.test(s)));
    assert.equal(M.rank([c], brief, { now: NOW })[0].status, 'needs_confirmation');
});
test('mixed permitted and unpermitted sources need allocation provenance before qualification', () => {
    const c = qualified({ energyTechnologies: ['solar', 'natural_gas'] });
    const brief = { minMw: 2, energySources: ['solar'] }, r = evaluate(c, brief);
    assert.equal(r.status, 'needs_confirmation'); assert.equal(r.disqualifiers.length, 0);
    assert.ok(r.missing.some(s => /offered allocation uses only/.test(s)));
    assert.ok(!r.reasons.some(s => /technology matches/.test(s)));
    assert.equal(M.rank([c], brief, { now: NOW })[0].status, 'needs_confirmation');
    assert.equal(evaluate(c, { minMw: 2, energySources: ['solar', 'natural_gas'] }).status, 'qualified_for_review');
    assert.equal(evaluate(c, { minMw: 2, energySources: ['solar'], excludedSources: ['natural_gas'] }).status, 'excluded');
});
test('landfill resource potential and shutdown equipment stay distinct', () => {
    const c = M.fromLandfill({ id: 'p1', lfid: '44', name: 'Example', state: 'WA', powerPotentialKw: 2500, ratedMw: 1.6, projectType: 'Reciprocating Engine', projectStatus: 'Shutdown' });
    assert.equal(c.resourcePotentialMw, 2.5); assert.equal(c.nameplateMw, 1.6); assert.equal(evaluate(c).candidate.availableMw, null);
    const rng = M.fromLandfill({ id: 'p2', projectType: 'Renewable Natural Gas', projectStatus: 'Operational', ratedMw: 10 }); assert.equal(rng.nameplateMw, null);
});
test('flare arrays preserve US country and only estimated resource; no fictional uptime', () => {
    const c = M.fromFlare([30, -100, 'USA', 5000, 100, 1, 8, 2017, 2024]);
    assert.equal(c.country, 'USA'); assert.equal(c.resourcePotentialMw, 5); assert.equal(c.state, null);
    const r = evaluate(c, { minUptimePct: 90 }); assert.equal(r.status, 'needs_confirmation'); assert.equal(r.checks.uptimePct.value, null);
    assert.equal(evaluate(M.fromFlare([30, -100, 'CAN', 5000])).status, 'excluded');
});
test('same EIA plant units deduplicate without adding MW or losing source IDs', () => {
    const a = facility({ id: 'unitA', nameplateMw: 5 }), b = facility({ id: 'unitB', nameplateMw: 7 });
    const r = M.rank([a, b], {}, { now: NOW }); assert.equal(r.length, 1); assert.ok([5, 7].includes(r[0].candidate.nameplateMw)); assert.ok(r[0].candidate.sourceRecordIds.includes('unitA')); assert.ok(r[0].candidate.sourceRecordIds.includes('unitB'));
});
test('same name or coordinates across sources never creates an implicit identity join', () => {
    const a = facility(), b = M.fromLandfill({ id: 'p1', lfid: '44', name: a.name, state: 'WA', lat: 45, lon: -122 });
    assert.equal(M.rank([a, b], {}, { now: NOW }).length, 2);
});
test('dedup preserves a confirmed negative even if a duplicate lacks evidence', () => {
    const c = qualified(); c.evidence.availableMw.value = 0; const r = M.rank([facility(), c], {}, { now: NOW }); assert.equal(r[0].status, 'excluded');
});
test('conflicting current duplicate offers remain unresolved across three observations', () => {
    const a = qualified(), b = qualified(), c = qualified(); b.evidence.availableMw.value = 3;
    const r = M.rank([a, b, c], {}, { now: NOW }); assert.equal(r[0].candidate.availableMw, null); assert.equal(r[0].status, 'needs_confirmation');
});
test('rank orders evidence before unknowns without treating unknown prices as cheap', () => {
    const known = qualified(), unknown = facility({ plantCode: '200', name: 'A unknown' }), excluded = facility({ plantCode: '300', iso3: 'CAN' });
    const r = M.rank([unknown, excluded, known], {}, { now: NOW }); assert.deepEqual(r.map(x => x.status), ['qualified_for_review', 'needs_confirmation', 'excluded']);
    assert.equal(M.rank([known, unknown], {}, { now: NOW, limit: 1 }).length, 1); assert.throws(() => M.rank([], {}, { limit: -1 }), /limit/);
});
test('comparable qualified offers rank by delivered price then client capital', () => {
    const expensive = qualified({ plantCode: '1', name: 'A expensive' }), cheaper = qualified({ plantCode: '2', name: 'Z cheaper' });
    cheaper.evidence.deliveredCentsKwh.value = 4;
    assert.equal(M.rank([expensive, cheaper], {}, { now: NOW })[0].candidate.name, 'Z cheaper');
    cheaper.evidence.deliveredCentsKwh.value = 5.5; cheaper.evidence.capitalUsd.value = 100000;
    assert.equal(M.rank([expensive, cheaper], {}, { now: NOW })[0].candidate.name, 'Z cheaper');
});
test('deduplicated scoped offers cannot silently qualify under a changed allocation', () => {
    const merged = M.rank([qualified(), qualified()], { minMw: 2 }, { now: NOW })[0].candidate;
    assert.equal(evaluate(merged, { minMw: 4 }).status, 'needs_confirmation');
});
test('narrative changes invalidate the exact merged evidence applicability key', () => {
    const merged = M.rank([qualified(), qualified()], { minMw: 2 }, { now: NOW })[0].candidate;
    const changed = evaluate(merged, { minMw: 2, notes: 'Underground connection required.' });
    assert.equal(changed.candidate.deliveredCentsKwh, null); assert.equal(changed.status, 'needs_confirmation');
});
test('evaluation does not mutate candidate, brief or owner evidence', () => {
    const c = qualified(), b = { minMw: 2, states: ['WA'] }, before = JSON.stringify({ c, b }); evaluate(c, b); M.rank([c, c], b, { now: NOW }); assert.equal(JSON.stringify({ c, b }), before);
});
console.log('\n' + checks + ' energy opportunity matching checks passed.');
