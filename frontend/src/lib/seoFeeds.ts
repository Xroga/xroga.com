import { BLOG_ARTICLES } from './seoGrowthContent';

const SITE_URL = 'https://xroga.com';

export type FeedItem = {
  title: string;
  path: string;
  description: string;
  publishedAt: string;
  updatedAt?: string;
  author?: string;
};

const escapeXml = (value: string) => value
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&apos;');

export function buildRssFeed(title: string, path: string, description: string, items: FeedItem[]): string {
  const ids = new Set<string>();
  for (const item of items) {
    const id = `${SITE_URL}${item.path}`;
    if (ids.has(id)) throw new Error(`Duplicate feed GUID: ${id}`);
    ids.add(id);
  }
  const body = [...items]
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt) || left.path.localeCompare(right.path))
    .map((item) => {
      const canonical = `${SITE_URL}${item.path}`;
      const updated = item.updatedAt ?? item.publishedAt;
      return `<item><title>${escapeXml(item.title)}</title><link>${canonical}</link><guid isPermaLink="true">${canonical}</guid><description>${escapeXml(item.description)}</description><pubDate>${new Date(`${item.publishedAt}T00:00:00Z`).toUTCString()}</pubDate><dc:creator>${escapeXml(item.author ?? 'Xroga')}</dc:creator><atom:updated>${new Date(`${updated}T00:00:00Z`).toISOString()}</atom:updated></item>`;
    }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>${escapeXml(title)}</title><link>${SITE_URL}${path}</link><description>${escapeXml(description)}</description><language>en</language><atom:link href="${SITE_URL}${path}/feed.xml" rel="self" type="application/rss+xml"/>${body}</channel></rss>`;
}

export const blogFeedItems: FeedItem[] = BLOG_ARTICLES.map((article) => ({
  title: article.title,
  path: `/blog/${article.slug}`,
  description: article.description,
  publishedAt: article.updated ?? '2026-09-09',
  updatedAt: article.updated ?? '2026-09-09',
}));

export const researchFeedItems: FeedItem[] = [{
  title: 'Web3 hackathon winning patterns',
  path: '/research/web3-hackathon-winning-patterns',
  description: 'Evidence-backed patterns for evaluating and preparing Web3 hackathon projects.',
  publishedAt: '2026-08-30',
  updatedAt: '2026-08-30',
}];

export const changelogFeedItems: FeedItem[] = [{
  title: 'Xroga Growth OS content system',
  path: '/changelog',
  description: 'Evidence-gated growth assets, technical publishing checks, and production verification.',
  publishedAt: '2026-09-20',
  updatedAt: '2026-09-20',
}];
