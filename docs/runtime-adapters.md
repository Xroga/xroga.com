# Runtime adapters

An adapter is everything one language ecosystem knows about itself: how to install, lint,
typecheck, test, build and package, where artefacts land, and how to read a failure.

The contract is `backend/src/synthesis/runtime/adapterContract.ts`. Adding an ecosystem
means adding a file and registering it. It does not mean editing the planner, the flow or
the pipeline — a property asserted by a test that reads the shared modules' source, because
a pipeline with `cargo build` hardcoded behaves identically to one that delegates until
somebody adds Go and has to edit it.

## Capability states

These describe how far an adapter has been *proven*, not how complete its code looks.

| state | meaning |
| --- | --- |
| `planned` | the ecosystem is recognised; no adapter exists |
| `detected` | detection works; commands are not implemented |
| `implementation_available` | commands are emitted; nothing has executed them |
| `fixture_verified` | commands ran against a fixture and succeeded |
| `production_observed` | commands have succeeded on real user projects |
| `external_toolchain_required` | correct commands, absent toolchain |
| `unsupported` | cannot be supported safely |

The line between `implementation_available` and `fixture_verified` is the one that matters,
and Command 1 paid for the lesson: a Fly guest configuration passed every stub test and was
rejected by the live API, because a stub replaying a module's own arithmetic agrees with
whatever the module computes. An adapter that has never run its toolchain is in exactly
that position.

## Current coverage

| adapter | state | notes |
| --- | --- | --- |
| `node` | `implementation_available` | npm, pnpm, yarn, bun; package manager read from the lockfile, not the `packageManager` field |
| `python` | `implementation_available` | uv → Poetry → Pipenv → pip, decided from committed evidence |
| `rust` | `implementation_available` | Cargo, workspaces, virtual manifests |
| `discovered:*` | `fixture_verified` when validated | synthesised by §12; confidence 0.5 so a written adapter always wins |

Everything else in the marker table is `planned`: recognised, reported honestly as
unbuildable, and never silently replaced with something else.

## The three rules

**The repository outranks the adapter.** Commands carry a `source`, ranked
`repository_script` > `manifest` > `ci_workflow` > `adapter_default` > `discovered`. A
project whose `npm test` runs `vitest --coverage --reporter=json` gets exactly that.

**Absence is not failure.** No build backend means no build command. Most Python libraries
have none, and emitting `python -m build` for a FastAPI service fails a correct repository.

**Network policy belongs to the command.** Only install may reach a registry; everything
else runs with egress denied. Only the adapter knows which is which.

## Writing one

Implement `RuntimeAdapter`, then `registerRuntimeAdapter(new GoRuntimeAdapter())`.

Four things are easy to get wrong:

- `detect` returns `null` when the ecosystem is absent — never a low-confidence guess.
- Confidence is `1` only for a manifest. Loose source files score lower so a competing
  adapter can win.
- `rootCommandCoversWorkspace` defaults to false. Set it true only when the root command
  genuinely covers members, as `cargo test` does. An unrun suite looks exactly like a
  passing one, so the default errs toward duplicated work.
- A missing toolchain is `repairable: false`. Sending an environment problem into the
  repair loop produces a model inventing code changes for a problem no code change can fix.
