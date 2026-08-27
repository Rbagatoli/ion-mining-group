/* The contacts screen.
 *
 * Three things are true of the contact store and invisible everywhere else in
 * the app, and this screen exists to show them. They are what is tested here:
 *
 *   A contact linked to nothing appears on no prospect page and can only be
 *   found by somebody who already knows it is there.
 *   A link to a deleted prospect outlives the prospect.
 *   A phone number checked two years ago looks exactly like one checked today.
 *
 * Plus the rule that makes the flags usable: a count must not change when you
 * filter by it.
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
var CrmContacts = require(ROOT + '/crm-contacts.js');
global.SiteData = SiteData; global.CrmConfig = CrmConfig; global.CrmContacts = CrmContacts;
var V = require(ROOT + '/prospect-contacts.js');

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
    CrmConfig.reset(); CrmContacts.reset();
    SiteData.registerStages(SiteData.DEFAULT_STAGES);
    CrmConfig.publish();
}
function rowFor(d, name) {
    for (var i = 0; i < d.rows.length; i++) if (d.rows[i].contact.name === name) return d.rows[i];
    return null;
}

var DAY = 86400000;
var NOW = Date.parse('2026-08-25T12:00:00.000Z');
function ago(days) { return new Date(NOW - days * DAY).toISOString(); }

// ---- Reachability is four states, not a checkbox --------------------------------
/* "Email only" and "phone only" are different problems. One is a message into a
   void; the other is the only thing that works for an office that does not read
   email. */
eq('both is both', V.reachOf({ email: 'a@b.c', phone: '555' }), 'both');
eq('email alone', V.reachOf({ email: 'a@b.c', phone: '' }), 'email');
eq('phone alone', V.reachOf({ email: '', phone: '555' }), 'phone');
eq('neither is unreachable', V.reachOf({ email: '', phone: '' }), 'none');
eq('whitespace is not a phone number', V.reachOf({ email: '', phone: '   ' }), 'none');

// ---- What the screen is for -----------------------------------------------------
fresh();
SiteData.add(SiteData.normalize({ id: 'p1', name: 'Cell 4 landfill', stage: 'contacted' }));
SiteData.add(SiteData.normalize({ id: 'p2', name: 'Wellpad 7', stage: 'researching' }));

CrmContacts.add({ name: 'Reachable Rita', email: 'rita@county.gov', phone: '403-555-0100',
                  role: 'decision_maker', last_verified: ago(10), linked_prospects: ['p1', 'p2'] });
CrmContacts.add({ name: 'Unreachable Ug', role: 'operations', linked_prospects: ['p1'],
                  last_verified: ago(5) });
CrmContacts.add({ name: 'Orphan Olive', email: 'olive@nowhere.com', last_verified: ago(2) });
CrmContacts.add({ name: 'Stale Stan', phone: '403-555-0199', last_verified: ago(500),
                  linked_prospects: ['p2'] });
CrmContacts.add({ name: 'Unchecked Una', phone: '403-555-0111', linked_prospects: ['p1'] });

var d = V.build({}, NOW);
eq('everyone is listed', d.counts.total, 5);
eq('one has no way to reach them', d.counts.unreachable, 1);
eq('one is linked to nothing', d.counts.orphans, 1);
eq('one has decayed past the threshold', d.counts.stale, 1);
/* Never checked is NOT stale. One is unknown and the other has expired, and
   folding them would imply something about a contact nobody ever verified. */
eq('and one was never checked at all', d.counts.neverVerified, 1);
eq('which is not counted as stale', rowFor(d, 'Unchecked Una').stale, false);
eq('nor given an age', rowFor(d, 'Unchecked Una').verifiedDays, null);
eq('a checked one carries its age in days', rowFor(d, 'Reachable Rita').verifiedDays, 10);

// ---- A link outlives the prospect ------------------------------------------------
/* The contact store has no reason to know a prospect was deleted, so the link
   survives it. Filtered out, it is invisible and can never be cleaned up. */
SiteData.remove('p2');   // return deliberately ignored: this line exists to orphan a link
CrmContacts.reset();
d = V.build({}, NOW);
var rita = rowFor(d, 'Reachable Rita');
eq('the dead link is still on the record', rita.links.length, 2);
eq('and is marked as gone', rita.links[1].exists, false);
eq('the live one is not', rita.links[0].exists, true);
eq('and it is counted', d.counts.dangling, 2);

// ---- A count must not change when you filter by it -------------------------------
/* Otherwise the flag that says "1 with no way to reach them" says something else
   the moment you click it, and nobody trusts either number again. */
