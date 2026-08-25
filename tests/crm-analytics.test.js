/* Pipeline analytics.
 *
 * The brief says these only mean anything after twenty or thirty prospects, so
 * the thing worth testing hardest is what the module does BEFORE that: every
 * figure carries its n, and a thin one is flagged rather than printed at full
 * confidence. A median of two is two numbers with a line between them, and
 * printed at the same weight as everything else it will get planned against. */

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
var CrmFollowups = require(ROOT + '/crm-followups.js');
var CrmInteractions = require(ROOT + '/crm-interactions.js');
var CrmEnrichment = require(ROOT + '/crm-enrichment.js');
var A = require(ROOT + '/prospect-analytics.js');
global.SiteData = SiteData; global.CrmConfig = CrmConfig; global.CrmLog = CrmLog;
global.CrmFollowups = CrmFollowups; global.CrmInteractions = CrmInteractions;
global.CrmEnrichment = CrmEnrichment;

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
    _store = {};
    CrmConfig.reset(); CrmLog.reset(); CrmFollowups.reset(); CrmEnrichment.reset();
    SiteData.registerStages(SiteData.DEFAULT_STAGES);
    CrmConfig.publish();
}
function find(rows, key) {
    for (var i = 0; i < rows.length; i++) if (rows[i].key === key) return rows[i];
    return null;
}

// ---- Nothing to report is reported as nothing --------------------------------
fresh();
var empty = A.summary();
eq('an empty pipeline tracks nothing', empty.tracked, 0);
eq('and every stage is honestly at zero', find(empty.byStage, 'contacted').count, 0);
/* null, not 0 MW. "No capacity measured here" is a different fact from "no
   capacity here", and a 0 MW column asserts the second. */
eq('with no capacity asserted', find(empty.byStage, 'contacted').kw, null);
eq('no deaths to explain', empty.deadReasons.total, 0);
eq('and no response rate to quote', empty.outreach.rate.value, null);

// ---- Where things are ----------------------------------------------------------
fresh();
function mk(id, stage, kw) {
    SiteData.add(SiteData.normalize({ id: id, stage: stage, usable_kw: kw,
                                      energy_type: 'flare_gas' }));
}
mk('a', 'contacted', 1000); mk('b', 'contacted', 2000); mk('c', 'contacted', null);
mk('d', 'diligence', 5000);
var bs = A.byStage();
eq('three in contacted', find(bs, 'contacted').count, 3);
eq('and their measured capacity totals', find(bs, 'contacted').kw, 3000);
eq('with the count that was actually measured', find(bs, 'contacted').measured, 2);

// ---- Dead reasons, the point of the whole exercise ---------------------------
fresh();
mk('d1', 'contacted', 1000); mk('d2', 'contacted', 1000);
mk('d3', 'contacted', 1000); mk('d4', 'contacted', 1000);
SiteData.setStage('d1', 'dead', { deadReason: 'gas_quality' });
SiteData.setStage('d2', 'dead', { deadReason: 'gas_quality' });
SiteData.setStage('d3', 'dead', { deadReason: 'price' });
SiteData.setStage('d4', 'dead', { deadReason: 'gas_quality' });
var dr = A.deadReasons();
eq('four deaths counted', dr.total, 4);
eq('ranked, commonest first', dr.rows[0].key, 'gas_quality');
eq('with the count', dr.rows[0].count, 3);
eq('and the share', dr.rows[0].pct, 75);
eq('the runner-up follows', dr.rows[1].key, 'price');

/* A prospect that died and came back still counts its death. The question is
   what happens to deals, not what is currently sitting in the dead column. */
SiteData.setStage('d1', 'contacted', { note: 'They called back' });
eq('a resurrected prospect keeps its death in the record', A.deadReasons().total, 4);
/* Four died, one came back, so three are still there -- while the reasons
   above still count all four. That gap is the point: the dead COLUMN is where
   things are, the dead REASONS are what happened. */
eq('and it is no longer in the dead column', find(A.byStage(), 'dead').count, 3);

// ---- Time in stage: only closed legs -----------------------------------------
fresh();
mk('t1', 'unreviewed', 1000);
SiteData.setStage('t1', 'contacted');
var tis = A.timeInStage();
/* The leg it is sitting in right now is not finished, so it is not a duration.
   Counting it would drag every median toward however long ago the app was
   first opened. */
eq('an open leg is not a measurement', find(tis, 'contacted').median.n, 0);
SiteData.setStage('t1', 'in_discussion');
eq('a closed one is', find(A.timeInStage(), 'contacted').median.n, 1);

/* And with one sample it says so rather than quoting a median. */
var one = find(A.timeInStage(), 'contacted').median;
eq('one sample is flagged thin', one.thin, true);
eq('but the value is still there for anyone who wants it', one.value, 0);
eq('with its n attached', one.n, 1);

eq('the median of an even set rounds', A.median([2, 4, 6, 9]), 5);
eq('and of an odd set is the middle', A.median([1, 9, 100]), 9);
eq('an empty set has no median', A.median([]), null);

