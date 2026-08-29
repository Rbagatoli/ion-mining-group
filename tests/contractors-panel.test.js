/* The contractors panel.
 *
 * The panel decides nothing — project-contractors.js does, and has its own tests. What can go
 * wrong here is a state the model can produce that the renderer has no branch for, which is the
 * log-kinds failure one layer up: prospect-detail.js used to branch on two log kinds and let
 * every other one fall through to the interaction row, so a newly registered kind rendered as
 * the wrong thing and nothing failed.
 *
 * It matters more here than for procurement, because these states carry money AND because they
 * co-occur. A firm rendered as 'active' when it is uninsured and unwaived is not a cosmetic
 * miss; it is the confident-wrong-answer failure with a lien claim behind it.
 *
 * THE STATE LIST IS BUILT BY THE MODULE, not copied into this file. Every fixture below goes
 * through ProjectData.promote() and the module's own writers, for the reason procurement.js was
 * caught by: a fixture the test invents cannot disagree with the module about anything.
 *
 * Read as source rather than executed for the rendering assertions, the way
 * procurement-panel.test.js and log-kinds.test.js read it: the renderer needs a DOM and the
 * properties under test are structural.
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

global.CrmConfig = require(path.join(ROOT, 'crm-config.js'));
global.CrmLog = require(path.join(ROOT, 'crm-log.js'));
global.CrmDocuments = require(path.join(ROOT, 'crm-documents.js'));
global.CrmEnrichment = require(path.join(ROOT, 'crm-enrichment.js'));
global.CrmFollowups = require(path.join(ROOT, 'crm-followups.js'));
global.SiteCapex = require(path.join(ROOT, 'site-capex.js'));
global.SiteInfrastructure = require(path.join(ROOT, 'site-infrastructure.js'));
global.SiteData = require(path.join(ROOT, 'site-model.js'));
global.ProjectData = require(path.join(ROOT, 'project-model.js'));
global.ProjectGates = require(path.join(ROOT, 'project-gates.js'));
global.ProjectBudget = require(path.join(ROOT, 'project-budget.js'));
var PC = global.ProjectContractors = require(path.join(ROOT, 'project-contractors.js'));
var ProjectData = global.ProjectData, SiteData = global.SiteData;

var SRC = fs.readFileSync(path.join(ROOT, 'prospect-detail.js'), 'utf8');
var HTML = fs.readFileSync(path.join(ROOT, 'prospecting.html'), 'utf8');

var NOW = Date.parse('2026-08-28T09:00:00Z');
function day(n) { return new Date(NOW + n * 86400000).toISOString().slice(0, 10); }

/* Every state the model can actually reach, produced by driving the real writers rather than
   listed here. A state added to stateOf() and not to CT_STATE fails the next block. */
function statesTheModelCanProduce() {
    _store = {};
    [global.CrmConfig, global.CrmLog, global.CrmDocuments, global.CrmEnrichment,
     global.CrmFollowups, ProjectData].forEach(function (m) { if (m && m.reset) m.reset(); });
    SiteData.add(SiteData.normalize({ id: 'p1', name: 'Pinelands Park LF',
                                      development_stage: 'raw_resource' }));
    var P = ProjectData.promote('p1', { capacity_kw: 1959, annual_cost_of_capital_pct: 11,
                                        budget_authorised_usd: 5400000 }).project;
    var ok200 = day(300);

    function firm(name, over) {
        var f = { name: name, contract_value_usd: 500000, insurance_expiry: ok200 };
        for (var k in (over || {})) f[k] = over[k];
        return PC.addContractor(P.id, f).id;
    }
    function certify(cid, gross) {
        var a = PC.addPayApp(P.id, cid, { period_to: day(-10), certified_usd: gross,
                                          retained_usd: 0 }).id;
        PC.certifyPayApp(P.id, a, 'R. Bagatoli');
        return a;
    }
    function payOff(cid, gross) {
        var a = certify(cid, gross);
        PC.recordPayment(P.id, a, { paid_on: day(-3) });
        return a;
    }

    firm('Ashcroft Electrical', { insurance_expiry: day(-5) });                 // uninsured
    firm('Selkirk Mechanical', { insurance_expiry: day(20) });                  // insurance_soon
    payOff(firm('Northgate Civil'), 100000);                                    // unwaived
    certify(firm('Corvid Surveying'), 90000);                                   // unpaid
    var cond = firm('Delta Fencing');
    PC.recordWaiver(P.id, cond, 'conditional', { on: day(-1) });                // no-op, no app
    var ca = payOff(cond, 40000);
    PC.recordWaiver(P.id, ca, 'conditional', { on: day(-1) });                  // conditional
    certify(firm('Zephyr Piling', { contract_value_usd: 10000 }), 90000);       // overcertified
    firm('Ainsworth Hauling', { contract_value_usd: null });                    // unknown
    var done = firm('Marchand Coatings', { status: 'complete' });               // complete
    var gone = firm('Halloran Rentals', { status: 'terminated' });              // terminated
    firm('Quarry Road Paving');                                                 // active

    var seen = {};
    PC.register(ProjectData.get(P.id), NOW).forEach(function (r) { seen[r.state] = true; });
    return Object.keys(seen).sort();
}

