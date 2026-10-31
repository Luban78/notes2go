BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='45s';
-- Baseline CRUD privileges for each role+table (effective, not just direct).
CREATE TEMP TABLE acl_dml_before ON COMMIT DROP AS
SELECT c.oid AS table_oid, roles.role, p.priv,
       has_table_privilege(roles.role,c.oid,p.priv) AS granted
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN (VALUES('anon'),('authenticated')) roles(role)
CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE')) p(priv)
WHERE n.nspname='public' AND c.relkind IN ('r','p');
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
DO $verify$
DECLARE direct_count int; effective_count int; dml_changed int;
BEGIN
 SELECT count(*) INTO direct_count
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
 JOIN pg_roles r ON r.oid=a.grantee
 WHERE n.nspname='public' AND c.relkind IN ('r','p')
 AND r.rolname IN ('anon','authenticated')
 AND a.privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN');
 SELECT count(*) INTO effective_count
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 CROSS JOIN (VALUES('anon'),('authenticated')) roles(role)
 CROSS JOIN (VALUES('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(priv)
 WHERE n.nspname='public' AND c.relkind IN ('r','p')
 AND has_table_privilege(roles.role,c.oid,p.priv);
 SELECT count(*) INTO dml_changed
 FROM acl_dml_before b
 WHERE has_table_privilege(b.role,b.table_oid,b.priv) IS DISTINCT FROM b.granted;
 IF direct_count<>0 OR effective_count<>0 OR dml_changed<>0 THEN
  RAISE EXCEPTION '697ZM_VERIFY_FAILED direct=% effective=% dml_changed=%',
   direct_count,effective_count,dml_changed;
 END IF;
 RAISE NOTICE 'ACL_VERIFY=PASS | STRUCTURAL=0 | CRUD_UNCHANGED=YES';
END
$verify$;
COMMIT;
