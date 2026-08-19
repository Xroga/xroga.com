/**
 * Running the application and the browser inside one sandbox execution.
 *
 * ## Why it has to be one command
 *
 * `SandboxRuntime.execute()` is one-shot: it runs a command to completion and returns
 * stdout/stderr. There is no long-lived process handle and no port mapping. The obvious
 * alternative — hold a dev server open in the sandbox and connect a browser to it from the API
 * host — would require exposing the sandbox, and the Fly Machines provider deliberately declares
 * no `services` block and allocates no IP precisely so a generated application is unreachable
 * from anywhere for its entire life. Trading that tested isolation property for convenience is
 * not a trade worth making.
 *
 * So the browser goes to the application instead. One command starts the server, waits for
 * `localhost`, drives Chromium against it from inside the same isolated environment, prints a
 * bounded JSON result, and exits. Nothing is exposed, no IP is allocated, and the existing
 * one-shot contract is satisfied exactly as written.
 *
 * ## Where the judgement lives
 *
 * This module builds an *evidence collector*, not a second verification system. The script it
 * generates observes and reports: HTTP status, page errors, console messages, network failures,
 * DOM checks, interactions. Every decision about what those observations mean stays in
 * `browserVerification.ts`, on the host, single-sourced. That split is deliberate — the collector
 * has to be standalone JavaScript to run inside the image, and duplicating the *rules* there is
 * how two verification systems start disagreeing about what "verified" means.
 *
 * ## Cleanup is a correctness property
 *
 * The application must die with the command on every path — success, verification failure,
 * startup failure, timeout, cancellation, exception. A `trap` covers the signals and the exit;
 * the sandbox teardown covers what a trap cannot. A leaked dev server inside a disposable
 * microVM is bounded by the machine's own destruction, but a leaked one inside a *container*
 * provider would outlive the run, so the trap is not optional.
 */

import type { ProjectFile } from '../ai/patches.js';
import type { DomExpectation, InteractionExpectation } from './playwrightDriver.js';

/** The delimiters the host parses. Chosen to be things no build tool prints. */
export const RESULT_BEGIN = '<<<XROGA_BROWSER_RESULT';
export const RESULT_END = 'XROGA_BROWSER_RESULT>>>';

/** Where the collector is written inside the sandbox workspace. */
export const COLLECTOR_PATH = '.xroga-verify/collect.mjs';

/**
 * Ports we wait on, in order of likelihood.
 *
 * `PORT` is exported for the frameworks that honour it, but several do not — Vite defaults to
 * 5173 and ignores `PORT` unless configured, Astro uses 4321. Waiting on a small set of known
 * defaults is not guessing at a *command*: the command comes from the project's own manifest.
 * It is observing where the thing it started actually landed, which is the only honest way to
 * find out without editing the generated project's configuration behind its back.
 */
export const DEFAULT_PORT = 3000;
export const CANDIDATE_PORTS = [3000, 5173, 4321, 8080, 4200, 5000] as const;

export interface InSandboxBrowserRequest {
  readonly startScript: string;
  readonly domExpectations: readonly DomExpectation[];
  readonly interactions: readonly InteractionExpectation[];
  /** Hard ceiling for the whole command, including install and build. */
  readonly totalTimeoutMs: number;
  /** How long to wait for the server to answer on one of the candidate ports. */
  readonly serverTimeoutMs: number;
  /** Whether to install dependencies first. A fresh sandbox has no node_modules. */
  readonly install: boolean;
  /**
   * The port to prefer, exported as `PORT` and waited on first.
   *
   * Configurable because "wait for whatever answers on 3000" is only safe inside an isolated
   * sandbox, where nothing else can be listening. On a shared host — which is where this gets
   * tested — a stale server from an earlier run answers first and the browser then verifies an
   * application that is not the one under test. That is a wrong *pass*, the worst failure this
   * subsystem can have, so the port is named rather than assumed.
   */
  readonly port?: number;
}

/**
 * The collector, as standalone ESM.
 *
 * Written as a string rather than a checked-in `.mjs` because it has to be materialized into the
 * sandbox through the existing `files` mechanism, which takes file contents. Keeping it here
 * means it travels with the code that parses its output, so the two cannot drift apart in
 * separate files that nobody reads together.
 *
 * It never throws its way out: every failure path prints a structured result, because a crash
 * would surface as an empty stdout that the host cannot distinguish from "the page was fine".
 */
