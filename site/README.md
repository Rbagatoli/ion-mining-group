# Ion Mining Group — public website

The company-facing marketing site. Completely separate from the app that lives at the
repo root — no shared CSS, no dependencies. Five static pages, one stylesheet, and a small
diagram engine with one scene per page.

```
site/
  index.html      Home — the model, the two tracks, how we operate
  hosting.html    Hosting & colocation (for miners)
  energy.html     Energy partnerships + site submission form (for energy/site owners)
  calculator.html Mining profitability calculator (both audiences)
  contact.html    Contact details and general enquiry form
  styles.css      All styling
  site.js         Nav, scroll reveal, mailto forms
  diagram-engine.js  Scene-agnostic 3D machinery, shared
  scene-site.js      Home page scene: a whole deployment
  scene-hosting.js   Hosting page scene: inside one hosted container
  scene-pad-now.js   Energy page scene: a wellpad as it stands, flaring
  scene-pad-ion.js   Energy page scene: the same pad with a mine on it
  pad-geometry.js    The wellpad itself, shared byte-for-byte by both pad scenes
  site-kit.js        Gas skid, genset, transformer, container — shared by two scenes
  calc-engine.js  Projection maths, copied verbatim from the app at the repo root
  miner-db.js     28 machine models with specs, copied from the app
  calculator.js   The form around the engine
  favicon.svg     Ion mark, matching manifest.json
```

## Preview locally

```sh
cd site
python -m http.server 8080   # or: npx serve .
```

Then open <http://localhost:8080>. Opening the files directly with `file://` works too,
but relative links behave better over HTTP.

---

## ⚠ Before this goes live: fill in the placeholders

Every unverified fact is wrapped in `<span class="ph">[LIKE THIS]</span>` and renders as
**orange text on a dashed underline**, so nothing false can ship by accident. Search for
`class="ph"` to find them all.

### Appears on every page (footer)

| Placeholder | What it needs |
|---|---|
| `[REGISTERED ENTITY NAME]` | Legal entity, e.g. "Ion Mining Group LLC" |
| `[CITY, JURISDICTION]` | Where the entity is registered |

### `index.html`

| Placeholder | What it needs |
|---|---|
| `[XX] MW` | Energized capacity under management |
| `[X.X] EH/s` | Total hashrate operated (use PH/s if EH/s overstates it) |
| `[X]` sites in `[REGIONS]` | Operating site count and regions |
| `[XX.X]%` | Fleet uptime, trailing 12 months |
| `[$0.0XX]` | Headline hosting rate |
| `[XX]`-machine minimum, `[XX]`-month terms | Hosting minimums, repeated from hosting.html |
| `[XX]`–`[XX]` weeks | Term sheet → energized, repeated from energy.html |

> If you have no operating sites yet, **delete the stat strip entirely** rather than
> softening the numbers. Its markup is the whole `<section>` immediately after the hero
> in `index.html`.

### `hosting.html`

Power redundancy, cooling temps and supported hydro models, connectivity type, remote-hands
response target, security staffing, rate, billing terms, minimums, contract term, deposit,
setup fee, expected curtailment hours, insurance responsibility, supported hardware
generations, max per-unit wattage, freight inspection window, quote turnaround, site visit
policy, early-exit policy, and the three deployment-size tiers in the last FAQ.

### `energy.html`

Acreage per MW, minimum supply duration, all seven screening criteria rows (gas volume,
heating value, H₂S limit, minimum MW, duration, land, active regions), the three deal
structures' economics (gas price, power price, revenue split, lease rate, royalty %),
interruption notice requirements, noise limit at property line, environmental reporting
standards, and the small-volume threshold in the last FAQ.

### `contact.html`

Phone number, business hours and time zone, street address, city/state/postal, and
response-time commitment.

---

## Email addresses

Three addresses are referenced throughout and **need to exist before launch**:

- `hosting@ionmininggroup.com`
- `energy@ionmininggroup.com`
- `hello@ionmininggroup.com`

They are hardcoded in the HTML and in the `routes` map at the top of the topic handler in
`site.js`. If you use different addresses, update both.

## Forms

GitHub Pages is static, so there is no endpoint to POST to. Both forms compose a pre-filled
`mailto:` draft instead — the visitor still has to press send in their own mail client,
and the plain address is printed beside every form as a fallback.

