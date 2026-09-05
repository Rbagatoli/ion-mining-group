/* Checks on the S21+ Hyd. scene, the detail slider, and the shared view.

   THIS SUITE USED TO PROVE A DRAWING OF AN AIR-COOLED MACHINE. Roughly two
   dozen of its assertions were bound to fans: 140 mm, two stacked at each end,
   three objects so the near module could sort in front, "the supply column is
   exactly what a 140 mm fan leaves of 219 mm". None of that describes an
   S21+ Hyd., and none of it was deleted — each one was replaced by the hydro
   fact standing in the same place, so the suite still does the job it did:
   proving the picture matches a sourced spec rather than merely rendering.

   THE HARDEST THING TO TEST HERE IS AN ABSENCE. What makes a hydro machine
   recognisable is largely what is missing — no fan apertures, no grilles, no
   louvres — and an assertion cannot see a gap in a drawing. So the absence is
   tested from three sides at once: the model carries no fan dimension, the api
   exposes no fan module, the compiled source contains no fan geometry (comments
   stripped first, or the note explaining why there are no fans would fail the
   check for fans), and both end plates are proved to be positively drawn.

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

/* The scene with its prose removed. Every check below that asks "does the
   drawing still do X" runs against this and not against src: the file's own
   comments explain at length that the machine has no fans, and a naive search
   for the word would be answered by the explanation rather than by the code.

   Quoted strings go too, and for the same reason one step further in. The
   callout that tells the reader "this machine has no fans" is a string literal,
   so a search of the stripped source for fans was still answered by the
   sentence denying them. What is left is identifiers, numbers and calls — the
   geometry, which is the only place the word would be a bug. The copy itself is
   checked as copy, further down. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ')
                .replace(/^\s*\/\/.*$/gm, ' ')
                .replace(/'[^'\n]*'/g, "''");

const A = require(D + 'scene-asic.js');
const C = require(D + 'scene-hosting.js');
const E = require(D + 'diagram-engine.js');
const DB = require(D + 'miner-db.js');

let fail = 0;
const ok = (cond, label, detail) => {
    console.log((cond ? '  ok   ' : '  FAIL ') + label + (detail ? '   ' + detail : ''));
    if (!cond) fail++;
};

/* Slots are looked up by object id and NOT with a bare .find(...).detail. Under
   a mutation that drops a renderable — which is exactly the mutation the slot
   count exists to catch — the bare form throws on undefined and takes the whole
   rest of the file with it, so the run reports a crash instead of reporting
   which assertions caught it. An empty layer set fails those assertions on its
   own, which is what they are for. */
const EMPTY = { id: null, ground: '', inside: '', back: '', asics: '', end: '',
                side: '', top: '', detail: '', flame: '' };
const slotOf = (yaw, id) =>
    A.frame(yaw, null).slots.filter(s => s.id === id)[0] || EMPTY;

const M = A.MODEL;
console.log(`${M.name}: ${A.SLOTS} objects, ${A.CALLOUTS.length} callouts, ` +
            `${A.BOARDS.length} boards, ${M.mm.length}x${M.mm.width}x${M.mm.height}mm, ` +
            `OD${M.mm.tube} coolant, viewBox ${A.VB.w}x${A.VB.h}`);
console.log('');

/* ---------- 1. it is dimensionally an S21+ Hyd. ---------- */
ok(M.mm.length === 339 && M.mm.width === 173 && M.mm.height === 207,
   'chassis is 339 x 173 x 207 mm, per Bitmain, not the S21 Pro shell this replaced',
   `${M.mm.length}x${M.mm.width}x${M.mm.height}`);
ok(M.mm.length < 450 && M.mm.width < 219 && M.mm.height < 293,
   'and it is smaller than that shell on every axis: nothing inside makes room for a fan');
const unit = 100;
ok(Math.abs(M.chassis.w - M.mm.length / unit) < 0.001 &&
   Math.abs(M.chassis.d - M.mm.width / unit) < 0.001 &&
   Math.abs(M.chassis.h - M.mm.height / unit) < 0.001,
   'and the drawn box is those millimetres at 100 mm per scene unit',
   `${M.chassis.w} x ${M.chassis.d} x ${M.chassis.h}`);

/* The drawing and the catalogue have to be the same machine. They are separate
   files that nothing else joins up, and the site prices what miner-db.js says
   while it draws what this scene says. */
