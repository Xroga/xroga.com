#!/usr/bin/env node
/**
 * Phase 1 verification runner. Writes logs/ and logs/results.json next to this file.
 *
 *   STORAGE_TEST_DATABASE_URL   disposable PostgreSQL superuser URL  (real SQL tests)
 *   STORAGE_TEST_S3_ENDPOINT    S3-compatible emulator URL            (SYNTHETIC wire tests)
 *   REQUIRE_PHASE1_FIXTURES=1   a missing/unreachable fixture is a FAILURE, not a quiet skip (CI sets this)
 *   Provider suite (real R2)    runs only with the XROGA_DRIVE_R2_TEST_* variables; otherwise reported NOT_RUN
 *
 * Exit 0 only if: nothing regressed, every required fixture was present and reachable, and no required step skipped.
 * A step that skipped is never counted as passed. Failures that also fail on pristine main are BASELINE_FAILURE (baseline-failures.json).
 */
import { spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeTestEnvironment } from '../../../../scripts/ci/run-baseline.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const out = path.join(here, 'logs');
mkdirSync(out, { recursive: true });
const env = process.env;
const REQUIRE = env.REQUIRE_PHASE1_FIXTURES === '1';
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: root, encoding: 'utf8', shell: process.platform === 'win32', ...opts });

const sha = sh('git', ['rev-parse', 'HEAD']).stdout.trim();
const dirty = sh('git', ['status', '--porcelain', '--untracked-files=no']).stdout.trim().split('\n').filter(Boolean).filter((l) => !l.includes('evidence/logs'));
writeFileSync(path.join(out, '00-source.txt'), `source_sha=${sha}\nnode=${process.version}\ndirty_tracked_files=${dirty.length}\n${dirty.join('\n')}\n`);

const reachable = (url, defPort) => new Promise((resolve) => {
  try {
    const u = new URL(url); const host = u.hostname || (u.searchParams.get('host') ?? 'localhost');
    const sock = u.searchParams.get('host')?.startsWith('/') ? { path: `${u.searchParams.get('host')}/.s.PGSQL.${u.port || defPort}` } : { host, port: Number(u.port || defPort) };
    const s = net.connect(sock); s.setTimeout(3000);
    s.on('connect', () => { s.destroy(); resolve(true); }); s.on('error', () => resolve(false)); s.on('timeout', () => { s.destroy(); resolve(false); });
  } catch { resolve(false); }
});
const fixtures = {
  postgres: env.STORAGE_TEST_DATABASE_URL ? ((await reachable(env.STORAGE_TEST_DATABASE_URL, 5432)) ? 'READY' : 'UNREACHABLE') : 'MISSING',
  s3Emulator: env.STORAGE_TEST_S3_ENDPOINT ? ((await reachable(env.STORAGE_TEST_S3_ENDPOINT, 80)) ? 'READY' : 'UNREACHABLE') : 'MISSING',
  r2Provider: env.XROGA_DRIVE_R2_TEST_CONFIRM === 'isolated-private-bucket-zero-incremental-cost' && env.XROGA_DRIVE_R2_BUCKET ? 'AUTHORISED' : 'NOT_AUTHORISED',
};

if (process.argv.includes('--check-fixtures')) {
  console.log(JSON.stringify({ requireFixtures: REQUIRE, fixtures }));
  const missing = Object.entries(fixtures).filter(([k, v]) => k !== 'r2Provider' && v !== 'READY');
  process.exit(REQUIRE && missing.length ? 1 : 0);
}

const walk = (d) => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const rel = (p) => path.relative(path.join(root, 'backend'), p);
const tests = walk(path.join(root, 'backend/src/storage')).filter((f) => f.endsWith('.test.ts')).map(rel);
const extra = ['src/routes/drive.test.ts', 'src/routes/driveRegistration.test.ts', 'src/services/storage/projectFiles.canonical.test.ts'];
const LARGE = 'src/storage/migration/largeObject.stream.test.ts'; // real 1 GiB+ crossing: its own required step (needs ~1.2 GiB temp disk)
const unit = [...tests.filter((f) => !f.includes('.integration.') && f.split(path.sep).join('/') !== LARGE), ...extra].sort();
const pgTests = tests.filter((f) => f.includes('.integration.') && !f.includes('wire') && !f.includes('provider')).sort();
const wireTests = tests.filter((f) => f.includes('wire.integration')).sort();
const providerTests = tests.filter((f) => f.includes('provider.integration')).sort();
// Phase 2 (INFRA-005/006): workers, runtime policy, egress. Same runner, extra steps; TAP reporter forced so the counts parse on any Node version.
const under = (sub, pred) => walk(path.join(root, 'backend/src', sub)).filter((f) => f.endsWith('.test.ts') && pred(f)).map(rel).sort();
const p2Unit = [...under('workers', (f) => !/\.(integration|browser)\./.test(f)), ...under('runtime', () => true), 'src/security/boundedPublicGet.test.ts'];
const p2Pg = under('workers', (f) => f.includes('.integration.'));
const p2Browser = under('workers', (f) => f.includes('.browser.'));
const TAP = ['--test-reporter=tap'];

