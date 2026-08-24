/* Guards taking a card, and the third rail arriving beside bitcoin and wire.

   Bitcoin's rule was "the browser does not decide what was paid". Cards have a
   sharper version of the same thing, because there is a URL the customer lands
   on after paying: THE SUCCESS REDIRECT PROVES NOTHING. Anyone can open it, with
   any query string, having paid nobody. Only a signature-verified webhook may
   settle a card payment, and most of this file is attempts to get around that.

   The other new rule is about having three rails at once: ONE LEG, ONE
   SETTLEMENT. Opening a card checkout and then sending bitcoin must not charge
   twice or advance the order twice. */
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

/* ---- stubbed Strike and Stripe ---- */

const strike = { invoices: new Map(), n: 1, settle(id) { const i = this.invoices.get(id); if (i) i.state = 'PAID'; } };
const stripe = { sessions: new Map(), n: 1, calls: [], fail: false };

globalThis.fetch = async (url, opts) => {
    const u = String(url);
    const method = (opts && opts.method) || 'GET';
    const J = (o, s = 200) => new Response(JSON.stringify(o), {
        status: s, headers: { 'Content-Type': 'application/json' } });

    if (u.startsWith('https://api.strike.me')) {
        const body = opts && opts.body ? JSON.parse(opts.body) : null;
        if (method === 'POST' && u.endsWith('/v1/invoices')) {
            const id = 'inv_' + (strike.n++);
            strike.invoices.set(id, { invoiceId: id, state: 'UNPAID', amount: body.amount });
            return J({ invoiceId: id });
        }
        let m = /\/v1\/invoices\/([^/]+)\/quote$/.exec(u);
        if (m) return J({ lnInvoice: 'lnbc_' + m[1], expirationInSec: 3600 });
        m = /\/v1\/invoices\/([^/]+)$/.exec(u);
        if (m && method === 'GET') {
            const inv = strike.invoices.get(m[1]);
            return inv ? J(inv) : J({ data: 'no' }, 404);
        }
        if (u.endsWith('/v1/receive-requests')) return J({ onchain: { address: 'bc1qtest' } });
        return J({ data: 'unhandled' }, 404);
    }

    if (u.startsWith('https://api.stripe.com')) {
        const form = opts && opts.body ? new URLSearchParams(opts.body) : new URLSearchParams();
        stripe.calls.push({ method, url: u, form });
        if (stripe.fail) return J({ error: { message: 'nope' } }, 500);
        if (method === 'POST' && u.endsWith('/v1/checkout/sessions')) {
            const id = 'cs_test_' + (stripe.n++);
            const sess = {
                id, url: 'https://checkout.stripe.com/c/pay/' + id, status: 'open',
                payment_status: 'unpaid',
                amount_total: Number(form.get('line_items[0][price_data][unit_amount]')),
                client_reference_id: form.get('client_reference_id'),
                metadata: { reference: form.get('metadata[reference]'), leg: form.get('metadata[leg]') }
            };
            stripe.sessions.set(id, sess);
            return J(sess);
        }
        const m = /\/v1\/checkout\/sessions\/([^/?]+)$/.exec(u);
        if (m && method === 'GET') {
            const s = stripe.sessions.get(decodeURIComponent(m[1]));
            return s ? J(s) : J({ error: { message: 'no such session' } }, 404);
        }
        return J({ error: { message: 'unhandled' } }, 404);
    }
    return J({ data: 'unexpected host' }, 500);
};

const worker = await import('file:///' + W + 'index.js');
const Stripe = await import('file:///' + W + 'stripe.js');
const T = worker.__test;

/* ---- harness ---- */

function kv() {
    const box = new Map();
    return {
        box,
        async get(k, type) { const v = box.has(k) ? box.get(k) : null;
            return v === null ? null : (type === 'json' ? JSON.parse(v) : v); },
        async put(k, v) { box.set(k, String(v)); },
        async list({ prefix, limit }) {
            const keys = [...box.keys()].filter(k => k.startsWith(prefix)).sort().slice(0, limit || 1000);
            return { keys: keys.map(name => ({ name })) }; }
    };
}

const ORIGIN = 'https://protonminingco.com';
const OPS = { Authorization: 'Bearer test-ops' };
const WEBHOOK_SECRET = 'whsec_test_secret';

