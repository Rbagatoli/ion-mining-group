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
   valid and still proves the home scene did not move.

   Re-baselined again for the hydro switch: the containers lost their air cooling
   (two exhaust fans, nine intake louvres, a filter frame) and gained a dry cooler
   on the roof, and the uplink mast moved to the door end to stop rising through
   it. Checked before recapturing, and the blast radius is the argument for it:

     - Only site, pad-ion and lf-ion moved. asic (318 paths), hosting (208),
       pad-now (246) and lf-now (246) came back byte-identical, which is what
       proves the kit change reached every scene that draws a hydro container and
       no scene that does not. hosting is untouched here because it draws its own
       cutaway rather than KIT.container; it changes in its own pass.
     - Within those three, only end, side, top and detail moved. inside, back,
       asics and ground are byte-identical, so nothing below the roofline shifted
       — no rack, no machine, no floor.
     - The only leaders and hits that moved are cool and net, the two anchors
       deliberately re-aimed: cool onto the roof cooler from the vanished intake
       end, net with the mast.

   All three are intended, so the old fixtures could not be kept.

   Re-baselined again for the rest of the hydro switch, which moved four scenes for three
   separate reasons. Checked before recapturing:

     - site and pad-ion went from two containers to FOUR, laid out 2x2, because the site is
       now drawn as a ~5.7 MW facility: 4 x 240 slots x 5,925 W = 5.688 MW, denominated in
       the load the machines actually draw and not the container's 2.4 MW nameplate. The
       slot ids therefore went contA/contB -> cont0..cont3, which is most of the diff.
       site also drops BASE_SCALE 28 -> 18.3 and SHIFT_X -3.28 -> -10.15: a second column of
       12.19 m boxes is the whole of that cost, measured against the fixed 780-unit band the
       callout columns leave.
     - hosting lost its air cooling (nine louvres, two filter frames, four exhaust fan rings,
       a fan pair on every machine face) and gained a coolant loop, manifolds, a CDU and the
       same roof dry cooler every other container carries. Its airflow run became a coolant
       run, three of its eight callouts were rewritten, and the CDU and spares cabinet moved
       so the cabinet stopped painting over column 0's machines.
     - asic stopped being an Antminer S21 Pro and became an S21+ Hyd.: 450 x 219 x 293 mm
       with four 140 mm fans -> 339 x 173 x 207 mm with none, plus OD10 coupling ports, cold
       plates and a header with six jumpers.

   lf-ion came back BYTE-IDENTICAL (822 path strings), which is the useful part of this
   re-baseline: it draws four hydro containers through the same KIT.container as the two
   scenes that moved, so it proves the container itself did not change in this pass — only
   how many of them each scene places, and what the hosting page draws with its own geometry.
   pad-now and lf-now are identical too; they have no containers to place.

   Re-baselined again for the machines INSIDE those containers, which the pass above missed
   entirely. KIT.container() was still drawing two fan rings on every machine face — thirty
   machines a container, four containers, with the comment "as on a real S21" — so the shell
   had been converted to hydro around contents that were still air-cooled. It also drew no
   coolant loop at all, while the roof cooler's downcomers were commented as dropping "into
   the manifolds". The fan rings are gone, the control strip and LED stay, and a supply and
   return run the length of the rack and rise at the door end to meet those downcomers.

   The blast radius is the whole argument for this one: site, pad-ion and lf-ion moved, and
   within them ONLY the detail layer — 96 slot-layers, every one of them detail. inside,
   back, asics, end, side and top are byte-identical, so no machine box, no rack, no shell
   and no roof moved; only line work on the faces and the new run. hosting, asic, pad-now
   and lf-now are untouched.

   Re-baselined once more because the cooler was the one solid object in a drawing whose
   entire point is that you can see into it. The roof above it says "only the far half
   survives the cutaway" and draws z -1.22..0.00; the cooler was drawn z -1.00..+1.00,
   straight across the cut line and over the open half. Built as mass rather than line work
   — which is what makes it survive a phone — it put an opaque lid on the machines the
   cutaway exists to show: measured, a container's own cooler covered 18-22% of its own
   machines at rest and up to 42% at 45 degrees. It now ends at the same cut plane the roof
   does, with its cut outlined the way the container outlines its own, and that falls to
   0.5-1.3% at rest and 7-17% at 45. The flow and return moved behind the frame for the same
   reason: in front of it is the half that is not there.

   Same three scenes, same single layer as the pass before it — site, pad-ion and lf-ion,
   detail only. hosting and asic are byte-identical again, which is the check that matters
   here: the hosting page draws its own cooler from the same KIT.COOLER dimensions but its
   own geometry, and it is a whole container rather than a cutaway of a yard, so it should
   NOT have moved. It did not.

   Re-baselined once more after an adversarial pass over the coolant run that pass added.
   Three reviewers converged on the same four defects, all of them mine and all confirmed by
   computing the coordinates rather than by looking:

     - the two "risers" were ONE LINE. Both ran at the same x and the same z and ended at the
       same point, so the second was a strict sub-segment of the first, and the supply/return
       pair collapsed to a single pipe at the one place the drawing has to show two.
     - the riser did not reach the downcomers it was commented as meeting: 1.5 m short, so
       the run still ended in mid-air, higher up.
     - it did not climb "the door-end wall" either. It stood 0.90 m shy of that wall, in the
       aisle, and inside the PDU's own x span — and being in 'detail', the last layer
       painted, it drew over the cabinet's front face.
     - a comment sized a coupling at "21 px on the hosting page". 21 px was the old FAN ring
       on that page. The coupling is 7.9 px, which is what scene-hosting.js itself calls
       "about 8 px".

   The run now leaves at the blind end — the end the hydro switch emptied, away from the PDU
   and the door hardware — with the pair separated in x as well as z, because 0.09 of z is
   0.79 px and reads as one line. Measured after: risers 4.4-5.0 px apart through the
   readable band, both pipe ends clear of the PDU's drawn face, and the four ends meeting the
   four downcomer feet at 0.000 px over a full revolution because they are now the same
   points by construction.

   Same three scenes, detail only, hosting and asic byte-identical again.

   Re-baselined for the legibility pass, which moved things for four separate reasons — each
   implemented in isolation and adversarially reviewed before integration:

     - Every scene gains the flowHeads key (see the note below this header): a NEW key, so
       "flowHeads differs" on all seven scenes is the expected shape of that diff and no
       existing path string should move for it.
     - site gains a GROUND slot (SLOTS 7 -> 8): the graded pad and access road the energy
       scenes always stood on, in their exact language, drawn 28.29 x 8.75 with the grid at
       100-116 px columns at desktop. The four yard scenes now all stand on ground; the home
       page was the only drawing that floated on black.
     - site, pad-ion and lf-ion move in detail/end/side/top for the heat-rise marks above the
       kit's dry coolers, and KIT.COOLER.h grew 0.76 -> 1.06 to keep the marks inside every
       hover region and clip box sized from it — which also lifts the 'cool' callout anchors
       0.30 m (measured: leaders still land on cooler geometry, 13-24 px clear of collisions).
     - hosting moves for its own heat marks plus two measured cutaway additions (coolant
       containment drain along the rack line; the marks) — detail ink 11,460 -> 11,758, still
       well under the 11,726-byte pre-hydro noise ceiling this file's earlier entries cite.

   pad-now and lf-now move ONLY in the flowHeads key; their geometry is byte-identical, which
   is the isolation proof for this pass: nothing that does not draw a hydro cooler moved.

   Re-baselined for the first half of stroke occlusion, the defect the solid pass exposed
   and the owner spotted on the live site: fills went opaque but every hairline still rode
   in 'detail', the last layer, so a container seen from behind wore its own manifolds and
   machine strips on the outside of a blank wall — and the wall itself did not exist as an
   exterior face, because the x-ray era never needed one. The engine gains an 'inner' layer
   (after asics, before the shell faces) so interior line work is hidden by a wall exactly
   when the wall faces the viewer; KIT.container() gains a real facing-culled far wall, and
   its exterior marks (door hardware, roof ribs, base-rail edges, cooler coils, cut edges,
   roof pipes) now carry their own face's facing guard.

   Every fixture moves at minimum because LAYERS is part of the snapshot — the 'flame'
   entry above is the precedent. Beyond that, only the scenes that draw KIT.container()
   move geometrically (site, pad-ion, lf-ion: strip/manifold ink relocates detail->inner,
   plus the new wall quads and guarded marks appearing/vanishing by facing). hosting and
   asic move in the LAYERS list alone this pass — their own stroke occlusion is the second
   half, running now, and lands as its own re-baseline.

   Re-baselined for the depth-sort half of the same defect, again owner-reported from the
   live site ("the floor glitches through the rendering"): the four energy scenes packed
   the whole partner site into ONE 'ground' slot — pad, tanks, wellhead, separator on the
   pads; pad, cell, wells, header, blower on the landfills — behind a single anchor whose
   depth swings with yaw. Measured before fixing: that slot painted AFTER a container at
   123 of 180 sampled yaws on pad-ion and 109 on lf-ion. Translucent, the inversion was a
   0.04 veil; solid, it was the floor and the tank battery stamped over the yard.

   The split: terrain (pad, berm, yard, pipes) keeps the slot, anchored on the turntable
   axis at y -100 so its depth is a constant below anything drawable (y -40 off-axis still
   lost 54 yaws — measured, hence both the depth and the axis). Equipment gets honest
   slots: well/sep/tanks on the pads, cell(+wells+header, a REAL 8.5 m occluder that must
   keep sorting)/plant on the landfills. SLOTS: pad-now 2->5, pad-ion 10->13, lf-now 2->4,
   lf-ion 10->12. Ground leaves objects() entirely (scene-site precedent): boxing the pad
   fed its bleed-by-design sweep into the callout-rail fit and failed it at x 209..1071.
   The 'now'/'ion' twins split identically so the crossfade cannot reorder a tank
   mid-slide. Slot ORDER at many yaws is most of this diff; the geometry inside each
   builder is unchanged, only its slot assignment moved.

   Re-baselined for the rest of stroke occlusion — the small kit and the partner-site
   geometry (gas/gen/xfmr face guards; pad edges drawn only when a face owning them
   shows; landfill wells, header stretches, laterals and yard boxes skipped when the
   mound buries them) — plus three defects its adversarial review confirmed in the
   part already shipped, all fixed in this same pass. Checked after recapturing:

     - hosting moves in 'inner' and 'detail' ALONE, no shell layer: the CDU volutes,
       plate lines and controller window, the PDU breaker rows and meter, the switch
       ticks and the spares shelves — 38 strokes — left 'inner' for 'detail' behind
       their own face's facing. In 'inner' they painted BEFORE the cabinet's own
       front fill and were visible from no yaw at all (reviewer's pixel probes);
       three callouts anchored featureless boxes. detail moves at exactly the three
       sampled yaws where a cabinet front faces the camera (0, 45, 315).
     - site and lf-ion/pad-ion move in 'inner' for the same defect in the kit: pdu
       rows out to guarded 'detail', the 19 tray-lid drops deleted outright (a
       sightline that clears the roof's cut edge re-enters the roof plane within
       0.29 m at both drawing pitches — the drops were never visible except as x-ray
       bleed through the roof), and the xfmr handwheel ring into 'inner' where the
       walls painted after it hide its buried half.
     - the landfills move in end/side/top because buried equipment is now SKIPPED,
       not painted-and-covered, and in flow/flowHeads because the orange run is
       clipped against the mound with the laterals' own march: for a third of the
       turn it printed the header straight across the solid dome. Where it dips
       behind the hill it now ends in an arrowhead AT the hillside — one new
       subpath terminus per dip, which is the flowHeads diff.
     - the door-furniture guard tests the PLATE's face plane (x1 + 0.1) instead of
       the shell's x1 — flip-exact, closing the measured 0.22-degree band where
       hardware painted on bare fills. No sampled yaw sits in that band, so no
       fixture line moves for it; the render harness proves it at 346.72.
     - asic came back BYTE-IDENTICAL, the control: nothing in this pass touches it.

   Every relocation above was mutation-tested: each new guard inverted one at a
   time kills its marks at yaw 0 AND prints them on the far wall at yaw 180
   (288-2,021 px per guard, measured slot-major at full scale); the flow clip
   un-clipped puts 5,817 px of orange back across the dome at yaw 180. */
/* The snapshot now also records frame.flowHeads — the arrowheads the engine
   derives from the flow path so the dashes have a direction. A new key rather
   than a change to any existing one: every scene will report "flowHeads
   differs" until the fixtures are recaptured, and that is the only failure
   this addition should produce. Guarding it here matters because the heads are
   generated in the engine, not the scenes — a regression there would move
   every drawing on the site at once and no scene fixture would say so. */
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
      flowHeads: f.flowHeads,
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
    if (a.flowHeads !== b.flowHeads) fail(`flowHeads differs at yaw ${y}`);
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
