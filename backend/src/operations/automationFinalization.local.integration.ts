import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {test,type TestContext} from 'node:test';
import pg from 'pg';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {OperationsService} from './operationsService.js';

type Row=Record<string,any>;
export function registerAutomationFinalizationTests(admin:SupabaseClient,getUsers:()=>readonly {id:string;project:string;token:string}[]):void{
 const connect=()=>{
  assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
  const url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/postgres');return new pg.Client({connectionString:url.href,ssl:false});
 };
 const fixture=async(t:TestContext)=>{
  const[owner,other]=getUsers(),project=randomUUID(),membership=randomUUID(),ruleIds:string[]=[];
  t.after(async()=>{
   if(ruleIds.length){
    const runs=await admin.from('operations_automation_runs').select('id').in('rule_id',ruleIds);assert.equal(runs.error,null);
    if(runs.data!.length)assert.equal((await admin.from('operations_actions').delete().in('idempotency_key',runs.data!.map((row:Row)=>row.id))).error,null);
    assert.equal((await admin.from('operations_automation_rules').delete().in('id',ruleIds)).error,null);
   }
   assert.equal((await admin.from('projects').delete().eq('id',project)).error,null);
  });
  assert.equal((await admin.from('projects').insert({id:project,user_id:owner.id,name:'Disposable automation finalization',type:'app'})).error,null);
  assert.equal((await admin.from('operations_memberships').insert({id:membership,user_id:owner.id,project_id:project,member_user_id:other.id,role:'operator',created_by:owner.id})).error,null);
  const seed=async()=>{
   const id=randomUUID(),result=await admin.from('operations_automation_rules').insert({id,user_id:owner.id,project_id:project,rule_key:id,name:'Pending approved action fixture',trigger_type:id,
    action_type:'resume_automation',risk_level:'high',conditions:{level:'original'},exclusions:{},rate_limit:{maxRuns:10,windowSeconds:60},enabled:true}).select('*').single();assert.equal(result.error,null);assert.ok(result.data);
   ruleIds.push(id);return{rule:result.data as Row,signal:{triggerType:id,triggerId:randomUUID(),targetType:'automation',targetId:project,targetVersion:1,attributes:{level:'original'},evidenceReference:'owned-finalization-fixture'}};
  };
  const rows=async(table:string,ruleId:string)=>{const r=await admin.from(table).select('*').eq(table==='operations_automation_runs'?'rule_id':'project_id',table==='operations_automation_runs'?ruleId:project);assert.equal(r.error,null);return r.data as Row[];};
  const proof=async(ruleId:string,runId:string,actor:string)=>{
   const runs=await rows('operations_automation_runs',ruleId);assert.equal(runs.length,1);const run=runs[0];assert.equal(run.id,runId);assert.equal(run.user_id,owner.id);assert.equal(run.rule_id,ruleId);assert.equal(run.status,'approval_required');assert.equal(run.safe_error,null);assert.equal(run.completed_at,null);
   const action=await admin.from('operations_actions').select('*').eq('id',run.action_id).single();assert.equal(action.error,null);assert.equal(action.data!.user_id,owner.id);assert.equal(action.data!.project_id,project);assert.equal(action.data!.requested_by,actor);assert.equal(action.data!.idempotency_key,run.id);assert.equal(action.data!.attempt_count,0);assert.equal(action.data!.status,'approval_required');
   const allActions=await admin.from('operations_actions').select('id').eq('idempotency_key',run.id);assert.equal(allActions.error,null);assert.deepEqual(allActions.data,[{id:action.data!.id}]);
   const audits=await admin.from('production_audit_log').select('user_id,actor_id,project_id,target_type,target_id,outcome,correlation_id,evidence_reference').eq('action','operations.automation.evaluated').eq('target_id',run.id);assert.equal(audits.error,null);
   assert.deepEqual(audits.data,[{user_id:owner.id,actor_id:actor,project_id:project,target_type:'automation_run',target_id:run.id,outcome:'approval_required',correlation_id:run.trigger_digest,evidence_reference:'owned-finalization-fixture'}]);
   const executions=await admin.from('operations_action_runs').select('id').eq('action_id',run.action_id);assert.equal(executions.error,null);assert.deepEqual(executions.data,[]);return run;
  };
  return{owner,other,project,membership,seed,rows,proof};
 };
 test('real automation links and audits one exact admitted action across concurrency and lost creation or finalization replies',{timeout:60000},async t=>{
  const f=await fixture(t),service=new OperationsService(admin);
  for(const mode of ['concurrent','creation_reply','finalization_reply','member']){
   const seeded=await f.seed();let dropped=false;
   const client:SupabaseClient=new Proxy(admin,{get(target,key){if(key==='rpc')return async(name:string,args:Row)=>{
    const result=await target.rpc(name,args);if(!dropped&&((mode==='creation_reply'&&name==='create_operations_action')||(mode==='finalization_reply'&&name==='finalize_operations_automation_run'))){assert.equal(result.error,null);dropped=true;throw new Error('Synthetic lost reply after real committed operation');}return result;
   };const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
   let run:Row;
   if(mode==='concurrent'){
    const results=await Promise.all([0,1].map(()=>service.evaluateAutomationSignal(f.owner.id,f.project,seeded.signal)));assert.equal(results[0][0].id,results[1][0].id);run=results[0][0];
   }else if(mode==='member'){
    run=(await service.evaluateAutomationSignal(f.other.id,f.project,seeded.signal))[0];
   }else{
    await assert.rejects(new OperationsService(client).evaluateAutomationSignal(f.owner.id,f.project,seeded.signal),{code:'unknown',statusCode:503});assert.equal(dropped,true);
    const pending=await f.rows('operations_automation_runs',seeded.rule.id);assert.equal(pending.length,1);assert.equal(pending[0].status,mode==='creation_reply'?'evaluating':'approval_required');
    run=(await service.evaluateAutomationSignal(f.owner.id,f.project,seeded.signal))[0];assert.equal(run.id,pending[0].id);
   }
   const verified=await f.proof(seeded.rule.id,run.id,mode==='member'?f.other.id:f.owner.id);
   assert.deepEqual((await service.evaluateAutomationSignal(f.owner.id,f.project,seeded.signal))[0],verified);
  }
  const foreign=await f.seed();assert.equal((await admin.from('operations_memberships').update({role:'viewer'}).eq('id',f.membership)).error,null);
  await assert.rejects(service.evaluateAutomationSignal(f.other.id,f.project,foreign.signal),{code:'forbidden'});assert.deepEqual(await f.rows('operations_automation_runs',foreign.rule.id),[]);
  for(const token of [undefined,f.owner.token]){
   const browser:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{})});
   const denied=await browser.rpc('finalize_operations_automation_run',{p_actor:f.owner.id,p_owner:f.owner.id,p_project:f.project,p_expected_rule:foreign.rule,p_expected_run:{},p_attributes:{},p_action:null,p_environment:null});assert.equal(denied.error?.code,'42501');
  }
 });
 test('real automation finalization rechecks locked current parents and rolls back links when its required audit fails',{timeout:60000},async t=>{
  const f=await fixture(t),db=connect(),constraints:string[]=[];await db.connect();let pending:Promise<Row[]>|undefined,release:()=>void=()=>{};
  t.after(async()=>{if(constraints.length){const cleanup=connect();await cleanup.connect();try{for(const name of constraints)await cleanup.query(`alter table production_audit_log drop constraint if exists ${name}`);}finally{await cleanup.end();}}});
  try{
   for(const mode of ['membership','project','rule_version','rule_owner','run_owner','action_owner','audit_failure']){
    const seeded=await f.seed(),actor=mode==='membership'?f.other:f.owner;let args:Row|undefined,entered!:()=>void;
    const observed=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);
    const client:SupabaseClient=new Proxy(admin,{get(target,key){if(key==='rpc')return async(name:string,input:Row)=>{
     if(name==='finalize_operations_automation_run'){args=input;entered();await gate;}return target.rpc(name,input);
    };const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
    pending=new OperationsService(client).evaluateAutomationSignal(actor.id,f.project,seeded.signal);void pending.catch(()=>{});
    await Promise.race([observed,pending.then(()=>assert.fail('Service must reach the actual finalization RPC'))]);assert.ok(args);
    const run=args.p_expected_run as Row,action=args.p_action as Row;assert.ok(action);const constraint=`fixture_automation_audit_${randomUUID().replaceAll('-','')}`;
    if(mode==='audit_failure'){
     constraints.push(constraint);await db.query(`alter table production_audit_log add constraint ${constraint} check(action<>'operations.automation.evaluated' or target_id<>'${run.id}') not valid`);release();
    }else{
     await db.query('begin');await db.query('select id from profiles where id=$1 for update',[actor.id]);release();
     let blocked=false;for(let n=0;n<150;n++){await db.query('select pg_stat_clear_snapshot()');const wait=await db.query("select pid from pg_stat_activity where pid<>pg_backend_pid() and pg_backend_pid()=any(pg_blocking_pids(pid)) and wait_event_type='Lock' and query like '%finalize_operations_automation_run%'");if(wait.rowCount){blocked=true;break;}await delay(20);}assert.equal(blocked,true,`${mode} reached held current authority lock`);
     if(mode==='membership')assert.equal((await admin.from('operations_memberships').update({role:'viewer'}).eq('id',f.membership)).error,null);
     if(mode==='project')assert.equal((await admin.from('projects').update({user_id:f.other.id}).eq('id',f.project)).error,null);
     if(mode==='rule_version')assert.equal((await admin.from('operations_automation_rules').update({version:2}).eq('id',seeded.rule.id)).error,null);
     if(mode==='rule_owner')assert.equal((await admin.from('operations_automation_rules').update({user_id:f.other.id,project_id:f.other.project}).eq('id',seeded.rule.id)).error,null);
     if(mode==='run_owner')assert.equal((await admin.from('operations_automation_runs').update({user_id:f.other.id}).eq('id',run.id)).error,null);
     if(mode==='action_owner')assert.equal((await admin.from('operations_actions').update({user_id:f.other.id,project_id:f.other.project}).eq('id',action.id)).error,null);
     await db.query('commit');
    }
    await assert.rejects(pending,{code:'unknown',statusCode:503});pending=undefined;
    const stored=await admin.from('operations_automation_runs').select('id,user_id,rule_id,trigger_digest,status,action_id').eq('id',run.id).single();assert.equal(stored.error,null);assert.deepEqual(stored.data,{id:run.id,user_id:mode==='run_owner'?f.other.id:f.owner.id,rule_id:seeded.rule.id,trigger_digest:run.trigger_digest,status:'evaluating',action_id:null});
    const audits=await admin.from('production_audit_log').select('id').eq('action','operations.automation.evaluated').eq('target_id',run.id);assert.equal(audits.error,null);assert.deepEqual(audits.data,[]);
    if(mode==='audit_failure'){
     await db.query(`alter table production_audit_log drop constraint ${constraint}`);const recovered=(await new OperationsService(admin).evaluateAutomationSignal(f.owner.id,f.project,seeded.signal))[0];assert.equal(recovered.id,run.id);assert.equal(recovered.action_id,action.id);await f.proof(seeded.rule.id,run.id,f.owner.id);
    }
    if(mode==='membership')assert.equal((await admin.from('operations_memberships').update({role:'operator'}).eq('id',f.membership)).error,null);
    if(mode==='project')assert.equal((await admin.from('projects').update({user_id:f.owner.id}).eq('id',f.project)).error,null);
   }
  }finally{release();await db.query('rollback');if(pending)await Promise.allSettled([pending]);await db.end();}
 });
}
