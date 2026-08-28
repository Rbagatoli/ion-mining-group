/* The document register.
 *
 * Two things are worth testing hard here and the rest is bookkeeping.
 *
 * THE LINK SCHEME. A document link is typed by a person and later rendered into
 * an href on a page that also holds the fleet, the wallet and the banking data.
 * `javascript:` in an href is script execution in that origin. The filter has to
 * hold for the obvious attack and for the ones that do not look like one.
 *
 * WHAT IS ALLOWED TO BE UNKNOWN. The register is only useful if it contains
 * every document, and it will only contain every document if recording one
 * never requires a field the operator does not have at that moment.
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

var CrmConfig = require(ROOT + '/crm-config.js');
global.CrmConfig = CrmConfig;
var CrmDocuments = require(ROOT + '/crm-documents.js');

var pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { pass++; console.log('  ok    ' + label); return; }
    fail++;
    console.log('  FAIL  ' + label + (detail ? '   ' + detail : ''));
}
function eq(label, got, want) {
    ok(got === want, label, 'got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want));
}
function fresh() { _store = {}; CrmConfig.reset(); CrmDocuments.reset(); }

/* BACK-DATE A FILED DOCUMENT, so an ordering assertion tests ordering.
 *
 * add() stamps added_at from the clock and takes no override, and three adds in a row land
 * inside the same millisecond most of the time. forProspect()'s comparator only reaches its
 * PRIMARY branch when added_at differs -- otherwise the seq tie-break alone decides, and the two
 * happen to agree. Measured: with the primary comparator inverted to oldest-first, the 'newest
 * first' assertion below failed 1 run in 10. A guard that fires on a coin flip is not a guard,
 * and the fix is fixture-shaped rather than assertion-shaped. */
function backdate(prospectId, title, iso) {
    var raw = JSON.parse(_store[CrmDocuments.KEY]);
    for (var i = 0; i < raw.items.length; i++) {
        if (raw.items[i].prospect_id === String(prospectId) && raw.items[i].title === title) {
            raw.items[i].added_at = iso;
        }
    }
    _store[CrmDocuments.KEY] = JSON.stringify(raw);
    CrmDocuments.reset();
}

// ---- The link filter -----------------------------------------------------------
fresh();
var L = CrmDocuments.linkFor;

eq('a plain https link is a link', L('https://example.com/nda.pdf').safe, true);
eq('and keeps its href', L('https://example.com/nda.pdf').href, 'https://example.com/nda.pdf');
eq('http too', L('http://example.com/x').safe, true);
eq('a mailto is a link', L('mailto:landfill@county.gov').safe, true);
/* The most likely answer for a scanned signature page is a path on this laptop. */
eq('a file url is a link', L('file:///C:/deals/nda.pdf').safe, true);

/* The one that matters. */
eq('javascript: is not a link', L('javascript:alert(document.cookie)').safe, false);
eq('and is not silently discarded either', L('javascript:alert(1)').text, 'javascript:alert(1)');
eq('nor does it leak into an href', L('javascript:alert(1)').href, null);
/* URL lowercases the scheme, so case games do not get past it. Asserted rather
   than assumed, because the whole filter rests on that being true. */
eq('case does not help', L('JaVaScRiPt:alert(1)').safe, false);
eq('data: is not a link', L('data:text/html;base64,PHNjcmlwdD4=').safe, false);
eq('vbscript: is not a link', L('vbscript:msgbox(1)').safe, false);
/* A tab inside the scheme is the classic filter bypass -- the parser strips it,
   so a naive string check on the prefix would pass something the browser then
   executes. This defers to URL for exactly that reason. */
eq('and neither is a scheme with whitespace in it', L('java\tscript:alert(1)').safe, false);

/* Somebody pasting a URL out of the address bar does not always bring the
   scheme, and refusing that would train them to stop pasting. */
eq('a bare host is assumed to be https', L('drive.google.com/file/d/abc').href,
   'https://drive.google.com/file/d/abc');
eq('with the typed text kept as typed', L('drive.google.com/file/d/abc').text,
   'drive.google.com/file/d/abc');

