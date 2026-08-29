/* The budget panel, and the eight other write paths that had no control behind them.
 *
 * ProjectBudget shipped with ninety-three passing assertions and no caller anywhere outside its
 * own tests: no control added a line, edited one, removed one, revised a change order, or seeded
 * the opening budget from the estimate. tests/workspace-reach.test.js found that by census; this
 * is the other half, and it asserts REACHABILITY the way stage-advance does — by rendering the
 * real panel and loading prospecting.js for real, rather than reading source.
 *
 * The three assertions that matter most are all the same shape, and it is the shape the ledger
 * exists to defend:
 *
 *   1. BUDGETED, COMMITTED AND SPENT ARE THREE COLUMNS. Collapsing them to one "cost so far"
 *      would undo the entire model: once a PO is issued the money is gone, and a panel showing
 *      only what has been invoiced looks fine right up until it does not.
 *   2. AT RISK IS NEVER FOLDED IN. Diligence money is spent on a project that can still die.
 *   3. NULL AND ZERO ARE OPPOSITE CLAIMS for the contingency ratio. Zero means the contingency
 *      is gone — the loudest thing this ledger can say. Null means none was ever budgeted, and
 *      every freshly seeded project lands there.
 */
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');

var pass = 0, fail = 0;
function ok(label, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + (detail ? '\n        ' + detail : '')); }
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

