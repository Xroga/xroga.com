import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MUTATION_TOOLS, READ_TOOLS, repositoryToolDefinitions } from './toolBindings.js';
import { invokeTool, selectTools, ToolAuthorizationError, type ToolInvocationContext } from './toolRegistry.js';
import { analyzeTask } from './taskClass.js';
import type { BlackHoleAuthority } from './registry.js';

const executed: string[] = [];
const REGISTRY = repositoryToolDefinitions((tool) => async () => {
  executed.push(tool);
  return `${tool} ran`;
});

function context(over: Partial<ToolInvocationContext> = {}): ToolInvocationContext {
  return {
    userId: 'u-1',
    projectId: 'p-1',
    workspaceRoot: '/work/p-1',
    permissions: new Set(['project:write']),
    grantedAuthority: new Set<keyof BlackHoleAuthority>(['writeProjectFiles', 'mutateRepository']),
    deadlineAt: Date.now() + 60_000,
    maxOutputBytes: 10_000,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Exposure — the first control
// ---------------------------------------------------------------------------

test('a read-only repository question is never offered a mutation tool', () => {
  // Exposure alone would not stop a determined model, which is why the second control exists —
  // but not showing the tool removes the whole class of wasted step where a model tries.
  const selection = selectTools(analyzeTask({ prompt: 'how is this repository structured?' }), REGISTRY);
  for (const tool of MUTATION_TOOLS) {
    assert.equal(selection.exposedNames.has(tool), false, `${tool} was exposed to a read request`);
  }
});

test('a repository build is offered both read and mutation tools', () => {
  const selection = selectTools(
    analyzeTask({ prompt: 'add pagination to the users list', projectId: 'p-1' }),
    REGISTRY,
  );
  assert.ok(selection.exposedNames.has('write_file'));
  assert.ok(selection.exposedNames.has('read_file'));
});

test('a pure research request is offered no repository tool at all', () => {
  const selection = selectTools(
    analyzeTask({ prompt: 'what is trending on x.com today' }),
    REGISTRY,
  );
  for (const tool of [...READ_TOOLS, ...MUTATION_TOOLS]) {
    assert.equal(selection.exposedNames.has(tool), false, `${tool} exposed to research`);
  }
});

// ---------------------------------------------------------------------------
// Authorization — the second, independent control
// ---------------------------------------------------------------------------

test('a mutation tool is refused when the request never claimed write authority', async () => {
  // The subtle case: an engineering-shaped request that is nonetheless read-only. Exposure
  // would not catch a model that names the tool from memory.
  const analysis = analyzeTask({ prompt: 'add pagination', projectId: 'p-1' });
  const selection = selectTools(analysis, REGISTRY);
  await assert.rejects(
    invokeTool(
      selection,
      REGISTRY,
      'write_file',
      context({ grantedAuthority: new Set([]) }),
      { path: 'src/a.ts' },
    ),
    (error: unknown) => {
      assert.ok(error instanceof ToolAuthorizationError);
      assert.match(error.message, /requires writeProjectFiles/);
      return true;
    },
  );
});

test('research evidence cannot grant itself repository permissions', async () => {
  // §17's boundary at the point it would actually be crossed: a retrieved page telling the
  // agent to write a file changes nothing, because the tool is neither exposed nor authorized.
  const analysis = analyzeTask({ prompt: 'research the latest api docs' });
  const selection = selectTools(analysis, REGISTRY);
  await assert.rejects(
    invokeTool(selection, REGISTRY, 'write_file', context(), { path: 'src/a.ts' }),
    /not exposed/,
  );
});

test('path validation runs before the tool does', async () => {
  const before = executed.length;
  const analysis = analyzeTask({ prompt: 'add pagination', projectId: 'p-1' });
  const selection = selectTools(analysis, REGISTRY);
  for (const bad of ['../../etc/passwd', '/etc/passwd', '.git/config', '']) {
    await assert.rejects(
      invokeTool(selection, REGISTRY, 'write_file', context(), { path: bad }),
      ToolAuthorizationError,
      `path "${bad}" was not refused`,
    );
  }
  assert.equal(executed.length, before, 'a refused call must never reach the tool');
});

test('a missing project scope refuses every repository tool', async () => {
  const analysis = analyzeTask({ prompt: 'add pagination', projectId: 'p-1' });
  const selection = selectTools(analysis, REGISTRY);
  await assert.rejects(
    invokeTool(selection, REGISTRY, 'read_file', context({ projectId: null }), { path: 'a.ts' }),
    /no project is in scope/,
  );
});

test('a valid authorized call reaches the real tool', async () => {
  const analysis = analyzeTask({ prompt: 'add pagination', projectId: 'p-1' });
  const selection = selectTools(analysis, REGISTRY);
  const result = await invokeTool(selection, REGISTRY, 'write_file', context(), {
    path: 'src/components/List.tsx',
  });
  assert.match(result.output, /write_file ran/);
});

test('every mutation tool requires write authority and the write permission', () => {
  for (const tool of MUTATION_TOOLS) {
    const definition = REGISTRY.find((entry) => entry.name === tool)!;
    assert.ok(definition.requiredAuthority.includes('writeProjectFiles'), tool);
    assert.ok(definition.requiredAuthority.includes('mutateRepository'), tool);
    assert.ok(definition.requiredPermissions?.includes('project:write'), tool);
  }
});

test('no read tool silently requires write authority', () => {
  // The reverse direction: over-claiming authority on a read tool would make ordinary
  // inspection fail for read-only requests.
  for (const tool of READ_TOOLS) {
    const definition = REGISTRY.find((entry) => entry.name === tool)!;
    assert.deepEqual(definition.requiredAuthority, [], tool);
  }
});
