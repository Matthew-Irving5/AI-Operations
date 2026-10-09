BEGIN;
SELECT plan(12);

WITH grants AS (
  SELECT 'table' AS kind, n.nspname||'.'||c.relname AS object_name,
    CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE r.rolname END AS grantee,
    a.privilege_type, a.is_grantable
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r',c.relowner))) a
  LEFT JOIN pg_roles r ON r.oid=a.grantee
  WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
    -- PostgreSQL 17 adds MAINTAIN, which is an engine maintenance privilege
    -- outside the app-role contract represented by this fingerprint.
    AND a.privilege_type <> 'MAINTAIN'
    AND (a.grantee=0 OR r.rolname IN ('anon','authenticated','service_role'))
  UNION ALL
  SELECT 'routine', n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
    CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE r.rolname END,
    a.privilege_type, a.is_grantable
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) a
  LEFT JOIN pg_roles r ON r.oid=a.grantee
  WHERE n.nspname='public'
    AND (a.grantee=0 OR r.rolname IN ('anon','authenticated','service_role'))
)
SELECT is(
  (SELECT md5(string_agg(object_name||'|'||grantee||'|'||privilege_type||'|'||is_grantable::text, E'\n' ORDER BY object_name,grantee,privilege_type,is_grantable)) FROM grants WHERE kind='table'),
  'f60ad8a9fdeb14ff01c7e03c7adfd25c',
  'local table ACL tuples match staging plus the reviewed run-step read grant'
);

SELECT is(
  (SELECT md5(coalesce(string_agg(c.relname||'.'||a.attname||'|'||CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE r.rolname END||'|'||x.privilege_type||'|'||x.is_grantable::text, E'\n' ORDER BY c.relname,a.attname,CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE r.rolname END,x.privilege_type,x.is_grantable),'')) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(a.attacl) x LEFT JOIN pg_roles r ON r.oid=x.grantee WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL AND (x.grantee=0 OR r.rolname IN ('anon','authenticated','service_role'))),
  '419b6eed6e14c00eefef452d1b2a57ab',
  'local column ACL tuples match the captured staging baseline'
);

WITH grants AS (
  SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS object_name,
    CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE r.rolname END AS grantee,
    a.privilege_type, a.is_grantable
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) a
  LEFT JOIN pg_roles r ON r.oid=a.grantee
  WHERE n.nspname='public'
    AND (a.grantee=0 OR r.rolname IN ('anon','authenticated','service_role'))
    -- These AI-18 routines are validated against their exact service_role
    -- grants by rpc_security.sql; the captured staging fingerprint predates them.
    AND p.oid NOT IN (
      to_regprocedure('public.complete_job_queue(uuid,text,text,text)'),
      to_regprocedure('public.submit_workflow_job_response(uuid,text)'),
      to_regprocedure('public.complete_provider_queue_job(uuid,text,text,text)')
    )
)
SELECT is(
  (SELECT md5(string_agg(object_name||'|'||grantee||'|'||privilege_type||'|'||is_grantable::text, E'\n' ORDER BY object_name,grantee,privilege_type,is_grantable)) FROM grants),
  'bbc1faa736384e35903c872be1f0fe81',
  'local routine ACL tuples match staging plus AI15 and AI18 execution RPCs'
);

SELECT is(
  (SELECT md5(coalesce(string_agg(c.relname||'|'||CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE r.rolname END||'|'||a.privilege_type||'|'||a.is_grantable::text, E'\n' ORDER BY c.relname,a.grantee,a.privilege_type,a.is_grantable),''))
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('S',c.relowner))) a
   LEFT JOIN pg_roles r ON r.oid=a.grantee
   WHERE n.nspname='public' AND c.relkind='S'
     AND (a.grantee=0 OR r.rolname IN ('anon','authenticated','service_role'))),
  'd41d8cd98f00b204e9800998ecf8427e',
  'local sequences expose no application-role ACLs beyond staging'
);

