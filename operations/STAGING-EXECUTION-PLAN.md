# ANABHAY Operations — staging execution plan

Prepared 2026-10-12. Status: READY FOR OWNER REVIEW; HOSTED EXECUTION NOT AUTHORIZED.
This document is a plan, not a migration runner or permission to provision anything.
No staging project identity, host, provider or credentials have been established.
Public contact remains review-only; recruitment and all production systems remain
outside this campaign. Current migrations 001–007 remain unapproved hosted drafts.

## Current scope correction — 2026-10-13

The original evidence section below is historical. Current scope includes 005
persistence, 006 scoped worker binding and 007 reason-required manager release.
Approve exact current hashes; verify both release overload ACLs, immutable reason
audits and exact Unicode trimming/code-point boundaries. Provisioning remains
fail-closed pending OPERATOR-DECISIONS.md; no implicit owner/manager administration.
Test real Auth/JWT and pooler session_user, shutdown rejection/deadline and external
termination, inactive/cross-team denials and uncertain-commit reconciliation.
No hosted environment, public activation or live provider is authorized.

## 1. Historical evidence and what was inspected

Reviewed HOSTED-READINESS.md, NOTIFICATION-RECOVERY-DESIGN.md,
SECURITY-REMEDIATION.md, README.md, server/postgres.mjs, capabilities.mjs,
enquiry.mjs, http.mjs, migrations 001–004, review/preflight.sql and relevant Node,
driver and outbox integration tests. Paths in this plan are repository-relative.

Available local reports were read, not reexecuted:

| Evidence | Recorded outcome | Limits |
|---|---|---|
| local/reliability-e8351cea-135e-414d-bae4-066b2b897672.json | PASS; all recorded driver stages; 67 Node tests, zero failed/skipped; site/whitespace PASS; no protected file changes during run; two containers removed | Local PostgreSQL/TLS transport, not hosted Auth/pooler |
| local/outbox-7d0d4edb-48ae-4d1b-a39f-25901b3c2f62.json | PASS; 12 real outbox groups; 67 Node tests; four TLS controls; provider test BLOCKED; two containers removed | Provider acceptance/delivery not tested; fixture timestamps advanced for long delays |

Thirty current Operations server/migration/package/test files matched the final
driver report's saved SHA-256 baseline in this planning task. This verifies local
source correspondence, not independent reproduction or authenticity of runtime
results. Historical README/remediation claims must be interpreted by date; the
latest reports supersede older mock-only driver limits. Hosted evidence is absent.

Do NOT run integration/bootstrap.sql or integration/verify.sql against Supabase:
they create/use a local Auth shim, insert fake auth.users UUIDs and simulate claims.
Do NOT point reliability-controller.mjs at staging; it is a local Docker campaign.
Hosted tests need a separately reviewed runner with real Auth sessions and explicit
target gates. No such runner or new migration is created by this document.

## 2. Minimum staging architecture and trust boundaries

Use one NEW, owner-approved Operations staging Supabase project for Auth and the
operations schema. It is separate from Anabhay recruitment/production and from the
prior Option C test project. Do not reuse either without a new explicit decision.
Use one approved Node.js 22 runtime (separate API and worker processes may share
the host), pinned pg 8.23.1, verified TLS and separate database LOGINs. No framework
or additional module-specific project is necessary.

Stage S1: database catalogs, migrations and real staff Auth/RLS tests only.
Stage S2: operator-only synthetic API/driver/runtime tests; no public website link.
Stage S3: separately approved worker/content/recovery implementation and provider
sandbox, with allowlisted synthetic destinations only. S3 is presently BLOCKED.
Successful S1/S2 do not imply S3 readiness or authorize production/public activation.

Boundaries:

- Untrusted HTTP input enters an exact-origin API adapter. Runtime derives trusted
  network identity, enforces edge limits and captcha, then commits rate accounting
  before body validation and the atomic ingestion transaction.
- API process holds ONLY ingestion capability credentials. Staff requests carry
  the SAME verified user's JWT through a separate user client into PostgREST/RLS.
  Never use ingestion/worker/admin credentials for staff access.
