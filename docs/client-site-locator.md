# Client site locator

The locator provides geographic context for the existing public sample. It displays state boundaries, reference cities and numbered catalog points in a local SVG. The selected site includes its town/state and approximate straight-line distance and direction from the nearest city in the reference dataset. This is a city reference point, not a driving distance or travel-time estimate.

Expand opens a larger map and site selector. Users can pan, zoom, reset, select a site without dismissing the map, or return to that site's details. The same locator is visible on mobile. The dialog supports Escape, focus restoration, keyboard pan/zoom, and a close button that remains visible while scrolling.

The geographic context is stored in `portal/scouting/locator-geography.js`, with its Census provenance and simplification limits. The map makes no runtime tile-service, geolocation, account or CRM requests. Source verification notes and the reproducible data builder are retained locally in `reports/site-locator-2026-09-19/`.

The three existing accepted catalog coordinates remain approximate. Alpha Ridge's rejected catalog point is omitted; it remains selectable with the verified official-address search. Neither map selection nor expansion changes the site's evidence, power availability, or research disposition. Filters control which sites appear in both map sizes.

Validation: `tests/site/site-locator-suite.js` checks geographic data, rejection/fallback rules and safe rendering. `tests/scouting-locator-browser.cjs` checks the compact and expanded controls, keyboard/mouse interaction, filtered selection, focus and mobile overflow against the assembled site; it also accepts `SCOUTING_ORIGIN` for a read-only production check.
