import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {SupabaseClient} from '@supabase/supabase-js';
import {SupabaseProjectRuntimeStore} from '../synthesis/projectRuntime/store.js';
import {ProjectSecretManager} from '../synthesis/projectRuntime/secretManager.js';

export function registerRuntimeSecretReadTests(admin:SupabaseClient,getUsers:()=>readonly {id:string}[]):void{
  test('real runtime encrypted read binds owners and rejects malformed envelopes before secret resolution',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const [owner,other]=getUsers(),project=`secret-read-${randomUUID()}`,store=new SupabaseProjectRuntimeStore();
    t.after(async()=>{assert.equal((await admin.from('project_runtime_secrets').delete().eq('project_id',project).in('user_id',[owner.id,other.id])).error,null);});
    const keys={USER_SECRETS_ENCRYPTION_KEY:'disposable-synthetic-test-only'},secrets=new ProjectSecretManager(owner.id,store,keys),otherSecrets=new ProjectSecretManager(other.id,store,keys);
    await secrets.put({projectId:project,name:'API_TOKEN',scope:'preview',value:'owner-synthetic'});await otherSecrets.put({projectId:project,name:'API_TOKEN',scope:'preview',value:'other-synthetic'});
    assert.deepEqual(await secrets.resolveEnvironment(project,['preview']),{API_TOKEN:'owner-synthetic'});
    assert.deepEqual(await otherSecrets.resolveEnvironment(project,['preview']),{API_TOKEN:'other-synthetic'});
    assert.deepEqual(await store.loadEncryptedSecrets(owner.id,`${project}-missing`),[]);
    const saved=await admin.from('project_runtime_secrets').select('*').eq('user_id',owner.id).eq('project_id',project).single();assert.equal(saved.error,null);
    for(const mutation of [{encrypted_value:'v1:bad:bad:bad'},{key_version:2}]){
      assert.equal((await admin.from('project_runtime_secrets').update(mutation).eq('user_id',owner.id).eq('project_id',project)).error,null);
      await assert.rejects(secrets.resolveEnvironment(project,['preview']),{code:'RESOURCE_ACCESS_UNAVAILABLE'});
      assert.equal((await admin.from('project_runtime_secrets').update({encrypted_value:saved.data.encrypted_value,key_version:1}).eq('user_id',owner.id).eq('project_id',project)).error,null);
    }
    assert.deepEqual(await secrets.resolveEnvironment(project,['preview']),{API_TOKEN:'owner-synthetic'});
  });
}
