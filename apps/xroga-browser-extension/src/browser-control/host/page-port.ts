// Puppeteer's remaining jobs: keyboard input with its key definitions, navigation with load waits.
// Screenshots are taken with a raw Page.captureScreenshot, which leaves the viewport untouched.
import type { CdpPort, PagePort, ScreenshotOptions } from '../core/ports';
import { LayerError } from '../protocol/errors';
import { splitChord } from '../core/interaction/keys';
import { quote } from '../core/text';
import { isKnownKey } from './puppeteer';
import type { KeyInput, Page } from './puppeteer';

const MODIFIERS = new Set(['Alt', 'Control', 'Meta', 'Shift', 'ControlOrMeta']);

/** Width and height from a PNG's IHDR chunk. */
export function pngSize(base64: string): { width: number; height: number } {
  const header = atob(base64.slice(0, 44));
  const read = (offset: number) =>
    ((header.charCodeAt(offset) << 24) |
      (header.charCodeAt(offset + 1) << 16) |
      (header.charCodeAt(offset + 2) << 8) |
      header.charCodeAt(offset + 3)) >>>
    0;
  return { width: read(16), height: read(20) };
}

/** The longest side of a picture sent to the model, in pixels. */
export const MAX_SIDE = 1800;

export class PuppeteerPagePort implements PagePort {
  constructor(
    private readonly page: Page,
    private readonly cdp: CdpPort,
  ) {}

  async screenshot(options: ScreenshotOptions) {
    const params: Record<string, unknown> = { format: 'png' };
    if (options.clip) {
      params.clip = { ...options.clip, scale: options.scale ?? 1 };
      params.captureBeyondViewport = true;
    } else if (options.fullPage) {
      const metrics = await this.cdp.send<{ cssContentSize: { width: number; height: number } }>(
        undefined,
        'Page.getLayoutMetrics',
      );
      params.clip = {
        x: 0,
        y: 0,
        width: metrics.cssContentSize.width,
        height: metrics.cssContentSize.height,
        scale: 1,
      };
      params.captureBeyondViewport = true;
    }
    // A tab the user is not looking at often answers its FIRST capture only after a long wait (measured in real Chromium: a 20 s timeout on the first
    // screenshot of every run, then success at once). A capture changes nothing, so a short first attempt followed by the long one is safe and saves ~16 s.
    let data: string;
    try {
      ({ data } = await this.cdp.send<{ data: string }>(undefined, 'Page.captureScreenshot', params, 4_000));
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'CdpTimeoutError') throw error;
      ({ data } = await this.cdp.send<{ data: string }>(undefined, 'Page.captureScreenshot', params, 20_000));
    }
    let size = pngSize(data);
    // A picture with a side over MAX_SIDE costs far more model input and is refused by some providers (browser-harness caps at 1800, browser-use at 2048): take it again at a smaller scale, once, then once more if the first guess was off.
    for (let attempt = 0; attempt < 2 && Math.max(size.width, size.height) > MAX_SIDE; attempt++) {
      const ratio = (MAX_SIDE - 8) / Math.max(size.width, size.height);
      let clip = params.clip as { x: number; y: number; width: number; height: number; scale: number } | undefined;
      if (!clip) {
        const m = await this.cdp.send<{ cssVisualViewport: { pageX: number; pageY: number; clientWidth: number; clientHeight: number } }>(undefined, 'Page.getLayoutMetrics');
        clip = { x: m.cssVisualViewport.pageX, y: m.cssVisualViewport.pageY, width: m.cssVisualViewport.clientWidth, height: m.cssVisualViewport.clientHeight, scale: 1 };
      }
      const smaller = { ...params, clip: { ...clip, scale: clip.scale * ratio } };
      const again = await this.cdp.send<{ data: string }>(undefined, 'Page.captureScreenshot', smaller, 20_000).catch(() => undefined);
      if (!again) break;
      data = again.data;
      size = pngSize(data);
      params.clip = smaller.clip;
    }
    return { base64: data, ...size };
  }

  /** A chord such as "Control+A": the same split as the gate's (core/interaction/keys.ts), modifiers mapped. */
  chord(keys: string): { modifiers: string[]; key: string } {
    const { modifiers: parts, key } = splitChord(keys);
    const isMac = /Mac/i.test(navigator.userAgent);
    const modifiers = parts.map(m => (m === 'ControlOrMeta' ? (isMac ? 'Meta' : 'Control') : m));
    for (const modifier of modifiers) {
      if (!MODIFIERS.has(modifier)) throw new LayerError('INVALID_ARGUMENT', `Unknown modifier "${modifier}"`);
    }
    if (!isKnownKey(key)) throw new LayerError('INVALID_ARGUMENT', `Unknown key ${quote(key, 40)}`);
    return { modifiers, key };
  }

  async keyDown(key: string): Promise<void> {
    await this.page.keyboard.down(key as KeyInput);
  }

  async keyUp(key: string): Promise<void> {
    await this.page.keyboard.up(key as KeyInput);
  }

  isKey(char: string): boolean {
    return isKnownKey(char);
  }

  async insertCharacter(char: string): Promise<void> {
    await this.page.keyboard.sendCharacter(char);
  }

  async goto(url: string, timeoutMs: number): Promise<void> {
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  }

  async goBack(timeoutMs: number): Promise<void> {
    await this.page.goBack({ waitUntil: 'domcontentloaded', timeout: timeoutMs });
  }

  async goForward(timeoutMs: number): Promise<void> {
    await this.page.goForward({ waitUntil: 'domcontentloaded', timeout: timeoutMs });
  }

  async reload(timeoutMs: number): Promise<void> {
    await this.page.reload({ waitUntil: 'domcontentloaded', timeout: timeoutMs });
  }
}
