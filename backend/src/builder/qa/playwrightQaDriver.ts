import { discoverChromiumExecutable, loadChromium } from '../../synthesis/playwrightDriver.js';
import { containsCredentialSecretText } from '../../security/egress/dataClassification.js';
import type { QaDriver, QaPage, QaViewport } from './types.js';

/**
 * QaDriver over the existing Playwright integration (same lazy loader and Chromium discovery as the
 * existing browser verification). No second browser stack is introduced.
 *
 * Network is locked to the application's own origin: the page under test is untrusted generated
 * code running in a browser on Xroga's side, so it must not be able to reach other hosts, internal
 * addresses or metadata services. Blocked requests are recorded as failed requests, not hidden.
 */

interface PwLocator {
  first(): PwLocator;
  click(options?: Record<string, unknown>): Promise<void>;
  fill(value: string, options?: Record<string, unknown>): Promise<void>;
  isVisible(): Promise<boolean>;
}
interface PwRequest { url(): string; method(): string; resourceType(): string; failure(): { errorText: string } | null }
interface PwRouteResponse { body(): Promise<Buffer>; headers(): Record<string, string>; dispose(): Promise<void> }
interface PwRoute {
  request(): PwRequest;
  abort(): Promise<void>;
  continue(): Promise<void>;
  fetch(options: { maxRedirects: number; maxRetries: number; timeout: number }): Promise<PwRouteResponse>;
  fulfill(options: { response: PwRouteResponse; body: Buffer; headers: Record<string, string> }): Promise<void>;
}
interface PwResponse { status(): number; url(): string }
interface PwPage {
  goto(url: string, options?: Record<string, unknown>): Promise<PwResponse | null>;
  reload(options?: Record<string, unknown>): Promise<unknown>;
  url(): string;
  locator(selector: string): PwLocator;
  /** Browser-side code is passed as source text: the backend compiles without the DOM library. */
  evaluate<T>(expression: string): Promise<T>;
  screenshot(options: Record<string, unknown>): Promise<Buffer>;
  waitForTimeout(ms: number): Promise<void>;
  waitForLoadState(state: string, options?: Record<string, unknown>): Promise<void>;
  on(event: string, handler: (payload: never) => void): void;
  close(): Promise<void>;
}
interface PwContext {
  newPage(): Promise<PwPage>;
  route(pattern: string, handler: (route: PwRoute) => unknown): Promise<void>;
  routeWebSocket(pattern: string, handler: (socket: { close(options: { code: number; reason: string }): void }) => void): Promise<void>;
  close(): Promise<void>;
}
interface PwBrowser {
  version(): string;
  newContext(options?: Record<string, unknown>): Promise<PwContext>;
  close(): Promise<void>;
}

const VIEWPORTS: Record<QaViewport, { width: number; height: number; isMobile: boolean }> = {
  desktop: { width: 1280, height: 800, isMobile: false },
  mobile: { width: 390, height: 844, isMobile: true },
};

const STEP_TIMEOUT_MS = 8_000;
const NAVIGATION_TIMEOUT_MS = 20_000;

export class QaBrowserUnavailable extends Error {
  readonly code = 'BROWSER_UNAVAILABLE' as const;
}

export interface PlaywrightQaOptions {
  /** Remote deployed QA is read-only. Local synthetic form fixtures retain their explicit mutation checks. */
  readonly readOnly?: boolean;
  /** Origin of the running application, e.g. the signed preview origin. Only this origin is reachable. */
  readonly baseUrl: string;
  /** Headers sent with every request to the application origin only (never to other hosts). */
  readonly extraHeaders?: Readonly<Record<string, string>>;
}

