/** Explicit CI integration suite: actual disposable Supabase/Auth/PG/PostgREST and API, no mocks. */
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createTenantContext, type TenantContext } from './tenantContext.js';
import { requireOwnedResource, requireOwnedFile } from './ownership.js';
import { persistOwnedRun, persistOwnedRuntimeSession } from './ownedRunPersistence.js';
import { listUserProviderKeys } from '../services/integrations/userProviderKeys.js';

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
test('real terminal autosave collision denies foreign id and preserves transcript',async()=>{
  const [owner,other]=users,id=`fixture-${randomUUID()}`;
  const row={githubRepoName:'fixture/local',messages:[{role:'user',content:'Private fixture'}],title:'Owner fixture'};
  assert.equal((await request(`/api/terminal-sessions/${id}`,owner.token,'PUT',row)).status,200);
  const denied=await request(`/api/terminal-sessions/${id}`,other.token,'PUT',{...row,title:'Forbidden takeover',userId:owner.id});assert.equal(denied.status,404);
  assert.equal((await request(`/api/terminal-sessions/${id}`,other.token)).status,404);
  const stored=await admin.from('terminal_sessions').select('user_id,title,messages').eq('id',id).single();assert.equal(stored.error,null);assert.equal(stored.data?.user_id,owner.id);assert.equal(stored.data?.title,'Owner fixture');
});
test('existing runtime session persistence cannot take over a foreign durable session',async()=>{
  const [owner,other]=users;
  await assert.rejects(persistOwnedRuntimeSession(admin,owner.context,{session_id:other.session,user_id:owner.id,project_id:owner.project,provider_id:'fixture-no-execution',runtime_class:'interactive',status:'failed',state:{}}),{status:404});
  const row=await admin.from('project_runtime_sessions').select('user_id,status').eq('session_id',other.session).single();
  assert.equal(row.error,null);assert.equal(row.data?.user_id,other.id);assert.equal(row.data?.status,'stopped');
});
test('provider metadata uses real schema and owner filters without returning encrypted/raw credentials',async()=>{
  const owner=users[0];
  const rows=await listUserProviderKeys(owner.id);assert.equal(rows.length,1);assert.equal(rows[0].provider,'openai');
  const response=await request('/api/integrations/provider-keys',owner.token);assert.equal(response.status,200);
  const text=await response.text();assert.ok(!text.includes('SYNTHETIC_PRIVATE_CANARY'));assert.ok(!text.includes('access_token'));
});
test('actual member identity cannot fetch privileged operational endpoints',async()=>{
  for(const path of ['/api/admin/errors','/metrics']) assert.equal((await request(path,users[0].token)).status,403);
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
