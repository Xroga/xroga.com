# docs/command-2

Two different pieces of work have carried the name "Command 2". They are kept apart
here because merging them would misrepresent both.

## `parts-abc/` — Web3, payments and provider verification

Delivered 2026-07-26, when the backend held 237 tests. Scope: chain adapters, payment
and provider integrations, contract fixtures and external verification gates. Status at
close: `partially_complete`, with `C2C-004`, `C2C-005` and `C2C-010` blocked on owner
credentials and native chain toolchains.

Those files are unchanged. The blockers they record are still real, and the work they
describe is still on `main`.

## `universal/` — the universal software engineering agent

The current Command 2. Scope: make product generation independent of a closed category
list, so that an arbitrary legitimate software request reaches an appropriate stack,
toolchain and validation without the central pipeline containing a case for it.

It supersedes nothing in `parts-abc/`. The two share a name and a repository, not a
subject.

### Why the canonical filenames are not reused

Section 3 of the current command asks for `docs/command-2/execution-state.json` and
`docs/command-2/requirements-ledger.json`. Those paths were already occupied by the
Parts A–C record, which is a finished artefact describing different requirement IDs
(`C2A-*`, `C2B-*`, `C2C-*`) and a different definition of done.

Writing the universal agent's state into those paths would have destroyed a merged
record rather than adding to it, and would have left three genuine external blockers
undocumented. The universal command's equivalents therefore live in `universal/`, and
this file exists so neither is mistaken for the other.
