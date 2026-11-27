import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectedAppLabel, partialReporter, trackProgress, withPartialSink, withProgressSink, type ProgressStepFrame } from './progressChannel.js';

test('tracked work reports start and finish and returns its result unchanged', async () => {
  const frames: ProgressStepFrame[] = [];
  const result = await withProgressSink((f) => frames.push(f), () => trackProgress('Reading an app', () => 'Read an app', async () => 42));
  assert.equal(result, 42);
  assert.deepEqual(frames.map((f) => [f.activityStatus, f.message]), [['running', 'Reading an app'], ['completed', 'Read an app']]);
  assert.equal(frames[0]!.activityId, frames[1]!.activityId);
});

test('a failure is reported and the same error is thrown; with no listener nothing is reported', async () => {
  const frames: ProgressStepFrame[] = [];
  const error = new Error('x');
  await assert.rejects(withProgressSink((f) => frames.push(f), () => trackProgress('Updating', () => 'Updated', async () => { throw error; })), (caught) => caught === error);
  assert.equal(frames.at(-1)!.activityStatus, 'failed');
  assert.equal(await trackProgress('Reading', () => 'Read', async () => 1), 1);
});

test('connected app labels come from the tool name only', () => {
  assert.equal(connectedAppLabel('GMAIL_FETCH_EMAILS'), 'Gmail: fetch emails');
  assert.equal(connectedAppLabel('NOTION'), 'Notion');
});

test('partial answer text reaches only a listening request, paced, always as the whole text so far', async () => {
  assert.equal(partialReporter(), undefined, 'no listener: the model call collects nothing');
  const seen: string[] = [];
  let now = 0;
  await withPartialSink((text) => seen.push(text), async () => {
    const report = partialReporter(() => now)!;
    report('Hel');
    report('lo ');
    now = 150;
    report('wor');
    now = 300;
    report('ld');
  });
  assert.deepEqual(seen, ['Hel', 'Hello wor', 'Hello world']);
});

test('a failing listener never breaks the model call', async () => {
  await withPartialSink(() => { throw new Error('x'); }, async () => { partialReporter()!('text'); });
});
