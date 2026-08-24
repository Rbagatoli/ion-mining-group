/* Guards the order that is carried between pages, and the checkout that spends
   it.

   Two things here are unlike the rest of the site. The store outlives the page,
   so what comes back out of it was written by an older version of this code, by
   another tab, or by hand — it is the only input on the site that is not typed
   into a field, and it is treated as untrusted. And the checkout states money:
   a total, a deposit and a balance. Those must be arithmetic on the price list,
   must never read as firm, and must never suggest anything was charged. */
/* Repo-relative, so this runs wherever the checkout is. Was an absolute
   c:/Users/rbaga/... path that worked on one machine. */
const REPO_ROOT = require('path').join(__dirname, '..', '..').replace(/\\/g, '/') + '/';

var fs = require('fs'), cp = require('child_process');
var S = REPO_ROOT + 'site/';
var SP = __dirname + '/';
var LF = String.fromCharCode(10);
var fail = 0;
function ok(cond, label, detail) {
    console.log((cond ? '  ok    ' : '  FAIL  ') + label + (cond ? '' : '   ' + (detail || '')));
    if (!cond) fail++;
}

var html = fs.readFileSync(S + 'cart.html', 'utf8');
var sheet = fs.readFileSync(S + 'styles.css', 'utf8');
var cartSrc = fs.readFileSync(S + 'cart.js', 'utf8');
var ckSrc = fs.readFileSync(S + 'checkout.js', 'utf8');
var hwSrc = fs.readFileSync(S + 'hardware.js', 'utf8');

/* ---- it parses ---- */

var vm = require('vm');
['cart.js', 'checkout.js'].forEach(function (f) {
    try { new vm.Script(fs.readFileSync(S + f, 'utf8'), { filename: f }); ok(true, f + ' parses'); }
    catch (e) { ok(false, f + ' parses', e.message); }
});

/* ---- the store, with a storage that works ----

   cart.js only reaches for localStorage through `window`, so a fake one here
   exercises the real persistence path rather than the memory fallback. */

function freshCart(storage) {
    delete require.cache[require.resolve(S + 'cart.js')];
    global.window = {
        localStorage: storage,
        addEventListener: function () {}
    };
    global.MinerDB = require(S + 'miner-db.js');
    global.PriceList = require(S + 'price-list.js');
    var C = require(S + 'cart.js');
    global.Cart = C;
    return C;
}

function fakeStorage(seed) {
    var box = seed || {};
    return {
        box: box,
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(box, k) ? box[k] : null; },
        setItem: function (k, v) { box[k] = String(v); },
        removeItem: function (k) { delete box[k]; }
    };
}

var MinerDB = require(S + 'miner-db.js');
var PriceList = require(S + 'price-list.js');

(function () {
    var store = fakeStorage();
    var C = freshCart(store);

    C.set('Antminer S21 XP', 4);
    C.set('Whatsminer M66S', 2);
    ok(C.count() === 6, 'the order counts what was put in it', String(C.count()));

    /* The point of the whole file: it survives the page. */
    var raw = store.box[C.KEY];
    ok(typeof raw === 'string' && raw.indexOf('Antminer S21 XP') >= 0,
       'and it is written to storage, not just held in memory', String(raw));

    var reloaded = freshCart(fakeStorage({ 'img.cart.v1': raw }));
    ok(reloaded.count() === 6, 'and comes back after the page is closed and reopened',
       String(reloaded.count()));
    ok(reloaded.qtyOf('Antminer S21 XP') === 4, 'with the quantities intact',
       String(reloaded.qtyOf('Antminer S21 XP')));
})();

/* ---- the store, with a storage that is broken ----

   Private browsing, disabled storage and file:// all throw on write. A cart that
   throws takes the page with it, so this has to degrade to memory silently. */

