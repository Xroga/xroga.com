import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { BLOG_ARTICLES } from './seoGrowthContent';
import { buildSitemapRecords, PUBLIC_URL_INVENTORY } from './publicUrlInventory';
import { blogFeedItems, buildRssFeed } from './seoFeeds';

const slugs = ['free-ai-app-builder', 'choose-an-app-builder', 'build-an-app-with-ai', 'ai-app-builder-prompts', 'launch-an-ai-built-mvp'];
test('five complete app-building guides share discovery, source and image contracts', () => {
  for (const slug of slugs) {
    const article = BLOG_ARTICLES.find((item) => item.slug === slug);
    assert.ok(article, slug);
    const text = [article.intro, ...article.sections.flatMap((s) => [s.heading, ...s.paragraphs])].join(' ');
    assert.ok(text.split(/\s+/).length >= 4800, `${slug} needs approximately 5,000 words`);
    assert.ok(article.sections.length >= 20);
    assert.ok(article.sections.some((s) => s.links?.length));
    assert.equal(article.authorName, 'Xroga Editorial');
    assert.equal(article.updated, '2026-10-30');
    assert.ok(article.sources && article.sources.length >= 3);
    assert.ok(article.visual && existsSync(new URL(`../../public${article.visual.src}`, import.meta.url)));
    const path = `/blog/${slug}`;
    assert.equal(PUBLIC_URL_INVENTORY.filter((row) => row.path === path).length, 1);
    assert.equal(buildSitemapRecords().filter((row) => row.url === `https://xroga.com${path}`).length, 1);
    assert.equal(blogFeedItems.filter((row) => row.path === path).length, 1);
    assert.ok(article.related.filter((href) => href.startsWith('/blog/')).length >= 4);
  }
});
test('discovery excludes private routes and RSS keeps canonical IDs', () => {
  assert.ok(buildSitemapRecords().every((row) => !/^\/(?:dashboard|workspace|auth)(?:\/|$)/.test(new URL(row.url).pathname)));
  const rss = buildRssFeed('Xroga blog', '/blog', 'App building guides', blogFeedItems);
  for (const slug of slugs) assert.ok(rss.includes(`<guid isPermaLink="true">https://xroga.com/blog/${slug}</guid>`));
});
