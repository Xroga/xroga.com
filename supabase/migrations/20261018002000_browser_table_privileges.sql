-- Browser roles need row-level DML, never whole-table maintenance/DDL rights.
-- PostgreSQL RLS does not protect TRUNCATE or REFERENCES. Historical Supabase
-- ALL grants must not silently turn an RLS policy into the wrong security claim.
-- No rows, policies, owner columns, constraints or service_role grants change.
do $$
declare target record;
begin
  for target in
    select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p')
  loop
    execute format('revoke truncate,references,trigger on table %I.%I from public,anon,authenticated',target.nspname,target.relname);
  end loop;
end $$;

-- Default grants belong to the creating role. A schema-local REVOKE cannot
-- cancel a global default grant, so remove both for this migration's creator.
-- Other creating roles still require explicit narrow grants and catalog tests.
alter default privileges revoke truncate,references,trigger on tables from public,anon,authenticated;
alter default privileges in schema public revoke truncate,references,trigger on tables from public,anon,authenticated;
