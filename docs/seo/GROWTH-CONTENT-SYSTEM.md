# Xroga Growth OS — demand and evidence content system

Reviewed: 2026-09-22

## Purpose and boundary

Command 2 converts real demand, prompt intent, search-result evidence, product truth, and public-safe proof into controlled content briefs and validated updates. It does not create a second opportunity queue: Command 1 remains the authority for entities, associations, gaps, action type, opportunity priority, confidence, and freshness.

The pipeline is:

`provider/import evidence → Command 1 source adapter → Command 1 intelligence rerun → research candidates → intent/format analysis → existing-asset resolution → evidence brief → content/visual/link validation → controlled PR`

Generated seeds are labelled `GENERATED_IDEA`. They remain `UNKNOWN` and cannot qualify as validated demand until a real provider or import record matches them.

## Data status

Research state is one of `AVAILABLE`, `NO_DATA`, `UNKNOWN`, `UNAVAILABLE`, `PLAN_LIMITED`, or `STALE`. These states are intentionally different:

- `AVAILABLE`: a dated provider/import record exists.
- `NO_DATA`: the requested scoped dataset was supplied or checked and contained no usable records.
- `UNKNOWN`: no evidence supports a numerical conclusion.
- `UNAVAILABLE`: configuration/provider access is unavailable.
- `PLAN_LIMITED`: access exists but the required metric is outside the verified entitlement or adapter.
- `STALE`: evidence exists but is past its verification date.

No missing metric becomes zero.

## Providers and imports

The existing Ahrefs runtime abstraction is preserved. Command 2 adds documented manual Ahrefs CSV/JSON parsing without inventing endpoints. Supported fields include keyword, country, volume, global volume, difficulty, traffic potential, CPC, parent topic, intent, SERP features, and ranking URLs. Every optional missing number remains `null`.

GSC continues through the Command 1 `gsc.csv` contract. Command 2 consumes those rows for 1–3 defend, 4–10 strengthen, 11–20 near-win, 21–50 intent review, high-impression/low-CTR, dated decline, sleeper, and query/page cannibalization analysis. No import means `NO_DATA`, not zero demand.

Structured SERP observations are accepted from manual/authorized CSV or JSON. The system does not scrape Google. Observations retain country, device, date, result URL/domain, content/result type, composition flags, features, and observed intent.

## BID and research candidates

- **Business potential** comes from the Command 1 demand/product-fit contract.
- **Intent** uses structured SERP evidence when available; absent evidence remains `UNKNOWN`.
- **Difficulty** uses imported provider difficulty when present; absent difficulty stays `UNKNOWN`.

AI Satisfaction Risk and Click Defensibility remain attached to every research candidate. High raw volume cannot rescue weak product/intent fit. A lower-volume, high-fit commercial request may outrank an irrelevant high-volume query.

Seed/modifier generation covers commercial, comparison, job, technology, and problem modifiers. This is a research queue, never a publication queue.

## Query fan-out and format

Prompt families expand into a bounded map of the core job plus desired entity associations. Every fan-out question records coverage, the owning URL, strength, missing state, and a recommendation. One prompt may require several subtopics inside one authoritative asset; it does not create a URL per subquestion.

Search format is derived from observed SERP composition. Comparison intent remains comparison; tools, video, product/category pages, documentation, research, and community results are not coerced into blog posts. A video gap requires meaningful topic demand, observed video presence, and missing Xroga video coverage. With no SERP observations, video findings remain `NO_DATA`.

Competitor coverage is classified as real demand, brand, format, low-value copycat, or product gap. Unsupported product demand routes to product discovery rather than content that pretends the capability exists.

## Existing assets, sleepers, and decay

The asset inventory compares topic, entity, intent, family, and semantic overlap before any build decision. Possible outcomes are `UPDATE_EXISTING`, `EXPAND_EXISTING`, `MERGE`, `REPOSITION`, `BUILD_NEW`, and `IGNORE`. Overlapping indexed assets create a cannibalization warning.

Sleeper pages require dated historical and current evidence; age alone is insufficient. Decay signals cover stale pricing, competitor/product facts, screenshots/statistics, broken sources, declining queries/pages, outdated guides, newly missing product coverage, and AI visibility decline. Historical publication dates are never rewritten merely because a deployment occurred.

