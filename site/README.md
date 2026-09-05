# Proton Mining — public website

The company-facing marketing site. Completely separate from the app that lives at the
repo root — no shared CSS, no dependencies. Six pages plus an error page, one stylesheet,
and a small diagram engine. Most pages carry one drawing; the energy page carries
four, in two pairs behind a fuel switch.

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
  scene-landfill-now.js  Energy page scene: a landfill collection system, flaring
  scene-landfill-ion.js  Energy page scene: the same landfill with a mine on it
  landfill-geometry.js   The cell and wellfield, shared by both landfill scenes
  site-kit.js        Gas skid, genset, transformer, container — shared by two scenes
  calc-engine.js  Projection maths, copied verbatim from the app at the repo root
  miner-db.js     28 machine models with specs, copied from the app
  calculator.js   The form around the engine
  hardware.html   Catalogue and order builder — a quote request, not a checkout
  hardware.js     The catalogue and the running order
  cart.js         The order, kept between pages. Loaded everywhere.
  checkout.js     The checkout page: lines, deposit split, destination
  price-list.js   Dated indicative prices, the one place to refresh them
  privacy.html    What this site collects, and the two services the calculator calls
  404.html        Not found — see the caveat below
  og/             Generated share cards
  robots.txt      Generated
  sitemap.xml     Generated
  favicon.svg     Proton mark, matching manifest.json
```

## Build your mine

The home page's **Our mine / Build your mine** tabs share the existing drawing
window. The generated SVG remains available as a fallback. The builder accepts available MW,
Mcf/day (with gas quality and engine heat rate), or machine count; visitors can
select a catalog miner or enter custom specifications and operating assumptions.

`mine-builder-model.js` reserves cooling/site overhead before flooring machine
count and calls `CalcEngine` for a 365-day projection. Production is net of pool
fees and uptime, includes difficulty changes and projected halvings, and excludes
transaction fees. The 30-day number sums 30 daily periods. Dollar margin deducts
electricity only. Zero capacity bypasses the engine's one-machine floor. The full
calculator link pins the same inputs and includes overhead in per-machine power.
Prices come from the dated `PriceList` and can be overwritten with a quote.

`mine-builder.js` handles the tabs, form, validation, results, chart and market
requests. Coinbase and Blockchain.info are requested only when the builder is
first opened or refreshed. Failures retain explicitly labeled example/user values;
late replies cannot replace an input the visitor has edited. These requests send
no configuration data. The privacy page describes both requests.

`mine-builder-scene.js` is dynamically imported when a 3D window is approached or
the builder is first opened. It
uses locally bundled Three.js 0.185.1 (MIT license in `vendor/three-0.185.1/`). The
geometry supports hydro, air and immersion cooling, grid or on-site generation,
energizing, scroll-wheel / button zoom, X-ray, and an opening container. Platinum
metal panels and metallic BTC-orange accents use neutral studio lighting. Hydro
containers have sealed miners, supply/return plumbing, a CDU and a roof dry
cooler; its fans reject heat from the water loop. Air containers instead have
intake filters, miner fans and an end-wall exhaust array. Immersion uses tanks.
The utility train shares detailed generator packages, filter vessels, valves,
gauges, switchgear and finned transformers across the builder and presentation
views. The landfill keeps its authored terrace profile and well positions, with
a smoother cap, flanged wellheads, supported collection piping, twin blowers and
an enclosed flare. The gas-pad version includes a horizontal separator and welded
storage tanks with a service walkway. Repeated hardware is instanced; hover bounds
cover the modeled equipment while pointing labels retain their individual anchors.
Equipment anatomy references: [Jenbacher containerized solutions](https://www.jenbacher.com/images/medias/files/4755/innio_fs_containerized_solutions_a4_en_screen_ijb-122005-en.pdf)
and [EPA landfill gas systems](https://www.epa.gov/lmop/basic-information-about-landfill-gas).
Large fleets are represented by
at most 12 explicitly labeled groups. Geometry and representative rack detail are
illustrative, not a construction design. Every rendering starts energized. The
builder's Power down choice survives input edits; empty or invalid builds stop
operating, and Reset configuration restores the energized default.
Animation stops offscreen, on hidden tabs, and when the original drawing is
selected. Views rotate automatically, pause during drag / zoom, and resume after
three seconds without resetting the chosen angle or zoom. There is no automatic
rotation toggle. Reduced motion disables idle and operating animations.
Touch rotation and pinch zoom work immediately on every 3D canvas, including
Build your mine and its container interiors. The drawing captures these gestures;
callout cards and the surrounding page still scroll normally. The full rendering panel handles scroll-wheel
zoom, including events over captions and callout cards. It consumes those events
at the zoom limits too; scrolling outside the panel still moves the page.
Ctrl/Cmd-wheel retains browser zoom. A WebGL failure keeps
the estimates usable alongside a reference image.

`plant-viewer.js` and `plant-viewer.css` progressively upgrade **Your site**, **Our
mine**, and **One container** with that same renderer and container geometry.
The original scene definitions supply the equipment positions, ground contours,
camera framing and two columns of pointing textboxes. Source equipment becomes
lit geometry, and detailed containers occupy the original slots. Labels track
their equipment during rotation and zoom. Hover fills and outlines the complete
region, including all equipment belonging to a grouped label. Clicking a label
eases both the camera and its framing toward that section, then begins a gentle oscillation of about ten degrees
each way. The selection persists after pointer exit. Clicking it again, Reset,
or Escape returns to the complete site.
These views use X-ray to reveal infrastructure without moving the shell or
entering a container. Only the individual ASIC starts with X-ray enabled; all
other views start with it off. Each view retains subsequent visitor choices.
The larger metallic orange X-ray controls display their on / off state. Only
Build your mine retains the opening-container control. Hosting's slider
switches between the container and a detailed fanless S21+ Hyd. machine. Each
energy fuel keeps its own comparison slider and camera; existing equipment stays
fixed while the Proton deployment is revealed, and the flare remains in place.
Hidden fuel panes load only when approached. The old SVG pauses while hidden and
returns if WebGL cannot initialize or its context is lost.

The generator reads the panel markup from `tools/mine-builder.html`:

```sh
node site/tools/build-diagram.js
node tools/build-asset-stamp.js
node tests/site/mine-builder-suite.js
node tests/site/mine-builder-ui-suite.js
node tests/site/plant-scene-suite.js
node tests/site/plant-viewer-suite.js
```

The `data-module-src` URL participates in asset stamping, so the lazy scene is
cache-busted along with the rest of the site. Vendor imports are versioned by
directory. All four feature suites are also in `tests/site/run.js`; they verify
economics, calculator handoff, cooling geometry, original camera projection and
equipment locations, wheel handling through the real OrbitControls (including
overlay events), automatic rotation / resumption, animated section focus and
bounded oscillation, energized defaults, interior controls, progressive enhancement / fallback, form
behavior and market races.

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
| `[REGISTERED ENTITY NAME]` | Legal entity, e.g. "Proton Mining LLC" |
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

- `hosting@protonminingco.com`
- `energy@protonminingco.com`
- `hello@protonminingco.com`

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

The repo publishes to GitHub Pages from the root, so this would land at
`https://<user>.github.io/proton-mining/site/` — except that it does not, yet.

