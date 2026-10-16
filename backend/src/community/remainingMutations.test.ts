import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CommunityService } from './service.js';
test('remaining community writes bind authenticated actor, parent, fields and operation receipt',async()=>{
  let corrupt=false;
  const chain: Record<string,unknown>={};
  for(const method of ['select','in','eq'])chain[method]=()=>chain;
  chain.then=(resolve:(value:unknown)=>unknown)=>Promise.resolve(resolve({data:[],error:null}));
  const db={from:()=>chain,rpc:async(name:string,args:Record<string,unknown>)=>{
    assert.equal(name,'mutate_community_item_authorized');assert.equal(args.p_actor,'actor');
    const payload=args.p_payload as Record<string,unknown>;
    const row={id:args.p_operation==='create_post'||args.p_operation==='delete_comment'?args.p_target:'created',
      author_id:'actor',post_id:args.p_target,user_id:'actor',voted:false,is_hidden:false,is_accepted_answer:false,...payload};
    return {error:null,data:corrupt?{operation:'wrong',target:args.p_target,row}:{operation:args.p_operation,target:args.p_target,row}};
  }} as unknown as SupabaseClient;
  const service=new CommunityService(db);
  const calls=[()=>service.createPost('actor',{title:'Valid title',body:'Valid long body',category:'question'}),
    ()=>service.createComment('actor','post',{body:'Reply'}),()=>service.deleteComment('actor','comment'),
    ()=>service.setVote('actor','post',true),()=>service.setVote('actor','post',false),()=>service.addNote('actor','post','Note')];
  for(const call of calls){corrupt=false;await call();corrupt=true;await assert.rejects(call(),{status:503});}
});
