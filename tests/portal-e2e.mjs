// End-to-end walk of the portal, against the real worker running in tools/dev-server.js.
//
// Everything here goes over HTTP — no module is imported and no function is called directly — so
// this exercises routing, authorization, KV, the ledger and the statement builder together.
//
// NOT named .test.mjs, deliberately: it needs a server, and the plain `node tests/*.test.js` loop
// must stay runnable with nothing else set up. Run it with:
//
//     node tools/dev-server.js          (in one shell, PORT=8090)
//     node tests/portal-e2e.mjs         (in another)
//
// Restart the server between runs. Its KV is in memory and state accumulates, so a second run
// against the same process sees the first run's seller and contract.
//
// It found a bug the unit suites could not: ingestReadings validated each reading BEFORE
// resolving the epoch, which normally arrives once on the envelope rather than on every reading.
// checkReading therefore saw epoch: undefined and refused every post. Every unit test passed
// throughout, because they hand checkReading a complete reading.

const B = 'http://localhost:8090/api';
const OPS = { 'Authorization': 'Bearer dev-ops-secret', 'Content-Type': 'application/json' };

let pass = 0, fail = 0;
function ok(label, cond, note) {
    if (cond) { pass++; console.log('  PASS  ' + label + (note ? '  (' + note + ')' : '')); }
    else { fail++; console.log('  FAIL  ' + label + (note ? '  (' + note + ')' : '')); }
}
function eq(label, a, b) { ok(label + (a === b ? '' : '  got ' + JSON.stringify(a)), a === b); }

