/* ===== ION MINING GROUP — hardware catalogue =====

   Browse the machines and set quantities. What is chosen goes into cart.js,
   which is shared with the checkout and survives leaving the page — quantities
   used to live in this page's DOM, so picking eight machines and then following
   a link threw the whole order away.

   NOT a checkout, and that is a business fact rather than a missing feature.
   Ion sources per order rather than holding stock, so a price and a delivery
   date are confirmed against a distributor per order. Taking money at the moment
   someone clicks would be promising something not yet sourced. cart.html carries
   the order to a deposit and stops there.

   Specs come from miner-db.js, which is the app's own table — hashrate and draw
   do not change once a machine ships, so they are stated flatly. Prices come
   from price-list.js, which is dated and indicative, and the page says so.

   Nothing here measures the page. */

(function () {
    'use strict';

    function $(id) { return document.getElementById(id); }
    function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : d; }

    function money(v) {
        if (v === null || !isFinite(v)) return '—';
        return '$' + Math.round(v).toLocaleString('en-US');
    }
    function dec(v, dp) {
        return v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
    }

    function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /* ---------- the catalogue ---------- */

    /* Best efficiency first. J/TH is what decides the running cost of a hosted
       machine, so it is the number a hosting customer should be sorting on
       whether or not they know it yet. */
    function models() {
        if (typeof MinerDB === 'undefined') return [];
        return MinerDB.getAll().slice().sort(function (a, b) {
            return a.efficiency - b.efficiency;
        });
    }

    function priceOf(model) {
        return (typeof PriceList !== 'undefined') ? PriceList.priceFor(model) : null;
    }

    /* One row per machine, best efficiency first.

       This was briefly a card per machine. Twenty-eight cards is a very long
       page for something whose job is comparison — the whole point of the
       catalogue is reading J/TH and price down a column, which a list does and
       stacked cards do not. So: rows, with more air in them.

       The quantity control is the one thing kept from the cards. It is the
       site's own input anatomy — a .calc-unit with the minus and plus as
       .cu-pre / .cu-post affix chips — rather than the bare number field with
       the browser's spinner arrows this column carried originally.

       Keyed by MODEL, not by row position. The checkout keys the same way, so a
       quantity means the same thing on both pages, and a catalogue that gains or
       loses a machine cannot silently shift somebody's saved order onto its
       neighbour. */

    /* ---------- What a machine actually earns ----------

       The catalogue answered "what is it" and left "is it any good" to a link.
       Efficiency sorts the table and efficiency is a real answer, but to a
       different question: J/TH says which machine is cheapest to RUN, not which
       is the best BUY. A machine can be the most efficient on the page and still
       take three years to pay for itself.

       THE FORMULA IS NOT WRITTEN HERE. calc-engine.js already carries it, the
       calculator already uses it, and it has been corrected more than once for
       things that were wrong in ways nobody noticed. A second copy on this page
       would be a second thing to get wrong — the exact shape of the bug this
       codebase keeps finding: miner-db's cost beside price-list's usd, one
       catalogue in the browser and another in the Worker. So this asks the
       engine for a one-machine, one-period projection and reads its day-one
       figures.

       WHAT IS LIVE AND WHAT IS NOT. BTC price and network difficulty are
       fetched from the same two endpoints calculator.js uses, so this adds no
       host the privacy page does not already disclose. The power price is the
       visitor's and starts empty — see the comment in hardware.html. */

    var market = { btcPrice: 96000, difficultyT: 125.86, live: false };

    function elecCost() {
        var f = $('hwElec');
        if (!f) return null;
        var v = parseFloat(f.value);
        /* Blank means "not told", which is not the same as zero. Zero is a real
           answer — a flared-gas site with no power bill — and must compute. */
        return (f.value === '' || !isFinite(v) || v < 0) ? null : v;
    }

    /* Day-one economics for ONE machine. Nulls rather than zeros where an input
       is missing, so the table can tell "nothing to show" from "shows nothing". */
    function econFor(m) {
        if (typeof CalcEngine === 'undefined') return null;
        var elec = elecCost();
        var r = CalcEngine.computeProjection({
            btcPrice: market.btcPrice,
            difficulty: market.difficultyT,
            hashrate: m.hashrate,
            power: m.power,
            machineCount: 1,
            investPeriod: 1,
            elecCost: elec === null ? 0 : elec,
            /* Gross on purpose. Pool fee and uptime belong to the operator, this
               page does not know them, and the caption says the figure is before
               both. A default 2% fee and 98% uptime would be two more
               assumptions smuggled into a number presented as arithmetic. */
            poolFee: 0,
            uptime: 100
        });
        var price = priceOf(m.model);
        var profit = elec === null ? null : r.dailyProfitDay1;
        return {
            revenue: r.dailyRevenueDay1,
            profit: profit,
            /* Payback needs a price AND a profit, and only means anything while
               the profit is positive. Above some power price a machine never
               pays back, and a five-figure day count would be a worse answer
               than an empty cell. */
            paybackDays: (price === null || profit === null || profit <= 0)
                ? null : (price / profit)
        };
    }

    function usd(v) {
        var a = Math.abs(v).toLocaleString('en-US',
                    { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return (v < 0 ? '\u2212' : '') + '$' + a;
    }

    function paybackText(days) {
        if (days === null) return '';
        if (days < 365) return Math.round(days) + ' days';
        var y = days / 365;
        return y.toFixed(y < 10 ? 1 : 0) + ' yr';
    }

    /* ---------- the two live figures ----------

       Every failure path keeps the seeded number. A catalogue that refused to
       show a revenue column because an API was down would be worse than one
       showing a slightly stale figure, and the caption already says the figure
       moves. The note only ever upgrades to "live" — it never announces a
       failure, because a visitor cannot act on one. */
    var MARKET = {
        btcPrice: {
            url: 'https://api.coinbase.com/v2/prices/BTC-USD/spot',
            read: function (b) { var j = JSON.parse(b); return j && j.data ? parseFloat(j.data.amount) : NaN; }
        },
        difficultyT: {
            /* A bare number in absolute terms; we hold it in trillions. */
            url: 'https://blockchain.info/q/getdifficulty',
            read: function (b) { return parseFloat(b) / 1e12; }
        }
    };

    function noteMarket() {
        var note = $('hwMarketNote');
        if (!note || !market.live || note.querySelector('.hw-live')) return;
        var tag = document.createElement('strong');
        tag.className = 'hw-live';
        tag.textContent = 'Live. ';
        note.insertBefore(tag, note.firstChild);
    }

    function fetchMarket() {
        if (typeof fetch !== 'function') return;
        var want = 0, got = 0, k;
        for (k in MARKET) if (MARKET.hasOwnProperty(k)) want++;
        Object.keys(MARKET).forEach(function (key) {
            fetch(MARKET[key].url, { cache: 'no-store' })
                .then(function (r) { return r.ok ? r.text() : null; })
                .then(function (body) {
                    if (body === null) return;
                    var v = MARKET[key].read(body);
                    if (!isFinite(v) || v <= 0) return;
                    market[key] = v;
                    if (++got === want) market.live = true;
                    buildCatalogue();
                    syncInputs();
                    noteMarket();
                })
                .catch(function () { /* the seeded figure stands */ });
        });
    }

    function rowFor(m) {
        var p = priceOf(m.model);
        var e = econFor(m);
        var price = p === null
            ? '<span class="hw-noprice">On request</span>'
            : '<span class="hw-price">' + money(p) + '</span>';
        var held = (typeof Cart !== 'undefined') ? Cart.qtyOf(m.model) : 0;
        return '' +
        '<tr data-model="' + esc(m.model) + '">' +
          '<td class="hw-name">' + esc(m.model) + '</td>' +
          '<td>' + m.hashrate.toLocaleString('en-US') + ' TH/s</td>' +
          '<td>' + m.power.toFixed(3) + ' kW</td>' +
          '<td>' + m.efficiency.toFixed(1) + ' J/TH</td>' +
          '<td>' + price + '</td>' +
          /* An empty cell where no power price has been given reads as "not
             asked yet"; a dash would read as "no answer exists". */
          '<td class="hw-num">' + (e ? usd(e.revenue) : '') + '</td>' +
          '<td class="hw-num' + (e && e.profit !== null && e.profit < 0 ? ' hw-loss' : '') + '">' +
              (e && e.profit !== null ? usd(e.profit) : '') + '</td>' +
          '<td class="hw-num">' + (e ? paybackText(e.paybackDays) : '') + '</td>' +
          /* The column heading is the label here, so the field carries only an
             aria-label naming the machine — a visible "Quantity" per row would
             be twenty-eight repetitions of the header. */
          '<td class="hw-qty">' +
            '<div class="calc-unit">' +
              '<button type="button" class="cu-pre hw-step" data-step="-1" data-for="' + esc(m.model) + '" ' +
                  'aria-label="Quantity of ' + esc(m.model) + ', one fewer">&minus;</button>' +
              '<input type="number" min="0" step="1" value="' + held + '" ' +
                  'data-qty="' + esc(m.model) + '" aria-label="Quantity of ' + esc(m.model) + '">' +
              '<button type="button" class="cu-post hw-step" data-step="1" data-for="' + esc(m.model) + '" ' +
                  'aria-label="Quantity of ' + esc(m.model) + ', one more">+</button>' +
            '</div>' +
          '</td>' +
          '<td class="hw-see"><a href="./calculator.html?minerModel=' +
              encodeURIComponent(m.model) + '&amp;machineCount=10">Run the numbers</a></td>' +
        '</tr>';
    }

    function buildCatalogue() {
        var host = $('hwRows');
        if (!host) return;
        host.innerHTML = models().map(rowFor).join('');
    }

    /* Writing the quantity means writing both the property and the attribute.
       Only the property is what a browser reads back, and only the attribute is
       visible to the stylesheet: the cue on a row that has machines on it is a
       :has([value]) rule, and setting .value alone leaves the attribute reading
       "0" forever, so the cue never fires. */
    function setQty(input, n) {
        var v = String(Math.max(0, Math.round(n)));
        input.value = v;
        input.setAttribute('value', v);
    }

    /* The cart is the source of truth, so anything that changes it — a stepper
       here, a removal on the checkout, another tab — has to come back to the
       inputs rather than the inputs being trusted to already agree. */
    function syncInputs() {
        /* Never the field being typed into. Cart.set() runs on every keystroke,
           and normalising the value back would fight the caret: typing "007"
           becomes "0" the moment the second character lands. The input handler
           mirrors the attribute for that one field itself. */
        var typing = (typeof document.activeElement !== 'undefined') ? document.activeElement : null;
        Array.prototype.forEach.call(document.querySelectorAll('[data-qty]'), function (input) {
            if (input === typing) return;
            setQty(input, Cart.qtyOf(input.getAttribute('data-qty')));
        });
    }

    /* ---------- the order ---------- */

    function renderOrder() {
        var t = Cart.totals();
        var lines = Cart.lines();
        /* null means the spec table never loaded — a broken page rather than an
           empty order, and worth saying nothing about either way. */
        if (!t || !lines) return;
        var empty = t.units === 0;

        $('hwUnits').textContent = empty ? '—' : t.units.toLocaleString('en-US');
        $('hwHash').textContent = empty ? '—' : dec(t.th, 0) + ' TH/s';
        $('hwPower').textContent = empty ? '—' : dec(t.kw, 2) + ' kW';
        /* Indicative, and only for the lines that have a price on file. */
        $('hwCost').textContent = empty ? '—' : money(t.usd);

        var note = $('hwUnpriced');
        if (note) {
            note.textContent = t.unpriced
                ? t.unpriced + ' of those machines have no price on file and are not in the total.'
                : '';
            note.hidden = !t.unpriced;
        }

        /* Written out, so the checkout is not the only place the order can be
           read and the Copy button has something to copy. */
        var text = lines.map(function (l) {
            return l.qty + ' x ' + l.model +
                '  (' + l.hashrate + ' TH, ' + l.power.toFixed(3) + ' kW each' +
                (l.each === null ? ', price on request' : ', ' + money(l.each) + ' each') + ')';
        }).join('\n');
        var summary = empty ? '' : text + '\n\n' +
            'Total: ' + t.units + ' machines, ' + dec(t.th, 0) + ' TH/s, ' + dec(t.kw, 2) + ' kW\n' +
            'Indicative hardware: ' + money(t.usd) +
            (t.unpriced ? ' (excludes ' + t.unpriced + ' machines priced on request)' : '') + '\n' +
            'Prices indicative as of ' + (typeof PriceList !== 'undefined' ? PriceList.ASOF : '') +
            ', confirmed on quote.';

        var hidden = $('hwOrderText');
        if (hidden) hidden.value = summary;

        var pre = $('hwOrderPreview');
        if (pre) {
            pre.textContent = empty ? 'No machines selected yet.' : summary;
            pre.classList.toggle('is-empty', empty);
        }

        var submit = $('hwSubmit');
        if (submit) submit.disabled = empty;
        var copy = $('hwCopy');
        if (copy) copy.disabled = empty;

        /* The way on. Hidden while the order is empty, because a checkout button
           over nothing is a dead end dressed up as a next step. */
        var go = $('hwCheckout');
        if (go) go.hidden = empty;

        /* Send the whole order into the calculator: the largest line decides the
           model, and the unit count carries over. The scenario encoder on the
           calculator already reads both from the query string. */
        var runAll = $('hwRunAll');
        if (runAll) {
            if (empty) {
                runAll.hidden = true;
            } else {
                var biggest = lines.slice().sort(function (a, b) { return b.qty - a.qty; })[0];
                runAll.href = './calculator.html?minerModel=' + encodeURIComponent(biggest.model) +
                              '&machineCount=' + t.units;
                runAll.hidden = false;
            }
        }
    }

    /* ---------- wiring ---------- */

    function wireCopy() {
        var btn = $('hwCopy');
        if (!btn) return;
        var label = btn.textContent;
        var revert = null;
        function say(msg) {
            btn.textContent = msg;
            if (revert) clearTimeout(revert);
            revert = setTimeout(function () { btn.textContent = label; }, 2600);
        }
        btn.addEventListener('click', function () {
            var text = $('hwOrderText') ? $('hwOrderText').value : '';
            if (!text) return;
            var clip = (typeof navigator !== 'undefined') && navigator.clipboard;
            if (!clip || !clip.writeText) { say('Select it above and copy'); return; }
            clip.writeText(text).then(function () { say('Order copied'); },
                                      function () { say('Select it above and copy'); });
        });
    }

    function init() {
        if (!$('hwRows') || typeof MinerDB === 'undefined' || typeof Cart === 'undefined') return;
        buildCatalogue();

        var body = $('hwRows');
        /* Two listeners on the catalogue rather than three per row, so the
           handlers do not scale with the number of machines. */
        body.addEventListener('input', function (e) {
            if (!e.target || !e.target.hasAttribute || !e.target.hasAttribute('data-qty')) return;
            /* Mirror the typed value so the row lights the same way a stepped one
               does. Not setQty(): rewriting .value mid-keystroke fights the
               caret, which is also why this does not go through syncInputs. */
            var q = Math.max(0, Math.round(num(e.target.value, 0)));
            e.target.setAttribute('value', String(q));
            Cart.set(e.target.getAttribute('data-qty'), q);
        });
        body.addEventListener('click', function (e) {
            var btn = e.target.closest && e.target.closest('.hw-step');
            if (!btn) return;
            Cart.add(btn.getAttribute('data-for'), parseInt(btn.getAttribute('data-step'), 10));
        });

        var clear = $('hwClear');
        if (clear) clear.addEventListener('click', function () { Cart.clear(); });

        var asOf = $('hwAsOf');
        if (asOf && typeof PriceList !== 'undefined') asOf.textContent = PriceList.ASOF;

        /* One subscription drives everything: the totals, and the inputs
           themselves, so a change made in another tab or on the checkout lands
           here too. */
        Cart.onChange(function () { syncInputs(); renderOrder(); });

        wireCopy();
        syncInputs();
        renderOrder();
        /* Rebuilding the table replaces the quantity inputs, so the cart has to
           be painted back onto the fresh ones — the same thing Cart.onChange
           does for a change made in another tab. Without it, typing a power
           price silently reset every quantity on screen. */
        var elecField = $('hwElec');
        if (elecField) elecField.addEventListener('input', function () {
            buildCatalogue();
            syncInputs();
        });
        fetchMarket();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
