#!/usr/bin/env node
/* Writes the facility picker on hosting.html from site/facilities.js.
 *
 * WHY A GENERATOR AND NOT JUST RENDERING IT IN THE BROWSER. hardware.html and cart.html are pages
 * you arrive at mid-task and they can build their facility block from JS quite happily. The
 * hosting page is the one a stranger lands on from a search result, and the four regions and what
 * they cost are the substance of it — that belongs in the HTML, not behind a script.
 *
 * WHY A GENERATOR AND NOT HAND-WRITTEN HTML. Because then the capacity would exist in two places.
 * price-list.js exists in this repo because exactly that happened to machine costs: the same
 * figure was inherited into two files, nobody reconciled them, and they drifted to 5.8x apart in
 * dollars per terahash. A number a customer pays against cannot have two homes.
 *
 * Idempotent: run it twice, get the same bytes. tests/site/verify.js asserts that.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'hosting.html');
const Facilities = require(path.join(ROOT, 'facilities.js'));
const Prepay = require(path.join(ROOT, 'prepay.js'));

const BEGIN = '<!-- facilities:begin -->';
const END = '<!-- facilities:end -->';
const BAR_BEGIN = '<!-- prepaybar:begin -->';
const BAR_END = '<!-- prepaybar:end -->';

function esc(v) {
    return String(v === undefined || v === null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* The arrow is a <span>, not a second <a>: the whole card is the link, so there is one target per
   card and a keyboard reaches it once rather than twice. */
const ARROW =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M5 12h14M13 6l6 6-6 6"/></svg>';

function card(s) {
    const cap = Facilities.capacityLabel(s);
    const pwr = Facilities.powerLabel(s);
    /* A site that cannot take machines today still gets a card, because "we are building one in
       Nigeria" is information a customer wants — but it must not wear the same call to action as
       one that can. Saying "Start mining" over a site that is not accepting machines is the kind
       of small lie that becomes a refund. */
    const open = Facilities.acceptsMachines(s);

    /* EVERY CARD LEADS TO THE CATALOGUE, including the full ones. A site being at capacity does
       not stop anybody buying machines for it — it means they join that site's waitlist, and
       the catalogue and the checkout both say so before a card is charged.

       What changes is the WORDING. "Start mining" over a site with no free racks is the kind of
       small lie that becomes a refund, so a full site asks for what it can actually give. */
    const cta = open ? 'Start mining' : 'Join the waitlist';
    const href = './hardware.html?site=' + encodeURIComponent(s.id);

    return [
        '        <a class="card card--hover fac' + (open ? '' : ' fac--wait') + '" href="' + href + '">',
        '          <div class="fac-place">' + esc(s.region) + '</div>',
        '          <h3 class="h-card">' + esc(s.name) + '</h3>',
        '          <p class="fac-fuel">' + esc(s.fuel) + '</p>',
        '          <p>' + esc(s.blurb) + '</p>',
        '          <dl class="fac-spec">',
        '            <div class="fac-row"><dt>Capacity</dt><dd>' + esc(cap) + '</dd></div>',
        '            <div class="fac-row"><dt>Power price</dt><dd>' + esc(pwr) + '</dd></div>',
        '            <div class="fac-row"><dt>Status</dt><dd>' + esc(s.status) + '</dd></div>',
        '          </dl>',
        '          <span class="arrow-link fac-go">' + esc(cta) + '\n            ' + ARROW,
        '          </span>',
        '        </a>'
    ].join('\n');
}

/* The discount strip.
 *
 * Each segment is WIDTHED BY ITS DISCOUNT rather than sharing the bar equally, so the shape of
 * the ladder is visible before a single number is read: a short segment for 4%, a long one for
 * 20%. A bar of three equal boxes would be a table with rounded corners.
 *
 * Only the percentages appear. They are the one part of prepaid pricing that is the same at
 * every site, which is exactly why this can sit under a row of five sites at all. */
function prepayBar() {
    const terms = Prepay.all();
    const total = terms.reduce((a, t) => a + t.discount, 0);

    const segs = terms.map((t) => {
        const share = (t.discount / total * 100).toFixed(2);
        /* THE FLAG, NOT THE LAST INDEX. Position in an array is not a commercial decision, and
           reordering the ladder should not silently move the highlight. */
        return [
            '        <div class="pp-seg' + (t.featured ? ' pp-seg--best' : '') +
                '" style="flex:' + share + ' 1 0">',
            '          <span class="pp-seg-off">' + esc(Prepay.pctLabel(t)) + ' off</span>',
            '          <span class="pp-seg-yrs">' + t.months + ' months prepaid</span>',
            '        </div>'
        ].join('\n');
    }).join('\n');

    return [
        '        <div class="pp-bar-lead">Prepay your electricity</div>',
        '        <div class="pp-bar-track">',
        segs,
        '        </div>',
        '        <div class="pp-bar-foot">Prepaying fixes the discount, not the rate. Power is ' +
            'indexed to gas and CPI, and the discount applies to whatever the prevailing rate is ' +
            'when you are billed. Prepay covers electricity only &mdash; hosting, pad and ' +
            'maintenance are billed monthly throughout the term.</div>'
    ].join('\n');
}

function build() {
    let html = fs.readFileSync(PAGE, 'utf8');
    const a = html.indexOf(BEGIN);
    const b = html.indexOf(END);
    if (a < 0 || b < 0 || b < a) {
        console.error('hosting.html: facilities markers missing or out of order');
        process.exit(1);
    }

    const cards = Facilities.all().map(card).join('\n');
    const block = BEGIN + '\n' + cards + '\n      ' + END;

    let next = html.slice(0, a) + block + html.slice(b + END.length);

    /* The bar, in the same pass as the cards. Both come from data files, and writing them
       together means the page can never hold one that was regenerated and one that was not. */
    const ba = next.indexOf(BAR_BEGIN);
    const bb = next.indexOf(BAR_END);
    if (ba < 0 || bb < 0 || bb < ba) {
        console.error('hosting.html: prepay bar markers missing or out of order');
        process.exit(1);
    }
    next = next.slice(0, ba) + BAR_BEGIN + '\n' + prepayBar() + '\n      ' + BAR_END +
           next.slice(bb + BAR_END.length);

    const changed = next !== html;
    if (changed) fs.writeFileSync(PAGE, next);

    const open = Facilities.all().filter(Facilities.acceptsMachines).length;
    console.log('hosting.html: ' + Facilities.all().length + ' facilities — ' +
                (changed ? 'rewritten' : 'unchanged'));
}

build();
