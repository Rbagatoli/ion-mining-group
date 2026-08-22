/* Checks on the S21 Pro scene, the detail slider, and the shared view.

   Two that would be easy to miss:
     - two diagrams on one page both answered to dg-flow, dg-s0-top and
       dg-zoom-in before the prefix existed. A duplicate id does not throw; it
       silently wires the second diagram's controls to the first one's elements.
     - only ONE linked instance may run the idle clock. If both tick they fight
       over the shared yaw and the turn stutters. */
/* Repo-relative, so this runs wherever the checkout is. Was an absolute
   c:/Users/rbaga/... path that worked on one machine. */
const REPO_ROOT = require('path').join(__dirname, '..', '..').replace(/\\/g, '/') + '/';
const fs = require('fs');
const D = REPO_ROOT + 'site/';
const html = fs.readFileSync(D + 'hosting.html', 'utf8');
const css  = fs.readFileSync(D + 'styles.css', 'utf8');
const js   = fs.readFileSync(D + 'site.js', 'utf8');
const eng  = fs.readFileSync(D + 'diagram-engine.js', 'utf8');
const src  = fs.readFileSync(D + 'scene-asic.js', 'utf8');

const A = require(D + 'scene-asic.js');
const C = require(D + 'scene-hosting.js');
const E = require(D + 'diagram-engine.js');

let fail = 0;
const ok = (cond, label, detail) => {
    console.log((cond ? '  ok   ' : '  FAIL ') + label + (detail ? '   ' + detail : ''));
    if (!cond) fail++;
};

const M = A.MODEL;
console.log(`S21 Pro: ${A.SLOTS} objects, ${A.CALLOUTS.length} callouts, ` +
            `${A.BOARDS.length} boards, ${M.mm.length}x${M.mm.width}x${M.mm.height}mm, ` +
            `${M.mm.fan}mm fans, viewBox ${A.VB.w}x${A.VB.h}`);
console.log('');

/* ---------- 1. it is dimensionally an S21 Pro ---------- */
ok(M.mm.length === 450 && M.mm.width === 219 && M.mm.height === 293,
   'chassis is 450 x 219 x 293 mm, per Bitmain, not the S19-era 400 x 195 x 290',
   `${M.mm.length}x${M.mm.width}x${M.mm.height}`);
const unit = 100;
ok(Math.abs(M.chassis.w - M.mm.length / unit) < 0.001 &&
   Math.abs(M.chassis.d - M.mm.width / unit) < 0.001 &&
   Math.abs(M.chassis.h - M.mm.height / unit) < 0.001,
   'and the drawn box is those millimetres at 100 mm per scene unit',
   `${M.chassis.w} x ${M.chassis.d} x ${M.chassis.h}`);
ok(Math.abs(M.fan.size - M.mm.fan / unit) < 0.001,
   'the fans are drawn at 140 mm, the platform that separates it from the S21',
   M.fan.size + ' units');

/* Four fans, two stacked per end, filling almost the whole end face. */
ok(M.fanY.length === 2, 'two fans stacked at each end');
ok(A.SLOTS === 3, 'body plus two fan modules, so the near module can sort in front');
const stackH = M.fanY[1] - M.fanY[0] + M.fan.size;
ok(Math.abs(stackH - M.fan.size * 2) < 0.01 && stackH < M.chassis.h,
   'the stacked pair fills the end face with only a hairline bezel',
   `${stackH.toFixed(2)} of ${M.chassis.h}`);
ok(A.FANA.out < M.chassis.x - M.chassis.w / 2 && A.FANB.out > M.chassis.x + M.chassis.w / 2,
   'both modules stand proud of the chassis ends, as the real ones do');

/* The supply is integrated, not a brick alongside. */
const inChassis = b => (
    b.x - b.w / 2 >= M.chassis.x - M.chassis.w / 2 - 0.001 &&
    b.x + b.w / 2 <= M.chassis.x + M.chassis.w / 2 + 0.001 &&
    b.z - b.d / 2 >= M.chassis.z - M.chassis.d / 2 - 0.001 &&
    b.z + b.d / 2 <= M.chassis.z + M.chassis.d / 2 + 0.001);
