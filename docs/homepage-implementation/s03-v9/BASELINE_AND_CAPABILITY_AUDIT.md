# S03 V9 — Baseline and capability audit

## Baseline
- **Repository and branch:** `Xroga/xroga.com`, on `main` at `6aa3963b` (S03 V7, the Aurel journey). No other S03 work had landed since.
- **Unrelated work, untouched:** the old uncommitted S00 edits in the main checkout. V9 was built in a separate worktree (`claude/s03-growth-local`).
- **Section boundaries:** S00–S02 and the global header are treated as fixed baselines.

## What V7 got wrong, judged against the founder recording (63 s) and frame sheets
- **The fictional product led the section.** The Aurel launch plane dominated, so a visitor had to understand a made-up product before understanding Xroga.
- **SEO was one narrow scene.** It was a single AI-answer "market field": no crawling, no on-page work, no links, no local presence.
- **Campaigns floated.** Ads were floating cards that differed in text only. Results were a generic stream chart.
- **Providers were buried.** Their logos sat at the very bottom (around 55–63 s in the recording), away from the work they support.

## Integration truth: source of every provider state in S03
The integrations directory is `frontend/src/lib/integrations-catalog.ts`, which is generated. Every entry below is `not_connected` in the catalog, and none has an action wired to the homepage.

| Provider | Catalog listing | Shown in S03 as | Backend evidence |
|---|---|---|---|
| Ahrefs | "Ahrefs" | Available to connect | `organicIntelligence/providers.ts` has an `AhrefsProvider` that needs `AHREFS_API_TOKEN` and a dataset loader. Without them it reports `UNAVAILABLE` or `PLAN_LIMITED`. |
| Semrush | "SEMrush" | Available to connect | Catalog only |
| Google Ads | "Google Ads API" (oauth) | Available to connect | No campaign-write code found in the backend |
| Meta Ads | "Meta Business Suite" | Available to connect | Catalog only |
| HubSpot | "HubSpot" (oauth) | Available to connect | Catalog only |
| Google Analytics | "Google Analytics" (oauth) | Available to connect | Catalog only |
| Search Console | **Not listed** | Not in directory · example | The backend can parse GSC CSV exports (`parseGscCsv`), but there is no connector. |
| Tag Manager | **Not listed** | Not in directory · example | None |
| Business Profile | **Not listed** | Not in directory · example | None |
| AI-answer providers | **None listed** | The scene says so, and states that its answers were sampled by hand | None |

Consequences for the homepage:
- Every action in S03 is a local preview. Nothing reads, publishes, sends, spends or connects.
- Provider chips link only to `/integrations`. There are no fake OAuth buttons.

## Reference media inspected (`ffprobe` and `ffmpeg`, frames inspected individually and as contact sheets)
- **Daydream backlink clip** (`backlinks_video.mp4`): 24.2 s at 1918×908, sampled at 1 fps. A detail frame at 2.5 s shows the connected-illustration grammar.
- **Current Xroga S03 recording** (from the kit): 63.2 s, sampled every 3 s.
- **Kit sheets:** the competitor study sheet (Peec, Clay, Dub, Profound, Daydream) and the current and backlink frame sheets.
- **Not committed:** none of the reference media is committed to the repository.
