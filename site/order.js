/* ===== PROTON MINING — the order status page =====

   Looks an order up by its reference and shows where it has got to, including
   the steps that are a person rather than a machine.

   That honesty is the point. Two steps in this flow — confirming the price with
   a distributor, and placing the purchase order — are somebody picking up the
   phone, because no ASIC distributor exposes an ordering API. A progress bar
   that implied otherwise would be lying to someone who has paid a deposit, so
   those steps are labelled as ours to do.

   Nothing here measures the page. */

(function () {
    'use strict';

    /* Where the service is, what to say when it is not there, and the fetch
       itself all live in orders-api.js — three copies of this drifted twice
       before it was pulled out. */
    function ordersBase() { return OrdersAPI.base(); }
    function isLocal() { return OrdersAPI.isLocal(); }

    function $(id) { return document.getElementById(id); }

    function money(v) {
        if (v === null || v === undefined || !isFinite(v)) return '—';
        return '$' + Number(v).toLocaleString('en-US', {
            minimumFractionDigits: Number(v) % 1 ? 2 : 0,
            maximumFractionDigits: 2
        });
    }
    function dec(v, dp) {
        return Number(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
    }
    function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
    function param(name) {
        var m = new RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
        return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
    }
    function show(id, on) { var el = $(id); if (el) el.hidden = !on; }

    function fail(why) {
        if (order.demo) flagDemo(true);
        show('ordLoading', false);
        show('ordLive', false);
        show('ordError', true);
        var el = $('ordErrorWhy');
        if (el) el.textContent = why;
    }

    /* The lifecycle as a customer should read it. `ours` marks the steps nobody
       can automate — see the file header. */
    var STEPS = [
        { key: 'quote_requested',  label: 'Order received' },
        { key: 'quoted',           label: 'Price and lead time confirmed with our distributor', ours: true },
        { key: 'deposit_invoiced', label: 'Deposit invoiced' },
        { key: 'deposit_paid',     label: 'Deposit received' },
        { key: 'po_placed',        label: 'Purchase order placed with the distributor', ours: true },
        { key: 'balance_invoiced', label: 'Balance invoiced' },
        { key: 'balance_paid',     label: 'Balance received' },
        { key: 'shipped',          label: 'Shipped' },
        { key: 'delivered',        label: 'Delivered' }
    ];

    function stepIndex(status) {
        for (var i = 0; i < STEPS.length; i++) if (STEPS[i].key === status) return i;
        return -1;
    }

    function renderSteps(order) {
        var host = $('ordSteps');
        if (!host) return;

        if (order.status === 'cancelled') {
            host.innerHTML = '<li class="ord-step is-cancelled">' +
                '<span class="ord-step-label">This order was cancelled</span>' +
                '<span class="ord-step-when">Email us if that is not what you expected.</span></li>';
            return;
        }

        var at = stepIndex(order.status);
        var when = {};
        (order.history || []).forEach(function (h) { if (!when[h.status]) when[h.status] = h.at; });

        host.innerHTML = STEPS.map(function (s, i) {
            var state = i < at ? 'is-done' : i === at ? 'is-now' : 'is-todo';
            var stamp = when[s.key]
                ? new Date(when[s.key]).toLocaleDateString('en-US',
                    { year: 'numeric', month: 'short', day: 'numeric' })
                : (i === at ? 'In progress' : '');
            return '<li class="ord-step ' + state + (s.ours ? ' is-ours' : '') + '">' +
                '<span class="ord-step-label">' + esc(s.label) +
                    (s.ours ? '<span class="ord-step-ours">our side</span>' : '') + '</span>' +
                '<span class="ord-step-when">' + esc(stamp) + '</span>' +
            '</li>';
        }).join('');
    }

    function renderLines(order) {
        var host = $('ordLines');
        if (!host) return;
        host.innerHTML = (order.lines || []).map(function (l) {
            return '<tr>' +
                '<td class="hw-name">' + esc(l.model) + '</td>' +
                '<td>' + Number(l.hashrate).toLocaleString('en-US') + ' TH/s</td>' +
                '<td>' + Number(l.power).toFixed(3) + ' kW</td>' +
                '<td>' + (l.each === null ? '<span class="hw-noprice">On request</span>' : money(l.each)) + '</td>' +
                '<td>' + l.qty + '</td>' +
                '<td>' + (l.total === null ? '<span class="hw-noprice">On request</span>' : money(l.total)) + '</td>' +
            '</tr>';
        }).join('');
    }

    function renderDest(order) {
        var el = $('ordDest');
        if (!el) return;
        var d = order.destination || {};
        if (d.kind === 'ion') {
            /* NAME THE SITE THEY CHOSE. The generic line below is the right thing to say to
               somebody who left it to us, and a flat contradiction to somebody who picked
               Texas on the way in and has just paid for it — this is the last screen in the
               purchase, and it is the one they screenshot.

               The site is looked up from the id on the order rather than from anything held in
               this browser: the order is the record, and it is what ops will ship against. */
            var site = (typeof Facilities !== 'undefined' && d.site_id)
                ? Facilities.byId(d.site_id) : null;
            if (site) {
                el.textContent = 'An Proton facility ' + String.fromCharCode(8212) + ' ' +
                    site.name + ', ' + site.region + '. Power ' + Facilities.powerLabel(site) +
                    ', indicative and confirmed on your hosting agreement. ' +
                    'Your machines are delivered straight to the site that will run them.';
                return;
            }
            el.textContent = 'An Proton facility — we host them for you. We will confirm which site has capacity for a fleet this size.';
            return;
        }
        var parts = [d.facility, d.street, d.city, d.region, d.postcode, d.country]
            .filter(function (x) { return x; });
        el.textContent = (d.kind === 'third' ? 'A third-party facility: ' : 'Your own site: ') +
            (parts.length ? parts.join(', ') : 'address to be confirmed') +
            (d.attention ? '  (attn: ' + d.attention + ')' : '');
    }

    /* Say it, wherever it applies. A page that is quietly pretending is worse
       than one that cannot run at all. */
    function flagDemo(on) {
        var el = document.getElementById('demoFlag');
        if (el) el.hidden = !on;
    }
    function render(order) {
        $('ordRef').textContent = order.reference;
        var t = order.totals || {};
        $('ordUnits').textContent = Number(t.units).toLocaleString('en-US');
        $('ordHash').textContent = dec(t.th, 0) + ' TH/s';
        $('ordPower').textContent = dec(t.kw, 2) + ' kW';
        $('ordCost').textContent = money(t.usd);
        $('ordDeposit').textContent = money(t.deposit);
        $('ordBalance').textContent = money(t.balance);

        /* Once a real quote exists it replaces the indicative figure, because
           after that point the indicative one is noise at best. */
        var q = $('ordQuoted');
        if (q) {
            if (order.quoted && order.quoted.usd) {
                q.textContent = 'Quoted at ' + money(order.quoted.usd) +
                    (order.quoted.leadTime ? ', lead time ' + order.quoted.leadTime : '') +
                    (order.quoted.freight ? ', freight ' + money(order.quoted.freight) : '') +
                    '. This supersedes the indicative figure above.';
                q.hidden = false;
            } else {
                q.hidden = true;
            }
        }

        renderSteps(order);
        renderLines(order);
        renderDest(order);

        /* Only offer to pay what is actually payable now. */
        var pay = $('ordPay');
        if (pay) {
            var at = stepIndex(order.status);
            var owedLeg = null;
            if (order.status !== 'cancelled') {
                if (at >= 0 && at < stepIndex('deposit_paid')) owedLeg = 'deposit';
                else if (at >= stepIndex('po_placed') && at < stepIndex('balance_paid')) owedLeg = 'balance';
            }
            if (owedLeg && ordersBase()) {
                pay.href = './pay.html?ref=' + encodeURIComponent(order.reference) + '&leg=' + owedLeg;
                pay.textContent = owedLeg === 'deposit'
                    ? 'Pay the deposit — ' + money(t.deposit)
                    : 'Pay the balance — ' + money(t.balance);
                pay.hidden = false;
            } else {
                pay.hidden = true;
            }
        }

        show('ordLoading', false);
        show('ordLive', true);
    }

    function init() {
        if (!$('ordLive')) return;
        var ref = param('ref');
        if (!ref) {
            fail('This link is missing its order reference. Use the link from your order confirmation.');
            return;
        }
        if (!ordersBase()) {
            fail('Order tracking is not switched on yet. Email hosting@protonminingco.com with reference ' +
                 ref + ' and we will tell you where it stands.');
            return;
        }
        OrdersAPI.get('/orders/' + encodeURIComponent(ref))
            .then(function (r) {
                if (!r.ok || !r.body || !r.body.reference) {
                    throw new Error((r.body && r.body.error) || 'No order with that reference');
                }
                render(r.body);
            })
            .catch(function (err) {
                fail(OrdersAPI.explain(err));
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
