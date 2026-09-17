const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Q = require('../deal-qualification');
const NOW = Date.parse('2026-09-05T12:00:00Z');
function complete() {
    return { acquisition: { rights_owner: 'County', surface_owner: 'County', decision_maker: 'Authorized director',
        rights_status: 'available', rights_evidence: 'Written confirmation 4 September', rights_verified_on: '2026-09-04',
        available_kw: 1000, capacity_evidence: 'Meter study, net of parasitics and other commitments', capacity_verified_on: '2026-09-04',
        delivered_rate_usd_kwh: 0, quote_evidence: 'Executed commercial schedule', quote_verified_on: '2026-09-04',
        cost_responsibility: 'Owner generation; operator mining containers and O&M',
        agreement_ref: 'Signed lease and power agreement in document register', signed_on: '2026-09-04', term_end: '2036-09-04', contracted_kw: 900,
        conditions: Object.fromEntries(Q.CONDITIONS.map(c => [c.key, { status: 'complete', evidence: 'Document register reference', completed_on: '2026-09-04' }])) } };
}
test('resource potential and catalogue assumptions never become contractable capacity', () => {
    const r = Q.evaluate({ usable_kw: 3000, stage: 'closed_won', offtake_state: 'none_merchant' }, NOW);
    assert.equal(r.score, 0); assert.equal(r.canClose, false); assert.equal(r.availableKw, null); assert.equal(r.contractedKw, null);
    assert.ok(r.nextAction.includes('rights holder'));
});
test('each closing requirement matters and a verified zero price is accepted', () => {
    const s = complete(), r = Q.evaluate(s, NOW);
    assert.equal(r.score, 100); assert.equal(r.canClose, true); assert.equal(r.contractedKw, 900);
    for (const field of ['rights_owner', 'rights_evidence', 'capacity_evidence', 'quote_evidence', 'cost_responsibility', 'agreement_ref', 'term_end']) {
        const copy = structuredClone(s); delete copy.acquisition[field];
        assert.equal(Q.evaluate(copy, NOW).canClose, false, field);
    }
    for (const c of Q.CONDITIONS) {
        const copy = structuredClone(s); copy.acquisition.conditions[c.key].evidence = '';
        assert.equal(Q.evaluate(copy, NOW).canClose, false, c.key);
    }
});
test('stale, future-dated and impossible evidence cannot pass', () => {
    for (const value of ['2025-01-01', '2026-12-01', '2026-02-31']) {
        const s = complete(); s.acquisition.capacity_verified_on = value;
        assert.equal(Q.evaluate(s, NOW).availableKw, null);
    }
    const s = complete(); s.acquisition.contracted_kw = 1001;
    assert.equal(Q.evaluate(s, NOW).canClose, false);
    assert.equal(Q.validate(s.acquisition).ok, false);
});
test('offers compare equivalent output and make the revenue-share guarantee explicit', () => {
    const r = Q.compareOffers({ kw: 1000, uptime_pct: 50, revenue_usd: 30000, other_cost_usd: 2000,
        fixed_rate: 0.04, gas_rate: 0.02, generation_cost_usd: 5000, revenue_share_pct: 10, minimum_usd: 4000, rent_usd: 1000 });
    assert.equal(r[0].ownerMonthlyUsd, 15400); assert.equal(r[0].operatorNetMonthlyUsd, 12600);
    assert.equal(r[1].ownerMonthlyUsd, 8200); assert.equal(r[1].operatorNetMonthlyUsd, 14800);
    assert.equal(r[2].ownerMonthlyUsd, 5000); assert.equal(r[2].operatorNetMonthlyUsd, 18000);
    assert.equal(Q.compareOffers({ kw: 0 }), null);
});
test('closing gate is enforced by the store, including a direct update', () => {
    const stored = {}; global.localStorage = { getItem: k => stored[k] || null, setItem: (k, v) => { stored[k] = v; } };
    global.DealQualification = Q;
    const S = require('../site-model');
    const site = S.add({ name: 'Test site' });
    assert.equal(S.setStage(site.id, 'closed_won').ok, false);
    assert.equal(S.get(site.id).stage, 'unreviewed');
    assert.equal(S.update(site.id, { stage: 'closed_won' })._save.ok, false);
    // Pin dates to the actual test day so the gate remains time-independent.
    const a = complete().acquisition, today = new Date().toISOString().slice(0, 10);
    ['rights_verified_on', 'capacity_verified_on', 'quote_verified_on', 'signed_on'].forEach(k => { a[k] = today; });
    a.term_end = String(Number(today.slice(0, 4)) + 10) + today.slice(4);
    Object.values(a.conditions).forEach(c => { c.completed_on = today; });
    S.update(site.id, { acquisition: a });
    assert.equal(S.setStage(site.id, 'closed_won').stage, 'closed_won');
});
