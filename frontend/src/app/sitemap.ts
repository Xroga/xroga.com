import type { MetadataRoute } from 'next';
import { CAPABILITY_PAGES } from '@/lib/capabilityPages';
import { DOC_PAGES } from '@/lib/docsContent';
import { SITE_URL } from '@/lib/seo';
import { SHOWCASE_TEMPLATES } from '@/lib/showcase/registry';
import { ALTERNATIVES, BLOG_ARTICLES, BUILD_GUIDES, COMPARISONS, INTEGRATION_GUIDES } from '@/lib/seoGrowthContent';

const routes = [
  ['', 1, 'daily'], ['/features', .95, 'weekly'], ['/features/ai-chat', .96, 'weekly'], ['/pricing', .92, 'weekly'], ['/integrations', .88, 'monthly'],
  ['/community', .9, 'daily'], ['/docs', .92, 'weekly'], ['/crypto', .94, 'weekly'], ['/game-builder', .94, 'weekly'],
  ['/research', .82, 'monthly'], ['/research/web3-hackathon-winning-patterns', .9, 'monthly'],
  ['/about', .78, 'monthly'], ['/contact', .65, 'yearly'], ['/terms', .45, 'yearly'], ['/privacy', .45, 'yearly'], ['/refund', .45, 'yearly'],
  ['/showcase', .93, 'weekly'],
  ['/compare', .92, 'weekly'], ['/alternatives', .88, 'weekly'], ['/build', .9, 'weekly'],
  ['/build-with', .86, 'monthly'], ['/blog', .9, 'weekly'], ['/learn', .84, 'monthly'],
  ['/learn/production-readiness-checklist', .9, 'monthly'], ['/vibe-coding', .92, 'monthly'], ['/security', .82, 'monthly'],
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const canonical = routes.map(([path, priority, changeFrequency]) => ({ url: `${SITE_URL}${path}`, priority, changeFrequency }));
  const capabilities = Object.values(CAPABILITY_PAGES).map((page) => ({ url: `${SITE_URL}/${page.slug}`, priority: .9, changeFrequency: 'monthly' as const }));
  const docs = DOC_PAGES.map((page) => ({ url: `${SITE_URL}/docs/${page.slug}`, priority: .72, changeFrequency: 'monthly' as const, lastModified: new Date(`${page.updated}T00:00:00Z`) }));
  // Detail pages only — the bare /preview surfaces are intentionally not indexed.
  const showcase = SHOWCASE_TEMPLATES.map((template) => ({ url: `${SITE_URL}/showcase/${template.slug}`, priority: .85, changeFrequency: 'monthly' as const }));
  const growth = [
    ...COMPARISONS.map(({ slug }) => `/compare/${slug}`),
    ...ALTERNATIVES.map(({ slug }) => `/alternatives/${slug}`),
    ...BUILD_GUIDES.map(({ slug }) => `/build/${slug}`),
    ...INTEGRATION_GUIDES.map(({ slug }) => `/build-with/${slug}`),
    ...BLOG_ARTICLES.map(({ slug }) => `/blog/${slug}`),
  ].map((path) => ({ url: `${SITE_URL}${path}`, priority: .84, changeFrequency: 'monthly' as const, lastModified: new Date('2026-09-09T00:00:00Z') }));
  return [...canonical, ...capabilities, ...docs, ...showcase, ...growth];
}
