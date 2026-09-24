# Command 4 — Authority and Distribution System

## Purpose

Command 4 turns verified Xroga product truth and useful public artifacts into distributed discovery opportunities. It is an authority-production system, not backlink automation. It consumes:

- Command 1 entities, desired associations, gaps, mentions, confidence and freshness;
- Command 2 demand, SERP, source, claim, asset and video-format evidence;
- Command 3 publication eligibility, canonical inventory, live verification, receipts and drift.

No external mention, creator interest, installation, review, traffic value or citation is inferred from absence of data.

## Architecture

```text
Command 1 intelligence ─┐
Command 2 evidence ─────┼─> authority pipeline ─> graph / opportunities / receipts / report
Command 3 public assets ┘              │
                                       ├─> plan-only outreach/distribution
                                       ├─> GitHub project-check Action/CLI/skill
                                       └─> Command 5 authority-event handoff
```

The canonical implementation lives in `backend/src/organicIntelligence/authority`. Source observations live in `growth/authority`; generated reports remain ignored under `artifacts/growth-authority`.

## Authority model

The graph distinguishes owned, earned, community, partner and paid surfaces. Nodes cover Xroga assets and repositories, packages, actions, skills, reports, badges, video, research, external editorial pages, creators, communities and case studies. Edges retain an evidence state and can describe mentions, links, citations, embeds, installs, use, reviews, comparisons and related relationships.

Records carry:

- `VERIFIED`, `OBSERVED`, `INFERRED`, `UNKNOWN` or `STALE` evidence state;
- freshness and verification dates;
- public/privacy classification;
- page-level evidence rather than domain authority alone.

Owned GitHub assets never count as independent earned mentions.

## Authority tiers

- **Tier 1 — independent editorial:** credible reviews, comparisons, newsletters, publications, podcasts, creators and research citations.
- **Tier 2 — authentic community:** relevant forums, GitHub discussions and communities where participation is useful and disclosed.
- **Tier 3 — owned distribution:** Xroga web, GitHub, Action, skill, future packages, reports and videos.

Tier does not replace relevance. A page ranking for the exact user job can be more valuable than an unrelated high-authority domain.

## Mention Intersect

Command 4 operationalizes Command 1 mention data only when:

1. the page is independently observed;
2. at least two competitors are present;
3. Xroga is absent;
4. topic relevance is known and sufficient;
5. a matching external-source record provides page-level evidence.

The result links back to Command 1 `WEB_MENTION` or `INFLUENCE` gaps. With no imported mentions, the result is `NO_DATA`, not zero opportunity.

## Source qualification

Qualification uses explainable components:

- topical relevance;
- page backlinks/referring domains/traffic/search position where available;
- AI citation frequency where observed;
- real audience and editorial independence;
- commercial fit and contactability;
- competitor overlap and freshness.

Missing values remain `UNKNOWN`. Irrelevant high-authority pages and link schemes are rejected.

## Influence and outreach safety

Action types include editorial/review/data/research pitches, expert comment, creator demo, partnership, integration, community answer, open-source or marketplace submission, video collaboration, case study, newsletter pitch and fact correction.

The system may prepare research, personalization context and drafts. It does not send email, publish comments, post to Reddit/Hacker News, submit directories or create fake engagement. Every draft defaults to `NOT_SENT` with contact permission `UNKNOWN` until an authorized human workflow approves it.

Prohibited opportunities include bought follow links, PBNs, expired-domain schemes, bulk directory packages, scaled link exchanges, forum profiles, sitewide footer links, fake personas, fake reviews and undisclosed sponsorship.

## Digital PR and research distribution

A data pitch is blocked unless it has reviewable data, reproducible methodology, a defined sample, date, limitations and source URL. Percentage headlines require underlying data.

The intended loop is:

```text
real study -> evidence page -> public-safe data -> charts -> reviewed video brief
          -> press/creator/newsletter/community preparation -> verified outcomes
```

No current original study satisfies this gate, so Command 4 creates no research headline or PR statistics.

## Open-source ecosystem and first wedge

The evidence-weighted first wedge is **Xroga Project Check**, implemented as a composite GitHub Action using a shared dependency-free local CLI engine.

Why it won:

- repository work is central to the verified Xroga product;
- it provides useful anonymous value before any commercial CTA;
- it needs only local read access and performs no source upload;
- it has lower transport, authentication and maintenance risk than an MCP server;
- it produces human, JSON and badge evidence from one implementation.

The engine checks project manifests, one lockfile, declared build/test/type/lint scripts, deployment configuration, workflows, README/security/contribution guidance, agent instructions and environment-variable names from example files. It never executes project scripts and does not certify security or deployment readiness.

### Release status

The Action works locally and may be exercised in CI. External release remains blocked by two owner decisions:

1. approve an open-source license;
2. define version/tag policy and immutable consumer reference.

No vanity satellite repository, package, tag, release or marketplace listing was created.

## MCP

MCP was evaluated but not selected. No MCP server or mutation tool is shipped. Future MCP work must separate `READ_ONLY`, `PROJECT_MUTATION`, `EXTERNAL_WRITE`, `PRODUCTION` and `DESTRUCTIVE` tiers, default to least privilege, and use reviewed real product APIs. Marketplace/client metadata must be validated against current official requirements at implementation time.