**[`_config.yml`](../_config.yml) excludes `site/` from the build**, deliberately, until the
placeholders are filled and the canonicals point somewhere real. Publishing is deleting the
`- site/` line. Everything below describes the state after that.

**The `<link rel="canonical">` and `og:url` tags on all five pages point at
`https://protonminingco.com/`.** That is correct once the custom domain is attached and
serving this directory, and wrong until then — pointing search engines at a URL that does
not serve the page. Either attach the domain before announcing the site, or update those
tags to the github.io path in the meantime.

Two options for the custom domain:

1. **Subdirectory** — point `protonminingco.com` at the Pages site and link `/site/`.
   Simple, but the app is then the thing at the apex, which is backwards for a public site.
2. **Marketing site at the apex** (recommended once the copy is final) — move these files
   to the repo root and relocate the app to `/app/`. That touches the nav links in
   `shared.js`, `manifest.json`'s `start_url`, and the cache paths in `sw.js`, so it is a
   real change rather than a move. Ask before doing it.

## Running the tests

```sh
node tests/site/run.js            # every suite
node tests/site/run.js --mutate   # and the mutation harnesses
```

Twenty-one suites plus a snapshot baseline, in [`tests/site/`](../tests/site/). Plain node, no
runner, no dependency — the same style as the app's own tests one directory up.

**They used to live in a scratch directory outside the repo.** They were real and they passed, and
this file cited them by name in a dozen places as the thing enforcing an invariant — but the
operating system was entitled to delete them at any moment, and nothing in a fresh checkout would
have said they were missing. Moving them cost one change each: an absolute path that worked on one
machine became a path derived from the test file's own location.

They are in `tests/site/` rather than `site/tests/` deliberately. `_config.yml` already excludes
`tests/` from the Pages build, and `site/` **stops** being excluded the day this site publishes —
test files being served to the public is not a thing to discover afterwards.

`snapshot.js` is a tool rather than a suite: `verify` compares every path string in all seven
drawings against a captured baseline, and `capture <scene>` re-takes one after a deliberate change.

> **The two mutation harnesses rewrite files under `site/` and restore them in a `finally`.** That
> is what makes the guards trustworthy, and it is why a plain run does not do it: an interrupted
> run leaves the tree modified. `--mutate` re-verifies the snapshot afterwards, because "it
> restores itself" is a claim worth checking rather than trusting.

## Generated files

Four generators, all idempotent — running any of them twice changes nothing the second time,
and a test asserts it. Run them after editing what they own; never edit the output.

| Script | Owns |
|---|---|
| [`tools/build-nav.js`](./tools/build-nav.js) | the nav and the footer Company column, on all six pages |
| [`tools/build-diagram.js`](./tools/build-diagram.js) | the drawing sections and their static frames |
| [`tools/build-seo.js`](./tools/build-seo.js) | `robots.txt`, `sitemap.xml`, and the home page JSON-LD |
| [`tools/build-og.js`](./tools/build-og.js) | the share cards in `og/`, and the `og:image` tags pointing at them |

`build-seo.js` holds `BASE`, the single place the site origin is written. The `canonical` and
`og:url` tags in each page already assume the same origin, and `seo-suite.js` asserts they agree —
a sitemap that disagrees with a canonical tells search engines two different things about one page.

The JSON-LD asserts only name, url, logo, description and email. **No address, telephone, founding
date or headcount**, because those are all still `[PLACEHOLDER]` spans. JSON-LD is the one place an
unverified claim becomes machine-readable and gets repeated back as fact, so a test asserts no
bracket ever reaches it. Add those fields here at the same time you fill the spans.

> ### None of this is live yet
>
> [`_config.yml`](../_config.yml) at the repo root excludes `site/` from the Pages build, on
> purpose — 85 unfilled placeholders and canonicals aimed at a domain that does not serve this
> directory. So `robots.txt`, `sitemap.xml` and the structured data are all correct and all
> dormant. Publishing is deleting the `- site/` line, once the placeholders are filled.
>
> **`404.html` needs one thing more.** Pages takes its custom 404 from the *publish root*, and this
> repo publishes from the root where the app lives. Even with `site/` published, a mistyped URL
> lands on GitHub's default until the marketing site moves to the apex — option 2 under Deployment.
> Putting a 404 at the repo root instead would mean touching the app.

## The nav is generated

The nav and the footer's Company column are written into all five pages by
[`tools/build-nav.js`](./tools/build-nav.js) from one definition, rather than hand-copied and
left to drift. Edit the definition in that script, never the pages:

```sh
node tools/build-nav.js
```

