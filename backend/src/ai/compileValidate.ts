/**
 * Compile check for generated projects, executed under isolation.
 *
 * This file used to `spawn` npm and the generated project's own build command with
 * `env: { ...process.env }`. `--ignore-scripts` blocked `postinstall`, but a `build`
 * script is *meant* to run and its command comes from a model-generated package.json —
 * so every Xroga secret in the API process environment was readable by generated code.
 *
 * Execution now goes through `src/sandbox`, which passes an explicit allowlisted
 * environment and refuses entirely when no isolation runtime is present. There is no
 * unsafe fallback: a refusal surfaces as `sandboxUnavailable`, which
 * `classifyValidation` already maps to `not_verified` — the code still ships and the
 * deployment build becomes the verification.
 */

import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import type { ProjectFile } from './patches.js';
import { buildSandboxEnvironment } from '../sandbox/sandboxEnvironment.js';
import { executeSandboxed, probeSandbox } from '../sandbox/sandboxRuntime.js';
import { SandboxUnavailableError, type SandboxNetworkPolicy } from '../sandbox/sandboxTypes.js';
import { buildCompileCommand, parseCompileResult } from './compileCommand.js';

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
  /**
   * True when validation did not run because no isolation runtime was available.
   * Distinct from a failure: nothing is known about the code either way, so callers
   * must report this as "not verified", never as a defect.
   */
  sandboxUnavailable?: boolean;
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

/**
 * Runs one validation command under isolation.
 *
 * `networkPolicy` is `registry-only` for dependency installation and `none` for
 * everything after it — a typecheck or a production build has no legitimate reason to
 * reach the network, and denying it removes exfiltration as an option even if the
 * environment allowlist were ever weakened.
 *
 * Throws `SandboxUnavailableError` when nothing can isolate the work. It is deliberately
 * not caught here: `compileValidateProject` turns it into an honest "not verified"
 * result, and swallowing it lower down would make an unverified build look checked.
 */
async function runCmd(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  files: ProjectFile[],
  networkPolicy: SandboxNetworkPolicy,
  extraEnvironment?: Record<string, string>,
): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  const result = await executeSandboxed({
    files,
    command: cmd,
    args,
    timeoutMs,
    networkPolicy,
    // Never `process.env`. The allowlist is the boundary; see sandboxEnvironment.
    environment: buildSandboxEnvironment({ XROGA_SANDBOX_WORKDIR: cwd, ...(extraEnvironment ?? {}) }),
  });
  return {
    code: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut,
  };
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

  // Refuse before writing anything if nothing can isolate the execution. The brief for
  // this boundary is explicit: a missing runtime marks the build not locally verified,
  // it never falls back to running generated code on the API host.
  const availability = await probeSandbox();
  if (!availability.available) {
    return {
      ok: false,
      skipped: true,
      sandboxUnavailable: true,
      reason:
        availability.detail ??
        'No isolation runtime is available, so generated code was not executed here.',
      issues: [],
      logTail: '',
      durationMs: Date.now() - started,
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

    // Install, typecheck and build as ONE sandbox execution.
    //
    // These were three separate `runCmd` calls, and each `runCmd` is its own
    // `executeSandboxed`. That only works if executions share a filesystem, and they do not:
    // the contract is one-shot, and the Fly provider gives each execution a fresh disposable
    // microVM holding the project's source and nothing else. The `node_modules` from the
    // install execution therefore did not exist for the typecheck execution — local `tsc`
    // missing, `npx` fallback with no network under a `none` policy, exit **127**, reported to
    // the user as "TypeScript errors remain". Production run
    // 2e559410-f9b5-4146-8c61-5447f0683426: 28 files generated, install clean, no type errors,
    // blocked from shipping anyway.
    //
    // One execution makes the dependency between the stages real rather than assumed. See
    // `compileCommand.ts` for why the network denial after install is preserved.
    const requiredBuild = requiredProductionBuild(limited);
    const { command: compileCmd, args: compileArgs } = buildCompileCommand({
      installArgs: INSTALL_ARGS,
      typecheck: true,
      buildScript: requiredBuild ? 'build' : null,
    });
    const combined = await runCmd(
      compileCmd,
      compileArgs,
      dir,
      INSTALL_MS + TSC_MS + BUILD_MS,
      limited,
      // The registry is needed by install. Everything after it drops the network from inside
      // the sandbox, so the typecheck and build keep the denial they had as separate stages.
      'registry-only',
      requiredBuild ? { XROGA_COMPILE_BUILD_SCRIPT: 'build' } : undefined,
    );
    log += `compile (install + typecheck + build):\n${combined.stdout}\n${combined.stderr}\n`;

    const payload = parseCompileResult(combined.stdout);

    if (combined.timedOut) {
      issues.push('compile timed out');
      return {
        ok: false,
        skipped: false,
        installOk: payload?.installCode === 0,
        issues,
        logTail: log.slice(-6000),
        durationMs: Date.now() - started,
      };
    }

    if (!payload) {
      // No structured result at all. That is our harness failing to report, not evidence about
      // the generated code, and it must never be phrased as a TypeScript failure.
      issues.push('compile did not report a result');
      return {
        ok: false,
        skipped: true,
        reason: 'the compile stage produced no structured result, so the code was not judged',
        issues,
        logTail: log.slice(-6000),
        durationMs: Date.now() - started,
      };
    }

    if (opts?.signal?.aborted) {
      return {
        ok: false,
        skipped: false,
        installOk: payload.installCode === 0,
        issues: ['Compile cancelled after install'],
        logTail: log.slice(-6000),
        durationMs: Date.now() - started,
      };
    }

    const installOk = payload.installCode === 0;
    if (!installOk) issues.push(`npm install failed (exit ${payload.installCode ?? 'unknown'})`);

    // A typecheck that never ran is an infrastructure gap, not a type error. Keeping the two
    // apart is the whole point: the old path collapsed them and blamed the user's code.
    const tscOk = payload.tscRan && payload.tscCode === 0;
    if (!payload.tscRan) {
      issues.push('typecheck did not run: no TypeScript compiler was available after install');
    } else if (payload.tscCode !== 0) {
      const errLines = combined.stdout
        .split('\n')
        .filter((line) => /error TS\d+/i.test(line))
        .slice(0, 8);
      if (errLines.length) issues.push(...errLines);
      else issues.push(`tsc failed (exit ${payload.tscCode})`);
    }

    let buildOk: boolean | undefined;
    let buildExitCode: number | null | undefined;
    if (requiredBuild) {
      if (payload.buildRan) {
        buildExitCode = payload.buildCode;
        buildOk = payload.buildCode === 0;
        if (!buildOk) issues.push(`production build failed (exit ${payload.buildCode ?? 'unknown'})`);
      } else {
        buildOk = false;
        buildExitCode = null;
        issues.push('production build blocked by install or typecheck failure');
      }
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
    // A runtime that disappears mid-validation is still an infrastructure outcome, not
    // evidence about the generated code.
    if (err instanceof SandboxUnavailableError) {
      return {
        ok: false,
        skipped: true,
        sandboxUnavailable: true,
        reason: err.message,
        issues: [],
        logTail: log.slice(-6000),
        durationMs: Date.now() - started,
      };
    }
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
