import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { buildSandboxEnvironment } from './sandboxEnvironment.js';
import {
  probeSandbox,
  executeSandboxed,
  setSandboxRuntimeForTesting,
} from './sandboxRuntime.js';
import { SandboxUnavailableError, type SandboxRuntime } from './sandboxTypes.js';
import { compileValidateProject } from '../ai/compileValidate.js';
import { classifyValidation } from '../ai/validationVerdict.js';

/**
 * End-to-end cover for the execution boundary.
 *
 * The first test is the one that matters: it really spawns a process the way a
 * generated build script would run, with a real secret set in *this* process's
 * environment, and proves the child cannot read it. It exercises the actual
 * environment construction rather than asserting on source text.
 */

const SECRET_NAME = 'SUPABASE_SERVICE_ROLE_KEY';
const SECRET_VALUE = 'xroga-test-service-role-do-not-leak';

/** Runs a script the way generated code would run, under the sandbox environment. */
function runChild(script: string, env: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', script], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (c: Buffer) => (out += c.toString('utf8')));
    child.stderr.on('data', (c: Buffer) => (out += c.toString('utf8')));
    child.on('error', reject);
    child.on('close', () => resolve(out));
  });
}

test('a generated script cannot read a secret set in the parent process', async () => {
  const previous = process.env[SECRET_NAME];
  process.env[SECRET_NAME] = SECRET_VALUE;
  try {
    // Exactly what a malicious or careless generated build script would do.
    const script = `process.stdout.write(JSON.stringify(process.env))`;

    const leakedBefore = await runChild(script, process.env as Record<string, string>);
    assert.ok(
      leakedBefore.includes(SECRET_VALUE),
      'precondition: the old inherited-env behaviour really did leak, so this test is meaningful',
    );

    const sealed = await runChild(script, buildSandboxEnvironment());
    assert.ok(!sealed.includes(SECRET_VALUE), 'the sandbox environment leaked the secret');
    assert.ok(!sealed.includes(SECRET_NAME), 'the sandbox environment leaked the secret name');
  } finally {
    if (previous === undefined) delete process.env[SECRET_NAME];
    else process.env[SECRET_NAME] = previous;
  }
});

test('with no isolation runtime, execution is refused rather than run unsafely', async () => {
  const unavailable: SandboxRuntime = {
    name: 'test-none',
    probe: async () => ({
      available: false,
      runtime: 'test-none',
      reason: 'runtime_unavailable',
      detail: 'no runtime in this environment',
    }),
    execute: async () => {
      throw new Error('execute must never be reached when the probe says unavailable');
    },
  };
  setSandboxRuntimeForTesting(unavailable);
  try {
    await assert.rejects(
      executeSandboxed({
        files: [],
        command: 'npm',
        args: ['install'],
        timeoutMs: 1000,
        networkPolicy: 'registry-only',
        environment: buildSandboxEnvironment(),
      }),
      SandboxUnavailableError,
    );
  } finally {
    setSandboxRuntimeForTesting(null);
  }
});

test('a refused sandbox reports not-verified, never a code defect', async () => {
  // The critical product property: our missing runtime must not be blamed on the
  // user's code. `classifyValidation` maps this to `not_verified`, which still ships.
  const unavailable: SandboxRuntime = {
    name: 'test-none',
    probe: async () => ({ available: false, runtime: 'test-none', reason: 'runtime_unavailable' }),
    execute: async () => {
      throw new Error('unreachable');
    },
  };
  setSandboxRuntimeForTesting(unavailable);
  try {
    const compile = await compileValidateProject([
      { path: 'package.json', content: '{"name":"x","scripts":{"build":"next build"},"dependencies":{"next":"15.0.0"}}' },
      { path: 'app/page.tsx', content: 'export default function Page() { return null; }' },
    ]);

    assert.equal(compile.sandboxUnavailable, true);
    assert.equal(compile.skipped, true);
    assert.deepEqual(compile.issues, [], 'a refusal must not manufacture code issues');

    const { verdict, unverifiedReasons } = classifyValidation({
      compile,
      qa: { ok: true, issues: [] },
      structureOk: true,
    });
    assert.equal(verdict, 'not_verified');
    assert.notEqual(verdict, 'code_defect');
    assert.ok(unverifiedReasons.some((reason) => /not executed|run safely/i.test(reason)));
  } finally {
    setSandboxRuntimeForTesting(null);
  }
});

test('a genuine code defect is still a code defect when the sandbox does work', async () => {
  // The refusal path must not become a way for real failures to escape.
  const { verdict } = classifyValidation({
    compile: {
      ok: false,
      skipped: false,
      installOk: true,
      tscOk: false,
      issues: ["app/page.tsx(3,1): error TS2304: Cannot find name 'Hero'."],
      logTail: '',
      durationMs: 10,
    },
    qa: { ok: true, issues: [] },
    structureOk: true,
  });
  assert.equal(verdict, 'code_defect');
});

test('the real probe never claims isolation it cannot deliver', async () => {
  // In CI and on the Fly host there is no nested container runtime, so this must
  // report unavailable rather than silently running generated code on the host.
  setSandboxRuntimeForTesting(null);
  const availability = await probeSandbox();
  if (!availability.available) {
    assert.ok(availability.reason, 'an unavailable probe must say why');
  } else {
    // If a runtime genuinely exists here, it must identify itself.
    assert.ok(availability.runtime.length > 0);
  }
});

test('the sandbox request carries real limits, not unbounded execution', async () => {
  const captured: Array<Record<string, unknown>> = [];
  const recording: SandboxRuntime = {
    name: 'test-recorder',
    probe: async () => ({ available: true, runtime: 'test-recorder' }),
    execute: async (request) => {
      captured.push(request as unknown as Record<string, unknown>);
      return {
        exitCode: 0,
        stdout: '',
        stderr: '',
        timedOut: false,
        killedForLimit: false,
        durationMs: 1,
      };
    },
  };
  setSandboxRuntimeForTesting(recording);
  try {
    await executeSandboxed({
      files: [],
      command: 'npm',
      args: ['install'],
      timeoutMs: 5_000,
      networkPolicy: 'registry-only',
      environment: buildSandboxEnvironment(),
    });
    const limits = captured[0].limits as Record<string, number>;
    assert.ok(limits.memoryMb > 0);
    assert.ok(limits.cpuSeconds > 0);
    assert.ok(limits.diskMb > 0);
    assert.ok(limits.maxProcesses > 0);
  } finally {
    setSandboxRuntimeForTesting(null);
  }
});
