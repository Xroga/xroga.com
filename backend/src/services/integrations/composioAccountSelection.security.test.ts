import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createTenantContext } from '../../security/tenantContext.js';
import { nativeReleaseFixture } from '../publish/__tests__/nativeReleaseFixture.js';
import { actionPlanDigest, type BusinessActionPlan } from './businessAction.js';
import { confirmBusinessAction, createBusinessActionConfirmation } from './businessActionConfirmations.js';
import { createActionComposioSession } from './composioClient.js';

const OWNER = '11111111-1111-4111-8111-111111111111';
const ACCOUNT = 'ca_synthetic_gmail';

async function exercise(t: TestContext,
  mode: 'single' | 'ambiguous' | 'multi') {
  const env = {
    COMPOSIO_API_KEY: 'synthetic-composio-key',
    SUPABASE_URL: 'https://composio-account-fixture.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-store',
  };
  const prior = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const context = createTenantContext({ userId: OWNER, via: 'remote_getuser' });
  const fixture = nativeReleaseFixture(OWNER);
  let executions = 0;
  let accountLookups = 0;
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.origin === env.SUPABASE_URL) {
      if (url.pathname.endsWith('/user_integrations')) return Response.json(null);
      return (await fixture.database(url, init))!;
    }
    assert.equal(url.origin, 'https://backend.composio.dev');
    if (url.pathname.endsWith('/connected_accounts')) {
      accountLookups++;
      assert.equal(url.searchParams.get('toolkit_slugs'), 'gmail');
      assert.equal(url.searchParams.get('user_ids'), `xroga:${OWNER}`);
      return Response.json({ items: [
        { id: ACCOUNT, user_id: `xroga:${OWNER}`, toolkit: { slug: 'gmail' }, status: 'ACTIVE' },
        ...(mode === 'ambiguous' ? [{ id: 'ca_other', user_id: `xroga:${OWNER}`, toolkit: { slug: 'gmail' }, status: 'ACTIVE' }] : []),
      ] });
    }
    if (url.pathname.endsWith('/execute')) {
      executions++;
      const body = JSON.parse(String(init?.body));
      assert.equal(body.tool_slug, 'GMAIL_SEND_EMAIL');
      assert.deepEqual(body.arguments, { recipient_email: 'fixture@example.invalid', body: 'Synthetic test' });
      if (mode === 'multi') assert.equal(body.account, ACCOUNT);
      else assert.equal(Object.hasOwn(body, 'account'), false);
      return Response.json({ result_type: 'completed', data: { id: 'synthetic-message-id' } });
    }
    if (url.pathname.includes('/tools/')) return Response.json({ slug: 'GMAIL_SEND_EMAIL', toolkit: { slug: 'gmail' }, scopes: ['gmail.send'] });
    if (url.pathname.endsWith('/search')) return Response.json({ tool_schemas: {
      tool: { toolkit: 'gmail', tool_slug: 'GMAIL_SEND_EMAIL', input_schema: { type: 'object' } },
    } });
    if (url.pathname.endsWith('/toolkits')) return Response.json({ items: [{ slug: 'gmail', connected_account: { id: ACCOUNT, user_id: `xroga:${OWNER}`, status: 'ACTIVE' } }] });
    return Response.json({ session_id: 'trs_synthetic', config: { user_id: `xroga:${OWNER}`, multi_account: { enable: mode === 'multi' } } });
  });
  const issuedAt = new Date().toISOString();
  const unsigned: Omit<BusinessActionPlan, 'planDigest'> = {
    version: '1.0', sessionId: 'trs_synthetic', useCase: 'Send the synthetic test email',
    toolkit: 'gmail', toolSlug: 'GMAIL_SEND_EMAIL',
    arguments: { recipient_email: 'fixture@example.invalid', body: 'Synthetic test' },
    risk: 'write', requiresConfirmation: true, summary: 'Send one synthetic test email', requiredScopes: ['gmail.send'],
    authority: { version: '1', userId: OWNER, tenantId: OWNER, connectedAccountId: ACCOUNT,
      actionClass: 'SEND_COMMUNICATION', projectId: null, runId: null, issuedAt,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(), nonce: 'synthetic-nonce',
      maxSpendMicroUsd: null, currency: null },
  };
  const confirmation = await createBusinessActionConfirmation(OWNER, { ...unsigned, planDigest: actionPlanDigest(unsigned) });
  if (mode === 'ambiguous') {
    await assert.rejects(confirmBusinessAction(context, confirmation.id), { code: 'COMPOSIO_ACTION_ACCOUNT_AMBIGUOUS' });
    assert.equal(fixture.row?.status, 'failed');
    assert.equal(executions, 0);
    assert.equal(accountLookups, 1);
  } else {
    const result = await confirmBusinessAction(context, confirmation.id);
    assert.equal(result.confirmation.status, 'consumed');
    assert.equal(executions, 1);
    assert.equal(accountLookups, mode === 'multi' ? 0 : 1);
  }
}

test('confirmed single-account Gmail action omits unsupported account field', t => exercise(t, 'single'));
test('confirmed action fails closed if disabled multi-account session has two Gmail accounts', t => exercise(t, 'ambiguous'));
test('confirmed multi-account action pins the approved Gmail account', t => exercise(t, 'multi'));

test('new Composio sessions require exact account selection', async t => {
  const priorKey = process.env.COMPOSIO_API_KEY;
  process.env.COMPOSIO_API_KEY = 'synthetic-composio-key';
  t.after(() => {
    if (priorKey === undefined) delete process.env.COMPOSIO_API_KEY;
    else process.env.COMPOSIO_API_KEY = priorKey;
  });
  const context = createTenantContext({ userId: OWNER, via: 'remote_getuser' });
  let posts = 0;
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://backend.composio.dev');
    if (init?.method === 'POST') {
      posts++;
      const body = JSON.parse(String(init.body));
      assert.equal(body.user_id, `xroga:${OWNER}`);
      assert.deepEqual(body.multi_account, { enable: true, require_explicit_selection: true });
      assert.equal(body.execute.enable_multi_execute, false);
    }
    return Response.json({ session_id: 'trs_synthetic', config: {
      user_id: `xroga:${OWNER}`, multi_account: { enable: true, require_explicit_selection: true },
    } });
  });
  await createActionComposioSession(OWNER, context);
  assert.equal(posts, 1);
});
