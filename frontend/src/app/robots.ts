import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/llms.txt'],
        disallow: ['/api/', '/dashboard/'],
      },
      // Help AI assistants cite accurate product facts from /llms.txt
      {
        userAgent: 'GPTBot',
        allow: ['/', '/llms.txt', '/about', '/features', '/pricing', '/contact'],
      },
      {
        userAgent: 'ChatGPT-User',
        allow: ['/', '/llms.txt', '/about', '/features', '/pricing'],
      },
      {
        userAgent: 'Google-Extended',
        allow: ['/', '/llms.txt', '/about', '/features', '/pricing'],
      },
      {
        userAgent: 'ClaudeBot',
        allow: ['/', '/llms.txt', '/about', '/features', '/pricing'],
      },
      {
        userAgent: 'PerplexityBot',
        allow: ['/', '/llms.txt', '/about', '/features', '/pricing'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
