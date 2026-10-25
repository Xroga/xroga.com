import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {test,type TestContext} from 'node:test';
import pg from 'pg';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {OperationsService} from './operationsService.js';
import {ACTION_DEFINITIONS,actionPlanDigest} from './operationsEngine.js';

type Row=Record<string,any>;
type Actor={id:string;token:string};
type ApiRequest=(path:string,token?:string,method?:string,body?:unknown)=>Promise<Response>;
/** Real Auth/DB/HTTP. Only fixed internal database capabilities, no provider dispatch. */
export function registerInternalEffectTests(admin:SupabaseClient,request:ApiRequest):void{
 const connect=()=>{
  assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
  const url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/postgres');return new pg.Client({connectionString:url.href,ssl:false});
 };
 const fixture=async(t:TestContext)=>{
  const actors:Actor[]=[],project=randomUUID(),foreignProject=randomUUID(),membership=randomUUID();
  t.after(async()=>{assert.equal((await admin.from('projects').delete().in('id',[project,foreignProject])).error,null);for(const actor of actors)assert.equal((await admin.auth.admin.deleteUser(actor.id)).error,null);});
  for(let n=0;n<3;n++){
   const email=`internal-effect-${randomUUID()}@example.invalid`,password=randomUUID()+randomUUID(),created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(created.error,null);assert.ok(created.data.user);
   const browser:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});const signed=await browser.auth.signInWithPassword({email,password});assert.equal(signed.error,null);assert.ok(signed.data.session);actors.push({id:created.data.user.id,token:signed.data.session.access_token});
  }
  const[owner,member,foreign]=actors;
  assert.equal((await admin.from('projects').insert([{id:project,user_id:owner.id,name:'Internal effect fixture',type:'app'},{id:foreignProject,user_id:foreign.id,name:'Other tenant fixture',type:'app'}])).error,null);
  assert.equal((await admin.from('operations_memberships').insert({id:membership,user_id:owner.id,project_id:project,member_user_id:member.id,role:'recovery_manager',created_by:owner.id})).error,null);
  const add=async(table:string,row:Row)=>{const saved=await admin.from(table).insert(row).select('*').single();assert.equal(saved.error,null,`${table}: ${saved.error?.code}`);assert.ok(saved.data);return saved.data as Row;};
  const seed=async(capability:string,actor=owner)=>{
   const definition=ACTION_DEFINITIONS[capability];assert.ok(definition);const target=randomUUID();let table:string,type:string,key='id',plan:Row={};const common={user_id:owner.id,project_id:project};
   if(['acknowledge_incident','resolve_incident'].includes(capability)){table='production_incidents';type='incident';await add(table,{...common,id:target,title:'Synthetic internal incident',severity:'low',status:capability==='resolve_incident'?'investigating':'open'});plan={recoveryEvidenceReference:'synthetic-owned-recovery'};}
   else if(capability==='retry_job'){table='swarm_job_queue';type='job';await add(table,{...common,id:target,run_id:randomUUID(),prompt:'Synthetic fixture, no worker execution',status:'failed',attempt_count:1});}
   else if(capability==='retry_webhook'){table='webhook_deliveries';type='webhook';key='delivery_id';await add(table,{...common,provider:'synthetic-internal-fixture',delivery_id:target,payload_digest:'a'.repeat(64),status:'failed',attempt_count:1});}
   else if(['emergency_stop','resume_automation','enable_automation','disable_automation'].includes(capability)){table='operations_automation_rules';type='automation';await add(table,{...common,id:target,rule_key:target,name:'Synthetic internal rule',trigger_type:'synthetic-internal-fixture',action_type:'refresh_health',risk_level:'low',enabled:false,emergency_stopped:capability==='resume_automation'});}
   else if(capability==='schedule_maintenance'){table='operations_environments';type='environment';await add(table,{...common,id:target,environment_key:target,environment_type:'test'});plan={startsAt:new Date(Date.now()+3600000).toISOString(),endsAt:new Date(Date.now()+7200000).toISOString(),reason:'Synthetic maintenance fixture',allowedActions:['refresh_health'],blockedActions:['execute_growth_campaign']};}
   else if(capability==='cancel_maintenance'){table='operations_maintenance_windows';type='maintenance';await add(table,{...common,id:target,starts_at:new Date().toISOString(),ends_at:new Date(Date.now()+3600000).toISOString(),reason:'Synthetic window',owner_id:owner.id});}
   else{assert.equal(capability,'execute_growth_campaign');table='growth_campaigns';type='growth_campaign';const segment=await add('growth_segments',{tenant_id:owner.id,project_id:project,name:target,definition:{},status:'active'});await add(table,{id:target,tenant_id:owner.id,project_id:project,segment_id:segment.id,name:target,channel:'in_app',status:'approval_required',template_key:'synthetic'});}
   const id=randomUUID(),intent={actionType:capability,projectId:project,targetType:type,targetId:target,targetVersion:1,idempotencyKey:id,confirmed:true,parameters:plan},digest=actionPlanDigest(intent);
   const action=await add('operations_actions',{...common,id,action_type:capability,target_type:type,target_id:target,target_version:1,requested_by:actor.id,permission_required:definition.permission,risk_level:definition.riskLevel,status:definition.approvalRole?'approved':'queued',idempotency_key:id,action_plan_digest:digest,confirmation_digest:definition.confirmationRequired?digest:null,execution_plan:plan,max_attempts:definition.maxAttempts});
   if(definition.approvalRole)await add('operations_action_approvals',{action_id:id,user_id:owner.id,requester_id:actor.id,approver_id:member.id,required_role:definition.approvalRole,decision:'approved',target_version:1,action_plan_digest:digest,expires_at:new Date(Date.now()+600000).toISOString()});
   const snapshot=async()=>{const result=await admin.from(table).select('*').eq(key,target).single();assert.equal(result.error,null);assert.ok(result.data);return result.data as Row;};
   return{capability,action,table,key,target,plan,snapshot};
  };
  return{owner,member,foreign,project,foreignProject,membership,seed};
 };
 test('real internal operation endpoint retains admitted actor owner project and target receipts across every supported database capability',{timeout:60000},async t=>{
  const f=await fixture(t);
  for(const capability of ['acknowledge_incident','resolve_incident','retry_job','retry_webhook','emergency_stop','resume_automation','enable_automation','disable_automation','schedule_maintenance','cancel_maintenance','execute_growth_campaign']){
   const seeded=await f.seed(capability),before=await seeded.snapshot(),path=`/api/operations/actions/${seeded.action.id}/execute`;
   assert.equal((await request(path,undefined,'POST',{})).status,401);assert.equal((await request(path,f.foreign.token,'POST',{userId:f.owner.id})).status,403);assert.deepEqual(await seeded.snapshot(),before);
   const response=await request(path,f.owner.token,'POST',{userId:f.foreign.id,tenantId:f.foreign.id});assert.equal(response.status,200,capability);const body=await response.json() as {action:Row};assert.equal(body.action.status,'verified',`${capability}: ${body.action.status_reason}`);assert.equal(body.action.id,seeded.action.id);assert.equal(body.action.user_id,f.owner.id);assert.equal(body.action.project_id,f.project);assert.equal(body.action.attempt_count,1);assert.equal(body.action.lease_owner,null);assert.equal(body.action.lease_expires_at,null);assert.match(body.action.evidence_reference,/^ev_/);
   const after=await seeded.snapshot();assert.equal(after.project_id,f.project);assert.equal(after.user_id??after.tenant_id,f.owner.id);
   if(capability==='schedule_maintenance'){
    assert.deepEqual(after,before,'Environment itself is not mutated');const windows=await admin.from('operations_maintenance_windows').select('*').eq('project_id',f.project).eq('environment_id',seeded.target);assert.equal(windows.error,null);assert.equal(windows.data?.length,1);const window=windows.data![0];assert.equal(window.user_id,f.owner.id);assert.equal(window.owner_id,f.owner.id);assert.equal(Date.parse(window.starts_at),Date.parse(seeded.plan.startsAt));assert.equal(Date.parse(window.ends_at),Date.parse(seeded.plan.endsAt));assert.deepEqual(window.allowed_actions,seeded.plan.allowedActions);assert.deepEqual(window.blocked_actions,seeded.plan.blockedActions);
   }else{
    const expectations:Record<string,Row>={acknowledge_incident:{status:'investigating',version:2},resolve_incident:{status:'resolved',version:2,recovery_evidence_reference:'synthetic-owned-recovery'},retry_job:{status:'queued',attempt_count:2},retry_webhook:{status:'processing',attempt_count:2},emergency_stop:{emergency_stopped:true,version:2},resume_automation:{emergency_stopped:false,version:2},enable_automation:{enabled:true,version:2},disable_automation:{enabled:false,version:2},cancel_maintenance:{status:'cancelled',version:2},execute_growth_campaign:{status:'running',version:2}};const expected=expectations[capability];
    for(const[key,value]of Object.entries(expected))assert.deepEqual(after[key],value,`${capability}.${key}`);
    const allowed=new Set([...Object.keys(expected),'updated_at',...(capability==='resolve_incident'?['resolved_at']:[]),...(['retry_job','retry_webhook'].includes(capability)?['safe_error']:[])]);
    if('updated_at'in after)assert.ok(Number.isFinite(Date.parse(after.updated_at)));if(capability==='resolve_incident')assert.ok(Number.isFinite(Date.parse(after.resolved_at)));if(['retry_job','retry_webhook'].includes(capability))assert.equal(after.safe_error,null);
    assert.deepEqual(Object.fromEntries(Object.entries(after).filter(([key])=>!allowed.has(key))),Object.fromEntries(Object.entries(before).filter(([key])=>!allowed.has(key))));
   }
   const evidence=await admin.from('production_evidence').select('id,user_id,project_id,status,metadata').eq('id',body.action.evidence_reference).single();assert.equal(evidence.error,null);
   assert.deepEqual({...evidence.data,metadata:undefined},{id:body.action.evidence_reference,user_id:f.owner.id,project_id:f.project,status:'verified',metadata:undefined});
   const effect=(evidence.data!.metadata as Row).observedState.internalEffect;
   assert.deepEqual({...effect,rows:undefined},{actionId:seeded.action.id,attempt:1,actorId:f.owner.id,ownerId:f.owner.id,projectId:f.project,targetId:seeded.target,capability,rows:undefined});
   assert.equal(effect.rows.length,1);assert.equal(effect.rows[0].user_id,f.owner.id);assert.equal(effect.rows[0].project_id,f.project);
   assert.equal(effect.rows[0][capability==='retry_webhook'?'delivery_id':'id'],capability==='schedule_maintenance'?(evidence.data!.metadata as Row).observedState.maintenanceId:seeded.target);
   const attempts=await admin.from('operations_action_runs').select('attempt,status,provider').eq('action_id',seeded.action.id);assert.equal(attempts.error,null);assert.deepEqual(attempts.data,[{attempt:1,status:'verified',provider:'internal_database'}]);
   const replay=await request(path,f.owner.token,'POST',{});assert.equal(replay.status,200);assert.equal(((await replay.json()) as {action:Row}).action.evidence_reference,body.action.evidence_reference);assert.deepEqual(await seeded.snapshot(),after);
  }
  const memberAction=await f.seed('acknowledge_incident',f.member);const memberResult=await request(`/api/operations/actions/${memberAction.action.id}/execute`,f.member.token,'POST',{});assert.equal(memberResult.status,200);assert.equal(((await memberResult.json()) as {action:Row}).action.status,'verified');
  const competing=await f.seed('acknowledge_incident'),concurrent=await Promise.all([0,1].map(()=>request(`/api/operations/actions/${competing.action.id}/execute`,f.owner.token,'POST',{})));assert.ok(concurrent.every(r=>[200,409].includes(r.status)));assert.ok(concurrent.some(r=>r.status===200));
  for(const response of concurrent)if(response.status===200)assert.equal(((await response.json()) as {action:Row}).action.status,'verified');assert.equal((await competing.snapshot()).version,2);const oneAttempt=await admin.from('operations_action_runs').select('attempt,status').eq('action_id',competing.action.id);assert.equal(oneAttempt.error,null);assert.deepEqual(oneAttempt.data,[{attempt:1,status:'verified'}]);
  const foreignRule=randomUUID();assert.equal((await admin.from('operations_automation_rules').insert({id:foreignRule,user_id:f.foreign.id,project_id:f.foreignProject,rule_key:foreignRule,name:'Foreign control canary',trigger_type:'fixture',action_type:'refresh_health',risk_level:'low',enabled:false,emergency_stopped:false})).error,null);
  const wide=await f.seed('emergency_stop'),wideDigest=actionPlanDigest({actionType:'emergency_stop',projectId:f.project,targetType:'automation',targetId:f.project,targetVersion:1,idempotencyKey:wide.action.id,confirmed:true,parameters:{}});assert.equal((await admin.from('operations_actions').update({target_id:f.project,action_plan_digest:wideDigest,confirmation_digest:wideDigest}).eq('id',wide.action.id)).error,null);
  const beforeRules=await admin.from('operations_automation_rules').select('*').eq('project_id',f.project).order('id');assert.equal(beforeRules.error,null);const foreignBefore=await admin.from('operations_automation_rules').select('*').eq('id',foreignRule).single();assert.equal(foreignBefore.error,null);
  const wideResult=await request(`/api/operations/actions/${wide.action.id}/execute`,f.owner.token,'POST',{});
  assert.equal(wideResult.status,200);assert.equal(((await wideResult.json()) as {action:Row}).action.status,'verified');
  const afterRules=await admin.from('operations_automation_rules').select('*').eq('project_id',f.project).order('id');
  assert.equal(afterRules.error,null);assert.equal(afterRules.data?.length,beforeRules.data?.length);
  for(const row of afterRules.data!){
   const prior:Row=beforeRules.data!.find((candidate:Row)=>candidate.id===row.id)!;
   assert.equal(row.user_id,f.owner.id);assert.equal(row.emergency_stopped,true);assert.equal(row.version,prior.version+1);
  }
  assert.deepEqual((await admin.from('operations_automation_rules').select('*').eq('id',foreignRule).single()).data,foreignBefore.data);
  const rollback=await f.seed('acknowledge_incident'),beforeRollback=await rollback.snapshot(),failureDb=connect(),constraint=`fixture_effect_${randomUUID().replaceAll('-','')}`;await failureDb.connect();
  try{await failureDb.query(`alter table production_incidents add constraint ${constraint} check(id<>'${rollback.target}'::uuid or status='open') not valid`);
   const failed=await request(`/api/operations/actions/${rollback.action.id}/execute`,f.owner.token,'POST',{});assert.equal(failed.status,200);assert.equal(((await failed.json()) as {action:Row}).action.status,'failed');assert.deepEqual(await rollback.snapshot(),beforeRollback);
  }finally{await failureDb.query(`alter table production_incidents drop constraint if exists ${constraint}`);await failureDb.end();}
  const recovered=await request(`/api/operations/actions/${rollback.action.id}/execute`,f.owner.token,'POST',{});assert.equal(recovered.status,200);const recoveredAction=((await recovered.json()) as {action:Row}).action;assert.equal(recoveredAction.status,'verified');assert.equal(recoveredAction.attempt_count,2);assert.equal((await rollback.snapshot()).status,'investigating');
  const catalog=connect();await catalog.connect();try{for(const signature of ['public.lock_operations_action_admission(uuid,jsonb,text[],text,boolean)','public.mutate_operations_internal_target(text,uuid,jsonb,text,text[],text,boolean)']){const row=(await catalog.query("select to_regprocedure($1)::text routine,has_function_privilege('anon',$1,'EXECUTE') anon,has_function_privilege('authenticated',$1,'EXECUTE') member",[signature])).rows[0];assert.ok(row.routine);assert.equal(row.anon,false);assert.equal(row.member,false);}}finally{await catalog.end();}
  for(const token of [undefined,f.owner.token]){const browser:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{})});const denied=await browser.rpc('mutate_operations_internal_target',{p_capability:'acknowledge_incident',p_actor:f.owner.id,p_expected:memberAction.action,p_evidence_id:`ev_${randomUUID()}`,p_allowed_roles:['operator'],p_approval_role:null,p_confirmation_required:false});assert.equal(denied.error?.code,'42501');}
 });
 test('real post-claim internal effects reject current membership owner and attempt changes and recheck expiry after observed target waits',{timeout:60000},async t=>{
  const f=await fixture(t),db=connect();await db.connect();let pending:Promise<Row>|undefined,release:()=>void=()=>{};
  try{
   for(const mode of ['membership','owner','attempt','target','version','revoked','wrong_lease','approval_revoked','lease_expiry','approval_expiry']){
    const seeded=await f.seed(mode.startsWith('approval_')?'resume_automation':'acknowledge_incident',mode==='membership'?f.member:f.owner),actor=mode==='membership'?f.member:f.owner;
    let entered!:()=>void;const observed=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);let held=false;
    const client:SupabaseClient=new Proxy(admin,{get(target,key){if(key==='rpc')return async(name:string,args:Row)=>{const result=await target.rpc(name,args);if(name==='claim_operations_action_admitted'&&!held){held=true;assert.equal(result.error,null);assert.ok(Array.isArray(result.data));assert.equal(result.data.length,1);if(mode==='lease_expiry'){const shortened=await admin.from('operations_actions').update({lease_expires_at:new Date(Date.now()+1500).toISOString()}).eq('id',seeded.action.id).select('*').single();assert.equal(shortened.error,null);result.data[0]=shortened.data;}if(mode==='approval_expiry')assert.equal((await admin.from('operations_action_approvals').update({expires_at:new Date(Date.now()+1500).toISOString()}).eq('action_id',seeded.action.id)).error,null);entered();await gate;}return result;};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
    if(['lease_expiry','approval_expiry'].includes(mode)){await db.query('begin');await db.query(`select ${seeded.key} from ${seeded.table} where ${seeded.key}=$1 for update`,[seeded.target]);}
    pending=new OperationsService(client).executeAction(actor.id,seeded.action.id);void pending.catch(()=>{});await observed;
    if(!['lease_expiry','approval_expiry'].includes(mode)){
     await db.query('begin');await db.query('select id from profiles where id=$1 for update',[actor.id]);release();
     let blocked=false;for(let n=0;n<150;n++){await db.query('select pg_stat_clear_snapshot()');const wait=await db.query("select pid from pg_stat_activity where pid<>pg_backend_pid() and pg_backend_pid()=any(pg_blocking_pids(pid)) and wait_event_type='Lock' and query like '%mutate_operations_internal_target%'");if(wait.rowCount){blocked=true;break;}await delay(20);}assert.equal(blocked,true,`${mode} reached the actual current-authority lock`);
    }
    if(mode==='membership')assert.equal((await admin.from('operations_memberships').update({role:'viewer'}).eq('id',f.membership)).error,null);
    if(mode==='owner')assert.equal((await admin.from('projects').update({user_id:f.foreign.id}).eq('id',f.project)).error,null);
    if(mode==='attempt')assert.equal((await admin.from('operations_actions').update({attempt_count:2}).eq('id',seeded.action.id)).error,null);
    if(mode==='target')assert.equal((await admin.from('production_incidents').update({user_id:f.foreign.id,project_id:f.foreignProject}).eq('id',seeded.target)).error,null);
    if(mode==='version')assert.equal((await admin.from('production_incidents').update({version:2}).eq('id',seeded.target)).error,null);
    if(mode==='revoked')assert.equal((await admin.from('operations_actions').update({status:'cancelled'}).eq('id',seeded.action.id)).error,null);
    if(mode==='wrong_lease')assert.equal((await admin.from('operations_actions').update({lease_owner:`api:${f.foreign.id}`}).eq('id',seeded.action.id)).error,null);
    if(mode==='approval_revoked')assert.equal((await admin.from('operations_action_approvals').update({decision:'rejected'}).eq('action_id',seeded.action.id)).error,null);
    const before=await seeded.snapshot();release();
    if(['lease_expiry','approval_expiry'].includes(mode)){
     let blocked=false;for(let n=0;n<150;n++){await db.query('select pg_stat_clear_snapshot()');const wait=await db.query("select pid from pg_stat_activity where pid<>pg_backend_pid() and pg_backend_pid()=any(pg_blocking_pids(pid)) and wait_event_type='Lock' and query like '%mutate_operations_internal_target%'");if(wait.rowCount){blocked=true;break;}await delay(20);}assert.equal(blocked,true,`${mode} reached the actual held target lock`);
     await db.query(mode==='lease_expiry'?"select pg_sleep(greatest(0,extract(epoch from lease_expires_at-clock_timestamp()))+0.05) from operations_actions where id=$1":"select pg_sleep(greatest(0,extract(epoch from expires_at-clock_timestamp()))+0.05) from operations_action_approvals where action_id=$1",[seeded.action.id]);await db.query('commit');
    }else await db.query('commit');
    if(['owner','attempt','revoked','wrong_lease','lease_expiry'].includes(mode))await assert.rejects(pending,{code:'unknown',statusCode:503});else{const result=await pending;assert.equal(result.status,['target','version'].includes(mode)?'blocked':'failed');}
    pending=undefined;assert.deepEqual(await seeded.snapshot(),before,`${mode} changes no target data`);
    if(mode==='membership')assert.equal((await admin.from('operations_memberships').update({role:'recovery_manager'}).eq('id',f.membership)).error,null);
    if(mode==='owner')assert.equal((await admin.from('projects').update({user_id:f.owner.id}).eq('id',f.project)).error,null);
   }
  }finally{release();await db.query('rollback');if(pending)await Promise.allSettled([pending]);await db.end();}
 });
 test('real internal target and completion commit together and lost replies reconcile one durable effect',{timeout:60000},async t=>{
  const f=await fixture(t),lost=await f.seed('schedule_maintenance');let dropped=false;
  const client:SupabaseClient=new Proxy(admin,{get(target,key){if(key==='rpc')return async(name:string,args:Row)=>{
   const result=await target.rpc(name,args);
   if(name==='mutate_operations_internal_target'&&!dropped){assert.equal(result.error,null);assert.equal(result.data.completion.status,'verified');dropped=true;throw new Error('Synthetic lost reply after actual commit');}
   return result;
  };const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
  await assert.rejects(new OperationsService(client).executeAction(f.owner.id,lost.action.id),{code:'unknown',statusCode:503});assert.equal(dropped,true);
  const committed=await admin.from('operations_actions').select('*').eq('id',lost.action.id).single();assert.equal(committed.error,null);assert.equal(committed.data!.status,'verified');
  const replay=await request(`/api/operations/actions/${lost.action.id}/execute`,f.owner.token,'POST',{});assert.equal(replay.status,200);assert.deepEqual(((await replay.json()) as {action:Row}).action,committed.data);
  const windows=await admin.from('operations_maintenance_windows').select('id,user_id,project_id').eq('environment_id',lost.target);assert.equal(windows.error,null);assert.equal(windows.data?.length,1);assert.equal(windows.data![0].user_id,f.owner.id);assert.equal(windows.data![0].project_id,f.project);
  const runs=await admin.from('operations_action_runs').select('attempt,status,evidence_reference').eq('action_id',lost.action.id);assert.equal(runs.error,null);assert.deepEqual(runs.data,[{attempt:1,status:'verified',evidence_reference:committed.data!.evidence_reference}]);
  const rollback=await f.seed('acknowledge_incident'),before=await rollback.snapshot(),db=connect(),constraint=`fixture_late_effect_${randomUUID().replaceAll('-','')}`;await db.connect();
  try{
   await db.query(`alter table operations_action_runs add constraint ${constraint} check(action_id<>'${rollback.action.id}'::uuid or status<>'verified') not valid`);
   const failed=await request(`/api/operations/actions/${rollback.action.id}/execute`,f.owner.token,'POST',{});assert.equal(failed.status,200);assert.equal(((await failed.json()) as {action:Row}).action.status,'failed');assert.deepEqual(await rollback.snapshot(),before);
   const evidence=await admin.from('production_evidence').select('status').eq('action_id',rollback.action.id);assert.equal(evidence.error,null);assert.deepEqual(evidence.data,[{status:'degraded'}]);
  }finally{await db.query(`alter table operations_action_runs drop constraint if exists ${constraint}`);await db.end();}
  const recovered=await request(`/api/operations/actions/${rollback.action.id}/execute`,f.owner.token,'POST',{});assert.equal(recovered.status,200);const action=((await recovered.json()) as {action:Row}).action;assert.equal(action.status,'verified');assert.equal(action.attempt_count,2);assert.equal((await rollback.snapshot()).version,2);
 });
}
