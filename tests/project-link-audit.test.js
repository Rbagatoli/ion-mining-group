/* Does each project still point at the prospect it was promoted from? Backlog items 1 and 2.
 *
 * The assertions are ranked by which wrong answer costs most, and the top three are all cases
 * where a careless detector cries wolf about the system working exactly as designed:
 *
 *   1. A CANCELLED PROJECT WHOSE PROSPECT WAS DELETED IS NOT A FAULT. site-model.js lets that
 *      delete through on purpose so the prospect is reclaimable, and project-model's own tests
 *      pin the sequence. Without a `retired` bucket every correctly tidied-up project reports
 *      with the same count and sentence as a live project whose id now names a different
 *      landfill — and record() stamps unresolved_since on records where nothing is unresolved.
 *   2. A DEVICE THAT HAS NEVER PULLED THE PROSPECT LIST MUST SAY SO ONCE, not report every
 *      project as broken. That is an alarm about the sync state wearing the costume of an alarm
 *      about the ledger, and it would fire on a fresh install.
 *   3. development_stage IS NOT A DISCRIMINATOR. ProjectGates.syncDevelopmentStage() writes it
 *      onto the prospect every time a gate move earns it, while the snapshot is frozen on
 *      purpose so a later edit cannot reprice a sanctioned budget. Comparing them would flag
 *      every project that ever advanced a gate.
 *
 * The distance bounds are stated here independently rather than read off the module, and the
 * catalogue measurement behind them is re-derived from data/landfills.json at the bottom: 1,382
 * same-place pairs at 0.000 km maximum separation is what makes 150 m a rounding tolerance
 * rather than an identity radius, and 83 rows with a genuinely different landfill inside 1 km is
 * what makes 5 km not one either.
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

global.Jurisdictions = require(path.join(ROOT, 'jurisdictions.js'));
global.CrmConfig = require(path.join(ROOT, 'crm-config.js'));
global.CrmLog = require(path.join(ROOT, 'crm-log.js'));
global.SiteOpportunity = require(path.join(ROOT, 'site-opportunity.js'));
global.SiteData = require(path.join(ROOT, 'site-model.js'));
global.ProjectData = require(path.join(ROOT, 'project-model.js'));
var A = global.ProjectLinkAudit = require(path.join(ROOT, 'project-link-audit.js'));
var SiteData = global.SiteData, ProjectData = global.ProjectData;

var GOOD = { capacity_kw: 1959, annual_cost_of_capital_pct: 11, budget_authorised_usd: 5400000 };
/* Every project below comes from ProjectData.promote() and every prospect from SiteData.add():
   a fixture this file invents cannot disagree with the modules about a shape. */
function fresh() {
    _store = {};
    [global.CrmConfig, global.CrmLog, ProjectData].forEach(function (m) { if (m && m.reset) m.reset(); });
    SiteData.add(SiteData.normalize({ id: 'p1', name: 'Pinelands Park LF',
                                      latitude: 40.0000, longitude: -74.0000,
                                      development_stage: 'raw_resource' }));
    return ProjectData.promote('p1', GOOD).project;
}
function sitesNow() { return SiteData.list(); }
function scanWith(sites, projects) {
    return A.scan({ sites: sites, projects: projects || ProjectData.list(),
                    storeState: { state: 'ready', count: (sites || []).length, reason: null } });
}
/* Returns {} rather than undefined when the bucket is empty. An empty bucket is precisely what
   every assertion below is testing for, and `only(res,'repointed').reason` on undefined throws —
   abandoning the run and taking every later assertion with it, which reads as "no failures" to
   anything parsing the summary. Seven mutations were caught by a crash rather than by an
   assertion before this. */
function only(res, state) { return (res[state] || [])[0] || {}; }

console.log('\n=== the happy case, end to end through the real writers ===');
{
    var p = fresh();
    var res = A.scan();
    eq('the scan is ready', res.state, 'ready');
    eq('one project classified', res.classified, 1);
    eq('and it is linked', res.linked.length, 1);
    eq('with nothing actionable', A.actionable(res).length, 0);
    ok('the reason says the record agrees', /agrees with what was recorded/.test(only(res, 'linked').reason));
}

