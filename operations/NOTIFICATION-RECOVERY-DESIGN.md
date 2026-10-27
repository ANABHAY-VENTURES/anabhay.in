# Notification recovery design — review required, not implemented

No provider is selected. No worker loop, provider adapter, content reader, webhook,
delivery ledger or reconciliation capability is implemented. Migrations 001–004
remain drafts. This document proposes future work; it does not authorize SQL,
hosted access, publication or public enquiry activation.

## State and evidence

Durable intent is the unique outbox row committed with the enquiry. `queued` in an
ingestion receipt records that initial enqueue, not the job's current state.
`processing` is a committed claim with a two-minute lease and random fencing token;
it is not evidence of a provider request. `accepted` means the worker recorded a
provider acceptance identifier. Current SQL only validates its shape and the live
lease: it cannot verify that identifier with the provider. Confirmed delivery needs
separate authenticated provider evidence, not an HTTP success or database update.
`failed` currently means ten attempts exhausted, including expired tenth leases.
It cannot establish that no external message was accepted or delivered.

Future provider outcome must distinguish definitely rejected, accepted, delivered,
and unknown. Preserve ambiguous outcomes for reconciliation; never label exhaustion
as definite external failure. Do not retrofit these semantics with unreviewed SQL.

## Proposed worker capabilities and content boundary

Use only a dedicated notification LOGIN with membership in ops_notification_api,
never service_role, ingestion, staff administration or table-reading credentials.
Existing fixed driver operations claim/accept/retry remain the capability boundary.
Claim success is usable only after acknowledged COMMIT. An unknown claim result
must not cause a send: let its lease expire and reclaim through the normal API.

A future fixed content operation `readNotificationContent(outboxId, leaseToken)`
is proposed, not an existing RPC. A separately reviewed migration must bind both
parameters to one processing outbox row with the exact unexpired token, joining
its enquiry_id internally. Never accept a caller-supplied enquiry/team/actor ID.
Return only the approved notification fields and immutable template/version,
destination and canonical content digest. Return no staff records, activity,
assignment history or general query interface. Direct table reads remain denied.

Proposed projection for internal new-enquiry notifications: outbox/enquiry IDs,
immutable template version, fullName, workEmail, organisation, projectType and
description only. Phone is omitted by default. Destination comes from approved
server configuration, never the submitter; no recipient is invented here. Approve
that projection and reply-to handling before snapshot/content-reader implementation.
Do not send full PII if an approved minimal ID-only notification meets the need.

Use a dedicated narrow NOLOGIN function owner with only necessary column grants
and explicit nonrecursive RLS; no BYPASSRLS, auth-schema grants or broad schema
CREATE. Review all default/effective EXECUTE and transitive role paths. Public,
authenticated, ingestion and staff clients must be unable to invoke it. Worker
is a system notification service, not a human staff identity. If multiple workers
are restricted to distinct teams, existing global claim is insufficient: a trusted
worker-to-team mapping and claim/content enforcement need separate design before
such deployment. A lease grants one job's content, never arbitrary cross-team data.

Freeze destination and content version per intent before first send. Current rows
do not contain a complete immutable provider payload: snapshot/version storage
needs review before implementing a provider whose deduplication requires identical
payloads. Template edits must not change an already attempted intent.

## Bounded processing, fencing and retries

Initially use one in-flight job per worker and a host-wide approved concurrency
budget. Proposed processing budget: at most 60 seconds after claim acknowledgement,
with at least 30 seconds of verified lease margin before any send. This requires a
future content result to include server lease_until/server time; claim currently
does not return expiry. Bound acquisition, content read, provider connect/body and
database acknowledgement separately. A timer/AbortSignal is not proof of network
cancellation or provider nonacceptance. Do not send after uncertain lease validity.

Existing accept/retry requires the matching live token. Expiry or reclaim fences
old workers out of database transitions, but cannot retract an external send.
Current backoff is fixed five minutes, maximum ten claims; no exponential backoff
or renewal exists. Provider Retry-After exceeding that schedule requires a reviewed
bounded scheduling capability rather than sleeps holding leases. Never change SQL
or increase attempts to force a successful test.

Lease renewal is unnecessary only if sandbox evidence meets the approved processing
budget. Otherwise review a narrowly scoped renewal operation: same job/token/live
lease, fixed maximum lifetime from claim, no resurrection after expiry, no arbitrary
timestamps or attempt resets. Renewal is future work, not an assumed capability.

## Idempotency and ambiguous acceptance

Provider idempotency key must derive solely from the durable outbox UUID plus an
approved environment namespace; it remains unchanged across claims and restarts.
Never use lease token, attempt, random retry key or personal information. Provider
must guarantee deduplication for the entire maximum retry and incident horizon,
bind keys to immutable payloads, and support lookup by key or a durable receipt.
Choose a provider only after documenting retention, concurrent-key behavior,
timeout semantics and sandbox/production differences.

On a lost provider response, lookup the same key. If acceptance is established,
record it with a valid lease. On lost database acceptance acknowledgement, a future
lease-scoped status/reconciliation operation must establish accepted state and the
matching provider receipt. Existing accepted jobs cannot be reclaimed and existing
worker lacks this read capability. Do not retry acceptance blindly after expiry.
If a new lease is acquired, reconcile the same provider key before any send.

