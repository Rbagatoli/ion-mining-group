/* absorb(): recording a contact against a site puts them in the contact book.
 *
 * The store exists because one county authority holds three landfills. Typing a
 * number against each of them and stopping there rebuilds the flat-field problem
 * inside the new model — the same person three times, going stale in three
 * places. absorb() is what closes that.
 *
 * The matching rules are the whole risk. Merging two people is worse than
 * holding one twice: the second is untidy, the first loses a name and puts words
 * in somebody's mouth in a call log. A switchboard is shared by a department,
 * which is exactly the case this feature serves and exactly where a naive phone
 * match would collapse that department into a single person.
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

var CrmContacts = require(ROOT + '/crm-contacts.js');

var pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { pass++; console.log('  ok    ' + label); return; }
    fail++;
    console.log('  FAIL  ' + label + (detail ? '   ' + detail : ''));
}
function eq(label, got, want) {
    ok(got === want, label, 'got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want));
}
function fresh() { _store = {}; CrmContacts.reset(); }

// ---- Type it once ---------------------------------------------------------------
fresh();
var r = CrmContacts.absorb('lmop_1', {
    name: 'Dana Reid', phone: '(703) 792-6800', role: 'operations',
    organization: 'Prince William County, Department of Public Works, VA',
    source: 'county switchboard'
});
ok(r.ok, 'a contact recorded against a site is created', r.err);
eq('and created, not matched', r.created, true);
eq('linked to that site', r.contact.linked_prospects.length, 1);
eq('which is the one it was recorded against', r.contact.linked_prospects[0], 'lmop_1');

/* The same authority runs another landfill. This is the case the contact book was
   built for, and typing the person again would defeat it. */
var r2 = CrmContacts.absorb('lmop_2', {
    name: 'Dana Reid', phone: '703-792-6800',
    organization: 'Prince William County, Department of Public Works, VA'
});
eq('the same person at another site is not created again', r2.created, false);
eq('they are linked to the second site instead', r2.linked, true);
eq('so there is still one of them', CrmContacts.list().length, 1);
eq('covering two sites', CrmContacts.get(r.contact.id).linked_prospects.length, 2);

/* Spelling is not identity. These are one telephone. */
fresh();
CrmContacts.absorb('a', { name: 'Dana Reid', phone: '(403) 262-0321' });
CrmContacts.absorb('b', { name: 'Dana Reid', phone: '+1 403 262 0321' });
eq('a differently punctuated number is the same number', CrmContacts.list().length, 1);
CrmContacts.absorb('c', { name: 'Dana Reid', phone: '4032620321' });
eq('and so is a bare one', CrmContacts.list().length, 1);
eq('all three sites hang off them', CrmContacts.list()[0].linked_prospects.length, 3);

// ---- An extension is not enough to match on -------------------------------------
/* Fewer than ten digits could be an extension, a partial, or a typo. Matching on
   it would merge people on the strength of "x4400". */
fresh();
CrmContacts.absorb('a', { name: 'Someone', phone: '4400' });
CrmContacts.absorb('b', { name: 'Someone Else', phone: '4400' });
eq('a short number matches nobody', CrmContacts.list().length, 2);

// ---- A switchboard is not a person ----------------------------------------------
/* THE CASE THAT MATTERS. A county has one number and many people behind it.
   Matching on the number alone would collapse the department into one contact and
   attribute every call to whoever was recorded first. */
fresh();
CrmContacts.absorb('lf1', { name: 'Dana Reid', phone: '(703) 792-6800',
                            organization: 'Prince William County' });
var third = CrmContacts.absorb('lf1', { name: 'Marcus Hale', phone: '(703) 792-6800',
                                        organization: 'Prince William County' });
eq('a second name on the same switchboard is a second person', third.created, true);
eq('so the department holds two', CrmContacts.list().length, 2);

/* Two records with no name and the same number have nothing to tell them apart,
   so they are treated as one rather than accumulating blanks. */
fresh();
CrmContacts.absorb('x', { phone: '(703) 792-6800' });
var anon = CrmContacts.absorb('y', { phone: '703 792 6800' });
eq('two unnamed records on one number are one record', anon.created, false);
eq('and it covers both sites', CrmContacts.list()[0].linked_prospects.length, 2);

// ---- An email is identity ---------------------------------------------------------
fresh();
CrmContacts.absorb('a', { name: 'Dana Reid', email: 'D.Reid@pwcgov.org' });
var byMail = CrmContacts.absorb('b', { name: 'D. Reid', email: 'd.reid@pwcgov.org' });
eq('case does not make a second inbox', byMail.created, false);
eq('one person', CrmContacts.list().length, 1);
/* The name already on file stands. A shorter form typed later is not a
   correction, and overwriting would quietly lose the fuller one. */
eq('and keeps the name already recorded', CrmContacts.list()[0].name, 'Dana Reid');

// ---- Gaps are filled, facts are not overwritten -----------------------------------
fresh();
var base = CrmContacts.absorb('a', { name: 'Dana Reid', email: 'dana@pwcgov.org' }).contact;
eq('no phone yet', base.phone, '');
var filled = CrmContacts.absorb('b', { name: 'Dana Reid', email: 'dana@pwcgov.org',
                                       phone: '(703) 792-6800',
                                       organization: 'Prince William County' });
eq('a later find fills the blank', filled.contact.phone, '(703) 792-6800');
ok(filled.filled.indexOf('phone') >= 0, 'and reports what it filled',
   JSON.stringify(filled.filled));

/* A direct line already on file must not be replaced by a switchboard typed
   against another site. */
var overwrite = CrmContacts.absorb('c', { name: 'Dana Reid', email: 'dana@pwcgov.org',
                                          phone: '(703) 792-0000' });
eq('an existing number is not overwritten', overwrite.contact.phone, '(703) 792-6800');
eq('and nothing was reported as filled', overwrite.filled.length, 0);

/* A role only lands where none was known. */
fresh();
CrmContacts.absorb('a', { name: 'Dana', phone: '(703) 792-6800', role: 'decision_maker' });
var roleTry = CrmContacts.absorb('b', { name: 'Dana', phone: '(703) 792-6800', role: 'gatekeeper' });
eq('a known role stands', roleTry.contact.role, 'decision_maker');

// ---- Refusals ----------------------------------------------------------------------
fresh();
eq('nothing to record is refused', CrmContacts.absorb('a', {}).ok, false);
eq('whitespace is nothing', CrmContacts.absorb('a', { name: '  ' }).ok, false);
eq('and a contact needs a site', CrmContacts.absorb(null, { name: 'Dana' }).ok, false);
eq('none of which created anything', CrmContacts.list().length, 0);

/* Saving the same site twice must not link twice — the link list is what the
   Contacts screen counts. */
fresh();
CrmContacts.absorb('a', { name: 'Dana', phone: '(703) 792-6800' });
var again = CrmContacts.absorb('a', { name: 'Dana', phone: '(703) 792-6800' });
eq('re-saving the same site does not link twice',
   again.contact.linked_prospects.length, 1);
eq('and reports that it linked nothing new', again.linked, false);

console.log(fail ? '\n  ' + fail + ' FAILED' : '\n  ALL PASS — ' + pass + ' assertions');
process.exit(fail ? 1 : 0);
