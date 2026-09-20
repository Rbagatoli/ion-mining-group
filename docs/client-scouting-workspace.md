# Client energy-sourcing workspace

Public frontend at `/portal/scouting/`, reached from the Energy Sites service page and the existing portal preview entry. Based on the September 19 buyer simulation from **Explore landfill-funded mining**. This is a reviewable client UI, not an authenticated account system.

## Current behavior

- Overview of the search brief, capital budget, report and next decision.
- Locally saved brief: location, MW range, site budget excluding miners, energy-only target, infrastructure, timing and exclusions.
- Four public researched examples, including hold/excluded decisions; all 104 evidence fields and original conflicts preserved.
- Inline site detail, infrastructure/capital, contact/terms and dated evidence; approximate coordinate locator and Google Maps links.
- Search/status/confirmed-offer filters, three-site comparison and local feedback.
- Report history states no ongoing subscription or scheduled next report.
- Editable, unsent email draft to `sales@protonminingco.com`; no payment, owner outreach, CRM write or research dispatch. This address follows the user's client-email routing in the AI team task.

The sample is fixed to its original brief. Changes to scope explicitly require new research. Historical nameplate, collection wells and generators do not establish available power or verified reuse credits. Unknown capital is not zero. No paid-pilot simulation or trial pricing is published.

## Data boundary

`sample-data.js` is a sanitized projection of `reports/energy-scouting-simulation-2026-09-19/simulation-data.json`. The SECCRA S-W source's 404, discovered in the independent review, is carried into every occurrence. No live operator/CRM records, internal margin calculations or agent instructions are loaded.

Only `proton:scouting:preview:v1` is read/written. Its draft is device-local and visibly labeled; storage failures fall back to page memory. Reset removes only that key. The public sample has no client private data. This namespace is not a tenant store and must not be used for authenticated records.

## Next integration boundary

The existing portal Worker has producer/hosting accounts only and is not configured for sourcing projects. Real sourcing accounts require server-side client authorization; versioned briefs and report deliveries; a client-safe evidence projection; feedback and message endpoints; explicit fee/scope acceptance; and delivery/pause controls backed by actual jobs. Payment integration is a separate requirement. Do not remove preview labels until those systems exist and have been verified end to end.

The nested route has its own generated asset stamp, a required build manifest and containment/evidence checks in the normal site suite.
