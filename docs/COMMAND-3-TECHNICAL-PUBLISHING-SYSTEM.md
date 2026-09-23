# Command 3 technical publishing system

## Scope and architecture

Command 3 converts reviewed Command 1/2 assets into verifiable public delivery. It does not generate SEO pages. The normalized URL inventory in `frontend/src/lib/publicUrlInventory.ts` adapts existing runtime registries and manifest-backed assets into one contract consumed by sitemap generation, changed-URL mapping, publication planning, live verification, link analysis, drift detection, and receipts.

The publication lifecycle distinguishes authored content from deployed and discoverable content. Supported states run from `DRAFT` through review, build, Preview, merge, deployment, `LIVE_VERIFIED`, discovery, monitoring, refresh, drift, and retirement. A page does not become `LIVE_VERIFIED` until its required live checks pass.

## Publication eligibility

Manifest-backed assets require an `INDEX` manifest, quality score of at least 80, evidence and claims, public-safe evidence and visuals, and an exact canonical match. Runtime-authored pages remain supported through the normalized inventory. Private, noindex, system, redirect, unknown, and gone routes cannot enter an indexable publication plan.

Failures close publication for unsupported claims, private exposure, bad canonical, noindex, wrong route, confirmed 404/5xx, or insufficient server-visible content. IndexNow unavailability, absent GSC credentials, and transient source/network failures remain explicit warnings or `NO_DATA`; they do not become fabricated zeros or false success.

## URL registry, dependency graph, and changed URLs

Every record identifies its route source, content sources, optional manifest, classification, canonical, type, dates, sitemap/feed membership, and conservative crawl metadata. Command 1 facts and Command 2 sources/claims form the dependency graph. `growth:changed-urls` maps a Git diff into directly changed URLs, dependent URLs, global impact, and unknown impact. Global layouts and canonical infrastructure intentionally fan out; an unrelated backend test or CSS-only deploy does not manufacture content dates.

## Sitemap and lastmod

`frontend/src/app/sitemap.ts` is a projection of the normalized inventory. It includes only canonical `PUBLIC_INDEXABLE` records. Private, preview, system, noindex, redirect, and placeholder paths are excluded. Known content dates come from reviewed registries or certified manifests; unknown dates are omitted. Deployment time is never used as `lastmod`.

One sitemap remains appropriate at the present URL count. The inventory includes page types so it can later be partitioned into page, blog, research, and docs sitemaps without another state model.

## Feeds

Standards-compliant RSS is exposed at `/blog/feed.xml`, `/research/feed.xml`, and `/changelog/feed.xml`. Items are real public assets with stable canonical GUIDs, publication/update dates, summaries, and authors. Duplicate GUIDs fail generation. Drafts and private/noindex pages are not inputs.

## Crawlers and robots

Crawler purposes are separate: `TRADITIONAL_SEARCH`, `SEARCH_RETRIEVAL`, `USER_INITIATED_FETCH`, and `MODEL_TRAINING`. Search access is not inferred from training access. The policy was reverified on 2026-09-22 against official guidance:

- Googlebot: https://developers.google.com/search/docs/crawling-indexing/googlebot
- Bingbot: https://www.bing.com/webmasters/help/which-crawlers-does-bing-use-8c184ec0
- OpenAI crawlers: https://developers.openai.com/api/docs/bots
- Perplexity crawlers: https://docs.perplexity.ai/docs/resources/perplexity-crawlers
- Anthropic crawlers: https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler

Production robots explicitly permits public retrieval for Googlebot, Bingbot, OAI-SearchBot, PerplexityBot, and Claude-SearchBot while repeating the private-path exclusions. Preview continues to disallow all crawling. GPTBot and ClaudeBot remain governed by the existing wildcard public policy; their independent training policy is deliberately recorded as an owner decision, not conflated with search.

User-Agent diagnostics are a safe signal for obvious 403/429/challenge behavior, not proof of crawler identity. Real bot verification requires provider IP/rDNS guidance and infrastructure logs. WAF configuration is outside repository authority and is reported as external configuration when a genuine crawler is blocked.

## Renderability, canonical, indexability, schema, and links

The verifier reads bounded server HTML and checks status, redirect destination, content type, title, description, one H1, meaningful text, canonical, meta robots, `X-Robots-Tag`, structured-data parseability, semantic landmarks, critical links, response duration, challenge signatures, and sitemap presence. It classifies network uncertainty separately from confirmed failures. Link-graph analysis reports broken internal targets, orphans, and click depth. Soft-404 detection requires a 200 response plus an error-like or empty body.