ok(A.regionBoxes('psu').every(inChassis),
   'the supply sits INSIDE the chassis footprint, not beside it');
ok(M.psuW > 0 && M.bayW > M.psuW,
   'it takes a narrow column and the fan bay takes the rest',
   `psu ${M.psuW}, bay ${M.bayW.toFixed(2)} of ${M.chassis.d}`);

/* Boards live in the fan bay, not in the supply column. */
ok(A.BOARDS.length === 3, 'three hashboards');
const bayLo = M.bayZ - M.bayW / 2, bayHi = M.bayZ + M.bayW / 2;
ok(A.BOARDS.every(b => b.z - b.d / 2 >= bayLo - 0.001 && b.z + b.d / 2 <= bayHi + 0.001),
   'all three stand in the bay the fans blow through');
ok(A.BOARDS.every(inChassis), 'and all three are inside the chassis');

/* The key correction: no chip grid. On an assembled machine you see fins. */
ok(A.CHIPS === undefined && src.indexOf('CHIPS') < 0,
   'no chip grid — the boards are under heatsinks and the chips are invisible');
ok(A.CALLOUTS.some(c => /heatsink/i.test(c.title)),
   'and a callout says so');
ok(!A.CALLOUTS.some(c => /\b(195|273|65|91)\b/.test(c.title + " " + c.desc)),
   'no chip count is drawn: the sources conflict and Bitmain publishes none');

/* ---------- 2. the page says what it is ---------- */
ok(/Modelled on an Antminer S21 Pro/.test(html),
   'the page states the machine it is modelled on');
ok(/aria-label="Interactive cutaway of an Antminer S21 Pro/.test(html),
   'and the alt text does too');