Per-page differences it handles: which item gets `.active`, and each page's own CTA button.

## Hardware catalogue

[`hardware.html`](./hardware.html) lists every machine in `miner-db.js`, takes quantities, and sends
the result as a quote request. Hosting was bring-your-own — "send us the machine list" — which loses
the customer who has decided to mine but owns nothing yet.

**It is not a checkout, and that is a business fact rather than a missing feature.** Proton brokers
rather than holds stock, so price and delivery are confirmed against a distributor per order. Taking
money at the moment someone clicks would be promising something not yet sourced. An order builder
that produces a quote is the same conversion step without that exposure. Cart persistence, payment
rails, inventory levels and lead times are all out of scope for the same reason.

### Two sources, on purpose

| File | Holds | Changes |
|---|---|---|
| [`miner-db.js`](./miner-db.js) | hashrate, draw, J/TH | never, once a machine ships |
| [`price-list.js`](./price-list.js) | the indicative price, and `ASOF` | weekly |

They were one file. `miner-db.js` is the app's spec table and its price column was labelled
`cost (USD approx.)` with no date and no source — and across same-generation machines it spans
**5.8× in dollars per terahash**, from $6.2/TH to $36.2/TH. That is not a market spread, it is
entries priced at different times and never reconciled. Tolerable as an editable calculator default;
disqualifying on a page where a published number reads as an offer.

So the page states `ASOF` beside the catalogue and calls the prices indicative and confirmed on
quote. `hardware-suite.js` fails if the date is missing, if it does not reach the page, or if
`hardware.js` starts reading `m.cost` from the specs table again.

> **Reconciling those prices is a data job and it is not done.** The per-TH figure is written beside
> every row in `price-list.js` so the outliers are visible. Do that before this page is published.

A machine with no price on file reads **"on request"**, never `$0` — a zero is an offer of nothing
rather than the absence of one, and there is a test for it.

### A row per machine, with room to breathe

The catalogue is a table, sorted by efficiency, best first. It was briefly a card per machine —
twenty-eight large sections, which gave each one presence but made a very long page and broke the
thing the catalogue is actually for: reading J/TH and price *down a column*. A list does that; a
stack of cards does not. So it went back to rows, with roughly double the row padding of the shared
`.calc-table` and a larger machine name. The extra air is what the cards were really buying.

### The quantity control is the site's own input, not a new one

This is the one thing kept from the card version. The column originally carried a bare
`<input type="number">` — the only control on the site the *browser* drew rather than the stylesheet,
spinner arrows and all. The replacement is not a bespoke stepper either; that was tried and it looked
wrong for a measurable reason: its `−` / `+` glyphs sat at **12.08:1 against the page ground where the
affix chips the calculator uses sit at 5.15:1**, at 15px against their 11px, with an outline *and* two
internal dividers packed into a small box. Same tokens as everything else, roughly three times the
ink — which is what "bright white" meant.

The site already has an input anatomy: a `.calc-unit` with small dim mono affix chips for the unit.
The quantity control simply **is** that, with the chips as buttons:

```html
<td class="hw-qty">
  <div class="calc-unit">
    <button class="cu-pre hw-step"  data-step="-1">−</button>
    <input type="number" data-qty="3" value="0" aria-label="Quantity of Antminer S21 XP">
    <button class="cu-post hw-step" data-step="1">+</button>
  </div>
</td>
```

`.hw-step` adds only the button reset and the hover. The edge, the ground, the chip colour and the
focus ring all come from rules the calculator owns, so the two cannot drift. There is no per-row
label — the `<th>Quantity</th>` heading is the label, and repeating it twenty-eight times would be
noise; the field carries an `aria-label` naming its machine instead. `hardware-suite.js` asserts the
parts are shared, that the heading exists, and resolves the rendered chip colour through `cascade.js`
rather than reading the rule, because `.hw-step` sits after `.cu-pre` at equal specificity and a
colour declared on it would win silently.

> One trap worth recording: **`cascade.js` resolves longhands and never expands `border`.** `.hw-step`
> sets `border: 0` to strip the button chrome, so asking it for `border-right` cheerfully reports
> `.cu-pre`'s hairline as the winner while a real browser has already wiped it with the shorthand. The
> divider check resolves both and compares which actually outranks the other; the first version of it
> passed a mutation that removed the divider entirely.

The stylesheet also declares `color-scheme: dark` on `:root`. Without it every form control on the
site — caret, spinner arrows, autofill, scrollbars — is drawn from the *light* system palette, which
is where a stray white field comes from on a page that declares none of its own.

### A row holding machines lights up

`.hw-table tr:has(input[data-qty]:not([value="0"])) .hw-name` turns the machine name BTC orange, so a
long list still shows what has been picked without scrolling back to the summary. **This is the one
part with a real trap in it, and the original version of the rule could never have fired.** CSS
attribute selectors read the *content attribute*, which neither typing nor `input.value = n` updates.
A version that sets only the property keeps every total correct and silently never lights a row.
`setQty()` writes both, and the suite drives the `+` button and reads the attribute back off the
element rather than grepping for the call.

### It hands off to the calculator

Every row links to `calculator.html?minerModel=…&machineCount=…`, and the order summary links with
the whole order. That needed no new machinery: the scenario encoder built for shareable links
already reads both keys. `hardware-suite.js` checks the link is built and encoded; `calc-link.js`
already proves the decode half.

### The form is the weak link

It reuses the `form[data-mailto]` handler, so it opens a **draft** and sends nothing. Where no mail
client is registered, nothing happens at all. Losing a contact enquiry that way is bad; losing an
order while the customer believes they placed it is worse. So this page prints the address beside
the form, offers a **Copy the order** button, and says in as many words that nothing is sent until
you send it. Tests assert all three, and that no success message ever claims otherwise.

**This is the third time real submission has come up.** It is now the weakest link in a conversion
path rather than a nice-to-have, and [`worker/`](../worker/) already has the Cloudflare Worker
pattern to copy.


