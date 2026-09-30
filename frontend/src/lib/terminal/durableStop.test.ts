import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

function stopSource(): string {
  const source = readFileSync(
    new URL('../../context/TerminalChatContext.tsx', import.meta.url),
    'utf8',
  ).replace(/\r\n/g, '\n');
  const start = source.indexOf('const stop = useCallback');
  const end = source.indexOf('const retryStoppedBuild', start);
  return source.slice(start, end);
}

test('Stop waits for durable server cancellation before aborting the visible stream', () => {
  const source = stopSource();
  const cancel = source.search(/\.cancelRun\(\s*runId,?\s*\)/s);
  const confirmation = source.search(/result\.status\s*!==\s*'cancelled'/s);
  const abort = source.search(/abortRef\.current\.abort\(\)/s);
  assert.ok(cancel >= 0, 'server cancellation request is missing');
  assert.ok(confirmation > cancel, 'the cancellation result is not checked');
  assert.ok(abort > confirmation, 'the client stream aborts before durable cancellation is confirmed');
});

test('an unconfirmed Stop leaves the run visible as running', () => {
  const source = stopSource();
  const catchStart = source.indexOf('.catch(');
  const catchBlock = source.slice(catchStart);
  assert.ok(catchStart >= 0, 'Stop rejection handler is missing');
  assert.match(catchBlock, /interruptRef\.current\s*=\s*false/);
  assert.match(catchBlock, /The build is still running — Stop was not confirmed/);
  assert.doesNotMatch(catchBlock, /abortRef\.current\.abort\(\)/);
});
