/**
 * A REAL process runner for tests only: it materialises the files in a fresh temp directory and runs the planned stages with the
 * machine's own node and python, so a test proves that a change actually passes the project's own tests. It is not an isolation
 * boundary (it enforces no network or resource policy) and must never be registered as a production runtime.
 */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { SandboxExecutionRequest, SandboxExecutionResult } from '../../../sandbox/sandboxTypes.js';
import type { ExecutionPort } from '../testRunner.js';

interface Spawned { exitCode: number | null; stdout: string; stderr: string; timedOut: boolean; durationMs: number }

function run(command: string, args: readonly string[], cwd: string, timeoutMs: number, env: Record<string, string>, signal?: AbortSignal): Promise<Spawned> {
  return new Promise((resolve) => {
    const started = Date.now(); let stdout = ''; let stderr = ''; let timedOut = false;
    const child = spawn(command, [...args], { cwd, env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '', ...env }, shell: process.platform === 'win32' && command === 'npm', windowsHide: true });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    const onAbort = () => child.kill('SIGKILL');
    signal?.addEventListener('abort', onAbort, { once: true });
    child.stdout.on('data', (d) => { stdout += String(d); if (stdout.length > 200_000) stdout = stdout.slice(-100_000); });
    child.stderr.on('data', (d) => { stderr += String(d); if (stderr.length > 200_000) stderr = stderr.slice(-100_000); });
    child.on('error', (e) => { clearTimeout(timer); resolve({ exitCode: 127, stdout, stderr: `${stderr}${e.message}`, timedOut, durationMs: Date.now() - started }); });
    child.on('close', (code) => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); resolve({ exitCode: code, stdout, stderr, timedOut, durationMs: Date.now() - started }); });
  });
}

export class LocalProcessPort implements ExecutionPort {
  readonly requests: SandboxExecutionRequest[] = [];
  readonly workdirs: string[] = [];
  async execute(request: Omit<SandboxExecutionRequest, 'limits'> & { limits?: Partial<SandboxExecutionRequest['limits']> }): Promise<SandboxExecutionResult> {
    this.requests.push(request as SandboxExecutionRequest);
    const dir = await mkdtemp(join(tmpdir(), 'xroga-change-'));
    this.workdirs.push(dir);
    try {
      for (const f of request.files) { const full = join(dir, ...f.path.split('/')); await mkdir(dirname(full), { recursive: true }); await writeFile(full, f.content, 'utf8'); }
      const stages = request.stages ?? [{ id: 'command', command: request.command, args: request.args, networkPolicy: request.networkPolicy, timeoutMs: request.timeoutMs }];
      const records: Array<SandboxExecutionResult & { id: string }> = []; const started = Date.now();
      for (const s of stages) {
        const r = await run(s.command, s.args, s.cwd ? join(dir, ...s.cwd.split('/')) : dir, s.timeoutMs, request.environment, request.signal);
        records.push({ id: s.id, exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr, timedOut: r.timedOut, killedForLimit: false, durationMs: r.durationMs });
        if (r.exitCode !== 0) break;
      }
      const last = records[records.length - 1]!;
      return { exitCode: last.exitCode, stdout: last.stdout, stderr: last.stderr, timedOut: last.timedOut, killedForLimit: false, durationMs: Date.now() - started, stages: records };
    } finally { await rm(dir, { recursive: true, force: true }).catch(() => undefined); }
  }
}
