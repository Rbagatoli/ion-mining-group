# Staged independent review connection

This browser connection reduces manual CRM steps for a Revenue → Quality → Revenue review. It is disabled in `crm/agent-exchange/review-config.mjs` and is not mounted by a CRM route. The existing lead-only gateway, account configuration, schedule and outreach hold are unchanged. Publishing the modules does not activate them.

## Protocol and account boundaries

1. Revenue uses its existing confirmed owner CRM register and Firebase Auth session to request a challenge for one exact source task, linked Quality task and revision.
2. A distinct Quality Firebase user receives the signed challenge. Its view displays the records embedded in that artifact, supplies an actual independent finding and obtains an attestation. Local parsing does **not** verify the HMAC. The authenticated server verifies it. An attestation returns `saved:false` and is not a CRM commit or proof the review was competently performed.
3. Revenue prepares a closeout with the attestation, explicit disposition and checks. Preparation is local. Submission records a durable attempt before sending once. An uncertain outcome is reconciled using the original operation's receipt, never by resending or replacing its ID.

The host accepts an explicitly supplied `ion-mining` Firebase Auth instance. It never signs in, switches accounts, takes a pasted token, or derives configuration from URL parameters/storage. Quality needs no owner Firestore access. Account or session-epoch changes revoke in-flight work and clear the view. Revenue's dedicated closeout journal is `proton-agent-review-closeouts-v1`; the lead journal stays separate.

## Activation is not included

Required facts and reviewable scope before activation:

- An established, separately authenticated Quality Firebase UID, distinct from Revenue's owner UID, with an intentional Proton-only membership. A native bot name does not establish this identity. Use a separate browser session or explicitly supplied named Auth instance; do not sign Revenue out to manufacture Quality access.
- A separately approved full-profile gateway endpoint and exact policy/principal pins. Keep the current lead-only deployment intact. The sealed server's full Revenue role allows `lead.save`, `task.add`, `task.ready`, `task.result`, `task.block`, exact review challenges and signed closeouts. Quality can attest and read capabilities but cannot read/write the register. There are no email, purchase or other external-action endpoints. This full profile is broader than closeouts alone and must be described as such.
- Explicit trusted host mounting and configuration, followed by a real same-pair test with separate sessions and original receipt readback. No principal, credentials, signing keys or deployment were created by this package.
- Native budget/wake/artifact delivery bindings. This browser surface creates no scheduler or autonomous review and does not replace the existing team's admitted work.

Signed artifacts expire after 30 minutes; create them within an admitted review opportunity. Submitted source/QA result bodies remain immutable through the sealed full API. This feature does not add generic correction/resubmission or make old reviews cover newer source versions.

## Validation

Run `node --test tests/agent-review-client.test.mjs tests/crm-review-host.test.mjs tests/crm-closeout-exchange.test.mjs tests/crm-agent-assets.test.mjs` (41 checks). The protocol tests use the exact sealed handler's dependency closure and synthetic Firebase JWTs/stores, including PASS, REVISE, BLOCKED, stale/forged artifacts, account changes, denied scope and original receipt recovery. The test-only fixture manifest checks every retained byte.

Run `node --test tests/crm-review-view-browser.test.mjs` with `AGENT_PLAYWRIGHT_PATH` and `AGENT_BROWSER_PATH` set to existing local browser dependencies when necessary (7 checks). It serves an isolated synthetic page with a fake host; no real sign-in, CRM state or provider call is used. Real full-profile activation and unattended operation are not established by these tests.
