# Energy site sourcing

Service scope updated: **2026-09-20**. This date does not refresh the underlying source records.

`site/energy-sites.html` describes nationwide United States energy-opportunity sourcing for mining companies, hosting operators and independent miners seeking supply for their own operations. It is separate from Proton hosting and from the energy-partnership route for people who already control a site. The service is a scoped search and researched shortlist; it does not advertise an owned inventory of available sites or guarantee a transaction, the cheapest energy, a power price, energization date or build cost. Nationwide scope is not a claim that every U.S. energy opportunity is known.

## Research focus and catalog coverage

Positioning: **Low-cost energy sourcing for Bitcoin mining, specializing in landfill and stranded gas.** The broad nationwide catalog remains searchable. It is a source of research leads, not an active work queue or a list of available offers.

- Primary specialty: landfill/flare sites with measured resource, usable equipment or a realistic funding path, an appropriate decision-maker/contact route and a plausible commercial opening. Verify missing evidence in a bounded step rather than assume readiness.
- Selective research: operating hydro and existing energized sites that fit a client brief.
- Research when justified: nuclear, large conventional plants, wind, solar and other sources for an explicit client requirement or a documented opportunity. Do not discard a strong client fit solely because its source is outside the specialty.

CRM Discover defaults to the landfill/stranded-gas specialty. All sources and individual sources remain visible choices. Applying a client brief switches to broad source coverage so allowed sources and exclusions control the search. Existing energy-site role filters still apply and remain visible. No records are deleted, assigned to agents or qualified merely by appearing in this view or being saved.

Revenue should justify each bounded research assignment with the exact client brief or labeled internal sample, a dated source signal, fit hypothesis, unknowns and one next check. The site research action collects a brief before preparing a draft. Quality independently reviews the selection rationale and delivered-cost comparison. Public findings do not establish owner willingness or available MW. Proton's paid research role is separate from funding the client's construction; record who would fund every unresolved capital item.

The source ranking is a working research strategy, not a measured closing probability. Reassess it using qualified opportunities, client purchases and delivery effort. Existing client preferences, saved evidence and historical tasks remain unchanged.

## Scope and deliverables

Agree the client's permitted states/regions and exclusions, net power requirement, all-in delivered energy cost target, minimum availability, willingness to accept curtailment or seasonal supply, connection needs, timeline, upfront capital constraint, funding responsibilities and willingness to develop infrastructure. A low advertised rate is not sufficient if the opportunity fails those requirements.

Research may cover landfill gas, flare gas, hydro, nuclear, wind, solar, geothermal, natural-gas generation, biomass/biogas, waste-to-energy, marine/tidal/wave, recovered energy/waste heat, coal generation, oil generation, industrial surplus and grid supply. Some categories need dedicated research beyond the current public-record catalog. Owner qualification and supply terms are necessary for every category, including large power plants. Do not treat the difference between nameplate capacity and historical generation as available power for a customer.

Storage-backed and hybrid supply can be considered as arrangements, with the underlying sources, charging costs, conversion losses, usable duration and delivery schedule identified. Storage is not an additional primary energy resource. Unknown or mixed technology remains unclassified until supporting evidence exists; it must not be silently assigned to an allowed source.

The four researched examples in `portal/scouting/` are landfill reports that demonstrate the deliverable. Selecting other sources requests a new scope of research; it does not convert the examples into matches or establish supply. Existing preview drafts with missing or malformed source preferences retain the legacy landfill scope. An explicitly empty source list means any source. New public enquiries are unrestricted by source unless the visitor selects a subset or writes exclusions.

Each opportunity should distinguish:

- Reported resource, installed/rated capacity, historical generation, potential supply and the net capacity actually confirmed for the client after site needs and existing commitments. Existing electrical equipment does not establish spare or deliverable power.
- Energy-only price separately from delivery, demand charges, fees, taxes and other applicable costs. Compare all-in delivered energy costs on consistent operating and utilization assumptions; do not score an unknown rate as zero or compare a fuel price directly with delivered electricity.
- Operating windows, minimum availability, seasonal changes, curtailment rights, contract duration and the evidence behind each constraint. Unknown availability or price remains a qualification task, not a passing result.
- Documented infrastructure, evidence of condition, ownership and access, likely reuse questions, remaining construction/upgrades and connection work.
- Preliminary capital ranges with their assumptions, priced work, unresolved costs and the party expected to fund each item. Do not count a public record of equipment as an automatic avoided cost or assume the provider will fund construction.
- Relevant owner/operator contact routes, gas or power commitments, constraints, source dates, open diligence questions and the next conversation. Introductions depend on the parties' agreement.

