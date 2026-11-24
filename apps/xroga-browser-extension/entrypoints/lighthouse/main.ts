// The page that runs Lighthouse (Google's page audit, Apache-2.0, from chrome-devtools-mcp's bundle) against one tab. A worker cannot load the bundle (no dynamic import, no DOM),
// and an offscreen document has no debugger, so a normal extension page does it: it attaches to the tab it is given, runs a navigation audit and sends back a summary.
// The worker opens this page in its own small window and closes the window when the answer arrives.
// The bundle is loaded from its own file, untouched by the bundler (see scripts/prepare-lighthouse.mjs): Lighthouse reads its own function text and fails if that is rewritten.
import { summarise } from '@src/lighthouse/summary';

const params = new URLSearchParams(location.search);
const id = params.get('id') ?? '';
const tabId = Number(params.get('tab'));
const url = params.get('url') ?? '';
const device = params.get('device') === 'desktop' ? 'desktop' : 'mobile';
const categories = (params.get('categories') ?? '').split(',').filter(Boolean);

async function send(body: Record<string, unknown>): Promise<void> {
  await chrome.runtime.sendMessage({ type: 'xroga.lighthouse.result', id, ...body }).catch(() => undefined);
}

async function run(): Promise<void> {
  const { connectTab, disconnectTab } = await import('@src/browser-control/host/puppeteer');
  const bundle = (await import(/* @vite-ignore */ chrome.runtime.getURL('/lighthouse/bundle.js'))) as {
    navigation: (page: unknown, url: string, options: { flags: Record<string, unknown> }) => Promise<{ lhr?: unknown } | undefined>;
  };
  const connection = await connectTab(tabId);
  try {
    const flags = {
      formFactor: device,
      onlyCategories: categories.length ? categories : ['performance', 'accessibility', 'best-practices', 'seo'],
      screenEmulation: device === 'desktop' ? { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false } : { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
      throttlingMethod: 'simulate',
      output: 'json',
    };
    const result = await bundle.navigation(connection.page, url, { flags });
    if (!result?.lhr) throw new Error('Lighthouse returned no result');
    await send({ ok: true, summary: summarise(result.lhr as never) });
  } finally {
    await disconnectTab(connection).catch(() => undefined);
  }
}

run().catch(async error => {
  await send({ ok: false, error: error instanceof Error ? `${error.name}: ${error.message} | ${(error.stack ?? '').split('\n').slice(1, 5).join(' <- ').slice(0, 700)}` : String(error) });
});
