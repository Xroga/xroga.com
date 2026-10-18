import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {SupabaseClient} from '@supabase/supabase-js';

export function registerChatBoundaryTests(admin:SupabaseClient,getUsers:()=>readonly {id:string;token:string}[],request:(path:string,token?:string,method?:string,body?:unknown)=>Promise<Response>):void{
  test('real chat conversation API preserves own messages and denies foreign reads writes cancellation and forged body identity',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const [owner,other]=getUsers(),id=randomUUID(),prompt='PRIVATE_CHAT_OWNER_CANARY',messages=[{role:'user',content:'PRIVATE_CHAT_MESSAGE_CANARY'}];
    t.after(async()=>{assert.equal((await admin.from('swarm_runs').delete().eq('id',id).eq('user_id',owner.id)).error,null);});
    const inserted=await admin.from('swarm_runs').insert({id,user_id:owner.id,prompt,status:'pending',messages}).select('*').single();assert.equal(inserted.error,null);
    const path=`/api/swarm/runs/${id}`;
    const original=await request(path,owner.token);assert.equal(original.status,200);
    const own=await original.json() as {prompt:string;messages:unknown};assert.equal(own.prompt,prompt);assert.deepEqual(own.messages,messages);
    assert.equal((await request(path)).status,401);
    assert.equal((await request(`${path}/conversation`,undefined,'POST',{messages:[]})).status,401);
    const next=[{role:'user',content:'OWN_CHAT_REPLACEMENT_CANARY'}];
    const saved=await request(`${path}/conversation`,owner.token,'POST',{messages:next,userId:other.id,tenantId:other.id,tenantContext:{userId:other.id}});
    assert.equal(saved.status,200);assert.deepEqual(await saved.json(),{saved:true,persisted:true});
    const read=()=>admin.from('swarm_runs').select('*').eq('id',id).single();
    const before=await read();assert.equal(before.error,null);assert.equal(before.data?.user_id,owner.id);assert.deepEqual(before.data?.messages,next);
    assert.equal(before.data?.prompt,prompt);assert.equal(before.data?.status,inserted.data?.status);assert.equal(before.data?.created_at,inserted.data?.created_at);
    const foreign=await request(path,other.token);assert.equal(foreign.status,200);
    const hidden=await foreign.text();assert.ok(!hidden.includes('CANARY'));assert.equal(JSON.parse(hidden).status,'unknown');assert.equal(JSON.parse(hidden).prompt,'');
    for(const method of ['POST','PATCH']){
      const denied=await request(`${path}/conversation`,other.token,method,{userId:owner.id,tenantId:owner.id,tenantContext:{userId:owner.id},messages:[{role:'user',content:'FOREIGN_CHAT_WRITE'}]});
      assert.equal(denied.status,404);assert.ok(!(await denied.text()).includes('CANARY'));
    }
    assert.equal((await request(`${path}/cancel`,other.token,'POST',{userId:owner.id})).status,404);
    const after=await read();assert.equal(after.error,null);assert.deepEqual(after.data,before.data);
    const replay=await request(path,owner.token);assert.equal(replay.status,200);assert.deepEqual((await replay.json() as {messages:unknown}).messages,next);
  });
}
