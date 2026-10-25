import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CommunityService } from './service.js';
test('private community read receipts reject nonstaff, foreign notes and malformed counts',async()=>{
  let data:unknown=null;
  const service=new CommunityService({rpc:async(name:string,args:Record<string,unknown>)=>{
    assert.equal(args.p_actor,'actor');assert.ok(name.startsWith('read_community_staff_'));return {data,error:null};
  }} as unknown as SupabaseClient);
  await assert.rejects(service.notes('actor','post'),{status:403});await assert.rejects(service.summary('actor'),{status:403});
  for(const invalid of [{role:'member',notes:[]},{role:'moderator',notes:[{post_id:'foreign',note:'private'}]}]){
    data=invalid;await assert.rejects(service.notes('actor','post'),{status:503});
  }
  data={role:'moderator',notes:[{post_id:'post',note:'private'}]};assert.equal((await service.notes('actor','post')).length,1);
  for(const invalid of [{role:'moderator',counts:{}},{role:'member',counts:{}},{role:'moderator',counts:{hidden:-1}}]){
    data=invalid;await assert.rejects(service.summary('actor'),{status:503});
  }
});
