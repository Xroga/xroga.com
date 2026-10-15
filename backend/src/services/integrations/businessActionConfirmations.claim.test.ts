import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { confirmBusinessAction } from './businessActionConfirmations.js';

test('confirmation claims bind owner, reviewed digest and expiry and admit one concurrent claimant', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const id = '22222222-2222-4222-8222-222222222222';
  const digest = 'a'.repeat(64);
  // Deliberately invalid canonical digest stops the admitted fixture before any provider request.
  const row = { id, user_id: userId, status: 'pending', plan_digest: digest,
    expires_at: new Date(Date.now() + 60000).toISOString(),
    plan: { version: '1.0', sessionId: 'trs_fixture', useCase: 'fixture', toolkit: 'fixture',
      toolSlug: 'fixture', arguments: {}, risk: 'write', requiresConfirmation: true,
      summary: 'fixture', requiredScopes: [], planDigest: digest } };
  let mode = 'changed';
  let claims = 0;
  let admitted = false;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    assert.equal(url.pathname, '/rest/v1/business_action_confirmations');
    assert.equal(url.searchParams.get('user_id'), `eq.${userId}`);
    assert.equal(url.searchParams.get('id'), `eq.${id}`);
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    let result: unknown = row;
    if (body?.status === 'executing') {
      claims++;
      assert.equal(url.searchParams.get('status'), 'eq.pending');
      assert.equal(url.searchParams.get('plan_digest'), `eq.${digest}`);
      assert.equal(url.searchParams.get('expires_at'), `gt.${body.claimed_at}`);
      assert.ok(Number.isFinite(Date.parse(body.claimed_at)));
      if (mode === 'changed' || mode === 'expired' || admitted) result = null;
      else {
        admitted = true;
        result = { ...row, status: 'executing', ...(mode === 'bad-receipt' ? { plan_digest: 'b'.repeat(64) } : {}) };
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  });
  const previous = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-loopback-only';
    for (mode of ['changed', 'expired']) {
      await assert.rejects(confirmBusinessAction(userId, id), { code: 'BUSINESS_ACTION_CONFIRMATION_ALREADY_USED' });
    }
    mode = 'bad-receipt';
    await assert.rejects(confirmBusinessAction(userId, id), { code: 'BUSINESS_ACTION_CONFIRMATION_INVALID' });
    mode = 'concurrent';
    admitted = false;
    const outcomes = await Promise.allSettled([confirmBusinessAction(userId, id), confirmBusinessAction(userId, id)]);
    const codes = outcomes.map(outcome => outcome.status === 'rejected' ? outcome.reason.code : 'UNEXPECTED_SUCCESS').sort();
    assert.deepEqual(codes, ['BUSINESS_ACTION_CONFIRMATION_ALREADY_USED', 'BUSINESS_ACTION_PLAN_CHANGED']);
    assert.equal(claims, 5);
  } finally {
    if (previous.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
