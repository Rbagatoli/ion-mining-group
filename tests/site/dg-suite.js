/* Repo-relative, so this runs wherever the checkout is. Was an absolute
   c:/Users/rbaga/... path that worked on one machine. */
const REPO_ROOT = require('path').join(__dirname, '..', '..').replace(/\\/g, '/') + '/';
const D = require(REPO_ROOT + 'site/scene-site.js');
let bad = 0;
const fail = m => { console.error('FAIL: ' + m); bad = 1; };
const sweep = n => Array.from({length: n + 1}, (_, i) => Math.PI * 2 * (i / n));

// --- 1. Depth direction: +Z must be nearer than -Z ---
const near = Math.abs(D.project([1,1,1],0)[0] - D.project([-1,1,1],0)[0]);
const far  = Math.abs(D.project([1,1,-1],0)[0] - D.project([-1,1,-1],0)[0]);
if (!(near > far)) fail('+Z is not the near side — the scene renders inside-out');
console.log('depth: +Z projects larger than -Z, so +Z is the near side  OK');

// --- 2. Culling invariant: a convex box shows 2..3 faces, never 0, never all 6 ---
const probe = D.boxFaces({ x: 0, y: 0, z: 0, w: 2, h: 2, d: 2 });
let lo = 9, hi = 0;
for (const yaw of sweep(80)) {
  let v = 0;
  for (const k of Object.keys(probe)) if (D.frontFacing(probe[k], yaw)) v++;
  lo = Math.min(lo, v); hi = Math.max(hi, v);
}
if (lo < 2 || hi > 3) fail(`visible faces per box range ${lo}..${hi}, want 2..3`);
else console.log(`culling: ${lo}..${hi} faces visible per box across the sweep  OK`);
for (const yaw of sweep(40)) {
  if (D.frontFacing(probe.top, yaw) === D.frontFacing(probe.bot, yaw)) fail('top and bot agree — winding error');
  if (D.frontFacing(probe.front, yaw) && D.frontFacing(probe.back, yaw)) fail('front and back both visible');
}
console.log('culling: opposing faces never both visible  OK');

// --- 3. Screen overlap is now permitted; depth sorting resolves it (test 9) ---
const objs = D.objects();
const bboxAt = (o, yaw) => {
  const q = D.boxCorners(o.box).map(p => D.project(p, yaw));
  return { x0: Math.min(...q.map(a=>a[0])), x1: Math.max(...q.map(a=>a[0])),
           y0: Math.min(...q.map(a=>a[1])), y1: Math.max(...q.map(a=>a[1])) };
};
let worst = null;
for (const yaw of sweep(60)) {
  const bs = objs.map(o => ({ id: o.id, b: bboxAt(o, yaw) }));
  for (let a = 0; a < bs.length; a++) for (let c = a + 1; c < bs.length; c++) {
    const A = bs[a].b, B = bs[c].b;
    const ox = Math.min(A.x1,B.x1) - Math.max(A.x0,B.x0);
    const oy = Math.min(A.y1,B.y1) - Math.max(A.y0,B.y0);
    if (ox > 0 && oy > 0 && (!worst || ox > worst.ox))
      worst = { ox, pair: bs[a].id+'/'+bs[c].id, deg: yaw*180/Math.PI };
  }
}
console.log('layout: max screen overlap ' + (worst ? worst.ox.toFixed(0)+'px ('+worst.pair+')' : 'none') + ' — resolved by depth sort  OK');

// --- 4. Nothing clips, and the scene clears both callout columns ---
const pts = D.allPoints();
let mnX=1e9,mxX=-1e9,mnY=1e9,mxY=-1e9;
for (const yaw of sweep(120)) for (const p of pts) {
  const q = D.project(p, yaw);
  mnX=Math.min(mnX,q[0]); mxX=Math.max(mxX,q[0]);
  mnY=Math.min(mnY,q[1]); mxY=Math.max(mxY,q[1]);
}
console.log(`bbox across sweep: x ${mnX.toFixed(0)}..${mxX.toFixed(0)}  y ${mnY.toFixed(0)}..${mxY.toFixed(0)}  (viewBox ${D.VB.w}x${D.VB.h})`);
if (mnX < 262) fail(`scene reaches x=${mnX.toFixed(0)}, into the left callout column`);
if (mxX > D.VB.w - 262) fail(`scene reaches x=${mxX.toFixed(0)}, into the right callout column`);
if (mnY < 6 || mxY > D.VB.h - 6) fail(`scene clips vertically (${mnY.toFixed(0)}..${mxY.toFixed(0)})`);
if (!bad) console.log('clipping: scene fits the frame and clears both callout columns  OK');

