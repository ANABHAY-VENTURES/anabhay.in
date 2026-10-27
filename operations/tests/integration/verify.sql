\set ON_ERROR_STOP on
begin;
DO $$ DECLARE t record; r text; f record; BEGIN
 IF (select array_agg(version order by version) from operations.migration_versions) IS DISTINCT FROM ARRAY[1,2,3,4] THEN RAISE EXCEPTION 'Ledger mismatch'; END IF;
 FOR t IN select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='operations' and c.relkind='r' LOOP
  FOREACH r IN ARRAY ARRAY['anon','service_role','ops_ingestion_api','ops_notification_api'] LOOP
   IF has_table_privilege(r,t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(r,t.oid,'SELECT,INSERT,UPDATE,REFERENCES') THEN RAISE EXCEPTION 'Unexpected table access: %',r; END IF;
  END LOOP;
 END LOOP;
 FOR t IN select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='operations' and c.relkind='r' LOOP
  FOR r IN select rolname from pg_roles where not rolsuper and rolname not like 'pg_%' and rolname not in ('postgres','authenticated','ops_ingest_executor','ops_rate_executor','ops_notification_executor','ops_audit_executor') LOOP
   IF has_table_privilege(r,t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(r,t.oid,'SELECT,INSERT,UPDATE,REFERENCES') THEN RAISE EXCEPTION 'Unexpected ordinary role table access: %',r; END IF;
  END LOOP;
 END LOOP;
 IF EXISTS(select 1 from pg_auth_members m join pg_roles child on child.oid=m.member join pg_roles parent on parent.oid=m.roleid where child.rolname like 'ops_%') THEN RAISE EXCEPTION 'Capability role unexpectedly inherits another role'; END IF;
 FOR r IN select rolname from pg_roles where rolname like 'ops_%' LOOP
  IF (select rolcanlogin or rolbypassrls or rolsuper or rolcreaterole or rolcreatedb from pg_roles where rolname=r) OR has_schema_privilege(r,'operations','CREATE') THEN RAISE EXCEPTION 'Unsafe role: %',r; END IF;
 END LOOP;
 IF has_function_privilege('authenticated','operations.ingest_enquiry(uuid,text,jsonb)','EXECUTE') OR has_function_privilege('ops_notification_api','operations.ingest_enquiry(uuid,text,jsonb)','EXECUTE') OR has_function_privilege('ops_ingestion_api','operations.accept_notification(uuid,uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'Capability separation failed'; END IF;
 -- Every actual role: unexpected function access must be reviewed, not ignored.
 FOR f IN select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='operations' and p.proname<>'record_lead_note' LOOP
  FOR r IN select rolname from pg_roles where not rolsuper and rolname not in ('postgres','ops_ingest_executor','ops_rate_executor','ops_notification_executor','ops_audit_executor','ops_ingestion_api','ops_notification_api') LOOP
   IF has_function_privilege(r,f.oid,'EXECUTE') THEN RAISE EXCEPTION 'Unexpected function EXECUTE: % %',r,f.proname; END IF;
  END LOOP;
 END LOOP;
END $$;
insert into auth.users select ('00000000-0000-4000-8000-00000000000'||x)::uuid from generate_series(1,6) x;
insert into operations.employees(id,display_name,role,state,assignment_eligible) values
('00000000-0000-4000-8000-000000000001','Synthetic Owner','owner','active',true),
('00000000-0000-4000-8000-000000000002','Synthetic Manager','manager','active',true),
('00000000-0000-4000-8000-000000000003','Synthetic A','member','active',true),
('00000000-0000-4000-8000-000000000004','Synthetic B','member','active',true),
('00000000-0000-4000-8000-000000000005','Synthetic Inactive','member','suspended',true);
insert into operations.teams(id,name,active) values
('10000000-0000-4000-8000-000000000001','Synthetic Active',true),
('10000000-0000-4000-8000-000000000002','Synthetic Inactive',false);
insert into operations.team_memberships select '10000000-0000-4000-8000-000000000001',id from operations.employees;
insert into operations.leads(id,name,email,source,project_type,message,preferred_contact,team_id,assigned_to)
select ('20000000-0000-4000-8000-00000000000'||x)::uuid,'Synthetic QA','qa@example.invalid','manual','other','synthetic test enquiry','email',
case when x=2 then '10000000-0000-4000-8000-000000000002'::uuid else '10000000-0000-4000-8000-000000000001'::uuid end,
case when x<3 then '00000000-0000-4000-8000-000000000003'::uuid else null end from generate_series(1,3) x;
insert into operations.lead_assignments(lead_id,employee_id,actor_id) values('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001');
insert into operations.lead_activities(lead_id,actor_id,kind,body,visibility) values
('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','note','synthetic earlier owner note','assigned'),
('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','note','synthetic own shared note','assigned'),
('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','note','synthetic manager-only note','managers');
set local role anon;
DO $$ BEGIN
 BEGIN perform operations.ingest_enquiry(null,null,null); RAISE EXCEPTION 'Anonymous ingestion allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
DO $$ BEGIN
 IF (select count(*) from operations.leads)<>1 THEN RAISE EXCEPTION 'Member scope failed'; END IF;
 IF (select count(*) from operations.lead_assignments)<>0 THEN RAISE EXCEPTION 'Member history exposed'; END IF;
 IF (select count(*) from operations.lead_activities)<>1 THEN RAISE EXCEPTION 'Earlier/manager notes exposed to member'; END IF;
 perform operations.record_lead_note('20000000-0000-4000-8000-000000000001','synthetic note');
 BEGIN
  insert into operations.lead_activities(lead_id,actor_id,kind,body,visibility) values('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','note','forged actor','assigned');
  RAISE EXCEPTION 'Actor spoof allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  update operations.employees set role='owner'; RAISE EXCEPTION 'Self grant allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
DO $$ BEGIN IF (select count(*) from operations.leads)<>2 OR (select count(*) from operations.lead_assignments)<>1 OR (select count(*) from operations.lead_activities)<>4 THEN RAISE EXCEPTION 'Manager scope failed'; END IF; END $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
DO $$ BEGIN IF exists(select 1 from operations.leads) OR exists(select 1 from operations.lead_activities) THEN RAISE EXCEPTION 'Other member exposed'; END IF; END $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
DO $$ BEGIN IF exists(select 1 from operations.leads) THEN RAISE EXCEPTION 'Inactive exposed'; END IF; END $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
DO $$ BEGIN IF exists(select 1 from operations.leads) THEN RAISE EXCEPTION 'Nonstaff exposed'; END IF; END $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
DO $$ BEGIN IF (select count(*) from operations.leads)<>3 THEN RAISE EXCEPTION 'Owner scope failed'; END IF; END $$;
reset role;
DO $$ BEGIN
 BEGIN delete from auth.users where id='00000000-0000-4000-8000-000000000003'; RAISE EXCEPTION 'Unexpected cascading deletion'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;
DO $$ BEGIN IF (select count(*) from operations.audit_events where action='activity')<>4 THEN RAISE EXCEPTION 'Atomic note audit failed'; END IF; END $$;
set local role ops_ingestion_api;
DO $$ DECLARE i integer; BEGIN
 FOR i IN 1..5 LOOP IF NOT operations.consume_enquiry_limit(repeat('a',64)) THEN RAISE EXCEPTION 'Unexpected rate denial'; END IF; END LOOP;
 IF operations.consume_enquiry_limit(repeat('a',64)) THEN RAISE EXCEPTION 'Rate limit bypass'; END IF;
END $$;
reset role;
-- Fail at the THIRD insert, verify the first two inserts roll back together.
create function operations.synthetic_fail_queue() returns trigger language plpgsql as $$ BEGIN RAISE EXCEPTION 'synthetic queue failure'; END $$;
create trigger synthetic_queue_failure before insert on operations.notification_outbox for each row execute function operations.synthetic_fail_queue();
set local role ops_ingestion_api;
DO $$ BEGIN
 BEGIN
 perform operations.ingest_enquiry('30000000-0000-4000-8000-000000000001',repeat('a',64),'{"schemaVersion":1,"fullName":"Synthetic QA","workEmail":"qa@example.invalid","phone":null,"organisation":null,"projectType":"other","description":"synthetic test enquiry","preferredContactMethod":"email","consent":true,"consentVersion":"enquiry-v1","source":"company-website"}');
 RAISE EXCEPTION 'Expected queue failure';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'synthetic queue failure' THEN RAISE; END IF; END;
END $$;
reset role;
DO $$ BEGIN IF (select count(*) from operations.leads)<>3 OR exists(select 1 from operations.website_enquiries) OR exists(select 1 from operations.notification_outbox) THEN RAISE EXCEPTION 'Partial ingestion persisted'; END IF; END $$;
rollback;
select 'PASS: synthetic grants, RLS, actor denial, rate threshold, audit and rollback';
