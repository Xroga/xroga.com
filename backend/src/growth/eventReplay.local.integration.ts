import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import pg from 'pg';
import type {SupabaseClient} from '@supabase/supabase-js';
import {GrowthService} from './growthService.js';

export function registerGrowthEventReplayTests(admin:SupabaseClient,getUsers:()=>readonly {id:string;project:string}[]):void{
 test('real growth event concurrent retries retain one exact intent and reject changed replay',async t=>{
  assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
  const owner=getUsers()[0],key=randomUUID(),service=new GrowthService(admin);
  t.after(async()=>{assert.equal((await admin.from('analytics_events').delete().eq('tenant_id',owner.id).eq('idempotency_key',key)).error,null);});
  const input={projectId:owner.project,name:'identity.linked.v1',idempotencyKey:key,environment:'test' as const,consentState:'granted' as const,source:'fixture',evidenceReference:'exact-retry-fixture',metadata:{a:1,b:2}};
  const url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/postgres');
  const locker=new pg.Client({connectionString:url.href,ssl:false});await locker.connect();let pending:Promise<unknown>[]=[];
  try{
   await locker.query('begin');await locker.query('lock table public.analytics_events in share mode');
   pending=[service.recordEvent(owner.id,input),service.recordEvent(owner.id,input)];pending.forEach(p=>void p.catch(()=>{}));
   let waiting=false;
   for(let i=0;i<150;i++){
    const rows=await locker.query("select count(*)::int n from pg_locks where relation='public.analytics_events'::regclass and mode='RowExclusiveLock' and not granted");
    if(rows.rows[0].n>=2){waiting=true;break;}await delay(20);
   }
   assert.equal(waiting,true,'both HTTP inserts reached actual PostgreSQL lock');await locker.query('commit');
   const results=await Promise.all(pending) as Array<{event:{id:string};duplicate:boolean}>;
   assert.deepEqual(results.map(r=>r.duplicate).sort(),[false,true]);assert.equal(results[0].event.id,results[1].event.id);
   for(const patch of [{consentState:'denied' as const},{name:'activation.completed.v1'},{metadata:{a:9,b:2}},{evidenceReference:'changed'}])await assert.rejects(service.recordEvent(owner.id,{...input,...patch}),{code:'idempotency_conflict',statusCode:409});
   assert.equal((await service.recordEvent(owner.id,{...input,metadata:{b:2,a:1}})).duplicate,true);
   const stored=await admin.from('analytics_events').select('id,consent_state,metadata').eq('tenant_id',owner.id).eq('idempotency_key',key);assert.equal(stored.error,null);assert.equal(stored.data?.length,1);assert.equal(stored.data![0].consent_state,'granted');assert.deepEqual(stored.data![0].metadata,{a:1,b:2});
  }finally{await locker.query('rollback');await Promise.allSettled(pending);await locker.end();}
 });
 test('real growth event admission locks current project membership and every referenced parent with exact replay and rollback',async t=>{
  assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
  const users:string[]=[],projects:string[]=[];
  t.after(async()=>{
   for(const project of projects)assert.equal((await admin.from('projects').delete().eq('id',project)).error,null);
   for(const user of users)assert.equal((await admin.auth.admin.deleteUser(user)).error,null);
  });
  for(let i=0;i<3;i++){
   const created=await admin.auth.admin.createUser({email:`event-parent-${randomUUID()}@example.invalid`,email_confirm:true});
   assert.equal(created.error,null);assert.ok(created.data.user);users.push(created.data.user.id);
  }
  const [owner,member,other]=users;
  for(const user of [owner,other,owner]){
   const saved=await admin.from('projects').insert({user_id:user,name:'Event parent fixture',type:'app'}).select('id').single();
   assert.equal(saved.error,null);projects.push(saved.data!.id);
  }
  const [project,foreign,alias]=projects,campaign=randomUUID(),experiment=randomUUID(),deployment=randomUUID(),release=randomUUID(),referral=randomUUID(),attribution=randomUUID();
  assert.equal((await admin.from('operations_memberships').insert({user_id:owner,project_id:project,member_user_id:member,role:'viewer',created_by:owner})).error,null);
  assert.equal((await admin.from('growth_campaigns').insert({id:campaign,tenant_id:owner,project_id:project,name:'Historical campaign',channel:'in_app',template_key:'fixture',status:'completed'})).error,null);
  assert.equal((await admin.from('growth_experiments').insert({id:experiment,tenant_id:owner,project_id:project,key:'event-fixture',variants:[],allocation_seed:'fixture-seed',minimum_sample_size:10,status:'paused'})).error,null);
  assert.equal((await admin.from('deployment_status').insert({id:deployment,user_id:owner,project_id:project,target:'github',status:'deployed'})).error,null);
  assert.equal((await admin.from('production_releases').insert({id:release,user_id:owner,project_id:project,commit_sha:'a'.repeat(40),artifact_digest:randomUUID(),environment:'preview',manifest:{},state:'ready'})).error,null);
  assert.equal((await admin.from('referrals').insert({id:referral,referrer_id:owner,referred_id:other,code:'XROGA-EVT234'})).error,null);
  assert.equal((await admin.from('growth_referral_attribution').insert({id:attribution,tenant_id:owner,project_id:project,referral_id:referral,evidence_reference:'fixture:parent'})).error,null);
  const rewardsBefore=await admin.from('referral_rewards').select('*').in('user_id',users).order('id');assert.equal(rewardsBefore.error,null);
  const service=new GrowthService(admin),roles=['viewer','operator','release_manager','recovery_manager','admin'];
  const input={projectId:project,name:'identity.linked.v1',idempotencyKey:randomUUID(),environment:'test' as const,consentState:'granted' as const,
   source:'fixture',evidenceReference:'fixture:parent',campaignId:campaign,experimentId:experiment,deploymentId:deployment,releaseId:release,referralId:referral,metadata:{fixture:true}};
  const valid=await service.recordEvent(owner,input),shared=await service.recordEvent(member,{...input,idempotencyKey:randomUUID()});
  assert.equal(valid.duplicate,false);assert.equal(shared.event.user_id,member);assert.equal(shared.event.tenant_id,owner);
  assert.equal((await service.recordEvent(owner,input)).event.id,valid.event.id);
  await assert.rejects(service.recordEvent(other,input),{code:'forbidden',statusCode:403});
  await assert.rejects(service.recordEvent(owner,{...input,projectId:foreign}),{code:'forbidden',statusCode:403});
  await assert.rejects(service.recordEvent(owner,{...input,projectId:alias,idempotencyKey:randomUUID()}),{code:'not_found',statusCode:404});
  const url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/postgres');
  const locker=new pg.Client({connectionString:url.href,ssl:false}),writer=new pg.Client({connectionString:url.href,ssl:false});
  await locker.connect();await writer.connect();
  const intent=(actor=owner,key=randomUUID())=>({user_id:actor,project_id:project,event_type:input.name,event_version:1,idempotency_key:key,environment:'test',
   anonymous_id:null,session_id:null,release_id:release,deployment_id:deployment,campaign_id:campaign,referral_id:referral,experiment_id:experiment,
   consent_state:'granted',source:'fixture',evidence_reference:'fixture:parent',metadata:{fixture:true}});
  const invoke=(payload:ReturnType<typeof intent>,tenant=owner)=>writer.query('select public.record_growth_event($1,$2,$3,$4,null,$5) receipt',[payload.user_id,tenant,project,payload,roles]);
  try{
   await writer.query("set statement_timeout='10s'");
   const wp=(await writer.query('select pg_backend_pid() pid')).rows[0].pid,lp=(await locker.query('select pg_backend_pid() pid')).rows[0].pid;
   const cases=[
    {actor:owner,sql:'update public.projects set user_id=$1 where id=$2',values:[other,project],restore:'update public.projects set user_id=$1 where id=$2',back:[owner,project],code:'42501'},
    {actor:member,sql:'delete from public.operations_memberships where member_user_id=$1 and project_id=$2',values:[member,project],restore:"insert into public.operations_memberships(user_id,project_id,member_user_id,role,created_by) values($1,$2,$3,'viewer',$1)",back:[owner,project,member],code:'42501'},
    ...['growth_campaigns','growth_experiments'].map((table,i)=>({actor:owner,sql:`update public.${table} set tenant_id=$1,project_id=$2 where id=$3`,values:[other,foreign,[campaign,experiment][i]],restore:`update public.${table} set tenant_id=$1,project_id=$2 where id=$3`,back:[owner,project,[campaign,experiment][i]],code:'P0002'})),
    ...['production_releases','deployment_status'].map((table,i)=>({actor:owner,sql:`update public.${table} set user_id=$1,project_id=$2 where id=$3`,values:[other,foreign,[release,deployment][i]],restore:`update public.${table} set user_id=$1,project_id=$2 where id=$3`,back:[owner,project,[release,deployment][i]],code:'P0002'})),
    {actor:owner,sql:'update public.growth_referral_attribution set tenant_id=$1,project_id=$2 where id=$3',values:[other,foreign,attribution],restore:'update public.growth_referral_attribution set tenant_id=$1,project_id=$2 where id=$3',back:[owner,project,attribution],code:'P0002'},
   ];
   for(const scenario of cases){
    const payload=intent(scenario.actor);await locker.query('begin');await locker.query(scenario.sql,scenario.values);
    const pending=invoke(payload);void pending.catch(()=>{});let waiting=false;
    try{
     for(let i=0;i<150;i++){
      if((await locker.query('select pg_blocking_pids($1) blockers',[wp])).rows[0].blockers.includes(lp)){waiting=true;break;}await delay(20);
     }
     assert.equal(waiting,true,'Actual competing parent/member transaction holds the writer');await locker.query('commit');
     await assert.rejects(pending,{code:scenario.code});
     assert.equal((await writer.query('select id from public.analytics_events where tenant_id=$1 and idempotency_key=$2',[owner,payload.idempotency_key])).rowCount,0);
    }finally{await locker.query('rollback');await pending.catch(()=>{});await locker.query(scenario.restore,scenario.back);}
   }
   // A replay must still re-admit current membership, even though it writes no row.
   await writer.query('delete from public.operations_memberships where project_id=$1 and member_user_id=$2',[project,member]);
   const memberReplay={...intent(member,shared.event.idempotency_key)};
   await assert.rejects(invoke(memberReplay),{code:'42501'});
   await assert.rejects(invoke(intent(owner),other),{code:'42501'});
   const changed={...intent(owner,valid.event.idempotency_key),source:'different'};
   await assert.rejects(invoke(changed),{code:'23505'});
   await assert.rejects(writer.query('select public.record_growth_event($1,$2,$3,$4,$5,$6)',[owner,owner,project,intent(owner,valid.event.idempotency_key),'2000-01-01T00:00:00Z',roles]),{code:'23505'});
   for(const role of ['anon','authenticated']){
    await writer.query('begin');await writer.query(`set local role ${role}`);
    await assert.rejects(invoke(intent(owner)),{code:'42501'});await writer.query('rollback');
   }
   const rolledBack=intent();await writer.query('begin');
   const inserted=(await invoke(rolledBack)).rows[0].receipt;assert.equal(inserted.duplicate,false);
   assert.equal(inserted.event.idempotency_key,rolledBack.idempotency_key);
   await assert.rejects(writer.query('select 1/0'),{code:'22012'});await writer.query('rollback');
   assert.equal((await writer.query('select id from public.analytics_events where idempotency_key=$1',[rolledBack.idempotency_key])).rowCount,0);
   // Distinct keys remain independent under real simultaneous HTTP requests.
   const distinct=await Promise.all([1,2].map(()=>service.recordEvent(owner,{...input,idempotencyKey:randomUUID()})));
   assert.notEqual(distinct[0].event.id,distinct[1].event.id);assert.ok(distinct.every(row=>row.duplicate===false));
   const saved=await admin.from('analytics_events').select('*').eq('id',valid.event.id).single();assert.equal(saved.error,null);assert.deepEqual(saved.data,valid.event);
   const rewardsAfter=await admin.from('referral_rewards').select('*').in('user_id',users).order('id');assert.equal(rewardsAfter.error,null);assert.deepEqual(rewardsAfter.data,rewardsBefore.data,'Recording analytics grants no reward');
  }finally{await locker.query('rollback');await writer.query('rollback');await writer.end();await locker.end();}
 });
}
