# Local durable notification binding — 2026-10-12

LOCAL POSTGRESQL BINDING VERIFIED. Not production-ready, hosted or activated.
Public submission and actual provider delivery remain disabled.

## Implemented authorization and persistence

006_notification_capabilities.sql extends unchanged 001–005. A new migration is
needed because 005 has neither system identities/team grants nor scoped functions,
action replay or manager release audit. No default team, automatic enrollment,
staff role mapping, application assignment API or elevated fallback was invented.

- Dedicated LOGIN is mapped by pg_roles OID/session_user to one non-human principal.
  Principal defaults inactive; operator must explicitly provision active identity
  and team memberships. Every privileged worker operation revalidates this principal
  and active team, matching snapshot/current lead assignment and job/enquiry identity.
  Scope is derived in SQL, never caller-supplied team/actor. NULL/mismatched/inactive
  routing denies content/claim. Ordinary worker has EXECUTE only, no direct tables.
- NOLOGIN/NOBYPASSRLS private owner uses exact table/column grants and explicit RLS.
  Worker has no owner membership, schema CREATE, auth.users or arbitrary lead PII
  access. Search paths are empty. Auth helper uses a definition-time-bound reference
  and narrow EXECUTE on auth.uid(), no auth schema USAGE. Local proof only; managed
  role creation/ownership/Auth behavior still needs separate authorized staging.
- Scoped SKIP LOCKED claim sets principal, nonce token, two-minute expiry and capped
  attempt atomically. Read/attempt/observation/actions require matching live lease.
  Terminal action replay accepts only the same principal, token fingerprint,
  attempt and outcome; newer lease/changed receipt fails. Legacy global queue
  functions are revoked from ops_notification_api after 006, preventing fallback.
- Snapshot and existing metadata tables are reused. Attempt markers commit before
  any possible send; observations contain only allowlisted outcome/receipt metadata.
  Stable namespace/outbox key and immutable payload digest are enforced. Contradictory
  provider receipts fail. Existing known acceptance forbids retry and is reconciled
  by later workers without another provider send/lookup. Accepted is not delivered.
- Unknown outcomes create a durable operational hold plus action/observation audit;
  held jobs cannot be claimed. Expired tenth attempts become failed processing with
  an unknown-outcome hold, never attempt eleven. Retry is five minutes for verified
  definite nonacceptance, not a timeout interpreted as failure.
- release_notification_hold derives actor from Auth, requires existing active
  employees.role='manager' and same active team membership/current lead routing.
  Member/owner/other team/inactive manager/worker are denied; no owner-to-manager
  mapping added. Release atomically appends immutable request-keyed audit evidence
  and removes the hold. It never resets attempts or requeues terminal accepted/
  exhausted rows. Same release identifier is idempotent for the original action.

server/notification-store.mjs adapts only named methods on the existing one-pool
notification factory with persistence:true. Process startup uses this bound variant;
old direct factory default remains for pre-006 isolated regressions, not a fallback
after migration. No raw pool/SQL, ingestion credential or manager release capability
is exposed to worker. Store verifies canonical snapshot digest and conservatively
subtracts RPC latency from returned lease lifetime. Worker uses persisted acceptance
when available. A staff-JWT-only release wrapper in capabilities.mjs validates input,
retains verified user client and treats transport uncertainty as 503 with same
request identifier; no actor/role can be supplied by the caller.

## Executed tests and evidence

Final binding: operations/local/binding-a39eb8ed-4a06-4b28-992b-b5ce7e20fb07.json.
All fifteen real PostgreSQL assertion groups PASS; 111 Node tests PASS, zero
failed/skipped; site and whitespace PASS; zero protected changes during execution:

