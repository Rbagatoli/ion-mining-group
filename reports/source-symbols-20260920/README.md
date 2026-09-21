# Energy-source symbols and desktop fine-print cleanup

The eight energy-source categories use original orange/platinum SVG symbols, titles and short descriptions in an open layout. Two columns on phones, four on wide desktop screens. Number labels, fake arrows, card borders and tile backgrounds are removed.

Repeated fine print is omitted from desktop pages as well as mobile. Hosting map context and attribution are in a native Map details disclosure. Hardware source dates, cooling details and pricing context remain in Specifications & price sources; actual order estimates, price units and availability stay visible. Calculator cost scope, ROI horizon, warnings and form instructions remain. Printing retains reference content.

Validation: full site suite passes; generators are idempotent; 23 public pages at 390 and 1440 px have no overflow, browser errors or missing assets; icon layout checked at 320/390/768/1440; eight preview interaction scenarios pass; hosting selection, hardware variants, adding an order, checkout and print behavior checked at phone/desktop sizes. Browser tests blocked external requests and made no HTTP writes.

Local screenshots: source-section-390.png and source-section-1440.png. Raw full-page audit: reports/mobile-editorial-20260920/symbols-desktop/audit.json. Preview checks: reports/source-symbols-preview/checks.json.
