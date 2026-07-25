import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareFocusedContext } from './contextPreparation.js';

test('focused context retrieves targets and tests, excludes unrelated files, and redacts secrets', () => {
  const context = prepareFocusedContext({
    objective: 'repair authentication session in auth service', maximumTokens: 500,
    allowedFiles: ['src/auth.ts'],
    files: [
      { path: 'src/auth.ts', content: 'export function session() {}\nconst api_key="sk_abcdefghijklmnop"' },
      { path: 'src/auth.test.ts', content: 'import { session } from "./auth"; test("session", session)' },
      { path: 'src/unrelated.ts', content: 'export const weather = true' },
      ...Array.from({ length: 200 }, (_, i) => ({ path: `docs/${i}.md`, content: 'unrelated documentation '.repeat(200) })),
    ],
  });
  assert.ok(context.suppliedReferences.includes('src/auth.ts'));
  assert.ok(context.files.some((file) => file.path === 'src/auth.test.ts'));
  assert.ok(!context.suppliedReferences.includes('src/unrelated.ts'));
  assert.ok(context.files.some((file) => file.content.includes('[REDACTED_SECRET]')));
  assert.ok(context.repositoryFileCount > context.files.length);
});