(function () {
    var hostile = {
        getItem: function () { throw new Error('SecurityError'); },
        setItem: function () { throw new Error('QuotaExceededError'); },
        removeItem: function () { throw new Error('SecurityError'); }
    };
    var threw = null, C = null;
    try {
        C = freshCart(hostile);
        C.set('Antminer S21 XP', 3);
    } catch (e) { threw = e; }
    ok(!threw, 'storage that throws does not take the page with it',
       threw ? threw.message : '');
    ok(C && C.count() === 3, 'and the order still works in memory',
       C ? String(C.count()) : 'no cart');
})();

/* ---- what comes back out of storage is untrusted ---- */

[['not an object', '"nonsense"'],
 ['broken JSON', '{{{'],
 ['a negative quantity', '{"Antminer S21 XP": -5}'],
 ['a fractional quantity', '{"Antminer S21 XP": 2.7}'],
 ['a quantity that is not a number', '{"Antminer S21 XP": "lots"}'],
 ['an absurd quantity', '{"Antminer S21 XP": 99999999999}'],
 ['an empty model name', '{"": 4}']]
.forEach(function (c) {
    var C = freshCart(fakeStorage({ 'img.cart.v1': c[1] }));
    var n = C.count();
    var sane = isFinite(n) && n >= 0 && n <= 100000 && Math.floor(n) === n;
    ok(sane, 'storage holding ' + c[0] + ' cannot produce a nonsense count', String(n));
});

(function () {
    var C = freshCart(fakeStorage({ 'img.cart.v1': '{"Antminer S21 XP": 2.7}' }));
    ok(C.qtyOf('Antminer S21 XP') === 2, 'a fractional quantity floors rather than rounding up',
       String(C.qtyOf('Antminer S21 XP')));
    C = freshCart(fakeStorage({ 'img.cart.v1': '{"Antminer S21 XP": -5}' }));
    ok(C.count() === 0, 'and a negative one is dropped, not made positive', String(C.count()));
})();

/* ---- the money ---- */

(function () {
    var C = freshCart(fakeStorage());
    C.set('Antminer S21 XP', 4);
    C.set('Whatsminer M66S', 2);
    C.add('Antminer S21 XP', 1);

    var xp = MinerDB.findByModel('Antminer S21 XP');
    var m66 = MinerDB.findByModel('Whatsminer M66S');
    var t = C.totals();

    ok(C.qtyOf('Antminer S21 XP') === 5, 'add() adds to what is already there',
       String(C.qtyOf('Antminer S21 XP')));

    var wantTh = xp.hashrate * 5 + m66.hashrate * 2;
    var wantKw = xp.power * 5 + m66.power * 2;
    var wantUsd = PriceList.priceFor(xp.model) * 5 + PriceList.priceFor(m66.model) * 2;

    ok(t.units === 7, '5 and 2 is 7 machines', String(t.units));
    ok(t.th === wantTh, 'and the hashrate is the sum of the lines', t.th + ' vs ' + wantTh);
    ok(Math.abs(t.kw - wantKw) < 1e-9, 'and so is the draw', t.kw + ' vs ' + wantKw);
    ok(t.usd === wantUsd, 'and the indicative total is the price list, times the counts',
       t.usd + ' vs ' + wantUsd);

    /* The deposit is the only figure on the site that is a share of another one.
       Both halves have to add back up, or the page is quoting two numbers that
       do not describe the same order. */
    ok(t.depositRate === PriceList.DEPOSIT_RATE,
       'the deposit rate comes from the price list, not from the checkout',
       String(t.depositRate));
    ok(Math.abs(t.deposit - t.usd * PriceList.DEPOSIT_RATE) < 1e-9,
       'the deposit is that share of the total', String(t.deposit));
    ok(Math.abs((t.deposit + t.balance) - t.usd) < 1e-9,
       'and the deposit and the balance add back to the total',
       t.deposit + ' + ' + t.balance + ' vs ' + t.usd);
})();

/* A machine with no price on file must not be counted as free — in the total,
   and therefore not in the deposit or the balance either. */
/* Every model currently has a price, so this branch has to be MADE to happen —
   the first version of this test looked for an unpriced machine, found none, and
   passed while asserting nothing. A stubbed price list is the only way to reach
   the path, and the path matters: a null price added as zero would quietly
   under-quote an order and under-charge the deposit. */
