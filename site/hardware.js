/* ===== PROTON MINING — hardware catalogue =====

   Browse the machines and set quantities. What is chosen goes into cart.js,
   which is shared with the checkout and survives leaving the page — quantities
   used to live in this page's DOM, so picking eight machines and then following
   a link threw the whole order away.

   NOT a checkout, and that is a business fact rather than a missing feature.
   Proton sources per order rather than holding stock, so a price and a delivery
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

    /* Where it goes and what the power costs, appended to the pasted order.
     *
     * THIS BLOCK IS WHY THE ORDER HAS TO RE-RENDER ON A TERM CHANGE. Until now the copyable
     * summary was hardware only, so nothing in it could go stale; the moment it names a rate and
     * a total it has to be rebuilt whenever either moves. The checkout has printed the same
     * lines for a while — the catalogue page not printing them meant a customer who copied
     * their order here and mailed it to their finance team sent a fleet with no destination.
     *
     * Same order and wording as the checkout's block on purpose. Two pastes of the same order
     * that read differently is how a finance team ends up asking which one is real. */
    function orderExtras(t) {
        if (typeof Facilities === 'undefined') return '';
        var site = Facilities.chosen();
        if (!site) return '';

        var out = ['Destination: ' + site.name + ', ' + site.region];
        var term = (typeof Prepay !== 'undefined') ? Prepay.chosen() : null;

        /* THE LIST RATE IS LABELLED AS ONE once a term is discounting it. Printing "6.8c/kWh"
           over an electricity line worked out at 5.44c reads as a contradiction rather than as
           a before and after. */
        out.push('  power: ' + Facilities.powerLabel(site) +
                 (term ? ' list (indicative)' : ' (indicative)'));
        out.push('  status: ' + site.status);

        if (term) {
            var power = Prepay.totalFor(site, term, t.kw);
            out.push('  electricity: ' + term.label + ' at ' + Prepay.rateLabel(site, term) +
                     ' (indicative)');
            if (power !== null) {
                out.push('  electricity total: ' + money(power) +
                         ', due when the hosting agreement is signed');
                /* Stated the same way it is on screen. A pasted order that adds the two up
                   without saying they are paid apart is the one place the breakdown could still
                   mislead somebody. */
                out.push('  both together: ' + money(t.usd + power) +
                         ' (not a single payment)');
            }
        }

        if (Facilities.isFull(site)) {
            out.push('  NOTE: this site is fully occupied. Machines ordered now hold a place ' +
                     'on its waitlist; a date is confirmed before shipping.');
        }
        return out.join('\n') + '\n';
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

        renderItemised(t);

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
            orderExtras(t) +
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
        /* The prepaid totals are priced against the draw in the order, so they have to move
           when the order does — otherwise a customer adds three machines and the ladder is
           still quoting the sum for the two they had a moment ago. */
        Cart.onChange(function () { syncInputs(); renderOrder(); renderPrepay(); });

        renderFacility();
        wirePrepay();
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
            /* Emptying the box is how a customer asks for the site rate back — the alternative
               was a "reset" link, which is a second control for something the field can express
               on its own. */
            if (elecField.value === '') {
                autoElec = null;
                renderFacility();
            } else {
                var note = $('hwEconNote');
                if (note && autoElec !== null && elecField.value !== autoElec) {
                    renderFacility();
                }
            }
        });
        fetchMarket();
    }

    /* ---- the site these machines are being bought for ----

       Arrives as ?site= from a facility card and is remembered from there on, so the customer
       sees the same site named on the catalogue, in the cart and on the order. The three figures
       come from facilities.js rather than being written here: the number on this page and the
       number on the card have to be the same number, not two copies that agree today.

       SILENT WHEN NOTHING WAS CHOSEN. Most people reach the catalogue from the nav without going
       through the picker, and an empty box reading "no site selected" above a shop is noise that
       makes the page look broken. */
    function renderFacility() {
        var slot = document.getElementById('hwFacility');
        if (!slot || typeof Facilities === 'undefined') return;
        var site = Facilities.chosen();
        /* The chosen term goes in, so the power price on the banner is the one the customer
           will actually pay rather than the list rate. */
        var term = (typeof Prepay !== 'undefined') ? Prepay.chosen() : null;
        slot.innerHTML = site ? Facilities.bannerHtml(site, 'hardware', term) : '';
        renderPrepay();
        fillPowerPrice(site, term);

        /* AND THE ORDER ITSELF. Choosing a term is not a note pinned to the order, it changes
           what the order costs: the electricity line, the sum beside it and the pasted summary
           are all priced against the term. Re-rendering the ladder and the banner but not the
           box they sit next to left the order quoting the term before last — the same class of
           bug as the banner keeping a stale rate, one box further down the page. */
        renderOrder();
    }

    /* The two costs, named separately. Built by prepay.js so the catalogue and the checkout
       cannot end up quoting different figures for the same order. */
    function renderItemised(t) {
        var slot = $('hwItemised');
        if (!slot || typeof Prepay === 'undefined' || typeof Facilities === 'undefined') return;
        if (!t || !t.units) { slot.innerHTML = ''; return; }
        slot.innerHTML = Prepay.itemisedHtml({
            site: Facilities.chosen(),
            term: Prepay.chosen(),
            hardwareUsd: t.usd,
            kw: t.kw,
            units: t.units,
            depositRate: t.depositRate
        });
    }

    /* ---- the power price fills itself in ----

       This field decides the last two columns of the table, and until now it started empty with
       a note explaining that power is "the one figure only you know". That was true of somebody
       who walked in off the catalogue. It is not true of somebody who has just chosen a site and
       a prepaid term: at that point we know their rate exactly, and asking them to look it up
       and retype it is asking them to copy a number off the banner directly above.

       THE CUSTOMER STILL OWNS THE FIELD. `autoElec` remembers what was last written on their
       behalf. If the value in the box is still that, it is ours and may be updated when the term
       changes; the moment it differs, they have typed something and it is never touched again.
       A field that fights back while you are typing in it is worse than one that starts empty. */
    var autoElec = null;

    function fillPowerPrice(site, term) {
        var f = $('hwElec');
        var note = $('hwEconNote');
        if (!f) return;

        if (!site || typeof Prepay === 'undefined') {
            /* No site: leave whatever is there. Clearing it would throw away a figure the
               visitor typed before they went to pick one. */
            return;
        }

        var cents = term ? Prepay.rateFor(site, term) : site.powerCents;
        if (typeof cents !== 'number' || !isFinite(cents)) return;
        var usd = Math.round(cents / 100 * 1e6) / 1e6;
        var next = String(usd);

        var mine = (f.value === '' || (autoElec !== null && f.value === autoElec));
        if (mine && f.value !== next) {
            f.value = next;
            autoElec = next;
            /* Setting .value does not fire `input`, so the table has to be told. */
            if (typeof buildCatalogue === 'function') { buildCatalogue(); syncInputs(); }
        } else if (mine) {
            autoElec = next;
        }

        if (note) {
            note.innerHTML = mine
                ? 'Filled in from <strong>' + esc(site.name) + '</strong>' +
                  (term ? ' on the ' + esc(term.label) + ' rate' : '') +
                  '. Change it to model a different price &mdash; nothing here is locked, and ' +
                  'the last two columns follow whatever is in the box.'
                : 'Using the price you entered rather than ' + esc(site.name) +
                  '&rsquo;s. Clear the box to go back to the site rate.';
        }
    }

    /* ---- prepaid electricity, priced for this site ----

       THE LADDER IS THE SAME EVERYWHERE; THE RATES ARE NOT. One commercial policy — 4%, 12%,
       30% — applied to whichever site the customer chose on the way in. That is why this lives
       here rather than on the hosting page: there, with no site chosen, every figure would have
       to be a "from" price. Here it is the actual number for the actual site.

       Nothing is rendered at all without a site. A discount ladder floating above a catalogue
       with nothing to apply it to is a decoration that invites a customer to work out which of
       five rates it means. */
    function renderPrepay() {
        var slot = document.getElementById('hwPrepay');
        if (!slot || typeof Prepay === 'undefined' || typeof Facilities === 'undefined') return;

        var site = Facilities.chosen();
        if (!site) { slot.innerHTML = ''; return; }

        var picked = Prepay.chosen();
        /* The draw the customer is actually buying, so the prepaid sum is THEIR number rather
           than an example. Zero until there is something in the order, in which case only the
           rate is shown — a total of nothing is not a useful figure. */
        var kw = 0;
        try { kw = (Cart.totals() || {}).kw || 0; } catch (e) { kw = 0; }

        var cards = Prepay.all().map(function (t) {
            var on = picked && picked.id === t.id;
            var total = kw > 0 ? Prepay.totalFor(site, t, kw) : null;
            var saved = kw > 0 ? Prepay.savingFor(site, t, kw) : null;

            return '<button type="button" class="pp-tier pp-tier--pick' +
                    /* The flag on the term, not a duration read off it. See TERMS. */
                    (on ? ' is-on' : '') + (t.featured ? ' pp-tier--best' : '') +
                    '" data-term="' + esc(t.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
                '<span class="pp-head">' + esc(t.label) + '</span>' +
                '<span class="pp-body">' +
                    '<span class="pp-pct">' + esc(Prepay.pctLabel(t)) + ' off &middot; ' +
                        esc(t.note) + '</span>' +
                    '<span class="pp-rate">' + esc(Prepay.rateLabel(site, t)) + '</span>' +
                    '<span class="pp-from">at ' + esc(site.name) + '</span>' +
                    (total !== null
                        ? '<span class="pp-total">' + money(total) +
                          ' up front<br><span class="pp-saved">saves ' + money(saved) +
                          ' over ' + t.months + ' months at today&rsquo;s rate</span></span>'
                        : '<span class="pp-total pp-total--empty">Add machines to price the term</span>') +
                '</span>' +
                '<span class="pp-pick">' + (on ? 'Selected' : 'Choose this term') + '</span>' +
            '</button>';
        }).join('');

        slot.innerHTML =
            '<div class="pp-sec">' +
              '<div class="pp-sec-head">' +
                '<div>' +
                  '<div class="pp-sec-eyebrow">Prepaid electricity</div>' +
                  '<div class="pp-sec-title">Pay for power up front, pay less for it</div>' +
                '</div>' +
                (picked
                    ? '<button type="button" class="pp-clear">Pay monthly instead</button>'
                    : '') +
              '</div>' +
              '<div class="pp-grid">' + cards + '</div>' +
              '<p class="pp-note">' + esc(Prepay.INDICATIVE_NOTE) + '</p>' +
            '</div>';
    }

    function money(v) {
        if (typeof v !== 'number' || !isFinite(v)) return '&mdash;';
        return '$' + Math.round(v).toLocaleString('en-US');
    }

    function esc(v) {
        return String(v === undefined || v === null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function wirePrepay() {
        var slot = document.getElementById('hwPrepay');
        if (!slot) return;
        slot.addEventListener('click', function (e) {
            /* renderFacility(), NOT renderPrepay(). Choosing a term changes three things and
               the ladder is only one of them: the banner's power price is now that term's rate,
               and the box that drives the last two columns of the table has to follow it too.
               Re-rendering just the tiers left both of those showing the previous term — the
               ladder said one number and the banner above it said another. */
            var clear = e.target.closest && e.target.closest('.pp-clear');
            if (clear) { Prepay.clearChoice(); renderFacility(); return; }
            var b = e.target.closest && e.target.closest('.pp-tier--pick');
            if (!b) return;
            var id = b.getAttribute('data-term');
            /* Clicking the term already selected turns it OFF. Otherwise a customer who changes
               their mind about prepaying at all has no way back to paying monthly except by
               finding the small button, and the ladder becomes a one-way door. */
            var cur = Prepay.chosen();
            Prepay.choose(cur && cur.id === id ? null : id);
            renderFacility();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