A public lead is not a secured site. Reported facts, estimates and counterparty-confirmed information must remain distinguishable. Availability, site access and energy rights require confirmation; use “secured” only when the required agreements are in place. A landfill collection system is not equivalent to generation, mining infrastructure or a right to purchase its gas.

Preliminary analysis does not replace inspections, engineering or supplier quotations. Hardware, land, infrastructure and transaction costs should be identified separately where relevant. The service does not require customers to host with Proton.

## Intake, fees and enquiry behavior

The required public brief collects name, email, preferred U.S. location and initial usable power in **MW**; **1 MW = 1,000 kW**. Company is optional. The role selection supports mining operators, hosting companies, independent miners, and developers/investors. Source checkboxes start empty, explicitly meaning any source; selecting one or more limits the requested search to that subset. Exclusions apply even to an unrestricted search.

Optional inputs are an upfront site budget in **USD**, excluding miners and covering land/infrastructure/connection work; an all-in delivered energy target in **US cents per kWh** including applicable delivery, demand charges, fees and taxes but excluding hosting, miners and construction; minimum power availability as a percentage; operating flexibility; fuel-versus-electricity delivery; construction funding preference; target start; infrastructure preference; exclusions; and freeform requirements such as cooling, expansion MW, shutdown limits, equipment owned, or storage/hybrid acceptance. Preserve those unit and scope qualifiers in both the visible form and the generated brief. A blank optional amount is unknown, not zero. Any service minimum should be explicit rather than inferred from a numeric input constraint.

The public all-in target must not be substituted for the older portal's energy-only target without preserving its cost basis. Legacy client drafts are not consent to new source or operating requirements.

Search scope, deliverables and fees are agreed for the individual brief before work begins. No fixed fee, free-search promise, performance guarantee or payment authorization is established by the website. Capital ranges and power-rate targets are not binding Proton offers.

The form uses the shared `site/site.js` handler for `form[data-mailto]`. After browser validation, it assembles current named field values into an encoded `mailto:` draft addressed to **energy@protonminingco.com**, with the subject **Energy site sourcing enquiry via protonminingco.com**. Preserve that actual form routing. It derives field names from visible labels, groups checked `energy_sources` values into one Energy sources line, and writes Any energy source when none are checked. Unchecked checkboxes/radios and disabled fields are excluded. Optional select controls contribute their current/default values even when their disclosure is closed; Not specified must remain unknown rather than becoming a confirmed requirement.

The visitor reviews the draft and presses Send in their own mail application. Opening the draft is not a server submission, confirmed delivery, stored CRM lead, accepted engagement or payment. The page also exposes the email address directly; without JavaScript, visitors can compose their own message. The contact-page `site-sourcing` topic routes to the same energy inbox.

## Primary references and implications

These sources support service design and diligence questions. They do not establish Proton's credentials, inventory, commercial relationships or ability to secure any specific site.

| Source verified during research | Relevant implication |
| --- | --- |
| [CBRE — Data Center Solutions](https://www.cbre.com/services/property-types/data-center) | Separates site feasibility/selection, commercial and technical diligence, powered land, powered shells and turnkey facilities. Present existing assets and remaining development as separate stages. |
| [Hedge Natural Resources](https://www.hedgeresources.com/) | Its published mining/compute service distinguishes land and gas agreements, generation, construction and operations, and asks operators for their MW requirement. This is a competitor's own description, not independent verification of its site availability. |
| [JLL — Assessing a property's data-center potential](https://www.jll.com/en-us/insights/how-to-assess-a-propertys-data-center-potential) | Existing infrastructure does not establish that a utility can supply the proposed load. Utility commitments, load studies, upgrade needs, site risks and remediation matter. Do not import hyperscale requirements as universal mining-site minimums. |
| [EPA — LMOP Landfill and Project Database](https://www.epa.gov/lmop/lmop-landfill-and-project-database) | Provides landfill/project screening information, including collection-system and project status. Coverage is incomplete and not every record is updated annually. The published release observed during this research is September 2024; retain source-as-of separately from the date Proton reviewed it. |
| [EPA — LFG Project Development Handbook](https://www.epa.gov/lmop/landfill-gas-energy-project-development-handbook) | Covers gas modelling, collection/treatment/generation, capital and operating costs, agreements, permitting and project partners. Collection, generation and delivery rights require separate evidence. |
| [EPA — LFGcost-Web](https://www.epa.gov/lmop/lfgcost-web-landfill-gas-energy-cost-model) | Estimates capital and annual costs and allows inclusion of a new collection/flaring system. Defaults represent typical projects; confirm site-specific reuse and remaining work rather than presenting generic output as a quoted budget. |

Refresh source evidence when evaluating an actual opportunity. Do not make old operating data appear current by changing only the research-review date.
