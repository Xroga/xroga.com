# Command 2 audit — what the current runtime can and cannot do

Audited against `main` at `ac96781`, before any Command 2 change.

The question this audit answers is narrow and testable: **can a legitimate software
request that nobody anticipated reach an appropriate stack, toolchain and validation
without someone editing the central pipeline first?**

Today the answer is no, and the reasons are specific rather than diffuse. What follows
names them with file and line evidence, and — just as importantly — names the systems
that are already right, because Command 2 must extend those rather than replace them.

## The three findings that define the work

### 1. Architecture selection is a four-value enum with a static fallback

`backend/src/ai/architect.ts:20` asks the model for:

```
"stack": "static|nextjs|expo|other"
```

and `parsePlan` at line 33 falls back to `stack: 'static'` whenever the reply does not
parse. The prompt's rules hardcode the mapping: Next.js for "SaaS/auth/API", Expo for
"Android/iOS", static for "simple sites".

There is no representation for a Rust binary, a Python package, a Go service, a
Terraform module or a WordPress plugin. `"other"` exists as a token but carries no
downstream behaviour — nothing consumes it, so it degrades to the same generation path.

**Classification: `category_bound`.** This is the single largest obstacle in the
repository.

### 2. Scaffold selection is a regex chain that defaults to static

`backend/src/services/scaffolds/detectScaffold.ts:1` declares:

```ts
export type ScaffoldKind = 'static' | 'nextjs' | 'expo' | 'chrome' | 'electron';
```

`detectScaffoldKind` (line 39) tests the prompt against a fixed regex ladder and
**returns `'static'` when nothing matches** (line 58). It is consulted at eight call
sites in `pipeline.ts` (lines 1078, 1321, 1768, 1789, 1874, 2269–2270) and twice in
`projectScaffold.ts`.

So "build a Rust CLI that converts CSV to JSON" does not fail, and does not report a
limitation. It silently becomes a static website. This is the exact behaviour §71
requires removing from the universal path, and §79.2 names as a definition-of-done
condition.

**Classification: `category_bound`.**

### 3. Validation assumes npm and `package.json`

`backend/src/ai/compileValidate.ts` is the only executable validation path.
`requiredProductionBuild` (line 89) reads `package.json` and returns `npm run build`;
`shouldCompile` (line 154) returns false when no `package.json` exists. The install
command is npm, the cache is an npm cache (line 66), and the build command comes from
npm scripts.

A Cargo project, a Poetry project or a Gradle project therefore skips compile validation
entirely rather than running `cargo test`, `pytest` or `./gradlew test`.

**Classification: `language_bound`.**

## What is already right, and must be reused rather than rebuilt

Command 1 left infrastructure that Command 2 depends on. None of it is category-bound,
and rewriting any of it would be destructive.

| subsystem | file | classification | why it survives |
| --- | --- | --- | --- |
| executable task graph, scheduler, restart recovery | `ai/executionRuntime.ts` | `verified_complete` | `ExecutableTaskNode`, `ExecutionScheduler`, `CanonicalExecutionState` and `transitionTask` are language-neutral. §15 and §16 need scheduling, not a new scheduler. |
| transactional patch workspace | `ai/patchWorkspace.ts` | `verified_complete` | Commit-pinned, path-safe writes. §45 is satisfied by this. |
| repository tools | `ai/repositoryTools.ts` | `usable_but_limited` | Bounded, path-validated tool surface. Needs more tools for §7, not a redesign. |
| sandbox isolation | `sandbox/*` | `verified_complete` | Disposable Fly microVM per execution. §19 requires exactly this boundary. |
| verification compiler | `synthesis/verificationCompiler.ts` | `usable_but_limited` | Already emits 26 verification kinds including `cli`, `mobile`, `extension`. Needs adapter-derived commands, not replacement. |
| product definition | `synthesis/productDefinition.ts` | `usable_but_limited` | Versioned and migratable, with actors, workflows, entities and lifecycles. Lacks product surfaces (§5). |
| capability graph | `synthesis/capabilityGraph.ts` | `usable_but_limited` | Dynamic rather than enumerated. Extends cleanly. |

`verificationCompiler.ts` deserves emphasis. Its `VerificationKind` union already
contains `cli`, `extension`, `mobile`, `build` and `blockchain` — the vocabulary for
non-web products exists and is tested. What is missing is anything that can *produce*
those kinds, because the architecture layer above it cannot express a CLI.

## Everything else, classified

| mechanism | classification | evidence |
| --- | --- | --- |
| product blueprints | `category_bound` but honest | `synthesis/productBlueprints.ts:31` — nine web-only IDs. `detectProductBlueprint` returns `null` for non-web prompts (line 254) with a comment explaining that forcing `<nav>` onto a CLI would be wrong. Advisory for gap reporting, not architecture. Low risk. |
| scaffolds | `scaffold_bound` | Five scaffolds: static, Next.js, Expo, Chrome, Electron. All JavaScript. |
| language detection | `missing` | No detector for any non-JS language exists. |
| package-manager detection | `missing` | npm assumed throughout. |
| build-system detection | `missing` | `npm run build` assumed. |
| runtime adapters | `missing` | No adapter contract exists. §9 is new construction. |
| framework adapters | `missing` | Framework knowledge is prose inside prompts. |
| generic runtime discovery | `missing` | §12 is new construction. |
| monorepo support | `missing` | No workspace-boundary awareness. |
| polyglot support | `missing` | One repository-wide stack is assumed. |
| model capability registry | `interface_only` | `ai/modelCapabilityRegistry.ts` has `RuntimeModelCapability` and a registry accessor, but no benchmark evidence, no expiry, no per-language scoring. |
| model routing | `usable_but_limited` | `ai/intelligentRouter.ts` routes, but not on capability evidence per §22. |
| project memory | `usable_but_limited` | `ai/projectMemory.ts` persists, but is not a repository snapshot — §7 correctly treats GitHub as canonical. |
| GitHub integration | `verified_complete` | Atomic mutations with stale-head protection, hardened by the merged P0 work. |
| research engine | `usable_but_limited` | `synthesis/research/` exists; needs provider-agnostic freshness metadata for §24. |
| architecture validation | `usable_but_limited` | `synthesis/architectureValidation.ts` validates, but against the closed stack vocabulary. |

## What this means for the plan

The work divides cleanly, and the order is forced by dependency rather than preference.

Adapters come first (§9, §10), because architecture selection cannot name a toolchain
that has no representation. Repository discovery (§8, §14) comes next, since adapters
need evidence to bind to. Only then can the product spec gain open surfaces (§5) and the
architecture planner replace the four-value enum (§6). Generic discovery (§12) sits on
top of all of it, because synthesising an adapter presupposes an adapter contract.

Two constraints hold throughout.

The first is inherited: generated code never runs on `xroga-api`. The Command 1 sandbox
is the only execution path, and where it cannot run something the honest result is a
recorded blocker, not a fabricated pass.

The second is that the legacy pipeline keeps working. Roughly 3,750 lines of
`pipeline.ts` serve real users today. Command 2 adds a path beside it behind a flag
(§70); it does not perform a destructive rewrite, and the static fallback is removed
from the *universal* path rather than deleted from a system that still depends on it.
