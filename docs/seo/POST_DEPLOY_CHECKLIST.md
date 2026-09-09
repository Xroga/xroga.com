# Post-deploy SEO checklist

1. Confirm the production deployment SHA and `https://xroga.com` alias.
2. Crawl `/`, `/pricing`, `/features`, the three AI pillars, `/vibe-coding`, `/compare`, `/blog`, every new seed detail, `robots.txt`, `sitemap.xml`, and `llms.txt`.
3. Verify 200 status, one H1, unique title/description, self-canonical, OG image, index directive, valid JSON-LD, and no broken internal links.
4. Verify workspace/dashboard/auth remain `noindex` and `/share/*` is `noindex,follow` and absent from sitemap.
5. In Search Console, submit `https://xroga.com/sitemap.xml` once and inspect only the most important changed URLs. Do not spam Request Indexing.
6. Review Page Indexing, Manual Actions, Security Issues, Core Web Vitals, and applicable enhancement reports.
7. Annotate the release in analytics. Check consent and ensure no PII enters GA4 or Clarity.
8. After 7, 14, and 30 days, compare non-brand impressions, indexed priority pages, query distribution, and qualified signups. Improve pages with evidence; do not change dates without substantive updates.
