-- Synthetic local shim only; runner verifies an approved isolated container.
DO $$ BEGIN
 IF current_setting('server_version_num')::int/10000<>17 OR current_user<>'postgres' THEN RAISE EXCEPTION 'Requires local PostgreSQL 17 postgres'; END IF;
 IF EXISTS(select 1 from pg_namespace where nspname in ('operations','auth')) OR EXISTS(select 1 from pg_roles where rolname in ('anon','authenticated','service_role','ops_ingestion_api','ops_notification_api')) THEN RAISE EXCEPTION 'Fresh database/role baseline required'; END IF;
END $$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable
RETURN nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
-- Deliberately hostile defaults verify migrations revoke rather than merely grant.
alter default privileges for role postgres grant all on tables to service_role;
alter default privileges for role postgres grant execute on functions to public;
