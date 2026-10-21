import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';
import pg from 'pg';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {GrowthService} from './growthService.js';

export function registerSharedGrowthWriteTests(admin:SupabaseClient,getUsers:()=>readonly {id:string;token:string}[]):void{
 test('real shared growth admission fences all five writes against revocation and parent transfer with exact receipts',async t=>{
  assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
  const url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');
  const [owner,actor]=getUsers(),project=randomUUID(),otherProject=randomUUID(),membership=randomUUID(),service=new GrowthService(admin);
  const tables=['growth_recommendations','growth_suppressions','growth_attribution_touches','growth_segments','growth_experiments'];
  t.after(async()=>{assert.equal((await admin.from('projects').delete().in('id',[project,otherProject])).error,null);});
  assert.equal((await admin.from('projects').insert([{id:project,user_id:owner.id,name:'Shared growth admission',type:'app'},{id:otherProject,user_id:actor.id,name:'Foreign fixture parent',type:'app'}])).error,null);
  const addMember=async(role='operator')=>{assert.equal((await admin.from('operations_memberships').upsert({id:membership,user_id:owner.id,project_id:project,member_user_id:actor.id,role,created_by:owner.id})).error,null);};await addMember();
  const invokes=[
   (user=owner.id)=>service.recommend(user,{projectId:project,consent:true}),
   (user=owner.id)=>service.suppress(user,{projectId:project,channel:'in_app',address:'fixture-shared-admission',reason:'manual',evidenceReference:'fixture evidence'}),
   (user=owner.id)=>service.recordAttribution(user,{projectId:project,touchType:'unknown',evidenceReference:'fixture evidence'}),
   (user=owner.id)=>service.createSegment(user,{projectId:project,name:randomUUID(),lifecycleStates:['activated']}),
   (user=owner.id)=>service.createExperiment(user,{projectId:project,key:randomUUID(),seed:'fixture',variants:[{key:'control',weight:1}],minimumSampleSize:1}),
  ];
  const snapshot=async()=>Promise.all(tables.map(async table=>{const rows=await admin.from(table).select('*').eq('project_id',project).order('id');assert.equal(rows.error,null);return rows.data;}));
  for(const [index,invoke]of invokes.entries()){const row=await invoke();assert.equal(row.project_id,project);if(index!==1)assert.equal(row.tenant_id,owner.id);assert.ok(row.id);}
  const db=new pg.Client({connectionString:url.href,ssl:false});await db.connect();let pending:Promise<unknown>|undefined;
  const wait=async()=>{for(let attempt=0;attempt<150;attempt++){await db.query('select pg_stat_clear_snapshot()');const rows=await db.query("select pid from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock' and query like '%write_growth_record_admitted%'");if(rows.rowCount)return;await delay(20);}assert.fail('The actual admitted growth operation must reach the held database row lock');};
  try{
   for(const invoke of invokes){
    const before=await snapshot();await db.query('begin');await db.query('select id from operations_memberships where id=$1 for update',[membership]);
    pending=invoke(actor.id);void pending.catch(()=>{});await wait();await db.query('delete from operations_memberships where id=$1',[membership]);await db.query('commit');await assert.rejects(pending,{code:'forbidden'});pending=undefined;assert.deepEqual(await snapshot(),before);await addMember();
    await db.query('begin');await db.query('select id from projects where id=$1 for update',[project]);
    pending=invoke();void pending.catch(()=>{});await wait();await db.query('update projects set user_id=$2 where id=$1',[project,actor.id]);await db.query('commit');await assert.rejects(pending,{code:'forbidden'});pending=undefined;assert.deepEqual(await snapshot(),before);await db.query('update projects set user_id=$2 where id=$1',[project,owner.id]);
   }
   // Preserve the original view/manage split, rather than adding authority.
   await addMember('viewer');assert.equal((await invokes[0](actor.id)).tenant_id,owner.id);assert.equal((await invokes[2](actor.id)).user_id,actor.id);
   for(const index of [1,3,4])await assert.rejects(invokes[index](actor.id),{code:'forbidden'});await addMember();
   const incident=randomUUID();assert.equal((await admin.from('production_incidents').insert({id:incident,user_id:owner.id,project_id:project,title:'Synthetic critical incident',severity:'critical',status:'open'})).error,null);
   const blocked=await invokes[0]();assert.equal(blocked.status,'blocked');assert.equal(blocked.blocker_category,'critical_incident');assert.equal(blocked.evidence_reference,`incident:${incident}`);
   const before=await snapshot();await db.query('begin');await db.query('select id from production_incidents where id=$1 for update',[incident]);
   pending=invokes[0]();void pending.catch(()=>{});await wait();await db.query('update production_incidents set project_id=$2,user_id=$3 where id=$1',[incident,otherProject,actor.id]);await db.query('commit');await assert.rejects(pending,{code:'conflict'});pending=undefined;assert.deepEqual(await snapshot(),before);
   const concurrent=await Promise.all([invokes[1](),invokes[1]()]);assert.equal(concurrent[0].id,concurrent[1].id);
   await db.query('begin');await db.query(`alter table growth_segments add constraint fixture_shared_growth_rollback check(project_id<>'${project}') not valid`);await db.query('savepoint attempt');
   const args={p_actor:owner.id,p_tenant:owner.id,p_project:project,p_operation:'segment',p_data:{name:randomUUID(),definition:{lifecycleStates:['activated']},status:'active'},p_allowed_roles:['operator','release_manager','recovery_manager','admin']};
   await assert.rejects(db.query('select write_growth_record_admitted($1,$2,$3,$4,$5,$6)',[args.p_actor,args.p_tenant,args.p_project,args.p_operation,args.p_data,args.p_allowed_roles]),{code:'23514'});await db.query('rollback to savepoint attempt');await db.query('rollback');
   for(const token of [undefined,actor.token]){const browser:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{})});assert.equal((await browser.rpc('write_growth_record_admitted',args)).error?.code,'42501');}
   assert.equal((await admin.rpc('write_growth_record_admitted',{...args,p_tenant:actor.id})).error?.code,'42501');
  }finally{await db.query('rollback');if(pending)await Promise.allSettled([pending]);await db.end();}
 });
}
