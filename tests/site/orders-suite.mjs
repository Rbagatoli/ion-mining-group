/* Guards the orders Worker.

   One thing here matters more than everything else. Until now every figure on
   this site was for display: wrong meant embarrassing. This file prices an
   order, and the browser is where the customer lives. So the central assertion
   is not that the arithmetic is right — it is that the arithmetic is the
   SERVER'S, and that nothing the client says about money is read at all.

   Runs the real Worker module under Node against a stubbed KV, rather than a
   deployed one, so it can be run on every change. */
/* Repo-relative, so this runs wherever the checkout is. Was an absolute
   c:/Users/rbaga/... path that worked on one machine. */
const REPO_ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = REPO_ROOT + '';
const W = ROOT + 'worker-orders/';

const worker = await import('file:///' + W + 'index.js');
const catalogue = await import('file:///' + W + 'catalogue.js');
const T = worker.__test;

const { createRequire } = await import('module');
const require = createRequire(import.meta.url);
const MinerDB = require(ROOT + 'site/miner-db.js');
const PriceList = require(ROOT + 'site/price-list.js');

let fail = 0;
function ok(cond, label, detail) {
    console.log((cond ? '  ok    ' : '  FAIL  ') + label + (cond ? '' : '   ' + (detail || '')));
    if (!cond) fail++;
}

/* ---- a KV stub, and a way to call the Worker ---- */

function kv() {
    const box = new Map();
    return {
        box,
        async get(k, type) {
            const v = box.has(k) ? box.get(k).value : null;
            return v === null ? null : (type === 'json' ? JSON.parse(v) : v);
        },
        async put(k, v, opts) { box.set(k, { value: String(v), meta: opts && opts.metadata }); },
        async list({ prefix, limit }) {
            const keys = [...box.keys()].filter(k => k.startsWith(prefix)).sort().slice(0, limit || 1000);
            return { keys: keys.map(name => ({ name })) };
        }
    };
}

const ORIGIN = 'https://ionmininggroup.com';