## The order, and the checkout

[`cart.js`](./cart.js) holds what has been chosen; [`cart.html`](./cart.html) spends it. Quantities
used to live in the DOM of `hardware.html`, so picking eight machines and then following a link threw
the whole order away.

**It stops at a deposit, and does not take money.** Proton sources per order rather than holding stock,
so price and lead time are confirmed against a distributor per order. The checkout produces an order
and says, in as many words, that nothing is charged on the page — you send it, we quote it, the
deposit reserves it, the balance falls due before shipping. Card rails, BNPL, refunds and tax
handling are all out of scope for the same reason, and there is a test that no phrase on the page
ever suggests money changed hands.

> **The deposit rate is a commercial term and it has not been confirmed.** `DEPOSIT_RATE` is 0.25,
> drawn from what the market does. It lives in [`price-list.js`](./price-list.js) beside the prices
> because it belongs to the same category — a number that binds only on a quote — and changing it
> there changes every figure and caption on the checkout. Confirm it before publishing, along with
> the 5.8× $/TH spread the prices still carry.

### The store is deliberately dependency-free

Every page loads `cart.js` so every nav can show the order, and most pages load neither `miner-db.js`
nor `price-list.js`. So the store itself only ever handles **model names and counts** — that is all
`count()` needs, which is all the nav badge needs.

Anything requiring a hashrate or a price lives in `lines()` and `totals()`, and those return **`null`,
not `[]`**, when the tables are absent. The distinction matters: an empty array means "the order is
empty", `null` means "this page cannot answer". A caller that conflates them renders *nothing in your
order* over somebody's saved cart because a script tag was missing. Both pages check for `null` before
rendering, and there is a test that drives the store with `MinerDB` deleted.

### What comes back out of storage is untrusted

It is the only input on the site that was not typed into a field: it may have been written by an older
version of this code, by another tab, or by hand in devtools. `clean()` runs at **every** boundary —
read, write and `set()` — and drops anything that is not a model name against a positive whole number,
rather than trying to repair it. Quantities are capped, because a stored number reaches arithmetic
that reaches the page.

That triple-guarding has a testing consequence worth recording: **no single-point mutation of the
sanitiser is observable**, because the other two boundaries still catch it. The suite proves the
invariant instead — neutering `clean()` outright fails seven checks.

Storage that throws is handled the same way. Private browsing, disabled storage and `file://` all fail
on read or write; a cart that throws takes the page with it, so it degrades to memory and the page
never knows.

### The money

| Figure | Where it comes from |
|---|---|
| units, hashrate, draw | `miner-db.js`, times the counts |
| indicative hardware | `price-list.js`, times the counts |
| deposit | `DEPOSIT_RATE` × the hardware total |
| balance | hardware total − deposit |

The deposit is the only figure on the site that is a *share* of another one, so the suite asserts both
halves add back up — quoting two numbers that do not describe the same order is the failure worth
catching. A machine with **no price on file** is counted as unpriced, never as zero dollars, so it
cannot quietly under-quote the order or under-charge the deposit.

> That test was vacuous when first written. It looked for a machine with no price, found none —
> every model currently has one — and passed while asserting nothing. It now stubs the price list to
> force the path.

### Both pages key quantities by model

Not by row position. An index means a catalogue that gains or loses a machine silently shifts somebody's
saved order onto its neighbour, and it would force the two pages to agree on a sort order forever.
There is a test that neither file emits an index-keyed `data-qty`.

A model held in a saved order that the catalogue no longer lists is **reported, not dropped** —
silently deleting somebody's line is worse than telling them it went.

### The nav badge

`.nav-links a.nav-cart`, not `.nav-cart`. The badge is an `<a>` inside `.nav-links`, so `.nav-links a`
is (0,1,1) and beats a bare class at (0,1,0) — the first version rendered at the nav link's own padding
and 15px type, which pushed the whole nav into wrapping at desktop widths. It is the same trap
`.nav-cta` already carries a note about, and the suite resolves the rendered value through
`cascade.js` rather than reading the rule. The nav's compact breakpoint moved from 1080px to 1240px to
make room for it.

It is hidden entirely at zero rather than showing a `0`, so the nav is seven items again the moment
the order is emptied.

### Where the machines go

The destination is the point of the checkout: a Proton facility, the customer's own site, or a
third-party facility. Picking anything but Proton reveals the delivery address, and `required` is added
and removed with it — a hidden required field blocks submission with a validation message pointing at
something nobody can see. The page says plainly that ASICs arrive as palletised freight and need
somebody able to receive them, and that cross-border orders carry duty and clearance.

### Still the weak link

The form is the same `mailto:` handler as everywhere else, so it opens a **draft** and sends nothing.
The page prints the address and offers Copy for exactly that reason. This is now the fourth time real
submission has come up, and it is carrying an *order* rather than an enquiry —
[`worker/`](../worker/) has the Cloudflare Worker pattern to copy.

## Taking the order for real

[`worker-orders/`](../worker-orders/) is a fourth Cloudflare Worker, alongside the Strike, QuickBooks
and F2Pool proxies already deployed. It takes an order from `cart.html`, prices it, and holds it
through a lifecycle. **It does not take money and does not buy anything** — see below.

### The one rule: the browser does not price the order

`Cart.totals()` computes totals client-side so the checkout can show them. **A number computed in a
browser is a number the customer controls** — edit localStorage, or the script, and submit a $1
deposit on a $52,000 order. So the checkout sends **models and counts only**, and the Worker
recomputes every figure from `catalogue.js`. Prices, deposits and line totals in the request are
ignored even when present.

The suite sends real orders carrying forged totals, forged per-line prices, unknown machines,
negative quantities, a quantity of 1e9, and duplicated lines. There is a mutation for each, including
one that makes the handler honour `body.usd` — all thirty-two are caught.

> Server-side pricing stops **tampering**. It does not fix **wrong** prices: `price-list.js` still
> spans 5.8× in $/TH and `DEPOSIT_RATE` is still an unconfirmed 0.25. Both remain go-live blockers.

