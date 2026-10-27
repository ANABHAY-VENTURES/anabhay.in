# Release-candidate integrity review — 2026-10-13

## Subsequent remediation status — 2026-10-13

The original review below is preserved as historical findings. D1/D2 are fixed and
locally verified: shutdown rejects unconfirmed close, and release reason normalization
uses one explicit Unicode set/code-point bound in application and SQL. D3 is fixed
by complete test discovery plus required-suite omission guards. D4 current README,
staging scope and hosted evidence were reconciled without authorizing provisioning.
Executed PASS reports are listed in HOSTED-READINESS.md; each ran 121 Node tests
and verified removal of both isolated containers. Original mock defect evidence
does not describe the corrected source. No hosted or live-provider evidence exists.

P0 technical blockers are closed locally. Staging execution remains NO-GO until
owner approves the exact isolated scope and operator policy, or explicitly limits
staging to schema/Auth tests with provisioning denied. It is safe to request that
scoped approval; this is not authorization to execute or production readiness.

**Recommendation: NO-GO for requesting approval to execute this release candidate
in isolated staging.** Resolve D1 and D2, reconcile the rollout checklist, and
obtain the decisions below first. Owner discussion of those decisions is safe;
this report does not authorize hosted execution. This is not a production-readiness
assessment or an approval to publish source.

Repository: `D:\anabhay.in\anabhay-in-website`, branch `main`, HEAD
`3f33a5ac00a972db66c9064ed10c384a27ac8cd3`. No staged files. Existing work preserved.
Only this review document was added during this review.

## Verdicts and evidence

| Area | Verdict | Exact evidence and boundary |
|---|---|---|
| Ordered migrations 001–007, atomic ledger gates | PASS | Source review: 001 requires fresh PostgreSQL 17+; 002–007 require exact predecessor ledger; each is transactional. Saved release-reason report executed all seven locally. Not repeatable repair scripts; ledger alone is not a catalog fingerprint. |
| Least-privilege grants and function ownership, local model | PASS | 001 revokes postgres-created default client grants; 003/004 transfer fixed definer functions to narrow NOLOGIN/NOBYPASSRLS owners and revoke temporary CREATE; 006/007 retain this model. Clients have no executor membership in tested fixtures. Saved binding campaign verifies direct-data/helper/legacy denial. Managed effective grants are BLOCKED separately. |
| Human staff RLS and actor derivation | PASS | 001 own_employee/own_memberships are leaf checks; visible_leads requires active staff, scoped active team and assignment eligibility for members; histories restricted to owner/manager; members read only their own assigned-visible activities on visible leads. 004 own_note_insert derives/compares auth.uid(); audit_note is atomic. Owner-wide access is intentional draft policy, not provisioning authority. Local Auth shim evidence only. |
| Worker identity, team authorization, content and fencing | PASS | 006 bound_worker maps session_user to active dedicated LOGIN; bound_scope checks active explicit team plus current lead/snapshot match; bound_lease validates principal/token/attempt/expiry/hold. NULL-team enquiries are denied. Fixed driver/store methods expose no arbitrary table reader. Saved real binding tests verify scope, inactive identities and stale fencing. |
| Operator provisioning | BLOCKED | No register/scope/activate/disable/assignment/snapshot writer exists. OPERATOR-DECISIONS.md defaults are proposals, not grants. owner/manager are not silently promoted to provisioning administrator. |
| Immutable notification persistence and release replay | PASS | 005 immutable snapshot/attempt/observation triggers; 006 immutable action/release events. 007 retains historical NULL reason rows, adds insert guard, revokes reasonless client EXECUTE and compares reason on replay. Saved real SQL proves space-blank/NULL denial, member denial, valid manager release, one replay receipt and immutable UPDATE/DELETE/duplicate rejection. Whitespace gap D2 limits this PASS. |
| Reason contract across client and SQL | FAIL | D2: capabilities.mjs uses JavaScript trim(); 007 uses btrim with only space/tab/CR/LF. Unicode-blank direct RPC reasons are not consistently rejected. |
| HTTP validation, abuse accounting and canonical payload | PASS | http.mjs counts permitted POSTs before bounded 16 KiB body reading, rejects bad UTF-8/content type, bounds reader deadline; enquiry.mjs rejects extra fields/types, derives canonical hash; driver revalidates it. 004 limiter caps 4097 rows with fixed global/bucket counters. OPTIONS, denied origins and methods are not counted; no claim that every network attempt is counted. Trusted proxy identity remains BLOCKED. |
| Transaction and uncertain-COMMIT handling | PASS | postgres.mjs transaction marks commitSent before COMMIT, returns only acknowledged COMMIT, disposes uncertain clients, and reconcileEnquiry reuses validated key/hash/payload. Limiter uses a separate acknowledged transaction. Saved driver/binding reports include genuine transport ACK loss and independent committed-state observation; not newly reproduced. |
| Shutdown completion semantics | FAIL | D1: postgres.mjs shutdown resolves its deadline branch even with pool.end unsettled. Today's local mock probe reproduced false-positive completion. |
| Outbox/provider reconciliation, local binding | PASS | Worker commits attempt marker before send, rechecks content/lease, uses durable acceptance observation, fences finish actions, holds unknown outcomes and caps retries. Saved binding campaign uses real PostgreSQL plus FAKE provider; it does not prove external delivery or exactly-once semantics. No lease renewal exists; bounded work must fit lease with margin. |
| Live provider and OS crash recovery | BLOCKED | provider.mjs permits fake-only construction; no live provider/receipt verifier or transport exists. Prior worker restarts are instance/connection restarts; lease expiry uses fixture time changes. Provider retention/authoritative absence and actual crash recovery remain staging/sandbox gates. |
| Public contact activation/privacy | PASS | contact interaction is a non-form field group with disabled type=button; contact.js supplies only requestId to submitEnquiry. enquiry-api defaults endpoint=null and throws before fetch. No endpoint/listener is configured. Structural evidence and existing tests; this review did not browser-test JS-disabled/module failure/network capture. |
| Intended public artifact allowlist | PASS | pages-manifest.json contains exactly 26 public entries. build-pages rejects forbidden roots/extensions, traversal, hidden entries, unexpected public files and symlinks; copies only manifest files. Today's artifact inventory and negative tests passed. Credential-pattern scan of public text files found zero matching files; this is a limited heuristic, not universal proof. No operations/scripts/secrets path in manifest. |
| Actual hosted Pages publication path | BLOCKED | pages-artifact-review.yml is workflow_dispatch, upload-artifact _site only, contents:read, no deploy job. _config.yml is legacy Jekyll defense only. No remote Pages settings were inspected. Branch publishing without Jekyll or publishing the repository root is not proved safe; require an approved exact-artifact deployment path before publication. |
| Automated regression coverage of release 007 | FAIL | D3: controller's explicit Node list excludes release-reason.test.mjs and operator-preflight.test.mjs. Manual full suite previously passed 115; controller's regression stage alone is not that evidence. Pages review workflow runs only enquiry/foundation/remediation tests, not the Operations runtime suite. |
| Documentation/evidence reconciliation | FAIL | D4: README capability table still describes legacy claim/accept/retry and manager own-note-only; STAGING-EXECUTION-PLAN covers 001–004 and older evidence. Latest HOSTED-READINESS addition records 007 but later historical text says no binding exists. Use dated latest binding/release reports, not unqualified historical prose. |
| Managed Auth, API exposure, pooler and privileges | BLOCKED | Local bootstrap auth.uid uses simulated claims. No hosted JWT, auth schema ownership/grants, session_user through pooler, actual project/API exposed schema or role membership graph has been verified. |
| Backup/restore, secrets, monitoring and incident execution | BLOCKED | Only design/runbook evidence. OID-to-worker mapping must be revalidated after role recreation/restore. No credential loading, rotation, real containment, restored database or hosted monitoring was exercised. |

