# Provider Role Policy

What is **enforced in code**, with the enforcement point named for each rule. Where something is documented but not yet enforced, this document says so rather than implying otherwise.

## The two categories

| category | providers | transport | may perform engineering |
| --- | --- | --- | --- |
| coding | Kimi | official Moonshot API | yes |
| coding | GLM | official Zhipu/BigModel API | yes |
| coding | DeepSeek (Pro, Flash) | OpenRouter | yes |
| research | Grok 4.5, Grok 4.3 | xAI | **no** |
| research | Tavily | Tavily | **no** — a search service, not a chat model |

Kimi and GLM are never routed through OpenRouter. DeepSeek is the family intentionally accessed through it.

## Enforcement points

`backend/src/ai/providerPolicy.ts` is the single authority. Every routing site defers to it rather than re-deriving the answer.

| rule | enforced at |
| --- | --- |
| `isCodingModel(grok) === false` | `providerPolicy.ts` — an **allowlist**, so an unknown model is refused by default |
| research models cannot be ranked for coding | `universalEntrypoint.capabilityCandidates()` — filtered at the source of the candidate list |
| research models cannot be selected at point of use | `assertCodingModel()` in the implement step |
| coding fallback chains contain only coding models | `modelCapabilityRegistry.FALLBACKS` |
| operator config cannot reintroduce a research provider | `modelCapabilityRegistry.preferredFallbacks` filter |
| a research **role** holds no repository tool | `engineeringRoles.ts` |

Tests: `providerPolicy.test.ts` (11), `engineeringRoles.test.ts` (12).

### Why the allowlist direction matters

The failure mode is a research provider writing code. A denylist fails open — a model added to the registry later inherits coding authority unless someone remembers to exclude it. An allowlist fails closed. The refusal message names the model and the permitted set, so a legitimately new coding model produces an obvious error rather than a silent absence.

### Why filtering happens before ranking

A research model filtered *after* ranking would still appear in the run's recorded routing evidence as a coding option that merely lost. Filtering at the source means it is not a candidate at all — it cannot be selected, cannot become a fallback, and cannot be recorded as having been considered.

## What this replaced

At `59cdcf6` the policy was documented and unenforced. Three facts were true simultaneously:

1. `STRENGTHS` gave `grok_4_5` and `grok_4_3` a `coding` score of 7, and `capabilityCandidates()` built a routing profile from every registry entry — so `routeByCapability({ capability: 'coding' })` ranked both Grok models as implementation candidates.
2. `FALLBACKS` listed `grok_4_3` as a fallback for `kimi_k3`, `glm_5_2` and `deepseek_v4_flash` — all three coding models.
3. `grok_4_5`'s declared role string in `models.ts` advertised "coding agents".

Point 2 stopped being theoretical when PR #478 made the universal implement step walk its fallback chain for real. Two coding-provider failures would have handed implementation to a research model rather than refusing.

## Known inconsistency, not yet fixed

`models.ts` still describes `grok_4_5` as *"Real-time intelligence — web/X search, crypto news, coding agents"*. The phrase contradicts the enforced policy. It is harmless at runtime because `providerPolicy` governs selection, but it is misleading documentation sitting inside the registry and is listed as EXTEND in the migration map.

## Deliberately unchanged: `router.ts`

`router.ts` assigns Grok to a field named `builder` in three places (lines 51, 62, 73). All three sit inside `!classification.requiresCoding` branches — research, file analysis and chat. The field name is a legacy artifact; those branches produce conversational responses, not engineering.

Its coding routes use only `kimi_k3`, `glm_5_2` and `deepseek_v4_pro`, and are compliant. Changing the non-coding assignments would break chat and research routing without serving the policy, so they were left alone. Renaming the field for clarity is worthwhile and separate.

## Research output is untrusted input

Research results may be sanitised, cited, source-tracked, summarised and supplied to coding models. They may never be treated as verified fact. The `research` role holds **no repository tool at all** — read included, because a role that can read the repository can leak it into a prompt an external service sees.

Two independent controls cover the same risk on purpose: `providerPolicy` stops a research *model* being selected for coding, and `engineeringRoles` stops a research *role* holding a repository tool regardless of which model backs it.
