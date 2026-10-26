import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { afterEach, test, type TestContext } from 'node:test';

import { executeAuthorizedAction } from '../security/authority/enforce.js';
import { preparedActionDigest } from '../security/authority/digest.js';
import { createTenantContext } from '../security/tenantContext.js';
import { businessActionAuthorityScope, executePreparedBusinessAction, type BusinessActionPlan } from '../services/integrations/businessAction.js';

/**
 * Several connected accounts, end to end through the real preparation and execution code with only Composio's
 * HTTP layer stubbed: the account an action is prepared for is the account it runs as, never merely the most
 * recently connected one. Nothing is forwarded to Composio.
 */
const OWNER = '11111111-1111-4111-8111-111111111111';
const SESSION = 'trs_multi_fixture';
const TOOL = 'SLACK_DELETE_MESSAGE';

type Account = { id: string; extra?: Record<string, unknown> };

function stub(t: TestContext, accounts: Account[], mostRecent = 'ca_main'): { executed: Array<Record<string, unknown>> } {
  const previousKey = process.env.COMPOSIO_API_KEY;
  process.env.COMPOSIO_API_KEY = 'multi-account-test-not-a-real-key';
  process.env.XROGA_COMPOSIO_MULTI_ACCOUNT = 'enabled';
  t.after(() => {
    if (previousKey === undefined) delete process.env.COMPOSIO_API_KEY;
    else process.env.COMPOSIO_API_KEY = previousKey;
  });
  const executed: Array<Record<string, unknown>> = [];
  const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.origin, 'https://backend.composio.dev', 'no traffic to anything but the stubbed provider');
    const path = url.pathname;
    if (path.endsWith('/execute')) {
      executed.push(JSON.parse(String(init?.body)));
      return json({ result_type: 'completed', data: { ok: true, reference: 'fixture-1' }, error: null });
    }
    if (path === '/api/v3.1/connected_accounts') {
      assert.deepEqual(url.searchParams.getAll('user_ids'), [`xroga:${OWNER}`]);
      return json({ items: accounts.map((account) => ({ id: account.id, toolkit: { slug: 'slack' }, status: 'ACTIVE', alias: null, ...account.extra })) });
    }
    if (path.includes('/tools/')) return json({ slug: TOOL, toolkit: { slug: 'slack' }, tags: ['destructiveHint'], input_parameters: { type: 'object' }, scopes: ['fixture.message.delete'] });
    if (path.endsWith('/search')) return json({ tool_schemas: { fixture: { tool_slug: TOOL, toolkit: 'slack', description: 'Synthetic fixture only', input_schema: { type: 'object' } } } });
    if (path.endsWith('/toolkits')) return json({ items: [{ slug: 'slack', name: 'Slack', connected_account: { id: mostRecent, status: 'ACTIVE' } }] });
    if (path.endsWith('/session') || path.endsWith(`/${SESSION}`)) {
      return json({ session_id: SESSION, config: { user_id: `xroga:${OWNER}`, instant: false, workbench: { enable: false, enable_proxy_execution: false }, execute: { enable_multi_execute: false }, multi_account: { enable: true, require_explicit_selection: true }, tags: ['readOnlyHint'] } });
    }
    assert.fail(`Unexpected provider path ${path}`);
  });
  return { executed };
}

afterEach(() => {
  delete process.env.XROGA_COMPOSIO_MULTI_ACCOUNT;
});

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)]));
  return value;
}

/** A prepared plan whose approval is bound to `accountId`, built the way the preparation step builds it. */
function planFor(accountId: string): BusinessActionPlan {
  const authority: NonNullable<BusinessActionPlan['authority']> = {
    version: '1', userId: OWNER, tenantId: OWNER, connectedAccountId: accountId, actionClass: 'DELETE', projectId: null, runId: null,
    issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), nonce: 'fixture-server-nonce', maxSpendMicroUsd: null, currency: null,
  };
  const unsigned = {
    version: '1.0' as const, sessionId: SESSION, useCase: 'Delete the selected fixture Slack message', toolkit: 'slack', toolSlug: TOOL, arguments: { message_id: 'fixture-message' },
    risk: 'destructive' as const, requiresConfirmation: true, requiredScopes: ['fixture.message.delete'], scopeRequirements: null, summary: 'Delete fixture message', authority,
  };
  return { ...unsigned, planDigest: createHash('sha256').update(JSON.stringify(canonical(unsigned))).digest('hex') } as BusinessActionPlan;
}

async function runApproved(plan: BusinessActionPlan) {
  const scope = businessActionAuthorityScope(plan);
  const context = createTenantContext({ userId: OWNER, via: 'remote_getuser' });
  const claim = { id: 'fixture-claim', userId: OWNER, scopeDigest: preparedActionDigest(scope), expiresAt: scope.expiresAt, claimedAt: new Date().toISOString() };
  return executeAuthorizedAction({ context, scope, claim, revalidateBeforeEffect: async () => claim }, (authorityPermit) =>
    executePreparedBusinessAction({ userId: OWNER, plan, authorization: { explicitUserAuthorization: true, confirmedHighRisk: true }, authorityPermit }));
}

test('an approved action runs as exactly the account it was approved for, not the most recently connected one', async (t) => {
  const calls = stub(t, [{ id: 'ca_main' }, { id: 'ca_work' }]);
  const result = await runApproved(planFor('ca_work'));
  assert.equal(result.status, 'success');
  assert.equal(calls.executed.length, 1);
  assert.equal(calls.executed[0].account, 'ca_work', 'Composio is told to run as exactly that account');
});

test('an approval bound to an account that is no longer the caller\'s own active private account runs nothing', async (t) => {
  const calls = stub(t, [{ id: 'ca_main' }, { id: 'ca_shared', extra: { experimental: { account_type: 'SHARED' } } }, { id: 'ca_off', extra: { is_disabled: true } }]);
  for (const id of ['ca_work_disconnected', 'ca_shared', 'ca_off']) {
    await assert.rejects(runApproved(planFor(id)), (error: { code?: string }) => ['COMPOSIO_ACCOUNT_NOT_OWNED', 'COMPOSIO_ACTION_ACCOUNT_CHANGED'].includes(error.code ?? ''), id);
  }
  assert.equal(calls.executed.length, 0);
});

test('an approved older account runs as itself even when another account was connected more recently', async (t) => {
  const calls = stub(t, [{ id: 'ca_main' }, { id: 'ca_work' }], 'ca_work');
  assert.equal((await runApproved(planFor('ca_main'))).status, 'success');
  assert.equal(calls.executed[0].account, 'ca_main');
});
