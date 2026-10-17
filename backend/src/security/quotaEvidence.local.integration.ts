import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {SupabaseClient} from '@supabase/supabase-js';
import {assertHasQuota,getUsage} from '../ai/quota.js';

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
}
