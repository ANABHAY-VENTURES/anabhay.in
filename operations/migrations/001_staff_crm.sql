-- DRAFT / NOT EXECUTED. Requires verified NEW project and human SQL approval.
begin;
-- Fresh-project gate: existing objects/roles cause rollback, never repair.
DO $$ BEGIN
 IF current_user <> 'postgres' OR current_setting('server_version_num')::int < 170000 THEN
  RAISE EXCEPTION 'Requires approved postgres executor and PostgreSQL 17+';
 END IF;
END $$;
create role ops_ingest_executor nologin noinherit nobypassrls;
create role ops_ingestion_api nologin noinherit nobypassrls;
create role ops_rate_executor nologin noinherit nobypassrls;
create role ops_notification_executor nologin noinherit nobypassrls;
create role ops_notification_api nologin noinherit nobypassrls;
-- Administrative ownership-transfer membership; no application membership.
grant ops_ingest_executor,ops_rate_executor,ops_notification_executor to postgres;
create schema operations;
alter default privileges for role postgres in schema operations revoke all on tables from public,anon,authenticated,service_role;
alter default privileges for role postgres in schema operations revoke execute on functions from public,anon,authenticated,service_role;
create table operations.migration_versions (
 version integer primary key, name text not null unique, applied_at timestamptz not null default now()
);
revoke all on operations.migration_versions from public,anon,authenticated,service_role;
revoke all on schema operations from public, anon, authenticated, service_role;
grant usage on schema operations to authenticated,ops_ingest_executor,ops_ingestion_api,ops_rate_executor,ops_notification_executor,ops_notification_api;

create table operations.teams (
 id uuid primary key default gen_random_uuid(), name text not null unique check (length(name) between 1 and 120),
 active boolean not null default true, created_at timestamptz not null default now()
);
create table operations.employees (
 id uuid primary key references auth.users(id) on delete restrict,
 display_name text not null check(length(display_name) between 1 and 120),
 role text not null check(role in ('owner','manager','member')),
 state text not null default 'suspended' check(state in ('active','suspended','deactivated')),
 assignment_eligible boolean not null default false,
 created_at timestamptz not null default now()
);
create table operations.team_memberships (
 team_id uuid not null references operations.teams(id) on delete restrict,
 employee_id uuid not null references operations.employees(id) on delete restrict,
 primary key(team_id,employee_id)
);
create table operations.leads (
 id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
 name text not null check(length(name) between 2 and 120),
 email text not null check(length(email) between 3 and 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 phone text check(phone is null or (length(phone)<=40 and phone ~ '^[+0-9 ().-]+$' and length(regexp_replace(phone,'[^0-9]','','g')) between 7 and 15)),
 organisation text check(organisation is null or length(organisation)<=160),
 source text not null check(source in ('company-website','manual')),
 project_type text not null check(project_type in ('software-web','ai','automation','iot-embedded','cybersecurity','research-product','other')),
 message text not null check(length(message) between 20 and 5000),
 preferred_contact text not null check(preferred_contact in ('email','phone')),
 status text not null default 'new' check(status in ('new','contacted','qualified','won','lost','closed')),
 priority text not null default 'normal' check(priority in ('low','normal','high')),
 team_id uuid references operations.teams(id) on delete restrict,
 assigned_to uuid references operations.employees(id) on delete restrict,
 next_follow_up_at timestamptz, converted_at timestamptz,
 check(preferred_contact <> 'phone' or phone is not null),
 check((status='won') = (converted_at is not null))
);
create table operations.lead_assignments (
 id uuid primary key default gen_random_uuid(), lead_id uuid not null references operations.leads(id) on delete restrict,
 previous_employee_id uuid references operations.employees(id) on delete restrict,
 employee_id uuid references operations.employees(id) on delete restrict,
 actor_id uuid not null references operations.employees(id) on delete restrict,
 created_at timestamptz not null default now()
);
create table operations.lead_activities (
 id uuid primary key default gen_random_uuid(), lead_id uuid not null references operations.leads(id) on delete restrict,
 actor_id uuid not null references operations.employees(id) on delete restrict,
 kind text not null check(kind in ('call','note','follow-up','status')),
 outcome text check(outcome is null or length(outcome)<=120),
 body text not null check(length(body) between 1 and 2000),
 visibility text not null default 'managers' check(visibility in ('managers','assigned')),
 follow_up_at timestamptz, created_at timestamptz not null default now()
);
create index leads_assigned_follow_up on operations.leads(assigned_to,next_follow_up_at);
create index leads_team_status on operations.leads(team_id,status);
create index assignments_lead_date on operations.lead_assignments(lead_id,created_at);
create index activities_lead_date on operations.lead_activities(lead_id,created_at);
create index memberships_employee on operations.team_memberships(employee_id,team_id);

alter table operations.teams enable row level security;
alter table operations.teams force row level security;
alter table operations.employees enable row level security;
alter table operations.employees force row level security;
alter table operations.team_memberships enable row level security;
alter table operations.team_memberships force row level security;
alter table operations.leads enable row level security;
alter table operations.leads force row level security;
alter table operations.lead_assignments enable row level security;
alter table operations.lead_assignments force row level security;
alter table operations.lead_activities enable row level security;
alter table operations.lead_activities force row level security;
revoke all on all tables in schema operations from public, anon, authenticated, service_role;
grant select on operations.teams,operations.employees,operations.team_memberships,operations.leads,operations.lead_assignments,operations.lead_activities to authenticated;
-- No server table grants. Capability grants follow in 003/004.

-- No client writes. These self-only leaf policies do not reference each other.
create policy own_employee on operations.employees for select to authenticated
 using(id=(select auth.uid()) and state='active');
create policy own_memberships on operations.team_memberships for select to authenticated
 using(employee_id=(select auth.uid()) and exists(select 1 from operations.employees e where e.id=(select auth.uid()) and e.state='active'));
create policy visible_teams on operations.teams for select to authenticated
 using(exists(select 1 from operations.employees e where e.id=(select auth.uid()) and e.state='active' and
 (e.role='owner' or exists(select 1 from operations.team_memberships m where m.employee_id=e.id and m.team_id=teams.id))));
create policy visible_leads on operations.leads for select to authenticated
 using(exists(select 1 from operations.employees e where e.id=(select auth.uid()) and e.state='active' and
 (e.role='owner' or (e.role='member' and assigned_to=e.id and e.assignment_eligible and exists(select 1 from operations.team_memberships m join operations.teams t on t.id=m.team_id where m.employee_id=e.id and m.team_id=leads.team_id and t.active)) or (e.role='manager' and exists(
 select 1 from operations.team_memberships m join operations.teams t on t.id=m.team_id where m.employee_id=e.id and m.team_id=leads.team_id and t.active)))));
create policy visible_assignment_history on operations.lead_assignments for select to authenticated
 using(exists(select 1 from operations.leads l where l.id=lead_id) and exists(select 1 from operations.employees e where e.id=(select auth.uid()) and e.state='active' and e.role in ('owner','manager')));
create policy visible_activities on operations.lead_activities for select to authenticated
 using(exists(select 1 from operations.leads l where l.id=lead_id) and
 ((visibility='assigned' and actor_id=(select auth.uid())) or exists(select 1 from operations.employees e where e.id=(select auth.uid()) and e.role in ('owner','manager') and e.state='active')));
insert into operations.migration_versions(version,name) values(1,'staff-crm');
commit;
