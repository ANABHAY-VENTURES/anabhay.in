# Notification persistence contract — specific binding review

## Approved policy binding update — 2026-10-12

The owner has approved: NULL-team enquiries stay undeliverable through team scope;
dedicated non-human principals receive explicit team grants; content/recipients are
minimal authorized snapshots; only authorized managers can release quarantine,
with audit. Migration 005 is reused unchanged. New 006 is necessary for identity,
fixed scoped capabilities, action receipts and audited release that 005 lacks.
The local PostgreSQL adapter/worker binding is now implemented and tested; no
hosted, public or live-provider activation occurred. See NOTIFICATION-BINDING-RESULTS.md.

History below describes the earlier unbound contract and its evidence. It is not
a claim that the approved policies remain undecided or that 006 was deployed.

Current worker binding remains BLOCKED by identity/routing decisions, not by lack
of a pool. This contract maps actual source; 005 is an identity-neutral storage
draft under local validation, not permission to apply hosted SQL or activate a worker.

## Existing facts / exact gaps

001: teams(active), employees(Auth UUID,role,state), team_memberships exist. There
is NO system worker principal, database-login-to-worker mapping or authorized
worker/team membership. Human employees are not interchangeable with workers.
003 creates unclassified leads with team_id/assigned_to NULL. Global new-enquiry
notification versus team-routed notification is NOT DEFINED.
002: notification_outbox already has UUID/enquiry FK, queued/processing/accepted/
failed, attempts 0–10, next_attempt_at, lease_until, lease_token, provider ID and
accepted_at. Those fields are not recreated in 005. website_enquiries already
stores input idempotency key/hash and one-to-one lead identity.
004: global claim SKIP LOCKED, two-minute lease, attempts capped at ten; accept/
retry require matching live token, retry delay five minutes. It does NOT map
session_user to active worker/team, return lease expiry/time, exclude operational
holds, read content, persist send markers/observations, or replay acknowledgements.
An already accepted row rejects accept; lost ACK cannot be authoritatively checked
by the worker. audit_events supports human employee actors/action vocabulary only,
so it cannot silently serve as the system worker event ledger.

## Required operations, inputs/outputs and transaction contract

All store methods must be fixed capabilities, each READ COMMITTED transaction with
acknowledged COMMIT before success; no generic SQL/pool/role selection. After COMMIT
send, timeout/socket loss means UNKNOWN, not rollback/success. Token plus job UUID
is not sufficient without an active authorized database-authenticated principal.

| Worker/driver operation | Exact input -> output | Atomic effects and checks | Retry / uncertain outcome |
|---|---|---|---|
| claim | {signal} -> null or {id,enquiryId,leaseToken,attempt} | Resolve trustworthy DB principal; active scope; active team and snapshot; exclude held/terminal/exhausted jobs; row-lock SKIP LOCKED; set token/expiry/attempt/worker binding | Unknown claim sends nothing; inspect via future scoped status or wait/reclaim; never trust unacknowledged lease |
| readContent | job={id,enquiryId,leaseToken,attempt}, {signal} -> {snapshot:{destination,templateVersion,text},digest,leaseRemainingMs} | Atomic principal/team/job/enquiry/live lease binding, immutable snapshot, server time; deny null/unapproved routing | Read failure denies send; timed-out read does not authorize content use |
| recordAttempt | job,{key,digest},{signal} -> acknowledged completion | Lock outbox; validate principal/live token, actual attempt/key/immutable digest; append one send-intent marker per attempt; same exact retry is no-op | Marker commits BEFORE provider lookup/send; unknown marker blocks send until authoritative reconciliation |
| recordObservation | job,{key,digest,status,messageId?},{signal} -> acknowledged completion | Same fencing; FK to attempt; allowlisted outcome/receipt only, no body/PII/tokens; append idempotently | Identical record no-op; contradictory receipt rejected/requires review; unknown commit cannot authorize retry |
| accept | job,messageId,{signal} -> acknowledged completion | Principal/scope/live lease; verified acceptance observation; existing outbox transition and exact receipt; atomic operational event | Same already accepted receipt replay needs scoped proof; different receipt/stale owner denied; unknown ACK requires authoritative status |
| retry | job,errorCode,{signal} -> acknowledged completion | Principal/live lease; definitive nonacceptance evidence; queued + five-minute schedule or failed at ten; no lease/attempt reset by caller | Exact same action replay requires per-attempt event receipt; unknown outcome requires status, never blind resend |
| quarantine | job,'provider-unknown',{signal} -> acknowledged completion | Principal/live lease and possible-send evidence; hold row + operational event; no duplicate queue state | Exact same hold idempotent; next claim MUST exclude hold; release is separate reviewed operator action |
| shutdown | no secret data -> cached Promise | Stop admission, dispose owned pool; all outstanding operations observed, bounded external termination checks | Failure cached; unresolved shutdown prevents reuse; Promise settlement alone proves no cancellation |
| reconcile/status (missing from current engine) | stable outbox/key + authorized principal -> attempt/outcome/terminal metadata only | Scoped read, no content or arbitrary lookup, inspect immutable key/digest and committed receipt | Needed after accepted ACK loss, exhaustion/hold and restarts; engine currently relies on reclaim/provider lookup, cannot resolve accepted/held jobs itself |
| consumeLimit / ingestEnquiry / reconcileEnquiry | fingerprint or same key/hash/payload -> boolean/receipt | Existing ingestion-only driver, separate limiter COMMIT; no worker use | Preserve current same-key 200/replay, conflict 409; no new key on unknown |

