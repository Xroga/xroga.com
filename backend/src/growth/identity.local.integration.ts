import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GrowthService } from './growthService.js';

export function registerGrowthIdentityTests(admin: SupabaseClient): void {
  test('real growth identity first claims cannot reassign another authorized project user', async t => {
    assert.equal(process.env.CI, 'true'); assert.equal(process.env.XB01_DISPOSABLE_SUPABASE, '1');
    assert.equal(process.env.SUPABASE_URL, 'http://127.0.0.1:54321');
    const users: string[] = []; let project: string | undefined;
    t.after(async () => {
      if (project) assert.equal((await admin.from('projects').delete().eq('id', project)).error, null);
      for (const id of users) assert.equal((await admin.auth.admin.deleteUser(id)).error, null);
    });
    for (let i = 0; i < 2; i++) {
      const created = await admin.auth.admin.createUser({ email: `growth-identity-${randomUUID()}@example.invalid`, email_confirm: true });
      assert.equal(created.error, null); assert.ok(created.data.user); users.push(created.data.user.id);
    }
    const created = await admin.from('projects').insert({ user_id: users[0], name: 'Identity binding fixture', type: 'app' }).select('id').single();
    assert.equal(created.error, null); assert.ok(created.data); project = created.data.id as string;
    assert.equal((await admin.from('operations_memberships').insert({ user_id: users[0], project_id: project, member_user_id: users[1], role: 'viewer', created_by: users[0] })).error, null);
    const service = new GrowthService(admin);
    const input = { projectId: project, anonymousId: randomUUID(), evidenceReference: 'fixture:first' };
    const first = await service.linkIdentity(users[0], input);
    const refreshed = await service.linkIdentity(users[0], { ...input, evidenceReference: 'fixture:refresh' });
    assert.equal(refreshed.id, first.id); assert.equal(refreshed.evidence_reference, 'fixture:refresh');
    await assert.rejects(service.linkIdentity(users[1], input), { code: 'identity_conflict', statusCode: 409 });
    const unchanged = await admin.from('growth_identity_links').select('*').eq('id', first.id).single();
    assert.equal(unchanged.error, null); assert.equal(unchanged.data?.user_id, users[0]); assert.equal(unchanged.data?.evidence_reference, 'fixture:refresh');

    const database = new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(database.hostname, '127.0.0.1'); assert.equal(database.port, '54322'); assert.equal(database.pathname, '/postgres');
    const locker = new pg.Client({ connectionString: database.href, ssl: false });
    await locker.connect();
    const racing = { ...input, anonymousId: randomUUID() };
    let attempts: Promise<PromiseSettledResult<Record<string, any>>[]> | undefined;
    try {
      await locker.query('begin'); await locker.query('lock table public.growth_identity_links in share mode');
      attempts = Promise.allSettled(users.map(user => service.linkIdentity(user, racing)));
      let blocked = false;
      for (let i = 0; i < 100; i++) {
        const result = await locker.query("select count(*)::int as n from pg_locks where relation='public.growth_identity_links'::regclass and mode='RowExclusiveLock' and not granted");
        if (result.rows[0].n >= 2) { blocked = true; break; }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      assert.equal(blocked, true, 'both independent HTTP insert transactions must reach the database lock');
      await locker.query('commit');
      const results = await attempts;
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
      assert.equal(rejected.reason.code, 'identity_conflict');
      const winner = results.find(result => result.status === 'fulfilled') as PromiseFulfilledResult<Record<string, any>>;
      const persisted = await admin.from('growth_identity_links').select('*').eq('tenant_id', users[0]).eq('project_id', project).eq('anonymous_id', racing.anonymousId);
      assert.equal(persisted.error, null); assert.equal(persisted.data?.length, 1);
      assert.equal(persisted.data![0].user_id, winner.value.user_id);
    } finally {
      await locker.query('rollback'); await locker.end(); if (attempts) await attempts;
    }
  });
}
