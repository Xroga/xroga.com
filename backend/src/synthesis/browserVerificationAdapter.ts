/**
 * The production browser-verification adapter — the real caller.
 *
 * `browserVerification.ts` having tests proved nothing about whether production ever looked at
 * a page. This is the function `productionAdapters` hands to canonical execution, so the
 * universal path now genuinely asks "does this application work in a browser?" on every web
 * build.
 *
 * ## What it does
 *
 * It evaluates every precondition and, when they are met, **runs the application and a real
 * browser inside one sandbox execution** and judges what came back. When a precondition is not
 * met it returns `not_checked` carrying the specific reason — which contributes nothing to
 * `verified` and is surfaced to the user.
 *
 * The browser runs *inside* the sandbox, beside the application, hitting `localhost`. That is
 * not an implementation convenience: the Fly Machines provider declares no `services` block and
 * allocates no IP, so a generated application is unreachable from anywhere for its entire life,
 * and reaching it from a browser on the API host would mean exposing it. Sending the browser to
 * the application preserves that isolation property exactly, and fits the one-shot
 * `SandboxRuntime.execute()` contract without changing it. See `inSandboxBrowser.ts`.
 *
 * ## Each precondition reports its own reason, and none of them passes
 *
 * `not_a_web_project` means the gate does not apply — a CLI tool owes no browser evidence.
 * Everything else means the check was owed and did not happen, and
 * `browserGateBlocksVerification()` refuses a verified claim for all of them. The two states are
 * modelled separately because conflating them breaks the system in one direction or the other:
 * every non-web build blocked, or every unobserved web build called verified.
 */

import type { ProjectFile } from '../ai/patches.js';
import { executeSandboxed, probeSandbox } from '../sandbox/sandboxRuntime.js';
import { buildSandboxEnvironment } from '../sandbox/sandboxEnvironment.js';
import type { SandboxNetworkPolicy } from '../sandbox/sandboxTypes.js';
import type { ViewportEvidence } from './browserVerification.js';
import {
  DEFAULT_PORT,
  IMAGE_BROWSERS_PATH,
  PLAYWRIGHT_MODULE_ROOT,
  buildSandboxCommand,
  collectorFile,
  playwrightVersionFromImage,
  extractAppLog,
  parseCollectorOutput,
} from './inSandboxBrowser.js';
import {
  assessWebVerifiability,
  compileBrowserChecks,
  gateFromEvidence,
  notChecked,
  type CompiledBrowserChecks,
  type NotCheckedReason,
  type WebGateResult,
} from './webVerificationGate.js';

/**
 * Ceilings for the whole verification.
 *
 * Generous because a cold sandbox installs dependencies and builds before anything can be
 * observed, and stingy timeouts would report "the app did not start" for projects that were
 * merely slow — a false accusation against the generated code.
 */
const TOTAL_TIMEOUT_MS = 480_000;
const SERVER_TIMEOUT_MS = 120_000;

/** The one call into the sandbox, as a seam so the logic is testable without a real runtime. */
export type SandboxExecutor = (request: {
  files: readonly ProjectFile[];
  command: string;
  args: readonly string[];
  timeoutMs: number;
  networkPolicy: SandboxNetworkPolicy;
  environment: Record<string, string>;
  signal?: AbortSignal;
}) => Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }>;

/**
 * Whether the configured sandbox image can host a browser.
 *
 * This asks about the *image*, not this host. The browser runs inside the sandbox beside the
 * application, so Playwright on the API host is irrelevant — probing here for a local Chromium
 * would report `browser_unavailable` on every production deployment and short-circuit before the
 * sandbox ever ran, which is precisely the placeholder behaviour this change removes.
 *
 * It cannot be probed, only declared: the only way to learn whether an image carries a browser
 * is to run it, which is what the collector does. So an operator names a verification-capable
 * image, and until they do this reports honestly that no browser is available. Defaulting to
 * *true* here would be fabricating provider capability — the collector would then start a full
 * install and build before failing, and blame the generated application for the missing image.
 */
export function sandboxImageSupportsBrowser(env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const declared = env.XROGA_SANDBOX_BROWSER_IMAGE?.trim();
  return Promise.resolve(Boolean(declared));
}

