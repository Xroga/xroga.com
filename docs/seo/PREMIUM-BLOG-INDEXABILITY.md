# Premium blog discovery and indexability audit

Reviewed: 2026-11-20. Applies to the ten premium Xroga articles, not all pages.

## Facts checked in repository source
- `frontend/src/app/robots.ts` allows production Googlebot, bingbot, OAI-SearchBot, PerplexityBot and Claude-SearchBot under `/blog`; preview deployments are intentionally disallowed.
- `frontend/src/lib/seo.ts` gives production pages index/follow directives and the self-referencing canonical `https://xroga.com/blog/{slug}`.
- `frontend/src/app/sitemap.ts` generates canonical URLs from `publicUrlInventory.ts`. No second sitemap architecture is needed.
- `frontend/src/app/blog/[slug]/page.tsx` statically builds the ten articles and provides title, description, author and Article schema via the existing renderer.
- `frontend/src/app/blog/page.tsx` links to all ten articles using HTML anchors. Older related guides now link to specific new articles through the central content registry.
- `frontend/src/app/llms.txt/route.ts` lists the new guides. This is an optional informational reference for third-party AI systems; **Google Search does not use llms.txt to determine indexing or rankings**.

## External checks required
1. Verify `https://xroga.com/blog/base44-alternatives` and all nine other articles return HTTP 200 to an ordinary browser and Googlebot, without a JavaScript challenge, WAF block, login wall, `noindex` header or unexpected redirect.
2. Fetch `https://xroga.com/robots.txt` and `https://xroga.com/sitemap.xml` from an external host and confirm all ten canonical URLs are present. A code/build check alone is not live Googlebot fetch evidence.
3. In the **matching verified property** at `https://search.google.com/search-console`, open Sitemaps and submit `https://xroga.com/sitemap.xml`. If already submitted, check last fetched, warnings, and whether the new URLs appear in the served sitemap. Google may not associate a particular sitemap with an unprocessed URL immediately.
4. Use URL Inspection → **Test Live URL** for the canonical Base44 page, then **Request Indexing** if eligible. Repeat for remaining new URLs, avoiding repeat requests. This action requires an authorized Google Search Console user. The standard Indexing API must not be used for ordinary blog posts.
5. Wait for Google's own fetch/index decision, then inspect results after 7–14 days. `URL is unknown to Google` means not yet discovered/processed; it does not prove `noindex` or a robots block. Neither crawling nor indexing nor ranking is guaranteed.
6. Check any Cloudflare edge WAF/challenge rules for verified crawlers (do not blindly whitelist a user-agent string or disable security).

## AI visibility
- Keep article text in server-rendered HTML, with accurate headings, citations, links, examples and explicit author/date context.
- Robots decisions for OAI-SearchBot and other search crawlers are independent of whether ChatGPT, Claude or Google eventually cite a URL.
- Never claim AI recommendations or citations unless measured in real responses. `llms.txt` is optional and not a Google indexing workaround.

## Release discipline
- `npm run growth:technical:validate`
- `npm run growth:content:validate`
- `npm run lint`
- `npm run build --workspace=frontend`
- `npx tsx --test scripts/growth-publishing/premium-blog-discovery.test.ts`
- After the exact production deployment is READY, verify the 10 URLs, sitemap, canonicals, actual robots output and server access logs.
- The production code branch is `release/pricing-black-blue-production-20261119` (do not merge old `main` over the live release).