console.log('\n=== the renderer has a branch for every state the model can produce ===');
var states = statesTheModelCanProduce();
ok('the fixtures reach a real spread of states', states.length >= 8, states.join(', '));
['uninsured', 'unwaived', 'overcertified', 'unpaid', 'conditional', 'insurance_soon',
 'unknown', 'active', 'complete', 'terminated'].forEach(function (s) {
    ok('the fixtures actually produce "' + s + '"', states.indexOf(s) >= 0, states.join(', '));
});

/* A state missing from RANK sorts at index -1, which puts it ABOVE 'uninsured' at the top of
   the register — an unranked state does not fall to the bottom, it takes over the panel. */
states.forEach(function (s) {
    ok('"' + s + '" is ranked', PC.RANK.indexOf(s) >= 0);
});

var LABELS = SRC.slice(SRC.indexOf('var CT_STATE'), SRC.indexOf('var CT_TONE'));
ok('the label map was found in the source', LABELS.length > 50);
PC.RANK.forEach(function (s) {
    /* A state with no label renders its raw key — a lowercase identifier in the operator's
       face, which is what 'insurance_soon' would look like. */
    ok('CT_STATE has a label for "' + s + '"',
       new RegExp('(^|[^a-z_])' + s + '\\s*:').test(LABELS));
});

console.log('\n=== every condition is its own sentence, and none of them are added up ===');
var BLOCK = SRC.slice(SRC.indexOf('function contractorsBlock'),
                      SRC.indexOf('function contractorsSection'));
ok('the block was found', BLOCK.length > 200);
['uninsured_count', 'unwaived_count', 'conditional_count', 'overcertified_count',
 'outstanding_count', 'insurance_soon_count', 'insurance_undated_count',
 'unpriced_contract_count', 'unpriced_apps', 'variations_unknown'].forEach(function (k) {
    ok('the head reports ' + k + ' on its own', BLOCK.indexOf('e.' + k) >= 0);
});
/* THE ONE THAT MATTERS MOST. A conditional waiver releases nothing until the cheque clears, so
   adding its money to the unwaived figure would close an exposure that is entirely intact —
   and adding either to what we OWE a contractor mixes our liability with our risk. */
[['unwaived_usd', 'conditional_usd'], ['unwaived_usd', 'outstanding_usd'],
 ['conditional_usd', 'outstanding_usd']].forEach(function (pair) {
    var a = 'e\\.' + pair[0] + '\\s*\\+\\s*e\\.' + pair[1];
    var b = 'e\\.' + pair[1] + '\\s*\\+\\s*e\\.' + pair[0];
    ok(pair[0] + ' is never added to ' + pair[1],
       !new RegExp(a).test(BLOCK) && !new RegExp(b).test(BLOCK));
});
ok('an uninsured contractor is called out rather than shown quietly',
   /uninsured_count[\s\S]{0,200}pd-warn/.test(BLOCK));
ok('and so is an unwaived payment',
   /unwaived_count[\s\S]{0,200}pd-warn/.test(BLOCK));
ok('and a conditional-only waiver, which is the one that looks like a pass',
   /conditional_count[\s\S]{0,240}pd-warn/.test(BLOCK));
/* Money we owe is a payment to release, not an exposure. Warning on it would put the routine
   in the same voice as the dangerous, which is how a reader stops reading either. */
ok('but money we owe is stated plainly, not warned',
   !/outstanding_count[\s\S]{0,120}pd-warn/.test(BLOCK));

console.log('\n=== a missing figure says which one is missing ===');
/* "Unknown" tells an operator nothing they can act on. A contract sum is typed in, an
   application is priced off the certificate, an insurance date is chased from the broker. */
