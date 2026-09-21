# Xroga Organic Intelligence and Entity/Brand Gap System

## Scope

Command 1 adds a diagnosis-first intelligence layer. It does not publish SEO pages, manufacture search demand, run outreach, or claim that probabilistic AI answers have a fixed ranking. It sits beside—rather than replacing—the existing public SEO registries, sitemap, metadata helpers, analytics service, lifecycle-growth service, and production crawler audit.

The operating sequence is:

`product truth → entity graph → desired associations → demand ontology → observed visibility → gaps → root cause → FIX / BUILD / INFLUENCE / PRODUCT / IGNORE → priority → remeasurement`

## Architecture and data ownership

- `growth/source/` contains reviewed, source-controlled truth: entities, associations, canonical facts, demand taxonomy, crawler policy, format coverage, and any deliberately committed observations.
- `growth/imports/` accepts private or volatile provider exports. Files are ignored by Git except the schema guide and empty examples.
- `backend/src/organicIntelligence/` contains schemas, validation, imports/providers, gap/action logic, priority logic, orchestration, reporting, and the CLI.
- `artifacts/growth-intelligence/` contains generated snapshots/reports and is ignored. A refresh never mutates public pages.
- `frontend/src/lib/seo.ts`, the existing SEO content registries, `robots.ts`, `sitemap.ts`, `llms.txt`, and `scripts/seo-audit.mjs` remain the public SEO source and production eligibility checks.
- `backend/src/growth/` remains the separate customer lifecycle/campaign runtime. Organic intelligence does not overload those tables or APIs.

No database migration is required in Command 1. This is intentional: source truth belongs in reviewable version control; volatile imports and generated observations must not be committed or exposed. A later command may persist multi-user operational state behind an authenticated admin surface without changing these domain contracts.

## Entity graph

Entities are typed as company, product, feature, tool, integration, technology, capability, use case, problem, outcome, topic, attribute, proprietary framework/metric, research asset, person, competitor, or platform. Every relationship is validated against an existing entity. Self-relations, duplicate IDs, missing truth sources, and invalid references fail validation.

The initial graph is deliberately product-truth-led. Xroga, its active execution capabilities, verified integrations, core technologies, founder identity, and competitor identities are seeded. A competitor entity is not a competitor claim: visibility and capability claims require dated evidence.

## Desired associations and canonical facts

Desired associations capture the category, capability, problem, outcome, attribute, audience, technology, use case, and competitive position Xroga can truthfully support. They record desired and observed strength separately, with confidence and evidence.

Canonical facts centralize high-volatility public truth first: the product one-liner, current Free and Xroga Pro prices/capacity, repository authorization behavior, Preview/deployment separation, and supported GitHub, Vercel, and Supabase integrations. Validation detects conflicting keys, missing sources, and overdue verification.

## Demand ontology and BID

Keyword, prompt, prompt family, topic cluster, search intent, user job, audience, and funnel stage are separate concepts. Prompt families are normalized and deduplicated so prompt wording never becomes one URL per variation.

Every demand item supports:

- **Business potential**: likely qualified Xroga value, represented as 0–5 or UNKNOWN.
- **Intent**: the asset/workflow the user actually needs.
- **Difficulty**: 0–5 only with evidence; otherwise UNKNOWN.
- AI satisfaction risk, click defensibility, prompt relevance, and citation value.
- SEO-first, AEO-first, hybrid, or low-priority strategy.

The initial universe covers app builders, coding agents, existing repositories, repair, production readiness, deployment, GitHub, integrations, vibe coding, comparisons, alternatives, migrations, ownership/lock-in, cost/value, security, audiences, supported outcomes, and troubleshooting. These are taxonomy records, not volume claims.

## Brand Gap and action engine

The six independent gap classes are VISIBILITY, NARRATIVE, TOPIC, FORMAT, WEB_MENTION, and DEMAND. A record carries dated evidence, data confidence, source URLs, desired/current state, product fit, and remeasurement metadata.

Deterministic action rules:

- **FIX**: a controlled existing asset/association is deficient.
- **BUILD**: a high-value, product-supported, Xroga-controlled asset is genuinely missing.
- **INFLUENCE**: the relevant surface is independently controlled.
- **PRODUCT**: demand is legitimate but current product truth does not support the capability.
- **IGNORE**: weak, duplicate, irrelevant, unsupported, or unsubstantiated work.

