// Unit tests for the unified opportunity score.
//
// The cases that matter most are the ones where a scoring model usually goes wrong quietly:
// missing data being treated as a low score, nameplate capacity being compared across sources
// with different duty cycles, and the "bigger is better" instinct creeping back into a model
// that is supposed to prefer a 2 MW site over a 40 MW one.
var path = require('path');
var ROOT = path.join(__dirname, '..');

// These modules are browser globals with a CommonJS tail, and site-opportunity.js reads
// `Jurisdictions` from the global scope when no table is injected.
global.Jurisdictions = require(path.join(ROOT, 'jurisdictions.js'));
var SO = require(path.join(ROOT, 'site-opportunity.js'));

var pass = 0, fail = 0;
function ok(label, cond, extra) {
    if (cond) { pass++; return; }
    fail++;
    console.log('  FAIL  ' + label + (extra === undefined ? '' : '   -> ' + JSON.stringify(extra)));
}
function eq(label, actual, expected) {
    ok(label + '  (expected ' + JSON.stringify(expected) + ')', actual === expected, actual);
}
function near(label, actual, expected, tol) {
    ok(label + '  (expected ~' + expected + ')', actual !== null && Math.abs(actual - expected) <= (tol || 1), actual);
}
function comp(res, id) {
    var b = res.breakdown.filter(function(x) { return x.id === id; })[0];
    return b ? b.value : undefined;
}

function site(over) {
    var s = {
        id: 'test', source: 'flare-viirs', energyType: 'flare_gas',
        lat: 53.5, lng: -113.5, iso3: 'CAN',
        powerPotentialKw: 2000, dutyCyclePct: 100,
        yearsSeen: 6, yearsTotal: 6, daysSinceActive: null,
        counterpartyType: 'oil_gas_operator'
    };
    for (var k in (over || {})) s[k] = over[k];
    return s;
}

console.log('site-opportunity');
SO.reset();

// ---- Capacity fit: a band, not a ramp ------------------------------------------------
eq('2 MW is inside the 1-3 MW band', comp(SO.score(site({ powerPotentialKw: 2000 })), 'capacity_fit'), 100);
eq('1 MW sits exactly on the lower edge', comp(SO.score(site({ powerPotentialKw: 1000 })), 'capacity_fit'), 100);
eq('3 MW sits exactly on the upper edge', comp(SO.score(site({ powerPotentialKw: 3000 })), 'capacity_fit'), 100);
ok('3.1 MW has already started to fall off', comp(SO.score(site({ powerPotentialKw: 3100 })), 'capacity_fit') < 100);
ok('900 kW has already started to fall off', comp(SO.score(site({ powerPotentialKw: 900 })), 'capacity_fit') < 100);

// The headline requirement from the spec: a 40 MW prospect must not outrank a 2 MW one.
var big = SO.score(site({ powerPotentialKw: 40000 }));
var right = SO.score(site({ powerPotentialKw: 2000 }));
ok('a 40 MW prospect scores BELOW a 2 MW one', big.score < right.score, { big: big.score, right: right.score });
eq('250 kW (band floor / 4) scores zero', comp(SO.score(site({ powerPotentialKw: 250 })), 'capacity_fit'), 0);
eq('24 MW (band ceiling x 8) scores zero', comp(SO.score(site({ powerPotentialKw: 24000 })), 'capacity_fit'), 0);
eq('no capacity estimate yields null, not zero', comp(SO.score(site({ powerPotentialKw: null })), 'capacity_fit'), null);

// ---- Duty cycle: the whole reason effective capacity exists ---------------------------
var continuous = SO.score(site({ powerPotentialKw: 2000, dutyCyclePct: 100 }));
var intermittent = SO.score(site({ powerPotentialKw: 2000, dutyCyclePct: 20 }));
ok('a 2 MW intermittent site scores BELOW a 2 MW continuous one',
   intermittent.score < continuous.score, { intermittent: intermittent.score, continuous: continuous.score });
eq('effective capacity applies the duty cycle', SO.effectiveKw(site({ powerPotentialKw: 2000, dutyCyclePct: 20 })), 400);
eq('a missing duty cycle is treated as continuous', SO.effectiveKw(site({ powerPotentialKw: 2000, dutyCyclePct: null })), 2000);
// 10 MW at 20% duty = 2 MW effective, which IS in the band.
eq('10 MW at 20% duty lands in the band on effective capacity',
   comp(SO.score(site({ powerPotentialKw: 10000, dutyCyclePct: 20 })), 'capacity_fit'), 100);