/* A bare Windows path parses as scheme "c:", which is not one of ours, so it
   stays text. That is the right answer -- a browser cannot open it anyway -- and
   the point of the assertion is that it is not mangled into https://C:/... */
var win = L('C:\\deals\\ironbark\\nda.pdf');
eq('a windows path is not turned into a web link', win.safe, false);
eq('and survives verbatim', win.text, 'C:\\deals\\ironbark\\nda.pdf');

eq('nothing typed is not a link', L('').href, null);
eq('and neither is nothing at all', L(null).text, null);

// ---- What a document is allowed not to know ------------------------------------
fresh();
var r = CrmDocuments.add('p1', { title: 'Signed NDA' });
ok(r.ok, 'a title and a prospect is enough', r.err);
eq('with no kind', r.item.kind, null);
eq('no link', r.item.url, null);
eq('and no date', r.item.signed_on, null);
ok(!!r.item.added_at, 'but it knows when it was recorded');

/* The sentence-instead-of-a-URL case, which is most of them. */
r = CrmDocuments.add('p1', { title: 'Gas analysis', kind: 'gas_analysis',
                             where: 'Emailed by Dave, March, subject "Ironbark specs"' });
ok(r.ok, 'a document can live somewhere that is not a URL', r.err);
eq('and says where', r.item.where, 'Emailed by Dave, March, subject "Ironbark specs"');

eq('a document needs a prospect', CrmDocuments.add(null, { title: 'x' }).ok, false);
eq('and a title', CrmDocuments.add('p1', { url: 'https://x.com' }).ok, false);
eq('whitespace is not a title', CrmDocuments.add('p1', { title: '   ' }).ok, false);

/* An unconfigured kind is refused rather than stored, because the summary and
   the coverage list both group by it and a typo would file the document
   somewhere neither of them looks. */
var bad = CrmDocuments.add('p1', { title: 'x', kind: 'nda_v2' });
eq('an unknown kind is refused', bad.ok, false);
ok(/nda_v2/.test(bad.err || ''), 'and says which one', bad.err);

// ---- Editing and removing -------------------------------------------------------
fresh();
var doc = CrmDocuments.add('p1', { title: 'Draft term sheet', kind: 'term_sheet' }).item;
eq('nothing has been edited yet', doc.updated_at, null);
var up = CrmDocuments.update(doc.id, { title: 'Executed term sheet', signed_on: '2026-03-14' });
ok(up.ok, 'a document can be corrected', up.err);
eq('the title changed', CrmDocuments.get(doc.id).title, 'Executed term sheet');
eq('the date landed', CrmDocuments.get(doc.id).signed_on, '2026-03-14');
ok(!!CrmDocuments.get(doc.id).updated_at, 'and the edit is dated');
eq('the kind was left alone', CrmDocuments.get(doc.id).kind, 'term_sheet');

eq('a title cannot be edited away', CrmDocuments.update(doc.id, { title: '' }).ok, false);
eq('and it still stands', CrmDocuments.get(doc.id).title, 'Executed term sheet');
eq('nor can the kind become a typo', CrmDocuments.update(doc.id, { kind: 'oops' }).ok, false);
/* Clearing a field is different from failing to set one, and null is how you
   say "actually there is no link". */
ok(CrmDocuments.update(doc.id, { url: null }).ok, 'a link can be cleared');
eq('and is cleared', CrmDocuments.get(doc.id).url, null);

eq('a document that does not exist cannot be edited',
   CrmDocuments.update('d_nope', { title: 'x' }).ok, false);

ok(CrmDocuments.remove(doc.id).ok, 'a document can be removed');
eq('and is gone', CrmDocuments.get(doc.id), null);
eq('removing it twice fails rather than pretending', CrmDocuments.remove(doc.id).ok, false);

// ---- Whose documents are whose --------------------------------------------------
fresh();
CrmDocuments.add('a', { title: 'A one', kind: 'nda' });
CrmDocuments.add('b', { title: 'B one', kind: 'nda' });
CrmDocuments.add('a', { title: 'A two', kind: 'gas_analysis' });
eq('two on a', CrmDocuments.countFor('a'), 2);
eq('one on b', CrmDocuments.countFor('b'), 1);
eq('none on a stranger', CrmDocuments.countFor('c'), 0);
/* Newest first: the one added this morning is the one being looked for.
   Back-dated seven months apart so the added_at comparator is what decides, not the seq
   tie-break that shadowed it. Deliberately back-dated AGAINST the insertion order too -- 'A two'
   was added last but is dated EARLIER -- so a comparator that silently fell through to seq would
   now disagree with one that reads the date. */
