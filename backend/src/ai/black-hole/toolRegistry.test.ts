import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ToolAuthorizationError,
  invokeTool,
  outboundUrlAllowed,
  pathWithinWorkspace,
  selectTools,
  type ToolDefinition,
  type ToolInvocationContext,
} from './toolRegistry.js';
import { analyzeTask } from './taskClass.js';
import type { BlackHoleAuthority } from './registry.js';

const readFile: ToolDefinition<never> = {
  name: 'read_file',
  domain: 'files',
  description: 'read a file',
  schema: {},
  requiredAuthority: [],
  authorize: (context, args) =>
    pathWithinWorkspace(context.workspaceRoot, (args as { path?: string })?.path ?? '')
      ? { allowed: true }
      : { allowed: false, reason: 'path escapes the workspace' },
  execute: async (_context, args) => `contents of ${(args as { path?: string }).path}`,
};

const writeFile: ToolDefinition<never> = {
  name: 'write_file',
  domain: 'files',
  description: 'write a file',
  schema: {},
  requiredAuthority: ['writeProjectFiles'],
  requiredPermissions: ['project:write'],
  authorize: (context, args) =>
    pathWithinWorkspace(context.workspaceRoot, (args as { path?: string })?.path ?? '')
      ? { allowed: true }
      : { allowed: false, reason: 'path escapes the workspace' },
  execute: async () => 'written',
};

const deployTool: ToolDefinition<never> = {
  name: 'deploy',
  domain: 'deployment',
  description: 'deploy',
  schema: {},
  requiredAuthority: ['deploy'],
  authorize: () => ({ allowed: true }),
  execute: async () => 'deployed',
};

const webFetch: ToolDefinition<never> = {
  name: 'web_fetch',
  domain: 'research',
  description: 'fetch a url',
  schema: {},
  requiredAuthority: ['research'],
  authorize: (_context, args) =>
    outboundUrlAllowed((args as { url?: string })?.url ?? '')
      ? { allowed: true }
      : { allowed: false, reason: 'URL is not a safe public HTTPS target' },
  execute: async () => 'fetched',
};

const bigOutput: ToolDefinition<never> = {
  name: 'dump',
  domain: 'files',
  description: 'dump',
  schema: {},
  requiredAuthority: [],
  authorize: () => ({ allowed: true }),
  execute: async () => 'x'.repeat(10_000),
};

const REGISTRY = [readFile, writeFile, deployTool, webFetch, bigOutput];

