/* WCAG contrast of what the buttons ACTUALLY render, not what a rule declares.

   Those are different things, and the difference shipped: the nav CTA is an
   <a> inside .nav-links, so ".nav-links a" (0,1,1) outranks ".btn--primary"
   (0,1,0). The button rendered --plat-400 on orange at 1.04:1 while this file
   measured .btn--primary's declared black and reported 6.55:1. It passed twice.

   So every colour below is resolved through a small cascade, and hover and
   focus are checked too — the old hover state was WHITE on orange. */
/* Repo-relative, so this runs wherever the checkout is. Was an absolute
   c:/Users/rbaga/... path that worked on one machine. */
const REPO_ROOT = require('path').join(__dirname, '..', '..').replace(/\\/g, '/') + '/';
const fs = require("fs");
const { resolve } = require('./cascade.js');
const css = fs.readFileSync(REPO_ROOT + 'site/styles.css', 'utf8');

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lum = rgb => {
    const c = rgb.map(v => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
    const [x, y] = [lum(hex(a)), lum(hex(b))].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
};

/* Follow var() through :root, and pull every stop out of a gradient. */
function stopsOf(value) {
    let v = value.trim(), guard = 0;
    /* SUBSTITUTE var() WHEREVER IT APPEARS, not only when it is the whole
       value. The first version only unwrapped a leading var(), which was enough
       while every ground on the site was either a bare token or a gradient of
       literals — and silently found nothing the moment a rule wrapped a token
       inside a gradient, as .btn--ghost does:

           linear-gradient(var(--panel-solid), var(--panel-solid)) padding-box

       "Found nothing" is reported as "could not resolve a background", which is
       at least loud. A version that guessed would not have been. */
    while (v.indexOf("var(--") >= 0 && guard++ < 16) {
        const at = v.indexOf("var(--");
        const close = v.indexOf(")", at);
        if (close < 0) break;
        const name = v.slice(at + 4, close).trim();
        const decl = css.indexOf(name + ":");
        if (decl < 0) return [];
        const val = css.slice(decl + name.length + 1, css.indexOf(";", decl)).trim();
        v = v.slice(0, at) + val + v.slice(close + 1);
    }
    const out = [];
    let k = v.indexOf("#");
    while (k >= 0) { out.push(v.slice(k, k + 7)); k = v.indexOf("#", k + 7); }

    /* rgb()/rgba() too. A translucent ground is composited over PAGE_GROUND
       rather than treated as opaque — rgba(0,0,0,0.5) on this site is not a
       mid grey, it is black over black, and calling it #808080 would invent a
       contrast problem that does not exist. */
    const rgbRe = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)\s*(?:[,/]\s*([\d.]+))?\s*\)/g;
    let m;
    while ((m = rgbRe.exec(v))) {
        const a = m[4] === undefined ? 1 : parseFloat(m[4]);
        const base = hex(PAGE_GROUND);
        const mix = [+m[1], +m[2], +m[3]].map(function (c, i) {
            return Math.round(c * a + base[i] * (1 - a));
        });
        out.push("#" + mix.map(function (c) {
            return ("0" + c.toString(16)).slice(-2);
        }).join(""));
    }
    return out;
}

/* Everything on this site sits on black, and a translucent ground has to be
   composited over something to mean anything. */
const PAGE_GROUND = "#000000";

