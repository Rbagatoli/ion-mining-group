// Two counterparty kinds behind one door.
//
// A PRODUCER sells Proton gas and is owed money for it. A HOSTING client has machines on Proton's power
// and owes money for it. They sign in at the same URL and see different portals, and this file is
// about the one thing that makes that safe: WHICH portal an account sees is decided by the server
// from the stored account record, and nothing in the request contributes to it.
//
// The browser is TOLD its kind by /portal/me so it knows what to render. It cannot assert one.
//
// These run the real Worker — worker-portal/index.mjs, unmodified — against a KV shim, so what is
// tested is the code that would be deployed rather than a description of it.

import assert from 'node:assert';

var pass = 0, fail = 0;
function ok(label, cond, note) {
    if (cond) { pass++; console.log('  PASS  ' + label + (note ? '  (' + note + ')' : '')); }
    else { fail++; console.log('  FAIL  ' + label + (note ? '  (' + note + ')' : '')); }
}
function eq(label, a, b) { ok(label, a === b, JSON.stringify(a) + ' vs ' + JSON.stringify(b)); }

// ---- a KV shim, only as clever as the routes need -------------------------------------------
function kv(seed) {
    var m = new Map();
    Object.keys(seed || {}).forEach(function(k) { m.set(k, JSON.stringify(seed[k])); });
    return {
        _m: m,
        async get(k, type) {
            var v = m.get(k);
            if (v === undefined) return null;
            return type === 'json' ? JSON.parse(v) : v;
        },
        async put(k, v) { m.set(k, typeof v === 'string' ? v : JSON.stringify(v)); },
        async delete(k) { m.delete(k); },
        async list(opts) {
            var pre = (opts && opts.prefix) || '';
            var keys = [];
            m.forEach(function(_, k) { if (k.indexOf(pre) === 0) keys.push({ name: k }); });
            return { keys: keys };
        }
    };
}

// Must satisfy Identity.SESSION_SHAPE: /^ses_[0-9A-HJKMNP-TV-Z]{24}$/
var TOK = {
    producer: 'ses_PPPPPPPPPPPPPPPPPPPPPPPP',
    hosting:  'ses_HHHHHHHHHHHHHHHHHHHHHHHH',
    nokind:   'ses_KKKKKKKKKKKKKKKKKKKKKKKK'
};
var FUTURE = new Date(Date.now() + 86400000).toISOString();

function world() {
    return kv({
        'seller:ACC-P': { seller_id: 'ACC-P', kind: 'producer',
                          legal_name: 'PRODUCER CO', sites: ['SITE-P'] },
        'seller:ACC-H': { seller_id: 'ACC-H', kind: 'hosting',
                          legal_name: 'HOSTING CO', sites: ['SITE-H'] },
        // An account minted before kinds existed, or by a hand that forgot.
        'seller:ACC-X': { seller_id: 'ACC-X', legal_name: 'UNKNOWN CO', sites: ['SITE-X'] },

        ['session:' + TOK.producer]: { seller_id: 'ACC-P', expires_at: FUTURE },
        ['session:' + TOK.hosting]:  { seller_id: 'ACC-H', expires_at: FUTURE },
        ['session:' + TOK.nokind]:   { seller_id: 'ACC-X', expires_at: FUTURE },

        // One issued document on each side, in their separate key families.
        'stx:SITE-P:2026-05': { site_id: 'SITE-P', period: '2026-05', version: 1 },
        'st:SITE-P:2026-05:001': { statement_id: 'ST-1', site_id: 'SITE-P', version: 1,
                                   status: 'issued', period: { id: '2026-05' }, total_usd: 100 },
        'htx:SITE-H:2026-05': { site_id: 'SITE-H', period: '2026-05', version: 1 },
        'hst:SITE-H:2026-05:001': { statement_id: 'HS-1', site_id: 'SITE-H', version: 1,
                                    status: 'issued', period: { id: '2026-05' }, total_usd: 200,
                                    draw: { kwh: 1000 },
                                    machines: [{ worker: 'w1', kwh: 500, uptime_pct: 99,
                                                 hashrate_th: 100, last_seen: FUTURE,
                                                 serial: 'SECRET-SERIAL' }] }
    });
}

var worker = (await import('../worker-portal/index.mjs')).default;

async function call(env, path, tok) {
    var headers = {};
    if (tok) headers.Authorization = 'Bearer ' + tok;
    var res = await worker.fetch(new Request('https://x.workers.dev' + path, { headers: headers }), env);
    var body = null;
    try { body = await res.json(); } catch (e) {}
    return { status: res.status, body: body };
}

console.log('\n=== the server decides which portal an account sees ===');
{
    var env = { PORTAL: world() };

    var mp = await call(env, '/portal/me', TOK.producer);
    eq('a producer is told it is a producer', mp.body && mp.body.kind, 'producer');
    var mh = await call(env, '/portal/me', TOK.hosting);
    eq('a hosting account is told it is hosting', mh.body && mh.body.kind, 'hosting');

    /* No default. An account whose kind is missing gets no portal rather than
       falling back to producer — a silent default is how a hosting client ends
       up looking at somebody's gas statements. */
    var mx = await call(env, '/portal/me', TOK.nokind);
    ok('an account with no kind gets no portal', mx.status !== 200, 'status ' + mx.status);
    var lx = await call(env, '/portal/statements', TOK.nokind);
    ok('and cannot reach a portal route either', lx.status !== 200, 'status ' + lx.status);
}

