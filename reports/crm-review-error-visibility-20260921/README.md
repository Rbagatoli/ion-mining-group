# Review validation error visibility

Local implementation and synthetic verification only; not published or deployed by this change.

The standard coordinator review already rejects an `Accept result` decision when Commercial fit is `Needs revision`. Its alert was rendered after the long form without moving focus or scrolling, so it could remain outside the visible dialog after Save. The existing modal error handler now focuses that same alert and scrolls it into view. A Quality-only explanation immediately before the checks clarifies that they assess the Quality artifact: accepting an accurate REVISE or HOLD finding does not approve its source or change its verdict. No check is preselected. Validation, review attribution, roles, versions, dispatch, and source state are unchanged.

## Verification

The Node, syntax, build and response-only baseline checks preceded the final Quality-only explanation. The browser regression was then extended for that explanation and rerun successfully on the final source.

- `node --test tests/crm-grok-team.test.js tests/completed-team-review.test.js`: 29/29 passed.
- `node --check crm/crm.js`: passed.
- `node tools/build-crm.cjs`: passed; 156 declared assets packaged.
- `node tests/crm-review-error-browser.cjs`: one synthetic rejected coordinator-review scenario passed at 1440x900 and 390x740, including the Quality-only explanation immediately before the checks. The exact reason is a focused visible `role=alert`; the dialog and field values remain intact, including Fit `revise`. Zero dispatch calls, unchanged in-memory register and byte-identical stored register. No page errors, missing assets, or write requests; external requests blocked.
- With `CRM_REVIEW_ERROR_BASELINE=1`, the browser test substitutes the previous error handler in the served response only. It fails as expected: the alert is not focused and extends below the dialog and viewport. No source files are changed by this baseline mode.
- `git diff --check`: passed.

Browser environment: headless Chrome and local Playwright core, with `PLAYWRIGHT_CORE_PATH` pointing to the installed module. The fixture uses an existing linked Quality result at version 1 with a revise verdict for a blocked source at version 0; it does not force any check to Pass or touch live accounts.

Compact evidence: [fixed results](browser/fixed/checks.json) and [expected baseline failure](browser/baseline/checks.json). Screenshots are local verification artifacts and are excluded from the scoped commit.
