/* Contacts as records, the interaction log, and follow-ups.
 *
 * THE ASSERTION THIS SUITE EXISTS FOR is that promoting a contact out of the
 * five flat fields cannot change an opportunity score. contactTier feeds the
 * ranked table; if the migration moved a prospect even one tier, the whole list
 * would silently re-order and nobody would know why. So the tier is computed
 * both ways — old fields, new records — and compared. */

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
var CrmContacts = require(ROOT + '/crm-contacts.js');
var CrmInteractions = require(ROOT + '/crm-interactions.js');
var SiteOpportunity = require(ROOT + '/site-opportunity.js');
global.SiteData = SiteData; global.CrmConfig = CrmConfig; global.CrmLog = CrmLog;
global.CrmFollowups = CrmFollowups; global.CrmContacts = CrmContacts;
global.CrmInteractions = CrmInteractions;

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
    CrmConfig.reset(); CrmLog.reset(); CrmContacts.reset(); CrmFollowups.reset();
    SiteData.registerStages(SiteData.DEFAULT_STAGES);
    CrmConfig.publish();
}
var DAY = 86400000;

// ---- The tier must not move --------------------------------------------------
fresh();
/* The old world: a named person with an email, typed into the flat fields. */
var flat = SiteData.add(SiteData.normalize({
    id: 'p1', name: 'Cell 4', operator: 'Republic Services',
    contact_name: 'J. Smith', contact_email: 'j@example.com'
}));
var tierBefore = SiteOpportunity.contactTier({}, { manual: SiteData.get('p1') });
eq('the flat fields give tier 1', tierBefore.tier, 1);

/* The new world: the same person as a record, linked. */
var promoted = CrmContacts.backfill();
eq('backfill promoted the one prospect that had a contact', promoted.created, 1);
var tierAfter = SiteOpportunity.contactTier({}, { manual: CrmContacts.contactCtx('p1') });
eq('and the tier is exactly the same afterwards', tierAfter.tier, tierBefore.tier);
eq('down to the score it contributes', tierAfter.score, tierBefore.score);

ok(SiteData.get('p1').contact_name === 'J. Smith',
   'the flat fields are left in place, not deleted',
   'they are the fallback if the contacts store fails to load');

eq('running backfill twice creates nobody twice', CrmContacts.backfill().created, 0);

/* Degradation: with no contacts module, the scorer sees the flat fields and
   answers as it always did rather than dropping to "no operator identified". */
eq('and the old fields still answer on their own',
   SiteOpportunity.contactTier({}, { manual: SiteData.get('p1') }).tier, 1);

// ---- One person, several prospects -------------------------------------------
fresh();
SiteData.add(SiteData.normalize({ id: 'a', name: 'Landfill A' }));
SiteData.add(SiteData.normalize({ id: 'b', name: 'Landfill B' }));
SiteData.add(SiteData.normalize({ id: 'c', name: 'Landfill C' }));
var mgr = CrmContacts.add({
    name: 'K. Doyle', title: 'Waste authority manager', phone: '555-0100',
    role: 'decision_maker', linked_prospects: ['a', 'b', 'c']
});
eq('one contact can cover three prospects', CrmContacts.forProspect('b').length, 1);
eq('and all three see them', CrmContacts.forProspect('c')[0].id, mgr.id);
eq('so all three inherit the tier', SiteOpportunity.contactTier({}, {
    manual: CrmContacts.contactCtx('c') }).tier, 1);
CrmContacts.unlink(mgr.id, 'c');
eq('unlinking removes them from one without touching the others',
   CrmContacts.forProspect('c').length, 0);
eq('and the others are untouched', CrmContacts.forProspect('a').length, 1);

// ---- Which contact is "best" -------------------------------------------------
fresh();
SiteData.add(SiteData.normalize({ id: 'p2' }));
CrmContacts.add({ name: 'Gatekeeper', role: 'gatekeeper', linked_prospects: ['p2'] });
var best1 = CrmContacts.bestFor('p2');
eq('with only a name, that is the best there is', best1.name, 'Gatekeeper');
/* TIER 4, AND THAT IS THE EXISTING LADDER RATHER THAN A BUG HERE. contactTier's
   tier 3 is "operator named, no contact", and it is keyed on manual.operator --
   the company as filed with the regulator -- not on knowing a person's name. So
   a named human you cannot yet reach scores the same as a site with nobody
   identified at all.

   Left exactly as it is. contactTier is not this build's to change, the same
   value came out of the flat fields before contacts existed, and overlaying a
   typed-in organisation onto `operator` would put user-typed data where sourced
   data is expected -- which the model separates them to prevent.

   Worth raising as a scoring question once real calls have happened: a named
   gatekeeper is genuinely more actionable than an anonymous site, and the ladder
   currently cannot say so. */
eq('a named person you cannot reach scores as tier 4, as it always did',
   SiteOpportunity.contactTier({}, { manual: CrmContacts.contactCtx('p2') }).tier, 4);

CrmContacts.add({ name: 'Engineer', email: 'e@example.com', role: 'technical', linked_prospects: ['p2'] });
eq('someone reachable outranks someone who is not', CrmContacts.bestFor('p2').name, 'Engineer');
eq('and the tier improves accordingly',
   SiteOpportunity.contactTier({}, { manual: CrmContacts.contactCtx('p2') }).tier, 1);

