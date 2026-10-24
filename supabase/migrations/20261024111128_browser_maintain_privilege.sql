-- Forward correction for PostgreSQL17+ MAINTAIN. The historical browser grant
-- migration remains unchanged. No data, RLS policy, DML grant, owner or service
-- role permission changes. No historical migration aliases are inserted.
begin;
do $browser_maintain$
declare target record;
begin
  if current_setting('server_version_num')::integer < 170000 then return; end if;
  for target in select n.nspname,c.relname from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p')
  loop
    execute format('revoke maintain on table %I.%I from public,anon,authenticated',target.nspname,target.relname);
  end loop;
  -- Default ACLs belong to their creating role. This changes only the approved
  -- migration executor's defaults, not a vendor-managed role or storage schema.
  -- Other public-table creators require their own authorized ACL verification.
  execute 'alter default privileges revoke maintain on tables from public,anon,authenticated';
  execute 'alter default privileges in schema public revoke maintain on tables from public,anon,authenticated';
end;
$browser_maintain$;
commit;
