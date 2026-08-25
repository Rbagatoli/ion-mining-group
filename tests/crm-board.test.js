/* The pipeline board: grouping, ordering, absent values, and staleness.
 *
 * Rendering is asserted through the module's own functions rather than through a
 * DOM, because what can actually be wrong here is the arithmetic and the
 * ordering, not the markup. The markup was checked in a browser; these are the
 * parts that will quietly drift. */

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
var CrmLog = require(ROOT + '/crm-log.js');
var Board = require(ROOT + '/prospect-board.js');
global.SiteData = SiteData; global.CrmConfig = CrmConfig; global.CrmLog = CrmLog;

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
    _store = {}; CrmConfig.reset(); CrmLog.reset();
    SiteData.registerStages(SiteData.DEFAULT_STAGES);
    CrmConfig.publish();
}
function rec(o) { return SiteData.normalize(o); }

// ---- Columns come from the config -------------------------------------------
fresh();
var cols = Board.group([]);
eq('a column per configured stage', cols.length, 9);
eq('in the configured order', cols[0].key, 'unreviewed');
eq('carrying the label, not the key', cols[3].label, 'In discussion');
eq('and the tone the CSS keys on', cols[8].tone, 'negative');

CrmConfig.setStages(CrmConfig.stages().concat(
    [{ key: 'permit_review', label: 'Permit review', tone: 'warm', active: true, staleDays: 21 }]));
eq('a stage added in config becomes a column with no code change',
   Board.group([]).length, 10);

/* A record whose stage the config no longer lists has to go somewhere. Dropping
   it would hide a live prospect; the board is the only place it would have been
   seen. This can only arise from a sync, since normalize() rewrites anything it
   does not recognise -- which is exactly why it is worth catching. */
fresh();
var orphan = { id: 'o1', name: 'Orphan', stage: 'a_stage_that_was_removed',
               usable_kw: 1000, custom_fields: {} };
var withOrphan = Board.group([orphan]);
eq('an unplaceable record gets its own column rather than vanishing',
   withOrphan[withOrphan.length - 1].key, '__unplaced');
eq('and it is in it', withOrphan[withOrphan.length - 1].items.length, 1);

// ---- Ordering inside a column ------------------------------------------------
fresh();
var a = rec({ id: 'a', name: 'Low',      stage: 'contacted', custom_fields: { opportunity_score: 40 } });
var b = rec({ id: 'b', name: 'High',     stage: 'contacted', custom_fields: { opportunity_score: 90 } });
var c = rec({ id: 'c', name: 'Unscored', stage: 'contacted' });
var order = Board.sortColumn([a, c, b]).map(function (r) { return r.name; });
eq('highest score first', order[0], 'High');
eq('then the rest', order[1], 'Low');
/* Unscored is not zero. A prospect nobody has scored is not a bad prospect, and
   sorting it as one would bury exactly the sites that need looking at. */
eq('and unscored sorts last, not as zero', order[2], 'Unscored');

// ---- Absent values are rendered, not blanked ---------------------------------
fresh();
var noKw = Board.card(rec({ id: 'n', name: 'No estimate', stage: 'unreviewed' }));
ok(noKw.indexOf('no estimate') >= 0,
   'a prospect with no capacity says so on the card',
   'a silent gap makes an incomplete card look complete');
ok(noKw.indexOf('unscored') >= 0, 'and an unscored one says that too');
ok(noKw.indexOf('not moved yet') >= 0,
   'a prospect that has never moved says so rather than showing zero days',
   'zero days would read as "just touched" on the ones nobody has touched');

eq('capacity totals ignore the ones with no estimate',
   Board.totalMw([rec({ id: '1', usable_kw: 1000 }), rec({ id: '2', usable_kw: null })]), 1000);
eq('and a column with nothing measured totals null, not zero',
   Board.totalMw([rec({ id: '3', usable_kw: null })]), null);

eq('the source reads as words, not as a database key',
   Board.sourceLabel({ energy_type: 'landfill_gas' }), 'Landfill gas');

// ---- Staleness is per stage ---------------------------------------------------
fresh();
/* contacted allows 14 days, agreement allows 7. One threshold for the whole
   pipeline would call a normal wait on one stage a problem on another. */
eq('contacted is patient for a fortnight',
   Board.isStale(rec({ id: 'x', stage: 'contacted' }), 13), false);
eq('and not beyond it',
   Board.isStale(rec({ id: 'x', stage: 'contacted' }), 15), true);
eq('agreement is not patient at all by comparison',
   Board.isStale(rec({ id: 'y', stage: 'agreement' }), 8), true);
eq('a stage with no threshold can never be stale',
   Board.isStale(rec({ id: 'z', stage: 'unreviewed' }), 900), false);
eq('and a prospect that has never moved is not stale either',
   Board.isStale(rec({ id: 'z', stage: 'contacted' }), null), false);

console.log(fail ? '\n  ' + fail + ' FAILED' : '\n  ALL PASS — ' + pass + ' assertions');
process.exit(fail ? 1 : 0);