export function collectorSource(request: InSandboxBrowserRequest): string {
  // The requested port is tried first, then the framework defaults for the tools that ignore
  // `PORT`. Deduplicated so the preferred port is not polled twice per cycle.
  const ports = [...new Set([request.port ?? DEFAULT_PORT, ...CANDIDATE_PORTS])];

  const config = JSON.stringify({
    domExpectations: request.domExpectations,
    interactions: request.interactions,
    ports,
    serverTimeoutMs: request.serverTimeoutMs,
    begin: RESULT_BEGIN,
    end: RESULT_END,
  });

  return `// Generated by inSandboxBrowser.ts. Runs inside the sandbox, beside the application.
const CONFIG = ${config};

const MAX_CONSOLE = 40;
const MAX_PAGE_ERRORS = 20;
const MAX_NETWORK = 20;
const MAX_TEXT = 2000;
const clip = (t) => (typeof t === 'string' && t.length > MAX_TEXT ? t.slice(0, MAX_TEXT) + '…' : t);

function emit(payload) {
  process.stdout.write('\\n' + CONFIG.begin + JSON.stringify(payload) + CONFIG.end + '\\n');
}

/** Global install roots. The official Playwright image installs the package globally. */
const MODULE_ROOTS = [
  process.env.XROGA_PLAYWRIGHT_ROOT,
  '/usr/lib/node_modules',
  '/usr/local/lib/node_modules',
  '/usr/local/share/npm-global/lib/node_modules',
].filter(Boolean);

async function loadChromium() {
  const names = ['playwright', 'playwright-core'];

  // A bare specifier resolves by walking *up* from the script, so it finds a project-local
  // install and nothing else. The official Playwright image installs the package **globally**,
  // which is not on that path at all — so a bare import alone would report "no browser" inside
  // the very image built to provide one. The global roots are searched explicitly, and
  // require.resolve is used rather than guessing at filenames, because the package entry
  // point is the package's business, not ours.
  for (const name of names) {
    try {
      const mod = await import(name);
      const chromium = mod.chromium || (mod.default && mod.default.chromium);
      if (chromium) return chromium;
    } catch {}
  }

  try {
    const { createRequire } = await import('node:module');
    const { pathToFileURL } = await import('node:url');
    const require = createRequire(import.meta.url);
    for (const name of names) {
      try {
        const resolved = require.resolve(name, { paths: MODULE_ROOTS });
        // The global package may be CommonJS, in which case the namespace carries it on
        // "default". Both shapes are accepted rather than assuming one.
        const mod = await import(pathToFileURL(resolved).href);
        const chromium = mod.chromium || (mod.default && mod.default.chromium);
        if (chromium) return chromium;
      } catch {}
    }
  } catch {}

  return null;
}

/**
 * The browser binary, when the package's own default would miss it.
 *
 * A Playwright package resolves browsers by an exact revision it was built against. An image
 * that installed browsers separately can hold a different revision, and the launch then fails
 * with "Executable doesn't exist" even though a perfectly good Chromium is sitting on disk.
 * Returning null means "let Playwright decide", which is right when the image is self-consistent.
 */
async function discoverExecutable() {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (explicit) return explicit;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root) return null;
  try {
    const { readdirSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const candidates = readdirSync(root)
      .filter((entry) => entry.startsWith('chromium-'))
      .sort((a, b) => Number(b.split('-')[1] || 0) - Number(a.split('-')[1] || 0));
    for (const candidate of candidates) {
      for (const relative of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
        const path = join(root, candidate, relative);
        if (existsSync(path)) return path;
      }
    }
  } catch {}
  return null;
}

/** Waits until one of the candidate ports answers, or the deadline passes. */
async function waitForServer() {
  const deadline = Date.now() + CONFIG.serverTimeoutMs;
  let lastError = '';
  while (Date.now() < deadline) {
    for (const port of CONFIG.ports) {
      const url = 'http://127.0.0.1:' + port + '/';
      try {
        const response = await fetch(url, { redirect: 'manual' });
        // Any HTTP answer means something is listening. Whether the status is acceptable is
        // the host's decision, not this script's.
        if (response.status > 0) return { url, port };
      } catch (error) {
        lastError = String((error && error.message) || error);
      }
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return { url: null, port: null, lastError };
}

async function observe(browser, url, spec) {
  const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height } });
  const page = await context.newPage();

  const pageErrors = [];
  const consoleMessages = [];
  const networkFailures = [];

  // Listeners attached before navigation: an error thrown during load is the single most
  // important thing to catch, and it fires before any post-goto handler could exist.
  page.on('pageerror', (error) => {
    if (pageErrors.length < MAX_PAGE_ERRORS) {
      pageErrors.push({ message: clip(String(error && error.message || error)), stack: clip(String(error && error.stack || '')) });
    }
  });
  page.on('console', (message) => {
    if (consoleMessages.length < MAX_CONSOLE) {
      consoleMessages.push({ level: message.type(), text: clip(message.text()) });
    }
  });
  page.on('requestfailed', (request) => {
    if (networkFailures.length < MAX_NETWORK) {
      const failure = request.failure();
      networkFailures.push({ url: clip(request.url()), error: clip(String((failure && failure.errorText) || 'request failed')) });
    }
  });

  let httpStatus = null;
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    httpStatus = response ? response.status() : null;
  } catch (error) {
    // A navigation failure has to become a *finding*, not an empty observation set — an empty
    // set reads as a clean page, which is the opposite of what happened.
    pageErrors.push({ message: clip('navigation failed: ' + String((error && error.message) || error)), stack: '' });
  }

  // Let client-rendered content settle. Bounded, and never a substitute for an assertion.
  await page.waitForTimeout(1200);

  const domChecks = [];
  for (const expectation of CONFIG.domExpectations) {
    try {
      if (expectation.selector) {
        const count = await page.locator(expectation.selector).count();
        domChecks.push({
          description: expectation.description,
          selector: expectation.selector,
          satisfied: count > 0,
          detail: count > 0 ? undefined : 'selector ' + expectation.selector + ' matched nothing',
        });
      } else if (expectation.text) {
        const body = await page.textContent('body').catch(() => '');
        const satisfied = typeof body === 'string' && body.includes(expectation.text);
        domChecks.push({
          description: expectation.description,
          text: expectation.text,
          satisfied,
          detail: satisfied ? undefined : 'text "' + expectation.text + '" was not present on the page',
        });
      }
    } catch (error) {
      domChecks.push({ description: expectation.description, satisfied: false, detail: clip(String((error && error.message) || error)) });
    }
  }

  const interactions = [];
  for (const interaction of CONFIG.interactions) {
    try {
      await page.click(interaction.clickSelector, { timeout: 5000 });
      await page.waitForTimeout(500);
      const body = await page.textContent('body').catch(() => '');
      const satisfied = typeof body === 'string' && body.includes(interaction.expectText);
      interactions.push({
        description: interaction.description,
        satisfied,
        detail: satisfied ? undefined : 'after clicking ' + interaction.clickSelector + ', "' + interaction.expectText + '" did not appear',
      });
    } catch (error) {
      interactions.push({ description: interaction.description, satisfied: false, detail: clip(String((error && error.message) || error)) });
    }
  }

  await context.close().catch(() => {});
  return {
    viewport: spec.viewport,
    httpStatus,
    pageErrors,
    consoleMessages,
    networkFailures,
    domChecks,
    interactions,
    screenshotPath: null,
  };
}

async function main() {
  const chromium = await loadChromium();
  if (!chromium) {
    emit({ ok: false, reason: 'browser_unavailable', detail: 'Playwright is not resolvable inside the sandbox image.' });
    return;
  }

  const found = await waitForServer();
  if (!found.url) {
    emit({ ok: false, reason: 'application_did_not_start', detail: clip('No candidate port answered within the timeout. ' + (found.lastError || '')) });
    return;
  }

  let browser = null;
  try {
    const executablePath = await discoverExecutable();
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
      ...(executablePath ? { executablePath } : {}),
    });
    const viewports = [];
    for (const spec of [
      { viewport: 'desktop', width: 1280, height: 800 },
      { viewport: 'mobile', width: 390, height: 844 },
    ]) {
      viewports.push(await observe(browser, found.url, spec));
    }
    emit({ ok: true, url: found.url, viewports });
  } catch (error) {
    emit({ ok: false, reason: 'application_did_not_start', detail: clip('browser execution failed: ' + String((error && error.message) || error)) });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  emit({ ok: false, reason: 'application_did_not_start', detail: 'collector crashed: ' + String((error && error.message) || error) });
});
`;
}

