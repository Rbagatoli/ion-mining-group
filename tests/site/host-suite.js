/* Full suite for the hosting scene. Same invariants as the home page suite,
   expressed for a single-object scene. */
/* Repo-relative, so this runs wherever the checkout is. Was an absolute
   c:/Users/rbaga/... path that worked on one machine. */
const REPO_ROOT = require('path').join(__dirname, '..', '..').replace(/\\/g, '/') + '/';
const fs = require('fs'), vm = require('vm');
const D = require(REPO_ROOT + 'site/scene-hosting.js');
const SITE = require(REPO_ROOT + 'site/scene-site.js');
const html = fs.readFileSync(REPO_ROOT + 'site/hosting.html', 'utf8');
let bad = 0;
const fail = m => { console.error('FAIL: ' + m); bad = 1; };
const sweep = n => Array.from({ length: n + 1 }, (_, i) => Math.PI * 2 * (i / n));

function subpathAreas(d) {
  return d.split('M').filter(Boolean).map(sp => {
    const nums = sp.match(/-?\d+(\.\d+)?/g).map(Number);
    const pts = [];
    for (let i = 0; i < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a;
  });
}

// --- 1. Depth direction ---
{
  const near = Math.abs(D.project([1,1,1],0)[0] - D.project([-1,1,1],0)[0]);
  const far  = Math.abs(D.project([1,1,-1],0)[0] - D.project([-1,1,-1],0)[0]);
  if (!(near > far)) fail('+Z is not the near side — scene renders inside-out');
  else console.log('depth: +Z is the near side  OK');
}

// --- 2. Culling invariant ---
{
  const probe = D.boxFaces({ x: 0, y: 0, z: 0, w: 2, h: 2, d: 2 });
  let lo = 9, hi = 0;
  for (const yaw of sweep(80)) {
    let v = 0;
    for (const k of Object.keys(probe)) if (D.frontFacing(probe[k], yaw)) v++;
    lo = Math.min(lo, v); hi = Math.max(hi, v);
  }
  if (lo < 2 || hi > 3) fail(`visible faces per box ${lo}..${hi}, want 2..3`);
  else console.log(`culling: ${lo}..${hi} faces per box across the sweep  OK`);
  for (const yaw of sweep(40)) {
    if (D.frontFacing(probe.top, yaw) === D.frontFacing(probe.bot, yaw)) fail('top/bot agree — winding error');
    if (D.frontFacing(probe.front, yaw) && D.frontFacing(probe.back, yaw)) fail('front and back both visible');
  }
}

// --- 3. Nothing clips, and the scene clears both callout columns ---
{
  const pts = D.allPoints();
  let mnX=1e9,mxX=-1e9,mnY=1e9,mxY=-1e9;
  for (const yaw of sweep(120)) for (const p of pts) {
    const q = D.project(p, yaw);
    mnX=Math.min(mnX,q[0]); mxX=Math.max(mxX,q[0]);
    mnY=Math.min(mnY,q[1]); mxY=Math.max(mxY,q[1]);
  }
  console.log(`bbox: x ${mnX.toFixed(0)}..${mxX.toFixed(0)}  y ${mnY.toFixed(0)}..${mxY.toFixed(0)}  (viewBox ${D.VB.w}x${D.VB.h})`);
  if (mnX < 262) fail(`scene reaches x=${mnX.toFixed(0)}, into the left callout column`);
  if (mxX > D.VB.w - 262) fail(`scene reaches x=${mxX.toFixed(0)}, into the right callout column`);
  if (mnY < 6 || mxY > D.VB.h - 6) fail(`scene clips vertically (${mnY.toFixed(0)}..${mxY.toFixed(0)})`);
  else console.log('clipping: fits the frame and clears both callout columns  OK');
}

// --- 4. Machines inside the shell, against the far wall ---
{
  const C = D.MODEL.container;
  let esc = 0;
  for (const r of D.RACKS) {
    if (r.x - r.w/2 < C.x - C.w/2 || r.x + r.w/2 > C.x + C.w/2) esc++;
    if (r.z - r.d/2 < C.z - C.d/2 || r.z + r.d/2 > C.z + C.d/2) esc++;
    if (r.y < 0 || r.y + r.h > C.h) esc++;
  }
  if (esc) fail(`${esc} rack dimensions escape the container`);
  if (!D.RACKS.every(r => r.z < C.z)) fail('racks are not against the far wall');
  console.log(`racks: ${D.RACKS.length} units inside the shell, against the far wall  OK`);
}

// --- 5. THE POINT OF THIS DIAGRAM: machines materially bigger than the home page ---
{
  const widthOf = M => {
    const u = M.RACKS[0];
    const a = M.project([u.x - u.w/2, u.y + u.h/2, u.z + u.d/2], 0);
    const b = M.project([u.x + u.w/2, u.y + u.h/2, u.z + u.d/2], 0);
    return Math.abs(b[0] - a[0]);
  };
  const hw = widthOf(D), sw = widthOf(SITE);
  if (hw / sw < 1.7) fail(`ASICs only ${(hw/sw).toFixed(2)}x the home page size — the whole point was legibility`);
  else console.log(`scale: ASIC ${hw.toFixed(0)}px vs ${sw.toFixed(0)}px on the home page (${(hw/sw).toFixed(2)}x)  OK`);
}

// --- 6. Frames well formed at every angle ---
{
  for (const yaw of sweep(24)) {
    const f = D.frame(yaw, null);
    if (f.slots.length !== D.SLOTS) { fail('slot count changed'); break; }
    for (const L of f.slots) for (const k of D.LAYERS) {
      if (typeof L[k] !== 'string') { fail(`${L.id}.${k} not a string`); break; }
      if (/NaN|undefined|Infinity/.test(L[k])) { fail(`${L.id}.${k} has NaN`); break; }
    }
    if (/NaN|undefined/.test(f.flow)) fail('flow has NaN');
  }
  const f0 = D.frame(0, null), cont = f0.slots[0];
  if (!cont.inside.length) fail('container interior is empty');
  if (!cont.asics.length) fail('no ASIC geometry');
  if (!cont.top.length) fail('roof is empty');
  const total = f0.slots.reduce((a,s) => a + D.LAYERS.reduce((b,k) => b + s[k].length, 0), 0);
  console.log(`frame: ${total}b of path data; inside ${cont.inside.length}b, asics ${cont.asics.length}b, detail ${cont.detail.length}b  OK`);
}

// --- 7. Interior winding consistent (or nonzero fill punches a hole) ---
{
  let mixed = null, checked = 0;
  for (const yaw of sweep(72)) for (const slot of D.frame(yaw, null).slots) {
    if (!slot.inside) continue;
    checked++;
    if (new Set(subpathAreas(slot.inside).map(a => (a < 0 ? '-' : '+'))).size !== 1)
      mixed = (yaw * 180 / Math.PI).toFixed(1);
  }
  if (!checked) fail('no interior geometry produced');
  if (mixed !== null) fail(`interior winding mixed at ${mixed}deg — fill-rule:nonzero will cancel`);
  else console.log(`interior: ${checked} sets share one screen winding  OK`);
}

// --- 8. Leaders welded to anchors, and terminating on drawn geometry ---
{
  let drift = 0;
  for (const yaw of sweep(12)) for (const L of D.frame(yaw, null).leaders) {
    const co = D.CALLOUTS.find(c => c.id === L.id);
    const a = D.calloutAnchor(co, yaw);
    if (Math.abs(L.x2-a[0]) > 0.06 || Math.abs(L.y2-a[1]) > 0.06) drift++;
  }
  if (drift) fail(`${drift} leader endpoints drifted off their anchor`);

  // Distance to the nearest drawn SEGMENT, not the nearest vertex. A louvre or
  // a rib is a long line with vertices only at its ends; an anchor sitting
  // mid-way along one is on drawn geometry, and a vertex-only metric reports it
  // as floating in space.
  const segs = yaw => {
    const L = D.frame(yaw, null).slots[0], out = [];
    for (const k of D.LAYERS) {
      for (const sp of L[k].split('M')) {
        if (!sp) continue;
        const nums = (sp.match(/-?\d+(\.\d+)?/g) || []).map(Number);
        const pts = [];
        for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i+1]]);
        for (let i = 1; i < pts.length; i++) out.push([pts[i-1], pts[i]]);
        if (sp.indexOf('Z') >= 0 && pts.length > 2) out.push([pts[pts.length-1], pts[0]]);
      }
    }
    return out;
  };
  const distToSeg = (p, a, b) => {
    const vx = b[0]-a[0], vy = b[1]-a[1];
    const len2 = vx*vx + vy*vy;
    let t = len2 ? ((p[0]-a[0])*vx + (p[1]-a[1])*vy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0]+t*vx), p[1] - (a[1]+t*vy));
  };
  let worst = 0, worstId = '';
  for (const yaw of [0, Math.PI / 2, Math.PI, Math.PI * 3 / 2]) {
    const S = segs(yaw);
    for (const co of D.CALLOUTS) {
      const tip = D.calloutAnchor(co, yaw);
      let best = 1e9;
      for (const [a, b] of S) best = Math.min(best, distToSeg(tip, a, b));
      if (best > worst) { worst = best; worstId = co.id; }
    }
  }
  if (worst > 18) fail(`leader "${worstId}" ends ${worst.toFixed(0)}px from any drawn vertex`);
  else console.log(`leaders: ${D.CALLOUTS.length} welded, worst tip-to-geometry gap ${worst.toFixed(0)}px (${worstId})  OK`);
}

