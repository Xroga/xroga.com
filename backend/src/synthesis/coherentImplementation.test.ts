import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ChatMessage } from '../ai/openaiCompat.js';
import {
  MAX_COHERENT_PROVIDER_ATTEMPTS,
  CoherentImplementationError,
  implementCoherently,
  mergeCoherentContinuation,
  parseCoherentBundle,
  type BuilderModelCallTelemetry,
  type CoherentCompletionFn,
} from './coherentImplementation.js';

const CANDIDATES = [
  { modelId: 'glm_5_3_flash' },
  { modelId: 'glm_5_3' },
  { modelId: 'kimi_k3' },
];

const contract = (paths: string[]) => ({
  version: 1,
  summary: 'coherent fixture',
  project: {
    runtime: 'node', framework: null, packageManager: 'npm',
    buildCommands: ['npm run build'], testCommands: ['npm test'], runCommand: 'npm start',
  },
  sharedContracts: ['src/math.ts exports add(a, b)', 'tests import the same add export'],
  files: paths.map((path) => ({ path, operation: 'upsert', purpose: `implement ${path}` })),
});

function frame(path: string, content: string): string {
  return `<<<XROGA_FILE>>>\n${JSON.stringify({ path, operation: 'upsert' })}\n<<<XROGA_CONTENT>>>\n${content}\n<<<XROGA_END_FILE>>>`;
}

function bundle(paths: string[], bodies: Record<string, string>, include = paths): string {
  return [
    '<<<XROGA_MANIFEST>>>',
    JSON.stringify(contract(paths)),
    '<<<XROGA_END_MANIFEST>>>',
    ...include.map((path) => frame(path, bodies[path] ?? `content for ${path}`)),
  ].join('\n');
}

function fakeCompletion(
  handler: (modelId: string, messages: ChatMessage[], call: number) => { text: string; finishReason?: string },
): CoherentCompletionFn & { calls: Array<{ modelId: string; messages: ChatMessage[] }> } {
  const calls: Array<{ modelId: string; messages: ChatMessage[] }> = [];
  const fn = (async (modelId: string, messages: ChatMessage[]) => {
    calls.push({ modelId, messages });
    const result = handler(modelId, messages, calls.length);
    return {
      ...result,
      inputTokens: 100,
      outputTokens: Math.max(1, Math.ceil(result.text.length / 4)),
      firstOutputMs: 3,
    };
  }) as unknown as CoherentCompletionFn & { calls: typeof calls };
  fn.calls = calls;
  return fn;
}

test('small project generation uses one coherent coding call for all related files', async () => {
  const paths = ['package.json', 'src/math.ts', 'src/math.test.ts'];
  const reply = bundle(paths, {
    'package.json': '{"scripts":{"test":"node --test"}}',
    'src/math.ts': 'export const add = (a: number, b: number) => a + b;',
    'src/math.test.ts': 'import { add } from "./math.js";\nif (add(1, 2) !== 3) throw new Error("bad");',
  });
  const complete = fakeCompletion(() => ({ text: reply }));
  const telemetry: BuilderModelCallTelemetry[] = [];

  const files = await implementCoherently({
    brief: 'Create a small TypeScript library and tests.',
    candidates: CANDIDATES,
    complete,
    onTelemetry: (event) => telemetry.push(event),
  });

  assert.deepEqual(files.map((file) => file.path), paths);
  assert.equal(complete.calls.length, 1, 'one successful coherent bundle must not create per-file calls');
  assert.equal(telemetry.length, 1);
  assert.equal(telemetry[0]!.outputUsed, true);
  assert.equal(telemetry[0]!.queueWaitMs, 0);
  assert.ok(telemetry[0]!.activeDurationMs >= 0);
  assert.ok(telemetry[0]!.inputTokens > 0 && telemetry[0]!.outputTokens > 0);
});

test('a safely resumable truncated bundle retains completed files and requests only missing files', async () => {
  const paths = ['package.json', 'src/index.ts', 'README.md'];
  const bodies = {
    'package.json': '{"scripts":{"build":"tsc"}}',
    'src/index.ts': 'export const ready = true;',
    'README.md': '# Ready',
  };
  const first = bundle(paths, bodies, ['package.json', 'src/index.ts']) + '\n<<<XROGA_FILE>>>\n{"path":"README.md","operation":"upsert"}\n<<<XROGA_CONTENT>>>\n# Re';
  const complete = fakeCompletion((_model, messages, call) => {
    if (call === 1) return { text: first, finishReason: 'length' };
    const user = String(messages[1]?.content ?? '');
    assert.match(user, /Return these missing files only:\nREADME\.md/);
    assert.doesNotMatch(user, /package\.json\nsrc\/index\.ts\nREADME\.md$/);
    return { text: frame('README.md', bodies['README.md']) };
  });
  const telemetry: BuilderModelCallTelemetry[] = [];

  const files = await implementCoherently({
    brief: 'Create the accepted project.', candidates: CANDIDATES, complete,
    onTelemetry: (event) => telemetry.push(event),
  });

  assert.deepEqual(files, paths.map((path) => ({ path, content: bodies[path as keyof typeof bodies] })));
  assert.equal(complete.calls.length, 2);
  assert.deepEqual(telemetry.map((event) => [event.stage, event.outputUsed]), [
    ['implementation', true], ['continuation', true],
  ]);
});

