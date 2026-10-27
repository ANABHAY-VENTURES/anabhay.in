-- Synthetic fixture administration only; never an operator provisioning recipe.
insert into operations.teams(id,name) values('80000000-0000-4000-8000-000000000001','Synthetic release');
insert into auth.users(id) values('80000000-0000-4000-8000-000000000002'),('80000000-0000-4000-8000-000000000003');
insert into operations.employees(id,display_name,role,state) values
 ('80000000-0000-4000-8000-000000000002','Synthetic Manager','manager','active'),
 ('80000000-0000-4000-8000-000000000003','Synthetic Member','member','active');
insert into operations.team_memberships values('80000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000002'),('80000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000003');
DO $$ declare r jsonb; o uuid; begin
 r:=operations.ingest_enquiry('80000000-0000-4000-8000-000000000004',repeat('a',64),'{"schemaVersion":1,"fullName":"Synthetic Release","workEmail":"qa@example.invalid","phone":null,"organisation":null,"projectType":"other","description":"synthetic release enquiry","preferredContactMethod":"email","consent":true,"consentVersion":"enquiry-v1","source":"company-website"}'::jsonb);
 update operations.leads set team_id='80000000-0000-4000-8000-000000000001' where id=(select lead_id from operations.website_enquiries where id=(r->>'enquiryId')::uuid);
 select id into strict o from operations.notification_outbox where enquiry_id=(r->>'enquiryId')::uuid;
 insert into operations.notification_snapshots(outbox_id,team_id,namespace,canonical_payload) values(o,'80000000-0000-4000-8000-000000000001','synthetic','{"destination":"qa@example.invalid","templateVersion":"v1","text":"synthetic"}');
 insert into operations.notification_holds(outbox_id,reason) values(o,'provider-unknown');
 perform set_config('test.release_job',o::text,false);
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000002',false);
DO $$ declare o uuid:=current_setting('test.release_job')::uuid; q uuid:='80000000-0000-4000-8000-000000000005'; cp integer; begin
 for cp in select unnest(array[9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279]) loop
  begin perform operations.release_notification_hold(o,q,chr(cp)); raise exception 'Whitespace reason accepted'; exception when sqlstate '22023' then null; end;
 end loop;
 begin perform operations.release_notification_hold(o,q,repeat(chr(128512),501)); raise exception 'Oversized reason accepted'; exception when sqlstate '22023' then null; end;
 begin perform operations.release_notification_hold(o,q,null); raise exception 'NULL reason accepted'; exception when sqlstate '22023' then null; end;
 begin perform operations.release_notification_hold(o,q,'   '); raise exception 'Blank reason accepted'; exception when sqlstate '22023' then null; end;
 begin perform operations.release_notification_hold(o,q); raise exception 'Old API accessible'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000003',false);
 begin perform operations.release_notification_hold(o,q,'Synthetic review'); raise exception 'Member authorized'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000002',false);
 perform operations.release_notification_hold(o,q,chr(160)||chr(65279)||' Synthetic review '||chr(12288));
 perform operations.release_notification_hold(o,q,'Synthetic review');
 begin perform operations.release_notification_hold(o,q,'Changed'); exception when sqlstate 'P0001' then
  if SQLERRM<>'Invalid release replay' then raise; end if;
  return;
 end;
 raise exception 'Conflicting replay accepted';
end $$;
reset role;
DO $$ declare o uuid:=current_setting('test.release_job')::uuid; begin
 if (select count(*) from operations.notification_release_events where outbox_id=o and reason='Synthetic review')<>1 then raise exception 'Audit count mismatch'; end if;
 if exists(select 1 from operations.notification_holds where outbox_id=o) then raise exception 'Hold retained'; end if;
 begin update operations.notification_release_events set reason='Changed' where outbox_id=o; raise exception 'Audit mutable'; exception when sqlstate '55000' then null; end;
 begin delete from operations.notification_release_events where outbox_id=o; raise exception 'Audit deletable'; exception when sqlstate '55000' then null; end;
 begin insert into operations.notification_release_events select * from operations.notification_release_events where outbox_id=o; raise exception 'Duplicate audit'; exception when unique_violation then null; end;
end $$;

insert into operations.notification_holds(outbox_id,reason) values(current_setting('test.release_job')::uuid,'provider-unknown');
set role authenticated;
DO $$ begin perform operations.release_notification_hold(current_setting('test.release_job')::uuid,'80000000-0000-4000-8000-000000000006',repeat(chr(128512),500)); end $$;
reset role;
DO $$ begin if (select length(reason) from operations.notification_release_events where request_id='80000000-0000-4000-8000-000000000006')<>500 then raise exception 'Code-point boundary mismatch'; end if; end $$;