const cat = DB.findByModel(M.name);
ok(!!cat, 'the machine drawn is one the site actually sells', M.name);
ok(cat && cat.hashrate === 395 && cat.power === 5.925 && cat.efficiency === 15.0,
   'and the catalogue entry is the hydro machine, not an air-cooled namesake',
   cat ? `${cat.hashrate} TH/s, ${cat.power} kW, ${cat.efficiency} J/TH` : 'missing');

/* ---------- 1b. it is a HYDRO machine ---------- */

/* The coolant standard is the one figure inside this drawing that is published,
   so every tube in it is drawn at that diameter and nothing else. */
ok(Math.abs(M.tube - M.mm.tube / unit) < 0.001,
   'the coolant tube is drawn at OD10, the one sourced figure inside the machine',
   M.tube + ' units');

ok(Array.isArray(M.portZ) && M.portZ.length === 2,
   'two coolant ports, inlet and return', M.portZ.length + ' port(s)');
/* THREE OBJECTS, FOR A COMPLETELY DIFFERENT REASON THAN BEFORE. The S21 Pro had
   three because a fan module stood proud at each end. This has three because
   both couplings stand proud of the SAME end and have to sort against each
   other: the engine can only express occlusion between objects, and drawn as
   one the far coupling's body painted over the near one's tube. So the count
   surviving the rewrite is a coincidence, and the check that matters is that
   the two things standing proud are both at the service end. */
ok(A.SLOTS === 3,
   'body plus one object per coupling, so the near one can sort in front of the far one',
   A.SLOTS + ' objects');
ok(A.RENDER_ANCHORS.length === A.SLOTS &&
   A.RENDER_ANCHORS.map(r => r.id).join(',') === 'body,portA,portB',
   'and the renderables agree with the slot count, so nothing is silently dropped',
   A.RENDER_ANCHORS.map(r => r.id).join(','));
/* The sort is only worth having if it changes its mind. Two objects at the same
   depth all the way round would order arbitrarily and the split would be
   pointless ceremony. */
{
    let flips = 0, prev = null;
    for (let deg = 0; deg < 360; deg += 5) {
        const yaw = deg * Math.PI / 180;
        const near = A.depthOf([A.PORTA.x, M.portY, A.PORTA.z], yaw) >
                     A.depthOf([A.PORTB.x, M.portY, A.PORTB.z], yaw);
        if (prev !== null && near !== prev) flips++;
        prev = near;
    }
    ok(flips === 2,
       'and which of the two is in front changes exactly twice in a revolution',
       flips + ' swaps');
}

/* WHERE THE COUPLINGS ARE IS A CLAIM ABOUT PLUMBING, not decoration. Coolant
   that entered beside the supply would have to cross it to reach a cold plate,
   so both couplings sit wholly over the bay they feed and clear of the column. */
const bayLo = M.bayZ - M.bayW / 2, bayHi = M.bayZ + M.bayW / 2;
ok(M.portZ.every(pz => pz - M.qd.r >= bayLo - 0.001 && pz + M.qd.r <= bayHi + 0.001),
   'both couplings sit wholly over the board bay, clear of the supply column',
   `ports ${M.portZ.map(z => z.toFixed(2)).join(' / ')} in bay ` +
   `${bayLo.toFixed(2)}..${bayHi.toFixed(2)}, r ${M.qd.r}`);
ok(Math.abs((M.portZ[0] + M.portZ[1]) / 2 - M.bayZ) < 0.001,
   'and the pair is centred on it, so neither is nearer the wall than the other');

/* The port end and the blind end, as geometry rather than as intent. */
const X0 = M.chassis.x - M.chassis.w / 2, X1 = M.chassis.x + M.chassis.w / 2;
ok(A.PORTS.out < X0 && A.PORTS.face === X0,
   'the port block stands proud of the service end plate, as a coupling does',
   `out ${A.PORTS.out.toFixed(2)}, plate ${X0.toFixed(2)}`);
/* THE BLIND END IS FLUSH, and that is the S21 Pro's exhaust fan module being
   gone rather than merely undrawn. Anything outside the shell at that end would
   be an aperture by another name. */
/* The body is skipped BY NAME, not cleared by an epsilon. Its box is the chassis's own
   depth-sort volume, padded 0.10 past the shell at each end so the sort has something to
   order; it is not a fitting and cannot stand proud of itself. This used to read
   `> X1 + 0.101` — one thousandth of a unit clear of that padding — so any change to the
   padding, which has nothing to do with whether the blind end is plate, flipped this into a
   false positive naming `body`. A named exclusion says what is meant and does not move when
   the sort box does. */
