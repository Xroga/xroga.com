import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {SupabaseBenchmarkResultStore} from '../ai/benchmarkRunner.js';
import type {BenchmarkResult} from '../ai/modelBenchmarks.js';
import {supabaseBenchmarkResults} from '../ai/measuredEvidence.js';

/** Persist fixed synthetic measurements only. Never execute a benchmark or model. */
export function registerPlatformBenchmarkTests(admin:SupabaseClient,getUsers:()=>readonly {token:string}[]):void{
 test('real platform benchmark exception retains only fixed measurement fields and browser roles cannot read or alter rows',async t=>{
  assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
  const benchmarkId=`fixture-measurement-${randomUUID()}`,table='model_benchmark_runs';
  t.after(async()=>{assert.equal((await admin.from(table).delete().eq('benchmark_id',benchmarkId)).error,null);});
  const result:BenchmarkResult={schemaVersion:'1.0.0',benchmarkId,modelId:'deepseek_v4_flash',succeeded:true,buildPassed:true,testsPassed:true,patchApplied:null,regressionCount:0,securityFindings:0,repairAttempts:0,latencyMs:123,inputTokens:10,outputTokens:20,estimatedCostUsd:0,at:new Date().toISOString()};
  const store=new SupabaseBenchmarkResultStore({from:table=>({insert:async row=>{assert.ok(row&&typeof row==='object'&&!Array.isArray(row));const r=await admin.from(table).insert(row as Record<string,unknown>);return{error:r.error};}})});
  await store.record({...result,userId:'SYNTHETIC_PRIVATE_CANARY',access_token:'SYNTHETIC_PRIVATE_CANARY'} as BenchmarkResult);
  const read=()=>admin.from(table).select('*').eq('benchmark_id',benchmarkId).single();const before=await read();assert.equal(before.error,null);assert.ok(before.data);assert.ok(!JSON.stringify(before.data).includes('SYNTHETIC_PRIVATE_CANARY'));
  const loaded=(await supabaseBenchmarkResults()).filter(row=>row.benchmarkId===benchmarkId);assert.equal(loaded.length,1);assert.deepEqual({...loaded[0],at:new Date(loaded[0].at).toISOString()},result);
  await assert.rejects(store.record({...result,inputTokens:NaN}),/Invalid benchmark measurement/);assert.deepEqual((await read()).data,before.data);
  for(const token of [undefined,...getUsers().map(user=>user.token)]){
   const browser:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{})});
   const selected=await browser.from(table).select('*').eq('benchmark_id',benchmarkId);assert.equal(selected.error,null);assert.deepEqual(selected.data,[]);
   assert.equal((await browser.from(table).insert({...before.data,id:undefined})).error?.code,'42501');
   for(const denied of [browser.from(table).update({succeeded:false}).eq('benchmark_id',benchmarkId).select('id'),browser.from(table).delete().eq('benchmark_id',benchmarkId).select('id')]){const r=await denied;assert.equal(r.error,null);assert.deepEqual(r.data,[]);}
   assert.deepEqual((await read()).data,before.data);
  }
 });
}