ok(/\.dg-note \{/.test(css), 'the note has a style');

/* ---------- 3. the pair still holds together ---------- */
ok(A.VB.w === C.VB.w && A.VB.h === C.VB.h,
   'both views share one viewBox, so the section cannot change height mid-slide');
const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
const dupes = ids.filter((v, i) => ids.indexOf(v) !== i);
ok(dupes.length === 0, 'every element id on hosting.html is unique',
   dupes.length ? [...new Set(dupes)].join(', ') : ids.length + ' ids');
ok(html.includes('id="a-siteDiagram"') && html.includes('id="a-dg-flow"') &&
   html.includes('id="a-dg-zoom-in"'), 'the second view is prefixed throughout');
ok(/var byId = function \(id\) \{ return document\.getElementById\(P \+ id\); \};/.test(eng),
   'the engine resolves every id through the prefix');
ok(!/document\.getElementById\('dg-/.test(eng), 'and no lookup bypasses it');
ok(html.includes('class="dg-wrap dg-wrap--cont"') && html.includes('class="dg-wrap dg-wrap--asic"'),
   'both wrappers exist and are named');
ok(/\.dg-views \{ display: grid; \}/.test(css) &&
   /\.dg-views > \.dg-wrap \{ grid-area: 1 \/ 1;/.test(css),
   'the two views share one grid cell');
ok(js.includes('panes[i].inert = !on'), 'the hidden view leaves the tab order');
/* Keyed to which END the slider is at, not to this page's view names. The
   energy page has a second pair ('now'/'ion'); against the old rule both of
   its lists showed at once below 900px. */
ok(css.indexOf('.dg-views[data-at="lo"] ~ .dg-list:last-of-type') >= 0 &&
   css.indexOf('.dg-views[data-at="hi"] ~ .dg-list:first-of-type') >= 0,
   'below 900px the slider still picks which list you read');

/* ---------- 3b. leaders are scaffolding, not subject ---------- */
ok(css.indexOf('.dg-lead { stroke: var(--line); stroke-width: 0.9;') >= 0,
   'resting leaders are quiet — --line at 0.9, about half the ink they had');
ok(css.indexOf('.dg-lead.is-hot { stroke: var(--btc-300); stroke-width: 1.4; }') >= 0,
   'and the hot leader is untouched, so hovering still snaps to full orange');
{
    // Quietening the rest state has to WIDEN the gap to the hot state, never
    // narrow it — that gap is what makes hovering legible.
    const alpha = n => {
        const i = css.indexOf('--' + n + ':');
        const d = css.slice(i, css.indexOf(';', i));
        return parseFloat(d.slice(d.lastIndexOf(',') + 1));
    };
    const rest = alpha('line') * 0.9, hot = 1.4;
    ok(hot / rest > 8, 'the hot leader stands well clear of the resting ones',
       (hot / rest).toFixed(1) + 'x the ink');
}

/* ---------- 4. the shared view ---------- */
ok(typeof E.sharedLink === 'function', 'the engine hands out named view links');
ok(E.sharedLink('hosting') === E.sharedLink('hosting'), 'the same name gives the same link');
ok(E.sharedLink('hosting') !== E.sharedLink('elsewhere'), 'different names do not collide');
ok(fs.readFileSync(D + 'scene-hosting.js', 'utf8').includes("mountWhenReady({ scene: 'hosting' })"),
   'the container scene mounts by name, so it can serve both pages');
ok(src.includes("mountWhenReady({ scene: 'asic' })"), 'the machine mounts by name too');
// The PAGE says which views move together, via data-link on each wrapper.
const links = [...html.matchAll(/data-link="([a-z]+)"/g)].map(m => m[1]);
ok(links.length === 2 && links[0] === 'hosting' && links[1] === 'hosting',
   'both hosting wrappers are wired to the same link', links.join(', '));
const home = fs.readFileSync(D + "index.html", "utf8");
const homeWraps = (home.match(/class="dg-wrap /g) || []).length;
ok(homeWraps === 1, 'the home page carries ONE drawing, the whole site', homeWraps + ' wrap(s)');
ok(home.indexOf("data-link=") < 0,
   'and no view link, so it cannot be entangled with the hosting pair');
/* ---- the chain ----
   Every drawing carries all three stops, so any one of them is a single click
   from any other. It used to be a two-segment control that only knew about its
   neighbour, which left the wellpad drawing unreachable from either of the
   others and with no way back.

   Checked as a matrix rather than by spot-reading one page: for each of the
   three, exactly one segment names where you are and the other two link to the
   pages you are not on. A missing or duplicated stop shows up immediately. */
const CHAIN_PAGES = [
    { file: 'index.html',   at: 'Our mine',    href: './index.html#inside' },
    { file: 'hosting.html', at: 'One container', href: './hosting.html#inside-container' },
    { file: 'energy.html',  at: 'Your site',   href: './energy.html#the-pad' },
];
CHAIN_PAGES.forEach(page => {
    const src = fs.readFileSync(D + page.file, 'utf8');
    const bar = src.slice(src.indexOf('<div class="dg-toggle'),
                          src.indexOf('</div>', src.indexOf('<div class="dg-toggle')));
    const here = [...bar.matchAll(/class="dg-toggle-on" aria-current="true">([^<]*)/g)].map(m => m[1].trim());
    const away = [...bar.matchAll(/class="dg-toggle-to[^"]*" href="([^"]*)"/g)].map(m => m[1]);
    ok(here.length === 1 && here[0] === page.at,
       '  ' + page.file + ': one segment names where you are',
       here.join(', ') || 'none');
    ok(away.length === 2, '  ' + page.file + ': and two link away', away.join(', '));
    ok(away.indexOf(page.href) < 0,
       '  ' + page.file + ': none of them links back to the page you are on');
});

/* Every stop the chain offers has to exist, or a segment lands on a blank page
   top. Collected from the pages themselves, so a renamed anchor is caught. */
const allHrefs = new Set();
CHAIN_PAGES.forEach(p => {
    const src = fs.readFileSync(D + p.file, 'utf8');
    [...src.matchAll(/class="dg-toggle-to[^"]*" href="\.\/([a-z]+\.html)#([a-z-]+)"/g)]
        .forEach(m => allHrefs.add(m[1] + '#' + m[2]));
});
allHrefs.forEach(h => {
    const [file, id] = h.split('#');
    ok(fs.readFileSync(D + file, 'utf8').indexOf('id="' + id + '"') >= 0,
       '  ' + h + ' is a real anchor');
});

/* The arrow travels the way the reader does. A stop earlier in the chain leads
   with a back arrow; a later one trails a forward arrow. */
const homeBar = fs.readFileSync(D + 'index.html', 'utf8');
const bar0 = homeBar.slice(homeBar.indexOf('<div class="dg-toggle'),
                           homeBar.indexOf('</div>', homeBar.indexOf('<div class="dg-toggle')));
ok(bar0.indexOf('dg-toggle-to--back" href="./energy.html#the-pad"') >= 0,
   'the partner site sits upstream of our mine, so the home page points back to it');
ok(bar0.indexOf('<a class="dg-toggle-to" href="./hosting.html#inside-container">') >= 0,
   'and forward to the container inside it');

/* "Site" used to name two different drawings at once — the home page's eyebrow
   said "Inside a site" while the energy page's said "Your site". The labels are
   by ownership now, so the word belongs to exactly one of them. */
{
    const home = fs.readFileSync(D + 'index.html', 'utf8');
    const sec = home.slice(home.indexOf('<!-- ===== INSIDE A SITE'),
                           home.indexOf('<!-- ===== THE MODEL'));
    const copy = sec.replace(/<!--[sS]*?-->/g, ' ').replace(/<[^>]*>/g, ' ');
    ok(!/sites?/i.test(copy),
       'the home drawing section no longer calls itself a site',
       (copy.match(/[^.]*sites?[^.]*/i) || ['clean'])[0].trim().slice(0, 60));
    ok(copy.indexOf('Inside our mine') >= 0 && copy.indexOf('Our mine') >= 0,
       'and its eyebrow agrees with the label above it');
}

/* The divider has to sit between every pair now: the current stop can be at
   either end or in the middle, and hanging the border off the link only worked
   while there was exactly one. */
ok(css.indexOf('.dg-toggle > * + * { border-left: 1px solid var(--line-mid); }') >= 0,
   'the divider is between every pair, not attached to the link');
ok(css.indexOf('.dg-toggle-to.dg-toggle-to--back:hover svg { transform: translateX(-3px); }') >= 0,
   'and a back link travels the other way, on a doubled class rather than source order');
ok(css.indexOf('dg-toggle--back ') < 0 && css.indexOf('.dg-toggle--back') < 0,
   'nothing is left of the old two-segment back variant');

/* Both controls coexist where there are both: the chain crosses pages, the
   slider does not. */
['hosting.html', 'energy.html'].forEach(f => {
    const src = fs.readFileSync(D + f, 'utf8');
    ok(src.indexOf('dg-scale-input') >= 0 && src.indexOf('dg-toggle') >= 0,
       '  ' + f + ' carries both a chain and a slider');
});


ok(/function isDriver\(\) \{ return !link \|\| link\.owner === adopt; \}/.test(eng),
   'exactly one linked instance owns the idle clock');
ok(/if \(!isDriver\(\)\) return;\s*\/\/ followers are painted by the driver/.test(eng),
   'and the others never start a second one that would fight it');
ok(/link\.yaw = yaw; link\.pitch = v\.pitch; link\.zoom = v\.zoom;/.test(eng),
   'rotation, pitch and zoom all travel across the link');
ok(/if \(!link \|\| applying\) return;/.test(eng),
   'an adopted change cannot echo straight back out');

/* Every interaction that moves the view must publish it, or the two drift. */
const pushes = (eng.match(/push\(\);/g) || []).length;
ok(pushes >= 6, 'every interaction publishes: drag, wheel, keys, both zooms, reset, tick',
   pushes + ' publish points');

/* ---------- 5. the turn picks itself back up ---------- */
const resume = (eng.match(/var RESUME_MS = (\d+);/) || [])[1];
ok(resume === '10000', 'the idle turn resumes ten seconds after the last interaction',
   resume + 'ms');
ok(/function scheduleResume\(\)[\s\S]*?clearTimeout\(resumeTimer\)/.test(eng),
   'and every fresh interaction pushes that restart back out again');
ok(/if \(t0 === null\) \{[\s\S]*?w = yaw % \(Math\.PI \* 2\)/.test(eng),
   'it resumes from the angle you left it at, not from zero');
ok(/function doReset\(\) \{\s*if \(resumeTimer\) \{ clearTimeout\(resumeTimer\); resumeTimer = null; \}/.test(eng),
   'Reset cancels a pending resume rather than letting it fire afterwards');
ok(/if \(document\.hidden\) \{\s*stop\(\);\s*if \(resumeTimer\)/.test(eng),
   'a hidden tab does not leave a resume armed against a stopped clock');

/* ---------- 6. geometry holds all the way round ---------- */
let bad = 0, checked = 0;
const boxes = [M.ctrl].concat(A.BOARDS).concat(A.regionBoxes('bus'));
for (let deg = 0; deg < 360; deg += 5) {
    const yaw = deg * Math.PI / 180;
    boxes.forEach(b => {
        const fc = A.boxFaces(b);
        let n = 0;
        for (const k in fc) if (A.frontFacing(fc[k], yaw)) n++;
        checked++;
        if (n < 2 || n > 3) bad++;
    });
}
ok(bad === 0, 'every convex box shows 2 or 3 faces through a whole revolution',
   `${checked} checks`);

const f0 = A.frame(0, null);
ok(f0.slots.length === 3 && f0.slots.every(L => A.LAYERS.some(k => L[k])),
   'every object draws something');
ok(f0.hits.length === A.CALLOUTS.length, 'one hover region per callout');
ok(A.CALLOUTS.every(c => A.regionBoxes(c.id).length > 0),
   'every callout id resolves to at least one box',
   A.CALLOUTS.map(c => c.id + ':' + A.regionBoxes(c.id).length).join(' '));

let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9;
const pts = A.allPoints();
for (let deg = 0; deg < 360; deg += 2) {
    const yaw = deg * Math.PI / 180;
    pts.forEach(p => {
        const q = A.project(p, yaw);
        mnx = Math.min(mnx, q[0]); mxx = Math.max(mxx, q[0]);
        mny = Math.min(mny, q[1]); mxy = Math.max(mxy, q[1]);
    });
}
ok(mnx >= 0 && mxx <= A.VB.w && mny >= 0 && mxy <= A.VB.h,
   'the machine stays inside the viewBox through a whole revolution',
   `x ${mnx.toFixed(0)}..${mxx.toFixed(0)}, y ${mny.toFixed(0)}..${mxy.toFixed(0)}`);
ok(Math.abs(mny - (A.VB.h - mxy)) < 25, 'and stays vertically centred',
   `top ${mny.toFixed(0)}, bottom ${(A.VB.h - mxy).toFixed(0)}`);

/* Leaders must land on the drawing, measured point-to-segment: a tip halfway
   along an edge is on the drawing even though it is far from either corner. */
const segDist = (p, a, b) => {
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const L2 = vx * vx + vy * vy;
    let t = L2 > 0 ? ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(a[0] + t * vx - p[0], a[1] + t * vy - p[1]);
};
const segmentsAt = yaw => {
    const segs = [];
    A.frame(yaw, null).slots.forEach(S => {
        A.LAYERS.forEach(k => {
            const d = S[k];
            if (!d) return;
            const tok = d.match(/[MLZ]|-?\d+(?:\.\d+)?/g) || [];
            let sub = [], start = null, pending = null, i = 0;
            const flush = () => { for (let j = 0; j + 1 < sub.length; j++) segs.push([sub[j], sub[j + 1]]); };
            while (i < tok.length) {
                const t = tok[i];
                if (t === 'M' || t === 'L') { pending = t; i++; continue; }
                if (t === 'Z') { if (sub.length > 1 && start) sub.push(start); flush(); sub = []; start = null; i++; continue; }
                const pt = [Number(tok[i]), Number(tok[i + 1])]; i += 2;
                if (pending === 'M') { flush(); sub = [pt]; start = pt; } else sub.push(pt);
            }
            flush();
        });
    });
    return segs;
};
let worst = 0, worstId = '';
[0, Math.PI / 2, Math.PI, Math.PI * 3 / 2].forEach(yaw => {
    const segs = segmentsAt(yaw);
    A.CALLOUTS.forEach(co => {
        const tip = A.calloutAnchor(co, yaw);
        let best = 1e9;
        segs.forEach(g => { best = Math.min(best, segDist(tip, g[0], g[1])); });
        if (best > worst) { worst = best; worstId = co.id; }
    });
});
ok(worst <= 18, 'every leader tip lands on drawn geometry all the way round',
   `worst ${worst.toFixed(0)}px (${worstId})`);

/* ---------- 6b. findings from the adversarial pass ---------- */

// 219 - 140: the column beside a 140 mm fan is what the fan leaves.
ok(Math.abs(M.psuW * 100 - (M.mm.width - M.mm.fan)) < 0.5,
   'the supply column is exactly what a 140 mm fan leaves of 219 mm',
   (M.psuW * 100).toFixed(0) + 'mm');
ok(Math.abs(M.bayW - M.fan.size) < 0.001,
   'so the bay is exactly the fan, with nothing spare');
ok(Math.abs(M.ctrl.d - M.bayW) < 0.001,
   'the controller deck spans the bay only, with the supply column full height beside it');

// Screw heads and terminals lie ON horizontal faces; ring() stands them upright.
ok(typeof A.H.ringY === 'function', 'the engine can draw a ring in the plane of constant y');
ok(src.indexOf('ringY(bx, BUS_Y') >= 0 && src.indexOf('ringY(s[0], y1') >= 0,
   'busbar terminals and cover screws lie flat on the faces they sit on');

// dg-flow paints before every slot, so a run through the bay is buried.
ok(src.indexOf('runs = [') >= 0 && src.indexOf('X0 + 0.45, mid') < 0,
   'the air path shows at the ends, where it is not painted over by the machine');

// Detail is the last layer, so it bleeds through anything it sits on.
{
  const front = A.frame(0, null).slots.find(s => s.id === 'fanA');
  const back  = A.frame(Math.PI, null).slots.find(s => s.id === 'fanA');
  ok(front.detail.length > 1000, 'the intake fan face is drawn when it faces you',
     front.detail.length + 'b');
  ok(back.detail.length === 0, 'and not drawn at all from behind, where it would bleed through',
     back.detail.length + 'b');
}

// Square on, the end face is edge-on and the fans disappear entirely.
ok(A.scene.view.BASE_YAW > 0.4,
   'the machine is shown three-quarters on, so its fan face reads at rest',
   (A.scene.view.BASE_YAW * 180 / Math.PI).toFixed(0) + ' degrees');
ok(!require(REPO_ROOT + 'site/scene-site.js').scene.view.BASE_YAW,
   'and the other scenes are untouched by it');

/* ---------- 7. nothing unverified is stated ---------- */
const bare = t => t.replace(/APW\d+/g, "").replace(/S21 ?Pro/gi, "");
const claims = A.CALLOUTS.filter(c => /\d/.test(bare(c.desc)));
ok(claims.length === 0, 'no callout description states a figure',
   claims.map(c => c.id).join(', '));
ok(A.CALLOUTS.filter(c => /\d/.test(c.title)).every(c => /140/.test(c.title)),
   'the only figure in a title is the sourced 140 mm fan size');

console.log('');
console.log(fail ? `${fail} FAILED` : 'ALL OK');
process.exitCode = fail ? 1 : 0;
