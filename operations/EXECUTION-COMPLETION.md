# Execution-mode local completion — 2026-10-12

Status: LOCAL COMPONENTS IMPLEMENTED AND TESTED; DURABLE WORKER BINDING BLOCKED.
No hosted resource, remote connection, actual credential, provider request or public
activation was used. No migration, grant, RLS policy or lockfile dependency changed.

## Implemented components

- server/config.mjs: explicit scoped startup config validator; public/staff use typed
  publishable keys, API and worker reject mixed credentials, elevated names, target
  mismatches and URL SSL overrides. TLS verification is required. Provider/admin
  loaders deliberately reject: no live integration or administrative runtime exists.
  The input is a scoped object, not process.env or an environment dump. CA/target
  identity comes from trusted caller configuration. Key shape does not prove project
  ownership. Legacy anon JWTs and pooled tenant usernames are currently unsupported,
  fail closed, and need separate compatibility review before hosted use.
- server/postgres.mjs: createIngestionDriver and createNotificationDriver each create
  one pool and expose only their capability methods. Existing combined factory is
  retained for prior isolated tests, not runtime wiring. Fixed SQL, healthy identity
  checks, parameterization, idempotency, error listeners and shutdown remain intact.
- server/process-runtime.mjs: explicit startup factories validate before creating
  pools. API returned capabilities are only abuseCheck/persist; worker returned DB
  capabilities are claim/accept/retry. No secret configuration is returned. No HTTP
  listener or environment loader is started; no public enabled flag is added.
- server/provider.mjs: bounded metadata validation, acceptance/delivery distinction,
  authoritative absent/unknown reconciliation decisions and fail-closed missing
  lookup/idempotency behavior. Live adapters cannot be used by this local worker.
- server/notification-worker.mjs: working runOnce engine with bounded admission and
  execution, committed-store contract, fenced attempt markers before sending,
  immutable key/digest, lookup before every possible send, fresh lease/content
  checks, retry/quarantine decisions and cached bounded shutdown. Timeouts retain
  observed pending operations and halt new work; no cancellation guarantee. Unknown
  acceptance/DB acknowledgement returns unknown, never success or automatic resend.
  Lease ownership and persistent backoff/exhaustion are enforced by the required
  trusted store capability, not by pretending local timers authorize changes.
- server/notification-content.mjs: local authorization kernel requires trusted
  active worker/capability/team binding, matching job/enquiry/token, active team,
  live server lease and verified immutable snapshot digest. Only destination,
  templateVersion and text are returned. No arbitrary SQL, employee, recruitment or
  CV access. This is NOT a PostgreSQL content reader; evidence must come atomically
  from a reviewed narrow database capability, never request data.
- tests/support/fake-provider.mjs and notification-store.mjs: deterministic fake
  provider and explicitly IN-MEMORY MOCK store. They perform no network operations.
  Mock metadata holds keys/digests/outcomes/receipts only, not message content. It
  models a proposed quarantine state absent from the current SQL. It survives worker
  instance replacement in one test process, NOT actual host/process data loss.

No automated polling/scheduler, live delivery adapter or production bootstrap is
installed. The engine is driven explicitly by runOnce; this keeps local execution
testable and prevents accidental process/background activation.

## Tests actually executed

Before changes, full existing suite: 67/67 PASS, zero failed/skipped.
Focused first implementation: 51/51 PASS (includes existing driver mocks).
Expanded full suites: 97/97, 101/101, then 102/102 PASS as coverage was added.
Final current full suite: 105/105 PASS, zero failed/skipped, recorded in final
reliability controller report. Counts are successive runs, not additive results.

Commands from repository root:

```text
node --test --test-reporter=spec scripts/enquiry.test.mjs operations/tests/*.test.mjs
node operations/tests/integration/reliability-controller.mjs --approved-local-campaign
node operations/tests/integration/reliability-controller.mjs --approved-local-outbox
node scripts/check-site.mjs
git diff --check
```

Syntax checked config/process-runtime/provider/notification-worker/content modules.
Site checker PASS for ten public pages. Whitespace check PASS. AllSigned unchanged;
unsigned PowerShell runners were not executed. No installation or image pull.

Real local PostgreSQL evidence:

- reliability-6b716f4f-3bc4-42c1-9563-f7f8a27423b9.json: first campaign PASS,
  97 Node tests; one-capability process factory assertion PASS.
- reliability-36d609c1-4797-489d-a896-987124833da5.json: final campaign PASS,
  105 Node tests, zero protected source changes during run. Bootstrap, unchanged
  migrations 001–004, verify.sql and outbox-recovery.sql executed. Trusted/negative
  TLS, real checkout/re-checkout socket loss, pool/lock/statement deadlines, rollback,
  durable rate accounting, genuine COMMIT acknowledgement loss, concurrent same-key
  recovery and uncertain shutdown PASS. Ingestion-only driver committed ingestion/
  rate; notification-only driver committed fenced claim/retry with separate LOGINs.