async function call(env, method, urlPath, body, headers, rawBody) {
    const req = new Request('https://orders.example' + urlPath, {
        method,
        headers: Object.assign({ Origin: ORIGIN, 'Content-Type': 'application/json' }, headers || {}),
        body: rawBody !== undefined ? rawBody : (body === undefined ? undefined : JSON.stringify(body))
    });
    const res = await worker.default.fetch(req, env);
    let json = null;
    try { json = JSON.parse(await res.text()); } catch (e) {}
    return { status: res.status, body: json };
}

function newEnv() {
    return { ORDERS: kv(), OPS_SECRET: 'test-ops', STRIKE_API_KEY: 'sk_strike',
             STRIPE_SECRET_KEY: 'sk_stripe', STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET };
}

const GOOD = {
    lines: [{ model: 'Antminer S21 XP', qty: 6 }, { model: 'Whatsminer M66S+', qty: 3 }],
    destination: { kind: 'ion' }, contact: { email: 'buyer@example.com' }
};
const USD = 52560, DEPOSIT = 13140, BALANCE = 39420;

async function placed(env, upTo) {
    const r = await call(env, 'POST', '/orders', GOOD);
    const ref = r.body.reference;
    for (const step of T.FLOW.slice(1)) {
        await call(env, 'POST', '/orders/' + ref + '/status', { status: step }, OPS);
        if (step === upTo) break;
    }
    return ref;
}

/* Sign a webhook body the way Stripe does. */
async function sign(payload, secret, tsSeconds) {
    const t = tsSeconds !== undefined ? tsSeconds : Math.floor(Date.now() / 1000);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(t + '.' + payload));
    let hex = '';
    new Uint8Array(mac).forEach(b => { hex += ('0' + b.toString(16)).slice(-2); });
    return 't=' + t + ',v1=' + hex;
}

function completedEvent(reference, leg, amountCents) {
    return JSON.stringify({
        id: 'evt_1', type: 'checkout.session.completed',
        data: { object: {
            id: 'cs_test_1', client_reference_id: reference,
            metadata: { reference: reference, leg: leg },
            amount_total: amountCents, payment_status: 'paid'
        } }
    });
}

/* ================= the card cap ================= */

{
    const env = newEnv();
    const ref = await placed(env, 'quoted');
    const r = await call(env, 'POST', '/orders/' + ref + '/pay', { leg: 'deposit', method: 'card' });
    ok(r.status === 201, 'a deposit can be paid by card', 'status ' + r.status);
    ok(r.body.amount === DEPOSIT, 'for the deposit amount', String(r.body && r.body.amount));
    ok(/^https:\/\/checkout\.stripe\.com\//.test(r.body.checkoutUrl || ''),
       'and hands back a hosted Checkout URL', r.body && r.body.checkoutUrl);

    const sent = stripe.calls.filter(c => c.url.endsWith('/v1/checkout/sessions'))[0];
    ok(sent && Number(sent.form.get('line_items[0][price_data][unit_amount]')) === DEPOSIT * 100,
       'and Stripe was asked for exactly ' + DEPOSIT * 100 + ' cents',
       sent ? sent.form.get('line_items[0][price_data][unit_amount]') : 'no call');
    ok(sent && sent.form.get('client_reference_id') === ref,
       'tagged with the order reference, which is what the webhook matches on');
}

/* The cap is the Worker's, not the page's. */
for (const leg of ['full', 'balance']) {
    const env = newEnv();
    const ref = await placed(env, leg === 'balance' ? 'po_placed' : 'quoted');
    const r = await call(env, 'POST', '/orders/' + ref + '/pay', { leg, method: 'card' });
    ok(r.status === 409, 'a card is refused for the ' + leg + ' leg, POSTed directly',
       'status ' + r.status);
    ok(stripe.calls.filter(c => c.url.endsWith('/v1/checkout/sessions')).length === 0 ||
       r.status === 409, 'and no session is created for it');
}

{
    const env = newEnv();
    const ref = await placed(env, 'quoted');
    const r = await call(env, 'POST', '/orders/' + ref + '/pay', { leg: 'deposit', method: 'crypto-gift-card' });
    ok(r.status === 400, 'an invented payment method is refused', 'status ' + r.status);
}