To take real submissions, add a Cloudflare Worker (this repo already has several under
[`worker/`](../worker/)) that accepts a JSON POST and forwards to email or a CRM, then
replace the `mailto:` branch in the form handler in [`site.js`](./site.js) with a `fetch`
to it. Keep the mailto path as the no-JS fallback.

## Deployment

The repo publishes to GitHub Pages from the root, so this lands at
`https://<user>.github.io/ion-mining-group/site/` as soon as it is pushed.

**The `<link rel="canonical">` and `og:url` tags on all five pages point at
`https://ionmininggroup.com/`.** That is correct once the custom domain is attached and
serving this directory, and wrong until then — pointing search engines at a URL that does
not serve the page. Either attach the domain before announcing the site, or update those
tags to the github.io path in the meantime.

Two options for the custom domain:

1. **Subdirectory** — point `ionmininggroup.com` at the Pages site and link `/site/`.
   Simple, but the app is then the thing at the apex, which is backwards for a public site.
2. **Marketing site at the apex** (recommended once the copy is final) — move these files
   to the repo root and relocate the app to `/app/`. That touches the nav links in
   `shared.js`, `manifest.json`'s `start_url`, and the cache paths in `sw.js`, so it is a
   real change rather than a move. Ask before doing it.

## The nav is generated

The nav and the footer's Company column are written into all five pages by
[`tools/build-nav.js`](./tools/build-nav.js) from one definition, rather than hand-copied and
left to drift. Edit the definition in that script, never the pages:

```sh
node tools/build-nav.js
```

Per-page differences it handles: which item gets `.active`, and each page's own CTA button.

## Mining calculator

`calculator.html` runs the same projection the app at the repo root runs. That is the whole
point of the page, so it is worth being precise about how it is kept true.

**[`calc-engine.js`](./calc-engine.js) is a verbatim copy of
[`../calc-engine.js`](../calc-engine.js).** Not a port, not a simplification — the same bytes.
It was already pure (no DOM, no network, no globals but its own export) because it was
extracted from `calculator.js` to be node-testable, which is exactly what makes it portable.
**Never edit the site copy.** Change the root one and re-copy, or the public page starts
quoting different numbers than the desk does. `calc-suite.js` asserts the two are
byte-identical and projects six scenarios through both, so drift fails the build rather
than shipping quietly.

The same goes for [`miner-db.js`](./miner-db.js), which is the root file plus a one-line
`module.exports` tail so it can be required under node.

**Two ways in.** *I have machines* takes a model and a count. *I have energy* takes gas
volume or spare capacity and sizes the fleet, using the constants from the app's
[`site-engine.js`](../site-engine.js) — 1,000 BTU per cubic foot, 10,000 BTU per kWh, so
1 Mcf ≈ 100 kWh and 1 MMcf/day ≈ 4 MW. Both are exposed as inputs, because the internal
engine exposes them too: heat rate moves materially with genset model and altitude. The
suite asserts the page's defaults still equal the engine's.

> Oilfield notation catches everyone, including the test that was written to check it:
> **M is a thousand**, so 1 MMcf = 1,000 Mcf, not a million.

**The engine floors `machineCount` at 1** because it is a divisor downstream. That floor is
right for the engine and wrong for this page — a gas volume too small to run one machine
must not come back as a one-machine projection. Everything user-facing therefore reads the
*requested* count, and a fleet of zero blanks the results rather than projecting a phantom.

**The chart is hand-built SVG against a fixed `viewBox`**, not a charting library. The site
has no dependencies and the standing no-measurement rule applies here as much as to the
diagrams — a viewBox scales without anyone asking the layout how wide it is.

### Live market data — the site's only outbound request

BTC price and network difficulty are fetched on every page load, because a calculator
seeded with a constant is wrong from the day it ships and gets worse.

| Figure | Endpoint | Shape |
|---|---|---|
| BTC price | `api.coinbase.com/v2/prices/BTC-USD/spot` | `{"data":{"amount":"75464.76",…}}` |
| Difficulty | `blockchain.info/q/getdifficulty` | a bare number, absolute — divide by 1e12 for T |

Both are public, keyless and CORS-open. Keyless matters: a key in a static page is a
published key, and there is a test asserting neither URL carries one.

