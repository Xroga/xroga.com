/**
 * The in-sandbox verification mechanism, executed for real.
 *
 * ## What this proves, and what it does not
 *
 * It runs the **exact command `buildSandboxCommand` produces** and the **exact collector
 * `collectorSource` generates**, against a real generated project, with a real dev server that
 * this test never starts itself, driven by a real Chromium over real HTTP on `localhost`, and
 * feeds the result through the real `browserVerificationAdapter` into the real
 * `gateFromEvidence`. A PASS fixture passes and a FAIL fixture fails on the evidence the browser
 * actually collected.
 *
 * It does **not** prove the isolation boundary, because no container runtime exists in this
 * environment (`docker`, `podman` and `nerdctl` are all absent). The executor below spawns the
 * command as a local child process in a temporary workspace instead of inside a container or a
 * microVM. Every layer above the boundary is real; the boundary itself is not exercised here.
 * That limitation is stated rather than papered over, and it is the reason this PR does not
 * claim production-readiness — see `docs/production-browser-verification.md`.
 *
 * The one thing it must do above all: **fail if the adapter goes back to returning
 * `not_checked('application_did_not_start')` without running anything.** A placeholder cannot
 * produce a `passed` verdict carrying real HTTP statuses, so the PASS case is that guard.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { browserVerificationAdapter, type SandboxExecutor } from './browserVerificationAdapter.js';
import { browserAvailable } from './playwrightDriver.js';
import type { ProjectFile } from '../ai/patches.js';

/**
 * The workspace lives inside the repository tree on purpose.
 *
 * The collector resolves `playwright` through Node's ordinary lookup, which walks *upwards* from
 * the script. A real verification image has Playwright installed where the project runs; here,
 * placing the workspace under the repository reproduces that property using the repository's own
 * `node_modules`. Putting it in `/tmp` would make the collector report `browser_unavailable` —
 * correctly, but it would test the wrong thing.
 */
const WORKSPACE_ROOT = join(process.cwd(), '.tmp-insandbox-tests');

/**
 * A `SandboxExecutor` that materializes the files and runs the command locally.
 *
 * This stands in for the provider's own materialize-and-run. It writes every file to the
 * workspace exactly as `flyMachineSandbox` writes `files` into `/work`, then executes the
 * command with the caller's environment — never `process.env` wholesale, matching the real
 * boundary's rule that a secret reaches generated code only if a caller put it there.
 */
const localExecutor: SandboxExecutor = async (request) => {
  mkdirSync(WORKSPACE_ROOT, { recursive: true });
  const workspace = mkdtempSync(join(WORKSPACE_ROOT, 'run-'));
  try {
    for (const file of request.files) {
      const target = join(workspace, file.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.content);
    }

    return await new Promise((resolve) => {
      const child = spawn(request.command, [...request.args], {
        cwd: workspace,
        env: {
          ...request.environment,
          // The two the collector needs to find a browser at all. In a real verification image
          // these are properties of the image; here they are properties of this machine.
          PATH: process.env.PATH ?? '/usr/bin:/bin',
          ...(process.env.PLAYWRIGHT_BROWSERS_PATH
            ? { PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH }
            : {}),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, request.timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ exitCode: code, stdout, stderr, timedOut });
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        resolve({ exitCode: null, stdout, stderr: String(error), timedOut });
      });
    });
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
};

/** A dependency-free server, so the run needs no registry access. */
const server = (body: string) => `
import { createServer } from 'node:http';
const PORT = Number(process.env.PORT || 3000);
createServer((request, response) => {
  if (request.url === '/favicon.ico') { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'content-type': 'text/html' });
  response.end(\`${body}\`);
}).listen(PORT);
`;

const projectFiles = (pageBody: string): ProjectFile[] => [
  {
    path: 'package.json',
    content: JSON.stringify({
      name: 'fixture',
      type: 'module',
      // A web project with no dependencies: `assessWebVerifiability` needs the HTML entry point
      // to classify it, and skipping install keeps the run offline.
      scripts: { dev: 'node server.mjs' },
    }),
  },
  { path: 'index.html', content: '<!doctype html><html></html>' },
  { path: 'server.mjs', content: server(pageBody) },
];

/** Starts, renders the expected content, throws nothing. */
const PASS_FIXTURE = projectFiles(
  '<!doctype html><html><head><title>Fixture</title></head>' +
    '<body><h1 id="title">Create project</h1><button class="submit-btn">Submit</button></body></html>',
);

