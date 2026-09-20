# Private energy-site intake

This Worker receives enquiries into a dedicated private D1 queue. It does not send email, contact an owner, execute a native agent, change Firebase rules, or purchase a service. `energy@protonminingco.com` remains the recorded routing destination and direct-email fallback. A successful response means the enquiry is durably stored for the configured Proton owner account; it is not an email-delivery claim.

## Deployment state: 20 September 2026

Implemented and tested locally; **not deployed**. The committed Wrangler file deliberately has a placeholder D1 ID and no configured owner identity. Public receipt remains unavailable until the prerequisites below are resolved.

Read-only checks observed Wrangler 4.69.0 installed and an existing Cloudflare login. The token can read the Scalpdesk account, which contains `scalpdesk-db`; the known `proton-strike-proxy` Worker is absent there (Cloudflare error 10007). The personal account listed by Wrangler rejects D1 and Proton Worker deployment reads with authentication error 10000. No unrelated database or Worker was changed. The correct Proton account is not accessible with the observed token. No deployment account was inferred from the login email.

Remaining prerequisites:

1. Access to the intended Proton Cloudflare account. Confirm its existing Proton Worker footprint before selecting it. A new login/token or account permission is needed; do not copy credentials into this repository.
2. A dedicated D1 database, `INTAKE_DB` binding, and `schema.sql` applied to that database. Never bind `scalpdesk-db` or another application's storage.
3. An explicitly confirmed CRM owner: set `OWNER_UIDS` (comma-separated exact Firebase UIDs) or `OWNER_EMAILS` (exact emails, requiring Firebase-signed `email_verified: true`). An ordinary sign-in to the same Firebase project is insufficient. There is no domain-wide allow rule. Secrets should hold the real allowlist; do not commit owner identities.
4. Set a random `RATE_LIMIT_SECRET` of at least 32 characters, `FIREBASE_PROJECT_ID=ion-mining`, and `ROUTE_EMAIL=energy@protonminingco.com`. Keep CORS limited to the exact production website origins.
5. Deploy the Worker, confirm `/v1/health`, and configure the public form and private CRM inbox with the same HTTPS endpoint. GitHub Pages deployment alone does not deploy this Worker.
6. Before calling intake live, use a clearly synthetic request to verify an actual deployed receipt, retrieve that exact request in the authorized private inbox, retry the same identity once, and confirm unauthorized reads fail. No customer records are needed for this check.

An email notifier is **not configured**. The API reports that separately from durable receipt. There is no provider delivery claim, silent email fallback, or claimed auto-execution. A future notifier needs a separate durable outbox/delivery outcome; it must not make a stored enquiry disappear if notification fails.

## Public interface

All JSON responses have `Cache-Control: no-store`. Customer details are not echoed in public receipts/errors. Public GET routes never return request records, contacts or qualification data.

`GET /v1/health`: success is `{ready:true,service:"proton-site-intake",receipt:"private_queue",notification:"not_configured"}`. Missing configuration, schema or tables returns HTTP 503 with `ready:false`. A healthy read verifies schema availability, not future storage-write success; submit failures remain explicit.

`POST /v1/requests` requires exact allowed `Origin`, `Content-Type: application/json`, and `Idempotency-Key` containing a browser-generated UUID. The production Worker uses Cloudflare's trusted client-IP header. Maximum JSON body is 24 KiB, enforced while reading the stream. Fifteen new requests per IP/hour and 300/day globally limit abuse; only keyed HMAC rate buckets are stored, not raw IP addresses. Daily cleanup removes expired buckets. The global ceiling should be reviewed against actual legitimate volume before changing it.

Payload:

```json
{
  "service": "custom_search",
  "contact": {"name":"Client name","email":"client@example.test","phone":"","company":""},
  "brief": {
    "country":"US",
    "power":{"value":160,"unit":"kW"},
    "geography":"Texas",
    "transaction":"lease",
    "upfrontBudget":{"amount":null,"currency":"unknown"},
    "timing":"unknown",
    "costBasis":"unknown",
    "existingOpportunities":"Already known or rejected sites to exclude",
    "siteDetails":"",
    "acquisitionSource":"How the client found this opportunity",
    "sourceTypes":[],
    "notes":""
  },
  "attribution":{"source":"","medium":"","campaign":"","referrer":"","landingPath":"/energy-sites.html"},
  "consent":true,
  "website":""
}
```

Services: `custom_search`, `site_review`, `site_submission`. Country must explicitly be `US`; arbitrary geography text is customer-reported, not verified location. A review/submission must identify its site in `siteDetails` or `existingOpportunities`. Usable power may be unknown at receipt for any service. Unknown custom-search power blocks qualification and assignment until a clarified brief is received. `site_review` can support bounded fact finding with unknown power. CAD is a budget currency, not an assertion of Canadian service coverage; no FX conversion occurs.

Optional canonical brief fields: `states`, `excludedStates`, `excludedSources`, `minMw`, `maxMw`, `maxDeliveredCentsKwh`, `maxEnergyCentsKwh`, `maxSiteCapitalUsd` (legacy USD only), `supply`, `operation`, `connectionReadiness`, `minUptimePct`, `minTermMonths`, `startBy`, `additionalRequirements`, `knownSiteExclusions`, `targetSiteIds`, `capitalPayer`, `authority`, `introductionTerms`. Exact known-site IDs are distinct from unresolved narrative references. Known/rejected exclusions apply to a search; a supplied review target must deliberately be investigated by the downstream service-aware model.

