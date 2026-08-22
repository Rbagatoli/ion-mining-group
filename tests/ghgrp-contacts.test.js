// Tests for data/ghgrp-contacts.json and ghgrp-contacts.js.
//
// Against the REAL artifacts, both of them, because the entire value of this index is that the
// join is true of the actual data. A fixture would only prove the lookup agrees with itself,
// which is precisely the failure mode that matters here: a join that silently reaches nothing
// still renders a perfectly calm panel with no counterparty in it.

var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
var GhgrpContacts = require(path.join(ROOT, 'ghgrp-contacts.js'));

var pass = 0, fail = 0;
function eq(label, actual, expected) {
    if (actual === expected) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + '\n        expected ' + JSON.stringify(expected) +
                               '\n        actual   ' + JSON.stringify(actual)); }
}
function ok(label, cond, note) { eq(label + (note ? '  (' + note + ')' : ''), !!cond, true); }

var IDX = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'ghgrp-contacts.json'), 'utf8'));
var LF = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'landfills.json'), 'utf8')).projects;
var F = IDX.facilities;

// ---- 1. the join reaches the sites that matter -------------------------------------------------

console.log('\n=== the join is exact, and it lands ===');
(function() {
    var withId = LF.filter(function(p) { return p.ghgrpId; });
    var joined = withId.filter(function(p) { return F[String(p.ghgrpId)]; });
    ok('essentially every landfill carrying a GHGRP id resolves',
       joined.length >= withId.length - 5,
       joined.length + ' of ' + withId.length);

    // The population that actually gets pursued: built, idle, generator still standing.
    var targets = LF.filter(function(p) {
        return (p.ratedMw || p.actualMw) && /shutdown/i.test(String(p.projectStatus || ''));
    });
    var hit = targets.filter(function(p) { return p.ghgrpId && F[String(p.ghgrpId)]; });
    var addressed = hit.filter(function(p) { return F[String(p.ghgrpId)].address; });
    ok('and it reaches the shutdown projects with a generator standing',
       hit.length >= 400, hit.length + ' of ' + targets.length);
    ok('with a real street address on almost all of them',
       addressed.length >= 390, addressed.length + ' mailable');

    // Every id on both sides is an integer. This is what makes it a key join rather than the
    // name matching this repo bans outright.
    ok('every key is an integer, so no name can have crept in',
       Object.keys(F).every(function(k) { return /^[0-9]+$/.test(k); }));
    ok('and so is every LMOP ghgrpId',
       withId.every(function(p) { return /^[0-9]+$/.test(String(p.ghgrpId)); }));
})();

// ---- 2. what the record carries ---------------------------------------------------------------

console.log('\n=== the record names a legal entity ===');
(function() {
    var ids = Object.keys(F);
    var parent = ids.filter(function(k) { return F[k].parent; }).length;
    eq('every facility names a parent company', parent, ids.length);
    ok('nearly all carry an FRS id, which is the way into ECHO',
       ids.filter(function(k) { return F[k].frsId; }).length >= ids.length - 20);

    // The point of the file: GHGRP's parent is more specific than LMOP's owner string.
    var better = 0;
    LF.forEach(function(p) {
        var g = p.ghgrpId && F[String(p.ghgrpId)];
        if (g && g.parent && p.owner && g.parent.length > p.owner.length) better++;
    });
    ok('and it is frequently more specific than the LMOP owner string', better > 300,
       better + ' rows where the legal entity is named more fully');

    // Never a phone, an email or a person. Asserted so a future rebuild cannot quietly start
    // shipping personal data the UI would then display.
    var leaked = ids.filter(function(k) {
        return Object.keys(F[k]).some(function(f) { return /phone|email|contact|person|fax/i.test(f); });
    });
    eq('no phone, email or named individual is present', leaked.length, 0);
})();

// ---- 3. the accessor ---------------------------------------------------------------------------

console.log('\n=== the lookup refuses what it should ===');
(function() {
    // Not loaded yet: get() must return null rather than throwing, because the page renders
    // before the fetch resolves.
    eq('returns null before load, rather than throwing', GhgrpContacts.get('1004465'), null);
    eq('and forCandidate does too', GhgrpContacts.forCandidate({ sourceDetail: { ghgrpId: '1004465' } }), null);
    eq('null id is null, not a crash', GhgrpContacts.get(null), null);

    // addressLine is pure, so it is testable without the fetch.
    eq('an address with no street is refused, not half-built',
       GhgrpContacts.addressLine({ city: 'Tucson', state: 'AZ', zip: '85715' }), null);
    eq('a complete one joins in postal order',
       GhgrpContacts.addressLine({ address: '6000 Asbury Ave', city: 'Tinton Falls', state: 'NJ', zip: '07753' }),
       '6000 Asbury Ave, Tinton Falls, NJ, 07753');
    eq('and address2 is included when the filing has one',
       GhgrpContacts.addressLine({ address: 'PO Box 12', address2: 'Suite 4', city: 'Reno', state: 'NV', zip: '89501' }),
       'PO Box 12, Suite 4, Reno, NV, 89501');
    eq('and a null record is null', GhgrpContacts.addressLine(null), null);
})();

// ---- 4. the artifact says what it is and is not ------------------------------------------------

console.log('\n=== the artifact states its own limits ===');
(function() {
    ok('it records the licence', /public domain/i.test(IDX.licence || ''));
    ok('it states that the join is exact and not by name',
       /exact/i.test(IDX.joinKey || '') && /name/i.test(IDX.joinKey || ''));
    ok('it warns that the address is the site, not a head office',
       /head office/i.test(IDX.addressNote || ''));
    ok('and that no phone or person is published',
       /no telephone|no phone/i.test(IDX.contactNote || '') || /named individual/i.test(IDX.contactNote || ''));
    ok('coverage is recorded against the real landfill artifact',
       IDX.counts && IDX.counts.coverage && IDX.counts.coverage.joined > 1700);
})();

console.log('');
console.log(fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                       : pass + ' passed, ' + fail + ' FAILED');
process.exit(fail === 0 ? 0 : 1);