/* ================= THE POINT: the redirect proves nothing ================= */

{
    const env = newEnv(); stripe.calls = [];
    const ref = await placed(env, 'quoted');
    await call(env, 'POST', '/orders/' + ref + '/pay', { leg: 'deposit', method: 'card' });

    /* Every shape a forged "I came back from Stripe" could take. */
    for (const [label, qs] of [
        ['nothing', ''],
        ['?paid=1', '&paid=1'],
        ['?success=true', '&success=true'],
        ['?payment_status=paid', '&payment_status=paid'],
        ['a forged session id', '&session_id=cs_test_1'],
        ['state=PAID', '&state=PAID']
    ]) {
        const r = await call(env, 'GET', '/orders/' + ref + '/payment?leg=deposit&method=card' + qs);
        ok(r.body.state !== 'PAID',
           'returning from Stripe with ' + label + ' does not mark it paid', JSON.stringify(r.body));
    }

    const view = await call(env, 'GET', '/orders/' + ref);
    ok(view.body.status === 'deposit_invoiced',
       'and the order is still only invoiced', view.body.status);
}

/* Even a Stripe session that genuinely says paid is not enough on its own —
   only the webhook may settle. */
{
    const env = newEnv();
    const ref = await placed(env, 'quoted');
    const r = await call(env, 'POST', '/orders/' + ref + '/pay', { leg: 'deposit', method: 'card' });
    const sess = stripe.sessions.get(r.body.sessionId);
    sess.payment_status = 'paid';
    sess.status = 'complete';

    const st = await call(env, 'GET', '/orders/' + ref + '/payment?leg=deposit&method=card');
    ok(st.body.state !== 'PAID',
       'a session Stripe reports as paid still does not settle without the webhook',
       JSON.stringify(st.body));
}

/* ================= webhook signatures ================= */

{
    const env = newEnv();
    const ref = await placed(env, 'quoted');
    await call(env, 'POST', '/orders/' + ref + '/pay', { leg: 'deposit', method: 'card' });
    const payload = completedEvent(ref, 'deposit', DEPOSIT * 100);

    const cases = [
        ['no signature at all', undefined],
        ['an empty signature', ''],
        ['a malformed header', 'not-a-signature'],
        ['a timestamp with no v1', 't=' + Math.floor(Date.now() / 1000)],
        ['a v1 with no timestamp', 'v1=deadbeef'],
        ['a signature from the wrong secret', await sign(payload, 'whsec_WRONG')],
        ['a signature over a different body', await sign('{"tampered":true}', WEBHOOK_SECRET)],
        ['a replay from an hour ago', await sign(payload, WEBHOOK_SECRET, Math.floor(Date.now() / 1000) - 3600)]
    ];
    for (const [label, header] of cases) {
        const r = await call(env, 'POST', '/stripe/webhook', undefined,
                             header === undefined ? {} : { 'Stripe-Signature': header }, payload);
        ok(r.status === 400, 'a webhook with ' + label + ' is refused', 'status ' + r.status);
    }

    const view = await call(env, 'GET', '/orders/' + ref);
    ok(view.body.status === 'deposit_invoiced',
       'and none of them advanced the order', view.body.status);

    /* And the refusal must not explain itself — asserted by showing that
       every different cause produces the IDENTICAL message. Grepping one
       response for suspicious words passed a mutation that echoed the real
       reason back, because that particular reason happened not to contain
       any of the words being grepped for. */
    const bodies = [];
    for (const h of ['v1=deadbeef',
                     await sign(payload, 'whsec_WRONG'),
                     await sign(payload, WEBHOOK_SECRET, Math.floor(Date.now() / 1000) - 3600),
                     await sign('{"other":1}', WEBHOOK_SECRET)]) {
        const rr = await call(env, 'POST', '/stripe/webhook', undefined,
                              { 'Stripe-Signature': h }, payload);
        bodies.push(JSON.stringify(rr.body));
    }
    ok(new Set(bodies).size === 1,
       'every rejection reads the same, whatever actually failed', bodies.join(' | '));
    ok(!/secret|timestamp|tolerance|hmac|match/i.test(bodies[0]),
       'and names none of the moving parts', bodies[0]);
}

