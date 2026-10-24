import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';

/** Existing read-only endpoints with real disposable Auth and database roles.
 * No production evidence, provider action, deployment or new admin grant. */
export function registerAdminReadTests(admin:SupabaseClient,request:(path:string,token?:string,method?:string,body?:unknown)=>Promise<Response>):void{
  test('real operational read endpoints require the current authenticated database admin and preserve exact read-only records',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const actors:{id:string;token:string}[]=[],errorId=randomUUID(),deploymentId=randomUUID(),evidenceId=`phase2-read-only-${randomUUID()}`,category=`phase2-${randomUUID()}`;
    t.after(async()=>{
      for(const [table,id]of [['system_errors',errorId],['deployment_status',deploymentId],['production_evidence',evidenceId]])assert.equal((await admin.from(table).delete().eq('id',id)).error,null);
      for(const actor of actors)assert.equal((await admin.auth.admin.deleteUser(actor.id)).error,null);
    });
    for(let index=0;index<2;index++){
      const email=`admin-read-${randomUUID()}@example.invalid`,password=`Synthetic-${randomUUID()}!`;
      const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{role:'owner'}});assert.equal(created.error,null);assert.ok(created.data.user);
      const actor={id:created.data.user.id,token:''};actors.push(actor);
      const client:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{autoRefreshToken:false,persistSession:false}});
      const signed=await client.auth.signInWithPassword({email,password});assert.equal(signed.error,null);assert.ok(signed.data.session);actor.token=signed.data.session.access_token;
    }
    const [privileged,member]=actors;
    for(const actor of actors){
      const profile=await admin.from('profiles').select('id,role').eq('id',actor.id).single();assert.equal(profile.error,null);
      assert.equal(profile.data?.id,actor.id);assert.ok(!['admin','owner'].includes(profile.data?.role),'Auth user metadata cannot issue a database administrator role');
    }
    assert.equal((await admin.from('profiles').update({role:'admin'}).eq('id',privileged.id)).error,null);
    assert.equal((await admin.from('profiles').update({role:'member'}).eq('id',member.id)).error,null);
    assert.equal((await admin.from('system_errors').insert({id:errorId,api:category,error_message:'Bearer synthetic-private-admin-canary',severity:'warning'})).error,null);
    assert.equal((await admin.from('deployment_status').insert({id:deploymentId,user_id:member.id,target:'github',status:'failed',method:'DISPOSABLE_READ_FIXTURE_NO_DEPLOYMENT'})).error,null);
    assert.equal((await admin.from('production_evidence').insert({id:evidenceId,kind:'disposable_security_fixture',source:'Phase2 read-only integration',status:'unknown',summary:'Synthetic fixture, no production verification or deployment.'})).error,null);
    const read=async()=>Promise.all([['system_errors',errorId],['deployment_status',deploymentId],['production_evidence',evidenceId]].map(async([table,id])=>{
      const row=await admin.from(table).select('*').eq('id',id).single();assert.equal(row.error,null);return row.data;
    }));
    const before=await read();
    const paths=[`/api/admin/errors?api=${category}&limit=999`,`/api/admin/deployments?limit=999`,'/api/operations/readiness'];
    for(const path of paths){
      assert.equal((await request(path)).status,401);
      const denied=await request(`${path}${path.includes('?')?'&':'?'}userId=${privileged.id}&role=owner`,member.token);
      assert.equal(denied.status,403);const text=await denied.text();assert.ok(!text.includes(errorId));assert.ok(!text.includes(deploymentId));assert.ok(!text.includes(evidenceId));
    }
    const errors=await request(paths[0],privileged.token);assert.equal(errors.status,200);const errorBody=await errors.json() as {errors:{id:string;error_message:string}[]};
    assert.ok(errorBody.errors.length<=200);assert.ok(errorBody.errors.some(row=>row.id===errorId));assert.ok(!JSON.stringify(errorBody).includes('synthetic-private-admin-canary'));
    const deployments=await request(paths[1],privileged.token);assert.equal(deployments.status,200);const deploymentBody=await deployments.json() as {deployments:{id:string}[]};
    assert.ok(deploymentBody.deployments.length<=100);assert.ok(deploymentBody.deployments.some(row=>row.id===deploymentId),'Authorized platform admin may read the separate fixture member deployment');
    const readiness=await request(paths[2],privileged.token);assert.equal(readiness.status,200);const readinessBody=await readiness.json() as {evidence:{id:string}[]};
    assert.ok(readinessBody.evidence.length<=50);assert.ok(readinessBody.evidence.some(row=>row.id===evidenceId));
    // The old JWT and user_metadata remain unchanged. Current DB role is authority.
    assert.equal((await admin.from('profiles').update({role:'member'}).eq('id',privileged.id)).error,null);
    for(const path of paths)assert.equal((await request(path,privileged.token)).status,403);
    assert.deepEqual(await read(),before,'Read authorization and denied queries never mutate the protected records');
  });
}
