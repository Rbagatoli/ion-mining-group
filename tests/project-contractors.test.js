/* Stage 7: contractors, payment applications and lien exposure.
 *
 * The assertions are ranked by which wrong answer costs most, and the top three are all the
 * same shape — a figure that reads as reassuring because an absence was filled in:
 *
 *   1. AN ABSENT WAIVER TREATED AS ANYTHING BUT EXPOSURE. A lien waiver that has not been
 *      received does not exist. Filed as 'unknown' it joins the quiet bucket; defaulted to
 *      covered it disappears entirely. Either way the money that can be claimed twice stops
 *      being reported, which is the loss the construction gate names.
 *   2. A CONDITIONAL WAIVER COUNTED AS A WAIVER. It is contingent on the cheque clearing, so
 *      it releases nothing yet. Summed with the unconditional ones it silently closes an
 *      exposure that is entirely intact.
 *   3. THE FALSY-ZERO GUARD ON OVER-CERTIFICATION. `if (committed && certified > committed)`
 *      skips the check when the contract sum is zero, which is the single loudest case there
 *      is. It is written as a test against null because null means unknown and zero means zero.
 *
 * EVERY PROJECT HERE COMES FROM ProjectData.promote() AND EVERY RECORD FROM THIS MODULE'S OWN
 * WRITERS. procurement.js read its collection as an array, returned [] for every real project,
 * and fifty tests agreed with it because every fixture in that file was built by that file. A
 * fixture the test invents cannot disagree with the module about the shape. Nothing below
 * hand-builds a project, and the shape is additionally proved against project-model.js's own
 * normalizer at the bottom, including the half that makes the map load-bearing: an array in
 * these slots is discarded outright.
 */
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
global.ProjectContractors = require(path.join(ROOT, 'project-contractors.js'));

var SiteData = global.SiteData, ProjectData = global.ProjectData;
var ProjectBudget = global.ProjectBudget, PC = global.ProjectContractors;
var CrmLog = global.CrmLog;

/* A fixed clock for every date below, so nothing here rots. Only the insurance arithmetic reads
   it; the money does not depend on a date at all. */
var NOW = Date.parse('2026-08-28T09:00:00Z');
function day(n) { return new Date(NOW + n * 86400000).toISOString().slice(0, 10); }

var GOOD = { capacity_kw: 1959, annual_cost_of_capital_pct: 11, budget_authorised_usd: 5400000,
             target_energization: day(330) };

var PROJ = null;
function fresh() {
    _store = {};
    [global.CrmConfig, CrmLog, global.CrmDocuments, global.CrmEnrichment,
     global.CrmFollowups, ProjectData].forEach(function (m) { if (m && m.reset) m.reset(); });
    SiteData.add(SiteData.normalize({ id: 'p1', name: 'Pinelands Park LF',
                                      development_stage: 'raw_resource' }));
    PROJ = ProjectData.promote('p1', GOOD).project;
    return PROJ;
}
function proj() { return ProjectData.get(PROJ.id); }
function rowFor(id, nowMs) {
    var rows = PC.register(proj(), nowMs === undefined ? NOW : nowMs);
    for (var i = 0; i < rows.length; i++) if (rows[i].contractor.id === id) return rows[i];
    return null;
}

/* One contractor with one certified-and-paid application, priced so every figure below is a
   round number stated here rather than read back from the module. */
function engaged(over) {
    var f = { name: 'Northgate Civil', trade: 'civil', contract_value_usd: 800000 };
    for (var k in (over || {})) f[k] = over[k];
    var c = PC.addContractor(PROJ.id, f);
    return c.id;
}
function payApp(cid, gross, retained, over) {
    var f = { period_to: day(-10), certified_usd: gross, retained_usd: retained, number: 'PA1' };
    for (var k in (over || {})) f[k] = over[k];
    return PC.addPayApp(PROJ.id, cid, f).id;
}
function paid(cid, gross, retained, when) {
    var aid = payApp(cid, gross, retained);
    PC.certifyPayApp(PROJ.id, aid, 'R. Bagatoli');
    PC.recordPayment(PROJ.id, aid, { paid_on: when || day(-3) });
    return aid;
}

