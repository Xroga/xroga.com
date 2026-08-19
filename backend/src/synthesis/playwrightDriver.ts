/**
 * The real Playwright driver — the piece the previous slice left as a type.
 *
 * Given a URL that is already serving, this opens a browser, drives it, and returns the
 * observations `browserVerification.decideWebVerification` turns into a verdict. It makes no
 * verdict of its own: collection and judgement are separate so the judgement stays a pure
 * function of the observations, and so this file can be exercised against a real page without
 * dragging the decision rules along.
 *
 * ## Where this is expected to run
 *
 * In production the intended host is *inside* the isolation sandbox, alongside the application
 * under test, hitting `localhost`. That is not a stylistic preference — the Fly Machines
 * sandbox declares no `services` block and allocates no IP precisely so a generated application
 * is unreachable from anywhere for its entire life. Connecting to it from the API host would
 * mean exposing it, which trades a verified security property for a convenience.
 *
 * See `docs/production-browser-verification.md` for why that host does not exist yet.
 *
 * ## Failing to launch is not a passing page
 *
 * Every error path here returns observations that make the verdict fail, never observations
 * that happen to look clean. A driver that returns an empty error list when it could not start
 * would report a broken application as verified.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type {
  ConsoleMessage as VerificationConsoleMessage,
  DomCheck,
  InteractionCheck,
  NetworkFailure,
  PageError,
  ViewportEvidence,
} from './browserVerification.js';

/** A DOM assertion compiled from acceptance criteria. */
export interface DomExpectation {
  readonly description: string;
  /** CSS selector that must match at least one element. */
  readonly selector?: string;
  /** Text that must appear in the rendered page. */
  readonly text?: string;
}

/** An interaction compiled from acceptance criteria. */
export interface InteractionExpectation {
  readonly description: string;
  readonly clickSelector: string;
  /** What must become true afterwards. */
  readonly expectSelector?: string;
  readonly expectText?: string;
}

export interface ViewportSpec {
  readonly viewport: 'desktop' | 'mobile';
  readonly width: number;
  readonly height: number;
}

export const DESKTOP_VIEWPORT: ViewportSpec = { viewport: 'desktop', width: 1280, height: 800 };
export const MOBILE_VIEWPORT: ViewportSpec = { viewport: 'mobile', width: 390, height: 844 };

export interface PlaywrightRunOptions {
  readonly url: string;
  readonly viewports: readonly ViewportSpec[];
  readonly domExpectations?: readonly DomExpectation[];
  readonly interactions?: readonly InteractionExpectation[];
  readonly navigationTimeoutMs?: number;
  readonly screenshotDir?: string | null;
  readonly signal?: AbortSignal;
}

/** Bounds, so a chatty page cannot fill the run record. */
const MAX_CONSOLE_MESSAGES = 40;
const MAX_PAGE_ERRORS = 20;
const MAX_NETWORK_FAILURES = 20;
const MAX_TEXT = 2_000;

function clip(text: string, max = MAX_TEXT): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * The Playwright module, loaded lazily.
 *
 * `@playwright/test` is a devDependency and the browser binaries may be absent. Importing it at
 * module load would make this file unimportable wherever they are — including production, where
 * everything else in the verification chain still needs to be constructible in order to report
 * honestly that the check could not run.
 */
async function loadChromium(): Promise<{
  launch: (options: Record<string, unknown>) => Promise<PlaywrightBrowser>;
} | null> {
  try {
    const mod = (await import('playwright')) as unknown as {
      chromium?: { launch: (options: Record<string, unknown>) => Promise<PlaywrightBrowser> };
    };
    return mod.chromium ?? null;
  } catch {
    try {
      const mod = (await import('@playwright/test')) as unknown as {
        chromium?: { launch: (options: Record<string, unknown>) => Promise<PlaywrightBrowser> };
      };
      return mod.chromium ?? null;
    } catch {
      return null;
    }
  }
}

// Minimal structural types. Depending on Playwright's own types would make this module fail to
// compile wherever the package is absent, which is the situation it exists to handle.
interface PlaywrightPage {
  goto(url: string, options?: Record<string, unknown>): Promise<{ status(): number } | null>;
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  on(event: string, handler: (payload: never) => void): void;
  content(): Promise<string>;
  locator(selector: string): { count(): Promise<number>; first(): { click(options?: Record<string, unknown>): Promise<void> } };
  screenshot(options: Record<string, unknown>): Promise<Buffer>;
  waitForTimeout(ms: number): Promise<void>;
  close(): Promise<void>;
}
interface PlaywrightContext {
  newPage(): Promise<PlaywrightPage>;
  close(): Promise<void>;
}
interface PlaywrightBrowser {
  newContext(options?: Record<string, unknown>): Promise<PlaywrightContext>;
  close(): Promise<void>;
}

