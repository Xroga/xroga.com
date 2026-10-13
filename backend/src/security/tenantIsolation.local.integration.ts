/** Explicit CI integration suite: actual disposable Supabase/Auth/PG/PostgREST and API, no mocks. */
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createTenantContext, type TenantContext } from './tenantContext.js';
import { requireOwnedResource, requireOwnedFile } from './ownership.js';
import { persistOwnedRun, persistOwnedRuntimeSession, persistOwnedRunTrace } from './ownedRunPersistence.js';
import { listUserProviderKeys } from '../services/integrations/userProviderKeys.js';
import { reconcileOrphanedRuns,failInFlightRuns } from '../ai/runReconciler.js';
import { getCachedResponse,setCachedResponse } from '../services/responseCache.js';
import { notifyBuildFailed } from '../services/notificationService.js';
import pg from 'pg';
import { SupabaseProjectRuntimeStore } from '../synthesis/projectRuntime/store.js';
import { createCanonicalExecutionState,SupabaseExecutionStateStore } from '../ai/executionRuntime.js';
import { SupabaseUniversalStore } from '../synthesis/universalPersistence.js';
import { synthesizeUniversalProductSpec } from '../synthesis/universalProductSpec.js';
import { planArchitecture } from '../synthesis/architecturePlan.js';
import { buildOutcomeFromTerminalRun,SupabaseBuildOutcomeStore } from '../ai/buildOutcomeMemory.js';
import { createEvidence } from '../synthesis/researchEvidence.js';
import type { PlanMutation } from '../synthesis/dynamicPlanning.js';
import { BUILD_OUTCOME_RETENTION_MS } from '../ai/learningPolicy.js';
import { saveGitHubTokenToStorage,getGitHubTokenFromStorage } from '../services/integrations/githubTokenStore.js';
import { reserveProviderBudget,settleProviderBudget } from '../ai/providerBudget.js';
import { storeProjectFile } from '../services/storage/projectFiles.js';
import { ownedFile } from '../services/storage/privateFileDelivery.js';
import { signFileLink } from '../services/storage/fileDeliveryPolicy.js';

