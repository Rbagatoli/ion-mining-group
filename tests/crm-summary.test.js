/* The one-page deal summary.
 *
 * The page leaves the app. Somebody reads it who cannot see the record behind
 * it, cannot tell a field that was checked and empty from one nobody looked at,
 * and has no way to know that a rate came off a phone call rather than a signed
 * page. Everything asserted below is about that gap.
 */

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
var CrmContacts = require(ROOT + '/crm-contacts.js');
var CrmEnrichment = require(ROOT + '/crm-enrichment.js');
var CrmDocuments = require(ROOT + '/crm-documents.js');
global.SiteData = SiteData; global.CrmConfig = CrmConfig; global.CrmLog = CrmLog;
global.CrmFollowups = CrmFollowups; global.CrmInteractions = CrmInteractions;
global.CrmContacts = CrmContacts; global.CrmEnrichment = CrmEnrichment;
global.CrmDocuments = CrmDocuments;
var S = require(ROOT + '/prospect-summary.js');

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
    CrmConfig.reset(); CrmLog.reset(); CrmFollowups.reset();
    CrmContacts.reset(); CrmEnrichment.reset(); CrmDocuments.reset();
    SiteData.registerStages(SiteData.DEFAULT_STAGES);
    CrmConfig.publish();
}
function findFact(rows, label) {
    for (var i = 0; i < rows.length; i++) if (rows[i].label === label) return rows[i];
    return null;
}

// ---- A prospect nobody has touched ---------------------------------------------
/* The hardest case, and the one that actually happens: a site pulled off the map
   an hour ago. Almost every field is empty, and the page has to read as "we know
   nothing yet" rather than as a description of a site with no capacity, no
   operator and no contacts. */
fresh();
SiteData.add(SiteData.normalize({ id: 'bare', name: 'Unnamed flare', stage: 'unreviewed' }));
var bare = S.build('bare');
ok(!!bare, 'a bare prospect still produces a summary');
eq('with its name', bare.name, 'Unnamed flare');
eq('capacity is absent, not zero', findFact(bare.asset, 'Capacity').value, null);
eq('and so is the operator', findFact(bare.asset, 'Operator').value, null);
eq('never contacted is null, not 0 days', bare.standing.daysSinceContact, null);
eq('nothing is scheduled', bare.standing.nextAction, null);
eq('nobody to call', bare.contacts.length, 0);
/* The point of the section. Every empty field above is named here, so a reader
   scanning for what is unknown does not have to find the blanks themselves. */
ok(bare.gaps.facts.indexOf('Capacity') >= 0, 'capacity is listed as not recorded',
   JSON.stringify(bare.gaps.facts));
ok(bare.gaps.facts.indexOf('Anyone to call') >= 0, 'and so is having nobody to call',
   JSON.stringify(bare.gaps.facts));

var t = S.text('bare');
ok(/not recorded/.test(t), 'the text says not recorded rather than leaving a blank');
ok(/never contacted/.test(t), 'and says never contacted in words');
ok(!/: *\n/.test(t), 'no field is left as an empty value', 'an empty value reads as zero');

// ---- Terms are what was said until something is signed --------------------------
fresh();
SiteData.add(SiteData.normalize({
    id: 'deal', name: 'Ironbark', stage: 'term_sheet', usable_kw: 3400,
    energy_type: 'flare_gas', jurisdiction: 'AB',
    /* Stored as a key, not as a display string -- normalize() drops anything
       that is not one of the three it knows. */
    quoted_rate: 1.85, quoted_rate_units: 'usd_gj',
    take_or_pay_pct: 60, contract_term_years: 5
}));
var d = S.build('deal');
eq('the rate is reported in the units it was quoted in',
   findFact(d.terms.rows, 'Rate as quoted').value, '1.85 $/GJ');
/* The qualifier is the difference between two numbers that look comparable and
   are not. $/GJ is the fuel; $/kWh is everything. */
eq('and says which of the two it is', findFact(d.terms.rows, 'Rate as quoted').note,
   'fuel only');
eq('nothing is executed yet', d.terms.executed, false);
ok(/AS DISCUSSED/.test(S.text('deal')), 'and the text says so in capitals',
   'a quoted rate read as agreed is how a call becomes a commitment');

CrmDocuments.add('deal', { title: 'Executed GPA', kind: 'agreement', signed_on: '2026-05-02' });
d = S.build('deal');
eq('an agreement on file changes that', d.terms.executed, true);
ok(!/AS DISCUSSED/.test(S.text('deal')), 'and the caveat goes away');
/* The rate itself is unchanged -- the agreement governs, and the summary says
   that rather than pretending to have read it. */
eq('the recorded rate is untouched', findFact(S.build('deal').terms.rows, 'Rate as quoted').value,
   '1.85 $/GJ');

// ---- Capacity says which figure it is -------------------------------------------
fresh();
SiteData.add(SiteData.normalize({ id: 'np', name: 'Nameplate only', stage: 'researching',
                                  nameplate_kw: 2000 }));
SiteData.add(SiteData.normalize({ id: 'us', name: 'Usable known', stage: 'researching',
                                  nameplate_kw: 2000, usable_kw: 1400 }));