(function () {
    var target = 'Antminer S21 XP';
    var real = require(S + 'price-list.js');
    delete require.cache[require.resolve(S + 'cart.js')];
    global.window = { localStorage: fakeStorage(), addEventListener: function () {} };
    global.MinerDB = MinerDB;
    global.PriceList = {
        ASOF: real.ASOF,
        DEPOSIT_RATE: real.DEPOSIT_RATE,
        priceFor: function (m) { return m === target ? null : real.priceFor(m); },
        all: real.all
    };
    var C = require(S + 'cart.js');
    C.set(target, 3);
    C.set('Whatsminer M66S', 2);
    var t = C.totals();
    var wantUsd = real.priceFor('Whatsminer M66S') * 2;

    ok(t.unpriced === 3, 'a machine with no price is counted as unpriced', String(t.unpriced));
    ok(t.usd === wantUsd, 'and never as zero dollars inside the total',
       t.usd + ' vs ' + wantUsd);
    ok(Math.abs(t.deposit - wantUsd * real.DEPOSIT_RATE) < 1e-9,
       'so the deposit is a share of what is actually priced', String(t.deposit));
    ok(t.units === 5, 'while still counting toward the machines and the hashrate',
       String(t.units));

    global.PriceList = real;
})();

/* ---- the page cannot answer without its tables ---- */

(function () {
    delete require.cache[require.resolve(S + 'cart.js')];
    global.window = { localStorage: fakeStorage({ 'img.cart.v1': '{"Antminer S21 XP": 2}' }),
                      addEventListener: function () {} };
    var saveDB = global.MinerDB;
    delete global.MinerDB;
    var C = require(S + 'cart.js');
    /* null, not [] — a page that loaded no spec table cannot say the order is
       empty, and rendering "nothing here" over somebody's saved order would be
       a lie told by a script-loading bug. */
    ok(C.lines() === null, 'without the spec table the order reports unknown, not empty',
       JSON.stringify(C.lines()));
    ok(C.totals() === null, 'and so do the totals', JSON.stringify(C.totals()));
    ok(C.count() === 2, 'but the count still works, which is what the nav badge needs',
       String(C.count()));
    global.MinerDB = saveDB;
})();

/* ---- a saved order can outlive the catalogue ---- */

(function () {
    var C = freshCart(fakeStorage({ 'img.cart.v1': '{"Antminer S21 XP": 2, "Antminer S9": 4}' }));
    var stale = C.stale();
    ok(stale.length === 1 && stale[0] === 'Antminer S9',
       'a model the catalogue no longer lists is reported rather than dropped',
       JSON.stringify(stale));
    var t = C.totals();
    ok(t.units === 2, 'and it is left out of the totals rather than crashing them',
       String(t.units));
})();

/* ---- removal ---- */

(function () {
    var C = freshCart(fakeStorage());
    C.set('Antminer S21 XP', 4);
    C.set('Antminer S21 XP', 0);
    ok(C.count() === 0, 'setting a quantity to zero removes the line', String(C.count()));
    C.set('Antminer S21 XP', 4);
    C.add('Antminer S21 XP', -10);
    ok(C.count() === 0, 'and stepping below zero removes it rather than going negative',
       String(C.count()));
    C.set('Antminer S21 XP', 4);
    C.clear();
    ok(C.isEmpty(), 'and clear() empties it', String(C.count()));
})();

(function () {
    var C = freshCart(fakeStorage());
    var fired = 0;
    C.onChange(function () { fired++; });
    C.set('Antminer S21 XP', 1);
    C.set('Antminer S21 XP', 2);
    ok(fired === 2, 'every change tells the page', String(fired));
})();

/* ---- both pages key quantities the same way ----

   By model, not by row position. An index means a catalogue that gains or loses
   a machine silently moves somebody's saved order onto its neighbour, and the
   two pages would have to agree on a sort order forever. */