if(process.env.CI !== 'true' || process.env.XB01_DISPOSABLE_SUPABASE !== '1' || process.env.SUPABASE_URL !== 'http://127.0.0.1:54321' || process.env.E2E_BACKEND_URL !== 'http://127.0.0.1:4000') throw new Error('Real disposable loopback services required; no hosted/prod fallback');
const url=process.env.SUPABASE_URL, api=process.env.E2E_BACKEND_URL;
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const users: Array<{id:string;token:string;context:TenantContext;project:string;file:string;run:string;provider:string;session:string;cost:string}>=[];
async function request(path:string,token?:string,method='GET',body?:unknown) {
  return fetch(`${api}${path}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
}
async function insert(table:string,row:Record<string,unknown>,key='id'):Promise<string> {
  const result=await admin.from(table).insert(row).select(key).single();
  assert.equal(result.error,null,`fixture insert ${table} failed`);
  return String((result.data as unknown as Record<string,unknown>)[key]);
}
before(async()=>{
  for(let index=0;index<2;index++) {
    const email=`xb01-tenant-${randomUUID()}@example.invalid`,password=`Ci!${randomUUID()}Aa9`;
    const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(created.error,null);assert.ok(created.data.user);
    const id=created.data.user.id;
    // Register cleanup immediately even if a later provisioning assertion fails.
    const fixture={id,token:'',context:createTenantContext({userId:id,via:'remote_getuser'}),project:'',file:'',run:'',provider:'',session:'',cost:''};users.push(fixture);
    const client=createClient(url,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
    const login=await client.auth.signInWithPassword({email,password});assert.equal(login.error,null);assert.ok(login.data.session);
    fixture.token=login.data.session.access_token;
    const verified=await admin.auth.getUser(fixture.token);assert.equal(verified.error,null);assert.equal(verified.data.user?.id,id);
    fixture.project=await insert('projects',{user_id:id,name:'Isolated tenant fixture',type:'app'});
    fixture.file=await insert('project_files',{project_id:fixture.project,file_name:'fixture.txt',content:'fictional test data'});
    fixture.run=await insert('swarm_runs',{user_id:id,prompt:'Fixture only',status:'pending'});
    fixture.provider=await insert('user_integrations',{user_id:id,provider:'apikey_openai',access_token:'SYNTHETIC_PRIVATE_CANARY_NOT_A_CREDENTIAL',metadata:{provider:'openai',masked:'••••',connected_at:new Date().toISOString()}});
    fixture.session=await insert('project_runtime_sessions',{session_id:randomUUID(),user_id:id,project_id:fixture.project,provider_id:'fixture-no-execution',runtime_class:'interactive',status:'stopped',state:{}},'session_id');
    fixture.cost=await insert('ai_usage_ledger',{user_id:id,model_id:'fixture-no-provider',pool_role:'test',cost_usd:0});
  }
});
after(async()=>{for(const user of users){const deleted=await admin.auth.admin.deleteUser(user.id);assert.equal(deleted.error,null,'temporary fixture cleanup failed');}});

test('real owner helpers deny every foreign high-risk resource without enumerating data',async()=>{
  const [owner,other]=users;
  for(const [kind,key] of [['project','project'],['run','run'],['provider_connection','provider'],['runtime_session','session'],['cost_record','cost']] as const) {
    await requireOwnedResource(owner.context,kind,owner[key],admin);
    await assert.rejects(requireOwnedResource(owner.context,kind,other[key],admin),{status:404});
  }
  await requireOwnedFile(owner.context,owner.file,admin);
  await assert.rejects(requireOwnedFile(owner.context,other.file,admin),{status:404});
});
test('actual API ignores client owner and rejects foreign project/file access and unsigned requests',async()=>{
  const [owner,other]=users;
  for(const path of [`/api/projects/${other.project}`,`/api/projects/${other.project}/files`,`/api/projects/${other.project}/code`]) assert.equal((await request(path,owner.token)).status,404);
  assert.equal((await request(`/api/projects/${owner.project}/files`,owner.token)).status,200);
  assert.equal((await request('/api/projects')).status,401);
  const created=await request('/api/projects',owner.token,'POST',{name:'Ignored client owner',type:'app',user_id:other.id,userId:other.id});
  assert.equal(created.status,201);
  const payload: unknown = await created.json();
  assert.ok(payload && typeof payload === 'object' && 'user_id' in payload);
  assert.equal(payload.user_id,owner.id);
});

test('real durable database file delivery is owner-only, bounded, expiring and atomically revocable',async()=>{
  const [owner,other]=users;
  const saved=await storeProjectFile(owner.id,owner.project,'private-fixture.txt','PRIVATE_FILE_FIXTURE_ONLY','text/plain','other');
  const path=`/api/projects/${owner.project}/files/${saved.id}`;
  assert.equal((await request(`${path}/download`)).status,401);
  for(const suffix of ['/download','/link','/links'])assert.equal((await request(`${path}${suffix}`,other.token,suffix==='/link'?'POST':suffix==='/links'?'DELETE':'GET',suffix==='/link'?{}:undefined)).status,404);
  const direct=await request(`${path}/download`,owner.token);assert.equal(direct.status,200);assert.equal(await direct.text(),'PRIVATE_FILE_FIXTURE_ONLY');
  assert.match(direct.headers.get('cache-control')!,/no-store/);assert.equal(direct.headers.get('x-content-type-options'),'nosniff');
  assert.equal((await request(`${path}/link`,owner.token,'POST',{expiresIn:301})).status,400);
  assert.equal((await request(`${path}/link`,owner.token,'POST',{expiresIn:60,userId:other.id})).status,400);
  const created=await request(`${path}/link`,owner.token,'POST',{expiresIn:60});assert.equal(created.status,200);
  const link=await created.json() as {url:string;expiresAt:string};
  const token=new URL(link.url,'http://127.0.0.1').searchParams.get('link')!;assert.ok(token);
  assert.equal((await request(`${path}/download?link=${encodeURIComponent(token)}`,owner.token)).status,200);
  assert.equal((await request(`${path}/download?link=${encodeURIComponent(token)}`,other.token)).status,404);
  assert.equal((await request(`${path}/download?link=`,owner.token)).status,404);
  assert.equal((await request(`${path}/download?link=${encodeURIComponent(token.slice(0,-3)+'abc')}`,owner.token)).status,404);
  const row=await ownedFile(owner.context,owner.project,saved.id,admin);
  const expired=await signFileLink(owner.context,row,1,Date.now()-10_000);
  assert.equal((await request(`${path}/download?link=${encodeURIComponent(expired.token)}`,owner.token)).status,404);
  const revocations=await Promise.all(Array.from({length:4},()=>request(`${path}/links`,owner.token,'DELETE')));
  assert.ok(revocations.every(response=>response.status===200));
  const updated=await admin.from('project_files').select('delivery_version').eq('id',saved.id).single();assert.equal(updated.error,null);assert.equal(updated.data?.delivery_version,row.delivery_version+4);
  assert.ok((await admin.from('project_files').update({delivery_version:row.delivery_version}).eq('id',saved.id)).error);
  assert.equal((await request(`${path}/download?link=${encodeURIComponent(token)}`,owner.token)).status,404);
  assert.equal((await request(`${path}/download`,owner.token)).status,200);
  const range=await fetch(`${api}${path}/download`,{headers:{Authorization:`Bearer ${owner.token}`,Range:'bytes=0-6'}});assert.equal(range.status,206);assert.equal(await range.text(),'PRIVATE');
  assert.equal((await fetch(`${api}${path}/download`,{headers:{Authorization:`Bearer ${owner.token}`,Range:'bytes=999-1000'}})).status,416);
});

test('real RLS and metadata trigger deny client delivery forgery while preserving allowed owner inserts and server edits',async()=>{
  const [owner,other]=users;
  const client=createClient(url,process.env.SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${owner.token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const ownRead=await client.from('project_files').select('id').eq('id',owner.file);assert.equal(ownRead.error,null);assert.equal(ownRead.data?.length,1);
  const ownInsert=await client.from('project_files').insert({project_id:owner.project,file_name:'legitimate isolated insert',content:'owner fixture'}).select('id');assert.equal(ownInsert.error,null);assert.equal(ownInsert.data?.length,1);
  // The complete historical chain permits browser SELECT/INSERT, NOT UPDATE.
  // Preserve that denial; never add a permissive policy to satisfy a mistaken fixture.
  const ownEdit=await client.from('project_files').update({content:'forbidden client edit'}).eq('id',owner.file).select('id');assert.equal(ownEdit.error,null);assert.equal(ownEdit.data?.length,0);
  await ownedFile(owner.context,owner.project,owner.file,admin);
  const serverEdit=await admin.from('project_files').update({content:'legitimate server edit'}).eq('id',owner.file).eq('project_id',owner.project).select('id');assert.equal(serverEdit.error,null);assert.equal(serverEdit.data?.length,1);
  const foreignEdit=await client.from('project_files').update({content:'forbidden edit'}).eq('id',other.file).select('id');assert.equal(foreignEdit.error,null);assert.equal(foreignEdit.data?.length,0);
  for(const patch of [{delivery_version:9},{storage_metadata:{provider:'database',ownerId:owner.id}}]) {
    const denied=await client.from('project_files').update(patch).eq('id',owner.file).select('id');
    assert.ok(denied.error || denied.data?.length===0);
    const preserved=await admin.from('project_files').select('delivery_version,storage_metadata,content').eq('id',owner.file).single();assert.equal(preserved.error,null);
    assert.equal(preserved.data?.delivery_version,1);assert.equal(preserved.data?.storage_metadata,null);assert.equal(preserved.data?.content,'legitimate server edit');
  }
  assert.ok((await client.from('project_files').insert({project_id:owner.project,file_name:'forged',storage_metadata:{ownerId:owner.id}})).error);
  assert.ok((await client.from('project_files').insert({project_id:other.project,file_name:'foreign'})).error);
  assert.ok((await client.rpc('revoke_project_file_links',{p_project_id:owner.project,p_file_id:owner.file,p_owner_id:owner.id})).error);
  const anon=createClient(url,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  assert.ok((await anon.rpc('revoke_project_file_links',{p_project_id:owner.project,p_file_id:owner.file,p_owner_id:owner.id})).error);
  const mismatch=await admin.from('project_files').update({storage_metadata:{ownerId:other.id}}).eq('id',owner.file);assert.ok(mismatch.error);
  const foreign=await admin.rpc('revoke_project_file_links',{p_project_id:other.project,p_file_id:other.file,p_owner_id:owner.id});assert.equal(foreign.error,null);assert.equal(foreign.data,null);
});

test('unconfigured binary storage issues no durable receipt and legacy public or data URLs are not delivered',async()=>{
  const [owner]=users;
  assert.equal(process.env.CLOUDFLARE_R2_PRIVATE_BUCKET,undefined);
  const filename=`missing-private-store-${randomUUID()}.bin`;
  await assert.rejects(storeProjectFile(owner.id,owner.project,filename,Buffer.from('FICTIONAL_BINARY'),'application/octet-stream','other'),{status:503});
  const rows=await admin.from('project_files').select('id').eq('project_id',owner.project).eq('file_name',filename);assert.equal(rows.error,null);assert.deepEqual(rows.data,[]);
  for(const file_url of ['https://public.example.invalid/private-object','data:text/plain,NOT_DURABLE']) {
    const id=await insert('project_files',{project_id:owner.project,file_name:'legacy-no-private-copy',file_url,content:null});
    const delivery=await request(`/api/projects/${owner.project}/files/${id}/download`,owner.token);assert.equal(delivery.status,503);
    const safe=await delivery.text();assert.ok(!safe.includes(file_url));assert.ok(!safe.includes('stack'));
    assert.equal((await request(`/api/projects/${owner.project}/files/${id}/link`,owner.token,'POST',{})).status,503);
    const listing=await request(`/api/projects/${owner.project}/files`,owner.token);const list=await listing.json() as Array<Record<string,unknown>>;
    const record=list.find(row=>row.id===id)!;assert.equal(record.file_url,null);assert.ok(!('storage_metadata' in record));assert.ok(!('delivery_version' in record));
  }
});
test('real run persistence concurrent collision never transfers the durable owner',async()=>{
  const [owner,other]=users,id=randomUUID();
  const outcomes=await Promise.allSettled(users.map(user=>persistOwnedRun(admin,user.context,{id,user_id:user.id,prompt:'Concurrent fixture',status:'pending'})));
  assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1);
  const stored=await admin.from('swarm_runs').select('user_id').eq('id',id).single();assert.equal(stored.error,null);
  assert.ok([owner.id,other.id].includes(stored.data!.user_id));
  const loser=users.find(user=>user.id!==stored.data!.user_id)!;
  await assert.rejects(persistOwnedRun(admin,loser.context,{id,user_id:loser.id,prompt:'Forbidden overwrite',status:'failed'}),{status:404});
  const unchanged=await admin.from('swarm_runs').select('user_id,status').eq('id',id).single();assert.equal(unchanged.data?.user_id,stored.data!.user_id);assert.equal(unchanged.data?.status,'pending');
});

test('canonical execution store denies foreign overwrite and corrupt resume state against real database',async()=>{
  const [owner,other]=users,foreignStore=new SupabaseExecutionStateStore(other.id),ownStore=new SupabaseExecutionStateStore(owner.id),runId=randomUUID();
  const state=createCanonicalExecutionState({runId,projectId:other.project,files:[{path:'private.txt',content:'FOREIGN_EXECUTION_STATE_CANARY'}]});
  await foreignStore.save(state);
  await assert.rejects(ownStore.save(createCanonicalExecutionState({runId,projectId:owner.project})),{status:404});
  assert.equal(await ownStore.load(runId),null);
  const preserved=await foreignStore.load(runId);assert.ok(JSON.stringify(preserved).includes('FOREIGN_EXECUTION_STATE_CANARY'));
  for(const mutation of [{runId:randomUUID()},{projectId:owner.project}]) {
    assert.equal((await admin.from('execution_runs').update({state:{...state,...mutation}}).eq('run_id',runId)).error,null);
    assert.equal(await foreignStore.load(runId),null);
  }
  assert.equal((await admin.from('execution_runs').update({state}).eq('run_id',runId)).error,null);
  const collision=randomUUID();
  const outcomes=await Promise.allSettled(users.map(user=>new SupabaseExecutionStateStore(user.id).save(createCanonicalExecutionState({runId:collision,projectId:user.project}))));
  assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1);
  const actual=await admin.from('execution_runs').select('user_id').eq('run_id',collision).single();assert.equal(actual.error,null);assert.ok(users.some(user=>user.id===actual.data?.user_id));
});

test('real universal spec and plan collision cannot transfer ownership or reference a foreign parent',async()=>{
  const [owner,other]=users,a=new SupabaseUniversalStore(admin,owner.context),b=new SupabaseUniversalStore(admin,other.context);
  const actor={userId:owner.id,projectId:owner.project},attacker={userId:other.id,projectId:owner.project};
  const spec=synthesizeUniversalProductSpec({prompt:'Build a fictional task API'}),plan=planArchitecture({spec});
  assert.equal((await a.saveSpec(actor,spec)).saved,true);
  assert.equal((await b.saveSpec(attacker,spec)).saved,false);
  const specId=`${owner.project}:${spec.createdAt}`;
  const row=await admin.from('project_specs').select('user_id').eq('spec_id',specId).single();assert.equal(row.error,null);assert.equal(row.data?.user_id,owner.id);
  assert.equal(await b.loadLatestSpec(attacker),null);
  assert.equal((await a.savePlan(actor,plan,specId)).saved,true);
  assert.equal((await b.savePlan(attacker,plan,specId)).saved,false);
  assert.equal((await b.savePlan(attacker,plan)).saved,false);
  const persisted=await admin.from('architecture_plans').select('user_id,spec_id').eq('plan_id',`${owner.project}:${plan.createdAt}`).single();assert.equal(persisted.error,null);assert.equal(persisted.data?.user_id,owner.id);assert.equal(persisted.data?.spec_id,specId);
});

test('real repository index cannot be read deleted overwritten or have children removed by another tenant',async()=>{
  const [owner,other]=users,a=new SupabaseUniversalStore(admin,owner.context),b=new SupabaseUniversalStore(admin,other.context);
  const identity={projectId:owner.project,repositoryId:'fixture/local',repositoryOwner:'fixture',repositoryName:'local',branch:'main'};
  const index={identity,schemaVersion:'1.0.0',indexedCommitSha:'fixture-no-real-commit',treeSha:null,files:[],updatedAt:new Date().toISOString()};
  await a.save(index);
  const id=`${identity.projectId}:${identity.repositoryId}:${identity.branch}`;
  const file=await insert('repository_index_files',{index_id:id,user_id:owner.id,file_path:'private.txt',blob_sha:'fixture-no-real-blob',summary:'PRIVATE_INDEX_CANARY'});
  assert.equal(await b.load(identity),null);await b.delete(identity);
  await assert.rejects(b.save({...index,indexedCommitSha:'Forbidden overwrite'}),{status:404});
  const row=await admin.from('repository_indexes').select('user_id,indexed_commit_sha').eq('index_id',id).single();assert.equal(row.error,null);assert.equal(row.data?.user_id,owner.id);assert.equal(row.data?.indexed_commit_sha,'fixture-no-real-commit');
  const child=await admin.from('repository_index_files').select('id,summary').eq('id',file).single();assert.equal(child.error,null);assert.equal(child.data?.summary,'PRIVATE_INDEX_CANARY');
  assert.ok((await a.load(identity))?.files.some(entry=>entry.summary==='PRIVATE_INDEX_CANARY'));
});

test('real sanitized outcome learning record cannot transfer owner on a run-ID collision',async()=>{
  const [owner,other]=users,store=new SupabaseBuildOutcomeStore(),runId=randomUUID();
  const outcome=buildOutcomeFromTerminalRun({runId,userId:other.id,terminalStatus:'error',iterationCount:0,output:null,routingOutcomes:[]});
  await store.upsert(outcome);
  await assert.rejects(store.upsert({...outcome,userId:owner.id}),{status:404});
  const existing=await admin.from('build_outcomes').select('user_id,terminal_status').eq('run_id',runId).single();assert.equal(existing.error,null);assert.equal(existing.data?.user_id,other.id);assert.equal(existing.data?.terminal_status,'error');
  const collision=randomUUID();
  const outcomes=await Promise.allSettled(users.map(user=>store.upsert(buildOutcomeFromTerminalRun({runId:collision,userId:user.id,terminalStatus:'error',iterationCount:0,output:null,routingOutcomes:[]}))));
  assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1);
  const persisted=await admin.from('build_outcomes').select('user_id').eq('run_id',collision).single();assert.equal(persisted.error,null);assert.ok(users.some(user=>user.id===persisted.data?.user_id));
});

test('real research parent and evidence collisions preserve source ownership and reject mismatched linkage',async()=>{
  const [owner,other]=users,a=new SupabaseUniversalStore(admin,owner.context),b=new SupabaseUniversalStore(admin,other.context),foreignRun=randomUUID();
  const evidence=createEvidence({researchRunId:foreignRun,provider:'fixture',query:'Fictional only',sourceUrl:'https://example.invalid/fixture',content:'Fictional research canary',fact:'Fictional research canary',freshnessClass:'version_sensitive',conflictGroup:'fixture'});
  assert.equal((await b.saveResearchEvidence({userId:other.id,projectId:other.project},foreignRun,[evidence])).saved,true);
  assert.equal((await a.saveResearchEvidence({userId:owner.id,projectId:owner.project},foreignRun,[evidence])).saved,false);
  const ownRun=randomUUID();
  assert.equal((await a.saveResearchEvidence({userId:owner.id,projectId:owner.project},ownRun,[evidence])).saved,false);
  // Matching own parent does not authorize an evidence ID belonging to someone else.
  assert.equal((await a.saveResearchEvidence({userId:owner.id,projectId:owner.project},ownRun,[{...evidence,researchRunId:ownRun}])).saved,false);
  const parent=await admin.from('research_runs').select('user_id').eq('research_run_id',foreignRun).single();assert.equal(parent.error,null);assert.equal(parent.data?.user_id,other.id);
  const child=await admin.from('research_evidence').select('user_id,research_run_id,fact').eq('evidence_id',evidence.evidenceId).single();assert.equal(child.error,null);assert.equal(child.data?.user_id,other.id);assert.equal(child.data?.research_run_id,foreignRun);assert.equal(child.data?.fact,'Fictional research canary');
});

test('real planning mutation replay is append-only and a foreign collision is not reported as saved',async()=>{
  const [owner,other]=users,a=new SupabaseUniversalStore(admin,owner.context),b=new SupabaseUniversalStore(admin,other.context),runId=randomUUID();
  const mutation:PlanMutation={schemaVersion:'1.0.0',mutationKey:randomUUID(),kind:'add_task',runId,triggeredByTaskId:null,reason:'OWNER_MUTATION_CANARY',evidence:[],at:new Date().toISOString(),payload:{fixture:'no execution'}};
  const actor={userId:owner.id,projectId:owner.project},attacker={userId:other.id,projectId:other.project};
  assert.equal((await a.saveMutations(actor,runId,[mutation])).saved,true);
  assert.equal((await a.saveMutations(actor,runId,[{...mutation,reason:'Forbidden replay change'}])).saved,true);
  assert.equal((await b.saveMutations(attacker,runId,[mutation])).saved,false);
  assert.equal((await a.saveMutations(actor,randomUUID(),[mutation])).saved,false);
  assert.equal((await a.saveMutations({...actor,projectId:randomUUID()},runId,[mutation])).saved,false);
  assert.deepEqual(await b.loadMutations(attacker,runId),[]);
  const stored=await admin.from('plan_mutations').select('user_id,reason').eq('mutation_key',mutation.mutationKey).single();assert.equal(stored.error,null);assert.equal(stored.data?.user_id,owner.id);assert.equal(stored.data?.reason,'OWNER_MUTATION_CANARY');
});

test('real outcome retention deletes only expired records owned by its captured actor',async()=>{
  const [owner,other]=users,store=new SupabaseBuildOutcomeStore(),ids=[randomUUID(),randomUUID()];
  const old=new Date(Date.now()-BUILD_OUTCOME_RETENTION_MS-86400000).toISOString();
  for(let index=0;index<users.length;index++)await store.upsert(buildOutcomeFromTerminalRun({runId:ids[index],userId:users[index].id,terminalStatus:'error',iterationCount:0,output:null,routingOutcomes:[]}));
  assert.equal((await admin.from('build_outcomes').update({updated_at:old}).in('run_id',ids)).error,null);
  const expired=await admin.from('build_outcomes').select('run_id,updated_at').in('run_id',ids);assert.equal(expired.error,null);assert.equal(expired.data?.length,2);assert.ok(expired.data?.every(row=>Date.parse(row.updated_at)<Date.now()-BUILD_OUTCOME_RETENTION_MS));
  await store.upsert(buildOutcomeFromTerminalRun({runId:randomUUID(),userId:owner.id,terminalStatus:'error',iterationCount:0,output:null,routingOutcomes:[]}));
  const own=await admin.from('build_outcomes').select('run_id').eq('run_id',ids[0]).maybeSingle();assert.equal(own.error,null);assert.equal(own.data,null);
  const foreign=await admin.from('build_outcomes').select('run_id,user_id').eq('run_id',ids[1]).single();assert.equal(foreign.error,null);assert.equal(foreign.data?.user_id,other.id);
});
test('real terminal autosave collision denies foreign id and preserves transcript',async()=>{
  const [owner,other]=users,id=`fixture-${randomUUID()}`;
  const row={githubRepoName:'fixture/local',messages:[{role:'user',content:'Private fixture'}],title:'Owner fixture'};
  assert.equal((await request(`/api/terminal-sessions/${id}`,owner.token,'PUT',row)).status,200);
  const denied=await request(`/api/terminal-sessions/${id}`,other.token,'PUT',{...row,title:'Forbidden takeover',userId:owner.id});assert.equal(denied.status,404);
  assert.equal((await request(`/api/terminal-sessions/${id}`,other.token)).status,404);
  const stored=await admin.from('terminal_sessions').select('user_id,title,messages').eq('id',id).single();assert.equal(stored.error,null);assert.equal(stored.data?.user_id,owner.id);assert.equal(stored.data?.title,'Owner fixture');
});

test('real run trace collision and concurrent creation preserve trace ownership and private evidence',async()=>{
  const [owner,other]=users;
  await persistOwnedRunTrace(admin,other.context,{run_id:other.run,user_id:other.id,stages:[{message:'FOREIGN_TRACE_CANARY'}],meta:{fixture:true}});
  await assert.rejects(persistOwnedRunTrace(admin,owner.context,{run_id:other.run,user_id:owner.id,stages:[{message:'Forbidden overwrite'}],meta:{}}),{status:404});
  const unchanged=await admin.from('swarm_run_traces').select('user_id,stages').eq('run_id',other.run).single();assert.equal(unchanged.error,null);assert.equal(unchanged.data?.user_id,other.id);assert.ok(JSON.stringify(unchanged.data?.stages).includes('FOREIGN_TRACE_CANARY'));
  const run_id=randomUUID();
  const outcomes=await Promise.allSettled(users.map(user=>persistOwnedRunTrace(admin,user.context,{run_id,user_id:user.id,stages:[],meta:{}})));
  assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1);
  const persisted=await admin.from('swarm_run_traces').select('user_id').eq('run_id',run_id).single();assert.equal(persisted.error,null);assert.ok(users.some(user=>user.id===persisted.data?.user_id));
});
test('existing runtime session persistence cannot take over a foreign durable session',async()=>{
  const [owner,other]=users;
  await assert.rejects(persistOwnedRuntimeSession(admin,owner.context,{session_id:other.session,user_id:owner.id,project_id:owner.project,provider_id:'fixture-no-execution',runtime_class:'interactive',status:'failed',state:{}}),{status:404});
  const row=await admin.from('project_runtime_sessions').select('user_id,status').eq('session_id',other.session).single();
  assert.equal(row.error,null);assert.equal(row.data?.user_id,other.id);assert.equal(row.data?.status,'stopped');
});

test('real runtime restore rejects owner session and project mismatches in persisted JSON',async()=>{
  const owner=users[0],store=new SupabaseProjectRuntimeStore();
  // Binding fixture only: never passed to a provider or executed as a runtime.
  const state={userId:owner.id,sessionId:owner.session,projectId:owner.project,providerState:{fixture:'no execution'}};
  try {
    assert.equal((await admin.from('project_runtime_sessions').update({state}).eq('session_id',owner.session)).error,null);
    assert.equal((await store.loadSession(owner.id,owner.session))?.userId,owner.id);
    for(const mutation of [{userId:users[1].id},{sessionId:users[1].session},{projectId:users[1].project}]) {
      assert.equal((await admin.from('project_runtime_sessions').update({state:{...state,...mutation}}).eq('session_id',owner.session)).error,null);
      assert.equal(await store.loadSession(owner.id,owner.session),null);
    }
    assert.equal(await store.loadSession(users[1].id,owner.session),null);
  } finally {assert.equal((await admin.from('project_runtime_sessions').update({state:{}}).eq('session_id',owner.session)).error,null);}
});
test('provider metadata uses real schema and owner filters without returning encrypted/raw credentials',async()=>{
  const owner=users[0];
  const rows=await listUserProviderKeys(owner.id);assert.equal(rows.length,1);assert.equal(rows[0].provider,'openai');
  const response=await request('/api/integrations/provider-keys',owner.token);assert.equal(response.status,200);
  const text=await response.text();assert.ok(!text.includes('SYNTHETIC_PRIVATE_CANARY'));assert.ok(!text.includes('access_token'));
});

test('real private OAuth storage cannot be downloaded or signed by browser roles or another tenant',async()=>{
  const [owner,other]=users,bucket='xroga-github-tokens',path=`${owner.id}/github.json`;
  const canary='SYNTHETIC_PRIVATE_STORAGE_CANARY_NOT_A_PROVIDER_CREDENTIAL';
  try {
    assert.equal(await saveGitHubTokenToStorage(owner.id,{access_token:canary,username:'fixture',provider_user_id:'fixture',repo_strategy:'auto',default_repo:null,updated_at:new Date().toISOString()}),true);
    const config=await admin.storage.getBucket(bucket);assert.equal(config.error,null);assert.equal(config.data?.public,false);
    assert.equal((await getGitHubTokenFromStorage(owner.id))?.access_token,canary);
    assert.equal(await getGitHubTokenFromStorage(other.id),null);
    for(const bearer of [undefined,owner.token,other.token]) {
      const client=createClient(url,process.env.SUPABASE_ANON_KEY!,{...(bearer?{global:{headers:{Authorization:`Bearer ${bearer}`}}}:{}),auth:{persistSession:false,autoRefreshToken:false}});
      const read=await client.storage.from(bucket).download(path);assert.ok(read.error);assert.equal(read.data,null);
      const signed=await client.storage.from(bucket).createSignedUrl(path,60);assert.ok(signed.error);assert.equal(signed.data,null);
    }
    const publicRead=await fetch(`${url}/storage/v1/object/public/${bucket}/${path}`,{headers:{apikey:process.env.SUPABASE_ANON_KEY!}});assert.equal(publicRead.ok,false);assert.ok(!(await publicRead.text()).includes(canary));
    const status=await request('/api/github/status',other.token);assert.equal(status.status,200);assert.equal((await status.json() as {connected:boolean}).connected,false);
  } finally {const removed=await admin.storage.from(bucket).remove([path]);assert.equal(removed.error,null,'temporary private object cleanup failed');}
});

test('notification list and mutations cannot read or alter another owner notification',async()=>{
  const [owner,other]=users;
  const own=await insert('notifications',{user_id:owner.id,title:'OWN_NOTIFICATION_CANARY',message:'Fixture only',read:false});
  const foreign=await insert('notifications',{user_id:other.id,title:'FOREIGN_NOTIFICATION_CANARY',message:'Fixture only',read:false});
  const listed=await request('/api/notifications',owner.token);assert.equal(listed.status,200);
  const text=await listed.text();assert.ok(text.includes('OWN_NOTIFICATION_CANARY'));assert.ok(!text.includes('FOREIGN_NOTIFICATION_CANARY'));
  // Existing idempotent mutation contract stays 200, but no foreign row changes.
  assert.equal((await request(`/api/notifications/${foreign}/read`,owner.token,'PATCH',{user_id:other.id})).status,200);
  assert.equal((await request(`/api/notifications/${foreign}`,owner.token,'DELETE')).status,200);
  const unchanged=await admin.from('notifications').select('user_id,read').eq('id',foreign).single();assert.equal(unchanged.error,null);assert.equal(unchanged.data?.read,false);assert.equal(unchanged.data?.user_id,other.id);
  assert.equal((await request(`/api/notifications/${own}/read`,owner.token,'PATCH',{})).status,200);
  const updated=await admin.from('notifications').select('read').eq('id',own).single();assert.equal(updated.data?.read,true);
  const client=createClient(url,process.env.SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${owner.token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const hidden=await client.from('notifications').select('id').eq('id',foreign);assert.equal(hidden.error,null);assert.deepEqual(hidden.data,[]);
  assert.equal((await request('/api/notifications')).status,401);
});

test('profile activity keeps own and project-less entries but redacts a corrupt foreign project join',async()=>{
  const [owner,other]=users;
  assert.equal((await admin.from('projects').update({name:'FOREIGN_PROJECT_NAME_CANARY'}).eq('id',other.project)).error,null);
  const own=await insert('activity_logs',{user_id:owner.id,project_id:owner.project,action:'OWN_ACTIVITY_CANARY'});
  const noProject=await insert('activity_logs',{user_id:owner.id,action:'PROJECTLESS_ACTIVITY_CANARY'});
  const corrupt=await insert('activity_logs',{user_id:owner.id,project_id:other.project,action:'CORRUPT_JOIN_CANARY'});
  await insert('activity_logs',{user_id:other.id,project_id:other.project,action:'FOREIGN_ACTIVITY_CANARY'});
  const response=await request('/api/profile/activity',owner.token);assert.equal(response.status,200);
  const entries=await response.json() as Array<{id:string;action:string;projects:{name:string}|null}>;
  assert.ok(entries.some(row=>row.id===own&&row.projects?.name));
  assert.ok(entries.some(row=>row.id===noProject&&row.projects===null));
  assert.ok(entries.some(row=>row.id===corrupt&&row.projects===null));
  assert.ok(!JSON.stringify(entries).includes('FOREIGN_PROJECT_NAME_CANARY'));assert.ok(!entries.some(row=>row.action==='FOREIGN_ACTIVITY_CANARY'));
  assert.equal((await request('/api/profile')).status,401);
  const promotion=await request('/api/profile',owner.token,'PATCH',{role:'owner',user_id:other.id});assert.equal(promotion.status,400);
  const profile=await request('/api/profile',owner.token);assert.equal(profile.status,200);
  const row=await profile.json() as {id:string;role:string};assert.equal(row.id,owner.id);assert.equal(row.role,'member');
});

test('real failed-build notification cannot disclose raw backend diagnostic text',async()=>{
  const owner=users[0];
  await notifyBuildFailed(owner.id,{projectName:'Isolated failure fixture',prompt:'Synthetic request only',error:'RAW_DIAGNOSTIC_PRIVATE_CANARY password=synthetic-not-a-secret SQL internal exception'});
  const stored=await admin.from('notifications').select('message,metadata').eq('user_id',owner.id).eq('title','XROGA build needs attention');assert.equal(stored.error,null);assert.ok(stored.data?.length);
  assert.ok(!JSON.stringify(stored.data).includes('RAW_DIAGNOSTIC_PRIVATE_CANARY'));
  assert.ok(stored.data?.some(row=>row.message.includes('could not finish')&&row.message.includes('retry')));
  const publicList=await request('/api/notifications',owner.token);assert.equal(publicList.status,200);assert.ok(!(await publicList.text()).includes('RAW_DIAGNOSTIC_PRIVATE_CANARY'));
});
test('actual member identity cannot fetch privileged operational endpoints',async()=>{
  for(const path of ['/api/admin/errors','/metrics']) assert.equal((await request(path,users[0].token)).status,403);
  const absent=await request(`/api/operations/products/${randomUUID()}`,users[0].token);
  const foreign=await request(`/api/operations/products/${users[1].project}`,users[0].token);
  assert.equal(absent.status,403);assert.equal(foreign.status,403);
  const safe=await absent.json() as {error:string;code:string};assert.equal(safe.code,'forbidden');assert.equal(safe.error,'Operation is not permitted');
});

test('foreign durable business confirmations cannot be read approved or cancelled by changing IDs',async()=>{
  const [owner,other]=users;
  const id=await insert('business_action_confirmations',{user_id:other.id,status:'pending',plan:{fixture:'no executable action'},plan_digest:'a'.repeat(64),summary:'FOREIGN_ACTION_CANARY',toolkit:'fixture',risk:'write',expires_at:new Date(Date.now()+600000).toISOString()});
  for(const [suffix,method] of [['','GET'],['/confirm','POST'],['/cancel','POST']]) {
    const response=await request(`/api/phase1/business-actions/confirmations/${id}${suffix}`,owner.token,method,method==='GET'?undefined:{userId:other.id,tenantId:other.id});
    assert.equal(response.status,404);assert.ok(!(await response.text()).includes('FOREIGN_ACTION_CANARY'));
  }
  const unchanged=await admin.from('business_action_confirmations').select('user_id,status,claimed_at').eq('id',id).single();assert.equal(unchanged.error,null);assert.equal(unchanged.data?.user_id,other.id);assert.equal(unchanged.data?.status,'pending');assert.equal(unchanged.data?.claimed_at,null);
  const client=createClient(url,process.env.SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${owner.token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  assert.equal((await client.from('business_action_confirmations').select('*').eq('id',id)).error?.code,'42501');
});
test('real profile column grants reject self-promotion and auth metadata cannot supply admin authority',async()=>{
  const owner=users[0];
  const client=createClient(url,process.env.SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${owner.token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const escalation=await client.from('profiles').update({role:'owner'}).eq('id',owner.id);
  assert.equal(escalation.error?.code,'42501');
  const metadata=await admin.auth.admin.updateUserById(owner.id,{user_metadata:{role:'owner',tenantId:users[1].id}});assert.equal(metadata.error,null);
  assert.equal((await request('/api/admin/errors',owner.token)).status,403);
  const actual=await admin.from('profiles').select('role').eq('id',owner.id).single();assert.equal(actual.data?.role,'member');
});
test('real operations membership allows its reviewed relation then denies immediately after revocation',async()=>{
  const [owner,member]=users;
  const id=await insert('operations_memberships',{user_id:owner.id,project_id:owner.project,member_user_id:member.id,role:'viewer',created_by:owner.id});
  try {
    assert.equal((await request(`/api/operations/products/${owner.project}`,member.token)).status,200);
    assert.equal((await admin.from('operations_memberships').delete().eq('id',id)).error,null);
    assert.equal((await request(`/api/operations/products/${owner.project}`,member.token)).status,403);
  } finally {assert.equal((await admin.from('operations_memberships').delete().eq('id',id)).error,null);}
});

test('browser cannot mint operations membership, and even a misbound service row cannot grant foreign access',async()=>{
  const [owner,other]=users;
  const client=createClient(url,process.env.SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${other.token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const forged={user_id:other.id,project_id:owner.project,member_user_id:other.id,role:'admin',created_by:other.id};
  assert.equal((await client.from('operations_memberships').insert(forged)).error?.code,'42501');
  // Simulate corrupt server-owned relation, not an actual browser privilege grant.
  const id=await insert('operations_memberships',forged);
  try {
    assert.equal((await request(`/api/operations/products/${owner.project}`,other.token)).status,403);
    const portfolio=await request('/api/operations/portfolio',other.token);assert.equal(portfolio.status,200);
    assert.ok(!(await portfolio.text()).includes(owner.project));
  } finally {assert.equal((await admin.from('operations_memberships').delete().eq('id',id)).error,null);}
});

test('portfolio does not disclose a misbound foreign resource while keeping legitimate owner evidence',async()=>{
  const [owner,other]=users;
  const legitimate=await insert('operations_resources',{user_id:owner.id,project_id:owner.project,kind:'service',name:'Owner fixture',source:'fixture',evidence_reference:'OWN_RESOURCE_EVIDENCE_CANARY'});
  const foreign=await insert('operations_resources',{user_id:other.id,project_id:owner.project,kind:'service',name:'FOREIGN_RESOURCE_CANARY',source:'fixture',status:'failed',evidence_reference:'FOREIGN_RESOURCE_EVIDENCE_CANARY'});
  try {
    for(const path of ['/api/operations/portfolio',`/api/operations/products/${owner.project}`]) {
      const response=await request(path,owner.token);assert.equal(response.status,200);
      const text=await response.text();assert.ok(text.includes('OWN_RESOURCE_EVIDENCE_CANARY'));assert.ok(!text.includes('FOREIGN_RESOURCE'));
    }
  } finally {assert.equal((await admin.from('operations_resources').delete().in('id',[legitimate,foreign])).error,null);}
});

test('registered stale-run maintenance preserves fresh and terminal runs across tenants',async()=>{
  const [owner,other]=users,old=new Date(Date.now()-20*60000).toISOString();
  const stale=await insert('swarm_runs',{user_id:owner.id,prompt:'Stale fixture',status:'running',worker_id:'fixture-old-worker',heartbeat_at:old,created_at:old});
  const fresh=await insert('swarm_runs',{user_id:other.id,prompt:'Fresh fixture',status:'running',worker_id:'fixture-live-worker',heartbeat_at:new Date().toISOString(),created_at:old});
  const terminal=await insert('swarm_runs',{user_id:other.id,prompt:'Terminal fixture',status:'complete',heartbeat_at:old,created_at:old});
  assert.equal(await reconcileOrphanedRuns({graceMs:0}),1);
  const result=await admin.from('swarm_runs').select('id,user_id,status').in('id',[stale,fresh,terminal]);assert.equal(result.error,null);
  assert.equal(result.data?.find(row=>row.id===stale)?.status,'error');
  assert.equal(result.data?.find(row=>row.id===fresh)?.status,'running');
  assert.equal(result.data?.find(row=>row.id===terminal)?.status,'complete');
  assert.equal(result.data?.find(row=>row.id===fresh)?.user_id,other.id);
});

test('registered shutdown cannot alter an active ID owned by a different worker lease',async()=>{
  const [owner,other]=users,worker=randomUUID();
  const own=await insert('swarm_runs',{user_id:owner.id,prompt:'Shutdown fixture',status:'running',worker_id:worker,heartbeat_at:new Date().toISOString()});
  const foreign=await insert('swarm_runs',{user_id:other.id,prompt:'Foreign worker fixture',status:'running',worker_id:randomUUID(),heartbeat_at:new Date().toISOString()});
  await assert.rejects(failInFlightRuns([foreign],'deploy_interrupted'),/Worker lease identity required/);
  assert.equal(await failInFlightRuns([own,foreign],'deploy_interrupted',{workerId:worker}),1);
  const rows=await admin.from('swarm_runs').select('id,user_id,status').in('id',[own,foreign]);assert.equal(rows.error,null);
  assert.equal(rows.data?.find(row=>row.id===own)?.status,'error');assert.equal(rows.data?.find(row=>row.id===foreign)?.status,'running');assert.equal(rows.data?.find(row=>row.id===foreign)?.user_id,other.id);
});

test('private share token cannot grant another tenant access or revocation authority',async()=>{
  const [owner,other]=users;
  // Literal words survive the established Markdown-cleaning share contract.
  // Underscore canaries would be altered, weakening the negative leak assertion.
  const created=await request('/api/message-shares',owner.token,'POST',{visibility:'private',scope:'response',response:'Private share privacy canary',owner_id:other.id});assert.equal(created.status,201);
  const body=await created.json() as {share:{token:string}};
  const stored=await admin.from('message_shares').select('owner_id').eq('token',body.share.token).single();assert.equal(stored.error,null);assert.equal(stored.data?.owner_id,owner.id);
  for(const token of [undefined,other.token]) {
    const denied=await request(`/api/message-shares/${body.share.token}`,token);assert.equal(denied.status,403);assert.ok(!(await denied.text()).includes('Private share privacy canary'));
  }
  const allowed=await request(`/api/message-shares/${body.share.token}`,owner.token);assert.equal(allowed.status,200);assert.ok((await allowed.text()).includes('Private share privacy canary'));
  assert.equal((await request(`/api/message-shares/${body.share.token}`,other.token,'DELETE')).status,404);
  assert.equal((await request(`/api/message-shares/${body.share.token}`,owner.token,'DELETE')).status,200);
  assert.equal((await request(`/api/message-shares/${body.share.token}`,owner.token)).status,404);
});

test('owner opt-in public share is readable without auth but revocation is immediate and uncached',async()=>{
  const owner=users[0];
  const created=await request('/api/message-shares',owner.token,'POST',{visibility:'public',scope:'response',response:'Public fixture only'});assert.equal(created.status,201);
  const body=await created.json() as {share:{token:string}};
  const read=await request(`/api/message-shares/${body.share.token}`);assert.equal(read.status,200);assert.equal(read.headers.get('cache-control'),'private, no-store');assert.ok((await read.text()).includes('Public fixture only'));
  assert.equal((await request(`/api/message-shares/${body.share.token}`,owner.token,'DELETE')).status,200);
  assert.equal((await request(`/api/message-shares/${body.share.token}`)).status,404);
});

test('identical prompts cannot retrieve another tenant response through the privileged cache',async()=>{
  const [owner,other]=users,prompt=`Same fixture prompt ${randomUUID()}`;
  await setCachedResponse(prompt,'OWNER_CACHE_CANARY','fixture',owner.context);
  assert.equal(await getCachedResponse(prompt,owner.context),'OWNER_CACHE_CANARY');
  assert.equal(await getCachedResponse(prompt,other.context),null);
  assert.equal(await getCachedResponse(prompt),null);
  await setCachedResponse(prompt,'OTHER_CACHE_CANARY','fixture',other.context);
  assert.equal(await getCachedResponse(prompt,owner.context),'OWNER_CACHE_CANARY');
  assert.equal(await getCachedResponse(prompt,other.context),'OTHER_CACHE_CANARY');
});

test('real reservation concurrency and foreign settlement cannot transfer budget between tenants',async()=>{
  const [owner,other]=users,key=randomUUID();
  const input={modelId:'deepseek_v4_flash' as const,estimatedInputTokens:100,maximumOutputTokens:100,idempotencyKey:key};
  // Actual existing service RPCs against the complete isolated database, no provider request/payment.
  const replay=await Promise.all(Array.from({length:4},()=>reserveProviderBudget({...input,userId:owner.id})));
  assert.equal(new Set(replay.map(row=>row.id)).size,1);
  const foreign=await reserveProviderBudget({...input,userId:other.id});assert.notEqual(foreign.id,replay[0].id);
  const read=async()=>{
    const r=await admin.from('xroga_provider_reservations').select('id,user_id,status,reserved_micro_usd,settled_micro_usd').in('id',[replay[0].id,foreign.id]).order('id');assert.equal(r.error,null);assert.equal(r.data?.length,2);return r.data;
  };
  const before=await read();
  await assert.rejects(settleProviderBudget({userId:other.id,modelId:input.modelId,reservation:replay[0],result:{inputTokens:10,outputTokens:10}}),/Provider reservation settlement failed/);
  const denied=await admin.rpc('release_xroga_provider_budget',{p_user_id:other.id,p_reservation_id:replay[0].id,p_error_category:'fixture',p_pending_reconciliation:false});assert.ok(denied.error);
  assert.deepEqual(await read(),before,'failed foreign writes must leave both reservations unchanged');
  await settleProviderBudget({userId:owner.id,modelId:input.modelId,reservation:replay[0],result:{inputTokens:10,outputTokens:10}});
  const after=await read();assert.equal(after?.find(r=>r.id===replay[0].id)?.status,'settled');assert.equal(after?.find(r=>r.id===foreign.id)?.status,'reserved');
  const count=await admin.from('xroga_provider_reservations').select('id',{count:'exact',head:true}).eq('user_id',owner.id).eq('idempotency_key',key);assert.equal(count.error,null);assert.equal(count.count,1);
});

test('real catalog and RPC denial prevent browser roles mutating own or foreign billing authority',async()=>{
  const database=new URL(process.env.XB01_LOCAL_DATABASE_URL!);
  assert.ok(['localhost','127.0.0.1'].includes(database.hostname));assert.equal(database.port,'54322');assert.equal(database.pathname,'/postgres');
  const db=new pg.Client({connectionString:database.href,ssl:false});await db.connect();
  try {
    const routines=[['ensure_xroga_free_cycle','public.ensure_xroga_free_cycle(uuid)',{}],['set_xroga_usage_pacing','public.set_xroga_usage_pacing(uuid,text,boolean)',{p_pacing:'full_access',p_confirm_full_access:true}],['set_user_ai_plan_budget','public.set_user_ai_plan_budget(uuid,text,numeric)',{p_plan_tier:'spark',p_plan_budget_usd:1000}]] as const;
    const before=await admin.from('user_token_usage').select('*').in('user_id',users.map(user=>user.id)).order('user_id');assert.equal(before.error,null);
    for(const [name,signature,args] of routines) {
      const privilege=await db.query("select to_regprocedure($1)::text as routine,has_function_privilege('authenticated',$1,'EXECUTE') as member_execute,has_function_privilege('anon',$1,'EXECUTE') as anon_execute",[signature]);
      assert.ok(privilege.rows[0].routine,'Missing real routine is not permission-denial proof');assert.equal(privilege.rows[0].member_execute,false);assert.equal(privilege.rows[0].anon_execute,false);
      for(const bearer of [undefined,users[0].token]) {
        const client=createClient(url,process.env.SUPABASE_ANON_KEY!,{...(bearer?{global:{headers:{Authorization:`Bearer ${bearer}`}}}:{}),auth:{persistSession:false,autoRefreshToken:false}});
        for(const target of users) {
          const denied=await client.rpc(name,{...args,p_user_id:target.id});
          assert.ok(denied.error && ['42501','PGRST202'].includes(denied.error.code),'Privileged billing RPC must deny (catalog separately proves presence and no execute grant)');
        }
      }
    }
    const after=await admin.from('user_token_usage').select('*').in('user_id',users.map(user=>user.id)).order('user_id');assert.equal(after.error,null);assert.deepEqual(after.data,before.data);
  } finally {await db.end();}
});