export async function openPlaywrightQaDriver(options: PlaywrightQaOptions): Promise<QaDriver> {
  const base = new URL(options.baseUrl);
  if (base.username || base.password || base.search || base.hash) throw new QaBrowserUnavailable('The QA base URL must not contain credentials or capability parameters.');
  if (base.protocol !== 'http:' && base.protocol !== 'https:') throw new QaBrowserUnavailable('The QA base URL must be http or https.');
  const chromium = await loadChromium();
  if (!chromium) throw new QaBrowserUnavailable('No Playwright browser is available in this environment.');
  const executable = discoverChromiumExecutable();
  let browser: PwBrowser;
  try {
    const production = process.env.NODE_ENV === 'production';
    browser = (await chromium.launch({ headless: true, chromiumSandbox: production, args: [...(production ? [] : ['--no-sandbox']), '--disable-dev-shm-usage'], ...(executable ? { executablePath: executable } : {}) })) as unknown as PwBrowser;
  } catch (error) {
    throw new QaBrowserUnavailable(`Playwright could not launch a browser: ${error instanceof Error ? error.message.split('\n')[0] : 'unknown error'}`);
  }

  const sameOrigin = (url: string) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'data:' || parsed.protocol === 'blob:' || parsed.protocol === 'about:') return true;
      return parsed.origin === base.origin;
    } catch {
      return false;
    }
  };

  return {
    name: 'playwright-chromium',
    async browserVersion() {
      return browser.version();
    },
    async open(viewport) {
      const spec = VIEWPORTS[viewport];
      const context = await browser.newContext({
        viewport: { width: spec.width, height: spec.height },
        isMobile: spec.isMobile,
        serviceWorkers: 'block',
        acceptDownloads: false,
        permissions: [],
        ...(options.extraHeaders ? { extraHTTPHeaders: { ...options.extraHeaders } } : {}),
      });
      const diagnostics = { consoleErrors: [] as string[], pageErrors: [] as string[], failedRequests: [] as string[] };
      const safe = (value: string) => containsCredentialSecretText(value) ? '[sensitive output withheld]' : value.slice(0, 500);
      const label = (value: string) => { try { const url = new URL(value); return safe(url.origin + url.pathname); } catch { return '[invalid request]'; } };
      await context.routeWebSocket('**/*', socket => {
        diagnostics.failedRequests.push('Unadmitted browser socket was denied.');
        socket.close({ code: 1008, reason: 'Unadmitted QA socket' });
      });
      await context.route('**/*', async (route) => {
        const request = route.request(), url = request.url();
        if (!sameOrigin(url) || options.readOnly && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
          diagnostics.failedRequests.push(!sameOrigin(url) ? 'blocked request outside the application origin' : 'Unapproved state-changing QA request was denied.');
          return route.abort();
        }
        if (request.resourceType() !== 'document') return route.continue();
        let response: PwRouteResponse | undefined;
        try {
          response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: NAVIGATION_TIMEOUT_MS });
          const body = await response.body();
          if (body.length > 4 * 1024 * 1024) throw new Error('document bound');
          const headers = response.headers(), current = headers['content-security-policy'];
          // Preserve the site's policy and intersect a separate restriction.
          // Child workers otherwise bypass BrowserContext WebSocket routing.
          headers['content-security-policy'] = current ? current + ", worker-src 'none'" : "worker-src 'none'";
          await route.fulfill({ response, body, headers });
        } catch {
          diagnostics.failedRequests.push('QA document could not be admitted.');
          await route.abort().catch(() => undefined);
        } finally { await response?.dispose().catch(() => undefined); }
      });
      const page = await context.newPage();
      page.on('console', ((message: { type(): string; text(): string }) => {
        if (message.type() === 'error') diagnostics.consoleErrors.push(safe(message.text()));
      }) as (payload: never) => void);
      page.on('pageerror', ((error: Error) => diagnostics.pageErrors.push(safe(error.message))) as (payload: never) => void);
      page.on('requestfailed', ((request: PwRequest) => {
        if (/favicon\.ico$/.test(request.url())) return;
        diagnostics.failedRequests.push(`${label(request.url())} ${safe(request.failure()?.errorText ?? '')}`.trim());
      }) as (payload: never) => void);
      page.on('response', ((response: PwResponse) => {
        if (response.status() >= 500 && sameOrigin(response.url())) diagnostics.failedRequests.push(`${label(response.url())} HTTP ${response.status()}`);
      }) as (payload: never) => void);

      const settle = async () => {
        await page.waitForLoadState('domcontentloaded', { timeout: STEP_TIMEOUT_MS }).catch(() => undefined);
        await page.waitForTimeout(150);
      };

      const qaPage: QaPage = {
        async goto(path) {
          if (!path.startsWith('/') || path.startsWith('//')) throw new Error('QA navigation is limited to paths on the application.');
          try {
            const response = await page.goto(new URL(path, base).toString(), { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
            await settle();
            return { status: response ? response.status() : null };
          } catch {
            return { status: null };
          }
        },
        async click(selector) {
          await page.locator(selector).first().click({ timeout: STEP_TIMEOUT_MS });
          await settle();
        },
        async fill(selector, value) {
          await page.locator(selector).first().fill(value, { timeout: STEP_TIMEOUT_MS });
        },
        async reload() {
          await page.reload({ waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
          await settle();
        },
        bodyText: () => page.evaluate<string>('document.body ? document.body.innerText : ""'),
        isVisible: (selector) => page.locator(selector).first().isVisible().catch(() => false),
        currentPath() {
          try {
            return new URL(page.url()).pathname;
          } catch {
            return '';
          }
        },
        hasHorizontalOverflow: () => page.evaluate<boolean>('document.documentElement.scrollWidth > window.innerWidth + 1'),
        hasViewportMeta: () => page.evaluate<boolean>(`Boolean(document.querySelector('meta[name="viewport"]'))`),
        formIsInvalid: (selector) =>
          page.evaluate<boolean>(`(() => { const f = document.querySelector(${JSON.stringify(selector)}); return f ? !f.checkValidity() : false; })()`),
        async submitForm(selector) {
          await page.evaluate<void>(`(() => { const f = document.querySelector(${JSON.stringify(selector)}); if (f) f.requestSubmit(); })()`);
          await settle();
          await page.waitForTimeout(250);
        },
        screenshot: () => page.screenshot({ type: 'png', fullPage: false }).catch(() => null),
        drainDiagnostics() {
          const copy = { consoleErrors: [...diagnostics.consoleErrors], pageErrors: [...diagnostics.pageErrors], failedRequests: [...diagnostics.failedRequests] };
          diagnostics.consoleErrors.length = 0;
          diagnostics.pageErrors.length = 0;
          diagnostics.failedRequests.length = 0;
          return copy;
        },
        async close() {
          await context.close().catch(() => undefined);
        },
      };
      return qaPage;
    },
    async close() {
      await browser.close().catch(() => undefined);
    },
  };
}