// --- 9. Regions: geometry, highlight, and hit shapes sorted largest-first ---
{
  for (const c of D.CALLOUTS) {
    if (!D.regionBoxes(c.id).length) fail(`region "${c.id}" has no boxes`);
    const h = D.regionHit(c.id, 0);
    if (!h.d || /NaN/.test(h.d)) fail(`region "${c.id}" hit shape invalid`);
    if (h.area < 100) fail(`region "${c.id}" hit area only ${h.area.toFixed(0)}px2`);
    const hl = D.frame(0, c.id).highlight;
    if (!hl || /NaN/.test(hl)) fail(`region "${c.id}" highlight missing or NaN`);
  }
  for (const yaw of [0, Math.PI / 2, Math.PI, Math.PI * 3 / 2]) {
    const hits = D.frame(yaw, null).hits;
    if (hits.length !== D.CALLOUTS.length) fail('wrong hit count');
    for (let i = 1; i < hits.length; i++)
      if (hits[i].area > hits[i-1].area + 1e-6) fail('hit shapes not sorted by descending area');
  }
  if (D.frame(0, null).highlight !== '') fail('highlight non-empty with no hover');
  console.log(`regions: all ${D.CALLOUTS.length} hittable and highlightable, sorted smallest-on-top  OK`);
}

