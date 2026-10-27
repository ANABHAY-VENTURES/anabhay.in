# Security remediation — local review package

## Verified evidence and limits

Migrations 001–004 remain unapproved for hosted use. On 2026-10-10 the original
isolated PostgreSQL 17.11 run passed grants, RLS, actor denial, audit, atomic
rollback, same/conflicting-key races, eight-call rate race (five allowed), and
notification lease assertions. No Supabase connection or remote SQL occurred.

Phase 1 reran bootstrap, all four unchanged migrations and verify.sql. The new
outbox-recovery.sql passed expired lease rejection/reclaim, stale-token denial,
acceptance transaction rollback, retry delay, retries through attempt ten and
expired tenth-lease cleanup. Its first run failed because one assertion combined
a volatile function call with a state subquery. The test now completes the call
before reading state. Migrations were not altered; the failed run stopped and
its logs were captured before identity-verified cleanup.

outbox-claim-fixture.sql queued two synthetic jobs. Two concurrent connections
ran outbox-claim-worker.sql, retaining row locks for three seconds. Both returned
distinct job IDs; the final database assertion confirmed two processing rows,
one attempt each, with leases. Both disposable containers were removed only
after checking full IDs and unique run labels. Test output is recorded in the
review conversation; no credential-bearing logs or database dump were saved.

The local Auth shim models roles/users and manually supplied session claims.
It does NOT prove managed Supabase role feasibility, real Auth/JWT propagation,
PostgREST schema exposure, provider acceptance or delivery. New Node tests for
provider/DB failure and lost commit acknowledgements use explicit mocks only.
The 2026-10-12 reliability campaign subsequently verified real local statement
timeouts, connection disposal, genuine COMMIT acknowledgement loss, same-key
recovery and uncertain shutdown. See operations/DRIVER.md and the preserved
reliability-e5123375-23bb-4af2-a6fb-b4aca45187ca.json report. Hosted behavior and
provider idempotency remain BLOCKED; the earlier mock-only limit is historical.

## Windows execution policy and safe local isolation

Windows AllSigned prevents the unsigned run.ps1 from executing. Do not invoke it,
change execution policy, use a bypass or create an ad hoc certificate. The passing
runs used individually reviewed commands entered directly in PowerShell.
The stored runner does not enforce the complete isolation requirements below;
its weaker checks are not approval to run it or trust an arbitrary container.

Before each run, inspect the cached image and ensure the exact name is unused:

```powershell
docker image inspect postgres:17 --format '{{.Id}} {{json .RepoDigests}}'
docker container ls --all --filter 'name=^/anabhay-ops-review$' --format '{{.ID}} {{.Names}}'
```

Verified image digest:
sha256:2d2b8998d31037bf721cfdf764d76ba74171b4fab3431b7f72c27c56ddbdf9e3

A separately reviewed creation command must use --pull=never, PostgreSQL 17,
network=none, NO published ports, NO host mounts and ONLY database storage in
--tmpfs /var/lib/postgresql/data:rw,nosuid,nodev,size=512m. Generate a strong
synthetic-only password in memory; never print Docker Config.Env, credentials
or full inspect output. Use synthetic=true and a fresh unique run GUID label.
Record the returned FULL container ID. Never pull an image without approval.

Inspect actual Docker configuration before EVERY SQL operation, not only flags:
full ID, unique run label, synthetic label, image ID/digest, NetworkMode=none,
Running=true, no mount/port entries, and exactly the required tmpfs entry.
The bind check must be null-safe:

```powershell
($null -ne $d.HostConfig.Binds -and @($d.HostConfig.Binds).Count -ne 0)
```

Null/empty Binds or PortBindings are acceptable; actual entries are not. Reject
unexpected Mounts, tmpfs entries or image identities. Check pg_isready and
postgres --version. No SQL runs unless every gate passes.

Apply files separately; stop on the first nonzero exit and capture sanitized
error/statement evidence without changing migrations or blindly replaying:

```powershell
Get-Content -Raw -LiteralPath $reviewedPath |
  docker exec -i $verifiedContainerId psql -X -U postgres -v ON_ERROR_STOP=1 -At
if ($LASTEXITCODE -ne 0) { throw 'Local SQL failed; stop and preserve evidence' }
```

Order: synthetic bootstrap, 001, 002, 003, 004, verify.sql (fixtures rolled back),
outbox-recovery.sql (requires empty outbox, fixtures rolled back), then the
concurrent-claim fixture and TWO concurrent worker connections. Assert two
unique returned IDs and exactly two processing rows with attempts=1 and leases.
Do not print claim JSON/lease tokens. Claim fixture persists ONLY in the
isolated container. The original race tests remain separately reviewed direct
commands; they were not rerun in Phase 1.