console.log('\n=== an absent waiver is exposure, not an unknown and not a pass ===');
{
    fresh();
    var cid = engaged();
    paid(cid, 200000, 20000);            // net 180,000 out the door, nothing signed against it
    var r = rowFor(cid);
    eq('the payment is counted at its net of retainage', r.paid_usd, 180000);
    eq('and all of it is unwaived', r.unwaived_usd, 180000);
    eq('the row says so', r.state, 'unwaived');
    ok('the flag is set', r.flags.unwaived === true);
    /* The three ways this goes quiet, each asserted as a value rather than as truthiness. A
       test for "is a number" passes on every one of them. */
    eq('it is NOT filed as conditional', r.conditional_usd, 0);
    ok('it is NOT filed as unknown', r.state !== 'unknown');
    eq('and the money is not zero', r.unwaived_usd !== 0, true);

    var e = PC.exposure(proj(), NOW);
    eq('the exposure names one contractor', e.unwaived_count, 1);
    eq('for the net amount', e.unwaived_usd, 180000);

    /* THE NORMALIZER'S OWN DEFAULT, WHICH THE WRITER HIDES. addPayApp() writes waiver:'none'
       explicitly, so every record above agrees with normalizePayApp() by construction and its
       fallback never runs — the same blindness as a fixture built by the file that reads it.
       A record with no waiver key at all is what an older build or a hand-edited document
       produces, and it is exactly the case where a reassuring default would be silent. */
    var second = PC.addContractor(PROJ.id, { name: 'Ashcroft Electrical',
                                             contract_value_usd: 300000 }).id;
    ProjectData.mutate(PROJ.id, function (p) {
        p.pay_apps['pa_nowaiverkey'] = { id: 'pa_nowaiverkey', contractor_id: second,
                                         period_to: day(-6), certified_usd: 60000,
                                         retained_usd: 0, status: 'paid' };
    });
    eq('a record with no waiver key at all normalizes to none',
       PC.normalizePayApp({ id: 'x', status: 'paid', certified_usd: 1 }).waiver, 'none');
    eq('and reads as exposure rather than as covered', rowFor(second).unwaived_usd, 60000);
    eq('so the register counts two', PC.exposure(proj(), NOW).unwaived_count, 2);
}

console.log('\n=== a conditional waiver releases nothing, and is never summed with the rest ===');
{
    fresh();
    var cid = engaged();
    var aid = paid(cid, 200000, 20000);
    var w = PC.recordWaiver(PROJ.id, aid, 'conditional', { on: day(-3) });
    ok('the conditional waiver is recorded', w.ok, w.err);
    var r = rowFor(cid);
    eq('it leaves the unwaived figure at zero', r.unwaived_usd, 0);
    eq('and moves the money to its own line', r.conditional_usd, 180000);
    eq('which is a state of its own', r.state, 'conditional');

    var e = PC.exposure(proj(), NOW);
    eq('the two are counted apart — unwaived', e.unwaived_usd, 0);
    eq('and conditional', e.conditional_usd, 180000);
    /* THE POINT OF THE WHOLE SPLIT. There is deliberately no key holding their sum: one is a
       claim nobody has given up and the other is a swap waiting on a cheque, and a combined
       number would say "there is 180,000 of something" and name no action. */
    ok('and nothing on the summary adds them together',
       Object.keys(e).every(function (k) {
           return ['total_exposure_usd', 'exposure_usd', 'at_risk_usd', 'unwaived_total'].indexOf(k) < 0;
       }), Object.keys(e).join(','));

    var u = PC.recordWaiver(PROJ.id, aid, 'unconditional', { on: day(-1) });
    ok('the unconditional waiver supersedes it', u.ok, u.err);
    var r2 = rowFor(cid);
    eq('and now nothing is outstanding either way — unwaived', r2.unwaived_usd, 0);
    eq('conditional', r2.conditional_usd, 0);
    ok('the row rests', ['active', 'unknown'].indexOf(r2.state) >= 0, r2.state);

    /* Downgrading a released claim back to conditional is almost always a misfiling, and doing
       it silently would reopen nothing while appearing to. */
    var back = PC.recordWaiver(PROJ.id, aid, 'conditional', { on: day(0) });
    ok('a conditional waiver cannot overwrite an unconditional one', !back.ok);
    eq('and the unconditional one still stands',
       PC.appsFor(proj(), cid)[0].waiver, 'unconditional');
}

