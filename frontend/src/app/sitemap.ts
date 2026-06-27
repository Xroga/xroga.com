import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    '',
    '/about',
    '/privacy',
    '/pricing',
    '/auth/login',
    '/auth/signup',
    '/dashboard',
    '/dashboard/automation',
    '/dashboard/integrations',
    '/dashboard/spending',
    '/dashboard/projects',
    '/dashboard/chats',
    '/dashboard/analytics',
    '/dashboard/billing',
    '/settings',
  ];

  return routes.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: path === '' ? 'daily' : 'weekly',
    priority: path === '' ? 1 : path === '/about' ? 0.9 : 0.7,
  }));
}