const steps = [
  { id: '01-typecheck', cmd: ['npx', 'tsc', '--noEmit', '-p', '.'], cwd: 'backend', required: true, kind: 'tsc' },
  { id: '02-unit-and-adapters', cmd: ['npx', 'tsx', '--test', ...unit], cwd: 'backend', required: true },
  { id: '02b-large-object-1GiB-SYNTHETIC', cmd: ['npx', 'tsx', '--test', LARGE], cwd: 'backend', required: true, env: { XROGA_LARGE_TEST: '1' } },
  { id: '03-postgres-real-sql', cmd: ['npx', 'tsx', '--test', ...pgTests], cwd: 'backend', required: true, fixture: 'postgres' },
  { id: '02c-phase2-workers-runtime-unit', cmd: ['npx', 'tsx', '--test', ...TAP, ...p2Unit], cwd: 'backend', required: true },
  { id: '03b-phase2-worker-leases-real-sql', cmd: ['npx', 'tsx', '--test', ...TAP, ...p2Pg], cwd: 'backend', required: true, fixture: 'postgres' },
  // A real Chromium on the CI host (LOCAL class: proves the launch policy is honoured by an actual browser, not that the sandbox works in an OCI container).
  { id: '03c-phase2-real-chromium-LOCAL', cmd: ['npx', 'tsx', '--test', ...TAP, ...p2Browser], cwd: 'backend', required: env.PHASE2_REQUIRE_BROWSER === '1', env: env.PHASE2_BROWSERS_PATH ? { PLAYWRIGHT_BROWSERS_PATH: env.PHASE2_BROWSERS_PATH } : {} },
  { id: '03d-phase2-seccomp-derivation', cmd: ['node', 'deploy/browser-worker/derive-seccomp.mjs', '--check'], cwd: '.', required: true, kind: 'exit' },
  { id: '04-s3-wire-emulator-SYNTHETIC', cmd: ['npx', 'tsx', '--test', ...wireTests], cwd: 'backend', required: true, fixture: 's3Emulator' },
  { id: '05-r2-provider-REAL', cmd: ['npx', 'tsx', '--test', ...providerTests], cwd: 'backend', required: false, fixture: 'r2Provider', needs: 'AUTHORISED' },
  // The whole backend suite runs in the SAME sanitized environment as the `unit` workflow (scripts/ci/run-baseline.mjs `safeTestEnvironment`: NODE_ENV=test,
  // CI=true, no inherited secrets or fixture variables). The `unit` job finishes this suite in about 3 minutes; in this job's ambient environment (NODE_ENV unset)
  // it never finished and ten credential-vault tests failed, on this branch and on pristine main (run 40373053674). Stripping only the PostgreSQL and S3
  // fixture variables was tried first and did not help (run 40485147375), so the difference is the environment, not those fixtures. The dedicated steps above
  // still use the fixtures. A step that still hangs is a FAIL with its log.
  { id: '06-full-backend-suite', cmd: ['npm', 'test'], cwd: 'backend', required: true, kind: 'full', timeoutMs: 20 * 60_000, cleanEnv: true },
];

