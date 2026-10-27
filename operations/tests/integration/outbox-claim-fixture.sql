-- Fresh disposable local database only, after verifier/recovery rollback.
\set ON_ERROR_STOP on
begin;
DO $$ BEGIN
 IF current_user<>'postgres' OR current_setting('server_version_num')::int/10000<>17
 OR exists(select 1 from operations.notification_outbox) THEN RAISE EXCEPTION 'Empty isolated claim baseline required'; END IF;
END $$;
set local role ops_ingestion_api;
select operations.ingest_enquiry(('30000000-0000-4000-8000-00000000009'||x)::uuid,repeat('a',64),'{"schemaVersion":1,"fullName":"Synthetic Claims","workEmail":"qa@example.invalid","phone":null,"organisation":null,"projectType":"other","description":"synthetic concurrent claim enquiry","preferredContactMethod":"email","consent":true,"consentVersion":"enquiry-v1","source":"company-website"}') is not null from generate_series(2,3) x;
reset role;
commit;
