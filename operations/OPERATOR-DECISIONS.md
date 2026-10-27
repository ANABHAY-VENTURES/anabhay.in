# Decisions requiring owner approval

Proposed defaults below are NOT authorization. Provisioning remains fail-closed.

| Decision | Proposed default | Affected capability | If unresolved |
|---|---|---|---|
| Operator identity and eligible staff | Verified human Auth identity plus explicitly granted operational permissions; no automatic owner/manager mapping | Register, scope, activate, disable | No provisioning writer |
| Team authority and approval source | Explicit per-team approval, checked transactionally against trusted authorization | Scope grant/revoke, snapshot creation | No scope changes or snapshots |
| Worker lifecycle | Separate non-human LOGIN, inactive enrollment; reviewed activation and emergency disable | Registration/activation/disable | No operational enrollment or DB disable workflow |
| Assignment authority | Separate approved human assignment capability; NULL stays unassigned | Assignment and snapshot eligibility | No automatic routing |
| Recipient and content approval | Explicit minimal recipient/template/content approval; exact current active team | Immutable snapshot creation/reissuance | No automatic snapshots; reassignment mismatch remains denied |
| Provisioning audit and replay | Immutable actor/reason/approval/request/payload receipt, atomic with mutation | All provisioning changes | No safe retry/reconciliation writer |
| Quarantine release reason | Mandatory exact ECMAScript-whitespace-trimmed 1–500 Unicode-code-point reason; existing active same-team manager only | Release overload in draft 007 | Reason-required deployment not approved |
| Audit retention/privacy | No credentials, CVs or unnecessary personal data in reasons; retention owner-defined | Release and future provisioning audit | Retention policy remains undecided |

Draft 007 preserves historical NULL reasons without fabrication or backfill. New
inserts require a reason. Same-request replay requires the same normalized reason;
historical reasonless requests cannot replay through the new entry point. Clients
must adopt the reason field before rollout. No role or team authorization expands.