- Worker process holds ONLY notification capability credentials and sandbox provider
  access. Human owner status never grants server capability credentials.
- Migration executor and fixture/metadata observer are operator-only, not application
  identities. Their sessions are absent during unauthorized client assertions.
- Secrets stay in approved host secret storage; public Pages has no backend runtime,
  SQL, private fixtures, credentials or staging endpoint. Egress is restricted to
  approved staging DB/Auth endpoints and, for S3 only, provider sandbox endpoints.

IMPORTANT assembly gap: createPostgresDriver currently requires BOTH pool configs.
Separate pools are not process-level secret separation. Before S2 deployment review
a capability-specific construction/runtime assembly so API need not possess worker
credentials (and worker need not possess ingestion credentials). Do not invent dummy
credentials, use admin fallback or assert this separation already exists. Likewise
no HTTP listener, secret loader, real proxy adapter or captcha integration exists.
Implementing these requires separate approval; this plan changes no behavior.

## 3. Configuration inventory — names and purposes only

Existing .env.example names are placeholders; postgres.mjs accepts an explicit
config object and does not load/validate these environment variables itself.

| Variable | Purpose / allowed visibility |
|---|---|
| OPERATIONS_PROJECT_REF | Independently approved staging reference; configuration is not proof of identity |
| SUPABASE_URL | Approved staging Auth/API origin; no production substitution |
| SUPABASE_PUBLISHABLE_KEY | Public client key for that same project; no admin/service-role replacement |
| OPERATIONS_INGESTION_DATABASE_URL | Dedicated ingestion LOGIN secret; API process only |
| OPERATIONS_NOTIFICATION_DATABASE_URL | Dedicated notification LOGIN secret; worker process only |
| RATE_LIMIT_HMAC_SECRET | Independent server secret for trusted network identity; never browser supplied |
| ENQUIRY_API_URL | Future private staging test endpoint; never wire to current public contact page |
| ALLOWED_ORIGINS | Exact approved HTTPS staging harness origins, no wildcard or production activation |
| TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY | Proposed captcha public identifier/server verifier; not integrated |
| EMAIL_API_KEY | Existing generic placeholder for future selected provider SANDBOX secret only |
| NOTIFICATION_FROM / NOTIFICATION_TO | Owner-approved sandbox sender/allowlisted test recipient, not submitter-controlled |

Proposed runtime config names NOT currently implemented: OPERATIONS_EXPECTED_DB_HOST,
OPERATIONS_DB_CA_SECRET_REF, OPERATIONS_INGESTION_POOL_MAX,
OPERATIONS_NOTIFICATION_POOL_MAX, OPERATIONS_ACQUISITION_MS,
OPERATIONS_STATEMENT_MS, OPERATIONS_LOCK_MS, OPERATIONS_OPERATION_MS,
OPERATIONS_SHUTDOWN_MS. These map to current driver constructor fields; approve the
loader/schema before use. Reject conflicting URL SSL options, host mismatch,
missing TLS verification, privileged usernames and unsafe numerical bounds.
Future provider environment namespace, worker budget and webhook signing secret
need reviewed names/loader after provider selection. No key values or connection
strings belong in this plan, command arguments, transcripts, CI output or Git.

Verify missing configuration fails closed before listening/claiming. Rotate each
secret independently; reject use of the wrong project's credentials without probing
production. Operator authenticates through supported secure workflows, not chat.

## 4. Ordered preflight and approval gates

All following remote actions are PROPOSED, NOT EXECUTED, and need explicit approval.

P0 — Local preparation: inventory/hash exact migrations and reviewed runner; assemble
expected object/role/ACL/policy manifests, synthetic fixture manifest and cleanup
list. Reruns of local tests require their normal isolation/permission checks.

P1 — Project verification: operator opens the approved organization's dashboard,
selects the NEW staging project and records exact name/reference/region/status.
Cross-check project reference against dashboard URL and API settings; record expected
DB/pooler host/port/tenant username and TLS host. A pooled DB name such as postgres
does not identify a project. Reject production/recruitment/old test reference,
ambiguous identity or mixed Auth/DB targets. No project reference is guessed here.