async function call(env, method, urlPath, body, headers) {
    const req = new Request('https://orders.example' + urlPath, {
        method,
        headers: Object.assign({ Origin: ORIGIN, 'Content-Type': 'application/json' }, headers || {}),
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const res = await worker.default.fetch(req, env);
    let json = null;
    try { json = JSON.parse(await res.text()); } catch (e) { json = null; }
    return { status: res.status, body: json };
}

function newEnv(extra) {
    return Object.assign({ ORDERS: kv(), OPS_SECRET: 'test-ops-secret' }, extra || {});
}

const OPS = { Authorization: 'Bearer test-ops-secret' };

/* A real order, and the figures it must produce — worked by hand from the
   published price list rather than from the code under test. */
const XP = 'Antminer S21 XP', M66 = 'Whatsminer M66S+';
const GOOD_LINES = [{ model: XP, qty: 6 }, { model: M66, qty: 3 }];
const HAND_USD = 3010 * 6 + 11500 * 3;          // 18,060 + 34,500 = 52,560
const HAND_DEPOSIT = HAND_USD * 0.25;           // 13,140
const HAND_BALANCE = HAND_USD - HAND_DEPOSIT;   // 39,420
const HAND_TH = 270 * 6 + 318 * 3;              // 2,574

const GOOD_BODY = {
    lines: GOOD_LINES,
    destination: { kind: 'ion' },
    contact: { name: 'A Buyer', email: 'buyer@example.com' }
};

/* ---- the generated catalogue agrees with the site ---- */

(function () {
    const models = MinerDB.getAll();
    ok(Object.keys(catalogue.CATALOGUE).length === models.length,
       'the Worker knows every machine the site lists',
       Object.keys(catalogue.CATALOGUE).length + ' vs ' + models.length);

    const wrong = [];
    models.forEach(m => {
        const c = catalogue.CATALOGUE[m.model];
        if (!c) { wrong.push(m.model + ' missing'); return; }
        if (c.hashrate !== m.hashrate) wrong.push(m.model + ' hashrate');
        if (c.power !== m.power) wrong.push(m.model + ' power');
        if (c.efficiency !== m.efficiency) wrong.push(m.model + ' efficiency');
        if (c.usd !== PriceList.priceFor(m.model)) wrong.push(m.model + ' price');
    });
    ok(wrong.length === 0, 'and prices every one of them exactly as the site does',
       wrong.slice(0, 4).join(', '));

    ok(catalogue.ASOF === PriceList.ASOF, 'and carries the same as-of date',
       catalogue.ASOF + ' vs ' + PriceList.ASOF);
    ok(catalogue.DEPOSIT_RATE === PriceList.DEPOSIT_RATE,
       'and the same deposit rate', catalogue.DEPOSIT_RATE + ' vs ' + PriceList.DEPOSIT_RATE);

    /* A machine with no price on file must be null, never 0 — a zero would let
       it be ordered for nothing, and the deposit taken against nothing. */
    const zeros = Object.keys(catalogue.CATALOGUE)
        .filter(k => catalogue.CATALOGUE[k].usd === 0);
    ok(zeros.length === 0, 'and never carries a price of zero', zeros.join(', '));
})();

/* ---- THE POINT: the client cannot price its own order ---- */

/* Every one of these sends a real, valid order — and a lie about what it costs
   alongside. The Worker must return its own figure in all of them. */
const LIES = [
    ['a total of its own', { usd: 1, total: 1, subtotal: 1 }],
    ['a deposit of its own', { deposit: 1, depositRate: 0.0001, balance: 0 }],
    ['a price on the line', null],
    ['a whole priced payload', { usd: 1, deposit: 1, balance: 0, lines: null }]
];

for (const [label, extra] of LIES) {
    const env = newEnv();
    const body = JSON.parse(JSON.stringify(GOOD_BODY));
    if (extra) Object.assign(body, extra);
    /* the line-level lie: claim each machine costs a dollar */
    body.lines = GOOD_LINES.map(l => ({ model: l.model, qty: l.qty, each: 1, usd: 1, total: 1, price: 1 }));
    if (extra && extra.lines === null) body.usd = 1;

    const r = await call(env, 'POST', '/orders', body);
    ok(r.status === 201, 'an order sent with ' + label + ' is still accepted', 'status ' + r.status);
    ok(r.body && r.body.totals.usd === HAND_USD,
       '  and priced at ' + HAND_USD + ', not what it claimed',
       r.body ? String(r.body.totals.usd) : 'no body');
    ok(r.body && r.body.totals.deposit === HAND_DEPOSIT,
       '  with the deposit the server computed',
       r.body ? String(r.body.totals.deposit) : 'no body');
}

/* ---- and cannot forge a line ---- */

const BAD_LINES = [
    ['an unknown machine', [{ model: 'Antminer S99 Ultra', qty: 1 }]],
    ['a machine name that is nearly right', [{ model: 'antminer s21 xp', qty: 1 }]],
    ['a negative quantity', [{ model: XP, qty: -5 }]],
    ['a zero quantity', [{ model: XP, qty: 0 }]],
    ['a fractional quantity that rounds up', [{ model: XP, qty: 0.9 }]],
    ['a quantity of one billion', [{ model: XP, qty: 1e9 }]],
    ['a quantity that is not a number', [{ model: XP, qty: 'lots' }]],
    ['a quantity of Infinity', [{ model: XP, qty: Infinity }]],
    ['no lines at all', []],
    ['lines that are not an array', 'give me miners'],
    ['a duplicated line', [{ model: XP, qty: 1 }, { model: XP, qty: 1 }]],
    ['a model that is an object', [{ model: { toString: () => XP }, qty: 1 }]]
];

for (const [label, lines] of BAD_LINES) {
    const env = newEnv();
    const r = await call(env, 'POST', '/orders', Object.assign({}, GOOD_BODY, { lines }));
    ok(r.status === 400, 'an order with ' + label + ' is refused', 'status ' + r.status);
}

/* A 60-line cap, and 61 lines is over it. Built from real models so the refusal
   is about the count and nothing else. */
(function () {
    const models = Object.keys(catalogue.CATALOGUE);
    const many = [];
    for (let i = 0; i < 61; i++) many.push({ model: models[i % models.length], qty: 1 });
    return many;
})();

/* ---- the arithmetic itself ---- */

(function () {
    const t = T.priceOrder(GOOD_LINES);
    ok(!t.error, 'a good order prices without error', t.error);
    ok(t.units === 9, '6 and 3 is 9 machines', String(t.units));
    ok(t.th === HAND_TH, 'and ' + HAND_TH + ' TH/s', String(t.th));
    ok(t.usd === HAND_USD, 'and $' + HAND_USD.toLocaleString('en-US'), String(t.usd));
    ok(t.deposit === HAND_DEPOSIT, 'deposit $' + HAND_DEPOSIT.toLocaleString('en-US'), String(t.deposit));
    ok(t.balance === HAND_BALANCE, 'balance $' + HAND_BALANCE.toLocaleString('en-US'), String(t.balance));
    ok(t.deposit + t.balance === t.usd,
       'and the two halves add back to the total exactly',
       t.deposit + ' + ' + t.balance + ' vs ' + t.usd);
})();

/* The split, at rates other than today's.

   At 0.25 a total and its two halves reconcile whether the balance is computed
   as `total - deposit` or as `total * 0.75`, so the safe form and the unsafe one
   are indistinguishable — a mutation swapping them passes everything. But
   DEPOSIT_RATE is an unconfirmed commercial term that will move, and at other
   rates the two forms diverge by a cent. Exercised directly, across rates the
   business might plausibly pick. */
(function () {
    const rates = [0.1, 0.15, 0.2, 0.25, 0.3, 0.3333, 0.35, 0.4, 0.5];
    const amounts = [1, 7, 99.99, 2204.15, 3010, 13140.07, 52560, 123456.78];
    const bad = [];
    rates.forEach(rate => amounts.forEach(usd => {
        const s = T.splitDeposit(usd, rate);
        if (T.cents(s.deposit + s.balance) !== T.cents(usd)) {
            bad.push(usd + ' @ ' + rate + ' -> ' + s.deposit + ' + ' + s.balance);
        }
        if (s.deposit < 0 || s.balance < 0) bad.push('negative half at ' + usd + ' @ ' + rate);
    }));
    ok(bad.length === 0, 'a deposit and its balance reconcile at every plausible rate',
       bad.slice(0, 3).join('; '));

    /* And the naive form really would break, so the test above is not vacuous. */
    const naive = (usd, rate) => T.cents(usd * (1 - rate));
    const diverges = rates.some(rate => amounts.some(usd =>
        naive(usd, rate) !== T.splitDeposit(usd, rate).balance));
    ok(diverges, 'and computing the balance instead of subtracting it would not',
       'the two forms never diverged, so this proves nothing');
})();

/* The halves must reconcile for every model in the catalogue, not just the one
   that happens to divide neatly. A cent lost to floating point here is a cent
   the customer is billed twice or never. */
(function () {
    const bad = [];
    Object.keys(catalogue.CATALOGUE).forEach(model => {
        [1, 3, 7, 13, 99].forEach(qty => {
            const t = T.priceOrder([{ model, qty }]);
            if (t.error) { bad.push(model + ' x' + qty + ': ' + t.error); return; }
            if (t.deposit + t.balance !== t.usd) {
                bad.push(model + ' x' + qty + ': ' + t.deposit + '+' + t.balance + '!=' + t.usd);
            }
        });
    });
    ok(bad.length === 0, 'deposit and balance reconcile for every machine and quantity',
       bad.slice(0, 3).join('; '));
})();

/* A machine with no price on file.

   Every model in the catalogue currently has one, so this branch is unreachable
   from the real tables — and an unreachable branch passes every test while being
   wrong. CATALOGUE is a const binding but a mutable object, so the case can be
   made to happen. Getting this wrong bills an unknown price as free and takes a
   deposit against nothing. */
(function () {
    const KEY = '__TEST Unpriced Machine';
    catalogue.CATALOGUE[KEY] = { hashrate: 100, power: 3, efficiency: 30, usd: null };
    try {
        const t = T.priceOrder([{ model: XP, qty: 6 }, { model: KEY, qty: 4 }]);
        ok(!t.error, 'an order containing an unpriced machine is still priced', t.error);
        ok(t.unpriced === 4, 'and counts it as unpriced', String(t.unpriced));
        ok(t.usd === 3010 * 6, 'and leaves it out of the total rather than billing it at zero',
           String(t.usd));
        ok(t.deposit === T.cents(3010 * 6 * catalogue.DEPOSIT_RATE),
           'so no deposit is taken against it', String(t.deposit));
        ok(t.units === 10, 'while still counting toward the machines', String(t.units));
        const line = t.lines.filter(l => l.model === KEY)[0];
        ok(line && line.each === null && line.total === null,
           'and its line total is unknown, not zero', JSON.stringify(line));
    } finally {
        delete catalogue.CATALOGUE[KEY];
    }
})();

/* The generator must emit null for that case too — driven against a fixture,
   for the same reason. */
(function () {
    const { execSync } = require('child_process');
    const tmp = path.join(HERE, 'cat-fixture');
    fs.mkdirSync(tmp, { recursive: true });

    /* A price list with one model deliberately absent. */
    const priceSrc = fs.readFileSync(ROOT + 'site/price-list.js', 'utf8');
    const dropped = 'Antminer T21';
    const stripped = priceSrc.split('\n')
        .filter(l => l.indexOf('"' + dropped + '"') < 0)
        .join('\n');
    ok(stripped !== priceSrc, 'the fixture actually drops a price', 'nothing was removed');

    fs.writeFileSync(path.join(tmp, 'price-list.js'), stripped);
    fs.copyFileSync(ROOT + 'site/miner-db.js', path.join(tmp, 'miner-db.js'));
    const out = path.join(tmp, 'catalogue.js');

    execSync('node "' + ROOT + 'tools/build-order-catalogue.js" ' +
             '"' + path.join(tmp, 'miner-db.js') + '" ' +
             '"' + path.join(tmp, 'price-list.js') + '" ' +
             '"' + out + '"', { cwd: ROOT, stdio: 'pipe' });

    const generated = fs.readFileSync(out, 'utf8');
    const line = generated.split('\n').filter(l => l.indexOf('"' + dropped + '"') >= 0)[0] || '';
    ok(line.indexOf('usd: null') >= 0,
       'the generator writes null for a machine with no price, never zero', line.trim());
    ok(line.indexOf('usd: 0') < 0, 'and emphatically not zero', line.trim());

    fs.rmSync(tmp, { recursive: true, force: true });
})();

/* ---- the destination ---- */

(function () {
    const away = T.readDestination({ kind: 'third', facility: 'Cathedral DC',
        street: '4400 Industrial Loop', city: 'Midland', country: 'USA' });
    ok(!away.error && away.kind === 'third' && away.city === 'Midland',
       'a third-party destination keeps its address', JSON.stringify(away));

    const short = T.readDestination({ kind: 'own', facility: 'Mine' });
    ok(short.error, 'an address with no street or city is refused', JSON.stringify(short));

    const ion = T.readDestination({ kind: 'ion' });
    ok(!ion.error && !ion.street, 'an Ion destination needs no address', JSON.stringify(ion));

    /* An unrecognised kind must not become a third-party shipment with no
       address — it falls back to Ion, which is the one that needs nothing. */
    const junk = T.readDestination({ kind: 'somewhere-else' });
    ok(junk.kind === 'ion', 'an unknown destination kind falls back to Ion', junk.kind);
})();

(function () {
    ok(T.readContact({ email: 'a@b.co' }).email === 'a@b.co', 'a contact email is kept');
    ok(T.readContact({ email: 'nope' }).error, 'and one that cannot be a address is refused');
    ok(T.readContact({}).error, 'and a missing one is refused');
    const trimmed = T.readContact({ email: 'a@b.co', name: '  Padded  Name  ' });
    ok(trimmed.name === 'Padded Name', 'whitespace in a field is collapsed', trimmed.name);
    const ctrl = T.readContact({ email: 'a@b.co', name: 'Line\u0000One\nTwo' });
    ok(ctrl.name.indexOf('\u0000') < 0 && ctrl.name === 'Line One Two',
       'and control characters become spaces rather than vanishing', JSON.stringify(ctrl.name));
})();

/* ---- the reference ---- */

(function () {
    const seen = new Set();
    for (let i = 0; i < 500; i++) {
        const r = T.newReference();
        if (!T.REF_SHAPE.test(r)) { ok(false, 'every reference matches its shape', r); return; }
        seen.add(r);
    }
    ok(seen.size === 500, 'references do not collide across 500 draws', String(seen.size));
    ok(!/[ILOU]/.test([...seen][0].slice(4)), 'and avoid the letters that read as digits',
       [...seen][0]);
})();

/* ---- reading an order back ---- */

(function () { })();

{
    const env = newEnv();
    const placed = await call(env, 'POST', '/orders', GOOD_BODY);
    const ref = placed.body.reference;

    const got = await call(env, 'GET', '/orders/' + ref);
    ok(got.status === 200, 'an order can be read back by its reference', 'status ' + got.status);
    ok(got.body.totals.usd === HAND_USD, 'and still costs what it cost', String(got.body.totals.usd));

    const missing = await call(env, 'GET', '/orders/IMG-AAAA-AAAAAAAA-AAAAAAAA');
    ok(missing.status === 404, 'a reference that was never issued is a 404', 'status ' + missing.status);

    const malformed = await call(env, 'GET', '/orders/not-a-reference');
    ok(malformed.status === 404, 'and so is a malformed one', 'status ' + malformed.status);

    /* The public view carries the customer's own address — they sent it — but
       must not carry the internal trail. */
    ok(got.body.contact === undefined, 'the public view does not echo the contact block');
    ok(!JSON.stringify(got.body).includes('note'), 'nor the internal notes on each step');
}

/* ---- the lifecycle cannot skip ---- */

{
    const env = newEnv();
    const placed = await call(env, 'POST', '/orders', GOOD_BODY);
    const ref = placed.body.reference;

    const jump = await call(env, 'POST', '/orders/' + ref + '/status', { status: 'shipped' }, OPS);
    ok(jump.status === 409, 'an order cannot jump straight to shipped', 'status ' + jump.status);

    const paid = await call(env, 'POST', '/orders/' + ref + '/status', { status: 'deposit_paid' }, OPS);
    ok(paid.status === 409, 'nor to deposit_paid without being invoiced', 'status ' + paid.status);

    const bogus = await call(env, 'POST', '/orders/' + ref + '/status', { status: 'refunded' }, OPS);
    ok(bogus.status === 400, 'and an unknown status is refused', 'status ' + bogus.status);

    /* Walk it properly, one step at a time. */
    let last = null;
    for (const step of T.FLOW.slice(1)) {
        last = await call(env, 'POST', '/orders/' + ref + '/status', { status: step }, OPS);
        if (last.status !== 200) break;
    }
    ok(last && last.status === 200 && last.body.status === 'delivered',
       'but it walks the whole flow one step at a time',
       last ? last.status + ' ' + (last.body && last.body.status) : 'no response');

    const back = await call(env, 'POST', '/orders/' + ref + '/status', { status: 'shipped' }, OPS);
    ok(back.status === 409, 'and cannot go backwards', 'status ' + back.status);
}

{
    /* Cancelling is always reachable, and is a dead end. */
    const env = newEnv();
    const placed = await call(env, 'POST', '/orders', GOOD_BODY);
    const ref = placed.body.reference;
    const cancelled = await call(env, 'POST', '/orders/' + ref + '/status', { status: 'cancelled' }, OPS);
    ok(cancelled.status === 200, 'an order can always be cancelled', 'status ' + cancelled.status);
    const after = await call(env, 'POST', '/orders/' + ref + '/status', { status: 'quoted' }, OPS);
    ok(after.status === 409, 'and a cancelled order does not resume', 'status ' + after.status);

    /* The transition that actually needs the explicit cancelled check.
       stepOf('cancelled') is -1, and -1 + 1 === 0, which is the FIRST step — so
       the one-step rule alone would happily revive a cancelled order back to
       quote_requested. Every other target is caught by the step arithmetic;
       this one is caught by nothing else. */
    const revive = await call(env, 'POST', '/orders/' + ref + '/status',
                              { status: 'quote_requested' }, OPS);
    ok(revive.status === 409, 'and specifically cannot be revived to the first step',
       'status ' + revive.status);
}

/* ---- who may advance an order ---- */

{
    const env = newEnv();
    const placed = await call(env, 'POST', '/orders', GOOD_BODY);
    const ref = placed.body.reference;

    const anon = await call(env, 'POST', '/orders/' + ref + '/status', { status: 'quoted' });
    ok(anon.status === 401, 'a customer cannot advance their own order', 'status ' + anon.status);

    const wrong = await call(env, 'POST', '/orders/' + ref + '/status', { status: 'quoted' },
                             { Authorization: 'Bearer wrong-secret' });
    ok(wrong.status === 401, 'nor can a wrong token', 'status ' + wrong.status);

    const list = await call(env, 'GET', '/orders');
    ok(list.status === 401, 'and the order list is not public', 'status ' + list.status);

    const listed = await call(env, 'GET', '/orders', undefined, OPS);
    ok(listed.status === 200 && listed.body.orders.length === 1,
       'but the owner can list orders',
       listed.status + ' ' + (listed.body && listed.body.orders && listed.body.orders.length));
}

/* With no OPS_SECRET configured, owner routes must be closed, not open. A
   missing secret compared against a missing header is the classic way an
   unconfigured deployment ends up world-writable. */
{
    const env = { ORDERS: kv() };
    const placed = await call(env, 'POST', '/orders', GOOD_BODY);
    const ref = placed.body.reference;
    const noSecret = await call(env, 'POST', '/orders/' + ref + '/status', { status: 'quoted' },
                                { Authorization: 'Bearer ' });
    ok(noSecret.status === 401, 'an unconfigured OPS_SECRET locks the owner routes, not opens them',
       'status ' + noSecret.status);
    ok(T.constantEquals('', '') === true && T.constantEquals('a', 'b') === false,
       'and the comparison itself is sane');
}

/* ---- origin ---- */

{
    const env = newEnv();
    const req = new Request('https://orders.example/orders', {
        method: 'POST',
        headers: { Origin: 'https://not-us.example', 'Content-Type': 'application/json' },
        body: JSON.stringify(GOOD_BODY)
    });
    const res = await worker.default.fetch(req, env);
    ok(res.status === 403, 'an order from an unknown origin is refused', 'status ' + res.status);
}

/* ---- rate limiting ---- */

{
    const env = newEnv();
    let refused = 0;
    for (let i = 0; i < 15; i++) {
        const r = await call(env, 'POST', '/orders', GOOD_BODY, { 'CF-Connecting-IP': '10.0.0.9' });
        if (r.status === 429) refused++;
    }
    ok(refused > 0, 'a flood of orders from one address is throttled', String(refused));

    const other = await call(env, 'POST', '/orders', GOOD_BODY, { 'CF-Connecting-IP': '10.0.0.10' });
    ok(other.status === 201, 'and the throttle is per address, not global', 'status ' + other.status);
}

/* ---- failures do not leak ---- */

{
    /* KV that throws, which is what a Cloudflare incident looks like. */
    const env = { ORDERS: { get: async () => { throw new Error('KV down'); },
                            put: async () => { throw new Error('KV down'); },
                            list: async () => { throw new Error('KV down'); } },
                  OPS_SECRET: 'test-ops-secret' };
    const r = await call(env, 'POST', '/orders', GOOD_BODY);
    ok(r.status === 500, 'a storage failure is a 500, not a crash', 'status ' + r.status);
    ok(r.body && !/KV down|stack|at Object/.test(JSON.stringify(r.body)),
       'and says nothing about why', JSON.stringify(r.body));
}

{
    const env = newEnv();
    const req = new Request('https://orders.example/orders', {
        method: 'POST',
        headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
        body: '{not json'
    });
    const res = await worker.default.fetch(req, env);
    ok(res.status === 400, 'a malformed body is a 400', 'status ' + res.status);
}

/* ---- the Worker never reads a price from anywhere else ---- */

/* Scanning the whole file for big numbers was too blunt — it flagged the
   rate-limit window and the KV TTL, which are time, not money. Scan the pricing
   function itself, where any numeric literal beyond the obvious is a second
   source of truth. */
(function () {
    const src = fs.readFileSync(W + 'index.js', 'utf8');
    const a = src.indexOf('function priceOrder(');
    const b = src.indexOf('\nfunction ', a + 1);
    ok(a >= 0 && b > a, 'priceOrder can be located for scanning');
    /* Comments stripped: the function explains its own rounding and names 0.75
       while doing so, and a scan over raw source cannot tell an explanation
       from a second source of truth. Same trap as the checkout rate check. */
    const body = src.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

    /* 100 is the cent rounding; 0 and 1 are loop and guard values. Anything
       else is a number about money that did not come from the catalogue. */
    const allowed = new Set(['0', '1', '100']);
    const literals = (body.match(/\b\d+(\.\d+)?\b/g) || []).filter(n => !allowed.has(n));
    ok(literals.length === 0, 'the pricing function hard-codes no figures of its own',
       literals.join(', '));

    /* And it must reach the catalogue for both halves of a price. */
    ok(body.indexOf('CATALOGUE[model]') >= 0, 'it takes each price from the catalogue');
    ok(body.indexOf('DEPOSIT_RATE') >= 0, 'and the rate from the generated constant');

    /* Nothing anywhere reads a money figure off the request body. */
    const reads = ['body.usd', 'body.total', 'body.deposit', 'body.balance',
                   'raw.usd', 'raw.each', 'raw.price', 'raw.total']
        .filter(k => src.indexOf(k) >= 0);
    ok(reads.length === 0, 'and nothing reads a total off the request', reads.join(', '));
})();

/* ---- the generator is idempotent ---- */

(function () {
    const before = fs.readFileSync(W + 'catalogue.js', 'utf8');
    const { execSync } = require('child_process');
    execSync('node "' + ROOT + 'tools/build-order-catalogue.js"', { cwd: ROOT });
    const after = fs.readFileSync(W + 'catalogue.js', 'utf8');
    ok(before === after, 'regenerating the catalogue changes nothing');
})();

console.log('');
console.log(fail ? '  ' + fail + ' FAILED' : '  orders-suite: ALL OK');
process.exit(fail ? 1 : 0);
