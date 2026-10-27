# Hosted readiness — BLOCKED, 2026-10-12

## Release-blocker remediation evidence — 2026-10-13

Shutdown now resolves only after every pool.end fulfills. Rejection/deadline yields
cached `shutdown-unconfirmed` failure; late closure remains observed and disposal
does not assert termination. Real driver campaign independently verified backend
disappearance after the expected deadline failure and same-key committed recovery.
Release reasons now use the identical explicit ECMAScript whitespace set and
1–500 Unicode code-point limit in JavaScript and SQL; NULL, every whitespace-only
code point, mixed Unicode boundaries, 500/501 supplementary-character limits,
manager authorization and immutable replay audits were tested locally.

Executed reports (all PASS; zero protected changes during each run; two verified
container removals per run):
- `local/reliability-6218f550-1f6e-4e29-af74-6bba08529f89.json`
- `local/persistence-665c37d5-760d-4980-85dc-674809a0b779.json`
- `local/release-reason-c9f76c99-987e-4509-b9ce-b003fa40cf6d.json`

Each regression stage discovered 121 Node tests: all passed, zero failed/skipped.
The initial driver run `local/reliability-40b1bcc0-bd4e-406e-a3f5-4fbbd4885e0c.json`
stopped because its old shutdown test expected timeout success; the assertion was
corrected to require failure plus independent termination evidence. Its containers
were also removed. No failed run is counted as passing evidence. Local Auth shim
and fake providers remain distinct from hosted Auth/JWT and real provider behavior.
Operator decisions, separate staging identity/authorization, managed privileges,
pooler identity, backups, proxy trust and live provider gates remain unresolved.

## Local release-reason evidence — 2026-10-13

Draft 007 adds mandatory reasons for new manager quarantine releases, preserving
historical audit rows and existing immutable triggers. The new client contract
requires reason; the old reasonless authenticated entry point is revoked. Replay
compares normalized reason as well as actor/job/request. No provisioning authority
was added. See OPERATOR-DECISIONS.md for proposed defaults awaiting owner approval.

Executed disposable PostgreSQL report:
`operations/local/release-reason-7922e5f9-945a-41fc-a5ee-14ebeb1394ec.json` — PASS.
Bootstrap and migrations 001–007 executed locally. Focused SQL assertions verified
NULL/blank reason denial, reasonless API denial, member denial, authorized manager
release, exact replay, conflicting-reason rejection, one audit row, hold removal,
immutable UPDATE/DELETE and duplicate-key rejection. Auth identity used the local
shim, not hosted JWT. Both exact-ID/run-labeled containers were removed. Full Node
suite: 115 passed, zero failed; site checker and whitespace checks passed. No
provider delivery or hosted checks ran. The first attempt was blocked by a stopped
Docker engine before resource creation; it is not counted as SQL evidence.

Registration, team grants, snapshot provisioning and database worker disable remain
fail-closed pending an approved operator authorization/audit model. Draft 007 needs
owner approval and managed privilege/Auth verification before hosted application.
Historical sections below describe earlier source revisions; current local binding
evidence is in NOTIFICATION-BINDING-RESULTS.md, not a hosted readiness assertion.

## Historical execution-mode local implementation update (superseded by 006/007)

Process-specific startup validation and one-capability driver factories are now
implemented. A provider-independent worker engine, local content authorization
kernel, reconciliation protocol and deterministic fake provider are tested locally.
They are not an activated durable PostgreSQL worker: no narrow content/worker-team/
attempt/quarantine database binding or live provider exists. Existing migrations
and public behavior remain unchanged. See EXECUTION-COMPLETION.md for the latest
executed tests; historical evidence below remains tied to its saved source hashes.

Local reliability and database outbox behavior pass. Hosted rollout and actual
notification delivery are not approved or established. No remote service was used.

## Evidence and integrity

Branch main, HEAD 3f33a5ac00a972db66c9064ed10c384a27ac8cd3. Pre-existing modified
and untracked work preserved. Current driver/migrations/capabilities and package
lockfile are recorded in the local campaign baselines. Driver hardening changes
are separately tested below; older reports describe their own source revisions.
SECURITY-REMEDIATION.md retains historical local evidence.
The manual Pages review workflow remains artifact-only and runs its website
selection. The local integration controller now discovers all Operations *.test.mjs
files and fails if required lifecycle/persistence/release suites are absent.

Prior reliability evidence: operations/local/reliability-e5123375-23bb-4af2-a6fb-b4aca45187ca.json.
Final hardening reliability evidence: operations/local/reliability-e8351cea-135e-414d-bae4-066b2b897672.json.
Final outbox evidence: operations/local/outbox-7d0d4edb-48ae-4d1b-a39f-25901b3c2f62.json.
Protected baseline: operations/local/hardening-protected-baseline.json. Reports are
ignored, contain sanitized metadata and survive container cleanup.

## Driver review