## Briefs, sources, claims, evidence, and visuals

No controlled content work starts without a `ContentBrief`. A brief is keyed to Command 1 opportunity/gap/entity/topic identity and contains the user job, audience, intent, fan-out, required questions/sections, product facts, sources, evidence, visuals, limitations, prohibited claims, internal links, CTA, conversion path, owner, acceptance criteria, and refresh deadline.

Source records distinguish Xroga implementation, public Xroga assets, official primary sources, original data, and manual imports. Claim records bind text to source IDs, pages, volatility, verification, and the next due date. Missing or stale sources block readiness.

Evidence manifests state exactly what a public-safe artifact proves. Visual manifests prefer product screenshots, accessible workflow diagrams, semantic tables, and real receipts. A chart is permitted only with underlying data, an accessible nearby table, labels, methodology, and date. No data means no chart.

## Citation-ready and editorial quality

Important assets require a clear H1, direct answer, at-a-glance structure, atomic sections, explicit entity names, focused scope, evidence, limitations, meaningful freshness, and a job-matched next action. Coverage is measured through required sections/questions, not arbitrary word counts.

Quality is an explained 100-point sum: intent match 15, product relevance 10, original evidence 15, answer completeness 10, citation readiness 10, visual proof 10, source quality 10, freshness 5, internal linking 5, conversion path 5, and technical readiness 5. Default readiness is 75; comparison/research uses 80. Stored totals and deficiencies must match recomputed components.

`EDITORIAL_QUALITY_CHECK` flags filler, repetition, placeholders, unsupported superlatives, and boilerplate. It is not marketed as an AI detector.

## File-based coexistence

Existing TypeScript content registries and canonical routes remain intact. `content/manifests/*.json` adds evidence, freshness, ownership, and quality metadata as an incremental migration path. A file does not create a route. Future content families may live under `content/learn`, `blog`, `compare`, `alternatives`, `migrate`, `build-with`, `build`, `research`, `benchmarks`, and `tools`, but only explicit route integration can publish them.

## Internal links, CTA, and conversion

Suggestions prioritize shared topic/entity relationships while excluding self-links and duplicates. CTA language follows the user job: guides invite the workflow, repository assets invite a repository connection, comparisons invite a representative trial, migrations invite repository continuation, and research invites evidence-based testing. Every manifest records entry intent → value → next action → activation event for Command 5 attribution.

## Commands

- `npm run growth:research [-- --dry-run --json]`
- `npm run growth:brief [-- --opportunity <id> --dry-run]`
- `npm run growth:content [-- --opportunity <id> --dry-run]`
- `npm run growth:content:validate [-- --path <manifest>]`
- `npm run growth:links [-- --dry-run]`
- `npm run growth:visuals [-- --dry-run]`

`growth:content` produces an evidence-gated controlled plan only. It is deliberately not a mass-generation or publication command.

## Current controlled batch

The first batch contains two existing-page FIX assets:

1. `/build-with/github`, triggered by `opportunity.assoc.xroga.repository-native-topic.existing-repositories`. It uses the current atomic-write implementation, official GitHub policy, and a public-safe Xroga repository-review visual.
2. `/tools/production-readiness-checker`, triggered by `opportunity.assoc.xroga.production-readiness-topic.production-readiness`. It uses the live interactive tool, current validation capability source, and an accessible data-driven release-evidence diagram.

No new URL was justified because Ahrefs, GSC, and SERP imports are absent in the repository run. All generated seed ideas remain research-only.

## Security and privacy

Import files remain ignored. Parsers reject malformed/duplicate rows and unsafe content paths. Manifests may reference only public-safe artifacts. Private repositories, prompts, analytics, customer data, tokens, and screenshots have no public route through this system.

## Command 3 handoff

Command 3 can add deeper publishing, deployment, technical eligibility, and freshness automation over these validated manifests. It should preserve Command 1 authority, the explicit no-data semantics, controlled PR boundary, and the rule that a manifest or candidate never creates a URL by itself.
