/**
 * Safe sandbox compile check for generated projects.
 * Writes to os.tmpdir → npm install --ignore-scripts → tsc --noEmit.
 * Never runs package lifecycle scripts (security).
 */

import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { spawn } from 'child_process';
import type { ProjectFile } from './patches.js';

export interface CompileValidateResult {
  ok: boolean;
  skipped: boolean;
  reason?: string;
  installOk?: boolean;
  tscOk?: boolean;
  issues: string[];
  logTail: string;
  durationMs: number;
}

const MAX_FILES = 80;
const MAX_FILE_BYTES = 200_000;
const INSTALL_MS = 90_000;
const TSC_MS = 60_000;

function runCmd(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      env: {
        ...process.env,
        npm_config_ignore_scripts: 'true',
        npm_config_audit: 'false',
        npm_config_fund: 'false',
        CI: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString('utf8');
      if (stdout.length > 40_000) stdout = stdout.slice(-40_000);
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString('utf8');
      if (stderr.length > 40_000) stderr = stderr.slice(-40_000);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: err.message, timedOut });
    });
  });
}

function shouldCompile(files: ProjectFile[]): boolean {
  return files.some((f) => f.path === 'package.json');
}

/**
 * Compile-validate a generated tree. Skips static HTML-only projects.
 */
export async function compileValidateProject(
  files: ProjectFile[],
  opts?: { signal?: AbortSignal },
): Promise<CompileValidateResult> {
  const started = Date.now();
  if (!shouldCompile(files)) {
    return {
      ok: true,
      skipped: true,
      reason: 'No package.json — static project, skipped compile',
      issues: [],
      logTail: '',
      durationMs: 0,
    };
  }

  if (opts?.signal?.aborted) {
    return {
      ok: false,
      skipped: false,
      reason: 'cancelled',
      issues: ['Compile cancelled'],
      logTail: '',
      durationMs: 0,
    };
  }

  const dir = await mkdtemp(join(tmpdir(), 'xroga-cv-'));
  const issues: string[] = [];
  let log = '';

  try {
    const limited = files
      .filter((f) => f.path && !f.path.includes('..') && !f.path.startsWith('/'))
      .filter((f) => !/node_modules\/|package-lock\.json|\.(png|jpe?g|gif|webp|ico)$/i.test(f.path))
      .slice(0, MAX_FILES);

    for (const f of limited) {
      const content =
        f.content.length > MAX_FILE_BYTES ? f.content.slice(0, MAX_FILE_BYTES) : f.content;
      const full = join(dir, f.path);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, content, 'utf8');
    }

    // Ensure a tsconfig exists for tsc when Next/TS files present
    const hasTs = limited.some((f) => /\.tsx?$/.test(f.path));
    const hasTsconfig = limited.some((f) => f.path === 'tsconfig.json');
    if (hasTs && !hasTsconfig) {
      await writeFile(
        join(dir, 'tsconfig.json'),
        JSON.stringify(
          {
            compilerOptions: {
              target: 'ES2017',
              module: 'esnext',
              moduleResolution: 'bundler',
              jsx: 'preserve',
              strict: false,
              skipLibCheck: true,
              noEmit: true,
              esModuleInterop: true,
              allowJs: true,
              paths: { '@/*': ['./*'] },
            },
            include: ['**/*.ts', '**/*.tsx'],
            exclude: ['node_modules'],
          },
          null,
          2,
        ),
        'utf8',
      );
    }

    const install = await runCmd(
      'npm',
      ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'],
      dir,
      INSTALL_MS,
    );
    log += `npm install:\n${install.stdout}\n${install.stderr}\n`;
    if (install.timedOut) {
      issues.push('npm install timed out');
      return {
        ok: false,
        skipped: false,
        installOk: false,
        issues,
        logTail: log.slice(-6000),
        durationMs: Date.now() - started,
      };
    }
    if (install.code !== 0) {
      issues.push(`npm install failed (exit ${install.code})`);
      // Still try tsc if node_modules partially exists
    }

    if (opts?.signal?.aborted) {
      return {
        ok: false,
        skipped: false,
        installOk: install.code === 0,
        issues: ['Compile cancelled after install'],
        logTail: log.slice(-6000),
        durationMs: Date.now() - started,
      };
    }

    // Prefer local binary from npm install; fall back to npx
    let tscResult = await runCmd(
      join(dir, 'node_modules', '.bin', 'tsc'),
      ['--noEmit', '--pretty', 'false'],
      dir,
      TSC_MS,
    );
    if (tscResult.code !== 0 && /ENOENT|not found|spawn/i.test(tscResult.stderr)) {
      tscResult = await runCmd('npx', ['tsc', '--noEmit', '--pretty', 'false'], dir, TSC_MS);
    }

    log += `tsc:\n${tscResult.stdout}\n${tscResult.stderr}\n`;
    if (tscResult.timedOut) {
      issues.push('tsc --noEmit timed out');
    } else if (tscResult.code !== 0) {
      const errLines = (tscResult.stdout + '\n' + tscResult.stderr)
        .split('\n')
        .filter((l) => /error TS\d+/i.test(l) || /error/i.test(l))
        .slice(0, 8);
      if (errLines.length) issues.push(...errLines);
      else issues.push(`tsc failed (exit ${tscResult.code})`);
    }

    const installOk = install.code === 0 && !install.timedOut;
    const tscOk = tscResult.code === 0 && !tscResult.timedOut;
    // Soft-pass install failures that are registry flakes if tsc somehow ok — rare
    const ok = installOk && tscOk;

    return {
      ok,
      skipped: false,
      installOk,
      tscOk,
      issues: issues.slice(0, 12),
      logTail: log.slice(-6000),
      durationMs: Date.now() - started,
      reason: ok ? 'compile passed' : 'compile failed',
    };
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      issues: [(err as Error).message],
      logTail: log.slice(-6000),
      durationMs: Date.now() - started,
      reason: 'compile exception',
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