postgres.mjs transaction(): commitSent is set before client.query('COMMIT'). All
subsequent failures are conservatively unknown. dispose() uses release(true),
removes the active client and never returns an uncertain connection as usable.
Server-side deadlines plus prior real PostgreSQL evidence establish tested timeout
behavior. Caller timers/socket close/client.end alone prove no server cancellation.
reconcileEnquiry revalidates key/hash/payload and never generates a key. Concurrent
same-key recovery retained one receipt/outbox in the real transport-fault campaign.
Shutdown rejects new work and retains one exact promise for concurrent/subsequent
callers. Failure is sanitized and cached without retrying pool.end. Its deadline
requests forced disposal; settlement alone does not prove backend/socket termination.

One error listener is installed per physical connection on pool connect, before
pg-pool removes its idle listener at checkout. It stays through release/destruction
until end; broken state is never reset. Pool idle handling is untouched. Deterministic
mock event injection covers checkout, re-checkout, query, COMMIT, release and
destruction. Real TLS socket destruction covers checkout and re-checkout, verifies
replacement and listener cleanup; the transport proxy covers actual COMMIT loss.
Mock release/destruction events are not evidence of actual socket failure at those
exact phases. No exhaustive scheduler/race guarantee is claimed.

The real uncertain-COMMIT shutdown stage asserts exact promise identity concurrently
and after settlement, denies new work, independently verifies committed server state
and performs same-key recovery. Mock tests cover rejected pool.end and a pool.end
that never settles. External cleanup independently checks backend/process absence.

Other limits remain: no aggregate HTTP host budget, no production secret loader,
no provider runtime. Validate/read receipts defensively at the future adapter; do
not reinterpret unknown commits as failure or retry with a new browser key.

## New real outbox results

- PASS: original claim fixture and TWO original worker scripts executed, with
  independent verification of two processing rows, attempts=1, live lease fields.
- PASS: explicit holder transaction acquired a reclaim; a distinct concrete-driver
  claim completed while holder remained idle-in-transaction and its attempt update
  was invisible. A third claim returned null. This proves overlap and lock exclusion.
- PASS: closing the holder before COMMIT removed its backend and rolled back the
  attempt increment. Reclaim issued a new token; original and rolled-back tokens
  could not accept/retry. Expected denial SQLSTATE P0001 verified directly.
- PASS: notification LOGIN direct SELECT and UPDATE denied with 42501.
- PASS: acceptance followed by ROLLBACK retained processing; valid-token acceptance
  committed accepted state; accepted jobs could not retry.
- PASS: measured five-minute backoff, no immediate reclaim; attempts stopped at ten;
  expired tenth lease failed without another attempt. Fixture timestamps were
  advanced by the isolated administrator; no actual five-minute wall-clock wait.
- PASS: repeated fixture idempotency identities produced no additional intents.
  Final counts: two leads, two enquiries, two outbox rows.
- BLOCKED: external acceptance/delivery, provider idempotency and crash after external
  acceptance. No worker loop, provider adapter or lease-scoped content reader exists.

## Hosted checklist

All rows below are BLOCKED pending separately authorized staging; local evidence is
not substituted for hosted execution.

| Item / why | Available evidence | Unverified / smallest safe next validation |
|---|---|---|
| Managed role/ownership feasibility: avoid privilege escalation | Local NOLOGIN narrow owners, fixed SQL, empty search paths | Approve new Operations staging project and catalog baseline; verify role membership/ALTER OWNER feasibility, all transitive SET/INHERIT paths, default/effective table/column/function ACLs |
| RLS/service-role boundaries: prevent direct access | Local FORCE RLS and effective-denial verifier; new notification direct denial | Test actual anon/authenticated/service_role and server LOGIN access; reject inherited administrative/broad read privileges; never weaken to force a pass |
| Auth/JWT and staff/branch scope: bind actor to session | Synthetic Auth shim and RLS scope tests | Real synthetic Auth sessions through intended API; own-note actor, inactive/nonstaff, cross-team and assignment denials. Branches are not a separate entity in current schema; approve business mapping first |
| Hosted pooler/TLS: preserve session/transaction assumptions | Direct local pg/TLS/timeout/commit fault tests | Test actual dedicated credentials, certificate chain, pooler mode, connection budgets, local timeout settings, lock waits and cancellation/disposal |
| Migrations/recovery: prevent unknown-state replay/data loss | Atomic per-file ledger gates; local migration/rollback tests | Approve migration hashes and pre/post catalogs; simulate interruption and reconcile ledger/catalogs; no blanket rerun/drop/reset; review access shutdown/forward repair plan |
| Proxy-aware rate limits: trustworthy identity and concurrency | Local bounded UPSERT counters; HMAC adapter; fail-closed tests | Verify host connection metadata/forwarding chain, captcha, header/body/connection/concurrency budgets and fail-closed outage behavior |
| Secrets: prevent browser/artifact leakage | Blank example, ignored local secrets, exact public manifest | Provision dedicated host secrets and rotation; test wrong destination/credential rejection; no service-role fallback; audit CI/repository visibility |
| Audit and monitoring: detect faults without PII | Atomic note audit; sanitized local test events | Approve production log allowlist, unknown-commit counters, queue age/attempt alerts, retention and access; verify real host redaction and alert routing |
| Provider worker: avoid duplicate external effects | Database leases, retry/exhaustion and outbox uniqueness | Review lease-scoped content reader, immutable payload/version and bounded worker; choose provider with outbox-ID idempotency/lookup covering retry horizon; no exactly-once promise |
| External crash recovery: reconcile rather than resend blindly | Database acceptance rollback and stale-token tests | Inject lost send response and provider-accepted/DB-ack-loss with real provider sandbox; reconcile safely after lease change/exhaustion |
| Backup/restore: recovery without lost records | RESTRICT FKs and no destructive down migration | Approve retention/RPO/RTO; restore synthetic backup into separate environment and verify enquiries, outbox, audit and identities |
| Shutdown/incidents: contain uncertainty | Local bounded shutdown and recovery | Test actual host termination, repeated shutdown, pool handoff failures, concurrency limits and incident reconciliation/runbook |
| Publication boundary: keep backend/secrets off public site | Exact 26-file artifact and regression tests | Independently verify actual Pages source uses only reviewed artifact; public repository visibility exposes committed source regardless of Pages exclusions |

