# Public URL inventory

Inventory date: 2026-09-09. All indexable routes use a self-referencing `https://xroga.com` canonical, the shared absolute Open Graph image, `index,follow` in production, and are included in `sitemap.xml` unless noted.

| URL or route family | Type | Index | Intent | Action |
|---|---|---:|---|---|
| `/` | commercial home | yes | AI app builder + coding agent | KEEP |
| `/features` | capability hub | yes | Xroga features | KEEP |
| `/pricing` | commercial | yes | Xroga pricing | KEEP |
| `/integrations` | provider hub | yes | Xroga integrations | KEEP |
| `/docs`, `/docs/[slug]`, `/docs/api`, `/docs/platform` | documentation | yes | product documentation | KEEP |
| `/showcase`, `/showcase/[slug]` | evidence/examples | yes | AI-built product examples | KEEP |
| `/showcase/[slug]/preview` | embedded preview | no | product preview | NOINDEX / exclude sitemap |
| `/ai-app-builder` | commercial pillar | yes | AI app builder | KEEP |
| `/ai-coding-agent` | commercial pillar | yes | AI coding agent | KEEP |
| `/ai-website-builder` | commercial pillar | yes | AI website builder | KEEP |
| `/build-saas-with-ai` | commercial pillar | yes | build SaaS with AI | KEEP; future review for `/ai-saas-builder` consolidation |
| `/github-ai-coding-agent` | commercial support | yes | GitHub AI agent | KEEP |
| `/vercel-ai-deployment` | commercial support | yes | AI Vercel deployment | KEEP |
| `/vibe-coding` | commercial/category pillar | yes | vibe coding platform | ADD |
| `/security` | trust pillar | yes | AI coding security | ADD |
| `/compare` + six `/compare/xroga-vs-*` pages | comparison hub/detail | yes | product evaluation | ADD |
| `/alternatives` + four `/alternatives/*-alternative` pages | alternatives hub/detail | yes | alternative discovery | ADD |
| `/build` + eight `/build/[app-type]` pages | use-case hub/detail | yes | building specific software | ADD |
| `/build-with` + six `/build-with/[provider]` pages | integration hub/detail | yes | provider implementation | ADD |
| `/blog` + five `/blog/[slug]` pages | editorial hub/article | yes | informational evaluation | ADD |
| `/learn` + `/learn/production-readiness-checklist` | learning hub/guide | yes | production readiness | ADD |
| `/crypto`, `/game-builder`, `/software`, `/cybersecurity`, `/research`, `/research/web3-hackathon-winning-patterns`, `/about`, `/contact`, `/community`, `/community/[postId]` | existing public content | yes | respective branded/topic intent | KEEP |
| `/terms`, `/privacy`, `/refund` | legal | yes | policy lookup | KEEP, low sitemap priority |
| `/share/[token]` | user-generated share | no | direct sharing | NOINDEX,FOLLOW; exclude sitemap |
| `/auth/*`, `/onboarding`, `/(shell)/*`, `/workspace`, `/dashboard/*`, `/settings`, `/admin/*` | account/application | no | authenticated use | NOINDEX; exclude sitemap |
| `/api/*` | API | no | machine endpoint | block from crawl; exclude sitemap |
| `/ref/[code]` | referral | no primary search intent | acquisition redirect/state | keep out of sitemap; review noindex at route boundary |
| `/crypto-builder`, `/crypto-hackathon-builder` | legacy | no | old crypto URL | permanent redirect to `/crypto` |
| `/features/ai-chat` | legacy | no | old AI chat feature | permanent redirect to `/ai-coding-agent` |
| auth and typo aliases in `next.config.mjs` | legacy/typo | no | navigation recovery | permanent redirects, no chains |

Registry-backed docs, showcase, capability, and SEO detail routes are expanded by their source registries at build time. A URL is not published merely because its future factory namespace exists.
