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
  buildOk?: boolean;
  buildCommand?: string;
  buildExitCode?: number | null;
  issues: string[];
  logTail: string;
  durationMs: number;
}

const MAX_FILES = 80;
const MAX_FILE_BYTES = 200_000;
// Cold Fly machines frequently need more than 90 seconds to download a real
// framework dependency tree. Keep the validation bounded, but do not turn a
// normal cold install into a false code failure.
const INSTALL_MS = 180_000;
const TSC_MS = 60_000;
const BUILD_MS = 180_000;

/**
 * A cache directory shared by every validation on this machine.
 *
 * Each run previously installed into a fresh `mkdtemp` with npm's default per-process
 * cache resolution, so a Next.js dependency tree was downloaded from scratch every
 * time. On run `dca6799a` that install ran for the full 180-second budget and timed
 * out, and the finished twenty-one-file project was discarded because of it.
 *
 * Pointing every install at one directory means the download happens once per machine
 * rather than once per build. It is still inside the ephemeral filesystem, so nothing
 * is persisted across deploys and no user content is shared — an npm cache holds only
 * public registry tarballs.
 */
const NPM_CACHE_DIR = join(tmpdir(), 'xroga-npm-cache');

/**
 * Install flags.
 *
 * `--ignore-scripts` is a security boundary and must never be removed: it is what stops
 * a generated `package.json` from executing arbitrary code on our machine.
 *
 * The retry settings make a failing network fail *fast* instead of consuming the whole
 * budget. npm's defaults retry with a maximum backoff of a minute, which turns one slow
 * mirror into a three-minute timeout that reads to the user as a broken product.
 */
const INSTALL_ARGS = [
  'install',
  '--ignore-scripts',
  '--no-audit',
  '--no-fund',
  '--prefer-offline',
  `--cache=${NPM_CACHE_DIR}`,
  '--fetch-retries=2',
  '--fetch-retry-maxtimeout=20000',
];

export function requiredProductionBuild(files: ProjectFile[]): { command: string; args: string[] } | null {
  const raw = files.find((file) => file.path === 'package.json')?.content;
  if (!raw) return null;
  try {
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    return pkg.scripts?.build ? { command: 'npm', args: ['run', 'build'] } : null;
  } catch {
    return null;
  }
}

export function productionValidationAllowsDeployment(result: CompileValidateResult): boolean {
  if (result.skipped) return result.ok;
  if (!result.ok || result.installOk !== true || result.tscOk !== true) return false;
  return result.buildCommand ? result.buildOk === true && result.buildExitCode === 0 : true;
}

/**
 * Returns true only when changing generated source can reasonably repair the
 * validation failure. Infrastructure-only failures must not spend another
 * model call pretending a source edit can repair the package registry/network.
 */
export function validationFailureNeedsCodeRepair(result: CompileValidateResult): boolean {
  if (result.ok || result.skipped) return false;
  if (!result.issues.length) return true;
  return !result.issues.every((issue) => /npm install timed out/i.test(issue));
}

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
  if (!files.some((f) => f.path === 'package.json')) return false;
  // Chrome / Electron / Expo: JS scaffolds — do not block ship on fake tsc
  if (files.some((f) => f.path === 'manifest.json')) return false;
  const pkg = files.find((f) => f.path === 'package.json')?.content ?? '';
  if (/"electron"/i.test(pkg) && !/"next"/i.test(pkg)) return false;
  if (/"expo"/i.test(pkg) && !/"next"/i.test(pkg)) return false;
  return true;
}

/**
 * Compile-validate a generated tree. Skips static HTML-only and non-web scaffolds.
 */
export async function compileValidateProject(
  files: ProjectFile[],
  opts?: { signal?: AbortSignal },
): Promise<CompileValidateResult> {
  const started = Date.now();
  if (!shouldCompile(files)) {
    const pkg = files.find((f) => f.path === 'package.json')?.content ?? '';
    const reason = files.some((f) => f.path === 'manifest.json')
      ? 'Chrome extension — skipped compile (sideload / zip path)'
      : /"electron"/i.test(pkg)
        ? 'Electron desktop — skipped compile (local start / GitHub Releases)'
        : /"expo"/i.test(pkg)
          ? 'Expo mobile — skipped compile (Expo Go / EAS on your account)'
          : 'No package.json — static project, skipped compile';
    return {
      ok: true,
      skipped: true,
      reason,
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

    const install = await runCmd('npm', INSTALL_ARGS, dir, INSTALL_MS);
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
    const requiredBuild = requiredProductionBuild(limited);
    let buildOk: boolean | undefined;
    let buildExitCode: number | null | undefined;
    if (installOk && tscOk && requiredBuild) {
      const buildResult = await runCmd(requiredBuild.command, requiredBuild.args, dir, BUILD_MS);
      buildExitCode = buildResult.code;
      buildOk = buildResult.code === 0 && !buildResult.timedOut;
      log += `production build (${requiredBuild.command} ${requiredBuild.args.join(' ')}):\n${buildResult.stdout}\n${buildResult.stderr}\n`;
      if (buildResult.timedOut) issues.push('production build timed out');
      else if (!buildOk) issues.push(`production build failed (exit ${buildResult.code})`);
    } else if (requiredBuild) {
      buildOk = false;
      buildExitCode = null;
      issues.push('production build blocked by install or typecheck failure');
    }
    const ok = installOk && tscOk && (!requiredBuild || buildOk === true);

    return {
      ok,
      skipped: false,
      installOk,
      tscOk,
      buildOk,
      buildCommand: requiredBuild ? `${requiredBuild.command} ${requiredBuild.args.join(' ')}` : undefined,
      buildExitCode,
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
