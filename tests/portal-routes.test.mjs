// Tests for worker-portal/index.mjs — the authorization matrix.
//
// This is the file that matters most. The ledger can be wrong and produce a bad number; this
// being wrong hands one counterparty another counterparty's business.
//
// It runs the REAL worker against a KV shim, the same approach tools/dev-server.js takes with
// worker-orders: worker.default.fetch(request, env) is the production code path, not a mock of
// it. The shim additionally RECORDS every key touched, which is how "no seller route reads an
// ops-only key" becomes a test rather than a promise.
//
// .mjs because the worker is an ES module. The four modules it uses are dual — module.exports for
// the node suites, globalThis for the Worker — so they are tested by the plain .test.js runner.

import { fileURLToPath } from 'url';
import path from 'path';

var ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
var worker = await import('file://' + path.join(ROOT, 'worker-portal', 'index.mjs').replace(/\\/g, '/'));
var Identity = (await import('file://' + path.join(ROOT, 'worker-portal', 'identity.js').replace(/\\/g, '/'))).default;

var pass = 0, fail = 0;
function eq(label, actual, expected) {
    if (actual === expected) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + '\n        expected ' + JSON.stringify(expected) +
                               '\n        actual   ' + JSON.stringify(actual)); }
}
function ok(label, cond, note) { eq(label + (note ? '  (' + note + ')' : ''), !!cond, true); }

// ---- the store ---------------------------------------------------------------------------------

var touched = [];
function makeKV(seed) {
    var m = new Map(Object.entries(seed || {}));
    return {
        async get(k, type) {
            touched.push(k);
            var v = m.get(k);
            if (v === undefined) return null;
            return type === 'json' ? JSON.parse(v) : v;
        },
        async put(k, v) { m.set(k, typeof v === 'string' ? v : JSON.stringify(v)); },
        async list(opts) {
            // Only MATCHING keys are recorded as touched. Real KV returns just the prefix matches
            // and the caller never learns the rest exist; recording every key this shim happens to
            // iterate would report the worker reading things it cannot see, which is the shim
            // lying about the storage rather than the worker doing anything.
            var prefix = (opts || {}).prefix || '';
            var keys = [];
            for (var k of m.keys()) {
                if (k.indexOf(prefix) === 0) { touched.push(k); keys.push({ name: k }); }
            }
            return { keys: keys };
        },
        _map: m
    };
}

var SESSION_A = 'ses_' + 'A'.repeat(24);
var SESSION_B = 'ses_' + 'B'.repeat(24);

function seed() {
    var far = new Date(Date.now() + 86400000).toISOString();
    var stA = {
        statement_id: 'ST-SITE-A-2027-03', site_id: 'SITE-A', version: 1, status: 'issued',
        issued_at: '2027-04-05T00:00:00Z', content_hash: 'abc', period: { id: '2027-03' },
        quantity: {}, charges: [], adjustments: [], subtotal_usd: 100, adjustments_usd: 0,
        total_usd: 100, total_is_partial: false, take_or_pay: null,
        basis: { unresolved: [], disclosures: [], unbillable_segments: [] },
        // The seller must never see who moved it or why. That lives in stops:.
        history: [{ status: 'issued', at: '2027-04-05T00:00:00Z', actor: 'jane@ion', note: 'internal' }]
    };
    var stDraft = JSON.parse(JSON.stringify(stA));
    stDraft.status = 'closed'; stDraft.site_id = 'SITE-A'; stDraft.period = { id: '2027-04' };

    return {
        ['session:' + SESSION_A]: JSON.stringify({ uid: 'u1', seller_id: 'SEL-A', expires_at: far }),
        ['session:' + SESSION_B]: JSON.stringify({ uid: 'u2', seller_id: 'SEL-B', expires_at: far }),
        'seller:SEL-A': JSON.stringify({ seller_id: 'SEL-A', legal_name: 'County A', sites: ['SITE-A'] }),
        'seller:SEL-B': JSON.stringify({ seller_id: 'SEL-B', legal_name: 'County B', sites: ['SITE-B'] }),
        'stx:SITE-A:2027-03': JSON.stringify({ site_id: 'SITE-A', period: '2027-03', version: 1 }),
        'st:SITE-A:2027-03:001': JSON.stringify(stA),
        // Closed but NOT issued: no stx: row, so it must be invisible.
        'st:SITE-A:2027-04:001': JSON.stringify(stDraft),
        'stx:SITE-B:2027-03': JSON.stringify({ site_id: 'SITE-B', period: '2027-03', version: 1 }),
        'st:SITE-B:2027-03:001': JSON.stringify({ ...stA, site_id: 'SITE-B' }),
        'stops:SITE-A:2027-03': JSON.stringify({ internal: 'margin notes, ops actors' }),
        'dev:DEV1': JSON.stringify({ device_id: 'DEV1', meters: ['MTR-A'], disabled: false }),
        'mtr:MTR-A': JSON.stringify({ meter_id: 'MTR-A', site_id: 'SITE-A', index_digits: 6, max_rate_per_hour: 60 })
    };
}

