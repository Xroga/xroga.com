# Xroga SEO implementation report

Release date: 2026-09-10. Scope: public SEO foundation and priority seed content only; no workspace, billing, authentication, or backend redesign.

## A. Status

- Implemented: yes.
- Tested locally: yes.
- Production target: the existing Xroga Vercel project and `https://xroga.com`; the deployment record and final live crawl are reported with the release.
- Search Console access: unavailable — **NEEDS SEARCH CONSOLE**.

## B. Technical SEO

- Preserved one HTTPS canonical host and self-canonicals through `buildMetadata`.
- Preserved production/preview robots policy; user-generated `/share/*` is now always `noindex` and absent from the sitemap.
- Expanded the sitemap only with published, canonical seed pages.
- Corrected stale `llms.txt` and internal `/crypto-builder` links to `/crypto`.
- Corrected stale public crypto pricing from `$19 / 30 days` to `Xroga Pro · $25 / month`.
- Added static HTML, semantic headings, breadcrumbs, responsive layouts, source links, and contextual navigation to new routes.
- Kept legacy equivalent-route redirects permanent and out of the sitemap.

## C. Routes

Created: `/compare` plus six comparisons; `/alternatives` plus four alternatives pages; `/build` plus eight guides; `/build-with` plus six provider guides; `/blog` plus five articles; `/learn`; `/learn/production-readiness-checklist`; `/vibe-coding`; `/security`.

Improved: discovery files, sitemap, footer crawl paths, public route guard, share indexation, crypto pricing, and legacy internal links. No route was removed. Existing product/auth routes were not redesigned.

## D. Commercial SEO

The existing homepage and core AI product pages remain the product-category pillars. This release adds the vibe-coding and security pillars and links the existing AI App Builder, AI Coding Agent, AI Website Builder, pricing, showcase, docs, and integrations pages into the new evaluation graph.

## E. Programmatic architecture

Published typed factories: compare, alternatives, build, build-with, blog, and learn. Reserved but deliberately unpublished pending first-party evidence: stack, how-to, templates, and migrate. No glossary duplicate and no thin mass generation were added.

## F. Content and sources

Published five priority educational articles, six fair comparison pages, four multi-option alternatives pages, eight production-minded build guides, six integration-boundary guides, and one release checklist. Competitor facts were reviewed on 2026-09-09 against official Lovable, Bolt, Replit, Cursor, v0, and Windsurf documentation linked on each comparison page. No independent testing or ranking claim is made.

## G. Structured data

Used Organization, Person, WebSite, SoftwareApplication, WebPage/CollectionPage, BreadcrumbList, and Article where visible content supports them. Did not add AggregateRating, Review, HowTo rich-result markup, or SearchAction. The crawler parses JSON-LD on priority routes.

## H. Internal linking

Added crawlable hub-to-detail, detail-to-hub, comparison-to-alternative, guide-to-pillar, provider-to-security/docs, and article-to-commercial/checklist links. The shared footer exposes only the main hubs rather than dumping every seed URL into navigation. Automated checks reject broken priority links and obsolete canonical destinations.

## I. Performance and accessibility

New content is statically generated and uses no page-level client JavaScript. Desktop and 390px browser checks showed one H1, no horizontal overflow, no framework overlay, and no console errors. No trustworthy before/after field data was available — **NEEDS CRUX / SEARCH CONSOLE**.

## J. Validation

- `npm run lint --workspace=frontend`: PASS with pre-existing warnings outside the SEO templates.
- `npm run test:frontend`: PASS — 616/616.
- `npm run build --workspace=frontend`: PASS — 151 static/dynamic routes compiled.
- `npm run test:seo` against the production build: PASS — 20 priority public contracts, 6 private/noindex contracts, 5 discovery files, the complete sitemap, and priority internal links.
- `git diff --check`: PASS; Git line-ending notices only.
- Backend tests were not rerun because this release changes no backend or request metadata contract.

## K. External systems

- **NEEDS SEARCH CONSOLE:** submit/verify the sitemap, inspect priority URLs, review Page Indexing, Manual Actions, Security Issues, and Core Web Vitals.
- **NEEDS AHREFS:** import referring-domain and keyword-gap evidence if the owner wants an off-site queue.
- **NEEDS SEMRUSH:** optional; do not duplicate paid tooling without a defined decision.
- **NEEDS PRODUCT CONFIRMATION:** any future claim about new integrations, mobile/store publishing, benchmarks, reviews, certifications, or customer outcomes.

## L. Next 30 days

1. Collect GSC baselines and monitor indexation for the new canonical clusters.
2. Publish one redacted, reproducible repository build case study with real checks and deployment evidence.
3. Complete the “existing codebase agent workflow” and “prototype to production” briefs in `EDITORIAL_BRIEFS.md`.
4. Improve pages receiving impressions in positions 4–20; do not publish more pages merely to increase volume.
5. Begin owner-authorised entity profiles and selective outreach around the checklist/evidence asset.
