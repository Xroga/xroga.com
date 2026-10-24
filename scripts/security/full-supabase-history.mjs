/** All original migrations, real Supabase PG17, sanitized upgrade then empty replay. */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync,execFileSync } from 'node:child_process';
import {test} from 'node:test';
import { resolve, join } from 'node:path';
import pg from 'pg';
import { historicalShareSchema, readHistoricalShareSchema } from './historical-share-fixture.mjs';
import { disposableCliPackages } from './disposable-supabase.mjs';
import {assertDisposableSource,collectSchemaCatalog,validateCurrentMigrationAdditions} from './schema-catalog.mjs';
const root = resolve(import.meta.dirname,'../..');
if (process.env.CI !== 'true' || process.env.XB01_DISPOSABLE_SUPABASE !== '1' || !process.env.XB01_SUPABASE_WORKDIR) throw new Error('Disposable Supabase configuration required');
const sourceSha=assertDisposableSource(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),process.env.XB01_TEST_SOURCE_SHA);
const url = new URL(process.env.XB01_LOCAL_DATABASE_URL ?? '');
assert.equal(url.port,'54322'); assert.equal(url.pathname,'/postgres'); assert.ok(['localhost','127.0.0.1'].includes(url.hostname));
const files = readdirSync(join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')).sort();
const target = '20261013150357_xroga_tenant_security_baseline.sql';
const upgradeFiles=files.slice(files.indexOf(target));
assert.ok(files.includes(target)&&upgradeFiles.includes('20261013221254_private_project_file_delivery.sql'));
const inventory = files.map(file=>({file,sha256:createHash('sha256').update(readFileSync(join(root,'supabase/migrations',file))).digest('hex')}));
const evidence = {status:'IN_PROGRESS',sourceSha,database:'disposable_supabase_pg17',cli:'2.120.0',migrations:inventory,upgrade:'NOT_RUN',fresh:'NOT_RUN',applied:[]};
const out = join(root,'artifacts/batch-01-local-security'); mkdirSync(out,{recursive:true});
const save = () => writeFileSync(join(out,'migration-history.json'),JSON.stringify(evidence,null,2));
const connect = async()=>{const db=new pg.Client({connectionString:url.href,ssl:false});await db.connect();return db;};
async function apply(db,names,phase) {
  for (const file of names) {
    try { await db.query(readFileSync(join(root,'supabase/migrations',file),'utf8')); }
    catch (error) { evidence.failure={phase,file,sqlState:error.code ?? 'unknown',position:error.position ?? null};save();throw new Error(`Full migration history failed: ${phase}/${file}, SQLSTATE ${error.code ?? 'unknown'}, position ${error.position ?? 'unknown'}`); }
    evidence.applied.push({phase,file}); save();
  }
}
async function verifyUpgrade(){
let db = await connect();
try {
  // No production dump/projection: recreate the actual pre-upgrade repository schema.
  await apply(db,files.slice(0,files.indexOf(target)),'pre-upgrade');
  const shareSql=readHistoricalShareSchema();
  await db.query(shareSql);
  evidence.upgradeShareBootstrap={...historicalShareSchema,sourceClass:'RETAINED_FULL_HISTORICAL_RUNTIME_SCHEMA'};
  const owner=randomUUID(),other=randomUUID(),project=randomUUID(),foreign=randomUUID();
  await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{}'),($3,$4,'{}')",[owner,'upgrade-owner@example.invalid',other,'upgrade-other@example.invalid']);
  await db.query("insert into public.projects(id,user_id,name,type) values($1,$2,'Sanitized fixture','app'),($3,$4,'Foreign fixture','app')",[project,owner,foreign,other]);
  const series=randomUUID(),foreignSeries=randomUUID();
  await db.query("insert into public.series_projects(id,user_id,title) values($1,$2,'Owned synthetic series'),($3,$4,'Foreign synthetic series')",[series,owner,foreignSeries,other]);
  const seriesBefore=(await db.query('select * from public.series_projects order by id')).rows;
  await db.query('begin');
  try{
    await db.query('set local role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
    assert.equal((await db.query('select id from public.series_projects order by id')).rowCount,2,'Reproduce omitted legacy RLS before the actual repair');
  }finally{await db.query('rollback');}
  await db.query("insert into public.project_files(project_id,file_name,content) values($1,'fixture.txt','non-customer example')",[project]);
  const shareToken=randomUUID();
  await db.query("insert into public.message_shares(token,owner_id,visibility,scope,response) values($1,$2,'private','response','Sanitized pre-upgrade fixture')",[shareToken,owner]);
  const shareBefore=(await db.query('select token,owner_id,visibility,response from public.message_shares')).rows;
  const before = await db.query("select id,user_id,name from public.projects order by id");
  const policies = await db.query("select schemaname,tablename,policyname from pg_policies where schemaname='public' order by tablename,policyname");
  const filesBefore=(await db.query('select id,project_id,file_name,content,file_url from public.project_files order by id')).rows;
  const auditBefore=(await db.query("insert into public.production_audit_log(actor_id,user_id,project_id,action,target_type,outcome,metadata) values($1,$1,$2,'fixture.pre-upgrade','fixture','verified','{\"synthetic\":true}') returning *",[owner,project])).rows;
  await apply(db,upgradeFiles,'upgrade');
  assert.deepEqual((await db.query('select * from public.series_projects order by id')).rows,seriesBefore);
  assert.deepEqual((await db.query('select * from public.production_audit_log where id=$1',[auditBefore[0].id])).rows,auditBefore);
  assert.deepEqual((await db.query('select id,project_id,file_name,content,file_url from public.project_files order by id')).rows,filesBefore);
  const fileEpochs=(await db.query('select delivery_version,storage_metadata from public.project_files')).rows;
  assert.ok(fileEpochs.every(row=>String(row.delivery_version)==='1'&&row.storage_metadata===null));
  evidence.preUpgradePrivateFileRowsPreserved=true;
  assert.deepEqual((await db.query("select id,user_id,name from public.projects order by id")).rows,before.rows);
  assert.deepEqual((await db.query('select token,owner_id,visibility,response from public.message_shares')).rows,shareBefore);
  evidence.preUpgradeShareRowsPreserved=true;
  const afterPolicies=(await db.query("select schemaname,tablename,policyname from pg_policies where schemaname='public'")).rows;
  for(const policy of policies.rows) assert.ok(afterPolicies.some(p=>p.tablename===policy.tablename&&p.policyname===policy.policyname));
  await db.query('begin');
  try {
    await db.query('set local role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[owner,JSON.stringify({sub:owner,role:'authenticated'})]);
    assert.deepEqual((await db.query('select id from public.projects order by id')).rows,[{id:project}]);
    assert.equal((await db.query('update public.projects set name=$1 where id=$2 returning id',['Forbidden',foreign])).rowCount,0);
    assert.equal((await db.query('select id from public.project_files')).rowCount,1);
    assert.equal((await db.query('select id from public.series_projects')).rowCount,0,'Preserve the observed server-only boundary, including for the owner');
    assert.equal((await db.query('update public.series_projects set title=$1 where id=$2 returning id',['Forbidden',foreignSeries])).rowCount,0);
  } finally { await db.query('rollback'); }
  await apply(db,upgradeFiles,'upgrade-reapply');
  assert.deepEqual((await db.query('select * from public.production_audit_log where id=$1',[auditBefore[0].id])).rows,auditBefore);
  await db.query('begin');
  try {
    await db.query('delete from auth.users where id=$1',[owner]);
    assert.deepEqual((await db.query('select * from public.production_audit_log where id=$1',[auditBefore[0].id])).rows,auditBefore);
  } finally {await db.query('rollback');}
  evidence.preUpgradeAuditRowsPreservedAfterDeletion=true;
  evidence.upgrade='PASS'; save();
} finally { await db.end(); }
}
async function verifyFresh(){
// Explicit LOCAL reset only; isolated workdir has no linked project or seed files.
const reset=spawnSync('npx',['--yes',...disposableCliPackages,'supabase','--workdir',process.env.XB01_SUPABASE_WORKDIR,'db','reset','--local','--no-seed','--yes'],{encoding:'utf8',maxBuffer:32*1024*1024});
if(reset.status!==0){evidence.failure={phase:'local-reset',exit:reset.status};save();throw new Error('Disposable local database reset failed');}
const db=await connect();
try {
  assert.equal((await db.query("select to_regclass('public.projects') as table_name")).rows[0].table_name,null);
  await apply(db,files,'fresh');
  assert.equal((await db.query("select count(*)::int as n from pg_policies where schemaname='public' and policyname like 'xroga_%' and permissive='RESTRICTIVE'")).rows[0].n,11);
  // Complete file replay is not automatically complete deployed-schema parity.
  // Report catalog drift without copying production rows or declaring it waived.
  const observed=JSON.parse(readFileSync(join(root,'docs/xroga/security/schema-observation.json'),'utf8'));
  const actual=(await db.query("select n.nspname as schema,c.relname as table_name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','storage') and c.relkind in ('r','p') order by n.nspname,c.relname")).rows;
  const names=new Set(actual.map(row=>`${row.schema}.${row.table_name}`));
  const supplement=JSON.parse(readFileSync(join(root,'docs/xroga/security/disposable-catalog-reference.json'),'utf8'));
  const additions=JSON.parse(readFileSync(join(root,'docs/xroga/security/current-migration-additions.json'),'utf8'));
  validateCurrentMigrationAdditions(additions,files,file=>readFileSync(join(root,'supabase/migrations',file),'utf8'));
  const inventoried=new Set([...observed.tables,...supplement.additionalTables,...additions.tables].map(t=>`${t.schema}.${t.table_name}`));
  assert.deepEqual(actual.filter(t=>!inventoried.has(`${t.schema}.${t.table_name}`)),[],'New installed tables need explicit audit inventory, not silent omission');
  assert.ok(additions.tables.every(t=>names.has(`${t.schema}.${t.table_name}`)),'Every reviewed current-migration table must actually be installed');
  evidence.schemaParity={status:'NOT_PRODUCTION_DRIFT_CERTIFIED',observedReferenceTables:observed.tables.length,disposableTables:actual.length,missingObservedTables:observed.tables.filter(row=>!names.has(`${row.schema}.${row.table_name}`)).map(row=>`${row.schema}.${row.table_name}`)};
  const catalog=await collectSchemaCatalog(db,{sourceSha,observedAt:new Date().toISOString()});
  assert.deepEqual(catalog.tables.filter(t=>t.schema==='public'&&!t.rls_enabled).map(t=>t.table_name),[],'Every installed public table must have an explicit RLS boundary');
  writeFileSync(join(out,'schema-catalog.json'),JSON.stringify(catalog,null,2)+'\n');
  await db.query("notify pgrst, 'reload schema'");
  evidence.fresh='PASS'; evidence.status='PASS'; save();
} finally {await db.end();}
}
await test('real full-history tenant migration preserves upgraded rows policies and reapply compatibility',verifyUpgrade);
assert.equal(evidence.upgrade,'PASS','Failed upgrade must stop before reset or a misleading fresh claim');
await test('real full-history tenant migration succeeds on a fresh disposable database',verifyFresh);
assert.equal(evidence.fresh,'PASS');
console.log(`full_history=${files.length}; upgrade=PASS; fresh=PASS; no_production_data=true`);
