/**
 * Bounds the number of Supabase round trips one authenticated page load costs.
 *
 * This is the regression guard for the egress incident: every authenticated request
 * used to spend one `/auth/v1/user` call plus three provisioning selects, and a
 * single page load issues a dozen or more requests. The arithmetic — not any single
 * slow query — is what consumed 29 GB against a 5 GB quota.
 *
 * A loopback HTTP server stands in for Supabase so the counts are real network
 * round trips through the actual `@supabase/supabase-js` client, while never
 * touching the production project.
 */

import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { AddressInfo } from 'node:net';
import { SignJWT, jwtVerify } from 'jose';
import { FREE_TRIAL_ACTIONS } from '../config/plans.js';

const JWT_SECRET = 'test-only-jwt-secret-not-a-real-credential-000000';
const USER_ID = '11111111-2222-3333-4444-555555555555';
const USER_EMAIL = 'tester@example.test';

/** Every request path the fake Supabase served, in order. */
let requestPaths: string[] = [];
let server: Server;
let baseUrl = '';

function bodyFor(path: string, wantsSingleObject: boolean): unknown {
  if (path.startsWith('/rest/v1/profiles')) {
    const row = { id: USER_ID };
    return wantsSingleObject ? row : [row];
  }
  if (path.startsWith('/rest/v1/user_actions')) {
    // Already correct for a free user, so provisioning has no repair to write.
    const row = { plan_tier: 'unpaid', total_actions: FREE_TRIAL_ACTIONS, used_actions: 0 };
    return wantsSingleObject ? row : [row];
  }
  if (path.startsWith('/rest/v1/user_token_usage')) {
    const row = { user_id: USER_ID };
    return wantsSingleObject ? row : [row];
  }
  return wantsSingleObject ? {} : [];
}

