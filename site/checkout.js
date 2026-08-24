/* ===== PROTON MINING — the checkout page =====

   Renders what cart.js is holding, takes a destination, and produces an order a
   human can read. It does NOT take money, and that is a business fact rather
   than a missing feature: Proton sources per order rather than holding stock, so
   price and lead time are confirmed against a distributor per order. A deposit
   reserves the order once that quote is agreed — the page says so and charges
   nothing.

   Every commercial number here is indicative, including the deposit, which is a
   share of a total that is itself confirmed on the quote. price-list.js owns
   both the prices and the rate.

   Nothing here measures the page. */

(function () {
    'use strict';

    /* Where the service is, what to say when it is not there, and the fetch
       itself all live in orders-api.js — three copies of this drifted twice
       before it was pulled out. */
    function ordersBase() { return OrdersAPI.base(); }
    function isLocal() { return OrdersAPI.isLocal(); }


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
    function pct(r) {
        /* 0.25 reads as 25%, 0.275 as 27.5% — a trailing .0 on a rate looks like
           a precision nobody claimed. */
        var n = r * 100;
        return (Math.round(n * 10) / 10) + '%';
    }

    /* ---------- the lines ---------- */

    function rowFor(l) {
        var each = l.each === null
            ? '<span class="hw-noprice">On request</span>'
            : '<span class="hw-price">' + money(l.each) + '</span>';
        var line = l.usd === null
            ? '<span class="hw-noprice">On request</span>'
            : '<span class="hw-price">' + money(l.usd) + '</span>';
        return '' +
        '<tr data-model="' + esc(l.model) + '">' +
          '<td class="hw-name">' + esc(l.model) + '</td>' +
          '<td>' + l.hashrate.toLocaleString('en-US') + ' TH/s</td>' +
          '<td>' + l.power.toFixed(3) + ' kW</td>' +
          '<td>' + each + '</td>' +
          /* The same control as the catalogue, so changing a quantity here and
             changing it there are the same gesture. */
          '<td class="hw-qty">' +
            '<div class="calc-unit">' +
              '<button type="button" class="cu-pre hw-step" data-step="-1" data-for="' + esc(l.model) + '" ' +
                  'aria-label="Quantity of ' + esc(l.model) + ', one fewer">&minus;</button>' +
              '<input type="number" min="0" step="1" value="' + l.qty + '" ' +
                  'data-qty="' + esc(l.model) + '" aria-label="Quantity of ' + esc(l.model) + '">' +
              '<button type="button" class="cu-post hw-step" data-step="1" data-for="' + esc(l.model) + '" ' +
                  'aria-label="Quantity of ' + esc(l.model) + ', one more">+</button>' +
            '</div>' +
          '</td>' +
          '<td>' + line + '</td>' +
          '<td class="ck-drop">' +
            '<button type="button" class="ck-remove" data-remove="' + esc(l.model) + '" ' +
                'aria-label="Remove ' + esc(l.model) + ' from the order">Remove</button>' +
          '</td>' +
        '</tr>';
    }

    /* ---------- the order, written out ---------- */

    function orderText(lines, t) {
        var out = lines.map(function (l) {
            return l.qty + ' x ' + l.model +
                '  (' + l.hashrate + ' TH, ' + l.power.toFixed(3) + ' kW each' +
                (l.each === null ? ', price on request' : ', ' + money(l.each) + ' each') + ')';
        });

        out.push('');
        out.push('Total: ' + t.units + ' machines, ' + dec(t.th, 0) + ' TH/s, ' + dec(t.kw, 2) + ' kW');
        out.push('Indicative hardware: ' + money(t.usd) +
            (t.unpriced ? ' (excludes ' + t.unpriced + ' machines priced on request)' : ''));
        if (t.depositRate !== null) {
            out.push('Deposit to reserve (' + pct(t.depositRate) + '): ' + money(t.deposit));
            out.push('Balance before shipping: ' + money(t.balance));
        }
        out.push('Prices indicative as of ' +
            (typeof PriceList !== 'undefined' ? PriceList.ASOF : '') + ', confirmed on quote.');

        /* Where it goes, in the same block, because an order without a
           destination is half an order. */
        var dest = $('ck-dest');
        if (dest) {
            out.push('');
            var label = dest.options[dest.selectedIndex];
            out.push('Destination: ' + (label ? label.textContent : dest.value));
            /* Named in the copyable order too. This block is what a customer pastes into an
               email to their finance team, and a fleet's destination is the first thing that
               gets asked about. */
            var pickedT = dest.value === 'ion' ? chosenSite() : null;
            if (pickedT) {
                out.push('  site: ' + pickedT.name + ', ' + pickedT.region);
                /* LABELLED AS THE LIST RATE once a term is discounting it, exactly as on
                   the catalogue page. "6.8c/kWh" printed above an electricity line worked out
                   at 5.44c reads as a contradiction rather than as a before and after. */
                out.push('  power: ' + Facilities.powerLabel(pickedT) +
                         (chosenTerm() ? ' list (indicative)' : ' (indicative)'));
                out.push('  status: ' + pickedT.status);
                /* On the pasted order as well as on screen. This block is what a customer sends
                   to their finance team, and "when do they ship" is the first question it gets
                   asked — the answer has to travel with it. */
                var termT = chosenTerm();
                if (termT) {
                    out.push('  electricity: ' + termT.label + ' at ' +
                             Prepay.rateLabel(pickedT, termT) + ' (indicative)');
                }
                if (typeof Facilities !== 'undefined' && Facilities.isFull(pickedT)) {
                    out.push('  NOTE: this site is fully occupied. Machines ordered now hold a ' +
                             'place on its waitlist; a date is confirmed before shipping.');
                }
            }
            if (dest.value !== 'ion') {
                ['facility', 'attention', 'street', 'city', 'region', 'postcode', 'country']
                .forEach(function (name) {
                    var el = document.querySelector('[name="' + name + '"]');
                    if (el && el.value.trim()) out.push('  ' + name + ': ' + el.value.trim());
                });
            }
        }
        return out.join('\n');
    }

    /* ---------- rendering ---------- */

    /* Once an order has been placed this page stops being a cart and becomes a
       receipt. Without this, showPlaced() empties the cart, the emptying fires
       a re-render, and the re-render replaces the reference the customer was
       just given with "nothing in the order yet" — an order placed and
       instantly disowned, which is the one failure this page exists to avoid. */
    var placed = false;

    function render() {
        if (placed) return;
        var lines = Cart.lines();
        var t = Cart.totals();
        /* null means the spec table never loaded, which is a broken page rather
           than an empty order — say nothing rather than claiming it is empty. */
        if (!lines || !t) return;

        var empty = lines.length === 0;
        var emptyBox = $('ckEmpty'), body = $('ckBody');
        if (emptyBox) emptyBox.hidden = !empty;
        if (body) body.hidden = empty;
        if (empty) return;

        $('ckLines').innerHTML = lines.map(rowFor).join('');

        $('ckUnits').textContent = t.units.toLocaleString('en-US');
        $('ckHash').textContent = dec(t.th, 0) + ' TH/s';
        $('ckPower').textContent = dec(t.kw, 2) + ' kW';
        $('ckCost').textContent = money(t.usd);

        var rate = $('ckRate');
        if (rate) rate.textContent = t.depositRate === null ? '' : '(' + pct(t.depositRate) + ')';
        $('ckDeposit').textContent = money(t.deposit);
        $('ckBalance').textContent = money(t.balance);

        /* THE ITEMISATION IS SCOPED TO AN PROTON DESTINATION. A customer shipping to their own
           site is buying hardware from us and nothing else — inventing an electricity line
           for power they buy from their own utility would be inventing a charge. */
        var itSlot = $('ckItemised');
        if (itSlot && typeof Prepay !== 'undefined' && typeof Facilities !== 'undefined') {
            var destSel = $('ck-dest');
            var isIon = !destSel || destSel.value === 'ion';
            itSlot.innerHTML = Prepay.itemisedHtml({
                site: isIon ? chosenSite() : null,
                term: isIon ? chosenTerm() : null,
                hardwareUsd: t.usd,
                kw: t.kw,
                units: t.units,
                depositRate: t.depositRate
            });
        }

        var unpriced = $('ckUnpriced');
        if (unpriced) {
            unpriced.textContent = t.unpriced
                ? t.unpriced + ' of those machines have no price on file and are not in the total, the deposit or the balance.'
                : '';
            unpriced.hidden = !t.unpriced;
        }

        /* A saved order can outlive the catalogue it was built from. */
        var stale = Cart.stale() || [];
        var staleNote = $('ckStale');
        if (staleNote) {
            staleNote.textContent = stale.length
                ? (stale.length === 1 ? 'One machine' : stale.length + ' machines') +
                  ' in your saved order are no longer in the catalogue (' + stale.join(', ') +
                  '). They are not counted above. Mention them and we will tell you what replaced them.'
                : '';
            staleNote.hidden = stale.length === 0;
        }

        var text = orderText(lines, t);
        var hidden = $('ckOrderText');
        if (hidden) hidden.value = text;
        var pre = $('ckPreview');
        if (pre) pre.textContent = text;

        /* What each choice actually costs, beside the choice itself. Reading
           'deposit' and having to scroll back up to find out what that is in
           dollars is the kind of small friction that loses an order. */
        var legNote = $('ckLegNote');
        if (legNote) {
            legNote.textContent = legWanted() === 'full'
                ? 'You will be asked for ' + money(t.usd) + ' on the next page. Nothing further is due before shipping.'
                : 'You will be asked for ' + money(t.deposit) + ' on the next page. The remaining ' +
                  money(t.balance) + ' falls due once the quote is agreed and before the machines ship.';
        }

        var asOf = $('ckAsOf');
        if (asOf && typeof PriceList !== 'undefined') asOf.textContent = PriceList.ASOF;
    }

    /* ---------- wiring ---------- */

    function wireLines() {
        var host = $('ckLines');
        if (!host) return;

        /* Keyed by model rather than by index: a row can be removed while you
           are looking at it, and an index would then point at its neighbour. */
        host.addEventListener('input', function (e) {
            var el = e.target;
            if (!el || !el.getAttribute || !el.hasAttribute('data-qty')) return;
            Cart.set(el.getAttribute('data-qty'), Math.max(0, Math.round(num(el.value, 0))));
        });

        host.addEventListener('click', function (e) {
            if (!e.target.closest) return;

            var step = e.target.closest('.hw-step');
            if (step) {
                Cart.add(step.getAttribute('data-for'),
                         parseInt(step.getAttribute('data-step'), 10));
                return;
            }
            var drop = e.target.closest('.ck-remove');
            if (drop) Cart.remove(drop.getAttribute('data-remove'));
        });
    }

    /* The site chosen back on the hosting page, if there was one and facilities.js is loaded.
       Guarded rather than assumed: checkout.js is also loaded by pages that do not carry the
       facility module, and a ReferenceError here would take the whole checkout down. */
    function chosenSite() {
        if (typeof Facilities === 'undefined') return null;
        return Facilities.chosen();
    }

    /* The prepaid term picked back on the catalogue page, if any. Guarded the same way: this
       file is loaded by pages that do not carry the prepay module. */
    function chosenTerm() {
        if (typeof Prepay === 'undefined') return null;
        return Prepay.chosen();
    }

    function wireDestination() {
        var dest = $('ck-dest');
        if (!dest) return;
        function sync() {
            var ion = dest.value === 'ion';
            var addr = $('ckAddr'), note = $('ckIonNote');
            if (addr) addr.hidden = ion;

            /* THE NAMED SITE REPLACES THE GENERIC NOTE, it does not sit above it. The note says
               "we will confirm which of our sites has capacity", which is the right thing to say
               to somebody who has not chosen and a contradiction printed under the name of the
               site they did choose. */
            var picked = ion ? chosenSite() : null;
            var slot = $('ckFacility');
            if (slot) {
                /* THE TERM IS SHOWN WITH ITS RATE AND ITS SUM, not just its name. "3-year
                   prepaid" is a label; what a customer is agreeing to is a number of dollars
                   at a number of cents, and this is the last screen before they send it. */
                var term = picked ? chosenTerm() : null;
                var html = picked ? Facilities.bannerHtml(picked, 'cart', term) : '';
                if (term) {
                    /* THE TERM AND ITS RATE, BUT NOT THE SUM. The dollars live once, in the
                       itemised box above, which states them beside when they are due. Printing
                       the same figure here as well is how a page ends up with two numbers that
                       have to be kept in step by hand. */
                    html += '<div class="fac-prepay">' +
                        '<strong>' + esc(term.label) + '</strong> at ' +
                        esc(Prepay.rateLabel(picked, term)) +
                        ' &mdash; itemised with the order above' +
                        '<br><span class="fac-prepay-note">' +
                        esc(Prepay.INDICATIVE_NOTE) + '</span></div>';
                }
                slot.innerHTML = html;
            }
            if (note) note.hidden = !ion || !!picked;
            /* Required only once the fields are on screen — a hidden required
               field blocks submission with a message pointing at nothing. */
            ['ck-facility', 'ck-street', 'ck-city', 'ck-country'].forEach(function (id) {
                var el = $(id);
                if (el) { if (ion) el.removeAttribute('required'); else el.setAttribute('required', ''); }
            });
            render();
        }
        dest.addEventListener('change', sync);
        sync();
    }

    function wireCopy() {
        var btn = $('ckCopy');
        if (!btn) return;
        var label = btn.textContent;
        var revert = null;
        function say(msg) {
            btn.textContent = msg;
            if (revert) clearTimeout(revert);
            revert = setTimeout(function () { btn.textContent = label; }, 2600);
        }
        btn.addEventListener('click', function () {
            var text = $('ckOrderText') ? $('ckOrderText').value : '';
            if (!text) return;
            var clip = (typeof navigator !== 'undefined') && navigator.clipboard;
            if (!clip || !clip.writeText) { say('Select it above and copy'); return; }
            clip.writeText(text).then(function () { say('Order copied'); },
                                      function () { say('Select it above and copy'); });
        });
    }

    function wireClear() {
        var btn = $('ckClear');
        if (!btn) return;
        btn.addEventListener('click', function () {
            /* Emptying an order somebody spent time building is worth one
               question. Nothing else on this site confirms, because nothing else
               destroys anything. */
            if (typeof window.confirm === 'function' &&
                !window.confirm('Empty the whole order?')) return;
            Cart.clear();
        });
    }

    /* Anything typed into the destination changes the written order. */
    function wireOrderText() {
        var form = $('ckForm');
        if (!form) return;
        form.addEventListener('input', function (e) {
            if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-qty')) return;
            render();
        });
    }

    /* What the service is sent: models, counts, a destination and a contact.
       No prices. The totals on this page are for the customer to read; the
       service recomputes every figure from its own catalogue, because a number
       computed in a browser is a number the customer can change. */
    function payload() {
        var lines = (Cart.lines() || []).map(function (l) {
            return { model: l.model, qty: l.qty };
        });
        var dest = $('ck-dest');
        var kind = dest ? dest.value : 'ion';
        var destination = { kind: kind };

        /* WHICH Proton site, when the customer picked one. This is a shipping instruction, so it
           goes on the order rather than living only on screen: the machines are delivered to the
           facility that will run them, and "an Proton facility" is not an address.

           Only the ID is sent. The capacity and the rate shown next to it are Proton's own data and
           the service reads them from its own copy — the same rule the money already follows,
           where the browser sends models and counts and never a price. A browser that could name
           its own power rate on an order is a browser that can negotiate with itself. */
        if (kind === 'ion') {
            var picked = chosenSite();
            if (picked) destination.site_id = picked.id;
            /* Only the term ID. What it means is the service's, exactly as with the site. */
            var term = chosenTerm();
            if (term) destination.prepay_term = term.id;
        }
        if (kind !== 'ion') {
            ['facility', 'attention', 'street', 'city', 'region', 'postcode', 'country']
            .forEach(function (name) {
                var el = document.querySelector('[name="' + name + '"]');
                destination[name] = el ? el.value : '';
            });
        }
        function val(id) { var el = $(id); return el ? el.value : ''; }
        return {
            lines: lines,
            destination: destination,
            contact: {
                name: val('ck-name'), company: val('ck-company'),
                email: val('ck-email'), phone: val('ck-phone'),
                notes: val('ck-notes')
            }
        };
    }

    /* Deposit unless they asked to settle the whole thing. The AMOUNT for
       either is the service's to decide; this only carries which one. */
    /* Say it, wherever it applies. A page that is quietly pretending is worse
       than one that cannot run at all. */
    function flagDemo(on) {
        var el = document.getElementById('demoFlag');
        if (el) el.hidden = !on;
    }
    function legWanted() {

        var el = $('ck-leg');
        return (el && el.value === 'full') ? 'full' : 'deposit';
    }

    function showPlaced(reference) {
        placed = true;
        var empty = $('ckEmpty'); if (empty) empty.hidden = true;
        var body = $('ckBody'); if (body) body.hidden = true;
        var panel = $('ckPlaced');
        if (panel) panel.hidden = false;
        var ref = $('ckRef');
        if (ref) ref.textContent = reference;
        var link = $('ckRefLink');
        if (link) link.href = './order.html?ref=' + encodeURIComponent(reference);

        /* The deposit is the offered path and the full payment sits beside
           it, because most of this trade runs on deposits — but somebody who
           wants to settle the whole thing now should not have to ask. */
        var pay = $('ckPayNow');
        var dep = $('ckPayDeposit');
        var full = $('ckPayFull');
        if (dep) dep.href = './pay.html?ref=' + encodeURIComponent(reference) + '&leg=deposit';
        if (full) full.href = './pay.html?ref=' + encodeURIComponent(reference) + '&leg=full';
        if (pay) pay.hidden = false;
        /* The order has been taken, so it should stop being a cart. Cleared
           only after the reference is on screen — losing it would leave the
           customer with neither an order nor a way to find one. */
        Cart.clear();

        /* Straight to the payment page. The panel above is still filled in
           first, so if the navigation is blocked or slow the reference is on
           screen rather than lost. */
        var leg = legWanted();
        window.location.href = './pay.html?ref=' + encodeURIComponent(reference) +
                               '&leg=' + encodeURIComponent(leg);
    }

    function wireSubmit() {
        var form = $('ckForm');
        if (!form) return;

        /* No early return when nothing is configured. Bailing here left
           site.js's mail handler in charge of the checkout, which is how
           pressing the order button kept opening a mail window. The form
           declares no data-mailto now, so there is nothing to hand back to:
           this page owns the submit, and says so when it cannot complete. */

        var btn = $('ckSubmit');
        var label = btn ? btn.textContent : '';

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (!form.reportValidity()) return;
            if (Cart.isEmpty()) return;

            if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

            OrdersAPI.post('/orders', payload()).then(function (r) {
                if (!r.ok || !r.body || !r.body.reference) throw new Error(
                    (r.body && r.body.error) || 'The order service did not accept it');
                if (r.body.demo) flagDemo(true);
                showPlaced(r.body.reference);
            }).catch(function (err) {
                /* Never claim an order was placed. What to say next depends
                   entirely on WHERE this is running.

                   On localhost a failed fetch is a development problem — the
                   orders service is not running — and telling somebody to
                   email their own order to themselves is noise that reads as
                   the feature being broken. Say what to start.

                   Anywhere else it is a real customer whose order did not
                   land, and the mail draft is the fallback that gets it to
                   us. */
                if (btn) { btn.disabled = false; btn.textContent = label; }
                var note = $('ckFallback');
                var why = (err && err.message) ? err.message : 'no connection';
                /* Never open mail. The address is offered as something to copy,
                   not as a window that appears uninvited — that behaviour is
                   what made this look broken in the first place. */
                if (note) {
                    note.textContent = isLocal()
                        ? 'Your order was not placed. ' + OrdersAPI.explain(err)
                        : 'Your order was not placed (' + why + '). Nothing was charged. ' +
                          'Copy the order above and email it to hosting@protonminingco.com ' +
                          'and we will pick it up from there.';
                    note.hidden = false;
                }
            });
        });
    }

    function init() {
        if (!$('ckLines') || typeof Cart === 'undefined' || typeof MinerDB === 'undefined') return;
        wireLines();
        wireDestination();
        flagDemo(OrdersAPI.demoAllowed() && !OrdersAPI.base());
        wireCopy();
        wireClear();
        wireSubmit();
        wireOrderText();

        var legPick = $('ck-leg');
        if (legPick) legPick.addEventListener('change', render);
        Cart.onChange(render);
        render();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
