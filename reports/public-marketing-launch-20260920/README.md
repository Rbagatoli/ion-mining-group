# Public marketing release — 20 September 2026

Approved website workstream for PM-ORGANIC-20260920. Prepared in an isolated checkout
from 48e4e54; the previously released hosting rendering layout is preserved.

## Delivered

- New `/cheap-mining-power-quote.html`: sourced screening guidance and explicitly fictional cost arithmetic, linked to the calculator, service and checklist.
- New `/site-screening-checklist.html`: twelve checks, evidence states, blank record fields and next-step decisions; no account, submission or persistence claim.
- Search readiness allowlists in `site/tools/launch.js`: seven public pages and three reviewed posts. Unknown pages and published-but-unaudited posts are held. Sitemap, robots, page directives, blog cards and related/notes rails use the same readiness decision.
- Homepage placeholder metrics, rates, funding and operational guarantees removed. Rendered mine is described as illustrative. Contact placeholders removed; calculator tax controls identified as optional simplified assumptions; privacy disclosures corrected.
- Email enquiry fallback to sales@ validates required fields and consent. Long drafts remain fully copyable rather than silently truncating mailto. Contact's JavaScript-disabled submit cannot leak fields into a default GET URL. Campaign source/medium/name may appear only in the user-reviewed email; no new analytics store is added.
- Corrected legacy energy-hashprice unit conversion and conditional investment comparisons. Corrected Alberta conservation threshold to negative Cdn$55,000 and obsolete deal-risk service claims; those latter articles stay held.

## Validation

- Full local site run: all suites passed except two historical copy expectations; those were updated for the reviewed illustrative/tax-assumption wording and both affected suites passed separately. Production CI repeats the complete suite before deployment.
- 41 private-intake, CRM handoff, recipient and complete-email-draft tests passed locally. Only synthetic/local stores were used.
- 14 browser intake/contact checks passed, including uncertain-retry identity, no receipt without proof and no-JavaScript contact safety.
- Final assembled `_site`: 516 files, 10 sitemap URLs, 1,315 local asset references across 46 pages; private backend/internal operations files excluded.
- 30 browser layouts: all ten ready pages at 320, 390 and 1,440px. One H1 each; no horizontal overflow beyond 1px rounding tolerance, runtime errors or missing local assets.
- Four final-build inquiry checks passed: no-JS contact safety, normal encoded draft, >10,000-character recoverable mobile draft, and disconnected Energy Sites email-only behavior. No external message or request was submitted.
- Real Chrome PDFs: Letter and A4 each exactly two pages at 100%; body/table text 10.5pt. All checks and instructions preserved, no clipping/split rows, manually rendered and reviewed.
- Full workflow generator sequence leaves every site file byte-identical. Shared diagrams, operating app and customer data are unchanged.

Local evidence: `smoke.json` and screenshots in this report directory;
`tools/.cache/checklist-qa/` contains both PDFs, rendered pages and print checks.
Large transient screenshots/PDFs are not part of the public deployment.

## Deliberate limits

Hosting, Hardware, Energy Partners and Why Mining remain noindex pending further
inventory/terms/claims work. Four legacy articles remain held and are not promoted
through ready-page excerpts. Public reachability is not readiness; noindex is not
access control. Search eligibility does not prove that a search engine indexed a page.

No confirmed site inventory, available capacity/rate, operating fleet, financing,
uptime or response guarantee is established. Private intake endpoint remains empty;
opening a mail draft is not sending or receipt. No customer records, provider
configuration, agent execution schedule, social identity or outreach state changed.

Exact deployed commit, workflow and live retrieval evidence are recorded after
deployment in the internal campaign's `RELEASE-VERIFICATION.md`.
