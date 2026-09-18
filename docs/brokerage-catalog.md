# Brokerage miner catalog

The brokerage page browses **15 representative industrial Bitcoin miner families and 63 configurations, bins or operating modes**, researched on **2026-09-18**. It covers Bitmain Antminer, MicroBT WhatsMiner, Canaan Avalon and Bitdeer SEALMINER. All 28 model names from the previous catalog remain discoverable. Unsupported bins remain request-only with unknown specifications rather than inheriting estimates.

This is a sourcing catalog. A visible product, quote request or seller listing does not establish Proton inventory, supplier allocation or delivery availability. Residential and non-SHA-256 products are outside the current scope.

## Files and source evidence

- `site/brokerage-catalog-data.js`: browser/Node data module, source records, freshness rules and comparison API.
- `site/brokerage-catalog.js`: search, family/variant selection, evidence and local quote comparison.
- `site/brokerage-scene.js`, `site/brokerage-stage.js`, `site/brokerage-models.js`: preview lifecycle, rendering and representative exteriors.
- `tests/site/brokerage-catalog-data-suite.js`: pricing and evidence regression checks.

Each variant contains specification links and a `specNote`; each market observation records its seller URL, exact hashrate bin, condition, currency, scope, check date and availability wording. Conflicting power or efficiency fields remain `null`, including the affected Avalon configurations. Unknown dimensions are not inferred from a similar miner.

Useful primary starting points are [Bitmain S21 XP specifications](https://support.bitmain.com/hc/en-us/articles/35383015643673-S21-XP-Specifications), the [Bitmain S23 Hyd. manual](https://file12.bitmain.com/shop-product-s3/firmware/807d3b27-f625-470f-a940-247f83b36854/2025/06/20/14/S23%20Hyd.%20Product%20Manual_v1.0.6.pdf), [MicroBT's shop](https://shop.whatsminer.com/products), [Canaan's shop](https://shop.canaan.io/products/) and [Bitdeer's shop](https://www.bitdeer.com/shop/allproducts/miner). Public seller observations also include [ASIC Xchange](https://asicxchange.com/retail/asic-miners/). Follow the exact per-variant links when updating a bin; a category's lowest price may refer to another configuration.

The original research packet is `reports/miner-catalog-2026-09-18/{research.json,market-research.md,geometry-references.json}` in the main workspace. Its conclusions are reflected here: no confirmed Proton quotes were found; seller stock and batch wording can conflict; factory CAD was not obtained. The maintained website data module is the deployed input. The research packet records what was observed and should be updated alongside a new source review, not used as an automatic price feed.

## What a displayed price means

`marketFor(variant, date)` returns a current, stale or unavailable **public hardware asking-price reference**. Numerical references require the exact bin, matching new/used condition, USD currency and hardware-only scope. The default browsing reference is new hardware. Sold-out, preorder, conditional coupon, hosting-required, tax-inclusive or otherwise non-comparable observations do not contribute a number. Their evidence may remain visible with its limitations.

One eligible listing is one asking-price reference. Multiple eligible listings yield a range and a median of those observed listings, not a whole-market average. Freight, tax, duties, payment costs, brokerage fees, installation and cooling are excluded or unconfirmed. The arithmetic cannot establish total delivered savings or mining profitability.

An observation remains eligible for seven calendar days after its check date, unless it expires earlier. On day eight it becomes stale. Future or invalid dates are rejected. A date stamp records the last check; it is not a seller guarantee that the price will remain available for seven days. There is no background price refresh.

`compareQuote(variant, quote, date)` compares an entered per-machine hardware price with matching references. It requires numeric positive USD, exact hashrate, condition and `scope: 'hardware-only'`. The displayed difference is reference median minus entered quote. A negative difference remains a higher cost, and unknown costs are never silently zero. The browser worksheet is local and does not issue or verify a Proton offer.

All catalog `protonQuote` fields are currently `null`. Consequently `savingsFor` returns `quote-required`. The old miner database estimates and inherited price list are not executable Proton quotes and must not be reused as offers or used to invent a discount percentage.

## Updating a price or adding a quote

1. Open the exact manufacturer's specification and seller product page. Check the selected bin, condition, included accessories, batch, delivery wording, currency and commercial terms. Keep ambiguous or unavailable listings as evidence with `comparable: false` or their actual unavailable status.
2. Update the variant's observations with the observed amount, exact HTTPS URL, seller, bin, condition, `currency: 'USD'`, scope, real `checkedOn` date, availability and a concise note. Preserve material exclusions. Do not attach a neighboring bin's cheapest category price. Add `expiresOn` when the offer supplies an expiry.
3. For an actual Proton offer, obtain the approved per-machine hardware quote and match its bin, condition, quantity and commercial scope. Populate `protonQuote` only with verified `confirmed: true`, `comparable: true`, `usd`, `currency`, `hashrateTH`, `condition`, `scope`, `checkedOn` and `expiresOn`. Retain the supporting commercial evidence in the appropriate internal record; do not publish private supplier documents or customer details. A missing component or unmatched scope keeps the quote unconfirmed.
4. Update source notes and the research packet, then run `node tests/site/brokerage-catalog-data-suite.js` and the site's standard build/check workflow. Check the browser's source details, current and expired price states, selected bin, and any negative difference before release.

Keep the seven-day check and explicit quote expiry when refreshing data. Do not make an expired offer look current merely by changing the top-level catalog date. If a total delivered comparison is added later, it needs matched destination, quantity, delivery, warranty and all landed charges on both sides; this module does not calculate that total.

## Exterior rendering limits

Each of the 15 family previews reconstructs a named representative exterior from public manufacturer photographs and manuals. The selected variant can have different verified dimensions or operating specifications. The UI's “Shown” label identifies the rendered family, while source details describe the selected variant. A neighboring variant selection does not establish that its ports, casing or batch details are identical.

`dimensionsMM` stores verified specification dimensions in L × W × H order. Geometry uses the representative definition unless an explicit `renderDimensionsMM` override is supplied; do not automatically stretch a verified representative to every variant's dimensions. For M66 immersion units, the manufacturer's raw dimensions lack reliable axis labels, so the numeric specification remains unknown and the visual axis interpretation belongs only to the model reference notes.

These are exterior reconstructions, not manufacturer CAD or verified engineering replicas. They omit unverified internals and must not be used for cooling, electrical, rack-clearance or installation design. New families need an exact representative reference, confirmed dimensional interpretation, a matching static poster and a mobile framing check before release.

## Regenerating the static previews

Run `node tools/render-brokerage-posters.cjs` from the repository. It renders each entry in `MODEL_DEFINITIONS` through the website's actual transparent stage and replaces the corresponding 1000 × 800 PNG in `site/miner-models/` (currently 15 images). Review the resulting posters and the live scene together after geometry changes.

The command requires Node.js, an existing `playwright` or `playwright-core` installation, and an existing Chromium or Chrome executable. It also checks the local `tools/.cache/hosting-terrain-browser/node_modules/playwright-core` dependency location. Set `PLAYWRIGHT_MODULE` to another installed package path when necessary; set `CHROME_PATH` to an explicit browser executable. Otherwise it checks Playwright's configured executable and common local Chrome/Chromium paths. It does not install packages or download browsers, and missing dependencies produce an actionable error.

Rendering uses a temporary loopback server restricted to `site/`, plus the explicit `/__models__` capture harness. Browser requests to other origins are blocked. The browser and server close on success or failure; if a render fails after writing some images, resolve the error and rerun the command before releasing the posters.
