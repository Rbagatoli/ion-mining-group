# Mobile visual and copy refresh — 20 September 2026

The ten main mobile journeys show 36.4% fewer visible content words and 19.9% less total page height at 390 px. Five compact original illustrations explain sourcing, existing infrastructure, hosting roles and the mining flow.

All 23 public desktop HTML routes have identical rendered text and page heights at 1440 px. Full articles, pricing qualifications, payment details, privacy content and expanded references remain available. The hosting 3D view remains visible immediately below Pick a site.

Measurements use a fresh isolated browser, blocked external requests and an in-memory snapshot of public build assets. Navigation and footer text are excluded from word totals; collapsed details are excluded until opened. Baseline is the public site at `14f3657`, before these changes. Numbers describe the initial rendered main-page mobile view, not deletion of 36% of all stored website content.

Validation: full website suite; 46 phone/desktop layouts with no overflow, missing local assets or browser errors; 24 mobile interaction scenarios at 320/390 px; 8 energy-preview scenarios; all 16 energy source routes across breakpoint changes; 4 print-and-resize cases. No forms or HTTP writes submitted.

`summary.json` contains the per-page comparison. `tests/mobile-editorial-browser.cjs` reproduces layout measurements using `MOBILE_EDITORIAL_PHASE` and `MOBILE_EDITORIAL_ROOT`; `tests/mobile-print-browser.cjs` covers responsive print restoration. Local full-page screenshots and raw browser reports were reviewed but are not part of the published site.
