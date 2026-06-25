import { runBrowserbaseScript } from '../../lib/browserbase.js';
import type { BrowserAutomationOutput } from '../../types/features.js';

interface PlaywrightAction {
  type: 'navigate' | 'click' | 'fill' | 'screenshot' | 'extract' | 'wait';
  selector?: string;
  value?: string;
  url?: string;
}

function parseNaturalLanguageToScript(prompt: string): { script: string; startUrl: string; actions: PlaywrightAction[] } {
  const p = prompt.toLowerCase();
  let startUrl = 'https://www.google.com';

  const urlMatch = prompt.match(/(?:go\s+to|visit|open|navigate\s+to)\s+(https?:\/\/[^\s,]+|[^\s,]+\.(?:com|org|net|io)[^\s,]*)/i);
  if (urlMatch) {
    startUrl = urlMatch[1].startsWith('http') ? urlMatch[1] : `https://${urlMatch[1]}`;
  } else if (p.includes('amazon')) {
    startUrl = 'https://www.amazon.com';
  }

  const actions: PlaywrightAction[] = [{ type: 'navigate', url: startUrl }];

  const searchMatch = prompt.match(/search\s+(?:for\s+)?["']?([^"'\n,]+)["']?/i);
  if (searchMatch) {
    actions.push({ type: 'fill', selector: 'input[type="search"], input[name="q"], #twotabsearchtextbox', value: searchMatch[1] });
    actions.push({ type: 'click', selector: 'input[type="submit"], button[type="submit"], .nav-search-submit' });
  }

  if (p.includes('screenshot') || p.includes('capture')) {
    actions.push({ type: 'screenshot' });
  }

  if (p.includes('scrape') || p.includes('extract')) {
    actions.push({ type: 'extract', selector: 'body' });
  }

  const script = `
async (page) => {
  const results = { url: '${startUrl}', title: '', data: {} };
  await page.goto('${startUrl}', { waitUntil: 'networkidle' });
  results.title = await page.title();
  ${searchMatch ? `
  const searchInput = await page.$('input[type="search"], input[name="q"], #twotabsearchtextbox');
  if (searchInput) { await searchInput.fill('${searchMatch[1].replace(/'/g, "\\'")}'); await page.keyboard.press('Enter'); await page.waitForTimeout(2000); }
  ` : ''}
  ${p.includes('screenshot') ? 'results.screenshot = await page.screenshot({ encoding: "base64" });' : ''}
  ${p.includes('scrape') || p.includes('extract') ? 'results.data = { text: await page.textContent("body")?.then(t => t?.slice(0, 2000)) };' : ''}
  return results;
}`;

  return { script, startUrl, actions };
}

async function runPlaywrightLocal(
  script: string,
  startUrl: string
): Promise<{ screenshotBase64?: string; data?: Record<string, unknown> }> {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(startUrl, { waitUntil: 'networkidle' });

    const fnBody = script.match(/async \(page\) => \{([\s\S]*)\}/)?.[1];
    if (fnBody) {
      const runner = new Function('page', `return (async () => { ${fnBody} })()`);
      const result = await runner(page) as Record<string, unknown>;
      await browser.close();
      return {
        screenshotBase64: result.screenshot as string | undefined,
        data: result as Record<string, unknown>,
      };
    }

    const screenshotBuffer = await page.screenshot();
    const title = await page.title();
    await browser.close();

    return { screenshotBase64: screenshotBuffer.toString('base64'), data: { title, url: startUrl } };
  } catch (err) {
    console.error('[Browser] Playwright local failed:', (err as Error).message);
    throw err;
  }
}

export async function runBrowserAutomation(prompt: string): Promise<BrowserAutomationOutput> {
  const { script, startUrl } = parseNaturalLanguageToScript(prompt);

  let screenshotBase64: string | undefined;
  let scrapedData: Record<string, unknown> | undefined;

  try {
    const result = await runPlaywrightLocal(script, startUrl);
    screenshotBase64 = result.screenshotBase64;
    scrapedData = result.data;
  } catch (playwrightErr) {
    console.error('[Browser] Playwright failed, trying Browserbase:', (playwrightErr as Error).message);

    try {
      const result = await runBrowserbaseScript(script, startUrl);
      screenshotBase64 = result.screenshotBase64;
      scrapedData = result.data;
    } catch (bbErr) {
      console.error('[Browser] Browserbase failed:', (bbErr as Error).message);
      scrapedData = {
        simulated: true,
        message: 'Browser automation simulated – configure Playwright or Browserbase for live execution',
        parsedScript: script,
        startUrl,
      };
    }
  }

  const screenshotUrl = screenshotBase64
    ? `data:image/png;base64,${screenshotBase64}`
    : undefined;

  return {
    type: 'browser_automation',
    screenshotUrl,
    scrapedData,
    script,
    pagesProcessed: 1,
  };
}
