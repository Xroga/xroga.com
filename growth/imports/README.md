# Organic intelligence imports

Place private or volatile exports here for a local intelligence refresh. This directory is ignored except for this guide and `examples/`.

Supported Command 1 contracts:

- Google Search Console CSV: `query,page,country,device,date,clicks,impressions,ctr,position`.
- AI prompt observations JSON: use the schema documented in `docs/seo/ORGANIC-INTELLIGENCE-SYSTEM.md`.
- Web mentions JSON: use the schema documented in the same guide.
- Platform visibility metrics JSON: `visibility-metrics.json`, using the `visibilityMetricSchema` contract. A missing record is `NO_DATA`, never an observed zero.
- Ahrefs: use a documented CSV/JSON export until verified API-plan access is available.

Command 2 adds two optional imports:

- `ahrefs-keywords.csv` or `ahrefs-keywords.json`. CSV requires `keyword`; supported optional headings include `country`, `volume`/`search volume`, `global volume`, `kd`/`keyword difficulty`, `traffic potential`, `cpc`, `parent topic`, `serp intent`, `serp features`, and `ranking urls`. Missing metrics remain `null`/`UNKNOWN`; they never become zero.
- `serp-observations.csv` or `serp-observations.json`. CSV requires `query,country,device,date,position,url,domain,title,content_type,observed_intent`; optional boolean composition fields include `video_present`, `forum_present`, `tool_present`, `comparison_present`, `commercial_pages_present`, `informational_pages_present`, and `weak_domain_present`.

Use only one format for each provider in one run. These are manual/authorized export paths; Xroga does not scrape Google and does not invent Ahrefs API endpoints or plan-limited metrics.

Do not commit account exports, credentials, customer data, or large provider datasets.
