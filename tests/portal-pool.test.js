// Tests for worker-portal/pool.js — reading a hosting client's own pool account.
//
// Two things are being protected here and they pull in opposite directions.
//
// The credential. A pool key is a counterparty's credential sitting in Proton's storage. It is
// wrapped before it is written, so a KV dump alone is worth nothing, and the wrapping has to
// actually be wrapping — a fresh IV every time, and authentication that refuses a tampered blob
// rather than handing a corrupted credential to a pool.
//
// The number. Everything a client reads off the history chart about their machines comes through
// normaliseWorkers(), and the one mapping mistake that matters is collapsing "the pool did not
// hear from this machine" into "this machine did 0 TH/s". The first is unknown; the second is a
// claim. The chart draws them completely differently and only one of them is true.

var path = require('path');
var Pool = require(path.join(__dirname, '..', 'worker-portal', 'pool.js'));

var pass = 0, fail = 0;
/* JSON.stringify(Infinity) is the string "null", so a plain stringify comparison cannot tell a
   real null from a divide-by-zero. That is not hypothetical: removing the zero-hashrate guard in
   series.js makes efficiency() return Infinity, and this harness reported it as the expected null
   until the mutation run caught the harness rather than the code. Non-finite numbers are tagged
   before comparison. */
function show(v) {
    if (typeof v === 'number' && !isFinite(v)) return String(v);
    return JSON.stringify(v);
}
function eq(label, actual, expected) {
    var a = show(actual), e = show(expected);
    if (a === e) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + '\n        expected ' + e + '\n        actual   ' + a); }
}
function ok(label, cond, note) { eq(label + (note ? '  (' + note + ')' : ''), !!cond, true); }

var SECRET = 'a-test-wrapping-secret-long-enough';

