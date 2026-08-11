# Google Search Console setup for xroga.com

The code preserves `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`. The live homepage did not expose a Google verification meta tag on 2026-08-11, so verification remains an owner task. Never commit the token.

1. In Search Console, add and verify the Domain property `xroga.com` using the DNS TXT method.
2. If using the HTML-tag method as a secondary verification, set `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` in the production hosting environment and redeploy.
3. Submit `https://xroga.com/sitemap.xml`.
4. Inspect `https://xroga.com/`, test the live URL, confirm Google-selected canonical, and request indexing only after deployment checks pass.
5. Repeat inspection for `/ai-coding-agent`, `/ai-app-builder`, `/github-ai-coding-agent`, `/pricing`, `/about`, and `/docs`.
6. Check Page indexing for accidental `noindex`, duplicates, crawled-not-indexed pages, redirects, and soft 404s.
7. Review structured-data enhancements and test the emitted JSON-LD with Schema Markup Validator. Organization/WebSite markup may not create a Rich Results report.
8. Review Core Web Vitals after enough field data exists; separate mobile and desktop issues.
9. In Performance, monitor branded queries `xroga`, `xroga ai`, spelling variants, and branded page intent such as pricing/docs.
10. Monitor non-branded query groups: AI coding agent, repository AI agent, AI app builder, GitHub coding agent, Vercel AI deployment.
11. Compare page/query pairs for cannibalization; move detail to the mapped canonical page instead of creating another page.
12. Review Manual actions and Security issues monthly and after any incident.
13. Configure Bing Webmaster Tools separately and submit the same canonical sitemap if desired.

After deployment, record the date, submitted sitemap status, sampled URL-inspection results, and any Google-selected canonical differences in an owner-only operational log. Do not store Search Console credentials in the repository.