/**
 * The shell command run inside the sandbox.
 *
 * Passed to `sh -c` with the start script as a *positional parameter*, never interpolated into
 * the script body. The script name comes from a generated `package.json`, so interpolating it
 * would let a name containing a backtick or a semicolon run arbitrary commands inside the
 * sandbox — the same injection class the Fly provider's `exec` builder already avoids.
 *
 * The trap is what guarantees the dev server dies. `kill 0` signals the whole process group, so
 * a start script that spawns its own children (every framework CLI does) does not leave them
 * behind when the parent is killed.
 */
export function buildSandboxCommand(request: InSandboxBrowserRequest): { command: string; args: string[] } {
  const installStep = request.install
    ? 'npm install --no-audit --no-fund --ignore-scripts >/tmp/xroga_install_$$.log 2>&1 || { echo "install failed"; tail -c 4000 /tmp/xroga_install_$$.log; exit 90; }\n'
    : '';

  const script =
    'set -u\n' +
    // Per-run paths. `/tmp/app.log` was shared across runs on a host that runs more than one,
    // so a stale log from an earlier run was reported as this run's startup failure.
    'APP_LOG=/tmp/xroga_app_$$.log\n' +
    'PID_FILE=/tmp/xroga_app_$$.pid\n' +
    // `${VAR:-}` rather than `$VAR`: under `set -u` an unset variable aborts the whole script,
    // and `XROGA_SANDBOX_WORKDIR` is set by only some providers. Without the default this dies
    // on line two and reports as "the application did not start" — blaming generated code for
    // a defect in this script.
    'cd /work 2>/dev/null || cd "${XROGA_SANDBOX_WORKDIR:-.}" 2>/dev/null || true\n' +
    // Cleanup on every exit path, including the signals a timeout kill sends.
    //
    // The group id is read from a file the child writes, not from `$!`. `setsid` forks when it
    // is already a process group leader, so `$!` can be a short-lived parent whose pid names no
    // surviving group — `kill -$!` then silently kills nothing and the dev server outlives the
    // run. That is not hypothetical: it happened here, and the leaked server went on to answer
    // a later verification, which would have meant a browser passing an application that was
    // never the one under test. The child reports its own pid, so there is nothing to infer.
    'cleanup() { if [ -f "$PID_FILE" ]; then APP_PGID=$(cat "$PID_FILE" 2>/dev/null || echo ""); if [ -n "$APP_PGID" ]; then kill -TERM "-$APP_PGID" 2>/dev/null || kill -TERM "$APP_PGID" 2>/dev/null || true; sleep 1; kill -KILL "-$APP_PGID" 2>/dev/null || kill -KILL "$APP_PGID" 2>/dev/null || true; fi; fi; rm -f "$PID_FILE" "$APP_LOG"; }\n' +
    'trap cleanup EXIT INT TERM HUP\n' +
    installStep +
    // `exec` so the recorded pid *is* the server's process group leader, with no wrapper shell
    // left between the group and the process that must die.
    'setsid /bin/sh -c \'echo $$ > "$1"; exec npm run "$0"\' "$XROGA_START_SCRIPT" "$PID_FILE" >"$APP_LOG" 2>&1 &\n' +
    // The pid file is written by the child, so give it a moment to appear before the collector
    // starts waiting on the port.
    'for _ in 1 2 3 4 5 6 7 8 9 10; do [ -f "$PID_FILE" ] && break; sleep 0.2; done\n' +
    'node ' + COLLECTOR_PATH + '\n' +
    'STATUS=$?\n' +
    // The server log is the evidence for "it never started", so it always travels back.
    'echo "---XROGA_APP_LOG---"; tail -c 4000 "$APP_LOG" 2>/dev/null || true\n' +
    'exit $STATUS\n';

  // The start script travels in the environment, not as a positional parameter: with
  // `sh -c SCRIPT arg`, `arg` becomes `$0`, not `$1`. Reading it as `$1` silently ran
  // `npm run ""`, and the only reason an earlier run looked healthy was a *different* server
  // answering the port. It is still never interpolated into the script body, so a script name
  // containing a backtick or a semicolon remains inert.
  return { command: '/bin/sh', args: ['-c', script] };
}

