# S1 owner approval record

**PENDING — NO APPROVAL RECORDED. Do not start staging execution.**
Blank fields, proposed defaults and checked technical hashes are not authorization.
References: STAGING-APPROVAL-PACKAGE.md, HOSTED-READINESS.md and
OPERATOR-DECISIONS.md. Reported local 121-test results were not rerun here.

## Owner-proposed policies recorded from this conversation

These are explicit proposals, **not approval to create resources or execute S1**:

| Policy | Recorded proposal | Outstanding confirmation |
|---|---|---|
| Target | A NEW isolated staging environment | Exact name, organization, region, reference/host and independent isolation evidence |
| Initial operators | Owner only; no team access initially | Owner's named authenticated identity, authentication method and exact administrative boundaries; no legal identity inferred |
| Unresolved operator provisioning | Remain disabled | Explicit confirmation of fail-closed scope; no privileged writer or default team |
| Budget | Free-tier or zero-cost only; stop for paid requirements or uncertain costs | Evidence that selected resources/actions incur no charge; no availability or zero-cost guarantee is made |
| Stage | S1 only | Explicit approval for exact selected actions; no S2/S3 implied |
| Data | Synthetic data only | Exact identity/fixture procedures remain pending |
| Exclusions | No public enquiry activation, live notifications, production changes or deployment | Remain prohibited; this record grants no execution authority |

### Known inputs versus pending execution prerequisites

| Input | Supported value/status |
|---|---|
| Project name | PENDING — REQUIRED BEFORE EXECUTION |
| Organization | PENDING — REQUIRED BEFORE EXECUTION |
| Region | PENDING — REQUIRED BEFORE EXECUTION |
| Retention/review deadline | PENDING — REQUIRED BEFORE EXECUTION |
| Named owner identity and operator authentication method | PENDING — REQUIRED BEFORE EXECUTION |
| Exact project reference/host and isolation evidence | PENDING — REQUIRED BEFORE EXECUTION; obtainable only after separately approved creation, before database/Auth actions |
| Budget evidence and free capacity | PENDING — REQUIRED BEFORE EXECUTION; proposed budget is zero-cost/free-tier only |
| Migration hashes | Locally verified exact values in manifest below; approval of those values is PENDING — REQUIRED BEFORE EXECUTION |
| Managed catalog baseline, ownership and recovery acceptance criteria | PENDING — REQUIRED BEFORE EXECUTION; independently reviewed external evidence required before migrations |
| Effective database privileges and secure secret/session handling | PENDING — REQUIRED BEFORE EXECUTION |
| Synthetic identity/confirmation/fixture mechanism and team test scope | PENDING — REQUIRED BEFORE EXECUTION of those tests; no operational team access approved |
| Audit privacy/retention | PENDING — REQUIRED BEFORE EXECUTION |
| Recovery authority, reviewer and baseline evidence location | PENDING — REQUIRED BEFORE EXECUTION |
| Explicit owner approval, actual date and evidence reference | PENDING — REQUIRED BEFORE EXECUTION |

All remaining blank fields below carry the same status: **PENDING — REQUIRED
BEFORE EXECUTION of the affected action**. No existing proposal is converted into
approval. Later-stage runtime/provider/restore fields remain excluded, not S1 grants.

"Owner only" describes the initial human operator, not an automatic mapping to
the database employee role `owner`, a superuser grant or application team authority.
Migration 001's employee owner role has company-wide visibility even without team
membership. Therefore do not bootstrap the human operator as that employee role
merely to implement this proposal. Exact separation of platform administration,
migration execution and staff identity must be reviewed before approval.

The earlier multi-operator and nine-account/team fixture plan is a candidate test
plan only. It does not authorize additional human operators, team access or identity
creation. Synthetic test sessions are distinct from operational administrators;
their roster and scopes need separate explicit approval. If no team fixtures are
approved, positive team/manager-release tests remain BLOCKED rather than passed.

## Decisions required now

For each row enter an explicit Approve / Reject / Defer decision, named approver,
actual decision date and evidence reference. Any blank/deferred required decision
blocks the affected action. No later stage is included in S1 approval.

