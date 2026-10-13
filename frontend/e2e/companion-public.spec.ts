import { expect, test } from '@playwright/test';

test('current public S00 homepage, themes and reduced-motion accessibility are connected', async ({ page }) => {
  await page.addInitScript(() => {
    class TestSpeechRecognition {
      lang = 'en-US';
      interimResults = false;
      continuous = false;
      onresult: ((event: { results: Array<{ 0: { transcript: string } }> }) => void) | null = null;
      onerror: (() => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        this.onresult?.({ results: [{ 0: { transcript: 'Build a voice accessible portfolio' } }] });
        this.onend?.();
      }
      stop() { this.onend?.(); }
    }
    (window as typeof window & { SpeechRecognition?: typeof TestSpeechRecognition }).SpeechRecognition = TestSpeechRecognition;
  });
  await page.goto('/');
  await expect(page.locator('#s00-title')).toBeVisible();

  // The "Capacity designed to finish work" plan section was removed from the homepage
  // by request, so its assertions are gone. Plan detail now lives on /pricing and
  // inside the homepage FAQ accordion; this spec covers the companion, themes, and
  // accessibility instead.

  // Main intentionally removed the public header theme control. Exercise the
  // real guest workspace selector and its persistence. Public marketing pages
  // deliberately force MARKETING_THEME=black without changing user preferences.
  await expect(page.getByRole('button', { name: 'Change website theme' })).toHaveCount(0);
  for (const theme of ['Beige', 'White', 'Gray', 'Black']) {
    await page.goto('/workspace');
    await page.getByRole('button', { name: 'Change theme', exact: true }).first().click();
    await page.getByRole('menuitemradio', { name: new RegExp(`^${theme}`) }).click();
    await expect(page.locator('body')).toHaveClass(new RegExp(`theme-${theme.toLowerCase()}`));
    await page.goto('/');
    await expect(page.locator('body')).toHaveClass(/theme-black/);
    await page.goto('/workspace');
    await expect(page.locator('body')).toHaveClass(new RegExp(`theme-${theme.toLowerCase()}`));
  }

  await page.goto('/');

  // The public homepage now renders S00Hero rather than the retired
  // HomepageCompanionStage. Assert actual public interactions without restoring
  // an obsolete companion just to satisfy a stale regression test.
  await expect(page.getByRole('button', { name: /get started/i }).first()).toBeVisible();
  await expect(page.getByRole('region', { name: /companion panel/ })).toHaveCount(0);

  await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('xroga-theme') ?? '{}');
    stored.state = { ...(stored.state ?? {}), reducedMotion: true };
    localStorage.setItem('xroga-theme', JSON.stringify(stored));
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
});