/* The one that should work. */
{
    const env = newEnv();
    const ref = await placed(env, 'quoted');
    await call(env, 'POST', '/orders/' + ref + '/pay', { leg: 'deposit', method: 'card' });
    const payload = completedEvent(ref, 'deposit', DEPOSIT * 100);
    const r = await call(env, 'POST', '/stripe/webhook', undefined,
                         { 'Stripe-Signature': await sign(payload, WEBHOOK_SECRET) }, payload);
    ok(r.status === 200 && r.body.received === true, 'a correctly signed webhook is accepted',
       JSON.stringify(r.body));

    const view = await call(env, 'GET', '/orders/' + ref);
    ok(view.body.status === 'deposit_paid', 'and settles the deposit', view.body.status);

    /* Stripe retries until it gets a 2xx, so the same event arrives repeatedly. */
    await call(env, 'POST', '/stripe/webhook', undefined,
               { 'Stripe-Signature': await sign(payload, WEBHOOK_SECRET) }, payload);
    await call(env, 'POST', '/stripe/webhook', undefined,
               { 'Stripe-Signature': await sign(payload, WEBHOOK_SECRET) }, payload);
    const again = await call(env, 'GET', '/orders/' + ref);
    const hits = (again.body.history || []).filter(h => h.status === 'deposit_paid');
    ok(hits.length === 1, 'and a retried event does not advance it again', String(hits.length));
}

/* The amount has to match what the order says is owed. */
for (const [label, cents] of [
    ['a cent less', DEPOSIT * 100 - 1],
    ['one dollar', 100],
    ['zero', 0],
    ['the full order instead of the deposit', USD * 100],
    ['nonsense', NaN]
]) {
    const env = newEnv();
    const ref = await placed(env, 'quoted');
    await call(env, 'POST', '/orders/' + ref + '/pay', { leg: 'deposit', method: 'card' });
    const payload = completedEvent(ref, 'deposit', cents);
    const r = await call(env, 'POST', '/stripe/webhook', undefined,
                         { 'Stripe-Signature': await sign(payload, WEBHOOK_SECRET) }, payload);
    ok(r.body && r.body.ignored === 'amount mismatch',
       'a correctly signed webhook for ' + label + ' is ignored', JSON.stringify(r.body));
    const view = await call(env, 'GET', '/orders/' + ref);
    ok(view.body.status === 'deposit_invoiced', '  and settles nothing', view.body.status);
}

/* payment_status must actually say paid. */
{
    const env = newEnv();
    const ref = await placed(env, 'quoted');
    await call(env, 'POST', '/orders/' + ref + '/pay', { leg: 'deposit', method: 'card' });
    const payload = JSON.stringify({
        id: 'evt_2', type: 'checkout.session.completed',
        data: { object: { client_reference_id: ref, metadata: { leg: 'deposit' },
                          amount_total: DEPOSIT * 100, payment_status: 'unpaid' } } });
    const r = await call(env, 'POST', '/stripe/webhook', undefined,
                         { 'Stripe-Signature': await sign(payload, WEBHOOK_SECRET) }, payload);
    ok(r.body.ignored === 'not paid', 'a completed session that is not paid settles nothing',
       JSON.stringify(r.body));
}

/* An event for an order that does not exist. */
{
    const env = newEnv();
    const payload = completedEvent('IMG-AAAA-AAAAAAAA-AAAAAAAA', 'deposit', DEPOSIT * 100);
    const r = await call(env, 'POST', '/stripe/webhook', undefined,
                         { 'Stripe-Signature': await sign(payload, WEBHOOK_SECRET) }, payload);
    ok(r.status === 200 && r.body.ignored === 'no such order',
       'an event for an unknown order is acknowledged but does nothing', JSON.stringify(r.body));
}

/* Other event types are acknowledged so Stripe stops retrying. */
{
    const env = newEnv();
    const payload = JSON.stringify({ id: 'evt_3', type: 'customer.created', data: { object: {} } });
    const r = await call(env, 'POST', '/stripe/webhook', undefined,
                         { 'Stripe-Signature': await sign(payload, WEBHOOK_SECRET) }, payload);
    ok(r.status === 200, 'an unrelated event type is acknowledged', 'status ' + r.status);
    ok(r.body.ignored === 'customer.created', '  and named as ignored', JSON.stringify(r.body));
}

