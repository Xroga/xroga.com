# Search platform property handoff

## Google Search Console

- Preferred property: domain property for `xroga.com`.
- Submit: `https://xroga.com/sitemap.xml`.
- Verify: homepage canonical, HTTP→HTTPS, non-www/www policy, priority URL indexing, Core Web Vitals, manual actions, security issues, and the Generative AI performance report where available.
- Current task status: authorised data connection requires reauthentication, so live GSC evidence was not available.

## Bing Webmaster Tools

- Add and verify `xroga.com`, import from Search Console if appropriate, submit the same sitemap, and inspect crawl/index reports.
- Configure IndexNow only with a domain-hosted key and submit changed canonical URLs. The repository script refuses requests without `INDEXNOW_KEY` and `INDEXNOW_KEY_LOCATION`.

## Handoff evidence

Store screenshots or exports with capture dates outside source control if they contain account data. Record property owner, verification method, submitted sitemap status, and the first valid reporting date. Never store verification secrets in documentation.
