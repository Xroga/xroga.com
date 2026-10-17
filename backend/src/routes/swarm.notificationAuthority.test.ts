import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { completeRun, createRunDurable, failRun } from '../ai/runStore.js';
import { persistTerminalNotificationAuthority } from './swarm.js';

test('notification authority requires an owned terminal run and acknowledged persistence', async () => {
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NODE_ENV'];
  const prior = keys.map(key => process.env[key]);
  const owner = randomUUID();
  let accept = true;
  let rpcCalls = 0;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    res.setHeader('Content-Type', 'application/json');
    if (req.url?.includes('/rpc/persist_build_outcome_attempt')) { res.end('true'); return; }
    if (req.url?.includes('/rpc/persist_swarm_run_attempt')) {
      rpcCalls++;
      assert.equal(body.p_owner_id, owner);
      res.end(JSON.stringify(accept)); return;
    }
    if (req.method === 'PATCH') { res.end(JSON.stringify([{ run_id: body.run_id }])); return; }
    res.writeHead(201); res.end();
  });
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-loopback-only';
    process.env.NODE_ENV = 'production';
    const active = randomUUID();
    await createRunDurable(owner, 'fixture', active);
    await assert.rejects(persistTerminalNotificationAuthority(active, owner), /authority is unavailable/);
    await assert.rejects(persistTerminalNotificationAuthority(randomUUID(), owner), /authority is unavailable/);
    assert.equal(rpcCalls, 0);
    for (const status of ['complete', 'error', 'cancelled'] as const) {
      const id = randomUUID();
      await createRunDurable(owner, 'fixture', id);
      if (status === 'complete') completeRun(id, { output: { type: 'chat' } });
      else failRun(id, 'fixture failure', status);
      await assert.rejects(persistTerminalNotificationAuthority(id, randomUUID()), /authority is unavailable/);
      assert.equal(await persistTerminalNotificationAuthority(id, owner), status);
    }
    accept = false;
    for (const status of ['complete', 'error'] as const) {
      const id = randomUUID();
      await createRunDurable(owner, 'fixture', id);
      if (status === 'complete') completeRun(id, { output: { type: 'chat' } });
      else failRun(id, 'fixture failure');
      await assert.rejects(persistTerminalNotificationAuthority(id, owner), { code: 'RUN_STATE_CONFLICT' });
    }
  } finally {
    keys.forEach((key, index) => { if (prior[index] === undefined) delete process.env[key]; else process.env[key] = prior[index]; });
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('streamed notifications are wired after persistence and failure notifications require its receipt', async () => {
  const source = await readFile(new URL('./swarm.ts', import.meta.url), 'utf8');
  const stream = source.slice(source.indexOf('const output = result.output'), source.indexOf("router.get('/history'"));
  const authority = stream.indexOf('await persistTerminalNotificationAuthority(runId, userId)');
  assert.ok(authority >= 0 && authority < stream.indexOf('notifyBuildComplete('));
  assert.ok(authority < stream.indexOf('notifyBuildFailed('));
  assert.match(stream, /terminalStatus === 'complete' && result.success && hasVerifiedHandoff/);
  assert.match(stream, /terminalStatus === 'cancelled'\) throw Object.assign\(new Error\('Build cancelled'\)/);
  assert.match(stream, /failurePersisted = await persistTerminalNotificationAuthority\(runId, userId\) === 'error'/);
  assert.match(stream, /if \(failurePersisted && clientMeta\?\.assistantMessageId/);
  assert.match(stream, /event: 'error'/, 'notification suppression must retain the truthful SSE error');
});