// --- 10. No NaN anywhere in the view envelope ---
{
  for (const z of [D.ZOOM_MIN, 1, D.ZOOM_MAX])
    for (const pi of [D.PITCH_MIN, 0.4, D.PITCH_MAX]) {
      D.setView({ zoom: z, pitch: pi });
      for (const yaw of [-Math.PI, 0, Math.PI]) {
        const f = D.frame(yaw, 'asics');
        for (const L of f.slots) for (const k of D.LAYERS)
          if (/NaN|Infinity/.test(L[k])) fail(`NaN at zoom ${z} pitch ${pi.toFixed(2)}`);
        if (/NaN|Infinity/.test(f.highlight) || /NaN|Infinity/.test(f.flow)) fail('NaN in highlight/flow');
      }
    }
  D.resetView();
  console.log('view: whole zoom/pitch envelope finite, including a full 360 yaw  OK');
}

// --- 11. Bubbles do not collide ---
{
  for (const [label, wrapW] of [['1144px', 1144], ['845px', 845]]) {
    const inner = wrapW * 0.172 - 26;
    const box = co => 21 + Math.ceil(co.desc.length * 6.0 / inner) * 17 + 22;
    for (const side of ['l', 'r']) {
      const col = D.CALLOUTS.filter(c => c.side === side).sort((a,b) => a.y - b.y);
      for (let i = 0; i < col.length; i++) {
        const h = box(col[i]), top = col[i].y - h/2, bot = col[i].y + h/2;
        if (top < 0) fail(`${label}: "${col[i].id}" overflows the top`);
        if (bot > D.VB.h) fail(`${label}: "${col[i].id}" overflows the bottom`);
        if (i && top < col[i-1].y + box(col[i-1])/2)
          fail(`${label}: "${col[i-1].id}" and "${col[i].id}" overlap`);
      }
    }
  }
  console.log('bubbles: no collisions or overflow at 1144px or 845px  OK');
}