// --- 5. Racks inside their OWN shell, and facing that shell's opening ---
//        Each rack is tagged with its container; checking them all against one
//        global container was the old single-container assumption.
let esc = 0;
for (const r of D.RACKS) {
  const K = r.cont;
  if (!K) { fail('a rack is not tagged with its container'); break; }
  if (r.x - r.w/2 < K.x - K.w/2 || r.x + r.w/2 > K.x + K.w/2) esc++;
  if (r.z - r.d/2 < K.z - K.d/2 || r.z + r.d/2 > K.z + K.d/2) esc++;
  if (r.y < 0 || r.y + r.h > K.h) esc++;
}
if (esc) fail(`${esc} rack dimensions escape their own container`);
// Machines sit toward each container's far wall, so its cutaway looks at their faces.
if (!D.RACKS.every(r => r.z < r.cont.z)) fail('racks are not against their far wall');
const perCont = D.CONTAINERS.map(K => D.RACKS.filter(r => r.cont === K).length);
if (new Set(perCont).size !== 1) fail(`uneven racks per container: ${perCont.join('/')}`);
/* FOUR, not two: the yard is a 2x2 of hydro containers, 4 x 240 slots at 5,925 W each.
   Still asserted rather than derived from D, because a scene that silently lost a container
   would otherwise surface only as a fixture diff and read as an intentional re-baseline. */
if (D.CONTAINERS.length !== 4) fail(`expected 4 containers, got ${D.CONTAINERS.length}`);
console.log(`racks: ${D.RACKS.length} units across ${D.CONTAINERS.length} containers ` +
            `(${perCont.join('+')}), each inside its own shell  OK`);

// --- 6. Every slot layer is well formed at every angle ---
const KEYS = ['inside','asics','inner','end','side','top','detail'];
for (const yaw of sweep(24)) {
  const f = D.frame(yaw, null);
  if (f.slots.length !== D.SLOTS) { fail('slot count changed'); break; }
  for (const L of f.slots) for (const k of KEYS) {
    if (typeof L[k] !== 'string') { fail(`slot ${L.id}.${k} is not a string`); break; }
    if (/NaN|undefined|Infinity/.test(L[k])) { fail(`slot ${L.id}.${k} has NaN at ${(yaw*180/Math.PI).toFixed(0)}deg`); break; }
  }
  if (/NaN|undefined/.test(f.flow)) fail('flow has NaN');
}
{
  const f0 = D.frame(0, null);
  /* The anchor container the callouts point into. Was 'contB' — a name that stopped
     existing when the yard went to cont0..cont3, and .inside would have thrown on
     undefined rather than reporting anything useful. */
  const cont = f0.slots.find(s => s.id === D.ANCHOR_SLOT);
  if (!cont) fail('no slot matches ANCHOR_SLOT ' + D.ANCHOR_SLOT);
  if (!cont.inside.length) fail('container interior is empty');
  if (!cont.asics.length) fail('no ASIC geometry');
  if (!cont.top.length) fail('container roof is empty');
  const total = f0.slots.reduce((a, s) => a + KEYS.reduce((b, k) => b + s[k].length, 0), 0);
  console.log(`frame: ${total}b of path data across ${D.SLOTS} slots; container inside ${cont.inside.length}b, asics ${cont.asics.length}b, detail ${cont.detail.length}b  OK`);
}

// --- 7. Leaders welded to anchors ---
let drift = 0;
for (const yaw of sweep(12)) for (const L of D.frame(yaw, null).leaders) {
  const co = D.CALLOUTS.find(c => c.id === L.id);
  const a = D.calloutAnchor(co, yaw);
  if (Math.abs(L.x2-a[0]) > 0.06 || Math.abs(L.y2-a[1]) > 0.06) drift++;
}
if (drift) fail(`${drift} leader endpoints drifted off their anchor`);
else console.log(`leaders: ${D.CALLOUTS.length} welded to anchors at 13 angles  OK`);

// --- 8. The idle motion is one continuous revolution ---
{
  let prev = D.yawAt(0), wraps = 0, backwards = 0, mx = 0;
  for (let t = 50; t <= D.PERIOD; t += 50) {
    const y = D.yawAt(t);
    mx = Math.max(mx, y);
    if (y < prev - 1e-9) { wraps++; }          // the single wrap at the seam
    else if (y < prev) backwards++;
    prev = y;
  }
  if (backwards) fail('yawAt is not monotonic within a revolution');
  if (wraps !== 1) fail(`yawAt wraps ${wraps} times per PERIOD, want exactly 1`);
  if (Math.abs(mx - Math.PI * 2) > 0.01) fail(`yawAt peaks at ${mx}, want a full turn`);
  if (Math.abs(D.yawAt(0)) > 1e-9) fail('a revolution must start at yaw 0');
  console.log(`rotation: one continuous 360 turn every ${(D.PERIOD/1000).toFixed(0)}s  OK`);
}


