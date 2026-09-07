# Black Hole ∞ — production integration status

Supersedes the Part 2 status written before PR #564 merged. Reflects the integration work that
followed it.

The current backend build and test results are enforced by CI; this document does not freeze a
test count that becomes stale as coverage grows.

**Live verification status is stated plainly in section K.** Nothing involving a real provider
call has been exercised, and no claim of "production verified" is made anywhere in this
document.

---

## A. Request flow

```
USER
 → authorization / rate limits          (above the gateway, unchanged)
 → Black Hole gateway                   black-hole/gateway.ts
 → task analysis                        black-hole/taskClass.ts        (22 classes)
 → complexity                           black-hole/complexity.ts       (12 capped inputs)
 → context plan                         black-hole/contextPlan.ts
 → optional research                    black-hole/webIntelligence.ts
 → capability + authority requirements  derived by task analysis
 → canonical router                     black-hole/router.ts
 → provider adapter                     black-hole/providerAdapter.ts
 → optional agent / tools               black-hole/agentRuntime.ts + toolRegistry.ts + toolBindings.ts
 → validation / repair                  black-hole/repairRouting.ts
 → normalized public response           no model identity, by type
 → private telemetry                    onTrace / ShadowSink
```

## B. Provider routing table

| Internal model | Transport | Enforced where | Status |
|---|---|---|---|
| `kimi_k3` | Moonshot | `openaiCompat.resolveEndpoint` | configured |
| `glm_5_3` | Zhipu (official GLM) | same | configured |
| `glm_5_3_flash` | Zhipu (official GLM) | same | configured |
| `deepseek_v4_flash` | OpenRouter | same | configured |
| private `grok-4.3` retrieval | xAI Responses API | `webIntelligence` / `research` | X Search only; not a `ModelId` |

Transport is checked **before** the configuration guard, so a model that is both misconfigured
and mis-transported still fails on the security violation rather than reporting "not configured"
and skipping the check.

The exact fallback order is defined by the active model registry: Flash routes prefer GLM-5.3
Flash, deeper work may lead with GLM-5.3 or Kimi K3, and every chain remains inside the four
active engineering models.

## C. One model truth

`models.ts` owns transport, pricing, context window and modality. Everything else derives:

- `modelCapabilityRegistry` reads the resolved spec; it no longer restates context or price and
  no longer infers image support from `id.startsWith('grok')`.
- `black-hole/registry` derives `contextWindow` and `capabilities.vision`; it still owns
  capability-versus-authority, which is Xroga policy rather than a provider fact.
- `openaiCompat` lost its private env-var table — each model carries its own `modelIdEnv`.

`registryDrift.test.ts` asserts agreement per model rather than asserting values, so it cannot
be satisfied by updating a constant in three places.

## D. Retired model status

Kimi K2.7, GLM-5.2 as an executable model, DeepSeek V4 Pro, and generic Grok model IDs are
retired and rejected by routing. The literal `glm_5_2` remains only as a historical accounting
pool key so usage recorded before the migration stays readable.

## E. K3 vision status

The two registries disagreed — one hard-coded `vision: true`, the other derived `images` from
`id.startsWith('grok')` — and the router, correctly requiring agreement before sending an image
anywhere, produced **no route at all**. That is now one fact in `models.ts`.

The shipped default for K3 is **off**, because Moonshot's contract has not been verified from
this environment. I did not set the boolean to make a test pass. An operator who has confirmed
it sets `KIMI_VISION_ENABLED=true`.

GLM-5.3 Flash is the confirmed multimodal route. Private Grok retrieval is not a vision or build
fallback and cannot enter an engineering chain.

The adapter can actually send the multimodal format (`image_url` parts on the last user turn),
and refuses rather than silently dropping an image for a model without support — a silent drop
yields a confident description of an image the model never received.

## F. Research status

`webIntelligence.ts` is the production research path. General public-web search, extraction, and
deep research use Parallel. Requests that explicitly depend on X/Twitter use private
`grok-4.3` with only the native `x_search` tool. X evidence must carry an X/Twitter citation;
uncited model text is rejected. GLM-5.3 Flash performs final synthesis.

## G. Build and repair migration

Both go through `productionBridge`, each stage-gated, each falling back to the legacy answer
rather than failing a build the previous path would have completed.

- **Build** — `selectBuildModel` replaces the keyword table's `route.builder`.
- **Repair** — `selectRepairModel` classifies the failure, bounds the scope (§24: a local
  failure does not justify regenerating the product) and intersects the §24 preference with what
  the router will actually permit, so a repair can never gain authority the original request
  lacked.

Shadow mode computes both decisions, records the comparison, and returns the legacy one.

## H. Public leak audit

| Surface | Finding | Resolution |
|---|---|---|
| `/api/capabilities/plan` | returned `selectedModel`, `fallbackModels`, `primaryModel`, `reviewerModel` | projected to public concepts |
| `/api/capabilities` | per-model health list | aggregate status only |
| usage dashboard | raw model ids as `role` + personas as `label` | capability tiers |
| build heartbeats / attempt failures | personas | public identity |
| **blocker strings** | `providerResolver` enumerates the models it checked | translated at the publication boundary |

The blocker leak was found by the audit test, not predicted. `leakAudit.test.ts` scans the
payloads **as production builds them** — a test that scans a hand-written copy passes forever
while the real shape drifts, which is how `selectedModel` got published in the first place.

## I. Cutover safety

Unchanged five stages, default `legacy_only`. Nothing was moved to `default` or
`legacy_disabled`. Shadow mode records comparison telemetry without affecting responses. No
legacy path was deleted — the §40 conditions are not met, and saying so is more useful than
deleting something that still has callers.

## J. Tests

Build, routing, provider isolation, retrieval policy, and stale-model rejection are covered by the
backend suite and the API Docker build workflow.

## K. What was live verified — and what was not

**Not live verified. No provider call was made.** This environment has:

- no provider credentials — `KIMI_API_KEY`, `GLM_API_KEY`, `OPENROUTER_API_KEY`, `XAI_API_KEY`
  and `PARALLEL_API_KEY` all resolve absent
- no provider egress — `curl https://openrouter.ai/api/v1/models` returns
  `CONNECT tunnel failed, response 403` at the environment's proxy

So none of the following were exercised: DeepSeek Flash routine, GLM engineering, K3
long-context, private Grok X research, GLM-5.3 Flash multimodal, real provider
failure/fallback, or live structured output. Every test above runs against injected fakes.

What *can* be verified live is the deployed service, via the GitHub-runner health workflow —
that confirms the refactor boots and serves, not that any model answered.

## L. Blockers requiring an operator action

1. **Provider smoke checks** — require an environment holding the provider keys with outbound
   egress. This is the only step that can convert anything in this document into a live-verified
   claim, and it will spend real provider budget.
2. **Enabling the migration** — `BLACK_HOLE_CUTOVER_STAGE=shadow` is the safe first step;
   nothing user-visible changes.