// --- 12. Static frame in hosting.html equals the runtime ---
{
  const attrAfter = (s, marker, attr) => {
    const i = s.indexOf(marker); if (i < 0) return null;
    const j = s.indexOf(' ' + attr + '="', i); if (j < 0) return null;
    const k = j + attr.length + 3, e = s.indexOf('"', k);
    return e < 0 ? null : s.slice(k, e);
  };
  const f0 = D.frame(0, null);
  let n = 0;
  f0.slots.forEach((L, i) => D.LAYERS.forEach(k => {
    const got = attrAfter(html, `id="dg-s${i}-${k}"`, 'd');
    if (got === null) return fail(`#dg-s${i}-${k} missing from hosting.html`);
    if (got !== L[k]) fail(`#dg-s${i}-${k} differs from runtime`);
    n++;
  }));
  f0.hits.forEach((h, i) => {
    if (attrAfter(html, `id="dg-hit${i}"`, 'd') !== h.d) fail(`#dg-hit${i} differs`);
    if (attrAfter(html, `id="dg-hit${i}"`, 'data-region') !== h.id) fail(`#dg-hit${i} wrong region`);
  });
  /* The flow arrowheads too. They are derived in the engine from the flow path,
     and the bake reads them off the same frame() — but a generator that quietly
     stopped emitting the element, or baked it from a different frame, would
     ship a page whose arrows disagree with the runtime's the moment JS mounts.
     Same byte parity as the slot layers, against the same static frame. */
  const heads = attrAfter(html, 'id="dg-flow-heads"', 'd');
  if (heads === null) fail('#dg-flow-heads missing from hosting.html — run tools/build-diagram.js');
  else if (heads !== f0.flowHeads) fail('#dg-flow-heads differs from runtime');
  for (const c of D.CALLOUTS) {
    if (!html.includes('>' + c.title + '<')) fail(`title missing from markup: ${c.title}`);
    if (!html.includes(`data-region="${c.id}"`)) fail(`no element tagged data-region="${c.id}"`);
  }
  if (!bad) console.log(`parity: ${n} slot layers + ${f0.hits.length} hit shapes match runtime exactly  OK`);
}

