#!/usr/bin/env node
/* Stamps every page's asset URLs with a hash of the assets themselves.
 *
 * WHY THIS EXISTS. A browser told that ./styles.css has not changed will not ask for it again, so
 * a deploy can succeed, the server can hold the right bytes, every test can pass, and the person
 * looking at the page still sees the old one. There is nothing to debug because nothing is broken.
 *
 * That is not hypothetical and it is not rare. It happened twice on this project: once on the
 * portal, where a hand-kept `?v=338` was not bumped after a restyle, and again on the marketing
 * site, where a whole new pricing section was invisible because the page and its stylesheet were
 * both cached and neither carried a version at all. Both times the report was "nothing changed",
 * and both times that was literally true of what the browser was showing.
 *
 * So the number is DERIVED, never remembered: the first 8 hex of a SHA-256 over the local CSS and
 * JS a page actually loads. It changes when, and only when, something a browser would need to
 * refetch has changed.
 *
 * ONE HASH PER AREA, not per file. A per-file hash is theoretically tidier and practically worse:
 * it makes every page a different set of URLs, and a shared stylesheet edited once would need
 * every page rewritten anyway. An area is the unit that ships together.
 *
 * RUN THIS LAST. build-diagram.js emits <script> tags of its own, unstamped, so anything that
 * rewrites a page has to happen before the stamping does. A full generator pass ending here is
 * stable; ending anywhere else leaves unstamped tags on the page.
 *
 *     node tools/build-asset-stamp.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');

/* The areas that get stamped, and what a page in each is allowed to reference.
 *
 * The internal operator app at the repo root is deliberately NOT here. It keeps its own hand-kept
 * ?v= and is a separate deployment concern; folding it in would mean rewriting seventeen pages
 * nobody asked about. */
const AREAS = [
    { name: 'portal', dir: 'portal' },
    { name: 'site', dir: 'site' }
];

/* Local assets only: a CDN URL is somebody else's cache policy and a query string on it would be
   sent to their server. Matches ./x.js and ../x.css, stamped or not. */
const REF = /(?:src|href)="((?:\.\/|\.\.\/)[^"?]+\.(?:js|css))(?:\?v=[0-9a-f]+)?"/g;

function pagesOf(dir) {
    return fs.readdirSync(path.join(ROOT, dir))
        .filter((f) => /\.html$/.test(f) && !f.startsWith('_'))
        .sort();
}

function assetsOf(area) {
    const found = new Set();
    for (const page of pagesOf(area.dir)) {
        const src = fs.readFileSync(path.join(ROOT, area.dir, page), 'utf8');
        let m;
        REF.lastIndex = 0;
        while ((m = REF.exec(src))) found.add(m[1]);
    }
    return [...found].sort();
}

/* What the stamp SHOULD be. Split out from write() so a test can ask without writing anything:
   a checker that regenerates in order to check would repair a stale stamp and report success,
   which is the one outcome worse than not checking at all. */
function expected(area) {
    const assets = assetsOf(area);
    const h = crypto.createHash('sha256');
    let hashed = 0;
    for (const rel of assets) {
        const abs = path.join(ROOT, area.dir, rel);
        if (!fs.existsSync(abs)) continue;      // not in the repo; nothing to hash
        h.update(rel);                          // a rename is a change
        /* LINE ENDINGS NORMALISED BEFORE HASHING, and this is not cosmetic.
           This hashed raw bytes, so the stamp depended on the line endings of whoever ran it.
           With core.autocrlf=true on Windows the working copy is CRLF and the repository is
           LF, so every stamp committed from a Windows machine was one that no Linux checkout
           could ever reproduce — including CI, which failed the deploy with a hash mismatch
           and no other symptom.

           The stamp exists to change when the CONTENT changes. CRLF against LF is not a
           content change for that purpose, and the bytes actually served come from whatever
           the deploy checks out, not from a contributor's disk. Normalising makes the stamp
           the same everywhere and still moves whenever the file really does. */
        h.update(fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n'));
        hashed++;
    }
    return { stamp: h.digest('hex').slice(0, 8), hashed, assets };
}

/* Every stamp actually present, so a test can see a page that was missed as well as one that is
   out of date. An unstamped local asset is reported as the empty string rather than ignored. */
function current(area) {
    const seen = new Set();
    for (const page of pagesOf(area.dir)) {
        const src = fs.readFileSync(path.join(ROOT, area.dir, page), 'utf8');
        let m;
        REF.lastIndex = 0;
        while ((m = REF.exec(src))) {
            const whole = m[0];
            const at = whole.indexOf('?v=');
            seen.add(at < 0 ? '' : whole.slice(at + 3, whole.length - 1));
        }
    }
    return [...seen];
}

function write(area) {
    const { stamp, hashed } = expected(area);
    let changed = 0;
    for (const page of pagesOf(area.dir)) {
        const p = path.join(ROOT, area.dir, page);
        const before = fs.readFileSync(p, 'utf8');
        /* Rewrites a stamp that is there and ADDS one that is not. The portal's version of this
           deliberately only restamped, on the grounds that adding a stamp is a decision rather
           than a search and replace — and it was, but the decision has now been taken: an
           unstamped local asset is a page that can go stale invisibly. */
        const after = before.replace(REF, (whole, rel) =>
            whole.slice(0, whole.indexOf('"') + 1) + rel + '?v=' + stamp + '"');
        if (after !== before) { fs.writeFileSync(p, after); changed++; }
    }
    return { stamp, hashed, changed, pages: pagesOf(area.dir).length };
}

/* Runs when invoked, importable when required — and the guard is load-bearing, not tidiness.
   Without it, a test that requires this to ASK what the stamp should be would rewrite every page
   as a side effect of the question, which is precisely the "repairs it in order to check it"
   failure the split between expected() and write() exists to avoid. */
if (require.main === module) {
    for (const area of AREAS) {
        const r = write(area);
        console.log(`${area.name}: ${r.hashed} assets over ${r.pages} pages -> ?v=${r.stamp}` +
                    ` (${r.changed ? r.changed + ' page(s) rewritten' : 'unchanged'})`);
    }
}

module.exports = { AREAS, expected, current, pagesOf };