Preview paths remain noindex/disallowed and are never submitted. Redirects are centralized in `frontend/redirects.mjs`; routing and audits consume the same list. Loops, self-redirects, and unsafe private destinations fail validation. A single hallucinated path does not create a redirect—referral evidence and an unambiguous destination require human review.

`llms.txt` remains a compact map to real public URLs. It is not described as a ranking factor or substitute for crawlability. Its links are validated against the normalized inventory.

## IndexNow and Google

IndexNow is eligible only after a meaningfully changed canonical same-site page is live, indexable, 200, and verified. Default behavior is dry-run. Submission needs the existing domain-hosted key configuration, retries only bounded transient failures, never stores the key, and writes sanitized evidence. Missing configuration is `UNAVAILABLE`, not a publication blocker.

IndexNow is not Google submission. Google discovery is recorded through crawlable internal links, sitemap membership, honest lastmod, and optional URL Inspection diagnostics. General pages are never sent to Google's restricted Indexing API. Without authorized URL Inspection credentials the state is `NO_DATA` and publishing continues.

## Receipts, fingerprints, and drift

Receipts contain URL/asset identity, release/deployment identifiers when known, live time, response and HTML signals, sitemap/feed state, IndexNow state, GSC state, content hash, expected fingerprint, lastmod, and an atomic result. Receipt identity is deterministic for the same canonical, commit, response status, and content fingerprint, so safe reruns do not invent another publication event. They exclude credentials, cookies, private previews, customer data, and private repository details. Generated receipts and crawls live under ignored `artifacts/growth-publishing/`.

Drift classes include live 404/5xx, old or wrong canonical, sitemap omission, noindex, insufficient server content, unexpected authentication/challenge, content fingerprint mismatch, and release SHA mismatch where a release endpoint is supplied. Application health and publication health remain separate.

## Freshness and product-content synchronization

The refresh queue consumes Command 2 claim due dates, source volatility, and manifest refresh dates. Product changes are categorized before any content work: pricing/billing, integrations, and product capability changes create review work; ordinary tests do not. Historical research is not silently rewritten. Future benchmarks must carry benchmark/tool/model/methodology versions and real run dates.

## Scheduled publication

Scheduled items are eligible only when due and explicitly `APPROVED` or `READY_TO_BUILD`. A due draft is blocked. This is an eligibility/state contract, not a scheduled content deployment executor: it does not build, merge, or publish an approved item by itself. A no-op does not trigger deployment. The repository does not auto-merge, expose previews, or roll back production. The weekly workflow is a technical/discovery audit and does not publish content; IndexNow is not invoked automatically by tests.

## Security

Network retrieval permits HTTP(S), exact approved origin, bounded redirects, 15-second timeout, and a 2 MB body. It rejects credentials, cross-origin redirects, unresolved/private/link-local destinations, and excessive redirect chains. Artifact names are basename-validated. Existing Command 2 repository path/symlink protections remain the authority for source imports.

## Commands

- `npm run growth:changed-urls -- --since=<git-ref> --json`
- `npm run growth:ship -- --since=<git-ref> --dry-run --json`
- `npm run growth:verify-live -- --base-url=https://xroga.com --json`
- `npm run growth:refresh -- --json`
- `npm run growth:sync -- --since=<git-ref> --json`
- `npm run growth:drift -- --base-url=https://xroga.com --dry-run --json`
- `npm run growth:feeds -- --base-url=https://xroga.com --json`
- `npm run growth:crawl -- --base-url=https://xroga.com --json`
- `npm run growth:crawlers -- --url=/build-with/github --json`
- `npm run growth:technical:validate -- --json`
- `npm run growth:status`
- `npm run test:growth:technical`

`growth:ship` is planning-only unless live verification is requested; IndexNow submission additionally requires `--submit-indexnow` and valid configuration. No command merges or deploys code.

## CI, production verification, and limits

The Growth technical publishing workflow runs deterministic contracts on affected pull requests/main pushes and bounded production discovery checks weekly or manually. Live checks do not run in ordinary unit CI. Production proof uses `/build-with/github` and `/tools/production-readiness-checker`, then representative home, pricing, capability, security, docs, blog, comparison, and research routes.

External unknowns remain honest: GSC URL Inspection needs authorized credentials; verified-crawler WAF logs/settings need hosting authority; IndexNow submission needs a domain key; search-engine indexing is never guaranteed. Command 4 may consume the receipts and status data but must independently audit Command 3.
