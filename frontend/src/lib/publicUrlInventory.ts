import { CAPABILITY_PAGES } from './capabilityPages';
import { DOC_PAGES } from './docsContent';
import { SHOWCASE_TEMPLATES } from './showcase/registry';
import {
  ALTERNATIVES,
  BLOG_ARTICLES,
  BUILD_GUIDES,
  COMPARISONS,
  INTEGRATION_GUIDES,
} from './seoGrowthContent';
import { MIGRATION_GUIDES, STACK_GUIDES } from './seoExpansionContent';
// The shared .mjs registry is executable by Next and the standalone audit CLI.
import { redirectRegistry } from '../../redirects.mjs';

const SITE_URL = 'https://xroga.com';

export type PublicUrlClassification =
  | 'PUBLIC_INDEXABLE'
  | 'PUBLIC_NOINDEX'
  | 'PRIVATE'
  | 'SYSTEM'
  | 'REDIRECT'
  | 'GONE'
  | 'UNKNOWN';

export type PublicUrlRecord = {
  path: string;
  canonical: string | null;
  classification: PublicUrlClassification;
  pageType: string;
  routeSource: string;
  contentSources: string[];
  manifestSource?: string;
  entityIds?: string[];
  topicIds?: string[];
  publishedAt?: string;
  updatedAt?: string;
  lastVerifiedAt?: string;
  sitemap: boolean;
  feed: 'blog' | 'research' | 'changelog' | null;
  priority?: number;
  changeFrequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
};

type StaticRow = readonly [
  path: string,
  pageType: string,
  routeSource: string,
  priority: number,
  changeFrequency: NonNullable<PublicUrlRecord['changeFrequency']>,
  updatedAt?: string,
  feed?: PublicUrlRecord['feed'],
];

const staticIndexable = [
  ['/', 'HOME', 'frontend/src/app/page.tsx', 1, 'daily', '2026-09-10'],
  ['/features', 'COLLECTION', 'frontend/src/app/features/page.tsx', .95, 'weekly'],
  ['/features/ai-chat', 'FEATURE', 'frontend/src/app/features/ai-chat/page.tsx', .96, 'weekly'],
  ['/pricing', 'PRICING', 'frontend/src/app/pricing/page.tsx', .92, 'weekly', '2026-09-09'],
  ['/integrations', 'COLLECTION', 'frontend/src/app/integrations/page.tsx', .88, 'monthly'],
  ['/community', 'COMMUNITY', 'frontend/src/app/community/page.tsx', .9, 'daily'],
  ['/docs', 'COLLECTION', 'frontend/src/app/docs/page.tsx', .92, 'weekly'],
  ['/crypto', 'PRODUCT', 'frontend/src/app/crypto/page.tsx', .94, 'weekly'],
  ['/game-builder', 'PRODUCT', 'frontend/src/app/game-builder/page.tsx', .94, 'weekly'],
  ['/software', 'PRODUCT', 'frontend/src/app/software/page.tsx', .82, 'monthly'],
  ['/research', 'COLLECTION', 'frontend/src/app/research/page.tsx', .82, 'monthly', '2026-08-30'],
  ['/research/web3-hackathon-winning-patterns', 'RESEARCH', 'frontend/src/app/research/web3-hackathon-winning-patterns/page.tsx', .9, 'monthly', '2026-08-30', 'research'],
  ['/about', 'ABOUT', 'frontend/src/app/about/page.tsx', .78, 'monthly'],
  ['/contact', 'CONTACT', 'frontend/src/app/contact/page.tsx', .65, 'yearly'],
  ['/terms', 'LEGAL', 'frontend/src/app/terms/page.tsx', .45, 'yearly'],
  ['/privacy', 'LEGAL', 'frontend/src/app/privacy/page.tsx', .45, 'yearly'],
  ['/refund', 'LEGAL', 'frontend/src/app/refund/page.tsx', .45, 'yearly'],
  ['/showcase', 'COLLECTION', 'frontend/src/app/showcase/page.tsx', .93, 'weekly'],
  ['/compare', 'COLLECTION', 'frontend/src/app/compare/page.tsx', .92, 'weekly'],
  ['/alternatives', 'COLLECTION', 'frontend/src/app/alternatives/page.tsx', .88, 'weekly'],
  ['/build', 'COLLECTION', 'frontend/src/app/build/page.tsx', .9, 'weekly'],
  ['/build-with', 'COLLECTION', 'frontend/src/app/build-with/page.tsx', .86, 'monthly'],
  ['/blog', 'COLLECTION', 'frontend/src/app/blog/page.tsx', .9, 'weekly'],
  ['/learn', 'COLLECTION', 'frontend/src/app/learn/page.tsx', .84, 'monthly'],
  ['/learn/production-readiness-checklist', 'GUIDE', 'frontend/src/app/learn/production-readiness-checklist/page.tsx', .9, 'monthly'],
  ['/vibe-coding', 'CATEGORY', 'frontend/src/app/vibe-coding/page.tsx', .92, 'monthly'],
  ['/security', 'TRUST', 'frontend/src/app/security/page.tsx', .82, 'monthly'],
  ['/stack', 'COLLECTION', 'frontend/src/app/stack/page.tsx', .88, 'monthly'],
  ['/migrate', 'COLLECTION', 'frontend/src/app/migrate/page.tsx', .88, 'monthly'],
  ['/tools', 'COLLECTION', 'frontend/src/app/tools/page.tsx', .86, 'monthly'],
  ['/tools/production-readiness-checker', 'TOOL', 'frontend/src/app/tools/production-readiness-checker/page.tsx', .92, 'monthly', '2026-09-22'],
  ['/changelog', 'CHANGELOG', 'frontend/src/app/changelog/page.tsx', .76, 'weekly', '2026-09-20', 'changelog'],
] as const satisfies readonly StaticRow[];

