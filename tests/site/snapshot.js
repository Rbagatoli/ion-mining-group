/* Byte-exact baselines of every scene's output, so any later change to the
   engine or to a scene has to be deliberate. Run with `capture` to re-baseline,
   `verify` to check. `capture` and `verify` take an optional scene key to work
   on one scene: `node snapshot.js capture pad-ion`.

   Re-baselined when the idle motion became a full revolution: the framing was
   refitted to the 360 envelope, and three container callout anchors were fixed
   (they used a bare z, which means the world centreline rather than the middle
   of a container that sits at z 1.4). Both are intentional, so the old fixture
   could not be kept.

   Re-baselined again when the engine gained a 'flame' layer for the energy
   page's lit flare. Additive only, and checked before recapturing: all 280
   path strings on this scene came back byte-identical and every flame path
   here is empty, because nothing on the home scene is on fire. The fixture
   moved solely because LAYERS is part of it.

   The sampled angles go right round, because that is what the diagram does —
   culling, interior winding and depth sorting all have to hold there.

   Widened from one scene to five. It had only ever baselined the home page's
   mine, which left the two energy scenes, the hosting container and the ASIC
   unguarded — and those are the newest and most-edited geometry in the project.
   A mutation test made the gap concrete: reversing the tank quad winding, the
   bug that made the tanks draw their own back walls, was caught by no suite in
   this project and by this snapshot least of all, since it never looked. The
   home fixture keeps its original filename so its existing baseline stays
   valid and still proves the home scene did not move. */
/* Repo-relative, so this runs wherever the checkout is. Was an absolute
   c:/Users/rbaga/... path that worked on one machine. */
const REPO_ROOT = require('path').join(__dirname, '..', '..').replace(/\\/g, '/') + '/';
const fs = require('fs');
const path = require('path');
const DIR = REPO_ROOT + 'site/';

/* The home fixture keeps its historical name; the rest are named by key. */
const SCENES = [
  { key: 'site',    file: 'scene-site.js',    fixture: 'site-scene-fixture.json' },
  { key: 'hosting', file: 'scene-hosting.js', fixture: 'scene-hosting-fixture.json' },
  { key: 'asic',    file: 'scene-asic.js',    fixture: 'scene-asic-fixture.json' },
  { key: 'pad-now', file: 'scene-pad-now.js', fixture: 'scene-pad-now-fixture.json' },
  { key: 'pad-ion', file: 'scene-pad-ion.js', fixture: 'scene-pad-ion-fixture.json' },
  /* The landfill pair. Same job as the pad pair on the same page, behind the
     fuel switch — and the reason the pad fixtures above matter more than they
     used to: they are now the proof that adding a second fuel moved nothing in
     the first one. */
  { key: 'lf-now',  file: 'scene-landfill-now.js', fixture: 'scene-landfill-now-fixture.json' },
  { key: 'lf-ion',  file: 'scene-landfill-ion.js', fixture: 'scene-landfill-ion-fixture.json' },
];

function load(file) {
  const p = DIR + file;
  delete require.cache[require.resolve(p)];
  return require(p);
}

function snap(D) {
  const yaws = Array.from({ length: 8 }, (_, i) => i * Math.PI * 2 / 8);
  const out = { layers: D.LAYERS, slots: D.SLOTS, callouts: D.CALLOUTS.length, frames: {} };
  for (const y of yaws) {
    const f = D.frame(y, null);
    out.frames[y.toFixed(6)] = {
      slots: f.slots.map(s => {
        const o = { id: s.id };
        for (const k of D.LAYERS) o[k] = s[k];
        return o;
      }),
      hits: f.hits.map(h => ({ id: h.id, d: h.d, area: Math.round(h.area * 1000) })),
      leaders: f.leaders,
      flow: f.flow,
    };
  }
  // A highlight for every region too, since regionBoxes moves in the refactor.
  out.highlights = {};
  for (const c of D.CALLOUTS) out.highlights[c.id] = D.frame(0, c.id).highlight;
  return out;
}

