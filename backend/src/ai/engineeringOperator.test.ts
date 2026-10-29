import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import express from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MAX_TENANT_CAP, OperatorError, clearTenantLimit, getEngineeringDiagnostics, listTenantLimits, purgeExpiredEngineeringReservations,
  requireCap, requireCategory, requireUserId, retentionDaysFromEnv, setTenantLimit,
} from './engineeringOperator.js';
import { createEngineeringOperatorRouter, type EngineeringOperatorDeps } from '../routes/engineeringOperator.js';
import type { MeterConfig } from './resourceMeter.js';

const user = randomUUID();
const config = (over: Partial<MeterConfig> = {}): MeterConfig => ({ enabled: true, caps: {}, windowSeconds: 86_400, ...over });
function client(answer: (fn: string, args: Record<string, unknown>) => { data?: unknown; error?: { message: string } }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return { calls, c: { rpc: async (fn: string, args: Record<string, unknown>) => { calls.push({ fn, args }); const r = answer(fn, args); return { data: r.data ?? null, error: r.error ?? null }; } } as unknown as SupabaseClient };
}

test('input validation refuses a bad user, category or cap before any database call', async () => {
  const { c, calls } = client(() => ({ data: { state: 'set' } }));
  for (const bad of ['', 'not-a-uuid', 7, null]) assert.throws(() => requireUserId(bad), OperatorError);
  for (const bad of ['gpu_seconds', '', 4, undefined]) assert.throws(() => requireCategory(bad), OperatorError);
  for (const bad of [0, -1, NaN, Infinity, '5', MAX_TENANT_CAP * 10, null]) assert.throws(() => requireCap(bad), OperatorError);
  await assert.rejects(setTenantLimit('x', 'storage_bytes', 5, c), OperatorError);
  await assert.rejects(setTenantLimit(user, 'storage_bytes', -5, c), OperatorError);
  await assert.rejects(clearTenantLimit(user, 'nope', c), OperatorError);
  assert.equal(calls.length, 0);
});

test('set, clear and list call the fixed functions with exactly the validated arguments', async () => {
  const { c, calls } = client((fn) => (fn === 'clear_engineering_resource_limit' ? { data: { state: 'cleared' } } : fn === 'list_engineering_resource_limits' ? { data: [{ category: 'storage_bytes', cap: 5, updatedAt: 't' }] } : { data: { state: 'set' } }));
  await setTenantLimit(user, 'storage_bytes', 5000, c);
  assert.deepEqual(calls[0], { fn: 'set_engineering_resource_limit', args: { p_user: user, p_category: 'storage_bytes', p_cap: 5000 } });
  assert.equal(await clearTenantLimit(user, 'storage_bytes', c), 'cleared');
  assert.deepEqual((await listTenantLimits(user, c))[0], { category: 'storage_bytes', cap: 5, updatedAt: 't' });
});

test('database errors become a generic unavailable error and never expose their text', async () => {
  const { c } = client(() => ({ error: { message: 'relation "engineering_resource_limits" PRIVATE_CANARY' } }));
  for (const run of [() => setTenantLimit(user, 'storage_bytes', 5, c), () => clearTenantLimit(user, 'storage_bytes', c), () => listTenantLimits(user, c), () => getEngineeringDiagnostics(c, config())]) {
    await assert.rejects(run(), (e: unknown) => e instanceof OperatorError && e.code === 'UNAVAILABLE' && !/PRIVATE_CANARY|engineering_resource/.test(e.message));
  }
});

test('diagnostics pass the same thresholds the reconciler and sweep use, and report what "stale" meant and what is enforced', async () => {
  const payload = { generatedAt: 't', runs: { queuedWaiting: 1 }, deliveries: { pending: 2 }, reservations: { open: 3 }, samples: { staleWorkerRunIds: [] } };
  const { c, calls } = client(() => ({ data: payload }));
  const d = await getEngineeringDiagnostics(c, config({ caps: { storage_bytes: 100 } }));
  assert.equal(calls[0]!.fn, 'engineering_diagnostics');
  assert.equal(calls[0]!.args.p_queue_ttl, '3600 seconds'); assert.equal(calls[0]!.args.p_worker_stale, '300 seconds'); assert.equal(calls[0]!.args.p_hold_stale, '7200 seconds');
  assert.deepEqual(d.thresholds, { queueWaitSeconds: 3600, workerStaleSeconds: 300, holdStaleSeconds: 7200 });
  assert.deepEqual(d.metering.enforcedCategories, ['storage_bytes']);
  assert.equal(d.runs.queuedWaiting, 1);
});

