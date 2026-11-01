/** Shared browser loading and executable discovery only.
 * No navigation, request, context or verification executor. */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CHROMIUM_MODULES = ['playwright', '@playwright/test'] as const;

export type ChromiumLauncher = {
  launch: (options: Record<string, unknown>) => Promise<PlaywrightBrowser>;
};

export async function loadChromium(): Promise<ChromiumLauncher | null> {
  for (const specifier of CHROMIUM_MODULES) {
    try {
      const mod = (await import(specifier as string)) as {
        chromium?: ChromiumLauncher;
      };
      if (mod.chromium) return mod.chromium;
    } catch {
      // Not installed here, or installed without browsers. Try the next, then give up quietly:
      // the caller's whole job is to report "no browser" as a first-class outcome.
    }
  }
  return null;
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
export interface PlaywrightBrowser {
  newContext(options?: Record<string, unknown>): Promise<PlaywrightContext>;
  close(): Promise<void>;
}

export function discoverChromiumExecutable(): string | null {
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

