import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import pg from 'pg';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
type User={id:string;token:string};
export function registerProjectCreationTests(admin:SupabaseClient,getUsers:()=>readonly User[]):void{
  const guard=()=>{assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');assert.equal(process.env.E2E_BACKEND_URL,'http://127.0.0.1:4000');};
  test('real project saves serialize repository identity and atomically retain required children',async(t)=>{
    guard();const [owner,other]=getUsers(),repo=`fixture/${randomUUID()}`;
    t.after(async()=>{
      const rows=await admin.from('projects').select('id').in('user_id',[owner.id,other.id]).eq('github_repo_name',repo);assert.equal(rows.error,null);
      const ids=rows.data!.map(row=>row.id);if(ids.length){assert.equal((await admin.from('activity_logs').delete().in('project_id',ids)).error,null);assert.equal((await admin.from('projects').delete().in('id',ids)).error,null);}
    });
    const input={name:'Atomic create fixture',type:'app',github_repo_name:repo,user_prompt:'Synthetic retained message'};
    const save=(actor:User)=>fetch(`${process.env.E2E_BACKEND_URL}/api/projects`,{method:'POST',headers:{authorization:`Bearer ${actor.token}`,'content-type':'application/json'},body:JSON.stringify({...input,user_id:other.id})});
    const responses=await Promise.all([save(owner),save(owner)]);assert.deepEqual(responses.map(row=>row.status).sort(),[200,201]);
    const bodies=await Promise.all(responses.map(row=>row.json() as Promise<{id:string;user_id:string}>));assert.equal(bodies[0].id,bodies[1].id);assert.ok(bodies.every(row=>row.user_id===owner.id));
    const id=bodies[0].id;
    const messages=await admin.from('project_messages').select('content,role').eq('project_id',id);assert.equal(messages.error,null);assert.equal(messages.data?.length,2);assert.ok(messages.data?.every(row=>row.content===input.user_prompt&&row.role==='user'));
    const audit=await admin.from('activity_logs').select('user_id,action').eq('project_id',id);assert.equal(audit.error,null);assert.deepEqual(audit.data,[{user_id:owner.id,action:'created_project'}]);
    const foreign=await save(other);assert.equal(foreign.status,201);assert.notEqual((await foreign.json() as {id:string}).id,id);
    for(const token of [undefined,owner.token]){
      const browser=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{})});
      assert.equal((await browser.rpc('save_owned_project_atomic',{p_owner_id:owner.id,p_project:input})).error?.code,'42501');
    }
    const malformed=await admin.rpc('save_owned_project_atomic',{p_owner_id:owner.id,p_project:{...input,user_id:other.id}});assert.equal(malformed.error?.code,'22023');
  });
  test('real project save rolls back new and existing project changes on child receipt failure',async()=>{
    guard();const url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/postgres');
    const db=new pg.Client({connectionString:url.href,ssl:false});await db.connect();
    try{
      await db.query('begin');const owner=randomUUID(),existing=randomUUID();
      await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{}')",[owner,`project-${owner}@example.invalid`]);
      await db.query("insert into projects(id,user_id,name,type,github_repo_name) values($1,$2,'Original','app','fixture/existing')",[existing,owner]);
      await db.query("alter table project_messages add constraint fixture_project_message_failure check(content <> 'force-failure') not valid");
      for(const repo of ['fixture/new','fixture/existing']){
        await db.query('savepoint attempt');
        await assert.rejects(db.query('select save_owned_project_atomic($1,$2)',[owner,JSON.stringify({name:'Changed',type:'app',github_repo_name:repo,user_prompt:'force-failure'})]),{code:'23514'});
        await db.query('rollback to savepoint attempt');
        const projects=await db.query('select id,name from projects where user_id=$1',[owner]);assert.deepEqual(projects.rows,[{id:existing,name:'Original'}]);
        assert.equal((await db.query('select id from project_messages where project_id=$1',[existing])).rowCount,0);
      }
      await db.query("alter table activity_logs add constraint fixture_project_activity_failure check(action <> 'created_project') not valid");
      await db.query('savepoint audit_attempt');
      await assert.rejects(db.query('select save_owned_project_atomic($1,$2)',[owner,JSON.stringify({name:'Rollback audit',type:'app',user_prompt:'valid message'})]),{code:'23514'});
      await db.query('rollback to savepoint audit_attempt');
      assert.deepEqual((await db.query('select id,name from projects where user_id=$1',[owner])).rows,[{id:existing,name:'Original'}]);
      assert.equal((await db.query('select id from activity_logs where user_id=$1',[owner])).rowCount,0);
    }finally{await db.query('rollback');await db.end();}
  });
}
