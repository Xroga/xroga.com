import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildCompileCommand,
  parseCompileResult,
  COMPILE_RESULT_BEGIN,
  COMPILE_RESULT_END,
} from './compileCommand.js';

/**
 * The production defect, reproduced.
 *
 * Run `2e559410-f9b5-4146-8c61-5447f0683426` generated 28 files, installed cleanly, had no type
 * errors, and was still blocked from shipping with "TypeScript errors remain after 1 automatic
 * repair attempt — tsc failed (exit 127)". Exit 127 is *command not found*: the compiler never
 * ran, because `npm install` and `tsc` were separate sandbox executions and the sandbox is
 * one-shot, so the `node_modules` from the first did not exist in the second.
 *
 * The first test models exactly that — two executions, each a fresh workspace holding only the
 * source files — and shows the old shape fails while the new single execution succeeds. The
 * model is real: it actually runs the commands in real directories, rather than describing what
 * would happen.
 */

/** A tiny project whose "compiler" exists only inside `node_modules`, as a real one does. */
function project(dir: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: 'fixture', private: true, scripts: { build: 'echo built' },
  }));
  writeFileSync(join(dir, 'index.ts'), 'export const x: number = 1;\n');
}

/** Stands in for `npm install`: creates the local binary the later stages depend on. */
function installInto(dir: string): void {
  const bin = join(dir, 'node_modules', '.bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'tsc'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
}

// ---------------------------------------------------------------------------
// The defect
// ---------------------------------------------------------------------------

test('separate executions lose node_modules — this is the production failure', () => {
  // Execution 1: a fresh workspace, install runs, node_modules appears.
  const first = mkdtempSync(join(tmpdir(), 'exec1-'));
  project(first);
  installInto(first);
  assert.ok(existsSync(join(first, 'node_modules', '.bin', 'tsc')), 'install did not produce the compiler');

  // Execution 2: a *different* fresh workspace holding only the source files, which is exactly
  // what a one-shot sandbox materializes. The compiler from execution 1 is simply not there.
  const second = mkdtempSync(join(tmpdir(), 'exec2-'));
  project(second);

  const result = spawnSync('./node_modules/.bin/tsc', ['--noEmit'], { cwd: second, shell: true });

  assert.notEqual(result.status, 0, 'the second execution unexpectedly found a compiler');
  assert.equal(result.status, 127, `expected 127 (command not found), got ${result.status}`);

  rmSync(first, { recursive: true, force: true });
  rmSync(second, { recursive: true, force: true });
});

test('one execution keeps what install produced — this is the fix', () => {
  const dir = mkdtempSync(join(tmpdir(), 'combined-'));
  project(dir);

  // The real generated script, with the install stage standing in for npm so the test needs no
  // registry. Everything after install is the shipped script verbatim.
  const { args } = buildCompileCommand({ installArgs: ['install'], typecheck: true, buildScript: null });
  const script = args[1]!.replace(
    /npm 'install' 2>&1; INSTALL_CODE=\$\?/,
    'mkdir -p node_modules/.bin && printf "#!/bin/sh\\nexit 0\\n" > node_modules/.bin/tsc && chmod +x node_modules/.bin/tsc; INSTALL_CODE=$?',
  );
  assert.notEqual(script, args[1], 'the install stage was not found in the generated script');

  const run = spawnSync('/bin/sh', ['-c', script], { cwd: dir, encoding: 'utf8' });
  const payload = parseCompileResult(run.stdout);

  assert.ok(payload, 'no structured result was printed');
  assert.equal(payload!.installCode, 0);
  assert.equal(payload!.tscRan, true, 'the typecheck did not run — the compiler was lost again');
  assert.equal(payload!.tscCode, 0);

  rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// A missing compiler is never reported as a type error
// ---------------------------------------------------------------------------

test('a missing compiler reports tscRan=false, not a type-check failure', () => {
  // The distinction the production message got wrong. `tscRan: false` is an infrastructure gap;
  // `tscCode !== 0` is evidence about the code. Collapsing them is how "exit 127" became
  // "TypeScript errors remain".
  const dir = mkdtempSync(join(tmpdir(), 'notsc-'));
  project(dir);

  const { args } = buildCompileCommand({ installArgs: ['install'], typecheck: true, buildScript: null });
  const script = args[1]!.replace(/npm 'install' 2>&1; INSTALL_CODE=\$\?/, 'INSTALL_CODE=0');

  const run = spawnSync('/bin/sh', ['-c', script], { cwd: dir, encoding: 'utf8' });
  const payload = parseCompileResult(run.stdout);

  assert.ok(payload);
  assert.equal(payload!.tscRan, false);
  assert.equal(payload!.tscCode, null, 'a compiler that never ran must not carry an exit code');

  rmSync(dir, { recursive: true, force: true });
});

test('a real type error is still reported as a failure', () => {
  // The direction check: the fix must not make everything pass.
  const dir = mkdtempSync(join(tmpdir(), 'typeerr-'));
  project(dir);

  const { args } = buildCompileCommand({ installArgs: ['install'], typecheck: true, buildScript: null });
  const script = args[1]!.replace(
    /npm 'install' 2>&1; INSTALL_CODE=\$\?/,
    'mkdir -p node_modules/.bin && printf "#!/bin/sh\\necho \\"index.ts(1,14): error TS2322: Type string is not assignable to type number.\\"\\nexit 2\\n" > node_modules/.bin/tsc && chmod +x node_modules/.bin/tsc; INSTALL_CODE=$?',
  );

  const run = spawnSync('/bin/sh', ['-c', script], { cwd: dir, encoding: 'utf8' });
  const payload = parseCompileResult(run.stdout);

  assert.ok(payload);
  assert.equal(payload!.tscRan, true);
  assert.equal(payload!.tscCode, 2);
  assert.match(run.stdout, /error TS2322/, 'the compiler diagnostics must reach the log');

  rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Stage ordering and dependencies
// ---------------------------------------------------------------------------

test('the build runs only after install and typecheck both succeed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'buildgate-'));
  project(dir);

  const { args } = buildCompileCommand({ installArgs: ['install'], typecheck: true, buildScript: 'build' });
  // Install "fails", so the build must not run at all.
  const script = args[1]!.replace(/npm 'install' 2>&1; INSTALL_CODE=\$\?/, 'INSTALL_CODE=1');

  const run = spawnSync('/bin/sh', ['-c', script], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, XROGA_COMPILE_BUILD_SCRIPT: 'build' },
  });
  const payload = parseCompileResult(run.stdout);

  assert.ok(payload);
  assert.equal(payload!.buildRan, false, 'the build ran despite a failed install');
  assert.equal(payload!.buildCode, null);

  rmSync(dir, { recursive: true, force: true });
});

test('no build script means no build stage in the script at all', () => {
  const { args } = buildCompileCommand({ installArgs: ['install'], typecheck: true, buildScript: null });
  assert.equal(args[1]!.includes('production build'), false);
});

// ---------------------------------------------------------------------------
// Shape and safety
// ---------------------------------------------------------------------------

test('the generated script is valid shell', () => {
  const { command, args } = buildCompileCommand({
    installArgs: ['install', '--ignore-scripts'], typecheck: true, buildScript: 'build',
  });
  assert.equal(command, '/bin/sh');
  execFileSync('/bin/sh', ['-n', '-c', args[1]!], { stdio: 'pipe' });
});

test('the build script name travels in the environment, never interpolated', () => {
  // `npm run "$VAR"` is inert for a name containing a semicolon; interpolating it would not be.
  const { args } = buildCompileCommand({ installArgs: ['install'], typecheck: true, buildScript: 'build; rm -rf /' });
  assert.equal(args[1]!.includes('rm -rf /'), false, 'the build script name was interpolated');
  assert.match(args[1]!, /npm run "\$XROGA_COMPILE_BUILD_SCRIPT"/);
});

test('install arguments are quoted', () => {
  const { args } = buildCompileCommand({
    installArgs: ['install', '--cache=/tmp/x', "weird'token"], typecheck: false, buildScript: null,
  });
  execFileSync('/bin/sh', ['-n', '-c', args[1]!], { stdio: 'pipe' });
  assert.match(args[1]!, /'--cache=\/tmp\/x'/);
});

test('the network is dropped after install where the kernel allows it', () => {
  // The denial the separate executions had, restored from inside the sandbox. The script probes
  // rather than assumes: `unshare -n true` must actually succeed before it is used.
  const { args } = buildCompileCommand({ installArgs: ['install'], typecheck: true, buildScript: 'build' });
  assert.match(args[1]!, /unshare -n true/);
  assert.match(args[1]!, /NET_DENY="unshare -n"/);
  assert.match(args[1]!, /\$NET_DENY \.\/node_modules\/\.bin\/tsc/);
});

test('no result at all is distinguished from a reported failure', () => {
  assert.equal(parseCompileResult('npm noise only'), null);
  const payload = parseCompileResult(
    `noise\n${COMPILE_RESULT_BEGIN}{"installCode":0,"tscCode":0,"tscRan":true,"buildCode":0,"buildRan":true,"networkDeniedAfterInstall":true}${COMPILE_RESULT_END}\n`,
  );
  assert.equal(payload?.installCode, 0);
  assert.equal(payload?.networkDeniedAfterInstall, true);
});

// ---------------------------------------------------------------------------
// The pipeline keeps using one execution
// ---------------------------------------------------------------------------

test('compileValidate runs the compile stages as a single sandbox execution', () => {
  // The regression is structural: any return to a second `runCmd` in this path reintroduces it,
  // because each `runCmd` is its own one-shot sandbox with a fresh filesystem.
  const source = readFileSync(new URL('./compileValidate.ts', import.meta.url), 'utf8');

  assert.match(source, /buildCompileCommand\(/, 'the combined compile command is not used');
  assert.match(source, /parseCompileResult\(/, 'the structured result is not parsed');

  const executions = source.match(/await runCmd\(/g) ?? [];
  assert.equal(
    executions.length,
    1,
    `compile performs ${executions.length} sandbox executions; stages cannot share a filesystem across them`,
  );

  // The specific commands that used to be their own executions must not return.
  assert.equal(/await runCmd\('npm', INSTALL_ARGS/.test(source), false, 'install went back to its own execution');
  assert.equal(/runCmd\('npx', \['tsc'/.test(source), false, 'the npx tsc fallback returned');
});

test('a compiler that never ran is not reported as a TypeScript failure', () => {
  const source = readFileSync(new URL('./compileValidate.ts', import.meta.url), 'utf8');
  // The production message blamed the user's code for our missing dependency. These two must
  // stay distinguishable in the reporting, not just in the payload.
  assert.match(source, /typecheck did not run/);
  assert.match(source, /payload\.tscRan/);
});
