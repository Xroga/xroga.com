import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

const MARKETING_ROUTES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[0]['changeFrequency'] }[] = [
  { path: '', priority: 1, changeFrequency: 'daily' },
  { path: '/features', priority: 0.95, changeFrequency: 'weekly' },
  { path: '/pricing', priority: 0.95, changeFrequency: 'weekly' },
  { path: '/auth/signup', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/auth/login', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/about', priority: 0.85, changeFrequency: 'monthly' },
  { path: '/docs/api', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/terms', priority: 0.4, changeFrequency: 'yearly' },
  { path: '/privacy', priority: 0.4, changeFrequency: 'yearly' },
  { path: '/refund', priority: 0.4, changeFrequency: 'yearly' },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return MARKETING_ROUTES.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency,
    priority,
  }));
}
