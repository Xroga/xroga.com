import assert from 'node:assert/strict';
import test from 'node:test';
import { createXrogaSoftwareTools } from './xrogaTools.js';
import { createAgentEvidence } from './createAgentEvidence.js';
import { InMemorySoftwareRunEventSink } from './runEvents.js';

function setup() {
  const reads: string[][] = [];
  const host = {
    listFiles: async () => [{ path: 'index.html' }, { path: 'style.css' }],
    readFiles: async (_contract: unknown, paths: string[]) => {
      reads.push(paths);
      return paths.map((path) => ({ path, content: `content of ${path}` }));
    },
  } as any;
  const contract = { runId: 'run-1', verificationAuthority: 'universal' } as any;
  const { tools } = createXrogaSoftwareTools({
    contract,
    host,
    events: new InMemorySoftwareRunEventSink(),
    evidence: createAgentEvidence(),
  });
  const readFiles = (tools as any[]).find((tool) => tool.name === 'project_read_files');
  return { readFiles, reads };
}

test('project_read_files with no paths reads the listed project files instead of failing', async () => {
  const { readFiles, reads } = setup();
  assert.ok(readFiles);
  for (const input of [{}, undefined, { paths: [] }, { paths: 'index.html' }, { paths: [''] }]) {
    const result = await readFiles.execute(input, {});
    assert.equal(result.ok, true);
  }
  assert.deepEqual(reads[0], ['index.html', 'style.css']);
});

test('project_read_files honours explicit valid paths', async () => {
  const { readFiles, reads } = setup();
  const result = await readFiles.execute({ paths: ['style.css'] }, {});
  assert.equal(result.ok, true);
  assert.deepEqual(reads.at(-1), ['style.css']);
});
