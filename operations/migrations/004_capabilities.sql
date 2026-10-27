-- DRAFT / NOT EXECUTED. Human approval and isolated PostgreSQL tests required.
begin;
lock table operations.migration_versions in exclusive mode;
DO $$ BEGIN IF (select array_agg(version order by version) from operations.migration_versions) IS DISTINCT FROM ARRAY[1,2,3] THEN RAISE EXCEPTION 'Unexpected migration baseline'; END IF; END $$;

-- Fixed 4097-row upper bound. Slot zero is global, 1..4096 are identity buckets.
-- Collisions deny more requests; they never grant extra capacity.
create table operations.rate_buckets (
 slot integer primary key check(slot between 0 and 4096),
 window_start timestamptz not null, used integer not null check(used between 1 and 121)
);
alter table operations.rate_buckets enable row level security;
alter table operations.rate_buckets force row level security;
revoke all on operations.rate_buckets from public,anon,authenticated,service_role;
grant select,insert,update on operations.rate_buckets to ops_rate_executor;
create policy rate_read on operations.rate_buckets for select to ops_rate_executor using(true);
create policy rate_insert on operations.rate_buckets for insert to ops_rate_executor with check(true);
create policy rate_update on operations.rate_buckets for update to ops_rate_executor using(true) with check(true);
create function operations.consume_enquiry_limit(p_fingerprint text) returns boolean
language plpgsql security definer set search_path='' as $$
declare w timestamptz:=date_trunc('minute',clock_timestamp()); g integer; b integer; bucket integer;
begin
 if p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023',message='Invalid limit identity'; end if;
 bucket:=1+((hashtextextended(p_fingerprint,0) & 4095)::integer);
 -- Always lock global before bucket. Saturate rejected counters to bound values.
 insert into operations.rate_buckets values(0,w,1)
 on conflict(slot) do update set window_start=greatest(rate_buckets.window_start,excluded.window_start),
 used=case when rate_buckets.window_start<excluded.window_start then 1 else least(121,rate_buckets.used+1) end
 returning used into g;
 insert into operations.rate_buckets values(bucket,w,1)
 on conflict(slot) do update set window_start=greatest(rate_buckets.window_start,excluded.window_start),
 used=case when rate_buckets.window_start<excluded.window_start then 1 else least(121,rate_buckets.used+1) end
 returning used into b;
 return g<=120 and b<=5;
end $$;
revoke all on function operations.consume_enquiry_limit(text) from public,anon,authenticated,service_role,ops_notification_api;
grant create on schema operations to ops_rate_executor;
alter function operations.consume_enquiry_limit(text) owner to ops_rate_executor;
revoke create on schema operations from ops_rate_executor;
grant execute on function operations.consume_enquiry_limit(text) to ops_ingestion_api;

-- First staff mutation: own note only. No assignment/status/team/role mutation.
grant insert(lead_id,actor_id,kind,body,visibility) on operations.lead_activities to authenticated;
create policy own_note_insert on operations.lead_activities for insert to authenticated with check(
 actor_id=(select auth.uid()) and kind='note' and visibility='assigned' and
 exists(select 1 from operations.leads l where l.id=lead_id));
