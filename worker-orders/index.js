// Proton Mining — Orders (Cloudflare Worker)
//
// Takes a hardware order from the public site, prices it SERVER-SIDE, and holds
// it through a lifecycle that ends in machines arriving somewhere.
//
// WHY THIS EXISTS AT ALL. site/cart.js computes totals in the browser so the
// checkout can show them. A number computed in the browser is a number the
// customer controls: edit localStorage, or the script, and submit a $1 deposit
// against a $52,000 order. So nothing the client sends about money is read.
// The client sends model names and counts; every figure is recomputed here from
// catalogue.js, which is generated from the site's own tables.
//
// WHAT IT DOES NOT DO. It does not buy anything. No ASIC distributor exposes a
// public ordering API — Bitmain, MicroBT and Canaan sell through accounts and
// channel partners, and secondary desks trade over email against a wire. So the
// purchase order is a person, and the lifecycle says so rather than pretending
// otherwise.

import { CATALOGUE, DEPOSIT_RATE, ASOF, SITE_IDS, SITE_OPEN, PREPAY_TERMS }
    from './catalogue.js';
import * as Strike from './strike.js';
import * as Stripe from './stripe.js';

var ALLOWED_ORIGINS = [
    'https://protonminingco.com',
    'https://www.protonminingco.com',
    'https://rbagatoli.github.io',
    'http://localhost',
    'http://127.0.0.1'
];

// Bounds on anything the client can send. Not politeness — these are the sizes
// that stop a single request from filling KV or the order record.
var MAX_LINES = 60;
var MAX_QTY = 10000;
var MAX_FIELD = 400;
var MAX_MODEL_NAME = 120;
var MAX_NOTES = 4000;

// Orders per IP per hour. An order is cheap to place and expensive to read.
var MAX_ORDERS_PER_HOUR = 12;
var MS_PER_HOUR = 3600000;
// Two hours, so a counter written at :59 still expires after its window closes.
var RATE_COUNTER_TTL = 7200;

function isAllowedOrigin(origin) {
    if (!origin) return false;
    for (var i = 0; i < ALLOWED_ORIGINS.length; i++) {
        if (origin === ALLOWED_ORIGINS[i] || origin.startsWith(ALLOWED_ORIGINS[i] + ':')) return true;
    }
    return false;
}

function corsHeaders(origin) {
    return {
        'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json'
    };
}

function jsonResponse(body, status, origin) {
    return new Response(JSON.stringify(body), { status: status, headers: corsHeaders(origin) });
}

// ===== THE ORDER REFERENCE =====

// Unguessable, because GET /orders/:reference is public and carries a delivery
// address. 20 chars of crypto-random base32 is the whole access control, so it
// cannot be sequential and cannot be derived from a timestamp.
var REF_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';   // Crockford: no I, L, O, U

function newReference() {
    var bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    var out = '';
    for (var i = 0; i < bytes.length; i++) out += REF_ALPHABET[bytes[i] % 32];
    return 'IMG-' + out.slice(0, 4) + '-' + out.slice(4, 12) + '-' + out.slice(12, 20);
}

var REF_SHAPE = /^IMG-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{8}-[0-9A-HJKMNP-TV-Z]{8}$/;

// ===== READING WHAT THE CLIENT SENT =====

// Control characters become spaces rather than vanishing: they arrive inside
// pasted addresses as newlines and tabs, and deleting them outright joins two
// words into one. Written as escapes because a literal control character in
// source is invisible to whoever reads this next.
var CONTROL = /[\u0000-\u001F\u007F]/g;

function text(v, max) {
    if (typeof v !== 'string') return '';
    return v.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim().slice(0, max || MAX_FIELD);
}

// Money is rounded to the cent once, at the end: rounding per line and then
// summing produces a total that does not match the lines a customer can add up
// themselves.
//
// The balance is the total MINUS the deposit, never a second multiplication.
// At today's rate of 0.25 the two agree, which is exactly why this is easy to
// get wrong and never notice — but DEPOSIT_RATE is an unconfirmed commercial
// term, and at a rate like 0.3 a figure such as $2,204.15 splits into halves
// that do not add back up. Subtracting makes the arithmetic true at any rate.
function cents(n) { return Math.round(n * 100) / 100; }

function splitDeposit(usd, rate) {
    var total = cents(usd);
    var deposit = cents(total * rate);
    return { deposit: deposit, balance: cents(total - deposit) };
}

