# Black Hole ∞ — Part 2 architecture and status

Branch `claude/xroga-ai-updates-j24vhq`, on top of Part 1 (`0965bf6`, PR #563).

Backend: **2034/2034 tests pass**, typecheck and build clean.

Everything below is verified by tests against injected fakes. **Nothing here is live
verified.** This environment has no provider credentials and `xroga-api.fly.dev` is refused at
the gateway (403 on CONNECT), so §41's representative real builds and §44's live verification
were not achievable. No claim of LIVE VERIFIED is made anywhere in this document.

---

## A. What was built

| § | Module | What it does |
|---|---|---|
| 4 | `ai/black-hole/taskClass.ts` | 22 task classes, deterministic signals first |
| 5 | `ai/black-hole/complexity.ts` | 12 scored inputs, each capped |
| 6–8 | `ai/black-hole/router.ts` | Canonical router; chains filtered by authority before ranking |
| 1–2 | `ai/black-hole/gateway.ts` | `blackHole.generate({…})` over §2's stage order |
| 9 | `ai/black-hole/contextPlan.ts` | Priority-ordered context assembly within a budget |
| 10–17 | `ai/black-hole/researchRouter.ts` | One research layer: specialization, economics, provenance, injection defense |
| 18 | `ai/black-hole/converterPolicy.ts` | Conversion opt-in on ambiguity |
| 19 | `ai/black-hole/agentRuntime.ts` | Agent loop with all five §19 controls |
| 20–21 | `ai/black-hole/toolRegistry.ts` | Selective exposure + independent per-tool authorization |
| 24 | `ai/black-hole/repairRouting.ts` | Failure → model + scope |
| 28–31 | `ai/black-hole/publicIdentity.ts` | Public vocabulary and the leak guard |
| 36 | `ai/black-hole/retryPolicy.ts` | Retry only what a repeat could survive |
| 39 | `ai/black-hole/cutover.ts` | Five-stage feature-flagged migration |
| 26 | `ai/legacyBuilderAdapter.ts` | Extended with `black_hole` as a third implementer |

## B. The load-bearing design decisions

**Authority is a filter, not a penalty.** §8's closing rule — never cross an authority boundary
because a provider failed — is implemented by removing unauthorized candidates *before*
ranking. A scoring penalty can be overcome by health, cost or mode pressure; a filter cannot.
§12's "Grok must not appear in coding fallback chains" therefore holds structurally, and an
exhausted coding chain returns empty rather than reaching for a healthy research model.

**Privacy is structural, not filtered.** `BlackHoleResponse` and `ResearchBundle` have no field
for a model id or vendor. Identity travels to a server-side trace sink that is not part of the
returned value. Adding a leak requires changing a type rather than forgetting a filter.

**Exposure and authorization are two controls.** `selectTools` decides what a model is told
about; `invokeTool` decides what runs. A model naming a tool it was never offered is refused,
because tool names are guessable.

**A tool cannot confer authority.** A request whose analysis never claimed `deploy` cannot
invoke a deploy tool — which is what stops a research request from acquiring write authority.

## C. Defects found and fixed

1. **Trailing `\b` after an alternation kills word-prefix alternatives.** `/\b(debug|refactor)\b/`
   matches neither "debugging" nor "refactoring". The same shape hid "summarize" behind
   `summar[iy]`, "vulnerability" behind `vulnerab`, "permissions" behind `permission` and
   "hackathons" behind `hackathon`.

2. **`classifyTaskRequest` misses the two commonest coding phrasings.** "add pagination to the
   users list" and "write me a function that debounces" both returned `requiresCoding: false`,
   routing real engineering work to the chat chain. Fixed in the canonical layer; the legacy
   intent table is untouched because other call sites depend on it.

3. **`\bkimi\b` does not match `kimi_k3`** — `_` is a word character. The internal model ids are
   exactly the strings §30 forbids exposing.

## D. Open items, stated plainly

**§27 pipeline migration is not done.** `pipeline.ts` still owns its own AI calls. The gateway,
router and cutover flag exist and are tested, but no production caller has been switched. This
is the largest remaining piece of Part 2.

**§30/§31 persona callers are not migrated.** The audit found raw provider names do *not* reach
any route. The personas do, in three places:

- `ai/quota.ts` — `byModel[].label` / `.tagline` on the dashboard payload
- `routes/capabilities.ts` — via `safeModelDiagnostics()`
- `ai/pipeline.ts` — attempt-failure `model` field (line ~590) and progress heartbeats (~1786)

The guard and the public replacement are in place; the callers are not switched. **This needs a
product decision rather than a mechanical edit.** The quota dashboard's whole structure is
per-model pools, and §34 asks to move away from rigid per-model allocations toward one user
compute budget. Replacing six persona labels with six identical "Black Hole ∞" strings would
satisfy §31 and leave a dashboard showing six indistinguishable rows. The right fix is probably
to collapse the pools into a single compute budget — which is §34's work, not §31's.

Frontend impact is low: `byModel` is typed in `frontend/src/lib/api.ts` but no component
currently renders it.

**§38 public capabilities are not proven end-to-end.** Two are known not to work today:

- **K2.7 cannot be selected.** It heads the coding chain per §6, but it is gated on a verified
  identifier *and* has no `models.ts` transport entry — so even setting
  `KIMI_COST_EFFICIENT_MODEL_ID` is not enough. The router reports this in `excluded` and GLM
  inherits the route. Enabling it needs a verified provider slug and pricing.
- **Multimodal has no working route.** The two registries disagree: the Black Hole registry
  declares `kimi_k3.vision: true`, `modelCapabilityRegistry` derives `images` from
  `id.startsWith('grok')`. The router requires agreement, so image requests currently route
  nowhere rather than to a model that may be unable to read one. Resolving this needs the real
  Moonshot contract.

**Not implemented:** §32 structured output repair loop, §33/§34 cost and compute economics
(partially covered — `costUsd` and `executionBudget` exist), §37 full cancellation propagation
to sandbox and browser (the gateway and agent loop honour cancellation; downstream does not yet
uniformly), §40 legacy deletion (correctly blocked — §40's conditions require zero production
callers, which cannot be true while §27 is undone), §41–§45 verification.

**§13 Tavily OAuth was not implemented.** Per-user authorization uses the existing encrypted
user-integration infrastructure, which already carries `tavily`, so authorization is never
shared between users. An OAuth/MCP connection flow was not built because Tavily's current
official contract cannot be verified from this environment; §13 scopes that to where it is
technically compatible. The five connection states are modelled and routed on.

## E. What would close the gap

In order:

1. Decide the quota dashboard question (§34), then migrate the three persona callers.
2. Wire `pipeline.ts` behind the gateway at `shadow` stage and observe real routing decisions.
3. Supply a verified K2.7 identifier and `models.ts` entry, or accept GLM as the coding head.
4. Resolve the K3 vision disagreement against the real provider contract.
5. Run §41's representative builds from an environment with provider credentials — this is the
   only step that can turn any of the above into a live-verified claim.