/** The real executor: straight through the existing Command 1 boundary, widening nothing. */
const executeSandboxDefault: SandboxExecutor = async (request) => {
  const result = await executeSandboxed({
    files: [...request.files],
    command: request.command,
    args: [...request.args],
    timeoutMs: request.timeoutMs,
    networkPolicy: request.networkPolicy,
    environment: request.environment,
    // The verification-capable image, for this execution only. Ordinary validation stages keep
    // running in the small default image.
    ...(process.env.XROGA_SANDBOX_BROWSER_IMAGE?.trim()
      ? { image: process.env.XROGA_SANDBOX_BROWSER_IMAGE.trim() }
      : {}),
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut,
  };
};

export interface BrowserVerifyInput {
  readonly files: readonly ProjectFile[];
  readonly buildPassed: boolean;
  readonly testsPassed: boolean | null;
  readonly signal?: AbortSignal;
}

export interface BrowserVerificationAdapterOptions {
  readonly acceptanceCriteria?: readonly string[];
  /** Injected in tests. Defaults to the real sandbox probe. */
  readonly sandboxAvailable?: () => Promise<boolean>;
  /** Injected in tests. Defaults to the real Playwright probe. */
  readonly browserPresent?: () => Promise<boolean>;
  /** Injected in tests. Defaults to the real sandbox execution. */
  readonly execute?: SandboxExecutor;
  /**
   * The port the application is asked to listen on. Defaults to 3000.
   *
   * Overridden only where several verifications share a host — inside a sandbox nothing else is
   * listening, which is the property that makes the default safe.
   */
  readonly port?: number;
  /** Ceilings, overridable so tests need not wait out production-sized timeouts. */
  readonly totalTimeoutMs?: number;
  readonly serverTimeoutMs?: number;
}

/**
 * Builds the adapter canonical execution invokes.
 *
 * Preconditions are checked cheapest-first and each returns a distinct reason, because
 * "we have no sandbox" and "this is a CLI tool" call for completely different responses from
 * whoever reads the run — one is an infrastructure gap, the other is correct behaviour.
 */
export function browserVerificationAdapter(
  options: BrowserVerificationAdapterOptions = {},
): (input: BrowserVerifyInput) => Promise<WebGateResult> {
  const sandboxAvailable =
    options.sandboxAvailable ?? (async () => (await probeSandbox()).available);
  const browserPresent = options.browserPresent ?? sandboxImageSupportsBrowser;
  const executeInSandbox = options.execute ?? executeSandboxDefault;

  return async (input: BrowserVerifyInput): Promise<WebGateResult> => {
    const compiled = compileBrowserChecks(options.acceptanceCriteria ?? []);

    if (input.signal?.aborted) {
      return notChecked('cancelled', 'The run was cancelled before browser verification.', compiled.notChecked);
    }

    // 1. Is a browser even the right instrument? A CLI tool owes no browser evidence, and
    //    requiring it would block builds their own deterministic checks already validated.
    const verifiability = assessWebVerifiability(input.files);
    if (!verifiability.webVerifiable) {
      return notChecked('not_a_web_project', verifiability.reason, compiled.notChecked);
    }

    // 2. Does the project say how to serve itself? Inventing `npm start` here would blame the
    //    application for our guess when it fails.
    if (!verifiability.startScript) {
      return notChecked(
        'no_start_command',
        'This web project declares no script that serves it, so it could not be started for verification.',
        compiled.notChecked,
      );
    }

    // 3. Is there somewhere safe to run it? Generated code never executes on the API host.
    if (!(await sandboxAvailable())) {
      return notChecked(
        'sandbox_unavailable',
        'No isolation runtime is available, so the generated application was not started and the ' +
          'browser could not observe it. Verification is incomplete rather than passed.',
        compiled.notChecked,
      );
    }

    // 4. Can the sandbox image host a browser? Reported separately from the sandbox itself
    //    because the fix differs: one is a provider to configure, the other an image to deploy.
    if (!(await browserPresent())) {
      return notChecked(
        'browser_unavailable',
        'The configured sandbox image does not provide a browser (set XROGA_SANDBOX_BROWSER_IMAGE ' +
          'to a verification-capable image), so the running application was not observed.',
        compiled.notChecked,
      );
    }

    // 5. Every precondition is met: start the application inside the sandbox, drive a browser
    //    against it from inside that same sandbox, and judge what came back.
    return runInSandbox({
      files: input.files,
      startScript: verifiability.startScript,
      compiled,
      buildPassed: input.buildPassed,
      testsPassed: input.testsPassed,
      execute: executeInSandbox,
      port: options.port ?? DEFAULT_PORT,
      totalTimeoutMs: options.totalTimeoutMs ?? TOTAL_TIMEOUT_MS,
      serverTimeoutMs: options.serverTimeoutMs ?? SERVER_TIMEOUT_MS,
      signal: input.signal,
    });
  };
}

/** Whether the project declares anything to install. */
function declaresDependencies(files: readonly ProjectFile[]): boolean {
  const pkg = files.find((file) => file.path === 'package.json');
  if (!pkg) return false;
  try {
    const parsed = JSON.parse(pkg.content) as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    };
    return (
      Object.keys(parsed.dependencies ?? {}).length > 0 ||
      Object.keys(parsed.devDependencies ?? {}).length > 0
    );
  } catch {
    // An unparsable manifest is the project's problem to report elsewhere; installing is the
    // safer assumption, since the alternative is a missing-module error blamed on the app.
    return true;
  }
}