const past = A.objects().filter(o => o.id !== 'body' && o.box.x + o.box.w / 2 > X1 + 0.001);
ok(past.length === 0,
   'and nothing at all stands proud of the blind end: that face is flat plate',
   past.map(o => o.id).join(', ') || 'clear');

/* ---------- 1c. the fans are gone, checked from every side ---------- */
ok(M.mm.fan === undefined,
   'no fan size survives in the sourced dimensions', String(M.mm.fan));
ok(M.fan === undefined && M.fanY === undefined &&
   A.FANA === undefined && A.FANB === undefined,
   'and no fan module survives on the model or the api');
ok(!/fan/i.test(code),
   'and none in the geometry either, with comments and copy stripped so neither answers for the code',
   (code.match(/.{0,24}fan.{0,24}/i) || ['clean'])[0].trim());
ok(code.indexOf('function guard') < 0 && code.indexOf('ringX(fx') < 0,
   'the fan guard — a dozen concentric rings with a saltire — is gone with them');
/* And the copy says so out loud, which is the other half of drawing an absence:
   a reader who has never seen an air-cooled miner cannot notice a missing
   aperture, so one callout has to name what is not there. */
ok(A.CALLOUTS.some(c => /no fans/i.test(c.desc)),
   'a callout tells the reader in words that the machine has none',
   (A.CALLOUTS.find(c => /no fans/i.test(c.desc)) || {}).id || 'none');

/* ---------- 2. the supply, the boards and the split between them ---------- */
const inChassis = b => (
    b.x - b.w / 2 >= M.chassis.x - M.chassis.w / 2 - 0.001 &&
    b.x + b.w / 2 <= M.chassis.x + M.chassis.w / 2 + 0.001 &&
    b.z - b.d / 2 >= M.chassis.z - M.chassis.d / 2 - 0.001 &&
    b.z + b.d / 2 <= M.chassis.z + M.chassis.d / 2 + 0.001);
ok(A.regionBoxes('psu').every(inChassis),
   'the supply sits INSIDE the chassis footprint, not beside it');
ok(M.psuW > 0 && M.bayW > M.psuW,
   'it takes a narrow column and the board bay takes the rest',
   `psu ${M.psuW.toFixed(2)}, bay ${M.bayW.toFixed(2)} of ${M.chassis.d}`);

/* THE REPLACEMENT FOR "219 - 140: WHAT THE FAN LEAVES".
   That derivation was arithmetic on two published figures and it died with the
   fans. The bay is now three board slices and the column is what they leave, so
   this measures the sum against the PUBLISHED 173 mm rather than against
   M.chassis.d — otherwise both halves come from the same number and the sum is
   right by construction whatever either half is. */
ok(Math.abs((M.psuW + M.boardPitch * 3) * unit - M.mm.width) < 0.5,
   'the supply column is exactly what the three board slices leave of the published 173 mm',
   `${(M.psuW * unit).toFixed(0)}mm + 3 x ${(M.boardPitch * unit).toFixed(0)}mm`);
ok(Math.abs(M.bayW - M.boardPitch * 3) < 0.001,
   'so the bay is exactly three slices, with nothing spare',
   `${M.bayW.toFixed(2)} against ${(M.boardPitch * 3).toFixed(2)}`);
/* And the boards actually occupy those slices, evenly, half a slice off each
   bay wall. A pitch nothing is pitched at is a number, not a derivation. */
const gaps = [M.boardZ[1] - M.boardZ[0], M.boardZ[2] - M.boardZ[1]];
ok(gaps.every(g => Math.abs(g - M.boardPitch) < 0.001),
   'and the three boards are pitched at exactly that slice',
   gaps.map(g => g.toFixed(3)).join(' / '));
ok(Math.abs((M.boardZ[0] - bayLo) - M.boardPitch / 2) < 0.001 &&
   Math.abs((bayHi - M.boardZ[2]) - M.boardPitch / 2) < 0.001,
   'and they tile the bay, half a slice clear of each wall');
ok(Math.abs(M.ctrl.d - M.bayW) < 0.001,
   'the controller deck spans the bay only, with the supply column full height beside it');

ok(A.BOARDS.length === 3, 'three hashboards');
ok(A.BOARDS.every(b => b.z - b.d / 2 >= bayLo - 0.001 && b.z + b.d / 2 <= bayHi + 0.001),
   'all three stand in the bay the coolant is carried through');
