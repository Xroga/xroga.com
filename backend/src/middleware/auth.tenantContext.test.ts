/**
 * The auth middleware is the only place a request receives its TenantContext. These tests drive the real
 * middleware with a locally verified token (no network, no provisioning) and check that the context is
 * issued, matches the verified identity, cannot be pre-seeded by the caller, and is absent when auth fails.
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { SignJWT } from 'jose';
import { requireTenantContext, type TenantContext } from '../security/tenantContext.js';

const JWT_SECRET = 'test-only-jwt-secret-not-a-real-credential-000000';
const BASE_URL = 'http://127.0.0.1:9';
const USER_ID = '11111111-2222-3333-4444-555555555555';

before(() => {
  process.env.SUPABASE_URL = BASE_URL;
  process.env.SUPABASE_ANON_KEY = 'test-only-anon-key';
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY; // skips provisioning, so nothing leaves the process
  delete process.env.REQUIRE_REMOTE_AUTH_CHECK;
});

function sign(subject: string, secret = JWT_SECRET): Promise<string> {
  return new SignJWT({ email: 'tester@example.test', role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(subject)
    .setIssuer(`${BASE_URL}/auth/v1`)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(secret));
}

type Req = { headers: Record<string, string>; userId?: string; tenantContext?: TenantContext };

async function run(which: 'authMiddleware' | 'optionalAuthMiddleware', req: Req): Promise<{ next: boolean; status?: number }> {
  const mod = await import('./auth.js');
  let status: number | undefined;
  let next = false;
  await new Promise<void>((resolve) => {
    const res = { status(code: number) { status = code; return this; }, json() { resolve(); return this; } } as never;
    void mod[which](req as never, res, () => { next = true; resolve(); });
  });
  return { next, status };
}

describe('auth middleware issues the canonical TenantContext', () => {
  for (const which of ['authMiddleware', 'optionalAuthMiddleware'] as const) {
    it(`${which}: a verified token yields an issued context for that user`, async () => {
      const req: Req = { headers: { authorization: `Bearer ${await sign(USER_ID)}` } };
      const r = await run(which, req);
      assert.equal(r.next, true);
      const context = requireTenantContext(req.tenantContext);
      assert.equal(context.userId, USER_ID);
      assert.equal(context.tenantId, USER_ID);
      assert.equal(req.userId, USER_ID);
      assert.ok(Object.isFrozen(context));
    });

    it(`${which}: a caller-supplied context is discarded, never trusted`, async () => {
      const forged = { userId: USER_ID, tenantId: USER_ID, provenance: 'local_jwt', correlationId: 'x' } as unknown as TenantContext;
      const req: Req = { headers: { authorization: 'Bearer not-a-valid-token' }, tenantContext: forged, userId: USER_ID };
      const r = await run(which, req);
      assert.equal(r.next, false);
      assert.equal(r.status, 401);
      assert.equal(req.tenantContext, undefined);
      assert.equal(req.userId, undefined);
    });
  }

  it('a token signed with another secret yields no context', async () => {
    const req: Req = { headers: { authorization: `Bearer ${await sign(USER_ID, 'another-secret-another-secret-000000000')}` } };
    const r = await run('authMiddleware', req);
    assert.equal(r.next, false);
    assert.equal(req.tenantContext, undefined);
  });

  it('optional auth without a header passes through with no context', async () => {
    const req: Req = { headers: {}, tenantContext: {} as TenantContext };
    const r = await run('optionalAuthMiddleware', req);
    assert.equal(r.next, true);
    assert.equal(req.tenantContext, undefined);
  });
});
