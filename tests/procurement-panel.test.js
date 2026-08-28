/* The procurement panel.
 *
 * The panel makes no decisions — procurement.js does, and has its own tests. What can go wrong
 * here is a state the model can produce that the renderer has no branch for. log-kinds.test.js
 * was written for exactly that failure on the other side of this file: prospect-detail.js used
 * to branch on 'stage' and 'note' and let every other log kind fall through to the interaction
 * row, so a newly registered kind rendered as the wrong thing and nothing failed.
 *
 * A procurement state that falls through is worse than a log kind that does, because the
 * states carry urgency: an item silently rendered as though it were on schedule is the
 * confident-wrong-number failure again, one layer up from the arithmetic.
 *
 * Read as source rather than executed, the way log-kinds.test.js reads it: the renderer needs
 * a DOM and the property under test is structural.
 */
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

global.CrmFollowups = require(path.join(ROOT, 'crm-followups.js'));
var P = require(path.join(ROOT, 'procurement.js'));
var SRC = fs.readFileSync(path.join(ROOT, 'prospect-detail.js'), 'utf8');
var HTML = fs.readFileSync(path.join(ROOT, 'prospecting.html'), 'utf8');

/* The set the renderer must cover: whatever state() can return. Derived from the module rather
   than written out here, so adding a state to procurement.js fails this rather than passing
   against a list that was copied once and never revisited. */
function statesTheModelCanProduce() {
    var seen = {};
    var proj = { id: 'p', target_energization: '2027-07-01' };
    var NOW = Date.parse('2026-08-28T00:00:00Z');
    var cases = [
        { lead_time_weeks: 200 },                            // late
        { lead_time_weeks: 44 },                             // due_soon / scheduled
        { lead_time_weeks: 1 },                              // scheduled
        { lead_time_weeks: null },                           // unknown
        { lead_time_weeks: 44, status: 'ordered' },
        { lead_time_weeks: 44, status: 'delivered' },
        { lead_time_weeks: 44, status: 'cancelled' },
        { lead_time_weeks: 200, permit_required: true }       // blocked
    ];
    global.ProjectGates = { permitIssued: function () { return false; } };
    cases.forEach(function (c) { seen[P.state(c, proj, NOW)] = true; });
    /* due_soon needs a date close to the order date; find one by construction. */
    for (var w = 1; w <= 100; w++) seen[P.state({ lead_time_weeks: w }, proj, NOW)] = true;
    delete global.ProjectGates;
    return Object.keys(seen).sort();
}

console.log('\n=== the renderer has a branch for every state the model can produce ===');
var states = statesTheModelCanProduce();
ok('the model produces the states this asserts about', states.length >= 7, states.join(', '));
/* PROC_STATE is the label map; a state missing from it renders its raw key, which is a
   lowercase identifier appearing in the operator's face. */
var LABELS = SRC.slice(SRC.indexOf('var PROC_STATE'), SRC.indexOf('var PROC_TONE'));
states.forEach(function (s) {
    ok('PROC_STATE has a label for "' + s + '"',
       new RegExp('(^|[^a-z_])' + s + '\\s*:').test(LABELS));
});

console.log('\n=== the counts are three sentences, not one total ===');
/* The load-bearing distinction: unknown is neither late nor on schedule. If the head ever
   reports a single number, an item nobody can date disappears into it. */
var BLOCK = SRC.slice(SRC.indexOf('function procurementBlock'),
                      SRC.indexOf('function procurementSection'));
ok('the head reports the late count', /s\.late/.test(BLOCK));
ok('and the blocked count separately', /s\.blocked/.test(BLOCK));
ok('and the undatable count separately', /s\.unknown/.test(BLOCK));
ok('unknown is not folded into late',
   !/s\.late\s*\+\s*s\.unknown|s\.unknown\s*\+\s*s\.late/.test(BLOCK));
ok('an undatable item is called out rather than shown quietly',
   /s\.unknown[\s\S]{0,160}pd-warn/.test(BLOCK));

console.log('\n=== a missing input says which one is missing ===');
/* "Unknown" tells an operator nothing they can act on. A missing lead time is chased from the
   vendor; a missing energisation date is set on the project. Different fixes, different lines. */