// ---- Conversion: advancing, not stepping -------------------------------------
fresh();
mk('c1', 'unreviewed', 1000); mk('c2', 'unreviewed', 1000); mk('c3', 'unreviewed', 1000);
SiteData.setStage('c1', 'contacted');
SiteData.setStage('c2', 'contacted');
SiteData.setStage('c3', 'contacted');
/* c1 skips in_discussion entirely — a warm intro straight to terms. A strict
   A-to-B conversion would score in_discussion as a failure for c1 and make
   term_sheet look unreachable. */
SiteData.setStage('c1', 'term_sheet');
SiteData.setStage('c2', 'dead', { deadReason: 'price' });
var conv = A.conversion();
var fromContacted = find(conv, 'contacted');
eq('all three reached contacted', fromContacted.reached, 3);
eq('one advanced past it, skipping a stage on the way', fromContacted.advanced, 1);
eq('dying is not advancing', fromContacted.rate.value, 33);
ok(!find(conv, 'dead') && !find(conv, 'closed_won'),
   'terminal stages have no conversion row', 'there is nothing to advance to');

// ---- Outreach ------------------------------------------------------------------
fresh();
mk('o1', 'contacted', 1000);
CrmInteractions.log('o1', { type: 'email', direction: 'outbound', outcome: 'no_answer' });
CrmInteractions.log('o1', { type: 'email', direction: 'outbound', outcome: 'positive' });
CrmInteractions.log('o1', { type: 'call', direction: 'outbound', outcome: 'negative' });
CrmInteractions.log('o1', { type: 'call', direction: 'outbound' });          // not recorded
CrmInteractions.log('o1', { type: 'call', direction: 'inbound', outcome: 'positive' });
CrmInteractions.log('o1', { type: 'note', direction: 'n/a' });
var o = A.outreach();
eq('four went out', o.sent, 4);
eq('two of them got an answer', o.answered, 2);
eq('one got silence', o.silent, 1);
/* An interaction with no outcome recorded leaves the denominator. An unanswered
   question is not a no. */
eq('and one was never judged', o.unrecorded, 1);
eq('so the rate is two of three, not two of four', o.rate.value, 67);
eq('with the n it was computed from', o.rate.n, 3);

// ---- Deaths with no reason on them ---------------------------------------------
/* setStage refuses to kill a prospect without a configured reason, so this can
   only arrive from outside it -- an import, or a log written before the reasons
   existed. Those deaths are still deaths, and dropping them would make the
   ranked list look complete when a quarter of the record is missing. */
fresh();
mk('u1', 'contacted', 1000);
mk('u2', 'contacted', 1000);
SiteData.setStage('u1', 'dead', { deadReason: 'price' });
CrmLog.append('stage', 'u2', { from: 'contacted', to: 'dead' });
var ud = A.deadReasons();
eq('a death with no reason still counts', ud.total, 2);
var un = null;
for (var ui = 0; ui < ud.rows.length; ui++) if (ud.rows[ui].key === 'unrecorded') un = ud.rows[ui];
ok(!!un, 'and gets its own row', 'so the ranking is not quietly incomplete');
eq('labelled as the gap it is', un ? un.label : null, 'Not recorded');
eq('and it is half of them', un ? un.pct : null, 50);

/* A reason that is no longer in the config keeps its key rather than vanishing.
   Retiring a reason must not rewrite the history of deals that died of it. */
fresh();
mk('r1', 'contacted', 1000);
CrmLog.append('stage', 'r1', { from: 'contacted', to: 'dead', dead_reason: 'retired_reason' });
eq('a retired reason survives in the record', A.deadReasons().rows[0].key, 'retired_reason');

// ---- A corrected interaction is not two interactions ----------------------------
/* CrmInteractions.correct appends rather than edits, so without honouring
   supersedes every correction would inflate both the send count and whichever
   outcome was wrong in the first place. */
fresh();
mk('s1', 'contacted', 1000);
CrmInteractions.log('s1', { type: 'email', direction: 'outbound', outcome: 'no_answer' });
var entry = CrmInteractions.latest('s1');
eq('one call out', A.outreach().sent, 1);
eq('recorded as silence', A.outreach().silent, 1);
CrmInteractions.correct(entry.id, { outcome: 'positive' });
eq('after a correction it is still one call', A.outreach().sent, 1);
eq('the wrong outcome is gone', A.outreach().silent, 0);
eq('and the right one stands', A.outreach().answered, 1);

// ---- Enrichment spread ----------------------------------------------------------
fresh();
mk('e1', 'contacted', 1000); mk('e2', 'contacted', 1000);
['operator', 'facility_id', 'production', 'decline', 'size_class', 'surface']
    .forEach(function (k) { CrmEnrichment.set('e1', k, 'complete'); });
var spread = A.enrichmentSpread();
eq('a fully researched prospect lands in the top bucket',
   spread[spread.length - 1].count, 1);
eq('and an untouched one at zero', spread[1].count, 1);

console.log(fail ? '\n  ' + fail + ' FAILED' : '\n  ALL PASS — ' + pass + ' assertions');
process.exit(fail ? 1 : 0);