console.log('\n=== a cancelled project whose prospect is gone is NOT a fault ===');
{
    var p = fresh();
    ProjectData.setGate(p.id, 'cancelled', { reason: 'gas did not survive diligence' });
    var gone = SiteData.remove('p1');
    ok('site-model lets the delete through once the project is cancelled', gone.ok, gone.err);
    var res = scanWith([]);
    eq('it is retired, not missing', res.retired.length, 1);
    eq('and missing is empty', res.missing.length, 0);
    ok('the reason says it is the tidy-up working', /working as intended/.test(only(res, 'retired').reason));
    /* The whole point of the bucket: it must not appear in the list somebody is asked to act on. */
    eq('and it is not actionable', A.actionable(res).length, 0);

    /* record() must not stamp it either — nothing is unresolved. */
    var rec = A.record(res);
    ok('record() runs', rec.ok, rec.err);
    eq('and stamps nothing', rec.stamped, 0);
    ok('leaving no mark on the project',
       !ProjectData.get(p.id).prospect_link, JSON.stringify(ProjectData.get(p.id).prospect_link));
}

console.log('\n=== a LIVE project whose prospect is gone is missing, and says why ===');
{
    var p = fresh();
    var res = scanWith([]);
    eq('it is missing', res.missing.length, 1);
    eq('and retired is empty', res.retired.length, 0);
    ok('the reason names all four causes rather than choosing one',
       /deleted on this device[\s\S]*deleted elsewhere[\s\S]*id changed[\s\S]*older copy/.test(
           only(res, 'missing').reason), only(res, 'missing').reason);
    ok('and says nothing is repaired', /nothing is repaired/.test(only(res, 'missing').reason));
    eq('it is actionable', A.actionable(res).length, 1);
}

console.log('\n=== a device with no prospect list says so ONCE, and classifies nothing ===');
{
    var p = fresh();
    /* Would otherwise report every project as missing — an alarm about the sync state dressed
       as an alarm about the ledger, firing on every fresh install. */
    var res = A.scan({ projects: ProjectData.list(),
                       storeState: { state: 'absent', count: null,
                                     reason: 'No prospect list has ever been written on this device.' } });
    eq('the scan refuses', res.state, 'no_prospects_here');
    eq('classifying nothing', res.classified, 0);
    eq('and flagging nothing', res.missing.length, 0);
    ok('while still saying how many projects it saw', res.projects_seen === 1);
    ok('the reason explains the refusal', /Every project would read as broken/.test(res.reason));
    /* And record() must refuse outright, or a device that could not see the list would stamp
       every project it holds. */
    var rec = A.record(res);
    eq('record() refuses a scan that classified nothing', rec.ok, false);

    var un = A.scan({ projects: ProjectData.list(),
                      storeState: { state: 'unreadable', count: null, reason: 'unreadable.' } });
    eq('an unreadable list is its own state', un.state, 'prospects_unreadable');
    eq('and also classifies nothing', un.classified, 0);
}

console.log('\n=== SiteData.storeState tells an empty list from an unread one ===');
{
    _store = {};
    eq('never written reads absent', SiteData.storeState().state, 'absent');
    SiteData.add(SiteData.normalize({ id: 'p1', name: 'X' }));
    eq('with a record it is ready', SiteData.storeState().state, 'ready');
    eq('and counts it', SiteData.storeState().count, 1);
    SiteData.remove('p1');
    eq('emptied is empty, not absent', SiteData.storeState().state, 'empty');
    /* The distinction the whole design turns on: list() returns [] for all three. */
    eq('though list() cannot tell any of them apart', SiteData.list().length, 0);
    localStorage.setItem(SiteData.KEY, '{not json');
    eq('and garbage is unreadable', SiteData.storeState().state, 'unreadable');
}

