# Live release status — 2026-10-13

**Website live state: NOT VERIFIED. Hosted Operations: NOT VERIFIED / NOT READY
FOR ACTIVATION. S1 approval: PENDING.** Only local records/source were inspected.
No HTTP/DNS/account inspection, tests, migrations or hosted operation ran here.

## 1. What is already publicly served?

The current response at `https://anabhay.in/`, availability, TLS, redirects, route
coverage and deployed revision are NOT VERIFIED. CNAME contains `anabhay.in`;
README describes a static GitHub Pages company website. Local HEAD is
`3f33a5ac00a972db66c9064ed10c384a27ac8cd3`, subject “Harden contact enquiry flow
and add contact links”. Neither CNAME nor a local commit proves public deployment.
No current public-response evidence was located in the reviewed repository records.
Earlier conversation statements about publication are historical, not today's
reachability/content verification. Do not equate local HEAD with a served revision.

Verified local website content: home/about/services/projects (including Civicsync
and Cognitive Mobility Platform)/how-we-work/careers/contact and custom 404.
contact/index.html provides `mailto:anabhayventures@gmail.com` and
`https://wa.me/919832977184`; enquiry details are a non-form field group with an
initially disabled review button. contact.js initializes review and passes only
requestId to submitEnquiry; enquiry-api.js has endpoint=null and rejects before
fetch. Therefore local source has no active submission backend. This is not proof
that the public domain currently serves these exact bytes.

The manual pages-artifact-review.yml uploads the exact `_site` artifact; it has no
deployment job or push trigger. The manifest lists 26 public files and excludes
Operations source. _config.yml is only legacy Jekyll defense. Actual Pages source
settings/deployed asset hashes require separately authorized public/hosting checks.

## 2. Operations components present locally

Local drafts: migrations 001–007 (staff/teams/CRM, enquiries/outbox/audit, atomic
ingestion, durable limits/staff notes, immutable notification records, scoped worker
capabilities, reason-required manager release); pinned Node 22/pg 8.23.1 package;
fixed PostgreSQL driver and separate capability/process factories; HTTP validation
adapter; worker/store/content kernel; provider protocol and deterministic fake;
source-only operator preflight, tests, local campaigns and approval/runbook records.

HOSTED-READINESS reports 121 passing Node tests and successful disposable PostgreSQL
driver/persistence/release campaigns after P0 remediation. These are reported local
results, not reproduced today and not managed Auth/provider proof. Current records
state no hosted deployment or activation. No remote inventory was inspected, so
this report cannot independently certify the absence of resources outside records.

## 3. Why a hosted backend cannot run safely yet

- No approved target/host, scoped credentials/secret loader, hosted ingress/listener,
  authenticated hosted runner or deployment integration exists in reviewed source.
  process-runtime.mjs exports factories, not a running server or scheduler.
- Managed PostgreSQL role creation/ownership, auth.uid permissions, effective ACLs,
  real Auth/JWT propagation, dedicated LOGIN identity under poolers, TLS and timeout
  behavior have not been established. No elevated fallback is acceptable.
- Operator registration/scope/activate/disable/assignment/snapshot writers are
  intentionally absent. NULL-team leads remain unassigned and undeliverable through
  team scope; no default team or snapshot is created. Audited provisioning policy
  remains unresolved, including emergency disable.
- provider.mjs permits only fake providers; config.mjs rejects provider/migration
  runtime loading. No real sender, acceptance verifier, authoritative lookup,
  webhook or delivery integration is implemented. DB acceptance is not delivery.
- Trusted ingress identity, edge/request concurrency budgets, abuse controls,
  retention, monitoring/alerts and recovery/restore evidence are still gates.
- Free-tier availability, limits and actual zero-cost feasibility are unverified.
  Local code compatibility does not demonstrate a free hosted Node runtime.

## 4. Approvals required before S1 creation

S1-OWNER-APPROVAL.md records owner proposals, not execution consent: new isolated
target; owner-only initial human operator with no team access; provisioning disabled;
free-tier/zero-cost only and stop for paid requirements or billing uncertainty.

Complete explicit approval of: exact target name/organization/region and isolation;
zero-cost evidence/limits/cost-stop responsibility; named owner identity and secure
authentication; exact 001–007 hashes and catalog acceptance/recovery manifest;
least-privilege managed access; synthetic roster/confirmation and reviewed hosted
fixture mechanism; stop/containment rules and evidence location. Record approver,
decision/date/evidence without inventing them. Initial operator is not automatically
an employee `owner` (that role grants company-wide visibility despite no memberships).
Nine synthetic test identities/team fixtures remain separately unapproved; if not
approved, corresponding positive authorization tests stay BLOCKED.

## 5. Minimum safe zero-cost path (conditional proposal)

1. Owner approves S1 only after current, independently obtained zero-cost and
   isolation evidence. Create exactly the approved new staging target; no production
   or recruitment reuse. If the provider requires payment or capacity is unavailable,
   STOP; do not upgrade or create substitutes automatically.
2. Review managed catalogs against approved expectations, apply exact 001–007 in
   order only if compatible, and run real Auth/RLS/grant/reason tests with approved
   synthetic fixtures. Do not run local Auth shim/bootstrap hosted.
3. Separately approve a private free-tier Node 22 runtime that demonstrably supports
   pg/TLS, bounded pools, required duration and PostgreSQL networking. Implement the
   minimal server/secret loader and private ingestion endpoint, test driver recovery,
   durable limiting, trusted proxy identity and shutdown. No public website endpoint.
   A particular host/free plan has NOT been selected or cost-verified. Edge runtimes
   are not assumed interchangeable with this Node driver; a port would need review.
