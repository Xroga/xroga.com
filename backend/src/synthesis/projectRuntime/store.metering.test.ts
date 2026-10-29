import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { SupabaseProjectRuntimeStore } from './store.js';
import type { SoftwareProject } from '../softwareProject.js';

const owner = '11111111-1111-4111-8111-111111111111';
const run = randomUUID();
const FILE = 'x'.repeat(1500);
const project = (): SoftwareProject => ({ projectId: 'logical-project', runId: run, contract: { projectId: 'logical-project', runId: run },
  workspace: { files: [{ path: 'a.js', content: FILE }, { path: 'b.js', content: 'héllo' }] } } as SoftwareProject);
const BYTES = Buffer.byteLength(FILE, 'utf8') + Buffer.byteLength('héllo', 'utf8');

/** Loopback PostgREST: the revisions table plus the two ledger functions. Records ledger traffic. */
const mode: { failInsert?: boolean; cap?: boolean } = {};
async function withServer(body: (calls: Array<{ fn: string; args: Record<string, unknown> }>) => Promise<void>) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const rows = new Map<string, Record<string, unknown>>();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    let raw = ''; for await (const chunk of req) raw += chunk;
    const json = (status: number, value: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = url.pathname.split('/').pop()!; const args = JSON.parse(raw || '{}'); calls.push({ fn, args });
      if (fn === 'reserve_engineering_resource') return json(200, mode.cap ? { state: 'exhausted', used: 10, cap: 20 } : { state: 'reserved', reservationId: randomUUID() });
      return json(200, { state: 'settled', settledUnits: args.p_actual });
    }
    if (req.method === 'GET') { const id = /revision_id=eq\.([0-9a-f-]+)/i.exec(url.search)?.[1] ?? ''; return json(200, rows.has(id) ? [rows.get(id)] : []); }
    if (mode.failInsert) return json(403, { message: 'denied' });
    const inserted = { ...JSON.parse(raw), revision_id: randomUUID(), revision_number: 1, created_at: new Date().toISOString() };
    rows.set(String(inserted.revision_id), inserted); return json(200, inserted);
  });
  const previous = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY, on: process.env.XROGA_ENGINEERING_METERING, cap: process.env.XROGA_ENGINEERING_CAP_STORAGE_BYTES };
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    process.env.SUPABASE_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}`; process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-loopback-only';
    process.env.XROGA_ENGINEERING_METERING = '1'; delete process.env.XROGA_ENGINEERING_CAP_STORAGE_BYTES;
    await body(calls);
  } finally {
    for (const [k, v] of [['SUPABASE_URL', previous.url], ['SUPABASE_SERVICE_ROLE_KEY', previous.key], ['XROGA_ENGINEERING_METERING', previous.on], ['XROGA_ENGINEERING_CAP_STORAGE_BYTES', previous.cap]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
}

// The Supabase client is cached for the process, so all scenarios share one loopback server and switch its mode.
test('storage metering through the real saveRevision: persisted bytes, failed saves, an exhausted cap and the off switch', async () => {
  await withServer(async (calls) => {
    const store = new SupabaseProjectRuntimeStore();
    const reset = () => { calls.length = 0; mode.failInsert = false; mode.cap = false; delete process.env.XROGA_ENGINEERING_CAP_STORAGE_BYTES; process.env.XROGA_ENGINEERING_METERING = '1'; };

    // 1. a saved revision records the bytes actually persisted, against the owner and run, exactly once
    reset();
    await store.saveRevision(owner, project());
    const reserve = calls.find((c) => c.fn === 'reserve_engineering_resource')!; const settle = calls.find((c) => c.fn === 'settle_engineering_resource')!;
    assert.equal(reserve.args.p_user, owner); assert.equal(reserve.args.p_run, run); assert.equal(reserve.args.p_category, 'storage_bytes');
    assert.equal(reserve.args.p_units, BYTES, 'UTF-8 bytes, not characters');
    assert.equal(settle.args.p_actual, BYTES);
    assert.equal(calls.filter((c) => c.fn === 'settle_engineering_resource').length, 1);

    // 2. a save that fails is not charged for bytes that were never stored
    reset(); mode.failInsert = true;
    await assert.rejects(store.saveRevision(owner, project()), /not persisted/);
    assert.equal(calls.find((c) => c.fn === 'settle_engineering_resource')!.args.p_actual, 0);

    // 3. with a storage cap configured and exhausted, the revision is refused before anything is written
    reset(); mode.cap = true; process.env.XROGA_ENGINEERING_CAP_STORAGE_BYTES = '20';
    await assert.rejects(store.saveRevision(owner, project()), (e: Error & { code?: string }) => e.code === 'RESOURCE_EXHAUSTED');
    assert.equal(calls.some((c) => c.fn === 'settle_engineering_resource'), false, 'nothing was held, so nothing is settled');

    // 4. metering off (the default): no ledger call is made at all
    reset(); process.env.XROGA_ENGINEERING_METERING = '0';
    await store.saveRevision(owner, project());
    assert.equal(calls.length, 0);
  });
});