### Where the catalogue comes from

`tools/build-order-catalogue.js` generates `worker-orders/catalogue.js` from `site/miner-db.js` and
`site/price-list.js`. Generated rather than byte-copied — the site's files are browser scripts that
assign a global and a Worker is an ES module — and the suite asserts every model, spec, price, the
`ASOF` date and the rate all agree.

The generator takes optional source paths. That is not flexibility for its own sake: **every machine
currently has a price, so the "no price on file" branch is unreachable from the real tables**, and an
unreachable branch passes every test while being wrong. The suite drives it against a fixture with
one price removed and asserts it emits `null`, never `0`.

### The lifecycle, including the parts that are a person

```
quote_requested → quoted → deposit_invoiced → deposit_paid
                                                   ▼ ◀── a person places the PO
                                              po_placed → balance_invoiced
                                              → balance_paid → shipped → delivered
```

**No ASIC distributor exposes a public ordering API.** Bitmain, MicroBT and Canaan sell through
accounts and channel partners; secondary desks trade over email against a wire. Every broker
automates up to the money landing and then picks up the phone. The two marked steps are that, and the
status page says so rather than showing a spinner that implies otherwise.

Statuses advance **one step at a time**, forward only. `cancelled` is always reachable and is a dead
end — and that guard is load-bearing in a way that is easy to miss: `stepOf('cancelled')` is `-1`,
and `-1 + 1 === 0`, so the one-step rule alone would happily revive a cancelled order back to
`quote_requested`. Every other transition is caught by the step arithmetic; that one is caught by
nothing else, and there is a test naming it.

### The endpoint is unset, and that is a supported state

`ORDERS_ENDPOINT` in `checkout.js` is empty until the Worker is deployed. With it empty the page
behaves **exactly as it did before any of this existed** — a mail draft plus a copyable order — and
upgrades itself the moment a URL is set. Same convention as the calculator's market fetch: every
failure path falls back to something honest rather than showing an error. If the POST fails, the page
says what happened, says nothing was sent, and hands back the address.

### A bug only a browser could find

The reference the customer gets back is their only handle on the order. `showPlaced()` empties the
cart; emptying fires a re-render; and the reference panel was sitting **inside** `#ckBody`, which the
re-render hides. The order was placed and the page said *"nothing in the order yet"* one frame later.

Every unit test passed. It took driving a real Chrome against a real Worker to see it. The panel now
sits outside the cart body, `render()` stands down once `placed` is set, and three mutations cover it.

### Deploying it

```
cd worker-orders
wrangler kv namespace create ORDERS      # put the id in wrangler.toml
wrangler secret put OPS_SECRET           # bearer token for the owner routes
wrangler deploy
```

Then set `ORDERS_ENDPOINT` in `site/checkout.js` and add the origin to `ALLOWED_ORIGINS` in
`worker-orders/index.js`. Owner routes (`GET /orders`, `POST /orders/:ref/status`) take
`Authorization: Bearer <OPS_SECRET>`; an unset secret **closes** them rather than opening them, and
there is a test for that.

## Paying for an order

[`cart.html`](./cart.html) → **Pay the deposit** → [`pay.html`](./pay.html) → [`order.html`](./order.html).

The catalogue's quantities become a persisted cart, the cart becomes an order with a reference, the
reference becomes a Strike invoice, and the order page follows it to delivery. Customers choose
**deposit** or **pay in full**; both are the same rail with a different amount.

### The rule, restated for money

Stage 1's rule was that the browser does not price the order. The payment rule is the same shape and
higher stakes: **the browser does not decide what was paid.** `GET /orders/:ref/payment` reads no
request body at all — it asks Strike and reports the answer. The suite attacks it with
`?state=PAID`, `?paid=true`, `?settled=1` and a POST claiming settlement; all return UNPAID, and
the POST 404s. A Strike outage reports `UNKNOWN`, never `PAID`, and the page tells anyone who has
already sent money that it is not lost.

Invoices are **USD-denominated** and quoted into bitcoin at pay time, so a customer owes $13,140
whatever bitcoin does in between. Asking for the same leg twice **re-quotes the existing invoice**
rather than minting a second one — quotes expire in about an hour and orders take days, and two live
invoices for the same money strands whichever one is not paid.

### On-chain first

Lightning routing is unreliable well below a five-figure payment, and nobody moving $13,140 is doing
it from a phone wallet. The on-chain address is the primary rail; Lightning is offered underneath. If
Strike fails to produce an address the invoice still stands with Lightning alone, rather than the
whole payment aborting.

### There is no QR code, and that is a decision

Rendering one needs an encoder whose output **cannot be verified from here** — there is no decoder to
check it against — and a QR that silently encodes a wrong address sends five figures somewhere
unrecoverable. The app fetches QR images from `api.qrserver.com`, including for a bitcoin address
([`banking.js`](../banking.js)); doing that here would hand a customer's payment address to a third
party. The address is shown in full instead, grouped into fours so it can be checked by eye, with a
copy button and a `bitcoin:` wallet link.

> The copy button and the wallet link carry the **raw** address, never the grouped display string —
> a wallet handed `bc1q xy2k …` cannot pay. Two mutations cover it.

### The steps that are a person

`order.html` marks two steps **our side**: confirming the price with a distributor, and placing the
purchase order. No ASIC distributor exposes an ordering API, so those are somebody picking up the
phone. A progress bar implying otherwise would be lying to a customer who has paid a deposit.

### Two guards that were blind, and how they were found

**The third-party-request check could not see URLs.** It stripped `//` line comments before scanning
— and `https://` contains `//`, so every outbound address was deleted before the check ran. A
mutation inserting a live `api.qrserver.com` fetch sailed straight through it. The stripper now
ignores `//` preceded by a colon.