console.log('\n=== the gate question: are the waivers current ===');
{
    fresh();
    var cid = engaged();
    var aid = paid(cid, 200000, 20000);
    var v1 = PC.waiversCurrent(proj(), NOW);
    ok('not with a payment and no waiver', !v1.ok);
    ok('and the refusal names the money', /180,000/.test(v1.err), v1.err);

    PC.recordWaiver(PROJ.id, aid, 'conditional', { on: day(-3) });
    var v2 = PC.waiversCurrent(proj(), NOW);
    /* crm-config.js makes lien_waivers a BLOCKING deliverable on the construction gate. A gate
       that accepted a conditional waiver would pass a project whose exposure is untouched. */
    ok('and NOT with a conditional waiver either', !v2.ok);
    ok('the refusal says why it is not enough', /clears/.test(v2.err), v2.err);

    PC.recordWaiver(PROJ.id, aid, 'unconditional', { on: day(-1) });
    ok('current once the unconditional waiver is on file', PC.waiversCurrent(proj(), NOW).ok);
}

console.log('\n=== over-certification, and the zero-contract case a falsy guard drops ===');
{
    fresh();
    var cid = engaged();                          // contract 800,000
    payApp(cid, 500000, 0);
    var a2 = payApp(cid, 400000, 0);
    PC.certifyPayApp(PROJ.id, PC.appsFor(proj(), cid)[0].id, 'R. Bagatoli');
    PC.certifyPayApp(PROJ.id, a2, 'R. Bagatoli');
    var r = rowFor(cid);
    eq('900,000 certified against an 800,000 contract', r.certified_usd, 900000);
    eq('is 100,000 over', r.overcertified_usd, 100000);
    ok('and says so', r.flags.overcertified === true);

    /* THE FALSY-ZERO TRAP. A firm with no priced contract that has certified real work is the
       loudest case there is, and `if (committed && ...)` skips it entirely. */
    var zid = PC.addContractor(PROJ.id, { name: 'Ashcroft Electrical', contract_value_usd: 0 }).id;
    var za = payApp(zid, 80000, 0);
    PC.certifyPayApp(PROJ.id, za, 'R. Bagatoli');
    var zr = rowFor(zid);
    eq('a zero contract is a known zero, not an unknown', zr.committed_usd, 0);
    eq('so 80,000 certified against it is 80,000 over', zr.overcertified_usd, 80000);
    ok('and it is flagged', zr.flags.overcertified === true);
    ok('rather than resting', zr.state !== 'active' && zr.state !== 'unknown', zr.state);
}

console.log('\n=== an unpriced contract is unknown, and unknown is not zero ===');
{
    fresh();
    var cid = PC.addContractor(PROJ.id, { name: 'Selkirk Mechanical' }).id;
    var a = payApp(cid, 120000, 0);
    PC.certifyPayApp(PROJ.id, a, 'R. Bagatoli');
    var r = rowFor(cid);
    eq('there is no contract sum', r.contract_usd, null);
    eq('so there is no committed figure', r.committed_usd, null);
    /* Zero here would say "certified 120,000 against a contract of nothing", which is a
       different and much louder claim than "nobody has typed the contract sum in yet". */
    eq('and over-certification is null rather than the whole certified amount',
       r.overcertified_usd, null);
    ok('the contract is flagged as unpriced', r.flags.unpriced_contract === true);
    ok('but the certified work is still counted', r.certified_usd === 120000);
}

