/* The chosen facility, from the card a customer clicks to the order the Worker stores.
 *
 * This is the first thing on the site where a customer makes a CHOICE before paying and expects
 * it to still be true afterwards. Three things can go wrong and none of them look wrong:
 *
 *   1. The figures drift. Capacity is shown on the hosting card, the catalogue page and the cart.
 *      If those are three copies, they agree until somebody edits one. price-list.js exists in
 *      this repo because that already happened to machine costs and they ended up 5.8x apart.
 *   2. The choice is dropped. A customer picks Texas, pays, and the order says "a Proton facility".
 *      Silently discarding a shipping instruction is worse than refusing it.
 *   3. The choice is honoured for a site that cannot take machines. Every site is orderable
 *      today — the ones not yet energised are sold as reservations — but one will close the
 *      first time a site fills up, and taking money against it then would be selling space that
 *      does not exist.
 */

const REPO_ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

import fs from 'fs';
import path from 'path';

const W = REPO_ROOT + 'worker-orders/';
const worker = await import('file:///' + W + 'index.js');
const catalogue = await import('file:///' + W + 'catalogue.js');

const { createRequire } = await import('module');
const require = createRequire(import.meta.url);
const Facilities = require(path.join(REPO_ROOT, 'site', 'facilities.js'));
const Prepay = require(path.join(REPO_ROOT, 'site', 'prepay.js'));

const CHR = String.fromCharCode(10);
let pass = 0, fail = 0;
function ok(cond, label, note) {
    if (cond) { pass++; console.log('  ok    ' + label); }
    else { fail++; console.log('  FAIL  ' + label + (note ? '   ' + note : '')); }
}
function eq(a, b, label) { ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }

const ORIGIN = 'https://protonminingco.com';

function kv() {
    const m = new Map();
    return {
        async get(k, t) { const v = m.get(k); return v === undefined ? null : (t === 'json' ? JSON.parse(v) : v); },
        async put(k, v) { m.set(k, typeof v === 'string' ? v : JSON.stringify(v)); },
        async list(o) {
            const p = (o || {}).prefix || '', keys = [];
            for (const k of m.keys()) if (k.indexOf(p) === 0) keys.push({ name: k });
            return { keys, list_complete: true };
        },
        _m: m
    };
}