backdate('a', 'A one', '2026-01-04T09:00:00.000Z');
backdate('a', 'A two', '2026-08-11T09:00:00.000Z');
eq('newest first', CrmDocuments.forProspect('a')[0].title, 'A two');
backdate('a', 'A two', '2025-11-02T09:00:00.000Z');
eq('and it is the DATE that decides, not the order they were entered',
   CrmDocuments.forProspect('a')[0].title, 'A one');
eq('with the older one behind it', CrmDocuments.forProspect('a')[1].title, 'A two');
// Restored, so nothing downstream in this file inherits a doctored fixture.
backdate('a', 'A two', '2026-08-11T09:00:00.000Z');

/* THE TIE-BREAK NEEDS AN ACTUAL TIE, and giving the two documents above distinct dates took it
   away. Both halves of a two-clause comparator have to be exercised or one of them is decoration:
   before this pair existed the date clause was covered by a coin flip and after the back-dating
   the seq clause was covered by nothing. Same millisecond is not a contrivance -- it is what
   two adds in a row actually produce, which is how the date clause went untested in the first
   place. */
CrmDocuments.add('a', { title: 'A three, filed in the same breath', kind: 'permit' });
CrmDocuments.add('a', { title: 'A four, filed in the same breath', kind: 'utility' });
backdate('a', 'A three, filed in the same breath', '2026-09-01T12:00:00.000Z');
backdate('a', 'A four, filed in the same breath', '2026-09-01T12:00:00.000Z');
var tied = CrmDocuments.forProspect('a').filter(function (d) { return /same breath/.test(d.title); });
eq('an exact tie on date falls to the later seq', tied[0].title, 'A four, filed in the same breath');
eq('with the earlier one behind it', tied[1].title, 'A three, filed in the same breath');
ok('and they really are tied on the date', tied[0].added_at === tied[1].added_at,
   tied[0].added_at + ' vs ' + tied[1].added_at);

// ---- Coverage: the absence is the useful half -----------------------------------
var cov = CrmDocuments.coverage('a');
function findKind(rows, k) {
    for (var i = 0; i < rows.length; i++) if (rows[i].key === k) return rows[i];
    return null;
}
eq('every configured kind is listed', cov.length, CrmConfig.documentKinds().length);
eq('the nda is on file', findKind(cov, 'nda').present, true);
eq('the term sheet is not', findKind(cov, 'term_sheet').present, false);

var miss = CrmDocuments.missing('a');
eq('only the expected ones are called missing', miss.length, 0);
var missB = CrmDocuments.missing('b');
eq('b is missing its gas analysis', missB.length, 1);
eq('and that is the one', missB[0].key, 'gas_analysis');
/* A term sheet is not expected -- plenty of deals close without one on file --
   so its absence is not reported as a gap. */
ok(!findKind(missB, 'term_sheet'), 'an unexpected kind is not a gap',
   'a deal can close without one');

// ---- Retiring a kind does not erase what was filed under it ---------------------
fresh();
CrmDocuments.add('p1', { title: 'Old permit', kind: 'permit' });
CrmConfig.setDocumentKinds([{ key: 'nda', label: 'NDA', expected: true }]);
CrmDocuments.reset();
eq('the document is still there', CrmDocuments.countFor('p1'), 1);
eq('and keeps its kind', CrmDocuments.forProspect('p1')[0].kind, 'permit');
eq('which still has a label', CrmConfig.documentKindLabel('permit'), 'permit');
/* It is simply no longer offered, and no longer counted in coverage. */
eq('coverage follows the config', CrmDocuments.coverage('p1').length, 1);

console.log(fail ? '\n  ' + fail + ' FAILED' : '\n  ALL PASS — ' + pass + ' assertions');
process.exit(fail ? 1 : 0);