[[hwSrc, 'hardware.js'], [ckSrc, 'checkout.js']].forEach(function (p) {
    var byIndex = /data-qty="' \+ (index|i)\b/.test(p[0]);
    ok(!byIndex, p[1] + ' keys quantities by model, not by row position',
       'found an index-keyed data-qty');
    ok(p[0].indexOf('data-qty="' + "' + esc(") >= 0 || p[0].indexOf("data-qty=\"' + esc(") >= 0,
       p[1] + ' escapes the model it keys on', 'unescaped model in an attribute');
});

/* ---- the checkout page ---- */

/* Every id checkout.js writes to has to exist, or the page silently renders
   nothing where a number should be. */
(function () {
    var ids = [], i = 0;
    while ((i = ckSrc.indexOf("$('", i)) >= 0) {
        var j = ckSrc.indexOf("'", i + 3);
        ids.push(ckSrc.slice(i + 3, j));
        i = j;
    }
    var seen = {}, missing = [];
    ids.forEach(function (id) {
        if (seen[id]) return;
        seen[id] = true;
        if (html.indexOf('id="' + id + '"') < 0) missing.push(id);
    });
    ok(missing.length === 0, 'every element the checkout writes to exists on the page',
       missing.join(', '));
})();

/* It states money, so it must never read as firm and never claim to have taken
   any. This is the whole reason there is no payment code here. */
/* The whole phrase, not the word. "indicative" also appears as a column label
   and a totals caption, so grepping for it alone passed a mutation that removed
   the caveat and left the labels standing. */
[['indicative as of', 'the checkout dates the prices and calls them indicative'],
 ['confirmed on quote', 'and says they are confirmed on quote'],
 ['Nothing is charged on this page', 'and says in as many words that nothing is charged'],
 ['Nothing is charged on the next page', 'and that the next page charges nothing either']]
.forEach(function (p) {
    ok(html.indexOf(p[0]) >= 0, p[1], 'missing "' + p[0] + '"');
});

['payment received', 'order confirmed', 'thank you for your purchase', 'charged to your',
 'your card', 'paid in full']
.forEach(function (phrase) {
    ok(html.toLowerCase().indexOf(phrase) < 0,
       'nothing on the page claims money changed hands (' + phrase + ')');
});

/* The deposit is a commercial term and lives in one place. */
ok(cartSrc.indexOf('DEPOSIT_RATE') >= 0 && ckSrc.indexOf('depositRate') >= 0,
   'the deposit rate is read, never written, by the checkout');
/* Comments stripped first: checkout.js explains the rate formatting and names
   0.25 while doing so, and a grep over raw source cannot tell an explanation
   from a second source of truth. */
(function () {
    var code = ckSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    var rates = code.match(/\b0\.\d+\b/g) || [];
    var suspect = rates.filter(function (r) {
        var n = parseFloat(r);
        return n >= 0.05 && n <= 0.95;   /* the range a deposit rate would sit in */
    });
    ok(suspect.length === 0, 'and the checkout hard-codes no rate of its own',
       'literal rate(s) in checkout.js: ' + suspect.join(', '));
})();

/* The destination is the point of the page. */
['value="ion"', 'value="own"', 'value="third"'].forEach(function (v) {
    ok(html.indexOf(v) >= 0, 'the destination offers ' + v, 'missing ' + v);
});
['facility', 'street', 'city', 'region', 'postcode', 'country', 'attention'].forEach(function (n) {
    ok(html.indexOf('name="' + n + '"') >= 0, 'and takes the ' + n + ' for a delivery address',
       'missing name="' + n + '"');
});
ok(html.indexOf('id="ckAddr" hidden') >= 0,
   'with the address hidden until somewhere other than an Proton site is picked');

/* ---- placing the order with the service ---- */

/* The checkout can POST to an orders Worker. Until that Worker is deployed the
   endpoint is empty, and empty is a SUPPORTED state, not a broken one: the page
   must behave exactly as it did before, which is a mail draft plus a copyable
   order. Asserted, because "it silently stopped submitting" is the failure this
   whole page was built to avoid. */
