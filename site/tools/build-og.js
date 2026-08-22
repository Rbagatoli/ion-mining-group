/* Generates the social share cards and wires them into every page.

       node tools/build-og.js

   Without an og:image, a link to this site posted in Slack, on LinkedIn or in a
   WhatsApp thread renders as a bare line of text. The drawings are the whole
   visual argument this company has, and that is the exact moment they are doing
   nothing.

   Each card IS the drawing — no words baked into the image. The title and
   description come from the og:title and og:description tags every page already
   carries, and every platform renders them beside the image, so burning them
   into the pixels would only repeat them at a size nobody chose. It also means
   no font rasteriser, which is the part that would have made this unreasonable.

   The drawings are taken from the same scene modules the browser runs, at the
   same yaw the static no-JS frame uses, so a card can never show something the
   page does not. */
const fs = require('fs');
const path = require('path');
const { Canvas, parsePath } = require('./raster.js');

const SITE = path.join(__dirname, '..');
const OUT = path.join(SITE, 'og');

/* The Open Graph standard size. LinkedIn, Slack, X and Facebook all crop toward
   the centre of this ratio, so nothing important goes near an edge. */
const W = 1200, H = 630;

const BLACK = [0, 0, 0];
const PLAT = [229, 228, 226];
const BTC = [247, 147, 26];

/* The site's own paint weights, so a card and the page it advertises are lit
   the same way. Kept in step with styles.css by og-suite.js. */
const WEIGHT = {
    ground: { fill: 0.04, stroke: 0.13 },
    inside: { fill: 0.62, dark: true },
    back:   { stroke: 0.42 },
    asics:  { fill: 0.10, stroke: 0.24 },
    end:    { fill: 0.20 },
    side:   { fill: 0.30 },
    top:    { fill: 0.42 },
    detail: { stroke: 0.72 },
    flame:  { fill: 0.85, btc: true },
};

const CARDS = [
    { file: 'home.png',      scene: '../scene-site.js',    pages: ['index.html'] },
    { file: 'energy.png',    scene: '../scene-pad-now.js', pages: ['energy.html'] },
    { file: 'hosting.png',   scene: '../scene-hosting.js', pages: ['hosting.html'] },
    /* The calculator and contact pages have no drawing of their own. They get
       the whole-mine card: it is what the company builds, which is the honest
       thing to show beside either title. */
    { file: 'home.png',      scene: null, pages: ['calculator.html', 'contact.html', 'hardware.html', 'cart.html', 'pay.html', 'order.html'] },
];

/* ---------- the mark ----------
   The same hydrogen atom as the favicon and the nav, drawn directly rather than
   parsed out of the SVG: three circles is less code than a parser, and it
   cannot drift into something the brand mark is not. */
function drawMark(c, cx, cy, r) {
    c.ring(cx, cy, r * 0.74, r * 0.10, PLAT[0], PLAT[1], PLAT[2], 0.92);
    c.circle(cx, cy, r * 0.20, PLAT[0], PLAT[1], PLAT[2], 0.92);
    c.circle(cx + r * 0.457, cy - r * 0.586, r * 0.164, BTC[0], BTC[1], BTC[2], 1);
}

/* ---------- one card ---------- */