P2 — Read-only baseline, separately authorized: inspect version (draft requires
17+; select an approved major, initially 17), current executor, role attributes and
complete membership graph, schemas/owners, default ACLs (global and schema scoped),
effective table/column/sequence/function/schema access, policies, FORCE RLS,
constraints/indexes, dependencies, triggers/event triggers, API configuration.
Use review/preflight.sql as a starting inventory, not a complete acceptance verifier.
Extend the proposed read-only query package for column SELECT/REFERENCES, sequences,
PUBLIC ACL expansion, ownership, transitive INHERIT/SET/admin paths and dependencies.
Inspect ALL relevant ordinary/managed roles, not a six-role allowlist.

P3 — Independently approve baseline: signed/reviewed manifest of exact identities,
expected absent operations objects/ops_* roles, allowed managed roles, exact draft
hashes, every pre/post privilege and policy, migration executor authority and API
exposure. Newly observed values are evidence, never automatically approved. Stop
on unexpected objects, defaults, dependencies, privileged access or managed-role
constraints; require redesigned local SQL review rather than broadening privileges.

P4 — Approve provisioning and migration execution separately. Validate managed
postgres can create the required NOLOGIN roles, hold ownership-transfer memberships
and temporarily grant schema CREATE/ALTER OWNER with the final CREATE revoked.
Catalog evidence establishes prerequisites, not experimental feasibility. Any
capability test that mutates staging needs its own approved script/recovery plan.
Do not invent helper memberships, BYPASSRLS or grants on auth to make a test pass.

P5 — Apply reviewed 001, 002, 003, 004 individually with ON_ERROR_STOP, one operator
at a time, verified project and fresh precondition before EACH file. Capture only
sanitized stage/SQLSTATE and ledger/catalog evidence. Verify each acknowledged
COMMIT and approved post-manifest before advancing. Stop on first discrepancy.
Provision the two dedicated LOGINs only through separately approved setup, with
exact one-capability membership and no executor/admin inheritance or SET path.

P6 — Supported synthetic Auth provisioning and staff fixture setup need explicit
approval, secure login workflow and reliable initial count/target verification.
Do not directly insert managed auth.users or change global confirmation settings.
If confirmed test accounts need administrative provisioning, obtain separate
authorization for that supported operator method; never use admin keys in the app.

P7 — Run S1, then S2 suites with operator-approved commands, bounded requests and
recorded expected assertions. Only after all gates and future implementation review
may S3 provider sandbox tests run. Do not treat this plan as execution authorization.

## 5. Role and effective permission contract

| Identity | Permitted operations | Required denials |
|---|---|---|
| anon / PUBLIC | None on operations objects | All reads/writes/RPCs including note, ingest, limiter, queue |
| authenticated nonstaff / suspended / deactivated | Auth may exist; no staff rows/leads/notes/history | All staff mutations and server RPCs; existing valid JWT grants no staff access |
| active member | Own profile/memberships; visible team names; assigned eligible leads in an active member team; own assigned-visible activities | Other/unassigned/inactive-team leads; all history; earlier other's/manager activities; all protected writes |
| active manager | Own profile/memberships; leads in active member teams, their history and all activities | Other-team/inactive-team leads; all administrative/classification/assignment/status mutations |
| active owner | All leads and their history/activities, visible teams; own profile/memberships | Other staff profile enumeration and all administration/assignment/status mutations remain denied |
| all active staff | Own note on a visible lead, actor derived from auth.uid(); same RLS on direct permitted-column INSERT | Spoofed actor/kind/visibility, hidden lead, UPDATE/DELETE activity/audit |
| ingestion LOGIN -> ops_ingestion_api | ingest_enquiry + consume_enquiry_limit only | Direct table/column access, notes, worker RPCs, roles/teams/assignments/audit manipulation |
| notification LOGIN -> ops_notification_api | claim_notification + accept_notification + retry_notification only | Direct table access, ingestion/limiter/staff/admin RPCs; invalid or stale leases |
| executor NOLOGIN roles | Exact internal column grants/policies used by their own functions | No application login/membership/SET path, BYPASSRLS, table ownership or residual schema CREATE |
| service_role | No intended operations application grants/capabilities | Application use prohibited; verify effective access, not just explicit revocations |
| migration operator | Approved administration only | Must not be available to clients/runtimes or used to prove RLS denial |