let pass = true;
function check(name, el, states, size) {
    /* background-image first, then the `background` shorthand. Most grounds
       here are declared as background-image; .btn--ghost uses the shorthand, and
       a checker that only knew the long form reported it as unresolvable rather
       than checking it. */
    const bg = resolve(css, el, [], "background-image") || resolve(css, el, [], "background");
    /* THE TEXT SITS ON THE PADDING BOX. A two-layer background painting one
       layer to padding-box and another to border-box is the standard way to
       draw a gradient border, and the border-box layer is a 1px frame nothing
       is written on. Measuring against it compared white type to the light
       metal of a hairline and failed a button rendering at about 18:1. */
    let bgValue = bg ? bg.value : "";
    const padAt = bgValue.indexOf("padding-box");
    if (padAt >= 0) bgValue = bgValue.slice(0, padAt);
    let grounds = bg ? stopsOf(bgValue) : [];

    /* IF THE ELEMENT HAS NO GROUND OF ITS OWN, WALK UP. Text inherits the ground of whatever
       is painted behind it, and most text on this site is a <p> or a <dd> with no background
       at all — which this checker reported as "could not resolve" and skipped. That made it
       a button checker wearing a contrast checker's name: every plain paragraph on the site
       was outside it, which is where a 3.02:1 placeholder was able to ship.

       Nearest ancestor first, then the page itself. body is --black on every page here, so a
       run of transparent ancestors correctly ends up measured against black rather than
       abandoned. */
    if (!grounds.length && el.ancestors) {
        for (let i = 0; i < el.ancestors.length && !grounds.length; i++) {
            const up = Object.assign({}, el.ancestors[i], { ancestors: el.ancestors.slice(i + 1) });
            const upBg = resolve(css, up, [], "background-image") || resolve(css, up, [], "background");
            if (!upBg) continue;
            let v = upBg.value;
            const pb = v.indexOf("padding-box");
            if (pb >= 0) v = v.slice(0, pb);
            grounds = stopsOf(v);
        }
    }
    if (!grounds.length) grounds = [PAGE_GROUND];
    console.log("");
    console.log(name + "  (" + size + "px, so the bar is 4.5:1)");
    states.forEach(st => {
        const c = resolve(css, el, st.on, "color");
        const fg = c ? stopsOf(c.value)[0] : null;
        if (!fg) { console.log("    " + st.name.padEnd(8) + " no colour resolves"); pass = false; return; }
        let lo = 99;
        grounds.forEach(g => { lo = Math.min(lo, ratio(fg, g)); });
        const ok = lo >= 4.5;
        if (!ok) pass = false;
        console.log("    " + st.name.padEnd(8) + fg + "  " + lo.toFixed(2) + ":1  " +
                    (ok ? "" : "<-- BELOW AA  ") + "won by \"" + c.sel + "\"");
    });
}

const STATES = [{ name: "rest", on: [] }, { name: "hover", on: ["hover"] },
                { name: "focus", on: ["focus-visible"] }];

/* The facility cards. Six new text colours arrived on hosting.html at once, and this file
   only checks what it is told about — so the first version shipped a [PLACEHOLDER] set in
   --plat-600 at 3.02:1, which is below AA and was found by hand rather than here. Enrolled so
   the next one is not.

   The placeholder is checked as body text deliberately. It is a word in a sentence a customer
   reads to decide whether to trust the figures on the page, not a decorative mark. */
check("facility card: region label", {
    tag: "div", classes: ["fac-place"],
    ancestors: [{ tag: "a", classes: ["card", "card--hover", "fac"] }],
}, [{ name: "rest", on: [] }], 10.5);

check("facility card: energy source", {
    tag: "p", classes: ["fac-fuel"],
    ancestors: [{ tag: "a", classes: ["card", "card--hover", "fac"] }],
}, [{ name: "rest", on: [] }], 13);

check("facility card: spec label", {
    tag: "dt", classes: [],
    ancestors: [{ tag: "div", classes: ["fac-row"] },
                { tag: "dl", classes: ["fac-spec"] },
                { tag: "a", classes: ["card", "card--hover", "fac"] }],
}, [{ name: "rest", on: [] }], 12.5);

check("facility card: the unfilled figure", {
    tag: "dd", classes: [],
    ancestors: [{ tag: "div", classes: ["fac-row"] },
                { tag: "dl", classes: ["fac-spec"] },
                { tag: "a", classes: ["card", "card--hover", "fac"] }],
}, [{ name: "rest", on: [] }], 11.5);

check("the placeholder note", {
    tag: "p", classes: ["fac-note"],
    ancestors: [],          // sits directly in .wrap, on the page ground
}, [{ name: "rest", on: [] }], 12.5);

check("the word PLACEHOLDER itself", {
    tag: "span", classes: ["fac-ph"],
    ancestors: [{ tag: "p", classes: ["fac-note"] }],
}, [{ name: "rest", on: [] }], 11.5);