/* The endpoint, the locality test and the fetch all live in orders-api.js now.
   They were copied into three files, and every correction had to be made three
   times — which is how a hardcoded dev port survived one round of fixes. */
var apiSrc = fs.readFileSync(S + 'orders-api.js', 'utf8');

(function () {
    var m = /var ORDERS_ENDPOINT = '([^']*)'/.exec(apiSrc);
    ok(!!m, 'the orders endpoint is named in exactly one place',
       'no ORDERS_ENDPOINT in orders-api.js');
    ok(ckSrc.indexOf("var ORDERS_ENDPOINT") < 0, 'and the checkout does not keep its own copy');
    if (!m) return;
    var endpoint = m[1];

    /* THE CHECKOUT IS NOT A MAIL FORM.

       site.js binds a submit handler to every form[data-mailto] at load —
       before this page can take the form over, and removing an attribute does
       not detach a listener. Every arrangement where the checkout borrowed the
       form and handed it back leaked a mail window at the worst moment: the
       one where somebody is trying to buy something. So the form simply does
       not declare an address, and this page always owns the submit. */
    var formTag = /<form[^>]*id="ckForm"[^>]*>/.exec(html);
    ok(!!formTag, 'the checkout form can be located');
    ok(formTag && formTag[0].indexOf('data-mailto') < 0,
       'and declares no mail address, so site.js never binds to it',
       formTag ? formTag[0] : '');
    ok(ckSrc.indexOf('if (!form) return;') >= 0,
       'and the checkout wires its submit unconditionally');
    ok(ckSrc.indexOf('!ordersBase()) return') < 0,
       'never bailing out and leaving the mail handler in charge');
    ok(ckSrc.indexOf("setAttribute('data-mailto'") < 0,
       'and never puts one back, even on failure');

    if (!endpoint) {
        ok(true, 'and with none configured the page still owns its own submit');
    } else {
        ok(/^https:\/\//.test(endpoint), 'and it is https', endpoint);
    }

    /* A key in a static page is a published key. The site already has this rule
       for the market endpoints; the orders endpoint is held to it too. */
    ok(!/[?&](key|token|secret|api[_-]?key)=/i.test(endpoint),
       'and carries no key in its URL', endpoint);
    ok(!/Authorization|Bearer|apiKey|api_key/.test(ckSrc + apiSrc),
       'and the checkout sends no credential', 'a credential appears in checkout.js');
})();

/* The endpoint resolves at runtime rather than being a bare constant, so the
   whole path can be clicked through locally with no edits. The constant being
   empty in the repo used to mean the pay button never appeared at all, which
   is correct for production and indistinguishable from broken for anyone
   looking at it. */
(function () {
    ok(ckSrc.indexOf('OrdersAPI.base()') >= 0,
       'the checkout asks the shared module where the service is');
    var open = apiSrc.indexOf('function base() {');
    ok(open >= 0, 'which resolves it in one function');
    if (open < 0) return;
    var body = apiSrc.slice(open, apiSrc.indexOf(LF + '    }', open));
    ok(body.indexOf('if (ORDERS_ENDPOINT) return ORDERS_ENDPOINT;') >= 0,
       'a configured endpoint always wins');
    ok(body.indexOf('isLocal()') >= 0, 'and only falls back when it is running locally');
    /* SAME ORIGIN, not a fixed port. The dev server serves the site and the API
       together, so /api is wherever the page is — which works on any port and
       raises no cross-origin preflight. A hardcoded 8098 meant the site loaded
       on 8080 while every API call failed, which reads as a broken checkout. */
    ok(body.indexOf("location.origin + '/api'") >= 0,
       'and points at the same origin, so any dev port works', body);
    ok(apiSrc.indexOf('8098') < 0, 'with no port hardcoded into it');
    ok(body.trim().slice(-10).indexOf("return ''") >= 0,
       'and anywhere else with nothing configured resolves to nothing', body.trim().slice(-40));

    /* The hostname test itself, wherever it lives. */
    var lo = apiSrc.indexOf('function isLocal() {');
    ok(lo >= 0, 'and locality is decided in one place');
    var loBody = apiSrc.slice(lo, apiSrc.indexOf(LF + '    }', lo));
    ok(loBody.indexOf("'localhost'") >= 0 && loBody.indexOf("'127.0.0.1'") >= 0,
       'by name, against localhost only', loBody);
    ok(loBody.indexOf('location.hostname') >= 0,
       'keyed on the hostname, which no public host can spoof into localhost');
})();

