/**
 * Production has no SUPABASE_JWT_SECRET, so its identities come from the remote path: `supabase.auth.getUser`
 * (`remote_getuser`), or `deduplicated` when concurrent requests share one token. A loopback server stands in for
 * Supabase so this exercises the real client and the real middleware, never the production project.
 */
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { requireTenantContext, type TenantContext } from '../security/tenantContext.js';

const USER_ID = '22222222-3333-4444-5555-666666666666';
const GOOD = 'remote-path-token-' + 'x'.repeat(40);
let server: Server;

before(async () => {
  server = createServer((req, res) => {
    const path = req.url ?? '';
    res.setHeader('Content-Type', 'application/json');
    if (path.startsWith('/auth/v1/user')) {
      const ok = (req.headers.authorization ?? '') === `Bearer ${GOOD}`;
      // a short delay lets concurrent requests share one in-flight check
      setTimeout(() => { res.statusCode = ok ? 200 : 401; res.end(JSON.stringify(ok ? { id: USER_ID, email: 'remote@example.test', aud: 'authenticated', role: 'authenticated' } : { msg: 'invalid JWT' })); }, 50);
      return;
    }
    if (path.startsWith('/rest/v1/')) { res.statusCode = 200; res.end(req.headers.accept?.includes('vnd.pgrst.object') ? JSON.stringify({ id: USER_ID }) : JSON.stringify([{ id: USER_ID, user_id: USER_ID }])); return; }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  process.env.SUPABASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-service-role-key';
  process.env.SUPABASE_ANON_KEY = 'test-only-anon-key';
  delete process.env.SUPABASE_JWT_SECRET;
  process.env.REQUIRE_REMOTE_AUTH_CHECK = '1';
});
after(() => { server.close(); delete process.env.REQUIRE_REMOTE_AUTH_CHECK; });

type Req = { headers: Record<string, string>; userId?: string; tenantContext?: TenantContext };
async function run(token: string): Promise<{ req: Req; next: boolean; status?: number }> {
  const { authMiddleware } = await import('./auth.js');
  const req: Req = { headers: { authorization: `Bearer ${token}` } };
  let status: number | undefined; let next = false;
  await new Promise<void>((resolve) => {
    const res = { status(c: number) { status = c; return this; }, json() { resolve(); return this; } } as never;
    void authMiddleware(req as never, res, () => { next = true; resolve(); });
  });
  return { req, next, status };
}

describe('auth middleware on the production (remote) identity path', () => {
  it('remote_getuser and deduplicated identities both receive an issued TenantContext', async () => {
    const results = await Promise.all([run(GOOD), run(GOOD), run(GOOD)]);
    const provenances = new Set<string>();
    for (const r of results) {
      assert.equal(r.next, true, `status ${r.status}`);
      const c = requireTenantContext(r.req.tenantContext);
      assert.equal(c.userId, USER_ID);
      assert.equal(c.tenantId, USER_ID);
      provenances.add(c.provenance);
    }
    assert.ok([...provenances].every((p) => p === 'remote_getuser' || p === 'deduplicated'), [...provenances].join());
  });

  it('a token Supabase rejects yields 401 and no context', async () => {
    const r = await run('rejected-token-' + 'y'.repeat(40));
    assert.equal(r.next, false);
    assert.equal(r.status, 401);
    assert.equal(r.req.tenantContext, undefined);
  });
});