// --- 9. Depth sorting: slots come back-to-front, and the order really changes ---
{
  const anchor = Object.fromEntries(D.RENDER_ANCHORS.map(a => [a.id, a.at]));
  const orders = new Set();
  for (const yaw of sweep(60)) {
    const ids = D.frame(yaw, null).slots.map(s => s.id);
    orders.add(ids.join('>'));
    for (let i = 1; i < ids.length; i++) {
      const dp = D.depthOf(anchor[ids[i-1]], yaw);
      const dc = D.depthOf(anchor[ids[i]], yaw);
      if (dp > dc + 1e-9)
        fail(`slot order not back-to-front at ${(yaw*180/Math.PI).toFixed(0)}deg: ${ids.join('>')}`);
    }
  }
  if (orders.size < 2) fail('slot order never changes — the sort is inert');
  /* The ground is a flat backdrop whose anchor is pinned on the pivot, 40 m
     down, precisely so its depth beats every plant anchor at every yaw (the
     gas skid bottoms out at -15.6; the ground sits at -17.5). If a plant
     anchor ever dips beneath it, the sort would still be back-to-front — the
     check above cannot notice — it would just paint gravel over the plant.
     So the invariant is stated directly: ground first, at all 72 yaws. */
  let groundFirstBad = 0;
  for (const yaw of sweep(72)) {
    const first = D.frame(yaw, null).slots[0].id;
    if (first !== 'ground' && !groundFirstBad++)
      fail(`ground is not the back-most slot at ${(yaw*180/Math.PI).toFixed(0)}deg — '${first}' paints under it`);
  }
  if (!groundFirstBad) console.log('depth sort: the ground slot paints first at all 72 yaws  OK');
  console.log(`depth sort: ${D.SLOTS} slots, ${orders.size} distinct orders across the sweep, always back-to-front  OK`);
}

// --- 10. index.html's baked frame matches the scene it was baked from ---
/* TWO WAYS THE HOME PAGE CAN SHIP A LIE, NEITHER OF WHICH ANYTHING CHECKED.

   THE SLOT GROUPS. build-diagram.js bakes a static SVG into the page with one <g> per
   renderable, and diagram-engine.js looks every one of them up by id at mount:
   `g[LAYERS[li]] = byId('dg-s' + s + '-' + LAYERS[li]); if (!g[...]) ok = false;`. Add a
   container to the scene without re-running the generator and the lookup fails, mounting
   is abandoned, and the page quietly serves the OLD baked drawing for ever. It does not
   throw and it does not look broken — it looks out of date, which is exactly how the
   hosting page shipped an air-cooled container after the switch to hydro.

   THE COUNT IN THE ALT TEXT. landfill-copy-suite.js already derives the container count
   from scene.objects() and checks energy.html's alt against it — but it never reads
   index.html, so the home page was the one drawing whose alt could say "two shipping
   containers" over a picture of four with nothing to catch it. Same derivation, same
   guarantee, applied to the page that was missing it. */
{
  const fs = require('fs');
  const html = fs.readFileSync(REPO_ROOT + 'site/index.html', 'utf8');

  const groups = new Set((html.match(/id="dg-s(\d+)-/g) || []).map(m => m.match(/\d+/)[0]));
  if (groups.size !== D.SLOTS)
    fail(`index.html bakes ${groups.size} slot groups but the scene has ${D.SLOTS} renderables — ` +
         `run tools/build-diagram.js, or the diagram will not mount and the page will serve the stale frame`);

  const WORD = { 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six' };
  const boxes = D.objects().filter(o => /^cont/.test(o.id)).length;
  const alt = (html.match(/aria-label="([^"]*containerised[^"]*)"/) || [])[1] || '';
  if (!alt) fail('index.html has no aria-label on the site diagram');
  else if (alt.indexOf(WORD[boxes] + ' shipping container') < 0)
    fail(`index.html alt says "${(alt.match(/(one|two|three|four|five|six) shipping containers?/) ||
          ['no count'])[0]}" but the scene draws ${boxes}`);

  if (!bad)
    console.log(`page: ${groups.size} baked slot groups match ${D.SLOTS} renderables, ` +
                `and the alt text says "${WORD[boxes]}"  OK`);
}

process.exitCode = bad;
console.log(bad ? 'FAILED' : 'ALL OK');