FORCE RLS constrains ordinary owners but does NOT constrain superusers/BYPASSRLS.
Platform administrator access is a documented trust boundary, not proof of zero
privileges. Unexpected effective service_role/ordinary role access is NO-GO until
reviewed. No protected staff administration function exists; even owner is not an
application grant to change staff roles. Founder/Cofounder mapping to owner and
department/branch mapping to teams remain business decisions, not schema facts.

Post-setup catalog acceptance: exact reviewed role attributes/memberships (including
grantor/admin/INHERIT/SET), schema USAGE/CREATE, object owners, function signatures,
bodies/security mode/search_path/EXECUTE, default and explicit ACLs, RLS policies,
indexes/constraints/triggers/dependencies and ledger versions [1,2,3,4]. Verify no
PUBLIC EXECUTE survives via global defaults; schema-specific revokes alone cannot
subtract global grants. Check effective column-only access and all role paths.
Ops executors are non-table-owners, NOLOGIN/NOBYPASSRLS and no residual CREATE.
PostgREST exposure must not turn an API capability into public privilege.

record_lead_note is INVOKER; audit_note is a narrow DEFINER trigger. Ingest, rate
and queue functions have separate narrow DEFINER owners. Check qualified references,
empty search paths, no dynamic SQL, no RLS recursion and no ability to replace
dependencies. Do not assume a function's denied EXECUTE disables existing triggers.

## 6. Synthetic Auth/JWT and RLS suite

Propose nine NEW staging identities, each a unique run-prefixed reserved synthetic
address: owner; manager-A; manager-B; member-A; member-B; member-C; inactive-member;
ineligible-member; nonstaff. These are labels, not existing users or fixed Auth UUIDs.
Manager-A/A/B/ineligible belong to active team A; manager-B/C belong to active B;
inactive retains A membership. Owner needs no membership to see leads. Include an
inactive team fixture. Use supported confirmed Auth accounts and normal password
login; passwords supplied securely and tokens held only in memory.

Establish expected UUID independently from the operator-provisioned Auth manifest
and an Auth getUser response verified by the server; compare JWT-authenticated RPC
note actor/audit actor to that UUID. Do not rely solely on decoding an unverified
JWT or supplying claims/sub in SQL. No diagnostic identity RPC is assumed to exist.
Confirm PostgREST auth.uid propagation through actual operations writes and persisted
actors; use separately approved independent fixture observer for row assertions.

Fixture leads: A assigned to member-A, A assigned to B, A unassigned, B assigned to
C, inactive-team lead assigned to A, fully unclassified new enquiry lead. Add
member-A own assigned-visible note, member-B earlier note and manager-only note on
the first lead, plus assignment history. Save an explicit fixture ID/count manifest.

| Test | Objective expected assertion |
|---|---|
| Normal real Auth session | verified getUser UUID and created note/audit actors equal expected identity |
| Invalid/missing/expired/tampered JWT, wrong-project issuer/key/audience | Auth/session request denied; zero mutation; no fallback service client |
| Member-A lead and activity reads | Exactly A's assigned eligible active-team leads; only own assigned-visible notes; zero history |
| Member-B/C and crafted ID/filter/join requests | No A lead/content/notes/history exposure outside each valid scope |
| Manager-A vs manager-B | Exactly active leads/history/activities for their memberships; no other-team or inactive-team lead |
| Owner | All fixture leads/history/activities, including unclassified/inactive; still only own staff profile |
| Inactive/ineligible/nonstaff | Inactive/nonstaff zero staff data; ineligible member zero leads/history/activities; test suspended AND deactivated sequentially |
| Live staff suspension / team deactivation | Reuse existing unexpired JWT after approved fixture state change; next DB request denies affected access; no logout dependency |
| Reassignment/membership removal | Old member loses access; new member gains only permitted lead/own notes; earlier actor's notes not exposed |
| Actor/role/team/assignment/status spoofing | No role/state/eligibility/membership/lead/assignment/audit changes; spoofed note actor or manager-only visibility denied |
| Valid note vs invalid note | Valid own note and one matching audit row commit together; denial creates neither |
| RLS recursion and reused sessions | No 42P17 recursion; alternate A/B JWTs over runtime/pool requests without identity bleed |

