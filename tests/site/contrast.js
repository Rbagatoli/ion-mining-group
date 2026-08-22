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
    while (v.indexOf("var(--") === 0 && guard++ < 8) {
        const name = v.slice(6, v.indexOf(")"));
        const at = css.indexOf("--" + name + ":");
        if (at < 0) return [];
        v = css.slice(at + name.length + 3, css.indexOf(";", at)).trim();
    }
    const out = [];
    let k = v.indexOf("#");
    while (k >= 0) { out.push(v.slice(k, k + 7)); k = v.indexOf("#", k + 7); }
    return out;
}

let pass = true;
function check(name, el, states, size) {
    const bg = resolve(css, el, [], "background-image");
    const grounds = bg ? stopsOf(bg.value) : [];
    if (!grounds.length) { console.log("  " + name + ": could not resolve a background"); pass = false; return; }
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

/* The nav CTA: the one that was wrong, and the smallest instance. */
check("nav CTA", {
    tag: "a", classes: ["btn", "btn--primary", "btn--sm", "nav-cta"],
    ancestors: [{ tag: "div", classes: ["nav-links"] },
                { tag: "div", classes: ["nav-inner"] },
                { tag: "nav", classes: ["nav"] }],
}, STATES, 11);

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
const heroPass = heroWorst >= 3;
console.log(heroPass ? "PASS — the headline is legible lit and unlit"
                     : "FAIL — " + heroWorstName + " at " + heroWorst.toFixed(2) + ":1");
if (!heroPass) process.exitCode = 1;