console.log('\n=== a variation raises the contract it varies, and only that one ===');
{
    fresh();
    var cid = engaged();                          // 800,000
    var other = PC.addContractor(PROJ.id, { name: 'Ashcroft Electrical',
                                            contract_value_usd: 300000 }).id;
    var a = payApp(cid, 900000, 0);
    PC.certifyPayApp(PROJ.id, a, 'R. Bagatoli');
    eq('over by 100,000 before any change order', rowFor(cid).overcertified_usd, 100000);

    /* Attributed to the OTHER contractor. If attribution were ignored, this would clear the
       first contractor's overrun and the flag would be worthless. */
    var wrong = ProjectBudget.addChangeOrder(PROJ.id, {
        description: 'Switchgear upgrade', reason: 'utility requirement',
        cost_impact: 150000, schedule_impact_days: 10, contractor_id: other });
    ProjectBudget.decideChangeOrder(PROJ.id, wrong.id, 'approved', 'R. Bagatoli');
    eq('a variation on another contract does not clear it', rowFor(cid).overcertified_usd, 100000);
    eq('it raises that contract instead', rowFor(other).committed_usd, 450000);

    var right = ProjectBudget.addChangeOrder(PROJ.id, {
        description: 'Additional pad', reason: 'settlement found on survey',
        cost_impact: 150000, schedule_impact_days: 14, contractor_id: cid });
    eq('a proposed variation counts for nothing yet', rowFor(cid).overcertified_usd, 100000);
    ProjectBudget.decideChangeOrder(PROJ.id, right.id, 'approved', 'R. Bagatoli');
    eq('approved, the contract is worth 950,000', rowFor(cid).committed_usd, 950000);
    eq('and the overrun is gone', rowFor(cid).overcertified_usd, 0);
    ok('so the row no longer claims over-certification', rowFor(cid).flags.overcertified === false);

    var bogus = ProjectBudget.addChangeOrder(PROJ.id, {
        description: 'Nobody', reason: 'typo', cost_impact: 1, schedule_impact_days: 0,
        contractor_id: 'ct_doesnotexist' });
    ok('a variation cannot be attached to a contractor that is not there', !bogus.ok);
}

console.log('\n=== the contract sum closes at the first certificate ===');
{
    fresh();
    var cid = engaged();
    var before = PC.updateContractor(PROJ.id, cid, { contract_value_usd: 850000 });
    ok('a typo is fixable before anything is certified', before.ok, before.err);
    eq('and it took', PC.contractorsOf(proj())[0].contract_value_usd, 850000);

    var a = payApp(cid, 100000, 10000);
    PC.certifyPayApp(PROJ.id, a, 'R. Bagatoli');
    var after = PC.updateContractor(PROJ.id, cid, { contract_value_usd: 950000 });
    ok('after the first certificate it is refused', !after.ok);
    ok('and the refusal names the change order as the way to do it',
       /change order/i.test(after.err || ''), after.err);
    eq('the sum is untouched', PC.contractorsOf(proj())[0].contract_value_usd, 850000);
    ok('while the things that are not the contract still edit',
       PC.updateContractor(PROJ.id, cid, { trade: 'civil & earthworks' }).ok);
    ok('and a field nobody named is refused rather than dropped',
       !PC.updateContractor(PROJ.id, cid, { paid_usd: 1 }).ok);
}

