# Hardware catalogue, orders and hosting

The Hardware page is a browsing guide for customers planning a hosted mining fleet. Its 3D catalogue covers **15 representative industrial Bitcoin miner families and 63 configurations, bins or operating modes**, researched on **2026-09-18**: Bitmain Antminer, MicroBT WhatsMiner, Canaan Avalon and Bitdeer SEALMINER. All 28 model names from the previous catalogue remain discoverable. Unsupported bins retain unknown specifications rather than inheriting estimates.

The 3D catalogue replaces the original miner-selection table and its table-specific search and economics controls. Facility selection, site power rates and monthly estimates, prepaid-electricity options and checkout remain available. The saved “Your order” summary sits beside the catalogue on desktop and follows it on smaller screens, where a compact order bar stays visible during browsing. The former Hardware quote-request form is removed; complete order review and any required quote request happen at checkout. There is no independent buy/sell brokerage form. A visible model or public price reference does not establish Proton inventory, supplier allocation, hosting capacity or delivery availability. Residential and non-SHA-256 products are outside the current catalogue scope.

`brokerage.html` remains only as a lightweight compatibility page. Its script preserves the incoming query string and redirects to `hardware.html#miners`; its ordinary link works without JavaScript. It canonicalizes to Hardware, stays out of the sitemap, and is not promoted in navigation or the Services footer. The filename remains reserved against generated blog posts.

## From browsing to the saved order

Browsing does not add machines automatically. A vertical family list with a visible native scrollbar sits to the left of the rendering. Centered up/down buttons browse the filtered families; Arrow Up/Down and Home/End work within the list. Selection reveals only the relevant list item without scrolling the whole page. Search, cooling filters and exact-variant buttons remain available. The buttons use local touch handling that suppresses double-tap zoom while preserving browser pinch zoom. The customer selects an exact variant and quantity, then uses the catalogue's order action. The selection enters the same persistent cart used by the order summary and checkout. Existing saved lines are preserved and can coexist with the new catalogue selections.

At widths of 1180 pixels and above, the full order is a sticky sidebar within the browsing workspace. Smaller screens show a compact order bar while the catalogue is visible and the full order is outside the usable viewport. The bar mirrors the existing order's hardware amount, including partial-price and quote-required qualifications, and carries the selected hosting location into checkout. Its review link leads to the full breakdown; the bar hides when that breakdown comes into view. The full order lists exact model names and quantities, retaining unavailable saved selections as needing review. No separate price calculation is used for the compact view.

`HardwareOrderCatalog` explicitly matches **12** catalogue configurations to existing order SKUs by manufacturer/model identity and exact hashrate and power. Those aliases reuse their existing cart keys and the legacy indicative pricing authority. The remaining **51** configurations use stable `catalogue:<variantId>` keys, preserve their exact display names and nullable specifications, and remain quote-required. A neighboring bin's price or identity is never borrowed to make a selection orderable.

The order summary and checkout multiply only known per-machine specifications. `unknownHash` and `unknownPower` count units whose specifications are missing; complete `th` or `kw` totals are `null` when incomplete, with known subtotals retained separately. Missing hardware prices remain quote-required. Unknown power prevents a fabricated prepaid-electricity total, and an unpriced hardware line prevents an apparently complete hardware-plus-electricity sum or deposit. Air, hydro and immersion cooling requirements remain distinct and require site confirmation.

Selecting or clearing a hosting location refreshes its rate, prepaid options and order breakdown. With no prepaid term, the monthly estimate uses 730 hours at the selected site's published rate and is shown separately from hardware capital. Unknown fleet power prevents that estimate. Calculator shortcuts remain available for known legacy models; an unsupported catalogue key or unknown specification cannot silently select a different miner in the calculator. Saved keys that are no longer recognized remain counted and named in the order, with specifications and prices requiring confirmation. Copy-order and quote-request actions remain on checkout.

Payment and order backends are unchanged. Fully supported legacy-key orders retain their existing checkout behavior. An order containing request-only catalogue lines keeps the exact selection and provides a quote-request path rather than submitting unsupported keys to the payment backend. Public seller references are not converted into payable Proton prices, and this page does not create inventory, site capacity, a binding quote or a CRM lead.

## Files and source evidence

