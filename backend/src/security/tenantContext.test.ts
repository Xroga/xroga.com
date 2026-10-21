import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTenantContext, requireTenantContext, requireResourceOwner } from './tenantContext.js';
import { getTenantSupabaseAdmin } from './serviceRoleGuard.js';
import { TenantAccessError } from './tenantErrors.js';

const owner = '11111111-1111-4111-8111-111111111111';
test('server-derived context is immutable, credential-free and correlates requests independently', () => {
  const first = createTenantContext({ userId: owner, via: 'local_jwt' });
  const second = createTenantContext({ userId: owner, via: 'remote_getuser' });
  assert.equal(first.tenantId, owner); assert.equal(requireTenantContext(first), first);
  assert.notEqual(first.correlationId, second.correlationId);
  assert.ok(Object.isFrozen(first)); assert.deepEqual(Object.keys(first).sort(), ['correlationId','provenance','tenantId','userId']);
  requireResourceOwner(first, owner);
});
test('untrusted, missing and deserialized request scopes cannot grant privileged access', () => {
  const valid = createTenantContext({ userId: owner, via: 'local_jwt' });
  for (const value of [undefined, {}, {...valid}, JSON.parse(JSON.stringify(valid))]) {
    assert.throws(() => requireTenantContext(value), TenantAccessError);
    assert.throws(() => getTenantSupabaseAdmin(value as never), TenantAccessError);
  }
});
test('invalid identity or provenance is rejected, and owner mismatches are non-enumerating', () => {
  assert.throws(() => createTenantContext({ userId: '', via: 'local_jwt' }), TenantAccessError);
  assert.throws(() => createTenantContext({ userId: owner, via: 'request_body' as never }), TenantAccessError);
  const context = createTenantContext({ userId: owner, via: 'persisted_owner' });
  assert.throws(() => requireResourceOwner(context, '22222222-2222-4222-8222-222222222222'), (error: unknown) => error instanceof TenantAccessError && error.status === 404 && error.message === 'Resource not found.');
});
