import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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
    try{
      await sql.query(`create function public.${fn}() returns trigger language plpgsql as $$begin
        if new.name='${failName}' and new.evidence_reference like 'operations_action:%' then raise exception 'fixture storage failure'; end if;
        return new; end;$$;create trigger ${fn} before update on growth_campaigns for each row execute function public.${fn}();`);
      await assert.rejects(service.createCampaign(owner,{...input,name:failName,idempotencyKey:randomUUID()}),{code:'storage_unavailable',statusCode:503});
      const failed=await admin.from('growth_campaigns').select('evidence_reference,status').eq('project_id',project).eq('name',failName).single();
      assert.equal(failed.error,null);assert.equal(failed.data?.evidence_reference,null);assert.equal(failed.data?.status,'approval_required');
    }finally{await sql.query(`drop trigger if exists ${fn} on growth_campaigns;drop function if exists public.${fn}();`);await sql.end();}
    const messages=await admin.from('growth_messages').select('id').eq('project_id',project);assert.equal(messages.error,null);assert.deepEqual(messages.data,[]);
  });
}
