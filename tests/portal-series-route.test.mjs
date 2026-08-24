// Tests for GET /portal/hosting/series and the pool plumbing behind it, against the REAL Worker.
//
// .mjs because the Worker is an ES module. worker-portal/index.mjs is imported unmodified and run
// against a KV shim, so what is exercised is the routing, the scoping and the bucket reads as they
// will actually behave — not a re-implementation of them.
//
// The route publishes a counterparty's own operational history, joined from two sources, one of
// which is reached with a credential they gave us. So the things worth asserting are: it is scoped
// to the caller's own site, it refuses an impossible range instead of inventing an empty one, it
// does not read the whole of KV to answer, and the pool key never appears anywhere a caller or a
// log can see it.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

var ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
var worker = await import('../worker-portal/index.mjs');
var Pool = (await import('../worker-portal/pool.js')).default;

var pass = 0, fail = 0;
function eq(label, actual, expected) {
    var a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a === e) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + '\n        expected ' + e + '\n        actual   ' + a); }
}
function ok(label, cond, note) { eq(label + (note ? '  (' + note + ')' : ''), !!cond, true); }

// ---- the store -------------------------------------------------------------------------------

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
            var prefix = (opts || {}).prefix || '';
            var keys = [];
            for (var k of m.keys()) if (k.indexOf(prefix) === 0) keys.push({ name: k });
            return { keys: keys };
        },
        _map: m
    };
}

var SES_H = 'ses_' + 'H'.repeat(24);
var SES_P = 'ses_' + 'P'.repeat(24);
var SES_2 = 'ses_' + '2'.repeat(24);
var WRAP = 'a-wrapping-secret-long-enough-here';