/* Returns [comparisons, failures]. Failures are printed as they are found. */
function check(key, want, got) {
  let bad = 0, cmp = 0;
  const fail = m => { console.error('  FAIL [' + key + '] ' + m); bad++; };

  if (JSON.stringify(want.layers) !== JSON.stringify(got.layers)) fail('LAYERS changed');
  if (want.slots !== got.slots) fail(`slot count ${got.slots}, was ${want.slots}`);
  if (want.callouts !== got.callouts) fail(`callout count ${got.callouts}, was ${want.callouts}`);

  for (const y of Object.keys(want.frames)) {
    const a = want.frames[y], b = got.frames[y];
    if (!b) { fail(`frame ${y} missing`); continue; }
    if (a.flow !== b.flow) fail(`flow differs at yaw ${y}`);
    a.slots.forEach((sa, i) => {
      const sb = b.slots[i];
      if (!sb) return fail(`slot ${i} missing at yaw ${y}`);
      if (sa.id !== sb.id) fail(`slot ${i} id "${sb.id}", was "${sa.id}" at yaw ${y}`);
      for (const k of want.layers) {
        if (sa[k] !== sb[k]) fail(`slot ${sa.id}.${k} differs at yaw ${y}`);
        cmp++;
      }
    });
    a.hits.forEach((ha, i) => {
      const hb = b.hits[i];
      if (!hb) return fail(`hit ${i} missing at yaw ${y}`);
      if (ha.id !== hb.id || ha.d !== hb.d || ha.area !== hb.area) fail(`hit ${ha.id} differs at yaw ${y}`);
      cmp++;
    });
    a.leaders.forEach((la, i) => {
      const lb = b.leaders[i];
      if (JSON.stringify(la) !== JSON.stringify(lb)) fail(`leader ${la.id} differs at yaw ${y}`);
      cmp++;
    });
  }
  for (const id of Object.keys(want.highlights)) {
    if (want.highlights[id] !== got.highlights[id]) fail(`highlight "${id}" differs`);
    cmp++;
  }
  return [cmp, bad];
}

const mode = process.argv[2];
const only = process.argv[3];
const targets = only ? SCENES.filter(s => s.key === only) : SCENES;
if (!targets.length) {
  console.error('unknown scene "' + only + '"; known: ' + SCENES.map(s => s.key).join(', '));
  process.exit(2);
}

if (mode === 'capture') {
  for (const s of targets) {
    const out = path.join(__dirname, s.fixture);
    const n = snap(load(s.file));
    fs.writeFileSync(out, JSON.stringify(n, null, 1));
    console.log(`  captured ${s.key.padEnd(8)} ${Object.keys(n.frames).length} frames x ${n.slots} slots x ` +
                `${n.layers.length} layers, ${n.callouts} callouts, ${Object.keys(n.highlights).length} highlights`);
  }
} else {
  let total = 0, bad = 0, missing = 0;
  for (const s of targets) {
    const out = path.join(__dirname, s.fixture);
    if (!fs.existsSync(out)) {
      console.error(`  FAIL [${s.key}] no baseline — run: node snapshot.js capture ${s.key}`);
      missing++;
      continue;
    }
    const [cmp, n] = check(s.key, JSON.parse(fs.readFileSync(out, 'utf8')), snap(load(s.file)));
    total += cmp; bad += n;
    if (!n) console.log(`  ok    ${s.key.padEnd(8)} ${String(cmp).padStart(4)} path strings identical`);
  }
  process.exitCode = (bad || missing) ? 1 : 0;
  console.log(bad || missing
    ? `\n  FAILED — ${bad} difference(s), ${missing} missing baseline(s)`
    : `\n  identical: ${total} path strings across ${targets.length} scene(s) match exactly  OK`);
}