- `site/brokerage-catalog-data.js`: browser/Node data module, source records, freshness rules and comparison API.
- `site/hardware.html`, `site/hardware-catalog.css`: the 3D selection area within the restored Hardware page.
- `site/hardware-catalog.js`: exact variant and quantity selection into the saved order.
- `site/hardware.js`, `site/cart.js`: retained order summary, facility/prepay controls and persistent cart.
- `site/checkout.js`, `site/prepay.js`: checkout and complete-versus-unknown price breakdowns.
- `site/brokerage-catalog.js`: shared search, family/variant selection and evidence; Hardware uses its hosting mode.
- `site/brokerage-scene.js`, `site/brokerage-stage.js`, `site/brokerage-models.js`: preview lifecycle, rendering and representative exteriors.
- `tests/site/brokerage-catalog-data-suite.js`: pricing and evidence regression checks.
- `tests/site/hardware-suite.js`: restored page sections, exact selection and unknown specification boundaries.

The shared catalogue and rendering files retain their `brokerage-*` names for reuse. Their filenames do not indicate a separate public brokerage service.

The running preview turns the modeled main and power-supply fan rotors independently of their fixed grilles and enclosures. Modeled green status LEDs stay lit with a restrained activity pulse; red fault indicators stay off. Hydro and immersion exteriors do not acquire air fans. These are illustrative animations, not live telemetry or manufacturer fan-speed claims. The pause button is removed. Manual rotation or zoom stops the camera's automatic orbit while fan and LED animation continues; Reset restores the default orbit. Offscreen, hidden and reduced-motion states stop automatic animation.

On touchscreens, one-finger horizontal intent rotates the model only after a movement threshold. Vertical and diagonal drags scroll the page; multitouch remains available to the browser for pinch zoom. Mouse dragging and keyboard rotation remain available. Touch events are kept out of OrbitControls so it cannot capture the start of a page scroll, and no global touch suppression or viewport zoom restriction is used.

Each variant contains specification links and a `specNote`; each market observation records its seller URL, exact hashrate bin, condition, currency, scope, check date and availability wording. Conflicting power or efficiency fields remain `null`, including the affected Avalon configurations. Unknown dimensions are not inferred from a similar miner.

