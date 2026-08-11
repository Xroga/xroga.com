import assert from 'node:assert/strict';
import type { ChatMessage } from '../ai/openaiCompat.js';
import { test } from 'node:test';
import {
  IncrementalImplementationError,
  MAX_PLANNED_FILES,
  implementIncrementally,
  parseFilePlan,
  stripCodeFence,
  type CompletionFn,
} from './incrementalImplementation.js';

/**
 * Cover for the failure that stopped M19: a whole project requested as one JSON object
 * under a token ceiling, which every coding model failed to deliver in production
 * (run `05769971`).
 *
 * The property these protect is that one clipped file costs one file. Under the previous
 * shape a reply cut off mid-string made `JSON.parse` reject the entire response, so nine
 * finished files were lost because the tenth was truncated.
 */

const PLAN = JSON.stringify({
  files: [
    { path: 'Cargo.toml', purpose: 'manifest' },
    { path: 'src/main.rs', purpose: 'entry point' },
    { path: 'README.md', purpose: 'usage' },
  ],
});

function fakeCompletion(
  handler: (modelId: string, system: string, user: string) => { text: string; finishReason?: string | null },
): CompletionFn & { calls: Array<{ modelId: string; user: string }> } {
  const calls: Array<{ modelId: string; user: string }> = [];
  const fn = (async (modelId: string, messages: ChatMessage[]) => {
    const system = String(messages[0]?.content ?? '');
    const user = String(messages[1]?.content ?? '');
    calls.push({ modelId, user });
    const result = handler(modelId, system, user);
    return { text: result.text, finishReason: result.finishReason ?? 'stop', outputTokens: result.text.length };
  }) as unknown as CompletionFn & { calls: typeof calls };
  fn.calls = calls;
  return fn;
}

const CANDIDATES = [{ modelId: 'glm_5_2' }, { modelId: 'kimi_k3' }, { modelId: 'deepseek_v4_pro' }];

test('a project is generated as a plan followed by one call per file', async () => {
  const complete = fakeCompletion((_model, system) =>
    system.includes('planning the file list')
      ? { text: PLAN }
      : { text: 'file body' },
  );

  const files = await implementIncrementally({ brief: 'build a rust cli', candidates: CANDIDATES, complete });

  assert.deepEqual(files.map((file) => file.path), ['Cargo.toml', 'src/main.rs', 'README.md']);
  assert.equal(complete.calls.length, 4, 'one plan call plus one per file');
  for (const file of files) assert.equal(file.content, 'file body');
});

test('each file call names only the file it must write', async () => {
  const complete = fakeCompletion((_m, system) =>
    system.includes('planning the file list') ? { text: PLAN } : { text: 'x' },
  );
  await implementIncrementally({ brief: 'brief', candidates: CANDIDATES, complete });

  const fileCalls = complete.calls.slice(1);
  assert.match(fileCalls[0]!.user, /Write exactly this one file: Cargo\.toml/);
  assert.match(fileCalls[1]!.user, /Write exactly this one file: src\/main\.rs/);
  // The manifest is supplied for context so a file can reference its siblings.
  assert.match(fileCalls[0]!.user, /src\/main\.rs — entry point/);
});

test('a truncated file falls back to the next model rather than losing the project', async () => {
  // The exact production failure, now costing one call instead of everything.
  const complete = fakeCompletion((modelId, system) => {
    if (system.includes('planning the file list')) return { text: PLAN };
    if (modelId === 'glm_5_2') return { text: 'fn main() { prin', finishReason: 'length' };
    return { text: 'fn main() {}' };
  });

  const files = await implementIncrementally({ brief: 'b', candidates: CANDIDATES, complete });
  assert.equal(files.length, 3);
  for (const file of files) assert.equal(file.content, 'fn main() {}');
});

test('a failure names the file and every model tried', async () => {
  const complete = fakeCompletion((modelId, system) => {
    if (system.includes('planning the file list')) return { text: PLAN };
    if (modelId === 'glm_5_2') return { text: '', finishReason: 'length' };
    if (modelId === 'kimi_k3') return { text: '   ' };
    return { text: '' };
  });

  await assert.rejects(
    implementIncrementally({ brief: 'b', candidates: CANDIDATES, complete }),
    (error: unknown) => {
      assert.ok(error instanceof IncrementalImplementationError);
      assert.match(error.message, /file Cargo\.toml/);
      assert.match(error.message, /glm_5_2 was cut off/);
      assert.match(error.message, /kimi_k3/);
      assert.match(error.message, /deepseek_v4_pro/);
      return true;
    },
  );
});

test('a partial project is never returned', async () => {
  // A repository missing the file that failed would not compile, and the commit would look
  // like a success.
  const complete = fakeCompletion((_m, system, user) => {
    if (system.includes('planning the file list')) return { text: PLAN };
    // The manifest appears in every prompt, so match the instruction line, not any
    // mention of the path.
    return user.includes('Write exactly this one file: README.md') ? { text: '' } : { text: 'ok' };
  });

  await assert.rejects(
    implementIncrementally({ brief: 'b', candidates: CANDIDATES, complete }),
    (error: unknown) => {
      assert.ok(error instanceof IncrementalImplementationError);
      assert.match(error.message, /README\.md/);
      return true;
    },
  );
});

