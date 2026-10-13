/** Explicit CI integration suite: actual disposable Supabase/Auth/PG/PostgREST and API, no mocks. */
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createTenantContext, type TenantContext } from './tenantContext.js';
import { requireOwnedResource, requireOwnedFile } from './ownership.js';
import { persistOwnedRun, persistOwnedRuntimeSession } from './ownedRunPersistence.js';
import { listUserProviderKeys } from '../services/integrations/userProviderKeys.js';
import { reconcileOrphanedRuns,failInFlightRuns } from '../ai/runReconciler.js';
import { getCachedResponse,setCachedResponse } from '../services/responseCache.js';
import pg from 'pg';

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
  const absent=await request(`/api/operations/products/${randomUUID()}`,users[0].token);
  const foreign=await request(`/api/operations/products/${users[1].project}`,users[0].token);
  assert.equal(absent.status,403);assert.equal(foreign.status,403);
  const safe=await absent.json() as {error:string;code:string};assert.equal(safe.code,'forbidden');assert.equal(safe.error,'Operation is not permitted');
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
  const created=await request('/api/message-shares',owner.token,'POST',{visibility:'private',scope:'response',response:'PRIVATE_SHARE_CANARY',owner_id:other.id});assert.equal(created.status,201);
  const body=await created.json() as {share:{token:string}};
  const stored=await admin.from('message_shares').select('owner_id').eq('token',body.share.token).single();assert.equal(stored.error,null);assert.equal(stored.data?.owner_id,owner.id);
  for(const token of [undefined,other.token]) {
    const denied=await request(`/api/message-shares/${body.share.token}`,token);assert.equal(denied.status,403);assert.ok(!(await denied.text()).includes('PRIVATE_SHARE_CANARY'));
  }
  const allowed=await request(`/api/message-shares/${body.share.token}`,owner.token);assert.equal(allowed.status,200);assert.ok((await allowed.text()).includes('PRIVATE_SHARE_CANARY'));
  assert.equal((await request(`/api/message-shares/${body.share.token}`,other.token,'DELETE')).status,404);
  assert.equal((await request(`/api/message-shares/${body.share.token}`,owner.token,'DELETE')).status,200);
  assert.equal((await request(`/api/message-shares/${body.share.token}`,owner.token)).status,404);
});

test('owner opt-in public share is readable without auth but revocation is immediate and uncached',async()=>{
  const owner=users[0];
  const created=await request('/api/message-shares',owner.token,'POST',{visibility:'public',scope:'response',response:'PUBLIC_FIXTURE_ONLY'});assert.equal(created.status,201);
  const body=await created.json() as {share:{token:string}};
  const read=await request(`/api/message-shares/${body.share.token}`);assert.equal(read.status,200);assert.equal(read.headers.get('cache-control'),'private, no-store');assert.ok((await read.text()).includes('PUBLIC_FIXTURE_ONLY'));
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
