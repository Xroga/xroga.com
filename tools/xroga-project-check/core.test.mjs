import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { inspectRepository, renderBadgeSvg, renderHuman, safeOutputPath } from './core.mjs';

async function fixture(overrides = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'xroga-project-check-'));
  const pkg = overrides.package ?? {
    name: 'arbitrary-project', scripts: { build: 'next build', test: 'node --test', typecheck: 'tsc --noEmit', lint: 'eslint .' },
    dependencies: { next: '15.0.0', react: '19.0.0' }, devDependencies: { typescript: '5.8.0' },
  };
  await writeFile(path.join(root, 'package.json'), JSON.stringify(pkg), 'utf8');
  for (const [name, content] of Object.entries({
    'package-lock.json': '{}', 'README.md': '# Arbitrary project', 'SECURITY.md': '# Security',
    'CONTRIBUTING.md': '# Contributing', 'AGENTS.md': '# Agent instructions', 'vercel.json': '{}',
    '.env.example': 'DATABASE_URL=\nPUBLIC_ORIGIN=https://example.test\n',
    ...overrides.files,
  })) {
    const target = path.join(root, name); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, content, 'utf8');
  }
  await mkdir(path.join(root, '.github', 'workflows'), { recursive: true });
  await writeFile(path.join(root, '.github', 'workflows', 'checks.yml'), 'name: checks', 'utf8');
  return root;
}

test('project check produces deterministic evidence without executing project scripts', async (t) => {
  const root = await fixture({ package: { name: 'arbitrary', scripts: { build: 'exit 99', test: 'exit 99', typecheck: 'exit 99', lint: 'exit 99' }, dependencies: { next: '15.0.0' } } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await inspectRepository(root);
  assert.equal(result.score, 100);
  assert.equal(result.repository.privateCodeUploaded, false);
  assert.equal(result.criticalCount, 0);
});

test('human and JSON results do not expose environment values', async (t) => {
  const root = await fixture({ files: { '.env.example': 'SECRET_TOKEN=do-not-print-this\nPUBLIC_KEY=example\n' } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await inspectRepository(root);
  const output = `${renderHuman(result)}${JSON.stringify(result)}`;
  assert.match(output, /SECRET_TOKEN/);
  assert.doesNotMatch(output, /do-not-print-this/);
});

test('missing build declaration is a real critical finding', async (t) => {
  const root = await fixture({ package: { name: 'arbitrary', scripts: { test: 'node --test' } } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await inspectRepository(root);
  assert.equal(result.criticalCount, 1);
  assert.ok(result.checks.some((item) => item.id === 'build.script' && !item.passed));
});

test('malformed package metadata fails clearly', async (t) => {
  const root = await fixture(); t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'package.json'), '{not-json', 'utf8');
  await assert.rejects(inspectRepository(root), /MALFORMED_PACKAGE_JSON/);
});

test('badge is computed from real state and escapes hostile text', () => {
  const svg = renderBadgeSvg({ score: 81, band: '</text><script>alert(1)</script>' });
  assert.match(svg, /81\/100/);
  assert.doesNotMatch(svg, /<script>|alert\(/);
  assert.match(svg, /role="img"/);
});

test('report and badge paths cannot escape the repository', async (t) => {
  const root = await fixture(); t.after(() => rm(root, { recursive: true, force: true }));
  assert.throws(() => safeOutputPath(root, '../secret.json'), /UNSAFE_OUTPUT_PATH/);
  assert.throws(() => safeOutputPath(root, 'result;rm.json'), /UNSAFE_OUTPUT_PATH/);
  assert.equal(safeOutputPath(root, 'artifacts/check.json'), path.join(root, 'artifacts', 'check.json'));
});

test('multiple lockfiles are surfaced rather than silently choosing one', async (t) => {
  const root = await fixture({ files: { 'yarn.lock': '' } }); t.after(() => rm(root, { recursive: true, force: true }));
  const result = await inspectRepository(root);
  assert.ok(result.checks.some((item) => item.id === 'foundation.lockfile' && !item.passed));
});

test('static result names the important limitation and avoids certification claims', async (t) => {
  const root = await fixture(); t.after(() => rm(root, { recursive: true, force: true }));
  const result = await inspectRepository(root);
  assert.ok(result.limitations.some((item) => item.includes('not a security certification')));
  assert.ok(result.limitations.some((item) => item.includes('were not executed')));
});