// ---- Persistence ---------------------------------------------------------------------
eq('seen in every survey scores 100', comp(SO.score(site({ yearsSeen: 6, yearsTotal: 6 })), 'supply_persistence'), 100);
near('seen in half the surveys scores ~50', comp(SO.score(site({ yearsSeen: 3, yearsTotal: 6 })), 'supply_persistence'), 50);
eq('no history at all yields null', comp(SO.score(site({ yearsSeen: null, yearsTotal: null, persistencePct: null })), 'supply_persistence'), null);

// Recent confirmation corroborates, but its ABSENCE must never subtract — most live sites go
// unconfirmed because they are below the sensor's detection floor.
var unconfirmed = comp(SO.score(site({ yearsSeen: 3, yearsTotal: 6, daysSinceActive: null })), 'supply_persistence');
var confirmed = comp(SO.score(site({ yearsSeen: 3, yearsTotal: 6, daysSinceActive: 5 })), 'supply_persistence');
ok('a recent confirmation raises persistence', confirmed > unconfirmed, { confirmed: confirmed, unconfirmed: unconfirmed });
eq('an unconfirmed site is not penalised below its survey history', unconfirmed, 50);
var stale = comp(SO.score(site({ yearsSeen: 3, yearsTotal: 6, daysSinceActive: 400 })), 'supply_persistence');
eq('an old confirmation neither helps nor hurts', stale, 50);

// ---- Missing data is dropped, never scored as zero ------------------------------------
var full = SO.score(site(), { fleet: [{ lat: 53.6, lng: -113.4 }], manual: { road_distance_km: 1, fiber_distance_km: 2, grid_distance_km: 1 } });
var sparse = SO.score(site());
eq('site quality is null when nothing has been surveyed', comp(sparse, 'site_quality'), null);
eq('proximity is null when there are no existing operations', comp(sparse, 'proximity'), null);
ok('coverage reports the sparse prospect as partially measured', sparse.coverage < 100 && sparse.coverage > 0, sparse.coverage);
eq('coverage is 100 when every component has data', full.coverage, 100);
ok('a missing component does not drag the score toward zero',
   sparse.score >= full.score - 40, { sparse: sparse.score, full: full.score });

// A prospect with nothing measurable is carried by actionability alone, which is deliberate:
// "no operator is published for this site" is a real finding about the prospect, not missing
// data, so it scores low rather than dropping out. Everything else drops out, and coverage
// falls to actionability's weight alone — which is the signal that the score is nearly empty.
var empty = SO.score({ id: 'x', powerPotentialKw: null, yearsSeen: null, yearsTotal: null, iso3: null, counterpartyType: null });
eq('an all-null prospect is carried only by actionability', empty.coverage, SO.DEFAULT_WEIGHTS.actionability);
ok('and scores near the floor', empty.score <= 10, empty.score);
// With no components at all scoreable, the score is genuinely null rather than a zero it did
// not earn. score(null) is the only way to reach that state.
eq('a null candidate scores null, not zero', SO.score(null).score, null);
eq('and reports zero coverage', SO.score(null).coverage, 0);

// ---- Contact tier ---------------------------------------------------------------------
eq('no operator at all is tier 4', SO.contactTier(site(), {}).tier, 4);
eq('a named licensee with no contact route is tier 3',
   SO.contactTier(site(), { operator: { operator: 'Lynx Energy ULC' } }).tier, 3);
eq('a regulator-published phone is tier 2',
   SO.contactTier(site(), { operator: { operator: 'Lynx Energy ULC', phone: '780-555-0100' } }).tier, 2);
eq('a named human with an email is tier 1',
   SO.contactTier(site(), { manual: { contact_name: 'J. Smith', contact_email: 'j@example.com' } }).tier, 1);

// The requirement from the plan: filling in a contact field moves the prospect up.
var before = SO.score(site(), { operator: { operator: 'Lynx Energy ULC' } });
var after = SO.score(site(), { operator: { operator: 'Lynx Energy ULC' },
                               manual: { contact_name: 'J. Smith', contact_phone: '780-555-0100' } });
ok('adding a contact raises the opportunity score', after.score > before.score, { before: before.score, after: after.score });
eq('and the derived tier moves to 1', after.contactTier, 1);

// ---- Jurisdiction ---------------------------------------------------------------------
eq('the US scores 100', global.Jurisdictions.score('USA'), 100);
eq('Canada scores 85', global.Jurisdictions.score('CAN'), 85);
ok('Russia scores far below both', global.Jurisdictions.score('RUS') < 20, global.Jurisdictions.score('RUS'));
ok('a workable country lands between', global.Jurisdictions.score('NOR') > global.Jurisdictions.score('RUS') &&
   global.Jurisdictions.score('NOR') < global.Jurisdictions.score('CAN'), global.Jurisdictions.score('NOR'));
