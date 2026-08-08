# Rolling out the universal agent

The universal path is **off by default**. The legacy pipeline in `backend/src/ai/pipeline.ts`
remains the default for every project and is unchanged by this work.

## Why it is not simply switched on

`pipeline.ts` is roughly 3,750 lines serving real users. The universal path is more correct
in every fixture written for it — and every one of those fixtures was written by the same
reasoning that wrote the code, which is exactly the blind spot Command 1 ran into when a
Fly guest configuration passed all its stubs and was rejected by the live API.

Shadow mode exists to get evidence that does not come from that reasoning.

## Modes

| `UNIVERSAL_AGENT_ENABLED` | behaviour |
| --- | --- |
| unset / anything unrecognised | off — legacy only |
| `shadow` | the universal planner runs beside the legacy pipeline, decisions are compared, **nothing is written** |
| `enabled` | projects move across per `UNIVERSAL_AGENT_PERCENTAGE` and `UNIVERSAL_AGENT_ALLOWLIST` |

An unrecognised value is off rather than an error. A typo in an environment variable must
not enable a code path; the failure of a misread flag should be "nothing changed".

## The shadow invariant

`mayWrite(decision)` returns false whenever `shadow` is set, and a test asserts this across
every combination of mode and percentage. No universal write occurs in shadow — §70's one
hard requirement, enforced rather than documented.

## Bucketing

Per-project and deterministic. A project must not move between paths on retry: a run that
half-executed under one pipeline and resumed under the other would be far harder to
diagnose than either being wrong on its own.

A project with no id is shadowed rather than bucketed, since there is nothing stable to
hash.

The allowlist ignores the percentage entirely, so one project can be watched closely
without exposing a slice of everyone else.

## Reading shadow output

`compareShadowDecision` reports disagreements. Disagreement usually means the universal
path was right, because the legacy vocabulary has four values (`static`, `nextjs`, `expo`,
`other`) and any product that is none of those can only be recorded as the nearest one.

The signal to watch for:

```
legacy chose "static" while the universal path found cli in rust —
the legacy vocabulary has no value for this product, so it recorded
the nearest web option.
```

That is the failure this command exists to fix, called out by name so nobody reading logs
has to infer it.

## Wiring

`pipeline.ts` calls `observeUniversalShadow` immediately after `detectScaffoldKind`. Nothing
downstream reads the result — it records where the two paths disagree and returns rather
than throwing, so observation can never turn into a failed build.

The *enabled* path is not yet wired: no real build routes through `planUniversalRun` to
generate files, so setting `enabled` today changes only the routing decision.

## Suggested sequence

1. `shadow` in production. Collect disagreements.
2. Read them. A disagreement where *legacy* was right is a bug in the universal path and
   blocks progressing.
3. `enabled` with an allowlist of internal projects.
4. Small percentage, then widen.
5. Rollback is setting the variable back to `shadow` or unset. No data migration is
   involved, because shadow never wrote anything.

## Before widening past internal projects

Sandbox toolchain availability is unverified — see the external blocker in
`universal-agent-architecture.md`. Until a live run proves the sandbox image carries
`cargo`, `python` and the rest, a universal run for a non-Node project will correctly
refuse rather than build. That is safe, and it is not yet useful, so the rollout should
stay internal until it is confirmed.
