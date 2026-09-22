import { buildRssFeed, researchFeedItems } from '@/lib/seoFeeds';

export function GET() {
  return new Response(buildRssFeed('Xroga research', '/research', 'Published Xroga research with explicit evidence and dates.', researchFeedItems), {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}