test('an unusable plan falls back before any file is attempted', async () => {
  const complete = fakeCompletion((modelId, system) => {
    if (!system.includes('planning the file list')) return { text: 'body' };
    return modelId === 'glm_5_2' ? { text: 'not json at all' } : { text: PLAN };
  });

  const files = await implementIncrementally({ brief: 'b', candidates: CANDIDATES, complete });
  assert.equal(files.length, 3);
  assert.equal(complete.calls[0]!.modelId, 'glm_5_2');
  assert.equal(complete.calls[1]!.modelId, 'kimi_k3');
});

test('one unsafe path rejects the whole plan rather than being filtered out', () => {
  // Changed from filtering after production run 68cd1d4f. Dropping the offending entry and
  // generating the rest produces a project missing a file the model intended to write, and
  // nothing downstream can tell that from a model that simply forgot it. An empty plan
  // means "try the next model", which is what the fallback chain is for.
  for (const bad of ['../escape.rs', '/etc/passwd', '.git/config']) {
    const plan = parseFilePlan(
      JSON.stringify({ files: [{ path: bad, purpose: 'x' }, { path: 'src/ok.rs', purpose: 'x' }] }),
    );
    assert.deepEqual(plan, [], `${bad} was filtered instead of rejecting the plan`);
  }

  const clean = parseFilePlan(JSON.stringify({ files: [{ path: 'src/ok.rs', purpose: 'x' }] }));
  assert.deepEqual(clean.map((entry) => entry.path), ['src/ok.rs']);
});

test('a path that lost its extension rejects the plan', () => {
  // The exact production failure. GLM returned `package.` and `tsconfig.` — the `.json`
  // dropped, and only from the JSON files; every other extension survived. `package.`
  // matches no runtime adapter manifest name, so detectComposition found zero components,
  // planning produced zero validation commands, and the run died at validation after
  // seventeen paid file calls had produced seventeen unvalidatable files.
  const plan = parseFilePlan(
    JSON.stringify({
      files: [
        { path: 'package.', purpose: 'manifest' },
        { path: 'tsconfig.', purpose: 'typescript config' },
        { path: 'src/app/page.tsx', purpose: 'page' },
      ],
    }),
  );
  assert.deepEqual(plan, []);
});

test('a trailing dot is caught in any segment, not only the basename', () => {
  assert.deepEqual(parseFilePlan(JSON.stringify({ files: [{ path: 'src/app./page.tsx', purpose: 'x' }] })), []);
});

test('legitimate dotfiles and multi-dot names are still accepted', () => {
  // The rule must not reject `.gitignore`, `.env.example` or `next.config.js` — all three
  // were in the same production manifest and all three were correct.
  const plan = parseFilePlan(
    JSON.stringify({
      files: [
        { path: '.gitignore', purpose: 'x' },
        { path: '.env.example', purpose: 'x' },
        { path: 'next.config.js', purpose: 'x' },
        { path: 'tests/e2e/journey.spec.ts', purpose: 'x' },
        { path: 'README.md', purpose: 'x' },
        { path: 'Makefile', purpose: 'x' },
      ],
    }),
  );
  assert.equal(plan.length, 6);
});

test('the file count is capped', () => {
  const many = parseFilePlan(
    JSON.stringify({ files: Array.from({ length: 100 }, (_, i) => ({ path: `f${i}.rs`, purpose: 'x' })) }),
  );
  assert.equal(many.length, MAX_PLANNED_FILES);
});

test('an empty file list is not a usable plan', () => {
  assert.deepEqual(parseFilePlan(JSON.stringify({ files: [] })), []);
});

test('a fence wrapping the whole reply is stripped, one inside content is kept', () => {
  assert.equal(stripCodeFence('```rust\nfn main() {}\n```'), 'fn main() {}');
  assert.equal(stripCodeFence('fn main() {}'), 'fn main() {}');
  // A README legitimately contains fences; removing them would corrupt the file.
  const readme = '# Title\n\n```sh\nwc file.txt\n```\n\nmore text';
  assert.equal(stripCodeFence(readme), readme);
});

test('a research model is refused even if it reaches the candidate list', async () => {
  const complete = fakeCompletion(() => ({ text: PLAN }));
  await assert.rejects(
    implementIncrementally({ brief: 'b', candidates: [{ modelId: 'grok_4_5' }], complete }),
    (error: unknown) => {
      assert.ok(error instanceof IncrementalImplementationError);
      assert.match(error.message, /not a coding provider/);
      return true;
    },
  );
  assert.equal(complete.calls.length, 0, 'a research model must not be called at all');
});
