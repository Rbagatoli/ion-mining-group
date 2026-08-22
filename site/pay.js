/* ===== ION MINING GROUP — the payment page =====

   Asks the orders service to raise an invoice, shows what to send and where, and
   watches for it to settle.

   IT WATCHES; IT DOES NOT DECIDE. "Paid" is a state the service reports after
   asking Strike, never something this page concludes. Nothing here can mark an
   order paid, and the status endpoint it polls reads no body at all — a checkout
   that advances because a script said so ships machines to anyone who opens
   devtools.

   NO QR CODE, and that is deliberate rather than unfinished. Rendering one needs
   an encoder whose output cannot be verified from here — there is no decoder to
   check it against — and a QR that silently encodes the wrong address sends
   somebody's five figures somewhere unrecoverable. The app fetches QR images
   from api.qrserver.com, which would also hand this address to a third party.
   The address is shown in full instead, with a copy button and a wallet link.

   Nothing here measures the page. */

(function () {
    'use strict';

    /* Where the service is, what to say when it is not there, and the fetch
       itself all live in orders-api.js — three copies of this drifted twice
       before it was pulled out. */
    function ordersBase() { return OrdersAPI.base(); }
    function isLocal() { return OrdersAPI.isLocal(); }

    var POLL_MS = 6000;

    function $(id) { return document.getElementById(id); }

    function money(v) {
        if (v === null || v === undefined || !isFinite(v)) return '—';
        return '$' + Number(v).toLocaleString('en-US', {
            minimumFractionDigits: Number(v) % 1 ? 2 : 0,
            maximumFractionDigits: 2
        });
    }

    /* Grouped into fours. A bitcoin address is unreadable as one run of 42
       characters, and the only defence against a clipboard that lied is a human
       comparing a few groups against their wallet. */
    function grouped(addr) {
        return String(addr).replace(/(.{4})/g, '$1 ').trim();
    }

    function esc(v) {
        return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function param(name) {
        var m = new RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
        return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
    }

    function show(id, on) { var el = $(id); if (el) el.hidden = !on; }

    function fail(why) {
        show('payLoading', false);
        show('payLive', false);
        show('payDone', false);
        show('payError', true);
        var el = $('payErrorWhy');
        if (el) el.textContent = why;
    }

    /* ---------- copying ---------- */

    function wireCopy(btnId, getText) {
        var btn = $(btnId);
        if (!btn) return;
        var label = btn.textContent;
        var revert = null;
        btn.addEventListener('click', function () {
            var text = getText();
            if (!text) return;
            function say(msg) {
                btn.textContent = msg;
                if (revert) clearTimeout(revert);
                revert = setTimeout(function () { btn.textContent = label; }, 2600);
            }
            var clip = (typeof navigator !== 'undefined') && navigator.clipboard;
            if (!clip || !clip.writeText) { say('Select it and copy'); return; }
            clip.writeText(text).then(function () { say('Copied'); },
                                      function () { say('Select it and copy'); });
        });
    }

    /* ---------- state ---------- */

    var ref = '', leg = 'deposit', address = '', bolt11 = '', amount = null;
    var rail = 'btc';

    /* Cards are capped to the deposit. The page hides the option elsewhere,
       and the Worker refuses it independently — hiding a control is a
       courtesy, not a restriction. */
    function cardAllowed() { return leg === 'deposit'; }
    var timer = null;

    var LEG_TITLE = {
        deposit: 'Deposit',
        full: 'Payment in full',
        balance: 'Balance'
    };
    var LEG_NOTE = {
        deposit: 'This reserves the order. The balance falls due once the quote is agreed and before the machines ship.',
        full: 'This covers the whole order. Nothing further is due before shipping.',
        balance: 'This is the remainder of the order. The machines ship once it clears.'
    };

    /* Say it, wherever it applies. A page that is quietly pretending is worse
       than one that cannot run at all. */
    function flagDemo(on) {
        var el = document.getElementById('demoFlag');
        if (el) el.hidden = !on;
    }
    function paint(invoice) {
        amount = invoice.amount;
        address = invoice.onchainAddress || '';
        bolt11 = (invoice.quote && invoice.quote.bolt11) || '';

        $('payLegTitle').textContent = LEG_TITLE[leg] || 'Payment';
        $('payLegNote').textContent = LEG_NOTE[leg] || '';
        $('payAmount').textContent = money(amount);
        $('payRef').textContent = ref;

        var chain = $('payChain');
        if (address) {
            $('payAddr').textContent = grouped(address);
            /* BIP-21. The amount is deliberately absent: it is denominated in
               dollars and quoted into bitcoin by Strike, so putting a stale BTC
               figure in the URI would have wallets send the wrong amount. */
            $('payWallet').href = 'bitcoin:' + address;
            if (chain) chain.hidden = false;
        } else if (chain) {
            chain.hidden = true;
        }

        var ln = $('payLn');
        if (bolt11) {
            $('payBolt').textContent = bolt11;
            $('payLnWallet').href = 'lightning:' + bolt11;
            if (ln) ln.hidden = false;
        } else if (ln) {
            ln.hidden = true;
        }

        if (!address && !bolt11) {
            fail('The payment service returned no way to pay. Nothing has been charged.');
            return;
        }

        if (invoice.demo) {
            flagDemo(true);
            var wrap = $('paySettleWrap');
            if (wrap) wrap.hidden = false;
        }
        show('payLoading', false);
        show('payLive', true);
    }

    var RAIL_PANEL = { btc: ['payChain', 'payLn'], card: ['payCard'], wire: ['payWire'] };

    function showRail(which) {
        rail = which;
        Object.keys(RAIL_PANEL).forEach(function (r) {
            RAIL_PANEL[r].forEach(function (id) {
                var el = $(id);
                if (!el) return;
                /* Lightning only appears if there is an invoice for it. */
                var has = (id !== 'payLn') || !!bolt11;
                el.hidden = (r !== which) || !has;
            });
        });
        var picks = document.querySelectorAll('.pay-rail-pick');
        Array.prototype.forEach.call(picks, function (b) {
            var on = b.getAttribute('data-rail') === which;
            b.classList.toggle('is-on', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        /* Only the bitcoin rail is worth polling — a card is settled by the
           webhook and a wire by a person reading a statement. */
        if (which === 'btc' && !timer) timer = setInterval(poll, POLL_MS);
        if (which !== 'btc' && timer) { clearInterval(timer); timer = null; }
        if (which === 'wire') requestWire();
    }

    function wireRails() {
        var host = $('payRails');
        if (!host) return;
        var card = host.querySelector('[data-rail="card"]');
        if (card) card.hidden = !cardAllowed();
        host.addEventListener('click', function (e) {
            var b = e.target.closest && e.target.closest('.pay-rail-pick');
            if (b && !b.hidden) showRail(b.getAttribute('data-rail'));
        });
    }

    function setState(state, text) {
        var el = $('payState');
        if (!el) return;
        el.setAttribute('data-state', state);
        el.textContent = text;
    }

    function settled() {
        if (timer) { clearInterval(timer); timer = null; }
        show('payLive', false);
        show('payDone', true);
        var amt = $('payDoneAmount');
        if (amt) amt.textContent = money(amount) + ' received';
        var link = $('payDoneLink');
        if (link) link.href = './order.html?ref=' + encodeURIComponent(ref);
    }

    function poll() {
        OrdersAPI.get('/orders/' + encodeURIComponent(ref) +
                      '/payment?leg=' + encodeURIComponent(leg))
        .then(function (r) { return r.body; })
        .then(function (d) {
            if (!d) return;
            if (d.state === 'PAID') { settled(); return; }
            if (d.state === 'EXPIRED') {
                setState('expired', 'That quote expired before it was paid. Reload this page and a fresh one is issued — the amount owed has not changed.');
                return;
            }
            if (d.state === 'UNKNOWN') {
                /* Unknown is not unpaid. Say so plainly rather than showing a
                   customer who has just sent five figures the word "waiting". */
                setState('unknown', 'We cannot reach the payment network at the moment. If you have already sent it, it is not lost — this page will catch up.');
                return;
            }
            setState('waiting', 'Waiting for the payment to arrive…');
        })
        .catch(function () {
            setState('unknown', 'We cannot reach the payment network at the moment. If you have already sent it, it is not lost — this page will catch up.');
        });
    }

    function start() {
        /* Only WHICH payment. Never how much — the service prices it, and a
           page that could name its own amount is a donate button. */
        OrdersAPI.post('/orders/' + encodeURIComponent(ref) + '/pay', { leg: leg })
        .then(function (r) {
            if (r.status === 409 && r.body && /already paid/i.test(r.body.error || '')) {
                amount = null;
                settled();
                return;
            }
            if (!r.ok || !r.body || (!r.body.onchainAddress && !r.body.quote)) {
                throw new Error((r.body && r.body.error) || 'The payment service refused it');
            }
            paint(r.body);
            poll();
            /* showRail owns the timer, so it can stop polling when the
               customer switches to a rail with nothing to poll. */
            showRail(rail);
        }).catch(function (err) {
            fail(OrdersAPI.explain(err) + '  Nothing has been charged.');
        });
    }

    /* Cards. The Worker creates a hosted Checkout session and hands back a
       URL; this page does nothing but follow it. Card details never reach
       either of them.

       Coming back from Stripe proves nothing — the return URL is just a URL,
       and anyone can open it. The order only ever settles on the webhook. */
    function cardSays(msg) {
        var el = $('payCardWhy');
        if (!el) return;
        el.textContent = msg || '';
        el.hidden = !msg;
    }

    function wireCard() {
        var btn = $('payCardGo');
        if (!btn) return;
        btn.addEventListener('click', function () {
            btn.disabled = true;
            btn.textContent = 'Opening Stripe…';
            cardSays('');
            OrdersAPI.post('/orders/' + encodeURIComponent(ref) + '/pay',
                           { leg: leg, method: 'card', returnTo: location.origin + location.pathname })
            .then(function (r) {
                function done() { btn.disabled = false; btn.textContent = 'Pay by card'; }

                /* DEMO IS CHECKED FIRST. It answers with an empty checkoutUrl,
                   which the missing-URL guard below treats as a failure — so
                   ordering these the other way round made the demo branch
                   unreachable and reported a generic error instead. */
                if (r.body && r.body.demo) {
                    done();
                    cardSays('Card payment is simulated here. There is no Stripe key ' +
                             'configured, so there is nowhere real to send you — pick ' +
                             'bitcoin or wire to see the rest of the flow.');
                    return;
                }
                if (!r.ok || !r.body) {
                    done();
                    cardSays(((r.body && r.body.error) || 'Card payment could not be started') +
                             '. Nothing has been charged.');
                    return;
                }
                if (!r.body.checkoutUrl) {
                    done();
                    cardSays('Stripe did not return a checkout page. Nothing has been ' +
                             'charged — try bitcoin or wire, or email us.');
                    return;
                }
                window.location.href = r.body.checkoutUrl;
            })
            .catch(function (err) {
                btn.disabled = false;
                btn.textContent = 'Pay by card';
                cardSays((err && err.message ? err.message : 'Could not reach the payment service') +
                         '. Nothing has been charged.');
            });
        });
    }

    /* Wire. Nothing is collected — the page shows where to send it and the
       reference that makes it matchable. */
    var wireAsked = false;
    function requestWire() {
        if (wireAsked) return;
        wireAsked = true;
        paintBank();
        OrdersAPI.post('/orders/' + encodeURIComponent(ref) + '/pay',
                       { leg: leg, method: 'wire' })
        .then(function (r) {
            var el = $('payWireRef');
            if (el) el.textContent = (r.body && r.body.reference) || ref;
        })
        .catch(function () {
            var el = $('payWireRef');
            if (el) el.textContent = ref;
        });
    }

    function paintBank() {
        var host = $('payBank');
        if (!host || typeof BankDetails === 'undefined') return;
        host.innerHTML = BankDetails.all().map(function (d) {
            return '<div><dt>' + esc(d.label) + '</dt><dd' +
                   (BankDetails.isPlaceholder(d.value) ? ' class="ph"' : '') +
                   '>' + esc(d.value) + '</dd></div>';
        }).join('');

        /* Asking somebody to wire five figures against a placeholder account
           number would be unrecoverable, so the page says so plainly rather
           than quietly showing [BANK NAME] and hoping nobody tries. */
        var warn = $('payBankUnready');
        if (warn) {
            var missing = BankDetails.unfilled();
            warn.textContent = missing.length
                ? 'These bank details are not filled in yet (' + missing.join(', ') +
                  '). Do not send anything against them — email hosting@ionmininggroup.com ' +
                  'and we will send the real ones.'
                : '';
            warn.hidden = missing.length === 0;
        }
    }

    function wireSettle() {
        var btn = $('paySettle');
        if (!btn) return;
        btn.addEventListener('click', function () {
            btn.disabled = true;
            btn.textContent = 'Settling…';
            OrdersAPI.post('/orders/' + encodeURIComponent(ref) + '/settle', { leg: leg })
                .then(function () { poll(); })
                .catch(function () { btn.disabled = false; btn.textContent = 'Simulate the payment arriving'; });
        });
    }

    function init() {
        if (!$('payLive')) return;

        ref = param('ref');
        leg = param('leg') || 'deposit';
        if (!Object.prototype.hasOwnProperty.call(LEG_TITLE, leg)) leg = 'deposit';

        wireCopy('payCopyAddr', function () { return address; });
        wireSettle();
        wireCard();
        wireRails();
        wireCopy('payCopyRef', function () { return ref; });
        wireCopy('payCopyBolt', function () { return bolt11; });

        if (!ref) {
            fail('This link is missing its order reference. Use the link from your order confirmation email.');
            return;
        }
        if (!ordersBase()) {
            fail('Online payment is not switched on yet. Email hosting@ionmininggroup.com with your reference and we will send instructions.');
            return;
        }
        $('payRef').textContent = ref;
        start();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
