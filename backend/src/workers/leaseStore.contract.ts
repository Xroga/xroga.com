import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LeaseError, type LeaseKey, type LeaseStore } from './leaseStore.js';

/** Behaviour every LeaseStore must have. A durable implementation reuses this suite unchanged. */
export interface Clock { now(): number; advance(ms: number): void }
export const fakeClock = (start = 1_000_000): Clock => { let t = start; return { now: () => t, advance: (ms) => { t += ms; } }; };

const key: LeaseKey = { tenantId: 't1', runId: 'run1', taskId: 'task1' };
const lost = (code: string) => (e: unknown) => e instanceof LeaseError && e.code === code;

export function leaseStoreContract(name: string, make: (clock: Clock) => LeaseStore | Promise<LeaseStore>): void {
  describe(`LeaseStore contract: ${name}`, () => {
    it('grants one live holder at a time', async () => {
      const store = await make(fakeClock());
      const a = await store.acquire(key, 'worker-a', 1000);
      assert.ok(a);
      assert.equal(await store.acquire(key, 'worker-b', 1000), null);
      assert.equal(await store.acquire(key, 'worker-a', 1000), null, 'even the same worker must not double-acquire');
      assert.equal((await store.holder(key))?.workerId, 'worker-a');
    });

    it('fencing tokens strictly increase across expiry and release, never repeat', async () => {
      const clock = fakeClock(); const store = await make(clock);
      const a = (await store.acquire(key, 'a', 1000))!;
      clock.advance(1001);
      const b = (await store.acquire(key, 'b', 1000))!;
      await store.release(b);
      const c = (await store.acquire(key, 'c', 1000))!;
      assert.ok(a.token < b.token && b.token < c.token, `${a.token} ${b.token} ${c.token}`);
    });

    it('a stalled worker cannot act after takeover (assertCurrent and renew both refuse)', async () => {
      const clock = fakeClock(); const store = await make(clock);
      const a = (await store.acquire(key, 'a', 1000))!;
      clock.advance(1500);
      await assert.rejects(store.assertCurrent(a), lost('LEASE_EXPIRED'));
      const b = (await store.acquire(key, 'b', 1000))!;
      await assert.rejects(store.assertCurrent(a), lost('LEASE_LOST'));
      await assert.rejects(store.renew(a, 1000), lost('LEASE_LOST'));
      await store.assertCurrent(b);
    });

    it('a late release by the old holder never frees the new holder', async () => {
      const clock = fakeClock(); const store = await make(clock);
      const a = (await store.acquire(key, 'a', 1000))!;
      clock.advance(2000);
      const b = (await store.acquire(key, 'b', 1000))!;
      await store.release(a);
      await store.assertCurrent(b);
      assert.equal(await store.acquire(key, 'c', 1000), null);
    });

    it('renew extends the expiry; an unrenewed lease expires', async () => {
      const clock = fakeClock(); const store = await make(clock);
      let l = (await store.acquire(key, 'a', 1000))!;
      clock.advance(800); l = await store.renew(l, 1000);
      clock.advance(800); await store.assertCurrent(l);
      clock.advance(300); await assert.rejects(store.assertCurrent(l), lost('LEASE_EXPIRED'));
    });

    it('released leases are immediately available', async () => {
      const store = await make(fakeClock());
      const a = (await store.acquire(key, 'a', 1000))!;
      await store.release(a);
      assert.ok(await store.acquire(key, 'b', 1000));
    });

    it('is scoped by tenant: identical run and task ids in two tenants are independent', async () => {
      const store = await make(fakeClock());
      const one = await store.acquire({ ...key, tenantId: 'tenant-1' }, 'a', 1000);
      const two = await store.acquire({ ...key, tenantId: 'tenant-2' }, 'b', 1000);
      assert.ok(one && two);
      // a lease issued for one tenant is not valid for the other, even when forged field by field
      await assert.rejects(store.assertCurrent({ ...one, tenantId: 'tenant-2' }), lost('LEASE_LOST'));
    });

    it('rejects blank identifiers and unreasonable ttls', async () => {
      const store = await make(fakeClock());
      await assert.rejects(store.acquire({ ...key, tenantId: ' ' }, 'a', 1000), lost('LEASE_INVALID'));
      await assert.rejects(store.acquire(key, '', 1000), lost('LEASE_INVALID'));
      for (const ttl of [0, -1, 1.5, 16 * 60_000, Number.NaN]) await assert.rejects(store.acquire(key, 'a', ttl), lost('LEASE_INVALID'), String(ttl));
    });

    it('a forged token is refused even for the right worker', async () => {
      const store = await make(fakeClock());
      const a = (await store.acquire(key, 'a', 1000))!;
      await assert.rejects(store.assertCurrent({ ...a, token: a.token + 1 }), lost('LEASE_LOST'));
      await assert.rejects(store.assertCurrent({ ...a, token: a.token - 1 }), lost('LEASE_LOST'));
    });
  });
}