## Security/public artifact

PASS source/test: contact has no native submission mechanism and calls submitEnquiry
without endpoint; endpoint=null rejects before fetch. Server enabled=false remains
default. No activation or Pages changes were made. Manifest/root rules exclude
operations, migrations, fixtures, .env examples and private paths; symlink/unexpected
file tests pass. No credential/CV/candidate record was observed in reviewed public
source. Manifest control is not a secret-content scanner or a guarantee against
a deliberately approved future secret-bearing public file. Current adapter still
accepts legacy notification='sent'; the proposed API emits queued only. Review its
future wording/contract before activation so accepted/queued cannot imply delivery.

Controller/proxy paths use pinned local images, local Docker endpoint gate, private
loopback, fixed approved ports and TLS verification; no image pull/remote endpoint
or .env loading. Application configuration remains a trusted-host boundary; neither
an approval flag nor a name equality proves hosted project identity independently.

## Commands and counts

Executed: node --check for driver/harness/controller; controller
--approved-local-campaign and --approved-local-outbox (fresh UUIDs/resources); fixed Docker inspect,
create/start/copy/exec/psql/cleanup operations; bootstrap, migrations 001-004,
verify.sql, corrected outbox-recovery.sql, claim fixture and two original workers;
12 new real outbox assertion groups; four real TLS controls; full Node regression,
site checker and git diff --check. No unsigned PowerShell script ran.

Full regression: 67 Node tests PASS, 0 failed/skipped (21 driver mock tests).
Outbox: 12 real assertion groups PASS, one provider test BLOCKED; four TLS controls
PASS; ten SQL file invocations including two worker sessions. Driver campaign:
real checkout/re-checkout socket destruction, success/rollback/rate persistence,
pool bounds, server timeout SQLSTATEs, genuine pre/post-COMMIT transport faults,
concurrent same-key recovery and reentrant uncertain shutdown PASS. Do not add
overlapping setup/assertions/mocked counts into one aggregate.

Initial unprivileged Node run: 65/66 passed, symlink fixture failed with Windows
EPERM; complete authorized controller regressions passed without changing tests.
The new lifecycle fixture first incorrectly destroyed every replacement connection,
then asserted end cleanup too early. Failed reports retained, resources removed;
one-shot fault injection and bounded asynchronous end observation corrected the
harness. Controller now stops on a failed stage. No driver/migration relaxation.
The 4e002f35 report records a concurrent addition to the local mock test file;
it ran all 67 tests but is not evidence of an unchanged whole-tree baseline.
Its copied application/SQL sources were unchanged during execution.
Final e8351cea campaign: 67/67 Node tests, all driver stages PASS; zero protected
file changes during execution. Final outbox campaign likewise records zero changes.
All six campaigns in this hardening batch removed their twelve created containers
by full ID after matching unique run labels; cached images and unrelated resources
were preserved. Failed harness-run reports remain available for review.

Provider recovery design: NOTIFICATION-RECOVERY-DESIGN.md. Content reader, immutable
provider payload, status reconciliation/quarantine, provider adapter, delivery
events and worker loop remain future work requiring separate review and approval.

## Priorities

1. Review the implemented driver hardening and new lifecycle/shutdown evidence.
2. Approve worker/content-reader/provider recovery architecture before implementation.
3. Approve a dedicated Operations staging baseline and synthetic Auth/privilege tests.
4. Verify hosted runtime/proxy/secrets/provider/restore boundaries.
5. Independently approve publication only after all critical gates pass. Keep public
   submission disabled and recruitment untouched throughout.