/* No configured secret must close the endpoint, not open it. */
{
    const env = newEnv();
    delete env.STRIPE_WEBHOOK_SECRET;
    const ref = await placed(env, 'quoted');
    const payload = completedEvent(ref, 'deposit', DEPOSIT * 100);
    const r = await call(env, 'POST', '/stripe/webhook', undefined,
                         { 'Stripe-Signature': await sign(payload, WEBHOOK_SECRET) }, payload);
    ok(r.status === 400, 'with no webhook secret configured the endpoint refuses everything',
       'status ' + r.status);
}

/* ================= one leg, one settlement ================= */

{
    const env = newEnv();
    const ref = await placed(env, 'quoted');
    const card = await call(env, 'POST', '/orders/' + ref + '/pay', { leg: 'deposit', method: 'card' });
    const btc = await call(env, 'POST', '/orders/' + ref + '/pay', { leg: 'deposit', method: 'btc' });
    ok(card.status === 201 && btc.status === 201,
       'a customer may open a card checkout and a bitcoin invoice for the same deposit');

    /* Bitcoin lands first. */
    strike.settle(btc.body.invoiceId);
    const st = await call(env, 'GET', '/orders/' + ref + '/payment?leg=deposit&method=btc');
    ok(st.body.state === 'PAID', 'and whichever arrives first settles it', JSON.stringify(st.body));

    /* Now the card webhook turns up for the same leg. */
    const payload = completedEvent(ref, 'deposit', DEPOSIT * 100);
    await call(env, 'POST', '/stripe/webhook', undefined,
               { 'Stripe-Signature': await sign(payload, WEBHOOK_SECRET) }, payload);
    const view = await call(env, 'GET', '/orders/' + ref);
    const hits = (view.body.history || []).filter(h => h.status === 'deposit_paid');
    ok(hits.length === 1, 'and the other rail cannot advance the order a second time',
       String(hits.length));

    /* Whichever panel is open must see it. */
    const viaCard = await call(env, 'GET', '/orders/' + ref + '/payment?leg=deposit&method=card');
    ok(viaCard.body.state === 'PAID',
       'and somebody watching the card panel sees the bitcoin payment land',
       JSON.stringify(viaCard.body));

    /* And the card attempt must not be MARKED settled either. The order would
       otherwise record two payments for one leg — books showing $26,280
       collected against a $13,140 deposit. The step check alone does not stop
       this: it guards the status, not the attempt. */
    const raw = JSON.parse(env.ORDERS.box.get('order:' + ref));
    const settledAttempts = Object.keys(raw.invoice || {})
        .filter(function (k) { return raw.invoice[k].settled; });
    ok(settledAttempts.length === 1,
       'and only one rail is recorded as having been paid',
       settledAttempts.join(', '));

    const retry = await call(env, 'POST', '/orders/' + ref + '/pay', { leg: 'deposit', method: 'card' });
    ok(retry.status === 409, 'and no rail can be invoiced again once the leg is closed',
       'status ' + retry.status);
}

/* ================= wire ================= */

{
    const env = newEnv();
    const ref = await placed(env, 'quoted');
    const r = await call(env, 'POST', '/orders/' + ref + '/pay', { leg: 'deposit', method: 'wire' });
    ok(r.status === 201, 'a wire can be requested', 'status ' + r.status);
    ok(r.body.amount === DEPOSIT, 'for the deposit amount', String(r.body.amount));
    ok(r.body.reference === ref, 'and hands back the reference the transfer must quote',
       r.body.reference);
    ok(!r.body.checkoutUrl && !r.body.onchainAddress,
       'and collects nothing itself', JSON.stringify(r.body));

    const st = await call(env, 'GET', '/orders/' + ref + '/payment?leg=deposit&method=wire');
    ok(st.body.state === 'AWAITING',
       'its state says a person is watching for it, not that it is unpaid',
       JSON.stringify(st.body));

    /* Cards are capped, wires are not. */
    const full = await call(env, 'POST', '/orders/' + ref + '/pay', { leg: 'full', method: 'wire' });
    ok(full.status === 201 || full.status === 409,
       'and a wire is allowed on any leg (unlike a card)', 'status ' + full.status);
}

