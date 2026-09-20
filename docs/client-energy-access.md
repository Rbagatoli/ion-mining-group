# Contacts and energy-access screening

The client workspace now separates **publicly researched sites** from **owner-qualified opportunities**. All four examples remain publicly researched only. A customer marking a site Interested cannot change its power, commercial or readiness status.

## Published evidence

`portal/scouting/energy-access-data.js` adds a dated, independent supplement to the original sample packet. It contains 24 public business contact routes across four sites, including repeated company referral routes. It does not claim 24 unique people or direct lines. Individual emails, shared inboxes, switchboards, dated personnel listings and technical referrals retain their provenance and limits.

The new EIA-860 2025 snapshot reports Pennsauken's GEN1 at 0.9 MW operating nameplate, with two retired units, and the Northern Tier generator at 1.6 MW operating nameplate. These are annual snapshot ratings, not current delivered output or power offered to a mining customer. The UI displays the newer evidence beside the retained historical LMOP/project figures. A minimum client load above the reported rating prompts a scoped capacity warning without inferring an available allocation.

The June 2026 PA renewal identifies NextEra's Bradford project specifically; it does not confer commercial rights on the customer. Alpha Ridge remains on hold pending clarification of its conditional generator decommissioning. SECCRA remains a poor fit for a search predicated on reusing electricity generation because of its announced RNG transition. The current developer listing says under construction, not commissioned. The original S-W failed-link note remains historical; the supplement records retrieval of that PDF for this review.

## Client journey

- A persistent access summary and **Can I use the energy?** tab give a qualitative outlook and sourced reasons.
- Three pre-contact judgments separate technical possibility, commercial-access outlook and evidence strength. The load comparison responds to the saved MW range; it never treats annual nameplate capacity as spare output. Project-direction constraints remain visible even for a smaller load. These categories are screening judgments, not calibrated probabilities of obtaining energy.
- Six unresolved gates cover owner interest, rights, net MW, physical connection, pricing/remaining capital, and approvals/timing.
- Contacts appear in practical order, with the first three visible and further contacts/referrals expandable. Each card says what to ask and whether its route is direct/shared/dated.
- A client can prepare a call or email brief for a selected published contact. The editable dialog contains their saved MW range, timing and budget. Email is offered only for a valid published address; otherwise the client can copy the script and use the phone/contact page.
- No message is sent, no owner reply is recorded and no account/CRM/backend is updated by these controls.

## Evidence and release checks

Primary evidence is linked in every contact and signal, with publication/review dates separated. General gate design follows EPA's LFG Project Development Handbook. Research workbooks and discovery notes are retained locally under `reports/client-energy-access-2026-09-19/`; only the public projection is published.

`tests/site/energy-access-suite.js` exercises unknown-versus-confirmed status, source coverage, contact ordering, drafts, encoding and absence of automatic outreach/storage coupling. The browser harness exercises actual site selection, contact links, unsent recipient-specific drafts and mobile layouts. The new assets participate in the normal deployment manifest and content-derived cache stamp.