async function call(path, opts) {
    opts = opts || {};
    const res = await fetch(B + path, {
        method: opts.method || 'GET',
        headers: opts.headers || { 'Content-Type': 'application/json' },
        body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    let body = null;
    try { body = await res.json(); } catch (e) {}
    return { status: res.status, body };
}

function devToken(sub, email, verified) {
    return Buffer.from(JSON.stringify({ sub, email, email_verified: verified !== false })).toString('base64');
}

async function sign(secret, deviceId, body, tSec) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = await crypto.subtle.sign('HMAC', key,
        new TextEncoder().encode(tSec + '.' + deviceId + '.' + body));
    const v = new Uint8Array(mac);
    let hex = '';
    for (let i = 0; i < v.length; i++) hex += ('0' + v[i].toString(16)).slice(-2);
    return 't=' + tSec + ',kid=k1,v1=' + hex;
}

const SITE = 'SITE-PW';
// A month that has ALREADY HAPPENED. The first version of this file used 2027-03, and every
// reading was refused -- correctly. checkReading rejects a device_ts more than two minutes in the
// future, because a future measurement timestamp is exactly how volume gets pushed into a period
// that is being closed right now. The guard was right and the fixture was wrong.
const MONTH_START = '2026-07-01T00:00:00.000Z';
function at(h) { return new Date(Date.parse(MONTH_START) + h * 3600000).toISOString(); }

console.log('\n=== ops sets up a counterparty ===');
const seller = await call('/admin/seller', { method: 'POST', headers: OPS,
    body: { legal_name: 'Prince William County Public Works', sites: [SITE] } });
const SEL = seller.body.seller_id;
ok('a seller exists', !!SEL, SEL);

await call('/admin/meter', { method: 'POST', headers: OPS,
    body: { meter_id: 'MTR-PW1', site_id: SITE, index_digits: 6, max_rate_per_hour: 60 } });
const dev = await call('/admin/device', { method: 'POST', headers: OPS,
    body: { device_id: 'DEV-PW1', kid: 'k1', meters: ['MTR-PW1'] } });
ok('a device is enrolled with a derived key', !!dev.body.secret);
ok('and the secret is returned once, not stored', /shown once/.test(dev.body.note || ''));
const SECRET = dev.body.secret;

const contract = await call('/admin/contract', { method: 'POST', headers: OPS, body: {
    contract_id: 'CT-PW', site_id: SITE, version: 1, status: 'executed',
    structure: '01_purchase', effective_from: '2026-01-01',
    measurement: { billing_basis: 'energy_mmbtu', heating_value_source: 'contract_deemed',
                   deemed_heating_value_btu_scf: 500 },
    terms: { price_basis: 'usd_per_mmbtu', price: 3.25, take_or_pay: null }
} });
ok('an executed contract is stored', contract.body.ok === true);
const dupe = await call('/admin/contract', { method: 'POST', headers: OPS, body: {
    contract_id: 'CT-PW', site_id: SITE, version: 1, status: 'executed', structure: '01_purchase' } });
eq('and a version cannot be overwritten', dupe.status, 409);

console.log('\n=== the meter reports ===');
// 24 hourly readings, 50 Mcf an hour. Well inside the 60/hr datasheet rate.
const readings = [];
for (let h = 0; h <= 24; h++) {
    readings.push({ seq: 1000 + h, index_corrected: 500000 + h * 50, device_ts: at(h),
                    correction_basis: 'evc_onboard', flow_status: 'flowing' });
}
const payload = JSON.stringify({ meter_id: 'MTR-PW1', epoch: 1, boot: 3, readings });
const t = Math.floor(Date.now() / 1000);
const sig = await sign(SECRET, 'DEV-PW1', payload, t);

const ingest = await fetch(B + '/telemetry/readings', {
    method: 'POST', body: payload,
    headers: { 'Content-Type': 'application/json', 'X-Proton-Device': 'DEV-PW1', 'X-Proton-Signature': sig }
});
const ing = await ingest.json();
eq('all 25 readings accepted', (ing.accepted || []).length, 25);

// A meter retries. It must be a no-op, not a double count.
const again = await fetch(B + '/telemetry/readings', {
    method: 'POST', body: payload,
    headers: { 'Content-Type': 'application/json', 'X-Proton-Device': 'DEV-PW1', 'X-Proton-Signature': sig }
});
const ag = await again.json();
eq('a full retry is all duplicates', (ag.duplicate || []).length, 25);
eq('and accepts nothing new', (ag.accepted || []).length, 0);

// An unsigned post, and one signed for another device.
const unsigned = await fetch(B + '/telemetry/readings', { method: 'POST', body: payload,
    headers: { 'Content-Type': 'application/json', 'X-Proton-Device': 'DEV-PW1' } });
eq('an unsigned post is refused', unsigned.status, 401);

console.log('\n=== ops closes and issues the period ===');
const closed = await call('/admin/close', { method: 'POST', headers: OPS, body: {
    site_id: SITE, period: '2026-07', contract_id: 'CT-PW', contract_version: 1,
    meter_id: 'MTR-PW1', start_utc: at(0), end_utc: at(24), version: 1 } });
ok('the period closes', closed.body.ok === true, JSON.stringify(closed.body).slice(0, 120));
ok('with a content hash', !!closed.body.content_hash);
ok('and a real total', closed.body.total_usd > 0, '$' + closed.body.total_usd);

// 1200 Mcf at 500 Btu/scf = 600 MMBtu, at $3.25 = $1950.
eq('the arithmetic is right', closed.body.total_usd, 1950);

console.log('\n=== before it is issued, the seller cannot see it ===');
const tok = devToken('uid-pw', 'clerk@pwcgov.org');
const inv = await call('/admin/invite', { method: 'POST', headers: OPS,
    body: { seller_id: SEL, email: 'clerk@pwcgov.org' } });
await call('/portal/redeem', { method: 'POST', body: { invite: inv.body.invite, idToken: tok } });
const login = await call('/portal/login', { method: 'POST', body: { idToken: tok } });
const SESS = login.body.session;
const AUTH = { 'Authorization': 'Bearer ' + SESS, 'Content-Type': 'application/json' };

const early = await call('/portal/statements/' + SITE + '/2026-07', { headers: AUTH });
eq('a closed-but-unissued statement is 404 to the seller', early.status, 404);
const list0 = await call('/portal/statements', { headers: AUTH });
eq('and does not appear in their list', (list0.body.statements || []).length, 0);

console.log('\n=== issued, it appears ===');
const issued = await call('/admin/issue', { method: 'POST', headers: OPS,
    body: { site_id: SITE, period: '2026-07', version: 1 } });
ok('a human issues it', issued.body.ok === true);

const list1 = await call('/portal/statements', { headers: AUTH });
eq('now it is listed', (list1.body.statements || []).length, 1);
const st = await call('/portal/statements/' + SITE + '/2026-07', { headers: AUTH });
eq('and readable', st.status, 200);
eq('with the same total', st.body.total_usd, 1950);
eq('1200 Mcf delivered', st.body.quantity.delivered_mcf, 1200);
eq('600 MMBtu of it', st.body.quantity.delivered_mmbtu, 600);
eq('fully covered', st.body.quantity.coverage.coverage_pct, 100);
eq('no gaps', st.body.quantity.gaps.length, 0);
ok('the total is not partial', st.body.total_is_partial === false);

console.log('\n=== a second seller cannot reach the first ===');
const other = await call('/admin/seller', { method: 'POST', headers: OPS,
    body: { legal_name: 'Somebody Else', sites: ['SITE-OTHER'] } });
const inv2 = await call('/admin/invite', { method: 'POST', headers: OPS,
    body: { seller_id: other.body.seller_id, email: 'x@else.com' } });
const tok2 = devToken('uid-else', 'x@else.com');
await call('/portal/redeem', { method: 'POST', body: { invite: inv2.body.invite, idToken: tok2 } });
const login2 = await call('/portal/login', { method: 'POST', body: { idToken: tok2 } });
const AUTH2 = { 'Authorization': 'Bearer ' + login2.body.session, 'Content-Type': 'application/json' };

const peek = await call('/portal/statements/' + SITE + '/2026-07', { headers: AUTH2 });
const nowhere = await call('/portal/statements/SITE-NOPE/2099-01', { headers: AUTH2 });
eq('another seller gets 404', peek.status, 404);
eq('an imaginary one gets 404', nowhere.status, 404);
eq('and the bodies are identical, so it is not an existence oracle',
   JSON.stringify(peek.body), JSON.stringify(nowhere.body));
eq('their own list is empty, not the first seller\'s', (await call('/portal/statements', { headers: AUTH2 })).body.statements.length, 0);

console.log('\n=== an invite is single use ===');
const replay = await call('/portal/redeem', { method: 'POST',
    body: { invite: inv.body.invite, idToken: devToken('uid-thief', 'clerk@pwcgov.org') } });
eq('a used invite cannot be redeemed again', replay.status, 401);

console.log('\n=== everything here is marked as a demo ===');
ok('because Firebase verification is stubbed', st.body.demo === true);

console.log('');
console.log(fail === 0 ? 'END TO END VERIFIED — ' + pass + ' checks'
                       : pass + ' passed, ' + fail + ' FAILED');
process.exit(fail === 0 ? 0 : 1);