## Concrete defects and required corrections

**D1 — High, shutdown false success (verified local mock + source).**
`operations/server/postgres.mjs:144–154`: force resolves after disposing tracked
active clients, and wins Promise.race against pool.end. A caller can interpret
success as pool shutdown while late acquisitions or pool closure remain unresolved.
Probe used a mocked Pool whose end never settles, shutdownMs=1, and no network;
shutdown still resolved. Correct by reporting unconfirmed shutdown as failure,
retaining/observing closure promises and cached failure, and explicitly verifying
termination before environment reuse. Test stalled end, pending checkout, active
connection disposal and repeat shutdown. Existing successful shutdown campaigns do
not exercise this stalled-end branch. No authorization policy change is needed.

**D2 — Medium, inconsistent mandatory blank-reason rejection (source finding).**
`operations/migrations/007_release_reason.sql:5–7,16,26,30` trims only four ASCII
characters; `operations/server/capabilities.mjs:releaseNotificationHold` trims the
JavaScript whitespace set. An authenticated manager can bypass the JS wrapper by
RPC and supply e.g. a reason consisting of U+00A0. SQL length is nonzero, so it can
produce useless audit evidence. This does not bypass manager/team authorization.
Define one exact allowed normalization/nonblank contract and enforce it in SQL
and JS. Add direct SQL tests for tab/newline, Unicode-only blank, mixed whitespace,
500/501 bounds and replay after normalization. No real SQL reproduction of the
Unicode case was run today. Owner approval of reason policy/privacy is required;
do not backfill historical reasons or disable immutable triggers.

**D3 — Medium, incomplete campaign regression selection (source verified).**
`operations/tests/integration/reliability-controller.mjs` excludes the newest
tests from its regression command. Use an explicit current selection or supported
test discovery and assert actual counts. Keep migration 007 SQL assertions
separate from mocked Auth/client tests. The prior manual 115-test result remains
valid for its source; it must not be attributed to the controller's narrower run.
Pages review need not become a deployment workflow; define a separate Operations
release gate covering its complete relevant suite. No new owner role needed.