console.log('\n=== neither kind can reach the other kind\'s routes ===');
{
    var env2 = { PORTAL: world() };

    var pl = await call(env2, '/portal/statements', TOK.producer);
    eq('a producer can list its own statements', pl.status, 200);
    ok('and gets one', pl.body && pl.body.statements && pl.body.statements.length === 1);

    var hl = await call(env2, '/portal/hosting/statements', TOK.hosting);
    eq('a hosting account can list its own', hl.status, 200);
    ok('and gets one', hl.body && hl.body.statements && hl.body.statements.length === 1);

    /* THE ASSERTION THIS FILE EXISTS FOR. The refusal for the other kind's path
       must be the SAME answer as for a path that does not exist at all — not a
       403, not a different message — or the shape of the other portal can be
       mapped from this one. */
    var cross1 = await call(env2, '/portal/hosting/statements', TOK.producer);
    var cross2 = await call(env2, '/portal/statements', TOK.hosting);
    var nonsense = await call(env2, '/portal/nothing-here', TOK.producer);
    eq('a producer asking a hosting route is refused', cross1.status, nonsense.status);
    eq('a hosting account asking a producer route is refused', cross2.status, nonsense.status);
    eq('and the refusal body is identical to an unknown path',
       JSON.stringify(cross1.body), JSON.stringify(nonsense.body));
    eq('both ways', JSON.stringify(cross2.body), JSON.stringify(nonsense.body));

    // Down to the document, not just the list.
    var d1 = await call(env2, '/portal/hosting/statements/SITE-H/2026-05', TOK.producer);
    eq('nor the other kind\'s document', d1.status, nonsense.status);
    var d2 = await call(env2, '/portal/statements/SITE-P/2026-05', TOK.hosting);
    eq('in either direction', d2.status, nonsense.status);
}

console.log('\n=== a hosting statement publishes only what it should ===');
{
    var env3 = { PORTAL: world() };
    var doc = await call(env3, '/portal/hosting/statements/SITE-H/2026-05', TOK.hosting);
    eq('the client can read its own', doc.status, 200);
    ok('it carries the per-machine figures hosting.html promises',
       doc.body && doc.body.machines && doc.body.machines.length === 1 &&
       doc.body.machines[0].kwh === 500 && doc.body.machines[0].uptime_pct === 99 &&
       doc.body.machines[0].hashrate_th === 100);
    /* hostingView is a whitelist, like sellerView, so a field added to the stored
       document upstream is not published to a counterparty by accident. */
    ok('and nothing the whitelist did not name',
       doc.body.machines[0].serial === undefined,
       'the stored record carried a serial; the published one must not');
}

console.log('\n=== creating an account without a kind is refused ===');
{
    var env4 = { PORTAL: world(), OPS_SECRET: 'sekrit-ops-value-for-the-test' };
    async function mint(payload) {
        var res = await worker.fetch(new Request('https://x.workers.dev/admin/seller', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + env4.OPS_SECRET, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }), env4);
        return res.status;
    }
    eq('no kind is a bad request', await mint({ legal_name: 'X', sites: [] }), 400);
    eq('an unknown kind is too', await mint({ kind: 'operator', legal_name: 'X', sites: [] }), 400);
    eq('producer is accepted', await mint({ kind: 'producer', legal_name: 'X', sites: [] }), 200);
    eq('hosting is accepted', await mint({ kind: 'hosting', legal_name: 'X', sites: [] }), 200);
}


console.log('\n=== the live fleet is scoped and whitelisted like everything else ===');
{
    var envR = { PORTAL: world() };
    await envR.PORTAL.put('rigs:SITE-H', JSON.stringify({
        site_id: 'SITE-H', as_of: FUTURE,
        summary: { machines: 2, online: 1, hashrate_th: 200, draw_kw: 30, uptime_pct_30d: 98 },
        rigs: [{ worker: 'w1', hashrate_th: 100, hashrate_24h_th: 101,
                 last_seen: FUTURE, reported: 'online',
                 // Things a counterparty must never receive.
                 ip: '10.0.0.5', serial: 'SN-123', pool_password: 'x' }]
    }));

    var r = await call(envR, '/portal/hosting/rigs', TOK.hosting);
    eq('a hosting client can see its own fleet', r.status, 200);
    /* ONE ENTRY PER SITE. The account record is a list, and this route used to read sites[0]
       and drop the rest — silently, while listStatements walked all of them and the client was
       billed for all of them. The whitelist assertions below are unchanged and still the point:
       what a counterparty receives per machine has not widened. */
    eq('one entry per site on the account', r.body.sites.length, 1);
    eq('named', r.body.sites[0].site_id, 'SITE-H');
    ok('and a combined summary alongside them', !!r.body.summary);

    var rigs0 = r.body.sites[0].rigs;
    eq('with its machines', rigs0.length, 1);
    ok('the pool-reported flag is passed through as REPORTED, not as status',
       rigs0[0].reported === 'online' && rigs0[0].status === undefined,
       'naming it status invites the client to render it directly');
    ['ip', 'serial', 'pool_password'].forEach(function(f) {
        ok('and no ' + f, rigs0[0][f] === undefined);
    });

    var nonsense2 = await call(envR, '/portal/nothing-here', TOK.hosting);
    eq('a producer cannot see a fleet',
       (await call(envR, '/portal/hosting/rigs', TOK.producer)).status, nonsense2.status);
    eq('nor an account with no kind',
       (await call(envR, '/portal/hosting/rigs', TOK.nokind)).status, 401);
}

console.log('');
console.log(fail ? fail + ' FAILED' : 'ALL PASS — ' + pass + ' assertions');
process.exitCode = fail ? 1 : 0;
assert.ok(true);
