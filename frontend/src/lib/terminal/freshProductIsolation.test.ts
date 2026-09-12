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

  assert.match(source, /const freshProductIntent = hasFreshTerminalIntent\(\)/);
  assert.equal(projectContextForRequest({ repo: 'random-org/old-repo', branch: 'topic/one', projectRoot: '/' }, true), null);
  assert.match(source, /const repoContextEarly = projectContextForRequest\(/);
  assert.match(source, /!freshProductIntent &&\s*!adviceTurn/);
  assert.match(source, /const repoContext = freshProductIntent \? null : repoContextEarly/);
  assert.match(source, /const canonicalProjectContext = projectContextForRequest\(/);
  assert.match(source, /projectId: freshProductIntent \? undefined : projectId/);
  assert.match(source, /if \(freshProductIntent\) consumeFreshTerminalIntent\(\)/);
});
