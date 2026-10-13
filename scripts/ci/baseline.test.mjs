import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { canonicalToolchain, root, verifyToolchain } from './toolchain.mjs';
import { validateManifestLock } from './check-lockfile-integrity.mjs';
import { analyzeTestSkips, isGovernedTestSource, validateSkips } from './check-test-skips.mjs';
import { validateMigrations } from './validate-migrations.mjs';
import { publicConfigOverridden, redactLog, runSteps, safeTestEnvironment } from './run-baseline.mjs';
import { validateInstalledVersion } from './check-installed-dependencies.mjs';
import { compareBaselineRuns } from './compare-baseline-runs.mjs';

const fixture = () => mkdtempSync(join(tmpdir(), 'xroga-ci-fixture-'));
test('browser/test helpers cannot hide conditional skips outside .spec/.test filenames',()=>{
  assert.equal(isGovernedTestSource('frontend/e2e/founder-fixture.ts'),true);
  assert.equal(isGovernedTestSource('tests/golden/fixture.mjs'),true);
  assert.equal(isGovernedTestSource('frontend/src/components/RealComponent.tsx'),false);
  const findings=analyzeTestSkips('frontend/e2e/fixture.ts',"test.beforeEach(()=>{test.skip(!isolatedSession,'requires isolated owner session');});");
  assert.equal(findings.length,1);assert.throws(()=>validateSkips(findings,{entries:[]}),/Unregistered/);
});
function cleanup(path) {
  const target = resolve(path), parent = resolve(tmpdir());
  assert.ok(target.startsWith(`${parent}\\xroga-ci-fixture-`) || target.startsWith(`${parent}/xroga-ci-fixture-`));
  rmSync(target, { recursive: true, force: true });
}
test('manifest/lock agreement passes and an unrecorded dependency change fails', () => {
  const manifest = { name: 'fixture', version: '1.0.0', dependencies: { x: '1.0.0' } };
  const lock = { lockfileVersion: 3, packages: { '': structuredClone(manifest) } };
  assert.equal(validateManifestLock(manifest, lock), true);
  manifest.dependencies.x = '2.0.0';
  assert.throws(() => validateManifestLock(manifest, lock), /Manifest\/lock mismatch/);
});
test('an installed out-of-range compiler fails; only an explicit approved package override is accepted', () => {
  assert.throws(() => validateInstalledVersion('typescript', '6.0.3', '^5.8.2'), /violates declared range/);
  assert.throws(() => validateInstalledVersion('dotenv', '17.4.2', '^16.4.7'), /violates declared range/);
  validateInstalledVersion('typescript', '5.9.3', '^5.8.2');
  validateInstalledVersion('postcss', '8.5.24', '8.4.31', { postcss: '8.5.24' });
  assert.throws(() => validateInstalledVersion('postcss', '8.6.0', '8.4.31', { postcss: '8.5.24' }), /violates declared range/);
});
test('repeatability requires passing full runs at identical SHA, locks and installed graph without mutation', () => {
  const run = { result: 'PASS', sourceTreeMutated: false, sourceSha: 'fixture-sha', toolchain: { node: '22.21.1', npm: '10.9.4' },
    installedDependencies: { sha256: 'fixture-graph' }, lockfiles: [{ path: 'fixture-lock', sha256: 'fixture-hash' }],
    results: Array.from({ length: 19 }, (_, index) => ({ name: `fixture-stage-${index}`, exitCode: 0 })) };
  assert.equal(compareBaselineRuns(run, structuredClone(run)).result, 'PASS_REPEATED_CLEAN_BASELINE');
  for (const patch of [{ result: 'FAIL' }, { sourceTreeMutated: true }, { sourceSha: 'different' }, { installedDependencies: { sha256: 'changed' } }, { results: [] }]) {
    assert.throws(() => compareBaselineRuns(run, { ...run, ...patch }));
  }
});
test('focused tests fail even when someone attempts to register them; unexplained skips also fail', () => {
  const focused = analyzeTestSkips('fixture.test.ts', "test.only('forced', () => {});");
  assert.throws(() => validateSkips(focused, { entries: [] }), /Focused test/);
  for (const source of ["test('focused', {only: true}, () => {});", "it('focused', {'only': selected}, () => {});", "test('focused', {only}, () => {});"]) {
    assert.throws(() => validateSkips(analyzeTestSkips('fixture.test.ts', source), { entries: [] }), /Focused test/);
  }
  const skipped = analyzeTestSkips('fixture.test.ts', "test('masked', {skip: true}, () => {});");
  assert.throws(() => validateSkips(skipped, { entries: [] }), /Unregistered skipped/);
  assert.deepEqual(analyzeTestSkips('fixture.test.ts', "test('normal',{skip:false},()=>{}); const example = \"test.only('not executed')\";"), []);
});
test('known pre-existing platform skips need an owner, reason and future review date', () => {
  const skips = analyzeTestSkips('fixture.test.ts', "test('posix', {skip: windowsOnly}, () => {});");
  const entry = { id: skips[0].id, path: 'fixture.test.ts', owner: 'Xroga engineering', reason: 'Platform constraint', issue_or_command: 'XB01-C003', review_date: '2026-11-13' };
  assert.deepEqual(validateSkips(skips, { entries: [entry] }, '2026-10-13'), { registeredSkips: 1, focusedTests: 0 });
  assert.throws(() => validateSkips(skips, { entries: [{ ...entry, reason: '' }] }, '2026-10-13'), /lacks owner/);
  assert.throws(() => validateSkips(skips, { entries: [{ ...entry, review_date: '2026-10-12' }] }, '2026-10-13'), /expired/);
  assert.throws(() => validateSkips(skips, { entries: [{ ...entry, review_date: 'never' }] }, '2026-10-13'), /invalid review date/);
});
test('migration SQL and installer ordering pass; duplicate IDs, invalid names and broken SQL fail', async () => {
  const entries = [{ name: '002_second.sql', sql: 'select 2;' }, { name: '001_first.sql', sql: 'select 1;' }];
  const ordered = await validateMigrations(entries);
  assert.deepEqual(ordered.map(item => item.version), ['001', '002']);
  await assert.rejects(validateMigrations([{ name: '001_first.sql', sql: 'select 1;' }, { name: '001_again.sql', sql: 'select 2;' }]), /Duplicate migration/);
  await assert.rejects(validateMigrations([{ name: 'bad.sql', sql: 'select 1;' }]), /Invalid migration/);
  await assert.rejects(validateMigrations([{ name: '001_bad.sql', sql: 'create table broken (' }]), /SQL syntax rejected/);
});
test('missing runtime declaration or a different actual toolchain fails', () => {
  const directory = fixture();
  try { assert.throws(() => canonicalToolchain(directory), /node-version is missing/); } finally { cleanup(directory); }
  assert.throws(() => verifyToolchain({ nodeVersion: '0.0.1', npmVersion: '10.9.4' }), /Toolchain mismatch/);
  assert.deepEqual(verifyToolchain({ nodeVersion: '22.21.1', npmVersion: '10.9.4' }), { node: '22.21.1', npm: '10.9.4' });
});
test('production credentials and operational destinations are not inherited by baseline subprocesses', () => {
  const safe = safeTestEnvironment({ PATH: process.env.PATH, PLAYWRIGHT_BROWSERS_PATH: '/test-only/browser-cache', SUPABASE_SERVICE_ROLE_KEY: 'secret-canary', OPENAI_API_KEY: 'secret-canary', DATABASE_URL: 'production-canary', NEXT_PUBLIC_API_URL: 'https://production.example', CUSTOM_TOKEN: 'secret-canary' });
  assert.equal(safe.SUPABASE_SERVICE_ROLE_KEY, undefined);
  assert.equal(safe.OPENAI_API_KEY, undefined);
  assert.equal(safe.DATABASE_URL, undefined);
  assert.equal(safe.CUSTOM_TOKEN, undefined);
  assert.equal(safe.NEXT_PUBLIC_API_URL, 'http://127.0.0.1:8080');
  assert.equal(safe.PLAYWRIGHT_BROWSERS_PATH, '/test-only/browser-cache');
  const windows = safeTestEnvironment({ ComSpec: 'C:\\Windows\\System32\\cmd.exe', windir: 'C:\\Windows', SystemRoot: 'C:\\Windows', Path: 'fixture-path', SECRET_TOKEN: 'never-inherit' });
  assert.equal(windows.ComSpec, 'C:\\Windows\\System32\\cmd.exe');
  assert.equal(windows.windir, 'C:\\Windows');
  assert.equal(windows.SECRET_TOKEN, undefined);
  assert.equal(publicConfigOverridden('frontend/.env.production', 'NEXT_PUBLIC_SUPABASE_URL=production\nNEXT_PUBLIC_SUPABASE_ANON_KEY=production', safe), true);
  assert.equal(publicConfigOverridden('frontend/.env.production', 'SUPABASE_SERVICE_ROLE_KEY=forbidden', safe), false);
  assert.equal(publicConfigOverridden('frontend/.env.local', 'NEXT_PUBLIC_SUPABASE_URL=production', safe), false);
});
test('a genuine failing unit test stops the baseline before the next stage', async () => {
  const directory = fixture();
  try {
    const path = join(directory, 'failure.test.mjs');
    writeFileSync(path, "import {test} from 'node:test'; import assert from 'node:assert/strict'; test('intentional fixture failure',()=>assert.equal(1,2));");
    const result = await runSteps([{ name: 'unit-failure', args: ['--test', path] }, { name: 'must-not-run', args: ['-e', 'process.exit(0)'] }]);
    assert.notEqual(result.exitCode, 0);
    assert.equal(result.results.length, 1);
    assert.match(result.results[0].output, /intentional fixture failure/);
  } finally { cleanup(directory); }
});
test('a genuine compiler type error stops the baseline and cannot be counted as success', async () => {
  const directory = fixture();
  try {
    const path = join(directory, 'wrong.ts'), typeRoots = join(directory, 'types'); mkdirSync(typeRoots);
    writeFileSync(path, "const value: number = 'wrong'; export {value};");
    const tsc = createRequire(join(root, 'frontend/package.json')).resolve('typescript/bin/tsc');
    const result = await runSteps([{ name: 'type-failure', args: [tsc, '--noEmit', '--skipLibCheck', '--typeRoots', typeRoots, '--lib', 'es2022', path] }, { name: 'must-not-run', args: ['-e', 'process.exit(0)'] }]);
    assert.notEqual(result.exitCode, 0);
    assert.equal(result.results.length, 1);
    assert.match(result.results[0].output, /TS2322/);
  } finally { cleanup(directory); }
});
test('collection floors cannot let an empty successful test command pass', async () => {
  const result = await runSteps([{ name: 'empty-suite', args: ['-e', 'process.exit(0)'], minimumTests: 1 }]);
  assert.notEqual(result.exitCode, 0);
});
test('artifact logs redact bearer tokens, database credentials and explicit secret assignments', () => {
  const text = redactLog('Bearer unit-canary postgres://user:unit-canary@host/db password=unit-canary');
  assert.doesNotMatch(text, /unit-canary/);
  assert.match(text, /REDACTED/);
});