**Every failure path falls back to the seeded values silently.** No fetch in the browser, a
non-200, a parse failure, an outage, a blocking CSP — the calculator opens on the figures in
the markup and says so. It never shows an error, an empty field, or a spinner that never
resolves. A late response also will not overwrite a value the visitor has already typed.

The note under those two fields is written for the fallback case and upgraded by script when
the fetch lands, so it is true in both states. Re-date the seeded figures whenever you touch
them; a test checks the note quotes the values actually shipped.

> This breaks the site's no-external-requests rule, on purpose and by request. The privacy
> policy needs a line about it — a visitor's IP reaches Coinbase and blockchain.info.

### Placeholders here work differently

BTC price and network difficulty ship with starting values rather than `[PLACEHOLDER]`
spans, because they are *inputs the visitor overwrites*, not claims the site is making. The
page says so in as many words directly under them. If that caveat is ever removed, the
defaults become assertions about live market state and the placeholder rule applies again.
There is a test for the caveat's presence.

## Design system

Sharp and minimal, built on three materials in a deliberate proportion. The ratio is the
design — if you add anything, keep it.

| Material | Role | Share of a typical viewport |
|---|---|---|
| **Black** `#000000` | The ground. Page, surfaces, card fills. | ~55% |
| **Platinum** `#e5e4e2` | The structure. All type, every hairline, all borders. | ~40% |
| **BTC orange** `#f7931a` | The accent only. Never a surface. | ~5% |

**Both metals are gradients, not flat fills.** `--metal-plat` and `--metal-btc` (vertical,
for text) and their `-flat` variants (135°, for surfaces and rules) are defined at the top
of [`styles.css`](./styles.css). They are applied via `background-clip: text` on display and
section headings, stat values, and step numbers, and as `background-image` on buttons, rules,
and edge highlights — so type and edges catch light like brushed metal instead of sitting
flat. Add `.metal-plat` or `.metal-btc` to any element to opt it in.

Other rules the pages follow:

- **Square, everywhere.** No border radius, no soft shadows, no colour bloom. The only
  radial glow on the site is inside the CTA band.
- **Hairlines are platinum, never white.** `--line` / `--line-mid` / `--line-hi`.
- **Cards share edges rather than float.** Add `grid--matrix` to a `.grid` and the children
  become a single bordered matrix with 1px shared dividers. Used on the home page's model
  cards and both card groups on the energy page.
- **Orange is load-bearing, not decorative.** It marks exactly four things: the primary
  action, the active nav item, a live data point, and an unfilled placeholder.
