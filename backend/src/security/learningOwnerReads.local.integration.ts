import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {loadBuildImprovementMemory,summarizeBuildImprovementRows} from '../ai/buildImprovementMemory.js';
import {loadBuildOutcomeRoutingMemory,summarizeBuildOutcomeRows} from '../ai/buildOutcomeRoutingMemory.js';
import {loadBuildStrategyMemory,summarizeBuildStrategyRows} from '../ai/buildStrategyMemory.js';

/** Original per-owner advisory readers only. No pipeline, model or provider executes. */
export function registerLearningOwnerReadTests(admin:SupabaseClient,getUsers:()=>readonly {token:string}[]):void{
 test('real learning readers use the issued owner namespace and cannot reuse foreign outcomes or unavailable authority',async t=>{
  assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
  const actors:string[]=[],original=globalThis.fetch,priorLearning=process.env.XROGA_LEARNING_ENABLED;process.env.XROGA_LEARNING_ENABLED='true';
  t.after(async()=>{globalThis.fetch=original;if(priorLearning===undefined)delete process.env.XROGA_LEARNING_ENABLED;else process.env.XROGA_LEARNING_ENABLED=priorLearning;for(const id of actors)assert.equal((await admin.auth.admin.deleteUser(id)).error,null);});
  for(let n=0;n<3;n++){const created=await admin.auth.admin.createUser({email:`learning-owner-${randomUUID()}@example.invalid`,email_confirm:true});assert.equal(created.error,null);assert.ok(created.data.user);actors.push(created.data.user.id);}
  const now=new Date().toISOString(),rows=actors.slice(0,2).flatMap((owner,i)=>{
   const common={user_id:owner,terminal_status:'error',success:false,failure_category:'compile',feature_category:`feature_${i}`,verified:false,learning_eligible:true,taxonomy_id:`taxonomy_${i}`,product_surface:`surface_${i}`,product_subtype:`subtype_${i}`,recipe_id:`recipe_${i}`,golden_example_ids:[`golden_${i}`],failure_domain:'project',failure_stage:'build',updated_at:now};
   return [0,1].map(n=>({...common,run_id:randomUUID(),updated_at:new Date(Date.parse(now)-n*1000).toISOString(),model_telemetry:[{modelId:`fixture_model_${i}`,taskClass:'coding',framework:'fixture',requiredCapabilities:['code'],repairLoops:n,finalVerificationOk:false}]}));
  });
  assert.equal((await admin.from('build_outcomes').insert(rows)).error,null);
  const snapshot=async()=>{const r=await admin.from('build_outcomes').select('*').in('user_id',actors).order('run_id');assert.equal(r.error,null);return r.data!;};
  const before=await snapshot();
  for(const [i,owner]of actors.entries()){
   const owned=before.filter(row=>row.user_id===owner).sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at));
   const [improvement,routing,strategy]=await Promise.all([loadBuildImprovementMemory(owner),loadBuildOutcomeRoutingMemory(owner),loadBuildStrategyMemory(owner)]);
   assert.deepEqual(improvement,summarizeBuildImprovementRows(owned));assert.deepEqual(routing,summarizeBuildOutcomeRows(owned));assert.deepEqual(strategy,summarizeBuildStrategyRows(owned));
   if(i<2){assert.equal(improvement.observationCount,2);assert.ok(improvement.observations.every(o=>o.modelId===`fixture_model_${i}`));assert.deepEqual(routing.deprioritizedModels,[`fixture_model_${i}`]);assert.equal(strategy.observationCount,2);assert.ok(strategy.observations.every(o=>o.recipeId===`recipe_${i}`));}
   else{assert.equal(improvement.observationCount,0);assert.equal(routing.sampleCount,0);assert.equal(strategy.observationCount,0);}
  }
  // A real default-reader query is made, but authority failure is intercepted
  // before transport. No injected RowSource bypasses the production query.
  globalThis.fetch=async(input,init)=>{const url=new URL(String(input instanceof Request?input.url:input));assert.equal(url.origin,'http://127.0.0.1:54321');if(url.pathname==='/rest/v1/build_outcomes')return Response.json({code:'XX000',message:'SYNTHETIC_PRIVATE_DIAGNOSTIC'},{status:503});return original(input,init);};
  for(const read of [loadBuildImprovementMemory,loadBuildOutcomeRoutingMemory,loadBuildStrategyMemory]){const result=await read(actors[0]);assert.equal(result.source,'unavailable');assert.ok(!JSON.stringify(result).includes('SYNTHETIC_PRIVATE_DIAGNOSTIC'));}
  globalThis.fetch=original;
  for(const token of [undefined,...getUsers().map(user=>user.token)]){
   const browser:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{})});
   assert.equal((await browser.from('build_outcomes').select('*')).error?.code,'42501');assert.equal((await browser.from('build_outcomes').insert(rows[0])).error?.code,'42501');
  }
  assert.deepEqual(await snapshot(),before);
 });
}