SELECT ok(NOT EXISTS (
  SELECT 1 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
  WHERE d.defaclrole='postgres'::regrole AND d.defaclnamespace='public'::regnamespace
    AND d.defaclobjtype='r' AND a.grantee='service_role'::regrole
    AND a.privilege_type IN ('INSERT','SELECT','UPDATE','DELETE')
), 'local table defaults do not add service-role DML');
SELECT ok(NOT EXISTS (
  SELECT 1 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
  WHERE d.defaclrole='postgres'::regrole AND d.defaclnamespace='public'::regnamespace
    AND d.defaclobjtype='S' AND a.grantee='service_role'::regrole
), 'local sequence defaults do not add service-role privileges');
SELECT ok(NOT EXISTS (
  SELECT 1 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
  WHERE d.defaclrole='postgres'::regrole AND d.defaclnamespace='public'::regnamespace
    AND d.defaclobjtype='f' AND a.grantee IN ('service_role'::regrole,'anon'::regrole,'authenticated'::regrole)
), 'local routine defaults match staging application-role restrictions');
SELECT is(
  (SELECT md5(string_agg(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE gr.rolname END||'|'||a.privilege_type||'|'||a.is_grantable::text, E'\n' ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE gr.rolname END,a.privilege_type,a.is_grantable))
   FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace
   CROSS JOIN LATERAL aclexplode(d.defaclacl) a LEFT JOIN pg_roles gr ON gr.oid=a.grantee
    WHERE d.defaclrole='postgres'::regrole AND n.nspname='public' AND d.defaclobjtype='r'
      AND a.privilege_type <> 'MAINTAIN'),
  '6ebeb55c6aabc710e4e98d8215e655ac',
  'local relation default ACL tuples match staging'
);
SELECT is(
  (SELECT md5(string_agg(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE gr.rolname END||'|'||a.privilege_type||'|'||a.is_grantable::text, E'\n' ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE gr.rolname END,a.privilege_type,a.is_grantable))
   FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace
   CROSS JOIN LATERAL aclexplode(d.defaclacl) a LEFT JOIN pg_roles gr ON gr.oid=a.grantee
   WHERE d.defaclrole='postgres'::regrole AND n.nspname='public' AND d.defaclobjtype='S'),
  '52231b6f1eb07ab59fd6027557e5049e',
  'local sequence default ACL tuples match staging'
);
SELECT is(
  (SELECT md5(string_agg(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE gr.rolname END||'|'||a.privilege_type||'|'||a.is_grantable::text, E'\n' ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE gr.rolname END,a.privilege_type,a.is_grantable))
   FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace
   CROSS JOIN LATERAL aclexplode(d.defaclacl) a LEFT JOIN pg_roles gr ON gr.oid=a.grantee
   WHERE d.defaclrole='postgres'::regrole AND n.nspname='public' AND d.defaclobjtype='f'),
  '888277534f75e5356d742bd57c7f4178',
  'local routine default ACL tuples match staging'
);
SELECT ok(NOT has_function_privilege('anon','public.normalize_mobile_active_calories_alias()','EXECUTE') AND NOT has_function_privilege('authenticated','public.normalize_mobile_active_calories_alias()','EXECUTE'), 'mobile normalization remains service-role-only locally');
SELECT ok(NOT has_function_privilege('service_role','public.mobile_adapter_validation_issues(text,text,jsonb)','EXECUTE') AND NOT has_function_privilege('service_role','public.mobile_is_valid_optional_offset_timestamp(text)','EXECUTE') AND NOT has_function_privilege('service_role','public.mobile_parse_offset_timestamp(text,boolean)','EXECUTE') AND NOT has_function_privilege('service_role','public.mobile_shortcut_numeric(jsonb,text)','EXECUTE') AND NOT has_function_privilege('service_role','public.mobile_typed_deduplication_key(text,timestamp with time zone,text)','EXECUTE'), 'private mobile helpers remain uncallable directly by service_role');

SELECT * FROM finish();
ROLLBACK;
