-- PROPOSED / HOSTED NOT APPROVED. Local synthetic tests only.
-- Identity-neutral storage prerequisite, NOT an activated worker capability.
-- Worker identity/routing is unresolved: no worker grants, policies, claim rewrite,
-- auth mapping, automatic snapshot creation or adapter binding is provided here.
begin;
lock table operations.migration_versions in exclusive mode;
DO $$ BEGIN
 IF current_user<>'postgres' OR current_setting('server_version_num')::integer<170000 OR
 (select array_agg(version order by version) from operations.migration_versions) IS DISTINCT FROM ARRAY[1,2,3,4]
 THEN RAISE EXCEPTION 'Unexpected notification persistence baseline'; END IF;
END $$;

create function operations.valid_notification_snapshot(p_text text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare v jsonb;
begin
 if p_text is null or octet_length(p_text)>32768 then return false; end if;
 begin v:=p_text::jsonb; exception when invalid_text_representation or untranslatable_character then return false; end;
 if jsonb_typeof(v) is distinct from 'object' then return false; end if;
 if (select count(*) from jsonb_object_keys(v))<>3 or
 not v ?& array['destination','templateVersion','text'] then return false; end if;
 if jsonb_typeof(v->'destination')<>'string' or jsonb_typeof(v->'templateVersion')<>'string' or jsonb_typeof(v->'text')<>'string'
 then return false; end if;
 return length(v->>'destination') between 3 and 254 and
 (v->>'destination') ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and
 (v->>'templateVersion') ~ '^[A-Za-z0-9_-]{1,40}$' and
 octet_length(v->>'text') between 1 and 16384;
end $$;
revoke all on function operations.valid_notification_snapshot(text) from public,anon,authenticated,service_role,ops_ingestion_api,ops_notification_api;

create table operations.notification_snapshots (
 outbox_id uuid primary key references operations.notification_outbox(id) on delete restrict,
 -- Nullable records unresolved/unclassified routing, NOT a global authorization.
 team_id uuid references operations.teams(id) on delete restrict,
 namespace text not null check(namespace ~ '^[a-z0-9-]{1,40}$'),
 canonical_payload text not null check(operations.valid_notification_snapshot(canonical_payload) is true),
 snapshot_digest text not null check(snapshot_digest ~ '^[a-f0-9]{64}$'),
 provider_key text not null unique,
 created_at timestamptz not null default now(),
 unique(outbox_id,snapshot_digest)
);
-- convert_to is STABLE on PostgreSQL 17, so it cannot be wrapped in a stored
-- generated expression or falsely declared IMMUTABLE. Derive on INSERT instead.
create function operations.derive_notification_snapshot() returns trigger
language plpgsql security invoker set search_path='' as $$
declare d text; k text;
begin
 d:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(new.canonical_payload,'UTF8')),'hex');
 k:=new.namespace||':'||new.outbox_id::text;
 if (new.snapshot_digest is not null and new.snapshot_digest<>d) or
 (new.provider_key is not null and new.provider_key<>k)
 then raise exception using errcode='22023',message='Invalid notification identity'; end if;
 new.snapshot_digest:=d;new.provider_key:=k;return new;
end $$;
revoke all on function operations.derive_notification_snapshot() from public,anon,authenticated,service_role,ops_ingestion_api,ops_notification_api;
create trigger snapshot_derive before insert on operations.notification_snapshots for each row execute function operations.derive_notification_snapshot();
-- canonical_payload contains ONE immutable notification payload, not an event log.
-- Trusted future writer must serialize JS {destination,templateVersion,text} in
-- that exact order. SQL hashes actual UTF-8 bytes, not jsonb's reordered encoding.
create table operations.notification_attempts (
 outbox_id uuid not null,
 attempt integer not null check(attempt between 1 and 10),
 lease_fingerprint text not null check(lease_fingerprint ~ '^[a-f0-9]{64}$'),
 snapshot_digest text not null,
 started_at timestamptz not null default now(),
 primary key(outbox_id,attempt),
 unique(outbox_id,lease_fingerprint),
 foreign key(outbox_id,snapshot_digest) references operations.notification_snapshots(outbox_id,snapshot_digest) on delete restrict
);
create table operations.notification_observations (
 outbox_id uuid not null, attempt integer not null,
 provider_state text not null check(provider_state in ('accepted','delivered','pending','failed','unknown','absent','rejected','rate-limited','retryable')),
 provider_message_id text check(provider_message_id is null or length(provider_message_id) between 1 and 200),
 observed_at timestamptz not null default now(),
 primary key(outbox_id,attempt,provider_state),
 foreign key(outbox_id,attempt) references operations.notification_attempts(outbox_id,attempt) on delete restrict,
 check((provider_state in ('accepted','delivered','pending','failed')) = (provider_message_id is not null))
);
-- Quarantine is an operational hold, not a second queue/delivery state machine.
-- Future scoped claim MUST exclude held rows; current claim does not, so no
-- activation/binding is permitted until its separately reviewed replacement.
create table operations.notification_holds (
 outbox_id uuid primary key references operations.notification_outbox(id) on delete restrict,
 reason text not null check(reason in ('provider-unknown','exhausted-unknown','routing-unresolved')),
 created_at timestamptz not null default now()
);

create function operations.notification_append_only() returns trigger
language plpgsql security invoker set search_path='' as $$
begin raise exception using errcode='55000',message='Notification record is immutable'; end $$;
revoke all on function operations.notification_append_only() from public,anon,authenticated,service_role,ops_ingestion_api,ops_notification_api;
create trigger snapshot_immutable before update or delete on operations.notification_snapshots for each row execute function operations.notification_append_only();
create trigger attempt_immutable before update or delete on operations.notification_attempts for each row execute function operations.notification_append_only();
create trigger observation_immutable before update or delete on operations.notification_observations for each row execute function operations.notification_append_only();
-- Holds have no application write access. Release/retention requires an approved
-- operator capability and audit design; no deletion/cleanup capability is invented.

alter table operations.notification_snapshots enable row level security;
alter table operations.notification_snapshots force row level security;
alter table operations.notification_attempts enable row level security;
alter table operations.notification_attempts force row level security;
alter table operations.notification_observations enable row level security;
alter table operations.notification_observations force row level security;
alter table operations.notification_holds enable row level security;
alter table operations.notification_holds force row level security;
revoke all on operations.notification_snapshots,operations.notification_attempts,operations.notification_observations,operations.notification_holds
 from public,anon,authenticated,service_role,ops_ingestion_api,ops_notification_api,ops_ingest_executor,ops_rate_executor,ops_notification_executor,ops_audit_executor;
-- No new application grants or permissive RLS policies. Existing outbox state,
-- leases, retry counters/functions, receipts and staff authorization are unchanged.
insert into operations.migration_versions(version,name) values(5,'notification-persistence');
commit;
