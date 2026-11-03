import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test, type TestContext } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import pg from 'pg';
import { createTenantContext } from './tenantContext.js';
import { createBusinessActionConfirmation, confirmBusinessAction } from '../services/integrations/businessActionConfirmations.js';
import { verifyPlanDigest, type BusinessActionPlan } from '../services/integrations/businessAction.js';

type Row = Record<string, any>;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)]));
  return value;
}
function plan(userId: string, ttl = 60_000): BusinessActionPlan {
  const issuedAt = new Date().toISOString();
  const unsigned: Omit<BusinessActionPlan, 'planDigest'> = { version: '1.0', sessionId: `trs_${randomUUID()}`,
    useCase: 'Delete an isolated synthetic message', toolkit: 'slack', toolSlug: 'SLACK_DELETE_MESSAGE',
    arguments: { channel: 'fixture-channel', message: 'fixture-message' }, risk: 'destructive', requiresConfirmation: true,
    summary: 'Delete the isolated synthetic message', requiredScopes: [], scopeRequirements: null,
    authority: { version: '1', userId, tenantId: userId, connectedAccountId: 'synthetic-account-A', actionClass: 'DELETE',
      projectId: null, runId: null, issuedAt, expiresAt: new Date(Date.now() + ttl).toISOString(), nonce: randomUUID(), maxSpendMicroUsd: null, currency: null } };
  const result = { ...unsigned, planDigest: createHash('sha256').update(JSON.stringify(canonical(unsigned))).digest('hex') };
  assert.equal(verifyPlanDigest(result), true); return result;
}

