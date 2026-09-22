import { buildRssFeed, blogFeedItems } from '@/lib/seoFeeds';

export function GET() {
  return new Response(buildRssFeed('Xroga guides', '/blog', 'Guides for building, checking, and shipping software with AI.', blogFeedItems), {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}