- outbox-49a99894-b060-4676-a112-ef09bb5066c8.json: PASS; twelve real ownership,
  lease, overlapping-claim, stale-token, direct-access-denial, rollback, acceptance,
  backoff/exhaustion and replay groups. 101 Node tests at that revision. Long retry
  intervals used clearly labeled fixture time advancement, not five-minute waits.

Reports live in ignored operations/local. Three campaigns created six disposable
containers using pinned cached images, network=none PostgreSQL, tmpfs, no mounts or
published ports and only its namespace for Node. All six removals were verified by
full ID after matching run labels; unrelated resources/images were preserved.

New worker/provider/content tests are MOCK/FAKE evidence ONLY: acknowledged accept,
lost response and same-key reconciliation, provider-accepted/DB-failure, lost DB ACK,
definite rejection/rate limits/server failure, same-key duplicate/mismatch,
delivered/pending/failed/unknown lookup, no lookup denial, metadata privacy,
attempt-marker failure, expiry during send, stale owner, immutable snapshot change,
inactive worker/team/wrong-team/missing-job/insufficient capability, ten-attempt
exhaustion, accepted tenth intent, concurrent admission, timeout tracking and bounded
cached shutdown. They do NOT establish durable PostgreSQL worker persistence,
managed Auth/RLS, provider guarantees or external delivery.

## Exact remaining blockers and decisions

1. **Database content reader:** ops_notification_api has only claim/accept/retry;
   notification executor can access queue metadata only. No approved lease-scoped
   content function exists. Do not grant it SELECT on leads/enquiries. New enquiries
   are unclassified/team_id NULL; global notifications versus team-bound worker
   scope and active identity bindings must be decided before a reader can authorize
   them. The local kernel fails closed for missing scope.
2. **Immutable provider payload:** 001–004 contain mutable lead fields, not an
   immutable destination/template/content snapshot. Provider idempotency cannot
   safely bind changed content across retries. Requires an additive reviewed snapshot
   design, not a hidden change to prior migrations.
3. **Operational ledger/quarantine:** current queue has only queued/processing/
   accepted/failed and no fenced recordAttempt, recordObservation, quarantine or
   worker-visible reconciliation capability. Claim omits server time/lease expiry.
   The worker requires those capabilities and refuses missing store methods. Current
   driver cannot be plugged into the engine as if it provided them. Existing failed
   exhaustion cannot represent definite external rejection versus unknown acceptance.
4. **Active worker identity/team mapping:** current dedicated LOGINs are capability
   members, not active team-bound principals. Human employees and auth.uid cannot be
   silently substituted for system worker authority. Approve global versus per-team
   worker model, inactive-team handling, scope/bootstrap and narrow function ownership.
5. **Real provider/runtime:** only fake adapter is permitted. Provider guarantees,
   retention/lookup consistency, allowlisted sandbox recipients, webhook verification,
   delivery-event persistence and deployment secret loader need separate approval.
   Do not call a normal 5xx definitely rejected without a provider contract; fake
   retryable results model definite nonacceptance only. Ambiguous real results must
   remain unknown/held. Exactly-once external delivery is not promised.
6. **Hosted proof:** managed role/ownership feasibility, real JWT propagation,
   pooler/TLS target provenance, proxy trust/captcha, production budgets, retention,
   restore and incident checks remain unverified. This batch authorizes none of them.

These are prerequisites for DURABLE/LIVE wiring, not reasons to discard the working
local configuration/driver/worker/protocol/kernel components. Approval needed next:
scope decision plus a separately reviewed additive migration and narrow store adapter;
then isolated real-DB worker/reconciliation/crash tests. Production and recruitment
are outside that decision. No schema draft or broad privilege workaround was added.

## Changed files and integrity

Modified in this batch: .env.example; operations/server/postgres.mjs;
operations/package.json; operations/tests/integration/driver-campaign.mjs;
operations/tests/integration/reliability-controller.mjs; operations/DRIVER.md;
operations/HOSTED-READINESS.md.

Added: operations/server/config.mjs, process-runtime.mjs, provider.mjs,
notification-worker.mjs, notification-content.mjs; operations/tests/config.test.mjs,
notification.test.mjs; operations/tests/support/fake-provider.mjs,
notification-store.mjs; this completion report. Ignored local campaign reports were
also generated. All prior files were preserved; final hash comparison is reported
in the completion response. No applied migration was altered.

Branch main; HEAD remains 3f33a5ac00a972db66c9064ed10c384a27ac8cd3. Nothing staged.
Pre-existing tracked diff remains .gitignore and two public JS files; none of those
three changed in this batch. Operations and .env.example were already untracked.
Git diff --stat omits that untracked implementation; use the explicit list above.
Public manifest, Pages workflow/config, existing contact behavior, dependency
lockfile and all four migrations retain baseline hashes.

Remote connections: 0. Hosted changes: 0. Public activation: 0. Live messages: 0.
Credential retrieval: 0. Recruitment/CV access: 0. Commits/pushes/deployments: 0.
