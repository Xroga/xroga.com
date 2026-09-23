import { buildRssFeed, changelogFeedItems } from '@/lib/seoFeeds';

export function GET() {
  return new Response(buildRssFeed('Xroga changelog', '/changelog', 'Verified Xroga product and operating-system changes.', changelogFeedItems), {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}
