-- Whitespace: exact ECMAScript TrimString set; length counts Unicode code points.
-- LOCAL DRAFT: historical audit rows remain unchanged, including NULL reasons.
begin;
lock table operations.migration_versions in exclusive mode;
DO $$ BEGIN IF current_user<>'postgres' OR (select array_agg(version order by version) from operations.migration_versions) IS DISTINCT FROM ARRAY[1,2,3,4,5,6] THEN RAISE EXCEPTION 'Unexpected release reason baseline'; END IF; END $$;
alter table operations.notification_release_events add column reason text check(reason is null or (reason=btrim(reason,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') and length(reason) between 1 and 500));
create function operations.require_release_reason() returns trigger language plpgsql security invoker set search_path='' as $$
begin if new.reason is null or length(btrim(new.reason,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) not between 1 and 500 then raise exception using errcode='22023',message='Release reason required'; end if; return new; end $$;
revoke all on function operations.require_release_reason() from public,anon,authenticated,service_role,ops_ingestion_api,ops_notification_api;
create trigger release_reason_required before insert on operations.notification_release_events for each row execute function operations.require_release_reason();
-- No reasonless compatibility bypass; preserve old function for dependency safety.
revoke all on function operations.release_notification_hold(uuid,uuid) from public,anon,authenticated,service_role,ops_ingestion_api,ops_notification_api;
create function operations.release_notification_hold(p_id uuid,p_request uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=operations.notification_actor(); o operations.notification_outbox; h operations.notification_holds; event operations.notification_release_events;
begin
 if p_reason is null or length(btrim(p_reason,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) not between 1 and 500 then raise exception using errcode='22023',message='Release reason required'; end if;
 if actor is null or p_request is null then raise exception using errcode='42501',message='Release access denied'; end if;
 select q.* into o from operations.notification_outbox q join operations.notification_snapshots s on s.outbox_id=q.id
 join operations.website_enquiries e on e.id=q.enquiry_id join operations.leads l on l.id=e.lead_id and l.team_id=s.team_id
 join operations.teams t on t.id=s.team_id and t.active join operations.team_memberships m on m.team_id=t.id and m.employee_id=actor
 join operations.employees staff on staff.id=actor and staff.state='active' and staff.role='manager'
 where q.id=p_id and s.team_id is not null for update of q;
 if not found then raise exception using errcode='42501',message='Release access denied'; end if;
 select * into event from operations.notification_release_events where request_id=p_request;
 if found then if event.outbox_id=p_id and event.actor_id=actor and event.reason=btrim(p_reason,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') then return; end if;raise exception 'Invalid release replay'; end if;
 select * into strict h from operations.notification_holds where outbox_id=p_id;
 if o.state='processing' and o.lease_until>clock_timestamp() then raise exception 'Notification still leased'; end if;
 insert into operations.notification_release_events(request_id,outbox_id,actor_id,hold_created_at,reason) values(p_request,p_id,actor,h.created_at,btrim(p_reason,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'));
 delete from operations.notification_holds where outbox_id=p_id;
 -- Never reset attempts or turn terminal accepted/failed into a new send.
end $$;


revoke all on function operations.release_notification_hold(uuid,uuid,text) from public,anon,authenticated,service_role,ops_ingestion_api,ops_notification_api;
grant create on schema operations to ops_notification_bound_executor;
alter function operations.release_notification_hold(uuid,uuid,text) owner to ops_notification_bound_executor;
revoke create on schema operations from ops_notification_bound_executor;
grant execute on function operations.release_notification_hold(uuid,uuid,text) to authenticated;
insert into operations.migration_versions(version,name) values(7,'release-reason');
commit;
