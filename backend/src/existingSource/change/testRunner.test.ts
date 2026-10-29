import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { SandboxExecutionResult } from '../../sandbox/sandboxTypes.js';
import { SandboxUnavailableError } from '../../sandbox/sandboxTypes.js';
import { planTests, runTests, type ExecutionPort } from './testRunner.js';

const f = (path: string, content = '') => ({ path, content });
const PKG = (extra: object = {}) => JSON.stringify({ name: 'p', scripts: { test: 'jest' }, devDependencies: { jest: '^29.0.0' }, ...extra });

describe('test planning comes from the project itself', () => {
  it('picks npm test per package, installs from the lockfile first, and scopes to the touched package', () => {
    const files = [f('package.json', '{"name":"root","scripts":{"test":"echo no test specified && exit 1"}}'), f('packages/a/package.json', PKG()), f('packages/a/package-lock.json', '{}'), f('packages/a/src/x.ts'), f('packages/b/package.json', PKG()), f('packages/b/src/y.ts')];
    const plan = planTests(files, ['packages/a/src/x.ts']);
    assert.equal(plan.status, 'planned');
    assert.deepEqual(plan.stages.map((s) => [s.kind, s.command, s.args[0], s.cwd, s.networkPolicy]), [['install', 'npm', 'ci', 'packages/a', 'registry-only'], ['test', 'npm', 'test', 'packages/a', 'none']]);
    assert.ok(plan.stages.every((s) => s.cwd !== 'packages/b'));
  });

  it('skips install for a dependency-free package, and treats the default npm placeholder as no tests', () => {
    const none = planTests([f('package.json', '{"name":"x","scripts":{"test":"node --test"}}'), f('a.js')], ['a.js']);
    assert.deepEqual(none.stages.map((s) => s.kind), ['test']);
    const placeholder = planTests([f('package.json', '{"name":"x","scripts":{"test":"echo \\"Error: no test specified\\" && exit 1"}}'), f('a.js')], ['a.js']);
    assert.equal(placeholder.status, 'unsupported');
    assert.match(placeholder.reason ?? '', /defines no test script/);
  });

  it('plans pytest or unittest for Python from the project files, and go test for Go', () => {
    const py = planTests([f('pyproject.toml', '[tool.pytest.ini_options]\n'), f('requirements.txt', 'pytest\n'), f('app/a.py')], ['app/a.py']);
    assert.deepEqual(py.stages.map((s) => [s.kind, s.args.join(' ')]), [['install', '-m pip install --disable-pip-version-check -q -r requirements.txt'], ['test', '-m pytest -q -x --no-header -p no:cacheprovider']]);
    const ut = planTests([f('pyproject.toml', '[project]\nname="x"\n'), f('app/a.py')], ['app/a.py']);
    assert.deepEqual(ut.stages.map((s) => s.args.join(' ')), ['-m unittest discover -v']);
    const go = planTests([f('go.mod', 'module x\n'), f('cmd/main.go')], ['cmd/main.go']);
    assert.deepEqual(go.stages.map((s) => [s.command, s.args.join(' '), s.networkPolicy]), [['go', 'mod download', 'registry-only'], ['go', 'test ./...', 'none']]);
    assert.equal(go.runtime, 'go');
  });

  it('says so when no runner is known, and caps the number of packages it will run', () => {
    assert.equal(planTests([f('main.rs'), f('README.md')], ['main.rs', 'README.md']).status, 'unsupported');
    assert.match(planTests([f('a.ts')], ['a.ts']).reason ?? '', /no node project manifest/);
    const many = Array.from({ length: 5 }, (_, i) => [f(`p${i}/package.json`, PKG()), f(`p${i}/a.ts`)]).flat();
    const plan = planTests(many, many.filter((x) => x.path.endsWith('a.ts')).map((x) => x.path));
    assert.equal(plan.roots.length, 3);
    assert.match(plan.reason ?? '', /more than 3 packages/);
  });
});

const result = (id: string, exitCode: number, extra: Partial<SandboxExecutionResult> = {}): SandboxExecutionResult & { id: string } => ({ id, exitCode, stdout: '', stderr: '', timedOut: false, killedForLimit: false, durationMs: 5, ...extra });
const portOf = (respond: (stages: string[]) => SandboxExecutionResult | Promise<SandboxExecutionResult>): ExecutionPort => ({ execute: async (req) => respond((req.stages ?? []).map((s) => s.id)) });
const NODE = [f('package.json', PKG()), f('a.js')];

