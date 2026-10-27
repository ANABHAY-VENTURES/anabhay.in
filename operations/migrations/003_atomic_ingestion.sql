-- DRAFT / NOT EXECUTED. PostgreSQL execution and concurrency tests required.
-- Narrow non-login function owner; no auth schema access, membership or BYPASSRLS.
begin;
lock table operations.migration_versions in exclusive mode;
DO $$ BEGIN IF (select array_agg(version order by version) from operations.migration_versions) IS DISTINCT FROM ARRAY[1,2] THEN RAISE EXCEPTION 'Unexpected migration baseline'; END IF; END $$;
grant insert(name,email,phone,organisation,source,project_type,message,preferred_contact),select(id) on operations.leads to ops_ingest_executor;
grant insert(lead_id,idempotency_key,payload_hash,schema_version,consent_given,consent_version),select on operations.website_enquiries to ops_ingest_executor;
grant insert(enquiry_id) on operations.notification_outbox to ops_ingest_executor;
create policy ingestion_lead on operations.leads for insert to ops_ingest_executor with check(source='company-website' and assigned_to is null and team_id is null and status='new' and priority='normal' and converted_at is null and next_follow_up_at is null);
create policy ingestion_lead_receipt on operations.leads for select to ops_ingest_executor using(true);
create policy ingestion_enquiry on operations.website_enquiries for insert to ops_ingest_executor with check(true);
create policy ingestion_replay on operations.website_enquiries for select to ops_ingest_executor using(true);
create policy ingestion_queue on operations.notification_outbox for insert to ops_ingest_executor with check(state='queued' and attempts=0 and lease_until is null and lease_token is null and provider_message_id is null and accepted_at is null and error_code is null);
create function operations.ingest_enquiry(p_key uuid,p_hash text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 existing operations.website_enquiries%rowtype;
 lead_uuid uuid;
 enquiry_uuid uuid;
 item text;
begin
 if p_key is null or p_hash is null or p_hash !~ '^[0-9a-f]{64}$'
 or p_payload is null or jsonb_typeof(p_payload)<>'object'
 or octet_length(p_payload::text)>16384 then
  raise exception using errcode='22023',message='Invalid enquiry';
 end if;
 if (select count(*) from jsonb_object_keys(p_payload))<>11
 or not p_payload ?& array['schemaVersion','fullName','workEmail','phone','organisation','projectType','description','preferredContactMethod','consent','consentVersion','source']
 or p_payload->'schemaVersion'<>'1'::jsonb or p_payload->'consent'<>'true'::jsonb
 or p_payload->>'consentVersion'<>'enquiry-v1' or p_payload->>'source'<>'company-website' then
  raise exception using errcode='22023',message='Invalid enquiry';
 end if;
 foreach item in array array['fullName','workEmail','projectType','description','preferredContactMethod','consentVersion','source'] loop
  if jsonb_typeof(p_payload->item)<>'string' then
   raise exception using errcode='22023',message='Invalid enquiry';
  end if;
 end loop;
 foreach item in array array['phone','organisation'] loop
  if jsonb_typeof(p_payload->item) not in ('string','null') then
   raise exception using errcode='22023',message='Invalid enquiry';
  end if;
 end loop;
 -- Transaction-scoped serialization; hash collisions only serialize unrelated keys.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key::text,0));
 select * into existing from operations.website_enquiries where idempotency_key=p_key;
 if found then
  if existing.payload_hash<>p_hash then
   return jsonb_build_object('conflict',true);
  end if;
  return jsonb_build_object('persisted',true,'enquiryId',existing.id,'notification','queued','replayed',true);
 end if;
 insert into operations.leads(name,email,phone,organisation,source,project_type,message,preferred_contact)
 values(p_payload->>'fullName',p_payload->>'workEmail',p_payload->>'phone',p_payload->>'organisation',
 'company-website',p_payload->>'projectType',p_payload->>'description',p_payload->>'preferredContactMethod')
 returning id into lead_uuid;
 insert into operations.website_enquiries(lead_id,idempotency_key,payload_hash,schema_version,consent_given,consent_version)
 values(lead_uuid,p_key,p_hash,1,true,'enquiry-v1') returning id into enquiry_uuid;
 insert into operations.notification_outbox(enquiry_id) values(enquiry_uuid);
 return jsonb_build_object('persisted',true,'enquiryId',enquiry_uuid,'notification','queued','replayed',false);
 -- Do not swallow constraint/transaction failures. No receipt before caller commit.
end;
$$;
revoke all on function operations.ingest_enquiry(uuid,text,jsonb) from public,anon,authenticated,service_role,ops_notification_api;
-- ALTER OWNER requires membership and CREATE; revoke CREATE in the same transaction.
grant create on schema operations to ops_ingest_executor;
alter function operations.ingest_enquiry(uuid,text,jsonb) owner to ops_ingest_executor;
revoke create on schema operations from ops_ingest_executor;
grant execute on function operations.ingest_enquiry(uuid,text,jsonb) to ops_ingestion_api;
insert into operations.migration_versions(version,name) values(3,'atomic-ingestion');
commit;