/* What gets sent must be models and counts — never money. The service recomputes
   everything; a payload carrying prices invites somebody to believe they matter. */
(function () {
    var a = ckSrc.indexOf('function payload()');
    var b = ckSrc.indexOf('/* Deposit unless they asked');
    ok(a >= 0 && b > a, 'the payload builder can be located');
    if (a < 0) return;
    /* COMMENTS STRIPPED BEFORE THE SCAN. The rule is about what the payload SENDS, and the
       words below are ordinary English that any honest explanation of the rule will use: a
       comment saying "the browser never sends a price" failed the check for the word "price".

       That is not a hypothetical tidy-up. It happened the moment somebody documented why the
       destination carries a site id and not a power rate, and the suite reported a price in the
       payload of a function that has never contained one. A test that punishes explaining
       itself gets the explanations deleted, which is the opposite of what it is for — and it
       is the same trap portal-frontend.test.js records for gas-field.js, where the header names
       the very things the file is asserted not to touch. */
    var body = ckSrc.slice(a, b)
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ');
    ok(body.indexOf('model: l.model') >= 0 && body.indexOf('qty: l.qty') >= 0,
       'the payload carries the model and the count');
    ['usd', 'each', 'deposit', 'balance', 'total', 'price'].forEach(function (k) {
        ok(body.indexOf(k) < 0, 'and no ' + k + ', because the service prices it',
           k + ' appears in the payload');
    });
})();

/* Failure must never read as success, and must never leave the customer with
   nothing to do. */
(function () {
    var a = ckSrc.indexOf('.catch(function (err)');
    ok(a >= 0, 'the submit path handles a failure at all');
    if (a < 0) return;
    /* To the end of the handler, not a fixed number of characters — the handler
       grew when it learned to tell a dev outage from a production one, and a
       900-character window silently stopped covering the half that matters. */
    var body = ckSrc.slice(a, ckSrc.indexOf('function init()', a));
    ok(body.indexOf('was not placed') >= 0,
       'and says the order was not placed rather than implying it was');
    ok(body.indexOf('hosting@protonminingco.com') >= 0,
       'and names an address to use instead');
    /* Named, never opened. A checkout that pops a mail window instead of
       taking payment is the exact behaviour this page was rebuilt to stop. */
    ok(body.indexOf('data-mailto') < 0, 'without turning the form back into a mail draft');
    ok(body.indexOf('location.href') < 0, 'and without navigating anywhere');
    ok(html.indexOf('id="ckFallback" hidden') >= 0,
       'with somewhere on the page to say so, hidden until it happens');
})();

/* Placing an order goes TO the payment page. That is the whole ask: a button
   that leads somewhere people can pay, not a form that produces a document. */
(function () {
    var sp = ckSrc.indexOf('function showPlaced');
    var body = ckSrc.slice(sp, ckSrc.indexOf('function wireSubmit'));
    ok(body.indexOf("window.location.href = './pay.html?ref='") >= 0,
       'a placed order navigates to the payment page', body.slice(-260));
    ok(body.indexOf("'&leg=' + encodeURIComponent(leg)") >= 0,
       'carrying which payment was chosen');
    /* The reference is written into the panel BEFORE the navigation, so a
       blocked or slow redirect leaves it on screen rather than losing it. */
    ok(body.indexOf('ref.textContent = reference') < body.indexOf('window.location.href'),
       'and the reference is on screen before the page moves');
    /* Source order alone is not enough — deferring the write into a timer keeps
       it textually first while the navigation happens anyway, and a mutation
       doing exactly that slipped past. showPlaced must be straight-line up to
       the redirect. */
    ok(body.indexOf('setTimeout') < 0,
       'with nothing deferred between the two, which source order alone cannot see',
       'showPlaced defers work into a timer');

    ok(html.indexOf('id="ck-leg"') >= 0, 'the customer picks deposit or full before leaving');
    ok(html.indexOf('value="deposit"') >= 0 && html.indexOf('value="full"') >= 0,
       'and both are offered');
    ok(html.indexOf('id="ckLegNote"') >= 0, 'with what each one costs shown beside it');
    ok(ckSrc.indexOf('function legWanted()') >= 0, 'and the choice is read at submit time');

    var btn = /id="ckSubmit"[^>]*>([^<]*)/.exec(html);
    ok(btn && btn[1].toLowerCase().indexOf('mail') < 0,
       'and the button does not offer to open mail', btn ? btn[1] : '');
    ok(btn && /payment|pay/i.test(btn[1]),
       'it offers to continue to payment', btn ? btn[1] : '');
})();

