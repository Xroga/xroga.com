import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {getUserProviderKey,listUserProviderKeys,resolveProviderEnvForDeploy} from '../services/integrations/userProviderKeys.js';
import {ensurePrivateOAuthBucket} from '../services/integrations/credentialStorageBucket.js';

type ApiRequest=(path:string,token?:string,method?:string,body?:unknown)=>Promise<Response>;
/** Actual disposable wrappers and private objects. No external provider traffic. */
export function registerCredentialReadMatrixTests(admin:SupabaseClient,request:ApiRequest):void{
 test('real BYOK owner selection mirror revalidation and paginated bulk revocation preserve exact foreign credentials',async t=>{
  assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
  const actors:{id:string;token:string}[]=[],paths:string[]=[],bucket='xroga-github-tokens';
  t.after(async()=>{if(paths.length)assert.equal((await admin.storage.from(bucket).remove(paths)).error,null);for(const actor of actors)assert.equal((await admin.auth.admin.deleteUser(actor.id)).error,null);});
  for(let i=0;i<2;i++){
   const email=`credential-matrix-${randomUUID()}@example.invalid`,password=`Synthetic-${randomUUID()}!`;
   const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(created.error,null);assert.ok(created.data.user);
   const client:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
   const signed=await client.auth.signInWithPassword({email,password});assert.equal(signed.error,null);assert.ok(signed.data.session);
   const verified=await admin.auth.getUser(signed.data.session.access_token);assert.equal(verified.error,null);assert.equal(verified.data.user?.id,created.data.user.id);
   actors.push({id:created.data.user.id,token:signed.data.session.access_token});
  }
  const [owner,other]=actors,suffix=randomUUID().replaceAll('-','').slice(0,12),env=`MATRIX_${suffix.toUpperCase()}`,provider=`custom_${env.toLowerCase()}`,providerRow=`apikey_${provider}`;
  assert.equal(await ensurePrivateOAuthBucket(),true);
  const objectPath=(actor:string,row:string)=>`${actor}/vault-${row}.json`;
  const upload=async(path:string,payload:string)=>{paths.push(path);assert.equal((await admin.storage.from(bucket).upload(path,payload,{upsert:true,contentType:'application/json'})).error,null);};
  const legacyProvider=`custom_fallback_${suffix}`,legacyRow=`apikey_${legacyProvider}`,legacyPath=objectPath(owner.id,legacyRow),legacySecret='SYNTHETIC_LOCAL_LEGACY_VALUE';
  const legacy={access_token:'enc:'+Buffer.from(`fixture:${legacySecret}`).toString('base64'),metadata:{provider:legacyProvider,env_var:`FALLBACK_${suffix.toUpperCase()}`,masked:'synthetic-mask',connected_at:new Date().toISOString()}};
  await upload(legacyPath,JSON.stringify(legacy));
  // Delay only delivery of an ACTUAL local Storage response. The concurrent
  // connection/revocation is persisted in the ACTUAL database, not a mock row.
  for(const mode of ['connect','revoke']){
   const original=globalThis.fetch;let observed=false;
   globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input instanceof Request?input.url:input));
    assert.equal(url.origin,'http://127.0.0.1:54321');
    const response=await original(input,init);
    if(!observed&&url.pathname.includes('/storage/v1/object/')&&url.pathname.endsWith('/'+legacyPath)){
     observed=true;
     if(mode==='connect')assert.equal((await admin.from('user_integrations').insert({user_id:owner.id,provider:legacyRow,...legacy})).error,null);
     else assert.equal((await admin.rpc('revoke_provider_key',{p_owner_id:owner.id,p_provider:legacyRow})).data,true);
    }
    return response;
   };
   try{
    if(mode==='connect'){const keys=await listUserProviderKeys(owner.id);assert.equal(keys.length,1);assert.equal(keys[0].provider,legacyProvider);assert.equal(await getUserProviderKey(owner.id,legacyProvider),legacySecret);assert.equal(await getUserProviderKey(other.id,legacyProvider),null);}
    else {assert.equal(await getUserProviderKey(owner.id,legacyProvider),null);const row=await admin.from('user_integrations').select('access_token,metadata').eq('user_id',owner.id).eq('provider',legacyRow).single();assert.equal(row.error,null);assert.equal(row.data?.access_token,'');assert.equal(row.data?.metadata.revoked,true);}
    assert.equal(observed,true);
   }finally{globalThis.fetch=original;}
   assert.equal((await admin.from('user_integrations').delete().eq('user_id',owner.id).eq('provider',legacyRow)).error,null);
  }
  const secrets=[`SYNTHETIC_OWNER_${suffix}_OWNR`,`SYNTHETIC_OTHER_${suffix}_OTHR`];
  for(const[index,actor]of actors.entries()){
   const saved=await request('/api/integrations/provider-keys',actor.token,'POST',{provider:'custom',apiKey:secrets[index],envVarName:env,userId:actors[1-index].id,tenantId:actors[1-index].id});
   assert.equal(saved.status,200);const body=await saved.json() as {envVar:string};assert.equal(body.envVar,env);assert.ok(!JSON.stringify(body).includes(secrets[index]));
  }
  const canonical=async(actor:string)=>{const r=await admin.from('user_integrations').select('*').eq('user_id',actor).eq('provider',providerRow).single();assert.equal(r.error,null);return r.data!;};
  const ownerRow=await canonical(owner.id),otherRow=await canonical(other.id);
  assert.match(ownerRow.access_token,/^vault:v3:/);assert.ok(!ownerRow.access_token.includes(secrets[0]));
  const mirror=async(actor:string)=>{const path=objectPath(actor,providerRow);if(!paths.includes(path))paths.push(path);for(let i=0;i<100;i++){const r=await admin.storage.from(bucket).download(path);if(!r.error&&r.data)return await r.data.text();await delay(20);}assert.fail('actual asynchronous owner mirror must be durable');};
  const ownMirror=await mirror(owner.id),foreignMirror=await mirror(other.id);assert.equal(JSON.parse(ownMirror).access_token,ownerRow.access_token);assert.equal(JSON.parse(foreignMirror).access_token,otherRow.access_token);
  for(const[index,actor]of actors.entries()){
   assert.equal(await getUserProviderKey(actor.id,provider),secrets[index]);assert.equal(await getUserProviderKey(actor.id,'custom'),secrets[index]);
   const selected=await resolveProviderEnvForDeploy(actor.id);assert.equal(selected[env],secrets[index]);assert.ok(!Object.values(selected).includes(secrets[1-index]));
   const list=await request(`/api/integrations/provider-keys?userId=${actors[1-index].id}`,actor.token);assert.equal(list.status,200);const body=await list.json() as {keys:{envVar:string;masked:string}[]};assert.equal(body.keys.length,1);assert.equal(body.keys[0].envVar,env);assert.equal(body.keys[0].masked,index===0?ownerRow.metadata.masked:otherRow.metadata.masked);
  }
  assert.equal(await getUserProviderKey(owner.id,legacyProvider),null,'orphan private mirror remains non-authoritative');
  const metadata=(variable:string)=>({type:'user_api_key',provider:'custom',env_var:variable,sync_target:'vercel',masked:'synthetic-mask',connected_at:new Date().toISOString()});
  const bulk=Array.from({length:101},(_,n)=>{const variable=`BULK_${suffix.toUpperCase()}_${String(n).padStart(3,'0')}`;return{user_id:owner.id,provider:`apikey_custom_${variable.toLowerCase()}`,access_token:ownerRow.access_token,metadata:metadata(variable)};});
  assert.equal((await admin.from('user_integrations').insert(bulk)).error,null);
  for(let offset=0;offset<bulk.length;offset+=8)await Promise.all(bulk.slice(offset,offset+8).map(row=>upload(objectPath(owner.id,row.provider),JSON.stringify({access_token:row.access_token,metadata:row.metadata}))));
  const unrelated=`${owner.id}/unrelated-fixture.json`;await upload(unrelated,'{"synthetic":"keep unrelated object"}');
  const before=await admin.from('user_integrations').select('*').eq('user_id',owner.id).order('provider');assert.equal(before.error,null);assert.equal(before.data?.length,102);
  assert.equal((await request('/api/integrations/provider-keys/custom',undefined,'DELETE',{userId:owner.id})).status,401);
  const denied=await admin.from('user_integrations').select('*').eq('user_id',owner.id).order('provider');assert.equal(denied.error,null);assert.deepEqual(denied.data,before.data);
  const revoked=await request(`/api/integrations/provider-keys/custom?userId=${other.id}`,owner.token,'DELETE',{userId:other.id,tenantId:other.id});assert.equal(revoked.status,200);
  const tombstones=await admin.from('user_integrations').select('provider,access_token,metadata').eq('user_id',owner.id).order('provider');assert.equal(tombstones.error,null);assert.equal(tombstones.data?.length,103);assert.ok(tombstones.data?.every(row=>row.access_token===''&&row.metadata.revoked===true));
  assert.equal(await getUserProviderKey(owner.id,provider),null);assert.deepEqual(await listUserProviderKeys(owner.id),[]);assert.deepEqual(await resolveProviderEnvForDeploy(owner.id),{});
  assert.equal(await getUserProviderKey(other.id,provider),secrets[1]);assert.deepEqual(await canonical(other.id),otherRow);
  const retained=await admin.storage.from(bucket).download(objectPath(other.id,providerRow));assert.equal(retained.error,null);assert.equal(await retained.data!.text(),foreignMirror);
  for(const path of [legacyPath,objectPath(owner.id,providerRow),objectPath(owner.id,bulk[0].provider),objectPath(owner.id,bulk[100].provider)])assert.ok((await admin.storage.from(bucket).download(path)).error,'Owned selected private mirrors are removed across both pages');
  const keep=await admin.storage.from(bucket).download(unrelated);assert.equal(keep.error,null);assert.equal(await keep.data!.text(),'{"synthetic":"keep unrelated object"}');
  assert.equal((await request('/api/integrations/provider-keys/custom',owner.token,'DELETE',{})).status,200,'Bulk disconnect replay remains safe');
  assert.deepEqual(await canonical(other.id),otherRow);assert.equal(await getUserProviderKey(other.id,provider),secrets[1]);
 });
}
