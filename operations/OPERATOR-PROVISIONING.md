# Local operator readiness — no hosted authorization

## Executable preflight

From the repository run `node operations/server/operator-preflight.mjs --source-only`.
It reads seven local migration drafts, reports hashes and selected source guards,
and performs no database, environment or credential inspection. A successful exit
means those source guards exist, not that configuration, effective grants, SQL
execution or hosted readiness passed. No activation is authorized by this command.
Local configuration readiness remains NOT VERIFIED: no credentials were requested.

## Authority boundary and required approval

Migration 006 supplies runtime worker capabilities and manager release, but no
audited provisioning capability. Neither `owner` nor `manager` is authorized to
register/disable workers, grant/revoke team scope, assign enquiries or create
snapshots. Migration-administrator access is not an application operator model.
These operations remain BLOCKED; do not use direct table writes as a workaround.

Before implementing a writer, approve the operator identity source (verified
human Auth session or separately scoped operational identity), authorized actions
and team boundaries, reason requirements, immutable audit retention, approval
reference, recipient/content approval and emergency disable authority. Role names
must not be supplied as proof of authority. No new role mapping is inferred here.

## Safe order and request contract for the future writer

1. Independently approve operator and target team; validate active team and caller
   authority in the same transaction as the change.
2. Register a dedicated non-human database LOGIN by immutable identity, inactive
   initially; verify no privileged membership, ownership, CREATE or bypass rights.
3. Explicitly grant approved team scope; activate only after effective-grant review.
4. Use a separately authorized assignment operation. NULL-team enquiries remain
   unassigned; provisioning must never assign them implicitly.
5. Explicitly approve minimal recipient, template and content. Snapshot creation
   must lock/verify the enquiry's current assigned active team and operator scope.
   No arbitrary lead access, recruitment records or CV content is needed.

Each future mutation requires a stable request UUID, authenticated actor, reason,
approval reference and exact canonical target/action payload. Same request and
payload should replay its durable receipt; conflicting reuse must reject. Record
receipt and mutation atomically. No such provisioning receipt/audit writer exists
yet; registration, scope and snapshot positive tests are BLOCKED, not passed.
An uncertain transaction must be reconciled through that receipt before retrying
the same request. Do not generate a new request ID or repair with manual writes.

## Existing manager release workflow

Use `releaseNotificationHold({outboxId,requestId,reason},{verifiedUserClient})` from
`server/capabilities.mjs`, retaining the same verified human JWT. The database
requires an active `manager` with membership in the matching active team and a
matching current lead/snapshot assignment. Owners, members and workers are denied.
Same actor/job/request replays safely; conflicting reuse rejects. On an unconfirmed
response retry only that same request after checking authorization. Release does
not reset attempts or resend terminal jobs. `notification_release_events` records
actor, request, job and hold/release timestamps immutably. Draft 007 adds a mandatory reason for new releases while preserving historical
NULL reasons and immutability. Exact replay also compares the normalized reason.
Use the explicit whitespace/code-point contract in README.md; Unicode-only blank
reasons are denied in SQL as well as JavaScript. Shutdown timeout/rejection means
unconfirmed closure, not successful containment; independently verify termination.
Approve this additive draft and client contract before any hosted rollout.
No command here establishes a hosted user client or starts live delivery.

## Inspection and containment

The scoped worker `store.status(job)` returns only authorized job state, attempt,
held state and known acceptance; it is not a global pending/quarantine/exhaustion
listing. No operator listing capability exists. A held job is quarantined; a
failed tenth attempt is exhausted. A missing acceptance receipt is not proof that
the provider rejected delivery. Review durable observations before authorizing
release; never equate accepted with delivered.

For a compromised worker, stop its local process via the existing bounded shutdown
and contain its credential externally through an approved procedure. Database
disable/revoke is BLOCKED pending operator authority; no unrestricted UPDATE is
recommended. Existing per-operation active/scope gates deny a disabled identity,
but do not claim that stopping a process revokes credentials or recalls a sent message.

## Verification and remaining gates

Prior binding results contain real disposable PostgreSQL tests of scope, inactive
worker denial, release authorization/idempotency and fencing. They do not prove an
operator provisioning workflow exists. New source-preflight tests use local files,
not PostgreSQL. No database campaign needs repetition for these read-only additions.
Before a future provisioning campaign, approve its writer and use synthetic
identities in fresh network-isolated tmpfs PostgreSQL; test exact replay/conflict,
cross-team and inactive denials, rollback, audit integrity and uncertain commit
reconciliation. Use the fake provider only. Managed Auth/JWT, privilege ownership,
pooler identity preservation, provider verification, backup/restore and hosted
rollout remain separate approval gates. Public submission stays disabled.