export function registerBusinessAuthorityTests(admin: SupabaseClient, getUsers: () => readonly { id: string; token: string }[]): void {
  const admittedEnvironment = () => {
    assert.equal(process.env.CI, 'true'); assert.equal(process.env.XB01_DISPOSABLE_SUPABASE, '1');
    assert.equal(process.env.SUPABASE_URL, 'http://127.0.0.1:54321');
  };
  const connect = () => {
    admittedEnvironment(); const url = new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '54322'); assert.equal(url.pathname, '/postgres');
    return new pg.Client({ connectionString: url.href, ssl: false });
  };
  const fixture = async (t: TestContext) => {
    admittedEnvironment();
    const created = await admin.auth.admin.createUser({ email: `authority-${randomUUID()}@example.invalid`, email_confirm: true });
    assert.equal(created.error, null); const userId = created.data.user!.id;
    t.after(async () => { assert.equal((await admin.auth.admin.deleteUser(userId)).error, null); });
    const seed = async (ttl?: number) => {
      const prepared = plan(userId, ttl), confirmation = await createBusinessActionConfirmation(userId, prepared);
      assert.equal(confirmation.approval?.accountReference, prepared.authority!.connectedAccountId);
      assert.equal(confirmation.approval?.actionDigest, prepared.planDigest);
      assert.deepEqual(confirmation.approval?.criticalParameters, prepared.arguments);
      const result = await admin.from('business_action_confirmations').select('*').eq('id', confirmation.id).single();
      assert.equal(result.error, null); assert.equal(Date.parse(result.data!.expires_at), Date.parse(prepared.authority!.expiresAt));
      return { prepared, row: result.data as Row };
    };
    const claim = async (row: Row) => {
      const result = await admin.rpc('claim_business_action_confirmation', { p_owner: userId, p_id: row.id,
        p_digest: row.plan_digest, p_plan: row.plan, p_expires: row.expires_at }).single<Row>();
      assert.equal(result.error, null); assert.equal(result.data.status, 'executing'); return result.data as Row;
    };
    const read = async (id: string) => { const result = await admin.from('business_action_confirmations').select('*').eq('id', id).single(); assert.equal(result.error, null); return result.data as Row; };
    return { userId, seed, claim, read };
  };

  test('real canonical business confirmation claims once and persists exact dispatch and terminal receipts with a synthetic provider', async t => {
    const f = await fixture(t), seeded = await f.seed(), actor = createTenantContext({ userId: f.userId, via: 'persisted_owner' });
    const originalFetch = globalThis.fetch; let effects = 0;
    const previousKey = process.env.COMPOSIO_API_KEY; process.env.COMPOSIO_API_KEY = 'synthetic-isolated-provider-key';
    t.after(() => { previousKey === undefined ? delete process.env.COMPOSIO_API_KEY : process.env.COMPOSIO_API_KEY = previousKey; });
    t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (url.origin === 'http://127.0.0.1:54321') return originalFetch(input, init);
      assert.equal(url.origin, 'https://backend.composio.dev', 'No unexpected external traffic is forwarded');
      const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.pathname.endsWith('/execute')) {
        effects++; const body = JSON.parse(String(init?.body));
        assert.equal(body.account, 'synthetic-account-A'); assert.equal(body.tool_slug, seeded.prepared.toolSlug);
        assert.deepEqual(body.arguments, seeded.prepared.arguments);
        assert.ok((await f.read(seeded.row.id)).effect_started_at, 'Durable admission precedes actual adapter effect');
        return response({ data: { receipt: 'SYNTHETIC_PROVIDER_NOT_LIVE' }, error: null });
      }
      if (url.pathname.includes('/tools/')) return response({ slug: seeded.prepared.toolSlug, toolkit: { slug: 'slack' }, tags: ['destructiveHint'], scopes: [] });
      if (url.pathname.endsWith('/search')) return response({ tool_schemas: { fixture: { tool_slug: seeded.prepared.toolSlug, toolkit: 'slack', input_schema: { type: 'object' } } } });
      if (url.pathname.endsWith('/toolkits')) return response({ items: [{ slug: 'slack', name: 'Slack', connected_account: { id: 'synthetic-account-A', status: 'ACTIVE' } }] });
      if (url.pathname.endsWith(`/${seeded.prepared.sessionId}`)) return response({ session_id: seeded.prepared.sessionId, config: { user_id: `xroga:${f.userId}`, workbench: { enable: false, enable_proxy_execution: false }, execute: { enable_multi_execute: false }, multi_account: { enable: true, require_explicit_selection: true } } });
      assert.fail('Unexpected provider path, never forwarded');
    });
    await assert.rejects(confirmBusinessAction({ ...actor }, seeded.row.id), { code: 'TENANT_AUTH_REQUIRED' });
    const results = await Promise.allSettled([confirmBusinessAction(actor, seeded.row.id), confirmBusinessAction(actor, seeded.row.id)]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.equal(effects, 1);
    const row = await f.read(seeded.row.id); assert.equal(row.user_id, f.userId); assert.equal(row.status, 'consumed');
    assert.deepEqual(row.plan, seeded.prepared); assert.equal(row.plan_digest, seeded.prepared.planDigest);
    for (const field of ['claimed_at', 'effect_started_at', 'completed_at']) assert.ok(Number.isFinite(Date.parse(row[field])));
    assert.equal(row.effect_receipt.grantId, row.id); assert.equal(row.effect_receipt.planDigest, seeded.prepared.planDigest);
    assert.equal(row.effect_receipt.account, 'synthetic-account-A'); assert.equal(row.effect_receipt.outcome, 'provider_reported_success');
    assert.match(row.effect_receipt.resultDigest, /^[a-f0-9]{64}$/); assert.ok(Number.isFinite(Date.parse(row.effect_receipt.recordedAt)));
    assert.equal(row.effect_receipt.resultDigest, createHash('sha256').update(JSON.stringify({ receipt: 'SYNTHETIC_PROVIDER_NOT_LIVE' })).digest('hex'));
    assert.equal(JSON.stringify(row.effect_receipt).includes('SYNTHETIC_PROVIDER_NOT_LIVE'), false, 'Persist a digest, never raw provider response data');
    await assert.rejects(confirmBusinessAction(actor, seeded.row.id), { code: 'BUSINESS_ACTION_CONFIRMATION_ALREADY_USED' });
    assert.equal(effects, 1); assert.deepEqual(await f.read(seeded.row.id), row);
  });

  test('real business dispatch admission rejects foreign, changed, cancelled, expired and replayed claims and browser roles', async t => {
    const f = await fixture(t), seeded = await f.seed(), claimed = await f.claim(seeded.row);
    const dispatch = (expected = claimed, owner = f.userId) => admin.rpc('authorize_business_action_dispatch', { p_owner: owner, p_expected: expected });
    const other = getUsers()[0];
    for (const expected of [{ ...claimed, user_id: other.id }, { ...claimed, plan_digest: 'b'.repeat(64) }, { ...claimed, plan: { ...claimed.plan, arguments: { changed: true } } }]) {
      const denied = await dispatch(expected); assert.equal(denied.error, null); assert.deepEqual(denied.data, []);
    }
    assert.deepEqual((await dispatch(claimed, other.id)).data, []);
    for (const token of [undefined, other.token]) {
      const browser = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}) });
      for (const name of ['authorize_business_action_dispatch', 'cancel_business_action_confirmation']) {
        const denied = await browser.rpc(name, name.startsWith('authorize') ? { p_owner: f.userId, p_expected: claimed } : { p_owner: f.userId, p_id: claimed.id });
        assert.equal(denied.error?.code, '42501');
      }
    }
    const admitted = await dispatch(); assert.equal(admitted.error, null); assert.equal(admitted.data.length, 1); assert.ok(admitted.data[0].effect_started_at);
    assert.deepEqual((await dispatch()).data, []);
    const cancel = await admin.rpc('cancel_business_action_confirmation', { p_owner: f.userId, p_id: claimed.id }).single();
    assert.equal(cancel.error, null); assert.deepEqual(cancel.data, admitted.data[0], 'Cannot imply cancellation after dispatch started');
    // No provider call in this test. Verify durable classification from actual
    // dispatch admission, independently of the adapter's timeout unit test.
    const receipt = { version: 1, grantId: claimed.id, planDigest: claimed.plan_digest, provider: claimed.toolkit,
      account: claimed.plan.authority.connectedAccountId, operation: claimed.plan.toolSlug };
    const finishArgs = { p_owner: f.userId, p_expected: { ...claimed, effect_receipt: receipt }, p_status: 'failed', p_failure_code: 'synthetic_unverified_dispatch' };
    const uncertain = await admin.rpc('finish_business_action_confirmation', finishArgs).single<Row>();
    assert.equal(uncertain.error, null); assert.equal(uncertain.data!.effect_receipt.outcome, 'dispatch_uncertain');
    assert.equal(uncertain.data!.effect_receipt.resultDigest, undefined);
    assert.deepEqual((await admin.rpc('finish_business_action_confirmation', finishArgs).single()).data, uncertain.data);
    const changedReceipt = await admin.rpc('finish_business_action_confirmation', { ...finishArgs,
      p_expected: { ...claimed, effect_receipt: { ...receipt, account: 'foreign-account' } } });
    assert.equal(changedReceipt.error?.code, '22023'); assert.deepEqual(await f.read(claimed.id), uncertain.data);
    const noDispatch = await f.seed(), noDispatchClaim = await f.claim(noDispatch.row);
    const beforeEffect = await admin.rpc('finish_business_action_confirmation', { ...finishArgs, p_expected: { ...noDispatchClaim,
      effect_receipt: { ...receipt, grantId: noDispatchClaim.id, planDigest: noDispatchClaim.plan_digest } } }).single<Row>();
    assert.equal(beforeEffect.error, null); assert.equal(beforeEffect.data!.effect_receipt.outcome, 'not_dispatched');
    assert.equal(beforeEffect.data!.effect_started_at, null);
    for (const mode of ['cancelled', 'expired']) {
      const fresh = await f.seed(), expected = await f.claim(fresh.row);
      if (mode === 'cancelled') assert.equal((await admin.rpc('cancel_business_action_confirmation', { p_owner: f.userId, p_id: expected.id })).error, null);
      else assert.equal((await admin.from('business_action_confirmations').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', expected.id)).error, null);
      assert.deepEqual((await dispatch(expected)).data, []); assert.equal((await f.read(expected.id)).effect_started_at, null);
    }
  });

  test('real business dispatch rechecks expiry, cancellation and plan after lock waits and rolls admission back', { timeout: 60_000 }, async t => {
    const f = await fixture(t), db = connect(); await db.connect();
    try {
      for (const mode of ['expiry', 'clock_expiry', 'cancel', 'plan', 'rollback']) {
        const seeded = await f.seed(mode === 'clock_expiry' ? 1500 : undefined), expected = await f.claim(seeded.row);
        if (mode === 'rollback') {
          await db.query('begin');
          const admission = await db.query('select * from authorize_business_action_dispatch($1,$2)', [f.userId, expected]);
          assert.equal(admission.rowCount, 1); await db.query('rollback');
          assert.equal((await f.read(expected.id)).effect_started_at, null); continue;
        }
        await db.query('begin'); await db.query('select id from business_action_confirmations where id=$1 for update', [expected.id]);
        const pending = Promise.resolve(admin.rpc('authorize_business_action_dispatch', { p_owner: f.userId, p_expected: expected }));
        void pending.catch(() => {}); let blocked = false;
        for (let n = 0; n < 150; n++) {
          await db.query('select pg_stat_clear_snapshot()');
          const wait = await db.query("select pid from pg_stat_activity where pid<>pg_backend_pid() and pg_backend_pid()=any(pg_blocking_pids(pid)) and wait_event_type='Lock' and query like '%authorize_business_action_dispatch%'");
          if (wait.rowCount) { blocked = true; break; } await delay(20);
        }
        assert.equal(blocked, true, `${mode} reached the held database lock`);
        if (mode === 'clock_expiry') await delay(1600);
        if (mode === 'expiry') await db.query("update business_action_confirmations set expires_at=clock_timestamp()-interval '1 second' where id=$1", [expected.id]);
        if (mode === 'cancel') await db.query("update business_action_confirmations set status='cancelled',completed_at=clock_timestamp() where id=$1", [expected.id]);
        if (mode === 'plan') await db.query("update business_action_confirmations set plan=jsonb_set(plan,'{arguments}', '{\"changed\":true}') where id=$1", [expected.id]);
        await db.query('commit'); const result = await pending; assert.equal(result.error, null); assert.deepEqual(result.data, []);
        assert.equal((await f.read(expected.id)).effect_started_at, null);
      }
    } finally { await db.query('rollback'); await db.end(); }
  });

  test('real business dispatch observes a read-only policy committed during its final policy lock wait', { timeout: 30_000 }, async t => {
    const f = await fixture(t), db = connect(); await db.connect();
    const provider = 'xroga_plugin_permission_policy__slack';
    try {
     for (const mode of ['existing','absent']) {
      const seeded = await f.seed(), expected = await f.claim(seeded.row);
      assert.equal((await admin.from('user_integrations').delete().eq('user_id', f.userId).eq('provider', provider)).error, null);
      if (mode === 'existing') assert.equal((await admin.from('user_integrations').insert({ user_id: f.userId, provider, access_token: 'full_access', metadata: { mode: 'full_access', type: 'plugin_permission_policy' } })).error, null);
      await db.query('begin');
      // Real INSERT/UPDATE trigger acquires the same transaction mutex that
      // admission uses, including when the policy row did not exist at all.
      if (mode === 'existing') await db.query("update user_integrations set access_token='read_only',metadata='{\"mode\":\"read_only\",\"type\":\"plugin_permission_policy\"}' where user_id=$1 and provider=$2", [f.userId, provider]);
      else await db.query("insert into user_integrations(user_id,provider,access_token,metadata) values($1,$2,'read_only','{\"mode\":\"read_only\",\"type\":\"plugin_permission_policy\"}')", [f.userId, provider]);
      const pending = Promise.resolve(admin.rpc('authorize_business_action_dispatch', { p_owner: f.userId, p_expected: expected }));
      void pending.catch(() => {}); let blocked = false;
      for (let n = 0; n < 150; n++) {
        await db.query('select pg_stat_clear_snapshot()');
        const wait = await db.query("select pid from pg_stat_activity where pid<>pg_backend_pid() and pg_backend_pid()=any(pg_blocking_pids(pid)) and wait_event_type='Lock' and query like '%authorize_business_action_dispatch%'");
        if (wait.rowCount) { blocked = true; break; } await delay(20);
      }
      assert.equal(blocked, true);
      await db.query('commit'); const denied = await pending; assert.equal(denied.error, null); assert.deepEqual(denied.data, []);
      assert.equal((await f.read(expected.id)).effect_started_at, null);
     }
    } finally { await db.query('rollback'); await db.end(); }
  });
}
