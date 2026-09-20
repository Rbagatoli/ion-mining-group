# Client energy-scouting workspace

The combined client frontend is `/portal/scouting/`, reached from the Energy Sites service page and one energy-scouting entry in the login preview list. Site sourcing and visual energy scouting now share this workspace. The legacy `/portal/energy-scouting/` route redirects to `/portal/scouting/#sites`. Based on the September 19 buyer simulation from **Explore landfill-funded mining**, this remains a reviewable preview rather than an authenticated sourcing account.

The workspace, energy-provider and hosting interfaces share the approved energy-scouting styling: charcoal backgrounds, Inter/Segoe typography, metallic Bitcoin-orange actions and platinum details. The sourcing workspace uses a compact header and navigation above a centered dashboard. Authentication and backend permissions remain unchanged. The unified presentation was deployed in release `232db40`; subsequent contact research was deployed in `9c87828`.

## Current behavior

- Overview of the search brief, capital budget, report and next decision.
- Locally saved brief: location, MW range, site budget excluding miners, energy-only target, infrastructure, timing and exclusions; accepted energy sources, fuel versus delivered electricity, and operating flexibility.
- Four public researched examples, including hold/excluded decisions; all 104 evidence fields and original conflicts preserved.
- Inline site detail, infrastructure/capital, contact/terms and dated evidence; approximate coordinate locator and Google Maps links.
- Infrastructure records are visible without expanding a history panel. Capital is presented as work packages, required quote providers and unassigned cost responsibilities; no invented quote or reuse credit is supplied.
- The contact supplement provides 24 public business routes. Terms distinguish documented existing projects and restrictions from a new mining agreement, whose allocation, price and acceptance remain unconfirmed.
- A native **Site visuals** tab in each selected site's detail: dated aerials, map links, infrastructure-photo sources, missing-photo checklist, measured-concept requirements and session-only visual review notes.
- Three historical NAIP aerials. Alpha Ridge's rejected catalog point is omitted from the locator and its aerial is withheld; its map opens the official address search.
- Publisher-owned photographs are source-linked by default. Explicit internal previews do not establish reuse permission and are excluded from printing.
- Search/status/confirmed-offer filters, three-site comparison and local feedback.
- Report history states no ongoing subscription or scheduled next report.
- Editable, unsent email draft to `sales@protonminingco.com`; no payment, owner outreach, CRM write or research dispatch. This address follows the user's client-email routing in the AI team task.

The sample is fixed to its original brief. Changes to scope explicitly require new research. Historical nameplate, collection wells and generators do not establish available power or verified reuse credits. Unknown capital is not zero. No paid-pilot simulation or trial pricing is published.

## Energy-source coverage

The client can select landfill gas, flare gas, hydro, nuclear, wind, solar, geothermal, natural gas, biomass/biogas, waste to energy, coal, oil, marine, recovered energy, industrial surplus or grid supply, or explicitly accept any source. Storage and hybrid arrangements need the charging or constituent supply described in the brief. Preferences are carried into both unsent request routes and the device-local draft. Existing drafts without a source choice retain the original landfill sample scope; an explicit empty selection means any source. A non-landfill-only brief marks the retained landfill examples outside the selected energy sources.

The current four delivered examples remain landfill research. The operator/CRM inventory now includes 14,327 EIA facility records across all 50 states and DC, including 56 primarily nuclear and 1,393 hydro facilities, alongside landfill and flare discovery. The former 50 MW inventory ceiling is removed; plant capacity never establishes an available client allocation. The inventory uses the 2025 EIA-860 release and reported generation through June 2026. Selecting a source in this public preview does not run a new search, manufacture sample profiles or dispatch a research job. The separate CRM client brief and shared screening model rank research candidates and require current owner evidence for commercial qualification. New mixed-source client profiles still need technology-aware access assessments and dated evidence before delivery; the preview's access supplement remains specific to the four landfill records.

## Data boundary

`sample-data.js` is a sanitized projection of `reports/energy-scouting-simulation-2026-09-19/simulation-data.json`. The SECCRA S-W source's 404, discovered in the independent review, is carried into every occurrence. `visual-data.js` is a separate public projection of `reports/energy-scouting-visuals-2026-09-19/visual-data.json`, retaining the research and report versions, hashes and site assets while omitting the internal `workflow` object. No live operator/CRM records, internal margin calculations or agent instructions are loaded.

Only `proton:scouting:preview:v1` is read/written in browser storage. Its draft is device-local and visibly labeled; storage failures fall back to page memory. Visual review notes exist only in the current page session and are labeled as user notes, not verified research. Reset removes only the scouting preview key and clears those session notes. The public sample has no client private data. This namespace is not a tenant store and must not be used for authenticated records.

## Build and evidence versions

The local preparation utility `node tools/build-energy-scouting-preview.cjs` generates `portal/scouting/visual-data.js` and the legacy-route redirect from the retained research files. It is not required by the production build, which publishes the committed public projection. The normal build stamps workspace assets and checks the required manifest and public-data boundary. `site-diligence.js` presents the dated equipment and commercial evidence; `energy-preferences.js` captures accepted sources without importing operator records into the public workspace.

The standalone files under `reports/energy-scouting-visuals-2026-09-19/` remain a historical interface reference and the source of the visual evidence packet. Earlier QA receipts apply only to their exact recorded file hashes; they do not approve this combined UI or later changes. Profile, asset, caption and report dependencies remain versioned independently of presentation changes. The four retained outcomes and all 104 original evidence fields are unchanged by combining the interfaces.

## Next integration boundary

The existing portal Worker has producer/hosting accounts only and is not configured for sourcing projects. Real sourcing accounts require server-side client authorization; versioned briefs and report deliveries; a client-safe evidence projection; feedback and message endpoints; explicit fee/scope acceptance; and delivery/pause controls backed by actual jobs. Payment integration is a separate requirement. Do not remove preview labels until those systems exist and have been verified end to end.

The nested route has its own generated asset stamp, a required build manifest and containment/evidence checks in the normal site suite.