// The client sends { model, qty }. Anything else about a line — the price, the
// hashrate, the total — is ignored even when present, because it is the
// customer's own arithmetic about the customer's own bill.
function priceOrder(rawLines) {
    if (!Array.isArray(rawLines)) return { error: 'lines must be an array' };
    if (!rawLines.length) return { error: 'the order is empty' };
    if (rawLines.length > MAX_LINES) return { error: 'too many lines' };

    var seen = {};
    var lines = [];
    var units = 0, th = 0, kw = 0, usd = 0, unpriced = 0;

    for (var i = 0; i < rawLines.length; i++) {
        var raw = rawLines[i] || {};
        var model = text(raw.model, MAX_MODEL_NAME);
        if (!Object.prototype.hasOwnProperty.call(CATALOGUE, model)) {
            return { error: 'unknown machine: ' + (model || '(blank)') };
        }
        if (seen[model]) return { error: 'duplicate line: ' + model };
        seen[model] = true;

        var qty = Math.floor(Number(raw.qty));
        if (!isFinite(qty) || qty <= 0) return { error: 'bad quantity for ' + model };
        if (qty > MAX_QTY) return { error: 'quantity too large for ' + model };

        var m = CATALOGUE[model];
        units += qty;
        th += m.hashrate * qty;
        kw += m.power * qty;
        if (m.usd === null) unpriced += qty; else usd += m.usd * qty;

        lines.push({
            model: model, qty: qty,
            hashrate: m.hashrate, power: m.power, efficiency: m.efficiency,
            each: m.usd,
            total: m.usd === null ? null : m.usd * qty
        });
    }

    var split = splitDeposit(usd, DEPOSIT_RATE);

    return {
        lines: lines,
        units: units,
        th: cents(th),
        kw: cents(kw),
        usd: cents(usd),
        unpriced: unpriced,
        depositRate: DEPOSIT_RATE,
        deposit: split.deposit,
        balance: split.balance,
        asOf: ASOF
    };
}

function readDestination(raw) {
    raw = raw || {};
    var kind = text(raw.kind, 12);
    if (kind !== 'ion' && kind !== 'own' && kind !== 'third') kind = 'ion';
    var d = { kind: kind };

    /* WHICH Proton site. Checked against the Worker's own list, never taken on the browser's word:
       this is a shipping instruction, and an unrecognised id here means a pallet of ASICs with
       nowhere to go. Absent is fine — most orders arrive without one and ops assigns a site
       — but a value that is present and wrong is refused rather than dropped, because silently
       discarding it would let a customer pay believing they had chosen Texas. */
    if (kind === 'ion' && raw.site_id !== undefined && raw.site_id !== null && raw.site_id !== '') {
        var sid = text(raw.site_id, 32);
        if (SITE_IDS.indexOf(sid) < 0) return { error: 'unknown site' };
        d.site_id = sid;

        /* FULL IS NOT A REFUSAL. Every site is currently at capacity, and refusing the order
           would turn somebody trying to buy hardware into somebody who cannot. They are buying
           machines; the site is a preference, and a full one means a place on that site's
           waitlist rather than a truck next week.

           The flag is set HERE, from the Worker's own list, and never from anything the browser
           sent — same rule as the prices. Ops needs to know which orders are waiting on space
           before they are shipped, and a customer-supplied boolean is not that. */
        d.waitlisted = SITE_OPEN.indexOf(sid) < 0;

        /* The prepaid electricity term, if one was chosen. Checked against the Worker's own list
           for the same reason the site is: this is a commitment of years and five figures, and
           the browser gets to NAME a term, never to describe one. What '3y' means — how long
           and how much off — is Proton's to say.

           Absent is a real answer: it means paying monthly, which is what a customer who did not
           choose has chosen. A value that is present and unrecognised is refused rather than
           dropped, because silently ignoring it would let somebody pay believing they had locked
           a rate. */
        if (raw.prepay_term !== undefined && raw.prepay_term !== null && raw.prepay_term !== '') {
            var pt = text(raw.prepay_term, 8);
            if (PREPAY_TERMS.indexOf(pt) < 0) return { error: 'unknown prepay term' };
            d.prepay_term = pt;
        }
    }

    if (kind !== 'ion') {
        d.facility = text(raw.facility);
        d.attention = text(raw.attention);
        d.street = text(raw.street);
        d.city = text(raw.city);
        d.region = text(raw.region);
        d.postcode = text(raw.postcode, 40);
        d.country = text(raw.country, 80);
        if (!d.street || !d.city || !d.country) {
            return { error: 'a delivery address needs at least a street, a city and a country' };
        }
    }
    return d;
}

function readContact(raw) {
    raw = raw || {};
    var email = text(raw.email, 200);
    // Deliberately loose. Address validation by regex rejects real addresses,
    // and the consequence of a bad one here is an order nobody can answer —
    // which the reference on screen already survives.
    if (!email || email.indexOf('@') < 1 || email.indexOf('.') < 0) {
        return { error: 'a contact email is required' };
    }
    return {
        name: text(raw.name),
        company: text(raw.company),
        email: email,
        phone: text(raw.phone, 60),
        notes: text(raw.notes, MAX_NOTES)
    };
}