Zero-row SELECT under RLS is an expected denial even if HTTP is 200. DML can also
affect zero rows: independently assert unchanged state, not a specific error alone.
Known forbidden fixture IDs make empty-result assertions meaningful. Record only
label, assertion, sanitized status/SQLSTATE, counts and PASS/FAIL/BLOCKED.

Review API schema settings in dashboard, not SQL alone: exact exposed schemas,
PostgREST search path/schema cache and anon/authenticated grants. Staff schema
operations exposure is a separate approved decision for current .schema('operations')
reads/RPC; never expose unrelated/private helper schemas or grant server functions
to public JWT roles. Missing exposure is BLOCKED, not authority to broaden settings.
No frontend dashboard is necessary to test real user-session API behavior.

## 7. Driver, pooler and transaction recovery suite

Approve direct/session/transaction pooler mode and tenant naming before choosing a
connection. Verify actual current_user and effective capability on EVERY checkout
as current driver does. No superuser/BYPASSRLS/CREATEROLE/CREATEDB, extra role member
or role-switch fallback is allowed. Verify idle disconnects and pooler reconnects.

Current defaults: ingestion max 4, notification max 2 (each 1–8); acquisition
1000 ms, statement 3000 ms, lock 1000 ms, operation 5000 ms, shutdown 6000 ms.
Admission at most max*2 pending operations per pool. Host-wide instances multiply
these limits: approve aggregate connections plus migration/observer reserve before
load tests. Server idle-in-transaction setting is 5000 ms. Log config names/budgets
only, not connection strings.

Test TLS trusted chain/expected hostname, wrong-host/untrusted/expired rejection
through controlled staging test endpoints. Never alter managed certificates or
disable verification. Confirm set_config LOCAL, READ COMMITTED, transaction-scoped
advisory locks, unnamed parameterized statements and health checks survive chosen
pooler mode; do not depend on session affinity or simulated auth claims there.

Required tests: committed ingestion -> exactly one lead/enquiry/outbox and 201;
same-key/same-normalized-payload replay -> same receipt and 200; conflict -> 409;
barrier-coordinated concurrent identical/conflicting requests -> one durable intent.
Third-insert failure -> no partial persistence; previously committed limiter survives.
Synthetic failure triggers need separate reviewed setup/cleanup before hosted use.

Saturate pool and prove bounded acquisition/admission; coordinate holder/waiter/
observer with unique names and autocommit observation. Lock timeout 55P03 and
statement timeout 57014 need independent backend evidence, connection disposal and
subsequent usable replacement. AbortSignal/timeouts alone are not cancellation proof.
Test checkout/re-checkout socket loss, error listener count/cleanup, COMMIT faults,
shutdown exact promise identity and cached failures. Any unconfirmed process/backend
termination fails cleanup and prevents environment reuse.

Lost COMMIT acknowledgement must be a genuine transport fault: a reviewed TLS fault
proxy withholds the server acknowledgement while an independent staging observer
sees committed rows BEFORE disconnect. A pre-COMMIT fault must independently show
no rows. Do not reuse local loopback proxy configuration as a hosted runner without
separate target/TLS/secret review. A mocked exception does not satisfy this test.
Unknown -> sanitized 503, no success/no automatic new key. Explicit retry revalidates
same normalized payload/hash/key and returns original receipt; exactly one enquiry
and outbox persist. Changed payload cannot silently reconcile. Maintain unknown
state if authoritative observation is unavailable; no blind reset/retry-as-new.

## 8. Migration interruption and recovery

Each file is atomic, all four are NOT one transaction. Ledger stores version/name/
timestamp, not migration hash. Bind exact approved hashes to an external reviewed
manifest and compare full pre/post catalogs; ledger alone is insufficient.

