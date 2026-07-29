import { expect, test } from '@playwright/test';

test('community feedback modal is accessible and preserves public requirements', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Share Feedback' }).click();
  const dialog = page.getByRole('dialog', { name: 'Post to Xroga Community' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Your post will be publicly visible in the Xroga Community.')).toBeVisible();
  await expect(dialog.locator('input[type="email"]')).toHaveCount(0);
  await expect(dialog.getByRole('textbox', { name: 'Title' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Close community post dialog' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('canonical SEO pages render distinct crawlable outcomes', async ({ page, request }) => {
  const paths = ['/ai-coding-agent', '/ai-app-builder', '/ai-website-builder', '/build-saas-with-ai', '/github-ai-coding-agent', '/vercel-ai-deployment', '/docs', '/crypto-hackathon-builder', '/research/web3-hackathon-winning-patterns'];
  const titles = new Set<string>();
  for (const path of paths) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
    const title = await page.title();
    expect(title).toContain('Xroga');
    expect(titles.has(title), `duplicate title: ${title}`).toBe(false);
    titles.add(title);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://xroga.com${path}`);
    expect((await page.locator('body').innerText()).length).toBeGreaterThan(300);
  }
  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain('/crypto-hackathon-builder');
  expect(sitemap).toContain('/community');
  expect(sitemap).not.toContain('/features/earn-xrg-referrals');
  expect(sitemap).not.toContain('/features/ai-image-generation');
});

test('research downloads and llms discovery are available', async ({ request }) => {
  const [json, csv, llms] = await Promise.all([
    request.get('/research/web3-hackathon-sources.json'),
    request.get('/research/web3-hackathon-sources.csv'),
    request.get('/llms.txt'),
  ]);
  expect(json.status()).toBe(200);
  expect((await json.json()).sources.length).toBeGreaterThanOrEqual(11);
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain('ETHGlobal');
  expect(llms.status()).toBe(200);
  expect(await llms.text()).toContain('AI coding and product-building agent');
});