fresh();
SiteData.add(SiteData.normalize({ id: 'p1', name: 'Cell 4', stage: 'contacted' }));
CrmContacts.add({ name: 'A', email: 'a@b.c', linked_prospects: ['p1'], last_verified: ago(1) });
CrmContacts.add({ name: 'B', linked_prospects: ['p1'], last_verified: ago(1) });
CrmContacts.add({ name: 'C', linked_prospects: ['p1'], last_verified: ago(1) });

var all = V.build({}, NOW);
var filtered = V.build({ filter: 'unreachable' }, NOW);
eq('three contacts either way', filtered.counts.total, all.counts.total);
eq('and the flag still says two', filtered.counts.unreachable, all.counts.unreachable);
eq('but only two rows come back', filtered.rows.length, 2);
eq('and they are the right two', filtered.rows[0].contact.name + filtered.rows[1].contact.name, 'BC');

// ---- Sorting ---------------------------------------------------------------------
fresh();
SiteData.add(SiteData.normalize({ id: 'p1', name: 'One', stage: 'contacted' }));
SiteData.add(SiteData.normalize({ id: 'p2', name: 'Two', stage: 'contacted' }));
CrmContacts.add({ name: 'Zoe', email: 'z@x.c', phone: '1', last_verified: ago(3),
                  linked_prospects: ['p1'] });
CrmContacts.add({ name: 'Adam', last_verified: ago(400), linked_prospects: ['p1', 'p2'] });
CrmContacts.add({ name: 'Mo', phone: '2' });

eq('by name is alphabetical', V.build({ sort: 'name' }, NOW).rows[0].contact.name, 'Adam');
eq('by reach puts the reachable first', V.build({ sort: 'reach' }, NOW).rows[0].contact.name, 'Zoe');
eq('and the unreachable last', V.build({ sort: 'reach' }, NOW).rows[2].contact.name, 'Adam');
eq('by links puts the busiest first', V.build({ sort: 'linked' }, NOW).rows[0].contact.name, 'Adam');
/* Never checked sorts above everything, because it is the one you know least
   about -- not below, which is where a plain numeric sort would put a null. */
eq('by checked puts the never-checked first',
   V.build({ sort: 'verified' }, NOW).rows[0].contact.name, 'Mo');
eq('then the stalest', V.build({ sort: 'verified' }, NOW).rows[1].contact.name, 'Adam');

// ---- Search ----------------------------------------------------------------------
fresh();
SiteData.add(SiteData.normalize({ id: 'p1', name: 'Rimbey flare', stage: 'contacted' }));
CrmContacts.add({ name: 'Dave Mercer', organization: 'Ironbark Energy',
                  email: 'dave@ironbark.ca', linked_prospects: ['p1'] });
CrmContacts.add({ name: 'Sue Chen', organization: 'County of Ponoka' });

eq('by name', V.build({ q: 'mercer' }, NOW).rows.length, 1);
eq('case does not matter', V.build({ q: 'MERCER' }, NOW).rows.length, 1);
eq('by organisation', V.build({ q: 'ponoka' }, NOW).rows.length, 1);
eq('by email', V.build({ q: 'ironbark.ca' }, NOW).rows.length, 1);
/* Searching the site name finds the person who covers it, which is how you
   actually look somebody up: you remember the landfill, not the surname. */
eq('and by the prospect they are linked to', V.build({ q: 'rimbey' }, NOW).rows.length, 1);
eq('a miss is a miss', V.build({ q: 'nobody' }, NOW).rows.length, 0);
eq('but the counts still describe the book', V.build({ q: 'nobody' }, NOW).counts.total, 2);

// ---- The threshold is configurable because it is a guess --------------------------
fresh();
CrmContacts.add({ name: 'Six months ago', phone: '1', last_verified: ago(200) });
eq('a year is the default', V.build({}, NOW).verifyDays, 365);
eq('and 200 days has not expired under it', V.build({}, NOW).counts.stale, 0);
CrmConfig.setSetting('contactVerifyDays', 90);
CrmConfig.reset();
eq('tighten it and the same contact has', V.build({}, NOW).counts.stale, 1);
eq('with the new threshold reported', V.build({}, NOW).verifyDays, 90);

// ---- Nothing there ----------------------------------------------------------------
fresh();
var none = V.build({}, NOW);
eq('an empty book has no rows', none.rows.length, 0);
eq('and nothing to flag', none.counts.unreachable, 0);
eq('nor anything dangling', none.counts.dangling, 0);

console.log(fail ? '\n  ' + fail + ' FAILED' : '\n  ALL PASS — ' + pass + ' assertions');
process.exit(fail ? 1 : 0);
