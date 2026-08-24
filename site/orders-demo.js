/* ===== PROTON MINING — the checkout, working with no backend =====

   A browser-side stand-in for the orders service, so the whole purchase path can
   be clicked through with any static file server, or straight off the
   filesystem, with nothing installed and nothing running.

   WHY THIS EXISTS. The real service is a Cloudflare Worker. Locally that needs a
   process serving the site and the API together, and requiring one meant the
   checkout looked broken to anyone who opened the site any other way — which is
   everyone, most of the time. A checkout you cannot click is not reviewable.

   WHAT IT IS NOT. It is not a payment system and it must never be mistaken for
   one. Three things keep it honest:

     - it only ever runs on localhost or file://, so no deployed page can reach
       it, and never when a real endpoint is configured;
     - every response it produces carries demo:true, and every page that renders
       one is required to say so on screen;
     - the address it shows is deliberate nonsense that no wallet will accept,
       so nothing can be sent to it by mistake.

   It reuses Cart.totals() for the figures rather than reimplementing pricing.
   price-list.js stays the single source, which is the same file the Worker's
   catalogue is generated from — there is a test that those two agree. */

var OrdersDemo = (function () {
    'use strict';

    var KEY = 'img.demo.orders.v1';

    /* Not a real address, and not a valid one: no wallet will accept it, so a
       demo invoice cannot become a real loss. */
    var FAKE_ADDRESS = 'DEMO-NOT-A-BITCOIN-ADDRESS-DO-NOT-SEND';

    var FLOW = ['quote_requested', 'quoted', 'deposit_invoiced', 'deposit_paid',
                'po_placed', 'balance_invoiced', 'balance_paid', 'shipped', 'delivered'];

    function load() {
        try { return JSON.parse(window.localStorage.getItem(KEY) || '{}') || {}; }
        catch (e) { return {}; }
    }
    function save(all) {
        try { window.localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) {}
    }

    var ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    function reference() {
        var out = '';
        for (var i = 0; i < 20; i++) {
            out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
        }
        return 'DEMO-' + out.slice(0, 4) + '-' + out.slice(4, 12) + '-' + out.slice(12, 20);
    }

    function text(v, max) {
        if (typeof v !== 'string') return '';
        return v.replace(/\s+/g, ' ').trim().slice(0, max || 400);
    }

    /* The same figures the summary shows, from the same table. */
    function priceIt(lines) {
        var t = (typeof Cart !== 'undefined') ? Cart.totals() : null;
        if (!t) return null;
        return {
            lines: (Cart.lines() || []).map(function (l) {
                return { model: l.model, qty: l.qty, hashrate: l.hashrate, power: l.power,
                         efficiency: l.efficiency, each: l.each, total: l.usd };
            }),
            units: t.units, th: t.th, kw: t.kw, usd: t.usd, unpriced: t.unpriced,
            depositRate: t.depositRate, deposit: t.deposit, balance: t.balance,
            asOf: (typeof PriceList !== 'undefined') ? PriceList.ASOF : ''
        };
    }

    function amountFor(order, leg) {
        if (leg === 'full') return order.totals.usd;
        if (leg === 'balance') return order.totals.balance;
        return order.totals.deposit;
    }

    function view(o) {
        return {
            demo: true,
            reference: o.reference, status: o.status,
            created: o.created, updated: o.updated,
            lines: o.totals.lines, totals: o.totals,
            destination: o.destination,
            quoted: o.quoted || null, tracking: o.tracking || null,
            history: o.history || []
        };
    }

    /* ---------- the same routes the Worker answers ---------- */

    function post(path, body) {
        var all = load();

        if (path === '/orders') {
            var totals = priceIt(body.lines);
            if (!totals || !totals.units) {
                return reject(400, 'The order is empty.');
            }
            var now = new Date().toISOString();
            var o = {
                reference: reference(), status: FLOW[0], created: now, updated: now,
                totals: totals,
                destination: body.destination || { kind: 'ion' },
                contact: body.contact || {},
                invoice: {},
                history: [{ status: FLOW[0], at: now }]
            };
            all[o.reference] = o;
            save(all);
            return resolve(201, {
                demo: true, reference: o.reference, status: o.status,
                totals: { units: totals.units, usd: totals.usd, deposit: totals.deposit,
                          balance: totals.balance, depositRate: totals.depositRate,
                          asOf: totals.asOf }
            });
        }

        var pay = /^\/orders\/([^/]+)\/pay$/.exec(path);
        if (pay) {
            var order = all[decodeURIComponent(pay[1])];
            if (!order) return reject(404, 'No such order.');
            var leg = text(body && body.leg, 20) || 'deposit';
            order.invoice = order.invoice || {};
            if (order.invoice[leg] && order.invoice[leg].settled) {
                return reject(409, 'Already paid');
            }
            var method = text(body && body.method, 20) || 'btc';
            /* The same cap the Worker enforces. A demo that allows what the
               real thing refuses teaches the wrong shape. */
            if (method === 'card' && leg !== 'deposit') {
                return reject(409, 'Card is not available for that payment.');
            }
            if (['btc', 'card', 'wire'].indexOf(method) < 0) {
                return reject(400, 'Unknown payment method.');
            }
            var owed = amountFor(order, leg);
            if (!(owed > 0)) return reject(400, 'Nothing to pay on that leg.');
            if (!order.invoice[leg]) {
                order.invoice[leg] = { id: 'demo_' + leg, amount: owed, settled: false };
                if (leg !== 'balance' && order.status === 'quoted') {
                    advance(order, 'deposit_invoiced');
                }
                save(all);
            }
            if (method === 'wire') {
                return resolve(201, {
                    demo: true, leg: leg, method: 'wire', amount: owed,
                    reference: order.reference, reused: false
                });
            }
            if (method === 'card') {
                /* No URL to send anyone to. The page checks for demo:true and
                   says so rather than navigating into nothing. */
                return resolve(201, {
                    demo: true, leg: leg, method: 'card', amount: owed,
                    sessionId: 'demo_session', checkoutUrl: '', reused: false
                });
            }
            return resolve(201, {
                demo: true, leg: leg, method: 'btc', amount: owed,
                invoiceId: order.invoice[leg].id,
                onchainAddress: FAKE_ADDRESS,
                quote: { bolt11: 'DEMO-INVOICE-NOT-PAYABLE', btc: '', expiresInSec: null },
                reused: false
            });
        }

        /* Demo only: the button that stands in for somebody actually paying. */
        var settle = /^\/orders\/([^/]+)\/settle$/.exec(path);
        if (settle) {
            var s = all[decodeURIComponent(settle[1])];
            if (!s) return reject(404, 'No such order.');
            var sLeg = text(body && body.leg, 20) || 'deposit';
            if (!s.invoice || !s.invoice[sLeg]) return reject(409, 'Nothing invoiced.');
            s.invoice[sLeg].settled = true;
            advance(s, sLeg === 'balance' ? 'balance_paid' : 'deposit_paid');
            save(all);
            return resolve(200, { demo: true, leg: sLeg, state: 'PAID', status: s.status });
        }

        return reject(404, 'Not found');
    }

    function get(path) {
        var all = load();

        var state = /^\/orders\/([^/]+)\/payment/.exec(path);
        if (state) {
            var o = all[decodeURIComponent(state[1])];
            if (!o) return reject(404, 'No such order.');
            var leg = (/[?&]leg=([^&]*)/.exec(path) || [])[1] || 'deposit';
            var rec = (o.invoice || {})[leg];
            if (!rec) return resolve(200, { demo: true, leg: leg, state: 'NONE', status: o.status });
            return resolve(200, {
                demo: true, leg: leg,
                state: rec.settled ? 'PAID' : 'UNPAID',
                status: o.status, amount: rec.amount
            });
        }

        var one = /^\/orders\/([^/?]+)/.exec(path);
        if (one) {
            var order = all[decodeURIComponent(one[1])];
            if (!order) return reject(404, 'No such order.');
            return resolve(200, view(order));
        }

        return reject(404, 'Not found');
    }

    function advance(order, to) {
        if (FLOW.indexOf(to) < 0) return;
        var at = new Date().toISOString();
        /* Fill in the steps skipped along the way, so the status page reads as a
           sequence rather than a jump. */
        var from = FLOW.indexOf(order.status);
        for (var i = from + 1; i <= FLOW.indexOf(to); i++) {
            order.history.push({ status: FLOW[i], at: at });
        }
        order.status = to;
        order.updated = at;
    }

    /* Answers shaped like the real ones, and deliberately not instant — a
       checkout that returns before the button has finished being pressed looks
       fake, and this is meant to show how the real one behaves. */
    function resolve(status, body) {
        return new Promise(function (done) {
            setTimeout(function () { done({ ok: status < 400, status: status, body: body }); }, 350);
        });
    }
    function reject(status, error) {
        return new Promise(function (done) {
            setTimeout(function () {
                done({ ok: false, status: status, body: { demo: true, error: error } });
            }, 350);
        });
    }

    return { get: get, post: post, KEY: KEY, FAKE_ADDRESS: FAKE_ADDRESS };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OrdersDemo;