// ===== WHAT IS OWED =====

// Two ways to pay: the deposit that reserves the order, or the whole thing.
// WHICH one is the customer's choice; the AMOUNT is not. It is computed here
// from the stored order and never read from the request — a customer who can
// name their own payment amount has not been sold anything, they have been
// handed a donate button.
var LEGS = {
    deposit: { label: 'Deposit', settlesTo: 'deposit_paid',
               amount: function (o) { return o.totals.deposit; } },
    full:    { label: 'Payment in full', settlesTo: 'deposit_paid',
               amount: function (o) { return o.totals.usd; } },
    balance: { label: 'Balance', settlesTo: 'balance_paid',
               amount: function (o) { return o.totals.balance; } }
};

/* How the money can arrive.

   CARDS ARE CAPPED TO THE DEPOSIT, and the cap lives here rather than in the
   page that hides the button. A rail the interface does not offer is still a
   rail somebody can POST to, and the reason for the cap is money: ~2.9% is
   about $1,525 on a $52,560 order, and the whole of it stays chargeback-
   exposed after machines have shipped to a facility we do not control. On the
   deposit alone that exposure is a quarter of the order.

   'wire' collects nothing here. It shows instructions and waits for a person
   to confirm the money landed — no bank exposes anything better at this size,
   and the page says so rather than implying it is tracked. */
var METHODS = {
    btc:  { label: 'Bitcoin', legs: null,          collects: true  },
    card: { label: 'Card',    legs: ['deposit'],   collects: true  },
    wire: { label: 'Wire',    legs: null,          collects: false }
};

function methodOf(name) {
    return Object.prototype.hasOwnProperty.call(METHODS, name) ? METHODS[name] : null;
}

function methodAllowsLeg(method, legName) {
    var m = methodOf(method);
    if (!m) return false;
    return m.legs === null || m.legs.indexOf(legName) >= 0;
}

function legOf(name) {
    return Object.prototype.hasOwnProperty.call(LEGS, name) ? LEGS[name] : null;
}

// ===== THE LIFECYCLE =====

// Ordered, and only ever advanced one step. The two marked steps are a person
// picking up the phone; the rest the system does. A status page that implied
// otherwise would be lying to somebody who has paid a deposit.
var FLOW = [
    'quote_requested',
    'quoted',              // <- human: price and lead time confirmed with a distributor
    'deposit_invoiced',
    'deposit_paid',
    'po_placed',           // <- human: the purchase order actually goes in
    'balance_invoiced',
    'balance_paid',
    'shipped',
    'delivered'
];
var CANCELLED = 'cancelled';

function stepOf(status) { return FLOW.indexOf(status); }

// Advancing lives in one place, so a status reached by a settled payment
// records the same history as one set by a person.
function advanceTo(order, next, note) {
    var at = new Date().toISOString();
    order.status = next;
    order.updated = at;
    order.history = (order.history || []).concat([{ status: next, at: at, note: note || '' }]);
    return order;
}

/* A leg can be attempted on more than one rail — somebody opens a card
   checkout, thinks better of it, and sends bitcoin instead. Both attempts stay
   on the order, but only one may ever settle: whichever lands first closes the
   leg, and every other attempt against it stops being payable. Without this a
   customer can be charged twice and the order can advance twice.

   Attempts are keyed leg:method, so the two do not overwrite each other and
   the ops view can see what was tried. */
function attemptKey(legName, method) { return legName + ":" + method; }

/* Settling happens in one place, whichever rail reported it, so a card and a
   bitcoin payment cannot advance an order twice or record two different
   histories for the same money. Returns false if the leg was already closed —
   the caller uses that to avoid announcing a second settlement. */
function leg0(order, legName) {
    var inv = order.invoice || {};
    var k = Object.keys(inv).filter(function (x) { return x.indexOf(legName + ":") === 0; })[0];
    return k ? inv[k].amount : null;
}

function settleLeg(order, legName, method, note) {
    if (legSettled(order, legName)) return false;
    var key = attemptKey(legName, method);
    order.invoice = order.invoice || {};
    order.invoice[key] = order.invoice[key] || { id: method + "_" + legName, method: method };
    order.invoice[key].settled = true;
    order.invoice[key].settledAt = new Date().toISOString();
    var target = legOf(legName).settlesTo;
    if (order.status !== CANCELLED && stepOf(order.status) < stepOf(target)) {
        advanceTo(order, target, note || ("settled via " + method));
    }
    if (legName === "full") order.paidInFull = true;
    return true;
}