console.log('\n=== recording the truth is never the harder path ===');
{
    fresh();
    var cid = engaged();
    var a = payApp(cid, 200000, 20000);
    var early = PC.recordPayment(PROJ.id, a, { paid_on: day(-3) });
    ok('a payment cannot be recorded before the certificate', !early.ok);
    ok('and it says to certify it first', /certif/i.test(early.err || ''), early.err);

    PC.certifyPayApp(PROJ.id, a, 'R. Bagatoli');
    /* THE ONE THING THAT IS NOT REFUSED. The cheque is already written by the time anybody
       records it, so refusing this would not stop the payment — it would stop the RECORD, and
       an unrecorded payment is exposure nothing can see. */
    var res = PC.recordPayment(PROJ.id, a, { paid_on: day(-3) });
    ok('but a payment with no waiver against it goes straight in', res.ok, res.err);
    eq('and the row lights up instead of the write failing', rowFor(cid).state, 'unwaived');
    eq('the caller is told what it just created', res.waiver, 'none');
}

console.log('\n=== retainage is deducted, and a deduction bigger than the certificate is not a credit ===');
{
    fresh();
    var cid = engaged();
    paid(cid, 200000, 20000);
    var r = rowFor(cid);
    eq('certified is the gross', r.certified_usd, 200000);
    eq('paid is the net', r.paid_usd, 180000);
    eq('and the retainage is held, and reported', r.retained_usd, 20000);

    var over = PC.addPayApp(PROJ.id, cid, { period_to: day(-5), certified_usd: 50000,
                                            retained_usd: 60000 });
    ok('retainage above the certified amount is refused at the door', !over.ok);
    ok('and it says nothing would be payable', /payable/i.test(over.err || ''), over.err);
}

console.log('\n=== an application with no amount is counted, never folded ===');
{
    fresh();
    var cid = engaged();
    paid(cid, 200000, 20000);
    /* Storage can hold this even though addPayApp refuses it: a record written by a build that
       had a different idea, or a hand-edited document. The sums must become a LOWER bound that
       says so, not a wrong number. */
    ProjectData.mutate(PROJ.id, function (p) {
        p.pay_apps['pa_broken'] = { id: 'pa_broken', contractor_id: cid, period_to: day(-4),
                                    certified_usd: null, retained_usd: 0, status: 'paid',
                                    waiver: 'none' };
    });
    var r = rowFor(cid);
    eq('the unpriced application is counted on its own', r.unpriced_apps, 1);
    eq('it contributes nothing to the money', r.paid_usd, 180000);
    eq('and nothing to the exposure', r.unwaived_usd, 180000);
    ok('the flag is raised', r.flags.unpriced_apps === true);
    eq('and the summary carries it as its own number',
       PC.exposure(proj(), NOW).unpriced_apps, 1);
}

console.log('\n=== insurance: the day count is signed, and expiring is not expired ===');
{
    fresh();
    var lapsed = PC.addContractor(PROJ.id, { name: 'Ashcroft Electrical',
                                             insurance_expiry: day(-5) }).id;
    var soon = PC.addContractor(PROJ.id, { name: 'Selkirk Mechanical',
                                           insurance_expiry: day(20) }).id;
    var fine = PC.addContractor(PROJ.id, { name: 'Northgate Civil',
                                           insurance_expiry: day(200) }).id;
    var noneAt = PC.addContractor(PROJ.id, { name: 'Delta Fencing' }).id;

    eq('expired five days ago reads +5', rowFor(lapsed).insurance_days, 5);
    /* THE UNSIGNED-COUNT MUTATION, which is the one crm-followups.test.js exists for. abs()
       here would call a certificate with twenty days left twenty days expired, and mark the
       whole register uninsured. */
    eq('twenty days of cover left reads -20', rowFor(soon).insurance_days, -20);
    eq('the lapsed one is uninsured', rowFor(lapsed).state, 'uninsured');
    eq('the expiring one is not', rowFor(soon).state, 'insurance_soon');
    ok('and the one with cover is neither',
       rowFor(fine).flags.uninsured === false && rowFor(fine).flags.insurance_soon === false);
    ok('a contractor with no certificate date is unverified, not covered',
       rowFor(noneAt).flags.insurance_undated === true && rowFor(noneAt).state === 'unknown',
       rowFor(noneAt).state);

    var e = PC.exposure(proj(), NOW);
    eq('one uninsured', e.uninsured_count, 1);
    eq('one expiring', e.insurance_soon_count, 1);
    eq('one undated', e.insurance_undated_count, 1);
}

