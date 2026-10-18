import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { GrowthService } from './growthService.js';

export function registerGrowthLifecycleTransitionTests(admin:SupabaseClient,getUsers:()=>readonly {id:string;token:string}[]):void{
  test('real lifecycle transitions retain atomic versions and cannot overwrite foreign or revoked state',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');
    assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/postgres');
    const [owner,actor]=getUsers(),project=randomUUID(),membership=randomUUID(),subject=randomUUID(),definition=randomUUID(),service=new GrowthService(admin);
    t.after(async()=>{assert.equal((await admin.from('projects').delete().eq('id',project)).error,null);});
    assert.equal((await admin.from('projects').insert({id:project,user_id:owner.id,name:'Disposable lifecycle transition',type:'app'})).error,null);
    assert.equal((await admin.from('operations_memberships').insert({id:membership,user_id:owner.id,project_id:project,member_user_id:actor.id,role:'operator',created_by:owner.id})).error,null);
    assert.equal((await admin.from('growth_activation_definitions').insert({id:definition,tenant_id:owner.id,project_id:project,version:1,name:'Fixture activation',required_event_names:['identity.linked.v1']})).error,null);
    const input=(state='retained')=>({projectId:project,subjectType:'user' as const,subjectId:subject,state,evidenceReference:'fixture evidence'});
    const created=await service.transitionLifecycle(owner.id,input());assert.equal(created.version,1);
    assert.equal((await admin.from('growth_lifecycle_state').update({version:5,activation_definition_id:definition}).eq('id',created.id)).error,null);
    const snapshot=async()=>{const result=await admin.from('growth_lifecycle_state').select('*').eq('id',created.id).single();assert.equal(result.error,null);return result.data;};
    const db=new pg.Client({connectionString:url.href,ssl:false});await db.connect();let pending:Promise<any>[]=[];
    const waitFor=async(count=1)=>{
      for(let i=0;i<150;i++){
        await db.query('select pg_stat_clear_snapshot()');
        const result=await db.query("select pid from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock' and query like '%transition_growth_lifecycle%'");
        if((result.rowCount??0)>=count)return;await delay(20);
      }
      assert.fail('actual lifecycle writers must reach the held current authority/version row lock');
    };
    try{
      await db.query('begin');await db.query('select id from growth_lifecycle_state where id=$1 for update',[created.id]);
      pending=['retained','at_risk'].map(state=>service.transitionLifecycle(owner.id,input(state)));pending.forEach(p=>void p.catch(()=>{}));await waitFor(2);
      const boundary=await db.query('select clock_timestamp() value');await db.query('commit');const results=await Promise.all(pending);pending=[];
      assert.deepEqual(results.map(row=>row.version).sort(),[6,7]);assert.ok(results.every(row=>row.activation_definition_id===definition));
      assert.equal((await snapshot()).version,7);
      assert.equal((await db.query('select transitioned_at>=$2::timestamptz valid from growth_lifecycle_state where id=$1',[created.id,boundary.rows[0].value])).rows[0].valid,true);
      const original=await snapshot();
      await db.query('begin');await db.query('select id from operations_memberships where id=$1 for update',[membership]);
      pending=[service.transitionLifecycle(actor.id,input('paused'))];pending.forEach(p=>void p.catch(()=>{}));await waitFor();
      await db.query("update operations_memberships set role='viewer' where id=$1",[membership]);await db.query('commit');
      await assert.rejects(pending[0],{code:'forbidden'});pending=[];assert.deepEqual(await snapshot(),original);
      await db.query('begin');await db.query('select id from projects where id=$1 for update',[project]);
      pending=[service.transitionLifecycle(owner.id,input('paused'))];pending.forEach(p=>void p.catch(()=>{}));await waitFor();
      await db.query('update projects set user_id=$2 where id=$1',[project,actor.id]);await db.query('commit');
      await assert.rejects(pending[0],{code:'forbidden'});pending=[];assert.deepEqual(await snapshot(),original);
      await db.query('update projects set user_id=$2 where id=$1',[project,owner.id]);
      await db.query('begin');await db.query('select id from growth_lifecycle_state where id=$1 for update',[created.id]);
      pending=[service.transitionLifecycle(owner.id,input('paused'))];pending.forEach(p=>void p.catch(()=>{}));await waitFor();
      await db.query('update growth_lifecycle_state set tenant_id=$2 where id=$1',[created.id,actor.id]);await db.query('commit');
      await assert.rejects(pending[0],{code:'conflict'});pending=[];assert.deepEqual(await snapshot(),{...original,tenant_id:actor.id});
      await assert.rejects(service.transitionLifecycle(owner.id,input('paused')),{code:'conflict'});assert.deepEqual(await snapshot(),{...original,tenant_id:actor.id});
      await db.query('update growth_lifecycle_state set tenant_id=$2 where id=$1',[created.id,owner.id]);
      await db.query('begin');await db.query(`alter table growth_lifecycle_state add constraint fixture_lifecycle_failure check(project_id<>'${project}' or version<8) not valid`);
      await db.query('savepoint attempt');const roles=['operator','release_manager','recovery_manager','admin'];
      const args=[owner.id,owner.id,project,'user',subject,'paused','fixture evidence',roles];
      await assert.rejects(db.query('select * from transition_growth_lifecycle($1,$2,$3,$4,$5,$6,$7,$8)',args),{code:'23514'});
      await db.query('rollback to savepoint attempt');await db.query('rollback');assert.deepEqual(await snapshot(),original);
      const rpcArgs={p_actor:owner.id,p_tenant:owner.id,p_project:project,p_subject_type:'user',p_subject:subject,p_state:'paused',p_evidence:'fixture evidence',p_allowed_roles:roles};
      assert.equal((await admin.rpc('transition_growth_lifecycle',{...rpcArgs,p_tenant:actor.id})).error?.code,'42501');
      for(const token of [undefined,owner.token]){
        const browser:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{})});
        assert.equal((await browser.rpc('transition_growth_lifecycle',rpcArgs)).error?.code,'42501');
      }
    }finally{await db.query('rollback');await Promise.allSettled(pending);await db.end();}
  });
}