CrmContacts.add({ name: 'Director', phone: '555-0111', role: 'decision_maker', linked_prospects: ['p2'] });
eq('between two reachable people the decision maker wins',
   CrmContacts.bestFor('p2').name, 'Director');

/* A linked contact with no phone must not erase a phone somebody typed into the
   old fields — that would LOWER the tier and re-rank the prospect. */
fresh();
SiteData.add(SiteData.normalize({ id: 'p3', contact_name: 'Old Name', contact_phone: '555-9999' }));
CrmContacts.add({ name: 'New Name', linked_prospects: ['p3'] });
var ctx = CrmContacts.contactCtx('p3');
eq('a newer contact supplies the name', ctx.contact_name, 'New Name');
eq('but does not wipe a number it does not have', ctx.contact_phone, '555-9999');
eq('so the tier cannot go backwards',
   SiteOpportunity.contactTier({}, { manual: ctx }).tier, 1);

// ---- The interaction log ------------------------------------------------------
fresh();
SiteData.add(SiteData.normalize({ id: 'p4', stage: 'contacted' }));
eq('nothing logged means never contacted', CrmInteractions.lastContactedAt('p4'), null);
eq('which is not the same as long ago', CrmInteractions.daysSinceContact('p4'), null);

var r = CrmInteractions.log('p4', {
    type: 'call', direction: 'outbound', contact_person: 'K. Doyle',
    summary: 'Asked about the collection system', outcome: 'positive',
    occurred_at: new Date(Date.now() - 3 * DAY).toISOString()
});
ok(r.ok, 'an interaction is logged');
eq('and it is the most recent one', CrmInteractions.latest('p4').summary,
   'Asked about the collection system');
eq('staleness counts from when it HAPPENED, not when it was typed',
   CrmInteractions.daysSinceContact('p4'), 3);

/* A note to self is not contact with anybody. */
CrmInteractions.log('p4', { type: 'note', summary: 'Check the permit' });
eq('a note does not reset the contact clock', CrmInteractions.daysSinceContact('p4'), 3);

var corrected = CrmInteractions.correct(r.entry.id, { outcome: 'neutral' });
ok(corrected.ok, 'an interaction can be corrected');
eq('the original still says what it said', CrmLog.get(r.entry.id).outcome, 'positive');
eq('and the current view shows the correction',
   CrmInteractions.currentFor('p4').filter(function (e) {
       return e.supersedes === r.entry.id; })[0].outcome, 'neutral');
eq('the superseded entry drops out of the current view',
   CrmInteractions.currentFor('p4').filter(function (e) { return e.id === r.entry.id; }).length, 0);

/* A promise with no date never resurfaces, so it is refused. */
var noDate = CrmInteractions.log('p4', { type: 'call', next_action: 'Send the gas spec' });
ok(noDate.ok === false, 'a next action with no due date is refused', JSON.stringify(noDate));

// ---- Logging a promise creates the follow-up ---------------------------------
fresh();
SiteData.add(SiteData.normalize({ id: 'p5', stage: 'contacted' }));
var due = CrmFollowups.today(Date.now() + 2 * DAY);
CrmInteractions.log('p5', {
    type: 'call', summary: 'They want the spec', next_action: 'Send the gas spec', next_action_due: due
});
var next = CrmFollowups.nextFor('p5');
ok(next !== null, 'logging a promise creates the follow-up',
   'the point of writing it down is that the day arrives and tells you');
eq('with what was promised', next.description, 'Send the gas spec');
eq('on the day it was promised for', next.due_date, due);
ok(next.created_from, 'and it remembers which call produced it');

eq('it is not overdue yet', CrmFollowups.overdue().length, 0);
eq('but it is once the day passes', CrmFollowups.overdue(Date.now() + 3 * DAY).length, 1);
eq('and it counts how late', CrmFollowups.daysOverdue(next, Date.now() + 3 * DAY), 1);

CrmFollowups.done(next.id);
eq('a completed follow-up stops being overdue',
   CrmFollowups.overdue(Date.now() + 30 * DAY).length, 0);

// ---- Going stale ---------------------------------------------------------------
fresh();
SiteData.add(SiteData.normalize({ id: 'p6', stage: 'contacted' }));
CrmInteractions.log('p6', { type: 'email',
    occurred_at: new Date(Date.now() - 20 * DAY).toISOString() });
eq('contacted allows a fortnight, and twenty days is past it',
   CrmInteractions.isStale('p6', 'contacted'), true);
eq('the same silence in an inactive stage is not staleness',
   CrmInteractions.isStale('p6', 'unreviewed'), false);

fresh();
SiteData.add(SiteData.normalize({ id: 'p7', stage: 'contacted' }));
/* Never contacted is a different problem with a different fix. Folding it in
   would bury the ones needing a first call under the ones needing a second. */
eq('a prospect never contacted is not "gone quiet"',
   CrmInteractions.isStale('p7', 'contacted'), false);

console.log(fail ? '\n  ' + fail + ' FAILED' : '\n  ALL PASS — ' + pass + ' assertions');
process.exit(fail ? 1 : 0);
