# The universal engineering architecture

Xroga uses an extensible universal software-engineering architecture. Verified language,
framework and runtime coverage expands through tested adapters, repository discovery and
capability evidence.

That sentence is deliberately not "supports every programming language", and the
distinction is the subject of this document.

## What changed, and why it was necessary

Before this work, three mechanisms decided what got built.

`architect.ts` asked a model for `"stack": "static|nextjs|expo|other"` and fell back to
`'static'` when the reply did not parse. `detectScaffoldKind` tested a prompt against a
regex ladder over five JavaScript scaffolds and returned `'static'` when nothing matched.
`compileValidate` read `package.json` and ran `npm run build`.

Together they meant that *"Build a Rust CLI that converts CSV files to JSON"* produced
`index.html`, `styles.css` and `script.js`. Not an error — a website. It built, it
deployed, and it was wrong, which is worse than a refusal because nothing signals that
anything went astray.

The replacement is four layers, each of which can be extended without touching the ones
above it.

## The layers

### Runtime adapters — `backend/src/synthesis/runtime/`

An adapter answers, for one ecosystem: how to install, lint, typecheck, test, build and
package, plus where the artefacts land and how to read a failure. The central pipeline
holds none of that knowledge, and a test reads the shared modules' source to keep it that
way — a pipeline with `cargo build` hardcoded behaves identically to one that delegates,
right up until someone adds Go and has to edit the pipeline to do it.

Three rules shape every adapter.

**The repository outranks the adapter.** A declared `scripts.test` beats anything an
adapter would guess, because a project running `vitest --coverage --reporter=json` under
`npm test` chose that deliberately.

**Absence is not failure.** No build backend means no build command. Most Python libraries
genuinely have none, and inventing one fails a correct repository.

**Network policy belongs to the command.** Only the adapter knows that installing needs a
registry and compiling does not, so a build never inherits egress it has no use for.

### Repository discovery — `repositoryDiscovery.ts`

Separates *recognition* from *capability*. A Gradle repository with no JVM adapter reports
as Gradle-that-cannot-be-built, never as nothing found — because "nothing found" reads as
"there is nothing here", which is how a Java service ends up regenerated as a website.

The marker table is not a whitelist. Anything it misses still produces evidence: shebangs,
Makefile targets, container `RUN` lines, README fences and CI `run:` steps.

### Product spec and architecture plan — `universalProductSpec.ts`, `architecturePlan.ts`

`ProductSurface` is `KnownProductSurface | (string & {})`, so known values keep editor
completion and an unanticipated surface is a legal value rather than a parse failure.
Surfaces are a scored list, because "a Go service with a background cleanup worker" is two
surfaces and describing it as one is already wrong.

Inference reads behaviour, not category keywords. *"Converts CSV files to JSON"* is a batch
transformation with no session — a CLI, whether or not the word appears.

Precedence in the planner is: an existing repository, then a stated language, then a
surface default. And where none resolves, the plan refuses. `planIsRefusal` returning true
is a successful outcome; the previous design could not express "I do not know", which is
precisely why it produced a plausible wrong artefact instead.

### Generic runtime discovery — `runtimeDiscovery.ts`

The layer that makes this open rather than merely wide. When no adapter matches, commands
are derived from repository evidence, ranked CI → container → Makefile → documentation.

Nothing derived is trusted until it runs. `synthesizeAdapter` throws on an unvalidated
spec, because a registered adapter is consulted as an equal to the written ones and a
README guess must not sit beside the Cargo adapter unproven.

## Status, honestly

| capability | state | evidence |
| --- | --- | --- |
| adapter contract, no language commands in shared layer | **verified** | asserted against module source |
| Node / TypeScript adapter | **verified** | 1,189 backend tests |
| Python adapter (uv, Poetry, Pipenv, pip) | **verified** | unit-level; toolchain present in its declared image |
| Rust adapter (incl. workspaces, virtual manifests) | **verified** | unit-level; toolchain present in its declared image |
| polyglot component isolation | **verified** | §59 fixture |
| monorepo deep-path discovery | **verified** | §60 fixture |
| existing-repository inheritance | **verified** | §61 fixture |
| unknown-runtime discovery | **verified** | §62 fixture, Nim |
| ecosystem recognition (Go, JVM, .NET, PHP, Ruby, Dart, Swift, Elixir, Zig, C/C++, Solidity, Terraform, …) | **adapter_available: no** | recognised and reported as unbuildable |
| Go, JVM, .NET and other adapters | **planned** | contract supports them; none written |
| framework adapters | **planned** | frameworks are recorded as decisions, not yet adapters |
| model capability registry and benchmarks | **planned** | §20–22 not implemented |
| sandbox toolchain availability | **verified** | measured on the deployed runtime; adapters declare their image |
| full install-and-test cycle in Python/Rust images | **planned** | toolchains proven present; a complete cycle has not been run |

### Sandbox toolchain coverage, measured

A probe of the deployed runtime found the default image is node:20-alpine and carries node
and npm only — cargo, python, pip, poetry, go, java, dotnet, php and ruby are all absent.

Adapters therefore declare the image their toolchain needs. Verified on real machines:
rust:1-alpine gives cargo 1.97.1, python:3.12-alpine gives Python 3.12.13 with pip 25.0.1.
The image travels per validation, so a polyglot repository gets a different one per
component.

Still unverified: a full install-and-test cycle inside those images. The probe proved the
toolchains exist and execute, not that cargo test completes on a generated crate.

## Rollout

Off by default. `UNIVERSAL_AGENT_ENABLED=shadow` runs the universal planner beside the
legacy pipeline and writes nothing — `mayWrite` returns false in shadow, enforced by test.
`enabled` with `UNIVERSAL_AGENT_PERCENTAGE` and `UNIVERSAL_AGENT_ALLOWLIST` moves projects
across on stable per-project buckets, so a project never changes path on retry.

The legacy pipeline is untouched and remains the default.
