import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GrowthService } from './growthService.js';
import { OperationsService } from '../operations/operationsService.js';

export function registerGrowthCampaignReceiptTests(admin:SupabaseClient):void{
  test('real pending campaign links require exact actions and durable receipts without delivering messages',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');
    assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const users:string[]=[],projects:string[]=[];
    t.after(async()=>{for(const id of projects)assert.equal((await admin.from('projects').delete().eq('id',id)).error,null);
      for(const id of users)assert.equal((await admin.auth.admin.deleteUser(id)).error,null);});
    for(let i=0;i<2;i++){
      const created=await admin.auth.admin.createUser({email:`growth-campaign-${randomUUID()}@example.invalid`,email_confirm:true});
      assert.equal(created.error,null);assert.ok(created.data.user);users.push(created.data.user.id);
      const project=await admin.from('projects').insert({user_id:created.data.user.id,name:'Campaign receipt fixture',type:'app'}).select('id').single();
      assert.equal(project.error,null);assert.ok(project.data);projects.push(project.data.id);
    }
    const service=new GrowthService(admin),[owner,foreign]=users,[project,foreignProject]=projects;
    assert.equal((await new OperationsService(admin).permissions(owner,project)).ownerId,owner);
    const segment=await service.createSegment(owner,{projectId:project,name:'Receipt segment',lifecycleStates:['activated']});
    const foreignSegment=await service.createSegment(foreign,{projectId:foreignProject,name:'Foreign segment',lifecycleStates:['activated']});
    const input={projectId:project,segmentId:segment.id,name:'Pending campaign fixture',channel:'in_app' as const,templateKey:'fixture',idempotencyKey:randomUUID()};
    await assert.rejects(service.createCampaign(owner,{...input,segmentId:foreignSegment.id}),{statusCode:404});
    const accepted=await service.createCampaign(owner,input);
    assert.equal(accepted.action.status,'approval_required');assert.equal(accepted.action.target_id,accepted.campaign.id);
    const persisted=await admin.from('growth_campaigns').select('evidence_reference,status').eq('id',accepted.campaign.id).single();
    assert.equal(persisted.error,null);assert.equal(persisted.data?.evidence_reference,`operations_action:${accepted.action.id}`);
    assert.equal(persisted.data?.status,'approval_required');
    await assert.rejects(service.createCampaign(owner,input),{code:'idempotency_conflict',statusCode:409});
    const afterReplay=await admin.from('growth_campaigns').select('id,evidence_reference').eq('project_id',project);
    assert.equal(afterReplay.error,null);assert.equal(afterReplay.data?.filter(c=>c.evidence_reference===`operations_action:${accepted.action.id}`).length,1);
    // Failure injection is confined to a dedicated disposable fixture name.
    const database=new URL(process.env.XB01_LOCAL_DATABASE_URL!);assert.equal(database.hostname,'127.0.0.1');assert.equal(database.port,'54322');assert.equal(database.pathname,'/postgres');
    const sql=new pg.Client({connectionString:database.href,ssl:false});await sql.connect();
    const suffix=randomUUID().replaceAll('-',''),fn=`fixture_campaign_${suffix}`,failName=`fail-${suffix}`;
    let pending:Promise<any>|undefined;
    const member={id:randomUUID(),user_id:owner,project_id:project,member_user_id:foreign,role:'operator',created_by:owner};
    const snapshot=async()=>{const r=await admin.from('growth_campaigns').select('*').eq('project_id',project).order('id');assert.equal(r.error,null);return r.data!;};
    const waitFor=async()=>{for(let i=0;i<150;i++){await sql.query('select pg_stat_clear_snapshot()');const r=await sql.query("select pid from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock' and query like '%write_growth_record_admitted%'");if(r.rowCount)return;await delay(20);}assert.fail('campaign admission must reach the held current authority or parent lock');};
    try{
      await sql.query(`create function public.${fn}() returns trigger language plpgsql as $$begin
        if new.name='${failName}' and new.evidence_reference like 'operations_action:%' then raise exception 'fixture storage failure'; end if;
        return new; end;$$;create trigger ${fn} before update on growth_campaigns for each row execute function public.${fn}();`);
      await assert.rejects(service.createCampaign(owner,{...input,name:failName,idempotencyKey:randomUUID()}),{code:'storage_unavailable',statusCode:503});
      const failed=await admin.from('growth_campaigns').select('evidence_reference,status').eq('project_id',project).eq('name',failName).single();
      assert.equal(failed.error,null);assert.equal(failed.data?.evidence_reference,null);assert.equal(failed.data?.status,'approval_required');
      assert.equal((await admin.from('operations_memberships').insert(member)).error,null);
      const stable=await snapshot();
      for(const mode of ['member','project','segment']){
        const table=mode==='member'?'operations_memberships':mode==='project'?'projects':'growth_segments';
        const id=mode==='member'?member.id:mode==='project'?project:segment.id;
        await sql.query('begin');await sql.query(`select id from ${table} where id=$1 for update`,[id]);
        pending=service.createCampaign(foreign,{...input,idempotencyKey:randomUUID()});void pending.catch(()=>{});await waitFor();
        if(mode==='member')await sql.query('delete from operations_memberships where id=$1',[id]);
        if(mode==='project')await sql.query('update projects set user_id=$2 where id=$1',[id,foreign]);
        if(mode==='segment')await sql.query('update growth_segments set tenant_id=$2,project_id=$3 where id=$1',[id,foreign,foreignProject]);
        await sql.query('commit');await assert.rejects(pending,{code:mode==='segment'?'conflict':'forbidden'});pending=undefined;
        if(mode==='member')assert.equal((await admin.from('operations_memberships').insert(member)).error,null);
        if(mode==='project')await sql.query('update projects set user_id=$2 where id=$1',[id,owner]);
        if(mode==='segment')await sql.query('update growth_segments set tenant_id=$2,project_id=$3 where id=$1',[id,owner,project]);
        assert.deepEqual(await snapshot(),stable,'revoked creation cannot leave a pending campaign');
      }
      const byMember=await service.createCampaign(foreign,{...input,idempotencyKey:randomUUID()});
      const args={p_actor:foreign,p_tenant:owner,p_project:project,p_operation:'campaign_link',p_data:{...byMember.campaign,action_id:byMember.action.id,action_key:byMember.action.idempotency_key},p_allowed_roles:['operator','release_manager','recovery_manager','admin']};
      const linked=await snapshot();
      for(const mode of ['member','project','campaign','action']){
        const table=mode==='member'?'operations_memberships':mode==='project'?'projects':mode==='campaign'?'growth_campaigns':'operations_actions';
        const id=mode==='member'?member.id:mode==='project'?project:mode==='campaign'?byMember.campaign.id:byMember.action.id;
        await sql.query('begin');await sql.query(`select id from ${table} where id=$1 for update`,[id]);
        pending=Promise.resolve(admin.rpc('write_growth_record_admitted',args));await waitFor();
        if(mode==='member')await sql.query('delete from operations_memberships where id=$1',[id]);
        if(mode==='project')await sql.query('update projects set user_id=$2 where id=$1',[id,foreign]);
        if(mode==='campaign')await sql.query('update growth_campaigns set tenant_id=$2 where id=$1',[id,foreign]);
        if(mode==='action')await sql.query('update operations_actions set requested_by=$2 where id=$1',[id,owner]);
        await sql.query('commit');const denied=await pending;pending=undefined;assert.equal(denied.error?.code,['member','project'].includes(mode)?'42501':'40001');
        if(mode==='member')assert.equal((await admin.from('operations_memberships').insert(member)).error,null);
        if(mode==='project')await sql.query('update projects set user_id=$2 where id=$1',[id,owner]);
        if(mode==='campaign')await sql.query('update growth_campaigns set tenant_id=$2 where id=$1',[id,owner]);
        if(mode==='action')await sql.query('update operations_actions set requested_by=$2 where id=$1',[id,foreign]);
        assert.deepEqual(await snapshot(),linked,'rejected linking cannot alter campaign evidence');
      }
      assert.equal((await admin.rpc('write_growth_record_admitted',args)).error,null,'same admitted link replays without creating messages');
      await sql.query('begin');await sql.query(`alter table growth_campaigns add constraint fixture_campaign_creation_failure check(project_id<>'${project}' or name<>'rollback fixture') not valid`);await sql.query('savepoint attempt');
      await assert.rejects(sql.query('select write_growth_record_admitted($1,$2,$3,$4,$5,$6)',[owner,owner,project,'campaign_create',{segment_id:segment.id,name:'rollback fixture',channel:'in_app',template_key:'fixture'},args.p_allowed_roles]),{code:'23514'});
      await sql.query('rollback to savepoint attempt');await sql.query('rollback');assert.deepEqual(await snapshot(),linked);
    }finally{await sql.query('rollback');if(pending)await Promise.allSettled([pending]);await sql.query(`drop trigger if exists ${fn} on growth_campaigns;drop function if exists public.${fn}();`);await sql.end();}
    const messages=await admin.from('growth_messages').select('id').eq('project_id',project);assert.equal(messages.error,null);assert.deepEqual(messages.data,[]);
  });
}
