import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const actionPath = fileURLToPath(new URL('./action.mjs', import.meta.url));

async function run(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [actionPath], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (value) => { stdout += value; }); child.stderr.on('data', (value) => { stderr += value; });
    child.on('error', reject); child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function repository() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'xroga-action-'));
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { build: 'echo never-run', test: 'echo never-run', lint: 'echo never-run' }, devDependencies: { typescript: '5.8.0' } }), 'utf8');
  await writeFile(path.join(root, 'package-lock.json'), '{}', 'utf8');
  await writeFile(path.join(root, 'README.md'), '# Test', 'utf8');
  await mkdir(path.join(root, '.github', 'workflows'), { recursive: true });
  await writeFile(path.join(root, '.github', 'workflows', 'test.yml'), 'name: test', 'utf8');
  return root;
}

test('Action emits bounded outputs, summary, JSON and escaped badge with no token requirement', async (t) => {
  const root = await repository(); t.after(() => rm(root, { recursive: true, force: true }));
  const output = path.join(root, 'github-output'); const summary = path.join(root, 'summary.md');
  await writeFile(output, '', 'utf8'); await writeFile(summary, '', 'utf8');
  const result = await run({ GITHUB_WORKSPACE: root, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary, INPUT_MINIMUM_SCORE: '0', INPUT_FAIL_ON_CRITICAL: 'false', INPUT_REPORT_PATH: 'artifacts/report.json', INPUT_BADGE_PATH: 'artifacts/badge.svg', GITHUB_TOKEN: 'must-not-appear' });
  assert.equal(result.code, 0, result.stderr);
  const [outputs, summaryText, report, badge] = await Promise.all([
    readFile(output, 'utf8'), readFile(summary, 'utf8'), readFile(path.join(root, 'artifacts', 'report.json'), 'utf8'), readFile(path.join(root, 'artifacts', 'badge.svg'), 'utf8'),
  ]);
  assert.match(outputs, /^score=\d+/m); assert.match(outputs, /^report-path=artifacts\/report.json/m);
  assert.match(summaryText, /Xroga Project Check/); assert.doesNotMatch(`${outputs}${summaryText}${report}${badge}`, /must-not-appear/);
  assert.match(badge, /<svg/); assert.doesNotMatch(badge, /<script/);
});

test('Action rejects command-like output paths instead of interpolating them', async (t) => {
  const root = await repository(); t.after(() => rm(root, { recursive: true, force: true }));
  const result = await run({ GITHUB_WORKSPACE: root, INPUT_REPORT_PATH: 'report;touch-owned.json', INPUT_BADGE_PATH: 'badge.svg' });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /UNSAFE_OUTPUT_PATH/);
  await assert.rejects(readFile(path.join(root, 'owned.json'), 'utf8'));
});