Useful primary starting points are [Bitmain S21 XP specifications](https://support.bitmain.com/hc/en-us/articles/35383015643673-S21-XP-Specifications), the [Bitmain S23 Hyd. manual](https://file12.bitmain.com/shop-product-s3/firmware/807d3b27-f625-470f-a940-247f83b36854/2025/06/20/14/S23%20Hyd.%20Product%20Manual_v1.0.6.pdf), [MicroBT's shop](https://shop.whatsminer.com/products), [Canaan's shop](https://shop.canaan.io/products/) and [Bitdeer's shop](https://www.bitdeer.com/shop/allproducts/miner). Public seller observations also include [ASIC Xchange](https://asicxchange.com/retail/asic-miners/). Follow the exact per-variant links when updating a bin; a category's lowest price may refer to another configuration.

The original research packet is `reports/miner-catalog-2026-09-18/{research.json,market-research.md,geometry-references.json}` in the main workspace. Its conclusions are reflected here: no confirmed Proton quotes were found; seller stock and batch wording can conflict; factory CAD was not obtained. The maintained website data module is the deployed input. The research packet records what was observed and should be updated alongside a new source review, not used as an automatic price feed.

## What a displayed price means

`marketFor(variant, date)` returns a current, stale or unavailable **public hardware asking-price reference**. Numerical references require the exact bin, matching new/used condition, USD currency and hardware-only scope. The default browsing reference is new hardware. Sold-out, preorder, conditional coupon, hosting-required, tax-inclusive or otherwise non-comparable observations do not contribute a number. Their evidence may remain visible with its limitations.

One eligible listing is one asking-price reference. Multiple eligible listings yield a range and a median of those observed listings, not a whole-market average. Freight, tax, duties, payment costs, brokerage fees, installation and cooling are excluded or unconfirmed. The arithmetic cannot establish total delivered savings or mining profitability.

An observation remains eligible for seven calendar days after its check date, unless it expires earlier. On day eight it becomes stale. Future or invalid dates are rejected. A date stamp records the last check; it is not a seller guarantee that the price will remain available for seven days. There is no background price refresh.

The Hardware hosting mode shows public references and hosting requirements. It does not expose the former quote-comparison worksheet or a claimed Proton saving. The shared `compareQuote(variant, quote, date)` API remains available and tested for other callers: it requires a positive USD price, exact hashrate, condition and `scope: 'hardware-only'`. Its arithmetic is reference median minus entered quote; a negative difference remains a higher cost, and unknown costs are never silently zero. It cannot issue or verify a Proton offer.

All catalog `protonQuote` fields are currently `null`. Consequently `savingsFor` returns `quote-required`. The old miner database estimates and inherited price list are not executable Proton quotes and must not be reused as offers or used to invent a discount percentage.

## Updating a price or adding a quote

1. Open the exact manufacturer's specification and seller product page. Check the selected bin, condition, included accessories, batch, delivery wording, currency and commercial terms. Keep ambiguous or unavailable listings as evidence with `comparable: false` or their actual unavailable status.
2. Update the variant's observations with the observed amount, exact HTTPS URL, seller, bin, condition, `currency: 'USD'`, scope, real `checkedOn` date, availability and a concise note. Preserve material exclusions. Do not attach a neighboring bin's cheapest category price. Add `expiresOn` when the offer supplies an expiry.
3. For an actual Proton offer, obtain the approved per-machine hardware quote and match its bin, condition, quantity and commercial scope. Populate `protonQuote` only with verified `confirmed: true`, `comparable: true`, `usd`, `currency`, `hashrateTH`, `condition`, `scope`, `checkedOn` and `expiresOn`. Retain the supporting commercial evidence in the appropriate internal record; do not publish private supplier documents or customer details. A missing component or unmatched scope keeps the quote unconfirmed.
4. Update source notes and the research packet, then run `node tests/site/brokerage-catalog-data-suite.js`, `node tests/site/brokerage-catalog-ui-suite.js`, `node tests/site/hardware-suite.js`, `node tests/site/facility-suite.mjs` and the site's standard build/check workflow. Check source details, current and expired price states, exact variants reaching the saved order, mixed legacy/request-only carts and unknown-cost checkout states before release. If a separate caller exposes quote comparisons, verify negative differences there as well.

Keep the seven-day check and explicit quote expiry when refreshing data. Do not make an expired offer look current merely by changing the top-level catalog date. If a total delivered comparison is added later, it needs matched destination, quantity, delivery, warranty and all landed charges on both sides; this module does not calculate that total.

## Exterior rendering limits

Each of the 15 family previews reconstructs a named representative exterior from public manufacturer photographs and manuals. The selected variant can have different verified dimensions or operating specifications. The UI's “Shown” label identifies the rendered family, while source details describe the selected variant. A neighboring variant selection does not establish that its ports, casing or batch details are identical.

`dimensionsMM` stores verified specification dimensions in L × W × H order. Geometry uses the representative definition unless an explicit `renderDimensionsMM` override is supplied; do not automatically stretch a verified representative to every variant's dimensions. For M66 immersion units, the manufacturer's raw dimensions lack reliable axis labels, so the numeric specification remains unknown and the visual axis interpretation belongs only to the model reference notes.

These are exterior reconstructions, not manufacturer CAD or verified engineering replicas. They omit unverified internals and must not be used for cooling, electrical, rack-clearance or installation design. New families need an exact representative reference, confirmed dimensional interpretation, a matching static poster and a mobile framing check before release.

## Regenerating the static previews

Run `node tools/render-brokerage-posters.cjs` from the repository. It renders each entry in `MODEL_DEFINITIONS` through the website's actual transparent stage and replaces the corresponding 1000 × 800 PNG in `site/miner-models/` (currently 15 images). Review the resulting posters and the live scene together after geometry changes.

The command requires Node.js, an existing `playwright` or `playwright-core` installation, and an existing Chromium or Chrome executable. It also checks the local `tools/.cache/hosting-terrain-browser/node_modules/playwright-core` dependency location. Set `PLAYWRIGHT_MODULE` to another installed package path when necessary; set `CHROME_PATH` to an explicit browser executable. Otherwise it checks Playwright's configured executable and common local Chrome/Chromium paths. It does not install packages or download browsers, and missing dependencies produce an actionable error.

Rendering uses a temporary loopback server restricted to `site/`, plus the explicit `/__models__` capture harness. Browser requests to other origins are blocked. The browser and server close on success or failure; if a render fails after writing some images, resolve the error and rerun the command before releasing the posters.