var WHY = SRC.slice(SRC.indexOf('function ctUnknownWhy'), SRC.indexOf('function ctWhen'));
ok('an unpriced application says so', /no amount/.test(WHY));
ok('an unpriced contract says so', /no contract sum/.test(WHY));
ok('a missing insurance date says so', /no insurance date/.test(WHY));
ok('and unreadable variations say so', /variations/.test(WHY));
ok('they are distinguished by which flag is set, not by one catch-all',
   /flags\.unpriced_apps[\s\S]*flags\.unpriced_contract/.test(WHY));

console.log('\n=== the day count is printed with its sign read the right way round ===');
var WHEN = SRC.slice(SRC.indexOf('function ctWhen'), SRC.indexOf('function ctRow'));
/* insurance_days is signed: positive is expired, negative is cover remaining. Printing the raw
   value on the expiring line would say "expires in -20 days". */
ok('expired prints the positive count', /expired '\s*\+\s*r\.insurance_days/.test(WHEN));
ok('and expiring negates it', /expires in '\s*\+\s*\(-r\.insurance_days\)/.test(WHEN));

console.log('\n=== the panel only exists once there is a project ===');
var SEC = SRC.slice(SRC.indexOf('function contractorsSection'), SRC.indexOf('function projectBlock'));
ok('an unpromoted prospect gets no contractors section', /if \(!p\) return '';/.test(SEC));
ok('and the section is rendered from the project, not the prospect',
   /ProjectData\.liveFor\(rec\.id\)/.test(SEC));
ok('it is wired into the detail view', /contractorsSection\(rec\)/.test(SRC));

console.log('\n=== the module the panel needs is actually on the page ===');
/* THE GUARD THAT MAKES A MISSING MODULE SAFE ALSO MAKES IT SILENT.
 *
 * contractorsBlock() opens with `typeof ProjectContractors === 'undefined' -> return ''`, which
 * is correct and is exactly how the procurement panel shipped inert: the script tag was never
 * added, every source-level assertion still passed, and the section simply did not appear on a
 * page that looked fine. Asserting the call site is not asserting the module. Anything that
 * fails soft needs something that fails hard pointed at the same fact. */
ok('prospecting.html loads project-contractors.js', HTML.indexOf('./project-contractors.js') >= 0);
ok('and every page that renders the detail view loads it',
   fs.readdirSync(ROOT).filter(function (f) {
       if (!/\.html$/.test(f)) return false;
       var h = fs.readFileSync(path.join(ROOT, f), 'utf8');
       return h.indexOf('prospect-detail.js') >= 0 && h.indexOf('./project-contractors.js') < 0;
   }).length === 0);
/* Load order is deliberately NOT asserted. project-contractors.js touches ProjectBudget,
   CrmFollowups and ProjectData only from inside functions that run during a render, by which
   point every tag on the page has executed. An ordering assertion would fail on a harmless
   reshuffle while proving nothing — and an assertion that passes for a reason other than the
   one written beside it is worse than none, because the next reader trusts the comment. */

console.log('\n=== every class the renderer emits is styled ===');
var emitted = {};
/* No closing quote in the pattern: the row class is built by concatenation, so anchoring on the
   closing quote silently skips the one class that carries the layout. */
var re = /class="(pd-ct[a-z0-9 -]*)/g, m;
while ((m = re.exec(SRC)) !== null) {
    m[1].split(/\s+/).forEach(function (c) { if (c) emitted[c] = true; });
}
/* Built by concatenation and so invisible to the scan above, exactly like the tone suffixes:
   `class="pd-ct-app' + warn + '"`. Named here so they are still checked. */
['pd-ct-warn', 'pd-ct-note', 'pd-ct-app-warn'].forEach(function (c) { emitted[c] = true; });
var names = Object.keys(emitted).sort();
ok('the renderer emits the classes this checks', names.length >= 6, names.join(', '));
names.forEach(function (c) {
    ok('"' + c + '" has a style rule', HTML.indexOf('.' + c) >= 0);
});

console.log('\n=== the tone map only marks what is actionable ===');
var TONE = SRC.slice(SRC.indexOf('var CT_TONE'), SRC.indexOf('function ctUnknownWhy'));
['active', 'complete', 'terminated'].forEach(function (s) {
    ok('"' + s + '" carries no tone', !new RegExp('(^|[^a-z_])' + s + '\\s*:').test(TONE));
});
['uninsured', 'unwaived', 'overcertified', 'unknown'].forEach(function (s) {
    ok('"' + s + '" does', new RegExp('(^|[^a-z_])' + s + '\\s*:').test(TONE));
});

console.log('');
console.log(fail ? '  ' + fail + ' FAILED, ' + pass + ' passed' : '  all ' + pass + ' passed');
process.exitCode = fail ? 1 : 0;