Before cleanup verify full ID AND unique run label AND synthetic label. Remove
only that exact ID, never a name-only target or unrelated volume/image. Failure
cleanup requires preserving diagnostics and the appropriate explicit decision.
No DROP/reset/recreate is an acceptable recovery for an unknown hosted state.

## Application changes and remaining abuse gates

Phone optional empty strings normalize to null. Accepted characters match SQL:
ASCII digits, plus, ordinary spaces, parentheses, periods and hyphens; 7–15
digits, maximum 40 characters. Invalid UTF-8/NUL and malformed inputs return 422.
The adapter consumes one rate attempt before reading/validating each enabled,
accepted-origin POST with trusted fingerprint. Oversize/wrong-content-type and
malformed requests are covered. Denied or unknown enforcement prevents reading
and persistence. OPTIONS, other methods, disallowed origins, disabled requests
and missing trusted identity are NOT counted by the database limiter.

Body streams are bounded to 16 KiB and a five-second TOTAL deadline, with stream
cancellation and safe 408 response. Content-Length cannot bypass streamed size
checks. Query-boundary waits default to five seconds and signal cancellation;
the wrapper alone is not proof that database execution stops on timeout. The
separate concrete driver has now been tested against local PostgreSQL; server
SQLSTATE/independent backend observations, not its AbortSignal, provide evidence.
Real runtime connection/header/aggregate limits, captcha, statement timeouts,
pool limits, verified network metadata and commit acknowledgements remain gates.
Never treat CORS or a browser allowlist as protection against non-browser abuse.

notification: 'queued' means initial atomic enqueueing only. A replay does not
report current state or delivery. A worker's provider receipt must be verified;
accepted means provider acceptance, not delivered. Provider idempotency keyed by
outbox ID and a lease-scoped content reader are required before worker activation.

## Approval gates before any hosted operation

1. Independently verify a NEW Operations staging project, never recruitment.
2. Approve a sanitized catalog baseline, exact migration hashes and prior/post
   manifests. Include all roles, transitive SET/INHERIT paths, explicit/effective
   ACLs (including column-only reads), default privileges, owners and event triggers.
3. Establish managed role creation/membership and ALTER OWNER feasibility. Local
   superuser success is insufficient. No BYPASSRLS/broad auth/service-role fallback.
4. Approve visibility, thresholds, staff bootstrap and later admin operations.
5. Approve real Auth/JWT tests with synthetic identities and session-bound RPC.
6. Review dedicated ingestion/notification logins, real driver cancellation and
   separate committed limiter/ingestion operations; lost acknowledgements retain
   the same idempotency key and never trigger a new-key automatic retry.
7. Review provider authentication/idempotency, content access and crash recovery.
8. Verify actual Pages publication uses only the reviewed exact-manifest artifact.
   The manual build workflow does not deploy; Jekyll exclusions are defense only.
9. Approve retention/privacy, backups and restore drill before activation.

Staff administration remains denied. Public submission remains disabled. No
local test outcome authorizes hosted migrations, cloud staging or publication.

## Completed local outbox verification — 2026-10-12

Fresh pinned containers reran bootstrap, unchanged migrations 001-004, verify.sql,
outbox-recovery.sql, outbox-claim-fixture.sql and two outbox-claim-worker.sql sessions.
Independent state verification found two processing rows, one attempt and valid
leases each. Distinct legacy IDs alone were not used as proof of overlap: the new
outbox-campaign.mjs held one uncommitted claim behind an explicit barrier while the
concrete driver committed the other claim. A third claim returned null. Disconnect
before claim COMMIT rolled back that claim and a replacement safely reclaimed it.

Twelve local assertion groups passed: legacy durable commits, deterministic
overlap, contention, crash recovery, stale-token denial, direct-table denial,
acceptance rollback, committed acceptance, measured retry delay (295-300 seconds
remaining), exhaustion at ten, expired exhausted cleanup and no duplicate rows
under replay. Acceptance is database state only; real provider delivery was BLOCKED.
All final counts remained two leads, two enquiries and two outbox rows. Independent
cleanup found zero test PIDs/names/locks/processes; four containers across two
outbox runs were removed by full ID and unique run label. Applications/migrations
were unchanged. One test assertion changed from <>2 to IS DISTINCT FROM 2 to reject
a missing attempt instead of silently passing NULL. The controller also refuses
remote Docker endpoints before creating resources.

Final outbox evidence: operations/local/outbox-8ce6dee7-4a3f-42fe-a563-03503c8f5bc9.json.
Hosted assessment: operations/HOSTED-READINESS.md. Release remains BLOCKED.