On staging only, separately authorize controlled interruption before commit and
after server commit/before client acknowledgement, for each migration boundary.
Use fresh isolated staging baselines approved for each scenario; no destructive reset
or additional project creation is implied. Disappear executor session/locks before
classifying state. Stop application writes and worker claims throughout.

| Observed authoritative state | Next action |
|---|---|
| Exact pre-manifest and prior ledger, no active executor | Rolled back; operator may approve replay of same unapplied file |
| Exact post-manifest and expected ledger/hash manifest | Committed; do not replay; operator approves next migration |
| Ledger/catalog mismatch, unexpected grants/dependency or observation unavailable | UNKNOWN/HOLD; preserve evidence; separately review forward repair/recovery |

No IF EXISTS, CASCADE, DROP/recreate, blanket retry or changed-applied-file repair.
Rollback means containment/access shutdown and reviewed forward repair or restore
to an approved separate target, not deletion of records/identities. Backups are
required before future meaningful data enters staging. Managed platform role DDL
limits require design review, never broad privileges to obtain a pass.

## 9. Proxy trust, HTTP and abuse tests

Future host must prove connection metadata/forwarding chain: reject forged
X-Forwarded-For, client fingerprint and conflicting forwarding headers; only trusted
proxy hops can influence identity. HMAC is server-side and never stores raw IP.
CORS is not caller authentication or non-browser abuse protection. Operator-only
staging exposure also requires an approved ingress control compatible with tests.

Enabled, accepted-origin POST with trustworthy fingerprint counts exactly one
committed attempt BEFORE reading/validation, including replay, malformed/oversized
body, wrong type and unsupported fields. Disabled/disallowed-origin/OPTIONS/non-POST
and missing identity do NOT count in DB; enforce edge limits for all those paths.
Current DB limiter is fixed minute: global 120, bucket 5, <=4097 rows, saturates
121; collisions/shared networks reduce availability. These thresholds need approval.

Execute synchronized eight-request same-bucket race within a single server window:
five allowed, three denied, independently verify counters and zero denied ingestion.
Global 121st attempt denies; rollover, boundary bursts, bucket collision, clock
regression and concurrency cannot increase configured capacity. Test limiter DB
outage/timeout/unknown acknowledgement -> 503/no body read/no ingestion, even if its
counter may have committed. Ingestion rollback must not erase separate accounting.

Host tests: headers/connections/concurrency/body-memory ceilings and five-second
total body deadline. Adapter byte bound is 16384; test below/equal/above streamed
limits, missing/lying Content-Length, slow/stalled/disconnected upload, malformed
UTF-8/NUL, lone surrogates, supplementary Unicode and SQL serialization expansion.
Unicode count/encoding differences are a compatibility gate, not assumed resolved.
Assert safe 408/422 and unchanged durable data; no raw backend errors or field logs.

Cross-origin contract: exact HTTPS origin; approved OPTIONS 204 only POST plus
Content-Type/Idempotency-Key; unsupported preflight 403, method 405; no credentials
or wildcard, Vary: Origin and Cache-Control: no-store. Preserve 201/200,409,422,429,503.
Captcha remains unimplemented: separately approve server verification of hostname,
action, expiry/replay and failure behavior; simulated success is not hosted evidence.
Public contact endpoint remains null even during synthetic staging endpoint testing.

## 10. Worker/provider acceptance campaign — S3 BLOCKED

Prerequisites requiring separate implementation review: capability-specific runtime,
lease-scoped content reader, immutable destination/template/content digest, explicit
unknown/quarantine and provider reconciliation ledger/status capability, provider
adapter, bounded worker loop and verified delivery-event handling. Review new forward
migrations separately; do not change 001–004 in place or broaden worker reads.

Content tests: exact job/live token joins its own enquiry internally; wrong job,
supplied enquiry/team/actor, expired/reclaimed token and all public/staff/ingestion
requests fail; approved projection only; no unrelated staff/history/content. Review
global system worker versus team-restricted workers: existing global claim is NOT
team-restricted. Tenant/team mapping cannot come from request data. Inactive-team
notification treatment requires business approval, not reuse of human RLS blindly.

