import assert from 'node:assert/strict';
import test from 'node:test';
import { selectRepositoryChatEvidence } from './repositoryChatEvidence.js';

test('repository chat evidence includes exact arbitrary paths and their real contents', () => {
  const files = [
    { path: 'src/unrelated.zig', content: 'pub fn unrelated() void {}' },
    { path: 'checks/folding_case.test.py', content: 'def test_folded_name():\n    assert fold("e\\u0301") == "é"\n' },
    { path: 'lib/folding_case.py', content: 'def fold(value):\n    return normalize("NFC", value)\n' },
  ];
  const selected = selectRepositoryChatEvidence(
    files,
    'Read lib/folding_case.py and checks/folding_case.test.py and explain the invariant.',
  );
  assert.deepEqual(selected.slice(0, 2).map((file) => file.path), [
    'checks/folding_case.test.py',
    'lib/folding_case.py',
  ]);
  assert.match(selected[0]!.content, /test_folded_name/);
  assert.match(selected[1]!.content, /normalize\("NFC"/);
});

test('repository chat evidence is bounded without inventing or rewriting source', () => {
  const files = Array.from({ length: 40 }, (_, index) => ({
    path: `source/module-${index}.txt`,
    content: `source-${index}-` + 'x'.repeat(10_000),
  }));
  const selected = selectRepositoryChatEvidence(files, 'Review the repository', 30_000);
  assert.ok(selected.length > 0);
  assert.ok(selected.length < files.length);
  assert.ok(selected.reduce((sum, file) => sum + Buffer.byteLength(file.path + file.content), 0) <= 30_000);
  assert.match(selected[0]!.content, /^source-0-/);
});

test('repository chat evidence excludes credential files and redacts recognizable secret values', () => {
  const selected = selectRepositoryChatEvidence([
    { path: '.env.production', content: 'API_KEY=must-not-leave' },
    { path: 'config/credentials.json', content: '{"token":"must-not-leave"}' },
    { path: '.env.example', content: 'API_KEY=replace-me' },
    { path: 'src/config.ts', content: 'const token = "ghp_abcdefghijklmnopqrstuvwxyz123456";' },
  ], 'Review configuration');
  assert.deepEqual(selected.map((file) => file.path), ['.env.example', 'src/config.ts']);
  assert.doesNotMatch(JSON.stringify(selected), /ghp_abcdefghijklmnopqrstuvwxyz123456/);
});
