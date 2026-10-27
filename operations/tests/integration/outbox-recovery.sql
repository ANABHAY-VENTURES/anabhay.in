-- Synthetic local ONLY after 001-004; requires empty outbox. Never hosted.
-- Admin adjusts fixture timestamps only, not grants or security controls.
\set ON_ERROR_STOP on
begin;
DO $$ BEGIN
 IF current_user<>'postgres' OR current_setting('server_version_num')::int/10000<>17
 OR (select array_agg(version order by version) from operations.migration_versions) IS DISTINCT FROM ARRAY[1,2,3,4]
 OR exists(select 1 from operations.notification_outbox) THEN RAISE EXCEPTION 'Fresh isolated recovery baseline required'; END IF;
END $$;
set local role ops_ingestion_api;
select operations.ingest_enquiry('30000000-0000-4000-8000-000000000091',repeat('a',64),'{"schemaVersion":1,"fullName":"Synthetic Recovery","workEmail":"qa@example.invalid","phone":null,"organisation":null,"projectType":"other","description":"synthetic recovery enquiry","preferredContactMethod":"email","consent":true,"consentVersion":"enquiry-v1","source":"company-website"}') is not null;
reset role;
DO $$ DECLARE first_job jsonb; replacement jsonb; live_job jsonb; i integer; BEGIN
 first_job:=operations.claim_notification();
 IF first_job IS NULL THEN RAISE EXCEPTION 'Missing recovery job'; END IF;
 update operations.notification_outbox set lease_until=clock_timestamp()-interval '1 second' where id=(first_job->>'id')::uuid;
 BEGIN
  perform operations.accept_notification((first_job->>'id')::uuid,(first_job->>'leaseToken')::uuid,'synthetic-receipt');
  RAISE EXCEPTION 'Expired lease accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Invalid notification lease' THEN RAISE; END IF; END;
 replacement:=operations.claim_notification();
 IF replacement->>'id' IS DISTINCT FROM first_job->>'id' OR replacement->>'leaseToken' IS NOT DISTINCT FROM first_job->>'leaseToken' OR (replacement->>'attempt')::int IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'Lease replacement failed'; END IF;
 BEGIN
  perform operations.retry_notification((first_job->>'id')::uuid,(first_job->>'leaseToken')::uuid,'timeout');
  RAISE EXCEPTION 'Stale token retried';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Invalid notification lease' THEN RAISE; END IF; END;
 -- Roll back DB acceptance after synthetic provider acceptance: no real provider.
 BEGIN
  perform operations.accept_notification((replacement->>'id')::uuid,(replacement->>'leaseToken')::uuid,'synthetic-receipt');
  RAISE EXCEPTION 'synthetic acceptance transaction failure';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'synthetic acceptance transaction failure' THEN RAISE; END IF; END;
 IF (select state from operations.notification_outbox where id=(replacement->>'id')::uuid)<>'processing' THEN RAISE EXCEPTION 'Acceptance failure persisted'; END IF;
 perform operations.retry_notification((replacement->>'id')::uuid,(replacement->>'leaseToken')::uuid,'timeout');
 IF operations.claim_notification() IS NOT NULL THEN RAISE EXCEPTION 'Retry schedule bypassed'; END IF;
 FOR i IN 3..10 LOOP
  update operations.notification_outbox set next_attempt_at=clock_timestamp()-interval '1 second' where id=(replacement->>'id')::uuid;
  live_job:=operations.claim_notification();
  IF (live_job->>'attempt')::int IS DISTINCT FROM i THEN RAISE EXCEPTION 'Attempt counter failed'; END IF;
  perform operations.retry_notification((live_job->>'id')::uuid,(live_job->>'leaseToken')::uuid,'timeout');
 END LOOP;
 IF (select state from operations.notification_outbox where id=(replacement->>'id')::uuid)<>'failed' OR operations.claim_notification() IS NOT NULL THEN RAISE EXCEPTION 'Retry exhaustion failed'; END IF;
 update operations.notification_outbox set state='processing',lease_until=clock_timestamp()-interval '1 second',lease_token=gen_random_uuid() where id=(replacement->>'id')::uuid;
 -- Complete volatile claim/cleanup BEFORE reading state in a new statement.
 -- A state subquery in the same expression can run before the function call.
 live_job:=operations.claim_notification();
 IF live_job IS NOT NULL THEN RAISE EXCEPTION 'Exhausted lease reclaimed'; END IF;
 IF (select state from operations.notification_outbox where id=(replacement->>'id')::uuid)<>'failed' THEN RAISE EXCEPTION 'Expired exhausted lease cleanup failed'; END IF;
END $$;
rollback;
select 'PASS: expired lease, stale token, acceptance rollback, retry delay/exhaustion';
