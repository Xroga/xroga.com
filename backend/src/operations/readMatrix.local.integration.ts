import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {SupabaseClient} from '@supabase/supabase-js';

type Actor={id:string;token:string};
type Row=Record<string,any>;
type Request=(path:string,token?:string,method?:string,body?:unknown)=>Promise<Response>;

/** Actual read-only API and persistence, never an operational provider action. */
export function registerOperationsReadMatrixTests(admin:SupabaseClient,getUsers:()=>readonly Actor[],request:Request):void{
 test('real operations and growth read matrix returns exact owned children and denies foreign projects forged identity and revoked membership',async t=>{
  assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
  const [owner,other]=getUsers(),projects=[randomUUID(),randomUUID(),randomUUID()],now=new Date().toISOString();
  t.after(async()=>{for(const id of projects)assert.equal((await admin.from('projects').delete().eq('id',id)).error,null);});
  const fixtures:{owner:string;project:string;label:string;rows:Map<string,Row>}[]=[],extraRows:{table:string;row:Row}[]=[];
  const add=async(table:string,row:Row)=>{const r=await admin.from(table).insert(row).select('*').single();assert.equal(r.error,null,`${table}: ${r.error?.message}`);assert.ok(r.data);return r.data as Row;};
  for(let index=0;index<3;index++){
   const actor=index===1?other:owner,project=projects[index],label=`read-matrix-${index}-${randomUUID()}`,rows=new Map<string,Row>();
   await add('projects',{id:project,user_id:actor.id,name:label,type:'app'});
   const common={user_id:actor.id,project_id:project},env=await add('operations_environments',{...common,environment_key:label,environment_type:'test',observed_release_id:`release-${label}`,observed_commit_sha:`commit-${label}`});rows.set('operations_environments',env);
   rows.set('operations_resources',await add('operations_resources',{...common,environment_id:env.id,kind:'service',name:label,source:'disposable_read_fixture',evidence_reference:`resource:${label}`}));
   rows.set('production_releases',await add('production_releases',{...common,id:`release-${label}`,environment:'preview',state:'created',commit_sha:`commit-${label}`,artifact_digest:`digest-${label}`,manifest:{synthetic:true}}));
   rows.set('deployment_status',await add('deployment_status',{...common,target:'github',status:'failed',verification_state:'unavailable',method:'DISPOSABLE_READ_FIXTURE_NO_DEPLOYMENT'}));
   rows.set('production_incidents',await add('production_incidents',{...common,title:label,severity:'low',status:'open'}));
   rows.set('operations_alerts',await add('operations_alerts',{...common,source:'disposable_read_fixture',rule_key:label,severity:'low',status:'active',deduplication_key:label,first_observed_at:now,last_observed_at:now}));
   const action=await add('operations_actions',{...common,requested_by:actor.id,action_type:'resume_automation',target_type:'automation',target_id:project,permission_required:'manage_automation',risk_level:'high',status:'approval_required',idempotency_key:label,target_version:1,action_plan_digest:'a'.repeat(64)});rows.set('operations_actions',action);
   rows.set('operations_action_approvals',await add('operations_action_approvals',{action_id:action.id,user_id:actor.id,requester_id:actor.id,required_role:'recovery_manager',decision:'pending',target_version:1,action_plan_digest:action.action_plan_digest,expires_at:new Date(Date.now()+600000).toISOString()}));
   rows.set('swarm_job_queue',await add('swarm_job_queue',{...common,run_id:randomUUID(),prompt:'Disposable read fixture, no execution',status:'failed'}));
   rows.set('webhook_deliveries',await add('webhook_deliveries',{...common,provider:'disposable_read_fixture',delivery_id:label,payload_digest:'b'.repeat(64),status:'failed'}));
   rows.set('operations_maintenance_windows',await add('operations_maintenance_windows',{...common,environment_id:env.id,owner_id:actor.id,starts_at:now,ends_at:new Date(Date.now()+600000).toISOString(),reason:label}));
   const rule=await add('operations_automation_rules',{...common,rule_key:label,name:label,trigger_type:'disposable_read_fixture',risk_level:'low',action_type:'refresh_health',enabled:false});rows.set('operations_automation_rules',rule);
   rows.set('operations_automation_runs',await add('operations_automation_runs',{user_id:actor.id,rule_id:rule.id,trigger_digest:label,status:'blocked',action_id:action.id}));
   rows.set('operations_config_checks',await add('operations_config_checks',{...common,environment_id:env.id,variable_name:'SYNTHETIC_CONFIGURATION_NAME_ONLY',provider:'fixture',present:false,validation_status:'missing'}));
   rows.set('operations_slo_snapshots',await add('operations_slo_snapshots',{...common,objective_key:label,status:'not_configured',source:'disposable_read_fixture'}));
   rows.set('production_evidence',await add('production_evidence',{...common,id:`evidence-${label}`,kind:'disposable_read_fixture',source:'synthetic',status:'unknown',summary:label}));
   rows.set('production_audit_log',await add('production_audit_log',{...common,actor_id:actor.id,action:'fixture.read_only',target_type:'fixture',target_id:project,outcome:'fixture',reason:label}));
   const growth={tenant_id:actor.id,project_id:project};
   rows.set('growth_lifecycle_state',await add('growth_lifecycle_state',{...growth,subject_type:'user',subject_id:actor.id,lifecycle_state:'activated',evidence_reference:label}));
   rows.set('growth_recommendations',await add('growth_recommendations',{...growth,recommendation_type:'continue_activation',priority:80,status:'proposed',rationale:label,evidence_reference:label}));
   const segment=await add('growth_segments',{...growth,name:label,definition:{lifecycleStates:['activated']},status:'active'});rows.set('growth_segments',segment);
   const campaign=await add('growth_campaigns',{...growth,segment_id:segment.id,name:label,channel:'in_app',status:'approval_required',template_key:'fixture'});rows.set('growth_campaigns',campaign);
   rows.set('growth_messages',await add('growth_messages',{...growth,campaign_id:campaign.id,recipient_user_id:actor.id,channel:'in_app',provider:'xroga',template_key:'fixture',recipient_hash:label,idempotency_key:randomUUID(),status:'suppressed',consent_state:'granted'}));
   const experiment=await add('growth_experiments',{...growth,key:label,status:'running',variants:[{key:'a',weight:1},{key:'b',weight:1}],allocation_seed:'fixture',minimum_sample_size:2});rows.set('growth_experiments',experiment);
   const event=await add('analytics_events',{...growth,user_id:actor.id,experiment_id:experiment.id,event_type:'identity.linked.v1',environment:'test',idempotency_key:randomUUID(),consent_state:'granted',source:'disposable_read_fixture'});rows.set('analytics_events',event);
   rows.set('growth_attribution_touches',await add('growth_attribution_touches',{...growth,user_id:actor.id,touch_type:'unknown',evidence_reference:label}));
   for(const variant of ['a','b']){
    const assignment=await add('growth_experiment_assignments',{experiment_id:experiment.id,tenant_id:actor.id,subject_key:`${label}-${variant}`,variant,exposed_at:now});extraRows.push({table:'growth_experiment_assignments',row:assignment});
    for(let n=0;n<(variant==='a'?2:1);n++)extraRows.push({table:'growth_experiment_outcomes',row:await add('growth_experiment_outcomes',{experiment_id:experiment.id,assignment_id:assignment.id,event_id:event.id,metric_key:`metric-${variant}-${n}`})});
   }
   fixtures.push({owner:actor.id,project,label,rows});
  }
  const [own,foreign,sameOwnerOtherProject]=fixtures;
  // Model a pre-existing corrupt service-owned cohort, not a browser exploit.
  // Result aggregation must still use only assignments of the authorized tenant.
  const misbound=await add('growth_experiment_assignments',{experiment_id:own.rows.get('growth_experiments')!.id,tenant_id:other.id,subject_key:randomUUID(),variant:'FOREIGN_COHORT_CANARY',exposed_at:now});extraRows.push({table:'growth_experiment_assignments',row:misbound});
  for(let n=0;n<5;n++)extraRows.push({table:'growth_experiment_outcomes',row:await add('growth_experiment_outcomes',{experiment_id:own.rows.get('growth_experiments')!.id,assignment_id:misbound.id,event_id:foreign.rows.get('analytics_events')!.id,metric_key:`foreign-metric-${n}`})});
  const snapshot=async()=>{const rows:Row[]=[];for(const{table,row}of [...fixtures.flatMap(f=>[...f.rows].map(([table,row])=>({table,row}))),...extraRows]){const key=table==='webhook_deliveries'?'delivery_id':'id';const r=await admin.from(table).select('*').eq(key,row[key]).single();assert.equal(r.error,null);rows.push({table,value:r.data});}return rows;};
  const before=await snapshot();
  const ids=(rows:Row[],key='id')=>rows.map(r=>r[key]).sort();
  const exact=(rows:Row[],table:string,key='id')=>assert.deepEqual(ids(rows,key),[own.rows.get(table)![key]],table);
  const routes=[
   {path:`/products/${own.project}`,check:(body:Row)=>{
    assert.equal(body.project.id,own.project);assert.equal(body.project.name,own.label);
    for(const[field,table,key]of [['environments','operations_environments','id'],['resources','operations_resources','id'],['releases','production_releases','id'],['deployments','deployment_status','id'],['incidents','production_incidents','id'],['alerts','operations_alerts','id'],['actions','operations_actions','id'],['approvals','operations_action_approvals','id'],['jobs','swarm_job_queue','id'],['webhooks','webhook_deliveries','delivery_id'],['maintenance','operations_maintenance_windows','id']])exact(body[field],table,key);
   }},
   {path:`/resources?projectId=${own.project}`,check:(b:Row)=>exact(b.resources,'operations_resources')},
   {path:`/configuration?projectId=${own.project}`,check:(b:Row)=>exact(b.configuration,'operations_config_checks')},
   {path:`/slo?projectId=${own.project}`,check:(b:Row)=>exact(b.snapshots,'operations_slo_snapshots')},
   {path:`/actions?projectId=${own.project}`,check:(b:Row)=>exact(b.actions,'operations_actions')},
   {path:`/automation?projectId=${own.project}`,check:(b:Row)=>{exact(b.rules,'operations_automation_rules');exact(b.runs,'operations_automation_runs');}},
   {path:`/audit?projectId=${own.project}`,check:(b:Row)=>exact(b.events,'production_audit_log')},
   {path:`/evidence?projectId=${own.project}`,check:(b:Row)=>exact(b.evidence,'production_evidence')},
  ];
  const read=async(path:string,token:string)=>{const response=await request(`/api/operations${path}${path.includes('?')?'&':'?'}userId=${other.id}&tenantId=${other.id}`,token);assert.equal(response.status,200,path);return await response.json() as Row;};
  const growthPaths=[`/api/growth/overview?projectId=${own.project}`,`/api/growth/experiments/${own.rows.get('growth_experiments')!.id}/result`];
  const checkGrowth=async(token:string)=>{
   const overview=await request(`${growthPaths[0]}&userId=${other.id}&tenantId=${other.id}`,token);assert.equal(overview.status,200);const body=await overview.json() as Row;
   for(const[field,table]of [['lifecycle','growth_lifecycle_state'],['recommendations','growth_recommendations'],['campaigns','growth_campaigns'],['messages','growth_messages'],['segments','growth_segments'],['experiments','growth_experiments'],['attribution','growth_attribution_touches'],['events','analytics_events']])exact(body[field],table);
   assert.ok(!JSON.stringify(body).includes(foreign.label));assert.ok(!JSON.stringify(body).includes(sameOwnerOtherProject.label));
   const result=await request(`${growthPaths[1]}?userId=${other.id}`,token);assert.equal(result.status,200);assert.deepEqual(await result.json(),{status:'measured',winner:'a'},'Misbound foreign assignment/outcomes cannot change the owned experiment winner');
  };
  await checkGrowth(owner.token);
  for(const path of growthPaths){assert.equal((await request(path)).status,401);assert.equal((await request(path,other.token)).status,403);}
  assert.equal((await request(`/api/growth/experiments/${foreign.rows.get('growth_experiments')!.id}/result`,owner.token)).status,403);
  for(const route of routes){
   const body=await read(route.path,owner.token);route.check(body);
   for(const hidden of [foreign,sameOwnerOtherProject])assert.ok(!JSON.stringify(body).includes(hidden.label),`No other project children in ${route.path}`);
   assert.equal((await request(`/api/operations${route.path}`)).status,401);
   assert.equal((await request(`/api/operations${route.path}`,other.token)).status,403);
   assert.equal((await request(`/api/operations${route.path.replace(own.project,foreign.project)}`,owner.token)).status,403);
  }
  const portfolio=await read('/portfolio',owner.token);
  for(const f of [own,sameOwnerOtherProject]){
   const product=portfolio.products.find((p:Row)=>p.id===f.project);assert.ok(product);assert.equal(product.name,f.label);assert.equal(product.primaryEnvironment,f.label);assert.equal(product.currentRelease,`release-${f.label}`);assert.equal(product.runningCommit,`commit-${f.label}`);assert.equal(product.incidentCount,1);assert.equal(product.alertCount,1);assert.equal(product.pendingApprovals,1);assert.ok(product.evidenceReferences.includes(`resource:${f.label}`));
  }
  assert.ok(!JSON.stringify(portfolio).includes(foreign.label));
  const membership=await add('operations_memberships',{user_id:owner.id,project_id:own.project,member_user_id:other.id,role:'viewer',created_by:owner.id});
  for(const route of routes)route.check(await read(route.path,other.token));
  await checkGrowth(other.token);
  const memberPortfolio=await read('/portfolio',other.token);assert.ok(memberPortfolio.products.some((p:Row)=>p.id===own.project));assert.ok(!memberPortfolio.products.some((p:Row)=>p.id===sameOwnerOtherProject.project));
  assert.equal((await admin.from('operations_memberships').delete().eq('id',membership.id)).error,null);
  for(const route of routes)assert.equal((await request(`/api/operations${route.path}`,other.token)).status,403,'Same JWT loses the revoked membership');
  for(const path of growthPaths)assert.equal((await request(path,other.token)).status,403,'Same JWT loses growth read membership');
  const revokedPortfolio=await read('/portfolio',other.token);assert.ok(!revokedPortfolio.products.some((p:Row)=>p.id===own.project));
  assert.deepEqual(await snapshot(),before,'All allowed and denied reads preserve exact fixture records');
 });
}