DB lease tests: independently acknowledged claim; overlapping two-worker barrier,
single-job contention, no duplicate live claims, crash-before-claim-COMMIT rollback,
expiry/reclaim with new token, stale accept/retry rejection, accepted jobs not
reclaimed, retry schedule five minutes and maximum ten attempts including expired
tenth lease. At least one real wall-clock expiry/backoff test in staging; artificial
fixture time advancement is labeled separately. Verify bulk expired-job cleanup
does not create unbounded lock waits under target load.

Proposed worker budget <=60 seconds and >=30 seconds lease margin needs server
lease expiry/time returned by future content capability. Claim currently returns
neither. Renewal exists only if separately reviewed: same live token, fixed total
lifetime cap, no revival or caller-selected expiry. Not required merely to pass tests.

Use approved sandbox sender/recipient only, one immutable key per environment/outbox
UUID across attempts/leases. Provider must document deduplication retention and
lookup consistency covering the approved retry+incident horizon. Provider choice,
guarantees, limits and sandbox differences are NOT SPECIFIED. No provider delivery
guarantee is inferred from database accepted state or a sandbox fake.

| Injected scenario | Required independent acceptance evidence |
|---|---|
| Valid acceptance / definite rejection | Verified bounded receipt versus definite no-acceptance; only valid live token can acknowledge |
| Timeout/disconnect before or after provider acceptance | Establish provider-side outcome by same-key lookup; never interpret timeout as rejection |
| Lost response after acceptance | Same immutable key/lookup reconciles one accepted effect; no replacement key |
| Provider acceptance then DB failure/lost ACK | Independently inspect provider and DB; recover accepted/processing under valid/new lease; no blind resend |
| Worker crash before send, during send, after provider accept, after DB accept | Durable intent preserved; reconcile same key before any resumed send; accepted rows not resent |
| Concurrent same-key / changed-payload duplicate | Provider's documented deduplication/mismatch behavior actually verified; payload remains frozen |
| 429/Retry-After, 5xx, oversized/malformed success | Bounded handling; no invented receipt or definite-failure classification; reviewed scheduling if five-minute SQL backoff insufficient |
| Expired provider retention / delayed lookup / unknown exhausted job | Quarantine and alert, stop automatic resends when acceptance cannot be established |
| Forged/expired/replayed webhook | Signature/time/replay validation denies; valid verified event mapped to one intent; delivery separate from acceptance |

Queued means historical enqueue. Accepted means verified provider acceptance only.
Failed exhaustion does not prove external nonacceptance. Unknown remains unresolved.
No exactly-once external delivery promise. Existing frontend accepts legacy sent:
review/deprecate that wording before activation; never claim queued/sent proves
delivery. No public status lookup by arbitrary enquiry UUID is authorized.

## 11. Audit, logs, monitoring, shutdown and recovery operations

Audit assertions: valid note and one actor-bound activity event atomic; wrong actor/
invisible lead creates neither; induced audit insert failure rolls back note.
All clients cannot insert/update/delete audit rows or disable/replace trigger; admin
tampering is a platform trust boundary. Broader administrative audit is not built.

Allowlisted logs: run/test label, sanitized stage/SQLSTATE, counts, latency, outcome
category. Never request/SQL payloads, credentials, tokens, leases, raw failed rows,
provider responses, personal fields or raw IP. Use synthetic canary data to check
host access/error logs, tracing, crash dumps and provider logs without storing
secret canaries in reports. Metrics: queue age/depth, attempts, expiry/exhaustion,
unknown COMMIT/provider outcomes, pool wait/timeout/error, rate denial and audit
failure. Approve numerical thresholds, alert destinations, retention and ownership.
Require a deliberately induced sanitized alert to reach the approved operator.

Shutdown tests stop admission/claims, concurrently call cached shutdown, drain within
budgets, force host process termination where approved, independently verify backend
and outstanding-operation disappearance. Promise settlement is not termination.
After unconfirmed cleanup/failure refuse reuse, preserve safe diagnostics and
reconcile unknown commits/provider outcomes. Never release a lease while a send
may still be running. No unhandled errors or leaked replacement connections.