/* The nav CTA: the one that was wrong, and the smallest instance. */
check("nav CTA", {
    tag: "a", classes: ["btn", "btn--primary", "btn--sm", "nav-cta"],
    ancestors: [{ tag: "div", classes: ["nav-links"] },
                { tag: "div", classes: ["nav-inner"] },
                { tag: "nav", classes: ["nav"] }],
}, STATES, 11);

/* The producer portal, a ghost button sitting in the same nav. A different
   ground (panel-solid, not the metal) and a different colour token, in the one
   place on the site where .nav-links a is waiting to take both. */
check("nav portal button", {
    tag: "a", classes: ["btn", "btn--ghost", "btn--sm", "nav-signin"],
    ancestors: [{ tag: "div", classes: ["nav-links"] },
                { tag: "div", classes: ["nav-inner"] },
                { tag: "nav", classes: ["nav"] }],
}, STATES, 13.5);

/* The same button in the page body, where no nav rule reaches it. */
check("body primary button", {
    tag: "a", classes: ["btn", "btn--primary"],
    ancestors: [{ tag: "div", classes: ["btn-row"] }, { tag: "div", classes: ["wrap"] }],
}, STATES, 11.5);

/* The toggle segment that carries the same metal. */
check("diagram toggle", {
    tag: "span", classes: ["dg-toggle-on"],
    ancestors: [{ tag: "div", classes: ["dg-toggle"] }],
}, [{ name: "rest", on: [] }], 10.5);

console.log("");
console.log(pass ? "PASS — every button state is legible where it renders"
                 : "FAIL — a button state is unreadable");
if (!pass) process.exitCode = 1;

/* ---- The hero headline ----
   Display type, 32px and up at weight 600, so the WCAG bar is 3:1 rather than
   4.5:1. It sits on the page ground, and the ground is not black: body::before
   stacks five translucent light-field layers over it, so the honest test is
   the brightest that ground ever gets.

   CHROME TEXT IS MEASURED DIFFERENTLY FROM A LABEL ON A GRADIENT. For the
   buttons above, the text is one flat colour and the gradient is behind it, so
   the worst background stop is genuinely the worst case. Here the gradient IS
   the letterform: its dark stops are shading inside a glyph, not the colour of
   the text. The mean across the ramp is what the eye integrates, so that is
   what is held to the bar — with the worst stop reported alongside, because a
   ramp that dips too far still reads as muddy. */

function heroVar(name) {
    const i = css.indexOf("--" + name + ":");
    if (i < 0) return null;
    const decl = css.slice(i, css.indexOf(";", i));
    const out = [];
    let k = decl.indexOf("#");
    while (k >= 0) { out.push(decl.slice(k, k + 7)); k = decl.indexOf("#", k + 7); }
    return out;
}
function overOn(base, layer) {
    return base.map(function (c, i) { return layer[3] * layer[i] + (1 - layer[3]) * c; });
}
function hexOf(rgb) {
    return "#" + rgb.map(function (c) {
        return Math.round(c).toString(16).padStart(2, "0");
    }).join("");
}

const FIELD2 = [[246,245,243,0.095],[246,245,243,0.082],
                [229,228,226,0.026],[229,228,226,0.018],[229,228,226,0.018]];
let g2 = [0,0,0];
FIELD2.forEach(function (L) { g2 = overOn(g2, L); });
const GROUND = hexOf(g2);