eq('nameplate is labelled nameplate', findFact(S.build('np').asset, 'Capacity').note, 'nameplate');
eq('and usable is labelled usable', findFact(S.build('us').asset, 'Capacity').note, 'usable');
eq('usable is the one reported when both exist',
   findFact(S.build('us').asset, 'Capacity').value, '1.4 MW');

// ---- The history is the shape of the conversation --------------------------------
fresh();
SiteData.add(SiteData.normalize({ id: 'h', name: 'Talky', stage: 'unreviewed' }));
SiteData.setStage('h', 'contacted');
CrmInteractions.log('h', { type: 'call', direction: 'outbound', outcome: 'positive',
                           summary: 'Wants the gas spec' });
CrmLog.append('note', 'h', { body: 'Their landfill gas report is on the county site' });
var hh = S.build('h');
eq('everything is on the timeline', hh.historyTotal, 3);
eq('newest first', hh.history[0].kind, 'note');
ok(/county site/.test(hh.history[0].line), 'a note reads as its text', hh.history[0].line);
ok(/Wants the gas spec/.test(hh.history[1].line), 'a call reads as what was said',
   hh.history[1].line);

/* A corrected entry shows the correction, not both. Two contradictory lines on a
   page somebody else reads is worse than either one alone. */
var call = CrmInteractions.latest('h');
CrmInteractions.correct(call.id, { summary: 'Wants the gas spec AND the interconnect study' });
hh = S.build('h');
var joined = hh.history.map(function (x) { return x.line; }).join(' | ');
ok(/interconnect study/.test(joined), 'the correction is on the page');
ok(!/Wants the gas spec \|/.test(joined) &&
   joined.indexOf('Wants the gas spec') === joined.lastIndexOf('Wants the gas spec'),
   'and the superseded version is not', joined);

// ---- A long history is capped, and says it was ----------------------------------
fresh();
SiteData.add(SiteData.normalize({ id: 'long', name: 'Long', stage: 'contacted' }));
for (var i = 0; i < 20; i++) CrmLog.append('note', 'long', { body: 'note ' + i });
var lg = S.build('long');
eq('the page shows twelve', lg.history.length, 12);
eq('out of twenty', lg.historyTotal, 20);
/* Reported, because a truncated history that does not say so reads as a short
   one -- and a short history means something quite different about a deal. */
ok(/most recent 12 of 20/.test(S.text('long')), 'and says which is which');

// ---- What is not on file ----------------------------------------------------------
fresh();
SiteData.add(SiteData.normalize({ id: 'g', name: 'Gappy', stage: 'diligence',
                                  energy_type: 'flare_gas' }));
CrmDocuments.add('g', { title: 'Mutual NDA', kind: 'nda' });
var g = S.build('g');
ok(g.gaps.documents.indexOf('Gas analysis') >= 0, 'a missing expected document is named',
   JSON.stringify(g.gaps.documents));
ok(g.gaps.documents.indexOf('NDA') < 0, 'the one on file is not');
ok(g.gaps.research.length > 0, 'and outstanding research is listed');
var gt = S.text('g');
ok(/Not on file: .*Gas analysis/.test(gt), 'the text carries it too');

// ---- A document link on the page is a safe one ------------------------------------
fresh();
SiteData.add(SiteData.normalize({ id: 'x', name: 'Linky', stage: 'contacted' }));
CrmDocuments.add('x', { title: 'Bad', kind: 'other', url: 'javascript:alert(1)' });
CrmDocuments.add('x', { title: 'Good', kind: 'other', url: 'https://example.com/a.pdf' });
var lk = S.build('x');
var bad = null, good = null;
for (var b = 0; b < lk.documents.length; b++) {
    if (lk.documents[b].title === 'Bad') bad = lk.documents[b];
    if (lk.documents[b].title === 'Good') good = lk.documents[b];
}
eq('a good link is marked linkable', good.linked, true);
eq('a javascript: url is not', bad.linked, false);
/* Still shown, so it can be found and fixed. It simply never becomes an href. */
eq('but is still on the page as text', bad.where, 'javascript:alert(1)');

// ---- A sentinel is not a fact -----------------------------------------------------
/* The contact store keeps 'unknown' as the role of somebody whose role nobody
   recorded. On a page read by a person who cannot see the store, printing that
   verbatim beside a name reads as a statement about the person. */
fresh();
SiteData.add(SiteData.normalize({ id: 'r', name: 'Roles', stage: 'contacted' }));
CrmContacts.add({ name: 'Nobody Knows', linked_prospects: ['r'] });
CrmContacts.add({ name: 'Dave Mercer', role: 'operations', linked_prospects: ['r'] });
var rs = S.build('r');
var byName = {};
for (var rn = 0; rn < rs.contacts.length; rn++) byName[rs.contacts[rn].name] = rs.contacts[rn];
eq('an unrecorded role is an absence', byName['Nobody Knows'].role, null);
eq('and a real one is spelled out', byName['Dave Mercer'].role, 'Operations');
ok(!/unknown/.test(S.text('r')), 'the word never reaches the page', S.text('r'));

// ---- A prospect that does not exist ----------------------------------------------
eq('no record, no summary', S.build('nope'), null);
eq('and no text either', S.text('nope'), null);

console.log(fail ? '\n  ' + fail + ' FAILED' : '\n  ALL PASS — ' + pass + ' assertions');
process.exit(fail ? 1 : 0);