Approve RPO/RTO and restore target BEFORE drills. Restore synthetic DB data/schema
to an approved isolated environment without enabling sends; verify enquiry/outbox/
ledger/audit relationships, grants/RLS and receipts. Supabase Auth/settings/secrets
are not assumed included in a PostgreSQL backup. Map supported Auth restore procedure
and identity preservation separately. Verify provider idempotency survives replay
after restore and accepted intents are not resent. No production backup or CV access.

Incident procedure: disable staging ingress and claims, contain/rotate affected
capability, preserve sanitized evidence, authoritative ledger/catalog/key/provider
reconciliation, owner-approved forward recovery, reverify denials then resume.
No blind queue reset, retry attempt reset, identity deletion or whole-project deletion.
Cleanup lists exact synthetic IDs/resources after provisioning, reviews dependencies,
confirms no unrelated records and needs approval; RESTRICT may require ordered cleanup.
If interrupted or ambiguous, leave quarantined and report instead of blind deletion.

## 12. Objective go/no-go and remaining approvals

S1/S2 GO requires ALL: independently approved project/manifest; exact migration
hashes and pre/post catalogs; managed least-privilege ownership feasible; every
positive/negative Auth/RLS/grant test PASS; session-derived actors and stale-session
denials; pooler/TLS/deadline/real unknown-COMMIT tests PASS; limiter and host abuse
tests PASS; no unconfirmed backend/process/fixture cleanup; log/alert/restore/incident
checks PASS; exact 26-file public artifact excludes Operations/secrets and public
endpoint remains absent. Any FAIL or required BLOCKED test is NO-GO for that stage.
Staging readiness is not production/public publication approval.

S3 GO additionally requires separately approved implementation/migrations, provider
contract and sandbox results, least-privilege content boundary, immutable payload,
unknown/reconciliation recovery, exhaustion handling and verified shutdown/delivery
events. S3 is NO-GO today because these components do not exist. No code is silently
added to remove a BLOCKED result. Production needs a new acceptance/approval package.

Explicit owner approvals still required, in order:

1. New staging project name/reference/region/budget; host and network/egress model;
   read-only baseline access and exact migration/setup/cleanup scripts.
2. Managed role/ownership manifest, dedicated LOGIN provisioning, API schema exposure
   and approved migration hashes/preconditions/recovery. No service-role fallback.
3. Role mapping, owner/manager/member visibility, inactive team metadata/notification
   scope, assignment eligibility/history/notes, staff bootstrap and future admin work.
4. Nine synthetic Auth identities, confirmation method, secure credential workflow
   and fixture mutations (including suspension/reassignment); no production reuse.
5. Capability-specific runtime/secret loader, JWT verifier, private test ingress,
   pooler mode/limits, proxy trust, aggregate budgets, rate thresholds and captcha.
6. Worker/content/immutable snapshot/quarantine/reconciliation/delivery design and
   forward migrations; global versus team worker; processing/lease/retry budgets.
7. Provider sandbox selection, sender/recipient, idempotency retention/lookup contract,
   webhook security, fault-injection actions and limited synthetic message costs.
8. PII projection/purpose, retention/deletion/backup schedules, RPO/RTO/restore target,
   log/metric thresholds, alert owner and incident recovery responsibilities.
9. Hosted execution per stage and separately authorized cleanup; later public API
   wording/legacy sent contract review, actual Pages source verification and separate
   production/public activation decision. Existing workflow is build-only, not proof
   of actual live publication source; no workflow/configuration is changed here.

Evidence format per test: ID, approved target reference, reviewed source hash,
identity label/capability, expected assertion, actual counts/status/SQLSTATE,
PASS/FAIL/BLOCKED, independent evidence method, cleanup state and reviewer. Keep
sanitized manifests outside the public artifact; never save sessions/secrets. A
baseline observed during execution is not retroactive authorization.

Only this planning document is prepared now. No remote connection, hosted resource,
SQL/test campaign, credential retrieval, provider integration, public activation,
staging, commit, push or deployment is performed or authorized by its creation.
