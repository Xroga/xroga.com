import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CommunityService } from './service.js';

export function registerCommunityCommentUpdateTests(admin: SupabaseClient): void {
  test('real comment update enforces current field authority and serialized role/parent changes', async t => {
    assert.equal(process.env.CI, 'true'); assert.equal(process.env.XB01_DISPOSABLE_SUPABASE, '1');
    assert.equal(process.env.SUPABASE_URL, 'http://127.0.0.1:54321');
    const users: string[] = [], post = randomUUID(), comment = randomUUID();
    t.after(async () => {
      await admin.from('community_posts').delete().eq('id', post);
      for (const id of users) assert.equal((await admin.auth.admin.deleteUser(id)).error, null);
    });
    for (let i = 0; i < 3; i++) {
      const created = await admin.auth.admin.createUser({ email: `community-${randomUUID()}@example.invalid`, email_confirm: true });
      assert.equal(created.error, null); assert.ok(created.data.user); users.push(created.data.user.id);
    }
    const [owner, author, staff] = users;
    assert.equal((await admin.from('profiles').update({ role: 'moderator' }).eq('id', staff)).error, null);
    assert.equal((await admin.from('community_posts').insert({ id: post, author_id: owner, category: 'question', title: 'Fixture question', body: 'Synthetic fixture question.', is_locked: true })).error, null);
    assert.equal((await admin.from('community_comments').insert({ id: comment, post_id: post, author_id: author, body: 'Original' })).error, null);
    const service = new CommunityService(admin);
    await service.updateComment(author, comment, { body: 'Own edit on locked parent' });
    await service.updateComment(owner, comment, { isAcceptedAnswer: true });
    for (const [actor, patch] of [[owner, { body: 'foreign', isAcceptedAnswer: true }], [author, { isAcceptedAnswer: false }], [author, { isHidden: false }]] as const) {
      await assert.rejects(service.updateComment(actor, comment, patch), { status: 403 });
    }
    await service.updateComment(staff, comment, { body: 'Staff edit', isHidden: true, isAcceptedAnswer: false });
    const database = new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(database.hostname, '127.0.0.1'); assert.equal(database.port, '54322'); assert.equal(database.pathname, '/postgres');
    const locker = new pg.Client({ connectionString: database.href, ssl: false });
    const writer = new pg.Client({ connectionString: database.href, ssl: false });
    await locker.connect(); await writer.connect();
    try {
      await writer.query("set statement_timeout='10s'");
      const writerPid = (await writer.query('select pg_backend_pid() as pid')).rows[0].pid;
      const lockerPid = (await locker.query('select pg_backend_pid() as pid')).rows[0].pid;
      for (const scenario of [
        { sql: "update public.profiles set role='member' where id=$1", id: staff, actor: staff, patch: { is_hidden: false } },
        { sql: 'update public.community_posts set author_id=$1 where id=$2', id: author, actor: owner, patch: { is_accepted_answer: true } },
      ]) {
        await locker.query('begin');
        await locker.query(scenario.sql, scenario.actor === staff ? [scenario.id] : [scenario.id, post]);
        const pending = writer.query('select public.update_community_comment_authorized($1,$2,$3::jsonb)', [scenario.actor, comment, JSON.stringify(scenario.patch)]);
        void pending.catch(() => {});
        let blocked = false;
        for (let i = 0; i < 100; i++) {
          const check = await locker.query('select pg_blocking_pids($1) as blockers', [writerPid]);
          if (check.rows[0].blockers.includes(lockerPid)) { blocked = true; break; }
          await delay(20);
        }
        assert.equal(blocked, true, 'observed actual authorization-row lock');
        await locker.query('commit');
        await assert.rejects(pending, { code: '42501' });
      }
      for (const role of ['anon', 'authenticated']) {
        await writer.query('begin'); await writer.query(`set local role ${role}`);
        await assert.rejects(writer.query('select public.update_community_comment_authorized($1,$2,$3::jsonb)', [author, comment, '{"body":"forbidden"}']), { code: '42501' });
        await writer.query('rollback');
      }
    } finally { await locker.query('rollback'); await writer.query('rollback'); await writer.end(); await locker.end(); }
    const retained = await admin.from('community_comments').select('body,is_hidden,is_accepted_answer').eq('id', comment).single();
    assert.equal(retained.error, null);
    assert.deepEqual(retained.data, { body: 'Staff edit', is_hidden: true, is_accepted_answer: false });
  });
}
