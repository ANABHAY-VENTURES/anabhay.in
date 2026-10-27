# Isolated reliability campaign

Entry: node operations/tests/integration/reliability-controller.mjs --approved-local-campaign

Local-only tooling requiring explicit campaign authorization. No Docker Desktop
start, image pull, unsigned PowerShell runner, policy bypass or remote DB connection.
Pinned images must already be cached. Two fresh uniquely labelled containers use
network=none on PostgreSQL, shared private namespace for Node, no ports/mounts and
tmpfs database. No .env is loaded. Only enumerated source and pinned installed
dependencies enter Node storage. Docker archive pipes transfer synthetic credentials
and public CA without host files. Private keys stay in their originating container.

The controller preserves source hashes and Git state outside containers, captures
sanitized evidence, checks actual isolation before stages and enforces a 30-second
stage watchdog. Independent local psql checks recorded PIDs, run-specific names,
driver sessions and advisory locks; process inspection checks no Node test remains.
Unknown identity or remaining resources stops execution. Exact-ID listings after
removal independently confirm removal; cached images are retained. Each UUID gets
its own ignored JSON/Markdown report, preserving all previous failure reports.

Coordination/snapshot run before unchanged bootstrap/migrations/verifiers, then
real driver success/rollback, limiter durability, saturation/recovery, timeouts,
transport faults, concurrent idempotent replay and uncertain shutdown. The Auth
shim is synthetic, not hosted Auth/JWT proof. Legacy run.ps1 is not invoked.
The separate outbox-claim fixture/worker scripts are not run by this driver campaign;
notification/provider validation is a separate scope. outbox-recovery.sql is run.

The loopback fault proxy terminates verified frontend TLS and verifies backend TLS.
Only frame headers and the fixed COMMIT marker control fault injection; credentials
and Bind payloads are not parsed or logged. Before-server-COMMIT control proves no
durable row. The after-server-COMMIT case suppresses its acknowledgement, independently
verifies persistence and disconnects. Shutdown uses the same established unknown
state. No mocked exception substitutes for these faults.

Final successful run: e5123375-23bb-4af2-a6fb-b4aca45187ca, 2026-10-12.
Prior runs 909235cf-0518-44af-af6a-3a1630ab4c55 and
85df28eb-b3a3-477b-8dc4-4a384686750d exposed unchecked Client error events.
Run d6a15e8e-192c-48f4-b3b9-a784250acca4 proved transport/recovery but failed harness
cleanup by repeating shutdown. All failed reports remain FAIL and resources were
removed. The final run includes only the minimal checked-out client-error correction
and test-harness fixes. Migrations and capabilities retained their protected hashes.

These local results neither approve hosted migration nor promise exactly-once
external delivery. Managed privileges/Auth, provider contracts, HTTP deployment
boundaries and exhaustive controller failure modes remain unverified.
