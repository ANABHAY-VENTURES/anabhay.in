# Local enquiry transport

Start explicitly from the repository root:

```powershell
node operations/server/local-http.mjs --development-synthetic
```

Without that exact opt-in the command exits without listening. It binds only
127.0.0.1:8787; POST /enquiries accepts the existing JSON payload and Idempotency-Key.
For synthetic HTTP clients send Origin: https://local-enquiry.example.invalid.
That reserved name is an Origin comparison value, never a network destination.
Use only synthetic data. Stop with Ctrl+C. No environment files are read.

The CLI uses bounded, process-memory hash/receipt storage and a 20-attempt lifetime
budget; restarting clears both. Receipt persisted/queued fields exercise the
existing contract in simulation only: nothing is durably saved or delivered.
No submitted contact fields are retained in the fake. No request logging exists.

The transport accepts the capabilities/shutdown process interface returned by
createIngestionProcess. Its createProcess injection is for trusted local harnesses,
not HTTP configuration. The synthetic CLI never instantiates the PostgreSQL factory.
The separate local-postgres-http.mjs binding does instantiate it, accepting only
the synthetic target marker, loopback database host, synthetic ingestion LOGIN,
verified TLS configuration and the fixed development Origin. No hosted loader exists.

Socket remoteAddress is the trusted rate identity; forwarding headers are ignored.
The PostgreSQL binding supplies its validated RATE_LIMIT_HMAC_SECRET to the host;
restarting the host therefore keeps the same identity bucket. The synthetic CLI
continues to generate an ephemeral secret and uses its memory-only lifetime budget.
Exact loopback Host checking limits DNS rebinding. The existing HTTPS-only Origin
contract is preserved. All local clients share the loopback rate bucket. Header
size, connection count, body size, body time and overall response time are bounded.
Deadline response/disconnection does not prove a database operation was cancelled
or rolled back. A real injected driver retains responsibility for transaction and
shutdown deadlines; retries must keep the same key and payload after uncertainty.

This is a plain HTTP synthetic transport, not an activation path for contact.js:
the browser adapter still requires HTTPS and the public contact page still supplies
no endpoint. Browser-to-API testing with trusted local TLS is a later increment;
do not weaken the adapter's HTTPS check. No login, provider or deployment is added.

Tests: node --test operations/tests/local-http.test.mjs

## Authorized isolated HTTP-to-PostgreSQL campaign

```powershell
node operations/tests/integration/reliability-controller.mjs --approved-local-http
```

Requires the already-cached pinned PostgreSQL and Node images in the existing
controller. It never pulls images. It verifies a local Docker context, creates
unique run-labelled containers, checks actual configuration, and uses network=none,
no published ports or mounts, tmpfs database storage and a Node container sharing
only PostgreSQL's private network namespace. HTTP clients/listeners run there too.
Only explicitly listed source and existing dependencies are copied, without mounts.
Synthetic credentials and short-lived certificate private keys stay in containers.

The existing synthetic Auth shim and unchanged migrations 001-004 are applied in
order. Test-only observer fixtures force rollback/limiter outage; the existing TLS
proxy can skip the separately committed rate transaction and suppress the ingestion
COMMIT acknowledgement. Independent reads distinguish committed and uncommitted
outcomes. No notification worker/provider runs. Database containers are disposable:
no actual customer data or hosted targets are accepted. Exact IDs and run labels
are checked before cleanup; sanitized reports go under ignored operations/local.

Executed report: operations/local/http-postgres-f46e5194-bef9-4ce9-b2e7-45b16b208fe6.json.
PASS: 11 HTTP/database assertion groups, four TLS controls, bootstrap and 001-004;
129 Node regressions; site and whitespace checks. Both exact-ID containers removed,
zero protected source changes during execution and no remaining named backends or
test advisory locks. This is local PostgreSQL evidence, not managed Supabase proof.
Rejection-only binding unit tests were added afterward and are reported separately.

Limitations: process restart testing recreates the host/pool inside the same Node
process, not an OS/database restart. Concurrent retry responses are checked through
real HTTP but no barrier proves simultaneous SQL execution of those retries; the
pool test does independently observe four blocked sessions. The fault proxy tests
COMMIT acknowledgement loss; a timeout still does not prove server cancellation.