**The sitemap parity check exempted `404.html` by name.** The stated reason was always "it carries
noindex", so it now *reads* each page and exempts the noindex ones — which covers `pay.html` and
`order.html` for the same reason, and covers whatever comes next without being edited.

### Switching it on

```
cd worker-orders
wrangler kv namespace create ORDERS       # id into wrangler.toml
wrangler secret put OPS_SECRET
wrangler secret put STRIKE_API_KEY
wrangler deploy
```

Then set `ORDERS_ENDPOINT` in `checkout.js`, `pay.js` and `order.js`, and add the domain to
`ALLOWED_ORIGINS`. **All three default to empty, and empty is a supported state** — the checkout
falls back to a mail draft, and both new pages say plainly that payment is not switched on rather
than hanging. No key reaches the browser and there is a test for it.

> **[`strike.js`](../worker-orders/strike.js) is the one file no test can settle.** Response shapes
> are Strike's to define; everything around the call is proven, the call itself needs one live smoke
> test with a real key before it takes a real dollar.

## Three ways to pay

Bitcoin, card and wire, chosen on `pay.html`. One rail visible at a time — a screen showing an
address and a card button together invites paying twice, and only one of those refunds easily.

### Cards are capped to the deposit, in the Worker

~2.9% is about **$381 on a $13,140 deposit** and **$1,525 on a $52,560 order paid in full**, and the
whole of it stays chargeback-exposed after machines have shipped to a facility Proton does not control.
So cards take the deposit; the balance comes by wire or bitcoin at no fee.

**The cap lives in `METHODS` in the Worker, not in the page that hides the button.** A rail the
interface does not offer is still a rail somebody can POST to. The suite POSTs
`{leg:'full', method:'card'}` and `{leg:'balance', method:'card'}` directly; both are refused.

### The success redirect proves nothing

This is the card equivalent of "the browser does not decide what was paid", and it is sharper, because
after paying there is a URL the customer lands on. **Anyone can open that URL, with any query string,
having paid nobody.** Only `POST /stripe/webhook` may settle a card payment.

The webhook verifies HMAC-SHA256 over `timestamp.payload`, compared in constant time, inside a
five-minute window — without the window a captured request stays valid forever, so anyone who ever saw
one legitimate webhook could replay it later. It then checks the amount Stripe says it collected
against what the order says is owed, and that `payment_status` really is `paid`.

The suite tries: no signature, empty, malformed, wrong secret, signed over a different body, replayed
from an hour ago, correct signature with the wrong amount, and a completed session that was never
paid. Only a correct one settles anything, and **every rejection returns the identical message** —
an endpoint that explains which part of a signature failed helps somebody forge the next one.

> That last assertion needed strengthening. The first version grepped one response for words like
> "secret" and "timestamp"; a mutation echoing the real reason back passed it, because that particular
> reason happened not to contain any of them. It now asserts four different causes produce byte-identical
> replies.

### One leg, one settlement

A customer can open a card checkout and then send bitcoin instead. Both attempts stay on the order,
keyed `leg:method`, but the first to land closes the leg and every other attempt stops being payable.
Without this they are charged twice and the order advances twice.

Whichever panel is open sees it: someone watching the bitcoin tab when a card payment lands is shown
PAID, so they do not pay again.

### Wire is instructions, and says so

`site/bank-details.js` holds the details, every field a visible `[PLACEHOLDER]`. **Wrong bank details
are worse than absent ones** — an absent one stops somebody and makes them ask; a wrong one sends five
figures somewhere unrecoverable. So unfilled fields render in the site's placeholder orange, and the
page says outright: *do not send anything against them*. There is a test.

The order reference is shown as the thing that must be quoted on the transfer, because it is the only
way an incoming payment gets matched. The page states plainly that a person confirms it and that the
page will not update by itself.

### Can you send bitcoin to the address on screen?

**No, and it is checked rather than asserted.** Demo mode shows `DEMO-NOT-A-BITCOIN-ADDRESS-DO-NOT-SEND`;
the dev server shows a regtest string in mixed case, which bech32 forbids, with characters outside its
alphabet. Every wallet rejects both before a send can be confirmed.

### Every pretending mode says so

The banner is raised from a `demo: true` flag. `tools/dev-server.js` stubs Strike at the fetch layer,
so the Worker answered normally and **no flag was set** — that mode showed a fake address, said
"waiting for the payment to arrive", and warned nobody. The dev server now marks its responses.

### Switching it on

```
wrangler secret put STRIPE_SECRET_KEY        # sk_live_… or sk_test_…
wrangler secret put STRIPE_WEBHOOK_SECRET    # whsec_… from the endpoint you register
```

Point a Stripe webhook endpoint at `https://<worker>/stripe/webhook` for
`checkout.session.completed`. Without `STRIPE_SECRET_KEY` the card rail returns 503 rather than
pretending; without `STRIPE_WEBHOOK_SECRET` the webhook refuses everything rather than trusting it.

> **[`stripe.js`](../worker-orders/stripe.js) is the second file no test can settle**, alongside
> `strike.js`. Response shapes are Stripe's; everything around them is proven, and one live test with
> test keys is what remains.

**Before it takes real money:** confirm Stripe will take the business in writing (high-ticket mining
hardware is commonly treated as high-risk), fill in the bank details, reconcile `price-list.js`,
confirm `DEPOSIT_RATE`, and write terms of sale saying when a deposit stops being refundable — a card
deposit with no stated refund terms is a chargeback waiting to happen.

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

### Shareable scenarios

The calculator's state lives in the query string, so a scenario can be sent to a colleague — or
sent *to* a prospect, pre-filled at a quoted rate — and it survives a reload. **Only values that
differ from the shipped defaults are written**, so an untouched page has a bare URL and a tweaked
one stays short. The diff basis is the same `data-default` attribute the Reset button reads, rather
than a second table of defaults that would drift away from the markup.

Keys are element ids. A machine named in a link implies its own spec fields, so those are written
only when they no longer match it — which is exactly when someone has hand-edited a custom machine.
Unknown keys are ignored on the way in, so a link made by an older version of the page still opens.