- Buttons and labels are uppercase mono with wide tracking; body copy is not.
- Dark only, by choice. The app has a light theme; this site does not need one.
- No CDN, no web fonts, no analytics. **One exception, added deliberately:** the calculator
  fetches the live BTC price and network difficulty on load — see
  [Mining calculator](#mining-calculator). That is the only outbound request the site makes.
  Two public keyless endpoints, nothing sent but the request itself, and every failure path
  falls back to the figures the page shipped with. **It does mean a visitor's IP reaches two
  third parties, so the privacy policy needs a line about it.** If you add anything else that
  calls out, disclose that too.
- `prefers-reduced-motion` is respected — reveals, sheen sweeps, and transitions turn off.
- Accessibility: semantic landmarks, keyboard-operable mobile nav with `aria-expanded`,
  visible focus state on every field, and no text below 10.5px (mono labels only).

## "Inside a site" diagram

A containerised deployment rendered in 3D on the home page: gas conditioning, a two-bay genset
skid, a transformer, and two 40 ft containers side by side, each with its near wall and half its
roof cut away to show 30 ASICs on three tiers (60 in total). One gas skid, one genset and one
transformer feed both.

The containers are separated by a wide service aisle on purpose. Both cutaways face the viewer, so
the near container is what occludes the far one; the further apart they sit, the further down into
the far interior the sight line reaches. At 4.8 m centres and a 26 degree pitch, two of the far
container’s three tiers read above the near roof. Closing the gap or flattening the pitch hides it. Eight callouts sit around the frame with leader lines that track their anchors as the scene
sweeps — including the container shell itself, since a 40 ft box retrofitted for power, cooling
and racking is a large part of what a hosting client is actually buying.

There are **two** diagrams now, sharing one engine:

| File | Role |
|---|---|
| [`diagram-engine.js`](./diagram-engine.js) | Everything scene-agnostic. `createDiagram(scene)` is a **factory**, not a singleton — view state lives per instance, so two diagrams can never share it. |
| [`scene-site.js`](./scene-site.js) | Home page: gas conditioning, genset, transformer, two containers. |
| [`scene-hosting.js`](./scene-hosting.js) | Hosting page: inside one container, drawn ~2.4× closer so each machine is legible. |

A scene supplies `view`, `renderables`, `callouts`, `flow`, `regionBoxes`, `objects`,
`extraBoxes` and `data`. Builders receive the engine's helper bundle as `H` rather than
reaching for globals, so a scene never touches engine internals.

**Re-run the generator after any change to a scene:**

```sh
node tools/build-diagram.js            # both pages
node tools/build-diagram.js hosting    # just one
```

### Five things that are easy to get wrong

**1. +Z is the near side.** The perspective divide is `FOV / (FOV - z2 * SCALE)`. With `+`
instead of `-`, −Z becomes near and the whole scene renders inside-out — you face the far wall,
the cutaway points away from you, and the ASIC fans face into a wall. The scene is authored
throughout to "+Z toward the viewer"; that convention decides which wall is cut and which way the
machines point.

**0. All four drawings share one set of face weights** — `.dg-top` / `.dg-side` / `.dg-end` at
0.42 / 0.30 / 0.20, with `.dg-detail` at 0.72 above them. There was briefly a second set: heavier
weights for the wellpad on the reasoning that a container wall must be see-through and a wellpad
need not be. The reasoning was sound and the result was not — side by side the drawings looked
like three different materials and the wellpad read as lit from a different sun. The shared
weight has to stay heavy enough for a solid object to have form (a lit face at 3.45:1 against the
ground) and light enough that a cutaway still shows what is racked inside it. `pad-suite` asserts
both bounds, and resolves them through `cascade.js` rather than reading the rule, because an
override that loses is indistinguishable from one that was never written.

**2. Faces must be solid and shaded, not wireframe.** An earlier version drew everything as
outlined boxes, and a genset, a transformer and a container all read as the same anonymous box.
Fills vary by orientation — roof lightest, long sides mid, ends darkest, interior darker than
anything outside it so the machines read against it.

**3. Back-face culling is by projected signed area.** Faces are wound counter-clockwise seen from
outside; screen y runs down, so a front-facing polygon has *negative* area. On a convex solid the
surviving faces never occlude each other, so no per-face sorting is needed. The invariant worth
testing is that a closed box always shows **2 or 3** faces — never 0, never 4. Seeing 4 is how the
inside-out bug announced itself.

**4. Objects are depth sorted; layers within an object are not.** Objects overlap on screen by up
to ~18px at the extremes of the sweep, so each renders into a slot assigned back-to-front every
frame. Slots are fixed DOM nodes whose contents change — the document is never reordered. Within
a slot the paint order is fixed: `inside → back → asics → end → side → top → detail`. That
`back` layer exists specifically because far-wall corrugation and rack uprights must paint
*behind* the machines; putting them in `detail` stripes them across the ASICs. For the same
reason the PDU cabinet sits on the aisle side, where painting it last is correct.

**5. Callout bubbles are HTML, not SVG.** `<text>` does not wrap, and six of the seven
descriptions overflowed a fixed-width box by up to 60%. HTML wraps for real, so overflow is
impossible regardless of font fallback. Because the SVG is `width: 100%` with a matching aspect
ratio, viewBox units map to percentages exactly — that is why `.dg-callout--l` can sit at
`right: 80.47%` and line up with a leader ending at viewBox x=250.

### Interaction

Drag to rotate (horizontal = yaw, vertical = pitch), wheel to zoom, hover a part or its bubble
to highlight both. Arrow keys rotate, +/- zoom, 0 or Escape resets; the SVG is focusable and
each bubble is tabbable. There are also explicit +/-/Reset buttons.

**Hover identity cannot live on the geometry.** Slots hold a different object each frame because
they are depth-assigned, so a listener on a slot would report the wrong part. Instead there are
seven invisible hit shapes, one per callout, carrying `data-region`. They are emitted
**largest-area first** so the smallest region ends up topmost and wins the pointer — otherwise
the ASIC array, which spans most of the container, would swallow the PDU and the uplink.

**Wheel-zoom is deliberately inert until you engage** (drag or click), unless a modifier is held.
A full-width figure that hijacks the wheel on hover would trap page scroll for anyone merely
scrolling past. The buttons and the hint line cover discovery. There is a test for this.

**Interaction survives `prefers-reduced-motion`.** Only the unsolicited idle sweep is suppressed;
drag, zoom and hover are user-initiated and stay available.

The idle sweep stops permanently on first interaction — Reset brings it back.
### Standing rules

**Nothing is measured.** No `getBoundingClientRect`, no `ResizeObserver`. Leader anchors are
projected model coordinates. Leader lines that "follow" something are exactly where the
temptation to measure returns — an earlier hero panel measured an element, wrote the result back
into a size, and inflated the page 2px every 150ms.

**One source of truth.** The module self-initialises in the browser and exports under Node, so the
generator emits the static frame from the same maths. With JS off you get a complete, correct,
annotated diagram — just not moving. A test asserts the shipped frame is identical to what the
runtime produces at yaw 0.

### Splitting the engine out

The renderer began as one 970-line file with the scene hardcoded. Adding a second diagram meant
either splitting it or keeping two near-identical copies that would drift the first time either
was touched — carrying every hard-won fix below into both.

The split was done by **slicing the original file programmatically** rather than retyping it, and
guarded by a fixture: the home scene's output was dumped before the refactor and asserted
byte-identical after. All 263 path strings matched. If this is ever restructured again, capture
that fixture first — it is the only thing that makes the change safe to attempt.

### Three defects an adversarial review caught, and why they recur

**1. The container interior developed a hole as it rotated.** All four interior quads are wound
*outward*, and they share one `<path>` under the default `fill-rule: nonzero`. At yaw 0 they all
happened to project with the same sign; off yaw 0 one flips, the overlap sums to winding zero, and
a roughly 20x90px wedge of the 62%-black interior stopped being painted — a bright gap opening and
closing on every sweep. `polyInside()` now normalises every interior quad to one screen winding
and drops near-degenerate ones, whose sign is only rounding noise. **Anything added to
`L.inside` must go through `polyInside`.**

**2. Skid pads painted over the bodies standing on them.** A pad's top face lands in the `top`
bucket, which paints after `side`, so the pad's full-footprint top surface was laid across the
bottom of the genset's near face: 3530px² of 0.115 white over 0.062, on a face only ~62px tall.
Buckets **cannot** express occlusion between two boxes of the same object — only between objects,
via the depth-sorted slots. So the geometry must not depend on it. The pad tops are now skipped
(they are hidden by their own bodies anyway), and the transformer fins were pushed clear of the
tank face they used to straddle. **When adding a sub-box, check it never needs to occlude a
sibling.**

**3. A leader ended 27px short of anything drawn.** The gas anchor sat above the skid centre, but
the tall feature there is the vent stack, offset in x. There is now a test measuring every tip
against the *emitted path vertices* of its object — not against bounding-box corners, which an
interior anchor (a stack head, a bushing) is legitimately far from.

The same review confirmed clean: the winding of all six box faces, the +Z-is-near convention, the
no-per-face-sorting claim, generator/runtime parity, the bubble positioning maths, absence of any
NaN across the whole view envelope, the render loop's restart behaviour, every loop bound, and CSS
class coverage.

### Other notes

- **The sweep oscillates ±18° rather than turning fully.** The scene is ~22 m long; through a full
  revolution it goes edge-on twice per turn and every leader crosses the drawing.
- **The scene must clear the callout columns** at `x < 262` and `x > 1018` across the *whole*
  sweep, not just at rest. `allPoints()` exists so that can be checked automatically.
- **`SHIFT_X`** centres the scene between those columns, applied before rotation so the scene
  turns about its own centre.
- **Reduced motion** needs the animation *name* killed, not its duration — the global
  `* { animation-duration: 0.01ms !important }` loops an infinite animation ~100,000×/second
  rather than stopping it.
- **Below 900px** the drawing is hidden and `.dg-list` shows the same callouts as a numbered
  list, generated from the same array so the two cannot drift.
- No fabricated numbers in any label, per the site rule that unverified figures show as
  `[PLACEHOLDER]`.

Brand tokens still line up with the app's `shared.css` (`#f7931a` on near-black), so both
read as the same company. Nothing else is shared.
