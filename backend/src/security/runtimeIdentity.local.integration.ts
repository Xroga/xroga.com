import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {test,type TestContext} from 'node:test';
import pg from 'pg';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {SupabaseProjectRuntimeStore} from '../synthesis/projectRuntime/store.js';
import type {ProjectRuntimeSession} from '../synthesis/projectRuntime/types.js';

export function registerRuntimeIdentityTests(admin:SupabaseClient,getUsers:()=>readonly {id:string;token:string}[]):void{
  function fixture(t:TestContext){
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const owner=getUsers()[0],id=randomUUID(),now=new Date().toISOString();
    t.after(async()=>{assert.equal((await admin.from('project_runtime_sessions').delete().eq('session_id',id).eq('user_id',owner.id)).error,null);});
    const session:ProjectRuntimeSession={schemaVersion:'1.0.0',sessionId:id,userId:owner.id,projectId:`fixture-${id}`,providerId:'fixture-no-execution',runtimeClass:'interactive',status:'running',image:null,workspaceRevision:1,knownFiles:[],processes:[],ports:[],providerState:{},createdAt:now,updatedAt:now,expiresAt:null};
    return{owner,id,session,store:new SupabaseProjectRuntimeStore()};
  }
  test('real runtime store cannot rebind same-owner session project provider or class',async t=>{
    const f=fixture(t);await f.store.saveSession(f.session);
    const before=await admin.from('project_runtime_sessions').select('*').eq('session_id',f.id).single();assert.equal(before.error,null);
    for(const patch of [{projectId:'other'},{providerId:'other'},{runtimeClass:'verification' as const}])await assert.rejects(f.store.saveSession({...f.session,...patch}),{code:'RESOURCE_ACCESS_UNAVAILABLE'});
    for(const patch of [{session_id:randomUUID()},{user_id:getUsers()[1].id}])assert.equal((await admin.from('project_runtime_sessions').update(patch).eq('session_id',f.id)).error?.code,'23514');
    const client=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${f.owner.token}`}},auth:{persistSession:false,autoRefreshToken:false}});
    await client.from('project_runtime_sessions').update({project_id:'browser-forgery'}).eq('session_id',f.id);
    assert.deepEqual((await admin.from('project_runtime_sessions').select('*').eq('session_id',f.id).single()).data,before.data);
    await f.store.saveSession({...f.session,workspaceRevision:2});assert.equal((await f.store.loadSession(f.owner.id,f.id))?.workspaceRevision,2);
  });
  test('real competing runtime first inserts retain winning immutable identity under observed lock',async t=>{
    const f=fixture(t),url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/postgres');
    const locker=new pg.Client({connectionString:url.href,ssl:false}),writer=new pg.Client({connectionString:url.href,ssl:false});await locker.connect();await writer.connect();let pending:Promise<unknown>|undefined;
    try{
      await writer.query('set statement_timeout=10000');const pid=(await writer.query('select pg_backend_pid() as pid')).rows[0].pid,lockPid=(await locker.query('select pg_backend_pid() as pid')).rows[0].pid;
      await writer.query('set role service_role');await locker.query('begin');
      const sql="insert into public.project_runtime_sessions(session_id,user_id,project_id,provider_id,runtime_class,status,state) values($1,$2,$3,'fixture-no-execution','interactive','running',$4) on conflict(session_id) do nothing";
      await locker.query(sql,[f.id,f.owner.id,f.session.projectId,JSON.stringify(f.session)]);
      pending=(async()=>{await writer.query(sql,[f.id,f.owner.id,'losing-project',JSON.stringify({...f.session,projectId:'losing-project'})]);return writer.query('update public.project_runtime_sessions set project_id=$3,state=$4 where session_id=$1 and user_id=$2',[f.id,f.owner.id,'losing-project',JSON.stringify({...f.session,projectId:'losing-project'})]);})();void pending.catch(()=>{});
      let blocked=false;for(let n=0;n<100;n++){if((await locker.query('select pg_blocking_pids($1) as blockers',[pid])).rows[0].blockers.includes(lockPid)){blocked=true;break;}await delay(20);}assert.equal(blocked,true);
      await locker.query('commit');await assert.rejects(pending,{code:'23514'});
      assert.deepEqual(await f.store.loadSession(f.owner.id,f.id),f.session);
    }finally{await locker.query('rollback');if(pending)await pending.catch(()=>{});await writer.end();await locker.end();}
  });
}
