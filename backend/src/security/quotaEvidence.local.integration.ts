import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import pg from 'pg';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {assertHasQuota,getUsage,recordUsage} from '../ai/quota.js';

export function registerQuotaEvidenceTests(admin:SupabaseClient):void{
  test('real quota reads bind owner and preserve zero budget without inventing paid fallback',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const ids:string[]=[];
    t.after(async()=>{for(const id of ids)assert.equal((await admin.auth.admin.deleteUser(id)).error,null);});
    for(let index=0;index<2;index++){
      const created=await admin.auth.admin.createUser({email:`quota-${randomUUID()}@example.invalid`,email_confirm:true});
      assert.equal(created.error,null);assert.ok(created.data.user);ids.push(created.data.user.id);
    }
    const [owner,other]=ids,start=`${new Date().toISOString().slice(0,7)}-01`;
    const base={quota_period_start:start,input_tokens:10,output_tokens:5,model_usage:{},rollover_usd:0};
    assert.equal((await admin.from('user_token_usage').upsert([
      {...base,user_id:owner,plan_tier:'free',plan_budget_usd:1.65,spent_usd:0.65},
      {...base,user_id:other,plan_tier:'spark',plan_budget_usd:16.5,spent_usd:0},
    ],{onConflict:'user_id'})).error,null);
    assert.equal((await assertHasQuota(owner)).creditRemainingUsd,1);
    assert.equal((await assertHasQuota(other)).creditRemainingUsd,16.5);
    assert.equal((await admin.from('user_token_usage').update({plan_budget_usd:0}).eq('user_id',owner)).error,null);
    assert.equal((await getUsage(owner)).planBudgetUsd,0);
    await assert.rejects(assertHasQuota(owner),{code:'OUT_OF_TOKENS'});
    assert.equal((await admin.from('user_token_usage').delete().eq('user_id',owner)).error,null);
    await assert.rejects(assertHasQuota(owner),{code:'QUOTA_UNAVAILABLE',statusCode:503});
    assert.equal((await assertHasQuota(other)).creditRemainingUsd,16.5);
  });
  test('real legacy usage consumer persists only its original owner and the authenticated status ignores forged ownership',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const api=process.env.E2E_BACKEND_URL??'http://127.0.0.1:4000';assert.equal(api,'http://127.0.0.1:4000');
    const actors:{id:string;token:string}[]=[],period=`${new Date().toISOString().slice(0,7)}-01`;
    t.after(async()=>{for(const actor of actors)assert.equal((await admin.auth.admin.deleteUser(actor.id)).error,null);});
    for(let n=0;n<2;n++){
      const email=`legacy-meter-${randomUUID()}@example.invalid`,password=randomUUID()+randomUUID(),created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(created.error,null);assert.ok(created.data.user);
      const client:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});const signed=await client.auth.signInWithPassword({email,password});assert.equal(signed.error,null);assert.ok(signed.data.session);actors.push({id:created.data.user.id,token:signed.data.session.access_token});
      assert.equal((await admin.from('user_token_usage').upsert({user_id:created.data.user.id,quota_period_start:period,input_tokens:0,output_tokens:0,model_usage:{},spent_usd:0,rollover_usd:0,plan_tier:'free',plan_budget_usd:1.65})).error,null);
    }
    const [owner,other]=actors;
    await recordUsage(owner.id,'kimi_k3',3,2);await recordUsage(other.id,'kimi_k3',7,1);
    const rows=async(id:string)=>{const usage=await admin.from('user_token_usage').select('*').eq('user_id',id).single(),ledger=await admin.from('ai_usage_ledger').select('*').eq('user_id',id).order('id');assert.equal(usage.error,null);assert.equal(ledger.error,null);return{usage:usage.data!,ledger:ledger.data!};};
    const foreignBefore=await rows(other.id);
    const before=await rows(owner.id);assert.equal(before.usage.input_tokens,3);assert.equal(before.usage.output_tokens,2);assert.equal(before.ledger.length,1);assert.equal(before.ledger[0].user_id,owner.id);assert.equal(before.ledger[0].input_tokens,3);assert.equal(before.ledger[0].output_tokens,2);
    await Promise.all([recordUsage(owner.id,'kimi_k3',1,1),recordUsage(owner.id,'kimi_k3',1,1)]);
    const after=await rows(owner.id);assert.equal(after.usage.input_tokens,5);assert.equal(after.usage.output_tokens,4);assert.equal(after.ledger.length,3);assert.ok(after.ledger.every(row=>row.user_id===owner.id&&row.model_id==='kimi_k3'));assert.deepEqual(await rows(other.id),foreignBefore);
    assert.equal((await fetch(`${api}/api/phase1/usage`)).status,401);
    for(const [n,actor]of actors.entries()){
      const response=await fetch(`${api}/api/phase1/usage?userId=${actors[1-n].id}&tenantId=${actors[1-n].id}`,{headers:{Authorization:`Bearer ${actor.token}`}});assert.equal(response.status,200);const result=await response.json() as {usage:{inputTokensUsed:number;outputTokensUsed:number}};assert.equal(result.usage.inputTokensUsed,n?7:5);assert.equal(result.usage.outputTokensUsed,n?1:4);
    }
    const database=new URL(process.env.XB01_LOCAL_DATABASE_URL!);assert.equal(database.hostname,'127.0.0.1');assert.equal(database.port,'54322');assert.equal(database.pathname,'/postgres');const catalog=new pg.Client({connectionString:database.href,ssl:false});await catalog.connect();
    try{for(const signature of ['public.increment_user_token_usage(uuid,bigint,bigint,date,numeric,numeric,text)','public.merge_user_model_usage(uuid,jsonb,date)','public.insert_ai_usage_ledger(uuid,text,text,bigint,bigint,numeric,date)']){const r=await catalog.query("select to_regprocedure($1)::text routine,has_function_privilege('anon',$1,'EXECUTE') anon_execute,has_function_privilege('authenticated',$1,'EXECUTE') member_execute",[signature]);assert.ok(r.rows[0].routine);assert.equal(r.rows[0].anon_execute,false);assert.equal(r.rows[0].member_execute,false);}}finally{await catalog.end();}
    for(const token of [undefined,owner.token]){
      const browser=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{})});
      for(const target of actors){
        const results=await Promise.all([
          browser.rpc('increment_user_token_usage',{p_user_id:target.id,p_input:100,p_output:100,p_period:period,p_cost_usd:0,p_plan_budget_usd:1.65,p_plan_tier:'free'}),
          browser.rpc('merge_user_model_usage',{p_user_id:target.id,p_delta:{kimi_k3:{input:100,output:100,cost_usd:0}},p_period:period}),
          browser.rpc('insert_ai_usage_ledger',{p_user_id:target.id,p_model_id:'kimi_k3',p_pool_role:'kimi_k3',p_input:100,p_output:100,p_cost_usd:0,p_period:period}),
        ]);for(const result of results)assert.ok(result.error&&['42501','PGRST202'].includes(result.error.code),'Actual catalog proves each routine exists and denies browser EXECUTE');
      }
    }
    assert.deepEqual(await rows(owner.id),after);assert.deepEqual(await rows(other.id),foreignBefore);
    assert.equal((await admin.from('user_token_usage').delete().eq('user_id',owner.id)).error,null);await assert.rejects(recordUsage(owner.id,'kimi_k3',1,1),{code:'QUOTA_UNAVAILABLE'});assert.deepEqual(await rows(other.id),foreignBefore);
    const retained=await admin.from('ai_usage_ledger').select('*').eq('user_id',owner.id).order('id');assert.equal(retained.error,null);assert.deepEqual(retained.data,after.ledger);
  });
}