const record = (
  path: string,
  pageType: string,
  routeSource: string,
  contentSources: string[],
  options: Partial<PublicUrlRecord> = {},
): PublicUrlRecord => ({
  path,
  canonical: `${SITE_URL}${path}`,
  classification: 'PUBLIC_INDEXABLE',
  pageType,
  routeSource,
  contentSources,
  sitemap: true,
  feed: null,
  priority: .84,
  changeFrequency: 'monthly',
  ...options,
});

/**
 * The canonical normalized public URL inventory. Existing runtime registries remain
 * content-authoring sources; every discovery and publication system consumes this
 * adapter so they cannot disagree about which URLs are public and indexable.
 */
export function buildPublicUrlInventory(): PublicUrlRecord[] {
  const records: PublicUrlRecord[] = staticIndexable.map(([path, pageType, routeSource, priority, changeFrequency, updatedAt, feed]) =>
    record(path, pageType, routeSource, [routeSource], { priority, changeFrequency, updatedAt, feed: feed ?? null }),
  );

  records.push(
    ...Object.values(CAPABILITY_PAGES).map((page) => record(`/${page.slug}`, 'CAPABILITY', `frontend/src/app/${page.slug}/page.tsx`, ['frontend/src/lib/capabilityPages.ts'], { priority: .9 })),
    ...DOC_PAGES.map((page) => record(`/docs/${page.slug}`, 'DOCUMENTATION', 'frontend/src/app/docs/[slug]/page.tsx', ['frontend/src/lib/docsContent.ts'], { priority: .72, updatedAt: page.updated })),
    ...SHOWCASE_TEMPLATES.map((template) => record(`/showcase/${template.slug}`, 'SHOWCASE', 'frontend/src/app/showcase/[slug]/page.tsx', ['frontend/src/lib/showcase/registry.ts'], { priority: .85 })),
    ...COMPARISONS.map((page) => record(`/compare/${page.slug}`, 'COMPARISON', 'frontend/src/app/compare/[slug]/page.tsx', ['frontend/src/lib/seoGrowthContent.ts'], { updatedAt: page.lastVerified })),
    ...ALTERNATIVES.map((page) => record(`/alternatives/${page.slug}`, 'ALTERNATIVE', 'frontend/src/app/alternatives/[slug]/page.tsx', ['frontend/src/lib/seoGrowthContent.ts'])),
    ...BUILD_GUIDES.map((page) => record(`/build/${page.slug}`, 'GUIDE', 'frontend/src/app/build/[slug]/page.tsx', ['frontend/src/lib/seoGrowthContent.ts'])),
    ...INTEGRATION_GUIDES.map((page) => record(`/build-with/${page.slug}`, 'INTEGRATION', 'frontend/src/app/build-with/[slug]/page.tsx', ['frontend/src/lib/seoGrowthContent.ts'], {
      manifestSource: page.slug === 'github' ? 'content/manifests/build-with-github.json' : undefined,
      updatedAt: page.slug === 'github' ? '2026-09-22' : '2026-09-09',
    })),
    ...BLOG_ARTICLES.map((page) => record(`/blog/${page.slug}`, 'BLOG', 'frontend/src/app/blog/[slug]/page.tsx', ['frontend/src/lib/seoGrowthContent.ts'], {
      publishedAt: page.updated ?? '2026-09-09', updatedAt: page.updated ?? '2026-09-09', feed: 'blog',
    })),
    ...STACK_GUIDES.map((page) => record(`/stack/${page.slug}`, 'STACK', 'frontend/src/app/stack/[slug]/page.tsx', ['frontend/src/lib/seoExpansionContent.ts'], { updatedAt: page.reviewed })),
    ...MIGRATION_GUIDES.map((page) => record(`/migrate/${page.slug}`, 'MIGRATION', 'frontend/src/app/migrate/[slug]/page.tsx', ['frontend/src/lib/seoExpansionContent.ts'], { updatedAt: page.reviewed })),
  );

  const tool = records.find((item) => item.path === '/tools/production-readiness-checker');
  if (tool) tool.manifestSource = 'content/manifests/production-readiness-checker.json';

  const nonIndexable: PublicUrlRecord[] = [
    ['/workspace', 'PRIVATE'], ['/dashboard', 'PRIVATE'], ['/settings', 'PRIVATE'], ['/admin', 'PRIVATE'],
    ['/auth/login', 'PRIVATE'], ['/auth/signup', 'PRIVATE'], ['/auth/github/callback', 'PRIVATE'], ['/onboarding', 'PRIVATE'], ['/preview', 'PRIVATE'], ['/terminal', 'PRIVATE'],
    ['/image', 'PUBLIC_NOINDEX'], ['/cybersecurity', 'PUBLIC_NOINDEX'], ['/community/[postId]', 'PUBLIC_NOINDEX'], ['/ref/[code]', 'PUBLIC_NOINDEX'], ['/share/[token]', 'PUBLIC_NOINDEX'], ['/api', 'SYSTEM'], ['/robots.txt', 'SYSTEM'],
    ['/sitemap.xml', 'SYSTEM'], ['/llms.txt', 'SYSTEM'], ['/blog/feed.xml', 'SYSTEM'],
    ['/research/feed.xml', 'SYSTEM'], ['/changelog/feed.xml', 'SYSTEM'],
    ['/research/web3-hackathon-sources.json', 'SYSTEM'], ['/research/web3-hackathon-sources.csv', 'SYSTEM'],
    ...SHOWCASE_TEMPLATES.map((template) => [`/showcase/${template.slug}/preview`, 'PUBLIC_NOINDEX'] as const),
  ].map(([path, classification]) => ({
    path, canonical: null, classification: classification as PublicUrlClassification,
    pageType: classification, routeSource: 'frontend/src/app', contentSources: [], sitemap: false, feed: null,
  }));

  const redirects: PublicUrlRecord[] = redirectRegistry.map((item: { source: string }) => ({
    path: item.source, canonical: null, classification: 'REDIRECT', pageType: 'REDIRECT',
    routeSource: 'frontend/redirects.mjs', contentSources: ['frontend/redirects.mjs'], sitemap: false, feed: null,
  }));
  const combined = [...records, ...nonIndexable, ...redirects];
  const seen = new Set<string>();
  for (const item of combined) {
    if (seen.has(item.path)) throw new Error(`Duplicate public URL inventory path: ${item.path}`);
    seen.add(item.path);
  }
  return combined.sort((left, right) => left.path.localeCompare(right.path));
}

export const PUBLIC_URL_INVENTORY = buildPublicUrlInventory();
export const INDEXABLE_PUBLIC_URLS = PUBLIC_URL_INVENTORY.filter((record) => record.classification === 'PUBLIC_INDEXABLE');

export function buildSitemapRecords() {
  return INDEXABLE_PUBLIC_URLS.map((record) => ({
    url: record.canonical!,
    priority: record.priority,
    changeFrequency: record.changeFrequency,
    ...(record.updatedAt ? { lastModified: new Date(`${record.updatedAt}T00:00:00Z`) } : {}),
  }));
}
