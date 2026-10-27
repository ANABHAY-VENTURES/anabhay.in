# Operations foundation — LOCAL DRAFT, NOT APPROVED OR DEPLOYED

One future operations project; live recruitment is separate and untouched.
No database, login credential, API endpoint, provider or deployment is configured.
Public contact remains review-only. Migrations 001–007 remain unapproved hosted drafts. Local PostgreSQL evidence is dated in HOSTED-READINESS.md; no managed Supabase behavior is established.

## Capability model

| Capability | Reads | Writes / execution |
|---|---|---|
| anon / non-staff | No operations data | None |
| inactive staff | None through staff RLS | None |
| active member | Assigned leads in an active team they belong to, only when assignment-eligible; own assigned-visible notes | Own note, with database-derived Auth actor and atomic audit |
| active manager | Leads in active teams they belong to; visible lead histories and activities | Own note; same-team quarantine release with mandatory reason and immutable replay audit |
| active owner | All leads, histories and activities; own profile | Own note only |
| ops_ingestion_api | No direct table access | Ingestion and limiter functions only |
| ops_notification_api | No direct table access | Six bound claim/read/attempt/observation/finish/status functions only; legacy global functions revoked by 006 |
| service_role | No explicit operations grants | No operations capability; NEVER used by these adapters |
| migration administrator | Privileged administration | Requires separate human approval; not an application identity |

A service_role or administrator remains privileged at the platform level (RLS
bypass/ownership). Revoking grants is not a promise against a database owner,
superuser, inherited administrative role or pg_read_all_data membership. Inspect
ALL roles, memberships, default ACLs and effective privileges before approval.
No application role is LOGIN, BYPASSRLS, superuser, CREATEROLE or CREATEDB.
Future dedicated server LOGINs must be separately provisioned with only the
appropriate API capability and no administrative/helper memberships. Credentials
are not created now. No service-role JWT or role-selecting request is accepted.

## Draft migrations

005 adds immutable snapshots/attempts/observations and holds. 006 binds dedicated
worker LOGIN identities to explicit active team scope, fenced leases, fixed runtime
capabilities and manager release. 007 requires reason on new releases, preserves
historical NULL reasons and denies reasonless client calls. Registration, scope
grants, assignment, snapshot creation and worker disable remain unimplemented until
operator authority is approved; fixture administrator writes are not a workflow.

Release reasons trim the exact ECMAScript TrimString set (U+0009–000D, U+0020,
U+00A0, U+1680, U+2000–200A, U+2028–2029, U+202F, U+205F, U+3000, U+FEFF).
After trimming require 1–500 Unicode code points; reject NUL and unpaired surrogates
in JavaScript (PostgreSQL UTF-8 text cannot represent them). U+200B is not blank
under this explicit policy. Replay compares the normalized reason.

Driver shutdown resolves only after all pool.end promises fulfill. Rejection or
deadline produces cached shutdown-unconfirmed failure and attempts active-client
disposal; neither deadline nor disposal proves backend termination. Late close
settlement remains observed. Do not reuse an unconfirmed environment.


001 creates non-login capability/owner roles, administrator ownership-transfer
memberships, operations schema, ledger, staff/CRM tables and SELECT policies.
Explicit grants revoke PUBLIC/client/service_role defaults. RLS is enabled and
forced on application tables. Owner/manager/member remains a proposed model.
No client can update employees, teams, memberships, leads or assignment history.
The ledger is administrator-only; no application grant exists.

002 creates enquiry consent/idempotency, queue and audit tables. All application
access initially denied. RESTRICT foreign keys prevent cascading data loss.
Accepted state requires both provider ID and timestamp; processing requires lease
expiry and unpredictable lease token. Audit logs are not immutable to DB admins.

003 creates a SECURITY DEFINER ingestion function owned by ops_ingest_executor.
This deliberately replaces the old broad service_role INVOKER draft. The owner
is NOT table owner and is NOT BYPASSRLS; it has only selected INSERT columns,
receipt SELECT and matching RLS policies. It cannot classify/assign leads, update
staff, edit receipts or update notifications. Empty search_path, qualified tables,
no dynamic SQL. Temporary CREATE on operations permits ownership transfer only;
it is revoked within the same transaction. Functions are not owned by an admin.
Only ops_ingestion_api gets EXECUTE. Functions cannot take an actor/role/team.
Canonical hash is produced by the trusted validator, never accepted from the
public payload. The trusted capability holder could supply a dishonest hash;
this capability must never be given to public JWT roles.

