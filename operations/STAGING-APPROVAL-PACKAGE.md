# Scoped staging approval request — 2026-10-13

**READY FOR OWNER REVIEW; EXECUTION NOT AUTHORIZED.** No project reference, host,
region, budget, provider, credentials or executor has been approved by this package.
Every hosted gate below is NOT RUN. Approval must name the stage, resources,
executor and immutable source manifest; it is not blanket production authorization.

## Evidence boundary

Current RELEASE-CANDIDATE-REVIEW remediation addendum supersedes its preserved
historical NO-GO defects. HOSTED-READINESS reports 121 passing Node tests and PASS
local driver, persistence and release campaigns:
`local/reliability-6218f550-1f6e-4e29-af74-6bba08529f89.json`,
`local/persistence-665c37d5-760d-4980-85dc-674809a0b779.json`,
`local/release-reason-c9f76c99-987e-4509-b9ce-b003fa40cf6d.json`.
These are reported local PostgreSQL evidence, not independently reproduced in this
preparation task. Auth used a local shim; provider behavior was fake. No hosted
Auth/JWT, managed ownership, pooler identity or real provider guarantees are proven.

## Scope and resource approvals

Recommended initial approval: **S1 only**, one NEW isolated Operations staging
Supabase project, PostgreSQL 17+, operations schema 001–007, read-only metadata
baseline and synthetic real-Auth/RLS tests. No runtime deployment or public ingress.
Production Anabhay, recruitment, prior RBAC test project and their data are excluded.
Existing projects must not be reused without a new explicit decision.

| Stage/resource | Authorizer and executor | Approval boundary |
|---|---|---|
| S1 project, region, plan/cost ceiling, retention | Owner authorizes; named platform operator creates | Exactly one approved project; record actual reference before further action |
| S1 schemas, tables, roles/functions/policies in 001–007 | Owner approves hashes and managed feasibility; named DB executor applies | Fresh project only; no fallback elevated application credential |
| S1 synthetic Auth users, teams and scoped staff fixtures | Owner approves roster and supported confirmation procedure; named test operator provisions | No SQL insert into managed auth.users or global confirmation weakening |
| S2 private Node 22 runtime, ingestion LOGIN, monitoring and secret loader | Separate owner approval; runtime/security operator implements | Private test ingress only, pg 8.23.1, no website endpoint |
| S3 worker LOGIN/principal/team scopes/snapshots and private worker process | Separate owner policy approval plus reviewed writer; named operator executes | Blocked until audited provisioning is implemented; no unrestricted fixture writes as workflow |
| S3 provider sandbox/account, test sender/inbox and capped messages | Separate owner approval; provider operator configures | Sandbox-only allowlisted controlled destinations, no public/live delivery |
| Restore target, backups and cleanup resources | Owner approves RPO/RTO, restore scope and exact cleanup manifest | Separate isolated target; never delete/reset an entire project automatically |

Proposed S1 roster: owner; manager A; manager B; eligible assigned member A;
unassigned member A; member B; inactive staff; confirmed nonstaff; ineligible
assigned member. Nine synthetic accounts, plus unauthenticated requests. Exact
addresses and controlled confirmation mechanism require approval; reserved invalid
addresses cannot receive email. Passwords/tokens remain in secure workflow memory,
not source, reports or chat. Explicit synthetic teams A/B and inactive team C;
assigned, NULL-team and mismatch records. No real staff/customer/applicant/CV data,
production exports, logs, backups or production identity/credentials are permitted.

## Identities and least privilege

| Identity | Permitted boundary | Required denial |
|---|---|---|
| Browser/public client | No configured submission endpoint; public key only | No operations data or privileged RPC |
| Human staff | Verified Auth JWT; own profile/membership and policy-scoped leads | No role/state/team/assignment mutation; nonstaff/inactive denied |
| Active member | Assigned eligible lead in own active team; own permitted notes | Cross-team, unassigned, other authors' private activities and assignment history denied |
| Active manager | Own active-team leads/history; notes; reason-required hold release | Other-team/worker enrollment/privilege grant denied |
| Owner | Draft company-wide lead visibility and permitted notes | No automatic provisioning power; manager-only release remains manager-only |
| Ingestion LOGIN | Only ops_ingestion_api membership; ingest and durable limiter EXECUTE | Notification, staff admin, direct table writes and helper membership denied |
| Worker LOGIN | Only ops_notification_api membership; six bound functions | Arbitrary content, private helpers, manager release and legacy global functions denied |
| Definer owners | NOLOGIN/NOBYPASSRLS; exact table/column grants and RLS | No application membership, persistent CREATE, auth.users or broad auth privileges |
| DB migration executor | Separately approved schema administration, not application runtime | Never reused by API/worker; credentials not requested by this package |

