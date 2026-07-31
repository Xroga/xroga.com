import type { MetadataRoute } from 'next';
import { CAPABILITY_PAGES } from '@/lib/capabilityPages';
import { DOC_PAGES } from '@/lib/docsContent';
import { SITE_URL } from '@/lib/seo';
import { SHOWCASE_TEMPLATES } from '@/lib/showcase/registry';

const UPDATED = new Date('2026-07-30T00:00:00Z');
const routes = [
  ['', 1, 'daily'], ['/features', .95, 'weekly'], ['/pricing', .92, 'weekly'], ['/integrations', .88, 'monthly'],
  ['/community', .9, 'daily'], ['/docs', .92, 'weekly'], ['/crypto-builder', .94, 'weekly'],
  ['/research', .82, 'monthly'], ['/research/web3-hackathon-winning-patterns', .9, 'monthly'],
  ['/about', .78, 'monthly'], ['/contact', .65, 'yearly'], ['/terms', .45, 'yearly'], ['/privacy', .45, 'yearly'], ['/refund', .45, 'yearly'],
  ['/showcase', .93, 'weekly'],
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const canonical = routes.map(([path, priority, changeFrequency]) => ({ url: `${SITE_URL}${path}`, priority, changeFrequency, lastModified: UPDATED }));
  const capabilities = Object.values(CAPABILITY_PAGES).map((page) => ({ url: `${SITE_URL}/${page.slug}`, priority: .9, changeFrequency: 'monthly' as const, lastModified: UPDATED }));
  const docs = DOC_PAGES.map((page) => ({ url: `${SITE_URL}/docs/${page.slug}`, priority: .72, changeFrequency: 'monthly' as const, lastModified: new Date(`${page.updated}T00:00:00Z`) }));
  // Detail pages only — the bare /preview surfaces are intentionally not indexed.
  const showcase = SHOWCASE_TEMPLATES.map((template) => ({ url: `${SITE_URL}/showcase/${template.slug}`, priority: .85, changeFrequency: 'monthly' as const, lastModified: UPDATED }));
  return [...canonical, ...capabilities, ...docs, ...showcase];
}
