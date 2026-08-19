/**
 * The production browser-verification adapter — the real caller.
 *
 * `browserVerification.ts` having tests proved nothing about whether production ever looked at
 * a page. This is the function `productionAdapters` hands to canonical execution, so the
 * universal path now genuinely asks "does this application work in a browser?" on every web
 * build.
 *
 * ## What it does today, stated plainly
 *
 * It evaluates every precondition and, when they are met, drives a real browser. When they are
 * not, it returns `not_checked` carrying the specific reason — which contributes nothing to
 * `verified` and is surfaced to the user.
 *
 * On the current production deployment the precondition that fails is the sandbox. Three facts
 * combine:
 *
 *   - `selectSandboxProvider()` reports `runtime_unavailable` unless an operator configures a
 *     provider; `fly.api.toml` configures none.
 *   - The Fly Machines provider declares no `services` block and allocates no IP, so a
 *     generated application is unreachable from anywhere for its entire life — a deliberate,
 *     tested isolation property. A browser on the API host cannot reach it.
 *   - `SandboxRuntime.execute()` is one-shot: it runs a command to completion. There is no
 *     long-lived process handle to hold a dev server open against.
 *
 * The consequence is that a browser must eventually run *inside* the sandbox next to the
 * application, hitting `localhost`. That needs a sandbox image carrying a browser; the current
 * one is `node:20-alpine`, which has none. Until that exists this adapter reports
 * `sandbox_unavailable` — honestly, on every web build — rather than quietly passing.
 *
 * That is the difference between "not wired" and "wired and truthful about what it can see".
 */

import type { ProjectFile } from '../ai/patches.js';
import { probeSandbox } from '../sandbox/sandboxRuntime.js';
import { browserAvailable } from './playwrightDriver.js';
import {
  assessWebVerifiability,
  compileBrowserChecks,
  notChecked,
  type WebGateResult,
} from './webVerificationGate.js';

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
  const browserPresent = options.browserPresent ?? browserAvailable;

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

    // 4. Is there a browser? Reported separately from the sandbox because the fix differs: one
    //    is a provider to configure, the other is an image to build.
    if (!(await browserPresent())) {
      return notChecked(
        'browser_unavailable',
        'No browser is available in the execution environment, so the running application was not observed.',
        compiled.notChecked,
      );
    }

    // 5. Every precondition met. Starting the application inside the sandbox and driving a
    //    browser against it from inside that same sandbox is the remaining work — see
    //    `docs/production-browser-verification.md`. Reaching this branch on a deployment whose
    //    sandbox cannot host a browser would be a misconfiguration, and it reports as one
    //    rather than silently passing.
    return notChecked(
      'application_did_not_start',
      'The isolation runtime reports availability but cannot yet host a browser alongside the ' +
        'generated application, so no browser evidence was collected.',
      compiled.notChecked,
    );
  };
}
