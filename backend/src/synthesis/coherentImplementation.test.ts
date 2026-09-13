import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ChatMessage } from '../ai/openaiCompat.js';
import {
  CoherentImplementationError,
  MAX_COHERENT_PROVIDER_ATTEMPTS,
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
  { modelId: 'deepseek_v4_flash' },
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

function jsonBundle(paths: string[], bodies: Record<string, string>, include = paths): string {
  return JSON.stringify({
    ...contract(paths),
    fileContents: contract(paths).files
      .filter((file) => include.includes(file.path))
      .map((file) => ({
        path: file.path,
        operation: file.operation,
        content: bodies[file.path] ?? `content for ${file.path}`,
      })),
  });
}

function fakeCompletion(
  handler: (modelId: string, messages: ChatMessage[], call: number) => { text: string; finishReason?: string },
): CoherentCompletionFn & { calls: Array<{ modelId: string; messages: ChatMessage[]; json?: boolean }> } {
  const calls: Array<{ modelId: string; messages: ChatMessage[]; json?: boolean }> = [];
  const fn = (async (
    modelId: string,
    messages: ChatMessage[],
    opts: { json?: boolean },
  ) => {
    calls.push({ modelId, messages, json: opts.json });
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
  assert.equal(complete.calls[0]!.json, true, 'the provider must constrain a project bundle to one JSON object');
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

test('a provider failure uses one direct-output-capable fallback and never spends both attempts on one transport', async () => {
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
  assert.deepEqual(complete.calls.map((call) => call.modelId), ['glm_5_3_flash', 'deepseek_v4_flash']);
});

test('a standard JSON object materializes one validated coherent project bundle', () => {
  const paths = ['package.json', 'src/index.ts'];
  const bodies = {
    'package.json': '{"scripts":{"build":"tsc"}}',
    'src/index.ts': 'export const ready = true;',
  };
  const parsed = parseCoherentBundle(jsonBundle(paths, bodies));
  assert.equal(parsed.status, 'complete');
  assert.deepEqual(parsed.files, paths.map((path) => ({ path, content: bodies[path as keyof typeof bodies] })));
});

test('safe provider vocabulary differences normalize to the same full-file snapshot contract', () => {
  const parsed = parseCoherentBundle(JSON.stringify({
    version: '1',
    summary: 'small browser application',
    project: { runtime: 'browser' },
    files: [
      { path: 'index.html', operation: 'create', content: '<main>Ready</main>' },
      { path: 'app.js', operation: 'update', purpose: 'browser behavior', content: 'console.log("ready")' },
    ],
  }));

  assert.equal(parsed.status, 'complete');
  assert.deepEqual(parsed.files.map((file) => file.path), ['index.html', 'app.js']);
  assert.equal(parsed.contract?.files[0]?.operation, 'upsert');
  assert.equal(parsed.contract?.files[0]?.purpose, 'update index.html');
  assert.deepEqual(parsed.contract?.project.buildCommands, []);
  assert.deepEqual(parsed.contract?.sharedContracts, []);
});

test('a harmless structured-output envelope and full-snapshot aliases normalize without weakening safety', () => {
  const parsed = parseCoherentBundle(JSON.stringify({
    result: {
      summary: 'wrapped browser application',
      project: {
        language: 'browser',
        package_manager: 'npm',
        build_commands: ['npm run build'],
        test_commands: ['npm test'],
        run_command: 'npm start',
      },
      files: [
        { filePath: './index.html', action: 'write', body: '<main>Ready</main>' },
        { name: 'app.js', action: 'replace', source: 'console.log("ready")' },
      ],
    },
  }));

  assert.equal(parsed.status, 'complete');
  assert.deepEqual(parsed.files.map((file) => file.path), ['index.html', 'app.js']);
  assert.equal(parsed.contract?.project.runtime, 'browser');
  assert.deepEqual(parsed.contract?.project.buildCommands, ['npm run build']);
});

test('a complete content-only response derives its manifest instead of discarding usable code', () => {
  const parsed = parseCoherentBundle(JSON.stringify({
    fileContents: {
      'index.html': '<main>Ready</main>',
      'app.js': 'console.log("ready")',
    },
  }));

  assert.equal(parsed.status, 'complete');
  assert.deepEqual(parsed.files.map((file) => file.path), ['index.html', 'app.js']);
  assert.equal(parsed.contract?.project.runtime, 'unspecified');
});

test('a protocol-invalid primary gives the distinct fallback corrective evidence', async () => {
  const complete = fakeCompletion((_model, messages, call) => {
    if (call === 1) return { text: '{"notFiles":true}' };
    assert.match(String(messages[1]?.content ?? ''), /Protocol correction from the previous bounded attempt/);
    assert.match(String(messages[1]?.content ?? ''), /bundle manifest is missing or truncated/);
    return { text: jsonBundle(['index.html'], { 'index.html': '<main>Recovered</main>' }) };
  });

  const files = await implementCoherently({ brief: 'Create the project.', candidates: CANDIDATES, complete });
  assert.deepEqual(files, [{ path: 'index.html', content: '<main>Recovered</main>' }]);
  assert.deepEqual(complete.calls.map((call) => call.modelId), ['glm_5_3_flash', 'deepseek_v4_flash']);
});

test('normalization never turns a deletion or unsafe operation into a write', () => {
  for (const operation of ['delete', 'rename', 'execute']) {
    const parsed = parseCoherentBundle(JSON.stringify({
      ...contract(['src/index.ts']),
      files: [{ path: 'src/index.ts', operation, purpose: 'not an allowed snapshot write' }],
      fileContents: [{ path: 'src/index.ts', operation, content: 'export const ready = true;' }],
    }));
    assert.equal(parsed.status, 'invalid', operation);
    assert.equal(parsed.files.length, 0, operation);
  }
});

test('a JSON bundle missing one body retains complete files for one bounded continuation', () => {
  const paths = ['src/index.ts', 'README.md'];
  const first = parseCoherentBundle(jsonBundle(paths, { 'src/index.ts': 'export const ready = true;' }, ['src/index.ts']));
  assert.equal(first.status, 'partial');
  const completed = mergeCoherentContinuation(first, JSON.stringify({
    fileContents: [{ path: 'README.md', operation: 'upsert', content: '# Ready' }],
  }));
  assert.equal(completed.status, 'complete');
  assert.deepEqual(completed.files.map((file) => file.path), paths);
});

test('a physically truncated JSON response retains only fully closed file contents', () => {
  const paths = ['src/index.ts', 'src/styles.css'];
  const text = jsonBundle(paths, {
    'src/index.ts': 'export const ready = true;',
    'src/styles.css': 'body { color: gold; }',
  });
  const clipped = text.slice(0, text.indexOf('body { color: gold; }') + 8);
  const parsed = parseCoherentBundle(clipped);
  assert.equal(parsed.status, 'partial');
  assert.deepEqual(parsed.files, [{ path: 'src/index.ts', content: 'export const ready = true;' }]);
  assert.deepEqual(parsed.missingPaths, ['src/styles.css']);
});

test('terminal-safe implementation failures omit provider identity but retain the failure stage', () => {
  const failure = new CoherentImplementationError('bounded routes failed', [
    'glm_5_3_flash: bundle manifest is missing or truncated',
    'deepseek_v4_flash: provider_rate_limit',
  ]);
  assert.deepEqual(failure.safeReasons, [
    'the project bundle was incomplete',
    'implementation capacity was rate limited',
  ]);
  assert.doesNotMatch(failure.safeReasons.join(' '), /glm|deepseek/i);
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
