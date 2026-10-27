# Coordination harness — executed locally, no hosted approval

On 2026-10-12 the primary probe and separate snapshot diagnostic passed in fresh
isolated PostgreSQL 17.11 using verified TLS. reliability-controller.mjs implements
independent cleanup, process watchdogs and exact-ID/label removal. Evidence is in
operations/local/reliability-*.json (ignored). Transaction observations retained
state=idle with live wait_event_type=Lock; clearing the snapshot and autocommit showed
state=active. This demonstrates a state snapshot effect, NOT the cause of the earlier
missed wait_event_type observation. The original short timing window remains a factor.

The previous in-memory harness used its lock holder as observer inside BEGIN.
Its driver lock timeout was 500 ms; polling had about one second plus query time.
PostgreSQL logged a lock timeout. Snapshot reuse versus missed timing remains
unproven. This package does not claim either hypothesis was experimentally confirmed.

The primary probe uses three separate pg Clients and no driver/migration changes.
It acquires the same bigint transaction advisory lock expression as ingestion:
pg_advisory_xact_lock(hashtextextended(UUID-string,0)). The blocked operation
reproduces that lock relationship only; it does not execute ingestion.

Holder acquisition acknowledgement is the dispatch barrier. The waiter promise
has immediate success/error handlers. Autocommit observer statements use a 250 ms
server timeout and 500 ms caller wait, stats_fetch_consistency=none, a two-second
observation budget and 20 ms polling. The waiter has a ten-second lock timeout.
PIDs must be distinct. Holder metadata must match the two unsigned 32-bit halves
of hashtextextended(run UUID,0), with objsubid=1 (bigint advisory key). Detection requires the exact holder in pg_blocking_pids,
an ungranted advisory lock with the same database/classid/objid/objsubid as the
holder, and Lock wait classification. A prematurely settled waiter fails.

Every bounded() call records its underlying promise, client, stage, actual
settlement, timeout flag and sanitized SQLSTATE. Caller deadlines never mean
cancellation. Connect, query, post-release wait, end and operation-drain promises
remain observed after a race timeout. Late settlement is recorded separately;
any caller deadline permanently fails that invocation, even after later cleanup.
Unsettled operations are reported unconfirmed and drained with a bounded wait.
No client is reused after failure. This does not force a stalled socket to close.

Rollback is in finally, including partial connection setup, observation failure,
assertion failure and blocked-query timeout. Its failure is separately recorded;
end is attempted even when rollback fails. All clients receive bounded end calls.
Cleanup timeout is FAIL/unconfirmed, never PASS. The first sanitized failure stage
and SQLSTATE are retained through cleanup and returned to the entry point; secondary
cleanup failures produce additional evidence without replacing the first failure.
The still-connected observer verifies holder/waiter/snapshot PIDs disappear before
it closes. Its own disappearance requires the future external controller to verify
all recorded PIDs absent and locks gone before container cleanup, including
deliberate observation-timeout/failure variants. A controller-level process
watchdog is also required if pg end calls cannot terminate within cleanup budgets.
Caller deadlines do not prove query cancellation. Container cleanup must still
verify full IDs and unique labels; no Docker lifecycle code is added here.

snapshot-diagnostic.mjs is a separate command adding a fourth connection. Import
does not start it. Before dispatch the independent autocommit observer must see
the exact waiter PID idle and not lock-waiting. The separate snapshot-mode
transaction records and verifies the same pre-dispatch baseline. Only after the
primary observer verifies the blocker and matching ungranted lock does it record
repeated observations while blocked, an observation after pg_stat_clear_snapshot,
and independent autocommit evidence. Each repeated transaction observation is
preceded by an independent check that the intended holder still blocks the waiter;
the final autocommit observation must still identify the waiter in a Lock wait.
Transaction results may be stale or fresh; neither result is assumed or asserted.
Primary coordination runs never enter the snapshot experiment.

## External controller acceptance checks — implemented separately

Before execution, record the unique run UUID, complete container IDs and labels,
backend PID/application-name map, and database OID. Reject unknown/missing PID
evidence; also search for every application_name starting with coord-<run UUID>-
to catch a connection that opened after its connect deadline but before PID capture.

After the probe exits, use a separate, approved local control connection outside
transactions with bounded statement/connection timeouts. Check ALL of:

1. No pg_stat_activity rows for the recorded holder, waiter, optional snapshot
   AND observer PIDs. A reused PID is not silently ignored; stop for inspection.
2. No pg_stat_activity rows with the run-specific application-name prefix.
3. No pg_locks advisory entries (granted OR ungranted) matching the recorded
   database OID, classid=(hashtextextended(run UUID,0)>>32)&4294967295,
   objid=hashtextextended(run UUID,0)&4294967295 and objsubid=1. Bind run UUID/PIDs
   as parameters; do not assemble SQL from diagnostics. Also reject advisory
   locks owned by any recorded test PID.
4. No unresolved-operation or cleanup-unconfirmed evidence. A nonzero probe exit
   remains FAIL even if controller checks later establish successful cleanup.

Enforce a 30-second monotonic wall-clock process watchdog from probe start,
covering connection setup, observation and cleanup. On watchdog expiry record
FAIL/unconfirmed; terminate only the probe process in the full-ID/label-verified
Node test container under separately approved controller logic. Terminating a
process is NOT proof of backend termination: repeat checks 1-3 through the local
control connection. Container lifecycle commands are not part of these modules.

Bound post-exit verification to five seconds, with short fresh observer statements.
If the process cannot be terminated, any required identity/lock check is unavailable,
or any backend/lock remains, refuse environment reuse and full-suite execution.
Preserve sanitized evidence; obtain a reviewed cleanup/recovery decision. Never
interpret a caller timeout, end() acknowledgement or absent partial PID list as
sufficient proof. Success/failure/timeout variants still require actual testing.

Output contains stage, elapsed time, PIDs, state/wait classifications, SQLSTATE
and settlement only. Known harness failures retain their explicit stage codes;
arbitrary backend error messages/stack traces/query text are never printed.

Prerequisites for future execution: separately approved fresh Docker isolation,
pinned images, TLS CA/server SAN verification, synthetic_observer test-only login
with catalog visibility, and credentials/CA in disposable /tmp storage only.
The CLI accepts an approval flag and UUIDv4, not an arbitrary host/URL. This flag
does not prove Docker isolation; the external reviewed controller must do that.
No migrations are needed for the independent lock probe. No fixture writes occur.

After approval, copy these modules into /review/operations/tests/integration in
the isolated Node container together with locked pg dependencies, then run:

```powershell
docker exec -w /review/operations <verified-full-node-ID> node tests/integration/coordination-probe.mjs --approved-isolated-run <verified-run-UUIDv4>
docker exec -w /review/operations <verified-full-node-ID> node tests/integration/snapshot-diagnostic.mjs --approved-isolated-run <verified-run-UUIDv4>
```

The authorized campaign executed the full local driver stages after coordination
passed, including real transport faults and same-key recovery. Probe success alone
still proves only coordination. Failure injection into every probe/controller
cleanup branch remains additional coverage, not implied by a successful campaign.
No hosted or public activation is approved.