/* The reference is the customer's only handle on the order. */
(function () {
    ok(html.indexOf('id="ckRef"') >= 0 && html.indexOf('id="ckPlaced" hidden') >= 0,
       'the order reference has a place on the page, hidden until there is one');
    var a = ckSrc.indexOf('function showPlaced');
    var body = ckSrc.slice(a, ckSrc.indexOf('function wireSubmit'));
    ok(body.indexOf('ref.textContent = reference') >= 0, 'and is written into it');
    ok(body.indexOf('Cart.clear()') >= 0, 'and the cart is emptied once it is placed');
    ok(body.indexOf('Cart.clear()') > body.indexOf('ref.textContent'),
       'but only AFTER the reference is on screen, never before',
       'the cart is cleared before the reference is shown');
    ok(html.indexOf('Nothing has been charged') >= 0,
       'and the panel still says nothing has been charged');
})();

/* The reference must outlive the re-render that clearing the cart causes.

   Found by driving a real browser against a real Worker, not by any unit test:
   the order was placed, showPlaced() emptied the cart, the emptying fired a
   re-render, and the re-render hid #ckBody — which the reference panel was
   sitting inside. The customer saw "nothing in the order yet" one frame after
   ordering nine machines. */
(function () {
    var placedAt = html.indexOf('id="ckPlaced"');
    var bodyAt = html.indexOf('id="ckBody"');
    ok(placedAt >= 0 && bodyAt >= 0 && placedAt < bodyAt,
       'the reference panel sits outside the cart body, not within it',
       'ckPlaced ' + placedAt + ' vs ckBody ' + bodyAt);

    ok(ckSrc.indexOf('if (placed) return;') >= 0,
       'and a re-render stands down once an order is placed',
       'render() would still run after showPlaced');

    var sp = ckSrc.indexOf('function showPlaced');
    var body = ckSrc.slice(sp, ckSrc.indexOf('function wireSubmit'));
    ok(body.indexOf('placed = true') >= 0 && body.indexOf('placed = true') < body.indexOf('Cart.clear()'),
       'and the flag is set before the cart is emptied, not after',
       'clearing happens first, so the re-render still wins');
})();

/* ---- the order is carried everywhere the nav is ---- */

['index.html', 'hosting.html', 'energy.html', 'hardware.html', 'calculator.html',
 'contact.html', 'privacy.html', '404.html', 'cart.html'].forEach(function (f) {
    var t = fs.readFileSync(S + f, 'utf8');
    /* Version-tolerant: local assets now carry ?v=<hash> so a browser cannot serve a stale
       copy. What matters here is that the page loads the cart at all. */
    ok(/<script src="\.\/cart\.js(\?v=[0-9a-f]+)?"><\/script>/.test(t),
       f + ' loads the cart, so its nav can show the order', 'no cart.js');
    ok(t.indexOf('id="navCart"') >= 0, '  and carries the badge', 'no navCart');
});

/* cart.js must be able to run before the tables it optionally uses, since most
   pages never load them at all. */
(function () {
    var t = fs.readFileSync(S + 'index.html', 'utf8');
    ok(t.indexOf('miner-db.js') < 0,
       'the home page carries no spec table, which is why the store is dependency-free');
})();