test('retention: unset keeps rows, a bad or too-short value is refused, a valid one is a whole number of days', () => {
  assert.equal(retentionDaysFromEnv({}, 86_400), null);
  assert.equal(retentionDaysFromEnv({ XROGA_ENGINEERING_RETENTION_DAYS: '90' }, 86_400), 90);
  for (const bad of ['abc', '0', '-3', '1.5', '99999']) assert.throws(() => retentionDaysFromEnv({ XROGA_ENGINEERING_RETENTION_DAYS: bad }, 86_400), /between 1 and 3650/);
  assert.throws(() => retentionDaysFromEnv({ XROGA_ENGINEERING_RETENTION_DAYS: '1' }, 7 * 86_400), /cannot be shorter than the accounting window/);
});

test('purge does nothing when metering is off or no retention is set, and passes the configured period otherwise', async () => {
  const { c, calls } = client(() => ({ data: 4 }));
  assert.equal(await purgeExpiredEngineeringReservations(config({ enabled: false }), c, { XROGA_ENGINEERING_RETENTION_DAYS: '30' }), 0);
  assert.equal(await purgeExpiredEngineeringReservations(config(), c, {}), 0);
  assert.equal(calls.length, 0);
  assert.equal(await purgeExpiredEngineeringReservations(config(), c, { XROGA_ENGINEERING_RETENTION_DAYS: '30' }), 4);
  assert.deepEqual(calls[0], { fn: 'purge_engineering_reservations', args: { p_older_than: '30 days' } });
});

async function withRouter(deps: Partial<EngineeringOperatorDeps>, run: (base: string, audit: Array<[string, Record<string, unknown>]>) => Promise<void>) {
  const audit: Array<[string, Record<string, unknown>]> = [];
  const router = createEngineeringOperatorRouter({
    diagnostics: async () => ({ generatedAt: 't' } as never), list: async () => [], set: async () => undefined, clear: async () => 'cleared',
    audit: (e, d) => audit.push([e, d]), ...deps,
  });
  const app = express(); app.use(express.json()); app.use('/api/admin/engineering', router);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/admin/engineering`, audit); }
  finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
}

test('router: diagnostics and limit management work, validate input and audit changes', async () => {
  const seen: unknown[] = [];
  await withRouter({ set: async (...a) => { seen.push(a); }, clear: async () => 'absent' }, async (base, audit) => {
    assert.equal((await fetch(`${base}/diagnostics`)).status, 200);
    const put = await fetch(`${base}/limits/${user}/storage_bytes`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cap: 1234 }) });
    assert.equal(put.status, 200); assert.deepEqual(seen[0], [user, 'storage_bytes', 1234]);
    assert.equal(audit[0]![0], 'limit.set'); assert.equal(audit[0]![1].cap, 1234);
    const del = await fetch(`${base}/limits/${user}/storage_bytes`, { method: 'DELETE' });
    assert.deepEqual(await del.json(), { ok: true, state: 'absent' }); assert.equal(audit[1]![0], 'limit.clear');
  });
});

test('router: invalid input is a 400, an outage is a 503 without the underlying text', async () => {
  await withRouter({
    set: async () => { throw new OperatorError('INVALID', 'The cap must be a positive number.'); },
    diagnostics: async () => { throw new Error('connection to db.internal PRIVATE_CANARY failed'); },
  }, async (base) => {
    const bad = await fetch(`${base}/limits/${user}/storage_bytes`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cap: -1 }) });
    assert.equal(bad.status, 400);
    const down = await fetch(`${base}/diagnostics`);
    assert.equal(down.status, 503); assert.doesNotMatch(await down.text(), /PRIVATE_CANARY|db\.internal/);
  });
});

test('the operator routes are mounted only under the admin router, which is mounted behind the auth and admin middleware', () => {
  const admin = readFileSync(new URL('../routes/admin.ts', import.meta.url), 'utf8');
  const index = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
  assert.match(admin, /router\.use\('\/engineering', engineeringOperatorRouter\)/);
  assert.match(index, /app\.use\('\/api\/admin', authMiddleware, adminMiddleware, adminRouter\)/);
  assert.doesNotMatch(index, /engineeringOperator/, 'it is not mounted anywhere that skips the admin middleware');
});
