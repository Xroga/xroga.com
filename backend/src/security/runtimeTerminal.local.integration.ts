import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {test,type TestContext} from 'node:test';
import pg from 'pg';
import type {SupabaseClient} from '@supabase/supabase-js';
import {SupabaseProjectRuntimeStore} from '../synthesis/projectRuntime/store.js';
import type {ProjectRuntimeSession} from '../synthesis/projectRuntime/types.js';

export function registerRuntimeTerminalTests(admin:SupabaseClient,getUsers:()=>readonly {id:string}[]):void{
  async function fixture(t:TestContext){
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const owner=getUsers()[0].id,id=randomUUID(),now=new Date().toISOString();
    t.after(async()=>{assert.equal((await admin.from('project_runtime_sessions').delete().eq('user_id',owner).eq('session_id',id)).error,null);});
    const session:ProjectRuntimeSession={schemaVersion:'1.0.0',sessionId:id,userId:owner,projectId:`fixture-${id}`,providerId:'fixture-no-execution',runtimeClass:'interactive',status:'running',image:null,workspaceRevision:1,knownFiles:[],processes:[],ports:[],providerState:{},createdAt:now,updatedAt:now,expiresAt:null};
    const store=new SupabaseProjectRuntimeStore();await store.saveSession(session);return{owner,id,session,store};
  }
  test('real runtime terminal latch rejects stale stores and OLD or NEW JSON status mismatches',async t=>{
    const f=await fixture(t);await f.store.saveSession({...f.session,status:'stopped'});await f.store.saveSession(f.session);
    await f.store.saveSession({...f.session,status:'destroyed'});
    const before=await admin.from('project_runtime_sessions').select('*').eq('session_id',f.id).single();assert.equal(before.error,null);
    await assert.rejects(f.store.saveSession(f.session),{code:'RESOURCE_ACCESS_UNAVAILABLE'});
    for(const update of [{status:'running'},{state:f.session},{state:{}},{status:'running',state:f.session}]){
      assert.equal((await admin.from('project_runtime_sessions').update(update).eq('session_id',f.id)).error?.code,'23514');
    }
    assert.deepEqual((await admin.from('project_runtime_sessions').select('*').eq('session_id',f.id).single()).data,before.data);
    await f.store.saveSession({...f.session,status:'destroyed'});
    // Simulate a legacy mismatch using a distinct fixture, before it becomes terminal.
    const legacy=await fixture(t);
    assert.equal((await admin.from('project_runtime_sessions').update({state:{...legacy.session,status:'destroyed'}}).eq('session_id',legacy.id)).error,null);
    await assert.rejects(legacy.store.saveSession(legacy.session),{code:'RESOURCE_ACCESS_UNAVAILABLE'});
    await legacy.store.saveSession({...legacy.session,status:'destroyed'});
  });
  test('real stale runtime update loses an observed row-lock race to destruction',async t=>{
    const f=await fixture(t),url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/postgres');
    const locker=new pg.Client({connectionString:url.href,ssl:false}),writer=new pg.Client({connectionString:url.href,ssl:false});await locker.connect();await writer.connect();let pending:Promise<pg.QueryResult>|undefined;
    try{
      await writer.query('set statement_timeout=10000');const pid=(await writer.query('select pg_backend_pid() as pid')).rows[0].pid,lockPid=(await locker.query('select pg_backend_pid() as pid')).rows[0].pid;
      await writer.query('set role service_role');await locker.query('begin');
      await locker.query("update public.project_runtime_sessions set status='destroyed',state=jsonb_set(state,'{status}','\"destroyed\"') where session_id=$1 and user_id=$2",[f.id,f.owner]);
      pending=writer.query("update public.project_runtime_sessions set status='running',state=$3 where session_id=$1 and user_id=$2",[f.id,f.owner,JSON.stringify(f.session)]);void pending.catch(()=>{});
      let blocked=false;for(let n=0;n<100;n++){if((await locker.query('select pg_blocking_pids($1) as blockers',[pid])).rows[0].blockers.includes(lockPid)){blocked=true;break;}await delay(20);}assert.equal(blocked,true);
      await locker.query('commit');await assert.rejects(pending,{code:'23514'});
      const row=await admin.from('project_runtime_sessions').select('status,state').eq('session_id',f.id).single();assert.equal(row.error,null);assert.equal(row.data?.status,'destroyed');assert.equal(row.data?.state.status,'destroyed');
    }finally{await locker.query('rollback');if(pending)await pending.catch(()=>{});await writer.end();await locker.end();}
  });
}