/**
 * The in-sandbox execution itself.
 *
 * Separated from the precondition checks so the interesting half can be tested against a fake
 * `execute` without a real sandbox, and so this function reads as what it is: materialize,
 * run one command, parse, judge.
 */
async function runInSandbox(input: {
  files: readonly ProjectFile[];
  startScript: string;
  compiled: CompiledBrowserChecks;
  buildPassed: boolean;
  testsPassed: boolean | null;
  execute: SandboxExecutor;
  port: number;
  totalTimeoutMs: number;
  serverTimeoutMs: number;
  signal?: AbortSignal;
}): Promise<WebGateResult> {
  const request = {
    startScript: input.startScript,
    domExpectations: input.compiled.domExpectations,
    interactions: input.compiled.interactions,
    totalTimeoutMs: input.totalTimeoutMs,
    serverTimeoutMs: input.serverTimeoutMs,
    // A project that declares no dependencies has nothing to install, and running `npm install`
    // anyway would demand registry access it does not need and fail closed without it.
    install: declaresDependencies(input.files),
    port: input.port,
    // Derived from the image reference, so the driver and the browser builds it drives are
    // decided by one string and cannot drift apart.
    playwrightVersion: playwrightVersionFromImage(process.env.XROGA_SANDBOX_BROWSER_IMAGE),
  };

  let result: { exitCode: number | null; stdout: string; stderr: string; timedOut: boolean };
  try {
    const { command, args } = buildSandboxCommand(request);
    result = await input.execute({
      // The collector travels with the project through the existing `files` mechanism. No new
      // transport into the sandbox is introduced.
      files: [...input.files, collectorFile(request)],
      command,
      args,
      timeoutMs: input.totalTimeoutMs,
      // Installing dependencies needs the registry and nothing more. This is the same policy
      // the existing install validation stage runs under, not a widening of it.
      networkPolicy: 'registry-only',
      environment: buildSandboxEnvironment({
        PORT: String(input.port),
        CI: '1',
        NODE_ENV: 'development',
        // The serve script the project declared. Passed in the environment rather than as a
        // positional parameter so it is never interpolated into the shell script body.
        XROGA_START_SCRIPT: input.startScript,
        // Where the run-time driver install lands, searched first by the collector.
        XROGA_PLAYWRIGHT_ROOT: PLAYWRIGHT_MODULE_ROOT,
        // The browser path the official image bakes in. Set explicitly because the sandbox
        // environment is built from scratch rather than inherited, so the image's own ENV is
        // not something to rely on.
        PLAYWRIGHT_BROWSERS_PATH: IMAGE_BROWSERS_PATH,
      }),
      signal: input.signal,
    });
  } catch (error) {
    // `SandboxUnavailableError` and anything else the runtime throws. A sandbox that refused is
    // a gap in evidence, never a pass.
    return notChecked(
      'sandbox_unavailable',
      `The isolation runtime did not run the verification: ${error instanceof Error ? error.message : String(error)}`,
      input.compiled.notChecked,
    );
  }

  if (input.signal?.aborted) {
    return notChecked('cancelled', 'The run was cancelled during browser verification.', input.compiled.notChecked);
  }

  const payload = parseCollectorOutput(result.stdout);
  const appLog = extractAppLog(result.stdout);

  if (!payload) {
    // No structured result at all — distinct from a result that says the check failed. Blaming
    // the generated application for our own harness failing to report would be a lie about
    // whose defect it is.
    const detail = result.timedOut
      ? 'Browser verification exceeded its time limit before producing a result.'
      : `The verification command produced no result (exit ${result.exitCode ?? 'unknown'}).`;
    return notChecked(
      'application_did_not_start',
      `${detail}${appLog ? ` Application log: ${appLog.slice(0, 800)}` : ''}`,
      input.compiled.notChecked,
    );
  }

  if (!payload.ok) {
    const reason: NotCheckedReason =
      payload.reason === 'browser_unavailable' ? 'browser_unavailable' : 'application_did_not_start';
    return notChecked(
      reason,
      `${payload.detail ?? 'Browser verification did not complete.'}${appLog ? ` Application log: ${appLog.slice(0, 800)}` : ''}`,
      input.compiled.notChecked,
    );
  }

  // The observations are in. Every judgement about what they mean happens here, on the host,
  // in the same `decideWebVerification` the unit tests cover — the collector decides nothing.
  return gateFromEvidence({
    url: payload.url ?? `http://127.0.0.1:${input.port}/`,
    filesProduced: input.files.length,
    buildPassed: input.buildPassed,
    testsPassed: input.testsPassed,
    serverStarted: true,
    serverLog: appLog,
    viewports: (payload.viewports ?? []) as ViewportEvidence[],
    criteriaNotChecked: input.compiled.notChecked,
  });
}
