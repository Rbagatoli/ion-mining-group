/* Guards taking the money.

   Stage 1's rule was that the browser does not price the order. This file's rule
   is the same shape and higher stakes: THE BROWSER DOES NOT DECIDE WHAT WAS
   PAID. The page may ask; only Strike may answer. Everything below is an attempt
   to get an order marked paid without paying, or to pay less than it costs.

   Strike itself is stubbed. The wire format is the one thing here that a test
   cannot settle — see worker-orders/strike.js — but every decision made AROUND
   the call is settled here. */
/* Repo-relative, so this runs wherever the checkout is. Was an absolute
   c:/Users/rbaga/... path that worked on one machine. */
const REPO_ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = REPO_ROOT + '';
const W = ROOT + 'worker-orders/';

let fail = 0;
function ok(cond, label, detail) {
    console.log((cond ? '  ok    ' : '  FAIL  ') + label + (cond ? '' : '   ' + (detail || '')));
    if (!cond) fail++;
}

/* ---- a Strike that does what we tell it ---- */

const strike = {
    invoices: new Map(),
    calls: [],
    nextId: 1,
    fail: { create: false, quote: false, get: false, onchain: false },
    reset() {
        this.invoices.clear(); this.calls = []; this.nextId = 1;
        this.fail = { create: false, quote: false, get: false, onchain: false };
    },
    settle(id) { const i = this.invoices.get(id); if (i) i.state = 'PAID'; },
    expire(id) { const i = this.invoices.get(id); if (i) i.state = 'EXPIRED'; }
};

globalThis.fetch = async (url, opts) => {
    const u = String(url);
    const method = (opts && opts.method) || 'GET';
    const body = opts && opts.body ? JSON.parse(opts.body) : null;
    strike.calls.push({ method, url: u, body });

    const json = (o, status = 200) => new Response(JSON.stringify(o), {
        status, headers: { 'Content-Type': 'application/json' }
    });

    if (method === 'POST' && u.endsWith('/v1/invoices')) {
        if (strike.fail.create) return json({ data: 'nope' }, 500);
        const id = 'inv_' + (strike.nextId++);
        strike.invoices.set(id, {
            invoiceId: id, state: 'UNPAID',
            amount: body.amount, description: body.description,
            correlationId: body.correlationId
        });
        return json({ invoiceId: id, state: 'UNPAID' });
    }
    let m = /\/v1\/invoices\/([^/]+)\/quote$/.exec(u);
    if (m && method === 'POST') {
        if (strike.fail.quote) return json({ data: 'nope' }, 500);
        return json({ lnInvoice: 'lnbc_' + m[1], expirationInSec: 3600,
                      sourceAmount: { amount: '0.15', currency: 'BTC' } });
    }
    m = /\/v1\/invoices\/([^/]+)$/.exec(u);
    if (m && method === 'GET') {
        if (strike.fail.get) return json({ data: 'nope' }, 500);
        const inv = strike.invoices.get(m[1]);
        return inv ? json(inv) : json({ data: 'not found' }, 404);
    }
    if (method === 'POST' && u.endsWith('/v1/receive-requests')) {
        if (strike.fail.onchain) return json({ data: 'nope' }, 500);
        return json({ onchain: { address: 'bc1qtestaddress' + strike.nextId } });
    }
    return json({ data: 'unhandled ' + method + ' ' + u }, 404);
};

const worker = await import('file:///' + W + 'index.js');
const strikeModule = await import('file:///' + W + 'strike.js');
const catalogue = await import('file:///' + W + 'catalogue.js');
const T = worker.__test;

/* ---- harness ---- */

function kv() {
    const box = new Map();
    return {
        box,
        async get(k, type) {
            const v = box.has(k) ? box.get(k) : null;
            return v === null ? null : (type === 'json' ? JSON.parse(v) : v);
        },
        async put(k, v) { box.set(k, String(v)); },
        async list({ prefix, limit }) {
            const keys = [...box.keys()].filter(k => k.startsWith(prefix)).sort().slice(0, limit || 1000);
            return { keys: keys.map(name => ({ name })) };
        }
    };
}

