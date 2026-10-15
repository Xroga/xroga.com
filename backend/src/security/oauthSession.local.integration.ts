import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function registerOAuthSessionTests(admin:SupabaseClient, users:()=>Array<{id:string;token:string}>) {
  test('real two-client OAuth claims enforce one-use, expiry, identity and newer-session preservation',async()=>{
    const [owner,foreign]=users();
    const other=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
    for(const provider of ['vercel_oauth_pkce','supabase_oauth_pkce','cws_oauth_pkce']) {
      const state=randomUUID();
      const write=async(created_at:string,overrides:Record<string,unknown>={})=>{
        const row=await admin.from('user_integrations').upsert({user_id:owner.id,provider,access_token:'synthetic-verifier',
          metadata:{state,created_at,redirect_uri:'https://example.invalid/callback',...overrides}},{onConflict:'user_id,provider'});
        assert.equal(row.error,null);
      };
      const claim=(client=admin,userId=owner.id,expected=state)=>client.rpc('consume_oauth_session',{p_owner_id:userId,p_provider:provider,p_state:expected});
      for(const date of ['not-a-date','infinity',new Date(Date.now()+60000).toISOString(),new Date(Date.now()-660000).toISOString()]){
        await write(date);const denied=await claim();assert.equal(denied.error,null);assert.equal(denied.data,null);
      }
      await write(new Date().toISOString(),{revoked:true});assert.equal((await claim()).data,null);
      await write(new Date().toISOString());
      for(const denied of [await claim(admin,foreign.id),await claim(admin,owner.id,randomUUID())]){
        assert.equal(denied.error,null);assert.equal(denied.data,null);
      }
      const claims=await Promise.all([claim(),claim(other)]);claims.forEach(c=>assert.equal(c.error,null));
      assert.equal(claims.filter(c=>c.data?.verifier==='synthetic-verifier').length,1);
      assert.equal(claims.filter(c=>c.data===null).length,1);
      assert.equal((await claim()).data,null);
      const nextState=randomUUID();await write(new Date().toISOString(),{state:nextState});
      assert.equal((await claim()).data,null);
      assert.equal((await claim(admin,owner.id,nextState)).data?.state,nextState);
      const browser=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${owner.token}`}},auth:{persistSession:false,autoRefreshToken:false}});
      assert.ok((await claim(browser)).error);
      const mutate=await browser.from('user_integrations').update({access_token:'browser-bypass'}).eq('user_id',owner.id).eq('provider',provider).select('id');
      assert.ok(mutate.error||mutate.data?.length===0);
      const canonical=await admin.from('user_integrations').select('access_token').eq('user_id',owner.id).eq('provider',provider).single();
      assert.equal(canonical.error,null);assert.equal(canonical.data?.access_token,'');
    }
  });
}