/* ================= the amount is still the server's ================= */

/* Checking the RESPONSE is not enough. A version that echoes the right
   figure back while charging the card something else passes that easily —
   and a mutation doing exactly that slipped through. What matters is the
   number that reached Stripe. */
for (const [label, body] of [
    ['an amount of its own', { leg: 'deposit', method: 'card', amount: 1 }],
    ['cents of its own', { leg: 'deposit', method: 'card', amount_total: 1, unit_amount: 1 }],
    ['a price of its own', { leg: 'deposit', method: 'card', price: 1, usd: 1 }],
    ['a total of its own', { leg: 'deposit', method: 'wire', usd: 1, total: 1 }]
]) {
    const env = newEnv(); stripe.calls = [];
    const ref = await placed(env, 'quoted');
    const r = await call(env, 'POST', '/orders/' + ref + '/pay', body);
    ok(r.body.amount === DEPOSIT,
       'a ' + body.method + ' payment requested with ' + label + ' answers ' + DEPOSIT,
       String(r.body && r.body.amount));
    if (body.method === 'card') {
        const made = stripe.calls.filter(c => c.url.endsWith('/v1/checkout/sessions'))[0];
        const charged = made ? Number(made.form.get('line_items[0][price_data][unit_amount]')) : null;
        ok(charged === DEPOSIT * 100,
           '  and Stripe is asked for ' + DEPOSIT * 100 + ' cents, not what was sent',
           String(charged));
    }
}

/* ================= the seam itself ================= */

(function () {
    /* 131.40 * 100 lands on 13140 exactly, so it cannot tell rounding from
       truncation — the first version of this check used it and proved
       nothing. 8.29 * 100 is 828.9999999999999 in binary floating point,
       which floors to 828 and rounds to 829. A cent short on the way to a
       card processor is a cent the customer disputes. */
    [[8.29, 829], [1.15, 115], [131.40, 13140], [0.07, 7], [13140, 1314000]]
    .forEach(function (p) {
        ok(Stripe.cents(p[0]) === p[1],
           'cents(' + p[0] + ') is ' + p[1] + ', not ' + Math.floor(p[0] * 100),
           String(Stripe.cents(p[0])));
    });

    const sig = Stripe.__test.parseSignature('t=123,v1=aaa,v1=bbb');
    ok(sig.t === '123' && sig.v1.length === 2,
       'more than one v1 is read, because secret rotation sends two', JSON.stringify(sig));

    ok(Stripe.__test.TOLERANCE_SEC <= 600,
       'the replay window is minutes, not hours', String(Stripe.__test.TOLERANCE_SEC));

    const src = fs.readFileSync(W + 'stripe.js', 'utf8');
    ok(!/sk_live|sk_test_[A-Za-z0-9]{6}|whsec_[A-Za-z0-9]{6}/.test(src),
       'no Stripe key is committed');
    /* CALLED, not merely defined. Checking the file mentions constantEquals
       passed a mutation that swapped the call site for === and left the
       function sitting there unused. */
    var verifyAt = src.indexOf('export async function verifyWebhook');
    var verifyBody = src.slice(verifyAt, src.indexOf('publicSession', verifyAt));
    ok(verifyBody.indexOf('constantEquals(') >= 0,
       'and the signature comparison itself is constant time', verifyBody.slice(-260));
    ok(!/given === expected|expected === given/.test(verifyBody),
       'never a plain equality, which leaks the answer through timing');

    const idx = fs.readFileSync(W + 'index.js', 'utf8');
    ok(idx.indexOf("path === '/stripe/webhook'") >= 0, 'the webhook has a route');
    /* It must NOT be origin-gated: Stripe sends no Origin, and gating it would
       simply break it. The signature is the authentication. */
    const a = idx.indexOf("path === '/stripe/webhook'");
    const seg = idx.slice(a, idx.indexOf('LIST ORDERS', a));
    ok(seg.indexOf('isAllowedOrigin') < 0,
       'and is authenticated by signature, not by origin, because Stripe is not a browser');
    ok(seg.indexOf('verifyWebhook') >= 0, 'verifying before it reads anything');
})();

console.log('');
console.log(fail ? '  ' + fail + ' FAILED' : '  stripe-suite: ALL OK');
process.exit(fail ? 1 : 0);