const ORIGIN = 'https://protonminingco.com';
const OPS = { Authorization: 'Bearer test-ops-secret' };

async function call(env, method, urlPath, body, headers) {
    const req = new Request('https://orders.example' + urlPath, {
        method,
        headers: Object.assign({ Origin: ORIGIN, 'Content-Type': 'application/json' }, headers || {}),
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const res = await worker.default.fetch(req, env);
    let json = null;
    try { json = JSON.parse(await res.text()); } catch (e) {}
    return { status: res.status, body: json };
}

function newEnv(extra) {
    return Object.assign({ ORDERS: kv(), OPS_SECRET: 'test-ops-secret',
                           STRIKE_API_KEY: 'sk_test' }, extra || {});
}

const GOOD = {
    lines: [{ model: 'Antminer S21 XP', qty: 6 }, { model: 'Whatsminer M66S+', qty: 3 }],
    destination: { kind: 'ion' },
    contact: { email: 'buyer@example.com', name: 'A Buyer' }
};
const USD = 52560, DEPOSIT = 13140, BALANCE = 39420;

/* Place an order and walk it to `quoted`, which is where a deposit becomes
   payable. */
async function placed(env, upTo) {
    const r = await call(env, 'POST', '/orders', GOOD);
    const ref = r.body.reference;
    for (const step of T.FLOW.slice(1)) {
        if (step === upTo) { await call(env, 'POST', '/orders/' + ref + '/status', { status: step }, OPS); break; }
        await call(env, 'POST', '/orders/' + ref + '/status', { status: step }, OPS);
    }
    return ref;
}

/* ---- the amount is the order's, not the request's ---- */

{
    const env = newEnv(); strike.reset();
    const ref = await placed(env, 'quoted');

    const r = await call(env, 'POST', '/orders/' + ref + '/pay', { leg: 'deposit' });
    ok(r.status === 201, 'a quoted order can be invoiced for its deposit', 'status ' + r.status);
    ok(r.body.amount === DEPOSIT, 'and the invoice is for ' + DEPOSIT, String(r.body.amount));
    ok(!!r.body.invoiceId, 'and it has a Strike invoice', JSON.stringify(r.body));
    ok(!!r.body.onchainAddress, 'and an on-chain address to pay it to', r.body.onchainAddress);
    ok(!!(r.body.quote && r.body.quote.bolt11), 'and a Lightning quote as well',
       JSON.stringify(r.body.quote));

    const sent = strike.calls.filter(c => c.url.endsWith('/v1/invoices') && c.method === 'POST')[0];
    ok(sent && sent.body.amount.amount === '13140.00' && sent.body.amount.currency === 'USD',
       'and Strike was asked for that amount in USD, not in bitcoin',
       sent ? JSON.stringify(sent.body.amount) : 'no call');
}

/* Every way a customer might name their own price. */
for (const [label, body] of [
    ['an amount of its own', { leg: 'deposit', amount: 1 }],
    ['a total of its own', { leg: 'deposit', usd: 1, total: 1 }],
    ['a deposit of its own', { leg: 'deposit', deposit: 1 }],
    ['a zero amount', { leg: 'deposit', amount: 0 }],
    ['a negative amount', { leg: 'deposit', amount: -13140 }]
]) {
    const env = newEnv(); strike.reset();
    const ref = await placed(env, 'quoted');
    const r = await call(env, 'POST', '/orders/' + ref + '/pay', body);
    ok(r.status === 201 && r.body.amount === DEPOSIT,
       'an invoice requested with ' + label + ' is still for ' + DEPOSIT,
       r.status + ' ' + (r.body && r.body.amount));
}

/* ---- paying in full, and the balance ---- */

{
    const env = newEnv(); strike.reset();
    const ref = await placed(env, 'quoted');
    const r = await call(env, 'POST', '/orders/' + ref + '/pay', { leg: 'full' });
    ok(r.status === 201 && r.body.amount === USD,
       'paying in full is invoiced for the whole order', String(r.body && r.body.amount));
}

{
    const env = newEnv(); strike.reset();
    const ref = await placed(env, 'po_placed');
    const r = await call(env, 'POST', '/orders/' + ref + '/pay', { leg: 'balance' });
    ok(r.status === 201 && r.body.amount === BALANCE,
       'the balance leg is invoiced for the balance', String(r.body && r.body.amount));
}

{
    const env = newEnv(); strike.reset();
    const ref = await placed(env, 'quoted');
    const r = await call(env, 'POST', '/orders/' + ref + '/pay', { leg: 'donation' });
    ok(r.status === 400, 'an invented payment leg is refused', 'status ' + r.status);
}

/* ---- asking twice does not mint twice ---- */

{
    const env = newEnv(); strike.reset();
    const ref = await placed(env, 'quoted');
    const first = await call(env, 'POST', '/orders/' + ref + '/pay', { leg: 'deposit' });
    const second = await call(env, 'POST', '/orders/' + ref + '/pay', { leg: 'deposit' });

    ok(second.status === 200 && second.body.reused === true,
       'asking for the same invoice twice reuses it', JSON.stringify(second.body));
    ok(second.body.invoiceId === first.body.invoiceId,
       'and it is the same invoice', second.body.invoiceId + ' vs ' + first.body.invoiceId);
    const created = strike.calls.filter(c => c.method === 'POST' && c.url.endsWith('/v1/invoices'));
    ok(created.length === 1, 'so Strike was only asked to create one', String(created.length));
    ok(!!(second.body.quote && second.body.quote.bolt11),
       'but the quote is refreshed, because quotes expire and orders take days');
}

/* ---- THE POINT: the browser cannot declare itself paid ---- */

{
    const env = newEnv(); strike.reset();
    const ref = await placed(env, 'quoted');
    await call(env, 'POST', '/orders/' + ref + '/pay', { leg: 'deposit' });

    /* The route takes no body at all, but try anyway — every shape a forged
       "I paid" could take. */
    for (const [label, qs] of [
        ['nothing', ''],
        ['state=PAID in the query', '&state=PAID'],
        ['status=PAID in the query', '&status=PAID'],
        ['paid=true in the query', '&paid=true'],
        ['settled=1 in the query', '&settled=1']
    ]) {
        const r = await call(env, 'GET', '/orders/' + ref + '/payment?leg=deposit' + qs);
        ok(r.body.state === 'UNPAID',
           'an unpaid order asked with ' + label + ' is UNPAID', JSON.stringify(r.body));
    }

    /* And a POST body claiming payment cannot even reach it. */
    const forced = await call(env, 'POST', '/orders/' + ref + '/payment', { state: 'PAID' });
    ok(forced.status === 404, 'and payment status cannot be POSTed at all', 'status ' + forced.status);

    const after = await call(env, 'GET', '/orders/' + ref);
    ok(after.body.status === 'deposit_invoiced',
       'so the order is still only invoiced', after.body.status);
}

/* Now let Strike say it was paid. */
{
    const env = newEnv(); strike.reset();
    const ref = await placed(env, 'quoted');
    const inv = await call(env, 'POST', '/orders/' + ref + '/pay', { leg: 'deposit' });

    let r = await call(env, 'GET', '/orders/' + ref + '/payment?leg=deposit');
    ok(r.body.state === 'UNPAID', 'before settlement the deposit is unpaid', r.body.state);

    strike.settle(inv.body.invoiceId);

    r = await call(env, 'GET', '/orders/' + ref + '/payment?leg=deposit');
    ok(r.body.state === 'PAID', 'once Strike settles it, it is paid', JSON.stringify(r.body));
    ok(r.body.status === 'deposit_paid', 'and the order advances', r.body.status);

    const view = await call(env, 'GET', '/orders/' + ref);
    ok(view.body.status === 'deposit_paid', 'durably, not just in that response', view.body.status);
    const settledStep = (view.body.history || []).filter(h => h.status === 'deposit_paid')[0];
    ok(!!settledStep, 'and the settlement is in the order history');
}

/* A Strike outage must not read as payment, and must not read as failure
   either — the customer may have paid a second ago. */
{
    const env = newEnv(); strike.reset();
    const ref = await placed(env, 'quoted');
    await call(env, 'POST', '/orders/' + ref + '/pay', { leg: 'deposit' });
    strike.fail.get = true;
    const r = await call(env, 'GET', '/orders/' + ref + '/payment?leg=deposit');
    ok(r.body.state === 'UNKNOWN', 'a Strike outage reports UNKNOWN, never PAID', JSON.stringify(r.body));
    const view = await call(env, 'GET', '/orders/' + ref);
    ok(view.body.status === 'deposit_invoiced', 'and does not advance the order', view.body.status);
}

/* An expired quote is not a failure to pay — the invoice is still owed. */
{
    const env = newEnv(); strike.reset();
    const ref = await placed(env, 'quoted');
    const inv = await call(env, 'POST', '/orders/' + ref + '/pay', { leg: 'deposit' });
    strike.expire(inv.body.invoiceId);
    const r = await call(env, 'GET', '/orders/' + ref + '/payment?leg=deposit');
    ok(r.body.state === 'EXPIRED', 'an expired invoice says so', JSON.stringify(r.body));
    ok(r.body.amount === DEPOSIT, 'and still names what is owed', String(r.body.amount));
}

/* ---- settling twice ---- */

{
    const env = newEnv(); strike.reset();
    const ref = await placed(env, 'quoted');
    const inv = await call(env, 'POST', '/orders/' + ref + '/pay', { leg: 'deposit' });
    strike.settle(inv.body.invoiceId);
    await call(env, 'GET', '/orders/' + ref + '/payment?leg=deposit');
    const again = await call(env, 'GET', '/orders/' + ref + '/payment?leg=deposit');
    ok(again.body.state === 'PAID' && again.body.status === 'deposit_paid',
       'polling a settled payment repeatedly is stable', JSON.stringify(again.body));
    const view = await call(env, 'GET', '/orders/' + ref);
    const advances = (view.body.history || []).filter(h => h.status === 'deposit_paid');
    ok(advances.length === 1, 'and does not advance the order twice', String(advances.length));

    const retry = await call(env, 'POST', '/orders/' + ref + '/pay', { leg: 'deposit' });
    ok(retry.status === 409, 'nor can a paid leg be re-invoiced', 'status ' + retry.status);
}

/* ---- an unconfigured or broken Strike ---- */

{
    const env = { ORDERS: kv(), OPS_SECRET: 'test-ops-secret' };   /* no STRIKE_API_KEY */
    strike.reset();
    const ref = await placed(env, 'quoted');
    const r = await call(env, 'POST', '/orders/' + ref + '/pay', { leg: 'deposit' });
    ok(r.status === 503, 'with no Strike key configured, payment is refused, not faked',
       'status ' + r.status);
    ok(!/PAID/.test(JSON.stringify(r.body)), 'and nothing suggests it was paid');
}

{
    const env = newEnv(); strike.reset();
    strike.fail.create = true;
    const ref = await placed(env, 'quoted');
    const r = await call(env, 'POST', '/orders/' + ref + '/pay', { leg: 'deposit' });
    ok(r.status === 502, 'a Strike failure to raise an invoice is a 502', 'status ' + r.status);
    const view = await call(env, 'GET', '/orders/' + ref);
    ok(view.body.status === 'quoted', 'and the order does not claim to be invoiced', view.body.status);
}

/* On-chain can fail while Lightning works. That should degrade, not abort: the
   customer still has a payable invoice. */
{
    const env = newEnv(); strike.reset();
    strike.fail.onchain = true;
    const ref = await placed(env, 'quoted');
    const r = await call(env, 'POST', '/orders/' + ref + '/pay', { leg: 'deposit' });
    ok(r.status === 201, 'an on-chain failure still leaves a payable invoice', 'status ' + r.status);
    ok(r.body.onchainAddress === '', 'with no address rather than a wrong one',
       JSON.stringify(r.body.onchainAddress));
    ok(!!(r.body.quote && r.body.quote.bolt11), 'and Lightning still offered');
}

/* ---- a cancelled order takes no money ---- */

{
    const env = newEnv(); strike.reset();
    const ref = await placed(env, 'quoted');
    await call(env, 'POST', '/orders/' + ref + '/status', { status: 'cancelled' }, OPS);
    const r = await call(env, 'POST', '/orders/' + ref + '/pay', { leg: 'deposit' });
    ok(r.status === 409, 'a cancelled order cannot be invoiced', 'status ' + r.status);
}

/* An order cancelled AFTER being invoiced must not be dragged forward by a late
   settlement — but the money did arrive, so it must not be silently swallowed
   either. It reports paid; the order stays cancelled for a human to sort out. */
{
    const env = newEnv(); strike.reset();
    const ref = await placed(env, 'quoted');
    const inv = await call(env, 'POST', '/orders/' + ref + '/pay', { leg: 'deposit' });
    await call(env, 'POST', '/orders/' + ref + '/status', { status: 'cancelled' }, OPS);
    strike.settle(inv.body.invoiceId);
    const r = await call(env, 'GET', '/orders/' + ref + '/payment?leg=deposit');
    ok(r.body.state === 'PAID', 'a late payment on a cancelled order is still reported paid',
       JSON.stringify(r.body));
    ok(r.body.status === 'cancelled', 'but does not un-cancel the order', r.body.status);
}

/* ---- an order nobody has quoted yet ---- */

{
    const env = newEnv(); strike.reset();
    const r0 = await call(env, 'POST', '/orders', GOOD);
    const r = await call(env, 'POST', '/orders/' + r0.body.reference + '/pay', { leg: 'deposit' });
    ok(r.status === 201, 'a deposit can be raised before the order is formally quoted',
       'status ' + r.status);
    ok(r.body.amount === DEPOSIT, 'for the indicative deposit', String(r.body.amount));
    const view = await call(env, 'GET', '/orders/' + r0.body.reference);
    ok(view.body.status === 'quote_requested',
       'and the status does not skip ahead to invoiced', view.body.status);
}

/* ---- origin, and unknown references ---- */

{
    const env = newEnv(); strike.reset();
    const ref = await placed(env, 'quoted');
    const req = new Request('https://orders.example/orders/' + ref + '/pay', {
        method: 'POST',
        headers: { Origin: 'https://not-us.example', 'Content-Type': 'application/json' },
        body: JSON.stringify({ leg: 'deposit' })
    });
    const res = await worker.default.fetch(req, env);
    ok(res.status === 403, 'an invoice cannot be raised from another origin', 'status ' + res.status);

    const nope = await call(env, 'POST', '/orders/IMG-AAAA-AAAAAAAA-AAAAAAAA/pay', { leg: 'deposit' });
    ok(nope.status === 404, 'nor against a reference that does not exist', 'status ' + nope.status);
}

/* ---- four cases the mutation pass found nothing testing ---- */

/* isSettled is the single function standing between 'somebody paid' and 'ship
   the machines'. Exercised directly, because the route can only reach it with
   shapes the stub happens to produce. */
(function () {
    const Strike = strikeModule;
    [[null, 'nothing at all'], [undefined, 'undefined'], [{}, 'an empty object'],
     [{ state: '' }, 'an empty state'], [{ state: 'UNPAID' }, 'UNPAID'],
     [{ state: 'PENDING' }, 'PENDING'], [{ state: 'EXPIRED' }, 'EXPIRED'],
     [{ state: 'CANCELLED' }, 'CANCELLED'], [{ state: 'WEIRD' }, 'something unrecognised']]
    .forEach(([inv, label]) => {
        ok(Strike.isSettled(inv) === false, 'a Strike invoice of ' + label + ' is not settled',
           JSON.stringify(inv));
    });
    [['PAID'], ['paid'], ['COMPLETED'], ['SETTLED']].forEach(([state]) => {
        ok(Strike.isSettled({ state }) === true, 'but ' + state + ' is', state);
    });
})();

/* An order of nothing but price-on-request machines owes nothing yet. Raising a
   zero invoice for it would produce something that settles the instant it is
   created — an order marked paid that nobody paid for. Every machine has a
   price today, so the case is made to happen. */
{
    const KEY = '__TEST Unpriced Machine';
    catalogue.CATALOGUE[KEY] = { hashrate: 100, power: 3, efficiency: 30, usd: null };
    try {
        const env = newEnv(); strike.reset();
        const r0 = await call(env, 'POST', '/orders', Object.assign({}, GOOD, {
            lines: [{ model: KEY, qty: 5 }]
        }));
        ok(r0.status === 201, 'an order of unpriced machines is accepted', 'status ' + r0.status);
        ok(r0.body.totals.deposit === 0, 'and owes nothing yet', String(r0.body.totals.deposit));
        const pay = await call(env, 'POST', '/orders/' + r0.body.reference + '/pay', { leg: 'deposit' });
        ok(pay.status === 400, 'so no invoice is raised for it', 'status ' + pay.status);
        const made = strike.calls.filter(c => c.method === 'POST' && c.url.endsWith('/v1/invoices'));
        ok(made.length === 0, 'and Strike is never asked for a zero-dollar invoice', String(made.length));
    } finally {
        delete catalogue.CATALOGUE[KEY];
    }
}

/* The owner can mark a deposit paid from Strike's own dashboard before this
   Worker ever polls. When the poll then lands, the order is already where the
   settlement would have put it and must not be advanced a second time. */
{
    const env = newEnv(); strike.reset();
    const ref = await placed(env, 'quoted');
    const inv = await call(env, 'POST', '/orders/' + ref + '/pay', { leg: 'deposit' });
    await call(env, 'POST', '/orders/' + ref + '/status', { status: 'deposit_paid' }, OPS);
    strike.settle(inv.body.invoiceId);

    const r = await call(env, 'GET', '/orders/' + ref + '/payment?leg=deposit');
    ok(r.body.state === 'PAID', 'a settlement arriving after a manual advance still reports paid',
       JSON.stringify(r.body));
    const view = await call(env, 'GET', '/orders/' + ref);
    const hits = (view.body.history || []).filter(h => h.status === 'deposit_paid');
    ok(hits.length === 1, 'but does not record the same step twice', String(hits.length));
}

{
    const env = newEnv(); strike.reset();
    const ref = await placed(env, 'quoted');
    const r = await call(env, 'GET', '/orders/' + ref + '/payment?leg=donation');
    ok(r.status === 400, 'an invented leg is refused on the status route too', 'status ' + r.status);
}

/* ---- the key never leaves the Worker ---- */

(function () {
    const src = fs.readFileSync(W + 'index.js', 'utf8') + fs.readFileSync(W + 'strike.js', 'utf8');
    ok(!/sk_live|sk_test_[A-Za-z0-9]{8}/.test(src), 'no Strike key is committed');
    ok(src.indexOf('env.STRIKE_API_KEY') >= 0, 'it comes from a secret binding');

    /* Nothing Strike returns should be handed to the browser wholesale — those
       objects carry account-level identifiers. */
    const idx = fs.readFileSync(W + 'index.js', 'utf8');
    ok(idx.indexOf('Strike.publicQuote(') >= 0, 'and quotes reach the page through a narrowing');
    ok(!/jsonResponse\(\s*live\s*,/.test(idx) && !/jsonResponse\(\s*made\s*,/.test(idx),
       'never the raw Strike object');
})();

/* ---- and the amount is never taken from the request, structurally ---- */

(function () {
    const src = fs.readFileSync(W + 'index.js', 'utf8');
    const a = src.indexOf('var payReq = path.match');
    const b = src.indexOf('// ===== HAS IT BEEN PAID?');
    const body = src.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    ok(body.indexOf('leg.amount(payOrder)') >= 0, 'the invoice amount comes from the order');
    ['payBody.amount', 'payBody.usd', 'payBody.deposit', 'payBody.total']
    .forEach(k => ok(body.indexOf(k) < 0, 'and never from ' + k, k + ' is read'));
})();

console.log('');
console.log(fail ? '  ' + fail + ' FAILED' : '  pay-suite: ALL OK');
process.exit(fail ? 1 : 0);
