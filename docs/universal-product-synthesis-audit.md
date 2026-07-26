# Universal Product Synthesis Audit — Command 2A

Date: 2026-07-26

Base: `99941d79fa74a0ad9f75dcde81b17bdb9e30ce4c`

Method: direct source inspection plus existing and new executable tests. A registry or prompt declaration alone was not counted as dynamic implementation.

## Evidence-based subsystem matrix

| Subsystem | Classification before 2A | Actual behavior and limitation | 2A decision / evidence |
|---|---|---|---|
| Command 1 canonical state, task graph, scheduler, restart | verified_complete | `executionRuntime.ts` persists transitions, schedules dependencies, serializes mutations and requires evidence before completion. | Reused. New synthesis stages execute through `ExecutionScheduler`; `foundation.fixture.test.ts` reloads their state. |
| Model routing, provider health/fallback, focused context, review, repair | verified_complete | Real pipeline routes model calls and Command 1 tests cover fallback, context selection and validation. | Reused without a second router or repair loop. |
| Prompt interpretation / requirement extraction | partially_dynamic | `intelligentRouter.ts` classified capabilities, but did not produce a complete versioned product behavior model. | Extended with `productDefinition.ts`; requirements, actors, workflows, entities, permissions, lifecycles and blockers are structured and persisted. |
| Product classification | hardcoded | `detectScaffoldKind` selects `static`, `nextjs`, `expo`, `chrome` or `electron` from keywords. | Retained only as an output accelerator. Architecture selection now precedes later implementation routing and is behavior-derived. |
| Existing product specifications | missing | No extensible persisted definition joined product outcome, behavior, security, infrastructure and evidence. | Added `xroga.product-definition` v1 with migration path and legacy migration test. |
| Capability registry / selection | partially_dynamic | `capabilityRegistry.ts` contains useful provider primitives but entries are a fixed union and do not compile a requested product. | Reused for provider execution; added a per-product dynamic graph and compiler rather than duplicating provider primitives. |
| Scaffold selection / current templates | scaffold_only | Working static, Next.js, Expo, extension and Electron generators create entry points, but are not proof of complete product behavior. | Preserved. Represented as framework adapters; existing generation path remains intact after synthesis. |
| Architecture selection | hardcoded | Scaffold keywords effectively selected architecture and often implied a web stack. | Added behavior-driven `selectArchitecture`, including CLI without frontend/database and tenant full-stack decisions with trade-offs. |
| Framework/runtime selection | partially_dynamic | Framework detection works for existing scaffolds; no serializable adapter contract existed. | Added versioned, serializable contracts for current framework families. Matcher functions remain runtime-only after a persistence regression was caught. |
| Provider discovery/selection | partially_dynamic | Runtime provider selection and health work for configured model/provider families; arbitrary product-provider adapters were not representable. | Added provider contract/factory with official-source expiry and truthful external setup. Provider research/installation remains Command 2B. |
| Database/schema/migration generation | scaffold_only | Existing generated products can include Supabase/schema files, but output is selected by scaffolds/prompts rather than a complete domain model. | 2A compiles domain/persistence capability tasks and migration requirements. Concrete generated database implementations remain implementation tasks, never marked complete by synthesis. |
| Backend/frontend generation | scaffold_only | The builder emits real files and validates them, but completeness depends on model/scaffold output. | Preserved as execution backend; compiled capability nodes now specify layers, files, tests and evidence instead of claiming those layers exist. |
| Authentication generation | partially_dynamic | Existing provider-key and Supabase paths exist; product-specific auth methods remain generated code. | Product definition records auth assumption, actors and trusted boundaries. Concrete provider expansion belongs to 2B. |
| Permission/domain/lifecycle generation | missing | No reusable behavior-derived domain entities, transition contracts or denial tests existed. | Added entity, ownership, retention, tenant, permission and lifecycle generation with tests. |
| Integration generation | partially_dynamic | Existing integrations are provider-specific and credentials are encrypted; unsupported providers lack a common synthesis contract. | Added dynamic integration/capability specifications and adapter contract. No fake connected state. |
| Environment/credential handling | verified_complete | `userProviderKeys.ts` encrypts server-stored credentials; existing redaction prevents prompt/log leakage. | Reused and extended with explicit field classification/exposure policy; a public-looking secret remains server-only. |
| Deployment preparation/build gates | verified_complete | Command 1 blocks deployment without real production builds and evidence. | Reused; framework contracts supply required production commands. 2A performs no deployment. |
| Generated tests / repair loops | partially_dynamic | Validation/repair executes, but test needs were not derived from a universal product model. | Compiler emits per-capability test, verification and evidence requirements into executable Command 1 tasks. |
| Existing repository and follow-up modification | verified_complete | Repository retrieval, targeted context, canonical mutation and preservation tests exist. | Reused; repository manifests/file counts become synthesis inputs. |
| Multi-output generation | scaffold_only | Non-web artifacts exist for extension/desktop/mobile, but no general multi-output graph. | Architecture enum and graph permit multi-output; full concrete multi-output expansion is not claimed complete in 2A. |
| Evidence reporting | verified_complete | Canonical evidence and final outcome evaluator require real identifiers/results. | Reused; each synthesis stage adds SHA-256-addressed evidence. |
| Blockchain/Web3 scaffolds, wallets, chains, contracts | scaffold_only | Crypto-oriented prompts/feature packs and research routes exist; no evidence of complete contracts, network deployment or verification. | Audited only. Empty extensible definition fields prevent fake support; Command 2B/2C own implementation. |
| Contract testing, testnet/mainnet gates, explorer evidence, indexing | missing | No general executable end-to-end contract safety and explorer verification system was found. | Explicitly not implemented in 2A; retained as later-part requirements. |
| Crypto price-feed demonstrations / hackathon sponsor handling | scaffold_only | Prompt/UI generation may demonstrate these concepts but does not prove live provider or sponsor compliance. | No completion claim; later parts must add authoritative, expiring provider facts and live/testnet evidence. |
| Web research / X search | partially_dynamic | `research.ts` and intelligent routes gather current sources, but there is no complete product-capability source policy for every provider. | Graph models source authority, freshness, citations and bounded budget. Provider execution is Command 2B. |
| Research prompt-injection/cost/freshness controls | partially_dynamic | Command 1 filters context and bounds tasks; permanent provider facts did not have a common expiry contract. | Provider adapter source requires HTTPS authority, verification time and later expiry. Deep source verification remains 2B. |

## Risks and replacement decisions

- The existing scaffold generator remains downstream and can still under-implement a compiled capability task. This is not hidden: compiled tasks begin `pending`/`ready`, not `completed`, and Command 1 validation remains the completion gate.
- Keyword extraction is used only as a deterministic parsing aid inside product-definition synthesis. It does not choose from a product-category whitelist; three unrelated black-box fixtures produce different domains and architecture decisions through the same pipeline.
- External provider, payment, domain, research and chain operations remain externally blocked until later parts and authenticated evidence. No credentials, addresses, prices or deployment results are invented.
- Security-critical dependency inventory is derived from a lockfile when supplied. Incompatible GPL/AGPL entries become blockers; vulnerability feed evaluation needs the later authoritative research/provider layer.

## Files and validation

Implementation: `backend/src/synthesis/*` and `backend/src/ai/pipeline.ts`. The existing Command 1 `execution_runs` JSON state is reused for persistence, so Part 2A needs no database migration and creates no duplicate persistence path. Tests cover product-definition migration, graph compilation, architecture/provider/credential contracts, and three persisted black-box fixtures. Exact commands and results are recorded in `docs/command-2/execution-state.json` and `part-a-completion.md`.
