# Mobile density review — September 20, 2026

Phone-only spacing and widget changes across the public website and client scouting workspace. Desktop copy and layouts remain unchanged. Optional energy-search fields use the existing mobile disclosure behavior; every field, source option, cost, contact and evidence item remains available.

## Measured page height

Default state at 390 × 844, compared with release `75c3920`:

| Page | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Energy Sites | 10,066 px | 7,141 px | 29.1% |
| Energy Partners | 3,726 px | 3,022 px | 18.9% |
| Hardware | 2,113 px | 1,796 px | 15.0% |
| Home | 3,631 px | 3,133 px | 13.7% |
| Contact | 2,642 px | 2,283 px | 13.6% |
| Client scouting sites | 5,854 px | 5,067 px | 13.4% |
| Hosting | 2,797 px | 2,456 px | 12.2% |
| Calculator | 1,935 px | 1,729 px | 10.6% |

Blog and explanatory pages are roughly 8–12% shorter. Empty cart/payment/status screens already fit within one viewport. Populated orders and prepaid terms were checked separately.

## Validation

- Full website suite passed, including desktop-copy preservation, calculator, hardware/order/checkout, source preferences, client evidence and locator suites.
- 60 before/after browser measurements covered every public HTML route plus scouting overview/sites, desktop at 1440 px, and key pages at 320/390/430 px. All measured desktop page heights and visible-copy hashes matched the baseline.
- No horizontal page overflow, runtime exceptions, missing local assets or HTTP writes.
- 24 phone interaction checks passed: navigation, disclosures, all source options, source inclusion, service-mode fields, invalid hidden-field reveal, populated orders, miner navigation, prepaid term selection/clearing, cost breakdowns, checkout, mine-builder assumptions and expanded map zoom/selection.
- Parent visually reviewed compact mobile home/contact/hardware pages, the populated order, prepaid terms at 320 px, and expanded energy form.

Measurements use isolated local browser contexts, deterministic reduced-motion rendering, blocked external requests, and synthetic local cart data. They are not a physical-device Safari test or a real payment/submission test.

## Repeating the browser check

Build with `node tools/build-pages.js`, then run `node tests/mobile-density-browser.cjs`. Use `MOBILE_DENSITY_PHASE=after` for comparisons or `interactions` for only the interaction pass. Set `PLAYWRIGHT_CORE_PATH` and `CHROME_PATH` if the test cannot locate your local browser/runtime. Screenshots and raw measurements stay in this report directory and are not published.