before(async () => {
  server = createServer((req, res) => {
    const path = req.url ?? '';
    requestPaths.push(path);
    res.setHeader('Content-Type', 'application/json');

    if (path.startsWith('/auth/v1/user')) {
      // Behave like real Supabase Auth: reject a token this project did not sign,
      // one that has expired, and one from a different issuer. Without this the
      // fallback path would rubber-stamp anything and the rejection cases below
      // would prove nothing.
      const bearer = (req.headers.authorization ?? '').replace(/^Bearer /i, '');
      void jwtVerify(bearer, new TextEncoder().encode(JWT_SECRET), {
        issuer: `${baseUrl}/auth/v1`,
      })
        .then(({ payload }) => {
          res.statusCode = 200;
          res.end(
            JSON.stringify({
              id: payload.sub,
              email: payload.email,
              aud: 'authenticated',
              role: 'authenticated',
            })
          );
        })
        .catch(() => {
          res.statusCode = 401;
          res.end(JSON.stringify({ message: 'invalid JWT' }));
        });
      return;
    }

    const wantsSingleObject = (req.headers.accept ?? '').includes('pgrst.object');
    res.statusCode = 200;
    res.end(JSON.stringify(bodyFor(path, wantsSingleObject)));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;

  process.env.SUPABASE_URL = baseUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-service-role-key';
  process.env.SUPABASE_ANON_KEY = 'test-only-anon-key';
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  delete process.env.REQUIRE_REMOTE_AUTH_CHECK;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function signToken(): Promise<string> {
  return new SignJWT({ email: USER_EMAIL, role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(USER_ID)
    .setIssuer(`${baseUrl}/auth/v1`)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(JWT_SECRET));
}

/** Drives the real middleware the way Express would, and reports whether it passed. */
async function runAuthMiddleware(token: string): Promise<{ userId?: string; status?: number }> {
  const { authMiddleware } = await import('../middleware/auth.js');
  const req = { headers: { authorization: `Bearer ${token}` } } as never;
  let status: number | undefined;

  // Settles on whichever the middleware does: call next(), or respond. Waiting on
  // the middleware's own promise is not enough — a rejection path responds and
  // never calls next(), and a fixed timeout would race the loopback server.
  await new Promise<void>((resolve) => {
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json() {
        resolve();
        return this;
      },
    } as never;
    void authMiddleware(req, res, () => resolve());
  });

  return { userId: (req as { userId?: string }).userId, status };
}

async function resetCaches(): Promise<void> {
  const { resetProvisioningCache } = await import('../services/userProvisioningCache.js');
  const { resetIdentityResolution } = await import('./resolveIdentity.js');
  resetProvisioningCache();
  resetIdentityResolution();
  requestPaths = [];
}

describe('Supabase round trips for one authenticated page load', () => {
  it('provisions once and verifies locally, so a page load costs a bounded number of calls', async () => {
    await resetCaches();
    const token = await signToken();

    // A realistic first paint: sidebar, profile, token usage, notifications,
    // dashboard, repo context, terminal sessions… twelve authenticated requests.
    const REQUESTS_PER_PAGE_LOAD = 12;
    for (let i = 0; i < REQUESTS_PER_PAGE_LOAD; i += 1) {
      const result = await runAuthMiddleware(token);
      assert.equal(result.userId, USER_ID, `request ${i} must still authenticate`);
    }

    const authCalls = requestPaths.filter((p) => p.startsWith('/auth/v1/user')).length;
    const restCalls = requestPaths.filter((p) => p.startsWith('/rest/v1/')).length;

    assert.equal(
      authCalls,
      0,
      'a valid project-signed token is verified cryptographically, with no Auth round trip'
    );
    assert.equal(
      restCalls,
      3,
      'provisioning reads profiles, user_actions and user_token_usage exactly once per user'
    );

    // The bound the incident is about: total calls must not scale with request count.
    assert.ok(
      requestPaths.length <= 4,
      `expected at most 4 Supabase calls per page load, got ${requestPaths.length}`
    );
  });

  it('costs nothing extra as the session continues past the first page', async () => {
    // Continues from the previous case's warm state deliberately — this is the
    // steady state a signed-in user spends almost all of their time in.
    requestPaths = [];
    const token = await signToken();
    for (let i = 0; i < 25; i += 1) {
      const result = await runAuthMiddleware(token);
      assert.equal(result.userId, USER_ID);
    }
    assert.equal(
      requestPaths.length,
      0,
      'an already-provisioned user with a valid token needs no Supabase traffic to authenticate'
    );
  });

  it('collapses a concurrent burst into one provisioning pass', async () => {
    await resetCaches();
    const token = await signToken();

    // Twenty requests in flight at once, as happens on a hard refresh.
    const results = await Promise.all(
      Array.from({ length: 20 }, () => runAuthMiddleware(token))
    );
    for (const result of results) assert.equal(result.userId, USER_ID);

    const restCalls = requestPaths.filter((p) => p.startsWith('/rest/v1/')).length;
    assert.equal(restCalls, 3, 'concurrent first requests must share one provisioning pass');
  });

  it('still rejects a token this project did not sign', async () => {
    await resetCaches();
    const forged = await new SignJWT({ email: 'attacker@example.test' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('99999999-9999-9999-9999-999999999999')
      .setIssuer(`${baseUrl}/auth/v1`)
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('a-different-secret-entirely-0000000000'));

    const result = await runAuthMiddleware(forged);
    assert.equal(result.userId, undefined, 'a token signed with the wrong key must not authenticate');
  });

  it('still rejects an expired token', async () => {
    await resetCaches();
    const expired = await new SignJWT({ email: USER_EMAIL })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(USER_ID)
      .setIssuer(`${baseUrl}/auth/v1`)
      .setAudience('authenticated')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(new TextEncoder().encode(JWT_SECRET));

    const result = await runAuthMiddleware(expired);
    assert.equal(result.userId, undefined, 'an expired token must not authenticate');
  });

  it('still rejects a token issued by a different Supabase project', async () => {
    await resetCaches();
    const foreign = await new SignJWT({ email: USER_EMAIL })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(USER_ID)
      .setIssuer('https://someone-elses-project.supabase.co/auth/v1')
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(JWT_SECRET));

    const result = await runAuthMiddleware(foreign);
    assert.equal(result.userId, undefined, 'a foreign issuer must not authenticate');
  });
});

describe('the behaviour this replaced, measured the same way', () => {
  it('cost one auth call plus three selects on every single request', async () => {
    // Reproduces the old code path exactly: remote verification forced, and no
    // memory that this user was already provisioned.
    process.env.REQUIRE_REMOTE_AUTH_CHECK = '1';
    const { resetProvisioningCache } = await import('../services/userProvisioningCache.js');
    const { resetIdentityResolution } = await import('./resolveIdentity.js');
    const token = await signToken();

    requestPaths = [];
    const REQUESTS = 12;
    for (let i = 0; i < REQUESTS; i += 1) {
      resetProvisioningCache();
      resetIdentityResolution();
      const result = await runAuthMiddleware(token);
      assert.equal(result.userId, USER_ID);
    }
    delete process.env.REQUIRE_REMOTE_AUTH_CHECK;

    const authCalls = requestPaths.filter((p) => p.startsWith('/auth/v1/user')).length;
    const restCalls = requestPaths.filter((p) => p.startsWith('/rest/v1/')).length;

    assert.equal(authCalls, REQUESTS, 'the old path spent one Auth round trip per request');
    assert.equal(restCalls, REQUESTS * 3, 'and re-read all three provisioning rows each time');
    assert.equal(requestPaths.length, 48, '12 requests × 4 calls — the number this PR removes');
  });
});