var LISTENERS = [];
var els = {};
function mkEl(id) {
    return {
        id: id, innerHTML: '', value: '', hidden: false, textContent: '', style: {}, _attrs: {},
        classList: { add: function () {}, remove: function () {} },
        addEventListener: function (t) { LISTENERS.push({ id: id, type: t }); },
        getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; },
        setAttribute: function (k, v) { this._attrs[k] = v; },
        appendChild: function () {}, removeChild: function () {}, select: function () {},
        querySelectorAll: function (sel) { return matchIn(this.innerHTML, sel); }
    };
}
function matchIn(html, sel) {
    var cls = sel.replace(/^\./, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var re = new RegExp('class="[^"]*\\b' + cls + '\\b[^"]*"', 'g');
    var out = [];
    while (re.exec(html) !== null) out.push(mkEl(sel + '#' + out.length));
    return out;
}
global.document = {
    getElementById: function (id) { if (!els[id]) els[id] = mkEl(id); return els[id]; },
    querySelectorAll: function (sel) {
        var all = [];
        Object.keys(els).forEach(function (k) { all = all.concat(matchIn(els[k].innerHTML, sel)); });
        return all;
    },
    createElement: function () { return mkEl('tmp'); },
    body: { appendChild: function () {}, removeChild: function () {} },
    addEventListener: function () {}
};
global.location = { hash: '#p/p1' };
global.window = { alert: function () {}, prompt: function () { return null; },
                  confirm: function () { return true; }, addEventListener: function () {},
                  print: function () {} };
global.navigator = {};
global.initNav = function () {};

function req(f) { return require(path.join(ROOT, f)); }
['crm-config.js', 'crm-log.js', 'crm-contacts.js', 'crm-interactions.js', 'crm-followups.js',
 'crm-enrichment.js', 'crm-documents.js', 'site-model.js', 'site-capex.js',
 'site-infrastructure.js', 'site-opportunity.js', 'site-capacity.js', 'project-model.js',
 'project-gates.js', 'project-budget.js', 'project-sizing.js', 'procurement.js',
 'project-contractors.js', 'prospect-nav.js', 'prospect-board.js', 'prospect-today.js',
 'prospect-detail.js', 'prospect-analytics.js', 'prospect-summary.js'].forEach(function (f) {
    var mod = req(f);
    var n = (/^var\s+([A-Za-z0-9_]+)\s*=/m.exec(fs.readFileSync(path.join(ROOT, f), 'utf8')) || [])[1];
    if (n) global[n] = mod;
});
var SiteData = global.SiteData, ProjectData = global.ProjectData;
var ProjectBudget = global.ProjectBudget, ProspectDetail = global.ProspectDetail;
var HTML = fs.readFileSync(path.join(ROOT, 'prospecting.html'), 'utf8');

SiteData.add(SiteData.normalize({ id: 'p1', name: 'Pinelands Park LF',
                                  development_stage: 'raw_resource' }));
var P = ProjectData.promote('p1', { capacity_kw: 1959, annual_cost_of_capital_pct: 11,
                                    budget_authorised_usd: 5400000 }).project;

function panel() {
    els['pdetail'] = mkEl('pdetail');
    ProspectDetail.render('p1', 'pdetail');
    var h = els['pdetail'].innerHTML;
    var i = h.indexOf('<h3>Budget</h3>');
    if (i < 0) return '';
    var j = h.indexOf('<section class="pd-sec"', i);
    return h.slice(i, j < 0 ? h.length : j);
}

console.log('\n=== an empty ledger offers the seed, and only while it is empty ===');
{
    var b = panel();
    ok('the Budget section renders', b.length > 0);
    ok('and offers to seed from the estimate', b.indexOf('id="pdBudSeed"') >= 0);
    ok('saying why that beats typing one in', /opening budget/i.test(b), b.slice(0, 300));

    var seed = ProjectBudget.seedFromEstimate(P.id);
    ok('seeding works', seed.ok, seed.err);
    ok('and seeded something', seed.seeded > 0, JSON.stringify(seed.seeded));
    /* Components the estimator reports as unknown are skipped, never seeded at zero: a zero
       budget reads as "this costs nothing" and produces a 100% overrun on the first invoice. */
    ok('reporting what it would not seed rather than seeding it at zero',
       Array.isArray(seed.skipped));
    var b2 = panel();
    ok('the seed button is gone once there are lines', b2.indexOf('id="pdBudSeed"') < 0);
    ok('and refuses a second time', !ProjectBudget.seedFromEstimate(P.id).ok);
}

console.log('\n=== three states, three columns, never collapsed into one ===');
{
    var b = panel();
    ok('the columns are named', /Budgeted[\s\S]{0,40}Committed[\s\S]{0,40}Spent/.test(b));
    /* Each line carries all three as separate editable fields. One field would be the whole
       failure: committed is the number nothing tracked before this ledger existed. */
    ['budgeted_amount', 'committed_amount', 'spent_amount'].forEach(function (f) {
        ok('lines expose ' + f + ' on its own', b.indexOf('data-field="' + f + '"') >= 0);
    });
    var amts = (b.match(/class="pd-bud-amt"/g) || []).length;
    ok('every line has three inputs', amts > 0 && amts % 3 === 0, amts + ' inputs');
    ok('and each is bound to its line', b.indexOf('data-lid="bl_') >= 0 || /data-lid="[^"]+"/.test(b));
}

console.log('\n=== at risk is held out of the capital figures, on screen as well as in the model ===');
{
    ProjectBudget.addLine(P.id, { category: 'diligence_at_risk', committed_amount: 200000,
                                  vendor: 'Gas analysis' });
    var t = ProjectBudget.totals(ProjectData.get(P.id));
    eq('the model holds it out of committed', t.at_risk_committed, 200000);
    var b = panel();
    ok('and the panel gives it its own sentence',
       /at risk[\s\S]{0,80}held out of the capital figures/i.test(b), b.slice(0, 600));
    /* The failure would be silent: folding it in makes a project that has spent $200K proving a
       site unviable read exactly like one that has started building. */
    ok('the sentence is a warning, not a footnote',
       /pd-warn[^>]*>[^<]*200,000[\s\S]{0,90}at risk/i.test(b) ||
       /pd-warn[^>]*>[\s\S]{0,120}at risk/i.test(b), 'at-risk line not marked');
}

console.log('\n=== null and zero are opposite claims about contingency ===');
{
    var t = ProjectBudget.totals(ProjectData.get(P.id));
    /* The estimator has no contingency component, so a freshly seeded project has none budgeted
       and the ratio is null. Rendering that as 0% would say the contingency is exhausted, which
       is the loudest thing this ledger can say, about a project that simply has not set any. */
    eq('a seeded project has no contingency ratio', t.contingency_ratio, null);
    var b = panel();
    ok('so the panel says none is budgeted', /No contingency is budgeted/.test(b), b.slice(0, 700));
    /* NOT a check for the literal "0%". Deleting the null branch falls through to the
       less-than-25 one, where null coerces to 0 and the panel prints "Contingency is null% of
       what is left" — so an assertion looking for 0% passes while the panel shows nonsense. The
       property is that NO ratio is printed at all, whatever it would have said. */
    ok('and prints no ratio of any kind while none is budgeted',
       !/Contingency is \S+% of/.test(b), b.slice(0, 700));
}

console.log('\n=== a change order can be revised, but only once it is approved ===');
{
    var co = ProjectBudget.addChangeOrder(P.id, { description: 'Extra pad',
        reason: 'settlement found on survey', cost_impact: 90000, schedule_impact_days: 14 });
    ok('the change order was raised', co.ok, co.err);
    var b = panel();
    ok('it appears in the ledger', b.indexOf('Extra pad') >= 0);
    /* A proposed change order is DECIDED, not revised. Offering Revise here would invite editing
       a figure nobody has agreed to yet, which is a different act with a different record. */
    ok('a proposed one offers no Revise', b.indexOf('data-coid="' + co.id + '"') < 0, b.slice(-900));

    ProjectBudget.decideChangeOrder(P.id, co.id, 'approved', 'R. Bagatoli');
    var b2 = panel();
    ok('an approved one does', b2.indexOf('data-coid="' + co.id + '"') >= 0);
    ok('and the head counts it against what was authorised',
       /approved change order[\s\S]{0,120}% of authorised/i.test(b2), b2.slice(0, 700));
}

console.log('\n=== every one of the nine write paths now has a control on it ===');
{
    /* Set the other two panels up so their row controls render, then load prospecting.js once
       and ask whether each control got a handler. This is the assertion the census cannot make:
       it can see that a caller EXISTS in source, not that the element it hangs off is real. */
    global.ProjectProcurement.addItem(P.id, { description: 'Genset 2MW', lead_time_weeks: 44 });
    var cid = global.ProjectContractors.addContractor(P.id, { name: 'Northgate Civil',
        contract_value_usd: 800000, insurance_expiry: '2027-01-01' }).id;
    global.ProjectContractors.addPayApp(P.id, cid, { period_to: '2026-08-18',
        certified_usd: 100000, retained_usd: 10000 });
    var spare = global.ProjectContractors.addContractor(P.id, { name: 'Delta Fencing' }).id;

    var b = panel();
    ok('the procurement lead time is editable in place',
       /class="pd-proc-wk"/.test(els['pdetail'].innerHTML));
    ok('a contractor insurance date is editable in place',
       /class="pd-ct-ins-set"/.test(els['pdetail'].innerHTML));
    ok('a contractor with no applications can be removed',
       els['pdetail'].innerHTML.indexOf('class="pd-ct-rm" data-cid="' + spare + '"') >= 0);
    ok('a contractor WITH applications cannot',
       els['pdetail'].innerHTML.indexOf('class="pd-ct-rm" data-cid="' + cid + '"') < 0);
    ok('a submitted application offers Reject beside Certify',
       /data-do="reject"/.test(els['pdetail'].innerHTML));

    var threw = null;
    try { req('prospecting.js'); } catch (e) { threw = e; }
    ok('prospecting.js loads and wires without throwing', !threw, threw ? threw.message : '');
    function wired(id, type) {
        return LISTENERS.some(function (l) { return l.id === id && l.type === type; });
    }
    ok('#pdBudForm is wired', wired('pdBudForm', 'submit'));
    ok('the inline amounts are wired', wired('.pd-bud-amt#0', 'change'));
    ok('line removal is wired', wired('.pd-bud-rm#0', 'click'));
    ok('change-order revision is wired', wired('.pd-bud-rev#0', 'click'));
    ok('the procurement lead time is wired', wired('.pd-proc-wk#0', 'change'));
    ok('the insurance date is wired', wired('.pd-ct-ins-set#0', 'change'));
    ok('contractor removal is wired', wired('.pd-ct-rm#0', 'click'));
    ok('the row buttons are wired', wired('.pd-ct-act#0', 'click'));
    /* And the controls added before this commit are still wired, because everything here went
       into wireDetail() ABOVE them and anything throwing leaves the rest unattached. */
    ['pdStage', 'pdAdvance'].forEach(function (id) {
        ok(id + ' is still wired below the new handlers',
           wired(id, 'change') || wired(id, 'click'));
    });
}

console.log('\n=== the census agrees nothing is stranded any more ===');
{
    /* The number this whole commit exists to move. Read from the census rather than restated,
       so it cannot drift from what workspace-reach actually asserts. */
    var cp = require('child_process');
    var out = '';
    try { out = cp.execSync('node "' + path.join(ROOT, 'tests/workspace-reach.test.js') + '"',
                            { encoding: 'utf8', cwd: ROOT }); }
    catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
    ok('the census passes', /all \d+ passed/.test(out), out.slice(-400));
    ok('and prints no stranded writers', out.indexOf('no caller yet') < 0,
       (out.match(/no caller yet.*/g) || []).join('\n'));
}

console.log('\n=== every class the budget panel emits is styled ===');
{
    var emitted = {};
    var src = fs.readFileSync(path.join(ROOT, 'prospect-detail.js'), 'utf8');
    var re = /class="(pd-bud[a-z0-9 -]*)/g, m;
    while ((m = re.exec(src)) !== null) {
        m[1].split(/\s+/).forEach(function (c) { if (c) emitted[c] = true; });
    }
    var names = Object.keys(emitted).sort();
    ok('the renderer emits the classes this checks', names.length >= 8, names.join(', '));
    names.forEach(function (c) {
        /* A boundary, not a substring: '.pd-bud' is a prefix of '.pd-bud-line', so indexOf
           would clear every one of them against a single unrelated rule. */
        var rx = new RegExp('\\.' + c.replace(/-/g, '\\-') + '(?![a-zA-Z0-9_-])');
        ok('"' + c + '" has a style rule', rx.test(HTML));
    });
    ['pd-proc-wk', 'pd-ct-do', 'pd-ct-ins-set', 'pd-ct-rm'].forEach(function (c) {
        var rx = new RegExp('\\.' + c.replace(/-/g, '\\-') + '(?![a-zA-Z0-9_-])');
        ok('"' + c + '" has a style rule', rx.test(HTML));
    });
}

console.log('');
console.log(fail ? '  ' + fail + ' FAILED, ' + pass + ' passed' : '  all ' + pass + ' passed');
process.exitCode = fail ? 1 : 0;