function seed() {
    var far = new Date(Date.now() + 86400000).toISOString();
    return {
        ['session:' + SES_H]: JSON.stringify({ uid: 'u1', seller_id: 'SEL-H', expires_at: far }),
        ['session:' + SES_P]: JSON.stringify({ uid: 'u2', seller_id: 'SEL-P', expires_at: far }),
        'seller:SEL-H': JSON.stringify({ seller_id: 'SEL-H', kind: 'hosting',
                                         legal_name: 'Fleet Co', sites: ['SITE-H'] }),
        // The same client, with a second facility bought later.
        'seller:SEL-2': JSON.stringify({ seller_id: 'SEL-2', kind: 'hosting',
                                         legal_name: 'Two Sites Co',
                                         sites: ['SITE-H', 'SITE-B'] }),
        ['session:' + SES_2]: JSON.stringify({ uid: 'u3', seller_id: 'SEL-2', expires_at: far }),
        'hsr:SITE-B:2026-03': JSON.stringify({
            // Only two of the three days: this site did not exist on the 1st.
            '2026-03-02': { hashrate_th: 30, uptime_pct: 50, workers_reporting: 1,
                            workers_total: 2, btc: 0.1, samples: 2 },
            '2026-03-03': { hashrate_th: 40, uptime_pct: 100, workers_reporting: 2,
                            workers_total: 2, btc: 0.2, samples: 2 }
        }),
        'hkw:SITE-B:2026-03': JSON.stringify({
            '2026-03-02': { kwh: 24, hours_covered: 12 },
            '2026-03-03': { kwh: 48, hours_covered: 24 }
        }),
        // The producer side: a month of daily gas at the landfill.
        'gas:SITE-P:2026-03': JSON.stringify({
            '2026-03-01': { mcf: 400, mmbtu: 200, btu_scf: 500, hours_covered: 24, usd: 650 },
            // 2026-03-02 absent: the meter link was down all day.
            '2026-03-03': { mcf: 180, mmbtu: 90, btu_scf: 498, hours_covered: 12, usd: 292.5 }
        }),
        'seller:SEL-P': JSON.stringify({ seller_id: 'SEL-P', kind: 'producer',
                                         legal_name: 'County A', sites: ['SITE-P'] }),

        // Two months of pool rollup and meter energy, bucketed by month as the Worker stores them.
        'hsr:SITE-H:2026-03': JSON.stringify({
            '2026-03-01': { hashrate_th: 100, uptime_pct: 100, workers_reporting: 1,
                            workers_total: 1, btc: 0.5, samples: 2 },
            '2026-03-02': { hashrate_th: 120, uptime_pct: 100, workers_reporting: 1,
                            workers_total: 1, btc: 0.6, samples: 2 }
            // 2026-03-03 deliberately absent: the pool did not answer that day.
        }),
        'hkw:SITE-H:2026-03': JSON.stringify({
            '2026-03-01': { kwh: 60, hours_covered: 24 },
            '2026-03-02': { kwh: 72, hours_covered: 24 },
            '2026-03-03': { kwh: 70, hours_covered: 24 }
        }),
        // Another client's history, which must never appear in SITE-H's answer.
        'hsr:SITE-OTHER:2026-03': JSON.stringify({
            '2026-03-01': { hashrate_th: 999999, uptime_pct: 1, btc: 42, samples: 1 }
        })
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
    return { status: res.status, body: body, raw: text, touched: touched.slice(), env: env };
}
function bearer(tok) { return { Authorization: 'Bearer ' + tok, Origin: 'http://localhost:8000' }; }

console.log('\n=== the history is scoped to the caller own site ===');
{
    var r = await call('/portal/hosting/series?from=2026-03-01&to=2026-03-03',
                       { headers: bearer(SES_H) });
    eq('a hosting client can read it', r.status, 200);
    /* The route answers per site plus a combined series, because an account is a LIST of sites.
       It used to read sites[0] and drop the rest — silently, while listStatements walked all of
       them and billed for all of them. */
    eq('one entry per site on the account', r.body.sites.length, 1);
    eq('named', r.body.sites[0].site_id, 'SITE-H');
    eq('every day in range is present', r.body.combined.length, 3);

    /* The other tenant's bucket is in the same KV under the same prefix shape. The site id comes
       from the ACCOUNT RECORD and never from the request, so there is no parameter to tamper
       with — this asserts the consequence rather than the mechanism. */
    ok('no other site was read',
       r.touched.every(function (k) { return k.indexOf('SITE-OTHER') < 0; }),
       r.touched.filter(function (k) { return k.indexOf('hsr:') === 0; }).join(' '));
    ok('and no figure from it leaked', r.raw.indexOf('999999') < 0);
}

console.log('\n=== the two sources are joined, and a gap stays a gap ===');
{
    var r = await call('/portal/hosting/series?from=2026-03-01&to=2026-03-03',
                       { headers: bearer(SES_H) });
    var p = r.body.combined;
    eq('day one has both sources', [p[0].hashrate_th, p[0].kwh], [100, 60]);
    eq('...so efficiency can be derived', p[0].efficiency_j_th, 25);

    /* The day the pool was quiet. Proton's meter is on a completely different path and kept
       recording, which is the whole reason these are two sources and not one. */
    eq('the day the pool missed is null for pool figures', p[2].hashrate_th, null);
    eq('...and null for uptime too, not zero', p[2].uptime_pct, null);
    eq('...but the meter reading is still there', p[2].kwh, 70);
    eq('...and efficiency is not invented from half the inputs', p[2].efficiency_j_th, null);

    eq('the client is told how many days each source covered',
       [r.body.sources.pool_days, r.body.sources.meter_days], [2, 3]);
}

console.log(String.fromCharCode(10) + '=== a client with two facilities ===');
{
    /* THE BUG THIS SECTION EXISTS FOR. The account record has always been a list of sites, and
       listStatements has always walked all of it — so a two-site client was billed for both.
       This route and the rigs route read sites[0] and dropped the rest, silently. The dashboard
       showed one facility's machines beside statements charging for two, and nothing said so. */
    var r2 = await call('/portal/hosting/series?from=2026-03-01&to=2026-03-03',
                        { headers: bearer(SES_2) });
    eq('both sites come back', r2.body.sites.map(function (v) { return v.site_id; }),
       ['SITE-H', 'SITE-B']);
    eq('each with its own points', r2.body.sites.map(function (v) { return v.points.length; }),
       [3, 3]);

    var c = r2.body.combined;
    eq('the combined series spans the whole range', c.length, 3);

    /* Day 1: only SITE-H existed. The combined figure is SITE-H's, and the point SAYS so rather
       than implying the fleet was that size all along. */
    eq('a day before the second site existed reports one of two',
       [c[0].sites_reporting, c[0].sites_total], [1, 2]);
    eq('...with the first site figures unchanged', c[0].hashrate_th, 100);

    // Day 2: both. 120 + 30 TH/s, and uptime is the RATIO OF THE TOTALS.
    eq('hashrate adds', c[1].hashrate_th, 150);
    eq('uptime is the ratio of the totals', c[1].uptime_pct, 66.67);
    ok('...and specifically not the mean of 100 and 50', c[1].uptime_pct !== 75);
    eq('bitcoin adds', c[1].btc, 0.7);
    eq('energy adds', c[1].kwh, 96);

    /* Efficiency is summed as WATTS, because each site's watts is its own energy over its own
       coverage. SITE-H: 72 kWh / 24 h = 3000 W. SITE-B: 24 kWh / 12 h = 2000 W. 5000 W over
       150 TH/s = 33.33 J/TH. Averaging the two J/TH figures gives 54.17, which is not a
       measurement of anything. */
    eq('efficiency is summed as watts, not averaged as J/TH', c[1].efficiency_j_th, 33.33);

    // A one-site account keeps the plain series it always had.
    var one = await call('/portal/hosting/series?from=2026-03-01&to=2026-03-03',
                         { headers: bearer(SES_H) });
    ok('a one-site account carries no combining artefacts',
       one.body.combined[0].sites_reporting === undefined);
}

console.log(String.fromCharCode(10) + '=== a producer has a history too ===');
{
    /* A producer used to get a list of frozen monthly statements and nothing between them — no
       way to see a bad week while it was still a bad week. Same route shape as the hosting one,
       different quantities, and read from Proton's own meter rather than anybody else's account. */
    var g = await call('/portal/series?from=2026-03-01&to=2026-03-03', { headers: bearer(SES_P) });
    eq('a producer can read their own history', g.status, 200);
    eq('one entry per site', g.body.sites.length, 1);
    eq('named', g.body.sites[0].site_id, 'SITE-P');
    eq('every day in range is present', g.body.combined.length, 3);

    var q = g.body.combined;
    eq('a metered day carries volume and money', [q[0].mcf, q[0].usd], [400, 650]);
    eq('...and full coverage', q[0].coverage_pct, 100);

    /* The day the meter link was down. Gas may well have flowed; nothing recorded it, so nothing
       is billed for it — and null is the only honest value. Zero would say the site produced
       nothing, which is a claim nobody made. */
    eq('an unmetered day is null, not zero', q[1].mcf, null);
    eq('...and earns nothing rather than zero dollars', q[1].usd, null);
    eq('...with no coverage figure invented for it', q[1].coverage_pct, null);

    /* Half a day metered. Coverage is the headline for a producer, because an unmetered hour is
       an unbilled hour. */
    eq('a half-metered day says so', q[2].coverage_pct, 50);
    eq('...and carries only what was measured', q[2].mcf, 180);

    eq('the client is told how many days the meter answered',
       [g.body.sources.meter_days, g.body.sources.days], [2, 3]);

    /* Scoped like everything else: the two portals cannot reach each other's route. */
    var cross = await call('/portal/series', { headers: bearer(SES_H) });
    var missing = await call('/portal/nothing-here', { headers: bearer(SES_H) });
    eq('a hosting account gets the not-found answer', cross.status, missing.status);
    eq('...byte-identical to a route that is not there', cross.raw, missing.raw);

    var hostCross = await call('/portal/hosting/series', { headers: bearer(SES_P) });
    eq('and a producer cannot reach the hosting history', hostCross.status, 404);
}

console.log('\n=== a range the caller cannot have ===');
{
    for (const [q, why] of [
        ['?from=2026-03-05&to=2026-03-01', 'backwards'],
        ['?from=2026-02-31&to=2026-03-01', 'a date that does not exist'],
        ['?from=notadate&to=2026-03-01', 'not a date'],
        ['?from=2020-01-01&to=2026-01-01', 'longer than the cap']
    ]) {
        var r = await call('/portal/hosting/series' + q, { headers: bearer(SES_H) });
        eq('refused: ' + why, r.status, 400);
    }

    /* An empty chart and a rejected request must not look the same. "You asked for something
       impossible" and "you have no history" are different answers and only one of them is about
       the account. */
    var none = await call('/portal/hosting/series?from=2025-01-01&to=2025-01-05',
                          { headers: bearer(SES_H) });
    eq('a valid range with nothing in it is 200, not 400', none.status, 200);
    eq('...with a point for every day', none.body.combined.length, 5);
    eq('...all of them empty', none.body.sources.pool_days, 0);
}

console.log('\n=== only a hosting account has a fleet history ===');
{
    var r = await call('/portal/hosting/series', { headers: bearer(SES_P) });
    /* The same 404 a path that does not exist would give, so the shape of the hosting portal
       cannot be mapped from a producer session. */
    eq('a producer gets the not-found answer', r.status, 404);
    var missing = await call('/portal/hosting/nonsense', { headers: bearer(SES_P) });
    eq('...byte-identical to a route that is not there', r.raw, missing.raw);

    var anon = await call('/portal/hosting/series');
    eq('and no session at all is refused', anon.status, 401);
}

console.log('\n=== the default range is bounded ===');
{
    /* An unbounded default looks fine against a demo account and becomes a slow endpoint the first
       time somebody has three years of history. */
    var r = await call('/portal/hosting/series', { headers: bearer(SES_H) });
    eq('no range asked for still succeeds', r.status, 200);
    eq('...and returns 90 days rather than everything', r.body.combined.length, 90);
    var months = r.touched.filter(function (k) { return k.indexOf('hsr:') === 0; });
    ok('...reading a handful of month buckets, not a key per day', months.length <= 5,
       months.length + ' bucket reads for 90 days');
}

console.log('\n=== linking a pool ===');
{
    var body = JSON.stringify({ site_id: 'SITE-H', provider: 'nope', account: 'A', api_key: 'K' });
    var noSecret = await call('/admin/pool', {
        method: 'POST', body: body,
        headers: { Authorization: 'Bearer opssecret', Origin: 'http://localhost:8000' },
        env: { OPS_SECRET: 'opssecret' }
    });
    /* Without the wrapping secret the route is CLOSED, not degraded to storing keys in the clear. */
    eq('no POOL_KEY_WRAP means the route refuses', noSecret.status, 503);

    var unknown = await call('/admin/pool', {
        method: 'POST', body: body,
        headers: { Authorization: 'Bearer opssecret', Origin: 'http://localhost:8000' },
        env: { OPS_SECRET: 'opssecret', POOL_KEY_WRAP: WRAP }
    });
    /* Refused at link time, on the desk of the person who can fix it, rather than silently
       producing a site that never gathers any history. */
    eq('an unwired provider is refused at link time', unknown.status, 400);

    var notOps = await call('/admin/pool', {
        method: 'POST', body: body,
        headers: { Origin: 'http://localhost:8000' },
        env: { OPS_SECRET: 'opssecret', POOL_KEY_WRAP: WRAP }
    });
    eq('and it is an ops route', notOps.status, 401);
}

console.log('\n=== a stored pool key is not readable from storage ===');
{
    /* Registered only for this assertion; pool.js ships with no providers precisely so that no
       unverified mapping is ever used against a real account. */
    Pool.PROVIDERS['__t'] = {
        label: 'T', url: () => 'https://example.invalid', headers: () => ({}),
        workers: (b) => b.w, fields: {}, btc: () => 0
    };
    var SECRETKEY = 'ro_live_do_not_leak_me';
    var r = await call('/admin/pool', {
        method: 'POST',
        body: JSON.stringify({ site_id: 'SITE-H', provider: '__t', account: 'ACC',
                               api_key: SECRETKEY }),
        headers: { Authorization: 'Bearer opssecret', Origin: 'http://localhost:8000' },
        env: { OPS_SECRET: 'opssecret', POOL_KEY_WRAP: WRAP }
    });
    eq('the link is accepted', r.status, 200);
    ok('the response does not echo the key', r.raw.indexOf(SECRETKEY) < 0, r.raw);

    var stored = r.env.PORTAL._map.get('pool:SITE-H');
    ok('and the stored record does not contain it either', stored.indexOf(SECRETKEY) < 0);
    ok('...it is wrapped', JSON.parse(stored).key_wrapped.indexOf('v1.') === 0);
    eq('...and unwraps back to the original',
       await Pool.unwrapKey(WRAP, JSON.parse(stored).key_wrapped), SECRETKEY);
    delete Pool.PROVIDERS['__t'];
}

console.log('\n=== the scheduled pull ===');
{
    /* A site whose pool is unreachable must not stop the others, and must record NOTHING for the
       failed poll — an empty workers array would mean "the pool answered and nobody reported",
       which is a site-wide outage, and a network error is not evidence of one. */
    var env = { PORTAL: makeKV({ 'pool:SITE-H': JSON.stringify({ provider: 'gone',
                account: 'A', key_wrapped: await Pool.wrapKey(WRAP, 'k') }) }),
                POOL_KEY_WRAP: WRAP };
    await worker.default.scheduled({}, env, {});
    var wrote = [...env.PORTAL._map.keys()].filter(k => k.indexOf('hsr:') === 0);
    eq('a failed pull writes no rollup', wrote, []);

    var noSecret = { PORTAL: makeKV({}) };
    await worker.default.scheduled({}, noSecret, {});
    ok('and with no wrapping secret it does nothing at all', noSecret.PORTAL._map.size === 0);
}

console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
