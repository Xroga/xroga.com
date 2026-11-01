import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SupabaseProjectRuntimeStore } from '../synthesis/projectRuntime/store.js';
import type { ProjectRuntimeSession } from '../synthesis/projectRuntime/types.js';
import { createLivePreviewGrant } from '../synthesis/livePreview/store.js';

export function registerPreviewGrantAdmissionTests(admin:SupabaseClient,getUsers:()=>readonly {id:string;token:string}[]):void{
  test('real preview admission rejects changed sessions and expiry during an observed grant-write lock wait',async t=>{
    const priorProviderApp=process.env.XROGA_SANDBOX_FLY_APP;
    const priorProviderToken=process.env.XROGA_SANDBOX_FLY_TOKEN;
    const priorControlApp=process.env.FLY_APP_NAME;
    Object.assign(process.env,{XROGA_SANDBOX_FLY_APP:'fixture-app',XROGA_SANDBOX_FLY_TOKEN:'synthetic-provider-only',FLY_APP_NAME:'xroga-api'});
    t.after(()=>{
      if(priorProviderApp===undefined)delete process.env.XROGA_SANDBOX_FLY_APP;else process.env.XROGA_SANDBOX_FLY_APP=priorProviderApp;
      if(priorProviderToken===undefined)delete process.env.XROGA_SANDBOX_FLY_TOKEN;else process.env.XROGA_SANDBOX_FLY_TOKEN=priorProviderToken;
      if(priorControlApp===undefined)delete process.env.FLY_APP_NAME;else process.env.FLY_APP_NAME=priorControlApp;
    });
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');
    assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/postgres');
    const [owner,other]=getUsers(),sessionId=randomUUID(),project=`preview-admission-${randomUUID()}`,store=new SupabaseProjectRuntimeStore();
    t.after(async()=>{
      assert.equal((await admin.from('project_preview_grants').delete().eq('session_id',sessionId)).error,null);
      assert.equal((await admin.from('project_runtime_sessions').delete().eq('session_id',sessionId)).error,null);
    });
    const db=new pg.Client({connectionString:url.href,ssl:false});await db.connect();let pending:Promise<any>|undefined;
    const seed=async(short=false):Promise<ProjectRuntimeSession>=>{
      const now=new Date().toISOString(),session:ProjectRuntimeSession={schemaVersion:'1.0.0',sessionId,userId:owner.id,projectId:project,
        providerId:'fly-project-runtime',runtimeClass:'interactive',status:'running',image:null,workspaceRevision:1,knownFiles:[],processes:[],
        ports:[{port:3000,protocol:'http',processId:'fixture',status:'declared'}],providerState:{machineId:'abc123',app:'fixture-app'},
        createdAt:now,updatedAt:now,expiresAt:new Date(Date.now()+(short?1500:60_000)).toISOString()};
      await store.saveSession(session);return session;
    };
    try{
      for(const mode of ['state','stopped','port','expiry']){
        const session=await seed(mode==='expiry');
        await db.query('begin');await db.query('select session_id from project_runtime_sessions where session_id=$1 for update',[sessionId]);
        pending=createLivePreviewGrant({userId:owner.id,projectId:project,sessionId,runId:'fixture-run',kind:'browser',port:3000,expiresAt:new Date(Date.now()+60_000).toISOString()});
        void pending.catch(()=>{});let waiting=false;
        for(let i=0;i<150;i++){
          await db.query('select pg_stat_clear_snapshot()');
          const result=await db.query("select pid from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock' and query like '%create_project_preview_grant%'");
          if(result.rowCount){waiting=true;break;}await delay(20);
        }
        assert.equal(waiting,true,'actual grant admission must reach the held current-session lock');
        if(mode==='expiry')await db.query('select pg_sleep(greatest(0,extract(epoch from $1::timestamptz-clock_timestamp()))+0.05)',[session.expiresAt]);
        else{
          const changed={...session,...(mode==='state'?{workspaceRevision:2}:mode==='stopped'?{status:'stopped'}:{ports:[]})};
          await db.query('update project_runtime_sessions set state=$2,status=$3 where session_id=$1',[sessionId,changed,changed.status]);
        }
        await db.query('commit');await assert.rejects(pending,{status:404,code:'RESOURCE_NOT_FOUND'});pending=undefined;
        const rows=await admin.from('project_preview_grants').select('preview_id').eq('session_id',sessionId);assert.equal(rows.error,null);assert.deepEqual(rows.data,[]);
      }
      const session=await seed(),grant={preview_id:randomUUID(),user_id:owner.id,project_id:project,session_id:sessionId,run_id:'fixture-run',preview_kind:'browser',port:3000,expires_at:session.expiresAt};
      const args={p_owner:owner.id,p_grant:grant,p_session:session};
      assert.equal((await admin.rpc('create_project_preview_grant',{...args,p_owner:other.id,p_grant:{...grant,user_id:other.id}})).error?.code,'42501');
      for(const token of [undefined,owner.token]){
        const browser:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{})});
        assert.equal((await browser.rpc('create_project_preview_grant',args)).error?.code,'42501');
      }
      await db.query('begin');await db.query(`alter table project_preview_grants add constraint fixture_grant_failure check(session_id<>'${sessionId}') not valid`);
      await db.query('savepoint attempt');await assert.rejects(db.query('select * from create_project_preview_grant($1,$2,$3)',[owner.id,grant,session]),{code:'23514'});
      await db.query('rollback to savepoint attempt');assert.equal((await db.query('select preview_id from project_preview_grants where session_id=$1',[sessionId])).rowCount,0);await db.query('rollback');
      const saved=await createLivePreviewGrant({userId:owner.id,projectId:project,sessionId,runId:'fixture-run',kind:'browser',port:3000,expiresAt:session.expiresAt!});
      assert.equal(saved.userId,owner.id);assert.equal(saved.projectId,project);assert.equal(saved.sessionId,sessionId);assert.equal(saved.port,3000);
    }finally{await db.query('rollback');if(pending)await Promise.allSettled([pending]);await db.end();}
  });
}
