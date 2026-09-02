// The store had no tests, and the search facet is why that mattered: it shipped DORMANT — no
// UI set f.search — with a haystack of iso3, source id, energy type and rounded coordinates,
// so the day a search box arrived, typing a landfill's NAME would have matched nothing and the
// box would have looked broken while being wired perfectly.
//
// Fixture discipline: one candidate per predicate, built so that predicate ALONE excludes it.
// A fixture excluded by two predicates proves neither.

'use strict';

var path = require('path');
var ROOT = path.join(__dirname, '..');

var pass = 0, fail = 0;
function ok(label, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + (detail === undefined ? '' : '\n        ' + detail)); }
}
function eq(label, a, b) { ok(label, a === b, 'got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); }

global.localStorage = {
    getItem: function () { return null; }, setItem: function () {},
    removeItem: function () {}, key: function () { return null; }, length: 0
};

var Store = require(path.join(ROOT, 'prospect-store.js'));

// The store loads via adapters; for filter() it only needs _all. Feed it directly through the
// test seam if one exists, else through a fake adapter.
function seed(cands) {
    if (Store._setAll) { Store._setAll(cands); return; }
    // No seam: drive load() with one fake adapter through SiteSources if available.
    throw new Error('no test seam on ProspectStore — add _setAll');
}

function cand(over) {
    var base = {
        id: 'x', name: 'Plain LF', source: 'lmop-landfill', energyType: 'landfill_gas',
        lat: 40, lng: -100, iso3: 'USA', offshore: false, powerPotentialKw: 1000,
        yearsSeen: 3, lastSeen: '2024', operator: null, sourceDetail: {}
    };
    for (var k in over) base[k] = over[k];
    return base;
}

console.log('\nprospect-store filter');

var CANDS = [
    cand({ id: 'named',   name: 'Rimbey Landfill',  operator: 'Ponoka County',
           sourceDetail: { county: 'Ponoka', city: 'Rimbey', state: 'AB', lfid: '9901', ghgrpId: '1005512' } }),
    cand({ id: 'other',   name: 'Elsewhere LF',     operator: 'Waste Corp' }),
    cand({ id: 'small',   powerPotentialKw: 100 }),          // defeated by minKw alone
    cand({ id: 'foreign', iso3: 'MEX' })                     // defeated by scope alone
];
seed(CANDS);

eq('no filters: everything passes', Store.filter({}).length, 4);

// ---- the search haystack: what a person types ------------------------------------------------
function ids(f) { return Store.filter(f).map(function (c) { return c.id; }).join(','); }

eq('search by NAME matches', ids({ search: 'rimbey' }), 'named');
eq('search by OPERATOR matches', ids({ search: 'ponoka county' }), 'named');
eq('search by COUNTY matches', ids({ search: 'ponoka' }), 'named');
eq('search by STATE matches', ids({ search: ' AB ' .trim() }), 'named');
eq('search by LMOP landfill id matches', ids({ search: '9901' }), 'named');
eq('search by GHGRP id matches', ids({ search: '1005512' }), 'named');
eq('search that matches nothing returns nothing', ids({ search: 'zzz-nowhere' }), '');
// The old technical fields still work — extending the haystack must not have dropped them.
ok('search by source id still matches', Store.filter({ search: 'lmop-landfill' }).length === 4);

// ---- one predicate per fixture ---------------------------------------------------------------
eq('minKw excludes exactly the small fixture',
   Store.filter({ minKw: 500 }).map(function (c) { return c.id; }).indexOf('small'), -1);
eq('and keeps the rest', Store.filter({ minKw: 500 }).length, 3);
eq('the scope excludes exactly the foreign fixture',
   Store.filter({ iso3In: ['USA', 'CAN'] }).length, 3);
ok('but asking for MEX alone finds it', ids({ iso3: 'MEX' }) === 'foreign');

console.log('\n' + (fail ? 'FAILED — ' + fail + ' of ' + (pass + fail) : 'ALL PASS — ' + pass + ' assertions'));
if (fail) process.exit(1);
