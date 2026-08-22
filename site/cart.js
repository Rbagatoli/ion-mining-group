/* ===== ION MINING GROUP — the order, kept between pages =====

   One store, shared by the catalogue and the checkout. Quantities used to live
   in the DOM of hardware.html, which meant choosing eight machines and then
   following a link threw the whole order away.

   THIS IS NOT A CHECKOUT AND DOES NOT TAKE MONEY. It carries an order to the
   point where a deposit is agreed, and stops. Ion sources per order rather than
   holding stock, so the price that binds is the one on the quote — see
   price-list.js, which is dated and indicative and says so on the page. Charging
   a card against the list as it stands would be committing to numbers that span
   5.8x in dollars per terahash and have never been reconciled.

   DEPENDENCY-FREE ON PURPOSE. Every page loads this so the nav can show what is
   in the order, and most of them load neither miner-db.js nor price-list.js. So
   the store itself only ever handles model names and counts; anything needing a
   hashrate or a price is in lines()/totals(), which return null when those
   tables are absent rather than guessing.

   Nothing here measures the page. */

var Cart = (function () {
    'use strict';

    /* Versioned, so a later change of shape can be told from this one rather
       than silently misreading it. */
    var KEY = 'img.cart.v1';

    var listeners = [];
    var memory = {};      /* the fallback store, and the cache */
    var usable = null;    /* whether localStorage works here — tested once */

    /* Private browsing, disabled storage and file:// all throw or silently fail
       on write. A cart that throws is worse than a cart that forgets, so this
       degrades to memory and the page never knows. */
    function store() {
        if (usable !== null) return usable ? window.localStorage : null;
        usable = false;
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                var probe = KEY + '.probe';
                window.localStorage.setItem(probe, '1');
                window.localStorage.removeItem(probe);
                usable = true;
            }
        } catch (e) { usable = false; }
        return usable ? window.localStorage : null;
    }

    /* Whatever comes back out of storage was written by an older version of this
       file, by another tab, or by hand in devtools. Treat it as untrusted:
       anything that is not a model name against a positive whole number is
       dropped rather than repaired. */
    function clean(raw) {
        var out = {};
        if (!raw || typeof raw !== 'object') return out;
        Object.keys(raw).forEach(function (model) {
            if (typeof model !== 'string' || !model || model.length > 120) return;
            var q = Math.floor(Number(raw[model]));
            if (!isFinite(q) || q <= 0) return;
            /* A cap, because a stored quantity reaches arithmetic that reaches
               the page. Nobody orders a million machines through a web form. */
            out[model] = Math.min(q, 100000);
        });
        return out;
    }

    function read() {
        var s = store();
        if (!s) return clean(memory);
        var raw = null;
        try { raw = JSON.parse(s.getItem(KEY) || '{}'); } catch (e) { raw = null; }
        memory = clean(raw);
        return memory;
    }

    function write(next) {
        memory = clean(next);
        var s = store();
        if (s) {
            try { s.setItem(KEY, JSON.stringify(memory)); } catch (e) { /* full or blocked */ }
        }
        notify();
        return memory;
    }

    function notify() {
        listeners.forEach(function (fn) {
            try { fn(); } catch (e) { /* one bad listener must not stop the rest */ }
        });
    }

    /* ---------- what the store holds ---------- */

    function get() {
        var s = read(), out = {};
        Object.keys(s).forEach(function (k) { out[k] = s[k]; });
        return out;
    }

    function qtyOf(model) {
        var s = read();
        return Object.prototype.hasOwnProperty.call(s, model) ? s[model] : 0;
    }

    function set(model, qty) {
        var s = read();
        var q = Math.max(0, Math.floor(Number(qty) || 0));
        if (q > 0) s[model] = q; else delete s[model];
        return write(s);
    }

    function add(model, by) {
        return set(model, qtyOf(model) + (Number(by) || 0));
    }

    function remove(model) { return set(model, 0); }

    function clear() { return write({}); }

    /* Total machines. The one figure that needs no other table, which is why the
       nav badge can live on every page. */
    function count() {
        var s = read(), n = 0;
        Object.keys(s).forEach(function (k) { n += s[k]; });
        return n;
    }

    function isEmpty() { return count() === 0; }

    /* ---------- what the order is worth ---------- */

    function db() {
        return (typeof MinerDB !== 'undefined') ? MinerDB : null;
    }
    function prices() {
        return (typeof PriceList !== 'undefined') ? PriceList : null;
    }

    /* Enriched lines, in catalogue order — best efficiency first, the same order
       the catalogue lists — so the checkout and the catalogue agree.

       Returns null, not [], when the spec table is absent. An empty array means
       "the order is empty"; null means "this page cannot answer", and a caller
       that cannot tell them apart will render an empty cart on a page that
       simply did not load miner-db.js. */
    function lines() {
        var M = db();
        if (!M) return null;
        var P = prices();
        var held = read();

        return M.getAll().slice()
            .sort(function (a, b) { return a.efficiency - b.efficiency; })
            .filter(function (m) { return held[m.model] > 0; })
            .map(function (m) {
                var each = P ? P.priceFor(m.model) : null;
                var qty = held[m.model];
                return {
                    model: m.model,
                    qty: qty,
                    hashrate: m.hashrate,
                    power: m.power,
                    efficiency: m.efficiency,
                    each: each,
                    /* null, not 0: a machine with no price on file has an unknown
                       line total, and zero would read as free. */
                    usd: each === null ? null : each * qty
                };
            });
    }

    /* A machine held in the order that the spec table no longer lists — the
       catalogue changed under a cart that was saved days ago. Reported rather
       than dropped, because silently deleting somebody's line is worse than
       telling them it went. */
    function stale() {
        var M = db();
        if (!M) return null;
        var known = {};
        M.getAll().forEach(function (m) { known[m.model] = true; });
        return Object.keys(read()).filter(function (k) { return !known[k]; });
    }

    function totals() {
        var ls = lines();
        if (!ls) return null;
        var t = { units: 0, th: 0, kw: 0, usd: 0, unpriced: 0, lines: ls.length };
        ls.forEach(function (l) {
            t.units += l.qty;
            t.th += l.hashrate * l.qty;
            t.kw += l.power * l.qty;
            if (l.usd === null) t.unpriced += l.qty; else t.usd += l.usd;
        });

        /* The deposit is a commercial term, not a computed fact, and it is
           indicative for exactly the reason the prices are: it is a share of a
           number that is confirmed on the quote. price-list.js owns the rate so
           there is one place to change it. */
        var P = prices();
        t.depositRate = P && typeof P.DEPOSIT_RATE === 'number' ? P.DEPOSIT_RATE : null;
        t.deposit = t.depositRate === null ? null : t.usd * t.depositRate;
        t.balance = t.deposit === null ? null : t.usd - t.deposit;
        return t;
    }

    /* ---------- telling the page ---------- */

    function onChange(fn) {
        if (typeof fn === 'function') listeners.push(fn);
        return function () {
            var i = listeners.indexOf(fn);
            if (i >= 0) listeners.splice(i, 1);
        };
    }

    /* Another tab changing the order has to reach this one, or two open windows
       disagree about what is being bought. */
    if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('storage', function (e) {
            if (e && e.key !== null && e.key !== KEY) return;
            memory = null;
            read();
            notify();
        });
    }

    return {
        KEY: KEY,
        get: get, qtyOf: qtyOf, set: set, add: add, remove: remove, clear: clear,
        count: count, isEmpty: isEmpty,
        lines: lines, totals: totals, stale: stale,
        onChange: onChange
    };
})();

/* ---------- the nav badge ----------

   Every page loads this file, so every page can say what is waiting. Hidden
   entirely at zero rather than showing a 0, because an empty cart is not a thing
   worth a place in the nav. */
(function () {
    'use strict';
    if (typeof document === 'undefined') return;

    function paint() {
        var link = document.getElementById('navCart');
        if (!link) return;
        var n = Cart.count();
        link.hidden = n === 0;
        var slot = link.querySelector('[data-cart-count]');
        if (slot) slot.textContent = String(n);
        link.setAttribute('aria-label',
            n === 1 ? 'Your order, 1 machine' : 'Your order, ' + n + ' machines');
    }

    function init() { paint(); Cart.onChange(paint); }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Cart;