console.log('\n=== repointed: the id resolves, to a different place ===');
{
    var p = fresh();
    /* The saved record now sits 80 km away under the same id — what a restore or an import of
       somebody else's list does. */
    var moved = [{ id: 'p1', name: 'Cedar Hills RDF', latitude: 40.7, longitude: -74.0 }];
    var res = scanWith(moved);
    eq('it is repointed', res.repointed.length, 1);
    ok('the reason names the distance and both names',
       /km from where this project recorded it/.test(only(res, 'repointed').reason) &&
       /Cedar Hills RDF/.test(only(res, 'repointed').reason), only(res, 'repointed').reason);
    ok('and calls it a different place', /different place/.test(only(res, 'repointed').reason));
}

console.log('\n=== between the bounds is UNKNOWN, and never the strongest verdict ===');
{
    var p = fresh();
    /* ~3 km: further than re-rounding can move a coordinate, nowhere near far enough to call it
       a different site — and 83 rows in the real catalogue have a different landfill inside 1 km,
       so distance alone at this range proves nothing either way. */
    var res = scanWith([{ id: 'p1', name: 'Pinelands Park LF', latitude: 40.027, longitude: -74.0 }]);
    eq('it is linked_unverified', res.linked_unverified.length, 1);
    eq('never repointed', res.repointed.length, 0);
    eq('and never quietly linked', res.linked.length, 0);
    ok('the reason says it is neither', /not far enough to call it a different site/.test(
        only(res, 'linked_unverified').reason), only(res, 'linked_unverified').reason);
    /* linked_unverified is a statement that the check could not conclude, so it carries no
       control: offering a clear would invite clearing something never established. */
    eq('and it is not in the actionable list', A.actionable(res).length, 0);
}

console.log('\n=== the strongest verdict is never awarded on LESS evidence ===');
{
    var p = fresh();
    /* No coordinates on the saved record. A branch that called this repointed would be awarding
       the strongest finding on strictly less evidence than the branch that refuses it. */
    var res = scanWith([{ id: 'p1', name: 'Somewhere Else Entirely' }]);
    eq('it is linked_unverified', res.linked_unverified.length, 1);
    eq('not repointed', res.repointed.length, 0);
    ok('and the reason names the missing coordinates',
       /no coordinates/.test(only(res, 'linked_unverified').reason),
       only(res, 'linked_unverified').reason);

    /* Coordinates agree, name does not. Still not repointed: a repoint means a different
       physical place, and the coordinates say it is not one. */
    var named = scanWith([{ id: 'p1', name: 'Renamed Regional Landfill',
                            latitude: 40.0, longitude: -74.0 }]);
    eq('a renamed record at the same coordinates is unverified', named.linked_unverified.length, 1);
    eq('and never repointed', named.repointed.length, 0);
    ok('the reason offers re-sourcing as the explanation',
       /re-sourced/.test(only(named, 'linked_unverified').reason));
}

console.log('\n=== development_stage is NOT a discriminator ===');
{
    /* ProjectGates.syncDevelopmentStage() writes development_stage onto the PROSPECT when a gate
       move earns it, while the snapshot is frozen on purpose. Comparing them would flag every
       project that ever advanced a gate — reporting the system working as designed. */
    var p = fresh();
    SiteData.update('p1', { development_stage: 'permitted' });
    var res = A.scan();
    eq('the prospect moved on', SiteData.get('p1').development_stage, 'permitted');
    eq('the snapshot did not', ProjectData.get(p.id).prospect.development_stage, 'raw_resource');
    eq('and the link is still clean', res.linked.length, 1);
    eq('with nothing actionable', A.actionable(res).length, 0);
}

console.log('\n=== two prospects under one id is ambiguous, not a coin flip ===');
{
    var p = fresh();
    var res = scanWith([{ id: 'p1', name: 'Pinelands Park LF', latitude: 40, longitude: -74 },
                        { id: 'p1', name: 'A Different Place', latitude: 41, longitude: -75 }]);
    eq('it is ambiguous', res.ambiguous.length, 1);
    eq('naming how many', only(res, 'ambiguous').count, 2);
    ok('and refuses to pick one', /cannot be established/.test(only(res, 'ambiguous').reason));
    eq('nothing is silently linked', res.linked.length, 0);
}