ok(A.BOARDS.every(inChassis), 'and all three are inside the chassis');

/* ---------- 2b. what sits on the boards changed ---------- */
ok(A.CHIPS === undefined && code.indexOf('CHIPS') < 0,
   'no chip grid — the boards are under cold plates and the chips are invisible');
ok(A.CALLOUTS.some(c => /cold plate/i.test(c.title)),
   'a callout says cold plates, which is what replaced the fin stacks');
ok(!A.CALLOUTS.some(c => /heatsink|finned/i.test(c.title + ' ' + c.desc)),
   'and nothing still calls them heatsinks');
/* The plate is clamped ON the near board, on the cutaway side where it can be
   seen, and inside the shell. A plate floating clear of its board would draw
   identically from most angles and be wrong from all of them. */
const cold = A.COLD, near = A.BOARDS[2];
ok(cold.z > near.z && cold.z - cold.d / 2 < near.z + near.d / 2 + 0.001,
   'the cold plate sits on the near board, touching it, on the cutaway side',
   `plate ${cold.z.toFixed(3)}, board face ${(near.z + near.d / 2).toFixed(3)}`);
ok(cold.z + cold.d / 2 < M.chassis.z + M.chassis.d / 2,
   'and still inside the shell, not poking out of the open face');
ok(cold.w < near.w && cold.h < near.h,
   'and inset from the board on every edge, so it reads as clamped to it rather than as a second board');
ok(!A.CALLOUTS.some(c => /\b(195|273|65|91)\b/.test(c.title + ' ' + c.desc)),
   'no chip count is drawn: the sources conflict and Bitmain publishes none');

/* ---------- 3. the page says what it is ---------- */
ok(html.indexOf('Modelled on an ' + M.name) >= 0,
   'the page states the machine it is modelled on',
   (html.match(/Modelled on an? [^&<]*/) || ['absent'])[0].trim());
ok(html.indexOf('aria-label="Interactive cutaway of an ' + M.name) >= 0,
   'and the alt text does too',
   (html.match(/aria-label="Interactive cutaway of an? [^:"]*/) || ['absent'])[0]
       .replace('aria-label="', ''));
ok(!/\b140 mm fans?\b/.test(html.slice(html.indexOf('dg-wrap--asic'))),
   'and neither of them still promises fans on a machine that has none');
ok(/\.dg-note \{/.test(css), 'the note has a style');

/* ---------- 4. the pair still holds together ---------- */
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

/* ---------- 4b. leaders are scaffolding, not subject ---------- */
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

/* ---------- 5. the shared view ---------- */
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
/* THIS CHECK HAD BEEN DEAD SINCE IT WAS WRITTEN, and finding that out is worth
   more than the check. Its pattern read as \bsites?\b — except the two \b were
   not word boundaries. They were literal 0x08 BACKSPACE bytes, put into the
   file by a shell heredoc that ate the backslashes on the way in, and they are
   invisible in every editor and in every diff. A regex asking for
   backspace-site-backspace matches no HTML ever written, so this answered
   "clean" whatever index.html said and has read as passing in every run since.

   Reviving it turned up a second thing. The section slice reaches past the
   prose into the dg-toggle chain bar, whose segments name the OTHER two
   drawings — and one of them is called "Your site". That is the bar doing
   exactly what the note above says the labels now do, naming by ownership; it
   is not the home section calling itself a site. So the bar is lifted out
   before the prose is read, and put back for the eyebrow check, which is about
   the bar. */
{
    const home = fs.readFileSync(D + 'index.html', 'utf8');
    const sec = home.slice(home.indexOf('<!-- ===== INSIDE A SITE'),
                           home.indexOf('<!-- ===== THE MODEL'));
    const b0 = sec.indexOf('<div class="dg-toggle');
    const bar = sec.slice(b0, sec.indexOf('</div>', b0) + 6);
    const strip = t => t.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]*>/g, ' ');
    const copy = strip(sec);
    const prose = strip(sec.split(bar).join(' '));
    ok(b0 >= 0 && bar.length > 0 && prose.length < copy.length,
       'the home section carries a chain bar, and it can be told apart from the prose',
       strip(bar).replace(/\s+/g, ' ').trim());
    ok(!/\bsites?\b/i.test(prose),
       'the home drawing section no longer calls itself a site',
       (prose.match(/[^.]*\bsites?\b[^.]*/i) || ['clean'])[0].trim().slice(0, 60));
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

