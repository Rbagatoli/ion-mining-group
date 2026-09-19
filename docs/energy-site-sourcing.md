# Energy site sourcing

Research reviewed: **2026-09-19**.

`site/energy-sites.html` describes a service for mining companies, hosting operators and independent miners seeking potential energy sites for their own operations. It is separate from Proton hosting and from the energy-partnership route for people who already control a site. The service is a scoped search and researched shortlist; it does not advertise an owned inventory of available sites or guarantee a transaction, power price, energization date or build cost.

## Scope and deliverables

Agree the client's location, initial power requirement, timeline, upfront capital constraint and willingness to develop infrastructure. Research can cover landfill/digester gas, stranded/flared gas, surplus or curtailed power, and sites with existing electrical infrastructure.

Each opportunity should distinguish:

- Reported resource, installed/rated capacity, potential supply and the capacity actually confirmed for the client. Existing electrical equipment does not establish spare or deliverable power.
- Documented infrastructure, evidence of condition, ownership and access, likely reuse questions, remaining construction/upgrades and connection work.
- Preliminary capital ranges with their assumptions, priced work and unresolved costs. Do not count a public record of equipment as an automatic avoided cost.
- Relevant owner/operator contact routes, gas or power commitments, constraints, source dates, open diligence questions and the next conversation. Introductions depend on the parties' agreement.

A public lead is not a secured site. Reported facts, estimates and counterparty-confirmed information must remain distinguishable. Availability, site access and energy rights require confirmation; use “secured” only when the required agreements are in place. A landfill collection system is not equivalent to generation, mining infrastructure or a right to purchase its gas.

Preliminary analysis does not replace inspections, engineering or supplier quotations. Hardware, land, infrastructure and transaction costs should be identified separately where relevant. The service does not require customers to host with Proton.

## Intake, fees and enquiry behavior

The required brief collects name, email, preferred location and initial power in **MW**; **1 MW = 1,000 kW**. Company is optional. The role selection supports mining operators, hosting companies, independent miners, and developers/investors.

Optional inputs are an upfront site budget in **USD**, excluding miners and covering land/infrastructure/connection work; target energy cost in **US cents per kWh**, before hosting services; target start; infrastructure preference; and freeform requirements such as cooling, expansion MW, equipment already owned or acceptance of off-grid gas. Preserve those unit and scope qualifiers in both the visible form and the generated brief. A blank optional amount is unknown, not zero. Any service minimum should be explicit rather than inferred from a numeric input constraint.

Search scope, deliverables and fees are agreed for the individual brief before work begins. No fixed fee, free-search promise, performance guarantee or payment authorization is established by the website. Capital ranges and power-rate targets are not binding Proton offers.

The form uses the shared `site/site.js` handler for `form[data-mailto]`. After browser validation, it assembles current named field values into an encoded `mailto:` draft addressed to **energy@protonminingco.com**, with the subject **Energy site sourcing enquiry via protonminingco.com**. It derives field names from visible labels. Optional select controls contribute their current/default values even when their disclosure is closed; these defaults should not be interpreted as independently confirmed client requirements.

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
