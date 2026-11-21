import assert from 'node:assert/strict';
import test from 'node:test';
import { BLOG_ARTICLES } from '../../frontend/src/lib/seoGrowthContent.js';
import { PREMIUM_BLOG_ARTICLES } from '../../frontend/src/lib/premiumBlogIndex.js';
import { buildPublicUrlInventory, buildSitemapRecords } from '../../frontend/src/lib/publicUrlInventory.js';
import { mapChangedFilesToUrls } from './core.js';

const premiumPaths = PREMIUM_BLOG_ARTICLES.map(({ slug }) => `/blog/${slug}`);
const premiumSources = PREMIUM_BLOG_ARTICLES.map(({ slug }) => `frontend/src/lib/premiumBlogs/${slug}.ts`);

test('ten premium articles retain unique canonical slugs and are public/indexable', () => {
  assert.equal(premiumPaths.length, 10);
  assert.equal(new Set(premiumPaths).size, 10);
  const inventory = buildPublicUrlInventory();
  const sitemap = buildSitemapRecords();
  for (const path of premiumPaths) {
    const entries = inventory.filter((record) => record.path === path);
    assert.equal(entries.length, 1, `one inventory entry for ${path}`);
    assert.equal(entries[0].classification, 'PUBLIC_INDEXABLE');
    assert.equal(entries[0].canonical, `https://xroga.com${path}`);
    assert.equal(entries[0].sitemap, true);
    assert.equal(entries[0].feed, 'blog');
    assert.ok(entries[0].publishedAt);
    assert.ok(entries[0].updatedAt);
    assert.equal(sitemap.filter((row) => row.url === entries[0].canonical).length, 1);
  }
});

test('every premium source file is explicitly bound to its own indexed URL', async () => {
  const inventory = buildPublicUrlInventory();
  for (const [index, path] of premiumPaths.entries()) {
    assert.ok(inventory.find((row) => row.path === path)?.contentSources.includes(premiumSources[index]));
  }
  const changed = await mapChangedFilesToUrls(premiumSources);
  assert.deepEqual(changed.directlyChangedUrls, [...premiumPaths].sort());
  assert.deepEqual(changed.unknownImpact, []);
});

test('established articles provide meaningful HTML related links to every new guide', () => {
  const premium = new Set(premiumPaths);
  const established = BLOG_ARTICLES.filter((item) => !premium.has(`/blog/${item.slug}`));
  const linked = new Set(established.flatMap((item) => item.related ?? []));
  for (const path of premiumPaths) assert.ok(linked.has(path), `older guide links to ${path}`);
  const known = new Set(BLOG_ARTICLES.map(({ slug }) => `/blog/${slug}`));
  for (const article of BLOG_ARTICLES) {
    const links = article.related?.filter((url) => url.startsWith('/blog/')) ?? [];
    assert.equal(links.length, new Set(links).size);
    for (const url of links) assert.ok(known.has(url), `internal blog link ${url} exists`);
  }
});
