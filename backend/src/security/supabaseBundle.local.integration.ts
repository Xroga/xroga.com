import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test, type TestContext } from 'node:test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { prepareSupabaseBundleWrite,readUserSupabaseBundle,saveSupabaseBundle } from '../services/integrations/userProviderKeys.js';
import {ensurePrivateOAuthBucket} from '../services/integrations/credentialStorageBucket.js';

const providers=['apikey_supabase','apikey_supabase_anon','apikey_supabase_db_password','apikey_supabase_url'];
type FixtureUser={id:string;token:string};
type Row={provider:string;credential_revision:string;metadata:Record<string,unknown>;access_token:string};

/** Register only inside the existing guarded disposable Supabase suite. */
export function registerSupabaseBundleTests(admin:SupabaseClient,getUsers:()=>readonly FixtureUser[]):void {
  test('real provisioning bundle denies orphan private mirrors and preserves canonical legacy owner grants',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');
    assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const created=await admin.auth.admin.createUser({email:`bundle-authority-${randomUUID()}@example.invalid`,email_confirm:true});
    assert.equal(created.error,null);assert.ok(created.data.user);const owner=created.data.user.id;
    const bucket='xroga-github-tokens',names=['supabase_url','supabase_anon','supabase'] as const;
    const paths=names.map(name=>`${owner}/vault-apikey_${name}.json`);
    t.after(async()=>{assert.equal((await admin.storage.from(bucket).remove(paths)).error,null);assert.equal((await admin.auth.admin.deleteUser(owner)).error,null);});
    assert.equal(await ensurePrivateOAuthBucket(),true);
    const jwt=(role:string)=>`e30.${Buffer.from(JSON.stringify({ref:'fixtureproject',role})).toString('base64url')}.synthetic`;
    const values={supabase_url:'https://fixtureproject.supabase.co',supabase_anon:jwt('anon'),supabase:jwt('service_role')};
    const rows=names.map(name=>({user_id:owner,provider:`apikey_${name}`,access_token:'enc:'+Buffer.from(`fixture:${values[name]}`).toString('base64'),metadata:{}}));
    for(const [index,row]of rows.entries())assert.equal((await admin.storage.from(bucket).upload(paths[index]!,JSON.stringify(row),{contentType:'application/json'})).error,null);
    const current=async()=>{const result=await admin.from('user_integrations').select('*').eq('user_id',owner).order('provider');assert.equal(result.error,null);return result.data!;};
    assert.deepEqual(await current(),[]);assert.equal(await readUserSupabaseBundle(owner),null);
    const admission=await prepareSupabaseBundleWrite(owner);
    await assert.rejects(saveSupabaseBundle(admission,{projectUrl:values.supabase_url,anonKey:values.supabase_anon}),/Disconnect/);
    assert.deepEqual(await current(),[],'Explicit reconnect cannot inherit orphan privileged authority from a public anon key');
    assert.equal((await admin.from('user_integrations').insert(rows)).error,null);
    assert.equal((await readUserSupabaseBundle(owner))?.serviceRoleKey,values.supabase,'Existing matching database legacy grants remain usable');
    assert.equal(await readUserSupabaseBundle(getUsers()[1].id),null,'A different actor cannot select this bundle');
    const canonical=await current();
    assert.equal((await admin.from('user_integrations').delete().eq('user_id',owner).eq('provider','apikey_supabase')).error,null);
    const partial=await readUserSupabaseBundle(owner);assert.ok(partial);assert.equal(partial.serviceRoleKey,null);
    assert.deepEqual((await current()).map(row=>row.id),canonical.filter(row=>row.provider!=='apikey_supabase').map(row=>row.id));
    assert.equal((await admin.from('user_integrations').delete().eq('user_id',owner)).error,null);
    assert.equal(await readUserSupabaseBundle(owner),null);assert.deepEqual(await current(),[]);
    for(const path of paths){const retained=await admin.storage.from(bucket).download(path);assert.equal(retained.error,null);assert.ok(retained.data,'Read denial must preserve legacy objects for explicit reconnect');}
  });
  const read=async(owner:string)=>{
    const result=await admin.from('user_integrations').select('*').eq('user_id',owner).in('provider',providers).order('provider');
    assert.equal(result.error,null);return result.data as Row[];
  };
  const request=(rows:Row[],label:string)=>providers.map(provider=>({
    provider,revision:rows.find(row=>row.provider===provider)?.credential_revision??null,
    access_token:`v1:synthetic-${label}-${provider}`,
    metadata:{provider:provider.slice(7),env_var:provider==='apikey_supabase'?'SUPABASE_SERVICE_ROLE_KEY':provider==='apikey_supabase_url'?'NEXT_PUBLIC_SUPABASE_URL':provider==='apikey_supabase_anon'?'NEXT_PUBLIC_SUPABASE_ANON_KEY':'SUPABASE_DB_PASSWORD',
      type:provider==='apikey_supabase_db_password'?'supabase_provision':'user_api_key',sync_target:provider==='apikey_supabase_db_password'?'xroga_server':'vercel',connected_at:new Date().toISOString(),masked:'fixture-mask'},
  }));
  const save=(client:SupabaseClient,owner:string,rows:ReturnType<typeof request>,ref='fixtureproject')=>client.rpc('save_supabase_bundle_if_current',{p_owner_id:owner,p_project_ref:ref,p_rows:rows});
  function fixture(t:TestContext) {
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');
    assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const owner=getUsers()[0];
    t.after(async()=>{const cleared=await admin.from('user_integrations').delete().eq('user_id',owner.id).in('provider',providers);assert.equal(cleared.error,null);});
    return owner;
  }
  test('real Supabase empty owner admission preserves absent rows and missing legacy objects',async(t)=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');
    assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const created=await admin.auth.admin.createUser({email:`bundle-${randomUUID()}@example.invalid`,password:`Synthetic-${randomUUID()}!`,email_confirm:true});
    assert.equal(created.error,null);assert.ok(created.data.user);
    const owner=created.data.user.id;
    t.after(async()=>{const removed=await admin.auth.admin.deleteUser(owner);assert.equal(removed.error,null);});
    assert.deepEqual(await read(owner),[]);
    const admission=await prepareSupabaseBundleWrite(owner);
    assert.equal(admission.userId,owner);
    assert.deepEqual(await read(owner),[],'Read-only admission cannot create tombstones or mask mirrors');
  });
  test('real Supabase atomic bundle commits exactly one concurrent generation and rolls back all stale writes',async(t)=>{
    const owner=fixture(t),other=getUsers()[1];
    const foreignBefore=await read(other.id);
    const initial=await read(owner.id);
    const first=request(initial,'first'),second=request(initial,'second');
    const client=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
    const results=await Promise.all([save(admin,owner.id,first),save(client,owner.id,second)]);
    assert.ok(results.every(result=>result.error===null));
    assert.deepEqual(results.map(result=>result.data).sort(),[false,true]);
    const committed=await read(owner.id);
    assert.equal(committed.length,4);
    assert.equal(new Set(committed.map(row=>row.metadata.supabase_bundle_id)).size,1);
    const winner=results[0].data?'first':'second';
    assert.ok(committed.every(row=>row.access_token===`v1:synthetic-${winner}-${row.provider}`));
    assert.ok(committed.every(row=>row.metadata.supabase_project_ref==='fixtureproject'));
    const stale=request(committed,'stale');
    // Last sorted row fails after preceding rows would otherwise have updated.
    stale.find(row=>row.provider==='apikey_supabase_url')!.revision=randomUUID();
    const rejected=await save(admin,owner.id,stale);
    assert.equal(rejected.error,null);assert.equal(rejected.data,false);
    assert.deepEqual(await read(owner.id),committed);
    const wrongOwner=await save(admin,other.id,request(committed,'foreign'));
    assert.equal(wrongOwner.error,null);assert.equal(wrongOwner.data,false);
    assert.deepEqual(await read(other.id),foreignBefore);
    const browser=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${owner.token}`}},auth:{persistSession:false,autoRefreshToken:false}});
    assert.ok((await save(browser,owner.id,request(committed,'browser'))).error);
  });
  test('real Supabase bundle admission cannot survive individual revocation or retain binding after a generic overwrite',async(t)=>{
    const owner=fixture(t);
    const seeded=await save(admin,owner.id,request(await read(owner.id),'seed'));
    assert.equal(seeded.error,null);assert.equal(seeded.data,true);
    const admitted=await read(owner.id);
    const revoked=await admin.rpc('revoke_provider_key',{p_owner_id:owner.id,p_provider:'apikey_supabase'});
    assert.equal(revoked.error,null);assert.equal(revoked.data,true);
    const tombstones=await read(owner.id);
    const stale=await save(admin,owner.id,request(admitted,'revoked'));
    assert.equal(stale.error,null);assert.equal(stale.data,false);assert.deepEqual(await read(owner.id),tombstones);
    const restored=await save(admin,owner.id,request(tombstones,'fresh'));
    assert.equal(restored.error,null);assert.equal(restored.data,true);
    const current=await read(owner.id),one=request(current,'single')[0];
    const overwritten=await admin.rpc('save_provider_key_if_current',{p_owner_id:owner.id,p_provider:one.provider,p_revision:one.revision,p_access_token:one.access_token,p_metadata:one.metadata});
    assert.equal(overwritten.error,null);assert.equal(overwritten.data,true);
    const after=await read(owner.id);
    assert.equal(after.find(row=>row.provider===one.provider)?.metadata.supabase_bundle_id,undefined);
    assert.ok(after.filter(row=>row.provider!==one.provider).every(row=>row.metadata.supabase_bundle_id));
  });
}
