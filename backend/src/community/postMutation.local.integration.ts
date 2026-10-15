import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CommunityService } from './service.js';

export function registerCommunityPostMutationTests(admin: SupabaseClient): void {
  test('real community post mutations preserve authority, lock serialization and cascade receipts', async t => {
    assert.equal(process.env.CI, 'true'); assert.equal(process.env.XB01_DISPOSABLE_SUPABASE, '1');
    assert.equal(process.env.SUPABASE_URL, 'http://127.0.0.1:54321');
    const users: string[] = [], post = randomUUID(), comment = randomUUID(), note = randomUUID();
    t.after(async () => {
      assert.equal((await admin.from('community_posts').delete().eq('id', post)).error, null);
      for (const id of users) assert.equal((await admin.auth.admin.deleteUser(id)).error, null);
    });
    for (let i=0;i<3;i++) {
      const created = await admin.auth.admin.createUser({ email: `community-post-${randomUUID()}@example.invalid`, email_confirm: true });
      assert.equal(created.error, null); assert.ok(created.data.user); users.push(created.data.user.id);
    }
    const [owner, moderator, administrator] = users;
    assert.equal((await admin.from('profiles').update({ role: 'moderator' }).eq('id',moderator)).error,null);
    assert.equal((await admin.from('profiles').update({ role: 'admin' }).eq('id',administrator)).error,null);
    assert.equal((await admin.from('community_posts').insert({ id:post, author_id:owner, category:'question', title:'Fixture question',body:'Synthetic fixture question.' })).error,null);
    assert.equal((await admin.from('community_comments').insert({ id:comment,post_id:post,author_id:owner,body:'Fixture comment' })).error,null);
    assert.equal((await admin.from('community_votes').insert({post_id:post,user_id:owner})).error,null);
    assert.equal((await admin.from('community_admin_notes').insert({id:note,post_id:post,author_id:moderator,note:'Fixture note'})).error,null);
    const service = new CommunityService(admin);
    assert.equal((await service.updatePost(owner,post,{title:'Owner changed title'})).title,'Owner changed title');
    await assert.rejects(service.deletePost(moderator,post),{status:403});
    await assert.rejects(service.moderatePost(owner,post,{isLocked:true}),{status:403});
    assert.equal((await service.moderatePost(moderator,post,{isLocked:true})).isLocked,true);
    await assert.rejects(service.updatePost(owner,post,{title:'Locked owner edit'}),{status:423});
    await assert.rejects(service.deletePost(owner,post),{status:423});
    assert.equal((await service.updatePost(moderator,post,{title:'Moderator edit'})).title,'Moderator edit');
    await service.moderatePost(moderator,post,{isLocked:false});
    const database = new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(database.hostname,'127.0.0.1');assert.equal(database.port,'54322');assert.equal(database.pathname,'/postgres');
    const locker=new pg.Client({connectionString:database.href,ssl:false});
    const writer=new pg.Client({connectionString:database.href,ssl:false});
    await locker.connect();await writer.connect();
    try {
      await writer.query("set statement_timeout='10s'");
      const writerPid=(await writer.query('select pg_backend_pid() pid')).rows[0].pid;
      const lockerPid=(await locker.query('select pg_backend_pid() pid')).rows[0].pid;
      await locker.query('begin');await locker.query('update community_posts set is_locked=true where id=$1',[post]);
      const pending=writer.query('select mutate_community_post_authorized($1,$2,$3,$4::jsonb)',[owner,post,'update','{"title":"Race edit"}']);
      void pending.catch(()=>{});
      let blocked=false;
      for(let i=0;i<100;i++) {
        const observed=await locker.query('select pg_blocking_pids($1) blockers',[writerPid]);
        if(observed.rows[0].blockers.includes(lockerPid)){blocked=true;break;}
        await delay(20);
      }
      assert.equal(blocked,true,'observe actual parent lock wait');await locker.query('commit');
      await assert.rejects(pending,{code:'P0003'});
      for(const role of ['anon','authenticated']) {
        await writer.query('begin');await writer.query(`set local role ${role}`);
        await assert.rejects(writer.query('select mutate_community_post_authorized($1,$2,$3,$4::jsonb)',[administrator,post,'delete','{}']),{code:'42501'});
        await writer.query('rollback');
      }
    } finally {await locker.query('rollback');await writer.query('rollback');await writer.end();await locker.end();}
    await service.deletePost(administrator,post);
    await assert.rejects(service.deletePost(administrator,post),{status:404});
    for(const [table,column,value] of [['community_posts','id',post],['community_comments','id',comment],['community_admin_notes','id',note],['community_votes','post_id',post]]) {
      const remaining=await admin.from(table).select('id').eq(column,value);assert.equal(remaining.error,null);assert.deepEqual(remaining.data,[]);
    }
  });
}