Preserved legacy form aliases: `powerCostCents`, `operatingFlexibility`, `minimumAvailabilityPct`, `supplyArrangement`, `capitalResponsibility`, `infrastructurePreference`, `exclusions`. Optional enum `unknown`/`Not specified` values normalize to null, never confirmed supply or uptime. Do not silently coerce numeric text or invent missing capacity. Unsupported fields fail validation rather than silently disappearing.

Referrer may be a hostname or HTTP(S) URL; any query/fragment is removed server-side. Landing paths also discard query/fragment. Campaign fields are bounded. Acquisition/source attribution is client-supplied and is not verified provenance.

201 after committed receipt, or 200 on identical retry:

```json
{"received":true,"requestId":"REQ-<UUID>","receivedAt":"<ISO UTC>","status":"received","duplicate":false,"receipt":"private_queue","notification":"not_configured"}
```

The same identity with different normalized content returns 409. Keep the same key and original payload after a timeout/503; retry reconciles an uncertain commit. A changed brief needs a new request identity after the earlier outcome is reconciled. There is no public existence/status lookup: receipt IDs are references, not authorization tokens. Rate limiting returns 429; invalid fields 422; oversize 413; failed storage 503. Errors use `{error:{code,message}}` and never expose database errors or customer data.

## Private interface and CRM handoff

All private routes require a Firebase RS256 ID token in `Authorization: Bearer ...`. The existing portal JWT signature verifier is reused with strict algorithm, required numeric expiry/issued-at, exact issuer/audience and configured owner guards. No auth-project or Firestore-rule changes are needed.

- `GET /v1/requests?status=received|qualified|rejected&cursor=<seq>&limit=1..50` returns `{requests:[record],nextCursor:null|string}`. Omit status for all states; do not treat a single page as the entire inbox.
- `GET /v1/requests/:requestId` returns `{request:record}`.
- `GET /v1/metrics` returns private acquisition totals: `receivedTotal`, `qualifiedTotal`, `rejectedTotal`, `queueDrafts`, `acknowledged`, `byService`, `bySource` (top 100 received sources). Received includes every stored request; qualified counts current qualified state. These are actual received/qualified enquiries, not page-view conversions.
- `POST /v1/requests/:requestId/actions` applies one revision-checked, idempotent decision and returns `{request:record,duplicate:boolean}`.

Record:

```text
id, service, briefRevision:1, revision, status,
receivedAt, updatedAt, routeEmail,
notification:{status:'not_configured'},
payload:{service,contact,brief,attribution,consent},
queue:{state:'not_queued'|'draft_saved'|'acknowledged', ...},
history:[{actionId,expectedRevision,type,note,...,recordedByUid,at,revision}]
```

The original customer payload and `briefRevision:1` are immutable in v1. The mutable `revision` increments for decisions, not changes to the brief. Exact immutable brief ID equals `record.id`. The server cannot validate arbitrary CRM records; the supported UI must verify its saved assignment before linking it.

Action payloads all require a UUID `actionId`, original `expectedRevision`, `type`, and nonempty `note`:

| type | Additional required fields | Effect |
|---|---|---|
| `qualify` | — | Received → qualified; unknown usable power blocks custom search |
| `reject` | — | Received → rejected; original brief retained |
| `queue` | `taskId`, `briefId` exactly matching request ID | Qualified → `draft_saved`; server stamps `taskOwnerUid`; site submission cannot use this action |
| `acknowledge` | matching `taskId`, actual `acknowledgedBy`, `acknowledgedAt` ISO time, `evidence` | Saved draft → acknowledgment recorded |

A queue link records that the supported CRM interface verified a draft save. It **does not invoke a native bot or claim execution**. An acknowledgment needs actual separately observed delivery evidence; never create it automatically after saving the draft. The server records the saving account as `queue.taskOwnerUid`; only that same authenticated owner account can acknowledge its per-account CRM draft. Recorded actor attribution is within the authenticated owner account, not independent authentication of a named native agent. Independent review and Revenue's sole-writer role remain unchanged.

Reusing the same action ID and exact original payload is safe after an uncertain save, including after the request revision changed. A changed action body or reused ID on another request conflicts. Stale revision conflicts do not overwrite the draft or silently retarget it. Status update and audit history commit together in one D1 transaction, including same-key cross-request races. No generic batch mutation or edit-body API is provided. For clarification, receive a new brief referencing the earlier ID; amendments and merge decisions remain an explicit future enhancement.

## Validation observed

`node --test tests/intake-backend.test.mjs` — 15 tests pass with real SQLite transactions and generated RS256 tokens: receipt, concurrent duplicates, altered payload, rollback, schema/config fail closed, validation/legacy inputs, canonical energy families, conflicting power bounds, CORS/body limits, rate limiting, wrong signatures/owners/unverified emails, exact revision transitions, cross-tab conflict, cross-request action identity race, task-owner scope, supply/unknown-power restrictions, private metrics and pagination.

`wrangler deploy --dry-run --config worker-intake/wrangler.toml --outdir tools/.cache/intake-worker-build` — bundles successfully; does not deploy. The local Windows sandbox needed permission to let esbuild read parent directories.

`tests/intake-runtime.test.mjs` runs the built bundle in real workerd/Miniflare with a synthetic D1 database when `MINIFLARE_PATH` and `INTAKE_BUNDLE_PATH` are set. Observed: pass. Concurrent same-key requests produced one receipt, changed payload returned 409, an SQL-triggered write failure rolled back rate and request writes, and public record reads returned 401. This does not establish production deployment or live receipt.
