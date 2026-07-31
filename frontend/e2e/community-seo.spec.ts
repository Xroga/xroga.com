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

test('guest community draft survives the existing login redirect without a protected post attempt', async ({ page }) => {
  let createAttempts = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/api/community/posts')) createAttempts += 1;
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Share Feedback' }).click();
  const dialog = page.getByRole('dialog', { name: 'Post to Xroga Community' });
  await dialog.getByLabel('Category').selectOption('bug');
  await dialog.getByLabel('Title').fill('Guest draft is preserved');
  await dialog.getByLabel('Message').fill('This content should survive the existing Xroga login flow.');
  await dialog.getByRole('button', { name: 'Post to Community' }).click();

  await page.waitForURL(/\/auth\/login\?next=%2Fcommunity%3Fcompose%3D1/);
  expect(createAttempts).toBe(0);
  await expect.poll(() => page.evaluate(() => window.sessionStorage.getItem('xroga-community-draft'))).not.toBeNull();
  const savedDraft = await page.evaluate(() => JSON.parse(window.sessionStorage.getItem('xroga-community-draft') ?? '{}'));
  expect(savedDraft).toEqual({
    category: 'bug',
    title: 'Guest draft is preserved',
    body: 'This content should survive the existing Xroga login flow.',
  });
});

test('canonical SEO pages render distinct crawlable outcomes', async ({ page, request }) => {
  const paths = ['/ai-coding-agent', '/ai-app-builder', '/ai-website-builder', '/build-saas-with-ai', '/github-ai-coding-agent', '/vercel-ai-deployment', '/docs', '/crypto-builder', '/research/web3-hackathon-winning-patterns'];
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
  expect(sitemap).toContain('/crypto-builder');
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