provider.mjs itself has NO database operation. Its lookup statuses accepted,
delivered,pending,failed with receipt establish prior acceptance; unknown holds;
authoritative absent may permit send. Local fake only. Failed provider delivery is
not permission to send again. No-lookup provider fails closed at worker creation.

Content kernel additionally expects worker {id,active,capability,teamIds}, row
{id,enquiryId,state,leaseToken,leaseUntil,workerId,teamId,teamActive,snapshot,
snapshotDigest} and authoritative numeric serverNow. Those inputs must come from
one trusted SQL statement/transaction, not a browser or independent stale reads.

## Privileges, constraints, indexes and operational audit

Future notification API only EXECUTE on reviewed fixed functions; NO direct table
grants. Narrow NOLOGIN function owner is not table owner/BYPASSRLS and has explicit
column grants/matching RLS. session_user or another independently authenticated
binding must be approved; SECURITY DEFINER current_user alone is the function owner,
not worker identity. No auth-schema/broad helper/admin membership workaround.

005 snapshots have outbox PK/RESTRICT FK, optional recorded team FK (NULL does not
mean global access), fixed namespace and trigger-derived stable provider key and
SHA-256 digest of exact canonical UTF-8 JSON text, bounds/shape check and immutable
triggers. PostgreSQL 17 rejected a generated-column convert_to expression with
42P17; the insert trigger derives the digest/key without falsely declaring the
encoding function immutable. Node canonical order is destination,templateVersion,text; do not hash
jsonb::text as though it were JSON.stringify. Trusted snapshot writer still missing.

Attempt PK(outbox,attempt), attempt 1–10 and unique hashed lease fingerprint
deduplicate records; snapshot digest composite FK prevents mismatched payload.
These constraints do NOT prove lease ownership; the required scoped mutator still
needs authoritative live-token/principal checks and remains unimplemented.
Observation PK(outbox,attempt,provider_state), FK to marker, allowed status/receipt
constraint; never raw provider responses/message content. These are audit evidence,
not a second queue state. Receipt contradiction and action replay still need fixed
functions; table uniqueness alone does not implement them. Holds PK(outbox) prevents
duplicate quarantine, but existing claim ignores holds: no binding is safe yet.

PK/FK/unique indexes cover per-job snapshot, attempt, observation, hold and provider
key lookup. Existing outbox_due/next_attempt_at/SKIP LOCKED path remains. Additional
worker/team/held-job indexes depend on approved identity/scope schema; none invented.
No application read/write/EXECUTE grants on new storage; FORCE RLS, no permissive
policies. postgres retains operator ownership/privilege; immutability cannot defend
against a platform admin disabling triggers. Append-only attempt/observation markers
are operational audit; staff audit schema/actors remain unchanged.

## Decisions that stop binding

1. Company-wide notifications for team_id NULL versus explicit assigned-team routing;
   treatment of inactive teams and source of approved destination/template.
2. System principal authentication: one dedicated DB LOGIN per worker identity or
   shared service principal, lifecycle/active state and scope grants. No principal
   can self-enroll; mapping/provisioning authority and auditing require approval.
3. Immutable snapshot writer/recipient policy, namespace, quarantine release authority
   and retention. No automatic conversion of submitted email into destination.

Consequently no worker-authorizing policy, claim rewrite, content reader SQL,
fenced mutator/RPC or PostgreSQL store adapter is bound. 005 alone is NOT the
complete worker migration. Tests of metadata/admin fixtures are identified as such;
authorization denied by default is not proof of a positive scoped worker path.
Existing 001–004 must not be edited or privileges broadened merely to pass tests.

