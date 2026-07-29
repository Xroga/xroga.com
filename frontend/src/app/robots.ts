import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: '*',
      allow: ['/', '/llms.txt'],
      disallow: ['/api/', '/dashboard/', '/workspace', '/settings', '/admin', '/auth/', '/preview/', '/terminal/'],
    }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
