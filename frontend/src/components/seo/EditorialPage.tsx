import Link from 'next/link';
import { Logo } from '@/components/layout/Logo';
import { MarketingFooter } from '@/components/layout/MarketingFooter';
import { buildWebPageJsonLd, ORGANIZATION_ID, SITE_URL } from '@/lib/seo';
import type { ContentSection, SourceLink } from '@/lib/seoGrowthContent';
import '@/styles/seo-editorial.css';
import '@/styles/homepage-coding.css';

type Crumb = { label: string; href: string };

function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}

export function EditorialPage({
  path, title, description, eyebrow, intro, sections, breadcrumbs, related = [], sources = [],
  updated, article = false, note,
}: {
  path: string; title: string; description: string; eyebrow: string; intro: string;
  sections: ContentSection[]; breadcrumbs: Crumb[]; related?: string[]; sources?: SourceLink[];
  updated?: string; article?: boolean; note?: string;
}) {
  const url = `${SITE_URL}${path}`;
  const crumbs = [{ label: 'Home', href: '/' }, ...breadcrumbs];
  const pageSchema = article
    ? {
        '@context': 'https://schema.org', '@type': 'Article', '@id': `${url}#article`,
        headline: title, description, url, datePublished: '2026-09-09', dateModified: updated ?? '2026-09-09',
        author: { '@type': 'Person', name: 'Muhammad Ibrahim', url: `${SITE_URL}/about` },
        publisher: { '@id': ORGANIZATION_ID }, mainEntityOfPage: { '@id': `${url}#webpage` },
      }
    : buildWebPageJsonLd({ path, name: title, description });
  const breadcrumbSchema = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem', position: index + 1, name: crumb.label, item: `${SITE_URL}${crumb.href}`,
    })),
  };

  return (
    <main className="xv-seo-page">
      <JsonLd data={pageSchema} />
      {article && <JsonLd data={buildWebPageJsonLd({ path, name: title, description })} />}
      <JsonLd data={breadcrumbSchema} />
      <header className="xv-seo-header">
        <Logo href="/" variant="homepage" height={32} />
        <nav aria-label="Main navigation">
          <Link href="/ai-app-builder">AI App Builder</Link>
          <Link href="/compare">Compare</Link>
          <Link href="/blog">Guides</Link>
          <Link href="/pricing">Pricing</Link>
          <Link className="xv-seo-header__cta" href="/auth/signup">Start free</Link>
        </nav>
      </header>

      <div className="xv-seo-shell">
        <nav className="xv-seo-crumbs" aria-label="Breadcrumb">
          {crumbs.map((crumb, index) => <span key={crumb.href}>{index > 0 && <i aria-hidden="true">/</i>}<Link href={crumb.href}>{crumb.label}</Link></span>)}
        </nav>
        <article>
          <header className="xv-seo-hero">
            <p className="xv-seo-eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p className="xv-seo-dek">{intro}</p>
            <div className="xv-seo-actions">
              <Link href="/auth/signup">Start building free</Link>
              <Link href="/showcase">See working examples</Link>
            </div>
            {updated && <p className="xv-seo-updated">Reviewed against official sources · {updated}</p>}
          </header>

          {note && <aside className="xv-seo-note"><strong>Decision note</strong><p>{note}</p></aside>}

          <div className="xv-seo-layout">
            <aside className="xv-seo-toc" aria-label="On this page">
              <strong>On this page</strong>
              {sections.map((section, index) => <a key={section.heading} href={`#section-${index + 1}`}>{section.heading}</a>)}
            </aside>
            <div className="xv-seo-content">
              {sections.map((section, index) => (
                <section key={section.heading} id={`section-${index + 1}`}>
                  <p className="xv-seo-section-number">0{index + 1}</p>
                  <h2>{section.heading}</h2>
                  {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  {section.bullets && <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}
                </section>
              ))}
            </div>
          </div>

          {sources.length > 0 && (
            <section className="xv-seo-sources" aria-labelledby="source-heading">
              <h2 id="source-heading">Primary sources</h2>
              <p>Product capabilities change. These official pages were used for the factual statements above; verify them again before making a purchasing decision.</p>
              <ul>{sources.map((source) => <li key={source.href}><a href={source.href} target="_blank" rel="noreferrer">{source.label}</a></li>)}</ul>
            </section>
          )}

          <section className="xv-seo-related" aria-labelledby="related-heading">
            <h2 id="related-heading">Continue your evaluation</h2>
            <div>{related.map((href) => <Link key={href} href={href}>{labelFor(href)} <span aria-hidden="true">↗</span></Link>)}</div>
          </section>
        </article>
      </div>
      <MarketingFooter />
    </main>
  );
}

export function EditorialHub({
  path, title, description, eyebrow, intro, items, breadcrumbs = [],
}: {
  path: string; title: string; description: string; eyebrow: string; intro: string;
  items: Array<{ href: string; title: string; description: string; meta?: string }>;
  breadcrumbs?: Crumb[];
}) {
  return (
    <main className="xv-seo-page">
      <JsonLd data={buildWebPageJsonLd({ path, name: title, description, type: 'CollectionPage' })} />
      <header className="xv-seo-header">
        <Logo href="/" variant="homepage" height={32} />
        <nav aria-label="Main navigation"><Link href="/ai-app-builder">AI App Builder</Link><Link href="/compare">Compare</Link><Link href="/blog">Guides</Link><Link href="/pricing">Pricing</Link><Link className="xv-seo-header__cta" href="/auth/signup">Start free</Link></nav>
      </header>
      <div className="xv-seo-shell">
        <nav className="xv-seo-crumbs" aria-label="Breadcrumb"><Link href="/">Home</Link>{breadcrumbs.map((crumb) => <span key={crumb.href}><i>/</i><Link href={crumb.href}>{crumb.label}</Link></span>)}</nav>
        <header className="xv-seo-hero"><p className="xv-seo-eyebrow">{eyebrow}</p><h1>{title}</h1><p className="xv-seo-dek">{intro}</p></header>
        <section className="xv-seo-card-grid" aria-label={title}>
          {items.map((item, index) => <Link href={item.href} key={item.href}><span>{String(index + 1).padStart(2, '0')}</span><h2>{item.title}</h2><p>{item.description}</p>{item.meta && <small>{item.meta}</small>}</Link>)}
        </section>
      </div>
      <MarketingFooter />
    </main>
  );
}

function labelFor(href: string) {
  const labels: Record<string, string> = {
    '/ai-app-builder': 'AI app builder', '/ai-coding-agent': 'AI coding agent', '/ai-website-builder': 'AI website builder',
    '/showcase': 'Product showcase', '/compare': 'All comparisons', '/pricing': 'Plans and pricing', '/integrations': 'Integrations',
    '/security': 'Security approach', '/docs': 'Documentation', '/vibe-coding': 'Vibe coding guide',
    '/learn/production-readiness-checklist': 'Production-readiness checklist', '/blog/what-is-vibe-coding': 'What is vibe coding?',
    '/blog/best-vibe-coding-tools': 'Choosing a vibe coding tool', '/alternatives/replit-alternative': 'Replit alternatives',
    '/compare/xroga-vs-replit': 'Xroga vs Replit', '/build/landing-page': 'Build a landing page',
  };
  return labels[href] ?? href.split('/').filter(Boolean).pop()?.replace(/-/g, ' ') ?? 'Learn more';
}
