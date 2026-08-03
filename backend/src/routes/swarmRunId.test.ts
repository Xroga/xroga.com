import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

/**
 * Cover for how /api/swarm/execute picks its runId.
 *
 * A source-shape assertion, matching this codebase's existing convention for route
 * wiring (see conversationPersist.test.ts) rather than a live HTTP test — no supertest
 * harness exists here, and the property being pinned is which function decides the ID,
 * not the full request/response cycle.
 */

test('a client-supplied ID is validated, not trusted blindly, and a fresh one is always the fallback', async () => {
  const source = await readFile(new URL('./swarm.ts', import.meta.url), 'utf8');
  const line = source.slice(source.indexOf('const runId ='), source.indexOf('\n', source.indexOf('const runId =')));
  assert.match(line, /isValidClientRunId\(req\.body\?\.runId\)/);
  assert.match(line, /randomUUID\(\)/);
});
