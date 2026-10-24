import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { GrowthService } from './growthService.js';

export function registerGrowthExperimentAdmissionTests(admin:SupabaseClient,getUsers:()=>readonly {id:string;project:string;token:string}[]):void{
  test('real experiment assignment and exposure serialize current ownership and return durable concurrent winners',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');
    assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/postgres');
    const [owner,viewer]=getUsers(),project=randomUUID(),experiment=randomUUID(),membership=randomUUID(),subject=randomUUID(),service=new GrowthService(admin);
    t.after(async()=>{assert.equal((await admin.from('projects').delete().eq('id',project)).error,null);});
    assert.equal((await admin.from('projects').insert({id:project,user_id:owner.id,name:'Disposable experiment admission',type:'app'})).error,null);
    const member={id:membership,user_id:owner.id,project_id:project,member_user_id:viewer.id,role:'viewer',created_by:owner.id};
    assert.equal((await admin.from('operations_memberships').insert(member)).error,null);
    assert.equal((await admin.from('growth_experiments').insert({id:experiment,tenant_id:owner.id,project_id:project,key:'fixture-experiment',
      variants:[{key:'a',weight:1}],allocation_seed:'seed',minimum_sample_size:10})).error,null);
    const db=new pg.Client({connectionString:url.href,ssl:false});await db.connect();let pending:Promise<any>[]=[];
    const waitFor=async(count=1)=>{
      for(let i=0;i<150;i++){
        await db.query('select pg_stat_clear_snapshot()');
        const result=await db.query("select pid from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock' and (query like '%assign_growth_experiment%' or query like '%expose_growth_experiment%')");
        if((result.rowCount??0)>=count)return;await delay(20);
      }
      assert.fail('actual experiment admission must reach the held authority, experiment or assignment lock');
    };
    const assignments=async()=>{const r=await admin.from('growth_experiment_assignments').select('*').eq('experiment_id',experiment);assert.equal(r.error,null);return r.data!;};
    const launch=(work:Promise<any>[])=>{pending=work;pending.forEach(p=>void p.catch(()=>{}));};
    try{
      await db.query('begin');await db.query('select id from growth_experiments where id=$1 for update',[experiment]);
      launch([service.assignExperiment(viewer.id,experiment,subject),service.assignExperiment(viewer.id,experiment,subject)]);await waitFor(2);
      await db.query('commit');const assigned=await Promise.all(pending);pending=[];
      assert.equal(assigned[0].id,assigned[1].id);assert.equal(assigned[0].variant,'a');assert.equal((await assignments()).length,1);
      const original=assigned[0];
      await db.query('begin');await db.query('select id from growth_experiment_assignments where id=$1 for update',[original.id]);
      launch([service.exposeExperiment(viewer.id,original.id,'proof first'),service.exposeExperiment(viewer.id,original.id,'proof second')]);await waitFor(2);
      const boundary=await db.query('select clock_timestamp() value');await db.query('commit');const exposed=await Promise.all(pending);pending=[];
      assert.deepEqual(exposed[0],exposed[1]);assert.ok(['proof first','proof second'].includes(exposed[0].evidence_reference));
      assert.equal((await db.query('select exposed_at>=$2::timestamptz valid from growth_experiment_assignments where id=$1',[original.id,boundary.rows[0].value])).rows[0].valid,true);
      assert.deepEqual(await service.exposeExperiment(viewer.id,original.id,'ignored retry'),exposed[0]);
      await db.query("update growth_experiments set variants='[]'::jsonb where id=$1",[experiment]);
      assert.deepEqual(await service.assignExperiment(viewer.id,experiment,subject),exposed[0]);
      await assert.rejects(service.assignExperiment(viewer.id,experiment,randomUUID()),{code:'invalid_experiment'});
      await db.query("update growth_experiments set variants='[{\"key\":\"a\",\"weight\":1}]'::jsonb where id=$1",[experiment]);
      const stable=await assignments();
      for(const operation of ['assign','expose'])for(const mode of ['member','parent','owner']){
        const table=mode==='member'?'operations_memberships':mode==='parent'?'growth_experiments':'projects';
        const id=mode==='member'?membership:mode==='parent'?experiment:project;
        await db.query('begin');await db.query(`select id from ${table} where id=$1 for update`,[id]);
        launch([operation==='assign'?service.assignExperiment(viewer.id,experiment,randomUUID()):service.exposeExperiment(viewer.id,original.id,'should not write')]);await waitFor();
        if(mode==='member')await db.query('delete from operations_memberships where id=$1',[id]);
        if(mode==='parent')await db.query('update growth_experiments set tenant_id=$2 where id=$1',[id,viewer.id]);
        if(mode==='owner')await db.query('update projects set user_id=$2 where id=$1',[id,viewer.id]);
        await db.query('commit');await assert.rejects(pending[0],{code:mode==='parent'?'not_found':'forbidden'});pending=[];
        assert.deepEqual(await assignments(),stable);
        if(mode==='member')assert.equal((await admin.from('operations_memberships').insert(member)).error,null);
        if(mode==='parent')await db.query('update growth_experiments set tenant_id=$2 where id=$1',[id,owner.id]);
        if(mode==='owner')await db.query('update projects set user_id=$2 where id=$1',[id,owner.id]);
      }
      await db.query('begin');await db.query('select id from growth_experiments where id=$1 for update',[experiment]);
      launch([service.assignExperiment(viewer.id,experiment,randomUUID())]);await waitFor();
      await db.query("update growth_experiments set allocation_seed='changed' where id=$1",[experiment]);await db.query('commit');
      await assert.rejects(pending[0],{code:'conflict'});pending=[];assert.deepEqual(await assignments(),stable);
      await db.query('begin');await db.query('select id from growth_experiment_assignments where id=$1 for update',[original.id]);
      launch([service.exposeExperiment(viewer.id,original.id,'should not write')]);await waitFor();
      await db.query("update growth_experiment_assignments set variant='substituted' where id=$1",[original.id]);await db.query('commit');
      await assert.rejects(pending[0],{code:'conflict'});pending=[];
      assert.deepEqual(await assignments(),stable.map(row=>({...row,variant:'substituted'})));
      await db.query("update growth_experiment_assignments set variant='a',exposed_at=null,evidence_reference=null where id=$1",[original.id]);
      const unexposed=(await assignments())[0],roles=['viewer','operator','release_manager','recovery_manager','admin'];
      const current=(await admin.from('growth_experiments').select('*').eq('id',experiment).single()).data!;
      for(const operation of ['assign','expose']){
        await db.query('begin');await db.query(`alter table growth_experiment_assignments add constraint fixture_experiment_failure check(experiment_id<>'${experiment}' or ${operation==='assign'?"subject_key='"+subject+"'":'exposed_at is null'}) not valid`);
        await db.query('savepoint attempt');
        if(operation==='assign')await assert.rejects(db.query('select assign_growth_experiment($1,$2,$3,$4,$5,$6,$7)',[viewer.id,owner.id,project,current,randomUUID(),'a',roles]),{code:'23514'});
        else await assert.rejects(db.query('select expose_growth_experiment($1,$2,$3,$4,$5,$6)',[viewer.id,owner.id,project,unexposed,'rollback proof',roles]),{code:'23514'});
        await db.query('rollback to savepoint attempt');await db.query('rollback');assert.deepEqual(await assignments(),[unexposed]);
      }
      for(const token of [undefined,owner.token]){
        const browser:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{})});
        assert.equal((await browser.rpc('assign_growth_experiment',{p_actor:owner.id,p_tenant:owner.id,p_project:project,p_expected:current,p_subject:subject,p_variant:'a',p_allowed_roles:roles})).error?.code,'42501');
        assert.equal((await browser.rpc('expose_growth_experiment',{p_actor:owner.id,p_tenant:owner.id,p_project:project,p_expected:unexposed,p_evidence:'browser',p_allowed_roles:roles})).error?.code,'42501');
      }
    }finally{await db.query('rollback');await Promise.allSettled(pending);await db.end();}
  });
}