4. Keep notification delivery disabled until approved operator/content workflows,
   sandbox provider and recovery guarantees are implemented and proven. Alternatively
   request an explicit ingestion-only acceptance policy with initial enqueueing
   truthfully disclosed, monitoring/backlog retention and no promise of notification.
   Existing contract requires atomic enqueue, not verified email delivery; this
   alternative is a decision to review, not an activation permission.
5. Obtain separate release approval after acceptance evidence, privacy wording and
   rollback/containment readiness. Enable only a validated exact HTTPS endpoint and
   exact-origin CORS policy. Keep website publication and backend release separate.

No free-tier guarantee is offered. Approval to discuss this path is not authorization
to create an environment, implement a different architecture or deploy anything.

## 6. Costs and separately approved features

| Resource/feature | Current knowledge | Required action |
|---|---|---|
| Staging database/Auth/project quota | Free eligibility, project capacity and quotas NOT VERIFIED | Owner-approved cost inspection before creation; stop if paid |
| Node compute/pooler/concurrency/egress | No verified free compatible runtime | Verify runtime and aggregate limits; paid compute/overages prohibited |
| Provider sandbox/custom SMTP/email delivery | No selected provider or verified free allowance | Separate sender/recipient/message budget and guarantee approval; no live sends |
| Backup/PITR/restore target/log retention/monitoring | Availability/cost NOT VERIFIED | Verify each selected service; paid options require a changed explicit budget policy |
| Custom API domain/DNS, scheduler, storage or extra projects | Not necessary to S1; no cost assertion | Separate authorization, even if a service claims free |
| Public activation/production rollout | Outside S1 | Separate release review and owner approval regardless of price |

This report cannot state which current vendor feature definitively requires payment
without external verification (prohibited here). Exceeding any free allowance,
paid plans/add-ons or uncertain billing is a stop condition, not implicit consent.

## 7. Exact evidence required before enabling public enquiries

- Approved release target/source hashes, current real-Auth/RLS/effective-grant
  evidence and direct-table/helper/privileged membership denials; no service-role
  credential in application/browser paths; role policy and approved fixture scope.
- Deployed private endpoint with verified TLS, exact allowed origins and preflight,
  strict body/type/UTF-8 validation; tested 409/422/429/503 and unknown-outcome
  semantics; bounded waits, connection/request budgets and independently verified
  backend shutdown; no false success on COMMIT loss.
- Real concurrent ingestion/idempotency tests: one durable receipt/enquiry/outbox,
  changed-payload conflict, atomic rollback, separately durable rate accounting,
  fail-closed limiter and spoofed forwarded identity denial at actual ingress.
- Approved abuse/edge limits and tested hostile/oversized/malformed requests,
  protection of secrets/logs, named alerts and incident owner, verified zero-cost
  capacity and fail-closed behavior at exhaustion (no automatic paid upgrade).
- Approved notification policy: if delivery claimed, real sandbox acceptance,
  authoritative idempotency/lookup retention, lease fencing, crash/unknown/retry
  recovery, audited release and scoped minimal content evidence. Fake provider
  results cannot establish external delivery; ingestion-only requires explicit
  backlog/retention/disclosure approval instead.
- Privacy/consent purpose, retention/contact wording approved; receipt queued means
  initial enqueueing only. Snapshot/assignment/provisioning remain denied unless
  separately implemented/approved. Tested recovery/backup/restore and containment
  appropriate to approved service commitments; no blind retries or queue resets.
- Browser synthetic end-to-end/network evidence of endpoint integration, same-key
  retries, JS-unavailable/module-failure privacy and no secret/field query leakage;
  accurate messaging. Exact 26-file public artifact verified, and current publicly
  served routes/assets compared after separately approved publication.
- Explicit owner public-activation decision referencing completed evidence. Any
  required FAIL/BLOCKED item prevents activation; S1 success alone is insufficient.

## Shortest dependency-ordered plan and effort

Planning estimates only: focused engineering days, excluding owner turnaround,
provider capacity and unexpected managed restrictions; not a deadline or paid quote.

| Order | Deliverable | Estimated effort |
|---|---|---|
| 1 | Complete S1 identity/zero-cost/fixture/hash approvals | 0.5–1 day of preparation; approval wait unknown |
| 2 | Approved isolated creation, catalog compatibility and real Auth/RLS tests | 1–3 days; stop on incompatibility |
| 3 | Approved private Node runtime, server/secret integration and ingress/driver tests | 2–5 days if a compatible zero-cost host exists |
| 4 | Approved audited operator/content workflow and sandbox recovery, or explicitly approved ingestion-only scope | 3–7 days with notifications; scope-dependent otherwise |
| 5 | Privacy, monitoring/recovery evidence, release review and separately approved public verification/activation | 1–3 days |

Shortest safe next action: complete the S1 approval record. Do not start creation
or skip unverified gates. Zero-cost infeasibility stops the path, rather than
authorizing spend. Hosted staging and public release remain NOT AUTHORIZED.

Final Git state: main, HEAD 3f33a5ac00a972db66c9064ed10c384a27ac8cd3; no staging.
Existing tracked changes: .gitignore, js/enquiry-api.js, js/enquiry-validation.js.
Existing untracked entries: .env.example, .github/, _config.yml, operations/,
scripts/build-pages.mjs, scripts/pages-manifest.json. Only this status document
was added. No remote operation, credentials, resource creation, migration,
activation, source change, commit, push or deployment occurred in this review.