describe('running the plan only in isolation, with honest statuses', () => {
  it('passes only when every selected stage exits 0 and reported a result', async () => {
    const ok = await runTests({ port: portOf((ids) => ({ ...result('x', 0), stages: ids.map((id) => result(id, 0)) })), files: NODE, changedPaths: ['a.js'] });
    assert.equal(ok.status, 'passed');
    const silent = await runTests({ port: portOf((ids) => ({ ...result('x', 0), stages: [result(ids[0]!, 0)] })), files: NODE, changedPaths: ['a.js'] });
    assert.equal(silent.status, 'error', 'a missing test stage is not a pass');
  });

  it('reports failure with bounded, redacted evidence, an install failure as an environment error, and a timeout as its own status', async () => {
    const secret = 'sk-abcdefghijklmnopqrstuvwxyz0123456789';
    const failed = await runTests({ port: portOf((ids) => ({ ...result('x', 1), stages: [result(ids[0]!, 0), result(ids[1]!, 1, { stdout: `FAIL expected 1 got 2 ${secret}\n${'noise\n'.repeat(5000)}` })] })), files: NODE, changedPaths: ['a.js'] });
    assert.equal(failed.status, 'failed');
    assert.ok(failed.evidence.length <= 6_100);
    assert.ok(!failed.evidence.includes(secret) && !JSON.stringify(failed.stages).includes(secret));
    assert.match(failed.evidence, /FAIL expected 1 got 2/);
    const install = await runTests({ port: portOf((ids) => ({ ...result('x', 1), stages: [result(ids[0]!, 1, { stderr: 'ENOTFOUND registry' })] })), files: NODE, changedPaths: ['a.js'] });
    assert.equal(install.status, 'error');
    assert.match(install.summary, /could not run/);
    const slow = await runTests({ port: portOf((ids) => ({ ...result('x', null as never), stages: [result(ids[0]!, 0), result(ids[1]!, null as never, { timedOut: true })] })), files: NODE, changedPaths: ['a.js'] });
    assert.equal(slow.status, 'timeout');
  });

  it('reports no runtime, an outage and a cancellation as themselves, never as pass or fail', async () => {
    const none = await runTests({ port: portOf(() => { throw new Error('must not run'); }), files: [f('a.rs')], changedPaths: ['a.rs'] });
    assert.equal(none.status, 'unsupported');
    const unavailable = await runTests({ port: { execute: async () => { throw new SandboxUnavailableError({ available: false, runtime: 'none', reason: 'runtime_unavailable' }); } }, files: NODE, changedPaths: ['a.js'] });
    assert.equal(unavailable.status, 'unavailable');
    assert.match(unavailable.summary, /not a pass/);
    const crash = await runTests({ port: { execute: async () => { throw new Error('boom'); } }, files: NODE, changedPaths: ['a.js'] });
    assert.equal(crash.status, 'error');
    const controller = new AbortController(); controller.abort();
    assert.equal((await runTests({ port: portOf(() => result('x', 0)), files: NODE, changedPaths: ['a.js'], signal: controller.signal })).status, 'cancelled');
  });

  it('asks the runtime for the right isolation: registry only for installs, no network for tests, an explicit minimal environment, no host secrets', async () => {
    let seen: Parameters<ExecutionPort['execute']>[0] | null = null;
    process.env.XROGA_TEST_SECRET = 'host-secret';
    try {
      await runTests({ port: { execute: async (r) => { seen = r; return { ...result('x', 0), stages: (r.stages ?? []).map((s) => result(s.id, 0)) }; } }, files: NODE, changedPaths: ['a.js'] });
    } finally { delete process.env.XROGA_TEST_SECRET; }
    assert.ok(seen);
    const req = seen as unknown as Parameters<ExecutionPort['execute']>[0];
    assert.deepEqual((req.stages ?? []).map((s) => s.networkPolicy), ['registry-only', 'none']);
    assert.ok(!JSON.stringify(req.environment).includes('host-secret'));
    assert.equal(req.environment.CI, 'true');
    assert.ok(!req.files.some((x) => /\.env/.test(x.path)));
  });
});
