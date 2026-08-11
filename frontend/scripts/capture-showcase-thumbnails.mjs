/**
 * Captures real thumbnails of every showcase product at three widths.
 *
 * These are genuine screenshots of the running products — never mockups — so a card
 * shows what the product actually looks like without booting six application
 * runtimes on the homepage. The full interactive preview still runs live on the
 * detail and preview routes.
 *
 * Run against a built server:
 *   npm run build && npm run start
 *   node scripts/capture-showcase-thumbnails.mjs
 *
 * Re-run whenever a product's visual design changes, and commit the output.
 */

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const BASE = process.env.SHOWCASE_BASE_URL ?? 'http://127.0.0.1:3000';
const OUT_DIR = path.join(process.cwd(), 'public', 'showcase', 'thumbnails');

const ALL_SLUGS = [
  'modern-business-website',
  'real-estate-platform',
  'booking-platform',
  'android-app',
  'ai-saas-chatbot',
  'playable-web-game',
];
const requestedSlug = process.env.SHOWCASE_SLUG?.trim();
if (requestedSlug && !ALL_SLUGS.includes(requestedSlug)) {
  throw new Error(`Unknown SHOWCASE_SLUG: ${requestedSlug}`);
}
const SLUGS = requestedSlug ? [requestedSlug] : ALL_SLUGS;

/** Capture size, then the width the stored WebP is resized to. */
const VIEWS = [
  { id: 'desktop', width: 1440, height: 900, out: 960 },
  { id: 'tablet', width: 834, height: 1000, out: 640 },
  { id: 'mobile', width: 414, height: 760, out: 414 },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  let written = 0;

  for (const slug of SLUGS) {
    for (const view of VIEWS) {
      const page = await browser.newPage({
        viewport: { width: view.width, height: view.height },
        deviceScaleFactor: 2,
      });
      const errors = [];
      page.on('pageerror', (error) => errors.push(String(error)));

      const response = await page.goto(`${BASE}/showcase/${slug}/preview`, { waitUntil: 'networkidle' });
      if (!response || response.status() !== 200) {
        throw new Error(`${slug} (${view.id}) returned ${response?.status()}`);
      }
      // Let fonts settle and any entry transition finish before capturing.
      await page.waitForTimeout(900);
      if (errors.length) throw new Error(`${slug} (${view.id}) threw: ${errors[0]}`);

      const png = await page.screenshot({ type: 'png' });
      const file = path.join(OUT_DIR, `${slug}-${view.id}.webp`);
      await sharp(png).resize({ width: view.out }).webp({ quality: 82 }).toFile(file);
      written += 1;
      console.log(`wrote ${path.relative(process.cwd(), file)}`);
      await page.close();
    }
  }

  await browser.close();
  console.log(`\n${written} thumbnails written to ${path.relative(process.cwd(), OUT_DIR)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