/** Starts and renders, but throws at runtime — the case a build check cannot catch. */
const FAIL_FIXTURE = projectFiles(
  '<!doctype html><html><head><title>Fixture</title></head>' +
    '<body><h1 id="title">Create project</h1>' +
    '<script>setTimeout(function(){ missingFunction(); }, 0);</script></body></html>',
);

const available = async () => true;

/**
 * A free port, obtained by binding one and releasing it.
 *
 * Inside a sandbox nothing else is listening and the default 3000 is safe. Here every run shares
 * one host, so a fixed port lets a *previous* run's server answer — and the browser would then
 * verify an application that is not the one under test and report a pass. A wrong pass is the
 * worst outcome this subsystem can produce, so the test refuses to depend on a shared port.
 */
async function freePort(): Promise<number> {
  const { createServer } = await import('node:net');
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

const verifyOn = async (files: ProjectFile[], criteria: string[] = []) => {
  const port = await freePort();
  const result = await browserVerificationAdapter({
    acceptanceCriteria: criteria,
    sandboxAvailable: available,
    browserPresent: available,
    execute: localExecutor,
    port,
    // Small ceilings: these fixtures start in under a second, and production-sized timeouts
    // would make a failing case take five minutes to say so.
    totalTimeoutMs: 90_000,
    serverTimeoutMs: 20_000,
  })({ files, buildPassed: true, testsPassed: null });
  return { result, port };
};

const verifyWith = async (files: ProjectFile[], criteria: string[] = []) =>
  (await verifyOn(files, criteria)).result;

/** Whether anything is still listening — the direct question a cleanup assertion should ask. */
async function portInUse(port: number): Promise<boolean> {
  const { createServer } = await import('node:net');
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => resolve(true));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(false)));
  });
}

const browserReady = await browserAvailable();
const skip = process.platform === 'win32'
  ? 'requires the Linux sandbox shell (/bin/sh)'
  : browserReady
    ? false
    : 'no browser binary available in this environment';

test('real in-sandbox run: a working application passes on collected evidence', { skip }, async () => {
  const result = await verifyWith(PASS_FIXTURE, ['The page shows "Create project"']);

  assert.equal(result.status, 'passed', `expected passed, got ${result.status}: ${result.blocker}`);
  // A placeholder that returns `not_checked` without executing cannot produce these: they exist
  // only because a browser really loaded a page a real server really served.
  assert.equal(result.attempted, true);
  assert.match(result.url ?? '', /^http:\/\/127\.0\.0\.1:\d+\//);
  assert.equal(result.verdict?.verified, true);
  assert.ok(result.verdict!.passedRungs.includes('http'), 'HTTP was never actually observed');
  assert.ok(result.verdict!.passedRungs.includes('dom'), 'the DOM assertion never ran');
});

test('real in-sandbox run: a page that throws fails with the exact error', { skip }, async () => {
  const result = await verifyWith(FAIL_FIXTURE);

  assert.equal(result.status, 'failed', `expected failed, got ${result.status}`);
  // The specific runtime error, from the real browser — not "verification failed".
  assert.match(result.evidenceForRepair, /missingFunction/);
  assert.equal(result.attempted, true);
});

test('real in-sandbox run: an unmet acceptance criterion fails on what the DOM actually held', { skip }, async () => {
  const result = await verifyWith(PASS_FIXTURE, ['The page shows "Checkout complete"']);

  assert.equal(result.status, 'failed');
  assert.match(result.evidenceForRepair, /Checkout complete/);
});

test('real in-sandbox run: the application does not outlive a passing command', { skip }, async () => {
  // Asked directly rather than inferred from a later run succeeding: a leaked server holds its
  // port, and this is the assertion that failed while `$!` named the wrong process group.
  const { result, port } = await verifyOn(PASS_FIXTURE);

  assert.equal(result.status, 'passed');
  assert.equal(await portInUse(port), false, 'the application was still listening after a pass');
});

test('cleanup also happens when verification fails', { skip }, async () => {
  const { result, port } = await verifyOn(FAIL_FIXTURE);

  assert.equal(result.status, 'failed');
  assert.equal(await portInUse(port), false, 'a failing run left its application running');
});

test.after(() => {
  rmSync(WORKSPACE_ROOT, { recursive: true, force: true });
});
