#!/usr/bin/env bash
set -euo pipefail

cli=node_modules/@playwright/test/cli.js
node "$cli" install chromium

# Hosted runners often already have the shared libraries Chromium needs.
# Prove that the pinned browser works before contacting the system package mirror.
smoke() {
  node <<'NODE'
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ timeout: 15000 });
  try {
    const page = await browser.newPage();
    await page.setContent('<main>Chromium is ready</main>', { timeout: 10000 });
    if (await page.locator('main').textContent({ timeout: 10000 }) !== 'Chromium is ready') {
      throw new Error('Chromium smoke test did not render the page');
    }
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
NODE
}

if ! smoke; then
  node "$cli" install-deps chromium
  smoke
fi
