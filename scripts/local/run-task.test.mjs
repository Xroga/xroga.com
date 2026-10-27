import test from 'node:test';
import assert from 'node:assert/strict';
import { runTask, taskPlan } from './run-task.mjs';

test('Windows entrypoints automatically enter the owned cleanup runner', () => {
  const calls = [];
  assert.equal(runTask('build', { platform: 'win32', env: {}, execute: (...args) => { calls.push(args); return { status: 7 }; } }), 7);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'python');
  assert.ok(calls[0][1].some(arg => arg.endsWith('local_maintenance.py')));
  assert.equal(calls[0][2].shell, undefined);
  assert.ok(calls[0][1].includes(process.execPath));
});

test('CI and already managed jobs preserve the original build order', () => {
  for (const env of [{ CI: 'true' }, { XROGA_CLEANUP_JOB_ID: 'owned-fixture' }]) {
    const calls = [];
    assert.equal(runTask('build', { platform: 'win32', env, execute: (...args) => { calls.push(args); return { status: 0 }; } }), 0);
    assert.equal(calls.length, 2);
    assert.equal(calls[0][0], process.execPath);
    assert.equal(calls[0][1].at(-1), '--workspace=frontend');
    assert.equal(calls[1][1].at(-1), '--workspace=backend');
  }
});

test('failure and interruption cannot become successful task completion', () => {
  for (const outcome of [{ status: 9 }, { status: null, signal: 'SIGTERM' }, { status: null, error: new Error('cannot launch') }]) {
    let calls = 0;
    assert.notEqual(runTask('test', { platform: 'linux', env: {}, execute: () => { calls++; return outcome; } }), 0);
    assert.equal(calls, 1);
  }
});

test('the strict baseline and unknown-task refusal remain intact', () => {
  assert.deepEqual(taskPlan('verify:baseline', '/fixture/npm-cli.js'), [['scripts/ci/run-baseline.mjs']]);
  assert.throws(() => taskPlan('invented', '/fixture/npm-cli.js'), /Unknown local task/);
});

test('frontend dispatch keeps the original tsx config and test collection', () => {
  const plan = taskPlan('test:frontend', '/fixture/npm-cli.js');
  assert.equal(plan.length, 1);
  assert.ok(plan[0][0].endsWith('tsx/dist/cli.mjs') || plan[0][0].endsWith('tsx\\dist\\cli.mjs'));
  assert.deepEqual(plan[0].slice(1), ['--tsconfig', 'frontend/tsconfig.json', '--test', 'frontend/src/**/*.test.ts']);
});

test('npm trailing arguments reach the final command without shell evaluation', () => {
  const calls = [];
  runTask('build', { platform: 'linux', env: {}, extraArgs: ['--fixture'], execute: (...args) => { calls.push(args); return { status: 0 }; } });
  assert.ok(!calls[0][1].includes('--fixture'));
  assert.equal(calls[1][1].at(-1), '--fixture');
  assert.equal(calls[1][2].shell, undefined);
});
