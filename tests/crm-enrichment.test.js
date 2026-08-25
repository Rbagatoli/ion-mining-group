/* Enrichment completeness.
 *
 * The whole module produces one number that gets sorted on, so the arithmetic is
 * the thing worth holding down — and the ways it can flatter you are specific:
 * counting "not applicable" as done, giving half credit for "in progress", and
 * calling a checklist that was entirely waved away 100% finished. */

var path = require('path');
var ROOT = path.join(__dirname, '..');

var _store = {};
global.localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null; },
    setItem: function (k, v) { _store[k] = String(v); },
    removeItem: function (k) { delete _store[k]; },
    clear: function () { _store = {}; }
};
global.crypto = require('crypto').webcrypto || require('crypto');

var SiteData = require(ROOT + '/site-model.js');
var CrmConfig = require(ROOT + '/crm-config.js');
var CrmEnrichment = require(ROOT + '/crm-enrichment.js');
global.SiteData = SiteData; global.CrmConfig = CrmConfig; global.CrmEnrichment = CrmEnrichment;

var pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { pass++; console.log('  ok    ' + label); return; }
    fail++;
    console.log('  FAIL  ' + label + (detail ? '   ' + detail : ''));
}
function eq(label, got, want) {
    ok(got === want, label, 'got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want));
}
function fresh() {
    _store = {}; CrmConfig.reset(); CrmEnrichment.reset();
    SiteData.registerStages(SiteData.DEFAULT_STAGES);
}

// ---- The checklist follows the source type ----------------------------------
fresh();
SiteData.add(SiteData.normalize({ id: 'lf', name: 'Landfill', energy_type: 'landfill_gas' }));
SiteData.add(SiteData.normalize({ id: 'fl', name: 'Wellpad', energy_type: 'flare_gas' }));
SiteData.add(SiteData.normalize({ id: 'xx', name: 'Something else', energy_type: 'wind_curtailment' }));

eq('a landfill gets the landfill questions', CrmEnrichment.itemsFor('lf').length, 9);
eq('a wellpad gets its own', CrmEnrichment.itemsFor('fl').length, 6);
ok(CrmEnrichment.itemsFor('lf').some(function (i) { return i.key === 'collection'; }),
   'including whether the collection system is real');
ok(CrmEnrichment.itemsFor('fl').some(function (i) { return i.key === 'decline'; }),
   'and the wellpad is asked about its decline curve instead');
/* An empty checklist would read as "nothing to research here", which is never
   true of a site somebody has chosen to track. */
eq('an unknown source falls back to a generic list rather than an empty one',
   CrmEnrichment.itemsFor('xx').length, 4);

eq('every item starts not started', CrmEnrichment.itemsFor('lf')[0].status, 'not_started');
eq('and nothing recorded means no source note', CrmEnrichment.itemsFor('lf')[0].note, null);

// ---- The percentage ----------------------------------------------------------
fresh();
SiteData.add(SiteData.normalize({ id: 'p', name: 'P', energy_type: 'flare_gas' }));   // 6 items
eq('nothing done is zero, not null', CrmEnrichment.completeness('p').pct, 0);

CrmEnrichment.set('p', 'operator', 'complete', 'AER ST104, licence 0123456');
CrmEnrichment.set('p', 'facility_id', 'complete', 'Well UWI from the same filing');
CrmEnrichment.set('p', 'production', 'complete');
eq('three of six is fifty per cent', CrmEnrichment.completeness('p').pct, 50);

/* IN PROGRESS IS NOT HALF DONE. Half credit is how a checklist starts
   flattering you: everything parks at 50% and the number stops telling the
   finished sites from the started ones. */
CrmEnrichment.set('p', 'decline', 'in_progress');
eq('starting a fourth does not move the percentage', CrmEnrichment.completeness('p').pct, 50);
eq('but it is counted separately', CrmEnrichment.completeness('p').inProgress, 1);
eq('and what is left is what is left', CrmEnrichment.completeness('p').outstanding, 2);

/* NOT APPLICABLE LEAVES THE DENOMINATOR. Counting it as done inflates; counting
   it as outstanding makes a finished site look permanently unfinished. */
CrmEnrichment.set('p', 'surface', 'na', 'Crown land — no surface owner to find');
var c = CrmEnrichment.completeness('p');
eq('marking one not applicable shrinks the denominator', c.applicable, 5);
eq('so three of five is sixty', c.pct, 60);
eq('the total is still six', c.total, 6);
eq('and one of them is not applicable', c.na, 1);

// ---- Nothing applicable is not finished ---------------------------------------
fresh();
SiteData.add(SiteData.normalize({ id: 'q', energy_type: 'flare_gas' }));
var items = CrmEnrichment.itemsFor('q');
for (var i = 0; i < items.length; i++) CrmEnrichment.set('q', items[i].key, 'na');
var allNa = CrmEnrichment.completeness('q');
eq('a checklist waved away entirely is null, not 100%', allNa.pct, null);
eq('because nothing applied to it', allNa.applicable, 0);
/* A site nobody researched sorts below one at 0%, because 0% of six questions
   is somebody who has started thinking and "nothing applies" is somebody who
   has not. */
ok(CrmEnrichment.sortKey('q') < 0, 'and it sorts below a prospect at zero',
   'dismissed is not researched');

// ---- The source note is the point ---------------------------------------------
fresh();
SiteData.add(SiteData.normalize({ id: 'r', energy_type: 'landfill_gas' }));
CrmEnrichment.set('r', 'owner', 'complete', 'ECHO facility report');
var owner = CrmEnrichment.itemsFor('r').filter(function (x) { return x.key === 'owner'; })[0];
eq('a finding records where it came from', owner.note, 'ECHO facility report');
ok(owner.at, 'and when it was found',
   '"owner identified" with no source is a claim rather than a finding');

CrmEnrichment.set('r', 'echo', 'complete');
eq('a finding with no source is still allowed',
   CrmEnrichment.itemsFor('r').filter(function (x) { return x.key === 'echo'; })[0].note, null);

eq('an unknown status is refused', CrmEnrichment.set('r', 'owner', 'nearly').ok, false);

// ---- Ranked ---------------------------------------------------------------------
fresh();
SiteData.add(SiteData.normalize({ id: 'a', name: 'Nearly there', energy_type: 'flare_gas' }));
SiteData.add(SiteData.normalize({ id: 'b', name: 'Barely started', energy_type: 'flare_gas' }));
SiteData.add(SiteData.normalize({ id: 'c', name: 'Untouched', energy_type: 'flare_gas' }));
['operator', 'facility_id', 'production', 'decline', 'size_class']
    .forEach(function (k) { CrmEnrichment.set('a', k, 'complete'); });
CrmEnrichment.set('b', 'operator', 'complete');
var rank = CrmEnrichment.ranked();
eq('the most enriched is first', rank[0].name, 'Nearly there');
eq('then the one barely started', rank[1].name, 'Barely started');
eq('and the untouched one last', rank[2].name, 'Untouched');
eq('with its figure attached', rank[0].completeness.pct, 83);

console.log(fail ? '\n  ' + fail + ' FAILED' : '\n  ALL PASS — ' + pass + ' assertions');
process.exit(fail ? 1 : 0);
