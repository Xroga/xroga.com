import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function compareBaselineRuns(first, second) {
  for (const run of [first, second]) {
    assert.equal(run.result, 'PASS', 'Both baseline executions must pass');
    assert.equal(run.sourceTreeMutated, false, 'Baseline must not mutate tracked source');
    assert.ok(run.installedDependencies?.sha256, 'Actual installed dependency fingerprint is required');
    assert.equal(run.results.length, 20, 'All mandatory baseline stages must run');
    assert.ok(run.results.every(stage => stage.exitCode === 0), 'No mandatory stage may fail');
  }
  assert.equal(first.sourceSha, second.sourceSha, 'Clean runs must test the same SHA');
  assert.deepEqual(first.toolchain, second.toolchain, 'Toolchain changed between runs');
  assert.deepEqual(first.lockfiles, second.lockfiles, 'Frozen lockfiles changed between runs');
  assert.equal(first.installedDependencies.sha256, second.installedDependencies.sha256, 'Installed dependency graph changed');
  const suites = run => run.results.map(({ name, tests, pass, fail, skipped }) => ({ name, tests, pass, fail, skipped }));
  assert.deepEqual(suites(first), suites(second), 'Suite coverage or skip counts changed between runs');
  return { result: 'PASS_REPEATED_CLEAN_BASELINE', sourceSha: first.sourceSha, stagesPerRun: 20,
    installedDependencySha256: first.installedDependencies.sha256, sourceTreeMutated: false };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = 'artifacts/batch-01-baseline';
  const read = filename => JSON.parse(readFileSync(`${directory}/${filename}`, 'utf8'));
  console.log(JSON.stringify(compareBaselineRuns(read('run-a-manifest.json'), read('run-b-manifest.json'))));
}