/* The size the headline actually renders at, at its smallest. */
const cl2 = css.match(/\.h-backfeed \{\s*font-size: clamp\(([\d.]+)px/);
const minPx = cl2 ? +cl2[1] : 0;

console.log("");
console.log("hero headline, on the brightest the light field gets (" + GROUND + ")");
console.log("  renders at " + minPx + "px and up, weight 600 — large text, so the bar is 3:1");
console.log("");

let heroWorst = 99, heroWorstName = "";
function heroRow(label, stops, useMean) {
    const rs = stops.map(function (h) { return ratio(h, GROUND); });
    const lo = Math.min.apply(null, rs);
    const mean = rs.reduce(function (a, b) { return a + b; }, 0) / rs.length;
    const held = useMean ? mean : lo;
    if (held < heroWorst) { heroWorst = held; heroWorstName = label.trim(); }
    console.log("  " + label + " " + (useMean
        ? "mean " + mean.toFixed(2) + ":1 across " + stops.length + " stops" +
          "   (darkest stop " + stops[rs.indexOf(lo)] + " at " + lo.toFixed(2) + ":1)"
        : stops[0] + "   " + lo.toFixed(2) + ":1") +
        (held < 3 ? "   <-- BELOW AA for large text" : ""));
}

heroRow("unlit    ", heroVar("plat-500"), false);
heroRow("lit      ", heroVar("metal-plat"), true);
heroRow("the edge ", heroVar("btc-300"), false);


console.log("");
console.log("");
console.log("nav CTA shape  (must not wrap, must not be squeezed)");

/* ---------- the CTA's SHAPE ----------

   The reported fault was "too thick and the text isn't centred", and it was one
   cause with two faces: the label was wrapping onto two lines. "Start a
   conversation" is the longest CTA on the site; neither .btn nor .nav-links a
   set white-space, so the button grew to 59px — two line boxes — and text in a
   two-line centred flex box is not centred, because the second line is a
   different width from the first.

   Then, once it could not wrap, it was shrunk instead: .nav-links is a flex row
   and every item shrinks by default, and .btn sets overflow:hidden, so the
   label was clipped at both ends. Clipped-but-symmetric is what "not centred"
   looks like when the box is too small for the text.

   IT HID BEHIND A FONT SWAP. With the fallback face the label fits on one line
   and every measurement says it is fine; the wrap only appears once the real
   face loads. Anything checking this in a browser has to wait on
   document.fonts.ready, and a screenshot taken too early will show it healthy.

   These three are the invariants. Font-size is deliberately NOT one of them:
   the button keeps the nav's 13.5px on purpose, and an earlier version of this
   check asserted .btn--sm's 11px and would now fail a correct rule. */

function baseOf(source) {
    /* cascade.js flattens at-rules, so a narrow-screen override would be
       reported as winning at every width. Strip @media and ask the desktop
       question. */
    let out = '', i = 0;
    while (i < source.length) {
        const at = source.indexOf('@media', i);
        if (at < 0) { out += source.slice(i); break; }
        out += source.slice(i, at);
        let j = source.indexOf('{', at), depth = 0;
        if (j < 0) break;
        for (; j < source.length; j++) {
            if (source[j] === '{') depth++;
            else if (source[j] === '}' && --depth === 0) { j++; break; }
        }
        i = j;
    }
    return out;
}
const baseCss = baseOf(css);

const CTA = {
    tag: "a", classes: ["btn", "btn--primary", "btn--sm", "nav-cta"],
    ancestors: [{ tag: "div", classes: ["nav-links"] },
                { tag: "div", classes: ["nav-inner"] },
                { tag: "nav", classes: ["nav"] }],
};
const NAVLINK = { tag: "a", classes: [],
                  ancestors: [{ tag: "div", classes: ["nav-links"] }] };

function shows(label, got, want) {
    const good = got === want;
    if (!good) process.exitCode = 1;
    console.log("    " + label.padEnd(34) + (good ? "" : "<-- ") +
                String(got) + (good ? "" : "   want " + want));
}

shows("CTA white-space",
      (resolve(baseCss, CTA, [], "white-space") || {}).value, "nowrap");
shows("CTA flex-shrink",
      (resolve(baseCss, CTA, [], "flex-shrink") || {}).value, "0");
shows("nav links white-space",
      (resolve(baseCss, NAVLINK, [], "white-space") || {}).value, "nowrap");

/* Horizontal padding must stay symmetric. A four-value shorthand is the only
   way it stops being, and that is exactly the edit somebody makes when nudging
   a label they think is off-centre — which would make it genuinely off-centre. */
const pad = (resolve(baseCss, CTA, [], "padding") || {}).value || "";
const parts = pad.trim().split(/\s+/);
const symmetric = parts.length <= 3;
if (!symmetric) process.exitCode = 1;
console.log("    " + "CTA padding is horizontally even".padEnd(34) +
            (symmetric ? "" : "<-- ") + '"' + pad + '"');

console.log("");
const heroPass = heroWorst >= 3;
console.log(heroPass ? "PASS — the headline is legible lit and unlit"
                     : "FAIL — " + heroWorstName + " at " + heroWorst.toFixed(2) + ":1");
if (!heroPass) process.exitCode = 1;
