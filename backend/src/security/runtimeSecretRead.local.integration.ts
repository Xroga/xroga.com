import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {SupabaseProjectRuntimeStore} from '../synthesis/projectRuntime/store.js';
import {ProjectSecretManager} from '../synthesis/projectRuntime/secretManager.js';
import {ProjectRuntimeManager} from '../synthesis/projectRuntime/manager.js';
import {FlyProjectRuntimeProvider} from '../synthesis/projectRuntime/flyProvider.js';
import type {ProjectRuntimeSession,ProviderRuntimeCommand} from '../synthesis/projectRuntime/types.js';

export function registerRuntimeSecretReadTests(admin:SupabaseClient,getUsers:()=>readonly {id:string;token:string}[]):void{
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
  test('real runtime secret mutations retain owner-inclusive keys and exact receipts through concurrent writes deletes and session consumers',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const [owner,other]=getUsers(),project=`secret-write-${randomUUID()}`,sessionId=randomUUID(),foreignSession=randomUUID(),store=new SupabaseProjectRuntimeStore();
    const priorKey=process.env.USER_SECRETS_ENCRYPTION_KEY;process.env.USER_SECRETS_ENCRYPTION_KEY='disposable-synthetic-test-only';
    t.after(async()=>{
      if(priorKey===undefined)delete process.env.USER_SECRETS_ENCRYPTION_KEY;else process.env.USER_SECRETS_ENCRYPTION_KEY=priorKey;
      assert.equal((await admin.from('project_runtime_events').delete().eq('project_id',project)).error,null);
      assert.equal((await admin.from('project_runtime_sessions').delete().in('session_id',[sessionId,foreignSession])).error,null);
      assert.equal((await admin.from('project_runtime_secrets').delete().eq('project_id',project)).error,null);
    });
    const secrets=new ProjectSecretManager(owner.id,store),otherSecrets=new ProjectSecretManager(other.id,store);
    await Promise.all([
      secrets.put({projectId:project,name:'API_TOKEN',scope:'preview',value:'owner-synthetic'}),
      otherSecrets.put({projectId:project,name:'API_TOKEN',scope:'preview',value:'other-synthetic'}),
    ]);
    const read=async()=>{const result=await admin.from('project_runtime_secrets').select('*').eq('project_id',project).order('user_id');assert.equal(result.error,null);return result.data!;};
    const rows=await read();assert.equal(rows.length,2);assert.deepEqual(new Set(rows.map(row=>row.user_id)),new Set([owner.id,other.id]));
    assert.ok(rows.every(row=>row.project_id===project&&row.name==='API_TOKEN'&&row.scope==='preview'&&row.key_version===1));
    assert.ok(!JSON.stringify(rows).includes('owner-synthetic'));assert.ok(!JSON.stringify(rows).includes('other-synthetic'));
    const now=new Date().toISOString();
    const session:ProjectRuntimeSession={schemaVersion:'1.0.0',sessionId,userId:owner.id,projectId:project,providerId:'fly-project-runtime',runtimeClass:'interactive',status:'running',image:null,workspaceRevision:1,knownFiles:[],processes:[],ports:[],providerState:{machineId:'synthetic'},createdAt:now,updatedAt:now,expiresAt:null};
    await store.saveSession(session);await store.saveSession({...session,userId:other.id,sessionId:foreignSession});
    const provider=new FlyProjectRuntimeProvider({app:'synthetic',token:'synthetic',fetchImpl:async()=>{throw new Error('No provider traffic authorized');}});
    let calls=0;
    t.mock.method(provider,'exec',async(actual:ProjectRuntimeSession,input:ProviderRuntimeCommand)=>{
      calls++;assert.equal(actual.userId,owner.id);assert.equal(actual.projectId,project);assert.equal(actual.sessionId,sessionId);
      assert.deepEqual(input.secretEnvironment,{API_TOKEN:'owner-synthetic'});
      return{exitCode:0,stdout:'owner-synthetic other-synthetic',stderr:'',durationMs:1};
    });
    const manager=new ProjectRuntimeManager(owner.id,store,[provider]);
    await assert.rejects(manager.exec(foreignSession,{command:'synthetic',secretScopes:['preview']}));assert.equal(calls,0);
    const result=await manager.exec(sessionId,{command:'synthetic',secretScopes:['preview']});assert.equal(calls,1);
    assert.ok(!result.stdout.includes('owner-synthetic'));assert.ok(result.stdout.includes('other-synthetic'),'Only the selected owner secret was resolved and redacted');
    for(const token of [undefined,owner.token,other.token]){
      const browser:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{})});
      const selected=await browser.from('project_runtime_secrets').select('*').eq('project_id',project);assert.ok(selected.error||selected.data?.length===0);
      assert.ok((await browser.from('project_runtime_secrets').upsert(rows[0])).error);
      await browser.from('project_runtime_secrets').delete().eq('project_id',project);
      assert.deepEqual(await read(),rows,'Browser roles cannot mutate either owner secret');
    }
    await secrets.remove({projectId:project,name:'API_TOKEN',scope:'preview'});
    await secrets.remove({projectId:project,name:'API_TOKEN',scope:'preview'});
    assert.deepEqual(await secrets.resolveEnvironment(project,['preview']),{});
    assert.deepEqual(await otherSecrets.resolveEnvironment(project,['preview']),{API_TOKEN:'other-synthetic'});
    assert.deepEqual(await read(),rows.filter(row=>row.user_id===other.id));
  });
}
