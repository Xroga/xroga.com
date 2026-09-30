import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { projectContextForRequest } from '../projectContext';

function terminalChatSource(): string {
  return readFileSync(
    new URL('../../context/TerminalChatContext.tsx', import.meta.url),
    'utf8',
  ).replace(/\r\n/g, '\n');
}

test('a fresh-product terminal never inherits the previously routed project', () => {
  const source = terminalChatSource();

  assert.match(source, /const freshProductIntent\s*=\s*hasFreshTerminalIntent\(\)/);
  assert.equal(projectContextForRequest({ repo: 'random-org/old-repo', branch: 'topic/one', projectRoot: '/' }, true), null);
  assert.match(source, /const repoContextEarly\s*=\s*projectContextForRequest\(/);
  assert.match(source, /!freshProductIntent &&\s*!adviceTurn/);
  assert.match(source, /const repoContext\s*=\s*freshProductIntent\s*\?\s*null\s*:\s*repoContextEarly/);
  assert.match(source, /const canonicalProjectContext\s*=\s*projectContextForRequest\(/);
  assert.match(source, /projectId:\s*freshProductIntent\s*\?\s*undefined\s*:\s*projectId/s);
  assert.match(source, /if\s*\(\s*freshProductIntent\s*\)\s*consumeFreshTerminalIntent\(\)/s);
});
