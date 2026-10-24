import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { openRuntimeCredential, sealRuntimeCredential } from '../services/integrations/credentialVaultRuntime.js';

async function sessionEnvelope(owner: string, provider: string) {
  const vault_revision = randomUUID();
  const verifier = await sealRuntimeCredential(owner, {provider, account:provider, credentialType:'pkce-verifier',
    recordId:provider, revision:vault_revision, scope:'oauth-session'}, 'synthetic-verifier');
  return {verifier, vault_revision, vault_format:'pkce-v1'};
}

export function registerOAuthSessionTests(admin:SupabaseClient, users:()=>Array<{id:string;token:string}>) {
  test('real two-client OAuth claims enforce one-use, expiry, identity and newer-session preservation',async(t)=>{
    const [owner,foreign]=users();
    t.after(async()=>{const removed=await admin.from('user_integrations').delete().eq('user_id',owner.id)
      .in('provider',['vercel','supabase_oauth','apikey_cws_oauth','github','github_oauth_pkce','vercel_oauth_pkce','supabase_oauth_pkce','cws_oauth_pkce']);assert.equal(removed.error,null);});
    const other=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
    for(const provider of ['vercel_oauth_pkce','supabase_oauth_pkce','cws_oauth_pkce','github_oauth_pkce']) {
      const state=randomUUID();
      const write=async(created_at:string,overrides:Record<string,unknown>={})=>{
        const envelope=await sessionEnvelope(owner.id,provider);
        let authorization_revision: string | undefined;
        {
          const started=await admin.rpc('begin_oauth_session',{p_owner_id:owner.id,p_provider:provider,
            p_session:{...envelope,state,redirect_uri:'https://example.invalid/callback'}});
          assert.equal(started.error,null);assert.equal(started.data,true);
          const target=provider==='vercel_oauth_pkce'?'vercel':provider==='cws_oauth_pkce'?'apikey_cws_oauth':provider==='github_oauth_pkce'?'github':'supabase_oauth';
          const authority=await admin.from('user_integrations').select('credential_revision').eq('user_id',owner.id).eq('provider',target).single();
          assert.equal(authority.error,null);authorization_revision=authority.data!.credential_revision;
        }
        const row=await admin.from('user_integrations').upsert({user_id:owner.id,provider,access_token:envelope.verifier,
          metadata:{state,created_at,redirect_uri:'https://example.invalid/callback',authorization_revision,
            vault_revision:envelope.vault_revision,vault_format:envelope.vault_format,...overrides}},{onConflict:'user_id,provider'});
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
      const accepted=claims.filter(c=>c.data?.verifier?.startsWith('vault:v3:'));
      assert.equal(accepted.length,1);
      assert.equal(await openRuntimeCredential(owner.id,{provider,account:provider,credentialType:'pkce-verifier',
        recordId:provider,revision:accepted[0].data.vault_revision,scope:'oauth-session'},accepted[0].data.verifier),'synthetic-verifier');
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

  test('real OAuth epoch fences two-client callbacks, reconnect, disconnect and reused refresh tokens',async(t)=>{
    const [owner,foreign]=users();
    t.after(async()=>{const removed=await admin.from('user_integrations').delete().eq('user_id',owner.id)
      .in('provider',['vercel','supabase_oauth','apikey_cws_oauth','github','github_oauth_pkce','vercel_oauth_pkce','supabase_oauth_pkce','cws_oauth_pkce']);assert.equal(removed.error,null);});
    const other=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
    t.after(async()=>{const removed=await admin.from('github_integrations').delete().eq('user_id',owner.id);assert.equal(removed.error,null);});
    for(const provider of ['supabase_oauth','vercel','apikey_cws_oauth','github']) {
      const cws=provider==='apikey_cws_oauth';
      const github=provider==='github';
      const sessionProvider=provider==='vercel'?'vercel_oauth_pkce':cws?'cws_oauth_pkce':github?'github_oauth_pkce':'supabase_oauth_pkce';
      const start=async()=>{
        const state=randomUUID();
        const envelope=await sessionEnvelope(owner.id,sessionProvider);
        const result=await admin.rpc('begin_oauth_session',{p_owner_id:owner.id,p_provider:sessionProvider,
          p_session:{state,...envelope,redirect_uri:'https://example.invalid/callback'}});
        assert.equal(result.error,null);assert.equal(result.data,true);return state;
      };
      const claim=async(state:string,client=admin)=>{
        const result=await client.rpc('consume_oauth_session',{p_owner_id:owner.id,p_provider:sessionProvider,p_state:state});
        assert.equal(result.error,null);return result.data;
      };
      const save=async(revision:string,token:string,client=admin,user=owner.id,refresh:string|null=null)=>{
        const vaultRevision=randomUUID();
        const encrypted=cws?`v1:${token}`:await sealRuntimeCredential(user,{provider,account:provider,
          credentialType:'oauth-token',recordId:provider,revision:vaultRevision,scope:github?'github-connection':'oauth-connection'},
          github?token:JSON.stringify({access_token:token,refresh_token:'synthetic-reused-refresh'}));
        const result=github?await client.rpc('save_github_oauth_connection',{p_owner_id:user,p_revision:revision,p_access_token:encrypted,p_vault_revision:vaultRevision,
          p_provider_user_id:'synthetic-account',p_username:'synthetic-user',p_repo_strategy:'auto',p_default_repo:null})
          :cws?await client.rpc('save_cws_oauth_key_if_current',{p_owner_id:user,p_provider:provider,p_revision:revision,
          p_access_token:`v1:${token}`,p_metadata:{provider:'cws_oauth',type:'user_publish_credential',env_var:'CWS_OAUTH_JSON',
            sync_target:'eas',connected_at:new Date().toISOString(),masked:'synthetic'}})
          :await client.rpc('save_oauth_connection',{p_owner_id:user,p_provider:provider,p_revision:revision,
            p_access_token:encrypted,p_refresh_token:null,p_metadata:{vault_revision:vaultRevision,vault_format:'oauth-v1'},p_provider_user_id:null,p_expected_refresh_token:refresh});
        assert.equal(result.error,null);return result.data;
      };
      const current=async()=>{
        const row=await admin.from('user_integrations').select('*').eq('user_id',owner.id).eq('provider',provider).single();
        if(github){const primary=await admin.from('github_integrations').select('access_token').eq('user_id',owner.id).single();
          assert.equal(primary.error,null);assert.equal(primary.data?.access_token,row.data?.access_token);}
        assert.equal(row.error,null);
        let token=row.data!.access_token;
        if(cws)token=token.replace(/^v1:/,'');
        else if(token){const plain=await openRuntimeCredential(owner.id,{provider,account:provider,credentialType:'oauth-token',
          recordId:provider,revision:row.data!.metadata.vault_revision,scope:github?'github-connection':'oauth-connection'},token);
          token=github?plain:JSON.parse(plain).access_token;}
        return {...row.data!,access_token:token};
      };
      // Both exchanges were valid when started. Only the newest explicit authorization may save.
      const first=await claim(await start());const second=await claim(await start(),other);
      assert.equal(await save(first.authorization_revision,'late-first',other),false);
      assert.equal(await save(second.authorization_revision,'foreign',other,foreign.id),false);
      const raced=await Promise.all([save(second.authorization_revision,'winner-a'),save(second.authorization_revision,'winner-b',other)]);
      assert.deepEqual(raced.sort(),[false,true]);
      const connected=await current();assert.ok(['winner-a','winner-b'].includes(connected.access_token));
      // Refresh responses may reuse the same provider refresh token. Revision still permits one winner.
      if(!cws&&!github){
        assert.equal(await save(connected.credential_revision,'refresh-winner',admin,owner.id,'synthetic-reused-refresh'),true);
        assert.equal(await save(connected.credential_revision,'late-refresh',other,owner.id,'synthetic-reused-refresh'),false);
      }
      const pending=await claim(await start());
      const revoked=github?await other.rpc('revoke_github_oauth_connection',{p_owner_id:owner.id})
        :await other.from('user_integrations').upsert({user_id:owner.id,provider,access_token:'',refresh_token:null,
        credential_revision:randomUUID(),metadata:{revoked:true}},{onConflict:'user_id,provider'});
      assert.equal(revoked.error,null);
      assert.equal(await save(pending.authorization_revision,'late-after-disconnect'),false);
      assert.equal((await current()).access_token,'');
      const unconsumed=await start();
      const revokeAgain=github?await other.rpc('revoke_github_oauth_connection',{p_owner_id:owner.id})
        :await other.from('user_integrations').update({credential_revision:randomUUID(),access_token:'',refresh_token:null,metadata:{revoked:true}})
        .eq('user_id',owner.id).eq('provider',provider);assert.equal(revokeAgain.error,null);
      assert.equal(await claim(unconsumed),null,'disconnect invalidates outstanding state even before session cleanup');
      const fresh=await claim(await start());assert.equal(await save(fresh.authorization_revision,'fresh-reconnect'),true);
      assert.equal(await save(pending.authorization_revision,'older-reply'),false);
      assert.equal((await current()).access_token,'fresh-reconnect');
      const browser=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${owner.token}`}},auth:{persistSession:false,autoRefreshToken:false}});
      const denied=await browser.rpc('begin_oauth_session',{p_owner_id:owner.id,p_provider:sessionProvider,p_session:{}});assert.ok(denied.error);
      const mutation=await browser.from('user_integrations').update({access_token:'browser-bypass'}).eq('user_id',owner.id).eq('provider',provider).select('id');
      assert.ok(mutation.error||mutation.data?.length===0);assert.equal((await current()).access_token,'fresh-reconnect');
      if(github){const primaryBypass=await browser.from('github_integrations').update({access_token:'browser-bypass'}).eq('user_id',owner.id).select('id');
        assert.ok(primaryBypass.error||primaryBypass.data?.length===0);assert.equal((await current()).access_token,'fresh-reconnect');}
    }
  });
}
