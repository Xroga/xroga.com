import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { completeRun, createRunDurable, failRun, persistRunState } from './runStore.js';

test('terminal learning requires an acknowledged durable worker write', async () => {
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NODE_ENV'];
  const previous = new Map(keys.map(key => [key, process.env[key]]));
  const owner = randomUUID();
  const writes: { method: string; url: string; body: Record<string, unknown> }[] = [];
  let accept = false;
  let learningAccepted = true;
  let unavailable = false;
  let hold = false;
  let release: (() => void) | undefined;
  let arrived: (() => void) | undefined;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    writes.push({ method: req.method!, url: req.url!, body });
    res.setHeader('Content-Type', 'application/json');
    if (req.url?.includes('/rpc/persist_swarm_run_attempt')) {
      if (hold) await new Promise<void>(resolve => { release = resolve; arrived?.(); });
      if (unavailable) { res.writeHead(400); res.end(JSON.stringify({ message: 'private fixture detail' })); return; }
      res.end(JSON.stringify(accept)); return;
    }
    if (req.url?.includes('/rpc/persist_build_outcome_attempt')) {
      assert.equal(typeof body.p_generation, 'string');
      assert.equal(typeof body.p_completed_at, 'string');
      assert.equal(body.p_owner_id, owner);
      res.end(JSON.stringify(learningAccepted)); return;
    }
    if (req.method === 'PATCH') { res.end(JSON.stringify([{ run_id: body.run_id }])); return; }
    res.writeHead(201); res.end();
  });
  const outcomes = () => writes.filter(write => write.url.includes('/build_outcomes') || write.url.includes('/rpc/persist_build_outcome_attempt'));
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-loopback-only';
    process.env.NODE_ENV = 'production';
    for (const terminal of ['complete', 'error', 'cancelled'] as const) {
      const id = randomUUID();
      await createRunDurable(owner, 'fixture', id);
      if (terminal === 'complete') completeRun(id, { output: { type: 'chat' } });
      else failRun(id, 'fixture failure', terminal);
      await assert.rejects(persistRunState(id), { code: 'RUN_STATE_CONFLICT' });
      assert.equal(outcomes().length, 0, `${terminal} rejected by worker fence cannot train learning memory`);
    }
    unavailable = true;
    const failedId = randomUUID();
    await createRunDurable(owner, 'fixture', failedId);
    completeRun(failedId, { output: { type: 'chat' } });
    await assert.rejects(persistRunState(failedId), { status: 503 });
    assert.equal(outcomes().length, 0);

    unavailable = false;
    accept = true;
    hold = true;
    const id = randomUUID();
    await createRunDurable(owner, 'fixture', id);
    const requestArrived = new Promise<void>(resolve => { arrived = resolve; });
    completeRun(id, { output: { type: 'chat' }, featureCategory: 'chat' });
    await requestArrived;
    assert.equal(outcomes().length, 0, 'pending acknowledgment is not durable evidence');
    hold = false;
    release!();
    await persistRunState(id);
    assert.equal(outcomes().length, 2, 'fenced learning RPC and bounded retention executed');
    for (const outcome of outcomes().filter(write => write.method !== 'DELETE')) {
      const row = outcome.body.p_outcome as Record<string, unknown>;
      assert.equal(row.user_id, owner);
      assert.equal(row.run_id, id);
      assert.equal(row.terminal_status, 'complete');
    }
    assert.ok(outcomes().find(write => write.method === 'DELETE')?.url.includes(`user_id=eq.${owner}`));
    completeRun(id, { output: { type: 'chat', duplicate: true } });
    await persistRunState(id);
    assert.equal(outcomes().length, 2, 'duplicate terminal callback cannot create another learning write');
    learningAccepted = false;
    const resumedElsewhere = randomUUID();
    await createRunDurable(owner, 'fixture', resumedElsewhere);
    completeRun(resumedElsewhere, { output: { type: 'chat' } });
    await persistRunState(resumedElsewhere);
    assert.equal(outcomes().length, 3, 'lost learning fence must not fall back to an unfenced write or retention');
    assert.ok(outcomes().at(-1)!.url.includes('/rpc/persist_build_outcome_attempt'));
  } finally {
    release?.();
    for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
