# PostgreSQL driver — local implementation, NOT ACTIVATED

## Execution-mode update — 2026-10-12

createIngestionDriver and createNotificationDriver instantiate only one capability
pool and expose only corresponding methods. createIngestionProcess and
createNotificationProcess validate scoped startup configuration before creating
pools; returned objects contain no credential configuration. The combined factory
remains for backward-compatible isolated campaigns, not process runtime wiring.
No automatic environment loader, listener, hosted credential or public activation
is configured. The typed public-key validator rejects legacy JWT keys; project
ownership/key provenance still requires independently approved staging evidence.

Local durable worker/content binding exists through migrations 005/006; 007 adds
reason-required manager release. Provider tests remain fake-only and Auth uses a
local shim. See NOTIFICATION-BINDING-RESULTS.md and HOSTED-READINESS.md for dated
executed evidence, not hosted readiness. Operator provisioning remains fail-closed.
Shutdown resolves only when every pool.end fulfills; close rejection or deadline
rejects a cached shutdown-unconfirmed failure. Disposal does not prove termination
and late close settlement cannot convert failure into success.

Historical sections below describe their own earlier revision and counts.

Node 22.23.2; pg 8.23.1 is pinned in the Operations-only lockfile. No listener,
credentials, notification worker, provider or new migration is configured.

`createPostgresDriver` returns named operations, never arbitrary SQL or a pool.
`postgresEnquiryCapabilities` adapts those methods to existing abuseCheck/persist.
Legacy queryCommitted injection remains for previous unit tests only; new runtime
wiring must use the concrete adapter. Ingestion and notification pools are separate.

Supply discrete host/expectedHost/database/user/password/ssl settings from a trusted
secret loader. TLS verification is mandatory. Never pass request configuration or
connection strings with SSL overrides. Credentials require dedicated LOGINs with
only their API capability; startup/checkout checks reject privileged memberships.
Managed grants, pooler behavior and TLS remain staging gates.

Limits: 4 ingestion / 2 notification connections by default (maximum 8 each), at
most twice max admitted operations, 1s acquisition, 3s statements, 1s locks, 5s
transaction operation, 5s idle transaction, 6s shutdown. Acquisition and transaction
budgets are separate; the future HTTP host must impose its aggregate budget.

Each call checks out one connection, begins READ COMMITTED, installs local timeouts,
verifies identity, executes fixed bound SQL, and awaits COMMIT command acknowledgement.
Rate calls commit independently, including false results. Successful connections are
released; every error/abort destroys the checked-out connection using pg's supported
release(true). Server timeouts constrain execution; socket disposal and AbortSignal
do NOT prove PostgreSQL cancellation. No CancelRequest/private pg API is used.
Pre-COMMIT failures discard the connection/transaction. After COMMIT is dispatched,
any error is conservatively unknown. No unknown result is returned as success.

Reconciliation is an explicit call with the SAME validated key/hash/payload. No key
is generated, no changed payload is silently retried, and no automatic retry occurs.
The existing SQL advisory lock and unique key resolve the previous transaction and
return replay/conflict. Browser reload key loss remains unresolved.

Node tests use mocked pools. They prove application ordering, timeout classification,
admission bounds and cleanup calls, NOT server rollback/cancellation/durability.
Run: `node --test operations/tests/driver.test.mjs` from repository root.

Real integration now has a reviewed isolated transport for Node-to-PostgreSQL.
The previous network=none/no-host-mount/no-published-port container cannot be reached
by host node-postgres. The campaign uses a pinned Node container sharing only the
verified PostgreSQL network namespace, copied source/dependencies, and no mounts
or published ports. Certificates/credentials exist only in disposable storage.
No image download is authorized by this document.

Required real-driver tests: saturate max connections with deterministic barriers;
assert acquisition deadlines and backend cleanup; pg_sleep statement timeout; held
advisory lock timeout; transaction rollback on third insert; committed limiter after
failed ingestion; commit acknowledgement fault injection; same-key replay after lost
acknowledgement; shutdown during query/commit. Observe pg_stat_activity/backend exit,
not only client exceptions. Hosted TLS, managed privileges and pooler cancellation
require additional synthetic staging evidence. Public submission remains disabled.

## Executed local campaign — 2026-10-12

All nine final stages passed; 58 Node tests passed. Real TLS included wrong-host,
untrusted-CA and expired-certificate rejection. Transport faults distinguished
COMMIT not forwarded from acknowledged PostgreSQL COMMIT whose response was withheld.
Concurrent same-key retries returned one durable receipt/outbox. Shutdown under
withheld acknowledgement was bounded and recovery remained possible.

Earlier runs exposed an unhandled checked-out pg Client error on socket disconnect.
The minimal correction observes client errors, marks the connection broken and
removes its listener after cleanup. SQL and idempotency behavior are unchanged.
A separate duplicate-shutdown harness defect was corrected. Earlier failure reports
remain FAIL in operations/local. No failed result was retroactively relabeled PASS.

This proves tested local behavior only. Managed privileges, hosted TLS/poolers,
real Auth/JWT, providers and exhaustive resource-failure combinations remain
unverified. No production or public activation is authorized.
