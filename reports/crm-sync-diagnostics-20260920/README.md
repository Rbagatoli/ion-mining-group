# CRM sync recovery and saved-work visibility

The CRM could retain its last valid team register while the account badge continued to say it was checking sync. Current software already recognizes Custom Site Search and Existing Site Review; this release does not broaden enums or repair customer records.

## Changes

- Show a clear sync error, the unsupported field type, and a separate last server-confirmed observation time. Rejected snapshots retain the previous valid register and keep writes blocked. Diagnostics never echo an unsupported value or contact information.
- Put the latest persisted lead and task result above older recorded ASIC batches. Include energy services even when no task is linked. Open assignments remain separate from saved results and live agent execution.
- Prevent stale or unconfirmed snapshots from showing fresh-work animation. Accepted drafts remain unsent; the funnel says Outreach, and a footer-only readiness gap says Business mailing address needed. Explicit sending holds remain separate.
- Detect new published CRM releases with a small same-origin manifest. A candidate must match its HTML metadata, full shell hash, stamped local JS/CSS content hashes, and a second manifest read. Source previews do not poll.
- Apply a compatible release only when the account is settled, interaction has paused for ten seconds, and no form, focused editor, unsaved planning values, retained intake draft, pending write or uncertain outcome needs the page. Failed/uncertain writes are held conservatively. No timeout or unrelated snapshot clears them.
- Retain URL and account scope, restore scroll position, and prevent repeated reload attempts. Only release identifiers, the existing route, and scroll coordinates are stored in session storage; draft content is never copied. A deferred update displays one notice.
- Generate the release identity from every declared packaged asset with normalized text line endings. The app's existing cache scope is unchanged.

## Validation

The focused model/store, completed-review, app lifecycle, workflow, updater, reload-safety, private-inbox and local backend integration suites pass. Synthetic rendered tests cover:

- Retained invalid snapshots, later valid snapshots, cache/pending states and account isolation.
- Latest unlinked energy lead, historical results and absence of recorded active tasks.
- Responsive diagnostics at 320, 390 and 1440 pixels; exact record links and no unintended writes.
- Open-draft preservation, unconfirmed-write holds, mixed deployment refusal, and actual safe navigation with route/account/scroll restoration.
- The complete public website suite and Pages assembly, with internal reports, private API candidates and customer records excluded.

Reproduce the browser checks with `node tests/crm-sync-diagnostics-browser.cjs` and `node tests/crm-release-update-browser.cjs`. Screenshots and local check logs are generated alongside this report and are not published.

## Rollout limit

An already-open tab that predates the updater must load the new client once. After adoption, visible clients check every five minutes and on focus (throttled to one minute), then apply updates only when safe. This is release recovery, not live bot telemetry, a provider connection, data migration or automatic outreach.

Supplier/buyer/referral relationship types, broader lead-to-deal linkage and assignment ownership improvements remain separate follow-up work; this release does not infer them from existing records.