The address bar tracks the scenario through `history.replaceState` (debounced, and *replace* so the
back button does not fill with one entry per keystroke), and a **Copy link** button beside Reset
does the same thing for people who would never think to copy from the address bar.

> **The trap.** `fetchMarket()` overwrites any market field still holding its default. A link that
> names a price meant *that* price, not today's — so fields restored from a URL are marked pinned
> and the fetch skips them. `calc-link.js` asserts both halves: a pinned price survives the fetch,
> and an unpinned one in the same page load still goes live.

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

The implementation notes below describe the generated SVG fallback and its
history. The default interactive windows now use the shared WebGL presentation
described under **Build your mine** above; keep both paths when changing content.

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

There are **six** drawings now, sharing one engine:

| File | Role |
|---|---|
| [`diagram-engine.js`](./diagram-engine.js) | Everything scene-agnostic. `createDiagram(scene)` is a **factory**, not a singleton — view state lives per instance, so two diagrams can never share it. |
| [`scene-site.js`](./scene-site.js) | Home page: gas conditioning, genset, transformer, two containers. |
| [`scene-hosting.js`](./scene-hosting.js) | Hosting page: inside one container, drawn ~2.4× closer so each machine is legible. |
| [`scene-asic.js`](./scene-asic.js) | Hosting page: one machine, the far end of that page's slider. |
| [`scene-pad-now.js`](./scene-pad-now.js) / [`scene-pad-ion.js`](./scene-pad-ion.js) | Energy page, **flared gas**: a wellpad flaring, and the same pad with our kit on it. |
| [`scene-landfill-now.js`](./scene-landfill-now.js) / [`scene-landfill-ion.js`](./scene-landfill-ion.js) | Energy page, **landfill gas**: a collection system flaring, and the same site with our kit on it. |

