import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { npmCli, root, verifyToolchain } from './toolchain.mjs';
import { installedDependencyState } from './check-installed-dependencies.mjs';

export function safeTestEnvironment(environment = process.env) {
  const safe = {};
  for (const [key, value] of Object.entries(environment)) {
    if (/^(?:PATH|PATHEXT|SystemRoot|WINDIR|COMSPEC|TEMP|TMP|TMPDIR|USERPROFILE|LOCALAPPDATA|APPDATA|HOME|USER|USERNAME|LANG|LC_ALL|TZ|CI|GITHUB_ACTIONS|GITHUB_REPOSITORY|GITHUB_SHA|PLAYWRIGHT_BROWSERS_PATH)$/i.test(key)) safe[key] = value;
  }
  return { ...safe, NODE_ENV: 'test', CI: 'true', NEXT_TELEMETRY_DISABLED: '1', PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
    NEXT_PUBLIC_API_URL: 'http://127.0.0.1:8080', NEXT_PUBLIC_SUPABASE_URL: 'https://batch-one-test.invalid',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_batch_one_fixture_only' };
}
export function redactLog(value) {
  return value.replace(/(?:postgres(?:ql)?:\/\/)[^\s"']+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [REDACTED]')
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[=:]\s*)[^\s,;"']+/gi, '$1[REDACTED]');
}
export function publicConfigOverridden(path, content, environment) {
  const expected = { NEXT_PUBLIC_SUPABASE_URL: 'https://batch-one-test.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_batch_one_fixture_only' };
  const keys = content.split(/\r?\n/).map(line => line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/)?.[1]).filter(Boolean);
  return path === 'frontend/.env.production' && keys.length > 0 && keys.every(key => expected[key] && environment[key] === expected[key]);
}
export async function runSteps(steps, { cwd = root, env = safeTestEnvironment(), onResult = () => {} } = {}) {
  const results = [];
  for (const step of steps) {
    const started = Date.now();
    const result = await new Promise(resolveResult => {
      const child = spawn(step.executable ?? process.execPath, step.args, { cwd, env: { ...env, ...step.env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '', settled = false;
      const append = chunk => { output += chunk; if (output.length > 30 * 1024 * 1024) { output = output.slice(-30 * 1024 * 1024); child.kill(); } };
      child.stdout.on('data', append); child.stderr.on('data', append);
      const timer = setTimeout(() => child.kill(), step.timeoutMs ?? 20 * 60 * 1000);
      child.on('error', () => { if (settled) return; settled = true; clearTimeout(timer); resolveResult({ name: step.name, exitCode: 1, output: 'Subprocess could not start', durationMs: Date.now() - started }); });
      child.on('close', code => { if (settled) return; settled = true; clearTimeout(timer); resolveResult({ name: step.name, exitCode: code ?? 1, output: redactLog(output), durationMs: Date.now() - started }); });
    });
    const testCount = [...result.output.matchAll(/(?:^|\n)[^\n]*\btests\s+(\d+)\s*(?:\r?\n|$)/g)].at(-1)?.[1];
    if (step.minimumTests && Number(testCount ?? 0) < step.minimumTests) { result.exitCode = 1; result.output += '\nRequired test collection floor was not satisfied.'; }
    if (testCount) result.tests = Number(testCount);
    for (const field of ['pass', 'fail', 'skipped']) {
      const count = [...result.output.matchAll(new RegExp(`(?:^|\\n)[^\\n]*\\b${field}\\s+(\\d+)\\s*(?:\\r?\\n|$)`, 'g'))].at(-1)?.[1];
      if (count) result[field] = Number(count);
    }
    results.push(result); onResult(result);
    if (result.exitCode !== 0) return { exitCode: result.exitCode, results };
  }
  return { exitCode: 0, results };
}
function sourceState() {
  return execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).trim();
}
export async function main() {
  const toolchain = verifyToolchain();
  const testEnvironment = safeTestEnvironment();
  const tracked = new Set(execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/));
  for (const directory of ['', 'frontend', 'backend']) {
    for (const filename of ['.env', '.env.local', '.env.production', '.env.production.local', '.env.test', '.env.test.local']) {
      const path = [directory, filename].filter(Boolean).join('/');
      if (!existsSync(join(root, directory, filename))) continue;
      if (tracked.has(path) && publicConfigOverridden(path, readFileSync(join(root, path), 'utf8'), testEnvironment)) continue;
      throw new Error('Run the baseline in a clean isolated checkout without local environment files');
    }
  }
  const before = sourceState();
  const installedDependencies = installedDependencyState();
  const npm = npmCli(), frontendRequire = createRequire(join(root, 'frontend/package.json')), backendRequire = createRequire(join(root, 'backend/package.json'));
  const tsc = workspace => (workspace === 'backend' ? backendRequire : frontendRequire).resolve('typescript/bin/tsc');
  const step = (name, args, extra = {}) => ({ name, args, ...extra });
  const steps = [
    step('lockfile-integrity', ['scripts/ci/check-lockfile-integrity.mjs']),
    step('focused-and-skipped-tests', ['scripts/ci/check-test-skips.mjs']),
    step('backend-typecheck', [tsc('backend'), '-p', 'backend/tsconfig.json', '--noEmit']),
    step('backend-build', [npm, 'run', 'build', '--workspace=backend']),
    step('backend-unit-tests', [npm, 'run', 'test', '--workspace=backend'], { minimumTests: 350 }),
    step('frontend-route-type-generation', [frontendRequire.resolve('next/dist/bin/next'), 'typegen', 'frontend'], { env: { NODE_ENV: 'production' } }),
    step('frontend-typecheck', [tsc('frontend'), '-p', 'frontend/tsconfig.json', '--noEmit', '--incremental', 'false']),
    step('frontend-lint', [npm, 'run', 'lint', '--workspace=frontend']),
    step('frontend-build', [npm, 'run', 'build', '--workspace=frontend'], { env: { NODE_ENV: 'production' } }),
    step('frontend-unit-tests', [npm, 'run', 'test:frontend'], { minimumTests: 40 }),
    step('migration-syntax-and-order', ['scripts/ci/validate-migrations.mjs']),
    step('inventory-drift', ['scripts/xroga/inventory.mjs', '--check']),
    step('requirements-integrity', ['scripts/xroga/validate-requirements-ledger.mjs']),
    step('runtime-config-integrity', ['scripts/xroga/check-runtime-config.mjs']),
    step('golden-contract-integrity', ['scripts/xroga/validate-golden-journeys.mjs']),
    step('mission-operating-policy', ['scripts/xroga/mission-check.mjs']),
    step('tenant-audit-integrity', ['scripts/security/audit-tenant-policies.mjs']),
    step('baseline-negative-fixtures', ['--test', 'scripts/ci/baseline.test.mjs', 'scripts/ci/ignore-vercel-build.test.mjs', 'scripts/ci/postcss-resolution.test.mjs']),
    step('inventory-and-ledger-fixtures', ['--test', 'scripts/xroga/inventory.test.mjs', 'scripts/xroga/requirements.test.mjs', 'scripts/xroga/private-research.test.mjs', 'scripts/xroga/runtime-discovery.test.mjs', 'scripts/xroga/runtime-config.test.mjs', 'scripts/xroga/golden-journeys.test.mjs', 'tests/mission-policy/mission-policy.test.mjs', 'scripts/security/audit-tenant-policies.test.mjs', 'scripts/security/disposable-supabase.test.mjs', 'scripts/security/staging-preflight.test.mjs']),
    step('agent-dependency-resolution', ['scripts/ci/check-agent-dependencies.mjs']),
    step('git-diff-whitespace', [], { executable: 'git', args: ['diff', '--check'] }),
  ];
  const artifactDirectory = join(root, 'artifacts/batch-01-baseline'); mkdirSync(artifactDirectory, { recursive: true });
  const result = await runSteps(steps, { env: testEnvironment, onResult: item => {
    writeFileSync(join(artifactDirectory, `${item.name}.log`), item.output);
    console.log(JSON.stringify({ step: item.name, exitCode: item.exitCode, durationMs: item.durationMs, tests: item.tests ?? null }));
  } });
  const after = sourceState();
  if (before !== after) { result.exitCode = 1; result.results.push({ name: 'tracked-source-mutation', exitCode: 1, output: 'Tracked source changed during baseline', durationMs: 0 }); }
  const manifest = { sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    toolchain, installedDependencies, result: result.exitCode === 0 ? 'PASS' : 'FAIL', exitCode: result.exitCode,
    lockfiles: ['package-lock.json', 'backend/package-lock.json', 'frontend/package-lock.json'].map(path => ({ path, sha256: createHash('sha256').update(readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n')).digest('hex') })),
    results: result.results.map(({ output, ...item }) => item), sourceTreeMutated: before !== after,
    migrationEvidence: 'Parser/identifier gate only; fresh/upgrade DB and staging checks remain mandatory before security rollout' };
  writeFileSync(join(artifactDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ result: manifest.result, exitCode: result.exitCode, steps: result.results.length, sourceTreeMutated: manifest.sourceTreeMutated }));
  process.exitCode = result.exitCode;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
