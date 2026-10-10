import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizeFounderRequest, resolveFounderAccess } from './osFounderAccess';

const founder = { id: 'founder-id', email: 'hello@xroga.com', email_confirmed_at: '2026-01-01T00:00:00Z' };

test('founder access denies signed-out, normal, non-target admin, email-only and low-assurance accounts', () => {
  assert.deepEqual(resolveFounderAccess(null, 'owner', 'aal2'), { allowed: false, reason: 'signed-out' });
  assert.deepEqual(resolveFounderAccess({ ...founder, email: 'person@example.com' }, 'member', 'aal2'), { allowed: false, reason: 'identity' });
  assert.deepEqual(resolveFounderAccess({ ...founder, email: 'admin@example.com' }, 'admin', 'aal2'), { allowed: false, reason: 'identity' });
  assert.deepEqual(resolveFounderAccess(founder, 'member', 'aal2'), { allowed: false, reason: 'role' });
  assert.deepEqual(resolveFounderAccess(founder, 'admin', 'aal2'), { allowed: false, reason: 'role' });
  assert.deepEqual(resolveFounderAccess(founder, 'owner', 'aal1'), { allowed: false, reason: 'assurance' });
  assert.deepEqual(resolveFounderAccess({ ...founder, email_confirmed_at: null }, 'owner', 'aal2'), { allowed: false, reason: 'identity' });
});

test('only confirmed target email plus owner role plus AAL2 passes', () => {
  assert.deepEqual(resolveFounderAccess({ ...founder, email: ' Hello@Xroga.com ' }, 'owner', 'aal2'), { allowed: true });
});

test('server-dependency path denies all requested negative cases and avoids later privileged reads', async () => {
  let roleReads = 0;
  const deps = (user: typeof founder | null, role: string, aal: string) => ({
    getUser: async () => user,
    getRole: async () => { roleReads += 1; return role; },
    getAal: async () => aal,
  });
  assert.equal((await authorizeFounderRequest(deps(null, 'owner', 'aal2'))).allowed, false);
  assert.equal((await authorizeFounderRequest(deps({ ...founder, email: 'normal@example.com' }, 'member', 'aal2'))).allowed, false);
  assert.equal((await authorizeFounderRequest(deps({ ...founder, email: 'admin@example.com' }, 'admin', 'aal2'))).allowed, false);
  assert.equal(roleReads, 0);
  assert.equal((await authorizeFounderRequest(deps(founder, 'member', 'aal2'))).allowed, false);
  assert.equal((await authorizeFounderRequest(deps(founder, 'owner', 'aal1'))).allowed, false);
  assert.equal((await authorizeFounderRequest(deps(founder, 'owner', 'aal2'))).allowed, true);
  assert.equal((await authorizeFounderRequest({ getUser: async () => founder, getRole: async () => { throw new Error('provider unavailable'); }, getAal: async () => 'aal2' })).allowed, false);
});
