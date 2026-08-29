/* The pull guard. Backlog item 6.
 *
 * pullAll() wrote every remote document straight into localStorage with no comparison of any
 * kind — no version, no timestamp, no record count. On sign-in that is a silent overwrite, and
 * because firebase-config.js never calls enablePersistence(), anything written while offline
 * lives only in memory and is exactly what the pull destroys. A device holding twelve projects,
 * signing into an account whose cloud copy has three, ended up with three and reloaded the page
 * to show you so.
 *
 * The assertions are ranked by which wrong answer costs most, and the top two are both cases a
 * naive guard gets wrong:
 *
 *   1. SAME COUNT, DIFFERENT RECORD. Two devices each add a project offline; one signs in. The
 *      counts match, so a length comparison writes — and one project is gone. The guard has to
 *      compare ids, and this is the case that proves it does.
 *   2. AN UNREADABLE REMOTE OVER READABLE LOCAL. Writing it destroys the records twice: the
 *      bytes replace real data, then the store's own read() rejects the shape and falls back to
 *      empty. The first version of pullVerdict() treated the two directions symmetrically and
 *      would have written it.
 *
 * THE CONTAINERS ARE CHECKED AGAINST THE MODULES THAT OWN THEM, at the bottom, by creating a
 * real record through each module's own writer and asserting the guard can see it. A container
 * name invented in sync.js and never checked against the store is the foreign-fixture failure
 * again: idsIn() would return null forever, every pull would report itself unguarded, and the
 * guard would be decoration.
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

var SE = require(path.join(ROOT, 'sync.js'));
ok('sync.js can be required at all', !!SE && typeof SE.pullVerdict === 'function');

function proj(ids) {
    var by = {};
    ids.forEach(function (i) { by[i] = { id: i, name: 'Project ' + i }; });
    return { _v: 1, seq: ids.length, byProject: by };
}
function verdict(localObj, remoteObj, key) {
    return SE.pullVerdict(key || 'projects',
        localObj === null ? null : JSON.stringify(localObj), remoteObj);
}

console.log('\n=== a pull that would drop a record this device has is refused ===');
{
    var v = verdict(proj(['a', 'b', 'c']), proj(['a']));
    eq('it refuses the write', v.write, false);
    eq('naming how many would go', v.missing.length, 2);
    ok('and which', v.missing.indexOf('b') >= 0 && v.missing.indexOf('c') >= 0, JSON.stringify(v.missing));
    ok('the reason is in plain words', /missing 2 records this device already has/.test(v.reason), v.reason);
    eq('and it counted both sides', v.localCount + '/' + v.remoteCount, '3/1');
}

console.log('\n=== SAME COUNT, DIFFERENT RECORD — the case a length check writes through ===');
{
    /* Two devices, each adding one project offline, then one signs in. Three and three. A guard
       comparing counts sees no problem and overwrites; project 'c' is gone and nothing says so.
       This is the assertion the whole design turns on. */
    var v = verdict(proj(['a', 'b', 'c']), proj(['a', 'b', 'd']));
    eq('the counts are equal', v.localCount, v.remoteCount);
    eq('and it is still refused', v.write, false);
    eq('because one local record is not in the cloud copy', v.missing.join(','), 'c');
}

console.log('\n=== the pulls that SHOULD happen still happen ===');
{
    eq('an identical set writes', verdict(proj(['a', 'b']), proj(['a', 'b'])).write, true);
    /* The point of pulling at all: the cloud has records this device does not. */
    var grow = verdict(proj(['a']), proj(['a', 'b', 'c']));
    eq('a cloud copy that is a superset writes', grow.write, true);
    eq('and loses nothing', grow.missing.length, 0);
    var fresh = SE.pullVerdict('projects', null, proj(['a', 'b']));
    eq('a device with nothing stored writes', fresh.write, true);
    ok('and says why it was safe', /cannot lose anything/.test(fresh.reason), fresh.reason);
    eq('an empty local store writes', verdict(proj([]), proj(['a'])).write, true);
}