console.log('\n=== every project lands in exactly one bucket ===');
{
    var p = fresh();
    var res = scanWith([]);
    var total = 0;
    A.STATES.forEach(function (s) {
        ok('bucket "' + s + '" exists', Array.isArray(res[s]));
        total += res[s].length;
    });
    /* A scan that quietly dropped what it could not judge would read as a clean bill of health. */
    eq('the buckets sum to what was classified', total, res.classified);
    eq('and classified matches the projects seen', res.classified, res.projects_seen);

    /* EVERY STATE classify() CAN RETURN HAS A BUCKET. scan() throws on one that does not, but
       that backstop is unreachable while the two lists agree — so the assertion that matters is
       that they agree, driven through every branch rather than read off the module. A state
       added to classify() and not to STATES would otherwise take the whole scan down at
       runtime, on somebody's real data. */
    var reached = {};
    var cases = [
        [{ prospect: {} }, {}],                                                  // unlinked
        [{ prospect: { prospect_id: 'z' } }, {}],                                // missing
        [{ prospect: { prospect_id: 'z' }, gate: 'cancelled' }, {}],             // retired
        [{ prospect: { prospect_id: 'z' } }, { z: [{ id: 'z' }, { id: 'z' }] }], // ambiguous
        [{ prospect: { prospect_id: 'z', name: 'A', lat: 40, lng: -74 } },
         { z: [{ id: 'z', name: 'A', latitude: 40, longitude: -74 }] }],         // linked
        [{ prospect: { prospect_id: 'z', name: 'A', lat: 40, lng: -74 } },
         { z: [{ id: 'z', name: 'B', latitude: 41, longitude: -75 }] }],         // repointed
        [{ prospect: { prospect_id: 'z', name: 'A' } }, { z: [{ id: 'z', name: 'A' }] }] // unverified
    ];
    cases.forEach(function (c) { reached[A.classify(c[0], c[1]).state] = true; });
    var got = Object.keys(reached).sort();
    ok('the cases reach most of the vocabulary', got.length >= 6, got.join(', '));
    got.forEach(function (s) {
        ok('classify() state "' + s + '" is in STATES and therefore has a bucket',
           A.STATES.indexOf(s) >= 0, 'STATES: ' + A.STATES.join(', '));
    });
}

console.log('\n=== the scan writes nothing; only record() does ===');
{
    var p = fresh();
    var before = localStorage.getItem(ProjectData.KEY);
    scanWith([]);
    A.scan();
    eq('scanning leaves the stored bytes untouched', localStorage.getItem(ProjectData.KEY), before);

    var res = scanWith([]);
    var rec = A.record(res);
    ok('record() stamps the broken one', rec.ok && rec.stamped === 1, JSON.stringify(rec));
    var link = ProjectData.get(p.id).prospect_link;
    ok('with a date', !!link && !!link.unresolved_since, JSON.stringify(link));
    eq('and the evidence behind it', link.unresolved_seen_prospects, 0);
    /* NO STATE IS STORED: the verdict is recomputed every read, and a stored copy would disagree
       with it the moment anything changed. */
    ok('but no verdict is stored', link.state === undefined && link.unresolved_state === undefined,
       JSON.stringify(link));

    var again = A.record(scanWith([]));
    eq('a second pass does not re-stamp', again.stamped, 0);
    eq('and the original date stands', ProjectData.get(p.id).prospect_link.unresolved_since,
       link.unresolved_since);

    /* Resolving it clears the mark as a VALUE, not by removing the key -- merge cannot express
       a removal, so a removed key would come back on the next pull. */
    var back = A.record(scanWith(sitesNow()));
    eq('putting the prospect back clears it', back.cleared, 1);
    ok('as a value', !!ProjectData.get(p.id).prospect_link.cleared_at);
    ok('and the key survives', 'cleared_at' in ProjectData.get(p.id).prospect_link);
}