async function call(url, opts) {
    opts = opts || {};
    touched = [];
    var env = { PORTAL: makeKV(opts.seed || seed()), FIREBASE_PROJECT_ID: 'ion-mining' };
    if (opts.env) for (var k in opts.env) env[k] = opts.env[k];
    var req = new Request('https://portal.example' + url, {
        method: opts.method || 'GET',
        headers: opts.headers || {},
        body: opts.body
    });
    var res = await worker.default.fetch(req, env);
    var text = await res.text();
    var body = null;
    try { body = JSON.parse(text); } catch (e) {}
    return { status: res.status, body: body, raw: text, touched: touched.slice() };
}

function bearer(tok) { return { Authorization: 'Bearer ' + tok, Origin: 'http://localhost:8000' }; }

// ---- 1. default deny ----------------------------------------------------------------------------

console.log('\n=== anything not named is refused ===');
{
    eq('an unknown path is blocked', (await call('/nope')).status, 404);
    eq('so is a near-miss', (await call('/portal')).status, 404);
    eq('and a plausible admin path without auth', (await call('/admin/anything')).status, 401);
    var ping = await call('/ping');
    eq('ping is open', ping.status, 200);
    eq('and time is open, so a cold device can discipline its clock', (await call('/time')).status, 200);
}

// ---- 2. the seller tier ---------------------------------------------------------------------------

console.log('\n=== a seller route needs a session ===');
{
    var none = await call('/portal/me');
    eq('no credentials is 401', none.status, 401);
    var bogus = await call('/portal/me', { headers: bearer('ses_' + 'Z'.repeat(24)) });
    eq('an unknown session is 401', bogus.status, 401);
    eq('and the two are byte-identical, so neither confirms anything',
       none.raw, bogus.raw);

    var malformed = await call('/portal/me', { headers: bearer('not-a-session') });
    eq('a malformed token is the same 401', malformed.raw, none.raw);

    // An expired session must not work, or a 30-day TTL means nothing.
    var expired = await call('/portal/me', {
        headers: bearer(SESSION_A),
        seed: { ...seed(), ['session:' + SESSION_A]: JSON.stringify({
            uid: 'u1', seller_id: 'SEL-A', expires_at: '2020-01-01T00:00:00Z' }) }
    });
    eq('an expired session is 401', expired.status, 401);
}

console.log('\n=== a session sees exactly one seller ===');
{
    var me = await call('/portal/me', { headers: bearer(SESSION_A) });
    eq('the seller gets their own record', me.status, 200);
    eq('named correctly', me.body.legal_name, 'County A');
    eq('with only their own site', JSON.stringify(me.body.sites), JSON.stringify(['SITE-A']));

    var meB = await call('/portal/me', { headers: bearer(SESSION_B) });
    eq('a different session gets a different seller', meB.body.legal_name, 'County B');
}

console.log('\n=== a seller cannot reach another seller by guessing ===');
{
    var mine = await call('/portal/statements/SITE-A/2027-03', { headers: bearer(SESSION_A) });
    eq('their own issued statement is readable', mine.status, 200);
    eq('with the right total', mine.body.total_usd, 100);

    // SITE-B EXISTS and has an issued statement. Asking for it as seller A must be
    // indistinguishable from asking for something that does not exist at all.
    var theirs = await call('/portal/statements/SITE-B/2027-03', { headers: bearer(SESSION_A) });
    var nowhere = await call('/portal/statements/SITE-ZZ/2099-01', { headers: bearer(SESSION_A) });
    eq('another seller\'s statement is 404', theirs.status, 404);
    eq('a wholly imaginary one is also 404', nowhere.status, 404);
    ok('and the two responses are identical, so this is not an existence oracle',
       theirs.raw === nowhere.raw, JSON.stringify(theirs.raw));

    // A statement that is computed but not yet issued belongs to nobody outside Proton.
    var draft = await call('/portal/statements/SITE-A/2027-04', { headers: bearer(SESSION_A) });
    eq('a closed-but-unissued statement is invisible', draft.status, 404);
    eq('identically so', draft.raw, nowhere.raw);
}