function legSettled(order, legName) {
    var inv = order.invoice || {};
    return Object.keys(inv).some(function (k) {
        return k.indexOf(legName + ":") === 0 && inv[k].settled;
    });
}

// ===== STORAGE =====

async function putOrder(env, order) {
    await env.ORDERS.put('order:' + order.reference, JSON.stringify(order));
    return order;
}

async function getOrder(env, reference) {
    if (!REF_SHAPE.test(reference)) return null;
    return await env.ORDERS.get('order:' + reference, 'json');
}

// An index so the ops list does not depend on KV list ordering, which is
// lexicographic by key and therefore random for a random reference.
async function indexOrder(env, order) {
    var key = 'index:' + order.created + ':' + order.reference;
    await env.ORDERS.put(key, order.reference, { metadata: { status: order.status } });
}

async function rateLimited(env, ip) {
    if (!ip) return false;
    var key = 'rate:' + ip + ':' + Math.floor(Date.now() / MS_PER_HOUR);
    var n = parseInt(await env.ORDERS.get(key) || '0', 10);
    if (n >= MAX_ORDERS_PER_HOUR) return true;
    await env.ORDERS.put(key, String(n + 1), { expirationTtl: RATE_COUNTER_TTL });
    return false;
}

// ===== OWNER AUTH =====

