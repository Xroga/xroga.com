import assert from 'node:assert/strict';

export function assertDisposableSource(actual,expected){
  assert.match(actual??'',/^[a-f0-9]{40}$/);
  assert.match(expected??'',/^[a-f0-9]{40}$/);
  assert.equal(actual,expected,'Disposable database evidence must attest its actual requested checkout');
  return actual;
}

/** Catalog metadata only. Never reads application rows, credentials or tokens. */
export async function collectSchemaCatalog(db,{sourceSha,observedAt}){
  assertDisposableSource(sourceSha,sourceSha);
  assert.ok(Number.isFinite(Date.parse(observedAt)));
  const {rows}=await db.query(`
    select n.nspname as schema,c.relname as table_name,c.relrowsecurity as rls_enabled,c.relforcerowsecurity as rls_forced,
      coalesce((select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'nullable',not a.attnotnull) order by a.attnum)
        from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),'[]'::jsonb) as columns,
      coalesce((select jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid)) order by k.conname)
        from pg_constraint k where k.conrelid=c.oid),'[]'::jsonb) as constraints,
      coalesce((select jsonb_agg(jsonb_build_object('policy',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
        'roles',p.polroles::text,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname)
        from pg_policy p where p.polrelid=c.oid),'[]'::jsonb) as policies,
      coalesce((select jsonb_agg(jsonb_build_object('role',g.grantee,'privilege',g.privilege_type) order by g.grantee,g.privilege_type)
        from information_schema.table_privileges g where g.table_schema=n.nspname and g.table_name=c.relname),'[]'::jsonb) as grants
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','storage') and c.relkind in ('r','p')
    order by n.nspname,c.relname`);
  assert.ok(rows.length>0,'An empty catalog is not table isolation proof');
  assert.equal(new Set(rows.map(r=>r.schema+'.'+r.table_name)).size,rows.length);
  for(const r of rows)for(const field of ['columns','constraints','policies','grants'])assert.ok(Array.isArray(r[field]));
  return {version:1,sourceSha,observedAt,scope:'DISPOSABLE_CATALOG_METADATA_NOT_PRODUCTION_PARITY',
    customerRowsRead:false,securityCertification:'NOT_CERTIFIED_BY_INVENTORY',tables:rows};
}