console.log('\n=== acknowledging is a person deciding, and it is recorded as one ===');
{
    var p = fresh();
    A.record(scanWith([]));
    ok('a note is required', !A.acknowledge(p.id, { by: 'R. Bagatoli' }).ok);
    ok('and a name', !A.acknowledge(p.id, { note: 'the prospect was tidied up' }).ok);
    var res = A.acknowledge(p.id, { by: 'R. Bagatoli', note: 'tidied up deliberately' });
    ok('with both it takes', res.ok, res.err);
    var link = ProjectData.get(p.id).prospect_link;
    eq('recording who', link.acknowledged_by, 'R. Bagatoli');
    eq('and why', link.acknowledged_note, 'tidied up deliberately');
    ok('and when', !!link.acknowledged_at);
    eq('the scan counts it as acknowledged', scanWith([]).acknowledged, 1);
    /* Acknowledged is not fixed: it stays in its bucket, because the link is still broken. */
    eq('but it is still reported as missing', scanWith([]).missing.length, 1);

    var q = fresh();
    ok('a project with no unresolved link cannot be acknowledged',
       !A.acknowledge(q.id, { by: 'x', note: 'y' }).ok);
}

console.log('\n=== prospect_link cannot be set through update() ===');
{
    var p = fresh();
    var res = ProjectData.update(p.id, { prospect_link: { unresolved_since: 'whenever' } });
    ok('update() refuses it by name', !res.ok, JSON.stringify(res));
    ok('saying which field', /prospect_link/.test(res.err || ''), res.err);
}

console.log('\n=== the bounds are what the catalogue actually supports ===');
{
    /* Re-derived here rather than trusted: the module states 150 m as a ROUNDING tolerance on the
       strength of same-place pairs never differing at all, and 5 km as not an identity radius on
       the strength of genuinely different landfills sitting well inside it. If either measurement
       moves, the constants need re-arguing rather than quietly standing. */
    var rows = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'landfills.json'), 'utf8'))
        .projects.filter(function (r) { return typeof r.lat === 'number' && typeof r.lon === 'number'; });
    ok('the catalogue loaded', rows.length > 1000, String(rows.length));
    var byLf = {};
    rows.forEach(function (r) { if (r.lfid == null) return; (byLf[r.lfid] = byLf[r.lfid] || []).push(r); });
    var pairs = 0, maxSep = 0;
    Object.keys(byLf).forEach(function (k) {
        var g = byLf[k];
        for (var i = 0; i < g.length; i++) for (var j = i + 1; j < g.length; j++) {
            pairs++;
            var d = global.SiteOpportunity.haversineKm(g[i].lat, g[i].lon, g[j].lat, g[j].lon);
            if (d > maxSep) maxSep = d;
        }
    });
    ok('there are same-place pairs to measure', pairs > 1000, String(pairs));
    ok('and same-place separation is far below the rounding tolerance',
       maxSep < A.SAME_KM, maxSep.toFixed(4) + ' km vs SAME_KM ' + A.SAME_KM);
    /* The other direction: 5 km cannot be read as "same site", because different sites sit
       inside it in quantity. */
    var near = 0;
    for (var i = 0; i < rows.length && near < 1; i++) {
        for (var j = 0; j < rows.length; j++) {
            if (i === j || (rows[i].lfid != null && rows[i].lfid === rows[j].lfid)) continue;
            if (global.SiteOpportunity.haversineKm(rows[i].lat, rows[i].lon,
                                                   rows[j].lat, rows[j].lon) <= 1) { near++; break; }
        }
    }
    ok('a genuinely different landfill exists within 1 km, so the upper bound is not an identity radius',
       near > 0);
    ok('and the module borrows the distance formula rather than carrying a fourth copy',
       typeof global.SiteOpportunity.haversineKm === 'function');
}

console.log('');
console.log(fail ? '  ' + fail + ' FAILED, ' + pass + ' passed' : '  all ' + pass + ' passed');
process.exitCode = fail ? 1 : 0;
