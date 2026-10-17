import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createRunDurable, getRun, persistConversationOnly, saveConversation } from './runStore.js';

test('conversation persistence requires one exact receipt and preserves the admitted snapshot', async () => {
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NODE_ENV'];
  const previous = new Map(keys.map(key => [key, process.env[key]]));
  const owner = randomUUID();
  const runId = randomUUID();
  let receipt: unknown = [{ id: runId }];
  let unavailable = false;
  let release: (() => void) | undefined;
  let arrived: (() => void) | undefined;
  let hold = false;
  const requests: { method: string; url: string; body: Record<string, unknown> }[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    requests.push({ method: req.method!, url: req.url!, body: chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {} });
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'POST') { res.writeHead(201); res.end(); return; }
    if (hold) await new Promise<void>(resolve => { release = resolve; arrived?.(); });
    if (unavailable) { res.writeHead(400); res.end(JSON.stringify({ message: 'private database detail' })); return; }
    res.end(JSON.stringify(receipt));
  });
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-loopback-only';
    process.env.NODE_ENV = 'production';
    await createRunDurable(owner, 'fixture', runId);
    for (const invalid of [[], [{ id: randomUUID() }], [{ id: runId }, { id: runId }], {}, null]) {
      receipt = invalid;
      assert.equal(await saveConversation(runId, [{ content: 'not acknowledged' }]), false);
      assert.equal(getRun(runId)?.messages, undefined);
    }
    receipt = [{ id: runId }];
    hold = true;
    const requestArrived = new Promise<void>(resolve => { arrived = resolve; });
    const messages = [{ role: 'user', content: 'admitted' }];
    const saving = saveConversation(runId, messages);
    await requestArrived;
    messages[0].content = 'changed during await';
    messages.push({ role: 'user', content: 'late' });
    release!();
    assert.equal(await saving, true);
    assert.deepEqual(getRun(runId)?.messages, [{ role: 'user', content: 'admitted' }]);
    const write = requests.at(-1)!;
    assert.equal(write.method, 'PATCH');
    assert.ok(write.url.includes(`id=eq.${runId}`));
    assert.ok(write.url.includes(`user_id=eq.${owner}`));
    assert.deepEqual(write.body, { messages: [{ role: 'user', content: 'admitted' }] });
    hold = false;
    unavailable = true;
    assert.equal(await saveConversation(runId, ['lost']), false);
    assert.deepEqual(getRun(runId)?.messages, [{ role: 'user', content: 'admitted' }]);
    const count = requests.length;
    assert.equal(await persistConversationOnly(runId, owner, [() => 'uncloneable']), false);
    assert.equal(requests.length, count);
  } finally {
    release?.();
    for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