The energy page carries **four** of these, in two pairs behind a fuel switch — see
[Landfill leads](#landfill-leads-and-what-that-did-to-the-drawings) below.

A scene supplies `view`, `renderables`, `callouts`, `flow`, `regionBoxes`, `objects`,
`extraBoxes` and `data`. Builders receive the engine's helper bundle as `H` rather than
reaching for globals, so a scene never touches engine internals.

**Re-run the generator after any change to a scene:**

```sh
node tools/build-diagram.js            # both pages
node tools/build-diagram.js hosting    # just one
```

### Landfill leads, and what that did to the drawings

The company's priority moved to **landfill gas first, flared gas still served and second**.
That is a copy change almost everywhere and a drawing change in exactly one place.

**Ordering.** Wherever both fuels are named, landfill comes first: the footer tagline on all
eleven pages, the home hero, the four-fuel grid and the enquiry form on `energy.html`. The
tagline is **generated** — it lives in `tools/build-seo.js` as a string split across three
lines. Fixing the eleven pages without fixing the generator buys exactly one build, which is
what happened the first time.

**The flare framing survived, on purpose.** It is tempting to read "The flare goes out.
Nothing else moves." as oil-and-gas language that had to go. It is not: landfill gas is
flared too, and most collection systems end in an enclosed flare. The heading, the slider
ends, and "your flare stays" are all true of both fuels and were left alone.

What is genuinely oil-and-gas-only is the **upstream vocabulary** — wellhead, separator, tank
battery, lease, royalty, Permian, Bakken. A landfill has none of those. Those words are gone
from the page's narrative, which now says "your collection system, your existing equipment"
and lets whichever drawing is on screen be the specific one.

They are **not** gone from the page, and should not be. Two zones keep them legitimately:
the *Flared associated gas* card, which is about oil and gas, and the wellpad drawing behind
the fuel switch, whose own labels and alt text describe a wellpad. `landfill-copy-suite.js`
carves both zones out and asserts the vocabulary is absent from everything that is left —
scoping that matters, because a check that greps for absent words also passes when its own
carve-out has silently eaten the whole page.

**The drawings.** `index.html` and `hosting.html` draw conditioning → generation → containers,
which is the same whatever feeds it, and needed **no change at all**. Only `energy.html` drew
a well pad. It now carries two pairs and a switch:

| Pane | Scenes | Camera |
|---|---|---|
| Landfill gas *(open at load)* | `landfillnow` / `landfillion` | `data-link="landfill"` |
| Flared gas | `padnow` / `padion` | `data-link="pad"` |

Five rules hold this together, and each has a test behind it:

1. **The two pairs must not share a camera.** `data-link` is what joins two views' view state.
   If both pairs named the same one, turning the landfill would turn the wellpad behind it and
   the pane you switched to would be facing somewhere you never put it. The generator exits
   non-zero on a duplicate.
2. **Every drawing needs its own id prefix.** All four answer to `<prefix>dg-flow`,
   `<prefix>dg-s0-top` and the rest. A repeat means two scenes writing the same path element,
   which looks like one drawing simply refusing to move. The generator exits non-zero on that
   too, and a separate check asserts no id is duplicated on any page.
3. **The slider driver binds every slider, not `#dgScale`.** It used to look that id up once,
   which was correct while a page could only carry one pair. Two panes means two sliders and
   two `.dg-views`, each scoped to its own `.dg-fuel-pane`.
4. **Hiding a pane is free.** `diagram-engine.js` gates each drawing on an `IntersectionObserver`
   at `threshold: 0`, and a hidden pane has no box to intersect, so its render loop stops on its
   own. Both panes stay mounted and keep their view state; switching back finds the drawing
   exactly as you left it. The canvas behind each drawing is gated the same way.
5. **The hidden pane must come back without JS.** Every drawing here ships a static frame so
   that JS-off still gets a complete, annotated diagram — a promise made further down this file.
   A pane hidden at load breaks it for the second fuel, so `build-diagram.js` emits a
   `<noscript>` block that hides the (useless) switch and un-hides the second pane. That
   override needs **`!important`**: `styles.css` carries a global
   `[hidden] { display: none !important; }`, and the first version of the fallback was a plain
   `display: block` that lost to it silently and looked perfectly reasonable in the source.
   Between two important author rules specificity decides, and `.dg-fuel-pane[hidden]` (0,2,0)
   beats `[hidden]` (0,1,0).

**Drawing a landfill is harder than it sounds, and it took three goes.** The cell was a stack
of four inset boxes first — which is how a landfill is *built*, lift by lift, so it sounded
right. Boxes have vertical walls and square corners, and it read as a warehouse. The second
attempt sloped the sides but eased the batter off toward the top, making it convex: a grassy
hill, or a circus tent. Nothing man-made has a continuously softening slope. What works is a
**frustum** — one constant batter, a flat crown, a lobed (never rectangular) outline, and the
benches drawn as contour lines *across* the slope. A bench is a terrace cut into a face, so
there has to be a face for it to be cut into; that is the whole reason the box version could
never have read correctly no matter how it was shaded.

A fourth pass added the thing that finally sold it: **the benches are terraces, not lines.** A
bench on a real cap is a road — a flat strip a few metres wide, cut into the face so a truck can
drive it and so surface water has somewhere to go. `LEVEL_Y` / `LEVEL_S` therefore read *toe,
slope, bench, slope, bench, slope, crown*, where two consecutive entries at the same height are a
terrace. The flat bands take `.dg-top` and the sloped bands `.dg-side`, and that alternation down
the face is what reads as engineered fill rather than a hill.

**The ground is two surfaces.** It was one, and the cell hung off the edge of it: the toe reached
x −23 while the slab started at −19, so a quarter of the landfill floated past the ground it
stands on. Now `GROUND` is earth and covers everything with margin, and `PAD` is the graded gravel
compound that only the plant stands on — which is also what a real site looks like. `GROUND` is
deliberately **not** in `extraBoxes()`: the fitter sizes the drawing from whatever it is given, and
a ground plane forced inside the callout rails would shrink the whole site to make room for empty
earth. The wellpad does the same with its own slab.

**Every well is tied back to the header, over the cap.** The callout has always said "every well
tied into one main running to the plant"; what was actually drawn was four stubs of pipe lying on
the ground *in front of* the toe, joined to nothing, while the wellheads stood on the mound
connected to nothing at all. Each lateral is now walked over the cap in steps, taking its height
from the same surface function the mound is drawn from, as a hairline rather than pipe — eleven
laterals at pipe weight would bury the mound they lie on.

Two things about that surface are load-bearing:

- **Winding order decides which half of the mound you see.** The engine culls on the sign of
  the projected area, so a band wound the wrong way keeps the *far* half and discards the near
  half — you end up looking at the inside of the back surface. It does not look like an error;
  it looks like a hollow shell or a draped sheet. At yaw 0 it was drawing eleven of the twelve
  far segments and one of the eleven near ones.
- **Contour lines have to be culled too, not just the faces.** The faces are translucent, so a
  bench drawn all the way round shows its far half straight through the mound and the whole
  thing reads as a wireframe dome. Culling the quads but not the lines is the kind of
  half-applied fix that looks deliberate in the source.

`lift()` and the drawn contours are both derived from one `LEVEL_Y` / `LEVEL_S` / `radial()`,
so the surface a wellhead stands on and the surface you see cannot drift apart. A suite check
asserts every well is flush with the cap and that the cap falls away from the crown in every
direction with no step.

**`buildPad` must not delegate to `PadGeometry`.** It did, and `P.buildPad` closes over the
*wellpad's* 44 x 22 slab at z 0 — so the landfill's own `PAD` and `ROAD` were never drawn. The
gravel under the landfill was the wellpad's, in the wellpad's place, and since it stops at
z 11 while the far container sits at z 17, the containers stood off the front edge of the
ground they are supposed to be standing on. The *technique* is still borrowed (build into a
scratch bundle, fold it all into the `ground` layer); the dimensions must be this file's own.

**Growing the mound does nothing on its own — `SHIFT_X` is what pays for it.** The drawing
rotates about the model origin, so the size of the circle it sweeps depends on how far the heavy
things sit from that pivot, and the fitter buys `BASE_SCALE` out of whatever is left. The cell sat
6 m off to one side: enlarging it from 32x18x7 to 37x25x11 dropped the scale from 13.0 to 10.5 and
left the mound *exactly the same size on screen*, with everything else 19% smaller. Setting
`SHIFT_X: 6.0` — applied before the rotation, so it moves the site onto the pivot — took the scale
back to 12.0 and the mound from 393x88 px to 416x120 px. If the drawing ever needs to be bigger,
this is the lever, not the dimensions.

**`BASE_SCALE` and `ORIGIN` for the landfill pair are fitted, not chosen.** Scale is applied
before the perspective divide, so what fits head-on tells you nothing about what fits at
three-quarters. An eyeballed 13.6 looked right in a screenshot and ran the mound out under the
callout labels and off the bottom of the frame as it turned — the check that caught it sweeps
all 360° and compares against the leader rails. Change anything in `landfill-geometry.js` and
that fit has to be redone; both scene files carry the block verbatim and a test compares the
two sources, not just the resolved numbers.

**The flare business is provably untouched.** `snapshot.js verify` holds a baseline of every
path string in every scene. The five that existed before this change — including both wellpad
drawings — still match byte-for-byte; the landfill pair was added to the baseline rather than
replacing anything.

### Five things that are easy to get wrong

**1. +Z is the near side.** The perspective divide is `FOV / (FOV - z2 * SCALE)`. With `+`
instead of `-`, −Z becomes near and the whole scene renders inside-out — you face the far wall,
the cutaway points away from you, and the ASIC fans face into a wall. The scene is authored
throughout to "+Z toward the viewer"; that convention decides which wall is cut and which way the
machines point.

**0. All six drawings share one set of face weights** — `.dg-top` / `.dg-side` / `.dg-end` at
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
