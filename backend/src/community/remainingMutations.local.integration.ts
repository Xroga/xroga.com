import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CommunityService } from './service.js';

export function registerCommunityRemainingMutationTests(admin:SupabaseClient):void{
  test('real remaining community mutations preserve parent/role authority and vote replay isolation',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');
    assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const users:string[]=[],posts:string[]=[];
    t.after(async()=>{for(const id of posts)assert.equal((await admin.from('community_posts').delete().eq('id',id)).error,null);
      for(const id of users)assert.equal((await admin.auth.admin.deleteUser(id)).error,null);});
    for(let i=0;i<4;i++){
      const created=await admin.auth.admin.createUser({email:`community-item-${randomUUID()}@example.invalid`,email_confirm:true});
      assert.equal(created.error,null);assert.ok(created.data.user);users.push(created.data.user.id);
    }
    const [member,other,moderator,owner]=users;
    assert.equal((await admin.from('profiles').update({role:'moderator'}).eq('id',moderator)).error,null);
    assert.equal((await admin.from('profiles').update({role:'owner'}).eq('id',owner)).error,null);
    const service=new CommunityService(admin);
    const post=await service.createPost(member,{title:'Remaining mutation fixture',body:'A synthetic test discussion.',category:'question'});posts.push(post.id);
    assert.equal(post.authorId,member);
    const comment=await service.createComment(member,post.id,{body:'Member comment'});assert.equal(comment.authorId,member);
    await assert.rejects(service.deleteComment(other,comment.id),{status:403});
    await assert.rejects(service.deleteComment(moderator,comment.id),{status:403});
    for(const officialIdentity of ['xroga_team','xroga_owner','xroga_ai_ceo'] as const)
      await assert.rejects(service.createComment(member,post.id,{body:'Forged identity',officialIdentity}),{status:403});
    await assert.rejects(service.createComment(moderator,post.id,{body:'Forged owner',officialIdentity:'xroga_owner'}),{status:403});
    assert.equal((await service.createComment(moderator,post.id,{body:'Team reply',officialIdentity:'xroga_team'})).officialIdentity,'xroga_team');
    assert.equal((await service.createComment(owner,post.id,{body:'Owner reply',officialIdentity:'xroga_owner'})).officialIdentity,'xroga_owner');
    await assert.rejects(service.addNote(member,post.id,'Denied note'),{status:403});
    assert.equal((await service.addNote(moderator,post.id,'Private fixture note')).author_id,moderator);
    await Promise.all(Array.from({length:4},()=>service.setVote(member,post.id,true)));
    await service.setVote(other,post.id,true);
    const votes=await admin.from('community_votes').select('user_id').eq('post_id',post.id);
    assert.equal(votes.error,null);assert.deepEqual(votes.data?.map(v=>v.user_id).sort(),[member,other].sort());
    await service.setVote(member,post.id,false);await service.setVote(member,post.id,false);
    const retained=await admin.from('community_votes').select('user_id').eq('post_id',post.id);
    assert.deepEqual(retained.data,[{user_id:other}]);
    const database=new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(database.hostname,'127.0.0.1');assert.equal(database.port,'54322');assert.equal(database.pathname,'/postgres');
    const locker=new pg.Client({connectionString:database.href,ssl:false}),writer=new pg.Client({connectionString:database.href,ssl:false});
    await locker.connect();await writer.connect();
    try{
      await writer.query("set statement_timeout='10s'");
      const wp=(await writer.query('select pg_backend_pid() pid')).rows[0].pid,lp=(await locker.query('select pg_backend_pid() pid')).rows[0].pid;
      await locker.query('begin');await locker.query('update community_posts set is_locked=true where id=$1',[post.id]);
      const pending=writer.query('select mutate_community_item_authorized($1,$2,$3,$4::jsonb)',[member,'create_comment',post.id,'{"body":"Race reply"}']);
      void pending.catch(()=>{});let blocked=false;
      for(let i=0;i<100;i++){const observed=await locker.query('select pg_blocking_pids($1) blockers',[wp]);if(observed.rows[0].blockers.includes(lp)){blocked=true;break;}await delay(20);}
      assert.equal(blocked,true);await locker.query('commit');await assert.rejects(pending,{code:'P0003'});
      for(const role of ['anon','authenticated']){await writer.query('begin');await writer.query(`set local role ${role}`);
        await assert.rejects(writer.query('select mutate_community_item_authorized($1,$2,$3,$4::jsonb)',[member,'vote_add',post.id,'{}']),{code:'42501'});await writer.query('rollback');}
    }finally{await locker.query('rollback');await writer.query('rollback');await writer.end();await locker.end();}
    await service.createComment(moderator,post.id,{body:'Staff locked reply'});
    await service.deleteComment(member,comment.id);
    await service.moderatePost(moderator,post.id,{isHidden:true});
    await assert.rejects(service.createComment(member,post.id,{body:'Hidden reply'}),{status:404});
    await assert.rejects(service.setVote(owner,post.id,true),{status:404});
    const malformed=await admin.rpc('mutate_community_item_authorized',{p_actor:member,p_operation:'create_comment',p_target:post.id,p_payload:{body:'Bad',author_id:other}});
    assert.equal(malformed.error?.code,'22023');
  });
}
