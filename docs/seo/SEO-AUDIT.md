# XROGA AI SEO forensic audit

Audit date: 2026-08-11. Canonical origin: `https://xroga.com`. Scope: repository plus a signed-out production crawl. Quantitative ranking, volume, difficulty, traffic, and backlink claims are excluded because no connected SEO dataset supplied them.

## Architecture

- Next.js 15.5 App Router in `frontend/`, deployed through the existing Vercel workflow. Public pages are server-rendered or prerendered; interactive client components hydrate after meaningful HTML is sent.
- Metadata uses the Next.js Metadata API through `frontend/src/lib/seo.ts`. Dynamic docs, feature, and showcase templates use `generateMetadata`.
- `robots.ts`, `sitemap.ts`, `manifest.ts`, file-based favicon/icon assets, and `opengraph-image.tsx` provide discovery and branding.
- Local fonts use `next/font/local`; images generally use Next image handling or CSS backgrounds. Security and cache-related headers are defined in `next.config.mjs`.
- Supabase middleware protects application routes. Public-route allowlisting is therefore SEO-critical.
- No international public route variants or `hreflang` implementation exist. Dashboard language preferences do not create localized indexable URLs.
- No public blog or paginated editorial archive exists. Docs, research, community, showcase, and capability templates are the current content systems.
- Search Console verification is supported through `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`; no token was observed in the live homepage on the audit date.

## Route/template audit

| Template / URLs | Status and indexability | Metadata / canonical / H1 | Content and links | Schema | Risk / action |
|---|---|---|---|---|---|
| Homepage `/` | 200, indexable | Unique title/description, self-canonical, one H1 | Strong SSR text and links to product, docs, company, pricing, contact, legal | Core entity graph plus WebPage | GOOD / PRESERVE; normalize entity naming and IDs |
| Capability pages (six top-level routes) | 200, indexable, sitemap | Unique intent, canonical, one H1 | Substantial outcomes/process/limits and related links | WebPage added, connected to site/org | GOOD after repair |
| `/features` | 200, indexable, sitemap | Unique metadata/canonical/H1 | Hub links to all canonical capability pages | CollectionPage added | GOOD |
| Legacy `/features/*` and typo routes | permanent redirects | Destination owns canonical | Internal links mostly target canonical routes | none needed | GOOD / PRESERVE redirects; avoid re-indexing legacy pages |
| `/docs` and `/docs/[slug]` | 200, indexable, sitemap | Unique generated metadata and H1 | Directory prevents orphan docs | CollectionPage on hub; page schema can be extended per doc later | MEDIUM: add author/update evidence only when maintained |
| `/pricing` | 200, indexable | Child metadata was at risk of being narrowed by a redundant layout title | Visible plan terms | WebPage plus software Offer | HIGH fixed by removing layout override |
| `/about` | 200, indexable | Unique metadata/canonical/H1 | Clear product, founder, contact, official links | Duplicate disconnected Organization replaced by AboutPage linked to canonical graph | HIGH fixed |
| `/contact`, legal pages | 200, indexable, sitemap | Unique metadata/canonicals/H1 | Contact and policy cross-links | ContactPage on contact | GOOD; consider legal-page schema only if useful |
| `/integrations` | 200, indexable | Unique metadata/canonical/H1 | Links to supported integration flows | CollectionPage linked to graph | MEDIUM: ensure visible catalog claims remain operationally accurate |
| `/crypto-builder`, `/game-builder` | 200, indexable, sitemap | Unique metadata/canonical/H1 | Strong product-specific content and internal links | SoftwareApplication plus core graph | HIGH: live crypto metadata length fixed |
| `/research/*` | 200, indexable, sitemap | Unique metadata/canonical/H1 | Original sourced asset, useful for links | Basic site graph | GOOD; expand only with reproducible evidence |
| `/showcase` and detail template | 200, indexable, sitemap | Unique static/dynamic metadata | Hub prevents orphan details; previews are separate | Basic site graph | GOOD; preview routes remain noindex |
| Community posts | public route; post template currently noindex | Prevents thin/user-generated pages from accidental indexing | Hub is indexable | none required | GOOD / PRESERVE until moderation and durable content justify indexing |
| Auth, workspace, dashboard, settings, admin, callbacks | protected/noindex | Private metadata contracts | Not sitemap-listed | site graph is harmless but not an indexing signal | GOOD / PRESERVE |
| API routes | not pages, robots-disallowed | n/a | n/a | n/a | GOOD |

## Findings by severity

### Critical

None requiring URL removal or architectural rewrite.

### High

1. The canonical organization builder emitted `SoftwareApplication`, so XROGA AI had no stable top-level Organization entity. Fixed with `#organization`, `#website`, `#software`, `#founder`, and `#logo` references.
2. Organization `sameAs` used internal About/Contact URLs rather than external identity profiles. Fixed to the repository-verified X and GitHub URLs only.
3. `/opengraph-image` was intercepted by auth middleware and returned `307 /auth/login` to signed-out crawlers. Fixed in middleware matching and the public-route contract.
4. `/about` emitted a second Organization whose URL was the About page and whose entity was disconnected. Replaced with a linked AboutPage.
5. Live `/crypto-builder` metadata exceeded the regression bounds. Shortened without changing its URL or search intent.

### Medium

1. Site name varied between `Xroga AI` and `XROGA AI`. Canonical structured and site-name signals now use `XROGA AI`; natural prose is not mechanically rewritten.
2. Global meta keywords mixed unrelated commercial terms, typos, founder terms, and every route intent. Global injection was removed; narrowly supplied page keywords remain for compatibility, though Google does not require them.
3. Static sitemap entries all claimed the same last modification date. Unverifiable static `lastmod` values were removed; maintained docs retain their content dates.
4. Preview deployments could inherit indexable metadata. Preview builds now emit `noindex` and a disallow-all robots response.
5. The old regression script checked broad bounds but not exact contracts, OG parity, required entity types/IDs, the OG image, or the manifest. It now reads machine-readable contracts.

### Low

- `www.xroga.com` did not resolve during the audit. Configure it as a hosting-domain redirect if the owner controls DNS; do not create application-level assumptions before DNS exists.
- Search Console verification was not visible in production. The existing environment-variable mechanism is preserved.
- Add measured Core Web Vitals monitoring after deployment; repository inspection alone cannot establish field CWV.

## GOOD / PRESERVE

Preserve all current public slugs, permanent redirect mappings, canonical capability pages, private-route `noindex`, legal/contact pages, official favicon art, OG/Twitter coverage, server-rendered public copy, docs and research URLs, sitemap discovery, CSP/security headers, and the Search Console verification hook.

## Technical quality and performance

- Semantic H1 contracts exist for important routes. The crawl test rejects missing/multiple H1s and images without `alt`.
- Local fonts avoid third-party font blocking. Existing background WebP variants and Next image usage reduce transfer/CLS risk.
- The homepage is interactive but its meaningful headings, copy, and links are present in initial HTML. No framework rewrite is justified.
- Remaining performance validation must use a production build and field/controlled browser metrics. Treat Lighthouse estimates as lab data, not Search Console field results.

## Canonical and indexing decisions

`https://xroga.com` is the sole configured origin. Every indexable page self-canonicalizes. HTTP redirects to HTTPS. Private, auth, preview, callback, and API surfaces are excluded from the sitemap; private/auth pages are noindex. No unrelated page is canonicalized to the homepage.