## Skills

`growth/authority/skills/xroga-project-check.json` is an outcome contract for the real checker. It declares inputs, outputs, required tool, read-only permission, workflow, guardrails, failures, evidence and related docs. It does not promise repair, deployment or mutation.

## CLI

```bash
npm run project:check -- .
npm run project:check -- . --json
npm run growth:authority -- --dry-run
npm run growth:mentions -- --dry-run --json
npm run growth:distribute -- --dry-run --json
npm run growth:github -- --dry-run --json
npm run growth:oss -- --dry-run --json
npm run growth:video -- --dry-run --json
npm run growth:creators -- --dry-run --json
npm run growth:reports -- --dry-run --json
npm run growth:badge -- --dry-run --json
```

Authority/distribution commands plan by default and perform no external action. The local checker supports meaningful threshold exit codes, JSON, a safe relative output path, and a computed SVG badge.

## GitHub Action

The composite Action is under `.github/actions/project-check`. It requires only the consumer’s checked-out repository. The workflow declares `contents: read`, passes inputs through environment variables rather than shell interpolation, invokes no third-party runtime code, and does not upload artifacts automatically.

Outputs:

- score and band;
- critical finding count;
- JSON report path;
- SVG badge path;
- human Step Summary.

Consumers should pin an immutable full commit SHA after release policy is approved.

## Badge

The badge states only `Xroga Project Check | score/band`. It is generated from the same computed result, escapes XML, contains no script or external resource and reveals no private-repository state outside the local workflow. The system never emits the unsupported claim “Xroga Verified.”

## Public reports

Public report eligibility requires:

- public repository;
- explicit owner opt-in;
- `PUBLIC_SAFE` or `AGGREGATED_SAFE` privacy;
- substantive, unique, non-duplicate analysis.

Private, unconsented, thin or duplicate reports remain authenticated/NOINDEX and outside the sitemap. No public project report page was created in this command.

## GitHub discovery

The main README now describes the real product workflow and local project checker. Security reporting, contribution guidance, issue forms and a pull-request template are present. Repository description/topics can be updated through authorized GitHub settings; discussions and release creation remain owner-policy decisions.

## YouTube and video search

Video opportunities require Command 2 SERP rows proving a video result plus a paired public page. Without that evidence, ideas stay generated ideas and no brief is presented as validated. A validated brief must contain proof, demo environment, claims/sources, chapter plan, paired page, CTA, limitations and a reviewed transcript requirement.

No YouTube channel upload or video publication is performed.

## Creators and reviewers

Creator qualification needs observed category fit. Outreach may offer real access, a demo, data or a technical walkthrough, but never requires positive coverage. No creator records are currently imported, so the status is `NO_DATA`.

## Community

Participation must answer the problem first, disclose affiliation when relevant, and link only when directly helpful. Fake personas, manufactured consensus, repetitive marketing and automated community posting are prohibited. No current community thread evidence is imported.

## Case studies and showcase

Case studies require a real participant/project, permission, before state, workflow, measured result, limitations, date and proof. Private projects stay private; a showcase needs explicit opt-in and a public-safe review.

## Research and release distribution

Research distribution remains blocked until a real study exists. Release distribution classifies `MAJOR`, `NOTABLE`, `MINOR` and `INTERNAL`; broader preparation is appropriate only for major/notable public changes. No arbitrary `v1.0.0` tag or meaningless freshness release is created.

## Attribution and Command 5

Owned distribution may use validated `utm_source`, `utm_medium` and `utm_campaign` values on external deep links. Canonical internal links do not receive unnecessary UTMs.

Authority receipts retain asset, surface, source type, URL, date, status, context, link attributes, competitors and verification date. `CONTACTED` and `PUBLISHED_UNVERIFIED` never count as success. These records form Command 5’s authority-event input.

## Privacy and security

Every export is classified `PUBLIC_SAFE`, `AGGREGATED_SAFE`, `PRIVATE` or `REQUIRES_CONSENT`. Public data must exclude PII, private repositories, proprietary code, credentials, user identifiers and private logs.

The project checker:

- reads only local metadata/configuration;
- never uploads source;
- never reads environment values into output;
- never executes project scripts;
- validates report paths;
- escapes badge content;
- has no telemetry or runtime dependencies.

## Feedback loops

- Verified external mentions become Command 1 evidence; omissions become `WEB_MENTION`; factual errors become `NARRATIVE` correction candidates.
- Externally observed questions may become Command 2 prompt-family/content candidates, but never auto-publish.
- New public Xroga pages must pass Command 3 publication and live-verification gates.
- Receipts and attribution events become Command 5 measurement inputs.

## Current limitations

- Ahrefs: unavailable.
- GSC import: no data.
- external mentions: no data.
- creator/community observations: no data.
- validated video SERP opportunities: no data.
- earned mentions and links: no data.
- license, version policy and discussion ownership: owner decisions.
- MCP, registry package, satellite repositories, public reports and video uploads were not released.
