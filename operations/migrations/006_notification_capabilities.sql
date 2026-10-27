-- LOCAL DRAFT. No hosted approval/activation. Requires unchanged versions 1–5.
-- Dedicated non-human DB LOGIN -> principal; no automatic identity/team enrollment.
begin;
lock table operations.migration_versions in exclusive mode;
DO $$ BEGIN IF current_user<>'postgres' OR
 (select array_agg(version order by version) from operations.migration_versions) IS DISTINCT FROM ARRAY[1,2,3,4,5]
 THEN RAISE EXCEPTION 'Unexpected notification capability baseline'; END IF; END $$;
create role ops_notification_bound_executor nologin noinherit nobypassrls;
grant ops_notification_bound_executor to postgres;
grant usage on schema operations to ops_notification_bound_executor;
create table operations.notification_workers (
 id uuid primary key default gen_random_uuid(), database_role_oid oid not null unique,
 active boolean not null default false, created_at timestamptz not null default now()
);
create table operations.notification_worker_teams (
 worker_id uuid references operations.notification_workers(id) on delete restrict,
 team_id uuid references operations.teams(id) on delete restrict, primary key(worker_id,team_id)
);
alter table operations.notification_outbox add column worker_id uuid references operations.notification_workers(id) on delete restrict;
create table operations.notification_actions (
 outbox_id uuid not null, attempt integer not null,
 action text not null check(action in ('accept','retry','hold')),
 worker_id uuid not null references operations.notification_workers(id) on delete restrict,
 lease_fingerprint text not null check(lease_fingerprint ~ '^[a-f0-9]{64}$'),
 provider_message_id text, error_code text,
 created_at timestamptz not null default now(), primary key(outbox_id,attempt,action),
 foreign key(outbox_id,attempt) references operations.notification_attempts(outbox_id,attempt) on delete restrict,
 check((action='accept')=(provider_message_id is not null)),
 check((action='accept')=(error_code is null)),
 check(provider_message_id is null or length(provider_message_id) between 1 and 200),
 check((action='accept' and error_code is null) or
       (action='retry' and error_code in ('provider-rejected','unavailable')) or
       (action='hold' and error_code='provider-unknown'))
);
create table operations.notification_release_events (
 request_id uuid primary key, outbox_id uuid not null references operations.notification_outbox(id) on delete restrict,
 actor_id uuid not null references operations.employees(id) on delete restrict,
 hold_created_at timestamptz not null, released_at timestamptz not null default now()
);
create trigger action_immutable before update or delete on operations.notification_actions for each row execute function operations.notification_append_only();
create trigger release_immutable before update or delete on operations.notification_release_events for each row execute function operations.notification_append_only();
alter table operations.notification_workers enable row level security;
alter table operations.notification_workers force row level security;
alter table operations.notification_worker_teams enable row level security;
alter table operations.notification_worker_teams force row level security;
alter table operations.notification_actions enable row level security;
alter table operations.notification_actions force row level security;
alter table operations.notification_release_events enable row level security;
alter table operations.notification_release_events force row level security;
revoke all on operations.notification_workers,operations.notification_worker_teams,operations.notification_actions,operations.notification_release_events
 from public,anon,authenticated,service_role,ops_ingestion_api,ops_notification_api;

-- Only private fixed-function owner. API LOGINs have no executor membership,
-- direct table privileges, ownership, CREATE or RLS bypass.
grant select on operations.notification_workers,operations.notification_worker_teams,operations.notification_outbox,
 operations.notification_snapshots,operations.notification_attempts,operations.notification_observations,
 operations.notification_holds,operations.notification_actions,operations.notification_release_events to ops_notification_bound_executor;
grant select(id,active) on operations.teams to ops_notification_bound_executor;
grant select(id,team_id) on operations.leads to ops_notification_bound_executor;
grant select(id,lead_id) on operations.website_enquiries to ops_notification_bound_executor;
grant select(id,role,state) on operations.employees to ops_notification_bound_executor;
grant select(team_id,employee_id) on operations.team_memberships to ops_notification_bound_executor;
grant update(state,attempts,next_attempt_at,lease_until,lease_token,provider_message_id,error_code,accepted_at,worker_id)
 on operations.notification_outbox to ops_notification_bound_executor;
