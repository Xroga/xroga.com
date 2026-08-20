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
  const cancel = source.indexOf('.cancelRun(runId)');
  const confirmation = source.indexOf("result.status !== 'cancelled'", cancel);
  const abort = source.indexOf('abortRef.current.abort()', confirmation);
  assert.ok(cancel >= 0, 'server cancellation request is missing');
  assert.ok(confirmation > cancel, 'the cancellation result is not checked');
  assert.ok(abort > confirmation, 'the client stream aborts before durable cancellation is confirmed');
});

test('an unconfirmed Stop leaves the run visible as running', () => {
  const source = stopSource();
  const catchBlock = source.slice(source.indexOf('.catch((error)'), source.indexOf("}, [setSwarmRunning])"));
  assert.match(catchBlock, /interruptRef\.current = false/);
  assert.match(catchBlock, /The build is still running — Stop was not confirmed/);
  assert.doesNotMatch(catchBlock, /abortRef\.current\.abort/);
});
