import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test, type TestContext } from 'node:test';
import { createClient,type SupabaseClient } from '@supabase/supabase-js';

type FixtureUser={id:string;token:string};
const metadata=(key:string)=>({type:'user_api_key',provider:'custom',env_var:key.slice('apikey_custom_'.length).toUpperCase(),sync_target:'vercel',connected_at:new Date().toISOString(),masked:'fixture-mask'});
const provider=()=>`apikey_custom_revision_${randomUUID().replaceAll('-','')}`;
function client() {
  assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');
  assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
  return createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
}
async function prepare(db:SupabaseClient,owner:string,key:string) {
  const result=await db.rpc('prepare_provider_key_write',{p_owner_id:owner,p_provider:key});
  assert.equal(result.error,null);assert.match(result.data,/^[0-9a-f-]{36}$/i);return result.data as string;
}
function save(db:SupabaseClient,owner:string,key:string,revision:string,extra:Record<string,unknown>={}) {
  // Synthetic ciphertext shape only. These cases prove DB fencing, not encryption.
  return db.rpc('save_provider_key_if_current',{p_owner_id:owner,p_provider:key,p_revision:revision,
    p_access_token:'v1:synthetic-ciphertext-only',p_metadata:metadata(key),...extra});
}

/** Register within the existing disposable suite so its users/cleanup remain canonical. */
export function registerProviderKeyRevisionTests(admin:SupabaseClient,getUsers:()=>readonly FixtureUser[]):void {
  // Register before attempting each mutation, so failed assertions cannot leak
  // generated credentials into later tests sharing these disposable owners.
  function cleanup(t:TestContext,owner:string,key:string):string {
    t.after(async()=>{
      const result=await admin.from('user_integrations').delete().eq('user_id',owner).eq('provider',key);
      assert.equal(result.error,null,`Could not clean up generated provider ${key}`);
    });
    return key;
  }
  for(const initiallyPresent of [false,true])test(`real two-client BYOK ${initiallyPresent?'existing':'absent'} save/revoke race retains revocation`,async(t)=>{
    const owner=getUsers()[0],writer=client(),revoker=client();
    for(let iteration=0;iteration<3;iteration++) {
      const key=cleanup(t,owner.id,provider());
      if(initiallyPresent) {
        const inserted=await admin.from('user_integrations').insert({user_id:owner.id,provider:key,access_token:'SYNTHETIC_PREEXISTING',metadata:metadata(key)});assert.equal(inserted.error,null);
      }
      const admitted=await prepare(writer,owner.id,key);
      if(!initiallyPresent) {
        const placeholder=await admin.from('user_integrations').select('access_token,metadata').eq('user_id',owner.id).eq('provider',key).single();
        assert.equal(placeholder.error,null);assert.equal(placeholder.data?.access_token,'');assert.equal(placeholder.data?.metadata.revoked,true);
      }
      const [saved,revoked]=await Promise.all([save(writer,owner.id,key,admitted),revoker.rpc('revoke_provider_key',{p_owner_id:owner.id,p_provider:key})]);
      assert.equal(saved.error,null);assert.ok(typeof saved.data==='boolean');assert.equal(revoked.error,null);assert.equal(revoked.data,true);
      const final=await admin.from('user_integrations').select('*').eq('user_id',owner.id).eq('provider',key).single();assert.equal(final.error,null);
      assert.equal(final.data.access_token,'');assert.equal(final.data.metadata.revoked,true);assert.notEqual(final.data.credential_revision,admitted);
      const stale=await save(writer,owner.id,key,admitted);assert.equal(stale.error,null);assert.equal(stale.data,false);
      const retained=await admin.from('user_integrations').select('*').eq('user_id',owner.id).eq('provider',key).single();assert.deepEqual(retained.data,final.data);
      const fresh=await prepare(writer,owner.id,key);const reconnect=await save(writer,owner.id,key,fresh);assert.equal(reconnect.error,null);assert.equal(reconnect.data,true);
      const active=await admin.from('user_integrations').select('access_token,metadata,credential_revision').eq('user_id',owner.id).eq('provider',key).single();
      assert.equal(active.error,null);assert.equal(active.data?.access_token,'v1:synthetic-ciphertext-only');assert.notEqual(active.data?.credential_revision,fresh);assert.notEqual(active.data?.metadata.revoked,true);
    }
  });

  test('real provider revision binds exact owner and provider, denies stale saves and rejects malformed metadata',async(t)=>{
    const [owner,other]=getUsers(),first=client(),second=client(),key=provider(),otherKey=provider();
    cleanup(t,owner.id,key);cleanup(t,other.id,key);cleanup(t,owner.id,otherKey);
    const revision=await prepare(first,owner.id,key);await prepare(second,other.id,key);await prepare(second,owner.id,otherKey);
    for(const [actor,selected]of [[other.id,key],[owner.id,otherKey]]) {
      const denied=await save(second,actor,selected,revision);assert.equal(denied.error,null);assert.equal(denied.data,false);
    }
    for(const bad of [null,[],{}, {...metadata(key),provider:'openai'}, {...metadata(key),env_var:'BAD-NAME'},
      {...metadata(key),env_var:'DIFFERENT_VALID_NAME'}, {...metadata(key),connected_at:'not-a-time'}, {...metadata(key),connected_at:'infinity'}, {...metadata(key),revoked:false}]) {
      const denied=await save(first,owner.id,key,revision,{p_metadata:bad});assert.equal(denied.error,null);assert.equal(denied.data,false);
    }
    const writes=await Promise.all([save(first,owner.id,key,revision),save(second,owner.id,key,revision)]);
    for(const written of writes)assert.equal(written.error,null);
    assert.deepEqual(writes.map(row=>row.data).sort(),[false,true]);
    for(const badProvider of ['github','../apikey_openai','apikey_custom_../../other']) {
      const denied=await first.rpc('prepare_provider_key_write',{p_owner_id:owner.id,p_provider:badProvider});assert.equal(denied.error,null);assert.equal(denied.data,null);
      const revoke=await first.rpc('revoke_provider_key',{p_owner_id:owner.id,p_provider:badProvider});assert.equal(revoke.error,null);assert.equal(revoke.data,false);
    }
  });

  test('real browser identity cannot bypass BYOK RPC or direct-write revision guards',async(t)=>{
    const owner=getUsers()[0],key=provider();
    cleanup(t,owner.id,key);
    const browser=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${owner.token}`}},auth:{persistSession:false,autoRefreshToken:false}});
    for(const [name,args]of [
      ['prepare_provider_key_write',{p_owner_id:owner.id,p_provider:key}],
      ['revoke_provider_key',{p_owner_id:owner.id,p_provider:key}],
      ['save_provider_key_if_current',{p_owner_id:owner.id,p_provider:key,p_revision:randomUUID(),p_access_token:'v1:synthetic-only',p_metadata:metadata(key)}],
    ]as const)assert.equal((await browser.rpc(name,args)).error?.code,'42501');
    const absent=await admin.from('user_integrations').select('id').eq('user_id',owner.id).eq('provider',key);assert.equal(absent.error,null);assert.deepEqual(absent.data,[]);
    const revision=await prepare(admin,owner.id,key);assert.equal((await save(admin,owner.id,key,revision)).data,true);
    const before=await admin.from('user_integrations').select('*').eq('user_id',owner.id).eq('provider',key).single();assert.equal(before.error,null);
    const browserInsert=await browser.from('user_integrations').insert({user_id:owner.id,provider:cleanup(t,owner.id,provider()),access_token:'FORBIDDEN_INSERT'});
    assert.equal(browserInsert.error?.code,'42501');
    for(const patch of [{access_token:'FORBIDDEN_REWRITE'},{credential_revision:randomUUID()},{provider:cleanup(t,owner.id,`non_byok_${randomUUID()}`)}]) {
      const denied:{error:unknown;data:unknown}=await browser.from('user_integrations').update(patch).eq('id',before.data.id).select('id');
      assert.equal(denied.error,null);assert.deepEqual(denied.data,[]);
    }
    const deletion=await browser.from('user_integrations').delete().eq('id',before.data.id).select('id');assert.equal(deletion.error,null);assert.deepEqual(deletion.data,[]);
    const after=await admin.from('user_integrations').select('*').eq('id',before.data.id).single();assert.equal(after.error,null);assert.deepEqual(after.data,before.data);
    // Existing non-BYOK permissions are deliberately unchanged, not certified.
    const ordinary=cleanup(t,owner.id,`fixture_non_byok_${randomUUID()}`);
    const legacy=await browser.from('user_integrations').insert({user_id:owner.id,provider:ordinary,access_token:'SYNTHETIC_NON_BYOK'}).select('id').single();assert.equal(legacy.error,null);
    const renamed=await browser.from('user_integrations').update({provider:cleanup(t,owner.id,provider())}).eq('id',legacy.data.id);
    assert.equal(renamed.error?.code,'42501');
    const stillOrdinary=await admin.from('user_integrations').select('provider,access_token').eq('id',legacy.data.id).single();
    assert.equal(stillOrdinary.error,null);assert.deepEqual(stillOrdinary.data,{provider:ordinary,access_token:'SYNTHETIC_NON_BYOK'});
    const allowed=await browser.from('user_integrations').update({access_token:'SYNTHETIC_NON_BYOK_UPDATED'}).eq('id',legacy.data.id).select('id');assert.equal(allowed.error,null);assert.equal(allowed.data?.length,1);
    assert.equal((await browser.from('user_integrations').delete().eq('id',legacy.data.id)).error,null);
  });
}