function render(sceneFile) {
    const c = new Canvas(W, H);
    c.fill(BLACK[0], BLACK[1], BLACK[2]);

    if (sceneFile) {
        const scene = require(path.join(__dirname, sceneFile));
        const frame = scene.frame(0, null);
        const vb = scene.VB;

        /* Fit what is actually DRAWN, not the viewBox. The scenes reserve a lot
           of vertical room for callout leaders, and fitting the box left the
           drawing small and sitting low with a dead band across the top. */
        let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
        frame.slots.forEach(slot => {
            scene.LAYERS.forEach(layer => {
                if (!WEIGHT[layer] || !slot[layer]) return;
                parsePath(slot[layer]).forEach(sp => {
                    for (let k = 0; k + 1 < sp.pts.length; k += 2) {
                        if (sp.pts[k] < bx0) bx0 = sp.pts[k];
                        if (sp.pts[k] > bx1) bx1 = sp.pts[k];
                        if (sp.pts[k + 1] < by0) by0 = sp.pts[k + 1];
                        if (sp.pts[k + 1] > by1) by1 = sp.pts[k + 1];
                    }
                });
            });
        });
        if (!isFinite(bx0)) { bx0 = 0; by0 = 0; bx1 = vb.w; by1 = vb.h; }
        const cw = bx1 - bx0, ch = by1 - by0;
        const pad = 84;
        const scale = Math.min((W - pad * 2) / cw, (H - pad * 2) / ch);
        const ox = (W - cw * scale) / 2 - bx0 * scale;
        const oy = (H - ch * scale) / 2 - by0 * scale;
        const map = d => d.replace(/(-?[\d.]+) (-?[\d.]+)/g,
            (m, x, y) => (ox + parseFloat(x) * scale).toFixed(2) + ' ' +
                         (oy + parseFloat(y) * scale).toFixed(2));

        /* Painted in the engine's own layer order, back to front, exactly as the
           browser stacks them. */
        scene.LAYERS.forEach(layer => {
            const w = WEIGHT[layer];
            if (!w) return;
            frame.slots.forEach(slot => {
                const d = slot[layer];
                if (!d) return;
                const col = w.btc ? BTC : (w.dark ? BLACK : PLAT);
                c.drawPath(map(d), {
                    fill: w.fill !== undefined ? col : null,
                    fillAlpha: w.fill,
                    stroke: w.stroke !== undefined ? PLAT : null,
                    strokeAlpha: w.stroke,
                    width: Math.max(0.8, scale * 0.9),
                });
            });
        });
    }

    /* A hairline frame and the mark, so a card that is mostly black still reads
       as a deliberate object rather than a failed load. */
    const m = 34;
    [[m, m, W - m, m], [W - m, m, W - m, H - m],
     [W - m, H - m, m, H - m], [m, H - m, m, m]].forEach(l => {
        c.strokeLine(l[0], l[1], l[2], l[3], 1.5, PLAT[0], PLAT[1], PLAT[2], 0.20);
    });
    /* Sized to read in a Slack preview, which is often a few hundred pixels
       wide — at 40 the mark survived the card and vanished in the thumbnail. */
    drawMark(c, 102, 98, 54);
    return c;
}

/* ---------- meta tags ---------- */

const BASE = (function () {
    const seo = fs.readFileSync(path.join(__dirname, 'build-seo.js'), 'utf8');
    const i = seo.indexOf("const BASE = '");
    if (i < 0) { console.error('build-seo.js no longer declares BASE'); process.exit(1); }
    return seo.slice(i + 14, seo.indexOf("'", i + 14));
})();

const OG_START = '<!-- ===== SHARE CARD ===== -->';
const OG_END = '<!-- ===== /SHARE CARD ===== -->';

function injectOg(html, file, card) {
    const tags = [
        OG_START,
        '<meta property="og:image" content="' + BASE + '/og/' + card + '">',
        '<meta property="og:image:width" content="' + W + '">',
        '<meta property="og:image:height" content="' + H + '">',
        /* summary_large_image is what gets the full-width card rather than a
           thumbnail beside the text. */
        '<meta name="twitter:card" content="summary_large_image">',
        '<meta name="twitter:image" content="' + BASE + '/og/' + card + '">',
        OG_END,
    ].join('\n');

    const a = html.indexOf(OG_START);
    if (a >= 0) {
        const b = html.indexOf(OG_END, a);
        if (b < 0) { console.error(file + ': share-card end marker missing'); process.exit(1); }
        return html.slice(0, a) + tags + html.slice(b + OG_END.length);
    }
    const head = html.indexOf('</head>');
    if (head < 0) { console.error(file + ': no </head>'); process.exit(1); }
    return html.slice(0, head) + tags + '\n' + html.slice(head);
}

/* ---------- run ---------- */

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

const drawn = {};
CARDS.forEach(card => {
    if (!drawn[card.file]) {
        if (card.scene) {
            const png = render(card.scene).toPNG();
            fs.writeFileSync(path.join(OUT, card.file), png);
            console.log('og/' + card.file + ': ' + (png.length / 1024).toFixed(0) + ' KB');
        }
        drawn[card.file] = true;
    }
    card.pages.forEach(p => {
        const file = path.join(SITE, p);
        const before = fs.readFileSync(file, 'utf8');
        const after = injectOg(before, p, card.file);
        if (after !== before) fs.writeFileSync(file, after);
        console.log('  ' + p + ' -> og/' + card.file + (after === before ? ' (unchanged)' : ''));
    });
});
