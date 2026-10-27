// Development entrypoints only. API startup and production image builds don't
// import this file or require Python. Linux CI keeps its existing command plan.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { npmCli, root } from '../ci/toolchain.mjs';

export function taskPlan(name, npm = npmCli()) {
  const plans = {
    build: [[npm, 'run', 'build', '--workspace=frontend'], [npm, 'run', 'build', '--workspace=backend']],
    test: [[npm, 'run', 'test', '--workspace=backend'], [npm, 'run', 'test:frontend']],
    'test:frontend': null,
    'test:resilience': [['scripts/test-resilience.js']],
    'verify:baseline': [['scripts/ci/run-baseline.mjs']],
  };
  if (!Object.hasOwn(plans, name)) throw new Error('Unknown local task');
  // Resolve installed tsx through Node, never a shell command or .cmd launcher.
  if (name === 'test:frontend') return [[createRequire(import.meta.url).resolve('tsx/cli'), '--tsconfig', 'frontend/tsconfig.json', '--test', 'frontend/src/**/*.test.ts']];
  return plans[name];
}

export function runTask(name, { platform = process.platform, env = process.env, execute = spawnSync, extraArgs = [] } = {}) {
  if (platform === 'win32' && !env.CI && !env.XROGA_CLEANUP_JOB_ID) {
    const result = execute('python', ['-B', resolve(root, 'scripts/local/local_maintenance.py'),
      'run', '--cwd', root, '--timeout', '7200', '--', process.execPath,
      fileURLToPath(import.meta.url), name, ...extraArgs], { cwd: root, env, stdio: 'inherit', windowsHide: true });
    return result.status ?? 1;
  }
  const plan = taskPlan(name);
  for (const [index, args] of plan.entries()) {
    const options = { cwd: root, env, stdio: 'inherit', windowsHide: true };
    const result = execute(process.execPath, [...args, ...(index === plan.length - 1 ? extraArgs : [])], options);
    if (result.error || result.status !== 0) return result.status || 1;
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runTask(process.argv[2], { extraArgs: process.argv.slice(3) });
}