// --- 13. The browser build mounts and responds ---
{
  /* THE SANDBOX LOADS WHAT THE PAGE LOADS, IN THE PAGE'S ORDER.

     This used to read two hardcoded files, engine + scene, and that is precisely how the
     figure shipped broken. scene-hosting.js started reading KIT.COOLER so its roof cooler
     could not drift from site-kit.js's; hosting.html was never given a site-kit.js tag; and
     this check could not see the difference, because its sandbox was not the page. The
     module threw on load in a real browser and the page fell back to its baked static frame
     — the old air-cooled drawing — while the suite went green.

     Deriving the list from hosting.html's own tags means the sandbox cannot drift from the
     page again: if a dep is dropped from the page, it is dropped here too and this check
     fails, which is the failure the browser would have had. Only the scripts that the
     diagram chain needs are run — site.js, cart.js and hero-anim.js drive page furniture,
     want a real DOM, and are not what this is testing. */
  const pageScripts = [...html.matchAll(/<script src="\.\/([^"?]+\.js)(?:\?v=[0-9a-f]+)?"><\/script>/g)]
    .map(m => m[1]);
  const NOT_DIAGRAM = new Set(['site.js', 'cart.js', 'hero-anim.js', 'scene-asic.js']);
  const chain = pageScripts.filter(s => !NOT_DIAGRAM.has(s));

  if (chain[0] !== 'diagram-engine.js')
    fail(`hosting.html must load diagram-engine.js before any scene; got ${chain[0]}`);
  if (chain.indexOf('site-kit.js') < 0)
    fail('hosting.html does not load site-kit.js, which scene-hosting.js needs for KIT.COOLER — ' +
         'the scene will throw on load and the page will fall back to its static frame');
  if (chain.indexOf('site-kit.js') > chain.indexOf('scene-hosting.js'))
    fail('hosting.html loads site-kit.js after scene-hosting.js; the scene reads it at module scope');
  if (chain[chain.length - 1] !== 'scene-hosting.js')
    fail(`the diagram chain must end at scene-hosting.js; got ${chain[chain.length - 1]}`);
  const handlers = {};
  let writes = 0;
  const mkEl = id => {
    const cls = new Set(), attrs = {};
    return { id, dataset: {},
      setAttribute: (k, v) => {
        if (/NaN|undefined|Infinity/.test(String(v))) throw new Error(`${id} ${k}=${v}`);
        attrs[k] = v; writes++;
      },
      getAttribute: k => (attrs[k] === undefined ? null : attrs[k]),
      classList: { add: c=>cls.add(c), remove: c=>cls.delete(c), contains: c=>cls.has(c),
                   toggle: (c,on)=>{ on?cls.add(c):cls.delete(c); } },
      addEventListener: (ev, fn) => { (handlers[id] = handlers[id] || {})[ev] = fn; },
      setPointerCapture(){}, releasePointerCapture(){}, hasPointerCapture:()=>false,
      /* The gesture layer asks two questions of an event target: is it the drawing,
         and is it one of the controls. Answering them needs these two. */
      contains(n) { return n === this; },
      closest: () => null,
      querySelector: sel => { const m = sel.match(/data-region="([a-z]+)"/); return m ? mkEl('b-'+m[1]) : null; },
    };
  };
  const els = {}; const get = id => (els[id] = els[id] || mkEl(id));
  let rafQ = [];
  let timers = [], timerId = 0;
  const sb = { console, Math, Object, Array, String, Number, Set,
    /* A REAL addEventListener, because the document is where the lock is
       RELEASED. A no-op here would let the tests prove a figure can be locked and
       never that it can be let go of, which is the half a reader is stuck with. */
    document: { hidden:false, readyState:'complete', getElementById:get,
                querySelector: () => get('wrap'),
                addEventListener: (ev, fn) => {
                  (handlers['document'] = handlers['document'] || {})[ev] = fn;
                } },
    window: { matchMedia: () => ({ matches:false }),
              IntersectionObserver: function(){ return { observe(){} }; } },
    requestAnimationFrame: cb => { rafQ.push(cb); return rafQ.length; },
    cancelAnimationFrame: () => { rafQ = []; },
    // A controllable clock: the engine schedules its resume on this.
    setTimeout: (cb, ms) => { timers.push({ cb, ms, id: ++timerId }); return timerId; },
    clearTimeout: id => { timers = timers.filter(t => t.id !== id); },
  };
  sb.self = sb; sb.IntersectionObserver = sb.window.IntersectionObserver;
  sb.require = () => { throw new Error('scene must use the global engine in browser mode'); };
  vm.createContext(sb);
  for (const s of chain) {
    vm.runInContext(fs.readFileSync(REPO_ROOT + 'site/' + s, 'utf8'), sb, { filename: s });
  }

  const H = handlers['siteDiagram'] || {};
  /* Hover and keyboard belong to the drawing. The pointer gestures moved to the
     WRAPPER, so that a pinch which starts with one finger on a callout bubble is
     still a pinch on the figure rather than two unrelated touches. */
  for (const ev of ['pointerover','pointerout','keydown'])
    if (!H[ev]) fail(`no ${ev} handler bound to the drawing`);
  for (const ev of ['pointerdown','pointermove','pointerup','pointercancel'])
    if (!(handlers['wrap'] || {})[ev]) fail(`no ${ev} handler bound to the figure wrapper`);
  const w0 = writes;
  H.pointerover({ target: { getAttribute: k => (k === 'data-region' ? 'pdu' : null) } });
  if (writes === w0) fail('hover did not repaint');
  const V = sb.ContainerDiagram;
  const W = handlers['wrap'] || {};
  if (!W.wheel) fail('no wheel handler bound to the figure wrapper');
  const z0 = V.getView().zoom;
  let prevented = 0;
  // The pointer has priority now: over the figure, the wheel zooms at once.
  W.wheel({ deltaY:-100, ctrlKey:false, metaKey:false, preventDefault: () => prevented++ });
  if (V.getView().zoom <= z0 || prevented !== 1) fail('wheel did not zoom on hover');
  // But it must never trap the page: at the ceiling it hands the scroll back.
  for (let n = 0; n < 40; n++) W.wheel({ deltaY:-100, ctrlKey:false, metaKey:false, preventDefault: () => prevented++ });
  const pk = prevented;
  W.wheel({ deltaY:-100, ctrlKey:false, metaKey:false, preventDefault: () => prevented++ });
  if (prevented !== pk) fail('at max zoom the wheel still took the event — the page would be trapped');
  V.resetView();

  /* ---- THE GESTURE CONTRACT ----------------------------------------------
   *
   * A touch that lands on the DRAWING is the drawing's, in both axes. A touch
   * that lands anywhere else, the callout cards included, is the page's.
   *
   * These assertions used to encode the opposite - that a vertical swipe on the
   * drawing belonged to the page - and they passed for three deploys while the
   * figure was unusable on a phone. Encoding the old contract faithfully is not
   * the same as the contract being right, which is the only reason to write down
   * what the last three versions were:
   *
   *   touch-action: pan-y      the browser sorts scroll from turn by direction.
   *                            It decides on the first few pixels, so a drag
   *                            meant for the model that starts off-vertical is
   *                            gone before the figure sees it.
   *   tap to arm it            worse. A tap on a real screen drifts, and pan-y
   *                            let the browser cancel the half-formed tap the
   *                            moment it had a vertical component.
   *   the drawing owns it      this. No mode, no direction test, no gate.
   *
   * goManual() is observable through the fake clock: it schedules the resume
   * timer. Rotation is observable through `writes`, because paint() is the only
   * thing that writes attributes and nothing here flushes the animation frame
   * queue. Neither needs the engine to expose anything for the test's benefit. */
  const SVG = get('siteDiagram');
  const touch = (id, x, y) => ({ pointerId: id, pointerType: 'touch', button: 0,
                                 clientX: x, clientY: y, target: SVG,
                                 preventDefault() {} });
  const mouse = (id, x, y) => Object.assign(touch(id, x, y), { pointerType: 'mouse' });
  const paints = () => writes;

  // A finger that has landed and not moved has not turned anything yet.
  timers.length = 0;
  W.pointerdown(touch(1, 100, 100));
  if (timers.length) fail('a touch that has not moved already stopped the idle turn');

  // Vertical, on the drawing: the DRAWING's. This is the case that was broken.
  let w1 = paints();
  W.pointermove(touch(1, 103, 140));
  W.pointermove(touch(1, 103, 180));
  if (paints() === w1) fail('a vertical drag on the drawing did not turn the model');
  if (!timers.length) fail('turning the model did not stop the idle turn');
  W.pointerup(touch(1, 103, 180));

  // Horizontal, on the drawing: also the drawing's.
  W.pointerdown(touch(2, 100, 100));
  w1 = paints();
  W.pointermove(touch(2, 140, 104));
  W.pointermove(touch(2, 180, 104));
  if (paints() === w1) fail('a horizontal drag did not turn the model');
  W.pointerup(touch(2, 180, 104));

  // Under the slop in both axes: a tap, not a drag. The model must not jump.
  W.pointerdown(touch(3, 100, 100));
  w1 = paints();
  W.pointermove(touch(3, 104, 103));
  if (paints() !== w1) fail('a 5px twitch was treated as a drag');
  W.pointerup(touch(3, 104, 103));

  /* THE GUARANTEE THAT DOES NOT DEPEND ON touch-action. A non-passive touchmove
     listener on the drawing that calls preventDefault is the only mechanism that
     has been absolute since touch events existed, and it is what makes this work
     on an engine whose touch-action support is partial. */
  const T = handlers['siteDiagram'] || {};
  if (!T.touchmove) fail('nothing prevents the default on touchmove over the drawing');
  else {
    let prevented = 0;
    T.touchmove({ cancelable: true, preventDefault: () => prevented++ });
    if (!prevented) fail('touchmove over the drawing did not preventDefault the scroll');
  }

  // Two fingers zoom the model. This did nothing at all before: touch-action
  // forbade the browser from zooming and no handler picked it up.
  V.resetView();
  const z1 = V.getView().zoom;
  W.pointerdown(touch(4, 100, 200));
  W.pointerdown(touch(5, 200, 200));       // spread 100
  W.pointermove(touch(5, 300, 200));       // spread 200 -> twice the zoom
  const z2 = V.getView().zoom;
  if (!(z2 > z1)) fail('pinching apart did not zoom the model in');
  W.pointermove(touch(5, 150, 200));       // spread 50 -> half of the original
  if (!(V.getView().zoom < z1)) fail('pinching together did not zoom the model out');

  // Lifting one finger ends the pinch. The one still down must not inherit it
  // and become a rotate, which would snap the model as the hand comes off.
  W.pointerup(touch(5, 150, 200));
  w1 = paints();
  W.pointermove(touch(4, 200, 200));
  if (paints() !== w1) fail('the finger left over from a pinch started rotating');
  W.pointerup(touch(4, 200, 200));

  /* ---- TAP TO LOCK ---------------------------------------------------------
   *
   * A tap makes the figure live: one finger then turns it in BOTH axes, because
   * touch-action: none means there is no scroll left to lose the gesture to.
   * The state is visible through the wrapper's class list, which is also what
   * the stylesheet keys on, so there is nothing exposed here for the test alone. */
  const wrapEl = get('wrap');
  const isLive = () => wrapEl.classList.contains('is-live');

  /* The ring comes on with the first touch, so it is already on here. Released
     the way a reader releases it - a touch somewhere else - rather than by
     reaching in and stripping the class, which would leave the engine still
     believing it owned the figure and make the next assertion pass for the wrong
     reason. It did exactly that on the first attempt. */
  const DOC = handlers['document'] || {};
  const elsewhere = mkEl('somewhere-else');
  if (!DOC.pointerdown) fail('nothing listens on the document for the touch that releases a figure');
  else DOC.pointerdown({ target: elsewhere });
  if (isLive()) fail('a touch outside the figure did not release it');

  // Touching the drawing rings it, with no tap to land and no drift to survive.
  W.pointerdown(touch(10, 100, 100));
  if (!isLive()) fail('touching the drawing did not ring it');
  W.pointerup(touch(10, 102, 101));
  if (!isLive()) fail('lifting the finger un-ringed it');

  // A vertical drag turns the model. This is the case that was broken on a phone.
  V.resetView();
  const p0 = V.getView().pitch;
  W.pointerdown(touch(11, 100, 100));
  /* TWO MOVES. The first one past the slop only sets the drag origin - it is
     placed where the finger is NOW so the eight pixels it spent proving itself
     are not applied as a jump - so it is the second that turns anything. */
  W.pointermove(touch(11, 101, 140));
  W.pointermove(touch(11, 101, 180));
  if (V.getView().pitch === p0) fail('a vertical drag did not turn the model');
  W.pointerup(touch(11, 101, 180));

  /* THE LOCK IS THE RENDERING WINDOW, NOT THE BLOCK. The callout cards sit in
     the same wrapper and are page content: while the drawing is locked they must
     still be a scroll, not a rotation. Targeted at a bubble rather than the svg,
     which is the only difference between the two gestures. */
  W.pointerdown(touch(20, 100, 100));
  W.pointerup(touch(20, 100, 100));
  if (!isLive()) fail('the tap before the callout test did not lock the figure');
  const bubble = mkEl('a-callout');
  const onBubble = (id, x, y) => Object.assign(touch(id, x, y), { target: bubble });
  const wBefore = writes;
  W.pointerdown(onBubble(21, 100, 100));
  W.pointermove(onBubble(21, 101, 150));
  W.pointermove(onBubble(21, 101, 200));
  if (writes !== wBefore)
    fail('a drag on a callout turned the model — the lock is not scoped to the drawing');
  W.pointerup(onBubble(21, 101, 200));
  if (!isLive()) fail('touching a callout released the figure');

  // Escape lets go of it too, for anyone who arrived by keyboard.
  W.pointerdown(touch(14, 100, 100));
  W.pointerup(touch(14, 100, 100));
  if (!isLive()) fail('the tap before the Escape test did not lock the figure');
  if (DOC.keydown) DOC.keydown({ key: 'Escape' });
  else fail('nothing listens for Escape to release a locked figure');
  if (isLive()) fail('Escape did not release the figure');

  // A mouse still gets the model from the first pixel: there is nothing to
  // disambiguate, because a mouse cannot scroll the page by dragging.
  V.resetView();
  W.pointerdown(mouse(6, 100, 100));
  w1 = paints();
  W.pointermove(mouse(6, 108, 100));
  if (paints() === w1) fail('a mouse drag no longer rotates from the first pixel');
  W.pointerup(mouse(6, 108, 100));

  V.resetView();
  console.log(`browser: mounts, ${writes} attribute writes, hover + drag + zoom respond, no NaN  OK`);

  /* ---- 13b. The heads element is OPTIONAL: a stale page must still mount ----
     For exactly one deploy, every baked page lacks #dg-flow-heads (the generator
     adds it; the pages in a visitor's service-worker cache do not have it). If the
     engine treated the missing element as a mount failure, that deploy would
     silently unmount every diagram on the site — the stale-frame failure dg-suite
     test 10 documents, but engine-side.

     The sandbox above CANNOT test this: its getElementById auto-vivifies every id
     it is asked for, so byId('dg-flow-heads') can never come back null there, and
     an adversarial pass proved the suite stays green with the null-guard replaced
     by a bail. This second mount runs the same page-derived script chain against a
     registry that answers null for the heads id specifically — the pre-deploy DOM
     — and demands a working figure anyway. */
  {
    /* This sandbox MIRRORS the one above rather than slimming it. A first draft
       stubbed raf, timers and element querySelector down to no-ops and mounted
       zero attribute writes even WITH the heads element present — a check that
       fails on a healthy engine proves nothing about a broken one. Only get2
       differs: it answers null for the heads id, which is the whole test. */
    const els2 = {}; let writes2 = 0; const handlers2 = {};
    const mk2 = id => {
      const cls = new Set(), attrs = {};
      return { id, dataset: {},
        setAttribute: (k, v) => {
          if (/NaN|undefined|Infinity/.test(String(v))) throw new Error(`${id} ${k}=${v}`);
          attrs[k] = v; writes2++;
        },
        getAttribute: k => (attrs[k] === undefined ? null : attrs[k]),
        classList: { add: c=>cls.add(c), remove: c=>cls.delete(c), contains: c=>cls.has(c),
                     toggle: (c,on)=>{ on?cls.add(c):cls.delete(c); } },
        addEventListener: (ev, fn) => { (handlers2[id] = handlers2[id] || {})[ev] = fn; },
        setPointerCapture(){}, releasePointerCapture(){}, hasPointerCapture:()=>false,
        contains(n) { return n === this; },
        closest: () => null,
        querySelector: sel => { const m = sel.match(/data-region="([a-z]+)"/); return m ? mk2('b2-'+m[1]) : null; },
      };
    };
    const get2 = id => /dg-flow-heads/.test(id) ? null : (els2[id] = els2[id] || mk2(id));
    let rafQ2 = [], timers2 = [], timerId2 = 0;
    const sb2 = { console, Math, Object, Array, String, Number, Set,
      document: { hidden:false, readyState:'complete', getElementById:get2,
                  querySelector: () => get2('wrap'),
                  addEventListener: (ev, fn) => {
                    (handlers2['document'] = handlers2['document'] || {})[ev] = fn;
                  } },
      window: { matchMedia: () => ({ matches:false }),
                IntersectionObserver: function(){ return { observe(){} }; } },
      requestAnimationFrame: cb => { rafQ2.push(cb); return rafQ2.length; },
      cancelAnimationFrame: () => { rafQ2 = []; },
      setTimeout: (cb, ms) => { timers2.push({ cb, ms, id: ++timerId2 }); return timerId2; },
      clearTimeout: id => { timers2 = timers2.filter(t => t.id !== id); },
    };
    sb2.self = sb2; sb2.IntersectionObserver = sb2.window.IntersectionObserver;
    sb2.require = () => { throw new Error('scene must use the global engine in browser mode'); };
    vm.createContext(sb2);
    for (const s of chain) vm.runInContext(fs.readFileSync(REPO_ROOT + 'site/' + s, 'utf8'), sb2, { filename: s });
    const H2 = handlers2['siteDiagram'] || {};
    /* Mount itself writes NOTHING in either sandbox — the first paint rides
       requestAnimationFrame, which no part of this suite flushes; section 13's
       1,100-odd writes all come from the interactions it drives. So the mount
       probe here is the same one: bind, then hover, then count. Measured with
       the guard healthy: heads-present paints 61 attributes on this hover,
       heads-null paints 60 — the one missing write IS the skipped annotation. */
    if (!H2.pointerover)
      fail('with #dg-flow-heads missing the engine bound no hover handler — mount bailed instead of skipping the annotation');
    else {
      const w = writes2;
      H2.pointerover({ target: { getAttribute: k => (k === 'data-region' ? 'pdu' : null) } });
      if (writes2 === w)
        fail('with #dg-flow-heads missing, hover no longer repaints — a stale cached page would show a dead figure for a whole deploy');
    }
    if (!bad) console.log('stale page: mounts and repaints with #dg-flow-heads absent — the heads element is an annotation, not a dependency  OK');
  }
}

process.exitCode = bad;
console.log(bad ? 'FAILED' : 'ALL OK');