004 creates durable limiter, own-note mutation with audit trigger, and leased
notification state operations. Definer owners have only their dedicated table/
column grants and RLS policies. Auth access is not granted to helper roles.
The staff note function is INVOKER; its actor comes from auth.uid(), and INSERT
RLS independently rejects spoofed actors, other kinds and invisible leads.
Only AFTER an authorized insert does the narrow audit trigger append an event;
failure rolls back both. Direct client note insertion has identical RLS/audit
constraints. Role/state/team/assignment/status administration is deliberately
NOT exposed: missing reviewed authorization must deny writes rather than fall
back to a privileged service client. Implement those as separate reviewed,
session-bound atomic operations only after business approval.

### Proposed visibility decisions — require owner approval

Members need active team membership and assignment eligibility. Unclassified,
unassigned and inactive-team leads are invisible to members. Managers see only
active member-team leads; owners may see inactive teams for remediation.
Members cannot see assignment history. Members see only their own activities
explicitly shared as assigned-visible, while the lead remains visible. Managers
and owners see all activities/history on visible leads. Team membership metadata
can still show an inactive team's name; it confers no lead access.
Reassignment does not disclose an earlier member's notes to the new member.
These conservative defaults are provisional; no production policy is changed.

## Durable limit and idempotency

consume_enquiry_limit uses row-locking UPSERTs, always global before identity.
Fixed minute window: provisional 120 global / 5 identity-bucket attempts per
minute. At most 4097 rows, each reused; counters saturate at 121. Hash collisions
reduce capacity, never increase it. This is a fixed-window limit (boundary bursts
are possible), not a sliding window. Global lock contention is a capacity tradeoff.
Clock regression cannot reset counters backwards. Thresholds require approval.
Server HMACs verified runtime network metadata with a separate secret; never trust
client headers, payload fingerprints or unverified forwarding chains. No raw IP
is stored. Bucket collisions/shared networks can deny legitimate users.

The trusted driver commits the rate function separately BEFORE ingestion, including
rejections; failures in ingestion do not erase rate accounting. Unknown/missing
limiter results or storage errors return 503; denied requests return 429. Enabled accepted-origin POST attempts with a trusted fingerprint consume capacity before body reading, including malformed/oversized bodies and replays. Disabled/disallowed-origin requests, OPTIONS/non-POST and missing trusted identity do not invoke the database limiter; edge connection/header/concurrency limits remain required. The ingestion capability is a
trusted server boundary, not a client authorization role: it can invoke ingestion
without the limiter if the server is compromised. Never expose it through public
Auth/PostgREST grants. Turnstile, verified hostname/action and runtime deadlines
remain additional activation requirements; CORS does not replace abuse protection.

Ingestion uses READ COMMITTED plus per-key advisory transaction lock and unique
key. Lead/enquiry/outbox commit together; no success before driver commit. Same
normalized payload/key returns one receipt (201 then 200), changed hash 409,
invalid 422, limited 429, enforcement/persistence failure 503. Driver implementation,
query timeouts, pool limits and bounded retries after serialization/ambiguous
commits still need runtime review. Retry the same key after ambiguous commit;
never create a new key automatically. No name/email deduplication.

## Notification integrity

Claim uses SKIP LOCKED and two-minute leases; attempts are bounded at ten.
Expired leases may be reclaimed; exhausted leases fail. Only the matching live
lease token can accept/retry; clients cannot set status. Retry uses fixed five
minutes. Provider receipt validation MUST be implemented by a trusted worker
adapter; confirmProviderAcceptance rejects unverified responses and uses a
committed accept operation. Database cannot independently prove an external
provider accepted a caller's string; compromised worker credentials remain a
trust boundary. Accepted means provider accepted, NOT delivered. No delivery
state/webhook is implemented. Provider idempotency keyed by outbox ID is required
to mitigate a crash between provider acceptance and DB acceptance. Exactly-once
email delivery is not promised. A lease-scoped content reader and real provider
integration are still unimplemented; do not broaden worker table grants to solve
that. Lease tokens stay in worker memory, never logs or reports.

## API contract and disabled public adapter

handleEnquiry is a local proposed Request/Response adapter, enabled=false by
default, not a listener. Exact HTTPS Origin allowlist, credential-free requests,
OPTIONS only for POST and Content-Type/Idempotency-Key, no wildcard origin.
Streams bodies with 16 KiB bound. Host must enforce read/DB timeouts and cap
connections. Runtime supplies trusted network identity; fingerprints are not
public request fields. Reject supplied actor/role/assignment fields via strict
payload validation. No credentials or callbacks come from request data. Never log request bodies,
passwords, credentials, lease tokens, raw SQL exceptions/failed-row details or
provider responses; return sanitized errors and log only approved event codes.

Public submitEnquiry still defaults endpoint=null. Cross-origin use requires
both an endpoint AND an exact reviewed allowedEndpoint string (no credentials,
query or fragment); no website code supplies either. HTTP 409/422/429/503 semantics
are unchanged. No activation configuration is added. API exposure of operations
for user-session note RPC/reads, exact endpoint, origin allowlist and credentials
must be separately approved; do not expose private schemas or grant ingestion to
anon/authenticated. verifiedUserClient must retain the same validated user's JWT;
getUser validation and DB auth.uid/RLS are distinct checks, never a service client.

