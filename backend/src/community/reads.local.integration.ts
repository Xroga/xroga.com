import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CommunityService } from './service.js';
import { communityListSchema } from './schemas.js';

/** Actual service/database reads, not an HTTP authentication or revocation-race proof. */
export function registerCommunityReadTests(admin:SupabaseClient):void{
  test('real public community reads project public identities and counts while private reads require staff',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');
    assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const users:string[]=[],posts:string[]=[];
    t.after(async()=>{for(const id of posts)assert.equal((await admin.from('community_posts').delete().eq('id',id)).error,null);
      for(const id of users)assert.equal((await admin.auth.admin.deleteUser(id)).error,null);});
    for(let i=0;i<3;i++){
      const created=await admin.auth.admin.createUser({email:`community-read-${randomUUID()}@example.invalid`,email_confirm:true});
      assert.equal(created.error,null);assert.ok(created.data.user);users.push(created.data.user.id);
    }
    const [author,viewer,staff]=users;
    assert.equal((await admin.from('profiles').update({role:'moderator',display_name:'Public Staff'}).eq('id',staff)).error,null);
    const service=new CommunityService(admin);
    const visible=await service.createPost(author,{title:'Public projection fixture',body:'Public synthetic discussion.',category:'question'});posts.push(visible.id);
    const hidden=await service.createPost(author,{title:'Private hidden fixture',body:'Hidden synthetic discussion.',category:'question'});posts.push(hidden.id);
    await service.moderatePost(staff,hidden.id,{isHidden:true});
    await service.createComment(viewer,visible.id,{body:'Visible reply'});
    const hiddenReply=await service.createComment(staff,visible.id,{body:'Hidden staff reply',officialIdentity:'xroga_team'});
    await service.updateComment(staff,hiddenReply.id,{isHidden:true});
    await service.setVote(author,visible.id,true);await service.setVote(viewer,visible.id,true);
    await service.addNote(staff,visible.id,'Private staff note');
    assert.equal(await service.role(),'member');assert.equal(await service.role(author),'member');assert.equal(await service.role(staff),'moderator');
    const anonymous=await service.getPost(visible.id);
    assert.equal(anonymous.post.voteCount,2);assert.equal(anonymous.post.commentCount,1);
    assert.equal(anonymous.post.hasOfficialResponse,false);assert.equal(anonymous.post.viewerHasVoted,false);
    assert.deepEqual(Object.keys(anonymous.post.author).sort(),['avatarUrl','displayName','id','username']);
    assert.deepEqual(Object.keys(anonymous.comments[0].author).sort(),['avatarUrl','displayName','id','username']);
    assert.deepEqual(anonymous.comments.map(c=>c.body),['Visible reply']);
    const own=await service.getPost(visible.id,viewer);assert.equal(own.post.viewerHasVoted,true);
    const moderator=await service.getPost(visible.id,staff);assert.equal(moderator.comments.length,2);
    await assert.rejects(service.getPost(hidden.id),{status:404});
    await assert.rejects(service.getPost(hidden.id,viewer),{status:404});
    assert.equal((await service.getPost(hidden.id,staff)).post.isHidden,true);
    const feed=await service.listPosts(communityListSchema.parse({hidden:'include'}),viewer);
    assert.equal(feed.posts.some(p=>p.id===hidden.id),false);
    for(const actor of [author,viewer]){
      await assert.rejects(service.notes(actor,visible.id),{status:403});
      await assert.rejects(service.summary(actor),{status:403});
    }
    const notes=await service.notes(staff,visible.id);assert.equal(notes.length,1);assert.equal(notes[0].note,'Private staff note');
    const summary=await service.summary(staff);assert.equal(summary.role,'moderator');assert.ok(Number(summary.hidden)>=1);
    assert.equal(JSON.stringify(anonymous).includes('Private staff note'),false);
    assert.equal(JSON.stringify(anonymous).includes('Hidden staff reply'),false);
    const database=new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(database.hostname,'127.0.0.1');assert.equal(database.port,'54322');assert.equal(database.pathname,'/postgres');
    const locker=new pg.Client({connectionString:database.href,ssl:false}),reader=new pg.Client({connectionString:database.href,ssl:false});
    await locker.connect();await reader.connect();
    const gate=Math.floor(Math.random()*1_000_000_000),latePost=randomUUID();posts.push(latePost);
    try{
      await reader.query("set statement_timeout='10s'");
      const rp=(await reader.query('select pg_backend_pid() pid')).rows[0].pid,lp=(await locker.query('select pg_backend_pid() pid')).rows[0].pid;
      await locker.query('select pg_advisory_lock($1)',[gate]);
      // The outer statement snapshot starts before demotion. STABLE readers must
      // not combine its old role with private content committed after that point.
      const pending=reader.query(`with gate as materialized(select pg_advisory_xact_lock($1))
        select read_community_staff_notes($2,$3) notes,
          (select coalesce(jsonb_agg(id),'[]'::jsonb) from visible_community_posts($2)) posts
        from gate`,[gate,staff,visible.id]);
      void pending.catch(()=>{});let blocked=false;
      for(let i=0;i<100;i++){const observed=await locker.query('select pg_blocking_pids($1) blockers',[rp]);if(observed.rows[0].blockers.includes(lp)){blocked=true;break;}await delay(20);}
      assert.equal(blocked,true,'observe read statement held after snapshot acquisition');
      assert.equal((await admin.from('profiles').update({role:'member'}).eq('id',staff)).error,null);
      assert.equal((await admin.from('community_posts').insert({id:latePost,author_id:author,title:'Late hidden fixture',body:'Private after demotion fixture.',category:'question',is_hidden:true})).error,null);
      assert.equal((await admin.from('community_admin_notes').insert({post_id:visible.id,author_id:staff,note:'Late private after demotion'})).error,null);
      await locker.query('select pg_advisory_unlock($1)',[gate]);
      const snapshot=(await pending).rows[0];
      assert.equal(snapshot.notes.role,'moderator');
      assert.deepEqual(snapshot.notes.notes.map((n:{note:string})=>n.note),['Private staff note']);
      assert.equal(snapshot.posts.includes(latePost),false);
      for(const role of ['anon','authenticated']){
        await reader.query('begin');await reader.query(`set local role ${role}`);
        await assert.rejects(reader.query('select read_community_staff_notes($1,$2)',[staff,visible.id]),{code:'42501'});await reader.query('rollback');
      }
    }finally{await locker.query('select pg_advisory_unlock_all()');await reader.query('rollback');await reader.end();await locker.end();}
    await assert.rejects(service.notes(staff,visible.id),{status:403});
    await assert.rejects(service.summary(staff),{status:403});
    await assert.rejects(service.getPost(latePost,staff),{status:404});
  });
}
