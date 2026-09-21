# Completed-review guidance — local follow-up

Based on live release `505a0dc`. This candidate addresses observed native UI
friction; it is not published and has not changed live tasks or agents.

The observation was a generic verdict validation error after an actual native
review. The submitted JSON was not captured, so this change does not attribute
that failure to a blank, uppercase or misplaced value.

## Changes

- **Find linked Quality** lists every linked assignment, including accepted
  evidence. Choosing one is explicit and never creates a duplicate or changes
  the retained JSON silently.
- Loading shows the exact source and QA before eligibility errors. Draft QA
  guidance checks the existing Ready transition in memory, identifies paused,
  stale or routed records, and links to the existing task controls. No Claim,
  dispatch, handoff or rerun is manufactured for work already completed.
- The UI distinguishes accepting the independent Quality artifact as evidence
  from accepting the source. REVISE and BLOCKED require source correction.
- Optional prefill requires the actual verdict explicitly. It sets matching
  lowercase `attribution.verdict` and `qaResult.verdict`, and suggests only
  `revise` for adverse findings. PASS leaves Revenue's source decision blank.
  Reviewer, original time, artifact, recorder, notes, checks and factual
  confirmations remain explicit.
- A verified transcription correction is appended to the actual new QA result
  under a separate label. Original finding text, URLs, years and generated
  briefs stay intact. Submitted/accepted findings cannot be replaced here.
- Preview reports missing entries together with exact JSON paths and supported
  enum values. It does not infer or normalize a substantive verdict. Invalid
  input stops before a server read, journal preparation or dispatch.

Only `crm/agent-workbench.js` changes production behavior. The domain model,
exact-version validation, independent attribution, single-writer convention,
fresh reads, owner-session guards, operation journal and outbound holds remain
unchanged. The existing reducer still validates the final request atomically.

## Validation

```text
node --test tests/agent-workbench.test.js tests/agent-register-read.test.js tests/completed-team-review.test.js tests/crm-reload-safety.test.js tests/crm-app.test.js tests/crm-grok-team.test.js
node tests/crm-agent-workbench-browser.cjs
node tools/build-crm.cjs
```

The six focused Node suites have **116 passing checks**. The expanded browser
suite has **17 passing scenarios**, including linked QA
discovery, version-zero Draft gates, original brief/URL preservation, REVISE and
BLOCKED prefill, immutable evidence, aggregated path-specific validation,
recovery, account changes and existing route behavior. Layouts at 1440px and
390px have no horizontal overflow; no page errors, missing assets or non-GET
requests occurred. Browser authentication/data are synthetic and external
requests are blocked. See `browser/checks.json` and `build-checks.json`.

The prior release's evidence is preserved in its original report directory.
Local screenshots are review aids and are not part of the production package.