console.log('\n=== the listing is scoped, not filtered client-side ===');
{
    var list = await call('/portal/statements', { headers: bearer(SESSION_A) });
    eq('seller A sees one statement', list.body.statements.length, 1);
    eq('and it is theirs', list.body.statements[0].site_id, 'SITE-A');
    ok('no key belonging to SITE-B was even read',
       !list.touched.some(function(k) { return k.indexOf('SITE-B') >= 0; }),
       'scoping happens before the read, not after');
}

console.log('\n=== ops-only data is structurally out of reach ===');
{
    // The whole reason stops: is a separate key rather than a field publicView() forgets.
    var routes = ['/portal/me', '/portal/statements', '/portal/statements/SITE-A/2027-03'];
    for (var r of routes) {
        var res = await call(r, { headers: bearer(SESSION_A) });
        ok('no ops key touched by ' + r,
           !res.touched.some(function(k) { return k.indexOf('stops:') === 0; }));
    }

    var st = await call('/portal/statements/SITE-A/2027-03', { headers: bearer(SESSION_A) });
    ok('the history carries status and time', st.body.history[0].status === 'issued');
    eq('but never the ops actor', st.body.history[0].actor, undefined);
    eq('nor the internal note', st.body.history[0].note, undefined);
}

// ---- 3. the ops tier ------------------------------------------------------------------------------

console.log('\n=== ops routes fail closed ===');
{
    // The single most important line in isOwner(): no secret configured means SHUT.
    var noSecret = await call('/admin/seller', { method: 'POST', headers: bearer('anything'),
                                                 body: '{}' });
    eq('with OPS_SECRET unset, ops is closed rather than open', noSecret.status, 401);

    var wrong = await call('/admin/seller', { method: 'POST', headers: bearer('wrong'),
                                              env: { OPS_SECRET: 'right' }, body: '{}' });
    eq('a wrong bearer is 401', wrong.status, 401);
    eq('and identical to the unset case', wrong.raw, noSecret.raw);

    var right = await call('/admin/seller', {
        method: 'POST', headers: { Authorization: 'Bearer right', 'Content-Type': 'application/json' },
        env: { OPS_SECRET: 'right' }, body: JSON.stringify({ legal_name: 'New County', sites: ['SITE-N'] })
    });
    eq('the right bearer works', right.status, 200);
    ok('and mints a crypto-random seller id', /^SEL-[0-9A-HJKMNP-TV-Z]{12}$/.test(right.body.seller_id),
       right.body.seller_id);
}

console.log('\n=== a seller session cannot reach ops, and vice versa ===');
{
    var sellerToOps = await call('/admin/seller', { method: 'POST', headers: bearer(SESSION_A),
                                                    env: { OPS_SECRET: 'right' }, body: '{}' });
    eq('a valid seller session is not an ops credential', sellerToOps.status, 401);

    var opsToSeller = await call('/portal/me', { headers: bearer('right'), env: { OPS_SECRET: 'right' } });
    eq('and the ops secret is not a session', opsToSeller.status, 401);
}

// ---- 4. the device tier ----------------------------------------------------------------------------

console.log('\n=== a meter cannot reach anything but ingest ===');
{
    var unsigned = await call('/telemetry/readings', {
        method: 'POST', headers: { 'X-Proton-Device': 'DEV1' },
        env: { DEVICE_ROOT_KEY: 'root' }, body: '{"meter_id":"MTR-A","readings":[]}' });
    eq('an unsigned post is refused', unsigned.status, 401);

    var noDevice = await call('/telemetry/readings', {
        method: 'POST', env: { DEVICE_ROOT_KEY: 'root' }, body: '{}' });
    eq('so is one with no device header', noDevice.status, 401);
    eq('identically', noDevice.raw, unsigned.raw);

    var unknownDev = await call('/telemetry/readings', {
        method: 'POST', headers: { 'X-Proton-Device': 'GHOST' },
        env: { DEVICE_ROOT_KEY: 'root' }, body: '{}' });
    eq('an unknown device is the same 401, not a different error', unknownDev.raw, unsigned.raw);

    // A device is not a seller and must not be able to become one.
    var devToPortal = await call('/portal/me', { headers: { 'X-Proton-Device': 'DEV1' } });
    eq('a device header is not a session', devToPortal.status, 401);
}

console.log('');
console.log(fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                       : pass + ' passed, ' + fail + ' FAILED');
process.exit(fail === 0 ? 0 : 1);
