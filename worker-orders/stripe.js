// Stripe, as much of it as taking a card deposit needs.
//
// A separate file for the same reason strike.js is one: this is where somebody
// else's wire format lives, and it is the only part of the payment path whose
// correctness a test cannot finally settle. Everything that DECIDES anything
// stays in index.js, where it is testable.
//
// Hosted Checkout, not embedded fields. Card details never touch this Worker or
// the site, which keeps the whole thing at the lightest PCI tier and hands 3-D
// Secure, SCA and the wallets to Stripe.

var STRIPE_BASE = 'https://api.stripe.com';

/* Stripe's API takes form encoding, not JSON, and nests with square brackets. */
function form(params) {
    var parts = [];
    Object.keys(params).forEach(function (k) {
        var v = params[k];
        if (v === undefined || v === null) return;
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
    });
    return parts.join('&');
}

async function call(method, endpoint, params, key) {
    var res = await fetch(STRIPE_BASE + endpoint, {
        method: method,
        headers: {
            'Authorization': 'Bearer ' + key,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params === undefined ? undefined : form(params)
    });
    var text = await res.text();
    var json = null;
    try { json = text ? JSON.parse(text) : {}; } catch (e) { json = null; }
    if (!res.ok || json === null) {
        return { __error: true, status: res.status,
                 detail: (json && json.error && json.error.message) || text || '' };
    }
    return json;
}

export function failed(r) { return !r || r.__error === true; }

/* Amounts cross to Stripe in the smallest unit. Rounding here rather than
   trusting a float to be exact: 131.40 * 100 is 13139.999999999998 in binary
   floating point, and a cent lost on the way to a card processor is a cent the
   customer disputes. */
export function cents(usd) {
    return Math.round(Number(usd) * 100);
}

/* The order reference travels as client_reference_id, which is what the webhook
   matches on later. metadata carries the leg so one order can have more than one
   session over its life without them being confused. */
export async function createCheckoutSession(key, opts) {
    return await call('POST', '/v1/checkout/sessions', {
        mode: 'payment',
        client_reference_id: opts.reference,
        'metadata[reference]': opts.reference,
        'metadata[leg]': opts.leg,
        success_url: opts.successUrl,
        cancel_url: opts.cancelUrl,
        customer_email: opts.email || undefined,
        'line_items[0][quantity]': 1,
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': cents(opts.amountUsd),
        'line_items[0][price_data][product_data][name]': opts.description,
        /* Stripe deduplicates on this, so a double-clicked button or a retried
           request cannot open two sessions for the same money. */
        'payment_intent_data[metadata][reference]': opts.reference
    }, key);
}

export async function getSession(key, sessionId) {
    return await call('GET', '/v1/checkout/sessions/' + encodeURIComponent(sessionId),
                      undefined, key);
}

// ===== THE WEBHOOK =====
//
// This is the only thing allowed to mark a card payment settled, so its
// signature check is the whole of its authentication. The success redirect
// proves nothing whatsoever: anyone can open the return URL, with any query
// string on it, having paid nobody.

function constantEquals(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

function hex(buf) {
    var out = '', view = new Uint8Array(buf);
    for (var i = 0; i < view.length; i++) out += ('0' + view[i].toString(16)).slice(-2);
    return out;
}

/* Stripe-Signature looks like:  t=1699999999,v1=abc123...,v1=def456...
   More than one v1 is legitimate during a secret rotation, so every one is
   checked rather than only the first. */
function parseSignature(header) {
    var out = { t: null, v1: [] };
    String(header || '').split(',').forEach(function (part) {
        var eq = part.indexOf('=');
        if (eq < 0) return;
        var k = part.slice(0, eq).trim(), v = part.slice(eq + 1).trim();
        if (k === 't') out.t = v;
        else if (k === 'v1') out.v1.push(v);
    });
    return out;
}

/* Five minutes. Without a tolerance a captured request stays valid forever, so
   anyone who ever saw one legitimate webhook could replay it to mark later
   orders paid. */
var TOLERANCE_SEC = 300;

export async function verifyWebhook(rawBody, signatureHeader, secret, nowMs) {
    if (!secret) return { ok: false, why: 'no endpoint secret configured' };

    var sig = parseSignature(signatureHeader);
    if (!sig.t || !sig.v1.length) return { ok: false, why: 'malformed signature header' };

    var t = parseInt(sig.t, 10);
    if (!isFinite(t)) return { ok: false, why: 'bad timestamp' };

    var age = Math.abs(Math.floor((nowMs || Date.now()) / 1000) - t);
    if (age > TOLERANCE_SEC) return { ok: false, why: 'timestamp outside tolerance' };

    var key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    var mac = await crypto.subtle.sign(
        'HMAC', key, new TextEncoder().encode(sig.t + '.' + rawBody));
    var expected = hex(mac);

    var matched = sig.v1.some(function (given) { return constantEquals(given, expected); });
    if (!matched) return { ok: false, why: 'signature does not match' };

    var event = null;
    try { event = JSON.parse(rawBody); } catch (e) { return { ok: false, why: 'body is not JSON' }; }
    return { ok: true, event: event };
}

/* What the page may see of a session. Never the raw object — it carries
   customer and account identifiers that are none of the browser's business. */
export function publicSession(session) {
    if (!session) return null;
    return {
        id: session.id,
        url: session.url || '',
        status: session.status || '',
        paid: session.payment_status === 'paid'
    };
}

export const __test = { form, parseSignature, constantEquals, hex, TOLERANCE_SEC };
