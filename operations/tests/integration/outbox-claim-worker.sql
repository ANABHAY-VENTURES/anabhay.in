-- Run TWO concurrent connections in the identity-verified isolated container.
-- Retain row locks for three seconds to exercise SKIP LOCKED. Print ID only.
\set ON_ERROR_STOP on
begin;
set local role ops_notification_api;
select operations.claim_notification()->>'id';
select pg_sleep(3);
commit;