async function post(env, urlPath, body) {
    const req = new Request('https://orders.example' + urlPath, {
        method: 'POST',
        headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const res = await worker.default.fetch(req, env);
    let json = null;
    try { json = JSON.parse(await res.text()); } catch (e) {}
    return { status: res.status, body: json };
}

/* The 201 deliberately returns only the reference and the totals, so the destination is read
   back the way order.html reads it: by reference. That is also the honest test — what matters
   is what the customer can SEE on their order, not what the create call happened to echo. */
async function get(env, urlPath) {
    const req = new Request('https://orders.example' + urlPath, {
        method: 'GET', headers: { Origin: ORIGIN }
    });
    const res = await worker.default.fetch(req, env);
    let json = null;
    try { json = JSON.parse(await res.text()); } catch (e) {}
    return { status: res.status, body: json };
}

const LINES = [{ model: 'Antminer S21', qty: 2 }];
const CONTACT = { name: 'A Buyer', email: 'buyer@example.com' };

console.log('\n=== the facility data itself ===');
{
    const all = Facilities.all();
    ok(all.length >= 4, 'there are facilities to choose from', all.length + ' found');

    const ids = all.map(s => s.id);
    eq(new Set(ids).size, ids.length, 'every id is unique');

    all.forEach(s => {
        ok(typeof s.capacityMw === 'number' && s.capacityMw > 0, s.id + ' has a capacity');
        ok(typeof s.powerCents === 'number' && s.powerCents > 0, s.id + ' has a power price');
        ok(!!s.status && !!s.region && !!s.fuel, s.id + ' has a status, a region and a fuel');
        /* THE HONESTY FLAG. These sites are not contracted, and every figure above is shown to a
           customer who may pay against it. The moment one becomes real this flips to false and
           the wording changes everywhere at once — but while it is true it must be true
           everywhere, not on the pages somebody remembered. */
        eq(s.indicative, true, s.id + ' is marked indicative');
    });

    /* Sanity, not precision: these are indicative figures for real regions, so they have to be
       in the range those regions actually support. A power price of 30c or a 5000 MW site would
       be a typo that reads as a fact.

       THE CEILING STAYS AT 8c. It was briefly widened to 13c to admit a +3c increase that turned
       out to be a mistyped +0.3c, and it is back where it belongs. Worth leaving the note: the
       ceiling is roughly where a stranded-gas host stops being cheap, so a change that breaks it
       is a change worth looking at twice rather than a test to edit around. */
    all.forEach(s => {
        ok(s.powerCents >= 1 && s.powerCents <= 8, s.id + ' power price is plausible for stranded energy',
           s.powerCents + 'c/kWh');
        ok(s.capacityMw >= 1 && s.capacityMw <= 500, s.id + ' capacity is plausible', s.capacityMw + ' MW');
    });
}

console.log('\n=== an id that is not a facility resolves to nothing ===');
{
    /* It arrives in a query string a customer can edit. Guessing a default would put a pallet on
       a truck to the wrong continent; the pages all treat null as "none chosen". */
    ok(Facilities.byId('nope') === null, 'an unknown id is null');
    ok(Facilities.byId('') === null, 'so is an empty one');
    ok(Facilities.byId(undefined) === null, 'and a missing one');
    ok(Facilities.byId('PERMIAN') === null, 'ids are case-sensitive rather than nearly-matching');

    eq(Facilities.idFromQuery('?site=permian'), 'permian', 'the id is read from the query');
    eq(Facilities.idFromQuery('?a=1&site=cold-lake&b=2'), 'cold-lake', '...wherever it sits');
    eq(Facilities.idFromQuery('?nosite=1'), null, '...and absent when it is not there');
}

console.log('\n=== the figures have exactly one home ===');
{
    /* The hosting page is generated from facilities.js. If somebody hand-edits a capacity into
       the HTML, the next generator run reverts it — and this fails in the meantime rather than
       letting two numbers coexist. */
    const html = fs.readFileSync(path.join(REPO_ROOT, 'site', 'hosting.html'), 'utf8');
    Facilities.all().forEach(s => {
        ok(html.indexOf(Facilities.capacityLabel(s)) >= 0, s.id + ' capacity appears on the hosting page');
        ok(html.indexOf(Facilities.powerLabel(s)) >= 0, s.id + ' power price appears on the hosting page');
        ok(html.indexOf(s.status) >= 0, s.id + ' status appears on the hosting page');
    });

    /* And the Worker's list is generated from the same file, so it cannot know about a site the
       site does not offer, or miss one it does. */
    eq(JSON.stringify(catalogue.SITE_IDS), JSON.stringify(Facilities.all().map(s => s.id)),
       'the order Worker knows exactly the same sites');
    eq(JSON.stringify(catalogue.SITE_OPEN),
       JSON.stringify(Facilities.all().filter(Facilities.acceptsMachines).map(s => s.id)),
       '...and the same ones as open');
}

console.log(CHR + '=== prepaid electricity: longer term, better rate ===');
{
    const terms = Prepay.all();
    ok(terms.length >= 2, 'there is a ladder to climb', terms.length + ' tiers');

    /* THE ENTIRE PROMISE OF THE PAGE, asserted rather than assumed. "Lock in a longer term and
       pay less" is the headline; if a discount is ever edited so that a longer term costs more,
       the page contradicts itself and nothing else in the codebase would notice — the cards
       would render perfectly, in the wrong order, with a straight face. */
    for (let i = 1; i < terms.length; i++) {
        ok(terms[i].years > terms[i - 1].years,
           terms[i].id + ' is a longer commitment than ' + terms[i - 1].id);
        ok(terms[i].discount > terms[i - 1].discount,
           '...and is discounted more', terms[i - 1].discount + ' -> ' + terms[i].discount);
    }

    Facilities.all().forEach(site => {
        let last = null;
        terms.forEach(t => {
            const r = Prepay.rateFor(site, t);
            ok(r !== null && r > 0, site.id + ' has a rate on ' + t.id, r + 'c');
            if (last !== null) {
                ok(r < last, site.id + ': ' + t.id + ' beats the shorter term', last + ' -> ' + r);
            }
            /* And a discount is a discount: never above the published rate. */
            ok(r <= site.powerCents, site.id + ': ' + t.id + ' is not dearer than the base rate');
            last = r;
        });
    });

    /* The arithmetic itself, against a base that makes the answers checkable by hand.
     *
     * THE EXPECTED VALUES ARE WORKED OUT BY HAND AND STAY THAT WAY. Deriving them from
     * term.discount would re-implement rateFor and prove nothing about it. So a change to the
     * ladder is meant to fail here, and the fix is to do the multiplication again — never to
     * paste in whatever the module now returns, which is how a rounding bug gets blessed.
     *
     * 5.2c less 4% is 4.992c. Less 8% is 4.784c. Less 12% is 4.576c.
     *
     * The LABELS come from the module, so a percentage in a test name cannot end up describing
     * a discount the ladder no longer offers. */
    const ref = { powerCents: 5.2 };
    const pct = id => Prepay.pctLabel(Prepay.byId(id));
    eq(Prepay.rateFor(ref, Prepay.byId('12m')), 4.992, pct('12m') + ' off 5.2c');
    eq(Prepay.rateFor(ref, Prepay.byId('24m')), 4.784, pct('24m') + ' off 5.2c');
    eq(Prepay.rateFor(ref, Prepay.byId('36m')), 4.576, pct('36m') + ' off 5.2c');

    /* Half-inputs produce nothing, not a plausible number. A rate is what somebody signs. */
    ok(Prepay.rateFor(null, Prepay.byId('12m')) === null, 'no site, no rate');
    ok(Prepay.rateFor(ref, null) === null, 'no term, no rate');
    ok(Prepay.byId('nonsense') === null, 'an unknown term is null');

    /* The prepaid sum. 10 kW continuous for a year at 4.992c is 8760 x 10 x 0.04992 = 4372.99. */
    eq(Prepay.totalFor(ref, Prepay.byId('12m'), 10), 4372.99, 'the prepaid total for 10 kW');
    /* Rounded ONCE, at the end. Rounding the rate first and multiplying by 8,760 hours turns a
       rounding error into real money. */
    /* 10 kW for 36 months is 262,800 kWh; at 4.576c that is $12,025.73. */
    const longest = Prepay.totalFor(ref, Prepay.byId('36m'), 10);
    eq(longest, 12025.73, 'and for the longest term');

    /* The saving is the difference, not a separate calculation that can drift from it. */
    const full = 5.2 / 100 * 10 * 8760 * 3;
    eq(Prepay.savingFor(ref, Prepay.byId('36m'), 10),
       Math.round((full - longest) * 100) / 100, 'the saving is exactly what is not paid');
    ok(Prepay.savingFor(ref, Prepay.byId('36m'), 10) > 0, '...and it is a saving');
    ok(Prepay.totalFor(ref, Prepay.byId('12m'), 0) === null, 'no load, no total');

    /* MONTHS AND YEARS CANNOT DRIFT. The customer is quoted in months and the arithmetic runs in
       years, so a term advertised as 24 months and billed as three of them is a one-character
       edit away. Both are stored; this is what keeps them the same term. */
    Prepay.all().forEach(t => {
        eq(t.months, t.years * 12, t.id + ': quoted in months, billed in years, same length');
        ok(/^[0-9]+m$/.test(t.id), t.id + ': the id says how many months it is');
        ok(t.label.indexOf(String(t.months) + ' months') === 0,
           t.id + ': and so does the label a customer reads');
    });

    /* EXACTLY ONE FEATURED TIER. Two renderers read this flag; none of them would notice if it
       were on two terms, and the page would highlight both as the one to take. */
    eq(Prepay.all().filter(t => t.featured).length, 1, 'exactly one tier is featured');
    eq(Prepay.all().filter(t => t.featured)[0].id, '36m', 'and it is the longest');

    /* THE LADDER LIVES ON THE CATALOGUE PAGE, NOT THE HOSTING PAGE — and that is the whole
       point of it: the rate shown is the rate of the site the customer picked on the way in.
       On the hosting page, with no site chosen, every figure would have to be a "from" price
       across five different rates. So the tiers are rendered by hardware.js at runtime from the
       chosen facility, and what is asserted here is the wiring rather than baked-in markup. */
    const hw = fs.readFileSync(path.join(REPO_ROOT, 'site', 'hardware.html'), 'utf8');
    ok(hw.indexOf('id="hwPrepay"') >= 0, 'the catalogue page has somewhere to put the ladder');
    ok(/<script src="\.\/prepay\.js/.test(hw), '...and loads the module that prices it');

    const hwjs = fs.readFileSync(path.join(REPO_ROOT, 'site', 'hardware.js'), 'utf8');
    ok(hwjs.indexOf('Prepay.rateFor') >= 0 || hwjs.indexOf('Prepay.rateLabel') >= 0,
       'the rate shown comes from the chosen site, not from a constant');
    ok(hwjs.indexOf('Facilities.chosen()') >= 0,
       '...and the site it uses is the one the customer picked');
    /* Nothing at all without a site, rather than a ladder with no rate to apply. */
    ok(hwjs.indexOf("slot.innerHTML = ''") >= 0,
       'no site chosen renders no ladder');

    /* The hosting page carries the DISCOUNTS as a strip under the site picker, and no rates.
       That split is the whole design: a percentage is the same at every site and can be shown
       beside five of them; a rate is not, and would have to be a "from" price. */
    const hostPage = fs.readFileSync(path.join(REPO_ROOT, 'site', 'hosting.html'), 'utf8');
    const bar = hostPage.slice(hostPage.indexOf('<!-- prepaybar:begin -->'),
                               hostPage.indexOf('<!-- prepaybar:end -->'));
    ok(bar.length > 0, 'the discount strip is on the hosting page');
    Prepay.all().forEach(t => {
        ok(bar.indexOf(Prepay.pctLabel(t)) >= 0, t.id + ' discount is on the strip');
        /* QUOTED IN MONTHS, which is the unit the ladder is sold in. Asserting years here
           would pass on a bar that advertised "3 years" beside an id of 36m. */
        ok(bar.indexOf(String(t.months) + ' months') >= 0,
           t.id + ' term length is on the strip, in months');
    });

    /* NO RATE ON THE STRIP. Any site's rate appearing here would be one of five presented as
       though it were the price. */
    Facilities.all().forEach(sf => {
        Prepay.all().forEach(t => {
            ok(bar.indexOf(Prepay.rateLabel(sf, t)) < 0,
               'the strip does not quote ' + sf.id + ' on ' + t.id);
        });
    });

    /* Segments are widthed by their discount, so the ladder has a shape before it is read. */
    ok(/flex:\s*[0-9.]+ 1 0/.test(bar), 'the segments are proportional rather than equal');

    ok(hostPage.indexOf('pp-tier') < 0,
       'and the pickable tiers stay on the catalogue page, where a rate is a real number');

    /* A rate never travels without the sentence that qualifies it — these are commercial terms
       the business has not agreed, and they are what a customer would pay against. */
    ok(Prepay.INDICATIVE_NOTE.indexOf('indicative') >= 0,
       'a prepaid rate never travels without saying it is indicative');
    eq(Prepay.CONFIRMED, false, 'the schedule is still marked unconfirmed');
}

console.log(CHR + '=== the marketing site cannot go stale invisibly ===');
{
    /* THE SECOND TIME THIS BIT. The portal had a hand-kept ?v= that was not bumped after a
       restyle; the site had no version on anything, so a new pricing section was invisible behind
       a cached page and a cached stylesheet. Both times the report was "nothing changed", and
       both times that was true of what the browser was showing.

       Every local asset now carries a hash of the assets it belongs to, and this asserts the
       committed pages carry the hash of the committed files. It RECOMPUTES rather than
       regenerating: a check that fixed the stamp in order to check it would pass while the repo
       still held the stale one. */
    const stamper = require(path.join(REPO_ROOT, 'tools', 'build-asset-stamp.js'));
    const area = stamper.AREAS.filter(a => a.name === 'site')[0];
    ok(!!area, 'the marketing site is an area the stamper knows about');

    const want = stamper.expected(area);
    const have = stamper.current(area);
    ok(want.hashed > 0, 'it hashes some assets', want.hashed + ' files');
    eq(have.length, 1, 'every page carries one stamp, and no page is unstamped');
    eq(have[0], want.stamp, 'and it is the hash of what they load');

    /* An unstamped local asset reads as the empty string above, so this names it rather than
       leaving a reader to work out what an empty stamp meant. */
    ok(have.indexOf('') < 0, 'no local script or stylesheet ships without a version');
}

console.log(CHR + '=== a generator only owns its own section ===');
{
    /* THIS IS A REGRESSION TEST FOR CONTENT THAT WAS ACTUALLY LOST.

       build-diagram.js used to splice from its own opening marker all the way to
       `<!-- ===== TERMS ===== -->`, so it deleted anything a person wrote between the two. Two
       whole sections went that way — the "what you get" block and this page's prepaid pricing
       — on a routine generator run, with no error, no failing test, and nothing in the output
       to notice. The page just quietly had less in it.

       It now stops at its own closing marker. A sentinel is placed in the gap, every generator
       is run, and the sentinel has to still be there. */
    const { execFileSync } = await import('child_process');
    const page = path.join(REPO_ROOT, 'site', 'hosting.html');
    const original = fs.readFileSync(page, 'utf8');

    const SENTINEL = '<!-- neighbour-sentinel -->';
    const at = original.indexOf('<!-- ===== TERMS ===== -->');
    ok(at > 0, 'the anchor the diagram generator inserts before still exists');
    fs.writeFileSync(page, original.slice(0, at) + SENTINEL + CHR + original.slice(at));

    let survived = false;
    try {
        ['build-diagram.js', 'build-facilities.js', 'build-nav.js', 'build-seo.js']
            .forEach(g => execFileSync(process.execPath,
                                       [path.join(REPO_ROOT, 'site', 'tools', g)],
                                       { stdio: 'pipe' }));
        survived = fs.readFileSync(page, 'utf8').indexOf(SENTINEL) >= 0;
    } finally {
        fs.writeFileSync(page, original);
    }
    ok(survived, 'a section between the diagram block and TERMS survives every generator');

    /* And the two that were lost are back, and stay back. */
    ok(original.indexOf('Everything between the pad and the pool') >= 0,
       'the what-you-get section is on the page');
    /* The prepay ladder used to be here too and was lost the same way. It now lives on the
       catalogue page, rendered per site, so what is checked is that it is NOT here — one copy,
       in the place where a rate can be a real number rather than a "from". */
    ok(original.indexOf('<!-- prepay:begin -->') < 0,
       'the prepaid ladder is not duplicated onto the hosting page');
}

console.log(CHR + '=== the generator round-trips ===');
{
    /* Run it against the committed page and nothing may move. A generator that is not a no-op on
       its own output means the checked-in HTML and the data have already diverged — and since
       this one writes the capacity a customer buys against, a diff here is a figure in the repo
       that nobody chose. */
    const { execFileSync } = await import('child_process');
    const page = path.join(REPO_ROOT, 'site', 'hosting.html');
    const before = fs.readFileSync(page, 'utf8');
    execFileSync(process.execPath, [path.join(REPO_ROOT, 'site', 'tools', 'build-facilities.js')],
                 { stdio: 'pipe' });
    const after = fs.readFileSync(page, 'utf8');
    ok(before === after, 'build-facilities.js is a no-op on its own output',
       'hosting.html changed when the generator ran');

    /* And the markers survive, or the next run silently stops updating anything. */
    ok(after.indexOf('<!-- facilities:begin -->') >= 0 &&
       after.indexOf('<!-- facilities:end -->') >= 0, 'the markers are still in the page');
}

console.log('\n=== a figure never travels without the sentence that qualifies it ===');
{
    /* The banner is the one builder both the catalogue and the cart use. If a figure can be
       rendered without the indicative note, then somewhere in the purchase a customer sees a
       rate presented as settled. */
    Facilities.all().forEach(s => {
        const html = Facilities.bannerHtml(s, 'cart');
        const hasFigure = html.indexOf(Facilities.powerLabel(s)) >= 0;
        ok(hasFigure, s.id + ' banner shows the power price');
        ok(html.indexOf('indicative') >= 0, s.id + ' banner also carries the qualifier');
    });
    eq(Facilities.bannerHtml(null, 'cart'), '', 'no site chosen renders nothing at all');
}

console.log(CHR + '=== the order carries the site, and a full one is not a refusal ===');
{
    const env = { ORDERS: kv() };

    /* EVERY SITE IS CURRENTLY FULL, and that is a state to sell into rather than a wall. A
       customer buying machines for a site with no free racks is buying machines and a place on
       that site's waitlist — refusing the order would turn somebody handing us money for
       hardware into somebody who cannot give us any. */
    const site = Facilities.all()[0];
    ok(Facilities.isFull(site), 'the sample site is full', site.status);

    const good = await post(env, '/orders', {
        lines: LINES, contact: CONTACT, destination: { kind: 'ion', site_id: site.id }
    });
    eq(good.status, 201, 'an order against a full site is accepted');
    const back = await get(env, '/orders/' + good.body.reference);
    eq(back.status, 200, '...and the order can be read back');
    eq(back.body.destination.site_id, site.id, '...with the chosen site on it');

    /* The flag ops needs before anything ships. Set from the WORKER'S list, never from the
       browser, for the same reason prices are. */
    eq(back.body.destination.waitlisted, true, '...and marked as waiting on space');

    /* A site with room behaves differently, and the difference has to be visible — otherwise
       the flag is decoration that happens to be true today. SITE_OPEN is a const binding whose
       ARRAY is ordinary and mutable, so a site can be opened for the length of one request
       without building a second catalogue. */
    catalogue.SITE_OPEN.push(site.id);
    const openOrder = await post(env, '/orders', {
        lines: LINES, contact: CONTACT, destination: { kind: 'ion', site_id: site.id }
    });
    catalogue.SITE_OPEN.pop();
    const openBack = await get(env, '/orders/' + openOrder.body.reference);
    eq(openOrder.status, 201, 'a site with room is accepted too');
    eq(openBack.body.destination.waitlisted, false, '...and is NOT flagged as waiting');

    /* An invented site is still refused. "Full" and "not a place" are different answers, and
       only one of them is about capacity. */
    const bogus = await post(env, '/orders', {
        lines: LINES, contact: CONTACT, destination: { kind: 'ion', site_id: 'atlantis' }
    });
    eq(bogus.status, 400, 'an invented site is refused');

    /* Most orders will not name one, and that has to stay fine: ops assigns a site. */
    const none = await post(env, '/orders', {
        lines: LINES, contact: CONTACT, destination: { kind: 'ion' }
    });
    eq(none.status, 201, 'no site named is still a valid order');
    const noneBack = await get(env, '/orders/' + none.body.reference);
    ok(!noneBack.body.destination.site_id, '...and does not invent one');
    ok(noneBack.body.destination.waitlisted === undefined,
       '...nor a waitlist flag for a site nobody chose');
}

console.log(CHR + '=== a full site says so before anything is paid ===');
{
    /* The one thing a customer must not discover after their card details are in. It has to be
       on the catalogue banner AND in the cart, because those are the two screens between the
       card they clicked and the money. */
    Facilities.all().filter(Facilities.isFull).forEach(s => {
        ['hardware', 'cart'].forEach(where => {
            const html = Facilities.bannerHtml(s, where);
            ok(html.indexOf('fully occupied') >= 0,
               s.id + ' says it is full on the ' + where + ' banner');
            ok(html.indexOf('waitlist') >= 0, s.id + ' says what happens instead, on ' + where);
        });
    });

    /* And the card itself, before the click. Telling somebody only at the checkout would be
       three screens of letting them believe otherwise. */
    const page = fs.readFileSync(path.join(REPO_ROOT, 'site', 'hosting.html'), 'utf8');
    Facilities.all().filter(Facilities.isFull).forEach(s => {
        ok(page.indexOf(s.status) >= 0, s.id + ' status is on its card');
    });
    /* SCOPED TO THE CARDS. The first version of this looked at the whole page and failed on the
       hero and nav buttons, which say "Start mining" and are the page's own call to action —
       they take you to the catalogue, which is exactly right whatever any single site's occupancy
       is. The rule is about a card promising something a specific site cannot give. */
    const cards = page.slice(page.indexOf('<!-- facilities:begin -->'),
                             page.indexOf('<!-- facilities:end -->'));
    ok(cards.indexOf('Join the waitlist') >= 0,
       'a full site asks for what it can give');
    const overpromising = Facilities.all().filter(
        s2 => Facilities.isFull(s2) && cards.indexOf('>Start mining') >= 0
              && !Facilities.all().some(Facilities.acceptsMachines));
    eq(overpromising.length, 0, 'no card says Start mining over a site with no free racks');

    /* And every card still reaches the catalogue: full is not a dead end. */
    Facilities.all().forEach(s2 => {
        ok(cards.indexOf('./hardware.html?site=' + s2.id) >= 0,
           s2.id + ' still leads to the catalogue');
    });
}

console.log(CHR + '=== the prepaid term reaches the order ===');
{
    const env = { ORDERS: kv() };
    const site = Facilities.all()[0];

    /* The Worker's list is generated from prepay.js, so it cannot know a term the site does not
       offer, or miss one it does. */
    eq(JSON.stringify(catalogue.PREPAY_TERMS), JSON.stringify(Prepay.all().map(t => t.id)),
       'the order Worker knows exactly the same terms');

    for (const t of Prepay.all()) {
        const r = await post(env, '/orders', {
            lines: LINES, contact: CONTACT,
            destination: { kind: 'ion', site_id: site.id, prepay_term: t.id }
        });
        eq(r.status, 201, t.id + ' is accepted');
        const back = await get(env, '/orders/' + r.body.reference);
        eq(back.body.destination.prepay_term, t.id, '...and is on the order');
    }

    /* Not choosing one is choosing to pay monthly, and must stay a valid order. */
    const none = await post(env, '/orders', {
        lines: LINES, contact: CONTACT, destination: { kind: 'ion', site_id: site.id }
    });
    eq(none.status, 201, 'no term is still an order');
    const noneBack = await get(env, '/orders/' + none.body.reference);
    ok(noneBack.body.destination.prepay_term === undefined,
       '...and no term is invented for it');

    /* Present and unrecognised is REFUSED, not dropped — silently ignoring it would let
       somebody pay believing they had locked a discount for three years. */
    const bogus = await post(env, '/orders', {
        lines: LINES, contact: CONTACT,
        destination: { kind: 'ion', site_id: site.id, prepay_term: '99y' }
    });
    eq(bogus.status, 400, 'an invented term is refused rather than ignored');

    /* THE BROWSER NAMES A TERM; IT NEVER DEFINES ONE. A prepay is a multi-year commitment worth
       five figures, so a discount arriving from a page is the one thing that must not be
       storable. */
    const forged = await post(env, '/orders', {
        lines: LINES, contact: CONTACT,
        destination: { kind: 'ion', site_id: site.id, prepay_term: '12m',
                       discount: 0.9, years: 99, prepay_rate: 0.001 }
    });
    eq(forged.status, 201, 'the order is accepted');
    const fd = (await get(env, '/orders/' + forged.body.reference)).body.destination;
    eq(fd.prepay_term, '12m', 'the term the browser named is kept');
    ok(fd.discount === undefined, 'a discount it sent is not');
    ok(fd.years === undefined, 'nor a term length');
    ok(fd.prepay_rate === undefined, 'nor a rate');
    eq(Object.keys(fd).sort().join(','), 'kind,prepay_term,site_id,waitlisted',
       'the destination holds only what it should');
}

console.log('\n=== the browser names a site, never what it costs ===');
{
    /* Same rule the money already follows. If a browser could post its own power price, a
       customer could agree a rate with themselves. */
    const env = { ORDERS: kv() };
    const any = Facilities.all()[0];
    const r = await post(env, '/orders', {
        lines: LINES, contact: CONTACT,
        destination: { kind: 'ion', site_id: any.id, powerCents: 0.1, capacityMw: 9999 }
    });
    eq(r.status, 201, 'the order is accepted');
    const d = (await get(env, '/orders/' + r.body.reference)).body.destination;
    ok(d.powerCents === undefined, 'a power price sent by the browser is not stored');
    ok(d.capacityMw === undefined, 'nor a capacity');
    eq(Object.keys(d).sort().join(','), 'kind,site_id,waitlisted',
       'the destination holds only what it should');
}

console.log('=== machines and electricity are two costs, and stay two ===');
{
    /* The reason this is guarded rather than left to look right: the two costs are wildly
       different sizes and fall due at different times. Over 36 months the electricity is close to
       twice the hardware. A customer who reads one number and believes it covers both has been
       misled by arithmetic nobody performed on purpose — which is exactly what a single
       "total" would do. */
    const site = Facilities.byId('permian');
    const term = Prepay.byId('36m');
    const KW = 36.45, UNITS = 10, HW = 30100;
    const money = v => '$' + Math.round(v).toLocaleString('en-US');

    const html = Prepay.itemisedHtml({
        site, term, hardwareUsd: HW, kw: KW, units: UNITS, depositRate: 0.25
    });

    ok(html.indexOf('Machines') >= 0, 'the machines are named');
    ok(html.indexOf('Electricity') >= 0, 'the electricity is named');

    const power = Prepay.totalFor(site, term, KW);
    const dollars = (html.match(/[$][0-9,]+/g) || []);
    ok(dollars.indexOf(money(HW)) >= 0, 'the hardware cost appears on its own');
    ok(dollars.indexOf(money(power)) >= 0, 'the electricity cost appears on its own');
    /* LARGER, not "twice as large". It was over four times the hardware at seven years and is
       1.9x at 36 months — asserting a multiple would be pinning a commercial ratio that moves
       every time the ladder does, and the claim the breakdown actually rests on is that the
       electricity is big enough to matter on its own. */
    ok(power > HW, 'and the electricity really is the larger of the two',
       money(power) + ' vs ' + money(HW));

    /* THE SUM IS SHOWN AND IMMEDIATELY DISOWNED AS A PAYMENT. Both halves matter: leaving the
       total out makes a customer add up their own quote, and printing it bare invites them to
       believe one cheque covers it. */
    ok(dollars.indexOf(money(HW + power)) >= 0, 'the two are added up for comparison');
    ok(html.indexOf('not a single payment') >= 0,
       'and the sum says in words that it is not a payment');

    /* WHEN, beside HOW MUCH. A schedule in a footnote is a schedule nobody read. */
    ok(html.indexOf('deposit now') >= 0, 'the hardware says when it is due');
    ok(html.indexOf('hosting agreement is signed') >= 0,
       'the electricity says when it is due');
    ok(html.indexOf('deposit now') < html.indexOf('hosting agreement is signed'),
       'each timing sits with its own cost, in order');

    /* One builder, so the catalogue and the checkout cannot disagree. */
    const again = Prepay.itemisedHtml({
        site, term, hardwareUsd: HW, kw: KW, units: UNITS, depositRate: 0.25
    });
    eq(again, html, 'the same order itemises identically wherever it is shown');
}

console.log('\n=== nothing is itemised that was not bought ===');
{
    /* A customer shipping to their own address buys hardware from Proton and electricity from their
       own utility. Inventing a line for power we do not sell them would be inventing a charge. */
    const own = Prepay.itemisedHtml({
        site: null, term: null, hardwareUsd: 30100, kw: 36.45, units: 10, depositRate: 0.25
    });
    ok(own.indexOf('Machines') >= 0, 'their machines are still itemised');
    ok(own.indexOf('Electricity') < 0, 'no electricity line for power they do not buy here');
    ok(own.indexOf('not a single payment') < 0,
       'and no "both together" row, because there is only one cost');

    /* An unpriced order itemises nothing rather than a row of zeroes. */
    eq(Prepay.itemisedHtml({ site: Facilities.byId('permian'), term: Prepay.byId('24m'),
                             hardwareUsd: null, kw: 0, units: 0, depositRate: 0.25 }), '',
       'an order with no price shows no itemisation at all');
}

console.log('\n=== the electricity total is stated once ===');
{
    /* It used to appear twice on the checkout: in the facility banner and in the itemisation.
       Two copies of a figure are two figures to keep in step by hand, and this one is five
       digits. The banner keeps the RATE, which is a property of the site; the money lives in
       the itemised box, which is the thing headed "what you are paying for". */
    const ck = fs.readFileSync(path.join(REPO_ROOT, 'site', 'checkout.js'), 'utf8');
    const banner = ck.slice(ck.indexOf('fac-prepay'), ck.indexOf('slot.innerHTML = html;'));
    ok(banner.indexOf('Prepay.totalFor') < 0,
       'the facility banner no longer computes an electricity total');
    ok(banner.indexOf('rateLabel') >= 0, 'it still shows the rate, which belongs to the site');

    /* AND THE ELECTRICITY LINE IS SCOPED TO AN PROTON DESTINATION. A customer who picked a site,
       changed their mind and chose their own address still has that site in local storage. If
       the checkout itemised from storage rather than from the destination actually selected,
       it would quote them years of power they are not buying from us. */
    const block = ck.slice(ck.indexOf("ckItemised'"), ck.indexOf('var unpriced'));
    ok(block.indexOf('isIon') >= 0, 'the itemisation asks which destination was chosen');
    eq((block.match(/isIon [?]/g) || []).length, 2,
       'and both the site and the term are withheld when it is not ours');
}

console.log('\n=== the itemisation is on both pages the customer reads ===');
{
    /* The catalogue is where the order is assembled and the checkout is where it is confirmed.
       Itemising on one and not the other means the breakdown appears or vanishes depending on
       which way the customer navigates. */
    const PAGES = [['hardware.html', 'hwItemised'], ['cart.html', 'ckItemised']];
    for (const pair of PAGES) {
        const h = fs.readFileSync(path.join(REPO_ROOT, 'site', pair[0]), 'utf8');
        ok(h.indexOf('id="' + pair[1] + '"') >= 0, pair[0] + ' has somewhere to put it');
        ok(h.indexOf('prepay.js') >= 0, pair[0] + ' loads the module that builds it');
    }
    const SCRIPTS = [['hardware.js', 'hwItemised'], ['checkout.js', 'ckItemised']];
    for (const pair of SCRIPTS) {
        const j = fs.readFileSync(path.join(REPO_ROOT, 'site', pair[0]), 'utf8');
        ok(j.indexOf(pair[1]) >= 0, pair[0] + ' fills it');
        ok(j.indexOf('Prepay.itemisedHtml') >= 0, pair[0] + ' uses the shared builder');
    }
}

console.log('\n=== the itemised figures agree with the term that was chosen ===');
{
    /* The box sits directly under the deposit and balance split. If it disagreed with the ladder
       above it, the page would be arguing with itself in two adjacent boxes. */
    const site = Facilities.byId('cold-lake');
    const money = v => '$' + Math.round(v).toLocaleString('en-US');
    for (const term of Prepay.all()) {
        const KW = 100, HW = 250000;
        const html = Prepay.itemisedHtml({ site, term, hardwareUsd: HW, kw: KW,
                                           units: 80, depositRate: 0.25 });
        const power = Prepay.totalFor(site, term, KW);
        const found = (html.match(/[$][0-9,]+/g) || []);
        eq(found[found.length - 1], money(HW + power),
           term.id + ': the last figure is the sum of the two above it');
        ok(found.indexOf(money(power)) >= 0, term.id + ': at that term’s own rate');
        ok(html.indexOf(Prepay.rateLabel(site, term)) >= 0,
           term.id + ': and the rate it was worked out from is printed beside it');
    }

    /* A LONGER TERM COSTS MORE IN TOTAL AND LESS PER kWh. Both directions matter: the first is
       what makes it a commitment, the second is what makes it worth making. A ladder that got
       either backwards would be selling the opposite of what the page claims. */
    const terms = Prepay.all();
    for (let i = 1; i < terms.length; i++) {
        const a = Prepay.totalFor(site, terms[i - 1], 100);
        const b = Prepay.totalFor(site, terms[i], 100);
        ok(b > a, terms[i].id + ' commits more money than ' + terms[i - 1].id);
        ok(Prepay.rateFor(site, terms[i]) < Prepay.rateFor(site, terms[i - 1]),
           terms[i].id + ' buys it at a lower rate');
    }
}

console.log('=== the order follows the term that was chosen ===');
{
    /* Choosing a term is not a note pinned to the order, it changes what the order costs. The
       ladder, the banner and the power field all re-rendered on a term click; the order box next
       to them did not, so it kept quoting the term before last. Verified against a real browser
       — clicking 1y, 3y and 7y moves the electricity line, the total, the power field and the
       pasted summary, all three distinct — and pinned here so it stays that way. */
    const hw = fs.readFileSync(path.join(REPO_ROOT, 'site', 'hardware.js'), 'utf8');
    const rf = hw.slice(hw.indexOf('function renderFacility'),
                        hw.indexOf('function fillPowerPrice'));
    ok(rf.indexOf('renderOrder()') >= 0,
       'a term change re-renders the order, not only the ladder above it');
    ok(rf.indexOf('renderPrepay()') >= 0, 'and the ladder');
    ok(rf.indexOf('fillPowerPrice(') >= 0, 'and the power field');

    /* THE ONLY TERM-CLICK HANDLER GOES THROUGH renderFacility. A second path that called
       renderPrepay() alone would put the stale-order bug straight back.

       COMMENTS STRIPPED FIRST, for the reason cart-suite.js records at length: the comment in
       that handler explains itself with the words "renderFacility(), NOT renderPrepay()", and
       counting them as calls made the assertion read three calls where there are two, then fail
       for the one thing it should have been pleased about. A test that punishes explaining
       itself gets the explanations deleted. */
    const wire = hw.slice(hw.indexOf('function wirePrepay'), hw.length)
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ');
    eq((wire.match(/renderFacility\(\)/g) || []).length, 2,
       'both the pick and the clear go through the one re-render');
    ok(wire.indexOf('renderPrepay()') < 0,
       'and neither re-renders the ladder on its own');
}

console.log('\n=== the pasted order says where it goes and what power costs ===');
{
    /* This block is what a customer sends to their finance team. It was hardware only, so a
       fleet arrived in an inbox with no destination and no rate — while the checkout, one page
       later, printed both. Two pastes of the same order that read differently is how a finance
       team ends up asking which one is real. */
    const hw = fs.readFileSync(path.join(REPO_ROOT, 'site', 'hardware.js'), 'utf8');
    const ex = hw.slice(hw.indexOf('function orderExtras'), hw.indexOf('function renderOrder'));
    ok(ex.indexOf('Destination: ') >= 0, 'the pasted order names the site');
    ok(ex.indexOf('status: ') >= 0, 'and whether it can take machines');
    ok(ex.indexOf('electricity: ') >= 0, 'and the term with its rate');
    ok(ex.indexOf('electricity total: ') >= 0, 'and what that term costs');
    ok(ex.indexOf('not a single payment') >= 0,
       'and the sum carries the same warning the screen does');
    /* THE EXACT CONDITION, not just a mention of it. Two mutations survived a bare
       indexOf('isFull'): wrapping the call so the branch is dead, and inverting it so the
       notice lands on every site that is NOT full. Both leave the word in the file. */
    ok(ex.indexOf('if (Facilities.isFull(site)) {') >= 0,
       'and a full site is still declared full, on that condition and no other');

    /* AND THE BUILDER IS ACTUALLY CALLED. Every assertion above reads the function body, which
       stays exactly as correct as it is now while the summary quietly stops using it. */
    ok(hw.indexOf('orderExtras(t) +') >= 0,
       'and the pasted summary is built from it, not merely near it');

    /* THE LIST RATE IS LABELLED AS ONE on both pages, or the paste contradicts itself: a
       headline of 6.8c over an electricity line worked out at 5.44c. */
    const ck = fs.readFileSync(path.join(REPO_ROOT, 'site', 'checkout.js'), 'utf8');
    for (const [name, src] of [['hardware.js', ex], ['checkout.js', ck]]) {
        ok(src.indexOf(" list (indicative)") >= 0,
           name + ': the undiscounted rate says it is the list rate');
    }
}

console.log('=== the bar says what a prepay actually buys ===');
{
    /* Two claims that are easy to get backwards and expensive if you do. The page used to say
       the ladder "prices each term against that site's rate", which reads as a fixed rate for
       the term — that would be Proton selling years of power at a fixed price against a floating
       input cost. */
    const page = fs.readFileSync(path.join(REPO_ROOT, 'site', 'hosting.html'), 'utf8');
    const foot = page.slice(page.indexOf('pp-bar-foot'), page.indexOf('</div>',
                            page.indexOf('pp-bar-foot')));

    ok(/fixes the discount, not the rate/i.test(foot),
       'it says the discount is what is fixed');
    ok(/indexed to gas and CPI/i.test(foot), 'and that the rate floats against gas and CPI');
    ok(/electricity only/i.test(foot), 'and that a prepay is electricity only');
    ok(/monthly/i.test(foot), 'and that the rest is billed monthly');

    /* THE OLD CLAIM IS GONE, not merely outnumbered by the new one. */
    ok(page.indexOf('prices each term against that site') < 0,
       'and the line that implied a fixed rate is gone');

    /* No superlatives. "Best value" sat on the seven-year tier and is exactly the register this
       copy is not written in. */
    ['best value', 'unbeatable', 'lowest ever', 'guaranteed savings'].forEach(w => {
        ok(page.toLowerCase().indexOf(w) < 0, 'no "' + w + '" anywhere on the page');
    });
}

console.log('\n=== the bar is built from the ladder, not from positions in it ===');
{
    const page = fs.readFileSync(path.join(REPO_ROOT, 'site', 'hosting.html'), 'utf8');
    const bar = page.slice(page.indexOf('prepaybar:begin'), page.indexOf('prepaybar:end'));

    Prepay.all().forEach(t => {
        ok(bar.indexOf(Prepay.pctLabel(t) + ' off') >= 0, t.id + ': its discount is on the bar');
        ok(bar.indexOf(t.months + ' months prepaid') >= 0, t.id + ': quoted in months');
    });

    /* THE RATES ARE NOT. Five sites have five of them and the bar sits above all five; printing
       one here would be printing the wrong one four times out of five. */
    ok(bar.indexOf('kWh') < 0, 'and no rate, because the bar sits above five different ones');
    ok(!/[0-9]+[.][0-9]+c/.test(bar), 'nor a cents figure of any kind');

    /* THE HIGHLIGHT IS ON THE FEATURED TIER AND ON NOTHING ELSE. */
    eq((bar.match(/pp-seg--best/g) || []).length, 1, 'exactly one segment is highlighted');
    const seg = bar.slice(bar.indexOf('pp-seg--best'));
    const featured = Prepay.all().filter(t => t.featured)[0];
    ok(seg.indexOf(Prepay.pctLabel(featured) + ' off') >= 0,
       'and it is the one the ladder marks featured');

    /* Widths are proportional to the discount, so the shape reads before the numbers do. */
    const flexes = (bar.match(/flex:([0-9.]+)/g) || []).map(m => parseFloat(m.slice(5)));
    eq(flexes.length, Prepay.all().length, 'every segment is widthed');
    for (let i = 1; i < flexes.length; i++) {
        ok(flexes[i] > flexes[i - 1], 'segment ' + i + ' is wider than the one before it');
    }
}

console.log('\n=== no renderer decides the highlight from a duration ===');
{
    /* hardware.js tested `t.years >= 7`, so dropping the seven-year tier would have left the
       hardware ladder with nothing highlighted while the hosting bar highlighted its last
       segment. Neither renderer may infer a commercial choice from a number of years again. */
    const hw = fs.readFileSync(path.join(REPO_ROOT, 'site', 'hardware.js'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ');
    const gen = fs.readFileSync(path.join(REPO_ROOT, 'site', 'tools', 'build-facilities.js'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ');

    ok(hw.indexOf('t.featured') >= 0, 'hardware.js reads the flag');
    ok(!/years\s*>=?\s*[0-9]/.test(hw), 'and infers nothing from a number of years');
    ok(gen.indexOf('t.featured') >= 0, 'the bar generator reads the flag');
    ok(gen.indexOf('terms.length - 1') < 0, 'and not the last position in the array');
}

console.log('\n=== the old ladder is gone everywhere it was named ===');
{
    /* An id left behind in one file is an order that validates on one page and is refused on the
       next. The Worker's copy is generated, so this also proves the generator was re-run. */
    const cat = fs.readFileSync(path.join(REPO_ROOT, 'worker-orders', 'catalogue.js'), 'utf8');
    eq(cat.indexOf('export const PREPAY_TERMS = ' +
       JSON.stringify(Prepay.all().map(t => t.id)) + ';') >= 0, true,
       'the Worker validates against exactly the ladder the site offers');

    for (const rel of [['site', 'prepay.js'], ['site', 'hardware.js'], ['site', 'checkout.js'],
                       ['site', 'hosting.html'], ['worker-orders', 'catalogue.js']]) {
        const src = fs.readFileSync(path.join(REPO_ROOT, ...rel), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, ' ');
        ['\'7y\'', '\"7y\"', '\'3y\'', '\"3y\"', '\'1y\'', '\"1y\"'].forEach(id => {
            ok(src.indexOf(id) < 0, rel.join('/') + ': no ' + id + ' left');
        });
    }
}

console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
console.log('  facility-suite: ALL OK');
