/* Regressions for the three defects the adversarial review confirmed. */
/* Repo-relative, so this runs wherever the checkout is. Was an absolute
   c:/Users/rbaga/... path that worked on one machine. */
const REPO_ROOT = require('path').join(__dirname, '..', '..').replace(/\\/g, '/') + '/';
const D = require(REPO_ROOT + 'site/scene-site.js');
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

// --- 1. Interior subpaths must all wind the same way, or nonzero fill cancels
//        where two overlap and opens a hole in the container. ---
{
  let worst = null, checked = 0;
  for (const yaw of sweep(72)) {
    // Every container, not just one — each has its own set of interior quads.
    for (const slot of D.frame(yaw, null).slots) {
      if (!slot.inside) continue;
      checked++;
      const signs = new Set(subpathAreas(slot.inside).map(a => (a < 0 ? '-' : '+')));
      if (signs.size !== 1) worst = `${slot.id} at ${(yaw * 180 / Math.PI).toFixed(1)}deg`;
    }
  }
  if (!checked) fail('no slot produced interior geometry');
  if (worst !== null) fail(`interior winding is mixed on ${worst} — fill-rule:nonzero will cancel`);
  else console.log(`interior: ${checked} interior sets share one screen winding across the sweep  OK`);
}

// --- 2. No skid pad may contribute a `top` face; buckets cannot express
//        occlusion between two boxes of the same object, and a pad top paints
//        straight across the body standing on it. ---
{
  // A pad top would be a large quad low in the frame. Detect indirectly: the
  // gas and genset objects must have far less `top` area than `side` area,
  // which is only true once the pad tops are gone.
  const f = D.frame(0, null);
  for (const id of ['gas', 'gen']) {
    const L = f.slots.find(s => s.id === id);
    const topA = subpathAreas(L.top).reduce((a, b) => a + Math.abs(b), 0) / 2;
    const sideA = subpathAreas(L.side).reduce((a, b) => a + Math.abs(b), 0) / 2;
    if (topA > sideA) fail(`${id}: top area ${topA.toFixed(0)} exceeds side ${sideA.toFixed(0)} — pad top is probably back`);
  }
  console.log('pads: no full-footprint top face painting over the bodies  OK');
}

// --- 3. Every leader must terminate on something actually drawn. ---
//        Measured point-to-segment against the emitted path edges of the slot
//        region — NOT against bounding-box corners, which an interior anchor
//        (a stack head, a bushing) is legitimately far from.
{
  const slotOf = { gas: 'gas', gen: 'gen', xfmr: 'xfmr' };   // rest live on a container
  // Distance from a point to a line SEGMENT, not to its endpoints: a leader
  // landing mid-edge is on the drawing.
  const segDist = (p, a, b) => {
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const L2 = vx * vx + vy * vy;
    let t = L2 > 0 ? ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(a[0] + t * vx - p[0], a[1] + t * vy - p[1]);
  };
  // Parse a path into subpaths so segments are not invented across an M.
  const segmentsOf = (slotId, yaw) => {
    const L = D.frame(yaw, null).slots.find(s => s.id === slotId);
    const segs = [];
    for (const k of D.LAYERS) {
      const d = L[k];
      if (!d) continue;
      let sub = [], start = null;
      const tok = d.match(/[MLZ]|-?\d+(?:\.\d+)?/g) || [];
      let i = 0, pending = null;
      while (i < tok.length) {
        const t = tok[i];
        if (t === 'M' || t === 'L') { pending = t; i++; continue; }
        if (t === 'Z') {
          if (sub.length > 1 && start) sub.push(start);
          for (let j = 0; j + 1 < sub.length; j++) segs.push([sub[j], sub[j + 1]]);
          sub = []; start = null; pending = null; i++; continue;
        }
        const pt = [Number(tok[i]), Number(tok[i + 1])];
        i += 2;
        if (pending === 'M') {
          for (let j = 0; j + 1 < sub.length; j++) segs.push([sub[j], sub[j + 1]]);
          sub = [pt]; start = pt;
        } else {
          sub.push(pt);
        }
      }
      for (let j = 0; j + 1 < sub.length; j++) segs.push([sub[j], sub[j + 1]]);
    }
    return segs;
  };
  let worstGap = 0, worstId = '';
  for (const yaw of [0, Math.PI / 2, Math.PI, Math.PI * 3 / 2]) {
    const cache = {};
    for (const co of D.CALLOUTS) {
      const sid = slotOf[co.id] || 'contB';
      if (!cache[sid]) cache[sid] = segmentsOf(sid, yaw);
      const tip = D.calloutAnchor(co, yaw);
      let best = 1e9;
      for (const g of cache[sid]) best = Math.min(best, segDist(tip, g[0], g[1]));
      if (best > worstGap) { worstGap = best; worstId = co.id; }
    }
  }
  if (worstGap > 18) fail(`leader "${worstId}" ends ${worstGap.toFixed(0)}px from any drawn edge — pointing at blank panel`);
  else console.log(`leaders: worst tip-to-drawn-geometry gap ${worstGap.toFixed(0)}px (${worstId})  OK`);
}


// --- 4. Bubbles must not collide vertically, at the widest and narrowest
//        widths the diagram is actually shown at (it is hidden below 900px). ---
{
  for (const [label, wrapW] of [['1144px', 1144], ['845px', 845]]) {
    const inner = wrapW * 0.172 - 26;
    const perChar = 6.0, lineH = 17, titleH = 21, padV = 22;
    const box = co => titleH + Math.ceil(co.desc.length * perChar / inner) * lineH + padV;
    for (const side of ['l', 'r']) {
      const col = D.CALLOUTS.filter(c => c.side === side).sort((a, b) => a.y - b.y);
      for (let i = 0; i < col.length; i++) {
        const h = box(col[i]);
        const top = col[i].y - h / 2, bot = col[i].y + h / 2;
        if (top < 0) fail(`${label}: bubble "${col[i].id}" overflows the top (${top.toFixed(0)})`);
        if (bot > D.VB.h) fail(`${label}: bubble "${col[i].id}" overflows the bottom (${bot.toFixed(0)})`);
        if (i) {
          const prevBot = col[i-1].y + box(col[i-1]) / 2;
          if (top < prevBot) fail(`${label}: "${col[i-1].id}" and "${col[i].id}" overlap by ${(prevBot-top).toFixed(0)}px`);
        }
      }
    }
  }
  console.log('bubbles: no vertical collisions or frame overflow at 1144px or 845px  OK');
}

process.exitCode = bad;
console.log(bad ? 'FAILED' : 'ALL OK');
