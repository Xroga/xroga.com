/** Real disposable PostgreSQL and canonical DAO, with a controlled PostgREST
 * protocol bridge. This is not a live Supabase/PostgREST deployment receipt. */
import test,{before,after,type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {createTenantContext} from '../tenantContext.js';
import {preparedActionDigest} from '../authority/digest.js';
import {decideEgress} from './egressPolicy.js';
import {persistSecurityDecision} from './securityDecision.js';
import {executeOwnedFileEgress} from './fileEgress.js';
import {executeAuthorizedAction} from '../authority/enforce.js';
import type {PreparedAuthorityScope} from '../authority/types.js';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import type {IncomingMessage} from 'node:http';

const url=process.env.XB01_EGRESS_TEST_DATABASE_URL;
if(process.env.XB01_DISPOSABLE_DATABASE!=='1'||!url)throw Error('Disposable egress database required');
const target=new URL(url);
if(!['127.0.0.1','localhost'].includes(target.hostname)||!['/xb01_egress_test','/xb01_tenant_test'].includes(target.pathname))throw Error('Only dedicated loopback test database allowed');
const db=new pg.Client({connectionString:url,connectionTimeoutMillis:3000});
const owner='11111111-1111-4111-8111-111111111111',foreign='22222222-2222-4222-8222-222222222222';
const context=createTenantContext({userId:owner,via:'remote_getuser'});
const sql=(name:string)=>readFileSync(new URL('../../../../supabase/migrations/'+name,import.meta.url),'utf8');
before(async()=>{
  await db.connect();
  assert.equal((await db.query("SELECT to_regclass('public.production_audit_log') AS existing")).rows[0].existing,null,'Never overwrite an existing audit table');
  await db.query(`DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF; END $$;
    CREATE SCHEMA IF NOT EXISTS auth; CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS public.projects(id uuid PRIMARY KEY,user_id uuid);
    CREATE TABLE IF NOT EXISTS public.operations_environments(id uuid PRIMARY KEY);
    INSERT INTO auth.users(id) VALUES('${owner}'),('${foreign}') ON CONFLICT DO NOTHING;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;`);
  const a=sql('20260726153357_command3a_production_operations.sql');
  await db.query(a.slice(a.indexOf('CREATE TABLE public.production_audit_log ('),a.indexOf('CREATE INDEX production_evidence_release_observed_idx')));
  await db.query('ALTER TABLE production_audit_log ENABLE ROW LEVEL SECURITY; REVOKE ALL ON production_audit_log FROM anon,authenticated; GRANT ALL ON production_audit_log TO service_role;');
  const b=sql('20260726211546_command3b_operations_centre.sql');
  await db.query(b.slice(b.indexOf('ALTER TABLE public.production_audit_log'),b.indexOf('ALTER TABLE public.swarm_job_queue')));
  await db.query(b.slice(b.indexOf('CREATE OR REPLACE FUNCTION public.operations_reject_audit_mutation()'),b.indexOf('CREATE OR REPLACE FUNCTION public.operations_claim_action(')));
  await db.query(sql('20261015000200_immutable_audit_lifecycle.sql'));
});
after(async()=>{await db.end();});
function receipt(payload:unknown={query:'ordinary synthetic research'}){
  return decideEgress({context,actionClass:'READ',declaredClass:'PUBLIC',destination:'https://provider.example',recipient:'selected-provider',purpose:'synthetic-test',payload,
    binding:{userId:owner,provider:'fixture',connectedAccountId:'account-A',operation:'READ',targetDigest:preparedActionDigest(payload),planDigest:'a'.repeat(64)}});
}
function bridge(t:TestContext){
  const previous=[process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY];
  process.env.SUPABASE_URL='http://127.0.0.1:55435';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-loopback-only';
  t.after(()=>{for(const [i,key]of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'].entries()){if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];}});
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    const endpoint=new URL(String(input));assert.equal(endpoint.origin,'http://127.0.0.1:55435');assert.equal(endpoint.pathname,'/rest/v1/production_audit_log');assert.equal(init?.method,'POST');
    const row=JSON.parse(String(init?.body)),keys=Object.keys(row);
    assert.ok(keys.every(k=>['id','user_id','actor_id','project_id','environment_id','action','target_type','target_id','outcome','reason','correlation_id','evidence_reference','metadata'].includes(k)));
    try{
      const result=await db.query(`INSERT INTO production_audit_log(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING id,user_id,actor_id,action,outcome,metadata`,keys.map(k=>row[k]));
      return Response.json(result.rows[0]);
    }catch(error){return Response.json({message:'Synthetic database rejection',code:(error as {code?:string}).code},{status:400});}
  });
}
test('canonical receipt DAO persists exact safe metadata, rejects cross-tenant context and rolls back real inserts',async t=>{
  bridge(t);const r=receipt({text:'SYNTHETIC_CREDENTIAL_CANARY_NEVER_PERSIST'});
  assert.equal(r.reason,'SECRET_EGRESS_DENIED');
  await db.query('BEGIN; SET LOCAL ROLE service_role');
  try{
    await persistSecurityDecision(context,r);
    const row=(await db.query('SELECT * FROM production_audit_log WHERE id=$1',[r.id])).rows[0];
    assert.equal(row.user_id,owner);assert.equal(row.actor_id,owner);assert.deepEqual(row.metadata.payloadDigest,r.payloadDigest);
    assert.ok(!JSON.stringify(row).includes('SYNTHETIC_CREDENTIAL_CANARY'));assert.ok(!JSON.stringify(row).includes('provider.example'));
  }finally{await db.query('ROLLBACK');}
  assert.equal((await db.query('SELECT count(*)::int n FROM production_audit_log WHERE id=$1',[r.id])).rows[0].n,0);
  await assert.rejects(persistSecurityDecision(createTenantContext({userId:foreign,via:'remote_getuser'}),r),/ownership mismatch/);
  const positive=receipt();await persistSecurityDecision(context,positive);
  assert.equal((await db.query('SELECT id FROM production_audit_log WHERE id=$1',[positive.id])).rowCount,1);
  await assert.rejects(persistSecurityDecision(context,positive),/persistence unavailable/);
});
test('actual immutable audit triggers, missing subjects and browser privileges fail closed',async()=>{
  for(const role of ['anon','authenticated','service_role']){
    for(const statement of role==='service_role'?['UPDATE production_audit_log SET reason=reason','DELETE FROM production_audit_log','TRUNCATE production_audit_log']:['SELECT * FROM production_audit_log',"INSERT INTO production_audit_log(action,target_type,outcome) VALUES('forged','x','ALLOW')"]){
      await db.query('BEGIN');try{await db.query('SET LOCAL ROLE '+role);await assert.rejects(db.query(statement));}finally{await db.query('ROLLBACK');}
    }
  }
  await assert.rejects(db.query("INSERT INTO production_audit_log(actor_id,action,target_type,outcome) VALUES($1,'synthetic','x','ALLOW')",[randomUUID()]),{code:'23503'});
});

test('actual file adapter sees committed ownership change during pinned DNS wait and sends zero bytes',async t=>{
  bridge(t);
  await db.query(`CREATE TABLE IF NOT EXISTS project_files(id uuid PRIMARY KEY,project_id uuid);
    ALTER TABLE project_files ADD COLUMN IF NOT EXISTS file_name text, ADD COLUMN IF NOT EXISTS file_path text,
    ADD COLUMN IF NOT EXISTS file_url text,ADD COLUMN IF NOT EXISTS file_type text,ADD COLUMN IF NOT EXISTS content text,
    ADD COLUMN IF NOT EXISTS storage_metadata jsonb,ADD COLUMN IF NOT EXISTS delivery_version integer;`);
  const projectId=randomUUID(),fileId=randomUUID(),content='ordinary synthetic file';
  await db.query('INSERT INTO projects(id,user_id) VALUES($1,$2)',[projectId,owner]);
  await db.query("INSERT INTO project_files(id,project_id,file_name,file_path,file_type,content,delivery_version) VALUES($1,$2,'fixture.txt','fixture.txt','other',$3,1)",[fileId,projectId,content]);
  const queryClient={from:(table:string)=>{
    assert.equal(table,'project_files');const filters:Record<string,string>={};
    const query={select:()=>query,eq:(key:string,value:string)=>{filters[key]=value;return query;},maybeSingle:async()=>{
      const result=await db.query("SELECT f.*,json_build_object('user_id',p.user_id) projects FROM project_files f JOIN projects p ON p.id=f.project_id WHERE f.id=$1 AND f.project_id=$2 AND p.user_id=$3",[filters.id,filters.project_id,filters['projects.user_id']]);
      return {data:result.rows[0]??null,error:null};}};return query;
  }} as unknown as SupabaseClient;
  const destination='https://provider.example/upload',recipient='selected-recipient';
  const payload={projectId,fileId,destination,recipient,sha256:createHash('sha256').update(content).digest('hex')};
  const scope:PreparedAuthorityScope={version:'1',userId:owner,tenantId:owner,provider:'fixture',connectedAccountId:'account-A',operation:'UPLOAD_FILE',targetDigest:preparedActionDigest(payload),planDigest:'b'.repeat(64),actionClass:'EXTERNAL_UPLOAD',risk:'write',projectId,runId:null,issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),nonce:'synthetic',maxSpendMicroUsd:null,currency:null};
  const claim={id:'synthetic-claim',userId:owner,scopeDigest:preparedActionDigest(scope),expiresAt:scope.expiresAt,claimedAt:new Date().toISOString()};
  const binding={userId:owner,provider:scope.provider,connectedAccountId:scope.connectedAccountId,operation:scope.operation,targetDigest:scope.targetDigest,planDigest:scope.planDigest};
  let positiveEffects=0;
  await executeAuthorizedAction({context,scope,claim:{...claim,id:'synthetic-positive'},revalidateBeforeEffect:async()=>({...claim,id:'synthetic-positive'})},async permit=>{
    const result=await executeOwnedFileEgress({context,binding,authorityPermit:permit,projectId,fileId,destination,recipient,purpose:'synthetic-upload'},r=>persistSecurityDecision(context,r),queryClient,{
      resolve:async()=>[{address:'8.8.8.8',family:4}],open:async(_url,_lookup,_signal,bytes)=>{positiveEffects++;assert.equal(bytes.toString(),content);return Object.assign(Readable.from([]),{statusCode:201,headers:{}}) as IncomingMessage;},
    });assert.equal(result.statusCode,201);
  });assert.equal(positiveEffects,1);
  let wake!:()=>void,entered!:()=>void,effects=0;
  const waiting=new Promise<void>(resolve=>{entered=resolve;}),release=new Promise<void>(resolve=>{wake=resolve;});
  await executeAuthorizedAction({context,scope,claim,revalidateBeforeEffect:async()=>claim},async permit=>{
    const operation=executeOwnedFileEgress({context,binding,authorityPermit:permit,projectId,fileId,destination,recipient,purpose:'synthetic-upload'},r=>persistSecurityDecision(context,r),queryClient,{
      resolve:async()=>{entered();await release;return [{address:'8.8.8.8',family:4}];},
      open:async()=>{effects++;return Object.assign(Readable.from([]),{statusCode:201,headers:{}}) as IncomingMessage;},
    });
    const denied=assert.rejects(operation,/outcome unavailable/);
    await Promise.race([waiting,new Promise<never>((_,reject)=>{const timer=setTimeout(()=>reject(Error('DNS barrier not reached')),4000);timer.unref();})]);
    const writer=new pg.Client({connectionString:url});await writer.connect();
    try{await writer.query('BEGIN');await writer.query('UPDATE projects SET user_id=$1 WHERE id=$2',[foreign,projectId]);await writer.query('COMMIT');}finally{await writer.end();wake();}
    await denied;
  });assert.equal(effects,0);assert.equal((await db.query('SELECT user_id FROM projects WHERE id=$1',[projectId])).rows[0].user_id,foreign);
});