/* ---------- 6. the turn picks itself back up ---------- */
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

/* ---------- 7. geometry holds all the way round ---------- */
let bad = 0, checked = 0;
const boxes = [M.ctrl, A.COLD, A.MANI].concat(A.BOARDS)
                  .concat(A.regionBoxes('bus')).concat(A.regionBoxes('ports'));
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

/* THE TURNTABLE IS OFF-CENTRE AND HAS TO EARN IT. The S21 Pro was symmetric —
   a fan module proud at each end — and turned about its own middle. This
   machine has 60 mm of plumbing on one end and flat plate on the other, so
   spinning it about its centre throws the couplings round the widest circle in
   the sweep, and the mobile crop is a fixed window sized to that circle. */
{
    const all = A.allPoints();
    const swept = shift => {
        let r = 0;
        all.forEach(p => { r = Math.max(r, Math.hypot(p[0] + shift, p[2])); });
        return r;
    };
    const off = swept(A.scene.view.SHIFT_X), mid = swept(0);
    ok(off < mid,
       'turning it off-centre shrinks the widest sweep, which is what buys the drawing its size',
       `${off.toFixed(3)} against ${mid.toFixed(3)} about its own centre`);
    /* And not just any offset: scan for the best one there is, so a SHIFT_X
       nudged to a round number or left at zero shows up as slack rather than as
       a value someone can argue for. */
    let best = Infinity, at = 0;
    for (let s = -1; s <= 1.5001; s += 0.005) {
        const r = swept(s);
        if (r < best) { best = r; at = s; }
    }
    ok(off <= best * 1.05,
       'and it is within 5% of the best turntable centre available',
       `${off.toFixed(3)} against ${best.toFixed(3)} at shift ${at.toFixed(2)}`);
}

/* Leaders must land on the drawing, measured point-to-segment: a tip halfway
   along an edge is on the drawing even though it is far from either corner. */
