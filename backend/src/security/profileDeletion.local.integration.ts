import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import profileRouter from '../routes/profile.js';
import type { AuthRequest } from '../middleware/auth.js';
import { createTenantContext } from './tenantContext.js';

/** Actual disposable Auth checks after simulated local-JWT admission, not logout proof. */
export function registerProfileDeletionTests(admin: SupabaseClient): void {
  test('profile deletion rechecks disposable Auth ownership and rejects a deleted identity', async t => {
    assert.equal(process.env.CI, 'true');
    assert.equal(process.env.XB01_DISPOSABLE_SUPABASE, '1');
    assert.equal(process.env.SUPABASE_URL, 'http://127.0.0.1:54321');
    const ids = new Set<string>();
    t.after(async () => {
      for (const id of ids) {
        const result = await admin.auth.admin.deleteUser(id);
        assert.equal(result.error, null, 'temporary profile fixture cleanup');
      }
    });
    const fixtures: Array<{ id: string; token: string }> = [];
    for (let index = 0; index < 2; index++) {
      const email = `xb01-profile-${randomUUID()}@example.invalid`, password = `Ci!${randomUUID()}Aa9`;
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      assert.equal(created.error, null); assert.ok(created.data.user);
      const id = created.data.user.id; ids.add(id);
      const client: SupabaseClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const login = await client.auth.signInWithPassword({ email, password });
      assert.equal(login.error, null); assert.ok(login.data.session);
      fixtures.push({ id, token: login.data.session.access_token });
    }
    const [owner, foreign] = fixtures;
    let issuedOwner = foreign.id;
    const app = express(); app.use(express.json());
    // This test-only admission deliberately bypasses the initial JWT verifier so
    // it can prove the deletion route's independent fresh-user boundary.
    app.use((req: AuthRequest, _res, next) => {
      req.tenantContext = createTenantContext({ userId: issuedOwner, via: 'local_jwt' });
      req.accessToken = owner.token; next();
    });
    app.use(profileRouter);
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(async () => { server.close(); await once(server, 'close'); });
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const remove = () => fetch(`http://127.0.0.1:${address.port}/`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE' }),
    });
    assert.equal((await remove()).status, 401);
    const foreignBefore = await admin.auth.admin.getUserById(foreign.id);
    assert.equal(foreignBefore.error, null); assert.equal(foreignBefore.data.user?.id, foreign.id);
    issuedOwner = owner.id;
    const deleted = await remove(); assert.equal(deleted.status, 200);
    assert.deepEqual(await deleted.json(), { deleted: true }); ids.delete(owner.id);
    const absent = await admin.auth.admin.getUserById(owner.id);
    assert.equal(absent.data.user, null); assert.ok(absent.error);
    assert.equal((await remove()).status, 401);
    const foreignAfter = await admin.auth.admin.getUserById(foreign.id);
    assert.equal(foreignAfter.error, null); assert.equal(foreignAfter.data.user?.id, foreign.id);
  });
}