createIngestionProcess and createNotificationProcess validate scoped config before
pool construction; notification persistence=true. No generic pool reaches handlers.
Configuration names: OPERATIONS_PROJECT_REF; staff SUPABASE_URL and
SUPABASE_PUBLISHABLE_KEY; ingestion OPERATIONS_INGESTION_DATABASE_URL,
RATE_LIMIT_HMAC_SECRET, ALLOWED_ORIGINS; worker OPERATIONS_NOTIFICATION_DATABASE_URL.
Approved host/CA/origins are trusted startup inputs. Migration/provider runtime
loaders remain disabled. Never supply a combined host environment or service-role
key. Future provider secret names/mechanism require separate implementation review.

## Migration manifest and procedure

Locally inspected SHA-256 bytes, **proposed for approval, not approved**:

| Order/file | SHA-256 |
|---|---|
| 001_staff_crm.sql | 8631dff7ae8f42dbe48e34e40a6606a68a0add7927f4d4c755ae7b2102b2c736 |
| 002_ingestion_outbox.sql | 30de484d407941bfebbcd73b2a6c4d6b279862c8dd3708062a1a69ca531b6df1 |
| 003_atomic_ingestion.sql | 7a744abdfc865655f92954a108ac8771b5340fd55d87d57baae77caad80da9de |
| 004_capabilities.sql | 5c7514bdd1459d0c8da6f3a0722f0a9228214b404622932c0ede4e7d4b4f4e70 |
| 005_notification_persistence.sql | a53f150179e4857b6d634337e1e5b55c1448025392d370aa1475abb02a018e9f |
| 006_notification_capabilities.sql | dece5733fc14e8f69408da12aa19034194108860ce9fb5d1698c584c5c526efb |
| 007_release_reason.sql | 4f8544210202aa767cfef734126a6d09ec3983167792391b592a751d751a4cb3 |

Named DB operator independently verifies dashboard reference, database target,
version, fresh baseline, all role memberships/SET paths, schema ownership/ACLs,
default ACLs, function dependencies/search paths/EXECUTE, RLS/FORCE RLS, triggers
and API exposure. Review read-only preflight.sql against actual platform before
use; newly observed values are evidence requiring review, not automatic approval.
Stop if managed postgres cannot create/own/transfer narrow roles or grant the exact
auth.uid EXECUTE, or if privileges exceed the approved manifest. Do not grant
BYPASSRLS/broad auth access or change ownership to force a pass.

Apply each approved file once in order, stopping on first error. Compare ledger and
complete resulting catalogs after each COMMIT. Do not run local bootstrap.sql,
verify.sql, reliability-controller or simulated JWT claims on hosted Supabase.
A separately reviewed hosted runner and synthetic fixture writer are prerequisites.
If acknowledgement is lost, stop writes and inspect ledger AND catalogs through
independent approved read-only access. Complete exact state means already applied;
absent exact state requires reviewed recovery before retry; partial/mismatched
state remains NO-GO. No IF EXISTS repair, blind rerun, reset or destructive rollback.

## Acceptance gates — all hosted evidence NOT RUN

Owners below are responsibilities to assign by name, not invented authorities.
Any unmet mandatory criterion is FAIL or BLOCKED, never an inferred PASS.