## Local checks and isolated integration

Unit/static suite:
`node --test scripts/enquiry.test.mjs operations/tests/foundation.test.mjs operations/tests/remediation.test.mjs`
`node scripts/check-site.mjs`
`git diff --check`

Node tests cover validation, mock capabilities, HTTP contracts and artifact content.
They do NOT prove PostgreSQL SQL, RLS, durability, race behavior or hosted Auth.
The original integration assertions passed via reviewed direct commands. The unsigned run.ps1 was not invoked under Windows AllSigned. New recovery-test status is recorded in SECURITY-REMEDIATION.md. Bootstrap uses synthetic
auth/users/roles and deliberately hostile default grants; simulated JWT claims
exercise local RLS only, not real authenticated Supabase identity propagation.
Runner refuses non-isolated containers, starts no service and creates no container.
It tests migrations, effective privileges, staff scopes, actor denial, audit,
third-insert rollback, same/conflicting-key races, rate races and worker leases.
It preserves a failed container and never blindly retries migrations.
See SECURITY-REMEDIATION.md for commands and approval/recovery requirements.

## Pages boundary

scripts/pages-manifest.json lists every published file; builder copies individual
files only. Unexpected files/symlinks in public directories (including allowed
extensions) fail before output. The reviewed d.ts file is explicitly excluded.
Tests compare full artifact inventory to manifest. Existing output is refused.
Workflow is manual BUILD ONLY and cannot deploy. Jekyll exclusions are defense
in depth; actual live Pages source is NOT VERIFIED. Before pushing backend drafts,
confirm Pages publishes ONLY the reviewed artifact, not repository root. A public
GitHub repository also makes version-controlled drafts publicly readable through
GitHub regardless of Pages exclusions; drafts/fixtures contain no secrets or real
PII. Do not commit private fixtures. Manifest additions require human review.

## Recovery and approvals

No migration is safely repeatable by blindly replaying CREATE. Ledger guards each
exact prior version set; duplicate/unexpected objects cause rollback, no IF EXISTS,
CASCADE, silent repair or destructive reset. Each migration commits atomically;
the four together are not one transaction. Save independently reviewed catalog
baseline and SHA256 of each approved migration before application. Ledger alone
does not establish that file content matches: compare schema/ACLs and approved
hashes. Changed applied files require a new reviewed forward migration.

After interruption/ambiguous commit: stop writes; inspect ledger AND catalogs,
compare to approved pre/post manifests; decide committed/rolled-back/unknown. Only
resume next unapplied migration after human review. Preserve all data. Unknown or
partial state requires a new reviewed recovery plan, never DROP/recreate. Rollback
is a reviewed access shutdown/forward repair or restore from verified backup;
no destructive down migration is supplied. Local synthetic verify transaction
rolls back fixtures; race fixtures persist in dedicated container for inspection.

Approvals: role/grant/ownership feasibility in new project's managed PostgreSQL;
visibility and thresholds; isolated runtime start; verified baseline and SQL;
staff bootstrap/admin mutation design; provider sender/recipient/idempotency;
lease-scoped content access; captcha/runtime/driver; API exposure and CORS;
retention/backups/restore drill; actual Pages publication source. No remote work
or recruitment migration is approved by this local batch.

## Future extension points (design only)

Clients: organizations/authorized contacts and explicit conversion links.
Projects/tasks: client/project FKs and eligible staff assignments with independent
scope checks. Newsletter consent: separate purpose/version/timestamp, opt-out and
suppression; enquiry consent never implies marketing consent. Feedback: bounded,
abuse-protected, scoped submissions. No payroll, inventory, uploads, separate
module projects or complete dashboard. Retention/privacy and availability remain
launch gates, including free-tier quota/pausing risks and a real backup restore drill.

## Phase 1 local adapter changes

Body reads have a 16 KiB limit and a total five-second deadline (408). Invalid
UTF-8 and validation errors return 422. Empty optional phone values normalize to
null; phone characters match the database ASCII constraint. Capability calls have
five-second wait deadlines and receive an AbortSignal. This does NOT prove driver
or server cancellation, nor that a timed-out commit failed. A real driver must
cancel/dispose connections, enforce statement timeouts, and acknowledge only
committed results. Never automatically retry with a new idempotency key.

notification: 'queued' means initial atomic outbox enqueueing. Replays retain
that historical assertion, not current queue state, acceptance or delivery.
Mock recovery tests prove boundary handling only; external provider idempotency
and real driver ambiguous-commit recovery remain unverified.