# Xroga SEO baseline

Baseline date: 2026-09-09. Canonical production origin: `https://xroga.com`.

## Repository findings

- Next.js 15 App Router frontend in `frontend`; React 18; npm workspaces.
- Marketing routes are server-rendered or statically generated. Interactive homepage sections remain client components beneath a server page that emits metadata and structured data.
- `buildMetadata` provides production canonicals, Open Graph, Twitter cards, authorship, and preview-deployment `noindex`.
- `robots.ts` allows public content, blocks application/auth/API surfaces, and declares the production sitemap.
- `sitemap.ts` enumerates public static routes and registry-backed capability, docs, showcase, and SEO seed routes.
- Root structured data describes Organization, Person, WebSite, and SoftwareApplication. Page templates add WebPage/CollectionPage, BreadcrumbList, and Article only where applicable.
- Google Analytics, Microsoft Clarity, and Ahrefs Analytics are present. Consent obligations and PII exclusion remain an owner responsibility.
- Search Console verification is environment-driven. No authorised Search Console dataset was available during implementation.

## Baseline gaps found

- No comparison, alternatives, build-guide, integration-guide, blog, vibe-coding, security, or production-readiness content architecture.
- `llms.txt` linked to a redirected crypto URL and a nonexistent video route.
- Public user-generated share URLs could become indexable.
- The existing crawler contract did not cover the new high-intent route graph.
- No repository SEO implementation/KPI/content-governance report set.

## Implemented foundation

- Added hand-authored, statically generated seed pages under `/compare`, `/alternatives`, `/build`, `/build-with`, `/blog`, and `/learn`.
- Added `/vibe-coding` and `/security` pillars.
- Added source verification dates and official source URLs to comparisons.
- Added self-canonicals, unique metadata, crawlable breadcrumbs, WebPage/CollectionPage/Article/Breadcrumb structured data, contextual links, and sitemap entries.
- Set all user-generated `/share/*` content to `noindex`; it remains out of the sitemap.
- Corrected discovery-file links and expanded automated crawl contracts.

## Measurements

No trustworthy pre-change GSC, CrUX, Ahrefs, or Semrush export was available. Performance and traffic deltas are therefore marked **NEEDS SEARCH CONSOLE / CRUX** rather than invented. The build-time and browser crawl results belong in `IMPLEMENTATION_REPORT.md` after release verification.