| ID | Required decision and inputs | Approver | Decision | Date | Evidence reference |
|---|---|---|---|---|---|
| S1-A | Proposed NEW isolated Operations staging project: name ___; organization ___; region ___; PostgreSQL 17+; free-tier/zero-cost only; no paid resources; cost evidence ___; retention/review deadline ___; cost-stop identity ___ | | | | |
| S1-B | Scope: read-only catalog baseline, exact migrations 001–007, synthetic real-Auth/JWT/RLS/grant and reason-audit tests only; no runtime deployment, public ingress or sends | | | | |
| S1-C | Proposed initial human operator: owner only, named identity ___; authentication method ___; no initial team access; authorized platform/DB/test actions ___; access expiry ___; review/containment responsibility ___; any additional operator requires new approval | | | | |
| S1-D | Approve every exact SHA-256 below, reviewed managed role/ownership manifest, pre/post catalog acceptance criteria and file-by-file execution | | | | |
| S1-E | Nine synthetic identities below, exact test addresses and supported confirmation method ___; secure credential/session handling ___; reviewed hosted runner and fixture writer reference ___ | | | | |
| S1-F | Synthetic teams A/B active and C inactive; explicit test assignments/memberships and approved minimal release-audit fixtures; exact fixture manifest ___; no automatic routing or snapshots | | | | |
| S1-G | Owner-proposed policy: unresolved operator registration/scope/activation/disable/assignment/snapshot provisioning remains DISABLED; no initial team grants or owner/manager escalation; no unrestricted administrator workaround | | | | |
| S1-H | Approve existing role scopes and manager-only same-active-team release; mandatory exact Unicode-trimmed 1–500 code-point reason, immutable audit and normalized replay; reason privacy/retention ___ | | | | |
| S1-I | Approve stop/recovery/containment rules below; baseline preservation location ___; named recovery reviewer ___; no destructive rollback or automatic cleanup | | | | |

Target identity must be recorded and independently verified AFTER approved creation
and BEFORE database/Auth operations: actual project reference ___; database host ___;
dashboard/database evidence ___; verifier ___; verification date ___. Never reuse
production Anabhay, recruitment or the prior RBAC project under this record.

S1-E/F do not bypass the unresolved S1-G policy. Real hosted fixture creation needs
its own reviewed, narrowly scoped synthetic-only mechanism. If none is approved,
Auth/RLS fixture tests stay BLOCKED even if schema creation is approved. Existing
local Auth bootstrap, simulated claims and Docker controller must not run hosted.

## Exact local migration manifest

All seven current local hashes were recomputed and match the approval package.
This verifies local bytes only; it does not approve SQL or managed compatibility.

| File under operations/migrations/ | SHA-256 |
|---|---|
| 001_staff_crm.sql | 8631dff7ae8f42dbe48e34e40a6606a68a0add7927f4d4c755ae7b2102b2c736 |
| 002_ingestion_outbox.sql | 30de484d407941bfebbcd73b2a6c4d6b279862c8dd3708062a1a69ca531b6df1 |
| 003_atomic_ingestion.sql | 7a744abdfc865655f92954a108ac8771b5340fd55d87d57baae77caad80da9de |
| 004_capabilities.sql | 5c7514bdd1459d0c8da6f3a0722f0a9228214b404622932c0ede4e7d4b4f4e70 |
| 005_notification_persistence.sql | a53f150179e4857b6d634337e1e5b55c1448025392d370aa1475abb02a018e9f |
| 006_notification_capabilities.sql | dece5733fc14e8f69408da12aa19034194108860ce9fb5d1698c584c5c526efb |
| 007_release_reason.sql | 4f8544210202aa767cfef734126a6d09ec3983167792391b592a751d751a4cb3 |

Any byte change requires renewed approval. Observe fresh baseline and independently
approve catalog expectations before execution; newly observed privileges are not
automatically approved. Gate G1–G5 in the package requires positive and negative
Auth/RLS/ACL evidence, direct-write denials, reasonless RPC denial, Unicode reason
validation, one immutable replay audit and inactive/nonstaff/cross-team denial.

## Synthetic roster and boundaries

The following remains unapproved, not initial operator enrollment or team access.

