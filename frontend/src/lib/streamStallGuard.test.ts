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
  // Normalise line endings. Several assertions below locate a region by searching for a
  // literal containing `\n`, which finds nothing on a CRLF checkout — the slice then comes
  // back empty and the test fails for a reason that has nothing to do with the code under
  // test. Read the source as LF regardless of how git checked it out.
  return readFileSync(new URL('./api.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
}

test('the client generates its own runId before the request is even sent', () => {
  const s = source();
  const before = s.slice(0, s.indexOf('const res = await fetch'));
  assert.match(before, /const clientRunId =[\s\S]{0,200}crypto\.randomUUID\(\)/);
});

test('the client-generated ID is sent to the server, not just kept locally', () => {
  const s = source();
  assert.match(
    s,
    /clientRunId[\s\S]{0,220}\?[\s\S]{0,120}\{[\s\S]{0,80}runId:\s*clientRunId/s,
  );
});

test('onStart fires immediately once the connection is accepted, not only from a stream byte', () => {
  const s = source();
  const runIdInit = s.indexOf('let runId:');
  const guard = s.slice(runIdInit, s.indexOf('function readWithStallGuard', runIdInit));
  assert.ok(runIdInit >= 0, 'runId initialization is missing');
  assert.match(guard, /runId[\s\S]{0,100}options\.onStart\?\.\(\s*runId,?\s*\)/s);
});

test('a stalled read falls back to polling by the known runId, never a silent hang', () => {
  const s = source();
  const guard = s.slice(s.indexOf('function readWithStallGuard'), s.indexOf('const {', s.indexOf('function readWithStallGuard') + 1));
  assert.match(s, /SWARM_STREAM_STALLED/);
  assert.match(s, /Promise\.race\(\s*\[/s);
  assert.match(
    s,
    /return waitForPersistedSwarmRun\(\s*runId,\s*token,\s*options,\s*finalText,\s*lastSequence,?\s*\)/s,
  );
  void guard;
});

test('the stall threshold is generous enough to never fire under a legitimate 15s keepalive', () => {
  const s = source();
  const match = s.match(/const STREAM_STALL_MS\s*=\s*(\d+)_(\d+)\s*;/s);
  assert.ok(match, 'STREAM_STALL_MS not found');
  const ms = Number(`${match![1]}${match![2]}`);
  assert.ok(ms > 15_000, `threshold ${ms}ms is not comfortably above the 15s keepalive cadence`);
});

test('a stall with no known runId still surfaces an error rather than hanging silently', () => {
  const s = source();
  assert.match(
    s,
    /throw new Error\(\s*'The build service is not responding\. Please try again\.',?\s*\)/s,
  );
});

test('a duplicate onStart from the server echoing the same ID back is suppressed', () => {
  const s = source();
  assert.match(s, /const alreadyKnown\s*=\s*runId\s*===\s*payload\.runId/s);
  assert.match(
    s,
    /if\s*\(\s*!alreadyKnown\s*\)\s*\{\s*options\.onStart\?\.\(\s*runId,?\s*\)/s,
  );
});
