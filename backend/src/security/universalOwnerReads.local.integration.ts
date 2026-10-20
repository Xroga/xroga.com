import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import pg from 'pg';
import type {SupabaseClient} from '@supabase/supabase-js';
import {SupabaseUniversalStore,universalStore} from '../synthesis/universalPersistence.js';
import {synthesizeUniversalProductSpec} from '../synthesis/universalProductSpec.js';
import {planArchitecture} from '../synthesis/architecturePlan.js';
import type {PlanMutation} from '../synthesis/dynamicPlanning.js';
import type {TenantContext} from './tenantContext.js';

type Actor={id:string;context:TenantContext};
export function registerUniversalOwnerReadTests(admin:SupabaseClient,getUsers:()=>readonly Actor[]):void{
 test('real universal default readers and index removal preserve issued owner project and run namespaces',async t=>{
  assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
  const [owner,other]=getUsers(),a=universalStore(admin,owner.context),b=universalStore(admin,other.context),projectId=`read-fixture-${randomUUID()}`,runId=randomUUID(),actor={userId:owner.id,projectId},foreign={userId:other.id,projectId};
  assert.notEqual(a,b,'Privileged request stores must never share the global memory singleton');
  for(const context of [owner.id,{...owner.context},structuredClone(owner.context)])assert.throws(()=>universalStore(admin,context as TenantContext),{status:401});
  const specs=[owner,other].map((_,n)=>({...synthesizeUniversalProductSpec({prompt:'Build a fictional task API'}),title:`OWN_SPEC_${n}`,createdAt:new Date(Date.now()-n*1000).toISOString()})),plans=specs.map(spec=>planArchitecture({spec}));
  const specIds=specs.map(spec=>`${projectId}:${spec.createdAt}`),planIds=plans.map(plan=>`${projectId}:${plan.createdAt}`),mutationKeys=[randomUUID(),randomUUID()];
  // The real planner can create both plans in one millisecond. Keep the fixture
  // keys deterministic and distinct without changing application behavior.
  plans[1]={...plans[1],createdAt:new Date(Date.parse(plans[0].createdAt)-1000).toISOString()};planIds[1]=`${projectId}:${plans[1].createdAt}`;
  const identity={projectId,repositoryId:'fixture/local',repositoryOwner:'fixture',repositoryName:'local',branch:'main'},indexId=`${projectId}:fixture/local:main`;
  t.after(async()=>{assert.equal((await admin.from('architecture_plans').delete().in('plan_id',planIds)).error,null);assert.equal((await admin.from('project_specs').delete().in('spec_id',specIds)).error,null);assert.equal((await admin.from('plan_mutations').delete().in('mutation_key',mutationKeys)).error,null);assert.equal((await admin.from('repository_indexes').delete().eq('index_id',indexId).eq('user_id',owner.id)).error,null);});
  for(const [n,store]of [a,b].entries()){
   const scope=n?foreign:actor;assert.equal((await store.saveSpec(scope,specs[n])).saved,true);assert.equal((await store.savePlan(scope,plans[n],specIds[n],runId)).saved,true);
   const mutation:PlanMutation={schemaVersion:'1.0.0',mutationKey:mutationKeys[n],kind:'add_task',runId,triggeredByTaskId:null,reason:`OWN_MUTATION_${n}`,evidence:[],at:new Date().toISOString(),payload:{owner:n}};assert.equal((await store.saveMutations(scope,runId,[mutation])).saved,true);
  }
  const snapshot=async()=>{const results=await Promise.all([admin.from('project_specs').select('*').in('spec_id',specIds).order('spec_id'),admin.from('architecture_plans').select('*').in('plan_id',planIds).order('plan_id'),admin.from('plan_mutations').select('*').in('mutation_key',mutationKeys).order('mutation_key')]);for(const r of results)assert.equal(r.error,null);return results.map(r=>r.data);};const before=await snapshot();
  for(const [n,store]of [a,b].entries()){
   const scope=n?foreign:actor;assert.equal((await store.loadLatestSpec(scope))?.title,`OWN_SPEC_${n}`);assert.deepEqual((await store.loadLatestPlan(scope))?.components,JSON.parse(JSON.stringify(plans[n].components)));
   const mutations=await store.loadMutations(scope,runId);assert.equal(mutations.length,1);assert.equal(mutations[0].mutationKey,mutationKeys[n]);assert.equal(mutations[0].reason,`OWN_MUTATION_${n}`);
   assert.equal(await store.loadLatestSpec({...scope,projectId:`${projectId}-other`}),null);assert.equal(await store.loadLatestPlan({...scope,projectId:`${projectId}-other`}),null);assert.deepEqual(await store.loadMutations(scope,randomUUID()),[]);
  }
  await assert.rejects(a.loadLatestSpec(foreign),{status:404});await assert.rejects(a.loadLatestPlan(foreign),{status:404});await assert.rejects(a.loadMutations(foreign,runId),{status:404});
  const cloned=new SupabaseUniversalStore(admin,{...owner.context});await assert.rejects(cloned.loadLatestSpec(actor),{status:401});
  assert.equal((await a.savePlan(actor,{...plans[0],createdAt:new Date(Date.now()+1000).toISOString()},specIds[1])).saved,false);assert.deepEqual(await snapshot(),before);
  await a.save({identity,schemaVersion:'1.0.0',indexedCommitSha:'fixture-head',treeSha:null,files:[],updatedAt:new Date().toISOString()});await b.delete(identity);assert.equal((await a.load(identity))?.indexedCommitSha,'fixture-head');await a.delete(identity);assert.equal(await a.load(identity),null);assert.deepEqual(await snapshot(),before);
 });
 test('real universal plan parent ownership rechecks after an observed insert lock wait and preserves optional deletion receipts',async t=>{
  assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
  const [owner,other]=getUsers(),store=new SupabaseUniversalStore(admin,owner.context),projectId=`plan-parent-${randomUUID()}`,actor={userId:owner.id,projectId},spec=synthesizeUniversalProductSpec({prompt:'Build a fictional task API'}),plan=planArchitecture({spec}),specId=`${projectId}:${spec.createdAt}`,planId=`${projectId}:${plan.createdAt}`;
  t.after(async()=>{assert.equal((await admin.from('architecture_plans').delete().eq('plan_id',planId)).error,null);assert.equal((await admin.from('project_specs').delete().eq('spec_id',specId)).error,null);});
  assert.equal((await store.saveSpec(actor,spec)).saved,true);
  const url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/postgres');const locker=new pg.Client({connectionString:url.href,ssl:false});await locker.connect();let pending:ReturnType<typeof store.savePlan>|undefined;
  try{
   await locker.query('begin');const pid=(await locker.query('select pg_backend_pid() pid')).rows[0].pid;await locker.query('update project_specs set user_id=$2 where spec_id=$1',[specId,other.id]);
   pending=store.savePlan(actor,plan,specId);let blocked=false;
   for(let n=0;n<150;n++){await locker.query('select pg_stat_clear_snapshot()');const waiting=await locker.query("select count(*)::int n from pg_stat_activity a where a.pid<>pg_backend_pid() and $1=any(pg_blocking_pids(a.pid)) and a.query ilike '%architecture_plans%'",[pid]);if(waiting.rows[0].n){blocked=true;break;}await delay(20);}
   assert.equal(blocked,true,'Must observe the actual savePlan insert waiting on its current spec parent');await locker.query('commit');assert.equal((await pending).saved,false);pending=undefined;
  }finally{await locker.query('rollback');if(pending)await pending;await locker.end();}
  const denied=await admin.from('architecture_plans').select('*').eq('plan_id',planId);assert.equal(denied.error,null);assert.deepEqual(denied.data,[]);
  assert.equal((await admin.from('project_specs').update({user_id:owner.id}).eq('spec_id',specId)).error,null);
  const own=await store.savePlan(actor,plan,specId);assert.equal(own.saved,true);
  const saved=await admin.from('architecture_plans').select('*').eq('plan_id',planId).single();assert.equal(saved.error,null);assert.equal(saved.data?.user_id,owner.id);assert.equal(saved.data?.project_id,projectId);assert.equal(saved.data?.spec_id,specId);
  for(const patch of [{user_id:other.id},{project_id:`${projectId}-foreign`}]){assert.equal((await admin.from('project_specs').update(patch).eq('spec_id',specId)).error?.code,'23503');assert.deepEqual((await admin.from('architecture_plans').select('*').eq('plan_id',planId).single()).data,saved.data);}
  assert.equal((await admin.from('project_specs').delete().eq('spec_id',specId).eq('user_id',owner.id)).error,null);const retained=await admin.from('architecture_plans').select('*').eq('plan_id',planId).single();assert.equal(retained.error,null);assert.deepEqual(retained.data,{...saved.data,spec_id:null});
 });
}
