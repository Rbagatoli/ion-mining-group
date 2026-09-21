# Mobile subtext cleanup — 20 September 2026

Removes repeated fine print from the main phone view while preserving desktop copy and layout. Energy Sites cards retain service, short description and action; source tiles retain names; the preview retains its chooser, tabs, relevant facts and action without repeated scope and source labels. Hosting map qualifications and attribution remain accessible in a single Map details disclosure, with the rate labelled Est. rate on phones. Shared phone dropdown subtitles and redundant helper lines are omitted. Calculator labels retain power-only cost scope, live ROI horizon and units. Print content remains complete.

Validation against 72d228d:

- 23 public pages at 390 and 1440 px: no overflow, browser errors, missing assets or HTTP writes.
- All 23 desktop routes retain exactly the same rendered text and page heights.
- Energy Sites initial phone view: 6,677 to 5,329 px; 827 to 485 visible words.
- Hosting initial phone view: 3,270 to 3,096 px; 325 to 251 visible words.
- Eight public preview scenarios passed: all sixteen source routes, keyboard tabs, preserved form values, research contacts, expandable locator and 320–1440 px layouts.
- Three service actions and all eight static source names retained; hosting region switching works; map credits expand correctly.
- Four responsive print-state checks passed; new cleanup CSS is screen-only.
- Full site suite passed; all generators are idempotent.

Screenshots and raw reports are local in reports/subtext-preview, reports/subtext-hosting and reports/mobile-editorial-20260920/subtext. No private/customer records or submissions were used.
