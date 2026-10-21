import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GrowthService } from '../growth/growthService.js';

type Fixture = { id: string; project: string };
export function registerGrowthReferralTests(admin: SupabaseClient, getUsers: () => readonly Fixture[]): void {
  test('real referral event guard rejects foreign tuples and concurrent attribution removal', async t => {
    assert.equal(process.env.CI, 'true'); assert.equal(process.env.XB01_DISPOSABLE_SUPABASE, '1');
    assert.equal(process.env.SUPABASE_URL, 'http://127.0.0.1:54321');
    const [owner, other] = getUsers();
    // A dedicated referred user avoids colliding with other referral fixtures.
    const created = await admin.auth.admin.createUser({ email: `growth-referral-${randomUUID()}@example.invalid`, email_confirm: true });
    assert.equal(created.error, null); assert.ok(created.data.user);
    const referred = created.data.user.id, referral = randomUUID(), attribution = randomUUID();
    const eventIds: string[] = [];
    t.after(async () => {
      if (eventIds.length) assert.equal((await admin.from('analytics_events').delete().in('id', eventIds)).error, null);
      assert.equal((await admin.auth.admin.deleteUser(referred)).error, null);
    });
    assert.equal((await admin.from('referrals').insert({ id: referral, referrer_id: owner.id, referred_id: referred, code: 'XROGA-ABC234' })).error, null);
    assert.equal((await admin.from('growth_referral_attribution').insert({ id: attribution, tenant_id: owner.id, project_id: owner.project, referral_id: referral, evidence_reference: 'synthetic fixture' })).error, null);
    const service = new GrowthService(admin);
    const input = { projectId: owner.project, name: 'referral.attributed.v1', idempotencyKey: randomUUID(),
      environment: 'test' as const, referralId: referral, consentState: 'granted' as const, source: 'fixture', evidenceReference: 'synthetic fixture' };
    await assert.rejects(service.recordEvent(other.id, { ...input, projectId: other.project }), { code: 'not_found', statusCode: 404 });
    const admitted = await service.recordEvent(owner.id, input);
    assert.equal(admitted.duplicate, false); assert.equal(admitted.event.referral_id, referral);
    eventIds.push(admitted.event.id);
    const replay = await service.recordEvent(owner.id, input);
    assert.equal(replay.duplicate, true); assert.equal(replay.event.id, admitted.event.id);
    const event = { user_id: owner.id, tenant_id: owner.id, project_id: owner.project, referral_id: referral, event_type: 'referral.attributed.v1', environment: 'test' };
    for (const patch of [{ tenant_id: other.id }, { project_id: other.project }, { referral_id: randomUUID() }]) {
      const denied = await admin.from('analytics_events').insert({ ...event, ...patch });
      assert.equal(denied.error?.code, '23514');
    }
    const valid = await admin.from('analytics_events').insert(event).select('id').single();
    assert.equal(valid.error, null); assert.ok(valid.data); eventIds.push(valid.data.id);
    const ordinary = await admin.from('analytics_events').insert({ ...event, referral_id: null }).select('id').single();
    assert.equal(ordinary.error, null); assert.ok(ordinary.data); eventIds.push(ordinary.data.id);
    const changed = await admin.from('analytics_events').update({ project_id: other.project }).eq('id', valid.data.id);
    assert.equal(changed.error?.code, '23514');
    const database = new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(database.hostname, '127.0.0.1'); assert.equal(database.port, '54322'); assert.equal(database.pathname, '/postgres');
    const locker = new pg.Client({ connectionString: database.href, ssl: false });
    const writer = new pg.Client({ connectionString: database.href, ssl: false });
    await locker.connect(); await writer.connect();
    let pending: Promise<pg.QueryResult> | undefined;
    try {
      await writer.query("set statement_timeout='10s'");
      const writerPid = (await writer.query('select pg_backend_pid() as pid')).rows[0].pid;
      const lockerPid = (await locker.query('select pg_backend_pid() as pid')).rows[0].pid;
      await locker.query('begin');
      await locker.query('delete from public.growth_referral_attribution where id=$1', [attribution]);
      pending = writer.query("insert into public.analytics_events(user_id,tenant_id,project_id,referral_id,event_type,environment) values($1,$1,$2,$3,'referral.attributed.v1','test')", [owner.id, owner.project, referral]);
      void pending.catch(() => {});
      let blocked = false;
      for (let count = 0; count < 100; count++) {
        const observed = await locker.query('select pg_blocking_pids($1) as blockers', [writerPid]);
        if (observed.rows[0].blockers.includes(lockerPid)) { blocked = true; break; }
        await delay(20);
      }
      assert.equal(blocked, true, 'observe the actual attribution lock wait');
      await locker.query('commit');
      await assert.rejects(pending, { code: '23514' });
      const retained = await admin.from('analytics_events').select('id').eq('referral_id', referral);
      assert.equal(retained.error, null);
      assert.deepEqual(retained.data?.map(row => row.id).sort(), [admitted.event.id, valid.data.id].sort());
    } finally {
      await locker.query('rollback'); if (pending) await pending.catch(() => {});
      await writer.end(); await locker.end();
    }
  });
}
