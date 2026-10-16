import assert from 'node:assert/strict';import{randomUUID,createHash}from'node:crypto';import{setTimeout as delay}from'node:timers/promises';import{test}from'node:test';import pg from'pg';import type{SupabaseClient}from'@supabase/supabase-js';import{GrowthService}from'./growthService.js';import{OperationsService}from'../operations/operationsService.js';
export function registerGrowthDeliveryTests(admin:SupabaseClient):void{
 test('real atomic in-app delivery binds canonical approval, rolls back, serializes and replays without duplicate notifications',async t=>{
  assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
  const users:string[]=[];let project='';
  t.after(async()=>{if(project)assert.equal((await admin.from('projects').delete().eq('id',project)).error,null);for(const id of users)assert.equal((await admin.auth.admin.deleteUser(id)).error,null);});
  for(let i=0;i<4;i++){const created=await admin.auth.admin.createUser({email:`delivery-${randomUUID()}@example.invalid`,email_confirm:true});assert.equal(created.error,null);assert.ok(created.data.user);users.push(created.data.user.id);}
  const [owner,approver,recipient,blocked]=users;
  assert.equal((await admin.from('profiles').update({role:'admin'}).eq('id',approver)).error,null);
  const p=await admin.from('projects').insert({user_id:owner,name:'Atomic delivery fixture',type:'app'}).select('id').single();assert.equal(p.error,null);assert.ok(p.data);project=p.data.id;
  const service=new GrowthService(admin),operations=new OperationsService(admin);
  const segment=await service.createSegment(owner,{projectId:project,name:'Delivery cohort',lifecycleStates:['activated']});
  for(const id of [recipient,blocked]){
    assert.equal((await admin.from('growth_lifecycle_state').insert({tenant_id:owner,project_id:project,subject_type:'user',subject_id:id,lifecycle_state:'activated',evidence_reference:'fixture'})).error,null);
    assert.equal((await admin.from('analytics_events').insert({user_id:id,tenant_id:owner,project_id:project,event_type:'identity.linked.v1',consent_state:'granted',environment:'test'})).error,null);
  }
  assert.equal((await admin.from('growth_suppressions').insert({tenant_id:owner,project_id:project,channel:'in_app',address_hash:createHash('sha256').update(blocked).digest('hex'),reason:'manual',source_evidence:'fixture'})).error,null);
  const seed=async()=>{
    const created=await service.createCampaign(owner,{projectId:project,segmentId:segment.id,name:`Delivery ${randomUUID()}`,channel:'in_app',templateKey:'fixture',idempotencyKey:randomUUID()});
    await operations.approveAction(approver,created.action.id,'approved','Disposable approval fixture');
    assert.equal((await operations.executeAction(owner,created.action.id)).status,'verified');
    return created;
  };
  const fixture=await seed();
  await assert.rejects(service.processCampaign(recipient,fixture.campaign.id),{statusCode:403});
  const database=new URL(process.env.XB01_LOCAL_DATABASE_URL!);assert.equal(database.hostname,'127.0.0.1');assert.equal(database.port,'54322');assert.equal(database.pathname,'/postgres');
  const locker=new pg.Client({connectionString:database.href,ssl:false}),first=new pg.Client({connectionString:database.href,ssl:false}),second=new pg.Client({connectionString:database.href,ssl:false});
  await locker.connect();await first.connect();await second.connect();
  const suffix=randomUUID().replaceAll('-',''),fn=`fixture_delivery_${suffix}`;
  try{
    await locker.query(`create function public.${fn}() returns trigger language plpgsql as $$begin
      if new.metadata->>'campaignId'='${fixture.campaign.id}' then raise exception 'fixture notification failure';end if;return new;end;$$;
      create trigger ${fn} before insert on notifications for each row execute function public.${fn}();`);
    await assert.rejects(service.processCampaign(owner,fixture.campaign.id),{statusCode:409});
    assert.deepEqual((await admin.from('growth_messages').select('id').eq('campaign_id',fixture.campaign.id)).data,[]);
    assert.equal((await admin.from('growth_campaigns').select('status').eq('id',fixture.campaign.id).single()).data?.status,'running');
    await locker.query(`drop trigger ${fn} on notifications;drop function public.${fn}();`);
    await first.query("set statement_timeout='10s'");await second.query("set statement_timeout='10s'");
    const lp=(await locker.query('select pg_backend_pid() pid')).rows[0].pid;
    const pids=[(await first.query('select pg_backend_pid() pid')).rows[0].pid,(await second.query('select pg_backend_pid() pid')).rows[0].pid];
    await locker.query('begin');await locker.query('select id from growth_campaigns where id=$1 for update',[fixture.campaign.id]);
    const pending=[first,second].map(client=>client.query('select process_growth_in_app_campaign($1,$2) receipt',[owner,fixture.campaign.id]));pending.forEach(result=>void result.catch(()=>{}));
    let observed=false;
    for(let i=0;i<100;i++){const locks=await locker.query('select pid,pg_blocking_pids(pid) blockers from pg_stat_activity where pid=any($1::int[])',[pids]);
      if(locks.rows.length===2&&locks.rows.every(row=>row.blockers.includes(lp)||row.blockers.some((id:number)=>pids.includes(id)))){observed=true;break;}await delay(20);}
    assert.equal(observed,true,'observe both concurrent delivery clients waiting');await locker.query('commit');
    const receipts=(await Promise.all(pending)).map(result=>result.rows[0].receipt);
    assert.deepEqual(receipts.map(r=>r.replayed).sort(),[false,true]);for(const r of receipts)assert.deepEqual([r.queued,r.suppressed,r.duplicate],[1,1,0]);
    assert.deepEqual(await service.processCampaign(owner,fixture.campaign.id),{queued:1,suppressed:1,duplicate:0});
    const notifications=await admin.from('notifications').select('id,user_id,metadata').contains('metadata',{campaignId:fixture.campaign.id});assert.equal(notifications.error,null);assert.equal(notifications.data?.length,1);assert.equal(notifications.data?.[0].user_id,recipient);
    const stale=await seed();assert.equal((await admin.from('operations_action_approvals').update({target_version:0}).eq('action_id',stale.action.id)).error,null);
    await assert.rejects(service.processCampaign(owner,stale.campaign.id),{statusCode:409});
    assert.deepEqual((await admin.from('growth_messages').select('id').eq('campaign_id',stale.campaign.id)).data,[]);
    const email=await seed();assert.equal((await admin.from('growth_campaigns').update({channel:'email'}).eq('id',email.campaign.id)).error,null);
    await assert.rejects(service.processCampaign(owner,email.campaign.id),{code:'external_setup_required'});
    const direct=await admin.rpc('process_growth_in_app_campaign',{p_actor:owner,p_campaign:email.campaign.id});assert.equal(direct.error?.code,'0A000');
    const uncertain=await seed();assert.equal((await admin.from('growth_messages').insert({tenant_id:owner,project_id:project,campaign_id:uncertain.campaign.id,recipient_user_id:recipient,channel:'in_app',provider:'xroga',template_key:'fixture',recipient_hash:'fixture',idempotency_key:randomUUID(),status:'submitted',consent_state:'granted'})).error,null);
    await assert.rejects(service.processCampaign(owner,uncertain.campaign.id),{statusCode:409});
    for(const role of ['anon','authenticated']){await first.query('begin');await first.query(`set local role ${role}`);await assert.rejects(first.query('select process_growth_in_app_campaign($1,$2)',[owner,fixture.campaign.id]),{code:'42501'});await first.query('rollback');}
  }finally{await locker.query('rollback');await locker.query(`drop trigger if exists ${fn} on notifications;drop function if exists public.${fn}();`);await first.query('rollback');await second.query('rollback');await first.end();await second.end();await locker.end();}
 });
}
