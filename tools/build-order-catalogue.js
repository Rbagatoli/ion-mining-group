/* Writes the order Worker's copy of the catalogue from the site's own tables.

   The Worker has to price an order WITHOUT trusting the browser, so it needs its
   own copy of what a machine is and what it costs. Two copies of a price is
   exactly the kind of thing that drifts, so this is generated rather than
   hand-kept, and orders-suite.js fails if the two ever disagree.

   Generated rather than byte-copied — the pattern calc-engine.js uses — because
   the site's files are browser scripts that assign a global, and a Worker is an
   ES module. Copying the bytes would not run; copying the numbers does. The test
   compares the numbers, which is the thing that matters anyway.

       node tools/build-order-catalogue.js
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = path.join(ROOT, 'site');

/* Sources and destination are overridable so the suite can drive this against
   fixtures. Every machine currently has a price, which means the "no price on
   file" branch below is unreachable from the real tables — and an unreachable
   branch is one that passes every test while being wrong. The fixture path is
   how it gets exercised.

       node tools/build-order-catalogue.js [minerDb] [priceList] [out]
*/
const DB_PATH = process.argv[2] || path.join(SITE, 'miner-db.js');
const PRICE_PATH = process.argv[3] || path.join(SITE, 'price-list.js');
/* Not overridable: there is one facility list and the Worker must not be pointed at
   a different one, because this is what decides where a paid-for pallet is sent. */
const Facilities = require(path.join(SITE, 'facilities.js'));
const Prepay = require(path.join(SITE, 'prepay.js'));
const OUT = process.argv[4] || path.join(ROOT, 'worker-orders', 'catalogue.js');

const MinerDB = require(path.resolve(DB_PATH));
const PriceList = require(path.resolve(PRICE_PATH));

const models = MinerDB.getAll();
if (!models.length) { console.error('miner-db.js returned nothing'); process.exit(1); }
if (!PriceList.ASOF) { console.error('price-list.js has no ASOF'); process.exit(1); }
if (typeof PriceList.DEPOSIT_RATE !== 'number') {
    console.error('price-list.js has no DEPOSIT_RATE'); process.exit(1);
}

/* Sorted by model name, not by efficiency: this is a lookup table, and a stable
   alphabetical order means a price change produces a one-line diff instead of a
   reshuffle. */
const rows = models.slice().sort((a, b) => a.model < b.model ? -1 : a.model > b.model ? 1 : 0);

let unpriced = 0;
const entries = rows.map(m => {
    const usd = PriceList.priceFor(m.model);
    if (usd === null) unpriced++;
    return '    ' + JSON.stringify(m.model) + ': ' +
        '{ hashrate: ' + m.hashrate +
        ', power: ' + m.power +
        ', efficiency: ' + m.efficiency +
        /* null, never 0 — a machine with no price on file has an unknown line
           total, and zero would let it be ordered for nothing. */
        ', usd: ' + (usd === null ? 'null' : usd) + ' }';
});

const out = [
    '/* GENERATED FILE — DO NOT EDIT.',
    '',
    '   Source: site/miner-db.js (specs) and site/price-list.js (prices, ASOF,',
    '   DEPOSIT_RATE). Regenerate with:',
    '',
    '       node tools/build-order-catalogue.js',
    '',
    '   This is the order Worker\'s ONLY source of prices. It must never read a',
    '   figure the browser sent: the browser computes totals for display, and a',
    '   display total is a number the customer controls. */',
    '',
    'export const ASOF = ' + JSON.stringify(PriceList.ASOF) + ';',
    '',
    '/* A commercial term, and still unconfirmed — see site/price-list.js. */',
    'export const DEPOSIT_RATE = ' + PriceList.DEPOSIT_RATE + ';',
    '',
    'export const CATALOGUE = {',
    entries.join(',\n'),
    '};',
    '',
    '/* The sites a customer may have machines shipped to.',
    '',
    '   IDS ONLY, and that is the point. The browser names a site; the Worker decides what that',
    '   site IS. Capacity and power price are never sent by the browser and never stored from it',
    '   — same rule as the prices above, for the same reason: a figure the customer can edit is',
    '   not a figure anyone can be held to.',
    '',
    '   A site absent from this list is refused rather than accepted-and-ignored, so a mistyped',
    '   or stale link cannot produce a paid order with no destination on it. */',
    'export const SITE_IDS = ' + JSON.stringify(Facilities.all().map(s => s.id)) + ';',
    '',
    '/* Sites that can actually receive machines today. A customer may hold a link to a site that',
    '   has since filled up or has not been energised yet, and taking money against it would be',
    '   selling space that does not exist. */',
    'export const SITE_OPEN = ' +
        JSON.stringify(Facilities.all().filter(Facilities.acceptsMachines).map(s => s.id)) + ';',
    '',
    '/* Prepaid electricity terms a customer may commit to.',
    '',
    '   IDS ONLY, like the sites above. The browser names a term; the Worker decides what that',
    '   term IS — how many years and what discount. A prepay is a multi-year commitment worth',
    '   five figures, so the one thing a browser must never be able to do is name its own',
    '   discount. */',
    'export const PREPAY_TERMS = ' + JSON.stringify(Prepay.all().map(t => t.id)) + ';',
    ''
].join('\n');

const dir = path.dirname(OUT);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const before = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
if (before === out) {
    console.log(`catalogue.js: ${rows.length} models — unchanged`);
} else {
    fs.writeFileSync(OUT, out);
    console.log(`catalogue.js: ${rows.length} models written` +
                (unpriced ? ` (${unpriced} with no price on file)` : ''));
}