console.log('\n=== an unreadable cloud copy is not written over real records ===');
{
    /* Destroys them twice: the bytes replace real data, then the store's own read() rejects the
       shape and falls back to empty. The two directions are NOT symmetric, and the first version
       of pullVerdict() treated them as though they were. */
    var v = verdict(proj(['a', 'b']), { _v: 1, byProject: 'not an object' });
    eq('it is refused', v.write, false);
    ok('and says both halves — unreadable, and there is something to lose',
       /not in a shape this can read/.test(v.reason) && /destroy/.test(v.reason), v.reason);
    eq('but with nothing local to lose it writes', verdict(proj([]), { byProject: 'junk' }).write, true);
    /* The other direction: local unreadable is nothing to protect. The store's own read() would
       reject it anyway, so the remote can only be an improvement. */
    var badLocal = SE.pullVerdict('projects', '{not json', proj(['a']));
    eq('an unreadable LOCAL copy does not block the pull', badLocal.write, true);

    /* A RECORD WITH NO ID MAKES THE WHOLE SHAPE UNREADABLE, rather than being skipped. Skipping
       it would return a SHORTER list that still looks valid, and the guard would then compare
       incomplete sets — clearing a pull that drops the very records it could not see. Null is
       the only honest answer when part of the store cannot be identified. */
    var partial = { _v: 1, sites: [{ id: 's1' }, { name: 'no id here' }, { id: 's3' }] };
    eq('idsIn refuses a store where any record has no id',
       SE.idsIn(partial, 'sites'), null);
    var v2 = SE.pullVerdict('sites', JSON.stringify(partial), { _v: 1, sites: [{ id: 's1' }] });
    eq('so the verdict reports it unguarded rather than comparing a partial list', v2.guarded, false);
    ok('and says which side it could not read', /local copy is not in a shape/.test(v2.reason), v2.reason);
}

console.log('\n=== a store with no declared container is pulled unguarded, and says so ===');
{
    /* Guessing at a shape would produce a guard that quietly passes on stores it cannot read,
       which is the decorative-guard failure. The verdict names them instead. */
    var v = SE.pullVerdict('currency', 'USD', 'GBP');
    eq('currency writes', v.write, true);
    eq('and is honest that it was not guarded', v.guarded, false);
    ok('with a reason', /no record container declared/.test(v.reason), v.reason);
}

console.log('\n=== every guarded key is a real sync key ===');
{
    var declared = Object.keys(SE.RECORD_CONTAINER);
    ok('there are containers declared', declared.length >= 8, declared.join(', '));
    declared.forEach(function (k) {
        /* A typo here is invisible at runtime: the key never matches a document, so the store is
           silently unguarded forever. */
        ok('"' + k + '" is a key in SYNC_KEYS', !!SE.SYNC_KEYS[k]);
    });
}