// A shared secret, not a Firebase session: these routes are called from an ops
// tool and from the Strike worker, not from a logged-in browser. Compared in
// constant time so a wrong guess reveals nothing about how wrong it was.
function constantEquals(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

function isOwner(request, env) {
    var header = request.headers.get('Authorization') || '';
    var token = header.startsWith('Bearer ') ? header.slice(7) : '';
    return !!env.OPS_SECRET && constantEquals(token, env.OPS_SECRET);
}

// What the public may see. The delivery address and the contact are the
// customer's own, so they come back on their own reference — but the internal
// notes and the ops trail do not.
function publicView(order) {
    return {
        reference: order.reference,
        status: order.status,
        created: order.created,
        updated: order.updated,
        lines: order.totals.lines,
        totals: {
            units: order.totals.units, th: order.totals.th, kw: order.totals.kw,
            usd: order.totals.usd, unpriced: order.totals.unpriced,
            depositRate: order.totals.depositRate,
            deposit: order.totals.deposit, balance: order.totals.balance,
            asOf: order.totals.asOf
        },
        destination: order.destination,
        quoted: order.quoted || null,
        tracking: order.tracking || null,
        history: (order.history || []).map(function (h) {
            return { status: h.status, at: h.at };
        })
    };
}

export default {
    async fetch(request, env) {
        var origin = request.headers.get('Origin') || '';

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders(origin) });
        }

        var url = new URL(request.url);
        var path = url.pathname;

        if (path === '/ping') return jsonResponse({ ok: true, asOf: ASOF }, 200, origin);

        try {
            // ===== PLACE AN ORDER (public) =====
            if (path === '/orders' && request.method === 'POST') {
                if (!isAllowedOrigin(origin)) {
                    return jsonResponse({ error: 'Origin not allowed' }, 403, origin);
                }
                var ip = request.headers.get('CF-Connecting-IP') || '';
                if (await rateLimited(env, ip)) {
                    return jsonResponse({ error: 'Too many orders. Email us instead.' }, 429, origin);
                }

                var body = await request.json().catch(function () { return null; });
                if (!body) return jsonResponse({ error: 'Could not read the order' }, 400, origin);

                var totals = priceOrder(body.lines);
                if (totals.error) return jsonResponse({ error: totals.error }, 400, origin);

                var destination = readDestination(body.destination);
                if (destination.error) return jsonResponse({ error: destination.error }, 400, origin);

                var contact = readContact(body.contact);
                if (contact.error) return jsonResponse({ error: contact.error }, 400, origin);

                var now = new Date().toISOString();
                var order = {
                    reference: newReference(),
                    status: FLOW[0],
                    created: now,
                    updated: now,
                    totals: totals,
                    destination: destination,
                    contact: contact,
                    history: [{ status: FLOW[0], at: now }]
                };

                await putOrder(env, order);
                await indexOrder(env, order);

                // The reference is returned once and is the customer's only way
                // back to the order, so the page must show it prominently.
                return jsonResponse({
                    reference: order.reference,
                    status: order.status,
                    totals: {
                        units: totals.units, usd: totals.usd,
                        deposit: totals.deposit, balance: totals.balance,
                        depositRate: totals.depositRate, asOf: totals.asOf
                    }
                }, 201, origin);
            }

            // ===== READ AN ORDER (public, by reference) =====
            var one = path.match(/^\/orders\/([A-Za-z0-9-]{1,40})$/);
            if (one && request.method === 'GET') {
                var found = await getOrder(env, one[1]);
                if (!found) return jsonResponse({ error: 'No such order' }, 404, origin);
                return jsonResponse(publicView(found), 200, origin);
            }

            // ===== ADVANCE AN ORDER (owner) =====
            var advance = path.match(/^\/orders\/([A-Za-z0-9-]{1,40})\/status$/);
            if (advance && request.method === 'POST') {
                if (!isOwner(request, env)) {
                    return jsonResponse({ error: 'Unauthorized' }, 401, origin);
                }
                var target = await getOrder(env, advance[1]);
                if (!target) return jsonResponse({ error: 'No such order' }, 404, origin);

                var patch = await request.json().catch(function () { return {}; });
                var next = text(patch.status, 40);

                if (next === CANCELLED) {
                    // Always reachable. An order that cannot be cancelled is a
                    // support ticket waiting to happen.
                } else {
                    var from = stepOf(target.status), to = stepOf(next);
                    if (to < 0) return jsonResponse({ error: 'Unknown status: ' + next }, 400, origin);
                    if (target.status === CANCELLED) {
                        return jsonResponse({ error: 'Order is cancelled' }, 409, origin);
                    }
                    // One step, forward. Skipping is how an order reaches
                    // "shipped" without anyone having been paid.
                    if (to !== from + 1) {
                        return jsonResponse({
                            error: 'Cannot go from ' + target.status + ' to ' + next
                        }, 409, origin);
                    }
                }

                var at = new Date().toISOString();
                target.status = next;
                target.updated = at;
                target.history = (target.history || []).concat([{
                    status: next, at: at, note: text(patch.note, 500)
                }]);

                // The figures a person confirms with the distributor. These
                // REPLACE the indicative ones on the status page, which is the
                // whole point of quoting.
                if (patch.quoted) {
                    target.quoted = {
                        usd: Number(patch.quoted.usd) || null,
                        leadTime: text(patch.quoted.leadTime, 120),
                        freight: Number(patch.quoted.freight) || null,
                        at: at
                    };
                }
                if (patch.tracking) {
                    target.tracking = {
                        carrier: text(patch.tracking.carrier, 80),
                        number: text(patch.tracking.number, 120),
                        at: at
                    };
                }
                if (patch.invoice) {
                    target.invoice = target.invoice || {};
                    target.invoice[text(patch.invoice.leg, 20) || 'deposit'] = {
                        provider: text(patch.invoice.provider, 40),
                        id: text(patch.invoice.id, 120),
                        payUrl: text(patch.invoice.payUrl, 400),
                        at: at
                    };
                }

                await putOrder(env, target);
                return jsonResponse(publicView(target), 200, origin);
            }

            // ===== ASK FOR SOMETHING TO PAY (public, by reference) =====
            var payReq = path.match(/^\/orders\/([A-Za-z0-9-]{1,40})\/pay$/);
            if (payReq && request.method === 'POST') {
                if (!isAllowedOrigin(origin)) {
                    return jsonResponse({ error: 'Origin not allowed' }, 403, origin);
                }
                var payOrder = await getOrder(env, payReq[1]);
                if (!payOrder) return jsonResponse({ error: 'No such order' }, 404, origin);
                if (payOrder.status === CANCELLED) {
                    return jsonResponse({ error: 'Order is cancelled' }, 409, origin);
                }

                var payBody = await request.json().catch(function () { return {}; });
                var legName = text(payBody.leg, 20) || 'deposit';
                var leg = legOf(legName);
                if (!leg) return jsonResponse({ error: 'Unknown payment' }, 400, origin);

                var methodName = text(payBody.method, 20) || 'btc';
                if (!methodOf(methodName)) {
                    return jsonResponse({ error: 'Unknown payment method' }, 400, origin);
                }
                if (!methodAllowsLeg(methodName, legName)) {
                    return jsonResponse({
                        error: METHODS[methodName].label + ' is not available for that payment'
                    }, 409, origin);
                }

                payOrder.invoice = payOrder.invoice || {};
                var key = attemptKey(legName, methodName);
                var existing = payOrder.invoice[key];

                /* Any rail settling closes the leg for all of them. */
                if (legSettled(payOrder, legName)) {
                    return jsonResponse({ error: 'Already paid' }, 409, origin);
                }
                // Asking twice must not mint a second invoice. Without this a
                // refreshed tab leaves two live invoices for the same money,
                // and whichever gets paid strands the other.
                if (existing && existing.id) {
                    if (methodName === 'btc') {
                        var fresh = await Strike.quoteInvoice(env.STRIKE_API_KEY, existing.id);
                        return jsonResponse({
                            leg: legName, method: methodName, amount: existing.amount,
                            invoiceId: existing.id,
                            onchainAddress: existing.onchainAddress || '',
                            quote: Strike.failed(fresh) ? null : Strike.publicQuote(fresh),
                            reused: true
                        }, 200, origin);
                    }
                    if (methodName === 'card') {
                        /* A Checkout session can expire while the tab sits open.
                           Reuse it while it is still open; otherwise fall through
                           and make a new one rather than sending somebody to a
                           dead Stripe page. */
                        var live = await Stripe.getSession(env.STRIPE_SECRET_KEY, existing.id);
                        if (!Stripe.failed(live) && live.status === 'open' && live.url) {
                            return jsonResponse({
                                leg: legName, method: methodName, amount: existing.amount,
                                sessionId: existing.id, checkoutUrl: live.url, reused: true
                            }, 200, origin);
                        }
                    }
                    if (methodName === 'wire') {
                        return jsonResponse({
                            leg: legName, method: methodName, amount: existing.amount,
                            reference: payOrder.reference, reused: true
                        }, 200, origin);
                    }
                }

                // THE amount. From the order, not the request.
                var owed = leg.amount(payOrder);
                if (!(owed > 0)) {
                    return jsonResponse({ error: 'Nothing to pay on that leg' }, 400, origin);
                }

                /* WIRE collects nothing. It records the attempt and hands back
                   the reference the transfer must quote — that reference is the
                   only way an incoming payment gets matched to an order. */
                if (methodName === 'wire') {
                    payOrder.invoice[key] = {
                        id: 'wire_' + legName, method: 'wire', amount: owed,
                        settled: false, at: new Date().toISOString()
                    };
                    if (legName !== 'balance' && stepOf(payOrder.status) === stepOf('quoted')) {
                        payOrder = advanceTo(payOrder, 'deposit_invoiced', 'awaiting wire');
                    } else if (legName === 'balance' && stepOf(payOrder.status) === stepOf('po_placed')) {
                        payOrder = advanceTo(payOrder, 'balance_invoiced', 'awaiting wire');
                    }
                    await putOrder(env, payOrder);
                    return jsonResponse({
                        leg: legName, method: 'wire', amount: owed,
                        reference: payOrder.reference, reused: false
                    }, 201, origin);
                }

                /* CARD. A hosted Checkout session; card details never reach
                   this Worker. The URL is all the page gets. */
                if (methodName === 'card') {
                    if (!env.STRIPE_SECRET_KEY) {
                        return jsonResponse({ error: 'Card payment is not configured' }, 503, origin);
                    }
                    var back = text(payBody.returnTo, 300) || '';
                    if (back.indexOf('http') !== 0) back = ALLOWED_ORIGINS[0] + '/pay.html';
                    var session = await Stripe.createCheckoutSession(env.STRIPE_SECRET_KEY, {
                        reference: payOrder.reference,
                        leg: legName,
                        amountUsd: owed,
                        email: (payOrder.contact && payOrder.contact.email) || '',
                        description: LEGS[legName].label + ' — order ' + payOrder.reference,
                        successUrl: back + '?ref=' + encodeURIComponent(payOrder.reference) +
                                    '&leg=' + encodeURIComponent(legName) + '&method=card',
                        cancelUrl: back + '?ref=' + encodeURIComponent(payOrder.reference) +
                                   '&leg=' + encodeURIComponent(legName) + '&method=card'
                    });
                    if (Stripe.failed(session) || !session.id || !session.url) {
                        return jsonResponse({ error: 'Could not start a card payment' }, 502, origin);
                    }
                    payOrder.invoice[key] = {
                        id: session.id, method: 'card', amount: owed,
                        settled: false, at: new Date().toISOString()
                    };
                    if (legName !== 'balance' && stepOf(payOrder.status) === stepOf('quoted')) {
                        payOrder = advanceTo(payOrder, 'deposit_invoiced', 'card checkout opened');
                    }
                    await putOrder(env, payOrder);
                    return jsonResponse({
                        leg: legName, method: 'card', amount: owed,
                        sessionId: session.id, checkoutUrl: session.url, reused: false
                    }, 201, origin);
                }

                /* BITCOIN. */
                if (!env.STRIKE_API_KEY) {
                    return jsonResponse({ error: 'Payment is not configured' }, 503, origin);
                }
                var made = await Strike.createInvoice(
                    env.STRIKE_API_KEY, owed,
                    leg.label + ' for order ' + payOrder.reference,
                    'order_' + payOrder.reference + '_' + legName);
                if (Strike.failed(made) || !made.invoiceId) {
                    return jsonResponse({ error: 'Could not raise an invoice' }, 502, origin);
                }

                var quoted = await Strike.quoteInvoice(env.STRIKE_API_KEY, made.invoiceId);
                var chain = await Strike.createOnchainReceive(env.STRIKE_API_KEY);
                var address = Strike.failed(chain) ? '' : Strike.onchainAddressOf(chain);

                payOrder.invoice[key] = {
                    id: made.invoiceId, method: 'btc',
                    amount: owed,
                    onchainAddress: address,
                    settled: false,
                    at: new Date().toISOString()
                };

                if (legName === 'balance') {
                    if (stepOf(payOrder.status) === stepOf('po_placed')) {
                        payOrder = advanceTo(payOrder, 'balance_invoiced', 'invoice raised');
                    }
                } else if (stepOf(payOrder.status) === stepOf('quoted')) {
                    payOrder = advanceTo(payOrder, 'deposit_invoiced', 'invoice raised');
                }
                await putOrder(env, payOrder);

                return jsonResponse({
                    leg: legName, method: 'btc',
                    amount: owed,
                    invoiceId: made.invoiceId,
                    onchainAddress: address,
                    quote: Strike.failed(quoted) ? null : Strike.publicQuote(quoted),
                    reused: false
                }, 201, origin);
            }

            // ===== HAS IT BEEN PAID? (public, by reference) =====
            //
            // The browser asks; STRIKE answers. Nothing the page sends counts
            // as evidence — this route reads no body at all. A checkout that
            // advances because a script said 'paid' ships machines to anyone
            // who opens devtools.
            var payState = path.match(/^\/orders\/([A-Za-z0-9-]{1,40})\/payment$/);
            if (payState && request.method === 'GET') {
                var stOrder = await getOrder(env, payState[1]);
                if (!stOrder) return jsonResponse({ error: 'No such order' }, 404, origin);
                var stLeg = text(url.searchParams.get('leg'), 20) || 'deposit';
                if (!legOf(stLeg)) return jsonResponse({ error: 'Unknown payment' }, 400, origin);
                var stMethod = text(url.searchParams.get('method'), 20) || 'btc';
                if (!methodOf(stMethod)) {
                    return jsonResponse({ error: 'Unknown payment method' }, 400, origin);
                }

                /* Settled is settled, whichever rail did it. Somebody watching
                   the bitcoin panel must see a card payment land too, or they
                   will pay twice. */
                if (legSettled(stOrder, stLeg)) {
                    return jsonResponse({ leg: stLeg, state: 'PAID', status: stOrder.status,
                                          amount: leg0(stOrder, stLeg) }, 200, origin);
                }

                var rec = (stOrder.invoice || {})[attemptKey(stLeg, stMethod)];
                if (!rec || !rec.id) {
                    return jsonResponse({ leg: stLeg, method: stMethod, state: 'NONE',
                                          status: stOrder.status }, 200, origin);
                }

                /* A wire is confirmed by a person reading a bank statement, so
                   there is nothing to poll. Saying UNPAID would be true but
                   useless; AWAITING says what is actually happening. */
                if (stMethod === 'wire') {
                    return jsonResponse({ leg: stLeg, method: 'wire', state: 'AWAITING',
                                          status: stOrder.status, amount: rec.amount }, 200, origin);
                }

                /* A card is settled by the webhook and nothing else. This route
                   reports what the webhook already recorded; it never asks
                   Stripe and takes the answer as authority, because a session
                   can read as complete before the payment is actually captured. */
                if (stMethod === 'card') {
                    return jsonResponse({ leg: stLeg, method: 'card', state: 'UNPAID',
                                          status: stOrder.status, amount: rec.amount }, 200, origin);
                }

                if (!env.STRIKE_API_KEY) {
                    return jsonResponse({ error: 'Payment is not configured' }, 503, origin);
                }

                var live = await Strike.getInvoice(env.STRIKE_API_KEY, rec.id);
                if (Strike.failed(live)) {
                    // Unknown is not unpaid, and must never be reported as paid.
                    return jsonResponse({ leg: stLeg, method: 'btc', state: 'UNKNOWN',
                                          status: stOrder.status }, 200, origin);
                }

                if (Strike.isSettled(live)) {
                    settleLeg(stOrder, stLeg, 'btc', 'settled via Strike');
                    await putOrder(env, stOrder);
                    return jsonResponse({ leg: stLeg, method: 'btc', state: 'PAID',
                                          status: stOrder.status, amount: rec.amount }, 200, origin);
                }

                return jsonResponse({
                    leg: stLeg, method: 'btc',
                    state: Strike.isCancelled(live) ? 'EXPIRED' : 'UNPAID',
                    status: stOrder.status,
                    amount: rec.amount
                }, 200, origin);
            }

            // ===== STRIPE TELLS US A CARD WAS PAID =====
            //
            // The ONLY thing that may settle a card payment. The success
            // redirect proves nothing at all — anyone can open the return URL
            // with any query string on it, having paid nobody — so the
            // signature on this request is the whole of its authentication.
            //
            // Deliberately not origin-gated: Stripe is not a browser and sends
            // no Origin. The signature does that job instead.
            if (path === '/stripe/webhook' && request.method === 'POST') {
                var raw = await request.text();
                var verdict = await Stripe.verifyWebhook(
                    raw, request.headers.get('Stripe-Signature'),
                    env.STRIPE_WEBHOOK_SECRET, Date.now());
                if (!verdict.ok) {
                    /* Say nothing about WHY beyond the log. An endpoint that
                       explains which part of a signature failed is an endpoint
                       that helps somebody forge the next one. */
                    return jsonResponse({ error: 'Signature rejected' }, 400, origin);
                }

                var ev = verdict.event || {};
                if (ev.type !== 'checkout.session.completed') {
                    /* Acknowledged, so Stripe stops retrying, but nothing done. */
                    return jsonResponse({ received: true, ignored: ev.type || '' }, 200, origin);
                }

                var sess = (ev.data && ev.data.object) || {};
                var ref = text(sess.client_reference_id, 40);
                var hookOrder = ref ? await getOrder(env, ref) : null;
                if (!hookOrder) {
                    return jsonResponse({ received: true, ignored: 'no such order' }, 200, origin);
                }

                var hookLeg = text(sess.metadata && sess.metadata.leg, 20) || 'deposit';
                if (!legOf(hookLeg)) {
                    return jsonResponse({ received: true, ignored: 'unknown leg' }, 200, origin);
                }

                /* The amount Stripe says it collected must be the amount this
                   order says is owed. A session created against one order and
                   replayed at another, or an amount edited anywhere along the
                   way, dies here rather than marking something paid cheaply. */
                var owedCents = Stripe.cents(legOf(hookLeg).amount(hookOrder));
                var gotCents = Math.round(Number(sess.amount_total));
                if (!isFinite(gotCents) || gotCents !== owedCents) {
                    return jsonResponse({
                        received: true, ignored: 'amount mismatch'
                    }, 200, origin);
                }
                if (String(sess.payment_status || '').toLowerCase() !== 'paid') {
                    return jsonResponse({ received: true, ignored: 'not paid' }, 200, origin);
                }

                /* Stripe retries until it gets a 2xx, so the same event arrives
                   more than once as a matter of course. settleLeg is the guard:
                   the second call finds the leg closed and changes nothing. */
                if (settleLeg(hookOrder, hookLeg, 'card', 'settled by Stripe webhook')) {
                    await putOrder(env, hookOrder);
                }
                return jsonResponse({ received: true }, 200, origin);
            }

            // ===== LIST ORDERS (owner) =====
            if (path === '/orders' && request.method === 'GET') {
                if (!isOwner(request, env)) {
                    return jsonResponse({ error: 'Unauthorized' }, 401, origin);
                }
                var listed = await env.ORDERS.list({ prefix: 'index:', limit: 200 });
                var out = [];
                for (var k = 0; k < listed.keys.length; k++) {
                    var ref = listed.keys[k].name.split(':').pop();
                    var rec = await getOrder(env, ref);
                    if (rec) {
                        out.push({
                            reference: rec.reference, status: rec.status,
                            created: rec.created, updated: rec.updated,
                            units: rec.totals.units, usd: rec.totals.usd,
                            deposit: rec.totals.deposit,
                            company: rec.contact.company || rec.contact.name,
                            email: rec.contact.email,
                            destination: rec.destination.kind
                        });
                    }
                }
                out.reverse();   // newest first; the index key is created-time ascending
                return jsonResponse({ orders: out }, 200, origin);
            }

            return jsonResponse({ error: 'Not found' }, 404, origin);
        } catch (e) {
            // Never leak a stack to a public endpoint.
            return jsonResponse({ error: 'Order could not be processed' }, 500, origin);
        }
    }
};

// Exported for the test suite, which runs this file under Node rather than
// against a deployed Worker.
export const __test = { priceOrder, splitDeposit, cents, METHODS, methodOf, methodAllowsLeg,
                        attemptKey, legSettled, settleLeg, LEGS, legOf, advanceTo, readDestination, readContact, newReference,
                        REF_SHAPE, FLOW, CANCELLED, stepOf, publicView, constantEquals };