export class BrowserUnavailableError extends Error {
  readonly code = 'BROWSER_UNAVAILABLE' as const;
  constructor(message: string) {
    super(message);
    this.name = 'BrowserUnavailableError';
  }
}

/**
 * Finds a Chromium the installed Playwright can actually launch.
 *
 * The package and the installed browser revision can disagree — an image ships
 * `chromium-1194` while the resolved package expects `chromium-1234` — and Playwright's default
 * resolution then fails with "Executable doesn't exist". Downloading is not an option here: it
 * is blocked in a sealed environment and wrong in production.
 *
 * So the browsers directory is searched for any Chromium build. An explicit
 * `PLAYWRIGHT_CHROMIUM_EXECUTABLE` still wins, because an operator naming a specific binary
 * should not be overridden by a guess.
 */
function discoverChromiumExecutable(): string | null {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?.trim();
  if (explicit) return explicit;

  const root = process.env.PLAYWRIGHT_BROWSERS_PATH?.trim();
  if (!root) return null;
  try {
    const candidates = readdirSync(root)
      .filter((entry) => entry.startsWith('chromium-'))
      // Highest revision first: the newest build is the likeliest match for a modern package.
      .sort((a, b) => Number(b.split('-')[1] ?? 0) - Number(a.split('-')[1] ?? 0));
    for (const candidate of candidates) {
      for (const relative of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
        const path = join(root, candidate, relative);
        if (existsSync(path)) return path;
      }
    }
  } catch {
    return null;
  }
  return null;
}

let availabilityCache: boolean | null = null;

/**
 * Whether a browser can actually be launched — not merely whether the package imports.
 *
 * The distinction matters: a present package with a missing binary reports "available" and then
 * fails at launch, which turns an integration test's skip guard into a false green. This
 * attempts a real launch once and caches the answer.
 */
export async function browserAvailable(): Promise<boolean> {
  if (availabilityCache !== null) return availabilityCache;
  const chromium = await loadChromium();
  if (!chromium) {
    availabilityCache = false;
    return false;
  }
  const executable = discoverChromiumExecutable();
  try {
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
      ...(executable ? { executablePath: executable } : {}),
    });
    await browser.close().catch(() => {});
    availabilityCache = true;
  } catch {
    availabilityCache = false;
  }
  return availabilityCache;
}

/**
 * Drives one viewport and returns what it observed.
 *
 * Listeners are attached *before* navigation, because an error thrown during load is the most
 * common real failure and attaching afterwards misses exactly that case.
 */