| Label | Proposed scope | Exact approved test address / fixture reference |
|---|---|---|
| Owner | Company-wide draft read scope; no provisioning powers | |
| Manager A | Team A only; audited release | |
| Manager B | Team B only; audited release | |
| Eligible assigned member A | Assigned lead in active A, assignment eligible | |
| Unassigned member A | A membership, no lead assignment | |
| Member B | B only; denied A access | |
| Inactive staff | No workspace access despite valid Auth session | |
| Confirmed nonstaff | Auth only; no employee record | |
| Ineligible assigned member | Assigned but assignment_eligible=false | |

Also test unauthenticated access, inactive team C, NULL-team and mismatched records.
No real people, recruitment/applicants/CVs, customer records, production identities,
exports, backups or credentials. Do not weaken global email confirmation or insert
directly into managed auth.users. Never put passwords/tokens/keys in this record.

## Stop, recovery and rollback criteria

- Stop before mutation for target ambiguity, missing approvals, hash/baseline
  mismatch, unexpected/excess effective grants, unavailable managed ownership or
  auth.uid privileges, unavailable reviewed fixture mechanism, or budget breach.
- Stop if a paid plan/resource, chargeable operation or billing uncertainty is
  encountered. Do not upgrade, buy capacity or substitute paid resources. Verify
  free-tier limits and charge exposure through separately authorized inspection;
  no such remote verification occurred while recording these proposals.
- Apply approved files once in order with each transaction intact. Stop at the first
  SQL/test error; no policy weakening, BYPASSRLS or elevated application fallback.
- On lost acknowledgement stop writes. Independently compare ledger AND complete
  catalogs to approved expectations. Exact committed state is not rerun; absence
  requires reviewed retry; partial/ambiguous state stays NO-GO. Preserve sanitized
  evidence. Never blind retry, reset, CASCADE, delete audit or edit migration history.
- Containment: halt testing, preserve sessions/receipts safely, verify backend/process
  termination, and request specifically authorized access containment. Shutdown
  timeout is unconfirmed closure, not proof of containment. Do not invent a worker
  disable capability or manipulate production.
- Recovery is separately reviewed forward repair. Restore drills/targets, resource
  deletion and cleanup are not authorized here. Require approved dependency/ID
  manifest before cleanup. No rollback may remove production data or identities.
- S1 acceptance requires every in-scope gate PASS with reviewed evidence; required
  FAIL/BLOCKED means NO-GO for progression. Schema-only success cannot imply that
  blocked Auth/fixture tests passed. No automatic promotion to S2/S3 or production.

## Later approvals — explicitly excluded

S2 runtime/pooler/driver fault tests, private ingress, proxy trust, secret loaders,
ingestion LOGIN and runtime deployment; S3 worker provisioning/content/recovery,
provider sandbox/sender/recipients/message budget and live lease tests; backup/restore
drill targets, RPO/RTO and destructive cleanup; any public endpoint, live delivery,
publication, DNS, commit/push or production deployment. Each needs its own record.
S1 still requires safe baseline preservation and containment, without a restore drill.

## Final authorization fields

## Required approval checklist

- [ ] Exact target and independent isolation evidence recorded; no production reuse.
- [ ] All seven exact hashes below approved, with catalog and recovery criteria.
- [ ] Named owner identity, authentication method and administrative boundaries
      approved; no team access or automatic employee-owner bootstrap.
- [ ] Synthetic identity, confirmation and fixture procedures explicitly approved;
      unapproved team tests remain BLOCKED.
- [ ] Secret-handling workflow and effective database privileges reviewed; no
      secret values in this record and no elevated application fallback.
- [ ] Zero-cost/free-tier evidence accepted; paid/uncertain-cost stop rule confirmed.
- [ ] Provisioning-disabled policy, stop conditions and recovery authority confirmed.
- [ ] Runtime testing, provider sandbox, restore drills and cleanup excluded until
      separately approved.

### Authorization entry — all fields intentionally unfilled

Owner/approver: ___

Decision (Approve S1 with exact recorded scope / Reject / Defer): ___

Decision date: ___

Evidence/approval reference and approved manifest revision: ___

Conditions and exclusions: ___

Named executor acknowledgement of boundaries: ___

Independent reviewer confirmation of required records: ___

**Until explicit approval and all pre-execution prerequisites are recorded,
staging remains NOT AUTHORIZED.** This document's creation is not owner consent.
