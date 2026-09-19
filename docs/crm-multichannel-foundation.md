# CRM contact channels

This release adds contact-route and conversation recording to the existing Revenue Desk register. It does not send messages, connect a provider, create an inbound webhook, change the native agent schedule, or write production leads during deployment.

## Existing records

The lead `channel` remains the acquisition source: direct research, referral, inbound, or event. The existing free-text contact, stages, tasks, accepted reviews, and email verification evidence remain intact. New contact-channel data uses the optional, versioned top-level `outreach` field in the same `agentControl` document. Editing a lead does not reconstruct or erase that journal.

Contact routes identify the channel, recipient, original account, source and verification date. Purpose-specific permission evidence is separate from finding a public email address or phone number. A quote request does not imply permission for unrelated prospecting. Preferred channel is a preference, not permission or proof of a connected sender.

## Recording and advisory checks

The journal preserves permission changes, restrictions and actual conversation events. Recorded route refusals apply to the normalized route; broad account refusals cross offers and channels. Replies pause prospecting. Uncertain outcomes require reconciliation before a retry or alternate channel. Historical contact can be recorded even when it would not have passed a proposed sending check: recording an event cannot authorize it or erase it.

The advisory sequence uses actual prospect contacts, not drafts, internal tests or failed attempts. The approved policy is at most three proactive touches, with follow-ups no earlier than three and seven business days after the first actual send, within ten business days. The sequence parks rather than resetting on a new day or month. Business days mean Monday through Friday; this version does not maintain regional holiday calendars. Proactive hours are 09:00–17:00 in an evidenced recipient timezone. An unknown timezone is a blocker.

The recorded ledger projects combined limits of ten new recipients per UTC calendar day, three initial contacts per coordinator cycle, and twenty business outbound messages per UTC calendar day across channels. Unlinked routes count separately; an explicitly shared person identity deduplicates known recipients across channels. These are advisory counts from recorded evidence, not atomic reservations. Unrecorded activity in another system cannot be counted. No channel becomes executable because an operator selects a readiness status.

Routine preparation and independent review belong to the agents under the existing standing authority. This release does not add per-message owner approvals. Sending still needs exact outgoing-version review, actual recipient eligibility and a verified execution service.

## Storage and deployment boundary

All writes use the existing revision-checked transaction. Stale writes fail and require refresh; this journal is not part of the general timestamp-union synchronization. Anonymous local records remain separate from signed-in account records. A queued local save is rejected if the account or workspace changes before its lock is acquired.

The single-document register retains its 700,000-byte UTF-8 limit. A full register rejects the new write and preserves the prior data. It never silently truncates permission revocations, suppression events, or contact history. Activity's separate 150-entry display limit is not the authoritative contact ledger. Do not delete restrictions to free space. A durable event store is required before scaling or activating a sender.

The current Firestore owner-only access rule does not enforce Revenue-only writers or immutable events against a direct authenticated client. The UI and reducer are application behavior, not a server security boundary.

## Required before transport activation

Actual execution requires a server service with protected credentials, provider and use-case eligibility, authenticated and replay-safe callbacks, durable immediate suppression and reply handling while the user's computer is off, a trusted clock, and atomic cross-channel eligibility/cap reservations. It must use an idempotent outbound intent/outbox and reconcile uncertain provider outcomes before retry. Out-of-order and duplicate callbacks must not undo restrictions or create duplicate contacts.

Provider identity, recipient purpose permission, supported sender access, inbound handling, message review, aggregate limits and end-to-end readback must all be verified for the actual channel. Email verification records from the existing workflow are retained but do not activate a new CRM transport. SMS, WhatsApp and social integrations remain external setup dependencies. No secrets belong in browser bundles or contact notes.

The website's brokerage brief remains local-only. This release does not imply that submitting that brief creates a CRM lead or sends a quote request.