(async function () {

console.log('\n=== the client credential is never stored in the clear ===');

var KEY = 'ro_live_9f2b7c41e5a84d0e';
var blob = await Pool.wrapKey(SECRET, KEY);

ok('the wrapped form does not contain the key', blob.indexOf(KEY) < 0, blob.slice(0, 24) + '...');
ok('it is versioned, so it can be rotated later', blob.indexOf('v1.') === 0);
eq('it round-trips', await Pool.unwrapKey(SECRET, blob), KEY);

/* A REPEATED IV UNDER ONE KEY BREAKS AES-GCM OUTRIGHT — not "weakens", breaks. The tempting
   optimisation is a deterministic IV derived from the site id, so re-wrapping is idempotent and
   diffs stay quiet. That is precisely the bug, so it is asserted against. */
var again = await Pool.wrapKey(SECRET, KEY);
ok('wrapping the same key twice gives different ciphertext', blob !== again);
eq('...and both still decrypt', await Pool.unwrapKey(SECRET, again), KEY);

async function refuses(label, fn) {
    var threw = false;
    try { await fn(); } catch (e) { threw = true; }
    ok(label, threw);
}
await refuses('the wrong secret cannot unwrap', function () {
    return Pool.unwrapKey(SECRET + 'x', blob);
});
/* GCM authenticates. A flipped byte has to throw, not decrypt to rubbish that then gets sent to
   a pool as a credential. */
await refuses('a tampered blob is refused, not decrypted', function () {
    var p = blob.split('.');
    p[2] = (p[2][0] === 'A' ? 'B' : 'A') + p[2].slice(1);
    return Pool.unwrapKey(SECRET, p.join('.'));
});
await refuses('a blob that is not a blob', function () { return Pool.unwrapKey(SECRET, 'nope'); });
await refuses('a missing wrapping secret is an error, not a plaintext write', function () {
    return Pool.wrapKey('', KEY);
});
await refuses('...and so is a short one', function () { return Pool.wrapKey('tooshort', KEY); });

console.log('\n=== a machine nobody heard from is not a machine at zero ===');

var raw = [
    { worker: 's21-001', hashrate: 197000, online: true },
    { worker: 's21-002', hashrate: 0, online: true },
    { worker: 's21-003', hashrate: null, online: false },
    { worker: 's21-004', online: false },
    { hashrate: 100, online: true },                    // no name at all
    { worker: 's21-006', hashrate: 'lots', online: true }
];
var norm = Pool.normaliseWorkers(raw, {
    nameField: 'worker', hashField: 'hashrate', toTh: 0.001, reportedField: 'online'
});

eq('a reporting machine converts to TH/s', norm[0], { worker: 's21-001', hashrate_th: 197, reported: true });

/* A GENUINE ZERO IS A ZERO. The pool heard from this machine and it is doing no work, which is a
   fact and must be drawn as one. This is the case that stops the rule below being implemented as
   "treat every zero as unknown". */
eq('a machine reporting zero really is zero', norm[1], { worker: 's21-002', hashrate_th: 0, reported: true });

eq('a machine the pool has not heard from is null, not zero',
   norm[2], { worker: 's21-003', hashrate_th: null, reported: false });
eq('...including when the field is simply absent',
   norm[3], { worker: 's21-004', hashrate_th: null, reported: false });

eq('a nameless row is dropped rather than charted as ""', norm.length, 5);
eq('a non-numeric hashrate does not become NaN',
   norm[4], { worker: 's21-006', hashrate_th: null, reported: true });

/* Without an explicit flag, having answered with a number IS the report. */
var noFlag = Pool.normaliseWorkers([{ w: 'a', h: 5 }, { w: 'b' }],
                                   { nameField: 'w', hashField: 'h' });
eq('with no status field, a number means reported', noFlag[0].reported, true);
eq('...and no number means not reported', noFlag[1].reported, false);

eq('rubbish in gives an empty list, not a crash', Pool.normaliseWorkers(null, {}), []);

console.log('\n=== the sample handed to series.js ===');
var s = Pool.sample('2026-03-01T00:00:00Z', norm, 1.25);
eq('the running total is carried as cumulative', s.btc_cumulative, 1.25);
/* series.js differences consecutive samples; a missing total must not read as zero earned. */
eq('an absent total is null, not zero', Pool.sample('x', [], undefined).btc_cumulative, null);
eq('...and so is a non-number', Pool.sample('x', [], 'lots').btc_cumulative, null);

console.log('\n=== an unwired provider refuses rather than guessing ===');
/* The registry ships empty on purpose. A plausible adapter written from memory reviews well and
   then reports hashrate in the wrong unit or a lifetime payout as a daily one, and the client
   believes it. Refusing is the correct behaviour until a real response has been checked. */
eq('no provider is wired yet', Pool.providers(), []);
var threw = null;
try {
    await Pool.pull('luxor', 'acct', 'key', '2026-03-01T00:00:00Z', function () {
        throw new Error('must not reach the network');
    });
} catch (e) { threw = e; }
ok('pulling from an unknown provider throws', !!threw);
eq('...with a code the caller can act on', threw && threw.code, 'unknown_provider');
ok('...and never touched the network', threw && threw.message.indexOf('must not reach') < 0);

/* The mapping itself is exercised through a registered descriptor, so that when a real provider
   is added the machinery underneath it is already known to work. */
console.log('\n=== the machinery a real provider will use ===');
Pool.PROVIDERS['__test'] = {
    label: 'Test pool',
    url: function (a) { return 'https://example.invalid/' + a; },
    headers: function (k) { return { Authorization: 'Bearer ' + k }; },
    workers: function (b) { return b.data.workers; },
    fields: { nameField: 'name', hashField: 'hs', toTh: 1e-6, reportedField: 'state',
              reportedTrue: 'ACTIVE' },
    btc: function (b) { return b.data.paid_total_btc; }
};
var seen = null;
var got = await Pool.pull('__test', 'ACC1', 'SEKRIT', '2026-03-01T06:00:00Z', function (url, opts) {
    seen = { url: url, opts: opts };
    return Promise.resolve({
        ok: true,
        json: function () {
            return Promise.resolve({ data: {
                /* hs is MH/s here, so toTh is 1e-6: 197e6 MH/s = 197 TH/s. Writing this
                   fixture wrong the first time (197e9, which lands on 197,000 TH/s for a
                   single machine) is the exact failure pool.js refuses to risk by guessing
                   at a provider's units -- and it is worth noting that nothing about
                   "197000" looks wrong until you ask what it is a measurement OF. */
                workers: [{ name: 'a', hs: 197000000, state: 'ACTIVE' },
                          { name: 'b', hs: 0, state: 'DEAD' }],
                paid_total_btc: 2.5
            } });
        }
    });
});
eq('the account goes in the url', seen.url, 'https://example.invalid/ACC1');
eq('the key goes in a header, never the url', seen.opts.headers.Authorization, 'Bearer SEKRIT');
ok('the key is not in the url', seen.url.indexOf('SEKRIT') < 0);
eq('the request is a read', seen.opts.method, 'GET');
eq('units are converted by the descriptor', got.workers[0].hashrate_th, 197);
ok('...to a figure a single machine could actually produce',
   got.workers[0].hashrate_th < 10000,
   'a wrong unit multiplier shows up as an impossible machine, not as an error');
eq('a worker the pool calls dead is unknown, not zero', got.workers[1].hashrate_th, null);
eq('the running payout total comes through', got.btc_cumulative, 2.5);

var failed = null;
try {
    await Pool.pull('__test', 'A', 'K', 'x', function () {
        return Promise.resolve({ ok: false, status: 503 });
    });
} catch (e) { failed = e; }
/* A pool that is down must raise, so the rollup records nothing for that poll. Returning an empty
   sample would write "no workers reported" and read on the chart as a site-wide outage. */
ok('a pool error raises rather than returning an empty sample', !!failed);
eq('...with its own code', failed && failed.code, 'pool_error');
delete Pool.PROVIDERS['__test'];

console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

})().catch(function (e) {
    console.log('  HARNESS ERROR ' + e.stack);
    process.exit(1);
});
