import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import pg from 'pg';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {persistBuildRun,type BuildPersistInput} from '../services/memory/buildPersistence.js';
import {getPreviousBuilds} from '../services/memory/buildMemory.js';
import {createTenantContext} from './tenantContext.js';

/** Existing dormant exports, actual Auth/database. No pipeline or provider run. */
export function registerLegacyBuildHistoryTests(admin:SupabaseClient,getUsers:()=>readonly {id:string;token:string}[]):void{
 test('real legacy build history requires issued owners and exact insert receipts without overwriting foreign runs',async t=>{
  assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
  const [owner,other]=getUsers(),contexts=[owner,other].map(a=>createTenantContext({userId:a.id,via:'persisted_owner'})),projects=[randomUUID(),randomUUID()],runs:string[]=[],marker=`legacy-owner-${randomUUID()}`;
  t.after(async()=>{if(runs.length)assert.equal((await admin.from('swarm_runs').delete().in('id',runs)).error,null);assert.equal((await admin.from('projects').delete().in('id',projects)).error,null);});
  for(const[n,actor]of [owner,other].entries())assert.equal((await admin.from('projects').insert({id:projects[n],user_id:actor.id,name:marker+':'+n,type:'app'})).error,null);
  const input=(n:number,id:string=randomUUID()):BuildPersistInput=>({userId:[owner,other][n].id,runId:id,projectId:projects[n],prompt:`Build a ${marker}-${n} website`,featureCategory:'landing_page',success:true,polishedReply:marker+':'+n,featureOutput:{type:'landing_page',html:'<p>Synthetic local history</p>',css:'',js:'',heroImageUrl:'',deployUrl:'',deployVerified:false,projectName:marker+':'+n,summary:marker+':'+n},messagesSnapshot:[{role:'user',content:'Synthetic history only'}]});
  const original=[input(0),input(1)];
  for(const[n,row]of original.entries()){runs.push(row.runId!);assert.equal(await persistBuildRun(contexts[n],row),row.runId);}
  const snapshot=async()=>{const r=await admin.from('swarm_runs').select('*').in('id',runs).order('id');assert.equal(r.error,null);return r.data!;};const before=await snapshot();
  assert.equal(before.length,2);for(const[n,row]of original.entries()){const stored=before.find(r=>r.id===row.runId)!;assert.equal(stored.user_id,row.userId);assert.equal(stored.project_id,row.projectId);assert.equal(stored.prompt,row.prompt);assert.equal(stored.status,'completed');assert.deepEqual(stored.output.messagesSnapshot,row.messagesSnapshot);assert.equal(stored.output.polishedReply,row.polishedReply);}
  for(const[n,actor]of [owner,other].entries()){
   const history=await getPreviousBuilds(contexts[n],100);assert.ok(history.some(h=>h.projectName===marker+':'+n));assert.ok(!history.some(h=>h.projectName===marker+':'+(1-n)));
   await assert.rejects(getPreviousBuilds({...contexts[n]}),{status:401});await assert.rejects(persistBuildRun(contexts[n],{...original[n],userId:[owner,other][1-n].id}),{status:404});
   for(const row of original)await assert.rejects(persistBuildRun(contexts[n],{...input(n,row.runId),polishedReply:'MUST_NOT_REPLACE'}),{status:503});
   const client:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${actor.token}`}}});
   const denied=await client.from('swarm_runs').insert({id:randomUUID(),user_id:[owner,other][1-n].id,project_id:projects[1-n],prompt:'FOREIGN_BROWSER_MUST_FAIL',status:'completed'});assert.equal(denied.error?.code,'42501');
  }
  assert.deepEqual(await snapshot(),before);
  const own=input(0);runs.push(own.runId!);const competing=await Promise.allSettled([persistBuildRun(contexts[0],own),persistBuildRun(contexts[0],own)]);assert.equal(competing.filter(r=>r.status==='fulfilled').length,1);assert.equal(competing.filter(r=>r.status==='rejected').length,1);const persisted=await admin.from('swarm_runs').select('id,user_id,project_id').eq('id',own.runId).single();assert.equal(persisted.error,null);assert.deepEqual(persisted.data,{id:own.runId,user_id:owner.id,project_id:projects[0]});
 });
 test('real legacy history insert waits for current project ownership and leaves no false persistence receipt after transfer or rollback',async t=>{
  assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
  const [owner,other]=getUsers(),context=createTenantContext({userId:owner.id,via:'persisted_owner'}),project=randomUUID(),run=randomUUID();
  t.after(async()=>{assert.equal((await admin.from('swarm_runs').delete().eq('id',run)).error,null);assert.equal((await admin.from('projects').delete().eq('id',project)).error,null);});
  assert.equal((await admin.from('projects').insert({id:project,user_id:owner.id,name:'Legacy writer current owner',type:'app'})).error,null);
  const url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/postgres');const db=new pg.Client({connectionString:url.href,ssl:false});await db.connect();let pending:Promise<string>|undefined;
  const row:BuildPersistInput={userId:owner.id,projectId:project,runId:run,prompt:'Build a synthetic website',featureCategory:'landing_page',success:false,polishedReply:'No provider was executed'};
  try{
   await db.query('begin');await db.query('select id from projects where id=$1 for update',[project]);pending=persistBuildRun(context,row);void pending.catch(()=>{});
   let blocked=false;for(let n=0;n<150;n++){await db.query('select pg_stat_clear_snapshot()');const activity=await db.query("select pid from pg_stat_activity where pid<>pg_backend_pid() and pg_backend_pid()=any(pg_blocking_pids(pid)) and wait_event_type='Lock' and query like '%swarm_runs%'");if(activity.rowCount){blocked=true;break;}await delay(20);}assert.equal(blocked,true,'Actual insert reached held project owner lock');
   await db.query('update projects set user_id=$2 where id=$1',[project,other.id]);await db.query('commit');await assert.rejects(pending,{status:503,code:'RESOURCE_ACCESS_UNAVAILABLE'});pending=undefined;
   const absent=await admin.from('swarm_runs').select('id').eq('id',run);assert.equal(absent.error,null);assert.deepEqual(absent.data,[]);
   await db.query('update projects set user_id=$2 where id=$1',[project,owner.id]);
   await db.query('begin');await db.query(`alter table swarm_runs add constraint fixture_legacy_writer_rollback check(id<>'${run}'::uuid) not valid`);
   await db.query('commit');try{await assert.rejects(persistBuildRun(context,row),{status:503});assert.deepEqual((await admin.from('swarm_runs').select('id').eq('id',run)).data,[]);}finally{await db.query('alter table swarm_runs drop constraint fixture_legacy_writer_rollback');}
   assert.equal(await persistBuildRun(context,row),run);const saved=await admin.from('swarm_runs').select('id,user_id,project_id,status').eq('id',run).single();assert.equal(saved.error,null);assert.deepEqual(saved.data,{id:run,user_id:owner.id,project_id:project,status:'failed'});
  }finally{await db.query('rollback');if(pending)await Promise.allSettled([pending]);await db.end();}
 });
}