Product gaps never become deceptive public claims.

## Explainable priority

Each opportunity retains component values for business potential, demand, commercial proximity, product/intent fit, attainability, AI/competitor gap, association value, satisfaction risk, click defensibility, format opportunity, existing authority, evidence, conversion potential, maintenance burden, and strategic value. UNKNOWN is excluded from computation and called out in the rationale; it is never silently converted to zero.

Priorities P0–P4 are gates over known components, not a pseudo-scientific “87/100” score. Every result includes human-readable reasons, recommended work, source evidence, and a remeasurement plan.

## Providers and imports

Provider results use `AVAILABLE`, `NO_DATA`, `UNAVAILABLE`, or `PLAN_LIMITED`.

- **Ahrefs**: absent credentials return UNAVAILABLE; configured but unverified plan access returns PLAN_LIMITED. No metric is synthesized. CSV/JSON imports remain the fallback.
- **Google Search Console**: CSV imports require query, page, date, clicks, impressions, CTR, and position, with optional country/device. The parser handles quoted fields, percent CTR, malformed rows, and position/CTR classes.
- **AI Prompt Observatory**: observations are dated samples per engine. States are CITED_LINKED, MENTIONED_UNLINKED, ABSENT, and INCORRECT_OR_MISLEADING. Rates are calculated only when samples exist.
- **Mention intelligence**: independent page records retain competitor overlap and available page evidence. Mention Intersect requires competitor overlap while Xroga is absent; UNKNOWN authority metrics stay UNKNOWN.

Private imports belong in `growth/imports/` and must not contain credentials or customer data.

## Platform and format models

Google, ChatGPT, Perplexity, Claude, Bing/Copilot, and future engines keep separate observation profiles over a common foundation. Temporary source tendencies are observations with dates/confidence, not permanent algorithm rules.

Format coverage supports product/feature pages, guides, blogs, comparisons, alternatives, migrations, video, tools, research, benchmarks, documentation, templates, showcases, public reports, third-party editorial, and community content. A missing format becomes a gap only when evidence shows a search, AI, or competitor preference—not merely because the format does not exist.

## Confidence and freshness

Confidence is VERIFIED, OBSERVED, INFERRED, UNKNOWN, or STALE. Freshness is CURRENT, VERIFY_SOON, STALE, or UNKNOWN. Evidence always carries a source and observation time; external observations include last verification and due dates where known.

## Crawler and technical eligibility baseline

The source model separates search/retrieval access from training access. Googlebot, OAI-SearchBot, GPTBot, ChatGPT-User, PerplexityBot/User, Bingbot, and Anthropic crawler identities are recorded independently. UNKNOWN training policy stays UNKNOWN.

The existing production audit remains authoritative for live status codes, canonical URLs, indexability, server-rendered text, structured data, discovery files, internal links, sitemap integrity, noindex leakage, redirects, and 404s:

```bash
SEO_AUDIT_BASE_URL=https://xroga.com npm run test:seo
```

Command 1 records gaps; it does not overhaul public technical SEO.

## Commands

```bash
npm run growth:validate -- --dry-run
npm run growth:entities -- --json --dry-run
npm run growth:gaps -- --json --dry-run
npm run growth:discover -- --json --dry-run
npm run growth:report -- --dry-run
npm run growth:intelligence -- --json --dry-run
npm run test:growth
```

Without `--dry-run`, output is written beneath ignored `artifacts/growth-intelligence/`. `--verbose` reports the target path. Commands are read-only with respect to public content and production systems.

## Initial data limitations

- No Ahrefs API dataset is available until plan access is verified.
- No GSC export is bundled; query/page metrics remain NO_DATA until a real import is supplied.
- No AI prompt samples are bundled; mention/citation/share-of-voice metrics remain NO_DATA.
- No third-party mention records are bundled; Mention Intersect remains NO_DATA.
- Competitor visibility and ranking difficulty are not inferred from brand awareness or memory.
- Search traffic, ranking, conversion, and AI citation outcomes are never guaranteed.

## Intentionally deferred to Commands 2–5

This phase does not mass-produce content, publish programmatic pages, automate outreach, create an external-facing dashboard, apply product changes, or run recurring third-party observations. Later commands can consume the validated domain and priority contracts for controlled execution and remeasurement.
