import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export function validateCurrentMigrationAdditions(additions,files,readMigration){
  assert.equal(additions.scope,'REVIEWED_CURRENT_MIGRATION_ADDITIONS_NOT_PRODUCTION_SCHEMA_OBSERVATION');
  assert.equal(additions.historicalCatalogUnchanged,true);
  const sidebar='20261021233500_sidebar_organization.sql',parents='20261022003000_sidebar_exact_parent_guards.sql';
  const reviewed={product_feedback:['20261018211950_product_feedback_admin.sql','20261021100000_feedback_founder_authorization.sql'],
    xroga_sidebar_chats:[sidebar,sidebar],xroga_sidebar_items:[sidebar,parents],
    xroga_sidebar_legacy_title_backup:[sidebar,sidebar],xroga_sidebar_sections:[sidebar,parents],
    business_automation_events:['20261024200940_connected_app_workflows.sql','20261024200940_connected_app_workflows.sql'],
    business_automation_rules:['20261024200940_connected_app_workflows.sql','20261024200940_connected_app_workflows.sql'],
    business_workflow_runs:['20261024200940_connected_app_workflows.sql','20261024200940_connected_app_workflows.sql'],
    storage_objects:['20261022000000_storage_drive_foundation.sql','20261022000000_storage_drive_foundation.sql'],
    storage_usage:['20261022000000_storage_drive_foundation.sql','20261022000000_storage_drive_foundation.sql'],
    storage_reservations:['20261022000000_storage_drive_foundation.sql','20261022000000_storage_drive_foundation.sql'],
    storage_audit_events:['20261022000000_storage_drive_foundation.sql','20261022000000_storage_drive_foundation.sql'],
    storage_migration_jobs:['20261022000000_storage_drive_foundation.sql','20261022000000_storage_drive_foundation.sql'],
    storage_migration_items:['20261022000000_storage_drive_foundation.sql','20261022000000_storage_drive_foundation.sql'],
    worker_task_leases:['20261024000000_worker_task_leases.sql','20261024000000_worker_task_leases.sql'],
    google_canonical_deliveries:['20261026000000_google_canonical_deliveries.sql','20261026000000_google_canonical_deliveries.sql'],
    browser_runs:['20261026100000_browser_runs_durable.sql','20261026100000_browser_runs_durable.sql']};
  assert.deepEqual(additions.tables.map(t=>`${t.schema}.${t.table_name}`),Object.keys(reviewed).map(name=>'public.'+name));
  for(const entry of additions.tables){
    assert.deepEqual([entry.migration,entry.authorizationMigration],reviewed[entry.table_name],'Only the explicitly reviewed creation and ownership migrations apply');
    assert.equal(entry.productionChanges,false);
    for(const [file,digest] of [[entry.migration,entry.migrationSha256],[entry.authorizationMigration,entry.authorizationSha256]]){
      assert.ok(files.includes(file),'Current addition must name an installed original migration');
      assert.equal(createHash('sha256').update(readMigration(file).replace(/\r\n/g,'\n')).digest('hex'),digest,'Reviewed migration boundary drift');
    }
  }
  return additions.tables;
}

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
