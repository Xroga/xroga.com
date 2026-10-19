import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {createTenantContext,type TenantContext} from './tenantContext.js';
import {storePkceSession,consumePkceSession,clearPkceSession,saveOAuthConnection,loadProviderToken,clearProviderToken} from '../services/integrations/oauthPkceStore.js';
import {ensurePrivateOAuthBucket} from '../services/integrations/credentialStorageBucket.js';
import {getSupabaseOAuthAccessToken} from '../services/integrations/supabaseAuth.js';
import {getVercelToken} from '../services/integrations/vercelAuth.js';
import {prepareUserProviderKeyWrite,saveUserProviderKey,getUserProviderKey,deleteUserProviderKey} from '../services/integrations/userProviderKeys.js';

/** Actual existing wrapper + Auth/DB/storage behavior. No OAuth provider call. */
export function registerOAuthWrapperOwnershipTests(admin:SupabaseClient):void{
  test('real CWS credential wrapper binds consumed OAuth owner admission and rejects foreign cloned revoked and replayed writes',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const actors:{id:string;context:TenantContext}[]=[],paths:string[]=[];
    t.after(async()=>{if(paths.length)assert.equal((await admin.storage.from('xroga-github-tokens').remove(paths)).error,null);for(const actor of actors)assert.equal((await admin.auth.admin.deleteUser(actor.id)).error,null);});
    for(let i=0;i<2;i++){const created=await admin.auth.admin.createUser({email:`cws-wrapper-${randomUUID()}@example.invalid`,email_confirm:true});assert.equal(created.error,null);assert.ok(created.data.user);actors.push({id:created.data.user.id,context:createTenantContext({userId:created.data.user.id,via:'persisted_owner'})});paths.push(`${created.data.user.id}/vault-apikey_cws_oauth.json`);}
    const [owner,other]=actors,provider='cws_oauth',rowProvider='apikey_cws_oauth';
    const authorize=async(actor:typeof owner)=>{const state=randomUUID();await storePkceSession(actor.context,'cws_oauth_pkce',{state,verifier:'synthetic',redirect_uri:'http://127.0.0.1/callback',created_at:new Date().toISOString()});const receipt=await consumePkceSession(actor.context,'cws_oauth_pkce',state);assert.ok(receipt?.authorization_revision);assert.equal(await consumePkceSession(actor.context,'cws_oauth_pkce',state),null);return prepareUserProviderKeyWrite(actor.id,provider,{cwsAuthorizationRevision:receipt.authorization_revision});};
    const read=async(actor:typeof owner)=>{const row=await admin.from('user_integrations').select('*').eq('user_id',actor.id).eq('provider',rowProvider).single();assert.equal(row.error,null);return row.data!;};
    const values=actors.map((actor,index)=>JSON.stringify({clientId:`synthetic-${index}`,clientSecret:'SYNTHETIC_NOT_A_PROVIDER_SECRET',refreshToken:`SYNTHETIC_${actor.id}`}));
    for(const[index,actor]of actors.entries()){const admission=await authorize(actor);const saved=await saveUserProviderKey(actor.id,provider,values[index],{writeAdmission:admission});assert.equal(saved.connected,true);assert.equal(await getUserProviderKey(actor.id,provider),values[index]);await assert.rejects(saveUserProviderKey(actor.id,provider,values[index],{writeAdmission:admission}),{code:'CREDENTIAL_WRITE_CONFLICT'});}
    const before=await read(owner),foreign=await read(other),admission=await authorize(owner);
    await assert.rejects(saveUserProviderKey(other.id,provider,values[0],{writeAdmission:admission}),{code:'CREDENTIAL_WRITE_CONFLICT'});
    await assert.rejects(saveUserProviderKey(owner.id,provider,values[0],{writeAdmission:{...admission}}),{code:'CREDENTIAL_WRITE_CONFLICT'});
    // New authorization advances only its revision, never another owner's key.
    assert.equal((await read(owner)).access_token,before.access_token);assert.deepEqual(await read(other),foreign);
    await deleteUserProviderKey(owner.context,provider);const revoked=await read(owner);assert.equal(revoked.access_token,'');assert.equal(revoked.metadata.revoked,true);
    await assert.rejects(saveUserProviderKey(owner.id,provider,values[0],{writeAdmission:admission}),{code:'CREDENTIAL_WRITE_CONFLICT'});assert.deepEqual(await read(owner),revoked);assert.equal(await getUserProviderKey(owner.id,provider),null);assert.deepEqual(await read(other),foreign);
    const reconnect=await authorize(owner);await saveUserProviderKey(owner.id,provider,values[0],{writeAdmission:reconnect});assert.equal(await getUserProviderKey(owner.id,provider),values[0]);assert.deepEqual(await read(other),foreign);
    for(const actor of actors){const expected=await read(actor);let durable=false;for(let i=0;i<100;i++){const mirror=await admin.storage.from('xroga-github-tokens').download(`${actor.id}/vault-apikey_cws_oauth.json`);if(!mirror.error&&JSON.parse(await mirror.data.text()).access_token===expected.access_token){durable=true;break;}await delay(20);}assert.equal(durable,true,'Actual asynchronous mirror completes before fixture cleanup');}
  });
  test('real OAuth wrappers retain issued owner provider revision and revocation across one-use sessions',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const actors:{id:string;context:TenantContext}[]=[],paths:string[]=[],bucket='xroga-github-tokens';
    t.after(async()=>{
      if(paths.length)assert.equal((await admin.storage.from(bucket).remove(paths)).error,null);
      for(const actor of actors)assert.equal((await admin.auth.admin.deleteUser(actor.id)).error,null);
    });
    for(let index=0;index<2;index++){
      const email=`oauth-wrapper-${randomUUID()}@example.invalid`,password=`Synthetic-${randomUUID()}!`;
      const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(created.error,null);assert.ok(created.data.user);
      const user={id:created.data.user.id,context:createTenantContext({userId:created.data.user.id,via:'remote_getuser'})};actors.push(user);
      const client:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{autoRefreshToken:false,persistSession:false}});
      const signed=await client.auth.signInWithPassword({email,password});assert.equal(signed.error,null);assert.ok(signed.data.session);
      const verified=await admin.auth.getUser(signed.data.session.access_token);assert.equal(verified.error,null);assert.equal(verified.data.user?.id,user.id);
    }
    const [owner,other]=actors;assert.equal(await ensurePrivateOAuthBucket(),true);
    for(const provider of ['supabase_oauth_pkce','vercel_oauth_pkce','github_oauth_pkce','cws_oauth_pkce']){
      const state=randomUUID(),session={state,verifier:`synthetic-pkce-${randomUUID()}`,redirect_uri:'http://127.0.0.1/callback',created_at:new Date().toISOString()};
      await assert.rejects(storePkceSession({...owner.context},provider,session),{status:401});
      await storePkceSession(owner.context,provider,session);
      await assert.rejects(consumePkceSession({...owner.context},provider,state),{status:401});
      assert.equal(await consumePkceSession(other.context,provider,state),null);
      assert.equal(await consumePkceSession(owner.context,provider==='vercel_oauth_pkce'?'supabase_oauth_pkce':'vercel_oauth_pkce',state),null);
      assert.equal(await consumePkceSession(owner.context,provider,randomUUID()),null);
      const claimed=await consumePkceSession(owner.context,provider,state);assert.ok(claimed);
      assert.equal(claimed.state,state);assert.equal(claimed.verifier,session.verifier);assert.equal(claimed.redirect_uri,session.redirect_uri);assert.match(claimed.authorization_revision!,/^[0-9a-f-]{36}$/i);
      assert.equal(await consumePkceSession(owner.context,provider,state),null);
      if(provider==='supabase_oauth_pkce'||provider==='vercel_oauth_pkce'){
        const selected=provider==='vercel_oauth_pkce'?'vercel':'supabase_oauth';
        const token={access_token:`SYNTHETIC_OAUTH_${randomUUID()}`,refresh_token:`SYNTHETIC_REFRESH_${randomUUID()}`,metadata:{connected_at:new Date().toISOString()}};
        await assert.rejects(saveOAuthConnection(other.id,selected,token,claimed.authorization_revision));
        await assert.rejects(saveOAuthConnection(owner.id,selected==='vercel'?'supabase_oauth':'vercel',token,claimed.authorization_revision));
        await saveOAuthConnection(owner.id,selected,token,claimed.authorization_revision,undefined,'fixture-owner-account');
        const active=await loadProviderToken(owner.id,selected,{authoritativeOnly:true});assert.equal(active?.access_token,token.access_token);assert.equal(active?.refresh_token,token.refresh_token);assert.ok(active?.credential_revision);assert.notEqual(active.credential_revision,claimed.authorization_revision);
        assert.notEqual((await loadProviderToken(other.id,selected))?.access_token,token.access_token);
        const consumer=selected==='vercel'?getVercelToken:getSupabaseOAuthAccessToken;
        assert.equal(await consumer(owner.id),token.access_token,'The actual token consumer selects this owner connection');
        assert.equal(await consumer(other.id),null,'The other real authenticated actor cannot inherit this connection');
        const durable=await admin.from('user_integrations').select('user_id,provider,provider_user_id,credential_revision').eq('user_id',owner.id).eq('provider',selected).single();
        assert.equal(durable.error,null);assert.deepEqual(durable.data,{user_id:owner.id,provider:selected,provider_user_id:'fixture-owner-account',credential_revision:active.credential_revision});
        const mirrors=actors.map(actor=>`${actor.id}/oauth-${selected}.json`),payload=JSON.stringify({access_token:'SYNTHETIC_LEGACY_MIRROR_ONLY'});
        for(const path of mirrors){paths.push(path);assert.equal((await admin.storage.from(bucket).upload(path,payload,{contentType:'application/json'})).error,null);}
        await clearProviderToken(owner.id,selected);assert.equal(await loadProviderToken(owner.id,selected),null);
        assert.ok((await admin.storage.from(bucket).download(mirrors[0]!)).error,'Only the owner legacy object is removed');
        const foreignMirror=await admin.storage.from(bucket).download(mirrors[1]!);assert.equal(foreignMirror.error,null);assert.equal(await foreignMirror.data!.text(),payload);
        await assert.rejects(saveOAuthConnection(owner.id,selected,token,active.credential_revision,token.refresh_token));
        assert.equal(await loadProviderToken(owner.id,selected),null,'A prior refresh receipt cannot restore revoked ownership');
        assert.equal(await consumer(owner.id),null,'The actual consumer rejects the revoked connection and its legacy mirror');
      }
      await assert.rejects(clearPkceSession({...owner.context},provider),{status:401});await clearPkceSession(owner.context,provider);
      assert.equal(await consumePkceSession(owner.context,provider,state),null);
      const retained=await admin.from('user_integrations').select('user_id,provider,access_token,metadata').eq('user_id',owner.id).eq('provider',provider).single();assert.equal(retained.error,null);assert.equal(retained.data?.access_token,'');assert.equal(retained.data?.metadata.revoked,true);
    }
  });
}
