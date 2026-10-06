# Enquiry integration contract — proposed, not deployed

The UI and validation are implemented. No submission endpoint is available or configured. The default API adapter rejects before a network request. No browser storage is used. Never enable a direct browser write to Supabase or embed a service-role credential.

## Minimal API

Provide a same-origin HTTPS `POST /api/enquiries` through a separately hosted server/edge function and reverse proxy. GitHub Pages cannot run this endpoint. No DNS or hosting changes were made here.

Request: `Content-Type: application/json`, `Idempotency-Key: <UUID>`, and the `EnquiryPayload` defined in `js/enquiry-contract.d.ts`. Required names and constraints mirror `js/enquiry-validation.js`; repeat all validation server-side. Reject unsupported schema/consent versions, unknown enum values, oversized bodies, or missing consent. Do not rely on browser validation.

On successful durable persistence AND durable notification enqueue, return HTTP 201 with:

```json
{"persisted":true,"enquiryId":"<opaque-id>","notification":"queued"}
```

Do not return this receipt before the transaction commits. Retrying an identical payload with the same key returns the original receipt; conflicting payloads with that key return 409. Validation errors use 422, throttling 429, and service errors 503. Do not reflect submitted text in error HTML or email headers.

## Minimal storage proposal

First inspect existing Supabase lead storage and notification infrastructure with owner authorization. A new schema may not be required if compatible tables already exist. If no compatible storage exists, the minimum is:

- `website_enquiries`: opaque UUID primary key; server `created_at` timestamp; unique `idempotency_key`; payload hash; schema version; full name; email; nullable phone/organisation; project type; description; preferred contact method; consent flag and version; server consent-received timestamp; source; operational status.
- `enquiry_notification_outbox`: UUID primary key; unique enquiry foreign key; queued/sent/failed state; attempt count; next attempt timestamp; sent timestamp; sanitized error code.

Insert the enquiry and its notification outbox row in one transaction. A worker sends email and retries failed notifications. Email delivery failure must not lose an enquiry or falsely claim email delivery. Use a fixed verified sender and configured recipient, escaped email content, and validated Reply-To. Keep credentials exclusively server-side.

Deny anonymous/public table reads and direct client writes with RLS; only the restricted server and authorised staff should access records. Add request limits, origin checks, rate limits/abuse protection, secret-free operational logging, retention/deletion rules, and monitoring. Avoid unnecessary IP collection.

## Before activation

Confirm the endpoint owner/hosting arrangement, existing schema compatibility, recipient and sender, consent wording, data retention, deletion/contact process, and privacy notice. Configure the adapter endpoint and change the UI/metadata/button label only when the backend is verified. Stage persistence/email tests in an isolated non-production environment. Keep one idempotency key across retries; a timeout is unconfirmed, never a guaranteed failure or success.

No schema, data, production leads, credentials, or email service settings were changed as part of this work.