const baseline = JSON.parse(readFileSync(path.join(here, 'baseline-failures.json'), 'utf8')).tests;
const results = [];
for (const s of steps) {
  const need = s.needs ?? 'READY';
  const fx = s.fixture ? fixtures[s.fixture] : need;
  const r = { id: s.id, required: s.required, command: s.cmd.join(' ').slice(0, 300), fixture: s.fixture ?? null, fixtureState: s.fixture ? fixtures[s.fixture] : null };
  if (s.fixture && fx !== need) {
    r.status = s.required ? (REQUIRE ? 'FAIL_MISSING_FIXTURE' : 'SKIPPED_MISSING_FIXTURE') : 'NOT_RUN';
    results.push(r); writeFileSync(path.join(out, `${s.id}.log`), `${r.status}: ${s.fixture}=${fixtures[s.fixture]}\n`); continue;
  }
  // Output goes to a file, not a pipe. With pipes, spawnSync also waits for every grandchild that inherited them, so a test that leaves a
  // background process behind stalls the job after all tests have finished (proven in a Linux container: pipes 6.0 s vs file 0.0 s).
  const rawPath = path.join(out, `${s.id}.raw`);
  const fd = openSync(rawPath, 'w');
  const p = sh(s.cmd[0], s.cmd.slice(1), { cwd: path.join(root, s.cwd), stdio: ['ignore', fd, fd], timeout: s.timeoutMs ?? (Number(env.PHASE1_STEP_TIMEOUT_MS) || 15 * 60_000), killSignal: 'SIGKILL', env: s.cleanEnv ? safeTestEnvironment() : { ...process.env, ...(s.env ?? {}) } });
  closeSync(fd);
  p.stdout = readFileSync(rawPath, 'utf8'); p.stderr = ''; rmSync(rawPath, { force: true });
  const timedOut = p.error?.code === 'ETIMEDOUT'; // a hung step fails with its partial output instead of stalling the whole job
  const text = `# cmd: ${s.cmd.join(' ')}\n${p.stdout}\n${p.stderr}\n# exit: ${p.status}\n`;
  writeFileSync(path.join(out, `${s.id}.log`), text);
  const n = (k) => Number((text.match(new RegExp(`^# ${k} (\\d+)`, 'm')) ?? [])[1] ?? 0);
  Object.assign(r, { exit: p.status, tests: n('tests'), pass: n('pass'), fail: n('fail'), skipped: n('skipped'), suiteSkips: (text.match(/# SKIP/g) ?? []).length });
  const failed = [...text.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((m) => m[1].trim()).filter((v, i, a) => a.indexOf(v) === i);
  if (timedOut) { r.status = 'FAIL'; r.timedOut = true; r.failedTests = ['STEP TIMED OUT after ' + (s.timeoutMs ?? (Number(env.PHASE1_STEP_TIMEOUT_MS) || 15 * 60_000)) / 1000 + 's (see log tail)']; }
  else if (s.kind === 'tsc' || s.kind === 'exit') r.status = p.status === 0 ? 'PASS' : 'FAIL';
  else if (s.kind === 'full') {
    const topLevel = [...text.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1].trim());
    r.baselineFailures = topLevel.filter((t) => baseline.includes(t)); r.regressions = topLevel.filter((t) => !baseline.includes(t));
    r.status = r.regressions.length ? 'FAIL' : r.baselineFailures.length ? 'PASS_WITH_BASELINE_FAILURES' : 'PASS';
  } else r.status = p.status === 0 && r.tests > 0 && r.fail === 0 ? (r.suiteSkips > 0 ? 'PASS_WITH_SKIPS' : 'PASS') : 'FAIL';
  if (failed.length && r.status === 'FAIL') r.failedTests = failed.slice(0, 20);
  results.push(r);
}
const bad = results.filter((r) => r.status.startsWith('FAIL') || (REQUIRE && r.status.startsWith('SKIPPED')));
const incomplete = results.filter((r) => r.required && (r.status.startsWith('SKIPPED') || r.status === 'PASS_WITH_SKIPS'));
const summary = {
  sourceSha: sha, dirtyTrackedFiles: dirty.length, requireFixtures: REQUIRE, fixtures, results,
  overall: bad.length ? 'FAIL' : incomplete.length ? 'INCOMPLETE' : 'PASS',
  note: 'SYNTHETIC steps are not provider evidence. NOT_RUN/NOT_AUTHORISED means no real-R2 claim can be made from this run.',
};
writeFileSync(path.join(out, 'results.json'), JSON.stringify(summary, null, 2));
for (const r of results) console.log(`${r.status.padEnd(30)} ${r.id}  ${r.tests !== undefined ? `tests=${r.tests} pass=${r.pass} fail=${r.fail}` : ''}${r.regressions?.length ? ` REGRESSIONS=${r.regressions.length}` : ''}${r.baselineFailures?.length ? ` baseline=${r.baselineFailures.length}` : ''}`);
console.log(`overall=${summary.overall} fixtures=${JSON.stringify(fixtures)} sha=${sha.slice(0, 8)}`);
process.exit(summary.overall === 'PASS' ? 0 : 1);
