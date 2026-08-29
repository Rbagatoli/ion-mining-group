/* Guards the share cards.

   A broken card fails in the one place nobody looks: the link preview. The page
   is fine, the tags are there, and the image is a black rectangle or a 404 — and
   you only find out when someone posts the link.

   So this decodes the PNGs rather than trusting that a file exists, and checks
   there is actually a drawing in them. */
/* Repo-relative, so this runs wherever the checkout is. Was an absolute
   c:/Users/rbaga/... path that worked on one machine. */
const REPO_ROOT = require('path').join(__dirname, '..', '..').replace(/\\/g, '/') + '/';
var fs = require('fs');
var zlib = require('zlib');
var S = REPO_ROOT + 'site/';
var fail = 0;
function ok(cond, label, detail) {
    console.log((cond ? '  ok    ' : '  FAIL  ') + label + (cond ? '' : '   ' + detail));
    if (!cond) fail++;
}

var og = fs.readFileSync(S + 'tools/build-og.js', 'utf8');
var seo = fs.readFileSync(S + 'tools/build-seo.js', 'utf8');

/* Both generators must agree on the origin, or a card is advertised at an
   address the sitemap says nothing about. */
function baseOf(src) {
    var i = src.indexOf("const BASE = '");
    return i < 0 ? null : src.slice(i + 14, src.indexOf("'", i + 14));
}
ok(og.indexOf('build-seo.js') >= 0, 'build-og reads the origin from build-seo',
   'it declares its own, which will drift');
var BASE = baseOf(seo);
ok(!!BASE, 'the origin is readable', String(BASE));

/* ---- the images are real ---- */

function decodePNG(file) {
    var b = fs.readFileSync(file);
    if (b[0] !== 0x89 || b.slice(1, 4).toString() !== 'PNG') return null;
    var i = 8, w = 0, h = 0, idat = [], bitDepth = 0, colour = -1;
    while (i < b.length) {
        var len = b.readUInt32BE(i);
        var type = b.slice(i + 4, i + 8).toString();
        if (type === 'IHDR') {
            w = b.readUInt32BE(i + 8); h = b.readUInt32BE(i + 12);
            bitDepth = b[i + 16]; colour = b[i + 17];
        }
        if (type === 'IDAT') idat.push(b.slice(i + 8, i + 8 + len));
        i += 12 + len;
    }
    var raw;
    try { raw = zlib.inflateSync(Buffer.concat(idat)); } catch (e) { return null; }
    return { w: w, h: h, raw: raw, bitDepth: bitDepth, colour: colour, bytes: b.length };
}

var CARDS = ['home.png', 'energy.png', 'hosting.png'];
CARDS.forEach(function (name) {
    var p = S + 'og/' + name;
    if (!fs.existsSync(p)) { ok(false, name + ' exists', 'never generated'); return; }
    var img = decodePNG(p);
    ok(!!img, name + ' is a decodable PNG', 'the encoder produced something unreadable');
    if (!img) return;

    /* The Open Graph size every platform crops toward. */
    ok(img.w === 1200 && img.h === 630, name + ' is 1200x630', img.w + 'x' + img.h);
    ok(img.bitDepth === 8 && img.colour === 2, name + ' is 8-bit truecolour',
       'depth ' + img.bitDepth + ', colour type ' + img.colour);
    /* Under 300 KB keeps previews fast and inside every platform's limit. */
    ok(img.bytes < 300 * 1024, name + ' is small enough to preview quickly',
       (img.bytes / 1024).toFixed(0) + ' KB');

    /* The failure that matters: a card that is a black rectangle. */
    var ink = 0, orange = 0, px = img.w * img.h;
    for (var y = 0; y < img.h; y++) {
        var off = y * (img.w * 3 + 1) + 1;
        for (var x = 0; x < img.w; x++) {
            var r = img.raw[off + x * 3], g = img.raw[off + x * 3 + 1], b = img.raw[off + x * 3 + 2];
            if (r + g + b > 18) ink++;
            if (r > 150 && g > 80 && g < 200 && b < 90) orange++;
        }
    }
    ok(ink / px > 0.02, name + ' actually has a drawing in it',
       'only ' + (ink / px * 100).toFixed(2) + '% of it is not black');
    /* The mark's electron is orange and always drawn, so no orange at all means
       the mark did not render. */
    ok(orange > 200, name + ' carries the brand mark', orange + ' orange pixels');
});

/* ---- every page points at one ---- */

var PAGES = ['index.html', 'energy.html', 'hosting.html', 'calculator.html', 'contact.html'];
PAGES.forEach(function (p) {
    var h = fs.readFileSync(S + p, 'utf8');
    var i = h.indexOf('property="og:image" content="');
    if (i < 0) { ok(false, p + ' declares an og:image', 'no tag'); return; }
    var url = h.slice(i + 29, h.indexOf('"', i + 29));
    ok(url.indexOf(BASE) === 0, p + ' points at the site origin', url);
    var file = url.slice(url.lastIndexOf('/') + 1);
    ok(fs.existsSync(S + 'og/' + file), p + ' points at a card that exists', file + ' is missing');
    /* Without summary_large_image, X renders a thumbnail beside the text
       instead of the full-width card, which is most of the point. */
    ok(h.indexOf('name="twitter:card" content="summary_large_image"') >= 0,
       p + ' asks for the large card', 'it will render as a thumbnail');
    /* Absolute, not relative: a preview crawler has no page context to resolve
       a relative path against. */
    ok(url.indexOf('http') === 0, p + ' uses an absolute image URL', url);
});

/* ---- the card weights match the site ---- */

/* A card lit differently from the page it advertises is a small lie about what
   the visitor is about to see. */
var css = fs.readFileSync(S + 'styles.css', 'utf8');
function alphaOf(sel) {
    var i = css.indexOf(sel);
    if (i < 0) return null;
    var seg = css.slice(i, css.indexOf('}', i));
    var m = /rgba\([^)]*?([\d.]+)\)/.exec(seg);
    return m ? parseFloat(m[1]) : null;
}
/* 'asics' is in this list because it was NOT, and it drifted. The three shell faces were
   bound from the day this check was written; the machines were left out, so when .dg-asics
   moved from 0.10 to 0.22 to stop the racks reading as part of the container, nothing
   required the card to follow. A share card is the drawing fourteen pages advertise
   themselves with, and it would have kept lighting the machines the old way indefinitely. */
[['top', '.dg-top'], ['side', '.dg-side'], ['end', '.dg-end'],
 ['asics', '.dg-asics']].forEach(function (pair) {
    var want = alphaOf(pair[1]);
    var i = og.indexOf(pair[0] + ':    { fill: ');
    if (i < 0) i = og.indexOf(pair[0] + ':   { fill: ');
    if (i < 0) i = og.indexOf(pair[0] + ':  { fill: ');
    var got = i < 0 ? null : parseFloat(og.slice(og.indexOf('fill: ', i) + 6));
    ok(want !== null && got !== null && Math.abs(want - got) < 1e-9,
       'the card lights the ' + pair[0] + ' face like the site does',
       'site ' + want + ', card ' + got);
});

console.log(fail ? '\n  ' + fail + ' FAILED' : '\n  og-suite: ALL OK');
process.exit(fail ? 1 : 0);