grant insert on operations.notification_attempts,operations.notification_observations,operations.notification_holds,
 operations.notification_actions,operations.notification_release_events to ops_notification_bound_executor;
grant delete on operations.notification_holds to ops_notification_bound_executor;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['notification_workers','notification_worker_teams','notification_outbox','notification_snapshots',
 'notification_attempts','notification_observations','notification_holds','notification_actions','notification_release_events',
 'teams','leads','website_enquiries','employees','team_memberships'] LOOP
  EXECUTE format('create policy bound_read on operations.%I for select to ops_notification_bound_executor using(true)',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['notification_attempts','notification_observations','notification_holds','notification_actions','notification_release_events'] LOOP
  EXECUTE format('create policy bound_insert on operations.%I for insert to ops_notification_bound_executor with check(true)',t);
 END LOOP;
END $$;
create policy bound_update on operations.notification_outbox for update to ops_notification_bound_executor using(true) with check(true);
create policy bound_hold_delete on operations.notification_holds for delete to ops_notification_bound_executor using(true);

create function operations.bound_worker() returns uuid language plpgsql security invoker set search_path='' as $$
declare w uuid;
begin
 select x.id into w from operations.notification_workers x join pg_catalog.pg_roles r on r.oid=x.database_role_oid
 where r.rolname=session_user and r.rolcanlogin and not r.rolsuper and not r.rolbypassrls and not r.rolcreaterole and not r.rolcreatedb and x.active;
 if w is null then raise exception using errcode='42501',message='Notification access denied'; end if;return w;
end $$;
create function operations.bound_scope(p_id uuid,p_enquiry uuid) returns operations.notification_outbox
language plpgsql security invoker set search_path='' as $$
declare w uuid:=operations.bound_worker(); o operations.notification_outbox;
begin
 select q.* into o from operations.notification_outbox q
 join operations.notification_snapshots s on s.outbox_id=q.id
 join operations.website_enquiries e on e.id=q.enquiry_id
 join operations.leads l on l.id=e.lead_id and l.team_id=s.team_id
 join operations.teams t on t.id=s.team_id and t.active
 join operations.notification_worker_teams wt on wt.team_id=t.id and wt.worker_id=w
 where q.id=p_id and q.enquiry_id=p_enquiry and s.team_id is not null for update of q;
 if not found then raise exception using errcode='42501',message='Notification access denied'; end if;return o;
end $$;
create function operations.validate_bound_job(p_job jsonb) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if jsonb_typeof(p_job) is distinct from 'object' then raise exception 'Invalid notification job'; end if;
 if (select count(*) from jsonb_object_keys(p_job))<>4 or not p_job ?& array['id','enquiryId','leaseToken','attempt'] or
 jsonb_typeof(p_job->'id')<>'string' or jsonb_typeof(p_job->'enquiryId')<>'string' or jsonb_typeof(p_job->'leaseToken')<>'string' or jsonb_typeof(p_job->'attempt')<>'number'
 then raise exception 'Invalid notification job'; end if;
 perform (p_job->>'id')::uuid,(p_job->>'enquiryId')::uuid,(p_job->>'leaseToken')::uuid;
 if (p_job->>'attempt')::integer not between 1 and 10 then raise exception 'Invalid notification job'; end if;
end $$;
create function operations.bound_lease(p_job jsonb) returns operations.notification_outbox
language plpgsql security invoker set search_path='' as $$
declare o operations.notification_outbox;
begin
 perform operations.validate_bound_job(p_job);
 o:=operations.bound_scope((p_job->>'id')::uuid,(p_job->>'enquiryId')::uuid);
 if o.state<>'processing' or o.worker_id is distinct from operations.bound_worker() or
 o.lease_token is distinct from (p_job->>'leaseToken')::uuid or o.attempts is distinct from (p_job->>'attempt')::integer or
 o.lease_until<=clock_timestamp() or exists(select 1 from operations.notification_holds h where h.outbox_id=o.id)
 then raise exception using errcode='P0001',message='Invalid notification lease'; end if;return o;
end $$;
create function operations.claim_bound_notification() returns jsonb
language plpgsql security definer set search_path='' as $$
declare w uuid:=operations.bound_worker(); o operations.notification_outbox; token uuid:=gen_random_uuid();
begin
 -- Bounded scoped cleanup; failed means processing exhausted, not external
 -- nonacceptance. Preserve an operational hold for manager review, never attempt 11.
 for o in select q.* from operations.notification_outbox q join operations.notification_snapshots s on s.outbox_id=q.id
 join operations.website_enquiries e on e.id=q.enquiry_id join operations.leads l on l.id=e.lead_id and l.team_id=s.team_id
 join operations.teams t on t.id=s.team_id and t.active join operations.notification_worker_teams wt on wt.team_id=t.id and wt.worker_id=w
 where s.team_id is not null and q.attempts=10 and q.state='processing' and q.lease_until<=clock_timestamp()
 limit 16 for update of q skip locked loop
  insert into operations.notification_holds(outbox_id,reason) values(o.id,'exhausted-unknown') on conflict do nothing;
  update operations.notification_outbox set state='failed',lease_token=null,lease_until=null,error_code='timeout' where id=o.id;
 end loop;
 select q.* into o from operations.notification_outbox q join operations.notification_snapshots s on s.outbox_id=q.id
 join operations.website_enquiries e on e.id=q.enquiry_id join operations.leads l on l.id=e.lead_id and l.team_id=s.team_id
 join operations.teams t on t.id=s.team_id and t.active join operations.notification_worker_teams wt on wt.team_id=t.id and wt.worker_id=w
 where s.team_id is not null and q.attempts<10 and not exists(select 1 from operations.notification_holds h where h.outbox_id=q.id)
 and ((q.state='queued' and q.next_attempt_at<=clock_timestamp()) or (q.state='processing' and q.lease_until<=clock_timestamp()))
 order by q.next_attempt_at,q.id limit 1 for update of q skip locked;
 if not found then return null; end if;
 update operations.notification_outbox set state='processing',attempts=attempts+1,lease_until=clock_timestamp()+interval '2 minutes',lease_token=token,worker_id=w,error_code=null where id=o.id;
 return jsonb_build_object('id',o.id,'enquiryId',o.enquiry_id,'leaseToken',token,'attempt',o.attempts+1);
end $$;
create function operations.read_bound_notification(p_job jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o operations.notification_outbox:=operations.bound_lease(p_job); s operations.notification_snapshots; known jsonb;
begin
 select * into strict s from operations.notification_snapshots where outbox_id=o.id;
 select jsonb_build_object('status',x.provider_state,'messageId',x.provider_message_id) into known
 from operations.notification_observations x where x.outbox_id=o.id and x.provider_message_id is not null
 order by x.observed_at desc,x.attempt desc limit 1;
 return jsonb_build_object('snapshot',s.canonical_payload::jsonb,'digest',s.snapshot_digest,
 'leaseRemainingMs',floor(extract(epoch from(o.lease_until-clock_timestamp()))*1000),'knownAcceptance',known);
end $$;
create function operations.record_bound_attempt(p_job jsonb,p_key text,p_digest text) returns void
language plpgsql security definer set search_path='' as $$
declare o operations.notification_outbox:=operations.bound_lease(p_job); s operations.notification_snapshots; f text;
begin
 select * into strict s from operations.notification_snapshots where outbox_id=o.id;
 if p_key is distinct from s.provider_key or p_digest is distinct from s.snapshot_digest then raise exception 'Invalid notification identity'; end if;
 f:=encode(sha256(convert_to(o.lease_token::text,'UTF8')),'hex');
 if exists(select 1 from operations.notification_attempts a where a.outbox_id=o.id and a.attempt=o.attempts and (a.lease_fingerprint<>f or a.snapshot_digest<>p_digest)) then raise exception 'Invalid notification attempt'; end if;
 insert into operations.notification_attempts(outbox_id,attempt,lease_fingerprint,snapshot_digest) values(o.id,o.attempts,f,p_digest) on conflict(outbox_id,attempt) do nothing;
end $$;
create function operations.observe_bound_notification(p_job jsonb,p_key text,p_digest text,p_state text,p_receipt text) returns void
language plpgsql security definer set search_path='' as $$
declare o operations.notification_outbox:=operations.bound_lease(p_job); s operations.notification_snapshots; f text;
begin
 select * into strict s from operations.notification_snapshots where outbox_id=o.id;
 f:=encode(sha256(convert_to(o.lease_token::text,'UTF8')),'hex');
 if p_key is distinct from s.provider_key or p_digest is distinct from s.snapshot_digest or not exists(select 1 from operations.notification_attempts a where a.outbox_id=o.id and a.attempt=o.attempts and a.lease_fingerprint=f) then raise exception 'Invalid notification observation'; end if;
 if p_receipt is not null and exists(select 1 from operations.notification_observations x where x.outbox_id=o.id and x.provider_message_id is not null and x.provider_message_id<>p_receipt) then raise exception 'Conflicting provider receipt'; end if;
 if exists(select 1 from operations.notification_observations x where x.outbox_id=o.id and x.attempt=o.attempts and x.provider_state=p_state and x.provider_message_id is distinct from p_receipt) then raise exception 'Conflicting provider receipt'; end if;
 insert into operations.notification_observations(outbox_id,attempt,provider_state,provider_message_id) values(o.id,o.attempts,p_state,p_receipt) on conflict(outbox_id,attempt,provider_state) do nothing;
end $$;
create function operations.finish_bound_notification(p_job jsonb,p_action text,p_value text) returns void
language plpgsql security definer set search_path='' as $$
declare o operations.notification_outbox; a operations.notification_actions; w uuid:=operations.bound_worker(); f text;
begin
 perform operations.validate_bound_job(p_job);
 if p_action is null or p_action not in ('accept','retry','hold') then raise exception 'Invalid notification action'; end if;
 o:=operations.bound_scope((p_job->>'id')::uuid,(p_job->>'enquiryId')::uuid);
 f:=encode(sha256(convert_to(((p_job->>'leaseToken')::uuid)::text,'UTF8')),'hex');
 select * into a from operations.notification_actions where outbox_id=o.id and attempt=(p_job->>'attempt')::integer and action=p_action;
 if found then
  if a.worker_id=w and a.lease_fingerprint=f and o.attempts=a.attempt and o.worker_id=w and
   ((p_action='accept' and a.provider_message_id is not distinct from p_value) or (p_action<>'accept' and a.error_code is not distinct from p_value)) then return; end if;
  raise exception 'Invalid notification replay';
 end if;
 o:=operations.bound_lease(p_job);
 if not exists(select 1 from operations.notification_attempts x where x.outbox_id=o.id and x.attempt=o.attempts and x.lease_fingerprint=f) then raise exception 'Notification attempt missing'; end if;
 if p_action='accept' then
  if p_value is null or not exists(select 1 from operations.notification_observations x where x.outbox_id=o.id and x.attempt=o.attempts and x.provider_state in ('accepted','delivered','pending','failed') and x.provider_message_id=p_value) then raise exception 'Provider acceptance unconfirmed'; end if;
  update operations.notification_outbox set state='accepted',provider_message_id=p_value,accepted_at=clock_timestamp(),lease_token=null,lease_until=null where id=o.id;
 elsif p_action='retry' then
  if exists(select 1 from operations.notification_observations x where x.outbox_id=o.id and x.provider_message_id is not null) then raise exception 'Prior provider acceptance forbids retry'; end if;
  if p_value not in ('provider-rejected','unavailable') or p_value is null or not exists(select 1 from operations.notification_observations x where x.outbox_id=o.id and x.attempt=o.attempts and ((p_value='provider-rejected' and x.provider_state='rejected') or (p_value='unavailable' and x.provider_state in ('rate-limited','retryable')))) then raise exception 'Retry outcome unconfirmed'; end if;
  update operations.notification_outbox set state=case when attempts=10 then 'failed' else 'queued' end,next_attempt_at=clock_timestamp()+interval '5 minutes',error_code=p_value,lease_token=null,lease_until=null where id=o.id;
 else
  if p_value is distinct from 'provider-unknown' then raise exception 'Invalid quarantine'; end if;
  insert into operations.notification_observations(outbox_id,attempt,provider_state) values(o.id,o.attempts,'unknown') on conflict do nothing;
  insert into operations.notification_holds(outbox_id,reason) values(o.id,'provider-unknown') on conflict do nothing;
  update operations.notification_outbox set state='queued',lease_token=null,lease_until=null where id=o.id;
 end if;
 insert into operations.notification_actions(outbox_id,attempt,action,worker_id,lease_fingerprint,provider_message_id,error_code)
 values(o.id,o.attempts,p_action,w,f,case when p_action='accept' then p_value end,case when p_action<>'accept' then p_value end);
end $$;
create function operations.bound_notification_status(p_id uuid,p_enquiry uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o operations.notification_outbox:=operations.bound_scope(p_id,p_enquiry);
begin return jsonb_build_object('state',o.state,'attempt',o.attempts,'providerMessageId',o.provider_message_id,
 'held',exists(select 1 from operations.notification_holds h where h.outbox_id=o.id),
 'knownAcceptance',(select jsonb_build_object('status',x.provider_state,'messageId',x.provider_message_id) from operations.notification_observations x where x.outbox_id=o.id and x.provider_message_id is not null order by x.observed_at desc,x.attempt desc limit 1)); end $$;

-- Definition-time-bound Auth reference, no auth schema USAGE or users-table grant.
create function operations.notification_actor() returns uuid language sql security invoker set search_path='' return auth.uid();
grant execute on function auth.uid() to ops_notification_bound_executor;
create function operations.release_notification_hold(p_id uuid,p_request uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=operations.notification_actor(); o operations.notification_outbox; h operations.notification_holds; event operations.notification_release_events;
begin
 if actor is null or p_request is null then raise exception using errcode='42501',message='Release access denied'; end if;
 select q.* into o from operations.notification_outbox q join operations.notification_snapshots s on s.outbox_id=q.id
 join operations.website_enquiries e on e.id=q.enquiry_id join operations.leads l on l.id=e.lead_id and l.team_id=s.team_id
 join operations.teams t on t.id=s.team_id and t.active join operations.team_memberships m on m.team_id=t.id and m.employee_id=actor
 join operations.employees staff on staff.id=actor and staff.state='active' and staff.role='manager'
 where q.id=p_id and s.team_id is not null for update of q;
 if not found then raise exception using errcode='42501',message='Release access denied'; end if;
 select * into event from operations.notification_release_events where request_id=p_request;
 if found then if event.outbox_id=p_id and event.actor_id=actor then return; end if;raise exception 'Invalid release replay'; end if;
 select * into strict h from operations.notification_holds where outbox_id=p_id;
 if o.state='processing' and o.lease_until>clock_timestamp() then raise exception 'Notification still leased'; end if;
 insert into operations.notification_release_events(request_id,outbox_id,actor_id,hold_created_at) values(p_request,p_id,actor,h.created_at);
 delete from operations.notification_holds where outbox_id=p_id;
 -- Never reset attempts or turn terminal accepted/failed into a new send.
end $$;

-- Private helper ownership/ACLs; no caller may supply or assume executor identity.
DO $$ DECLARE f record; BEGIN
 FOR f IN select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='operations' and p.proname in ('bound_worker','bound_scope','bound_lease','validate_bound_job','claim_bound_notification','read_bound_notification','record_bound_attempt','observe_bound_notification','finish_bound_notification','bound_notification_status','notification_actor','release_notification_hold') LOOP
  EXECUTE format('revoke all on function %s from public,anon,authenticated,service_role,ops_ingestion_api,ops_notification_api',f.signature);
 END LOOP;
END $$;
grant create on schema operations to ops_notification_bound_executor;
DO $$ DECLARE f record; BEGIN
 FOR f IN select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='operations' and p.proname in ('bound_worker','bound_scope','bound_lease','validate_bound_job','claim_bound_notification','read_bound_notification','record_bound_attempt','observe_bound_notification','finish_bound_notification','bound_notification_status','notification_actor','release_notification_hold') LOOP
  EXECUTE format('alter function %s owner to ops_notification_bound_executor',f.signature);
 END LOOP;
END $$;
revoke create on schema operations from ops_notification_bound_executor;
grant execute on function operations.claim_bound_notification(),operations.read_bound_notification(jsonb),operations.record_bound_attempt(jsonb,text,text),
 operations.observe_bound_notification(jsonb,text,text,text,text),operations.finish_bound_notification(jsonb,text,text),operations.bound_notification_status(uuid,uuid) to ops_notification_api;
grant execute on function operations.release_notification_hold(uuid,uuid) to authenticated;
-- Close all legacy global-claim/accept/retry paths for the worker API.
revoke execute on function operations.claim_notification(),operations.accept_notification(uuid,uuid,text),operations.retry_notification(uuid,uuid,text) from ops_notification_api;
insert into operations.migration_versions(version,name) values(6,'notification-capabilities');
commit;
