import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {SupabaseClient} from '@supabase/supabase-js';
import {ensureUserRecords} from '../services/ensureUserRecords.js';
import {forgetProvisionedUser,isUserProvisioned} from '../services/userProvisioningCache.js';
import {createTenantContext,type TenantContext} from './tenantContext.js';

export function registerProvisioningReceiptTests(admin:SupabaseClient):void{
  test('real provisioning confirms owned records without resetting existing role or paid usage',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const ids:string[]=[];
    t.after(async()=>{for(const id of ids){forgetProvisionedUser(id);assert.equal((await admin.auth.admin.deleteUser(id)).error,null);}});
    for(let i=0;i<2;i++){
      const created=await admin.auth.admin.createUser({email:`provision-${randomUUID()}@example.invalid`,email_confirm:true});
      assert.equal(created.error,null);assert.ok(created.data.user);ids.push(created.data.user.id);
    }
    const [owner,other]=ids;
    assert.equal((await admin.from('user_token_usage').upsert({user_id:other,plan_tier:'spark',plan_budget_usd:16.5,spent_usd:3,input_tokens:17,output_tokens:9},{onConflict:'user_id'})).error,null);
    assert.equal((await admin.from('profiles').update({role:'admin'}).eq('id',other)).error,null);
    const profile=await admin.from('profiles').select('*').eq('id',other).single();assert.equal(profile.error,null);
    const usage=await admin.from('user_token_usage').select('*').eq('user_id',other).single();assert.equal(usage.error,null);
    assert.equal((await admin.from('user_token_usage').delete().eq('user_id',owner)).error,null);
    assert.equal((await admin.from('profiles').delete().eq('id',owner)).error,null);
    const context=createTenantContext({userId:owner,via:'persisted_owner'});
    for(const forged of [owner,{...context},{userId:other}]){
      await assert.rejects(ensureUserRecords(forged as TenantContext),{code:'TENANT_AUTH_REQUIRED'});
    }
    assert.equal((await admin.from('profiles').select('id').eq('id',owner).maybeSingle()).data,null);
    assert.equal((await admin.from('user_token_usage').select('user_id').eq('user_id',owner).maybeSingle()).data,null);
    await Promise.all([ensureUserRecords(context),ensureUserRecords(context)]);
    assert.equal(isUserProvisioned(owner),true);
    const ownProfile=await admin.from('profiles').select('id,role,username').eq('id',owner).single();assert.equal(ownProfile.error,null);assert.equal(ownProfile.data.id,owner);assert.equal(ownProfile.data.role,'member');
    assert.equal(ownProfile.data.username,`xroga_${owner.slice(0,12).replaceAll('-','')}`);
    assert.match(ownProfile.data.username,/^[A-Za-z0-9_]{3,32}$/);
    const ownUsage=await admin.from('user_token_usage').select('user_id,plan_tier,spent_usd,input_tokens,output_tokens').eq('user_id',owner).single();assert.equal(ownUsage.error,null);
    assert.deepEqual(ownUsage.data,{user_id:owner,plan_tier:'free',spent_usd:0,input_tokens:0,output_tokens:0});
    await ensureUserRecords(createTenantContext({userId:other,via:'persisted_owner'}));
    assert.deepEqual((await admin.from('profiles').select('*').eq('id',other).single()).data,profile.data);
    assert.deepEqual((await admin.from('user_token_usage').select('*').eq('user_id',other).single()).data,usage.data);
  });
}
