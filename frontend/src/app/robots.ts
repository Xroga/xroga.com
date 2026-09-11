import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  if (process.env.VERCEL_ENV === 'preview') {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  const privatePaths = ['/api/', '/dashboard/', '/workspace', '/settings', '/admin', '/auth/', '/preview/', '/terminal/'];
  return {
    rules: [
      { userAgent: '*', allow: ['/', '/llms.txt'], disallow: privatePaths },
      { userAgent: 'OAI-SearchBot', allow: ['/', '/llms.txt'], disallow: privatePaths },
      { userAgent: 'PerplexityBot', allow: ['/', '/llms.txt'], disallow: privatePaths },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
