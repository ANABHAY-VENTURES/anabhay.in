-- DRAFT / NOT EXECUTED. Server role is privileged: NEVER expose its key.
begin;
lock table operations.migration_versions in exclusive mode;
DO $$ BEGIN IF (select array_agg(version order by version) from operations.migration_versions) IS DISTINCT FROM ARRAY[1] THEN RAISE EXCEPTION 'Unexpected migration baseline'; END IF; END $$;
create table operations.website_enquiries (
 id uuid primary key default gen_random_uuid(), lead_id uuid not null unique references operations.leads(id) on delete restrict,
 idempotency_key uuid not null unique, payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'),
 schema_version integer not null check(schema_version=1),
 consent_given boolean not null check(consent_given), consent_version text not null check(consent_version='enquiry-v1'),
 consent_received_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create table operations.notification_outbox (
 id uuid primary key default gen_random_uuid(), enquiry_id uuid not null unique references operations.website_enquiries(id) on delete restrict,
 state text not null default 'queued' check(state in ('queued','processing','accepted','failed')),
 attempts integer not null default 0 check(attempts between 0 and 10),
 next_attempt_at timestamptz not null default now(), lease_until timestamptz, lease_token uuid,
 provider_message_id text check(provider_message_id is null or length(provider_message_id)<=200),
 error_code text check(error_code is null or error_code in ('timeout','provider-rejected','unavailable')),
 created_at timestamptz not null default now(), accepted_at timestamptz,
 check((state='processing') = (lease_until is not null)),
 check((state='processing') = (lease_token is not null)),
 check((state='accepted') = (provider_message_id is not null)),
 check((state='accepted') = (accepted_at is not null))
);
create table operations.audit_events (
 id uuid primary key default gen_random_uuid(), actor_id uuid references operations.employees(id) on delete restrict,
 action text not null check(action in ('assign','status','staff-access','activity','retention')),
 entity_id uuid not null, created_at timestamptz not null default now()
);
create index outbox_due on operations.notification_outbox(next_attempt_at) where state in ('queued','processing');
alter table operations.website_enquiries enable row level security;
alter table operations.website_enquiries force row level security;
alter table operations.notification_outbox enable row level security;
alter table operations.notification_outbox force row level security;
alter table operations.audit_events enable row level security;
alter table operations.audit_events force row level security;
revoke all on operations.website_enquiries,operations.notification_outbox,operations.audit_events from public,anon,authenticated,service_role;
-- All application/server writes remain denied until narrow capabilities exist.
insert into operations.migration_versions(version,name) values(2,'ingestion-outbox');
commit;