async function runViewport(
  browser: PlaywrightBrowser,
  spec: ViewportSpec,
  options: PlaywrightRunOptions,
): Promise<ViewportEvidence> {
  const pageErrors: PageError[] = [];
  const consoleMessages: VerificationConsoleMessage[] = [];
  const networkFailures: NetworkFailure[] = [];
  const domChecks: DomCheck[] = [];
  const interactions: InteractionCheck[] = [];
  let httpStatus: number | null = null;
  let screenshotPath: string | null = null;

  const context = await browser.newContext({
    viewport: { width: spec.width, height: spec.height },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  try {
    page.on('pageerror', (error: never) => {
      const err = error as unknown as { message?: string; stack?: string };
      if (pageErrors.length < MAX_PAGE_ERRORS) {
        pageErrors.push({ message: clip(String(err?.message ?? error)), stack: clip(String(err?.stack ?? '')) });
      }
    });
    page.on('crash', () => {
      pageErrors.push({ message: 'The page crashed.' });
    });
    page.on('console', (message: never) => {
      const msg = message as unknown as { type(): string; text(): string };
      if (consoleMessages.length >= MAX_CONSOLE_MESSAGES) return;
      const type = msg.type();
      const level = type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'info';
      consoleMessages.push({ level, text: clip(msg.text(), 500) });
    });
    page.on('requestfailed', (request: never) => {
      const req = request as unknown as { url(): string; failure(): { errorText: string } | null };
      if (networkFailures.length >= MAX_NETWORK_FAILURES) return;
      networkFailures.push({ url: clip(req.url(), 300), failure: req.failure()?.errorText });
    });
    page.on('response', (response: never) => {
      const res = response as unknown as { url(): string; status(): number };
      if (res.status() >= 400 && networkFailures.length < MAX_NETWORK_FAILURES) {
        networkFailures.push({ url: clip(res.url(), 300), status: res.status() });
      }
    });

    const response = await page.goto(options.url, {
      waitUntil: 'domcontentloaded',
      timeout: options.navigationTimeoutMs ?? 20_000,
    });
    httpStatus = response ? response.status() : null;

    // A short settle so client-side errors thrown after load are observed. Deliberately a
    // fixed small wait rather than networkidle: an app with polling never reaches networkidle
    // and would time out, reporting a working page as broken.
    await page.waitForTimeout(600);

    const html = await page.content();
    for (const expectation of options.domExpectations ?? []) {
      if (expectation.selector) {
        const count = await page.locator(expectation.selector).count();
        domChecks.push({
          description: expectation.description,
          selector: expectation.selector,
          satisfied: count > 0,
          detail: count > 0 ? `${count} match(es)` : `selector ${expectation.selector} matched nothing`,
        });
      } else if (expectation.text) {
        const satisfied = html.includes(expectation.text);
        domChecks.push({
          description: expectation.description,
          satisfied,
          detail: satisfied ? 'text present' : `text "${clip(expectation.text, 120)}" not found in the rendered page`,
        });
      }
    }

    for (const interaction of options.interactions ?? []) {
      try {
        await page.locator(interaction.clickSelector).first().click({ timeout: 5_000 });
        await page.waitForTimeout(300);
        let satisfied = true;
        let detail = 'interaction completed';
        if (interaction.expectSelector) {
          satisfied = (await page.locator(interaction.expectSelector).count()) > 0;
          detail = satisfied ? 'expected element appeared' : `${interaction.expectSelector} did not appear`;
        } else if (interaction.expectText) {
          const after = await page.content();
          satisfied = after.includes(interaction.expectText);
          detail = satisfied ? 'expected text appeared' : `"${clip(interaction.expectText, 120)}" did not appear`;
        }
        interactions.push({ description: interaction.description, satisfied, detail });
      } catch (error) {
        interactions.push({
          description: interaction.description,
          satisfied: false,
          detail: clip(error instanceof Error ? error.message : String(error), 300),
        });
      }
    }

    if (options.screenshotDir) {
      try {
        const path = `${options.screenshotDir}/${spec.viewport}.png`;
        await page.screenshot({ path, fullPage: false });
        screenshotPath = path;
      } catch {
        // A screenshot that cannot be written is not a verification failure — it is evidence
        // for a human that happens to be missing. The machine-checkable rungs still decide.
        screenshotPath = null;
      }
    }
  } catch (error) {
    // Navigation or setup failed. Recorded as a page error so the verdict fails: an empty
    // observation set here would read as a clean page.
    pageErrors.push({
      message: clip(`Navigation failed: ${error instanceof Error ? error.message : String(error)}`),
      url: options.url,
    });
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }

  return {
    viewport: spec.viewport,
    httpStatus,
    pageErrors,
    consoleMessages,
    networkFailures,
    domChecks,
    interactions,
    screenshotPath,
  };
}

/**
 * Runs every requested viewport against a URL that is already serving.
 *
 * The browser is closed in a `finally`, including on cancellation, so a verification that is
 * abandoned mid-run does not leave a Chromium process behind.
 */
export async function runPlaywrightVerification(
  options: PlaywrightRunOptions,
): Promise<readonly ViewportEvidence[]> {
  const chromium = await loadChromium();
  if (!chromium) {
    throw new BrowserUnavailableError(
      'No Playwright browser is available in this environment, so the page was not opened.',
    );
  }

  // The resolved Playwright package and the installed browser revision can disagree — the
  // package expects the build it shipped with, and an image may carry a different one. Rather
  // than download (which is blocked in a sealed environment, and wrong in production), fall
  // back to an explicitly provided executable. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` is the seam;
  // when it is unset the default launch is used and its error is reported as-is.
  const explicitExecutable = discoverChromiumExecutable();
  const launchOptions: Record<string, unknown> = {
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    ...(explicitExecutable ? { executablePath: explicitExecutable } : {}),
  };
  let browser: PlaywrightBrowser;
  try {
    browser = await chromium.launch(launchOptions);
  } catch (error) {
    throw new BrowserUnavailableError(
      `Playwright could not launch a browser, so the page was not opened: ${
        error instanceof Error ? error.message.split('\n')[0] : String(error)
      }`,
    );
  }
  const evidence: ViewportEvidence[] = [];
  try {
    for (const spec of options.viewports) {
      if (options.signal?.aborted) break;
      evidence.push(await runViewport(browser, spec, options));
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return evidence;
}