| Gate/stage | Responsible owner | Required evidence | PASS / stop criterion |
|---|---|---|---|
| G1 target isolation/S1 | Owner + platform operator | Approved reference/host/cost manifest; independent dashboard/database identity | Exact separate target and budget; otherwise stop before writes |
| G2 managed grants/S1 | Security reviewer + DB operator | All ordinary roles, inherited/default ACLs, effective column/table/function privileges and SET paths | Exact approved access, no client/admin escape; any excess or unavailable metadata blocks |
| G3 migration integrity/S1 | DB operator + independent reviewer | Approved hashes, pre/post catalogs, ledger per file, interruption rehearsal | Exact complete state and safe reconciliation; unknown/partial state blocks |
| G4 real Auth/RLS/S1 | Security test owner | Normal sessions, independently verified UUIDs, valid/expired/wrong-project JWT cases, nine identity assertions | Positive scopes work; inactive/nonstaff/cross-team and actor spoofing denied; no claim-only shim |
| G5 release audit/S1 | Staff policy owner + test owner | Manager same-team release, Unicode blank/bounds, normalized same-key replay, changed reason/actor rejection and immutable audit | Exactly one receipt; reasonless overload denied; no attempts reset or forged actor |
| G6 operator lifecycle/S3 | Owner + security reviewer | Approved identity/action/team policy; reviewed writer, actor/reason/approval receipt and transaction tests | Register inactive, explicit scope/activation, disable, replay/conflict and audit work without broad writes; currently BLOCKED |
| G7 assignment/snapshot/S3 | Team/content approver + security reviewer | Approved assignment and minimal recipient/content; atomic current-team check, immutable digest | NULL/mismatch/inactive scope denied, no auto assignment/snapshot; currently BLOCKED |
| G8 pools/TLS/recovery/S2 | Runtime operator + test owner | Trusted TLS/wrong-host/CA rejection, session_user/current_user under selected pooler, bounded pool waits, real lost COMMIT ACK and shutdown tests | Identity survives pooler; one durable same-key receipt/outbox; shutdown timeout fails and backend termination independently verified |
| G9 abuse/proxy/S2 | Network/security operator | Trusted source-IP derivation, spoofed headers, body/UTF-8 limits, concurrent durable limits, edge connection budgets | Fail-closed enforcement; no untrusted forwarded identity; limiter survives ingestion rollback |
| G10 provider/recovery/S3 | Provider operator + security reviewer | Sandbox contract/retention/authoritative lookup, outbox-ID key/digest, accept/reject/unknown/lost response/DB ACK/crash timelines | No send on unknown; durable observation/reconciliation, stale fences, exhausted/quarantined exclusion; no exactly-once claim |
| G11 lease/content/S3 | Runtime + test owner | Concurrent claims, live expiry, inactive/cross-team denial, content read only for valid lease, bounded send | Stale tokens cannot acknowledge/retry; lease fits operation or separately reviewed renewal; no arbitrary CRM read |
| G12 logs/secrets/alerts/S2–S3 | Security + incident owner | Redaction tests, scoped secret injection/rotation, alert drills | No passwords/tokens/bodies/raw provider responses; alerts for unknown commit, stale lease, holds, exhaustion and shutdown failure reach named owner |
| G13 restore/containment/S1–S3 | Owner + DB/incident operator | Approved RPO/RTO, synthetic restore to isolated target, OID/identity/ACL checks and incident drill | Restored ledger/receipts/audits/grants correct, sends disabled, containment verified; Auth/settings/secrets not assumed in DB backup |
| G14 public separation/all | Website/release owner | Exact 26-file artifact inventory; no endpoint and no backend/secrets; future Pages source verification | Staging never changes website or publication; actual hosted Pages settings remain separately unverified |

Provider crash cases must cover before send, acceptance before DB observation,
observation before DB finish, and finish before acknowledgement. Verify durable
status first; retry same job/key/digest only under current lease and authoritative
absence. Pending/failed receipts indicate prior acceptance, not delivery. Unknown
lookup goes to hold; release remains authorized manager-only with audited reason.
No automatic release, retry-counter reset or worker power to release quarantine.

## Containment, rollback and prohibitions

Stop private ingress and new claims on failure; bounded shutdown may fail and must
not be called proof of termination. Named incident operator verifies processes and
backends, contains approved credentials and preserves sanitized receipts/catalogs.
Worker disable/revoke requires the approved audited capability; it does not exist
yet. Privileged emergency action needs explicit scoped approval, not ad hoc SQL.
Do not delete immutable events or rewrite unknown outcomes. Recover through reviewed
forward repair or isolated synthetic restore, never production rollback. Cleanup
requires exact resource/fixture IDs, dependency review and separate approval.

Until separately authorized: no hosted creation/migrations/users/grants/settings,
runtime/provider deployment, resource cleanup, credential retrieval, API exposure
broadening, public endpoint, live messages, production/recruitment access, DNS,
repository commit/push or production activation. Provider adapter, secret loader,
hosted runner and provisioning writer are not implemented by this document.

## Owner approval checklist

- [ ] Select S1-only or explicitly approve additional stages and their dependencies.
- [ ] Name target project/region/budget, executor, reviewer and incident owner.
- [ ] Approve current migration hashes, independent catalog manifest and recovery.
- [ ] Approve nine synthetic identities, confirmation method and fixture workflow.
- [ ] Decide operator/action/team, assignment, content, disable and audit policies,
      or explicitly leave these denied in limited schema/Auth staging.
- [ ] Separately approve private runtime/pooler/proxy/secrets and restore drills.
- [ ] Separately approve provider sandbox/recipients/costs and recovery contract.
- [ ] Require recorded PASS evidence for every gate in the selected stage before
      advancing; no production/public authorization implied.

Preparation state: main, HEAD 3f33a5ac00a972db66c9064ed10c384a27ac8cd3,
no staged files. Only this package added; existing tracked/untracked work preserved.
No tests rerun, remote connections, hosted changes, credentials, activation,
commits, pushes or deployments during preparation.