**D4 — Low, historical documentation can be mistaken for current authority.**
`operations/README.md`, `operations/STAGING-EXECUTION-PLAN.md`, historical portions
of `operations/HOSTED-READINESS.md`, and migration comments saying NOT EXECUTED
need explicit dated scope. They were not rewritten in this review. Update the
current matrix to six worker capabilities and manager reason-required release,
extend staging checklist through 007, and clearly label historical claims. Do not
turn former fixture administrator writes into operator instructions.

## Executed evidence and integrity limits

Saved reports inspected, not rerun:

- `operations/local/release-reason-7922e5f9-945a-41fc-a5ee-14ebeb1394ec.json`:
  PASS, 15 recorded stages, both containers removed. Current 001–007 and release
  adapter/test/controller match its baseline hashes. Four subsequent differences:
  HOSTED-READINESS.md, OPERATOR-PROVISIONING.md, operator-preflight.mjs and its test.
  The last three also changed during that campaign; do not claim full immutable
  source integrity for the whole run. Migration/SQL input correspondence remains.
- `operations/local/binding-a39eb8ed-4a06-4b28-992b-b5ce7e20fb07.json`: PASS,
  14 stages, two removals. Current driver, worker/store and 001–006 match baseline;
  later docs/release adapter/test/controller changes require newer release evidence.
- `operations/local/reliability-d63d491d-f40d-454d-b5f9-c3b9793a1723.json`: PASS,
  20 stages, two removals; current driver source matches saved baseline.
- `operations/local/outbox-c83507aa-5132-4cbd-a49a-7f2cfdbd638c.json`: PASS,
  13 stages, two removals; legacy queue campaign does not prove current scoped
  worker authorization or a provider contract.
- `operations/local/persistence-5663d9b1-9d2f-4bd3-b7f8-6020dacf6188.json`:
  PASS, 13 stages, two removals; storage constraints, not hosted authorization.

New checks today: 12 focused Node tests passed, zero failed; selected artifact,
configuration, bound interface and release wrapper tests. Exact artifact inventory
test builds in temporary local storage and cleans it up. One in-memory shutdown
diagnostic reproduced D1 (not a passing shutdown test). Site checker passed for 10
pages. No PostgreSQL/Docker campaign, migration or remote request was executed.
Previous full 115-test result is reported prior evidence, not today's test count.
Secret scanning did not read credential files or environment values.

## Approvals and objective next gate

1. Correct D1 and D2 locally, add regression evidence and rerun only affected
   local tests/campaigns; preserve existing SQL/RLS policy boundaries.
2. Reconcile D3/D4; approve immutable migration hashes and independent pre/post
   catalog manifest. Interrupted migration recovery must compare ledger and
   catalogs; no blind rerun, destructive reset or automatic repair.
3. Owner must approve exact operator identity, per-action/per-team grants,
   enrollment/activation/disable, assignment, recipient/content approval, audit
   reason/retention and provisioning replay receipts (OPERATOR-DECISIONS.md).
   Alternatively explicitly approve limited schema/Auth staging with those
   provisioning capabilities remaining unimplemented and denied.
4. Approve an exact separate staging project/runtime and synthetic identities,
   no production/recruitment reuse, no public route or live messages. No credentials
   requested here. Hosted preflight must review all relevant roles/default ACLs,
   membership/SET paths, owner roles, FORCE RLS and effective privileges, including
   both release overloads and trigger dependencies.
5. Approve separately reviewed hosted runner using real Auth/JWT. Do not reuse the
   local bootstrap or simulated claims against Supabase. Prove inactive/nonstaff,
   assigned member, cross-team, owner/manager, stale worker and direct-table denials.
6. Prove TLS/pooler session identity, uncertain commit/same-key recovery, durable
   rate accounting/trusted proxy identity, fail-closed shutdown and migration
   interruption/backup/restore with synthetic data. No API exposure broadening.
7. Provider sandbox is a later approval: authoritative lookup/retention,
   ambiguous acceptance/reconciliation, lease expiry/exhaustion and OS crash
   timelines. No exactly-once guarantee, live delivery or public activation.
8. Verify hosted Pages settings independently before any publication, and approve
   deployment of the exact allowlisted artifact only.

## Final local state

Tracked changes preserved: `.gitignore`, `js/enquiry-api.js`,
`js/enquiry-validation.js` (17 insertions, 5 deletions total). Untracked existing
entries: `.env.example`, `.github/`, `_config.yml`, `operations/`,
`scripts/build-pages.mjs`, `scripts/pages-manifest.json`. This report is inside
the already untracked operations directory. No staging, commits or HEAD changes.
No new containers/resources required cleanup. No hosted changes, remote access,
recruitment access, credentials retrieved, public activation or live notifications.