1. Worker direct table/private-helper/manager/legacy function denial, no executor membership.
2. Private owner NOLOGIN/NOBYPASSRLS; no residual CREATE/auth schema usage/arbitrary lead PII.
3. Concurrent scoped claim/authorized content; cross-team/NULL-team/inactive-team/mismatch denial.
4. Worker/team deactivation blocks next operation.
5. Stale token denied, duplicate marker/accept replay, conflicting receipt/extra actor rejection.
6. Durable quarantine excludes claim; worker cannot release.
7. Active same-team manager audited/idempotent release; member/owner/cross-team denial.
8. Suspended manager retains Auth claim but cannot release; hold retained.
9. Same-job contention, rolled-back claim and known acceptance prevents retry.
10. Concrete worker/store persisted marker and fake-provider lost-response recovery across instance restart.
11. Genuine accepted COMMIT acknowledgement loss, independent server visibility and idempotent action recovery.
12. New lease uses stored acceptance without another provider lookup/send.
13. Expired tenth attempt stays exhausted/held; no eleventh send.
14. Concrete worker persists fake rejection and fenced five-minute retry.
15. Concrete worker persists fake unknown observation/action/hold, no further claim.

Three earlier binding revisions also PASS; their reports retain their own hashes.
Report 037097ac records changes while late validation was being added; final a39eb8ed
is the clean unchanged-source run. Do not aggregate overlapping test counts.

Compatibility reruns (each fresh isolated DB, not an already-upgraded database):
- persistence-5663d9b1-9d2f-4bd3-b7f8-6020dacf6188.json: 005 metadata/default-denial, nine groups PASS.
- reliability-d63d491d-f40d-454d-b5f9-c3b9793a1723.json: original concrete-driver TLS/pool/timeouts/rollback/
  genuine COMMIT faults/same-key recovery/shutdown PASS.
- outbox-c83507aa-5132-4cbd-a49a-7f2cfdbd638c.json: twelve original real lease/outbox recovery groups PASS.
Each records 111/111 Node tests, site/whitespace PASS and unchanged source during run.
These modes exercise 001–004 or 001–005; only binding mode applies 006 and verifies
legacy revocation. Older verify.sql remains a pre-005 verifier, not an upgraded schema verifier.

Commands executed: node --test scripts/enquiry.test.mjs operations/tests/*.test.mjs
(spec reporter), controller --approved-local-binding (four fresh runs),
--approved-local-persistence, --approved-local-campaign, --approved-local-outbox,
syntax checks, node scripts/check-site.mjs and git diff --check. No unsigned
PowerShell runner or execution-policy bypass, dependency/image download or remote call.

All seven campaigns created fourteen disposable containers. Actual configuration
checked: pinned cached images; local Docker endpoint; PostgreSQL network=none,
tmpfs database, no ports/host mounts; Node shares only its verified namespace.
TLS verification stayed enabled. Full IDs/run labels verified before removal;
independent cleanup checks confirm backend/process absence. Reports are sanitized
and ignored. No unrelated resources/images removed.

## Evidence limits and remaining release gates

Provider is FAKE only. Its response loss/accept/reject/lookup are deterministic
simulations, not a live provider guarantee. Worker restart is an instance/connection
restart over real DB persistence, not an OS process crash or real external service
recovery. Lease/backoff expiry uses explicitly labeled operator time adjustment.
Manager authorization uses the local Auth shim/simulated claims, not real Supabase
Auth/JWT. Genuine DB lost acknowledgement uses the verified TLS fault proxy and an
independent database observer; it is not a mocked exception.

Before any hosted use: approve exact migrations/catalog/managed ownership, dedicated
LOGIN provisioning and scope grants, actual Auth/JWT/pooler/TLS, target identity,
secret loader/rotation, provider sandbox guarantees/retention/reconciliation, alert/
backup/restore/incident and privacy requirements. No exactly-once delivery promise.

Snapshot writer and assignment UI/API are not implemented. Trusted operator must
explicitly assign lead and provision the approved minimal recipient/template/text
snapshot with matching team/namespace. Existing immutable NULL-team snapshots or
later mismatched reassignment remain denied; safe reissuance/retention needs review,
not automatic rewriting or routing. Role-OID lifecycle/restore and manager hold
release audit retention also need operational approval. Platform administrator or
compromised worker/provider verifier remains a trust boundary; DB cannot independently
prove external acceptance from a receipt string.

Migrations 001–005, public assets/activation, Pages settings, dependencies and live
recruitment remain untouched. No Supabase/remote access, hosted mutations, real
messages, credential retrieval, staging, commits, pushes or deployments occurred.
