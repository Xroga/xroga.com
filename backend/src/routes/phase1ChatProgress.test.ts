import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';
import router, { progressTiming } from './phase1ChatProgress.js';
import { partialReporter, startProgressStep } from '../ai/progressChannel.js';

async function serve<T>(run: (base: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use('/api/phase1', router);
  app.post('/api/phase1/chat', (req, res) => {
    if (req.body?.message === 'refuse') return res.status(402).json({ error: 'Out of actions', code: 'OUT_OF_ACTIONS' });
    if (req.body?.message === 'slow') {
      startProgressStep('Searching the web').done('Searched the web', [{ title: 'A', url: 'https://a.example' }, { title: 'B', url: 'https://b.example' }]);
      setTimeout(() => res.json({ response: 'late' }), 130);
      return;
    }
    if (req.body?.message === 'stream') {
      partialReporter()?.('The first half of the answer.\n<<<XROGA_OPENUI_V1>>>\nroot = Col([])');
      setTimeout(() => res.json({ response: 'final' }), 20);
      return;
    }
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
    assert.deepEqual([...new Set(progress.map((frame) => frame.data.status))], ['preparing_answer'], 'no commentary about the request, no plan');
    assert.equal(progress[0]?.data.status, 'preparing_answer');
    assert.equal(progress.at(-1)?.data.activityStatus, 'completed', 'the preparing step ends when the answer arrives');
    assert.equal(progress.at(-1)?.data.activityId, progress[0]?.data.activityId);
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

test('attached files are reported by name as received', async () => {
  await serve(async (base) => {
    const res = await fetch(`${base}/api/phase1/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ message: 'hello there', attachments: [{ name: 'brief.pdf', url: 'x' }] }),
    });
    const step = frames(await res.text()).find((frame) => frame.data.activityId === 'attached-files');
    assert.equal(step?.data.message, 'Received 1 attached file: brief.pdf');
  });
});

test('a long answer keeps reporting that it is still running, then closes that line', async () => {
  const before = progressTiming.everyMs;
  progressTiming.everyMs = 25;
  try {
    await serve(async (base) => {
      const all = frames(await (await post(base, 'slow', 'text/event-stream')).text());
      const updates = all.filter((frame) => frame.data.activityId === 'still-working');
      assert.ok(updates.length >= 3);
      assert.deepEqual([...new Set(updates.slice(0, -1).map((frame) => frame.data.activityStatus))], ['running']);
      assert.match(updates[0]!.data.message, /Still working on your answer with 2 sources/);
      assert.ok(new Set(updates.slice(0, -1).map((frame) => frame.data.message)).size >= 2, 'the line changes over time');
      assert.equal(updates.at(-1)!.data.activityStatus, 'completed');
      assert.equal(all.at(-1)!.event, 'result');
      const quick = frames(await (await post(base, 'hello there', 'text/event-stream')).text());
      assert.ok(!quick.some((frame) => frame.data.activityId === 'still-working'), 'a quick answer gets no filler');
    });
  } finally { progressTiming.everyMs = before; }
});

test('the answer is shown while it is written, as readable text only, before the checked result', async () => {
  await serve(async (base) => {
    const all = frames(await (await post(base, 'stream', 'text/event-stream')).text());
    const partial = all.filter((frame) => frame.event === 'partial');
    assert.equal(partial.length, 1);
    assert.equal(partial[0]!.data.text, 'The first half of the answer.');
    assert.ok(all.indexOf(partial[0]!) < all.findIndex((frame) => frame.event === 'result'));
  });
});
