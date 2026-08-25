import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

function terminalChatSource(): string {
  return readFileSync(
    new URL('../../context/TerminalChatContext.tsx', import.meta.url),
    'utf8',
  ).replace(/\r\n/g, '\n');
}

test('a fresh-product terminal never inherits the previously routed project', () => {
  const source = terminalChatSource();

  assert.match(source, /hasFreshTerminalIntent\(\) && !repoContextEarly/);
  assert.match(source, /projectId: freshProductIntent \? undefined : projectId/);
  assert.match(
    source,
    /isBuildUpdate && !freshProductIntent && !stickyTargetRepo\?\.includes\('\/'\)/,
  );
});