If lookup is eventually consistent, bounded polling must wait for its documented
visibility horizon. Absence is not proof of nonacceptance before that horizon.
If provider idempotency/lookup is absent, expired or inconclusive, quarantine the
intent for authorized review and stop automatic resends. That needs a separately
reviewed unknown/quarantine state and reconciliation ledger; current retry/failed
states alone cannot safely represent it. Do not promise exactly-once delivery.
Even duplicate-free provider acceptance does not prove exactly-once mailbox delivery.

## Failure timelines

| Failure point | Durable/local evidence | Required recovery |
|---|---|---|
| Claim COMMIT acknowledgement lost, before send | Claim may exist; no usable acknowledged lease | Send nothing; allow expiry/reclaim |
| Crash after committed claim, before send | Processing lease; provider key might have no request | Reclaim after expiry; lookup key before send |
| Provider accepts, response lost | External effect unknown locally | Reconcile same key; never mint replacement key |
| Provider acceptance verified, database accept fails | Provider receipt exists, local processing/unknown | Lookup durable DB state using reviewed capability; reconcile under valid/new lease |
| Accept COMMIT succeeded, acknowledgement lost | DB may already be accepted | Verify status; never classify as definite rejection or resend |
| Crash after database acceptance | Accepted row excludes future claim | Delivery remains unconfirmed until verified event |
| Lease expires during provider request | Old token cannot mutate DB; external request may succeed | New owner reconciles key; old worker stops, reports ambiguity |
| Tenth lease expires | Current SQL marks failed | Alert and reconcile external state; no eleventh automatic send |

## Provider verification, shutdown and operations

Adapter validates bounded response size, status, schema and receipt length before
calling accept. Do not treat malformed success responses as rejection. Verify
webhook signatures with provider-supported libraries, timestamp tolerance, replay
deduplication and intent mapping; no custom cryptography. Webhook/delivery capability
must be separate from worker claims, with no arbitrary status or actor updates.
No provider response bodies, tokens, emails or message content in logs.

On shutdown stop claims immediately, drain only within the lease and process budget,
observe every in-flight operation, then close pools through the cached driver
shutdown promise. Dispose uncertain connections; this does not prove server or
provider cancellation. Do not release a lease early while a send may still run.
External controller must verify process/backend termination. After timeout or pool
failure, refuse process/environment reuse and reconcile before restarting work.

Keep provider keys in host secret storage, separate from database credentials.
Rotate with bounded overlap and verified old-key revocation; never log configurations
or use admin/service-role fallback. Public artifact excludes Operations but a public
Git repository still exposes committed source: secrets never belong in source.

Allowlisted metrics: queue age/depth, attempts, expiry, uncertain outcomes, provider
status category, reconciliation latency, exhaustion, DB/worker health. Logs use
correlation IDs or approved opaque intent IDs, sanitized stage and SQLSTATE only.
Alert on oldest pending age, any unknown/exhausted job, sustained rate limits,
stale-token attempts or redaction failures. Thresholds, recipients and on-call owner
require approval. Incident runbook: pause claims, preserve sanitized evidence,
reconcile by durable key, prohibit blind resets/resends, document authorized repair.

Retention durations are NOT APPROVED. Minimize worker memory lifetime, avoid disk
spools, and exclude content from diagnostics. Approve enquiry/outbox/receipt/event
and backup retention together; retain idempotency evidence longer than retry and
incident horizon. Deletion must respect existing RESTRICT relationships and never
remove unresolved intents automatically. Define data-subject handling, recipient
allowlist and purpose/legal basis before production.

## Required sandbox and staging evidence

1. Prove dedicated managed role ownership/grants and real JWT staff denials; hosted
   Auth shim equivalence is unverified. Keep production/recruitment separate.
2. Test content lookup for wrong ID/token, expired/reclaimed leases, inactive team,
   public/staff/ingestion denial and bounded immutable payloads.
3. Provider sandbox: accepted, definite rejection, timeout before/after acceptance,
   disconnect, 429/Retry-After, 5xx, malformed/oversized response, duplicate and
   concurrent same-key requests, different payload/same key, retention expiry,
   delayed lookup visibility and replayed/forged webhook.
4. Crash at each timeline point; independently verify provider acceptance and DB
   state. Test lost DB acknowledgements, lease rollover, stale tokens, exhaustion,
   concurrent workers and graceful/forced shutdown. Mocks cannot prove provider
   deduplication, actual acceptance or real delivery.
5. Verify secrets rotation, TLS/hostname checks, connection budgets, no PII in
   process/container logs or artifacts, metrics/alert routing, backup/restore and
   reviewed non-destructive migration recovery.
6. Approve provider guarantees, immutable payload schema, reconciliation/quarantine
   capabilities, worker/team scope, budgets, retention and incident responsibilities.
   Only then authorize isolated staging implementation. Production activation needs
   separate human approval and passed hosted/provider evidence.

## Public compatibility

js/enquiry-api.js accepts `notification: 'queued'` and legacy `'sent'`; the type
contract permits both. Current proposed backend emits queued, and contact supplies
no endpoint, so public submission remains unavailable. Neither legacy sent nor
queued proves delivery. Do not change public behavior in this batch.

Before activation, review removing/deprecating sent and use receipt wording:
"Enquiry saved; notification queued." Keep the receipt historical, not a mutable
delivery claim. If future status is shown, distinguish accepted, verified delivered,
definite failed and unknown; never expose arbitrary enquiry status by UUID alone.
Any polling authentication, receipt capability and schema change requires separate
privacy review. No status endpoint is proposed as an existing implementation.
