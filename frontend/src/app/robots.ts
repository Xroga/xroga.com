import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  if (process.env.VERCEL_ENV === 'preview') {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  const privatePaths = ['/api/', '/dashboard/', '/workspace', '/settings', '/admin', '/auth/', '/preview/', '/terminal/'];
  const publicSearchCrawlers = ['Googlebot', 'bingbot', 'OAI-SearchBot', 'PerplexityBot', 'Claude-SearchBot'];
  return {
    rules: [
      { userAgent: '*', allow: ['/', '/llms.txt'], disallow: privatePaths },
      ...publicSearchCrawlers.map((userAgent) => ({ userAgent, allow: ['/', '/llms.txt'], disallow: privatePaths })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
