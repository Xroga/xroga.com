# Black Hole ∞ — production integration status

Supersedes the Part 2 status written before PR #564 merged. Reflects the integration work that
followed it.

Backend: **2128/2128 tests pass**, typecheck and build clean. No lint is configured in this
repository.

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
 → optional research                    black-hole/researchRouter.ts
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
| `kimi_k2_7` | Moonshot | same | **awaiting operator configuration** |
| `glm_5_2` | Zhipu (official GLM) | same | configured |
| `deepseek_v4_pro` | OpenRouter | same | configured |
| `deepseek_v4_flash` | OpenRouter | same | configured |
| `grok_4_5` | xAI | same | configured, research-only |
| `grok_4_3` | xAI | same | configured, research-only |

Transport is checked **before** the configuration guard, so a model that is both misconfigured
and mis-transported still fails on the security violation rather than reporting "not configured"
and skipping the check.

Coding preference once K2.7 is configured: **K2.7 → GLM-5.2 → K3 → DeepSeek V4 Pro**, with
authority, availability, health, cost and complexity filtering applied.

## C. One model truth

`models.ts` owns transport, pricing, context window and modality. Everything else derives:

- `modelCapabilityRegistry` reads the resolved spec; it no longer restates context or price and
  no longer infers image support from `id.startsWith('grok')`.
- `black-hole/registry` derives `contextWindow` and `capabilities.vision`; it still owns
  capability-versus-authority, which is Xroga policy rather than a provider fact.
- `openaiCompat` lost its private env-var table — each model carries its own `modelIdEnv`.

`registryDrift.test.ts` asserts agreement per model rather than asserting values, so it cannot
be satisfied by updating a constant in three places.

## D. K2.7 status

A real `ModelId` throughout: transport, runtime types, capability priors, fallback chains,
cost tiers. It ships with `apiModel`, `inputUsdPer1M`, `outputUsdPer1M` and `contextWindow` all
`null` — **nothing was invented**.

`null` rather than `0` deliberately: a model priced at zero is the cheapest model on the
platform, so it would win every cost comparison and bill nothing until the invoice arrived. A
guessed context window silently truncates a customer's repository.

Consequences today: `resolveModelSpec` returns null, `requirePricing` throws rather than
defaulting, the runtime registry omits it entirely, and `blackHoleAvailability` reports
`not_configured`. GLM inherits the coding route.

**To enable it, an operator sets four variables:**

```
KIMI_COST_EFFICIENT_MODEL_ID=<verified Moonshot slug>
KIMI_COST_EFFICIENT_INPUT_USD_PER_1M=<verified price>
KIMI_COST_EFFICIENT_OUTPUT_USD_PER_1M=<verified price>
KIMI_COST_EFFICIENT_CONTEXT_WINDOW=<verified window>
```

All four are required. Partial configuration keeps the model unavailable, and each one
individually withheld is covered by a test.

## E. K3 vision status

The two registries disagreed — one hard-coded `vision: true`, the other derived `images` from
`id.startsWith('grok')` — and the router, correctly requiring agreement before sending an image
anywhere, produced **no route at all**. That is now one fact in `models.ts`.

The shipped default for K3 is **off**, because Moonshot's contract has not been verified from
this environment. I did not set the boolean to make a test pass. An operator who has confirmed
it sets `KIMI_VISION_ENABLED=true`.

The empty-route problem is fixed independently of that switch: the vision chain now includes the
Grok models, which genuinely accept images and hold `inspectMedia` authority. The authority
filter removes them the moment the task also needs to write — so "describe this screenshot"
reaches a working route, and "implement this mockup" still never reaches a research model.

The adapter can actually send the multimodal format (`image_url` parts on the last user turn),
and refuses rather than silently dropping an image for a model without support — a silent drop
yields a confident description of an image the model never received.

## F. Research status

`researchRouter.ts` is now wired into both production research call sites through
`productionBridge.researchThroughBlackHole`, stage-gated with the legacy `gatherResearch` as
fallback. Specialization: explicit URL → direct fetch; X/realtime/social → Grok; general web →
user Tavily → SearXNG → platform Tavily only where policy permits.

Executors are thin adapters over the existing transports in `research.ts`, which keeps the SSRF
guard (`validateResearchUrl`) and the timeouts in one place.

**Tavily connection uses the existing encrypted per-user integration store, not OAuth.** Tavily's
published integration mechanism is an API key; inventing an OAuth handshake the vendor does not
offer would produce a connect button that cannot work. A key the user supplies is still their
key drawing on their quota, which is the property that matters — authorization is never shared
between users.

Grok holds `research` and `inspectMedia` only. It cannot appear in any coding or repair chain,
asserted across every failure kind and every cutover stage.

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

2128 pass, 0 fail. Typecheck clean, build clean. No test was weakened; three were **tightened**
because the code became stricter:

- K2.7 availability now requires all four facts, not just the identifier.
- The vision test now asserts a working route rather than an empty one.
- The persona guard learned the new label rather than being silenced.

## K. What was live verified — and what was not

**Not live verified. No provider call was made.** This environment has:

- no provider credentials — `KIMI_API_KEY`, `GLM_API_KEY`, `OPENROUTER_API_KEY`, `GROK_API_KEY`
  and `TAVILY_API_KEY` all resolve absent
- no provider egress — `curl https://openrouter.ai/api/v1/models` returns
  `CONNECT tunnel failed, response 403` at the environment's proxy

So none of the following were exercised: DeepSeek Flash routine, DeepSeek Pro reasoning, GLM
engineering, K3 long-context, K2.7 coding, Grok X research, K3 multimodal, real provider
failure/fallback, or live structured output. Every test above runs against injected fakes.

What *can* be verified live is the deployed service, via the GitHub-runner health workflow —
that confirms the refactor boots and serves, not that any model answered.

## L. Blockers requiring an operator action

1. **K2.7** — four verified values (slug, two prices, context window). Everything else is done.
2. **K3 vision** — confirm with Moonshot whether the configured K3 endpoint accepts images, then
   set `KIMI_VISION_ENABLED=true`, or leave it off and the Grok route serves image reading.
3. **Provider smoke checks** — require an environment holding the provider keys with outbound
   egress. This is the only step that can convert anything in this document into a live-verified
   claim, and it will spend real provider budget.
4. **Enabling the migration** — `BLACK_HOLE_CUTOVER_STAGE=shadow` is the safe first step;
   nothing user-visible changes.
