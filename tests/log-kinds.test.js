// Every registered log kind must be writable and renderable.
//
// CrmLog.append() fails CLOSED: an unregistered kind returns { ok:false } and writes nothing. A
// caller that ignores the return sees an event that simply never happened — which for a waiver
// means a hard block was stepped around and the record of who decided that does not exist.
//
// The renderer has the mirror-image failure. prospect-detail.js used to branch on 'stage' and
// 'note' and let everything else fall through to the interaction row, so a new kind rendered as
// an interaction with a wrong label, "nobody named" and "no summary" — three absences describing
// a record that is not missing anything. That is the exact bug the note branch was added to fix,
// and it was waiting to happen to whoever registered the next kind.
//
// So the two lists have to agree, and this asserts that they do.

var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');

var pass = 0, fail = 0;
function ok(label, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + (detail === undefined ? '' : '\n        ' + detail)); }
}
function eq(label, a, b) { ok(label, a === b, 'got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); }

var _store = {};
global.localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null; },
    setItem: function (k, v) { _store[k] = String(v); },
    removeItem: function (k) { delete _store[k]; },
    key: function (i) { return Object.keys(_store)[i] || null; }
};
Object.defineProperty(global.localStorage, 'length', { get: function () { return Object.keys(_store).length; } });

var CrmLog = require(path.join(ROOT, 'crm-log.js'));

console.log('\n=== every kind the workspace writes is registered ===');
['gate', 'waiver', 'score', 'change_order', 'payment'].forEach(function (k) {
    ok(k + ' is a registered kind', CrmLog.KINDS.indexOf(k) >= 0);
});
ok('the original three are still there',
   ['stage', 'interaction', 'note'].every(function (k) { return CrmLog.KINDS.indexOf(k) >= 0; }));

console.log('\n=== append accepts them, and still refuses an unregistered one ===');
CrmLog.reset(); _store = {};
CrmLog.KINDS.forEach(function (k) {
    var r = CrmLog.append(k, 'p1', { body: 'x' });
    ok('append accepts ' + k, r.ok === true, r.err);
});
var bad = CrmLog.append('invented_kind', 'p1', {});
eq('an unregistered kind is still refused', bad.ok, false);
/* The property that makes registration load-bearing: it fails silently unless the caller looks.
   project-model.js checks the return for exactly this reason. */
ok('and it says which kind', /invented_kind/.test(bad.err), bad.err);
eq('and wrote nothing', CrmLog.forProspect('p1', 'invented_kind').length, 0);

console.log('\n=== the renderer has a branch for every kind ===');
/* Read as source rather than executed: prospect-detail.js needs a DOM. What is asserted is that
   no registered kind can reach the interaction branch by falling through. */
var SRC = fs.readFileSync(path.join(ROOT, 'prospect-detail.js'), 'utf8');
var body = SRC.slice(SRC.indexOf('function entryRow('));
body = body.slice(0, body.indexOf('\n    function '));

var unhandled = CrmLog.KINDS.filter(function (k) {
    if (k === 'interaction') return false;          // the interaction branch IS its branch
    return body.indexOf("e.kind === '" + k + "'") < 0;
});
ok('no registered kind is left to the fallthrough', unhandled.length === 0,
   'unhandled: ' + unhandled.join(', '));

/* The durable half. Even with every current kind branched, the NEXT one added would fall through
   again unless the fallthrough itself refuses anything that is not an interaction. */
ok('and the fallthrough is guarded, not open',
   /e\.kind !== 'interaction'/.test(body),
   'entryRow still ends in an unguarded interaction row');

console.log('\n=== a gate move is logged as a gate, not as a note ===');
/* project-model.js logged promotion as kind 'note' with a prose body while 'gate' did not exist.
   A timeline that has to be read to find out a project started is not an audit trail. */
var PM = fs.readFileSync(path.join(ROOT, 'project-model.js'), 'utf8');
ok('promotion logs a gate event', /CrmLog\.append\('gate'/.test(PM));
ok('and nothing in the project model logs a note any more', !/CrmLog\.append\('note'/.test(PM));
ok('the return is checked rather than assumed', /logged && logged\.ok/.test(PM));

console.log('\n=== the payload cannot forge its position, for the new kinds too ===');
CrmLog.reset(); _store = {};
CrmLog.append('gate', 'p2', { to: 'diligence' });
var forged = CrmLog.append('waiver', 'p2', { deliverable: 'gas analysis', seq: -1 });
ok('a waiver cannot set seq', forged.entry.seq > 0, 'seq ' + forged.entry.seq);
var order = CrmLog.forProspect('p2');
eq('and newest-first still holds across kinds', order[0].kind, 'waiver');

console.log('\n' + (fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                               : pass + ' passed, ' + fail + ' FAILED'));
process.exit(fail === 0 ? 0 : 1);
