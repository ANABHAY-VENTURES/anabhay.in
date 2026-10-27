-- REVIEW PACKAGE ONLY. NOT EXECUTED OR AUTHORIZED.
-- Target: ANABHAY VENTURES / iaxkbwxzalmxnllfqgpr, owner-designated staging.
-- LOCAL CAPS REVISION: remote execution requires separate explicit approval.
-- Every A-H statement has an OUTERMOST LIMIT 100; no intermediate cap.
-- Reaching 100 rows OR any truncation => STOP; results may be incomplete.
-- Never infer absence of additional roles/grants/objects/dependencies from capped
-- output. Pagination or narrower queries need separate review and approval.
-- Row caps bound row counts, not cell byte size, computation cost or retention.
-- Run batches individually only after explicit approval. No application functions,
-- data/ledger rows, Auth users, Storage, secrets, SET ROLE or configuration changes.
-- STOP on any error, truncated output, unknown owner/OID or unexpected object.
-- PostgreSQL 17+ required. Empty results mean absent objects only when catalog
-- visibility is independently established. Do not infer managed DDL capability.

-- A: identity/version. Expected: database/session identities and version, not keys.
SELECT current_database(), session_user, current_user,
       current_setting('server_version_num') AS server_version_num ORDER BY 1,2,3,4 LIMIT 100;

-- B: roles and complete direct membership graph. pg_roles excludes passwords.
SELECT oid,rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,
       rolreplication,rolbypassrls FROM pg_catalog.pg_roles ORDER BY rolname LIMIT 100;
SELECT m.roleid AS granted_role_oid,p.rolname AS granted_role_name,
       m.member AS member_role_oid,c.rolname AS member_role_name,
       m.grantor AS grantor_role_oid,g.rolname AS grantor_role_name,
       m.admin_option AS membership_admin_option,
       m.inherit_option AS membership_inherit_option,
       m.set_option AS membership_set_option
FROM pg_catalog.pg_auth_members m
LEFT JOIN pg_catalog.pg_roles p ON p.oid=m.roleid
LEFT JOIN pg_catalog.pg_roles c ON c.oid=m.member
LEFT JOIN pg_catalog.pg_roles g ON g.oid=m.grantor ORDER BY m.roleid,m.member,m.grantor,m.oid LIMIT 100;
-- Effective recursive membership, presently inherited rights, and SET paths.
-- PUBLIC is NOT a role and must not be passed as role OID 0 to these functions.
SELECT a.rolname AS member,b.rolname AS target,
       pg_has_role(a.oid,b.oid,'MEMBER') AS member_path,
       pg_has_role(a.oid,b.oid,'USAGE') AS inherited_now,
       pg_has_role(a.oid,b.oid,'SET') AS set_path
FROM pg_catalog.pg_roles a CROSS JOIN pg_catalog.pg_roles b
WHERE a.oid<>b.oid AND pg_has_role(a.oid,b.oid,'MEMBER')
ORDER BY a.rolname,b.rolname LIMIT 100;

-- C: relevant schemas, extensions and object inventory. No source/data contents.
SELECT oid,nspname,nspowner,pg_get_userbyid(nspowner) AS owner,nspacl
FROM pg_catalog.pg_namespace WHERE nspname IN ('public','auth','operations')
ORDER BY nspname LIMIT 100;
SELECT e.oid,e.extname,e.extversion,n.nspname,e.extowner,
       pg_get_userbyid(e.extowner) AS owner
FROM pg_catalog.pg_extension e LEFT JOIN pg_catalog.pg_namespace n
ON n.oid=e.extnamespace ORDER BY e.extname LIMIT 100;
SELECT c.oid,n.nspname,c.relname,c.relkind,c.relowner,
       pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relforcerowsecurity
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','operations') ORDER BY n.nspname,c.relname LIMIT 100;
SELECT t.oid,t.typname,t.typtype,t.typowner,pg_get_userbyid(t.typowner) AS owner
FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
WHERE n.nspname='operations' ORDER BY t.typname LIMIT 100;
SELECT c.oid AS relation_oid,c.relname,a.attnum,a.attname,
       pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,
       a.attidentity,a.attgenerated,a.attacl
FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='operations' AND a.attnum>0 AND NOT a.attisdropped
ORDER BY c.relname,a.attnum LIMIT 100;

-- D: explicit ACLs and built-in fallback when ACL is NULL (not empty ACL).
-- grantee=0 is PUBLIC. Defaults shown here are CURRENT object ACL fallbacks,
-- not future-object pg_default_acl rules. Owners retain inherent powers separately.
WITH objects AS (
 SELECT 'schema' AS kind,n.oid,0::integer AS subid,n.nspname AS name,
 n.nspowner AS owner,n.nspacl AS acl,acldefault('n',n.nspowner) AS fallback
 FROM pg_catalog.pg_namespace n WHERE n.nspname IN ('public','auth','operations')
 UNION ALL
 SELECT CASE WHEN c.relkind='S' THEN 'sequence' ELSE 'relation' END,c.oid,0,
 n.nspname||'.'||c.relname,c.relowner,c.relacl,
 acldefault(CASE WHEN c.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,c.relowner)
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='operations' AND c.relkind IN ('r','p','v','m','f','S')
 UNION ALL
 SELECT 'column',c.oid,a.attnum,n.nspname||'.'||c.relname||'.'||a.attname,
 c.relowner,a.attacl,acldefault('c',c.relowner)
 FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='operations' AND a.attnum>0 AND NOT a.attisdropped
 UNION ALL
 SELECT 'function',p.oid,0,n.nspname||'.'||p.proname||'('||
 pg_get_function_identity_arguments(p.oid)||')',p.proowner,p.proacl,acldefault('f',p.proowner)
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='operations' OR (n.nspname='auth' AND p.proname='uid')
)
SELECT o.kind,o.oid,o.subid,o.name,o.owner,o.acl IS NULL AS uses_builtin_default,
 x.grantor,x.grantee,CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END AS grantee_name,
 x.privilege_type,x.is_grantable
FROM objects o LEFT JOIN LATERAL aclexplode(COALESCE(o.acl,o.fallback)) x ON true
ORDER BY o.kind,o.name,o.oid,o.subid,x.grantee,x.privilege_type,x.grantor,x.is_grantable LIMIT 100;
SELECT d.oid,d.defaclrole,pg_get_userbyid(d.defaclrole) AS owner,
       d.defaclnamespace,n.nspname,d.defaclobjtype,x.grantor,x.grantee,
       CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END AS grantee_name,
       x.privilege_type,x.is_grantable
FROM pg_catalog.pg_default_acl d LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace
LEFT JOIN LATERAL aclexplode(d.defaclacl) x ON true
ORDER BY d.defaclrole,d.defaclnamespace,d.defaclobjtype,d.oid,x.grantee,x.privilege_type,x.grantor,x.is_grantable LIMIT 100;
-- defaclnamespace=0 means GLOBAL, not hidden schema. Global/schema defaults must
-- be reviewed together for each object-creating role, including absent/default rows.

-- E: effective privileges for ALL visible roles, not just six application roles.
SELECT r.rolname,n.nspname,has_schema_privilege(r.oid,n.oid,'USAGE') AS usage,
       has_schema_privilege(r.oid,n.oid,'CREATE') AS create_privilege
FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_namespace n
WHERE n.nspname IN ('public','auth','operations') ORDER BY r.rolname,n.nspname LIMIT 100;
SELECT r.rolname,c.oid AS relation_oid,c.relname,
       has_table_privilege(r.oid,c.oid,'SELECT') AS can_select,
       has_table_privilege(r.oid,c.oid,'INSERT') AS can_insert,
       has_table_privilege(r.oid,c.oid,'UPDATE') AS can_update,
       has_table_privilege(r.oid,c.oid,'DELETE') AS can_delete,
       has_table_privilege(r.oid,c.oid,'TRUNCATE') AS can_truncate,
       has_table_privilege(r.oid,c.oid,'REFERENCES') AS can_reference,
       has_table_privilege(r.oid,c.oid,'TRIGGER') AS can_trigger,
       has_table_privilege(r.oid,c.oid,'MAINTAIN') AS can_maintain
FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='operations' AND c.relkind IN ('r','p','v','m','f')
ORDER BY r.rolname,c.relname LIMIT 100;
SELECT r.rolname,c.oid AS relation_oid,c.relname,a.attnum,a.attname,
       has_column_privilege(r.oid,c.oid,a.attnum,'SELECT') AS can_select,
       has_column_privilege(r.oid,c.oid,a.attnum,'INSERT') AS can_insert,
       has_column_privilege(r.oid,c.oid,a.attnum,'UPDATE') AS can_update,
       has_column_privilege(r.oid,c.oid,a.attnum,'REFERENCES') AS can_reference
FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
WHERE n.nspname='operations' AND c.relkind IN ('r','p','v','m','f')
AND a.attnum>0 AND NOT a.attisdropped ORDER BY r.rolname,c.relname,a.attnum LIMIT 100;
SELECT r.rolname,c.oid AS sequence_oid,c.relname,
       has_sequence_privilege(r.oid,c.oid,'USAGE') AS can_use,
       has_sequence_privilege(r.oid,c.oid,'SELECT') AS can_select,
       has_sequence_privilege(r.oid,c.oid,'UPDATE') AS can_update
FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='operations' AND c.relkind='S' ORDER BY r.rolname,c.relname LIMIT 100;

-- F: functions, safe configuration projection and exact overload EXECUTE.
SELECT p.oid,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,
 p.proowner,pg_get_userbyid(p.proowner) AS owner,l.lanname,p.prosecdef,
 p.provolatile,p.proparallel,p.proleakproof,
 ARRAY(SELECT x FROM unnest(p.proconfig) x WHERE x LIKE 'search_path=%') AS search_path,
 ARRAY(SELECT split_part(x,'=',1) FROM unnest(p.proconfig) x WHERE x NOT LIKE 'search_path=%') AS other_config_names
FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
JOIN pg_catalog.pg_language l ON l.oid=p.prolang
WHERE n.nspname='operations' OR (n.nspname='auth' AND p.proname='uid')
ORDER BY n.nspname,p.proname,p.oid LIMIT 100;
SELECT r.rolname,p.oid AS function_oid,n.nspname,p.proname,
 pg_get_function_identity_arguments(p.oid) AS arguments,
 has_function_privilege(r.oid,p.oid,'EXECUTE') AS can_execute
FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='operations' OR (n.nspname='auth' AND p.proname='uid')
ORDER BY r.rolname,n.nspname,p.proname,p.oid LIMIT 100;

-- G: structure/security metadata. No expression bodies until optional batch I.
SELECT con.oid,con.conrelid,con.conname,con.contype,con.convalidated,
 con.condeferrable,con.condeferred,con.confrelid,con.conkey,con.confkey,
 con.confupdtype,con.confdeltype,con.conbin IS NOT NULL AS has_expression
FROM pg_catalog.pg_constraint con JOIN pg_catalog.pg_namespace n ON n.oid=con.connamespace
WHERE n.nspname='operations' ORDER BY con.conrelid,con.conname LIMIT 100;
SELECT i.indrelid,i.indexrelid,i.indisunique,i.indisprimary,i.indisvalid,i.indisready,
 i.indpred IS NOT NULL AS partial,i.indexprs IS NOT NULL AS expression_index
FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='operations' ORDER BY i.indrelid,i.indexrelid LIMIT 100;
SELECT p.oid,p.polrelid,p.polname,p.polcmd,p.polpermissive,p.polroles,
 p.polqual IS NOT NULL AS has_using,p.polwithcheck IS NOT NULL AS has_check
FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='operations' ORDER BY p.polrelid,p.polname LIMIT 100;
SELECT t.oid,t.tgrelid,t.tgname,t.tgfoid,t.tgenabled,t.tgtype,t.tgisinternal,
 t.tgconstraint,t.tgparentid
FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='operations' ORDER BY t.tgrelid,t.tgname LIMIT 100;
-- Event triggers can affect any future DDL. Metadata only; no bodies/arguments.
SELECT e.oid,e.evtname,e.evtevent,e.evtenabled,e.evtfoid,e.evttags,
 e.evtowner,pg_get_userbyid(e.evtowner) AS owner
FROM pg_catalog.pg_event_trigger e ORDER BY e.evtname LIMIT 100;

-- H: BOTH dependency directions. Match class+OID, never OID alone.
WITH targets(classid,objid) AS (
 SELECT 'pg_catalog.pg_namespace'::regclass::oid,n.oid FROM pg_catalog.pg_namespace n WHERE n.nspname='operations'
 UNION ALL SELECT 'pg_catalog.pg_class'::regclass::oid,c.oid FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='operations'
 UNION ALL SELECT 'pg_catalog.pg_proc'::regclass::oid,p.oid FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='operations' OR (n.nspname='auth' AND p.proname='uid')
 UNION ALL SELECT 'pg_catalog.pg_type'::regclass::oid,t.oid FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='operations'
)
SELECT d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.refobjsubid,d.deptype
FROM pg_catalog.pg_depend d WHERE EXISTS(SELECT 1 FROM targets t
 WHERE (d.classid=t.classid AND d.objid=t.objid) OR (d.refclassid=t.classid AND d.refobjid=t.objid))
ORDER BY d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.refobjsubid,d.deptype LIMIT 100;
-- Return raw identities: reviewer resolves each catalog class/OID/sub-ID using
-- catalog lookups. DO NOT call pg_identify_object blindly on arbitrary classes;
-- it can reconstruct stored expression/argument information. Missing OID=>STOP.
SELECT d.dbid,d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.deptype,
 r.rolname AS referenced_role
FROM pg_catalog.pg_shdepend d LEFT JOIN pg_catalog.pg_roles r
 ON d.refclassid='pg_catalog.pg_authid'::regclass AND r.oid=d.refobjid
WHERE d.dbid IN (0,(SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database()))
AND (r.rolname LIKE 'ops\_%' ESCAPE '\' OR
 (d.classid='pg_catalog.pg_namespace'::regclass AND d.objid IN
  (SELECT oid FROM pg_catalog.pg_namespace WHERE nspname='operations')) OR
 (d.classid='pg_catalog.pg_class'::regclass AND d.objid IN
  (SELECT c.oid FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='operations')) OR
 (d.classid='pg_catalog.pg_proc'::regclass AND d.objid IN
  (SELECT p.oid FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='operations')))
ORDER BY d.dbid,d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.deptype LIMIT 100;

-- I: OPTIONAL PRIVATE definition review only after G/H reviewed and separately
-- included in the approved output scope. Stored expressions can contain sensitive
-- literals. Never copy raw results to repository/chat; redact under private review.
-- No function bodies, trigger arguments or arbitrary configuration values dumped.
SELECT p.oid,p.polrelid,p.polname,
 pg_get_expr(p.polqual,p.polrelid,false) AS using_expression,
 pg_get_expr(p.polwithcheck,p.polrelid,false) AS check_expression
FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='operations' ORDER BY p.polrelid,p.polname;
SELECT con.oid,con.conrelid,con.conname,pg_get_constraintdef(con.oid,false) AS definition
FROM pg_catalog.pg_constraint con JOIN pg_catalog.pg_namespace n ON n.oid=con.connamespace
WHERE n.nspname='operations' ORDER BY con.conrelid,con.conname;
SELECT i.indexrelid,pg_get_indexdef(i.indexrelid) AS definition
FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='operations' ORDER BY i.indexrelid;
-- Migration ledger rows are deliberately NOT selected. Existence/columns are
-- metadata; applied version values need separate explicit authorization.