console.log('\n=== the register is ordered worst first, and every clause decides something ===');
{
    fresh();
    // Inserted in an order that is not the answer, so the sort has to do the work.
    var quiet = PC.addContractor(PROJ.id, { name: 'Delta Fencing', contract_value_usd: 50000,
                                            insurance_expiry: day(300) }).id;
    var owed = PC.addContractor(PROJ.id, { name: 'Selkirk Mechanical',
                                           contract_value_usd: 400000,
                                           insurance_expiry: day(300) }).id;
    var lien = PC.addContractor(PROJ.id, { name: 'Northgate Civil', contract_value_usd: 800000,
                                           insurance_expiry: day(300) }).id;
    var bare = PC.addContractor(PROJ.id, { name: 'Ashcroft Electrical',
                                           contract_value_usd: 300000,
                                           insurance_expiry: day(-2) }).id;

    var oa = payApp(owed, 90000, 9000);
    PC.certifyPayApp(PROJ.id, oa, 'R. Bagatoli');          // certified, unpaid
    paid(lien, 200000, 20000);                             // paid, no waiver
    var ba = paid(bare, 10000, 0);
    PC.recordWaiver(PROJ.id, ba, 'unconditional', { on: day(-1) });  // clean, but uninsured

    /* An unmeasurable firm, so the clause that puts 'unknown' BELOW the actionable states and
       above the resting ones is actually exercised. Without one in the register, moving unknown
       to the top of RANK changes nothing and the ordering assertions say nothing about it. */
    var murky = PC.addContractor(PROJ.id, { name: 'Corvid Surveying',
                                            insurance_expiry: day(300) }).id;

    var order = PC.register(proj(), NOW).map(function (r) { return r.contractor.id; });
    eq('the uninsured firm leads', order[0], bare);
    eq('then the unwaived payment', order[1], lien);
    eq('then the money we owe', order[2], owed);
    eq('the firm nobody can measure comes after all of those', order[3], murky);
    eq('and the quiet one is last', order[4], quiet);
    eq('which is the state it is in', rowFor(murky).state, 'unknown');

    /* THE TIE-BREAK NEEDS AN ACTUAL TIE, AND A TIE THE OTHER CLAUSE WOULD LOSE. Three firms in
       one state, and the names are chosen so alphabetical order is the exact REVERSE of the
       money order — Ainsworth 30,000, Northgate 200,000, Zephyr 900,000. An earlier version of
       this used names that happened to sort the same way the money did, so deleting the amount
       clause entirely left every assertion green while the comment beside them claimed
       otherwise. */
    var small = PC.addContractor(PROJ.id, { name: 'Ainsworth Hauling', contract_value_usd: 90000,
                                            insurance_expiry: day(300) }).id;
    var large = PC.addContractor(PROJ.id, { name: 'Zephyr Piling', contract_value_usd: 900000,
                                            insurance_expiry: day(300) }).id;
    paid(small, 30000, 0);
    paid(large, 400000, 0);
    var unwaived = PC.register(proj(), NOW)
        .filter(function (r) { return r.state === 'unwaived'; })
        .map(function (r) { return r.contractor.name; });
    eq('three firms are unwaived', unwaived.length, 3);
    eq('and the largest exposure is first', unwaived[0], 'Zephyr Piling');
    eq('then the next', unwaived[1], 'Northgate Civil');
    eq('and the smallest last', unwaived[2], 'Ainsworth Hauling');
}

