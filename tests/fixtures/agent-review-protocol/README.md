# Immutable review-protocol test fixture

These eleven source files are the minimum dependency closure of `createHandler`
from the preserved `reports/grok-agent-interface-redirect-fix-20260923/sources/`
bundle. Each was copied as bytes, then checked against that bundle's
`release-manifest.json` entry. No source contents were changed. The local
`manifest.json` records each file's SHA256 and byte count, plus the original
release manifest's path, schema, creation time and SHA256 for provenance.

This fixture is test-only. It does not replace production backend, browser,
configuration or authentication code, and does not establish deployment, native
adoption or independent real-world execution. The handler imports Firestore code
as part of its dependency closure, but the test supplies an in-memory store. Its
identities, signing keys, JWTs and account state are generated synthetic inputs;
all fetches are intercepted. No credentials, customer records or live policy
configuration are included.

`tests/agent-review-client.test.mjs` imports this directory so its signed-protocol
tests run from a clean checkout without the parent workspace's reports. Its first
test checks the exact dependency inventory, hashes and lengths. `.gitattributes`
disables source newline conversion to preserve the sealed bytes on any platform.

Do not update these files from the current working backend or edit their policy
text. A deliberate fixture refresh must identify a preserved source bundle,
verify its original manifest, recopy the complete dependency closure, and update
the provenance and regression expectations together. Hashes detect byte drift;
they do not prove authorship, authorization or deployment.