(function () {
    /* The script TAG, not the bare filename — cart.js is named in the nav
       comment hundreds of lines above where it is actually loaded, and matching
       that made this assertion compare a comment against a script tag. */
    var t = fs.readFileSync(S + 'cart.html', 'utf8');
    /* Tolerant of the ?v=<hash> local assets now carry; the question is the ORDER. */
    /* Version stripped once, then the literal lookup below is unchanged. Local assets carry
       ?v=<hash> (tools/build-asset-stamp.js) and the question here is load ORDER. */
    var plain = t.replace(/\?v=[0-9a-f]+/g, '');
    function at(f) { return plain.indexOf('<script src="./' + f + '"></script>'); }
    var db = at('miner-db.js'), pl = at('price-list.js'),
        cart = at('cart.js'), ck = at('checkout.js');
    ok(db >= 0 && pl >= 0 && cart >= 0 && ck >= 0,
       'the checkout loads all four scripts',
       'db ' + db + ' pl ' + pl + ' cart ' + cart + ' ck ' + ck);
    ok(db < cart && pl < cart, 'on the checkout the tables load before the store',
       'db ' + db + ', pl ' + pl + ', cart ' + cart);
    ok(cart < ck, 'and the store before the page that spends it',
       'cart ' + cart + ', checkout ' + ck);
})();

/* ---- the generators know it ---- */

var navGen = fs.readFileSync(S + 'tools/build-nav.js', 'utf8');
var seoGen = fs.readFileSync(S + 'tools/build-seo.js', 'utf8');
var ogGen = fs.readFileSync(S + 'tools/build-og.js', 'utf8');
ok(navGen.indexOf("'cart.html'") >= 0, 'the nav generator knows the page');
ok(seoGen.indexOf("'cart.html'") >= 0, 'and so does the sitemap');
ok(ogGen.indexOf("'cart.html'") >= 0, 'and it has a share card');
ok(fs.readFileSync(S + 'sitemap.xml', 'utf8').indexOf('cart.html') >= 0,
   'and it is in the written sitemap');

/* A checkout is a step inside a purchase, not a landing page. */
(function () {
    var i = seoGen.indexOf("'cart.html'");
    var seg = seoGen.slice(i, seoGen.indexOf('}', i));
    var m = /priority: '([\d.]+)'/.exec(seg);
    ok(m && parseFloat(m[1]) <= 0.3, 'and it is not ranked as a landing page',
       m ? m[1] : 'no priority found');
})();

/* ---- house rules ---- */

['getBoundingClientRect', 'offsetWidth', 'offsetHeight', 'clientWidth', 'clientHeight',
 'ResizeObserver', 'innerHeight'].forEach(function (api) {
    ok(cartSrc.indexOf(api) < 0 && ckSrc.indexOf(api) < 0,
       'nothing measures the page (' + api + ')');
});
ok(html.indexOf('border-radius') < 0, 'no inline radii');

/* The badge is an <a> inside .nav-links, which is (0,1,1) — a bare .nav-cart at
   (0,1,0) loses, and the first version of this rendered at the nav link's own
   padding and wrapped the whole nav. Resolve it rather than reading the rule. */
(function () {
    var C = require(SP + 'cascade.js');
    var el = { tag: 'a', classes: ['nav-cart'], ancestors: [
        { tag: 'div', classes: ['nav-links'] },
        { tag: 'div', classes: ['nav-inner'] },
        { tag: 'nav', classes: ['nav'] }
    ] };
    ['padding', 'font-size', 'color'].forEach(function (p) {
        var w = C.resolve(sheet, el, [], p);
        ok(w && w.sel.indexOf('nav-cart') >= 0,
           'the badge wins its own ' + p + ' against .nav-links a',
           w ? w.value + ' via ' + w.sel : 'nothing declares it');
    });
})();

console.log('');
console.log(fail ? '  ' + fail + ' FAILED' : '  cart-suite: ALL OK');
process.exit(fail ? 1 : 0);