console.log('\n=== nothing derived is ever written to storage ===');
{
    fresh();
    var cid = engaged();
    paid(cid, 200000, 20000);
    var raw = localStorage.getItem(ProjectData.KEY);
    ['unwaived_usd', 'conditional_usd', 'committed_usd', 'certified_total', 'overcertified_usd',
     'paid_usd', 'exposure'].forEach(function (k) {
        ok('no ' + k + ' in the stored bytes', raw.indexOf('"' + k + '"') < 0);
    });
    /* A stored total would not survive Firestore's merge — it is a scalar, so one device's
       figure simply wins and the survivor disagrees with the applications underneath it. */
    ok('but the applications themselves are there', raw.indexOf('"certified_usd"') > 0);
}

console.log('\n=== a payment lands on the timeline, and the log kind fails closed ===');
{
    fresh();
    ok('payment is a registered log kind', CrmLog.KINDS.indexOf('payment') >= 0);
    var cid = engaged();
    var a = payApp(cid, 200000, 20000);
    var cert = PC.certifyPayApp(PROJ.id, a, 'R. Bagatoli');
    ok('certifying writes to the timeline', cert.logged === true);
    var pay = PC.recordPayment(PROJ.id, a, { paid_on: day(-3) });
    ok('and so does paying', pay.logged === true);
    var entries = CrmLog.forProspect('p1').filter(function (e) { return e.kind === 'payment'; });
    eq('two entries', entries.length, 2);
    /* Read through a default rather than off entries[0] directly. An empty list here is a real
       failure mode — it is what a log that silently wrote nothing produces — and indexing into
       it would throw, abandoning the run and hiding every assertion below this block. */
    var first = entries[0] || {};
    ok('naming the contractor', /Northgate Civil/.test(first.description || ''), first.description);
    eq('and carrying the net amount the renderer prints', first.amount, 180000);
}

console.log('\n=== a contractor with a payment history is not deleted with a keystroke ===');
{
    fresh();
    var cid = engaged();
    paid(cid, 200000, 20000);
    var no = PC.removeContractor(PROJ.id, cid, 'wrong firm');
    ok('removal is refused while applications exist', !no.ok);
    ok('and says why the history matters', /lien|evidence/i.test(no.err || ''), no.err);

    var spare = PC.addContractor(PROJ.id, { name: 'Delta Fencing' }).id;
    var yes = PC.removeContractor(PROJ.id, spare, 'never engaged');
    ok('one with nothing against it goes', yes.ok, yes.err);
    eq('and it leaves the register', PC.contractorsOf(proj()).length, 1);
    /* A TOMBSTONE, NOT A KEY REMOVAL. Firestore's merge cannot express a deletion, so a removed
       key returns on the next pull as though nothing happened. */
    ok('but the record is still in storage, marked',
       localStorage.getItem(ProjectData.KEY).indexOf('"deleted_reason":"never engaged"') > 0);
}

