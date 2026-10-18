import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { GrowthService } from './growthService.js';

export function registerGrowthActivationDefinitionTests(admin:SupabaseClient,getUsers:()=>readonly {id:string;token:string}[]):void{
  test('real activation definition cannot overwrite a foreign conflict or write after member or owner revocation',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');
    assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/postgres');
    const [owner,actor]=getUsers(),project=randomUUID(),membership=randomUUID(),service=new GrowthService(admin),roles=['operator','release_manager','recovery_manager','admin'];
    t.after(async()=>{assert.equal((await admin.from('projects').delete().eq('id',project)).error,null);});
    assert.equal((await admin.from('projects').insert({id:project,user_id:owner.id,name:'Disposable activation authority',type:'app'})).error,null);
    assert.equal((await admin.from('operations_memberships').insert({id:membership,user_id:owner.id,project_id:project,member_user_id:actor.id,role:'operator',created_by:owner.id})).error,null);
    const input=(version=1)=>({projectId:project,name:'Fixture activation',version,requiredEvents:['identity.linked.v1']});
    const snapshot=async()=>{const result=await admin.from('growth_activation_definitions').select('*').eq('project_id',project).order('version');assert.equal(result.error,null);return result.data!;};
    const db=new pg.Client({connectionString:url.href,ssl:false});await db.connect();let pending:Promise<any>[]=[];
    const waitFor=async(count=1)=>{
      for(let i=0;i<150;i++){
        await db.query('select pg_stat_clear_snapshot()');
        const result=await db.query("select pid from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock' and query like '%define_growth_activation%'");
        if((result.rowCount??0)>=count)return;await delay(20);
      }
      assert.fail('actual activation definition calls must reach the held PostgreSQL authority/conflict lock');
    };
    try{
      await db.query('begin');await db.query('select id from operations_memberships where id=$1 for update',[membership]);
      pending=[service.defineActivation(actor.id,input())];pending.forEach(p=>void p.catch(()=>{}));await waitFor();
      await db.query("update operations_memberships set role='viewer' where id=$1",[membership]);await db.query('commit');
      await assert.rejects(pending[0],{code:'forbidden'});pending=[];assert.deepEqual(await snapshot(),[]);
      await db.query("update operations_memberships set role='operator' where id=$1",[membership]);
      await db.query('begin');await db.query('select id from projects where id=$1 for update',[project]);
      pending=[service.defineActivation(owner.id,input())];pending.forEach(p=>void p.catch(()=>{}));await waitFor();
      await db.query('update projects set user_id=$2 where id=$1',[project,actor.id]);await db.query('commit');
      await assert.rejects(pending[0],{code:'forbidden'});pending=[];assert.deepEqual(await snapshot(),[]);
      await db.query('update projects set user_id=$2 where id=$1',[project,owner.id]);
      assert.equal((await admin.from('growth_activation_definitions').insert({tenant_id:actor.id,project_id:project,version:1,name:'Foreign canary',
        required_event_names:['product.defined.v1'],minimum_distinct_events:1,active:false})).error,null);
      const foreign=await snapshot();await assert.rejects(service.defineActivation(owner.id,input()),{code:'conflict'});assert.deepEqual(await snapshot(),foreign);
      const own=await service.defineActivation(owner.id,input(2)),before=await snapshot();
      await db.query('begin');await db.query('select id from growth_activation_definitions where id=$1 for update',[own.id]);
      pending=[service.defineActivation(owner.id,{...input(2),name:'Must not overwrite'})];pending.forEach(p=>void p.catch(()=>{}));await waitFor();
      await db.query('update growth_activation_definitions set tenant_id=$2 where id=$1',[own.id,actor.id]);await db.query('commit');
      await assert.rejects(pending[0],{code:'conflict'});pending=[];
      assert.deepEqual(await snapshot(),before.map(row=>row.id===own.id?{...row,tenant_id:actor.id}:row));
      await db.query('begin');await db.query('select id from projects where id=$1 for update',[project]);
      pending=[0,1].map(()=>service.defineActivation(owner.id,input(3)));pending.forEach(p=>void p.catch(()=>{}));await waitFor(2);
      await db.query('commit');const winners=await Promise.all(pending);pending=[];
      assert.equal(winners[0].id,winners[1].id);assert.equal((await snapshot()).filter(row=>row.version===3).length,1);
      const stable=await snapshot();await db.query('begin');
      await db.query(`alter table growth_activation_definitions add constraint fixture_activation_failure check(project_id<>'${project}' or version<4) not valid`);
      await db.query('savepoint attempt');const args=[owner.id,owner.id,project,'Fixture activation',4,['identity.linked.v1'],roles];
      await assert.rejects(db.query('select * from define_growth_activation($1,$2,$3,$4,$5,$6,$7)',args),{code:'23514'});
      await db.query('rollback to savepoint attempt');await db.query('rollback');assert.deepEqual(await snapshot(),stable);
      const rpcArgs={p_actor:owner.id,p_tenant:owner.id,p_project:project,p_name:'Fixture activation',p_version:4,p_events:['identity.linked.v1'],p_allowed_roles:roles};
      assert.equal((await admin.rpc('define_growth_activation',{...rpcArgs,p_tenant:actor.id})).error?.code,'42501');
      for(const token of [undefined,owner.token]){
        const browser:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{})});
        assert.equal((await browser.rpc('define_growth_activation',rpcArgs)).error?.code,'42501');
      }
    }finally{await db.query('rollback');await Promise.allSettled(pending);await db.end();}
  });
}