var WHEN = SRC.slice(SRC.indexOf('function procWhen'), SRC.indexOf('function procRow'));
ok('a missing lead time says so', /no lead time/.test(WHEN));
ok('a missing need-by says so', /no date to work back from/.test(WHEN));
ok('and they are distinguished by which input is null',
   /lead_time_weeks === null/.test(WHEN));

console.log('\n=== the panel only exists once there is a project ===');
var SEC = SRC.slice(SRC.indexOf('function procurementSection'),
                    SRC.indexOf('function render('));
ok('an unpromoted prospect gets no procurement section', /if \(!p\) return '';/.test(SEC));
ok('and the section is rendered from the project, not the prospect',
   /ProjectData\.liveFor\(rec\.id\)/.test(SEC));
ok('it is wired into the detail view', /procurementSection\(rec\)/.test(SRC));

console.log('\n=== the module the panel needs is actually on the page ===');
/* THE GUARD THAT MAKES A MISSING MODULE SAFE ALSO MAKES IT SILENT.
 *
 * procurementBlock() opens with `typeof ProjectProcurement === 'undefined' -> return ''`, which
 * is the right behaviour and is why the first render of this panel showed nothing at all: the
 * script tag was never added, every assertion above still passed, and the feature was inert on
 * a page that looked fine. Asserting the call site is not asserting the module.
 *
 * LOAD ORDER IS DELIBERATELY NOT ASSERTED. The first version of this checked that
 * procurement.js came after crm-followups.js and project-gates.js, and it failed immediately --
 * but on inspection the reason given for it was false. procurement.js touches neither module at
 * load: both are reached from inside functions that only run during a render, by which point
 * every script on the page has executed. An ordering assertion here would fail on a harmless
 * reshuffle while proving nothing, which is the decorative-guard shape. What was actually
 * missing, and what is asserted, is the tag. */
ok('prospecting.html loads procurement.js', HTML.indexOf('./procurement.js') >= 0);
ok('and it is the only page that renders the panel',
   fs.readdirSync(ROOT).filter(function (f) {
       return /\.html$/.test(f) &&
              fs.readFileSync(path.join(ROOT, f), 'utf8').indexOf('prospect-detail.js') >= 0 &&
              fs.readFileSync(path.join(ROOT, f), 'utf8').indexOf('./procurement.js') < 0;
   }).length === 0);

console.log('\n=== every class the renderer emits is styled ===');
/* A class with no rule renders as unstyled text in the middle of a styled panel — visible, and
   exactly the kind of thing that survives review because nothing fails. */
var emitted = {};
/* No closing quote in the pattern: the row class is built by concatenation -
   class="pd-proc-row' + tone + '" - so a pattern anchored on the closing quote silently
   skipped the one class that carries the layout, and reported green for it. */
var re = /class="(pd-proc[a-z0-9 -]*)/g, m;
while ((m = re.exec(SRC)) !== null) {
    m[1].split(/\s+/).forEach(function (c) { if (c) emitted[c] = true; });
}
/* The tone suffixes never appear as literals at all, so they are named. */
['pd-proc-warn', 'pd-proc-note'].forEach(function (c) { emitted[c] = true; });
var names = Object.keys(emitted).sort();
ok('the renderer emits the classes this checks', names.length >= 5, names.join(', '));
names.forEach(function (c) {
    ok('"' + c + '" has a style rule', HTML.indexOf('.' + c) >= 0);
});

console.log('\n=== the tone map only marks what is actionable ===');
var TONE = SRC.slice(SRC.indexOf('var PROC_TONE'), SRC.indexOf('function procWhen'));
['ordered', 'delivered', 'cancelled', 'scheduled'].forEach(function (s) {
    ok('"' + s + '" carries no tone', !new RegExp('(^|[^a-z_])' + s + '\\s*:').test(TONE));
});
['late', 'blocked', 'unknown'].forEach(function (s) {
    ok('"' + s + '" does', new RegExp('(^|[^a-z_])' + s + '\\s*:').test(TONE));
});

console.log('');
console.log(fail ? '  ' + fail + ' FAILED, ' + pass + ' passed' : '  all ' + pass + ' passed');
process.exitCode = fail ? 1 : 0;
