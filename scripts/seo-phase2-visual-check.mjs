import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const base = (process.env.SEO_AUDIT_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const outputDirectory = new URL('../artifacts/seo-phase2/', import.meta.url);
const routes = [
  '/features/ai-chat',
  '/blog/best-vibe-coding-tools',
  '/blog/best-ai-app-builders',
  '/blog/what-is-vibe-coding',
  '/build/saas-app',
  '/build-with/github',
  '/ai-app-builder',
  '/ai-coding-agent',
];
const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
];

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const problems = [];

for (const viewport of viewports) {
  const context = await browser.newContext({ viewport });
  for (const route of routes) {
    const page = await context.newPage();
    const runtimeErrors = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') runtimeErrors.push(message.text());
    });

    const response = await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
    const h1Count = await page.locator('h1').count();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (response?.status() !== 200) problems.push(`${route} (${viewport.name}): HTTP ${response?.status()}`);
    if (h1Count !== 1) problems.push(`${route} (${viewport.name}): expected one H1, found ${h1Count}`);
    if (overflow) problems.push(`${route} (${viewport.name}): horizontal overflow`);
    if (runtimeErrors.length) problems.push(`${route} (${viewport.name}): ${runtimeErrors.join(' | ')}`);

    const filename = `${route.slice(1).replaceAll('/', '-')}-${viewport.name}.png`;
    await page.screenshot({ path: fileURLToPath(new URL(filename, outputDirectory)), fullPage: true });
    await page.close();
  }
  await context.close();
}

await browser.close();

if (problems.length) {
  console.error(`Visual check failed:\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
  process.exit(1);
}

console.log(`Visual check passed for ${routes.length} routes at desktop and mobile widths.`);