/** The collector as a project file, materialized through the existing `files` mechanism. */
export function collectorFile(request: InSandboxBrowserRequest): ProjectFile {
  return { path: COLLECTOR_PATH, content: collectorSource(request) };
}

// ---------------------------------------------------------------------------
// Parsing what came back
// ---------------------------------------------------------------------------

export interface CollectorPayload {
  readonly ok: boolean;
  readonly url?: string;
  readonly reason?: string;
  readonly detail?: string;
  readonly viewports?: readonly unknown[];
}

/**
 * Extracts the structured result from the command's stdout.
 *
 * Returns null when no result was printed at all — which is a distinct fact from a result saying
 * the check failed, and the caller must not conflate them. Build tools print freely to stdout, so
 * the payload is located by its delimiters rather than by assuming it is the whole output.
 */
export function parseCollectorOutput(stdout: string): CollectorPayload | null {
  const start = stdout.lastIndexOf(RESULT_BEGIN);
  if (start === -1) return null;
  const from = start + RESULT_BEGIN.length;
  const end = stdout.indexOf(RESULT_END, from);
  if (end === -1) return null;
  try {
    return JSON.parse(stdout.slice(from, end)) as CollectorPayload;
  } catch {
    return null;
  }
}

/** The tail of the application's own log, for the "it never started" case. */
export function extractAppLog(stdout: string): string {
  const marker = '---XROGA_APP_LOG---';
  const index = stdout.lastIndexOf(marker);
  return index === -1 ? '' : stdout.slice(index + marker.length).trim().slice(0, 4_000);
}