console.log('\n=== the shape is the one project-model actually stores ===');
{
    /* The rule procurement.js was caught by. Not one fixture in this file invents a project, and
       this proves the collection slots survive the owning module's normalizer as maps — and that
       the array version, which the first procurement build read, is thrown away outright. */
    ok('project-model exposes its normalizer', typeof ProjectData.normalizeProject === 'function');
    var norm = ProjectData.normalizeProject({ id: 'pr1', capacity_kw: 1000 });
    ok('contractors is created as a map', norm.contractors && typeof norm.contractors === 'object'
       && !Array.isArray(norm.contractors));
    ok('and pay_apps too', norm.pay_apps && typeof norm.pay_apps === 'object'
       && !Array.isArray(norm.pay_apps));

    norm.contractors.ct_a = { id: 'ct_a', name: 'Northgate Civil', contract_value_usd: 800000,
                              status: 'engaged' };
    norm.pay_apps.pa_a = { id: 'pa_a', contractor_id: 'ct_a', period_to: '2026-08-18',
                           certified_usd: 200000, retained_usd: 20000, status: 'paid',
                           waiver: 'none' };
    var back = ProjectData.normalizeProject(norm);
    eq('a contractor survives the round trip', PC.contractorsOf(back).length, 1);
    eq('and so does its application', PC.appsFor(back, 'ct_a').length, 1);
    eq('and the exposure is computed from it', PC.position(back, back.contractors.ct_a, NOW).unwaived_usd,
       180000);

    var arr = ProjectData.normalizeProject({ id: 'pr2', capacity_kw: 1000,
        contractors: [{ id: 'ct_a', name: 'Northgate Civil' }],
        pay_apps: [{ id: 'pa_a', contractor_id: 'ct_a', certified_usd: 1 }] });
    ok('an ARRAY in contractors is discarded, not stored', !Array.isArray(arr.contractors)
       && Object.keys(arr.contractors).length === 0);
    ok('and in pay_apps', !Array.isArray(arr.pay_apps) && Object.keys(arr.pay_apps).length === 0);
    /* Refused rather than tolerated on read, so the same mistake cannot hide in the next
       caller: storage cannot produce an array here at all. */
    eq('so the reader finds nothing rather than half a register',
       PC.contractorsOf({ contractors: [{ id: 'ct_a', name: 'x' }] }).length, 0);
    eq('same for the applications',
       PC.payAppsOf({ pay_apps: [{ id: 'pa_a', contractor_id: 'ct_a' }] }).length, 0);
}

console.log('\n=== the variations are ProjectBudget\'s answer, and null when it is not there ===');
{
    fresh();
    var cid = engaged();
    var a = payApp(cid, 900000, 0);
    PC.certifyPayApp(PROJ.id, a, 'R. Bagatoli');
    var withBudget = rowFor(cid);
    eq('with the budget module loaded the variations are a number', withBudget.variations_usd, 0);

    /* A SECOND FIRM WITH NOTHING WRONG WITH IT, because the first one is over-certified and
       unpaid and would report an actionable state either way — a fixture that cannot tell the
       two answers apart proves nothing about which one it gave. This one is paid, unconditionally
       waived and insured, so the only thing that can move its state is the missing variations. */
    var clean = PC.addContractor(PROJ.id, { name: 'Delta Fencing', contract_value_usd: 50000,
                                            insurance_expiry: day(300) }).id;
    var ca = paid(clean, 20000, 0);
    PC.recordWaiver(PROJ.id, ca, 'unconditional', { on: day(-1) });
    eq('with the budget module loaded it rests', rowFor(clean).state, 'active');

    var saved = global.ProjectBudget;
    global.ProjectBudget = undefined;
    var without = PC.position(proj(), proj().contractors[cid], NOW);
    /* NULL, NOT ZERO. A revised contract sum stated without knowing the variations is a number
       that will be believed and is wrong — and it would report a legitimately varied contract
       as over-certified. */
    eq('without it they are unknown', without.variations_usd, null);
    eq('so the committed figure is unknown too', without.committed_usd, null);
    eq('and over-certification is not claimed', without.overcertified_usd, null);
    /* The over-certified firm still reads as unpaid, and that is right: 900,000 is owed whether
       or not the variations are known, and 'unknown' sits BELOW the actionable states on
       purpose. It is the clean firm that has nowhere else to go. */
    eq('the otherwise-clean firm stops resting', rowFor(clean).state, 'unknown');
    ok('and the summary flags it once for the whole register',
       PC.exposure(proj(), NOW).variations_unknown === true);
    global.ProjectBudget = saved;
    eq('restored, the overrun is visible again', rowFor(cid).overcertified_usd, 100000);
    eq('and the clean firm rests again', rowFor(clean).state, 'active');
}

console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