function context(over: Partial<ToolInvocationContext> = {}): ToolInvocationContext {
  return {
    userId: 'u-1',
    projectId: 'p-1',
    workspaceRoot: '/work/p-1',
    permissions: new Set(['project:write']),
    grantedAuthority: new Set<keyof BlackHoleAuthority>(['writeProjectFiles', 'mutateRepository']),
    deadlineAt: Date.now() + 60_000,
    maxOutputBytes: 1_000,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// §20 — exposure
// ---------------------------------------------------------------------------

test('a chat turn is offered no tools at all', () => {
  const selection = selectTools(analyzeTask({ prompt: 'hey there' }), REGISTRY);
  assert.deepEqual([...selection.exposedNames], []);
});

test('a research request is not offered the deployment schema', () => {
  const selection = selectTools(
    analyzeTask({ prompt: 'what is trending on x.com today' }),
    REGISTRY,
  );
  assert.equal(selection.exposedNames.has('deploy'), false);
  assert.equal(selection.exposedNames.has('web_fetch'), true);
});

test('a tool whose authority the task never claimed is not even exposed', () => {
  // The model is not shown a capability it would then be refused for using, which removes a
  // whole category of wasted step.
  const readOnly = analyzeTask({ prompt: 'how is this repository structured?' });
  const selection = selectTools(readOnly, REGISTRY);
  assert.equal(selection.exposedNames.has('write_file'), false);
});

test('a repository build is offered the engineering tools', () => {
  const selection = selectTools(
    analyzeTask({ prompt: 'add pagination to the users list', projectId: 'p-1' }),
    REGISTRY,
  );
  assert.equal(selection.exposedNames.has('write_file'), true);
  assert.equal(selection.exposedNames.has('read_file'), true);
});

// ---------------------------------------------------------------------------
// §21 — models are not security boundaries
// ---------------------------------------------------------------------------

test('a tool the model was never offered is refused', async () => {
  // Tool names are guessable; a model that saw write_file elsewhere may ask for it here.
  const selection = selectTools(analyzeTask({ prompt: 'summarize this' }), REGISTRY);
  await assert.rejects(
    invokeTool(selection, REGISTRY, 'write_file', context(), { path: 'a.ts' }),
    (error: unknown) => {
      assert.ok(error instanceof ToolAuthorizationError);
      assert.match(error.message, /not exposed/);
      return true;
    },
  );
});

test('a request cannot acquire authority by calling a tool that has it', async () => {
  const analysis = analyzeTask({ prompt: 'add pagination', projectId: 'p-1' });
  const selection = selectTools(analysis, REGISTRY);
  // Force exposure, then invoke with an authority set that never claimed deploy.
  const forced = { ...selection, exposedNames: new Set([...selection.exposedNames, 'deploy']) };
  await assert.rejects(
    invokeTool(forced, REGISTRY, 'deploy', context({ grantedAuthority: new Set(['writeProjectFiles']) }), {}),
    (error: unknown) => {
      assert.match((error as Error).message, /requires deploy/);
      return true;
    },
  );
});

test('a missing user permission refuses the call', async () => {
  const analysis = analyzeTask({ prompt: 'add pagination', projectId: 'p-1' });
  const selection = selectTools(analysis, REGISTRY);
  await assert.rejects(
    invokeTool(selection, REGISTRY, 'write_file', context({ permissions: new Set() }), { path: 'a.ts' }),
    /requires the "project:write" permission/,
  );
});

test('the tool\'s own verification runs and can refuse', async () => {
  const analysis = analyzeTask({ prompt: 'add pagination', projectId: 'p-1' });
  const selection = selectTools(analysis, REGISTRY);
  await assert.rejects(
    invokeTool(selection, REGISTRY, 'write_file', context(), { path: '../../etc/passwd' }),
    /escapes the workspace/,
  );
});

test('path containment rejects traversal, absolute paths and NUL bytes', () => {
  assert.equal(pathWithinWorkspace('/work', 'src/index.ts'), true);
  assert.equal(pathWithinWorkspace('/work', 'src/../lib/a.ts'), true);
  assert.equal(pathWithinWorkspace('/work', '../secrets'), false);
  assert.equal(pathWithinWorkspace('/work', 'src/../../etc/passwd'), false);
  assert.equal(pathWithinWorkspace('/work', '/etc/passwd'), false);
  assert.equal(pathWithinWorkspace('/work', 'C:\\Windows\\system32'), false);
  assert.equal(pathWithinWorkspace('/work', 'a\0b'), false);
  assert.equal(pathWithinWorkspace('/work', ''), false);
});

test('outbound URLs must be public HTTPS without credentials', () => {
  assert.equal(outboundUrlAllowed('https://example.com/a'), true);
  assert.equal(outboundUrlAllowed('http://example.com/a'), false);
  assert.equal(outboundUrlAllowed('https://user:pass@example.com'), false);
  assert.equal(outboundUrlAllowed('https://localhost/a'), false);
  assert.equal(outboundUrlAllowed('https://127.0.0.1/a'), false);
  assert.equal(outboundUrlAllowed('https://169.254.169.254/latest/meta-data'), false);
  assert.equal(outboundUrlAllowed('https://192.168.1.1/'), false);
  assert.equal(outboundUrlAllowed('https://10.0.0.5/'), false);
  assert.equal(outboundUrlAllowed('not a url'), false);
});

test('a passed deadline stops the call before the tool runs', async () => {
  let ran = false;
  const registry = [{ ...readFile, execute: async () => { ran = true; return 'x'; } }];
  const analysis = analyzeTask({ prompt: 'explain the code' });
  const selection = selectTools(analysis, registry);
  await assert.rejects(
    invokeTool(selection, registry, 'read_file', context({ deadlineAt: Date.now() - 1 }), { path: 'a.ts' }),
    /deadline has passed/,
  );
  assert.equal(ran, false);
});

test('a cancelled run stops the call before the tool runs', async () => {
  const controller = new AbortController();
  controller.abort();
  const analysis = analyzeTask({ prompt: 'explain the code' });
  const selection = selectTools(analysis, REGISTRY);
  await assert.rejects(
    invokeTool(selection, REGISTRY, 'read_file', context({ signal: controller.signal }), { path: 'a.ts' }),
    /cancelled/,
  );
});

test('output is truncated to the limit', async () => {
  // A tool returning a gigabyte is a denial of service against the context window whether or
  // not it was authorized to run.
  const analysis = analyzeTask({ prompt: 'explain the code' });
  const selection = selectTools(analysis, REGISTRY);
  const result = await invokeTool(selection, REGISTRY, 'dump', context({ maxOutputBytes: 100 }), {});
  assert.equal(result.truncated, true);
  assert.ok(result.output.length < 400);
  assert.match(result.output, /truncated at 100 bytes/);
});

test('an authorized call succeeds and is not truncated when it fits', async () => {
  const analysis = analyzeTask({ prompt: 'explain the code' });
  const selection = selectTools(analysis, REGISTRY);
  const result = await invokeTool(selection, REGISTRY, 'read_file', context(), { path: 'src/a.ts' });
  assert.equal(result.truncated, false);
  assert.match(result.output, /contents of src\/a\.ts/);
});