create function operations.record_lead_note(p_lead uuid,p_body text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare note_id uuid;
begin
 insert into operations.lead_activities(lead_id,actor_id,kind,body,visibility)
 values(p_lead,auth.uid(),'note',p_body,'assigned') returning id into note_id;
 return note_id;
end $$;
revoke all on function operations.record_lead_note(uuid,text) from public,anon,service_role;
grant execute on function operations.record_lead_note(uuid,text) to authenticated;
create role ops_audit_executor nologin noinherit nobypassrls;
grant ops_audit_executor to postgres;
grant usage on schema operations to ops_audit_executor;
grant insert(actor_id,action,entity_id) on operations.audit_events to ops_audit_executor;
create policy note_audit_insert on operations.audit_events for insert to ops_audit_executor with check(action='activity' and actor_id is not null);
create function operations.audit_note() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into operations.audit_events(actor_id,action,entity_id) values(new.actor_id,'activity',new.id);
 return new;
end $$;
revoke all on function operations.audit_note() from public,anon,authenticated,service_role;
grant create on schema operations to ops_audit_executor;
alter function operations.audit_note() owner to ops_audit_executor;
revoke create on schema operations from ops_audit_executor;
create trigger note_audit after insert on operations.lead_activities for each row execute function operations.audit_note();

-- Worker can access queue metadata only, through leases; no employee/admin grants.
grant select on operations.notification_outbox to ops_notification_executor;
grant update(state,attempts,next_attempt_at,lease_until,lease_token,provider_message_id,error_code,accepted_at) on operations.notification_outbox to ops_notification_executor;
create policy worker_read on operations.notification_outbox for select to ops_notification_executor using(true);
create policy worker_update on operations.notification_outbox for update to ops_notification_executor using(true) with check(true);
create function operations.claim_notification() returns jsonb
language plpgsql security definer set search_path='' as $$
declare job operations.notification_outbox%rowtype; token uuid:=gen_random_uuid();
begin
 update operations.notification_outbox set state='failed',lease_until=null,lease_token=null,error_code='timeout'
 where state='processing' and lease_until<=clock_timestamp() and attempts=10;
 select * into job from operations.notification_outbox
 where attempts<10 and ((state='queued' and next_attempt_at<=clock_timestamp()) or (state='processing' and lease_until<=clock_timestamp()))
 order by next_attempt_at,id limit 1 for update skip locked;
 if not found then return null; end if;
 update operations.notification_outbox set state='processing',attempts=attempts+1,lease_until=clock_timestamp()+interval '2 minutes',lease_token=token,error_code=null where id=job.id;
 return jsonb_build_object('id',job.id,'enquiryId',job.enquiry_id,'leaseToken',token,'attempt',job.attempts+1);
end $$;
create function operations.accept_notification(p_id uuid,p_token uuid,p_provider_id text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_provider_id is null or length(p_provider_id) not between 1 and 200 then raise exception 'Invalid provider receipt'; end if;
 update operations.notification_outbox set state='accepted',accepted_at=clock_timestamp(),provider_message_id=p_provider_id,lease_until=null,lease_token=null
 where id=p_id and state='processing' and lease_token=p_token and lease_until>clock_timestamp();
 if not found then raise exception 'Invalid notification lease'; end if;
end $$;
create function operations.retry_notification(p_id uuid,p_token uuid,p_error text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_error is null or p_error not in ('timeout','provider-rejected','unavailable') then raise exception 'Invalid notification outcome'; end if;
 update operations.notification_outbox set state=case when attempts=10 then 'failed' else 'queued' end,
 next_attempt_at=clock_timestamp()+interval '5 minutes',error_code=p_error,lease_until=null,lease_token=null
 where id=p_id and state='processing' and lease_token=p_token and lease_until>clock_timestamp();
 if not found then raise exception 'Invalid notification lease'; end if;
end $$;
revoke all on function operations.claim_notification(),operations.accept_notification(uuid,uuid,text),operations.retry_notification(uuid,uuid,text) from public,anon,authenticated,service_role,ops_ingestion_api;
grant create on schema operations to ops_notification_executor;
alter function operations.claim_notification() owner to ops_notification_executor;
alter function operations.accept_notification(uuid,uuid,text) owner to ops_notification_executor;
alter function operations.retry_notification(uuid,uuid,text) owner to ops_notification_executor;
revoke create on schema operations from ops_notification_executor;
grant execute on function operations.claim_notification(),operations.accept_notification(uuid,uuid,text),operations.retry_notification(uuid,uuid,text) to ops_notification_api;
insert into operations.migration_versions(version,name) values(4,'capabilities');
commit;