test('malformed or truncated coding output cannot produce workspace files', async () => {
  const complete = fakeCompletion(() => ({ text: '<<<XROGA_MANIFEST>>>\n{"version":1' }));
  await assert.rejects(
    implementCoherently({ brief: 'Create a project.', candidates: CANDIDATES, complete }),
    (error: unknown) => {
      assert.ok(error instanceof CoherentImplementationError);
      assert.equal(error.code, 'SOFTWARE_IMPLEMENTATION_FAILED');
      return true;
    },
  );
  assert.equal(complete.calls.length, MAX_COHERENT_PROVIDER_ATTEMPTS);
});

test('duplicate, conflicting and traversal paths reject the whole change contract', () => {
  const duplicate = contract(['src/a.ts', 'src/b.ts']) as { files: Array<{ path: string; operation: string; purpose: string }> } & ReturnType<typeof contract>;
  duplicate.files[1]!.path = 'SRC/A.ts';
  const duplicateText = `<<<XROGA_MANIFEST>>>\n${JSON.stringify(duplicate)}\n<<<XROGA_END_MANIFEST>>>\n${frame('src/a.ts', 'a')}`;
  assert.equal(parseCoherentBundle(duplicateText).status, 'invalid');

  const traversalText = bundle(['../escape.ts'], { '../escape.ts': 'bad' });
  assert.equal(parseCoherentBundle(traversalText).status, 'invalid');

  const outside = bundle(['src/a.ts'], { 'src/a.ts': 'a' }) + `\n${frame('src/extra.ts', 'extra')}`;
  assert.equal(parseCoherentBundle(outside).status, 'invalid');
});

test('a continuation cannot repeat completed files or widen the validated manifest', () => {
  const first = parseCoherentBundle(bundle(['src/a.ts', 'src/b.ts'], { 'src/a.ts': 'a' }, ['src/a.ts']));
  assert.equal(first.status, 'partial');
  assert.equal(mergeCoherentContinuation(first, frame('src/a.ts', 'again')).status, 'invalid');
  assert.equal(mergeCoherentContinuation(first, frame('src/c.ts', 'outside')).status, 'invalid');
});

test('a retryable provider failure uses one healthy fallback and never calls a third route', async () => {
  const paths = ['index.html'];
  const complete = fakeCompletion((modelId) => {
    if (modelId === 'glm_5_3_flash') {
      const error = new Error('temporarily unavailable') as Error & { status?: number };
      error.status = 503;
      throw error;
    }
    return { text: bundle(paths, { 'index.html': '<h1>Works</h1>' }) };
  });
  const files = await implementCoherently({ brief: 'Create a page.', candidates: CANDIDATES, complete });
  assert.equal(files[0]!.path, 'index.html');
  assert.deepEqual(complete.calls.map((call) => call.modelId), ['glm_5_3_flash', 'glm_5_3']);
});

test('an existing-repository patch returns only intended files and sends compact redacted context', async () => {
  const existing = [
    { path: 'src/target.ts', content: 'export const oldValue = 1;' },
    { path: 'src/unrelated.ts', content: 'export const untouched = true;' },
    { path: '.env', content: 'API_KEY=super-secret-value' },
  ];
  const complete = fakeCompletion((_model, messages) => {
    const user = String(messages[1]?.content ?? '');
    assert.doesNotMatch(user, /super-secret-value/);
    return { text: bundle(['src/target.ts'], { 'src/target.ts': 'export const oldValue = 1;\nexport const newValue = 2;' }) };
  });
  const files = await implementCoherently({
    brief: 'Update src/target.ts while preserving existing behavior.',
    candidates: CANDIDATES,
    existingFiles: existing,
    complete,
  });
  assert.deepEqual(files.map((file) => file.path), ['src/target.ts']);
  assert.match(files[0]!.content, /oldValue/);
});

test('hardcoded secrets in model output are rejected before materialization', () => {
  const result = parseCoherentBundle(bundle(['src/config.ts'], {
    'src/config.ts': 'export const key = "sk-abcdefghijklmnopqrstuvwxyz012345";',
  }));
  assert.equal(result.status, 'invalid');
  assert.equal(result.files.length, 0);

  const envExample = parseCoherentBundle(bundle(['.env.example'], {
    '.env.example': 'API_KEY=sk-abcdefghijklmnopqrstuvwxyz012345',
  }));
  assert.equal(envExample.status, 'invalid');
});

test('caller cancellation reaches the active coherent provider request', async () => {
  const controller = new AbortController();
  let receivedSignal: AbortSignal | undefined;
  const complete = (async (_modelId: string, _messages: ChatMessage[], opts: { signal?: AbortSignal }) => {
    receivedSignal = opts.signal;
    controller.abort();
    const error = new Error('cancelled') as Error & { code?: string };
    error.code = 'BUILD_CANCELLED';
    throw error;
  }) as CoherentCompletionFn;

  await assert.rejects(
    implementCoherently({ brief: 'Create a project.', candidates: CANDIDATES, complete, signal: controller.signal }),
    CoherentImplementationError,
  );
  assert.equal(receivedSignal, controller.signal);
});
