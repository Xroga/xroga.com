import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

/**
 * Cover for the SSE stall watchdog in `streamSwarmExecute`.
 *
 * Production evidence: three consecutive builds where the backend produced 25-49 real
 * events each — startup lines, heartbeats, blueprint checks, all firing exactly as
 * designed — while the browser's terminal showed nothing but "Connecting to the build
 * service" for minutes. The stream that should have carried those events never
 * delivered a single byte to the browser.
 *
 * The root cause found in the code: `runId` was only ever learned from the first byte
 * that stream delivered. A connection that never delivers anything therefore left the
 * client with no ID to fall back to polling with — it could only wait forever, which is
 * exactly what the screenshots showed.
 *
 * No fetch/ReadableStream mocking harness exists in this codebase, so — matching the
 * existing convention for this kind of route/transport wiring (see
 * conversationPersist.test.ts) — these are source-shape assertions pinning the specific
 * properties that make the fix real rather than cosmetic.
 */

function source(): string {
  return readFileSync(new URL('./api.ts', import.meta.url), 'utf8');
}

test('the client generates its own runId before the request is even sent', () => {
  const s = source();
  const before = s.slice(0, s.indexOf('const res = await fetch'));
  assert.match(before, /const clientRunId =[\s\S]{0,200}crypto\.randomUUID\(\)/);
});

test('the client-generated ID is sent to the server, not just kept locally', () => {
  const s = source();
  const body = s.slice(s.indexOf("body: JSON.stringify({\n      prompt,"), s.indexOf('}),\n    signal: options.signal'));
  assert.match(body, /clientRunId \? \{ runId: clientRunId \} : \{\}/);
});

test('onStart fires immediately once the connection is accepted, not only from a stream byte', () => {
  const s = source();
  const beforeLoop = s.slice(s.indexOf('let runId: string | undefined = clientRunId;'), s.indexOf('while (true) {'));
  assert.match(beforeLoop, /if \(runId\) options\.onStart\?\.\(runId\);/);
});

test('a stalled read falls back to polling by the known runId, never a silent hang', () => {
  const s = source();
  const guard = s.slice(s.indexOf('function readWithStallGuard'), s.indexOf('const { done, value } = readResult;'));
  assert.match(guard, /SWARM_STREAM_STALLED/);
  assert.match(guard, /Promise\.race/);
  assert.match(guard, /return waitForPersistedSwarmRun\(runId, token, options, finalText, lastSequence\);/);
});

test('the stall threshold is generous enough to never fire under a legitimate 15s keepalive', () => {
  const s = source();
  const match = s.match(/const STREAM_STALL_MS = (\d+)_(\d+);/);
  assert.ok(match, 'STREAM_STALL_MS not found');
  const ms = Number(`${match![1]}${match![2]}`);
  assert.ok(ms > 15_000, `threshold ${ms}ms is not comfortably above the 15s keepalive cadence`);
});

test('a stall with no known runId still surfaces an error rather than hanging silently', () => {
  const s = source();
  const guard = s.slice(s.indexOf('function readWithStallGuard'), s.indexOf('const { done, value } = readResult;'));
  assert.match(guard, /throw new Error\('The build service is not responding\. Please try again\.'\)/);
});

test('a duplicate onStart from the server echoing the same ID back is suppressed', () => {
  const s = source();
  const startHandler = s.slice(s.indexOf("if (eventName === 'start' || eventName === 'pipeline')"));
  const body = startHandler.slice(0, startHandler.indexOf('options.onProgress?.'));
  assert.match(body, /const alreadyKnown = runId === payload\.runId;/);
  assert.match(body, /if \(!alreadyKnown\) options\.onStart\?\.\(runId\);/);
});