const segDist = (p, a, b) => {
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const L2 = vx * vx + vy * vy;
    let t = L2 > 0 ? ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(a[0] + t * vx - p[0], a[1] + t * vy - p[1]);
};
const subpathsOf = d => {
    const tok = d.match(/[MLZ]|-?\d+(?:\.\d+)?/g) || [];
    const out = [];
    let sub = [], start = null, pending = null, i = 0;
    const flush = () => { if (sub.length) out.push(sub); };
    while (i < tok.length) {
        const t = tok[i];
        if (t === 'M' || t === 'L') { pending = t; i++; continue; }
        if (t === 'Z') { if (sub.length > 1 && start) sub.push(start); flush(); sub = []; start = null; i++; continue; }
        const pt = [Number(tok[i]), Number(tok[i + 1])]; i += 2;
        if (pending === 'M') { flush(); sub = [pt]; start = pt; } else sub.push(pt);
    }
    flush();
    return out;
};
const segmentsAt = yaw => {
    const segs = [];
    A.frame(yaw, null).slots.forEach(S => {
        A.LAYERS.forEach(k => {
            if (!S[k]) return;
            subpathsOf(S[k]).forEach(sub => {
                for (let j = 0; j + 1 < sub.length; j++) segs.push([sub[j], sub[j + 1]]);
            });
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

/* ---------- 7b. findings from the adversarial pass ---------- */

// Screw heads and terminals lie ON horizontal faces; ring() stands them upright.
ok(typeof A.H.ringY === 'function', 'the engine can draw a ring in the plane of constant y');
ok(code.indexOf('ringY(bx, BUS_Y') >= 0 && code.indexOf('ringY(s[0], y1') >= 0,
   'busbar terminals and cover screws lie flat on the faces they sit on');

/* THE COOLANT RUN IS AT ONE END, AND THAT IS THE WHOLE DIFFERENCE FROM THE AIR
   PATH IT REPLACED. Air went in one face and out the other, so dg-flow drew a
   run off each end of the machine. A closed loop arrives and leaves through the
   same plate. Measured by asking, at every angle, which end of the machine each
   flow point is nearer to — a run that drifted to the blind end would be
   claiming the machine breathes through it. */
{
    let stray = 0, points = 0, runs = 0;
    for (let deg = 0; deg < 360; deg += 15) {
        const yaw = deg * Math.PI / 180;
        const d = A.frame(yaw, null).flow;
        const servEnd = A.project([X0, M.portY, M.bayZ], yaw);
        const blindEnd = A.project([X1, M.portY, M.bayZ], yaw);
        const subs = subpathsOf(d);
        if (!deg) runs = subs.length;
        subs.forEach(sub => sub.forEach(p => {
            points++;
            if (Math.hypot(p[0] - servEnd[0], p[1] - servEnd[1]) >
                Math.hypot(p[0] - blindEnd[0], p[1] - blindEnd[1])) stray++;
        }));
    }
    ok(runs === 2, 'the coolant path is two runs, one per port', runs + ' run(s)');
    ok(stray === 0 && points > 0,
       'and both stay at the service end all the way round: a loop does not cross the machine',
       `${points - stray}/${points} points nearer the ported end`);
}

/* Detail is the last layer, so it bleeds through anything it sits on. */
{
    const front = ['portA', 'portB'].map(id => slotOf(0, id).detail.length);
    const back  = ['portA', 'portB'].map(id => slotOf(Math.PI, id).detail.length);
    ok(front.every(n => n > 500), 'both coupling faces are drawn when the plate faces you',
       front.join(' / ') + 'b');
    ok(back.every(n => n === 0), 'and neither from behind, where they would bleed through',
       back.join(' / ') + 'b');
}

/* BOTH END PLATES ARE POSITIVELY DRAWN, and the blind one is the point of this.
   Taking the fan module off the exhaust end leaves a bare rectangle, which
   reads as a face the drawing forgot rather than as a face closed on purpose,
   so both ends carry a perimeter seam set in from the edge.

   TWO WAYS OF LOOKING FOR IT WERE WRONG BEFORE THIS ONE, and both failed in the
   same direction — they found something and called it the plate.

   Counting subpaths that fall inside the projected face: at the angle where an
   end plate is widest the machine is nearly square-on, so the boards, the cold
   plate and the ribbons all project inside that same quad. The count came out
   at 63 for a plate worth 23, and deleting the plate outright would have left
   40 and passed.

   Looking for "a long run parallel to a face edge, set in from it": the cold
   plate's serpentine channel runs the length of the machine in four long
   parallel passes, and from the far side they land inside the projected quad of
   the end you are NOT looking at. That reported the hidden plate as drawn.

   So it matches the seam EXACTLY. The scene declares the inset it draws the
   seam at; this projects that rectangle and asks whether those four segments
   are in the path data, endpoint to endpoint. Nothing else can accidentally
   satisfy it, and the same test run against the hidden end proves the
   visibility gate is real rather than that the far end happens to be quiet. */
{
    /* Pick the angle where each face is WIDEST, not the first angle at which it
       is merely visible. The first such angle is nearly edge-on — the blind end
       projects to a strip 27 units across — and a seam inset 13 mm from an
       edge that is 27 units long has nowhere to be. */
    const widestYaw = faceKey => {
        let bestA = 0, bestY = null;
        for (let deg = 0; deg < 360; deg += 2) {
            const yaw = deg * Math.PI / 180;
            const q = A.boxFaces(M.chassis)[faceKey];
            if (!A.frontFacing(q, yaw)) continue;
            const a = Math.abs(A.H.signedArea(q, yaw));
            if (a > bestA) { bestA = a; bestY = yaw; }
        }
        return bestY;
    };
    /* The seam the scene says it draws, in model space. M.plate is a declared
       constant like M.tube or M.qd.r, not a value read back out of the builder:
       the question being asked is whether the drawing contains what the model
       claims, so the claim has to come from somewhere other than the drawing. */
    const seamCorners = (end, yaw) => {
        const px = (end < 0 ? X0 : X1) + end * M.plate.lift;
        const a = M.plate.inset;
        const y0 = a, y1 = M.chassis.h - a;
        const z0 = M.chassis.z - M.chassis.d / 2 + a;
        const z1 = M.chassis.z + M.chassis.d / 2 - a;
        return [[px, y0, z0], [px, y0, z1], [px, y1, z1], [px, y1, z0]]
            .map(p => A.project(p, yaw));
    };
    const seamEdges = (end, yaw) => {
        const c = seamCorners(end, yaw);
        const segs = [];
        subpathsOf(slotOf(yaw, 'body').detail).forEach(sub => {
            for (let j = 0; j + 1 < sub.length; j++) segs.push([sub[j], sub[j + 1]]);
        });
        // Path coordinates are rounded to a tenth, so a whole unit is generous.
        const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1;
        return [[0, 1], [3, 2], [0, 3], [1, 2]].filter(([i, j]) =>
            segs.some(([p, q]) => (near(p, c[i]) && near(q, c[j])) ||
                                  (near(p, c[j]) && near(q, c[i])))).length;
    };
    const blindYaw = widestYaw('right'), portYaw = widestYaw('left');
    ok(blindYaw !== null && portYaw !== null,
       'each end face has an angle at which it is the one you are looking at',
       `blind ${(blindYaw * 180 / Math.PI).toFixed(0)}deg, ` +
       `port ${(portYaw * 180 / Math.PI).toFixed(0)}deg`);
    ok(seamEdges(1, blindYaw) === 4,
       'the blind end is a drawn plate, seamed on all four edges, not a bare rectangle',
       seamEdges(1, blindYaw) + ' of 4 seam edges in the path data');
    ok(seamEdges(-1, portYaw) === 4,
       'and the service end carries the same seam under its plumbing',
       seamEdges(-1, portYaw) + ' of 4');
    /* And only ever one of them at a time. Detail is the last layer painted, so
       an end plate drawn while its face is turned away lands on top of the far
       one — the seam of the end you cannot see, printed across the end you can. */
    ok(seamEdges(-1, blindYaw) === 0 && seamEdges(1, portYaw) === 0,
       'and the far end plate is not drawn through the machine at the same time',
       `${seamEdges(-1, blindYaw)} / ${seamEdges(1, portYaw)} stray edges`);
}

// Square on, the end plate is edge-on and both couplings vanish into a line.
ok(A.scene.view.BASE_YAW > 0.4,
   'the machine is shown three-quarters on, so its port plate reads at rest',
   (A.scene.view.BASE_YAW * 180 / Math.PI).toFixed(0) + ' degrees');
/* Home now authors its own opening angle too. The container and energy
   comparisons must still retain their original camera orientation. */
ok(['scene-hosting', 'scene-pad-now', 'scene-pad-ion', 'scene-landfill-now', 'scene-landfill-ion']
       .every(name => !require(REPO_ROOT + 'site/' + name + '.js').scene.view.BASE_YAW),
   'the container and energy scenes retain their original opening orientation');

/* THE PORTS HAVE TO SURVIVE THE PHONE, which is where this drawing is smallest
   and where the S21 Pro's fan guards — eleven concentric rings — turned into a
   grey smudge. The crop is read out of styles.css rather than assumed: at a 390
   viewport the wrap is about 350 px and .dg-wrap--asic shows a window of the
   viewBox inside it, which fixes how many pixels a scene unit is worth.

   The bar is 10.5 px, which is the smallest type this site is allowed to set.
   A feature smaller than the smallest legible letter is not a feature. */
{
    const w = parseFloat((css.match(/\.dg-wrap--asic \.site-diagram \{ width: ([\d.]+)%/) || [])[1]);
    const perUnit = 350 / (A.VB.w * 100 / w);
    const px = (a, b) => {
        const p = A.project(a, 0), q = A.project(b, 0);
        return Math.hypot(p[0] - q[0], p[1] - q[1]) * perUnit;
    };
    const bx = X0 - M.qd.body / 2;
    const tall = Math.min(...M.portZ.map(pz =>
        px([bx, M.portY - M.qd.r, pz], [bx, M.portY + M.qd.r, pz])));
    const apart = px([bx, M.portY, M.portZ[0]], [bx, M.portY, M.portZ[1]]);
    const proud = px([X0, M.portY, M.portZ[0]], [A.PORTS.out, M.portY, M.portZ[0]]);
    ok(w > 0, 'the mobile crop is declared for this wrap', w + '%');
    ok(tall >= 10.5, 'a coupling is at least as tall on a phone as the smallest type the site sets',
       tall.toFixed(1) + 'px at ' + perUnit.toFixed(3) + 'px/unit');
    /* EDGE TO EDGE, NOT CENTRE TO CENTRE.
       This measured the distance between the two port CENTRES, which cannot fail for the
       defect it was written to guard: the scene's own note records that a 0.62 pitch put two
       46-unit couplings 57 apart and they "rendered as one lumpy object", and a centre
       measurement reports 57 either way. Swept, the old assertion still passed at a pitch of
       0.24, where the two collars physically interpenetrate by 17 mm.
       The collar is the widest part of a coupling (QD.r * 2.4, see the scene), so the clear
       gap is the pitch minus one collar. Both halves are checked: that a gap exists at all,
       and that what exists is at least as wide as the smallest type the site sets. */
    const collarD = M.qd.r * 2.4;
    const gapUnits = M.portPitch - collarD;
    const gap = px([bx, M.portY, M.portZ[0] + collarD / 2],
                   [bx, M.portY, M.portZ[1] - collarD / 2]);
    ok(gapUnits > 0, 'the two couplings do not overlap each other',
       'pitch ' + M.portPitch + ' - collar ' + collarD.toFixed(3) + ' = ' + gapUnits.toFixed(3) + ' units');
    ok(gapUnits > 0 && gap >= 10.5, 'and the gap between them reads as a gap on a phone',
       gap.toFixed(1) + 'px of clear space');
    ok(proud >= 10.5, 'and stands far enough off the plate to break its line',
       proud.toFixed(1) + 'px');
}

/* ---------- 8. nothing unverified is stated ---------- */
const bare = t => t.replace(/OD10/g, '').replace(/S21\+? ?(Pro|Hyd\.?)/gi, '');
const claims = A.CALLOUTS.filter(c => /\d/.test(bare(c.desc)));
ok(claims.length === 0, 'no callout description states a figure',
   claims.map(c => c.id).join(', '));
ok(A.CALLOUTS.filter(c => /\d/.test(c.title)).every(c => /OD10/.test(c.title)),
   'the only figure in a title is the sourced OD10 coolant standard',
   A.CALLOUTS.filter(c => /\d/.test(c.title)).map(c => c.title).join(' | ') || 'none');

/* ---------- 9. the hydro hardware is positively drawn ---------- */
/* EVERY CHECK ABOVE PROVES AN ABSENCE. None proved a presence, and that gap was not
   theoretical: an adversarial pass deleted the manifold header, all six OD10 jumpers and
   the cold-plate slab in one edit and this suite did not notice. Nor did deleting all three
   hashboards, the control board, or the busbars. A suite made only of absence checks is
   satisfied by an empty drawing — it would have passed on a blank rectangle labelled
   "no fans".

   The mass those mutations removed is exactly what the file offers as its reason for NOT
   drawing a coolant channel inside the plate: "the pipework outside it is real hardware and
   can be drawn as such". If that pipework can vanish silently, the argument is unbacked.

   Checked by exact geometry, not by ink volume: for each solid, every face the scene's own
   frontFacing() says is visible is projected through the scene's own poly() and looked up in
   the emitted path data. That is the same string the builder must have written, so it cannot
   pass by coincidence and cannot be satisfied by some other object's ink nearby. */
{
    const f0 = A.frame(0, null);
    const all = f0.slots.map(s => A.LAYERS.map(L => s[L] || '').join('')).join('');
    const H = A.H;
    const drawn = box => {
        const faces = A.boxFaces(box);
        const vis = Object.keys(faces).filter(k => A.frontFacing(faces[k], 0));
        return vis.length > 0 && vis.every(k => all.includes(H.poly(faces[k], 0)));
    };

    ok(drawn(M.mani), 'the coolant header is drawn');
    ok(drawn(A.COLD), 'the cold plate is drawn');
    ok(A.JUMPERS.length === 6,
       'there are six jumpers: flow and return into each of three boards',
       A.JUMPERS.length + '');
    ok(A.JUMPERS.every(drawn), 'and every one of the six is on screen',
       A.JUMPERS.filter(j => !drawn(j)).length + ' missing');
    ok(A.BOARDS.length === 3 && A.BOARDS.every(drawn), 'all three hashboards are drawn');
    ok(drawn(A.CTRL), 'the control board is drawn');

    /* The jumpers must actually SPAN header to plate. Six solids of the right count in the
       wrong place would satisfy everything above. */
    const jx0 = M.mani.x + M.mani.w / 2, jx1 = A.COLD.x - A.COLD.w / 2;
    ok(A.JUMPERS.every(j => j.x - j.w / 2 <= jx0 + 0.01 && j.x + j.w / 2 >= jx1),
       'and each spans the gap from the header to the plate it feeds',
       'header face ' + jx0.toFixed(2) + ', plate edge ' + jx1.toFixed(2));
    ok(A.JUMPERS.every(j => Math.abs(j.h - M.tube) < 1e-9 && Math.abs(j.d - M.tube) < 1e-9),
       'and each is drawn at the sourced OD10 bore, not a convenient thickness',
       M.mm.tube + ' mm');
}

console.log('');
console.log(fail ? `${fail} FAILED` : 'ALL OK');
process.exitCode = fail ? 1 : 0;