console.log('\n=== the containers match the modules that actually own the data ===');
{
    /* THE FOREIGN-FIXTURE RULE. Every fixture above is built by this file, so every one of them
       agrees with sync.js about the shape. A container name invented here and never checked
       against the store would make idsIn() return null forever — every pull unguarded, the guard
       pure decoration, and nothing failing. So each store is driven through its OWN writer and
       the guard is asked whether it can see the record that was just created. */
    global.CrmConfig = require(path.join(ROOT, 'crm-config.js'));
    var mods = [
        { key: 'sites', file: 'site-model.js', make: function (M) {
            M.add(M.normalize({ id: 's1', name: 'Pinelands Park LF' })); } },
        { key: 'crmLog', file: 'crm-log.js', make: function (M) {
            M.append('note', 's1', { body: 'hello' }); } },
        /* One object, not (id, fields) — and getting it wrong stored nothing while every
           assertion about the SHAPE still looked fine, which is exactly why this block drives
           the real writers instead of hand-building the stored JSON. */
        { key: 'crmFollowups', file: 'crm-followups.js', make: function (M) {
            M.add({ prospect_id: 's1', description: 'call them', due_date: '2026-09-01' }); } },
        { key: 'contacts', file: 'crm-contacts.js', make: function (M) {
            M.add('s1', { name: 'A Person' }); } },
        { key: 'crmDocuments', file: 'crm-documents.js', make: function (M) {
            M.add('s1', { title: 'LOI' }); } },
        { key: 'projects', file: 'project-model.js', make: function (M) {
            M.promote('s1', { capacity_kw: 1000, annual_cost_of_capital_pct: 10,
                              budget_authorised_usd: 100 }); } }
    ];
    mods.forEach(function (m) {
        for (var k in _store) delete _store[k];
        var M = require(path.join(ROOT, m.file));
        if (M.reset) M.reset();
        if (m.key === 'projects') { global.SiteData = require(path.join(ROOT, 'site-model.js'));
                                    global.SiteData.reset && global.SiteData.reset();
                                    global.SiteData.add(global.SiteData.normalize({ id: 's1', name: 'X' })); }
        try { m.make(M); } catch (e) { /* reported by the assertion below */ }
        var lsKey = SE.SYNC_KEYS[m.key].lsKey;
        var raw = localStorage.getItem(lsKey);
        ok(m.key + ': its own writer stored something', !!raw, 'nothing at ' + lsKey);
        if (!raw) return;
        var ids = SE.idsIn(JSON.parse(raw), SE.RECORD_CONTAINER[m.key]);
        /* Null here means the declared container name does not match what the module writes, and
           the guard would be inert for that store — passing every pull while reporting itself
           unguarded. */
        ok(m.key + ': the declared container "' + SE.RECORD_CONTAINER[m.key] +
           '" finds the record', ids !== null && ids.length >= 1,
           'idsIn returned ' + JSON.stringify(ids) + ' from ' + raw.slice(0, 120));
        if (ids && ids.length) {
            /* And the guard end to end on a real store: the cloud copy missing that record must
               be refused. */
            var v = SE.pullVerdict(m.key, raw, JSON.parse(JSON.stringify(
                (function () { var p = JSON.parse(raw);
                    var box = p[SE.RECORD_CONTAINER[m.key]];
                    if (Array.isArray(box)) p[SE.RECORD_CONTAINER[m.key]] = [];
                    else p[SE.RECORD_CONTAINER[m.key]] = {};
                    return p; })())));
            eq(m.key + ': a cloud copy that lost the record is refused', v.write, false);
        }
    });
}

console.log('\n=== the sign-in path tells the user, rather than reloading over it ===');
{
    /* A refusal the user never sees is the same silence the guard was added to end: they reload,
       find their own data intact, and never learn the cloud copy is behind. */
    var SH = fs.readFileSync(path.join(ROOT, 'shared.js'), 'utf8');
    var block = SH.slice(SH.indexOf('window.handlePostAuth'), SH.indexOf('window.handlePostAuth') + 1600);
    ok('the callback receives the held list', /function\s*\(pulled,\s*held\)/.test(block), block.slice(0, 200));
    /* THE CONDITION, NOT JUST THE CALL. Asserting that window.alert appears in the block passes
       happily when the branch around it is `if (false)` — the alert is still in the source and
       is simply never reached. Checking the guard expression itself is what makes the assertion
       about behaviour rather than about the presence of a string. */
    ok('the alert is reached when something was held',
       /if\s*\(held\s*&&\s*held\.length\)/.test(block), block.slice(0, 400));
    ok('and it is surfaced rather than swallowed', /window\.alert/.test(block));
    ok('naming the stores that were held', /h\.key/.test(block));
    ok('and it does not push over a held store either',
       /!held \|\| !held\.length/.test(block), block);
}

console.log('');
console.log(fail ? '  ' + fail + ' FAILED, ' + pass + ' passed' : '  all ' + pass + ' passed');
process.exitCode = fail ? 1 : 0;
