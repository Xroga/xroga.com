import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';
import router from './phase1ChatProgress.js';

async function serve<T>(run: (base: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use('/api/phase1', router);
  app.post('/api/phase1/chat', (req, res) => {
    if (req.body?.message === 'refuse') return res.status(402).json({ error: 'Out of actions', code: 'OUT_OF_ACTIONS' });
    return res.json({ response: 'hello', engine: 'xroga' });
  });
  const server = app.listen(0);
  try { return await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { server.close(); }
}

const post = (base: string, message: string, accept?: string) => fetch(`${base}/api/phase1/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(accept ? { Accept: accept } : {}) },
  body: JSON.stringify({ message }),
});

function frames(text: string) {
  return text.split('\n\n').filter((block) => block.startsWith('event:')).map((block) => {
    const [event, data] = block.split('\n');
    return { event: event.slice(7), data: JSON.parse(data.slice(6)) };
  });
}

test('a client that does not ask for a stream gets the unchanged JSON answer', async () => {
  await serve(async (base) => {
    const res = await post(base, 'Build me a landing page for a coffee shop');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /application\/json/);
    assert.deepEqual(await res.json(), { response: 'hello', engine: 'xroga' });
  });
});

test('an event-stream client gets real progress frames, then the same answer as the last frame', async () => {
  await serve(async (base) => {
    const res = await post(base, 'Build me a landing page for a coffee shop', 'text/event-stream');
    assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/);
    const all = frames(await res.text());
    assert.equal(all.at(-1)?.event, 'result');
    assert.deepEqual(all.at(-1)?.data, { status: 200, body: { response: 'hello', engine: 'xroga' } });
    const progress = all.filter((frame) => frame.event === 'progress');
    assert.ok(progress.some((frame) => frame.data.status === 'understanding_request'));
    assert.equal(progress[0]?.data.status, 'preparing_answer');
    assert.equal(progress.at(-1)?.data.status, 'understanding_request', 'the reading is the last line, so it stays on screen during the wait');
    assert.ok(!JSON.stringify(progress).includes('%'), 'no percentages');
  });
});

test('a refusal keeps its status so the client still sees a refusal', async () => {
  await serve(async (base) => {
    const res = await post(base, 'refuse', 'text/event-stream');
    const result = frames(await res.text()).at(-1);
    assert.equal(result?.event, 'result');
    assert.equal(result?.data.status, 402);
    assert.equal(result?.data.body.code, 'OUT_OF_ACTIONS');
  });
});
