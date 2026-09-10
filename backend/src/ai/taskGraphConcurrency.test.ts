import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTaskGraph } from './taskGraph.js';
import { MemoryCheckpointStore, runTaskGraphConcurrent } from './taskGraphRunner.js';

test('independent declared write sets run concurrently while overlapping work serializes', async () => {
  const graph = buildTaskGraph('synthetic-dag', [
    { id: 'a', title: 'a', touches: ['one'] },
    { id: 'b', title: 'b', touches: ['two'] },
    { id: 'c', title: 'c', touches: ['one'] },
  ]);
  let active = 0; let maximum = 0;
  const result = await runTaskGraphConcurrent({ snapshot: graph, store: new MemoryCheckpointStore(), maxConcurrency: 3,
    execute: async (task) => { active += 1; maximum = Math.max(maximum, active); await new Promise((resolve) => setTimeout(resolve, 5)); active -= 1; return { state: 'succeeded', evidence: [{ kind: 'synthetic', detail: task.id }] }; },
  });
  assert.equal(result.progress.complete, true);
  assert.equal(maximum, 2);
});

test('a task without a declared write set is serialized by default', async () => {
  const graph = buildTaskGraph('unknown-writes', [{ id: 'unknown', title: 'unknown' }, { id: 'known', title: 'known', touches: ['a'] }]);
  let active = 0; let maximum = 0;
  await runTaskGraphConcurrent({ snapshot: graph, store: new MemoryCheckpointStore(), maxConcurrency: 2,
    execute: async (task) => { active += 1; maximum = Math.max(maximum, active); await new Promise((resolve) => setTimeout(resolve, 2)); active -= 1; return { state: 'succeeded', evidence: [{ kind: 'synthetic', detail: task.id }] }; },
  });
  assert.equal(maximum, 1);
});