## Executed local validation — 2026-10-12

005 is now tested as an UNBOUND metadata prerequisite on disposable PostgreSQL
17.11, not as a completed worker migration or a managed Supabase compatibility test.
No application source, capability factory, old migration or authorization policy
changed in this continuation.

Source correction: the original generated digest column failed migration execution
with SQLSTATE 42P17. Read-only pg_proc evidence then confirmed convert_to is STABLE
(s), while sha256/uuid_out are IMMUTABLE (i). The INSERT trigger derives both digest
and provider key, rejects supplied conflicting values with 22023, and existing
append-only triggers prevent later changes. Root JSON type is checked before object
key enumeration so scalar/array inputs return false rather than relying on boolean
evaluation order. No volatility flag was falsely strengthened.

Real metadata campaign evidence:
operations/local/persistence-7c33f14b-d5d0-4124-b06c-24cca49c2e02.json.
Nine real PostgreSQL assertion groups PASS:

1. New tables FORCE RLS, no permissive policies, ordinary-role effective table/
   column denial, no application membership in administrative data roles, and no
   ordinary-role EXECUTE on the three new invoker functions.
2. One immutable snapshot/provider key; Node/PostgreSQL digest agreement including
   supplementary Unicode; duplicate snapshot and forged digest/key rejected. NULL
   team remains unresolved and grants no worker authorization.
3. Invalid shape/type/destination/template/text-byte-bound/namespace rejected.
4. Attempt uniqueness/1–10 bounds/fingerprint/digest FK; provider receipt and
   observation FK/duplicate constraints; DELETE immutability of operational records.
   Snapshot UPDATE/DELETE executed; operational-record UPDATE trigger reviewed in source.
5. Hold uniqueness/reason constraints ONLY; no claim exclusion implementation.
6. Actual notification LOGIN plus anon/authenticated/service_role/ingestion
   capability denials on new tables/functions. No positive cross-team path claimed.
7. Explicit and failed transaction rollback leaves no snapshot.
8. Genuine transport loss BEFORE server COMMIT, independently observed no snapshot.
9. Genuine transport loss AFTER server COMMIT, independently observed one committed
   snapshot while acknowledgement withheld, then same-identity metadata recovery
   without another row/key. Operator fixture, NOT a worker adapter test.

All pg roles were considered by catalog checks. Predefined pg_read_all_data and
pg_write_all_data administrative capabilities have inherent effective ACL access;
they are explicitly recorded as trust boundaries, not silently classified as
application denials. Application/helper/client roles have no membership in them.
Platform administrators can still bypass/alter controls; no new grants were added.

First failed reports remain BLOCKED: persistence-d0c3ced3 (42P17) and
persistence-703cdcac (test incorrectly required administrative built-in roles to
have no effective ACL access). Tests were corrected to the actual privilege model,
not permissions weakened. Later persistence-82b41c39 and final 7c33f14b PASS.

Full Node suite: 107/107 PASS, zero failed/skipped (105 prior tests plus two static
draft checks). Static/Node mocks are NOT real PostgreSQL or provider evidence.
The new --approved-local-persistence controller mode preserves pinned cached images,
local Docker endpoint gate, network=none PostgreSQL, tmpfs DB storage, no mounts or
published ports, namespace-only Node, TLS verification, full-ID/run-label cleanup
and no execution-policy bypass. Reports are sanitized and ignored by Git.
Existing verify.sql asserts versions 1–4, so it runs BEFORE 005; the new metadata
verifier checks exactly 1–5. Do not run the local Auth shim or fixture SQL hosted.

Scoped worker claim/content/ack/retry/reconciliation remains explicitly BLOCKED;
real cross-team/inactive-worker positives/denials, accepted/rejected/unknown worker
recovery, quarantine claim exclusion and durable worker crash/restart tests cannot
be executed until identity/routing and narrow capabilities are approved. Existing
mock tests remain mock-only; table outcome categories are not provider verification.

Exact local commands used (no hosted target):
`node operations/tests/integration/reliability-controller.mjs --approved-local-persistence`
`node operations/tests/integration/reliability-controller.mjs --approved-local-campaign`
`node operations/tests/integration/reliability-controller.mjs --approved-local-outbox`
`node --test operations/tests/persistence.test.mjs`
`node scripts/check-site.mjs`
`git diff --check`

Host application/public submission/live provider remain disabled. No default team,
worker principal, positive authorization grant, migration to a hosted database,
Supabase/recruitment access, commit, push or deployment is authorized or performed.
