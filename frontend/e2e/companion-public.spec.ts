import { expect, test } from '@playwright/test';

test('public X-companion, themes, plan story, and accessibility are connected', async ({ page }) => {
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
  await expect(page.getByTestId('xroga-companion-hero')).toBeVisible();

  // The "Capacity designed to finish work" plan section was removed from the homepage
  // by request, so its assertions are gone. Plan detail now lives on /pricing and
  // inside the homepage FAQ accordion; this spec covers the companion, themes, and
  // accessibility instead.

  for (const theme of ['Beige', 'White', 'Gray', 'Black']) {
    await page.getByRole('button', { name: 'Change homepage theme' }).click();
    await page.getByRole('radio', { name: new RegExp(`^${theme}`) }).click();
    await expect(page.locator('body')).toHaveClass(new RegExp(`theme-${theme.toLowerCase()}`));
  }

  // Smoky is decorative now: the click-to-open control panel and the speech
  // synthesis it carried were removed, so there is no trigger button and no panel.
  // Companion preferences moved to Settings; dictation belongs to the composer.
  await expect(page.getByRole('button', { name: /Open .*Xroga companion/ })).toHaveCount(0);
  await expect(page.getByRole('region', { name: /companion panel/ })).toHaveCount(0);
  await expect(page.locator('img.xv-companion-renderer').first()).toHaveAttribute('aria-hidden', 'true');

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('xroga:companion-event', {
    detail: { type: 'runtime_progress', operation: 'testing', message: 'Running the real validation command', source: 'runtime' },
  })));
  await expect(page.getByTestId('xroga-companion-hero')).toHaveAttribute('data-operation', 'testing');

  await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('xroga-theme') ?? '{}');
    stored.state = { ...(stored.state ?? {}), reducedMotion: true };
    localStorage.setItem('xroga-theme', JSON.stringify(stored));
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
});
