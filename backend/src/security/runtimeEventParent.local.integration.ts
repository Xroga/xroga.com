import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import pg from 'pg';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {SupabaseProjectRuntimeStore} from '../synthesis/projectRuntime/store.js';

export function registerRuntimeEventParentTests(admin:SupabaseClient,getUsers:()=>readonly {id:string;token:string}[]):void{
  test('real runtime event writes bind the current session owner and project through lock waits with exact receipts',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const [owner,other]=getUsers(),project=randomUUID(),secondProject=randomUUID(),session=randomUUID(),second=randomUUID(),foreign=randomUUID();
    const sessions=[session,second,foreign],store=new SupabaseProjectRuntimeStore();
    t.after(async()=>{
      assert.equal((await admin.from('project_runtime_events').delete().eq('project_id',project)).error,null);
      assert.equal((await admin.from('project_runtime_sessions').delete().in('session_id',sessions)).error,null);
    });
    const rows=[{session_id:session,user_id:owner.id,project_id:project},{session_id:second,user_id:owner.id,project_id:secondProject},{session_id:foreign,user_id:other.id,project_id:secondProject}];
    assert.equal((await admin.from('project_runtime_sessions').insert(rows.map(row=>({...row,provider_id:'fixture',runtime_class:'interactive',status:'running',state:{}})))).error,null);
    const input={userId:owner.id,projectId:project,sessionId:session,eventType:'fixture.event',payload:{fixture:'NO_PROVIDER_OR_SECRET'}};
    const accepted=await store.appendEvent(input);assert.equal(accepted.userId,owner.id);assert.equal(accepted.projectId,project);assert.equal(accepted.sessionId,session);assert.deepEqual(accepted.payload,input.payload);
    const persisted=await admin.from('project_runtime_events').select('*').eq('event_id',accepted.eventId).single();assert.equal(persisted.error,null);
    assert.equal(persisted.data?.user_id,owner.id);assert.equal(persisted.data?.project_id,project);assert.equal(persisted.data?.session_id,session);assert.deepEqual(persisted.data?.payload,input.payload);
    assert.equal(Date.parse(persisted.data!.created_at),Date.parse(accepted.createdAt));
    const read=async()=>{const result=await admin.from('project_runtime_events').select('*').eq('project_id',project).order('event_id');assert.equal(result.error,null);return result.data;};
    const before=await read();
    for(const sessionId of [second,foreign,randomUUID()])await assert.rejects(store.appendEvent({...input,sessionId}));
    assert.deepEqual(await read(),before,'Foreign, other-project and missing parents leave no event');
    assert.equal((await admin.from('project_runtime_events').update({session_id:foreign}).eq('event_id',accepted.eventId)).error?.code,'42501');
    assert.deepEqual(await read(),before);
    const without=await store.appendEvent({...input,sessionId:null});assert.equal(without.sessionId,null,'Existing logical-project session-less events remain supported');
    for(const token of [undefined,owner.token,other.token]){
      const browser:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{})});
      assert.ok((await browser.from('project_runtime_events').insert({user_id:owner.id,project_id:project,session_id:session,event_type:'browser.denied'})).error);
    }
    const connection=new URL(process.env.XB01_LOCAL_DATABASE_URL!);assert.equal(connection.hostname,'127.0.0.1');assert.equal(connection.port,'54322');assert.equal(connection.pathname,'/postgres');
    const locker=new pg.Client({connectionString:connection.href,ssl:false}),writer=new pg.Client({connectionString:connection.href,ssl:false});await locker.connect();await writer.connect();let pending:Promise<pg.QueryResult>|undefined;
    try{
      await writer.query('set statement_timeout=10000');await writer.query('set role service_role');
      const pid=(await writer.query('select pg_backend_pid() pid')).rows[0].pid,lockPid=(await locker.query('select pg_backend_pid() pid')).rows[0].pid;
      for(const remove of [false,true]){
        const snapshot=await read();await locker.query('begin');await locker.query('select session_id from project_runtime_sessions where session_id=$1 for update',[session]);
        pending=writer.query("insert into project_runtime_events(user_id,project_id,session_id,event_type) values($1,$2,$3,'fixture.wait')",[owner.id,project,session]);void pending.catch(()=>{});
        let observed=false;for(let count=0;count<100;count++){
          if((await locker.query('select pg_blocking_pids($1) blockers',[pid])).rows[0].blockers.includes(lockPid)){observed=true;break;}await delay(20);
        }
        assert.equal(observed,true,'Observe the actual event writer waiting for the current session');
        if(remove)await locker.query('delete from project_runtime_sessions where session_id=$1',[session]);
        await locker.query(remove?'commit':'rollback');
        if(remove){await assert.rejects(pending,{code:'42501'});assert.deepEqual(await read(),snapshot);}
        else {assert.equal((await pending).rowCount,1,'A rolled-back parent wait preserves a valid same-owner event');assert.equal((await read())!.length,snapshot!.length+1);}
        pending=undefined;
      }
      const snapshot=await read();await writer.query('begin');await writer.query("insert into project_runtime_events(user_id,project_id,event_type) values($1,$2,'fixture.rollback')",[owner.id,project]);await writer.query('rollback');assert.deepEqual(await read(),snapshot);
    }finally{await locker.query('rollback');await writer.query('rollback');if(pending)await pending.catch(()=>{});await writer.end();await locker.end();}
  });
}