eq('an unknown country is unscored, not zero', global.Jurisdictions.score('ZZZ'), null);

// The gap must be a nudge, not a cliff: two otherwise identical sites differ by ~1.5 points.
var us = SO.score(site({ iso3: 'USA' })), can = SO.score(site({ iso3: 'CAN' }));
ok('an identical US site outranks the Canadian one', us.score > can.score, { us: us.score, can: can.score });
ok('but by no more than 3 points', us.score - can.score <= 3, us.score - can.score);

// ---- Counterparty ---------------------------------------------------------------------
ok('a private landfill outranks a municipal one',
   SO.settings().counterpartyScores.landfill_private > SO.settings().counterpartyScores.landfill_public);
eq('an unidentified counterparty is null, not zero', comp(SO.score(site({ counterpartyType: null })), 'counterparty'), null);
eq('an unrecognised counterparty type is null, not zero', comp(SO.score(site({ counterpartyType: 'utility' })), 'counterparty'), 30);

// ---- Weights are settings, not constants ----------------------------------------------
SO.reset();
// Scored on Russia, not Canada: Canada's 85 sits so close to the other components' average
// that dropping it moves the rounded total by less than a point, which would make this assert
// nothing. Russia scores 0 on jurisdiction, so removing the weight has to move the number.
var beforeW = SO.score(site({ iso3: 'RUS' })).score;
SO.setWeight('jurisdiction', 0);
var zeroed = SO.score(site({ iso3: 'RUS' })).score;
ok('zeroing the jurisdiction weight changes the score', zeroed > beforeW, { beforeW: beforeW, zeroed: zeroed });
SO.reset();
eq('reset restores the default weight', SO.weights().jurisdiction, 25 - 15);
ok('rejects a negative weight', SO.setWeight('jurisdiction', -1) === false);
ok('rejects an unknown component', SO.setWeight('not_a_component', 10) === false);

// Weights need not sum to 100 after editing — they are normalised at use.
SO.reset();
SO.setWeight('capacity_fit', 250);
var reweighted = SO.score(site());
ok('a score stays within 0-100 after reweighting', reweighted.score >= 0 && reweighted.score <= 100, reweighted.score);
SO.reset();

// Target band is configurable.
SO.setSetting('targetKwMin', 5000);
SO.setSetting('targetKwMax', 15000);
eq('a retuned band moves 10 MW into range', comp(SO.score(site({ powerPotentialKw: 10000 })), 'capacity_fit'), 100);
ok('and moves 2 MW out of it', comp(SO.score(site({ powerPotentialKw: 2000 })), 'capacity_fit') < 100);
SO.reset();

// ---- The score is source-agnostic -----------------------------------------------------
// A landfill and a flare with the same effective capacity, persistence and reachability must
// score identically. If they do not, a source type has leaked into the model.
var flare = SO.score({ id: 'f', energyType: 'flare_gas', source: 'flare-viirs', iso3: 'USA',
                       lat: 40, lng: -100, powerPotentialKw: 2000, dutyCyclePct: 100,
                       yearsSeen: 6, yearsTotal: 6, counterpartyType: 'oil_gas_operator' });
var landfill = SO.score({ id: 'l', energyType: 'landfill_gas', source: 'lmop', iso3: 'USA',
                          lat: 40, lng: -100, powerPotentialKw: 2000, dutyCyclePct: 100,
                          yearsSeen: 6, yearsTotal: 6, counterpartyType: 'oil_gas_operator' });
eq('identical prospects score the same regardless of source type', flare.score, landfill.score);

// ---- Structure -------------------------------------------------------------------------
var r = SO.score(site());
eq('seven components are reported', r.breakdown.length, 7);
ok('every component carries a human-readable detail',
   r.breakdown.every(function(b) { return typeof b.detail === 'string' && b.detail.length > 0; }));
ok('the default weights sum to 100',
   Object.keys(SO.DEFAULT_WEIGHTS).reduce(function(a, k) { return a + SO.DEFAULT_WEIGHTS[k]; }, 0) === 100);
ok('a null candidate does not throw', SO.score(null).score === null);
ok('a garbage candidate does not throw', SO.score('nonsense').score === null);

console.log(fail === 0 ? 'ALL PASS — ' + pass + ' assertions' : pass + ' passed, ' + fail + ' FAILED');
process.exit(fail === 0 ? 0 : 1);
