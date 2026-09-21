# Existing-session CRM workbench — release candidate

This candidate uses the existing signed-in CRM browser, `ProtonCrmData`,
`AgentControlStore`, and `task.completed-review` reducer. It adds no service,
identity, signing key, authentication flow, task schema, native routine, or
outbound capability. Nothing has been deployed or used against live data.

The stable route is `/crm/#team/workbench`, also linked discreetly from Team.
It uses the existing owner session and does not sign in automatically. Before
authentication finishes, or when signed out, the route withholds the workbench
editor and owner records. It becomes available after the existing account and
register are confirmed. There is no hostname or preview-query restriction.
The page assets remain part of the ordinary public CRM shell; private register
reads still require the existing signed-in owner's Firestore permissions.
An anonymous/local register cannot be reported as server-confirmed or submitted
through this workbench. Browser tests supply synthetic connected-account data
and block external requests. This release candidate is not deployed.

## Smallest operational path

1. **Read current register** fetches the existing owner document with
   `get({source:'server'})`. It rejects cached/pending responses and account
   changes, and leaves listener state and other stores untouched.
2. Every task is projected using the existing model and workflow helpers:
   `actionable`, `taskKind`, `reviewRole`, `reviewEvidence`,
   `completedReviewEligibility`, `bucket`, and `taskMeaning`. The result includes
   exact IDs, statuses, versions, per-task next action and precise gate. Today,
   lead summary precedence, due dates and sending readiness never select or
   exclude register rows. A stale Quality assignment cannot borrow a sibling's
   eligibility. Sending HOLD and unavailable usage do not exclude existing
   completed-review or receipt recovery; new dispatch is not exposed at all.
   Refresh output contains only fresh-read metadata, task count and the retained
   operation. Linked Quality records in the classification use IDs, statuses and
   versions; full source/Quality bodies appear only when the exact pair is loaded.
3. Enter the exact source and existing linked Quality IDs, then load their full
   original records and the completed-review JSON template. Supply the original
   native Quality finding, reviewer, completion time, artifact reference,
   supported verdict and Revenue's explicit evidence/arithmetic/fit checks.
   Confirm independence and exact-source scope using two initially unchecked
   controls. Both coordinator decisions must name the same Revenue recorder.
4. **Preview completed review** runs the same reducer as the existing form,
   without a write, and retains its exact normalized request and original board
   revision. Review that request, then **Record completed team review** submits
   only `task.completed-review` through the existing transaction adapter.
5. A fresh server read must contain the exact receipt before the workbench says
   confirmed. The output distinguishes the historical closeout receipt from
   current source/Quality statuses and versions. **Check saved receipt** is
   read-only and never resubmits.

No generic acceptance, bulk acceptance, lead mutation, task creation, claim,
native dispatch, schedule, provider, account, sending or enrollment control is exposed.
The reducer still enforces linked records, exact versions, immutable submitted
QA, accepted-QA reuse, genuine attribution and adverse-review restrictions.
Other CRM controls are unchanged.

## Recovery and scope

One owner-scoped browser operation record retains the existing closeout request,
revision and ID. Preparation and attempted status are synchronously stored and
read back before dispatch. Web Locks serialize this page's operations across
tabs through transaction settlement and receipt readback. An unresolved
operation blocks another preparation. No token or credential is retained.

After reload, saved work permits receipt lookup only. A preparation with no
recorded attempt can be explicitly closed as not sent, retaining its original
request. An attempted operation with an absent/conflicting receipt remains
unresolved; there is no retry, delete, clear or inferred-success control. Account
changes freeze the original draft read-only. Return to the original account to
reconcile. Storage errors fail closed.

This is a small recovery record in existing browser storage, not a second CRM
register or immutable ledger. It does not survive profile deletion/eviction,
guarantee a power-loss flush, or coordinate different devices. Firestore's
existing revision transaction guards remain authoritative across writers.
Revenue's sole-writer role remains an operating rule; the same signed-in user
could still use other CRM controls. Native Quality independence is attributed
to the actual artifact and reviewer, not authenticated as a separate principal.
The existing CRM review-history retention limits still apply.

## Comparison with the staged gateway

| | Existing-session workbench | Undeployed gateway candidate |
| --- | --- | --- |
| Native access | Visible labeled CRM form in the current authenticated browser | Supported authenticated native HTTP transport still needed |
| Auth/setup | Current CRM session and unchanged owner rules | Route, principal mappings, distinct Quality UID, signing keys and operations setup |
| Review attribution | Existing native Quality evidence recorded by Revenue | Signed identity/artifact binding, still no proof of independent reasoning |
| Persistence | Existing register/reducer and existing completed-review receipt | Same register plus separate signed operation receipt documents |
| Recovery | Small local request record; original receipt lookup | Client plus journal/transport/recovery integration |
| Scope | One completed-review command | Additional bounded lead/task endpoints |

For the immediate native Quality→Revenue workflow, this is the smaller option.
The native agent can use the normal page labels, JSON textarea and buttons. It
must not evaluate hidden application internals, copy tokens, or treat the
JavaScript module as an installed MCP tool. The workbench reduces repeated form
entry; it does not remove the browser or establish remote native connectivity.
A cloud native agent cannot reach this local checkout. After an approved
deployment, it can use the stable route through its existing authenticated
browser. Deployment, account access and a controlled native pilot have not been
verified here. No runtime or performance improvement has been measured with a
native agent.

Current-cycle usage, reservation ordering, native scheduling and independent
review delivery remain with the native coordinator. This workbench supplies no
usage evidence and neither releases outreach HOLD nor authorizes new work.

## Local verification

```text
node --test tests/agent-workbench.test.js tests/agent-register-read.test.js tests/completed-team-review.test.js tests/crm-reload-safety.test.js tests/crm-app.test.js tests/crm-grok-team.test.js
node tests/crm-agent-workbench-browser.cjs
node tests/crm-completed-review-browser.cjs
node tools/build-crm.cjs
```

Tests use synthetic accounts, artifacts and data. Browser interception supplies
a fake connected account while writes use the actual local store/reducer, with
all nonloopback requests blocked. Existing completed-review tests cover original
QA preservation, attribution, stale versions, adverse sibling evidence,
atomicity and unchanged lead/contact/outreach/deal/cash records. The new tests
exercise fresh reads, once-only submission, uncertain commits, reloads,
account changes, storage failures, and complete per-task classification.

## Release review evidence

- Base: `dd545bc`; isolated branch `codex/crm-agent-workbench-local-20260921`.
- Focused model, adapter, review, reload and CRM checks: **104 passed**.
- Workbench browser checks: **12 passed**, including direct-route delayed auth,
  anonymous isolation, stable entry/close behavior, no reads on open, unchanged
  draft DOM on snapshots, bounded output, recovery and account changes.
- Existing completed-review browser regression: **11 passed**.
- Both 1440px desktop and 390px mobile layouts have no horizontal overflow.
  No browser runtime errors, missing assets or non-GET request attempts occurred.
- CRM build: **156 assets**, all **65** referenced JS/CSS hashes and the shell
  hash verified. See `build-checks.json` and `browser/checks.json`.
- New adapter/workbench unit suites are included in the existing Pages CI gate.
  `git diff --check` and JavaScript syntax checks pass.

The screenshots under `browser/` are local synthetic QA artifacts. The source
and compact JSON evidence are prepared for review; no deployment, live CRM
mutation, native execution, schedules or outbound sends were performed.
